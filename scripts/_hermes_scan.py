import os, re, json, sqlite3, shutil, tempfile
out = {}
local = os.environ.get('LOCALAPPDATA', '')
hh = os.path.join(local, 'hermes') if local else ''
if not (hh and os.path.isdir(hh)):
    alt = os.path.join(os.path.expanduser('~'), '.hermes')
    hh = alt if os.path.isdir(alt) else hh
out['hermesHome'] = hh

def open_ro(name):
    src = os.path.join(hh, name)
    if not os.path.isfile(src):
        return None
    try:
        return sqlite3.connect('file:' + src.replace(chr(92), chr(92)*2) + '?immutable=1', uri=True)
    except Exception:
        try:
            tmp = os.path.join(tempfile.gettempdir(), '_hermes_' + name)
            shutil.copy2(src, tmp)
            return sqlite3.connect(tmp)
        except Exception:
            return None

projects = []; repos = []
proj = open_ro('projects.db')
if proj:
    try:
        for r in proj.execute("SELECT id,name,primary_path,archived FROM projects"):
            projects.append({'id': r[0], 'name': r[1] or r[0], 'primary_path': r[2] or '', 'archived': bool(r[3])})
    except Exception:
        pass
    try:
        for r in proj.execute("SELECT root,label,last_seen FROM discovered_repos ORDER BY last_seen DESC"):
            repos.append({'root': r[0], 'label': r[1] or (os.path.basename(r[0]) if r[0] else ''), 'last_seen': r[2]})
    except Exception:
        pass
    proj.close()
out['projects'] = projects
out['repos'] = repos

chats = []; prompts = []
st = open_ro('state.db')
if st:
    try:
        rows = st.execute("SELECT s.id, COALESCE(s.display_name,s.title), s.source, COALESCE(s.git_repo_root,''), (SELECT substr(m.content,1,90) FROM messages m WHERE m.session_id=s.id AND m.role='user' AND m.content IS NOT NULL ORDER BY m.id LIMIT 1), COALESCE(s.last_activity_at,0) FROM sessions s WHERE (s.display_name IS NOT NULL OR s.title IS NOT NULL) ORDER BY 6 DESC LIMIT 24").fetchall()
        chats = [{'id': r[0], 'name': r[1] or '(unnamed)', 'source': r[2] or '', 'repo': r[3] or '', 'preview': (r[4] or '')[:80]} for r in rows]
    except Exception:
        chats = []
    try:
        ps = st.execute("SELECT hash,length(prompt) FROM system_prompts").fetchall()
        prompts = [{'id': p[0], 'label': 'Prompt.' + str(p[1]), 'chars': p[1]} for p in ps]
    except Exception:
        prompts = []
    st.close()
out['chats'] = chats
out['prompts'] = prompts

skills = []
sdir = os.path.join(hh, 'skills')
if os.path.isdir(sdir):
    for root, dirs, files in os.walk(sdir):
        if '_curator' in root or '.curator' in root or '.hub' in root or 'node_modules' in root:
            continue
        if 'SKILL.md' in files:
            try:
                head = open(os.path.join(root, 'SKILL.md'), encoding='utf-8', errors='ignore').read(600)
                m = re.search(r'description\s*:\s*["\x27]?([^\r\n"\x27]{1,120})', head)
                desc = m.group(1).strip() if m else ''
            except Exception:
                desc = ''
            skills.append({'name': os.path.basename(root), 'description': desc[:120], 'path': root})
            dirs[:] = []
out['skills'] = skills

mcp = []
FIELDS = {'command','args','url','headers','timeout','transport','protocol','type','environment','env','workers','execution','shell','dispatch','api_key','base_url','token','secret','role','model','enabled','enable','name','stdin','spawn','extension','tools'}
cp = os.path.join(hh, 'config.yaml')
if os.path.isfile(cp):
    try:
        in_s = False; indent = 0
        for raw in open(cp, encoding='utf-8', errors='ignore'):
            line = raw.split('#')[0].rstrip()
            if not line.strip():
                continue
            if re.match(r'mcp_servers\s*:', line):
                in_s = True; indent = len(line) - len(line.lstrip()); continue
            if not in_s:
                continue
            ci = len(line) - len(line.lstrip())
            if ci <= indent:
                in_s = False; continue
            m = re.match(r'\s*([\w.-]+)\s*:\s*$', line)
            if m and m.group(1).lower() not in FIELDS:
                mcp.append({'name': m.group(1)})
    except Exception:
        pass
out['mcp'] = mcp

print(json.dumps(out, ensure_ascii=True))
