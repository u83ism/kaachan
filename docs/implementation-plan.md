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

### Phase 7 — Lv4 rules: `repo-naming`

Active from Lv4. Import graph analysis via ts-morph `getImportDeclarations()`.

- `src/rules/implementations/repo-naming.ts`
  - `repository.ts` exported functions: naming convention violation (`find*`/`list*`/`get*`/`count*`/`search*` for reads, `create*`/`save*`/`update*`/`delete*`/`remove*` for writes) → hint
  - `workflow.ts`: direct ORM import (`prisma`, `drizzle`, etc.) → warning
- Tests: fixture `tests/fixtures/lv4-violations/` with naming violations and ORM imports
- Register in `BUILT_IN_RULES`

### Phase 8 — Lv5 rules: import violation detection

Active from Lv5. Detects forbidden imports in the Logic layer.

- `src/rules/implementations/logic-imports.ts`
  - `logic.ts` / `logic/*.ts` importing `repository.ts` or `client.ts` → error
  - Detection via ts-morph import graph analysis (no external tooling)
- Tests: fixture `tests/fixtures/lv5-violations/` with Logic files that import Store/Client
- Register in `BUILT_IN_RULES`

### Phase 9 — Lv6 rules: cross-domain dependency direction

Active from Lv6. Detects structural violations in the domain era.

- `src/rules/implementations/dep-direction.ts`
  - Cross-domain direct imports (domainA importing domainB) → error
  - Domain imported from outside `app/` → error
  - `shared/` importing from any domain folder → warning
- Detection via ts-morph import graph analysis across all source files in `ProjectSnapshot.sourceFiles`
- Tests: fixture `tests/fixtures/lv6-violations/` with cross-domain imports
- Register in `BUILT_IN_RULES`

### Phase 10 — Integration tests + README

- `tests/integration/cli.test.ts`: spawns `kaachan` process against fixture directories, asserts stdout and exit codes
- README with usage examples and level table

---

## Phase 11+ — Unimplemented Static Analysis Rules

Ordered by cost-effectiveness (implementation cost vs. enforcement value).

### Phase 11 — Lv5 補完: `logic-throws` + `logic-tests`

Two minimal Lv5 rules with low implementation cost.

#### `logic-throws` (new rule file: `src/rules/implementations/logic-throws.ts`)

Active from Lv5. Detects `throw` statements inside logic layer files.

- `logic.ts` and `logic/*.ts`: any `throw` statement → error
- Detection: ts-morph `getDescendantsOfKind(SyntaxKind.ThrowStatement)`
- Suggestion: "Return `err(...)` instead of throwing. Workflow may throw on receiving the error."
- Fixtures: `tests/fixtures/lv5-violations/logic-throw.ts`

#### `logic-tests` (new rule file: `src/rules/implementations/logic-tests.ts`)

Active from Lv5 (hint/warning). Escalates to error at Lv7 — same rule file, severity depends on `context.level`.

- `logic.ts` exists → check for corresponding `logic.test.ts` in `tests/` → missing: warning (Lv5–6), error (Lv7+)
- `logic/*.ts` files → check for corresponding `*.test.ts` in `tests/` or same folder → missing: warning (Lv5–6), error (Lv7+)
- Detection: `existsSync` on expected test paths (no AST required)
- Fixtures: `tests/fixtures/lv5-violations/logic-no-test.ts` (logic.ts without test)

---

### Phase 12 — Lv3 補完: `parse-violations`

New rule file: `src/rules/implementations/parse-violations.ts`. Active from Lv3.

#### Checks

1. **Parse imports DB (error)** — `parse.ts` imports any ORM package or `repository.ts` → error
   - Detection: `getImportDeclarations()` on parse.ts; filter by ORM_PACKAGES or path ending in `repository`
   - Message: `"parse.ts must not access DB — move DB calls to repository.ts and pass results as arguments"`

