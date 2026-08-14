// Hermes to DSH — Node (host) half.
// A Cordis plugin that: scans local Hermes assets, serves chat previews,
// exposes MCP details, and injects user-selected skills (SKILL.md) + MCP config
// into the active agent's system prompt (active/passive mode).
// Works both as a dynamic in-session plugin and as a native DSH bundle entry.

const SCAN_PATH = new URL('./scripts/_hermes_scan.py', import.meta.url).pathname
  .replace(/^\/([A-Za-z]:)/, '$1');
const PREVIEW_PATH = new URL('./scripts/_chat_preview.py', import.meta.url).pathname
  .replace(/^\/([A-Za-z]:)/, '$1');
const MCP_DETAIL_PATH = new URL('./scripts/_mcp_detail.py', import.meta.url).pathname
  .replace(/^\/([A-Za-z]:)/, '$1');
const WS = process.env.HERMES_WORKSPACE || (process.env.USERPROFILE || process.env.HOME);
const SEL_FILE = WS + '/hermes-active-selection.json';
const SKILL_CAP = 5000;
const TOTAL_CAP = 12000;

export default {
  inject: ['subprocess', 'shell', 'fs', 'systemPrompt', 'agents', 'sessions'],
  name: 'hermes-to-dsh',
  apply(ctx) {
    const sub = ctx.get('subprocess');
    const sh = ctx.get('shell');
    const fsService = ctx.get('fs');
    const sp = ctx.get('systemPrompt');
    const ag = ctx.get('agents');
    const ses = ctx.get('sessions');

    let scanCache = null;
    const mode = { active:false, skills:[], mcp:[], skillTexts:{}, mcpTexts:{} };

    async function runCmd(argv, cwd) {
      if (sub && typeof sub.spawn === 'function') {
        try {
          const h = sub.spawn({
            argv, cwd,
            stdio: { stdin:'ignore', stdout:{ maxBytes: 3000000 }, stderr:{ maxBytes: 100000 } },
            graceMs: 2000,
          });
          await h.done;
          const rd = h.collected && h.collected.stdout ? h.collected.stdout.readFrom(0) : undefined;
          return (rd && rd.text) || '';
        } catch (e) { return 'ERR:' + String((e && e.message) ? e.message : e); }
      }
      if (sh && typeof sh.resolve === 'function') {
        try {
          const spec = sh.resolve({ command: argv.join(' '), timeoutMs: 30000, stdoutMaxBytes: 3000000 });
          const res = await sh.run(spec);
          return (res && res.stdout && res.stdout.text) || '';
        } catch (e) { return 'ERR:' + String((e && e.message) ? e.message : e); }
      }
      return 'ERR:no-shell';
    }

    async function runScan() {
      const t = await runCmd(['python', SCAN_PATH], WS);
      if (t.indexOf('ERR:') === 0) return { error: t };
      const line = t.trim().split(/\r?\n/).pop() || '';
      try { return JSON.parse(line); } catch (e) { return { error: '解析失败' }; }
    }

    async function chatPreview(id, openN, latestM, roles) {
      try {
        const rolesStr = Array.isArray(roles) ? roles.join(',') : (String(roles || ''));
        const args = ['python', PREVIEW_PATH, String(id || ''),
          String((openN == null) ? 2 : openN),
          String((latestM == null) ? 3 : latestM), rolesStr];
        const t = await runCmd(args, WS);
        const line = t.trim().split(/\r?\n/).pop() || '{}';
        try { const obj = JSON.parse(line); return { opening: obj.opening || [], latest: obj.latest || [] }; }
        catch (e) { return { opening: [], latest: [] }; }
      } catch (e) { return { opening: [], latest: [] }; }
    }

    async function readSkillText(name) {
      try {
        const s = (scanCache && scanCache.skills || []).find(x => x.name === name);
        const p = s && s.path;
        if (!p || !fsService) return '';
        const t = await fsService.resolve(p + '/SKILL.md');
        const c = await fsService.readText(t);
        return c.length > SKILL_CAP ? c.slice(0, SKILL_CAP) : c;
      } catch (e) { return ''; }
    }

    async function readMcpDetail(name) {
      try {
        const t = await runCmd(['python', MCP_DETAIL_PATH, String(name || '')], WS);
        const line = t.trim().split(/\r?\n/).pop() || '{}';
        try { const obj = JSON.parse(line); return (obj && obj.detail) ? obj.detail : ''; }
        catch (e) { return ''; }
      } catch (e) { return ''; }
    }

    function buildSection() {
      if (mode.active) {
        const lines = [
          '[hermes] 主动模式：用户已主动选择以下 Hermes 资产。请查看hermes-active-selection.json 获取所选清单（含 SKILL.md 全文与 MCP 配置）；按需直接使用。',
          '⚠️ 提示：勾选过多/过大可能导致提示词过长，建议只勾真正要用的技能。'
        ];
        if (mode.skills.length) {
          for (let i = 0; i < mode.skills.length; i++) {
            const nm = mode.skills[i];
            lines.push('\n## 技能: ' + nm);
            lines.push(mode.skillTexts[nm] || '（内容未加载，见 SKILL.md）');
          }
        }
        if (mode.mcp.length) {
          lines.push('\n## 已选 MCP 服务与配置:');
          for (let k = 0; k < mode.mcp.length; k++) {
            const mn = mode.mcp[k];
            lines.push('\n### ' + mn);
            lines.push(mode.mcpTexts[mn] || '（配置未加载）');
          }
        }
        return lines.join('\n');
      }
      const skills = (scanCache && scanCache.skills || []).length;
      const mcp = (scanCache && scanCache.mcp || []).length;
      return '[hermes] 被动模式（接触式）：本机 Hermes 有 ' + skills + ' 个技能、' + mcp +
        ' 个 MCP（侧栏「 Hermes 资产」面板可看全量清单与技能/MCP详情）。当你在当前任务缺少某个能力/工具时，' +
        '先想起 Hermes 里可能有——点面板该技能/MCP的「详情」读其 SKILL.md/配置，或直接用 fs 读目录 ' +
        (process.env.LOCALAPPDATA || '') + '\\hermes\\skills 按需取用；不要预先灌输全部技能。';
    }

    async function writeSelection() {
      try {
        if (!fsService) return false;
        const t = await fsService.resolve(SEL_FILE);
        await fsService.writeText(t, JSON.stringify({
          at: new Date().toISOString(), active: mode.active,
          skills: mode.skills, mcp: mode.mcp,
          skillTexts: mode.skillTexts, mcpTexts: mode.mcpTexts,
        }, null, 2));
        return true;
      } catch (e) { return false; }
    }

    async function notifyInSession() {
      try {
        const init = ag && typeof ag.currentInitiator === 'function' ? ag.currentInitiator() : undefined;
        const session = init && init.session ? init.session : undefined;
        if (!session || !ses || typeof ses.flush !== 'function') return false;
        const sid = session.id;
        session.append('user/request', {
          requestId: sid + '-r' + Math.floor(Math.random() * 1e8),
          message: {
            id: sid + '-m' + Math.floor(Math.random() * 1e8),
            role: 'user',
            source: { kind:'agent', sessionId: sid, cwd: (session.header && session.header.cwd) || WS },
            content: [{
              type: 'text',
              text: '[Hermes面板] 用户已将注入切到主动，勾选技能=' + JSON.stringify(mode.skills) +
                '，MCP=' + JSON.stringify(mode.mcp) +
                '。请据此在上方可用技能/MCP中按需使用（全文见 SKILL.md，配置见hermes-active-selection.json）。'
            }],
          },
        }, {});
        await ses.flush(session);
        return true;
      } catch (e) { return false; }
    }

    const sec = sp && typeof sp.section === 'function'
      ? sp.section({ name:'hermes:mode', order: 110, text: () => buildSection() }) : null;
    if (sec) ctx.on('dispose', () => { try { sec(); } catch (e) {} });

    // --- RPC surface (dynamic-plugin contract: harness.handle) ---
    // In a native bundle these move onto the profile's router; when loaded as a
    // dynamic in-session plugin they register via `harness.handle`. Both paths
    // expose the same JSON method names the client calls.
    const handlers = {
      inspect: async () => { const det = await runScan(); scanCache = det; return { detected: det }; },
      chatPreview: async (a) => chatPreview(String((a && a.id) || ''), a && a.openN, a && a.latestM, a && a.roles),
      mcpDetail: async (a) => ({ detail: await readMcpDetail(String((a && a.id) || '')) }),
      setMode: async (a) => {
        mode.active = !!a && !!a.active;
        mode.skills = Array.isArray(a && a.skills) ? a.skills.map(String) : [];
        mode.mcp = Array.isArray(a && a.mcp) ? a.mcp.map(String) : [];
        const texts = {};
        let budget = TOTAL_CAP;
        if (mode.active) {
          for (let j = 0; j < mode.skills.length && budget > 0; j++) {
            const nm = mode.skills[j];
            if (budget <= 0) { texts[nm] = '（已超总量上限，未加载全文）'; continue; }
            const full = await readSkillText(nm);
            texts[nm] = full.length > budget ? full.slice(0, budget) : full;
            budget -= texts[nm].length;
          }
        }
        mode.skillTexts = texts;
        const mtexts = {};
        if (mode.active) {
          for (let q = 0; q < mode.mcp.length; q++) mtexts[mode.mcp[q]] = await readMcpDetail(mode.mcp[q]);
        }
        mode.mcpTexts = mtexts;
        await writeSelection();
        await notifyInSession();
        return { ok:true, persisted:true };
      },
      detail: async (a) => {
        const id = a && a.id;
        if (!id || !fsService) return { content: '' };
        const s = (scanCache && scanCache.skills || []).find(x => x.name === id);
        const p = s && s.path;
        if (!p) return { content: '' };
        try { const t = await fsService.resolve(p + '/SKILL.md'); return { content: await fsService.readText(t) }; }
        catch (e) { return { content:'', error: String((e && e.message) ? e.message : e) }; }
      },
    };

    if (typeof harness !== 'undefined' && harness && typeof harness.handle === 'function') {
      Object.keys(handlers).forEach(k => harness.handle(k, handlers[k]));
    } else {
      // Native: expose via ctx.rpc if available (profile router).
      const router = ctx.get('rpc') || ctx.get('router');
      if (router && typeof router.handle === 'function') {
        Object.keys(handlers).forEach(k => router.handle('hermes.' + k, handlers[k]));
      }
    }
  },
};
