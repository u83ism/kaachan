# Architecture Decision Records (ADR) and Q&A

> Source: `kaachan-and-slime-docs/Kaachan&Slime&Slime Architecture構想の設計根拠、補足資料.md`

---

## ADR-Lv3: Why Workflow Is Designed to Not Depend on HTTP

Express/Hono handlers receive `(req, res)` and are inseparable from HTTP. NestJS Controllers work the same way — tests require the full DI container setup. Laravel Controllers receive a `Request` object, so batch processing has to call the Service directly from a Command file, bypassing the Controller.

In Slime, **the Parse layer owns the HTTP boundary**. Since Parse handles `unknown` → pure typed object conversion, Workflow arguments become plain data with no knowledge of "where they came from". As a result, Workflow can be invoked from routing, tests, events, and background jobs through the same interface.

```ts
// No need to fake HTTP in tests. Just a function call.
const result = await CreateUserWorkflow({ name: 'foo', email: 'foo@example.com' })
```

For Laravel users: Workflow is "Controller + Command combined". By having Parse absorb the differences in entry points, the business logic entry is unified to one place.

---

## ADR-Lv8: Why Return-Value Approach Instead of Event Bus (emit/on)

Event bus approach (`slime.emit()` / `slime.on()`) is common (Laravel Event also uses this structure internally), but it has a problem: "who is listening to this event?" is invisible without chasing through the code — the same visibility problem as JavaScript's `addEventListener`.

Backend domain events differ from frontend UI events. "Order confirmed → send email to buyer" is a business-essential subsequent process where **failure to handle it is a bug**. Having an invisible design here carries high risk, and there is strong demand for traceability.

With the return-value approach (Option A), reading the App layer reveals the entire flow, and the type system guarantees the existence of subsequent processing. Event buses are valuable for plugin designs where multiple teams independently add handlers, or microservice-scale architectures — both are overkill for the Lv8–10 monolith.

---

## ADR-Lv9: The Origin and Disappearance of "repository"

The name `repository.ts` is borrowed from DDD's "Repository Pattern", but at Lv4–8, it was not a "properly abstracted layer with separated interface and implementation" as DDD intends — it was an **implementation-mixed layer**. It achieved partial encapsulation by returning pure domain types, but was incomplete in that chasing through the code would reveal ORM.

When this mixing is resolved at Lv9, the name changes to `ports.ts` + `infrastructure/`, and the word `repository` disappears. This is not "Repository Pattern failed" — it is the result of **ascending to the more general concept of Ports & Adapters (Hexagonal Architecture)**, which is the OOP realization of Repository Pattern. `repository.ts` did not end as incomplete — it dissolved into a larger concept. `Repository Pattern ⊂ Ports & Adapters`.

---

## ADR-Lv9: Why Ports & Adapters Without DI Container

OOP-style Ports & Adapters typically uses interfaces and DI containers for Port injection. Slime adopts a **functional implementation (Port received as argument)**. Reasons:

1. **TypeScript classes are not TS's mainstream**: TS's strengths (type inference, union types, structural subtyping) are often incompatible with classes
2. **DI containers have high learning cost**: Users reaching Lv9 often haven't internalized DI container concepts
3. **Same result achievable with partial function application**: A function returned by `createUserWorkflow(prismaUserPort)` behaves equivalently to a DI-injected function

---

## ADR-Lv10: Why CQRS Is at Lv10 (Not Lv6)

CQRS (read/write model separation) could technically be introduced at Lv6 when domain splitting begins, but is deferred to Lv10 for these reasons:

1. **Ports & Adapters must come first**: Splitting read/write while implementation and spec are still mixed doubles the complexity. The natural order is: separate domain from infrastructure (Lv9) → separate read/write (Lv10).
2. **Lv4 foreshadowing**: Query/Command naming conventions introduced at Lv4 pre-plant the CQRS concept. Lv10 completes it as structure — a three-step design: "name to build awareness → formalize spec → structurally separate".
3. **Reward for reaching high levels**: Positioned as a final gift for users who commit to the full Lv10 journey.

---

## Q&A

### Q: "Lv4–8 repository.ts is incomplete as Repository Pattern"

**A.** Intentionally so.

Forcing the full "interface + implementation separation" of DDD's Repository Pattern from Lv4 would mean users can't use the FW without understanding all of Ports & Adapters. Lv4–8's `repository.ts` is **scaffolding** — it provides partial encapsulation ("centralize DB access, return only pure domain types") without being the final form.

When Ports & Adapters (Hexagonal Architecture) is completed at Lv9, `repository` disappears into `ports.ts` + `infrastructure/`. This is **not "Repository Pattern failed"** — it is the result of ascending to the more general concept. `Repository Pattern ⊂ Ports & Adapters`. The final form is more complete, not less.

---

### Q: "Workflow is no different from DDD's Application Service / Use Case. Using proprietary terminology causes confusion."

**A.** Intentional naming to progressively refine meaning.

Lv2's Workflow is close to an HTTP handler — it could be called a Controller without objection. Lv9's Workflow is close to an Application Service. The same term having its responsibilities progressively narrowed — this is the overall structure of Slime Architecture's level design. Workflow is one instance of it.

Using "Application Service" or "Use Case" at Lv2 creates terminology that requires DDD context to understand. "Workflow" is intuitively understandable as "something that handles a flow of processing", lowering the learning barrier at low levels. At high levels, Kaachan error messages distinguish App-layer Workflow from Domain Workflow, compensating for terminological ambiguity through constraints.

