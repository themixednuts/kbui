import { redirect } from "@sveltejs/kit";

/** `/` redirects to the rebuilt editor route. */
export function load() {
  redirect(307, "/editor");
}
