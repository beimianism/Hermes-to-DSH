# Hermes to DSH

DSH (`dsh.bundle`) plugin that surfaces local **Hermes** assets — skills, MCP servers, chats — in the DeepSeek Harness web sidebar, and injects selected skills (SKILL.md) + MCP config into the active agent (active/passive mode).

## Layout

- `package.json` — manifest: `name: hermes-to-dsh`, `exports["./client"]`, `dsh.bundle.patch → cordis.patch.yml`, `dsh.client.platform: web`.
- `cordis.patch.yml` — bundle row `insert` referencing `name: 'hermes-to-dsh'`.
- `index.js` — Node (host) half; a Cordis plugin (`inject`, `apply`). Host RPC handlers: `inspect`, `chatPreview`, `mcpDetail`, `setMode`, `detail`.
- `client/index.js` — Web client half; injects `sidebar.footer.action` panel. Talks to host via `host.call(...)`.
- `scripts/` — read-only python helpers (`_hermes_scan.py`, `_chat_preview.py`, `_mcp_detail.py`).

## Build / release notes

- Manifest references are package-root-relative. Rows are resolved by package **name** (Node), not path.
- Commit built outputs when you want a 0-patch `git` install (git installs run no build). Currently this repo ships source directly.
- Public `@deepseek-ai/*` and `cordis` deps are intentionally undeclared (profile pnpm closure injects them).

## Testing

- `_chat_preview.py` accepts `python scripts/_chat_preview.py <session_id> [openN] [latestM] [roles]`.
- `node --check client/index.js` validates the client source before bundling.

## Install (dev-locally)

```bash
dsh plugin --profile web add github:OWNER/Hermes-to-DSH
```
