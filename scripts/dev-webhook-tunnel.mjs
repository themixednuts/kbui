#!/usr/bin/env node
import { spawn } from "node:child_process";

import { findLocalDevUrl, parseLocalDevUrl, readDotenvValue } from "./lib/local-dev-url.mjs";

const configured = findLocalDevUrl();
if (!configured) {
  console.error("Missing BETTER_AUTH_URL. Start with a configured local Worker origin.");
  process.exit(1);
}

let local;
try {
  local = parseLocalDevUrl(configured.value, configured.source);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

try {
  await fetch(`${local.origin}/api/webhooks/github`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(3_000),
  });
} catch {
  console.error(`The Worker is not reachable at ${local.origin}. Run vp run dev:worker first.`);
  process.exit(1);
}

const tunnelName = process.env.KBGUI_TUNNEL_NAME?.trim() || readDotenvValue("KBGUI_TUNNEL_NAME");
const publicOrigin =
  process.env.KBGUI_PUBLIC_ORIGIN?.trim() || readDotenvValue("KBGUI_PUBLIC_ORIGIN");
const args = tunnelName
  ? ["exec", "wrangler", "tunnel", "run", tunnelName]
  : ["exec", "wrangler", "tunnel", "quick-start", local.origin];

console.log(`[dev:webhook] Forwarding GitHub events to ${local.origin}/api/webhooks/github`);
if (tunnelName) {
  console.log(`[dev:webhook] Starting named tunnel ${tunnelName}.`);
  if (publicOrigin) printWebhookUrl(publicOrigin);
  else {
    console.log(
      "[dev:webhook] Set KBGUI_PUBLIC_ORIGIN in .dev.vars to print and verify the stable GitHub webhook URL.",
    );
  }
} else {
  console.log(
    "[dev:webhook] Starting a temporary Quick Tunnel. Update the GitHub App webhook URL shown below for this session.",
  );
}

const child = spawn("vp", args, {
  env: process.env,
  stdio: ["inherit", "pipe", "pipe"],
});

let announcedOrigin = publicOrigin ?? "";
pipeAndInspect(child.stdout, process.stdout);
pipeAndInspect(child.stderr, process.stderr);

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

function pipeAndInspect(stream, destination) {
  stream?.on("data", (chunk) => {
    const text = chunk.toString();
    destination.write(chunk);
    const match = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i.exec(text);
    if (!match || announcedOrigin === match[0]) return;
    announcedOrigin = match[0];
    printWebhookUrl(match[0]);
  });
}

function printWebhookUrl(origin) {
  let normalized;
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:") throw new Error("not https");
    normalized = url.origin;
  } catch {
    console.error(`KBGUI_PUBLIC_ORIGIN must be an HTTPS origin, got ${JSON.stringify(origin)}.`);
    return;
  }
  console.log(`[dev:webhook] GitHub App webhook URL: ${normalized}/api/webhooks/github`);
  console.log("[dev:webhook] Subscribe the GitHub App to Workflow run events.");
}
