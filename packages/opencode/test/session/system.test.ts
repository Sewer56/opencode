import { describe, expect, test } from "bun:test"
import path from "path"
import { Effect } from "effect"
import { Agent } from "../../src/agent/agent"
import { Instance } from "../../src/project/instance"
import { SystemPrompt } from "../../src/session/system"
import { provideInstance, tmpdir } from "../fixture/fixture"

// Add new test: systemPrompt returns structured prompt with environment and tool sections
test("systemPrompt returns structured prompt with environment and tool sections", async () => {
  await using tmp = await tmpdir({ git: true })
  const home = process.env.OPENCODE_TEST_HOME
  process.env.OPENCODE_TEST_HOME = tmp.path
  try {
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const runPrompt = Effect.gen(function* () {
          const svc = yield* SystemPrompt.Service
          const agent = { name: "build", options: {} } as any
          return svc.systemPrompt(["bash", "read"], agent)
        }).pipe(Effect.provide(SystemPrompt.defaultLayer))
        const result = await Effect.runPromise(runPrompt)
        expect(result.length).toBeGreaterThan(0)
        const joined = result.join("\n")
        expect(joined).toContain("# Environment")
        expect(joined).toContain("## `Bash` Tool")
        expect(joined).toContain("## `Read` Tool")
      },
    })
  } finally {
    process.env.OPENCODE_TEST_HOME = home
  }
})

// Add test: supplemental context OFF by default
test("systemPrompt omits supplemental context by default", async () => {
  await using tmp = await tmpdir({ git: true })
  const home = process.env.OPENCODE_TEST_HOME
  process.env.OPENCODE_TEST_HOME = tmp.path
  try {
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const runPrompt = Effect.gen(function* () {
          const svc = yield* SystemPrompt.Service
          const agent = { name: "build", options: {} } as any
          return svc.systemPrompt(["bash", "read"], agent)
        }).pipe(Effect.provide(SystemPrompt.defaultLayer))
        const result = await Effect.runPromise(runPrompt)
        const joined = result.join("\n")
        expect(joined).not.toContain("# Supplemental Context")
        expect(joined).not.toContain("Git Workflow")
      },
    })
  } finally {
    process.env.OPENCODE_TEST_HOME = home
  }
})

// Add test: supplemental context opt-in via agent.options.supplemental
test("systemPrompt includes supplemental context when agent.options.supplemental lists it", async () => {
  await using tmp = await tmpdir({ git: true })
  const home = process.env.OPENCODE_TEST_HOME
  process.env.OPENCODE_TEST_HOME = tmp.path
  try {
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const runPrompt = Effect.gen(function* () {
          const svc = yield* SystemPrompt.Service
          const agent = { name: "build", options: { supplemental: ["git-workflow", "github-cli"] } } as any
          return svc.systemPrompt(["bash", "read"], agent)
        }).pipe(Effect.provide(SystemPrompt.defaultLayer))
        const result = await Effect.runPromise(runPrompt)
        const joined = result.join("\n")
        expect(joined).toContain("# Supplemental Context")
        expect(joined).toContain("## Git Workflow")
        expect(joined).toContain("## GitHub CLI")
      },
    })
  } finally {
    process.env.OPENCODE_TEST_HOME = home
  }
})

// Add smoke test: provider() function is no longer exported
test("provider() is no longer exported from SystemPrompt module", () => {
  expect(typeof (SystemPrompt as any).provider).toBe("undefined")
})

// Add smoke test: per-provider prompt files are deleted
test("per-provider prompt files are deleted", async () => {
  const promptDir = path.resolve(__dirname, "../../src/session/prompt")
  const deleted = ["anthropic.txt", "gpt.txt", "beast.txt", "gemini.txt", "codex.txt", "kimi.txt", "trinity.txt", "default.txt", "copilot-gpt-5.txt", "plan-reminder-anthropic.txt"]
  for (const f of deleted) {
    const exists = await Bun.file(path.join(promptDir, f)).exists()
    expect(exists).toBe(false)
  }
})

function load<A>(dir: string, fn: (svc: Agent.Interface) => Effect.Effect<A>) {
  return Effect.runPromise(provideInstance(dir)(Agent.Service.use(fn)).pipe(Effect.provide(Agent.defaultLayer)))
}

describe("session.system", () => {
  test("skills output is sorted by name and stable across calls", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        for (const [name, description] of [
          ["zeta-skill", "Zeta skill."],
          ["alpha-skill", "Alpha skill."],
          ["middle-skill", "Middle skill."],
        ]) {
          const skillDir = path.join(dir, ".opencode", "skill", name)
          await Bun.write(
            path.join(skillDir, "SKILL.md"),
            `---
name: ${name}
description: ${description}
---

# ${name}
`,
          )
        }
      },
    })

    const home = process.env.OPENCODE_TEST_HOME
    process.env.OPENCODE_TEST_HOME = tmp.path

    try {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const build = await load(tmp.path, (svc) => svc.get("build"))
          const runSkills = Effect.gen(function* () {
            const svc = yield* SystemPrompt.Service
            return yield* svc.skills(build!)
          }).pipe(Effect.provide(SystemPrompt.defaultLayer))

          const first = await Effect.runPromise(runSkills)
          const second = await Effect.runPromise(runSkills)

          expect(first).toBe(second)

          const alpha = first!.indexOf("<name>alpha-skill</name>")
          const middle = first!.indexOf("<name>middle-skill</name>")
          const zeta = first!.indexOf("<name>zeta-skill</name>")

          expect(alpha).toBeGreaterThan(-1)
          expect(middle).toBeGreaterThan(alpha)
          expect(zeta).toBeGreaterThan(middle)
        },
      })
    } finally {
      process.env.OPENCODE_TEST_HOME = home
    }
  })
})
