import type { PokeLoungeSaveSnapshot } from "./poke-lounge-save-snapshot";

export function hasSamePokeLoungeLocalProgress(
  left: PokeLoungeSaveSnapshot,
  right: PokeLoungeSaveSnapshot,
): boolean {
  return haveSameJsonValue(left.state, right.state);
}

function haveSameJsonValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => haveSameJsonValue(value, right[index]))
    );
  }

  if (!isRecord(left) || !isRecord(right)) {
    return false;
  }

  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) => key === rightKeys[index] && haveSameJsonValue(left[key], right[key]),
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
