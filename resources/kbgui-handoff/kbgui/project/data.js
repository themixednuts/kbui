// Keyboard models + sample bindings
// Models include physical positions (x, y, w, h in keycap units) so split layouts
// auto-detect from x-gaps in row data.

const KC = {
  // simple shorthands; the real app would have full QMK keycode tables
  mods: ["LCTL","LSFT","LALT","LGUI","RCTL","RSFT","RALT","RGUI","HYPR","MEH"],
  base: ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z"],
  digits: ["1","2","3","4","5","6","7","8","9","0"],
  layer: ["MO(NAV)","MO(SYM)","MO(NUM)","MO(FN)","TG(GAME)","TO(BASE)","LT(NAV,SPC)","LT(SYM,ENT)"],
  media: ["MUTE","VOL+","VOL-","PLAY","PREV","NEXT","BRI+","BRI-"],
  qmk: ["QK_BOOT","EE_CLR","RGB_TOG","RGB_MOD","RGB_HUI","RGB_SAI","RGB_VAI","RGB_SPI"],
  nav: ["LEFT","DOWN","UP","RIGHT","HOME","END","PGUP","PGDN"],
  punct: ["[","]","\\",";","'",",",".","/","-","="],
};

// 65% staggered, single block (no gap). 67 keys.
// We model rows as arrays of {label, code, w?, x?} — compute x by accumulating widths.
function row(items) {
  let x = 0;
  return items.map(it => {
    const w = it.w ?? 1;
    const cell = { ...it, x: it.x ?? x, w };
    x = (it.x ?? x) + w;
    return cell;
  });
}

const SIXTYFIVE = {
  id: "65",
  name: "Workbench 65",
  vendor: "Klakson Labs",
  protocol: "QMK · VIA v3",
  matrix: "5×16",
  split: false,
  layout: [
    row([
      {label:"Esc",code:"ESC"},{label:"1",code:"1"},{label:"2",code:"2"},{label:"3",code:"3"},
      {label:"4",code:"4"},{label:"5",code:"5"},{label:"6",code:"6"},{label:"7",code:"7"},
      {label:"8",code:"8"},{label:"9",code:"9"},{label:"0",code:"0"},{label:"-",code:"MINS"},
      {label:"=",code:"EQL"},{label:"Bksp",code:"BSPC",w:2},{label:"Home",code:"HOME"}
    ]),
    row([
      {label:"Tab",code:"TAB",w:1.5},{label:"Q",code:"Q"},{label:"W",code:"W"},{label:"E",code:"E"},
      {label:"R",code:"R"},{label:"T",code:"T"},{label:"Y",code:"Y"},{label:"U",code:"U"},
      {label:"I",code:"I"},{label:"O",code:"O"},{label:"P",code:"P"},{label:"[",code:"LBRC"},
      {label:"]",code:"RBRC"},{label:"\\",code:"BSLS",w:1.5},{label:"PgUp",code:"PGUP"}
    ]),
    row([
      {label:"Caps",code:"LT(NAV,ESC)",w:1.75},{label:"A",code:"A"},{label:"S",code:"S"},{label:"D",code:"D"},
      {label:"F",code:"F",homing:true},{label:"G",code:"G"},{label:"H",code:"H"},{label:"J",code:"J",homing:true},
      {label:"K",code:"K"},{label:"L",code:"L"},{label:";",code:"SCLN"},{label:"'",code:"QUOT"},
      {label:"Enter",code:"ENT",w:2.25},{label:"PgDn",code:"PGDN"}
    ]),
    row([
      {label:"Shift",code:"LSFT",w:2.25,mod:true},{label:"Z",code:"Z"},{label:"X",code:"X"},{label:"C",code:"C"},
      {label:"V",code:"V"},{label:"B",code:"B"},{label:"N",code:"N"},{label:"M",code:"M"},
      {label:",",code:"COMM"},{label:".",code:"DOT"},{label:"/",code:"SLSH"},
      {label:"Shift",code:"RSFT",w:1.75,mod:true},{label:"↑",code:"UP"},{label:"End",code:"END"}
    ]),
    row([
      {label:"Ctrl",code:"LCTL",w:1.25,mod:true},{label:"Win",code:"LGUI",w:1.25,mod:true},
      {label:"Alt",code:"LALT",w:1.25,mod:true},{label:"Space",code:"LT(NAV,SPC)",w:6.25,accent:true},
      {label:"Alt",code:"RALT",w:1.25,mod:true},{label:"Fn",code:"MO(FN)",mod:true},
      {label:"←",code:"LEFT"},{label:"↓",code:"DOWN"},{label:"→",code:"RIGHT"}
    ])
  ]
};

