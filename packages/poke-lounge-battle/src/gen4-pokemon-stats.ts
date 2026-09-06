export interface Gen4StatValues {
  hp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
}

export interface Gen4BaseStats extends Gen4StatValues {}

export interface Gen4BattleStats {
  maxHp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
}

const ZERO_EFFORT_VALUES: Readonly<Gen4StatValues> = Object.freeze({
  hp: 0,
  attack: 0,
  defense: 0,
  specialAttack: 0,
  specialDefense: 0,
  speed: 0,
});

export function calculateGen4BattleStats(
  baseStats: Gen4BaseStats,
  level: number,
  individualValues: Gen4StatValues,
  effortValues: Gen4StatValues = ZERO_EFFORT_VALUES,
  natureId = 0,
): Gen4BattleStats {
  const stats = {
    maxHp:
      baseStats.hp === 1
        ? 1
        : calculateHp(baseStats.hp, level, individualValues.hp, effortValues.hp),
    attack: calculateOtherStat(
      baseStats.attack,
      level,
      individualValues.attack,
      effortValues.attack,
    ),
    defense: calculateOtherStat(
      baseStats.defense,
      level,
      individualValues.defense,
      effortValues.defense,
    ),
    specialAttack: calculateOtherStat(
      baseStats.specialAttack,
      level,
      individualValues.specialAttack,
      effortValues.specialAttack,
    ),
    specialDefense: calculateOtherStat(
      baseStats.specialDefense,
      level,
      individualValues.specialDefense,
      effortValues.specialDefense,
    ),
    speed: calculateOtherStat(baseStats.speed, level, individualValues.speed, effortValues.speed),
  };
  const keys = ["attack", "defense", "speed", "specialAttack", "specialDefense"] as const;
  if (Number.isInteger(natureId) && natureId >= 0 && natureId < 25) {
    const up = Math.floor(natureId / 5),
      down = natureId % 5;
    if (up !== down) {
      stats[keys[up]!] = Math.floor((stats[keys[up]!] * 110) / 100);
      stats[keys[down]!] = Math.floor((stats[keys[down]!] * 90) / 100);
    }
  }
  return stats;
}

function calculateHp(base: number, level: number, iv: number, ev: number): number {
  return Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + level + 10;
}

function calculateOtherStat(base: number, level: number, iv: number, ev: number): number {
  return Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + 5;
}
