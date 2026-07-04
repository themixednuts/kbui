export const MONKEYTYPE_PARSER_VERSION = "monkeytype-dom-v1.0.0";

export const MONKEYTYPE_RESULT_SELECTORS = {
  result: "#result",
  wpm: "#result .stats .wpm .bottom",
  acc: "#result .stats .acc .bottom",
  consistency: "#result .stats .consistency .bottom",
  testType: "#result .stats .testType .bottom",
  time: "#result .stats .time .bottom .text",
  rawWpm: "#result .stats .raw .bottom"
} as const;

export type MonkeytypeResultSelectorName = keyof typeof MONKEYTYPE_RESULT_SELECTORS;

export function readMonkeytypeText(
  root: ParentNode,
  selector: MonkeytypeResultSelectorName,
): string | null {
  const element = root.querySelector(MONKEYTYPE_RESULT_SELECTORS[selector]);
  const text = element?.textContent?.replace(/\s+/g, " ").trim();
  return text || null;
}
