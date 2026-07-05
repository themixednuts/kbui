// Fidelity pixel-diff: compare current capture screenshots against a baseline dir.
// Usage: node scripts/fidelity-diff.mjs <baselineDir> [currentDir]
// currentDir defaults to docs/redesign/screenshots/rebuild.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

const baseDir = process.argv[2];
const curDir =
  process.argv[3] ??
  fileURLToPath(new URL("../docs/redesign/screenshots/rebuild/", import.meta.url));
if (!baseDir) {
  console.error("usage: node scripts/fidelity-diff.mjs <baselineDir> [currentDir]");
  process.exit(2);
}

const files = readdirSync(baseDir).filter((f) => f.endsWith(".png"));
let total = 0;
const rows = [];
for (const f of files.sort()) {
  let curBuf;
  try {
    curBuf = readFileSync(path.join(curDir, f));
  } catch {
    rows.push(`${f.padEnd(24)}  MISSING in current`);
    continue;
  }
  const a = PNG.sync.read(readFileSync(path.join(baseDir, f)));
  const b = PNG.sync.read(curBuf);
  if (a.width !== b.width || a.height !== b.height) {
    rows.push(`${f.padEnd(24)}  SIZE ${a.width}x${a.height} -> ${b.width}x${b.height}`);
    total += 1_000_000;
    continue;
  }
  const n = pixelmatch(a.data, b.data, null, a.width, a.height, { threshold: 0.1 });
  total += n;
  rows.push(
    `${f.padEnd(24)}  ${String(n).padStart(8)} px  (${((n / (a.width * a.height)) * 100).toFixed(3)}%)`,
  );
}
console.log(rows.join("\n"));
console.log("TOTAL:", total);
// Non-zero exit if any screen exceeds the AA noise floor.
process.exit(total > 300 ? 1 : 0);
