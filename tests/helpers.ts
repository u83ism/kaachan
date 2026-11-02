import { BUILT_IN_RULES } from "../src/rules/registry.js"
import type { Diagnostic } from "../src/types/diagnostic.js"

/** Whether the diagnostic was reported by the built-in rule module with this module ID */
export const isFrom = (d: Diagnostic, moduleId: string): boolean =>
  BUILT_IN_RULES.find((r) => r.id === moduleId)?.ruleIds.includes(d.ruleId) ?? false
