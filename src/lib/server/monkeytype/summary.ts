import {
  DEFAULT_MONKEYTYPE_MODE,
  DEFAULT_MONKEYTYPE_MODE2,
  type MonkeytypeStatusError,
  type MonkeytypeSummary,
} from "$lib/monkeytype/types";

type UnknownRecord = Record<string, unknown>;

export interface MonkeytypeSummarySource {
  stats?: unknown;
  personalBests?: unknown;
  results?: unknown;
}

export interface DeriveMonkeytypeSummaryOptions {
  mode?: string | null;
  mode2?: string | null;
  generatedAt?: string | null;
  stale?: boolean;
  error?: MonkeytypeStatusError | null;
  previous?: MonkeytypeSummary | null;
}

interface ResultRow {
  wpm: number | null;
  accuracy: number | null;
  consistency: number | null;
}

interface PersonalBestRow {
  wpm: number | null;
  accuracy: number | null;
  consistency: number | null;
}

export function deriveMonkeytypeSummary(
  source: MonkeytypeSummarySource,
  options: DeriveMonkeytypeSummaryOptions = {},
): MonkeytypeSummary {
  const mode = cleanMode(options.mode, DEFAULT_MONKEYTYPE_MODE);
  const mode2 = cleanMode(options.mode2, DEFAULT_MONKEYTYPE_MODE2);
  const previous = options.previous ?? null;
  const resultRows = normalizeResults(source.results);
  const resultAverages = averageResults(resultRows);
  const best = bestPersonalBest(source.personalBests);

  return {
    wpm: resultAverages.wpm ?? previous?.wpm ?? null,
    accuracy: resultAverages.accuracy ?? previous?.accuracy ?? null,
    consistency: resultAverages.consistency ?? best?.consistency ?? previous?.consistency ?? null,
    tests: readCompletedTests(source.stats) ?? previous?.tests ?? null,
    pb:
      best?.wpm === null || best?.wpm === undefined ? (previous?.pb ?? null) : roundTo(best.wpm, 0),
    mode,
    mode2,
    resultCount: resultRows.length,
    generatedAt: options.generatedAt ?? null,
    stale: options.stale ?? false,
    error: options.error ?? null,
  };
}

function cleanMode(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function readCompletedTests(stats: unknown) {
  const record = asRecord(unwrapData(stats));
  if (!record) return null;
  return readInteger(record, ["completedTests", "testsCompleted", "totalCompletedTests", "tests"]);
}

function normalizeResults(results: unknown): ResultRow[] {
  const value = unwrapData(results);
  const record = asRecord(value);
  const rows: unknown[] = Array.isArray(value)
    ? value
    : Array.isArray(record?.results)
      ? record.results
      : [];

  return rows
    .map((row) => {
      const record = asRecord(row);
      if (!record) return null;
      return {
        wpm: readFiniteNumber(record, ["wpm"]),
        accuracy: readFiniteNumber(record, ["acc", "accuracy"]),
        consistency: readFiniteNumber(record, ["consistency"]),
      } satisfies ResultRow;
    })
    .filter((row): row is ResultRow => row !== null);
}

function averageResults(rows: ResultRow[]) {
  const wpm = average(rows.map((row) => row.wpm));
  const accuracy = average(rows.map((row) => row.accuracy));
  const consistency = average(rows.map((row) => row.consistency));

  return {
    wpm: wpm === null ? null : roundTo(wpm, 0),
    accuracy: accuracy === null ? null : roundTo(accuracy, 1),
    consistency: consistency === null ? null : roundTo(consistency, 1),
  };
}

function bestPersonalBest(personalBests: unknown): PersonalBestRow | null {
  const candidates = collectPersonalBestRows(unwrapData(personalBests));
  if (candidates.length === 0) return null;
  return candidates.reduce(
    (best, candidate) => {
      if (candidate.wpm === null) return best;
      if (!best || best.wpm === null || candidate.wpm > best.wpm) return candidate;
      return best;
    },
    null as PersonalBestRow | null,
  );
}

function collectPersonalBestRows(value: unknown, depth = 0): PersonalBestRow[] {
  if (depth > 5) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectPersonalBestRows(item, depth + 1));
  }

  const record = asRecord(value);
  if (!record) return [];

  const row = {
    wpm: readFiniteNumber(record, ["wpm"]),
    accuracy: readFiniteNumber(record, ["acc", "accuracy"]),
    consistency: readFiniteNumber(record, ["consistency"]),
  } satisfies PersonalBestRow;

  const nested = Object.values(record).flatMap((item) => collectPersonalBestRows(item, depth + 1));
  return row.wpm === null ? nested : [row, ...nested];
}

function average(values: Array<number | null>) {
  const finite = values.filter(
    (value): value is number => value !== null && Number.isFinite(value),
  );
  if (finite.length === 0) return null;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function roundTo(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function readInteger(record: UnknownRecord, keys: string[]) {
  const value = readFiniteNumber(record, keys);
  return value === null ? null : Math.max(0, Math.round(value));
}

function readFiniteNumber(record: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const raw = record[key];
    const value =
      typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : Number.NaN;
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function unwrapData(value: unknown): unknown {
  const record = asRecord(value);
  return record && "data" in record ? record.data : value;
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}
