import { getLeagueGrowthData } from "@poke-lounge/battle/league/growth/data";
import { checkLeagueParty } from "@poke-lounge/battle/league/growth/plausibility";
import { mintLeagueMon } from "@poke-lounge/battle/league/growth/mint";
import { prepareBadge, judgeBadge } from "@poke-lounge/battle/league/badge";
import { loadGrowthData } from "./growth-data";
import { parentPort } from "node:worker_threads";
import {
  LEAGUE_JUDGE_PROTOCOL,
  type LeagueJudgeErrorCode,
  type LeagueJudgeMatchResult,
} from "@poke-lounge/battle/league/contract";
import { JUDGE_ENGINE_VERSION, weakenOpponents } from "./test-mode";
import { seasonRoster } from "@poke-lounge/battle/league/roster/index";
import { prepareEntry } from "@poke-lounge/battle/league/entry";
import { LeaguePartyError } from "@poke-lounge/battle/league/party";
import { LeaguePlausibilityError } from "@poke-lounge/battle/league/plausibility";
import {
  LEAGUE_MATCH_RULES,
  LeagueInputError,
  measureLeagueMatch,
  replayLeagueMatch,
} from "@poke-lounge/battle/league/match";
import { recoverBetweenMatches } from "@poke-lounge/battle/league/carry";
import { leagueHash } from "@poke-lounge/battle/league/hash";
import { Fraction } from "@poke-lounge/battle/league/fraction";
import { scoreAttempt } from "@poke-lounge/battle/league/score";
import {
  requestSchema,
  type JudgeRequest,
  type JudgeResponse,
  type WorkerMessage,
} from "./protocol";

if (!parentPort) throw new Error("league-judge compute requires a worker thread");
parentPort.on("message", (input: JudgeRequest) => {
  const envelope = {
    protocol: LEAGUE_JUDGE_PROTOCOL,
    requestId: input.requestId,
    engineVersion: JUDGE_ENGINE_VERSION,
  } as const;
  let advances: number | undefined;
  let outcome: string | undefined;
  let result: JudgeResponse;
  let errorClass: string | undefined;
  try {
    const validated = requestSchema.safeParse(input);
    if (!validated.success)
      result = { ...envelope, ok: false, code: "INVALID_REQUEST", detail: null };
    else if (input.engineVersion !== JUDGE_ENGINE_VERSION)
      result = { ...envelope, ok: false, code: "ENGINE_VERSION_MISMATCH", detail: null };
    else {
      const op = validated.data.op;
      if (op.kind === "mint" || op.kind === "check-party") {
        const data = getLeagueGrowthData();
        if (!data) throw new LeaguePlausibilityError(["DATA_UNAVAILABLE"]);
        result = {
          ...envelope,
          ok: true,
          data: op.kind === "mint" ? mintLeagueMon(op, data) : checkLeagueParty(op, data),
        };
      } else if (op.kind === "prepare-badge")
        result = { ...envelope, ok: true, data: prepareBadge(op) };
      else if (op.kind === "judge-badge") result = { ...envelope, ok: true, data: judgeBadge(op) };
      else if (op.kind === "season-roster")
        result = { ...envelope, ok: true, data: seasonRoster() };
      else if (op.kind === "prepare-entry")
        result = {
          ...envelope,
          ok: true,
          data: prepareEntry(op.claim, op.mons, weakenOpponents(op.opponents)),
        };
      else {
        const p = replayLeagueMatch(
          {
            seed: op.seed,
            challenger: op.carryParty,
            opponent: op.opponent,
            leadSlot: op.leadSlot,
            rules: LEAGUE_MATCH_RULES,
          },
          op.inputs,
        );
        advances = p.advances;
        outcome = p.outcome!;
        const data: LeagueJudgeMatchResult = { measure: measureLeagueMatch(p) };
        if (p.outcome === "won" && op.matchIndex < 4) {
          data.carryParty = recoverBetweenMatches(p, op.leadSlot);
          data.carryHash = leagueHash(data.carryParty);
        } else if (p.outcome === "won") {
          const q = [...op.previousQ, data.measure.q];
          const final = scoreAttempt(q.map(value => Fraction.fromJSON(value)));
          data.final = { score: final.score, detail: { q, total: final.total.toJSON() } };
        }
        result = { ...envelope, ok: true, data };
      }
    }
  } catch (error) {
    errorClass =
      error instanceof LeaguePartyError
        ? "LeaguePartyError"
        : error instanceof LeagueInputError
          ? "LeagueInputError"
          : error instanceof LeaguePlausibilityError
            ? "LeaguePlausibilityError"
            : error instanceof Error &&
                ["Error", "TypeError", "RangeError", "SyntaxError", "LeagueRosterError"].includes(
                  error.name,
                )
              ? error.name
              : "UnknownError";
    let code: LeagueJudgeErrorCode = "ENGINE_STALL";
    let detail: unknown = null;
    if (error instanceof LeaguePartyError) {
      code = "PARTY_INVALID";
      detail = { reason: error.reason, slotIndex: error.slotIndex };
    } else if (error instanceof LeagueInputError) {
      code = error.kind;
      detail = { at: error.at };
    } else if (error instanceof LeaguePlausibilityError) {
      code =
        error.reasons.includes("NOT_IMPLEMENTED") || error.reasons.includes("DATA_UNAVAILABLE")
          ? "PARTY_CHECK_UNAVAILABLE"
          : "PARTY_IMPLAUSIBLE";
      detail = { reasons: error.reasons };
    } else if (
      error instanceof Error &&
      (error.message === "ROSTER_NOT_READY" || error.message === "ROSTER_SOURCE_INVALID")
    )
      code = error.message;
    if (error instanceof Error && error.name === "LeagueRosterError")
      code = "ROSTER_SOURCE_INVALID";
    result = { ...envelope, ok: false, code, detail };
  }
  parentPort!.postMessage({ result, advances, outcome, errorClass } satisfies WorkerMessage);
});
void loadGrowthData().then(() =>
  parentPort!.postMessage({
    ready: true,
    engineVersion: JUDGE_ENGINE_VERSION,
  } satisfies WorkerMessage),
);
