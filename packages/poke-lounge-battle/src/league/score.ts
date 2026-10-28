import { LEAGUE_MATCH_COUNT, LEAGUE_PARTY_SIZE, type LeagueMatchMeasure } from "./contract";
import { Fraction } from "./fraction";

export function scoreMatch(
  input: Pick<LeagueMatchMeasure, "faintedNew" | "hpRatio" | "turns">,
): Fraction {
  if (
    !Number.isInteger(input.faintedNew) ||
    input.faintedNew < 0 ||
    input.faintedNew > LEAGUE_PARTY_SIZE ||
    !Number.isSafeInteger(input.turns) ||
    input.turns < 0
  )
    throw new RangeError("Invalid match measure");
  const health = Fraction.fromJSON(input.hpRatio);
  if (health.compare(new Fraction(0)) < 0 || health.compare(new Fraction(1)) > 0)
    throw new RangeError("Invalid HP ratio");
  const efficiency = new Fraction(Math.max(0, Math.min(36, 48 - input.turns)), 36);
  return new Fraction(55 * Math.max(0, LEAGUE_PARTY_SIZE - input.faintedNew), LEAGUE_PARTY_SIZE)
    .add(health.mul(new Fraction(15)))
    .add(efficiency.mul(new Fraction(30)));
}

export function scoreAttempt(q: readonly Fraction[]): { score: number; total: Fraction } {
  if (
    q.length !== LEAGUE_MATCH_COUNT ||
    q.some(value => value.compare(new Fraction(0)) < 0 || value.compare(new Fraction(100)) > 0)
  )
    throw new RangeError("Expected five scores in 0..100");
  const sorted = [...q].sort((a, b) => a.compare(b));
  const total = q
    .reduce((sum, value) => sum.add(value), new Fraction(0))
    .mul(new Fraction(16))
    .add(sorted[0]!.add(sorted[1]!).mul(new Fraction(10)));
  return { score: Number(total.roundHalfUp()), total };
}
