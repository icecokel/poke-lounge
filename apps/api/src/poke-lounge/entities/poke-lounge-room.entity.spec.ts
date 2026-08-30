import { pokeLoungeRevisionTransformer } from './poke-lounge-room.entity';

describe('pokeLoungeRevisionTransformer', () => {
  it('round-trips safe integer revisions through PostgreSQL bigint strings', () => {
    expect(pokeLoungeRevisionTransformer.to(Number.MAX_SAFE_INTEGER)).toBe(
      String(Number.MAX_SAFE_INTEGER),
    );
    expect(pokeLoungeRevisionTransformer.from('42')).toBe(42);
  });

  it.each(['9007199254740992', '1.5', Number.POSITIVE_INFINITY])(
    'rejects an unsafe bigint revision value: %s',
    (value) => {
      expect(() => pokeLoungeRevisionTransformer.from(value)).toThrow(
        'Poke Lounge revision is outside the safe integer range',
      );
    },
  );
});
