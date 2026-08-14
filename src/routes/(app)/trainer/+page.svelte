<script lang="ts">
  import { Effect } from "effect";
  import { Gauge } from "@lucide/svelte";
  import { onMount } from "svelte";

  import { forkApp, runAppSync } from "$lib/app/runtime";
  import { getWorkbenchContext } from "$lib/app/workbench-store.svelte";
  import {
    applyCoachSuggestionEffect,
    CODING_NGRAMS_V1,
    CoachSuggestResult,
    confusionPairsFromPractice,
    hasEnoughPracticeData,
    layoutFixtureFromProfile,
    loadLayerRolesEffect,
    LAYER_ROLE_OPTIONS,
    loadNeverMovesEffect,
    loadRecentAcceptsEffect,
    addNeverMoveEffect,
    personalStatsFromPractice,
    practiceSampleCount,
    recordAcceptEffect,
    setLayerRoleEffect,
    suggestCoach,
    type CoachSuggestion,
    type LayerRoleMapT,
    type LayerRoleT,
  } from "$lib/coach";

  type CoachSuggestResultT = typeof CoachSuggestResult.Type;
  import { KeyboardBoard } from "$lib/components/board";
  import EditorLayerStack from "$lib/components/editor/EditorLayerStack.svelte";
  import { Button, Checkbox, Chip, NativeSelect, Spinner } from "$lib/components/ui";
  import * as Alert from "$lib/components/ui/alert/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Empty from "$lib/components/ui/empty/index.js";
  import type { EditingParadigm } from "$lib/modal-engine";
  import {
    abortSession,
    applyPracticeInput,
    browserKeyToModalKey,
    bufferCells,
    confidenceChips,
    createNavDrillEffect,
    createSessionState,
    hasActionStream,
    heatmapFromPractice,
    isPracticeArmKey,
    loadPracticeSessionsEffect,
    modsFromKeyboardEvent,
    navDrillLayer,
    feedNavKeyEffect,
    prepareDrill,
    recordLayerHop,
    resolveBoardPulse,
    resolveTextPulse,
    RUST_TEXT_DRILL_V1,
    savePracticeSessionEffect,
    sessionProgress,
    strokeFromKeyboardEvent,
    summarizeSession,
    timeoutSession,
    type BufferCell,
    type ConfidenceChip,
    type KeyboardLayoutRef,
    type NavDrillHandle,
    type PracticeMode,
    type PracticeScript,
    type PracticeSessionSummary,
    type SessionState,
    type StrokeContext,
  } from "$lib/practice";

  const workbench = getWorkbenchContext();

  let mode = $state<PracticeMode>("rust-text");
  let adaptive = $state(true);
  /** keybr-style finish-the-text is default; timed is optional. */
  let goalKind = $state<"until-complete" | "timed">("until-complete");
  let paradigm = $state<EditingParadigm>("helix");
  let running = $state(false);
  let remainingSec = $state(60);
  let elapsedSec = $state(0);
  let progressLabel = $state<string | null>(null);
  let script = $state<PracticeScript>(RUST_TEXT_DRILL_V1);
  let session = $state<SessionState | null>(null);
  let startedAt = $state<string | null>(null);
  let startedMs = $state(0);
  let sessions = $state<PracticeSessionSummary[]>([]);
  let chips = $state<ConfidenceChip[]>([]);
  let lastSummary = $state<PracticeSessionSummary | null>(null);
  let coachResult = $state<CoachSuggestResultT | null>(null);
  let previewAfter = $state(false);
  let coachError = $state<string | null>(null);
  let coachBusy = $state(false);
  let preparing = $state(false);
  let navHandle = $state<NavDrillHandle | null>(null);
  let pulseHint = $state<string | null>(null);
  let pulseKeyIds = $state<string[]>([]);
  let pulseCompanionIds = $state<string[]>([]);
  let ignoreNextLayerHop = $state(false);
  let layerRoles = $state<LayerRoleMapT | null>(null);
  let cells = $state<BufferCell[]>([]);
  let showActions = $state(false);
  let sampleCount = $state(0);
  let enoughData = $state(false);
  let boardZoom = $state(1);
  let boardPan = $state({ x: 0, y: 0 });
  let trackedLayerId = $state<string | null>(null);

  const coachMarked = $derived(
    coachResult?._tag === "Suggestion"
      ? coachResult.suggestion.diffs.map((d) => d.keyId)
      : ([] as string[]),
  );
  /** Coral = target glyph (or coach diffs when idle). Teal = mod / layer activators. */
  const boardSelection = $derived(
    pulseKeyIds.length > 0 ? pulseKeyIds : coachMarked,
  );
  const boardMarked = $derived(
    pulseCompanionIds.length > 0 ? pulseCompanionIds : ([] as string[]),
  );
  const activeLayerRole = $derived(
    layerRoles?.assignments.find((assignment) => assignment.layerId === workbench.activeLayer) ??
      null,
  );
  const recentSessions = $derived(sessions.slice(0, 8));

  /** Live workbench profile, or preview-after bindings when coach preview is on. */
  const boardProfile = $derived.by(() => {
    const base = workbench.profile;
    if (!previewAfter || coachResult?._tag !== "Suggestion") return base;
    const diffs = coachResult.suggestion.diffs;
    return {
      ...base,
      layers: base.layers.map((layer) => {
        const nextBindings = { ...layer.bindings };
        for (const diff of diffs) {
          if (diff.layerId !== layer.id) continue;
          nextBindings[diff.keyId] = {
            ...(nextBindings[diff.keyId] ?? { code: diff.before }),
            code: diff.after,
          };
        }
        return { ...layer, bindings: nextBindings };
      }),
    };
  });

  const heatByKeyId = $derived(
    runAppSync(
      heatmapFromPractice({
        profile: workbench.profile,
        sessions,
        activeLayerId: workbench.activeLayer,
        script,
      }),
    ),
  );

  const keyboardRef = $derived<KeyboardLayoutRef>({
    keyboardId: workbench.profile.id,
    keyboardName: workbench.profile.name,
    layoutId: workbench.activeVariantId,
    layoutName: workbench.profile.name,
    layoutHash: workbench.profile.updatedAt,
    profileId: workbench.profile.id,
  });

  const upcoming = $derived(
    showActions ? script.actions.slice(session?.actionIndex ?? 0, (session?.actionIndex ?? 0) + 6) : [],
  );

  function cellPhase(cell: BufferCell): "typed" | "current" | "ghost" {
    if (!session) return "ghost";
    // Idle ready: caret on the first atom so typing can arm the session.
    if (!running) {
      if (cell.atomIndex > session.atomIndex) return "ghost";
      if (cell.atomIndex < session.atomIndex) return "ghost";
      return "current";
    }
    if (cell.atomIndex < session.atomIndex) return "typed";
    if (cell.atomIndex > session.atomIndex) return "ghost";

    if (cell.kind === "indent") {
      const sub = Number(cell.id.split("-").at(-1) ?? "0");
      if (sub < session.indent.pendingSpaces) return "typed";
      if (sub === session.indent.pendingSpaces) return "current";
      return "ghost";
    }
    return "current";
  }

  function refreshDerived(nextSessions: PracticeSessionSummary[], nextScript: PracticeScript) {
    chips = runAppSync(confidenceChips(nextScript, nextSessions));
    showActions = runAppSync(hasActionStream(nextScript));
    sampleCount = runAppSync(practiceSampleCount(nextSessions));
    enoughData = runAppSync(hasEnoughPracticeData(nextSessions));
  }

  function refreshLayerRoles() {
    forkApp(
      "practice.layer-roles",
      Effect.gen(function* () {
        const roles = yield* loadLayerRolesEffect(workbench.profile);
        yield* Effect.sync(() => {
          layerRoles = roles;
        });
      }),
      (_label, message) => {
        coachError = message;
      },
    );
  }

  function lockActiveLayerRole(role: LayerRoleT) {
    forkApp(
      "practice.lock-layer-role",
      Effect.gen(function* () {
        const roles = yield* setLayerRoleEffect(workbench.profile, workbench.activeLayer, role);
        yield* Effect.sync(() => {
          layerRoles = roles;
        });
      }),
      (_label, message) => {
        coachError = message;
      },
    );
  }

  function refreshCells(nextScript: PracticeScript, nextSession: SessionState | null) {
    const state = nextSession ?? runAppSync(createSessionState(nextScript, 0));
    cells = runAppSync(bufferCells(state.document, state.indent.locked));
  }

  function hydrateSessions() {
    forkApp(
      "practice.load",
      Effect.gen(function* () {
        const loaded = yield* loadPracticeSessionsEffect().pipe(
          Effect.catch(() => Effect.succeed<PracticeSessionSummary[]>([])),
        );
        yield* Effect.sync(() => {
          sessions = [...loaded];
          prepareIdle();
        });
      }),
      (_label, message) => {
        coachError = message;
      },
    );
  }

  onMount(() => {
    hydrateSessions();
    refreshLayerRoles();
  });

  function selectMode(nextMode: PracticeMode) {
    mode = nextMode;
    if (running) stopTimerAndPersist("aborted");
    else prepareIdle();
  }

  /** Idle-ready buffer — typing arms the clock (keybr/Monkeytype). */
  function prepareIdle() {
    coachError = null;
    running = false;
    startedAt = null;
    progressLabel = null;
    preparing = true;
    forkApp(
      "practice.prepare",
      Effect.gen(function* () {
        const prepared = yield* prepareDrill({
          mode,
          adaptive,
          sessions,
          goalKind,
          seed: Date.now(),
        });
        yield* Effect.sync(() => {
          script = prepared.script;
          session = prepared.session;
          remainingSec = prepared.script.goal._tag === "Timed" ? prepared.script.goal.seconds : 0;
          elapsedSec = 0;
          pulseHint = null;
          pulseKeyIds = [];
          pulseCompanionIds = [];
          navHandle = null;
          refreshDerived(sessions, prepared.script);
          refreshCells(prepared.script, prepared.session);
        });

        if (mode === "nav") {
          const handle = yield* createNavDrillEffect(paradigm).pipe(
            Effect.provide(navDrillLayer),
          );
          yield* Effect.sync(() => {
            navHandle = handle;
            updatePulse();
          });
          return;
        }
        yield* Effect.sync(() => updatePulse());
      }).pipe(Effect.ensuring(Effect.sync(() => (preparing = false)))),
      (_label, message) => {
        coachError = message;
      },
    );
  }

  function armSessionClock() {
    if (running) return;
    startedAt = new Date().toISOString();
    startedMs = performance.now();
    running = true;
    lastSummary = null;
    if (session) refreshProgress(script, session);
  }

  function refreshProgress(nextScript: PracticeScript, nextSession: SessionState | null) {
    if (!nextSession || !running) {
      progressLabel = null;
      return;
    }
    const progress = runAppSync(sessionProgress(nextScript, nextSession));
    progressLabel = `${progress.done}/${progress.total}`;
  }

  function updatePulse() {
    if (!session || session.finished) {
      pulseHint = null;
      pulseKeyIds = [];
      pulseCompanionIds = [];
      return;
    }

    if (showActions) {
      const action = script.actions[session.actionIndex];
      forkApp(
        "practice.pulse",
        Effect.gen(function* () {
          const target = yield* resolveBoardPulse({
            profile: workbench.profile,
            expected: action?.expected,
            roles: layerRoles ?? undefined,
            preferLayerId: workbench.activeLayer,
          });
          yield* Effect.sync(() => {
            pulseHint = target.keyHint || null;
            pulseKeyIds = [...target.keyIds];
            pulseCompanionIds = [];
            if (target.layerId && target.layerId !== workbench.activeLayer) {
              ignoreNextLayerHop = true;
              workbench.setLayer(target.layerId);
            }
          });
        }),
        (_label, message) => {
          coachError = message;
        },
      );
      return;
    }

    const atom = session.document.atoms[session.atomIndex];
    forkApp(
      "practice.text-pulse",
      Effect.gen(function* () {
        const target = yield* resolveTextPulse({
          profile: workbench.profile,
          atom,
          activeLayerId: workbench.activeLayer,
          indentUsesTab: session!.indent.locked?._tag === "Tabs",
          roles: layerRoles ?? undefined,
          sessions,
          hopPressure: session!.layerHopsSinceLast,
        });
        yield* Effect.sync(() => {
          pulseHint = target.keyHint || null;
          pulseKeyIds = [...target.keyIds];
          pulseCompanionIds = [
            ...new Set([...target.modKeyIds, ...target.layerActivatorKeyIds]),
          ];
          if (target.layerId && target.layerId !== workbench.activeLayer) {
            ignoreNextLayerHop = true;
            workbench.setLayer(target.layerId);
          }
        });
      }),
      (_label, message) => {
        coachError = message;
      },
    );
  }

  function buildStrokeContext(ev: KeyboardEvent): Effect.Effect<StrokeContext> {
    return Effect.gen(function* () {
      const mods = yield* modsFromKeyboardEvent(ev);
      const atom = session?.document.atoms[session.atomIndex];
      const target = yield* resolveTextPulse({
        profile: workbench.profile,
        atom,
        activeLayerId: workbench.activeLayer,
        indentUsesTab: session?.indent.locked?._tag === "Tabs",
        roles: layerRoles ?? undefined,
        sessions,
        hopPressure: session?.layerHopsSinceLast ?? 0,
      });
      const companions = [...new Set([...target.modKeyIds, ...target.layerActivatorKeyIds])];
      return {
        activeLayerId: workbench.activeLayer,
        mods,
        predictedLayerId: target.layerId ?? null,
        predictedKeyIds: [...new Set([...target.keyIds, ...companions])],
        predictedCode: target.bindingCode || null,
        predictedHint: target.keyHint || null,
        layerHopsSinceLast: session?.layerHopsSinceLast ?? 0,
        modKeyIds: [...target.modKeyIds],
        layerActivatorKeyIds: [...target.layerActivatorKeyIds],
        ...(target.path ? { predictedPath: target.path } : {}),
        ...(target.modHomeLayerId ? { modHomeLayerId: target.modHomeLayerId } : {}),
        ...(target.modActivation ? { modActivation: target.modActivation } : {}),
        ...(target.layerAccessKind ? { layerAccessKind: target.layerAccessKind } : {}),
      } satisfies StrokeContext;
    });
  }

  function stopTimerAndPersist(reason: "completed" | "timeout" | "aborted") {
    if (!session || !startedAt || !running) return;
    running = false;
    const endedAt = new Date().toISOString();
    const atMs = Math.round(performance.now() - startedMs);
    const started = startedAt;
    const current = session;
    forkApp(
      "practice.persist",
      Effect.gen(function* () {
        let finalState = current;
        if (!finalState.finished) {
          if (reason === "timeout") finalState = yield* timeoutSession(finalState, atMs);
          else if (reason === "aborted") finalState = yield* abortSession(finalState, atMs);
        }
        const summary = yield* summarizeSession(
          script,
          finalState,
          keyboardRef,
          `practice-${Date.now()}`,
          started,
          endedAt,
        );
        yield* savePracticeSessionEffect(summary);
        const loaded = yield* loadPracticeSessionsEffect().pipe(
          Effect.catch(() => Effect.succeed<PracticeSessionSummary[]>([])),
        );
        yield* Effect.sync(() => {
          lastSummary = summary;
          sessions = [...loaded];
        });
        const coached = yield* Effect.result(
          Effect.gen(function* () {
            const never = yield* loadNeverMovesEffect(
              keyboardRef.profileId ?? keyboardRef.keyboardId,
              keyboardRef.layoutId,
            );
            const recent = yield* loadRecentAcceptsEffect(
              keyboardRef.profileId ?? keyboardRef.keyboardId,
              keyboardRef.layoutId,
            );
            const personal = yield* personalStatsFromPractice(loaded);
            const confusion = yield* confusionPairsFromPractice(loaded);
            const roles = yield* loadLayerRolesEffect(workbench.profile);
            const layout = yield* layoutFixtureFromProfile(workbench.profile, roles);
            const result = yield* suggestCoach({
              layout,
              ngrams: CODING_NGRAMS_V1,
              personal,
              confusion,
              neverMoveIds: never,
              recentAccepts: recent,
              requirePersonal: false,
              seed: Date.now() % 10_000,
            });
            return { roles, result };
          }),
        );
        yield* Effect.sync(() => {
          if (coached._tag === "Success") {
            layerRoles = coached.success.roles;
            coachResult = coached.success.result;
          } else {
            coachError = String(coached.failure);
          }
          prepareIdle();
        });
      }),
      (_label, message) => {
        coachError = message;
      },
    );
  }

  $effect(() => {
    if (!running || !session) return;
    const goal = script.goal;
    const limitSec = goal._tag === "Timed" ? goal.seconds : null;
    const tick = window.setInterval(() => {
      const elapsed = (performance.now() - startedMs) / 1000;
      elapsedSec = Math.floor(elapsed);
      if (limitSec !== null) {
        remainingSec = Math.max(0, Math.ceil(limitSec - elapsed));
        if (remainingSec <= 0) {
          window.clearInterval(tick);
          stopTimerAndPersist("timeout");
        }
      }
    }, 200);
    return () => window.clearInterval(tick);
  });

  $effect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (!session || session.finished) return;
      if (ev.key === "Tab" && mode === "nav") return;

      forkApp(
        "practice.key",
        Effect.gen(function* () {
          const arm = yield* isPracticeArmKey(ev);
          const isBackspace = ev.key === "Backspace";
          if (!arm && !(isBackspace && running)) return;

          if (!running) {
            yield* Effect.sync(() => {
              armSessionClock();
              ev.preventDefault();
            });
          }

          const atMs = Math.round(performance.now() - startedMs);

          if (mode === "nav" && navHandle) {
            if (isBackspace) return;
            yield* Effect.sync(() => ev.preventDefault());
            const key = browserKeyToModalKey(ev.key.length === 1 ? ev.key : ev.key, {
              control: ev.ctrlKey,
              shift: ev.shiftKey,
              alt: ev.altKey,
              meta: ev.metaKey,
            });
            const out = yield* feedNavKeyEffect({
              handle: navHandle!,
              script,
              state: session!,
              atMs,
              key,
            }).pipe(Effect.provide(navDrillLayer));
            yield* Effect.sync(() => {
              navHandle = out.handle;
              session = out.state;
              refreshCells(script, out.state);
              refreshProgress(script, out.state);
              updatePulse();
              if (out.state.finished) stopTimerAndPersist("completed");
            });
            return;
          }

          const stroke = yield* strokeFromKeyboardEvent(ev).pipe(
            Effect.catchTag("Practice.UnknownKeyStroke", () => Effect.succeed(null)),
          );
          if (!stroke) return;
          yield* Effect.sync(() => ev.preventDefault());
          const context = yield* buildStrokeContext(ev);
          const next = yield* applyPracticeInput(script, session!, {
            atMs,
            stroke,
            context,
          });
          yield* Effect.sync(() => {
            session = next;
            refreshCells(script, next);
            refreshProgress(script, next);
            updatePulse();
            if (next.finished) stopTimerAndPersist("completed");
          });
        }),
        (_label, message) => {
          coachError = message;
        },
      );
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  $effect(() => {
    const layerId = workbench.activeLayer;
    if (!session) {
      trackedLayerId = layerId;
      return;
    }
    const from = trackedLayerId;
    trackedLayerId = layerId;
    if (!from || from === layerId) return;
    // Pulse preview switches layers for guidance — not juggling.
    if (ignoreNextLayerHop) {
      ignoreNextLayerHop = false;
      return;
    }
    const atMs = running ? Math.round(performance.now() - startedMs) : 0;
    forkApp(
      "practice.layer-hop",
      Effect.gen(function* () {
        const next = yield* recordLayerHop(session!, atMs, from, layerId);
        yield* Effect.sync(() => {
          session = next;
        });
      }),
      (_label, message) => {
        coachError = message;
      },
    );
  });

  function openCoach(requirePersonal: boolean) {
    if (coachBusy) return;
    coachError = null;
    coachBusy = true;
    forkApp(
      "coach.suggest",
      Effect.gen(function* () {
        const profileId = keyboardRef.profileId ?? keyboardRef.keyboardId;
        const never = yield* loadNeverMovesEffect(profileId, keyboardRef.layoutId);
        const recent = yield* loadRecentAcceptsEffect(profileId, keyboardRef.layoutId);
        const personal = yield* personalStatsFromPractice(sessions);
        const confusion = yield* confusionPairsFromPractice(sessions);
        const roles = yield* loadLayerRolesEffect(workbench.profile);
        const layout = yield* layoutFixtureFromProfile(workbench.profile, roles);
        const result = yield* suggestCoach({
          layout,
          ngrams: CODING_NGRAMS_V1,
          personal,
          confusion,
          neverMoveIds: never,
          recentAccepts: recent,
          requirePersonal,
          seed: 11,
        });
        yield* Effect.sync(() => {
          layerRoles = roles;
          coachResult = result;
        });
      }).pipe(Effect.ensuring(Effect.sync(() => (coachBusy = false)))),
      (_label, message) => {
        coachError = message;
      },
    );
  }

  function rejectSuggestion(never: boolean) {
    const suggestion = coachSuggestion();
    if (!suggestion) {
      coachResult = null;
      return;
    }
    if (never) {
      forkApp(
        "coach.never",
        Effect.gen(function* () {
          yield* addNeverMoveEffect(
            keyboardRef.profileId ?? keyboardRef.keyboardId,
            keyboardRef.layoutId,
            suggestion.moveId,
          );
          yield* Effect.sync(() => {
            coachResult = null;
          });
        }),
        (_label, message) => {
          coachError = message;
          coachResult = null;
        },
      );
      return;
    }
    coachResult = null;
  }

  function coachSuggestion(): CoachSuggestion | null {
    return coachResult?._tag === "Suggestion" ? coachResult.suggestion : null;
  }

  function isGoalKind(value: string): value is "until-complete" | "timed" {
    return value === "until-complete" || value === "timed";
  }

  function isBuiltinParadigm(value: string): value is "helix" | "vim" | "vscode" {
    return value === "helix" || value === "vim" || value === "vscode";
  }

  function acceptSuggestion() {
    const suggestion = coachSuggestion();
    if (!suggestion) return;
    coachError = null;
    forkApp(
      "coach.accept",
      Effect.gen(function* () {
        const applied = yield* applyCoachSuggestionEffect({
          workbench,
          suggestion: {
            ...suggestion,
            diffs: suggestion.diffs,
          },
        });
        yield* recordAcceptEffect(
          keyboardRef.profileId ?? keyboardRef.keyboardId,
          keyboardRef.layoutId,
          suggestion.moveId,
          suggestion.diffs.map((d) => d.keyId),
        );
        yield* Effect.sync(() => {
          if (applied.liveWriteError) coachError = applied.liveWriteError;
          coachResult = null;
        });
      }),
      (_label, message) => {
        coachError = message;
      },
    );
  }
