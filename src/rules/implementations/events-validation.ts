import { join } from "node:path"
import { Node, SyntaxKind } from "ts-morph"
import type { SourceFile } from "ts-morph"
import { FOLDER_NAMES, SHARED_EVENTS_FILE } from "@u83ism/architecture-rules"
import { isInsideDir, loadSourceFile, relativeImports } from "../../analysis/layer-modules.js"
import type { Finding } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_IDS = [
  "event-missing-type-field",
  "event-class-type",
  "events-file-missing",
  "events-imports-domain",
  "event-type-not-upper-snake",
] as const
type Id = (typeof RULE_IDS)[number]

const UPPER_SNAKE_CASE = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/

const toUpperSnakeCase = (value: string): string =>
  value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[-.\s]+/g, "_")
    .toUpperCase()

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
): readonly Finding<Id>[] => {
  const diagnostics: Finding<Id>[] = []

  // Check exported interfaces
  for (const iface of sourceFile.getInterfaces()) {
    if (!iface.isExported()) continue
    const name = iface.getName()

    if (iface.getProperty("type") === undefined) {
      diagnostics.push({
        ruleId: "event-missing-type-field",
        message: `Event type "${name}" is missing a \`type\` discriminant field`,
        location: { filePath },
        suggestion: `Add \`readonly type: "${name}"\` (or a string literal) to enable discriminated union pattern.`,
      })
    }

    for (const prop of iface.getProperties()) {
      if (isClassType(prop.getType())) {
        diagnostics.push({
          ruleId: "event-class-type",
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
        ruleId: "event-missing-type-field",
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
          ruleId: "event-class-type",
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

/** `type` values of event types that are not UPPER_SNAKE_CASE (`type: "userCreated"`) */
const checkEventTypeValues = (sourceFile: SourceFile, filePath: string): readonly Finding<Id>[] =>
  sourceFile
    .getDescendantsOfKind(SyntaxKind.PropertySignature)
    .filter((p) => p.getName() === "type")
    .flatMap((p) => {
      const typeNode = p.getTypeNode()
      return typeNode === undefined
        ? []
        : [typeNode, ...typeNode.getDescendants()].filter(Node.isStringLiteral)
    })
    .filter((lit) => !UPPER_SNAKE_CASE.test(lit.getLiteralValue()))
    .map((lit) => ({
      ruleId: "event-type-not-upper-snake",
      message: `event type value ${lit.getText()} is not UPPER_SNAKE_CASE`,
      location: { filePath, line: lit.getStartLineNumber() },
      suggestion: `Name events in the past tense in UPPER_SNAKE_CASE, e.g. "${toUpperSnakeCase(lit.getLiteralValue())}".`,
    }))

/** shared/events.ts must not depend on domains or orchestrate/ folders */
const checkEventsImports = (context: RuleContext, sourceFile: SourceFile, filePath: string): readonly Finding<Id>[] => {
  const { sourceRoot } = context.snapshot
  const forbidden = [FOLDER_NAMES.DOMAINS, FOLDER_NAMES.ORCHESTRATE].map((f) => join(sourceRoot, f))
  return relativeImports(sourceFile, filePath)
    .filter((i) => forbidden.some((dir) => isInsideDir(i.resolved, dir)))
    .map((i) => ({
      ruleId: "events-imports-domain",
      message: `shared/events.ts imports "${i.specifier}" — event types must not depend on domains or orchestrate/`,
      location: { filePath, line: i.line },
      suggestion:
        "Define the payload types in shared/events.ts itself (plain data), so every domain can depend on the events without a cycle.",
    }))
}

export const eventsValidationRule: Rule<Id> = {
  id: "events-validation",
  ruleIds: RULE_IDS,
  check(context: RuleContext): readonly Finding<Id>[] {
    const sharedDir = join(context.snapshot.sourceRoot, FOLDER_NAMES.SHARED)
    const eventsFilePath = join(sharedDir, SHARED_EVENTS_FILE)

    if (!context.snapshot.hasSharedEvents) {
      return [
        {
          ruleId: "events-file-missing",
          message: "shared/events.ts does not exist — domain events need one place for their types",
          location: { filePath: sharedDir },
          suggestion:
            "Create shared/events.ts and define each event as a plain type with an UPPER_SNAKE_CASE type field and a payload.",
        },
      ]
    }

    const sourceFile = loadSourceFile(context.morphProject, eventsFilePath)
    return [
      ...checkEventsFile(sourceFile, eventsFilePath),
      ...checkEventsImports(context, sourceFile, eventsFilePath),
      ...checkEventTypeValues(sourceFile, eventsFilePath),
    ]
  },
}
