export type ToolPromptFacts = {
  has_bash: boolean
  has_read: boolean
  has_write: boolean
  has_edit: boolean
  has_glob: boolean
  has_grep: boolean
  has_webfetch: boolean
  has_todowrite: boolean
  has_task: boolean
  has_question: boolean
  has_lsp: boolean
  has_codesearch: boolean
  has_websearch: boolean
  has_apply_patch: boolean
}

const TOOL_ID_MAP: Record<string, keyof ToolPromptFacts> = {
  bash: "has_bash",
  read: "has_read",
  write: "has_write",
  edit: "has_edit",
  glob: "has_glob",
  grep: "has_grep",
  webfetch: "has_webfetch",
  todowrite: "has_todowrite",
  task: "has_task",
  question: "has_question",
  lsp: "has_lsp",
  codesearch: "has_codesearch",
  websearch: "has_websearch",
  apply_patch: "has_apply_patch",
}

export function fromToolIds(ids: string[]): ToolPromptFacts {
  const facts = Object.fromEntries(
    Object.values(TOOL_ID_MAP).map((k) => [k, false]),
  ) as unknown as ToolPromptFacts
  for (const id of ids) {
    const key = TOOL_ID_MAP[id]
    if (key) facts[key] = true
  }
  // Mutual exclusion: apply_patch replaces edit/write
  if (facts.has_apply_patch) {
    facts.has_edit = false
    facts.has_write = false
  }
  return facts
}

export function hasCommonRules(facts: ToolPromptFacts): boolean {
  // Bash + at least one file tool
  if (facts.has_bash && (facts.has_read || facts.has_edit || facts.has_write || facts.has_glob || facts.has_grep)) return true
  // Search tools separation
  if (facts.has_glob && facts.has_grep) return true
  if (facts.has_glob && facts.has_read) return true
  if (facts.has_grep && facts.has_read) return true
  // Edit vs write
  if (facts.has_edit && facts.has_write) return true
  // Read before edit/write
  if (facts.has_read && (facts.has_edit || facts.has_write)) return true
  return false
}

export function buildCommonRules(facts: ToolPromptFacts): string {
  const rules: string[] = []

  // Bash vs file tools — only list tools that are actually present
  const fileTools = [
    facts.has_glob ? "glob" : null,
    facts.has_grep ? "grep" : null,
    facts.has_read ? "read" : null,
    facts.has_edit ? "edit" : null,
    facts.has_write ? "write" : null,
  ].filter(Boolean)
  if (facts.has_bash && fileTools.length > 0) {
    rules.push(`Prefer \`${fileTools.join("`, `")}\` over \`bash\` for ordinary file work.`)
  }

  // Search tools separation — build proper conjunction without double "and"
  if (searchToolsPresent(facts)) {
    const parts: string[] = []
    if (facts.has_glob) parts.push("`glob` for file-name search")
    if (facts.has_grep) parts.push("`grep` for content search")
    if (facts.has_read) parts.push("`read` for file content")
    if (parts.length === 2) {
      rules.push("Use " + parts[0] + " and " + parts[1] + ".")
    } else if (parts.length >= 3) {
      rules.push("Use " + parts.slice(0, -1).join(", ") + ", and " + parts[parts.length - 1]! + ".")
    }
  }

  // Edit vs write
  if (facts.has_edit && facts.has_write) {
    rules.push("Prefer `edit` for targeted changes and `write` for new files or full rewrites.")
  }

  // Read before edit/write — correct prefix format: {n}: (not L{n}:)
  if (facts.has_read && facts.has_edit && facts.has_write) {
    rules.push("Read before `edit` or overwriting with `write`; for `edit`, copy exact text and omit any `{n}: ` prefixes.")
  } else if (facts.has_read && facts.has_edit) {
    rules.push("Read before `edit`, then copy exact text and omit any `{n}: ` prefixes.")
  } else if (facts.has_read && facts.has_write && !facts.has_edit) {
    rules.push("Read before `write` if the file already exists.")
  }

  return rules.join("\n")
}

function searchToolsPresent(facts: ToolPromptFacts): boolean {
  const count = [facts.has_glob, facts.has_grep, facts.has_read].filter(Boolean).length
  return count >= 2
}

export * as ToolPromptFacts from "./tool-prompt-facts"
