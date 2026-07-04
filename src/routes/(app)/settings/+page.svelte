<script lang="ts">
  import { browser } from "$app/environment";

  import { Accent, runApp, TargetOS } from "$lib/app";
  import {
    Button,
    Card,
    SegmentedNav,
    SliderField,
    Switch,
    ToggleGroup,
  } from "$lib/components/ui";
  import type { SegmentItem } from "$lib/components/ui/types";
  import { getWorkbenchContext } from "$lib/app/workbench-store.svelte";
  import type { KeyboardSettings } from "$lib/keyboard/schema";
  import {
    isSplitKeyboard,
    isSplitTransportAllowed,
    isZmkDevice,
    normalizeSplitTransport,
    SPLIT_TRANSPORT_OPTIONS,
    splitTransportDisabledReason,
    type SplitTransport,
  } from "$lib/keyboard/split-transport";

  type BehaviorToggleKey = "permissiveHold" | "retroTapping" | "nkro";

  const workbench = getWorkbenchContext();
  let accentId = $state<Accent.AccentId>(Accent.DEFAULT_ACCENT_ID);
  let accentLoaded = $state(false);
  let preferenceError = $state<string | null>(null);

  const profile = $derived(workbench.profile);
  const settings = $derived(profile.settings);
  const baseSettings = $derived(workbench.baseProfile.settings);
  const normalizedSplitTransport = $derived(
    normalizeSplitTransport(settings.splitTransport, profile),
  );
  const activeTransport = $derived(
    SPLIT_TRANSPORT_OPTIONS.find((option) => option.id === normalizedSplitTransport) ??
      SPLIT_TRANSPORT_OPTIONS[0],
  );
  const settingsChangeCount = $derived(
    workbench.changes.filter((change) => change.kind === "setting").length,
  );
  const appPreferenceSummary = $derived(
    `${TargetOS.labels[workbench.targetOs]} key labels · ${Accent.accentById(accentId).label} accent`,
  );
  const splitTransportCopy = $derived.by(() => {
    if (isZmkDevice(profile)) return "ZMK wireless split boards use BLE; wired TRRS modes stay locked.";
    if (isSplitKeyboard(profile)) return "Pick the link used by each half in generated firmware.";
    return "Single-piece board: wired split options unlock when the active profile is a split layout.";
  });

  const osItems = [
    { value: "mac", label: "macOS", title: "Use macOS shortcut labels" },
    { value: "win", label: "Windows", title: "Use Windows shortcut labels" },
    { value: "linux", label: "Linux", title: "Use Linux shortcut labels" },
  ] satisfies SegmentItem<TargetOS.TargetOS>[];

  const behaviorToggles = [
    {
      key: "permissiveHold",
      label: "Permissive hold",
      detail: "Any other key pressed during a hold-tap counts as the hold action.",
    },
    {
      key: "retroTapping",
      label: "Retro tapping",
      detail: "When the key is released alone inside the tap window, emit the tap.",
    },
    {
      key: "nkro",
      label: "NKRO",
      detail: "Report all simultaneous keys, with USB fallback handled by firmware.",
    },
  ] satisfies ReadonlyArray<{
    key: BehaviorToggleKey;
    label: string;
    detail: string;
  }>;

  $effect(() => {
    const safe = normalizeSplitTransport(settings.splitTransport, profile);
    if (safe !== settings.splitTransport) {
      workbench.updateSettings({ splitTransport: safe });
    }
  });

  $effect(() => {
    if (!browser || accentLoaded) return;
    accentLoaded = true;
    void runApp("Load accent", Accent.loadAndApply, capturePreferenceError).then((loaded) => {
      if (loaded) accentId = loaded;
    });
  });

  function updateTiming(key: "tappingTerm" | "debounce", value: number) {
    const next = Math.round(value);
    if (key === "tappingTerm") workbench.updateSettings({ tappingTerm: next });
    else workbench.updateSettings({ debounce: next });
  }

  function updateBehavior(key: BehaviorToggleKey, value: boolean) {
    switch (key) {
      case "permissiveHold":
        workbench.updateSettings({ permissiveHold: value });
        break;
      case "retroTapping":
        workbench.updateSettings({ retroTapping: value });
        break;
      case "nkro":
        workbench.updateSettings({ nkro: value });
        break;
    }
  }

  function updateSplitTransport(mode: SplitTransport) {
    if (!isSplitTransportAllowed(mode, profile)) return;
    workbench.updateSettings({ splitTransport: mode });
  }

  function updateTargetOS(next: TargetOS.TargetOS) {
    workbench.setTargetOs(next);
  }

  function updateAccent(next: Accent.AccentId) {
    accentId = next;
    preferenceError = null;
    void runApp("Save accent", Accent.saveAndApply(next), capturePreferenceError);
  }

  function capturePreferenceError(label: string, message: string) {
    preferenceError = `${label}: ${message.split("\n")[0] ?? message}`;
  }

  function checkedValue(checked: boolean | "indeterminate" | undefined): boolean | undefined {
    return typeof checked === "boolean" ? checked : undefined;
  }
