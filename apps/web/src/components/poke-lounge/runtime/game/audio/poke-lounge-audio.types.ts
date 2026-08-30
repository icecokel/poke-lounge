export type PokeLoungeSfxId =
  | "button-confirm"
  | "button-cancel"
  | "battle-start"
  | "battle-hit"
  | "battle-transition"
  | "pokemon-faint";

export type PokeLoungeBgmId = "field-day" | "wild-battle";

export interface PokeLoungeCc0AudioSource {
  title: string;
  creator: string;
  license: "CC0-1.0";
  sourceUrl: string;
  sourceFile: string;
}

export interface PokeLoungeRomAudioSource {
  sdatPath: string;
  sequenceIndex: number;
  sequenceName: string;
}

export type PokeLoungeAudioSource = PokeLoungeCc0AudioSource | PokeLoungeRomAudioSource;

export interface PokeLoungeSfxManifestItem {
  id: PokeLoungeSfxId;
  src: string;
  durationMs: number;
  sizeBytes: number;
  defaultVolume: number;
  source: PokeLoungeAudioSource;
}

export interface PokeLoungeBgmManifestItem {
  id: PokeLoungeBgmId;
  src: string;
  durationMs: number;
  sizeBytes: number;
  defaultVolume: number;
  source: PokeLoungeAudioSource;
}

export interface PokeLoungeAudioManifest {
  version: number;
  sfx: PokeLoungeSfxManifestItem[];
  bgm: PokeLoungeBgmManifestItem[];
}
