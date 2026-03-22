import { join } from "node:path"
import { SyntaxKind } from "ts-morph"
import type { SourceFile } from "ts-morph"
import type { Diagnostic } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_ID = "events-validation"

/**
 * Built-in TypeScript types that are class-like (declared as interfaces in lib.d.ts,
 * but semantically represent class instances and should not appear in event types).
 */
const KNOWN_CLASS_TYPE_NAMES = new Set([
  "Date",
  "Error",
  "TypeError",
  "RangeError",
  "SyntaxError",
  "Map",
  "Set",
  "WeakMap",
  "WeakSet",
  "Promise",
  "RegExp",
  "Buffer",
])

const isClassType = (type: import("ts-morph").Type): boolean => {
  const symbol = type.getSymbol()
  if (symbol === undefined) return false
  const name = symbol.getName()
  if (KNOWN_CLASS_TYPE_NAMES.has(name)) return true
  return symbol
    .getDeclarations()
    .some((d) => d.getKind() === SyntaxKind.ClassDeclaration)
}

const checkEventsFile = (
  sourceFile: SourceFile,
  filePath: string,
): readonly Diagnostic[] => {
  const diagnostics: Diagnostic[] = []

  // Check exported interfaces
  for (const iface of sourceFile.getInterfaces()) {
    if (!iface.isExported()) continue
    const name = iface.getName()

    if (iface.getProperty("type") === undefined) {
      diagnostics.push({
        ruleId: RULE_ID,
        severity: "warning",
        message: `Event type "${name}" is missing a \`type\` discriminant field`,
        location: { filePath },
        suggestion: `Add \`readonly type: "${name}"\` (or a string literal) to enable discriminated union pattern.`,
      })
    }

    for (const prop of iface.getProperties()) {
      if (isClassType(prop.getType())) {
        diagnostics.push({
          ruleId: RULE_ID,
          severity: "error",
          message: `Event type "${name}" property "${prop.getName()}" references a class type — event types must be plain data objects`,
          location: { filePath },
          suggestion:
            "Replace class instances with plain value types (e.g., Date → string ISO timestamp, Error → string message).",
        })
      }
    }
  }

  // Check exported type aliases that are object type literals
  for (const typeAlias of sourceFile.getTypeAliases()) {
    if (!typeAlias.isExported()) continue
    const name = typeAlias.getName()
    const typeNode = typeAlias.getTypeNode()
    if (typeNode === undefined) continue
    const typeLiteral = typeNode.asKind(SyntaxKind.TypeLiteral)
    if (typeLiteral === undefined) continue

    const members = typeLiteral.getMembers()
    const hasTypeField = members.some(
      (m) =>
        m.getKind() === SyntaxKind.PropertySignature &&
        m.asKindOrThrow(SyntaxKind.PropertySignature).getName() === "type",
    )

    if (!hasTypeField) {
      diagnostics.push({
        ruleId: RULE_ID,
        severity: "warning",
        message: `Event type "${name}" is missing a \`type\` discriminant field`,
        location: { filePath },
        suggestion: `Add \`readonly type: "${name}"\` (or a string literal) to enable discriminated union pattern.`,
      })
    }

    for (const member of members) {
      const prop = member.asKind(SyntaxKind.PropertySignature)
      if (prop === undefined) continue
      if (isClassType(prop.getType())) {
        diagnostics.push({
          ruleId: RULE_ID,
          severity: "error",
          message: `Event type "${name}" property "${prop.getName()}" references a class type — event types must be plain data objects`,
          location: { filePath },
          suggestion:
            "Replace class instances with plain value types (e.g., Date → string ISO timestamp, Error → string message).",
        })
      }
    }
  }

  return diagnostics
}

export const eventsValidationRule: Rule = {
  id: RULE_ID,
  activateFromLevel: 8,
  check(context: RuleContext): readonly Diagnostic[] {
    if (!context.snapshot.hasSharedEvents) return []

    const eventsFilePath = join(context.snapshot.sourceRoot, "shared", "events.ts")
    const sourceFile =
      context.morphProject.getSourceFile(eventsFilePath) ??
      context.morphProject.addSourceFileAtPath(eventsFilePath)

    return checkEventsFile(sourceFile, eventsFilePath)
  },
}
