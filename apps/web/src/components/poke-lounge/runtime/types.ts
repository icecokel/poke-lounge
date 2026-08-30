export type StarterType = "Grass" | "Fire" | "Water";

export interface StarterPokemon {
  id: string;
  speciesId: number;
  name: string;
  displayName: string;
  type: StarterType;
  assetPath: string;
}

export interface GameBootstrapData {
  version: number;
  maxPlayers: number;
  starters: StarterPokemon[];
}

export interface UiAsset {
  id: string;
  path: string;
  archiveId?: string;
  kind?: string;
  role?: string;
  category?: string;
  type?: string;
  name?: string;
  width?: number;
  height?: number;
  sourceArchivePath?: string;
}

export interface UiAssetArchive {
  id: string;
  label: string;
  sourceArchivePath?: string;
  fileCount?: number;
  notes?: string[];
  contactSheet?: UiAsset;
  assets: UiAsset[];
}

export interface UiAssetManifest {
  version: number;
  sourcePath?: string;
  assets: UiAsset[];
  archives?: UiAssetArchive[];
}
