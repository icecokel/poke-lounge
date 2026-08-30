import { isLocalTestAccountRequestAllowed } from './local-test-account';

describe('local test account request allowlist', () => {
  it.each([
    { method: 'GET', path: '/game/poke-lounge/state' },
    { method: 'PUT', path: '/api/game/poke-lounge/state' },
    {
      body: { gameType: 'POKE_LOUNGE', score: 10 },
      method: 'POST',
      path: '/game/result',
    },
  ])(
    '싱글 상태와 Poke Lounge 결과 요청만 허용한다: $method $path',
    (request) => {
      expect(isLocalTestAccountRequestAllowed(request)).toBe(true);
    },
  );

  it.each([
    { method: 'POST', path: '/game/poke-lounge/state' },
    { method: 'DELETE', path: '/game/poke-lounge/state' },
    { method: 'GET', path: '/game/result' },
    {
      body: { gameType: 'SKY_DROP', score: 10 },
      method: 'POST',
      path: '/game/result',
    },
    {
      method: 'POST',
      path: '/poke-lounge/rooms/ABC123/competitive-seat',
    },
  ])(
    '멀티플레이와 허용되지 않은 메서드를 거부한다: $method $path',
    (request) => {
      expect(isLocalTestAccountRequestAllowed(request)).toBe(false);
    },
  );
});
