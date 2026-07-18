import adapter from "@sveltejs/adapter-cloudflare";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const agentExports = [
  'export { AuthAgent } from "../../src/agents/auth-agent";',
  'export { FirmwareBuildAgent } from "../../src/agents/firmware-build-agent";',
  'export { FirmwareBuildWorkflow } from "../../src/agents/firmware-build-workflow";',
  'export { FirmwareMaintenanceWorkflow } from "../../src/agents/firmware-maintenance-workflow";',
  'export { CommunityAgent } from "../../src/agents/community-agent";',
  'export { TypingRunsAgent } from "../../src/agents/typing-runs-agent";',
  'export { UserWorkbenchAgent } from "../../src/agents/user-workbench";',
  'export { QmkIndexAgent } from "../../src/agents/qmk-index-agent";',
];
const queueImport = 'import { processGitHubWebhookQueue } from "../../src/worker-queue";';
const workerDefaultMarker = "var worker_default = {";
const usePlatformProxy = process.argv.slice(2).some((arg) => arg === "dev");
const adapterOptions = usePlatformProxy
  ? {
      platformProxy: {
        configPath: "wrangler.jsonc",
      },
    }
  : {};

function adapterWithAgentExports(options) {
  const cloudflare = adapter(options);
  const wrapped = {
    ...cloudflare,
    name: `${cloudflare.name}:agents`,
    async adapt(builder) {
      await cloudflare.adapt(builder);

      const workerPath = path.join(builder.getBuildDirectory("cloudflare"), "_worker.js");
      let worker = await readFile(workerPath, "utf8");
      if (!worker.includes("queue: processGitHubWebhookQueue")) {
        if (!worker.includes(workerDefaultMarker)) {
          throw new Error(
            "Cloudflare adapter worker entry no longer exposes the expected default handler marker.",
          );
        }
        worker = `${queueImport}\n${worker.replace(
          workerDefaultMarker,
          `${workerDefaultMarker}\n  queue: processGitHubWebhookQueue,`,
        )}`;
      }
      const missingExports = agentExports.filter((exportLine) => !worker.includes(exportLine));

      await writeFile(workerPath, `${worker}\n${missingExports.join("\n")}\n`);
    },
  };

  if (!usePlatformProxy) {
    delete wrapped.emulate;
  }

  return wrapped;
}

/** @type {import('@sveltejs/kit').Config} */
const config = {
  compilerOptions: {
    // Force runes mode for the project, except for libraries. Can be removed in svelte 6.
    runes: ({ filename }) => (filename.split(/[/\\]/).includes("node_modules") ? undefined : true),
    experimental: {
      async: true,
    },
  },
  kit: {
    experimental: {
      remoteFunctions: true,
    },
    adapter: adapterWithAgentExports(adapterOptions),
  },
};

export default config;