2. **Workflow contains parse-equivalent processing (warning)** — `workflow.ts` calls `JSON.parse` or accesses `req.body` / `unknown` coercions directly without going through `parse.ts`
   - Detection: `getDescendantsOfKind(SyntaxKind.CallExpression)` matching `JSON.parse`; also check if workflow.ts lacks an import from `parse.ts` when it accepts `unknown` parameters
   - Message: `"workflow.ts appears to parse input directly — extract to parse.ts"`
   - Note: heuristic detection; false-negatives acceptable, false-positives must be avoided

- Fixtures: `tests/fixtures/lv3-violations/` with parse-with-db-access.ts and workflow-with-parse.ts

---

### Phase 13 — Lv4 補完: `repo-orm-leak` + `workflow-transaction`

Extends Lv4 coverage. Can be added as new checks to existing `repo-naming` rule or as a separate `repo-advanced` rule file.

#### `repo-orm-leak` (add to `src/rules/implementations/repo-naming.ts` or new file)

Active from Lv4.

- `repository.ts` exported functions whose return type contains an ORM-generated type (e.g. `Prisma.User`, `UserDelegate`, model types from `@prisma/client`) → warning
- Detection: inspect return type annotations of exported functions via `getReturnTypeNode()`; check if the type text contains ORM package name strings
- Message: `"repository.ts returns an ORM type — return a plain domain type instead"`
- Suggestion: "Map the ORM record to a plain object before returning."

#### `workflow-transaction` (add to `src/rules/implementations/repo-naming.ts` or new file)

Active from Lv4.

- `workflow.ts` calls `prisma.$transaction(...)` or equivalent ORM transaction APIs directly → warning
- Detection: `getDescendantsOfKind(SyntaxKind.CallExpression)` matching `.$transaction(` pattern on ORM client identifiers
- Message: `"workflow.ts calls ORM transaction API directly — use slime.withTransaction() instead"`

- Fixtures: `tests/fixtures/lv4-violations/` — add `repo-orm-return.ts`, `workflow-transaction.ts`

---

### Phase 14 — Lv6 補完(1): `app-layer` + `client-acl`

New rule files active from Lv6.

#### `app-layer` (new file: `src/rules/implementations/app-layer.ts`)

Active from Lv6.

- `app/repository.ts` exists → warning: "App layer must not own DB access — move to a domain or shared/"
- `app/client.ts` exists → error: "App layer must not own external API calls — move to client/ with adapter.ts"
- `app/logic.ts` exists → error (Lv7+): "App layer must not contain business logic"
- Detection: `existsSync` on expected paths
- Fixtures: `tests/fixtures/lv6-violations/` — add `app-repository/`, `app-client/`

#### `client-acl` (new file: `src/rules/implementations/client-acl.ts`)

Active from Lv6.

- `client.ts` (in `client/` folder) imported by any file other than `adapter.ts` in the same `client/` folder → warning
- Detection: iterate `context.snapshot.sourceFiles`; for each file that imports from `client/client.ts`, check if the importing file's path is `client/adapter.ts`
- Message: `"client.ts must only be accessed via adapter.ts (ACL boundary)"`
- Fixtures: `tests/fixtures/lv6-violations/client-direct-import/`

---

### Phase 15 — Lv6 補完(2): `fat-routing`

New rule file: `src/rules/implementations/fat-routing.ts`. Active from Lv6.

#### Checks

1. **app/route.ts size** — exceeds hintLines/hintFunctions → hint; exceeds warningLines → warning
   - Reuses `measureFile` from `src/analysis/line-counter.ts`

2. **Route definitions remaining in app/route.ts (Lv6+)** — route.ts contains actual URL string literals (e.g. `'/users'`, `'/orders'`) → warning
   - Detection: `getDescendantsOfKind(SyntaxKind.StringLiteral)` filtered to path-looking strings (`/^\/`)
   - Message: `"app/route.ts defines routes directly — at Lv6, move to domain/*/routes.ts"`

