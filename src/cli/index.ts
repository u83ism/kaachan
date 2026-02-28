#!/usr/bin/env tsx
import { program } from "commander"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { resolve, dirname } from "node:path"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const pkg = JSON.parse(
  readFileSync(resolve(__dirname, "../../package.json"), "utf8"),
) as { version: string }

program
  .name("kaachan")
  .description("Architecture linter for Slime Architecture")
  .version(pkg.version)

program.argument("[path]", "Path to analyze (defaults to current directory)", ".")

program.option("--level", "Show detected architecture level and evidence only")
program.option("--format <format>", "Output format: console | json", "console")
program.option("--disable-rule <ruleId>", "Disable a specific rule")

program.action((_path: string, _options: unknown) => {
  // Stub — will be wired to core analyzer in Phase 3
  console.log(`kaachan v${pkg.version} — stub (Phase 0)`)
  console.log("Run with --help for usage information.")
})

program.parse()
