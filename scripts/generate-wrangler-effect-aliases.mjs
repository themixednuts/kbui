import { readFile, writeFile } from "node:fs/promises";

const wranglerPath = "wrangler.toml";
const effectV3Pkg = JSON.parse(await readFile("node_modules/effect-v3/package.json", "utf8"));

/**
 * Wrangler re-bundles the worker and must resolve `effect` like @effect/* /
 * LiveStore expect (v3). Vite/client code keeps `effect` v4 via package.json.
 */
const workerEffectRoot = "./node_modules/effect-v3/dist/esm/index.js";

const v3Aliases = Object.keys(effectV3Pkg.exports)
  .filter(
    (key) =>
      key.startsWith("./") && !key.includes("*") && key !== "./package.json" && key !== "./.index",
  )
  .map((key) => {
    const name = key.slice(2);
    const target = effectV3Pkg.exports[key];
    const importPath =
      typeof target === "string"
        ? target
        : typeof target?.import === "string"
          ? target.import
          : null;
    if (!importPath?.endsWith(".js")) return null;
    return [`effect/${name}`, `./node_modules/effect-v3/${importPath.replace(/^\.\//, "")}`];
  })
  .filter(Boolean)
  .sort(([a], [b]) => a.localeCompare(b));

const tomlPair = (key, value) => `"${key}" = "${value}"`;

const aliasLines = [
  "# Worker bundle: `effect` + subpaths → effect-v3 (devDep npm:effect@3.21.2).",
  "# Browser/Vite builds still use effect v4 from dependencies. Regenerate:",
  "#   node scripts/generate-wrangler-effect-aliases.mjs",
  "[alias]",
  tomlPair("effect", workerEffectRoot),
  ...v3Aliases.map(([k, v]) => tomlPair(k, v)),
];

const wrangler = await readFile(wranglerPath, "utf8");
const startMarker = "# BEGIN effect aliases (generated)";
const endMarker = "# END effect aliases (generated)";
const block = `${startMarker}\n${aliasLines.join("\n")}\n${endMarker}`;

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const pattern = new RegExp(`${escapeRegExp(startMarker)}[\\s\\S]*?${escapeRegExp(endMarker)}\\n?`);

if (!pattern.test(wrangler)) {
  throw new Error(
    `Could not find alias block in ${wranglerPath}. Add markers or legacy [alias] section.`,
  );
}

const next = wrangler.replace(pattern, `${block}\n`);
await writeFile(wranglerPath, next);
console.log(
  `Updated ${wranglerPath}: effect → effect-v3 root + ${v3Aliases.length} subpath aliases.`,
);
