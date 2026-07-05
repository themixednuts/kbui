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
  import { cn } from "$lib/utils.js";

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

  const labelTextClass = "block text-ink-3 font-mono text-[10px] tracking-[0.1em] uppercase";
  const fieldLabelClass = `field-label ${labelTextClass}`;
  const h2Class =
    "!mt-[2px] !mb-0 !overflow-hidden !text-[18px] !leading-[1.15] !text-ellipsis !whitespace-nowrap";
  const inspectorSectionClass = "inspector-section grid min-w-0 gap-[12px]";
  const fieldClass = "field grid gap-[6px]";
  const navFillClass =
    "!flex w-full [&>button]:min-w-0 [&>button]:flex-1 [&>button]:!px-[8px]";

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

<div
  class={cn(
    "editor-inspector flex flex-1 min-h-0 flex-col gap-[10px]",
    compact &&
      "compact grid grid-cols-[minmax(238px,0.34fr)_minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] items-stretch gap-[14px] max-[640px]:grid-cols-[minmax(0,1fr)]",
  )}
>
  {#if selectionCount === 0}
    <div
      class={cn(
        "empty-state !grid !min-h-[150px] place-items-center gap-[8px] p-[18px] text-center text-ink-3",
        compact && "col-span-full !min-h-[98px]",
      )}
    >
      <Keyboard size={24} strokeWidth={1.5} aria-hidden="true" />
      <strong class="text-[13px] text-ink">No key selected</strong>
      <p class="m-0 text-[12px] leading-[1.4]">Select a key on the board to edit its binding.</p>
    </div>
  {:else}
    <header
      class={cn(
        "key-hero !grid !grid-cols-[58px_minmax(0,1fr)_auto] !items-center !gap-[12px] !rounded-[12px] !border !border-[color-mix(in_oklch,var(--surface-3)_58%,transparent)] !bg-[color-mix(in_oklch,var(--surface-2)_58%,var(--surface))] !p-[14px] max-[640px]:!grid-cols-[minmax(0,1fr)]",
        selectionCount > 1 && "multi",
        compact &&
          "col-start-1 row-start-1 row-span-2 min-w-0 content-start max-[640px]:col-start-1 max-[640px]:row-start-1 max-[640px]:row-span-1",
      )}
    >
      <div
          class={cn(
            "big-cap !grid !size-[58px] place-items-center overflow-hidden !rounded-big-cap !border !border-[rgba(24,22,20,0.18)] ![background:var(--keycap-base)] !shadow-cap font-mono !text-[20px] !font-strong !leading-none text-center max-[640px]:!size-[52px]",
            selectionCount > 1 && "!bg-coral !text-[#1c0a04]",
          )}
        aria-hidden="true"
      >
        {#if selectionCount > 1}
          {selectionCount}
        {:else}
          {capLegend(rendered)}
        {/if}
      </div>
      <div class="hero-copy min-w-0">
        <div class={cn("hero-meta", labelTextClass)}>
          {#if selectionCount > 1}
            {selectionCount} keys selected
          {:else if selectedKey}
            row {selectedKey.row} - col {selectedKey.col}
          {:else}
            selected key
          {/if}
        </div>
        <h2 class={h2Class}>{titleCode}</h2>
        {#if rendered?.transparent}
          <span
            class="source-pill mt-[5px] inline-flex items-center gap-[6px] font-mono text-[10px] text-ink-2 before:size-[8px] before:rounded-[3px] before:bg-[var(--source-color)] before:content-['']"
            style={`--source-color: ${rendered.sourceColor}`}
          >
            from {rendered.sourceLayerName}
          </span>
        {:else if editor.activeLayerRecord}
          <span
            class="source-pill mt-[5px] inline-flex items-center gap-[6px] font-mono text-[10px] text-ink-2 before:size-[8px] before:rounded-[3px] before:bg-[var(--source-color)] before:content-['']"
            style={`--source-color: ${editor.activeLayerRecord.color}`}
          >
            {editor.activeLayerRecord.name}
          </span>
        {/if}
      </div>
      <div class="hero-actions flex items-center gap-[6px] max-[640px]:justify-start">
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
      class={cn(
        "inspector-tabs",
        navFillClass,
        compact &&
          "col-start-2 row-start-1 max-[640px]:col-start-1 max-[640px]:row-start-2",
      )}
    />

    <div
      class={cn(
        "inspector-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto pr-kb-3",
        compact &&
          "col-start-2 row-start-2 max-h-[132px] pr-kb-6 max-[640px]:col-start-1 max-[640px]:row-start-3",
      )}
    >
      {#if editor.inspectorTab === "bind"}
        <section class={inspectorSectionClass}>
          <span class={fieldLabelClass}>Keycode</span>
          <div class="keycode-row grid grid-cols-[minmax(0,1fr)_auto] gap-[8px] max-[640px]:grid-cols-[minmax(0,1fr)]">
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

          <div
            class={cn(
              "quick-groups grid gap-[13px]",
              compact && "flex gap-[10px] overflow-x-auto pb-kb-2",
            )}
          >
            {#each EDITOR_QUICK_PICK_GROUPS as group (group.name)}
              <div class={cn("quick-group grid gap-[7px]", compact && "min-w-max")}>
                <span class={fieldLabelClass}>{group.name}</span>
                <div class="keycode-pills flex flex-wrap gap-[6px]">
                  {#each group.codes as code (code)}
                    {@const active = !selectedCodeSummary.mixed && selectedBinding.code === code}
                    <button
                      type="button"
                      class={cn(
                        "keycode-pill min-h-[28px] rounded-[8px] !border !border-transparent !bg-paper-2 px-[10px] py-[4px] !font-mono !text-[11px] !leading-none !text-ink-2 transition-[border-color,background,color] duration-[var(--dur-fast)] ease-[var(--ease-out-soft)] hover:!border-line-2 hover:!text-ink",
                        active &&
                          "active !border-coral !bg-coral !text-[#1c0a04] hover:!border-coral hover:!text-[#1c0a04]",
                      )}
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

        <section
          class={cn(
            inspectorSectionClass,
            "logic-section mt-[15px] border-t border-line pt-[14px]",
            compact && "mt-[10px] pt-[10px]",
          )}
        >
          <span class={fieldLabelClass}>Workspace logic</span>
          <KeyBindingLogicPicker
            items={editor.logicBindings}
            activeCode={selectedCodeSummary.mixed ? "" : selectedBinding.code}
            onBind={(item) => editor.bindLogicOption(item)}
          />
        </section>

        <div class="inspector-actions mt-[14px] flex gap-[8px]">
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
        <section class={inspectorSectionClass}>
          <div class="tap-grid !grid !grid-cols-[repeat(2,minmax(0,1fr))] !gap-[10px] max-[640px]:!grid-cols-[minmax(0,1fr)]">
            <label class={fieldClass}>
              <span class={fieldLabelClass}>Tap</span>
              <Input
                bind:value={tapDraft}
                class="font-mono text-sm"
                placeholder={selectedBinding.code}
                spellcheck={false}
              />
            </label>
            <label class={fieldClass}>
              <span class={fieldLabelClass}>Hold</span>
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
        <section class={inspectorSectionClass}>
          {#if selectionCount === 1}
            <label class={fieldClass}>
              <span class={fieldLabelClass}>Notes</span>
              <textarea
                bind:value={notesDraft}
                class="notes-input min-h-[118px] w-full resize-y rounded-[10px] border border-line-2 bg-surface px-[12px] py-[10px] text-[12px] leading-[1.45] text-ink [font:inherit] outline-0 focus:border-ink"
                rows="5"
                placeholder="Layout note for this key"
                onblur={commitNotes}
              ></textarea>
            </label>
            <Button variant="ghost" size="sm" onclick={commitNotes}>Save note</Button>
          {:else}
            <div class="multi-note grid min-h-[86px] place-items-center gap-[8px] rounded-[10px] border border-line bg-paper-2 p-[18px] text-center text-ink-3">
              <strong class="text-[13px] text-ink">{selectionCount} keys selected</strong>
              <span class="m-0 text-[12px] leading-[1.4]">Notes are edited one key at a time.</span>
            </div>
          {/if}

          <div class="source-block grid gap-[6px]">
            <span class={fieldLabelClass}>Source</span>
            <pre
              class={cn(
                "m-0 min-h-[118px] max-h-[220px] overflow-auto rounded-[10px] bg-ink px-[14px] py-[12px] font-mono text-[11px] leading-[1.55] text-paper",
                compact && "min-h-[76px] max-h-[108px]",
              )}
            >{editor.selectedSnippet || "// Select one key to preview generated QMK."}</pre>
          </div>
        </section>
      {/if}
    </div>
  {/if}
</div>
