export const KBGUI_MONKEYTYPE_IDENTITY_SOURCE = "kbgui-monkeytype";

export interface MonkeytypeResultIdentity {
  monkeytypeResultId: string;
  monkeytypeTimestamp?: number;
}

export interface MonkeytypeIdentityMessage {
  source: typeof KBGUI_MONKEYTYPE_IDENTITY_SOURCE;
  type: "result-identity";
  monkeytypeResultId: string;
  monkeytypeTimestamp?: number;
}

export function isMonkeytypeResultsUrl(url: string): boolean {
  try {
    const parsed = new URL(url, "https://monkeytype.com");
    return (
      (parsed.hostname === "api.monkeytype.com" || parsed.hostname.endsWith(".monkeytype.com")) &&
      parsed.pathname.includes("/results")
    );
  } catch {
    return /\/results(?:\/|$|\?)/.test(url);
  }
}

export function readMonkeytypeResultIdentity(payload: unknown): MonkeytypeResultIdentity | null {
  const candidates = flattenRecords(payload, 0);
  for (const record of candidates) {
    const id = readText(record, ["_id", "id", "resultId"]);
    if (!id) continue;
    const timestamp = readFinite(record, ["timestamp", "timestampMs"]);
    return timestamp === null
      ? { monkeytypeResultId: id }
      : { monkeytypeResultId: id, monkeytypeTimestamp: timestamp };
  }
  return null;
}

export function identityFromUrl(url: string): MonkeytypeResultIdentity | null {
  try {
    const parsed = new URL(url, "https://monkeytype.com");
    const id =
      parsed.searchParams.get("id") ??
      parsed.searchParams.get("resultId") ??
      parsed.pathname.match(/\/results\/([A-Za-z0-9_-]+)/)?.[1];
    if (!id) return null;
    return { monkeytypeResultId: id };
  } catch {
    return null;
  }
}

export function monkeytypeIdentityMessage(
  identity: MonkeytypeResultIdentity,
): MonkeytypeIdentityMessage {
  return {
    source: KBGUI_MONKEYTYPE_IDENTITY_SOURCE,
    type: "result-identity",
    ...identity,
  };
}

export function readMonkeytypeIdentityMessage(data: unknown): MonkeytypeResultIdentity | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (record.source !== KBGUI_MONKEYTYPE_IDENTITY_SOURCE) return null;
  if (record.type !== "result-identity") return null;
  if (typeof record.monkeytypeResultId !== "string" || !record.monkeytypeResultId.trim()) {
    return null;
  }
  const timestamp =
    typeof record.monkeytypeTimestamp === "number" && Number.isFinite(record.monkeytypeTimestamp)
      ? record.monkeytypeTimestamp
      : undefined;
  return {
    monkeytypeResultId: record.monkeytypeResultId.trim(),
    ...(timestamp === undefined ? {} : { monkeytypeTimestamp: timestamp }),
  };
}

type UnknownRecord = Record<string, unknown>;

function flattenRecords(value: unknown, depth: number): UnknownRecord[] {
  if (depth > 4 || value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenRecords(item, depth + 1));
  }
  const record = asRecord(value);
  if (!record) return [];
  const nested = Object.values(record).flatMap((item) =>
    item && typeof item === "object" ? flattenRecords(item, depth + 1) : [],
  );
  return [record, ...nested];
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

function readFinite(record: UnknownRecord, keys: string[]): number | undefined {
  for (const key of keys) {
    const raw = record[key];
    const value =
      typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : Number.NaN;
    if (Number.isFinite(value)) return value;
  }
  return undefined;
}
