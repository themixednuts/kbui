import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vite-plus/test";

const root = process.cwd();
const srcRoot = join(root, "src");

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

function sourceFiles() {
  return filesUnder(srcRoot).filter(
    (path) =>
      /\.(?:ts|svelte)$/.test(path) &&
      !/\.(?:test|spec)\.ts$/.test(path) &&
      !path.endsWith("cloudflare.d.ts"),
  );
}

function normalizedPath(path: string) {
  return relative(root, path).replaceAll("\\", "/");
}

describe("Effect v4 architecture boundaries", () => {
  it("pins Effect v4 and relies only on Wrangler-generated Cloudflare types", () => {
    const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(packageJson.dependencies?.effect).toMatch(/^\^4\./);
    expect(packageJson.dependencies?.["@cloudflare/workers-types"]).toBeUndefined();
    expect(packageJson.devDependencies?.["@cloudflare/workers-types"]).toBeUndefined();

    const forbiddenImports = sourceFiles().filter((path) => {
      const source = readFileSync(path, "utf8");
      return /from\s+["'](?:@cloudflare\/workers-types|cloudflare:workers)["']/.test(source);
    });
    expect(forbiddenImports.map(normalizedPath)).toEqual([]);
  });

  it("keeps direct Promise execution at the declared runtime boundary", () => {
    const offenders = sourceFiles().filter((path) => {
      if (normalizedPath(path) === "src/lib/effect/worker-runtime.ts") return false;
      return /\bEffect\.runPromise\s*\(/.test(readFileSync(path, "utf8"));
    });
    expect(offenders.map(normalizedPath)).toEqual([]);
  });

  it("requires Effect ownership in asynchronous application modules", () => {
    const adapter = (path: string) =>
      path.endsWith("transport-mock.ts") || path.endsWith("transport-mock-zmk.ts");

    const offenders = sourceFiles().filter((path) => {
      const normalized = normalizedPath(path);
      if (adapter(normalized)) return false;
      const source = readFileSync(path, "utf8");
      const asynchronous = /\basync\b|\bnew Promise\b|\bPromise\.(?:all|race)\b|\.then\s*\(/.test(
        source,
      );
      return asynchronous && !/from\s+["']effect["']/.test(source);
    });

    expect(offenders.map(normalizedPath)).toEqual([]);
  });

  it("keeps Svelte event and lifecycle work inside Effect programs", () => {
    const offenders = sourceFiles().filter((path) => {
      if (!path.endsWith(".svelte")) return false;
      return /\b(?:async|await)\b/.test(readFileSync(path, "utf8"));
    });

    expect(offenders.map(normalizedPath)).toEqual([]);
  });

  it("does not implement production orchestration with raw Promise combinators or chains", () => {
    const rawPromiseOrchestration =
      /\bnew Promise\b|\bPromise\.(?:all|race|resolve|reject)\b|(?<!Effect)\.(?:then|catch)\s*\(/;
    const offenders = sourceFiles().filter((path) =>
      rawPromiseOrchestration.test(readFileSync(path, "utf8")),
    );

    expect(offenders.map(normalizedPath)).toEqual([]);
  });

  it("does not hide rejected Promise work behind empty alternate values", () => {
    const emptyCatch =
      /\.catch\s*\(\s*\(?.*?\)?\s*=>\s*(?:undefined|null|false|true|\[\]|\{\}|["']{2})\s*\)/s;
    const offenders = sourceFiles().filter((path) => emptyCatch.test(readFileSync(path, "utf8")));
    expect(offenders.map(normalizedPath)).toEqual([]);
  });
});
