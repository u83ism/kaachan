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
│   │   ├── export-rules.ts             # export:rules subcommand
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
│   │       ├── fat-parse.ts            # Fat Parse (lines + parse/ folder support, sharing OK)
│   │       ├── workflow-throws.ts      # Workflow new Error() direct throw detection
│   │       └── slime-config-hint.ts    # slime.config.ts absence hint (Lv5+)
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

`ArchitectureLevel` and `Severity` are imported from `@u83ism/architecture-rules` (the shared package). Do not re-define them locally.

```ts
// ArchitectureLevel — imported from @u83ism/architecture-rules
// type ArchitectureLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10

// Severity — imported from @u83ism/architecture-rules
// type Severity = "hint" | "warning" | "error"

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
| Lv4 | + `store.ts` + `client.ts` |
| Lv5 | + `logic.ts` or `logic/` folder |
| Lv6 | `app/` + `shared/` + ≥1 folder under `domains/` (e.g. `domains/user/`) |
| Lv7 | + ≥1 folder under `orchestrate/` (e.g. `orchestrate/order-inventory/`) |
| Lv8 | + `shared/events.ts` |
| Lv9 | + `infrastructure/` + any domain has `ports.ts` |
| Lv10 | + any domain has `command/` AND `query/` subfolders (`query/` holds one query per file; `ports.ts` may live in `command/` / `query/`) |

Both `rootDir/*.ts` and `rootDir/src/*.ts` are treated transparently (same level).

The labels and requirements come from `LEVEL_DEFINITIONS` in `@u83ism/architecture-rules` 0.2.0; `src/level/detector.ts` only maps each requirement label to a snapshot check (`REQUIREMENT_CHECKS`, with a test that every label has one).

Two starting points:

- Lv1–5 (flat): climb from Lv1 while the flat files in the source root meet each next level's requirements
- Lv6+ (domain structure): when `app/` + `shared/` + `domains/<name>/` exist, start at Lv6 and climb from there. The flat Lv1–5 files are not required, because from Lv6 they live in `app/`, `shared/` and `domains/`

With neither `route.ts` nor a domain structure, the level is `null` ("No Slime Architecture level detected"), no rules run, and `export:rules` exits 1.

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
When `parse/` folder exists: each file exceeding `errorLogicFolderLines` (300) → error. Mirrors fat-logic's `checkLogicFolder` behaviour.

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
npx kaachan --enable-rule defer-suggestion  # report an opt-in rule

npx kaachan export:rules                  # generate AI rules files (all formats)
npx kaachan export:rules --target claude  # generate CLAUDE.md only
npx kaachan export:rules --target cursor  # generate .cursor/rules only
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
    "@u83ism/architecture-rules": "file:../slime-architecture-rules",
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

`@u83ism/architecture-rules` is the shared package that provides `ArchitectureLevel`, `Severity`, `LAYER_FILES`, `FOLDER_NAMES`, `FOLDER_PATTERNS`, `LEVEL_DEFINITIONS`, `RULE_CATALOG`, and related types/constants. Kaachan imports from it rather than defining these locally.

The package is consumed via `file:` from the sibling `slime-architecture-rules` checkout (npm installs it as a symlink), so unpublished changes are picked up without an npm release. Its `main` points to `dist/`, which is gitignored there: run `npm run build` in `slime-architecture-rules` after changing it.

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

- Note: `sunset` date detection is out of scope — requires Slime FW to support `{ sunset: '...' }` route attributes, which is not yet implemented.
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

---

### Phase 21 — Lv3 補完: `fat-parse` フォルダ対応

Extends the existing `fat-parse` rule to handle the `parse/` folder — mirroring how `fat-logic` handles `logic/`.

#### Changes to `src/rules/implementations/fat-parse.ts`

- When `parse/` folder exists (detected via `ProjectSnapshot`), switch to folder-mode:
  - Each file in `parse/` exceeding `errorLogicFolderLines` (300 lines) → **error**
  - Message: `"parse/<file>.ts exceeds <N> lines — split further or restructure"`
- When `parse.ts` exists (no folder): existing hint/warning behaviour unchanged
- Scanner must expose `parseFolderFiles` (analogous to `logicFolderFiles`) and `hasParseFolder` on `ProjectSnapshot`

- Fixtures: `tests/fixtures/lv3-violations/parse-folder-bloat/` — parse/ folder with an oversized file

---

### Phase 22 — Lv5 補完: `workflow-throws`

New rule file: `src/rules/implementations/workflow-throws.ts`. Active from Lv5.

Detects `throw new Error(...)` in `workflow.ts` files and suggests the Result pattern.

This is distinct from `logic-throws` (which forbids **all** throws in Logic with **error** severity). Workflow **may** throw, but direct `new Error()` construction indicates the DomainError / TechnicalError split has not been adopted.

#### Check

- `workflow.ts` (root and inside domain folders): any `ThrowStatement` whose expression is `new Error(...)` → **warning**
  - Detection: `getDescendantsOfKind(SyntaxKind.ThrowStatement)`; filter to those whose expression is a `NewExpression` with callee text `"Error"`
  - Message: `"workflow.ts uses new Error() directly — define a DomainError string and return err(...) from Logic instead"`
  - Suggestion: "Register the error in slime.config.ts and use Result err from Logic or Adapter."

- Fixtures: `tests/fixtures/lv5-violations/workflow-new-error.ts`

---

### Phase 23 — Lv5 補完: `slime-config-hint`

New rule file: `src/rules/implementations/slime-config-hint.ts`. Active from Lv5.

At Lv5, Logic introduces DomainError strings. `slime.config.ts` is where those strings are mapped to HTTP status codes. If it does not exist, the mapping is absent.

#### Check

- Lv5+ and `slime.config.ts` does not exist in `rootDir` → **hint**
  - Detection: `existsSync(join(context.snapshot.sourceRoot, "slime.config.ts"))`
  - Message: `"slime.config.ts not found — create it to map DomainError strings to HTTP status codes"`
  - Suggestion: "Add an errors map: `{ errors: { USER_ALREADY_EXISTS: 409, ... } }`"

- Fixtures: `tests/fixtures/lv5-violations/no-slime-config/` — Lv5 structure without slime.config.ts

---

### Phase 24 — Lv6 補完: `fat-routing` ルート co-location チェック

Extends the existing `fat-routing` rule with a co-location completeness check.

At Lv6, route definitions are expected to move from `app/route.ts` into `domain/*/routes.ts`. Currently `fat-routing` detects that `app/route.ts` still contains URL literals, but does not detect domain folders that have `workflow.ts` but no `routes.ts`.

#### Additional check in `src/rules/implementations/fat-routing.ts`

- For each domain folder that has `workflow.ts` but lacks `routes.ts` → **hint**
  - Detection: `existsSync(join(domain.absolutePath, "routes.ts"))` for domains that have `workflow.ts`
  - Message: `"<domain>/workflow.ts exists but no routes.ts found — consider adding domain/*/routes.ts for co-location"`
  - Suggestion: "Create routes.ts in the domain folder and import it from app/route.ts."

- Fixtures: add `tests/fixtures/lv6-violations/fat-routing/domain-no-routes/`

---

### Phase 25 — `export:rules` CLI サブコマンド

New CLI subcommand that generates AI rules files from the detected architecture level and Kaachan thresholds. This is the "rules file" feature described in `kaachan-design.md`.

**Design principle**: Kaachan detects "what is happening". The rules file tells AI "what should be done". Thresholds in the rules file must match Kaachan's configured thresholds exactly.

#### New file: `src/cli/export-rules.ts`

Pure function that takes `AnalysisResult` + `KaachanConfig` and returns rules file content strings per target format. No side effects (I/O at CLI boundary only).

```ts
type RulesTarget = "claude" | "cursor" | "cline" | "gemini"

