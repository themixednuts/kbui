import type {
  IngestRunRequest,
  KeyboardChoice,
  KeyboardChoicesResponse,
  LayoutChoice
} from "./contracts";
import type { ParsedMonkeytypeResult } from "./monkeytype/capture";

export const DEFAULT_KBGUI_BASE_URL = __KBGUI_BASE_URL__;

export interface PendingRunUpload {
  idempotencyKey: string;
  request: IngestRunRequest;
  queuedAt: string;
  attempts: number;
  lastError?: string;
}

export interface LastRunDraft {
  result: ParsedMonkeytypeResult;
  updatedAt: string;
}

export interface StoredExtensionState {
  kbguiBaseUrl?: string;
  deviceToken?: string;
  sessionCanUse?: boolean;
  sessionUserId?: string;
  installId?: string;
  cachedChoices?: KeyboardChoicesResponse;
  selectedKeyboard?: KeyboardChoice;
  selectedLayout?: LayoutChoice;
  pendingRuns?: PendingRunUpload[];
  lastRunDraft?: LastRunDraft;
}

export async function readStoredState(): Promise<StoredExtensionState> {
  return localGet<StoredExtensionState>(null);
}

export async function writeStoredState(next: Partial<StoredExtensionState>): Promise<void> {
  await localSet(next);
}

export async function ensureInstallId(): Promise<string> {
  const { installId } = await readStoredState();
  if (installId) return installId;
  const nextInstallId = randomId();
  await writeStoredState({ installId: nextInstallId });
  return nextInstallId;
}

export function defaultChoices(): KeyboardChoicesResponse {
  return { keyboards: [], layouts: [] };
}

export function normalizeQueue(value: PendingRunUpload[] | undefined): PendingRunUpload[] {
  return Array.isArray(value) ? value : [];
}

function localGet<T extends Record<string, unknown>>(keys: string[] | string | null): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (items) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(items as T);
    });
  });
}

function localSet(values: Partial<StoredExtensionState>): Promise<void> {
  const entries = Object.entries(values);
  const keysToRemove = entries
    .filter(([, value]) => value === undefined)
    .map(([key]) => key);
  const valuesToSet = Object.fromEntries(
    entries.filter(([, value]) => value !== undefined),
  ) as Partial<StoredExtensionState>;

  return new Promise((resolve, reject) => {
    chrome.storage.local.set(valuesToSet, () => {
      const setError = chrome.runtime.lastError;
      if (setError) {
        reject(new Error(setError.message));
        return;
      }

      if (keysToRemove.length === 0) {
        resolve();
        return;
      }

      chrome.storage.local.remove(keysToRemove, () => {
        const removeError = chrome.runtime.lastError;
        if (removeError) {
          reject(new Error(removeError.message));
          return;
        }
        resolve();
      });
    });
  });
}

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
