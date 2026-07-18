import { Effect } from "effect";

import { platformError } from "$lib/effect/errors";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export interface EncryptedApeKey {
  ciphertext: string;
  iv: string;
}

type CryptoProvider = Pick<Crypto, "getRandomValues" | "subtle">;

export const encryptApeKeyEffect = Effect.fn("Monkeytype.encryptApeKey")(function* (
  apeKey: string,
  secretKeyBase64: string,
  cryptoProvider: CryptoProvider = globalThis.crypto,
) {
  const key = yield* importSecretKeyEffect(secretKeyBase64, cryptoProvider);
  const iv = cryptoProvider.getRandomValues(new Uint8Array(12));
  const encrypted = yield* Effect.tryPromise({
    try: () =>
      cryptoProvider.subtle.encrypt({ name: "AES-GCM", iv }, key, textEncoder.encode(apeKey)),
    catch: (cause) => platformError("monkeytype.encrypt-apekey", cause),
  });
  return {
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    iv: bytesToBase64(iv),
  };
});

export const decryptApeKeyEffect = Effect.fn("Monkeytype.decryptApeKey")(function* (
  encrypted: EncryptedApeKey,
  secretKeyBase64: string,
  cryptoProvider: CryptoProvider = globalThis.crypto,
) {
  const key = yield* importSecretKeyEffect(secretKeyBase64, cryptoProvider);
  const decrypted = yield* Effect.tryPromise({
    try: () =>
      cryptoProvider.subtle.decrypt(
        { name: "AES-GCM", iv: base64ToBytes(encrypted.iv) },
        key,
        base64ToBytes(encrypted.ciphertext),
      ),
    catch: (cause) => platformError("monkeytype.decrypt-apekey", cause),
  });
  return textDecoder.decode(decrypted);
});

export function assertValidMonkeytypeSecret(secretKeyBase64: string | null | undefined): string {
  if (!secretKeyBase64?.trim()) {
    throw new Error("MONKEYTYPE_SECRET_KEY is required to encrypt Monkeytype ApeKeys.");
  }

  const keyBytes = base64ToBytes(secretKeyBase64.trim());
  if (keyBytes.byteLength !== 32) {
    throw new Error("MONKEYTYPE_SECRET_KEY must be a base64-encoded 32-byte key.");
  }

  return secretKeyBase64.trim();
}

function importSecretKeyEffect(secretKeyBase64: string, cryptoProvider: CryptoProvider) {
  return Effect.flatMap(
    Effect.try({
      try: () => base64ToBytes(assertValidMonkeytypeSecret(secretKeyBase64)),
      catch: (cause) => platformError("monkeytype.validate-secret", cause),
    }),
    (keyBytes) =>
      Effect.tryPromise({
        try: () =>
          cryptoProvider.subtle.importKey("raw", keyBytes, "AES-GCM", false, [
            "encrypt",
            "decrypt",
          ]),
        catch: (cause) => platformError("monkeytype.import-secret", cause),
      }),
  );
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
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}
