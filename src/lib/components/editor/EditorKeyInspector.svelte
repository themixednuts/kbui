<script lang="ts">
  import { Keyboard, RotateCcw, Search, SlidersHorizontal, StickyNote, X } from "@lucide/svelte";

  import {
    capLegend,
    type EditorInspectorTab,
    type EditorStore,
  } from "$lib/app/editor-store.svelte";
  import KeyBindingLogicPicker from "$lib/components/keymap/KeyBindingLogicPicker.svelte";
  import TargetOsChip from "$lib/components/keymap/TargetOsChip.svelte";
  import { Button, Input, SegmentedNav, SliderField } from "$lib/components/ui";
  import type { SegmentItem } from "$lib/components/ui/types";
  import {
    canonicalCodeForFirmwareInput,
    firmwareBindingDisplay,
    firmwareKeycodeCatalog,
    firmwareQuickPickGroups,
  } from "$lib/keyboard/firmware-keycode-catalog";
  import { cn } from "$lib/utils.js";

  type Props = {
    editor: EditorStore;
    compact?: boolean;
  };

  let { editor, compact = false }: Props = $props();

  const tabs = $derived<SegmentItem<EditorInspectorTab>[]>([
    {
      value: "bind",
      label: editor.profile.firmware === "zmk" ? "Binding" : "Bind",
      icon: Keyboard,
      title: editor.profile.firmware === "zmk" ? "ZMK behavior binding" : "QMK keycode and workspace logic",
    },
    {
      value: "hold",
      label: editor.profile.firmware === "zmk" ? "Behavior" : "Hold-Tap",
      icon: SlidersHorizontal,
      title: editor.profile.firmware === "zmk" ? "ZMK tap and hold behavior" : "QMK tap and hold behavior",
    },
    { value: "notes", label: "Notes", icon: StickyNote, title: "Notes and firmware source" },
  ]);

  const labelTextClass = "block text-ink-3 font-mono text-[10px] tracking-[0.1em] uppercase";
  const fieldLabelClass = labelTextClass;
  const h2Class =
    "mt-[2px] mb-0 overflow-hidden text-[18px] leading-[1.15] text-ellipsis whitespace-nowrap";
  const inspectorSectionClass = "inspector-section grid min-w-0 gap-[12px]";
  const fieldClass = "grid gap-[6px]";
  const navFillClass =
    "flex w-full [&>[data-slot=button]]:min-w-0 [&>[data-slot=button]]:flex-1 [&>[data-slot=button]]:px-[8px]";

  const catalogGroupLabels: Record<string, string> = {
    basic: "Basic & symbols",
    modifiers: "Modifiers",
    media: "Media",
    system: "System",
    mouse: "Mouse",
    quantum: "Quantum",
    underglow: "RGB underglow",
    rgb_matrix: "RGB matrix",
    led_matrix: "LED matrix",
    backlight: "Backlight",
    programmable_button: "Programmable buttons",
    connection: "Connections",
    joystick: "Joystick",
    swap_hands: "Swap hands",
    magic: "Magic",
    midi: "MIDI",
    audio: "Audio",
    sequencer: "Sequencer",
    macro: "Macros",
    user: "User keycodes",
    kb: "Keyboard keycodes",
    internal: "Internal",
    layers: "Layers",
    "hold-tap": "Hold-tap",
    sticky: "Sticky keys",
    bluetooth: "Bluetooth",
    output: "Output routing",
    other: "Other",
  };

  let keycodeDraft = $state("");
  let tapDraft = $state("");
  let holdDraft = $state("");
  let notesDraft = $state("");
  let catalogQuery = $state("");
  let catalogGroup = $state("basic");

  const firmware = $derived(editor.profile.firmware);
  const firmwareLabel = $derived.by(() => {
    if (firmware === "qmk") return editor.profile.protocol === "via-v3" ? "VIA · QMK" : "QMK";
    if (
      editor.profile.identity?.transport === "webbluetooth" ||
      editor.profile.settings.splitTransport === "ble"
    ) {
      return "ZMK · Bluetooth";
    }
    if (editor.profile.identity?.transport === "webserial") return "ZMK · USB";
    return "ZMK · Studio";
  });
  const catalogItems = $derived(
    firmwareKeycodeCatalog(firmware, editor.profile.layers.length),
  );
  const catalogGroups = $derived(
    Array.from(new Set(catalogItems.map((item) => item.group))).sort(),
  );
  const quickPickGroups = $derived(
    firmwareQuickPickGroups(firmware, editor.profile.layers.length),
  );
  const selectionCount = $derived(editor.selectionIds.length);
  const selectedKey = $derived(editor.primarySelectedKey);
  const rendered = $derived(editor.selectedRenderedBinding);
  const selectedBinding = $derived(editor.selectedBinding);
  const selectedCodeSummary = $derived(editor.selectedCodeSummary);
  const titleCode = $derived(
    selectedCodeSummary.mixed
      ? "Mixed"
      : firmwareBindingDisplay(selectedCodeSummary.code || selectedBinding.code, firmware),
  );
  const filteredCatalog = $derived.by(() => {
    const query = catalogQuery.trim().toLowerCase();
    return catalogItems.filter((item) => {
      if (catalogGroup !== "all" && item.group !== catalogGroup) return false;
      if (!query) return true;
      return [item.code, item.nativeCode, item.label, ...item.aliases].some((value) =>
        value.toLowerCase().includes(query),
      );
    });
  });

  $effect(() => {
    keycodeDraft = selectedCodeSummary.mixed
      ? ""
      : firmwareBindingDisplay(selectedBinding.code, firmware);
    tapDraft = selectedBinding.tap ? firmwareBindingDisplay(selectedBinding.tap, firmware) : "";
    holdDraft = selectedBinding.hold ? firmwareBindingDisplay(selectedBinding.hold, firmware) : "";
    notesDraft = selectedBinding.notes ?? "";
  });

  $effect(() => {
    if (catalogGroup !== "all" && !catalogGroups.includes(catalogGroup)) {
      catalogGroup = catalogGroups.includes("basic") ? "basic" : "all";
    }
  });

  function commitKeycode() {
    const next = keycodeDraft.trim();
    if (next) editor.applyKeycode(canonicalCodeForFirmwareInput(next, firmware));
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
    editor.applyHoldTapToSelection("tap", canonicalCodeForFirmwareInput(tapDraft, firmware));
    editor.applyHoldTapToSelection("hold", canonicalCodeForFirmwareInput(holdDraft, firmware));
  }

  function commitNotes() {
    editor.setNotesForPrimaryKey(notesDraft);
  }
