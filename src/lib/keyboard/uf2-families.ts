import type { DeviceProfile } from "$lib/keyboard/schema";

export const rp2040Uf2FamilyId = 0xe48bff56;
export const nrf52840Uf2FamilyId = 0xada52840;
export const samd21Uf2FamilyId = 0x68ed2b88;
export const samd51Uf2FamilyId = 0x55114460;

export interface ResolvedUf2Target {
  familyId: number;
  volumeLabels: string[];
}

export function uf2TargetForHardware(input: {
  board?: string;
  bootloader?: string;
  processor?: string;
}): ResolvedUf2Target | null {
  const identity = `${input.board ?? ""} ${input.processor ?? ""}`.toLowerCase();
  const bootloader = input.bootloader?.toLowerCase() ?? "";
  if (/\brp2040\b|promicro_rp2040|rp2040_zero/.test(identity)) {
    return { familyId: rp2040Uf2FamilyId, volumeLabels: ["RPI-RP2"] };
  }
  if (/nrf52840|nice_nano|seeeduino_xiao_ble|xiao_ble/.test(identity)) {
    return {
      familyId: nrf52840Uf2FamilyId,
      volumeLabels: ["NICENANO", "NICE!NANO", "XIAO-SENSE"],
    };
  }
  if (bootloader.includes("uf2") && /samd21/.test(identity)) {
    return { familyId: samd21Uf2FamilyId, volumeLabels: ["QMK-BOOT", "BOOT"] };
  }
  if (bootloader.includes("uf2") && /samd51/.test(identity)) {
    return { familyId: samd51Uf2FamilyId, volumeLabels: ["QMK-BOOT", "BOOT"] };
  }
  return null;
}

export function uf2TargetForProfile(profile: DeviceProfile): ResolvedUf2Target | null {
  const explicit =
    profile.firmware === "zmk" ? profile.firmwareMetadata?.zmk : profile.firmwareMetadata?.qmk;
  if (explicit?.uf2FamilyId !== undefined) {
    return {
      familyId: explicit.uf2FamilyId,
      volumeLabels: explicit.uf2VolumeLabels ?? [],
    };
  }
  return profile.firmware === "zmk"
    ? uf2TargetForHardware({ board: profile.firmwareMetadata?.zmk?.board })
    : uf2TargetForHardware({
        bootloader: profile.firmwareMetadata?.qmk?.bootloader,
        processor: profile.firmwareMetadata?.qmk?.processor,
      });
}
