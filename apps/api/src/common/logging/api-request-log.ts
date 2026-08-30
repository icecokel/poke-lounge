import type { Request } from 'express';
import type { RequestWithRequestId } from '../middleware/request-id.middleware';

export type ApiRequestLog = {
  event: 'api.request';
  requestId: string;
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
};

type RoutedRequest = Omit<RequestWithRequestId, 'route'> & {
  route?: { path?: string | string[] };
};

const getRoute = (request: RoutedRequest): string => {
  const routePath = request.route?.path;

  if (typeof routePath === 'string') {
    return `${request.baseUrl}${routePath}`;
  }

  return 'unmatched';
};

const getDurationMs = (
  request: Pick<RequestWithRequestId, 'requestStartedAt'>,
): number => {
  if (!request.requestStartedAt) {
    return 0;
  }

  return Number(process.hrtime.bigint() - request.requestStartedAt) / 1_000_000;
};

export const createApiRequestLog = (
  request: Request,
  statusCode: number,
): ApiRequestLog => {
  const requestWithContext = request as unknown as RoutedRequest;

  return {
    event: 'api.request',
    requestId: requestWithContext.requestId ?? 'missing',
    method: request.method,
    route: getRoute(requestWithContext),
    statusCode,
    durationMs: Number(getDurationMs(requestWithContext).toFixed(3)),
  };
};
