import { command, getRequestEvent, query } from "$app/server";
import { error } from "@sveltejs/kit";

import {
  createPairingTokenFromEnvironment,
  getTypingRunStatsFromEnvironment,
  listExtensionDevicesFromEnvironment,
  listTaggedRunsFromEnvironment,
  revokeExtensionDeviceFromEnvironment,
  retryPendingCorrelationFromEnvironment,
  setKeyboardChoicesFromEnvironment,
  TYPING_RUNS_REQUIRES_WORKER,
} from "$lib/typing-runs/service";
import {
  extensionDeviceIdInput,
  extensionKeyboardChoicesInput,
  taggedRunsFilterInput,
  typingRunStatsGroupInput,
} from "$lib/server/remote-input";

export const createExtensionPairingToken = command(() => {
  const event = getRequestEvent();
  const userId = requireExtensionSession(event.locals.user);
  assertTypingRunsBinding(event.platform?.env);

  return createPairingTokenFromEnvironment(event.platform?.env, userId);
});

export const listExtensionDevices = query(() => {
  const event = getRequestEvent();
  const userId = requireExtensionSession(event.locals.user);
  assertTypingRunsBinding(event.platform?.env);

  return listExtensionDevicesFromEnvironment(event.platform?.env, userId);
});

export const revokeExtensionDevice = command(extensionDeviceIdInput, (id) => {
  const event = getRequestEvent();
  const userId = requireExtensionSession(event.locals.user);
  assertTypingRunsBinding(event.platform?.env);

  return revokeExtensionDeviceFromEnvironment(event.platform?.env, userId, id);
});

export const listTaggedRuns = query(taggedRunsFilterInput, (rawFilter) => {
  const event = getRequestEvent();
  const userId = requireExtensionSession(event.locals.user);
  assertTypingRunsBinding(event.platform?.env);

  return listTaggedRunsFromEnvironment(event.platform?.env, userId, rawFilter);
});

export const getTypingRunStats = query(typingRunStatsGroupInput, (rawGroupBy) => {
  const event = getRequestEvent();
  const userId = requireExtensionSession(event.locals.user);
  assertTypingRunsBinding(event.platform?.env);

  return getTypingRunStatsFromEnvironment(event.platform?.env, userId, rawGroupBy);
});

export const retryRunCorrelation = command(() => {
  const event = getRequestEvent();
  const userId = requireExtensionSession(event.locals.user);
  assertTypingRunsBinding(event.platform?.env);

  return retryPendingCorrelationFromEnvironment(event.platform?.env, userId);
});

export const syncExtensionKeyboardChoices = command(extensionKeyboardChoicesInput, (rawChoices) => {
  const event = getRequestEvent();
  const userId = requireExtensionSession(event.locals.user);
  assertTypingRunsBinding(event.platform?.env);

  return setKeyboardChoicesFromEnvironment(event.platform?.env, userId, rawChoices);
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
