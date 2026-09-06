import type { Gen4ActionRequest } from "./types";
import type { CanonicalCompetitiveAction } from "../actions";

/** A deliberately small, public request; contains no seed, volatile-state graph or hidden item data. */
export function parseGen4ActionRequest(value: unknown): Gen4ActionRequest {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid Gen4 request");
  const v = value as Record<string, unknown>;
  const keys = ["kind", "moves", "switchSlots", "trapped", "forcedMoveId", "recharge"];
  if (
    Object.keys(v).length !== keys.length ||
    Object.keys(v).some(k => !keys.includes(k)) ||
    !["move", "switch", "wait", "ended"].includes(String(v.kind)) ||
    typeof v.trapped !== "boolean" ||
    typeof v.recharge !== "boolean" ||
    !(
      v.forcedMoveId === null ||
      (Number.isInteger(v.forcedMoveId) &&
        Number(v.forcedMoveId) >= 1 &&
        Number(v.forcedMoveId) <= 467)
    ) ||
    !Array.isArray(v.moves) ||
    v.moves.length > 4 ||
    !Array.isArray(v.switchSlots) ||
    v.switchSlots.length > 6 ||
    v.switchSlots.some(s => !Number.isInteger(s) || s < 0 || s > 5) ||
    new Set(v.switchSlots).size !== v.switchSlots.length
  )
    throw Error("Invalid Gen4 request");
  const moves = v.moves.map(value => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw Error("Invalid requested move");
    const m = value as Record<string, unknown>;
    if (
      Object.keys(m).sort().join(",") !== "disabled,maxPp,moveId,pp" ||
      typeof m.disabled !== "boolean" ||
      !Number.isInteger(m.moveId) ||
      Number(m.moveId) < 0 ||
      Number(m.moveId) > 467 ||
      !Number.isInteger(m.pp) ||
      Number(m.pp) < 0 ||
      !Number.isInteger(m.maxPp) ||
      Number(m.maxPp) < 1 ||
      Number(m.maxPp) > 64 ||
      Number(m.pp) > Number(m.maxPp)
    )
      throw Error("Invalid requested move");
    return {
      moveId: Number(m.moveId),
      pp: Number(m.pp),
      maxPp: Number(m.maxPp),
      disabled: m.disabled,
    };
  });
  if (new Set(moves.map(m => m.moveId)).size !== moves.length)
    throw Error("Duplicate requested move");
  if (
    (v.kind === "switch" && (moves.length !== 0 || v.switchSlots.length === 0)) ||
    (["wait", "ended"].includes(String(v.kind)) &&
      (moves.length !== 0 || v.switchSlots.length !== 0))
  )
    throw Error("Inconsistent Gen4 request");
  return {
    kind: v.kind as Gen4ActionRequest["kind"],
    moves,
    switchSlots: [...v.switchSlots] as number[],
    trapped: v.trapped,
    forcedMoveId: v.forcedMoveId as number | null,
    recharge: v.recharge,
  };
}
export function isGen4ActionLegal(
  request: Gen4ActionRequest,
  action: CanonicalCompetitiveAction,
): boolean {
  if (request.kind === "wait" || request.kind === "ended") return false;
  if (action.kind === "switch") return request.switchSlots.includes(action.slotIndex);
  if (request.kind === "switch") return false;
  if (action.kind === "continue") return request.recharge || request.forcedMoveId !== null;
  const id = action.moveId === "struggle" ? 165 : action.moveId;
  return !request.recharge && request.moves.some(m => m.moveId === id && !m.disabled && m.pp > 0);
}
