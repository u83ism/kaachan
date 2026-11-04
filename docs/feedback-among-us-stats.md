# Feedback from among-us-stats — Trial Adoption with Next.js + Hono

> Started 2026-11-04. Source: the `u83ism/among-us-stats` repository (Next.js 15 App Router,
> Prisma, Vercel). Kaachan is installed there as a trial; its diagnostics are advisory and need
> not be followed. This document collects what the trial feeds back into Kaachan.

## Setup

Next.js keeps the screens, and the API is a Hono app mounted through a single catch-all route
handler:

```
src/
  app/                       # Next.js App Router
    api/[[...route]]/route.ts   # export const GET = handle(app)  (hono/vercel)
  server/                    # Hono + Slime layers — the only path Kaachan analyzes
    route.ts
```

Kaachan runs as `kaachan src/server` (devDependency `file:../kaachan`, since Kaachan is not
published to npm). Detected level at the start: Lv1.

## Finding 1: The CLI does not start from a `file:` install on Windows

`bin` points to `src/cli/index.ts` with a `#!/usr/bin/env tsx` shebang. Installed with
`npm i -D ../kaachan`, the npm shim on Windows runs `tsx`, which is not on the consumer's `PATH`
(Kaachan's own `tsx` stays in `kaachan/node_modules`):

```
'"tsx"' is not recognized as an internal or external command
```

Fixed 2026-11-04: `npm run build` (`tsconfig.build.json`) compiles `src/` to `dist/`, `bin` /
`main` / `exports` point at the JavaScript, the CLI shebang is `node`, and `prepare` builds on
install. `tsx` moved to devDependencies.

## Finding 2: Next.js App Router does not fit level detection

- Level detection looks only at the flat files of the source root, so Next.js route handlers
  (`src/app/**/route.ts`) are never seen. Running Kaachan on the project root reports
  "No Slime Architecture level detected" and runs no rules.
- Next.js's `src/app/` collides in name and place with Slime's Lv6 `app/` layer.

The `src/server/` split above avoids both, because Kaachan analyzes only the path it is given.
The theory places Slime as an API server loosely coupled with Next.js, but neither the theory nor
these docs describe how to lay out a project that hosts both in one repository. That layout
guidance (and whether Kaachan should detect it) is an open question.

## Finding 3: `route-api-namespace` misses Hono's statement form of `basePath`

Verified 2026-11-04 against a Lv2 fixture (`route.ts` + empty `workflow.ts` / `middleware.ts`):

| `route.ts` | Result |
|---|---|
| `const app = new Hono()` / `app.get("/matches", ...)` | Flagged (correct) |
| `const app = new Hono().basePath("/api")` / `app.get("/matches", ...)` | **Flagged (false positive)** |
| `new Hono().basePath("/api").get("/matches", ...)` (one chain) | Not flagged (correct) |

`isInApiGroup` only looks for a `basePath('/api')` call inside the same call chain, so a router
variable initialized with `basePath('/api')` is not recognized. The statement form is common in
Hono code. among-us-stats uses the chained form for now.