3. **Dead route candidate** — route.ts imports a symbol from a path, but the target file does not exist → warning
   - Detection: resolve import specifiers from route.ts; check `existsSync` for each

4. **Unreachable Workflow candidate** — `workflow.ts` files in domain folders that are not imported by any route file → hint
   - Detection: collect all route files' import specifiers; flag domain workflow.ts files not in the import closure

- Note: `sunset` date detection (route with past expiry) is deferred — requires comment/annotation convention definition.
- Fixtures: `tests/fixtures/lv6-violations/fat-routing/`

---

### Phase 16 — Lv7 補完: `app-structure` + `nested-domain`

Adds Lv7-specific structural rules. `logic-tests` error escalation is handled by the existing `logic-tests` rule (severity is already level-dependent).

#### `app-structure` additions to `app-layer` rule (or extend rule)

Active from Lv7 (extend Phase 14 rule with level guard):

- `app/logic.ts` exists → error (already planned in Phase 14 as Lv7+)
- `app/repository.ts` → escalate from warning to error at Lv7
- `cross-*/app/` imports (cross- folder importing from App) → error
  - Detection: iterate source files in `cross-*` paths; find imports resolving to `app/`

#### `nested-domain` (new file: `src/rules/implementations/nested-domain.ts`)

Active from Lv7.

- **Sibling domain reference prohibited**: domainA imports directly from domainB (not via `cross-` or `shared/`) → error
  - Already partially covered by `dep-direction` (Lv6). Lv7 tightens: any non-parent→child reference → error
- **Parent→child only**: domainUser/child/ may be imported by domainUser/ but not by domainOrder/ → error
  - Detection: classify domain folders into parent/child hierarchy by path depth; validate import directions

- Fixtures: `tests/fixtures/lv7-violations/`

---

### Phase 17 — Lv8 補完: `events-validation` + `cross-folder-concerns`

New rule file: `src/rules/implementations/events-validation.ts`. Active from Lv8.

#### `events-validation`

- `shared/events.ts` exports types containing class instances (detected by `new` expressions in property types) → error
  - Detection: check exported type aliases/interfaces; flag if any property has a class type reference
- Event types missing a `type` discriminant field → warning
  - Detection: exported interfaces/type aliases in events.ts that lack a `readonly type: string` property

#### `cross-folder-concerns` (new file or extend `dep-direction`)

Active from Lv8.

- `cross-*` folder files importing mail/external API packages (e.g. nodemailer, sendgrid, axios, fetch calls to external) → warning
  - Message: "cross- folders are for transaction orchestration only — move external API calls to domain events + adapter"
- Detection: `getImportDeclarations()` on cross-* files; filter known external service packages

- Fixtures: `tests/fixtures/lv8-violations/`

---

### Phase 18 — Lv9 補完: `infrastructure-boundary`

New rule file: `src/rules/implementations/infrastructure-boundary.ts`. Active from Lv9.

#### Checks

1. **ORM import inside domain folders** — any file under `domainXxx/` that imports from ORM packages → error
   - Detection: iterate `context.snapshot.domainFolders`; for each domain's source files, check `getImportDeclarations()` for ORM_PACKAGES
   - Message: `"Domain files must not import ORM directly — use ports.ts + infrastructure/ adapter"`