// 3x5+2 — Corne-style minimal split
function s(label, code, opts={}) { return { label, code, ...opts }; }

const SPLIT34 = {
  id: "3x5+2",
  name: "Corney 34",
  vendor: "Klakson Labs",
  protocol: "ZMK · BLE",
  matrix: "4×12 split",
  split: true,
  // Each row is two halves. We render as a flex row with a configurable gap between halves.
  layout: [
    [
      [s("Q","Q"),s("W","W"),s("E","E"),s("R","R"),s("T","T")],
      [s("Y","Y"),s("U","U"),s("I","I"),s("O","O"),s("P","P")]
    ],
    [
      [s("A","A"),s("S","S"),s("D","D"),s("F","F",{homing:true}),s("G","G")],
      [s("H","H"),s("J","J",{homing:true}),s("K","K"),s("L","L"),s(";","SCLN")]
    ],
    [
      [s("Z","Z"),s("X","X"),s("C","C"),s("V","V"),s("B","B")],
      [s("N","N"),s("M","M"),s(",","COMM"),s(".","DOT"),s("/","SLSH")]
    ],
    [
      [s("","",{ghost:true}),s("","",{ghost:true}),s("","",{ghost:true}),s("Esc","LT(NAV,ESC)",{mod:true}),s("Spc","LT(SYM,SPC)",{accent:true})],
      [s("Ent","LT(NUM,ENT)",{accent:true}),s("Bsp","BSPC",{mod:true}),s("","",{ghost:true}),s("","",{ghost:true}),s("","",{ghost:true})]
    ]
  ]
};

const KEYBOARDS = { "65": SIXTYFIVE, "3x5+2": SPLIT34 };

// Layers — each layer is a name + color + binding overrides.
// Bindings are by row,col coordinate; missing means "transparent" (KC_TRNS).
const LAYERS_65 = [
  { id:"BASE", name:"BASE", color:"var(--ink)", overrides:{} },
  { id:"NAV", name:"NAV", color:"var(--teal)", overrides:{
    "1,1":"F1","1,2":"F2","1,3":"F3","1,4":"F4","1,5":"F5","1,6":"F6","1,7":"F7","1,8":"F8","1,9":"F9","1,10":"F10","1,11":"F11","1,12":"F12",
    "2,6":"LEFT","2,7":"DOWN","2,8":"UP","2,9":"RIGHT","2,5":"HOME","2,10":"END",
    "3,6":"PGDN","3,7":"PGUP",
  } },
  { id:"SYM", name:"SYM", color:"var(--coral)", overrides:{
    "1,1":"!","1,2":"@","1,3":"#","1,4":"$","1,5":"%","1,6":"^","1,7":"&","1,8":"*","1,9":"(","1,10":")",
    "2,1":"~","2,2":"`","2,11":"{","2,12":"}",
  } },
  { id:"NUM", name:"NUM", color:"var(--mustard)", overrides:{
    "2,7":"4","2,8":"5","2,9":"6","3,7":"1","3,8":"2","3,9":"3","2,10":"+","3,10":"-","1,7":"7","1,8":"8","1,9":"9","1,10":"0",
  } },
  { id:"FN", name:"FN", color:"var(--lilac)", overrides:{
    "0,0":"QK_BOOT","0,13":"EE_CLR","4,3":"RGB_TOG","4,4":"RGB_MOD",
  } },
];

