import { defineBackground } from "wxt/utils/define-background";

import {
  idempotencyKeyForCapture,
  type IngestRunRequest,
  type KeyboardChoice,
  type KeyboardChoicesResponse,
  type LayoutChoice
} from "../src/contracts";
import {
  KbguiApiError,
  getExtensionSession,
  getKeyboardChoices,
  normalizeKbguiBaseUrl,
  pairDevice,
  postTypingRun
} from "../src/kbgui/client";
import type {
  BackgroundEnvelope,
  ContentToBackgroundMessage,
  ExtensionUiState,
  RunCapturePostResult
} from "../src/kbgui/messages";
import {
  MONKEYTYPE_PARSER_VERSION
} from "../src/monkeytype/selectors";
import {
  monkeytypeResultToCapture,
  type ParsedMonkeytypeResult
} from "../src/monkeytype/capture";
import {
  DEFAULT_KBGUI_BASE_URL,
  defaultChoices,
  ensureInstallId,
  normalizeQueue,
  readStoredState,
  writeStoredState,
  type PendingRunUpload
} from "../src/storage";

const MAX_QUEUE_ITEMS = 50;
let retryTimer: number | undefined;

export default defineBackground(() => {
  void initializeBackground();

  chrome.runtime.onInstalled.addListener(() => {
    void initializeBackground();
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    void handleMessage(message, sender)
      .then((value) => sendResponse(ok(value)))
      .catch((error) => sendResponse(fail(error)));
    return true;
  });
});

async function initializeBackground(): Promise<void> {
  await ensureInstallId();
  void flushQueue().catch(() => undefined);
}

async function handleMessage(
  rawMessage: unknown,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  if (!isAllowedMonkeytypeSender(sender)) {
    throw new Error("Ignoring message from a non-Monkeytype sender.");
  }

  const message = readMessage(rawMessage);
  switch (message.type) {
    case "GET_STATE":
      await probeSessionIfAvailable();
      return extensionUiState();
    case "SET_BASE_URL":
      await writeStoredState({ kbguiBaseUrl: normalizeKbguiBaseUrl(message.baseUrl) });
      await probeSessionIfAvailable();
      return extensionUiState();
    case "PAIR_DEVICE":
      return pairFromCode(message.code, message.baseUrl);
    case "REFRESH_CHOICES":
      await refreshChoices();
      return extensionUiState();
    case "SAVE_SELECTION":
      return saveSelection(message.keyboardId, message.layoutId, message.repostLatest);
    case "RUN_CAPTURED":
      return handleCapturedRun(message.result);
    case "RETRY_QUEUE":
      await flushQueue();
      return extensionUiState();
    default:
      message satisfies never;
      throw new Error("Unknown extension message.");
  }
}

async function pairFromCode(code: string, baseUrlInput: string | undefined): Promise<ExtensionUiState> {
  const baseUrl = normalizeKbguiBaseUrl(baseUrlInput);
  const installId = await ensureInstallId();
  const version = extensionVersion();
  const response = await pairDevice(
    baseUrl,
    {
      code,
      installId,
      extensionVersion: version,
      label: "kbui Monkeytype Tagger",
      pairedAt: new Date().toISOString()
    },
    version,
  );

  await writeStoredState({
    kbguiBaseUrl: baseUrl,
    deviceToken: response.deviceToken,
    sessionCanUse: false,
    sessionUserId: undefined
  });
  await refreshChoices();
  await flushQueue();
  return extensionUiState();
}

async function probeSessionIfAvailable(): Promise<void> {
  const state = await readStoredState();
  if (state.deviceToken) return;

  try {
    const baseUrl = normalizeKbguiBaseUrl(state.kbguiBaseUrl);
    const session = await getExtensionSession(baseUrl, extensionVersion());
    if (session.canUse) {
      const selections = reconcileSelections(
        session.choices,
        state.selectedKeyboard,
        state.selectedLayout,
      );
      await writeStoredState({
        kbguiBaseUrl: baseUrl,
        cachedChoices: session.choices,
        selectedKeyboard: selections.keyboard,
        selectedLayout: selections.layout,
        sessionCanUse: true,
        sessionUserId: session.user?.id
      });
    } else {
      await writeStoredState({ sessionCanUse: false, sessionUserId: undefined });
    }
  } catch {
    // Session probing is best-effort. Pairing remains the explicit auth path.
    await writeStoredState({ sessionCanUse: false, sessionUserId: undefined });
  }
}

