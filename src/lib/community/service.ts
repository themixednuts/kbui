import { Effect } from "effect";

import { COMMUNITY_AGENT_NAME } from "$lib/community/seed-maps";
import {
  normalizeCommunityAdoptInput,
  normalizeCommunityKeymapId,
  normalizeCommunityListInput,
  normalizeCommunityMutationUser,
  normalizeCommunityReportInput,
  type CommunityKeymapCard,
  type CommunityKeymapDetail,
  type CommunityMutationUser,
} from "$lib/community/types";
import { platformError } from "$lib/effect/errors";
import { runWorkerEffect } from "$lib/effect/worker-runtime";

export const COMMUNITY_MUTATION_REQUIRES_WORKER =
  "Community mutations require the worker dev server and a signed-in GitHub session. Run `vp run dev:worker`, sign in, then retry.";
export const COMMUNITY_REQUIRES_WORKER =
  "Community browsing requires the Cloudflare worker runtime so every result comes from durable SQLite.";

export function listCommunityKeymapsFromEnvironment(
  env: Cloudflare.Env | undefined,
  rawInput: unknown,
  viewerId?: string,
): Promise<CommunityKeymapCard[]> {
  return runCommunityEffect(
    "list-keymaps",
    Effect.flatMap(
      normalizeEffect("list-input", () => normalizeCommunityListInput(rawInput)),
      (input) =>
        agentCallEffect("list-keymaps", () =>
          communityAgent(env, COMMUNITY_REQUIRES_WORKER).listKeymaps(input, viewerId),
        ),
    ),
  );
}

export function getCommunityKeymapFromEnvironment(
  env: Cloudflare.Env | undefined,
  rawId: unknown,
  viewerId?: string,
): Promise<CommunityKeymapDetail | null> {
  return runCommunityEffect(
    "get-keymap",
    Effect.flatMap(
      normalizeEffect("keymap-id", () => normalizeCommunityKeymapId(rawId)),
      (id) =>
        agentCallEffect("get-keymap", () =>
          communityAgent(env, COMMUNITY_REQUIRES_WORKER).getKeymap(id, viewerId),
        ),
    ),
  );
}

export function likeCommunityKeymapFromEnvironment(
  env: Cloudflare.Env | undefined,
  rawId: unknown,
  rawUser: unknown,
): Promise<void> {
  return runCommunityEffect(
    "like",
    Effect.flatMap(
      Effect.all([
        normalizeEffect("keymap-id", () => normalizeCommunityKeymapId(rawId)),
        normalizeEffect("user", () => normalizeCommunityMutationUser(rawUser)),
      ]),
      ([id, user]) => agentCallEffect("like", () => communityAgent(env).like(id, user)),
    ),
  );
}

export function unlikeCommunityKeymapFromEnvironment(
  env: Cloudflare.Env | undefined,
  rawId: unknown,
  rawUser: unknown,
): Promise<void> {
  return runCommunityEffect(
    "unlike",
    Effect.flatMap(
      Effect.all([
        normalizeEffect("keymap-id", () => normalizeCommunityKeymapId(rawId)),
        normalizeEffect("user", () => normalizeCommunityMutationUser(rawUser)),
      ]),
      ([id, user]) => agentCallEffect("unlike", () => communityAgent(env).unlike(id, user)),
    ),
  );
}

export function adoptCommunityKeymapFromEnvironment(
  env: Cloudflare.Env | undefined,
  rawInput: unknown,
  rawUser: unknown,
): Promise<CommunityKeymapDetail> {
  return runCommunityEffect(
    "adopt",
    Effect.flatMap(
      Effect.all([
        normalizeEffect("adopt-input", () => normalizeCommunityAdoptInput(rawInput)),
        normalizeEffect("user", () => normalizeCommunityMutationUser(rawUser)),
      ]),
      ([input, user]) => agentCallEffect("adopt", () => communityAgent(env).adopt(input, user)),
    ),
  );
}

export function reportCommunityKeymapFromEnvironment(
  env: Cloudflare.Env | undefined,
  rawInput: unknown,
  rawUser: unknown,
): Promise<void> {
  return runCommunityEffect(
    "report",
    Effect.flatMap(
      Effect.all([
        normalizeEffect("report-input", () => normalizeCommunityReportInput(rawInput)),
        normalizeEffect("user", () => normalizeCommunityMutationUser(rawUser)),
      ]),
      ([input, user]) => agentCallEffect("report", () => communityAgent(env).report(input, user)),
    ),
  );
}

function normalizeEffect<A>(operation: string, normalize: () => A) {
  return Effect.try({
    try: normalize,
    catch: (cause) => platformError(`community.${operation}`, cause),
  });
}

function agentCallEffect<A>(operation: string, call: () => PromiseLike<A>) {
  return Effect.tryPromise({
    try: call,
    catch: (cause) => platformError(`community.agent.${operation}`, cause),
  });
}

function runCommunityEffect<A, E>(operation: string, effect: Effect.Effect<A, E>) {
  return runWorkerEffect(`community.service.${operation}`, effect);
}

function communityAgent(
  env: Cloudflare.Env | undefined,
  missingBindingMessage = COMMUNITY_MUTATION_REQUIRES_WORKER,
) {
  if (!env?.CommunityAgent) {
    throw new Error(missingBindingMessage);
  }

  const agentId = env.CommunityAgent.idFromName(COMMUNITY_AGENT_NAME);
  return env.CommunityAgent.get(agentId);
}

export function communityMutationUserFromSessionUser(user: CommunityMutationUser) {
  return normalizeCommunityMutationUser(user);
}
