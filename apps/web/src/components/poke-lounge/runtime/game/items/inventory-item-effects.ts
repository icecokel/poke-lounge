import { getExperienceForLevel } from "../battle/experience";
import { planLevelUpPlayerProgression } from "../battle/level-up-progression";
import { applyEvolutionStone, applyPlayerLevelUpStats } from "../battle/pokemon-evolution";
import { getRuntimePokemonData, getRuntimePokemonSpeciesGrowthRate } from "../data/game-data-json";
import type { PlayerPokemon, PlayerPokemonMove } from "../state/game-state-store";
import { isEvolutionStoneItemId, type EvolutionStoneItemId } from "./evolution-stones";
import { getRuntimeGameItem } from "./runtime-items";

export type InventoryItemEffectId =
  | "potion"
  | "superPotion"
  | "hyperPotion"
  | "antidote"
  | "revive"
  | "rareCandy"
  | EvolutionStoneItemId;
export type InventoryItemTargetStatus = "normal" | "poisoned" | "burned" | "paralyzed" | "fainted";

export interface InventoryItemTarget {
  name: string;
  level?: number;
  currentHp?: number;
  maxHp?: number;
  status?: InventoryItemTargetStatus;
}

export type ApplyInventoryItemEffectResult<TPokemon extends InventoryItemTarget> =
  | {
      ok: true;
      itemId: InventoryItemEffectId;
      messages: string[];
      pokemon: TPokemon;
      pendingMoveReplacements: PlayerPokemonMove[];
    }
  | {
      ok: false;
      itemId: string;
      reason: "unsupported-item" | "no-effect";
      message: string;
    };

export function applyInventoryItemEffect<TPokemon extends InventoryItemTarget>(
  itemId: string,
  pokemon: TPokemon,
): ApplyInventoryItemEffectResult<TPokemon> {
  const item = getRuntimeGameItem(itemId);
  if (!item) {
    return {
      ok: false,
      itemId,
      reason: "unsupported-item",
      message: "지금은 쓸 수 없다.",
    };
  }

  if (
    (itemId === "potion" || itemId === "superPotion" || itemId === "hyperPotion") &&
    item.partyUseEffects?.hpRestore &&
    item.partyUseEffects.hpRestoreParam > 0
  ) {
    return applyHealingItem({
      pokemon,
      itemId,
      displayName: item.name,
      healAmount: item.partyUseEffects.hpRestoreParam,
    });
  }

  if (itemId === "antidote" && item.partyUseEffects?.poisonHeal) {
    return applyAntidote(pokemon, item.name);
  }

  if (itemId === "revive" && item.partyUseEffects?.revive) {
    return applyRevive(pokemon, item.name);
  }

  if (itemId === "rareCandy" && item.partyUseEffects?.levelUp) {
    return applyRareCandy(pokemon, item.name);
  }

  if (isEvolutionStoneItemId(itemId) && item.partyUseEffects?.evolve) {
    return applyEvolutionStoneItem(itemId, pokemon);
  }

  return {
    ok: false,
    itemId,
    reason: "unsupported-item",
    message: "지금은 쓸 수 없다.",
  };
}

function applyEvolutionStoneItem<TPokemon extends InventoryItemTarget>(
  itemId: EvolutionStoneItemId,
  pokemon: TPokemon,
): ApplyInventoryItemEffectResult<TPokemon> {
  if (!isPlayerPokemonTarget(pokemon)) {
    return {
      ok: false,
      itemId,
      reason: "no-effect",
      message: "효과가 없다.",
    };
  }

  const result = applyEvolutionStone({
    itemId,
    pokemon,
    pokemonData: getRuntimePokemonData(),
  });

  if (!result.evolved) {
    return {
      ok: false,
      itemId,
      reason: "no-effect",
      message: "효과가 없다.",
    };
  }

  return {
    ok: true,
    itemId,
    messages: result.messages,
    pokemon: result.pokemon,
    pendingMoveReplacements: [],
  };
}

function isPlayerPokemonTarget<TPokemon extends InventoryItemTarget>(
  pokemon: TPokemon,
): pokemon is TPokemon & PlayerPokemon {
  const speciesId = (pokemon as Partial<PlayerPokemon>).speciesId;

  return (
    typeof speciesId === "number" &&
    Number.isInteger(speciesId) &&
    speciesId > 0 &&
    typeof pokemon.level === "number" &&
    Number.isFinite(pokemon.level)
  );
}

