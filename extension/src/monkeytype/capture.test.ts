import { describe, expect, it } from "vitest";

import { idempotencyKeyForCapture } from "../contracts";
import {
  createStableResultGate,
  monkeytypeResultToCapture,
  readMonkeytypeResult
} from "./capture";
import { MONKEYTYPE_RESULT_SELECTORS, readMonkeytypeText } from "./selectors";

const fixture = await import("../../test/fixtures/monkeytype-result.html?raw");

describe("Monkeytype result capture", () => {
  it("parses the saved #result fixture into a MonkeytypeRunCapture", () => {
    document.body.innerHTML = fixture.default;

    const parsed = readMonkeytypeResult(document, () => "2026-07-04T18:30:00.000Z");
    expect(parsed).toMatchObject({
      capturedAt: "2026-07-04T18:30:00.000Z",
      wpm: 124.6,
      rawWpm: 131.2,
      acc: 98.4,
      consistency: 82.7,
      testDuration: 60,
      mode: "time",
      mode2: "60",
      testTypeText: "time 60 english punctuation",
      language: "english",
      punctuation: true
    });

    const capture = monkeytypeResultToCapture(
      parsed!,
      { keyboardId: "kb-workbench-65", displayName: "Workbench 65" },
      { layoutId: "colemak-dh", displayName: "Colemak DH", layerNames: ["base"] },
      {
        installId: "install-test",
        version: "0.1.0",
        parserVersion: "test-parser"
      },
    );

    expect(capture).toMatchObject({
      source: "monkeytype-extension-dom-v1",
      wpm: 124.6,
      rawWpm: 131.2,
      acc: 98.4,
      keyboard: { keyboardId: "kb-workbench-65" },
      layout: { layoutId: "colemak-dh" },
      extension: {
        installId: "install-test",
        version: "0.1.0",
        parserVersion: "test-parser"
      }
    });
    expect(idempotencyKeyForCapture(capture)).toContain("dom:monkeytype-extension-dom-v1");
  });

  it("centralizes Monkeytype selectors and text reads", () => {
    document.body.innerHTML = fixture.default;

    expect(MONKEYTYPE_RESULT_SELECTORS.wpm).toBe("#result .stats .wpm .bottom");
    expect(readMonkeytypeText(document, "testType")).toBe("time 60 english punctuation");
  });

  it("requires two equal reads and suppresses duplicate stable emissions", () => {
    const result = {
      capturedAt: "2026-07-04T18:30:00.000Z",
      wpm: 124.6,
      rawWpm: 131.2,
      acc: 98.4,
      consistency: 82.7,
      testDuration: 60,
      mode: "time",
      mode2: "60",
      testTypeText: "time 60 english punctuation"
    };
    const gate = createStableResultGate();

    expect(gate.push(result)).toBeNull();
    expect(gate.push({ ...result, capturedAt: "2026-07-04T18:30:00.250Z" })).toMatchObject({
      wpm: 124.6
    });
    expect(gate.push({ ...result, capturedAt: "2026-07-04T18:30:01.000Z" })).toBeNull();

    gate.resetPanel();
    expect(gate.push(result)).toBeNull();
    expect(gate.push(result)).toMatchObject({ wpm: 124.6 });
  });
});
