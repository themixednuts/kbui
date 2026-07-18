import { readFile, writeFile } from "node:fs/promises";

const typesPath = "src/cloudflare.d.ts";
const replacements = new Map([
  ['mainModule: typeof import("../.svelte-kit/cloudflare/_worker");', "mainModule: unknown;"],
  [
    'import("../.svelte-kit/cloudflare/_worker").UserWorkbenchAgent',
    'import("./agents/user-workbench").UserWorkbenchAgent',
  ],
  [
    'import("../.svelte-kit/cloudflare/_worker").AuthAgent',
    'import("./agents/auth-agent").AuthAgent',
  ],
  [
    'import("../.svelte-kit/cloudflare/_worker").CommunityAgent',
    'import("./agents/community-agent").CommunityAgent',
  ],
  [
    'import("../.svelte-kit/cloudflare/_worker").TypingRunsAgent',
    'import("./agents/typing-runs-agent").TypingRunsAgent',
  ],
  [
    "DurableObjectNamespace /* FirmwareBuildAgent */",
    'DurableObjectNamespace<import("./agents/firmware-build-agent").FirmwareBuildAgent>',
  ],
  [
    'import("../.svelte-kit/cloudflare/_worker").FirmwareBuildAgent',
    'import("./agents/firmware-build-agent").FirmwareBuildAgent',
  ],
  [
    "DurableObjectNamespace /* QmkIndexAgent */",
    'DurableObjectNamespace<import("./agents/qmk-index-agent").QmkIndexAgent>',
  ],
  [
    'import("../.svelte-kit/cloudflare/_worker").QmkIndexAgent',
    'import("./agents/qmk-index-agent").QmkIndexAgent',
  ],
  [
    "Workflow<Parameters<import(\"../.svelte-kit/cloudflare/_worker\").FirmwareBuildWorkflow['run']>[0]['payload']>",
    'Workflow<import("./agents/firmware-build-workflow").FirmwareBuildWorkflowParams>',
  ],
  [
    "Workflow<Parameters<import(\"../.svelte-kit/cloudflare/_worker\").FirmwareMaintenanceWorkflow['run']>[0]['payload']>",
    'Workflow<import("./agents/firmware-maintenance-workflow").FirmwareMaintenanceWorkflowParams>',
  ],
]);

let types = await readFile(typesPath, "utf8");

for (const [from, to] of replacements) {
  types = types.replaceAll(from, to);
}

// Wrangler's runtime declaration bundle currently includes a handful of lines
// with trailing spaces. Normalize generated output so `git diff --check` stays
// useful without hand-editing the generated declaration file.
types = types.replace(/[ \t]+$/gm, "");

await writeFile(typesPath, types);
