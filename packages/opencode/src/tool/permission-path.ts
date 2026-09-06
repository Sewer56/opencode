import path from "path"
import { Effect } from "effect"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { InstanceState } from "@/effect/instance-state"

/**
 * Resolve permission targets through existing ancestors without hiding filesystem failures.
 *
 * # Remarks
 * Missing suffixes are appended to the nearest resolved ancestor. Dangling symlinks fail closed.
 * This is an authorization snapshot, not protection against concurrent symlink replacement.
 *
 * # Errors
 * - `PlatformError`: resolution or link inspection fails for reasons other than a missing path, or finds a dangling symlink.
 * - `Error`: no ancestor, including the filesystem root, can be resolved.
 */
export const canonicalPath = Effect.fn("Tool.canonicalPath")(function* (target: string, fs: FSUtil.Interface) {
  let current = path.resolve(target)
  const missing: string[] = []

  while (true) {
    const resolved = yield* fs.realPath(current).pipe(
      Effect.catchReason("PlatformError", "NotFound", (error) =>
        // A dangling symlink is not a missing leaf. Fail closed rather than authorize its spelling.
        fs.readLink(current).pipe(
          Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(undefined)),
          Effect.flatMap((link) => (link === undefined ? Effect.succeed(undefined) : Effect.fail(error))),
        ),
      ),
    )
    if (resolved !== undefined) return path.join(resolved, ...missing.reverse())

    const parent = path.dirname(current)
    if (parent === current) return yield* Effect.fail(new Error(`Cannot resolve permission path: ${target}`))
    missing.push(path.basename(current))
    current = parent
  }
})

/** Use canonical edit targets for grants and lexical spellings only for effective denials. */
export const editPatterns = Effect.fn("Tool.editPatterns")(function* (targets: string[], fs: FSUtil.Interface) {
  const instance = yield* InstanceState.context
  const worktree = yield* canonicalPath(instance.worktree, fs)
  const patterns: string[] = []
  const denyPatterns: string[] = []

  for (const target of targets) {
    patterns.push(path.relative(worktree, yield* canonicalPath(target, fs)).replaceAll("\\", "/"))
    denyPatterns.push(path.relative(instance.worktree, target).replaceAll("\\", "/"))
  }

  return { patterns, denyPatterns }
})
