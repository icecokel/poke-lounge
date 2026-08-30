import { Logger } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import {
  requestIdMiddleware,
  type RequestWithRequestId,
} from './request-id.middleware';

type TestResponse = {
  response: Response;
  setHeader: jest.Mock;
  once: jest.Mock;
  getFinishListener: () => (() => void) | undefined;
};

const createRequest = (
  headers: Record<string, string> = {},
): RequestWithRequestId => ({ headers }) as RequestWithRequestId;

const createResponse = (): TestResponse => {
  const setHeader = jest.fn();
  let finishListener: (() => void) | undefined;
  const once = jest.fn((event: string, listener: () => void) => {
    if (event === 'finish') {
      finishListener = listener;
    }
  });

  return {
    response: { setHeader, once } as unknown as Response,
    setHeader,
    once,
    getFinishListener: () => finishListener,
  };
};

describe('requestIdMiddleware', () => {
  it('유효한 요청 ID를 응답 헤더와 로그 컨텍스트에 전파한다', () => {
    const requestId = 'a5fa93a9-5f91-44f0-9f6e-02e4360a1594';
    const request = createRequest({ 'x-request-id': requestId });
    const testResponse = createResponse();
    const next: NextFunction = jest.fn();

    requestIdMiddleware(request, testResponse.response, next);

    expect(request.requestId).toBe(requestId);
    expect(typeof request.requestStartedAt).toBe('bigint');
    expect(testResponse.setHeader).toHaveBeenCalledWith(
      'X-Request-Id',
      requestId,
    );
    expect(testResponse.once).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('유효하지 않은 요청 ID 대신 새 UUID를 생성한다', () => {
    const request = createRequest({ 'x-request-id': 'untrusted-value' });
    const testResponse = createResponse();

    requestIdMiddleware(request, testResponse.response, jest.fn());

    expect(request.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(testResponse.setHeader).toHaveBeenCalledWith(
      'X-Request-Id',
      request.requestId,
    );
  });

  it('응답 완료 시 구조화된 access log를 기록한다', () => {
    const request = createRequest();
    Object.assign(request, {
      method: 'GET',
      baseUrl: '/health',
      route: { path: '' },
    });
    const testResponse = createResponse();
    Object.assign(testResponse.response, { statusCode: 200 });
    let logMessage: unknown;
    const logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation((message: unknown) => {
        logMessage = message;
      });

    requestIdMiddleware(request, testResponse.response, jest.fn());

    testResponse.getFinishListener()?.();

    const log: unknown = JSON.parse(String(logMessage));
    expect(log).toMatchObject({
      event: 'api.request',
      requestId: request.requestId,
      method: 'GET',
      route: '/health',
      statusCode: 200,
    });
    const durationMs = (log as Record<string, unknown>).durationMs;
    expect(typeof durationMs).toBe('number');
    logSpy.mockRestore();
  });
});
