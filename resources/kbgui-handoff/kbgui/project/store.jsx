/* global React, KBData */
// Shared app store: one source of truth so edits in one view show up everywhere
// (a key you rebind appears in Changes; a macro you place lands on the board).

const { createContext: createCtx, useContext: useCtx, useReducer: useRed } = React;

const StoreCtx = createCtx(null);

function initBoard(boardId) {
  return {
    boardId,
    layers: JSON.parse(JSON.stringify(KBData.LAYERS[boardId])), // working, mutable overrides
    leds: { ...KBData.LEDS[boardId].keys },
  };
}

const SETTINGS_DEFAULT = { tapTerm: 185, debounce: 5, toggles: { ph: true, rt: false, nkro: true, mk: false }, transport: "i2c" };

function initialState() {
  const b = initBoard("65");
  return {
    route: "connect",
    device: null,
    ...b,
    activeLayer: "BASE",
    showFall: true,
    lens: "keys",
    selected: { r: 2, c: 4 },
    editorTab: "bind",
    paintScope: "key",
    selection: ["2,4"],
    browseTag: "all",
    previewMapId: null,
    rgb: { effect: "reactive", speed: 45, brightness: 82, tintByLayer: false },
    macros: JSON.parse(JSON.stringify(KBData.MACROS)),
    combos: JSON.parse(JSON.stringify(KBData.COMBOS)),
    tapdances: JSON.parse(JSON.stringify(KBData.TAPDANCES)),
    libraryTab: "macros",
    librarySel: { macros: "m1", combos: "c1", td: "td1" },
    placeMode: null,
    settings: JSON.parse(JSON.stringify(SETTINGS_DEFAULT)),
    variants: [
      { id: "main", name: "main", color: "var(--ink)", note: null },
      { id: "homerow", name: "homerow-mods", color: "var(--coral)", note: 'branched from main · "Add NAV layer"' },
      { id: "gaming", name: "gaming-loadout", color: "var(--mustard)", note: 'branched from main · "Import 65%"' },
    ],
    currentVariant: "main",
    history: [
      { id: "c3", variant: "main", msg: "Tapping term → 185ms", meta: "you · 1d ago" },
      { id: "c2", variant: "main", msg: "Add NAV layer (inverted-T)", meta: "you · 2d ago" },
      { id: "c1", variant: "main", msg: "Import 65% from VIA dump", meta: "you · 3d ago" },
      { id: "c5", variant: "homerow", msg: "Tighten ring/pinky timing", meta: "you · 4h ago" },
      { id: "c4", variant: "homerow", msg: "GACS on the home row", meta: "you · 1d ago" },
      { id: "c6", variant: "gaming", msg: "GAME layer, no HRM", meta: "friend · 6h ago" },
    ],
    selectedSavepoint: "c3",
    versionsTab: "history",
    dirty: 0,
    seq: 6,
    toast: null,
    flash: null, // {phase}
    account: {
      signedIn: true,
      login: "octocat",
      name: "Octo Katz",
      monkeytype: { connected: true, wpm: 98, accuracy: 96.4, consistency: 82, tests: 1240, pb: 121 },
    },
    profileOpen: false,
  };
}

function activeStack(state) {
  return state.activeLayer === "BASE" ? ["BASE"] : [state.activeLayer, "BASE"];
}

function setOverride(layers, layerId, key, code) {
  return layers.map(l => l.id === layerId ? { ...l, overrides: { ...l.overrides, [key]: code } } : l);
}

function positionsForScope(state, kb) {
  const { selected, paintScope } = state;
  if (paintScope === "key") return [[selected.r, selected.c]];
  if (paintScope === "row") return window.allPositions(kb).filter(([r]) => r === selected.r);
  return window.allPositions(kb);
}

