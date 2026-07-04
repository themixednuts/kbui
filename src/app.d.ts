import type { DurableObjectNamespace, ExecutionContext } from "@cloudflare/workers-types";
import type { Session, User } from "better-auth";
import type { AuthAgent } from "./agents/auth-agent";
import type { CommunityAgent } from "./agents/community-agent";
import type { TypingRunsAgent } from "./agents/typing-runs-agent";
import type { UserWorkbenchAgent } from "./agents/user-workbench";

declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      session: Session | null;
      user: User | null;
    }
    // interface PageData {}
    // interface PageState {}
    interface Platform {
      env: Cloudflare.Env & {
        AuthAgent: DurableObjectNamespace<AuthAgent>;
        CommunityAgent: DurableObjectNamespace<CommunityAgent>;
        TypingRunsAgent: DurableObjectNamespace<TypingRunsAgent>;
        UserWorkbenchAgent: DurableObjectNamespace<UserWorkbenchAgent>;
        BETTER_AUTH_SECRET?: string;
        BETTER_AUTH_URL?: string;
        GITHUB_CLIENT_ID?: string;
        GITHUB_CLIENT_SECRET?: string;
        MONKEYTYPE_SECRET_KEY?: string;
        GITHUB_TOKEN?: string;
        VIA_GITHUB_TOKEN?: string;
      };
      context: ExecutionContext;
      caches: CacheStorage & { default: Cache };
    }
  }
}

export {};
