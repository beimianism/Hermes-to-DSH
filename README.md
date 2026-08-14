<div align="center">

**中文** · [English](README.en.md)

# Hermes to DSH

**在 DeepSeek Harness Web 侧栏里浏览本机 Hermes 的 技能 / MCP 服务 / 对话历史,并把选中的技能与 MCP 配置注入到当前 agent。**

</div>

---

**Hermes to DSH**(`hermes-to-dsh`) 是一个 DSH 插件(`dsh.bundle`),把本机 [Hermes](https://github.com/anthropics/hermes) 资产(技能、MCP 服务、对话历史)以可停靠、可缩放的侧栏面板呈现在 DeepSeek Harness Web UI 中,并提供两种注入模式:

- **主动** — 勾选你真正要用的技能/MCP;插件读取所选 `SKILL.md` + MCP 配置,注入到当前 agent 的系统提示词(含长度警示与总量上限)。
- **被动** — 接触式提示;仅当某能力缺失时,agent 才按需读取技能 `SKILL.md` / MCP 配置。

## 功能

- **固定、可拖动/缩放面板**,四角抓取手柄(26px 命中区)。
- **两列布局**:左 = 仓库/项目 → 对话;右 = 技能 + MCP + 模式。
- **全局搜索**:对话名/id、技能名/描述、MCP 服务名。
- **对话预览**:点开任意对话看 `开场 X 条 + 最新 Y 条`(两侧条数可分别配置)。
- **来源过滤**:按对话 `source`(desktop/cron/...)过滤。
- **消息类型过滤**:只看 提问 `user` / 回答 `assistant` / 工具 `tool`;选定某类型后**自动补齐**到设定数量(跨越其他类型取足)。
- **复制地址**:复制会话 id。
- **MCP 详情**:勾选前先查看某服务的配置块。
- **主动选择落盘**:写入 `hermes-active-selection.json` 并通知当前会话,让 agent 知道你的选择。

## 能力面

| 能力面 | 说明 |
|---|---|
| **UI** | `sidebar.footer.action` 侧栏面板(pill 切换 固定/可缩放两列面板) |
| **Host handlers** | `inspect`、`chatPreview`、`mcpDetail`、`setMode`、`detail` |
| **注入** | `systemPrompt.section` `hermes:mode`(主动 → 所选 SKILL.md 全文 + MCP 配置;被动 → 接触式提示) |

## 安装

```bash
# bundle:进入 profile layer stack(重启 web 生效)
dsh plugin --profile web add github:beimianism/Hermes-to-DSH

# 或 纯 Cordis:通过配置 HMR,零重启
dsh plugin add github:beimianism/Hermes-to-DSH
```

> `@deepseek-ai/*` 与 `cordis` 公开依赖刻意不声明(由 profile 的 pnpm closure 注入)。

前置:本机 [Hermes](https://github.com/anthropics/hermes) 数据位于 `%LOCALAPPDATA%\hermes\state.db`(只读),且 `PATH` 里有 `python` 供辅助脚本使用。

## 使用

1. 打开 DeepSeek Harness **web** UI。
2. 点击左下角 **`📁 Hermes 资产`** 胶囊,切换面板。
3. 面板顶部:设置 开场/最新 条数、来源过滤、搜索、消息类型;标题栏切换 **主动/被动**。
4. 主动模式下勾选需要的 技能 / MCP 服务 —— 面板会写入选择并通知会话。

## 插件管理

在 **DSH 浏览器控制台 / 插件管理器** 中管理已启用插件。本 bundle 安装名为 `hermes-to-dsh`;卸载时从 profile layer stack 移除对应行并重启 web。

## 布局

```
Hermes-to-DSH/
├── package.json          # 清单(name, exports, dsh.bundle.patch, dsh.client)
├── cordis.patch.yml     # bundle 行,插入插件
├── index.js              # Node(host)半 —— Cordis 插件
├── client/index.js       # Web client 半 —— 侧栏面板
├── scripts/              # 只读 python 辅助脚本
│   ├── _hermes_scan.py       # 扫描 projects/repos/chats/skills/mcp
│   ├── _chat_preview.py      # 开场 X + 最新 Y(消息类型自动补齐)
│   └── _mcp_detail.py        # 读取某服务配置块
├── AGENTS.md
├── LICENSE (MIT)
└── README / README.en
```

## 许可证

[MIT](./LICENSE)
