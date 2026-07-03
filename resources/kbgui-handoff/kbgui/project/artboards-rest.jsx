/* global React, KBData, KUI, KStore */
const { useStore: useStoreR } = KStore;
const { Btn, Icon, Seg, Switch, Chip } = KUI;

// ============================================================
// LIBRARY — define (left) ↔ place/use (right)
// ============================================================
function LibraryView() {
  const [s, dispatch] = useStoreR();
  const tab = s.libraryTab;
  const list = tab === "macros" ? s.macros : tab === "combos" ? s.combos : s.tapdances;
  const selId = s.librarySel[tab];
  const cur = list.find(x => x.id === selId) || list[0];
  const label = tab === "macros" ? "macro" : tab === "combos" ? "combo" : "tap dance";

  return (
    <div className="body" style={{ padding: 22, gap: 18 }}>
      <div className="card" style={{ flex: 1, minWidth: 0 }}>
        <div className="card-header">
          <h3>Library</h3>
          <Seg style={{ marginLeft: 8 }} value={tab} onChange={t => dispatch({ type: "LIB_TAB", tab: t })}
            options={[{ value: "macros", label: "Macros" }, { value: "combos", label: "Combos" }, { value: "td", label: "Tap Dance" }]} />
          <span className="tag" style={{ marginLeft: "auto" }}><Icon name="edit_note" style={{ fontSize: 13, marginRight: 4 }} />define</span>
        </div>
        <div className="card-body">
          <div className="entry-list">
            {tab === "macros" && s.macros.map(m => (
              <button key={m.id} className="entry-card" aria-selected={selId === m.id ? "true" : "false"} onClick={() => dispatch({ type: "LIB_SEL", id: m.id })} style={{ textAlign: "left" }}>
                <div className="grow">
                  <div className="row" style={{ gap: 8 }}><span className="name">{m.name}</span><span className="tag">{m.trigger}</span></div>
                  <div className="seq">{m.seq.map((x, i) => <React.Fragment key={i}><span className="seq-key">{x}</span>{i < m.seq.length - 1 && <span className="seq-arrow">›</span>}</React.Fragment>)}</div>
                </div>
                <Chip icon="keyboard">place</Chip>
              </button>
            ))}
            {tab === "combos" && s.combos.map(cb => (
              <button key={cb.id} className="entry-card" aria-selected={selId === cb.id ? "true" : "false"} onClick={() => dispatch({ type: "LIB_SEL", id: cb.id })} style={{ textAlign: "left" }}>
                <div className="grow">
                  <div className="row" style={{ gap: 8 }}><span className="name">{cb.name}</span>{cb.layers.map(l => <span key={l} className="tag">{l}</span>)}</div>
                  <div className="seq">
                    {(Array.isArray(cb.keys) ? cb.keys : [cb.keys]).map((k, i) => <React.Fragment key={i}><span className="seq-key">{k}</span>{i < (Array.isArray(cb.keys) ? cb.keys.length : 1) - 1 && <span className="seq-arrow">+</span>}</React.Fragment>)}
                    <span className="seq-arrow" style={{ margin: "0 4px" }}>→</span><span className="seq-key emit">{cb.emits}</span>
                  </div>
                </div>
              </button>
            ))}
            {tab === "td" && s.tapdances.map(t => (
              <button key={t.id} className="entry-card" aria-selected={selId === t.id ? "true" : "false"} onClick={() => dispatch({ type: "LIB_SEL", id: t.id })} style={{ textAlign: "left" }}>
                <div className="grow">
                  <div className="row" style={{ gap: 8 }}><span className="name">{t.key}</span><span className="tag">{t.desc}</span></div>
                  <div className="td-grid"><div className="td-slot"><span className="field-label">Tap</span><span className="seq-key">{t.tap}</span></div><div className="td-slot"><span className="field-label">Hold</span><span className="seq-key">{t.hold}</span></div><div className="td-slot"><span className="field-label">Double</span><span className="seq-key">{t.double}</span></div></div>
                </div>
                <Chip icon="keyboard">place</Chip>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ width: 340, flexShrink: 0, alignSelf: "flex-start" }}>
        <div className="card-header"><h3>Use it</h3><span className="tag" style={{ marginLeft: "auto" }}><Icon name="ads_click" style={{ fontSize: 13, marginRight: 4 }} />place</span></div>
        <div className="card-body">
          {tab === "combos" ? (
            <>
              <p className="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.6 }}>A combo <b>is</b> its placement — it fires when you press its member keys together. Pick the members on the board.</p>
              <div className="field"><span className="field-label">Members</span><div className="seq">{(Array.isArray(cur.keys) ? cur.keys : [cur.keys]).map((k, i) => <span key={i} className="seq-key">{k}</span>)}</div></div>
              <div className="field"><span className="field-label">Emits</span><span className="seq-key emit" style={{ alignSelf: "flex-start" }}>{cur.emits}</span></div>
              <div className="field"><span className="field-label">Active on layers</span><div className="row" style={{ gap: 6 }}>{cur.layers.map(l => <span key={l} className="tag">{l}</span>)}</div></div>
              <Btn icon="ads_click" tone="accent" variant="solid" style={{ width: "100%" }} onClick={() => dispatch({ type: "PLACE", kind: "combo", id: cur.id })}>Pick keys on board</Btn>
            </>
          ) : (
            <>
              <p className="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.6 }}>This {label} is defined. Place it on any key — you'll land in the editor and click a key.</p>
              <div className="field"><span className="field-label">{tab === "macros" ? "Sequence" : "Behavior"}</span>
                {tab === "macros"
                  ? <div className="seq">{cur.seq.map((x, i) => <span key={i} className="seq-key">{x}</span>)}</div>
                  : <div className="td-grid"><div className="td-slot"><span className="field-label">Tap</span><span className="seq-key">{cur.tap}</span></div><div className="td-slot"><span className="field-label">Hold</span><span className="seq-key">{cur.hold}</span></div><div className="td-slot"><span className="field-label">2×</span><span className="seq-key">{cur.double}</span></div></div>}
              </div>
              <Btn icon="add_link" tone="accent" variant="solid" style={{ width: "100%" }} onClick={() => dispatch({ type: "PLACE", kind: tab === "macros" ? "macro" : "tapdance", id: cur.id, label: tab === "macros" ? cur.name : cur.key })}>Place on a key</Btn>
              <div className="row" style={{ gap: 6 }}><Btn icon="edit" style={{ flex: 1 }}>Edit</Btn><Btn icon="content_copy" style={{ flex: 1 }}>Duplicate</Btn></div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SETTINGS — global-only config
// ============================================================
function SettingsView() {
  const [s, dispatch] = useStoreR();
  const st = s.settings;
  return (
    <div className="body" style={{ padding: 22, gap: 18, flexWrap: "wrap", alignContent: "flex-start" }}>
      <div className="card" style={{ flex: 1, minWidth: 300 }}>
        <div className="card-header"><h3>Timing</h3></div>
        <div className="card-body">
          <div className="slider-row"><label>Tap term</label><input type="range" min={100} max={300} value={st.tapTerm} onChange={e => dispatch({ type: "SET_SETTING", k: "tapTerm", v: +e.target.value })} /><span className="val">{st.tapTerm}ms</span></div>
          <div className="slider-row"><label>Debounce</label><input type="range" min={1} max={20} value={st.debounce} onChange={e => dispatch({ type: "SET_SETTING", k: "debounce", v: +e.target.value })} /><span className="val">{st.debounce}ms</span></div>
          <p className="muted" style={{ fontSize: 12, lineHeight: 1.6, margin: 0 }}>Tap term is how long you hold before a hold-tap fires its hold. Lower feels faster but mis-fires as taps.</p>
        </div>
      </div>
      <div className="card" style={{ flex: 1, minWidth: 300 }}>
        <div className="card-header"><h3>Toggles</h3></div>
        <div className="card-body">
          <div className="list">
            {[
              { k: "ph", n: "Permissive hold", d: "Any other key down during a hold-tap counts as hold." },
              { k: "rt", n: "Retro tapping", d: "Send the tap if nothing else was pressed in the term." },
              { k: "nkro", n: "NKRO", d: "Report all keys; falls back to 6KRO on USB." },
              { k: "mk", n: "Mouse keys", d: "Map pointer movement and clicks to keycodes." },
            ].map(t => (
              <div key={t.k} className="list-row">
                <div className="grow" style={{ flex: 1 }}><div className="mono" style={{ fontSize: 13, fontWeight: 500 }}>{t.n}</div><div className="muted" style={{ fontSize: 12 }}>{t.d}</div></div>
                <Switch checked={st.toggles[t.k]} onChange={() => dispatch({ type: "TOGGLE_SETTING", k: t.k })} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="card" style={{ width: "100%" }}>
        <div className="card-header"><h3>Split transport</h3></div>
        <div className="card-body">
          <div className="opt-row">
            {[{ k: "none", n: "None", d: "Single half" }, { k: "serial", n: "Serial", d: "TRRS UART" }, { k: "i2c", n: "I²C", d: "TRRS clock+data" }, { k: "ble", n: "BLE", d: "ZMK wireless" }].map(o => (
              <button key={o.k} className="opt-card" aria-pressed={st.transport === o.k ? "true" : "false"} onClick={() => dispatch({ type: "SET_TRANSPORT", v: o.k })}><span className="t">{o.n}</span><span className="d">{o.d}</span></button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// CONNECT — device picker
// ============================================================
function ConnectView() {
  const [, dispatch] = useStoreR();
  const devices = [
    { id: "wb65", board: "65", name: "Workbench 65", protocol: "QMK · VIA v3", meta: "0xFEED:0x6060 · QMK 0.25", icon: "USB", primary: true },
    { id: "corney", board: "3x5+2", name: "Corney 34", protocol: "ZMK · BLE", meta: "ZMK Studio · paired yesterday", icon: "BLE" },
  ];
  return (
    <div className="connect-wrap">
      <div className="connect-inner">
        <span className="eyebrow">Step 1</span>
        <h1>Connect a keyboard</h1>
        <p className="muted" style={{ fontSize: 14, margin: "0 0 8px" }}>Plug in or pair over Bluetooth. Klakson reads the layout from QMK/ZMK metadata.</p>
        <div className="card">
          <div className="card-header"><h3>Available</h3></div>
          <div className="card-body" style={{ gap: 10 }}>
            {devices.map(d => (
              <div key={d.id} className="device-card">
                <div className="icon">{d.icon}</div>
                <div className="grow"><div className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{d.name}</div><div className="muted" style={{ fontSize: 12 }}>{d.meta}</div></div>
                <Btn icon={d.primary ? "bolt" : undefined} tone={d.primary ? "accent" : "neutral"} variant={d.primary ? "solid" : "outline"} onClick={() => dispatch({ type: "CONNECT", device: d })}>{d.primary ? "Connect" : "Pair"}</Btn>
              </div>
            ))}
            <div className="device-card" style={{ opacity: 0.55 }}>
              <div className="icon">HID</div>
              <div className="grow"><div className="mono" style={{ fontSize: 13, fontWeight: 600 }}>Apple Magic Keyboard</div><div className="muted" style={{ fontSize: 12 }}>not flashable</div></div>
              <span className="tag">unsupported</span>
            </div>
          </div>
        </div>
        <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>
          <Btn icon="folder_open">Load profile (.json)</Btn>
          <Btn icon="arrow_forward" onClick={() => dispatch({ type: "NAV", route: "editor" })}>Continue without a device</Btn>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// FLASH OVERLAY — build → flash → done, driven by store phase
// ============================================================
function FlashOverlay() {
  const [s, dispatch] = useStoreR();
  const phase = s.flash && s.flash.phase;
  React.useEffect(() => {
    if (phase === "building") { const t = setTimeout(() => dispatch({ type: "FLASH_PHASE", phase: "flashing" }), 1300); return () => clearTimeout(t); }
    if (phase === "flashing") { const t = setTimeout(() => dispatch({ type: "FLASH_DONE" }), 1500); return () => clearTimeout(t); }
  }, [phase]);
  if (!s.flash) return null;

  const steps = [
    { k: "building", label: "Compiling firmware", done: phase !== "building" },
    { k: "flashing", label: "Writing to device", done: phase === "done", active: phase === "flashing" },
    { k: "done", label: "Done", done: phase === "done" },
  ];
  return (
    <div className="overlay" onClick={() => phase === "done" && dispatch({ type: "CLOSE_FLASH" })}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head"><Icon name="bolt" style={{ color: "var(--coral)" }} /><b>Flash to {s.device ? s.device.name : "device"}</b></div>
        <div className="flash-steps">
          {steps.map(st => (
            <div key={st.k} className={"flash-step" + (st.done ? " done" : st.active ? " active" : "")}>
              <Icon name={st.done ? "check_circle" : st.active ? "progress_activity" : "radio_button_unchecked"} />
              <span>{st.label}</span>
            </div>
          ))}
        </div>
        <pre className="log" style={{ borderRadius: 10, maxHeight: 150 }}>{`$ qmk compile -kb klakson/wb65
✓ keymap.c — 4 layers, 67 keys
✓ ${phase === "done" ? "binary 24.6 KB / 32 KB" : "compiling…"}
${phase === "done" ? "→ flashed klakson_wb65.uf2" : phase === "flashing" ? "→ writing 24.6 KB…" : ""}`}</pre>
        {phase === "done"
          ? <Btn tone="accent" variant="solid" icon="check" onClick={() => dispatch({ type: "CLOSE_FLASH" })} style={{ width: "100%" }}>Done</Btn>
          : <Btn variant="ghost" onClick={() => dispatch({ type: "CLOSE_FLASH" })} style={{ width: "100%" }}>Cancel</Btn>}
      </div>
    </div>
  );
}

window.Views = window.Views || {};
Object.assign(window.Views, { LibraryView, SettingsView, ConnectView, FlashOverlay });
