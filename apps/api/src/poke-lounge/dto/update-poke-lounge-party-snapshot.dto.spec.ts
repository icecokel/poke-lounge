import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { UpdatePokeLoungePartySnapshotDto } from './update-poke-lounge-party-snapshot.dto';

describe('UpdatePokeLoungePartySnapshotDto', function testSuite() {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  it('accepts only the minimal V2 grown-party input', async function testCase() {
    await expect(transform(validBody())).resolves.toMatchObject(validBody());
  });

  it.each(['name', 'maxHp', 'attack', 'defense', 'typeIds'])(
    'rejects client-derived member field %s',
    async function callback(field) {
      const body = validBody();
      Object.assign(body.competitiveParty.members[0], { [field]: 'forged' });

      await expectForbidden(body, field);
    },
  );

  it.each(['name', 'power', 'accuracy', 'maxPp'])(
    'rejects client-derived move field %s',
    async function callback(field) {
      const body = validBody();
      Object.assign(body.competitiveParty.members[0].moves[0], {
        [field]: 'forged',
      });

      await expectForbidden(body, field);
    },
  );

  it('rejects a legacy snapshot version', async function testCase() {
    const body = validBody();
    Object.assign(body.competitiveParty, { version: 1 });

    await expect(transform(body)).rejects.toThrow(BadRequestException);
  });

  function validBody() {
    return {
      playerId: 'player-a',
      sessionId: 'session-a',
      displayName: 'Player A',
      competitiveParty: {
        version: 2,
        activeSlotIndex: 0,
        members: [
          {
            slotIndex: 0,
            speciesId: 7,
            level: 11,
            currentHp: 34,
            status: 'normal',
            individualValues: {
              hp: 31,
              attack: 31,
              defense: 31,
              specialAttack: 31,
              specialDefense: 31,
              speed: 31,
            },
            moves: [{ moveId: 55, pp: 25 }],
          },
        ],
      },
    };
  }

  function transform(value: unknown) {
    return pipe.transform(value, {
      type: 'body',
      metatype: UpdatePokeLoungePartySnapshotDto,
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
      expect(response.message).toEqual(
        expect.arrayContaining([
          expect.stringContaining(`property ${property} should not exist`),
        ]),
      );
    }
  }
});
