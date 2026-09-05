const ROOM_RUN_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createRoomRunId(): string {
  if (typeof crypto === "undefined" || !("randomUUID" in crypto)) {
    throw new Error("crypto.randomUUID is required for Poke Lounge room runs");
  }

  return crypto.randomUUID();
}

export function isRoomRunId(value: unknown): value is string {
  return typeof value === "string" && ROOM_RUN_ID_PATTERN.test(value);
}
