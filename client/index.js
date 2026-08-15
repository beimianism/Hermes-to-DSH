window.__ModuleLoader__.load({
  id: "hermes-to-dsh",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    const React = require("react");
    const { useEffect, useReducer } = React;

    function injectCss(css) {
      try {
        let el = document.getElementById("hermes-to-dsh-style");
        if (!el) { el = document.createElement("style"); el.id = "hermes-to-dsh-style"; el.setAttribute("type", "text/css"); (document.head || document.documentElement).appendChild(el); }
        if (el.textContent !== css) el.textContent = css;
      } catch (e) {}
    }
    const styles = { insert: injectCss };

    // Native host RPC compat: host.call(method, args) -> /hermes channel route
    // (host registers it via connection.rpc.handle with a physical route).
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

    function apply(ctx) {
      const conn = ctx.get && ctx.get("connection");
      const host = makeHost(async (channel, endpoint, payload) => {
        if (conn && conn.rpc && typeof conn.rpc.call === "function") return conn.rpc.call(channel, endpoint, payload);
        throw new Error("connection service unavailable");
      });
      
    const slots = ctx.get('slots');
    if (slots === undefined) return;
    const state = {
      open:false, loading:false, error:null, data:null,
      groupOpen:{}, chatOpen:{}, skillOpen:null, mcpOpen:null,
      chatPreview:{}, detailCache:{}, mcpDetailCache:{},
      collapsedSection:{}, selectedSkill:new Set(), selectedMCP:new Set(),
      active:false, copiedKey:null,
      search:'', sourceFilter:new Set(), roleFilter:new Set(), // 空=全部
      openN:2, latestM:3,
      pos:{left:14, top:null, width:780, height:660}, drag:null, resizeDir:null
    };
    const listeners = new Set();
    function notify(){ listeners.forEach(function(fn){ fn(); }); }
    function subscribe(fn){ listeners.add(fn); return function(){ listeners.delete(fn); }; }
    async function load(){ state.loading=true; state.error=null; notify(); try{ const res=await host.call('inspect',{}); state.data=(res&&res.detected)?res.detected:(res||{}); const srcs={}; (res&&res.detected.chats||[]).forEach(function(c){ if(c.source) srcs[c.source]=true; }); if(!state.sourceFilter.size){ Object.keys(srcs).forEach(function(k){ state.sourceFilter.add(k); }); } }catch(e){ state.error=String((e&&e.message)?e.message:e); state.data=state.data||{}; } finally{ state.loading=false; notify(); } }
    async function readSkillDetail(id){ try{ const res=await host.call('detail',{kind:'skill',id:id}); return res&&res.content?res.content:'（无内容）'; }catch(e){ return '读取失败:'+String((e&&e.message)?e.message:e); } }
    async function readMcpDetail(name){ try{ const res=await host.call('mcpDetail',{id:name}); return res&&res.detail?res.detail:'（无详情）'; }catch(e){ return '读取失败:'+String((e&&e.message)?e.message:e); } }
    function toggleSection(k){ state.collapsedSection[k]=!(state.collapsedSection[k]===true); forceRender(); }
    var forceRender;
    function copyStr(p,k){ try{ if(typeof copyText==='function'){ copyText(p); } else if(navigator&&navigator.clipboard){ navigator.clipboard.writeText(p).catch(function(){}); } }catch(e){} state.copiedKey=k; forceRender(); }
    function collectRoles(){ if(!state.roleFilter.size) return []; const arr=[]; ['user','assistant','tool'].forEach(function(r){ if(state.roleFilter.has(r)) arr.push(r); }); return arr; }
    async function toggleChat(id,key){ const was=!!state.chatOpen[id]; state.chatOpen[id]=!was; if(!was){ state.chatPreview[id]=null; forceRender(); try{ const r=await host.call('chatPreview',{id:id,openN:state.openN,latestM:state.latestM,roles:collectRoles()}); state.chatPreview[id]=(r||{}); }catch(e){ state.chatPreview[id]=null; } } forceRender(); }
    function collectSelected(){ const sks=[]; state.selectedSkill.forEach(function(n){ sks.push(n); }); const mcs=[]; state.selectedMCP.forEach(function(n){ mcs.push(n); }); return {sks:sks, mcs:mcs}; }
    function applyActive(){ const sel=collectSelected(); const useActive=(sel.sks.length||sel.mcs.length)?true:false; host.call('setMode',{active:useActive,skills:sel.sks,mcp:sel.mcs}).catch(function(){}); state.active=useActive; forceRender(); }
    function toggleMode(){ const sel=collectSelected(); const next=!state.active; host.call('setMode',{active:next,skills:next?sel.sks:[],mcp:next?sel.mcs:[]}).catch(function(){}); state.active=next; forceRender(); }
    function toggleSrc(k){ if(state.sourceFilter.has(k)){ state.sourceFilter.delete(k); } else { state.sourceFilter.add(k); } forceRender(); }
    function roleOn(r){ return state.roleFilter.size===0 || state.roleFilter.has(r); }
    function toggleRole(r){ if(state.roleFilter.has(r)){ state.roleFilter.delete(r); } else { state.roleFilter.add(r); } forceRender(); }
    function srcList(){ return Object.keys(state.data?state.data.chats||{}:{}); }
    function compSrcMap(){ const m={}; (state.data?state.data.chats||[]:[]).forEach(function(c){ if(!m[c.source]) m[c.source]=0; m[c.source]++; }); return m; }
    // drag/resize
    function startDrag(e){ e.preventDefault(); const sx=e.clientX, sy=e.clientY, px=state.pos.left, pt=state.pos.top; function mv(ev){ state.pos.left=px+(ev.clientX-sx); if(state.pos.top===null){ state.pos.top=(window.innerHeight?window.innerHeight/1.5:480); } state.pos.top=pt+(ev.clientY-sy); if(state.pos.left<0)state.pos.left=0; if(state.pos.top<0)state.pos.top=0; forceRender(); } function up(){ window.removeEventListener('mousemove',mv); window.removeEventListener('mouseup',up); } window.addEventListener('mousemove',mv); window.addEventListener('mouseup',up); }
    function startResize(dir,e){ e.preventDefault(); e.stopPropagation(); const sx=e.clientX, sy=e.clientY, sw=state.pos.width, sh=state.pos.height; function mv(ev){ const dx=ev.clientX-sx, dy=ev.clientY-sy; if(dir.indexOf('E')>=0) state.pos.width=Math.max(360,sw+dx); if(dir.indexOf('S')>=0) state.pos.height=Math.max(320,sh+dy); if(dir.indexOf('N')>=0){ state.pos.height=Math.max(320,sh-dy); } if(dir.indexOf('W')>=0){ state.pos.left=Math.max(0,(state.pos.left||14)-dx); } forceRender(); } function up(){ window.removeEventListener('mousemove',mv); window.removeEventListener('mouseup',up); } window.addEventListener('mousemove',mv); window.addEventListener('mouseup',up); }
    function Sec(p){ return React.createElement('div',{className:'h-sec',onClick:function(){p.onT();}}, React.createElement('span',{className:'h-sec-arrow'},p.open?'▾':'▸'), React.createElement('span',{className:'h-sec-label'},p.label)); }
    function repoHead(title,key,open,onHead,count){ return React.createElement('div',{key:key,className:'h-repo4'}, React.createElement('div',{className:'h-r4-ch',onClick:onHead}, React.createElement('span',{className:'h-sec-arrow'},open?'▾':'▸')), React.createElement('div',{className:'h-r4-name',onClick:onHead},title), React.createElement('div',{className:'h-r4-num'},'对话'+count)); }
    function roleLbl(r){ if(r==='user') return '🧑'; if(r==='assistant') return '🤖'; if(r==='tool') return '🔧'; return '·'; }
    function shortId(id){ return id&&id.length>14 ? id.slice(0,14)+'…' : (id||''); }
    function msgBlock(msg,key){ return React.createElement('div',{key:key,className:'h-pv'},React.createElement('span',{className:'h-pv-role'},roleLbl(msg.role)),React.createElement('div',{className:'h-pv-text'},msg.text||'')); }
    function grpLabel(key,label,msgs,pfx){ const nodes=[React.createElement('div',{key:key+'-label',className:'h-grp'},label)]; (msgs||[]).forEach(function(msg,mi){ nodes.push(msgBlock(msg,key+'-'+pfx+mi)); }); return nodes; }
    function chatRow(c,key){ const id=c.id; const copied=state.copiedKey===key; const open=!!state.chatOpen[id]; const head=React.createElement('div',{key:key+'-head',className:'h-c4',onClick:function(){ toggleChat(id,key); }}, React.createElement('span',{className:'h-c4-edge'},open?'▾':'▸'), React.createElement('div',{className:'h-c4-col nm'},c.name||'(unnamed)'), React.createElement('div',{className:'h-c4-col'},c.source||'-'), React.createElement('div',{className:'h-c4-col id'},shortId(id)), React.createElement('button',{type:'button',className:'h-btn',onClick:function(e){e.stopPropagation();copyStr(id,key);}},copied?'已复制':'复制地址')); const nodes=[head]; if(open){ const pv=state.chatPreview[id]; if(pv===null||pv===undefined){ nodes.push(React.createElement('div',{key:key+'-loading',className:'h-pv'},'加载…')); } else { const op=(pv.opening||[]).filter(function(m){return roleOn(m.role);}); const lt=(pv.latest||[]).filter(function(m){return roleOn(m.role);}); if(op.length){ grpLabel(key+'-o','▶ 开场',op,'o').forEach(function(n){ nodes.push(n); }); } if(lt.length){ grpLabel(key+'-l','▶ 最新',lt,'l').forEach(function(n){ nodes.push(n); }); } if(!op.length&&!lt.length){ nodes.push(React.createElement('div',{key:key+'-empty',className:'h-pv'},'（按类型筛选后无可显示消息）')); } } } return nodes;}
    function item(title,sub,key){ return React.createElement('div',{key:key,className:'h-item'},React.createElement('div',{className:'h-item-title'},title),sub?React.createElement('div',{className:'h-item-sub'},sub):null); }
    slots.inject('sidebar.footer.action', function(){
      return slots.register({ name:'sidebar.footer.action', id:'hermes-panel', order:200, label:function(){ return 'Hermes 资产'; } }, function(){
        const [,force]=React.useReducer(function(x){return x+1;},0); forceRender=force;
        React.useEffect(function(){ return subscribe(force); },[]);
        function toggle(e){ if(e)e.stopPropagation(); if(!state.data&&!state.loading) load(); state.open=!state.open; notify(); }
        const d=state.data||{}; const projects=d.projects||[], repos=d.repos||[];
        let chats=(d.chats||[]).slice(); let skills=(d.skills||[]).slice(); let mcp=(d.mcp||[]).slice();
        if(state.search){ const q=state.search.toLowerCase(); chats=chats.filter(function(c){ return (c.name||'').toLowerCase().indexOf(q)>=0 || (c.id||'').toLowerCase().indexOf(q)>=0; }); skills=skills.filter(function(s){ return (s.name||'').toLowerCase().indexOf(q)>=0 || (s.description||'').toLowerCase().indexOf(q)>=0; }); mcp=mcp.filter(function(m){ return (m.name||'').toLowerCase().indexOf(q)>=0; }); }
        chats=chats.filter(function(c){ return state.sourceFilter.has(c.source); });
        const srcCount=compSrcMap();
        const header=React.createElement('header',{className:'h-head',onMouseDown:startDrag},
          React.createElement('span',{className:'h-drag'},'⋮⋮'),
          React.createElement('span',{className:'h-title'},'📁 Hermes 资产'),
          React.createElement('div',{className:'h-acts'},
            React.createElement('button',{type:'button',className:'h-tog',onClick:function(e){e.stopPropagation();toggleMode();}}, state.active?'主动':'被动'),
            React.createElement('button',{type:'button',onClick:function(e){e.stopPropagation();load();}},'🔄'),
            React.createElement('button',{type:'button',onClick:function(e){e.stopPropagation();state.open=false;notify();}},'✕')));
        function modeBanner(){ return React.createElement('div',{className:'h-mode'}, state.active?('模式：主动（技能'+state.selectedSkill.size+'/MCP'+state.selectedMCP.size+'）⚠️ 可能使提示词过长'):'模式：被动（缺工具时按需读取 Hermes 技能）'); }
        // settings row
        const settRow=React.createElement('div',{className:'h-sett',onMouseDown:function(e){e.stopPropagation();}},
          React.createElement('span',{className:'h-sett-lbl'},'开场'),
          React.createElement('input',{className:'h-num',type:'number',min:0,value:state.openN,onChange:function(e){ state.openN=Math.max(0,parseInt(e.target.value)||0); forceRender(); }}),
          React.createElement('span',{className:'h-sett-lbl'},'最新'),
          React.createElement('input',{className:'h-num',type:'number',min:0,value:state.latestM,onChange:function(e){ state.latestM=Math.max(0,parseInt(e.target.value)||0); forceRender(); }}),
          React.createElement('span',{className:'h-sett-lbl'},'来源:'),
          Object.keys(srcCount).map(function(k){ const on=state.sourceFilter.has(k); return React.createElement('label',{key:k,className:'h-src'},React.createElement('input',{type:'checkbox',checked:on,onChange:function(){ toggleSrc(k); }}),k+'('+srcCount[k]+')'); }));
        const roleRow=React.createElement('div',{className:'h-sett',onMouseDown:function(e){e.stopPropagation();}},
          React.createElement('span',{className:'h-sett-lbl'},'类型:'),
          React.createElement('label',{className:'h-src'},React.createElement('input',{type:'checkbox',checked:roleOn('user'),onChange:function(){ toggleRole('user'); }}),'🧑提问'),
          React.createElement('label',{className:'h-src'},React.createElement('input',{type:'checkbox',checked:roleOn('assistant'),onChange:function(){ toggleRole('assistant'); }}),'🤖回答'),
          React.createElement('label',{className:'h-src'},React.createElement('input',{type:'checkbox',checked:roleOn('tool'),onChange:function(){ toggleRole('tool'); }}),'🔧工具'),
          state.roleFilter.size?React.createElement('span',{className:'h-sett-tip'},'💡 选择后，重新点开对话即按所选类型自动补齐'):null);
        const searchRow=React.createElement('input',{className:'h-search',placeholder:'🔍 搜索对话/技能/MCP…',value:state.search,onChange:function(e){ state.search=e.target.value; forceRender(); }});
        const styleBase={left:(state.pos.left||14)+'px', width:(state.pos.width||780)+'px'}; if(state.pos.top!==null) styleBase.top=state.pos.top+'px'; else styleBase.bottom='160px'; if(state.pos.height) styleBase.height=state.pos.height+'px';
        let panel=null;
        if(state.open){
          const left=[]; const right=[];
          if(state.error) left.push(React.createElement('p',{key:'e',className:'h-note err'},'错误：'+state.error));
          if(state.loading) left.push(React.createElement('p',{key:'b',className:'h-note'},'扫描中…'));
          left.push(settRow); left.push(roleRow); left.push(searchRow);
          left.push(React.createElement(Sec,{key:'pr',label:'📁 项目与仓库 · 含对话',open:!state.collapsedSection['pr'],onT:function(){toggleSection('pr');}}));
          if(!state.collapsedSection['pr']){
            const groups=[];
            projects.forEach(function(p){ const cs=chats.filter(function(c2){return c2.repo&&p.primary_path&&c2.repo===p.primary_path;}); if(cs.length) groups.push({title:p.name,chats:cs}); });
            repos.forEach(function(r){ const cs=chats.filter(function(c2){return c2.repo&&r.root&&c2.repo===r.root;}); if(cs.length) groups.push({title:r.label,chats:cs}); });
            const none=chats.filter(function(c2){return !c2.repo;});
            if(none.length) groups.push({title:'（未归属会话）',chats:none});
            groups.forEach(function(g,gi){
              const gkey='g'+gi;
              const gopen=!!state.groupOpen[gkey];
              left.push(repoHead(g.title,gkey,gopen,function(){ state.groupOpen[gkey]=!gopen; forceRender(); },g.chats.length));
              if(gopen){ g.chats.slice(0,40).forEach(function(c,ci){ var rows=chatRow(c,'c'+gi+'-'+ci); for(var q=0;q<rows.length;q++){ left.push(rows[q]); } }); }
            });
            if(!groups.length) left.push(React.createElement('p',{key:'pr0',className:'h-note'},'（无含对话的仓库/项目，或无匹配）'));
          }
          right.push(modeBanner());
          right.push(React.createElement(Sec,{key:'sk',label:'🛠 技能（'+skills.length+'）',open:!state.collapsedSection['sk'],onT:function(){toggleSection('sk');}}));
          if(!state.collapsedSection['sk']){
            skills.slice(0,50).forEach(function(s,i){
              const checked=state.selectedSkill.has(s.name); const sexp=state.skillOpen===s.name;
              right.push(React.createElement('div',{key:'sk'+i,className:'h-item'},
                React.createElement('div',{className:'h-item-row'},
                  React.createElement('input',{type:'checkbox',disabled:!state.active,checked:checked,onChange:function(){ if(checked)state.selectedSkill.delete(s.name);else state.selectedSkill.add(s.name); applyActive(); }}),
                  React.createElement('div',{className:'h-item-title'},s.name),
                  React.createElement('button',{type:'button',className:'h-btn',onClick:function(){ state.skillOpen=sexp?null:s.name; if(!sexp){ readSkillDetail(s.name).then(function(c){ state.detailCache[s.name]=c; forceRender(); }); } forceRender(); }},sexp?'收起':'详情')),
                React.createElement('div',{className:'h-item-sub'},s.description||'（无描述）'),
                sexp?React.createElement('pre',{className:'h-pre'},(state.detailCache[s.name]||'').slice(0,2500)):null));
            });
            if(!skills.length) right.push(React.createElement('p',{key:'sk0',className:'h-note'},'（无）'));
          }
          right.push(React.createElement(Sec,{key:'mc',label:'🔌 MCP 服务（'+mcp.length+'）·勾选注入/详情',open:!state.collapsedSection['mc'],onT:function(){toggleSection('mc');}}));
          if(!state.collapsedSection['mc']){ mcp.forEach(function(m,i){ const ck=state.selectedMCP.has(m.name); const mexp=state.mcpOpen===m.name;
            right.push(React.createElement('div',{key:'mc'+i,className:'h-item'},
              React.createElement('div',{className:'h-item-row'},
                React.createElement('input',{type:'checkbox',disabled:!state.active,checked:ck,onChange:function(){ if(ck)state.selectedMCP.delete(m.name);else state.selectedMCP.add(m.name); applyActive(); }}),
                React.createElement('div',{className:'h-item-title'},m.name),
                React.createElement('button',{type:'button',className:'h-btn',onClick:function(){ state.mcpOpen=mexp?null:m.name; if(!mexp){ readMcpDetail(m.name).then(function(c){ state.mcpDetailCache[m.name]=c; forceRender(); }); } forceRender(); }},mexp?'收起':'详情')),
              mexp?React.createElement('pre',{className:'h-pre'},state.mcpDetailCache[m.name]||'加载…'):null));
          }); if(!mcp.length) right.push(React.createElement('p',{key:'mc0',className:'h-note'},'（无）')); }
          panel=React.createElement('aside',{className:'h-panel',style:styleBase,onClick:function(e){e.stopPropagation();}}, header,
            React.createElement('div',{className:'h-body'}, React.createElement('div',{className:'h-grid'}, React.createElement('div',{className:'h-col'},left), React.createElement('div',{className:'h-col'},right))),
            React.createElement('div',{className:'h-rz h-rz-ne',onMouseDown:function(e){startResize('NE',e);}}),
            React.createElement('div',{className:'h-rz h-rz-se',onMouseDown:function(e){startResize('SE',e);}}),
            React.createElement('div',{className:'h-rz h-rz-sw',onMouseDown:function(e){startResize('SW',e);}}),
            React.createElement('div',{className:'h-rz h-rz-nw',onMouseDown:function(e){startResize('NW',e);}}));
        }
        var pill=React.createElement('button',{type:'button',className:'h-pill',title:'Hermes 资产',onClick:toggle}, React.createElement('span',{className:'h-pill-lbl'},'📁 Hermes 资产'), React.createElement('span',{className:'h-pill-n'},state.active?'✓':'·'));
        return React.createElement('div',{className:'h-root'}, panel, pill);
      });
    });
    styles.insert(` .h-root{display:contents} .h-pill{position:fixed;left:14px;bottom:100px;z-index:90;box-sizing:border-box;height:44px;border-radius:22px;align-items:center;gap:8px;padding:0 16px 0 14px;margin:0;color:var(--dsw-alias-label-primary,#111);background:var(--dsw-alias-bg-base,#fff);border:1px solid var(--dsw-alias-border-l2,#ccc);box-shadow:var(--dsw-shadow-lv2,rgba(0,0,0,0.2));display:inline-flex;cursor:pointer;font-family:inherit;font-size:13px;font-weight:500} .h-pill:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,0.12))} .h-pill-lbl{overflow:hidden;text-overflow:ellipsis;white-space:nowrap} .h-pill-n{flex:none;background:var(--dsw-alias-button-ghost-active-fill,rgba(128,128,128,0.2));border-radius:10px;padding:0 6px;font-size:11px} .h-panel{position:fixed;z-index:89;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);max-width:calc(100vw - 20px);max-height:calc(100vh - 20px);box-shadow:var(--dsw-shadow-lv2);border-radius:12px;flex-direction:column;display:flex;overflow:hidden;font-size:13px;line-height:1.4;min-width:320px;min-height:260px} .h-head{box-sizing:border-box;border-bottom:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);flex:none;justify-content:space-between;align-items:center;min-height:38px;padding:4px 8px;display:flex;cursor:move} .h-drag{color:var(--dsw-alias-label-tertiary);cursor:move;margin-right:4px;opacity:0.7} .h-title{font-size:13px;font-weight:600;flex:1} .h-acts{display:flex;align-items:center;gap:6px} .h-acts button{background:transparent;border:none;cursor:pointer;font-size:12px;color:var(--dsw-alias-label-secondary)} .h-tog{background:var(--dsw-alias-button-ghost-active-fill,rgba(128,128,128,0.2))!important;border:1px solid var(--dsw-alias-border-l2)!important;border-radius:8px!important;padding:2px 10px!important;font-weight:600} .h-mode{margin:0 0 4px;padding:5px 8px;border:1px dashed var(--dsw-alias-border-l2);border-radius:8px;font-size:12px;color:var(--dsw-alias-label-secondary)} .h-sett{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin:2px 0;font-size:11px;color:var(--dsw-alias-label-secondary)} .h-sett-lbl{opacity:0.7} .h-sett-tip{opacity:0.75;color:var(--dsw-alias-label-tertiary);font-size:10.5px;margin-left:4px;display:inline-block;width:100%} .h-num{width:44px;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:5px;color:var(--dsw-alias-label-primary);font-size:11px;padding:1px 3px} .h-src{display:inline-flex;align-items:center;gap:3px;font-size:10.5px;margin-right:4px;cursor:pointer} .h-src input{margin:0} .h-search{box-sizing:border-box;width:100%;padding:4px 8px;margin:2px 0;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:12px} .h-body{flex:1;min-height:0;padding:6px 10px 10px;overflow-y:auto} .h-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;min-height:100%} .h-col{display:flex;flex-direction:column} .h-sec{display:flex;align-items:center;gap:6px;margin:10px 0 6px;font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary);cursor:pointer;user-select:none} .h-sec-arrow{flex:none;width:12px;font-size:11px;opacity:0.7} .h-sec-label{flex:1} .h-repo4{display:grid;grid-template-columns:16px 1fr auto;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);border-radius:8px;padding:5px 8px;margin-bottom:5px;align-items:center} .h-r4-ch{cursor:pointer} .h-r4-name{font-weight:600;font-size:12.5px;cursor:pointer} .h-r4-num{font-size:11px;opacity:0.6;flex:none} .h-c4{display:grid;grid-template-columns:16px minmax(0,1.4fr) 0.7fr 1.2fr auto;gap:6px;align-items:center;padding:3px 2px 3px 8px;font-size:12px;cursor:pointer;border-bottom:1px solid var(--dsw-alias-border-l2)} .h-c4 .h-c4-col{overflow:hidden;text-overflow:ellipsis;white-space:nowrap} .h-c4 .nm{font-weight:500} .h-c4 .id{font-family:monospace;font-size:10.5px;opacity:0.6} .h-c4-edge{flex:none;font-size:11px;opacity:0.7} .h-grp{font-size:10.5px;font-weight:700;opacity:0.75;margin:4px 0 2px 24px;letter-spacing:0.5px} .h-pv{border:1px solid var(--dsw-alias-border-l2);border-radius:6px;margin:3px 0 5px 24px;padding:5px 7px;font-size:11.5px;color:var(--dsw-alias-label-secondary)} .h-pv-role{font-weight:600;margin-right:5px;display:inline-block;margin-bottom:2px} .h-pv-text{white-space:pre-wrap;word-break:break-word;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden} .h-btn{background:transparent;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;cursor:pointer;font-size:11px;padding:0 5px;flex:none;color:var(--dsw-alias-label-secondary)} .h-item{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);border-radius:8px;padding:6px 8px;margin-bottom:5px} .h-item-row{display:flex;align-items:center;gap:6px} .h-item-title{flex:1;font-weight:500;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap} .h-item-sub{font-size:11px;opacity:0.6;word-break:break-all;margin-top:1px} .h-item input{margin:0;flex:none} .h-pre{white-space:pre-wrap;word-break:break-word;margin:6px 0 0;font-size:11px;color:var(--dsw-alias-label-secondary)} .h-note{color:var(--dsw-alias-label-tertiary);font-size:12px;margin:2px 0} .h-note.err{color:var(--dsw-alias-state-error-primary)} .h-rz{position:absolute;width:26px;height:26px;z-index:5} .h-rz-ne{top:-9px;right:-9px;cursor:nesw-resize} .h-rz-se{bottom:-9px;right:-9px;cursor:nwse-resize} .h-rz-sw{bottom:-9px;left:-9px;cursor:nesw-resize} .h-rz-nw{top:-9px;left:-9px;cursor:nwse-resize} `);
  
    }
    exports.apply = apply;
    return module.exports;
  }
});
