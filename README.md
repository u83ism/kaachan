# Kaachan

A design linter for [Slime Architecture](https://qiita.com/u83unlimited/items/86c9b0f5571e3e802ace) — a progressive, multi-level (Lv1–Lv10) web application architecture concept.

## Repository Relationship

This project is split across two repositories:

| Repository | Role |
|---|---|
| [`u83ism/kaachan-and-slime-docs`](https://github.com/u83ism/kaachan-and-slime-docs) | **Theory** — Slime Architecture concept, design rationale, ADRs. Source of truth for the "what and why". |
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
| [`slime-architecture.md`](./docs/slime-architecture.md) | Slime Architecture level-by-level detail |
| [`slime-fw.md`](./docs/slime-fw.md) | Slime FW features and implementation details |
| [`adr.md`](./docs/adr.md) | Architecture Decision Records and Q&A |

## Usage

```bash
npx kaachan               # analyze current directory
npx kaachan ./src         # analyze specific path
npx kaachan --level       # show detected architecture level and evidence only
npx kaachan --disable-rule fat-workflow  # skip a specific rule
```

### Exit Codes

| Code | Meaning |
|---|---|
| `0` | No `error`-severity diagnostics |
| `1` | One or more `error`-severity diagnostics, or analysis failed |

---

## Architecture Level Detection

Kaachan infers the current level from file-system signals (no AST required):

| Level | Required signals |
|---|---|
| Lv1 | `route.ts` |
| Lv2 | + `workflow.ts` + `middleware.ts` |
| Lv3 | + `parse.ts` |
| Lv4 | + `repository.ts` + `client.ts` |
| Lv5 | + `logic.ts` or `logic/` folder |
| Lv6 | + `app/` + `shared/` + ≥1 domain folder (`/^domain[A-Z]/`) |
| Lv7 | + any `cross-` prefixed folder |
| Lv8 | + `shared/events.ts` |
| Lv9 | + `infrastructure/` + any domain has `ports.ts` |
| Lv10 | + any domain has `command/` AND `query/` subfolders |

Both `rootDir/*.ts` and `rootDir/src/*.ts` are treated transparently.

---

## Rules

| Rule ID | Active from | What it detects | Max severity |
|---|---|---|---|
| `fat-workflow` | Lv2 | `workflow.ts` exceeding line/function thresholds | warning |
| `fat-parse` | Lv3 | `parse.ts` exceeding line/function thresholds | warning |
| `repo-naming` | Lv4 | Non-conventional repository function names; `workflow.ts` importing ORM directly | warning |
| `logic-imports` | Lv5 | `logic.ts` / `logic/*.ts` importing `repository` or `client` | error |
| `fat-logic` | Lv5 | `logic.ts` exceeding thresholds; domain prefix mixing; non-intersecting type groups | error |
| `dep-direction` | Lv6 | Cross-domain imports; domain referenced from outside `app/`; `shared/` importing domain | error |

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
