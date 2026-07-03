/* global React */
// Shared UI primitives for Klakson artboards.
// Everything here maps to the htmlswap widget grammar:
//   - <Btn>    → <button> with data-htmlswap-tone / -variant / -size
//   - <Seg>    → role="tablist" / role="tab" + aria-selected
//   - <Switch> → role="switch" + aria-checked
//   - <Icon>   → Material Symbol span
//   - <Topbar> → data-htmlswap-component="titlebar", unified action cluster

function Icon({ name, style }) {
  return <span className="material-symbols-outlined" style={style}>{name}</span>;
}

function Btn({ children, icon, tone = "neutral", variant = "ghost", size = "sm", onClick, disabled, style, title, pressed }) {
  return (
    <button
      className="btn"
      data-htmlswap-component="button"
      data-htmlswap-tone={tone}
      data-htmlswap-variant={variant}
      data-htmlswap-size={size}
      aria-pressed={pressed != null ? String(pressed) : undefined}
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={style}
    >
      {icon && <Icon name={icon} />}
      {children != null && <span>{children}</span>}
    </button>
  );
}

function Chip({ children, dotColor, icon }) {
  return (
    <span className="chip">
      {dotColor && <span className="dot" style={{ background: dotColor }} />}
      {icon && <Icon name={icon} />}
      {children}
    </span>
  );
}

// GitHub-based avatar. Pulls github.com/<login>.png; falls back to initials so
// an unknown handle never renders a broken image.
function Avatar({ login, name, size = 28, src }) {
  const [err, setErr] = React.useState(false);
  const url = src || (login ? `https://github.com/${login}.png?size=${Math.round(size * 2)}` : null);
  const initials = (name || login || "?").replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase();
  if (url && !err) {
    return <img className="avatar" src={url} alt={name || login} onError={() => setErr(true)} style={{ width: size, height: size }} />;
  }
  return <span className="avatar fallback" style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}>{initials}</span>;
}

// Segmented tab control — role=tablist. `value` is the active tab id.
function Seg({ value, onChange, options, style }) {
  return (
    <div className="seg" role="tablist" style={style} data-htmlswap-component="tabs">
      {options.map(o => {
        const v = typeof o === "object" ? o.value : o;
        const l = typeof o === "object" ? o.label : o;
        const on = v === value;
        return (
          <button key={v} role="tab" aria-selected={on ? "true" : "false"} onClick={() => onChange && onChange(v)}>
            {l}
          </button>
        );
      })}
    </div>
  );
}

function Switch({ checked, onChange }) {
  return (
    <button
      className="switch"
      role="switch"
      aria-checked={checked ? "true" : "false"}
      data-htmlswap-component="switch"
      onClick={() => onChange && onChange(!checked)}
    >
      <span className="knob" />
    </button>
  );
}

// Unified top bar. Left: identity + board/connection context.
// Right: ONE consistent action cluster — version, Save point, Flash — so the
// primary flow (edit → save point → flash) lives in the same place on every
// screen. `actions` overrides the default right cluster when a screen needs it
// (e.g. the diff review actions).
function Topbar({ kb, variant = "main", variantColor = "var(--ink)", connection, changeCount = 0, actions }) {
  return (
    <div className="topbar" data-htmlswap-component="titlebar" data-htmlswap-region="app.chrome">
      <div className="brand"><span className="brand-mark">K</span><span>KLAKSON</span></div>
      {kb && <Chip dotColor="var(--teal)">{kb.name}</Chip>}
      {kb && <span className="chip mono">{kb.protocol}</span>}
      <div className="spacer" />
      {actions || (
        <>
          <Chip icon="account_tree" dotColor={variantColor}>{variant}</Chip>
          {changeCount > 0 && (
            <Btn icon="bookmark_add" variant="outline">Save point · {changeCount}</Btn>
          )}
          {connection === "connected"
            ? <Btn icon="bolt" tone="accent" variant="solid">Flash</Btn>
            : <Btn icon="usb" variant="outline" title="Connect a device to flash">Connect</Btn>}
        </>
      )}
    </div>
  );
}

// Layer selector. Clicking a layer makes it the active/primary layer on top of
// BASE. aria-pressed marks the active one.
function LayerStack({ layers, activeStack, setActiveStack }) {
  const setPrimary = (id) => {
    if (id === "BASE") { setActiveStack(["BASE"]); return; }
    setActiveStack([id, "BASE"]);
  };
  const active = activeStack[0];
  return (
    <div className="layer-row" role="group" aria-label="Layers">
      {layers.map(l => (
        <button
          key={l.id}
          className="layer-chip"
          aria-pressed={active === l.id ? "true" : "false"}
          style={{ "--c": l.color }}
          onClick={() => setPrimary(l.id)}
        >
          <span className="swatch" style={{ background: l.color }} />
          {l.name}
        </button>
      ))}
    </div>
  );
}

// Keycode picker used by inspectors. `value` is the current code.
function KeycodePicker({ value, onPick, compact }) {
  const groups = compact
    ? [["Common", ["A","S","D","F","G","H","J","K","L","SCLN","ESC","TAB","SPC","ENT","BSPC","LSFT","LCTL","LALT","LGUI"]]]
    : [
        ["Letters", ["A","B","C","D","E","F","G","H","I","J","K","L","M"]],
        ["Mods", ["LCTL","LSFT","LALT","LGUI","RCTL","RSFT","RALT","HYPR","MEH"]],
        ["Layers", ["MO(NAV)","MO(SYM)","MO(NUM)","MO(FN)","TG(GAME)","LT(NAV,SPC)"]],
        ["Nav", ["LEFT","DOWN","UP","RIGHT","HOME","END","PGUP","PGDN"]],
        ["Media", ["MUTE","VOL+","VOL-","PLAY","PREV","NEXT"]],
      ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {groups.map(([name, codes]) => (
        <div className="kc-group" key={name}>
          <div className="field-label">{name}</div>
          <div className="kc-grid">
            {codes.map(c => (
              <button key={c} className="kc-pill" aria-pressed={value === c ? "true" : "false"} onClick={() => onPick && onPick(c)}>{c}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

window.KUI = { Icon, Btn, Chip, Avatar, Seg, Switch, Topbar, LayerStack, KeycodePicker };
