import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import agents from "agents/vite";
import sqlocal from "sqlocal/vite";
import { defineConfig } from "vite-plus";

const externalArtifactPatterns = [
  "resources/**",
  "docs/redesign/**",
  "extension/**",
  "src/cloudflare.d.ts",
];

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
        command:
          "node scripts/dev-worker.mjs --check-only && vp build && node scripts/dev-worker.mjs",
        cache: false,
      },
      "dev:worker:test": {
        command:
          "node scripts/dev-worker.mjs --check-only && vp build && node scripts/dev-worker.mjs -- --persist-to .wrangler/worker-test-state",
        cache: false,
      },
      "dev:webhook": {
        command: "node scripts/dev-webhook-tunnel.mjs",
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
      "test:worker": {
        command: "playwright test --config playwright.worker.config.ts",
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
        command: "wrangler types src/cloudflare.d.ts && node scripts/patch-cloudflare-types.mjs",
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
  },
  plugins: [tailwindcss(), agents(), sqlocal(), sveltekit()],
});
