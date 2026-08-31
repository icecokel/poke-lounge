import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { DEFAULT_CORS_ORIGINS } from '../constants/cors.constant';

const normalizeOrigin = (origin: string): string | undefined => {
  const trimmed = origin.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const url = new URL(trimmed);
    const isSupportedProtocol =
      url.protocol === 'https:' || url.protocol === 'http:';
    const isOriginOnly = url.pathname === '/' && !url.search && !url.hash;
    const hasWildcard = url.hostname.includes('*');

    if (!isSupportedProtocol || !isOriginOnly || hasWildcard) {
      return undefined;
    }

    return url.origin;
  } catch {
    return undefined;
  }
};

export function resolveCorsOrigins(rawOrigins?: string): string[] {
  return Array.from(
    new Set(
      [...DEFAULT_CORS_ORIGINS, ...(rawOrigins?.split(',') ?? [])]
        .map(normalizeOrigin)
        .filter(function filterItem(origin): origin is string {
          return Boolean(origin);
        }),
    ),
  );
}

export function getCorsOptions(rawOrigins?: string): CorsOptions {
  return {
    origin: resolveCorsOrigins(rawOrigins),
    credentials: true,
    exposedHeaders: [
      'X-Request-Id',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
    ],
  };
}
