# Kaachan & Slime — Project Overview

## What Is This Project?

This project consists of three closely related components:

### Kaachan (Design Linter)

A static analysis tool (linter) that detects when code is becoming "Fat" and issues **hint / warning / error** feedback in three escalation stages. It performs AST analysis via `ts-morph` to build type dependency graphs and automatically detect domain candidates — pushing the boundaries of what static analysis can do. The opinionated, persistent nature of its feedback is the reason it is named "Kaachan" (Japanese for "Mom").

### Slime Architecture

An architecture evolution theory that **gradually guides developers toward correct design without forcing the complete form from the start**. It has a multi-stage structure (Lv1–Lv10) in which constraints naturally tighten as code grows. Design theories (Layered Architecture, DDD, Ports & Adapters, CQRS, etc.) are introduced incrementally at each level.

**Goal**: "A functional-programming-influenced, reconstructed Clean Architecture extended with CQRS"

### Slime FW (Framework)

A TypeScript web application framework that works alongside Kaachan. Its name comes from its rich migration feature set that supports refactoring and scaling transitions — it changes shape as it grows, like a slime. It also aims to provide standard support for features that typically require user-land implementation, such as authentication, 2FA, idempotency keys, and multi-tenancy.

---

## Architecture Overview (Lv1–Lv10)

| Lv | Structure Snapshot | Theme / Design Theory |
|---|---|---|
| 1 | `route` | Routing only. Minimal FW unit |
| 2 | `route` → `Middleware` → `Workflow` | MVC-style Controller redefined as Workflow. Middleware separates HTTP gate processing |
| 3 | `route` → `Middleware` → `Parse` → `Workflow` | Introduction of "Parse, don't validate". Parse layer owns the HTTP boundary, decoupling Workflow from HTTP |
| 4 | `Workflow` → `Repository` (query*/command* naming) / `Client` | Establishment of Layered Architecture. Query/Command naming convention plants a CQRS-aware mindset |
| 5 | + `Logic` (pure functions, Result type) | Decision Object pattern. Result type (Railway Oriented Programming) eliminates exceptions. **Functional Core, Imperative Shell** (Gary Bernhardt) begins |
| 6 | `App` / `Domain(s)` / `Shared` / `Client` (+`Adapter`) | Full DDD adoption. ACL (Anti-Corruption Layer) for client/adapter separation. Cross-domain references prohibited |
| 7 | + `cross-Domain` / Logic test enforcement | Cross-domain coordination structured under `cross-` folder. `slime.defer()` introduces post-commit hooks |
| 8 | + `shared/events.ts` / `cross-` specialized for Tx | Introduction of Domain Events (DDD). Side effects vs. transactions separated by structure. Return-value approach ensures event visibility |
| 9 | + `Domain/ports.ts` / `infrastructure/Adapters` | Functional implementation of Hexagonal Architecture (Ports & Adapters). Dependency inversion without DI containers or classes. **Functional Clean Architecture complete** |
| 10 | `Domain/command/` + `Domain/query/` + `Infrastructure` | Lightweight CQRS (Greg Young style). Read/write models separated by folder structure. **Final goal of this document** |

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

- [slime-architecture.md](./slime-architecture.md) — Lv1–Lv10 detailed design
- [kaachan-design.md](./kaachan-design.md) — Kaachan linter specification
- [slime-fw.md](./slime-fw.md) — Slime FW features and implementation
- [adr.md](./adr.md) — Architecture Decision Records and Q&A
