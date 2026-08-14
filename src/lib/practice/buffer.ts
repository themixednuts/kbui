import { Data, Effect } from "effect";

import {
  BufferAtom,
  IndentStyle,
  type BufferCursor,
  type IndentKey,
  type IndentPolicy,
  type IndentWidth,
  type KeyStroke as KeyStrokeT,
  type PracticeScript,
} from "./contracts";

export interface BufferDocument {
  readonly atoms: readonly BufferAtom[];
  readonly indentUnitWidth: IndentWidth;
  readonly indentPolicy: IndentPolicy;
}

export interface IndentDetectState {
  readonly locked: IndentStyle | undefined;
  readonly pendingSpaces: number;
}

export type IndentEventPayload = {
  readonly units: number;
  readonly style: IndentStyle;
  readonly key: IndentKey;
  readonly correct: boolean;
};

export type CharEventPayload = {
  readonly expected: string;
  readonly observed: string;
  readonly correct: boolean;
};

export type BufferAdvanceResult = Data.TaggedEnum<{
  Advanced: {
    readonly atomIndex: number;
    readonly cursor: BufferCursor;
    readonly indent: IndentDetectState;
    readonly event:
      | ({ readonly _tag: "CharTyped" } & CharEventPayload)
      | ({ readonly _tag: "IndentResolved" } & IndentEventPayload);
  };
  Miss: {
    readonly indent: IndentDetectState;
    readonly event:
      | ({ readonly _tag: "CharTyped" } & CharEventPayload)
      | ({ readonly _tag: "IndentResolved" } & IndentEventPayload);
  };
  PendingIndent: {
    readonly indent: IndentDetectState;
  };
}>;

export const BufferAdvanceResult = Data.taggedEnum<BufferAdvanceResult>();

/**
 * Compile source lines into semantic atoms.
 * Leading spaces group by `indentUnitWidth` into Indent units; tabs → one unit each.
 */
export const compileBufferDocument = Effect.fn("Practice.compileBufferDocument")(function* (
  script: PracticeScript,
) {
  const atoms: BufferAtom[] = [];
  const width = script.indentUnitWidth;

  for (let row = 0; row < script.lines.length; row++) {
    const line = script.lines[row] ?? "";
    let i = 0;
    let indentUnits = 0;

    while (i < line.length) {
      const ch = line[i]!;
      if (ch === "\t") {
        indentUnits += 1;
        i += 1;
        continue;
      }
      if (ch === " ") {
        let spaces = 0;
        while (i < line.length && line[i] === " ") {
          spaces += 1;
          i += 1;
        }
        if (spaces % width !== 0) {
          indentUnits += Math.floor(spaces / width);
          for (let s = 0; s < spaces % width; s++) {
            atoms.push(BufferAtom.cases.Char.make({ char: " " }));
          }
        } else {
          indentUnits += spaces / width;
        }
        continue;
      }
      break;
    }

    if (indentUnits > 0) {
      atoms.push(BufferAtom.cases.Indent.make({ units: indentUnits }));
    }

    for (; i < line.length; i++) {
      atoms.push(BufferAtom.cases.Char.make({ char: line[i]! }));
    }

    if (row < script.lines.length - 1) {
      atoms.push(BufferAtom.cases.Newline.make({}));
    }
  }

  return {
    atoms,
    indentUnitWidth: width,
    indentPolicy: script.indentPolicy,
  } satisfies BufferDocument;
});

export const initialIndentState = Effect.fn("Practice.initialIndentState")(function* (
  policy: IndentPolicy,
) {
  if (policy._tag === "Fixed") {
    return { locked: policy.style, pendingSpaces: 0 } satisfies IndentDetectState;
  }
  return { locked: undefined, pendingSpaces: 0 } satisfies IndentDetectState;
});

/**
 * Visual columns for an indent run in the practice buffer.
 * Always uses space-width columns so locking Tabs vs Spaces never collapses layout.
 */
export const indentDisplayWidth = Effect.fn("Practice.indentDisplayWidth")(function* (
  units: number,
  _style: IndentStyle | undefined,
  candidateWidth: IndentWidth,
) {
  return units * candidateWidth;
});

