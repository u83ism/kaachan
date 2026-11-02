# Kaachan

A design linter for [Slime Architecture](https://qiita.com/u83unlimited/items/86c9b0f5571e3e802ace) — a progressive, multi-level (Lv1–Lv10) web application architecture concept.

## Repository Relationship

This project is split across two repositories:

| Repository | Role |
|---|---|
| [`u83ism/slime-architecture-rules`](https://github.com/u83ism/slime-architecture-rules) | **Theory and shared package** — Slime Architecture concept, design rationale, ADRs (`docs/ja/`), plus the `@u83ism/architecture-rules` package (rule catalog, level definitions, AI rules templates). Source of truth for the "what and why". |
| `u83ism/kaachan` (this repo) | **Implementation** — The actual Kaachan linter codebase and its development plan. |

`docs/` in this repository contains implementation-oriented summaries and development plans derived from the theory. It is not a raw copy of the theory docs — it reflects what the specifications mean for this codebase.

## What Is Kaachan?

Kaachan is a static analysis CLI tool that enforces Slime Architecture constraints. It:

- Detects the current architecture level (Lv1–Lv10) from file structure
- Warns when code is becoming "Fat" (Fat Logic / Fat Workflow / Fat Parse)
- Escalates feedback in three stages: **hint → warning → error**
- Uses `ts-morph` AST analysis to build type dependency graphs and detect domain split candidates

The opinionated, persistent nature of its feedback is why it is named "Kaachan" (Japanese for "Mom").

## docs/

| File | Content |
|---|---|
| [`overview.md`](./docs/overview.md) | Project overview and Lv1–10 architecture table |
| [`implementation-plan.md`](./docs/implementation-plan.md) | Full implementation plan (phases, types, CLI interface, project structure) |
| [`kaachan-design.md`](./docs/kaachan-design.md) | Kaachan linter specification (rules, thresholds, detection strategies) |
| [`static-vs-llm.md`](./docs/static-vs-llm.md) | What Kaachan detects statically and what is left to the AI via rules files |
| [`feedback-emoji-rogue.md`](./docs/feedback-emoji-rogue.md) | Requirements from the first non-web adoption attempt |

## Usage

```bash
npx kaachan               # analyze current directory
npx kaachan ./src         # analyze specific path
npx kaachan --level       # show detected architecture level and evidence only
npx kaachan --disable-rule parse-db-import  # skip a catalog rule (or a whole module, e.g. fat-workflow)
```

### Exit Codes

| Code | Meaning |
|---|---|
| `0` | No `error`-severity diagnostics |
| `1` | One or more `error`-severity diagnostics, or analysis failed |

---

## Architecture Level Detection

Kaachan infers the current level from file-system signals (no AST required). The labels and requirements come from `LEVEL_DEFINITIONS` in `@u83ism/architecture-rules`:

| Level | Required signals |
|---|---|
| Lv1 | `route.ts` |
| Lv2 | + `workflow.ts` + `middleware.ts` |
| Lv3 | + `parse.ts` |
| Lv4 | + `store.ts` + `client.ts` |
| Lv5 | + `logic.ts` or `logic/` folder |
| Lv6 | `app/` + `shared/` + ≥1 folder under `domains/` |
| Lv7 | + ≥1 folder under `orchestrate/` |
| Lv8 | + `shared/events.ts` |
| Lv9 | + `infrastructure/` + any domain has `ports.ts` |
| Lv10 | + any domain has `command/` AND `query/` subfolders (`ports.ts` may live in them) |

Lv1–5 keep the layer files flat in the source root. From Lv6 they move into `app/`, `shared/` and `domains/`, so the domain structure is detected on its own without the flat Lv1–5 files. A project with neither `route.ts` nor a domain structure is reported as "No Slime Architecture level detected", and no rules run.

Both `rootDir/*.ts` and `rootDir/src/*.ts` are treated transparently.

---

## Rules

Diagnostics use the rule IDs of `RULE_CATALOG` in `@u83ism/architecture-rules` (79 rules), and the severity of each rule at each level comes from the catalog — Kaachan only detects. A rule that is not active at the detected level is not reported. The full list with severities per level is in the theory repository (`docs/ja/Lv別アーキテクチャリファレンス.md`, "Kaachan検査項目と重大度の一覧").

Kaachan groups the checks into modules. A module runs when at least one of its rules is active at the detected level:

| Module | Catalog rules it reports |
|---|---|
| `fat-workflow` | `workflow-size-hint`, `workflow-size-warning` |
| `route-inline` | `route-handler-non-http`, `workflow-auth-import` |
| `fat-parse` | `parse-size-hint`, `parse-size-warning`, `parse-folder-file-too-large` |
| `parse-violations` | `parse-db-import`, `workflow-raw-parse` |
| `slime-config-hint` | `slime-config-missing` |
| `workflow-throws` | `workflow-throws-plain-error` |
| `repo-naming` | `store-naming`, `workflow-orm-import` |
| `repo-advanced` | `store-orm-return-type`, `workflow-orm-transaction` |
| `fat-logic` | `logic-size-hint`, `logic-size-warning`, `logic-folder-file-too-large` |
| `logic-imports` | `logic-store-client-import` |
| `logic-throws` | `logic-throws` |
| `logic-tests` | `logic-test-missing` |
| `dep-direction` | `domain-undeclared-import`, `shared-imports-domain` |
| `app-layer` | `app-owns-store`, `app-owns-client`, `app-owns-logic`, `orchestrate-imports-app` |
| `client-acl` | `client-direct-import` |
| `fat-routing` | `app-route-size`, `app-route-defines-routes`, `route-dead-target`, `workflow-unreachable`, `domain-missing-routes` |
| `events-validation` | `event-missing-type-field`, `event-class-type` |
| `cross-folder-concerns` | `orchestrate-non-transactional-io` |
| `infrastructure-boundary` | `orm-outside-infrastructure`, `workflow-not-port-injected` |
| `cqrs-enforcement` | `command-imports-query`, `query-file-size`, `query-shared-helper`, `query-imports-domain-logic` |

The remaining 37 catalog rules are not implemented yet (see Phase 30 in `docs/implementation-plan.md`).

### Severity Escalation

| Severity | Symbol | Meaning |
|---|---|---|
| `hint` | `ℹ` | Informational — worth knowing |
| `warning` | `⚠` | Structural smell — should be addressed |
| `error` | `✗` | Architecture violation — causes exit code 1 |

---

## Related Links

- [Slime Architecture (Qiita)](https://qiita.com/u83unlimited/items/86c9b0f5571e3e802ace)
- [Slime FW concept (Qiita)](https://qiita.com/u83unlimited/items/8b0e5b51749ccdfde393)
- [Design rationale (Qiita)](https://qiita.com/u83unlimited/items/69a554c216d7b4bbc1b2)
