<script lang="ts">
  import { Code, Keyboard, Plus, SlidersHorizontal, X } from "@lucide/svelte";
  import type { DeviceProfile, KeyBinding, KeyboardKey } from "$lib/keyboard/schema";
  import type { LogicBindingOption } from "$lib/keyboard/logic-bindings";
  import type { InspectorTab } from "$lib/workbench/url-search";
  import { Button, Input, SegmentedNav, SliderField } from "$lib/components/ui";
  import { Label } from "$lib/components/ui/label/index.js";
  import KeyBindingLogicPicker from "$lib/components/keymap/KeyBindingLogicPicker.svelte";

  type RenderedBinding = KeyBinding & {
    display: string;
    keycap: string;
  };

  type Props = {
    selectedKeyId: string;
    selectedKey?: KeyboardKey;
    selectedLayerName: string;
    selectedBinding: KeyBinding;
    selectedRenderedBinding: RenderedBinding;
    inspectorTab: InspectorTab;
    sourceSnippet: string;
    tappingTerm: DeviceProfile["settings"]["tappingTerm"];
    quickPickCodes: string[];
    logicBindings: LogicBindingOption[];
    bindLink: string;
    behaviorLink: string;
    sourceLink: string;
    displayCode: (code: string) => string;
    capLegend: (binding: RenderedBinding) => string;
    bindingCode: () => string;
    onClearSelection: () => void;
    onInspectorEscape: (event: KeyboardEvent) => void;
    onSetCode: (code: string) => boolean;
    onSetHoldTap: (kind: "tap" | "hold", value: string) => boolean;
    onBindLogic: (item: LogicBindingOption) => void;
    onAddMacroFromKey: () => void;
    onTappingTermChange: (value: number) => void;
  };

  let {
    selectedKeyId,
    selectedKey,
    selectedLayerName,
    selectedBinding,
    selectedRenderedBinding,
    inspectorTab,
    sourceSnippet,
    tappingTerm,
    quickPickCodes,
    logicBindings,
    bindLink,
    behaviorLink,
    sourceLink,
    displayCode,
    capLegend,
    bindingCode,
    onClearSelection,
    onInspectorEscape,
    onSetCode,
    onSetHoldTap,
    onBindLogic,
    onAddMacroFromKey,
    onTappingTermChange,
  }: Props = $props();

  function clearSelectionFromToolbar(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    onClearSelection();
  }
</script>

