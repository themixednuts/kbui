const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  "input:not([type=hidden])",
  "select",
  "textarea",
  "summary",
  "[contenteditable=true]",
  "[role=button]",
  "[role=checkbox]",
  "[role=combobox]",
  "[role=link]",
  "[role=menuitem]",
  "[role=radio]",
  "[role=slider]",
  "[role=switch]",
  "[role=tab]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export async function inspectLayout(page) {
  return page.evaluate(collectLayoutIssues, INTERACTIVE_SELECTOR);
}

export function watchPageErrors(page, baseOrigin) {
  const issues = [];
  const seen = new Set();
  const failedResponseUrls = new Set();

  function record(kind, message) {
    const conciseMessage = oneLine(message, 220);
    const key = `${kind}\u0000${conciseMessage}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({ kind, message: conciseMessage });
  }

  function onConsole(message) {
    if (message.type() !== "error") return;
    const location = message.location();
    if (
      location.url &&
      failedResponseUrls.has(location.url) &&
      message.text().startsWith("Failed to load resource")
    ) {
      return;
    }
    const source = location.url ? ` (${displayUrl(location.url, baseOrigin)})` : "";
    record("page-error", `Console: ${message.text()}${source}`);
  }

  function onPageError(error) {
    record("page-error", `Uncaught: ${error.message || String(error)}`);
  }

  function onResponse(response) {
    if (response.status() < 400) return;
    failedResponseUrls.add(response.url());
    const request = response.request();
    record(
      "http-error",
      `${request.method()} ${displayUrl(response.url(), baseOrigin)} returned ${response.status()} (${request.resourceType()})`,
    );
  }

  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("response", onResponse);

  return {
    record,
    snapshot: () => [...issues],
    stop() {
      page.off("console", onConsole);
      page.off("pageerror", onPageError);
      page.off("response", onResponse);
    },
  };
}

export function formatAuditReport(results, { routeCount, viewportCount }) {
  const scenarioCount = results.length;
  const findings = results.flatMap((result) =>
    result.issues.map((issue) => ({
      ...issue,
      route: result.route,
      viewport: result.viewport.name,
    })),
  );

  if (findings.length === 0) {
    return {
      failed: false,
      output: `PASS layout audit: ${scenarioCount} scenarios (${routeCount} routes x ${viewportCount} viewports); no overflow, control overlap, clipped control text, or page errors.`,
    };
  }

  const groups = new Map();
  for (const finding of findings) {
    const key = `${finding.kind}\u0000${finding.message}`;
    const group = groups.get(key) ?? { ...finding, scenarios: [] };
    group.scenarios.push({ route: finding.route, viewport: finding.viewport });
    groups.set(key, group);
  }

  const affectedScenarios = new Set(
    findings.map((finding) => `${finding.viewport}\u0000${finding.route}`),
  ).size;
  const lines = [
    `FAIL layout audit: ${groups.size} unique findings across ${affectedScenarios}/${scenarioCount} scenarios.`,
  ];

  for (const group of groups.values()) {
    const scope = formatScope(group.scenarios, { routeCount, scenarioCount, viewportCount });
    lines.push(`- ${group.kind} [${scope}]: ${group.message}`);
  }

  return { failed: true, output: lines.join("\n") };
}

function collectLayoutIssues(interactiveSelector) {
  const tolerance = 2;
  const issues = [];
  const seen = new Set();

  function add(kind, message) {
    const key = `${kind}\u0000${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({ kind, message });
  }

  function isRendered(element) {
    if (!(element instanceof Element)) return false;
    if (element.closest("[hidden], [inert], [aria-hidden='true']")) return false;
    if (element.getClientRects().length === 0) return false;

    const rect = element.getBoundingClientRect();
    if (rect.width < tolerance || rect.height < tolerance) return false;

    for (let current = element; current; current = current.parentElement) {
      const style = getComputedStyle(current);
      if (style.display === "none" || style.visibility === "hidden") return false;
      if (Number.parseFloat(style.opacity) <= 0.01) return false;
    }

    return true;
  }

  function semanticClass(element) {
    return [...element.classList].find(
      (token) => /^[a-z][a-z0-9-]+$/.test(token) && token.includes("-"),
    );
  }

  function describeElement(element, text = renderedText(element)) {
    const testId = element.getAttribute("data-testid");
    if (testId) return `[data-testid=${JSON.stringify(testId)}]`;
    if (element.id) return `#${element.id}`;

    const tag = element.tagName.toLowerCase();
    const role = element.getAttribute("role");
    const name = element.getAttribute("aria-label") ?? element.getAttribute("title") ?? text ?? "";
    const conciseName = normalizeText(name).slice(0, 70);
    if (conciseName) return `${role ?? tag} ${JSON.stringify(conciseName)}`;

    const className = semanticClass(element);
    return className ? `${tag}.${className}` : tag;
  }

  function renderedText(element) {
    if (element instanceof HTMLInputElement) {
      return normalizeText(element.value || element.placeholder || element.getAttribute("value"));
    }
    if (element instanceof HTMLTextAreaElement) {
      return normalizeText(element.value || element.placeholder);
    }
    if (element instanceof HTMLSelectElement) {
      return normalizeText(element.selectedOptions[0]?.textContent);
    }

    const chunks = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const value = normalizeText(node.textContent);
      if (!value) continue;
      const parent = node.parentElement;
      if (!parent || parent.closest("[aria-hidden='true']")) continue;
      if (parent.getClientRects().length === 0) continue;
      const style = getComputedStyle(parent);
      if (style.display === "none" || style.visibility === "hidden") continue;
      chunks.push(value);
    }
    return normalizeText(chunks.join(" "));
  }

  function normalizeText(value) {
    return String(value ?? "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function structuralCandidates() {
    const candidates = new Set([
      document.scrollingElement,
      document.body,
      ...document.querySelectorAll(
        ".new-app-shell, .shell-main, .shell-content, main, [role='main']",
      ),
    ]);
    const shellContent = document.querySelector(".shell-content");
    for (const child of shellContent?.children ?? []) candidates.add(child);

    return [...candidates].filter(Boolean);
  }

  for (const element of structuralCandidates()) {
    if (!(element instanceof HTMLElement) || !isRendered(element)) continue;
    if (
      element === document.body &&
      document.scrollingElement?.scrollWidth > innerWidth + tolerance
    ) {
      continue;
    }

    const boxWidth = element === document.scrollingElement ? innerWidth : element.clientWidth;
    const contentWidth = element.scrollWidth;
    const overflowX = getComputedStyle(element).overflowX;
    if (overflowX === "hidden" || overflowX === "clip") continue;
    if (boxWidth > 0 && contentWidth > boxWidth + tolerance) {
      const target =
        element === document.scrollingElement ? "document" : describeElement(element, "");
      add(
        "overflow-x",
        `${target} scrolls horizontally: ${Math.ceil(contentWidth)}px content in a ${Math.floor(boxWidth)}px box`,
      );
      continue;
    }

    const rect = element.getBoundingClientRect();
    if (rect.left < -tolerance || rect.right > innerWidth + tolerance) {
      add(
        "overflow-x",
        `${describeElement(element, "")} extends outside the viewport (${Math.round(rect.left)}px to ${Math.round(rect.right)}px)`,
      );
    }
  }

  const controls = [...new Set(document.querySelectorAll(interactiveSelector))].filter(
    (element) => {
      if (!isRendered(element)) return false;
      if (element.matches(":disabled, [aria-disabled='true']")) return false;
      if (!hasVisualPaint(element)) return false;
      return getComputedStyle(element).pointerEvents !== "none";
    },
  );

  const controlRects = controls.map((element) => {
    const rect = element.getBoundingClientRect();
    return {
      clipRoot: nearestClippingAncestor(element),
      element,
      rect,
      visibleRect: clippedViewportRect(element, rect),
    };
  });

  const overlapMessages = [];
  for (let leftIndex = 0; leftIndex < controlRects.length; leftIndex += 1) {
    const left = controlRects[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < controlRects.length; rightIndex += 1) {
      const right = controlRects[rightIndex];
      if (left.element.contains(right.element) || right.element.contains(left.element)) continue;

      const sameClipRoot = left.clipRoot === right.clipRoot;
      const leftRect = sameClipRoot ? left.rect : left.visibleRect;
      const rightRect = sameClipRoot ? right.rect : right.visibleRect;
      if (!leftRect || !rightRect) continue;

      const overlapWidth =
        Math.min(leftRect.right, rightRect.right) - Math.max(leftRect.left, rightRect.left);
      const overlapHeight =
        Math.min(leftRect.bottom, rightRect.bottom) - Math.max(leftRect.top, rightRect.top);
      if (overlapWidth <= tolerance || overlapHeight <= tolerance) continue;
      if (overlapWidth * overlapHeight < 32) continue;

      overlapMessages.push(
        `${describeElement(left.element)} overlaps ${describeElement(right.element)} by ${Math.round(overlapWidth)}x${Math.round(overlapHeight)}px`,
      );
    }
  }
  addExamples("control-overlap", overlapMessages, "visible control pairs overlap");

  const clippedTextMessages = [];
  for (const control of controls) {
    const text = renderedText(control);
    if (!text) continue;

    const nativeOverflow = nativeControlTextOverflow(control, text);
    if (nativeOverflow) {
      clippedTextMessages.push(
        `${describeElement(control, text)} clips ${nativeOverflow.axis} text (${nativeOverflow.content}px needed, ${nativeOverflow.available}px available)`,
      );
      continue;
    }

    const candidates = [control, ...control.querySelectorAll("*")];
    for (const candidate of candidates) {
      if (!(candidate instanceof HTMLElement) || !isRendered(candidate)) continue;
      if (!renderedText(candidate)) continue;

      const style = getComputedStyle(candidate);
      const clipsX = style.overflowX !== "visible";
      const clipsY = style.overflowY !== "visible";
      const clippedX =
        clipsX &&
        candidate.clientWidth > 0 &&
        candidate.scrollWidth > candidate.clientWidth + tolerance;
      const clippedY =
        clipsY &&
        candidate.clientHeight > 0 &&
        candidate.scrollHeight > candidate.clientHeight + tolerance;
      if (!clippedX && !clippedY) continue;

      const axis =
        clippedX && clippedY ? "horizontal and vertical" : clippedX ? "horizontal" : "vertical";
      const contentSize = clippedX ? candidate.scrollWidth : candidate.scrollHeight;
      const boxSize = clippedX ? candidate.clientWidth : candidate.clientHeight;
      clippedTextMessages.push(
        `${describeElement(control, text)} clips ${axis} text (${Math.ceil(contentSize)}px content in a ${Math.floor(boxSize)}px box)`,
      );
      break;
    }
  }
  addExamples("clipped-control-text", clippedTextMessages, "controls clip text");

  return issues;

  function nearestClippingAncestor(element) {
    for (let current = element.parentElement; current; current = current.parentElement) {
      const style = getComputedStyle(current);
      if (style.overflowX !== "visible" || style.overflowY !== "visible") return current;
    }
    return document.documentElement;
  }

  function hasVisualPaint(element) {
    if (renderedText(element)) return true;
    if (element.matches("input, select, textarea")) return true;
    if (
      element.querySelector("canvas, img, picture, svg, video, .material-symbols-outlined, .lucide")
    ) {
      return true;
    }

    const style = getComputedStyle(element);
    const hasBackground =
      style.backgroundImage !== "none" ||
      !["rgba(0, 0, 0, 0)", "transparent"].includes(style.backgroundColor);
    const hasBorder = ["Top", "Right", "Bottom", "Left"].some(
      (side) =>
        Number.parseFloat(style[`border${side}Width`]) > 0 &&
        style[`border${side}Style`] !== "none",
    );
    return hasBackground || hasBorder || style.boxShadow !== "none";
  }

  function addExamples(kind, messages, summary) {
    const uniqueMessages = [...new Set(messages)];
    if (uniqueMessages.length <= 2) {
      for (const message of uniqueMessages) add(kind, message);
      return;
    }

    add(
      kind,
      `${uniqueMessages.length} ${summary}; examples: ${uniqueMessages.slice(0, 2).join("; ")}`,
    );
  }

  function clippedViewportRect(element, initialRect) {
    const rect = {
      bottom: Math.min(initialRect.bottom, innerHeight),
      left: Math.max(initialRect.left, 0),
      right: Math.min(initialRect.right, innerWidth),
      top: Math.max(initialRect.top, 0),
    };

    for (let current = element.parentElement; current; current = current.parentElement) {
      const style = getComputedStyle(current);
      const parentRect = current.getBoundingClientRect();
      if (style.overflowX !== "visible") {
        rect.left = Math.max(rect.left, parentRect.left);
        rect.right = Math.min(rect.right, parentRect.right);
      }
      if (style.overflowY !== "visible") {
        rect.top = Math.max(rect.top, parentRect.top);
        rect.bottom = Math.min(rect.bottom, parentRect.bottom);
      }
    }

    if (rect.right - rect.left <= tolerance || rect.bottom - rect.top <= tolerance) return null;
    return rect;
  }

  function nativeControlTextOverflow(control, text) {
    const isTextInput =
      control instanceof HTMLInputElement &&
      ![
        "button",
        "checkbox",
        "color",
        "file",
        "hidden",
        "image",
        "radio",
        "range",
        "reset",
        "submit",
      ].includes(control.type);
    const isSelect = control instanceof HTMLSelectElement;
    if (!isTextInput && !isSelect) return null;

    const style = getComputedStyle(control);
    const padding = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
    const selectAffordance = isSelect ? 18 : 0;
    const available = Math.max(0, control.clientWidth - padding - selectAffordance);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context || available <= 0) return null;
    context.font = style.font;
    const content = Math.ceil(context.measureText(text).width);
    if (content <= available + tolerance) return null;
    return { available: Math.floor(available), axis: "horizontal", content };
  }
}

