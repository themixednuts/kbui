import { describe, expect, it } from "vitest";

import {
  identityFromUrl,
  isMonkeytypeResultsUrl,
  readMonkeytypeIdentityMessage,
  readMonkeytypeResultIdentity,
} from "./result-id";

describe("Monkeytype result identity", () => {
  it("extracts _id and timestamp from a save-request body", () => {
    expect(
      readMonkeytypeResultIdentity({
        _id: "res_abc",
        wpm: 101,
        acc: 98,
        timestamp: 1_720_000_000_000,
      }),
    ).toEqual({
      monkeytypeResultId: "res_abc",
      monkeytypeTimestamp: 1_720_000_000_000,
    });
  });

  it("walks nested data envelopes", () => {
    expect(
      readMonkeytypeResultIdentity({
        message: "Result added",
        data: { insertedId: "nope", result: { id: "nested_1", timestamp: 9 } },
      }),
    ).toEqual({
      monkeytypeResultId: "nested_1",
      monkeytypeTimestamp: 9,
    });
  });

  it("recognizes Monkeytype result URLs", () => {
    expect(isMonkeytypeResultsUrl("https://api.monkeytype.com/results/add")).toBe(true);
    expect(isMonkeytypeResultsUrl("https://api.monkeytype.com/users/stats")).toBe(false);
    expect(identityFromUrl("https://monkeytype.com?id=share_9")).toEqual({
      monkeytypeResultId: "share_9",
    });
  });

  it("accepts only kbgui identity messages", () => {
    expect(readMonkeytypeIdentityMessage({ source: "other", type: "result-identity" })).toBeNull();
    expect(
      readMonkeytypeIdentityMessage({
        source: "kbgui-monkeytype",
        type: "result-identity",
        monkeytypeResultId: " res_1 ",
        monkeytypeTimestamp: 12,
      }),
    ).toEqual({ monkeytypeResultId: "res_1", monkeytypeTimestamp: 12 });
  });
});
