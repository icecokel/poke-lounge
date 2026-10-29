const memoryKeys = new Map<string, string>();
const storageKey = (runId: string) => `poke-lounge-league:v1:entry-key:${runId}`;

export function getEntryKey(runId: string): string {
  let key = memoryKeys.get(runId);
  try {
    key = localStorage.getItem(storageKey(runId)) ?? key;
  } catch {
    /* Storage can be unavailable. */
  }
  if (!key) key = crypto.randomUUID();
  memoryKeys.set(runId, key);
  try {
    localStorage.setItem(storageKey(runId), key);
  } catch {
    /* Keep the in-memory key for retries. */
  }
  return key;
}
export function clearEntryKey(runId: string): void {
  memoryKeys.delete(runId);
  try {
    localStorage.removeItem(storageKey(runId));
  } catch {
    /* The response is already confirmed. */
  }
}
