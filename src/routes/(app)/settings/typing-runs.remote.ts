import { command, getRequestEvent, query } from "$app/server";
import { error } from "@sveltejs/kit";

import {
  createPairingTokenFromEnvironment,
  getTypingRunStatsFromEnvironment,
  listExtensionDevicesFromEnvironment,
  listTaggedRunsFromEnvironment,
  revokeExtensionDeviceFromEnvironment,
  setKeyboardChoicesFromEnvironment,
  TYPING_RUNS_REQUIRES_WORKER,
} from "$lib/typing-runs/service";

export const createExtensionPairingToken = command(async () => {
  const event = getRequestEvent();
  const userId = requireExtensionSession(event.locals.user);
  assertTypingRunsBinding(event.platform?.env);

  return createPairingTokenFromEnvironment(event.platform?.env, userId);
});

export const listExtensionDevices = query(async () => {
  const event = getRequestEvent();
  const userId = requireExtensionSession(event.locals.user);
  assertTypingRunsBinding(event.platform?.env);

  return listExtensionDevicesFromEnvironment(event.platform?.env, userId);
});

export const revokeExtensionDevice = command("unchecked", async (id: unknown) => {
  const event = getRequestEvent();
  const userId = requireExtensionSession(event.locals.user);
  assertTypingRunsBinding(event.platform?.env);

  await revokeExtensionDeviceFromEnvironment(event.platform?.env, userId, id);
});

export const listTaggedRuns = query("unchecked", async (rawFilter: unknown) => {
  const event = getRequestEvent();
  const userId = requireExtensionSession(event.locals.user);
  assertTypingRunsBinding(event.platform?.env);

  return listTaggedRunsFromEnvironment(event.platform?.env, userId, rawFilter);
});

export const getTypingRunStats = query("unchecked", async (rawGroupBy: unknown) => {
  const event = getRequestEvent();
  const userId = requireExtensionSession(event.locals.user);
  assertTypingRunsBinding(event.platform?.env);

  return getTypingRunStatsFromEnvironment(event.platform?.env, userId, rawGroupBy);
});

export const syncExtensionKeyboardChoices = command("unchecked", async (rawChoices: unknown) => {
  const event = getRequestEvent();
  const userId = requireExtensionSession(event.locals.user);
  assertTypingRunsBinding(event.platform?.env);

  await setKeyboardChoicesFromEnvironment(event.platform?.env, userId, rawChoices);
});

function requireExtensionSession(user: App.Locals["user"]): string {
  if (!user?.id) {
    error(401, "Sign in with GitHub to manage the Monkeytype run tagger extension.");
  }
  return user.id;
}

function assertTypingRunsBinding(env: Cloudflare.Env | undefined): asserts env is Cloudflare.Env {
  if (!env?.TypingRunsAgent) {
    error(503, TYPING_RUNS_REQUIRES_WORKER);
  }
}
