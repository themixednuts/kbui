/* global React, KbRender, KBData, resolveBinding, physCode, ledColor, KUI, friendlyCode, KStore */
const { useStore, activeStack } = KStore;
const { LayerStack, KeycodePicker, Btn, Icon, Seg, Switch, Chip } = KUI;

const SWATCHES = [
  { v: "oklch(0.90 0.03 90)", label: "White" },
  { v: "oklch(0.72 0.17 32)", label: "Coral" },
  { v: "oklch(0.72 0.12 195)", label: "Teal" },
  { v: "oklch(0.80 0.12 155)", label: "Mint" },
  { v: "oklch(0.76 0.11 305)", label: "Lilac" },
  { v: "oklch(0.82 0.12 90)", label: "Mustard" },
  { v: "off", label: "Off" },
];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Responsive unit so the board always fits its column (no horizontal clipping).
function computeUnit(kb, w) {
  const avail = w - 24;
  if (kb.split) return clamp((avail - 80 - 9 * 5) / 10, 30, 60);
  const maxSum = Math.max(...kb.layout.map(r => r.reduce((a, k) => a + (k.w || 1), 0)));
  const cols = Math.max(...kb.layout.map(r => r.length));
  return clamp((avail - cols * 5) / maxSum, 28, 58);
}

function useWidth() {
  const ref = React.useRef(null);
  const [w, setW] = React.useState(900);
  React.useLayoutEffect(() => {
    const measure = () => { if (ref.current) setW(ref.current.clientWidth); };
    measure();
    let ro;
    if (window.ResizeObserver) { ro = new ResizeObserver(measure); if (ref.current) ro.observe(ref.current); }
    else window.addEventListener("resize", measure);
    return () => { ro ? ro.disconnect() : window.removeEventListener("resize", measure); };
  }, []);
  return [ref, w];
}

function KeyHero({ layers, binding, selected }) {
  const f = friendlyCode(binding.code);
  const src = layers.find(l => l.id === binding.source);
  return (
    <div className="key-hero">
      <div className="big-cap">{f.main}</div>
      <div className="col">
        <div className="meta">row {selected.r} · col {selected.c}</div>
        <h2>{binding.code === "TRNS" ? "▽ fall-through" : binding.code}</h2>
        {src && src.id !== "BASE" && <div className="row" style={{ marginTop: 2 }}><span className="tag" style={{ color: src.color }}>from {src.id}</span></div>}
      </div>
    </div>
  );
}

function LedSwatches({ value, onPick }) {
  return (
    <div className="swatches">
      {SWATCHES.map(sw => (
        <button key={sw.v} className={"swatch-btn" + (sw.v === "off" ? " off" : "")} aria-pressed={value === sw.v ? "true" : "false"}
          title={sw.label} onClick={() => onPick(sw.v)} style={sw.v === "off" ? undefined : { background: sw.v }}>
          {sw.v === "off" && <Icon name="power_settings_new" />}
        </button>
      ))}
    </div>
  );
}