</script>

<div class="trainer-route min-h-[calc(100vh-58px)] bg-paper p-kb-22 max-[640px]:p-kb-12">
  <div class="grid gap-kb-16 lg:grid-cols-[minmax(0,1fr)_280px]">
    <Card.Root class="overflow-hidden">
      <Card.Header class="flex flex-wrap items-center gap-kb-8 border-b border-line-2 pb-kb-12">
        <div class="flex flex-wrap gap-kb-6">
          {#each [
            { id: "rust-text", label: "Rust" },
            { id: "symbols", label: "Symbols" },
            { id: "nav", label: "Nav" },
          ] as item (item.id)}
            <Button
              size="sm"
              variant={mode === item.id ? "solid" : "ghost"}
              onclick={() => selectMode(item.id as PracticeMode)}
            >
              {item.label}
            </Button>
          {/each}
        </div>
        <label class="ml-auto flex items-center gap-kb-6 font-mono text-[11px] text-ink-3 max-[640px]:ml-0">
          <Checkbox
            checked={adaptive}
            disabled={mode === "nav" || running}
            aria-label="Adaptive drills"
            onCheckedChange={(next) => {
              adaptive = next === true;
              if (!running) prepareIdle();
            }}
          />
          Adaptive
        </label>
        <NativeSelect.Root
          class="w-auto min-w-28 font-mono text-[11px] max-[640px]:w-full"
          size="sm"
          value={goalKind}
          disabled={running}
          aria-label="Drill length"
          onchange={(event) => {
            const next = event.currentTarget.value;
            if (!isGoalKind(next)) return;
            goalKind = next;
            if (!running) prepareIdle();
          }}
        >
          <NativeSelect.Option value="until-complete">Until done</NativeSelect.Option>
          <NativeSelect.Option value="timed">60s</NativeSelect.Option>
        </NativeSelect.Root>
        {#if mode === "nav"}
          <NativeSelect.Root
            class="w-auto min-w-28 font-mono text-[11px] max-[640px]:w-full"
            size="sm"
            value={paradigm}
            disabled={running}
            aria-label="Nav paradigm"
            onchange={(event) => {
              const next = event.currentTarget.value;
              if (!isBuiltinParadigm(next)) return;
              paradigm = next;
            }}
          >
            <NativeSelect.Option value="helix">Helix</NativeSelect.Option>
            <NativeSelect.Option value="vim">Vim</NativeSelect.Option>
            <NativeSelect.Option value="vscode">VS Code</NativeSelect.Option>
          </NativeSelect.Root>
        {/if}
        <Button
          size="sm"
          disabled={preparing && !running}
          onclick={() => (running ? stopTimerAndPersist("aborted") : prepareIdle())}
        >
          {#if preparing && !running}
            <Spinner />
          {:else}
            <Gauge size={14} />
          {/if}
          {running ? "Abort" : preparing ? "Loading" : "New"}
        </Button>
        {#if running}
          <Chip tone={script.goal._tag === "Timed" ? "warning" : "neutral"}>
            {#if script.goal._tag === "Timed"}
              {remainingSec}s
            {:else}
              {elapsedSec}s{progressLabel ? ` · ${progressLabel}` : ""}
            {/if}
          </Chip>
        {/if}
      </Card.Header>

      <Card.Content class="grid gap-kb-16 p-kb-16">
        <section class="grid gap-kb-8">
          <EditorLayerStack editor={workbench} allowAdd={false} />
          <label class="flex flex-wrap items-center gap-kb-8 font-mono text-[11px] text-ink-3">
            Layer role
            <NativeSelect.Root
              class="w-auto font-mono text-[11px]"
              size="sm"
              value={activeLayerRole?.role ?? "unknown"}
              aria-label="Layer role"
              onchange={(e) => lockActiveLayerRole(e.currentTarget.value as LayerRoleT)}
            >
              {#each LAYER_ROLE_OPTIONS as role (role)}
                <NativeSelect.Option value={role}
                  >{role}{activeLayerRole?.locked && activeLayerRole.role === role
                    ? " (locked)"
                    : ""}</NativeSelect.Option
                >
              {/each}
            </NativeSelect.Root>
            {#if activeLayerRole?.locked}
              <span>locked</span>
            {/if}
          </label>
          <div
            class="relative flex min-h-[360px] min-w-0 overflow-hidden rounded-keycap border border-line-2 bg-stage [&_.keyboard-board-viewport]:min-h-[300px]"
          >
            <KeyboardBoard
              profile={boardProfile}
              activeLayer={workbench.activeLayer}
              lens="keys"
              showFallthrough={workbench.showFallthrough}
              targetOs={workbench.boardTargetOs}
              selection={boardSelection}
              marked={boardMarked}
              heatByKeyId={heatByKeyId}
              bind:zoom={boardZoom}
              bind:pan={boardPan}
              class="min-h-[360px]"
            />
          </div>
          {#if pulseHint && running}
            <p class="font-mono text-[11px] text-ink-3" aria-live="polite">
              {pulseHint}
            </p>
          {/if}
        </section>

        <section class="grid gap-kb-8">
          <div
            class="mt-buffer overflow-x-auto rounded-keycap border border-line-2 bg-paper-2 px-kb-16 py-kb-18 font-mono text-[18px] leading-[1.7] tracking-[0.02em]"
            aria-label="Practice buffer"
            aria-busy={preparing}
          >
            {#if preparing && cells.length === 0}
              <span class="inline-flex items-center gap-kb-8 text-[12px] text-ink-3">
                <Spinner />
                Loading drill
              </span>
            {:else}
              {#each cells as cell (cell.id)}
                {#if cell.kind === "newline"}
                  <br />
                {:else}
                  {@const phase = cellPhase(cell)}
                  <span
                    class="mt-cell"
                    class:mt-typed={phase === "typed"}
                    class:mt-current={phase === "current"}
                    class:mt-ghost={phase === "ghost"}
                    class:mt-indent={cell.kind === "indent"}
                  >{cell.display}</span>
                {/if}
              {/each}
            {/if}
          </div>
        </section>

        {#if showActions}
          <section class="flex flex-wrap gap-kb-6">
            {#each upcoming as action, i (action.id)}
              <div
                class="min-w-[64px] rounded-keycap border px-kb-10 py-kb-8 font-mono text-[12px] {i === 0
                  ? 'border-coral bg-[color-mix(in_oklch,var(--coral)_12%,transparent)]'
                  : 'border-line-2 bg-surface'}"
              >
                <div class="text-[16px] font-strong">{action.glyph}</div>
              </div>
            {/each}
          </section>
        {/if}

        {#if chips.length}
          <div class="flex flex-wrap gap-kb-6">
            {#each chips as chip (chip.id)}
              <Chip tone={chip.accuracy < 85 ? "warning" : chip.samples === 0 ? "neutral" : "success"}>
                {chip.target}
                {chip.samples === 0
                  ? ""
                  : ` ${chip.accuracy}%${chip.meanLatencyMs != null ? ` ${chip.meanLatencyMs}ms` : ""}`}
              </Chip>
            {/each}
          </div>
        {/if}

        {#if lastSummary}
          <p class="font-mono text-[12px] text-ink-2">
            {lastSummary.wpm ?? "--"} wpm · {lastSummary.accuracy}%
          </p>
        {/if}
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header>
        <Card.Title>Coach</Card.Title>
        {#if sampleCount > 0}
          <Chip tone={enoughData ? "success" : "neutral"}>{sampleCount}</Chip>
        {/if}
      </Card.Header>
      <Card.Content class="grid gap-kb-12">
        {#if !enoughData}
          <Button size="sm" variant="ghost" disabled={coachBusy} onclick={() => openCoach(false)}>
            {#if coachBusy}<Spinner />{/if}
            {coachBusy ? "Loading" : "Suggest"}
          </Button>
        {:else}
          <Button size="sm" disabled={coachBusy} onclick={() => openCoach(true)}>
            {#if coachBusy}<Spinner />{/if}
            {coachBusy ? "Loading" : "Refresh"}
          </Button>
        {/if}

        {#if coachBusy && !coachResult}
          <Empty.Root class="min-h-[72px] border-0 p-kb-8">
            <Empty.Header>
              <Empty.Media variant="icon"><Spinner /></Empty.Media>
              <Empty.Title class="text-kb-12 font-medium text-ink-3">Asking coach</Empty.Title>
            </Empty.Header>
          </Empty.Root>
        {:else if coachResult?._tag === "LowData" || coachResult?._tag === "Empty"}
          <Empty.Root class="min-h-[72px] border-0 p-kb-8">
            <Empty.Header>
              <Empty.Title class="text-kb-12 font-medium">{coachResult.message}</Empty.Title>
            </Empty.Header>
          </Empty.Root>
        {:else if coachSuggestion()}
          {@const suggestion = coachSuggestion()!}
          <div class="grid gap-kb-8">
            <div class="flex flex-wrap items-center gap-kb-6">
              <Chip tone={suggestion.confidence === "high" ? "success" : "neutral"}>
                Δ{suggestion.scoreDelta.toFixed(2)}
              </Chip>
              {#if suggestion.basedOnPersonalStats}
                <Chip tone="success">Personal</Chip>
              {:else}
                <Chip tone="neutral">Corpus</Chip>
              {/if}
            </div>
            {#if suggestion.rationale}
              <p class="font-mono text-[12px] text-ink-2">{suggestion.rationale}</p>
            {/if}
            <ul class="grid gap-kb-6">
              {#each suggestion.diffs as diff (diff.keyId + diff.layerId)}
                <li
                  class="rounded-keycap border border-line-2 bg-surface px-kb-10 py-kb-8 font-mono text-[11px]"
                  class:ring-2={coachMarked.includes(diff.keyId)}
                >
                  <div>
                    <span class="text-ink-3">{diff.before}</span>
                    →
                    <span class="text-ink">{diff.after}</span>
                  </div>
                </li>
              {/each}
            </ul>
            <label class="flex items-center gap-kb-6 font-mono text-[11px] text-ink-3">
              <Checkbox bind:checked={previewAfter} aria-label="Preview suggestion" />
              Preview
            </label>
            <div class="flex flex-wrap gap-kb-6">
              <Button size="sm" onclick={() => acceptSuggestion()}>Accept</Button>
              <Button size="sm" variant="ghost" onclick={() => rejectSuggestion(false)}>Reject</Button>
              <Button size="sm" variant="ghost" onclick={() => rejectSuggestion(true)}>Never</Button>
            </div>
          </div>
        {/if}

        {#if coachError}
          <Alert.Root variant="destructive">
            <Alert.Title>{coachError}</Alert.Title>
          </Alert.Root>
        {/if}

        {#if recentSessions.length > 0}
          <div class="grid gap-kb-8">
            <h2 class="text-kb-14 font-semibold leading-tight">Sessions</h2>
            <ul class="grid gap-kb-6">
              {#each recentSessions as item (item.id)}
                <li class="rounded-keycap border border-line-2 bg-surface px-kb-10 py-kb-8 font-mono text-[11px] text-ink-2">
                  {item.wpm ?? "--"} wpm · {item.accuracy}% · {item.mode}
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      </Card.Content>
    </Card.Root>
  </div>
</div>

<style>
  .mt-buffer {
    white-space: pre;
    tab-size: 4;
  }
  .mt-cell {
    display: inline-block;
    width: 1ch;
    min-width: 1ch;
    max-width: 1ch;
    white-space: pre;
    box-sizing: content-box;
  }
  .mt-ghost {
    color: color-mix(in oklch, var(--ink) 28%, transparent);
  }
  .mt-typed {
    color: var(--ink);
  }
  .mt-current {
    color: color-mix(in oklch, var(--ink) 38%, transparent);
    box-shadow: inset 0 -2px 0 0 var(--coral);
    animation: mt-caret 1s steps(1) infinite;
  }
  .mt-indent.mt-ghost {
    color: color-mix(in oklch, var(--ink) 18%, transparent);
  }
  @keyframes mt-caret {
    50% {
      box-shadow: inset 0 -2px 0 0 transparent;
    }
  }
</style>
