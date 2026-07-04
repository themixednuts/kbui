import { getSeedCommunityKeymap, listSeedCommunityKeymaps } from "$lib/community/catalog";
import { COMMUNITY_AGENT_NAME } from "$lib/community/seed-maps";
import {
  normalizeCommunityKeymapId,
  normalizeCommunityListInput,
  type CommunityKeymapCard,
  type CommunityKeymapDetail,
} from "$lib/community/types";

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
