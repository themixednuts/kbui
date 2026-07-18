<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import Chip from "./Chip.svelte";

  const { Story } = defineMeta({
    title: "UI/Chip",
    component: Chip,
    tags: ["autodocs"],
    argTypes: {
      tone: { control: "select", options: ["neutral", "success", "error", "warning"] },
      dot: { control: "text" },
    },
    args: {
      tone: "neutral",
      dot: "var(--color-teal)",
    },
  });
</script>

<Story name="Neutral with dot">
  {#snippet template(args)}
    <Chip {...args}>Local keyboard</Chip>
  {/snippet}
</Story>

<Story name="No dot" args={{ dot: undefined }}>
  {#snippet template(args)}
    <Chip {...args}>QMK · VIA v3</Chip>
  {/snippet}
</Story>

<Story name="Success" args={{ tone: "success", dot: "var(--color-mint)" }}>
  {#snippet template(args)}
    <Chip {...args}>Connected</Chip>
  {/snippet}
</Story>

<Story name="Error" args={{ tone: "error", dot: undefined }}>
  {#snippet template(args)}
    <Chip {...args}>No WebHID keyboard selected</Chip>
  {/snippet}
</Story>

<Story name="Warning" args={{ tone: "warning", dot: "var(--color-mustard)" }}>
  {#snippet template(args)}
    <Chip {...args}>Requesting permission</Chip>
  {/snippet}
</Story>
