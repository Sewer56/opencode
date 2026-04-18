#!/usr/bin/env bun
/**
 * Enhanced preview of the complete system prompt including tool schemas.
 *
 * Usage:
 *   bun run packages/opencode/script/preview-system-prompt.ts
 *   bun run packages/opencode/script/preview-system-prompt.ts --tools=shell,read,edit,glob,grep
 *   bun run packages/opencode/script/preview-system-prompt.ts --tools=shell,read,edit,glob,grep --supplemental=git-workflow,github-cli
 */

import { fromSchema } from "../src/tool/json-schema"
import { build, type BuilderInput } from "../src/session/system-prompt-builder"
import { fromToolIds } from "../src/session/tool-prompt-facts"
import GIT_WORKFLOW from "../src/session/supplemental/git-workflow.txt"
import GITHUB_CLI from "../src/session/supplemental/github-cli.txt"

// Tool descriptions
import SHELL_DESC from "../src/tool/shell/shell.txt"
import EDIT_DESC from "../src/tool/edit.txt"
import GLOB_DESC from "../src/tool/glob.txt"
import GREP_DESC from "../src/tool/grep.txt"
import READ_DESC from "../src/tool/read.txt"
import TASK_DESC from "../src/tool/task.txt"
import TODOWRITE_DESC from "../src/tool/todowrite.txt"
import WEBFETCH_DESC from "../src/tool/webfetch.txt"
import WEBSEARCH_DESC from "../src/tool/websearch.txt"
import APPLY_PATCH_DESC from "../src/tool/apply_patch.txt"
import QUESTION_DESC from "../src/tool/question.txt"
import WRITE_DESC from "../src/tool/write.txt"
import LSP_DESC from "../src/tool/lsp.txt"
import SKILL_DESC from "../src/tool/skill.txt"
import PLAN_ENTER_DESC from "../src/tool/plan-enter.txt"
import PLAN_EXIT_DESC from "../src/tool/plan-exit.txt"

// Tool parameters (schemas)
import { Parameters as ShellParams } from "../src/tool/shell"
import { Parameters as EditParams } from "../src/tool/edit"
import { Parameters as GlobParams } from "../src/tool/glob"
import { Parameters as GrepParams } from "../src/tool/grep"
import { Parameters as ReadParams } from "../src/tool/read"
import { Parameters as TaskParams } from "../src/tool/task"
import { Parameters as TodoParams } from "../src/tool/todo"
import { Parameters as WebfetchParams } from "../src/tool/webfetch"
import { Parameters as WebsearchParams } from "../src/tool/websearch"
import { Parameters as ApplyPatchParams } from "../src/tool/apply_patch"
import { Parameters as QuestionParams } from "../src/tool/question"
import { Parameters as WriteParams } from "../src/tool/write"
import { Parameters as LspParams } from "../src/tool/lsp"
import { Parameters as SkillParams } from "../src/tool/skill"

const args = process.argv.slice(2)

// Parse --tools argument
const toolsArg = args.find((a) => a.startsWith("--tools="))
const toolIds = toolsArg
  ? toolsArg.replace("--tools=", "").split(",")
  : ["shell", "read", "edit", "write", "glob", "grep", "task", "todowrite", "webfetch", "websearch", "apply_patch", "question", "lsp", "skill"]

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

// Tool metadata
const toolMetadata: Record<string, { description: string; parameters: any }> = {
  shell: { description: applyShellTemplate(SHELL_DESC), parameters: ShellParams },
  read: { description: READ_DESC, parameters: ReadParams },
  edit: { description: EDIT_DESC, parameters: EditParams },
  write: { description: WRITE_DESC, parameters: WriteParams },
  glob: { description: GLOB_DESC, parameters: GlobParams },
  grep: { description: GREP_DESC, parameters: GrepParams },
  task: { description: TASK_DESC, parameters: TaskParams },
  todowrite: { description: TODOWRITE_DESC, parameters: TodoParams },
  webfetch: { description: WEBFETCH_DESC, parameters: WebfetchParams },
  websearch: { description: applyWebsearchTemplate(WEBSEARCH_DESC), parameters: WebsearchParams },
  apply_patch: { description: APPLY_PATCH_DESC, parameters: ApplyPatchParams },
  question: { description: QUESTION_DESC, parameters: QuestionParams },
  lsp: { description: LSP_DESC, parameters: LspParams },
  skill: { description: SKILL_DESC, parameters: SkillParams },
}

