import { Effect, Schema } from "effect";

import { BoundaryDecodeError } from "$lib/effect/errors";

const authDate = Schema.Union([
  Schema.DateValid,
  Schema.DateFromString.check(Schema.isDateValid()),
]);

const authSessionSchema = Schema.Struct({
  id: Schema.String,
  createdAt: authDate,
  updatedAt: authDate,
  userId: Schema.String,
  expiresAt: authDate,
  token: Schema.String,
  ipAddress: Schema.optionalKey(Schema.NullOr(Schema.String)),
  userAgent: Schema.optionalKey(Schema.NullOr(Schema.String)),
});

const authUserSchema = Schema.Struct({
  id: Schema.String,
  createdAt: authDate,
  updatedAt: authDate,
  email: Schema.String,
  emailVerified: Schema.Boolean,
  name: Schema.String,
  image: Schema.optionalKey(Schema.NullOr(Schema.String)),
  githubLogin: Schema.optionalKey(Schema.NullOr(Schema.String)),
});

const authSessionPayloadSchema = Schema.NullOr(
  Schema.Struct({
    session: Schema.optionalKey(authSessionSchema),
    user: Schema.optionalKey(authUserSchema),
  }),
);

export interface AuthSessionPayload {
  session: App.Locals["session"];
  user: App.Locals["user"];
}

export const decodeAuthSessionPayloadEffect = Effect.fn("AuthSessionPayload.decode")(
  (value: unknown) =>
    Schema.decodeUnknownEffect(authSessionPayloadSchema)(value).pipe(
      Effect.map(
        (payload): AuthSessionPayload => ({
          session: payload?.session ?? null,
          user: payload?.user ?? null,
        }),
      ),
      Effect.mapError(
        (cause) =>
          new BoundaryDecodeError({
            operation: "hooks.decode-auth-session-payload",
            message: `Auth session payload did not match its contract: ${String(cause)}`,
            cause,
          }),
      ),
    ),
);
