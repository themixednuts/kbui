import { fileURLToPath } from "node:url";

import { defineConfig } from "wxt";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  modules: ["@wxt-dev/module-svelte"],
  manifest: {
    name: "kbgui Monkeytype Tagger",
    description: "Tags completed Monkeytype runs with the active kbgui keyboard and layout.",
    version: "0.1.0",
    permissions: ["storage"],
    host_permissions: [
      "https://monkeytype.com/*",
      "http://localhost:8787/*",
      "http://127.0.0.1:8787/*",
      "https://kbgui.example.com/*"
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
    server: {
      fs: {
        allow: [rootDir]
      }
    }
  })
});
