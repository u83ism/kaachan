# Kaachan — Design Specification

> Source: `slime-architecture-rules/docs/ja/Kaachan設計仕様.md` and `Lv別アーキテクチャリファレンス.md`
>
> Severities and activation levels are defined by `RULE_CATALOG` (`src/rules-catalog.ts` in `@u83ism/architecture-rules`). The tables below are explanatory; when they disagree, the catalog wins.

---

## Fat Logic Prevention Strategy

The greatest risk of the Logic layer is **unbounded growth before domain splitting (Lv6)**. Monitoring line count alone and telling users to "split your domains" is insufficient. Four approaches are combined to address this.

### 1. Domain Prefix Naming Enforcement

Logic functions **must have a domain-indicating prefix**: `userCan*`, `orderCan*`, `paymentCan*`, etc. This is the same idea as requiring `find*`/`create*` for Store functions at Lv4. Simply naming functions this way creates a "draft" of domain boundaries. Kaachan detects violations via static analysis.

### 2. Intermediate Promotion to `logic/` Folder

Domain splitting at Lv6 is a large task — extracting store, workflow, and logic all at once. As an intermediate step **before** that, promotion to a `logic/` folder is allowed and encouraged. `logic/user.ts`, `logic/order.ts` etc. become the blueprint for future domain splitting and lower the barrier to Lv6 migration.

### 3. Type Dependency Graph Analysis for Concern Separation

`ts-morph` AST analysis can determine which types each Logic function references. **Function groups with zero type dependency intersection are mechanically detectable as domain candidates.** Kaachan detects and reports them:

```
⚠️  Non-intersecting type dependency groups detected in logic.ts
  Group A: userCanCreate, userCanUpdateProfile (User type family)
  Group B: orderCanPlace, orderCanShip (Order/Item type family)
  → Consider splitting into logic/user.ts and logic/order.ts (consistent with prefix naming)
```

### 4. Kaachan and Rules File Role Division

| Responsibility | Owner |
|---|---|
| Detecting line count, prefix mixing, type non-intersection (objective facts) | Kaachan (static analysis) |
| Understanding the context of "why split" and proposing specific splits | AI via rules file |
| Final decision on "where to cut" | User + AI dialogue |
| Detecting signs for merging / re-cutting domains (the same domain pair coordinated repeatedly, thin domains) | Kaachan (hint only, never escalated) |

Kaachan detects "what is happening". The rules file tells AI "what should be done". This clear role separation allows each to cover what the other cannot.

### Escalation Stages (3 Levels)

| Stage | Condition | Catalog rule |
|---|---|---|
| Hint | >300 lines OR >10 functions | `logic-size-hint` |
| Warning | >500 lines OR prefix mixing OR non-intersecting type groups detected | `logic-size-warning` |
| Error | Any file in `logic/` exceeds 300 lines OR prefix mixing unresolved | `logic-folder-file-too-large` |

---

## Fat Parse Problem

The same structural risk as Fat Logic exists in `parse.ts`. As the number of domains grows past Lv6, parse functions for `createUser`, `updateUser`, `listUsers`, `placeOrder`, etc. all pile up in a single file.

The same intermediate promotion pattern as `logic.ts` → `logic/` applies:

```
parse.ts      # initial (threshold exceeded → prompted to promote to parse/)
parse/
  createUser.ts
  updateUser.ts
  listUsers.ts
  placeOrder.ts
```

**Difference from Logic**: parse legitimately has cases where "the same schema is used across multiple endpoints". Therefore "no sharing" is NOT enforced — sharing is allowed and only bloat is detected. Threshold and escalation stages are the same as Logic (`parse-size-hint`, `parse-size-warning`, `parse-folder-file-too-large`).

---

## Store Read Function Shapes (Lv4+)

Adding a `findByXxx` per condition makes near-duplicate functions pile up; accepting arbitrary conditions turns the store into raw SQL written outside it. Store read functions are limited to four shapes:

| Shape | Form | Use |
|---|---|---|
| By IDs | `find*ByIds(ids): Promise<Map<id, T>>` (the batch version is canonical; a single-ID version may derive from it) | Fetch update targets and related entities |
| Unique key / lock | `findUserByEmail(email)`, row-locking fetches | Inherently single-row fetches |
| Filter | `list*(filter, page)` — `filter` is a closed type defined by the store | Lists and search forms; add fields to the type, not new functions |
| Condition expression | `search*(query, page)` — an AND/OR tree whose fields and operators are closed sets | Advanced search builders where users compose the condition |

The line is drawn by **whether the vocabulary is closed**, not by whether the shape is generic. Screen-specific JOINs/aggregations get use-case-named functions (`listOrdersForDashboard`); from Lv10 these move to `query/`.

