import { Effect } from "effect";

import { IndentPolicy, PracticeScript, SESSION_GOAL_UNTIL_COMPLETE } from "./contracts";

const detect4 = IndentPolicy.cases.Detect.make({ candidateWidth: 4 });

function rustScript(id: string, title: string, lines: string[]): PracticeScript {
  return PracticeScript.make({
    id,
    mode: "rust-text",
    title,
    goal: SESSION_GOAL_UNTIL_COMPLETE,
    lines,
    indentUnitWidth: 4,
    indentPolicy: detect4,
    actions: [],
  });
}

/**
 * Intentionally dense / under-formatted sources.
 * `prepareDrill` / adaptive synthesis run prettier-plugin-rust so the buffer
 * shows rustfmt-style spacing and line breaks.
 */
export const RUST_TEXT_DRILLS: readonly PracticeScript[] = [
  rustScript("rust-main-path", "Rust · main + path", [
    "fn main(){let path=Path::new(\"./src\");println!(\"{:?}\",path);}",
  ]),
  rustScript("rust-result-match", "Rust · Result match", [
    "fn parse(s:&str)->Result<i32,()>{s.parse().map_err(|_|())}",
    "match parse(\"42\"){Ok(n)=>println!(\"{n}\"),Err(())=>eprintln!(\"bad\"),}",
  ]),
  rustScript("rust-iter-collect", "Rust · iterator collect", [
    "let nums:Vec<_>=(0..10).filter(|n|n%2==0).map(|n|n*n).collect();",
  ]),
  rustScript("rust-async-await", "Rust · async await", [
    "async fn fetch(url:&str)->Result<String,Error>{let body=client.get(url).send().await?;Ok(body.text().await?)}",
  ]),
  rustScript("rust-struct-impl", "Rust · struct impl", [
    "struct Point{x:i32,y:i32}",
    "impl Point{fn dist(&self)->f64{((self.x.pow(2)+self.y.pow(2)) as f64).sqrt()}}",
  ]),
  rustScript("rust-lifetime-slice", "Rust · lifetime slice", [
    "fn first<'a>(items:&'a [u8])->Option<&'a u8>{items.first()}",
  ]),
  rustScript("rust-hashmap-entry", "Rust · HashMap entry", [
    "let mut map=HashMap::new();map.entry(key).or_insert_with(Vec::new).push(value);",
  ]),
  rustScript("rust-trait-bound", "Rust · trait bound", [
    "fn dump<T:Debug+?Sized>(value:&T){eprintln!(\"{value:?}\");}",
  ]),
  rustScript("rust-macro-rules", "Rust · macro_rules", [
    "macro_rules! ok{($e:expr)=>{{match $e{Ok(v)=>v,Err(e)=>return Err(e.into()),}}}}",
  ]),
  rustScript("rust-borrow-mut", "Rust · borrow mut", [
    "let mut buf=String::new();buf.push_str(\"hello\");let slice:&mut str=buf.as_mut_str();",
  ]),
];

/** Canonical fixture for tests — first drill. */
export const RUST_TEXT_DRILL_V1 = RUST_TEXT_DRILLS[0]!;

export const pickRustTextScript = Effect.fn("Practice.pickRustTextScript")(function* (
  seed = Date.now(),
) {
  const index = Math.abs(seed) % RUST_TEXT_DRILLS.length;
  return RUST_TEXT_DRILLS[index]!;
});

export const defaultRustTextScript = Effect.fn("Practice.defaultRustTextScript")(function* () {
  return yield* pickRustTextScript();
});
