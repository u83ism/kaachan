# Slime FW — Detailed Design

> Source: `kaachan-and-slime-docs/Slime FW詳細設計.md` and `🤤 僕の考えた最強の次世代Webアプリケーションフレームワーク（案）.md`

---

## Metrics Auto-Instrumentation

### Design Concept

Slime Architecture enforces that "DB access always goes through `repository.ts`", "external API calls always go through `client.ts`", and "use cases always go through Workflow". This allows the FW to **transparently wrap each boundary** and collect metrics without users writing any measurement code — similar to Laravel's query logging, but covering boundaries beyond DB (external API, Workflow).

### Auto-Collectible Metrics

| Boundary | Metrics Collected |
|---|---|
| Workflow | Execution time, success/error rate |
| Repository | Query time, row count, slow query detection |
| Client | HTTP status, latency, timeout rate |
| Parse | Validation error rate |
| Middleware | Auth failure rate, rate limit trigger count |

### Level-Linked Auto-Instrumentation

Instrumentation targets expand as the architecture level increases:
- **Lv1–3**: Workflow only (Workflow exists from Lv2)
- **Lv4**: Repository/Client separation → added as instrumentation targets
- **Lv6+**: Domain-separated Workflows/Repositories → per-domain metrics become available naturally

### Metrics Destinations and Cost Problem

Sending metrics directly from the app to CloudWatch etc. results in massive costs (API call count × data points).

#### OpenTelemetry (OTel) Strategy (Primary)

The modern solution: **insert an OpenTelemetry Collector between app and backend**:
1. App sends to local Collector only (nearly free)
2. Collector aggregates and batches per-minute before sending (drastically reduces API calls)

Slime core handles "send to local Collector via OTel SDK". Routing beyond the Collector (CloudWatch / Grafana / Datadog etc.) is delegated to plugins and user configuration:

```
Slime app → OTel Collector (local) → [CloudWatch / Grafana / Datadog]
                                           ↑ configured via @slime/metrics-* plugins
```

Additional benefits: backends can be swapped later; multiple destinations can receive simultaneously.

#### CloudWatch EMF Strategy (AWS-only alternative)

**CloudWatch EMF (Embedded Metric Format)**: Structured JSON written to CloudWatch Logs automatically extracted as metrics. Cheaper than PutMetricData API and captures logs + metrics simultaneously.

#### Low-Level Defaults

For low levels, stdout output (with OS logrotate or Docker log driver for rotation) is sufficient. OTel Collector connection is a natural introduction point at Lv4+ when Repository/Client separation begins and auto-instrumentation starts delivering value.

---

## Level Migration Strategy

### Position

Slime's core value proposition is "smooth upscaling", and Level migration is the central feature enabling this. Implementation complexity is the highest in the entire FW — **this is the reason for the name "Slime" (it changes shape as it grows)**.

### Command Interface

```bash
slime migrate --to-level 6    # migrate to Lv6
slime migrate --dry-run       # preview changes (no actual file changes)
slime level:next              # preview next level's directory structure
slime level:current           # analyze and display current level
```

### Migration Steps (Conceptually Clear)

1. Analyze current file structure to determine current level
2. Generate target level's directory structure
3. Move files
4. Auto-fix import paths
5. Files with ambiguous destination (e.g., "which domain does this belong to?") → interactive confirmation

### Biggest Challenge

**Auto-fixing broken references after file moves (steps 3–5)** is the hardest part.

| Approach | Content | Challenge |
|---|---|---|
| LSP (Language Server Protocol) | Delegate import analysis to TypeScript Language Server | Complex LSP integration |
| `ts-morph` static analysis | Rewrite import paths via AST analysis | May be weak against dynamic imports and type re-exports |
| Combination | Use both LSP + ts-morph | High implementation cost |

Feasibility requires verification.

### Ambiguous File Problem During Domain Splitting

When running `slime migrate --to-level 6`, automatically determining "is this file user domain or order domain?" is difficult for the FW. Proposed approaches:

1. **Interactive CLI**: List ambiguous files and confirm with the user one by one
2. **Prefix heuristics**: Suggest candidates based on function name prefix (`userCan*` etc.) — no auto-confirmation
3. **AI context output**: `slime export:migrate-context` outputs ambiguous file list for AI, enabling dialogue-based decision making

---

## Infra-Slime (Concept)

> Slime's vision extends beyond code architecture — **scaling infrastructure configuration to match the app's level**. "If you follow Mom's instructions, the server won't go down."

### Command and Level Mapping

```bash
slime eject infra --level 5  # output optimal infrastructure definitions for current level
```

| Level Range | Recommended Infrastructure |
|---|---|
| Lv 1–3 | SQLite + single container (Docker Compose, one VPS) |
| Lv 4–7 | PostgreSQL + Redis + app container (DB/app separation, managed DB recommended) |
| Lv 8+ | Managed DB + queue service + serverless/k8s (cloud-native) |

This command generates `Dockerfile` and `Terraform` / `CDK` code optimized for the current level. The concept of "code scales → infrastructure scales" does not exist in any existing FW — a potential unique differentiator.

Each cloud provider's implementation differs significantly, so these are provided as plugins (`@slime/infra-aws`, `@slime/infra-gcp`, `@slime/infra-fly` etc.) rather than core FW features.

### Limitations and Complement

**Limitation**: Level alone cannot determine optimal infrastructure. An app at Lv3 with 1M users needs a completely different setup. Level-based recommendations are templates, not prescriptions.

**Complement: Metrics integration**

