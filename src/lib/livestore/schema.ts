/**
 * Klakson LiveStore schema.
 *
 * Models the workbench as an event-sourced store: every user-visible change
 * to the keymap (binding, layer, macro, setting) is a `synced` event;
 * materializers project those events onto SQLite tables that the UI queries.
 *
 * Design decisions:
 *
 * - One LiveStore *per signed-in user*. The DO sync server keys storeIds
 *   by the better-auth user id.
 *
 * - LiveStore's query builder doesn't yet support composite primary keys
 *   (assumes single `id` column). The `binding` table therefore uses a
 *   synthesised id (`${layerId}:${keyId}`) so onConflict-replace works as
 *   an upsert.
 *
 * - All event names are versioned (`v1.*`) so a future schema change can
 *   ship a `v2.*` event without breaking eventlog replay of old data.
 */
import { Events, makeSchema, Schema, State } from "@livestore/livestore";

// --- Helpers ---------------------------------------------------------------

/** Synthetic composite key for the binding table. */
export const bindingId = (layerId: string, keyId: string) => `${layerId}:${keyId}`;

// --- Tables ----------------------------------------------------------------

/** Active profile pointer + identity / immutable layout data. */
const profile = State.SQLite.table({
  name: "profile",
  columns: {
    id: State.SQLite.text({ primaryKey: true }),
    name: State.SQLite.text(),
    protocol: State.SQLite.text(),
    vendorId: State.SQLite.text({ nullable: true }),
    productId: State.SQLite.text({ nullable: true }),
    /** Physical layout (positions, rotations). JSON because it's
     *  varying-shape and only ever consumed as a whole. */
    keys: State.SQLite.json(),
    active: State.SQLite.boolean({ default: false }),
    updatedAt: State.SQLite.text(),
  },
});

const layer = State.SQLite.table({
  name: "layer",
  columns: {
    id: State.SQLite.text({ primaryKey: true }),
    profileId: State.SQLite.text(),
    name: State.SQLite.text(),
    color: State.SQLite.text(),
    sortOrder: State.SQLite.integer({ default: 0 }),
  },
});

const binding = State.SQLite.table({
  name: "binding",
  columns: {
    /** Synthesised: `${layerId}:${keyId}`. */
    id: State.SQLite.text({ primaryKey: true }),
    layerId: State.SQLite.text(),
    keyId: State.SQLite.text(),
    code: State.SQLite.text(),
    tap: State.SQLite.text({ nullable: true }),
    hold: State.SQLite.text({ nullable: true }),
    updatedAt: State.SQLite.text(),
  },
});

const macro = State.SQLite.table({
  name: "macro",
  columns: {
    id: State.SQLite.text({ primaryKey: true }),
    name: State.SQLite.text(),
    trigger: State.SQLite.text({ nullable: true }),
    sequence: State.SQLite.json(),
  },
});

const combo = State.SQLite.table({
  name: "combo",
  columns: {
    id: State.SQLite.text({ primaryKey: true }),
    name: State.SQLite.text(),
    keys: State.SQLite.json(),
    binding: State.SQLite.text(),
  },
});

const tapDance = State.SQLite.table({
  name: "tap_dance",
  columns: {
    id: State.SQLite.text({ primaryKey: true }),
    keyId: State.SQLite.text(),
    tap: State.SQLite.text(),
    hold: State.SQLite.text(),
    doubleTap: State.SQLite.text(),
  },
});

/** Key-value settings store: `settings.tappingTerm`, `lighting.hue`, etc.
 *  `value` is JSON so it can hold strings/numbers/booleans/objects
 *  without proliferating tables. */
const settingValue = State.SQLite.table({
  name: "setting_value",
  columns: {
    key: State.SQLite.text({ primaryKey: true }),
    value: State.SQLite.json(),
  },
});

export const tables = {
  profile,
  layer,
  binding,
  macro,
  combo,
  tapDance,
  settingValue,
};

// --- Event payload schemas -------------------------------------------------

const KeyBoundSchema = Schema.Struct({
  layerId: Schema.String,
  keyId: Schema.String,
  code: Schema.String,
  tap: Schema.optional(Schema.String),
  hold: Schema.optional(Schema.String),
});

