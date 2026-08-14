import { Schema } from "effect";

const requiredText = (minimum: number, maximum: number) =>
  Schema.Trim.check(Schema.isMinLength(minimum), Schema.isMaxLength(maximum));

export const CoachKeySlot = Schema.Struct({
  keyId: requiredText(1, 40),
  layerId: requiredText(1, 40),
  code: requiredText(1, 80),
  row: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  col: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  sacred: Schema.Boolean,
  numpad: Schema.Boolean,
  trackball: Schema.Boolean,
});
export interface CoachKeySlot extends Schema.Schema.Type<typeof CoachKeySlot> {}

export const CoachLayoutFixture = Schema.Struct({
  id: requiredText(1, 80),
  name: requiredText(1, 160),
  slots: Schema.Array(CoachKeySlot).check(Schema.isMaxLength(400)),
});
export interface CoachLayoutFixture extends Schema.Schema.Type<typeof CoachLayoutFixture> {}

export const CodingNgram = Schema.Struct({
  grams: requiredText(1, 8),
  weight: Schema.Finite.check(Schema.isGreaterThan(0)),
});
export interface CodingNgram extends Schema.Schema.Type<typeof CodingNgram> {}

export const PersonalKeyStat = Schema.Struct({
  code: requiredText(1, 80),
  errorRate: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
  meanLatencyMs: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)),
  samples: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});
export interface PersonalKeyStat extends Schema.Schema.Type<typeof PersonalKeyStat> {}

/** Intended → actual keycode confusion (soft placement penalty). */
export const ConfusionPair = Schema.Struct({
  expected: requiredText(1, 80),
  observed: requiredText(1, 80),
  count: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
});
export interface ConfusionPair extends Schema.Schema.Type<typeof ConfusionPair> {}

/** Recently accepted coach moves — churn budget cooldown. */
export const RecentAccept = Schema.Struct({
  moveId: requiredText(1, 160),
  keyIds: Schema.Array(requiredText(1, 40)).check(Schema.isMaxLength(32)),
  acceptedAt: requiredText(1, 80),
});
export interface RecentAccept extends Schema.Schema.Type<typeof RecentAccept> {}

export const RecentAcceptList = Schema.Array(RecentAccept).check(Schema.isMaxLength(40));
export type RecentAcceptList = typeof RecentAcceptList.Type;

export const BindingDiff = Schema.Struct({
  keyId: requiredText(1, 40),
  layerId: requiredText(1, 40),
  before: requiredText(1, 80),
  after: requiredText(1, 80),
});
export interface BindingDiff extends Schema.Schema.Type<typeof BindingDiff> {}

export const CoachSuggestion = Schema.Struct({
  moveId: requiredText(1, 160),
  rationale: requiredText(1, 400),
  confidence: Schema.Literals(["low", "medium", "high"]),
  scoreDelta: Schema.Finite,
  diffs: Schema.Array(BindingDiff).check(Schema.isMaxLength(64)),
  basedOnPersonalStats: Schema.Boolean,
});
export interface CoachSuggestion extends Schema.Schema.Type<typeof CoachSuggestion> {}

export const CoachSuggestResult = Schema.TaggedUnion({
  Suggestion: { suggestion: CoachSuggestion },
  LowData: { message: requiredText(1, 240), sampleCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)) },
  Empty: { message: requiredText(1, 240) },
});
export type CoachSuggestResult = typeof CoachSuggestResult.Type;

export const NeverMoveList = Schema.Array(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(160))).check(
  Schema.isMaxLength(500),
);
export type NeverMoveList = typeof NeverMoveList.Type;
