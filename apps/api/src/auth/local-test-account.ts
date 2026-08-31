const localTestAuthTokenPattern = /^[A-Za-z0-9_-]{32,128}$/;

export const LOCAL_TEST_ACCOUNT_PROFILE = {
  id: 'poke-lounge-local-test-user',
  email: 'poke-lounge-local-test-user@local.poke-lounge.test',
  firstName: 'Local',
  lastName: 'Tester',
} as const;

export const LOCAL_TEST_API_HOSTNAME = '127.0.0.1';

export interface LocalTestAccountEnvironment {
  NODE_ENV?: string;
  LOCAL_TEST_AUTH_TOKEN?: string;
}

export interface LocalTestAccountRequest {
  body?: unknown;
  method?: string;
  originalUrl?: string;
  path?: string;
}

export function resolveLocalTestAuthToken(
  environment: LocalTestAccountEnvironment = process.env,
): string | null {
  if (environment.NODE_ENV !== 'development') {
    return null;
  }

  const token = environment.LOCAL_TEST_AUTH_TOKEN?.trim();

  if (!token) {
    return null;
  }

  if (!localTestAuthTokenPattern.test(token)) {
    throw new Error(
      'LOCAL_TEST_AUTH_TOKEN must be a 32-128 character alphanumeric, underscore, or hyphen token',
    );
  }

  return token;
}

const resolveRequestPath = (request: LocalTestAccountRequest): string => {
  const path = request.path ?? request.originalUrl ?? '';

  try {
    return new URL(path, 'http://localhost').pathname.replace(
      /^\/api(?=\/)/,
      '',
    );
  } catch {
    return '';
  }
};

export function isLocalTestAccountRequestAllowed(
  request: LocalTestAccountRequest,
): boolean {
  const method = request.method?.toUpperCase();
  const path = resolveRequestPath(request);

  if (path === '/game/poke-lounge/state') {
    return method === 'GET' || method === 'PUT';
  }

  if (path !== '/game/result' || method !== 'POST') {
    return false;
  }

  return (
    typeof request.body === 'object' &&
    request.body !== null &&
    'gameType' in request.body &&
    request.body.gameType === 'POKE_LOUNGE'
  );
}
