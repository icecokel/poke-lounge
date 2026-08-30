import { getMetadataArgsStorage } from 'typeorm';
import {
  nullablePokeLoungeRevisionTransformer,
  PokeLoungeCompetitiveMatch,
} from './poke-lounge-competitive-match.entity';

describe('PokeLoungeCompetitiveMatch', () => {
  it.each([
    'roomId',
    'roomCode',
    'bracketMatchId',
    'kind',
    'assignmentRevision',
    'playerAccounts',
    'rulesetVersion',
    'rulesetHash',
    'serverSeed',
    'initialState',
    'initialStateHash',
  ])(
    'marks assignment field %s immutable for repository updates',
    (propertyName) => {
      const column = getMetadataArgsStorage().columns.find(
        (candidate) =>
          candidate.target === PokeLoungeCompetitiveMatch &&
          candidate.propertyName === propertyName,
      );

      expect(column?.options.update).toBe(false);
    },
  );

  it('allows sequential room matches while keeping bracket and active uniqueness', () => {
    const metadata = getMetadataArgsStorage();
    const roomUnique = metadata.uniques.find(
      (candidate) =>
        candidate.target === PokeLoungeCompetitiveMatch &&
        candidate.name === 'UQ_poke_lounge_competitive_match_room',
    );
    const bracketUnique = metadata.uniques.find(
      (candidate) =>
        candidate.target === PokeLoungeCompetitiveMatch &&
        candidate.name === 'UQ_poke_lounge_competitive_match_room_bracket',
    );
    const activeUnique = metadata.indices.find(
      (candidate) =>
        candidate.target === PokeLoungeCompetitiveMatch &&
        candidate.name === 'UQ_poke_lounge_competitive_match_active_room',
    );

    expect(roomUnique).toBeUndefined();
    expect(bracketUnique).toBeDefined();
    expect(activeUnique).toMatchObject({
      unique: true,
      where: `"status" IN ('pending', 'active')`,
    });
  });

  it.each(['serverSeed', 'initialState', 'currentState', 'terminalResult'])(
    'does not select private field %s by default',
    (propertyName) => {
      const column = getMetadataArgsStorage().columns.find(
        (candidate) =>
          candidate.target === PokeLoungeCompetitiveMatch &&
          candidate.propertyName === propertyName,
      );

      expect(column?.options.select).toBe(false);
    },
  );

  it('maps nullable paired terminal metadata and its partial indexes', () => {
    const metadata = getMetadataArgsStorage();
    const terminalEventId = metadata.columns.find(
      (candidate) =>
        candidate.target === PokeLoungeCompetitiveMatch &&
        candidate.propertyName === 'terminalEventId',
    );
    const terminalRoomRevision = metadata.columns.find(
      (candidate) =>
        candidate.target === PokeLoungeCompetitiveMatch &&
        candidate.propertyName === 'terminalRoomRevision',
    );
    const eventUnique = metadata.indices.find(
      (candidate) =>
        candidate.target === PokeLoungeCompetitiveMatch &&
        candidate.name === 'UQ_poke_lounge_competitive_match_terminal_event',
    );
    const recoveryIndex = metadata.indices.find(
      (candidate) =>
        candidate.target === PokeLoungeCompetitiveMatch &&
        candidate.name ===
          'IDX_poke_lounge_competitive_match_terminal_recovery',
    );
    const pairCheck = metadata.checks.find(
      (candidate) =>
        candidate.target === PokeLoungeCompetitiveMatch &&
        candidate.name ===
          'CHK_poke_lounge_competitive_match_terminal_metadata_pair',
    );

    expect(terminalEventId?.options).toMatchObject({
      name: 'terminal_event_id',
      type: 'uuid',
      nullable: true,
    });
    expect(terminalRoomRevision?.options).toMatchObject({
      name: 'terminal_room_revision',
      type: 'bigint',
      nullable: true,
    });
    expect(eventUnique).toMatchObject({
      unique: true,
      where: '"terminal_event_id" IS NOT NULL',
    });
    expect(recoveryIndex).toMatchObject({
      where:
        '"terminal_event_id" IS NOT NULL AND "terminal_room_revision" IS NOT NULL',
    });
    expect(pairCheck?.expression).toContain(
      '"terminal_event_id" IS NULL AND "terminal_room_revision" IS NULL',
    );
    expect(nullablePokeLoungeRevisionTransformer.to(null)).toBeNull();
    expect(nullablePokeLoungeRevisionTransformer.from(null)).toBeNull();
    expect(nullablePokeLoungeRevisionTransformer.to(50)).toBe('50');
    expect(nullablePokeLoungeRevisionTransformer.from('50')).toBe(50);
  });
});
