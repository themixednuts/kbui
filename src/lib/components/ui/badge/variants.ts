import { type VariantProps, tv } from "tailwind-variants";

export const badgeVariants = tv({
  base: "h-kb-24 gap-kb-4 rounded-pill border border-transparent px-kb-8 py-0.5 text-xs font-medium leading-none has-data-[icon=inline-end]:pr-kb-6 has-data-[icon=inline-start]:pl-kb-6 [&>svg]:size-3! focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 aria-invalid:border-destructive group/badge inline-flex w-fit shrink-0 items-center justify-center overflow-hidden whitespace-nowrap transition-colors focus-visible:ring-[3px] [&>svg]:pointer-events-none",
  variants: {
    variant: {
      default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
      secondary: "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
      destructive:
        "bg-destructive/10 [a]:hover:bg-destructive/20 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 text-destructive dark:bg-destructive/20",
      outline: "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
      ghost: "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
      link: "text-primary underline-offset-4 hover:underline",
      neutral: "border-line-2 bg-surface text-ink-2",
      success: "border-[var(--success-border)] bg-success-surface text-success-ink",
      warning: "border-[var(--warning-border)] bg-warning-surface text-warning-ink",
      error: "border-[var(--danger-border)] bg-danger-surface text-danger-ink",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];
