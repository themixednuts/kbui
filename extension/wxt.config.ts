import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { defineConfig } from "wxt";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const kbguiBaseUrl = resolveKbguiBaseUrl();

export default defineConfig({
  modules: ["@wxt-dev/module-svelte"],
  manifest: {
    name: "kbui Monkeytype Tagger",
    description: "Tags completed Monkeytype runs with the active kbui keyboard and layout.",
    version: "0.1.0",
    permissions: ["storage"],
    host_permissions: [
      "https://monkeytype.com/*",
      ...hostPermissionsFor(kbguiBaseUrl),
      "https://kbui.example.com/*",
    ]
  },
  hooks: {
    "build:manifestGenerated": (_, manifest) => {
      if (manifest.background && "service_worker" in manifest.background) {
        manifest.background.type = "module";
      }
    }
  },
  vite: () => ({
    define: {
      __KBGUI_BASE_URL__: JSON.stringify(kbguiBaseUrl)
    },
    server: {
      fs: {
        allow: [rootDir]
      }
    }
  })
});

function resolveKbguiBaseUrl(): string {
  const candidate =
    process.env.KBGUI_BASE_URL ??
    process.env.BETTER_AUTH_URL ??
    readDotenvValue("BETTER_AUTH_URL", resolve(rootDir, ".dev.vars")) ??
    readDotenvValue("BETTER_AUTH_URL", resolve(rootDir, ".dev.vars.example"));

  if (!candidate) throw new Error("Set KBGUI_BASE_URL or BETTER_AUTH_URL before building extension.");
  return normalizeOrigin(candidate, "kbui base URL");
}

function readDotenvValue(name: string, filePath: string): string | null {
  let text: string;
  try {
    text = readFileSync(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    if (key !== name) continue;

    let value = line.slice(separator + 1).trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
      value = value.slice(1, -1);
    }
    return value.trim() || null;
  }

  return null;
}

function normalizeOrigin(value: string, label: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid http(s) URL.`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${label} must use http or https.`);
  }

  return url.origin;
}

function hostPermissionsFor(baseUrl: string): string[] {
  const url = new URL(baseUrl);
  if (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) {
    return ["http://localhost/*", "http://127.0.0.1/*"];
  }
  return [`${url.protocol}//${url.hostname}/*`];
}