---

### Q: "Claiming functional programming influence while tolerating throw is contradictory. Result type should be enforced from the start."

**A.** Gary Bernhardt's **"Functional Core, Imperative Shell"** (Strange Loop 2012) is the theoretical basis.

The design separates a pure core (Logic) from an imperative shell (Workflow). Throws in the shell are acceptable. Prohibiting Logic throws and enforcing Result type from Lv5 onward is a pragmatic trade-off.

Also, enforcing Result type at Lv1–4 risks beginners abandoning the framework before understanding why they must wrap everything in `ok()` and `err()`. For small apps, `throw` causing an immediate 500 error is often acceptable — this level design accounts for the learning curve.

---

### Q: "CQRS should always be used with Event Sourcing. Using it separately deviates from the original intent."

**A.** Greg Young himself stated "CQRS can be applied without Event Sourcing."

What Slime adopts is Greg Young's lightweight CQRS — adopted specifically to **resolve the structural asymmetry between read and write models**. "Writes enforce aggregate boundaries strictly; reads may JOIN across boundaries" — expressing this asymmetric rule via folder structure is the goal. Performance optimization and Event Sourcing are not the objective.

This interpretation aligns with re-evaluations in recent discussions: CQRS is applicable not only to high-load systems but to "any system where reads are complex and tend to cross domain boundaries."

---

### Q: "Incrementally changing architecture generates technical debt. The correct design should be chosen from the start."

**A.** This is a fundamental difference in premises — a different arena entirely.

"Choose the correct design from the start" implicitly assumes "there are people who can choose the correct design from the start." The field reality is "start small, scale as success requires." Applying Lv10-equivalent design to a Lv1 codebase is over-engineering.

The theoretical basis is O'Reilly's **"Building Evolutionary Architectures"** (Ford, Parsons, Kua), which argues "architecture should evolve incrementally" and introduces the concept of **architecture fitness functions** (automated checks that protect architectural characteristics) — directly corresponding to Kaachan's design. The fact that Kaachan's design independently converged with this book (whose existence the author was unaware of) is corroborating evidence of the approach's validity.

The biggest risk of incremental migration — "references breaking during level migration" — is addressed by `slime migrate`'s interactive UI and dry-run features (acknowledged as the most challenging remaining implementation challenge).

---

### Q: "Parse, don't validate is a Haskell concept and applying it to TypeScript is a stretch."

**A.** It is already mainstream in the TypeScript community.

Alexis King's [Parse, don't validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/) (2019) originated in the Haskell community, but Zod and Valibot are TypeScript libraries directly based on this philosophy and are widely used today. "Applying it to TypeScript is a stretch" — on the contrary, it is already established as standard practice.

---

## Protocol Support — Design Rationale

### GraphQL: Front-Facing Gateway Approach

GraphQL's request structure is fundamentally incompatible with Slime's design:

- **Resolver granularity mismatch**: GraphQL Resolvers operate at field level, Slime's processing unit is Workflow (use case level)
- **N+1 problem**: Straightforward Resolver implementation causes N+1 queries; DataLoader adds architectural complexity
- **Parse layer divergence**: GraphQL's query/mutation structure differs from HTTP `req.body` — the existing Parse layer interface cannot be used as-is

**Solution**: Place a dedicated GraphQL gateway (Apollo Gateway, GraphQL Mesh etc.) outside Slime, and consume Slime as a pure data API server.

```
[GraphQL Client]
       ↓
[GraphQL Gateway]  ← absorbs GraphQL-specific complexity
       ↓
[Slime App (REST)] ← maintains standard Workflow/Parse/Logic structure
```

### gRPC: Transport for Inter-Service Communication (Lv8+)

gRPC is HTTP/2-based binary protocol, primarily used for low-latency inter-service communication. In Slime Architecture, multi-service coordination becomes a design concern at Lv8+, making this the natural introduction point.

- External service gRPC communication changes only the `client.ts` transport — no impact on Workflow, Logic, or Repository
- `.proto` file management under `client/` or a dedicated `proto/` folder
- Realistic approach: `@slime/adapter-grpc` plugin providing gRPC transport for client.ts

### tRPC: Optional Adapter for TypeScript Monorepos

tRPC is a TypeScript-exclusive end-to-end type-safe API library — server types flow directly to the client without code generation.

| Aspect | tRPC | gRPC |
|---|---|---|
| Protocol | HTTP (POST/GET) | HTTP/2 binary |
| Code generation | Not needed (TS type inference) | .proto files required |
| Target | TypeScript↔TypeScript | Cross-language inter-service |
| Parse layer compatibility | Zod in common — natural integration | Separate validation layer needed |
| Workflow mapping | procedure ≈ Workflow (nearly 1:1) | service + method hierarchy |

**Compatibility with Slime**: tRPC's philosophy is highly aligned with Slime. Simply exposing Workflows as tRPC procedures creates type-safe API for TypeScript frontends. Zod is shared with the Parse layer — Parse layer schemas can be reused as tRPC input validators.

Options:
| Choice | Description |
|---|---|
| Option A (default) | REST + `slime export:openapi` for loosely coupled frontend consumption |
| Option tRPC | `@slime/adapter-trpc` exposes Workflows as procedures (TypeScript monorepo assumed) |
