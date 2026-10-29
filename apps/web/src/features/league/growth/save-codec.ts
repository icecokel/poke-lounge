import { LEAGUE_SAVE_MAX_BYTES } from "@poke-lounge/battle/league/growth/contract";
import { isRecord } from "@/lib/is-record";
import { LeagueApiError } from "../api/core";
import type { LeagueSaveEnvelope } from "./league-save";

const MAX_DECODED_BYTES = 2 * 1024 * 1024;
const byteLength = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

export async function encodeLeagueSave(
  save: LeagueSaveEnvelope,
  baseRev: number,
  keepalive: boolean,
) {
  let data: unknown = save;
  const json = JSON.stringify(save);
  const decodedSize = new TextEncoder().encode(json).length;
  if (decodedSize > MAX_DECODED_BYTES)
    throw new LeagueApiError(
      422,
      "LEAGUE_SAVE_TOO_LARGE",
      { size: decodedSize, maxBytes: MAX_DECODED_BYTES },
      false,
    );
  if (decodedSize > 48 * 1024) {
    const compressed = await new Response(
      new Blob([json]).stream().pipeThrough(new CompressionStream("gzip")),
    ).arrayBuffer();
    const bytes = new Uint8Array(compressed);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    data = { version: 1, runId: save.runId, encoding: "gzip-base64", payload: btoa(binary) };
  }
  const size = byteLength(data);
  if (size > LEAGUE_SAVE_MAX_BYTES)
    throw new LeagueApiError(
      422,
      "LEAGUE_SAVE_TOO_LARGE",
      { size, maxBytes: LEAGUE_SAVE_MAX_BYTES },
      false,
    );
  // A hidden-page upload must fit the browser's 64 KiB keepalive budget, including its wrapper.
  if (keepalive && byteLength({ baseRev, data }) > 64 * 1024)
    throw new LeagueApiError(0, "LEAGUE_SAVE_KEEPALIVE_LIMIT", undefined, false);
  return data;
}

export async function decodeLeagueSave(value: unknown): Promise<LeagueSaveEnvelope> {
  if (!isRecord(value) || value.encoding === undefined) return value as LeagueSaveEnvelope;
  if (
    value.encoding !== "gzip-base64" ||
    typeof value.payload !== "string" ||
    byteLength(value) > LEAGUE_SAVE_MAX_BYTES
  )
    throw new Error("LEAGUE_SAVE_INVALID");
  const bytes = Uint8Array.from(atob(value.payload), c => c.charCodeAt(0));
  const reader = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"))
    .getReader();
  const chunks: ArrayBuffer[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > MAX_DECODED_BYTES) throw new Error("LEAGUE_SAVE_INVALID");
      chunks.push(new Uint8Array(chunk.value).buffer);
    }
  } finally {
    await reader.cancel();
  }
  const save: unknown = JSON.parse(await new Blob(chunks).text());
  if (!isRecord(save) || save.version !== value.version || save.runId !== value.runId)
    throw new Error("LEAGUE_SAVE_INVALID");
  return save as unknown as LeagueSaveEnvelope;
}
