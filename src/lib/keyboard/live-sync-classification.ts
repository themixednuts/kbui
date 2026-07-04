import type { ChangeKind } from "./schema";

export type LiveSyncLocalOnlyCategory = "behaviors" | "bindings" | "lighting" | "metadata";

export type LiveSyncChangeOutcome =
  | {
      live: true;
      reason: string;
      status: "live";
    }
  | {
      category: LiveSyncLocalOnlyCategory;
      live: false;
      reason: string;
      status: "local-only";
    }
  | {
      live: false;
      reason: string;
      status: "rebuild-required";
    }
  | {
      live: false;
      reason: string;
      status: "invalid";
    };

export interface LiveSyncLocalOnlyNotice {
  id: string;
  localOnlyCategory?: LiveSyncLocalOnlyCategory;
  path: string;
  reason: string;
}

export interface LiveSyncLocalOnlyReasonSummary {
  category: LiveSyncLocalOnlyCategory;
  changeIds: readonly string[];
  count: number;
  label: string;
  paths: readonly string[];
  reason: string;
}

export interface LiveSyncLocalOnlySummary {
  count: number;
  reasons: readonly LiveSyncLocalOnlyReasonSummary[];
}

export function liveSyncLocalOnlyCategoryLabel(category: LiveSyncLocalOnlyCategory) {
  if (category === "behaviors") return "behaviors";
  if (category === "bindings") return "bindings";
  if (category === "lighting") return "lighting";
  return "metadata";
}

export function defaultLiveSyncLocalOnlyCategory(
  kind: ChangeKind | "keyOverride" | "layerCount" | "layout" | "matrix",
): LiveSyncLocalOnlyCategory {
  if (kind === "lighting") return "lighting";
  if (kind === "binding") return "bindings";
  return "metadata";
}

export function summarizeLiveSyncLocalOnly(
  changes: readonly LiveSyncLocalOnlyNotice[],
): LiveSyncLocalOnlySummary {
  const grouped = new Map<string, LiveSyncLocalOnlyReasonSummary>();

  for (const change of changes) {
    const category = change.localOnlyCategory ?? "metadata";
    const key = `${category}\u001f${change.reason}`;
    const existing = grouped.get(key);
    if (existing) {
      grouped.set(key, {
        ...existing,
        changeIds: [...existing.changeIds, change.id],
        count: existing.count + 1,
        paths: [...existing.paths, change.path],
      });
      continue;
    }

    grouped.set(key, {
      category,
      changeIds: [change.id],
      count: 1,
      label: liveSyncLocalOnlyCategoryLabel(category),
      paths: [change.path],
      reason: change.reason,
    });
  }

  return {
    count: changes.length,
    reasons: [...grouped.values()].sort(
      (left, right) => right.count - left.count || left.label.localeCompare(right.label),
    ),
  };
}
