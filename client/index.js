window.__ModuleLoader__.load({
  id: "hermes-to-dsh",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    const React = require("react");

    /** Id shared by the sidebar row and the main page it opens. */
    const PANEL_ID = "hermes";

    function injectCss(css) {
      try {
        let el = document.getElementById("hermes-to-dsh-style");
        if (!el) { el = document.createElement("style"); el.id = "hermes-to-dsh-style"; el.setAttribute("type", "text/css"); (document.head || document.documentElement).appendChild(el); }
        if (el.textContent !== css) el.textContent = css;
      } catch (e) {}
    }
    const styles = { insert: injectCss };

    // Native host RPC compat: host.call(method, args) -> /hermes channel route
    // (the host registers it with ctx.webServer.register).
    function makeHost(rpcCall) {
      return {
        call: async (method, args) => {
          const r = await rpcCall("/hermes", method, args || {});
          if (r && r.ok) return r.value;
          const msg = (r && r.error && r.error.message) ? r.error.message : ("RPC failed: " + method);
          const err = new Error(msg); err.rpc = r; throw err;
        },
      };
    }

    /** Decorative sidebar glyph: the host's folder-open outline artwork at the size asked for. */
    function HermesPanelIcon(props) {
      const size = (props && props.size) || 16;
      return React.createElement("svg", {
        width: size, height: size, viewBox: "0 0 16 16", fill: "none",
        xmlns: "http://www.w3.org/2000/svg", "aria-hidden": "true", strokeWidth: 1,
      },
        React.createElement("path", {
          d: "M12.3994 13.5986H2.04956C1.49728 13.5986 1.04956 13.1509 1.04956 12.5986V3.40137C1.04956 2.84908 1.49728 2.40137 2.04956 2.40137H4.76632C5.01016 2.40137 5.24561 2.49046 5.42836 2.6519L6.94088 3.98799C7.12364 4.14943 7.35908 4.23852 7.60293 4.23852H12.3994C12.9517 4.23852 13.3994 4.68624 13.3994 5.23852V7.16991",
          stroke: "currentColor",
        }),
        React.createElement("path", {
          d: "M2.55911 7.93683C2.67584 7.49906 3.07229 7.19446 3.52536 7.19446H13.6491C14.3061 7.19446 14.7846 7.81725 14.6153 8.45209L13.4411 12.856C13.3244 13.2938 12.9279 13.5984 12.4748 13.5984H2.35113C1.69411 13.5984 1.21562 12.9756 1.38489 12.3407L2.55911 7.93683Z",
          stroke: "currentColor",
        }));
    }

    function apply(ctx) {
      const conn = ctx.get && ctx.get("connection");
      const host = makeHost(async (channel, endpoint, payload) => {
        if (conn && conn.rpc && typeof conn.rpc.call === "function") return conn.rpc.call(channel, endpoint, payload);
        throw new Error("connection service unavailable");
      });

      const slots = ctx.get("slots");
      if (slots === undefined) return;

      const state = {
        loading: false, error: null, data: null, loaded: false,
        groupOpen: {}, chatOpen: {}, skillOpen: null, mcpOpen: null,
        chatPreview: {}, detailCache: {}, mcpDetailCache: {},
        selectedSkill: new Set(), selectedMCP: new Set(),
        active: false, copiedKey: null,
        search: "", sourceFilter: new Set(), roleFilter: new Set(), // vacío = todos
        openN: 2, latestM: 3,
      };
      const listeners = new Set();
      function notify() { listeners.forEach(function (fn) { fn(); }); }
      function subscribe(fn) { listeners.add(fn); return function () { listeners.delete(fn); }; }
      var forceRender;

      async function load() {
        state.loading = true; state.error = null; notify();
        try {
          const res = await host.call("inspect", {});
          state.data = (res && res.detected) ? res.detected : (res || {});
          state.loaded = true;
          const srcs = {};
          (res && res.detected && res.detected.chats || []).forEach(function (c) { if (c.source) srcs[c.source] = true; });
          if (!state.sourceFilter.size) { Object.keys(srcs).forEach(function (k) { state.sourceFilter.add(k); }); }
        } catch (e) {
          state.error = String((e && e.message) ? e.message : e);
          state.data = state.data || {};
        } finally { state.loading = false; notify(); }
      }
      async function readSkillDetail(id) {
        try { const res = await host.call("detail", { kind: "skill", id: id }); return res && res.content ? res.content : "(sin contenido)"; }
        catch (e) { return "error de lectura: " + String((e && e.message) ? e.message : e); }
      }
      async function readMcpDetail(name) {
        try { const res = await host.call("mcpDetail", { id: name }); return res && res.detail ? res.detail : "(sin detalle)"; }
        catch (e) { return "error de lectura: " + String((e && e.message) ? e.message : e); }
      }
      function copyStr(p, k) {
        try {
          if (navigator && navigator.clipboard) navigator.clipboard.writeText(p).catch(function () {});
        } catch (e) {}
        state.copiedKey = k; notify();
      }
      function collectRoles() {
        if (!state.roleFilter.size) return [];
        const arr = [];
        ["user", "assistant", "tool"].forEach(function (r) { if (state.roleFilter.has(r)) arr.push(r); });
        return arr;
      }
      async function toggleChat(id, key) {
        const was = !!state.chatOpen[id];
        state.chatOpen[id] = !was;
        if (!was) {
          state.chatPreview[id] = null; notify();
          try { const r = await host.call("chatPreview", { id: id, openN: state.openN, latestM: state.latestM, roles: collectRoles() }); state.chatPreview[id] = (r || {}); }
          catch (e) { state.chatPreview[id] = null; }
        }
        notify();
      }
      function collectSelected() {
        const sks = []; state.selectedSkill.forEach(function (n) { sks.push(n); });
        const mcs = []; state.selectedMCP.forEach(function (n) { mcs.push(n); });
        return { sks: sks, mcs: mcs };
      }
      function applyActive() {
        const sel = collectSelected();
        const useActive = (sel.sks.length || sel.mcs.length) ? true : false;
        host.call("setMode", { active: useActive, skills: sel.sks, mcp: sel.mcs }).catch(function () {});
        state.active = useActive; notify();
      }
      function toggleMode() {
        const sel = collectSelected();
        const next = !state.active;
        host.call("setMode", { active: next, skills: next ? sel.sks : [], mcp: next ? sel.mcs : [] }).catch(function () {});
        state.active = next; notify();
      }
      function toggleSet(set, k) { if (set.has(k)) set.delete(k); else set.add(k); notify(); }
      function roleOn(r) { return state.roleFilter.size === 0 || state.roleFilter.has(r); }
      function compSrcMap() {
        const m = {};
        (state.data ? state.data.chats || [] : []).forEach(function (c) { if (!m[c.source]) m[c.source] = 0; m[c.source]++; });
        return m;
      }
      function roleLbl(r) { if (r === "user") return "usuario"; if (r === "assistant") return "asistente"; if (r === "tool") return "herramienta"; return "·"; }
      function shortId(id) { return id && id.length > 14 ? id.slice(0, 14) + "…" : (id || ""); }

      const h = React.createElement;

      /** Disclosure chevron matching the host's row glyphs; rotates when open. */
      function Chevron(open) {
        return h("svg", {
          width: 16, height: 16, viewBox: "0 0 16 16", fill: "none",
          xmlns: "http://www.w3.org/2000/svg", "aria-hidden": "true",
          strokeWidth: 1, className: open ? "h-chev h-chevOpen" : "h-chev",
        },
          h("path", { d: "M6 3.5L10.5 8L6 12.5", stroke: "currentColor" }));
      }

      function chatRow(c, key) {
        const id = c.id;
        const copied = state.copiedKey === key;
        const open = !!state.chatOpen[id];
        const head = h("div", { key: key + "-head", className: "h-row" },
          h("button", {
            type: "button", className: "h-rowMain", "aria-expanded": open, onClick: function () { toggleChat(id, key); },
          },
            h("span", { className: "h-rowGlyph" }, Chevron(open)),
            h("span", { className: "h-rowContent" },
              h("span", { className: "h-rowTitle" }, c.name || "(sin nombre)"),
              h("span", { className: "h-rowSummary" },
                h("span", { className: "h-meta" }, c.source || "-"),
                h("span", { className: "h-meta" }, shortId(id))))),
          h("span", { className: "h-rowEnd" },
            h("button", {
              type: "button", className: "h-iconBtn", title: "copiar id",
              onClick: function () { copyStr(id, key); },
            }, copied ? "copiado" : "id")));
        const nodes = [head];
        if (open) {
          const pv = state.chatPreview[id];
          if (pv === null || pv === undefined) nodes.push(h("p", { key: key + "-loading", className: "h-note" }, "cargando…"));
          else {
            const op = (pv.opening || []).filter(function (m) { return roleOn(m.role); });
            const lt = (pv.latest || []).filter(function (m) { return roleOn(m.role); });
            if (op.length) { nodes.push(h("p", { key: key + "-ol", className: "h-grp" }, "inicio")); op.forEach(function (m, mi) { nodes.push(h("p", { key: key + "-o" + mi, className: "h-pv" }, h("span", { className: "h-pvRole" }, roleLbl(m.role)), m.text || "")); }); }
            if (lt.length) { nodes.push(h("p", { key: key + "-ll", className: "h-grp" }, "recientes")); lt.forEach(function (m, mi) { nodes.push(h("p", { key: key + "-l" + mi, className: "h-pv" }, h("span", { className: "h-pvRole" }, roleLbl(m.role)), m.text || "")); }); }
            if (!op.length && !lt.length) nodes.push(h("p", { key: key + "-empty", className: "h-note" }, "(no hay mensajes que mostrar tras el filtro)"));
          }
        }
        return h("div", { key: key + "-wrap", className: "h-chatWrap" }, nodes);
      }

      function HermesPage() {
        const [, force] = React.useReducer(function (x) { return x + 1; }, 0);
        forceRender = force;
        React.useEffect(function () { return subscribe(force); }, []);
        React.useEffect(function () { if (!state.loaded && !state.loading) load(); }, []);

        const d = state.data || {};
        const projects = d.projects || [], repos = d.repos || [];
        let chats = (d.chats || []).slice();
        let skills = (d.skills || []).slice();
        let mcp = (d.mcp || []).slice();
        if (state.search) {
          const q = state.search.toLowerCase();
          chats = chats.filter(function (c) { return (c.name || "").toLowerCase().indexOf(q) >= 0 || (c.id || "").toLowerCase().indexOf(q) >= 0; });
          skills = skills.filter(function (s) { return (s.name || "").toLowerCase().indexOf(q) >= 0 || (s.description || "").toLowerCase().indexOf(q) >= 0; });
          mcp = mcp.filter(function (m) { return (m.name || "").toLowerCase().indexOf(q) >= 0; });
        }
        chats = chats.filter(function (c) { return state.sourceFilter.has(c.source); });
        const srcCount = compSrcMap();

        const head = h("header", { className: "h-pageHead" },
          h("div", { className: "h-headBlock" },
            h("h1", { className: "h-pageTitle" }, "Activos de Hermes"),
            h("p", { className: "h-pageIntro" },
              String(skills.length) + " habilidades · " + String(mcp.length) + " MCP · " + String(chats.length) + " conversaciones")),
          h("div", { className: "h-toolbar" },
            h("button", {
              type: "button", className: "h-modeBtn", title: "Modo de inyección de habilidades/MCP",
              onClick: toggleMode,
            }, state.active ? "Activo" : "Pasivo"),
            h("button", { type: "button", className: "h-iconBtn", title: "Volver a analizar", onClick: function () { load(); } }, "actualizar")));

        const notices = [];
        if (state.error) notices.push(h("p", { key: "err", className: "h-failure" }, "error: " + state.error));
        else if (state.loading) notices.push(h("p", { key: "load", className: "h-note" }, "escaneando…"));
        if (state.active) notices.push(h("p", { key: "mode", className: "h-notice" },
          "Modo activo: habilidades " + String(state.selectedSkill.size) + " / MCP " + String(state.selectedMCP.size) +
          ". El texto completo se inyecta en el prompt; marcar demasiados elementos puede alargarlo en exceso."));

        const searchField = h("div", { className: "h-searchField" },
          h("input", {
            className: "h-search", type: "search", placeholder: "Buscar conversación / habilidad / MCP…",
            value: state.search, onChange: function (e) { state.search = e.target.value; notify(); },
          }));

        function numInput(value, onSet) {
          return h("input", {
            className: "h-num", type: "number", min: 0, value: value,
            onChange: function (e) { onSet(Math.max(0, parseInt(e.target.value, 10) || 0)); },
          });
        }
        const countsField = h("div", { className: "h-counts" },
          h("span", { className: "h-countsLbl" }, "inicio"),
          numInput(state.openN, function (n) { state.openN = n; notify(); }),
          h("span", { className: "h-countsLbl" }, "recientes"),
          numInput(state.latestM, function (n) { state.latestM = n; notify(); }),
          h("span", { className: "h-countsTip" }, "mensajes por lado en la vista previa"));

        const chips = [];
        Object.keys(srcCount).forEach(function (k) {
          const on = state.sourceFilter.has(k);
          chips.push(h("button", {
            key: "s" + k, type: "button", className: on ? "h-chip h-chipOn" : "h-chip",
            onClick: function () { toggleSet(state.sourceFilter, k); },
          }, k + " (" + String(srcCount[k]) + ")"));
        });
        ["user", "assistant", "tool"].forEach(function (r) {
          const lbl = r === "user" ? "pregunta" : (r === "assistant" ? "respuesta" : "herramienta");
          const on = roleOn(r);
          chips.push(h("button", {
            key: "r" + r, type: "button", className: on && state.roleFilter.size ? "h-chip h-chipOn" : "h-chip",
            onClick: function () { toggleSet(state.roleFilter, r); },
          }, lbl));
        });

        function group(title, count, rows, emptyText) {
          const kids = [h("div", { key: "gh", className: "h-groupHead" },
            h("h2", { className: "h-groupTitle" }, title),
            h("span", { className: "h-count" }, String(count)))];
          if (rows.length) kids.push(h("ul", { key: "rows", className: "h-rows" }, rows));
          else kids.push(h("p", { key: "empty", className: "h-empty" }, emptyText));
          return h("section", { key: "g-" + title, className: "h-group" }, kids);
        }

        // Proyectos y repositorios · con conversaciones
        const groupRows = [];
        const groupsList = [];
        projects.forEach(function (p) {
          const cs = chats.filter(function (c2) { return c2.repo && p.primary_path && c2.repo === p.primary_path; });
          if (cs.length) groupsList.push({ title: p.name, chats: cs });
        });
        repos.forEach(function (r) {
          const cs = chats.filter(function (c2) { return c2.repo && r.root && c2.repo === r.root; });
          if (cs.length) groupsList.push({ title: r.label, chats: cs });
        });
        const none = chats.filter(function (c2) { return !c2.repo; });
        if (none.length) groupsList.push({ title: "(conversaciones sin asignar)", chats: none });
        groupsList.forEach(function (g, gi) {
          const gkey = "g" + gi;
          const gopen = !!state.groupOpen[gkey];
          groupRows.push(h("li", { key: gkey, className: "h-repoWrap" },
            h("button", {
              type: "button", className: "h-row", onClick: function () { state.groupOpen[gkey] = !gopen; notify(); },
            },
              h("span", { className: "h-rowGlyph" }, Chevron(gopen)),
              h("span", { className: "h-rowContent" }, h("span", { className: "h-rowTitle" }, g.title)),
              h("span", { className: "h-rowEnd" }, h("span", { className: "h-meta" }, "conv. " + String(g.chats.length))))));
          if (gopen) g.chats.slice(0, 40).forEach(function (c, ci) { groupRows.push(h("li", { key: gkey + "-" + ci, className: "h-nested" }, chatRow(c, gkey + "-" + ci))); });
        });

        // Habilidades
        const skillRows = skills.slice(0, 60).map(function (s, i) {
          const checked = state.selectedSkill.has(s.name);
          const sexp = state.skillOpen === s.name;
          const kids = [
            h("div", { key: "hd", className: "h-cardHead" },
              h("input", {
                key: "cb", className: "h-cb", type: "checkbox", disabled: !state.active, checked: checked,
                onChange: function () { if (checked) state.selectedSkill.delete(s.name); else state.selectedSkill.add(s.name); applyActive(); },
              }),
              h("span", { key: "tx", className: "h-cardMain" },
                h("span", { className: "h-rowTitle" }, s.name),
                h("span", { className: "h-rowSummary" }, s.description || "(sin descripción)")),
              h("button", {
                key: "bt", type: "button", className: "h-linkBtn",
                onClick: function () {
                  state.skillOpen = sexp ? null : s.name;
                  if (!sexp) readSkillDetail(s.name).then(function (c) { state.detailCache[s.name] = c; notify(); });
                  notify();
                },
              }, sexp ? "ocultar" : "detalle")),
          ];
          if (sexp) kids.push(h("pre", { key: "pre", className: "h-pre" }, (state.detailCache[s.name] || "").slice(0, 2500)));
          return h("li", { key: "sk" + i, className: "h-card" }, kids);
        });

        // Servidores MCP
        const mcpRows = mcp.map(function (m, i) {
          const ck = state.selectedMCP.has(m.name);
          const mexp = state.mcpOpen === m.name;
          const kids = [
            h("div", { key: "hd", className: "h-cardHead" },
              h("input", {
                key: "cb", className: "h-cb", type: "checkbox", disabled: !state.active, checked: ck,
                onChange: function () { if (ck) state.selectedMCP.delete(m.name); else state.selectedMCP.add(m.name); applyActive(); },
              }),
              h("span", { key: "tx", className: "h-cardMain" }, h("span", { className: "h-rowTitle" }, m.name),
                h("span", { className: "h-rowSummary" }, "marcar para inyectar su configuración")),
              h("button", {
                key: "bt", type: "button", className: "h-linkBtn",
                onClick: function () {
                  state.mcpOpen = mexp ? null : m.name;
                  if (!mexp) readMcpDetail(m.name).then(function (c) { state.mcpDetailCache[m.name] = c; notify(); });
                  notify();
                },
              }, mexp ? "ocultar" : "detalle")),
          ];
          if (mexp) kids.push(h("pre", { key: "pre", className: "h-pre" }, state.mcpDetailCache[m.name] || "cargando…"));
          return h("li", { key: "mc" + i, className: "h-card" }, kids);
        });

        return h("section", { className: "h-page", "aria-label": "Activos de Hermes" },
          h("div", { className: "h-pageScroll" },
            h("div", { className: "h-pageContent" },
              head,
              notices,
              searchField,
              countsField,
              chips.length ? h("div", { className: "h-chips" }, chips) : null,
              state.roleFilter.size ? h("p", { className: "h-countsTip h-countsTipBlock" },
                "Tras cambiar el tipo, vuelve a abrir la conversación: la vista previa se rellenará según el tipo elegido.") : null,
              group("Proyectos y repositorios", groupsList.length, groupRows, "(sin repositorios o proyectos con conversaciones)"),
              group("Habilidades", skills.length, skillRows, "(ninguna)"),
              group("Servidores MCP", mcp.length, mcpRows, "(ninguno)"))));
      }

      slots.inject("sidebar.panellist", function () {
        return slots.register({ name: "sidebar.panellist", id: PANEL_ID, order: 5, label: function () { return "Activos de Hermes"; } }, HermesPanelIcon);
      });
      slots.inject("main", function () {
        return slots.register({ name: "main", key: PANEL_ID }, HermesPage);
      });

      styles.insert(`
.h-page{box-sizing:border-box;height:100%;min-height:0;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);font-size:14px;line-height:1.6;display:flex;flex-direction:column;overflow:hidden}
.h-pageScroll{flex:1;min-height:0;overflow:auto;scrollbar-gutter:stable;--dsh-scrollbar-width:9px;--dsh-scrollbar-thumb-border:2px}
.h-pageContent{max-width:960px;margin:0 auto;padding:0 clamp(24px,4vw,48px) 48px;box-sizing:border-box}
.h-pageHead{justify-content:space-between;align-items:flex-start;gap:16px;padding-top:28px;margin-bottom:20px;display:flex}
[data-platform=darwin] .h-pageHead{padding-top:calc(28px + var(--dsh-frame-top-clearance,0px))}
.h-headBlock{min-width:0}
.h-pageTitle{margin:0;font-size:20px;font-weight:500;line-height:28px}
.h-pageIntro{color:var(--dsw-alias-label-secondary);margin:4px 0 0;font-size:13px;line-height:20px}
.h-toolbar{flex:none;align-items:center;gap:8px;display:flex}
.h-modeBtn{border-radius:var(--dsw-radius-md);height:32px;padding:0 12px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary);background:transparent;border:.5px solid var(--dsw-alias-border-l3);cursor:pointer;font-family:inherit}
.h-modeBtn:hover{background:var(--dsw-alias-interactive-bg-hover)}
.h-iconBtn{border-radius:var(--dsw-radius-sm);height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:0;padding:0 8px;font-size:13px;font-family:inherit;display:inline-flex;align-items:center}
.h-iconBtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.h-linkBtn{border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;background:0 0;border:0;align-items:center;padding:1px 6px;font-size:12px;line-height:20px;display:inline-flex;flex:none}
.h-linkBtn:hover{background:var(--dsw-alias-interactive-bg-hover)}
.h-note,.h-empty{color:var(--dsw-alias-label-tertiary);margin:0;font-size:13px;line-height:20px}
.h-failure{color:var(--dsw-alias-state-error-primary);margin:0 0 12px;font-size:13px;line-height:20px}
.h-notice{background:var(--dsw-specific-sidebar-fill);color:var(--dsw-alias-label-secondary);border-radius:10px;margin:0 0 16px;padding:12px 14px;font-size:12px;line-height:20px}
.h-searchField{border:.5px solid var(--dsw-alias-border-l3);height:36px;color:var(--dsw-alias-label-tertiary);border-radius:12px;align-items:center;margin:0 0 12px;padding:0 10px;transition:border-color .15s;display:flex}
.h-searchField:hover{border-color:var(--dsw-alias-border-l2)}
.h-searchField:focus-within{border-color:var(--dsw-alias-state-business-primary)}
.h-search{border:0;outline:0;background:0 0;color:var(--dsw-alias-label-primary);font:inherit;flex:1;min-width:0;height:100%;padding:0;font-size:14px}
.h-search::placeholder{color:var(--dsw-alias-label-caption)}
.h-search::-webkit-search-cancel-button{display:none}
.h-counts{flex-wrap:wrap;align-items:center;gap:6px;margin:0 0 12px;display:flex}
.h-countsLbl{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}
.h-countsTip{color:var(--dsw-alias-label-caption);font-size:12px;line-height:18px}
.h-countsTipBlock{display:block;margin:0 0 12px}
.h-num{box-sizing:border-box;width:56px;height:28px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l3);border-radius:8px;outline:0;padding:0 8px;font:inherit;font-size:13px;text-align:center;font-variant-numeric:tabular-nums}
.h-num:focus{border-color:var(--dsw-alias-state-business-primary)}
.h-chips{flex-wrap:wrap;align-items:center;gap:6px;margin-bottom:20px;display:flex}
.h-chip{height:28px;color:var(--dsw-alias-label-tertiary);font:inherit;white-space:nowrap;cursor:pointer;background:0 0;border:0;border-radius:14px;flex:none;align-items:center;padding:0 10px;font-size:13px;line-height:22px;display:inline-flex}
.h-chip:hover{background:var(--dsw-alias-interactive-bg-hover)}
.h-chipOn{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.h-group{flex-direction:column;gap:8px;margin-bottom:28px;display:flex}
.h-groupHead{align-items:baseline;gap:8px;display:flex}
.h-groupTitle{margin:0;font-size:14px;font-weight:500;line-height:22px}
.h-count{color:var(--dsw-alias-label-caption);font-variant-numeric:tabular-nums;font-size:14px}
.h-rows{flex-direction:column;gap:2px;margin:0;padding:0;list-style:none;display:flex}
.h-repoWrap,.h-chatWrap{display:block}
.h-nested{padding-left:18px}
.h-row{text-align:left;white-space:normal;border-radius:12px;justify-content:flex-start;align-items:flex-start;gap:12px;width:100%;height:auto;padding:8px;display:flex;color:inherit;background:0 0;border:0;font:inherit;cursor:pointer;box-sizing:border-box}
.h-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.h-rowMain{text-align:left;white-space:normal;background:0 0;border:0;font:inherit;color:inherit;cursor:pointer;flex:1;min-width:0;padding:0;margin:0;display:flex;justify-content:flex-start;align-items:flex-start;gap:12px;box-sizing:border-box}
.h-rowMain:hover{background:0 0}
.h-rowGlyph{width:16px;height:20px;color:var(--dsw-alias-label-tertiary);flex:none;display:inline-flex;align-items:center;justify-content:center}
.h-chev{flex:none;transition:transform .15s}
.h-chevOpen{transform:rotate(90deg)}
@media (prefers-reduced-motion:reduce){.h-chev{transition:none}}
.h-pvRole{color:var(--dsw-alias-label-caption);margin-right:6px;font-size:11px;text-transform:uppercase;letter-spacing:.02em}
.h-rowContent{flex-direction:column;flex:1;min-width:0;display:flex}
.h-rowTitle{text-overflow:ellipsis;white-space:nowrap;font-weight:500;line-height:23px;overflow:hidden}
.h-rowSummary{color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere;margin-top:2px;font-size:13px;line-height:21px;display:block}
.h-rowEnd{flex:none;align-items:center;gap:8px;display:inline-flex}
.h-meta{color:inherit;overflow-wrap:anywhere;font-size:13px;line-height:21px}
.h-meta+.h-meta:before{content:" · ";padding:0 2px}
.h-card{border-radius:var(--dsw-radius-xl);margin:0;padding:0}
.h-cardHead{align-items:flex-start;gap:14px;padding:8px;display:flex}
.h-cardMain{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}
.h-cb{flex:none;margin:2px 0 0;accent-color:var(--dsw-alias-state-business-primary)}
.h-pre{background:var(--dsw-alias-bg-layer-1);border-radius:8px;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;overflow-wrap:anywhere;margin:0 8px 10px;padding:10px 12px;font-size:12px;line-height:18px;max-height:280px;overflow:auto;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.h-grp{color:var(--dsw-alias-label-tertiary);margin:6px 0 2px;font-size:12px;line-height:18px}
.h-pv{color:var(--dsw-alias-label-secondary);white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 4px;font-size:12px;line-height:18px}
.h-nested .h-grp,.h-nested .h-pv,.h-nested .h-note{padding-left:28px}
.h-page :focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
`);

    }
    exports.apply = apply;
    return module.exports;
  }
});
