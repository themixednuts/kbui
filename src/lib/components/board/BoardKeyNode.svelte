<script lang="ts">
  import type { NodeProps } from "@xyflow/svelte";

  import Keycap from "./Keycap.svelte";
  import { getBoardFlowRuntime, type BoardKeyNode } from "./board-flow";

  let { data }: NodeProps<BoardKeyNode> = $props();
  const runtime = getBoardFlowRuntime();
</script>

<div class="board-key-node relative h-full w-full">
  <Keycap
    cap={data.cap}
    compact={runtime.compact}
    flowManaged
    lens={runtime.lens}
    comboMarker={runtime.comboMarker}
    layerMarker={runtime.layerMarker}
    onSelectKey={runtime.onSelectKey}
    onToggleKey={runtime.onToggleKey}
    onKeyPointerEnter={runtime.onKeyPointerEnter}
    onKeyPointerLeave={runtime.onKeyPointerLeave}
  />
</div>
