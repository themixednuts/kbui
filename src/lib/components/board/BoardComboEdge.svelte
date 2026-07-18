<script lang="ts">
  import { BaseEdge, type EdgeProps } from "@xyflow/svelte";

  import type { BoardComboEdge } from "./board-flow";

  let { id, data, interactionWidth }: EdgeProps<BoardComboEdge> = $props();
  const edgeData = $derived(data!);
</script>

<title>{edgeData.title}</title>
<BaseEdge
  {id}
  path={edgeData.path}
  class="combo-connector-line"
  interactionWidth={interactionWidth ?? 14}
/>
