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

<div class="lighting-inspector" class:compact>
  <section class="paint-section" aria-label="Per-key lighting paint">
    <header class="lighting-hero">
      <div
        class="led-preview"
        class:mixed={selection.mixed}
        class:off={heroOff}
        style={heroStyle}
        aria-hidden="true"
      >
        {#if selection.mixed}
          <Blend size={22} />
        {:else if heroOff}
          <Power size={22} />
        {/if}
      </div>
      <div class="hero-copy">
        <span>{heroMeta}</span>
        <h2>{heroTitle}</h2>
      </div>
    </header>

    <div class="field">
      <span class="field-label">Paint selection</span>
      <div class="swatches" aria-label="Lighting swatches">
        {#each lightingSwatches as swatch (swatch.id)}
          {@const active = activeSwatchId === swatch.id}
          <button
            type="button"
            class="swatch-button"
            class:active
            class:off={swatch.off}
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

    <div class="selection-actions">
      <Button variant="ghost" size="sm" onclick={() => editor.selectAllKeys()}>
        <Grid2x2Check size={14} aria-hidden="true" />
        Select all
      </Button>
      <Button
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

  <section class="control-section" aria-label="Global lighting controls">
    <SliderField
      compact
      label="Brightness"
      value={editor.lightingBrightness}
      min={0}
      max={100}
      defaultValue={82}
      onValueChange={(next) => editor.setBrightness(next)}
    />

    <div class="divider"></div>

    <div class="field">
      <span class="field-label">Global effect</span>
      <SegmentedNav
        items={effectItems}
        value={editor.lightingEffect}
        onselect={(next) => editor.setEffect(next)}
        ariaLabel="Global lighting effect"
        class="lighting-effect-nav"
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

    <label class="tint-row">
      <span>Tint by active layer</span>
      <Switch
        checked={editor.tintByLayer}
        onCheckedChange={(checked) => {
          if (typeof checked === "boolean") editor.toggleTintByLayer(checked);
        }}
      />
    </label>

    <div class="drag-status" aria-live="polite">
      <MousePointer2 size={14} aria-hidden="true" />
      <span>{selection.count} selected</span>
    </div>
  </section>
</div>

<style>
  .lighting-inspector {
    display: flex;
    flex: 1;
    min-height: 0;
    flex-direction: column;
    gap: 14px;
  }

  .paint-section,
  .control-section {
    display: grid;
    gap: 13px;
    min-width: 0;
  }

  .lighting-hero {
    display: grid;
    grid-template-columns: 58px minmax(0, 1fr);
    gap: 12px;
    align-items: center;
    padding: 14px;
    border: 1px solid color-mix(in oklch, var(--surface-3) 58%, transparent);
    border-radius: 12px;
    background: color-mix(in oklch, var(--surface-2) 62%, var(--surface));
  }

  .led-preview {
    display: grid;
    width: 58px;
    height: 58px;
    place-items: center;
    border: 1px solid rgba(24, 22, 20, 0.22);
    border-radius: var(--r-big-cap);
    background: linear-gradient(180deg, color-mix(in oklch, var(--hero-color) 42%, #fffdf7), var(--hero-color));
    box-shadow:
      inset 0 -4px 7px color-mix(in oklch, var(--hero-color) 48%, transparent),
      var(--shadow-cap);
    color: rgba(242, 237, 227, 0.72);
  }

  .led-preview.mixed,
  .led-preview.off {
    background: var(--led-off);
    color: rgba(242, 237, 227, 0.68);
    box-shadow: var(--shadow-cap);
  }

  .led-preview.mixed {
    background:
      linear-gradient(135deg, transparent 0 42%, rgba(255, 255, 255, 0.18) 42% 58%, transparent 58%),
      var(--led-off);
  }

  .hero-copy {
    min-width: 0;
  }

  .hero-copy span,
  .field-label {
    display: block;
    color: var(--ink-3);
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  h2 {
    overflow: hidden;
    margin: 2px 0 0;
    font-size: 18px;
    line-height: 1.15;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .field {
    display: grid;
    gap: 8px;
  }

  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .swatch-button {
    position: relative;
    display: grid;
    width: 28px;
    height: 28px;
    place-items: center;
    border: 1px solid rgba(27, 25, 23, 0.2);
    border-radius: var(--r-pill);
    background: var(--swatch-color);
    box-shadow: inset 0 -2px 3px rgba(0, 0, 0, 0.14);
    color: rgba(242, 237, 227, 0.72);
    transition:
      transform 90ms var(--ease-out-soft),
      box-shadow 90ms var(--ease-out-soft),
      border-color 90ms var(--ease-out-soft);
  }

  .swatch-button:hover {
    transform: scale(1.08);
  }

  .swatch-button.active {
    border-color: var(--ink);
    box-shadow: var(--shadow-swatch-pressed);
  }

  .swatch-button.off {
    background: #1b1917;
  }

  .selection-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .selection-actions :global(button) {
    width: 100%;
  }

  .divider {
    height: 1px;
    background: var(--line);
  }

  :global(.lighting-effect-nav) {
    display: flex !important;
    width: 100%;
  }

  :global(.lighting-effect-nav > button) {
    flex: 1;
    min-width: 0;
    padding-inline: 8px;
  }

  .tint-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 28px;
    color: var(--ink-2);
    font-size: 12px;
  }

  .drag-status {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    padding: 9px 11px;
    border-radius: 9px;
    background: var(--surface-2);
    color: var(--ink-2);
    font-family: var(--mono);
    font-size: 11px;
  }

  .compact {
    display: grid;
    grid-template-columns: minmax(250px, 0.85fr) minmax(0, 1.15fr);
    align-items: start;
    gap: 16px;
  }

  .compact .lighting-hero {
    grid-template-columns: 52px minmax(0, 1fr);
  }

  .compact .led-preview {
    width: 52px;
    height: 52px;
  }

  @media (max-width: 680px) {
    .compact,
    .selection-actions {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