function applyHealingItem<TPokemon extends InventoryItemTarget>({
  pokemon,
  itemId,
  displayName,
  healAmount,
}: {
  pokemon: TPokemon;
  itemId: Extract<InventoryItemEffectId, "potion" | "superPotion" | "hyperPotion">;
  displayName: string;
  healAmount: number;
}): ApplyInventoryItemEffectResult<TPokemon> {
  const maxHp = normalizeHp(pokemon.maxHp);
  const currentHp = normalizeHp(pokemon.currentHp);

  if (maxHp === null || currentHp === null) {
    return {
      ok: false,
      itemId,
      reason: "no-effect",
      message: "효과가 없다.",
    };
  }

  if (pokemon.status === "fainted" || currentHp <= 0) {
    return {
      ok: false,
      itemId,
      reason: "no-effect",
      message: "쓰러진 포켓몬에게는 사용할 수 없다.",
    };
  }

  if (currentHp >= maxHp) {
    return {
      ok: false,
      itemId,
      reason: "no-effect",
      message: "효과가 없다.",
    };
  }

  return {
    ok: true,
    itemId,
    messages: [
      `${pokemon.name}에게 ${displayName}을 사용했다!`,
      `${pokemon.name}의 HP가 회복됐다!`,
    ],
    pokemon: {
      ...pokemon,
      currentHp: Math.min(maxHp, currentHp + healAmount),
      status: pokemon.status ?? "normal",
    },
    pendingMoveReplacements: [],
  };
}

function applyRevive<TPokemon extends InventoryItemTarget>(
  pokemon: TPokemon,
  displayName: string,
): ApplyInventoryItemEffectResult<TPokemon> {
  const maxHp = normalizeHp(pokemon.maxHp);
  const currentHp = normalizeHp(pokemon.currentHp);

  if (maxHp === null || (pokemon.status !== "fainted" && currentHp !== 0)) {
    return {
      ok: false,
      itemId: "revive",
      reason: "no-effect",
      message: "효과가 없다.",
    };
  }

  return {
    ok: true,
    itemId: "revive",
    messages: [
      `${pokemon.name}에게 ${displayName}을 사용했다!`,
      `${pokemon.name}는 다시 일어났다!`,
    ],
    pokemon: {
      ...pokemon,
      currentHp: Math.max(1, Math.floor(maxHp / 2)),
      status: "normal",
    },
    pendingMoveReplacements: [],
  };
}

function applyRareCandy<TPokemon extends InventoryItemTarget>(
  pokemon: TPokemon,
  displayName: string,
): ApplyInventoryItemEffectResult<TPokemon> {
  const level = normalizeLevel(pokemon.level);

  if (level === null || level >= 100) {
    return {
      ok: false,
      itemId: "rareCandy",
      reason: "no-effect",
      message: "효과가 없다.",
    };
  }

  const nextLevel = level + 1;
  const leveledPokemon = {
    ...pokemon,
    level: nextLevel,
  };
  const baseMessages = [
    `${pokemon.name}에게 ${displayName}을 사용했다!`,
    `${pokemon.name}의 레벨이 올랐다!`,
  ];

  if (!isPlayerPokemonTarget(leveledPokemon)) {
    return {
      ok: true,
      itemId: "rareCandy",
      messages: baseMessages,
      pokemon: leveledPokemon,
      pendingMoveReplacements: [],
    };
  }

  const growthRate = resolveGrowthRate(leveledPokemon);
  const progressedPokemon = {
    ...leveledPokemon,
    growthRate,
    experience: Math.max(
      normalizeExperience(leveledPokemon.experience),
      getExperienceForLevel(nextLevel, growthRate),
    ),
  };
  const levelStatsPokemon = applyPlayerLevelUpStats({
    pokemon: progressedPokemon,
    previousLevel: level,
    pokemonData: getRuntimePokemonData(),
  });
  const progression = planLevelUpPlayerProgression({
    pokemon: levelStatsPokemon,
    previousLevel: level,
    pokemonData: getRuntimePokemonData(),
  });

  return {
    ok: true,
    itemId: "rareCandy",
    messages: [...baseMessages, ...progression.messages],
    pokemon: progression.pokemon,
    pendingMoveReplacements: progression.pendingMoveReplacements,
  };
}

function applyAntidote<TPokemon extends InventoryItemTarget>(
  pokemon: TPokemon,
  displayName: string,
): ApplyInventoryItemEffectResult<TPokemon> {
  if (pokemon.status !== "poisoned") {
    return {
      ok: false,
      itemId: "antidote",
      reason: "no-effect",
      message: "효과가 없다.",
    };
  }

  return {
    ok: true,
    itemId: "antidote",
    messages: [
      `${pokemon.name}에게 ${displayName}를 사용했다!`,
      `${pokemon.name}의 독이 사라졌다!`,
    ],
    pokemon: {
      ...pokemon,
      status: "normal",
    },
    pendingMoveReplacements: [],
  };
}

function normalizeHp(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.floor(value));
}

function normalizeLevel(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(1, Math.floor(value));
}

function normalizeExperience(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

function resolveGrowthRate(pokemon: PlayerPokemon): number {
  if (
    typeof pokemon.growthRate === "number" &&
    Number.isInteger(pokemon.growthRate) &&
    pokemon.growthRate >= 0
  ) {
    return pokemon.growthRate;
  }

  return getRuntimePokemonSpeciesGrowthRate(pokemon.speciesId) ?? 0;
}
