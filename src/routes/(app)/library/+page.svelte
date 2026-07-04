<script lang="ts">
  import { goto } from "$app/navigation";
  import { Copy, Keyboard, Plus, Trash2 } from "@lucide/svelte";

  import { getShellContext } from "$lib/app/shell-store.svelte";
  import { displayCode } from "$lib/app/editor-store.svelte";
  import { getWorkbenchContext } from "$lib/app/workbench-store.svelte";
  import { Button, Chip, SegmentedNav } from "$lib/components/ui";
  import * as Card from "$lib/components/ui/card/index.js";
  import type { SegmentItem } from "$lib/components/ui/types";
  import {
    comboChordLabels,
    comboKeyOptionLabel,
    comboLayerScopeLabel,
  } from "$lib/keyboard/combo-visibility";
  import { macroBindingCode, tapDanceBindingCode } from "$lib/keyboard/logic-bindings";
  import { keyById, type Combo, type Macro, type TapDance } from "$lib/keyboard/schema";

  type LibraryTab = "macros" | "combos" | "tapDance";

  const shell = getShellContext();
  const workbench = getWorkbenchContext();

  let tab = $state<LibraryTab>("macros");
  let selectedIds = $state<Record<LibraryTab, string>>({
    macros: workbench.profile.macros[0]?.id ?? "",
    combos: workbench.profile.combos[0]?.id ?? "",
    tapDance: workbench.profile.tapDances[0]?.id ?? "",
  });

  const tabItems: SegmentItem<LibraryTab>[] = [
    { value: "macros", label: "Macros", title: "Macros" },
    { value: "combos", label: "Combos", title: "Combos" },
    { value: "tapDance", label: "Tap Dance", title: "Tap dances" },
  ];

  const selectedMacro = $derived(
    workbench.profile.macros.find((macro) => macro.id === selectedIds.macros),
  );
  const selectedCombo = $derived(
    workbench.profile.combos.find((combo) => combo.id === selectedIds.combos),
  );
  const selectedTapDance = $derived(
    workbench.profile.tapDances.find((dance) => dance.id === selectedIds.tapDance),
  );
  const currentCount = $derived(idsForTab(tab).length);
  const addLabel = $derived(
    tab === "macros" ? "New macro" : tab === "combos" ? "New combo" : "New tap dance",
  );

  $effect(() => {
    const ids = idsForTab(tab);
    if (selectedIds[tab] && ids.includes(selectedIds[tab])) return;
    selectedIds = {
      ...selectedIds,
      [tab]: ids[0] ?? "",
    };
  });

  function idsForTab(nextTab: LibraryTab): string[] {
    if (nextTab === "macros") return workbench.profile.macros.map((macro) => macro.id);
    if (nextTab === "combos") return workbench.profile.combos.map((combo) => combo.id);
    return workbench.profile.tapDances.map((dance) => dance.id);
  }

  function selectItem(id: string) {
    selectedIds = {
      ...selectedIds,
      [tab]: id,
    };
  }

  function inputValue(event: Event) {
    return (event.currentTarget as HTMLInputElement).value;
  }

  function selectValue(event: Event) {
    return (event.currentTarget as HTMLSelectElement).value;
  }

  function sequenceFromInput(value: string): string[] {
    return value
      .split(/(?:\s+|,|>|-)+/)
      .map((step) => step.trim())
      .filter(Boolean);
  }

  function addCurrent() {
    const item =
      tab === "macros"
        ? workbench.addMacro()
        : tab === "combos"
          ? workbench.addCombo()
          : workbench.addTapDance();
    if (item) selectItem(item.id);
  }

  function duplicateCurrent() {
    const item =
      tab === "macros" && selectedMacro
        ? workbench.duplicateMacro(selectedMacro.id)
        : tab === "combos" && selectedCombo
          ? workbench.duplicateCombo(selectedCombo.id)
          : tab === "tapDance" && selectedTapDance
            ? workbench.duplicateTapDance(selectedTapDance.id)
            : undefined;
    if (item) selectItem(item.id);
  }

  function removeCurrent() {
    const id = selectedIds[tab];
    if (!id) return;

    if (tab === "macros") workbench.removeMacro(id);
    else if (tab === "combos") workbench.removeCombo(id);
    else workbench.removeTapDance(id);
  }

  function placeMacro(macro: Macro) {
    shell.startPlacement({ kind: "macro", id: macro.id, label: macro.name });
    void goto("/editor");
  }

  function placeCombo(combo: Combo) {
    shell.startPlacement({ kind: "combo", id: combo.id, label: combo.name, picks: [] });
    void goto("/editor");
  }

  function placeTapDance(dance: TapDance) {
    const label = keyById(workbench.profile, dance.keyId)?.label ?? dance.keyId;
    shell.startPlacement({ kind: "tapDance", id: dance.id, label: `Tap dance ${label}` });
    void goto("/editor");
  }

  function comboKeyLabel(combo: Combo, keyId: string) {
    return comboKeyOptionLabel(workbench.profile, combo, keyId, displayCode);
  }

  function comboUsesLayer(combo: Combo, layerId: string) {
    return combo.layerIds?.includes(layerId) ?? false;
  }

  function setComboLayerScope(combo: Combo, layerIds: string[] | undefined) {
    workbench.updateCombo(combo.id, { layerIds });
  }

  function toggleComboLayer(combo: Combo, layerId: string) {
    if (!combo.layerIds?.length) {
      setComboLayerScope(combo, [layerId]);
      return;
    }

    const current = combo.layerIds;
    const next = current.includes(layerId)
      ? current.filter((candidate) => candidate !== layerId)
      : [...current, layerId];
    setComboLayerScope(
      combo,
      next.length === 0 || next.length === workbench.profile.layers.length ? undefined : next,
    );
  }

  function toggleComboKey(combo: Combo, keyId: string) {
    if (combo.keys.includes(keyId)) {
      if (combo.keys.length <= 2) return;
      workbench.updateCombo(combo.id, {
        keys: combo.keys.filter((candidate) => candidate !== keyId),
      });
      return;
    }

    workbench.updateCombo(combo.id, { keys: [...combo.keys, keyId] });
  }

  function countBindings(predicate: (code: string, macroId?: string) => boolean): number {
    return workbench.profile.layers.reduce(
      (total, layer) =>
        total +
        Object.values(layer.bindings).filter((binding) => predicate(binding.code, binding.macroId))
          .length,
      0,
    );
  }

  function macroPlacementCount(macro: Macro): number {
    const index = workbench.profile.macros.findIndex((candidate) => candidate.id === macro.id);
    const code = index >= 0 ? macroBindingCode(index) : "";
    return countBindings((bindingCode, macroId) => macroId === macro.id || bindingCode === code);
  }

  function tapDancePlacementCount(dance: TapDance): number {
    const index = workbench.profile.tapDances.findIndex((candidate) => candidate.id === dance.id);
    const code = index >= 0 ? tapDanceBindingCode(index) : "";
    return countBindings((bindingCode) => bindingCode === code);
  }
