import { readFile, writeFile } from "node:fs/promises";

const workerPath = ".svelte-kit/cloudflare/_worker.js";
const exportLines = [
  'export { AuthAgent } from "../../src/agents/auth-agent";',
  'export { UserWorkbenchAgent } from "../../src/agents/user-workbench";',
];

const worker = await readFile(workerPath, "utf8");
const missingExports = exportLines.filter((exportLine) => !worker.includes(exportLine));

if (missingExports.length > 0) {
  await writeFile(workerPath, `${worker}\n${missingExports.join("\n")}\n`);
  console.log("Patched Cloudflare worker with Agent exports.");
} else {
  console.log("Cloudflare worker already exports Agents.");
}
