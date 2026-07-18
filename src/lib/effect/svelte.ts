import type { Effect, Scope } from "effect";
import type { Attachment } from "svelte/attachments";

import { startScopedApp, type AppServices } from "$lib/app/runtime";

/**
 * Adapts a scoped Effect program to Svelte 5's attachment lifecycle. Effect
 * owns acquisition, children, retry, cancellation, and release; Svelte only
 * signals mount and detach.
 */
export function effectAttachment<A, E>(
  label: string,
  program: Effect.Effect<A, E, AppServices | Scope.Scope>,
  onError?: (label: string, message: string) => void,
): Attachment<HTMLElement> {
  return () => startScopedApp(label, program, onError);
}

/** Imperative half of {@link effectAttachment} for parameterized attachments. */
export function mountEffect<A, E>(
  label: string,
  program: Effect.Effect<A, E, AppServices | Scope.Scope>,
  onError?: (label: string, message: string) => void,
): () => void {
  return startScopedApp(label, program, onError);
}
