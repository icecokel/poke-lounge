import { getCorsOptions, resolveCorsOrigins } from './cors.util';

describe('cors util', () => {
  it('기본 origin은 로컬 개발 웹만 포함한다', () => {
    expect(resolveCorsOrigins()).toEqual([
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ]);
  });

  it('Vercel preview origin은 CORS_ORIGINS에 명시한 경우에만 허용한다', () => {
    expect(resolveCorsOrigins()).not.toContain(
      'https://poke-lounge-git-preview.vercel.app',
    );

    expect(
      resolveCorsOrigins('https://poke-lounge-git-preview.vercel.app/'),
    ).toContain('https://poke-lounge-git-preview.vercel.app');
  });

  it('origin이 아닌 값이나 wildcard는 허용 목록에서 제외한다', () => {
    expect(
      resolveCorsOrigins(
        [
          '*',
          'https://*.vercel.app',
          'javascript:alert(1)',
          'https://preview.example.com/path',
          'https://safe-preview.example.com',
        ].join(','),
      ),
    ).toEqual([
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'https://safe-preview.example.com',
    ]);
  });

  it('Nest CORS 옵션은 검증된 origin, credentials, 요청 ID와 rate limit 헤더 노출을 사용한다', () => {
    expect(getCorsOptions('https://preview.example.com')).toEqual({
      origin: [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'https://preview.example.com',
      ],
      credentials: true,
      exposedHeaders: [
        'X-Request-Id',
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
        'X-RateLimit-Reset',
      ],
    });
  });
});
