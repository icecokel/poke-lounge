import {
  BadRequestException,
  Logger,
  type ArgumentsHost,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  it('구조화된 예외 응답을 보존하고 로그에서는 사용자 입력을 제외한다', () => {
    const request = {
      method: 'POST',
      url: '/poke-lounge/rooms?question=person@example.com',
      baseUrl: '/poke-lounge',
      route: { path: '/rooms' },
      requestId: 'a5fa93a9-5f91-44f0-9f6e-02e4360a1594',
      requestStartedAt: process.hrtime.bigint(),
      query: { question: 'person@example.com' },
      body: { question: 'person@example.com' },
    } as unknown as Request;
    const status = jest.fn().mockReturnThis();
    let responseBody: unknown;
    const json = jest.fn((body: unknown) => {
      responseBody = body;
    });
    const response = { status, json } as unknown as Response;
    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as ArgumentsHost;
    let logMessage: unknown;
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation((message: unknown) => {
        logMessage = message;
      });

    new HttpExceptionFilter().catch(
      new BadRequestException({
        code: 'STRUCTURED_ERROR',
        message: 'Invalid question',
        snapshot: { revision: 7 },
        success: true,
        statusCode: 418,
        timestamp: 'forged-timestamp',
        path: '/forged-path',
      }),
      host,
    );

    expect(logMessage).not.toContain('person@example.com');
    expect(JSON.parse(String(logMessage))).toMatchObject({
      event: 'api.error',
      requestId: 'a5fa93a9-5f91-44f0-9f6e-02e4360a1594',
      method: 'POST',
      route: '/poke-lounge/rooms',
      statusCode: 400,
    });
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'STRUCTURED_ERROR',
        message: 'Invalid question',
        snapshot: { revision: 7 },
        success: false,
        statusCode: 400,
        path: '/poke-lounge/rooms?question=person@example.com',
      }),
    );
    expect(responseBody).not.toEqual(
      expect.objectContaining({ timestamp: 'forged-timestamp' }),
    );
    warnSpy.mockRestore();
  });
});
