export const ROM_EVOLUTION_ANIMATION_DURATION_MS = 3_200;

export const ROM_EVOLUTION_MESSAGE_SOURCE = {
  romSha1: "5834fb3a2d751c48501d47d6a56898d7af6ccf9e",
  archivePath: "a/0/2/7",
  archiveMemberIndex: 196,
  startMessageIndex: 915,
  successMessageIndex: 918,
} as const;

const EVOLUTION_INTRO_END = 0.17;
const EVOLUTION_MORPH_END = 0.82;
const EVOLUTION_FLASH_END = 0.92;
const EVOLUTION_MORPH_SWITCH_POINTS = [
  0, 0.24, 0.43, 0.58, 0.69, 0.78, 0.85, 0.91, 0.96, 1,
] as const;

export interface RomEvolutionAnimationFrame {
  flashAlpha: number;
  pokemon: "from" | "to";
  scale: number;
  silhouetteAlpha: number;
  stage: "intro" | "morph" | "flash" | "reveal";
}

export function formatRomEvolutionStartMessage(pokemonName: string): string {
  return `...오잉!?\n${pokemonName}의 모습이...!`;
}

export function formatRomEvolutionSuccessMessage(
  fromPokemonName: string,
  toPokemonName: string,
): string {
  return `축하합니다! ${fromPokemonName}\n${toPokemonName}로 진화했습니다!`;
}

export function createRomEvolutionMessages(
  fromPokemonName: string,
  toPokemonName: string,
): string[] {
  return [
    formatRomEvolutionStartMessage(fromPokemonName),
    formatRomEvolutionSuccessMessage(fromPokemonName, toPokemonName),
  ];
}

export function resolveRomEvolutionAnimationFrame(progress: number): RomEvolutionAnimationFrame {
  const normalizedProgress = Math.min(1, Math.max(0, progress));

  if (normalizedProgress < EVOLUTION_INTRO_END) {
    const stageProgress = normalizedProgress / EVOLUTION_INTRO_END;

    return {
      flashAlpha: 0,
      pokemon: "from",
      scale: 1,
      silhouetteAlpha: stageProgress,
      stage: "intro",
    };
  }

  if (normalizedProgress < EVOLUTION_MORPH_END) {
    const stageProgress =
      (normalizedProgress - EVOLUTION_INTRO_END) / (EVOLUTION_MORPH_END - EVOLUTION_INTRO_END);
    const switchIndex = findEvolutionMorphSwitchIndex(stageProgress);
    const intervalStart = EVOLUTION_MORPH_SWITCH_POINTS[switchIndex] ?? 0;
    const intervalEnd = EVOLUTION_MORPH_SWITCH_POINTS[switchIndex + 1] ?? 1;
    const intervalProgress = Math.min(
      1,
      Math.max(0, (stageProgress - intervalStart) / Math.max(0.001, intervalEnd - intervalStart)),
    );

    return {
      flashAlpha: 0.08 + stageProgress * 0.18,
      pokemon: switchIndex % 2 === 0 ? "from" : "to",
      scale: 0.9 + Math.sin(intervalProgress * Math.PI) * 0.16,
      silhouetteAlpha: 1,
      stage: "morph",
    };
  }

  if (normalizedProgress < EVOLUTION_FLASH_END) {
    const stageProgress =
      (normalizedProgress - EVOLUTION_MORPH_END) / (EVOLUTION_FLASH_END - EVOLUTION_MORPH_END);

    return {
      flashAlpha: Math.sin(stageProgress * Math.PI),
      pokemon: "to",
      scale: 1.06,
      silhouetteAlpha: 1,
      stage: "flash",
    };
  }

  const stageProgress = (normalizedProgress - EVOLUTION_FLASH_END) / (1 - EVOLUTION_FLASH_END);

  return {
    flashAlpha: Math.max(0, 0.52 * (1 - stageProgress)),
    pokemon: "to",
    scale: 1.06 - stageProgress * 0.06,
    silhouetteAlpha: 1 - stageProgress,
    stage: "reveal",
  };
}

function findEvolutionMorphSwitchIndex(progress: number): number {
  for (let index = 0; index < EVOLUTION_MORPH_SWITCH_POINTS.length - 1; index += 1) {
    const nextPoint = EVOLUTION_MORPH_SWITCH_POINTS[index + 1];

    if (nextPoint !== undefined && progress < nextPoint) {
      return index;
    }
  }

  return EVOLUTION_MORPH_SWITCH_POINTS.length - 2;
}
