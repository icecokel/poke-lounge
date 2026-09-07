import type {
  DiceGambleSettlementInput,
  DiceGambleSettlementResult,
  LocalPlayerState,
} from "../../contracts/game-state";

import type { PlayerChange } from "../player/player-change";

import { normalizePokeDollars } from "../player/player-helpers";

export function settleDiceGambleResult(
  localPlayer: LocalPlayerState,
  { stakePokeDollars, rewardPokeDollars }: DiceGambleSettlementInput,
): PlayerChange<DiceGambleSettlementResult> {
  if (
    !Number.isFinite(stakePokeDollars) ||
    !Number.isInteger(stakePokeDollars) ||
    stakePokeDollars < 1
  ) {
    return {
      player: localPlayer,
      changed: false,
      result: { ok: false, reason: "invalid-stake" },
    };
  }
  if (
    !Number.isFinite(rewardPokeDollars) ||
    !Number.isInteger(rewardPokeDollars) ||
    rewardPokeDollars < 0
  ) {
    return {
      player: localPlayer,
      changed: false,
      result: { ok: false, reason: "invalid-reward" },
    };
  }
  if (localPlayer.wallet.pokeDollars < stakePokeDollars) {
    return {
      player: localPlayer,
      changed: false,
      result: { ok: false, reason: "insufficient-funds" },
    };
  }
  const walletPokeDollars = normalizePokeDollars(
    localPlayer.wallet.pokeDollars - stakePokeDollars + rewardPokeDollars,
  );
  return {
    player: {
      ...localPlayer,
      wallet: {
        ...localPlayer.wallet,
        pokeDollars: walletPokeDollars,
      },
    },
    changed: true,
    result: { ok: true, walletPokeDollars },
  };
}
