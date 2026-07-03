<script lang="ts">
  import { browser } from "$app/environment";
  import { PanelRightClose, PanelRightOpen } from "@lucide/svelte";
  import type { PaneAPI } from "paneforge";
  import type { Snippet } from "svelte";
  import * as Resizable from "$lib/components/ui/resizable/index.js";

  type Props = {
    main: Snippet;
    children: Snippet;
    chromeLabel?: string;
    /** Larger inspector split when painting RGB (especially on stacked mobile layout). */
    rgbMode?: boolean;
  };

  let { main, children, chromeLabel = "Key inspector", rgbMode = false }: Props = $props();

  let inspectorPane: PaneAPI | undefined = $state();
  let collapsed = $state(false);
  let narrow = $state(false);

  const inspectorDefaultSize = $derived(narrow ? (rgbMode ? 38 : 28) : rgbMode ? 30 : 30);
  const inspectorMinSize = $derived(narrow ? (rgbMode ? 24 : 20) : rgbMode ? 18 : 22);
  const inspectorMaxSize = $derived(narrow ? (rgbMode ? 72 : 68) : 64);
  const paneAutoSaveId = $derived(rgbMode ? "workbench.key-inspector.rgb" : "workbench.key-inspector.v2");

  if (browser) {
    const mq = window.matchMedia("(max-width: 980px)");
    narrow = mq.matches;
    mq.addEventListener("change", (event) => {
      narrow = event.matches;
    });
  }
</script>

<Resizable.PaneGroup
  direction={narrow ? "vertical" : "horizontal"}
  autoSaveId={paneAutoSaveId}
  class="keymap-pane-group"
>
  <Resizable.Pane
    defaultSize={100 - inspectorDefaultSize}
    minSize={narrow ? (rgbMode ? 28 : 32) : 30}
    class="keymap-main-pane"
  >
    {@render main()}
  </Resizable.Pane>

  <Resizable.Handle
    withHandle
    class="keymap-inspector-handle"
    title="Resize key inspector"
    aria-label="Resize key inspector"
  />

  <Resizable.Pane
    defaultSize={inspectorDefaultSize}
    minSize={inspectorMinSize}
    maxSize={inspectorMaxSize}
    collapsible={!narrow}
    collapsedSize={0}
    bind:this={inspectorPane}
    onCollapse={() => (collapsed = true)}
    onExpand={() => (collapsed = false)}
    class="key-inspector-pane"
  >
    <aside class="key-inspector" aria-label="Key inspector">
      <div class="inspector-chrome">
          <span class="inspector-chrome-label">{chromeLabel}</span>
        {#if !narrow}
          <button
            type="button"
            class="inspector-collapse-btn"
            title="Collapse key inspector"
            aria-label="Collapse key inspector"
            onclick={() => inspectorPane?.collapse()}
          >
            <PanelRightClose size={16} aria-hidden="true" />
          </button>
        {/if}
      </div>
      <div class="key-inspector-body">
        {@render children()}
      </div>
    </aside>
  </Resizable.Pane>
</Resizable.PaneGroup>

{#if collapsed && !narrow}
  <button
    type="button"
    class="inspector-expand-tab"
    title="Open key inspector"
    aria-label="Open key inspector"
    onclick={() => inspectorPane?.expand()}
  >
    <PanelRightOpen size={16} aria-hidden="true" />
  </button>
{/if}
