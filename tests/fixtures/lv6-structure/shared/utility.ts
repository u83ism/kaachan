import { readFileSync } from "node:fs"
import type { Stats } from "node:fs"

let calls = 0

export const loadTemplate = (path: string): string => {
  calls += 1
  console.log("loading", path)
  return readFileSync(path, "utf8")
}

export const isFile = (stats: Stats): boolean => stats.isFile()
