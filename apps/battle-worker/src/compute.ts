import { parentPort } from "node:worker_threads";
import { z } from "zod";
import {
  hashCanonicalState,
  createCanonicalIdRecord,
  type CanonicalBattleState,
} from "@poke-lounge/battle/canonical-state";
import { createInitialBattleState } from "@poke-lounge/battle/ruleset";
import { initializeGen4Canonical } from "@poke-lounge/battle/gen4/canonical";
import { createSeededRandom } from "@poke-lounge/battle/prng";
import { validateCompetitiveAction, resolveTurn } from "@poke-lounge/battle/resolve-turn";
import { getCompetitiveActionPlayerIds } from "@poke-lounge/battle/actions";
import {
  normalizeCompetitiveParty,
  restoreCompetitiveParty,
} from "@poke-lounge/battle/competitive-party";
import { chooseAiCompetitiveAction, createAiStarterParty } from "@poke-lounge/battle/ai-policy";
import {
  createAiAdventure,
  advanceAiAdventure,
  aiCompetitiveParty,
  type AiAdventureState,
} from "@poke-lounge/battle/adventure/ai-world";
import { getRoundStartPosition } from "@poke-lounge/battle/round-start";
import { getTournamentGatherPosition } from "@poke-lounge/battle/tournament-gathering";
import { sharesPartyExperience, getPartyExperienceRatio } from "@poke-lounge/battle/round-settings";
import {
  requestSchema,
  partySchema,
  actionSchema,
  ENGINE_VERSION,
  type ComputeRequest,
  type ComputeResponse,
} from "./protocol";
import { getContext } from "./runtime-data";

