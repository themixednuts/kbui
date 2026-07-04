<script lang="ts">
  import {
    Blend,
    Eraser,
    Grid2x2Check,
    MousePointer2,
    Palette,
    Power,
    Sparkles,
  } from "@lucide/svelte";

  import {
    type EditorLightingEffect,
    type EditorStore,
  } from "$lib/app/editor-store.svelte";
  import { keyLightingToCss } from "$lib/components/board/board-view-model";
  import { Button, SegmentedNav, SliderField, Switch } from "$lib/components/ui";
  import type { SegmentItem } from "$lib/components/ui/types";
  import {
    lightingSwatches,
    swatchToKeyLighting,
    type LightingSwatchId,
  } from "$lib/keyboard/lighting-swatches";
  import { cn } from "$lib/utils.js";

  type Props = {
    editor: EditorStore;
    compact?: boolean;
  };

  let { editor, compact = false }: Props = $props();

  const effectItems: SegmentItem<EditorLightingEffect>[] = [
    { value: "solid", label: "Solid", icon: Palette, title: "Solid lighting" },
    { value: "reactive", label: "Reactive", icon: Sparkles, title: "Reactive lighting" },
    { value: "rainbow", label: "Rainbow", icon: Blend, title: "Rainbow lighting" },
  ];

  const labelTextClass = "block text-ink-3 font-mono text-kb-10 tracking-[0.1em] uppercase";
  const fieldLabelClass = `field-label ${labelTextClass}`;
  const fieldClass = "field !grid !gap-[8px]";
  const navFillClass =
    "!flex w-full [&>button]:min-w-0 [&>button]:flex-1 [&>button]:px-[8px]";
  const inactivePreviewClass =
    "bg-[var(--led-off)] text-[rgba(242,237,227,0.68)] shadow-cap";

  const selection = $derived(editor.lightingSelection);
  const heroLighting = $derived(selection.keyLighting ?? swatchToKeyLighting(editor.currentSwatch));
  const heroColor = $derived(selection.mixed ? null : keyLightingToCss(heroLighting));
  const heroOff = $derived(!selection.mixed && heroLighting.brightness <= 0);
  const activeSwatchId = $derived(selection.swatchId ?? editor.currentSwatch);
  const heroTitle = $derived.by(() => {
    if (selection.count === 0) return "No keys selected";
    if (selection.mixed) return "Mixed";
    if (selection.swatchId === "off") return "LED off";
    return "Custom color";
  });
  const heroMeta = $derived(`${selection.count} key${selection.count === 1 ? "" : "s"} selected`);
  const heroStyle = $derived(heroColor ? `--hero-color: ${heroColor}` : "");

  function paintSwatch(swatchId: LightingSwatchId) {
    editor.applySwatchToSelection(swatchId);
  }
</script>

<div
  class={cn(
    "lighting-inspector flex flex-1 min-h-0 flex-col gap-[14px]",
    compact &&
      "compact grid grid-cols-[minmax(360px,0.95fr)_minmax(0,1.05fr)] items-stretch gap-[16px] max-[680px]:grid-cols-[minmax(0,1fr)]",
  )}
