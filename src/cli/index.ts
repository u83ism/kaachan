#!/usr/bin/env tsx
import { program } from "commander"
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { resolve, dirname, join } from "node:path"
import { analyze } from "../core/analyzer.js"
import { formatLevel, formatDiagnostics } from "./formatters/console.js"
import {
  generateRulesContent,
  outputPathForTarget,
  ALL_TARGETS,
} from "./export-rules.js"
import type { KaachanConfig } from "../types/config.js"
import type { RulesTarget } from "./export-rules.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const pkg = JSON.parse(
  readFileSync(resolve(__dirname, "../../package.json"), "utf8"),
) as { version: string }

const DEFAULT_CONFIG = {
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
program.option("--disable-rule <ruleId>", "Disable a specific rule")

program.action(async (pathArg: string, options: { level?: boolean; disableRule?: string }) => {
  const rootDir = resolve(pathArg)
  const disabledRules = options.disableRule != null ? [options.disableRule] : []

  const config: KaachanConfig = {
    ...DEFAULT_CONFIG,
    rootDir,
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

const exportRulesCommand = program
  .command("export:rules")
  .description("Generate AI rules files from the detected architecture level")
  .argument("[path]", "Path to analyze (defaults to current directory)", ".")
  .option("--target <target>", "Target format: claude | cursor | cline | gemini (default: all)")

exportRulesCommand.action(async (pathArg: string, options: { target?: string }) => {
  const rootDir = resolve(pathArg)

  const config: KaachanConfig = {
    ...DEFAULT_CONFIG,
    rootDir,
  }

  const result = await analyze(config)

  if (!result.ok) {
    console.error(`Error: ${result.error}`)
    process.exit(1)
  }

  const targets: readonly RulesTarget[] =
    options.target != null
      ? [options.target as RulesTarget]
      : ALL_TARGETS

  const content = generateRulesContent(result.value, config.thresholds)

  for (const target of targets) {
    const relativePath = outputPathForTarget(target)
    const absolutePath = join(rootDir, relativePath)
    mkdirSync(dirname(absolutePath), { recursive: true })
    writeFileSync(absolutePath, content, "utf8")
    console.log(`  wrote ${relativePath}`)
  }
})

program.parse()
