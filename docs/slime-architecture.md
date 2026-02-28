# Slime Architecture — Lv1 to Lv10 Design Reference

> Source: `kaachan-and-slime-docs/🤤 僕の考えた最強の次世代Webアプリケーションアーキテクチャ（進化論）.md`

---

## Lv 1 — Routing Only

The minimum unit. Just routing.

```ts
// route.ts
route.get('/ping', "pong")
```

---

## Lv 2 — Workflow + Middleware

Workflow (redefined Controller) and Middleware are extracted from route.

- **Middleware**: Gate for "does this request have the right to reach the app?" (auth, rate limit, IP restriction, etc.)
- **Workflow**: Business logic only. Never holds auth/rate-limit concerns.

Slime provides official middleware (`slime.auth()`) so auth-gated apps work with minimal code.

```
route.ts → [Middleware group] → Workflow → [Response]
```

### Kaachan Rules
- Inline processing in route is prohibited
- Cross-cutting concerns (auth, rate limit, etc.) inside Workflow → warning (move to middleware.ts)

### Concept Code
```ts
// route.ts
route.post('/user', CreateUserWorkflow)
route.post('/profile', slime.auth(), UpdateProfileWorkflow)
route.get('/admin', slime.auth({ role: 'admin' }), GetAdminWorkflow)
```

---

## Lv 3 — Parse Layer

Parse (typed object conversion from unknown input) is extracted from Workflow. DB access in parse is prohibited.

**"Parse, don't validate"**: Instead of validating (and letting business checks bleed into pre-processing), parse the raw request into a fully typed object. Business logic checks happen in Workflow/Logic — not here.

Slime provides `slime export:schema` (frontend type/schema generation) and `slime export:openapi` (OpenAPI 3.x spec generation).

### Kaachan Rules
- Parse-equivalent processing inside Workflow → prohibited
- DB access inside parse → prohibited

### Concept Code
```ts
// parse.ts
type CreateUserInput = { name: string; email: string }

export const parseCreateUser = (input: unknown): CreateUserInput => {
  if (!input.name) throw new Error("name required")
  if (!input.email.includes("@")) throw new Error("invalid email")
  return { name: input.name, email: input.email }
}

// CreateUserWorkflow.ts
export const CreateUserWorkflow = (input: unknown) => {
  const valid = parseCreateUser(input)
  const user = saveUser(valid)
  return user
}
```

---

## Lv 4 — Repository + Client Layers

DB access (Repository) and external API access (Client) are extracted from Workflow.

**Naming conventions** (style guide, hint level — escalates to error at Lv6, CQRS folder at Lv10):
- Read (Query): `find*`, `list*`, `get*`, `count*`, `search*`
- Write (Command): `create*`, `save*`, `update*`, `delete*`, `remove*`

**Key constraint**: ORM objects must not leak outside Repository. Only pure domain types are returned.

For multi-repository transactions: use `slime.withTransaction()`. Direct ORM transaction APIs (`prisma.$transaction()` etc.) in Workflow are prohibited.

### Kaachan Rules
- `repository.ts`: DB access only; naming convention violation → hint; ORM type in return value → warning
- `workflow.ts`: Direct ORM import → warning; `prisma.$transaction()` direct usage → warning

### Concept Code
```ts
// repository.ts
export const findUserByEmail = async (email: string): Promise<User | null> => {
  const record = await prisma.user.findUnique({ where: { email } })
  if (!record) return null
  return { id: record.id, name: record.name, email: record.email } // pure type
}

// workflow.ts (transaction example)
export const CreateUserWithAuditWorkflow = async (input: unknown) => {
  const valid = parseCreateUser(input)
  return slime.withTransaction(async () => {
    const user = await saveUser(valid)
    await saveAuditLog(user.id, "USER_CREATED")
    return user
  })
}
```

---

## Lv 5 — Logic Layer (Pure Functions + Result Type)

Business logic (Logic) is extracted from Workflow. Logic is a layer of **pure business decisions with no state and no side effects**.

Result type (`ok()` / `err()`) is mandatory. `throw` from Logic is prohibited. Workflow receives the Result and may throw.

**Domain prefix naming** is required for Logic functions (e.g. `userCan*`, `orderCan*`).

Tests for all Logic functions are required (no test → warning).

### Fat Logic Prevention Strategy

1. Domain prefix naming enforcement (`userCan*` etc.)
2. Intermediate promotion to `logic/` folder
3. Type dependency graph analysis via `ts-morph` (function groups with no type intersection → auto-detected as domain candidates)
4. Kaachan + rules file role separation (static analysis vs. AI context understanding)

### Escalation
| Stage | Condition | Type |
|---|---|---|
| Hint | >300 lines / >10 functions | Informational |
| Warning | >500 lines OR prefix mixing OR non-intersecting type groups detected | Structural problem |
| Error | Any file in `logic/` exceeds 300 lines OR prefix mixing unresolved | Blocks migration |

