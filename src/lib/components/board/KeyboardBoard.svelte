<script module lang="ts">
  export interface BoardPan {
    x: number;
    y: number;
  }

  export type LightingDragMode = "select" | "add" | "toggle" | "clear";
</script>

<script lang="ts">
  import { SvelteFlow, type EdgeTypes, type NodeTypes } from "@xyflow/svelte";
  import type { Snippet } from "svelte";

  import { Button } from "$lib/components/ui";
  import type { DeviceProfile } from "$lib/keyboard/schema";
  import { cn } from "$lib/utils.js";

  import {
    computeBoardUnit,
    createBoardViewModel,
    type BoardKeyViewModel,
    type BoardLens,
    type BoardSelection,
    type BoardSplitPreference,
  } from "./board-view-model";
  import BoardComboEdge from "./BoardComboEdge.svelte";
  import BoardKeyNode from "./BoardKeyNode.svelte";
  import { createBoardFlowGraph, setBoardFlowRuntime } from "./board-flow";

  const boardClass = "keyboard-board relative flex min-h-0 min-w-0 flex-1 flex-col";
  const viewportClass =
    "keyboard-board-viewport relative grid min-h-[260px] min-w-0 flex-1 place-items-center overflow-hidden bg-stage px-kb-24 py-kb-28 overscroll-contain touch-none select-none [container-type:size] [background-image:radial-gradient(120%_120%_at_50%_0%,color-mix(in_oklch,var(--surface)_40%,transparent),transparent_70%)] cursor-default max-[640px]:min-h-[220px] max-[640px]:px-kb-14 max-[640px]:pt-kb-18 max-[640px]:pb-kb-28";
  const nodeTypes: NodeTypes = { "board-key": BoardKeyNode };
  const edgeTypes: EdgeTypes = { "board-combo": BoardComboEdge };
  const lockedFlowViewport = { x: 0, y: 0, zoom: 1 };
  const flowProOptions = { hideAttribution: true };

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
  // Keep Svelte Flow's coordinate space deterministic across SSR and hydration.
  // Responsive fitting and user zoom happen on the surface transform instead of
  // rebuilding every node after the browser reports its viewport dimensions.
  const unit = $derived(Math.round(computeBoardUnit(model, 900, 500) * 100) / 100);
  const compactKeycaps = $derived(unit < 42);
  const splitLabelSpace = $derived(model.split.enabled ? 30 : 0);
  const planeWidth = $derived(unit * model.bounds.width);
  const planeHeight = $derived(unit * model.bounds.height);
  const surfaceHeight = $derived(planeHeight + splitLabelSpace);
  const boardFit = $derived(
    `calc(min(1, calc((100cqw - 80px) / ${planeWidth}px), calc((100cqh - 72px) / ${surfaceHeight}px)) * ${zoom})`,
  );
  const surfaceStyle = $derived(
    [
      `--u: ${unit}px`,
      "--board-key-gap: 5px",
      `width: ${planeWidth}px`,
      `height: ${surfaceHeight}px`,
      `translate: calc(-50% + ${pan.x}px) calc(-50% + ${pan.y - (model.split.enabled ? 1 : 0)}px)`,
      `scale: ${boardFit}`,
    ].join("; "),
  );
  const planeStyle = $derived(
    [
      `width: calc(var(--u) * ${model.bounds.width})`,
      `height: calc(var(--u) * ${model.bounds.height})`,
    ].join("; "),
  );
  const flowGraph = $derived(
    createBoardFlowGraph({
      model,
      unit,
      hoveredKeyId,
    }),
  );
  const zoomPercent = $derived(`${Math.round(zoom * 100)}%`);

  setBoardFlowRuntime({
    get compact() {
      return compactKeycaps;
    },
    get lens() {
      return lens;
    },
    get comboMarker() {
      return comboMarker;
    },
    get layerMarker() {
      return layerMarker;
    },
    get onSelectKey() {
      return lens === "keys" ? handleSelectKey : undefined;
    },
    get onToggleKey() {
      return lens === "keys" ? handleToggleKey : undefined;
    },
    onKeyPointerEnter: handleKeyEnter,
    onKeyPointerLeave: handleKeyLeave,
  });

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
      class="keyboard-board-surface absolute top-1/2 left-1/2 min-w-max origin-center"
      style={surfaceStyle}
    >
      <div class="key-plane absolute top-0 left-0" style={planeStyle}>
        <SvelteFlow
          id={`keyboard-${model.profileId}-${lens}`}
          class="keyboard-flow absolute inset-0"
          width={planeWidth}
          height={planeHeight}
          nodes={flowGraph.nodes}
          edges={flowGraph.edges}
          {nodeTypes}
          {edgeTypes}
          viewport={lockedFlowViewport}
          minZoom={1}
          maxZoom={1}
          nodesDraggable={false}
          nodesConnectable={false}
          nodesFocusable={false}
          edgesFocusable={false}
          elementsSelectable={false}
          elevateNodesOnSelect={false}
          elevateEdgesOnSelect={false}
          panOnDrag={false}
          panOnScroll={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          disableKeyboardA11y
          proOptions={flowProOptions}
        />

        {#if model.split.enabled && model.split.seamX !== null}
          <span
            class="split-seam pointer-events-none absolute top-0 bottom-0 z-[2] w-0 border-l border-dashed border-line-2"
            style={`left: calc(var(--u) * ${model.split.seamX})`}
            aria-hidden="true"
          ></span>
        {/if}

      </div>

      {#if model.split.enabled && model.split.seamX !== null}
        <div
          class="split-label absolute inline-flex -translate-x-1/2 items-center gap-kb-6 whitespace-nowrap font-mono text-[10px] leading-none tracking-[0.12em] text-ink-3 uppercase"
          style={`left: calc(var(--u) * ${model.split.seamX}); top: calc(var(--u) * ${model.bounds.height} + 10px)`}
        >
          <span class="material-symbols-outlined text-[14px]" aria-hidden="true">cable</span>
          <span>{model.split.label}</span>
        </div>
      {/if}
    </div>
  </div>

  <Button
    type="button"
    variant="outline"
    size="xs"
    class="zoom-readout absolute right-kb-12 bottom-kb-12 h-kb-22 min-w-[42px] rounded-[6px] border-line-2 bg-[color-mix(in_oklch,var(--surface)_82%,transparent)] px-[7px] py-0 font-mono text-kb-10 leading-none text-ink-2 shadow-card hover:border-[color-mix(in_oklch,var(--ink)_34%,transparent)] hover:bg-surface hover:text-ink"
    title="Reset keyboard zoom"
    onclick={() => (zoom = 1)}
  >
    {zoomPercent}
  </Button>
</div>
