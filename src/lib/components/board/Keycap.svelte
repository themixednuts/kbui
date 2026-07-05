<script lang="ts">
  import type { Snippet } from "svelte";

  import { cn } from "$lib/utils.js";

  import type { BoardKeyViewModel, BoardLens } from "./board-view-model";

  interface Props {
    cap: BoardKeyViewModel;
    lens?: BoardLens;
    disabled?: boolean;
    comboMarker?: Snippet<[BoardKeyViewModel]>;
    layerMarker?: Snippet<[BoardKeyViewModel]>;
    onSelectKey?: (keyId: string, event: MouseEvent) => void;
    onToggleKey?: (keyId: string, event: MouseEvent) => void;
    onKeyPointerDown?: (keyId: string, event: PointerEvent) => void;
    onKeyPointerEnter?: (keyId: string, event: PointerEvent) => void;
    onKeyPointerLeave?: (keyId: string, event: PointerEvent) => void;
  }

  let {
    cap,
    lens = "keys",
    disabled = false,
    comboMarker,
    layerMarker,
    onSelectKey,
    onToggleKey,
    onKeyPointerDown,
    onKeyPointerEnter,
    onKeyPointerLeave,
  }: Props = $props();

  const keycapRootClass =
    "board-keycap group/keycap absolute block min-w-0 overflow-visible p-0 text-left text-inherit select-none [transform:rotate(var(--rotation))] origin-top-left";
  const keycapFaceClass =
    "keycap-face relative grid h-full w-full min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-visible rounded-keycap border border-[rgba(24,22,20,0.18)] [background:var(--keycap-base)] px-[7px] pt-[5px] pb-[6px] text-ink shadow-[inset_0_-3px_0_var(--source-color,transparent),var(--shadow-cap)] transition-[transform,box-shadow,border-color,background] duration-[var(--dur-fast)] ease-[var(--ease-out-soft)] group-hover/keycap:-translate-y-px group-active/keycap:translate-y-px group-data-[label-size=xs]/keycap:px-[5px]";
  const capLegendClass =
    "cap-legend min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[length:9px] leading-none uppercase text-ink-3";
  const capSourceClass =
    "cap-src min-w-0 flex-[0_1_auto] overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[length:8px] font-bold leading-none tracking-[0.04em] text-[var(--source-color)] uppercase group-data-[label-size=xs]/keycap:hidden";
  const glyphMainClass =
    "g-main max-w-full overflow-hidden text-[13px] font-mono leading-key [overflow-wrap:anywhere] [word-break:break-word] group-data-[label-size=sm]/keycap:text-[10.5px] group-data-[label-size=sm]/keycap:leading-[1.04] group-data-[label-size=xs]/keycap:text-[8.5px] group-data-[label-size=xs]/keycap:leading-none";
  const glyphSubClass =
    "g-sub max-w-full overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[length:8px] leading-none tracking-[0.05em] text-ink-3 uppercase";
  const markerSlotClass =
    "marker-slot pointer-events-none absolute z-[4] inline-grid h-[15px] min-w-[16px] place-items-center rounded-pill px-[5px] py-0 font-mono text-[length:8px] font-[800] leading-none shadow-[0_1px_2px_rgba(24,22,20,0.18)]";

  const isLighting = $derived(lens === "lighting");
  const isLedOff = $derived(isLighting && !cap.lightingColor);
  const isFallThrough = $derived(cap.fallThrough && !cap.empty && !isLighting);
  const isEmpty = $derived(cap.empty && !isLighting);
  const isModifier = $derived(cap.modifier && !isLighting);
  const isAccent = $derived(cap.accent && !isLighting);
  const isLightingOverride = $derived(cap.hasLightingOverride && isLighting);
  const suppressHoverBorder = $derived(
    cap.selected || cap.marked || isAccent || isLightingOverride || isLedOff,
  );
  const usePressShadow = $derived(!cap.selected && !cap.marked && !isLighting && !isLedOff);
  const geometryStyle = $derived(
    [
      `left: calc(var(--u) * ${cap.x})`,
      `top: calc(var(--u) * ${cap.y})`,
      `width: calc(var(--u) * ${cap.width} - var(--board-key-gap))`,
      `height: calc(var(--u) * ${cap.height} - var(--board-key-gap))`,
      `--rotation: ${cap.rotation}deg`,
      `--source-color: ${cap.sourceColor}`,
      `--key-lighting: ${cap.lightingColor ?? "#1b1917"}`,
    ].join("; "),
  );
  const title = $derived(
    isLighting
      ? `${cap.legend} - LED ${cap.lightingColor ?? "off"}`
      : [
          `${cap.legend}: ${cap.display}${cap.display !== cap.rawCode ? ` (${cap.rawCode})` : ""}`,
          cap.comboMarker?.title,
          cap.layerMarker?.title,
        ]
          .filter(Boolean)
          .join("\n"),
  );
  const ariaLabel = $derived(
    [
      isLighting ? `${cap.legend}, LED ${cap.lightingColor ?? "off"}` : `${cap.legend}: ${cap.display}`,
      cap.selected ? "selected" : "",
      cap.marked ? "marked" : "",
      cap.comboMarker ? `combo marker ${cap.comboMarker.text}` : "",
      cap.layerMarker ? `layer activation ${cap.layerMarker.text}` : "",
    ]
      .filter(Boolean)
      .join(", "),
  );

  function handleClick(event: MouseEvent) {
    if (disabled) return;
    if (event.metaKey || event.ctrlKey) {
      onToggleKey?.(cap.id, event);
      return;
    }
    onSelectKey?.(cap.id, event);
  }
