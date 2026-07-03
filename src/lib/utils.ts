import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * `cn` — the canonical shadcn classname helper. Combines `clsx` (conditional
 * class composition) with `tailwind-merge` (intelligent de-duplication of
 * conflicting Tailwind utilities) so component variants and prop-passed
 * `class` values compose cleanly without "last one loses" surprises.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export type WithoutChild<T> = T extends { child?: unknown } ? Omit<T, "child"> : T;
export type WithoutChildren<T> = T extends { children?: unknown } ? Omit<T, "children"> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };
