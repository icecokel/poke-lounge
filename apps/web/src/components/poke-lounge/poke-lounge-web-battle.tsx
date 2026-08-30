"use client";

import { useEffect, useRef, useState } from "react";
import { COMPETITIVE_STRUGGLE_MOVE_ID } from "@poke-lounge/battle";
import { Button } from "@/components/ui/button";
import styles from "./poke-lounge.module.css";
import {
  canUseAuthoritativeStruggle,
  isLegalAuthoritativeAction,
  toAuthoritativeBattleState,
} from "./runtime/game/battle/authoritative-battle-adapter";
import {
  BATTLE_END_CONFIRM_MESSAGE,
  canPokemonBattle,
  chooseBattleBagItem,
  chooseBattleCommand,
  choosePartySlot,
  choosePlayerMove,
  isForcedPartySwitch,
  popBattleMessage,
} from "./runtime/game/battle/battleLogic";
import type {
  BattleCommand,
  BattlePokemon,
  BattleScreenState,
  BattleSpriteRef,
} from "./runtime/game/battle/battleTypes";
import type {
  CompetitiveAction,
  CompetitiveRoomProjectionEvent,
  MultiplayerRoom,
} from "./runtime/game/network/localPreviewRoom";
import { getShopItemById, type GameStateStore } from "./runtime/game/state/gameStateStore";
import {
  planWebBattleProgression,
  resolveWebMoveLearning,
  type WebPendingMoveLearning,
} from "./runtime/game/web-battle-runtime";

const BATTLE_ITEM_IDS = [
  "pokeball",
  "ultraBall",
  "potion",
  "superPotion",
  "hyperPotion",
  "antidote",
  "revive",
] as const;

interface PokeLoungeWebBattleProps {
  competitiveBattle: CompetitiveRoomProjectionEvent | null;
  gameStateStore: GameStateStore;
  localBattle: BattleScreenState | null;
  room: MultiplayerRoom | null;
  onComplete(state: BattleScreenState, authoritative: boolean): void;
}

