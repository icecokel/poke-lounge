import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { selectWildEncounterConfig } from "./wildEncounterTables";

interface PokemonDataFixture {
  version: 1;
  species: Record<
    string,
    {
      speciesId: number;
      nationalDexId: number | null;
      name?: string;
      catchRate: number;
      encounterable: boolean;
    }
  >;
}

const PUBLIC_GAME_DATA_URL = new URL("../../../../../../public/game-data/", import.meta.url);

test("v2 종 범위는 포켓몬 원본의 이름과 포획률 등급으로 조우 슬롯을 확장한다", () => {
  const pokemonData: PokemonDataFixture = {
    version: 1,
    species: {
      "1": createPokemonRecord(1, 1, "첫째", 190),
      "2": createPokemonRecord(2, 2, "둘째", 189),
      "3": createPokemonRecord(3, 3, "셋째", 120),
      "4": createPokemonRecord(4, 4, "넷째", 119),
      "5": createPokemonRecord(5, 5, "다섯째", 60),
      "6": createPokemonRecord(6, 6, "여섯째", 59),
      "7": createPokemonRecord(7, 7, "일곱째", 30),
      "8": createPokemonRecord(8, 8, "여덟째", 29),
      "9": createPokemonRecord(9, 9, "비조우 대상", 255, false),
      "10": createPokemonRecord(10, null, "도감 번호 없음", 255),
    },
  };
  const config = selectWildEncounterConfig(
    {
      version: 2,
      defaultTableId: "default",
      tables: [
        {
          id: "default",
          mapKeys: ["town"],
          encounterRate: 0.15,
          speciesRanges: [{ startNationalDexId: 1, endNationalDexId: 10 }],
        },
      ],
    },
    "town",
    null,
    pokemonData,
  );

  assert.ok(config);
  assert.equal(config.encounterRate, 0.15);
  assert.deepEqual(
    config.slots.map(slot => ({
      speciesId: slot.speciesId,
      name: slot.name,
      minLevel: slot.minLevel,
      maxLevel: slot.maxLevel,
      weight: slot.weight,
    })),
    [
      { speciesId: 1, name: "첫째", minLevel: 1, maxLevel: 100, weight: 8 },
      { speciesId: 2, name: "둘째", minLevel: 1, maxLevel: 100, weight: 6 },
      { speciesId: 3, name: "셋째", minLevel: 1, maxLevel: 100, weight: 6 },
      { speciesId: 4, name: "넷째", minLevel: 1, maxLevel: 100, weight: 4 },
      { speciesId: 5, name: "다섯째", minLevel: 1, maxLevel: 100, weight: 4 },
      { speciesId: 6, name: "여섯째", minLevel: 1, maxLevel: 100, weight: 2 },
      { speciesId: 7, name: "일곱째", minLevel: 1, maxLevel: 100, weight: 2 },
      { speciesId: 8, name: "여덟째", minLevel: 1, maxLevel: 100, weight: 1 },
    ],
  );
});

test("공개 v2 테이블은 세 지역의 기본 10종을 중심으로 493종 희귀 조우를 유지한다", () => {
  const tableData = readPublicGameData("wild-encounter-tables.json") as {
    tables: Array<{
      areaIds?: string[];
      commonNationalDexIds?: number[];
      rarePoolWeight?: number;
    }>;
  };
  const pokemonData = readPublicGameData("pokemon-data.json") as PokemonDataFixture;
  const defaultConfig = selectWildEncounterConfig(tableData, "town", null, pokemonData);
  const areaConfigs = [
    selectWildEncounterConfig(tableData, "town", "town-west-field", pokemonData),
    selectWildEncounterConfig(tableData, "town", "town-plaza-field", pokemonData),
    selectWildEncounterConfig(tableData, "town", "town-south-field", pokemonData),
  ];

  assert.ok(defaultConfig);
  areaConfigs.forEach(config => assert.ok(config));
  assert.deepEqual(
    defaultConfig.slots.map(slot => slot.speciesId),
    createIntegerRange(1, 493),
  );
  assert.deepEqual(
    areaConfigs.map(config => config?.slots.length),
    [151, 100, 242],
  );
  assert.deepEqual(
    areaConfigs.map(config => config?.slots.map(slot => slot.speciesId)),
    [createIntegerRange(1, 151), createIntegerRange(152, 251), createIntegerRange(252, 493)],
  );
  assert.deepEqual(
    [...new Set(areaConfigs.flatMap(config => config?.slots.map(slot => slot.speciesId) ?? []))],
    createIntegerRange(1, 493),
  );

  for (const [index, config] of areaConfigs.entries()) {
    assert.ok(config);
    const areaTable = tableData.tables.find(candidate =>
      candidate.areaIds?.includes(
        ["town-west-field", "town-plaza-field", "town-south-field"][index],
      ),
    );
    const commonNationalDexIds = new Set(areaTable?.commonNationalDexIds);
    const commonWeight = config.slots.reduce(
      (total, slot) => total + (commonNationalDexIds.has(slot.speciesId) ? slot.weight : 0),
      0,
    );
    const rareWeight = config.slots.reduce(
      (total, slot) => total + (commonNationalDexIds.has(slot.speciesId) ? 0 : slot.weight),
      0,
    );

    assert.ok(areaTable);
    assert.equal(commonNationalDexIds.size, 10);
    assert.ok(config.slots.every(slot => slot.weight > 0));
    assert.ok(Math.abs(rareWeight - (areaTable?.rarePoolWeight ?? 0)) < 1e-9);
    assert.ok(commonWeight / (commonWeight + rareWeight) > 0.95);
  }

  for (const slot of defaultConfig.slots) {
    const source = pokemonData.species[String(slot.speciesId)];

    assert.equal(slot.name, source?.name);
    assert.equal(source?.encounterable, true);
    assert.equal(slot.weight, resolveExpectedWeight(source?.catchRate ?? -1));
    assert.equal(slot.minLevel, 1);
    assert.equal(slot.maxLevel, 100);
  }
});

test("v1 명시적 슬롯 테이블은 기존 호출 형태를 유지한다", () => {
  const config = selectWildEncounterConfig(
    {
      version: 1,
      defaultTableId: "default",
      tables: [
        {
          id: "default",
          mapKeys: ["town"],
          slots: [{ speciesId: 10, name: "캐터피", minLevel: 3, maxLevel: 5, weight: 1 }],
        },
      ],
    },
    "town",
  );

  assert.deepEqual(config?.slots, [
    { speciesId: 10, name: "캐터피", minLevel: 3, maxLevel: 5, weight: 1 },
  ]);
});

function createPokemonRecord(
  speciesId: number,
  nationalDexId: number | null,
  name: string,
  catchRate: number,
  encounterable = true,
): PokemonDataFixture["species"][string] {
  return { speciesId, nationalDexId, name, catchRate, encounterable };
}

function readPublicGameData(fileName: string): unknown {
  return JSON.parse(readFileSync(new URL(fileName, PUBLIC_GAME_DATA_URL), "utf8")) as unknown;
}

function createIntegerRange(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function resolveExpectedWeight(catchRate: number): number {
  if (catchRate >= 190) {
    return 8;
  }

  if (catchRate >= 120) {
    return 6;
  }

  if (catchRate >= 60) {
    return 4;
  }

  if (catchRate >= 30) {
    return 2;
  }

  return 1;
}
