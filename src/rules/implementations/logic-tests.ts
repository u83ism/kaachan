import { join, basename, dirname, relative } from "node:path"
import { existsSync } from "node:fs"
import type { Finding } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_IDS = [
  "logic-test-missing",
] as const
type Id = (typeof RULE_IDS)[number]

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

const checkLogicFile = (
  filePath: string,
  rootDir: string,
): readonly Finding<Id>[] => {
  if (hasTestFile(filePath, rootDir)) return []

  return [
    {
      ruleId: "logic-test-missing",
      message: `Logic file has no corresponding test file: ${basename(filePath)}`,
      location: { filePath },
      details: testFileCandidates(filePath, rootDir).map((p) => `  expected: ${p}`),
      suggestion: "Add a test file for every logic function. Logic correctness must be verified.",
    },
  ]
}

export const logicTestsRule: Rule<Id> = {
  id: "logic-tests",
  ruleIds: RULE_IDS,
  check(context: RuleContext): readonly Finding<Id>[] {
    return context.snapshot.layerFiles.logic.flatMap((filePath) =>
      checkLogicFile(filePath, context.rootDir),
    )
  },
}
