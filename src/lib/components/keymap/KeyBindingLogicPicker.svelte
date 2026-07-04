<script lang="ts">
  import type { LogicBindingOption } from "$lib/keyboard/logic-bindings";
  import { Chip } from "$lib/components/ui";

  type Props = {
    items: LogicBindingOption[];
    activeCode: string;
    onBind: (item: LogicBindingOption) => void;
  };

  let { items, activeCode, onBind }: Props = $props();

  const bindable = $derived(items.filter((item) => item.code !== null));
  const reference = $derived(items.filter((item) => item.code === null));
</script>

{#if items.length === 0}
  <p class="logic-empty">
    Nothing in the Logic builder yet.
    <a href="/library" data-sveltekit-preload-data="hover">Create macros &amp; tap dances</a>
    first.
  </p>
{:else}
  <ul class="logic-list">
    {#each bindable as item (item.id)}
      <li>
        <button
          type="button"
          class="logic-row"
          class:logic-row-active={activeCode === item.code}
          title={item.detail}
          onclick={() => onBind(item)}
        >
          <span class="logic-row-main">
            <span class="logic-row-label">{item.label}</span>
            <span class="logic-row-detail">{item.detail}</span>
          </span>
          <Chip tone={item.kind === "macro" ? "warning" : "success"}>
            {item.kind === "macro" ? "macro" : "tap"}
          </Chip>
        </button>
      </li>
    {/each}

    {#each reference as item (item.id)}
      <li>
        <div class="logic-row logic-row-static" title={item.detail}>
          <span class="logic-row-main">
            <span class="logic-row-label">{item.label}</span>
            <span class="logic-row-detail">{item.detail}</span>
          </span>
          <Chip>global</Chip>
        </div>
      </li>
    {/each}
  </ul>

  {#if reference.length > 0}
    <p class="logic-footnote">Combos trigger when their keys are pressed together.</p>
  {/if}
{/if}

<style>
  .logic-empty {
    margin: 0;
    padding: 8px 2px;
    color: var(--ink-3);
    font-size: 12px;
    line-height: 1.45;
  }

  .logic-empty a {
    color: var(--ink);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .logic-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
    padding: 0 2px 4px 0;
    list-style: none;
  }

  .logic-row {
    display: flex;
    width: 100%;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 10px;
    border: 1px solid transparent;
    border-radius: 10px;
    background: var(--paper-2);
    text-align: left;
    transition:
      border-color 120ms ease,
      background 120ms ease,
      transform 120ms ease;
  }

  button.logic-row:hover {
    border-color: var(--line-2);
    transform: translateY(-1px);
  }

  .logic-row-active {
    border-color: color-mix(in oklab, var(--coral) 55%, var(--line-2));
    background: color-mix(in oklab, var(--coral) 12%, var(--paper-2));
  }

  .logic-row-static {
    opacity: 0.82;
  }

  .logic-row-main {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .logic-row-label {
    overflow: hidden;
    font-size: 12px;
    font-weight: 600;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .logic-row-detail {
    overflow: hidden;
    color: var(--ink-3);
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.02em;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .logic-footnote {
    margin: 4px 2px 0;
    color: var(--ink-3);
    font-size: 10px;
    line-height: 1.35;
  }
</style>