### Kaachan Rules
- Logic: pure functions only; `throw` prohibited (use Result); no test → warning; domain prefix required
- Workflow: no inline logic; size hint at >300 lines / 10 functions

### Directory Structure at Lv5
```
/src
  route.ts
  workflow.ts
  middleware.ts
  parse.ts
  repository.ts
  client.ts
  logic.ts           # domain prefix required; exceeds threshold → promoted to logic/
  logic/
    user.ts          # userCan* functions
    order.ts         # orderCan* functions
```

---

## Transition: "Layer Era" → "Structure Era"

**Lv1–5**: The question was always "which file does this code go in?" — a layer-first era.

**Lv6+**: The question becomes "how do I organize these files?" — a structure/domain era. Domain modeling takes center stage. The FW can only provide constraint-based guidance; correct answers come from outside the code (business knowledge).

Also: from Lv6+, the assumption "all Workflows are called from route" breaks down. Domain Workflows become internal functions called from `app/workflow.ts`. At Lv8+, queues, cron schedulers, and CLI commands become additional entry points. `route.ts` is just one entry point among many.

---

## Lv 6 — Domain Separation (DDD Introduction)

Key concerns:
- Domain modeling becomes serious
- Business logic proliferation (Fat Service problem)
- Cross-domain business logic organization

`App` is redefined as a "director" layer that should not contain business logic. Domain references are only allowed from `App`. Domains may not reference each other.

`Shared` is a temporary holding area for shared logic and undifferentiated DB access.

`client/` is separated: `client.ts` may only be called from `adapter.ts` (ACL / Anti-Corruption Layer).

### Kaachan Rules
- App: warn on bloat and business logic presence; only App may reference domains; `app/repository.ts` → warning; `app/client.ts` → prohibited
- Shared: `utility.ts` / `smallLogic.ts` pure functions only; `repository.ts` allows DB access; bloat → warning; importing from domain folders → warning
- `client/`: `client.ts` must only be called via `adapter.ts`
- `repository`: naming convention violation → error; query function containing command operation → error
- Cross-domain references → prohibited

### Directory Structure at Lv6
```
/src
 ├─ app/
 │    ├─ route.ts
 │    ├─ parse.ts
 │    ├─ middleware.ts
 │    └─ workflow.ts       # cross-domain orchestration (App layer)
 ├─ shared/
 │    ├─ utility.ts        # pure functions
 │    ├─ smallLogic.ts     # small logic not worth a domain
 │    └─ repository.ts     # undifferentiated DB access
 ├─ client/
 │    ├─ client.ts
 │    └─ adapter.ts        # ACL / mapping logic
 ├─ domainA/
 │    ├─ workflow.ts
 │    ├─ logic.ts
 │    └─ repository.ts
 └─ domainB/
      ├─ workflow.ts
      └─ logic.ts
```

---

## Lv 7 — Cross-Domain Structure + Test Enforcement

- Logic tests mandatory (missing `logic.test.ts` → error)
- `cross-` prefixed folders allowed to reference multiple domains (App reference from cross- → prohibited)
- Nested domains: only parent → child references allowed
- `slime.defer()` introduced:
  - Inside `slime.withTransaction()`: post-commit hook (minimizes lock time)
  - Outside: post-operation in-process hook (lightweight side effects)

### Kaachan Rules
- App: bloat prohibited; `logic.ts`, `repository.ts`, `client.ts` in App → prohibited
- Domain: only parent→child references; sibling references prohibited
- `cross-domain`: multiple domain access OK; App reference prohibited
- Workflow (inside `slime.withTransaction()`): non-DB async operations detected → suggest `slime.defer()` (hint, opt-in)

---

## Lv 8 — Domain Events

`cross-` folders were accumulating "the second App layer" problem. Domain Events resolve this.

**Domain Events are appropriate for**: post-transaction side effects where failure is acceptable (welcome email, point award, follower notification).

**NOT appropriate for**: operations requiring atomicity (order creation + inventory decrement must succeed/fail together → use `cross-` with `slime.withTransaction()`).

### Division
- **Side effects (post-transaction, failure-acceptable)** → via domain events
- **Atomicity-required cross-domain operations** → `cross-` folder (specialized for transactions)

Events are defined as pure data types in `shared/events.ts` (public contract belonging to no domain). Domain Workflows return event types. App layer receives events and passes them to subsequent Workflows explicitly — **return-value approach, not emit/on event bus**.

### Kaachan Rules
- `shared/events.ts`: events must be plain object types (no class instances); `type` discriminant field required
- `cross-` folders: non-transaction-only code → warning ("this should be an event"); mail/external API calls inside → warning

