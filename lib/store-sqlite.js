// SQLite (node:sqlite, built into Node 22.5+) with a write-through in-memory cache.
// Reads never touch disk after warm-up; every write is a single transaction.
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DATA_DIR = process.env.ABS_DATA || path.join(__dirname, '..', 'data');
fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'abs.db'));
db.exec(`
PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, name TEXT, email TEXT UNIQUE COLLATE NOCASE, role TEXT, title TEXT, phone TEXT,
  pass TEXT, active INTEGER DEFAULT 1, projects TEXT DEFAULT '[]', must_change INTEGER DEFAULT 0, created_at TEXT, last_login TEXT);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id TEXT, created_at TEXT, expires_at INTEGER);
CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY, entity TEXT, project_id TEXT, code TEXT, data TEXT,
  created_at TEXT, updated_at TEXT, created_by TEXT, updated_by TEXT, deleted INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS ix_rec_entity ON records(entity, deleted);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, user_id TEXT, user_name TEXT, entity TEXT,
  record_id TEXT, code TEXT, action TEXT, diff TEXT, project_id TEXT);
CREATE INDEX IF NOT EXISTS ix_audit_rec ON audit(record_id);
CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY, name TEXT, mime TEXT, size INTEGER, path TEXT, uploaded_by TEXT, uploaded_at TEXT);
CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, audience TEXT, severity TEXT, kind TEXT,
  title TEXT, body TEXT, entity TEXT, record_id TEXT, project_id TEXT, dedupe TEXT UNIQUE, read_by TEXT DEFAULT '[]', resolved INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS counters(key TEXT PRIMARY KEY, n INTEGER);
`);

const { now, uid, hashPass, checkPass } = require('./common');

function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

// ---------- records with cache ----------
const cache = new Map(); // entity -> Map(id -> record)
function load(entity) {
  if (cache.has(entity)) return cache.get(entity);
  const m = new Map();
  for (const r of db.prepare('SELECT * FROM records WHERE entity=? AND deleted=0').all(entity)) m.set(r.id, hydrate(r));
  cache.set(entity, m);
  return m;
}
function hydrate(r) {
  return { id: r.id, entity: r.entity, project_id: r.project_id, code: r.code, ...JSON.parse(r.data),
    created_at: r.created_at, updated_at: r.updated_at, created_by: r.created_by, updated_by: r.updated_by };
}
const META = new Set(['id', 'entity', 'project_id', 'code', 'created_at', 'updated_at', 'created_by', 'updated_by', '_computed']);
function strip(rec) { const d = {}; for (const k in rec) if (!META.has(k)) d[k] = rec[k]; return d; }

function nextCode(prefix) {
  const row = db.prepare('SELECT n FROM counters WHERE key=?').get(prefix);
  const n = (row ? row.n : 0) + 1;
  db.prepare('INSERT INTO counters(key,n) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET n=excluded.n').run(prefix, n);
  return `${prefix}-${String(n).padStart(4, '0')}`;
}

const records = {
  all(entity) { return [...load(entity).values()]; },
  get(entity, id) { return load(entity).get(id) || null; },
  find(id) { for (const m of cache.values()) if (m.has(id)) return m.get(id); return null; },
  insert(entity, prefix, project_id, data, userId) {
    const rec = { id: uid(), entity, project_id: project_id || null, code: nextCode(prefix), ...data,
      created_at: now(), updated_at: now(), created_by: userId, updated_by: userId };
    db.prepare('INSERT INTO records(id,entity,project_id,code,data,created_at,updated_at,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(rec.id, entity, rec.project_id, rec.code, JSON.stringify(strip(rec)), rec.created_at, rec.updated_at, userId, userId);
    load(entity).set(rec.id, rec);
    return rec;
  },
  update(entity, id, data, userId) {
    const prev = this.get(entity, id);
    const rec = { ...prev, ...data, id, entity, code: prev.code, updated_at: now(), updated_by: userId };
    if (data.project_id !== undefined) rec.project_id = data.project_id;
    db.prepare('UPDATE records SET data=?, project_id=?, updated_at=?, updated_by=? WHERE id=?')
      .run(JSON.stringify(strip(rec)), rec.project_id, rec.updated_at, userId, id);
    load(entity).set(id, rec);
    return rec;
  },
  remove(entity, id) {
    db.prepare('UPDATE records SET deleted=1 WHERE id=?').run(id);
    load(entity).delete(id);
  },
  strip,
};

// ---------- settings ----------
const settingsCache = new Map();
const settings = {
  get(key, dflt) {
    if (settingsCache.has(key)) return settingsCache.get(key);
    const r = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
    const v = r ? JSON.parse(r.value) : dflt;
    settingsCache.set(key, v);
    return v;
  },
  set(key, value) {
    db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value));
    settingsCache.set(key, value);
  },
};

