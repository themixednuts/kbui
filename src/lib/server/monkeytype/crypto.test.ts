import { describe, expect, it } from "vite-plus/test";

import { assertValidMonkeytypeSecret, decryptApeKey, encryptApeKey } from "./crypto";

describe("Monkeytype ApeKey crypto", () => {
  it("round-trips an ApeKey with AES-GCM and does not store plaintext", async () => {
    const secret = testSecret();
    const encrypted = await encryptApeKey("ape-key-secret", secret);

    expect(encrypted.ciphertext).not.toContain("ape-key-secret");
    expect(encrypted.iv).not.toContain("ape-key-secret");
    await expect(decryptApeKey(encrypted, secret)).resolves.toBe("ape-key-secret");
  });

  it("requires a 32-byte base64 secret", () => {
    expect(() => assertValidMonkeytypeSecret("not-a-valid-32-byte-key")).toThrow(/32-byte key/);
    expect(assertValidMonkeytypeSecret(testSecret())).toBe(testSecret());
  });
});

function testSecret() {
  const bytes = new Uint8Array(32);
  bytes.fill(7);
  return btoa(String.fromCharCode(...bytes));
}
