import { hgssPhazingSucceeds } from "./flow";
import { sampleGen4WildHeldItem } from "./traits";
import { GEN4_ROM_SPECIES } from "./rom-catalog.generated";
import { calculateGen4BattleStats } from "../gen4-pokemon-stats";
it("HGSS phazing level gate uses the original byte scaling and succeeds at equal/higher level", () => {
  for (const own of [1, 10, 50, 99, 100])
    for (const foe of [1, 10, 50, 99, 100])
      for (let roll = 0; roll < 256; roll++)
        expect(hgssPhazingSucceeds(own, foe, roll)).toBe(
          own >= foe || Math.floor((roll * (own + foe)) / 256) + 1 > Math.floor(foe / 4),
        );
});
it("wild held items use exact normal/Compound Eyes boundaries without granting impossible items", () => {
  const entry = Object.entries(GEN4_ROM_SPECIES).find(
    ([, s]) => s.heldItems[0] !== s.heldItems[1] && s.heldItems[1] !== 0,
  )!;
  const id = Number(entry[0]),
    [common, rare] = entry[1].heldItems;
  for (let roll = 0; roll < 100; roll++) {
    expect(sampleGen4WildHeldItem(id, false, () => roll / 100)).toBe(
      roll < 45 ? 0 : roll < 95 ? common : rare,
    );
    expect(sampleGen4WildHeldItem(id, true, () => roll / 100)).toBe(
      roll < 20 ? 0 : roll < 80 ? common : rare,
    );
  }
});
it("Shedinja keeps 1 maximum HP across level/IV/EV/nature recalculation", () => {
  const base = { hp: 1, attack: 90, defense: 45, specialAttack: 30, specialDefense: 30, speed: 40 };
  const iv = { hp: 31, attack: 31, defense: 31, specialAttack: 31, specialDefense: 31, speed: 31 };
  const ev = { ...iv, hp: 255 };
  for (const level of [1, 20, 50, 100])
    expect(calculateGen4BattleStats(base, level, iv, ev, 3).maxHp).toBe(1);
});
