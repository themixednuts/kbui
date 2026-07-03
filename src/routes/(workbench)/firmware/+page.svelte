<script lang="ts">
  import { getWorkbenchPages } from "$lib/workbench/context";

  const pages = getWorkbenchPages();
</script>

{@render pages.firmware()}
