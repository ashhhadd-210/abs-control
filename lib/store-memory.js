// In-memory store — used for the hosted demo (Vercel) where there is no persistent disk.
// Same interface as store-sqlite.js. Everything lives for the lifetime of the server instance;
// a cold start reseeds the demo. A persistent backend (Supabase/Neon Postgres) drops in behind
// this same interface: keep the working set here and persist mutations in flush().
const { now, uid, hashPass, checkPass } = require('./common');

const META = new Set(['id', 'entity', 'project_id', 'code', 'created_at', 'updated_at', 'created_by', 'updated_by', '_computed']);
const strip = rec => { const d = {}; for (const k in rec) if (!META.has(k)) d[k] = rec[k]; return d; };

let S;
function blank() {
  S = { records: new Map(), users: [], sessions: new Map(), audit: [], auditSeq: 0, files: new Map(), notifications: [], notifSeq: 0, settings: new Map(), counters: new Map() };
}
blank();

const ent = e => { if (!S.records.has(e)) S.records.set(e, new Map()); return S.records.get(e); };

const records = {
  all(entity) { return [...ent(entity).values()]; },
  get(entity, id) { return ent(entity).get(id) || null; },
  find(id) { for (const m of S.records.values()) if (m.has(id)) return m.get(id); return null; },
  insert(entity, prefix, project_id, data, userId) {
    const n = (S.counters.get(prefix) || 0) + 1; S.counters.set(prefix, n);
    const rec = { id: uid(), entity, project_id: project_id || null, code: `${prefix}-${String(n).padStart(4, '0')}`, ...data,
      created_at: now(), updated_at: now(), created_by: userId, updated_by: userId };
    ent(entity).set(rec.id, rec); return rec;
  },
  update(entity, id, data, userId) {
    const prev = this.get(entity, id);
    const rec = { ...prev, ...data, id, entity, code: prev.code, updated_at: now(), updated_by: userId };
    if (data.project_id !== undefined) rec.project_id = data.project_id;
    ent(entity).set(id, rec); return rec;
  },
  remove(entity, id) { ent(entity).delete(id); },
  strip,
};

const settings = {
  get(key, dflt) { return S.settings.has(key) ? S.settings.get(key) : dflt; },
  set(key, value) { S.settings.set(key, value); },
};

const users = {
  all() { return [...S.users].sort((a, b) => a.name.localeCompare(b.name)); },
  get(id) { return S.users.find(u => u.id === id) || null; },
  byEmail(email) { return S.users.find(u => u.email.toLowerCase() === String(email).toLowerCase()) || null; },
  create(u) {
    const row = { id: uid(), name: u.name, email: u.email, role: u.role, title: u.title || '', phone: u.phone || '', pass: hashPass(u.password),
      active: u.active !== false, projects: u.projects || [], must_change: !!u.must_change, created_at: now(), last_login: null };
    S.users.push(row); return row;
  },
  update(id, u) {
    const cur = this.get(id); const { password, ...rest } = u;
    Object.assign(cur, rest, { active: !!(rest.active ?? cur.active), must_change: !!(rest.must_change ?? cur.must_change), projects: rest.projects || cur.projects });
    if (password) cur.pass = hashPass(password);
    return cur;
  },
  touch(id) { const u = this.get(id); if (u) u.last_login = now(); },
  public(u) { if (!u) return null; const { pass, ...rest } = u; return rest; },
};

const SESSION_MS = 1000 * 60 * 60 * 12;
const sessions = {
  create(userId) { const token = uid() + uid() + uid(); S.sessions.set(token, { token, user_id: userId, created_at: now(), expires_at: Date.now() + SESSION_MS }); return token; },
  user(token) { const s = token && S.sessions.get(token); if (!s || s.expires_at < Date.now()) return null; const u = users.get(s.user_id); return u && u.active ? u : null; },
  destroy(token) { S.sessions.delete(token); },
  destroyUser(userId) { for (const [t, s] of S.sessions) if (s.user_id === userId) S.sessions.delete(t); },
  purge() { for (const [t, s] of S.sessions) if (s.expires_at < Date.now()) S.sessions.delete(t); },
};

const audit = {
  log(user, entity, rec, action, diff) {
    S.audit.push({ id: ++S.auditSeq, at: now(), user_id: user?.id || 'system', user_name: user?.name || 'System', entity, record_id: rec?.id || null, code: rec?.code || null, action, diff: JSON.stringify(diff || {}), project_id: rec?.project_id || null });
    if (S.audit.length > 20000) S.audit.splice(0, 5000);
  },
  async forRecord(id) { return S.audit.filter(a => a.record_id === id).slice(-200).reverse(); },
  async recent(limit = 300, filter = {}) {
    return S.audit.filter(a => (!filter.user || a.user_id === filter.user) && (!filter.entity || a.entity === filter.entity)).slice(-limit).reverse();
  },
};

const files = {
  save(name, mime, buf, userId) {
    const id = uid();
    S.files.set(id, { id, name, mime, size: buf.length, path: '', uploaded_by: userId, uploaded_at: now(), buf });
    return { id, name, mime, size: buf.length };
  },
  async get(id) { const f = S.files.get(id); if (!f) return null; const { buf, ...meta } = f; return meta; },
  async read(id) { return S.files.get(id)?.buf || null; },
};

const notifications = {
  upsert(n) {
    const ex = S.notifications.find(x => x.dedupe === n.dedupe);
    if (ex) { ex.title = n.title; ex.body = n.body || ''; if (ex.resolved) { ex.resolved = 0; ex.at = now(); } return; }
    S.notifications.push({ id: ++S.notifSeq, at: now(), audience: JSON.stringify(n.audience), severity: n.severity, kind: n.kind, title: n.title, body: n.body || '',
      entity: n.entity || null, record_id: n.record_id || null, project_id: n.project_id || null, dedupe: n.dedupe, read_by: '[]', resolved: 0 });
  },
  resolveExcept(prefix, liveKeys) { for (const x of S.notifications) if (!x.resolved && x.dedupe.startsWith(prefix) && !liveKeys.has(x.dedupe)) x.resolved = 1; },
  forUser(u, limit = 100) {
    return S.notifications.filter(x => !x.resolved).slice(-1000).reverse()
      .filter(x => { const a = JSON.parse(x.audience); return a.includes('*') || a.includes(u.id) || a.includes('role:' + u.role); })
      .slice(0, limit).map(x => ({ ...x, read: JSON.parse(x.read_by).includes(u.id) }));
  },
  markRead(u, ids) { for (const x of S.notifications) if (ids.includes(x.id)) { const rb = JSON.parse(x.read_by); if (!rb.includes(u.id)) { rb.push(u.id); x.read_by = JSON.stringify(rb); } } },
};

const ready = async () => {};
const sync = async () => {};
const flush = async () => {};
const reset = () => blank();

module.exports = { mode: 'memory', records, settings, users, sessions, audit, files, notifications, now, uid, hashPass, checkPass, ready, sync, flush, reset, DATA_DIR: null };
