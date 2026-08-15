// Builds native client bundle from the working dynamic panel (_hmpnl_big.js).
// Strategy: keep the panel body nearly verbatim; only rewire the three
// dynamic-runtime globals (React / host / styles) to native sources inside the
// __ModuleLoader__ factory:
//   - React  -> require('react')
//   - host   -> ctx.connection.rpc.call('/hermes', method, args) with RpcResult unwrap
//   - styles -> inject CSS into a <style> element
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync('hermes-chats/_hmpnl_big.js', 'utf8');

// Extract the apply(ctx){...} function body from `return { apply(ctx) { ... } };`
const applyMatch = src.match(/apply\(ctx\)\s*\{([\s\S]*)\}\s*\r?\n\}\s*;\s*$/);
if (!applyMatch) { console.error('could not extract apply'); process.exit(1); }
const applyBody = applyMatch[1]; // everything between `{` and the final `}`

const bundle = `window.__ModuleLoader__.load({
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
      ${applyBody}
    }
    exports.apply = apply;
    return module.exports;
  }
});
`;

const out = path.join(__dirname, 'index.js');
fs.writeFileSync(out, bundle, 'utf8');
console.log('wrote', out, bundle.length, 'bytes');
