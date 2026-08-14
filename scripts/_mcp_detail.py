# -*- coding: utf-8 -*-
"""读取 config.yaml 中某个 MCP 服务的配置块（只读）。
用法: python _mcp_detail.py <server_name>
stdout: JSON {"name":..., "detail": "<yaml 块文本>", "found": bool}
"""
import os, sys, json, re

pid = sys.argv[1] if len(sys.argv) > 1 else ''
out = {'name': pid, 'detail': '', 'found': False}
local = os.environ.get('LOCALAPPDATA', '')
hh = os.path.join(local, 'hermes')
cp = os.path.join(hh, 'config.yaml')
if os.path.isfile(cp) and pid:
    try:
        lines = open(cp, encoding='utf-8', errors='ignore').read().split('\n')
        # 找 mcp_servers: 下的 pid: 块，直到缩进回退到 mcp_servers 层级
        in_servers = False; indent = -1; start = -1; end = len(lines)
        for i, raw in enumerate(lines):
            line = raw.split('#')[0].rstrip()
            if in_servers and start >= 0 and i > start:
                ci = len(line) - len(line.lstrip())
                if line.strip() == '':
                    continue
                if ci <= indent:
                    end = i
                    break
            if not in_servers:
                if re.match(r'mcp_servers\s*:', line):
                    in_servers = True; indent = len(line) - len(line.lstrip())
                continue
            m = re.match(r'(\s+)([\w.-]+)\s*:', line)
            if m:
                ci = len(m.group(1))
                name = m.group(2)
                if name == pid:
                    start = i
                    # 该服务的缩进级别
                    sv_indent = ci
                    # 找结束：缩进回到 <= sv_indent 的兄弟服务或 mcp_servers 层
                    for j in range(i + 1, len(lines)):
                        l2 = lines[j].split('#')[0].rstrip()
                        if l2.strip() == '':
                            continue
                        cj = len(l2) - len(l2.lstrip())
                        if cj <= sv_indent and not l2.lstrip().startswith('-'):
                            end = j
                            break
                    break
        if start >= 0:
            block = '\n'.join(lines[start:end]).strip()
            out['detail'] = block[:1500]
            out['found'] = True
    except Exception:
        pass
print(json.dumps(out, ensure_ascii=True))
