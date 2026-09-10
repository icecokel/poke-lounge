import { BATTLE_END_CONFIRM_MESSAGE } from "@poke-lounge/battle/adventure/battle/battle-logic";
import type { BattleScreenState } from "@poke-lounge/battle/adventure/battle/battle-types";

/** Replace only the displayed sentinel, never the queue used by input/animation policy. */
export function formatBattleResultMessage(
  state: Pick<BattleScreenState, "messageQueue" | "result" | "player">,
  partyHasSpace: boolean,
): string | null {
  const message = state.messageQueue[0] ?? null;
  if (message !== BATTLE_END_CONFIRM_MESSAGE || !state.result) return message;
  const result = state.result;
  const won = result.winnerPlayerId === state.player.playerId;
  if (won && result.reason === "capture" && result.capturedPokemon) {
    return [
      `포획 성공: ${result.capturedPokemon.name}`,
      partyHasSpace
        ? "확인하면 파티에 합류합니다."
        : "파티가 가득 찼습니다. 확인하면 PC 박스로 전송합니다.",
      "확인을 누르면 필드로 돌아갑니다.",
    ].join("\n");
  }
  const summary =
    result.reason === "run" ? "무사히 도망쳤다!" : won ? "승리했습니다." : "패배했습니다.";
  return [summary, "확인을 누르면 필드로 돌아갑니다."].join("\n");
}