// ---------- users ----------
const userRow = u => u && ({ ...u, projects: JSON.parse(u.projects || '[]'), active: !!u.active, must_change: !!u.must_change });
let usersCache = null;
const users = {
  all() { if (!usersCache) usersCache = db.prepare('SELECT * FROM users ORDER BY name').all().map(userRow); return usersCache; },
  get(id) { return this.all().find(u => u.id === id) || null; },
  byEmail(email) { return this.all().find(u => u.email.toLowerCase() === String(email).toLowerCase()) || null; },
  create(u) {
    const id = uid();
    db.prepare('INSERT INTO users(id,name,email,role,title,phone,pass,active,projects,must_change,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .run(id, u.name, u.email, u.role, u.title || '', u.phone || '', hashPass(u.password), u.active === false ? 0 : 1,
        JSON.stringify(u.projects || []), u.must_change ? 1 : 0, now());
    usersCache = null; return this.get(id);
  },
  update(id, u) {
    const cur = this.get(id);
    const n = { ...cur, ...u };
    db.prepare('UPDATE users SET name=?,email=?,role=?,title=?,phone=?,active=?,projects=?,must_change=? WHERE id=?')
      .run(n.name, n.email, n.role, n.title || '', n.phone || '', n.active ? 1 : 0, JSON.stringify(n.projects || []), n.must_change ? 1 : 0, id);
    if (u.password) db.prepare('UPDATE users SET pass=? WHERE id=?').run(hashPass(u.password), id);
    usersCache = null; return this.get(id);
  },
  touch(id) { db.prepare('UPDATE users SET last_login=? WHERE id=?').run(now(), id); usersCache = null; },
  public(u) { if (!u) return null; const { pass, ...rest } = u; return rest; },
};

// ---------- sessions ----------
const SESSION_MS = 1000 * 60 * 60 * 12;
const sessions = {
  create(userId) {
    const token = crypto.randomBytes(32).toString('base64url');
    db.prepare('INSERT INTO sessions(token,user_id,created_at,expires_at) VALUES(?,?,?,?)').run(token, userId, now(), Date.now() + SESSION_MS);
    return token;
  },
  user(token) {
    if (!token) return null;
    const s = db.prepare('SELECT * FROM sessions WHERE token=?').get(token);
    if (!s || s.expires_at < Date.now()) return null;
    const u = users.get(s.user_id);
    return u && u.active ? u : null;
  },
  destroy(token) { db.prepare('DELETE FROM sessions WHERE token=?').run(token); },
  destroyUser(userId) { db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId); },
  purge() { db.prepare('DELETE FROM sessions WHERE expires_at<?').run(Date.now()); },
};

