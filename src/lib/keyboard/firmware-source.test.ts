import { describe, expect, it } from "vite-plus/test";

import {
  firmwareDiagnosticKey,
  firmwareSourceHash,
  generateFirmwareArtifacts,
  generateQmkKeymapJson,
  generateQmkSourceBundle,
  generateZmkSource,
  type FirmwareGeneratedFile,
} from "./firmware-source";
import { defaultSampleKeyboard, splitDemoKeyboard } from "./sample-boards";
import { cloneDevice, type DeviceProfile } from "./schema";

function matrixOrder(profile: DeviceProfile) {
  return [...profile.keys]
    .sort((left, right) => left.row - right.row || left.col - right.col)
    .map((key) => key.id);
}

function qmkProfileWithMetadata(profile = defaultSampleKeyboard): DeviceProfile {
  const next = cloneDevice(profile);
  next.firmwareMetadata = {
    qmk: {
      keyboard: "klakson/wb65",
      keymap: "daily_driver",
      keyOrder: matrixOrder(next),
      layout: "LAYOUT",
    },
  };
  return next;
}

function zmkProfileWithMetadata(profile = splitDemoKeyboard): DeviceProfile {
  const next = cloneDevice(profile);
  next.firmwareMetadata = {
    zmk: {
      board: "nice_nano_v2",
      keymap: "corney",
      keyOrder: matrixOrder(next),
      shields: ["corney_left", "corney_right"],
    },
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
  it("gives diagnostics with a shared code distinct stable UI keys", () => {
    const first = {
      code: "qmk.target.missing",
      message: "Choose a keyboard target.",
      path: "metadata.qmk.keyboard",
      severity: "error",
    } as const;
    const second = {
      ...first,
      message: "Choose a layout macro.",
      path: "metadata.qmk.layout",
    };

    expect(firmwareDiagnosticKey(first)).toBe(firmwareDiagnosticKey({ ...first }));
    expect(firmwareDiagnosticKey(first)).not.toBe(firmwareDiagnosticKey(second));
  });

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
      keymap: "daily_driver",
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
    expect(generated.diagnostics.some((item) => item.severity === "error")).toBe(true);
    expect(generated.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining(["qmk.macros.sequence_semantics", "qmk.tap_dance.hold_unsupported"]),
    );
  });

  it("emits portable QMK C for combined modifiers while keeping canonical JSON keycodes", () => {
    const profile = qmkProfileWithMetadata();
    profile.layers[0].bindings["k0-0"] = { code: "LCS(KC_1)" };
    profile.layers[0].bindings["k0-1"] = { code: "LCS_T(KC_A)" };

    const json = generateQmkKeymapJson(profile);
    const generated = generateQmkSourceBundle(profile);
    const keymap = sourceByRole(generated.files, "qmk-keymap-c");

    expect(json.keymap.layers[0][0]).toBe("LCS(KC_1)");
    expect(json.keymap.layers[0][1]).toBe("LCS_T(KC_A)");
    expect(keymap).toContain("LCTL(LSFT(KC_1))");
    expect(keymap).toContain("MT(MOD_LCTL | MOD_LSFT, KC_A)");
    expect(keymap).not.toContain("LCS(KC_1)");
    expect(keymap).not.toContain("LCS_T(KC_A)");
  });

  it("blocks QMK generation for unsupported keys while retaining non-blocking review diagnostics", () => {
    const profile = qmkProfileWithMetadata();
    const combo = profile.combos[0];
    if (!combo) throw new Error("sample profile needs a combo fixture");
    profile.settings.splitTransport = "serial";
    profile.combos = [{ ...combo, layerIds: ["fn"] }];
    profile.layers[0].bindings["k0-0"] = { code: "KC_FAKE_UNKNOWN" };

    const generated = generateQmkSourceBundle(profile);
    const keymap = sourceByRole(generated.files, "qmk-keymap-c");
    const diagnostics = generated.diagnostics.filter((item) =>
      [
        "qmk.combos.layer_scope",
        "qmk.keycode.unsupported",
        "qmk.lighting.unsupported",
        "qmk.rules.lighting_feature_unknown",
        "qmk.settings.split_transport",
      ].includes(item.code),
    );

    expect(keymap).toContain("KBUI_UNSUPPORTED_KEYCODE /* KC_FAKE_UNKNOWN */");
    expect(diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "qmk.combos.layer_scope",
        "qmk.keycode.unsupported",
        "qmk.lighting.unsupported",
        "qmk.rules.lighting_feature_unknown",
        "qmk.settings.split_transport",
      ]),
    );
    expect(diagnostics.some((item) => item.severity === "warning")).toBe(true);
    expect(
      generated.diagnostics.find((item) => item.code === "qmk.keycode.unsupported"),
    ).toMatchObject({
      message: expect.stringContaining("KC_FAKE_UNKNOWN"),
      path: "layers/Base/k0-0",
      severity: "error",
    });
    expect(generated.diagnostics.some((item) => item.severity === "error")).toBe(true);
  });

  it("excludes incomplete logic drafts from generated QMK source and clears their key bindings", () => {
    const profile = qmkProfileWithMetadata();
    profile.macros = [{ id: "macro-draft", name: "", sequence: [], trigger: "Unassigned" }];
    profile.combos = [{ id: "combo-draft", name: "", keys: [], binding: "" }];
    profile.tapDances = [{ id: "td-draft", keyId: "", tap: "", hold: "", doubleTap: "" }];
    profile.keyOverrides = [];
    profile.layers[0].bindings["k0-0"] = { code: "QK_MACRO_0" };
    profile.layers[0].bindings["k0-1"] = { code: "TD(0)" };

    const json = generateQmkKeymapJson(profile);
    const generated = generateQmkSourceBundle(profile);
    const keymap = sourceByRole(generated.files, "qmk-keymap-c");
    const rules = sourceByRole(generated.files, "qmk-rules-mk");

    expect(json.keymap.layers[0][0]).toBe("KBUI_INCOMPLETE_BINDING");
    expect(json.keymap.layers[0][1]).toBe("KBUI_INCOMPLETE_BINDING");
    expect(keymap).not.toContain("case QK_MACRO_0");
    expect(keymap).not.toContain("combo_t key_combos");
    expect(keymap).not.toContain("tap_dance_actions");
    expect(rules).not.toContain("COMBO_ENABLE = yes");
    expect(rules).not.toContain("TAP_DANCE_ENABLE = yes");
    expect(generated.diagnostics.map((item) => item.code)).toContain(
      "qmk.logic.incomplete_binding",
    );
  });

  it("preserves original macro and tap-dance indexes when earlier drafts are incomplete", () => {
    const profile = qmkProfileWithMetadata();
    profile.macros = [
      { id: "macro-draft", name: "", sequence: [], trigger: "Unassigned" },
      { id: "macro-ready", name: "Ready", sequence: ["KC_A"], trigger: "Unassigned" },
    ];
    profile.tapDances = [
      { id: "td-draft", keyId: "", tap: "", hold: "", doubleTap: "" },
      { id: "td-ready", keyId: "k2-0", tap: "KC_ESC", hold: "KC_LCTL", doubleTap: "KC_TAB" },
    ];
    profile.combos = [];
    profile.keyOverrides = [];
    profile.layers[0].bindings["k0-0"] = { code: "QK_MACRO_1" };
    profile.layers[0].bindings["k0-1"] = { code: "TD(1)" };

    const generated = generateQmkSourceBundle(profile);
    const keymap = sourceByRole(generated.files, "qmk-keymap-c");

    expect(keymap).toContain("case QK_MACRO_1");
    expect(keymap).not.toContain("case QK_MACRO_0");
    expect(keymap).toContain("TD_READY = 1");
    expect(keymap).toContain("TD(1)");
  });

  it("generates ZMK keymap, conf, and build yaml skeletons from real metadata", () => {
    const profile = zmkProfileWithMetadata();
    const generated = generateZmkSource(profile);
    const keymap = sourceByRole(generated.files, "zmk-keymap");
    const conf = sourceByRole(generated.files, "zmk-conf");
    const build = sourceByRole(generated.files, "zmk-build-yaml");

    expect(keymap).toContain('compatible = "zmk,keymap"');
    expect(keymap).toContain("#include <dt-bindings/zmk/outputs.h>");
    expect(keymap).toContain("&kp Q");
    expect(keymap).toContain("&lt 1 ESC");
    expect(keymap).toContain("key-positions = <13 16>;");
    expect(conf).toContain("CONFIG_ZMK_STUDIO=y");
    expect(conf).toContain("CONFIG_BT=y");
    expect(build).toContain("board: nice_nano_v2");
    expect(build).toContain("shield: corney_left");
    expect(build).toContain("shield: corney_right");
    expect(generated.files.map((file) => file.path)).toContain("zmk/config/corney.keymap");
    expect(generated.buildCommand).toBe("west build -b nice_nano_v2 -- -DSHIELD=corney_left");
    expect(generated.diagnostics.some((item) => item.severity === "error")).toBe(true);
  });

  it("generates native ZMK Bluetooth, output, and system behavior bindings", () => {
    const profile = zmkProfileWithMetadata();
    profile.layers[0].bindings["s0-0"] = { code: "ZMK_BT_SEL(2)" };
    profile.layers[0].bindings["s0-1"] = { code: "ZMK_OUT_BLE" };
    profile.layers[0].bindings["s0-2"] = { code: "ZMK_STUDIO_UNLOCK" };

    const generated = generateZmkSource(profile);
    const keymap = sourceByRole(generated.files, "zmk-keymap");

    expect(keymap).toContain("&bt BT_SEL 2");
    expect(keymap).toContain("&out OUT_BLE");
    expect(keymap).toContain("&studio_unlock");
    expect(generated.diagnostics.some((item) => item.code === "zmk.keycode.unsupported")).toBe(
      false,
    );
  });

  it("blocks ZMK generation for unsupported keys while retaining review diagnostics", () => {
    const profile = zmkProfileWithMetadata();
    profile.settings.splitTransport = "serial";
    profile.settings.tappingTerm = 220;
    profile.layers[0].bindings["s0-0"] = { code: "KC_FAKE_ZMK" };

    const generated = generateZmkSource(profile);
    const keymap = sourceByRole(generated.files, "zmk-keymap");
    const conf = sourceByRole(generated.files, "zmk-conf");
    const diagnostics = generated.diagnostics.filter((item) =>
      [
        "zmk.keycode.unsupported",
        "zmk.settings.serial_split_transport",
        "zmk.settings.tapping_term_scope",
      ].includes(item.code),
    );

    expect(keymap).toContain("&kbui_unsupported_keycode /* KC_FAKE_ZMK */");
    expect(conf).toContain("# TODO: configure ZMK serial split transport for this board.");
    expect(conf).toContain("# TODO: map tapping term 220ms to specific hold-tap behaviors.");
    expect(diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "zmk.keycode.unsupported",
        "zmk.settings.serial_split_transport",
        "zmk.settings.tapping_term_scope",
      ]),
    );
    expect(diagnostics.some((item) => item.severity === "warning")).toBe(true);
    expect(
      generated.diagnostics.find((item) => item.code === "zmk.keycode.unsupported"),
    ).toMatchObject({
      message: expect.stringContaining("KC_FAKE_ZMK"),
      path: "layers/Base/s0-0",
      severity: "error",
    });
    expect(generated.diagnostics.some((item) => item.severity === "error")).toBe(true);
  });

  it("flags missing build-critical metadata instead of guessing compile targets", () => {
    const qmk = generateFirmwareArtifacts(defaultSampleKeyboard);
    const zmk = generateFirmwareArtifacts(splitDemoKeyboard);
    const qmkJson = sourceByRole(qmk.artifacts, "qmk-keymap-json");
    const qmkKeymap = sourceByRole(qmk.artifacts, "qmk-keymap-c");
    const zmkBuild = sourceByRole(zmk.artifacts, "zmk-build-yaml");

    expect(qmk.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "qmk.metadata.keyboard_missing",
        "qmk.metadata.layout_missing",
        "qmk.metadata.key_order_missing",
      ]),
    );
    expect(
      qmk.diagnostics.filter((item) =>
        ["qmk.metadata.keyboard_missing", "qmk.metadata.layout_missing"].includes(item.code),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: "error", path: "metadata.qmk.keyboard" }),
        expect.objectContaining({ severity: "error", path: "metadata.qmk.layout" }),
      ]),
    );
    expect(qmk.buildReady).toBe(false);
    expect(qmk.summary).toMatchObject({ buildReady: false, errors: expect.any(Number) });
    expect(qmk.buildCommand).toBe(
      "qmk compile -kb <REQUIRED: qmk keyboard path> -km local_keyboard",
    );
    expect(qmk.buildCommand).not.toContain("<qmk-keyboard>");
    expect(qmkJson).toContain('"keyboard": "<REQUIRED: qmk keyboard path>"');
    expect(qmkJson).toContain('"layout": "<REQUIRED: qmk layout macro>"');
    expect(qmkKeymap).toContain("KBUI_REQUIRED_QMK_LAYOUT_MACRO(");
    expect(qmkKeymap).not.toContain("= LAYOUT(");

    expect(zmk.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "zmk.metadata.board_missing",
        "zmk.metadata.shield_missing",
        "zmk.metadata.key_order_missing",
      ]),
    );
    expect(
      zmk.diagnostics.filter((item) =>
        ["zmk.metadata.board_missing", "zmk.metadata.shield_missing"].includes(item.code),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: "error", path: "metadata.zmk.board" }),
        expect.objectContaining({ severity: "error", path: "metadata.zmk.shields" }),
      ]),
    );
    expect(zmk.buildReady).toBe(false);
    expect(zmk.summary).toMatchObject({ buildReady: false, errors: expect.any(Number) });
    expect(zmk.buildCommand).toBe(
      "west build -b <REQUIRED: zmk board> -- -DSHIELD=<REQUIRED: zmk shield>",
    );
    expect(zmk.buildCommand).not.toContain("<zmk-board>");
    expect(zmkBuild).toContain("# REQUIRED: set metadata.zmk.board");
    expect(zmkBuild).toContain("# REQUIRED: set metadata.zmk.shield");
    expect(zmkBuild).toContain('board: "<REQUIRED: zmk board>"');
    expect(zmkBuild).toContain('shield: "<REQUIRED: zmk shield>"');
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
    expect(qmk.buildReady).toBe(true);
    expect(qmk.summary.buildReady).toBe(true);
    expect(qmk.artifacts.map((file) => file.path)).toEqual([
      "qmk/keymap.json",
      "qmk/keymaps/daily_driver/keymap.c",
      "qmk/keymaps/daily_driver/config.h",
      "qmk/keymaps/daily_driver/rules.mk",
    ]);
    expect(qmk.buildCommand).toBe("qmk compile qmk/keymap.json");

    const zmkSimple = zmkProfileWithMetadata();
    zmkSimple.tapDances = [];
    const zmk = generateFirmwareArtifacts(zmkSimple);
    expect(zmk.target).toBe("zmk");
    expect(zmk.buildReady).toBe(true);
    expect(zmk.artifacts.map((file) => file.role)).toEqual([
      "zmk-keymap",
      "zmk-conf",
      "zmk-build-yaml",
    ]);

    expect(qmk.sourceHash).toBe(firmwareSourceHash(qmk.artifacts));
    expect(generateFirmwareArtifacts(qmkSimple).sourceHash).toBe(qmk.sourceHash);
  });

  it("blocks QMK builds until an ambiguous controller target is confirmed", () => {
    const profile = qmkProfileWithMetadata();
    profile.firmwareMetadata!.qmk!.targetConfirmed = false;

    const generated = generateFirmwareArtifacts(profile);

    expect(generated.buildReady).toBe(false);
    expect(generated.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "qmk.metadata.target_unconfirmed",
          severity: "error",
        }),
      ]),
    );
  });

  it("warns that the MCU must be verified when the product name matches no candidate target", () => {
    const profile = qmkProfileWithMetadata();
    profile.firmwareMetadata!.qmk!.targetConfirmed = false;
    profile.firmwareMetadata!.qmk!.keyboard = "bastardkb/charybdis/4x6/blackpill";
    profile.firmwareMetadata!.qmk!.alternatives = [
      { keyboard: "bastardkb/charybdis/4x6/elitec", layout: "LAYOUT" },
    ];
    profile.identity = {
      key: "device",
      transport: "webhid",
      productName: "Charybdis (4x6) Splinky",
    };

    const generated = generateFirmwareArtifacts(profile);
    const diagnostic = generated.diagnostics.find(
      (item) => item.code === "qmk.metadata.target_unconfirmed",
    );

    expect(diagnostic?.message).toContain("splinky");
    expect(diagnostic?.message.toLowerCase()).toContain("verify the mcu");
  });

  it("keeps the generic ambiguous-target message when every product-name token matches a candidate", () => {
    const profile = qmkProfileWithMetadata();
    profile.firmwareMetadata!.qmk!.targetConfirmed = false;
    profile.firmwareMetadata!.qmk!.keyboard = "bastardkb/charybdis/4x6/blackpill";
    profile.identity = {
      key: "device",
      transport: "webhid",
      productName: "Charybdis 4x6",
    };

    const generated = generateFirmwareArtifacts(profile);
    const diagnostic = generated.diagnostics.find(
      (item) => item.code === "qmk.metadata.target_unconfirmed",
    );

    expect(diagnostic?.message).toBe(
      "Several QMK controller targets share this device identity. Confirm the physical controller before compiling.",
    );
  });

  it("blocks ZMK builds until an ambiguous controller and shield target is confirmed", () => {
    const profile = zmkProfileWithMetadata();
    profile.firmwareMetadata!.zmk!.targetConfirmed = false;

    const generated = generateFirmwareArtifacts(profile);

    expect(generated.buildReady).toBe(false);
    expect(generated.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "zmk.metadata.target_unconfirmed",
          severity: "error",
        }),
      ]),
    );
  });
});
