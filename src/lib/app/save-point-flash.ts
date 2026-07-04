import type { LiveSyncChangeNotice } from "$lib/app/via-live-sync.svelte";
import { classifyViaProfileChanges, type ClassifiedViaChange } from "$lib/keyboard/via-live";
import { classifyZmkProfileChanges, type ClassifiedZmkChange } from "$lib/keyboard/zmk-live";
import type { DeviceProfile } from "$lib/keyboard/schema";
import type { ConnectionState } from "$lib/keyboard/transport";

export type SavePointFlashPlan =
  | {
      changes: LiveSyncChangeNotice[];
      kind: "live-apply";
      message: string;
      profile: DeviceProfile;
    }
  | {
      changes: LiveSyncChangeNotice[];
      kind: "firmware-overlay";
      profile: DeviceProfile;
    };

export interface PlanSavePointFlashInput {
  baseProfile: DeviceProfile;
  connection: ConnectionState | null | undefined;
  profile: DeviceProfile;
  savePointLabel: string;
}

type ClassifiedSavePointChange = ClassifiedViaChange | ClassifiedZmkChange;

export function planSavePointFlash(input: PlanSavePointFlashInput): SavePointFlashPlan {
  const changes = classifySavePointTarget(input.baseProfile, input.profile, input.connection);
  const notices = changes.map(toNotice);
  const liveOnly = changes.length > 0 && changes.every(isLiveWritable);
  const matchingLiveConnection = canLiveApply(input.connection, input.profile);

  if (matchingLiveConnection && (liveOnly || changes.length === 0)) {
    return {
      changes: notices,
      kind: "live-apply",
      message:
        changes.length === 0
          ? `${input.savePointLabel} already matches the active device base.`
          : `Loaded ${input.savePointLabel} as the active draft; live sync will write ${changes.length} key ${changes.length === 1 ? "change" : "changes"} to the connected board.`,
      profile: input.profile,
    };
  }

  return {
    changes: notices,
    kind: "firmware-overlay",
    profile: input.profile,
  };
}

function classifySavePointTarget(
  baseProfile: DeviceProfile,
  profile: DeviceProfile,
  connection: ConnectionState | null | undefined,
): ClassifiedSavePointChange[] {
  if (profile.protocol === "zmk-studio") {
    return classifyZmkProfileChanges(baseProfile, profile, connection);
  }

  return classifyViaProfileChanges(baseProfile, profile);
}

function canLiveApply(
  connection: ConnectionState | null | undefined,
  profile: DeviceProfile,
): boolean {
  if (connection?.status !== "connected") return false;
  if (profile.protocol === "via-v3") {
    return connection.protocol === "via-v3" && connection.transport === "webhid";
  }
  if (profile.protocol === "zmk-studio") {
    return connection.protocol === "zmk-studio" && connection.zmkStudio?.lockState === "unlocked";
  }
  return false;
}

function isLiveWritable(change: ClassifiedSavePointChange): boolean {
  return change.classification === "liveViaWritable" || change.classification === "liveZmkWritable";
}

function toNotice(change: ClassifiedSavePointChange): LiveSyncChangeNotice {
  return {
    id: change.id,
    path: change.path,
    reason: change.reason,
    scope: change.scope,
  };
}
