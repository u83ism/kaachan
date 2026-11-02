import { basename, join, relative, sep } from "node:path"
import type { TableOwnership } from "@u83ism/architecture-rules"
import { FOLDER_NAMES } from "@u83ism/architecture-rules"
import { findTableAccesses } from "../../analysis/table-access.js"
import type { TableAccess } from "../../analysis/table-access.js"
import { isInsideDir, loadSourceFile } from "../../analysis/layer-modules.js"
import type { Finding } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_IDS = [
  "table-foreign-write",
  "table-foreign-read",
  "table-owner-duplicate",
  "table-owner-undeclared",
] as const
type Id = (typeof RULE_IDS)[number]

/** A file that touches tables on behalf of a domain */
interface DomainDataFile {
  readonly domain: string
  readonly filePath: string
  /** A Lv10 read-side file (`query/` folder or a `*query*` adapter), which may read across owners */
  readonly readSide: boolean
}

const isReadSide = (filePath: string, baseDir: string): boolean => {
  const segments = relative(baseDir, filePath).split(sep)
  return segments.includes(FOLDER_NAMES.QUERY) || /query/i.test(basename(filePath, ".ts"))
}

/**
 * Domain store files (Lv6–8, including `command/` / `query/`) and the adapters under
 * `infrastructure/<domain>/` (Lv9+).
 */
const domainDataFiles = (context: RuleContext): readonly DomainDataFile[] => {
  const { domainFolders, layerFiles, sourceFiles, sourceRoot } = context.snapshot
  const infrastructureDir = join(sourceRoot, FOLDER_NAMES.INFRASTRUCTURE)

  const stores = domainFolders.flatMap((d) =>
    layerFiles.store
      .filter((p) => isInsideDir(p, d.absolutePath))
      .map((filePath) => ({ domain: d.name, filePath, readSide: isReadSide(filePath, d.absolutePath) })),
  )
  const adapters = domainFolders.flatMap((d) => {
    const dir = join(infrastructureDir, d.name)
    return sourceFiles
      .filter((f) => isInsideDir(f.absolutePath, dir))
      .map((f) => ({ domain: d.name, filePath: f.absolutePath, readSide: isReadSide(f.absolutePath, dir) }))
  })
  return [...stores, ...adapters]
}

const ownersOf = (tables: TableOwnership | undefined, table: string): readonly string[] =>
  Object.entries(tables ?? {})
    .filter(([, owned]) => owned.includes(table))
    .map(([domain]) => domain)

/** The first access of each table and kind in the file */
const firstAccesses = (accesses: readonly TableAccess[]): readonly TableAccess[] =>
  accesses.filter(
    (a, i) => accesses.findIndex((b) => b.table === a.table && b.kind === a.kind) === i,
  )

const checkAccess = (
  file: DomainDataFile,
  access: TableAccess,
  tables: TableOwnership | undefined,
): readonly Finding<Id>[] => {
  const owners = ownersOf(tables, access.table)
  const location = { filePath: file.filePath, line: access.line }

  if (owners.length === 0) {
    return [
      {
        ruleId: "table-owner-undeclared",
        message: `domains/${file.domain} touches table "${access.table}", which has no declared owner`,
        location,
        suggestion: `Declare the owner under tables in slime.config.ts (e.g. tables: { ${file.domain}: ["${access.table}"] }), or move the access to shared/store.ts while the owner is undecided.`,
      },
    ]
  }
  if (owners.includes(file.domain)) return []

  const ownerList = owners.join(", ")
  if (access.kind === "write") {
    return [
      {
        ruleId: "table-foreign-write",
        message: `domains/${file.domain} writes to table "${access.table}", owned by ${ownerList}`,
        location,
        suggestion: `Call a write function of domains/${owners[0] ?? ""} instead (declare the dependency in slime.config.ts), or coordinate both domains in app/ or orchestrate/.`,
      },
    ]
  }
  if (file.readSide) return []
  return [
    {
      ruleId: "table-foreign-read",
      message: `domains/${file.domain} reads table "${access.table}", owned by ${ownerList}, directly`,
      location,
      suggestion: `Read through a function of domains/${owners[0] ?? ""} (e.g. a find*ByIds batch) or, in Lv10, move the read to a query/ read-side adapter.`,
    },
  ]
}

const checkDuplicateOwners = (context: RuleContext): readonly Finding<Id>[] => {
  const { slimeConfig } = context
  if (slimeConfig.kind !== "found" || slimeConfig.tables === undefined) return []

  const tables = [...new Set(Object.values(slimeConfig.tables).flat())]
  return tables.flatMap((table) => {
    const owners = ownersOf(slimeConfig.tables, table)
    return owners.length < 2
      ? []
      : [
          {
            ruleId: "table-owner-duplicate" as const,
            message: `slime.config.ts declares table "${table}" for more than one domain: ${owners.join(", ")}`,
            location: { filePath: slimeConfig.filePath },
            suggestion:
              "A table has exactly one owning domain. Pick the domain that writes it, and let the others read through that domain — or reconsider where the domains are cut.",
          },
        ]
  })
}

export const tableOwnershipRule: Rule<Id> = {
  id: "table-ownership",
  ruleIds: RULE_IDS,
  check(context: RuleContext): readonly Finding<Id>[] {
    const tables = context.slimeConfig.kind === "found" ? context.slimeConfig.tables : undefined
    const accesses = domainDataFiles(context).flatMap((file) =>
      firstAccesses(findTableAccesses(loadSourceFile(context.morphProject, file.filePath))).flatMap((access) =>
        checkAccess(file, access, tables),
      ),
    )
    return [...checkDuplicateOwners(context), ...accesses]
  },
}
