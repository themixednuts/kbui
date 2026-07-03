import { redirect } from "@sveltejs/kit";

/** RGB lives on the keymap paint mode now — keep old bookmarks working. */
export function load({ url }: { url: URL }) {
  const next = new URL(url);
  next.pathname = "/keymap";
  next.searchParams.set("mode", "rgb");
  redirect(307, `${next.pathname}${next.search}`);
}
