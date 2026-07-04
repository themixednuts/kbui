import { command, getRequestEvent, query } from "$app/server";
import { error } from "@sveltejs/kit";

import {
  adoptCommunityKeymapFromEnvironment,
  COMMUNITY_MUTATION_REQUIRES_WORKER,
  getCommunityKeymapFromEnvironment,
  likeCommunityKeymapFromEnvironment,
  listCommunityKeymapsFromEnvironment,
  reportCommunityKeymapFromEnvironment,
  unlikeCommunityKeymapFromEnvironment,
} from "$lib/community/service";
import type { CommunityMutationUser } from "$lib/community/types";

export const listCommunityKeymaps = query("unchecked", async (rawInput: unknown) => {
  const event = getRequestEvent();
  return listCommunityKeymapsFromEnvironment(event.platform?.env, rawInput, event.locals.user?.id);
});

export const getCommunityKeymap = query("unchecked", async (rawId: unknown) => {
  const event = getRequestEvent();
  return getCommunityKeymapFromEnvironment(event.platform?.env, rawId, event.locals.user?.id);
});

export const likeCommunityKeymap = command("unchecked", async (rawId: unknown) => {
  const event = getRequestEvent();
  const user = requireCommunitySession(event.locals.user);
  assertCommunityMutationBinding(event.platform?.env);

  return likeCommunityKeymapFromEnvironment(event.platform?.env, rawId, user);
});

export const unlikeCommunityKeymap = command("unchecked", async (rawId: unknown) => {
  const event = getRequestEvent();
  const user = requireCommunitySession(event.locals.user);
  assertCommunityMutationBinding(event.platform?.env);

  return unlikeCommunityKeymapFromEnvironment(event.platform?.env, rawId, user);
});

export const adoptCommunityKeymap = command("unchecked", async (rawInput: unknown) => {
  const event = getRequestEvent();
  const user = requireCommunitySession(event.locals.user);
  assertCommunityMutationBinding(event.platform?.env);

  return adoptCommunityKeymapFromEnvironment(event.platform?.env, rawInput, user);
});

export const reportCommunityKeymap = command("unchecked", async (rawInput: unknown) => {
  const event = getRequestEvent();
  const user = requireCommunitySession(event.locals.user);
  assertCommunityMutationBinding(event.platform?.env);

  return reportCommunityKeymapFromEnvironment(event.platform?.env, rawInput, user);
});

function requireCommunitySession(user: App.Locals["user"]): CommunityMutationUser {
  if (!user?.id) {
    error(401, "Sign in with GitHub to use community likes, adoptions, and reports.");
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
  };
}

function assertCommunityMutationBinding(
  env: Cloudflare.Env | undefined,
): asserts env is Cloudflare.Env {
  if (!env?.CommunityAgent) {
    error(503, COMMUNITY_MUTATION_REQUIRES_WORKER);
  }
}
