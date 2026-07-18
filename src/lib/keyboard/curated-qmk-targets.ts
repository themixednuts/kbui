import type { QmkFirmwareMetadata } from "./schema";
import { rp2040Uf2FamilyId } from "./uf2-families";

/**
 * Hand-verified QMK build targets for boards that mainline QMK's USB catalog
 * cannot disambiguate on its own. These win over an *unconfirmed* USB-identity
 * resolution (see `withResolvedQmkTarget`) but never over a confirmed one.
 */
export interface CuratedQmkTarget {
  vendorId: number;
  productId: number;
  /**
   * When set, only apply this curated target if the connected device's USB
   * product name (case-insensitive) contains this token. The Charybdis 4x6
   * shares USB id 0xA8F8:0x1833 across every controller variant (blackpill,
   * elitec, splinky), so we only claim the RP2040 Splinky build for a device
   * that actually reports itself as a Splinky.
   */
  requiresProductNameToken?: string;
  qmk: QmkFirmwareMetadata;
}

export const curatedQmkTargets: CuratedQmkTarget[] = [
  {
    // BastardKB Charybdis 4x6 with a Splinky (RP2040) controller.
    //
    // Mainline QMK only ships the blackpill (STM32F411) and elitec (AVR)
    // controllers under `bastardkb/charybdis/4x6`; neither is correct for a
    // Splinky, and because both advertise PID 0x1833 the USB-identity resolver
    // can never confirm a single target (targetConfirmed stays false). BastardKB
    // maintains Splinky/RP2040 support only in their own QMK fork.
    //
    // Verified 2026-07-17 against
    //   https://raw.githubusercontent.com/bastardkb/bastardkb-qmk/bkb-master/keyboards/bastardkb/charybdis/4x6/keyboard.json
    // which reports keyboard_name "Charybdis (4x6) Splinky", processor RP2040,
    // bootloader rp2040, a single "LAYOUT" macro, USB 0xA8F8:0x1833, and matrix
    // row 4 = cols 1..5 (5 left thumbs) / row 9 = cols 1,3,5 (3 right thumbs) —
    // an exact match for the local VIA definition's corrected thumb clusters.
    vendorId: 0xa8f8,
    productId: 0x1833,
    requiresProductNameToken: "splinky",
    qmk: {
      keyboard: "bastardkb/charybdis/4x6",
      layout: "LAYOUT",
      repository: "bastardkb/bastardkb-qmk",
      // Pinned to the verified `bkb-master` HEAD (committed 2025-08-10). The
      // branch is BastardKB's documented default; the SHA keeps builds
      // reproducible. Bump both together when re-verifying.
      ref: "8f3b92fff27e6356120913a4ec6b21a017d0fef6",
      processor: "RP2040",
      bootloader: "rp2040",
      uf2FamilyId: rp2040Uf2FamilyId,
      uf2VolumeLabels: ["RPI-RP2"],
      targetConfirmed: true,
      // The mainline controllers remain selectable in Settings for anyone who
      // actually runs a blackpill/elitec Charybdis 4x6.
      alternatives: [
        { keyboard: "bastardkb/charybdis/4x6/blackpill", layout: "LAYOUT" },
        { keyboard: "bastardkb/charybdis/4x6/elitec", layout: "LAYOUT" },
      ],
    },
  },
];

/**
 * Returns the curated QMK target for an exact USB identity, if one is shipped
 * and its optional product-name gate is satisfied. Returns `undefined` when no
 * curated target applies (the caller then keeps the resolved/default target).
 */
export function curatedQmkTargetForIdentity(
  vendorId: number | undefined,
  productId: number | undefined,
  productName: string | undefined,
): QmkFirmwareMetadata | undefined {
  if (vendorId === undefined || productId === undefined) return undefined;
  const name = (productName ?? "").toLowerCase();

  for (const target of curatedQmkTargets) {
    if (target.vendorId !== vendorId || target.productId !== productId) continue;
    if (target.requiresProductNameToken && !name.includes(target.requiresProductNameToken)) {
      continue;
    }
    return target.qmk;
  }

  return undefined;
}
