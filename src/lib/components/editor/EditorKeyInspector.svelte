<script lang="ts">
  import { Keyboard, RotateCcw, SlidersHorizontal, StickyNote, X } from "@lucide/svelte";

  import {
    capLegend,
    displayCode,
    EDITOR_QUICK_PICK_GROUPS,
    type EditorInspectorTab,
    type EditorStore,
  } from "$lib/app/editor-store.svelte";
  import KeyBindingLogicPicker from "$lib/components/keymap/KeyBindingLogicPicker.svelte";
  import TargetOsChip from "$lib/components/keymap/TargetOsChip.svelte";
  import { Button, Input, SegmentedNav, SliderField } from "$lib/components/ui";
  import type { SegmentItem } from "$lib/components/ui/types";

  type Props = {
    editor: EditorStore;
    compact?: boolean;
  };

  let { editor, compact = false }: Props = $props();

  const tabs: SegmentItem<EditorInspectorTab>[] = [
    { value: "bind", label: "Bind", icon: Keyboard, title: "Keycode and workspace logic" },
    { value: "hold", label: "Hold-Tap", icon: SlidersHorizontal, title: "Tap and hold behavior" },
    { value: "notes", label: "Notes", icon: StickyNote, title: "Notes and source" },
  ];

  let keycodeDraft = $state("");
  let tapDraft = $state("");
  let holdDraft = $state("");
  let notesDraft = $state("");

  const selectionCount = $derived(editor.selectionIds.length);
  const selectedKey = $derived(editor.primarySelectedKey);
  const rendered = $derived(editor.selectedRenderedBinding);
  const selectedBinding = $derived(editor.selectedBinding);
  const selectedCodeSummary = $derived(editor.selectedCodeSummary);
  const titleCode = $derived(
    selectedCodeSummary.mixed ? "Mixed" : displayCode(selectedCodeSummary.code || selectedBinding.code),
  );

  $effect(() => {
    keycodeDraft = selectedCodeSummary.mixed ? "" : selectedBinding.code;
    tapDraft = selectedBinding.tap ?? "";
    holdDraft = selectedBinding.hold ?? "";
    notesDraft = selectedBinding.notes ?? "";
  });

  function commitKeycode() {
    const next = keycodeDraft.trim();
    if (next) editor.applyKeycode(next);
  }

  function handleKeycodeKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitKeycode();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      editor.clearSelection();
    }
  }

  function commitTapHold() {
    editor.applyHoldTapToSelection("tap", tapDraft);
    editor.applyHoldTapToSelection("hold", holdDraft);
  }

  function commitNotes() {
    editor.setNotesForPrimaryKey(notesDraft);
  }
</script>

