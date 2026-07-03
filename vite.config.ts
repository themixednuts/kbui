import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import agents from "agents/vite";
import sqlocal from "sqlocal/vite";
import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {},
  lint: { options: { typeAware: true, typeCheck: true } },
  test: {
    include: ["src/**/*.test.ts"],
  },
  run: {
    tasks: {
      "dev:worker": {
        command:
          "vp build && node scripts/generate-wrangler-effect-aliases.mjs && wrangler dev",
        cache: false,
      },
      "worker:aliases": {
        command: "node scripts/generate-wrangler-effect-aliases.mjs",
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
  // LiveStore's `@livestore/sync-cf/cf-worker` and friends import
  // Cloudflare-runtime modules using the `cloudflare:*` URL scheme
  // (e.g. `cloudflare:workers`). Workerd resolves those at runtime, but
  // the Vite/Node bundler that runs during SvelteKit's SSR build
  // doesn't know the scheme and crashes during chunk rendering. Mark
  // every `cloudflare:*` import as external so it stays as-is in the
  // emitted worker bundle.
  build: {
    rollupOptions: {
      external: [
        "cloudflare:workers",
        "cloudflare:sockets",
        "cloudflare:email",
        "cloudflare:test",
        "@livestore/sync-cf/cf-worker",
        "@livestore/common-cf",
        "@livestore/common-cf/declare",
      ],
    },
  },
  resolve: {
    alias: {
      // LiveStore 0.4.0-dev.* is hardcoded against effect v3's module
      // layout. Effect v4 collapsed `ParseResult` and `RuntimeFlags`
      // into other modules. Map the two paths LiveStore actually uses
      // at runtime to lightweight shims so the build resolves and the
      // runtime keeps moving. Replace these aliases the moment LiveStore
      // ships v4 support upstream.
      "effect/ParseResult": new URL("./src/lib/shims/effect-parse-result.ts", import.meta.url)
        .pathname,
      "effect/RuntimeFlags": new URL("./src/lib/shims/effect-runtime-flags.ts", import.meta.url)
        .pathname,
    },
  },
  ssr: {
    // Inline LiveStore into the SSR bundle so our `resolve.alias`
    // rewrites for `effect/ParseResult` / `effect/RuntimeFlags` get
    // applied before wrangler's downstream pre-bundler walks node_modules
    // and re-resolves the v3 paths.
    noExternal: [/^@livestore\//],
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  plugins: [tailwindcss(), agents(), sqlocal(), sveltekit()],
});
