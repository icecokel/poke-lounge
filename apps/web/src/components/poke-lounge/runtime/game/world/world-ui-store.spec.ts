import assert from "node:assert/strict";
import test from "node:test";
import { createWorldUiStore } from "./world-ui-store";

test("WorldUiStore는 공통 snapshot을 발행하고 action을 scene으로 전달한다", () => {
  const store = createWorldUiStore();
  let notifications = 0;
  let action: unknown;
  store.subscribe(() => {
    notifications += 1;
  });
  store.setActionHandler(nextAction => {
    action = nextAction;
  });

  store.publishPresentation({ interactionPrompt: "A / Enter · 기본 상점" });
  store.dispatch({ type: "open-inventory" });

  assert.equal(store.getSnapshot().interactionPrompt, "A / Enter · 기본 상점");
  assert.equal(notifications, 1);
  assert.deepEqual(action, { type: "open-inventory" });
});
