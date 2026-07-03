/* global React, KUI, KStore */
const { useStore: useShell } = KStore;
const { Btn, Icon, Chip, Avatar } = KUI;
const V = window.Views;

const NAV = [
  { route: "connect", icon: "cable", label: "Connect" },
  { route: "editor", icon: "keyboard", label: "Editor" },
  { route: "browse", icon: "explore", label: "Browse" },
  { route: "library", icon: "dashboard_customize", label: "Library" },
  { route: "versions", icon: "history", label: "Versions" },
  { route: "settings", icon: "tune", label: "Settings" },
];
const TITLES = { editor: "Editor", browse: "Browse community", library: "Library", versions: "Versions", settings: "Settings", connect: "Connect" };

function AppShell() {
  const [s, dispatch] = useShell();

  React.useEffect(() => {
    if (!s.toast) return;
    const t = setTimeout(() => dispatch({ type: "CLEAR_TOAST" }), 2400);
    return () => clearTimeout(t);
  }, [s.toast]);

  const view = s.route === "editor" ? <V.EditorView />
    : s.route === "browse" ? <V.BrowseView />
    : s.route === "library" ? <V.LibraryView />
    : s.route === "versions" ? <V.VersionsView />
    : s.route === "settings" ? <V.SettingsView />
    : <V.ConnectView />;

  const variant = s.variants.find(v => v.id === s.currentVariant);
  const placingSingle = s.placeMode && s.placeMode.kind !== "combo";
  const acc = s.account;
  const mt = acc.monkeytype;

  return (
    <div className="app">
      <nav className="nav" data-htmlswap-region="app.nav">
        <div className="nav-brand"><span className="brand-mark">K</span><span className="mono">KLAKSON</span></div>
        <div className="nav-items">
          {NAV.map(n => {
            const on = s.route === n.route;
            const done = n.route === "connect" && s.device;
            return (
              <button key={n.route} className="nav-item" aria-current={on ? "page" : undefined} onClick={() => dispatch({ type: "NAV", route: n.route })}>
                <Icon name={n.icon} />
                <span>{n.label}</span>
                {done && <Icon name="check_circle" style={{ fontSize: 15, marginLeft: "auto", color: "var(--mint)" }} />}
              </button>
            );
          })}
        </div>
        <div className="nav-foot">
          {acc.signedIn && s.profileOpen && (
            <div className="profile-pop">
              <div className="pp-head">
                <Avatar login={acc.login} name={acc.name} size={40} />
                <div className="col" style={{ minWidth: 0 }}>
                  <b style={{ fontSize: 13 }}>{acc.name}</b>
                  <span className="acc-login">@{acc.login} · GitHub</span>
                </div>
              </div>
              <div className="divider" />
              {mt.connected ? (
                <div className="mt">
                  <div className="mt-head"><Icon name="keyboard_alt" style={{ fontSize: 15 }} />Monkeytype<a className="mt-link" href={`https://monkeytype.com/profile/${acc.login}`} target="_blank" rel="noreferrer">open ↗</a></div>
                  <div className="mt-grid">
                    <div className="mt-stat"><b>{mt.wpm}</b><span>wpm avg</span></div>
                    <div className="mt-stat"><b>{mt.accuracy}%</b><span>accuracy</span></div>
                    <div className="mt-stat"><b>{mt.pb}</b><span>pb wpm</span></div>
                    <div className="mt-stat"><b>{mt.tests.toLocaleString()}</b><span>tests</span></div>
                  </div>
                  <button className="pp-item subtle" onClick={() => dispatch({ type: "MT_TOGGLE" })}><Icon name="link_off" style={{ fontSize: 15 }} />Disconnect Monkeytype</button>
                </div>
              ) : (
                <button className="pp-item" onClick={() => dispatch({ type: "MT_TOGGLE" })}><Icon name="link" style={{ fontSize: 16 }} />Connect Monkeytype</button>
              )}
              <div className="divider" />
              <button className="pp-item" onClick={() => dispatch({ type: "SIGN_OUT" })}><Icon name="logout" style={{ fontSize: 16 }} />Sign out</button>
            </div>
          )}
          {acc.signedIn ? (
            <button className="account" aria-expanded={s.profileOpen} onClick={() => dispatch({ type: "TOGGLE_PROFILE" })}>
              <Avatar login={acc.login} name={acc.name} size={30} />
              <div className="col" style={{ minWidth: 0, flex: 1, alignItems: "flex-start" }}>
                <span className="acc-name">{acc.name}</span>
                <span className="acc-login">@{acc.login}</span>
              </div>
              <Icon name={s.profileOpen ? "expand_more" : "expand_less"} style={{ fontSize: 18, color: "var(--ink-3)" }} />
            </button>
          ) : (
            <button className="btn gh-signin" onClick={() => dispatch({ type: "SIGN_IN" })}><Icon name="login" /><span>Sign in with GitHub</span></button>
          )}
          {s.device
            ? <div className="nav-device"><span className="dot" style={{ background: "var(--mint)" }} /><div className="col" style={{ minWidth: 0 }}><span className="mono" style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.device.name}</span><span className="mono muted" style={{ fontSize: 10 }}>{s.device.protocol}</span></div></div>
            : <div className="nav-device muted"><span className="dot" style={{ background: "var(--ink-3)" }} /><span className="mono" style={{ fontSize: 12 }}>No device</span></div>}
        </div>
      </nav>

      <div className="app-main">
        {s.route !== "connect" && (
          <header className="appbar" data-htmlswap-component="titlebar">
            <h2>{TITLES[s.route]}</h2>
            {s.device && <Chip dotColor="var(--teal)">{s.device.name}</Chip>}
            <Chip icon="account_tree" dotColor={variant ? variant.color : "var(--ink)"}>{variant ? variant.name : "main"}</Chip>
            <div className="spacer" />
            {acc.signedIn && mt.connected && <Chip icon="speed" title="Your Monkeytype average">{mt.wpm} wpm</Chip>}
            {s.dirty > 0 && <Btn icon="bookmark_add" variant="outline" onClick={() => { dispatch({ type: "VERSIONS_TAB", tab: "changes" }); dispatch({ type: "NAV", route: "versions" }); }}>Save point · {s.dirty}</Btn>}
            {s.device
              ? <Btn icon="bolt" tone="accent" variant="solid" onClick={() => dispatch({ type: "FLASH_START" })}>Flash</Btn>
              : <Btn icon="cable" variant="outline" onClick={() => dispatch({ type: "NAV", route: "connect" })}>Connect</Btn>}
          </header>
        )}

        {placingSingle && (
          <div className="place-banner">
            <Icon name="ads_click" />
            <span>Placing <b>{s.placeMode.label}</b> — click a key on the board</span>
            <div className="spacer" />
            <button className="place-x" onClick={() => dispatch({ type: "CANCEL_PLACE" })}><Icon name="close" /></button>
          </div>
        )}

        <main className="app-content">{view}</main>
      </div>

      {s.toast && <div className="toast">{s.toast}</div>}
      <V.FlashOverlay />
    </div>
  );
}

window.AppShell = AppShell;
