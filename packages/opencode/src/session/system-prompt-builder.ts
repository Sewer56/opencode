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
  if (facts.has_bash) sections.push("## `Bash` Tool\n" + buildBashSection())
  if (facts.has_read) sections.push("## `Read` Tool\n" + buildReadSection(facts))
  if (facts.has_write) sections.push("## `Write` Tool\n" + buildWriteSection(facts))
  if (facts.has_edit) sections.push("## `Edit` Tool\n" + buildEditSection())
  if (facts.has_glob) sections.push("## `Glob` Tool\n" + buildGlobSection())
  if (facts.has_grep) sections.push("## `Grep` Tool\n" + buildGrepSection(facts))
  if (facts.has_task) sections.push("## `Task` Tool\n" + buildTaskSection(facts))
  if (facts.has_apply_patch) sections.push("## `ApplyPatch` Tool\n" + buildApplyPatchSection())
  return sections
}

function buildBashSection(): string {
  return [
    "- Use it for terminal work (git, package managers, test runners, docker) and shell-native search/filter jobs the specialized tools do not handle well.",
    "- Output combines stdout and stderr. Non-zero exit codes not shown.",
    "- For independent commands, make parallel `bash` calls. For dependent commands, use one call with `&&`.",
    "- Quote paths that contain spaces.",
  ].join("\n")
}

function buildReadSection(facts: ToolPromptFacts): string {
  const lines: string[] = []
  lines.push("- Returns `{n}: text`. Lines over 2000 chars are truncated.")
  if (facts.has_glob && facts.has_bash) {
    lines.push("- Reads files and directories. Use `glob` to find files or `bash` for directory listings.")
  } else if (facts.has_glob) {
    lines.push("- Reads files and directories. Use `glob` to find files.")
  } else if (facts.has_bash) {
    lines.push("- Reads files and directories. Use `bash` for directory listings.")
  } else {
    lines.push("- Reads files and directories.")
  }
  lines.push("- Missing files return an error. Binary files cannot be read.")
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

function buildEditSection(): string {
  return "- `old_string` must be non-empty, differ from `new_string`, and appear exactly once (unless `replaceAll`)."
}

function buildGlobSection(): string {
  return [
    "- Supports *, **, ?, [abc], and {a,b}.",
    "- Returns matching file paths as absolute paths, sorted newest first.",
    "- Results are capped at 100; large result sets are truncated.",
  ].join("\n")
}

function buildGrepSection(facts: ToolPromptFacts): string {
  const lines: string[] = []
  lines.push("- `pattern` must not be empty. Search is single-line only; there is no multiline matching.")
  lines.push("- Returns matches grouped by file.")
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
    "- Use for real delegation or parallel sub-work. Include full context; stateless — don't rely on prior state.",
  ]
  const localTools = []
  if (facts.has_read) localTools.push("read")
  if (facts.has_glob) localTools.push("glob")
  if (facts.has_grep) localTools.push("grep")
  if (localTools.length > 0) {
    lines.push(`- Do not use it when \`${localTools.join("`, `")}\` on one or a few files is enough.`)
  }
  lines.push("- Results are private to you; summarize for the user.")
  return lines.join("\n")
}

function buildApplyPatchSection(): string {
  return "- Apply a patch to files using the `*** Begin Patch` format. Use this instead of edit/write for GPT models."
}

export * as SystemPromptBuilder from "./system-prompt-builder"
