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
]);

let types = await readFile(typesPath, "utf8");

for (const [from, to] of replacements) {
  types = types.replaceAll(from, to);
}

await writeFile(typesPath, types);
