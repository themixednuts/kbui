export interface NormalizedMonkeytypeResult {
  id: string;
  timestampMs: number;
  wpm: number;
  rawWpm: number | null;
  acc: number;
  consistency: number | null;
  testDuration: number | null;
  mode: string | null;
  mode2: string | null;
  syncedAtMs: number;
  payload: unknown;
}

type UnknownRecord = Record<string, unknown>;

export function normalizeMonkeytypeResults(
  payload: unknown,
  syncedAtMs: number,
): NormalizedMonkeytypeResult[] {
  const rows = resultRows(payload);
  const seen = new Set<string>();
  const normalized: NormalizedMonkeytypeResult[] = [];

  for (const row of rows) {
    const id = readText(row, ["_id", "id"]);
    const timestampMs = readTimestampMs(row, ["timestamp", "timestampMs"]);
    const wpm = readFinite(row, ["wpm"]);
    const acc = readFinite(row, ["acc", "accuracy"]);
    if (!id || timestampMs === null || wpm === null || acc === null) continue;
    if (seen.has(id)) continue;
    seen.add(id);

    normalized.push({
      id,
      timestampMs,
      wpm,
      rawWpm: readFinite(row, ["rawWpm", "raw"]),
      acc,
      consistency: readFinite(row, ["consistency"]),
      testDuration: readFinite(row, ["testDuration", "time"]),
      mode: readText(row, ["mode"]),
      mode2: readText(row, ["mode2"]),
      syncedAtMs,
      payload: row,
    });
  }

  return normalized;
}

function resultRows(payload: unknown): UnknownRecord[] {
  const value = unwrapData(payload);
  if (Array.isArray(value)) return value.map(asRecord).filter((row) => row !== null);
  const record = asRecord(value);
  if (!record) return [];
  const nested = record.results ?? record.data;
  if (Array.isArray(nested)) return nested.map(asRecord).filter((row) => row !== null);
  return [record];
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

function readText(record: UnknownRecord, keys: string[]): string | null {
  for (const key of keys) {
    const raw = record[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  return null;
}

function readFinite(record: UnknownRecord, keys: string[]): number | null {
  for (const key of keys) {
    const raw = record[key];
    const value =
      typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : Number.NaN;
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function readTimestampMs(record: UnknownRecord, keys: string[]): number | null {
  const value = readFinite(record, keys);
  if (value === null) return null;
  return value < 10_000_000_000 ? Math.round(value * 1000) : Math.round(value);
}