>
  <section
    class={cn(
      "paint-section grid min-w-0 gap-[13px]",
      compact &&
        "grid-cols-[minmax(210px,0.42fr)_minmax(0,1fr)_auto] items-center max-[680px]:grid-cols-[minmax(0,1fr)]",
    )}
    aria-label="Per-key lighting paint"
  >
    <header
      class={cn(
        "lighting-hero grid grid-cols-[58px_minmax(0,1fr)] items-center gap-[12px] rounded-[12px] border border-[color-mix(in_oklch,var(--surface-3)_58%,transparent)] bg-[color-mix(in_oklch,var(--surface-2)_62%,var(--surface))] p-[14px]",
        compact && "grid-cols-[52px_minmax(0,1fr)] p-[10px]",
      )}
    >
      <div
        class={cn(
          "led-preview grid size-[58px] place-items-center rounded-big-cap border border-[rgba(24,22,20,0.22)] bg-[linear-gradient(180deg,color-mix(in_oklch,var(--hero-color)_42%,#fffdf7),var(--hero-color))] text-[rgba(242,237,227,0.72)] shadow-[inset_0_-4px_7px_color-mix(in_oklch,var(--hero-color)_48%,transparent),var(--shadow-cap)]",
          compact && "size-[52px]",
          selection.mixed &&
            "mixed bg-[linear-gradient(135deg,transparent_0_42%,rgba(255,255,255,0.18)_42%_58%,transparent_58%),var(--led-off)] text-[rgba(242,237,227,0.68)] shadow-cap",
          heroOff && cn("off", inactivePreviewClass),
        )}
        style={heroStyle}
        aria-hidden="true"
      >
        {#if selection.mixed}
          <Blend size={22} />
        {:else if heroOff}
          <Power size={22} />
        {/if}
      </div>
      <div class="hero-copy min-w-0">
        <span class={labelTextClass}>{heroMeta}</span>
        <h2 class="mt-[2px] mb-0 overflow-hidden text-ellipsis whitespace-nowrap text-[18px] leading-[1.15]">
          {heroTitle}
        </h2>
      </div>
    </header>

    <div class={fieldClass}>
      <span class={fieldLabelClass}>Paint selection</span>
      <div class="swatches flex flex-wrap gap-[8px]" aria-label="Lighting swatches">
        {#each lightingSwatches as swatch (swatch.id)}
          {@const active = activeSwatchId === swatch.id}
          <button
            type="button"
            class={cn(
              "swatch-button relative grid size-[28px] place-items-center rounded-pill !border !border-[rgba(27,25,23,0.2)] !bg-[var(--swatch-color)] !text-[rgba(242,237,227,0.72)] shadow-[inset_0_-2px_3px_rgba(0,0,0,0.14)] transition-[transform,box-shadow,border-color] duration-[90ms] ease-[var(--ease-out-soft)] hover:scale-[1.08]",
              active && "active !border-ink shadow-swatch-pressed",
              swatch.off && "off !bg-[#1b1917]",
            )}
            style={`--swatch-color: ${swatch.displayColor}`}
            title={swatch.label}
            aria-label={swatch.label}
            aria-pressed={active}
            onclick={() => paintSwatch(swatch.id)}
          >
            {#if swatch.off}
              <Power size={14} aria-hidden="true" />
            {/if}
          </button>
        {/each}
      </div>
    </div>

    <div
      class={cn(
        "selection-actions grid grid-cols-[repeat(2,minmax(0,1fr))] gap-[8px] max-[680px]:grid-cols-[minmax(0,1fr)]",
        compact && "w-[168px]",
      )}
    >
      <Button class="w-full" variant="ghost" size="sm" onclick={() => editor.selectAllKeys()}>
        <Grid2x2Check size={14} aria-hidden="true" />
        Select all
      </Button>
      <Button
        class="w-full"
        variant="ghost"
        size="sm"
        disabled={selection.count === 0}
        onclick={() => editor.clearSelection()}
      >
        <Eraser size={14} aria-hidden="true" />
        Clear
      </Button>
    </div>
  </section>

  <section
    class={cn(
      "control-section grid min-w-0",
      compact
        ? "grid-cols-[minmax(160px,0.8fr)_minmax(220px,1.25fr)_minmax(150px,0.8fr)] content-start items-center gap-x-[14px] gap-y-[10px] max-[680px]:grid-cols-[minmax(0,1fr)]"
        : "gap-[13px]",
    )}
    aria-label="Global lighting controls"
  >
    <SliderField
      compact
      label="Brightness"
      value={editor.lightingBrightness}
      min={0}
      max={100}
      defaultValue={82}
      onValueChange={(next) => editor.setBrightness(next)}
    />

    <div class={cn("divider h-px bg-line", compact && "hidden")}></div>

    <div class={fieldClass}>
      <span class={fieldLabelClass}>Global effect</span>
      <SegmentedNav
        items={effectItems}
        value={editor.lightingEffect}
        onselect={(next) => editor.setEffect(next)}
        ariaLabel="Global lighting effect"
        class={cn("lighting-effect-nav", navFillClass)}
      />
    </div>

    <SliderField
      compact
      label="Speed"
      value={editor.lightingSpeed}
      min={0}
      max={100}
      defaultValue={45}
      onValueChange={(next) => editor.setSpeed(next)}
    />

    <label
      class={cn(
        "tint-row flex min-h-[28px] items-center justify-between gap-[12px] text-[12px] text-ink-2",
        compact && "self-end",
      )}
    >
      <span>Tint by active layer</span>
      <Switch
        checked={editor.tintByLayer}
        onCheckedChange={(checked) => {
          if (typeof checked === "boolean") editor.toggleTintByLayer(checked);
        }}
      />
    </label>

    <div
      class={cn(
        "drag-status inline-flex min-w-0 items-center gap-[7px] rounded-[9px] bg-surface-2 px-[11px] py-[9px] font-mono text-[11px] text-ink-2",
        compact && "self-end",
      )}
      aria-live="polite"
    >
      <MousePointer2 size={14} aria-hidden="true" />
      <span>{selection.count} selected</span>
    </div>
  </section>
</div>
