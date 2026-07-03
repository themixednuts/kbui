<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import { Plus, Zap } from "@lucide/svelte";

  import Button from "./Button.svelte";

  const { Story } = defineMeta({
    title: "UI/Button",
    component: Button,
    tags: ["autodocs"],
    argTypes: {
      variant: { control: "select", options: ["solid", "ghost", "coral"] },
      size: { control: "select", options: ["md", "sm", "icon"] },
      disabled: { control: "boolean" },
    },
    args: {
      variant: "solid",
      size: "md",
      disabled: false,
    },
  });
</script>

<Story name="Solid">
  {#snippet template(args)}
    <Button {...args}>Commit changes</Button>
  {/snippet}
</Story>

<Story name="Ghost" args={{ variant: "ghost" }}>
  {#snippet template(args)}
    <Button {...args}>Discard</Button>
  {/snippet}
</Story>

<Story name="Coral" args={{ variant: "coral" }}>
  {#snippet template(args)}
    <Button {...args}>
      <Zap size={14} />
      Flash to device
    </Button>
  {/snippet}
</Story>

<Story name="Small" args={{ size: "sm", variant: "ghost" }}>
  {#snippet template(args)}
    <Button {...args}>
      <Plus size={14} />
      New fork
    </Button>
  {/snippet}
</Story>

<Story name="Icon" args={{ size: "icon", variant: "ghost" }}>
  {#snippet template(args)}
    <Button {...args} aria-label="Add">
      <Plus size={14} />
    </Button>
  {/snippet}
</Story>

<Story name="Disabled" args={{ disabled: true, variant: "coral" }}>
  {#snippet template(args)}
    <Button {...args}>Flash blocked</Button>
  {/snippet}
</Story>
