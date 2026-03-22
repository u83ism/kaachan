import { join, basename, dirname, relative } from "node:path"
import { existsSync } from "node:fs"
import type { Diagnostic, Severity } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_ID = "logic-tests"

const testFileCandidates = (filePath: string, rootDir: string): readonly string[] => {
  const name = basename(filePath, ".ts")
  const fileDir = dirname(filePath)
  const relDir = relative(rootDir, fileDir)

  return [
    // Co-located test file
    join(fileDir, `${name}.test.ts`),
    join(fileDir, `${name}.spec.ts`),
    // tests/ folder mirroring relative path
    join(rootDir, "tests", relDir, `${name}.test.ts`),
    join(rootDir, "tests", relDir, `${name}.spec.ts`),
    // __tests__ folder mirroring relative path
    join(rootDir, "__tests__", relDir, `${name}.test.ts`),
    join(rootDir, "__tests__", relDir, `${name}.spec.ts`),
  ]
}

const hasTestFile = (filePath: string, rootDir: string): boolean =>
  testFileCandidates(filePath, rootDir).some(existsSync)

const missingSeverity = (level: number): Severity => (level >= 7 ? "error" : "warning")

const checkLogicFile = (
  filePath: string,
  rootDir: string,
  level: number,
): readonly Diagnostic[] => {
  if (hasTestFile(filePath, rootDir)) return []

  return [
    {
      ruleId: RULE_ID,
      severity: missingSeverity(level),
      message: `Logic file has no corresponding test file: ${basename(filePath)}`,
      location: { filePath },
      details: testFileCandidates(filePath, rootDir).map((p) => `  expected: ${p}`),
      suggestion: "Add a test file for every logic function. Logic correctness must be verified.",
    },
  ]
}

export const logicTestsRule: Rule = {
  id: RULE_ID,
  activateFromLevel: 5,
  check(context: RuleContext): readonly Diagnostic[] {
    const diagnostics: Diagnostic[] = []
    const { rootDir, level, snapshot } = context

    if (snapshot.hasLogic && !snapshot.hasLogicFolder) {
      const filePath = join(snapshot.sourceRoot, "logic.ts")
      diagnostics.push(...checkLogicFile(filePath, rootDir, level))
    }

    for (const logicFilePath of snapshot.logicFolderFiles) {
      diagnostics.push(...checkLogicFile(logicFilePath, rootDir, level))
    }

    return diagnostics
  },
}