### Directory at Lv8 (additions)
```
shared/
  └─ events.ts   ← added (all domain event definitions)
cross-*/          ← specialized for transactions only
```

---

## Lv 9 — Ports & Adapters (Hexagonal Architecture)

The problem remaining after Lv8: **domain Workflows directly import ORM implementations**.

Lv9 separates the mixed `repository.ts` into:
- **Specification (Port)** → `domainUser/ports.ts` (ORM-free type definition)
- **Implementation (Adapter)** → `infrastructure/user/prismaAdapter.ts`

`repository` terminology disappears from the codebase entirely.

Workflows receive Ports as **function arguments** (no DI container, no classes).

### What This Achieves
- **Simpler testing**: no real DB needed for Workflow tests (use in-memory adapter)
- **Easy ORM switching**: create `drizzleAdapter.ts`, swap it in — zero domain code changes

### Kaachan Rules
- ORM imports inside domain folders → prohibited
- Workflow must accept Port as an argument
- ORM direct operations outside `infrastructure/` → prohibited

### Directory at Lv9
```
/src
 ├─ app/
 │    └─ workflow.ts    ← connects Port + Workflow here
 ├─ domainUser/
 │    ├─ ports.ts       ← Lv9 addition (specification only, no ORM)
 │    └─ workflow.ts    ← now receives Port as argument
 └─ infrastructure/     ← Lv9 addition (implementation only)
      ├─ user/
      │    └─ prismaAdapter.ts
      └─ mail/
           └─ sendgridAdapter.ts
```

---

## Lv 9 → 10 Transition: Ports & Adapters vs. CQRS

| Pattern | Problem Solved | Analogy |
|---|---|---|
| Ports & Adapters (Lv9) | Domain knows about infrastructure | **Vertical cut**: separate spec from implementation |
| CQRS (Lv10) | Read and write have different optimal structures | **Horizontal cut**: separate read from write |

These two "cuts" are orthogonal. Natural order: separate domain from infrastructure (Lv9) → separate read/write models (Lv10). Doing it in reverse doubles complexity.

---

## Lv 10 — CQRS (Command Query Responsibility Segregation)

Write operations prioritize **consistency** (enforce domain aggregate boundaries). Read operations prioritize **speed and flexibility** (cross-domain JOINs are acceptable).

`ports.ts` still mixes read and write specs. This prevents expressing the asymmetric rule "writes enforce aggregate boundaries, reads may cross boundaries" as structure. Lv10 resolves this with **CQRS folder structure**.

### Directory Change
```
domainUser/
  command/                 ← write (enforce aggregate boundaries)
    ports.ts               # WritePort
    workflow.ts
    logic.ts
  query/                   ← read (cross-domain JOINs allowed)
    ports.ts               # ReadPort
    userList.ts            # 1 file = 1 query (no shared abstractions)
    userDetail.ts
    userWithOrders.ts      # ← crosses orders domain — OK in query/
```

**1 file = 1 query** rule for `query/`. Generalization and shared abstractions are prohibited.

### Lv4 Callback
- Lv4: Query/Command naming convention (function names)
- Lv9: Ports & Adapters — specs extracted, read/write functions named in `ports.ts`
- Lv10: CQRS folder — read/write structurally separated

"Name to build awareness (Lv4) → isolate infrastructure and formalize spec (Lv9) → structurally separate read/write (Lv10)" — three steps complete.

### Kaachan Rules
- ReadPort usage inside `command/` → prohibited
- `query/`: 1 file = 1 query (bloat and shared abstractions prohibited)
- `command/` Workflows must only update through aggregate roots
- Domain objects must not be brought into `query/`

---

## Protocol Support Policy (GraphQL / gRPC / tRPC)

**Common principle: Do not let protocol differences affect Slime's Workflow/Logic/Parse structure. Adapter layers absorb the differences.**

| Protocol | Policy | Impact on Slime Core |
|---|---|---|
| REST (default) | Built-in | — |
| GraphQL | Front-facing gateway (Apollo Gateway etc.) | None (absorbed by gateway) |
| gRPC | `@slime/adapter-grpc` (client.ts layer) | None (Lv8+, for inter-service calls) |
| tRPC | `@slime/adapter-trpc` (optional) | None (TypeScript monorepo only) |

---

## Open Issues

- **Batch / async processing entry points**: FW-internal cron/CLI (in-process) and `@slime/infra-aws` Lambda adapter (serverless) available in parallel at all levels
- **Fat Parse problem**: `parse.ts` has the same bloat risk as Fat Logic. Same intermediate promotion pattern (`parse/createUser.ts` etc.); threshold/escalation same as Logic; shared schemas allowed, only bloat detected
- **Frontend handling**: Slime acts as API server only. `slime export:schema` + `slime export:openapi` provide type-safe boundaries. `@slime/adapter-nextjs` for tight RSC integration (optional plugin)
