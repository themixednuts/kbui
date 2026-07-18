import { Effect } from "effect";

import { platformError } from "$lib/effect/errors";
import { runWorkerEffect } from "$lib/effect/worker-runtime";
import {
  normalizeIngestRunRequest,
  normalizePairDeviceRequest,
  normalizeSetKeyboardChoicesRequest,
  normalizeTaggedRunsFilter,
  normalizeTypingRunStatsGroupBy,
  TYPING_RUNS_AGENT_NAME,
  type CreatePairingTokenMeta,
  type CreatePairingTokenResponse,
  type ExtensionDeviceDto,
  type IngestRunResponse,
  type KeyboardChoicesResponse,
  type PairDeviceResponse,
  type TaggedRun,
  type TypingRunStatsGroup,
} from "$lib/typing-runs/contracts";

export const TYPING_RUNS_REQUIRES_WORKER =
  "Typing run extension features require the worker dev server and a signed-in GitHub session. Run `vp run dev:worker`, sign in, then retry.";

export function createPairingTokenFromEnvironment(
  env: Cloudflare.Env | undefined,
  userId: string,
  meta: CreatePairingTokenMeta = {},
): Promise<CreatePairingTokenResponse> {
  return runTypingEffect(
    "create-pairing-token",
    agentCallEffect("create-pairing-token", () =>
      typingRunsAgent(env).createPairingToken(userId, meta),
    ),
  );
}

export function pairExtensionDeviceFromEnvironment(
  env: Cloudflare.Env | undefined,
  rawInput: unknown,
): Promise<PairDeviceResponse | null> {
  return runTypingEffect(
    "pair-device",
    Effect.flatMap(
      normalizeEffect("pair-device", () => normalizePairDeviceRequest(rawInput)),
      (input) =>
        agentCallEffect("pair-device", () => typingRunsAgent(env).pairDevice(input.code, input)),
    ),
  );
}

export function resolveExtensionDeviceTokenFromEnvironment(
  env: Cloudflare.Env | undefined,
  token: string,
): Promise<string | null> {
  const trimmed = token.trim();
  if (!trimmed) return runTypingEffect("resolve-empty-device-token", Effect.succeed(null));
  return runTypingEffect(
    "resolve-device-token",
    agentCallEffect("resolve-device-token", () => typingRunsAgent(env).resolveDeviceToken(trimmed)),
  );
}

export function listExtensionDevicesFromEnvironment(
  env: Cloudflare.Env | undefined,
  userId: string,
): Promise<ExtensionDeviceDto[]> {
  return runTypingEffect(
    "list-devices",
    agentCallEffect("list-devices", () => typingRunsAgent(env).listDevices(userId)),
  );
}

export function revokeExtensionDeviceFromEnvironment(
  env: Cloudflare.Env | undefined,
  userId: string,
  id: unknown,
): Promise<void> {
  return runTypingEffect(
    "revoke-device",
    Effect.flatMap(
      normalizeEffect("device-id", () => {
        if (typeof id !== "string" || !id.trim()) {
          throw new Error("Extension device id is required.");
        }
        return id.trim();
      }),
      (deviceId) =>
        agentCallEffect("revoke-device", () => typingRunsAgent(env).revokeDevice(userId, deviceId)),
    ),
  );
}

export function setKeyboardChoicesFromEnvironment(
  env: Cloudflare.Env | undefined,
  userId: string,
  rawChoices: unknown,
): Promise<void> {
  return runTypingEffect(
    "set-keyboard-choices",
    Effect.flatMap(
      normalizeEffect("keyboard-choices", () => normalizeSetKeyboardChoicesRequest(rawChoices)),
      (choices) =>
        agentCallEffect("set-keyboard-choices", () =>
          typingRunsAgent(env).setKeyboardChoices(userId, choices),
        ),
    ),
  );
}

export function getKeyboardChoicesFromEnvironment(
  env: Cloudflare.Env | undefined,
  userId: string,
): Promise<KeyboardChoicesResponse> {
  return runTypingEffect(
    "get-keyboard-choices",
    agentCallEffect("get-keyboard-choices", () => typingRunsAgent(env).getKeyboardChoices(userId)),
  );
}

export function ingestTypingRunFromEnvironment(
  env: Cloudflare.Env | undefined,
  userId: string,
  rawInput: unknown,
): Promise<IngestRunResponse> {
  return runTypingEffect(
    "ingest-run",
    Effect.flatMap(
      normalizeEffect("ingest-run", () => normalizeIngestRunRequest(rawInput)),
      (input) =>
        agentCallEffect("ingest-run", () =>
          typingRunsAgent(env).ingestRun(userId, {
            ...input.capture,
            idempotencyKey: input.idempotencyKey,
          }),
        ),
    ),
  );
}

export function listTaggedRunsFromEnvironment(
  env: Cloudflare.Env | undefined,
  userId: string,
  rawFilter: unknown,
): Promise<TaggedRun[]> {
  return runTypingEffect(
    "list-tagged-runs",
    Effect.flatMap(
      normalizeEffect("tagged-runs-filter", () => normalizeTaggedRunsFilter(rawFilter)),
      (filter) =>
        agentCallEffect("list-tagged-runs", () =>
          typingRunsAgent(env).listTaggedRuns(userId, filter),
        ),
    ),
  );
}

export function getTypingRunStatsFromEnvironment(
  env: Cloudflare.Env | undefined,
  userId: string,
  rawGroupBy: unknown,
): Promise<TypingRunStatsGroup[]> {
  return runTypingEffect(
    "get-stats",
    Effect.flatMap(
      normalizeEffect("stats-group", () => normalizeTypingRunStatsGroupBy(rawGroupBy)),
      (groupBy) =>
        agentCallEffect("get-stats", () => typingRunsAgent(env).getStats(userId, groupBy)),
    ),
  );
}

function normalizeEffect<A>(operation: string, normalize: () => A) {
  return Effect.try({
    try: normalize,
    catch: (cause) => platformError(`typing-runs.${operation}`, cause),
  });
}

function agentCallEffect<A>(operation: string, call: () => PromiseLike<A>) {
  return Effect.tryPromise({
    try: call,
    catch: (cause) => platformError(`typing-runs.agent.${operation}`, cause),
  });
}

function runTypingEffect<A, E>(operation: string, effect: Effect.Effect<A, E>) {
  return runWorkerEffect(`typing-runs.service.${operation}`, effect);
}

function typingRunsAgent(env: Cloudflare.Env | undefined) {
  if (!env?.TypingRunsAgent) {
    throw new Error(TYPING_RUNS_REQUIRES_WORKER);
  }

  const agentId = env.TypingRunsAgent.idFromName(TYPING_RUNS_AGENT_NAME);
  return env.TypingRunsAgent.get(agentId);
}
