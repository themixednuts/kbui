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

export async function createPairingTokenFromEnvironment(
  env: Cloudflare.Env | undefined,
  userId: string,
  meta: CreatePairingTokenMeta = {},
): Promise<CreatePairingTokenResponse> {
  return typingRunsAgent(env).createPairingToken(userId, meta);
}

export async function pairExtensionDeviceFromEnvironment(
  env: Cloudflare.Env | undefined,
  rawInput: unknown,
): Promise<PairDeviceResponse | null> {
  const input = normalizePairDeviceRequest(rawInput);
  return typingRunsAgent(env).pairDevice(input.code, input);
}

export async function resolveExtensionDeviceTokenFromEnvironment(
  env: Cloudflare.Env | undefined,
  token: string,
): Promise<string | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;
  return typingRunsAgent(env).resolveDeviceToken(trimmed);
}

export async function listExtensionDevicesFromEnvironment(
  env: Cloudflare.Env | undefined,
  userId: string,
): Promise<ExtensionDeviceDto[]> {
  return typingRunsAgent(env).listDevices(userId);
}

export async function revokeExtensionDeviceFromEnvironment(
  env: Cloudflare.Env | undefined,
  userId: string,
  id: unknown,
): Promise<void> {
  if (typeof id !== "string" || !id.trim()) throw new Error("Extension device id is required.");
  return typingRunsAgent(env).revokeDevice(userId, id.trim());
}

export async function setKeyboardChoicesFromEnvironment(
  env: Cloudflare.Env | undefined,
  userId: string,
  rawChoices: unknown,
): Promise<void> {
  const choices = normalizeSetKeyboardChoicesRequest(rawChoices);
  return typingRunsAgent(env).setKeyboardChoices(userId, choices);
}

export async function getKeyboardChoicesFromEnvironment(
  env: Cloudflare.Env | undefined,
  userId: string,
): Promise<KeyboardChoicesResponse> {
  return typingRunsAgent(env).getKeyboardChoices(userId);
}

export async function ingestTypingRunFromEnvironment(
  env: Cloudflare.Env | undefined,
  userId: string,
  rawInput: unknown,
): Promise<IngestRunResponse> {
  const input = normalizeIngestRunRequest(rawInput);
  return typingRunsAgent(env).ingestRun(userId, {
    ...input.capture,
    idempotencyKey: input.idempotencyKey,
  });
}

export async function listTaggedRunsFromEnvironment(
  env: Cloudflare.Env | undefined,
  userId: string,
  rawFilter: unknown,
): Promise<TaggedRun[]> {
  const filter = normalizeTaggedRunsFilter(rawFilter);
  return typingRunsAgent(env).listTaggedRuns(userId, filter);
}

export async function getTypingRunStatsFromEnvironment(
  env: Cloudflare.Env | undefined,
  userId: string,
  rawGroupBy: unknown,
): Promise<TypingRunStatsGroup[]> {
  const groupBy = normalizeTypingRunStatsGroupBy(rawGroupBy);
  return typingRunsAgent(env).getStats(userId, groupBy);
}

function typingRunsAgent(env: Cloudflare.Env | undefined) {
  if (!env?.TypingRunsAgent) {
    throw new Error(TYPING_RUNS_REQUIRES_WORKER);
  }

  const agentId = env.TypingRunsAgent.idFromName(TYPING_RUNS_AGENT_NAME);
  return env.TypingRunsAgent.get(agentId);
}