function reducer(state, a) {
  switch (a.type) {
    case "NAV": return { ...state, route: a.route };

    case "CONNECT": {
      const b = initBoard(a.device.board);
      const sel = a.device.board === "3x5+2" ? { r: 1, c: 3 } : { r: 2, c: 4 };
      return { ...state, device: a.device, ...b, activeLayer: "BASE",
        selected: sel, selection: [`${sel.r},${sel.c}`],
        route: "editor", toast: `Connected — ${a.device.name}` };
    }

    case "SELECT": {
      const { r, c } = a;
      const pm = state.placeMode;
      if (pm && pm.kind === "combo") {
        const key = `${r},${c}`;
        const has = pm.picks.includes(key);
        const picks = has ? pm.picks.filter(k => k !== key) : [...pm.picks, key];
        return { ...state, selected: { r, c }, placeMode: { ...pm, picks } };
      }
      if (pm) {
        const code = pm.kind === "macro" ? `MACRO(${pm.label})` : `TD(${pm.label})`;
        return { ...state, selected: { r, c },
          layers: setOverride(state.layers, state.activeLayer, `${r},${c}`, code),
          placeMode: null, dirty: state.dirty + 1,
          toast: `Placed ${pm.label} on R${r} · C${c}` };
      }
      return { ...state, selected: { r, c } };
    }

    case "SET_LENS": return { ...state, lens: a.lens };
    case "SET_LAYER": return { ...state, activeLayer: a.id };
    case "TOGGLE_FALL": return { ...state, showFall: !state.showFall };
    case "SET_TAB": return { ...state, editorTab: a.tab };

    // ── lighting selection (drag-select) ──
    case "SEL_START": return { ...state, selection: [a.key], selected: { r: +a.key.split(",")[0], c: +a.key.split(",")[1] } };
    case "SEL_ADD": return state.selection.includes(a.key) ? state : { ...state, selection: [...state.selection, a.key], selected: { r: +a.key.split(",")[0], c: +a.key.split(",")[1] } };
    case "SEL_TOGGLE": {
      const has = state.selection.includes(a.key);
      const selection = has ? state.selection.filter(k => k !== a.key) : [...state.selection, a.key];
      return { ...state, selection, selected: { r: +a.key.split(",")[0], c: +a.key.split(",")[1] } };
    }
    case "SEL_CLEAR": return { ...state, selection: [] };
    case "SEL_ALL": return { ...state, selection: window.allPositions(KBData.KEYBOARDS[state.boardId]).map(([r, c]) => `${r},${c}`) };
    case "PAINT_SEL": {
      if (!state.selection.length) return state;
      const leds = { ...state.leds };
      let changed = false;
      state.selection.forEach(k => { if (leds[k] !== a.color) { leds[k] = a.color; changed = true; } });
      return changed ? { ...state, leds, dirty: state.dirty + 1 } : state;
    }

    case "BIND": {
      const { selected, activeLayer } = state;
      return { ...state, layers: setOverride(state.layers, activeLayer, `${selected.r},${selected.c}`, a.code), dirty: state.dirty + 1 };
    }

    case "PAINT": {
      const kb = KBData.KEYBOARDS[state.boardId];
      const positions = positionsForScope(state, kb);
      const leds = { ...state.leds };
      positions.forEach(([r, c]) => { leds[`${r},${c}`] = a.color; });
      return { ...state, leds, dirty: state.dirty + 1 };
    }
    case "SET_SCOPE": return { ...state, paintScope: a.v };
    case "SET_RGB": return { ...state, rgb: { ...state.rgb, [a.k]: a.v }, dirty: state.dirty + 1 };

    case "LIB_TAB": return { ...state, libraryTab: a.tab };
    case "LIB_SEL": return { ...state, librarySel: { ...state.librarySel, [state.libraryTab]: a.id } };

    case "PLACE": {
      if (a.kind === "combo") {
        const combo = state.combos.find(c => c.id === a.id);
        const picks = []; // start fresh selection
        return { ...state, route: "editor", placeMode: { kind: "combo", id: a.id, label: combo.name, picks },
          toast: `Pick the keys for “${combo.name}” — then confirm` };
      }
      return { ...state, route: "editor", placeMode: { kind: a.kind, id: a.id, label: a.label },
        toast: `Click a key to place “${a.label}”` };
    }
    case "CONFIRM_COMBO": {
      const pm = state.placeMode;
      if (!pm || pm.kind !== "combo" || pm.picks.length < 2) return state;
      const kb = KBData.KEYBOARDS[state.boardId];
      const keys = pm.picks.map(k => {
        const [r, c] = k.split(",").map(Number);
        return window.physCode(kb, r, c) || `${r},${c}`;
      });
      const combos = state.combos.map(c => c.id === pm.id ? { ...c, keys } : c);
      return { ...state, combos, placeMode: null, dirty: state.dirty + 1, route: "library",
        toast: `Updated members of “${pm.label}”` };
    }
    case "CANCEL_PLACE": return { ...state, placeMode: null };

    case "SET_SETTING": return { ...state, settings: { ...state.settings, [a.k]: a.v }, dirty: state.dirty + 1 };
    case "TOGGLE_SETTING": return { ...state, settings: { ...state.settings, toggles: { ...state.settings.toggles, [a.k]: !state.settings.toggles[a.k] } }, dirty: state.dirty + 1 };
    case "SET_TRANSPORT": return { ...state, settings: { ...state.settings, transport: a.v }, dirty: state.dirty + 1 };

    case "VERSIONS_TAB": return { ...state, versionsTab: a.tab };
    case "SELECT_SP": return { ...state, selectedSavepoint: a.id };

    case "SAVE_POINT": {
      const n = state.seq + 1;
      const id = "c" + n;
      const item = { id, variant: state.currentVariant, msg: a.msg || `${state.dirty} change${state.dirty === 1 ? "" : "s"}`, meta: "you · just now" };
      return { ...state, history: [item, ...state.history], seq: n, dirty: 0, selectedSavepoint: id,
        route: "versions", versionsTab: "history", toast: "Saved a new point" };
    }
    case "BRANCH": {
      const idv = "v" + (state.variants.length + 1);
      const variant = { id: idv, name: a.name || "new-variant", color: "var(--teal)", note: `branched from ${state.currentVariant}` };
      return { ...state, variants: [...state.variants, variant], currentVariant: idv, toast: `Branched → ${variant.name}` };
    }
    case "RESTORE": return { ...state, toast: "Restored save point (view only)" };

    // ── community browser ──
    case "BROWSE_TAG": return { ...state, browseTag: a.tag };
    case "PREVIEW_MAP": return { ...state, previewMapId: a.id };
    case "ADOPT": {
      const map = (KBData.COMMUNITY || []).find(m => m.id === a.id);
      if (!map) return state;
      const idv = "v" + (state.variants.length + 1);
      const variant = { id: idv, name: map.name.toLowerCase().replace(/\s+/g, "-"), color: "var(--lilac)", note: `adopted from @${map.author}` };
      const n = state.seq + 1;
      const sp = { id: "c" + n, variant: idv, msg: `Adopted “${map.name}”`, meta: "you · just now" };
      const b = map.board !== state.boardId && !state.device ? initBoard(map.board) : {};
      return { ...state, ...b, variants: [...state.variants, variant], currentVariant: idv,
        history: [sp, ...state.history], seq: n, previewMapId: null, route: "editor",
        toast: `Adopted “${map.name}” as a variant` };
    }

    case "FLASH_START": {
      if (!state.device) return { ...state, route: "connect", toast: "Connect a device first" };
      return { ...state, flash: { phase: "building" } };
    }
    case "FLASH_PHASE": return { ...state, flash: { phase: a.phase } };
    case "FLASH_DONE": return { ...state, flash: { phase: "done" }, dirty: 0 };
    case "CLOSE_FLASH": return { ...state, flash: null };

    case "TOAST": return { ...state, toast: a.msg };
    case "CLEAR_TOAST": return { ...state, toast: null };

    // ── account / GitHub / Monkeytype ──
    case "TOGGLE_PROFILE": return { ...state, profileOpen: !state.profileOpen };
    case "SIGN_IN": return { ...state, account: { ...state.account, signedIn: true }, profileOpen: false, toast: "Signed in with GitHub" };
    case "SIGN_OUT": return { ...state, account: { ...state.account, signedIn: false }, profileOpen: false, toast: "Signed out" };
    case "MT_TOGGLE": {
      const on = state.account.monkeytype.connected;
      return { ...state, account: { ...state.account, monkeytype: { ...state.account.monkeytype, connected: !on } }, toast: on ? "Disconnected Monkeytype" : "Connected Monkeytype" };
    }
    default: return state;
  }
}

