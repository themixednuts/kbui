import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
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

function scriptSources(path: string, source: string) {
  if (!path.endsWith(".svelte")) return [source];
  return Array.from(source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g), (match) => match[1]);
}

function tryPromiseCallback(
  call: ts.CallExpression,
): ts.ArrowFunction | ts.FunctionExpression | undefined {
  const argument = call.arguments[0];
  if (!argument) return undefined;
  if (ts.isArrowFunction(argument) || ts.isFunctionExpression(argument)) return argument;
  if (!ts.isObjectLiteralExpression(argument)) return undefined;
  const property = argument.properties.find(
    (candidate): candidate is ts.PropertyAssignment =>
      ts.isPropertyAssignment(candidate) && candidate.name.getText() === "try",
  );
  if (!property) return undefined;
  return ts.isArrowFunction(property.initializer) || ts.isFunctionExpression(property.initializer)
    ? property.initializer
    : undefined;
}

function directAwaitCount(callback: ts.ArrowFunction | ts.FunctionExpression) {
  let count = 0;
  const visit = (node: ts.Node) => {
    if (node !== callback && ts.isFunctionLike(node)) return;
    if (ts.isAwaitExpression(node)) count += 1;
    ts.forEachChild(node, visit);
  };
  visit(callback.body);
  return count;
}

function hasMultiAwaitTryPromise(path: string, source: string) {
  return scriptSources(path, source).some((script, index) => {
    const syntax = ts.createSourceFile(
      `${normalizedPath(path)}#${index}.tsx`,
      script,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    let multiAwait = false;
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.expression.getText(syntax) === "Effect" &&
        node.expression.name.text === "tryPromise"
      ) {
        const callback = tryPromiseCallback(node);
        if (callback && directAwaitCount(callback) > 1) multiAwait = true;
      }
      ts.forEachChild(node, visit);
    };
    visit(syntax);
    return multiAwait;
  });
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

  it("keeps runtime execution at declared boundary and synchronous facade modules", () => {
    const asynchronousBoundaries = new Set([
      "src/lib/app/runtime.ts",
      "src/lib/effect/service-worker-runtime.ts",
      "src/lib/effect/worker-runtime.ts",
    ]);
    const synchronousFacades = new Set(["src/lib/app/runtime.ts", "src/lib/keyboard/schema.ts"]);

    const offenders = sourceFiles().filter((path) => {
      const normalized = normalizedPath(path);
      const source = readFileSync(path, "utf8");
      const entersAsyncRuntime = /\.(?:runPromise|runFork)\s*\(/.test(source);
      const entersSyncRuntime = /\.runSync\s*\(/.test(source);
      return (
        (entersAsyncRuntime && !asynchronousBoundaries.has(normalized)) ||
        (entersSyncRuntime && !synchronousFacades.has(normalized))
      );
    });

    expect(offenders.map(normalizedPath)).toEqual([]);
  });

  it("keeps audited core workflows on direct Effect composition paths", () => {
    const rules = [
      {
        path: "src/agents/qmk-index-agent.ts",
        forbidden: [/\bbuildQmkUsbIndex\s*\(/, /\bresolveQmkRepositoryRef\s*\(/],
        required: [/\bcreateQmkUsbIndexEffect\s*\(/, /\bresolvePinnedQmkRefEffect\s*\(/],
      },
      {
        path: "src/agents/auth-agent.ts",
        forbidden: [/\battachWorkflowArtifacts\s*\(/],
        required: [/\battachWorkflowArtifactsEffect\s*\(/],
      },
      {
        path: "src/lib/keyboard/local-store.ts",
        forbidden: [/\blocalStoreRuntime\b/, /\bgetClient\s*\(/, /\.runPromise\s*\(/],
        required: [/\byield\* LocalStore\b/, /\buseDatabaseEffect\s*\(/],
      },
      {
        path: "src/lib/components/flash/FlashOverlay.svelte",
        forbidden: [
          /\bverifyGitHubArtifactSha256Digest\s*\(/,
          /\bflashUf2ViaFileSystemAccess\s*\(/,
          /\bverifyUf2Reconnect\s*\(/,
          /\bconnectViaAndActivate\s*\(/,
        ],
        required: [
          /\bverifyGitHubArtifactSha256DigestEffect\s*\(/,
          /\bflashUf2ViaFileSystemAccessEffect\s*\(/,
          /\bverifyUf2ReconnectEffect\s*\(/,
          /\bconnectViaAndActivateEffect\s*\(/,
        ],
      },
      {
        path: "src/lib/server/auth/monkeytype-plugin.ts",
        forbidden: [
          /\bencryptApeKey\s*\(/,
          /\bdecryptApeKey\s*\(/,
          /apiClient\.(?:stats|personalBests|results|publicProfile)\s*\(/,
        ],
        required: [
          /\bencryptApeKeyEffect\s*\(/,
          /\bdecryptApeKeyEffect\s*\(/,
          /apiClient\.(?:statsEffect|personalBestsEffect|resultsEffect|publicProfileEffect)\s*\(/,
        ],
      },
      {
        path: "src/routes/api/auth/[...all]/+server.ts",
        forbidden: [/\bselfHeal\s*\(/, /\bEffect\.retry\s*\(/],
        required: [/\bEffect\.tryPromise\s*\(/],
      },
    ];

    const offenders = rules.flatMap((rule) => {
      const source = readFileSync(join(root, rule.path), "utf8");
      const forbidden = rule.forbidden.filter((pattern) => pattern.test(source));
      const missing = rule.required.filter((pattern) => !pattern.test(source));
      return forbidden.length === 0 && missing.length === 0 ? [] : [rule.path];
    });

    const firmwareWorkflow = readFileSync(
      join(root, "src/agents/firmware-build-workflow.ts"),
      "utf8",
    );
    if ((firmwareWorkflow.match(/\brunWorkerEffect\s*\(/g) ?? []).length !== 1) {
      offenders.push("src/agents/firmware-build-workflow.ts");
    }

    expect(offenders).toEqual([]);
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

  it("keeps multi-step workflows out of Effect.tryPromise callbacks", () => {
    const offenders = sourceFiles().filter((path) =>
      hasMultiAwaitTryPromise(path, readFileSync(path, "utf8")),
    );
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