export function PokeLoungeWebBattle({
  competitiveBattle,
  gameStateStore,
  localBattle,
  onComplete,
  room,
}: PokeLoungeWebBattleProps) {
  const authoritative = competitiveBattle !== null;
  const [state, setState] = useState<BattleScreenState>(() =>
    localBattle ? localBattle : createAuthoritativeState(competitiveBattle!),
  );
  const progressionAppliedRef = useRef(false);
  const [pendingMoveLearnings, setPendingMoveLearnings] = useState<WebPendingMoveLearning[]>([]);

  useEffect(() => {
    if (competitiveBattle) {
      setState(previousState => createAuthoritativeState(competitiveBattle, previousState));
    }
  }, [competitiveBattle]);

  const currentMessage = state.messageQueue[0] ?? "";
  const inventory = gameStateStore.getCurrentLocalPlayer().inventory;

  const submitAuthoritativeAction = (action: CompetitiveAction) => {
    if (!competitiveBattle || !room || competitiveBattle.spectating) {
      return;
    }
    if (
      !isLegalAuthoritativeAction(
        competitiveBattle.projection,
        competitiveBattle.ownPlayerId,
        action,
      )
    ) {
      setState(current => ({
        ...current,
        phase: "command",
        messageQueue: ["선택한 행동을 사용할 수 없습니다."],
      }));
      return;
    }

    room.send("COMPETITIVE_ACTION", {
      matchId: competitiveBattle.projection.matchId,
      assignmentRevision: competitiveBattle.projection.assignmentRevision,
      turn: competitiveBattle.projection.currentTurn,
      clientCommandId: crypto.randomUUID(),
      action,
    });
    setState(current => ({
      ...current,
      phase: "resolving",
      messageQueue: ["행동을 전송했습니다. 상대를 기다리는 중..."],
    }));
  };

  const chooseCommand = (command: BattleCommand) => {
    if (!authoritative) {
      setState(current => chooseBattleCommand(current, command));
      return;
    }
    if (!competitiveBattle || competitiveBattle.spectating) {
      return;
    }
    if (command === "fight") {
      const player =
        competitiveBattle.projection.currentState.playersById[competitiveBattle.ownPlayerId];
      const pokemon = player?.team.find(slot => slot.slotIndex === player.activeSlotIndex);
      if (pokemon && canUseAuthoritativeStruggle(pokemon.moves)) {
        submitAuthoritativeAction({ kind: "move", moveId: COMPETITIVE_STRUGGLE_MOVE_ID });
      } else {
        setState(current => ({ ...current, phase: "move-select", messageQueue: [] }));
      }
      return;
    }
    if (command === "pokemon") {
      setState(current => ({ ...current, phase: "party-select", messageQueue: [] }));
      return;
    }
    setState(current => ({
      ...current,
      messageQueue: ["서버 대전에서는 사용할 수 없습니다."],
    }));
  };

  const chooseMove = (moveIndex: number) => {
    if (!authoritative) {
      setState(current => choosePlayerMove(current, moveIndex));
      return;
    }
    const move = state.player.pokemon.moves[moveIndex];
    if (move) {
      submitAuthoritativeAction({ kind: "move", moveId: move.id });
    }
  };

  const chooseBagItem = (itemId: string) => {
    const nextState = chooseBattleBagItem(state, itemId, {
      itemCount: inventory[itemId] ?? 0,
    });
    if (nextState.usedInventoryItemId) {
      gameStateStore.consumeInventoryItem(nextState.usedInventoryItemId, 1);
    }
    setState(nextState);
  };

  const advanceMessage = () => {
    if (
      !authoritative &&
      currentMessage === BATTLE_END_CONFIRM_MESSAGE &&
      !progressionAppliedRef.current &&
      (state.result?.levelsGained ?? 0) > 0
    ) {
      progressionAppliedRef.current = true;
      const progression = planWebBattleProgression(state, gameStateStore.getCurrentLocalPlayer());
      setState(progression.state);
      setPendingMoveLearnings(progression.pendingMoveLearnings);
      return;
    }
    if (
      state.phase === "ended" &&
      (authoritative || currentMessage === BATTLE_END_CONFIRM_MESSAGE)
    ) {
      onComplete(state, authoritative);
      return;
    }
    setState(current => popBattleMessage(current));
  };

  return (
    <section className={styles.webBattle} aria-label="포켓몬 배틀">
      <div className={styles.webBattleField}>
        <BattlePokemonCard pokemon={state.opponent.pokemon} side="opponent" />
        <BattleSprite pokemon={state.opponent.pokemon} side="front" />
        <BattleSprite pokemon={state.player.pokemon} side="back" />
        <BattlePokemonCard pokemon={state.player.pokemon} side="player" />
      </div>
      <div className={styles.webBattleControls}>
        {currentMessage ? (
          <button
            type="button"
            className={styles.webBattleMessage}
            disabled={authoritative && state.phase === "resolving" && !state.result}
            onClick={advanceMessage}
          >
            <span>{currentMessage}</span>
            {authoritative && state.phase === "resolving" && !state.result ? null : <b>계속 ›</b>}
          </button>
        ) : null}
        {!currentMessage && state.phase === "command" ? (
          <BattleCommandMenu
            disabled={Boolean(competitiveBattle?.spectating)}
            onChoose={chooseCommand}
          />
        ) : null}
        {!currentMessage && state.phase === "move-select" ? (
          <BattleMoveMenu
            pokemon={state.player.pokemon}
            onChoose={chooseMove}
            onBack={() => setState(current => ({ ...current, phase: "command" }))}
          />
        ) : null}
        {!currentMessage && state.phase === "bag-select" ? (
          <BattleBagMenu
            inventory={inventory}
            onChoose={chooseBagItem}
            onBack={() => setState(current => ({ ...current, phase: "command" }))}
          />
        ) : null}
        {!currentMessage && state.phase === "party-select" ? (
          <BattlePartyMenu
            state={state}
            onChoose={slotIndex =>
              authoritative
                ? submitAuthoritativeAction({ kind: "switch", slotIndex })
                : setState(current => choosePartySlot(current, slotIndex))
            }
            onBack={
              isForcedPartySwitch(state)
                ? undefined
                : () => setState(current => ({ ...current, phase: "command" }))
            }
          />
        ) : null}
        {!currentMessage && state.phase === "move-replace-select" && pendingMoveLearnings[0] ? (
          <MoveLearningMenu
            pending={pendingMoveLearnings[0]}
            pokemon={
              state.player.party.find(slot => slot.slotIndex === pendingMoveLearnings[0].slotIndex)
                ?.pokemon ?? state.player.pokemon
            }
            onChoose={moveIndex => {
              const progression = resolveWebMoveLearning(state, pendingMoveLearnings, moveIndex);
              setState(progression.state);
              setPendingMoveLearnings(progression.pendingMoveLearnings);
            }}
          />
        ) : null}
        {!currentMessage && state.phase === "ended" ? (
          <Button
            type="button"
            className={styles.webBattleComplete}
            onClick={() => onComplete(state, authoritative)}
          >
            허브로 돌아가기
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function createAuthoritativeState(
  event: CompetitiveRoomProjectionEvent,
  previousState?: BattleScreenState,
): BattleScreenState {
  const state = toAuthoritativeBattleState(
    event.projection,
    event.viewPlayerId ?? event.ownPlayerId,
    undefined,
    "상대의 선택을 기다리는 중...",
    previousState,
  );
  return event.spectating
    ? {
        ...state,
        phase: state.result ? "ended" : "resolving",
        messageQueue: [state.result ? "관전 중인 경기가 끝났습니다." : "경기를 관전 중입니다."],
      }
    : state;
}

function BattlePokemonCard({
  pokemon,
  side,
}: {
  pokemon: BattlePokemon;
  side: "opponent" | "player";
}) {
  const hpPercent = Math.max(0, Math.min(100, (pokemon.currentHp / pokemon.maxHp) * 100));
  return (
    <article className={styles.webBattlePokemonCard} data-side={side}>
      <header>
        <strong>{pokemon.name}</strong>
        <span>Lv.{pokemon.level}</span>
      </header>
      <div
        className={styles.webBattleHpTrack}
        aria-label={`HP ${pokemon.currentHp}/${pokemon.maxHp}`}
      >
        <span style={{ width: `${hpPercent}%` }} />
      </div>
      <small>
        HP {pokemon.currentHp}/{pokemon.maxHp} · {pokemon.status}
      </small>
    </article>
  );
}

function BattleSprite({ pokemon, side }: { pokemon: BattlePokemon; side: "front" | "back" }) {
  const asset = side === "front" ? pokemon.frontSprite : pokemon.backSprite;
  return (
    <div className={styles.webBattleSpriteSlot} data-side={side}>
      <Sprite asset={asset} label={pokemon.name} />
    </div>
  );
}

function Sprite({ asset, label }: { asset: BattleSpriteRef; label: string }) {
  const size = asset.width ?? 80;
  const column = asset.frame % 16;
  const row = Math.floor(asset.frame / 16);
  return (
    <span
      className={styles.webBattleSprite}
      role="img"
      aria-label={label}
      style={{
        width: size,
        height: asset.height ?? size,
        backgroundImage: `url("${asset.path}")`,
        backgroundPosition: `${-column * size}px ${-row * size}px`,
        backgroundSize: `${size * 16}px ${size * 16}px`,
      }}
    />
  );
}

function BattleCommandMenu({
  disabled,
  onChoose,
}: {
  disabled: boolean;
  onChoose(command: BattleCommand): void;
}) {
  return (
    <div className={styles.webBattleMenu} aria-label="배틀 명령">
      {(
        [
          ["fight", "싸운다"],
          ["bag", "가방"],
          ["pokemon", "포켓몬"],
          ["run", "도망간다"],
        ] as const
      ).map(([command, label]) => (
        <Button key={command} type="button" disabled={disabled} onClick={() => onChoose(command)}>
          {label}
        </Button>
      ))}
    </div>
  );
}

function BattleMoveMenu({
  onBack,
  onChoose,
  pokemon,
}: {
  onBack(): void;
  onChoose(index: number): void;
  pokemon: BattlePokemon;
}) {
  return (
    <div className={styles.webBattleMenu} aria-label="기술 선택">
      {pokemon.moves.map((move, index) => (
        <Button
          key={`${move.id}-${index}`}
          type="button"
          variant="outline"
          disabled={move.pp <= 0 || move.competitiveEffectSupport === "unsupported-primary"}
          onClick={() => onChoose(index)}
        >
          <span>{move.name}</span>
          <small>
            {move.type} · PP {move.pp}/{move.maxPp}
          </small>
        </Button>
      ))}
      <Button type="button" variant="ghost" onClick={onBack}>
        뒤로
      </Button>
    </div>
  );
}

function BattleBagMenu({
  inventory,
  onBack,
  onChoose,
}: {
  inventory: Record<string, number>;
  onBack(): void;
  onChoose(itemId: string): void;
}) {
  return (
    <div className={styles.webBattleMenu} aria-label="배틀 가방">
      {BATTLE_ITEM_IDS.map(itemId => {
        const item = getShopItemById(itemId);
        const count = inventory[itemId] ?? 0;
        return (
          <Button
            key={itemId}
            type="button"
            variant="outline"
            disabled={count <= 0}
            onClick={() => onChoose(itemId)}
          >
            <span>{item?.displayName ?? itemId}</span>
            <small>×{count}</small>
          </Button>
        );
      })}
      <Button type="button" variant="ghost" onClick={onBack}>
        뒤로
      </Button>
    </div>
  );
}

function BattlePartyMenu({
  onBack,
  onChoose,
  state,
}: {
  onBack?: () => void;
  onChoose(slotIndex: number): void;
  state: BattleScreenState;
}) {
  return (
    <div className={styles.webBattleMenu} aria-label="교체할 포켓몬 선택">
      {state.player.party
        .filter(slot => slot.pokemon)
        .map(slot => {
          const pokemon = slot.pokemon!;
          const current = slot.slotIndex === state.player.activePartySlotIndex;
          return (
            <Button
              key={slot.slotIndex}
              type="button"
              variant="outline"
              disabled={current || !canPokemonBattle(pokemon)}
              onClick={() => onChoose(slot.slotIndex)}
            >
              <span>{pokemon.name}</span>
              <small>{current ? "전투 중" : `HP ${pokemon.currentHp}/${pokemon.maxHp}`}</small>
            </Button>
          );
        })}
      {onBack ? (
        <Button type="button" variant="ghost" onClick={onBack}>
          뒤로
        </Button>
      ) : null}
    </div>
  );
}

function MoveLearningMenu({
  onChoose,
  pending,
  pokemon,
}: {
  onChoose(moveIndex: number | null): void;
  pending: WebPendingMoveLearning;
  pokemon: BattlePokemon;
}) {
  return (
    <div className={styles.webBattleMenu} aria-label="잊을 기술 선택">
      <p className={styles.webBattleLearningPrompt}>
        {pending.newMove.name}을 배우려면 잊을 기술을 선택하세요.
      </p>
      {pokemon.moves.map((move, index) => (
        <Button
          key={`${move.id}-${index}`}
          type="button"
          variant="outline"
          onClick={() => onChoose(index)}
        >
          <span>{move.name}</span>
          <small>
            PP {move.pp}/{move.maxPp}
          </small>
        </Button>
      ))}
      <Button type="button" variant="ghost" onClick={() => onChoose(null)}>
        배우지 않기
      </Button>
    </div>
  );
}
