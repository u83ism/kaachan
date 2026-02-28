# Kaachan — Design Specification

> Source: `kaachan-and-slime-docs/Kaachan設計仕様.md`

---

## Fat Logic Prevention Strategy

The greatest risk of the Logic layer is **unbounded growth before domain splitting (Lv6)**. Monitoring line count alone and telling users to "split your domains" is insufficient. Four approaches are combined to address this.

### 1. Domain Prefix Naming Enforcement

Logic functions **must have a domain-indicating prefix**: `userCan*`, `orderCan*`, `paymentCan*`, etc. This is the same idea as requiring `find*`/`create*` for Repository functions at Lv4. Simply naming functions this way creates a "draft" of domain boundaries. Kaachan detects violations via static analysis.

### 2. Intermediate Promotion to `logic/` Folder

Domain splitting at Lv6 is a large task — extracting repository, workflow, and logic all at once. As an intermediate step **before** that, promotion to a `logic/` folder is allowed and encouraged. `logic/user.ts`, `logic/order.ts` etc. become the blueprint for future domain splitting and lower the barrier to Lv6 migration.

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

Kaachan detects "what is happening". The rules file tells AI "what should be done". This clear role separation allows each to cover what the other cannot.

### Escalation Stages (3 Levels)

| Stage | Condition | Type |
|---|---|---|
| Hint | >300 lines OR >10 functions | Informational |
| Warning | >500 lines OR prefix mixing OR non-intersecting type groups detected | Structural problem |
| Error | Any file in `logic/` exceeds 300 lines OR prefix mixing unresolved | Blocks migration |

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

**Difference from Logic**: parse legitimately has cases where "the same schema is used across multiple endpoints". Therefore "no sharing" is NOT enforced — sharing is allowed and only bloat is detected. Threshold and escalation stages are the same as Logic.

---

## Error HTTP Boundary Mapping

**DomainError / TechnicalError two-class system** is adopted.

| Class | Meaning | HTTP Code |
|---|---|---|
| **DomainError** | Logic Result err / business-rule violation | 4xx |
| **TechnicalError** | Uncaught throw / DB failure etc. | 500 |

A `slime.config.ts` mapping of DomainError strings → HTTP codes is the single source of truth. Any throws not in the map are automatically treated as TechnicalError (500):

```ts
// slime.config.ts
export default {
  errors: {
    USER_ALREADY_EXISTS: 409,
    UNAUTHORIZED: 403,
    OUT_OF_STOCK: 422,
    NOT_FOUND: 404,
    // throws not in this map → automatically 500 (TechnicalError)
  }
}
```

**Slime auto-covers**: Parse failure → 400, Middleware rejection → 401/403/429, Uncaught throw → 500. Users only register Logic Result err strings. Logic never needs to know about HTTP.

**Introduction timing**: Lv5 (same time Logic is introduced). Kaachan issues a warning for direct `new Error()` throws and prompts use of Result err + error string map registration.

---

## Dependency Direction Static Analysis

Kaachan performs **cross-domain and cross-layer dependency direction checks** equivalent to `deptrac` (PHP) or `dependency-cruiser` (JS/TS). Active from Lv6+.

### Rules by Level

| Rule | Detection Method | Active From |
|---|---|---|
| Cross-domain mutual references prohibited | Import graph analysis | Lv6+ |
| Domain references allowed only from App | Import graph analysis | Lv6+ |
| Workflow must not directly import ORM | Import graph analysis | Lv4+ |
| ORM operations outside infrastructure/ prohibited | Import graph analysis | Lv9+ |

Dependency rules are auto-configured to match the architecture level. When `slime migrate --to-level 7` upgrades the level, the analysis targets automatically expand.

### Implementation Approach

| Option | Advantage |
|---|---|
| Embed `dependency-cruiser` | Standardized rule definitions; compatible with existing ecosystem |
| Implement independently in Kaachan | Easy integration with Slime-specific level-linked rule system |

**Current direction**: Embedding `dependency-cruiser` is the leading candidate. Slime-specific level-linked rules can be handled by having Slime dynamically generate `dependency-cruiser` configuration files.

---

## Rules File Detailed Design

Static analysis cannot answer "how do I split domains?" or "how do I perform migration?" The rules file provides indirect AI intervention for these questions.

**Consistency with "FW must not call AI" policy**: The FW does not call AI via API. Instead, the **FW prepares the preconditions (rules file) under which AI operates**. The initiator is always the user. No contradiction.

### Example Rules File for Lv5

```markdown
# Generated by slime export:rules (Level: 5)

## Domain Split Proposal Rules
If workflow.ts or logic.ts exceeds 300 lines / 10 functions:
1. Propose domain modeling to the user
2. Help the user verbalize business concern groupings
3. Present a folder structure proposal with user approval
4. Suggest Lv6 migration (confirm structure with `slime level:next`)

## Slime Lv5 Constraints
- Logic functions must have domain prefixes (userCan*, orderCan*, etc.)
- Logic functions must return Result type (no throwing)
- Logic functions must have tests
- parse must not access DB
```

### Threshold Synchronization

**Kaachan's Hint threshold and the rules file threshold must be kept at the same value**. This ensures a consistent message: "Kaachan issues a warning → AI continues to suggest" — the user always receives a coherent signal.

### Rules File Format Problem

Rules file formats are currently fragmented (`.cursor/rules`, `CLAUDE.md`, `.clinerules`, `GEMINI.md`, etc.). The implementation policy for how to handle target tool selection is TBD.

```bash
slime export:rules --target cursor   # generate .cursor/rules only
slime export:rules --target claude   # generate CLAUDE.md only
slime export:rules                   # generate all formats (default candidate)
```