async function refreshChoices(): Promise<KeyboardChoicesResponse> {
  const state = await readStoredState();
  const baseUrl = normalizeKbguiBaseUrl(state.kbguiBaseUrl);
  const choices = await getKeyboardChoices(baseUrl, extensionVersion(), state.deviceToken);
  const selections = reconcileSelections(choices, state.selectedKeyboard, state.selectedLayout);
  await writeStoredState({
    kbguiBaseUrl: baseUrl,
    cachedChoices: choices,
    selectedKeyboard: selections.keyboard,
    selectedLayout: selections.layout
  });
  return choices;
}

async function saveSelection(
  keyboardId: string | undefined,
  layoutId: string | undefined,
  repostLatest: boolean | undefined,
): Promise<{ state: ExtensionUiState; post?: RunCapturePostResult }> {
  const stored = await readStoredState();
  const choices = stored.cachedChoices ?? defaultChoices();
  const selectedKeyboard = findChoice(choices.keyboards, keyboardId, "keyboardId");
  const selectedLayout = findChoice(choices.layouts, layoutId, "layoutId");
  await writeStoredState({ selectedKeyboard, selectedLayout });

  let post: RunCapturePostResult | undefined;
  if (repostLatest && stored.lastRunDraft) {
    post = await postParsedRun(stored.lastRunDraft.result);
  }

  return {
    state: await extensionUiState(),
    post
  };
}

async function handleCapturedRun(result: ParsedMonkeytypeResult): Promise<RunCapturePostResult> {
  await writeStoredState({
    lastRunDraft: {
      result,
      updatedAt: new Date().toISOString()
    }
  });
  return postParsedRun(result);
}

async function postParsedRun(result: ParsedMonkeytypeResult): Promise<RunCapturePostResult> {
  const stored = await readStoredState();
  const queueCount = normalizeQueue(stored.pendingRuns).length;
  if (!stored.selectedKeyboard || !stored.selectedLayout) {
    return { status: "needs-selection", result, queueCount };
  }

  const installId = await ensureInstallId();
  const capture = monkeytypeResultToCapture(result, stored.selectedKeyboard, stored.selectedLayout, {
    installId,
    version: extensionVersion(),
    parserVersion: MONKEYTYPE_PARSER_VERSION
  });
  const idempotencyKey = idempotencyKeyForCapture(capture);
  const request: IngestRunRequest = { capture, idempotencyKey };
  const baseUrl = normalizeKbguiBaseUrl(stored.kbguiBaseUrl);

  try {
    const ingest = await postTypingRun(baseUrl, request, extensionVersion(), stored.deviceToken);
    await flushQueue();
    return {
      status: ingest.status === "duplicate" ? "duplicate" : "posted",
      result,
      capture,
      ingest,
      idempotencyKey,
      queueCount: normalizeQueue((await readStoredState()).pendingRuns).length
    };
  } catch (error) {
    if (error instanceof KbguiApiError && error.status === 401) {
      return {
        status: "unpaired",
        result,
        capture,
        idempotencyKey,
        queueCount,
        error: error.message
      };
    }

    const queued = await queueRun({ idempotencyKey, request }, error);
    scheduleQueueRetry();
    return {
      status: "queued",
      result,
      capture,
      idempotencyKey,
      queueCount: queued.length,
      error: errorMessage(error)
    };
  }
}

