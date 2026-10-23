export function truncateDisplayName(displayName: string): string {
  const characters = Array.from(displayName);

  return characters.length <= 12 ? displayName : `${characters.slice(0, 11).join("")}…`;
}

export function formatClock(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}