function applyShellTemplate(desc: string): string {
  // These are the dynamic values that shell tool injects at runtime
  return desc
    .replaceAll("${directory}", process.cwd())
    .replaceAll("${os}", process.platform)
    .replaceAll("${shell}", process.platform === "win32" ? "powershell" : "bash")
    .replaceAll("${chaining}", process.platform === "win32" ? ";" : "&&")
    .replaceAll("${maxLines}", "1000")
    .replaceAll("${maxBytes}", "100000")
}

function applyWebsearchTemplate(desc: string): string {
  return desc.replace("{{year}}", new Date().getFullYear().toString())
}

function formatToolSection(id: string, description: string, parameters: any): string {
  const schema = fromSchema(parameters)

  const sections: string[] = []
  sections.push(`## Tool: ${id}`)
  sections.push("")
  sections.push(`**Description:** ${description}`)
  sections.push("")
  sections.push("**Parameters Schema:**")
  sections.push("```json")
  sections.push(JSON.stringify(schema, null, 2))
  sections.push("```")

  return sections.join("\n")
}

// Build system prompt sections
const input: BuilderInput = {
  facts: fromToolIds(toolIds),
  workingDirectory: process.cwd(),
  platform: process.platform,
  supplemental: supplemental.length > 0 ? supplemental : undefined,
}

const systemPromptSections = build(input)

// Calculate totals
let systemPromptLength = 0
let toolDescriptionsLength = 0
let toolSchemasLength = 0

for (const section of systemPromptSections) {
  systemPromptLength += section.length
}

for (const toolId of toolIds) {
  const tool = toolMetadata[toolId]
  if (tool) {
    toolDescriptionsLength += tool.description.length
    const schema = fromSchema(tool.parameters)
    toolSchemasLength += JSON.stringify(schema).length
  }
}

const totalLength = systemPromptLength + toolDescriptionsLength + toolSchemasLength

// ~4 chars per token is a rough estimate for English text + JSON
const estimatedTokens = Math.round(totalLength / 4)

// Output
console.log("=".repeat(80))
console.log("COMPLETE SYSTEM PROMPT PREVIEW (including tool schemas)")
console.log("=".repeat(80))
console.log("")
console.log(`Tools: ${toolIds.join(", ")}`)
console.log(`Supplemental: ${supplementalKeys.join(", ") || "none"}`)
console.log("")
console.log("=".repeat(80))
console.log("SECTION 1: SYSTEM PROMPT TEXT")
console.log("=".repeat(80))
console.log("")
console.log(`Length: ${systemPromptLength.toLocaleString()} characters (~${Math.round(systemPromptLength / 4)} tokens)`)
console.log("")
console.log("-".repeat(80))
console.log("")
console.log(systemPromptSections.join("\n\n"))
console.log("")
console.log("=".repeat(80))
console.log("SECTION 2: TOOL DESCRIPTIONS")
console.log("=".repeat(80))
console.log("")
console.log(`Length: ${toolDescriptionsLength.toLocaleString()} characters (~${Math.round(toolDescriptionsLength / 4)} tokens)`)
console.log("")

for (const toolId of toolIds) {
  const tool = toolMetadata[toolId]
  if (tool) {
console.log("-".repeat(80))
    console.log("")
    console.log(`Tool: ${toolId}`)
    console.log("")
    console.log(`Description (${tool.description.length} chars):`)
    console.log(tool.description)
    console.log("")
  }
}

console.log("=".repeat(80))
console.log("SECTION 3: TOOL JSON SCHEMAS")
console.log("=".repeat(80))
console.log("")
console.log(`Length: ${toolSchemasLength.toLocaleString()} characters (~${Math.round(toolSchemasLength / 4)} tokens)`)
console.log("")

for (const toolId of toolIds) {
  const tool = toolMetadata[toolId]
  if (tool) {
    const schema = fromSchema(tool.parameters)

    console.log("-".repeat(80))
    console.log("")
    console.log(`Schema: ${toolId}`)
    console.log("")
    console.log(JSON.stringify(schema, null, 2))
    console.log("")
  }
}

console.log("=".repeat(80))
console.log("SUMMARY")
console.log("=".repeat(80))
console.log("")
console.log(`System prompt text: ${systemPromptLength.toLocaleString()} chars (~${Math.round(systemPromptLength / 4)} tokens)`)
console.log(`Tool descriptions:  ${toolDescriptionsLength.toLocaleString()} chars (~${Math.round(toolDescriptionsLength / 4)} tokens)`)
console.log(`Tool JSON schemas:  ${toolSchemasLength.toLocaleString()} chars (~${Math.round(toolSchemasLength / 4)} tokens)`)
console.log("-".repeat(80))
console.log(`TOTAL: ${totalLength.toLocaleString()} characters (est. ~${estimatedTokens.toLocaleString()} tokens)`)
console.log("=".repeat(80))