async function queueRun(
  upload: Pick<PendingRunUpload, "idempotencyKey" | "request">,
  error: unknown,
): Promise<PendingRunUpload[]> {
  const stored = await readStoredState();
  const queue = normalizeQueue(stored.pendingRuns);
  const existingIndex = queue.findIndex((item) => item.idempotencyKey === upload.idempotencyKey);
  const next: PendingRunUpload = {
    idempotencyKey: upload.idempotencyKey,
    request: upload.request,
    queuedAt: existingIndex >= 0 ? queue[existingIndex].queuedAt : new Date().toISOString(),
    attempts: existingIndex >= 0 ? queue[existingIndex].attempts : 0,
    lastError: errorMessage(error)
  };

  const updated =
    existingIndex >= 0
      ? queue.map((item, index) => (index === existingIndex ? next : item))
      : [next, ...queue].slice(0, MAX_QUEUE_ITEMS);
  await writeStoredState({ pendingRuns: updated });
  return updated;
}

async function flushQueue(): Promise<void> {
  const stored = await readStoredState();
  const queue = normalizeQueue(stored.pendingRuns);
  if (queue.length === 0) return;

  const baseUrl = normalizeKbguiBaseUrl(stored.kbguiBaseUrl);
  const remaining: PendingRunUpload[] = [];

  for (const upload of queue) {
    try {
      await postTypingRun(baseUrl, upload.request, extensionVersion(), stored.deviceToken);
    } catch (error) {
      remaining.push({
        ...upload,
        attempts: upload.attempts + 1,
        lastError: errorMessage(error)
      });
    }
  }

  await writeStoredState({ pendingRuns: remaining });
  if (remaining.length > 0) scheduleQueueRetry();
}

function scheduleQueueRetry(): void {
  if (retryTimer !== undefined) return;
  retryTimer = globalThis.setTimeout(() => {
    retryTimer = undefined;
    void flushQueue().catch(() => undefined);
  }, 15_000);
}

async function extensionUiState(): Promise<ExtensionUiState> {
  const stored = await readStoredState();
  const baseUrl = normalizeKbguiBaseUrl(stored.kbguiBaseUrl);
  const choices = stored.cachedChoices ?? defaultChoices();
  const sessionCanUse = !stored.deviceToken && Boolean(stored.sessionCanUse);

  return {
    baseUrl,
    paired: Boolean(stored.deviceToken),
    sessionCanUse,
    userId: stored.sessionUserId,
    choices,
    selectedKeyboard: stored.selectedKeyboard,
    selectedLayout: stored.selectedLayout,
    queueCount: normalizeQueue(stored.pendingRuns).length
  };
}

function reconcileSelections(
  choices: KeyboardChoicesResponse,
  keyboard: KeyboardChoice | undefined,
  layout: LayoutChoice | undefined,
): { keyboard?: KeyboardChoice; layout?: LayoutChoice } {
  return {
    keyboard:
      choices.keyboards.find((choice) => choice.keyboardId === keyboard?.keyboardId) ??
      choices.keyboards[0],
    layout:
      choices.layouts.find((choice) => choice.layoutId === layout?.layoutId) ?? choices.layouts[0]
  };
}

function findChoice<T extends KeyboardChoice | LayoutChoice, K extends "keyboardId" | "layoutId">(
  choices: T[],
  id: string | undefined,
  key: K,
): T | undefined {
  if (!id) return undefined;
  return choices.find((choice) => String(choice[key]) === id);
}

function readMessage(raw: unknown): ContentToBackgroundMessage {
  if (!raw || typeof raw !== "object" || !("type" in raw)) {
    throw new Error("Extension message must be an object.");
  }
  return raw as ContentToBackgroundMessage;
}

function isAllowedMonkeytypeSender(sender: chrome.runtime.MessageSender): boolean {
  const url = sender.url ?? sender.origin;
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === "monkeytype.com";
  } catch {
    return false;
  }
}

function extensionVersion(): string {
  return chrome.runtime.getManifest().version;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown extension error.";
}

function ok<T>(value: T): BackgroundEnvelope<T> {
  return { ok: true, value };
}

function fail(error: unknown): BackgroundEnvelope<never> {
  return { ok: false, error: errorMessage(error) };
}
