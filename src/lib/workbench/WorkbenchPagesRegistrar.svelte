<script lang="ts">
  import type { Snippet } from "svelte";
  import { registerWorkbenchPages, type WorkbenchPages } from "./context";

  let { pages, children }: { pages: WorkbenchPages; children: Snippet } = $props();

  registerWorkbenchPages({
    keymap: () => pages.keymap(),
    logic: () => pages.logic(),
    lighting: () => pages.lighting(),
    versioning: () => pages.versioning(),
    firmware: () => pages.firmware(),
  });
</script>

{@render children()}
