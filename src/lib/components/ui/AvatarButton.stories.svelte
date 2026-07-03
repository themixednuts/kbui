<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import { UserCircle } from "@lucide/svelte";

  import AvatarButton from "./AvatarButton.svelte";

  const { Story } = defineMeta({
    title: "UI/AvatarButton",
    component: AvatarButton,
    tags: ["autodocs"],
  });
</script>

<Story name="Sign in (CTA)">
  {#snippet template()}
    <AvatarButton cta title="Sign in with GitHub" ariaLabel="Sign in">
      <UserCircle size={18} />
    </AvatarButton>
  {/snippet}
</Story>

<Story name="Initials">
  {#snippet template()}
    <AvatarButton initials="JF" title="Signed in as Jon" ariaLabel="Sign out" />
  {/snippet}
</Story>

<Story name="Photo">
  {#snippet template()}
    <AvatarButton
      image="https://avatars.githubusercontent.com/u/3?v=4"
      title="Signed in"
      ariaLabel="Sign out"
    />
  {/snippet}
</Story>
