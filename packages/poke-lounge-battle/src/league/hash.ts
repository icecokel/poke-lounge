import { canonicalize } from "../canonical-json";

const FNV_OFFSET = BigInt("0xcbf29ce484222325");
const FNV_PRIME = BigInt("0x100000001b3");

export function leagueHash(value: unknown): string {
  let hash = FNV_OFFSET;
  for (const byte of new TextEncoder().encode(canonicalize(value))) {
    hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * FNV_PRIME);
  }
  return hash.toString(16).padStart(16, "0");
}
