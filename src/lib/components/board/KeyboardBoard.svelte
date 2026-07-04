<script module lang="ts">
  export interface BoardPan {
    x: number;
    y: number;
  }

  export type LightingDragMode = "select" | "add" | "toggle" | "clear";
</script>

<script lang="ts">
  import type { Snippet } from "svelte";

  import type { DeviceProfile } from "$lib/keyboard/schema";

  import {
    computeBoardUnit,
    createBoardViewModel,
    type BoardKeyViewModel,
    type BoardLens,
    type BoardSelection,
    type BoardSplitPreference,
    type BoardComboConnector,
  } from "./board-view-model";
  import Keycap from "./Keycap.svelte";

  interface Props {
    profile: DeviceProfile;
    activeLayer?: string;
    lens?: BoardLens;
    selection?: BoardSelection;
    marked?: BoardSelection;
    showFallthrough?: boolean;
    zoom?: number;
    pan?: BoardPan;
    split?: BoardSplitPreference;
    class?: string;
    comboMarker?: Snippet<[BoardKeyViewModel]>;
    layerMarker?: Snippet<[BoardKeyViewModel]>;
    onSelectKey?: (keyId: string) => void;
    onToggleKey?: (keyId: string) => void;
    onClearSelection?: () => void;
    onLightingDrag?: (keyIds: string[], mode: LightingDragMode) => void;
    onHoverKey?: (keyId: string | null) => void;
  }

  let {
    profile,
    activeLayer,
    lens = "keys",
    selection,
    marked,
    showFallthrough = true,
    zoom = $bindable(1),
    pan = $bindable({ x: 0, y: 0 }),
    split = "auto",
    class: className = "",
    comboMarker,
    layerMarker,
    onSelectKey,
    onToggleKey,
    onClearSelection,
    onLightingDrag,
    onHoverKey,
  }: Props = $props();

  let viewport: HTMLDivElement | undefined = $state();
  let viewportWidth = $state(900);
  let hoveredKeyId = $state<string | null>(null);
  let panning = $state(false);
  let panStart:
    | {
        pointerId: number;
        startX: number;
        startY: number;
        panX: number;
        panY: number;
      }
    | undefined = $state();
  let painting = $state(false);
  let paintMode = $state<LightingDragMode>("select");
  let lastPaintedKeyId = $state<string | null>(null);

  const activeLayerId = $derived(activeLayer ?? profile.layers[0]?.id ?? "");
  const model = $derived(
    createBoardViewModel({
      profile,
      activeLayer: activeLayerId,
      lens,
      selection,
      marked,
      showFallthrough,
      split,
    }),
  );
  const baseUnit = $derived(computeBoardUnit(model, viewportWidth));
  const unit = $derived(Math.round(baseUnit * zoom * 100) / 100);
  const splitLabelSpace = $derived(model.split.enabled ? 30 : 0);
  const surfaceStyle = $derived(
    [
      `--u: ${unit}px`,
      "--board-key-gap: 5px",
      `width: calc(var(--u) * ${model.bounds.width})`,
      `height: calc(var(--u) * ${model.bounds.height} + ${splitLabelSpace}px)`,
      `transform: translate(${pan.x}px, ${pan.y}px)`,
    ].join("; "),
  );
  const planeStyle = $derived(
    [
      `width: calc(var(--u) * ${model.bounds.width})`,
      `height: calc(var(--u) * ${model.bounds.height})`,
    ].join("; "),
  );
  const zoomPercent = $derived(`${Math.round(zoom * 100)}%`);

  $effect(() => {
    if (!viewport) return;

    const measure = () => {
      viewportWidth = viewport?.clientWidth ?? 900;
    };
    measure();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(measure);
      observer.observe(viewport);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  });

  function connectorActive(connector: BoardComboConnector) {
    return hoveredKeyId ? connector.keyIds.includes(hoveredKeyId) : false;
  }

  function handleSelectKey(keyId: string) {
    onSelectKey?.(keyId);
  }

  function handleToggleKey(keyId: string) {
    onToggleKey?.(keyId);
  }

  function handleKeyEnter(keyId: string) {
    hoveredKeyId = keyId;
    onHoverKey?.(keyId);
  }

  function handleKeyLeave(keyId: string) {
    if (hoveredKeyId === keyId) {
      hoveredKeyId = null;
      onHoverKey?.(null);
    }
  }

  function clampZoom(value: number) {
    return Math.min(1.8, Math.max(0.55, Math.round(value * 100) / 100));
  }

  function handleWheel(event: WheelEvent) {
    event.preventDefault();
    zoom = clampZoom(zoom * Math.exp(-event.deltaY * 0.0015));
  }

  function handlePointerDown(event: PointerEvent) {
    if (lens === "lighting" && event.button === 0) {
      handleLightingPointerDown(event);
      return;
    }

    if (event.button !== 1) return;
    event.preventDefault();
    panning = true;
    panStart = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent) {
    if (painting) {
      handleLightingPointerMove(event);
      return;
    }

    if (!panning || !panStart || event.pointerId !== panStart.pointerId) return;
    event.preventDefault();
    pan = {
      x: panStart.panX + event.clientX - panStart.startX,
      y: panStart.panY + event.clientY - panStart.startY,
    };
  }

  function handlePointerUp(event: PointerEvent) {
    if (painting) finishPainting(event);
    if (!panStart || event.pointerId !== panStart.pointerId) return;
    panning = false;
    panStart = undefined;
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
  }

  function handlePointerCancel(event: PointerEvent) {
    if (painting) finishPainting(event);
    if (panStart && event.pointerId === panStart.pointerId) {
      panning = false;
      panStart = undefined;
    }
  }

  function handleLightingPointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    event.preventDefault();
    painting = true;
    paintMode = event.metaKey || event.ctrlKey ? "toggle" : event.shiftKey ? "add" : "select";
    const keyId = keyIdAtPointer(event);
    lastPaintedKeyId = keyId;
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);

    if (keyId) {
      emitLightingHit(keyId, paintMode);
      return;
    }

    if (paintMode === "select") {
      onClearSelection?.();
      onLightingDrag?.([], "clear");
    }
  }

  function handleLightingPointerMove(event: PointerEvent) {
    if (lens !== "lighting") return;
    event.preventDefault();
    const keyId = keyIdAtPointer(event);
    if (!keyId || keyId === lastPaintedKeyId) return;

    lastPaintedKeyId = keyId;
    emitLightingHit(keyId, paintMode === "toggle" ? "toggle" : "add");
  }

  function finishPainting(event: PointerEvent) {
    painting = false;
    lastPaintedKeyId = null;
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
  }

  function emitLightingHit(keyId: string, mode: LightingDragMode) {
    if (mode === "toggle") onToggleKey?.(keyId);
    else onSelectKey?.(keyId);
    onLightingDrag?.([keyId], mode);
  }

  function keyIdAtPointer(event: PointerEvent) {
    const target =
      typeof document === "undefined"
        ? (event.target as Element | null)
        : document.elementFromPoint(event.clientX, event.clientY);
    return target?.closest?.("[data-key-id]")?.getAttribute("data-key-id") ?? null;
  }
