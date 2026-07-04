import adapter from "@sveltejs/adapter-cloudflare";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const agentExports = [
  'export { AuthAgent } from "../../src/agents/auth-agent";',
  'export { UserWorkbenchAgent } from "../../src/agents/user-workbench";',
];
const usePlatformProxy = process.argv.slice(2).some((arg) => arg === "dev");
const adapterOptions = usePlatformProxy
  ? {
      platformProxy: {
        configPath: "wrangler.toml",
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
      const worker = await readFile(workerPath, "utf8");
      const missingExports = agentExports.filter((exportLine) => !worker.includes(exportLine));

      if (missingExports.length > 0) {
        await writeFile(workerPath, `${worker}\n${missingExports.join("\n")}\n`);
      }
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
