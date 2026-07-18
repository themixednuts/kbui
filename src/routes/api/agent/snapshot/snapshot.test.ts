import { describe, expect, it } from "vite-plus/test";

import { sampleKeyboard } from "$lib/keyboard/schema";
import { POST } from "./+server";

describe("POST /api/agent/snapshot", () => {
  it("returns 400 without persistence for a malformed keyboard profile", async () => {
    const agent = new FakeWorkbenchAgent();
    const response = await POST(
      eventFor(
        {
          profile: {
            ...sampleKeyboard,
            matrix: { rows: "five", cols: sampleKeyboard.matrix.cols },
          },
          changes: [],
        },
        agent,
      ),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      synced: false,
      reason: "Invalid keyboard profile.",
    });
    expect(agent.saveCalls).toBe(0);
  });

  it("returns 400 without persistence for malformed snapshot changes", async () => {
    const agent = new FakeWorkbenchAgent();
    const response = await POST(
      eventFor(
        {
          profile: sampleKeyboard,
          changes: [
            {
              id: "change-1",
              kind: "unknown",
              scope: "layer:base",
              path: "layers.base.bindings.k2-1",
              before: "KC_A",
              after: "KC_B",
              staged: true,
            },
          ],
        },
        agent,
      ),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      synced: false,
      reason: "Invalid workbench snapshot.",
    });
    expect(agent.saveCalls).toBe(0);
  });
});

function eventFor(body: unknown, agent: FakeWorkbenchAgent) {
  const url = new URL("http://kbgui.test/api/agent/snapshot");
  return {
    request: new Request(url, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    url,
    locals: {
      session: null,
      user: { id: "user/with spaces" },
    },
    platform: {
      env: {
        UserWorkbenchAgent: {
          getByName: () => agent,
        },
      },
    },
  } as never;
}

class FakeWorkbenchAgent {
  saveCalls = 0;

  async saveSnapshot(input: unknown) {
    this.saveCalls += 1;
    return input;
  }
}
