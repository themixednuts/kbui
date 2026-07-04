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
  import {
    isCompleteMacro,
    isCompleteTapDance,
    macroBindingCode,
    tapDanceBindingCode,
  } from "$lib/keyboard/logic-bindings";
  import { keyById, type Combo, type Macro, type TapDance } from "$lib/keyboard/schema";
  import { cn } from "$lib/utils.js";

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
  const libraryRouteClass =
    "library-route min-h-[calc(100vh-58px)] bg-[radial-gradient(ellipse_82%_52%_at_78%_0%,color-mix(in_oklch,var(--teal)_7%,transparent),transparent_66%),var(--paper)] p-kb-22 max-[640px]:p-kb-12";
  const libraryGridClass =
    "library-grid grid min-h-[calc(100vh-102px)] grid-cols-[minmax(0,1fr)_minmax(300px,340px)] items-start gap-kb-16 max-[1080px]:grid-cols-[minmax(0,1fr)] max-[640px]:min-h-[calc(100vh-92px)]";
  const libraryCardClass =
    "library-card min-w-0 min-h-[min(650px,calc(100vh-102px))] overflow-hidden";
  const useCardClass = "use-card min-w-0 overflow-hidden max-[1080px]:max-w-none";
  const libraryCardHeaderClass =
    "library-card-header gap-kb-10 max-[640px]:items-start max-[640px]:flex-wrap";
  const libraryCardBodyClass = "library-card-body p-kb-10";
  const headerSpacerClass = "header-spacer min-w-[10px] flex-1";
  const libraryListClass = "library-list grid gap-kb-8";
  const libraryRowClass =
    "library-row grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-kb-10 rounded-keycap border border-transparent bg-paper-2 p-kb-10 transition-[border-color,background,transform] duration-[var(--dur-fast)] ease-[var(--ease-out-soft)] hover:-translate-y-px hover:border-line-2 max-[640px]:grid-cols-[minmax(0,1fr)]";
  const selectedLibraryRowClass =
    "selected border-[color-mix(in_oklch,var(--coral)_54%,var(--line-2))] bg-[color-mix(in_oklch,var(--coral)_9%,var(--paper-2))] hover:border-[color-mix(in_oklch,var(--coral)_54%,var(--line-2))]";
  const rowMainClass = "row-main grid min-w-0 gap-kb-6 p-0 text-left";
  const rowTitleClass = "row-title flex min-w-0 items-center gap-kb-8";
  const titleTextClass =
    "overflow-hidden text-ellipsis whitespace-nowrap font-mono text-kb-13 font-strong";
  const sequenceClass = "seq !mt-0";
  const draftNoteClass = "draft-note font-mono text-kb-11 text-ink-3";
  const previewClass = "seq preview !mt-0 pt-kb-8 pb-kb-2";
  const tapGridClass =
    "tap-grid !mt-0 !gap-kb-8 max-[640px]:!grid-cols-[minmax(0,1fr)]";
  const tapCellClass = "grid min-w-0 gap-kb-4";
  const tapLabelClass = "font-mono text-kb-9 tracking-[0.08em] text-ink-3 uppercase";
  const usePanelClass = "use-panel grid gap-kb-14";
  const selectedHeadClass =
    "selected-head grid grid-cols-[34px_minmax(0,1fr)] items-center gap-kb-10";
  const selectedHeadMetaClass = "mt-kb-2 block font-mono text-kb-10 text-ink-3";
  const logicMarkClass =
    "logic-mark grid size-kb-34 place-items-center rounded-keycap border border-[color-mix(in_oklch,var(--coral)_45%,transparent)] bg-coral font-mono text-kb-13 font-bold text-[#1c0a04] shadow-cap";
  const comboMarkClass =
    "combo-mark border-[color-mix(in_oklch,var(--mustard)_50%,transparent)] bg-mustard";
  const danceMarkClass =
    "dance-mark border-[color-mix(in_oklch,var(--teal)_50%,transparent)] bg-teal";
  const fieldClass = "field grid min-w-0 gap-kb-6";
  const libraryInputClass =
    "library-input h-kb-34 w-full min-w-0 rounded-keycap border border-line-2 bg-surface px-kb-10 text-kb-13 text-ink [font:inherit] outline-0 focus:border-ink";
  const monoInputClass = cn(libraryInputClass, "mono font-mono");
  const choiceRowClass = "choice-row flex flex-wrap gap-kb-6";
  const choiceButtonClass =
    "rounded-[7px] border border-line-2 bg-surface px-kb-9 py-kb-4 font-mono text-kb-10 text-ink-2 min-h-kb-28";
  const comboKeyGridClass =
    "combo-key-grid grid max-h-[210px] grid-cols-[repeat(auto-fill,minmax(58px,1fr))] gap-kb-5 overflow-auto pr-kb-2";
  const comboKeyButtonClass =
    "grid min-h-[42px] min-w-0 content-center gap-kb-2 rounded-[7px] border border-line-2 bg-surface p-kb-5 font-mono text-ink-2";
  const choiceSelectedClass = "selected border-[rgba(15,147,140,0.45)] bg-[#9de2d8] text-[#062826]";
  const comboKeyPrimaryClass =
    "overflow-hidden text-ellipsis whitespace-nowrap text-kb-11 font-bold text-ink";
  const comboKeyDetailClass =
    "overflow-hidden text-ellipsis whitespace-nowrap text-kb-8 text-ink-3";
  const wideActionClass = "wide-action w-full justify-center";
  const sideActionsClass =
    "side-actions grid grid-cols-[repeat(2,minmax(0,1fr))] gap-kb-8 pt-kb-2 max-[640px]:grid-cols-[minmax(0,1fr)]";
  const chipIconClass = "material-symbols-outlined chip-icon !text-kb-14";
  const emptyPanelClass =
    "empty-panel grid min-h-[180px] place-items-center content-center gap-kb-8 font-mono text-kb-12 text-ink-3";
  const compactEmptyPanelClass = cn(emptyPanelClass, "compact min-h-[120px]");
  const emptyPanelIconClass = "material-symbols-outlined !text-kb-24";

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
        <Card.Title>Library</Card.Title>
        <SegmentedNav
          items={tabItems}
          value={tab}
          onselect={(next) => (tab = next)}
          ariaLabel="Library sections"
        />
        <div class={headerSpacerClass}></div>
        <Chip title={`${currentCount} entries`}>{currentCount} items</Chip>
        <Button variant="coral" size="sm" onclick={addCurrent}>
          <Plus size={14} aria-hidden="true" />
          {addLabel}
        </Button>
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
                <div class={cn(libraryRowClass, selectedIds.macros === macro.id && selectedLibraryRowClass)}>
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
                          <span class="seq-key">{displayCode(step)}</span>
                          {#if index < macro.sequence.length - 1}<span class="seq-arrow">-&gt;</span>{/if}
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
                <div class={cn(libraryRowClass, selectedIds.combos === combo.id && selectedLibraryRowClass)}>
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
                          <span class="seq-key">{keyLabel}</span>
                          {#if index < combo.keys.length - 1}<span class="seq-arrow">+</span>{/if}
                        {/each}
                      {/if}
                      <span class="seq-arrow">-&gt;</span>
                      {#if combo.binding}
                        <span class="seq-key added-key">{displayCode(combo.binding)}</span>
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
              <div class={cn(libraryRowClass, selectedIds.tapDance === dance.id && selectedLibraryRowClass)}>
                <button type="button" class={rowMainClass} onclick={() => selectItem(dance.id)}>
                  <span class={rowTitleClass}>
                    <strong class={titleTextClass}>{tapDanceSourceLabel(dance)}</strong>
                    <Chip>{isCompleteTapDance(dance) ? "tap dance" : "unassigned"}</Chip>
                  </span>
                  <span class={tapGridClass}>
                    <span class={tapCellClass}><small class={tapLabelClass}>Tap</small><b class="seq-key">{codeLabel(dance.tap, "Set tap")}</b></span>
                    <span class={tapCellClass}><small class={tapLabelClass}>Hold</small><b class="seq-key">{codeLabel(dance.hold, "Set hold")}</b></span>
                    <span class={tapCellClass}><small class={tapLabelClass}>Double</small><b class="seq-key">{codeLabel(dance.doubleTap, "Set double")}</b></span>
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
            <span class="field-label">Name</span>
            <input
              class={libraryInputClass}
              value={selectedMacro.name}
              placeholder="Name this macro"
              oninput={(event) => workbench.updateMacro(selectedMacro.id, { name: inputValue(event) })}
            />
          </label>

          <label class={fieldClass}>
            <span class="field-label">Trigger note</span>
            <input
              class={libraryInputClass}
              value={selectedMacro.trigger}
              oninput={(event) =>
                workbench.updateMacro(selectedMacro.id, { trigger: inputValue(event) })}
            />
          </label>

          <label class={fieldClass}>
            <span class="field-label">Sequence</span>
            <input
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
                <span class="seq-key">{displayCode(step)}</span>
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
            <span class="field-label">Name</span>
            <input
              class={libraryInputClass}
              value={selectedCombo.name}
              placeholder="Name this combo"
              oninput={(event) => workbench.updateCombo(selectedCombo.id, { name: inputValue(event) })}
            />
          </label>

          <label class={fieldClass}>
            <span class="field-label">Output</span>
            <input
              class={monoInputClass}
              spellcheck="false"
              value={selectedCombo.binding}
              placeholder="KC_ESC"
              oninput={(event) =>
                workbench.updateCombo(selectedCombo.id, { binding: inputValue(event) })}
            />
          </label>

          <div class={fieldClass}>
            <span class="field-label">Layers</span>
            <div class={choiceRowClass}>
              <button
                type="button"
                class={cn(choiceButtonClass, !selectedCombo.layerIds?.length && choiceSelectedClass)}
                aria-pressed={!selectedCombo.layerIds?.length}
                onclick={() => setComboLayerScope(selectedCombo, undefined)}
              >
                All
              </button>
              {#each workbench.profile.layers as layer (layer.id)}
                <button
                  type="button"
                  class={cn(choiceButtonClass, comboUsesLayer(selectedCombo, layer.id) && choiceSelectedClass)}
                  aria-pressed={comboUsesLayer(selectedCombo, layer.id)}
                  onclick={() => toggleComboLayer(selectedCombo, layer.id)}
                >
                  {layer.name}
                </button>
              {/each}
            </div>
          </div>

          <div class={fieldClass}>
            <span class="field-label">Members</span>
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
            <span class="field-label">Source key</span>
            <select
              class={libraryInputClass}
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
            <span class="field-label">Tap</span>
            <input
              class={monoInputClass}
              spellcheck="false"
              value={selectedTapDance.tap}
              placeholder="KC_ESC"
              oninput={(event) =>
                workbench.updateTapDance(selectedTapDance.id, { tap: inputValue(event) })}
            />
          </label>

          <label class={fieldClass}>
            <span class="field-label">Hold</span>
            <input
              class={monoInputClass}
              spellcheck="false"
              value={selectedTapDance.hold}
              placeholder="KC_LCTL"
              oninput={(event) =>
                workbench.updateTapDance(selectedTapDance.id, { hold: inputValue(event) })}
            />
          </label>

          <label class={fieldClass}>
            <span class="field-label">Double tap</span>
            <input
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
