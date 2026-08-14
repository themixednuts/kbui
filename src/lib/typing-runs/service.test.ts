import { Effect } from "effect";
import { describe, expect, it } from "@effect/vitest";

import { correlateCapture } from "$lib/typing-runs/correlation";
import {
  idempotencyKeyForCapture,
  type CreatePairingTokenMeta,
  type ExtensionDeviceDto,
  type IngestRunResponse,
  type KeyboardChoicesResponse,
  type MonkeytypeRunCapture,
  type PairDeviceResponse,
} from "$lib/typing-runs/contracts";
import type { NormalizedMonkeytypeResult } from "$lib/typing-runs/monkeytype-results";
import {
  createPairingTokenFromEnvironmentEffect,
  getKeyboardChoicesFromEnvironmentEffect,
  ingestTypingRunFromEnvironmentEffect,
  listExtensionDevicesFromEnvironmentEffect,
  pairExtensionDeviceFromEnvironmentEffect,
  resolveExtensionDeviceTokenFromEnvironmentEffect,
  revokeExtensionDeviceFromEnvironmentEffect,
  setKeyboardChoicesFromEnvironmentEffect,
  TYPING_RUNS_REQUIRES_WORKER,
  upsertMonkeytypeResultsFromEnvironmentEffect,
} from "$lib/typing-runs/service";

describe("TypingRunsAgent RPC service", () => {
  it.effect("pairs a token once and rejects reuse", () =>
    Effect.gen(function* () {
      const agent = new FakeTypingRunsAgent();
      const env = envFor(agent);

      const pairing = yield* createPairingTokenFromEnvironmentEffect(env, "user-1", {
        createdAt: "2026-07-04T12:00:00.000Z",
      });
      const first = yield* pairExtensionDeviceFromEnvironmentEffect(env, {
        code: pairing.code,
        installId: "install-1",
        extensionVersion: "0.1.0",
        pairedAt: "2026-07-04T12:01:00.000Z",
      });
      const second = yield* pairExtensionDeviceFromEnvironmentEffect(env, {
        code: pairing.code,
        installId: "install-1",
        extensionVersion: "0.1.0",
        pairedAt: "2026-07-04T12:02:00.000Z",
      });

      expect(first?.userId).toBe("user-1");
      expect(first?.deviceToken).toBe("device-token-1");
      expect(second).toBeNull();
    }),
  );

  it.effect("rejects expired pairing tokens", () =>
    Effect.gen(function* () {
      const agent = new FakeTypingRunsAgent();
      const env = envFor(agent);
      const pairing = yield* createPairingTokenFromEnvironmentEffect(env, "user-1", {
        createdAt: "2026-07-04T12:00:00.000Z",
      });

      const result = yield* pairExtensionDeviceFromEnvironmentEffect(env, {
        code: pairing.code,
        installId: "install-1",
        extensionVersion: "0.1.0",
        pairedAt: "2026-07-04T12:20:00.000Z",
      });

      expect(result).toBeNull();
    }),
  );

  it.effect("mints, resolves, and revokes device tokens", () =>
    Effect.gen(function* () {
      const agent = new FakeTypingRunsAgent();
      const env = envFor(agent);
      const pairing = yield* createPairingTokenFromEnvironmentEffect(env, "user-1", {
        createdAt: "2026-07-04T12:00:00.000Z",
      });
      const paired = yield* pairExtensionDeviceFromEnvironmentEffect(env, {
        code: pairing.code,
        installId: "install-1",
        extensionVersion: "0.1.0",
        pairedAt: "2026-07-04T12:01:00.000Z",
      });

      expect(
        yield* resolveExtensionDeviceTokenFromEnvironmentEffect(env, paired?.deviceToken ?? ""),
      ).toBe("user-1");
      yield* revokeExtensionDeviceFromEnvironmentEffect(env, "user-1", paired?.device.id ?? "");
      expect(
        yield* resolveExtensionDeviceTokenFromEnvironmentEffect(env, paired?.deviceToken ?? ""),
      ).toBeNull();
    }),
  );

  it.effect("stores keyboard choices for extension pickers", () =>
    Effect.gen(function* () {
      const agent = new FakeTypingRunsAgent();
      const env = envFor(agent);
      const choices: KeyboardChoicesResponse = {
        keyboards: [{ keyboardId: "kb-1", displayName: "Workbench 65" }],
        layouts: [{ layoutId: "main:kb-1", displayName: "main", layerNames: ["Base", "Fn"] }],
      };

      yield* setKeyboardChoicesFromEnvironmentEffect(env, "user-1", choices);

      expect(yield* getKeyboardChoicesFromEnvironmentEffect(env, "user-1")).toEqual(choices);
    }),
  );

  it.effect("ingests runs idempotently", () =>
    Effect.gen(function* () {
      const agent = new FakeTypingRunsAgent();
      const env = envFor(agent);
      const capture = sampleCapture();

      const first = yield* ingestTypingRunFromEnvironmentEffect(env, "user-1", {
        capture,
        idempotencyKey: "run-1",
      });
      const second = yield* ingestTypingRunFromEnvironmentEffect(env, "user-1", {
        capture,
        idempotencyKey: "run-1",
      });

      expect(first).toEqual({ status: "stored", correlationState: "pending" });
      expect(second).toEqual({ status: "duplicate", correlationState: "pending" });
    }),
  );

  it.effect("matches an ingested run against stored Monkeytype results", () =>
    Effect.gen(function* () {
      const agent = new FakeTypingRunsAgent();
      const env = envFor(agent);

      expect(
        yield* upsertMonkeytypeResultsFromEnvironmentEffect(
          env,
          "user-1",
          {
            data: [
              {
                _id: "res_1",
                wpm: 101,
                acc: 98.2,
                timestamp: Date.parse("2026-07-04T12:03:00.000Z"),
              },
            ],
          },
          Date.parse("2026-07-04T12:04:00.000Z"),
        ),
      ).toBe(1);

      const stored = yield* ingestTypingRunFromEnvironmentEffect(env, "user-1", {
        capture: sampleCapture({ monkeytypeResultId: "res_1" }),
        idempotencyKey: "run-match",
      });
      expect(stored).toEqual({ status: "stored", correlationState: "matched" });
    }),
  );

  it.effect("fails in the error channel when the typing-runs agent is unbound", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        listExtensionDevicesFromEnvironmentEffect(undefined, "user-1"),
      );
      expect(error.message).toBe(TYPING_RUNS_REQUIRES_WORKER);
    }),
  );
});