| Check | Catalog rule |
|---|---|
| Function name outside `find*` / `list*` / `get*` / `count*` / `search*` / `create*` / `save*` / `update*` / `delete*` / `remove*` | `store-naming` |
| ORM type in the return type | `store-orm-return-type` |
| ORM type or query builder as a parameter (e.g. `Prisma.UserWhereInput`) | `store-orm-param` |
| Filter/query field names or operators typed as open types such as `string` | `store-generic-filter` |
| Store function called inside a loop (`for` / `forEach` / `map`, etc.) — N+1 candidate | `store-call-in-loop` |

`store-call-in-loop` stays a hint: the loop count is unknown statically. Whether N+1 actually happens (and whether indexes are missing) is judged by Slime FW runtime metrics, not by Kaachan.

---

## Table Ownership (Lv6+)

Splitting `store.ts` per domain does not decouple domains if any store can touch any table. The dependency DAG is applied to the DB as well by **declaring the owning domain of each table** in `slime.config.ts` (`TableOwnership` type):

```ts
// slime.config.ts
export default {
  domains: {
    auth: [],
    user: ['auth'],
    order: ['auth', 'user'],
  },
  // key: domain; value: tables it owns, written as the ORM model names that appear in code
  tables: {
    auth: ['session'],
    user: ['user', 'userProfile'],
    order: ['order', 'orderItem'],
  },
}
```

| Check | Catalog rule |
|---|---|
| A domain store writes to a table owned by another domain | `table-foreign-write` |
| A domain store reads another domain's table directly (Lv6–9: inventory hint; Lv10: warning, move it to a `query/` read-side adapter) | `table-foreign-read` |
| More than one domain declares the same table | `table-owner-duplicate` |
| A domain store touches a table with no declared owner (undeclared tables belong in `shared/store.ts`) | `table-owner-undeclared` |

- Ownership starts from writes, since broken writes do more damage. Read ownership is settled in Lv10 together with `query/`
- From Lv9 the rules apply to the `infrastructure/<domain>/` adapters. In Lv10, read-side (`query/`) adapters may JOIN across owners; write-side adapters still touch only owned tables
- Only the table ↔ domain mapping is in scope. Table design itself (normalization, indexes, types, naming) is out of scope

---

## Error HTTP Boundary Mapping

**DomainError / TechnicalError two-class system** is adopted.

| Class | Meaning | HTTP Code |
|---|---|---|
| **DomainError** | Business rejection: Logic Result err OR client/adapter Result err (external rejection translated to domain vocabulary) | 4xx |
| **TechnicalError** | Uncaught throw / DB failure / network error | 500 |

Error codes are declared as types (`errors.ts` in Lv3–5, `domains/xxx/errors.ts` from Lv6). The code → HTTP status map lives in `slime.config.ts`, and `satisfies Record<DomainErrorCode, number>` forces every code to be registered:

```ts
// slime.config.ts
export default {
  errors: {
    USER_ALREADY_EXISTS: 409,
    OUT_OF_STOCK: 422,
  } satisfies Record<DomainErrorCode, number>,
}
```

| Lv | How business rejections are expressed |
|---|---|
| Lv3–4 | Workflow throws a typed `DomainError` |
| Lv5+ | Logic and client Result errs are returned by the workflow (early return) up to the route |

**Slime auto-covers**: Parse failure → 400, Middleware rejection → 401/403/429, business rejection → the mapped 4xx, uncaught throw → 500. Error responses use Problem Details (RFC 9457) with an extension member `code` (`ProblemDetails`, `BUILT_IN_ERROR_CODES` in the shared package). Logic and domains never need to know about HTTP.

**Kaachan checks**: a workflow throwing a plain `Error` (`workflow-throws-plain-error`, from Lv3), and from Lv5 a workflow throwing `DomainError` instead of returning `err()` (`workflow-throws-domain-error`). From Lv6, domain error codes must carry the domain prefix (`USER_*` for `domains/user`, `error-code-missing-prefix`).

---

## Dependency Direction Static Analysis

Kaachan performs **cross-domain and cross-layer dependency direction checks** equivalent to `deptrac` (PHP) or `dependency-cruiser` (JS/TS).

### Rules by Level

| Rule | Detection Method | Active From |
|---|---|---|
| Logic imports Store or Client → error | Import graph analysis | Lv5+ |
| Domain-to-domain import not in the declared DAG, or a cycle in the declaration | Import graph + `domains` in `slime.config.ts` | Lv6+ |
| Store access to tables owned by another domain | ORM model names in store code + `tables` in `slime.config.ts` | Lv6+ |
| Domain imports `orchestrate/`; `orchestrate/` folders import each other or `app/` | Import graph analysis | Lv7+ |
| Workflow must not directly import ORM | Import graph analysis | Lv4+ |
| ORM operations outside `infrastructure/` prohibited | Import graph analysis | Lv9+ |

