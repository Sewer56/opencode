import { expect } from "bun:test"
import path from "path"
import fs from "fs/promises"
import { Cause, Effect, Exit, Fiber } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { LSP } from "@/lsp/lsp"
import { Format } from "@/format"
import { Agent } from "@/agent/agent"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Permission } from "@/permission"
import { Truncate } from "@/tool/truncate"
import { Tool } from "@/tool/tool"
import { WriteTool } from "@/tool/write"
import { EditTool } from "@/tool/edit"
import { ApplyPatchTool } from "@/tool/apply_patch"
import { canonicalPath } from "@/tool/permission-path"
import { SessionID, MessageID } from "@/session/schema"
import { TestInstance, tmpdirScoped } from "../fixture/fixture"
import { pollWithTimeout, testEffect } from "../lib/effect"

const it = testEffect(
  LayerNode.compile(
    LayerNode.group([
      LSP.node,
      FSUtil.node,
      Format.node,
      EventV2Bridge.node,
      Truncate.node,
      Agent.node,
      Permission.node,
      CrossSpawnSpawner.node,
    ]),
  ),
)

const fixture = Effect.fn("PermissionPathTest.fixture")(function* () {
  const instance = yield* TestInstance
  const outside = yield* tmpdirScoped()
  const alias = path.join(outside, "alias")
  const artifact = path.join(instance.directory, "artifact")
  yield* Effect.promise(async () => {
    await fs.mkdir(artifact)
    await fs.symlink(instance.directory, alias)
    await fs.symlink(outside, path.join(artifact, "out"))
  })

  const permission = yield* Permission.Service
  const sessionID = SessionID.make("ses_permission-path")
  const ctx: Tool.Context = {
    sessionID,
    messageID: MessageID.make("msg_permission-path"),
    agent: "build",
    abort: AbortSignal.any([]),
    messages: [],
    metadata: () => Effect.void,
    ask: (input) =>
      permission
        .ask({
          ...input,
          sessionID,
          ruleset: [
            { permission: "edit", pattern: "*", action: "ask" },
            { permission: "edit", pattern: "artifact/**", action: "allow" },
            { permission: "external_directory", pattern: "*", action: "ask" },
          ],
        })
        .pipe(Effect.orDie),
  }

  return { directory: instance.directory, artifact, outside, alias, ctx }
})

