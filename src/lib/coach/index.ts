export { applyCoachSuggestionEffect, applyDiffsToEditor } from "./apply";
export {
  annotateSlot,
  annotateSlotSync,
  isAlphaPinned,
  isMovable,
  isNumpadFrozen,
  isSacredThumb,
  isTrackballIgnored,
} from "./constraints";
export type {
  BindingDiff,
  CoachKeySlot,
  CoachLayoutFixture,
  CoachSuggestion,
  CodingNgram,
  ConfusionPair,
  PersonalKeyStat,
  RecentAccept,
} from "./contracts";
export { CoachSuggestResult } from "./contracts";
export {
  CHURN_DELTA_OVERRIDE,
  CHURN_HISTORY_LIMIT,
  CHURN_TTL_MS,
  churnBlockedKeyIds,
  freshRecentAccepts,
  isChurnBlocked,
  loadRecentAcceptsEffect,
  recordAcceptEffect,
} from "./churn";
export { suggestCoach, PERSONAL_SAMPLE_THRESHOLD } from "./engine";
export {
  CHARYBDIS_COACH_FIXTURE,
  CODING_NGRAMS_V1,
  IMPROVABLE_NAV_FIXTURE,
} from "./fixtures";
export { layoutFixtureFromProfile } from "./from-profile";
export { effortForGeometry, geometryForKey } from "./geometry";
export {
  inferLayerRoles,
  layerIdsWithRole,
  loadLayerRolesEffect,
  LayerRole,
  LayerRoleMap,
  mergeLayerRoles,
  roleForLayer,
  setLayerRoleEffect,
  type LayerRole as LayerRoleT,
  type LayerRoleMap as LayerRoleMapT,
} from "./layer-roles";
export {
  addNeverMoveEffect,
  filterNeverMoves,
  loadNeverMovesEffect,
  neverMovesKey,
} from "./never-list";
export {
  confusionPairsFromPractice,
  hasEnoughPracticeData,
  personalStatsFromPractice,
  practiceSampleCount,
} from "./personal";
export { scoreLayout } from "./scoring";
export * as Coach from "./service";
