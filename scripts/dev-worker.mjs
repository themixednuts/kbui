#!/usr/bin/env node
import { spawn } from "node:child_process";
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

import {
  assertPortAvailable,
  findLocalDevUrl,
  parseLocalDevUrl,
  quoteShellArg,
} from "./lib/local-dev-url.mjs";

const rawArgs = process.argv.slice(2);
const printOnly = rawArgs.includes("--print");
const checkOnly = rawArgs.includes("--check-only");
const skipPortCheck = rawArgs.includes("--skip-port-check");
const delimiterIndex = rawArgs.indexOf("--");
const forwardedArgs = delimiterIndex === -1 ? [] : rawArgs.slice(delimiterIndex + 1);

const configured = findLocalDevUrl();
if (!configured) {
  console.error(
    "Missing BETTER_AUTH_URL. Set it in .dev.vars or the environment before running vp run dev:worker.",
  );
  process.exit(1);
}

let resolved;
try {
  resolved = parseLocalDevUrl(configured.value, configured.source);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const workerBuildRoot = resolve(".svelte-kit");
const workerBuildDirectory = resolve(workerBuildRoot, "cloudflare");
const workerDevRoot = resolve(
  process.env.KBGUI_WORKER_SNAPSHOT_DIR?.trim() || ".svelte-kit/wrangler-dev",
);
const workerDevDirectory = resolve(workerDevRoot, "cloudflare");
const workerDevEntry = resolve(workerDevDirectory, "_worker.js");
const snapshotDirectories = [
  [workerBuildDirectory, workerDevDirectory],
  [resolve(workerBuildRoot, "cloudflare-tmp"), resolve(workerDevRoot, "cloudflare-tmp")],
  [resolve(workerBuildRoot, "output/server"), resolve(workerDevRoot, "output/server")],
];
const wranglerArgs = [
  "exec",
  "wrangler",
  "dev",
  workerDevEntry,
  "--assets",
  workerDevDirectory,
  "--ip",
  resolved.bindHost,
  "--port",
  String(resolved.port),
];

if (resolved.protocol === "https") {
  wranglerArgs.push("--local-protocol", "https");
}

wranglerArgs.push(...forwardedArgs);

if (printOnly) {
  console.log(`BETTER_AUTH_URL from ${configured.source}: ${resolved.origin}`);
  console.log(`vp ${wranglerArgs.map(quoteShellArg).join(" ")}`);
  process.exit(0);
}

if (!skipPortCheck) {
  try {
    await assertPortAvailable(resolved.bindHost, resolved.port);
  } catch (error) {
    const code = errorCode(error);
    console.error(
      `Cannot start Worker dev server: ${resolved.bindHost}:${resolved.port} from ${configured.source} is unavailable (${code}).`,
    );
    console.error(
      "Change BETTER_AUTH_URL and the GitHub OAuth callback together, or free that port.",
    );
    process.exit(1);
  }
}

if (checkOnly) {
  console.log(`[dev:worker] ${resolved.bindHost}:${resolved.port} is available.`);
  process.exit(0);
}

const missingBuildInputs = snapshotDirectories
  .map(([source]) => source)
  .filter((source) => !existsSync(source));

if (missingBuildInputs.length > 0 || !existsSync(resolve(workerBuildDirectory, "_worker.js"))) {
  console.error(
    `Incomplete Worker build (${missingBuildInputs.join(", ") || workerBuildDirectory}). Run vp build before starting Wrangler.`,
  );
  process.exit(1);
}

rmSync(workerDevRoot, { force: true, recursive: true });
for (const [source, destination] of snapshotDirectories) {
  cpSync(source, destination, { recursive: true });
}

if (!existsSync(workerDevEntry)) {
  console.error(`Worker snapshot is incomplete: ${workerDevEntry} was not copied.`);
  process.exit(1);
}

rebaseProjectSourceImports(workerDevEntry, workerDevDirectory);

console.log(`[dev:worker] BETTER_AUTH_URL from ${configured.source}: ${resolved.origin}`);
console.log(
  `[dev:worker] Starting Wrangler on ${resolved.bindHost}:${resolved.port} from self-contained snapshot ${workerDevRoot}`,
);

const child = spawn("vp", wranglerArgs, {
  stdio: "inherit",
});

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

function errorCode(error) {
  if (!error || typeof error !== "object" || !("code" in error)) return "unknown";
  const code = error.code;
  return typeof code === "string" || typeof code === "number" ? String(code) : "unknown";
}

function rebaseProjectSourceImports(entryPath, entryDirectory) {
  const sourceDirectory = resolve("src");
  const relativeSourceDirectory = relative(entryDirectory, sourceDirectory).split(sep).join("/");
  const importPrefix = relativeSourceDirectory.startsWith(".")
    ? relativeSourceDirectory
    : `./${relativeSourceDirectory}`;
  const original = readFileSync(entryPath, "utf8");
  const rebased = original.replaceAll("../../src/", `${importPrefix}/`);

  if (original.includes("../../src/") && original === rebased) {
    console.error(`Worker snapshot imports could not be rebased to ${sourceDirectory}.`);
    process.exit(1);
  }

  writeFileSync(entryPath, rebased);
}