</script>

<section class="library-route">
  <div class="library-grid">
    <Card.Root class="library-card">
      <Card.Header class="library-card-header">
        <Card.Title>Library</Card.Title>
        <SegmentedNav
          items={tabItems}
          value={tab}
          onselect={(next) => (tab = next)}
          ariaLabel="Library sections"
        />
        <div class="header-spacer"></div>
        <Chip title={`${currentCount} entries`}>{currentCount} items</Chip>
        <Button variant="coral" size="sm" onclick={addCurrent}>
          <Plus size={14} aria-hidden="true" />
          {addLabel}
        </Button>
      </Card.Header>

      <Card.Content class="library-card-body">
        {#if tab === "macros"}
          {#if workbench.profile.macros.length === 0}
            <div class="empty-panel">
              <span class="material-symbols-outlined" aria-hidden="true">edit_note</span>
              <strong>No macros</strong>
              <Button variant="ghost" size="sm" onclick={addCurrent}>Create macro</Button>
            </div>
          {:else}
            <div class="library-list">
              {#each workbench.profile.macros as macro (macro.id)}
                <div class="library-row" class:selected={selectedIds.macros === macro.id}>
                  <button type="button" class="row-main" onclick={() => selectItem(macro.id)}>
                    <span class="row-title">
                      <strong>{macro.name}</strong>
                      <Chip>{macro.trigger || "Unassigned"}</Chip>
                    </span>
                    <span class="seq">
                      {#each macro.sequence as step, index (`${macro.id}-${index}`)}
                        <span class="seq-key">{displayCode(step)}</span>
                        {#if index < macro.sequence.length - 1}<span class="seq-arrow">-&gt;</span>{/if}
                      {/each}
                    </span>
                  </button>
                  <Button variant="ghost" size="sm" onclick={() => placeMacro(macro)}>
                    <Keyboard size={14} aria-hidden="true" />
                    Use it
                  </Button>
                </div>
              {/each}
            </div>
          {/if}
        {:else if tab === "combos"}
          {#if workbench.profile.combos.length === 0}
            <div class="empty-panel">
              <span class="material-symbols-outlined" aria-hidden="true">join_inner</span>
              <strong>No combos</strong>
              <Button variant="ghost" size="sm" onclick={addCurrent}>Create combo</Button>
            </div>
          {:else}
            <div class="library-list">
              {#each workbench.profile.combos as combo (combo.id)}
                <div class="library-row" class:selected={selectedIds.combos === combo.id}>
                  <button type="button" class="row-main" onclick={() => selectItem(combo.id)}>
                    <span class="row-title">
                      <strong>{combo.name}</strong>
                      <Chip>{comboLayerScopeLabel(workbench.profile, combo)}</Chip>
                    </span>
                    <span class="seq">
                      {#each comboChordLabels(workbench.profile, combo, displayCode, workbench.activeLayer) as keyLabel, index (`${combo.id}-${index}`)}
                        <span class="seq-key">{keyLabel}</span>
                        {#if index < combo.keys.length - 1}<span class="seq-arrow">+</span>{/if}
                      {/each}
                      <span class="seq-arrow">-&gt;</span>
                      <span class="seq-key added-key">{displayCode(combo.binding)}</span>
                    </span>
                  </button>
                  <Button variant="ghost" size="sm" onclick={() => placeCombo(combo)}>
                    <Keyboard size={14} aria-hidden="true" />
                    Use it
                  </Button>
                </div>
              {/each}
            </div>
          {/if}
        {:else if workbench.profile.tapDances.length === 0}
          <div class="empty-panel">
            <span class="material-symbols-outlined" aria-hidden="true">touch_app</span>
            <strong>No tap dances</strong>
            <Button variant="ghost" size="sm" onclick={addCurrent}>Create tap dance</Button>
          </div>
        {:else}
          <div class="library-list">
            {#each workbench.profile.tapDances as dance (dance.id)}
              {@const danceKey = keyById(workbench.profile, dance.keyId)}
              <div class="library-row" class:selected={selectedIds.tapDance === dance.id}>
                <button type="button" class="row-main" onclick={() => selectItem(dance.id)}>
                  <span class="row-title">
                    <strong>{danceKey?.label ?? dance.keyId}</strong>
                    <Chip>tap dance</Chip>
                  </span>
                  <span class="tap-grid">
                    <span><small>Tap</small><b class="seq-key">{displayCode(dance.tap)}</b></span>
                    <span><small>Hold</small><b class="seq-key">{displayCode(dance.hold)}</b></span>
                    <span><small>Double</small><b class="seq-key">{displayCode(dance.doubleTap)}</b></span>
                  </span>
                </button>
                <Button variant="ghost" size="sm" onclick={() => placeTapDance(dance)}>
                  <Keyboard size={14} aria-hidden="true" />
                  Use it
                </Button>
              </div>
            {/each}
          </div>
        {/if}
      </Card.Content>
    </Card.Root>

    <Card.Root class="use-card">
      <Card.Header>
        <Card.Title>Use it</Card.Title>
        <Chip title="Placement target">
          <span class="material-symbols-outlined chip-icon" aria-hidden="true">ads_click</span>
          Place
        </Chip>
      </Card.Header>

      <Card.Content class="use-panel">
        {#if tab === "macros" && selectedMacro}
          <div class="selected-head">
            <span class="logic-mark">M</span>
            <div>
              <strong>{selectedMacro.name}</strong>
              <small>{macroPlacementCount(selectedMacro)} placed</small>
            </div>
          </div>

          <label class="field">
            <span class="field-label">Name</span>
            <input
              class="library-input"
              value={selectedMacro.name}
              oninput={(event) => workbench.updateMacro(selectedMacro.id, { name: inputValue(event) })}
            />
          </label>

          <label class="field">
            <span class="field-label">Trigger note</span>
            <input
              class="library-input"
              value={selectedMacro.trigger}
              oninput={(event) =>
                workbench.updateMacro(selectedMacro.id, { trigger: inputValue(event) })}
            />
          </label>

          <label class="field">
            <span class="field-label">Sequence</span>
            <input
              class="library-input mono"
              spellcheck="false"
              value={selectedMacro.sequence.join(" ")}
              oninput={(event) =>
                workbench.updateMacro(selectedMacro.id, {
                  sequence: sequenceFromInput(inputValue(event)),
                })}
            />
          </label>

          <div class="seq preview">
            {#each selectedMacro.sequence as step, index (`preview-${selectedMacro.id}-${index}`)}
              <span class="seq-key">{displayCode(step)}</span>
            {/each}
          </div>

          <Button variant="coral" class="wide-action" onclick={() => placeMacro(selectedMacro)}>
            <Keyboard size={15} aria-hidden="true" />
            Place on a key
          </Button>
        {:else if tab === "combos" && selectedCombo}
          <div class="selected-head">
            <span class="logic-mark combo-mark">C</span>
            <div>
              <strong>{selectedCombo.name}</strong>
              <small>{selectedCombo.keys.length} members</small>
            </div>
          </div>

          <label class="field">
            <span class="field-label">Name</span>
            <input
              class="library-input"
              value={selectedCombo.name}
              oninput={(event) => workbench.updateCombo(selectedCombo.id, { name: inputValue(event) })}
            />
          </label>

          <label class="field">
            <span class="field-label">Output</span>
            <input
              class="library-input mono"
              spellcheck="false"
              value={selectedCombo.binding}
              oninput={(event) =>
                workbench.updateCombo(selectedCombo.id, { binding: inputValue(event) })}
            />
          </label>

          <div class="field">
            <span class="field-label">Layers</span>
            <div class="choice-row">
              <button
                type="button"
                class:selected={!selectedCombo.layerIds?.length}
                aria-pressed={!selectedCombo.layerIds?.length}
                onclick={() => setComboLayerScope(selectedCombo, undefined)}
              >
                All
              </button>
              {#each workbench.profile.layers as layer (layer.id)}
                <button
                  type="button"
                  class:selected={comboUsesLayer(selectedCombo, layer.id)}
                  aria-pressed={comboUsesLayer(selectedCombo, layer.id)}
                  onclick={() => toggleComboLayer(selectedCombo, layer.id)}
                >
                  {layer.name}
                </button>
              {/each}
            </div>
          </div>

          <div class="field">
            <span class="field-label">Members</span>
            <div class="combo-key-grid">
              {#each workbench.profile.keys as key (key.id)}
                {@const keyLabel = comboKeyLabel(selectedCombo, key.id)}
                <button
                  type="button"
                  class:selected={selectedCombo.keys.includes(key.id)}
                  aria-pressed={selectedCombo.keys.includes(key.id)}
                  title={`${keyLabel.primary} - ${keyLabel.detail}`}
                  onclick={() => toggleComboKey(selectedCombo, key.id)}
                >
                  <span>{keyLabel.primary}</span>
                  <small>{keyLabel.detail}</small>
                </button>
              {/each}
            </div>
          </div>

          <Button variant="coral" class="wide-action" onclick={() => placeCombo(selectedCombo)}>
            <Keyboard size={15} aria-hidden="true" />
            Pick keys on board
          </Button>
        {:else if tab === "tapDance" && selectedTapDance}
          {@const danceKey = keyById(workbench.profile, selectedTapDance.keyId)}
          <div class="selected-head">
            <span class="logic-mark dance-mark">T</span>
            <div>
              <strong>{danceKey?.label ?? selectedTapDance.keyId}</strong>
              <small>{tapDancePlacementCount(selectedTapDance)} placed</small>
            </div>
          </div>

          <label class="field">
            <span class="field-label">Source key</span>
            <select
              class="library-input"
              value={selectedTapDance.keyId}
              onchange={(event) =>
                workbench.updateTapDance(selectedTapDance.id, { keyId: selectValue(event) })}
            >
              {#each workbench.profile.keys as key (key.id)}
                <option value={key.id}>{key.label}</option>
              {/each}
            </select>
          </label>

          <label class="field">
            <span class="field-label">Tap</span>
            <input
              class="library-input mono"
              spellcheck="false"
              value={selectedTapDance.tap}
              oninput={(event) =>
                workbench.updateTapDance(selectedTapDance.id, { tap: inputValue(event) })}
            />
          </label>

          <label class="field">
            <span class="field-label">Hold</span>
            <input
              class="library-input mono"
              spellcheck="false"
              value={selectedTapDance.hold}
              oninput={(event) =>
                workbench.updateTapDance(selectedTapDance.id, { hold: inputValue(event) })}
            />
          </label>

          <label class="field">
            <span class="field-label">Double tap</span>
            <input
              class="library-input mono"
              spellcheck="false"
              value={selectedTapDance.doubleTap}
              oninput={(event) =>
                workbench.updateTapDance(selectedTapDance.id, { doubleTap: inputValue(event) })}
            />
          </label>

          <Button variant="coral" class="wide-action" onclick={() => placeTapDance(selectedTapDance)}>
            <Keyboard size={15} aria-hidden="true" />
            Place on a key
          </Button>
        {:else}
          <div class="empty-panel compact">
            <span class="material-symbols-outlined" aria-hidden="true">inventory_2</span>
            <strong>No selection</strong>
          </div>
        {/if}

        {#if currentCount > 0}
          <div class="side-actions">
            <Button variant="ghost" size="sm" onclick={duplicateCurrent}>
              <Copy size={14} aria-hidden="true" />
              Duplicate
            </Button>
            <Button variant="ghost" size="sm" onclick={removeCurrent}>
              <Trash2 size={14} aria-hidden="true" />
              Delete
            </Button>
          </div>
        {/if}
      </Card.Content>
    </Card.Root>
  </div>
</section>

<style>
  .library-route {
    min-height: calc(100vh - 58px);
    padding: 22px;
    background:
      radial-gradient(ellipse 82% 52% at 78% 0%, color-mix(in oklch, var(--teal) 7%, transparent), transparent 66%),
      var(--paper);
  }

  .library-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(300px, 340px);
    gap: 16px;
    align-items: start;
    min-height: calc(100vh - 102px);
  }

  :global(.library-card),
  :global(.use-card) {
    min-width: 0;
    overflow: hidden;
  }

  :global(.library-card) {
    min-height: min(650px, calc(100vh - 102px));
  }

  :global(.library-card-header) {
    gap: 10px;
  }

  .header-spacer {
    flex: 1;
    min-width: 10px;
  }

  :global(.library-card-body) {
    padding: 10px;
  }

  .library-list {
    display: grid;
    gap: 8px;
  }

  .library-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    min-width: 0;
    padding: 10px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: var(--paper-2);
    transition:
      border-color var(--dur-fast) var(--ease-out-soft),
      background var(--dur-fast) var(--ease-out-soft),
      transform var(--dur-fast) var(--ease-out-soft);
  }

  .library-row:hover {
    border-color: var(--line-2);
    transform: translateY(-1px);
  }

  .library-row.selected {
    border-color: color-mix(in oklch, var(--coral) 54%, var(--line-2));
    background: color-mix(in oklch, var(--coral) 9%, var(--paper-2));
  }

  .row-main {
    display: grid;
    gap: 6px;
    min-width: 0;
    padding: 0;
    text-align: left;
  }

  .row-title {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .row-title strong,
  .selected-head strong {
    overflow: hidden;
    font-family: var(--mono);
    font-size: 13px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .seq {
    margin-top: 0;
  }

  .preview {
    padding: 8px 0 2px;
  }

  .tap-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin-top: 0;
  }

  .tap-grid span {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  .tap-grid small {
    color: var(--ink-3);
    font-family: var(--mono);
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  :global(.use-panel) {
    display: grid;
    gap: 14px;
  }

  .selected-head {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr);
    gap: 10px;
    align-items: center;
  }

  .selected-head small {
    display: block;
    margin-top: 2px;
    color: var(--ink-3);
    font-family: var(--mono);
    font-size: 10px;
  }

  .logic-mark {
    display: grid;
    width: 34px;
    height: 34px;
    place-items: center;
    border: 1px solid color-mix(in oklch, var(--coral) 45%, transparent);
    border-radius: 8px;
    color: #1c0a04;
    background: var(--coral);
    box-shadow: var(--shadow-cap);
    font-family: var(--mono);
    font-size: 13px;
    font-weight: 700;
  }

  .combo-mark {
    border-color: color-mix(in oklch, var(--mustard) 50%, transparent);
    background: var(--mustard);
  }

  .dance-mark {
    border-color: color-mix(in oklch, var(--teal) 50%, transparent);
    background: var(--teal);
  }

  .field {
    display: grid;
    gap: 6px;
    min-width: 0;
  }

  .library-input {
    width: 100%;
    min-width: 0;
    height: 34px;
    padding: 0 10px;
    border: 1px solid var(--line-2);
    border-radius: 8px;
    color: var(--ink);
    background: var(--surface);
    font: inherit;
    font-size: 13px;
  }

  .library-input:focus {
    border-color: var(--ink);
    outline: 0;
  }

  .mono {
    font-family: var(--mono);
  }

  .choice-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .choice-row button,
  .combo-key-grid button {
    border: 1px solid var(--line-2);
    border-radius: 7px;
    color: var(--ink-2);
    background: var(--surface);
    font-family: var(--mono);
  }

  .choice-row button {
    min-height: 28px;
    padding: 4px 9px;
    font-size: 10px;
  }

  .choice-row button.selected,
  .combo-key-grid button.selected {
    border-color: rgba(15, 147, 140, 0.45);
    color: #062826;
    background: #9de2d8;
  }

  .combo-key-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(58px, 1fr));
    gap: 5px;
    max-height: 210px;
    overflow: auto;
    padding-right: 2px;
  }

  .combo-key-grid button {
    display: grid;
    align-content: center;
    gap: 2px;
    min-width: 0;
    min-height: 42px;
    padding: 5px;
  }

  .combo-key-grid span,
  .combo-key-grid small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .combo-key-grid span {
    color: var(--ink);
    font-size: 11px;
    font-weight: 700;
  }

  .combo-key-grid small {
    color: var(--ink-3);
    font-size: 8px;
  }

  :global(.wide-action) {
    width: 100%;
    justify-content: center;
  }

  .side-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    padding-top: 2px;
  }

  .chip-icon {
    font-size: 14px;
  }

  .empty-panel {
    display: grid;
    min-height: 180px;
    place-items: center;
    align-content: center;
    gap: 8px;
    color: var(--ink-3);
    font-family: var(--mono);
    font-size: 12px;
  }

  .empty-panel.compact {
    min-height: 120px;
  }

  .empty-panel .material-symbols-outlined {
    font-size: 24px;
  }

  @media (max-width: 1080px) {
    .library-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    :global(.use-card) {
      max-width: none;
    }
  }

  @media (max-width: 640px) {
    .library-route {
      padding: 12px;
    }

    .library-grid {
      min-height: calc(100vh - 92px);
    }

    :global(.library-card-header) {
      align-items: flex-start;
      flex-wrap: wrap;
    }

    .library-row {
      grid-template-columns: minmax(0, 1fr);
    }

    .tap-grid,
    .side-actions {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