</script>

<section class="settings-page">
  <header class="settings-toolbar">
    <div class="settings-title">
      <span>Profile settings</span>
      <h2>{profile.name}</h2>
    </div>

    <div class="settings-toolbar-spacer"></div>

    <div class="settings-meter" data-empty={settingsChangeCount === 0}>
      <span class="material-symbols-outlined" aria-hidden="true">manufacturing</span>
      <strong>{settingsChangeCount}</strong>
      <small>firmware setting{settingsChangeCount === 1 ? "" : "s"} changed</small>
    </div>

    <Button variant="coral" href="/versions" disabled={workbench.dirty === 0}>
      <span class="material-symbols-outlined" aria-hidden="true">bookmark_add</span>
      Review save point
    </Button>
  </header>

  <div class="settings-grid">
    <div class="device-column">
      <Card.Root class="settings-card timing-card">
        <Card.Header class="settings-card-header">
          <div class="card-title-stack">
            <Card.Title>Timing</Card.Title>
            <Card.Description>Device-scoped behavior on the active profile</Card.Description>
          </div>
          <span class="scope-chip">profile.settings</span>
        </Card.Header>
        <Card.Content class="settings-card-body">
          <SliderField
            label="Tap term"
            min={100}
            max={300}
            suffix="ms"
            showBounds
            value={settings.tappingTerm}
            defaultValue={baseSettings.tappingTerm}
            defaultLabel="base"
            onValueChange={(value) => updateTiming("tappingTerm", value)}
          />
          <SliderField
            label="Debounce"
            min={1}
            max={20}
            suffix="ms"
            showBounds
            value={settings.debounce}
            defaultValue={baseSettings.debounce}
            defaultLabel="base"
            onValueChange={(value) => updateTiming("debounce", value)}
          />

          <div class="timing-note">
            <span class="material-symbols-outlined" aria-hidden="true">timer</span>
            <p>
              Tap term controls how long a hold-tap waits before becoming a hold. Lower values feel
              faster; higher values reduce accidental holds.
            </p>
          </div>
        </Card.Content>
      </Card.Root>

      <Card.Root class="settings-card behavior-card">
        <Card.Header class="settings-card-header">
          <div class="card-title-stack">
            <Card.Title>Behavior</Card.Title>
            <Card.Description>Global QMK/ZMK toggles stored with this variant</Card.Description>
          </div>
        </Card.Header>
        <Card.Content class="settings-card-body toggle-list">
          {#each behaviorToggles as toggle (toggle.key)}
            <label class="toggle-row">
              <span>
                <strong>{toggle.label}</strong>
                <small>{toggle.detail}</small>
              </span>
              <Switch
                checked={settings[toggle.key]}
                aria-label={toggle.label}
                onCheckedChange={(checked) => {
                  const next = checkedValue(checked);
                  if (next !== undefined) updateBehavior(toggle.key, next);
                }}
              />
            </label>
          {/each}
        </Card.Content>
      </Card.Root>

      <Card.Root class="settings-card transport-card">
        <Card.Header class="settings-card-header">
          <div class="card-title-stack">
            <Card.Title>Split Transport</Card.Title>
            <Card.Description>{splitTransportCopy}</Card.Description>
          </div>
          <span class="transport-chip">{activeTransport.name}</span>
        </Card.Header>
        <Card.Content class="settings-card-body">
          <ToggleGroup.Root
            type="single"
            value={normalizedSplitTransport}
            onValueChange={(next) => {
              if (next) updateSplitTransport(next as SplitTransport);
            }}
            class="settings-transport-grid"
            variant="outline"
          >
            {#each SPLIT_TRANSPORT_OPTIONS as option (option.id)}
              {@const allowed = isSplitTransportAllowed(option.id, profile)}
              {@const disabledReason = splitTransportDisabledReason(option.id, profile)}
              <ToggleGroup.Item
                value={option.id}
                disabled={!allowed}
                title={disabledReason ?? option.detail}
                class={`settings-transport-option${!allowed ? " disabled" : ""}`}
              >
                <strong>{option.name}</strong>
                <small>{option.detail}</small>
                {#if disabledReason}
                  <span>{disabledReason}</span>
                {/if}
              </ToggleGroup.Item>
            {/each}
          </ToggleGroup.Root>
        </Card.Content>
      </Card.Root>
    </div>

    <aside class="app-column" aria-label="Application preferences">
      <Card.Root class="settings-card app-card">
        <Card.Header class="settings-card-header">
          <div class="card-title-stack">
            <Card.Title>App Preferences</Card.Title>
            <Card.Description>{appPreferenceSummary}</Card.Description>
          </div>
          <span class="scope-chip app-scope">local</span>
        </Card.Header>
        <Card.Content class="settings-card-body app-preferences">
          <section class="preference-section">
            <div class="preference-head">
              <h3>Target OS</h3>
              <span>{TargetOS.labels[workbench.targetOs]}</span>
            </div>
            <SegmentedNav
              items={osItems}
              value={workbench.targetOs}
              onselect={updateTargetOS}
              ariaLabel="Target operating system"
              class="settings-os-segment"
            />
            <p>
              Keycaps and binding summaries use this OS when translating common shortcuts.
            </p>
          </section>

          <section class="preference-section">
            <div class="preference-head">
              <h3>Accent</h3>
              <span>{Accent.accentById(accentId).label}</span>
            </div>
            <div class="accent-grid" role="radiogroup" aria-label="Accent color">
              {#each Accent.accentOptions as accent (accent.id)}
                <button
                  type="button"
                  class="accent-swatch"
                  class:active={accent.id === accentId}
                  style={`--accent-color: ${accent.value}`}
                  role="radio"
                  aria-checked={accent.id === accentId}
                  title={`${accent.label} accent`}
                  onclick={() => updateAccent(accent.id)}
                >
                  <span aria-hidden="true"></span>
                  <strong>{accent.label}</strong>
                </button>
              {/each}
            </div>
            <p>
              Accent is an app preference. It is persisted locally and applied by overriding
              <code>--coral</code> at startup.
            </p>
          </section>

          {#if preferenceError}
            <p class="preference-error" role="status">{preferenceError}</p>
          {/if}
        </Card.Content>
      </Card.Root>
    </aside>
  </div>
</section>

<style>
  .settings-page {
    display: grid;
    gap: 18px;
    align-content: start;
    min-height: calc(100vh - 58px);
    padding: 22px;
    background:
      radial-gradient(ellipse 86% 56% at 82% 0%, color-mix(in oklch, var(--coral) 7%, transparent), transparent 66%),
      var(--paper);
  }

  .settings-toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .settings-title {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  .settings-title span {
    color: var(--ink-3);
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .settings-title h2 {
    overflow: hidden;
    margin: 0;
    font-size: 24px;
    line-height: 1.05;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .settings-toolbar-spacer {
    flex: 1;
    min-width: 12px;
  }

  .settings-meter {
    display: grid;
    grid-template-columns: 17px auto minmax(0, auto);
    align-items: center;
    gap: 6px;
    min-height: 34px;
    max-width: 250px;
    padding: 0 10px;
    border: 1px solid color-mix(in oklch, var(--coral) 34%, var(--line-2));
    border-radius: 8px;
    background: color-mix(in oklch, var(--coral) 9%, var(--surface));
    color: var(--ink);
  }

  .settings-meter[data-empty="true"] {
    border-color: var(--line-2);
    background: color-mix(in oklch, var(--surface) 68%, transparent);
    color: var(--ink-3);
  }

  .settings-meter .material-symbols-outlined {
    font-size: 17px;
  }

  .settings-meter strong {
    font-family: var(--mono);
    font-size: 13px;
  }

  .settings-meter small {
    overflow: hidden;
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .settings-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(300px, 340px);
    gap: 18px;
    align-items: start;
  }

  .device-column {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
    min-width: 0;
  }

  :global(.transport-card) {
    grid-column: 1 / -1;
  }

  .app-column {
    min-width: 0;
  }

  :global(.settings-card) {
    min-width: 0;
  }

  :global(.settings-card-header) {
    min-height: 54px;
  }

  :global(.settings-card-header > .card-title-stack) {
    display: grid;
    gap: 4px;
    min-width: 0;
    flex: 1;
  }

  :global(.settings-card-header [data-slot="card-description"]) {
    white-space: normal;
  }

  :global(.settings-card-body) {
    display: grid;
    gap: 16px;
  }

  .scope-chip,
  .transport-chip {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    padding: 0 8px;
    border: 1px solid var(--line-2);
    border-radius: 7px;
    background: var(--paper-2);
    color: var(--ink-2);
    font-family: var(--mono);
    font-size: 10px;
    white-space: nowrap;
  }

  .app-scope {
    border-color: color-mix(in oklch, var(--teal) 34%, var(--line-2));
    background: color-mix(in oklch, var(--teal) 9%, var(--paper));
  }

  .transport-chip {
    border-color: color-mix(in oklch, var(--coral) 40%, var(--line-2));
    background: color-mix(in oklch, var(--coral) 10%, var(--paper));
    color: var(--coral-ink);
  }

  .timing-note {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr);
    gap: 10px;
    align-items: start;
    padding: 11px 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: color-mix(in oklch, var(--paper-2) 72%, transparent);
  }

  .timing-note .material-symbols-outlined {
    color: var(--coral-ink);
    font-size: 20px;
  }

  .timing-note p,
  .preference-section p {
    margin: 0;
    color: var(--ink-2);
    font-size: 12px;
    line-height: 1.55;
  }

  :global(.toggle-list) {
    gap: 8px;
  }

  .toggle-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 14px;
    align-items: center;
    min-width: 0;
    padding: 11px 12px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: var(--paper-2);
  }

  .toggle-row:hover {
    border-color: var(--line-2);
  }

  .toggle-row span {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  .toggle-row strong {
    font-family: var(--mono);
    font-size: 12px;
    font-weight: 600;
  }

  .toggle-row small {
    color: var(--ink-3);
    font-size: 12px;
    line-height: 1.4;
  }

  :global(.settings-transport-grid) {
    display: grid;
    width: 100%;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }

  :global(.settings-transport-option) {
    display: flex;
    width: 100%;
    min-height: 92px;
    height: auto;
    flex-direction: column;
    align-items: flex-start;
    justify-content: flex-start;
    gap: 3px;
    padding: 12px;
    border-color: var(--line-2);
    border-radius: 8px;
    background: var(--paper);
    text-align: left;
    white-space: normal;
  }

  :global(.settings-transport-option[data-state="on"]) {
    border-color: color-mix(in oklch, var(--coral) 58%, var(--line-2));
    background: color-mix(in oklch, var(--coral) 9%, var(--paper));
    box-shadow: 0 0 0 1px color-mix(in oklch, var(--coral) 34%, transparent);
  }

  :global(.settings-transport-option.disabled) {
    opacity: 0.52;
    cursor: not-allowed;
  }

  :global(.settings-transport-option strong) {
    color: var(--ink);
    font-family: var(--mono);
    font-size: 13px;
  }

  :global(.settings-transport-option small) {
    color: var(--ink-3);
    font-size: 11px;
  }

  :global(.settings-transport-option span) {
    margin-top: auto;
    color: var(--ink-3);
    font-family: var(--mono);
    font-size: 9.5px;
    line-height: 1.25;
  }

  :global(.app-preferences) {
    gap: 18px;
  }

  .preference-section {
    display: grid;
    gap: 10px;
    min-width: 0;
  }

  .preference-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    min-width: 0;
  }

  .preference-head h3 {
    margin: 0;
    color: var(--ink-2);
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .preference-head span {
    overflow: hidden;
    color: var(--ink-3);
    font-family: var(--mono);
    font-size: 10.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(.settings-os-segment) {
    width: 100%;
  }

  :global(.settings-os-segment button) {
    flex: 1;
    min-width: 0;
    padding-inline: 8px;
  }

  .accent-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .accent-swatch {
    display: grid;
    grid-template-columns: 26px minmax(0, 1fr);
    gap: 8px;
    align-items: center;
    min-height: 38px;
    padding: 6px 8px;
    border: 1px solid var(--line-2);
    border-radius: 8px;
    background: var(--paper);
    color: var(--ink-2);
    text-align: left;
    transition:
      border-color var(--dur-fast) var(--ease-out-soft),
      background var(--dur-fast) var(--ease-out-soft),
      box-shadow var(--dur-fast) var(--ease-out-soft);
  }

  .accent-swatch:hover,
  .accent-swatch.active {
    border-color: color-mix(in oklch, var(--accent-color) 66%, var(--line-2));
    background: color-mix(in oklch, var(--accent-color) 10%, var(--paper));
  }

  .accent-swatch.active {
    box-shadow: 0 0 0 1px color-mix(in oklch, var(--accent-color) 40%, transparent);
  }

  .accent-swatch span {
    width: 26px;
    height: 22px;
    border: 1px solid rgba(27, 25, 23, 0.16);
    border-radius: 7px;
    background: var(--accent-color);
    box-shadow: inset 0 -3px 0 rgba(27, 25, 23, 0.14);
  }

  .accent-swatch strong {
    overflow: hidden;
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  code {
    padding: 1px 4px;
    border-radius: 5px;
    background: var(--paper-2);
    color: var(--ink);
    font-family: var(--mono);
    font-size: 11px;
  }

  .preference-error {
    margin: 0;
    padding: 9px 10px;
    border: 1px solid oklch(0.62 0.2 25 / 0.3);
    border-radius: 8px;
    background: oklch(0.95 0.04 25);
    color: oklch(0.42 0.15 25);
    font-size: 12px;
    line-height: 1.45;
  }

  @media (max-width: 1120px) {
    .settings-grid {
      grid-template-columns: 1fr;
    }

    .app-column {
      order: -1;
    }
  }

  @media (max-width: 820px) {
    .settings-toolbar {
      flex-wrap: wrap;
    }

    .settings-title {
      width: 100%;
    }

    .settings-toolbar-spacer {
      display: none;
    }

    .settings-meter {
      flex: 1 1 210px;
    }

    .device-column {
      grid-template-columns: 1fr;
    }

    :global(.settings-transport-grid) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 560px) {
    .settings-page {
      padding: 14px;
    }

    .settings-title h2 {
      font-size: 20px;
    }

    .settings-meter {
      max-width: none;
    }

    :global(.settings-transport-grid),
    .accent-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
