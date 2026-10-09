// ABS Control — HTTP application (auth, RBAC, API, files, CSV, admin, reports).
// Hosted by server.js locally and by api/index.js on Vercel.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const S = require('./schema');
const D = require('./db');
const E = require('./engine');
const R = require('./reports');

const PUB = path.join(__dirname, '..', 'public');
const DEMO = D.mode === 'memory';

let booted = null;
function boot() {
  if (!booted) booted = (async () => {
    await D.ready();
    if (!D.users.all().length || process.argv.includes('--seed')) require('./seed').run(process.argv.includes('--seed'));
  })();
  return booted;
}
let lastSweep = 0;
function housekeeping() {
  if (Date.now() - lastSweep < 60 * 60 * 1000) return;
  lastSweep = Date.now();
  try { E.sweep(); D.sessions.purge(); } catch (e) { console.error('sweep', e); }
}

// ---------- helpers ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const SEC = { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'" };

async function send(req, res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  try { await D.flush(); } catch (e) { console.error('flush', e); status = 500; body = { error: 'Storage error: ' + e.message }; type = 'application/json; charset=utf-8'; }
  let buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  const h = { 'Content-Type': type, ...SEC, ...extra };
  if (buf.length > 1024 && /gzip/.test(req.headers['accept-encoding'] || '') && /json|text|javascript|svg/.test(type)) { buf = zlib.gzipSync(buf, { level: 6 }); h['Content-Encoding'] = 'gzip'; h.Vary = 'Accept-Encoding'; }
  h['Content-Length'] = buf.length;
  res.writeHead(status, h); res.end(buf);
}
const json = (req, res, data, status = 200) => send(req, res, status, data);
const fail = (req, res, status, message, code) => send(req, res, status, { error: message, code });

function body(req, limit = 30 * 1024 * 1024) {
  if (req.body !== undefined && req.body !== null) { // pre-parsed by the Vercel runtime
    if (typeof req.body === 'string') { try { return Promise.resolve(JSON.parse(req.body || '{}')); } catch { return Promise.reject(new E.RuleError('Invalid JSON', 400)); } }
    if (Buffer.isBuffer(req.body)) { try { return Promise.resolve(JSON.parse(req.body.toString('utf8') || '{}')); } catch { return Promise.reject(new E.RuleError('Invalid JSON', 400)); } }
    return Promise.resolve(req.body);
  }
  return new Promise((ok, no) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { no(new E.RuleError('Payload too large', 413)); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { const s = Buffer.concat(chunks).toString('utf8'); if (!s) return ok({}); try { ok(JSON.parse(s)); } catch { no(new E.RuleError('Invalid JSON', 400)); } });
    req.on('error', no);
  });
}
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(x => x[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));