function state(value: unknown): CanonicalBattleState {
  const parsed = z
    .object({
      rulesetVersion: z.literal(3),
      turn: z.number().int().nonnegative(),
      participantIds: z.array(z.string()).length(2),
      playersById: z.record(z.string(), z.unknown()),
    })
    .parse(value);
  if (parsed.participantIds[0] === parsed.participantIds[1])
    throw new Error("Duplicate participants");
  return value as CanonicalBattleState;
}
function project(value: CanonicalBattleState) {
  return {
    rulesetVersion: value.rulesetVersion,
    turn: value.turn,
    participantIds: value.participantIds,
    playersById: Object.fromEntries(
      value.participantIds.map(playerId => {
        const player = value.playersById[playerId]!;
        return [
          playerId,
          {
            playerId,
            activeSlotIndex: player.activeSlotIndex,
            ...(player.actionRequest
              ? { actionRequest: structuredClone(player.actionRequest) }
              : {}),
            team: player.team.map(member => ({
              speciesId: member.speciesId,
              slotIndex: member.slotIndex,
              level: member.level,
              maxHp: member.maxHp,
              currentHp: member.currentHp,
              status: member.status,
              statStages: member.statStages,
              moves: member.moves.map(({ moveId, pp }) => ({ moveId, pp })),
            })),
          },
        ];
      }),
    ),
    terminal: value.terminal,
    ...(value.lastTurnPresentation ? { lastTurnPresentation: value.lastTurnPresentation } : {}),
  };
}
function pack(value: CanonicalBattleState) {
  return {
    state: value,
    publicState: project(value),
    stateHash: hashCanonicalState(value),
    requiredPlayerIds: value.terminal ? [] : getCompetitiveActionPlayerIds(value),
  };
}
async function calculate(input: ComputeRequest): Promise<unknown> {
  const op = input.operation;
  switch (op.kind) {
    case "normalize-party": {
      const party = normalizeCompetitiveParty(partySchema.parse(op.party));
      return op.restore ? restoreCompetitiveParty(party) : party;
    }
    case "initial-party": {
      const random = createSeededRandom(op.seed);
      return createAiStarterParty(() => random.next());
    }
    case "initialize": {
      const players = op.players.map(p => ({
        playerId: p.playerId,
        party: restoreCompetitiveParty(normalizeCompetitiveParty(partySchema.parse(p.party))),
      }));
      const draft = createInitialBattleState([players[0]!, players[1]!]);
      return pack(initializeGen4Canonical(draft, createSeededRandom(`${op.seed}:initial`)));
    }
    case "validate": {
      validateCompetitiveAction({
        state: state(op.state),
        playerId: op.playerId,
        action: actionSchema.parse(op.action),
      });
      return { valid: true };
    }
    case "resolve": {
      const current = state(op.state);
      const actions = Object.entries(op.actions).map(
        ([key, value]) => [key, actionSchema.parse(value)] as const,
      );
      const result = resolveTurn({
        state: current,
        actionsByPlayerId: createCanonicalIdRecord(actions),
        random: createSeededRandom(`${op.seed}:${current.turn}`),
      });
      return pack(result.state);
    }
    case "choose-ai": {
      const current = state(op.state);
      const random = createSeededRandom(op.seed);
      const action = chooseAiCompetitiveAction(current, op.playerId, {
        difficulty: op.difficulty,
        random: () => random.next(),
      });
      validateCompetitiveAction({ state: current, playerId: op.playerId, action });
      return action;
    }
    case "forfeit": {
      const current = structuredClone(state(op.state));
      const winner = current.participantIds.find(id => id !== op.loserPlayerId);
      if (!winner || !current.participantIds.includes(op.loserPlayerId))
        throw new Error("Invalid forfeiting player");
      current.terminal = {
        winnerPlayerId: winner,
        loserPlayerId: op.loserPlayerId,
        reason: "forfeit",
        scoreByPlayerId: createCanonicalIdRecord([
          [winner, 100],
          [op.loserPlayerId, 50],
        ]),
      };
      return pack(current);
    }
    case "ai-step": {
      const context = {
        ...(await getContext()),
        sharePartyExperience: sharesPartyExperience(op.roundDurationMs),
        partyExperienceRatio: getPartyExperienceRatio(op.roundDurationMs),
      };
      const adventure = op.adventure
        ? (structuredClone(op.adventure) as AiAdventureState)
        : createAiAdventure(
            normalizeCompetitiveParty(partySchema.parse(op.party)),
            op.nowMs,
            context,
          );
      if (op.starting || (!op.adventure && op.roundIndex === 1)) {
        const position = getRoundStartPosition(op.playerId, op.playerIds);
        adventure.position = { x: position.x, y: position.y };
        adventure.facing = position.facing;
        adventure.path = [];
        adventure.battle = null;
        adventure.activity = "idle";
        adventure.updatedAtMs = op.nowMs;
        adventure.readyAtMs = op.startAtMs ?? op.nowMs;
      }
      if (!op.starting) {
        const random = createSeededRandom(op.seed);
        advanceAiAdventure(
          adventure,
          op.nowMs,
          op.roundIndex,
          op.preparing,
          context,
          () => random.next(),
          op.difficulty,
        );
      }
      if (op.gathering) {
        const position = getTournamentGatherPosition(op.playerId, op.playerIds);
        adventure.position = { x: position.x, y: position.y };
        adventure.facing = position.facing;
        adventure.path = [];
        adventure.battle = null;
      }
      return { adventure, party: aiCompetitiveParty(adventure) };
    }
  }
}

async function run(raw: unknown): Promise<ComputeResponse> {
  const input = requestSchema.parse(raw);
  const identity = {
    protocolVersion: 1 as const,
    requestId: input.requestId,
    roomInstanceId: input.roomInstanceId,
    stateRevision: input.stateRevision,
    engineVersion: ENGINE_VERSION,
  };
  try {
    return { ...identity, ok: true, data: await calculate(input) };
  } catch (error) {
    const invalid =
      error instanceof z.ZodError ||
      input.operation.kind === "validate" ||
      input.operation.kind === "normalize-party";
    return { ...identity, ok: false, code: invalid ? "INVALID_INPUT" : "COMPUTE_FAILED" };
  }
}

// Workers own no database connection, room registry, queue or authoritative state.
void getContext()
  .then(() => parentPort?.postMessage({ ready: true, engineVersion: ENGINE_VERSION }))
  .catch(() => {
    process.stderr.write(JSON.stringify({ event: "compute.assets_invalid" }) + "\n");
    process.exit(1);
  });
parentPort?.on("message", (input: unknown) => {
  void run(input)
    .then(result => parentPort?.postMessage(result))
    .catch(() => parentPort?.postMessage({ protocolError: true }));
});
