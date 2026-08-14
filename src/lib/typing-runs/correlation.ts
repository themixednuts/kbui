import type { CorrelationState, MonkeytypeRunCapture } from "./contracts";
import type { NormalizedMonkeytypeResult } from "./monkeytype-results";

export const CORRELATION_TIMESTAMP_WINDOW_MS = 30_000;
export const CORRELATION_NARROW_TIMESTAMP_WINDOW_MS = 5_000;
export const CORRELATION_WPM_TOLERANCE = 1;
export const CORRELATION_ACC_TOLERANCE = 1;
export const CORRELATION_CONSISTENCY_TOLERANCE = 2;
export const CORRELATION_DURATION_TOLERANCE = 1;

export interface CorrelationDecision {
  state: CorrelationState;
  confidence: number | null;
  monkeytypeResultId: string | null;
}

export function correlateCapture(
  capture: MonkeytypeRunCapture,
  results: readonly NormalizedMonkeytypeResult[],
  options: { hasFreshSync?: boolean } = {},
): CorrelationDecision {
  const capturedAtMs = Date.parse(capture.capturedAt);
  const hasFreshSync =
    options.hasFreshSync ?? results.some((result) => result.syncedAtMs >= capturedAtMs - 1_000);

  if (capture.monkeytypeResultId) {
    const direct = results.find((result) => result.id === capture.monkeytypeResultId);
    if (direct) {
      return {
        state: "matched",
        confidence: 1,
        monkeytypeResultId: direct.id,
      };
    }
    return {
      state: hasFreshSync ? "unmatched" : "pending",
      confidence: null,
      monkeytypeResultId: capture.monkeytypeResultId,
    };
  }

  const matches = results.filter((result) => fuzzyMatch(capture, result, capturedAtMs));
  if (matches.length === 1) {
    return {
      state: "matched",
      confidence: fuzzyConfidence(capture, matches[0]!),
      monkeytypeResultId: matches[0]!.id,
    };
  }
  if (matches.length > 1) {
    return { state: "ambiguous", confidence: null, monkeytypeResultId: null };
  }
  return {
    state: hasFreshSync ? "unmatched" : "pending",
    confidence: null,
    monkeytypeResultId: null,
  };
}

function fuzzyMatch(
  capture: MonkeytypeRunCapture,
  result: NormalizedMonkeytypeResult,
  capturedAtMs: number,
): boolean {
  const windowMs = capture.monkeytypeTimestamp
    ? CORRELATION_NARROW_TIMESTAMP_WINDOW_MS
    : CORRELATION_TIMESTAMP_WINDOW_MS;
  const captureTs = capture.monkeytypeTimestamp
    ? normalizeTimestampMs(capture.monkeytypeTimestamp)
    : capturedAtMs;
  if (Math.abs(result.timestampMs - captureTs) > windowMs) return false;
  if (Math.abs(result.wpm - capture.wpm) > CORRELATION_WPM_TOLERANCE) return false;
  if (Math.abs(result.acc - capture.acc) > CORRELATION_ACC_TOLERANCE) return false;
  if (
    result.consistency !== null &&
    capture.consistency !== undefined &&
    Math.abs(result.consistency - capture.consistency) > CORRELATION_CONSISTENCY_TOLERANCE
  ) {
    return false;
  }
  if (
    result.testDuration !== null &&
    capture.testDuration !== undefined &&
    Math.abs(result.testDuration - capture.testDuration) > CORRELATION_DURATION_TOLERANCE
  ) {
    return false;
  }
  if (result.mode && capture.mode && result.mode !== capture.mode) return false;
  if (result.mode2 && capture.mode2 && result.mode2 !== capture.mode2) return false;
  return true;
}

function fuzzyConfidence(
  capture: MonkeytypeRunCapture,
  result: NormalizedMonkeytypeResult,
): number {
  let score = 0.7;
  if (result.consistency !== null && capture.consistency !== undefined) score += 0.1;
  if (result.testDuration !== null && capture.testDuration !== undefined) score += 0.05;
  if (result.mode && capture.mode) score += 0.05;
  if (result.mode2 && capture.mode2) score += 0.05;
  if (capture.monkeytypeTimestamp) score += 0.05;
  return Math.min(0.95, score);
}

function normalizeTimestampMs(value: number): number {
  return value < 10_000_000_000 ? Math.round(value * 1000) : Math.round(value);
}
