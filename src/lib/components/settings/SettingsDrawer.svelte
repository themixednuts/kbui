<script lang="ts">
  /**
   * Settings drawer — single home for cross-cutting preferences and the
   * account / sync surface. Slides in via the Sheet primitive (bits-ui
   * Dialog), styled to match the editorial palette. Designed to feel
   * lightweight: compact controls, no card-grids for two-letter choices,
   * and any destructive action (sign out, clear data) intentionally
   * de-emphasized so it can't be triggered by accident.
   */
  import { LogOut, ChevronRight } from "@lucide/svelte";
  import { Button, Sheet } from "$lib/components/ui";
  import { TargetOS } from "$lib/app";
  import { cn } from "$lib/utils";

  type Props = {
    open?: boolean;
    targetOS: TargetOS.TargetOS;
    onTargetOSChange: (next: TargetOS.TargetOS) => void;
    authSignedIn?: boolean;
    authName?: string | null;
    authEmail?: string | null;
    authImage?: string | null;
    onSignIn?: () => void;
    onSignOut?: () => void;
    syncStatus?: "idle" | "syncing" | "ok" | "error";
    syncLastAt?: string | null;
    onSyncNow?: () => void;
  };

  let {
    open = $bindable(false),
    targetOS,
    onTargetOSChange,
    authSignedIn = false,
    authName,
    authEmail,
    authImage,
    onSignIn,
    onSignOut,
    syncStatus = "idle",
    syncLastAt,
    onSyncNow,
  }: Props = $props();

  const osOptions: ReadonlyArray<{ value: TargetOS.TargetOS; label: string }> = [
    { value: "mac", label: "macOS" },
    { value: "win", label: "Windows" },
    { value: "linux", label: "Linux" },
  ];

  const syncCopy = $derived<Record<NonNullable<Props["syncStatus"]>, string>>({
    idle: syncLastAt ? `Last sync ${syncLastAt}` : "Not synced yet",
    syncing: "Syncing…",
    ok: syncLastAt ? `Synced ${syncLastAt}` : "All saves up to date",
    error: "Last sync failed — retry",
  });
</script>

<Sheet bind:open side="right" size="md" title="Settings" hideTitle={false}>
  {#snippet body()}
    <div class="flex flex-col gap-6">
      <!-- Account row: identity surface up top because it's the most
           important context for everything below it. -->
      <section class="flex items-center gap-3">
        {#if authSignedIn}
          {#if authImage}
            <img
              src={authImage}
              alt=""
              class="w-9 h-9 rounded-full ring-1 ring-line-2 object-cover"
            />
          {:else}
            <div
              class="w-9 h-9 rounded-full bg-paper-2 grid place-items-center text-ink-2 font-mono text-[12px]"
            >
              {(authName ?? "?").slice(0, 2).toUpperCase()}
            </div>
          {/if}
          <div class="min-w-0 flex-1">
            <div class="text-[13px] text-ink font-medium truncate">
              {authName ?? "Signed in"}
            </div>
            {#if authEmail}
              <div class="text-[11px] text-ink-3 truncate">{authEmail}</div>
            {/if}
          </div>
        {:else}
          <div
            class="w-9 h-9 rounded-full border border-dashed border-line-2 grid place-items-center text-ink-3"
            aria-hidden="true"
          >
            <ChevronRight size={14} />
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-[13px] text-ink font-medium">Not signed in</div>
            <div class="text-[11px] text-ink-3">Local edits work without an account.</div>
          </div>
          <Button variant="solid" size="sm" class="h-[30px] px-3 text-[11px]" onclick={onSignIn}>
            Sign in
          </Button>
        {/if}
      </section>

      <!-- Target OS as a single-row segmented control. Three labels,
           no descriptions — the section heading carries enough context.
           Picked by the shortcut-label dictionary at render time. -->
      <section class="flex flex-col gap-2">
        <div class="flex items-baseline justify-between">
          <h3 class="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-3 m-0">
            Target OS
          </h3>
          <span class="text-[10.5px] text-ink-3">{TargetOS.labels[targetOS]}</span>
        </div>
        <div class="os-seg" role="group" aria-label="Target operating system">
          {#each osOptions as opt (opt.value)}
            <button
              type="button"
              class:active={targetOS === opt.value}
              aria-pressed={targetOS === opt.value}
              onclick={() => onTargetOSChange(opt.value)}
            >
              {opt.label}
            </button>
          {/each}
        </div>
        <p class="text-[11.5px] leading-snug text-ink-3 m-0">
          Switches which shortcuts (Copy, Paste, …) show on keycaps.
        </p>
      </section>

      <!-- Sync surface. Status line + a single action button. Hidden
           when signed out so we don't tease unreachable features. -->
      {#if authSignedIn}
        <section class="flex flex-col gap-2">
          <div class="flex items-baseline justify-between">
            <h3 class="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-3 m-0">
              Sync
            </h3>
            <span
              class={cn(
                "text-[10.5px]",
                syncStatus === "error" ? "text-removed" : "text-ink-3",
              )}
            >
              {syncCopy[syncStatus]}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            class="self-start h-[28px] px-3 text-[11px]"
            onclick={onSyncNow}
            disabled={syncStatus === "syncing"}
          >
            {syncStatus === "syncing" ? "Syncing…" : "Sync now"}
          </Button>
        </section>
      {/if}
    </div>
  {/snippet}

  {#snippet footer()}
    {#if authSignedIn}
      <!-- Sign out lives in the footer behind a quiet ghost button —
           hard to mis-click, accessible when actually wanted. -->
      <Button
        variant="ghost"
        size="sm"
        class="h-[28px] px-2.5 text-[11px] text-ink-3 hover:text-removed"
        onclick={onSignOut}
      >
        <LogOut size={12} />
        Sign out
      </Button>
    {/if}
  {/snippet}
</Sheet>
