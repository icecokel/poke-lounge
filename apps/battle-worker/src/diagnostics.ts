import { z } from "zod";
import { CompetitivePartyValidationError } from "@poke-lounge/battle/competitive-party";
import { PartyAcceptanceError } from "@poke-lounge/battle/party-acceptance";

// Only schema field names and indices are logged; record keys can contain player identities.
const fields = new Set([
  "protocolVersion",
  "requestId",
  "roomInstanceId",
  "stateRevision",
  "engineVersion",
  "operation",
  "kind",
  "party",
  "proposed",
  "version",
  "activeSlotIndex",
  "members",
  "slotIndex",
  "speciesId",
  "level",
  "experience",
  "currentHp",
  "status",
  "individualValues",
  "hp",
  "attack",
  "defense",
  "specialAttack",
  "specialDefense",
  "speed",
  "moves",
  "moveId",
  "pp",
  "gender",
  "natureId",
  "abilityId",
  "heldItemId",
  "statusTurns",
  "happiness",
  "effortValues",
  "state",
  "action",
  "actions",
  "players",
  "playerId",
  "previousLevels",
  "starterSelection",
  "mode",
  "seed",
  "restore",
  "rulesetVersion",
  "turn",
  "participantIds",
  "playersById",
]);

export type ComputeFailureDiagnostic = {
  reason: string;
  issues: Array<{ code: string; path: string }>;
  frames?: string[];
  /** Error class name, e.g. TypeError. */
  name?: string;
  /** Bounded exception message with filesystem paths and quoted data removed. */
  message?: string;
};

function errorName(error: unknown): string | undefined {
  const name = error instanceof Error ? error.name : undefined;
  return name && /^[A-Za-z0-9_.-]{1,48}$/.test(name) ? name : undefined;
}

// Our own messages name the broken invariant ("Duplicate participants"), which frames alone do not.
// Inputs are game state, never credentials; still drop quoted values, JSON fragments and paths.
export function safeErrorMessage(error: unknown): string | undefined {
  if (!(error instanceof Error) || error instanceof z.ZodError) return undefined;
  const message = error.message
    .slice(0, 2_000)
    .replace(/(?:[A-Za-z]:)?(?:[\\/][^\s"'():,]+){2,}/g, "[path]")
    .replace(/"[^"]*"|'[^']*'|`[^`]*`/g, "[value]")
    .replace(/\{[^\n]*\}|\[[^\n]*\]/g, "[data]")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .trim()
    .slice(0, 200);
  return message || undefined;
}

export function computeFailureDiagnostic(error: unknown): ComputeFailureDiagnostic {
  return {
    name: errorName(error),
    message: safeErrorMessage(error),
    // Keep code locations, not exception messages or absolute filesystem paths.
    frames:
      error instanceof Error
        ? error.stack
            ?.split("\n")
            .slice(1, 5)
            .flatMap(line => {
              const frame = line.match(/[/\\]([A-Za-z0-9_.-]+\.[cm]?js:\d+:\d+)\)?$/)?.[1];
              return frame ? [frame.slice(0, 120)] : [];
            })
        : undefined,
    reason:
      error instanceof PartyAcceptanceError
        ? error.rule
        : error instanceof CompetitivePartyValidationError
          ? error.reason
          : error instanceof z.ZodError
            ? "schema-invalid"
            : error instanceof SyntaxError
              ? "json-invalid"
              : error instanceof Error && error.message === "Invalid starter party"
                ? "invalid-starter-party"
                : "unexpected-error",
    issues:
      error instanceof z.ZodError
        ? error.issues.slice(0, 8).map(issue => ({
            code: issue.code,
            path:
              issue.path
                .slice(0, 12)
                .map(part =>
                  typeof part === "number" &&
                  Number.isSafeInteger(part) &&
                  part >= 0 &&
                  part <= 1000
                    ? String(part)
                    : typeof part === "string" && fields.has(part)
                      ? part
                      : "_",
                )
                .join(".") || "root",
          }))
        : [],
  };
}
