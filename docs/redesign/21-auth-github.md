# Wave 3a: GitHub Auth In App Shell

Date: 2026-07-04

## UI structure

The `(app)` shell profile popover now uses the real better-auth GitHub session.

- Signed in:
  - Shows `session.user.image` as the avatar, with initials as the fallback.
  - Shows the GitHub display name, best-effort `@handle`, and email when present.
  - Includes a `View GitHub profile` link. The public URL is derived from a GitHub noreply email, handle-shaped name, or email local part because the better-auth session does not expose GitHub `login` as a separate field.
  - Includes an empty labeled `Monkeytype` section reserved for Wave 3b.
  - Includes a `Sign out` action.
- Signed out:
  - Shows the local draft identity.
  - Shows a coral `Sign in with GitHub` action.
  - Shows a subtle auth hint when the AuthAgent is unavailable or GitHub OAuth is not configured.
- Account footer:
  - Reuses the same real account state as the popover.
  - Shows the signed-in avatar/name/handle when a GitHub session exists.
  - Falls back to `LD / Local draft / @not signed in`.

## Session source

`src/routes/(app)/+layout.server.ts` threads display-safe auth data from `event.locals` into the app shell:

- `locals.user` becomes `data.auth.user`.
- `locals.session` becomes `data.auth.session` with only `id`, `userId`, and `expiresAt`; the session token is not exposed.

`src/routes/(app)/+layout.svelte` seeds the shell from that SSR user for first paint, then hydrates/reconciles on the client with:

```ts
const result = await authClient.getSession();
shell.setSessionUser(result.data?.user);
```

If the client session fetch fails, the shell remains in a signed-out state and displays a hint instead of throwing.

## Client auth calls

Sign-in uses the existing better-auth browser client:

```ts
const result = await authClient.signIn.social({
  provider: "github",
  callbackURL: "/",
  disableRedirect: true,
});

if (result.data?.url) globalThis.location.assign(result.data.url);
```

Sign-out uses:

```ts
const result = await authClient.signOut();
shell.setSignedOut();
await refreshSession();
```

Both paths handle `result.error` and thrown errors.

## Dev and not-configured handling

Plain `vp dev` still cannot run the internal `AuthAgent` Durable Object. In that state the shell stays signed out and shows:

```txt
Run `vp run dev:worker` to sign in with GitHub.
```

Provider/configuration failures are also rendered as signed-out auth hints. They do not crash the shell or disable the rest of the app.

## Verification

Static and build checks:

```txt
vp install: pass
vp check: pass, 0 warnings/errors
vp run svelte:check: pass, 0 warnings/errors
vp build: pass
vp test: 17 files passed, 94 tests passed
```

AuthAgent proof:

- Built with `vp build`.
- Started the Worker with `vp run dev:worker`, which resolves the bind host and port from `BETTER_AUTH_URL`.
- Local `.dev.vars` had the required auth keys. For deterministic proof, the Wrangler process was started with dummy `--var` overrides:
  - `BETTER_AUTH_SECRET=kbgui-wave-3a-local-secret-1234567890`
  - `BETTER_AUTH_URL=<local worker origin>`
  - `GITHUB_CLIENT_ID=dummy-local-client`
  - `GITHUB_CLIENT_SECRET=dummy-local-secret`

Evidence:

```txt
GET http://127.0.0.1:8787/api/auth/get-session
HTTP 200
body: null

POST http://127.0.0.1:8787/api/auth/sign-in/social
body: {"provider":"github","callbackURL":"/","disableRedirect":true}
HTTP 200
response.url origin/path: https://github.com/login/oauth/authorize
response.url client_id: dummy-local-client
response.url redirect_uri: http://127.0.0.1:8787/api/auth/callback/github

Port 8787 clear after stop.
```

A full interactive GitHub login was not completed with dummy credentials. It requires real OAuth credentials and a browser round trip.

## Real login setup

For local end-to-end GitHub login, provide:

```txt
BETTER_AUTH_SECRET="<32+ random chars>"
BETTER_AUTH_URL="<local worker origin, for example http://127.0.0.1:8787>"
GITHUB_CLIENT_ID="<GitHub OAuth app client id>"
GITHUB_CLIENT_SECRET="<GitHub OAuth app client secret>"
```

Configure the GitHub OAuth App with:

```txt
Homepage URL: <BETTER_AUTH_URL>
Callback URL: <BETTER_AUTH_URL>/api/auth/callback/github
```

Run the app through the Worker-backed path:

```sh
vp run dev:worker
```
