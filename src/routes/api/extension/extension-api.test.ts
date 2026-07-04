import { describe, expect, it } from "vite-plus/test";

import { POST as pairPost } from "./pair/+server";
import { POST as runsPost } from "./runs/+server";

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
});

function eventFor(input: { authorization?: string; body: unknown; path: string; userId?: string }) {
  const headers = new Headers({
    "content-type": "application/json",
    origin: "chrome-extension://abcdefghijklmnop",
  });
  if (input.authorization) headers.set("authorization", input.authorization);
  const url = new URL(`http://127.0.0.1:8787${input.path}`);

  return {
    request: new Request(url, {
      body: JSON.stringify(input.body),
      headers,
      method: "POST",
    }),
    url,
    locals: {
      session: null,
      user: input.userId ? { id: input.userId } : null,
    },
    platform: {
      env: envFor(new FakeTypingRunsAgent()),
    },
  } as never;
}

class FakeTypingRunsAgent {
  async resolveDeviceToken(): Promise<string | null> {
    return null;
  }

  async pairDevice(): Promise<null> {
    return null;
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
