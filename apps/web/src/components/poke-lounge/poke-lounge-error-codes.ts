import type { PokeLoungeServerRoomErrorDetail } from "./runtime/game/network/server-room";
import type { RequiredGameAssetError } from "./runtime/required-game-asset-error";

// Stable five-digit codes shown to players and recorded as user_code in browser.error.
export const STARTUP_ERROR_CODES = {
  MODULE_LOAD: "11001",
  RUNTIME_INIT: "11002",
  STARTER_DATA: "11003",
  GAME_START: "11004",
} as const;

export const ASSET_ERROR_CODES = {
  HTTP: "11101",
  NETWORK: "11102",
  INVALID_JSON: "11103",
  INVALID_DATA: "11104",
  IMAGE: "11105",
} as const satisfies Record<RequiredGameAssetError["reason"], string>;

export const ROOM_ERROR_CODES = {
  ROOM_CREATE_FAILED: "21001",
  ROOM_JOIN_FAILED: "21002",
  ROOM_PARTY_SYNC_FAILED: "21003",
  ROOM_READY_FAILED: "21004",
  ROOM_TRANSPORT_FAILED: "21005",
  ROOM_FULL: "21006",
  ROOM_EXPIRED: "21007",
  CURSOR_REGRESSION: "21008",
  ROOM_ALREADY_STARTED: "21009",
  ROOM_NOT_FOUND: "21010",
  ROOM_SESSION_INVALID: "21011",
  ROOM_ACCESS_DENIED: "21012",
  ROOM_IDENTITY_MISMATCH: "21013",
  ROOM_REJOIN_BLOCKED: "21014",
  ROOM_REQUEST_INVALID: "21015",
  ROOM_REQUEST_CONFLICT: "21016",
  ROOM_SERVER_BUSY: "21017",
  ROOM_SERVER_UNAVAILABLE: "21018",
  ROOM_REQUEST_TIMEOUT: "21019",
  ROOM_NETWORK_FAILED: "21020",
  ROOM_RESPONSE_INVALID: "21021",
  ROOM_CODE_IN_USE: "21022",
} as const satisfies Record<PokeLoungeServerRoomErrorDetail["code"], string>;

export type PokeLoungeErrorCode =
  | (typeof STARTUP_ERROR_CODES)[keyof typeof STARTUP_ERROR_CODES]
  | (typeof ASSET_ERROR_CODES)[keyof typeof ASSET_ERROR_CODES]
  | (typeof ROOM_ERROR_CODES)[keyof typeof ROOM_ERROR_CODES];