```bash
slime export:infra-context  # output Level + metrics summary in one file
```

| Metric | Inference |
|---|---|
| High DB query time | Read replica or Redis cache |
| Normal DB time but slow response | App server scale-out |
| Concentrated traffic on specific endpoints | CDN / edge cache |
| Right-trending memory usage | Instance size-up or memory leak |

Slime itself does **not** analyze metrics and recommend infrastructure (= FW calling AI). Instead, `slime export:infra-context` outputs Level info and metrics summary as a file, and **AI agents read it and make decisions** — maintaining the separation.

### AWS-Specific Status (as of February 2026)

AWS released [Agent Plugins for AWS](https://aws.amazon.com/blogs/developer/introducing-agent-plugins-for-aws/) (`deploy-on-aws` plugin) as OSS. This MCP server suite adds skills to coding agents like Claude Code and Cursor to analyze codebases, recommend AWS services, estimate costs, and generate CDK/CloudFormation.

If `slime export:infra-context` outputs Slime Level and metrics as context, the `deploy-on-aws` plugin's Analyze phase can read it for higher-accuracy recommendations. **Building `@slime/infra-aws` from scratch may be less efficient than delegating AWS-specific decisions to `deploy-on-aws` and having Slime focus on context provision.**

**Division of responsibilities**:
- Lightweight template generation (Dockerfile, docker-compose.yml) based on level → remains useful regardless of plugin availability
- Serious cloud optimization → delegate to external ecosystem

---

## Slime FW Feature Catalog

### Authentication & Security

- **2FA (Two-Factor Authentication)**: TOTP (Google Authenticator etc.), SMS, email — multiple methods. `slime.auth({ twoFactor: true })` at middleware level.
- **Idempotency Keys**: Prevent duplicate execution (payments, orders). `Idempotency-Key` header detection → cache result → return same result on retry.
- **PII Masking**: Auto-mask personal data (email, phone) in logs and error reports. GDPR / personal data protection law compliance.

### Data Management

- **Multi-tenancy**: Row Level Security (PostgreSQL RLS), schema isolation, and DB isolation — select via config. Tenant auto-injection in request scope.
- **Type-safe pagination (cursor-based)**: `findList({ cursor, limit })` → `{ data, nextCursor, hasMore }`. Cursor-based (large datasets) and offset-based both supported. Integrates naturally with Lv4+ Repository `find*` functions.
- **Audit Trail**: Auto-record "who, when, what, how changed". Compatible with command-side Workflow layer boundary hooks at Lv8+.
- **File storage abstraction**: Unified interface for local, S3, and GCS. Implemented as a Client layer Adapter from Lv6+.

### Developer Experience (DX)

- **Environment variable type-safe validation (startup check)**: Define env var types and required conditions in `slime.config.ts` with Zod schema → validated all at once on startup. Eliminates "missing env var discovered only after production startup".
- **DB Seeder / Factory (`slime db:seed`)**: Type-safe Factory integrated with Faker.js. `slime make:factory` generates scaffolding.
- **API Playground**: Auto-serves `/docs` (Scalar etc.) in dev environment from `slime export:openapi` spec. Auto-disabled in production.
- **CLI command definition framework**: `slime make:command SendNewsletterCommand` generates scaffolding with typed args/options. Natural integration with batch processing and scheduled tasks.

### Infrastructure & Operations

- **Feature Flags**: Control enable/disable of new features.
- **Health Check / Readiness Probe**: Auto-provided `/health` and `/ready` endpoints with custom check support (DB connectivity, external API etc.).
- **Circuit Breaker / Exponential Backoff Retry**: `slime.client({ retries: 3, circuitBreaker: true })` style API. Works with Client layer Adapter.
- **Graceful Shutdown**: Complete in-flight requests on SIGTERM before shutdown. Critical for `slime.withTransaction()` and `slime.defer()` integrity.

### API Design

- **API Versioning (with deprecation management)**: `/v1/`, `/v2/` coexistence. `Deprecation` and `Sunset` headers as route definition attributes.
- **Inbound Webhook processing**: Signature verification, idempotency check, event routing — all handled at FW level. `@slime/webhook-stripe` etc. as plugins.
- **Outbound Webhook management**: Retry logic, signature generation, delivery log, delivery status management. `@slime/webhook-outbound` plugin.

---

## AI and FW Relationship Policy

**Slime and Kaachan do NOT call AI from the FW side.** Two reasons:

1. **The relationship is inverted**: Naturally, AI uses the FW. Developers ask AI to "restructure this code to Slime Lv6". Having the FW call AI inverts this relationship.

2. **Duplication with questionable ROI**: Users already leverage AI while using the FW. Having the FW also call AI creates duplicate judgments. For domains requiring business knowledge (like domain splitting), delegating to the user's AI is sufficient.

Kaachan's capabilities are limited to AST/static analysis scope. Its role is indirect: "notify when AI consultation is appropriate (detect bloat → hint)".

**However**, the reverse direction — **FW outputting context for AI input** — should be actively supported:

```bash
slime export:rules     # generate rules file for current level (.cursor/rules, CLAUDE.md, etc.)
slime export:skills    # generate Slime structure/command context for AI
slime export:schema    # generate frontend types/validation schemas from parse.ts
slime export:openapi   # generate OpenAPI 3.x spec from route definitions and parse schemas
slime level:next       # preview next level's directory structure
```

This strengthens the natural relationship of "AI uses the FW". **Not FW→AI, but FW prepares AI's context.**
