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
  import { cn } from "$lib/utils.js";

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

  const boardClass = "keyboard-board relative flex min-h-0 min-w-0 flex-1 flex-col";
  const viewportClass =
    "keyboard-board-viewport relative grid min-h-[260px] min-w-0 flex-1 place-items-center overflow-auto px-kb-24 py-kb-28 overscroll-contain touch-none select-none bg-[linear-gradient(to_right,oklch(0.13_0.01_60/0.04)_1px,transparent_1px),linear-gradient(to_bottom,oklch(0.13_0.01_60/0.04)_1px,transparent_1px),radial-gradient(ellipse_70%_60%_at_50%_35%,oklch(0.96_0.04_60/0.5),transparent_75%)] [background-size:24px_24px,24px_24px,100%_100%] cursor-default max-[640px]:min-h-[220px] max-[640px]:px-[14px] max-[640px]:pt-[18px] max-[640px]:pb-[28px]";
  const connectorLineClass =
    "combo-connector-line fill-none stroke-mustard opacity-[0.34] mix-blend-multiply transition-[filter,opacity,stroke,stroke-width] duration-[120ms] ease-[ease] [shape-rendering:geometricPrecision] [stroke-dasharray:4_5] [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.25] [vector-effect:non-scaling-stroke]";

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
    targetOs?: "mac" | "windows" | "linux";
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
    targetOs,
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
      targetOs,
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

<div class={cn(boardClass, className)} data-lens={lens}>
  <div
    bind:this={viewport}
    class={cn(
      viewportClass,
      lens === "lighting" && "lighting cursor-crosshair [&_.board-keycap]:cursor-crosshair",
      panning && "panning cursor-grabbing [&_.board-keycap]:cursor-grabbing",
    )}
    role="region"
    aria-label={lens === "lighting" ? "Keyboard lighting viewport" : "Keyboard board viewport"}
    title="Mouse wheel zoom; middle-drag pan"
    onwheel={handleWheel}
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerup={handlePointerUp}
    onpointercancel={handlePointerCancel}
  >
    <div
      class="keyboard-board-surface relative min-w-max transition-transform duration-[90ms] ease-[var(--ease-out-soft)] will-change-transform"
      style={surfaceStyle}
    >
      <div class="key-plane absolute top-0 left-0" style={planeStyle}>
        {#if model.comboConnectors.length > 0 && lens === "keys"}
          <svg
            class="combo-connectors pointer-events-none absolute inset-0 z-[3] h-full w-full overflow-visible"
            viewBox={`0 0 ${model.bounds.width} ${model.bounds.height}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {#each model.comboConnectors as connector (connector.id)}
              {@const active = connectorActive(connector)}
              <g class={cn("combo-connector", active && "combo-connector-active")}>
                <title>{connector.title}</title>
                {#each connector.segments as segment (segment.id)}
                  <path
                    class="combo-connector-hit fill-none stroke-transparent [stroke-width:14] [vector-effect:non-scaling-stroke]"
                    d={segment.path}
                  ></path>
                  <path
                    class={cn(
                      connectorLineClass,
                      active &&
                        "active stroke-coral opacity-[0.92] [filter:drop-shadow(0_1px_2px_color-mix(in_oklch,var(--coral)_55%,transparent))] [stroke-width:2.35]",
                    )}
                    d={segment.path}
                  ></path>
                {/each}
              </g>
            {/each}
          </svg>
        {/if}

        {#if model.split.enabled && model.split.seamX !== null}
          <span
            class="split-seam pointer-events-none absolute top-0 bottom-0 z-[2] w-0 border-l border-dashed border-line-2"
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
          class="split-label absolute inline-flex -translate-x-1/2 items-center gap-kb-6 whitespace-nowrap font-mono text-kb-10 leading-none tracking-[0.12em] text-ink-3 uppercase"
          style={`left: calc(var(--u) * ${model.split.seamX}); top: calc(var(--u) * ${model.bounds.height} + 10px)`}
        >
          <span class="material-symbols-outlined text-[14px]" aria-hidden="true">cable</span>
          <span>{model.split.label}</span>
        </div>
      {/if}
    </div>
  </div>

  <button
    type="button"
    class="zoom-readout absolute right-kb-12 bottom-kb-12 inline-grid h-kb-22 min-w-[42px] place-items-center rounded-[6px] border border-[rgba(24,22,20,0.18)] bg-[rgba(255,252,245,0.78)] px-[7px] py-0 font-mono text-kb-10 leading-none text-ink-2 shadow-card hover:border-[rgba(24,22,20,0.34)] hover:bg-paper hover:text-ink"
    title="Reset keyboard zoom"
    onclick={() => (zoom = 1)}
  >
    {zoomPercent}
  </button>
</div>
