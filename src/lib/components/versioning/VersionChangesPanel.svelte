<script lang="ts">
  import { ArrowRight, ChevronsUpDown, Database } from "@lucide/svelte";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Collapsible from "$lib/components/ui/collapsible/index.js";
  import { Chip } from "$lib/components/ui";
  import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
  import type { ChangeRecord } from "$lib/keyboard/schema";

  const diffBeforeClass =
    "diff-before max-w-[140px] overflow-hidden text-ellipsis whitespace-nowrap rounded-[5px] bg-[color-mix(in_oklch,var(--removed)_14%,transparent)] px-kb-7 py-kb-2 font-mono text-[12px] text-[var(--removed)]";
  const diffAfterClass =
    "diff-after max-w-[140px] overflow-hidden text-ellipsis whitespace-nowrap rounded-[5px] bg-[color-mix(in_oklch,var(--added)_16%,transparent)] px-kb-7 py-kb-2 font-mono text-[12px] text-[var(--added)]";
  const changesCardClass =
    "changes-card flex min-h-0 flex-col self-start overflow-hidden max-[1220px]:has-[.changes-panel[data-state=open]]:max-h-[212px]";
  const changesPanelClass =
    "changes-panel group/changes-panel flex min-h-0 w-full flex-col";
  const changesTriggerClass =
    "changes-panel-trigger block w-full border-0 bg-transparent p-0 text-left text-inherit";
  const changesHeaderClass =
    "changes-panel-header w-full min-w-0 items-center gap-kb-10 border-b border-line px-kb-18 py-kb-14";
  const changesTitleClass =
    "changes-panel-title m-0 min-w-0 flex-1 text-kb-14 font-semibold leading-tight";
  const changesChevronClass =
    "changes-panel-chevron flex-none text-ink-3 transition-transform duration-150 group-data-[state=open]/changes-panel:rotate-180";
  const changesScrollClass =
    "changes-scroll h-[calc(100vh-156px)] max-h-[calc(100vh-156px)] max-[1220px]:h-[160px] max-[1220px]:max-h-[160px]";
  const changesListClass = "changes-list flex flex-col gap-kb-2 p-kb-6";
  const changeRowClass =
    "change-row grid grid-cols-[20px_minmax(0,1fr)] gap-kb-8 rounded-lg px-kb-10 py-kb-8 font-mono text-[11px] hover:bg-paper-2";
  const changeCopyClass = "block overflow-hidden text-ellipsis whitespace-nowrap";

  type Props = {
    changes: ChangeRecord[];
    total: number;
    title?: string;
    open?: boolean;
  };

  let { changes, total, title = "Changes", open = $bindable(true) }: Props = $props();
</script>

<Card.Root class={changesCardClass}>
  <Collapsible.Root bind:open class={changesPanelClass}>
    <Collapsible.Trigger class={changesTriggerClass}>
      <Card.Header class={changesHeaderClass}>
        <Card.Title class={changesTitleClass}>{title}</Card.Title>
        <Chip class="changes-panel-count">{total}</Chip>
        <ChevronsUpDown size={14} class={changesChevronClass} aria-hidden="true" />
        <span class="sr-only">{open ? "Collapse changes list" : "Expand changes list"}</span>
      </Card.Header>
    </Collapsible.Trigger>

    <Collapsible.Content class="changes-panel-content overflow-hidden">
      <Card.Content class="changes-panel-body pt-0">
        <ScrollArea class={changesScrollClass}>
          <div class={changesListClass}>
            {#if changes.length === 0}
              <div class="empty-state grid min-h-[96px] place-items-center gap-kb-8 font-mono text-kb-12 text-ink-3">
                <Database size={18} />
                <span>No local edits</span>
              </div>
            {:else}
              {#each changes as change (change.id)}
                <article class={changeRowClass}>
                  <span class="change-kind font-bold text-coral-ink">{change.kind[0]?.toUpperCase() ?? "?"}</span>
                  <div class="min-w-0">
                    <strong class={changeCopyClass}>{change.path}</strong>
                    <small class="{changeCopyClass} mt-kb-2 text-ink-3">{change.scope} · {change.kind}</small>
                    {#if change.before || change.after}
                      <div class="mt-kb-6 flex min-w-0 items-center gap-kb-6">
                        <span class={diffBeforeClass} title={change.before || "--"}>{change.before || "--"}</span>
                        <ArrowRight size={13} class="shrink-0 text-ink-3" aria-hidden="true" />
                        <span class={diffAfterClass} title={change.after || "--"}>{change.after || "--"}</span>
                      </div>
                    {/if}
                  </div>
                </article>
              {/each}
            {/if}
          </div>
        </ScrollArea>
      </Card.Content>
    </Collapsible.Content>
  </Collapsible.Root>
</Card.Root>
