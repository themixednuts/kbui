/** Multi-select state for RGB paint mode on the keymap. */
export class KeymapRgbSelection {
  ids = $state<Set<string>>(new Set());

  readonly count = $derived(this.ids.size);

  has(keyId: string) {
    return this.ids.has(keyId);
  }

  selectOnly(keyId: string) {
    this.ids = new Set([keyId]);
  }

  add(keyId: string) {
    const next = new Set(this.ids);
    next.add(keyId);
    this.ids = next;
  }

  toggle(keyId: string) {
    const next = new Set(this.ids);
    if (next.has(keyId)) next.delete(keyId);
    else next.add(keyId);
    this.ids = next;
  }

  selectAll(keyIds: readonly string[]) {
    this.ids = new Set(keyIds);
  }

  clear() {
    this.ids = new Set();
  }
}
