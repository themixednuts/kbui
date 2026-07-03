<script lang="ts">
  import { Plus, Trash2 } from "@lucide/svelte";
  import type { Combo, DeviceProfile } from "$lib/keyboard/schema";
  import { keyById } from "$lib/keyboard/schema";
  import {
    comboChordLabels,
    comboKeyOptionLabel,
    comboLayerScopeLabel,
  } from "$lib/keyboard/combo-visibility";
  import type { LogicTab } from "$lib/workbench/url-search";
  import { Button, Chip } from "$lib/components/ui";
  import * as Card from "$lib/components/ui/card/index.js";
  import SegmentedNav from "$lib/components/ui/SegmentedNav.svelte";
  import type { SegmentItem } from "$lib/components/ui/types";

  type Props = {
    device: DeviceProfile;
    tab: LogicTab;
    tabItems: SegmentItem<LogicTab>[];
    displayCode: (code: string) => string;
    comboDefinitionsNotice?: string;
    onAdd: () => void;
    onRemoveMacro: (id: string) => void;
    onUpdateCombo: (id: string, patch: Partial<Pick<Combo, "name" | "keys" | "binding" | "layerIds">>) => void;
    onRemoveCombo: (id: string) => void;
  };

  let {
    device,
    tab,
    tabItems,
    displayCode,
    comboDefinitionsNotice,
    onAdd,
    onRemoveMacro,
    onUpdateCombo,
    onRemoveCombo,
  }: Props = $props();

  let expandedComboId = $state<string | undefined>();

  const sectionLabel = $derived(
    tab === "macros" ? "Macros" : tab === "combos" ? "Combos" : "Tap dance",
  );
  const addLabel = $derived(
    tab === "macros" ? "New macro" : tab === "combos" ? "New combo" : "New tap dance",
  );

  function inputValue(event: Event) {
    return (event.currentTarget as HTMLInputElement).value;
  }

  function comboLayerIds(combo: Combo) {
    return combo.layerIds?.length ? combo.layerIds : device.layers.map((layer) => layer.id);
  }

  function comboKeyLabel(combo: Combo, keyId: string) {
    return comboKeyOptionLabel(device, combo, keyId, displayCode);
  }

  function comboUsesLayer(combo: Combo, layerId: string) {
    return combo.layerIds?.includes(layerId) ?? false;
  }

  function setComboLayerScope(combo: Combo, layerIds: string[] | undefined) {
    onUpdateCombo(combo.id, { layerIds });
  }

  function toggleComboLayer(combo: Combo, layerId: string) {
    if (!combo.layerIds?.length) {
      setComboLayerScope(combo, [layerId]);
      return;
    }

    const current = comboLayerIds(combo);
    const next = current.includes(layerId)
      ? current.filter((candidate) => candidate !== layerId)
      : [...current, layerId];
    setComboLayerScope(combo, next.length === device.layers.length || next.length === 0 ? undefined : next);
  }

  function toggleComboKey(combo: Combo, keyId: string) {
    if (combo.keys.includes(keyId)) {
      if (combo.keys.length <= 2) return;
      onUpdateCombo(combo.id, { keys: combo.keys.filter((candidate) => candidate !== keyId) });
      return;
    }

    onUpdateCombo(combo.id, { keys: [...combo.keys, keyId] });
  }
</script>

