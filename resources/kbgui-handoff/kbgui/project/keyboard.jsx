/* global React */
// Keyboard renderer — flexbox only (no grid, no absolute positioning).
// Lens-aware: in the "keys" lens the cap shows its resolved binding; in the
// "lighting" lens the cap shows its per-key LED color. Same board, two lenses.

const { useMemo: useMemoKb } = React;

// Resolve a binding for a coordinate by walking the active layer stack top→base.
// baseCode is the physical key's own keycode = the BASE binding; a key only
// "falls through" when a non-base layer is active and doesn't override it.
function resolveBinding(layers, activeStack, row, col, baseCode) {
  for (const lid of activeStack) {
    const layer = layers.find(l => l.id === lid);
    if (!layer) continue;
    const v = layer.overrides[`${row},${col}`];
    if (v !== undefined) return { code: v, source: lid, transparent: false };
  }
  return { code: baseCode || "TRNS", source: "BASE", transparent: false };
}

function physCode(kb, r, c) {
  if (!kb) return "";
  if (kb.split) {
    const row = kb.layout[r]; if (!row) return "";
    const half = c < 5 ? row[0] : row[1];
    const it = half && half[c % 5];
    return it ? it.code : "";
  }
  const it = kb.layout[r] && kb.layout[r][c];
  return it ? it.code : "";
}

function isFallthrough(activeStack, source) {
  return activeStack[0] !== "BASE" && source !== activeStack[0];
}

function ledColor(ledMap, ledBase, r, c) {
  const v = ledMap && ledMap[`${r},${c}`];
  if (v === "off") return null;
  return v || ledBase;
}

// All valid (row,col) positions for a board.
function allPositions(kb) {
  const pos = [];
  kb.layout.forEach((row, r) => {
    if (kb.split) { for (let c = 0; c < 10; c++) pos.push([r, c]); }
    else row.forEach((_, c) => pos.push([r, c]));
  });
  return pos;
}

function friendlyCode(code) {
  if (!code || code === "TRNS") return { main: "▽", sub: null, dim: true };
  const MODS = { LCTL:"Ctrl", RCTL:"Ctrl", LSFT:"Shift", RSFT:"Shift", LALT:"Alt", RALT:"Alt",
                 LGUI:"Gui", RGUI:"Gui", HYPR:"Hyper", MEH:"Meh" };
  let m;
  if ((m = code.match(/^MACRO\(([^)]+)\)$/))) { const n = m[1]; return { main: n.length > 6 ? n.slice(0, 5) + "…" : n, sub: "macro" }; }
  if ((m = code.match(/^TD\(([^)]+)\)$/))) { const n = m[1]; return { main: n.length > 6 ? n.slice(0, 5) + "…" : n, sub: "dance" }; }
  if ((m = code.match(/^LT\(([^,]+),\s*([^)]+)\)$/))) return { main: capShort(m[2]), sub: "↑" + m[1] };
  if ((m = code.match(/^(MO|TG|TO|DF|OSL)\(([^)]+)\)$/))) {
    const kind = { MO:"mo", TG:"tog", TO:"to", DF:"def", OSL:"osl" }[m[1]];
    return { main: m[2], sub: kind };
  }
  if ((m = code.match(/^([A-Z]+)_T\(([^)]+)\)$/))) return { main: capShort(m[2]), sub: MODS[m[1]] || m[1] };
  if (MODS[code]) return { main: MODS[code], sub: null };
  return { main: capShort(code), sub: null };
}

function capShort(code) {
  const MAP = { SPC:"Spc", ENT:"Ent", ENTER:"Ent", BSPC:"Bksp", ESC:"Esc", TAB:"Tab",
                DEL:"Del", MINS:"-", EQL:"=", LBRC:"[", RBRC:"]", BSLS:"\\", SCLN:";",
                QUOT:"'", COMM:",", DOT:".", SLSH:"/", GRV:"`", LEFT:"←", RIGHT:"→",
                UP:"↑", DOWN:"↓", HOME:"Home", END:"End", PGUP:"PgUp", PGDN:"PgDn",
                CAPS:"Caps", CAPS_WORD:"CapWd" };
  return MAP[code] || code;
}

