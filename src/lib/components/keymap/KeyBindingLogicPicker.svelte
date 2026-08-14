<script lang="ts">
  import type { LogicBindingOption } from "$lib/keyboard/logic-bindings";
  import { Button, Chip } from "$lib/components/ui";
  import * as Empty from "$lib/components/ui/empty/index.js";
  import { cn } from "$lib/utils.js";

  type Props = {
    items: LogicBindingOption[];
    activeCode: string;
    onBind: (item: LogicBindingOption) => void;
  };

  let { items, activeCode, onBind }: Props = $props();

  const bindable = $derived(items.filter((item) => item.code !== null));
  const reference = $derived(items.filter((item) => item.code === null));

  const logicRowClass =
    "logic-row flex w-full items-center justify-between gap-kb-10 rounded-md border border-transparent bg-paper-2 px-kb-10 py-kb-8 text-left transition-[border-color,background,transform] duration-[120ms] ease-[ease]";
  const logicRowButtonClass = cn(logicRowClass, "h-auto whitespace-normal hover:-translate-y-px hover:border-line-2 hover:bg-paper-2");
  const logicRowActiveClass =
    "border-[color-mix(in_oklab,var(--coral)_55%,var(--line-2))] bg-[color-mix(in_oklab,var(--coral)_12%,var(--paper-2))]";
  const logicRowMainClass = "logic-row-main flex min-w-0 flex-col gap-kb-2";
  const logicRowLabelClass =
    "logic-row-label overflow-hidden text-ellipsis whitespace-nowrap text-[12px] leading-[1.2] font-strong";
  const logicRowDetailClass =
    "logic-row-detail overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10px] leading-[1.25] tracking-[0.02em] text-ink-3";
</script>

{#if items.length === 0}
  <Empty.Root class="logic-empty min-h-0 border-0 p-kb-8">
    <Empty.Header>
      <Empty.Title class="text-kb-12 font-medium">No macros or tap dances</Empty.Title>
      <Empty.Description>
        <a href="/library" data-sveltekit-preload-data="hover">Make one in Library</a>
      </Empty.Description>
    </Empty.Header>
  </Empty.Root>
{:else}
  <ul class="logic-list m-0 flex list-none flex-col gap-kb-4 pt-0 pr-[2px] pb-kb-4 pl-0">
    {#each bindable as item (item.id)}
      <li>
        <Button
          type="button"
          variant="ghost"
          class={cn(
            logicRowButtonClass,
            activeCode === item.code && cn("logic-row-active", logicRowActiveClass),
          )}
          title={item.detail}
          onclick={() => onBind(item)}
        >
          <span class={logicRowMainClass}>
            <span class={logicRowLabelClass}>{item.label}</span>
            <span class={logicRowDetailClass}>{item.detail}</span>
          </span>
          <Chip tone={item.kind === "macro" ? "warning" : "success"}>
            {item.kind === "macro" ? "macro" : "tap"}
          </Chip>
        </Button>
      </li>
    {/each}

    {#each reference as item (item.id)}
      <li>
        <div class={cn(logicRowClass, "logic-row-static opacity-[0.82]")} title={item.detail}>
          <span class={logicRowMainClass}>
            <span class={logicRowLabelClass}>{item.label}</span>
            <span class={logicRowDetailClass}>{item.detail}</span>
          </span>
          <Chip>global</Chip>
        </div>
      </li>
    {/each}
  </ul>

  {#if reference.length > 0}
    <p class="logic-footnote mt-kb-4 mr-[2px] mb-0 ml-[2px] text-[10px] leading-[1.35] text-ink-3">Combos trigger when their keys are pressed together.</p>
  {/if}
{/if}
