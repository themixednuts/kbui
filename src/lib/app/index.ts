/**
 * `$lib/app` — the Effect-modeled application core.
 *
 * Services live under `./services/` as namespaced modules. Each exports
 * Effect-producing functions (no Context.Tag yet; promote when DI surface
 * becomes useful for testing). The UI layer composes these via `runApp`
 * from `./runtime.ts` and mirrors the resulting values into Svelte
 * `$state` for reactivity.
 *
 *   import { runApp, TargetOS } from "$lib/app";
 *   const value = await runApp("Load target OS", TargetOS.load);
 */
export { runApp, runAppSync } from "./runtime.ts";
export * as Accent from "./services/accent.ts";
export * as Preferences from "./services/preferences.ts";
export * as TargetOS from "./services/target-os.ts";
