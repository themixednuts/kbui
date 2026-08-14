import type { KeyboardChoice, LayoutChoice, MonkeytypeRunCapture } from "../contracts";
import {
  MONKEYTYPE_PARSER_VERSION,
  MONKEYTYPE_RESULT_SELECTORS,
  readMonkeytypeText
} from "./selectors";

export interface ParsedMonkeytypeResult {
  capturedAt: string;
  monkeytypeResultId?: string;
  monkeytypeTimestamp?: number;
  wpm: number;
  rawWpm?: number;
  acc: number;
  consistency?: number;
  testDuration?: number;
  mode?: string;
  mode2?: string;
  testTypeText?: string;
  language?: string;
  difficulty?: string;
  punctuation?: boolean;
  numbers?: boolean;
}

export interface ExtensionCaptureMetadata {
  installId: string;
  version: string;
  parserVersion?: string;
}

export interface MonkeytypeCaptureObserver {
  start(): void;
  stop(): void;
  reset(): void;
}

export interface MonkeytypeCaptureObserverOptions {
  rootDocument?: Document;
  rootWindow?: Window;
  scanIntervalMs?: number;
  settleWindowMs?: number;
  onStableResult(result: ParsedMonkeytypeResult): void | Promise<void>;
}

interface StableResultGate {
  push(result: ParsedMonkeytypeResult | null): ParsedMonkeytypeResult | null;
  resetPanel(): void;
}

const KNOWN_DIFFICULTIES = new Set(["normal", "expert", "master"]);
const KNOWN_MODES = new Set(["time", "words", "quote", "custom", "zen"]);

export function readMonkeytypeResult(
  root: ParentNode = document,
  now: () => string = () => new Date().toISOString(),
): ParsedMonkeytypeResult | null {
  const resultElement = root.querySelector(MONKEYTYPE_RESULT_SELECTORS.result);
  if (!resultElement || !resultElementIsVisible(resultElement)) return null;

  const wpm = parseNumber(readMonkeytypeText(root, "wpm"));
  const rawWpm = parseNumber(readMonkeytypeText(root, "rawWpm"));
  const acc = parseNumber(readMonkeytypeText(root, "acc"));
  const consistency = parseNumber(readMonkeytypeText(root, "consistency"));
  const testTypeText = readMonkeytypeText(root, "testType") ?? undefined;
  const timeText = readMonkeytypeText(root, "time");
  const parsedType = parseTestType(testTypeText);
  const testDuration =
    parseDuration(timeText) ??
    (parsedType.mode === "time" ? parseDuration(parsedType.mode2) : undefined);

  if (wpm === undefined || acc === undefined) return null;
  if (!testTypeText && !parsedType.mode) return null;
  if (consistency === undefined && testDuration === undefined) return null;

  return compactResult({
    capturedAt: now(),
    wpm,
    rawWpm,
    acc,
    consistency,
    testDuration,
    mode: parsedType.mode,
    mode2: parsedType.mode2,
    testTypeText,
    language: parsedType.language,
    difficulty: parsedType.difficulty,
    punctuation: parsedType.punctuation,
    numbers: parsedType.numbers
  });
}

export function monkeytypeResultToCapture(
  result: ParsedMonkeytypeResult,
  keyboard: KeyboardChoice,
  layout: LayoutChoice,
  extension: ExtensionCaptureMetadata,
): MonkeytypeRunCapture {
  return {
    source: "monkeytype-extension-dom-v1",
    capturedAt: result.capturedAt,
    monkeytypeResultId: result.monkeytypeResultId,
    monkeytypeTimestamp: result.monkeytypeTimestamp,
    wpm: result.wpm,
    rawWpm: result.rawWpm,
    acc: result.acc,
    consistency: result.consistency,
    testDuration: result.testDuration,
    mode: result.mode,
    mode2: result.mode2,
    testTypeText: result.testTypeText,
    language: result.language,
    difficulty: result.difficulty,
    punctuation: result.punctuation,
    numbers: result.numbers,
    keyboard,
    layout,
    extension: {
      installId: extension.installId,
      version: extension.version,
      parserVersion: extension.parserVersion ?? MONKEYTYPE_PARSER_VERSION
    }
  };
}

export function stableResultKey(result: ParsedMonkeytypeResult): string {
  return JSON.stringify({
    wpm: result.wpm,
    rawWpm: result.rawWpm,
    acc: result.acc,
    consistency: result.consistency,
    testDuration: result.testDuration,
    mode: result.mode,
    mode2: result.mode2,
    testTypeText: result.testTypeText,
    language: result.language,
    difficulty: result.difficulty,
    punctuation: result.punctuation,
    numbers: result.numbers
  });
}

export function createStableResultGate(): StableResultGate {
  let previousKey: string | null = null;
  let consecutiveReads = 0;
  let emittedKey: string | null = null;

  return {
    push(result) {
      if (!result) {
        previousKey = null;
        consecutiveReads = 0;
        return null;
      }

      const key = stableResultKey(result);
      if (key === previousKey) {
        consecutiveReads += 1;
      } else {
        previousKey = key;
        consecutiveReads = 1;
      }

      if (consecutiveReads >= 2 && key !== emittedKey) {
        emittedKey = key;
        return result;
      }

      return null;
    },
    resetPanel() {
      previousKey = null;
      consecutiveReads = 0;
      emittedKey = null;
    }
  };
}

