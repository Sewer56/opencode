import type { ToolPromptFacts } from "./tool-prompt-facts"
import { buildCommonRules, hasCommonRules } from "./tool-prompt-facts"

export interface BuilderInput {
  facts: ToolPromptFacts
  workingDirectory: string
  platform: string
  supplemental?: { name: string; content: string }[]
}

export function build(input: BuilderInput): string[] {
  const sections: string[] = []

  // Environment
  sections.push([
    "# Environment",
    `Working directory: ${input.workingDirectory}`,
    `Platform: ${input.platform}`,
  ].join("\n"))

  // Tool Usage Guidelines
  const toolSections = buildToolSections(input.facts)
  const commonRules = hasCommonRules(input.facts) ? buildCommonRules(input.facts) : ""
  if (toolSections.length > 0 || commonRules) {
    const parts: string[] = ["# Tool Usage Guidelines"]
    if (commonRules) parts.push("## Common Rules\n" + commonRules)
    parts.push(...toolSections)
    sections.push(parts.join("\n\n"))
  }

  // Supplemental Context — only included when caller provides it
  if (input.supplemental && input.supplemental.length > 0) {
    const parts = ["# Supplemental Context"]
    for (const s of input.supplemental) {
      parts.push(`## ${s.name}\n${s.content}`)
    }
    sections.push(parts.join("\n\n"))
  }

  // Collapse triple newlines and trim trailing whitespace
  return sections.map((s) => s.replace(/\n{3,}/g, "\n\n").trimEnd())
}

function buildToolSections(facts: ToolPromptFacts): string[] {
  const sections: string[] = []
  if (facts.has_bash) sections.push("## `Bash` Tool\n" + buildBashSection(facts))
  if (facts.has_read) sections.push("## `Read` Tool\n" + buildReadSection(facts))
  if (facts.has_write) sections.push("## `Write` Tool\n" + buildWriteSection(facts))
  if (facts.has_edit) sections.push("## `Edit` Tool\n" + buildEditSection(facts))
  if (facts.has_glob) sections.push("## `Glob` Tool\n" + buildGlobSection(facts))
  if (facts.has_grep) sections.push("## `Grep` Tool\n" + buildGrepSection(facts))
  if (facts.has_task) sections.push("## `Task` Tool\n" + buildTaskSection(facts))
  if (facts.has_todowrite) sections.push("## `TodoWrite` Tool\n" + buildTodoWriteSection())
  if (facts.has_webfetch) sections.push("## `WebFetch` Tool\n" + buildWebFetchSection())
  if (facts.has_apply_patch) sections.push("## `ApplyPatch` Tool\n" + buildApplyPatchSection())
  if (facts.has_question) sections.push("## `Question` Tool\n" + buildQuestionSection())
  if (facts.has_lsp) sections.push("## `LSP` Tool\n" + buildLspSection())
  if (facts.has_codesearch) sections.push("## `CodeSearch` Tool\n" + buildCodeSearchSection())
  if (facts.has_websearch) sections.push("## `WebSearch` Tool\n" + buildWebSearchSection())
  return sections
}

function buildBashSection(facts: ToolPromptFacts): string {
  const lines = [
    "- Use it for terminal work (git, package managers, test runners, docker) and shell-native search/filter jobs the specialized tools do not handle well.",
    "- Output includes stdout, stderr under [stderr], and non-zero exit codes as [exit code: N].",
    "- For independent commands, make parallel bash calls. For dependent commands, use one call with &&.",
    "- Quote paths that contain spaces.",
  ]
  return lines.join("\n")
}

function buildReadSection(facts: ToolPromptFacts): string {
  const lines = [
    "- Returns `{n}: text`. Lines over 2000 chars are truncated.",
  ]
  if (facts.has_glob && facts.has_bash) {
    lines.push("- Reads files, not directories. Use `glob` to find files or `bash` for directory listings.")
  } else if (facts.has_glob) {
    lines.push("- Reads files, not directories. Use `glob` to find files.")
  } else if (facts.has_bash) {
    lines.push("- Reads files, not directories. Use `bash` for directory listings.")
  } else {
    lines.push("- Reads files, not directories.")
  }
  lines.push("- Missing files return an error. Non-text files are returned as text bytes; there is no special image rendering.")
  lines.push("- Read related files in parallel when useful.")
  return lines.join("\n")
}

function buildWriteSection(facts: ToolPromptFacts): string {
  const lines = ["- Existing files are overwritten."]
  if (!facts.has_edit) {
    lines.push("- Use this for new files or full rewrites, not small edits.")
  }
  return lines.join("\n")
}

function buildEditSection(facts: ToolPromptFacts): string {
  const lines = []
  if (!facts.has_read) {
    lines.push("- `old_string` must match the existing file text exactly.")
  }
  lines.push(`- Without \`replaceAll\` the edit fails if \`old_string\` is missing or appears more than once.`)
  lines.push(`- The edit also fails if \`old_string\` is empty or equal to \`new_string\`.`)
  return lines.join("\n")
}

function buildGlobSection(facts: ToolPromptFacts): string {
  const lines = [
    "- Supports *, **, ?, [abc], and {a,b}.",
    "- Returns matching file paths relative to the search directory.",
    "- Results are capped at 1000; large result sets are returned with truncated: true.",
  ]
  if (!facts.has_grep) {
    lines.push("- Use it for file-name search, not content search.")
  }
  return lines.join("\n")
}

function buildGrepSection(facts: ToolPromptFacts): string {
  const lines = [
    "- `pattern` must not be empty. Search is single-line only; there is no multiline matching.",
    "- Returns matches grouped by file.",
  ]
  if (facts.has_bash) {
    lines.push("- Use this instead of shell `grep`/`rg`.")
  }
  if (!facts.has_glob && !facts.has_read) {
    lines.push("- Use it for content search, not file-name search or full-file inspection.")
  }
  return lines.join("\n")
}

function buildTaskSection(facts: ToolPromptFacts): string {
  const lines = [
    "- Use task for real delegation or parallel sub-work. Tasks are stateless - include full context; do not rely on prior state.",
  ]
  const localTools = []
  if (facts.has_read) localTools.push("read")
  if (facts.has_glob) localTools.push("glob")
  if (facts.has_grep) localTools.push("grep")
  if (localTools.length > 0) {
    lines.push(`- Do not use it when \`${localTools.join("`, `")}\` on one or a few files is enough.`)
  }
  lines.push("- The delegated result is returned only to you, so summarize it for the user.")
  return lines.join("\n")
}

function buildTodoWriteSection(): string {
  return "- Replace the full todo list. All existing todos are overwritten."
}

function buildWebFetchSection(): string {
  return "- Fetch one URL. HTML is converted to Markdown and JSON is pretty-printed."
}

function buildApplyPatchSection(): string {
  return "- Apply a unified diff patch to a file. Use this instead of edit/write for GPT models."
}

function buildQuestionSection(): string {
  return "- Ask the user a question when you need clarification."
}

function buildLspSection(): string {
  return "- Query the Language Server Protocol for diagnostics, definitions, references, and hover information."
}

function buildCodeSearchSection(): string {
  return "- Search the codebase using semantic code search."
}

function buildWebSearchSection(): string {
  return "- Search the web for information."
}

export * as SystemPromptBuilder from "./system-prompt-builder"
