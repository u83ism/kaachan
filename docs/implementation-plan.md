# Kaachan — Implementation Plan

## Context

Kaachan is a TypeScript static analysis CLI tool that enforces "Slime Architecture" constraints. The repository currently contains documentation only (no source code). This plan covers the full MVP: standalone CLI (`npx kaachan`), level detection (Lv1–Lv10), and Fat Logic/Workflow/Parse detection with hint/warning/error escalation.

Architecture is designed to be embeddable by Slime FW as a library later.

---

## Project Structure

```
kaachan/
├── src/
│   ├── cli/
│   │   ├── index.ts                    # CLI entry point (commander)
│   │   └── formatters/
│   │       ├── console.ts              # human-readable output
│   │       └── json.ts                 # machine-readable output
│   ├── core/
│   │   ├── index.ts                    # public library API (for Slime FW)
│   │   ├── analyzer.ts                 # orchestrates full analysis
│   │   ├── scanner.ts                  # file system scan → ProjectSnapshot
│   │   └── project.ts                  # ts-morph Project singleton
│   ├── level/
│   │   ├── detector.ts                 # Lv1–10 cascade detection
│   │   └── types.ts                    # ArchitectureLevel union type, LevelResult
│   ├── rules/
│   │   ├── registry.ts                 # rule registration + level filtering
│   │   ├── runner.ts                   # executes rules, collects results
│   │   ├── index.ts                    # barrel export
│   │   └── implementations/
│   │       ├── fat-logic.ts            # Fat Logic (lines + prefix + type graph)
│   │       ├── fat-workflow.ts         # Fat Workflow (lines only)
│   │       └── fat-parse.ts            # Fat Parse (lines only, sharing OK)
│   ├── analysis/
│   │   ├── line-counter.ts             # ts-morph line/function counting
│   │   ├── prefix-checker.ts           # domain prefix extraction + mixing detect
│   │   └── type-dependency-graph.ts    # ts-morph AST → union-find groups
│   └── types/
│       ├── index.ts
│       ├── diagnostic.ts               # Diagnostic, Severity, DiagnosticLocation
│       ├── rule.ts                     # Rule, RuleContext, RuleResult
│       ├── analysis.ts                 # ProjectSnapshot, SourceFileInfo, DomainFolder
│       └── config.ts                   # KaachanConfig, FatThresholds, AnalysisResult
├── tests/
│   ├── fixtures/
│   │   ├── lv1/ … lv6/                 # real .ts files per level
│   │   └── fat-logic/                  # over-300, prefix-mixing, non-intersecting
│   ├── unit/                           # per-module unit tests
│   └── integration/                    # full CLI / analyzer integration tests
├── package.json
├── tsconfig.json
├── tsconfig.build.json
└── vitest.config.ts
```

---

## Key Types

```ts
// ArchitectureLevel — union type (enum is prohibited by code-style rules)
type ArchitectureLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10

// Severity
type Severity = "hint" | "warning" | "error"

// Diagnostic — primary output unit
interface Diagnostic {
  ruleId: string
  severity: Severity
  message: string
  location: { filePath: string; line?: number }
  details?: readonly string[]  // e.g. type group breakdown
  suggestion?: string          // shown in rules file context for AI
}

// Result type — used instead of throw in core logic
type Result<T, E = string> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E }

// Rule — implement this interface for every check
// No classes: rules are plain objects satisfying this interface
interface Rule {
  readonly id: string
  readonly activateFromLevel: ArchitectureLevel
  check(context: RuleContext): Promise<readonly Diagnostic[]> | readonly Diagnostic[]
}

// RuleContext — injected into every rule.check()
// ts-morph Project is passed as argument (no global/module-level mutable state)
interface RuleContext {
  readonly rootDir: string
  readonly level: ArchitectureLevel
  readonly snapshot: ProjectSnapshot
  readonly config: KaachanConfig
  readonly morphProject: import("ts-morph").Project  // passed in, not created per-rule
}
```

---

## Level Detection Algorithm (file-system only, no AST)

Cascade — each level requires all previous signals:

| Level | Required signals |
|---|---|
| Lv1 | `route.ts` exists |
| Lv2 | + `workflow.ts` + `middleware.ts` |
| Lv3 | + `parse.ts` |
| Lv4 | + `repository.ts` + `client.ts` |
| Lv5 | + `logic.ts` or `logic/` folder |
| Lv6 | + `app/` + `shared/` + ≥1 domain folder (`/^domain[A-Z]/`) |
| Lv7 | + any `cross-` prefixed folder |
| Lv8 | + `shared/events.ts` |
| Lv9 | + `infrastructure/` + any domain has `ports.ts` |
| Lv10 | + any domain has `command/` AND `query/` subfolders |

Both `rootDir/*.ts` and `rootDir/src/*.ts` are treated transparently (same level).

---

## Fat Detection Rules

### Thresholds (configurable via KaachanConfig)

| Condition | Severity |
|---|---|
| lines > 300 OR functions > 10 | hint |
| lines > 500 OR prefix mixing OR non-intersecting type groups | warning |
| `logic/` file > 300 lines OR prefix mixing unresolved | error |

