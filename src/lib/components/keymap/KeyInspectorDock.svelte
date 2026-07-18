<script lang="ts">
  import type { Snippet } from "svelte";

  import * as Resizable from "$lib/components/ui/resizable/index.js";

  type Props = {
    main: Snippet;
    children: Snippet;
    chromeLabel?: string;
    rgbMode?: boolean;
  };

  let { main, children, chromeLabel = "Key inspector", rgbMode = false }: Props = $props();

  const inspectorDefaultSize = $derived(rgbMode ? 34 : 30);
  const inspectorMinSize = $derived(rgbMode ? 24 : 20);
  const paneAutoSaveId = $derived(
    rgbMode ? "workbench.key-inspector.dock.rgb" : "workbench.key-inspector.dock.v1",
  );
</script>

<Resizable.PaneGroup
  direction="vertical"
  autoSaveId={paneAutoSaveId}
  class="keymap-dock-pane-group min-h-0 min-w-0 flex-1"
>
  <Resizable.Pane
    defaultSize={100 - inspectorDefaultSize}
    minSize={28}
    class="keymap-main-pane min-h-0 [&>.editor-main]:h-full"
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
    maxSize={70}
    class="key-inspector-dock-pane min-h-0 overflow-hidden"
  >
    <aside
      class="split-inspector-dock flex h-full min-h-0 min-w-0 border-t border-line bg-surface px-kb-22 pt-kb-10 pb-kb-12 shadow-[0_-18px_44px_-34px_rgba(31,33,31,0.32)] max-[640px]:p-kb-12"
      aria-label={chromeLabel}
    >
      <div class="key-inspector-body flex min-h-0 min-w-0 flex-1">
        {@render children()}
      </div>
    </aside>
  </Resizable.Pane>
</Resizable.PaneGroup>
