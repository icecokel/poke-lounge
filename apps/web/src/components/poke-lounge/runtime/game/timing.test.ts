import assert from "node:assert/strict";
import { test } from "node:test";
import * as timing from "@poke-lounge/battle/timing";
import {
  POKE_LOUNGE_AUTOSAVE_INTERVAL_MS,
  POKE_LOUNGE_AUTOSAVE_DEBOUNCE_MS,
} from "../../poke-lounge-autosave";
import { BATTLE_INTRO_TIMING, getBattleIntroDurationMs } from "./battle/battle-intro";
import { ROM_CAPTURE_ANIMATION_DURATION_MS } from "./battle/capture-presentation";
import { DEFAULT_PREPARATION_DURATION_MS } from "./round/round-state";

test("legacy web timing exports resolve to the common timing module", () => {
  assert.equal(POKE_LOUNGE_AUTOSAVE_INTERVAL_MS, timing.POKE_LOUNGE_AUTOSAVE_INTERVAL_MS);
  assert.equal(POKE_LOUNGE_AUTOSAVE_DEBOUNCE_MS, timing.POKE_LOUNGE_AUTOSAVE_DEBOUNCE_MS);
  assert.equal(BATTLE_INTRO_TIMING, timing.BATTLE_INTRO_TIMING);
  assert.equal(ROM_CAPTURE_ANIMATION_DURATION_MS, timing.ROM_CAPTURE_ANIMATION_DURATION_MS);
  assert.equal(DEFAULT_PREPARATION_DURATION_MS, timing.DEFAULT_ROUND_DURATION_MS);
});

test("battle entry presentation remains 740 ms after centralizing its phases", () => {
  assert.equal(getBattleIntroDurationMs(), 740);
});
