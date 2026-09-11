import { sortTournamentParticipantsByJoinOrder } from "./tournament-seeding";

it("sorts simultaneous AI seats by their server IDs without mutating input", () => {
  const input = Object.freeze([
    { playerId: "ai-z", joinedAtMs: 10 },
    { playerId: "human-z", joinedAtMs: 1 },
    { playerId: "ai-a", joinedAtMs: 10 },
    { playerId: "ai-m", joinedAtMs: 10 },
  ]);
  expect(sortTournamentParticipantsByJoinOrder(input).map(p => p.playerId)).toEqual([
    "human-z",
    "ai-a",
    "ai-m",
    "ai-z",
  ]);
  expect(input.map(p => p.playerId)).toEqual(["ai-z", "human-z", "ai-a", "ai-m"]);
});

it("uses join time before ID and retains participant data", () => {
  const early = { playerId: "z", joinedAtMs: 0, displayName: "First" };
  const late = { playerId: "a", joinedAtMs: 1, displayName: "Second" };
  const sorted = sortTournamentParticipantsByJoinOrder([late, early]);
  expect(sorted[0]).toBe(early);
  expect(sorted[1]).toBe(late);
  expect(sortTournamentParticipantsByJoinOrder([])).toEqual([]);
});
