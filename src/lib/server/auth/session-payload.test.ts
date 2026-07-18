import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { BoundaryDecodeError } from "$lib/effect/errors";
import { decodeAuthSessionPayloadEffect } from "./session-payload";

const timestamp = "2026-07-18T12:00:00.000Z";

describe("auth session payload decoding", () => {
  it("decodes the better-auth session and user DTOs without casts", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const payload = yield* decodeAuthSessionPayloadEffect({
          session: {
            id: "session-1",
            createdAt: timestamp,
            updatedAt: timestamp,
            userId: "user-1",
            expiresAt: "2026-07-19T12:00:00.000Z",
            token: "token-1",
            ipAddress: null,
            userAgent: "test",
          },
          user: {
            id: "user-1",
            createdAt: timestamp,
            updatedAt: timestamp,
            email: "user@example.com",
            emailVerified: true,
            name: "Test User",
            image: null,
            githubLogin: "test-user",
          },
        });

        expect(payload.session?.expiresAt).toBeInstanceOf(Date);
        expect(payload.session?.userId).toBe("user-1");
        expect(payload.user?.githubLogin).toBe("test-user");
      }),
    ));

  it("rejects malformed identity fields with a boundary decode error", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          decodeAuthSessionPayloadEffect({
            session: {
              id: "session-1",
              createdAt: timestamp,
              updatedAt: timestamp,
              userId: 42,
              expiresAt: timestamp,
              token: "token-1",
            },
          }),
        );

        expect(error).toBeInstanceOf(BoundaryDecodeError);
        expect(error).toMatchObject({
          _tag: "BoundaryDecodeError",
          operation: "hooks.decode-auth-session-payload",
        });
      }),
    ));
});
