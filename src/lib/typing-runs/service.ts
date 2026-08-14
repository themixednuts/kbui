import { Effect } from "effect";

import { platformError } from "$lib/effect/errors";
import { runWorkerEffect } from "$lib/effect/worker-runtime";
import {
  decodeSetKeyboardChoicesRequestEffect,
  decodeTaggedRunsFilterEffect,
  decodeTypingRunStatsGroupByEffect,
  TYPING_RUNS_AGENT_NAME,
  type CreatePairingTokenMeta,
  type CreatePairingTokenResponse,
  type ExtensionDeviceDto,
  type IngestRunRequest,
  type PairDeviceRequest,
  type TaggedRun,
  type TypingRunStatsGroup,
} from "$lib/typing-runs/contracts";

export const TYPING_RUNS_REQUIRES_WORKER =
  "Typing run extension features require the worker dev server and a signed-in GitHub session. Run `vp run dev:worker`, sign in, then retry.";

export const createPairingTokenFromEnvironmentEffect = Effect.fn(
  "TypingRunsService.createPairingToken",
)(function* (env: Cloudflare.Env | undefined, userId: string, meta: CreatePairingTokenMeta = {}) {
  return yield* agentCallEffect("create-pairing-token", () =>
    typingRunsAgent(env).createPairingToken(userId, meta),
  );
});

export function createPairingTokenFromEnvironment(
  env: Cloudflare.Env | undefined,
  userId: string,
  meta: CreatePairingTokenMeta = {},
): Promise<CreatePairingTokenResponse> {
  return runTypingEffect(
    "create-pairing-token",
    createPairingTokenFromEnvironmentEffect(env, userId, meta),
  );
}

export const pairExtensionDeviceFromEnvironmentEffect = Effect.fn(
  "TypingRunsService.pairExtensionDevice",
)(function* (env: Cloudflare.Env | undefined, input: PairDeviceRequest) {
  return yield* agentCallEffect("pair-device", () =>
    typingRunsAgent(env).pairDevice(input.code, input),
  );
});

export const resolveExtensionDeviceTokenFromEnvironmentEffect = Effect.fn(
  "TypingRunsService.resolveExtensionDeviceToken",
)(function* (env: Cloudflare.Env | undefined, token: string) {
  const trimmed = token.trim();
  if (!trimmed) return null;
  return yield* agentCallEffect("resolve-device-token", () =>
    typingRunsAgent(env).resolveDeviceToken(trimmed),
  );
});

export const listExtensionDevicesFromEnvironmentEffect = Effect.fn(
  "TypingRunsService.listExtensionDevices",
)(function* (env: Cloudflare.Env | undefined, userId: string) {
  return yield* agentCallEffect("list-devices", () => typingRunsAgent(env).listDevices(userId));
});

export function listExtensionDevicesFromEnvironment(
  env: Cloudflare.Env | undefined,
  userId: string,
): Promise<ExtensionDeviceDto[]> {
  return runTypingEffect("list-devices", listExtensionDevicesFromEnvironmentEffect(env, userId));
}

export const revokeExtensionDeviceFromEnvironmentEffect = Effect.fn(
  "TypingRunsService.revokeExtensionDevice",
)(function* (env: Cloudflare.Env | undefined, userId: string, id: unknown) {
  const deviceId = yield* normalizeEffect("device-id", () => {
    if (typeof id !== "string" || !id.trim()) {
      throw new Error("Extension device id is required.");
    }
    return id.trim();
  });
  return yield* agentCallEffect("revoke-device", () =>
    typingRunsAgent(env).revokeDevice(userId, deviceId),
  );
});

export function revokeExtensionDeviceFromEnvironment(
  env: Cloudflare.Env | undefined,
  userId: string,
  id: unknown,
): Promise<void> {
  return runTypingEffect(
    "revoke-device",
    revokeExtensionDeviceFromEnvironmentEffect(env, userId, id),
  );
}

export const setKeyboardChoicesFromEnvironmentEffect = Effect.fn(
  "TypingRunsService.setKeyboardChoices",
)(function* (env: Cloudflare.Env | undefined, userId: string, rawChoices: unknown) {
  const choices = yield* decodeSetKeyboardChoicesRequestEffect(rawChoices);
  return yield* agentCallEffect("set-keyboard-choices", () =>
    typingRunsAgent(env).setKeyboardChoices(userId, choices),
  );
});