// ---------- audit ----------
const audit = {
  log(user, entity, rec, action, diff) {
    db.prepare('INSERT INTO audit(at,user_id,user_name,entity,record_id,code,action,diff,project_id) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(now(), user?.id || 'system', user?.name || 'System', entity, rec?.id || null, rec?.code || null, action, JSON.stringify(diff || {}), rec?.project_id || null);
  },
  async forRecord(id) { return db.prepare('SELECT * FROM audit WHERE record_id=? ORDER BY id DESC LIMIT 200').all(id); },
  async recent(limit = 300, filter = {}) {
    let q = 'SELECT * FROM audit WHERE 1=1'; const p = [];
    if (filter.user) { q += ' AND user_id=?'; p.push(filter.user); }
    if (filter.entity) { q += ' AND entity=?'; p.push(filter.entity); }
    q += ' ORDER BY id DESC LIMIT ?'; p.push(limit);
    return db.prepare(q).all(...p);
  },
};

// ---------- files ----------
const files = {
  save(name, mime, buf, userId) {
    const id = uid();
    const safe = name.replace(/[^\w.\- ]+/g, '_').slice(-80);
    const rel = `${id}_${safe}`;
    fs.writeFileSync(path.join(DATA_DIR, 'uploads', rel), buf);
    db.prepare('INSERT INTO files(id,name,mime,size,path,uploaded_by,uploaded_at) VALUES(?,?,?,?,?,?,?)').run(id, name, mime, buf.length, rel, userId, now());
    return { id, name, mime, size: buf.length };
  },
  async get(id) { return db.prepare('SELECT * FROM files WHERE id=?').get(id) || null; },
  async read(id) { const f = db.prepare('SELECT * FROM files WHERE id=?').get(id); return f ? fs.readFileSync(path.join(DATA_DIR, 'uploads', f.path)) : null; },
};

// ---------- notifications ----------
const notifications = {
  upsert(n) {
    // dedupe key keeps alerts idempotent across sweeps
    const ex = db.prepare('SELECT id, resolved FROM notifications WHERE dedupe=?').get(n.dedupe);
    if (ex) { if (ex.resolved) db.prepare('UPDATE notifications SET resolved=0, at=?, title=?, body=? WHERE id=?').run(now(), n.title, n.body, ex.id); else db.prepare('UPDATE notifications SET title=?, body=? WHERE id=?').run(n.title, n.body, ex.id); return; }
    db.prepare('INSERT INTO notifications(at,audience,severity,kind,title,body,entity,record_id,project_id,dedupe) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(now(), JSON.stringify(n.audience), n.severity, n.kind, n.title, n.body || '', n.entity || null, n.record_id || null, n.project_id || null, n.dedupe);
  },
  resolveExcept(prefix, liveKeys) {
    const rows = db.prepare("SELECT id, dedupe FROM notifications WHERE resolved=0 AND dedupe LIKE ?").all(prefix + '%');
    for (const r of rows) if (!liveKeys.has(r.dedupe)) db.prepare('UPDATE notifications SET resolved=1 WHERE id=?').run(r.id);
  },
  forUser(u, limit = 100) {
    return db.prepare('SELECT * FROM notifications WHERE resolved=0 ORDER BY id DESC LIMIT 1000').all()
      .filter(n => { const a = JSON.parse(n.audience); return a.includes('*') || a.includes(u.id) || a.includes('role:' + u.role); })
      .slice(0, limit).map(n => ({ ...n, read: JSON.parse(n.read_by).includes(u.id) }));
  },
  markRead(u, ids) {
    for (const id of ids) {
      const r = db.prepare('SELECT read_by FROM notifications WHERE id=?').get(id);
      if (!r) continue;
      const rb = JSON.parse(r.read_by); if (!rb.includes(u.id)) rb.push(u.id);
      db.prepare('UPDATE notifications SET read_by=? WHERE id=?').run(JSON.stringify(rb), id);
    }
  },
};

// lifecycle hooks shared with the other stores (no-ops here: SQLite is synchronous and durable)
const ready = async () => {};
const sync = async () => {};
const flush = async () => {};
function reset() {
  db.exec('DELETE FROM records; DELETE FROM audit; DELETE FROM notifications; DELETE FROM counters; DELETE FROM sessions; DELETE FROM users; DELETE FROM files; DELETE FROM settings;');
  cache.clear(); settingsCache.clear(); usersCache = null;
}

module.exports = { mode: 'sqlite', db, tx, records, settings, users, sessions, audit, files, notifications, now, uid, hashPass, checkPass, ready, sync, flush, reset, DATA_DIR };
