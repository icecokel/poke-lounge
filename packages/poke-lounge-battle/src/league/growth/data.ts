export interface LeagueGrowthData {
  romSha1: string;
  species: Record<
    number,
    {
      growthRate: number;
      encounterable: boolean;
      genderRatio: number;
      abilities: number[];
      evolutions: Array<{ method: number; parameter: number; targetSpeciesId: number }>;
    }
  >;
  levelUpMoves: Record<number, Array<{ level: number; moveId: number }>>;
  wildMoveSets: Record<number, number[]>;
  growthTable: number[][];
}
let registered: LeagueGrowthData | null = null;
export function registerLeagueGrowthData(data: LeagueGrowthData): void {
  registered = data;
}
export function getLeagueGrowthData(): LeagueGrowthData | null {
  return registered;
}