function displayUrl(value, baseOrigin) {
  try {
    const url = new URL(value);
    return url.origin === baseOrigin ? url.pathname : `${url.origin}${url.pathname}`;
  } catch {
    return oneLine(value, 120);
  }
}

function formatScope(scenarios, { routeCount, scenarioCount, viewportCount }) {
  const unique = [
    ...new Map(
      scenarios.map((scenario) => [`${scenario.viewport}\u0000${scenario.route}`, scenario]),
    ).values(),
  ];
  if (unique.length === scenarioCount) return `all ${scenarioCount} scenarios`;

  const routes = new Set(unique.map((scenario) => scenario.route));
  const viewports = new Set(unique.map((scenario) => scenario.viewport));
  if (routes.size === 1 && unique.length === viewportCount) {
    return `${unique[0].route} at all viewports`;
  }
  if (viewports.size === 1 && unique.length === routeCount) {
    return `${unique[0].viewport} across all routes`;
  }
  if (unique.length <= 4) {
    return unique.map((scenario) => `${scenario.viewport} ${scenario.route}`).join(", ");
  }
  return `${unique.length} scenarios`;
}

function oneLine(value, maxLength = 180) {
  const normalized = stripAnsi(String(value ?? ""))
    .replace(/\s+/g, " ")
    .trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
}

function stripAnsi(value) {
  let output = "";
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) !== 27 || value[index + 1] !== "[") {
      output += value[index];
      continue;
    }

    index += 2;
    while (index < value.length) {
      const code = value.charCodeAt(index);
      if (code >= 64 && code <= 126) break;
      index += 1;
    }
  }
  return output;
}
