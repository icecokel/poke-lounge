import type {
  BattleKind,
  BattleParticipant,
  BattlePokemonStatus,
} from "@poke-lounge/battle/adventure/battle/battle-types";

/** Only public team availability reaches the view; no unrevealed species or moves. */
export interface OpponentPartySummary {
  total: number;
  remaining: number;
  slots: { slotIndex: number; fainted: boolean; active: boolean }[];
}

export function createOpponentPartySummary({
  battleKind,
  opponent,
  visibleSlotIndex,
  displayedHp,
  displayedStatus,
}: {
  battleKind: BattleKind;
  opponent: BattleParticipant;
  visibleSlotIndex: number;
  displayedHp: number;
  displayedStatus: BattlePokemonStatus;
}): OpponentPartySummary | null {
  if (battleKind !== "trainer") return null;
  const slots = opponent.party
    .flatMap(({ slotIndex, pokemon }) => {
      if (!pokemon) return [];
      const visible = slotIndex === visibleSlotIndex;
      // The server/engine can already have HP=0 while the on-screen hit is still
      // playing. Match the HP panel's rounded display, not the final turn state.
      const hp =
        visible && Number.isFinite(displayedHp)
          ? Math.max(0, Math.min(pokemon.maxHp, Math.round(displayedHp)))
          : pokemon.currentHp;
      const status = visible ? displayedStatus : pokemon.status;
      const fainted = hp <= 0 || status === "fainted";
      return [{ slotIndex, fainted, active: visible && !fainted }];
    })
    .sort((a, b) => a.slotIndex - b.slotIndex);
  if (!slots.length) return null;
  return { total: slots.length, remaining: slots.filter(slot => !slot.fainted).length, slots };
}

export function getOpponentPartyCopy(locale: string, summary: OpponentPartySummary) {
  const { remaining, total } = summary;
  if (locale === "en-US")
    return {
      opponent: "Opponent",
      remaining: "Left",
      label: `Opponent: ${remaining} of ${total} Pokémon able to battle, including the active Pokémon.`,
    };
  if (locale === "ja-JP")
    return {
      opponent: "相手",
      remaining: "残り",
      label: `相手のポケモン${total}匹中${remaining}匹が戦闘可能。現在出ているポケモンを含みます。`,
    };
  return {
    opponent: "상대",
    remaining: "남음",
    label: `상대 포켓몬 ${total}마리 중 ${remaining}마리 전투 가능. 현재 출전 중인 포켓몬 포함.`,
  };
}
