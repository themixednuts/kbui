#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont


DEFAULT_SOURCE = Path("resources/fonts/material-symbols-outlined.full.woff2")
DEFAULT_OUTPUT = Path("static/fonts/material-symbols-outlined.woff2")
DEFAULT_ICON_LIST = Path("scripts/material-symbols-used.txt")

FIXED_AXES = {
    "FILL": 0.0,
    "wght": 400.0,
    "GRAD": 0.0,
    "opsz": 24.0,
}
LAYOUT_FEATURES = ["rlig", "rclt", "liga", "calt"]


def read_icon_names(path: Path) -> list[str]:
    names: list[str] = []
    seen: set[str] = set()
    for line_number, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if not line.replace("_", "").isalnum():
            raise ValueError(f"{path}:{line_number}: invalid icon name {line!r}")
        if line not in seen:
            seen.add(line)
            names.append(line)
    if not names:
        raise ValueError(f"{path}: no icon names found")
    return names


def ligature_name(font: TTFont, first: str, components: list[str]) -> str | None:
    reverse_cmap = {glyph: chr(codepoint) for codepoint, glyph in font.getBestCmap().items()}
    chars = [reverse_cmap.get(first), *(reverse_cmap.get(component) for component in components)]
    if any(char is None for char in chars):
        return None
    return "".join(char for char in chars if char is not None)


def ligature_map(font: TTFont) -> dict[str, str]:
    substitutions: dict[str, str] = {}
    if "GSUB" not in font:
        return substitutions

    for lookup in font["GSUB"].table.LookupList.Lookup:
        for subtable in lookup.SubTable:
            target = getattr(subtable, "ExtSubTable", None) or subtable
            if not hasattr(target, "ligatures"):
                continue
            for first, ligatures in target.ligatures.items():
                for ligature in ligatures:
                    name = ligature_name(font, first, ligature.Component)
                    if name:
                        substitutions[name] = ligature.LigGlyph
    return substitutions


def prune_ligatures(font: TTFont, keep_names: set[str]) -> int:
    if "GSUB" not in font:
        return 0

    removed = 0
    for lookup in font["GSUB"].table.LookupList.Lookup:
        for subtable in lookup.SubTable:
            target = getattr(subtable, "ExtSubTable", None) or subtable
            if not hasattr(target, "ligatures"):
                continue
            for first in list(target.ligatures.keys()):
                kept = []
                for ligature in target.ligatures[first]:
                    name = ligature_name(font, first, ligature.Component)
                    if name in keep_names:
                        kept.append(ligature)
                    else:
                        removed += 1
                if kept:
                    target.ligatures[first] = kept
                else:
                    del target.ligatures[first]
    return removed


def subset_font(source: Path, output: Path, icon_names: list[str]) -> tuple[int, int, int]:
    source_font = TTFont(source)
    source_ligatures = ligature_map(source_font)
    missing = [name for name in icon_names if name not in source_ligatures]
    if missing:
        raise ValueError(
            "source font is missing Material Symbols ligatures: " + ", ".join(missing),
        )

    icon_glyphs = [source_ligatures[name] for name in icon_names]

    font = TTFont(source)
    font = instantiateVariableFont(font, FIXED_AXES, inplace=False, optimize=True)
    pruned = prune_ligatures(font, set(icon_names))

    options = subset.Options()
    options.flavor = "woff2"
    options.glyph_names = True
    options.layout_closure = False
    options.layout_features = LAYOUT_FEATURES
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.name_legacy = False
    options.notdef_glyph = True
    options.notdef_outline = True
    options.recommended_glyphs = True

    subsetter = subset.Subsetter(options=options)
    subsetter.populate(
        glyphs=icon_glyphs,
        text=" ".join(icon_names),
        unicodes=[0x20],
    )
    subsetter.subset(font)

    output.parent.mkdir(parents=True, exist_ok=True)
    font.flavor = "woff2"
    font.save(output)

    verify_font(output, icon_names, expect_static=True)
    return source.stat().st_size, output.stat().st_size, pruned


def verify_font(path: Path, icon_names: list[str], expect_static: bool) -> None:
    font = TTFont(path)
    substitutions = ligature_map(font)
    missing = [name for name in icon_names if name not in substitutions]
    extra = sorted(set(substitutions) - set(icon_names))
    if missing:
        raise ValueError(f"{path}: missing ligatures after subsetting: {', '.join(missing)}")
    if extra:
        raise ValueError(f"{path}: unexpected ligatures after pruning: {', '.join(extra)}")
    if expect_static and "fvar" in font:
        raise ValueError(f"{path}: expected a static instance, but fvar is still present")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Subset the self-hosted Material Symbols font to the ligatures kbgui uses.",
    )
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--icons", type=Path, default=DEFAULT_ICON_LIST)
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="verify the output font against the icon list without writing a new subset",
    )
    args = parser.parse_args()

    icon_names = read_icon_names(args.icons)
    if args.verify_only:
        verify_font(args.output, icon_names, expect_static=True)
        print(f"verified {len(icon_names)} Material Symbols ligatures in {args.output}")
        return

    before, after, pruned = subset_font(args.source, args.output, icon_names)
    print(f"Material Symbols icons: {len(icon_names)}")
    print(f"Source: {args.source} ({before} bytes)")
    print(f"Output: {args.output} ({after} bytes)")
    print(f"Removed source ligature substitutions before subsetting: {pruned}")
    print("Verified all listed ligatures resolve in the subset static instance.")


if __name__ == "__main__":
    main()
