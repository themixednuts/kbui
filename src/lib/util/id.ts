export function newId(): string {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new Error("crypto.randomUUID() is required to create kbgui IDs.");
  }

  return globalThis.crypto.randomUUID();
}
