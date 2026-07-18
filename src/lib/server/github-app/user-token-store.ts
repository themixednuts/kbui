import { Effect } from "effect";

import { platformError } from "$lib/effect/errors";
import { runWorkerEffect } from "$lib/effect/worker-runtime";
import type { GitHubAppUserToken } from "$lib/server/github-app/oauth";

export interface GitHubAppUserTokenSecretEnv {
  GITHUB_APP_TOKEN_SECRET_KEY?: string;
}

export interface EncryptedGitHubAppUserToken {
  accessTokenCiphertext: string | null;
  accessTokenExpiresAt: Date | null;
  accessTokenIv: string | null;
  refreshTokenCiphertext: string | null;
  refreshTokenExpiresAt: Date | null;
  refreshTokenIv: string | null;
  tokenType: string;
}

type CryptoProvider = Pick<Crypto, "getRandomValues" | "subtle">;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function githubAppUserTokenSecretFor(env: GitHubAppUserTokenSecretEnv) {
  return githubAppUserTokenSecretsFor(env)[0] ?? null;
}

export function githubAppUserTokenSecretsFor(env: GitHubAppUserTokenSecretEnv) {
  const primary = env.GITHUB_APP_TOKEN_SECRET_KEY?.trim();
  return primary ? [assertValidGitHubAppUserTokenSecret(primary)] : [];
}

export function encryptGitHubAppUserToken(
  token: GitHubAppUserToken,
  secretKeyBase64: string,
  nowMs: number,
  cryptoProvider: CryptoProvider = globalThis.crypto,
): Promise<EncryptedGitHubAppUserToken> {
  return runWorkerEffect(
    "github-app.encrypt-user-token",
    Effect.gen(function* () {
      const accessToken = yield* encryptSecretEffect(
        token.accessToken,
        secretKeyBase64,
        cryptoProvider,
      );
      const refreshToken = token.refreshToken
        ? yield* encryptSecretEffect(token.refreshToken, secretKeyBase64, cryptoProvider)
        : null;
      return {
        accessTokenCiphertext: accessToken.ciphertext,
        accessTokenExpiresAt: expiresAt(nowMs, token.expiresIn),
        accessTokenIv: accessToken.iv,
        refreshTokenCiphertext: refreshToken?.ciphertext ?? null,
        refreshTokenExpiresAt: expiresAt(nowMs, token.refreshTokenExpiresIn),
        refreshTokenIv: refreshToken?.iv ?? null,
        tokenType: token.tokenType,
      };
    }),
  );
}

export function decryptGitHubAppUserAccessToken(
  encrypted: { accessTokenCiphertext: string; accessTokenIv: string },
  secretKeyBase64: string,
  cryptoProvider: CryptoProvider = globalThis.crypto,
) {
  return runWorkerEffect(
    "github-app.decrypt-access-token",
    decryptSecretEffect(
      {
        ciphertext: encrypted.accessTokenCiphertext,
        iv: encrypted.accessTokenIv,
      },
      secretKeyBase64,
      cryptoProvider,
    ),
  );
}

export function decryptGitHubAppUserRefreshToken(
  encrypted: { refreshTokenCiphertext: string; refreshTokenIv: string },
  secretKeyBase64: string,
  cryptoProvider: CryptoProvider = globalThis.crypto,
) {
  return runWorkerEffect(
    "github-app.decrypt-refresh-token",
    decryptSecretEffect(
      {
        ciphertext: encrypted.refreshTokenCiphertext,
        iv: encrypted.refreshTokenIv,
      },
      secretKeyBase64,
      cryptoProvider,
    ),
  );
}

export function assertValidGitHubAppUserTokenSecret(secretKeyBase64: string) {
  const keyBytes = base64ToBytes(secretKeyBase64.trim());
  if (keyBytes.byteLength !== 32) {
    throw new Error("GitHub App token secret must be a base64-encoded 32-byte key.");
  }
  return secretKeyBase64.trim();
}

function encryptSecretEffect(
  value: string,
  secretKeyBase64: string,
  cryptoProvider: CryptoProvider,
) {
  return Effect.gen(function* () {
    const key = yield* importSecretKeyEffect(secretKeyBase64, cryptoProvider);
    const iv = cryptoProvider.getRandomValues(new Uint8Array(12));
    const encrypted = yield* Effect.tryPromise({
      try: () =>
        cryptoProvider.subtle.encrypt({ name: "AES-GCM", iv }, key, textEncoder.encode(value)),
      catch: (cause) => platformError("github-app.encrypt-secret", cause),
    });
    return {
      ciphertext: bytesToBase64(new Uint8Array(encrypted)),
      iv: bytesToBase64(iv),
    };
  });
}

function decryptSecretEffect(
  encrypted: { ciphertext: string; iv: string },
  secretKeyBase64: string,
  cryptoProvider: CryptoProvider,
) {
  return Effect.gen(function* () {
    const key = yield* importSecretKeyEffect(secretKeyBase64, cryptoProvider);
    const decrypted = yield* Effect.tryPromise({
      try: () =>
        cryptoProvider.subtle.decrypt(
          { name: "AES-GCM", iv: base64ToBytes(encrypted.iv) },
          key,
          base64ToBytes(encrypted.ciphertext),
        ),
      catch: (cause) => platformError("github-app.decrypt-secret", cause),
    });
    return textDecoder.decode(decrypted);
  });
}

function importSecretKeyEffect(secretKeyBase64: string, cryptoProvider: CryptoProvider) {
  return Effect.flatMap(
    Effect.try({
      try: () => base64ToBytes(assertValidGitHubAppUserTokenSecret(secretKeyBase64)),
      catch: (cause) => platformError("github-app.validate-token-secret", cause),
    }),
    (keyBytes) =>
      Effect.tryPromise({
        try: () =>
          cryptoProvider.subtle.importKey("raw", keyBytes, "AES-GCM", false, [
            "encrypt",
            "decrypt",
          ]),
        catch: (cause) => platformError("github-app.import-token-secret", cause),
      }),
  );
}

function expiresAt(nowMs: number, expiresInSeconds: number | null) {
  return expiresInSeconds === null ? null : new Date(nowMs + expiresInSeconds * 1000);
}

function base64ToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}
