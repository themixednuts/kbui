<script lang="ts">
  /**
   * Sheet — a side-anchored dialog (drawer) for things like the settings
   * panel. Built on bits-ui Dialog primitives so we inherit focus
   * management, ESC-to-close, scroll-lock, and accessible labeling for
   * free, then styled to match the Klakson editorial palette.
   *
   * Usage:
   *   <Sheet bind:open={settingsOpen} title="Settings" side="right">
   *     {#snippet body()}
   *       …form rows …
   *     {/snippet}
   *     {#snippet footer()}
   *       <Button onclick={…}>Done</Button>
   *     {/snippet}
   *   </Sheet>
   */
  import { Dialog } from "bits-ui";
  import { X } from "@lucide/svelte";
  import type { Snippet } from "svelte";
  import { cn } from "$lib/utils";

  type Side = "left" | "right" | "top" | "bottom";

  type Props = {
    /** Two-way bound open flag. */
    open?: boolean;
    /** Where the sheet slides in from. Defaults to right. */
    side?: Side;
    /** Accessible title. Required even if the visual title is omitted. */
    title: string;
    /** Optional sub-line under the title. */
    description?: string;
    /** Hide the visual title row entirely (kept for screen readers). */
    hideTitle?: boolean;
    /** Sheet width / height. Defaults sized for a settings panel. */
    size?: "sm" | "md" | "lg";
    /** Render slot for the main body. */
    body?: Snippet;
    /** Optional sticky footer action row. */
    footer?: Snippet;
    /** Extra classes on the content panel. */
    class?: string;
  };

  let {
    open = $bindable(false),
    side = "right",
    title,
    description,
    hideTitle = false,
    size = "md",
    body,
    footer,
    class: className,
  }: Props = $props();

  const sideClasses: Record<Side, string> = {
    right: "inset-y-0 right-0 h-full border-l data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right",
    left: "inset-y-0 left-0 h-full border-r data-[state=open]:animate-in data-[state=open]:slide-in-from-left data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left",
    top: "inset-x-0 top-0 w-full border-b data-[state=open]:animate-in data-[state=open]:slide-in-from-top data-[state=closed]:animate-out data-[state=closed]:slide-out-to-top",
    bottom:
      "inset-x-0 bottom-0 w-full border-t data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom",
  };

  const sizeClasses: Record<NonNullable<Props["size"]>, string> = {
    sm: "w-[min(380px,92vw)]",
    md: "w-[min(440px,94vw)]",
    lg: "w-[min(620px,96vw)]",
  };
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay
      class="fixed inset-0 z-40 bg-ink/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0"
    />
    <Dialog.Content
      class={cn(
        "fixed z-50 flex flex-col gap-0 bg-paper text-ink shadow-[0_20px_60px_-20px_rgba(24,22,20,0.35)] outline-0",
        sideClasses[side],
        side === "left" || side === "right" ? sizeClasses[size] : "",
        className,
      )}
    >
      <header class="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-line-2">
        <div class={cn("min-w-0", hideTitle && "sr-only")}>
          <Dialog.Title
            class="font-mono text-[11px] tracking-[0.14em] uppercase text-ink-3"
            >Klakson</Dialog.Title
          >
          <p class="mt-1 font-sans text-[17px] font-semibold leading-tight text-ink">
            {title}
          </p>
          {#if description}
            <Dialog.Description class="mt-1 text-[12.5px] leading-snug text-ink-2"
              >{description}</Dialog.Description
            >
          {/if}
        </div>
        <Dialog.Close
          class="inline-flex items-center justify-center w-7 h-7 rounded-md border border-line-2 bg-paper text-ink-3 hover:text-ink hover:bg-paper-2 transition-colors"
          aria-label="Close settings"
        >
          <X size={14} />
        </Dialog.Close>
      </header>

      <div class="flex-1 min-h-0 overflow-y-auto px-5 py-4">
        {#if body}{@render body()}{/if}
      </div>

      {#if footer}
        <footer class="flex items-center justify-end gap-2 px-5 py-3 border-t border-line-2 bg-paper-2/40">
          {@render footer()}
        </footer>
      {/if}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