</script>

<div class={`keyboard-board ${className}`} data-lens={lens}>
  <div
    bind:this={viewport}
    class="keyboard-board-viewport"
    class:lighting={lens === "lighting"}
    class:panning
    role="region"
    aria-label={lens === "lighting" ? "Keyboard lighting viewport" : "Keyboard board viewport"}
    title="Mouse wheel zoom; middle-drag pan"
    onwheel={handleWheel}
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerup={handlePointerUp}
    onpointercancel={handlePointerCancel}
  >
    <div class="keyboard-board-surface" style={surfaceStyle}>
      <div class="key-plane" style={planeStyle}>
        {#if model.comboConnectors.length > 0 && lens === "keys"}
          <svg
            class="combo-connectors"
            viewBox={`0 0 ${model.bounds.width} ${model.bounds.height}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {#each model.comboConnectors as connector (connector.id)}
              {@const active = connectorActive(connector)}
              <g class="combo-connector" class:combo-connector-active={active}>
                <title>{connector.title}</title>
                {#each connector.segments as segment (segment.id)}
                  <path class="combo-connector-hit" d={segment.path}></path>
                  <path class="combo-connector-line" class:active d={segment.path}></path>
                {/each}
              </g>
            {/each}
          </svg>
        {/if}

        {#if model.split.enabled && model.split.seamX !== null}
          <span
            class="split-seam"
            style={`left: calc(var(--u) * ${model.split.seamX})`}
            aria-hidden="true"
          ></span>
        {/if}

        {#each model.rows as row (row.row)}
          {#each row.keys as keyModel (keyModel.id)}
            <Keycap
              cap={keyModel}
              {lens}
              {comboMarker}
              {layerMarker}
              onSelectKey={lens === "keys" ? handleSelectKey : undefined}
              onToggleKey={lens === "keys" ? handleToggleKey : undefined}
              onKeyPointerEnter={handleKeyEnter}
              onKeyPointerLeave={handleKeyLeave}
            />
          {/each}
        {/each}
      </div>

      {#if model.split.enabled && model.split.seamX !== null}
        <div
          class="split-label"
          style={`left: calc(var(--u) * ${model.split.seamX}); top: calc(var(--u) * ${model.bounds.height} + 10px)`}
        >
          <span class="material-symbols-outlined" aria-hidden="true">cable</span>
          <span>{model.split.label}</span>
        </div>
      {/if}
    </div>
  </div>

  <button type="button" class="zoom-readout" title="Reset keyboard zoom" onclick={() => (zoom = 1)}>
    {zoomPercent}
  </button>
</div>

<style>
  .keyboard-board {
    position: relative;
    display: flex;
    min-width: 0;
    min-height: 0;
    flex: 1;
    flex-direction: column;
  }

  .keyboard-board-viewport {
    position: relative;
    display: grid;
    min-width: 0;
    min-height: 260px;
    flex: 1;
    place-items: center;
    overflow: auto;
    padding: 28px 24px;
    overscroll-behavior: contain;
    touch-action: none;
    user-select: none;
    background:
      linear-gradient(to right, oklch(0.13 0.01 60 / 0.04) 1px, transparent 1px),
      linear-gradient(to bottom, oklch(0.13 0.01 60 / 0.04) 1px, transparent 1px),
      radial-gradient(ellipse 70% 60% at 50% 35%, oklch(0.96 0.04 60 / 0.5), transparent 75%);
    background-size:
      24px 24px,
      24px 24px,
      100% 100%;
    cursor: default;
  }

  .keyboard-board-viewport.lighting {
    cursor: crosshair;
  }

  .keyboard-board-viewport.lighting :global(.board-keycap) {
    cursor: crosshair;
  }

  .keyboard-board-viewport.panning,
  .keyboard-board-viewport.panning :global(.board-keycap) {
    cursor: grabbing;
  }

  .keyboard-board-surface {
    position: relative;
    min-width: max-content;
    transition: transform 90ms var(--ease-out-soft, ease);
    will-change: transform;
  }

  .key-plane {
    position: absolute;
    top: 0;
    left: 0;
  }

  .combo-connectors {
    position: absolute;
    inset: 0;
    z-index: 3;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
  }

  .combo-connector-hit,
  .combo-connector-line {
    fill: none;
    vector-effect: non-scaling-stroke;
  }

  .combo-connector-hit {
    stroke: transparent;
    stroke-width: 14;
  }

  .combo-connector-line {
    stroke: var(--mustard);
    stroke-width: 1.25;
    stroke-dasharray: 4 5;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.34;
    mix-blend-mode: multiply;
    shape-rendering: geometricPrecision;
    transition:
      filter 120ms ease,
      opacity 120ms ease,
      stroke 120ms ease,
      stroke-width 120ms ease;
  }

  .combo-connector.combo-connector-active .combo-connector-line,
  .combo-connector-line.active {
    stroke: var(--coral);
    stroke-width: 2.35;
    opacity: 0.92;
    filter: drop-shadow(0 1px 2px color-mix(in oklch, var(--coral) 55%, transparent));
  }

  .split-seam {
    position: absolute;
    top: 0;
    bottom: 0;
    z-index: 2;
    width: 0;
    border-left: 1px dashed var(--line-2);
    pointer-events: none;
  }

  .split-label {
    position: absolute;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--ink-3);
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.12em;
    line-height: 1;
    text-transform: uppercase;
    transform: translateX(-50%);
    white-space: nowrap;
  }

  .split-label .material-symbols-outlined {
    font-size: 14px;
  }

  .zoom-readout {
    position: absolute;
    right: 12px;
    bottom: 12px;
    display: inline-grid;
    min-width: 42px;
    height: 22px;
    place-items: center;
    padding: 0 7px;
    border: 1px solid rgba(24, 22, 20, 0.18);
    border-radius: 6px;
    color: var(--ink-2);
    background: rgba(255, 252, 245, 0.78);
    box-shadow: var(--shadow-card);
    font-family: var(--mono);
    font-size: 10px;
    line-height: 1;
  }

  .zoom-readout:hover {
    border-color: rgba(24, 22, 20, 0.34);
    color: var(--ink);
    background: var(--paper);
  }

  @media (max-width: 640px) {
    .keyboard-board-viewport {
      min-height: 220px;
      padding: 18px 14px 28px;
    }
  }
</style>
