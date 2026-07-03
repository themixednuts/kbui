import { redirect } from "@sveltejs/kit";

const LEGACY_VIEWS = new Set(["keymap", "logic", "lighting", "versioning", "firmware"]);

/** `/` and legacy `?view=` URLs redirect to filesystem routes. */
export function load({ url }: { url: URL }) {
  const view = url.searchParams.get("view");
  if (view && LEGACY_VIEWS.has(view)) {
    const next = new URL(url);
    next.searchParams.delete("view");
    const search = next.searchParams.toString();
    if (view === "lighting") {
      redirect(307, search ? `/keymap?mode=rgb&${search}` : "/keymap?mode=rgb");
    }
    redirect(307, search ? `/${view}?${search}` : `/${view}`);
  }
  redirect(307, "/keymap");
}
