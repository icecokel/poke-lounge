import type { Request } from 'express';
import { createApiRequestLog } from './api-request-log';

const expectDurationMs = (log: { durationMs: number }): void => {
  expect(typeof log.durationMs).toBe('number');
  expect(log.durationMs).toBeGreaterThanOrEqual(0);
};

describe('createApiRequestLog', () => {
  it('쿼리와 실제 경로 파라미터 없이 route template 기반 access log를 만든다', () => {
    const request = {
      method: 'GET',
      baseUrl: '/recipes',
      path: '/sensitive-value',
      query: { email: 'person@example.com' },
      route: { path: '/:id' },
      requestId: 'a5fa93a9-5f91-44f0-9f6e-02e4360a1594',
      requestStartedAt: process.hrtime.bigint(),
    } as unknown as Request;

    const log = createApiRequestLog(request, 200);

    expect(log).toMatchObject({
      event: 'api.request',
      requestId: 'a5fa93a9-5f91-44f0-9f6e-02e4360a1594',
      method: 'GET',
      route: '/recipes/:id',
      statusCode: 200,
    });
    expectDurationMs(log);
  });

  it('라우트를 찾을 수 없는 요청은 입력 경로 대신 unmatched로 기록한다', () => {
    const request = {
      method: 'GET',
      path: '/person@example.com',
    } as unknown as Request;

    expect(createApiRequestLog(request, 404)).toEqual({
      event: 'api.request',
      requestId: 'missing',
      method: 'GET',
      route: 'unmatched',
      statusCode: 404,
      durationMs: 0,
    });
  });
});
