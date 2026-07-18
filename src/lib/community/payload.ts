import { Effect, Schema } from "effect";

import { BoundaryDecodeError } from "$lib/effect/errors";
import { StoredDeviceProfileSchema, type StoredDeviceProfile } from "$lib/keyboard/schema";

export const decodeCommunityStoredProfileEffect = Effect.fn("CommunityPayload.decodeProfile")((
  value: unknown,
) => {
  const decode =
    typeof value === "string"
      ? Schema.decodeUnknownEffect(Schema.fromJsonString(StoredDeviceProfileSchema))(value)
      : Schema.decodeUnknownEffect(StoredDeviceProfileSchema)(value);

  return decode.pipe(
    Effect.map((profile): StoredDeviceProfile => profile),
    Effect.mapError(
      (cause) =>
        new BoundaryDecodeError({
          operation: "community.decode-stored-keymap-profile",
          message: `Stored community keymap profile did not match its contract: ${String(cause)}`,
          cause,
        }),
    ),
  );
});
