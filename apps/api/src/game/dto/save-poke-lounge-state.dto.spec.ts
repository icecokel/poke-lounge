import { validate } from 'class-validator';
import { SavePokeLoungeStateDto } from './save-poke-lounge-state.dto';

const validateDto = (payload: Partial<SavePokeLoungeStateDto>) => {
  const dto = Object.assign(new SavePokeLoungeStateDto(), payload);
  return validate(dto);
};

describe('SavePokeLoungeStateDto', () => {
  it('Poke Lounge 상태 객체와 클라이언트 갱신 시각을 허용해야 함', async () => {
    const errors = await validateDto({
      state: {
        trainer: { x: 12, y: 3 },
        party: ['pikachu', 'eevee'],
      },
      expectedRevision: 3,
      clientUpdatedAt: '2026-07-08T12:00:00.000Z',
    });

    expect(errors).toHaveLength(0);
  });

  it('state가 없으면 거절해야 함', async () => {
    const errors = await validateDto({
      expectedRevision: 0,
      clientUpdatedAt: '2026-07-08T12:00:00.000Z',
    });

    expect(errors[0]?.property).toBe('state');
    expect(errors[0]?.constraints).toHaveProperty('isObject');
  });

  it('state 배열은 거절해야 함', async () => {
    const errors = await validateDto({
      state: ['pikachu'] as unknown as Record<string, unknown>,
      expectedRevision: 0,
    });

    expect(errors[0]?.property).toBe('state');
    expect(errors[0]?.constraints).toHaveProperty('isObject');
  });

  it('clientUpdatedAt이 ISO 날짜 문자열이 아니면 거절해야 함', async () => {
    const errors = await validateDto({
      state: {
        room: 'LOUNGE',
      },
      expectedRevision: 0,
      clientUpdatedAt: 'not-a-date',
    });

    expect(errors[0]?.property).toBe('clientUpdatedAt');
    expect(errors[0]?.constraints).toHaveProperty('isDateString');
  });

  it.each([-1, 1.5])(
    'expectedRevision %s는 non-negative integer가 아니므로 거절해야 함',
    async (expectedRevision) => {
      const errors = await validateDto({
        state: { room: 'LOUNGE' },
        expectedRevision,
      });

      expect(
        errors.some((error) => error.property === 'expectedRevision'),
      ).toBe(true);
    },
  );

  it('API 선배포 중 구버전 Web 요청은 expectedRevision 없이 허용해야 함', async () => {
    const errors = await validateDto({ state: { room: 'LOUNGE' } });

    expect(errors).toHaveLength(0);
  });

  it('expectedRevision null은 호환용 생략으로 처리하지 않아야 함', async () => {
    const errors = await validateDto({
      state: { room: 'LOUNGE' },
      expectedRevision: null as unknown as number,
    });

    expect(errors.some((error) => error.property === 'expectedRevision')).toBe(
      true,
    );
  });
});
