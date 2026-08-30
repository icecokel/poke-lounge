export function omitDatabaseEnvironment(environment, secretValues, exactSecretValues = []) {
  return Object.fromEntries(
    Object.entries(environment).filter(([name, value]) => {
      if (isDatabaseEnvironmentName(name)) return false;
      if (secretValues.some(secret => secret && value?.includes(secret))) return false;
      return !exactSecretValues.some(secret => secret && value === secret);
    }),
  );
}

export function isDatabaseEnvironmentName(name) {
  return (
    name === "TEST_DATABASE_URL" ||
    name === "DATABASE_URL" ||
    name === "DB_URL" ||
    name === "PGDATABASE" ||
    name === "PGHOST" ||
    name === "PGPASSWORD" ||
    name === "PGPORT" ||
    name === "PGUSER" ||
    name.startsWith("DB_") ||
    name.startsWith("PG") ||
    name.startsWith("POSTGRES_") ||
    name.startsWith("POSTGRESQL_") ||
    name.startsWith("TYPEORM_") ||
    name.startsWith("DATABASE_")
  );
}

export function assertClientEnvironment(label, environment, testUrl, testPassword, testUsername) {
  const databaseNames = Object.keys(environment).filter(isDatabaseEnvironmentName);
  if (databaseNames.length > 0) {
    throw new Error(`${label} environment exposes database variables: ${databaseNames.join(", ")}`);
  }

  for (const secret of [testUrl, testPassword]) {
    if (!secret) continue;
    const exposedNames = Object.entries(environment)
      .filter(([, value]) => value?.includes(secret))
      .map(([name]) => name);
    if (exposedNames.length > 0) {
      throw new Error(
        `${label} environment exposes a test database secret through: ${exposedNames.join(", ")}`,
      );
    }
  }

  if (testUsername) {
    const exposedNames = Object.entries(environment)
      .filter(([, value]) => value === testUsername)
      .map(([name]) => name);
    if (exposedNames.length > 0) {
      throw new Error(
        `${label} environment exposes a test database username through: ${exposedNames.join(", ")}`,
      );
    }
  }
}

export function redactIntegrationLog(value, testUrl, testPassword, testUsername) {
  let redacted = value;
  for (const [secret, replacement] of [
    [testUrl, "[redacted-test-database-url]"],
    [testPassword, "[redacted-database-password]"],
    [testUsername, "[redacted-database-username]"],
  ]) {
    if (secret) {
      redacted = redacted.replaceAll(secret, replacement);
    }
  }

  return redacted
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[redacted-database-url]")
    .replace(/poke-lounge-e2e-token-[1-5]/g, "[redacted-token]")
    .replace(/server-session-[a-z0-9-]+/gi, "[redacted-session]");
}
