import {
  applyPlayerInput,
  getPlayerChoices,
  startLeagueMatch,
  type LeagueMatchInit,
} from "@poke-lounge/battle/league/match";
import { toHpSnapshot } from "@poke-lounge/battle/gen4/adventure";
import type { Gen4Party } from "@poke-lounge/battle/gen4/types";
import { BATTLE_MESSAGE_AUTO_ADVANCE_MS } from "@poke-lounge/battle/timing";
import { getRuntimePokemonMoveDetails } from "@/components/poke-lounge/runtime/game/data/game-data-json";
import { getBattlePokemonAssets } from "@/components/poke-lounge/runtime/game/battle/battle-pokemon-assets";
import { BATTLE_LAYOUT } from "@/components/poke-lounge/runtime/game/battle/battle-layout";
import type {
  BattleCombatantPresentation,
  BattleUiStore,
} from "@/components/poke-lounge/runtime/game/battle/battle-ui-store";
import type {
  MobileBattleUiAction,
  MobileBattleUiState,
} from "@/components/poke-lounge/runtime/game/ui/mobile-battle-ui";
import type { LeagueJudgedBattleProps } from "../contract";

type Phase = "command" | "move-select" | "party-select" | "resolving" | "ended";
export function createJudgedBattleController({
  init,
  store,
  opponentName,
  onFinished,
  onError,
}: {
  init: LeagueMatchInit;
  store: BattleUiStore;
  opponentName: string;
  onFinished: LeagueJudgedBattleProps["onFinished"];
  onError(error: unknown): void;
}) {
  let progress = startLeagueMatch(init);
  let visible: [Gen4Party, Gen4Party] = structuredClone(progress.frame.parties);
  let phase: Phase = "command";
  let message: string | null = null;
  let helpOpen = false;
  let stepIndex = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let finished = false;
  const participants = new Set<number>();
  const rememberParticipants = () => {
    participants.add(progress.frame.parties[0].activeSlotIndex);
    for (const step of progress.steps) participants.add(step.playerSlotIndex);
  };
  function combatant(side: 0 | 1): BattleCombatantPresentation {
    const party = visible[side];
    const member = party.members.find(m => m.slotIndex === party.activeSlotIndex)!;
    const rect = side === 0 ? BATTLE_LAYOUT.playerSprite : BATTLE_LAYOUT.opponentSprite;
    return {
      activeSlotIndex: member.slotIndex,
      currentHp: member.currentHp!,
      displayedHp: member.currentHp!,
      maxHp: member.maxHp!,
      level: member.level,
      name: member.name,
      displayName: side === 0 ? member.name : opponentName,
      status: member.status ?? "normal",
      sprite: {
        ...rect,
        sprite: getBattlePokemonAssets(member.speciesId)[side === 0 ? "back" : "front"],
        alpha: member.currentHp! > 0 ? 1 : 0.3,
        tint: null,
      },
    };
  }
  function publish() {
    if (disposed) return;
    const choices = getPlayerChoices(progress);
    const controls: MobileBattleUiState = {
      selectionKey: `${progress.inputs.length}:${phase}`,
      phase,
      message,
      canSubmitAction: !message && !finished,
      requiresConfirmation: false,
      isAuthoritative: true,
      canCapture: false,
      isHelpOpen: helpOpen,
      isInputLocked: finished,
      canGoBack:
        !message &&
        choices.kind === "move" &&
        (phase === "move-select" || phase === "party-select"),
      isForcedPartySwitch: choices.kind === "switch",
      moveReplacement: null,
      items: [],
      commands: (["fight", "pokemon", "bag", "run"] as const).map((id, i) => ({
        id,
        selected: i === 0,
      })),
      moves:
        choices.kind === "move"
          ? choices.moves.map((move, index) => {
              const details = getRuntimePokemonMoveDetails(move.moveId);
              return {
                id: move.moveId,
                index,
                name: details?.name ?? `#${move.moveId}`,
                pp: move.pp,
                maxPp: move.maxPp,
                type: details?.typeName ?? "",
                power: details?.power ?? 0,
                accuracy: details?.accuracy ?? 0,
                category: details?.category ?? "status",
                effectCode: details?.effectCode ?? 0,
                effectChance: details?.effectChance ?? 0,
                effectNotice: null,
                selected: index === 0,
                disabled: move.disabled || (move.pp <= 0 && move.moveId !== 165),
              };
            })
          : [],
      party: progress.frame.parties[0].members.map(member => ({
        slotIndex: member.slotIndex,
        name: member.name,
        level: member.level,
        currentHp: member.currentHp!,
        maxHp: member.maxHp!,
        status: member.status ?? "normal",
        selected: false,
        isCurrent: member.slotIndex === progress.frame.parties[0].activeSlotIndex,
        isFainted: member.currentHp! <= 0,
        isEmpty: false,
        canSwitch: choices.kind !== "none" && choices.switchSlots.includes(member.slotIndex),
        sprite: getBattlePokemonAssets(member.speciesId).front,
      })),
    };
    const slots = visible[1].members.map(m => ({
      slotIndex: m.slotIndex,
      fainted: m.currentHp! <= 0,
      active: m.slotIndex === visible[1].activeSlotIndex && m.currentHp! > 0,
    }));
    store.publish({
      controls,
      presentation: {
        phase,
        message,
        battleKind: "trainer",
        authoritative: { connectionStatus: "connected", inputPending: false, spectating: false },
        help: { open: helpOpen, inputMode: "keyboard" },
        entrance: { active: false, progress: 1 },
        capture: null,
        evolution: null,
        player: combatant(0),
        opponent: combatant(1),
        opponentParty: {
          slots,
          total: slots.length,
          remaining: slots.filter(s => !s.fainted).length,
        },
      },
    });
  }
  function nextMessage() {
    if (disposed) return;
    clearTimeout(timer);
    const step = progress.steps[stepIndex++];
    if (step) {
      const hp = toHpSnapshot(step);
      for (const side of [0, 1] as const) {
        const slot = side === 0 ? hp.playerPartySlotIndex : hp.opponentPartySlotIndex;
        visible[side].activeSlotIndex = slot ?? visible[side].activeSlotIndex;
        const member = visible[side].members.find(m => m.slotIndex === slot);
        if (member) {
          member.currentHp = side === 0 ? hp.playerCurrentHp : hp.opponentCurrentHp;
          member.status = side === 0 ? hp.playerStatus : hp.opponentStatus;
        }
      }
      message = step.text;
      phase = "resolving";
      publish();
      timer = setTimeout(nextMessage, BATTLE_MESSAGE_AUTO_ADVANCE_MS);
      return;
    }
    visible = structuredClone(progress.frame.parties);
    message = null;
    if (progress.outcome !== null) {
      phase = "ended";
      finished = true;
      publish();
      onFinished({
        progress,
        leadSlot: init.leadSlot,
        participants: [...participants].filter(slot =>
          progress.frame.parties[0].members.some(m => m.slotIndex === slot && m.currentHp! > 0),
        ),
      });
      return;
    }
    phase = getPlayerChoices(progress).kind === "switch" ? "party-select" : "command";
    publish();
  }
  function handle(action: MobileBattleUiAction) {
    if (disposed || finished) return;
    if (action.type === "confirm-message") {
      if (message) nextMessage();
      return;
    }
    if (phase === "resolving") return;
    if (action.type === "toggle-help") {
      helpOpen = !helpOpen;
      publish();
      return;
    }
    if (helpOpen) return;
    const choices = getPlayerChoices(progress);
    if (action.type === "go-back" && choices.kind === "move") {
      phase = "command";
      publish();
      return;
    }
    if (action.type === "select-command" && phase === "command" && choices.kind === "move") {
      if (action.index === 0) phase = "move-select";
      else if (action.index === 1) phase = "party-select";
      publish();
      return;
    }
    try {
      if (action.type === "select-move" && phase === "move-select" && choices.kind === "move") {
        const move = choices.moves[action.index];
        if (!move || move.disabled || (move.pp <= 0 && move.moveId !== 165)) return;
        progress = applyPlayerInput(progress, ["m", move.moveId]);
      } else if (
        action.type === "select-party" &&
        phase === "party-select" &&
        choices.kind !== "none" &&
        choices.switchSlots.includes(action.index)
      ) {
        progress = applyPlayerInput(progress, ["s", action.index]);
      } else return;
      rememberParticipants();
      stepIndex = 0;
      nextMessage();
    } catch (error) {
      clearTimeout(timer);
      onError(error);
    }
  }
  rememberParticipants();
  store.setActionHandler(handle);
  nextMessage();
  return {
    dispose() {
      disposed = true;
      clearTimeout(timer);
      store.clear();
    },
  };
}
