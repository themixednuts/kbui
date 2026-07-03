import { getViaKeyboardIndex } from "../keyboards.remote";

/** Prerendered VIA catalog index for the workbench layout. */
export async function load() {
  const catalog = await getViaKeyboardIndex();
  return { catalog };
}