2. **ORM operations outside infrastructure/** — any file not under `infrastructure/` that imports ORM packages → error
   - Same detection pattern, broader scope (all source files minus infrastructure/)

3. **Workflow not accepting Port as argument (hint)** — `workflow.ts` in domain folders that have `ports.ts` but whose exported functions take no function-type parameters → hint
   - Detection: check exported function signatures in workflow.ts; if `ports.ts` exists but no function-type parameter found → hint
   - This is a heuristic — false-negatives acceptable

- Fixtures: `tests/fixtures/lv9-violations/`

---

### Phase 19 — Lv10 補完: `cqrs-enforcement`

New rule file: `src/rules/implementations/cqrs-enforcement.ts`. Active from Lv10.

#### Checks

1. **ReadPort used inside `command/`** — files under `domain/*/command/` importing from `domain/*/query/ports.ts` or using types with "Read" prefix → error
   - Detection: import path analysis; flag `query/` imports appearing inside `command/` files

2. **query/ file bloat** — any single file under `domain/*/query/` exceeding hint threshold → hint
   - Reuses `measureFile` from `line-counter.ts`

3. **query/ shared abstraction** — multiple query files importing from a shared helper inside `query/` (not from `shared/` or `ports.ts`) → warning
   - Detection: find files inside `query/` that are imported by 2+ other files in the same `query/` folder

4. **Domain objects in query/** — files under `domain/*/query/` importing `logic.ts` or `logic/` from the same domain → warning
   - Message: "query/ should not import domain logic — use ReadPort and read models only"

- Fixtures: `tests/fixtures/lv10-violations/`

---

### Phase 20 — Lv2 補完: `route-inline`

Most complex phase — requires heuristic AST analysis. New rule file: `src/rules/implementations/route-inline.ts`. Active from Lv2.

#### Checks

1. **Inline handler in route.ts** — route handler arguments that are arrow functions or function expressions (rather than imported identifiers) → warning
   - Detection: find call expressions matching route registration patterns (`.get(`, `.post(`, `.put(`, `.delete(`, `.patch(`); inspect arguments; if last argument is `ArrowFunction` or `FunctionExpression` kind → warning
   - Message: `"route.ts defines an inline handler — extract to a Workflow file"`

2. **Cross-cutting concerns inside Workflow (Lv2)** — `workflow.ts` contains JWT verification, rate-limit logic patterns → warning
   - Detection: heuristic — `getImportDeclarations()` on workflow.ts for known auth packages (`jsonwebtoken`, `jose`, `passport`, etc.) → warning
   - Message: `"workflow.ts imports auth library directly — move to middleware.ts"`

- Note: intentionally conservative (false-negative tolerant) to avoid noise. Detects structural signals only, not semantic violations.
- Fixtures: `tests/fixtures/lv2-violations/`

---

## Rule Activation Summary (complete)

| Rule ID | Active from | Phase |
|---|---|---|
| `fat-workflow` | Lv2 | Phase 4 ✅ |
| `route-inline` | Lv2 | Phase 20 |
| `fat-parse` | Lv3 | Phase 4 ✅ |
| `parse-violations` | Lv3 | Phase 12 |
| `repo-naming` | Lv4 | Phase 7 ✅ |
| `repo-orm-leak` | Lv4 | Phase 13 |
| `workflow-transaction` | Lv4 | Phase 13 |
| `fat-logic` | Lv5 | Phase 4–6 ✅ |
| `logic-imports` | Lv5 | Phase 8 ✅ |
| `logic-throws` | Lv5 | Phase 11 |
| `logic-tests` | Lv5 (warn) → Lv7 (error) | Phase 11 |
| `dep-direction` | Lv6 | Phase 9 ✅ |
| `app-layer` | Lv6 | Phase 14 |
| `client-acl` | Lv6 | Phase 14 |
| `fat-routing` | Lv6 | Phase 15 |
| `app-structure` | Lv7 | Phase 16 |
| `nested-domain` | Lv7 | Phase 16 |
| `events-validation` | Lv8 | Phase 17 |
| `cross-folder-concerns` | Lv8 | Phase 17 |
| `infrastructure-boundary` | Lv9 | Phase 18 |
| `cqrs-enforcement` | Lv10 | Phase 19 |

---

## Verification

- Unit tests: each module tested in isolation using vitest
- Integration tests: `tests/integration/cli.test.ts` spawns `kaachan` process against fixtures, asserts stdout and exit codes
- Manual smoke test: run `npx kaachan` against a real Lv5 project with known Fat Logic issues
