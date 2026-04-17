import { Context, Effect, Layer } from "effect"

import { Instance } from "../project/instance"

import type { Agent } from "@/agent/agent"
import GIT_WORKFLOW from "./supplemental/git-workflow.txt"
import GITHUB_CLI from "./supplemental/github-cli.txt"
import { fromToolIds } from "./tool-prompt-facts"
import { build } from "./system-prompt-builder"
import { Permission } from "@/permission"
import { Skill } from "@/skill"

// Available supplemental context — keyed by the name used in agent.options.supplemental
const SUPPLEMENTAL_CONTEXT: Record<string, { name: string; content: string }> = {
  "git-workflow": { name: "Git Workflow", content: GIT_WORKFLOW },
  "github-cli": { name: "GitHub CLI", content: GITHUB_CLI },
}

export interface Interface {
  readonly systemPrompt: (toolIds: string[], agent: Agent.Info) => string[]
  readonly skills: (agent: Agent.Info) => Effect.Effect<string | undefined>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SystemPrompt") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const skill = yield* Skill.Service

    return Service.of({
      systemPrompt(toolIds, agent) {
        const facts = fromToolIds(toolIds)
        const supplementalKeys = (agent.options?.supplemental ?? []) as string[]
        const supplemental = supplementalKeys
          .map((key) => SUPPLEMENTAL_CONTEXT[key])
          .filter(Boolean)
        return build({
          facts,
          workingDirectory: Instance.directory,
          platform: process.platform,
          supplemental,
        })
      },

      skills: Effect.fn("SystemPrompt.skills")(function* (agent: Agent.Info) {
        if (Permission.disabled(["skill"], agent.permission).has("skill")) return

        const list = yield* skill.available(agent)

        return [
          "Skills provide specialized instructions and workflows for specific tasks.",
          "Use the skill tool to load a skill when a task matches its description.",
          // the agents seem to ingest the information about skills a bit better if we present a more verbose
          // version of them here and a less verbose version in tool description, rather than vice versa.
          Skill.fmt(list, { verbose: true }),
        ].join("\n")
      }),
    })
  }),
)

export const defaultLayer = layer.pipe(Layer.provide(Skill.defaultLayer))

export * as SystemPrompt from "./system"
