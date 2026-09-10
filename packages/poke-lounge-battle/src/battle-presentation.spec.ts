import {
  BATTLE_MESSAGE_AUTO_ADVANCE_MS,
  parseResolvedTurnPresentation,
  type ResolvedAnimationEvent,
} from "./battle-presentation";

it("일반 전투 메시지의 공통 자동 진행 간격은 300ms다", () => {
  expect(BATTLE_MESSAGE_AUTO_ADVANCE_MS).toBe(300);
});

const playerIds = ["player-a", "player-b"] as const;
const moveEvent = (): ResolvedAnimationEvent => ({
  kind: "move",
  actorPlayerId: playerIds[0],
  targetPlayerId: playerIds[1],
  actorSlotIndex: 0,
  targetSlotIndex: 1,
  moveId: 85,
  status: "normal",
  hit: true,
  damage: 10,
  actorHp: 40,
  targetHp: 20,
  actorStatus: "normal",
  targetStatus: "normal",
});
const parse = (events: unknown[], turn = 2) =>
  parseResolvedTurnPresentation({ turn, events }, playerIds, 3);

it("accepts resolved effects in order and returns detached, explicitly allowlisted data", () => {
  const move = { ...moveEvent(), pendingOpponentAction: { moveId: 91 } };
  const before = JSON.stringify(move);
  const parsed = parse([move]);
  expect(parsed).toEqual({ turn: 2, events: [moveEvent()] });
  expect(parsed?.events[0]).not.toBe(move);
  expect(JSON.stringify(move)).toBe(before);
  move.targetHp = 1;
  expect(parsed?.events[0]?.targetHp).toBe(20);
});

it.each([null, undefined, 3, "effect", [], { turn: 2 }, { turn: 2, events: {} }])(
  "discards malformed optional presentation without throwing: %p",
  value => {
    expect(parseResolvedTurnPresentation(value, playerIds, 3)).toBeUndefined();
  },
);

it("drops stale/future animations and bounds the event queue", () => {
  expect(parse([moveEvent()], 1)).toBeUndefined();
  expect(parse([moveEvent()], 3)).toBeUndefined();
  expect(parse(Array.from({ length: 64 }, moveEvent))?.events).toHaveLength(64);
  expect(parse(Array.from({ length: 65 }, moveEvent))).toBeUndefined();
  expect(parse([])).toEqual({ turn: 2, events: [] });
});

it.each([
  ["moveId", -1],
  ["moveId", 471],
  ["moveId", 1.5],
  ["moveId", "85"],
  ["damage", NaN],
  ["damage", Infinity],
  ["damage", -1],
  ["damage", 65536],
  ["actorHp", -1],
  ["targetHp", 65536],
  ["actorSlotIndex", 6],
  ["targetSlotIndex", -1],
  ["hit", "true"],
  ["actorStatus", "unknown"],
  ["targetStatus", null],
  ["actorPlayerId", "outsider"],
  ["targetPlayerId", "outsider"],
])("rejects malformed event %s=%p", (key, value) => {
  expect(parse([{ ...moveEvent(), [key as string]: value }])).toBeUndefined();
});

it("rejects incomplete and mixed invalid queues rather than playing a partial turn", () => {
  expect(parse([moveEvent(), { kind: "status" }])).toBeUndefined();
  expect(parse([{ ...moveEvent(), moveId: 0 }])).toBeUndefined();
  expect(parse([{ ...moveEvent(), status: "poisoned" }])).toBeUndefined();
  expect(parse([{ ...moveEvent(), targetPlayerId: playerIds[0] }])).toBeUndefined();
});

it.each(["poisoned", "burned", "paralyzed"] as const)(
  "status %s can represent onset or a residual tick, including a fainting tick",
  status => {
    const event = {
      ...moveEvent(),
      kind: "status" as const,
      moveId: 0,
      status,
      hit: false,
      targetPlayerId: playerIds[0],
      targetSlotIndex: 0,
      actorHp: 0,
      targetHp: 0,
      actorStatus: "fainted" as const,
      targetStatus: "fainted" as const,
    };
    expect(parse([event])?.events[0]).toEqual(event);
    expect(parse([{ ...event, damage: 0 }])?.events[0]?.damage).toBe(0);
    expect(parse([{ ...event, targetPlayerId: playerIds[1] }])).toBeUndefined();
    expect(parse([{ ...event, moveId: 85 }])).toBeUndefined();
  },
);