// Exercise real authorization and consumed file contents across each mutation entrypoint.
for (const mode of ["write", "edit", "patch", "move"] as const) {
  const execute = Effect.fn("PermissionPathTest.execute")(function* (
    target: string,
    existing: boolean,
    ctx: Tool.Context,
  ) {
    if (mode === "write") {
      const info = yield* WriteTool
      const tool = yield* info.init()
      return yield* tool.execute({ filePath: target, content: "new\n" }, ctx)
    }
    if (mode === "edit") {
      const info = yield* EditTool
      const tool = yield* info.init()
      return yield* tool.execute(
        { filePath: target, oldString: existing ? "old" : "", newString: existing ? "new" : "new\n" },
        ctx,
      )
    }

    const info = yield* ApplyPatchTool
    const tool = yield* info.init()
    const source = path.join(path.dirname(target), "source.txt")
    if (mode === "move") yield* Effect.promise(() => fs.writeFile(source, "old\n"))
    const patch =
      mode === "move"
        ? `*** Update File: ${source}\n*** Move to: ${target}\n@@\n-old\n+new`
        : existing
          ? `*** Update File: ${target}\n@@\n-old\n+new`
          : `*** Add File: ${target}\n+new`
    return yield* tool.execute({ patchText: `*** Begin Patch\n${patch}\n*** End Patch` }, ctx)
  })

  for (const existing of [false, true]) {
    it.instance(
      `${mode}_should_write_equal_contents_when_using_alias_${existing ? "existing" : "missing"}`,
      () =>
        Effect.gen(function* () {
          const test = yield* fixture()
          const relative = existing ? "file.txt" : "missing/ancestors/file.txt"
          const canonical = path.join(test.artifact, relative)
          const alias = path.join(test.alias, "artifact", relative)
          if (existing || mode === "move") {
            yield* Effect.promise(() => fs.mkdir(path.dirname(canonical), { recursive: true }))
          }
          if (existing) yield* Effect.promise(() => fs.writeFile(canonical, "old\n"))

          yield* execute(alias, existing, test.ctx)
          const aliased = yield* Effect.promise(() => fs.readFile(canonical, "utf8"))
          yield* Effect.promise(() => (existing ? fs.writeFile(canonical, "old\n") : fs.unlink(canonical)))
          yield* execute(canonical, existing, test.ctx)

          expect(yield* Effect.promise(() => fs.readFile(canonical, "utf8"))).toBe(aliased)
          expect(aliased).toBe("new\n")
          if (mode === "move")
            expect(
              yield* Effect.promise(() => Bun.file(path.join(path.dirname(canonical), "source.txt")).exists()),
            ).toBe(false)
        }),
      { git: true },
    )
  }

  for (const spelling of ["canonical", "alias", "outward", "external-alias"] as const) {
    it.instance(
      `${mode}_should_preserve_contents_when_${spelling}_is_denied`,
      () =>
        Effect.gen(function* () {
          const test = yield* fixture()
          const target =
            spelling === "outward"
              ? path.join(test.artifact, "out", "file.txt")
              : path.join(test.alias, "artifact", "file.txt")
          yield* Effect.promise(() => fs.writeFile(target, "old\n"))
          const permission = yield* Permission.Service
          const denied =
            spelling === "canonical" ? "artifact/file.txt" : path.relative(test.directory, target).replaceAll("\\", "/")
          const ctx: Tool.Context = {
            ...test.ctx,
            ask: (input) =>
              permission
                .ask({
                  ...input,
                  sessionID: test.ctx.sessionID,
                  ruleset: [
                    { permission: "*", pattern: "*", action: "allow" },
                    {
                      permission: spelling === "external-alias" ? "external_directory" : "edit",
                      pattern:
                        spelling === "outward"
                          ? "../*"
                          : spelling === "external-alias"
                            ? path.join(path.dirname(target), "*").replaceAll("\\", "/")
                            : denied,
                      action: "deny",
                    },
                    ...(spelling === "outward"
                      ? [{ permission: "edit", pattern: "artifact/**", action: "allow" as const }]
                      : []),
                  ],
                })
                .pipe(Effect.orDie),
          }

          const result = yield* execute(target, true, ctx).pipe(Effect.exit)

          expect(Exit.isFailure(result)).toBe(true)
          if (Exit.isFailure(result)) expect(Cause.pretty(result.cause)).toContain("PermissionDeniedError")
          expect(yield* Effect.promise(() => fs.readFile(target, "utf8"))).toBe("old\n")
          if (mode === "move")
            expect(
              yield* Effect.promise(() => fs.readFile(path.join(path.dirname(target), "source.txt"), "utf8")),
            ).toBe("old\n")
        }),
      { git: true },
    )
  }

  // Default-deny rulesets ("*": deny plus a narrow allow) treat alias spellings of granted
  // in-worktree targets as outside the worktree, so the spelling deny must defer to the grant.
  for (const granted of [true, false] as const) {
    it.instance(
      `${mode}_should_${granted ? "write" : "deny"}_when_alias_target_${granted ? "granted" : "ungranted"}_under_catch_all_deny`,
      () =>
        Effect.gen(function* () {
          const test = yield* fixture()
          const permission = yield* Permission.Service
          const relative = granted ? "artifact/file.txt" : "src/file.txt"
          const canonical = path.join(test.directory, relative)
          const target = path.join(test.alias, relative)
          yield* Effect.promise(() => fs.mkdir(path.dirname(canonical), { recursive: true }))
          yield* Effect.promise(() => fs.writeFile(canonical, "old\n"))

          const ctx: Tool.Context = {
            ...test.ctx,
            ask: (input) =>
              permission
                .ask({
                  ...input,
                  sessionID: test.ctx.sessionID,
                  ruleset: [
                    { permission: "*", pattern: "*", action: "deny" },
                    { permission: "external_directory", pattern: "*", action: "ask" },
                    { permission: "external_directory", pattern: `${test.outside}/**`, action: "allow" },
                    { permission: "edit", pattern: "artifact/**", action: "allow" },
                  ],
                })
                .pipe(Effect.orDie),
          }

          const result = yield* execute(target, true, ctx).pipe(Effect.exit)

          expect(Exit.isFailure(result)).toBe(!granted)
          if (!granted && Exit.isFailure(result)) expect(Cause.pretty(result.cause)).toContain("PermissionDeniedError")
          expect(yield* Effect.promise(() => fs.readFile(canonical, "utf8"))).toBe(granted ? "new\n" : "old\n")
          if (mode === "move")
            expect(
              yield* Effect.promise(() => Bun.file(path.join(path.dirname(canonical), "source.txt")).exists()),
            ).toBe(!granted)
        }),
      { git: true },
    )
  }

  it.instance(
    `${mode}_should_prompt_for_canonical_directory_when_symlink_points_outward`,
    () =>
      Effect.gen(function* () {
        const test = yield* fixture()
        const permission = yield* Permission.Service
        const target = path.join(test.artifact, "out", "file.txt")
        yield* Effect.promise(() => fs.writeFile(target, "old\n"))

        const fiber = yield* execute(target, true, test.ctx).pipe(Effect.exit, Effect.forkChild)
        const request = yield* pollWithTimeout(
          permission.list().pipe(Effect.map((requests) => requests[0])),
          "external permission not requested",
        )
        yield* permission.reply({ requestID: request.id, reply: "reject" })
        const result = yield* Fiber.join(fiber)

        expect(request.permission).toBe("external_directory")
        expect(request.patterns).toEqual([path.join(test.outside, "*").replaceAll("\\", "/")])
        expect(Exit.isFailure(result)).toBe(true)
        expect(yield* Effect.promise(() => fs.readFile(target, "utf8"))).toBe("old\n")
      }),
    { git: true },
  )
}

