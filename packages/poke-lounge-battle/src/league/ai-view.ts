import { chooseAiCompetitiveAction } from "../ai-policy";
import type { CanonicalPlayerState } from "../canonical-state";
import { COMPETITIVE_SPECIES_CATALOG } from "../competitive-catalog.generated";
import type { Gen4Action, Gen4ActionRequest, Gen4Frame, Gen4Party } from "../gen4/types";
import { LEAGUE_AI_DIFFICULTY } from "./contract";

function player(
  playerId: string,
  party: Gen4Party,
  actionRequest: Gen4ActionRequest,
): CanonicalPlayerState {
  return {
    playerId,
    activeSlotIndex: party.activeSlotIndex,
    actionRequest,
    team: party.members.map(member => ({
      ...member,
      maxHp: member.maxHp!,
      currentHp: member.currentHp!,
      attack: member.attack!,
      defense: member.defense!,
      specialAttack: member.specialAttack!,
      specialDefense: member.specialDefense!,
      speed: member.speed!,
      statStages: member.statStages!,
      status: member.status!,
      typeIds: COMPETITIVE_SPECIES_CATALOG[member.speciesId]!.typeIds,
    })),
  };
}

function plainRecord(
  entries: Array<[string, CanonicalPlayerState]>,
): Record<string, CanonicalPlayerState> {
  const record = Object.create(null) as Record<string, CanonicalPlayerState>;
  for (const [key, value] of entries) record[key] = value;
  return record;
}

export function chooseLeagueAiAction(frame: Gen4Frame): Gen4Action | undefined {
  const request = frame.requests[1];
  if (request.kind === "wait" || request.kind === "ended") return undefined;
  return chooseAiCompetitiveAction(
    {
      playersById: plainRecord([
        ["challenger", player("challenger", frame.parties[0], frame.requests[0])],
        ["defender", player("defender", frame.parties[1], request)],
      ]),
    },
    "defender",
    {
      difficulty: LEAGUE_AI_DIFFICULTY,
      random: () => {
        throw new Error("League AI must be deterministic");
      },
    },
  );
}
