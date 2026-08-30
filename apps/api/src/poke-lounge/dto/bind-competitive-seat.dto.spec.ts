import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { BindCompetitiveSeatDto } from './bind-competitive-seat.dto';

describe('BindCompetitiveSeatDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  it('accepts only sessionId and rejects forged account or player identity', async () => {
    await expect(transform({ sessionId: 'session-a' })).resolves.toEqual({
      sessionId: 'session-a',
    });
    await expectForbiddenProperty(
      { sessionId: 'session-a', userId: 'forged' },
      'userId',
    );
    await expectForbiddenProperty(
      { sessionId: 'session-a', playerId: 'forged' },
      'playerId',
    );
  });

  function transform(value: unknown) {
    return pipe.transform(value, {
      type: 'body',
      metatype: BindCompetitiveSeatDto,
    });
  }

  async function expectForbiddenProperty(value: unknown, property: string) {
    try {
      await transform(value);
      throw new Error('Expected validation to reject the extra property');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse() as {
        message?: unknown;
      };
      expect(Array.isArray(response.message)).toBe(true);
      expect(response.message).toContain(
        `property ${property} should not exist`,
      );
    }
  }
});