const LayerAddedSchema = Schema.Struct({
  id: Schema.String,
  profileId: Schema.String,
  name: Schema.String,
  color: Schema.String,
  sortOrder: Schema.Number,
});

const LayerRenamedSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
});

const LayerColoredSchema = Schema.Struct({
  id: Schema.String,
  color: Schema.String,
});

const LayerRemovedSchema = Schema.Struct({ id: Schema.String });

const ProfileSetSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  protocol: Schema.String,
  vendorId: Schema.optional(Schema.String),
  productId: Schema.optional(Schema.String),
  keys: Schema.Unknown,
});

const MacroSetSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  trigger: Schema.optional(Schema.String),
  sequence: Schema.Unknown,
});

const MacroRemovedSchema = Schema.Struct({ id: Schema.String });

const SettingSetSchema = Schema.Struct({
  key: Schema.String,
  value: Schema.Unknown,
});

// --- Events ----------------------------------------------------------------

export const events = {
  keyBound: Events.synced({ name: "v1.KeyBound", schema: KeyBoundSchema }),
  layerAdded: Events.synced({ name: "v1.LayerAdded", schema: LayerAddedSchema }),
  layerRenamed: Events.synced({ name: "v1.LayerRenamed", schema: LayerRenamedSchema }),
  layerColored: Events.synced({ name: "v1.LayerColored", schema: LayerColoredSchema }),
  layerRemoved: Events.synced({ name: "v1.LayerRemoved", schema: LayerRemovedSchema }),
  profileSet: Events.synced({ name: "v1.ProfileSet", schema: ProfileSetSchema }),
  macroSet: Events.synced({ name: "v1.MacroSet", schema: MacroSetSchema }),
  macroRemoved: Events.synced({ name: "v1.MacroRemoved", schema: MacroRemovedSchema }),
  settingSet: Events.synced({ name: "v1.SettingSet", schema: SettingSetSchema }),
};

// --- Materializers ---------------------------------------------------------
// LiveStore's query builder uses `.insert(...).onConflict('id', 'replace')`
// for upserts and `.update(...).where(...)` for partial updates. We don't
// need transactions explicitly — each materializer's return value (single
// op or array of ops) is applied atomically.

const materializers = State.SQLite.materializers(events, {
  "v1.KeyBound": ({ layerId, keyId, code, tap, hold }) =>
    binding
      .insert({
        id: bindingId(layerId, keyId),
        layerId,
        keyId,
        code,
        tap: tap ?? null,
        hold: hold ?? null,
        updatedAt: new Date().toISOString(),
      })
      .onConflict("id", "replace"),

  "v1.LayerAdded": ({ id, profileId, name, color, sortOrder }) =>
    layer.insert({ id, profileId, name, color, sortOrder }).onConflict("id", "replace"),

  "v1.LayerRenamed": ({ id, name }) => layer.update({ name }).where({ id }),

  "v1.LayerColored": ({ id, color }) => layer.update({ color }).where({ id }),

  "v1.LayerRemoved": ({ id }) => [
    binding.delete().where({ layerId: id }),
    layer.delete().where({ id }),
  ],

  "v1.ProfileSet": ({ id, name, protocol, vendorId, productId, keys }) => [
    // Demote whatever profile is currently active, then upsert the new
    // one as active. One row at a time is fine — profile switches are
    // infrequent.
    profile.update({ active: false }).where({ active: true }),
    profile
      .insert({
        id,
        name,
        protocol,
        vendorId: vendorId ?? null,
        productId: productId ?? null,
        keys,
        active: true,
        updatedAt: new Date().toISOString(),
      })
      .onConflict("id", "replace"),
  ],

  "v1.MacroSet": ({ id, name, trigger, sequence }) =>
    macro.insert({ id, name, trigger: trigger ?? null, sequence }).onConflict("id", "replace"),

  "v1.MacroRemoved": ({ id }) => macro.delete().where({ id }),

  "v1.SettingSet": ({ key, value }) =>
    settingValue.insert({ key, value }).onConflict("key", "replace"),
});

// --- Schema export ---------------------------------------------------------

export const schema = makeSchema({
  events,
  state: State.SQLite.makeState({ tables, materializers }),
  devtools: { alias: "klakson" },
});

export type KlaksonSchema = typeof schema;
