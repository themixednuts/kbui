import { access, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const packagePath = path.resolve("node_modules/vitest/package.json");
const binPath = path.resolve("node_modules/vitest/vitest.mjs");
const nestedCorePath = path.resolve(
  "node_modules/vitest/node_modules/@voidzero-dev/vite-plus-core",
);
const rootCorePackagePath = path.resolve("node_modules/@voidzero-dev/vite-plus-core/package.json");

try {
  await access(binPath);
  const packageJson = JSON.parse(await readFile(packagePath, "utf8"));

  if (packageJson.name === "@voidzero-dev/vite-plus-test" && !packageJson.bin) {
    packageJson.bin = { vitest: "./vitest.mjs" };
    await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
  }

  try {
    const rootCore = JSON.parse(await readFile(rootCorePackagePath, "utf8"));
    const nestedCore = JSON.parse(
      await readFile(path.join(nestedCorePath, "package.json"), "utf8"),
    );
    if (
      packageJson.name === "@voidzero-dev/vite-plus-test" &&
      rootCore.name === "@voidzero-dev/vite-plus-core" &&
      nestedCore.name === "@voidzero-dev/vite-plus-core" &&
      rootCore.version !== nestedCore.version
    ) {
      await rm(nestedCorePath, { force: true, recursive: true });
    }
  } catch {
    // The stale nested core only appears with the 0.1.x test alias.
  }
} catch (error) {
  if (process.env.CI) {
    throw error;
  }
}
