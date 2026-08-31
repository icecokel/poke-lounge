export type { CanonicalCompetitiveAction, CanonicalMoveId } from "./actions";
export {
  applyBattleStatStageDelta,
  BATTLE_STAT_STAGE_KEYS,
  BATTLE_STAT_STAGE_MAX,
  BATTLE_STAT_STAGE_MIN,
  calculateBattleStageModifiedStat,
  clampBattleStatStage,
  createDefaultBattleStatStages,
  normalizeBattleStatStages,
  type BattleStatStageKey,
  type BattleStatStages,
} from "./battle-stat-stages";
export {
  canonicalize,
  createCanonicalIdRecord,
  hashCanonicalState,
  type CanonicalBattleState,
  type CanonicalBattleStatus,
  type CanonicalCombatantState,
  type CanonicalIdRecord,
  type CanonicalMoveState,
  type CanonicalPlayerState,
  type CanonicalTerminalResult,
} from "./canonical-state";
export { createSeededRandom, type SeededRandom } from "./prng";
export {
  COMPETITIVE_CATALOG_HASH,
  COMPETITIVE_MOVE_CATALOG,
  COMPETITIVE_SPECIES_CATALOG,
  type CompetitiveMoveDefinition,
  type CompetitiveSpeciesDefinition,
} from "./competitive-catalog.generated";
export {
  COMPETITIVE_CATALOG_MOVE_COUNT,
  COMPETITIVE_CATALOG_SPECIES_COUNT,
} from "./competitive-catalog-metadata.generated";
export {
  canUseCompetitiveStruggle,
  COMPETITIVE_MOVE_COUNT_MAX,
  COMPETITIVE_PARTY_SLOT_COUNT,
  COMPETITIVE_PARTY_SNAPSHOT_VERSION,
  COMPETITIVE_POKEMON_LEVEL_MAX,
  COMPETITIVE_POKEMON_LEVEL_MIN,
  COMPETITIVE_SUPPORTED_PRIMARY_STATUS_EFFECT_CODES,
  CompetitivePartyValidationError,
  isCompetitiveMoveSelectable,
  normalizeCompetitiveParty,
  restoreCompetitiveParty,
  type CompetitiveIndividualValues,
  type CompetitivePartyInput,
  type CompetitivePartyMemberInput,
  type CompetitivePartyValidationReason,
  type CompetitivePersistentStatus,
  type NormalizedCompetitiveParty,
  type NormalizedCompetitivePartyMember,
} from "./competitive-party";
export {
  calculateGen4Damage,
  checkGen4Accuracy,
  type Gen4AccuracyInput,
  type Gen4DamageInput,
  type Gen4MoveCategory,
} from "./gen4-battle-math";
export {
  calculateGen4BattleStats,
  type Gen4BaseStats,
  type Gen4BattleStats,
  type Gen4StatValues,
} from "./gen4-pokemon-stats";
export { calculateGen4TypeEffectiveness } from "./gen4-type-chart";
export {
  isCompetitiveMoveEffectSelectable,
  type CompetitiveMoveEffectDescriptor,
} from "./competitive-ruleset-config";
export {
  APPROVED_COMPETITIVE_RULESET_V2,
  COMPETITIVE_RULESET_HASH,
  COMPETITIVE_RULESET_V2,
  COMPETITIVE_RULESET_VERSION,
  COMPETITIVE_STRUGGLE_MOVE_ID,
  createInitialBattleState,
  type CompetitiveBattleParticipantInput,
  type CompetitiveResolvedMoveDefinition,
  type CompetitiveStruggleDefinition,
} from "./ruleset";
export { resolveTurn, validateCompetitiveAction, type ResolvedTurnV2 } from "./resolve-turn";
export { POKE_LOUNGE_RUNTIME_ITEM_ROM_IDS, type PokeLoungeRuntimeItemId } from "./runtime-item-ids";
export {
  createTournamentBracketState,
  getReadyTournamentMatches,
  getTournamentStandings,
  recordTournamentMatchResult,
  TOURNAMENT_MAX_PARTICIPANT_COUNT,
  TOURNAMENT_MIN_PARTICIPANT_COUNT,
  type TournamentBracketState,
  type TournamentBye,
  type TournamentElimination,
  type TournamentMatch,
  type TournamentMatchResultReason,
  type TournamentMatchStatus,
  type TournamentParticipant,
  type TournamentParticipantInput,
  type TournamentRound,
  type TournamentRoundSlot,
  type TournamentStanding,
  type TournamentStatus,
} from "./tournament-bracket";
export {
  accumulateTournamentScores,
  DEFAULT_TOURNAMENT_SCORE_BY_RANK,
  rankCumulativeTournamentScores,
  scoreRemainingHpPercentage,
  scoreTournamentStandings,
  type CumulativeTournamentScoreRank,
  type RemainingHpScoreMember,
  type TournamentRoundScore,
  type TournamentScoreByPlayerId,
  type TournamentScoreByRank,
} from "./tournament-scoring";
