import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { BoundaryDecodeError } from "$lib/effect/errors";
import { encodeDeviceProfileForStorage } from "$lib/keyboard/schema";
import { starterBoardProfile } from "$lib/keyboard/sample-boards";
import { decodeCommunityStoredProfileEffect } from "./payload";

describe("community keymap payload decoding", () => {
  it("decodes stored object and JSON-string payloads", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const stored = encodeDeviceProfileForStorage(starterBoardProfile());
        const fromObject = yield* decodeCommunityStoredProfileEffect(stored);
        const fromJson = yield* decodeCommunityStoredProfileEffect(JSON.stringify(stored));

        expect(fromObject.id).toBe(stored.id);
        expect(fromJson.layers).toHaveLength(stored.layers.length);
      }),
    ));

  it("rejects corrupt stored profiles before agent RPC serialization", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const stored = encodeDeviceProfileForStorage(starterBoardProfile());
        const error = yield* Effect.flip(
          decodeCommunityStoredProfileEffect({
            ...stored,
            settings: { ...stored.settings, nkro: "yes" },
          }),
        );

        expect(error).toBeInstanceOf(BoundaryDecodeError);
        expect(error).toMatchObject({
          _tag: "BoundaryDecodeError",
          operation: "community.decode-stored-keymap-profile",
        });
      }),
    ));
});
