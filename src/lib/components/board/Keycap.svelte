<script lang="ts">
  import type { Snippet } from "svelte";

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

  const isLighting = $derived(lens === "lighting");
  const isLedOff = $derived(isLighting && !cap.lightingColor);
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
  class="board-keycap"
  class:selected={cap.selected}
  class:marked={cap.marked}
  class:fall-through={cap.fallThrough && !cap.empty && !isLighting}
  class:empty={cap.empty && !isLighting}
  class:modifier={cap.modifier && !isLighting}
  class:accent={cap.accent && !isLighting}
  class:homing={cap.homing}
  class:encoder={cap.encoder}
  class:lighting={isLighting}
  class:led-off={isLedOff}
  class:lighting-override={cap.hasLightingOverride && isLighting}
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
  <span class="keycap-face">
    <span class="cap-top">
      <span class="cap-legend">{cap.legend}</span>
      {#if cap.sourceLabel && !isLighting}
        <span class="cap-src">{cap.sourceLabel}</span>
      {/if}
    </span>

    <span class="cap-glyph">
      <span class="g-main">{isLighting ? cap.legend : cap.label}</span>
      {#if cap.sublabel && !isLighting}
        <span class="g-sub">{cap.sublabel}</span>
      {/if}
    </span>

    <span class="cap-home" aria-hidden="true">
      {#if cap.homing}
        <i></i>
      {/if}
    </span>

    {#if cap.comboMarker}
      <span class="marker-slot combo" title={cap.comboMarker.title}>
        {#if comboMarker}
          {@render comboMarker(cap)}
        {:else}
          {cap.comboMarker.text}
        {/if}
      </span>
    {/if}

    {#if cap.layerMarker}
      <span class="marker-slot layer" class:chain={cap.layerMarker.chain} title={cap.layerMarker.title}>
        {#if layerMarker}
          {@render layerMarker(cap)}
        {:else}
          {cap.layerMarker.text}
        {/if}
      </span>
    {/if}
  </span>
</button>

<style>
  .board-keycap {
    position: absolute;
    display: block;
    min-width: 0;
    padding: 0;
    overflow: visible;
    color: inherit;
    text-align: left;
    transform: rotate(var(--rotation));
    transform-origin: top left;
    user-select: none;
  }

  .keycap-face {
    position: relative;
    display: grid;
    width: 100%;
    height: 100%;
    min-width: 0;
    grid-template-rows: auto minmax(0, 1fr) auto;
    overflow: visible;
    padding: 5px 7px 6px;
    border: 1px solid rgba(24, 22, 20, 0.18);
    border-radius: var(--r-keycap);
    color: var(--ink);
    background: var(--keycap-base);
    box-shadow: inset 0 -3px 0 var(--source-color, transparent), var(--shadow-cap);
    transition:
      transform var(--dur-fast, 90ms) var(--ease-out-soft, ease),
      box-shadow var(--dur-fast, 90ms) var(--ease-out-soft, ease),
      border-color var(--dur-fast, 90ms) var(--ease-out-soft, ease),
      background var(--dur-fast, 90ms) var(--ease-out-soft, ease);
  }

  .board-keycap:hover .keycap-face {
    border-color: rgba(24, 22, 20, 0.36);
    transform: translateY(-1px);
  }

  .board-keycap:active .keycap-face {
    box-shadow: var(--shadow-cap-press);
    transform: translateY(1px);
  }

  .board-keycap.selected {
    z-index: 5;
  }

  .board-keycap.selected .keycap-face {
    border-color: var(--coral);
    box-shadow: inset 0 -3px 0 var(--source-color, transparent), var(--shadow-keycap-selected);
  }

  .board-keycap.marked .keycap-face {
    border-color: var(--teal);
    box-shadow: var(--shadow-keycap-picked);
  }

  .board-keycap.fall-through .keycap-face,
  .board-keycap.empty .keycap-face {
    color: var(--ink-3);
    background: var(--keycap-transparent);
  }

  .board-keycap.modifier .keycap-face {
    color: var(--paper);
    background: var(--keycap-modifier);
  }

  .board-keycap.modifier .cap-legend,
  .board-keycap.modifier .cap-src,
  .board-keycap.modifier .g-sub {
    color: rgba(244, 239, 230, 0.56);
  }

  .board-keycap.accent .keycap-face {
    border-color: oklch(0.55 0.18 30);
    color: #1c0a04;
    background: var(--keycap-accent);
  }

  .board-keycap.encoder .keycap-face {
    border-radius: var(--r-pill);
  }

  .board-keycap.lighting .keycap-face {
    color: #221c12;
    background: linear-gradient(
      180deg,
      color-mix(in oklch, var(--key-lighting) 45%, #fffdf7) 0%,
      var(--key-lighting) 100%
    );
    box-shadow:
      inset 0 -4px 8px color-mix(in oklch, var(--key-lighting) 55%, transparent),
      var(--shadow-cap);
  }

  .board-keycap.lighting-override .keycap-face {
    border-color: rgba(24, 22, 20, 0.28);
  }

  .board-keycap.led-off .keycap-face {
    border-color: rgba(0, 0, 0, 0.4);
    color: rgba(242, 237, 227, 0.58);
    background: var(--led-off);
    box-shadow: var(--shadow-cap);
  }

  .board-keycap.led-off .cap-legend {
    color: rgba(242, 237, 227, 0.4);
  }

  .cap-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    min-width: 0;
    gap: 4px;
    min-height: 10px;
  }

  .cap-legend,
  .cap-src,
  .g-sub {
    font-family: var(--mono);
    line-height: 1;
    text-transform: uppercase;
  }

  .cap-legend {
    min-width: 0;
    overflow: hidden;
    color: var(--ink-3);
    font-size: 9px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cap-src {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    color: var(--source-color);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cap-glyph {
    display: flex;
    min-width: 0;
    max-height: 2.35em;
    flex: 1;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    overflow: hidden;
    font-family: var(--mono);
    text-align: center;
  }

  .g-main {
    max-width: 100%;
    overflow: hidden;
    overflow-wrap: anywhere;
    font-size: 13px;
    font-weight: 500;
    line-height: 1.05;
    word-break: break-word;
  }

  .g-sub {
    max-width: 100%;
    overflow: hidden;
    color: var(--ink-3);
    font-size: 8px;
    letter-spacing: 0.05em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .board-keycap[data-label-size="sm"] .g-main {
    font-size: 10.5px;
    line-height: 1.04;
  }

  .board-keycap[data-label-size="xs"] .keycap-face {
    padding-inline: 5px;
  }

  .board-keycap[data-label-size="xs"] .g-main {
    font-size: 8.5px;
    line-height: 1;
  }

  .board-keycap[data-label-size="xs"] .cap-src {
    display: none;
  }

  .cap-home {
    display: flex;
    justify-content: center;
    min-height: 4px;
  }

  .cap-home i {
    width: 14px;
    height: 2px;
    border-radius: 2px;
    background: currentColor;
    opacity: 0.74;
  }

  .marker-slot {
    position: absolute;
    z-index: 4;
    display: inline-grid;
    place-items: center;
    min-width: 16px;
    height: 15px;
    padding: 0 5px;
    border-radius: var(--r-pill);
    box-shadow: 0 1px 2px rgba(24, 22, 20, 0.18);
    font-family: var(--mono);
    font-size: 8px;
    font-weight: 800;
    line-height: 1;
    pointer-events: none;
  }

  .marker-slot.combo {
    top: 4px;
    right: 4px;
    border: 1px solid oklch(0.52 0.11 90 / 0.45);
    color: #332800;
    background: var(--mustard);
  }

  .marker-slot.layer {
    top: 0;
    left: 50%;
    border: 1px solid rgba(14, 80, 78, 0.42);
    color: #062826;
    background: linear-gradient(180deg, #9de2d8 0%, #57b8ae 100%);
    transform: translate(-50%, -48%);
  }

  .marker-slot.layer.chain {
    border-color: rgba(121, 43, 28, 0.52);
    color: #360f05;
    background: linear-gradient(180deg, #f7b08a 0%, #e1683d 100%);
  }
</style>
