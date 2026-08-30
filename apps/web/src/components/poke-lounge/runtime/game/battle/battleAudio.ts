import {
  playPokeLoungeBgm,
  playPokeLoungeSfx,
  stopPokeLoungeBgm,
} from "../audio/poke-lounge-audio";

export function playBattleTransitionSound(): void {
  stopPokeLoungeBgm("field-day");
  playPokeLoungeSfx("battle-transition");
}

export function playWildBattleBgm(): void {
  playPokeLoungeBgm("wild-battle");
}

export function stopWildBattleBgm(): void {
  stopPokeLoungeBgm("wild-battle");
}

export function playPartyHealSound(): void {
  playPokeLoungeSfx("battle-start", { volume: 0.65 });
}

export function playBattleHitSound(): void {
  playPokeLoungeSfx("battle-hit");
}

export function playPokemonFaintSound(): void {
  playPokeLoungeSfx("pokemon-faint");
}

export function playBattleConfirmSound(): void {
  playPokeLoungeSfx("button-confirm");
}

export function playBattleCancelSound(): void {
  playPokeLoungeSfx("button-cancel");
}
