import { Agent, type AgentContext } from "agents";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins/jwt";
import { drizzle } from "drizzle-orm/durable-sqlite";

import * as authSchema from "$lib/server/auth/schema";

interface AuthAgentEnv extends Cloudflare.Env {
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
}

interface AuthAgentState {
  configuredProviders: string[];
  updatedAt: string;
}

interface AuthHandler {
  handler(request: Request): Promise<Response>;
}

const localAuthSecret = "keeb-workbench-local-development-secret-change-before-deploy";

export class AuthAgent extends Agent<AuthAgentEnv, AuthAgentState> {
  initialState: AuthAgentState = {
    configuredProviders: [],
    updatedAt: new Date(0).toISOString(),
  };

  readonly #agentCtx: AgentContext;
  readonly #agentEnv: AuthAgentEnv;
  #auth: AuthHandler | undefined;

  constructor(ctx: AgentContext, env: AuthAgentEnv) {
    super(ctx, env);
    this.#agentCtx = ctx;
    this.#agentEnv = env;
  }

  onStart() {
    console.log("[AuthAgent] onStart — ensuring tables + computing providers");
    this.ensureAuthTables();
    this.setState({
      configuredProviders: this.githubConfigured() ? ["github"] : [],
      updatedAt: new Date().toISOString(),
    });
    // Snapshot the verification table at boot so we can see whether DO
    // storage actually survived the wrangler reload that just brought
    // this instance back online.
    try {
      const cursor = this.#agentCtx.storage.sql.exec(
        "SELECT identifier, expires_at FROM verification ORDER BY created_at DESC LIMIT 5",
      );
      const rows = cursor.toArray();
      console.log(`[AuthAgent] verification table on boot: ${rows.length} row(s)`, rows);
    } catch (error) {
      console.log("[AuthAgent] could not snapshot verification table:", error);
    }
  }

  override async fetch(request: Request): Promise<Response> {
    await this.__unsafe_ensureInitialized();
    const url = new URL(request.url);
    console.log(`[AuthAgent] >>> ${request.method} ${url.pathname}${url.search}`);
    if (url.pathname.endsWith("/callback/github")) {
      // Snapshot what we know about verifications BEFORE handing off to
      // better-auth so we can compare against the state token in the URL.
      try {
        const cursor = this.#agentCtx.storage.sql.exec(
          "SELECT identifier, length(value) AS value_len, expires_at, created_at FROM verification ORDER BY created_at DESC LIMIT 5",
        );
        const rows = cursor.toArray();
        console.log(`[AuthAgent] verification rows at callback-time: ${rows.length}`, rows);
      } catch (error) {
        console.log("[AuthAgent] verification snapshot failed:", error);
      }
    }
    const auth = this.getAuth();
    const response = await auth.handler(request);
    console.log(`[AuthAgent] <<< ${request.method} ${url.pathname} -> ${response.status}`);
    return response;
  }

  private getAuth(): AuthHandler {
    const githubClientId = this.#agentEnv.GITHUB_CLIENT_ID;
    const githubClientSecret = this.#agentEnv.GITHUB_CLIENT_SECRET;

    if (!this.#auth) {
      this.#auth = betterAuth({
        appName: "Keeb Workbench",
        basePath: "/api/auth",
        baseURL: this.#agentEnv.BETTER_AUTH_URL ?? {
          allowedHosts: ["localhost:*", "127.0.0.1:*", "*.workers.dev"],
          fallback: "http://127.0.0.1:8787",
          protocol: "auto",
        },
        // `logger: true` makes drizzle emit every prepared SQL query +
        // params to console.log. That's how we'll see better-auth's
        // INSERT into verification at sign-in vs. SELECT at callback,
        // and diagnose any identifier mismatch / missing row.
        database: drizzleAdapter(
          drizzle(this.#agentCtx.storage, { schema: authSchema, logger: true }),
          {
            provider: "sqlite",
            schema: authSchema,
            camelCase: true,
          },
        ),
        logger: {
          level: "debug",
          log: (level, message, ...args) => {
            console.log(`[better-auth][${level}] ${message}`, ...args);
          },
        },
        secret: this.#agentEnv.BETTER_AUTH_SECRET ?? localAuthSecret,
        socialProviders:
          githubClientId && githubClientSecret
            ? {
                github: {
                  clientId: githubClientId,
                  clientSecret: githubClientSecret,
                },
              }
            : {},
        trustedOrigins: [
          "http://localhost:5173",
          "http://127.0.0.1:5173",
          "http://localhost:8787",
          "http://127.0.0.1:8787",
        ],
        advanced: {
          trustedProxyHeaders: true,
          backgroundTasks: {
            handler: (promise) => this.#agentCtx.waitUntil(promise),
          },
        },
        // JWT plugin — exposes `GET /api/auth/jwks` (public key set) and
        // `GET /api/auth/token` (issues a bearer for the signed-in user).
        // LiveStore's Sync DO uses these: client passes the token in
        // `syncPayload`, the DO verifies it against the JWKS. The `sub`
        // claim is the better-auth user id — that's the stable identity
        // we key LiveStore stores on.
        plugins: [
          jwt({
            jwt: {
              // 30-day tokens. LiveStore reconnects continuously so a
              // long-lived token avoids forcing a re-issue mid-session;
              // shorter is fine too if we want tighter revocation.
              expirationTime: "30d",
            },
          }),
        ],
      });
    }

    return this.#auth;
  }

  private githubConfigured() {
    return Boolean(this.#agentEnv.GITHUB_CLIENT_ID && this.#agentEnv.GITHUB_CLIENT_SECRET);
  }

  private ensureAuthTables() {
    void this.sql`
      CREATE TABLE IF NOT EXISTS user (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        email_verified INTEGER NOT NULL DEFAULT 0,
        image TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `;

    void this.sql`
      CREATE TABLE IF NOT EXISTS session (
        id TEXT PRIMARY KEY,
        expires_at INTEGER NOT NULL,
        token TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
      )
    `;

    void this.sql`CREATE INDEX IF NOT EXISTS session_user_id_idx ON session (user_id)`;

    void this.sql`
      CREATE TABLE IF NOT EXISTS account (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        access_token TEXT,
        refresh_token TEXT,
        id_token TEXT,
        access_token_expires_at INTEGER,
        refresh_token_expires_at INTEGER,
        scope TEXT,
        password TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `;

    void this.sql`CREATE INDEX IF NOT EXISTS account_user_id_idx ON account (user_id)`;
    void this.sql`
      CREATE UNIQUE INDEX IF NOT EXISTS account_provider_account_id_idx
      ON account (provider_id, account_id)
    `;

    void this.sql`
      CREATE TABLE IF NOT EXISTS verification (
        id TEXT PRIMARY KEY,
        identifier TEXT NOT NULL,
        value TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `;

    void this
      .sql`CREATE INDEX IF NOT EXISTS verification_identifier_idx ON verification (identifier)`;

    // JWT plugin tables. Holds the rotating RSA/Ed25519 keypairs that
    // back the JWKS endpoint and the issued-token signing key. The plugin
    // expects exact column names — `id`, `public_key`, `private_key`,
    // `created_at`, `expires_at` (snake_case under drizzleAdapter's
    // camelCase mode).
    void this.sql`
      CREATE TABLE IF NOT EXISTS jwks (
        id TEXT PRIMARY KEY,
        public_key TEXT NOT NULL,
        private_key TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER
      )
    `;
  }
}