export function setKeyboardChoicesFromEnvironment(
  env: Cloudflare.Env | undefined,
  userId: string,
  rawChoices: unknown,
): Promise<void> {
  return runTypingEffect(
    "set-keyboard-choices",
    setKeyboardChoicesFromEnvironmentEffect(env, userId, rawChoices),
  );
}

export const getKeyboardChoicesFromEnvironmentEffect = Effect.fn(
  "TypingRunsService.getKeyboardChoices",
)(function* (env: Cloudflare.Env | undefined, userId: string) {
  return yield* agentCallEffect("get-keyboard-choices", () =>
    typingRunsAgent(env).getKeyboardChoices(userId),
  );
});

export const ingestTypingRunFromEnvironmentEffect = Effect.fn("TypingRunsService.ingestTypingRun")(
  function* (env: Cloudflare.Env | undefined, userId: string, input: IngestRunRequest) {
    return yield* agentCallEffect("ingest-run", () =>
      typingRunsAgent(env).ingestRun(userId, {
        ...input.capture,
        idempotencyKey: input.idempotencyKey,
      }),
    );
  },
);

export const upsertMonkeytypeResultsFromEnvironmentEffect = Effect.fn(
  "TypingRunsService.upsertMonkeytypeResults",
)(function* (
  env: Cloudflare.Env | undefined,
  userId: string,
  payload: unknown,
  syncedAtMs?: number,
) {
  return yield* agentCallEffect("upsert-monkeytype-results", () =>
    typingRunsAgent(env).upsertMonkeytypeResults(userId, payload, syncedAtMs),
  );
});

export const retryPendingCorrelationFromEnvironmentEffect = Effect.fn(
  "TypingRunsService.retryPendingCorrelation",
)(function* (env: Cloudflare.Env | undefined, userId: string) {
  return yield* agentCallEffect("retry-pending-correlation", () =>
    typingRunsAgent(env).retryPendingCorrelation(userId),
  );
});

export function retryPendingCorrelationFromEnvironment(
  env: Cloudflare.Env | undefined,
  userId: string,
): Promise<number> {
  return runTypingEffect(
    "retry-pending-correlation",
    retryPendingCorrelationFromEnvironmentEffect(env, userId),
  );
}

export const consumeExtensionRateLimitFromEnvironmentEffect = Effect.fn(
  "TypingRunsService.consumeRateLimit",
)(function* (
  env: Cloudflare.Env | undefined,
  key: string,
  spec: { limit: number; windowMs: number },
) {
  return yield* agentCallEffect("consume-rate-limit", () =>
    typingRunsAgent(env).consumeRateLimit(key, spec),
  );
});

export const listTaggedRunsFromEnvironmentEffect = Effect.fn("TypingRunsService.listTaggedRuns")(
  function* (env: Cloudflare.Env | undefined, userId: string, rawFilter: unknown) {
    const filter = yield* decodeTaggedRunsFilterEffect(rawFilter);
    return yield* agentCallEffect("list-tagged-runs", () =>
      typingRunsAgent(env).listTaggedRuns(userId, filter),
    );
  },
);

export function listTaggedRunsFromEnvironment(
  env: Cloudflare.Env | undefined,
  userId: string,
  rawFilter: unknown,
): Promise<TaggedRun[]> {
  return runTypingEffect(
    "list-tagged-runs",
    listTaggedRunsFromEnvironmentEffect(env, userId, rawFilter),
  );
}

export const getTypingRunStatsFromEnvironmentEffect = Effect.fn(
  "TypingRunsService.getTypingRunStats",
)(function* (env: Cloudflare.Env | undefined, userId: string, rawGroupBy: unknown) {
  const groupBy = yield* decodeTypingRunStatsGroupByEffect(rawGroupBy);
  return yield* agentCallEffect("get-stats", () => typingRunsAgent(env).getStats(userId, groupBy));
});

export function getTypingRunStatsFromEnvironment(
  env: Cloudflare.Env | undefined,
  userId: string,
  rawGroupBy: unknown,
): Promise<TypingRunStatsGroup[]> {
  return runTypingEffect(
    "get-stats",
    getTypingRunStatsFromEnvironmentEffect(env, userId, rawGroupBy),
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
