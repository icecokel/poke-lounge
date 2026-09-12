/**
 * Poke Lounge 시간 상수의 단일 정의 위치. Web/API/워커가 함께 사용한다.
 * *_MS는 밀리초, *_SECONDS는 초. 이 모듈은 환경변수나 런타임 모듈을 읽지 않는다.
 * 기존 시간값을 이동한 것이며 운영/로컬 시간은 동일하게 유지한다.
 * 게임 제한시간, 통신, 연출을 별도 섹션으로 관리해 일괄 배율 변경을 방지한다.
 * ROM에서 추출한 프레임 데이터·CSS 키프레임·테스트 도구 타임아웃은 범위 밖이다.
 */
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

// 게임 진행 제한시간 (운영 기본값; 로컬 전용 배율은 적용하지 않음)
export const ROUND_DURATION_OPTIONS_MS = [90_000, 180_000, 300_000] as const;
export const DEFAULT_ROUND_DURATION_MS = ROUND_DURATION_OPTIONS_MS[0];
export const COMPETITIVE_TURN_DEADLINE_MS = 30_000;
export const ROUND_START_COUNTDOWN_MS = 3_000;
export const TOURNAMENT_BRIEFING_DURATION_MS = 5_000;
export const TOURNAMENT_RESULT_DURATION_MS = 10_000;

// 라운드 시간 입력 범위 (비표준 시간은 기존 NODE_ENV=test에서만 허용)
export const MIN_ROUND_DURATION_MS = 1;
export const MAX_ROUND_DURATION_MS = 3_600_000;

// 방 수명 · 접속 유지
export const POKE_LOUNGE_ACTIVE_ROOM_LEASE_MS = 2 * HOUR_MS;
export const POKE_LOUNGE_PENDING_PRESENCE_LEASE_MS = 15_000;
export const POKE_LOUNGE_WAITING_ROOM_LEASE_MS = 30 * MINUTE_MS;
export const POKE_LOUNGE_CLOSED_ROOM_LEASE_MS = 10 * MINUTE_MS;
export const PARTICIPANT_DISCONNECT_GRACE_MS = 60_000;
export const WORLD_CURSOR_INTERVAL_MS = 1_000;

// 서버 워커 재시도 · 점검 주기
export const TURN_RECONCILIATION_INTERVAL_MS = 10_000;
export const COMPETITIVE_TURN_RETRY_DELAY_MS = 5_000;

// 통신 · 재접속 (게임 제한시간과 별도로 관리)
export const RECOVERY_INITIAL_DELAY_MS = 250;
export const RECOVERY_MAX_DELAY_MS = 5_000;
export const ONLINE_STALE_RECOVERY_DELAY_MS = 3_000;
export const ROOM_CLOCK_RETRY_INITIAL_DELAY_MS = 250;
export const ROOM_CLOCK_RETRY_MAX_DELAY_MS = 5_000;
export const ROOM_CLOCK_MAX_WAIT_MS = 30_000;
export const SERVER_ROOM_REQUEST_TIMEOUT_MS = 10_000;
export const INITIAL_WORKFLOW_RETRY_MAX_DELAY_MS = 5_000;
export const PARTY_PUBLICATION_RETRY_DELAY_MS = 1_000;

// 자동 저장 · 위치 저장
export const POKE_LOUNGE_AUTOSAVE_INTERVAL_MS = 30_000;
export const POKE_LOUNGE_AUTOSAVE_DEBOUNCE_MS = 2_000;
export const PLAYER_POSITION_PERSIST_INTERVAL_MS = 1_000;

// 전투 · 필드 연출 (제한시간 완화와 연동하지 않음)
export const BATTLE_MESSAGE_AUTO_ADVANCE_MS = 300;
export const NURSE_HEAL_DURATION_MS = 1_200;
export const ROM_EVOLUTION_ANIMATION_DURATION_MS = 3_200;
export const ROM_CAPTURE_ANIMATION_DURATION_MS = 2_600;
export const BATTLE_INTRO_TIMING = {
  flashMs: 120,
  stripeMs: 360,
  fadeMs: 180,
  settleMs: 80,
} as const;
export const BATTLE_HP_DECREASE_TWEEN_MS = 560;
export const BATTLE_HIT_TWEEN_MS = 300;
export const BATTLE_ENTRANCE_TWEEN_MS = 640;
export const FIELD_AREA_ANNOUNCEMENT_DURATION_MS = 1_800;
export const REMOTE_PLAYER_INTERPOLATION_MS = 120;
export const AI_REMOTE_PLAYER_INTERPOLATION_MS = 250;
export const TOURNAMENT_CELEBRATION_DURATION_MS = 5_000;
export const BATTLE_STATUS_EFFECT_DURATION_MS = 900;
export const BATTLE_SPECIAL_EFFECT_DURATION_MS = 1_800;
export const BATTLE_DEFAULT_EFFECT_DURATION_MS = 1_200;

// 오디오 전환 (Web Audio API용 *_SECONDS만 초 단위)
export const BGM_CROSSFADE_DURATION_SECONDS = 0.18;
export const APPLE_MOBILE_BGM_FADE_DURATION_MS = 120;

// 표시 시계 갱신 주기 (서버 마감시각 계산과 별개)
export const POKE_LOUNGE_CLOCK_REFRESH_INTERVAL_MS = 250;
export const ROUND_START_CLOCK_REFRESH_INTERVAL_MS = 50;
export const ROUND_COUNTDOWN_URGENT_MS = 10_000;
