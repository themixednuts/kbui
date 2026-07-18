import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { BoundaryDecodeError } from "$lib/effect/errors";
import {
  decodeIngestRunRequestEffect,
  decodePairDeviceRequestEffect,
  decodeSetKeyboardChoicesRequestEffect,
} from "./contracts";

const capture = {
  source: "monkeytype-extension-dom-v1",
  capturedAt: "2026-07-18T12:00:00.000Z",
  wpm: 91.5,
  acc: 98.2,
  keyboard: {
    keyboardId: " keyboard-1 ",
    displayName: " Test Board ",
    profileId: "",
  },
  layout: {
    layoutId: "layout-1",
    displayName: "Colemak",
    layerNames: [" Base ", "Nav"],
  },
  extension: {
    installId: "install-1",
    version: "1.0.0",
    parserVersion: "dom-v1",
  },
} as const;

describe("typing run contract decoding", () => {
  it("normalizes optional values and derives an idempotency key", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const request = yield* decodeIngestRunRequestEffect({ capture });

        expect(request.capture.keyboard).toMatchObject({
          keyboardId: "keyboard-1",
          displayName: "Test Board",
          profileId: undefined,
        });
        expect(request.capture.layout.layerNames).toEqual(["Base", "Nav"]);
        expect(request.idempotencyKey).toMatch(/^dom:/);
      }),
    ));

  it("decodes paired-device and keyboard-choice boundaries", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const pair = yield* decodePairDeviceRequestEffect({
          code: " ABCD-EFGH ",
          installId: " install-1 ",
          extensionVersion: " 1.0.0 ",
          label: "",
          pairedAt: null,
        });
        const choices = yield* decodeSetKeyboardChoicesRequestEffect({
          keyboards: [capture.keyboard],
          layouts: [capture.layout],
        });

        expect(pair).toEqual({
          code: "ABCD-EFGH",
          installId: "install-1",
          extensionVersion: "1.0.0",
          label: undefined,
          pairedAt: undefined,
        });
        expect(choices.keyboards[0]?.keyboardId).toBe("keyboard-1");
      }),
    ));

  it("rejects malformed numeric fields with a boundary decode error", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          decodeIngestRunRequestEffect({
            capture: { ...capture, wpm: 1_001 },
          }),
        );

        expect(error).toBeInstanceOf(BoundaryDecodeError);
        expect(error).toMatchObject({
          _tag: "BoundaryDecodeError",
          operation: "typing-runs.decode-ingest-run-request",
        });
      }),
    ));
});
