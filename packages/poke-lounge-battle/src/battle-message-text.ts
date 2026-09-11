/** Dynamic Korean battle subjects use the same notation regardless of the final consonant. */
export function withSubjectParticle(value: string | number): string {
  return `${value}이(가)`;
}
