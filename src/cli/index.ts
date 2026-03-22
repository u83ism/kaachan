#!/usr/bin/env tsx
import { program } from "commander"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { resolve, dirname } from "node:path"
import { analyze } from "../core/analyzer.js"
import { formatLevel, formatDiagnostics } from "./formatters/console.js"
import type { KaachanConfig } from "../types/config.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const pkg = JSON.parse(
  readFileSync(resolve(__dirname, "../../package.json"), "utf8"),
) as { version: string }

const DEFAULT_CONFIG = {
  format: "console" as const,
  disabledRules: [] as readonly string[],
  thresholds: {
    hintLines: 300,
    hintFunctions: 10,
    warningLines: 500,
    errorLogicFolderLines: 300,
  },
} satisfies Omit<KaachanConfig, "rootDir">

program
  .name("kaachan")
  .description("Architecture linter for Slime Architecture")
  .version(pkg.version)

program.argument("[path]", "Path to analyze (defaults to current directory)", ".")

program.option("--level", "Show detected architecture level and evidence only")
program.option("--format <format>", "Output format: console | json", "console")
program.option("--disable-rule <ruleId>", "Disable a specific rule")

program.action(async (pathArg: string, options: { level?: boolean; format?: string; disableRule?: string }) => {
  const rootDir = resolve(pathArg)
  const format = options.format === "json" ? "json" : "console"
  const disabledRules = options.disableRule != null ? [options.disableRule] : []

  const config: KaachanConfig = {
    ...DEFAULT_CONFIG,
    rootDir,
    format,
    disabledRules,
  }

  const result = await analyze(config)

  if (!result.ok) {
    console.error(`Error: ${result.error}`)
    process.exit(1)
  }

  if (options.level === true) {
    console.log(formatLevel(result.value))
    return
  }

  console.log(formatDiagnostics(result.value))

  const hasErrors = result.value.diagnostics.some((d) => d.severity === "error")
  if (hasErrors) process.exit(1)
})

program.parse()
