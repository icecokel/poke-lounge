import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { COMPETITIVE_STRUGGLE_MOVE_ID } from '@poke-lounge/battle/competitive-ruleset-config';
import {
  SubmitCompetitiveActionDto,
  SubmitSessionCompetitiveActionDto,
} from './submit-competitive-action.dto';

describe('SubmitCompetitiveActionDto', function testSuite() {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  it.each([
    { kind: 'move', moveId: 55 },
    { kind: 'move', moveId: COMPETITIVE_STRUGGLE_MOVE_ID },
    { kind: 'switch', slotIndex: 1 },
  ])('accepts a strict legal action shape', async function callback(action) {
    await expect(transform(validBody(action))).resolves.toMatchObject({
      assignmentRevision: 1,
      turn: 0,
      clientCommandId: '00000000-0000-4000-8000-000000000001',
      action,
    });
  });

  it.each([
    'winnerPlayerId',
    'loserPlayerId',
    'score',
    'seed',
    'currentHp',
    'elapsedTime',
    'reason',
    'playerId',
    'userId',
    'actor',
    'nowMs',
  ])(
    'rejects forbidden client authority field %s',
    async function callback(field) {
      await expectForbidden({ ...validBody(), [field]: 'forged' }, field);
    },
  );

  it('rejects unsafe turns, non-v4 command ids, and mixed action variants', async function testCase() {
    await expect(transform(validBody(undefined, { turn: -1 }))).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      transform(
        validBody(undefined, {
          assignmentRevision: Number.MAX_SAFE_INTEGER + 1,
        }),
      ),
    ).rejects.toThrow(BadRequestException);
    await expect(
      transform(
        validBody(undefined, {
          clientCommandId: '00000000-0000-3000-8000-000000000001',
        }),
      ),
    ).rejects.toThrow(BadRequestException);
    await expect(
      transform(validBody({ kind: 'move', moveId: 55, slotIndex: 1 })),
    ).rejects.toThrow(BadRequestException);
    await expect(transform(validBody({ kind: 'run' }))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('requires a bounded non-blank session identity for password rooms', async function testCase() {
    await expect(
      pipe.transform(
        { ...validBody(), sessionId: 'session-a' },
        {
          type: 'body',
          metatype: SubmitSessionCompetitiveActionDto,
        },
      ),
    ).resolves.toMatchObject({ sessionId: 'session-a' });
    await expect(
      pipe.transform(
        { ...validBody(), sessionId: ' '.repeat(257) },
        {
          type: 'body',
          metatype: SubmitSessionCompetitiveActionDto,
        },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  function validBody(
    action: Record<string, unknown> = {
      kind: 'move',
      moveId: 55,
    },
    overrides: Record<string, unknown> = {},
  ) {
    return {
      assignmentRevision: 1,
      turn: 0,
      clientCommandId: '00000000-0000-4000-8000-000000000001',
      action,
      ...overrides,
    };
  }

  function transform(value: unknown) {
    return pipe.transform(value, {
      type: 'body',
      metatype: SubmitCompetitiveActionDto,
    });
  }

  async function expectForbidden(value: unknown, property: string) {
    try {
      await transform(value);
      throw new Error('Expected validation to reject the extra property');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse() as {
        message?: unknown;
      };
      expect(response.message).toContain(
        `property ${property} should not exist`,
      );
    }
  }
});
