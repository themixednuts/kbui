<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import {
    cloneDevice,
    sampleKeyboard,
  } from "$lib/keyboard/schema";
  import { splitDemoKeyboard } from "$lib/keyboard/sample-boards";

  import KeyboardBoard from "./KeyboardBoard.svelte";

  const { Story } = defineMeta({
    title: "Board/KeyboardBoard",
    component: KeyboardBoard,
    tags: ["autodocs"],
  });

  const keysProfile = cloneDevice(sampleKeyboard);

  const lightingProfile = cloneDevice(sampleKeyboard);
  lightingProfile.lighting.keys = {
    "k0-0": { hue: 32, saturation: 85, brightness: 72 },
    "k1-1": { hue: 305, saturation: 62, brightness: 76 },
    "k1-2": { hue: 305, saturation: 62, brightness: 76 },
    "k1-3": { hue: 305, saturation: 62, brightness: 76 },
    "k2-4": { hue: 195, saturation: 72, brightness: 72 },
    "k2-7": { hue: 195, saturation: 72, brightness: 72 },
    "k3-0": { hue: 32, saturation: 85, brightness: 72 },
    "k4-3": { hue: 90, saturation: 60, brightness: 82 },
    "k4-4": { hue: 174, saturation: 76, brightness: 0 },
  };

  const splitProfile = cloneDevice(splitDemoKeyboard);
</script>

<Story name="Keys Lens">
  {#snippet template()}
    <div class="story-board h-[520px] w-[min(1120px,100%)] overflow-hidden rounded-kb-3 border border-line bg-paper">
      <KeyboardBoard
        profile={keysProfile}
        activeLayer="base"
        lens="keys"
        selection={["k1-1"]}
        marked={["k1-2"]}
      />
    </div>
  {/snippet}
</Story>

<Story name="Lighting Lens">
  {#snippet template()}
    <div class="story-board h-[520px] w-[min(1120px,100%)] overflow-hidden rounded-kb-3 border border-line bg-paper">
      <KeyboardBoard
        profile={lightingProfile}
        activeLayer="base"
        lens="lighting"
        selection={["k0-0", "k1-1", "k1-2", "k4-4"]}
      />
    </div>
  {/snippet}
</Story>

<Story name="Split Layout">
  {#snippet template()}
    <div
      class="story-board split h-[440px] w-[min(1120px,100%)] overflow-hidden rounded-kb-3 border border-line bg-paper"
    >
      <KeyboardBoard
        profile={splitProfile}
        activeLayer="base"
        lens="keys"
        selection={["s1-3"]}
        marked={["s1-6"]}
      />
    </div>
  {/snippet}
</Story>