// static with in-memory gzip cache + ETag
const staticCache = new Map();
function serveStatic(req, res, rel) {
  const file = path.join(PUB, path.normalize(rel).replace(/^([\\/]|\.\.)+/, ''));
  if (!file.startsWith(PUB)) return fail(req, res, 403, 'Forbidden');
  let st; try { st = fs.statSync(file); } catch { return false; }
  if (st.isDirectory()) return false;
  const key = file + st.mtimeMs;
  let c = staticCache.get(file);
  if (!c || c.key !== key) {
    const raw = fs.readFileSync(file);
    c = { key, raw, gz: zlib.gzipSync(raw), etag: '"' + crypto.createHash('sha1').update(raw).digest('base64url').slice(0, 16) + '"', type: MIME[path.extname(file)] || 'application/octet-stream' };
    staticCache.set(file, c);
  }
  if (req.headers['if-none-match'] === c.etag) { res.writeHead(304, { ETag: c.etag }); res.end(); return true; }
  const gz = /gzip/.test(req.headers['accept-encoding'] || '') && /text|javascript|svg|json/.test(c.type);
  const b = gz ? c.gz : c.raw;
  res.writeHead(200, { 'Content-Type': c.type, 'Content-Length': b.length, ETag: c.etag, 'Cache-Control': 'no-cache', ...(gz ? { 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' } : {}), ...SEC });
  res.end(b); return true;
}

// login throttle
const attempts = new Map();
function throttled(key) {
  const a = attempts.get(key) || { n: 0, until: 0 };
  return a.until > Date.now();
}
function recordFail(key) {
  const a = attempts.get(key) || { n: 0, until: 0 };
  a.n++; if (a.n >= 5) { a.until = Date.now() + 5 * 60 * 1000; a.n = 0; }
  attempts.set(key, a);
}

// ---------- CSV ----------
function toCSV(rows, cols) {
  const esc = v => { v = v == null ? '' : Array.isArray(v) ? v.join('; ') : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
  return [cols.map(c => esc(c.label)).join(','), ...rows.map(r => cols.map(c => esc(c.get(r))).join(','))].join('\r\n');
}
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}

// ---------- API ----------
function meta(u) {
  const perms = E.permissions();
  return {
    me: D.users.public(u), roles: S.ROLES, groups: S.GROUPS, entities: S.ENTITIES, phases: S.PROJECT_PHASES, authorities: S.AUTHORITIES,
    gateChecklists: S.GATE_CHECKLISTS, permissions: u.role === 'admin' ? perms : { [u.role]: perms[u.role] }, myPerms: u.role === 'admin' ? Object.fromEntries(Object.keys(S.ENTITIES).map(k => [k, 'rcuda'])) : perms[u.role],
    users: D.users.all().map(x => ({ id: x.id, name: x.name, role: x.role, title: x.title, active: x.active })),
    projects: E.projectIds(u).size ? D.records.all('projects').filter(p => E.projectIds(u).has(p.id)).map(p => ({ id: p.id, code: p.code, name: p.name, phase: p.phase, status: p.status, type: p.type })) : [],
    config: E.cfg(), today: E.today(), demo: DEMO,
  };
}

function listRecords(u, entity, q) {
  const def = S.ENTITIES[entity];
  let rows = D.records.all(entity).filter(r => E.visible(u, entity, r));
  if (q.project && q.project !== 'all') rows = rows.filter(r => (entity === 'projects' ? r.id : r.project_id) === q.project);
  return rows.map(r => E.decorate(entity, r)).sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}

function related(u, rec) {
  // every record that references this one, across all registers
  const out = [];
  for (const [entity, def] of Object.entries(S.ENTITIES)) {
    const refs = def.fields.filter(x => (x.type === 'ref' || x.type === 'multiref'));
    if (!refs.length) continue;
    for (const r of D.records.all(entity)) {
      if (!E.visible(u, entity, r)) continue;
      if (refs.some(x => x.type === 'ref' ? r[x.k] === rec.id : (r[x.k] || []).includes(rec.id))) out.push({ entity, ...E.decorate(entity, r) });
    }
  }
  return out;
}

const routes = [];
const route = (method, pattern, handler, opts = {}) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), handler, ...opts });
const need = (u, entity, letter) => { if (!E.can(u, entity, letter)) throw new E.RuleError('Not permitted for your role', 403); };
const adminOnly = u => { if (u.role !== 'admin' && u.role !== 'ceo') throw new E.RuleError('Administrator access required', 403); };

route('POST', '/api/login', async (req, res) => {
  const b = await body(req);
  const key = (req.socket.remoteAddress || '') + '|' + String(b.email || '').toLowerCase();
  if (throttled(key)) return fail(req, res, 429, 'Too many attempts. Try again in 5 minutes.');
  const u = D.users.byEmail(b.email || '');
  if (!u || !u.active || !D.checkPass(String(b.password || ''), u.pass)) { recordFail(key); return fail(req, res, 401, 'Invalid email or password'); }
  attempts.delete(key);
  const token = D.sessions.create(u.id); D.users.touch(u.id);
  D.audit.log(u, 'session', null, 'login', {});
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  send(req, res, 200, { ok: true, user: D.users.public(u) }, undefined, { 'Set-Cookie': `abs_sid=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secure}` });
}, { public: true });
route('POST', '/api/logout', async (req, res, u) => { D.sessions.destroy(cookies(req).abs_sid); send(req, res, 200, { ok: true }, undefined, { 'Set-Cookie': 'abs_sid=; Path=/; Max-Age=0' }); });
route('GET', '/api/meta', async (req, res, u) => json(req, res, meta(u)));
route('POST', '/api/me/password', async (req, res, u) => {
  const b = await body(req);
  if (!D.checkPass(String(b.current || ''), u.pass)) throw new E.RuleError('Current password is incorrect', 400);
  if (String(b.next || '').length < 8) throw new E.RuleError('New password must be at least 8 characters', 400);
  D.users.update(u.id, { password: b.next, must_change: false });
  D.audit.log(u, 'users', { id: u.id }, 'password-change', {});
  json(req, res, { ok: true });
});

route('GET', '/api/r/:entity', async (req, res, u, p, q) => { need(u, p.entity, 'r'); json(req, res, listRecords(u, p.entity, q)); });
route('GET', '/api/r/:entity/:id', async (req, res, u, p) => {
  need(u, p.entity, 'r');
  const r = D.records.get(p.entity, p.id);
  if (!r || !E.visible(u, p.entity, r)) throw new E.RuleError('Not found', 404);
  const files = {};
  for (const fd of S.ENTITIES[p.entity].fields.filter(x => x.type === 'file' || x.type === 'files'))
    for (const id of [].concat(r[fd.k] || [])) { const f = await D.files.get(id); if (f) files[id] = { id, name: f.name, mime: f.mime, size: f.size }; }
  const refs = {};
  for (const fd of S.ENTITIES[p.entity].fields.filter(x => x.type === 'ref' || x.type === 'multiref'))
    for (const id of [].concat(r[fd.k] || [])) { const x = D.records.get(fd.ref, id); if (x) refs[id] = { id, code: x.code, title: x[S.ENTITIES[fd.ref].title], status: x[S.ENTITIES[fd.ref].status] }; }
  json(req, res, { record: E.decorate(p.entity, r), history: await D.audit.forRecord(r.id), related: related(u, r), files, refs,
    metrics: p.entity === 'projects' ? E.projectMetrics(r) : null });
});
route('POST', '/api/r/:entity', async (req, res, u, p) => json(req, res, E.decorate(p.entity, E.save(p.entity, null, await body(req), u)), 201));
route('PUT', '/api/r/:entity/:id', async (req, res, u, p) => json(req, res, E.decorate(p.entity, E.save(p.entity, p.id, await body(req), u))));
route('DELETE', '/api/r/:entity/:id', async (req, res, u, p) => { E.remove(p.entity, p.id, u); json(req, res, { ok: true }); });
route('POST', '/api/r/:entity/bulk', async (req, res, u, p) => {
  const b = await body(req); const out = { ok: 0, errors: [] };
  for (const id of b.ids || []) { try { E.save(p.entity, id, b.patch || {}, u); out.ok++; } catch (e) { out.errors.push({ id, error: e.message }); } }
  json(req, res, out);
});

route('GET', '/api/export/:entity', async (req, res, u, p, q) => {
  need(u, p.entity, 'r');
  const def = S.ENTITIES[p.entity];
  const uname = id => D.users.get(id)?.name || id || '';
  const pname = id => D.records.get('projects', id)?.name || '';
  const cols = [{ label: 'Code', get: r => r.code }, ...(p.entity === 'projects' ? [] : [{ label: 'Project', get: r => pname(r.project_id) }]),
    ...def.fields.filter(x => !['file', 'files', 'checklist'].includes(x.type)).map(x => ({ label: x.label, get: r => x.type === 'user' ? uname(r[x.k]) : x.type === 'ref' ? (D.records.find(r[x.k])?.code || '') : x.type === 'multiref' ? (r[x.k] || []).map(id => D.records.find(id)?.code).filter(Boolean) : r[x.k] }))];
  send(req, res, 200, '﻿' + toCSV(listRecords(u, p.entity, q), cols), 'text/csv; charset=utf-8', { 'Content-Disposition': `attachment; filename="${p.entity}-${E.today()}.csv"` });
});
route('POST', '/api/import/:entity', async (req, res, u, p) => {
  need(u, p.entity, 'c');
  const def = S.ENTITIES[p.entity];
  const b = await body(req);
  const rows = parseCSV(String(b.csv || ''));
  if (rows.length < 2) throw new E.RuleError('CSV needs a header row and at least one data row', 400);
  const head = rows[0].map(h => h.trim().toLowerCase());
  const byLabel = Object.fromEntries(def.fields.flatMap(x => [[x.label.toLowerCase(), x], [x.k, x]]));
  const users = D.users.all(), projs = D.records.all('projects');
  const out = { created: 0, errors: [] };
  rows.slice(1).forEach((r, i) => {
    try {
      const input = { project_id: b.project_id };
      head.forEach((h, j) => {
        const v = (r[j] || '').trim(); if (!v) return;
        if (h === 'project') { const pr = projs.find(x => x.name.toLowerCase() === v.toLowerCase() || x.code === v); if (pr) input.project_id = pr.id; return; }
        const fd = byLabel[h]; if (!fd || fd.readonly) return;
        if (fd.type === 'user') { const us = users.find(x => x.name.toLowerCase() === v.toLowerCase() || x.email.toLowerCase() === v.toLowerCase()); input[fd.k] = us ? us.id : ''; }
        else if (fd.type === 'date' && /^\d{1,2}[\/-]\d{1,2}[\/-]\d{4}$/.test(v)) { const [d, m, y] = v.split(/[\/-]/); input[fd.k] = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`; }
        else input[fd.k] = v;
      });
      E.save(p.entity, null, input, u); out.created++;
    } catch (e) { out.errors.push({ row: i + 2, error: e.message }); }
  });
  json(req, res, out);
});

route('POST', '/api/files', async (req, res, u) => {
  const b = await body(req);
  const buf = Buffer.from(String(b.data || '').replace(/^data:[^,]*,/, ''), 'base64');
  if (!buf.length) throw new E.RuleError('Empty file', 400);
  if (buf.length > 20 * 1024 * 1024) throw new E.RuleError('Max file size is 20 MB', 413);
  json(req, res, D.files.save(String(b.name || 'file'), String(b.mime || 'application/octet-stream'), buf, u.id), 201);
});
route('GET', '/api/files/:id', async (req, res, u, p, q) => {
  const f = await D.files.get(p.id); if (!f) throw new E.RuleError('Not found', 404);
  const buf = await D.files.read(p.id);
  const inline = /^(image\/|application\/pdf)/.test(f.mime) && !q.download;
  res.writeHead(200, { 'Content-Type': f.mime, 'Content-Length': buf.length, 'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(f.name)}"`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=86400' });
  res.end(buf);
});

route('GET', '/api/portfolio', async (req, res, u, p, q) => {
  const set = E.scope(u, q.project);
  const projects = [...set].map(id => D.records.get('projects', id)).filter(Boolean).map(E.projectMetrics).sort((a, b) => a.name.localeCompare(b.name));
  json(req, res, { projects, kpis: E.kpis(set), inbox: E.inboxItems(set).length, today: E.today() });
});
route('GET', '/api/kpis', async (req, res, u, p, q) => json(req, res, E.kpis(E.scope(u, q.project))));
route('GET', '/api/inbox', async (req, res, u, p, q) => json(req, res, E.inboxItems(E.scope(u, q.project))));
route('GET', '/api/mywork', async (req, res, u) => json(req, res, E.myWork(u)));
route('GET', '/api/calendar', async (req, res, u, p, q) => {
  const set = E.scope(u, q.project), t = E.today(), horizon = E.addDays(t, Number(q.days || 90)), out = [];
  for (const [entity, def] of Object.entries(S.ENTITIES)) {
    if (entity === 'projects') continue;
    for (const r of D.records.all(entity)) {
      if (!set.has(r.project_id)) continue;
      const d = E.decorate(entity, r);
      if (d._c.due && d._c.due <= horizon) out.push({ entity, id: r.id, code: r.code, project_id: r.project_id, title: r[def.title], status: def.status ? r[def.status] : '', due: d._c.due, overdue: d._c.overdue, kind: entity === 'approvals' && r.status === 'Granted' ? 'Expiry' : 'Due' });
    }
  }
  json(req, res, out.sort((a, b) => a.due.localeCompare(b.due)));
});
route('GET', '/api/scurve/:id', async (req, res, u, p) => {
  if (!E.projectIds(u).has(p.id)) throw new E.RuleError('No access', 403);
  const acts = D.records.all('activities').filter(a => a.project_id === p.id);
  const reps = D.records.all('site_reports').filter(r => r.project_id === p.id).sort((a, b) => a.week_ending.localeCompare(b.week_ending));
  if (!acts.length) return json(req, res, { planned: [], actual: [] });
  const start = acts.reduce((m, a) => a.base_start && a.base_start < m ? a.base_start : m, '9999');
  const end = acts.reduce((m, a) => (a.fc_finish || a.base_finish) > m ? (a.fc_finish || a.base_finish) : m, '');
  const planned = [];
  for (let d = start; d <= end; d = E.addDays(d, 14)) planned.push({ date: d, value: E.scheduleOf(acts, d).planned });
  planned.push({ date: end, value: E.scheduleOf(acts, end).planned });
  const actual = reps.map(r => ({ date: r.week_ending, value: r.actual_pct }));
  const now = E.scheduleOf(acts); actual.push({ date: E.today(), value: now.earned });
  json(req, res, { planned, actual, today: E.today() });
});
route('GET', '/api/search', async (req, res, u, p, q) => {
  const term = String(q.q || '').toLowerCase().trim(); if (term.length < 2) return json(req, res, []);
  const out = [];
  for (const [entity, def] of Object.entries(S.ENTITIES)) {
    if (!E.can(u, entity, 'r')) continue;
    for (const r of D.records.all(entity)) {
      if (!E.visible(u, entity, r)) continue;
      const hay = (r.code + ' ' + def.fields.filter(x => ['text', 'textarea', 'select'].includes(x.type)).map(x => r[x.k] || '').join(' ')).toLowerCase();
      if (hay.includes(term)) { out.push({ entity, id: r.id, code: r.code, title: r[def.title], status: def.status ? r[def.status] : '', project_id: r.project_id }); if (out.length >= 40) return json(req, res, out); }
    }
  }
  json(req, res, out);
});
route('GET', '/api/notifications', async (req, res, u) => json(req, res, D.notifications.forUser(u)));
route('POST', '/api/notifications/read', async (req, res, u) => { const b = await body(req); D.notifications.markRead(u, b.ids || []); json(req, res, { ok: true }); });
route('POST', '/api/projects/:id/apply-templates', async (req, res, u, p) => { need(u, 'approvals', 'c'); json(req, res, { created: E.applyTemplates(p.id, u) }); });
route('POST', '/api/sweep', async (req, res, u) => { adminOnly(u); json(req, res, { alerts: E.sweep() }); });
route('GET', '/api/audit', async (req, res, u, p, q) => { adminOnly(u); json(req, res, await D.audit.recent(Number(q.limit || 300), { user: q.user, entity: q.entity })); });

// admin: users, permissions, settings, templates
route('GET', '/api/admin/users', async (req, res, u) => { adminOnly(u); json(req, res, D.users.all().map(D.users.public)); });
route('POST', '/api/admin/users', async (req, res, u) => {
  adminOnly(u); const b = await body(req);
  if (!b.name || !b.email || !S.ROLES[b.role]) throw new E.RuleError('Name, email and a valid role are required', 400);
  if (D.users.byEmail(b.email)) throw new E.RuleError('A user with that email exists', 409);
  if (b.role === 'admin' && u.role !== 'admin') throw new E.RuleError('Only an administrator can create administrators', 403);
  const temp = b.password || ('Abs-' + crypto.randomBytes(4).toString('hex'));
  const nu = D.users.create({ ...b, password: temp, must_change: true });
  D.audit.log(u, 'users', { id: nu.id, code: nu.email }, 'create', { role: nu.role });
  json(req, res, { user: D.users.public(nu), temp_password: temp }, 201);
});
route('PUT', '/api/admin/users/:id', async (req, res, u, p) => {
  adminOnly(u); const b = await body(req); const cur = D.users.get(p.id);
  if (!cur) throw new E.RuleError('Not found', 404);
  if ((cur.role === 'admin' || b.role === 'admin') && u.role !== 'admin') throw new E.RuleError('Only an administrator can modify administrators', 403);
  if (p.id === u.id && b.active === false) throw new E.RuleError('You cannot deactivate yourself', 400);
  const patch = {}; for (const k of ['name', 'email', 'role', 'title', 'phone', 'active', 'projects']) if (k in b) patch[k] = b[k];
  let temp = null;
  if (b.reset_password) { temp = 'Abs-' + crypto.randomBytes(4).toString('hex'); patch.password = temp; patch.must_change = true; }
  const nu = D.users.update(p.id, patch);
  if (b.active === false || b.reset_password || b.role) D.sessions.destroyUser(p.id);
  D.audit.log(u, 'users', { id: nu.id, code: nu.email }, b.reset_password ? 'password-reset' : 'update', Object.fromEntries(Object.entries(patch).filter(([k]) => k !== 'password').map(([k, v]) => [k, [cur[k], v]])));
  json(req, res, { user: D.users.public(nu), temp_password: temp });
});
route('GET', '/api/admin/permissions', async (req, res, u) => { adminOnly(u); json(req, res, E.permissions()); });
route('PUT', '/api/admin/permissions', async (req, res, u) => {
  adminOnly(u); const b = await body(req); const clean = {};
  for (const r of Object.keys(S.ROLES)) { if (r === 'admin' || !b[r]) continue; clean[r] = {}; for (const e of Object.keys(S.ENTITIES)) clean[r][e] = String(b[r][e] || '').replace(/[^rcuda]/g, ''); }
  D.settings.set('permissions', clean); D.audit.log(u, 'settings', null, 'permissions', {}); json(req, res, E.permissions());
});
route('POST', '/api/admin/permissions/reset', async (req, res, u) => { adminOnly(u); D.settings.set('permissions', null); json(req, res, E.permissions()); });
route('PUT', '/api/admin/settings', async (req, res, u) => {
  adminOnly(u); const b = await body(req); const cur = D.settings.get('config', {});
  const allowed = Object.keys(S.DEFAULT_SETTINGS); const next = { ...cur };
  for (const k of allowed) if (k in b) next[k] = b[k];
  D.settings.set('config', next); D.audit.log(u, 'settings', null, 'config', b); E.sweep(); json(req, res, E.cfg());
});
route('GET', '/api/admin/templates', async (req, res, u) => json(req, res, D.settings.get('approval_templates', S.APPROVAL_TEMPLATES)));
route('PUT', '/api/admin/templates', async (req, res, u) => { adminOnly(u); const b = await body(req); D.settings.set('approval_templates', (b.templates || []).filter(t => t.title && t.authority)); json(req, res, { ok: true }); });

// reports (printable HTML)
route('GET', '/report/:kind', async (req, res, u, p, q) => send(req, res, 200, R.render(p.kind, u, q), 'text/html; charset=utf-8'));

// ---------- dispatcher ----------
async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const q = Object.fromEntries(url.searchParams);
  try {
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/report/')) {
      await D.sync(); housekeeping();
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = url.pathname.match(r.re); if (!m) continue;
        let u = null;
        if (!r.public) {
          u = D.sessions.user(cookies(req).abs_sid);
          if (!u) return url.pathname.startsWith('/report/') ? (res.writeHead(302, { Location: '/' }), res.end()) : fail(req, res, 401, 'Sign in required', 'AUTH');
          if (req.method !== 'GET' && req.headers['x-abs'] !== '1') return fail(req, res, 403, 'Bad request origin');
          if (u.must_change && !['/api/me/password', '/api/meta', '/api/logout'].includes(url.pathname)) return fail(req, res, 403, 'Password change required', 'MUST_CHANGE');
        }
        const params = Object.fromEntries(Object.entries(m.groups || {}).map(([k, v]) => [k, decodeURIComponent(v)]));
        if (params.entity && !S.ENTITIES[params.entity]) return fail(req, res, 404, 'Unknown register');
        return await r.handler(req, res, u, params, q);
      }
      return fail(req, res, 404, 'Not found');
    }
    if (req.method !== 'GET') return fail(req, res, 405, 'Method not allowed');
    if (serveStatic(req, res, url.pathname === '/' ? 'index.html' : url.pathname) === false) serveStatic(req, res, 'index.html');
  } catch (e) {
    if (!(e instanceof E.RuleError)) console.error(e);
    await fail(req, res, e.status || 500, e instanceof E.RuleError ? e.message : 'Server error: ' + e.message, e.code);
  }
}

module.exports = { boot, handle };
