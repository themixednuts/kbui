/* global React, KbRender, KBData, KUI, KStore */
const { useStore: useStoreB } = KStore;
const { Btn, Icon, Chip } = KUI;

// Clean layout silhouette — uniform rounded cells colored by the map's accents.
// No text (which looked cramped at small sizes); consistent key sizing.
function PreviewBoard({ map, cell = 14, gap = 3 }) {
  const kb = KBData.KEYBOARDS[map.board];
  const hl = map.highlights || {};
  const base = "#E7DEC9";
  const keyStyle = (k, w, ghost) => ({
    width: w * cell + (w - 1) * gap, height: cell, borderRadius: Math.max(2, cell * 0.22),
    background: ghost ? "transparent" : (hl[k] || base),
    boxShadow: ghost ? "none" : "inset 0 -1.5px 0 rgba(0,0,0,.12)", flexShrink: 0,
  });
  if (kb.split) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap }}>
        {kb.layout.map((halves, r) => (
          <div key={r} style={{ display: "flex", gap }}>
            {halves.map((half, h) => (
              <React.Fragment key={h}>
                {h === 1 && <div style={{ width: gap * 4, flexShrink: 0 }} />}
                <div style={{ display: "flex", gap }}>{half.map((k, c) => <div key={c} style={keyStyle(`${r},${h === 0 ? c : c + 5}`, 1, k.ghost)} />)}</div>
              </React.Fragment>
            ))}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      {kb.layout.map((row, r) => (
        <div key={r} style={{ display: "flex", gap }}>{row.map((k, c) => <div key={c} style={keyStyle(`${r},${c}`, k.w || 1)} />)}</div>
      ))}
    </div>
  );
}

function Signals({ map }) {
  return (
    <div className="signals">
      <span title="Likes"><Icon name="favorite" style={{ fontSize: 14, color: "var(--coral-ink)" }} />{map.likes.toLocaleString()}</span>
      <span title="People who adopted this"><Icon name="download" style={{ fontSize: 14 }} />{map.adoptions.toLocaleString()}</span>
      {map.compiles && <span className="ok" title="Verified to compile"><Icon name="verified" style={{ fontSize: 14 }} />compiles</span>}
    </div>
  );
}

function BrowseView() {
  const [s, dispatch] = useStoreB();
  const all = KBData.COMMUNITY || [];
  const tags = ["all", ...Array.from(new Set(all.flatMap(m => m.tags)))];
  const [compatOnly, setCompatOnly] = React.useState(false);

  let list = all;
  if (s.browseTag !== "all") list = list.filter(m => m.tags.includes(s.browseTag));
  if (compatOnly && s.device) list = list.filter(m => m.board === s.boardId);
  // most-liked first, but keep it non-competitive: no ranks/positions shown
  list = [...list].sort((a, b) => b.likes - a.likes);

  const preview = all.find(m => m.id === s.previewMapId);

  return (
    <div className="body" style={{ flexDirection: "column", padding: 22, gap: 16 }}>
      <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
        <div className="browse-tags">
          {tags.map(t => (
            <button key={t} className="browse-tag" aria-pressed={s.browseTag === t ? "true" : "false"} onClick={() => dispatch({ type: "BROWSE_TAG", tag: t })}>{t}</button>
          ))}
        </div>
        <div className="spacer" />
        {s.device && (
          <button className="btn" data-htmlswap-tone="neutral" data-htmlswap-variant={compatOnly ? "solid" : "outline"} data-htmlswap-size="sm" aria-pressed={compatOnly} onClick={() => setCompatOnly(v => !v)}>
            <Icon name="check" /><span>Fits {KBData.KEYBOARDS[s.boardId].name}</span>
          </button>
        )}
      </div>

      <p className="muted" style={{ margin: 0, fontSize: 12 }}>Shared read-only — adopt one to make your own copy you can edit and flash. Sorted by likes; no rankings, no downvotes.</p>

      <div className="browse-grid">
        {list.map(m => (
          <div key={m.id} className="map-card">
            <div className="map-preview" role="button" tabIndex={0} onClick={() => dispatch({ type: "PREVIEW_MAP", id: m.id })} title="Preview">
              <PreviewBoard map={m} cell={m.board === "3x5+2" ? 15 : 13} />
            </div>
            <div className="map-info">
              <div className="row" style={{ gap: 8 }}>
                <span className="map-name">{m.name}</span>
                {m.official && <span className="tag" style={{ background: "var(--ink)", color: "var(--paper)" }}>official</span>}
              </div>
              <div className="row" style={{ gap: 6 }}><Avatar login={m.author} name={m.author} size={16} /><span className="map-by">@{m.author} · {m.layers} layers · {KBData.KEYBOARDS[m.board].name} · {m.updated}</span></div>
              <div className="row" style={{ gap: 5, flexWrap: "wrap" }}>{m.tags.map(t => <span key={t} className="tag">{t}</span>)}</div>
              <Signals map={m} />
              <div className="row" style={{ gap: 6, marginTop: "auto" }}>
                <Btn size="sm" icon="visibility" style={{ flex: 1 }} onClick={() => dispatch({ type: "PREVIEW_MAP", id: m.id })}>Preview</Btn>
                <Btn size="sm" icon="download" tone="accent" variant="solid" style={{ flex: 1 }} onClick={() => dispatch({ type: "ADOPT", id: m.id })}>Adopt</Btn>
              </div>
            </div>
          </div>
        ))}
        {list.length === 0 && <div className="empty" style={{ width: "100%" }}><Icon name="search_off" style={{ fontSize: 28, color: "var(--ink-3)" }} /><p className="muted" style={{ margin: 0 }}>No maps match that filter.</p></div>}
      </div>

      {preview && (
        <div className="overlay" onClick={() => dispatch({ type: "PREVIEW_MAP", id: null })}>
          <div className="modal" style={{ width: 560 }} onClick={e => e.stopPropagation()}>
            <div className="row" style={{ gap: 10 }}>
              <div className="col" style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ gap: 8 }}><b style={{ fontSize: 16 }}>{preview.name}</b>{preview.official && <span className="tag" style={{ background: "var(--ink)", color: "var(--paper)" }}>official</span>}</div>
                <div className="row" style={{ gap: 6 }}><Avatar login={preview.author} name={preview.author} size={16} /><span className="map-by">@{preview.author} · {preview.layers} layers · {KBData.KEYBOARDS[preview.board].name}</span></div>
              </div>
              <button className="place-x" onClick={() => dispatch({ type: "PREVIEW_MAP", id: null })}><Icon name="close" /></button>
            </div>
            <div className="map-preview big"><PreviewBoard map={preview} cell={preview.board === "3x5+2" ? 30 : 22} /></div>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--ink-2)" }}>“{preview.note}”</p>
            <div className="row" style={{ gap: 5, flexWrap: "wrap" }}>{preview.tags.map(t => <span key={t} className="tag">{t}</span>)}</div>
            <Signals map={preview} />
            <div className="row" style={{ gap: 8 }}>
              <Btn icon="download" tone="accent" variant="solid" style={{ flex: 1 }} onClick={() => dispatch({ type: "ADOPT", id: preview.id })}>Adopt as a variant</Btn>
              <Btn icon="flag" title="Report this map" onClick={() => dispatch({ type: "TOAST", msg: "Thanks — our team will review it" })}>Report</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

window.Views = window.Views || {};
window.Views.BrowseView = BrowseView;
