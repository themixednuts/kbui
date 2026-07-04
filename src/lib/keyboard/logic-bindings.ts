import { keyById, type Combo, type DeviceProfile, type Macro, type TapDance } from "./schema";

export type LogicBindingOption =
  | {
      kind: "macro";
      id: string;
      label: string;
      detail: string;
      code: string;
      macroId: string;
    }
  | {
      kind: "tapDance";
      id: string;
      label: string;
      detail: string;
      code: string;
    }
  | {
      kind: "combo";
      id: string;
      label: string;
      detail: string;
      code: null;
    };

export function macroBindingCode(index: number): string {
  return `QK_MACRO_${index}`;
}

export function tapDanceBindingCode(index: number): string {
  return `TD(${index})`;
}

const macroBindingPattern = /^QK_MACRO_(\d+)$/i;
const tapDanceBindingPattern = /^TD\((\d+)\)$/i;

export function macroBindingIndex(code: string): number | undefined {
  const match = macroBindingPattern.exec(code.trim());
  if (!match) return undefined;
  return Number(match[1]);
}

export function tapDanceBindingIndex(code: string): number | undefined {
  const match = tapDanceBindingPattern.exec(code.trim());
  if (!match) return undefined;
  return Number(match[1]);
}

export function isCompleteMacro(macro: Pick<Macro, "sequence">): boolean {
  return macro.sequence.length > 0;
}

export function isCompleteCombo(combo: Pick<Combo, "binding" | "keys">): boolean {
  return combo.keys.length >= 2 && combo.binding.trim().length > 0;
}

export function isCompleteTapDance(
  dance: Pick<TapDance, "doubleTap" | "hold" | "keyId" | "tap">,
): boolean {
  return (
    dance.keyId.trim().length > 0 &&
    dance.tap.trim().length > 0 &&
    dance.hold.trim().length > 0 &&
    dance.doubleTap.trim().length > 0
  );
}

export function incompleteLogicBindingReason(
  device: Pick<DeviceProfile, "macros" | "tapDances">,
  code: string,
): string | undefined {
  const macroIndex = macroBindingIndex(code);
  if (macroIndex !== undefined) {
    const macro = device.macros[macroIndex];
    if (!macro || !isCompleteMacro(macro)) {
      return `${macroBindingCode(macroIndex)} targets an incomplete macro draft.`;
    }
  }

  const tapDanceIndex = tapDanceBindingIndex(code);
  if (tapDanceIndex !== undefined) {
    const dance = device.tapDances[tapDanceIndex];
    if (!dance || !isCompleteTapDance(dance)) {
      return `${tapDanceBindingCode(tapDanceIndex)} targets an incomplete tap dance draft.`;
    }
  }

  return undefined;
}

/** Workspace logic entries that can be picked when editing a key binding. */
export function logicBindingOptions(device: DeviceProfile): LogicBindingOption[] {
  const options: LogicBindingOption[] = [];

  for (const [index, macro] of device.macros.entries()) {
    if (!isCompleteMacro(macro)) continue;
    options.push({
      kind: "macro",
      id: macro.id,
      label: macro.name || "Untitled macro",
      detail: macro.sequence.join(" → "),
      code: macroBindingCode(index),
      macroId: macro.id,
    });
  }

  for (const [index, dance] of device.tapDances.entries()) {
    if (!isCompleteTapDance(dance)) continue;
    const key = keyById(device, dance.keyId);
    options.push({
      kind: "tapDance",
      id: dance.id,
      label: key?.label ?? dance.keyId,
      detail: `tap ${dance.tap} · hold ${dance.hold} · dbl ${dance.doubleTap}`,
      code: tapDanceBindingCode(index),
    });
  }

  for (const combo of device.combos) {
    const chord = combo.keys.map((keyId) => keyById(device, keyId)?.label ?? keyId).join(" + ");
    options.push({
      kind: "combo",
      id: combo.id,
      label: combo.name || "Untitled combo",
      detail: `${chord || "Add keys"} → ${combo.binding || "Set output"}`,
      code: null,
    });
  }

  return options;
}
