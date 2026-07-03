<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import Brand from "./Brand.svelte";

  const { Story } = defineMeta({
    title: "UI/Brand",
    component: Brand,
    tags: ["autodocs"],
  });
</script>

<Story name="Default">
  {#snippet template(args)}
    <Brand {...args} />
  {/snippet}
</Story>
