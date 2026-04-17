import { describe, expect, test } from "bun:test"
import { build, type BuilderInput } from "../../src/session/system-prompt-builder"
import { fromToolIds } from "../../src/session/tool-prompt-facts"

import GIT_WORKFLOW from "../../src/session/supplemental/git-workflow.txt"
import GITHUB_CLI from "../../src/session/supplemental/github-cli.txt"

const baseInput = (toolIds: string[]): BuilderInput => ({
  facts: fromToolIds(toolIds),
  workingDirectory: "/home/user/project",
  platform: "linux",
})

describe("build", () => {
  test("output contains # Environment with working directory", () => {
    const result = build(baseInput(["read"]))
    const joined = result.join("\n")
    expect(joined).toContain("# Environment")
    expect(joined).toContain("Working directory: /home/user/project")
  })

  test("output contains # Tool Usage Guidelines when tools present", () => {
    const result = build(baseInput(["bash", "read"]))
    const joined = result.join("\n")
    expect(joined).toContain("# Tool Usage Guidelines")
  })

  test("output omits # Tool Usage Guidelines when no tool-specific rules", () => {
    const result = build(baseInput([]))
    const joined = result.join("\n")
    expect(joined).not.toContain("# Tool Usage Guidelines")
  })

  test("output contains ## Common Rules when applicable", () => {
    const result = build(baseInput(["bash", "read"]))
    const joined = result.join("\n")
    expect(joined).toContain("## Common Rules")
  })

  test("each present tool gets a ## `Tool` Tool section", () => {
    const result = build(baseInput(["bash", "read", "edit", "glob", "grep"]))
    const joined = result.join("\n")
    expect(joined).toContain("## `Bash` Tool")
    expect(joined).toContain("## `Read` Tool")
    expect(joined).toContain("## `Edit` Tool")
    expect(joined).toContain("## `Glob` Tool")
    expect(joined).toContain("## `Grep` Tool")
  })

  test("absent tools do NOT get sections", () => {
    const result = build(baseInput(["read"]))
    const joined = result.join("\n")
    expect(joined).not.toContain("## `Bash` Tool")
    expect(joined).not.toContain("## `Glob` Tool")
  })

  test("supplemental context included when provided", () => {
    const input = { ...baseInput(["bash"]),
      supplemental: [
        { name: "Git Workflow", content: GIT_WORKFLOW },
        { name: "GitHub CLI", content: GITHUB_CLI },
      ],
    }
    const result = build(input)
    const joined = result.join("\n")
    expect(joined).toContain("# Supplemental Context")
    expect(joined).toContain("## Git Workflow")
  })

  test("supplemental context omitted when not provided (default OFF)", () => {
    const result = build(baseInput(["read"]))
    const joined = result.join("\n")
    expect(joined).not.toContain("# Supplemental Context")
  })

  test("supplemental context omitted when empty array (default OFF)", () => {
    const input = { ...baseInput(["bash"]), supplemental: [] }
    const result = build(input)
    const joined = result.join("\n")
    expect(joined).not.toContain("# Supplemental Context")
    expect(joined).not.toContain("Git Workflow")
  })

  test("no triple newlines in output", () => {
    const result = build(baseInput(["bash", "read", "edit", "glob", "grep"]))
    const joined = result.join("\n")
    expect(joined).not.toMatch(/\n{3,}/)
  })

  test("no trailing whitespace per line", () => {
    const result = build(baseInput(["bash", "read"]))
    const joined = result.join("\n")
    for (const line of joined.split("\n")) {
      expect(line).toBe(line.trimEnd())
    }
  })

  test("section order: environment → tools → supplemental", () => {
    const input = { ...baseInput(["bash", "read"]),
      supplemental: [{ name: "Git Workflow", content: GIT_WORKFLOW }],
    }
    const result = build(input)
    const joined = result.join("\n")
    const envIdx = joined.indexOf("# Environment")
    const toolIdx = joined.indexOf("# Tool Usage Guidelines")
    const supIdx = joined.indexOf("# Supplemental Context")
    expect(envIdx).toBeLessThan(toolIdx)
    expect(toolIdx).toBeLessThan(supIdx)
  })

  test("no System Instructions / base prompt section in output", () => {
    const result = build(baseInput(["bash", "read", "edit", "glob", "grep"]))
    const joined = result.join("\n")
    expect(joined).not.toContain("# System Instructions")
    expect(joined).not.toContain("You are OpenCode")
  })
})

describe("tool section conditionality", () => {
  test("read section mentions directory support", () => {
    const result = build(baseInput(["read"]))
    const joined = result.join("\n")
    const readSection = joined.substring(joined.indexOf("## `Read` Tool"))
    expect(readSection).toContain("directories")
  })

  test("grep section says 'use instead of shell grep' when bash present", () => {
    const result = build(baseInput(["grep", "bash"]))
    const joined = result.join("\n")
    expect(joined).toContain("instead of shell")
  })

  test("write section says 'not small edits' when edit absent", () => {
    const result = build(baseInput(["write"]))
    const joined = result.join("\n")
    expect(joined).toContain("not small edits")
  })

  test("write section omits 'not small edits' when edit present", () => {
    const result = build(baseInput(["write", "edit"]))
    const joined = result.join("\n")
    const writeSection = joined.substring(joined.indexOf("## `Write` Tool"), joined.indexOf("## `Edit` Tool"))
    expect(writeSection).not.toContain("not small edits")
  })

  test("edit section present when read absent", () => {
    const result = build(baseInput(["edit"]))
    const joined = result.join("\n")
    expect(joined).toContain("## `Edit` Tool")
  })

  test("task section lists only available local tools", () => {
    const result = build(baseInput(["task", "read", "glob"]))
    const joined = result.join("\n")
    expect(joined).toContain("`read`")
    expect(joined).toContain("`glob`")
  })

  test("read section uses correct {n}: prefix format", () => {
    const result = build(baseInput(["read"]))
    const joined = result.join("\n")
    const readSection = joined.substring(joined.indexOf("## `Read` Tool"))
    expect(readSection).toContain("`{n}:")
    expect(readSection).not.toContain("`L{n}:")
  })
})

describe("apply_patch mutual exclusion", () => {
  test("when apply_patch present, edit/write sections omitted", () => {
    const result = build(baseInput(["apply_patch", "read"]))
    const joined = result.join("\n")
    expect(joined).not.toContain("## `Edit` Tool")
    expect(joined).not.toContain("## `Write` Tool")
    expect(joined).toContain("## `ApplyPatch` Tool")
  })
})
