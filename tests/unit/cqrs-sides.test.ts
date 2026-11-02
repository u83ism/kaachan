import { describe, it, expect } from "vitest"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { dirname } from "node:path"
import { analyze } from "../../src/core/analyzer.js"
import type { KaachanConfig } from "../../src/types/config.js"
import type { Diagnostic } from "../../src/types/diagnostic.js"
import { isFrom } from "../helpers.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const fixturesDir = join(__dirname, "../fixtures")

const makeConfig = (rootDir: string): KaachanConfig => ({
  rootDir,
  disabledRules: [],
  thresholds: {
    hintLines: 300,
    hintFunctions: 10,
    warningLines: 500,
    errorLogicFolderLines: 300,
  },
})

const diagnosticsOf = async (fixture: string, moduleId: string): Promise<readonly Diagnostic[]> => {
  const result = await analyze(makeConfig(join(fixturesDir, fixture)))
  if (!result.ok) throw new Error(result.error)
  return result.value.diagnostics.filter((d) => isFrom(d, moduleId))
}

const summaries = (diags: readonly Diagnostic[], ruleId: string): readonly string[] =>
  diags.filter((d) => d.ruleId === ruleId).map((d) => `${d.severity}: ${d.message}`)

describe("cqrs-sides rule", () => {
  it("warns at a domain with a workflow but no command/ and query/, and exempts an upstream domain without one", async () => {
    expect(summaries(await diagnosticsOf("lv10-sides", "cqrs-sides"), "cqrs-folders-missing")).toEqual([
      "warning: domains/order/ has no command/ and query/ — from Lv10 writes and reads are split",
    ])
  })

  it("reports a query importing the WritePort", async () => {
    expect(summaries(await diagnosticsOf("lv10-sides", "cqrs-sides"), "query-imports-write-port")).toEqual([
      'error: domains/user/query/userList.ts imports the write side ("../command/ports.js")',
    ])
  })

  it("reports a query calling a write method", async () => {
    expect(summaries(await diagnosticsOf("lv10-sides", "cqrs-sides"), "query-writes")).toEqual([
      "error: domains/user/query/userList.ts calls writePort.save() — the query side has no side effects",
    ])
  })

  it("warns at a query file with more than one query", async () => {
    expect(summaries(await diagnosticsOf("lv10-sides", "cqrs-sides"), "query-multiple-per-file")).toEqual([
      "warning: domains/user/query/userSearch.ts has 2 queries (userSearch, userCount) — one query per file",
    ])
  })

  it("warns at a port-injected command workflow returning a view model", async () => {
    expect(summaries(await diagnosticsOf("lv10-sides", "cqrs-sides"), "command-returns-view-model")).toEqual([
      "warning: domains/user/command/workflow.ts: renameUserWorkflow() returns UserProfileView — building views is the query side's job",
    ])
  })

  it("emits nothing for the clean Lv10 fixture", async () => {
    expect(await diagnosticsOf("lv10-cqrs-ports", "cqrs-sides")).toHaveLength(0)
  })
})
