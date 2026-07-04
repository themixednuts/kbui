import { describe, expect, it } from "vite-plus/test";

import {
  firmwareSourceHash,
  generateFirmwareArtifacts,
  generateQmkKeymapJson,
  generateQmkSourceBundle,
  generateZmkSource,
  type FirmwareGeneratedFile,
} from "./firmware-source";
import { defaultSampleKeyboard, splitDemoKeyboard } from "./sample-boards";
import { cloneDevice, type DeviceProfile } from "./schema";

type QmkProfileWithMetadata = DeviceProfile & {
  qmk: {
    keyboard: string;
    keyOrder: string[];
    layout: string;
  };
};

function matrixOrder(profile: DeviceProfile) {
  return [...profile.keys]
    .sort((left, right) => left.row - right.row || left.col - right.col)
    .map((key) => key.id);
}

function qmkProfileWithMetadata(profile = defaultSampleKeyboard): QmkProfileWithMetadata {
  const next = cloneDevice(profile) as QmkProfileWithMetadata;
  next.qmk = {
    keyboard: "klakson/wb65",
    keyOrder: matrixOrder(next),
    layout: "LAYOUT",
  };
  return next;
}

function sourceByRole(
  files: readonly FirmwareGeneratedFile[],
  role: FirmwareGeneratedFile["role"],
) {
  return files.find((file) => file.role === role)?.content ?? "";
}

describe("firmware source generation", () => {
  it("generates QMK Configurator keymap JSON with ordered layers and canonical keycodes", () => {
    const profile = qmkProfileWithMetadata();
    profile.macros = [];
    profile.combos = [];
    profile.tapDances = [];
    profile.keyOverrides = [];
    profile.layers = profile.layers.slice(0, 2).map((layer, layerIndex) =>
      layerIndex === 1
        ? {
            ...layer,
            bindings: Object.fromEntries(
              Object.keys(layer.bindings).map((keyId) => [
                keyId,
                { code: keyId === "k0-0" ? "QK_BOOT" : "KC_TRNS" },
              ]),
            ),
          }
        : layer,
    );

    const generated = generateQmkKeymapJson(profile);

    expect(generated.keymap).toMatchObject({
      keyboard: "klakson/wb65",
      keymap: "workbench_65",
      layout: "LAYOUT",
    });
    expect(generated.keymap.layers).toHaveLength(profile.layers.length);
    expect(generated.keymap.layers[0][0]).toBe("KC_ESC");
    expect(generated.keymap.layers[0][4]).toBe("KC_4");
    expect(generated.keymap.layers[0]).toContain("MO(1)");
    expect(generated.keymap.layers[1][0]).toBe("QK_BOOTLOADER");
    expect(generated.diagnostics.some((item) => item.severity === "error")).toBe(false);
  });

  it("generates a QMK full-source skeleton for advanced logic and marks unsupported gaps", () => {
    const profile = qmkProfileWithMetadata();
    const generated = generateQmkSourceBundle(profile);
    const keymap = sourceByRole(generated.files, "qmk-keymap-c");
    const rules = sourceByRole(generated.files, "qmk-rules-mk");

    expect(keymap).toContain("const uint16_t PROGMEM keymaps[][MATRIX_ROWS][MATRIX_COLS]");
    expect(keymap).toContain("case QK_MACRO_0");
    expect(keymap).toContain("const uint16_t PROGMEM combo_esc_keys[]");
    expect(keymap).toContain("ACTION_TAP_DANCE_DOUBLE(KC_ESC, KC_CAPS)");
    expect(keymap).toContain("UNSUPPORTED: hold KC_LCTL");
    expect(keymap).toContain("ko_make_basic(MOD_MASK_SHIFT, KC_BSPC, KC_DEL)");
    expect(rules).toContain("COMBO_ENABLE = yes");
    expect(rules).toContain("TAP_DANCE_ENABLE = yes");
    expect(rules).toContain("KEY_OVERRIDE_ENABLE = yes");
    expect(generated.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining(["qmk.macros.sequence_semantics", "qmk.tap_dance.hold_unsupported"]),
    );
  });

  it("generates ZMK keymap, conf, and build yaml skeletons", () => {
    const profile = cloneDevice(splitDemoKeyboard);
    const generated = generateZmkSource(profile);
    const keymap = sourceByRole(generated.files, "zmk-keymap");
    const conf = sourceByRole(generated.files, "zmk-conf");
    const build = sourceByRole(generated.files, "zmk-build-yaml");

    expect(keymap).toContain('compatible = "zmk,keymap"');
    expect(keymap).toContain("&kp Q");
    expect(keymap).toContain("&lt 1 ESC");
    expect(keymap).toContain("key-positions = <13 16>;");
    expect(conf).toContain("CONFIG_ZMK_STUDIO=y");
    expect(conf).toContain("CONFIG_BT=y");
    expect(build).toContain("board: <zmk-board>");
    expect(build).toContain("shield: <zmk-shield>");
  });

  it("flags missing board metadata instead of guessing compile targets", () => {
    const qmk = generateFirmwareArtifacts(defaultSampleKeyboard);
    const zmk = generateFirmwareArtifacts(splitDemoKeyboard);

    expect(qmk.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "qmk.metadata.keyboard_missing",
        "qmk.metadata.layout_missing",
        "qmk.metadata.key_order_missing",
      ]),
    );
    expect(qmk.buildCommand).toBe("qmk compile -kb <qmk-keyboard> -km workbench_65");

    expect(zmk.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "zmk.metadata.board_missing",
        "zmk.metadata.shield_missing",
        "zmk.metadata.key_order_missing",
      ]),
    );
    expect(zmk.buildCommand).toBe("west build -b <zmk-board> -- -DSHIELD=<zmk-shield>");
  });

  it("returns artifact sets and manual commands for the active firmware family", () => {
    const qmkSimple = qmkProfileWithMetadata();
    qmkSimple.macros = [];
    qmkSimple.combos = [];
    qmkSimple.tapDances = [];
    qmkSimple.keyOverrides = [];
    qmkSimple.layers = [qmkSimple.layers[0]];

    const qmk = generateFirmwareArtifacts(qmkSimple);
    expect(qmk.target).toBe("qmk");
    expect(qmk.artifacts.map((file) => file.path)).toEqual([
      "qmk/keymap.json",
      "qmk/keymaps/workbench_65/keymap.c",
      "qmk/keymaps/workbench_65/config.h",
      "qmk/keymaps/workbench_65/rules.mk",
    ]);
    expect(qmk.buildCommand).toBe("qmk compile qmk/keymap.json");

    const zmk = generateFirmwareArtifacts(splitDemoKeyboard);
    expect(zmk.target).toBe("zmk");
    expect(zmk.artifacts.map((file) => file.role)).toEqual([
      "zmk-keymap",
      "zmk-conf",
      "zmk-build-yaml",
    ]);

    expect(qmk.sourceHash).toBe(firmwareSourceHash(qmk.artifacts));
    expect(generateFirmwareArtifacts(qmkSimple).sourceHash).toBe(qmk.sourceHash);
  });
});
