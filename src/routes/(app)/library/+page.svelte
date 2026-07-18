<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { Copy, Keyboard, Plus, Trash2 } from "@lucide/svelte";

  import {
    normalizeLibrarySelection,
    type LibrarySelectionIds,
    type LibraryTab,
  } from "$lib/app/library-selection";
  import { getShellContext } from "$lib/app/shell-store.svelte";
  import { displayCode } from "$lib/app/editor-store.svelte";
  import { getWorkbenchContext } from "$lib/app/workbench-store.svelte";
  import { Button, Chip, Input, SegmentedNav } from "$lib/components/ui";
  import * as Card from "$lib/components/ui/card/index.js";
  import type { SegmentItem } from "$lib/components/ui/types";
  import {
    comboChordLabels,
    comboKeyOptionLabel,
    comboLayerScopeLabel,
  } from "$lib/keyboard/combo-visibility";
  import {
    isCompleteMacro,
    isCompleteTapDance,
    macroBindingCode,
    tapDanceBindingCode,
  } from "$lib/keyboard/logic-bindings";
  import { keyById, type Combo, type Macro, type TapDance } from "$lib/keyboard/schema";
  import { cn } from "$lib/utils.js";

  const shell = getShellContext();
  const workbench = getWorkbenchContext();

  const tab = $derived<LibraryTab>(libraryTabFromUrl(page.url.searchParams.get("tab")));
  let selectedIds = $state<LibrarySelectionIds>({
    macros: workbench.profile.macros[0]?.id ?? "",
    combos: workbench.profile.combos[0]?.id ?? "",
    tapDance: workbench.profile.tapDances[0]?.id ?? "",
  });

  const tabItems = $derived<SegmentItem<LibraryTab>[]>([
    { value: "macros", label: `Macros · ${workbench.profile.macros.length}`, title: "Macros", href: "/library?tab=macros" },
    { value: "combos", label: `Combos · ${workbench.profile.combos.length}`, title: "Combos", href: "/library?tab=combos" },
    { value: "tapDance", label: `Tap Dance · ${workbench.profile.tapDances.length}`, title: "Tap dances", href: "/library?tab=tap-dance" },
  ]);
  const libraryRouteClass =
    "library-route min-h-[calc(100vh-58px)] bg-paper p-kb-22 max-[640px]:p-kb-12";
  const libraryGridClass =
    "library-grid grid min-h-[calc(100vh-102px)] grid-cols-[minmax(0,1fr)_minmax(300px,340px)] items-start gap-kb-16 max-[1080px]:grid-cols-[minmax(0,1fr)] max-[640px]:min-h-[calc(100vh-92px)]";
  const libraryCardClass =
    "library-card min-w-0 min-h-[min(650px,calc(100vh-102px))] overflow-hidden";
  const useCardClass = "use-card min-w-0 overflow-hidden max-[1080px]:max-w-none";
  const libraryCardHeaderClass =
    "library-card-header grid gap-kb-10 max-[640px]:items-start";
  const libraryHeaderTopClass =
    "library-header-top flex min-w-0 items-center gap-kb-10 max-[560px]:items-start max-[560px]:flex-wrap";
  const libraryTabsClass =
    "library-tabs w-fit max-w-full overflow-x-auto max-[640px]:w-full max-[640px]:[&_a]:flex-1 max-[640px]:[&_a]:px-kb-10";
  const libraryHeaderActionsClass =
    "library-header-actions ml-auto flex min-w-0 items-center gap-kb-8 max-[560px]:ml-0";
  const libraryCardBodyClass = "library-card-body p-kb-10";
  const libraryListClass = "library-list grid gap-kb-8";
  const libraryRowClass =
    "library-row grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-kb-10 rounded-keycap border border-transparent bg-paper-2 p-kb-10 transition-[border-color,background,transform] duration-[var(--dur-fast)] ease-[var(--ease-out-soft)] hover:-translate-y-px hover:border-line-2 max-[640px]:grid-cols-[minmax(0,1fr)]";
  const selectedLibraryRowClass =
    "selected border-[color-mix(in_oklch,var(--coral)_54%,var(--line-2))] bg-[color-mix(in_oklch,var(--coral)_9%,var(--paper-2))] hover:border-[color-mix(in_oklch,var(--coral)_54%,var(--line-2))]";
  const rowMainClass = "row-main grid min-w-0 gap-kb-6 p-0 text-left";
  const rowTitleClass = "row-title flex min-w-0 items-center gap-kb-8";
  const titleTextClass =
    "overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[13px] font-strong";
  const sequenceClass = "seq inline-flex flex-wrap items-center gap-kb-4";
  const sequenceKeyClass =
    "seq-key h-auto min-h-kb-22 min-w-kb-22 max-w-full whitespace-normal rounded-[5px] border-line-2 bg-surface-2 px-kb-6 py-0 font-mono text-[10px] leading-[1.1] text-ink shadow-sequence-key [overflow-wrap:anywhere] text-center [word-break:break-word]";
  const sequenceAddedClass =
    "added-key border-[var(--success-border)] bg-success-surface text-success-ink";
  const sequenceArrowClass = "seq-arrow font-mono text-ink-3";
  const draftNoteClass = "draft-note font-mono text-[11px] text-ink-3";
  const previewClass = "seq preview inline-flex flex-wrap items-center gap-kb-4 pt-kb-8 pb-kb-2";
  const tapGridClass =
    "tap-grid grid grid-cols-[repeat(3,minmax(0,1fr))] gap-kb-8 max-[640px]:grid-cols-[minmax(0,1fr)]";
  const tapCellClass = "grid min-w-0 gap-kb-4";
  const tapLabelClass = "font-mono text-[9px] tracking-[0.08em] text-ink-3 uppercase";
  const usePanelClass = "use-panel grid gap-kb-14";
  const selectedHeadClass =
    "selected-head grid grid-cols-[34px_minmax(0,1fr)] items-center gap-kb-10";
  const selectedHeadMetaClass = "mt-kb-2 block font-mono text-[10px] text-ink-3";
  const logicMarkClass =
    "logic-mark grid size-kb-34 place-items-center rounded-keycap border border-[color-mix(in_oklch,var(--coral)_45%,transparent)] bg-coral font-mono text-[13px] font-bold text-[#1c0a04] shadow-cap";
  const comboMarkClass =
    "combo-mark border-[color-mix(in_oklch,var(--mustard)_50%,transparent)] bg-mustard";
  const danceMarkClass =
    "dance-mark border-[color-mix(in_oklch,var(--teal)_50%,transparent)] bg-teal";
  const fieldClass = "grid min-w-0 gap-kb-6";
  const fieldLabelClass = "block font-mono text-kb-10 tracking-[0.08em] text-ink-3 uppercase";
  const libraryInputClass =
    "library-input h-kb-34 w-full min-w-0 rounded-keycap border-line-2 bg-surface px-kb-10 text-[13px] text-ink [font:inherit] focus-visible:border-ink";
  const monoInputClass = cn(libraryInputClass, "font-mono");
  const librarySelectClass =
    "h-kb-34 w-full min-w-0 rounded-keycap border border-line-2 bg-surface px-kb-10 text-[13px] text-ink outline-none focus-visible:border-ink focus-visible:ring-3 focus-visible:ring-ring/50";
  const choiceRowClass = "choice-row flex flex-wrap gap-kb-6";
  const choiceButtonClass =
    "h-kb-28 min-h-kb-28 rounded-[7px] border-line-2 bg-surface px-kb-9 py-kb-4 font-mono text-[10px] text-ink-2 hover:border-line-3 hover:bg-surface-2 hover:text-ink";
  const comboKeyGridClass =
    "combo-key-grid grid max-h-[210px] grid-cols-[repeat(auto-fill,minmax(58px,1fr))] gap-kb-5 overflow-auto pr-kb-2";
  const comboKeyButtonClass =
    "grid min-h-[42px] min-w-0 content-center gap-kb-2 rounded-[7px] border border-line-2 bg-surface p-kb-5 font-mono text-ink-2";
  const choiceSelectedClass = "selected border-[rgba(15,147,140,0.45)] bg-[#9de2d8] text-[#062826]";
  const comboKeyPrimaryClass =
    "overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-bold text-ink";
  const comboKeyDetailClass =
    "overflow-hidden text-ellipsis whitespace-nowrap text-[8px] text-ink-3";
  const wideActionClass = "wide-action w-full justify-center";
  const sideActionsClass =
    "side-actions grid grid-cols-[repeat(2,minmax(0,1fr))] gap-kb-8 pt-kb-2 max-[640px]:grid-cols-[minmax(0,1fr)]";
  const chipIconClass = "material-symbols-outlined chip-icon text-[14px]";
  const emptyPanelClass =
    "empty-panel grid min-h-[180px] place-items-center content-center gap-kb-8 font-mono text-[12px] text-ink-3";
  const compactEmptyPanelClass = cn(emptyPanelClass, "compact min-h-[120px]");
  const emptyPanelIconClass = "material-symbols-outlined text-[24px]";

  const normalizedSelection = $derived(
    normalizeLibrarySelection(selectedIds, tab, idsForTab(tab)),
  );
  const selectedMacro = $derived(
    workbench.profile.macros.find((macro) => macro.id === normalizedSelection.macros),
  );
  const selectedCombo = $derived(
    workbench.profile.combos.find((combo) => combo.id === normalizedSelection.combos),
  );
  const selectedTapDance = $derived(
    workbench.profile.tapDances.find((dance) => dance.id === normalizedSelection.tapDance),
  );
  const currentCount = $derived(idsForTab(tab).length);
  const addLabel = $derived(
    tab === "macros" ? "New macro" : tab === "combos" ? "New combo" : "New tap dance",
  );

  function idsForTab(nextTab: LibraryTab): string[] {
    if (nextTab === "macros") return workbench.profile.macros.map((macro) => macro.id);
    if (nextTab === "combos") return workbench.profile.combos.map((combo) => combo.id);
    return workbench.profile.tapDances.map((dance) => dance.id);
  }

  function libraryTabFromUrl(value: string | null): LibraryTab {
    if (value === "combos") return "combos";
    if (value === "tap-dance" || value === "tapDance") return "tapDance";
    return "macros";
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
    const id = normalizedSelection[tab];
    if (!id) return;

    if (tab === "macros") workbench.removeMacro(id);
    else if (tab === "combos") workbench.removeCombo(id);
    else workbench.removeTapDance(id);
  }

  function placeMacro(macro: Macro) {
    if (!isCompleteMacro(macro)) return;
    shell.startPlacement({ kind: "macro", id: macro.id, label: macroTitle(macro) });
    void goto("/editor");
  }

  function placeCombo(combo: Combo) {
    shell.startPlacement({ kind: "combo", id: combo.id, label: comboTitle(combo), picks: [] });
    void goto("/editor");
  }

  function placeTapDance(dance: TapDance) {
    if (!isCompleteTapDance(dance)) return;
    const label = tapDanceSourceLabel(dance);
    shell.startPlacement({ kind: "tapDance", id: dance.id, label: `Tap dance ${label}` });
    void goto("/editor");
  }

  function macroTitle(macro: Macro) {
    return macro.name || "Untitled macro";
  }

  function comboTitle(combo: Combo) {
    return combo.name || "Untitled combo";
  }

  function tapDanceSourceLabel(dance: TapDance) {
    if (!dance.keyId) return "Unassigned key";
    return keyById(workbench.profile, dance.keyId)?.label ?? dance.keyId;
  }

  function codeLabel(code: string, fallback: string) {
    return code.trim() ? displayCode(code) : fallback;
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

<section class={libraryRouteClass}>
  <div class={libraryGridClass}>
    <Card.Root class={libraryCardClass}>
      <Card.Header class={libraryCardHeaderClass}>
        <div class={libraryHeaderTopClass}>
          <Card.Title>Library</Card.Title>
          <div class={libraryHeaderActionsClass}>
            <Chip title={`${currentCount} entries`}>{currentCount} items</Chip>
            <Button variant="coral" size="sm" onclick={addCurrent}>
              <Plus size={14} aria-hidden="true" />
              {addLabel}
            </Button>
          </div>
        </div>
        <SegmentedNav
          items={tabItems}
          value={tab}
          ariaLabel="Library sections"
          class={libraryTabsClass}
        />
      </Card.Header>

      <Card.Content class={libraryCardBodyClass}>
        {#if tab === "macros"}
          {#if workbench.profile.macros.length === 0}
            <div class={emptyPanelClass}>
              <span class={emptyPanelIconClass} aria-hidden="true">edit_note</span>
              <strong>No macros</strong>
              <Button variant="ghost" size="sm" onclick={addCurrent}>Create macro</Button>
            </div>
          {:else}
            <div class={libraryListClass}>
              {#each workbench.profile.macros as macro (macro.id)}
                <div class={cn(libraryRowClass, normalizedSelection.macros === macro.id && selectedLibraryRowClass)}>
                  <button type="button" class={rowMainClass} onclick={() => selectItem(macro.id)}>
                    <span class={rowTitleClass}>
                      <strong class={titleTextClass}>{macroTitle(macro)}</strong>
                      <Chip>{macro.trigger || "Unassigned"}</Chip>
                    </span>
                    <span class={sequenceClass}>
                      {#if macro.sequence.length === 0}
                        <span class={draftNoteClass}>Add sequence</span>
                      {:else}
                        {#each macro.sequence as step, index (`${macro.id}-${index}`)}
                          <Chip class={sequenceKeyClass}>{displayCode(step)}</Chip>
                          {#if index < macro.sequence.length - 1}<span class={sequenceArrowClass}>-&gt;</span>{/if}
                        {/each}
                      {/if}
                    </span>
                  </button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!isCompleteMacro(macro)}
                    title={isCompleteMacro(macro) ? "Place macro" : "Add a sequence before placing"}
                    onclick={() => placeMacro(macro)}
                  >
                    <Keyboard size={14} aria-hidden="true" />
                    Use it
                  </Button>
                </div>
              {/each}
            </div>
          {/if}
        {:else if tab === "combos"}
          {#if workbench.profile.combos.length === 0}
            <div class={emptyPanelClass}>
              <span class={emptyPanelIconClass} aria-hidden="true">join_inner</span>
              <strong>No combos</strong>
              <Button variant="ghost" size="sm" onclick={addCurrent}>Create combo</Button>
            </div>
          {:else}
            <div class={libraryListClass}>
              {#each workbench.profile.combos as combo (combo.id)}
                <div class={cn(libraryRowClass, normalizedSelection.combos === combo.id && selectedLibraryRowClass)}>
                  <button type="button" class={rowMainClass} onclick={() => selectItem(combo.id)}>
                    <span class={rowTitleClass}>
                      <strong class={titleTextClass}>{comboTitle(combo)}</strong>
                      <Chip>{comboLayerScopeLabel(workbench.profile, combo)}</Chip>
                    </span>
                    <span class={sequenceClass}>
                      {#if combo.keys.length === 0}
                        <span class={draftNoteClass}>Add keys</span>
                      {:else}
                        {#each comboChordLabels(workbench.profile, combo, displayCode, workbench.activeLayer) as keyLabel, index (`${combo.id}-${index}`)}
                          <Chip class={sequenceKeyClass}>{keyLabel}</Chip>
                          {#if index < combo.keys.length - 1}<span class={sequenceArrowClass}>+</span>{/if}
                        {/each}
                      {/if}
                      <span class={sequenceArrowClass}>-&gt;</span>
                      {#if combo.binding}
                        <Chip class={cn(sequenceKeyClass, sequenceAddedClass)}>{displayCode(combo.binding)}</Chip>
                      {:else}
                        <span class={draftNoteClass}>Set output</span>
                      {/if}
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
          <div class={emptyPanelClass}>
            <span class={emptyPanelIconClass} aria-hidden="true">touch_app</span>
            <strong>No tap dances</strong>
            <Button variant="ghost" size="sm" onclick={addCurrent}>Create tap dance</Button>
          </div>
        {:else}
          <div class={libraryListClass}>
            {#each workbench.profile.tapDances as dance (dance.id)}
              <div class={cn(libraryRowClass, normalizedSelection.tapDance === dance.id && selectedLibraryRowClass)}>
                <button type="button" class={rowMainClass} onclick={() => selectItem(dance.id)}>
                  <span class={rowTitleClass}>
                    <strong class={titleTextClass}>{tapDanceSourceLabel(dance)}</strong>
                    <Chip>{isCompleteTapDance(dance) ? "tap dance" : "unassigned"}</Chip>
                  </span>
                  <span class={tapGridClass}>
                    <span class={tapCellClass}><small class={tapLabelClass}>Tap</small><Chip class={sequenceKeyClass}>{codeLabel(dance.tap, "Set tap")}</Chip></span>
                    <span class={tapCellClass}><small class={tapLabelClass}>Hold</small><Chip class={sequenceKeyClass}>{codeLabel(dance.hold, "Set hold")}</Chip></span>
                    <span class={tapCellClass}><small class={tapLabelClass}>Double</small><Chip class={sequenceKeyClass}>{codeLabel(dance.doubleTap, "Set double")}</Chip></span>
                  </span>
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!isCompleteTapDance(dance)}
                  title={isCompleteTapDance(dance)
                    ? "Place tap dance"
                    : "Choose a key and actions before placing"}
                  onclick={() => placeTapDance(dance)}
                >
                  <Keyboard size={14} aria-hidden="true" />
                  Use it
                </Button>
              </div>
            {/each}
          </div>
        {/if}
      </Card.Content>
    </Card.Root>

    <Card.Root class={useCardClass}>
      <Card.Header>
        <Card.Title>Use it</Card.Title>
        <Chip title="Placement target">
          <span class={chipIconClass} aria-hidden="true">ads_click</span>
          Place
        </Chip>
      </Card.Header>

      <Card.Content class={usePanelClass}>
        {#if tab === "macros" && selectedMacro}
          <div class={selectedHeadClass}>
            <span class={logicMarkClass}>M</span>
            <div>
              <strong class={titleTextClass}>{macroTitle(selectedMacro)}</strong>
              <small class={selectedHeadMetaClass}>{macroPlacementCount(selectedMacro)} placed</small>
            </div>
          </div>

          <label class={fieldClass}>
            <span class={fieldLabelClass}>Name</span>
            <Input
              class={libraryInputClass}
              value={selectedMacro.name}
              placeholder="Name this macro"
              oninput={(event) => workbench.updateMacro(selectedMacro.id, { name: inputValue(event) })}
            />
          </label>

          <label class={fieldClass}>
            <span class={fieldLabelClass}>Trigger note</span>
            <Input
              class={libraryInputClass}
              value={selectedMacro.trigger}
              oninput={(event) =>
                workbench.updateMacro(selectedMacro.id, { trigger: inputValue(event) })}
            />
          </label>

          <label class={fieldClass}>
            <span class={fieldLabelClass}>Sequence</span>
            <Input
              class={monoInputClass}
              spellcheck="false"
              value={selectedMacro.sequence.join(" ")}
              placeholder="KC_LCTL KC_C"
              oninput={(event) =>
                workbench.updateMacro(selectedMacro.id, {
                  sequence: sequenceFromInput(inputValue(event)),
                })}
            />
          </label>

          <div class={previewClass}>
            {#if selectedMacro.sequence.length === 0}
              <span class={draftNoteClass}>Add sequence</span>
            {:else}
              {#each selectedMacro.sequence as step, index (`preview-${selectedMacro.id}-${index}`)}
                <Chip class={sequenceKeyClass}>{displayCode(step)}</Chip>
              {/each}
            {/if}
          </div>

          <Button
            variant="coral"
            class={wideActionClass}
            disabled={!isCompleteMacro(selectedMacro)}
            title={isCompleteMacro(selectedMacro) ? "Place macro" : "Add a sequence before placing"}
            onclick={() => placeMacro(selectedMacro)}
          >
            <Keyboard size={15} aria-hidden="true" />
            Place on a key
          </Button>
        {:else if tab === "combos" && selectedCombo}
          <div class={selectedHeadClass}>
            <span class={cn(logicMarkClass, comboMarkClass)}>C</span>
            <div>
              <strong class={titleTextClass}>{comboTitle(selectedCombo)}</strong>
              <small class={selectedHeadMetaClass}>{selectedCombo.keys.length ? `${selectedCombo.keys.length} members` : "Add keys"}</small>
            </div>
          </div>

          <label class={fieldClass}>
            <span class={fieldLabelClass}>Name</span>
            <Input
              class={libraryInputClass}
              value={selectedCombo.name}
              placeholder="Name this combo"
              oninput={(event) => workbench.updateCombo(selectedCombo.id, { name: inputValue(event) })}
            />
          </label>

          <label class={fieldClass}>
            <span class={fieldLabelClass}>Output</span>
            <Input
              class={monoInputClass}
              spellcheck="false"
              value={selectedCombo.binding}
              placeholder="KC_ESC"
              oninput={(event) =>
                workbench.updateCombo(selectedCombo.id, { binding: inputValue(event) })}
            />
          </label>

          <div class={fieldClass}>
            <span class={fieldLabelClass}>Layers</span>
            <div class={choiceRowClass}>
              <Button
                type="button"
                variant="outline"
                size="xs"
                class={cn(choiceButtonClass, !selectedCombo.layerIds?.length && choiceSelectedClass)}
                aria-pressed={!selectedCombo.layerIds?.length}
                onclick={() => setComboLayerScope(selectedCombo, undefined)}
              >
                All
              </Button>
              {#each workbench.profile.layers as layer (layer.id)}
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  class={cn(choiceButtonClass, comboUsesLayer(selectedCombo, layer.id) && choiceSelectedClass)}
                  aria-pressed={comboUsesLayer(selectedCombo, layer.id)}
                  onclick={() => toggleComboLayer(selectedCombo, layer.id)}
                >
                  {layer.name}
                </Button>
              {/each}
            </div>
          </div>

          <div class={fieldClass}>
            <span class={fieldLabelClass}>Members</span>
            <div class={comboKeyGridClass}>
              {#each workbench.profile.keys as key (key.id)}
                {@const keyLabel = comboKeyLabel(selectedCombo, key.id)}
                <button
                  type="button"
                  class={cn(comboKeyButtonClass, selectedCombo.keys.includes(key.id) && choiceSelectedClass)}
                  aria-pressed={selectedCombo.keys.includes(key.id)}
                  title={`${keyLabel.primary} - ${keyLabel.detail}`}
                  onclick={() => toggleComboKey(selectedCombo, key.id)}
                >
                  <span class={comboKeyPrimaryClass}>{keyLabel.primary}</span>
                  <small class={comboKeyDetailClass}>{keyLabel.detail}</small>
                </button>
              {/each}
            </div>
          </div>

          <Button variant="coral" class={wideActionClass} onclick={() => placeCombo(selectedCombo)}>
            <Keyboard size={15} aria-hidden="true" />
            Pick keys on board
          </Button>
        {:else if tab === "tapDance" && selectedTapDance}
          <div class={selectedHeadClass}>
            <span class={cn(logicMarkClass, danceMarkClass)}>T</span>
            <div>
              <strong class={titleTextClass}>{tapDanceSourceLabel(selectedTapDance)}</strong>
              <small class={selectedHeadMetaClass}>{tapDancePlacementCount(selectedTapDance)} placed</small>
            </div>
          </div>

          <label class={fieldClass}>
            <span class={fieldLabelClass}>Source key</span>
            <select
              class={librarySelectClass}
              value={selectedTapDance.keyId}
              onchange={(event) =>
                workbench.updateTapDance(selectedTapDance.id, { keyId: selectValue(event) })}
            >
              <option value="">Choose a key</option>
              {#each workbench.profile.keys as key (key.id)}
                <option value={key.id}>{key.label}</option>
              {/each}
            </select>
          </label>

          <label class={fieldClass}>
            <span class={fieldLabelClass}>Tap</span>
            <Input
              class={monoInputClass}
              spellcheck="false"
              value={selectedTapDance.tap}
              placeholder="KC_ESC"
              oninput={(event) =>
                workbench.updateTapDance(selectedTapDance.id, { tap: inputValue(event) })}
            />
          </label>

          <label class={fieldClass}>
            <span class={fieldLabelClass}>Hold</span>
            <Input
              class={monoInputClass}
              spellcheck="false"
              value={selectedTapDance.hold}
              placeholder="KC_LCTL"
              oninput={(event) =>
                workbench.updateTapDance(selectedTapDance.id, { hold: inputValue(event) })}
            />
          </label>

          <label class={fieldClass}>
            <span class={fieldLabelClass}>Double tap</span>
            <Input
              class={monoInputClass}
              spellcheck="false"
              value={selectedTapDance.doubleTap}
              placeholder="KC_CAPS"
              oninput={(event) =>
                workbench.updateTapDance(selectedTapDance.id, { doubleTap: inputValue(event) })}
            />
          </label>

          <Button
            variant="coral"
            class={wideActionClass}
            disabled={!isCompleteTapDance(selectedTapDance)}
            title={isCompleteTapDance(selectedTapDance)
              ? "Place tap dance"
              : "Choose a key and actions before placing"}
            onclick={() => placeTapDance(selectedTapDance)}
          >
            <Keyboard size={15} aria-hidden="true" />
            Place on a key
          </Button>
        {:else}
          <div class={compactEmptyPanelClass}>
            <span class={emptyPanelIconClass} aria-hidden="true">inventory_2</span>
            <strong>No selection</strong>
          </div>
        {/if}

        {#if currentCount > 0}
          <div class={sideActionsClass}>
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
