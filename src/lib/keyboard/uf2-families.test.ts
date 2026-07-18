import { describe, expect, it } from "vite-plus/test";

import {
  nrf52840Uf2FamilyId,
  rp2040Uf2FamilyId,
  samd21Uf2FamilyId,
  samd51Uf2FamilyId,
  uf2TargetForHardware,
} from "./uf2-families";

describe("UF2 hardware target resolution", () => {
  it.each([
    [{ processor: "RP2040" }, rp2040Uf2FamilyId, "RPI-RP2"],
    [{ processor: "promicro_rp2040" }, rp2040Uf2FamilyId, "RPI-RP2"],
    [{ board: "nice_nano_v2" }, nrf52840Uf2FamilyId, "NICENANO"],
    [{ board: "seeeduino_xiao_ble" }, nrf52840Uf2FamilyId, "XIAO-SENSE"],
    [{ bootloader: "uf2", processor: "SAMD21" }, samd21Uf2FamilyId, "QMK-BOOT"],
    [{ bootloader: "uf2", processor: "SAMD51" }, samd51Uf2FamilyId, "QMK-BOOT"],
  ] as const)("maps %o to its registered family", (hardware, familyId, volume) => {
    expect(uf2TargetForHardware(hardware)).toMatchObject({
      familyId,
      volumeLabels: expect.arrayContaining([volume]),
    });
  });

  it("does not guess a family for unknown or non-UF2 hardware", () => {
    expect(uf2TargetForHardware({ processor: "STM32F411" })).toBeNull();
    expect(uf2TargetForHardware({ bootloader: "atmel-dfu", processor: "SAMD21" })).toBeNull();
  });
});
