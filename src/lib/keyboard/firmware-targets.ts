import type { QmkFirmwareMetadata, ZmkFirmwareMetadata } from "./schema";

export type QmkFirmwareTarget = {
  keyboard: string;
  layout: string;
};

export type ZmkFirmwareTarget = {
  board: string;
  shields: string[];
};

export function qmkFirmwareTargets(metadata?: QmkFirmwareMetadata): QmkFirmwareTarget[] {
  const targets = [
    metadata?.keyboard && metadata.layout
      ? { keyboard: metadata.keyboard, layout: metadata.layout }
      : undefined,
    ...(metadata?.alternatives ?? []),
  ].filter((target): target is QmkFirmwareTarget => Boolean(target));

  return uniqueTargets(targets, (target) => `${target.keyboard}\0${target.layout}`);
}

export function zmkFirmwareTargets(metadata?: ZmkFirmwareMetadata): ZmkFirmwareTarget[] {
  const primaryShields = metadata?.shields ?? (metadata?.shield ? [metadata.shield] : []);
  const targets = [
    metadata?.board ? { board: metadata.board, shields: primaryShields } : undefined,
    ...(metadata?.alternatives ?? []),
  ].filter((target): target is ZmkFirmwareTarget => Boolean(target));

  return uniqueTargets(
    targets.map((target) => ({ ...target, shields: [...new Set(target.shields)] })),
    (target) => `${target.board}\0${target.shields.join("\0")}`,
  );
}

function uniqueTargets<T>(targets: T[], keyFor: (target: T) => string) {
  const seen = new Set<string>();
  return targets.filter((target) => {
    const key = keyFor(target);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
