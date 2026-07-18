import type { KeyboardCatalogEntry, KeyboardCatalogSummary } from "./catalog";
import {
  emptyBindingsForKeys,
  normalizeQmkKeycode,
  type Capability,
  type Combo,
  type KeyboardKey,
  type Layer,
} from "./schema";

const layerColors = ["#2f7f79", "#d96f32", "#5d6fb8", "#b88a2f", "#a663b8", "#39945f"];

type JsonRecord = Record<string, unknown>;

type MatrixToken = {
  row: number;
  col: number;
  label: string;
  encoder: boolean;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function titleCase(input: string) {
  return input.replace(/[_-]+/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

function maybeString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function maybeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function brandForPath(path: string) {
  return path.split("/")[1] ?? "via";
}

export function displayNameForPath(path: string) {
  return titleCase(
    path
      .split("/")
      .at(-1)
      ?.replace(/\.json$/i, "") ?? "Keyboard",
  );
}

export function scoreViaDefinitionPath(path: string, size = 0) {
  const normalized = path.toLowerCase();
  const pathSpecificity = Math.min(normalized.split("/").filter(Boolean).length * 10, 80);
  const sizeBonus = Math.min(Math.floor(size / 2500), 30);
  const variantPenalty = normalized.includes("iso") || normalized.includes("jis") ? 12 : 0;
  const encoderBonus = normalized.includes("knob") || normalized.includes("encoder") ? 8 : 0;
  return pathSpecificity + sizeBonus + encoderBonus - variantPenalty;
}

export function parseUsbId(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;

  const parsed = Number.parseInt(value, value.toLowerCase().startsWith("0x") ? 16 : 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function extractMatrixToken(input: string): MatrixToken | undefined {
  const firstLine = input.split("\n")[0]?.trim() ?? "";
  const match = firstLine.match(/^(\d+)\s*,\s*(\d+)/);
  if (!match) return undefined;

  return {
    row: Number(match[1]),
    col: Number(match[2]),
    label:
      input
        .split("\n")
        .slice(1)
        .map((part) => part.trim())
        .find((part) => part && !/^e\d+$/i.test(part) && !/^\d+\s*,\s*\d+$/.test(part)) ?? "",
    encoder: /\be\d+\b/i.test(input),
  };
}

/**
 * Parses a KLE-style keymap into absolute-positioned KeyboardKey records.
 *
 * KLE coordinate semantics implemented here:
 * - Each new row starts a fresh cursor at x=0, y=row_baseline (rolling).
 * - Object items between strings carry layout deltas. `x` and `y` are
 *   relative offsets applied *before* the next key.
 * - `rx`/`ry` set the rotation origin AND snap the cursor to it. `r` is
 *   the rotation angle in degrees, applied around the current origin.
 * - When rotation is in effect, the cursor (x, y) is interpreted in the
 *   rotated frame; the key's absolute position is computed via a 2D
 *   rotation around (rx, ry). This is what KLE/kle-serial does and what
 *   most VIA definitions assume — without it, layouts like the Bastardkb
 *   Dilemma thumb cluster end up off-canvas (we saw R3C0/R3C1 land at
 *   y ≈ -7 because their KLE `y` of -7.225 was meant to be rotated +30°).
 */
function rotatePoint(x: number, y: number, rx: number, ry: number, rDeg: number) {
  if (rDeg === 0) return { x, y };
  const radians = (rDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = x - rx;
  const dy = y - ry;
  return { x: rx + dx * cos - dy * sin, y: ry + dx * sin + dy * cos };
}

function parseViaKeymap(keymap: unknown): KeyboardKey[] {
  if (!Array.isArray(keymap)) return [];

  const keys: KeyboardKey[] = [];
  let currentY = 0;
  // Rotation state is persistent across rows in the KLE spec.
  let rotation = 0;
  let rotationOriginX = 0;
  let rotationOriginY = 0;

  for (const [rowIndex, rawRow] of keymap.entries()) {
    if (!Array.isArray(rawRow)) continue;
    if (rowIndex > 0) currentY += 1;

    let x = 0;
    let y = currentY;
    let nextWidth = 1;
    let nextHeight = 1;
    let nextRotation = rotation;

    for (const item of rawRow) {
      if (isRecord(item)) {
        // rx / ry both reset the cursor to the new origin (KLE semantics).
        const rx = maybeNumber(item.rx);
        const ry = maybeNumber(item.ry);
        if (rx !== undefined) {
          rotationOriginX = rx;
          x = rx;
          y = rotationOriginY;
        }
        if (ry !== undefined) {
          rotationOriginY = ry;
          y = ry;
          if (rx === undefined) x = rotationOriginX;
        }
        const r = maybeNumber(item.r);
        if (r !== undefined) nextRotation = r;

        x += maybeNumber(item.x) ?? 0;
        y += maybeNumber(item.y) ?? 0;
        currentY = y;
        nextWidth = maybeNumber(item.w) ?? 1;
        nextHeight = maybeNumber(item.h) ?? 1;
        continue;
      }

      if (typeof item !== "string") continue;

      const token = extractMatrixToken(item);
      if (!token) {
        x += nextWidth;
        nextWidth = 1;
        nextHeight = 1;
        continue;
      }

      rotation = nextRotation;
      const placed = rotatePoint(x, y, rotationOriginX, rotationOriginY, rotation);

      keys.push({
        id: `k${token.row}-${token.col}`,
        label: token.label || `R${token.row}C${token.col}`,
        row: token.row,
        col: token.col,
        x: Number(placed.x.toFixed(3)),
        y: Number(placed.y.toFixed(3)),
        width: Number(nextWidth.toFixed(3)),
        height: Number(nextHeight.toFixed(3)),
        rotation: rotation || undefined,
        encoder: token.encoder || undefined,
      });

      x += nextWidth;
      nextWidth = 1;
      nextHeight = 1;
    }
  }

  // After rotation we may have negative coordinates. Shift everything into
  // the positive quadrant so renderers that anchor at (0, 0) draw correctly.
  if (keys.length > 0) {
    const minX = Math.min(...keys.map((k) => k.x ?? 0));
    const minY = Math.min(...keys.map((k) => k.y ?? 0));
    const shiftX = minX < 0 ? -minX : 0;
    const shiftY = minY < 0 ? -minY : 0;
    if (shiftX || shiftY) {
      for (const key of keys) {
        if (typeof key.x === "number") key.x = Number((key.x + shiftX).toFixed(3));
        if (typeof key.y === "number") key.y = Number((key.y + shiftY).toFixed(3));
      }
    }
  }

  const seen = new Set<string>();
  return keys.filter((key) => {
    if (seen.has(key.id)) return false;
    seen.add(key.id);
    return true;
  });
}

function maybeStringArray(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : undefined;
}

function parseComboExtension(input: unknown, keys: KeyboardKey[]): Combo[] {
  if (!Array.isArray(input)) return [];

  const validKeyIds = new Set(keys.map((key) => key.id));
  const seen = new Set<string>();
  const combos: Combo[] = [];

  for (const item of input) {
    if (!isRecord(item)) continue;

    const id = maybeString(item.id);
    const comboKeys = maybeStringArray(item.keys);
    const binding = maybeString(item.binding);
    if (!id || !comboKeys?.length || !binding || seen.has(id)) continue;
    if (!comboKeys.every((keyId) => validKeyIds.has(keyId))) continue;

    const layerIds = maybeStringArray(item.layerIds);
    combos.push({
      id,
      name: maybeString(item.name) ?? titleCase(id),
      keys: comboKeys,
      binding,
      layerIds: layerIds?.length ? layerIds : undefined,
    });
    seen.add(id);
  }

  return combos;
}

function parseLayerExtension(input: unknown, keys: KeyboardKey[]): Layer[] {
  if (!Array.isArray(input)) return [];

  const validKeyIds = new Set(keys.map((key) => key.id));
  const layers: Layer[] = [];

  for (const [index, item] of input.entries()) {
    if (!isRecord(item)) continue;

    const bindings = emptyBindingsForKeys(keys, index === 0 ? "KC_NO" : "KC_TRNS");
    const rawBindings = isRecord(item.bindings) ? item.bindings : {};

    for (const [keyId, rawBinding] of Object.entries(rawBindings)) {
      if (!validKeyIds.has(keyId)) continue;
      const code = typeof rawBinding === "string" ? rawBinding : undefined;
      if (!code) continue;
      bindings[keyId] = { code: normalizeQmkKeycode(code) };
    }

    layers.push({
      id: maybeString(item.id) ?? (index === 0 ? "base" : `layer-${index}`),
      name: maybeString(item.name) ?? (index === 0 ? "Base" : `Layer ${index}`),
      color: maybeString(item.color) ?? layerColors[index % layerColors.length],
      bindings,
    });
  }

  return layers;
}

function layoutSummary(keys: KeyboardKey[]) {
  return {
    width: Number(
      Math.max(1, ...keys.map((key) => (key.x ?? key.col) + (key.width ?? 1))).toFixed(3),
    ),
    height: Number(
      Math.max(1, ...keys.map((key) => (key.y ?? key.row) + (key.height ?? 1))).toFixed(3),
    ),
    keyCount: keys.length,
  };
}

function capabilitiesFor(
  definition: JsonRecord,
  keys: KeyboardKey[],
  combos: Combo[],
): Capability[] {
  const text = JSON.stringify({
    menus: definition.menus ?? [],
    keycodes: definition.keycodes ?? [],
    customKeycodes: definition.customKeycodes ?? [],
  }).toLowerCase();
  const capabilities = new Set<Capability>(["keymap", "layers", "settings", "firmware"]);
  if (text.includes("rgb") || text.includes("backlight") || text.includes("lighting"))
    capabilities.add("lighting");
  if (keys.some((key) => key.encoder)) capabilities.add("encoders");
  if (combos.length > 0) capabilities.add("combos");
  if (Array.isArray(definition.customKeycodes) && definition.customKeycodes.length > 0)
    capabilities.add("keyOverrides");
  return Array.from(capabilities);
}

export function parseViaDefinition(
  sourcePath: string,
  definition: unknown,
  priority = scoreViaDefinitionPath(sourcePath),
): KeyboardCatalogEntry | undefined {
  if (!isRecord(definition)) return undefined;
  const layouts = isRecord(definition.layouts) ? definition.layouts : undefined;
  const keymap = layouts?.keymap;
  const keys = parseViaKeymap(keymap);
  if (keys.length === 0) return undefined;
  const combos = parseComboExtension(definition.combos, keys);
  const defaultLayers = parseLayerExtension(definition.layers, keys);

  const vendorId = parseUsbId(definition.vendorId);
  const productId = parseUsbId(definition.productId);
  if (typeof vendorId !== "number" || typeof productId !== "number") return undefined;

  const matrix = isRecord(definition.matrix) ? definition.matrix : undefined;

  return {
    id: sourcePath
      .replace(/^v3\//, "")
      .replace(/\.json$/i, "")
      .toLowerCase(),
    name: maybeString(definition.name) ?? displayNameForPath(sourcePath),
    vendor: titleCase(brandForPath(sourcePath)),
    source: "via-v3",
    sourcePath,
    vendorId,
    productId,
    matrix: {
      rows: maybeNumber(matrix?.rows) ?? Math.max(...keys.map((key) => key.row + 1)),
      cols: maybeNumber(matrix?.cols) ?? Math.max(...keys.map((key) => key.col + 1)),
    },
    layout: layoutSummary(keys),
    keys,
    combos,
    defaultLayers,
    capabilities: capabilitiesFor(definition, keys, combos),
    priority,
  };
}

export function summarizeCatalogEntry(entry: KeyboardCatalogEntry): KeyboardCatalogSummary {
  const { keys: _keys, combos: _combos, defaultLayers: _defaultLayers, ...summary } = entry;
  return summary;
}
