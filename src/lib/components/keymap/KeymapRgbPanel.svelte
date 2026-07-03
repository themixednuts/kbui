<script lang="ts">
  import type { DeviceProfile, KeyLighting } from "$lib/keyboard/schema";
  import { Button, SliderField, type SegmentItem } from "$lib/components/ui";
  import SegmentedNav from "$lib/components/ui/SegmentedNav.svelte";
  import * as Tabs from "$lib/components/ui/tabs/index.js";

  type GlobalLightingKey = Exclude<keyof DeviceProfile["lighting"], "keys">;
  type RgbPanelSection = "board" | "paint" | "layers";

  type Props = {
    device: DeviceProfile;
    selectionCount: number;
    brush: KeyLighting;
    lightingModeItems: SegmentItem<DeviceProfile["lighting"]["mode"]>[];
    updateLighting: <T extends GlobalLightingKey>(key: T, value: DeviceProfile["lighting"][T]) => void;
    onBrushChange: (patch: Partial<KeyLighting>) => void;
    onSelectAll: () => void;
    onClearSelection: () => void;
    onApplyBoardToSelection: () => void;
    onClearOverridesOnSelection: () => void;
    resolveLayerColor: (value: string) => string;
    setLayerColor: (index: number, hex: string) => void;
    shortHexFromValue: (hex: string) => string;
  };

  let {
    device,
    selectionCount,
    brush,
    lightingModeItems,
    updateLighting,
    onBrushChange,
    onSelectAll,
    onClearSelection,
    onApplyBoardToSelection,
    onClearOverridesOnSelection,
    resolveLayerColor,
    setLayerColor,
    shortHexFromValue,
  }: Props = $props();

  let section = $state<RgbPanelSection>("paint");
</script>

<Tabs.Root bind:value={section} class="rgb-inspector-tabs">
  <Tabs.List class="rgb-inspector-tabs-list">
    <Tabs.Trigger value="paint" class="rgb-inspector-tab">
      Paint
      {#if selectionCount > 0}
        <span class="rgb-tab-badge">{selectionCount}</span>
      {/if}
    </Tabs.Trigger>
    <Tabs.Trigger value="board" class="rgb-inspector-tab">Board</Tabs.Trigger>
    <Tabs.Trigger value="layers" class="rgb-inspector-tab">Layers</Tabs.Trigger>
  </Tabs.List>

  <Tabs.Content value="board" class="rgb-inspector-tab-panel">
    <section class="rgb-section">
      <div class="rgb-section-head">
        <span class="muted mono">{device.lighting.mode} · {device.lighting.brightness}%</span>
      </div>
      <div
        class="rgb-preview compact-rgb-preview"
        style={`--h: ${device.lighting.hue}; --sat: ${device.lighting.saturation}%`}
      ></div>
      <SegmentedNav
        items={lightingModeItems}
        value={device.lighting.mode}
        onselect={(next) => updateLighting("mode", next)}
        ariaLabel="RGB mode"
        class="rgb-mode-nav"
      />
      <div class="rgb-slider-grid">
        <SliderField
          compact
          label="Hue"
          value={device.lighting.hue}
          min={0}
          max={360}
          onValueChange={(next) => updateLighting("hue", next)}
        />
        <SliderField
          compact
          label="Sat"
          value={device.lighting.saturation}
          min={0}
          max={100}
          onValueChange={(next) => updateLighting("saturation", next)}
        />
        <SliderField
          compact
          label="Bright"
          value={device.lighting.brightness}
          min={0}
          max={100}
          onValueChange={(next) => updateLighting("brightness", next)}
        />
        <SliderField
          compact
          label="Speed"
          value={device.lighting.speed}
          min={0}
          max={100}
          onValueChange={(next) => updateLighting("speed", next)}
        />
      </div>
    </section>
  </Tabs.Content>

  <Tabs.Content value="paint" class="rgb-inspector-tab-panel">
    <section class="rgb-section">
      <div class="rgb-section-head">
        <span class="muted mono">{selectionCount} key{selectionCount === 1 ? "" : "s"}</span>
        <div class="rgb-selection-actions inline-actions">
          <Button variant="ghost" size="sm" type="button" onclick={onSelectAll}>All</Button>
          <Button variant="ghost" size="sm" type="button" onclick={onClearSelection} disabled={selectionCount === 0}>
            Clear
          </Button>
        </div>
      </div>
      <div
        class="rgb-preview compact-rgb-preview"
        style={`--h: ${brush.hue}; --sat: ${brush.saturation}%`}
      ></div>
      <div class="rgb-slider-grid">
        <SliderField
          compact
          label="Hue"
          value={brush.hue}
          min={0}
          max={360}
          disabled={selectionCount === 0}
          onValueChange={(next) => onBrushChange({ hue: next })}
        />
        <SliderField
          compact
          label="Sat"
          value={brush.saturation}
          min={0}
          max={100}
          disabled={selectionCount === 0}
          onValueChange={(next) => onBrushChange({ saturation: next })}
        />
        <SliderField
          compact
          label="Bright"
          value={brush.brightness}
          min={0}
          max={100}
          disabled={selectionCount === 0}
          onValueChange={(next) => onBrushChange({ brightness: next })}
        />
      </div>
      <div class="rgb-selection-actions">
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onclick={onApplyBoardToSelection}
          disabled={selectionCount === 0}
        >
          Copy board
        </Button>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onclick={onClearOverridesOnSelection}
          disabled={selectionCount === 0}
        >
          Reset keys
        </Button>
      </div>
    </section>
  </Tabs.Content>

  <Tabs.Content value="layers" class="rgb-inspector-tab-panel">
    <section class="rgb-section">
      <div class="layer-hues compact-layer-hues">
        {#each device.layers as layer, index (layer.id)}
          <label class="row hue-row">
            <span class="swatch hue-swatch" style={`background: ${resolveLayerColor(layer.color)}`}></span>
            <input
              type="color"
              aria-label={`Color for ${layer.name} layer`}
              class="hue-color-input"
              value={resolveLayerColor(layer.color)}
              oninput={(event) => setLayerColor(index, event.currentTarget.value)}
            />
            <span class="mono">{layer.name.toUpperCase()}</span>
            <span class="muted mono">{shortHexFromValue(resolveLayerColor(layer.color))}</span>
          </label>
        {/each}
      </div>
    </section>
  </Tabs.Content>
</Tabs.Root>
