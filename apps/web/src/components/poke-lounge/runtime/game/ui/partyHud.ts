import { BATTLE_POKEMON_FRAME_SIZE, getBattlePokemonAssets } from "../battle/battlePokemonAssets";
import type { BattleSpriteRef } from "../battle/battleTypes";
import { PLAYER_PARTY_SLOT_COUNT, type PlayerPokemonSlot } from "../player/playerTypes";
import type { PlayerPokemon } from "../state/gameStateStore";

export const PARTY_HUD_ANCHORS = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "center",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
] as const;

export type PartyHudAnchor = (typeof PARTY_HUD_ANCHORS)[number];

export interface PartyHudScreenSize {
  width: number;
  height: number;
}

export interface PartyHudPokemonView {
  name: string;
  level: number;
  spriteKey: string;
  spriteFrame: number;
  spriteCrop: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface PartyHudSlotView {
  slotIndex: number;
  x: number;
  y: number;
  occupied: boolean;
  active: boolean;
  pokemon: PartyHudPokemonView | null;
}

export const PARTY_HUD_SLOT_SIZE = { width: 88, height: 34 } as const;
export const PARTY_HUD_SLOT_GAP = 6;
const PARTY_HUD_MARGIN = 10;

export function resolvePartyHudAnchor(
  anchor: PartyHudAnchor,
  screenSize: PartyHudScreenSize,
): { x: number; y: number } {
  const totalHeight =
    PLAYER_PARTY_SLOT_COUNT * PARTY_HUD_SLOT_SIZE.height +
    (PLAYER_PARTY_SLOT_COUNT - 1) * PARTY_HUD_SLOT_GAP;
  const centerX = Math.round((screenSize.width - PARTY_HUD_SLOT_SIZE.width) / 2);
  const centerY = Math.round((screenSize.height - totalHeight) / 2);
  const rightX = screenSize.width - PARTY_HUD_MARGIN - PARTY_HUD_SLOT_SIZE.width;
  const bottomY = screenSize.height - PARTY_HUD_MARGIN - totalHeight;

  switch (anchor) {
    case "top-left":
      return { x: PARTY_HUD_MARGIN, y: PARTY_HUD_MARGIN };
    case "top-center":
      return { x: centerX, y: PARTY_HUD_MARGIN };
    case "top-right":
      return { x: rightX, y: PARTY_HUD_MARGIN };
    case "middle-left":
      return { x: PARTY_HUD_MARGIN, y: centerY };
    case "center":
      return { x: centerX, y: centerY };
    case "middle-right":
      return { x: rightX, y: centerY };
    case "bottom-left":
      return { x: PARTY_HUD_MARGIN, y: bottomY };
    case "bottom-center":
      return { x: centerX, y: bottomY };
    case "bottom-right":
      return { x: rightX, y: bottomY };
  }
}

export function createPartyHudSlotViews({
  activePartySlotIndex,
  anchor,
  party,
  screenSize,
}: {
  activePartySlotIndex: number;
  anchor: PartyHudAnchor;
  party: Array<PlayerPokemonSlot<PlayerPokemon>>;
  screenSize: PartyHudScreenSize;
}): PartyHudSlotView[] {
  const origin = resolvePartyHudAnchor(anchor, screenSize);

  return Array.from({ length: PLAYER_PARTY_SLOT_COUNT }, (_, slotIndex) => {
    const slot = party.find(partySlot => partySlot.slotIndex === slotIndex);
    const pokemon = slot?.pokemon ?? null;

    return {
      slotIndex,
      x: origin.x,
      y: origin.y + slotIndex * (PARTY_HUD_SLOT_SIZE.height + PARTY_HUD_SLOT_GAP),
      occupied: pokemon !== null,
      active: slotIndex === activePartySlotIndex,
      pokemon: pokemon ? createPartyHudPokemonView(pokemon) : null,
    };
  });
}

function createPartyHudPokemonView(pokemon: PlayerPokemon): PartyHudPokemonView {
  const sprite = getBattlePokemonAssets(pokemon.speciesId).front;

  return {
    name: pokemon.name,
    level: pokemon.level,
    spriteKey: sprite.assetKey,
    spriteFrame: sprite.frame,
    spriteCrop: createPartyHudSpriteCrop(sprite),
  };
}

function createPartyHudSpriteCrop(sprite: BattleSpriteRef): PartyHudPokemonView["spriteCrop"] {
  return {
    x: 0,
    y: 0,
    width: Math.min(
      sprite.width ?? BATTLE_POKEMON_FRAME_SIZE.width,
      BATTLE_POKEMON_FRAME_SIZE.width,
    ),
    height: Math.min(
      sprite.height ?? BATTLE_POKEMON_FRAME_SIZE.height,
      BATTLE_POKEMON_FRAME_SIZE.height,
    ),
  };
}
