import { Effect } from "effect";

import { platformError } from "$lib/effect/errors";

export type GitHubArtifactBytes = ArrayBuffer | ArrayBufferView;

export type GitHubArtifactSha256Digest = `sha256:${string}`;

function arrayBufferCopy(bytes: GitHubArtifactBytes): ArrayBuffer {
  const source =
    bytes instanceof ArrayBuffer
      ? new Uint8Array(bytes)
      : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const copy = new ArrayBuffer(source.byteLength);
  new Uint8Array(copy).set(source);
  return copy;
}

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const verifyGitHubArtifactSha256DigestEffect = Effect.fn(
  "GitHubArtifact.verifySha256Digest",
)(function* (zipBytes: GitHubArtifactBytes, declaredDigest: string) {
  const digestMatch = /^sha256:([0-9a-f]{64})$/i.exec(declaredDigest);
  if (!digestMatch) {
    return yield* Effect.fail(
      platformError(
        "github.verify-artifact-digest",
        "GitHub artifact digest must use the sha256:<64 hex characters> format.",
      ),
    );
  }
  const expectedDigest = `sha256:${digestMatch[1].toLowerCase()}` as const;
  const actualHash = yield* Effect.tryPromise({
    try: () => crypto.subtle.digest("SHA-256", arrayBufferCopy(zipBytes)),
    catch: (cause) => platformError("github.verify-artifact-digest", cause),
  });
  const actualDigest = `sha256:${hex(actualHash)}` as const;
  if (actualDigest !== expectedDigest) {
    return yield* Effect.fail(
      platformError(
        "github.verify-artifact-digest",
        `GitHub artifact SHA-256 mismatch: expected ${expectedDigest}, received ${actualDigest}.`,
      ),
    );
  }
  return actualDigest;
});