<div class="editor-inspector" class:compact>
  {#if selectionCount === 0}
    <div class="empty-state">
      <Keyboard size={24} strokeWidth={1.5} aria-hidden="true" />
      <strong>No key selected</strong>
      <p>Select a key on the board to edit its binding.</p>
    </div>
  {:else}
    <header class="key-hero" class:multi={selectionCount > 1}>
      <div class="big-cap" aria-hidden="true">
        {#if selectionCount > 1}
          {selectionCount}
        {:else}
          {capLegend(rendered)}
        {/if}
      </div>
      <div class="hero-copy">
        <div class="hero-meta">
          {#if selectionCount > 1}
            {selectionCount} keys selected
          {:else if selectedKey}
            row {selectedKey.row} - col {selectedKey.col}
          {:else}
            selected key
          {/if}
        </div>
        <h2>{titleCode}</h2>
        {#if rendered?.transparent}
          <span class="source-pill" style={`--source-color: ${rendered.sourceColor}`}>
            from {rendered.sourceLayerName}
          </span>
        {:else if editor.activeLayerRecord}
          <span class="source-pill" style={`--source-color: ${editor.activeLayerRecord.color}`}>
            {editor.activeLayerRecord.name}
          </span>
        {/if}
      </div>
      <div class="hero-actions">
        <TargetOsChip value={editor.targetOs} onclick={() => editor.cycleTargetOs()} />
        <Button
          variant="ghost"
          size="icon"
          title="Clear selection"
          aria-label="Clear selection"
          onclick={() => editor.clearSelection()}
        >
          <X size={15} />
        </Button>
      </div>
    </header>

    <SegmentedNav
      items={tabs}
      value={editor.inspectorTab}
      onselect={(tab) => editor.setInspectorTab(tab)}
      ariaLabel="Selected key inspector"
      class="inspector-tabs"
    />

    <div class="inspector-scroll">
      {#if editor.inspectorTab === "bind"}
        <section class="inspector-section">
          <span class="field-label">Keycode</span>
          <div class="keycode-row">
            <Input
              bind:value={keycodeDraft}
              class="keycode-input font-mono text-sm"
              placeholder={selectedCodeSummary.mixed ? "Mixed selection" : "KC_A"}
              spellcheck={false}
              autocomplete="off"
              onkeydown={handleKeycodeKeydown}
            />
            <Button variant="solid" size="sm" onclick={commitKeycode}>Apply</Button>
          </div>

          <div class="quick-groups">
            {#each EDITOR_QUICK_PICK_GROUPS as group (group.name)}
              <div class="quick-group">
                <span class="field-label">{group.name}</span>
                <div class="keycode-pills">
                  {#each group.codes as code (code)}
                    <button
                      type="button"
                      class="keycode-pill"
                      class:active={!selectedCodeSummary.mixed && selectedBinding.code === code}
                      title={code}
                      onclick={() => editor.applyKeycode(code)}
                    >
                      {displayCode(code)}
                    </button>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        </section>

        <section class="inspector-section logic-section">
          <span class="field-label">Workspace logic</span>
          <KeyBindingLogicPicker
            items={editor.logicBindings}
            activeCode={selectedCodeSummary.mixed ? "" : selectedBinding.code}
            onBind={(item) => editor.bindLogicOption(item)}
          />
        </section>

        <div class="inspector-actions">
          <Button variant="ghost" size="sm" onclick={() => editor.resetSelectionToBase()}>
            <RotateCcw size={14} aria-hidden="true" />
            Reset
          </Button>
          <Button variant="ghost" size="sm" onclick={() => editor.clearBindingOnSelection()}>
            <X size={14} aria-hidden="true" />
            Clear
          </Button>
        </div>
      {:else if editor.inspectorTab === "hold"}
        <section class="inspector-section">
          <div class="tap-grid">
            <label class="field">
              <span class="field-label">Tap</span>
              <Input
                bind:value={tapDraft}
                class="font-mono text-sm"
                placeholder={selectedBinding.code}
                spellcheck={false}
              />
            </label>
            <label class="field">
              <span class="field-label">Hold</span>
              <Input
                bind:value={holdDraft}
                class="font-mono text-sm"
                placeholder="KC_LCTL"
                spellcheck={false}
              />
            </label>
          </div>
          <Button variant="solid" size="sm" onclick={commitTapHold}>Apply behavior</Button>
          <SliderField
            label="Tapping term"
            value={editor.profile.settings.tappingTerm}
            min={100}
            max={300}
            suffix="ms"
            compact
            onValueChange={(next) => editor.setTappingTerm(next)}
          />
        </section>
      {:else}
        <section class="inspector-section">
          {#if selectionCount === 1}
            <label class="field">
              <span class="field-label">Notes</span>
              <textarea
                bind:value={notesDraft}
                class="notes-input"
                rows="5"
                placeholder="Layout note for this key"
                onblur={commitNotes}
              ></textarea>
            </label>
            <Button variant="ghost" size="sm" onclick={commitNotes}>Save note</Button>
          {:else}
            <div class="multi-note">
              <strong>{selectionCount} keys selected</strong>
              <span>Notes are edited one key at a time.</span>
            </div>
          {/if}

          <div class="source-block">
            <span class="field-label">Source</span>
            <pre>{editor.selectedSnippet || "// Select one key to preview generated QMK."}</pre>
          </div>
        </section>
      {/if}
    </div>
  {/if}
</div>

<style>
  .editor-inspector {
    display: flex;
    flex: 1;
    min-height: 0;
    flex-direction: column;
    gap: 10px;
  }

  .key-hero {
    display: grid;
    grid-template-columns: 58px minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
    padding: 14px;
    border: 1px solid color-mix(in oklch, var(--surface-3) 58%, transparent);
    border-radius: 12px;
    background: color-mix(in oklch, var(--surface-2) 58%, var(--surface));
  }

  .big-cap {
    display: grid;
    width: 58px;
    height: 58px;
    place-items: center;
    overflow: hidden;
    border: 1px solid rgba(24, 22, 20, 0.18);
    border-radius: var(--r-big-cap);
    background: var(--keycap-base);
    box-shadow: var(--shadow-cap);
    font-family: var(--mono);
    font-size: 20px;
    font-weight: 600;
    line-height: 1;
    text-align: center;
  }

  .key-hero.multi .big-cap {
    color: #1c0a04;
    background: var(--coral);
  }

  .hero-copy {
    min-width: 0;
  }

  .hero-meta,
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

  .source-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 5px;
    color: var(--ink-2);
    font-family: var(--mono);
    font-size: 10px;
  }

  .source-pill::before {
    content: "";
    width: 8px;
    height: 8px;
    border-radius: 3px;
    background: var(--source-color);
  }

  .hero-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  :global(.inspector-tabs) {
    display: flex !important;
    width: 100%;
  }

  :global(.inspector-tabs > button) {
    flex: 1;
    min-width: 0;
    padding-inline: 8px;
  }

  .inspector-scroll {
    flex: 1;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    padding-right: 3px;
  }

  .inspector-section {
    display: grid;
    gap: 12px;
    min-width: 0;
  }

  .logic-section {
    margin-top: 15px;
    padding-top: 14px;
    border-top: 1px solid var(--line);
  }

  .keycode-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
  }

  .quick-groups {
    display: grid;
    gap: 13px;
  }

  .quick-group {
    display: grid;
    gap: 7px;
  }

  .keycode-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .keycode-pill {
    min-height: 28px;
    padding: 4px 10px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: var(--paper-2);
    color: var(--ink-2);
    font-family: var(--mono);
    font-size: 11px;
    line-height: 1;
    transition:
      border-color var(--dur-fast) var(--ease-out-soft),
      background var(--dur-fast) var(--ease-out-soft),
      color var(--dur-fast) var(--ease-out-soft);
  }

  .keycode-pill:hover {
    border-color: var(--line-2);
    color: var(--ink);
  }

  .keycode-pill.active {
    border-color: var(--coral);
    background: var(--coral);
    color: #1c0a04;
  }

  .inspector-actions {
    display: flex;
    gap: 8px;
    margin-top: 14px;
  }

  .tap-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .field {
    display: grid;
    gap: 6px;
  }

  .notes-input {
    width: 100%;
    min-height: 118px;
    resize: vertical;
    padding: 10px 12px;
    border: 1px solid var(--line-2);
    border-radius: 10px;
    outline: 0;
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-size: 12px;
    line-height: 1.45;
  }

  .notes-input:focus {
    border-color: var(--ink);
  }

  .source-block {
    display: grid;
    gap: 6px;
  }

  pre {
    overflow: auto;
    min-height: 118px;
    max-height: 220px;
    margin: 0;
    padding: 12px 14px;
    border-radius: 10px;
    background: var(--ink);
    color: var(--paper);
    font-family: var(--mono);
    font-size: 11px;
    line-height: 1.55;
  }

  .multi-note,
  .empty-state {
    display: grid;
    place-items: center;
    gap: 8px;
    min-height: 150px;
    padding: 18px;
    color: var(--ink-3);
    text-align: center;
  }

  .multi-note {
    min-height: 86px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--paper-2);
  }

  .multi-note strong,
  .empty-state strong {
    color: var(--ink);
    font-size: 13px;
  }

  .multi-note span,
  .empty-state p {
    margin: 0;
    font-size: 12px;
    line-height: 1.4;
  }

  .compact {
    display: grid;
    grid-template-areas:
      "hero tabs"
      "hero body";
    grid-template-columns: minmax(238px, 0.34fr) minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
    align-items: stretch;
    gap: 14px;
  }

  .compact .key-hero {
    grid-area: hero;
    min-width: 0;
    align-content: start;
  }

  .compact :global(.inspector-tabs) {
    grid-area: tabs;
  }

  .compact .inspector-scroll {
    grid-area: body;
    max-height: 132px;
    padding-right: 6px;
  }

  .compact .quick-groups {
    display: flex;
    gap: 10px;
    overflow-x: auto;
    padding-bottom: 2px;
  }

  .compact .quick-group {
    min-width: max-content;
  }

  .compact .logic-section {
    margin-top: 10px;
    padding-top: 10px;
  }

  .compact pre {
    min-height: 76px;
    max-height: 108px;
  }

  .compact .empty-state {
    grid-column: 1 / -1;
    min-height: 98px;
  }

  @media (max-width: 640px) {
    .key-hero,
    .compact {
      grid-template-columns: minmax(0, 1fr);
    }

    .compact {
      grid-template-areas:
        "hero"
        "tabs"
        "body";
    }

    .big-cap {
      width: 52px;
      height: 52px;
    }

    .hero-actions {
      justify-content: flex-start;
    }

    .tap-grid,
    .keycode-row {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
