<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import {
    cloneDevice,
    sampleKeyboard,
    type DeviceProfile,
    type KeyBinding,
    type KeyboardKey,
  } from "$lib/keyboard/schema";

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

  const splitProfile = createSplitProfile();

  function createSplitProfile(): DeviceProfile {
    const keys: KeyboardKey[] = [
      ...splitRow(0, ["Q", "W", "E", "R", "T"], ["Y", "U", "I", "O", "P"]),
      ...splitRow(1, ["A", "S", "D", "F", "G"], ["H", "J", "K", "L", ";"], {
        homing: new Set(["F", "J"]),
      }),
      ...splitRow(2, ["Z", "X", "C", "V", "B"], ["N", "M", ",", ".", "/"]),
      splitKey("s3-3", "Esc", 3, 3, 3, { width: 1, homing: false }),
      splitKey("s3-4", "Spc", 3, 4, 4, { width: 1, homing: false }),
      splitKey("s3-5", "Ent", 3, 5, 7, { width: 1, homing: false }),
      splitKey("s3-6", "Bsp", 3, 6, 8, { width: 1, homing: false }),
    ];
    const baseBindings = Object.fromEntries(
      keys.map((key) => [key.id, { code: keycodeForLegend(key.label) } satisfies KeyBinding]),
    );
    const navBindings = Object.fromEntries(keys.map((key) => [key.id, { code: "KC_TRNS" }]));
    navBindings["s1-5"] = { code: "KC_LEFT" };
    navBindings["s1-6"] = { code: "KC_DOWN" };
    navBindings["s1-7"] = { code: "KC_UP" };
    navBindings["s1-8"] = { code: "KC_RGHT" };

    return {
      ...cloneDevice(sampleKeyboard),
      id: "corney-split-34-story",
      name: "Corney Split 34",
      vendor: "Klakson Labs",
      firmware: "zmk",
      protocol: "zmk-studio",
      firmwareVersion: "ZMK Studio demo",
      matrix: { rows: 4, cols: 10 },
      keys,
      layers: [
        {
          id: "base",
          name: "Base",
          color: "var(--ink)",
          bindings: baseBindings,
        },
        {
          id: "nav",
          name: "Nav",
          color: "var(--teal)",
          bindings: navBindings,
        },
      ],
      combos: [
        {
          id: "split-home-combo",
          name: "Home Row Escape",
          keys: ["s1-3", "s1-6"],
          binding: "KC_ESC",
        },
      ],
      lighting: {
        mode: "solid",
        hue: 174,
        saturation: 72,
        brightness: 78,
        speed: 40,
        keys: {
          "s1-3": { hue: 195, saturation: 72, brightness: 72 },
          "s1-6": { hue: 195, saturation: 72, brightness: 72 },
          "s3-4": { hue: 90, saturation: 62, brightness: 82 },
          "s3-5": { hue: 90, saturation: 62, brightness: 82 },
        },
      },
      settings: {
        ...sampleKeyboard.settings,
        splitTransport: "ble",
      },
    };
  }

  function splitRow(
    row: number,
    left: string[],
    right: string[],
    options: { homing?: Set<string> } = {},
  ): KeyboardKey[] {
    return [
      ...left.map((label, col) =>
        splitKey(`s${row}-${col}`, label, row, col, col, {
          homing: options.homing?.has(label) ?? false,
        }),
      ),
      ...right.map((label, offset) =>
        splitKey(`s${row}-${offset + 5}`, label, row, offset + 5, offset + 7, {
          homing: options.homing?.has(label) ?? false,
        }),
      ),
    ];
  }

  function splitKey(
    id: string,
    label: string,
    row: number,
    col: number,
    x: number,
    options: { width?: number; homing?: boolean } = {},
  ): KeyboardKey {
    return {
      id,
      label,
      row,
      col,
      x,
      y: row,
      width: options.width ?? 1,
      homing: options.homing || undefined,
    };
  }

  function keycodeForLegend(label: string) {
    const aliases: Record<string, string> = {
      ";": "KC_SCLN",
      ",": "KC_COMM",
      ".": "KC_DOT",
      "/": "KC_SLSH",
      Esc: "LT(1,KC_ESC)",
      Spc: "LT(1,KC_SPC)",
      Ent: "LT(1,KC_ENT)",
      Bsp: "KC_BSPC",
    };
    return aliases[label] ?? `KC_${label}`;
  }
</script>

<Story name="Keys Lens">
  {#snippet template()}
    <div class="story-board">
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
    <div class="story-board">
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
    <div class="story-board split">
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

<style>
  .story-board {
    width: min(1120px, 100%);
    height: 520px;
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: var(--r-3);
    background: var(--paper);
  }

  .story-board.split {
    height: 440px;
  }
</style>