{#if !selectedKeyId}
  <div class="ki-empty">
    <Keyboard size={22} strokeWidth={1.5} aria-hidden="true" />
    <p>Select a key on the keymap to edit its binding.</p>
    <span class="ki-empty-hint">Press <kbd>Esc</kbd> to deselect.</span>
  </div>
{:else if !selectedKey}
  <div class="ki-empty">
    <p>That key is no longer on this layout.</p>
    <Button variant="ghost" size="sm" onclick={onClearSelection}>Deselect</Button>
  </div>
{:else}
  <div class="ki-shell">
    <header class="ki-toolbar">
      <div class="ki-identity">
        <div class="ki-cap" aria-hidden="true">{capLegend(selectedRenderedBinding)}</div>
        <div class="ki-identity-copy">
          <p class="ki-meta">{selectedLayerName} · R{selectedKey.row} C{selectedKey.col}</p>
          <p class="ki-title">{displayCode(selectedBinding.code)}</p>
          <p class="ki-code">{selectedBinding.code}</p>
        </div>
      </div>
      <div class="ki-toolbar-actions">
        <Button
          variant="ghost"
          size="sm"
          class="ki-icon-btn"
          onclick={onAddMacroFromKey}
          title="New macro from this key"
          aria-label="New macro from this key"
        >
          <Plus size={15} />
          <span class="ki-action-label">Macro</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          class="ki-icon-btn"
          type="button"
          onclick={clearSelectionFromToolbar}
          title="Deselect (Esc)"
          aria-label="Deselect key"
        >
          <X size={15} />
          <span class="ki-action-label">Esc</span>
        </Button>
      </div>
    </header>

    <SegmentedNav
      items={[
        { value: "binding", label: "Bind", href: bindLink, icon: Keyboard, title: "Keycode and workspace logic" },
        { value: "behavior", label: "Hold-Tap", href: behaviorLink, icon: SlidersHorizontal, title: "Hold vs tap" },
        { value: "source", label: "Source", href: sourceLink, icon: Code, title: "Generated firmware snippet" },
      ]}
      value={inspectorTab}
      ariaLabel="Key inspector mode"
      class="ki-tabs"
    />

    <div class="ki-scroll">
      {#if inspectorTab === "binding"}
        <div class="ki-bind-layout">
          <section class="ki-block">
            <Label for="binding-keycode-input" class="ki-label">Keycode</Label>
            <Input
              id="binding-keycode-input"
              data-testid="binding-keycode-input"
              class="font-mono text-sm"
              value={selectedBinding.code}
              spellcheck={false}
              autocomplete="off"
              onkeydown={onInspectorEscape}
              oninput={(event) => {
                if (!onSetCode(event.currentTarget.value)) {
                  event.currentTarget.value = bindingCode();
                }
              }}
            />

            <span class="ki-label ki-label-spaced">Common</span>
            <div class="ki-pill-row">
              {#each quickPickCodes as code (code)}
                <button
                  type="button"
                  class="ki-pill"
                  class:ki-pill-active={selectedBinding.code === code}
                  onclick={() => onSetCode(code)}
                >
                  {displayCode(code)}
                </button>
              {/each}
            </div>
          </section>

          <section class="ki-block ki-logic-block">
            <span class="ki-label">Workspace logic</span>
            <KeyBindingLogicPicker
              items={logicBindings}
              activeCode={selectedBinding.code}
              onBind={onBindLogic}
            />
          </section>
        </div>
      {:else if inspectorTab === "behavior"}
        <div class="ki-stack">
          <div class="ki-field">
            <Label for="binding-tap-input" class="ki-label">Tap</Label>
            <Input
              id="binding-tap-input"
              class="font-mono text-sm"
              value={selectedBinding.tap ?? ""}
              placeholder="Same as keycode"
              spellcheck={false}
              onkeydown={onInspectorEscape}
              oninput={(event) => {
                if (!onSetHoldTap("tap", event.currentTarget.value)) {
                  event.currentTarget.value = selectedBinding.tap ?? "";
                }
              }}
            />
          </div>
          <div class="ki-field">
            <Label for="binding-hold-input" class="ki-label">Hold</Label>
            <Input
              id="binding-hold-input"
              class="font-mono text-sm"
              value={selectedBinding.hold ?? ""}
              placeholder="Optional hold action"
              spellcheck={false}
              onkeydown={onInspectorEscape}
              oninput={(event) => {
                if (!onSetHoldTap("hold", event.currentTarget.value)) {
                  event.currentTarget.value = selectedBinding.hold ?? "";
                }
              }}
            />
          </div>
          <SliderField
            label="Tapping term"
            value={tappingTerm}
            min={100}
            max={300}
            suffix="ms"
            compact
            onValueChange={onTappingTermChange}
          />
          <p class="ki-hint">Global setting — tap dance uses this too.</p>
        </div>
      {:else}
        <pre class="ki-source">{sourceSnippet}</pre>
      {/if}
    </div>
  </div>
{/if}

<style>
  .ki-shell {
    container-type: size;
    container-name: inspector;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
    flex: 1;
    height: 100%;
  }

  .ki-toolbar {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    flex: none;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--line-2);
  }

  .ki-identity {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .ki-cap {
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    flex: none;
    border: 1px solid rgba(24, 22, 20, 0.16);
    border-radius: 9px;
    background: linear-gradient(180deg, #fffcf5 0%, #ece3cf 100%);
    box-shadow: var(--shadow-cap);
    font-family: var(--mono);
    font-size: 15px;
    font-weight: 600;
    line-height: 1;
  }

  .ki-identity-copy {
    min-width: 0;
  }

  .ki-meta {
    margin: 0;
    color: var(--ink-3);
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .ki-title {
    margin: 1px 0 0;
    font-family: var(--mono);
    font-size: 17px;
    font-weight: 600;
    line-height: 1.15;
  }

  .ki-code {
    margin: 1px 0 0;
    color: var(--ink-3);
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.03em;
  }

  .ki-toolbar-actions {
    display: flex;
    flex: none;
    gap: 2px;
  }

  .ki-toolbar-actions :global(.ki-icon-btn) {
    padding-inline: 8px;
  }

  .ki-action-label {
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.04em;
  }

  :global(.key-inspector .ki-tabs) {
    display: flex !important;
    width: 100%;
    flex: none;
  }

  :global(.key-inspector .ki-tabs > a),
  :global(.key-inspector .ki-tabs > button) {
    flex: 1;
    justify-content: center;
    min-width: 0;
    padding-inline: 8px;
  }

  .ki-scroll {
    flex: 1;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-right: 2px;
  }

  .ki-bind-layout {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .ki-block {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }

  .ki-logic-block {
    padding-top: 14px;
    border-top: 1px solid var(--line-2);
  }

  .ki-stack {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .ki-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .ki-label {
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-3);
  }

  .ki-label-spaced {
    margin-top: 4px;
  }

  .ki-pill-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .ki-pill {
    min-height: 28px;
    padding: 4px 10px;
    border: 1px solid transparent;
    border-radius: 999px;
    background: var(--paper-2);
    color: var(--ink-2);
    font-family: var(--mono);
    font-size: 11px;
    transition:
      border-color 120ms ease,
      background 120ms ease,
      color 120ms ease;
  }

  .ki-pill:hover {
    border-color: var(--line-2);
  }

  .ki-pill-active {
    border-color: var(--coral);
    background: var(--coral);
    color: #1c0a04;
  }

  .ki-hint {
    margin: 0;
    color: var(--ink-3);
    font-size: 11px;
    line-height: 1.4;
  }

  .ki-source {
    overflow: auto;
    margin: 0;
    padding: 12px 14px;
    border-radius: 10px;
    background: var(--ink);
    color: var(--paper);
    font-family: var(--mono);
    font-size: 11px;
    line-height: 1.55;
  }

  .ki-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 120px;
    padding: 16px;
    color: var(--ink-3);
    text-align: center;
  }

  .ki-empty p {
    margin: 0;
    font-size: 14px;
  }

  .ki-empty-hint {
    font-family: var(--mono);
    font-size: 11px;
  }

  .ki-empty kbd,
  .ki-empty-hint kbd {
    padding: 1px 6px;
    border: 1px solid var(--line-2);
    border-radius: 4px;
    background: var(--paper-2);
    font-family: var(--mono);
    font-size: 10px;
  }

  /* Side-by-side only when the inspector pane is both wide and tall */
  @container inspector (min-width: 520px) and (min-height: 460px) {
    .ki-bind-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 16px;
      align-items: start;
    }

    .ki-logic-block {
      padding-top: 0;
      border-top: none;
      padding-left: 14px;
      border-left: 1px solid var(--line-2);
    }
  }

  @container inspector (max-width: 320px) {
    .ki-action-label {
      display: none;
    }

    :global(.key-inspector .ki-tabs [data-label]) {
      display: none;
    }
  }
</style>