</script>

<button
  type="button"
  class={cn(
    keycapRootClass,
    cap.selected && "selected z-[5]",
    cap.marked && "marked",
    isFallThrough && "fall-through",
    isEmpty && "empty",
    isModifier && "modifier",
    isAccent && "accent",
    cap.homing && "homing",
    cap.encoder && "encoder",
    isLighting && "lighting",
    isLedOff && "led-off",
    isLightingOverride && "lighting-override",
  )}
  data-key-id={cap.id}
  data-coord={cap.coord}
  data-row={cap.row}
  data-col={cap.col}
  data-label-size={cap.labelSize}
  style={geometryStyle}
  title={title}
  aria-label={ariaLabel}
  aria-pressed={cap.selected ? "true" : undefined}
  {disabled}
  onclick={handleClick}
  onpointerdown={(event) => onKeyPointerDown?.(cap.id, event)}
  onpointerenter={(event) => onKeyPointerEnter?.(cap.id, event)}
  onpointerleave={(event) => onKeyPointerLeave?.(cap.id, event)}
>
  <span
    class={cn(
      keycapFaceClass,
      !suppressHoverBorder && "group-hover/keycap:border-[rgba(24,22,20,0.36)]",
      usePressShadow && "group-active/keycap:shadow-cap-press",
      cap.selected && "border-coral shadow-[inset_0_-3px_0_var(--source-color,transparent),var(--shadow-keycap-selected)]",
      cap.marked && "border-teal shadow-keycap-picked",
      (isFallThrough || isEmpty) && "[background:var(--keycap-transparent)] text-ink-3",
      isModifier && "[background:var(--keycap-modifier)] text-paper",
      isAccent && "border-[oklch(0.55_0.18_30)] [background:var(--keycap-accent)] text-[#1c0a04]",
      cap.encoder && "rounded-pill",
      isLighting &&
        "[background:linear-gradient(180deg,color-mix(in_oklch,var(--key-lighting)_45%,#fffdf7)_0%,var(--key-lighting)_100%)] text-[#221c12] shadow-[inset_0_-4px_8px_color-mix(in_oklch,var(--key-lighting)_55%,transparent),var(--shadow-cap)]",
      isLightingOverride && "border-[rgba(24,22,20,0.28)]",
      isLedOff && "border-[rgba(0,0,0,0.4)] [background:var(--led-off)] text-[rgba(242,237,227,0.58)] shadow-cap",
    )}
  >
    <span class="cap-top flex min-h-[10px] min-w-0 items-start justify-between gap-kb-4">
      <span
        class={cn(
          capLegendClass,
          isModifier && "text-[rgba(244,239,230,0.56)]",
          isLedOff && "text-[rgba(242,237,227,0.4)]",
        )}
      >
        {cap.legend}
      </span>
      {#if cap.sourceLabel && !isLighting}
        <span class={cn(capSourceClass, isModifier && "text-[rgba(244,239,230,0.56)]")}>
          {cap.sourceLabel}
        </span>
      {/if}
    </span>

    <span
      class="cap-glyph flex max-h-[2.35em] min-w-0 flex-1 flex-col items-center justify-center gap-kb-2 overflow-hidden text-center font-mono"
    >
      <span class={glyphMainClass}>{isLighting ? cap.legend : cap.label}</span>
      {#if cap.sublabel && !isLighting}
        <span class={cn(glyphSubClass, isModifier && "text-[rgba(244,239,230,0.56)]")}>
          {cap.sublabel}
        </span>
      {/if}
    </span>

    <span class="cap-home flex min-h-kb-4 justify-center" aria-hidden="true">
      {#if cap.homing}
        <i class="h-[2px] w-[14px] rounded-[2px] bg-current opacity-[0.74]"></i>
      {/if}
    </span>

    {#if cap.comboMarker}
      <span
        class={cn(
          markerSlotClass,
          "combo top-kb-4 right-kb-4 border border-[oklch(0.52_0.11_90/0.45)] bg-mustard text-[#332800]",
        )}
        title={cap.comboMarker.title}
      >
        {#if comboMarker}
          {@render comboMarker(cap)}
        {:else}
          {cap.comboMarker.text}
        {/if}
      </span>
    {/if}

    {#if cap.layerMarker}
      <span
        class={cn(
          markerSlotClass,
          "layer top-0 left-1/2 -translate-x-1/2 -translate-y-[48%] border border-[rgba(14,80,78,0.42)] bg-[linear-gradient(180deg,#9de2d8_0%,#57b8ae_100%)] text-[#062826]",
          cap.layerMarker.chain &&
            "chain border-[rgba(121,43,28,0.52)] bg-[linear-gradient(180deg,#f7b08a_0%,#e1683d_100%)] text-[#360f05]",
        )}
        title={cap.layerMarker.title}
      >
        {#if layerMarker}
          {@render layerMarker(cap)}
        {:else}
          {cap.layerMarker.text}
        {/if}
      </span>
    {/if}
  </span>
</button>
