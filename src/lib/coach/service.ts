import { Context, Effect, Layer } from "effect";

import type { PracticeSessionSummary } from "$lib/practice/contracts";

import type { ConfusionPair, CoachSuggestResult, PersonalKeyStat } from "./contracts";
import {
  loadRecentAcceptsEffect,
  recordAcceptEffect,
} from "./churn";
import { suggestCoach, type SuggestInput } from "./engine";
import { layoutFixtureFromProfile } from "./from-profile";
import { loadLayerRolesEffect, setLayerRoleEffect } from "./layer-roles";
import { addNeverMoveEffect, loadNeverMovesEffect } from "./never-list";
import {
  confusionPairsFromPractice,
  hasEnoughPracticeData,
  personalStatsFromPractice,
  practiceSampleCount,
} from "./personal";

/**
 * Coach suggestion/stats service — apply stays outside (WorkbenchStore ↔ runtime).
 */
export interface Interface {
  readonly suggest: (input: SuggestInput) => Effect.Effect<CoachSuggestResult>;
  readonly loadNeverMoves: typeof loadNeverMovesEffect;
  readonly addNeverMove: typeof addNeverMoveEffect;
  readonly loadRecentAccepts: typeof loadRecentAcceptsEffect;
  readonly recordAccept: typeof recordAcceptEffect;
  readonly personalStats: (
    sessions: readonly PracticeSessionSummary[],
  ) => Effect.Effect<PersonalKeyStat[]>;
  readonly confusionPairs: (
    sessions: readonly PracticeSessionSummary[],
  ) => Effect.Effect<ConfusionPair[]>;
  readonly sampleCount: (sessions: readonly PracticeSessionSummary[]) => Effect.Effect<number>;
  readonly hasEnoughData: (sessions: readonly PracticeSessionSummary[]) => Effect.Effect<boolean>;
  readonly loadLayerRoles: typeof loadLayerRolesEffect;
  readonly setLayerRole: typeof setLayerRoleEffect;
  readonly layoutFromProfile: typeof layoutFixtureFromProfile;
}

export class Service extends Context.Service<Service, Interface>()("@kbgui/Coach") {}

export const layer: Layer.Layer<Service> = Layer.succeed(
  Service,
  Service.of({
    suggest: suggestCoach,
    loadNeverMoves: loadNeverMovesEffect,
    addNeverMove: addNeverMoveEffect,
    loadRecentAccepts: loadRecentAcceptsEffect,
    recordAccept: recordAcceptEffect,
    personalStats: personalStatsFromPractice,
    confusionPairs: confusionPairsFromPractice,
    sampleCount: practiceSampleCount,
    hasEnoughData: hasEnoughPracticeData,
    loadLayerRoles: loadLayerRolesEffect,
    setLayerRole: setLayerRoleEffect,
    layoutFromProfile: layoutFixtureFromProfile,
  }),
);

export const suggest = (input: SuggestInput) => Effect.flatMap(Service, (s) => s.suggest(input));
export const personalStats = (sessions: readonly PracticeSessionSummary[]) =>
  Effect.flatMap(Service, (s) => s.personalStats(sessions));
export const sampleCount = (sessions: readonly PracticeSessionSummary[]) =>
  Effect.flatMap(Service, (s) => s.sampleCount(sessions));
export const hasEnoughData = (sessions: readonly PracticeSessionSummary[]) =>
  Effect.flatMap(Service, (s) => s.hasEnoughData(sessions));
