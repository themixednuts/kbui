import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import agents from "agents/vite";
import sqlocal from "sqlocal/vite";
import { defineConfig } from "vite-plus";

const externalArtifactPatterns = ["resources/**", "docs/redesign/**", "extension/**"];

export default defineConfig({
  fmt: { ignorePatterns: externalArtifactPatterns },
  lint: {
    ignorePatterns: externalArtifactPatterns,
    options: { typeAware: true, typeCheck: true },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
  run: {
    tasks: {
      "dev:worker": {
        command: "vp build && vp exec wrangler dev --ip 127.0.0.1 --port 8787",
        cache: false,
      },
      "playwright:install": {
        command: "playwright install chromium",
        cache: false,
      },
      "test:e2e": {
        command: "playwright test",
        cache: false,
      },
      capture: {
        command:
          "vp run playwright:install && vp build && playwright test --config playwright.visual.config.ts",
        cache: false,
      },
      "svelte:check": {
        command: "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
        cache: false,
      },
      "svelte:check:watch": {
        command: "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json --watch",
        cache: false,
      },
      "test:unit": {
        command: "vp test",
        cache: false,
      },
      "subset:material-symbols": {
        command: "python scripts/subset-material-symbols.py",
        cache: false,
      },
      storybook: {
        command: "storybook dev -p 6006",
        cache: false,
      },
      "storybook:build": {
        command: "storybook build",
        cache: false,
      },
      "types:cf": {
        command:
          "wrangler types src/cloudflare.d.ts --include-runtime false && node scripts/patch-cloudflare-types.mjs",
        cache: false,
      },
      "worker:patch": {
        command: "node scripts/patch-cloudflare-worker.mjs",
        cache: false,
      },
    },
  },
  server: {
    host: "127.0.0.1",
    // Cross-origin isolation for the dev server. Required by SAB / OPFS
    // (sqlocal) and any future threaded WASM features. The matching prod
    // rules live in `_headers` at the repo root so the deployed worker
    // ships them too.
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  plugins: [tailwindcss(), agents(), sqlocal(), sveltekit()],
});