export const cursorAfterAtoms = Effect.fn("Practice.cursorAfterAtoms")(function* (
  atoms: readonly BufferAtom[],
  atomIndex: number,
  style: IndentStyle | undefined,
  candidateWidth: IndentWidth,
) {
  let row = 0;
  let col = 0;
  const limit = Math.min(atomIndex, atoms.length);
  for (let i = 0; i < limit; i++) {
    const atom = atoms[i]!;
    switch (atom._tag) {
      case "Char":
        col += 1;
        break;
      case "Indent":
        col += yield* indentDisplayWidth(atom.units, style, candidateWidth);
        break;
      case "Newline":
        row += 1;
        col = 0;
        break;
      default: {
        const _exhaustive: never = atom;
        return _exhaustive;
      }
    }
  }
  return { row, col } satisfies BufferCursor;
});

function observedFromStroke(stroke: KeyStrokeT): string {
  return KeyStrokeTMatch(stroke);
}

function KeyStrokeTMatch(stroke: KeyStrokeT): string {
  switch (stroke._tag) {
    case "Char":
      return stroke.char;
    case "Space":
      return " ";
    case "Tab":
      return "Tab";
    case "Enter":
      return "Enter";
    case "Backspace":
      return "Backspace";
    default: {
      const _exhaustive: never = stroke;
      return _exhaustive;
    }
  }
}

function candidateWidth(policy: IndentPolicy): IndentWidth {
  return policy._tag === "Detect"
    ? policy.candidateWidth
    : policy.style._tag === "Spaces"
      ? policy.style.width
      : 4;
}

function effectiveStyle(policy: IndentPolicy, indent: IndentDetectState): IndentStyle | undefined {
  if (indent.locked) return indent.locked;
  if (policy._tag === "Fixed") return policy.style;
  return undefined;
}

export const advanceBufferAtom = Effect.fn("Practice.advanceBufferAtom")(function* (input: {
  readonly document: BufferDocument;
  readonly atomIndex: number;
  readonly indent: IndentDetectState;
  readonly stroke: KeyStrokeT;
}) {
  const { document, atomIndex, stroke } = input;
  let indent = input.indent;
  const atom = document.atoms[atomIndex];
  if (!atom) {
    return BufferAdvanceResult.Miss({
      indent,
      event: {
        _tag: "CharTyped",
        expected: "∅",
        observed: observedFromStroke(stroke),
        correct: false,
      },
    });
  }

  const width = candidateWidth(document.indentPolicy);
  const style = effectiveStyle(document.indentPolicy, indent);

  switch (atom._tag) {
    case "Char": {
      const want = atom.char;
      const got =
        stroke._tag === "Char" ? stroke.char : stroke._tag === "Space" ? " " : observedFromStroke(stroke);
      if (got !== want) {
        return BufferAdvanceResult.Miss({
          indent: { ...indent, pendingSpaces: 0 },
          event: { _tag: "CharTyped", expected: want, observed: got, correct: false },
        });
      }
      return BufferAdvanceResult.Advanced({
        atomIndex: atomIndex + 1,
        cursor: yield* cursorAfterAtoms(document.atoms, atomIndex + 1, style, width),
        indent: { ...indent, pendingSpaces: 0 },
        event: { _tag: "CharTyped", expected: want, observed: got, correct: true },
      });
    }
    case "Newline": {
      if (stroke._tag !== "Enter") {
        return BufferAdvanceResult.Miss({
          indent: { ...indent, pendingSpaces: 0 },
          event: {
            _tag: "CharTyped",
            expected: "↵",
            observed: observedFromStroke(stroke),
            correct: false,
          },
        });
      }
      return BufferAdvanceResult.Advanced({
        atomIndex: atomIndex + 1,
        cursor: yield* cursorAfterAtoms(document.atoms, atomIndex + 1, style, width),
        indent: { ...indent, pendingSpaces: 0 },
        event: { _tag: "CharTyped", expected: "↵", observed: "Enter", correct: true },
      });
    }
    case "Indent":
      return yield* advanceIndent({
        atom,
        atomIndex,
        document,
        indent,
        stroke,
        width,
      });
    default: {
      const _exhaustive: never = atom;
      return _exhaustive;
    }
  }
});

