<div align="center">

# Hermes to DSH

**Browse your local Hermes skills / MCP servers / chats right inside the DeepSeek Harness web sidebar, and inject the selected skills & MCP config into the active agent.**

</div>

---

**Hermes to DSH** (`hermes-to-dsh`) is a DSH plugin (`dsh.bundle`) that surfaces your local [Hermes](https://github.com/anthropic) assets (skills, MCP servers, conversation history) in the DeepSeek Harness web UI as a dockable, resizable sidebar panel. It offers two injection modes:

- **主动 (Active)** — you tick the skills / MCP servers you actually need; the plugin reads each selected `SKILL.md` + MCP config and injects them into the active agent's system prompt (with a length warning and total cap).
- **被动 (Passive)** — a contact-style hint; the agent reads skill `SKILL.md` / MCP config on demand only when a capability is missing.

## Features

- **Fixed, draggable/resizable panel** with four-corner grab handles (26px hit area).
- **Two columns**: left = repositories / projects → conversations; right = skills + MCP servers + mode.
- **Global search** across chat name / id, skill name / description, MCP server name.
- **Conversation preview** — open any chat to see `开场 X 条 + 最新 Y 条` (per-side counts are configurable).
- **Source filter** — filter chats by their `source` (desktop / cron / ...).
- **Message-type filter** — keep only 提问 `user` / 回答 `assistant` / 工具 `tool`; when a type is chosen the panel **auto-fills** the requested count by stepping across other message types.
- **Copy address** — copy the conversation id.
- **MCP detail** — inspect a server's config block before selecting it.
- **Active selection persistence** — writes `hermes-active-selection.json` and pings the live session so the agent knows what you chose.

## Capabilities

| Surface | What it provides |
|---|---|
| **UI** | `sidebar.footer.action` sidebar panel (pill toggling a fixed/resizable two-column panel) |
| **Host handlers** | `inspect`, `chatPreview`, `mcpDetail`, `setMode`, `detail` |
| **Injection** | `systemPrompt.section` `hermes:mode` (active → selected SKILL.md full text + MCP config; passive → contact hint) |

## Install

```bash
# bundle: enters the profile layer stack (restart web)
dsh plugin --profile web add github:OWNER/Hermes-to-DSH

# or pure-Cordis, zero-restart via config HMR
dsh plugin add github:OWNER/Hermes-to-DSH
```

> Replace `OWNER` with your GitHub username/organization. Public `@deepseek-ai/*` and `cordis` deps are intentionally undeclared (injected by the profile pnpm closure).

Requires local [Hermes](https://github.com/anthropics/hermes) data at `%LOCALAPPDATA%\hermes\state.db` (read-only), and `python` on `PATH` for the helper scripts.

## Usage

1. Open the DeepSeek Harness **web** UI.
2. Click the **`📁 Hermes 资产`** pill (bottom-left) to toggle the panel.
3. In the panel: set the opening/latest counts, filter by source, search, choose a message type, and toggle **主动/被动** in the header.
4. Tick the skills / MCP servers you need (active mode) — the panel writes the selection and notifies the session.

## Plugin management

Manage enabled plugins from the **DSH browser console / plugin manager**. This bundle is installed as `hermes-to-dsh`; to uninstall, remove the corresponding row from your profile layer stack and restart web.

## Scripts / layout

```
Hermes-to-DSH/
├── package.json          # manifest (name, exports, dsh.bundle.patch, dsh.client)
├── cordis.patch.yml     # bundle row that inserts the plugin
├── index.js              # Node (host) half — Cordis plugin
├── client/index.js       # Web client half — sidebar panel
├── scripts/              # read-only python helpers
│   ├── _hermes_scan.py       # scan projects/repos/chats/skills/mcp
│   ├── _chat_preview.py      # opening X + latest Y (role auto-fill)
│   └── _mcp_detail.py        # read a server's config block
├── AGENTS.md
├── LICENSE (MIT)
└── README / README.zh
```

## License

[MIT](./LICENSE)