// ── Keycap ──────────────────────────────────────────────────────────────────
function Keycap({ binding, legend, w = 1, mod, accent, ghost, homing, selected, marked, onClick, onDown, onEnter, pos,
                  sourceColor, fallthrough, showFallthrough, lens = "keys", led }) {
  if (ghost) return <div className="keycap ghost" style={{ width: `calc(var(--u) * ${w})` }} />;

  const lighting = lens === "lighting";
  const dim = !lighting && fallthrough && showFallthrough;
  const shown = friendlyCode(binding?.code || "");

  const cls = ["keycap", lighting && "lit", !lighting && mod && "modifier",
    !lighting && accent && "accent", dim && "transparent", lighting && !led && "led-off", marked && "picked"]
    .filter(Boolean).join(" ");

  let style = { width: `calc(var(--u) * ${w} - 5px)` };
  if (lighting) {
    if (led) style.background = `linear-gradient(180deg, color-mix(in oklch, ${led} 45%, #FFFDF7) 0%, ${led} 100%)`;
  } else if (sourceColor && !dim) {
    style.boxShadow = `inset 0 -3px 0 ${sourceColor}, var(--shadow-cap)`;
  }

  return (
    <button
      className={cls}
      aria-pressed={selected ? "true" : undefined}
      onClick={onClick}
      onPointerDown={onDown}
      onPointerEnter={onEnter}
      data-pos={pos}
      title={lighting ? (led ? "LED " + led : "LED off") : (binding?.code || legend)}
      data-htmlswap-component="keycap"
      style={style}
    >
      <div className="cap-top">
        <span className="cap-legend">{legend || ""}</span>
        {!lighting && binding?.source && binding.source !== "BASE" && !dim && (
          <span className="cap-src" style={{ color: sourceColor }}>{binding.source}</span>
        )}
      </div>
      <div className="cap-glyph">
        {lighting
          ? <span className="g-main" style={{ opacity: .8, fontSize: 11 }}>{legend || shown.main}</span>
          : <>
              <span className="g-main">{shown.main}</span>
              {shown.sub && <span className="g-sub">{shown.sub}</span>}
            </>}
      </div>
      <div className="cap-home">{homing && <i />}</div>
    </button>
  );
}

// ── Single-block board (65%) ─────────────────────────────────────────────────
function BlockKeyboard({ kb, layers, activeStack, selected, onSelect, showFallthrough, unit, lens, leds, ledBase, marked, onKeyDown, onKeyEnter }) {
  return (
    <div className="kb" style={{ "--u": `${unit}px` }} data-htmlswap-component="keyboard">
      {kb.layout.map((rowItems, rIdx) => (
        <div key={rIdx} className="kb-row">
          {rowItems.map((k, cIdx) => {
            const binding = resolveBinding(layers, activeStack, rIdx, cIdx, k.code);
            const layer = layers.find(l => l.id === binding.source);
            return (
              <Keycap
                key={cIdx}
                legend={k.label}
                w={k.w || 1}
                mod={k.mod}
                accent={k.accent}
                homing={k.homing}
                binding={binding}
                selected={selected && selected.r === rIdx && selected.c === cIdx}
                marked={marked && marked.has(`${rIdx},${cIdx}`)}
                onClick={() => onSelect({ r: rIdx, c: cIdx, key: k })}
                onDown={onKeyDown ? () => onKeyDown(rIdx, cIdx) : undefined}
                onEnter={onKeyEnter ? () => onKeyEnter(rIdx, cIdx) : undefined}
                pos={`${rIdx},${cIdx}`}
                sourceColor={layer ? layer.color : null}
                fallthrough={isFallthrough(activeStack, binding.source)}
                showFallthrough={showFallthrough}
                lens={lens}
                led={ledColor(leds, ledBase, rIdx, cIdx)}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Split board (3x5+2) ──────────────────────────────────────────────────────
function SplitKeyboard({ kb, layers, activeStack, selected, onSelect, showFallthrough, unit, gap = 72, lens, leds, ledBase, marked, onKeyDown, onKeyEnter }) {
  return (
    <div className="kb" style={{ "--u": `${unit}px` }} data-htmlswap-component="keyboard">
      {kb.layout.map((rowHalves, rIdx) => (
        <div key={rIdx} className="kb-row">
          {rowHalves.map((half, hIdx) => (
            <React.Fragment key={hIdx}>
              {hIdx === 1 && (
                <div className="kb-gap" style={{ width: `${gap}px` }}><span className="seam" /></div>
              )}
              <div className="kb-half">
                {half.map((k, cIdx) => {
                  const absC = hIdx === 0 ? cIdx : cIdx + 5;
                  const binding = resolveBinding(layers, activeStack, rIdx, absC, k.code);
                  const layer = layers.find(l => l.id === binding.source);
                  return (
                    <Keycap
                      key={cIdx}
                      legend={k.label}
                      w={1}
                      mod={k.mod}
                      accent={k.accent}
                      ghost={k.ghost}
                      homing={k.homing}
                      binding={binding}
                      selected={selected && selected.r === rIdx && selected.c === absC}
                      marked={marked && marked.has(`${rIdx},${absC}`)}
                      onClick={() => onSelect({ r: rIdx, c: absC, key: k })}
                      onDown={onKeyDown ? () => onKeyDown(rIdx, absC) : undefined}
                      onEnter={onKeyEnter ? () => onKeyEnter(rIdx, absC) : undefined}
                      pos={`${rIdx},${absC}`}
                      sourceColor={layer ? layer.color : null}
                      fallthrough={isFallthrough(activeStack, binding.source)}
                      showFallthrough={showFallthrough}
                      lens={lens}
                      led={ledColor(leds, ledBase, rIdx, absC)}
                    />
                  );
                })}
              </div>
            </React.Fragment>
          ))}
        </div>
      ))}
    </div>
  );
}

function KbRender(props) {
  return props.kb.split ? <SplitKeyboard {...props} /> : <BlockKeyboard {...props} />;
}

window.KbRender = KbRender;
window.resolveBinding = resolveBinding;
window.physCode = physCode;
window.isFallthrough = isFallthrough;
window.ledColor = ledColor;
window.allPositions = allPositions;
window.friendlyCode = friendlyCode;
window.capShort = capShort;
