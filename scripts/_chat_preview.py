# -*- coding: utf-8 -*-
"""读取某 Hermes 会话的开场 X 条 + 最近 Y 条消息（只读）。
用法: python _chat_preview.py <session_id> [openN=2] [latestM=3] [roles=]
角色(可选)过滤：按消息角色(逗号分隔，如 user,tool；空=全部)在各方向取足数量——
即"自动补齐"：selected 类型不足时跳过其他类型继续取，直到凑够 openN/latestM 或取完。
stdout: JSON {"opening":[{role,text}], "latest":[{role,text}]}，每条截断约 300 字符。
"""
import os, sys, json, sqlite3

sid = sys.argv[1] if len(sys.argv) > 1 else ''
openN = int(sys.argv[2]) if len(sys.argv) > 2 else 2
latestM = int(sys.argv[3]) if len(sys.argv) > 3 else 3
roles_arg = sys.argv[4] if len(sys.argv) > 4 else ''
out = {"opening": [], "latest": []}


def parse_roles(ra):
    if not ra:
        return []
    parts = [p.strip() for p in ra.replace('，', ',').split(',') if p.strip()]
    return parts


roles = parse_roles(roles_arg)
use_filter = bool(roles)
if sid:
    local = os.environ.get('LOCALAPPDATA', '')
    hh = os.path.join(local, 'hermes')
    try:
        db = sqlite3.connect(os.path.join(hh, 'state.db'))
        base = "FROM messages WHERE session_id=? AND content IS NOT NULL AND length(trim(content))>0"
        params = [sid]
        if use_filter:
            ph = ",".join(["?"] * len(roles))
            base += " AND role IN (" + ph + ")"
            params = params + roles
        q_open = "SELECT role, content " + base + " ORDER BY id ASC LIMIT ?"
        q_late = "SELECT role, content " + base + " ORDER BY id DESC LIMIT ?"
        rows_open = db.execute(q_open, params + [openN]).fetchall()
        rows_late = db.execute(q_late, params + [latestM]).fetchall()
        db.close()
    except Exception:
        rows_open, rows_late = [], []

    def cl(r):
        role = r[0] or ''
        text = (r[1] or '').strip()
        text = ' '.join(text.split())
        if len(text) > 300:
            text = text[:300] + '…'
        return {'role': role, 'text': text}

    out['opening'] = [cl(r) for r in rows_open]
    late = [cl(r) for r in rows_late]
    late.reverse()
    out['latest'] = late

print(json.dumps(out, ensure_ascii=True))
