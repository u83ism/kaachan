# Kaachan & Slime — Project Overview

## What Is This Project?

This project consists of three closely related components:

### Kaachan (Design Linter)

A static analysis tool (linter) that detects when code is becoming "Fat" and issues **hint / warning / error** feedback in three escalation stages. It performs AST analysis via `ts-morph` to build type dependency graphs and automatically detect domain candidates — pushing the boundaries of what static analysis can do. The opinionated, persistent nature of its feedback is the reason it is named "Kaachan" (Japanese for "Mom").

### Slime Architecture

An architecture evolution theory that **gradually guides developers toward correct design without forcing the complete form from the start**. It has a multi-stage structure (Lv1–Lv10) in which constraints naturally tighten as code grows. Design theories (Layered Architecture, DDD, Ports & Adapters, CQRS, etc.) are introduced incrementally at each level.

**Goal**: "A functional-programming-influenced, reconstructed Clean Architecture extended with CQRS"

### `@u83ism/architecture-rules` (Shared Package)

An npm package ([`@u83ism/architecture-rules`](https://www.npmjs.com/package/@u83ism/architecture-rules), source: [slime-architecture-rules](https://github.com/u83ism/slime-architecture-rules)) that provides the Slime Architecture knowledge as TypeScript types and constants — `ArchitectureLevel`, `Severity`, `LAYER_FILES`, `FOLDER_NAMES`, `FOLDER_PATTERNS`, `LEVEL_DEFINITIONS`, the rule catalog with per-level severities (`RULE_CATALOG`), the `slime.config.ts` declaration types (`DomainDependencies`, `TableOwnership`), the error response format (`ProblemDetails`), and the AI rules templates (`rules/lv*.md`). The same repository is also the theory source of truth (`docs/ja/`).

Both Kaachan and Slime FW depend on this package as the Single Source of Truth for architecture rule definitions, preventing any divergence between the two tools.

### Slime FW (Framework)

A TypeScript web application framework that works alongside Kaachan. Its name comes from its rich migration feature set that supports refactoring and scaling transitions — it changes shape as it grows, like a slime. It also aims to provide standard support for features that typically require user-land implementation, such as authentication, 2FA, idempotency keys, and multi-tenancy.

---

## Architecture Overview (Lv1–Lv10)

| Lv | Structure Snapshot | Theme / Design Theory |
|---|---|---|
| 1 | `route` | Routing only. Minimal FW unit |
| 2 | `route` → `Middleware` → `Workflow` | MVC-style Controller redefined as Workflow. Middleware separates HTTP gate processing |
| 3 | `route` → `Middleware` → `Parse` → `Workflow` | Introduction of "Parse, don't validate". Parse layer owns the HTTP boundary, decoupling Workflow from HTTP |
| 4 | `Workflow` → `Store` / `Client` | Establishment of Layered Architecture. Store function naming (`find*` / `list*` / `search*` / `create*` …) and four fixed read shapes (batch `find*ByIds`, unique key, `list*(filter, page)`, `search*(query, page)`) plant a CQRS-aware mindset |
| 5 | + `Logic` (pure functions, Result type) | Decision Object pattern. Result type (Railway Oriented Programming) eliminates exceptions. **Functional Core, Imperative Shell** (Gary Bernhardt) begins |
| 6 | `app/` / `domains/<name>/` / `shared/` / `client/` (+`adapter`) | Full DDD adoption. ACL (Anti-Corruption Layer) for client/adapter separation. Domain-to-domain imports follow a DAG declared in `slime.config.ts`; each table is owned by one domain (writes only from the owner) |
| 7 | + `orchestrate/<name>/` / Logic test enforcement | Coordination across domains structured under `orchestrate/`. `slime.defer()` introduces post-commit hooks |
| 8 | + `shared/events.ts` / `orchestrate/` specialized for Tx | Introduction of Domain Events (DDD). Side effects vs. transactions separated by structure. Return-value approach ensures event visibility |
| 9 | + `domains/<name>/ports.ts` / `infrastructure/` adapters | Functional implementation of Hexagonal Architecture (Ports & Adapters). Dependency inversion without DI containers or classes. **Functional Clean Architecture complete** |
| 10 | `domains/<name>/command/` + `query/` (one query per file) + `infrastructure/` | Lightweight CQRS (Greg Young style). Read/write models separated by folder structure; read-side adapters may JOIN across table owners. **Final goal of this document** |

Out of scope: DB design itself (normalization, indexes, column types). Load and reliability concerns (queues, Outbox, performance) are handled on an axis separate from the levels.

---

## Key Principles

- **Gradual guidance over forced perfection**: Rather than mandating the complete form from day one, the system leads developers to correct design incrementally — without them even realizing it.
- **Static analysis as architecture fitness functions**: Kaachan's escalating lint rules correspond directly to the concept of "architecture fitness functions" described in *Building Evolutionary Architectures* (O'Reilly).
- **FW does not call AI; FW prepares context for AI**: Kaachan detects "what is happening". The `rules` file tells AI "what should be done". Static analysis and AI have clearly separated roles.
- **Functional Core, Imperative Shell**: Logic is the pure functional core; Workflow is the imperative shell. Fully realized as structure at Lv9.

---

## Target Audience

- Projects that start small but require smooth upscaling
- Developers who find Express/Hono too thin, NestJS too OOP-heavy
- Laravel developers struggling with Fat Controller / Fat Service problems
- Developers who want architectural guardrails without over-engineering upfront

---

## Related Documents

- [kaachan-design.md](./kaachan-design.md) — Kaachan linter specification
- [implementation-plan.md](./implementation-plan.md) — implementation phases, types, CLI interface
- Theory (Japanese, source of truth): [slime-architecture-rules `docs/ja/`](https://github.com/u83ism/slime-architecture-rules/tree/main/docs/ja) — the Lv-by-level reference (`Lv別アーキテクチャリファレンス.md`) is the canonical detailed design
