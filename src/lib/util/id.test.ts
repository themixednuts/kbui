import { describe, expect, it } from "vite-plus/test";

import { newId } from "./id";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("newId", () => {
  it("returns unique UUID-shaped ids", () => {
    const first = newId();
    const second = newId();

    expect(first).toMatch(uuidPattern);
    expect(second).toMatch(uuidPattern);
    expect(second).not.toBe(first);
  });
});
