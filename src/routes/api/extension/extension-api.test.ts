import { describe, expect, it } from "vite-plus/test";

import type {
  IngestRunResponse,
  KeyboardChoicesResponse,
  MonkeytypeRunCapture,
  PairDeviceRequest,
  PairDeviceResponse,
} from "$lib/typing-runs/contracts";
import { GET as keyboardsGet } from "./keyboards/+server";
import { POST as pairPost } from "./pair/+server";
import { POST as runsPost } from "./runs/+server";
import { GET as sessionGet } from "./session/+server";

const requestOrigin = "http://kbgui.test";
const extensionOrigin = "chrome-extension://abcdefghijklmnop";

describe("/api/extension endpoint auth", () => {
  it("rejects anonymous run ingest", async () => {
    const response = await runsPost(
      eventFor({
        body: {},
        path: "/api/extension/runs",
      }),
    );

    expect(response.status).toBe(401);
  });

  it("rejects invalid device tokens for run ingest", async () => {
    const response = await runsPost(
      eventFor({
        authorization: "Bearer invalid-token",
        body: {},
        path: "/api/extension/runs",
      }),
    );

    expect(response.status).toBe(401);
  });

  it("rejects invalid pairing codes", async () => {
    const response = await pairPost(
      eventFor({
        body: {
          code: "BAD-CODE",
          installId: "install-1",
          extensionVersion: "0.1.0",
        },
        path: "/api/extension/pair",
      }),
    );

    expect(response.status).toBe(401);
  });

  it("rejects malformed JSON with extension CORS headers", async () => {
    const response = await pairPost(
      eventFor({
        path: "/api/extension/pair",
        rawBody: "{",
      }),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("access-control-allow-origin")).toBe(extensionOrigin);
    await expect(response.json()).resolves.toEqual({ error: "Request body must be valid JSON." });
  });

  it("schema-decodes pair request bodies before calling the agent", async () => {
    const agent = new FakeTypingRunsAgent();
    const response = await pairPost(
      eventFor({
        agent,
        body: {
          code: "x",
          installId: "install-1",
          extensionVersion: "0.1.0",
        },
        path: "/api/extension/pair",
      }),
    );

    expect(response.status).toBe(400);
    expect(agent.pairCalls).toEqual([]);
  });
});

