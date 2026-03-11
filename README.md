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
npx kaachan --level       # show detected level only
npx kaachan --format json # machine-readable output
```

## Related Links

- [Slime Architecture (Qiita)](https://qiita.com/u83unlimited/items/86c9b0f5571e3e802ace)
- [Slime FW concept (Qiita)](https://qiita.com/u83unlimited/items/8b0e5b51749ccdfde393)
- [Design rationale (Qiita)](https://qiita.com/u83unlimited/items/69a554c216d7b4bbc1b2)
