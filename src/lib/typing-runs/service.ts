import { Clock, Effect } from "effect";

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
import { decodeRateLimitSpecEffect } from "$lib/typing-runs/rate-limit";
import { decodeMonkeytypeResultsEffect } from "$lib/typing-runs/monkeytype-results";

export const TYPING_RUNS_REQUIRES_WORKER =
  "Typing run extension features require the worker dev server and a signed-in GitHub session. Run `vp run dev:worker`, sign in, then retry.";

type TypingRunsAgentRpc = ReturnType<NonNullable<Cloudflare.Env["TypingRunsAgent"]>["get"]>;

export const createPairingTokenFromEnvironmentEffect = Effect.fn(
  "TypingRunsService.createPairingToken",
)(function* (env: Cloudflare.Env | undefined, userId: string, meta: CreatePairingTokenMeta = {}) {
  return yield* agentCallEffect(env, "create-pairing-token", (agent) =>
    agent.createPairingToken(userId, meta),
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
  return yield* agentCallEffect(env, "pair-device", (agent) => agent.pairDevice(input.code, input));
});

export const resolveExtensionDeviceTokenFromEnvironmentEffect = Effect.fn(
  "TypingRunsService.resolveExtensionDeviceToken",
)(function* (env: Cloudflare.Env | undefined, token: string) {
  const trimmed = token.trim();
  if (!trimmed) return null;
  return yield* agentCallEffect(env, "resolve-device-token", (agent) =>
    agent.resolveDeviceToken(trimmed),
  );
});

export const listExtensionDevicesFromEnvironmentEffect = Effect.fn(
  "TypingRunsService.listExtensionDevices",
)(function* (env: Cloudflare.Env | undefined, userId: string) {
  return yield* agentCallEffect(env, "list-devices", (agent) => agent.listDevices(userId));
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
  return yield* agentCallEffect(env, "revoke-device", (agent) =>
    agent.revokeDevice(userId, deviceId),
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
  return yield* agentCallEffect(env, "set-keyboard-choices", (agent) =>
    agent.setKeyboardChoices(userId, choices),
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
  return yield* agentCallEffect(env, "get-keyboard-choices", (agent) =>
    agent.getKeyboardChoices(userId),
  );
});

export const ingestTypingRunFromEnvironmentEffect = Effect.fn("TypingRunsService.ingestTypingRun")(
  function* (env: Cloudflare.Env | undefined, userId: string, input: IngestRunRequest) {
    return yield* agentCallEffect(env, "ingest-run", (agent) =>
      agent.ingestRun(userId, {
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
  const syncedAt = syncedAtMs ?? (yield* Clock.currentTimeMillis);
  const rows = yield* decodeMonkeytypeResultsEffect(payload, syncedAt);
  return yield* agentCallEffect(env, "upsert-monkeytype-results", (agent) =>
    agent.upsertMonkeytypeResults(userId, rows),
  );
});

export const retryPendingCorrelationFromEnvironmentEffect = Effect.fn(
  "TypingRunsService.retryPendingCorrelation",
)(function* (env: Cloudflare.Env | undefined, userId: string) {
  return yield* agentCallEffect(env, "retry-pending-correlation", (agent) =>
    agent.retryPendingCorrelation(userId),
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
)(function* (env: Cloudflare.Env | undefined, key: string, spec: unknown) {
  const decoded = yield* decodeRateLimitSpecEffect(spec);
  return yield* agentCallEffect(env, "consume-rate-limit", (agent) =>
    agent.consumeRateLimit(key, decoded),
  );
});

export const listTaggedRunsFromEnvironmentEffect = Effect.fn("TypingRunsService.listTaggedRuns")(
  function* (env: Cloudflare.Env | undefined, userId: string, rawFilter: unknown) {
    const filter = yield* decodeTaggedRunsFilterEffect(rawFilter);
    return yield* agentCallEffect(env, "list-tagged-runs", (agent) =>
      agent.listTaggedRuns(userId, filter),
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
  return yield* agentCallEffect(env, "get-stats", (agent) => agent.getStats(userId, groupBy));
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

function agentCallEffect<A>(
  env: Cloudflare.Env | undefined,
  operation: string,
  call: (agent: TypingRunsAgentRpc) => PromiseLike<A>,
) {
  return Effect.gen(function* () {
    const agent = yield* typingRunsAgentEffect(env);
    return yield* Effect.tryPromise({
      try: () => call(agent),
      catch: (cause) => platformError(`typing-runs.agent.${operation}`, cause),
    });
  });
}

function runTypingEffect<A, E>(operation: string, effect: Effect.Effect<A, E>) {
  return runWorkerEffect(`typing-runs.service.${operation}`, effect);
}

function typingRunsAgentEffect(env: Cloudflare.Env | undefined) {
  if (!env?.TypingRunsAgent) {
    return Effect.fail(
      platformError("typing-runs.agent.binding", new Error(TYPING_RUNS_REQUIRES_WORKER)),
    );
  }

  const agentId = env.TypingRunsAgent.idFromName(TYPING_RUNS_AGENT_NAME);
  return Effect.succeed(env.TypingRunsAgent.get(agentId));
}
