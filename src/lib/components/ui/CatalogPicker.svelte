<script lang="ts">
  import { Search } from "@lucide/svelte";

  import { Input } from "./input/index.js";
  import * as Select from "./select/index.js";
  import { cn } from "$lib/utils.js";
  import type { CatalogOption } from "./types";

  type Props = {
    query: string;
    onQueryChange: (next: string) => void;
    selectedId: string;
    onSelectedIdChange: (next: string) => void;
    options: CatalogOption[];
    placeholder?: string;
    title?: string;
    placeholderOption?: string;
  };

  let {
    query,
    onQueryChange,
    selectedId,
    onSelectedIdChange,
    options,
    placeholder = "Search VIA",
    title,
    placeholderOption,
  }: Props = $props();

  const fallbackOption = $derived(
    placeholderOption ?? (options.length ? `${options.length} results` : "Catalog"),
  );

  const selectedLabel = $derived(
    selectedId ? (options.find((option) => option.id === selectedId)?.label ?? fallbackOption) : fallbackOption,
  );
</script>

<div
  class="inline-flex h-8 w-full max-w-[420px] min-w-0 items-center gap-1.5 rounded-lg border border-line-2 bg-surface px-2"
  {title}
>
  <Search size={14} class="flex-none text-ink-3" />
  <Input
    aria-label="Search VIA keyboards"
    class={cn(
      "h-7 min-w-0 flex-[0_1_104px] w-[104px] border-0 bg-transparent px-0 font-mono text-[11px] shadow-none",
      "focus-visible:border-0 focus-visible:ring-0",
    )}
    {placeholder}
    value={query}
    oninput={(event) => onQueryChange(event.currentTarget.value)}
  />
  <Select.Root
    type="single"
    value={selectedId || undefined}
    onValueChange={(next) => onSelectedIdChange(next ?? "")}
  >
    <Select.Trigger
      size="sm"
      aria-label="Keyboard catalog"
      class="h-7 min-w-0 flex-[1_1_154px] border-0 bg-transparent px-0 font-mono text-[11px] text-ink shadow-none focus-visible:border-0 focus-visible:ring-0 [&_svg]:size-3.5"
    >
      {selectedLabel}
    </Select.Trigger>
    <Select.Portal>
      <Select.Content class="max-h-60 font-mono text-[11px]">
        <Select.Item value="" label={fallbackOption}>{fallbackOption}</Select.Item>
        {#each options as option (option.id)}
          <Select.Item value={option.id} label={option.label}>{option.label}</Select.Item>
        {/each}
      </Select.Content>
    </Select.Portal>
  </Select.Root>
</div>
