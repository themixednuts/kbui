import type {
  IngestRunResponse,
  KeyboardChoice,
  KeyboardChoicesResponse,
  LayoutChoice,
  MonkeytypeRunCapture,
  PairDeviceResponse
} from "../contracts";
import type { ParsedMonkeytypeResult } from "../monkeytype/capture";

export interface ExtensionUiState {
  baseUrl: string;
  paired: boolean;
  sessionCanUse: boolean;
  userId?: string;
  choices: KeyboardChoicesResponse;
  selectedKeyboard?: KeyboardChoice;
  selectedLayout?: LayoutChoice;
  queueCount: number;
}

export interface RunCapturePostResult {
  status: "posted" | "duplicate" | "queued" | "needs-selection" | "unpaired" | "error";
  result: ParsedMonkeytypeResult;
  capture?: MonkeytypeRunCapture;
  ingest?: IngestRunResponse;
  idempotencyKey?: string;
  queueCount: number;
  error?: string;
}

export type ContentRunState =
  | { status: "idle" }
  | { status: "capturing"; result: ParsedMonkeytypeResult }
  | { status: RunCapturePostResult["status"]; post: RunCapturePostResult };

export type ContentToBackgroundMessage =
  | { type: "GET_STATE" }
  | { type: "SET_BASE_URL"; baseUrl: string }
  | { type: "PAIR_DEVICE"; code: string; baseUrl?: string }
  | { type: "REFRESH_CHOICES" }
  | {
      type: "SAVE_SELECTION";
      keyboardId?: string;
      layoutId?: string;
      repostLatest?: boolean;
    }
  | { type: "RUN_CAPTURED"; result: ParsedMonkeytypeResult }
  | { type: "RETRY_QUEUE" };

export type BackgroundMessageResult =
  | ExtensionUiState
  | PairDeviceResponse
  | RunCapturePostResult
  | { state: ExtensionUiState; post?: RunCapturePostResult };

export type BackgroundEnvelope<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export function sendBackgroundMessage<T extends BackgroundMessageResult>(
  message: ContentToBackgroundMessage,
): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: BackgroundEnvelope<T> | undefined) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }

      if (!response) {
        reject(new Error("No response from the kbgui extension background worker."));
        return;
      }

      if (!response.ok) {
        reject(new Error(response.error));
        return;
      }

      resolve(response.value);
    });
  });
}
