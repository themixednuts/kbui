<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { ArrowLeft, Camera, Edit3, Sparkles, Trash2 } from "@lucide/svelte";

  import { Brand } from "$lib/components/ui";

  /**
   * Photo tracer — auto-detect rectangular keycaps in a photo and let the
   * user manually add / delete / resize any key, then emit a KLE snippet.
   *
   * Detection pipeline:
   *   1. Convert to grayscale (luminance).
   *   2. Optional Gaussian blur (separable 1D, σ ≈ 1.5).
   *   3. OTSU global threshold for auto-pick, with manual override slider.
   *   4. Morphological close (dilate ∘ erode) with adjustable radius to
   *      seal small gaps inside keycaps and split touching blobs.
   *   5. Connected components via stack-based flood fill (4-connectivity).
   *   6. For each component, brute-force minimum-bounding-rectangle search
   *      (coarse 3° then fine 0.25°) yields rotation, side length, corners.
   *
   * The user can also draw a key manually (4-click), drag corner handles
   * on a selected key to refine, and delete unwanted blobs. All KLE math
   * is anchored on the labelled R0C2 key.
   */
  type Point = { x: number; y: number };
  type ShapeKind = "key" | "trackpad" | "outlier";
  type KeyShape = {
    id: number;
    pixelCount: number;
    perimeter: number;
    circularity: number;
    centroid: Point;
    rotationDeg: number;
    sideLengthPx: number;
    corners: [Point, Point, Point, Point];
    label?: string;
    origin: "auto" | "manual";
    kind: ShapeKind;
    /** Short reason string when kind === "outlier" (size, isolated, etc.). */
    outlierReason?: string;
    /**
     * True when the user explicitly picked a label from the dropdown. The
     * auto-label pass treats locked keys as immutable — its `label = undefined`
     * pre-clear skips them, so manual choices survive subsequent runs.
     */
    labelLocked?: boolean;
  };
  type Mode = "select" | "add";

  type RejectionCounts = {
    tooSmall: number;
    tooLarge: number;
    badAspect: number;
  };
  type DetectionStats = {
    detected: number;
    keys: number;
    trackpads: number;
    outliers: number;
    medianSidePx: number;
    medianSpacingPx: number;
    /** Components rejected before reaching the classification pass. */
    rejected: RejectionCounts;
  } | null;

  // Build the matrix label dropdown lazily from rowCount/colCount. Split
  // keyboards expose: left main (rows 0..rowCount-1), left thumb row
  // (rowCount), right main (rowCount+1..2*rowCount), right thumb row
  // (2*rowCount+1). Anchor = top-center of the left main grid.
  const labelOptions = $derived.by(() => {
    const opts: Array<{ value: string; desc: string }> = [
      { value: "", desc: "— unlabelled —" },
    ];
    const anchorCol = Math.floor(colCount / 2);
    // Left main grid (and the anchor)
    for (let r = 0; r < rowCount; r++) {
      for (let c = 0; c < colCount; c++) {
        const isAnchor = r === 0 && c === anchorCol;
        opts.push({
          value: `${r},${c}`,
          desc: `L R${r}C${c}${isAnchor ? " (ANCHOR)" : ""}`,
        });
      }
    }
    // Left thumb row
    for (let c = 0; c < colCount; c++) {
      opts.push({ value: `${rowCount},${c}`, desc: `L thumb R${rowCount}C${c}` });
    }
    // Right main grid (offset rows)
    const rightRowStart = rowCount + 1;
    for (let r = 0; r < rowCount; r++) {
      for (let c = 0; c < colCount; c++) {
        opts.push({
          value: `${rightRowStart + r},${c}`,
          desc: `R R${rightRowStart + r}C${c}`,
        });
      }
    }
    // Right thumb row
    const thumbRow = 2 * rowCount + 1;
    for (let c = 0; c < colCount; c++) {
      opts.push({ value: `${thumbRow},${c}`, desc: `R thumb R${thumbRow}C${c}` });
    }
    return opts;
  });

  let imgEl = $state<HTMLImageElement>();
  let canvasEl = $state<HTMLCanvasElement>();
  let imgUrl = $state<string>("");
  let imgWidth = $state(0);
  let imgHeight = $state(0);
  let zoom = $state(1);
  /**
   * Blank-canvas mode: the user wants to build a layout from scratch with
   * no photo. We render an empty canvas at a default size, and "Add key"
   * places fixed-size squares at the click point (smartAdd's flood gives
   * up gracefully without a cached mask and falls back to the default).
   */
  let blankMode = $state(false);
  const canvasReady = $derived(Boolean(imgUrl) || blankMode);

  // Detection params
  type ThresholdMode = "otsu" | "manual" | "adaptive";
  let thresholdMode = $state<ThresholdMode>("otsu");
  let manualThreshold = $state(180);
  let adaptiveWindow = $state(31); // pixel side of local mean window
  let adaptiveBias = $state(8); // subtract from local mean before compare
  let invertThreshold = $state(false);
  let blurSigma = $state(1.5);
  let closeRadius = $state(2);
  let openRadius = $state(0); // morphological open AFTER close → splits touching keys
  let minArea = $state(800);
  let maxArea = $state(20000);
  let minAspect = $state(0.6);
  let detectedThreshold = $state<number | null>(null);
  type MaskMode = "off" | "overlay" | "replace";
  let maskMode = $state<MaskMode>("off");
  let maskOpacity = $state(0.45);
  let maskImageData = $state<ImageData | null>(null);
  let overlayMaskImageData = $state<ImageData | null>(null);

  // Cached binary mask from the most recent detection (1 = key pixel, 0 = background).
  // Smart-add and edge-snap both read this directly so they don't have to
  // re-run preprocessing.
  let cachedMask: Uint8Array | null = null;
  let cachedMaskWidth = 0;
  let cachedMaskHeight = 0;
  let isDetecting = $state(false);
  let detectionScheduled = $state(false);
  let lastSmartAddNote = $state("");

  // Key state
  let blobs = $state<KeyShape[]>([]);
  let selectedBlobId = $state<number | null>(null);
  let mode = $state<Mode>("select");
  let addClicks = $state<Point[]>([]);
  let nextId = 1;

  // Drag state for resizing corners
  let dragInfo = $state<{ blobId: number; cornerIndex: number } | null>(null);

  // Cleanup pipeline params
  let outlierSizeIQRFactor = $state(1.5);
  let trackpadCircularity = $state(0.78);
  let trackpadAreaFactor = $state(2.5);
  let isolationFactor = $state(2.8);
  let detectionStats = $state<DetectionStats>(null);

  // Layout awareness: with `rowCount` × `colCount` known we can cluster
  // detected keys into columns and snap each key's position/rotation to its
  // column's best-fit line (so a misdetected outlier in column 2 still
  // shares column 2's rotation and x). Auto-label assigns `${row},${col}`
  // to the first `rowCount` keys (sorted top→bottom) in each column —
  // skipping `origin === "manual"` so user-placed thumbs keep their names.
  let rowCount = $state(3);
  let colCount = $state(5);
  let snapToColumns = $state(false);
  let autoLabel = $state(true);
  // Set true when photographing the right half of a split keyboard so the
  // column ordering reverses (leftmost column in image = highest col index).
  let mirrorColumns = $state(false);
  /** Detected median key rotation (= keyboard half tilt). Null = no data. */
  let detectedKbAngle = $state<number | null>(null);
  /** When split-keyboard auto-detect fires, this holds the right half's angle. */
  let detectedRightKbAngle = $state<number | null>(null);
  /** "single" | "split" — what postClassify decided about the layout. */
  let detectedLayout = $state<"single" | "split" | null>(null);

  type MissingSlot = {
    /** Stable key for the `{#each}` block. */
    id: string;
    /** Pre-computed matrix label so we can show it on hover and use it after fill. */
    label: string;
    /** Predicted centroid (image frame). */
    centroid: Point;
    /** Predicted side length + rotation (taken from column medians). */
    sideLengthPx: number;
    rotationDeg: number;
    corners: [Point, Point, Point, Point];
  };
  /** Predicted grid slots where a row in some column has no detection. */
  let detectedMissing = $state<MissingSlot[]>([]);
  /** Brief "Copied!" badge state for the snippet's copy button. */
  let snippetCopied = $state(false);
  /** Brief feedback badge for the Save / Update / Download buttons. */
  let saveBadge = $state<"" | "saved" | "updated" | "downloaded">("");
  type SidebarTab = "setup" | "detect" | "output";
  /** Right-sidebar tab. Defaults to Setup — rows/cols are usually the
   * first thing the user wants to confirm after loading a photo. */
  let sidebarTab = $state<SidebarTab>("setup");

  /**
   * Names of layouts the user has previously saved to localStorage. Used
   * to render an "open existing" list in the empty state — without this
   * surface, `Save` was effectively write-only.
   */
  let savedLayoutNames = $state<string[]>([]);

  function refreshSavedLayouts() {
    try {
      const raw = localStorage.getItem(LOCAL_LAYOUTS_KEY);
      const map = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      savedLayoutNames = Object.keys(map).sort();
    } catch {
      savedLayoutNames = [];
    }
  }

  /**
   * Reload a previously-saved layout from localStorage into the trace
   * canvas. Rehydrates each key as a manual blob with locked label so
   * the user can refine + re-save without losing the matrix assignments.
   * No photo is required; the canvas opens in blank-mode geometry.
   */
  function loadSavedLayout(name: string) {
    try {
      const raw = localStorage.getItem(LOCAL_LAYOUTS_KEY);
      const map = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      const def = map[name] as
        | { matrix?: { rows?: number; cols?: number }; layouts?: { keymap?: unknown } }
        | undefined;
      if (!def?.layouts?.keymap) return;
      // Use the trace's own canvas geometry — we don't have the original
      // photo, but we DO have the KLE rx/ry positions, which we can map
      // back to pixel positions using a reasonable px-per-unit.
      const pxPerU = 56;
      const margin = 40;
      // Find anchor for offset (first labelled entry).
      const km = def.layouts.keymap as unknown[];
      const newBlobs: KeyShape[] = [];
      const anchorCol = Math.floor((def.matrix?.cols ?? colCount) / 2);
      const anchorLabel = `0,${anchorCol}`;
      let anchorRx = anchorCol + 0.5;
      let anchorRy = 0.5;
      // First pass to find anchor's rx/ry.
      for (const row of km) {
        if (!Array.isArray(row)) continue;
        let optsAcc: { r?: number; rx?: number; ry?: number } = {};
        for (const cell of row) {
          if (typeof cell === "object" && cell !== null) {
            optsAcc = { ...optsAcc, ...(cell as Record<string, unknown>) };
          } else if (typeof cell === "string" && cell === anchorLabel) {
            anchorRx = (optsAcc.rx ?? anchorRx) + 0.5;
            anchorRy = (optsAcc.ry ?? anchorRy) + 0.5;
          }
        }
      }
      // Compute extents so we can centre the layout in the canvas.
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      const provisional: Array<{ label: string; cx: number; cy: number; rot: number }> = [];
      for (const row of km) {
        if (!Array.isArray(row)) continue;
        let optsAcc: { r?: number; rx?: number; ry?: number } = {};
        for (const cell of row) {
          if (typeof cell === "object" && cell !== null) {
            optsAcc = { ...optsAcc, ...(cell as Record<string, unknown>) };
          } else if (typeof cell === "string") {
            const rot = optsAcc.r ?? 0;
            const rad = (rot * Math.PI) / 180;
            const ox = 0.5 * Math.cos(rad) - 0.5 * Math.sin(rad);
            const oy = 0.5 * Math.sin(rad) + 0.5 * Math.cos(rad);
            const cx = (optsAcc.rx ?? 0) + ox;
            const cy = (optsAcc.ry ?? 0) + oy;
            provisional.push({ label: cell, cx, cy, rot });
            if (cx < minX) minX = cx;
            if (cy < minY) minY = cy;
            if (cx > maxX) maxX = cx;
            if (cy > maxY) maxY = cy;
          }
        }
      }
      if (provisional.length === 0) return;
      const spanX = (maxX - minX) * pxPerU;
      const spanY = (maxY - minY) * pxPerU;
      const canvasW = Math.max(900, Math.ceil(spanX + margin * 2));
      const canvasH = Math.max(520, Math.ceil(spanY + margin * 2));

      // Convert into pixel-space blobs.
      for (const p of provisional) {
        const px = margin + (p.cx - minX) * pxPerU;
        const py = margin + (p.cy - minY) * pxPerU;
        const half = pxPerU / 2;
        const t = (p.rot * Math.PI) / 180;
        const cos = Math.cos(t);
        const sin = Math.sin(t);
        newBlobs.push({
          id: nextId++,
          pixelCount: 0,
          perimeter: 0,
          circularity: 0.785,
          centroid: { x: px, y: py },
          rotationDeg: p.rot,
          sideLengthPx: pxPerU,
          corners: [
            { x: px - half * cos + half * sin, y: py - half * sin - half * cos },
            { x: px + half * cos + half * sin, y: py + half * sin - half * cos },
            { x: px + half * cos - half * sin, y: py + half * sin + half * cos },
            { x: px - half * cos - half * sin, y: py - half * sin + half * cos },
          ],
          label: p.label,
          labelLocked: true,
          origin: "manual",
          kind: "key",
        });
      }

      // Enter blank mode with the layout's centroid bounding box as the canvas size.
      blankMode = true;
      if (imgUrl) {
        URL.revokeObjectURL(imgUrl);
        imgUrl = "";
      }
      blobs = newBlobs;
      selectedBlobId = null;
      detectedThreshold = null;
      maskImageData = null;
      overlayMaskImageData = null;
      cachedMask = null;
      cachedMaskWidth = 0;
      cachedMaskHeight = 0;
      detectionStats = null;
      detectedMissing = [];
      detectedKbAngle = null;
      detectedRightKbAngle = null;
      detectedLayout = null;
      lastSmartAddNote = "";
      addClicks = [];
      imgWidth = canvasW;
      imgHeight = canvasH;
      void anchorRx;
      void anchorRy;
      layoutName = name;
      mode = "select";
      // Force a re-classify so the cluster knows about these labelled
      // manual blobs and snap/missing-detection work on them.
      classifyDetected(blobs);
      postClassify(blobs);
      blobs = [...blobs];
      redraw();
    } catch (err) {
      console.error("[trace] load saved layout failed", err);
    }
  }
  let saveBadgeTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Name to use when saving the layout. Defaults to a timestamped slug —
   * the user can edit it before clicking Save / Download. Kept short and
   * snake-case so it doubles as a filename without escaping.
   */
  let layoutName = $state("");
  /** True when the current `layoutName` matches an existing saved layout —
   *  used to label the Save button as "Update" so the user knows whether
   *  they're creating a new entry or overwriting one. */
  const isUpdateSave = $derived(
    layoutName.trim().length > 0 && savedLayoutNames.includes(layoutName.trim()),
  );

  // ---------- File handling ----------
  function handleFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (imgUrl) URL.revokeObjectURL(imgUrl);
    imgUrl = URL.createObjectURL(file);
    // Loading a photo overrides blank-canvas mode.
    blankMode = false;
    // Full reset — same set as resetAll, since a new photo invalidates
    // every derived piece of state.
    blobs = [];
    selectedBlobId = null;
    detectedThreshold = null;
    maskImageData = null;
    overlayMaskImageData = null;
    addClicks = [];
    mode = "select";
    detectionStats = null;
    detectedMissing = [];
    detectedKbAngle = null;
    detectedRightKbAngle = null;
    detectedLayout = null;
    lastSmartAddNote = "";
    cachedMask = null;
    cachedMaskWidth = 0;
    cachedMaskHeight = 0;
  }

  function onImageLoad() {
    if (!imgEl || !canvasEl) return;
    imgWidth = imgEl.naturalWidth;
    imgHeight = imgEl.naturalHeight;
    canvasEl.width = imgWidth;
    canvasEl.height = imgHeight;
    // Explicitly trigger detection — the realtime effect tracks imgWidth,
    // but if the new image has the same dimensions as the previous one
    // ($state equality kicks in for primitives) the effect doesn't re-fire.
    // Calling autoDetect here makes new-image-load deterministic.
    autoDetect();
  }

  // ---------- Drawing ----------
  function redraw() {
    if (!canvasEl) return;
    // Allow redraw without imgEl when the user is in blank-canvas mode
    // (no photo, just placing keys directly).
    if (!imgEl && !blankMode) return;
    const ctx = canvasEl.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    if (maskMode === "replace" && maskImageData) {
      // Pure mask — useful for fine-tuning thresholds without photo bias.
      ctx.putImageData(maskImageData, 0, 0);
    } else if (!imgEl && blankMode) {
      // Blank-canvas background — dark slate so coloured outlines pop.
      ctx.fillStyle = "#1c1916";
      ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
    } else if (imgEl) {
      ctx.drawImage(imgEl, 0, 0);
      if (maskMode === "overlay" && overlayMaskImageData) {
        // Paint the colored alpha mask on top of the photo so both layers are
        // visible. `putImageData` bypasses globalAlpha, so we stage the mask
        // on an offscreen canvas and draw THAT via drawImage to blend.
        const off = document.createElement("canvas");
        off.width = overlayMaskImageData.width;
        off.height = overlayMaskImageData.height;
        const offCtx = off.getContext("2d");
        if (offCtx) {
          offCtx.putImageData(overlayMaskImageData, 0, 0);
          ctx.save();
          ctx.globalAlpha = maskOpacity;
          ctx.drawImage(off, 0, 0);
          ctx.restore();
        }
      }
    }

    for (const blob of blobs) {
      const isSelected = blob.id === selectedBlobId;
      const labeled = !!blob.label;
      // Colors: selected red, labelled green, trackpad cyan, outlier dim grey,
      // manual purple, regular auto-detect blue.
      ctx.strokeStyle = isSelected
        ? "#ef4444"
        : labeled
          ? "#22c55e"
          : blob.kind === "trackpad"
            ? "#06b6d4"
            : blob.kind === "outlier"
              ? "#9ca3af"
              : blob.origin === "manual"
                ? "#a855f7"
                : "#3b82f6";
      ctx.lineWidth = isSelected ? 5 : blob.kind === "outlier" ? 1.5 : 3;
      if (blob.kind === "outlier") {
        ctx.setLineDash([4, 4]);
      } else {
        ctx.setLineDash([]);
      }
      ctx.beginPath();
      ctx.moveTo(blob.corners[0].x, blob.corners[0].y);
      for (let i = 1; i < 4; i++) ctx.lineTo(blob.corners[i].x, blob.corners[i].y);
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.arc(blob.centroid.x, blob.centroid.y, 5, 0, Math.PI * 2);
      ctx.fill();

      if (blob.label) {
        ctx.font = "bold 22px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = 5;
        ctx.strokeStyle = "black";
        ctx.fillStyle = "white";
        ctx.strokeText(blob.label, blob.centroid.x, blob.centroid.y - 18);
        ctx.fillText(blob.label, blob.centroid.x, blob.centroid.y - 18);
      }

      // Corner handles when selected
      if (isSelected) {
        ctx.setLineDash([]);
        for (let i = 0; i < 4; i++) {
          const c = blob.corners[i];
          ctx.fillStyle = "#facc15";
          ctx.strokeStyle = "black";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.rect(c.x - 8, c.y - 8, 16, 16);
          ctx.fill();
          ctx.stroke();
        }
      }
    }

    // Predicted-missing slots: dashed orange ghost outlines so the user
    // can see where the detector THINKS a key should be but couldn't find
    // one. Tapping "Fill missing" runs smartAdd on each predicted point.
    if (detectedMissing.length > 0) {
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = "#f97316";
      ctx.lineWidth = 2;
      ctx.font = "bold 13px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const m of detectedMissing) {
        ctx.beginPath();
        ctx.moveTo(m.corners[0].x, m.corners[0].y);
        for (let i = 1; i < 4; i++) ctx.lineTo(m.corners[i].x, m.corners[i].y);
        ctx.closePath();
        ctx.stroke();
        // Label badge inside the ghost
        ctx.fillStyle = "rgba(249, 115, 22, 0.85)";
        ctx.fillRect(m.centroid.x - 22, m.centroid.y - 9, 44, 18);
        ctx.fillStyle = "white";
        ctx.fillText(`? ${m.label}`, m.centroid.x, m.centroid.y);
      }
      ctx.setLineDash([]);
    }

    // In-progress manual add
    for (let i = 0; i < addClicks.length; i++) {
      const p = addClicks[i];
      ctx.fillStyle = "#a855f7";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "white";
      ctx.font = "bold 16px monospace";
      ctx.textAlign = "left";
      ctx.fillText(String(i + 1), p.x + 12, p.y - 8);
    }
    if (addClicks.length > 1) {
      ctx.strokeStyle = "#a855f7";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(addClicks[0].x, addClicks[0].y);
      for (let i = 1; i < addClicks.length; i++) {
        ctx.lineTo(addClicks[i].x, addClicks[i].y);
      }
      if (addClicks.length === 4) ctx.closePath();
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // ---------- Image preprocessing ----------
  function buildGrayscale(imgData: ImageData) {
    const { data, width, height } = imgData;
    const gray = new Uint8ClampedArray(width * height);
    for (let i = 0; i < width * height; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      gray[i] = (0.299 * r + 0.587 * g + 0.114 * b) | 0;
    }
    return gray;
  }

  function gaussianKernel1D(sigma: number) {
    if (sigma <= 0) return new Float32Array([1]);
    const radius = Math.max(1, Math.ceil(sigma * 3));
    const size = radius * 2 + 1;
    const kernel = new Float32Array(size);
    let sum = 0;
    for (let i = -radius; i <= radius; i++) {
      const v = Math.exp(-(i * i) / (2 * sigma * sigma));
      kernel[i + radius] = v;
      sum += v;
    }
    for (let i = 0; i < size; i++) kernel[i] /= sum;
    return kernel;
  }

  function gaussianBlur(gray: Uint8ClampedArray, width: number, height: number, sigma: number) {
    if (sigma <= 0) return gray;
    const kernel = gaussianKernel1D(sigma);
    const radius = (kernel.length - 1) >> 1;
    const tmp = new Float32Array(width * height);
    // Horizontal pass
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let acc = 0;
        for (let k = -radius; k <= radius; k++) {
          const xx = Math.min(width - 1, Math.max(0, x + k));
          acc += gray[y * width + xx] * kernel[k + radius];
        }
        tmp[y * width + x] = acc;
      }
    }
    // Vertical pass
    const out = new Uint8ClampedArray(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let acc = 0;
        for (let k = -radius; k <= radius; k++) {
          const yy = Math.min(height - 1, Math.max(0, y + k));
          acc += tmp[yy * width + x] * kernel[k + radius];
        }
        out[y * width + x] = acc | 0;
      }
    }
    return out;
  }

  function otsuThreshold(gray: Uint8ClampedArray) {
    const hist = Array.from({ length: 256 }, () => 0);
    const total = gray.length;
    for (let i = 0; i < total; i++) hist[gray[i]]++;
    let sumAll = 0;
    for (let i = 0; i < 256; i++) sumAll += i * hist[i];
    let sumB = 0;
    let wB = 0;
    let maxVar = 0;
    let threshold = 128;
    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (wB === 0) continue;
      const wF = total - wB;
      if (wF === 0) break;
      sumB += t * hist[t];
      const mB = sumB / wB;
      const mF = (sumAll - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > maxVar) {
        maxVar = between;
        threshold = t;
      }
    }
    return threshold;
  }

  /**
   * Score a candidate threshold by counting how many connected components
   * fall inside the "looks like a key" envelope: area in [minArea, maxArea]
   * AND aspect ratio ≥ 0.55. Uses iterative-deepening flood fill with a
   * shared visited buffer for speed (called many times in a sweep).
   */
  function countKeyLikeComponents(
    gray: Uint8ClampedArray,
    width: number,
    height: number,
    threshold: number,
    invert: boolean,
    minArea: number,
    maxArea: number,
  ): number {
    const n = width * height;
    const visited = new Uint8Array(n);
    const stack = new Int32Array(n);
    let count = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (visited[idx]) continue;
        const above = gray[idx] >= threshold;
        const fg = above !== invert;
        if (!fg) {
          visited[idx] = 1;
          continue;
        }
        let sp = 0;
        stack[sp++] = idx;
        visited[idx] = 1;
        let area = 0;
        let minX = x;
        let maxX = x;
        let minY = y;
        let maxY = y;
        while (sp > 0) {
          const j = stack[--sp];
          area++;
          const jx = j % width;
          const jy = (j - jx) / width;
          if (jx < minX) minX = jx;
          if (jx > maxX) maxX = jx;
          if (jy < minY) minY = jy;
          if (jy > maxY) maxY = jy;
          if (jx > 0) {
            const k = j - 1;
            if (!visited[k]) {
              const a = gray[k] >= threshold;
              if (a !== invert) {
                visited[k] = 1;
                stack[sp++] = k;
              }
            }
          }
          if (jx + 1 < width) {
            const k = j + 1;
            if (!visited[k]) {
              const a = gray[k] >= threshold;
              if (a !== invert) {
                visited[k] = 1;
                stack[sp++] = k;
              }
            }
          }
          if (jy > 0) {
            const k = j - width;
            if (!visited[k]) {
              const a = gray[k] >= threshold;
              if (a !== invert) {
                visited[k] = 1;
                stack[sp++] = k;
              }
            }
          }
          if (jy + 1 < height) {
            const k = j + width;
            if (!visited[k]) {
              const a = gray[k] >= threshold;
              if (a !== invert) {
                visited[k] = 1;
                stack[sp++] = k;
              }
            }
          }
        }
        if (area < minArea || area > maxArea) continue;
        const w = maxX - minX + 1;
        const h = maxY - minY + 1;
        const aspect = Math.min(w, h) / Math.max(w, h);
        if (aspect < 0.55) continue;
        count++;
      }
    }
    return count;
  }

  /**
   * Smart OTSU: classic OTSU often picks a threshold halfway up the
   * histogram, which works for clean shots but fails when the photo
   * background is also bright (a striped desk, a paper backdrop, etc.).
   *
   * Strategy: start with plain OTSU, then sweep additional thresholds at
   * 15-unit intervals from 60 to 240. For each candidate, do a single
   * pass of flood fill that counts components in the "key-like" envelope
   * (size in [minArea, maxArea], aspect ≥ 0.55). The threshold with the
   * most matching components wins.
   *
   * Cost: ~13 image-passes plus the initial OTSU; runs in well under
   * 200ms on a 748×340 photo. Only invoked when threshold mode is OTSU,
   * so manual / adaptive modes still use the user's exact values.
   */
  function smartOtsuThreshold(
    gray: Uint8ClampedArray,
    width: number,
    height: number,
    invert: boolean,
    minA: number,
    maxA: number,
  ): number {
    const otsuT = otsuThreshold(gray);
    let bestT = otsuT;
    let bestScore = countKeyLikeComponents(gray, width, height, otsuT, invert, minA, maxA);
    for (let t = 60; t <= 240; t += 15) {
      if (Math.abs(t - otsuT) < 8) continue; // skip the classic OTSU we already scored
      const score = countKeyLikeComponents(gray, width, height, t, invert, minA, maxA);
      if (score > bestScore) {
        bestScore = score;
        bestT = t;
      }
    }
    // Fine sweep ±10 around the winner (step 5).
    const coarseBest = bestT;
    for (let t = coarseBest - 10; t <= coarseBest + 10; t += 5) {
      if (t < 20 || t > 245 || t === coarseBest) continue;
      const score = countKeyLikeComponents(gray, width, height, t, invert, minA, maxA);
      if (score > bestScore) {
        bestScore = score;
        bestT = t;
      }
    }
    return bestT;
  }

  /**
   * Adaptive (local) threshold: each pixel is compared against the mean of a
   * `window × window` neighbourhood, minus `bias`. Built from a summed-area
   * table so the per-pixel mean is O(1). This handles uneven lighting (e.g.
   * one side of the photo brighter than the other) much better than a single
   * global threshold and is the highest-leverage knob for "get more keys".
   */
  function adaptiveLocalThreshold(
    gray: Uint8ClampedArray,
    width: number,
    height: number,
    window: number,
    bias: number,
    invert: boolean,
  ) {
    // Build summed-area table (integer overflow safe up to ~16M·255 px).
    const sat = new Float64Array((width + 1) * (height + 1));
    const rowStride = width + 1;
    for (let y = 0; y < height; y++) {
      let rowSum = 0;
      for (let x = 0; x < width; x++) {
        rowSum += gray[y * width + x];
        sat[(y + 1) * rowStride + (x + 1)] = sat[y * rowStride + (x + 1)] + rowSum;
      }
    }
    const half = Math.max(1, window >> 1);
    const mask = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      const y0 = Math.max(0, y - half);
      const y1 = Math.min(height - 1, y + half);
      for (let x = 0; x < width; x++) {
        const x0 = Math.max(0, x - half);
        const x1 = Math.min(width - 1, x + half);
        const area = (x1 - x0 + 1) * (y1 - y0 + 1);
        const sum =
          sat[(y1 + 1) * rowStride + (x1 + 1)] -
          sat[y0 * rowStride + (x1 + 1)] -
          sat[(y1 + 1) * rowStride + x0] +
          sat[y0 * rowStride + x0];
        const mean = sum / area;
        const above = gray[y * width + x] >= mean - bias;
        mask[y * width + x] = above !== invert ? 1 : 0;
      }
    }
    return mask;
  }

  function dilate(mask: Uint8Array, width: number, height: number, radius: number) {
    if (radius <= 0) return mask;
    const out = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      const yMin = Math.max(0, y - radius);
      const yMax = Math.min(height - 1, y + radius);
      for (let x = 0; x < width; x++) {
        const xMin = Math.max(0, x - radius);
        const xMax = Math.min(width - 1, x + radius);
        let any = 0;
        outer: for (let yy = yMin; yy <= yMax; yy++) {
          for (let xx = xMin; xx <= xMax; xx++) {
            if (mask[yy * width + xx]) {
              any = 1;
              break outer;
            }
          }
        }
        out[y * width + x] = any;
      }
    }
    return out;
  }

  function erode(mask: Uint8Array, width: number, height: number, radius: number) {
    if (radius <= 0) return mask;
    const out = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      const yMin = Math.max(0, y - radius);
      const yMax = Math.min(height - 1, y + radius);
      for (let x = 0; x < width; x++) {
        const xMin = Math.max(0, x - radius);
        const xMax = Math.min(width - 1, x + radius);
        let all = 1;
        outer: for (let yy = yMin; yy <= yMax; yy++) {
          for (let xx = xMin; xx <= xMax; xx++) {
            if (!mask[yy * width + xx]) {
              all = 0;
              break outer;
            }
          }
        }
        out[y * width + x] = all;
      }
    }
    return out;
  }

  // ---------- Trackpad detection ----------
  /**
   * Scan dark regions of the photo for circular blobs sized like trackpads.
   *
   * The keys-as-foreground pipeline puts the trackpad in the BACKGROUND
   * mask (a trackpad surface is usually dark / black). To find it we
   * threshold for dark pixels (gray < `darkCutoff`), morph-close to close
   * tiny gaps, flood-fill connected components, and keep blobs that are:
   *   - In the size range `[1.2× medianKeyArea, 8× medianKeyArea]`
   *     (a trackpad is bigger than one key but not as big as the case)
   *   - Circularity ≥ 0.7 (round, not a slab-shaped PCB cutout)
   *   - Not touching the image edge (rules out background outside the kb)
   *
   * Returns blobs already classified as `kind: "trackpad"` so the existing
   * classifier doesn't second-guess them.
   */
  function detectTrackpads(
    blurred: Uint8ClampedArray,
    width: number,
    height: number,
    medianKeyArea: number,
    darkCutoff: number,
    startId: number,
  ): { trackpads: KeyShape[]; nextId: number } {
    if (medianKeyArea <= 0) return { trackpads: [], nextId: startId };
    const minTrackpadArea = medianKeyArea * 1.2;
    const maxTrackpadArea = medianKeyArea * 8.0;
    const darkMask = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
      darkMask[i] = blurred[i] < darkCutoff ? 1 : 0;
    }
    // Small close to fill mounting screws / glare specks inside the pad.
    const dilated = dilate(darkMask, width, height, 1);
    const filledHoles = erode(dilated, width, height, 1);
    // Morph OPEN with radius ≈ medianKeySide/4 breaks narrow connections.
    // The user's trackpad usually meets the case along a thin (1-3px) edge
    // where the PCB cutout starts; opening that wide enough severs the
    // trackpad's circular blob from the much larger case-and-bezel blob
    // without eating away the trackpad itself.
    const medianSide = Math.sqrt(medianKeyArea);
    const openR = Math.max(2, Math.round(medianSide / 4));
    const eroded = erode(filledHoles, width, height, openR);
    const closed = dilate(eroded, width, height, openR);

    const labels = new Int32Array(width * height);
    const stack = new Int32Array(width * height);
    const trackpads: KeyShape[] = [];
    let currentId = startId;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const seedIdx = y * width + x;
        if (!closed[seedIdx] || labels[seedIdx]) continue;
        let sp = 0;
        stack[sp++] = seedIdx;
        labels[seedIdx] = currentId;
        let area = 0;
        let sumX = 0;
        let sumY = 0;
        let perimeter = 0;
        let touchesEdge = false;
        const points: Array<[number, number]> = [];
        while (sp > 0) {
          const j = stack[--sp];
          area++;
          const jx = j % width;
          const jy = (j - jx) / width;
          sumX += jx;
          sumY += jy;
          points.push([jx, jy]);
          if (jx === 0 || jx === width - 1 || jy === 0 || jy === height - 1) {
            touchesEdge = true;
          }
          let boundary = false;
          if (jx > 0) {
            const k = j - 1;
            if (closed[k]) {
              if (!labels[k]) {
                labels[k] = currentId;
                stack[sp++] = k;
              }
            } else boundary = true;
          } else boundary = true;
          if (jx + 1 < width) {
            const k = j + 1;
            if (closed[k]) {
              if (!labels[k]) {
                labels[k] = currentId;
                stack[sp++] = k;
              }
            } else boundary = true;
          } else boundary = true;
          if (jy > 0) {
            const k = j - width;
            if (closed[k]) {
              if (!labels[k]) {
                labels[k] = currentId;
                stack[sp++] = k;
              }
            } else boundary = true;
          } else boundary = true;
          if (jy + 1 < height) {
            const k = j + width;
            if (closed[k]) {
              if (!labels[k]) {
                labels[k] = currentId;
                stack[sp++] = k;
              }
            } else boundary = true;
          } else boundary = true;
          if (boundary) perimeter++;
        }
        currentId++;
        if (touchesEdge) continue;
        if (area < minTrackpadArea || area > maxTrackpadArea) continue;
        const circularity = perimeter > 0 ? (4 * Math.PI * area) / (perimeter * perimeter) : 0;
        if (circularity < 0.7) continue;
        // Pixel centroid is biased when morph-open cut the trackpad's edge
        // asymmetrically (one side of the trackpad got eaten into the case
        // bridge and didn't fully restore on dilate). The bounding box's
        // GEOMETRIC center is the right marker for a circular shape: it's
        // the center of the smallest axis-aligned-in-rotated-frame rect
        // that contains every detected pixel.
        const pixelCx = sumX / area;
        const pixelCy = sumY / area;
        const { angle, bounds } = fitRotatedRectangle(points, pixelCx, pixelCy);
        const sideU = bounds.maxU - bounds.minU;
        const sideV = bounds.maxV - bounds.minV;
        // Center in the rotated frame, then transform back to image frame.
        const bboxCxRot = (bounds.minU + bounds.maxU) / 2;
        const bboxCyRot = (bounds.minV + bounds.maxV) / 2;
        const rad = (angle * Math.PI) / 180;
        const cosA = Math.cos(rad);
        const sinA = Math.sin(rad);
        const cx = pixelCx + bboxCxRot * cosA - bboxCyRot * sinA;
        const cy = pixelCy + bboxCxRot * sinA + bboxCyRot * cosA;
        // Re-derive corners around the geometric center (zero-mean bounds).
        const halfU = sideU / 2;
        const halfV = sideV / 2;
        const corners = cornersFromRect(cx, cy, angle, {
          minU: -halfU,
          maxU: halfU,
          minV: -halfV,
          maxV: halfV,
        });
        trackpads.push({
          id: currentId,
          pixelCount: area,
          perimeter,
          circularity,
          centroid: { x: cx, y: cy },
          rotationDeg: angle,
          sideLengthPx: (sideU + sideV) / 2,
          corners,
          origin: "auto",
          kind: "trackpad",
        });
      }
    }
    return { trackpads, nextId: currentId };
  }

  // ---------- Minimum bounding rectangle ----------
  function fitRotatedRectangle(points: Array<[number, number]>, cx: number, cy: number) {
    let bestArea = Infinity;
    let bestAngle = 0;
    let bestBounds = { minU: 0, maxU: 0, minV: 0, maxV: 0 };
    const tryAngle = (deg: number) => {
      const t = (deg * Math.PI) / 180;
      const cos = Math.cos(t);
      const sin = Math.sin(t);
      let minU = Infinity;
      let maxU = -Infinity;
      let minV = Infinity;
      let maxV = -Infinity;
      for (let i = 0; i < points.length; i++) {
        const dx = points[i][0] - cx;
        const dy = points[i][1] - cy;
        const u = dx * cos + dy * sin;
        const v = -dx * sin + dy * cos;
        if (u < minU) minU = u;
        if (u > maxU) maxU = u;
        if (v < minV) minV = v;
        if (v > maxV) maxV = v;
      }
      const area = (maxU - minU) * (maxV - minV);
      if (area < bestArea) {
        bestArea = area;
        bestAngle = deg;
        bestBounds = { minU, maxU, minV, maxV };
      }
    };
    for (let d = -45; d <= 45; d += 3) tryAngle(d);
    const coarseBest = bestAngle;
    for (let d = coarseBest - 3; d <= coarseBest + 3; d += 0.25) tryAngle(d);
    return { angle: bestAngle, bounds: bestBounds };
  }

  function cornersFromRect(
    cx: number,
    cy: number,
    angle: number,
    bounds: { minU: number; maxU: number; minV: number; maxV: number },
  ): [Point, Point, Point, Point] {
    const t = (angle * Math.PI) / 180;
    const cos = Math.cos(t);
    const sin = Math.sin(t);
    const cornersUV: Array<[number, number]> = [
      [bounds.minU, bounds.minV],
      [bounds.maxU, bounds.minV],
      [bounds.maxU, bounds.maxV],
      [bounds.minU, bounds.maxV],
    ];
    return cornersUV.map(([u, v]) => ({
      x: cx + u * cos - v * sin,
      y: cy + u * sin + v * cos,
    })) as [Point, Point, Point, Point];
  }

  // ---------- Classification ----------
  /**
   * Tags each detected blob as "key", "trackpad", or "outlier". Trackpads
   * are large circular blobs (the Dilemma's trackball, for example). Outliers
   * are blobs that fail at least one of:
   *  - Size: outside [Q1 − k·IQR, Q3 + k·IQR] of the side-length distribution.
   *  - Containment: bounding box entirely inside another blob's bounding box
   *    (duplicate detections / nested PCB features get dropped).
   *  - Isolation: no neighbour within `isolationFactor` × median key spacing.
   *    Real keys always cluster; a lone blob far from everything else is
   *    almost always noise. (Single-thumb cluster boards are still allowed
   *    because the thumb stays within 2.8× of the main-grid spacing.)
   */
  function classifyDetected(
    blobs: KeyShape[],
    rejected: RejectionCounts = { tooSmall: 0, tooLarge: 0, badAspect: 0 },
  ) {
    if (blobs.length === 0) {
      detectionStats = {
        detected: 0,
        keys: 0,
        trackpads: 0,
        outliers: 0,
        medianSidePx: 0,
        medianSpacingPx: 0,
        rejected,
      };
      return;
    }
    // Sort sides for IQR
    const sides = blobs.map((b) => b.sideLengthPx).sort((a, b) => a - b);
    const q = (p: number) => {
      const i = (sides.length - 1) * p;
      const lo = Math.floor(i);
      const hi = Math.ceil(i);
      return sides[lo] + (sides[hi] - sides[lo]) * (i - lo);
    };
    const median = q(0.5);
    const q1 = q(0.25);
    const q3 = q(0.75);
    const iqr = q3 - q1;
    const lowerBound = q1 - outlierSizeIQRFactor * iqr;
    const upperBound = q3 + outlierSizeIQRFactor * iqr;

    // Bounding boxes for containment test
    const bboxes = blobs.map((b) => {
      const xs = b.corners.map((c) => c.x);
      const ys = b.corners.map((c) => c.y);
      return {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minY: Math.min(...ys),
        maxY: Math.max(...ys),
        area: b.pixelCount,
      };
    });

    // First pass: per-blob trackpad / size flags
    for (const blob of blobs) {
      if (blob.kind !== "key") continue; // already classified (trackpad/outlier)
      if (blob.origin === "manual") continue; // user-placed: don't second-guess
      const isBigCircle =
        blob.circularity >= trackpadCircularity &&
        blob.sideLengthPx >= median * trackpadAreaFactor;
      // Catch round-but-not-quite-big trackpads too. A very high circularity
      // (≥ 0.85) with size ≥ 1.3× median key is almost certainly a trackpad
      // even if it doesn't pass the larger threshold — keys never come out
      // that close to a perfect circle.
      const isVeryRoundMediumBlob =
        blob.circularity >= 0.85 && blob.sideLengthPx >= median * 1.3;
      if (isBigCircle || isVeryRoundMediumBlob) {
        blob.kind = "trackpad";
        continue;
      }
      if (blob.sideLengthPx < lowerBound || blob.sideLengthPx > upperBound) {
        blob.kind = "outlier";
        blob.outlierReason = `size ${blob.sideLengthPx.toFixed(0)}px outside [${lowerBound.toFixed(0)}, ${upperBound.toFixed(0)}]`;
      }
    }

    // Second pass: drop nested blobs (a contained bbox is almost always a duplicate)
    for (let i = 0; i < blobs.length; i++) {
      if (blobs[i].kind !== "key") continue;
      for (let j = 0; j < blobs.length; j++) {
        if (i === j) continue;
        if (blobs[j].kind === "outlier") continue;
        const A = bboxes[i];
        const B = bboxes[j];
        if (A.minX >= B.minX && A.maxX <= B.maxX && A.minY >= B.minY && A.maxY <= B.maxY && A.area < B.area * 0.95) {
          blobs[i].kind = "outlier";
          blobs[i].outlierReason = `nested inside #${blobs[j].id}`;
          break;
        }
      }
    }

    // Pre-isolation pass: a blob whose centroid sits close to a "key" or
    // "trackpad" blob's centroid is almost certainly a duplicate detection
    // (often a rim sliver around a key, or the centre dot inside the
    // trackpad). Flag it as outlier with a clear reason BEFORE the
    // isolation check — otherwise an "isolated duplicate" might keep its
    // key kind and confuse the user.
    for (let i = 0; i < blobs.length; i++) {
      const a = blobs[i];
      if (a.kind !== "key") continue;
      if (a.origin === "manual") continue;
      const closeRadius = a.sideLengthPx * 0.55;
      for (let j = 0; j < blobs.length; j++) {
        if (i === j) continue;
        const b = blobs[j];
        if (b.kind !== "key" && b.kind !== "trackpad") continue;
        if (b.pixelCount < a.pixelCount * 1.05) continue; // only "absorb" into a clearly-larger blob
        const dx = a.centroid.x - b.centroid.x;
        const dy = a.centroid.y - b.centroid.y;
        if (dx * dx + dy * dy <= closeRadius * closeRadius) {
          a.kind = "outlier";
          a.outlierReason = `duplicate of #${b.id} (${b.kind})`;
          break;
        }
      }
    }

    // Third pass: median nearest-neighbour spacing → flag isolated keys
    const keysOnly = blobs.filter((b) => b.kind === "key");
    const nearestDist: number[] = [];
    for (const a of keysOnly) {
      let nearest = Infinity;
      for (const b of keysOnly) {
        if (a === b) continue;
        const d = Math.hypot(a.centroid.x - b.centroid.x, a.centroid.y - b.centroid.y);
        if (d < nearest) nearest = d;
      }
      nearestDist.push(nearest);
    }
    nearestDist.sort((a, b) => a - b);
    const medSpacing =
      nearestDist.length > 0
        ? nearestDist[Math.floor(nearestDist.length / 2)]
        : median;
    let idx = 0;
    for (const blob of keysOnly) {
      const dist = nearestDist[idx++];
      if (dist > medSpacing * isolationFactor && nearestDist.length > 4) {
        blob.kind = "outlier";
        blob.outlierReason = `isolated (nearest ${dist.toFixed(0)}px > ${(medSpacing * isolationFactor).toFixed(0)}px)`;
      }
    }

    const keys = blobs.filter((b) => b.kind === "key").length;
    const trackpads = blobs.filter((b) => b.kind === "trackpad").length;
    const outliers = blobs.filter((b) => b.kind === "outlier").length;
    detectionStats = {
      detected: blobs.length,
      keys,
      trackpads,
      outliers,
      medianSidePx: median,
      medianSpacingPx: medSpacing,
      rejected,
    };
  }

  /**
   * For each predicted missing slot, run smartAdd at its centroid (flood
   * fills the cached mask to find the real key bounds) and lock the
   * predicted label so the next auto-label pass doesn't reshuffle it.
   * Falls back to a fixed-size square at the predicted position if the
   * flood can't isolate a key (smartAdd handles that internally).
   */
  function fillMissingSlots() {
    if (detectedMissing.length === 0) return;
    // We DON'T call smartAdd here — its flood-fill can snap the new blob
    // away from the predicted slot (latching onto a stray bright pixel
    // or returning the fallback square at the click point if the slot is
    // on background). Either way the new blob ends up in a different
    // cluster column than the slot it was meant to fill, so missing
    // detection still flags the same column.
    //
    // Instead, place the blob at the slot's predicted centroid using the
    // slot's predicted side / rotation / corners. The slot's geometry
    // came from the column's median values, so the new key inherits the
    // exact alignment the rest of the column already has.
    const slots = [...detectedMissing];
    const newBlobs: KeyShape[] = [];
    for (const slot of slots) {
      newBlobs.push({
        id: nextId++,
        pixelCount: 0,
        perimeter: 0,
        circularity: 0.785,
        centroid: slot.centroid,
        rotationDeg: slot.rotationDeg,
        sideLengthPx: slot.sideLengthPx,
        corners: slot.corners,
        label: slot.label,
        labelLocked: true,
        origin: "manual",
        kind: "key",
      });
    }
    blobs = [...blobs, ...newBlobs];
    classifyDetected(blobs);
    postClassify(blobs);
    blobs = [...blobs];
    selectedBlobId = null;
    redraw();
  }

  function dropOutliers() {
    blobs = blobs.filter((b) => b.kind !== "outlier");
    if (selectedBlobId !== null && !blobs.some((b) => b.id === selectedBlobId)) {
      selectedBlobId = null;
    }
    redraw();
  }

  // ---------- Geometry helpers ----------
  function pointInPolygon(p: Point, polygon: readonly Point[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x;
      const yi = polygon[i].y;
      const xj = polygon[j].x;
      const yj = polygon[j].y;
      const intersect =
        yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // ---------- Layout-aware clustering ----------
  type ColumnCluster = {
    /** blob.id → column index (0 = leftmost column in the keyboard's frame). */
    colIdx: Map<number, number>;
    /** Median rotation of all non-manual key blobs, in degrees. */
    kbAngle: number;
    /** Centroid of all non-manual key centroids — used as the rotation pivot. */
    kbCenter: Point;
  };

  /**
   * Project a point into the keyboard's local frame. Subtracts the keyboard
   * centroid then rotates by `-kbAngle` so the keyboard's columns become
   * axis-aligned vertical lines. Returns image-frame coords back into local
   * coords; callers can use the inverse with `toImageFrame` below.
   */
  function toKeyboardFrame(p: Point, kbAngle: number, kbCenter: Point): Point {
    const t = (-kbAngle * Math.PI) / 180;
    const cos = Math.cos(t);
    const sin = Math.sin(t);
    const dx = p.x - kbCenter.x;
    const dy = p.y - kbCenter.y;
    return { x: cos * dx - sin * dy, y: sin * dx + cos * dy };
  }

  function toImageFrame(p: Point, kbAngle: number, kbCenter: Point): Point {
    const t = (kbAngle * Math.PI) / 180;
    const cos = Math.cos(t);
    const sin = Math.sin(t);
    return {
      x: kbCenter.x + cos * p.x - sin * p.y,
      y: kbCenter.y + sin * p.x + cos * p.y,
    };
  }

  /**
   * Cluster the "key" kind blobs into `colCount` columns using 1D k-means on
   * the keyboard's LOCAL x-coordinate. Split keyboards are typically photo-
   * graphed with the half tilted out (Bastardkb halves run ~15°), so raw
   * image-x crosses column boundaries — clustering on rotated x correctly
   * assigns each key to its real column.
   *
   * Strategy:
   *   1. Take median rotation of all non-manual keys → `kbAngle` (robust
   *      against per-column splay outliers).
   *   2. Take mean centroid → `kbCenter` (the pivot point).
   *   3. Project every centroid into the keyboard frame and cluster on
   *      the projected x with k-means.
   *
   * Manual blobs are excluded — they're typically thumbs or extras that
   * would distort kbAngle, kbCenter, and the cluster centers.
   */
  function clusterIntoColumns(allBlobs: KeyShape[], cols: number): ColumnCluster {
    const colIdx = new Map<number, number>();
    // Include manual blobs that have a locked grid label — these came from
    // the "Fill missing" workflow and represent real grid slots the user
    // accepted. Plain manual blobs (no label / thumb labels) are excluded
    // since they'd distort the kbAngle and cluster centers.
    const keys = allBlobs.filter(
      (b) =>
        b.kind === "key" &&
        (b.origin !== "manual" ||
          (b.labelLocked === true && b.label !== undefined && /^\d+,\d+$/.test(b.label))),
    );
    if (cols < 1 || keys.length === 0) {
      return { colIdx, kbAngle: 0, kbCenter: { x: 0, y: 0 } };
    }
    // Robust kb angle: median of per-key rotations.
    const rotsAll = keys.map((k) => k.rotationDeg).sort((a, b) => a - b);
    const kbAngle = rotsAll[Math.floor(rotsAll.length / 2)];
    // kb center: mean centroid.
    let Cx = 0;
    let Cy = 0;
    for (const k of keys) {
      Cx += k.centroid.x;
      Cy += k.centroid.y;
    }
    Cx /= keys.length;
    Cy /= keys.length;
    const kbCenter: Point = { x: Cx, y: Cy };

    // Compute local-x for every key once.
    const localX = new Map<number, number>();
    for (const k of keys) {
      localX.set(k.id, toKeyboardFrame(k.centroid, kbAngle, kbCenter).x);
    }

    if (keys.length <= cols) {
      const sorted = [...keys].sort(
        (a, b) => (localX.get(a.id) ?? 0) - (localX.get(b.id) ?? 0),
      );
      for (let i = 0; i < sorted.length; i++) colIdx.set(sorted[i].id, i);
      return { colIdx, kbAngle, kbCenter };
    }

    const xs = [...localX.values()];
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const range = Math.max(1, xMax - xMin);
    const step = range / Math.max(1, cols - 1);
    for (const k of keys) {
      const lx = localX.get(k.id) ?? 0;
      const idx = Math.round((lx - xMin) / step);
      colIdx.set(k.id, Math.max(0, Math.min(cols - 1, idx)));
    }
    for (let iter = 0; iter < 6; iter++) {
      const sums = Array.from({ length: cols }, () => 0);
      const counts = Array.from({ length: cols }, () => 0);
      for (const k of keys) {
        const c = colIdx.get(k.id) ?? 0;
        sums[c] += localX.get(k.id) ?? 0;
        counts[c]++;
      }
      const centers: number[] = [];
      for (let c = 0; c < cols; c++) {
        centers[c] = counts[c] > 0 ? sums[c] / counts[c] : xMin + c * step;
      }
      let changed = false;
      for (const k of keys) {
        const lx = localX.get(k.id) ?? 0;
        let best = 0;
        let bestD = Infinity;
        for (let c = 0; c < cols; c++) {
          const d = Math.abs(lx - centers[c]);
          if (d < bestD) {
            bestD = d;
            best = c;
          }
        }
        if (colIdx.get(k.id) !== best) {
          colIdx.set(k.id, best);
          changed = true;
        }
      }
      if (!changed) break;
    }
    return { colIdx, kbAngle, kbCenter };
  }

  /**
   * For each column with ≥2 keys: fit a line `local_x = a·local_y + b` in
   * the keyboard's LOCAL frame, then snap every key in that column to:
   *   1. Lie on the column line (projects local-x onto the fit, then
   *      transforms back to the image frame).
   *   2. The column's median rotation in IMAGE-frame degrees (so a mis-
   *      detected rotation outlier gets pulled into alignment).
   *   3. The column's median side length.
   *
   * Working in the local frame is what makes this rotation-aware: a
   * tilted Bastardkb half has columns that LOOK diagonal in the photo, but
   * are vertical lines in the keyboard's own coordinate system. The least-
   * squares fit happens against those vertical lines so the projection
   * stays accurate even when the whole keyboard is rotated 15°+.
   *
   * Manual blobs are skipped — user placement always wins.
   */
  function applyColumnSnap(
    blobs: KeyShape[],
    cluster: ColumnCluster,
    cols: number,
    rows: number,
  ) {
    const { colIdx, kbAngle, kbCenter } = cluster;
    const byCol = new Map<number, KeyShape[]>();
    for (const b of blobs) {
      const c = colIdx.get(b.id);
      if (c === undefined) continue;
      if (b.origin === "manual") continue;
      const list = byCol.get(c) ?? [];
      list.push(b);
      byCol.set(c, list);
    }
    for (let c = 0; c < cols; c++) {
      const colKeysAll = byCol.get(c);
      if (!colKeysAll || colKeysAll.length < 2) continue;
      // Sort by local-y so we can pick the topmost `rows` as the MAIN grid
      // keys. Thumbs cluster into the bottom of some column but they are
      // NOT on the column's spine, NOT at the column's rotation, and NOT
      // its size. Including them in the line fit / median rotation / snap
      // would warp the column away from its real geometry.
      const sortedByLocalY = [...colKeysAll].sort((a, b) => {
        const ya = toKeyboardFrame(a.centroid, kbAngle, kbCenter).y;
        const yb = toKeyboardFrame(b.centroid, kbAngle, kbCenter).y;
        return ya - yb;
      });
      const mainKeys = sortedByLocalY.slice(0, rows);
      if (mainKeys.length < 2) continue;
      // Only main keys contribute to the line fit and the medians.
      const localPts = mainKeys.map((k) => toKeyboardFrame(k.centroid, kbAngle, kbCenter));
      const n = localPts.length;
      let sx = 0;
      let sy = 0;
      let sxy = 0;
      let syy = 0;
      for (const p of localPts) {
        sx += p.x;
        sy += p.y;
        sxy += p.x * p.y;
        syy += p.y * p.y;
      }
      const denom = n * syy - sy * sy;
      const aSlope = Math.abs(denom) > 1e-6 ? (n * sxy - sx * sy) / denom : 0;
      const bIntercept = (sx - aSlope * sy) / n;
      const rotsSorted = [...mainKeys].map((k) => k.rotationDeg).sort((p, q) => p - q);
      const medRot = rotsSorted[Math.floor(rotsSorted.length / 2)];
      const sidesSorted = [...mainKeys].map((k) => k.sideLengthPx).sort((p, q) => p - q);
      const medSide = sidesSorted[Math.floor(sidesSorted.length / 2)];

      // Snap ONLY the main keys. Thumb keys (the extras in `sortedByLocalY`
      // beyond index `rows`) keep their original position, rotation, and size.
      for (let i = 0; i < mainKeys.length; i++) {
        const k = mainKeys[i];
        const lp = localPts[i];
        const newLocal: Point = { x: aSlope * lp.y + bIntercept, y: lp.y };
        const newImage = toImageFrame(newLocal, kbAngle, kbCenter);
        k.centroid = newImage;
        k.rotationDeg = medRot;
        k.sideLengthPx = medSide;
        const t = (medRot * Math.PI) / 180;
        const cos = Math.cos(t);
        const sin = Math.sin(t);
        const half = medSide / 2;
        k.corners = [
          { x: newImage.x - half * cos + half * sin, y: newImage.y - half * sin - half * cos },
          { x: newImage.x + half * cos + half * sin, y: newImage.y + half * sin - half * cos },
          { x: newImage.x + half * cos - half * sin, y: newImage.y + half * sin + half * cos },
          { x: newImage.x - half * cos - half * sin, y: newImage.y - half * sin + half * cos },
        ];
      }
    }
  }

  /**
   * Auto-assign `${row},${col}` labels using the column clustering.
   * - Within each column, the top `rowCount` keys (sorted by y ascending)
   *   get labels `0,c`, `1,c`, …
   * - Manual blobs keep whatever label they had — user-placed thumbs stay
   *   manually labelled.
   * - Anything beyond `rowCount` in a column is treated as a thumb/extra
   *   and gets its auto-label cleared.
   */
  /**
   * Per-half bounds in the keyboard's local frame. Used to decide whether
   * a short column is missing rows above (top of board) or below (bottom).
   */
  type HalfBounds = {
    /** Min local-y across every non-manual key in this half. */
    halfMinY: number;
    /** Max local-y across every non-manual key in this half. */
    halfMaxY: number;
    /** Median inter-row gap across all columns with ≥2 keys. */
    globalSpacing: number;
  };

  function computeHalfBounds(
    blobs: KeyShape[],
    cluster: ColumnCluster,
    rows: number,
  ): HalfBounds {
    const { colIdx, kbAngle, kbCenter } = cluster;
    const byCol = new Map<number, Array<{ k: KeyShape; ly: number }>>();
    for (const b of blobs) {
      if (!colIdx.has(b.id)) continue;
      const c = colIdx.get(b.id)!;
      const list = byCol.get(c) ?? [];
      list.push({ k: b, ly: toKeyboardFrame(b.centroid, kbAngle, kbCenter).y });
      byCol.set(c, list);
    }
    // CRITICAL: bounds must reflect the MAIN GRID, not the thumbs. Thumbs
    // cluster into some main column's bucket and sit BELOW the bottom row
    // of that column — if we include them, halfMaxY balloons into the
    // thumb area and the row-start heuristic stops being able to tell
    // "this column's topmost detected key is actually row N≠0" from
    // "this column has thumbs below the main grid".
    //
    // The top `rows` keys of each column are the main grid (matches the
    // logic in applyAutoLabels). Take only those for the bounds.
    let halfMinY = Infinity;
    let halfMaxY = -Infinity;
    const allGaps: number[] = [];
    for (const ck of byCol.values()) {
      const sortedByY = [...ck].sort((a, b) => a.ly - b.ly);
      const mainOnly = sortedByY.slice(0, rows);
      for (const m of mainOnly) {
        if (m.ly < halfMinY) halfMinY = m.ly;
        if (m.ly > halfMaxY) halfMaxY = m.ly;
      }
      for (let i = 1; i < mainOnly.length; i++) {
        allGaps.push(mainOnly[i].ly - mainOnly[i - 1].ly);
      }
    }
    allGaps.sort((a, b) => a - b);
    const globalSpacing =
      allGaps.length > 0 ? allGaps[Math.floor(allGaps.length / 2)] : 0;
    return { halfMinY, halfMaxY, globalSpacing };
  }

  /**
   * For a column with `k < rows` detected keys, figure out which matrix
   * row the topmost detected key represents.
   *
   * The naive assumption "topmost detected = row 0" breaks when a column
   * is missing its TOP row(s) — e.g. on a Bastardkb half where the outer
   * pinky column is staircased down 2u, and detection misses the top
   * pinky key. Then extrapolating "missing rows below" puts the predicted
   * slot off the bottom of the keyboard, AND every detected key in that
   * column ends up labelled one row too low.
   *
   * We fix this by sweeping candidate `rowStart` values 0..(rows-k) and
   * picking the smallest one that keeps every row position — including
   * the predicted missing rows — inside the half's local-y bounds
   * (`halfMinY` .. `halfMaxY` ± half a row gap of tolerance). For the
   * outer columns this collapses to the right answer:
   *   - missing at bottom → rowStart=0 (current behavior)
   *   - missing at top → rowStart>0 (NEW)
   *
   * For inner staircased columns whose own y range is narrower than the
   * half's, both options can fit and we pick rowStart=0 by default. This
   * is the same as the old behavior for those columns, so the fix is
   * additive — it only changes outcomes where the outer-column heuristic
   * actively helps.
   */
  /**
   * Decide which matrix row each detected key in a column corresponds to.
   *
   * Returns a per-key array `rowsFromTop`: rowsFromTop[i] is how many row
   * indices below the topmost detected key the i-th detected key sits,
   * AND a `rowStart`: the matrix row of the topmost detected key.
   *
   * Handles three cases:
   *   - Consecutive detection (rows 0..k-1):
   *     rowsFromTop = [0, 1, 2…] regardless of position
   *   - Bottom missing (detected at top rows): rowStart = 0
   *   - Top missing (detected at bottom rows): rowStart > 0, push labels up
   *   - Middle missing (e.g. rows 0 and 2 with row 1 absent):
   *     the inter-key gap will be ≈ 2× globalSpacing, so rowsFromTop
   *     becomes [0, 2] and the missing row index goes into missingRows.
   *
   * Picks the smallest rowStart for which every detected and predicted
   * row sits inside the half's local-y bounds (tight 0.15·spacing
   * tolerance — enough for detection noise but not for extrapolating off
   * the keyboard).
   */
  function planColumnRows(
    sortedYs: number[],
    rows: number,
    globalSpacing: number,
    halfMinY: number,
    halfMaxY: number,
  ): { rowStart: number; rowsFromTop: number[]; missingRows: number[] } {
    const k = sortedYs.length;
    if (k === 0 || globalSpacing <= 0) {
      return { rowStart: 0, rowsFromTop: [], missingRows: [] };
    }
    if (k >= rows) {
      // Column is full — assume consecutive rows starting at 0.
      const rowsFromTop = Array.from({ length: k }, (_, i) => i);
      return { rowStart: 0, rowsFromTop, missingRows: [] };
    }
    // Estimate how many ROW SLOTS each consecutive detected pair spans
    // by rounding their gap to a multiple of globalSpacing. Spacing
    // measurement is noisy so round-to-int handles small detector drift.
    const rowsFromTop: number[] = [0];
    let cumulative = 0;
    for (let i = 1; i < k; i++) {
      const gap = sortedYs[i] - sortedYs[i - 1];
      const rowsBetween = Math.max(1, Math.round(gap / globalSpacing));
      cumulative += rowsBetween;
      rowsFromTop.push(cumulative);
    }
    const totalSpan = rowsFromTop[k - 1] + 1; // 1-based count of row slots used
    if (totalSpan > rows) {
      // Column claims more rows than the matrix has — bail out, treat
      // detection as consecutive and let chooseRowStart's bounds check
      // (down the call chain) recover what it can.
      const fallback = Array.from({ length: k }, (_, i) => i);
      const missing: number[] = [];
      for (let r = k; r < rows; r++) missing.push(r);
      return { rowStart: 0, rowsFromTop: fallback, missingRows: missing };
    }

    const topY = sortedYs[0];
    const tol = 0.15 * globalSpacing;
    let rowStart = 0;
    for (let rs = 0; rs <= rows - totalSpan; rs++) {
      // Topmost row's y if rowStart = rs
      const topRowY = topY - rs * globalSpacing;
      // Deepest row's y (= row index `rows-1`) if rowStart = rs
      const deepestRowY = topY + (rows - 1 - rs) * globalSpacing;
      if (topRowY >= halfMinY - tol && deepestRowY <= halfMaxY + tol) {
        rowStart = rs;
        break;
      }
    }

    const detectedSet = new Set(rowsFromTop.map((r) => r + rowStart));
    const missingRows: number[] = [];
    for (let r = 0; r < rows; r++) {
      if (!detectedSet.has(r)) missingRows.push(r);
    }
    return { rowStart, rowsFromTop, missingRows };
  }

  function applyAutoLabels(
    blobs: KeyShape[],
    cluster: ColumnCluster,
    cols: number,
    rows: number,
    mirror: boolean,
    rowOffset = 0,
    halfBounds?: HalfBounds,
  ) {
    const { colIdx, kbAngle, kbCenter } = cluster;
    const byCol = new Map<number, KeyShape[]>();
    for (const b of blobs) {
      const c = colIdx.get(b.id);
      if (c === undefined) continue;
      const list = byCol.get(c) ?? [];
      list.push(b);
      byCol.set(c, list);
    }
    // Clear unlocked, non-manual labels first so dropping a key out of grid
    // range doesn't leave a stale label behind. Locked labels (user picked
    // from the dropdown) and manual-origin blobs are preserved as-is.
    for (const b of blobs) {
      if (b.origin === "manual") continue;
      if (b.labelLocked) continue;
      b.label = undefined;
    }
    // Cache local-y for the row sort so a tilted keyboard's "topmost" key
    // is the one nearest the top of the BOARD, not the top of the image.
    const localY = new Map<number, number>();
    for (const colKeys of byCol.values()) {
      for (const k of colKeys) {
        localY.set(k.id, toKeyboardFrame(k.centroid, kbAngle, kbCenter).y);
      }
    }
    // Main grid pass: use planColumnRows to figure out which matrix rows
    // the column's detected keys correspond to. The plan handles "missing
    // bottom" (default), "missing top" (outer staircased columns), and
    // "missing middle" (gap > 1 row between adjacent detected keys).
    const bounds = halfBounds ?? computeHalfBounds(blobs, cluster, rows);
    for (let c = 0; c < cols; c++) {
      const colKeys = byCol.get(c);
      if (!colKeys) continue;
      colKeys.sort((a, b) => (localY.get(a.id) ?? 0) - (localY.get(b.id) ?? 0));
      const labelCol = mirror ? cols - 1 - c : c;
      const mainKeys = colKeys.slice(0, rows);
      const sortedYs = mainKeys.map((k) => localY.get(k.id) ?? 0);
      const plan = planColumnRows(
        sortedYs,
        rows,
        bounds.globalSpacing,
        bounds.halfMinY,
        bounds.halfMaxY,
      );
      for (let i = 0; i < mainKeys.length; i++) {
        const k = mainKeys[i];
        if (k.labelLocked) continue;
        const matrixRow = plan.rowStart + (plan.rowsFromTop[i] ?? i) + rowOffset;
        k.label = `${matrixRow},${labelCol}`;
      }
    }

    // Thumb pass: everything still unlabelled in this half is a thumb. Sort
    // by local-x along the keyboard's horizontal axis and assign sequential
    // matrix cols (0, 1, 2, …). The clustering column doesn't match the
    // matrix here — Bastardkb wires thumbs into cols 0 and 2 even though
    // they sit physically below cols 3 and 4 of the main grid — so we
    // assign by SCAN ORDER instead. For LTR thumbs (left half, mirror=
    // false) this gives outer-then-inner; mirroring flips the sort so the
    // right half also gives outer-then-inner.
    //
    // Thumb row = matrix row immediately after the main rows of this half.
    // Dilemma left half: rows 0-2 main + row 3 thumb. Right half (rowOffset
    // = rowCount+1 = 4): rows 4-6 main + row 7 thumb. The formula
    // `rowOffset + rows` covers both cases.
    const thumbRow = rowOffset + rows;
    const thumbs: KeyShape[] = [];
    for (const b of blobs) {
      if (b.origin === "manual" || b.kind !== "key" || b.labelLocked) continue;
      if (b.label) continue;
      thumbs.push(b);
    }
    const localX = new Map<number, number>();
    for (const k of thumbs) {
      localX.set(k.id, toKeyboardFrame(k.centroid, kbAngle, kbCenter).x);
    }
    thumbs.sort((a, b) => {
      const la = localX.get(a.id) ?? 0;
      const lb = localX.get(b.id) ?? 0;
      // Mirror flips the scan direction so the rightmost thumb (physical
      // outer/pinky side on the right half) ends up at col 0 like the
      // leftmost thumb on the left half does.
      return mirror ? lb - la : la - lb;
    });
    // Map sorted thumb index → matrix col. Bastardkb / Corne 3x5+2 wires
    // its 2 thumbs into cols 0 and 2 (skipping col 1), so for exactly two
    // thumbs we use that convention. For 3+ thumbs (Corne 3x5+3, Lily58)
    // they sit in sequential cols 0..N-1. User can override via the
    // dropdown for unusual layouts.
    const thumbColMap =
      thumbs.length === 2
        ? [0, 2]
        : Array.from({ length: thumbs.length }, (_, i) => i);
    for (let i = 0; i < thumbs.length; i++) {
      thumbs[i].label = `${thumbRow},${thumbColMap[i]}`;
    }
  }

  /**
   * Auto-detect a split keyboard (two halves in the same photo).
   *
   * Strategy: sort key centroids by x, find the biggest gap between adjacent
   * keys, and split there if the gap is ≥ 2.5× the median inter-key x-gap.
   * Real split-keyboard photos have a 4-8 key-width void between halves;
   * single-half photos have at most a 1.5-key-width gap (between thumbs and
   * the main grid), so the threshold cleanly separates the two cases.
   *
   * Returns null when:
   *   - Fewer than `colCount × 2` keys (need enough per half to cluster)
   *   - No gap stands out (single-half photo)
   *   - One side ends up with fewer than `colCount` keys (degenerate split)
   */
  function tryAutoSplitHalves(
    blobs: KeyShape[],
  ): { left: KeyShape[]; right: KeyShape[] } | null {
    // Match clusterIntoColumns's filter so a manual blob added by the
    // "Fill missing" workflow (locked + grid label) shows up in the correct
    // half. Without this the fill blob is dropped from `halves.left/right`
    // and the missing-detection ghost persists at its location.
    const keys = blobs.filter(
      (b) =>
        b.kind === "key" &&
        (b.origin !== "manual" ||
          (b.labelLocked === true && b.label !== undefined && /^\d+,\d+$/.test(b.label))),
    );
    if (keys.length < colCount * 2) return null;
    const sortedByX = [...keys].sort((a, b) => a.centroid.x - b.centroid.x);
    const xs = sortedByX.map((k) => k.centroid.x);
    // Per-pair x-gaps.
    const gaps: number[] = [];
    for (let i = 1; i < xs.length; i++) gaps.push(xs[i] - xs[i - 1]);
    const sortedGaps = [...gaps].sort((a, b) => a - b);
    const medianGap = sortedGaps[Math.floor(sortedGaps.length / 2)] || 1;
    let maxGap = 0;
    let splitIdx = -1;
    for (let i = 0; i < gaps.length; i++) {
      if (gaps[i] > maxGap) {
        maxGap = gaps[i];
        splitIdx = i + 1;
      }
    }
    if (splitIdx < 0 || maxGap < medianGap * 2.5) return null;
    const left = sortedByX.slice(0, splitIdx);
    const right = sortedByX.slice(splitIdx);
    if (left.length < colCount || right.length < colCount) return null;
    return { left, right };
  }

  /**
   * Predict where missing main-grid keys SHOULD be. For each column that
   * has fewer than `rows` keys, we:
   *   1. Sort detected keys in this column by local-y (top-to-bottom).
   *   2. Estimate row spacing from this column if it has ≥ 2 keys; else
   *      from the median spacing of OTHER columns in this half.
   *   3. For each row index 0..rows-1, check whether a detected key is
   *      within ±0.4 × spacing of the predicted y. If not, predict the
   *      missing slot's position (column-median local-x, predicted-y) and
   *      transform back to image frame for drawing.
   *
   * Returns ghost slots the user can click "Fill missing" to bulk-add via
   * smartAdd, or click individually on the canvas.
   */
  function findMissingInCluster(
    blobs: KeyShape[],
    cluster: ColumnCluster,
    cols: number,
    rows: number,
    rowOffset: number,
    mirror: boolean,
    halfTag: string,
    halfBounds?: HalfBounds,
  ): MissingSlot[] {
    const { colIdx, kbAngle, kbCenter } = cluster;
    const byCol = new Map<number, KeyShape[]>();
    for (const b of blobs) {
      const c = colIdx.get(b.id);
      if (c === undefined) continue;
      const list = byCol.get(c) ?? [];
      list.push(b);
      byCol.set(c, list);
    }
    // Fallback row spacing: median of inter-key gaps across ALL columns
    // that have ≥ 2 keys. Used when the short column itself has only 1
    // key and can't tell us the spacing on its own.
    const allGaps: number[] = [];
    for (const ck of byCol.values()) {
      if (ck.length < 2) continue;
      const ys = ck
        .map((k) => toKeyboardFrame(k.centroid, kbAngle, kbCenter).y)
        .sort((a, b) => a - b);
      for (let i = 1; i < ys.length && i < rows; i++) allGaps.push(ys[i] - ys[i - 1]);
    }
    allGaps.sort((a, b) => a - b);
    const globalSpacing =
      allGaps.length > 0 ? allGaps[Math.floor(allGaps.length / 2)] : 0;

    // Median side / rotation for ghost rendering.
    const allKeys = blobs.filter((b) => b.kind === "key" && colIdx.has(b.id));
    const allSides = allKeys.map((k) => k.sideLengthPx).sort((a, b) => a - b);
    const medSide = allSides.length > 0 ? allSides[Math.floor(allSides.length / 2)] : 40;

    const missing: MissingSlot[] = [];
    for (let c = 0; c < cols; c++) {
      const colKeys = byCol.get(c);
      if (!colKeys || colKeys.length === 0) continue;
      if (colKeys.length >= rows) continue; // complete or has thumbs

      // Sort by local-y, take topmost `rows` as the column's main keys.
      const sortedAll = [...colKeys]
        .map((k) => ({ k, ly: toKeyboardFrame(k.centroid, kbAngle, kbCenter).y }))
        .sort((a, b) => a.ly - b.ly);
      const mainSorted = sortedAll.slice(0, rows);

      // Per-column spacing if available; otherwise global.
      let spacing = globalSpacing;
      if (mainSorted.length >= 2) {
        const gaps: number[] = [];
        for (let i = 1; i < mainSorted.length; i++) {
          gaps.push(mainSorted[i].ly - mainSorted[i - 1].ly);
        }
        gaps.sort((a, b) => a - b);
        spacing = gaps[Math.floor(gaps.length / 2)];
      }
      if (spacing <= 0) continue;

      // Build a row plan that knows about top/bottom/middle missing rows.
      const topY = mainSorted[0].ly;
      const bounds = halfBounds ?? computeHalfBounds(blobs, cluster, rows);
      const plan = planColumnRows(
        mainSorted.map((m) => m.ly),
        rows,
        bounds.globalSpacing,
        bounds.halfMinY,
        bounds.halfMaxY,
      );
      const colXs = colKeys
        .map((k) => toKeyboardFrame(k.centroid, kbAngle, kbCenter).x)
        .sort((a, b) => a - b);
      const colX = colXs[Math.floor(colXs.length / 2)];

      // Column rotation = median of main keys in this column.
      const colRots = [...mainSorted].map((m) => m.k.rotationDeg).sort((a, b) => a - b);
      const colRot =
        colRots.length > 0 ? colRots[Math.floor(colRots.length / 2)] : kbAngle;
      const colSides = [...mainSorted]
        .map((m) => m.k.sideLengthPx)
        .sort((a, b) => a - b);
      const colSide =
        colSides.length > 0 ? colSides[Math.floor(colSides.length / 2)] : medSide;

      for (const r of plan.missingRows) {
        // Predicted y = topY shifted by the delta between THIS row and
        // the matrix row of the topmost detected key (plan.rowStart).
        const expectedY = topY + (r - plan.rowStart) * bounds.globalSpacing;
        const predictedLocal: Point = { x: colX, y: expectedY };
        const predictedImage = toImageFrame(predictedLocal, kbAngle, kbCenter);
        // Skip predictions whose centroid is outside the photo — these come
        // from extrapolating a column past the keyboard edge (e.g. a key
        // that's truly cut off by the photo's framing). Without this the
        // user sees a ghost in the desk area that they can't usefully fill.
        if (
          predictedImage.x < 0 ||
          predictedImage.x >= imgWidth ||
          predictedImage.y < 0 ||
          predictedImage.y >= imgHeight
        ) {
          continue;
        }
        const labelCol = mirror ? cols - 1 - c : c;
        const label = `${r + rowOffset},${labelCol}`;
        // Build corners with the column rotation.
        const t = (colRot * Math.PI) / 180;
        const cos = Math.cos(t);
        const sin = Math.sin(t);
        const half = colSide / 2;
        const corners: [Point, Point, Point, Point] = [
          { x: predictedImage.x - half * cos + half * sin, y: predictedImage.y - half * sin - half * cos },
          { x: predictedImage.x + half * cos + half * sin, y: predictedImage.y + half * sin - half * cos },
          { x: predictedImage.x + half * cos - half * sin, y: predictedImage.y + half * sin + half * cos },
          { x: predictedImage.x - half * cos - half * sin, y: predictedImage.y - half * sin + half * cos },
        ];
        missing.push({
          id: `${halfTag}-r${r + rowOffset}c${labelCol}`,
          label,
          centroid: predictedImage,
          sideLengthPx: colSide,
          rotationDeg: colRot,
          corners,
        });
      }
    }
    return missing;
  }

  /**
   * Re-orient trackpads to share the rotation of their owning keyboard
   * half. `fitRotatedRectangle` returns an arbitrary angle for circular
   * blobs (any rotation gives the same minimum-bounding-rect area), and
   * we'd rather draw the trackpad outline aligned with the keys around
   * it. Picks the half-angle by which half's x range contains the
   * trackpad centroid; falls back to the global kbAngle for single-half
   * photos. Recomputes corners around centroid + sideLengthPx so the
   * rendered box is square and rotated to match.
   */
  function alignTrackpads(
    target: KeyShape[],
    leftCluster: ColumnCluster | null,
    rightCluster: ColumnCluster | null,
    splitX: number | null,
  ) {
    if (!leftCluster && !rightCluster) return;
    for (const b of target) {
      if (b.kind !== "trackpad") continue;
      let angle: number;
      if (leftCluster && rightCluster && splitX !== null) {
        angle =
          b.centroid.x < splitX ? leftCluster.kbAngle : rightCluster.kbAngle;
      } else {
        angle = (leftCluster ?? rightCluster)!.kbAngle;
      }
      // Use the LARGER of the two rect sides as the trackpad side — a
      // circular blob has equal sides but if the morph close + the
      // surrounding case bias one direction we want the bigger one so the
      // outline encompasses the whole pad.
      const side = b.sideLengthPx;
      const t = (angle * Math.PI) / 180;
      const cos = Math.cos(t);
      const sin = Math.sin(t);
      const half = side / 2;
      b.rotationDeg = angle;
      b.corners = [
        { x: b.centroid.x - half * cos + half * sin, y: b.centroid.y - half * sin - half * cos },
        { x: b.centroid.x + half * cos + half * sin, y: b.centroid.y + half * sin - half * cos },
        { x: b.centroid.x + half * cos - half * sin, y: b.centroid.y + half * sin + half * cos },
        { x: b.centroid.x - half * cos - half * sin, y: b.centroid.y - half * sin + half * cos },
      ];
    }
  }

  /**
   * Single entry point for the layout-aware post-pass. Called after
   * classifyDetected by both the autoDetect pipeline and the cleanup
   * effect, so toggling snap / auto-label re-runs without re-detecting.
   *
   * Auto-detects split keyboards: if two halves are present, each is
   * clustered independently with its own kbAngle, and the right half is
   * labelled with rows `rowCount+1..2*rowCount` and mirrored columns
   * (matching the Dilemma / Corne / Lily58 matrix convention).
   */
  function postClassify(target: KeyShape[]) {
    if (target.length === 0) {
      detectedKbAngle = null;
      detectedRightKbAngle = null;
      detectedLayout = null;
      detectedMissing = [];
      return;
    }

    const halves = tryAutoSplitHalves(target);
    if (halves) {
      const leftCluster = clusterIntoColumns(halves.left, colCount);
      const rightCluster = clusterIntoColumns(halves.right, colCount);
      detectedKbAngle =
        leftCluster.colIdx.size > 0 ? Math.round(leftCluster.kbAngle * 10) / 10 : null;
      detectedRightKbAngle =
        rightCluster.colIdx.size > 0 ? Math.round(rightCluster.kbAngle * 10) / 10 : null;
      detectedLayout = "split";
      // Compute per-half bounds once so apply/find use the SAME row-start
      // decisions (a column has to match its label to its missing-slot
      // prediction; computing bounds twice with slightly different blob
      // sets could drift them apart).
      const leftBounds = computeHalfBounds(halves.left, leftCluster, rowCount);
      const rightBounds = computeHalfBounds(halves.right, rightCluster, rowCount);
      // Align trackpads to whichever half contains them so the cyan
      // outline rotates with the rest of the keys on that side.
      const leftMaxX =
        halves.left.length > 0
          ? Math.max(...halves.left.map((k) => k.centroid.x))
          : 0;
      const rightMinX =
        halves.right.length > 0
          ? Math.min(...halves.right.map((k) => k.centroid.x))
          : 0;
      const splitX = (leftMaxX + rightMinX) / 2;
      alignTrackpads(target, leftCluster, rightCluster, splitX);
      if (snapToColumns) {
        applyColumnSnap(halves.left, leftCluster, colCount, rowCount);
        applyColumnSnap(halves.right, rightCluster, colCount, rowCount);
      }
      if (autoLabel) {
        // Right half rows offset by rowCount+1 (Dilemma: 3 left rows + 1 thumb
        // row + 3 right rows). Right columns are always mirrored — leftmost
        // image-x in the right half is the inner-index finger (matrix col
        // colCount-1), rightmost image-x is the pinky (matrix col 0).
        applyAutoLabels(halves.left, leftCluster, colCount, rowCount, mirrorColumns, 0, leftBounds);
        applyAutoLabels(halves.right, rightCluster, colCount, rowCount, true, rowCount + 1, rightBounds);
      }
      const leftMissing = findMissingInCluster(
        halves.left,
        leftCluster,
        colCount,
        rowCount,
        0,
        mirrorColumns,
        "L",
        leftBounds,
      );
      const rightMissing = findMissingInCluster(
        halves.right,
        rightCluster,
        colCount,
        rowCount,
        rowCount + 1,
        true,
        "R",
        rightBounds,
      );
      detectedMissing = [...leftMissing, ...rightMissing];
      return;
    }

    // Single-half / non-split fallback.
    const cluster = clusterIntoColumns(target, colCount);
    detectedKbAngle =
      cluster.colIdx.size > 0 ? Math.round(cluster.kbAngle * 10) / 10 : null;
    detectedRightKbAngle = null;
    detectedLayout = "single";
    const singleBounds = computeHalfBounds(target, cluster, rowCount);
    alignTrackpads(target, cluster, null, null);
    if (snapToColumns) applyColumnSnap(target, cluster, colCount, rowCount);
    if (autoLabel) applyAutoLabels(target, cluster, colCount, rowCount, mirrorColumns, 0, singleBounds);
    detectedMissing = findMissingInCluster(
      target,
      cluster,
      colCount,
      rowCount,
      0,
      mirrorColumns,
      "S",
      singleBounds,
    );
  }

  /**
   * Re-flood a blob from a point inside it and replace its geometry. Used
   * by double-click to re-shape a key that was detected wrong without
   * having to drag four corners back into place.
   */
  function reshapeBlob(blob: KeyShape, p: Point) {
    const medSide = detectionStats?.medianSidePx ?? blob.sideLengthPx;
    const flood = floodFromPoint(p, {
      maxDist: medSide * 1.4,
      maxArea: medSide * medSide * 2.6,
    });
    if (!flood || flood.points.length === 0 || flood.truncated) {
      lastSmartAddNote = "Re-shape failed — flood couldn't isolate a clean key region here";
      return;
    }
    const { points } = flood;
    let sumX = 0;
    let sumY = 0;
    for (const [px, py] of points) {
      sumX += px;
      sumY += py;
    }
    const cx = sumX / points.length;
    const cy = sumY / points.length;
    const { angle, bounds } = fitRotatedRectangle(points, cx, cy);
    const sideU = bounds.maxU - bounds.minU;
    const sideV = bounds.maxV - bounds.minV;
    const sideLengthPx = (sideU + sideV) / 2;
    const corners = cornersFromRect(cx, cy, angle, bounds);
    blob.centroid = { x: cx, y: cy };
    blob.rotationDeg = angle;
    blob.sideLengthPx = sideLengthPx;
    blob.corners = corners;
    blob.pixelCount = points.length;
    lastSmartAddNote = "";
    blobs = [...blobs];
    selectedBlobId = blob.id;
    redraw();
  }

  // ---------- Smart-add (single click) and edge-snap ----------
  /**
   * Flood-fills the cached binary mask starting from a seed pixel and
   * returns the list of pixel indices in the connected component. If the
   * seed isn't on a foreground pixel, scans outward up to `searchRadius`
   * for the nearest one.
   */
  function floodFromPoint(
    p: Point,
    options: {
      searchRadius?: number;
      maxDist?: number;
      maxArea?: number;
    } = {},
  ): { points: Array<[number, number]>; seedX: number; seedY: number; truncated: boolean } | null {
    const searchRadius = options.searchRadius ?? 18;
    const maxDist = options.maxDist ?? Infinity;
    const maxArea = options.maxArea ?? Infinity;
    if (!cachedMask) return null;
    const w = cachedMaskWidth;
    const h = cachedMaskHeight;
    let sx = Math.round(p.x);
    let sy = Math.round(p.y);
    if (sx < 0 || sx >= w || sy < 0 || sy >= h) return null;
    if (!cachedMask[sy * w + sx]) {
      // Spiral out looking for a foreground pixel
      let found = false;
      for (let r = 1; r <= searchRadius && !found; r++) {
        for (let dy = -r; dy <= r && !found; dy++) {
          for (let dx = -r; dx <= r && !found; dx++) {
            if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
            const nx = sx + dx;
            const ny = sy + dy;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
            if (cachedMask[ny * w + nx]) {
              sx = nx;
              sy = ny;
              found = true;
            }
          }
        }
      }
      if (!found) return null;
    }
    const seedIdx = sy * w + sx;
    const visited = new Uint8Array(w * h);
    const stack = new Int32Array(w * h);
    let sp = 0;
    stack[sp++] = seedIdx;
    visited[seedIdx] = 1;
    const points: Array<[number, number]> = [];
    const maxDistSq = maxDist === Infinity ? Infinity : maxDist * maxDist;
    let truncated = false;
    while (sp > 0) {
      if (points.length >= maxArea) {
        truncated = true;
        break;
      }
      const j = stack[--sp];
      const jx = j % w;
      const jy = (j - jx) / w;
      // Bound flood to a disk of radius `maxDist` around the seed so a thin
      // pixel bridge can't drag us across the whole image.
      const ddx = jx - sx;
      const ddy = jy - sy;
      if (ddx * ddx + ddy * ddy > maxDistSq) continue;
      points.push([jx, jy]);
      if (jx > 0) {
        const k = j - 1;
        if (cachedMask[k] && !visited[k]) {
          visited[k] = 1;
          stack[sp++] = k;
        }
      }
      if (jx + 1 < w) {
        const k = j + 1;
        if (cachedMask[k] && !visited[k]) {
          visited[k] = 1;
          stack[sp++] = k;
        }
      }
      if (jy > 0) {
        const k = j - w;
        if (cachedMask[k] && !visited[k]) {
          visited[k] = 1;
          stack[sp++] = k;
        }
      }
      if (jy + 1 < h) {
        const k = j + w;
        if (cachedMask[k] && !visited[k]) {
          visited[k] = 1;
          stack[sp++] = k;
        }
      }
    }
    return { points, seedX: sx, seedY: sy, truncated };
  }

  function smartAdd(p: Point) {
    // If detection has already run, scale the flood bounds to the median key
    // size so a pixel bridge to neighbouring keys can't capture the whole
    // image. Without prior detection we use a generous default that still
    // beats "swallow the entire foreground".
    const medSide = detectionStats?.medianSidePx ?? 60;
    const maxDist = medSide * 1.4;
    const maxArea = medSide * medSide * 2.6;

    const fallbackSquare = (reason: string) => {
      const fallback = Math.max(40, medSide);
      const half = fallback / 2;
      const corners: [Point, Point, Point, Point] = [
        { x: p.x - half, y: p.y - half },
        { x: p.x + half, y: p.y - half },
        { x: p.x + half, y: p.y + half },
        { x: p.x - half, y: p.y + half },
      ];
      const blob: KeyShape = {
        id: nextId++,
        pixelCount: 0,
        perimeter: 0,
        circularity: 0.785,
        centroid: { x: p.x, y: p.y },
        rotationDeg: 0,
        sideLengthPx: fallback,
        corners,
        origin: "manual",
        kind: "key",
      };
      blobs = [...blobs, blob];
      selectedBlobId = blob.id;
      lastSmartAddNote = reason;
      // Refresh layout-aware state so the new blob participates in
      // clustering / auto-label / missing detection.
      classifyDetected(blobs);
      postClassify(blobs);
      blobs = [...blobs];
      redraw();
    };

    const flood = floodFromPoint(p, { maxDist, maxArea });
    if (!flood || flood.points.length === 0) {
      fallbackSquare("no foreground pixel near click — placed a square at the click point");
      return;
    }
    if (flood.truncated) {
      // The flood hit the area cap before it ran out of connected pixels.
      // That means we're inside a giant blob (glare bridge, merged keys, or
      // a background hole) — fall back to a fixed square instead of fitting
      // a rectangle to a runaway region.
      fallbackSquare(
        `flood was truncated at ${maxArea.toFixed(0)} px — adjacent keys are bridged; placed a default-size square`,
      );
      return;
    }
    const { points } = flood;
    let sumX = 0;
    let sumY = 0;
    for (const [px, py] of points) {
      sumX += px;
      sumY += py;
    }
    const cx = sumX / points.length;
    const cy = sumY / points.length;
    const { angle, bounds } = fitRotatedRectangle(points, cx, cy);
    const sideU = bounds.maxU - bounds.minU;
    const sideV = bounds.maxV - bounds.minV;
    const sideLengthPx = (sideU + sideV) / 2;
    // Also reject if the fitted side is wildly bigger than the median.
    if (detectionStats && sideLengthPx > detectionStats.medianSidePx * 1.9) {
      fallbackSquare(
        `fitted side ${sideLengthPx.toFixed(0)}px > 1.9× median ${detectionStats.medianSidePx.toFixed(0)}px — likely merged with neighbour`,
      );
      return;
    }
    const corners = cornersFromRect(cx, cy, angle, bounds);
    const blob: KeyShape = {
      id: nextId++,
      pixelCount: points.length,
      perimeter: 0,
      circularity: 0.785,
      centroid: { x: cx, y: cy },
      rotationDeg: angle,
      sideLengthPx,
      corners,
      origin: "manual",
      kind: "key",
    };
    blobs = [...blobs, blob];
    selectedBlobId = blob.id;
    lastSmartAddNote = "";
    classifyDetected(blobs);
    // Also rerun the layout-aware pass so detectedMissing / auto-labels
    // pick up the new key immediately instead of leaving a stale ghost.
    postClassify(blobs);
    blobs = [...blobs];
    redraw();
  }

  /**
   * Snap a corner point to the nearest mask boundary pixel within a given
   * radius. Boundary = a foreground pixel adjacent to background (or v/v).
   * Falls back to the original point if no boundary is found in range.
   */
  function snapToEdge(p: Point, radius = 14): Point {
    if (!cachedMask) return p;
    const w = cachedMaskWidth;
    const h = cachedMaskHeight;
    const px = Math.round(p.x);
    const py = Math.round(p.y);
    let bestX = p.x;
    let bestY = p.y;
    let bestDist = Infinity;
    for (let dy = -radius; dy <= radius; dy++) {
      const ny = py + dy;
      if (ny < 0 || ny >= h) continue;
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = px + dx;
        if (nx < 0 || nx >= w) continue;
        const idx = ny * w + nx;
        const v = cachedMask[idx];
        // Boundary test: at least one 4-neighbour differs
        const r = nx + 1 < w ? cachedMask[idx + 1] : v;
        const l = nx > 0 ? cachedMask[idx - 1] : v;
        const d = ny + 1 < h ? cachedMask[idx + w] : v;
        const u = ny > 0 ? cachedMask[idx - w] : v;
        if (v === r && v === l && v === d && v === u) continue;
        const dist = dx * dx + dy * dy;
        if (dist < bestDist) {
          bestDist = dist;
          bestX = nx;
          bestY = ny;
        }
      }
    }
    return { x: bestX, y: bestY };
  }

  // ---------- Detection ----------
  function autoDetect() {
    if (!canvasEl || !imgEl) return;
    isDetecting = true;
    const ctx = canvasEl.getContext("2d");
    if (!ctx) {
      isDetecting = false;
      return;
    }
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    ctx.drawImage(imgEl, 0, 0);
    const { width, height } = canvasEl;
    const imgData = ctx.getImageData(0, 0, width, height);

    const gray = buildGrayscale(imgData);
    const blurred = gaussianBlur(gray, width, height, blurSigma);

    let rawMask: Uint8Array;
    if (thresholdMode === "adaptive") {
      // Local threshold reports its own "effective" value as null because
      // every pixel has its own implicit threshold; UI just shows "local".
      detectedThreshold = null;
      rawMask = adaptiveLocalThreshold(
        blurred,
        width,
        height,
        adaptiveWindow | 1, // force odd window so it stays symmetric
        adaptiveBias,
        invertThreshold,
      );
    } else {
      const computedThreshold =
        thresholdMode === "otsu"
          ? smartOtsuThreshold(blurred, width, height, invertThreshold, minArea, maxArea)
          : manualThreshold;
      detectedThreshold = computedThreshold;
      rawMask = new Uint8Array(width * height);
      for (let i = 0; i < width * height; i++) {
        const above = blurred[i] >= computedThreshold;
        rawMask[i] = above !== invertThreshold ? 1 : 0;
      }
    }
    // Morphological close = dilate ∘ erode (fills gaps INSIDE blobs).
    const dilated1 = dilate(rawMask, width, height, closeRadius);
    const closed = erode(dilated1, width, height, closeRadius);
    // Morphological open = erode ∘ dilate (separates blobs joined by thin
    // bridges). Run AFTER close so we don't undo our own gap-filling.
    let processed = closed;
    if (openRadius > 0) {
      const eroded = erode(closed, width, height, openRadius);
      processed = dilate(eroded, width, height, openRadius);
    }

    // Two mask visualisations:
    // - maskImageData: opaque B/W (used by "replace" mode for inspection)
    // - overlayMaskImageData: colored alpha matte (used by "overlay" mode so
    //   the user sees mask + photo together — much better for tuning).
    const maskImg = ctx.createImageData(width, height);
    const overlayImg = ctx.createImageData(width, height);
    for (let i = 0; i < width * height; i++) {
      const v = processed[i] ? 255 : 0;
      maskImg.data[i * 4] = v;
      maskImg.data[i * 4 + 1] = v;
      maskImg.data[i * 4 + 2] = v;
      maskImg.data[i * 4 + 3] = 255;
      // Overlay paints foreground in cyan (works on both light & dark photos).
      if (processed[i]) {
        overlayImg.data[i * 4] = 34;
        overlayImg.data[i * 4 + 1] = 211;
        overlayImg.data[i * 4 + 2] = 238;
        overlayImg.data[i * 4 + 3] = 255;
      } else {
        overlayImg.data[i * 4 + 3] = 0;
      }
    }
    maskImageData = maskImg;
    overlayMaskImageData = overlayImg;
    cachedMask = processed;
    cachedMaskWidth = width;
    cachedMaskHeight = height;

    // Stack flood fill — track perimeter for circularity (trackpad detection).
    const labels = new Int32Array(width * height);
    const stack = new Int32Array(width * height);
    const detected: KeyShape[] = [];
    let currentId = nextId;
    const rejected = { tooSmall: 0, tooLarge: 0, badAspect: 0 };
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const seedIdx = y * width + x;
        if (!processed[seedIdx] || labels[seedIdx]) continue;
        let sp = 0;
        stack[sp++] = seedIdx;
        labels[seedIdx] = currentId;
        let area = 0;
        let sumX = 0;
        let sumY = 0;
        let perimeter = 0;
        const points: Array<[number, number]> = [];
        while (sp > 0) {
          const j = stack[--sp];
          area++;
          const jx = j % width;
          const jy = (j - jx) / width;
          sumX += jx;
          sumY += jy;
          points.push([jx, jy]);
          let boundary = false;
          if (jx > 0) {
            const k = j - 1;
            if (processed[k]) {
              if (!labels[k]) {
                labels[k] = currentId;
                stack[sp++] = k;
              }
            } else boundary = true;
          } else boundary = true;
          if (jx + 1 < width) {
            const k = j + 1;
            if (processed[k]) {
              if (!labels[k]) {
                labels[k] = currentId;
                stack[sp++] = k;
              }
            } else boundary = true;
          } else boundary = true;
          if (jy > 0) {
            const k = j - width;
            if (processed[k]) {
              if (!labels[k]) {
                labels[k] = currentId;
                stack[sp++] = k;
              }
            } else boundary = true;
          } else boundary = true;
          if (jy + 1 < height) {
            const k = j + width;
            if (processed[k]) {
              if (!labels[k]) {
                labels[k] = currentId;
                stack[sp++] = k;
              }
            } else boundary = true;
          } else boundary = true;
          if (boundary) perimeter++;
        }
        if (area < minArea) {
          rejected.tooSmall++;
          currentId++;
          continue;
        }
        if (area > maxArea) {
          rejected.tooLarge++;
          currentId++;
          continue;
        }
        const cx = sumX / area;
        const cy = sumY / area;
        const { angle, bounds } = fitRotatedRectangle(points, cx, cy);
        const sideU = bounds.maxU - bounds.minU;
        const sideV = bounds.maxV - bounds.minV;
        const ratio = Math.min(sideU, sideV) / Math.max(sideU, sideV);
        // Aspect filter is only enforced for "key" candidates; trackpads can
        // still be ~1:1 round so they'll pass too. PCB traces and wires
        // typically have ratio < 0.5, which we reject up front.
        if (ratio < Math.min(minAspect, 0.5)) {
          rejected.badAspect++;
          currentId++;
          continue;
        }
        const corners = cornersFromRect(cx, cy, angle, bounds);
        const sideLengthPx = (sideU + sideV) / 2;
        // Circularity: 4π·A / P². For a circle this is 1, for a square ≈0.785.
        const circularity = perimeter > 0 ? (4 * Math.PI * area) / (perimeter * perimeter) : 0;
        detected.push({
          id: currentId,
          pixelCount: area,
          perimeter,
          circularity,
          centroid: { x: cx, y: cy },
          rotationDeg: angle,
          sideLengthPx,
          corners,
          origin: "auto",
          kind: "key",
        });
        currentId++;
      }
    }

    // Dark-region trackpad pass: keys are bright, the trackpad surface is
    // dark and circular, so it never appears in the main-foreground mask.
    // Detect it separately and append to `detected` BEFORE classifyDetected
    // so its stats include the trackpad count.
    if (detected.length > 0) {
      const keyAreas = detected
        .filter((d) => d.kind === "key")
        .map((d) => d.pixelCount)
        .sort((a, b) => a - b);
      const medianArea =
        keyAreas.length > 0 ? keyAreas[Math.floor(keyAreas.length / 2)] : 0;
      // Dark cutoff: a bit brighter than the darkest 5% so we catch the
      // trackpad's surface but stay above ambient sensor noise.
      const histo = new Uint32Array(256);
      for (let i = 0; i < blurred.length; i++) histo[blurred[i]]++;
      let cumul = 0;
      let darkCutoff = 60;
      const fivePercent = blurred.length * 0.05;
      for (let i = 0; i < 256; i++) {
        cumul += histo[i];
        if (cumul >= fivePercent) {
          darkCutoff = Math.max(40, Math.min(100, i + 10));
          break;
        }
      }
      const result = detectTrackpads(
        blurred,
        width,
        height,
        medianArea,
        darkCutoff,
        currentId,
      );
      currentId = result.nextId;
      for (const tp of result.trackpads) detected.push(tp);
    }

    // Classify AFTER trackpad pass so detectionStats includes the trackpad
    // count, and the size-IQR outlier filter sees the full distribution.
    classifyDetected(detected, rejected);

    // Defer postClassify (snap + auto-label) until AFTER the merge below.
    // Running it on `detected` then merging old labels in would leave two
    // keys claiming the same label — the merge moves an old label onto a
    // matched detection, but un-matched detections keep their pre-merge
    // auto-label, so two blobs could both end up as e.g. "0,1". Running it
    // once on the final merged array guarantees one label per slot.

    // Preserve manually-added blobs and labels from the previous run by
    // matching nearest-centroid.
    const previous = blobs;
    const merged: KeyShape[] = [];
    const consumed = new Set<number>();
    for (const old of previous) {
      if (old.origin === "manual") {
        merged.push(old);
        continue;
      }
      // Carry over user-touched keys (labelled or explicitly unlabelled-and-locked).
      if (!old.label && !old.labelLocked) continue;
      // Find nearest new blob to old centroid
      let bestIdx = -1;
      let bestDist = Infinity;
      for (let i = 0; i < detected.length; i++) {
        if (consumed.has(i)) continue;
        const d = (detected[i].centroid.x - old.centroid.x) ** 2 + (detected[i].centroid.y - old.centroid.y) ** 2;
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      if (bestIdx !== -1 && Math.sqrt(bestDist) < detected[bestIdx].sideLengthPx) {
        consumed.add(bestIdx);
        merged.push({
          ...detected[bestIdx],
          label: old.label,
          labelLocked: old.labelLocked,
        });
      }
    }
    for (let i = 0; i < detected.length; i++) {
      if (consumed.has(i)) continue;
      merged.push(detected[i]);
    }
    // Run snap + auto-label ONCE on the final merged set so we end up with
    // exactly one key per (row,col) slot.
    postClassify(merged);
    blobs = merged;
    nextId = currentId + 1;
    redraw();
    isDetecting = false;
  }

  // ---------- Hit testing & interaction ----------
  function canvasCoords(event: PointerEvent | MouseEvent) {
    if (!canvasEl) return { x: 0, y: 0 };
    const rect = canvasEl.getBoundingClientRect();
    const scaleX = canvasEl.width / rect.width;
    const scaleY = canvasEl.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  function findCornerUnderPointer(p: Point): { blobId: number; cornerIndex: number } | null {
    if (selectedBlobId === null) return null;
    const blob = blobs.find((b) => b.id === selectedBlobId);
    if (!blob) return null;
    for (let i = 0; i < 4; i++) {
      const c = blob.corners[i];
      if (Math.hypot(c.x - p.x, c.y - p.y) <= 14) {
        return { blobId: blob.id, cornerIndex: i };
      }
    }
    return null;
  }

  function findBlobUnderPointer(p: Point): KeyShape | null {
    let closest: KeyShape | undefined;
    let closestDist = Infinity;
    for (const b of blobs) {
      const d = Math.hypot(b.centroid.x - p.x, b.centroid.y - p.y);
      if (d < closestDist) {
        closestDist = d;
        closest = b;
      }
    }
    if (!closest) return null;
    if (closestDist > closest.sideLengthPx) return null;
    return closest;
  }

  function recomputeFromCorners(corners: [Point, Point, Point, Point]) {
    const cx = (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4;
    const cy = (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4;
    const dx = corners[1].x - corners[0].x;
    const dy = corners[1].y - corners[0].y;
    const sideLengthPx = (Math.hypot(dx, dy) + Math.hypot(corners[2].x - corners[1].x, corners[2].y - corners[1].y)) / 2;
    const rotationDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    return { cx, cy, sideLengthPx, rotationDeg };
  }

  function handlePointerDown(event: PointerEvent) {
    if (!canvasEl) return;
    const p = canvasCoords(event);
    if (mode === "add") {
      // If the click lands inside an already-detected key, don't re-flood it
      // (the user's complaint: a single click on a bound key shouldn't blow
      // away its shape). Just select it. Use double-click to re-shape.
      const existing = blobs.find((b) => pointInPolygon(p, b.corners));
      if (existing) {
        selectedBlobId = existing.id;
        mode = "select";
        lastSmartAddNote = "";
        redraw();
        return;
      }
      // Smart 1-click add: flood from the click point in the cached mask.
      smartAdd(p);
      mode = "select";
      return;
    }
    // Select mode: first check corner-drag, then blob-click.
    const corner = findCornerUnderPointer(p);
    if (corner) {
      dragInfo = corner;
      canvasEl.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }
    const blob = findBlobUnderPointer(p);
    selectedBlobId = blob ? blob.id : null;
    redraw();
  }

  /**
   * Double-click → re-flood the clicked blob and replace its geometry.
   * Lets the user redo a wrong shape in one gesture rather than dragging
   * four corner handles back into place.
   */
  function handleDoubleClick(event: MouseEvent) {
    const p = canvasCoords(event);
    const blob = blobs.find((b) => pointInPolygon(p, b.corners));
    if (!blob) return;
    reshapeBlob(blob, p);
    event.preventDefault();
  }

  function handlePointerMove(event: PointerEvent) {
    if (!dragInfo) return;
    const raw = canvasCoords(event);
    // Snap to edge live so the user feels the magnet while they drag.
    const snapped = snapToEdge(raw, 14);
    blobs = blobs.map((b) => {
      if (b.id !== dragInfo!.blobId) return b;
      const corners = [...b.corners] as [Point, Point, Point, Point];
      corners[dragInfo!.cornerIndex] = snapped;
      const { cx, cy, sideLengthPx, rotationDeg } = recomputeFromCorners(corners);
      return { ...b, corners, centroid: { x: cx, y: cy }, sideLengthPx, rotationDeg };
    });
    redraw();
  }

  function handlePointerUp(event: PointerEvent) {
    // Only run the post-release corner-snap if the user was ACTUALLY
    // dragging a corner. A plain click is pointerdown→pointerup with no
    // drag in between, and we don't want to auto-resize the key just
    // because the user selected it. (User's note: single click on an
    // already-sized key shouldn't change its size; only double-click does.)
    const wasDragging = dragInfo !== null;
    if (wasDragging && canvasEl) canvasEl.releasePointerCapture(event.pointerId);
    dragInfo = null;
    if (wasDragging && selectedBlobId !== null) {
      blobs = blobs.map((b) => {
        if (b.id !== selectedBlobId) return b;
        const corners = b.corners.map((c) => snapToEdge(c, 10)) as [Point, Point, Point, Point];
        const { cx, cy, sideLengthPx, rotationDeg } = recomputeFromCorners(corners);
        return { ...b, corners, centroid: { x: cx, y: cy }, sideLengthPx, rotationDeg };
      });
      redraw();
    }
  }

  // ---------- Manual ops ----------
  function enterAddMode() {
    mode = "add";
    addClicks = [];
    selectedBlobId = null;
    redraw();
  }

  function cancelAddMode() {
    mode = "select";
    addClicks = [];
    redraw();
  }

  function deleteSelected() {
    if (selectedBlobId === null) return;
    blobs = blobs.filter((b) => b.id !== selectedBlobId);
    selectedBlobId = null;
    redraw();
  }

  function rotateSelected(deltaDeg: number) {
    if (selectedBlobId === null) return;
    blobs = blobs.map((b) => {
      if (b.id !== selectedBlobId) return b;
      const newAngle = b.rotationDeg + deltaDeg;
      const t = (newAngle * Math.PI) / 180;
      const tOld = (b.rotationDeg * Math.PI) / 180;
      const cos = Math.cos(t);
      const sin = Math.sin(t);
      // Reconstruct corners using current side length
      const half = b.sideLengthPx / 2;
      const corners: [Point, Point, Point, Point] = [
        { x: b.centroid.x - half * cos + half * sin, y: b.centroid.y - half * sin - half * cos },
        { x: b.centroid.x + half * cos + half * sin, y: b.centroid.y + half * sin - half * cos },
        { x: b.centroid.x + half * cos - half * sin, y: b.centroid.y + half * sin + half * cos },
        { x: b.centroid.x - half * cos - half * sin, y: b.centroid.y - half * sin + half * cos },
      ];
      void tOld;
      return { ...b, rotationDeg: newAngle, corners };
    });
    redraw();
  }

  /**
   * Inline label setter wired to the dropdown. Setting a label locks it
   * (`labelLocked: true`) so the auto-label pass won't clobber it on the
   * next re-run. Picking the same label as another key clears that other
   * key's label so we never have two keys claiming the same matrix slot.
   */
  function setLabel(blobId: number, newLabel: string) {
    const label = newLabel || undefined;
    blobs = blobs.map((b) => {
      if (b.id === blobId) return { ...b, label, labelLocked: true };
      if (label && b.label === label) return { ...b, label: undefined };
      return b;
    });
    // A locked grid label may flip the cluster membership of this blob
    // (manual blobs are included only when labelLocked + grid-format label),
    // so refresh classify + missing-detection here.
    classifyDetected(blobs);
    postClassify(blobs);
    blobs = [...blobs];
    redraw();
  }

  /** Remove the lock so the next auto-label pass can overwrite this key. */
  function unlockLabel(blobId: number) {
    blobs = blobs.map((b) => (b.id === blobId ? { ...b, labelLocked: false } : b));
    // Trigger one auto-label pass so the unlocked key gets refreshed now.
    if (autoLabel) {
      classifyDetected(blobs);
      postClassify(blobs);
      blobs = [...blobs];
    }
    redraw();
  }

  function clearLabels() {
    blobs = blobs.map((b) => ({ ...b, label: undefined, labelLocked: false }));
    redraw();
  }

  /**
   * Enter blank-canvas mode — no photo required. Sizes the canvas to a
   * sensible default, jumps the user into Add mode so the first click
   * places a key immediately. The user can save the result the same way
   * as a photo-traced layout.
   */
  function startBlank() {
    blankMode = true;
    if (imgUrl) {
      URL.revokeObjectURL(imgUrl);
      imgUrl = "";
    }
    blobs = [];
    selectedBlobId = null;
    detectedThreshold = null;
    maskImageData = null;
    overlayMaskImageData = null;
    cachedMask = null;
    cachedMaskWidth = 0;
    cachedMaskHeight = 0;
    detectionStats = null;
    detectedMissing = [];
    detectedKbAngle = null;
    detectedRightKbAngle = null;
    detectedLayout = null;
    lastSmartAddNote = "";
    addClicks = [];
    imgWidth = 900;
    imgHeight = 520;
    if (canvasEl) {
      canvasEl.width = imgWidth;
      canvasEl.height = imgHeight;
      const ctx = canvasEl.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#1c1916";
        ctx.fillRect(0, 0, imgWidth, imgHeight);
      }
    }
    mode = "add";
    redraw();
  }

  function resetAll() {
    blobs = [];
    selectedBlobId = null;
    detectedThreshold = null;
    maskImageData = null;
    overlayMaskImageData = null;
    addClicks = [];
    mode = "select";
    blankMode = false;
    if (imgUrl) {
      URL.revokeObjectURL(imgUrl);
      imgUrl = "";
    }
    imgWidth = 0;
    imgHeight = 0;
    // Clear ALL derived detection state so stale stats / ghosts don't
    // linger after a reset. Without this, the user sees "Fill missing
    // (N)" / "K keys" pills from the previous run even though nothing is
    // detected anymore.
    detectionStats = null;
    detectedMissing = [];
    detectedKbAngle = null;
    detectedRightKbAngle = null;
    detectedLayout = null;
    lastSmartAddNote = "";
    cachedMask = null;
    cachedMaskWidth = 0;
    cachedMaskHeight = 0;
    redraw();
  }

  // ---------- Presets ----------
  /**
   * Named tuning presets — each one sets every preprocessing knob so the
   * user can jump to a sensible starting point and then nudge from there.
   * Far easier than guessing 8 sliders blind on a fresh photo.
   */
  type Preset = {
    id: string;
    label: string;
    desc: string;
    apply: () => void;
  };
  const presets: Preset[] = [
    {
      id: "default",
      label: "Reset defaults",
      desc: "Balanced starting point — OTSU + light blur + small close.",
      apply: () => {
        thresholdMode = "otsu";
        manualThreshold = 180;
        adaptiveWindow = 31;
        adaptiveBias = 8;
        invertThreshold = false;
        blurSigma = 1.5;
        closeRadius = 2;
        openRadius = 0;
        minArea = 800;
        maxArea = 20000;
        minAspect = 0.6;
        outlierSizeIQRFactor = 1.5;
        trackpadCircularity = 0.78;
        trackpadAreaFactor = 2.5;
        isolationFactor = 2.8;
      },
    },
    {
      id: "light-keys-dark-bg",
      label: "Light keys on dark bg",
      desc: "White / cream keys on a dark mat — OTSU, no invert.",
      apply: () => {
        thresholdMode = "otsu";
        invertThreshold = false;
        blurSigma = 1.5;
        closeRadius = 2;
        openRadius = 1;
      },
    },
    {
      id: "dark-keys-light-bg",
      label: "Dark keys on light bg",
      desc: "Black keycaps on a desk — OTSU with invert.",
      apply: () => {
        thresholdMode = "otsu";
        invertThreshold = true;
        blurSigma = 1.5;
        closeRadius = 2;
        openRadius = 1;
      },
    },
    {
      id: "uneven-light",
      label: "Uneven lighting",
      desc: "Local threshold — handles photos with bright & dim sides.",
      apply: () => {
        thresholdMode = "adaptive";
        adaptiveWindow = 41;
        adaptiveBias = 10;
        blurSigma = 1.5;
        closeRadius = 2;
        openRadius = 1;
      },
    },
    {
      id: "split-bridges",
      label: "Split merged keys",
      desc: "Stronger open — separates touching blobs (use if keys are merging).",
      apply: () => {
        closeRadius = 1;
        openRadius = 3;
        minAspect = 0.55;
      },
    },
    {
      id: "fill-gaps",
      label: "Fill gaps in keys",
      desc: "Stronger close — fills holes in keycap surface (use if keys are split).",
      apply: () => {
        closeRadius = 4;
        openRadius = 0;
        blurSigma = 2;
      },
    },
  ];

  function applyPreset(p: Preset) {
    p.apply();
    // autoDetect re-fires via the realtime effect once values settle.
  }

  // ---------- KLE computation ----------
  const kleResults = $derived.by(() => {
    // Anchor: top-center of the left main grid (matches the auto-label rule).
    const anchorCol = Math.floor(colCount / 2);
    const anchorLabel = `0,${anchorCol}`;
    const anchor = blobs.find((b) => b.label === anchorLabel);
    if (!anchor) return null;
    const pxPerU = anchor.sideLengthPx;
    const rad = (-anchor.rotationDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const anchorKleX = anchorCol + 0.5;
    const anchorKleY = 0.5;
    return blobs
      .filter((b) => b.label && b.label !== anchorLabel)
      .sort((a, b) => {
        // Sort by matrix (row, col) so the table and the snippet read in
        // matrix order — left to right, top to bottom — which matches
        // the order users expect when scanning their wiring.
        const [ar, ac] = (a.label as string).split(",").map(Number);
        const [br, bc] = (b.label as string).split(",").map(Number);
        if (ar !== br) return ar - br;
        return ac - bc;
      })
      .map((b) => {
        const dx = b.centroid.x - anchor.centroid.x;
        const dy = b.centroid.y - anchor.centroid.y;
        const ux = dx * cos - dy * sin;
        const uy = dx * sin + dy * cos;
        const kleCx = anchorKleX + ux / pxPerU;
        const kleCy = anchorKleY + uy / pxPerU;
        const rot = b.rotationDeg - anchor.rotationDeg;
        const normRot = ((rot + 540) % 360) - 180;
        return {
          // Keep the blob's id so the `{#each}` key is unique even if the
          // user transiently has two keys claiming the same label.
          id: b.id,
          label: b.label as string,
          kleCenter: { x: kleCx, y: kleCy },
          rotation: normRot,
        };
      });
  });

  const snippet = $derived.by(() => {
    if (!kleResults || kleResults.length === 0) return "";
    return kleResults
      .map((r) => {
        const rad = (r.rotation * Math.PI) / 180;
        const ox = 0.5 * Math.cos(rad) - 0.5 * Math.sin(rad);
        const oy = 0.5 * Math.sin(rad) + 0.5 * Math.cos(rad);
        const tlx = r.kleCenter.x - ox;
        const tly = r.kleCenter.y - oy;
        return `[{ r: ${r.rotation.toFixed(2)}, rx: ${tlx.toFixed(3)}, ry: ${tly.toFixed(3)}, x: 0, y: 0 }, "${r.label}"],`;
      })
      .join("\n");
  });

  /**
   * Build a self-contained VIA v3 definition from the current detection.
   * The matrix size is inferred from all labels: max(row) + 1 rows, max(col)
   * + 1 cols. Anchor key gets its own KLE row; every other labelled key is
   * placed at its computed `rx`/`ry` with rotation `r`. Returns `null` if
   * no anchor + at least one other key is labelled.
   */
  function buildLayoutJson(name: string): Record<string, unknown> | null {
    if (!kleResults || kleResults.length === 0) return null;
    const anchorCol = Math.floor(colCount / 2);
    const anchorLabel = `0,${anchorCol}`;
    const anchor = blobs.find((b) => b.label === anchorLabel);
    if (!anchor) return null;
    let maxRow = 0;
    let maxCol = 0;
    const all = [...kleResults, { id: anchor.id, label: anchorLabel, kleCenter: { x: anchorCol + 0.5, y: 0.5 }, rotation: 0 }];
    for (const r of all) {
      const [row, col] = r.label.split(",").map(Number);
      if (row > maxRow) maxRow = row;
      if (col > maxCol) maxCol = col;
    }
    // KLE keymap: one entry per labelled key as a separate row with its
    // own rotation + absolute rx/ry. This mirrors the snippet format and
    // is what the existing catalog parser expects.
    const keymap: Array<unknown> = [];
    for (const r of all) {
      const rad = (r.rotation * Math.PI) / 180;
      const ox = 0.5 * Math.cos(rad) - 0.5 * Math.sin(rad);
      const oy = 0.5 * Math.sin(rad) + 0.5 * Math.cos(rad);
      const tlx = r.kleCenter.x - ox;
      const tly = r.kleCenter.y - oy;
      keymap.push([
        {
          r: Number(r.rotation.toFixed(2)),
          rx: Number(tlx.toFixed(3)),
          ry: Number(tly.toFixed(3)),
          x: 0,
          y: 0,
        },
        r.label,
      ]);
    }
    return {
      name: name || "Custom layout",
      vendorId: "0xFEED",
      productId: "0x0001",
      matrix: { rows: maxRow + 1, cols: maxCol + 1 },
      menus: [],
      layouts: { keymap },
    };
  }

  const LOCAL_LAYOUTS_KEY = "klakson.local-layouts.v1";

  function flashSaveBadge(state: "saved" | "updated" | "downloaded") {
    saveBadge = state;
    if (saveBadgeTimer) clearTimeout(saveBadgeTimer);
    saveBadgeTimer = setTimeout(() => {
      saveBadge = "";
    }, 1800);
  }

  /**
   * Persist the current layout to localStorage under
   * `LOCAL_LAYOUTS_KEY`. Stored as a map of `name → definition` so the
   * user can save multiple layouts and the workbench can list them.
   * Frictionless: no modals, no overwrite confirm — overwriting a
   * previous save with the same name is fine because the user can
   * always re-name before re-saving.
   */
  function saveLayoutLocally() {
    const name =
      layoutName.trim() ||
      `layout-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
    const def = buildLayoutJson(name);
    if (!def) return;
    try {
      const raw = localStorage.getItem(LOCAL_LAYOUTS_KEY);
      const map = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      // Capture BEFORE writing so the badge reflects what the action was
      // (saved a new entry vs. overwrote an existing one).
      const isUpdate = Object.prototype.hasOwnProperty.call(map, name);
      map[name] = def;
      localStorage.setItem(LOCAL_LAYOUTS_KEY, JSON.stringify(map));
      flashSaveBadge(isUpdate ? "updated" : "saved");
      if (!layoutName.trim()) layoutName = name;
      refreshSavedLayouts();
    } catch (err) {
      console.error("[trace] save failed", err);
    }
  }

  /** Permanently remove a saved layout from localStorage. */
  function deleteSavedLayout(name: string) {
    try {
      const raw = localStorage.getItem(LOCAL_LAYOUTS_KEY);
      const map = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      delete map[name];
      localStorage.setItem(LOCAL_LAYOUTS_KEY, JSON.stringify(map));
      refreshSavedLayouts();
    } catch (err) {
      console.error("[trace] delete saved layout failed", err);
    }
  }

  /** Download the layout as a standalone .json file. */
  function downloadLayoutJson() {
    const name =
      layoutName.trim() ||
      `layout-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
    const def = buildLayoutJson(name);
    if (!def) return;
    const blob = new Blob([JSON.stringify(def, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    flashSaveBadge("downloaded");
  }

  $effect(() => {
    void blobs;
    void selectedBlobId;
    void addClicks;
    void maskMode;
    void maskOpacity;
    void detectedMissing;
    // Track canvasEl too — when the user enters blank mode, the canvas
    // wasn't bound when startBlank set blankMode=true, so the initial
    // redraw inside startBlank ran with canvasEl=undefined. This effect
    // re-fires once Svelte commits the new <canvas> mount.
    void canvasEl;
    void imgWidth;
    void imgHeight;
    void blankMode;
    redraw();
  });

  // Realtime detection: re-run the pipeline whenever a preprocessing knob
  // changes. Debounced so dragging a slider doesn't queue dozens of runs.
  let detectTimer: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    // Dependency list — accessing each here registers them as reactive deps.
    void thresholdMode;
    void manualThreshold;
    void adaptiveWindow;
    void adaptiveBias;
    void invertThreshold;
    void blurSigma;
    void closeRadius;
    void openRadius;
    void minArea;
    void maxArea;
    void minAspect;
    if (!imgEl || imgWidth === 0) return;
    if (detectTimer) clearTimeout(detectTimer);
    detectionScheduled = true;
    detectTimer = setTimeout(() => {
      detectionScheduled = false;
      autoDetect();
    }, 220);
  });

  // Reclassify + re-align + re-auto-label when any non-pixel knob changes.
  // `untrack` keeps the blob read/write from registering as deps — otherwise
  // writing `blobs = [...blobs]` would re-trigger this effect → infinite loop
  // → Svelte's `effect_update_depth_exceeded`.
  $effect(() => {
    void outlierSizeIQRFactor;
    void trackpadCircularity;
    void trackpadAreaFactor;
    void isolationFactor;
    void rowCount;
    void colCount;
    void snapToColumns;
    void autoLabel;
    void mirrorColumns;
    untrack(() => {
      if (blobs.length === 0) return;
      classifyDetected(blobs);
      postClassify(blobs);
      blobs = [...blobs];
    });
  });

  onMount(() => {
    refreshSavedLayouts();
  });

  function handleKeydown(event: KeyboardEvent) {
    const tag = (event.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    switch (event.key.toLowerCase()) {
      case "a":
        enterAddMode();
        event.preventDefault();
        break;
      case "d":
      case "delete":
      case "backspace":
        if (selectedBlobId !== null) {
          deleteSelected();
          event.preventDefault();
        }
        break;
      case "escape":
        if (mode === "add") cancelAddMode();
        else selectedBlobId = null;
        redraw();
        event.preventDefault();
        break;
      case "r":
        autoDetect();
        event.preventDefault();
        break;
      case "m":
        // Cycle: off → overlay → replace → off
        maskMode = maskMode === "off" ? "overlay" : maskMode === "overlay" ? "replace" : "off";
        event.preventDefault();
        break;
      case "f":
        if (detectedMissing.length > 0) {
          fillMissingSlots();
          event.preventDefault();
        }
        break;
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<svelte:head>
  <title>Layout helper · Klakson</title>
</svelte:head>

<main class="trace-page bg-paper text-ink min-h-screen">
  <!-- Site-themed header that mirrors the workbench's Topbar shape, scaled
       down for this single-purpose tool. Brand on the left, tool label in
       the middle, "back to workbench" affordance on the right. -->
  <header
    class="grid items-center gap-3 h-[56px] px-[14px] border-b border-line bg-paper
      [grid-template-columns:auto_minmax(0,1fr)_max-content]"
  >
    <a href="/" class="contents" aria-label="Klakson workbench">
      <Brand />
    </a>
    <div class="flex items-center gap-2 min-w-0 text-ink-2">
      <Camera class="size-4 shrink-0" />
      <span class="font-mono text-[11px] uppercase tracking-[0.06em] truncate">
        Layout helper
      </span>
      <span class="font-mono text-[11px] text-ink-3 truncate max-[1100px]:hidden">
        Trace a photo or start blank.
      </span>
    </div>
    <a
      href="/"
      class="inline-flex items-center gap-1.5 rounded-md border border-line-2 bg-surface px-2.5 py-1.5
        font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2 transition-colors
        hover:bg-paper-2 hover:text-ink"
    >
      <ArrowLeft class="size-3.5" />
      <span class="max-[720px]:hidden">Back to workbench</span>
    </a>
  </header>

  <div class="trace-body px-[20px] py-[16px] max-w-[1600px] mx-auto">
    <!-- Compact inline help: one-liner with an expand toggle for the
         shortcut reference. Keeps the page focused on the canvas. -->
    <details class="trace-help mb-3 group">
      <summary
        class="cursor-pointer inline-flex items-center gap-2 text-[12px] text-ink-2 hover:text-ink select-none"
      >
        <Sparkles class="size-3.5 text-coral-ink" />
        <span>
          Pick a preset, tune the overlay mask, drag yellow corners to refine.
        </span>
        <span
          class="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-3
            group-open:hidden"
        >Shortcuts ▾</span>
        <span
          class="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-3
            hidden group-open:inline"
        >Hide ▴</span>
      </summary>
      <p class="mt-1.5 text-[11.5px] leading-[1.6] text-ink-3 font-sans pl-[22px]">
        <kbd>A</kbd> add · <kbd>D</kbd> delete · <kbd>R</kbd> re-detect ·
        <kbd>F</kbd> fill missing · <kbd>M</kbd> cycle mask · <kbd>Esc</kbd> cancel ·
        double-click a key to re-shape it.
      </p>
    </details>

  <div class="layout" class:single={!imgUrl && blobs.length === 0}>
    <section class="canvas-side">
      {#if !canvasReady}
        <!-- Empty state, redesigned to match the workbench's typographic
             gravity: massive uppercase hero on the left, prominent device-
             card-style actions in the middle, a saved-layouts list on the
             right that closes the loop on `Save`. Matches the 3-column
             editorial composition of the workbench's `NO BROWSER TRANSPORT`
             page. -->
        <div class="trace-landing" data-testid="trace-landing">
          <div class="landing-hero">
            <span class="landing-tag">Step 1 · Source</span>
            <h1 class="landing-h1">
              {#if savedLayoutNames.length > 0}Start or improve{:else}Create a layout{/if}
            </h1>
            <p class="landing-sub">
              Trace a photo of your keyboard, sculpt one from a blank canvas,
              or pick up an earlier draft. Saves stay on this device.
            </p>
            <div class="landing-chips">
              <span class="chip-dot"><i style="background: oklch(0.72 0.13 195)"></i> Local-only</span>
              <span class="chip-dot"><i style="background: oklch(0.82 0.13 155)"></i> No account</span>
              <span class="chip-dot"><i style="background: oklch(0.84 0.13 90)"></i> Export anywhere</span>
            </div>
          </div>

          <section class="landing-actions">
            <span class="landing-section-label">Available</span>
            <label class="device-card" data-testid="trace-source-photo">
              <span class="device-card-icon mono">IMG</span>
              <span class="device-card-body">
                <strong>Trace from photo</strong>
                <small>Auto-detects keys, columns, rotation, trackpad. Best for split keyboards.</small>
              </span>
              <span class="device-card-cta">Choose file</span>
              <input type="file" accept="image/*" onchange={handleFile} />
            </label>
            <button
              type="button"
              class="device-card"
              onclick={startBlank}
              data-testid="trace-start-blank"
            >
              <span class="device-card-icon mono">BLNK</span>
              <span class="device-card-body">
                <strong>Start blank</strong>
                <small>Click to place keys, label rows/cols, then save. No image needed.</small>
              </span>
              <span class="device-card-cta ghost">Open canvas</span>
            </button>
          </section>

          <aside class="landing-saved">
            <span class="landing-section-label">
              Your layouts
              {#if savedLayoutNames.length > 0}
                <span class="ls-count">({savedLayoutNames.length})</span>
              {/if}
            </span>
            {#if savedLayoutNames.length === 0}
              <p class="ls-empty">
                Saved layouts appear here. Save a draft to come back to it later.
              </p>
            {:else}
              <ul class="ls-list">
                {#each savedLayoutNames as name (name)}
                  <li class="ls-item">
                    <button
                      type="button"
                      class="ls-open"
                      onclick={() => loadSavedLayout(name)}
                      title="Open this layout for editing"
                    >
                      <Edit3 class="size-3.5 text-coral-ink shrink-0" />
                      <span class="ls-name">{name}</span>
                    </button>
                    <button
                      type="button"
                      class="ls-del"
                      onclick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete "${name}" from local layouts?`)) {
                          deleteSavedLayout(name);
                        }
                      }}
                      title="Delete this saved layout"
                      aria-label="Delete saved layout"
                    >
                      <Trash2 class="size-3" />
                    </button>
                  </li>
                {/each}
              </ul>
              <button
                type="button"
                class="ls-clear-all"
                onclick={() => {
                  if (confirm(`Delete all ${savedLayoutNames.length} saved layout${savedLayoutNames.length === 1 ? "" : "s"}? This can't be undone.`)) {
                    localStorage.removeItem(LOCAL_LAYOUTS_KEY);
                    refreshSavedLayouts();
                  }
                }}
                title="Clear every layout saved on this device"
              >
                Clear all
              </button>
            {/if}
          </aside>
        </div>
      {:else}
        <!-- Working state: condensed action bar. Layout name + save/download
             on the left (the primary user goal), tools to the right. -->
        <div class="controls actions">
          <label class="inline-flex items-center gap-1.5 text-[12px] text-ink-2">
            <span class="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-3"
              >Name</span
            >
            <input
              type="text"
              bind:value={layoutName}
              placeholder="my-layout"
              class="w-[160px] rounded-md border border-line-2 bg-surface px-2 py-1
                font-mono text-[12px] text-ink"
            />
          </label>
          <button
            type="button"
            onclick={saveLayoutLocally}
            disabled={!kleResults || kleResults.length === 0}
            class="save-btn"
            title={isUpdateSave
              ? `Overwrite the existing layout "${layoutName.trim()}" with the current canvas.`
              : "Save this layout to your browser. It'll appear in the start screen's 'Your layouts'."}
          >
            {saveBadge === "updated"
              ? "Updated!"
              : saveBadge === "saved"
                ? "Saved!"
                : isUpdateSave
                  ? "Update"
                  : "Save"}
          </button>
          <button
            type="button"
            onclick={downloadLayoutJson}
            disabled={!kleResults || kleResults.length === 0}
            title="Download as a JSON file you can drop into local-defs.ts or load anywhere."
          >
            {saveBadge === "downloaded" ? "Downloaded!" : "Download JSON"}
          </button>
          <span class="action-divider" aria-hidden="true"></span>
          <label class="file-swap inline-flex items-center gap-1.5 cursor-pointer">
            <span class="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-3">Photo</span>
            <input type="file" accept="image/*" onchange={handleFile} />
          </label>
          <button
            type="button"
            onclick={enterAddMode}
            disabled={!canvasReady}
            class:active={mode === "add"}
            title="Click on or near any key. Press A as a shortcut."
          >
            {mode === "add" ? "Click any key (Esc)" : "Add (A)"}
          </button>
          <button
            type="button"
            onclick={deleteSelected}
            disabled={selectedBlobId === null}
            title="Delete the selected key (D)"
          >Del (D)</button>
          <button type="button" onclick={() => rotateSelected(-1)} disabled={selectedBlobId === null}
            title="Rotate selected −1°">↺</button>
          <button type="button" onclick={() => rotateSelected(1)} disabled={selectedBlobId === null}
            title="Rotate selected +1°">↻</button>
          <span class="action-divider" aria-hidden="true"></span>
          <button type="button" onclick={autoDetect} disabled={!imgUrl} title="Re-run detection (R)"
            >Re-detect{isDetecting ? "…" : detectionScheduled ? " ⏳" : ""}</button
          >
          <button
            type="button"
            onclick={dropOutliers}
            disabled={!detectionStats || detectionStats.outliers === 0}
            title="Remove blobs flagged as outliers"
          >
            Drop outliers{detectionStats?.outliers ? ` (${detectionStats.outliers})` : ""}
          </button>
          <button
            type="button"
            onclick={fillMissingSlots}
            disabled={detectedMissing.length === 0}
            title="Fill predicted-missing slots (F)"
          >
            Fill missing{detectedMissing.length > 0 ? ` (${detectedMissing.length})` : ""}
          </button>
          <span class="action-divider" aria-hidden="true"></span>
          <button type="button" onclick={clearLabels} disabled={blobs.length === 0}>Clear labels</button>
          <button type="button" onclick={resetAll} disabled={blobs.length === 0 && !canvasReady}>Reset</button>
        </div>
      {/if}

      {#if canvasReady}
      <!-- Live stats row: always visible so the user sees the effect of every tweak. -->
      <div class="controls statsbar">
        {#if detectionStats}
          <span class="stat-pill ok">{detectionStats.keys} keys</span>
          <span class="stat-pill" class:hidden={detectionStats.trackpads === 0}
            >{detectionStats.trackpads} trackpad{detectionStats.trackpads === 1 ? "" : "s"}</span
          >
          <span class="stat-pill warn" class:hidden={detectionStats.outliers === 0}
            >{detectionStats.outliers} outlier{detectionStats.outliers === 1 ? "" : "s"}</span
          >
          {#if detectionStats.rejected.tooSmall + detectionStats.rejected.tooLarge + detectionStats.rejected.badAspect > 0}
            <span
              class="stat-pill dim"
              title={`Rejected before classification: ${detectionStats.rejected.tooSmall} too small · ${detectionStats.rejected.tooLarge} too large · ${detectionStats.rejected.badAspect} bad aspect`}
              >−{detectionStats.rejected.tooSmall +
                detectionStats.rejected.tooLarge +
                detectionStats.rejected.badAspect} filtered</span
            >
          {/if}
          <span class="stat-meta"
            >median {detectionStats.medianSidePx.toFixed(0)}px · spacing
            {detectionStats.medianSpacingPx.toFixed(0)}px{#if detectedLayout === "split" && detectedKbAngle !== null && detectedRightKbAngle !== null}
              · split (L {detectedKbAngle.toFixed(1)}° · R
              {detectedRightKbAngle.toFixed(1)}°){:else if detectedKbAngle !== null} · kb
              angle {detectedKbAngle.toFixed(1)}°{/if}</span
          >
        {:else}
          <span class="stat-meta">Load a photo to start detection.</span>
        {/if}
        <span class="spacer"></span>
        <label class="zoom-control"
          >Zoom
          <input type="range" min="0.25" max="2" step="0.05" bind:value={zoom} />
          <span class="zoom-value">{(zoom * 100).toFixed(0)}%</span></label
        >
      </div>

      <!-- View overlay control: cheap to keep visible, gives instant feedback. -->
      <div class="controls viewbar">
        <span class="small-label">Mask:</span>
        <div class="segmented">
          <button
            type="button"
            class:active={maskMode === "off"}
            onclick={() => (maskMode = "off")}
            title="Photo only"
          >Off</button>
          <button
            type="button"
            class:active={maskMode === "overlay"}
            onclick={() => (maskMode = "overlay")}
            title="Photo + colored mask (cyan = detected foreground). Best for tuning."
          >Overlay</button>
          <button
            type="button"
            class:active={maskMode === "replace"}
            onclick={() => (maskMode = "replace")}
            title="Pure B/W mask — useful for ignoring photo detail."
          >Replace</button>
        </div>
        {#if maskMode === "overlay"}
          <label
            >Opacity
            <input type="range" min="0.1" max="1" step="0.05" bind:value={maskOpacity} />
            {(maskOpacity * 100).toFixed(0)}%</label
          >
        {/if}
      </div>

      <div class="canvas-frame" style="max-height: 78vh">
        <div style="width: {imgWidth * zoom}px">
          <canvas
            bind:this={canvasEl}
            width={imgWidth || 300}
            height={imgHeight || 150}
            onpointerdown={handlePointerDown}
            onpointermove={handlePointerMove}
            onpointerup={handlePointerUp}
            ondblclick={handleDoubleClick}
            class:cursor-crosshair={mode === "add"}
            class:cursor-grab={!!dragInfo}
          ></canvas>
        </div>
      </div>
      {/if}
      {#if imgUrl}
        <img bind:this={imgEl} src={imgUrl} onload={onImageLoad} alt="" class="hidden-img" />
      {/if}
    </section>

    {#if imgUrl || blobs.length > 0}
    <aside class="output-side">
      <!-- Selected key card (only when something is selected) -->
      {#if selectedBlobId !== null}
        {@const b = blobs.find((bl) => bl.id === selectedBlobId)}
        {#if b}
          <div class="sk-card">
            <div class="sk-header">
              <span class="sk-title">
                {b.label ? `Key ${b.label}` : `#${b.id}`}
              </span>
              <span class="sk-kind sk-kind-{b.kind}">{b.kind}</span>
            </div>
            <p class="sk-meta">
              {b.pixelCount.toLocaleString()} px · {b.rotationDeg.toFixed(1)}° · side
              {b.sideLengthPx.toFixed(0)} px
            </p>
            {#if b.outlierReason}
              <p class="sk-warn">⚠ {b.outlierReason}</p>
            {/if}
            {#if lastSmartAddNote && b.id === selectedBlobId && b.origin === "manual"}
              <p class="sk-warn">ℹ {lastSmartAddNote}</p>
            {/if}
            <div class="label-row">
              <select
                value={b.label ?? ""}
                onchange={(e) =>
                  setLabel(b.id, (e.currentTarget as HTMLSelectElement).value)}
                title="Matrix label. Auto-label fills this in unless locked."
              >
                {#each labelOptions as opt (opt.value)}
                  <option value={opt.value}>{opt.desc}</option>
                {/each}
              </select>
              {#if b.labelLocked}
                <button
                  type="button"
                  class="lock-btn"
                  onclick={() => unlockLabel(b.id)}
                  title="Unlock label so auto-label can change it"
                  aria-label="Unlock label"
                >🔒</button>
              {:else if autoLabel}
                <span class="lock-hint" title="Auto-label is on">auto</span>
              {/if}
            </div>
            <p class="sk-tip">Double-click on canvas to re-shape · Drag yellow corners</p>
          </div>
        {/if}
      {/if}

      <!-- Tabbed sidebar: Setup / Detect / Output. Replaces the previous
           4 separate collapsible sections plus the always-on Legend +
           KLE output, which together made the right column a wall of
           controls. Tabs hide everything that's not currently relevant. -->
      <div class="sidebar-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={sidebarTab === "setup"}
          class:active={sidebarTab === "setup"}
          onclick={() => (sidebarTab = "setup")}
        >Setup</button>
        <button
          type="button"
          role="tab"
          aria-selected={sidebarTab === "detect"}
          class:active={sidebarTab === "detect"}
          onclick={() => (sidebarTab = "detect")}
        >Detect</button>
        <button
          type="button"
          role="tab"
          aria-selected={sidebarTab === "output"}
          class:active={sidebarTab === "output"}
          onclick={() => (sidebarTab = "output")}
          disabled={!kleResults || kleResults.length === 0}
        >Output{kleResults && kleResults.length > 0 ? ` (${kleResults.length})` : ""}</button>
      </div>

      <div class="sidebar-body" hidden={sidebarTab !== "setup"} role="tabpanel">
        <!-- Setup: rows / cols / mirror / snap / auto-label only. The
             advanced detector knobs (threshold, blur, close, open,
             min/max area, min aspect, cleanup) live under Detect. -->
        <label class="setup-row">
          Rows
          <input type="number" min="1" max="10" bind:value={rowCount} />
        </label>
        <label class="setup-row">
          Cols
          <input type="number" min="1" max="10" bind:value={colCount} />
        </label>
        <label class="setup-row"
          ><input type="checkbox" bind:checked={autoLabel} /> Auto-label rows/cols</label
        >
        <label class="setup-row"
          ><input type="checkbox" bind:checked={snapToColumns} /> Snap columns</label
        >
        <label class="setup-row"
          ><input type="checkbox" bind:checked={mirrorColumns} /> Mirror columns (right half)</label
        >
        {#if detectionStats}
          <p class="setup-stat">
            {detectionStats.keys} keys · {detectionStats.trackpads} trackpad{detectionStats.trackpads === 1 ? "" : "s"}
            · median {detectionStats.medianSidePx.toFixed(0)}px
            {#if detectedLayout === "split" && detectedKbAngle !== null && detectedRightKbAngle !== null}
              · split (L {detectedKbAngle.toFixed(1)}° · R {detectedRightKbAngle.toFixed(1)}°)
            {:else if detectedKbAngle !== null}
              · kb angle {detectedKbAngle.toFixed(1)}°
            {/if}
          </p>
        {/if}
      </div>

      <div class="sidebar-body" hidden={sidebarTab !== "detect"} role="tabpanel">
        <!-- Presets at the top — most users only ever need these. -->
        <p class="section-label">Preset</p>
        <div class="preset-grid">
          {#each presets as p (p.id)}
            <button
              type="button"
              class="preset-chip"
              onclick={() => applyPreset(p)}
              title={p.desc}
              disabled={!imgUrl && p.id !== "default"}
            >{p.label}</button>
          {/each}
        </div>

        <p class="section-label">Threshold</p>
        <div class="segmented">
          <button type="button" class:active={thresholdMode === "otsu"} onclick={() => (thresholdMode = "otsu")}
            >OTSU{detectedThreshold !== null && thresholdMode === "otsu" ? ` (${detectedThreshold})` : ""}</button>
          <button type="button" class:active={thresholdMode === "manual"} onclick={() => (thresholdMode = "manual")}
            >Manual</button>
          <button type="button" class:active={thresholdMode === "adaptive"} onclick={() => (thresholdMode = "adaptive")}
            >Adaptive</button>
        </div>
        {#if thresholdMode === "manual"}
          <label class="setup-row">
            Threshold
            <input type="range" min="20" max="240" bind:value={manualThreshold} />
            <span class="setup-val">{manualThreshold}</span>
          </label>
        {/if}
        {#if thresholdMode === "adaptive"}
          <label class="setup-row">
            Window
            <input type="range" min="9" max="121" step="2" bind:value={adaptiveWindow} />
            <span class="setup-val">{adaptiveWindow}px</span>
          </label>
          <label class="setup-row">
            Bias
            <input type="range" min="-20" max="40" step="1" bind:value={adaptiveBias} />
            <span class="setup-val">{adaptiveBias}</span>
          </label>
        {/if}
        <label class="setup-row"
          ><input type="checkbox" bind:checked={invertThreshold} /> Invert (dark keys)</label
        >

        <details class="adv-block">
          <summary>Advanced detection</summary>
          <label class="setup-row">
            Blur σ
            <input type="range" min="0" max="4" step="0.1" bind:value={blurSigma} />
            <span class="setup-val">{blurSigma.toFixed(1)}</span>
          </label>
          <label class="setup-row">
            Close r
            <input type="range" min="0" max="6" bind:value={closeRadius} />
            <span class="setup-val">{closeRadius}</span>
          </label>
          <label class="setup-row">
            Open r
            <input type="range" min="0" max="6" bind:value={openRadius} />
            <span class="setup-val">{openRadius}</span>
          </label>
          <label class="setup-row">
            Min area
            <input type="number" min="50" max="50000" step="50" bind:value={minArea} />
          </label>
          <label class="setup-row">
            Max area
            <input type="number" min="500" max="500000" step="500" bind:value={maxArea} />
          </label>
          <label class="setup-row">
            Min aspect
            <input type="range" min="0.3" max="1" step="0.05" bind:value={minAspect} />
            <span class="setup-val">{minAspect.toFixed(2)}</span>
          </label>
          <p class="section-label" style="margin-top:8px">Cleanup classifier</p>
          <label class="setup-row" title="Reject blobs outside Q1−k·IQR or Q3+k·IQR of the size distribution">
            Size IQR k
            <input type="range" min="0.5" max="3" step="0.1" bind:value={outlierSizeIQRFactor} />
            <span class="setup-val">{outlierSizeIQRFactor.toFixed(1)}</span>
          </label>
          <label class="setup-row" title="Min circularity for trackpad (1.0 = perfect circle)">
            Trackpad circ
            <input type="range" min="0.5" max="1" step="0.01" bind:value={trackpadCircularity} />
            <span class="setup-val">{trackpadCircularity.toFixed(2)}</span>
          </label>
          <label class="setup-row" title="Trackpad must be at least this many × median key size">
            Trackpad ×
            <input type="range" min="1.5" max="6" step="0.1" bind:value={trackpadAreaFactor} />
            <span class="setup-val">{trackpadAreaFactor.toFixed(1)}</span>
          </label>
          <label class="setup-row" title="Flag as isolated if nearest neighbour > N × median spacing">
            Isolation ×
            <input type="range" min="1.5" max="5" step="0.1" bind:value={isolationFactor} />
            <span class="setup-val">{isolationFactor.toFixed(1)}</span>
          </label>
        </details>
      </div>

      <div class="sidebar-body" hidden={sidebarTab !== "output"} role="tabpanel">
        {#if !kleResults || kleResults.length === 0}
          <p class="placeholder">Label R0C2 (anchor) plus at least one other key to enable export.</p>
        {:else}
          <p class="section-label">{kleResults.length + 1} labelled keys</p>
          <details class="adv-block" open>
            <summary>local-defs.ts snippet</summary>
            <div class="flex items-center justify-end mt-1">
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded-md border border-line-2 bg-surface px-2 py-1
                  font-mono text-[10px] uppercase tracking-[0.06em] text-ink-2 transition-colors
                  hover:bg-paper-2 hover:text-ink"
                onclick={async () => {
                  try {
                    await navigator.clipboard.writeText(snippet);
                    snippetCopied = true;
                    setTimeout(() => (snippetCopied = false), 1500);
                  } catch {
                    const el = document.createElement("textarea");
                    el.value = snippet;
                    document.body.appendChild(el);
                    el.select();
                    try { document.execCommand("copy"); snippetCopied = true; setTimeout(() => (snippetCopied = false), 1500); } finally { document.body.removeChild(el); }
                  }
                }}
              >{snippetCopied ? "Copied!" : "Copy"}</button>
            </div>
            <pre>{snippet}</pre>
          </details>
          <details class="adv-block">
            <summary>KLE table</summary>
            <table>
          <thead>
            <tr>
              <th>Label</th>
              <th>KLE center</th>
              <th>Rotation</th>
            </tr>
          </thead>
          <tbody>
            {#each kleResults as r (r.id)}
              <tr>
                <td>{r.label}</td>
                <td>({r.kleCenter.x.toFixed(3)}, {r.kleCenter.y.toFixed(3)})</td>
                <td>{r.rotation.toFixed(2)}°</td>
              </tr>
            {/each}
          </tbody>
        </table>
          </details>
        {/if}
      </div>
    </aside>
    {/if}
  </div>
  </div>
</main>

<style>
  .trace-page {
    /* Fallback typography when Tailwind theme tokens are unavailable.
       The Tailwind utilities (bg-paper, text-ink, min-h-screen) set the
       paper / ink colors and full-page height already. */
    font-family: var(--font-sans, system-ui);
  }
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 440px;
    gap: 16px;
  }
  .layout.single {
    /* No image yet — the right panel is hidden, so collapse the grid to
       a single column. Avoids leaving a 440px empty gutter beside the
       file picker / preset row. */
    grid-template-columns: 1fr;
  }
  @media (max-width: 1100px) {
    .layout {
      grid-template-columns: 1fr;
    }
  }
  .canvas-side {
    min-width: 0;
  }
  .output-side {
    position: sticky;
    top: 8px;
    align-self: start;
    max-height: calc(100vh - 16px);
    overflow: auto;
    padding: 14px;
    background: var(--color-paper-2, #f0ece4);
    border-radius: 8px;
  }
  /* Old h2/h3-based sidebar headings replaced by the tabbed sidebar. */
  .sidebar-tabs {
    display: flex;
    gap: 4px;
    padding: 4px;
    background: var(--color-paper-3, #ddd3bd);
    border-radius: 8px;
    margin-bottom: 12px;
  }
  .sidebar-tabs > button {
    flex: 1;
    padding: 6px 8px;
    border: 1px solid transparent;
    background: transparent;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    color: var(--color-ink-2, #4a4640);
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
  }
  .sidebar-tabs > button:hover:not(:disabled) {
    color: var(--color-ink, #181614);
  }
  .sidebar-tabs > button.active {
    background: var(--color-surface, #fbf7ee);
    border-color: var(--color-line-2, #ccc);
    color: var(--color-ink, #181614);
  }
  .sidebar-tabs > button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .sidebar-body {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .setup-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--color-ink-2, #4a4640);
  }
  .setup-row input[type="number"] {
    width: 64px;
    padding: 3px 6px;
    font: inherit;
    font-family: var(--font-mono, monospace);
    border: 1px solid var(--color-line-2, #ccc);
    border-radius: 4px;
    background: var(--color-surface, #fff);
  }
  .setup-row input[type="range"] {
    flex: 1;
  }
  .setup-val {
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    min-width: 40px;
    text-align: right;
    color: var(--color-ink-3, #888);
  }
  .setup-stat {
    margin: 8px 0 0;
    padding-top: 8px;
    border-top: 1px solid var(--color-line, rgba(0,0,0,0.06));
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    color: var(--color-ink-3, #888);
    line-height: 1.5;
  }
  .section-label {
    margin: 8px 0 4px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-ink-3, #888);
  }
  .preset-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 4px;
  }
  .adv-block {
    margin-top: 8px;
    padding: 8px;
    border: 1px solid var(--color-line, rgba(0,0,0,0.06));
    border-radius: 6px;
    background: var(--color-surface, #fff);
  }
  .adv-block > summary {
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-ink-3, #888);
    user-select: none;
  }
  .adv-block[open] > summary {
    margin-bottom: 8px;
  }
  .adv-block .setup-row {
    margin-top: 6px;
  }
  .sk-card {
    margin-bottom: 12px;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid var(--color-line-2, #ccc);
    background: var(--color-surface, #fff);
  }
  .sk-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }
  .sk-title {
    font-family: var(--font-mono, monospace);
    font-size: 13px;
    font-weight: 600;
    color: var(--color-ink, #181614);
  }
  .sk-kind {
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 2px 6px;
    border-radius: 999px;
    background: var(--color-paper-2, #f0ece4);
    color: var(--color-ink-2, #4a4640);
  }
  .sk-kind-trackpad {
    background: oklch(0.92 0.05 195);
    color: oklch(0.35 0.13 195);
  }
  .sk-kind-outlier {
    background: oklch(0.92 0.05 60);
    color: oklch(0.5 0.05 60);
  }
  .sk-meta {
    margin: 0 0 6px;
    font-size: 11px;
    color: var(--color-ink-3, #888);
    font-family: var(--font-mono, monospace);
  }
  .sk-warn {
    margin: 4px 0;
    font-size: 11px;
    color: #b45309;
  }
  .sk-tip {
    margin: 6px 0 0;
    font-size: 10px;
    color: var(--color-ink-3, #888);
    font-style: italic;
  }
  .placeholder {
    color: var(--color-ink-3, #888);
    font-style: italic;
    font-size: 12px;
  }
  .small {
    color: var(--color-ink-3, #888);
    font-size: 11px;
    line-height: 1.5;
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 12px;
    align-items: center;
    margin-bottom: 8px;
    padding: 10px;
    background: var(--color-paper-2, #f0ece4);
    border-radius: 8px;
    font-size: 12px;
  }
  .controls label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    /* Keep slider label + value + input on one line; the parent .controls
       wraps between items so this never overflows. */
    white-space: nowrap;
  }
  .small-label {
    font-weight: 600;
    color: var(--color-ink-2, #444);
  }
  kbd {
    display: inline-block;
    padding: 1px 6px;
    margin: 0 1px;
    border: 1px solid var(--color-line-2, #ccc);
    border-bottom-width: 2px;
    border-radius: 4px;
    background: var(--color-surface, #fff);
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    line-height: 1.3;
  }
  .statsbar {
    align-items: center;
    gap: 6px 10px;
    padding-block: 6px;
  }
  .statsbar .spacer {
    flex: 1;
  }
  .stat-pill {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 999px;
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    background: var(--color-surface, #fff);
    border: 1px solid var(--color-line-2, #ccc);
    color: var(--color-ink-2, #444);
  }
  .stat-pill.ok {
    background: #dcfce7;
    border-color: #22c55e;
    color: #166534;
  }
  .stat-pill.warn {
    background: #fef3c7;
    border-color: #f59e0b;
    color: #92400e;
  }
  .stat-pill.dim {
    background: #f3f4f6;
    border-color: #9ca3af;
    color: #4b5563;
  }
  .stat-pill.hidden {
    display: none;
  }
  .stat-meta {
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    color: var(--color-ink-3, #6b7280);
  }
  .zoom-control {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
  }
  .zoom-value {
    font-family: var(--font-mono, monospace);
    color: var(--color-ink-3, #6b7280);
    min-width: 36px;
    text-align: right;
  }
  .presets {
    gap: 6px;
    padding-block: 6px;
  }
  .preset-chip {
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 11px;
    border: 1px solid var(--color-line-2, #ccc);
    background: var(--color-surface, #fff);
    cursor: pointer;
  }
  .preset-chip:hover:not(:disabled) {
    background: #eef2ff;
    border-color: #6366f1;
  }
  .segmented {
    display: inline-flex;
    border: 1px solid var(--color-line-2, #ccc);
    border-radius: 6px;
    overflow: hidden;
    background: var(--color-surface, #fff);
  }
  .segmented button {
    padding: 4px 10px;
    border: none;
    border-right: 1px solid var(--color-line-2, #ccc);
    background: transparent;
    border-radius: 0;
    font-size: 11px;
    cursor: pointer;
  }
  .segmented button:last-child {
    border-right: none;
  }
  .segmented button.active {
    background: #6366f1;
    color: white;
  }
  .viewbar {
    align-items: center;
    padding-block: 6px;
  }
  .control-group {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .section {
    margin-bottom: 8px;
    padding: 0;
    background: var(--color-paper-2, #f0ece4);
    border-radius: 8px;
    border: 1px solid var(--color-line-2, #ddd);
  }
  /* The old `.section` collapsibles were replaced by the tabbed sidebar
     (.sidebar-tabs + .sidebar-body). Their styles are no longer needed. */
  button {
    padding: 6px 12px;
    border: 1px solid var(--color-line-2, #ccc);
    background: var(--color-surface, #fff);
    border-radius: 6px;
    cursor: pointer;
    font: inherit;
  }
  button.active {
    background: #a855f7;
    color: white;
    border-color: #a855f7;
  }
  .save-btn {
    background: var(--color-coral, #f97316);
    color: white;
    border-color: var(--color-coral-ink, #c2410c);
    font-weight: 600;
  }
  .save-btn:hover:not(:disabled) {
    background: var(--color-coral-ink, #c2410c);
  }
  .action-divider {
    display: inline-block;
    width: 1px;
    height: 22px;
    background: var(--color-line-2, #ccc);
    margin: 0 4px;
  }
  .file-swap input[type="file"] {
    max-width: 180px;
    font-size: 11px;
  }
  /* Trace landing — three-column editorial composition that mirrors
     the workbench's empty state, so the two pages feel like peers. */
  .trace-landing {
    display: grid;
    grid-template-columns: minmax(280px, 1.1fr) minmax(320px, 1fr) minmax(220px, 0.8fr);
    gap: 32px;
    align-items: start;
    margin-top: 24px;
    padding: 16px 8px;
  }
  @media (max-width: 980px) {
    .trace-landing {
      grid-template-columns: 1fr;
      gap: 20px;
    }
  }
  .landing-hero {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .landing-tag {
    align-self: flex-start;
    padding: 4px 10px;
    border: 1px solid var(--color-line-2, #ccc);
    border-radius: 999px;
    background: var(--color-paper-2, #f0ece4);
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-ink-3, #888);
  }
  .landing-h1 {
    margin: 0;
    font-family: var(--font-mono, "Departure Mono", monospace);
    font-weight: 700;
    font-size: clamp(48px, 6.5vw, 80px);
    line-height: 0.95;
    letter-spacing: -0.02em;
    text-transform: uppercase;
    color: var(--color-ink, #181614);
  }
  .landing-sub {
    margin: 4px 0 0;
    max-width: 38ch;
    font-size: 13px;
    line-height: 1.55;
    color: var(--color-ink-2, #4a4640);
  }
  .landing-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 4px;
  }
  .chip-dot {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--color-paper-2, #f0ece4);
    border: 1px solid var(--color-line, rgba(0,0,0,0.06));
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    color: var(--color-ink-2, #4a4640);
  }
  .chip-dot i {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 999px;
  }
  .landing-section-label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-ink-3, #888);
    margin-bottom: 10px;
  }
  .ls-count {
    font-size: 10px;
    color: var(--color-ink-3, #888);
    opacity: 0.75;
  }
  .landing-actions {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  /* Device-card style matching the workbench's connect cards: big,
     clickable, with icon · title+sub · CTA layout. */
  .device-card {
    display: grid;
    grid-template-columns: 56px minmax(0, 1fr) auto;
    align-items: center;
    gap: 14px;
    width: 100%;
    padding: 14px 16px;
    border-radius: 12px;
    border: 1px solid var(--color-line-2, #ccc);
    background: var(--color-surface, #fbf7ee);
    color: var(--color-ink, #181614);
    text-align: left;
    cursor: pointer;
    transition: border-color 0.15s, transform 0.15s, box-shadow 0.15s;
  }
  .device-card:hover {
    border-color: var(--color-coral-soft, oklch(0.82 0.14 30));
    transform: translateY(-1px);
    box-shadow: 0 6px 20px -10px oklch(0.45 0.16 30 / 0.18);
  }
  .device-card-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border-radius: 10px;
    background: var(--color-paper-2, #f0ece4);
    color: var(--color-ink-2, #4a4640);
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
  }
  .device-card-body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .device-card-body strong {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-ink, #181614);
  }
  .device-card-body small {
    font-size: 11.5px;
    color: var(--color-ink-3, #888);
    line-height: 1.45;
    /* Let copy wrap rather than ellipsis — cards have room. */
    white-space: normal;
    overflow: visible;
    text-overflow: clip;
  }
  .device-card-cta {
    padding: 6px 12px;
    border-radius: 999px;
    background: var(--color-coral, oklch(0.72 0.18 30));
    color: white;
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    white-space: nowrap;
  }
  .device-card-cta.ghost {
    background: transparent;
    color: var(--color-coral-ink, oklch(0.45 0.16 30));
    border: 1px solid var(--color-coral-soft, oklch(0.82 0.14 30));
  }
  .device-card input[type="file"] {
    /* Hide the native input — the entire card is the click target. */
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0,0,0,0);
    border: 0;
  }
  .landing-saved {
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .ls-empty {
    margin: 0;
    padding: 12px;
    border-radius: 10px;
    border: 1px dashed var(--color-line-2, #ccc);
    background: var(--color-paper-2, #f0ece4);
    font-size: 11.5px;
    line-height: 1.5;
    color: var(--color-ink-3, #888);
  }
  .ls-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 320px;
    overflow: auto;
  }
  .ls-item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 6px;
    padding: 0;
    border-radius: 8px;
    border: 1px solid transparent;
    transition: border-color 0.1s, background 0.1s;
  }
  .ls-item:hover {
    border-color: var(--color-line-2, #ccc);
    background: var(--color-surface, #fff);
  }
  .ls-open {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    background: transparent;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font: inherit;
    text-align: left;
    color: var(--color-ink, #181614);
    min-width: 0;
  }
  .ls-name {
    font-family: var(--font-mono, monospace);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ls-del {
    padding: 6px;
    background: transparent;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    color: var(--color-ink-3, #888);
    opacity: 0;
    transition: opacity 0.1s, color 0.1s;
  }
  .ls-item:hover .ls-del {
    opacity: 1;
  }
  .ls-del:hover {
    color: var(--color-coral-ink, oklch(0.45 0.16 30));
  }
  .ls-clear-all {
    align-self: flex-end;
    margin-top: 10px;
    padding: 4px 8px;
    background: transparent;
    border: none;
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-ink-3, #888);
    cursor: pointer;
    border-bottom: 1px dashed var(--color-line-2, #ccc);
    transition: color 0.1s, border-color 0.1s;
  }
  .ls-clear-all:hover {
    color: var(--color-coral-ink, oklch(0.45 0.16 30));
    border-bottom-color: var(--color-coral-soft, oklch(0.82 0.14 30));
  }
  button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .canvas-frame {
    overflow: auto;
    border: 1px solid var(--color-line-2, #ddd);
    border-radius: 8px;
    background: #222;
  }
  canvas {
    display: block;
    cursor: default;
    touch-action: none;
    width: 100%;
    height: auto;
  }
  canvas.cursor-crosshair {
    cursor: crosshair;
  }
  canvas.cursor-grab {
    cursor: grabbing;
  }
  .hidden-img {
    display: none;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-family: var(--font-mono, monospace);
    font-size: 12px;
  }
  th,
  td {
    text-align: left;
    padding: 4px 8px;
    border-bottom: 1px solid var(--color-line, #ddd);
  }
  pre {
    background: var(--color-ink, #181614);
    color: var(--color-paper, #f4efe6);
    padding: 10px;
    border-radius: 6px;
    font-size: 11px;
    overflow: auto;
    white-space: pre-wrap;
  }
  select {
    width: 100%;
    margin-top: 4px;
    padding: 4px;
    font: inherit;
  }
  .label-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
  }
  .label-row select {
    flex: 1;
    margin-top: 0;
  }
  .label-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--color-ink-2, #444);
  }
  .lock-btn {
    padding: 4px 8px;
    font-size: 14px;
    line-height: 1;
    border: 1px solid var(--color-line-2, #ccc);
    background: var(--color-surface, #fff);
    border-radius: 6px;
    cursor: pointer;
  }
  .lock-hint {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-ink-3, #888);
    padding: 2px 6px;
    border-radius: 4px;
    background: var(--color-paper, #f4efe6);
  }
</style>
