import assert from "node:assert/strict";
import test from "node:test";
import { createBattleUiStore, type BattlePresentationState } from "./battle-ui-store";

const presentation = {
  authoritative: { connectionStatus: "online", inputPending: false, spectating: false },
  battleKind: "wild",
  capture: null,
  entrance: { active: false, progress: 1 },
  evolution: null,
  help: { inputMode: "keyboard", open: false },
  message: "야생 포켓몬이 나타났다!",
  opponent: {
    currentHp: 10,
    displayedHp: 10,
    level: 3,
    maxHp: 10,
    name: "상대",
    sprite: {
      alpha: 1,
      height: 72,
      sprite: { assetKey: "front", frame: 0, path: "/front.png" },
      tint: null,
      width: 72,
      x: 164,
      y: 43,
    },
    status: "normal",
  },
  phase: "intro",
  player: {
    currentHp: 20,
    displayedHp: 20,
    level: 5,
    maxHp: 20,
    name: "내 포켓몬",
    sprite: {
      alpha: 1,
      height: 80,
      sprite: { assetKey: "back", frame: 0, path: "/back.png" },
      tint: null,
      width: 80,
      x: 64,
      y: 104,
    },
    status: "normal",
  },
} satisfies BattlePresentationState;

test("BattleUiStore는 전투 snapshot과 action을 같은 controller에 연결한다", function testCase() {
  const store = createBattleUiStore();
  const actions: string[] = [];
  let notifications = 0;
  const unsubscribe = store.subscribe(function callback() {
    notifications += 1;
  });

  store.setActionHandler(function callback(action) {
    return actions.push(action.type);
  });
  store.publishPresentation(presentation);
  store.dispatch({ type: "select-command", index: 0 });

  assert.equal(store.getSnapshot().presentation, presentation);
  assert.equal(notifications, 1);
  assert.deepEqual(actions, ["select-command"]);

  store.clear();
  store.dispatch({ type: "go-back" });
  assert.deepEqual(store.getSnapshot(), { controls: null, presentation: null });
  assert.deepEqual(actions, ["select-command"]);
  unsubscribe();
});
