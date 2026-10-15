// Hermes to DSH — mitad Node (host).
// Plugin Cordis que: escanea los activos locales de Hermes, sirve vistas previas
// de conversaciones, expone el detalle de MCP e inyecta las habilidades
// seleccionadas por el usuario (SKILL.md) + la configuración MCP en el prompt de
// sistema del agente activo (modo activo/pasivo).
//
// Transporte: monta una ruta HTTP propia `/hermes` con `ctx.webServer.register`
// (el mecanismo vigente en DSH 0.2.0-rc.2). Los cinco endpoints (`inspect`,
// `chatPreview`, `mcpDetail`, `setMode`, `detail`) hablan el mismo envelope
// `{type:'server-response', rpcId, result:{ok,value}}` que consume
// `ctx.connection.rpc.call` en el navegador, de modo que la interfaz del cliente
// no cambia.

import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROUTE_PATH = '/hermes';
const SCAN_PATH = fileURLToPath(new URL('./scripts/_hermes_scan.py', import.meta.url));
const PREVIEW_PATH = fileURLToPath(new URL('./scripts/_chat_preview.py', import.meta.url));
const MCP_DETAIL_PATH = fileURLToPath(new URL('./scripts/_mcp_detail.py', import.meta.url));
const WS = process.env.HERMES_WORKSPACE || (process.env.USERPROFILE || process.env.HOME);
const SEL_FILE = join(WS, 'hermes-active-selection.json');
const SKILL_CAP = 5000;
const TOTAL_CAP = 12000;
const MAX_BODY_BYTES = 2_000_000;

