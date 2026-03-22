---
name: sync-docs
description: "Sync the kaachan-and-slime-docs repository, summarize changes, and reflect them into docs/, CLAUDE.md and memory. Use when you want to pull the latest documentation updates from https://github.com/u83ism/kaachan-and-slime-docs."
---

# Sync kaachan-and-slime-docs

## Repository Relationship

| Repository | Role |
|---|---|
| `u83ism/kaachan-and-slime-docs` (GitHub) | **Theory source of truth** — Slime Architecture concept, design rationale, ADRs |
| `kaachan` (this repo) `docs/` | **Implementation perspective** — implementation plans and design summaries specific to this codebase |

`docs/` contains only implementation-specific documents — not copies of theory docs. When the theory changes, update `docs/` only if it affects Kaachan's implementation details (thresholds, detection strategies, package dependencies, etc.).

`docs/` file mapping:

| File | Content |
|---|---|
| `overview.md` | Project overview and Lv1–10 architecture table |
| `implementation-plan.md` | Full implementation plan (phases, types, CLI interface, project structure) |
| `kaachan-design.md` | Kaachan linter specification (rules, thresholds, detection strategies) |

## Prerequisites

- `gh` CLI must be installed and authenticated (`gh auth login`).
  - Install: `winget install GitHub.cli` (Windows)
  - Verify: `gh auth status`

## Steps

0. **Check prerequisites**
   - Run `gh auth status` to verify `gh` is installed and authenticated.
   - If the command fails, stop immediately and instruct the user to install `gh` CLI and run `gh auth login`.

1. **Get the latest commit hash on remote main**
   - Run `gh api repos/u83ism/kaachan-and-slime-docs/commits/main --jq '.sha'`
   - Store this as `REMOTE_SHA`.

2. **Get the previously synced commit hash**
   - Read `memory/MEMORY.md` (or `memory/specs.md` if it exists) to find the last recorded `docs_synced_sha`.
   - If no hash is recorded, treat all files as new (skip diff, go to step 4).
   - Store the recorded hash as `PREV_SHA`.

3. **Identify changed files**
   - If `PREV_SHA == REMOTE_SHA`, report "Already up to date." and stop.
   - Run `gh api "repos/u83ism/kaachan-and-slime-docs/compare/${PREV_SHA}...${REMOTE_SHA}" --jq '.files[] | [.status, .filename] | @tsv'`
   - Filter to `.md` files only.

4. **Fetch and summarize each changed file**
   - For each added or modified `.md` file, fetch its content:
     `gh api "repos/u83ism/kaachan-and-slime-docs/contents/{filename}?ref=main" --jq '.content' | base64 -d`
   - For deleted files, note the deletion.
   - Summarize what changed in each file (added / removed / changed specification, design decisions, constraints).

5. **Update docs/ files**
   - Check if the theory changes affect Kaachan's implementation details (thresholds, detection strategies, shared package exports, layer/folder constants, etc.).
   - If yes, update the relevant `docs/` file(s):
     - New shared package exports → update `implementation-plan.md` (Key Types / package.json section)
     - Changed thresholds / rules → update `kaachan-design.md`
     - Structural changes to Slime Architecture levels → update `overview.md` (architecture table) and `implementation-plan.md` (level detection algorithm)
   - Do NOT paste raw theory text. Only reflect what directly affects implementation.
   - If the theory change has no implementation impact on Kaachan, skip this step.
   - Use the Edit tool to apply changes.

6. **Update memory/MEMORY.md**
   - Update `docs_synced_sha` to `REMOTE_SHA` in `memory/MEMORY.md`.
   - That is all — project knowledge lives in README.md and docs/, not in memory.

7. **Report to user**
   - List every theory file that changed (added / modified / deleted).
   - Show the content summary from step 4.
   - Confirm which project files were updated (docs/, memory/MEMORY.md).

## Examples
- "Sync the docs."
- "ドキュメントを最新化して。"
- "/sync-docs"
