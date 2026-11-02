import { basename, dirname } from "node:path"
import type { Project, SourceFile } from "ts-morph"

export const loadSourceFile = (morphProject: Project, filePath: string): SourceFile =>
  morphProject.getSourceFile(filePath) ?? morphProject.addSourceFileAtPath(filePath)

/** ORM / DB client packages. Subpath imports (e.g. `drizzle-orm/pg-core`) count too */
export const ORM_PACKAGES = [
  "@prisma/client",
  "drizzle-orm",
  "typeorm",
  "@mikro-orm/core",
  "sequelize",
  "knex",
  "mongoose",
] as const

export const isOrmImport = (specifier: string): boolean =>
  ORM_PACKAGES.some((pkg) => specifier === pkg || specifier.startsWith(`${pkg}/`))

/** Last segment of an import specifier without its extension, e.g. `../store.js` → `store` */
export const lastSegment = (specifier: string): string =>
  specifier.replace(/\.(js|ts)$/, "").split("/").at(-1) ?? ""

/** Whether the file sits in a promotion folder (e.g. `logic/user.ts`) rather than being the single layer file */
export const isInFolder = (filePath: string, folderName: string): boolean =>
  basename(dirname(filePath)) === folderName
