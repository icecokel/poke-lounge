import assert from "node:assert/strict";
import test from "node:test";
import {
  assertClientEnvironment,
  isDatabaseEnvironmentName,
  omitDatabaseEnvironment,
  redactIntegrationLog,
} from "./playwright-integration-environment.mjs";

const testDatabaseUrl =
  "postgresql://integration-user:integration-password@127.0.0.1:5432/poke_lounge_test";
const testDatabasePassword = "integration-password";
const testDatabaseUsername = "integration-user";

test("Web과 Playwright 환경에서 DB 변수와 test DB secret을 제거한다", function testCase() {
  const sanitized = omitDatabaseEnvironment(
    {
      PATH: "/usr/bin",
      TEST_DATABASE_URL: testDatabaseUrl,
      DATABASE_URL: "postgresql://regular.example/app",
      DB_HOST: "127.0.0.1",
      DB_PASSWORD: testDatabasePassword,
      PGPASSWORD: testDatabasePassword,
      POSTGRES_USER: testDatabaseUsername,
      DATABASE_USERNAME: testDatabaseUsername,
      TYPEORM_USERNAME: testDatabaseUsername,
      UNRELATED_SECRET_COPY: `prefix-${testDatabasePassword}-suffix`,
      LEAKED_USERNAME_COPY: testDatabaseUsername,
    },
    [testDatabaseUrl, testDatabasePassword],
    [testDatabaseUsername],
  );

  assert.deepEqual(sanitized, { PATH: "/usr/bin" });
  assert.doesNotThrow(function callback() {
    return assertClientEnvironment(
      "Playwright",
      sanitized,
      testDatabaseUrl,
      testDatabasePassword,
      testDatabaseUsername,
    );
  });
});

test("DB 변수명 또는 test DB credential이 남으면 child 환경 assertion이 실패한다", function testCase() {
  assert.equal(isDatabaseEnvironmentName("DB_DATABASE"), true);
  assert.equal(isDatabaseEnvironmentName("TEST_DATABASE_URL"), true);
  assert.equal(isDatabaseEnvironmentName("POSTGRES_USER"), true);
  assert.equal(isDatabaseEnvironmentName("DATABASE_USERNAME"), true);
  assert.equal(isDatabaseEnvironmentName("TYPEORM_USERNAME"), true);
  assert.throws(function callback() {
    return assertClientEnvironment(
      "Web",
      { DB_DATABASE: "poke_lounge_test" },
      testDatabaseUrl,
      testDatabasePassword,
      testDatabaseUsername,
    );
  }, /exposes database variables/);
  assert.throws(function callback() {
    return assertClientEnvironment(
      "Playwright",
      { LEAKED_VALUE: testDatabasePassword },
      testDatabaseUrl,
      testDatabasePassword,
      testDatabaseUsername,
    );
  }, /exposes a test database secret/);
  assert.throws(function callback() {
    return assertClientEnvironment(
      "Playwright",
      { LEAKED_USERNAME: testDatabaseUsername },
      testDatabaseUrl,
      testDatabasePassword,
      testDatabaseUsername,
    );
  }, /exposes a test database username/);
});

test("runner/API log용 redaction은 DB credential과 E2E token/session을 모두 제거한다", function testCase() {
  const raw = [
    testDatabaseUrl,
    testDatabasePassword,
    testDatabaseUsername,
    "postgresql://other-user:other-password@127.0.0.1:5432/other_test",
    "poke-lounge-e2e-token-3",
    "server-session-11111111-1111-4111-8111-111111111111",
  ].join("\n");
  const redacted = redactIntegrationLog(
    raw,
    testDatabaseUrl,
    testDatabasePassword,
    testDatabaseUsername,
  );

  for (const secret of [
    testDatabaseUrl,
    testDatabasePassword,
    testDatabaseUsername,
    "other-password",
    "poke-lounge-e2e-token-3",
    "server-session-11111111-1111-4111-8111-111111111111",
  ]) {
    assert.equal(redacted.includes(secret), false);
  }
});
