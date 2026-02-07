# shared-agent-kit

在 `Cursor / Codex / OpenCode / Claude` 間共用 agent 入口與 skills 的最小 npm 專案。

## 目的

避免每次切換工具都重新定義 system 指令與 skills。

## 安裝與使用

```bash
cd /Users/weihung/projects/shared-agent-kit
npm install
```

在任一專案執行連結：

```bash
# 例如在 /Users/weihung/projects/trpgju
npx /Users/weihung/projects/shared-agent-kit/bin/agent-kit.mjs link --repo . --source AGENTS.md --skills ./.agent-kit/skills/,./.shared-agent-kit/skills/
```

## 設定檔（.shared-agent-kit）

執行 `link/sync` 時會自動建立：

- `./.shared-agent-kit/config.json`

範例：

```json
{
  "source": "AGENTS.md",
  "skills": [
    "./.agent-kit/skills/",
    "./.shared-agent-kit/skills/"
  ]
}
```

- `source` 可選：`AGENTS.md`、`CLAUDE.md`
- `skills` 為必要設定，至少要有 1 個路徑
- 若未提供 `skills`，預設會自動補 `./.agent-kit/skills/`
- CLI `--source` / `--skills` 會覆蓋設定檔值，並回寫到 `config.json`

## Git Ignore

工具會自動把下列項目加入目標專案的 `.gitignore`：

```gitignore
.shared-agent-kit/
```

## 會建立的檔案

- `./.agent-kit`（symlink，指向 shared-agent-kit）
- `./.cursor/rules/00-shared-agent.mdc`（Cursor 入口）
- `./.opencode/AGENTS.md`（OpenCode 入口）
- 依 `source` 補齊另一個入口轉接檔（`AGENTS.md` 或 `CLAUDE.md`）
- `skills` 內指定的目錄（不存在時自動建立）

所有入口都會導向：
- 你指定的來源檔（`AGENTS.md` 或 `CLAUDE.md`）
- `skills` 中設定的路徑清單

## 常用指令

```bash
npm run link -- --repo /path/to/your/repo --source AGENTS.md --skills ./.agent-kit/skills/,./.shared-agent-kit/skills/
npm run sync -- --repo /path/to/your/repo --source CLAUDE.md
npm run check -- --repo /path/to/your/repo
```

## 覆寫保護

若目標專案已有同名檔案，且不是本工具管理，預設不覆寫。可加 `--force`。

```bash
npm run sync -- --repo /path/to/your/repo --force
```
