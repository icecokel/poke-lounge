export function isDevelopmentRuntime(): boolean {
  const nodeEnv = typeof process === "undefined" ? undefined : process.env.NODE_ENV;

  return nodeEnv === "development" || nodeEnv === "test";
}
