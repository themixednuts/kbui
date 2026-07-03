<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import { Braces, Code, GitCompare, Keyboard, Lightbulb } from "@lucide/svelte";

  import SegmentedNav from "./SegmentedNav.svelte";

  const items = [
    { value: "keymap", label: "Keymap", icon: Keyboard },
    { value: "logic", label: "Logic", icon: Braces },
    { value: "lighting", label: "RGB", icon: Lightbulb },
    { value: "versioning", label: "Diff", icon: GitCompare },
    { value: "firmware", label: "Compile", icon: Code },
  ];

  const { Story } = defineMeta({
    title: "UI/SegmentedNav",
    component: SegmentedNav,
    tags: ["autodocs"],
  });
</script>

<script lang="ts">
  let value = $state("keymap");
</script>

<Story name="Default">
  {#snippet template()}
    <SegmentedNav {items} {value} onselect={(next) => (value = next)} />
  {/snippet}
</Story>

<Story name="Icon-only at sm">
  {#snippet template()}
    <SegmentedNav {items} iconOnlyAt="sm" {value} onselect={(next) => (value = next)} />
  {/snippet}
</Story>
