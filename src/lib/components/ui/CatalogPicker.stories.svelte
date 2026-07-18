<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import CatalogPicker from "./CatalogPicker.svelte";

  const sample = [
    { id: "local/ansi", label: "Local / ANSI profile" },
    { id: "local/split", label: "Local / split profile" },
    { id: "drop/ctrl", label: "Drop / CTRL" },
  ];

  const { Story } = defineMeta({
    title: "UI/CatalogPicker",
    component: CatalogPicker,
    tags: ["autodocs"],
  });
</script>

<script lang="ts">
  let query = $state("");
  let selectedId = $state("");
</script>

<Story name="Default">
  {#snippet template()}
    <div class="w-[420px]">
      <CatalogPicker
        {query}
        onQueryChange={(next) => (query = next)}
        {selectedId}
        onSelectedIdChange={(next) => (selectedId = next)}
        options={sample}
      />
    </div>
  {/snippet}
</Story>

<Story name="With selection">
  {#snippet template()}
    <div class="w-[420px]">
      <CatalogPicker
        query="65"
        onQueryChange={() => {}}
        selectedId="klakson/wb65"
        onSelectedIdChange={() => {}}
        options={sample}
      />
    </div>
  {/snippet}
</Story>