export function createMonkeytypeCaptureObserver(
  options: MonkeytypeCaptureObserverOptions,
): MonkeytypeCaptureObserver {
  const rootDocument = options.rootDocument ?? document;
  const rootWindow = options.rootWindow ?? window;
  const scanIntervalMs = options.scanIntervalMs ?? 250;
  const settleWindowMs = options.settleWindowMs ?? 2_000;
  const gate = createStableResultGate();
  let observer: MutationObserver | null = null;
  let routeCleanup: (() => void) | null = null;
  let timer: number | null = null;
  let stopped = true;

  function clearTimer() {
    if (timer !== null) {
      rootWindow.clearTimeout(timer);
      timer = null;
    }
  }

  function scanOnce(): boolean {
    const result = readMonkeytypeResult(rootDocument);
    if (!result) {
      const resultElement = rootDocument.querySelector(MONKEYTYPE_RESULT_SELECTORS.result);
      if (!resultElement || !resultElementIsVisible(resultElement)) gate.resetPanel();
      return false;
    }

    const stable = gate.push(result);
    if (!stable) return false;
    void options.onStableResult(stable);
    return true;
  }

  function scheduleSettleScan() {
    if (stopped) return;
    clearTimer();
    const deadline = Date.now() + settleWindowMs;

    function tick() {
      if (stopped) return;
      const emitted = scanOnce();
      if (emitted || Date.now() >= deadline) {
        timer = null;
        return;
      }
      timer = rootWindow.setTimeout(tick, scanIntervalMs);
    }

    tick();
  }

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      observer = new rootWindow.MutationObserver(scheduleSettleScan);
      observer.observe(rootDocument.documentElement, {
        attributes: true,
        attributeFilter: ["aria-hidden", "class", "hidden", "style"],
        childList: true,
        subtree: true
      });
      routeCleanup = installSpaRouteListener(rootWindow, () => {
        gate.resetPanel();
        scheduleSettleScan();
      });
      scheduleSettleScan();
    },
    stop() {
      stopped = true;
      clearTimer();
      observer?.disconnect();
      observer = null;
      routeCleanup?.();
      routeCleanup = null;
    },
    reset() {
      gate.resetPanel();
      scheduleSettleScan();
    }
  };
}

export function installSpaRouteListener(targetWindow: Window, callback: () => void): () => void {
  const history = targetWindow.history;
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  const notify = () => targetWindow.setTimeout(callback, 0);

  history.pushState = function pushState(
    this: History,
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ) {
    const result = originalPushState.call(this, data, unused, url);
    notify();
    return result;
  };

  history.replaceState = function replaceState(
    this: History,
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ) {
    const result = originalReplaceState.call(this, data, unused, url);
    notify();
    return result;
  };

  targetWindow.addEventListener("popstate", notify);
  targetWindow.addEventListener("hashchange", notify);

  return () => {
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
    targetWindow.removeEventListener("popstate", notify);
    targetWindow.removeEventListener("hashchange", notify);
  };
}

function resultElementIsVisible(element: Element): boolean {
  const htmlElement = element as HTMLElement;
  if (htmlElement.hidden) return false;
  if (htmlElement.getAttribute("aria-hidden") === "true") return false;

  const inlineStyle = htmlElement.getAttribute("style")?.toLowerCase() ?? "";
  if (/display\s*:\s*none/.test(inlineStyle)) return false;
  if (/visibility\s*:\s*hidden/.test(inlineStyle)) return false;

  const view = htmlElement.ownerDocument.defaultView;
  if (!view || !htmlElement.isConnected) return true;

  const computed = view.getComputedStyle(htmlElement);
  return computed.display !== "none" && computed.visibility !== "hidden";
}

function parseNumber(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseDuration(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  const clock = normalized.match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
  if (clock) {
    const first = Number(clock[1]);
    const second = Number(clock[2]);
    const third = clock[3] ? Number(clock[3]) : undefined;
    return third === undefined ? first * 60 + second : first * 3600 + second * 60 + third;
  }

  const numeric = parseNumber(normalized);
  return numeric === undefined ? undefined : numeric;
}

function parseTestType(value: string | null | undefined): Partial<ParsedMonkeytypeResult> {
  if (!value) return {};
  const tokens = value
    .replace(/[·|,/]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const lowerTokens = tokens.map((token) => token.toLowerCase());
  const modeIndex = lowerTokens.findIndex((token) => KNOWN_MODES.has(token));
  const mode = modeIndex >= 0 ? lowerTokens[modeIndex] : lowerTokens[0];
  const afterMode = modeIndex >= 0 ? tokens.slice(modeIndex + 1) : tokens.slice(1);
  const mode2 = afterMode.find((token) => !isBooleanFlag(token) && !isDifficulty(token));
  const language = afterMode.find(
    (token) => token !== mode2 && !isBooleanFlag(token) && !isDifficulty(token),
  );
  const difficulty = lowerTokens.find((token) => KNOWN_DIFFICULTIES.has(token));

  return {
    mode,
    mode2,
    language,
    difficulty,
    punctuation: lowerTokens.includes("punctuation") ? true : undefined,
    numbers: lowerTokens.includes("numbers") ? true : undefined
  };
}

function isBooleanFlag(value: string): boolean {
  const normalized = value.toLowerCase();
  return normalized === "punctuation" || normalized === "numbers";
}

function isDifficulty(value: string): boolean {
  return KNOWN_DIFFICULTIES.has(value.toLowerCase());
}

function compactResult(result: ParsedMonkeytypeResult): ParsedMonkeytypeResult {
  return Object.fromEntries(
    Object.entries(result).filter(([, value]) => value !== undefined),
  ) as unknown as ParsedMonkeytypeResult;
}