describe("/api/extension endpoint workflows", () => {
  it("returns keyboard choices for paired device tokens", async () => {
    const agent = new FakeTypingRunsAgent();
    agent.deviceTokens.set("valid-token", "user-1");
    agent.choices.set("user-1", sampleChoices());

    const response = await keyboardsGet(
      eventFor({
        agent,
        authorization: "Bearer valid-token",
        method: "GET",
        path: "/api/extension/keyboards",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(extensionOrigin);
    await expect(response.json()).resolves.toEqual(sampleChoices());
  });

  it("returns an anonymous extension session without requiring the worker binding", async () => {
    const response = await sessionGet(
      eventFor({ method: "GET", path: "/api/extension/session", withoutPlatform: true }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      canUse: false,
      user: null,
      choices: { keyboards: [], layouts: [] },
    });
  });

  it("returns the signed-in extension session with keyboard choices", async () => {
    const agent = new FakeTypingRunsAgent();
    agent.choices.set("user-1", sampleChoices());

    const response = await sessionGet(
      eventFor({
        agent,
        method: "GET",
        path: "/api/extension/session",
        userId: "user-1",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      canUse: true,
      user: { id: "user-1" },
      choices: sampleChoices(),
    });
  });

  it("normalizes and pairs a schema-valid device request", async () => {
    const agent = new FakeTypingRunsAgent();
    agent.pairingCode = "PAIR-1";

    const response = await pairPost(
      eventFor({
        agent,
        body: {
          code: " PAIR-1 ",
          installId: " install-1 ",
          extensionVersion: " 0.1.0 ",
          label: " ",
          pairedAt: null,
        },
        path: "/api/extension/pair",
      }),
    );

    expect(response.status).toBe(200);
    expect(agent.pairCalls).toEqual([
      {
        code: "PAIR-1",
        input: {
          code: "PAIR-1",
          installId: "install-1",
          extensionVersion: "0.1.0",
          label: undefined,
          pairedAt: undefined,
        },
      },
    ]);
  });

  it("schema-decodes and ingests a tagged run under the paired principal", async () => {
    const agent = new FakeTypingRunsAgent();
    agent.deviceTokens.set("valid-token", "user-1");

    const response = await runsPost(
      eventFor({
        agent,
        authorization: "Bearer valid-token",
        body: { capture: sampleCapture() },
        path: "/api/extension/runs",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "stored",
      correlationState: "pending",
    });
    expect(agent.ingestedRuns).toHaveLength(1);
    expect(agent.ingestedRuns[0]).toMatchObject({
      userId: "user-1",
      capture: {
        keyboard: { keyboardId: "kb-1" },
        layout: { layoutId: "main:kb-1" },
      },
    });
    expect(agent.ingestedRuns[0]?.capture.idempotencyKey).toMatch(/^dom:/);
  });

  it("returns 429 with Retry-After when the shared limiter rejects pair", async () => {
    const agent = new FakeTypingRunsAgent();
    agent.rateLimitAllowed = false;

    const response = await pairPost(
      eventFor({
        agent,
        body: {
          code: "ABCD-EFGH-IJKL",
          installId: "install-1",
          extensionVersion: "0.1.0",
        },
        path: "/api/extension/pair",
      }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("30");
    await expect(response.json()).resolves.toEqual({
      error: "Too many extension requests. Retry later.",
    });
    expect(agent.pairCalls).toEqual([]);
  });
});

function eventFor(input: {
  agent?: FakeTypingRunsAgent;
  authorization?: string;
  body?: unknown;
  method?: "GET" | "POST";
  path: string;
  rawBody?: string;
  userId?: string;
  withoutPlatform?: boolean;
}) {
  const headers = new Headers({ origin: extensionOrigin });
  if (input.authorization) headers.set("authorization", input.authorization);
  const method = input.method ?? "POST";
  const body = input.rawBody ?? (input.body === undefined ? undefined : JSON.stringify(input.body));
  if (body !== undefined) headers.set("content-type", "application/json");
  const url = new URL(input.path, requestOrigin);

  return {
    request: new Request(url, { body, headers, method }),
    url,
    locals: {
      session: null,
      user: input.userId ? { id: input.userId } : null,
    },
    platform: input.withoutPlatform
      ? undefined
      : {
          env: envFor(input.agent ?? new FakeTypingRunsAgent()),
        },
  } as never;
}

class FakeTypingRunsAgent {
  pairingCode: string | null = null;
  rateLimitAllowed = true;
  readonly pairCalls: Array<{ code: string; input: PairDeviceRequest }> = [];
  readonly deviceTokens = new Map<string, string>();
  readonly choices = new Map<string, KeyboardChoicesResponse>();
  readonly ingestedRuns: Array<{
    userId: string;
    capture: MonkeytypeRunCapture & { idempotencyKey?: string };
  }> = [];

  async resolveDeviceToken(token: string): Promise<string | null> {
    return this.deviceTokens.get(token) ?? null;
  }

  async pairDevice(code: string, input: PairDeviceRequest): Promise<PairDeviceResponse | null> {
    this.pairCalls.push({ code, input });
    if (code !== this.pairingCode) return null;
    return {
      deviceToken: "device-token-1",
      userId: "user-1",
      device: {
        id: "device-1",
        label: input.label ?? null,
        installId: input.installId,
        extensionVersion: input.extensionVersion,
        createdAt: "2026-07-04T12:01:00.000Z",
        lastSeenAt: "2026-07-04T12:01:00.000Z",
        revokedAt: null,
      },
    };
  }

  async getKeyboardChoices(userId: string): Promise<KeyboardChoicesResponse> {
    return this.choices.get(userId) ?? { keyboards: [], layouts: [] };
  }

  async ingestRun(
    userId: string,
    capture: MonkeytypeRunCapture & { idempotencyKey?: string },
  ): Promise<IngestRunResponse> {
    this.ingestedRuns.push({ userId, capture });
    return { status: "stored", correlationState: "pending" };
  }

  async consumeRateLimit(): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
    return this.rateLimitAllowed
      ? { allowed: true, retryAfterSeconds: 0 }
      : { allowed: false, retryAfterSeconds: 30 };
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

function sampleChoices(): KeyboardChoicesResponse {
  return {
    keyboards: [{ keyboardId: "kb-1", displayName: "Workbench 65" }],
    layouts: [{ layoutId: "main:kb-1", displayName: "main", layerNames: ["Base", "Fn"] }],
  };
}

function sampleCapture(): MonkeytypeRunCapture {
  return {
    source: "monkeytype-extension-dom-v1",
    capturedAt: "2026-07-04T12:03:00.000Z",
    wpm: 101,
    rawWpm: 106,
    acc: 98.2,
    consistency: 77,
    testDuration: 60,
    mode: " time ",
    mode2: "60",
    language: "english",
    punctuation: false,
    numbers: false,
    keyboard: {
      keyboardId: " kb-1 ",
      displayName: " Workbench 65 ",
      vendorId: 0xfeed,
      productId: 0x6060,
    },
    layout: {
      layoutId: " main:kb-1 ",
      displayName: " main ",
      layerNames: [" Base ", "Fn"],
    },
    extension: {
      installId: " install-1 ",
      version: " 0.1.0 ",
      parserVersion: " dom-v1 ",
    },
  };
}
