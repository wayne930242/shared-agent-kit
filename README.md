# shared-agent-kit

A minimal npm project for sharing agent entrypoints and skills across Cursor, Codex, OpenCode, and Claude.

## Goal

Avoid redefining system prompts and skills every time you switch tools.

## Install

```bash
cd /Users/weihung/projects/shared-agent-kit
npm install
```

## Link To A Target Repo

```bash
# Example: /Users/weihung/projects/trpgju
npx /Users/weihung/projects/shared-agent-kit/bin/agent-kit.mjs link --repo . --source codex --targets claude,cursor,opencode
```

## Config (.shared-agent-kit)

`link/sync` will create:

- `./.shared-agent-kit/config.json`

Example:

```json
{
  "source": "codex",
  "targets": ["codex", "claude", "cursor", "opencode"]
}
```

Rules:

- `source`: one of `codex`, `claude`, `cursor`, `opencode`
- `targets`: comma-separated tool names
- If `targets` is missing, all tools except `source` are auto-selected (and `source` is always included)

## Skills

No manual skills path config is required.

The tool always uses shared skills from:

- `./.agent-kit/skills/`

## Git Ignore

The tool appends this line to the target repo `.gitignore`:

```gitignore
.shared-agent-kit/
```

## Tool Path Mapping

- `codex` -> `AGENTS.md`
- `claude` -> `CLAUDE.md`
- `cursor` -> `.cursor/rules/00-shared-agent.mdc`
- `opencode` -> `.opencode/AGENTS.md`

## Common Commands

```bash
npm run link -- --repo /path/to/repo --source codex --targets claude,cursor,opencode
npm run sync -- --repo /path/to/repo --source claude
npm run check -- --repo /path/to/repo
```

## Overwrite Protection

If a target file already exists and is not managed by this tool, it will not be overwritten by default. Use `--force`.

```bash
npm run sync -- --repo /path/to/repo --force
```
