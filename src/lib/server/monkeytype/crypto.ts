const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export interface EncryptedApeKey {
  ciphertext: string;
  iv: string;
}

type CryptoProvider = Pick<Crypto, "getRandomValues" | "subtle">;

export async function encryptApeKey(
  apeKey: string,
  secretKeyBase64: string,
  cryptoProvider: CryptoProvider = globalThis.crypto,
): Promise<EncryptedApeKey> {
  const key = await importSecretKey(secretKeyBase64, cryptoProvider);
  const iv = cryptoProvider.getRandomValues(new Uint8Array(12));
  const encrypted = await cryptoProvider.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    textEncoder.encode(apeKey),
  );

  return {
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    iv: bytesToBase64(iv),
  };
}

export async function decryptApeKey(
  encrypted: EncryptedApeKey,
  secretKeyBase64: string,
  cryptoProvider: CryptoProvider = globalThis.crypto,
): Promise<string> {
  const key = await importSecretKey(secretKeyBase64, cryptoProvider);
  const decrypted = await cryptoProvider.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(encrypted.iv) },
    key,
    base64ToBytes(encrypted.ciphertext),
  );
  return textDecoder.decode(decrypted);
}

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

async function importSecretKey(secretKeyBase64: string, cryptoProvider: CryptoProvider) {
  const keyBytes = base64ToBytes(assertValidMonkeytypeSecret(secretKeyBase64));
  return cryptoProvider.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt", "decrypt"]);
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