it.instance(
  "patch_move_should_preserve_source_when_destination_requires_external_approval",
  () =>
    Effect.gen(function* () {
      const test = yield* fixture()
      const permission = yield* Permission.Service
      const info = yield* ApplyPatchTool
      const tool = yield* info.init()
      const source = path.join(test.artifact, "source.txt")
      const destination = path.join(test.artifact, "out", "destination.txt")
      yield* Effect.promise(() => fs.writeFile(source, "old\n"))

      const fiber = yield* tool
        .execute(
          {
            patchText: `*** Begin Patch\n*** Update File: ${source}\n*** Move to: ${destination}\n@@\n-old\n+new\n*** End Patch`,
          },
          test.ctx,
        )
        .pipe(Effect.exit, Effect.forkChild)
      const request = yield* pollWithTimeout(
        permission.list().pipe(Effect.map((requests) => requests[0])),
        "destination approval not requested",
      )
      yield* permission.reply({ requestID: request.id, reply: "reject" })
      yield* Fiber.join(fiber)

      expect(request.permission).toBe("external_directory")
      expect(request.patterns).toEqual([path.join(test.outside, "*").replaceAll("\\", "/")])
      expect(yield* Effect.promise(() => fs.readFile(source, "utf8"))).toBe("old\n")
      expect(yield* Effect.promise(() => Bun.file(destination).exists())).toBe(false)
    }),
  { git: true },
)

for (const kind of ["loop", "not-directory", "dangling"] as const) {
  it.instance(`canonical_path_should_fail_when_${kind.replaceAll("-", "_")}`, () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const afs = yield* FSUtil.Service
      const target = path.join(test.directory, "target")
      yield* Effect.promise(async () => {
        if (kind === "not-directory") return fs.writeFile(target, "file")
        await fs.symlink(kind === "loop" ? target : path.join(test.directory, "missing"), target)
      })

      const result = yield* canonicalPath(kind === "not-directory" ? path.join(target, "leaf") : target, afs).pipe(
        Effect.exit,
      )

      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result))
        expect(Cause.pretty(result.cause)).toContain(kind === "dangling" ? "NotFound" : "BadResource")
    }),
  )
}
