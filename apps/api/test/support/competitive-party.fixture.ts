import { createInitialBattleState } from '@poke-lounge/battle/ruleset';
import {
  normalizeCompetitiveParty,
  type CompetitivePartyInput,
  type NormalizedCompetitiveParty,
} from '@poke-lounge/battle/competitive-party';
import { type CanonicalBattleState } from '@poke-lounge/battle/canonical-state';
import type { PokeLoungePartySnapshot } from '../../src/poke-lounge/poke-lounge-room.types';

const TEST_INDIVIDUAL_VALUES = {
  hp: 31,
  attack: 31,
  defense: 31,
  specialAttack: 31,
  specialDefense: 31,
  speed: 31,
};

export function createTestCompetitivePartyInput(
  input: {
    speciesId?: number;
    level?: number;
    slotIndex?: number;
    moveIds?: number[];
  } = {},
): CompetitivePartyInput {
  const normalized = createTestCompetitiveParty(input);
  return {
    version: 2,
    activeSlotIndex: normalized.activeSlotIndex,
    members: normalized.members.map(function mapItem(member) {
      return {
        slotIndex: member.slotIndex,
        speciesId: member.speciesId,
        level: member.level,
        currentHp: member.currentHp,
        status: member.status,
        individualValues: { ...member.individualValues },
        moves: member.moves.map(function mapItem(move) {
          return { ...move };
        }),
      };
    }),
  };
}

export function createTestCompetitiveParty(
  input: {
    speciesId?: number;
    level?: number;
    slotIndex?: number;
    moveIds?: number[];
  } = {},
): NormalizedCompetitiveParty {
  const slotIndex = input.slotIndex ?? 0;
  const normalized = normalizeCompetitiveParty({
    version: 2,
    activeSlotIndex: slotIndex,
    members: [
      {
        slotIndex,
        speciesId: input.speciesId ?? 7,
        level: input.level ?? 11,
        currentHp: 1,
        status: 'normal',
        individualValues: TEST_INDIVIDUAL_VALUES,
        moves: (input.moveIds ?? [55]).map(function mapItem(moveId) {
          return {
            moveId,
            pp: 1,
          };
        }),
      },
    ],
  });

  return {
    ...normalized,
    members: normalized.members.map(function mapItem(member) {
      return {
        ...member,
        currentHp: member.maxHp,
      };
    }),
  };
}

export function createTestPartySnapshot(
  playerId: string,
  input: Parameters<typeof createTestCompetitiveParty>[0] = {},
): PokeLoungePartySnapshot {
  return {
    version: 2,
    playerId,
    competitiveParty: createTestCompetitiveParty(input),
    updatedAtMs: 1,
  };
}

export function createTestPartySnapshots(
  playerIds: readonly string[],
): Record<string, PokeLoungePartySnapshot> {
  return Object.fromEntries(
    playerIds.map(function mapItem(playerId) {
      return [playerId, createTestPartySnapshot(playerId)];
    }),
  );
}

export function createTestInitialBattleState(
  participantIds: readonly [string, string],
): CanonicalBattleState {
  return createInitialBattleState([
    { playerId: participantIds[0], party: createTestCompetitiveParty() },
    { playerId: participantIds[1], party: createTestCompetitiveParty() },
  ]);
}
