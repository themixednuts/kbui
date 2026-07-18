import type { LucideIcon } from "@lucide/svelte";
import type { Snippet } from "svelte";

import type {
  ButtonSize as ShadcnButtonSize,
  ButtonVariant as ShadcnButtonVariant,
} from "./button/index.js";

/** Icon slot type. Matches `@lucide/svelte`'s `LucideIcon` (a Svelte 5 function
 * component) so consumers get full prop intellisense. */
export type IconComponent = LucideIcon;

export type ButtonVariant = ShadcnButtonVariant;
export type ButtonSize = ShadcnButtonSize | "md";

export type ChipTone = "neutral" | "success" | "error" | "warning";

export type CatalogOption = { id: string; label: string };

export type SegmentItem<TValue extends string = string> = {
  value: TValue;
  label: string;
  /** When set, renders a SvelteKit `<a>` instead of a button (idiomatic client nav). */
  href?: string;
  icon?: IconComponent;
  title?: string;
  testid?: string;
};

export type TopbarStatus = "idle" | "unsupported" | "requesting" | "connected" | "error";

export type TopbarStatusInfo = {
  label: string;
  state: TopbarStatus;
  title?: string;
};

export type TopbarTransport = {
  label: string;
  title: string;
  icon: IconComponent;
  testid?: string;
  onclick: () => void;
};

export type TopbarAvatarConfig = {
  cta: boolean;
  title?: string;
  ariaLabel?: string;
  onclick: () => void;
  image?: string | null;
  initials?: string;
  ctaIcon?: Snippet;
  testid?: string;
};
