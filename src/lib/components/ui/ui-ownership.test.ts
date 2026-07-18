import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readSource = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

describe("shadcn component ownership", () => {
  it("keeps global CSS out of component internals", () => {
    const appCss = readSource("../../../app.css");
    const baseLayer = appCss.slice(
      appCss.indexOf("@layer base"),
      appCss.indexOf("html.no-js button"),
    );

    expect(appCss).toContain("@layer base");
    expect(baseLayer).toContain("button,");
    expect(baseLayer).toContain(":focus-visible");
    expect(baseLayer).toContain(".material-symbols-outlined");
    expect(appCss).not.toMatch(
      /^\.(?:empty-state|field|field-label|input|key-hero|seg|seq|tap-grid)[\s,{:]/m,
    );
    expect(appCss).not.toMatch(/\.seg\s+(?:button|a)/);
    expect(appCss).not.toMatch(/\.keymap-pane-group[^{}]*>\s*\.keymap-inspector-handle\s*>\s*div/);
  });

  it("styles shared controls through their shadcn variants", () => {
    const buttonAdapter = readSource("Button.svelte");
    const brand = readSource("Brand.svelte");
    const segmentedNav = readSource("SegmentedNav.svelte");
    const switchPrimitive = readSource("switch/switch.svelte");

    expect(buttonAdapter).not.toMatch(/(?:^|\s)![\w[]/m);
    expect(brand).toContain('import Button from "./Button.svelte"');
    expect(brand).not.toMatch(/<(?:button|a)\b/);
    expect(switchPrimitive).not.toMatch(/(?:^|\s)![\w[]/m);
    expect(segmentedNav).toContain('from "./button/index.js"');
    expect(segmentedNav).not.toMatch(/<(?:button|a)\b/);
  });
});
