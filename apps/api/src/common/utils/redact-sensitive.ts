const REDACTED = '[REDACTED]';

const SENSITIVE_KEYS = new Set([
  'authorization',
  'accessToken',
  'refreshToken',
  'idToken',
  'token',
  'apiKey',
  'password',
  'question',
  'email',
  'phone',
  'contact',
]);

const isSensitiveKey = (key: string): boolean => {
  const normalized = key.toLowerCase();
  return [...SENSITIVE_KEYS].some(
    (sensitiveKey) => normalized === sensitiveKey.toLowerCase(),
  );
};

const redactSensitiveString = (value: string): string =>
  value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, REDACTED)
    .replace(
      /\b(?:\+?\d{1,3}[-.\s]?)?(?:010|011|016|017|018|019)[-.\s]?\d{3,4}[-.\s]?\d{4}\b/g,
      REDACTED,
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, REDACTED);

export const redactSensitiveValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        isSensitiveKey(key) ? REDACTED : redactSensitiveValue(item),
      ]),
    );
  }

  if (typeof value === 'string') {
    return redactSensitiveString(value);
  }

  return value;
};
