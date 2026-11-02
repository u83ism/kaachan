import { describe, it, expect } from "vitest"
import { RULE_CATALOG, getRuleDefinition } from "@u83ism/architecture-rules"
import { BUILT_IN_RULES, getRulesForLevel } from "../../src/rules/registry.js"
import { runRules } from "../../src/rules/runner.js"
import type { Rule, RuleContext } from "../../src/types/rule.js"
import type { ProjectSnapshot } from "../../src/types/analysis.js"
import type { Project } from "ts-morph"

/** Catalog rules no module reports yet (Phases 33–35). Remove an ID here when its rule is implemented */
const NOT_YET_IMPLEMENTED = [
  "domain-pair-coordinated",
  "domain-folder-thin",
  "domain-imports-orchestrate",
  "orchestrate-imports-orchestrate",
  "defer-suggestion",
  "events-file-missing",
  "events-imports-domain",
  "event-type-not-upper-snake",
  "orchestrate-without-transaction",
  "infrastructure-missing",
  "domain-imports-infrastructure",
  "ports-has-implementation",
  "store-remains",
  "cqrs-folders-missing",
  "query-imports-write-port",
  "query-writes",
  "command-returns-view-model",
  "query-multiple-per-file",
]

const reportedIds = BUILT_IN_RULES.flatMap((r) => r.ruleIds)

describe("BUILT_IN_RULES and RULE_CATALOG", () => {
  it("reports only rule IDs that exist in the catalog", () => {
    const unknown = reportedIds.filter((id) => getRuleDefinition(id) === undefined)
    expect(unknown).toEqual([])
  })

  it("assigns each catalog rule to at most one module", () => {
    const duplicates = reportedIds.filter((id, i) => reportedIds.indexOf(id) !== i)
    expect(duplicates).toEqual([])
  })

  it("covers every catalog rule except the ones not implemented yet", () => {
    const uncovered = RULE_CATALOG.map((r) => r.id).filter((id) => !reportedIds.includes(id))
    expect(uncovered).toEqual(NOT_YET_IMPLEMENTED)
  })
})

describe("getRulesForLevel", () => {
  it("activates a module when any of its catalog rules is active", () => {
    // fat-logic reports logic-* rules, which start at Lv5
    const ids = (level: 4 | 5) => getRulesForLevel(BUILT_IN_RULES, level).map((r) => r.id)
    expect(ids(4)).not.toContain("fat-logic")
    expect(ids(5)).toContain("fat-logic")
  })
})

describe("runRules", () => {
  const context = (level: RuleContext["level"], disabledRules: readonly string[] = []): RuleContext => ({
    rootDir: "/project",
    level,
    snapshot: {} as ProjectSnapshot,
    slimeConfig: { kind: "missing" },
    config: {
      rootDir: "/project",
      disabledRules,
      thresholds: { hintLines: 300, hintFunctions: 10, warningLines: 500, errorLogicFolderLines: 300 },
    },
    morphProject: {} as Project,
    today: "2026-11-02",
  })

  const fixedRule: Rule<"app-owns-store" | "orchestrate-imports-app"> = {
    id: "fixed",
    ruleIds: ["app-owns-store", "orchestrate-imports-app"],
    check: () => [
      { ruleId: "app-owns-store", message: "store", location: { filePath: "app/store.ts" } },
      { ruleId: "orchestrate-imports-app", message: "import", location: { filePath: "orchestrate/a/workflow.ts" } },
    ],
  }

  it("takes the severity from the catalog for the current level", async () => {
    const lv6 = await runRules([fixedRule], context(6))
    const lv7 = await runRules([fixedRule], context(7))
    expect(lv6.find((d) => d.ruleId === "app-owns-store")?.severity).toBe("warning")
    expect(lv7.find((d) => d.ruleId === "app-owns-store")?.severity).toBe("error")
  })

  it("drops findings whose rule is not active at the level", async () => {
    // orchestrate-imports-app starts at Lv7
    const lv6 = await runRules([fixedRule], context(6))
    expect(lv6.map((d) => d.ruleId)).toEqual(["app-owns-store"])
  })

  it("drops findings of rule IDs listed in disabledRules", async () => {
    const result = await runRules([fixedRule], context(7, ["app-owns-store"]))
    expect(result.map((d) => d.ruleId)).toEqual(["orchestrate-imports-app"])
  })
})
