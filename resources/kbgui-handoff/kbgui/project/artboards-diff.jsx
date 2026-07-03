/* global React, KBData, KUI, KStore */
const { useStore: useStoreV, computeChanges } = KStore;
const { Btn, Icon, Seg, Chip } = KUI;

function VersionsView() {
  const [s, dispatch] = useStoreV();
  const changes = computeChanges(s);

  const tracks = s.variants.map(v => ({
    ...v,
    points: s.history.filter(h => h.variant === v.id),
  })).filter(t => t.points.length);

  const latestByVariant = {};
  s.variants.forEach(v => { const p = s.history.find(h => h.variant === v.id); if (p) latestByVariant[v.id] = p.id; });
  const selPoint = s.history.find(p => p.id === s.selectedSavepoint) || s.history[0];
  const selVariant = s.variants.find(v => v.id === (selPoint && selPoint.variant));

  return (
    <div className="body" style={{ padding: 22, gap: 18, flexDirection: "column" }}>
      <div className="row">
        <Seg value={s.versionsTab} onChange={t => dispatch({ type: "VERSIONS_TAB", tab: t })}
          options={[{ value: "history", label: "History" }, { value: "changes", label: `Changes${s.dirty ? " · " + s.dirty : ""}` }]} />
      </div>

      {s.versionsTab === "changes" ? (
        <div className="body" style={{ gap: 18, minHeight: 0 }}>
          <div className="card" style={{ flex: 1, minWidth: 0 }}>
            <div className="card-header"><h3>Uncommitted changes</h3><span className="tag" style={{ marginLeft: "auto" }}>{changes.length}</span></div>
            <div className="card-body">
              {changes.length === 0 ? (
                <div className="empty"><Icon name="check_circle" style={{ fontSize: 30, color: "var(--ink-3)" }} /><p className="muted" style={{ margin: 0 }}>No changes yet.<br />Rebind a key or paint a color in the Editor — it'll show up here.</p></div>
              ) : (
                <div className="list">
                  {changes.map((ch, i) => (
                    <div key={i} className="change-row">
                      <span className={"st " + ch.kind}>{ch.kind === "led" ? "◑" : ch.kind === "setting" ? "⚙" : "±"}</span>
                      <span className="path mono">{ch.path}</span>
                      <span className="spacer" />
                      <span className="mono before">{ch.before}</span>
                      <Icon name="arrow_forward" style={{ fontSize: 14, color: "var(--ink-3)" }} />
                      <span className="mono after">{ch.after}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="col" style={{ width: 300, flexShrink: 0, gap: 14 }}>
            <div className="card">
              <div className="card-header"><h3>Save point</h3></div>
              <div className="card-body">
                <p className="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.6 }}>Bundle these {changes.length} change{changes.length === 1 ? "" : "s"} into a named point on <b>{s.currentVariant}</b>.</p>
                <div className="field"><span className="field-label">Message</span><input className="input" id="sp-msg" defaultValue="Tweak home-row timing" /></div>
                <Btn icon="bookmark_add" tone="accent" variant="solid" disabled={!changes.length} style={{ width: "100%" }}
                  onClick={() => dispatch({ type: "SAVE_POINT", msg: (document.getElementById("sp-msg") || {}).value })}>Save point</Btn>
                <Btn icon="undo" tone="danger" disabled={!changes.length} style={{ width: "100%" }} onClick={() => dispatch({ type: "TOAST", msg: "Discard is stubbed in the prototype" })}>Discard all</Btn>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="body" style={{ gap: 18, minHeight: 0 }}>
          <div className="card" style={{ flex: 1, minWidth: 0 }}>
            <div className="card-header"><h3>Version history</h3><span className="muted mono" style={{ fontSize: 11, marginLeft: "auto" }}>{s.variants.length} variants · {s.history.length} save points</span></div>
            <div className="card-body">
              <div className="timeline">
                {tracks.map(t => (
                  <div key={t.id} className="track">
                    <div className="track-head"><span className="swatch" style={{ background: t.color }} />{t.name}{t.id === s.currentVariant && <span className="tag" style={{ background: "var(--surface-3)" }}>on</span>}</div>
                    {t.note && <div className="branch-note"><Icon name="call_split" />{t.note}</div>}
                    <div className="track-line" style={{ "--c": t.color }}>
                      {t.points.map(p => (
                        <button key={p.id} className="savepoint" onClick={() => dispatch({ type: "SELECT_SP", id: p.id })} style={{ textAlign: "left", background: s.selectedSavepoint === p.id ? "var(--surface-2)" : "transparent", borderRadius: 8, paddingLeft: 4, paddingRight: 8, marginLeft: -4 }}>
                          <span className="dot" style={{ "--c": t.color }} />
                          <span className="sp-body">
                            <span className="sp-msg">{p.msg}{latestByVariant[t.id] === p.id && t.id === s.currentVariant && <span className="tag" style={{ marginLeft: 8, background: "var(--coral)", color: "#221007" }}>current</span>}</span>
                            <span className="sp-meta">{p.id} · {p.meta}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="col" style={{ width: 320, flexShrink: 0, gap: 14 }}>
            <div className="card">
              <div className="card-header"><h3>Save point</h3></div>
              <div className="card-body">
                <div className="key-hero">
                  <div className="big-cap" style={{ background: selVariant ? selVariant.color : "var(--ink)", color: "#221007", fontSize: 13 }}>{selPoint ? selPoint.id : "—"}</div>
                  <div className="col"><div className="meta">{selVariant ? selVariant.name : ""}</div><h2 style={{ fontSize: 15 }}>{selPoint ? selPoint.msg : ""}</h2></div>
                </div>
                <div className="list" style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
                  <div className="list-row" style={{ justifyContent: "space-between" }}><span className="muted">When</span><span>{selPoint ? selPoint.meta : ""}</span></div>
                </div>
                <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                  <Btn icon="restore" onClick={() => dispatch({ type: "RESTORE", id: selPoint.id })}>Restore</Btn>
                  <Btn icon="bolt" tone="accent" variant="solid" onClick={() => dispatch({ type: "FLASH_START" })}>Flash this</Btn>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h3>Branch off a variant</h3></div>
              <div className="card-body">
                <div className="field"><span className="field-label">From</span><input className="input" defaultValue={`${s.currentVariant} @ ${selPoint ? selPoint.id : ""}`} /></div>
                <div className="field"><span className="field-label">Name</span><input className="input" id="branch-name" defaultValue="experiment-thumbcluster" /></div>
                <Btn icon="call_split" tone="accent" variant="solid" style={{ width: "100%" }} onClick={() => dispatch({ type: "BRANCH", name: (document.getElementById("branch-name") || {}).value })}>Create variant</Btn>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

window.Views = window.Views || {};
window.Views.VersionsView = VersionsView;