class FakeTypingRunsAgent {
  pairingCounter = 0;
  deviceCounter = 0;
  readonly pairings = new Map<string, { userId: string; expiresAt: string; consumed: boolean }>();
  readonly devices = new Map<
    string,
    ExtensionDeviceDto & { userId: string; deviceToken: string; revoked: boolean }
  >();
  readonly choices = new Map<string, KeyboardChoicesResponse>();
  readonly runs = new Map<string, IngestRunResponse>();
  readonly captures = new Map<string, MonkeytypeRunCapture>();
  readonly results = new Map<string, NormalizedMonkeytypeResult[]>();

  async createPairingToken(
    userId: string,
    meta: CreatePairingTokenMeta = {},
  ): Promise<{ code: string; expiresAt: string; ttlSeconds: number }> {
    this.pairingCounter += 1;
    const createdAt = new Date(meta.createdAt ?? "2026-07-04T12:00:00.000Z");
    const expiresAt = new Date(createdAt.getTime() + 10 * 60 * 1000).toISOString();
    const code = `PAIR-${this.pairingCounter}`;
    this.pairings.set(code, { userId, expiresAt, consumed: false });
    return { code, expiresAt, ttlSeconds: 600 };
  }

  async pairDevice(
    code: string,
    install: { installId: string; extensionVersion: string; label?: string; pairedAt?: string },
  ): Promise<PairDeviceResponse | null> {
    const pairing = this.pairings.get(code);
    const pairedAt = new Date(install.pairedAt ?? "2026-07-04T12:01:00.000Z");
    if (!pairing || pairing.consumed) return null;
    if (new Date(pairing.expiresAt).getTime() <= pairedAt.getTime()) return null;

    pairing.consumed = true;
    this.deviceCounter += 1;
    const deviceToken = `device-token-${this.deviceCounter}`;
    const device: ExtensionDeviceDto & {
      userId: string;
      deviceToken: string;
      revoked: boolean;
    } = {
      id: `device-${this.deviceCounter}`,
      userId: pairing.userId,
      deviceToken,
      revoked: false,
      label: install.label ?? "Monkeytype tagger",
      installId: install.installId,
      extensionVersion: install.extensionVersion,
      createdAt: pairedAt.toISOString(),
      lastSeenAt: pairedAt.toISOString(),
      revokedAt: null,
    };
    this.devices.set(device.id, device);
    return { deviceToken, userId: pairing.userId, device };
  }

