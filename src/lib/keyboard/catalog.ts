import {
  emptyBindingsForKeys,
  type Capability,
  type Combo,
  type DeviceIdentity,
  type DeviceProfile,
  type KeyboardKey,
  type Layer,
} from "./schema";

export interface KeyboardLayoutSummary {
  width: number;
  height: number;
  keyCount: number;
}

export interface KeyboardCatalogEntry {
  id: string;
  name: string;
  vendor: string;
  source: "via-v3";
  sourcePath: string;
  vendorId: number;
  productId: number;
  matrix: { rows: number; cols: number };
  layout: KeyboardLayoutSummary;
  keys: KeyboardKey[];
  combos: Combo[];
  defaultLayers: Layer[];
  capabilities: Capability[];
  priority: number;
}

export type KeyboardCatalogSummary = Omit<
  KeyboardCatalogEntry,
  "keys" | "combos" | "defaultLayers"
>;

export type KeyboardCatalogIndexEntry = KeyboardCatalogSummary;

const layerColors = ["#2f7f79", "#d96f32", "#5d6fb8", "#b88a2f"];
const ignoredIdentityTokens = new Set([
  "board",
  "device",
  "hid",
  "keyboard",
  "keyboards",
  "mechanical",
  "pcb",
  "qmk",
  "usb",
  "via",
]);
const weakVariantTokens = new Set([
  "ansi",
  "encoder",
  "hotswap",
  "iso",
  "jis",
  "knob",
  "rgb",
  "rev",
  "revision",
]);

export function hexUsbId(value: number) {
  return value.toString(16).padStart(4, "0");
}

export function catalogIdForIdentity(identity: Pick<DeviceIdentity, "vendorId" | "productId">) {
  if (typeof identity.vendorId !== "number" || typeof identity.productId !== "number")
    return undefined;
  return `${hexUsbId(identity.vendorId)}:${hexUsbId(identity.productId)}`;
}

