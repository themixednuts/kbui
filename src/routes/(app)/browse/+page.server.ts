import { listCommunityKeymaps } from "./community.remote";

export async function load() {
  const initialCards = await listCommunityKeymaps({ sort: "likes", limit: 24 });
  return { initialCards };
}
