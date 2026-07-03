import { keyById, type DeviceProfile } from "./schema";

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

/** Workspace logic entries that can be picked when editing a key binding. */
export function logicBindingOptions(device: DeviceProfile): LogicBindingOption[] {
  const options: LogicBindingOption[] = [];

  for (const [index, macro] of device.macros.entries()) {
    options.push({
      kind: "macro",
      id: macro.id,
      label: macro.name,
      detail: macro.sequence.join(" → "),
      code: macroBindingCode(index),
      macroId: macro.id,
    });
  }

  for (const [index, dance] of device.tapDances.entries()) {
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
      label: combo.name,
      detail: `${chord} → ${combo.binding}`,
      code: null,
    });
  }

  return options;
}
