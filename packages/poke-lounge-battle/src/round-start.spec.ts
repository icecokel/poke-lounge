import {
  getRoundStartCount,
  getRoundStartPosition,
  isRoundStartBlocked,
  ROUND_START_COUNTDOWN_MS,
} from "./round-start";

describe("shared round start", () => {
  const round = { phase: "round-started", startedAtMs: 13_000, endsAtMs: 103_000 };
  it("counts 3/2/1 against the absolute server instant, including resume and exact boundaries", () => {
    expect(ROUND_START_COUNTDOWN_MS).toBe(3000);
    for (const [now, count] of [
      [10_000, 3],
      [10_999, 3],
      [11_000, 2],
      [12_000, 1],
      [12_999, 1],
      [13_000, null],
      [20_000, null],
    ])
      expect(getRoundStartCount("round-started", round, now!)).toBe(count);
    expect(isRoundStartBlocked("round-started", round, 12_999)).toBe(true);
    expect(isRoundStartBlocked("round-started", round, 13_000)).toBe(false);
  });
  it("never starts a countdown on selection wait, lobby, ended room or local solo", () => {
    expect(
      getRoundStartCount("round-started", { ...round, startedAtMs: null, endsAtMs: null }, 10_000),
    ).toBeNull();
    expect(
      isRoundStartBlocked(
        "round-started",
        { ...round, startedAtMs: null, endsAtMs: null },
        100_000,
      ),
    ).toBe(true);
    for (const phase of ["waiting", "closed", "completed", "tournament"])
      expect(isRoundStartBlocked(phase, round, 10_000)).toBe(false);
  });
  it("gives humans and AI distinct slots independent of participant order", () => {
    const ids = ["human-1", "human-2", "ai-1", "ai-2", "ai-3", "ai-4", "ai-5", "ai-6"];
    const positions = ids.map(id => getRoundStartPosition(id, ids));
    expect(new Set(positions.map(p => `${p.x}:${p.y}`)).size).toBe(8);
    for (const [i, p] of positions.entries())
      expect(getRoundStartPosition(ids[i]!, [...ids].reverse())).toEqual(p);
  });
});
