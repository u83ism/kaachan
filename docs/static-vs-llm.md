# Kaachan — Static Analysis vs. LLM Boundary

> This document defines what Kaachan can detect statically and what requires LLM assistance.
> Source of truth for this boundary: `kaachan-and-slime-docs/Logic層 設計詳細.md` and `Kaachan設計仕様.md`.

---

## Design Principle

> **Kaachan detects "what is happening". The rules file tells AI "what should be done".**

Kaachan performs objective, reproducible structural checks at lint time. AI interprets those findings in business context and proposes actions. Neither can fully substitute for the other.

```
Kaachan (objective facts)     rules file      AI (contextual judgement)
─────────────────────────  ──────────────▶  ─────────────────────────────
"logic.ts: 2 non-intersecting              "Group A looks like user domain,
 type groups detected"                      Group B looks like order domain.
                                            Consider splitting into logic/user.ts
"logic.ts: 480 lines"                       and logic/order.ts."
```

---

## What Static Analysis CAN Detect

These are **structural** or **syntactic** facts derivable from AST and file system alone.

| Category | Examples | Rule |
|---|---|---|
| Import direction | Logic importing Store/Client | `logic-imports` |
| Import direction | Domain A importing Domain B | `dep-direction`, `nested-domain` |
| File/folder existence | `slime.config.ts` absent at Lv5+ | `slime-config-hint` |
| File/folder existence | `logic-tests`: no test file for logic | `logic-tests` |
| Size thresholds | Lines / function count exceeding limit | `fat-*` rules |
| Naming conventions | Store functions not using `find*`/`save*` | `repo-naming` |
| Naming conventions | Logic functions lacking domain prefix | `fat-logic` |
| Throw detection | `throw` inside Logic layer | `logic-throws` |
| Throw detection | `throw new Error()` inside Workflow | `workflow-throws` |
| Type dependency | Non-intersecting function groups in logic.ts | `fat-logic` (type graph) |
| ORM leakage | ORM type in repository.ts return annotation | `repo-advanced` |
| ORM leakage | ORM import outside `infrastructure/` | `infrastructure-boundary` |
| Event structure | Event type missing `type` discriminant field | `events-validation` |
| CQRS direction | `command/` importing from `query/` | `cqrs-enforcement` |

**Detection confidence**: High. These checks have near-zero false positives by design — they are conservative (false-negative tolerant) where ambiguity exists.

---

## What LLM Should Handle

These require **semantic or business context** that is not present in the AST.

### 1. Adapter business judgment vs. translation

**Why static analysis fails**: Both patterns are syntactically identical — both are conditionals in `client/adapter.ts`.

```ts
// OK: translation only (Adapter's job)
if (res.code === 'card_declined') return err("PAYMENT_DECLINED")

// NG: business judgment smuggled into Adapter (Logic's job)
if (res.code === 'card_declined' && user.retryCount > 3) return err("CARD_BLOCKED")
```

The difference is that `user.retryCount > 3` encodes a business rule ("block after 3 failures"), but the AST only sees a binary expression. Whether a threshold constitutes a business rule is a question of business knowledge, not syntax.

**LLM role**: Review conditionals in adapter files and ask "is this threshold a business rule?"

---

### 2. Domain knowledge leakage (hardcoded thresholds in wrong layers)

**Why static analysis fails**: The number `30` in `Date.now() - 30 * 24 * 60 * 60 * 1000` could be:
- A cache TTL (technical constant — belongs in config)
- The definition of a "dormant user" (business rule — belongs in Logic)

The AST cannot distinguish these. Even the theory docs note this as an **information-theoretic limit**: code expresses *what* to do, not *why that value is a business rule*.

**LLM role**: Identify magic numbers/strings in Store, Workflow, and Adapter layers; ask the developer whether they encode business rules that belong in Logic.

---

### 3. Logic function argument design

**Why static analysis fails**: Both signatures compile and pass type checking.

```ts
// NG: Logic implicitly "wants to call Store" — wrong input design
const userCanCreate = (email: string): Result<...> => { ... }

// OK: Workflow pre-resolves the data, Logic receives primitives only
const userCanCreate = (alreadyExists: boolean): Result<...> => { ... }
```

Whether `email: string` is an "unresolved reference that will tempt the developer to call Store inside Logic" cannot be determined from the type alone. It requires understanding what data `email` ultimately resolves to and whether that resolution belongs in Workflow.

**LLM role**: Review Logic function signatures; flag parameters that suggest unresolved data (entity IDs, email addresses, etc.) and suggest Workflow-side pre-resolution.

---

### 4. Domain assignment during Lv6 migration

**Why static analysis fails**: A function named `processOrder` could belong to `domainOrder` or to `domainPayment` depending on business context. Kaachan's prefix checker offers heuristic candidates, but cannot make the final determination.

**LLM role**: Given the list of ambiguous files and the prefix-based candidates Kaachan surfaces, help the developer decide which domain each file belongs to. The `slime export:rules` output provides this list as structured context.

---

### 5. "Why this split makes business sense"

**Why static analysis fails**: Kaachan can detect that `logic.ts` has two non-intersecting type dependency groups (Group A: `User`-related functions, Group B: `Order`-related functions). It cannot explain *why* these should be separate domains in the business model.

**LLM role**: Take Kaachan's detected groups and help the developer name the domains, understand the business boundary, and draft the split plan.

---

## The Bridge: `kaachan export:rules`

The `export:rules` command generates AI rules files (CLAUDE.md, `.cursor/rules`, etc.) that:

1. State the current architecture level and active constraints
2. **Mirror Kaachan's hint thresholds exactly** — so AI suggestions and Kaachan warnings fire at the same values
3. Provide instructions for the LLM tasks above, scoped to the detected level

This ensures a consistent signal: when Kaachan issues a hint, the AI continues to reinforce the same message, rather than the two tools giving contradictory guidance.

```
# Generated by kaachan export:rules (Level: 5)

## Domain Split Proposal Rules
If workflow.ts or logic.ts exceeds 300 lines / 10 functions:
1. Propose domain modeling to the user
2. Help the user verbalize business concern groupings
3. Present a folder structure proposal with user approval

## Slime Lv5 Constraints
- Logic functions must have domain prefixes (userCan*, orderCan*, etc.)
- Logic functions must return Result type (no throwing)
- Logic functions must have tests
- Logic function inputs must be resolved primitives (not entity IDs requiring DB lookup)
- parse must not access DB
```

---

## Summary Table

| Check type | Static analysis | LLM |
|---|---|---|
| Import direction violations | ✅ | — |
| File/folder structure | ✅ | — |
| Naming convention violations | ✅ | — |
| Size/complexity thresholds | ✅ | — |
| Throw in wrong layer | ✅ | — |
| Type dependency grouping (detection) | ✅ | — |
| ORM / infrastructure leakage | ✅ | — |
| Event type structure | ✅ | — |
| Adapter: translation vs. business judgment | ❌ | ✅ |
| Hardcoded thresholds: technical vs. business | ❌ | ✅ |
| Logic argument design (primitive vs. unresolved) | ❌ | ✅ |
| Domain assignment for ambiguous files | ❌ (heuristic hint only) | ✅ |
| Domain split rationale / naming | ❌ | ✅ |
