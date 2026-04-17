#!/usr/bin/env bun
/**
 * Preview the system prompt for debugging purposes.
 *
 * Usage:
 *   bun run packages/opencode/script/preview-system-prompt.ts
 *   bun run packages/opencode/script/preview-system-prompt.ts --tools=bash,read,edit,glob,grep
 *   bun run packages/opencode/script/preview-system-prompt.ts --tools=bash,read,edit,glob,grep --supplemental=git-workflow,github-cli
 */

import { build, type BuilderInput } from "../src/session/system-prompt-builder"
import { fromToolIds } from "../src/session/tool-prompt-facts"
import GIT_WORKFLOW from "../src/session/supplemental/git-workflow.txt"
import GITHUB_CLI from "../src/session/supplemental/github-cli.txt"

const args = process.argv.slice(2)

// Parse --tools argument
const toolsArg = args.find((a) => a.startsWith("--tools="))
const tools = toolsArg
  ? toolsArg.replace("--tools=", "").split(",")
  : ["bash", "read", "edit", "write", "glob", "grep", "task", "todowrite", "webfetch", "websearch", "codesearch", "apply_patch", "question", "lsp"]

// Parse --supplemental argument
const supplementalArg = args.find((a) => a.startsWith("--supplemental="))
const supplementalKeys = supplementalArg ? supplementalArg.replace("--supplemental=", "").split(",") : []

const SUPPLEMENTAL_CONTEXT: Record<string, { name: string; content: string }> = {
  "git-workflow": { name: "Git Workflow", content: GIT_WORKFLOW },
  "github-cli": { name: "GitHub CLI", content: GITHUB_CLI },
}

const supplemental = supplementalKeys
  .map((key) => SUPPLEMENTAL_CONTEXT[key])
  .filter(Boolean)

const input: BuilderInput = {
  facts: fromToolIds(tools),
  workingDirectory: process.cwd(),
  platform: process.platform,
  supplemental: supplemental.length > 0 ? supplemental : undefined,
}

const result = build(input)

console.log("=".repeat(80))
console.log("SYSTEM PROMPT PREVIEW")
console.log("=".repeat(80))
console.log("")
console.log(`Tools: ${tools.join(", ")}`)
if (supplemental.length > 0) {
  console.log(`Supplemental: ${supplementalKeys.join(", ")}`)
}
console.log("")
console.log("-".repeat(80))
console.log("")
console.log(result.join("\n\n"))
console.log("")
console.log("-".repeat(80))
console.log(`Total length: ${result.join("\n\n").length} characters`)
console.log("=".repeat(80))
