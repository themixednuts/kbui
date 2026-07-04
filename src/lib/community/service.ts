import { getSeedCommunityKeymap, listSeedCommunityKeymaps } from "$lib/community/catalog";
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

export const COMMUNITY_MUTATION_REQUIRES_WORKER =
  "Community mutations require the worker dev server and a signed-in GitHub session. Run `vp run dev:worker`, sign in, then retry.";

export async function listCommunityKeymapsFromEnvironment(
  env: Cloudflare.Env | undefined,
  rawInput: unknown,
  viewerId?: string,
): Promise<CommunityKeymapCard[]> {
  const input = normalizeCommunityListInput(rawInput);
  if (!env?.CommunityAgent) return listSeedCommunityKeymaps(input);

  const id = env.CommunityAgent.idFromName(COMMUNITY_AGENT_NAME);
  const agent = env.CommunityAgent.get(id);
  return agent.listKeymaps(input, viewerId);
}

export async function getCommunityKeymapFromEnvironment(
  env: Cloudflare.Env | undefined,
  rawId: unknown,
  viewerId?: string,
): Promise<CommunityKeymapDetail | null> {
  const id = normalizeCommunityKeymapId(rawId);
  if (!env?.CommunityAgent) return getSeedCommunityKeymap(id);

  const agentId = env.CommunityAgent.idFromName(COMMUNITY_AGENT_NAME);
  const agent = env.CommunityAgent.get(agentId);
  return agent.getKeymap(id, viewerId);
}

export async function likeCommunityKeymapFromEnvironment(
  env: Cloudflare.Env | undefined,
  rawId: unknown,
  rawUser: unknown,
): Promise<void> {
  const id = normalizeCommunityKeymapId(rawId);
  const user = normalizeCommunityMutationUser(rawUser);
  return communityAgent(env).like(id, user);
}

export async function unlikeCommunityKeymapFromEnvironment(
  env: Cloudflare.Env | undefined,
  rawId: unknown,
  rawUser: unknown,
): Promise<void> {
  const id = normalizeCommunityKeymapId(rawId);
  const user = normalizeCommunityMutationUser(rawUser);
  return communityAgent(env).unlike(id, user);
}

export async function adoptCommunityKeymapFromEnvironment(
  env: Cloudflare.Env | undefined,
  rawInput: unknown,
  rawUser: unknown,
): Promise<CommunityKeymapDetail> {
  const input = normalizeCommunityAdoptInput(rawInput);
  const user = normalizeCommunityMutationUser(rawUser);
  return communityAgent(env).adopt(input, user);
}

export async function reportCommunityKeymapFromEnvironment(
  env: Cloudflare.Env | undefined,
  rawInput: unknown,
  rawUser: unknown,
): Promise<void> {
  const input = normalizeCommunityReportInput(rawInput);
  const user = normalizeCommunityMutationUser(rawUser);
  return communityAgent(env).report(input, user);
}

function communityAgent(env: Cloudflare.Env | undefined) {
  if (!env?.CommunityAgent) {
    throw new Error(COMMUNITY_MUTATION_REQUIRES_WORKER);
  }

  const agentId = env.CommunityAgent.idFromName(COMMUNITY_AGENT_NAME);
  return env.CommunityAgent.get(agentId);
}

export function communityMutationUserFromSessionUser(user: CommunityMutationUser) {
  return normalizeCommunityMutationUser(user);
}
