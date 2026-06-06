import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Context, Effect, Layer } from "effect"

import { InstanceState } from "@/effect/instance-state"

import type { Agent } from "@/agent/agent"
import GIT_WORKFLOW from "./supplemental/git-workflow.txt"
import GITHUB_CLI from "./supplemental/github-cli.txt"
import { fromToolIds } from "./tool-prompt-facts"
import { build } from "./system-prompt-builder"
import { Permission } from "@/permission"
import { Skill } from "@/skill"
import { LocationServiceMap, locationServiceMapLayer } from "@opencode-ai/core/location-services"
import { MCP } from "@/mcp"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"

// Available supplemental context — keyed by the name used in agent.options.supplemental
const SUPPLEMENTAL_CONTEXT: Record<string, { name: string; content: string }> = {
  "git-workflow": { name: "Git Workflow", content: GIT_WORKFLOW },
  "github-cli": { name: "GitHub CLI", content: GITHUB_CLI },
}

export interface Interface {
  readonly systemPrompt: (toolIds: string[], agent: Agent.Info) => Effect.Effect<string[]>
  readonly skills: (agent: Agent.Info) => Effect.Effect<string | undefined>
  readonly mcp: (agent: Agent.Info, permission?: PermissionV1.Ruleset) => Effect.Effect<string | undefined>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SystemPrompt") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const skill = yield* Skill.Service
    const mcp = yield* MCP.Service

    return Service.of({
      systemPrompt: Effect.fn("SystemPrompt.systemPrompt")(function* (toolIds, agent) {
        const facts = fromToolIds(toolIds)
        const supplementalKeys = (agent.options?.supplemental ?? []) as string[]
        const supplemental = supplementalKeys
          .map((key) => SUPPLEMENTAL_CONTEXT[key])
          .filter(Boolean)
        const dir = yield* InstanceState.directory
        return build({
          facts,
          workingDirectory: dir,
          platform: process.platform,
          supplemental,
        })
      }),

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

      mcp: Effect.fn("SystemPrompt.mcp")(function* (agent: Agent.Info, permission?: PermissionV1.Ruleset) {
        const ruleset = Permission.merge(agent.permission, permission ?? [])
        const instructions = (yield* mcp.instructions()).filter(
          (item) => item.tools.length === 0 || Permission.disabled(item.tools, ruleset).size < item.tools.length,
        )
        if (instructions.length === 0) return

        return [
          "<mcp_instructions>",
          ...instructions.flatMap((item) => [
            `  <server name="${item.name}">`,
            ...item.instructions.split("\n").map((line) => `    ${line}`),
            "  </server>",
          ]),
          "</mcp_instructions>",
        ].join("\n")
      }),
    })
  }),
)

const locationServiceMapNode = LayerNode.make({
  service: LocationServiceMap.Service,
  layer: locationServiceMapLayer,
  deps: [],
})

export const node = LayerNode.make({
  service: Service,
  layer: layer,
  deps: [Skill.node, MCP.node, locationServiceMapNode],
})

export * as SystemPrompt from "./system"
