import { describe, expect, it } from "vite-plus/test";

import {
  FirmwareBuildUnavailableError,
  NotImplementedFirmwareBuilder,
  firmwareBuildUnavailableMessage,
  isBrowserBuildAvailable,
} from "./builder";
import {
  firmwareObjectBundleCacheKey,
  type FirmwareBuildRequest,
  type FirmwareObjectBundleManifest,
} from "./types";

function hash(value: string) {
  return {
    algorithm: "sha256" as const,
    value,
  };
}

function file(path: string, value: string, sizeBytes = 1024) {
  return {
    hash: hash(value),
    path,
    sizeBytes,
  };
}

function sampleManifest(): FirmwareObjectBundleManifest {
  return {
    board: {
      boardFamily: "rp2040",
      bootloader: "uf2",
      keyboardPath: "klakson/wb65",
      layout: "LAYOUT",
      mcu: "RP2040",
      vendorProductId: {
        productId: 0x6060,
        vendorId: 0xfeed,
      },
    },
    bundle: {
      hash: hash("bundle-hash"),
      objects: [file("obj/quantum.o", "quantum")],
      staticLibraries: [file("lib/libqmk.a", "libqmk", 4096)],
    },
    compiler: {
      family: "clang",
      runtime: "wasi",
      targetTriple: "arm-none-eabi",
      version: "wasm-clang-poc",
    },
    enabledFeatures: {
      combos: true,
      keyOverrides: true,
      lighting: "none",
      macros: true,
      tapDance: true,
      via: true,
    },
    flags: {
      cflags: ["-mcpu=cortex-m0plus", "-mthumb", "-Os"],
      cppflags: ["-Iquantum", "-Ikeyboards/klakson/wb65"],
      defines: {
        COMBO_ENABLE: "yes",
      },
      ldflags: ["-nostartfiles", "-Wl,--gc-sections"],
    },
    linkerScript: file("ld/rp2040.ld", "linker", 2048),
    manifestVersion: 1,
    output: {
      fileExtension: "uf2",
      format: "uf2",
      uf2FamilyId: 0xe48bff56,
    },
    qmk: {
      commit: "0123456789abcdef",
      keymapBase: "default",
      repository: "qmk/qmk_firmware",
    },
    resourceBudgets: {
      flash: {
        bytes: 2 * 1024 * 1024,
        warningBytes: 1900 * 1024,
      },
      ram: {
        bytes: 264 * 1024,
        warningBytes: 240 * 1024,
      },
    },
    toolchain: {
      archive: file("toolchains/wasm-clang-rp2040.tar.zst", "toolchain", 58_000_000),
      wasmClang: file("toolchains/clang.wasm", "clang", 31_000_000),
      wasmLd: file("toolchains/wasm-ld.wasm", "lld", 19_000_000),
    },
  };
}

function sampleRequest(): FirmwareBuildRequest {
  return {
    cache: {
      backend: "opfs",
      mode: "cache-first",
    },
    generatedSource: {
      buildCommand: "qmk compile -kb klakson/wb65 -km kbgui",
      diagnostics: [],
      files: [
        {
          content: "#include QMK_KEYBOARD_H\n",
          mimeType: "text/x-csrc",
          path: "qmk/keymaps/kbgui/keymap.c",
          role: "qmk-keymap-c",
        },
      ],
      sourceHash: "src-00000001",
    },
    manifest: sampleManifest(),
    outputFileName: "klakson-wb65.uf2",
    requestId: "build-test",
  };
}

describe("firmware build scaffold", () => {
  it("derives an OPFS-safe object bundle cache key from immutable manifest inputs", () => {
    const key = firmwareObjectBundleCacheKey(sampleManifest());

    expect(key).toBe(
      "firmware-build/manifest-v1/0123456789abcdef/klakson-wb65/rp2040/rp2040/clang-wasm-clang-poc/arm-none-eabi/uf2/sha256/bundle-hash",
    );
  });

  it("keeps the option-B manifest fields explicit enough to reject incompatible bundles later", () => {
    const manifest = sampleManifest();

    expect(manifest.qmk.commit).toBe("0123456789abcdef");
    expect(manifest.board).toMatchObject({
      boardFamily: "rp2040",
      keyboardPath: "klakson/wb65",
      mcu: "RP2040",
    });
    expect(manifest.flags.cflags).toContain("-mcpu=cortex-m0plus");
    expect(manifest.enabledFeatures.combos).toBe(true);
    expect(manifest.bundle.objects[0]?.hash.value).toBe("quantum");
    expect(manifest.output).toMatchObject({
      format: "uf2",
      uf2FamilyId: 0xe48bff56,
    });
    expect(manifest.resourceBudgets.flash.bytes).toBe(2 * 1024 * 1024);
  });

  it("reports that browser builds are disabled until a real WASM toolchain is wired", () => {
    expect(isBrowserBuildAvailable()).toBe(false);
  });

  it("refuses builds with a clear unavailable error instead of faking an artifact", async () => {
    const builder = new NotImplementedFirmwareBuilder();

    await expect(builder.build(sampleRequest())).rejects.toThrow(FirmwareBuildUnavailableError);
    await expect(builder.build(sampleRequest())).rejects.toThrow(firmwareBuildUnavailableMessage);
  });
});
