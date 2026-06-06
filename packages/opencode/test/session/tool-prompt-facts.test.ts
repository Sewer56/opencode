import { describe, expect, test } from "bun:test"
import { fromToolIds, hasCommonRules, buildCommonRules, type ToolPromptFacts } from "../../src/session/tool-prompt-facts"

const ALL_IDS = ["bash", "read", "edit", "write", "glob", "grep", "task", "todowrite", "webfetch", "websearch", "codesearch", "apply_patch", "question", "lsp"]

describe("fromToolIds", () => {
  test("all tools present", () => {
    const facts = fromToolIds(ALL_IDS)
    expect(facts.has_bash).toBe(true)
    expect(facts.has_read).toBe(true)
    expect(facts.has_edit).toBe(false) // forced false by apply_patch
    expect(facts.has_write).toBe(false) // forced false by apply_patch
    expect(facts.has_apply_patch).toBe(true)
  })

  test("minimal tool set (read only)", () => {
    const facts = fromToolIds(["read"])
    expect(facts.has_read).toBe(true)
    expect(facts.has_bash).toBe(false)
  })

  test("apply_patch excludes edit/write", () => {
    const facts = fromToolIds(["apply_patch", "edit", "write", "read"])
    expect(facts.has_apply_patch).toBe(true)
    expect(facts.has_edit).toBe(false)
    expect(facts.has_write).toBe(false)
    expect(facts.has_read).toBe(true)
  })

  test("empty tool list", () => {
    const facts = fromToolIds([])
    for (const value of Object.values(facts)) {
      expect(value).toBe(false)
    }
  })

  test("unknown tool IDs are ignored", () => {
    const facts = fromToolIds(["read", "unknown_tool"])
    expect(facts.has_read).toBe(true)
  })
})

describe("hasCommonRules", () => {
  test("true when bash + file tools present", () => {
    expect(hasCommonRules(fromToolIds(["bash", "read"]))).toBe(true)
  })

  test("true when glob + grep present", () => {
    expect(hasCommonRules(fromToolIds(["glob", "grep"]))).toBe(true)
  })

  test("true when edit + write present", () => {
    expect(hasCommonRules(fromToolIds(["edit", "write"]))).toBe(true)
  })

  test("true when read + edit present", () => {
    expect(hasCommonRules(fromToolIds(["read", "edit"]))).toBe(true)
  })

  test("false with only webfetch", () => {
    expect(hasCommonRules(fromToolIds(["webfetch"]))).toBe(false)
  })

  test("false with only task", () => {
    expect(hasCommonRules(fromToolIds(["task"]))).toBe(false)
  })
})

describe("buildCommonRules", () => {
  test("all file tools + bash: includes all rules", () => {
    const facts = fromToolIds(["bash", "read", "edit", "write", "glob", "grep"])
    const rules = buildCommonRules(facts)
    expect(rules).toContain("Prefer `glob`")
    expect(rules).toContain("Prefer `edit` for targeted changes")
    expect(rules).toContain("Read before `edit`")
  })

  test("read + edit only: includes read-before-edit rule", () => {
    const rules = buildCommonRules(fromToolIds(["read", "edit"]))
    expect(rules).toContain("Read before `edit`")
    expect(rules).not.toContain("Prefer `glob`")
  })

  test("glob + grep + read: search separation rule adapts", () => {
    const rules = buildCommonRules(fromToolIds(["glob", "grep", "read"]))
    expect(rules).toContain("`glob` for file-name search")
    expect(rules).toContain("`grep` for content search")
    expect(rules).toContain("`read` for file content")
  })

  test("glob + grep only: different search separation text", () => {
    const rules = buildCommonRules(fromToolIds(["glob", "grep"]))
    expect(rules).toContain("`glob` for file-name search")
    expect(rules).toContain("`grep` for content search")
    expect(rules).not.toContain("`read`")
  })

  test("edit + write only: includes edit-vs-write rule", () => {
    const rules = buildCommonRules(fromToolIds(["edit", "write"]))
    expect(rules).toContain("Prefer `edit` for targeted changes")
  })

  test("read + write only: includes read-before-write rule", () => {
    const rules = buildCommonRules(fromToolIds(["read", "write"]))
    expect(rules).toContain("Read before `write`")
    expect(rules).not.toContain("`edit`")
  })

  test("bash alone: no common rules", () => {
    const rules = buildCommonRules(fromToolIds(["bash"]))
    expect(rules).toBe("")
  })

  test("no duplicate rules across tool combinations", () => {
    const facts = fromToolIds(["bash", "read", "edit", "write", "glob", "grep"])
    const rules = buildCommonRules(facts)
    const lines = rules.split("\n")
    expect(new Set(lines).size).toBe(lines.length)
  })

  test("read-before-edit rule uses correct {n}: prefix format", () => {
    const rules = buildCommonRules(fromToolIds(["read", "edit"]))
    expect(rules).toContain("`{n}: `")
    expect(rules).not.toContain("`L{n}: `")
  })
})

describe("apply_patch mutual exclusion in buildCommonRules", () => {
  test("when apply_patch present, edit/write references omitted from common rules", () => {
    const facts = fromToolIds(["apply_patch", "read", "bash"])
    const rules = buildCommonRules(facts)
    expect(rules).not.toContain("`edit`")
    expect(rules).not.toContain("`write`")
  })

  test("bash vs file tools rule only lists present file tools", () => {
    const facts = fromToolIds(["apply_patch", "read", "bash", "glob", "grep"])
    const rules = buildCommonRules(facts)
    // Should mention glob, grep, read but NOT edit or write
    expect(rules).toContain("`glob`")
    expect(rules).toContain("`grep`")
    expect(rules).toContain("`read`")
    expect(rules).not.toContain("`edit`")
    expect(rules).not.toContain("`write`")
  })
})

describe("search tools separation text", () => {
  test("2 tools: uses 'and' without comma", () => {
    const rules = buildCommonRules(fromToolIds(["glob", "grep"]))
    expect(rules).toContain("`glob` for file-name search and `grep` for content search")
    expect(rules).not.toContain(", and")
  })

  test("3 tools: uses Oxford comma", () => {
    const rules = buildCommonRules(fromToolIds(["glob", "grep", "read"]))
    expect(rules).toMatch(/`glob`.*`grep`.*and `read`/)
  })
})