</script>

<div
  class={cn(
    "editor-inspector flex flex-1 min-h-0 flex-col gap-[10px]",
    compact &&
      "compact grid h-full grid-cols-[minmax(238px,0.34fr)_minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] items-stretch gap-[14px] max-[640px]:grid-cols-[minmax(0,1fr)]",
  )}
>
  {#if selectionCount === 0}
    <div
      class={cn(
        "empty-state grid min-h-[150px] place-items-center gap-[8px] p-[18px] text-center text-ink-3",
        compact && "col-span-full min-h-[98px]",
      )}
    >
      <Keyboard size={24} strokeWidth={1.5} aria-hidden="true" />
      <strong class="text-[13px] text-ink">No key selected</strong>
      <p class="m-0 text-[12px] leading-[1.4]">Select a key on the board to edit its binding.</p>
    </div>
  {:else}
    <header
      class={cn(
        "key-hero grid grid-cols-[58px_minmax(0,1fr)_auto] items-center gap-[12px] rounded-[8px] border border-[color-mix(in_oklch,var(--surface-3)_58%,transparent)] bg-[color-mix(in_oklch,var(--surface-2)_58%,var(--surface))] p-[14px] max-[640px]:grid-cols-[minmax(0,1fr)]",
        selectionCount > 1 && "multi",
        compact &&
          "col-start-1 row-start-1 row-span-2 min-w-0 content-start max-[640px]:col-start-1 max-[640px]:row-start-1 max-[640px]:row-span-1",
      )}
    >
      <div
          class={cn(
            "big-cap grid size-[58px] place-items-center overflow-hidden rounded-big-cap border border-[color-mix(in_oklch,var(--ink)_18%,transparent)] [background:var(--keycap-base)] shadow-cap font-mono text-[20px] font-strong leading-none text-center max-[640px]:size-[52px]",
            selectionCount > 1 && "bg-coral text-[#1c0a04]",
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
          "col-start-2 row-start-2 max-h-full pr-kb-6 max-[640px]:col-start-1 max-[640px]:row-start-3",
      )}
    >
      {#if editor.inspectorTab === "bind"}
        <section class={inspectorSectionClass}>
          <div class="flex min-w-0 items-center justify-between gap-[8px]">
            <span class={fieldLabelClass}>{firmware === "zmk" ? "Behavior binding" : "Keycode"}</span>
            <span
              class="inline-flex min-h-[22px] items-center rounded-pill border border-line-2 bg-paper-2 px-[8px] font-mono text-[9px] tracking-[0.07em] text-ink-2 uppercase"
              data-firmware={firmware}
            >{firmwareLabel}</span>
          </div>
          <div class="keycode-row grid grid-cols-[minmax(0,1fr)_auto] gap-[8px] max-[640px]:grid-cols-[minmax(0,1fr)]">
            <Input
              bind:value={keycodeDraft}
              class="keycode-input font-mono text-sm"
              placeholder={selectedCodeSummary.mixed
                ? "Mixed selection"
                : firmware === "zmk"
                  ? "&kp A"
                  : "KC_A"}
              spellcheck={false}
              autocomplete="off"
              aria-label={firmware === "zmk" ? "ZMK behavior binding" : "QMK keycode"}
              onkeydown={handleKeycodeKeydown}
            />
            <Button variant="solid" size="sm" onclick={commitKeycode}>Apply</Button>
          </div>
          <p class="-mt-[5px] mb-0 font-mono text-[9px] leading-[1.4] text-ink-3">
            {firmware === "zmk"
              ? "Native ZMK syntax accepted · catalog follows this board's firmware"
              : "QMK/VIA keycodes · aliases normalize on apply"}
          </p>

          <div class="quick-groups grid min-w-0 gap-[13px] pb-kb-2">
            {#each quickPickGroups as group (group.name)}
              <div class="quick-group grid min-w-0 gap-[7px]">
                <span class={fieldLabelClass}>{group.name}</span>
                <div
                  class={cn(
                    "keycode-pills gap-[6px]",
                    group.name === "Letters"
                      ? "grid grid-cols-[repeat(auto-fill,minmax(34px,1fr))]"
                      : "flex flex-wrap",
                  )}
                >
                  {#each group.codes as code (code)}
                    {@const active = !selectedCodeSummary.mixed && selectedBinding.code === code}
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      class={cn(
                        "keycode-pill h-[28px] min-h-[28px] rounded-sm border-transparent bg-paper-2 px-[10px] py-[4px] font-mono text-[11px] leading-none text-ink-2 hover:border-line-2 hover:bg-paper-2 hover:text-ink",
                        active &&
                          "active border-coral bg-coral text-on-accent hover:border-coral hover:text-on-accent",
                      )}
                      title={code}
                      onclick={() => editor.applyKeycode(code)}
                    >
                      {firmwareBindingDisplay(code, firmware)}
                    </Button>
                  {/each}
                </div>
              </div>
            {/each}
          </div>

          <details class="keycode-catalog rounded-[9px] border border-line bg-card">
            <summary class="flex min-h-[38px] cursor-pointer list-none items-center gap-[8px] px-[11px] font-mono text-[11px] text-ink-2 marker:hidden">
              <Search size={14} aria-hidden="true" />
              Search {firmware === "zmk" ? "ZMK bindings" : "QMK keycodes"}
            </summary>
            <div class="grid gap-[9px] border-t border-line p-[10px]">
              <div class="grid grid-cols-[minmax(0,1fr)_minmax(128px,0.48fr)] gap-[8px] max-[560px]:grid-cols-1">
                <Input
                  bind:value={catalogQuery}
                  class="font-mono text-[11px]"
                  type="search"
                  placeholder={firmware === "zmk"
                    ? "Search behavior, key, or Bluetooth action"
                    : "Search code, label, or alias"}
                  aria-label={firmware === "zmk"
                    ? "Search ZMK behavior bindings"
                    : "Search all QMK keycodes"}
                />
                <select
                  bind:value={catalogGroup}
                  class="h-[34px] min-w-0 rounded-md border border-line-2 bg-surface px-[9px] font-mono text-[10px] text-ink outline-none focus:border-ink"
                  aria-label={firmware === "zmk" ? "ZMK binding category" : "QMK keycode category"}
                >
                  <option value="all">All categories</option>
                  {#each catalogGroups as group (group)}
                    <option value={group}>{catalogGroupLabels[group] ?? group}</option>
                  {/each}
                </select>
              </div>

              <div class="catalog-results flex max-h-[250px] flex-wrap content-start gap-[6px] overflow-y-auto pr-[3px]">
                {#each filteredCatalog as item (`${item.group}-${item.code}`)}
                  {@const active = !selectedCodeSummary.mixed && selectedBinding.code === item.code}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    class={cn(
                      "catalog-key grid h-auto min-h-[34px] max-w-full content-center whitespace-normal rounded-[7px] border-line-2 bg-surface px-[9px] py-[4px] text-left hover:border-line-3 hover:bg-surface-2",
                      active && "border-coral bg-coral text-on-accent hover:border-coral hover:bg-coral",
                    )}
                    title={[item.nativeCode, item.code, item.label, ...item.aliases].join(" · ")}
                    onclick={() => editor.applyKeycode(item.code)}
                  >
                    <span class="font-mono text-[10px] leading-[1.15]">{item.nativeCode}</span>
                    {#if item.label !== item.nativeCode}
                      <small class={cn("max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap text-[9px] leading-[1.2] text-ink-3", active && "text-on-accent/75")}>{item.label}</small>
                    {/if}
                  </Button>
                {:else}
                  <p class="m-0 py-[8px] text-[11px] text-ink-3">No matching keycodes.</p>
                {/each}
              </div>
            </div>
          </details>
        </section>

        <section
          class={cn(
            inspectorSectionClass,
            "logic-section mt-[15px] border-t border-line pt-[14px]",
            compact && "mt-[10px] pt-[10px]",
          )}
        >
          <span class={fieldLabelClass}>Library bindings</span>
          <KeyBindingLogicPicker
            items={editor.logicBindings}
            activeCode={selectedCodeSummary.mixed ? "" : selectedBinding.code}
            onBind={(item) => editor.bindLogicOption(item)}
          />
        </section>

        <div class="inspector-actions mt-[14px] flex justify-end gap-[8px]">
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
          <div class="tap-grid grid grid-cols-[repeat(2,minmax(0,1fr))] gap-[10px] max-[640px]:grid-cols-[minmax(0,1fr)]">
            <label class={fieldClass}>
              <span class={fieldLabelClass}>Tap</span>
              <Input
                bind:value={tapDraft}
                class="font-mono text-sm"
                placeholder={firmware === "zmk"
                  ? firmwareBindingDisplay(selectedBinding.code, firmware)
                  : selectedBinding.code}
                spellcheck={false}
              />
            </label>
            <label class={fieldClass}>
              <span class={fieldLabelClass}>Hold</span>
              <Input
                bind:value={holdDraft}
                class="font-mono text-sm"
                placeholder={firmware === "zmk" ? "&kp LCTRL" : "KC_LCTL"}
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
                class="notes-input min-h-[118px] w-full resize-y rounded-md border border-line-2 bg-surface px-[12px] py-[10px] text-[12px] leading-[1.45] text-ink [font:inherit] outline-0 focus:border-ink"
                rows="5"
                placeholder="Layout note for this key"
                onblur={commitNotes}
              ></textarea>
            </label>
            <Button variant="ghost" size="sm" onclick={commitNotes}>Save note</Button>
          {:else}
            <div class="multi-note grid min-h-[86px] place-items-center gap-[8px] rounded-[8px] border border-line bg-paper-2 p-[18px] text-center text-ink-3">
              <strong class="text-[13px] text-ink">{selectionCount} keys selected</strong>
              <span class="m-0 text-[12px] leading-[1.4]">Notes are edited one key at a time.</span>
            </div>
          {/if}

          <div class="source-block grid gap-[6px]">
            <span class={fieldLabelClass}>Source</span>
            <pre
              class={cn(
                "m-0 min-h-[118px] max-h-[220px] overflow-auto rounded-[8px] bg-ink px-[14px] py-[12px] font-mono text-[11px] leading-[1.55] text-paper",
                compact && "min-h-[76px] max-h-[108px]",
              )}
            >{editor.selectedSnippet || `// Select one key to preview generated ${firmware.toUpperCase()}.`}</pre>
          </div>
        </section>
      {/if}
    </div>
  {/if}
</div>
