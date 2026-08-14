import { Effect } from "effect";

import { IndentPolicy, PracticeScript, SESSION_GOAL_UNTIL_COMPLETE } from "./contracts";

const detect4 = IndentPolicy.cases.Detect.make({ candidateWidth: 4 });

function symbolsScript(id: string, title: string, lines: string[]): PracticeScript {
  return PracticeScript.make({
    id,
    mode: "symbols",
    title,
    goal: SESSION_GOAL_UNTIL_COMPLETE,
    lines,
    indentUnitWidth: 4,
    indentPolicy: detect4,
    actions: [],
  });
}

export const SYMBOLS_DRILLS: readonly PracticeScript[] = [
  symbolsScript("symbols-operators", "Symbols · operators", [
    "let x = a + b * (c - d);",
    "foo::<T>(&bar)?.await;",
    "match n { 0 => Ok(()), _ => Err(()) }",
  ]),
  symbolsScript("symbols-path-attrs", "Symbols · paths & attrs", [
    "use std::collections::HashMap;",
    "#[derive(Debug, Clone)]",
    "type Id = u64;",
  ]),
  symbolsScript("symbols-closures", "Symbols · closures", [
    "let add = |a, b| a + b;",
    "items.iter().for_each(|x| println!(\"{x:?}\"));",
  ]),
  symbolsScript("symbols-brackets", "Symbols · brackets", [
    "vec![1, 2, 3][0];",
    "arr[i] = map[&k];",
    "[{(a, b)}, {c}]",
  ]),
  symbolsScript("symbols-punct-chain", "Symbols · punct chain", [
    "a?.b()?.c??d;",
    "x <<= 2; y &= !mask;",
    "\"{name}: {value:?}\"",
  ]),
  symbolsScript("symbols-turbofish", "Symbols · turbofish", [
    "iter.collect::<Vec<_>>();",
    "FromStr::from_str::<u32>(s)?;",
  ]),
];

export const SYMBOLS_DRILL_V1 = SYMBOLS_DRILLS[0]!;

export const pickSymbolsScript = Effect.fn("Practice.pickSymbolsScript")(function* (
  seed = Date.now(),
) {
  return SYMBOLS_DRILLS[Math.abs(seed) % SYMBOLS_DRILLS.length]!;
});

export const defaultSymbolsScript = Effect.fn("Practice.defaultSymbolsScript")(function* () {
  return yield* pickSymbolsScript();
});