const advanceIndent = Effect.fn("Practice.advanceIndent")(function* (input: {
  atom: Extract<BufferAtom, { _tag: "Indent" }>;
  atomIndex: number;
  document: BufferDocument;
  indent: IndentDetectState;
  stroke: KeyStrokeT;
  width: IndentWidth;
}) {
  const { atom, atomIndex, document, stroke, width } = input;
  let indent = input.indent;
  const policy = document.indentPolicy;

  if (stroke._tag === "Tab") {
    const nextStyle: IndentStyle =
      indent.locked ??
      (policy._tag === "Fixed" ? policy.style : IndentStyle.cases.Tabs.make({}));
    if (nextStyle._tag === "Spaces") {
      return BufferAdvanceResult.Miss({
        indent: { ...indent, pendingSpaces: 0 },
        event: {
          _tag: "IndentResolved",
          units: atom.units,
          style: nextStyle,
          key: "Tab",
          correct: false,
        },
      });
    }
    const locked = indent.locked ?? nextStyle;
    return BufferAdvanceResult.Advanced({
      atomIndex: atomIndex + 1,
      cursor: yield* cursorAfterAtoms(document.atoms, atomIndex + 1, locked, width),
      indent: { locked, pendingSpaces: 0 },
      event: {
        _tag: "IndentResolved",
        units: atom.units,
        style: locked,
        key: "Tab",
        correct: true,
      },
    });
  }

  if (stroke._tag === "Space") {
    const spacesStyle: IndentStyle =
      indent.locked ??
      (policy._tag === "Fixed" && policy.style._tag === "Spaces"
        ? policy.style
        : IndentStyle.cases.Spaces.make({ width }));

    if (indent.locked?._tag === "Tabs" || (policy._tag === "Fixed" && policy.style._tag === "Tabs")) {
      return BufferAdvanceResult.Miss({
        indent: { ...indent, pendingSpaces: 0 },
        event: {
          _tag: "IndentResolved",
          units: atom.units,
          style: IndentStyle.cases.Tabs.make({}),
          key: "Space",
          correct: false,
        },
      });
    }

    const spaceWidth = spacesStyle._tag === "Spaces" ? spacesStyle.width : width;
    const needed = atom.units * spaceWidth;
    const pending = indent.pendingSpaces + 1;

    if (pending < needed) {
      return BufferAdvanceResult.PendingIndent({
        indent: { locked: indent.locked ?? spacesStyle, pendingSpaces: pending },
      });
    }

    const locked = indent.locked ?? spacesStyle;
    return BufferAdvanceResult.Advanced({
      atomIndex: atomIndex + 1,
      cursor: yield* cursorAfterAtoms(document.atoms, atomIndex + 1, locked, width),
      indent: { locked, pendingSpaces: 0 },
      event: {
        _tag: "IndentResolved",
        units: atom.units,
        style: locked,
        key: "Space",
        correct: true,
      },
    });
  }

  return BufferAdvanceResult.Miss({
    indent: { ...indent, pendingSpaces: 0 },
    event: {
      _tag: "CharTyped",
      expected: "⇥",
      observed: observedFromStroke(stroke),
      correct: false,
    },
  });
});

export interface BufferCell {
  readonly id: string;
  readonly kind: "char" | "indent" | "newline";
  readonly display: string;
  readonly atomIndex: number;
}

/** Monkeytype-style render cells — spaces/indent keep stable `ch` width (no mid-session collapse). */
export const bufferCells = Effect.fn("Practice.bufferCells")(function* (
  document: BufferDocument,
  style: IndentStyle | undefined,
) {
  const width = candidateWidth(document.indentPolicy);
  const cells: BufferCell[] = [];
  for (let atomIndex = 0; atomIndex < document.atoms.length; atomIndex++) {
    const atom = document.atoms[atomIndex]!;
    switch (atom._tag) {
      case "Char":
        cells.push({
          id: `a${atomIndex}`,
          kind: "char",
          // Keep real space glyphs so mono metrics stay stable (no · substitution).
          display: atom.char,
          atomIndex,
        });
        break;
      case "Indent": {
        const dispWidth = yield* indentDisplayWidth(atom.units, style, width);
        for (let i = 0; i < dispWidth; i++) {
          cells.push({
            id: `a${atomIndex}-${i}`,
            kind: "indent",
            display: " ",
            atomIndex,
          });
        }
        break;
      }
      case "Newline":
        cells.push({ id: `a${atomIndex}`, kind: "newline", display: "\n", atomIndex });
        break;
      default: {
        const _exhaustive: never = atom;
        return _exhaustive;
      }
    }
  }
  return cells;
});