function EditorView() {
  const [s, dispatch] = useStore();
  const kb = KBData.KEYBOARDS[s.boardId];
  const layers = s.layers;
  const stack = activeStack(s);
  const ledBase = KBData.LEDS[s.boardId].base;
  const { r, c } = s.selected;
  const binding = resolveBinding(layers, stack, r, c, physCode(kb, r, c));
  const selColor = ledColor(s.leds, ledBase, r, c);
  const split = kb.split;
  const lighting = s.lens === "lighting";
  const combo = s.placeMode && s.placeMode.kind === "combo" ? s.placeMode : null;

  const [stageRef, stageW] = useWidth();
  const unit = computeUnit(kb, stageW);

  // drag-select in lighting — handled at the stage level (hit-test with
  // elementFromPoint) so a drag can start ANYWHERE, not only on a key.
  const painting = React.useRef(false);
  const dragMode = React.useRef("add");
  const lastKey = React.useRef(null);
  React.useEffect(() => {
    const up = () => { painting.current = false; lastKey.current = null; };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);
  const keyAt = (x, y) => { const el = document.elementFromPoint(x, y); const k = el && el.closest && el.closest("[data-pos]"); return k ? k.getAttribute("data-pos") : null; };
  const onStageDown = (e) => {
    if (!lighting || e.button !== 0) return;
    painting.current = true;
    if (e.currentTarget.setPointerCapture) { try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {} }
    const key = keyAt(e.clientX, e.clientY);
    const toggle = e.ctrlKey || e.metaKey;
    const additive = e.shiftKey;
    dragMode.current = toggle ? "toggle" : "add";
    lastKey.current = key;
    if (key) {
      if (toggle) dispatch({ type: "SEL_TOGGLE", key });
      else if (additive) dispatch({ type: "SEL_ADD", key });
      else dispatch({ type: "SEL_START", key });
    } else if (!toggle && !additive) {
      dispatch({ type: "SEL_CLEAR" });
    }
  };
  const onStageMove = (e) => {
    if (!lighting || !painting.current) return;
    const key = keyAt(e.clientX, e.clientY);
    if (!key || key === lastKey.current) return;
    lastKey.current = key;
    dispatch({ type: dragMode.current === "toggle" ? "SEL_TOGGLE" : "SEL_ADD", key });
  };

  // color shared across current lighting selection ("mixed" if not uniform)
  const selColorsSet = new Set(s.selection.map(k => { const [rr, cc] = k.split(",").map(Number); return ledColor(s.leds, ledBase, rr, cc) || "off"; }));
  const uniformColor = selColorsSet.size === 1 ? [...selColorsSet][0] : null;

  const marked = lighting ? new Set(s.selection) : combo ? new Set(combo.picks) : null;

  const boardEl = (
    <KbRender kb={kb} layers={layers} activeStack={stack} selected={s.selected}
      onSelect={lighting ? () => {} : ({ r, c }) => dispatch({ type: "SELECT", r, c })}
      showFallthrough={s.showFall} unit={unit} gap={80}
      lens={s.lens} leds={s.leds} ledBase={ledBase} marked={marked} />
  );

  const chrome = (
    <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
      <Seg value={s.lens} onChange={v => dispatch({ type: "SET_LENS", lens: v })}
        options={[{ value: "keys", label: "Keys" }, { value: "lighting", label: "Lighting" }]} />
      <LayerStack layers={layers} activeStack={stack} setActiveStack={st => dispatch({ type: "SET_LAYER", id: st[0] })} />
      <div className="spacer" />
      {!lighting
        ? <button className="btn" data-htmlswap-variant="ghost" data-htmlswap-tone="neutral" data-htmlswap-size="sm" aria-pressed={s.showFall ? "true" : "false"} onClick={() => dispatch({ type: "TOGGLE_FALL" })}><Icon name={s.showFall ? "visibility" : "visibility_off"} /><span>Fall-through</span></button>
        : <Chip icon="lightbulb" dotColor={uniformColor && uniformColor !== "off" ? uniformColor : "var(--ink-3)"}>{s.selection.length} selected</Chip>}
    </div>
  );

  const comboBar = combo && (
    <div className="pick-bar">
      <Icon name="ads_click" />
      <span>Picking members for <b>{combo.label}</b> · {combo.picks.length} selected</span>
      <div className="spacer" />
      <Btn size="sm" onClick={() => dispatch({ type: "CANCEL_PLACE" })}>Cancel</Btn>
      <Btn size="sm" tone="accent" variant="solid" disabled={combo.picks.length < 2} onClick={() => dispatch({ type: "CONFIRM_COMBO" })}>Confirm combo</Btn>
    </div>
  );

  const keysInspector = (
    <>
      <KeyHero layers={layers} binding={binding} selected={s.selected} />
      <Seg value={s.editorTab} onChange={t => dispatch({ type: "SET_TAB", tab: t })}
        options={[{ value: "bind", label: "Bind" }, { value: "hold", label: "Hold-Tap" }, { value: "notes", label: "Notes" }]} />
      {s.editorTab === "bind" && <>
        <KeycodePicker value={binding.code} onPick={code => dispatch({ type: "BIND", code })} />
        <Btn size="xs" icon="restart_alt" onClick={() => dispatch({ type: "BIND", code: physCode(kb, r, c) })}>Reset to base</Btn>
      </>}
      {s.editorTab === "hold" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="row" style={{ gap: 10 }}>
            <div className="field" style={{ flex: 1 }}><span className="field-label">Tap</span><input className="input" defaultValue={friendlyCode(binding.code).main} /></div>
            <div className="field" style={{ flex: 1 }}><span className="field-label">Hold</span><input className="input" defaultValue={friendlyCode(binding.code).sub || "—"} /></div>
          </div>
          <div className="slider-row"><label>Tap term</label><input type="range" min="100" max="300" value={s.settings.tapTerm} onChange={e => dispatch({ type: "SET_SETTING", k: "tapTerm", v: +e.target.value })} /><span className="val">{s.settings.tapTerm}</span></div>
        </div>
      )}
      {s.editorTab === "notes" && <textarea className="input" rows={5} style={{ height: "auto", padding: 12, resize: "none" }} placeholder="Notes on this key…" />}
      <div className="divider" />
      <div className="lens-hint">
        <span className="led-chip" style={{ width: 20, height: 20, borderRadius: 6, background: selColor || "#1B1917" }} />
        <span>LED {selColor ? "set" : "off"}</span>
        <div className="spacer" />
        <Btn size="xs" icon="lightbulb" onClick={() => dispatch({ type: "SET_LENS", lens: "lighting" })}>Edit color</Btn>
      </div>
    </>
  );

  const lightingInspector = (
    <>
      <div className="key-hero">
        <div className={"led-chip" + (uniformColor && uniformColor !== "off" ? "" : " off")} style={uniformColor && uniformColor !== "off" ? { background: uniformColor } : undefined}>{(!uniformColor || uniformColor === "off") && <Icon name={uniformColor === "off" ? "power_settings_new" : "gradient"} />}</div>
        <div className="col"><div className="meta">{s.selection.length} key{s.selection.length === 1 ? "" : "s"} selected</div><h2 style={{ fontSize: 15 }}>{uniformColor === "off" ? "LED off" : uniformColor ? "Custom color" : "Mixed"}</h2></div>
      </div>
      <div className="field"><span className="field-label">Paint selection</span><LedSwatches value={uniformColor || ""} onPick={color => dispatch({ type: "PAINT_SEL", color })} /></div>
      <div className="row" style={{ gap: 6 }}>
        <Btn size="xs" icon="select_all" style={{ flex: 1 }} onClick={() => dispatch({ type: "SEL_ALL" })}>Select all</Btn>
        <Btn size="xs" icon="deselect" style={{ flex: 1 }} onClick={() => dispatch({ type: "SEL_CLEAR" })}>Clear</Btn>
      </div>
      <div className="slider-row"><label>Brightness</label><input type="range" min="0" max="100" value={s.rgb.brightness} onChange={e => dispatch({ type: "SET_RGB", k: "brightness", v: +e.target.value })} /><span className="val">{s.rgb.brightness}</span></div>
      <div className="divider" />
      <div className="field"><span className="field-label">Global effect</span>
        <Seg value={s.rgb.effect} onChange={v => dispatch({ type: "SET_RGB", k: "effect", v })} options={[{ value: "solid", label: "Solid" }, { value: "reactive", label: "Reactive" }, { value: "rainbow", label: "Rainbow" }]} />
      </div>
      <div className="slider-row"><label>Speed</label><input type="range" min="0" max="100" value={s.rgb.speed} onChange={e => dispatch({ type: "SET_RGB", k: "speed", v: +e.target.value })} /><span className="val">{s.rgb.speed}</span></div>
      <div className="row" style={{ justifyContent: "space-between" }}><span style={{ fontSize: 12, color: "var(--ink-2)" }}>Tint by active layer</span><Switch checked={s.rgb.tintByLayer} onChange={v => dispatch({ type: "SET_RGB", k: "tintByLayer", v })} /></div>
    </>
  );

  const underBoard = !lighting ? (
    <div className="card">
      <div className="card-header"><h3>Active layer stack</h3><span className="muted mono" style={{ fontSize: 11, marginLeft: "auto" }}>{stack.join(" › ")}</span></div>
      <div className="card-body" style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        {stack.map(lid => { const l = layers.find(x => x.id === lid); return <Chip key={lid} dotColor={l.color}>{l.name}</Chip>; })}
        <div className="spacer" /><span className="muted mono" style={{ fontSize: 11 }}>hatched keys inherit from below</span>
      </div>
    </div>
  ) : (
    <div className="lens-hint"><Icon name="drag_pan" />Drag across keys to select. Shift-drag adds · ⌘/Ctrl-click toggles · click empty space to clear.</div>
  );

  const stageEl = (
    <div className="stage" ref={stageRef}
      onPointerDown={lighting ? onStageDown : undefined}
      onPointerMove={lighting ? onStageMove : undefined}
      style={{ flexDirection: "column", gap: 12, cursor: lighting ? "crosshair" : "default", touchAction: lighting ? "none" : "auto", userSelect: lighting ? "none" : "auto" }}>
      {boardEl}
      {split && <div className="kb-split-label"><Icon name="cable" style={{ fontSize: 14 }} />TRRS · left ↔ right</div>}
      {comboBar}
    </div>
  );

  if (split) {
    return (
      <div className="body" style={{ flexDirection: "column" }}>
        <div className="main" style={{ flex: 1 }}>{chrome}{stageEl}</div>
        <div className="inspector-dock" data-htmlswap-region="editor.inspector">
          {!lighting ? (
            <div className="row" style={{ gap: 20 }}>
              <KeyHero layers={layers} binding={binding} selected={s.selected} />
              <div className="col" style={{ flex: 1, gap: 7, minWidth: 0 }}><span className="field-label">Quick pick</span><KeycodePicker value={binding.code} onPick={code => dispatch({ type: "BIND", code })} compact /></div>
              <div className="entry-actions"><Btn size="xs" icon="lightbulb" onClick={() => dispatch({ type: "SET_LENS", lens: "lighting" })}>Color</Btn><Btn size="xs" icon="restart_alt" onClick={() => dispatch({ type: "BIND", code: physCode(kb, r, c) })}>Reset</Btn></div>
            </div>
          ) : (
            <div className="row" style={{ gap: 20 }}>
              <div className={"led-chip" + (uniformColor && uniformColor !== "off" ? "" : " off")} style={uniformColor && uniformColor !== "off" ? { background: uniformColor } : undefined}>{(!uniformColor || uniformColor === "off") && <Icon name="gradient" />}</div>
              <div className="col" style={{ flex: 1, gap: 7, minWidth: 0 }}><span className="field-label">Paint {s.selection.length} selected</span><LedSwatches value={uniformColor || ""} onPick={color => dispatch({ type: "PAINT_SEL", color })} /></div>
              <div className="entry-actions"><Btn size="xs" icon="select_all" onClick={() => dispatch({ type: "SEL_ALL" })}>All</Btn><Btn size="xs" icon="deselect" onClick={() => dispatch({ type: "SEL_CLEAR" })}>Clear</Btn></div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="body">
      <div className="main">{chrome}{stageEl}{underBoard}</div>
      <div className="inspector-side" data-htmlswap-region="editor.inspector">
        <div className="card"><div className="card-body">{lighting ? lightingInspector : keysInspector}</div></div>
      </div>
    </div>
  );
}

window.Views = window.Views || {};
window.Views.EditorView = EditorView;
