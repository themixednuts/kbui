<script lang="ts">
  import { Activity } from "@lucide/svelte";
  import type { Snippet } from "svelte";

  import AvatarButton from "./AvatarButton.svelte";
  import Brand from "./Brand.svelte";
  import Chip from "./Chip.svelte";
  import type { ChipTone, TopbarAvatarConfig, TopbarStatusInfo } from "./types";

  type Props = {
    deviceName: string;
    deviceTitle?: string;
    /** Optional protocol label shown next to the device chip. Pass empty
     * string / undefined to hide it (e.g. when no keyboard is attached). */
    protocolLabel?: string;
    /** Render slot for the catalog picker (search + select). */
    catalog?: Snippet;
    /** Render slot for the segmented view nav. */
    nav?: Snippet;
    /** Render slot for transport buttons (WebUSB / WebHID / Mock). */
    transports?: Snippet;
    /** Optional render slot for additional commands (e.g. OS chip) rendered
     * between the transport status chip and the avatar. Keep this small —
     * one or two pills max to avoid topbar overflow. */
    extras?: Snippet;
    /** Optional connection-state chip. If the `transports` slot already
     * conveys state (e.g. a unified state-aware pill), omit this to avoid
     * duplicating the indicator. */
    status?: TopbarStatusInfo;
    /** Auth avatar control. Pass `cta: true` to render the sign-in style. */
    avatar?: TopbarAvatarConfig;
    onbrandclick?: () => void;
    brandHref?: string;
  };

  let {
    deviceName,
    deviceTitle,
    protocolLabel,
    catalog,
    nav,
    transports,
    extras,
    status,
    avatar,
    onbrandclick,
    brandHref,
  }: Props = $props();

  const statusTone = $derived<ChipTone>(
    status?.state === "connected"
      ? "success"
      : status?.state === "error" || status?.state === "unsupported"
        ? "error"
        : status?.state === "requesting"
          ? "warning"
          : "neutral",
  );
</script>

<header
  class="topbar app-topbar grid items-center gap-[10px] min-w-0 h-[56px] px-[14px] overflow-hidden border-b border-line bg-paper
    [grid-template-columns:minmax(172px,0.58fr)_minmax(360px,1fr)_max-content]
    max-[1500px]:[grid-template-columns:minmax(150px,0.5fr)_minmax(300px,1fr)_max-content]
    max-[1180px]:[grid-template-columns:minmax(122px,0.4fr)_minmax(250px,1fr)_max-content]
    max-[940px]:[grid-template-columns:minmax(96px,auto)_minmax(0,1fr)_max-content]
    max-[720px]:[grid-template-columns:auto_minmax(0,1fr)_auto] max-[720px]:px-[10px]"
>
  <!-- Identity -->
  <div class="flex items-center gap-[8px] min-w-0 overflow-hidden justify-self-stretch">
    <Brand href={brandHref} onclick={onbrandclick} />
    <Chip
      dot="var(--color-teal)"
      title={deviceTitle}
      class="flex-1 max-w-[210px] max-[720px]:hidden"
    >
      {deviceName}
    </Chip>
    {#if protocolLabel}
      <Chip class="max-[1180px]:hidden">{protocolLabel}</Chip>
    {/if}
  </div>

  <!-- Workspace (catalog + nav) -->
  <div class="flex items-center gap-[8px] min-w-0 overflow-hidden justify-self-stretch max-[940px]:justify-center">
    <div class="min-w-0 flex-1 max-[940px]:hidden">
      {#if catalog}{@render catalog()}{/if}
    </div>
    {#if nav}
      <div class="flex-none shrink-0">
        {@render nav()}
      </div>
    {/if}
  </div>

  <!-- Commands -->
  <div class="flex items-center justify-end gap-[8px] min-w-0">
    {#if transports}
      <div class="flex items-center gap-[6px] flex-none min-w-0 max-[720px]:hidden">
        {@render transports()}
        {#if status}
          <Chip
            tone={statusTone}
            dot={status.state === "connected" ? "var(--color-mint)" : undefined}
            title={status.title ?? status.label}
            class="flex-[0_1_168px] min-w-[28px] max-w-[clamp(28px,14vw,200px)] max-[1180px]:w-[28px] max-[1180px]:min-w-[28px] max-[1180px]:max-w-[28px] max-[1180px]:justify-center"
          >
            <Activity size={13} />
            <span
              class="overflow-hidden text-ellipsis whitespace-nowrap max-[1180px]:hidden"
              >{status.label}</span
            >
          </Chip>
        {/if}
      </div>
    {/if}
    {#if extras}
      <div class="flex items-center gap-[6px] flex-none max-[720px]:hidden">
        {@render extras()}
      </div>
    {/if}
    {#if avatar}
      <AvatarButton
        cta={avatar.cta}
        title={avatar.title}
        ariaLabel={avatar.ariaLabel}
        onclick={avatar.onclick}
        image={avatar.image}
        initials={avatar.initials}
        testid={avatar.testid}
      >
        {#if avatar.ctaIcon}{@render avatar.ctaIcon()}{/if}
      </AvatarButton>
    {/if}
  </div>
</header>
