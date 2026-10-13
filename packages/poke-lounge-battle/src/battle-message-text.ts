import { josa, numberToHangul } from "es-hangul";

function withParticle(value: string | number, particle: Parameters<typeof josa>[1]): string {
  const word = String(value);
  const digits = word.match(/\d+$/)?.[0];
  // Level numbers and trainer-name suffixes keep their digits but use Korean pronunciation.
  if (digits && Number.isSafeInteger(Number(digits))) {
    return word + josa.pick(numberToHangul(Number(digits)), particle);
  }
  return josa(word, particle);
}

export function withSubjectParticle(value: string | number): string {
  return withParticle(value, "이/가");
}

export function withTopicParticle(value: string | number): string {
  return withParticle(value, "은/는");
}

export function withObjectParticle(value: string | number): string {
  return withParticle(value, "을/를");
}

export function withConjunctionParticle(value: string | number): string {
  return withParticle(value, "와/과");
}

export function withDirectionParticle(value: string | number): string {
  return withParticle(value, "으로/로");
}