### fat-logic (activates Lv5)
1. **Line/function count** — via ts-morph `getEndLineNumber()` + function node count
2. **Domain prefix mixing** — extract camelCase prefix from each exported function; if >1 distinct prefix in same file → warning listing conflicts
3. **Type dependency graph** — build `functionName → Set<TypeName>` via ts-morph TypeReference nodes; run union-find connected-components; if ≥2 disconnected groups → warning with group details

### fat-workflow (activates Lv2)
Line/function count only. No prefix or type-graph analysis.

### fat-parse (activates Lv3)
Line/function count only. Shared schemas explicitly allowed — message reflects this.

---

## Rule Activation by Level

| Rule ID | Active from |
|---|---|
| `fat-workflow` | Lv2 |
| `fat-parse` | Lv3 |
| `repo-naming` | Lv4 (post-MVP) |
| `fat-logic` | Lv5 |
| `dep-direction` | Lv6 (post-MVP) |

---

## CLI Interface

```bash
npx kaachan               # analyze current directory
npx kaachan ./src         # analyze specific path
npx kaachan --level       # show detected level + evidence only
npx kaachan --format json # machine-readable output
npx kaachan --disable-rule fat-workflow  # skip a specific rule
```

Exit code 0 = no errors. Exit code 1 = ≥1 error severity diagnostic.

---

## Public Library API (`src/core/index.ts`)

Slime FW can embed Kaachan via:
```ts
import { analyze, detectLevel, registerRule } from "kaachan"
import type { ArchitectureLevel, AnalysisResult, KaachanConfig } from "kaachan"
```

`analyze()` returns `Result<AnalysisResult, string>` — no throws from core logic.

Exported: `analyze`, `scanProject`, `detectLevel`, `getRulesForLevel`, `registerRule`, `runRules`, all types including `ArchitectureLevel` union type.

---

## `package.json` Key Fields

```json
{
  "type": "module",
  "main": "./dist/core/index.js",
  "bin": { "kaachan": "./dist/cli/index.js" },
  "dependencies": {
    "commander": "^12.0.0",
    "ts-morph": "^23.0.0",
    "typescript": "^5.4.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "vitest": "^1.0.0"
  }
}
```

`typescript` is a runtime dependency (ts-morph requires it at runtime to parse target projects).

---

## `tsconfig.json` Key Options

```json
{
  "module": "NodeNext",
  "moduleResolution": "NodeNext",
  "target": "ES2022",
  "strict": true,
  "exactOptionalPropertyTypes": true,
  "noUncheckedIndexedAccess": true,
  "declaration": true
}
```

`tsconfig.build.json` extends this with `rootDir: "./src"` and excludes `tests/`.

---

## Implementation Phases

### Phase 0 — Scaffold (project setup)
- `package.json`, `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts`
- Stub `src/cli/index.ts` that prints version and exits
- Verify `npx kaachan --help` works from `dist/`
- `.gitignore`, shebang on `dist/cli/index.js` via postbuild script

### Phase 1 — Scanner + ProjectSnapshot
- `src/core/scanner.ts` + `src/types/analysis.ts`
- Detects all structural signals (roles, domain folders, special folders)
- Unit tests with fixture directories `tests/fixtures/lv1/` through `lv6/`

### Phase 2 — Level Detector
- `src/level/detector.ts` + `src/level/types.ts`
- Cascade algorithm + `computeMissingForNextLevel`
- Unit tests for all 10 levels

### Phase 3 — Core Analyzer + CLI skeleton
- `src/core/analyzer.ts`, `src/core/index.ts`
- `src/cli/index.ts` with commander (level-only output working)
- `src/cli/formatters/console.ts` (level display)
- `npx kaachan --level` produces correct output end-to-end

### Phase 4 — ts-morph setup + fat-workflow + fat-parse
- `src/core/project.ts` — `createMorphProject(rootDir): Project` (pure factory function, no singleton)
- `src/analysis/line-counter.ts`
- `fat-workflow.ts` and `fat-parse.ts` rules with tests
- Full diagnostic output in console formatter

### Phase 5 — fat-logic: prefix checking
- `src/analysis/prefix-checker.ts`
- Prefix extraction, domain-prefix mixing detection branch of `fat-logic.ts`
- Tests against `tests/fixtures/fat-logic/prefix-mixing.ts`

### Phase 6 — fat-logic: type dependency graph (highest complexity)
- `src/analysis/type-dependency-graph.ts`
- Union-find connected-components on type reference sets
- TypeReference node collection via ts-morph
- Tests: union-find in isolation first, then full integration with fixture

### Phase 7 — JSON formatter + exit codes + polish
- `src/cli/formatters/json.ts`
- Exit code 1 on errors
- README with usage examples

---

## Verification

- Unit tests: each module tested in isolation using vitest
- Integration tests: `tests/integration/cli.test.ts` spawns `kaachan` process against fixtures, asserts stdout and exit codes
- Manual smoke test: run `npx kaachan` against a real Lv5 project with known Fat Logic issues