const generateRulesContent = (
  result: AnalysisResult,
  config: KaachanConfig,
  target: RulesTarget,
): string
```

#### Output paths per target

| Target | Output file |
|---|---|
| `claude` | `CLAUDE.md` |
| `cursor` | `.cursor/rules/slime-architecture.md` |
| `cline` | `.clinerules` |
| `gemini` | `GEMINI.md` |

Default (no `--target`): generate all formats.

#### Content structure

Each generated file includes:
1. Current architecture level and its name
2. Active constraints for the level (mirrors rules in `LEVEL_DEFINITIONS`)
3. Kaachan hint thresholds (lines/functions) — must match `config.thresholds` exactly
4. Domain split proposal instructions (when hint thresholds are exceeded)
5. Next-level migration guidance (`requiredFilesForNext` / `requiredFoldersForNext` from `LEVEL_DEFINITIONS`)

#### CLI wiring in `src/cli/index.ts`

```bash
kaachan export:rules                  # all targets, write to project root
kaachan export:rules --target claude  # CLAUDE.md only
kaachan export:rules [path]           # analyze path and write rules files there
```

- Exits 0 on success. Lists generated files.
- Fixtures: not required (output is deterministic from level + config)

---

## Phase 26+ — Catch-up with `@u83ism/architecture-rules` 0.2.0

Inventory taken 2026-10-25. Kaachan was built against 0.1.0 (published on npm). The shared package has since moved on (18 commits after the last `sync-docs` checkpoint `95f0734`), most notably:

- `bb6f300` — `cross-` folders became coordinators under `orchestrate/`; domain-to-domain dependencies are now declared as a DAG in `slime.config.ts`
- `f146689` — severities moved into `RULE_CATALOG` (`src/rules-catalog.ts`), the single source of truth (72 rules)
- `b0a7498` — domains moved under a `domains/` parent folder (`domains/user/`), coordinators under `orchestrate/` (`orchestrate/order-inventory/`)
- `repository.ts` was renamed to `store.ts`

Second inventory taken 2026-11-02 (`sync-docs` up to `4216d45`, 10 more commits). Additions reflected in the phases below:

- `7220d10` / `2cc023f` / `50f74a8` — store read functions are limited to four shapes (`find*ByIds` returning a `Map`, unique-key lookups, `list*(filter, page)`, `search*(query, page)`); new rules `store-orm-param`, `store-generic-filter`, `store-call-in-loop`; `search*` added to `store-naming`
- `8569049` / `4216d45` — table ownership per domain (`tables` in `slime.config.ts`, `TableOwnership` type); new rules `table-foreign-write`, `table-foreign-read`, `table-owner-duplicate`, `table-owner-undeclared`. Ownership starts from writes: cross-domain reads are a hint in Lv6–9 and a warning in Lv10, where `query/` read-side adapters may JOIN across domains
- `6bb8ec8` — Lv10 `query/` holds one query per file (`userList.ts`, `userDetail.ts`) instead of `query/workflow.ts`
- The catalog now has 79 rules

Status (2026-10-25): the dependency was switched to `file:../slime-architecture-rules` on branch `catch-up-architecture-rules`. On that branch `src/core/scanner.ts` no longer compiles (`FOLDER_PATTERNS.CROSS_PREFIX`, `FOLDER_PATTERNS.DOMAIN`, `LAYER_FILES.REPOSITORY` were removed), which fails 97 of 234 tests. On `main` (0.1.0) all 234 tests pass. After Phase 26 (2026-11-02): `src/` typechecks clean and all 254 tests pass. After Phase 28 (2026-11-02): all 263 tests pass. After Phase 29 (2026-11-02): all 271 tests pass. After Phase 30 (2026-11-02): all 288 tests pass. After Phase 31 (2026-11-02): all 305 tests pass. After Phase 32 (2026-11-02): all 314 tests pass. After Phase 34 (2026-11-02): all 325 tests pass. After Phase 35 (2026-11-02): all 336 tests pass.

The sibling checkout's `dist/` is gitignored, so it must be rebuilt (`npm run build` in `slime-architecture-rules`) whenever the source changes. Rebuilt on 2026-11-02 at `4216d45` (79 rules, `TableOwnership` exported).

Pre-existing, unrelated to the catch-up: `npm run typecheck` reports 27 errors on `main` — 24 in `tests/fixtures/` (fixtures are type-checked although they import packages that are not installed or omit `.js` extensions) and 3 in `tests/unit/type-dependency-graph.test.ts` (`.sort()` on `readonly string[]`).

### Phase 26 — Scanner: current folder structure ✅

- Recognize domains as the folders directly under `domains/`, coordinators as the folders directly under `orchestrate/` (`FOLDER_NAMES.DOMAINS`, `FOLDER_NAMES.ORCHESTRATE`). Non-kebab-case names are still recognized, so that `folder-name-not-kebab-case` (Phase 31) can report them
- `hasRepository` → `hasStore` (`LAYER_FILES.STORE`); `crossFolders` → `orchestrateFolders` (name + absolute path)
- Collect the paths of each layer file wherever it lives (`snapshot.layerFiles`): the source root, `app/`, `shared/`, each domain and its `command/` / `query/`, and each coordinator; `logic/` and `parse/` folders included (store, workflow, parse, logic). Rules currently hard-code `join(sourceRoot, "repository.ts")` etc., so from Lv6 they find nothing — e.g. the Lv6 error escalation of `store-naming` / `store-orm-return-type` would never fire. Rules switched to these lists in Phase 28
- Level detection reads `LEVEL_DEFINITIONS` (`getLevelDefinition`) for evidence labels and the files/folders missing for the next level, instead of duplicating them in `src/level/detector.ts`
- A project without `route.ts` was reported as Lv1 (the detector started from 1). It now reports that no level was detected (`level: null`)
- The Lv6+ domain structure is detected without the flat Lv1–5 files (see Level Detection Algorithm), and `ports.ts` in `command/` / `query/` counts for Lv9/Lv10
- Mechanical renames in the rules so they keep working on the new layout: `repository.ts` → `store.ts`, `cross-*` → `orchestrate/*`, domain names in messages as `domains/<name>/`. Rule IDs, severities and levels are unchanged (Phase 27/28)
- Rebuilt the fixtures on the new layout and added `no-level/`, `lv6-domains-only/` and `lv10-cqrs-ports/`

### Phase 27 — Rule IDs and severities from `RULE_CATALOG` ✅

- Each diagnostic uses the catalog rule ID (e.g. `logic-size-hint`), not the module-level ID (`fat-logic`). Modules may keep emitting several catalog IDs
- Severity comes from `getRuleSeverity(rule, level)`; remove hard-coded severities. A diagnostic whose rule is inactive at the current level is not emitted
- Implemented as: modules return `Finding`s (no severity) and declare their catalog IDs in `ruleIds` (typed as a literal union per module); `runRules` adds the catalog severity and drops inactive or disabled findings. A module runs when any of its `ruleIds` is active, so `activateFromLevel` is gone
- `--disable-rule` accepts a catalog rule ID (drops those findings) or a module ID (skips the module)
- `tests/unit/registry.test.ts` checks that every reported ID is in the catalog, that no ID belongs to two modules, and lists the 37 catalog rules not implemented yet
- Remove checks that the catalog no longer has:
  - `nested-domain` — absorbed into the domain DAG
  - `dep-direction`: "file outside `app/` imports from a domain" — replaced by the DAG
  - `fat-routing`: the `app/route.ts` growth hint — the catalog only has `app-route-size` (warning)

### Phase 28 — Fix the rules whose detection drifts from the catalog ✅

Since Phase 27 the severities and active levels already follow the catalog (e.g. `slime-config-missing` and `workflow-throws-plain-error` from Lv3, `workflow-orm-import` and `client-direct-import` as errors, `app-owns-logic` as a warning at Lv6). Phase 28 fixed what each rule detects:

| Catalog rule | Before | Now |
|---|---|---|
| `route-handler-non-http` | `route-inline` flagged every inline handler | Thin handlers doing HTTP I/O only are allowed. A handler is flagged when it uses a name imported from a store/logic module or an ORM package, or a top-level variable initialized from one (`const prisma = new PrismaClient()`) |
| `workflow-throws-plain-error` | The message always said "use Result err" (wrong advice in Lv3–4) | The message depends on the level — Lv3–4: throw a typed `DomainError`, Lv5+: return `err()` up to the route |
| `logic-store-client-import` | `logic-imports` flagged only specifiers whose last segment is `store` or `client` | Also flags DB/ORM package imports |

- All rules on layer files (`store-*`, `workflow-*`, `parse-*`, `logic-*`) read `snapshot.layerFiles` instead of fixed root paths, so they keep working after the Lv6 domain split (e.g. `store-naming` now reports an error for `domains/user/store.ts` at Lv6). A file inside `logic/` / `parse/` gets the folder checks, a `logic.ts` / `parse.ts` the single-file checks. New rules in Phases 30–35 do the same
- The ORM package list, the subpath-aware ORM import check (`drizzle-orm/pg-core` counts) and source file loading live in `src/analysis/layer-modules.ts` instead of four copies
- `domain-undeclared-import` moved to Phase 29, because it needs the dependency declaration
- New fixtures `lv3-workflow-new-error/` and `lv6-domain-layer-files/`; `lv2-violations/route.ts` now has three DB-calling handlers and one thin handler

### Phase 29 — Read the domain DAG and table ownership from `slime.config.ts` ✅

- `src/core/slime-config.ts` reads the `domains` (`DomainDependencies`) and `tables` (`TableOwnership`) declarations statically with ts-morph; the file is never executed. Supported forms: an object literal default export, a wrapper call (`defineConfig({...})`), `satisfies` / `as`, and identifiers of variables in the same file. Each list must be an array of string literals
- The result is passed to rules as `RuleContext.slimeConfig` (`{ kind: "missing" }` or `{ kind: "found", domains, tables }`). `slime-config-hint` uses it instead of checking the file itself
- A `slime.config.ts` that cannot be read statically stops the analysis (`analyze` returns an error, the CLI exits 1). Reading nothing would make every declared dependency look undeclared
- `domain-undeclared-import` (moved from Phase 28) allows the imports declared in `domains`. Without a declaration, every domain-to-domain import is still an error. `app/` and `orchestrate/` are not checked, since they may import any domain
- `tables` is read but not used yet; `domain-dependency-cycle` comes in Phase 31 and the `table-*` rules in Phase 32
- New fixtures `lv6-declared-deps/` and `lv6-unreadable-config/`; parser unit tests in `tests/unit/slime-config.test.ts`

The 37 catalog rules not implemented yet are split into Phases 30–35, grouped by level and by what the detection needs. Implement in this order. Severities come from the catalog (Phase 27), and every rule on layer files reads `snapshot.layerFiles` (Phase 28). When a rule is implemented, remove its ID from `NOT_YET_IMPLEMENTED` in `tests/unit/registry.test.ts`.

### Phase 30 — Lv2–5 rules (8) ✅

- Route and workflow: `route-api-namespace`, `workflow-http-access`, `workflow-calls-parse`, `workflow-throws-domain-error`
- Store: `store-orm-param`, `store-generic-filter`, `store-call-in-loop`
- Logic: `logic-missing-prefix`

Detection:

| Catalog rule | Module | How it is detected |
|---|---|---|
| `route-api-namespace` | `route-namespace` | A route definition in a `route.ts` (`x.get("/path", handler)` etc.) whose path does not start with `/api`, outside a call that opens an `/api` group (`group({ prefix: "/api" }, ...)`, `route("/api", ...)`, `basePath("/api")` in the receiver chain). Infrastructure paths (`/health`, `/healthz`, `/ready`, `/live`, `/ping`, `/metrics`, `/webhooks` and their subpaths) are allowed. Domain `routes.ts` files are written without a prefix and are not checked |
| `workflow-http-access` | `workflow-http` | A workflow imports an HTTP framework (`express`, `hono`, `fastify`, `koa`, `next/server`, …), or an exported workflow function has a parameter typed `Request` / `Response` / `Context` / `NextFunction` / `FastifyRequest` etc. |
| `workflow-calls-parse` | `workflow-http` | A workflow calls a name imported from a parse module (`./parse.js`, `./parse/user.js`). Type-only use of parse types is fine |
| `workflow-throws-domain-error` | `workflow-throws` | `throw new DomainError(...)` in a workflow. The catalog activates it from Lv5, so the recommended Lv3–4 form is never reported |
| `store-orm-param` | `repo-advanced` | A parameter type of an exported store function refers to a name imported from an ORM package (`Prisma.UserWhereInput`, `Knex.QueryBuilder`). Names are matched as whole identifiers, now also for `store-orm-return-type` |
| `store-generic-filter` | `store-filter` | In a store file, a property named `field` / `column` / `op` / `operator` / `orderBy` / `sortBy` / … typed `string` (or `string[]`, or a union containing it); or a read function (`find*` / `list*` / `get*` / `count*` / `search*`) taking `Record<string, …>` or a `[key: string]` index signature |
| `store-call-in-loop` | `store-in-loop` | In a workflow, a call to a name imported from a store module inside a loop body (`for` / `for...of` / `for...in` / `while` / `do`) or a callback passed to `forEach` / `map` / `flatMap` / `filter` / `reduce` / `some` / `every` / `find` / `findIndex`. The iterated expression (`for (const u of await listUsers())`) runs once and is not flagged |
| `logic-missing-prefix` | `logic-prefix` | An exported logic function whose leading word states a judgment without a domain: `can`, `is`, `has`, `should`, `must`, `may`, `check`, `validate`, `verify`, `ensure`, `assert`, `allow` (`canEdit`, `isAdult`). Domain-first judgments (`userCanEdit`) and domain calculations (`calcOrderTotal`, `formatInvoiceNumber`) pass. Test files are skipped |

- Shared helpers moved to `src/analysis/layer-modules.ts`: `importedNames`, `namesImportedFrom`, `usedIdentifiers`, `isRelativeLayerImport`, `exportedFunctions`
- New fixtures `lv4-store-queries/` and `lv5-domain-error/`; `lv3-workflow-new-error/` gained a `DomainError` throw (not reported at Lv3)

### Phase 31 — Lv6 structure and the domain DAG (7) ✅

| Catalog rule | Module | How it is detected |
|---|---|---|
| `folder-name-not-kebab-case` | `folder-names` | Folders directly under `domains/` and `orchestrate/` against `FOLDER_PATTERNS.KEBAB_CASE`; the suggestion gives the kebab-case name |
| `domain-dependency-cycle` | `dep-direction` | Cycles in `domains` of `slime.config.ts` (`src/analysis/domain-graph.ts`): one finding per strongly connected component, shown as the shortest cycle from its alphabetically first domain (`order → user → order`). A self-dependency counts |
| `error-code-missing-prefix` | `error-codes` | UPPER_SNAKE_CASE string literals in `domains/<name>/errors.ts` that do not start with the domain prefix (`order-item` / `orderItem` → `ORDER_ITEM_`) |
| `shared-side-effects` | `shared-layer` | In `shared/utility.ts` and `shared/smallLogic.ts`: value imports of Node I/O built-ins (`fs`, `http`, `child_process`, …), HTTP clients (`axios`, …), ORM packages or store/client modules; calls to `fetch`, `console.*`, timers or `process.*`; module-level `let` / `var`. Type-only imports are fine |
| `shared-size` | `shared-layer` | A file under `shared/` longer than `thresholds.warningLines` (500) |
| `app-size` | `app-layer` | A file under `app/` other than `app/route.ts` (which has `app-route-size`) longer than `thresholds.warningLines` (500) |
| `route-sunset-passed` | `route-sunset` | A `sunset: "YYYY-MM-DD"` property in a `route.ts` / `routes.ts` whose date is before today |

- The catalog states `shared-size` and `app-size` without numbers. They reuse the threshold of `app-route-size` (`warningLines`, per file); change it together with the theory if it turns out too loose
- "Today" is `KaachanConfig.today` (YYYY-MM-DD), defaulting to the current local date in `analyze`; rules read it from `RuleContext.today`, so they stay deterministic in tests
- `isInsideDir` moved to `src/analysis/layer-modules.ts`, next to a new `relativeImports` helper
- New fixture `lv6-structure/`

### Phase 32 — Lv6 table ownership (4) ✅

- `table-foreign-write`, `table-foreign-read`, `table-owner-duplicate`, `table-owner-undeclared` (module `table-ownership`, uses `tables` of `slime.config.ts`, read in Phase 29)

Detection (`src/analysis/table-access.ts`):

- Tables are identified by ORM model names in code. Prisma style: `<client>.<model>.<method>()` (`prisma.user.findMany()`, `tx.order.create()`, `db.query.users.findFirst()`); reads are `findUnique` / `findFirst` / `findMany` / `count` / `aggregate` / `groupBy` (and `*OrThrow`), writes are `create` / `createMany` / `update` / `updateMany` / `upsert` / `delete` / `deleteMany`. Drizzle style: `insert(t)` / `update(t)` / `delete(t)` (writes) and `from(t)` (reads), counted only when `t` is an imported name, so that `cache.delete(key)` is not a table
- Checked files: domain store files (`layerFiles.store` inside `domains/<name>/`, `command/` / `query/` included) and every file under `infrastructure/<name>/` (Lv9+). `shared/store.ts` is the home of undeclared tables and is not checked
- Read-side files are exempt from `table-foreign-read`: a path segment `query` below the domain / adapter folder, or a file name containing "query" (`infrastructure/order/queryAdapter.ts`)
- Each table and access kind is reported once per file, at its first access. Without a `tables` declaration every touched table is `table-owner-undeclared` (a hint, meant as the inventory for the declaration)
- New fixtures `lv6-tables/` and `lv10-tables/`; extraction unit tests in `tests/unit/table-access.test.ts`

### Phase 33 — Lv6 domain merge / re-cut hints (2)

- `domain-pair-coordinated`, `domain-folder-thin`

Both are hints, and the catalog states them without numbers. Decide the thresholds before implementing:

- `domain-pair-coordinated` — how many co-occurrences of the same domain pair in `app/` or `orchestrate/` count as "repeatedly"
- `domain-folder-thin` — what "very little in it" means (line count, number of layer files, or both)

### Phase 34 — Lv7–8 rules (7) ✅

| Catalog rule | Module | How it is detected |
|---|---|---|
| `domain-imports-orchestrate` | `orchestrate-boundary` | A relative import in a file under `domains/<name>/` that resolves into an `orchestrate/<name>/` folder |
| `orchestrate-imports-orchestrate` | `orchestrate-boundary` | A relative import in a file under `orchestrate/<a>/` that resolves into another `orchestrate/<b>/` |
| `orchestrate-without-transaction` | `transactions` | No file of an `orchestrate/<name>/` folder calls `withTransaction()` (bare or as a method, e.g. `slime.withTransaction()`) |
| `defer-suggestion` | `transactions` | Inside the callback of a `withTransaction()` call, a call to `fetch` or to a name imported from an external service package (mail, payments, HTTP clients — the list shared with `orchestrate-non-transactional-io`) or from a client module (`client.ts`, `client/adapter.ts`), unless it is inside `defer(...)` |
| `events-file-missing` | `events-validation` | `shared/events.ts` does not exist |
| `events-imports-domain` | `events-validation` | A relative import in `shared/events.ts` that resolves into `domains/` or `orchestrate/` |
| `event-type-not-upper-snake` | `events-validation` | A string literal in the type of a `type` property in `shared/events.ts` that is not UPPER_SNAKE_CASE |

- **Opt-in rules**: the catalog marks `defer-suggestion` "opt-in" and has no field for it, so Kaachan keeps the list (`OPT_IN_RULES` in `src/rules/runner.ts`). Its findings are dropped unless the rule is listed in `KaachanConfig.enabledRules` (CLI: `--enable-rule defer-suggestion`)
- `events-file-missing` never fires on a detected level: Lv8 detection itself requires `shared/events.ts`, so a project without it is detected as Lv7. The rule is implemented as the catalog states and tested with the level fixed
- `lv8-clean/shared/events.ts` used dotted lowercase event types (`user.created`); it now uses UPPER_SNAKE_CASE as the theory requires
- `EXTERNAL_SERVICE_PACKAGES` moved to `src/analysis/layer-modules.ts`
- New fixture `lv8-orchestrate/`

### Phase 35 — Lv9–10 rules (9) ✅

| Catalog rule | Module | How it is detected |
|---|---|---|
| `infrastructure-missing` | `ports-adapters` | No `infrastructure/` folder in the source root |
| `domain-imports-infrastructure` | `ports-adapters` | A relative import in a file under `domains/<name>/` that resolves into `infrastructure/` |
| `ports-has-implementation` | `ports-adapters` | A top-level statement in `ports.ts` (domain, `command/`, `query/`) other than a type alias, interface, import or re-export |
| `store-remains` | `ports-adapters` | Any store file except `app/store.ts` (reported by `app-owns-store`), `shared/store.ts` included: the theory removes the word "store" from Lv9 on |
| `cqrs-folders-missing` | `cqrs-sides` | A domain with a `workflow.ts` but without both `command/` and `query/`. Domains without a workflow (upstream domains with only `logic.ts` / `ports.ts`, like `domains/auth/` in the theory's Lv10 layout) are exempt |
| `query-imports-write-port` | `cqrs-sides` | A `query/` file importing from the domain's `command/`, from a command adapter (`infrastructure/**/command*.ts`), or a name ending in `WritePort` |
| `query-writes` | `cqrs-sides` | In a `query/` file, a table write (Phase 32 detection) or a call to a method starting with `create` / `save` / `update` / `delete` / `remove` / `insert` / `upsert` |
| `command-returns-view-model` | `cqrs-sides` | An exported function in `command/workflow.ts` whose return type annotation (including the inner function of a port-injected `(port) => async (input) => ...` workflow) names a type ending in `View` / `ViewModel` / `ReadModel` / `Projection` |
| `query-multiple-per-file` | `cqrs-sides` | A `query/` file other than `ports.ts` with more than one exported function |

- Level detection already expects one query per file: `hasQuery` only checks that `query/` exists, and `ports.ts` in `command/` / `query/` counts for Lv9 (Phase 26)
- `infrastructure-missing` never fires on a detected level, like `events-file-missing`: Lv9 detection itself requires `infrastructure/`. Tested with the level fixed
- New fixtures `lv9-ports/` and `lv10-sides/`

Not in the catalog yet (proposals in the theory repository, do not implement until they land in `RULE_CATALOG`):

- Capability-gated rules (`requires: Capability[]` on `RuleDefinition`, capabilities detected from code): `queue-*`, `defer-enqueue`, `outbox-outside-transaction` (「非同期・キュー導入 設計方針」) and `job-*` (「Slime FW詳細設計」 — job management)

### Phase 36 — `export:rules` from the shared templates

- Replace the hard-coded `LEVEL_CONSTRAINTS` in `src/cli/export-rules.ts` with the shared templates (`rulesTemplateSpecifier`, `renderRulesForTarget`, `RULES_TARGETS`), so generated rules files carry the same guidance as `rules/_content/lv*.md`
- Reconcile the target list: Kaachan has `claude` / `cursor` / `cline` / `gemini`; the shared package has `claude` / `codex` / `gemini` / `cursor`
- Validate `--target` against the target IDs and exit with an error for unknown values (it is currently cast to the type unchecked)
- Existing files at the destination are overwritten as a whole, as today (decided 2026-11-02; no marker-based partial replacement)

### Phase 37 — Docs sync ✅

- The theory repository was renamed from `kaachan-and-slime-docs` to `slime-architecture-rules`: updated `CLAUDE.md`, `README.md` and `.claude/skills/sync-docs/SKILL.md`
- Ran `sync-docs` from `95f0734` to `4216d45` (2026-11-02) and updated `overview.md` / `kaachan-design.md`

Order: 26 → 27 → 28 → 29 → 30 → 31 → 32 → 33 → 34 → 35. Phases 36 and 37 are independent.

---

## Rule Activation Summary (complete)

| Rule ID | Active from | Phase |
|---|---|---|
| `fat-workflow` | Lv2 | Phase 4 ✅ |
| `route-inline` | Lv2 | Phase 20 ✅ |
| `fat-parse` | Lv3 | Phase 4 ✅ (parse/ folder: Phase 21) |
| `parse-violations` | Lv3 | Phase 12 ✅ |
| `repo-naming` | Lv4 | Phase 7 ✅ |
| `repo-orm-leak` | Lv4 | Phase 13 ✅ |
| `workflow-transaction` | Lv4 | Phase 13 ✅ |
| `fat-logic` | Lv5 | Phase 4–6 ✅ |
| `logic-imports` | Lv5 | Phase 8 ✅ |
| `logic-throws` | Lv5 | Phase 11 ✅ |
| `logic-tests` | Lv5 (warn) → Lv7 (error) | Phase 11 ✅ |
| `workflow-throws` | Lv5 | Phase 22 |
| `slime-config-hint` | Lv5 | Phase 23 |
| `dep-direction` | Lv6 | Phase 9 ✅ |
| `app-layer` | Lv6 | Phase 14 ✅ |
| `client-acl` | Lv6 | Phase 14 ✅ |
| `fat-routing` | Lv6 | Phase 15 ✅ (co-location: Phase 24) |
| `app-structure` | Lv7 | Phase 16 ✅ |
| `nested-domain` | Lv7 | Phase 16 ✅ |
| `events-validation` | Lv8 | Phase 17 ✅ |
| `cross-folder-concerns` | Lv8 | Phase 17 ✅ |
| `infrastructure-boundary` | Lv9 | Phase 18 ✅ |
| `cqrs-enforcement` | Lv10 | Phase 19 ✅ |
| `export:rules` CLI | — | Phase 25 |

Since Phase 27, diagnostics carry the 79 catalog rule IDs; the IDs above are the module IDs (see the module → catalog rule table in README.md).

---

## Verification

- Unit tests: each module tested in isolation using vitest
- Integration tests: `tests/integration/cli.test.ts` spawns `kaachan` process against fixtures, asserts stdout and exit codes
- Manual smoke test: run `npx kaachan` against a real Lv5 project with known Fat Logic issues
