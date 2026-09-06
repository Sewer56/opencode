import path from "path"
import { Effect } from "effect"
import { InstanceState } from "@/effect/instance-state"
import type { Tool } from "./tool"
import { containsPath } from "../project/instance-context"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { canonicalPath } from "./permission-path"

type Kind = "file" | "directory"

type Options = {
  bypass?: boolean
  kind?: Kind
  /** Resolve mutation targets and project boundaries through symlinks. */
  fs?: FSUtil.Interface
}

export const assertExternalDirectoryEffect = Effect.fn("Tool.assertExternalDirectory")(function* (
  ctx: Tool.Context,
  target?: string,
  options?: Options,
) {
  if (!target) return false

  if (options?.bypass) return false

  const ins = yield* InstanceState.context
  const lexical = process.platform === "win32" ? FSUtil.normalizePath(target) : target
  const full = options?.fs ? yield* canonicalPath(lexical, options.fs) : lexical
  const boundary = options?.fs
    ? {
        ...ins,
        directory: yield* canonicalPath(ins.directory, options.fs),
        worktree: yield* canonicalPath(ins.worktree, options.fs),
      }
    : ins
  const kind = options?.kind ?? "file"
  const denyPatterns =
    options?.fs && !containsPath(lexical, ins)
      ? [path.join(kind === "directory" ? lexical : path.dirname(lexical), "*").replaceAll("\\", "/")]
      : []
  if (containsPath(full, boundary)) {
    if (denyPatterns.length) {
      yield* ctx.ask({ permission: "external_directory", patterns: [], denyPatterns, always: [], metadata: {} })
    }
    return false
  }

  const dir = kind === "directory" ? full : path.dirname(full)
  const glob =
    process.platform === "win32"
      ? FSUtil.normalizePathPattern(path.join(dir, "*"))
      : path.join(dir, "*").replaceAll("\\", "/")

  yield* ctx.ask({
    permission: "external_directory",
    patterns: [glob],
    ...(options?.fs
      ? { denyPatterns: [path.join(kind === "directory" ? lexical : path.dirname(lexical), "*").replaceAll("\\", "/")] }
      : {}),
    always: [glob],
    metadata: {
      filepath: full,
      parentDir: dir,
    },
  })
  return true
}, Effect.orDie)

export async function assertExternalDirectory(ctx: Tool.Context, target?: string, options?: Options) {
  return Effect.runPromise(assertExternalDirectoryEffect(ctx, target, options))
}
