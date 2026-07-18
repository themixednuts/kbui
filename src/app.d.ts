import type { Session, User } from "better-auth";

declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      session: Session | null;
      user: (User & { githubLogin?: string | null }) | null;
    }
    // interface PageData {}
    // interface PageState {}
    interface Platform {
      env: Cloudflare.Env;
      context: ExecutionContext;
      caches: CacheStorage & { default: Cache };
    }
  }
}

export {};