**Reading `slime.config.ts`**: Kaachan reads `domains` and `tables` statically from the default export and never executes the file. The default export may be an object literal, a wrapper call (`defineConfig({...})`), `satisfies` / `as`, or a variable in the same file, and every list must be an array of string literals. If the file cannot be read that way, the analysis stops with an error, because reading nothing would make every declared dependency look undeclared. `app/` and `orchestrate/` may import any domain regardless of the declaration.

**Detection limits**: Import graph analysis can catch structural violations (wrong import direction). Semantic violations — business rules leaking into wrong layers (e.g. a hardcoded threshold in Store that happens to be a domain rule) — are not detectable by static analysis. The rules file provides AI with business context to catch what Kaachan cannot.

Dependency rules are auto-configured to match the architecture level. When `slime migrate --to-level 7` upgrades the level, the analysis targets automatically expand.

### Implementation Approach

| Option | Advantage |
|---|---|
| Embed `dependency-cruiser` | Standardized rule definitions; compatible with existing ecosystem |
| Implement independently in Kaachan | Easy integration with Slime-specific level-linked rule system |

The theory leans toward embedding `dependency-cruiser`. Kaachan currently implements the checks itself on top of `ts-morph`.

---

## Fat Routing Detection

Same structural risk as Fat Logic/Parse exists in `app/route.ts`. From Lv6, route definitions co-locate with domains (`domains/xxx/routes.ts`, written without a prefix) — `app/route.ts` becomes an aggregator that keeps only the `/api` namespace grouping.

### Checks

| Condition | Catalog rule | Active from |
|---|---|---|
| API route defined outside the `/api` group | `route-api-namespace` | Lv2 (hint) |
| Route handler does more than HTTP I/O (calls store / logic / DB) | `route-handler-non-http` | Lv2 hint → Lv3 warning |
| `app/route.ts` still contains route definitions | `app-route-defines-routes` | Lv6 (warning) |
| `app/route.ts` is growing | `app-route-size` | Lv6 (warning) |
| Route definition references a Workflow file that does not exist | `route-dead-target` | Lv6 (warning) |
| Workflow file exists but is not referenced by any route | `workflow-unreachable` | Lv6 (hint) |
| Domain folder has no `routes.ts` | `domain-missing-routes` | Lv6 (hint) |
| Route has a `sunset` date that has passed | `route-sunset-passed` | Lv6 (warning) |

Note: "dead route" detection via static analysis covers file existence checks only. Actual traffic-based dead route analysis requires runtime access logs — out of Kaachan's scope.

---

## Rules File Detailed Design

Static analysis cannot answer "how do I split domains?" or "how do I perform migration?" The rules file provides indirect AI intervention for these questions.

**Consistency with "FW must not call AI" policy**: The FW does not call AI via API. Instead, the **FW prepares the preconditions (rules file) under which AI operates**. The initiator is always the user. No contradiction.

### Templates

The rules templates live in the shared package (`rules/_content/lv1.md` … `lv10.md`, importable as `@u83ism/architecture-rules/rules/lv5.md`). Kaachan's `export:rules` is to render them for each target tool (`RULES_TARGETS`, `renderRulesForTarget`) instead of keeping its own constraint text (Phase 31; it currently uses hard-coded `LEVEL_CONSTRAINTS` and the targets `claude` / `cursor` / `cline` / `gemini`).

### Threshold Synchronization

**Kaachan's Hint threshold and the rules file threshold must be kept at the same value**. This ensures a consistent message: "Kaachan issues a warning → AI continues to suggest" — the user always receives a coherent signal.

### Target Tools

`RULES_TARGETS` in the shared package defines the targets:

| `--target` | Output |
|---|---|
| `claude` | `CLAUDE.md` |
| `codex` | `AGENTS.md` |
| `gemini` | `.gemini/styleguide.md` |
| `cursor` | `.cursor/rules/slime.mdc` (with frontmatter) |

```bash
kaachan export:rules --target cursor   # generate .cursor/rules/slime.mdc only
kaachan export:rules --target claude   # generate CLAUDE.md only
kaachan export:rules                   # generate all formats
```

---

## Not Yet in the Catalog

Proposals in the theory repository that Kaachan must not implement until they land in `RULE_CATALOG`:

- **Capability-gated rules** — rules enabled when a capability is detected in code (`queue`, `outbox`, `job`) rather than by level alone, via a `requires` field on `RuleDefinition`. Candidates: `queue-entry-parse`, `queue-idempotency-key`, `queue-principal-system`, `defer-enqueue`, `outbox-outside-transaction`, and job-dependency rules such as `job-undeclared-dependency` (a job reads tables another job writes without declaring `after`)
