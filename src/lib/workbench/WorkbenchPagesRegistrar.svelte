<script lang="ts">
  import type { Snippet } from "svelte";
  import { registerWorkbenchPages, type WorkbenchPages } from "./context";

  let { pages, children }: { pages: WorkbenchPages; children: Snippet } = $props();

  registerWorkbenchPages(pages);
</script>

{@render children()}
