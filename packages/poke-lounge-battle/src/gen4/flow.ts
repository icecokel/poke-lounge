/** HGSS WhirlwindCheck; Roar and Whirlwind both use this level check, including trainer battles. */
export function hgssPhazingSucceeds(
  sourceLevel: number,
  targetLevel: number,
  randomByte: number,
): boolean {
  if (sourceLevel >= targetLevel) return true;
  return (
    Math.floor(((randomByte & 255) * (sourceLevel + targetLevel)) / 256) + 1 >
    Math.floor(targetLevel / 4)
  );
}
