<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import {
    Braces,
    Cable,
    CircuitBoard,
    Code,
    GitCompare,
    Keyboard,
    Lightbulb,
    Usb,
    UserCircle,
  } from "@lucide/svelte";

  import Button from "./Button.svelte";
  import CatalogPicker from "./CatalogPicker.svelte";
  import SegmentedNav from "./SegmentedNav.svelte";
  import Topbar from "./Topbar.svelte";

  const navItems = [
    { value: "keymap", label: "Keymap", icon: Keyboard },
    { value: "logic", label: "Logic", icon: Braces },
    { value: "lighting", label: "RGB", icon: Lightbulb },
    { value: "versioning", label: "Diff", icon: GitCompare },
    { value: "firmware", label: "Compile", icon: Code },
  ];

  const catalogOptions = [
    { id: "klakson/wb65", label: "Klakson Labs / Workbench 65" },
    { id: "klakson/corney34", label: "Klakson Labs / Corney 34" },
  ];

  const { Story } = defineMeta({
    title: "UI/Topbar",
    component: Topbar,
    tags: ["autodocs"],
    parameters: { layout: "fullscreen" },
  });
</script>

<script lang="ts">
  let activeView = $state("keymap");
  let catalogQuery = $state("");
  let catalogId = $state("");
</script>

{#snippet catalog()}
  <CatalogPicker
    query={catalogQuery}
    onQueryChange={(next) => (catalogQuery = next)}
    selectedId={catalogId}
    onSelectedIdChange={(next) => (catalogId = next)}
    options={catalogOptions}
  />
{/snippet}

{#snippet nav()}
  <SegmentedNav
    items={navItems}
    iconOnlyAt="md"
    value={activeView}
    onselect={(next) => (activeView = next)}
  />
{/snippet}

{#snippet transports()}
  <Button variant="ghost" size="icon" title="Connect with WebUSB">
    <Usb size={14} />
  </Button>
  <Button variant="ghost" size="icon" title="Connect with WebHID">
    <Cable size={14} />
  </Button>
  <Button variant="ghost" size="icon" title="Mock keyboard">
    <CircuitBoard size={14} />
  </Button>
{/snippet}

{#snippet signInIcon()}
  <UserCircle size={18} />
{/snippet}

<Story name="Idle (signed out)">
  {#snippet template()}
    <Topbar
      deviceName="Workbench 65"
      protocolLabel="VIA"
      status={{ state: "idle", label: "Ready" }}
      {catalog}
      {nav}
      {transports}
      avatar={{
        cta: true,
        title: "Sign in with GitHub",
        ariaLabel: "Sign in",
        onclick: () => {},
        ctaIcon: signInIcon,
      }}
    />
  {/snippet}
</Story>

<Story name="Connected">
  {#snippet template()}
    <Topbar
      deviceName="Corney 34"
      protocolLabel="ZMK · BLE"
      status={{ state: "connected", label: "Corney 34", title: "Connected via WebHID" }}
      {catalog}
      {nav}
      {transports}
      avatar={{
        cta: false,
        title: "Signed in",
        ariaLabel: "Sign out",
        onclick: () => {},
        initials: "JF",
      }}
    />
  {/snippet}
</Story>

<Story name="Requesting">
  {#snippet template()}
    <Topbar
      deviceName="No keyboard"
      protocolLabel="VIA"
      status={{ state: "requesting", label: "Waiting for permission" }}
      {catalog}
      {nav}
      {transports}
      avatar={{
        cta: true,
        title: "Sign in with GitHub",
        ariaLabel: "Sign in",
        onclick: () => {},
        ctaIcon: signInIcon,
      }}
    />
  {/snippet}
</Story>

<Story name="Error">
  {#snippet template()}
    <Topbar
      deviceName="No keyboard"
      protocolLabel="VIA"
      status={{ state: "error", label: "No WebHID keyboard selected" }}
      {catalog}
      {nav}
      {transports}
      avatar={{
        cta: true,
        title: "Sign in with GitHub",
        ariaLabel: "Sign in",
        onclick: () => {},
        ctaIcon: signInIcon,
      }}
    />
  {/snippet}
</Story>
