<script lang="ts">
  import { ChevronsUpDown, Database } from "@lucide/svelte";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Collapsible from "$lib/components/ui/collapsible/index.js";
  import { Chip } from "$lib/components/ui";
  import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
  import type { ChangeRecord } from "$lib/keyboard/schema";

  type Props = {
    changes: ChangeRecord[];
    total: number;
    open?: boolean;
  };

  let { changes, total, open = $bindable(true) }: Props = $props();
</script>

<Card.Root class="changes-card">
  <Collapsible.Root bind:open class="changes-panel">
    <Collapsible.Trigger class="changes-panel-trigger">
      <Card.Header class="changes-panel-header w-full border-b-0 pb-0">
        <Card.Title class="changes-panel-title">Changes</Card.Title>
        <Chip class="changes-panel-count">{total}</Chip>
        <ChevronsUpDown size={14} class="changes-panel-chevron" aria-hidden="true" />
        <span class="sr-only">{open ? "Collapse changes list" : "Expand changes list"}</span>
      </Card.Header>
    </Collapsible.Trigger>

    <Collapsible.Content class="changes-panel-content">
      <Card.Content class="changes-panel-body pt-0">
        <ScrollArea class="changes-scroll">
          <div class="changes-list">
            {#if changes.length === 0}
              <div class="empty-state">
                <Database size={18} />
                <span>No local changes</span>
              </div>
            {:else}
              {#each changes as change (change.id)}
                <article class="change-row">
                  <span class="change-kind">{change.kind[0]?.toUpperCase() ?? "?"}</span>
                  <div>
                    <strong>{change.path}</strong>
                    <small>{change.scope} · {change.kind}</small>
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
