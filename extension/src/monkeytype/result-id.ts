import { Option, Schema } from "effect";

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

const optionalMetric = Schema.optionalKey(Schema.Union([Schema.Finite, Schema.NumberFromString]));
const optionalText = Schema.optionalKey(Schema.String);

export const MonkeytypeResultIdentityWireSchema = Schema.Struct({
  _id: optionalText,
  id: optionalText,
  resultId: optionalText,
  timestamp: optionalMetric,
  timestampMs: optionalMetric,
});

export const MonkeytypeIdentityMessageSchema = Schema.Struct({
  source: Schema.Literals([KBGUI_MONKEYTYPE_IDENTITY_SOURCE]),
  type: Schema.Literals(["result-identity"]),
  monkeytypeResultId: Schema.Trim.check(Schema.isMinLength(1), Schema.isMaxLength(160)),
  monkeytypeTimestamp: Schema.optionalKey(Schema.Finite),
});

export function isMonkeytypeResultsUrl(url: string): boolean {
  if (!URL.canParse(url, "https://monkeytype.com")) {
    return /\/results(?:\/|$|\?)/.test(url);
  }
  const parsed = new URL(url, "https://monkeytype.com");
  return (
    (parsed.hostname === "api.monkeytype.com" || parsed.hostname.endsWith(".monkeytype.com")) &&
    parsed.pathname.includes("/results")
  );
}

export function readMonkeytypeResultIdentity(payload: unknown): MonkeytypeResultIdentity | null {
  for (const record of flattenRecords(payload, 0)) {
    const decoded = Schema.decodeUnknownOption(MonkeytypeResultIdentityWireSchema)(record);
    if (Option.isNone(decoded)) continue;
    const id =
      readText(decoded.value._id) ?? readText(decoded.value.id) ?? readText(decoded.value.resultId);
    if (!id) continue;
    const timestamp = decoded.value.timestampMs ?? decoded.value.timestamp;
    return timestamp === undefined
      ? { monkeytypeResultId: id }
      : { monkeytypeResultId: id, monkeytypeTimestamp: timestamp };
  }
  return null;
}

export function identityFromUrl(url: string): MonkeytypeResultIdentity | null {
  if (!URL.canParse(url, "https://monkeytype.com")) return null;
  const parsed = new URL(url, "https://monkeytype.com");
  const id =
    parsed.searchParams.get("id") ??
    parsed.searchParams.get("resultId") ??
    parsed.pathname.match(/\/results\/([A-Za-z0-9_-]+)/)?.[1];
  return id ? { monkeytypeResultId: id } : null;
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
  const decoded = Schema.decodeUnknownOption(MonkeytypeIdentityMessageSchema)(data);
  if (Option.isNone(decoded)) return null;
  return {
    monkeytypeResultId: decoded.value.monkeytypeResultId,
    ...(decoded.value.monkeytypeTimestamp === undefined
      ? {}
      : { monkeytypeTimestamp: decoded.value.monkeytypeTimestamp }),
  };
}

export function readJsonIdentity(raw: string): MonkeytypeResultIdentity | null {
  const payload = Option.getOrNull(Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(raw));
  return payload === null ? null : readMonkeytypeResultIdentity(payload);
}

function flattenRecords(value: unknown, depth: number): unknown[] {
  if (depth > 4 || value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenRecords(item, depth + 1));
  }
  if (!value || typeof value !== "object") return [];
  const nested = Object.values(value).flatMap((item) =>
    item && typeof item === "object" ? flattenRecords(item, depth + 1) : [],
  );
  return [value, ...nested];
}

function readText(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