  async resolveDeviceToken(token: string): Promise<string | null> {
    return (
      [...this.devices.values()].find((device) => device.deviceToken === token && !device.revoked)
        ?.userId ?? null
    );
  }

  async revokeDevice(userId: string, id: string): Promise<void> {
    const device = this.devices.get(id);
    if (device?.userId === userId) {
      device.revoked = true;
      device.revokedAt = "2026-07-04T12:02:00.000Z";
    }
  }

  async setKeyboardChoices(userId: string, choices: KeyboardChoicesResponse): Promise<void> {
    this.choices.set(userId, choices);
  }

  async getKeyboardChoices(userId: string): Promise<KeyboardChoicesResponse> {
    return this.choices.get(userId) ?? { keyboards: [], layouts: [] };
  }

  async ingestRun(
    userId: string,
    capture: MonkeytypeRunCapture & { idempotencyKey?: string },
  ): Promise<IngestRunResponse> {
    const key = `${userId}:${capture.idempotencyKey ?? idempotencyKeyForCapture(capture)}`;
    const existing = this.runs.get(key);
    if (existing) return { status: "duplicate", correlationState: existing.correlationState };
    const decision = correlateCapture(capture, this.results.get(userId) ?? []);
    const result: IngestRunResponse = { status: "stored", correlationState: decision.state };
    this.captures.set(key, capture);
    this.runs.set(key, result);
    return result;
  }

  async consumeRateLimit(): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  async upsertMonkeytypeResults(
    userId: string,
    rows: NormalizedMonkeytypeResult[],
  ): Promise<number> {
    this.results.set(userId, rows);
    return rows.length;
  }

  async retryPendingCorrelation(userId: string): Promise<number> {
    let updated = 0;
    for (const [key, run] of this.runs) {
      if (!key.startsWith(`${userId}:`)) continue;
      const capture = this.captures.get(key);
      if (!capture) continue;
      if (run.correlationState !== "pending" && run.correlationState !== "unmatched") continue;
      const stored = this.results.get(userId) ?? [];
      const decision = correlateCapture(capture, stored, { hasFreshSync: stored.length > 0 });
      if (decision.state === run.correlationState) continue;
      this.runs.set(key, { ...run, correlationState: decision.state });
      updated += 1;
    }
    return updated;
  }
}

function envFor(agent: FakeTypingRunsAgent): Cloudflare.Env {
  return {
    TypingRunsAgent: {
      idFromName: () => "typing-runs-agent-id",
      get: () => agent,
    },
  } as unknown as Cloudflare.Env;
}

function sampleCapture(overrides: Partial<MonkeytypeRunCapture> = {}): MonkeytypeRunCapture {
  return {
    source: "monkeytype-extension-dom-v1",
    capturedAt: "2026-07-04T12:03:00.000Z",
    wpm: 101,
    rawWpm: 106,
    acc: 98.2,
    consistency: 77,
    testDuration: 60,
    mode: "time",
    mode2: "60",
    language: "english",
    punctuation: false,
    numbers: false,
    keyboard: {
      keyboardId: "kb-1",
      displayName: "Workbench 65",
      vendorId: 0xfeed,
      productId: 0x6060,
    },
    layout: {
      layoutId: "main:kb-1",
      displayName: "main",
      layerNames: ["Base", "Fn"],
    },
    extension: {
      installId: "install-1",
      version: "0.1.0",
      parserVersion: "dom-v1",
    },
    ...overrides,
  };
}
