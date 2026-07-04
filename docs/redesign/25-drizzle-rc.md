# Drizzle RC Upgrade

Date: 2026-07-04

## Selected Versions

`vp info drizzle-orm` and `vp info drizzle-kit` both reported these relevant dist-tags:

- `latest`: `drizzle-orm@0.45.2`, `drizzle-kit@0.31.10`
- `beta`: `1.0.0-beta.22`
- `rc`: `1.0.0-rc.4`

`vp info <package> versions --json` confirmed `1.0.0-rc.4` is the newest exact RC version shared by both packages.

| Package | Before | After |
| --- | --- | --- |
| `drizzle-orm` | `^0.45.2` | `1.0.0-rc.4` |
| `drizzle-kit` | `^0.31.10` | `1.0.0-rc.4` |
| `@better-auth/drizzle-adapter` | `^1.6.23` | `1.7.0-rc.1` |
| `better-auth` | `^1.6.23` | `1.7.0-rc.1` |

The Better Auth adapter was updated because `@better-auth/drizzle-adapter@1.6.23` peers `drizzle-orm: ^0.45.2`, while `@better-auth/drizzle-adapter@1.7.0-rc.1` peers `drizzle-orm: ^0.45.2 || >=1.0.0-rc.1 <2.0.0`.

`better-auth` was updated with it because the adapter RC peers `@better-auth/core: ^1.7.0-rc.1`, which is supplied by `better-auth@1.7.0-rc.1`.

## API Migration

`drizzle-orm/durable-sqlite` in `1.0.0-rc.4` no longer accepts `schema` in its driver config. The AuthAgent database creation changed from:

```ts
drizzle(this.#agentCtx.storage, { schema: authSchema, logger: true })
```

to:

```ts
drizzle(this.#agentCtx.storage, { logger: true })
```

The `@better-auth/drizzle-adapter` config still receives `schema: authSchema`, so the existing Better Auth model-to-table mapping remains explicit.

No auth schema table definitions needed changes.

## Verification

All required Vite+ commands passed:

- `vp check`: formatted, linted, and type-checked 207 files with 0 errors.
- `vp run svelte:check`: checked 5965 files with 0 errors and 0 warnings.
- `vp build`: completed successfully with `@sveltejs/adapter-cloudflare:agents`.
- `vp test`: 21 test files passed, 103 tests passed.

Runtime AuthAgent DO adapter smoke test:

```txt
vp exec wrangler dev --ip 127.0.0.1 --port 8787
GET http://127.0.0.1:8787/api/auth/get-session
HTTP_STATUS=200
BODY_SNIPPET=null
LISTENER_AFTER_STOP=False
```

Wrangler logs confirmed the local worker used `.dev.vars`, started on `http://127.0.0.1:8787`, initialized `AuthAgent`, read the existing `verification` table, and handled `GET /api/auth/get-session -> 200`.