function normalizedIdentityText(value = "") {
  return value
    .trim()
    .toLowerCase()
    .replace(/([a-z]+)(\d+)/g, "$1 $1$2 $2")
    .replace(/(\d+)([a-z]+)/g, "$1 $1$2 $2")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function identityTokens(value = "") {
  const tokens = normalizedIdentityText(value).split(/\s+/).filter(Boolean);
  return Array.from(new Set(tokens));
}

function identityTokenWeight(token: string) {
  if (token.length < 2 || ignoredIdentityTokens.has(token)) return 0;
  if (weakVariantTokens.has(token)) return 20;
  if (/\d/.test(token)) return 95;
  if (token.length >= 6) return 90;
  if (token.length >= 4) return 70;
  return 35;
}

function entryIdentityText(entry: KeyboardCatalogSummary) {
  return `${entry.vendor} ${entry.name} ${entry.id} ${entry.sourcePath}`;
}

function isWeakPathVariant(token: string) {
  return (
    weakVariantTokens.has(token) ||
    /^rev\d*$/i.test(token) ||
    /^v\d+$/i.test(token) ||
    /^r\d+$/i.test(token)
  );
}

function isSelfNamedModelToken(entry: KeyboardCatalogSummary, token: string) {
  const pathTokens = entry.id.split(/[/-]+/).filter(Boolean);
  return pathTokens[0] === token && pathTokens.slice(1).every(isWeakPathVariant);
}

function productNameMatchScore(entry: KeyboardCatalogSummary, productName?: string) {
  const productTokens = identityTokens(productName).filter(
    (token) => identityTokenWeight(token) > 0,
  );
  if (productTokens.length === 0) return 0;

  const entryText = normalizedIdentityText(entryIdentityText(entry));
  const entryTokens = new Set(identityTokens(entryText));
  const vendorTokens = new Set(identityTokens(entry.vendor));
  let score = 0;
  let matched = 0;
  let matchedModelTokens = 0;
  let matchedStrongModelTokens = 0;
  let matchedVendor = false;

  for (const token of productTokens) {
    if (!entryTokens.has(token)) continue;

    const weight = identityTokenWeight(token);
    score += weight;
    matched += 1;

    if (vendorTokens.has(token)) {
      matchedVendor = true;
      if (isSelfNamedModelToken(entry, token)) {
        matchedModelTokens += 1;
        if (weight >= 70) matchedStrongModelTokens += 1;
      }
    } else {
      if (weight > 20) matchedModelTokens += 1;
      if (weight >= 70) matchedStrongModelTokens += 1;
    }
  }

  const productText = normalizedIdentityText(productName);
  const entryName = normalizedIdentityText(entry.name);
  if (
    entryName.length >= 5 &&
    (productText.includes(entryName) || entryName.includes(productText))
  ) {
    score += 260;
  }

  const confident =
    (matchedVendor && matchedModelTokens >= 1) ||
    matchedStrongModelTokens >= 2 ||
    (matchedStrongModelTokens === 1 && matched === 1 && productTokens[0]?.length >= 5);
  if (!confident) return 0;

  return 2500 + score;
}

export function catalogIdentityMatchScore(
  entry: KeyboardCatalogSummary,
  identity: Pick<DeviceIdentity, "vendorId" | "productId" | "productName">,
) {
  const usbId = catalogIdForIdentity(identity);
  const entryUsbId = `${hexUsbId(entry.vendorId)}:${hexUsbId(entry.productId)}`;
  const usbScore = usbId && entryUsbId === usbId ? 5000 : 0;
  const nameScore = productNameMatchScore(entry, identity.productName);

  return usbScore + nameScore;
}

export function entryMatchesIdentity(
  entry: KeyboardCatalogSummary,
  identity: Pick<DeviceIdentity, "vendorId" | "productId" | "productName">,
) {
  return catalogIdentityMatchScore(entry, identity) > 0;
}

export function bestCatalogEntryForIdentity<T extends KeyboardCatalogSummary>(
  entries: T[],
  identity: Pick<DeviceIdentity, "vendorId" | "productId" | "productName">,
) {
  return entries
    .map((entry) => ({
      entry,
      score: catalogIdentityMatchScore(entry, identity),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.entry.priority - left.entry.priority ||
        left.entry.name.localeCompare(right.entry.name),
    )[0]?.entry;
}

function catalogLayer(keys: KeyboardKey[], index: number): Layer {
  return {
    id: index === 0 ? "base" : `layer-${index}`,
    name: index === 0 ? "Base" : `Layer ${index}`,
    color: layerColors[index % layerColors.length],
    bindings: emptyBindingsForKeys(keys, index === 0 ? "KC_NO" : "KC_TRNS"),
  };
}

export function profileFromCatalog(entry: KeyboardCatalogEntry, layerCount = 4): DeviceProfile {
  const defaultLayerCount = entry.defaultLayers.length;
  const resolvedLayerCount = Math.max(layerCount, defaultLayerCount, 1);

  return {
    id: `catalog:${entry.id}`,
    name: entry.name,
    origin: "imported",
    vendor: entry.vendor,
    firmware: "qmk",
    protocol: "via-v3",
    firmwareVersion: "VIA definition v3",
    vendorId: entry.vendorId,
    productId: entry.productId,
    matrix: entry.matrix,
    keys: entry.keys,
    capabilities: entry.capabilities,
    layers: Array.from(
      { length: resolvedLayerCount },
      (_, index) => entry.defaultLayers[index] ?? catalogLayer(entry.keys, index),
    ),
    macros: [],
    combos: entry.combos,
    tapDances: [],
    keyOverrides: [],
    lighting: {
      mode: entry.capabilities.includes("lighting") ? "matrix" : "solid",
      hue: 174,
      saturation: 72,
      brightness: 72,
      speed: 40,
      keys: {},
    },
    settings: {
      tappingTerm: 185,
      debounce: 5,
      permissiveHold: false,
      retroTapping: false,
      nkro: true,
      splitTransport: entry.name.toLowerCase().includes("split") ? "serial" : "none",
    },
    detectionNotes: [`Loaded ${entry.sourcePath} from the VIA v3 keyboard catalog.`],
    updatedAt: new Date().toISOString(),
  };
}

export function layoutBounds(keys: KeyboardKey[]): KeyboardLayoutSummary {
  if (!keys.some((key) => typeof key.x === "number" && typeof key.y === "number")) {
    return {
      width: Math.max(1, ...keys.map((key) => key.col + (key.width ?? 1))),
      height: Math.max(1, ...keys.map((key) => key.row + (key.height ?? 1))),
      keyCount: keys.length,
    };
  }

  return {
    width: Math.max(1, ...keys.map((key) => (key.x ?? key.col) + (key.width ?? 1))),
    height: Math.max(1, ...keys.map((key) => (key.y ?? key.row) + (key.height ?? 1))),
    keyCount: keys.length,
  };
}