const LAYERS_34 = [
  { id:"BASE", name:"BASE", color:"var(--ink)", overrides:{} },
  { id:"NAV", name:"NAV", color:"var(--teal)", overrides:{
    "1,5":"LEFT","1,6":"DOWN","1,7":"UP","1,8":"RIGHT",
    "0,5":"HOME","0,6":"PGDN","0,7":"PGUP","0,8":"END",
  } },
  { id:"SYM", name:"SYM", color:"var(--coral)", overrides:{
    "0,0":"!","0,1":"@","0,2":"#","0,3":"$","0,4":"%",
    "0,5":"^","0,6":"&","0,7":"*","0,8":"(","0,9":")",
    "1,0":"~","1,1":"`","1,8":"{","1,9":"}",
  } },
  { id:"NUM", name:"NUM", color:"var(--mustard)", overrides:{
    "0,5":"7","0,6":"8","0,7":"9","1,5":"4","1,6":"5","1,7":"6","2,5":"1","2,6":"2","2,7":"3",
  } },
];

const LAYERS = { "65": LAYERS_65, "3x5+2": LAYERS_34 };

// Macros, combos, tap dances — simple sample data
const MACROS = [
  { id:"m1", name:"open_terminal", trigger:"Hyper + T", seq:["LGUI","SPC"," ","t","e","r","m","↵"], desc:"Spotlight → Terminal" },
  { id:"m2", name:"git_pull", trigger:"MEH + P", seq:["g","i","t"," ","p","u","l","l","↵"], desc:"Type and run git pull" },
  { id:"m3", name:"shrug", trigger:"FN + S", seq:["¯","\\","_","(","ツ",")","_","/","¯"], desc:"¯\\_(ツ)_/¯" },
];

const COMBOS = [
  { id:"c1", name:"escape_qw", keys:["Q","W"], emits:"ESC", layers:["BASE","SYM"] },
  { id:"c2", name:"tab_we", keys:["W","E"], emits:"TAB", layers:["BASE"] },
  { id:"c3", name:"caps_word", keys:"L+R Shift", emits:"CAPS_WORD", layers:["BASE"] },
];

const TAPDANCES = [
  { id:"td1", key:"Caps", tap:"ESC", hold:"LCTL", double:"CAPS", desc:"Esc / Ctrl / Caps" },
  { id:"td2", key:"; :", tap:"SCLN", hold:"RGUI", double:"COLON", desc:"Lazy semicolon" },
];

// Branch graph data
const BRANCHES = [
  { id:"main", name:"main", color:"var(--ink)", commits:[
    { id:"c1", msg:"Initial 65% layout from VIA dump", time:"3d", author:"you", lane:0 },
    { id:"c2", msg:"Add NAV layer w/ inverted-T", time:"2d", author:"you", lane:0 },
    { id:"c3", msg:"Tweak tapping term to 185ms", time:"1d", author:"you", lane:0 },
  ]},
  { id:"homerow", name:"homerow-mods", color:"var(--coral)", parent:"c2", commits:[
    { id:"c4", msg:"GACS on home row", time:"1d", author:"you", lane:1 },
    { id:"c5", msg:"Tighten timing for ring/pinky", time:"4h", author:"you", lane:1 },
  ]},
  { id:"gaming", name:"gaming-loadout", color:"var(--mustard)", parent:"c1", commits:[
    { id:"c6", msg:"GAME layer, no homerow mods", time:"6h", author:"friend", lane:2 },
  ]},
];

// Diff sample
const SAMPLE_DIFF = [
  { layer:"BASE", scope:"3,1", path:"layers/BASE/[3,1]", before:"Z", after:"LCTL_T(Z)", kind:"hold-tap" },
  { layer:"BASE", scope:"3,2", path:"layers/BASE/[3,2]", before:"X", after:"LALT_T(X)", kind:"hold-tap" },
  { layer:"BASE", scope:"3,3", path:"layers/BASE/[3,3]", before:"C", after:"LGUI_T(C)", kind:"hold-tap" },
  { layer:"BASE", scope:"3,4", path:"layers/BASE/[3,4]", before:"V", after:"LSFT_T(V)", kind:"hold-tap" },
  { layer:"-", scope:"settings", path:"settings/tappingTerm", before:"200ms", after:"165ms", kind:"behavior" },
  { layer:"-", scope:"settings", path:"settings/permissiveHold", before:"false", after:"true", kind:"behavior" },
  { layer:"NAV", scope:"2,5", path:"layers/NAV/[2,5]", before:"TRNS", after:"HOME", kind:"binding" },
];