function runPython(args) {
  return new Promise((resolve) => {
    execFile('python', args, { cwd: WS, maxBuffer: 3_000_000, windowsHide: true }, (err, stdout) => {
      if (err) { resolve('ERR:' + String((err && err.message) ? err.message : err)); return; }
      resolve(String(stdout || ''));
    });
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) { reject(new Error('cuerpo de la petición demasiado grande')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (e) { reject(new Error('JSON inválido en la petición')); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  const bytes = Buffer.from(JSON.stringify(body));
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', String(bytes.length));
  res.setHeader('Cache-Control', 'no-store');
  res.writeHead(status);
  res.end(bytes);
}

export default {
  // ⚠️ Declara solo servicios que existan realmente en este perfil: declarar
  // servicios inexistentes hace que Cordis espere para siempre y apply nunca se
  // ejecute (era la causa de que /hermes no llegara a montarse). Los scripts de
  // Hermes se ejecutan con node:child_process y los archivos se leen con
  // node:fs/promises, así que no dependemos de subprocess/shell/fs.
  inject: ['webServer'],
  name: 'hermes-to-dsh',
  apply(ctx) {
    const sp = ctx.get('systemPrompt');
    const ag = ctx.get('agents');
    const ses = ctx.get('sessions');

    let scanCache = null;
    const mode = { active:false, skills:[], mcp:[], skillTexts:{}, mcpTexts:{} };

    async function runScan() {
      const t = await runPython([SCAN_PATH]);
      if (t.indexOf('ERR:') === 0) return { error: t };
      const line = t.trim().split(/\r?\n/).pop() || '';
      try { return JSON.parse(line); } catch (e) { return { error: 'error de análisis' }; }
    }

    async function chatPreview(id, openN, latestM, roles) {
      try {
        const rolesStr = Array.isArray(roles) ? roles.join(',') : (String(roles || ''));
        const args = [PREVIEW_PATH, String(id || ''),
          String((openN == null) ? 2 : openN),
          String((latestM == null) ? 3 : latestM), rolesStr];
        const t = await runPython(args);
        const line = t.trim().split(/\r?\n/).pop() || '{}';
        try { const obj = JSON.parse(line); return { opening: obj.opening || [], latest: obj.latest || [] }; }
        catch (e) { return { opening: [], latest: [] }; }
      } catch (e) { return { opening: [], latest: [] }; }
    }

    async function readSkillText(name) {
      try {
        const s = (scanCache && scanCache.skills || []).find(x => x.name === name);
        const p = s && s.path;
        if (!p) return '';
        const c = await readFile(join(p, 'SKILL.md'), 'utf8');
        return c.length > SKILL_CAP ? c.slice(0, SKILL_CAP) : c;
      } catch (e) { return ''; }
    }

    async function readMcpDetail(name) {
      try {
        const t = await runPython([MCP_DETAIL_PATH, String(name || '')]);
        const line = t.trim().split(/\r?\n/).pop() || '{}';
        try { const obj = JSON.parse(line); return (obj && obj.detail) ? obj.detail : ''; }
        catch (e) { return ''; }
      } catch (e) { return ''; }
    }

    function buildSection() {
      if (mode.active) {
        const lines = [
          '[hermes] Modo activo: el usuario ha seleccionado estos activos de Hermes. Consulta hermes-active-selection.json en el directorio personal del usuario para ver la lista seleccionada (incluye el texto completo de SKILL.md y la configuración MCP); úsalos directamente según los necesites.',
          '⚠️ Aviso: marcar demasiados elementos o muy grandes puede alargar en exceso el prompt; se recomienda marcar solo las habilidades que realmente vayas a usar.'
        ];
        if (mode.skills.length) {
          for (let i = 0; i < mode.skills.length; i++) {
            const nm = mode.skills[i];
            lines.push('\n## Habilidad: ' + nm);
            lines.push(mode.skillTexts[nm] || '(contenido no cargado; ver SKILL.md)');
          }
        }
        if (mode.mcp.length) {
          lines.push('\n## Servidores MCP seleccionados y su configuración:');
          for (let k = 0; k < mode.mcp.length; k++) {
            const mn = mode.mcp[k];
            lines.push('\n### ' + mn);
            lines.push(mode.mcpTexts[mn] || '(configuración no cargada)');
          }
        }
        return lines.join('\n');
      }
      const skills = (scanCache && scanCache.skills || []).length;
      const mcp = (scanCache && scanCache.mcp || []).length;
      return '[hermes] Modo pasivo (por contacto): este equipo tiene ' + skills + ' habilidades y ' + mcp +
        ' MCP en Hermes (el panel «Activos de Hermes» de la barra lateral muestra la lista completa y el detalle de habilidades/MCP). Cuando te falte alguna capacidad o herramienta para la tarea actual, ' +
        'recuerda que puede estar en Hermes: en el panel, pulsa «detalle» en esa habilidad/MCP y lee su SKILL.md o configuración, o usa fs para leer el directorio ' +
        (process.env.LOCALAPPDATA || '') + '\\hermes\\skills según lo necesites; no precargues todas las habilidades.';
    }

    async function writeSelection() {
      try {
        await writeFile(SEL_FILE, JSON.stringify({
          at: new Date().toISOString(), active: mode.active,
          skills: mode.skills, mcp: mode.mcp,
          skillTexts: mode.skillTexts, mcpTexts: mode.mcpTexts,
        }, null, 2), 'utf8');
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
              text: '[Panel Hermes] El usuario ha cambiado la inyección a modo activo; habilidades marcadas=' + JSON.stringify(mode.skills) +
                ', MCP=' + JSON.stringify(mode.mcp) +
                '. Úsalas según las necesites entre las habilidades/MCP disponibles arriba (texto completo en SKILL.md; configuración en hermes-active-selection.json del directorio personal del usuario).'
            }],
          },
        }, {});
        await ses.flush(session);
        return true;
      } catch (e) { return false; }
    }

    async function dispatch(method, a) {
      if (method === 'inspect') {
        const det = await runScan(); scanCache = det; return { detected: det };
      }
      if (method === 'chatPreview') {
        return chatPreview(String(a.id || ''), a.openN, a.latestM, a.roles);
      }
      if (method === 'mcpDetail') {
        return { detail: await readMcpDetail(String(a.id || '')) };
      }
      if (method === 'setMode') {
        mode.active = !!a.active;
        mode.skills = Array.isArray(a.skills) ? a.skills.map(String) : [];
        mode.mcp = Array.isArray(a.mcp) ? a.mcp.map(String) : [];
        const texts = {}; let budget = TOTAL_CAP;
        if (mode.active) {
          for (let j = 0; j < mode.skills.length && budget > 0; j++) {
            const nm = mode.skills[j];
            if (budget <= 0) { texts[nm] = '(se superó el límite total; texto completo no cargado)'; continue; }
            const full = await readSkillText(nm);
            texts[nm] = full.length > budget ? full.slice(0, budget) : full;
            budget -= texts[nm].length;
          }
        }
        mode.skillTexts = texts;
        const mtexts = {};
        if (mode.active) { for (let q = 0; q < mode.mcp.length; q++) mtexts[mode.mcp[q]] = await readMcpDetail(mode.mcp[q]); }
        mode.mcpTexts = mtexts;
        await writeSelection(); await notifyInSession();
        return { ok: true, persisted: true };
      }
      if (method === 'detail') {
        const id = a.id;
        if (!id) return { content: '' };
        const s = (scanCache && scanCache.skills || []).find(x => x.name === id);
        const p = s && s.path;
        if (!p) return { content: '' };
        try { return { content: await readFile(join(p, 'SKILL.md'), 'utf8') }; }
        catch (e) { return { content: '' }; }
      }
      const err = new Error('endpoint desconocido: ' + method);
      err.code = 'bad-request';
      throw err;
    }

    // Handler HTTP que habla el envelope de `ctx.connection.rpc.call`.
    async function handler(req, res) {
      let rpcId = '';
      try {
        if (req.method !== 'POST') {
          res.setHeader('Allow', 'POST');
          return sendJson(res, 405, {
            type: 'server-response', rpcId,
            result: { ok: false, error: { code: 'method-not-allowed', message: 'usa POST', details: {} } },
          });
        }
        const body = await readJsonBody(req);
        rpcId = typeof body.rpcId === 'string' ? body.rpcId : '';
        let method = typeof body.method === 'string' ? body.method : '';
        if (!method) {
          const pathname = new URL(req.url || '/', 'http://localhost').pathname;
          method = pathname.replace(/^\/hermes\/?/, '');
        }
        const payload = (body.payload && typeof body.payload === 'object') ? body.payload : {};
        const value = await dispatch(method, payload);
        return sendJson(res, 200, { type: 'server-response', rpcId, result: { ok: true, value } });
      } catch (e) {
        return sendJson(res, 200, {
          type: 'server-response', rpcId,
          result: { ok: false, error: { code: (e && e.code) || 'internal', message: String((e && e.message) ? e.message : e), details: {} } },
        });
      }
    }

    // Sección de prompt de sistema (activo/pasivo). Opcional: se omite si el
    // host no ofrece el servicio systemPrompt.
    const sec = sp && typeof sp.section === 'function'
      ? sp.section({ name:'hermes:mode', order: 110, text: () => buildSection() }) : null;
    if (sec) ctx.on('dispose', () => { try { sec(); } catch (e) {} });

    // ── Montaje de la ruta /hermes con el transporte vigente ───────────────
    const mount = (webServer) => {
      if (!webServer || typeof webServer.register !== 'function') return null;
      const dispose = webServer.register({ kind: 'prefix', path: ROUTE_PATH, handler });
      ctx.on('dispose', () => { try { const d = dispose && dispose(); if (d && typeof d.then === 'function') d.catch(() => {}); } catch (e) {} });
      return dispose;
    };
    const direct = ctx.get('webServer');
    if (direct) mount(direct);
    else if (typeof ctx.inject === 'function') {
      ctx.inject(['webServer'], (webCtx) => { mount(webCtx.webServer); });
    }
  },
};
