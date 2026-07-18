<script lang="ts">
  import type { Snippet } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import * as Resizable from "$lib/components/ui/resizable/index.js";

  type Props = {
    main: Snippet;
    children: Snippet;
    /** Larger inspector split when painting RGB (especially on stacked mobile layout). */
    rgbMode?: boolean;
  };

  let { main, children, rgbMode = false }: Props = $props();

  const narrowQuery = new MediaQuery("(max-width: 980px)", false);
  const narrow = $derived(narrowQuery.current);

  const inspectorDefaultSize = $derived(narrow ? (rgbMode ? 38 : 28) : rgbMode ? 30 : 30);
  const inspectorMinSize = $derived(narrow ? (rgbMode ? 24 : 20) : rgbMode ? 18 : 22);
  const inspectorMaxSize = $derived(narrow ? (rgbMode ? 72 : 68) : 64);
</script>

<Resizable.PaneGroup
  direction={narrow ? "vertical" : "horizontal"}
  class="keymap-pane-group min-h-0 min-w-0 flex-1"
>
  <Resizable.Pane
    defaultSize={100 - inspectorDefaultSize}
    minSize={narrow ? (rgbMode ? 28 : 32) : 30}
    class="keymap-main-pane min-h-0 min-w-0 overflow-hidden"
  >
    {@render main()}
  </Resizable.Pane>

  <Resizable.Handle
    class="keymap-inspector-handle z-[3] flex-none"
    title="Resize key inspector"
    aria-label="Resize key inspector"
  />

  <Resizable.Pane
    defaultSize={inspectorDefaultSize}
    minSize={inspectorMinSize}
    maxSize={inspectorMaxSize}
    class="key-inspector-pane flex min-h-0 min-w-[300px] flex-col overflow-hidden bg-surface max-[980px]:min-w-0"
  >
    <aside
      class="key-inspector relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-l border-line bg-surface max-[980px]:border-t max-[980px]:border-l-0"
      aria-label="Key inspector"
    >
      <div class="key-inspector-body relative z-[1] flex min-h-0 flex-1 flex-col gap-kb-14 overflow-auto p-kb-16">
        {@render children()}
      </div>
    </aside>
  </Resizable.Pane>
</Resizable.PaneGroup>