// Per-key LED colors (the point: lighting is a per-key attribute of the board,
// not a separate screen). Keyed by "row,col"; anything unset uses ledBase.
const LEDS = {
  "65": {
    base: "oklch(0.90 0.03 90)",           // warm white default
    keys: {
      "0,0": "oklch(0.72 0.17 32)",         // Esc — coral
      "2,4": "oklch(0.72 0.12 195)",        // F homing — teal
      "2,7": "oklch(0.72 0.12 195)",        // J homing — teal
      "1,1": "oklch(0.76 0.11 305)",        // Q
      "1,2": "oklch(0.76 0.11 305)",        // W
      "1,3": "oklch(0.76 0.11 305)",        // E
      "4,3": "oklch(0.82 0.12 90)",         // Space — mustard
      "3,0": "oklch(0.72 0.17 32)",         // LShift
    },
  },
  "3x5+2": {
    base: "oklch(0.90 0.03 90)",
    keys: {
      "1,3": "oklch(0.72 0.12 195)",        // F homing
      "1,6": "oklch(0.72 0.12 195)",        // J homing
      "3,4": "oklch(0.82 0.12 90)",         // thumb
      "3,5": "oklch(0.82 0.12 90)",         // thumb
    },
  },
};

// Community keymaps for the Browse view. Signals are POSITIVE-ONLY by design:
// likes + adoptions + a "compiles" check. No downvotes, no star-brigading, no
// public comment threads — nothing that invites pile-ons.
const COMMUNITY = [
  { id: "cm1", name: "Miryoku-ish 34", author: "quante", board: "3x5+2", tags: ["ergo", "homerow-mods"], layers: 5, likes: 1284, adoptions: 412, compiles: true, updated: "2w ago", note: "Layer-per-thumb, GACS home row. My daily driver for two years.", accent: "var(--coral)", highlights: { "1,3": "var(--teal)", "1,6": "var(--teal)", "3,4": "var(--mustard)", "3,5": "var(--mustard)" } },
  { id: "cm2", name: "Workbench Programmer", author: "dvorak_dan", board: "65", tags: ["programmer", "symbols"], layers: 4, likes: 903, adoptions: 356, compiles: true, updated: "5d ago", note: "SYM layer tuned for Rust & TS. Brackets on the home row.", accent: "var(--lilac)", highlights: { "2,1": "var(--lilac)", "2,2": "var(--lilac)", "2,3": "var(--lilac)" } },
  { id: "cm3", name: "Gaming 65 (no HRM)", author: "frags", board: "65", tags: ["gaming"], layers: 3, likes: 671, adoptions: 512, compiles: true, updated: "1mo ago", note: "No home-row mods so WASD never mis-fires mid-fight.", accent: "var(--mustard)", highlights: { "3,1": "var(--mustard)", "3,2": "var(--mustard)", "3,3": "var(--mustard)", "2,4": "var(--mustard)" } },
  { id: "cm4", name: "Corney Colemak-DH", author: "mikroko", board: "3x5+2", tags: ["colemak", "ergo"], layers: 4, likes: 588, adoptions: 190, compiles: true, updated: "3w ago", note: "Colemak-DH with a tidy number row on the right thumb layer.", accent: "var(--teal)", highlights: { "0,0": "var(--teal)", "0,1": "var(--teal)", "1,2": "var(--teal)" } },
  { id: "cm5", name: "One-hand NAV 65", author: "aria", board: "65", tags: ["accessibility", "nav"], layers: 4, likes: 442, adoptions: 98, compiles: true, updated: "6d ago", note: "Sticky mods + big NAV cluster for low-effort one-handed use.", accent: "var(--mint)", highlights: { "2,6": "var(--mint)", "2,7": "var(--mint)", "2,8": "var(--mint)", "2,9": "var(--mint)" } },
  { id: "cm6", name: "Minimal starter 34", author: "klakson", board: "3x5+2", tags: ["beginner"], layers: 3, likes: 2050, adoptions: 1340, compiles: true, updated: "1w ago", note: "A clean, well-commented base to learn split layers. Official.", official: true, accent: "var(--ink)", highlights: {} },
];

window.KBData = { KC, KEYBOARDS, LAYERS, LEDS, MACROS, COMBOS, TAPDANCES, BRANCHES, SAMPLE_DIFF, COMMUNITY };
