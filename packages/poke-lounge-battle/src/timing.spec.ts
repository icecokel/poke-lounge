import * as timing from "./timing";
import {
  ROUND_DURATION_OPTIONS_MS,
  DEFAULT_ROUND_DURATION_MS,
  getPartyExperienceRatio,
  sharesPartyExperience,
} from "./round-settings";
import { ROUND_START_COUNTDOWN_MS } from "./round-start";
import { TOURNAMENT_BRIEFING_DURATION_MS } from "./tournament-gathering";
import { BATTLE_MESSAGE_AUTO_ADVANCE_MS } from "./battle-presentation";
import { NURSE_HEAL_DURATION_MS } from "./adventure/world/field-map";
import {
  REMOTE_PLAYER_INTERPOLATION_MS,
  AI_REMOTE_PLAYER_INTERPOLATION_MS,
} from "./adventure/world/player-motion";
import { ROM_EVOLUTION_ANIMATION_DURATION_MS } from "./adventure/battle/evolution-presentation";

// Independent pre-refactor values: moving a setting must not silently retune the game.
const expectedNumericTimings = {
  DEFAULT_ROUND_DURATION_MS: 90_000,
  COMPETITIVE_TURN_DEADLINE_MS: 30_000,
  ROUND_START_COUNTDOWN_MS: 3_000,
  TOURNAMENT_BRIEFING_DURATION_MS: 5_000,
  TOURNAMENT_RESULT_DURATION_MS: 10_000,
  MIN_ROUND_DURATION_MS: 1,
  MAX_ROUND_DURATION_MS: 3_600_000,
  POKE_LOUNGE_ACTIVE_ROOM_LEASE_MS: 7_200_000,
  POKE_LOUNGE_PENDING_PRESENCE_LEASE_MS: 15_000,
  POKE_LOUNGE_WAITING_ROOM_LEASE_MS: 1_800_000,
  POKE_LOUNGE_CLOSED_ROOM_LEASE_MS: 600_000,
  PARTICIPANT_DISCONNECT_GRACE_MS: 60_000,
  WORLD_CURSOR_INTERVAL_MS: 1_000,
  TURN_RECONCILIATION_INTERVAL_MS: 10_000,
  COMPETITIVE_TURN_RETRY_DELAY_MS: 5_000,
  RECOVERY_INITIAL_DELAY_MS: 250,
  RECOVERY_MAX_DELAY_MS: 5_000,
  ONLINE_STALE_RECOVERY_DELAY_MS: 3_000,
  ROOM_CLOCK_RETRY_INITIAL_DELAY_MS: 250,
  ROOM_CLOCK_RETRY_MAX_DELAY_MS: 5_000,
  ROOM_CLOCK_MAX_WAIT_MS: 30_000,
  SERVER_ROOM_REQUEST_TIMEOUT_MS: 10_000,
  INITIAL_WORKFLOW_RETRY_MAX_DELAY_MS: 5_000,
  PARTY_PUBLICATION_RETRY_DELAY_MS: 1_000,
  POKE_LOUNGE_AUTOSAVE_INTERVAL_MS: 30_000,
  POKE_LOUNGE_AUTOSAVE_DEBOUNCE_MS: 2_000,
  PLAYER_POSITION_PERSIST_INTERVAL_MS: 1_000,
  BATTLE_MESSAGE_AUTO_ADVANCE_MS: 300,
  NURSE_HEAL_DURATION_MS: 1_200,
  ROM_EVOLUTION_ANIMATION_DURATION_MS: 3_200,
  ROM_CAPTURE_ANIMATION_DURATION_MS: 2_600,
  BATTLE_HP_DECREASE_TWEEN_MS: 560,
  BATTLE_HIT_TWEEN_MS: 300,
  BATTLE_ENTRANCE_TWEEN_MS: 640,
  FIELD_AREA_ANNOUNCEMENT_DURATION_MS: 1_800,
  REMOTE_PLAYER_INTERPOLATION_MS: 120,
  AI_REMOTE_PLAYER_INTERPOLATION_MS: 250,
  TOURNAMENT_CELEBRATION_DURATION_MS: 5_000,
  BATTLE_STATUS_EFFECT_DURATION_MS: 900,
  BATTLE_SPECIAL_EFFECT_DURATION_MS: 1_800,
  BATTLE_DEFAULT_EFFECT_DURATION_MS: 1_200,
  BGM_CROSSFADE_DURATION_SECONDS: 0.18,
  APPLE_MOBILE_BGM_FADE_DURATION_MS: 120,
  POKE_LOUNGE_CLOCK_REFRESH_INTERVAL_MS: 250,
  ROUND_START_CLOCK_REFRESH_INTERVAL_MS: 50,
  ROUND_COUNTDOWN_URGENT_MS: 10_000,
} satisfies Partial<Record<keyof typeof timing, number>>;

describe("central timing constants", () => {
  it("preserves all production timing values and explicit units", () => {
    expect(timing).toEqual({
      ...expectedNumericTimings,
      ROUND_DURATION_OPTIONS_MS: [90_000, 180_000, 300_000],
      BATTLE_INTRO_TIMING: { flashMs: 120, stripeMs: 360, fadeMs: 180, settleMs: 80 },
    });
    for (const [name, value] of Object.entries(expectedNumericTimings)) {
      expect(Number.isFinite(value) && value > 0).toBe(true);
      if (name.endsWith("_MS")) expect(Number.isSafeInteger(value)).toBe(true);
    }
  });

  it("keeps existing shared public import paths compatible", () => {
    expect(ROUND_DURATION_OPTIONS_MS).toBe(timing.ROUND_DURATION_OPTIONS_MS);
    expect(DEFAULT_ROUND_DURATION_MS).toBe(timing.DEFAULT_ROUND_DURATION_MS);
    expect(ROUND_START_COUNTDOWN_MS).toBe(timing.ROUND_START_COUNTDOWN_MS);
    expect(TOURNAMENT_BRIEFING_DURATION_MS).toBe(timing.TOURNAMENT_BRIEFING_DURATION_MS);
    expect(BATTLE_MESSAGE_AUTO_ADVANCE_MS).toBe(timing.BATTLE_MESSAGE_AUTO_ADVANCE_MS);
    expect(NURSE_HEAL_DURATION_MS).toBe(timing.NURSE_HEAL_DURATION_MS);
    expect(ROM_EVOLUTION_ANIMATION_DURATION_MS).toBe(timing.ROM_EVOLUTION_ANIMATION_DURATION_MS);
    expect(REMOTE_PLAYER_INTERPOLATION_MS).toBe(timing.REMOTE_PLAYER_INTERPOLATION_MS);
    expect(AI_REMOTE_PLAYER_INTERPOLATION_MS).toBe(timing.AI_REMOTE_PLAYER_INTERPOLATION_MS);
  });

  it.each([
    [90_000, 1],
    [180_000, 0.5],
    [300_000, 0],
    [270_000, 0],
    [89_999, 0],
    [90_001, 0],
    [179_999, 0],
    [180_001, 0],
    [0, 0],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
  ])("preserves experience sharing for base duration %s", (durationMs, ratio) => {
    expect(getPartyExperienceRatio(durationMs)).toBe(ratio);
    expect(sharesPartyExperience(durationMs)).toBe(ratio > 0);
  });
});
