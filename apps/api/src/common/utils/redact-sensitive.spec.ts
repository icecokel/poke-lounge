import { redactSensitiveValue } from './redact-sensitive';

describe('redactSensitiveValue', function testSuite() {
  it('redacts user input and auth-like fields', function testCase() {
    expect(
      redactSensitiveValue({
        question: '내 이력 비공개 질문',
        authorization: 'Bearer token',
        nested: {
          email: 'person@example.com',
          phone: '010-1234-5678',
          keep: 'safe',
        },
      }),
    ).toEqual({
      question: '[REDACTED]',
      authorization: '[REDACTED]',
      nested: {
        email: '[REDACTED]',
        phone: '[REDACTED]',
        keep: 'safe',
      },
    });
  });
});
