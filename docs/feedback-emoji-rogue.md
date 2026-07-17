# Feedback from emoji-rogue — First Non-Web Adoption Attempt

> Recorded 2026-07-18. Source: the `u83ism/emoji-rogue` repository (a CLI roguelike with a
> functional-core/imperative-shell architecture) evaluated adopting Kaachan as its structure linter
> and instead reimplemented a small subset by hand. This document records why, and what
> requirements that experiment feeds back into Kaachan.

## Context

emoji-rogue independently converged on Kaachan's core design without knowing it was already
specified here:

- A structure lint script (`check-structure.mjs`) that detects file-size and folder-granularity
  violations mechanically, while **domain modeling (folder naming) is proposed by AI and ratified
  by a human** — the exact split documented in `docs/static-vs-llm.md` ("Kaachan detects what is
  happening; the rules file tells AI what should be done").
- Three-tier feedback (`hint` → `error` → justified), mirroring Kaachan's hint/warning/error
  escalation.
- A rules-file clause telling the AI to respond to threshold crossings with a *proposal*, mirroring
  `rules/_content/lv5.md`'s "Guidance for AI Assistants" (propose domain modeling → user approval).

This convergence is evidence that the Slime/Kaachan design generalizes beyond web applications.
Adoption still failed — for concrete, fixable reasons below.

## Why Kaachan could not be adopted as-is

Level detection and all 21 rules key on Slime layer files (`route.ts`, `workflow.ts`, `parse.ts`,
`logic.ts`, ...). A non-web project has none of these signals: level detection yields nothing and
every rule is vacuously silent. The generic value inside Kaachan (size thresholds, folder
granularity, import direction, naming conventions, test-existence) is currently inseparable from
the web-layer vocabulary.

## Requirement 1: Per-violation justification suppression

`--disable-rule <id>` is all-or-nothing per run. What emoji-rogue needed — and built — is
**per-violation suppression that requires a recorded justification**:

- File-level: a `file-size-exception: <reason>` comment near the top of the offending file — the
  reason lives at the violation site, visible in review.
- Folder-level (no file to annotate): a declarative exceptions file mapping path → reason.
- An empty or missing reason is not a suppression. The linter's contract: *a violation is allowed
  if and only if a human-approved justification is on record.*

This also matches the ecosystem convention (`biome-ignore`, `eslint-disable-next-line` with
required explanation) and is more auditable than disabling a rule globally.

## Requirement 2: A generic rule pack, decoupled from level detection

A `generic` rule group that works with zero Slime signals would make Kaachan installable in any
TypeScript repository as a first touchpoint:

| Candidate rule | Already in Kaachan as | Slime-independent? |
|---|---|---|
| File line/function thresholds | `fat-*` | Yes — only thresholds needed |
| Folder file-count threshold | (new; emoji-rogue: hint >10, error >15 non-test files) | Yes |
| Missing colocated test | `logic-tests` | Yes, if the target glob is configurable |
| Import direction between configured folders | `dep-direction` | Needs config instead of `domain*` conventions |

Strategic note: this must not dilute Kaachan's opinionated web-app core. A possible shape is
"generic pack = Lv0", active before any level is detected — which also gives greenfield non-Slime
projects a reason to install Kaachan at all.

## Requirement 3 (observation): Vocabulary laundering in the AI-proposal loop

The rules-file flow ("AI proposes domain modeling, user approves") has a failure mode observed in
practice: **an AI coinage enters project docs, then later looks like established project vocabulary
when the AI cites those docs as provenance.** In emoji-rogue, a folder was nearly named `ticks/` on
the grounds that "tick" appeared throughout the tracker — but every occurrence traced back to an
AI-chosen function name; the human had never ratified (or understood) the word, and rejected it
when asked.

Implication for the rules file `export:rules` generates: when instructing the AI to propose names,
require provenance labels — *established* must mean "traceable to something the human said or
ratified", and appearing in AI-written docs/identifiers must not qualify.

## Pointers

- emoji-rogue's implementation of the above: `scripts/check-structure.mjs`,
  `scripts/structure-exceptions.json`, and `.claude/rules/file-structure.md` in `u83ism/emoji-rogue`.
- Related theory note: `u83ism/idea` → `ideas/ai-program-skill-rules-sedimentation.md`
  (program/skill/rules division of labor and the "sedimentation" lifecycle).
