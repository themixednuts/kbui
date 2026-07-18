import { type VariantProps, tv } from "tailwind-variants";

export const toggleVariants = tv({
  base: "hover:text-foreground aria-pressed:bg-muted focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 aria-invalid:border-destructive gap-kb-6 rounded-md text-sm font-medium leading-none transition-[background-color,border-color,color,box-shadow] [&_svg:not([class*='size-'])]:size-4 group/toggle hover:bg-muted inline-flex items-center justify-center whitespace-nowrap outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  variants: {
    variant: {
      default: "bg-transparent",
      outline: "border-input hover:bg-muted border bg-transparent shadow-xs",
    },
    size: {
      default: "h-[var(--control-height)] min-w-[var(--control-height)] px-kb-10",
      sm: "h-[var(--control-height-sm)] min-w-[var(--control-height-sm)] px-kb-8",
      lg: "h-[var(--control-height-lg)] min-w-[var(--control-height-lg)] px-kb-12",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
});

export type ToggleVariant = VariantProps<typeof toggleVariants>["variant"];
export type ToggleSize = VariantProps<typeof toggleVariants>["size"];
export type ToggleVariants = VariantProps<typeof toggleVariants>;