// Compute the live, uncommitted diff from working state vs the imported baseline.
function computeChanges(state) {
  const boardId = state.boardId;
  const kb = KBData.KEYBOARDS[boardId];
  const baseLayers = KBData.LAYERS[boardId];
  const list = [];

  state.layers.forEach(layer => {
    const orig = baseLayers.find(l => l.id === layer.id) || { overrides: {} };
    Object.keys(layer.overrides).forEach(key => {
      const after = layer.overrides[key];
      let before = orig.overrides[key];
      if (before === undefined) {
        const [r, c] = key.split(",").map(Number);
        before = layer.id === "BASE" ? (window.physCode(kb, r, c) || "TRNS") : "TRNS";
      }
      if (before !== after) list.push({ path: `${layer.id}/[${key}]`, before, after, kind: "binding" });
    });
  });

  const baseLeds = KBData.LEDS[boardId].keys;
  Object.keys(state.leds).forEach(key => {
    const after = state.leds[key];
    const before = baseLeds[key];
    if (before !== after) list.push({ path: `lighting/[${key}]`, before: colorName(before), after: colorName(after), kind: "led" });
  });

  const sd = SETTINGS_DEFAULT;
  if (state.settings.tapTerm !== sd.tapTerm) list.push({ path: "settings/tapping-term", before: sd.tapTerm + "ms", after: state.settings.tapTerm + "ms", kind: "setting" });
  if (state.settings.debounce !== sd.debounce) list.push({ path: "settings/debounce", before: sd.debounce + "ms", after: state.settings.debounce + "ms", kind: "setting" });
  Object.keys(sd.toggles).forEach(k => {
    if (state.settings.toggles[k] !== sd.toggles[k]) list.push({ path: "settings/" + k, before: String(sd.toggles[k]), after: String(state.settings.toggles[k]), kind: "setting" });
  });
  if (state.settings.transport !== sd.transport) list.push({ path: "settings/transport", before: sd.transport, after: state.settings.transport, kind: "setting" });

  return list;
}

function colorName(v) {
  if (v === undefined) return "base";
  if (v === "off") return "off";
  const NAMES = { "oklch(0.90 0.03 90)": "white", "oklch(0.72 0.17 32)": "coral", "oklch(0.72 0.12 195)": "teal", "oklch(0.80 0.12 155)": "mint", "oklch(0.76 0.11 305)": "lilac", "oklch(0.82 0.12 90)": "mustard" };
  return NAMES[v] || v;
}

function StoreProvider({ children }) {
  const [state, dispatch] = useRed(reducer, undefined, initialState);
  return React.createElement(StoreCtx.Provider, { value: [state, dispatch] }, children);
}
function useStore() { return useCtx(StoreCtx); }

window.KStore = { StoreProvider, useStore, activeStack, computeChanges, colorName };