<section class="logic-builder view-shell">
  <header class="view-intro">
    <span class="eyebrow">Logic builder</span>
    <h2>Reusable behaviors</h2>
    <p>
      Build <strong>macros</strong>, <strong>combos</strong>, and <strong>tap dance</strong>
      definitions here as standalone logic. They live in your workspace until you bind them
      from the Keymap view.
    </p>
  </header>

  <Card.Root>
    <Card.Header>
      <Card.Title>{sectionLabel}</Card.Title>
      <SegmentedNav items={tabItems} value={tab} ariaLabel="Logic builder sections" />
      <div class="spacer"></div>
      <Button variant="coral" size="sm" onclick={onAdd}>
        <Plus size={14} />
        {addLabel}
      </Button>
    </Card.Header>
    <Card.Content>
      {#if tab === "macros"}
        {#if device.macros.length === 0}
          <p class="builder-empty">No macros yet. Create one to define a reusable key sequence.</p>
        {:else}
          <div class="entry-list">
            {#each device.macros as macro (macro.id)}
              <article class="entry-card">
                <div>
                  <div class="row">
                    <strong class="entry-name">{macro.name}</strong>
                    <Chip>{macro.trigger}</Chip>
                  </div>
                  <div class="seq">
                    {#each macro.sequence as step, index (`${macro.id}-${index}`)}
                      <span class="seq-key">{displayCode(step)}</span>
                      {#if index < macro.sequence.length - 1}<span class="seq-arrow">-></span>{/if}
                    {/each}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onclick={() => onRemoveMacro(macro.id)}>
                  <Trash2 size={14} />
                  Remove
                </Button>
              </article>
            {/each}
          </div>
        {/if}
      {:else if tab === "combos"}
        {#if device.combos.length === 0}
          {#if comboDefinitionsNotice}
            <div class="builder-empty builder-empty-notice" role="status">
              <strong>Combo definitions are not loaded.</strong>
              <span>{comboDefinitionsNotice}</span>
            </div>
          {:else}
            <p class="builder-empty">No combos yet. Define a chord that emits a keycode.</p>
          {/if}
        {:else}
          <div class="entry-list">
            {#each device.combos as combo (combo.id)}
              <article class="entry-card">
                <div>
                  <div class="row">
                    <strong class="entry-name">{combo.name}</strong>
                    <Chip>combo</Chip>
                    <Chip>{comboLayerScopeLabel(device, combo)}</Chip>
                  </div>
                  <div class="seq">
                    {#each comboChordLabels(device, combo, displayCode) as keyLabel, index (`${combo.id}-${index}`)}
                      <span class="seq-key">{keyLabel}</span>
                      {#if index < combo.keys.length - 1}<span class="seq-arrow">+</span>{/if}
                    {/each}
                    <span class="seq-arrow">-></span>
                    <span class="seq-key added-key">{displayCode(combo.binding)}</span>
                  </div>
                </div>
                <div class="entry-actions">
                  <Button
                    variant="ghost"
                    size="sm"
                    onclick={() => (expandedComboId = expandedComboId === combo.id ? undefined : combo.id)}
                    aria-expanded={expandedComboId === combo.id}
                  >
                    {expandedComboId === combo.id ? "Done" : "Edit"}
                  </Button>
                  {#if expandedComboId === combo.id}
                    <Button variant="ghost" size="sm" onclick={() => onRemoveCombo(combo.id)}>
                      <Trash2 size={14} />
                      Remove
                    </Button>
                  {/if}
                </div>
                {#if expandedComboId === combo.id}
                  <div class="combo-editor">
                    <label>
                      <span class="field-label">Name</span>
                      <input
                        class="logic-input"
                        value={combo.name}
                        oninput={(event: Event) => onUpdateCombo(combo.id, { name: inputValue(event) })}
                      />
                    </label>
                    <label>
                      <span class="field-label">Output</span>
                      <input
                        class="logic-input mono"
                        value={combo.binding}
                        spellcheck="false"
                        oninput={(event: Event) =>
                          onUpdateCombo(combo.id, { binding: inputValue(event) })}
                      />
                    </label>

                    <div class="combo-editor-block">
                      <div class="combo-editor-head">
                        <span class="field-label">Chord</span>
                        <span>{combo.keys.length} keys · {comboLayerScopeLabel(device, combo)}</span>
                      </div>
                      <div class="combo-key-grid">
                        {#each device.keys as key (key.id)}
                          {@const keyLabel = comboKeyLabel(combo, key.id)}
                          <button
                            type="button"
                            class:selected={combo.keys.includes(key.id)}
                            aria-pressed={combo.keys.includes(key.id)}
                            title={`${keyLabel.primary} · ${keyLabel.detail}`}
                            aria-label={`${keyLabel.primary}, ${keyLabel.detail}`}
                            onclick={() => toggleComboKey(combo, key.id)}
                          >
                            <span>{keyLabel.primary}</span>
                            <small>{keyLabel.detail}</small>
                          </button>
                        {/each}
                      </div>
                    </div>

                    <div class="combo-editor-block">
                      <div class="combo-editor-head">
                        <span class="field-label">Layers</span>
                        <span>{combo.layerIds?.length ? `${combo.layerIds.length} selected` : "all layers"}</span>
                      </div>
                      <div class="combo-layer-row">
                        <button
                          type="button"
                          class:selected={!combo.layerIds?.length}
                          aria-pressed={!combo.layerIds?.length}
                          onclick={() => setComboLayerScope(combo, undefined)}
                        >
                          All
                        </button>
                        {#each device.layers as layer (layer.id)}
                          <button
                            type="button"
                            class:selected={comboUsesLayer(combo, layer.id)}
                            aria-pressed={comboUsesLayer(combo, layer.id)}
                            onclick={() => toggleComboLayer(combo, layer.id)}
                          >
                            {layer.name}
                          </button>
                        {/each}
                      </div>
                    </div>
                  </div>
                {/if}
              </article>
            {/each}
          </div>
        {/if}
      {:else if device.tapDances.length === 0}
        <p class="builder-empty">No tap dances yet. Map tap, hold, and double-tap actions for a key.</p>
      {:else}
        <div class="entry-list">
          {#each device.tapDances as dance (dance.id)}
            <article class="entry-card">
              <div>
                <div class="row">
                  <strong class="entry-name">{keyById(device, dance.keyId)?.label ?? dance.keyId}</strong>
                  <Chip>tap dance</Chip>
                </div>
                <div class="tap-grid">
                  <div><span class="field-label">Tap</span><span class="seq-key">{displayCode(dance.tap)}</span></div>
                  <div><span class="field-label">Hold</span><span class="seq-key">{displayCode(dance.hold)}</span></div>
                  <div><span class="field-label">Double</span><span class="seq-key">{displayCode(dance.doubleTap)}</span></div>
                </div>
              </div>
              <Button variant="ghost" size="sm">Edit</Button>
            </article>
          {/each}
        </div>
      {/if}
    </Card.Content>
  </Card.Root>
</section>

<style>
  .logic-builder {
    display: flex;
    flex-direction: column;
    gap: 18px;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    padding: 24px;
    max-width: 960px;
  }

  .logic-builder :global([data-slot="card"]) {
    flex: 1 1 auto;
    min-height: 0;
  }

  .logic-builder :global([data-slot="card-content"]) {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
  }

  .builder-empty {
    margin: 0;
    color: var(--ink-3);
    font-size: 14px;
    line-height: 1.5;
  }

  .builder-empty-notice {
    display: grid;
    gap: 4px;
    padding: 12px;
    border: 1px solid oklch(0.7 0.13 90 / 0.4);
    border-radius: 8px;
    color: var(--ink-2);
    background: oklch(0.95 0.08 90 / 0.58);
  }

  .builder-empty-notice strong {
    color: var(--ink);
    font-size: 13px;
  }

  .entry-actions {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    justify-content: flex-end;
  }

  .combo-editor {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    min-width: 0;
    padding-top: 4px;
  }

  .combo-editor label,
  .combo-editor-block {
    display: grid;
    gap: 6px;
    min-width: 0;
  }

  .combo-editor-block {
    grid-column: 1 / -1;
  }

  .combo-editor-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    color: var(--ink-3);
    font-size: 11px;
  }

  .logic-input {
    width: 100%;
    min-width: 0;
    height: 32px;
    padding: 0 9px;
    border: 1px solid var(--line-2);
    border-radius: 6px;
    color: var(--ink);
    background: var(--surface);
    font: inherit;
    font-size: 13px;
  }

  .logic-input.mono {
    font-family: var(--mono);
  }

  .combo-key-grid,
  .combo-layer-row {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    min-width: 0;
  }

  .combo-key-grid button,
  .combo-layer-row button {
    display: inline-grid;
    place-items: center;
    min-height: 26px;
    padding: 4px 8px;
    border: 1px solid var(--line-2);
    border-radius: 6px;
    color: var(--ink-2);
    background: var(--surface);
    font-family: var(--mono);
    font-size: 10px;
    cursor: pointer;
  }

  .combo-key-grid button {
    min-width: 46px;
    min-height: 38px;
    align-content: center;
    gap: 2px;
  }

  .combo-key-grid button span,
  .combo-key-grid button small {
    max-width: 74px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .combo-key-grid button span {
    color: var(--ink);
    font-size: 12px;
    font-weight: 700;
  }

  .combo-key-grid button small {
    color: var(--ink-3);
    font-size: 8px;
    font-weight: 500;
  }

  .combo-key-grid button.selected,
  .combo-layer-row button.selected {
    border-color: rgba(15, 147, 140, 0.45);
    color: #062826;
    background: #9de2d8;
  }

  @media (max-width: 720px) {
    .combo-editor {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
