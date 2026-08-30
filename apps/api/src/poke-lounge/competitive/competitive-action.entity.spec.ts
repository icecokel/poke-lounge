import { getMetadataArgsStorage } from 'typeorm';
import { PokeLoungeCompetitiveAction } from './competitive-action.entity';
import type { CompetitiveActionProjection } from './competitive-action.types';

describe('PokeLoungeCompetitiveAction', () => {
  it.each([
    'actorAccountId',
    'action',
    'canonicalAction',
    'requestHash',
    'response',
  ])('does not select private receipt field %s by default', (propertyName) => {
    const column = getMetadataArgsStorage().columns.find(
      (candidate) =>
        candidate.target === PokeLoungeCompetitiveAction &&
        candidate.propertyName === propertyName,
    );
    expect(column?.options.select).toBe(false);
  });

  it('stores additive terminal metadata inside the durable JSONB response', () => {
    const responseColumn = getMetadataArgsStorage().columns.find(
      (candidate) =>
        candidate.target === PokeLoungeCompetitiveAction &&
        candidate.propertyName === 'response',
    );
    const receipt = new PokeLoungeCompetitiveAction();
    receipt.response = {
      matchId: '00000000-0000-4000-8000-000000000001',
      status: 'completed',
      terminalEventId: '00000000-0000-4000-8000-000000000050',
      terminalRoomRevision: 50,
    } as unknown as CompetitiveActionProjection;

    expect(responseColumn?.options).toMatchObject({
      name: 'response',
      type: 'jsonb',
      select: false,
    });
    expect(structuredClone(receipt.response)).toMatchObject({
      terminalEventId: '00000000-0000-4000-8000-000000000050',
      terminalRoomRevision: 50,
    });
  });

  it('keeps pending metadata null and remains backward-readable for legacy completed receipt JSON', () => {
    const pending = new PokeLoungeCompetitiveAction();
    pending.response = {
      status: 'active',
      terminalEventId: null,
      terminalRoomRevision: null,
    } as unknown as CompetitiveActionProjection;
    const legacyCompleted = new PokeLoungeCompetitiveAction();
    legacyCompleted.response = {
      status: 'completed',
      terminal: { reason: 'faint' },
    } as unknown as CompetitiveActionProjection;

    expect(structuredClone(pending.response)).toMatchObject({
      terminalEventId: null,
      terminalRoomRevision: null,
    });
    expect(Object.hasOwn(legacyCompleted.response, 'terminalEventId')).toBe(
      false,
    );
    expect(
      Object.hasOwn(legacyCompleted.response, 'terminalRoomRevision'),
    ).toBe(false);
  });
});
