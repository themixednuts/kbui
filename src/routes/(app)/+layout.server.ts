import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = ({ locals }) => ({
  auth: {
    session: locals.session
      ? {
          id: locals.session.id,
          expiresAt: locals.session.expiresAt,
          userId: locals.session.userId,
        }
      : null,
    user: locals.user
      ? {
          id: locals.user.id,
          name: locals.user.name,
          email: locals.user.email,
          image: locals.user.image,
        }
      : null,
  },
});
