import { createDefaultBattleStatStages } from "./battle-stat-stages";
import {
  createCanonicalIdRecord,
  type CanonicalBattleState,
  type CanonicalPlayerState,
} from "./canonical-state";
import type { NormalizedCompetitiveParty } from "./competitive-party";
import {
  COMPETITIVE_RULESET_VERSION,
  getCompetitiveMoveDefinition as getMoveDefinition,
  type CompetitiveResolvedMoveDefinition,
} from "./ruleset-contract";

export {
  APPROVED_COMPETITIVE_RULESET_V2,
  canUseCompetitiveStruggle,
  COMPETITIVE_CATALOG_HASH,
  COMPETITIVE_RULESET_HASH,
  COMPETITIVE_RULESET_V2,
  COMPETITIVE_STRUGGLE_MOVE_ID,
  COMPETITIVE_RULESET_VERSION,
  type CompetitiveResolvedMoveDefinition,
  type CompetitiveStruggleDefinition,
} from "./ruleset-contract";

export interface CompetitiveBattleParticipantInput {
  playerId: string;
  party: NormalizedCompetitiveParty;
}

export function getCompetitiveMoveDefinition(
  moveId: number | "struggle",
): CompetitiveResolvedMoveDefinition | undefined {
  return getMoveDefinition(moveId);
}

export function createInitialBattleState(
  participants: readonly [CompetitiveBattleParticipantInput, CompetitiveBattleParticipantInput],
): CanonicalBattleState {
  if (participants.some(participant => participant.playerId.trim().length === 0)) {
    throw new Error("Initial-state participant IDs must be non-empty");
  }
  if (participants[0].playerId === participants[1].playerId) {
    throw new Error("Initial-state participant IDs must be distinct");
  }

  const canonicalParticipants = [...participants].sort((left, right) =>
    left.playerId.localeCompare(right.playerId),
  ) as [CompetitiveBattleParticipantInput, CompetitiveBattleParticipantInput];
  const participantIds = canonicalParticipants.map(participant => participant.playerId) as [
    string,
    string,
  ];
  const playersById = createCanonicalIdRecord<CanonicalPlayerState>(
    canonicalParticipants.map(participant => [
      participant.playerId,
      createCanonicalPlayerState(participant),
    ]),
  );

  return {
    rulesetVersion: COMPETITIVE_RULESET_VERSION,
    turn: 0,
    participantIds,
    playersById,
    terminal: null,
  };
}

function createCanonicalPlayerState(
  participant: CompetitiveBattleParticipantInput,
): CanonicalPlayerState {
  const { party, playerId } = participant;
  const active = party.members.find(member => member.slotIndex === party.activeSlotIndex);
  if (!active || active.currentHp === 0) {
    throw new Error("Competitive assignment requires a battle-ready active party member");
  }

  return {
    playerId,
    activeSlotIndex: party.activeSlotIndex,
    team: [...party.members]
      .sort((left, right) => left.slotIndex - right.slotIndex)
      .map(member => ({
        slotIndex: member.slotIndex,
        speciesId: member.speciesId,
        level: member.level,
        maxHp: member.maxHp,
        currentHp: member.currentHp,
        attack: member.attack,
        defense: member.defense,
        specialAttack: member.specialAttack,
        specialDefense: member.specialDefense,
        speed: member.speed,
        typeIds: member.typeIds,
        statStages: createDefaultBattleStatStages(),
        status: member.status,
        moves: member.moves.map(move => ({ ...move })),
      })),
  };
}
