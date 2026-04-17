### System Prompt (Fork Differences)

This fork replaces OpenCode's per-provider system prompts with a minimal, conditionally-assembled prompt based on which tools are available. The system prompt contains only:

- **Environment** — working directory and platform
- **Tool Usage Guidelines** — common rules and per-tool guidance, conditionally included based on which tools are present in the session
- **Supplemental Context** — optional extra sections (off by default)

There is no base prompt / "System Instructions" section. Tool descriptions in `.txt` files are one-liners; detailed guidance lives in the prompt builder.

Test: `bun run packages/opencode/script/preview-system-prompt.ts`

#### Supplemental Context

Supplemental context sections (e.g., git workflow, GitHub CLI guidance) are **off by default** and must be explicitly enabled per agent. Available sections:

| Key            | Description                          |
| -------------- | ------------------------------------ |
| `git-workflow` | Git commit safety protocol           |
| `github-cli`   | GitHub PR creation workflow via `gh` |

To enable, add a `supplemental` array to your agent config:

**In `opencode.jsonc`:**
```jsonc
{
  "agent": {
    "build": {
      "supplemental": ["git-workflow", "github-cli"]
    }
  }
}
```

**In an agent markdown file** (`.opencode/agent/build.md`):
```yaml
---
name: build
supplemental:
  - git-workflow
  - github-cli
---
```
