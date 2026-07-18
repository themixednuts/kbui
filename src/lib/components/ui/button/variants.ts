import type { WithElementRef } from "$lib/utils.js";
import type { HTMLAnchorAttributes, HTMLButtonAttributes } from "svelte/elements";
import { type VariantProps, tv } from "tailwind-variants";

export const buttonVariants = tv({
  base: "focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 aria-invalid:border-destructive rounded-md border border-transparent bg-clip-padding text-sm font-medium leading-none focus-visible:ring-3 active:not-aria-[haspopup]:translate-y-px aria-invalid:ring-3 [&_svg:not([class*='size-'])]:size-4 group/button inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform] outline-none select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  variants: {
    variant: {
      default: "bg-primary text-primary-foreground hover:bg-primary/80",
      coral: "border-coral bg-coral text-on-accent shadow-cap hover:bg-[var(--accent-solid-hover)]",
      solid: "border-ink bg-ink text-surface hover:bg-ink-2",
      outline:
        "border-line-2 bg-surface text-ink shadow-xs hover:border-ink hover:bg-surface-2 aria-expanded:bg-surface-2 aria-expanded:text-ink",
      secondary:
        "bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
      ghost:
        "text-ink-2 hover:bg-surface-2 hover:text-ink aria-expanded:bg-surface-2 aria-expanded:text-ink",
      destructive:
        "bg-destructive/10 hover:bg-destructive/20 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/20 text-destructive focus-visible:border-destructive/40 dark:hover:bg-destructive/30",
      link: "text-primary underline-offset-4 hover:underline",
      segment:
        "rounded-pill border-transparent bg-transparent text-ink-2 hover:bg-card hover:text-ink",
      "segment-active":
        "rounded-pill border-transparent bg-card text-ink shadow-card hover:bg-card hover:text-ink",
    },
    size: {
      default: "h-[var(--control-height)] gap-kb-8 px-kb-12",
      xs: "h-kb-24 gap-kb-4 px-kb-8 text-xs [&_svg:not([class*='size-'])]:size-3",
      sm: "h-[var(--control-height-sm)] gap-kb-6 px-kb-10",
      lg: "h-[var(--control-height-lg)] gap-kb-8 px-kb-14",
      icon: "size-[var(--control-height)]",
      "icon-xs": "size-kb-24 [&_svg:not([class*='size-'])]:size-3",
      "icon-sm": "size-[var(--control-height-sm)]",
      "icon-lg": "size-[var(--control-height-lg)]",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
});

export type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];
export type ButtonSize = VariantProps<typeof buttonVariants>["size"];

export type ButtonProps = WithElementRef<HTMLButtonAttributes> &
  WithElementRef<HTMLAnchorAttributes> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
  };
