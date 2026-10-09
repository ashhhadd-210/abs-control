/* ABS Control — single-page client. No build step; talks to /api. */
(() => {
'use strict';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = $('#app');
const state = { meta: null, project: localStorage.getItem('abs_project') || 'all', notifs: [], cache: new Map(), view: null };
const SEV = { critical: 'R', serious: 'S', warning: 'A' };
const PHASE_SHORT = p => (p || '').split(' — ')[0];
const ICONS = { dashboard: '◈', projects: '▦', approvals: '✓', deficiencies: '⚠', correspondence: '✉', fees: '₨', activities: '▤', site_reports: '◔', delays: '◷', risks: '◬', budget_lines: '▥', contracts: '§', payment_apps: '¤', changes: '↻', inspections: '◎', ncrs: '✗', safety: '☗', snags: '⌂', closeout: '⚑', documents: '▣', transmittals: '➤', meetings: '◉', actions: '☑', gates: '⛩', mywork: '★', inbox: '✦', calendar: '▧', reports: '▤', admin: '⚙', notifications: '◍' };

// ---------- utils ----------
const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtDT = d => d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const money = n => n == null || n === '' ? '—' : 'PKR ' + (Math.abs(n) >= 1e9 ? (n / 1e9).toFixed(2) + ' B' : Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(1) + ' M' : Math.round(n).toLocaleString());
const num = n => n == null || n === '' ? '—' : Number(n).toLocaleString();
const userName = id => state.meta?.users.find(u => u.id === id)?.name || (id ? '—' : '');
const projName = id => state.meta?.projects.find(p => p.id === id)?.name || '';
const def = e => state.meta.entities[e];
const canI = (e, l) => (state.meta.myPerms[e] || '').includes(l);
const isAdmin = () => ['admin', 'ceo'].includes(state.meta.me.role);
const ragClass = v => v || 'N';
const RAGL = { G: 'On track', A: 'At risk', R: 'Off track', N: 'No data', S: 'Serious' };
const chip = (v, label) => `<span class="chip ${ragClass(v)}"><i></i>${esc(label || RAGL[v] || v)}</span>`;
const statusCls = s => /granted|closed|done|completed|verified|paid|approved|pass|implemented|active|awarded/i.test(s) ? 'ok' : /reject|expired|fail|critical|open|plan due|not started|identified/i.test(s) ? 'bad' : /observation|submitted|review|pending|preparing|proposed|tender|evaluation|hold|due|draft|conditional|mitigating/i.test(s) ? 'warn' : 'info';
const statusTag = s => s ? `<span class="status ${statusCls(s)}">${esc(s)}</span>` : '';
const initials = n => (n || '?').split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase();
const toast = (msg, kind = '') => { const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg; $('#toasts').appendChild(t); setTimeout(() => t.remove(), kind === 'err' ? 7000 : 3500); };
const go = h => { location.hash = h; };
const qs = () => { const [path, q] = location.hash.slice(1).split('?'); return { path: path || '/dashboard', q: Object.fromEntries(new URLSearchParams(q || '')) }; };
const projQ = () => state.project === 'all' ? '' : `&project=${state.project}`;

async function api(method, path, body) {
  const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json', 'X-ABS': '1' }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch { data = {}; }
  if (r.status === 401) { state.meta = null; renderLogin(); throw new Error('Signed out'); }
  if (!r.ok) { const e = new Error(data.error || r.statusText); e.code = data.code; e.status = r.status; if (data.code === 'MUST_CHANGE') passwordModal(true); throw e; }
  return data;
}
const get = (p) => api('GET', p);

// ---------- boot ----------
async function boot() {
  try { state.meta = await get('/api/meta'); } catch { return renderLogin(); }
  if (state.meta.me.must_change) passwordModal(true);
  if (state.project !== 'all' && !state.meta.projects.some(p => p.id === state.project)) state.project = 'all';
  renderShell(); route();
  refreshNotifs(); setInterval(refreshNotifs, 60000);
}
window.addEventListener('hashchange', route);

// ---------- login ----------
function renderLogin() {
  app.innerHTML = `<div class="auth"><form class="auth-card" id="login">
    <div class="brand"><img src="/logo.png" alt="ABS Developers"><div class="sys">ABS Control</div><div class="sub">Approvals · Projects · Governance</div></div>
    <div id="lerr"></div>
    <div class="field" style="margin-bottom:10px"><label>Email</label><input name="email" type="email" autocomplete="username" required autofocus></div>
    <div class="field" style="margin-bottom:18px"><label>Password</label><input name="password" type="password" autocomplete="current-password" required></div>
    <button class="btn primary" style="width:100%;justify-content:center;padding:11px">Sign in</button>
    <div class="demo" id="demo-hint"></div>
  </form></div>`;
  fetch('/api/meta').then(() => {}).catch(() => {});
  $('#demo-hint').innerHTML = `<b>Demo accounts</b> (password <code data-pw>abs12345</code>):<br>
    <code data-e="ceo@abs.pk">ceo@abs.pk</code> CEO · <code data-e="fahim@abs.pk">fahim@abs.pk</code> Chief Coordinator · <code data-e="ayesha@abs.pk">ayesha@abs.pk</code> PM · <code data-e="ali@abs.pk">ali@abs.pk</code> Site Engineer · <code data-e="hamza@abs.pk">hamza@abs.pk</code> QA/QC · <code data-e="admin@abs.pk">admin@abs.pk</code> Admin (<code>admin12345</code>)`;
  $$('#demo-hint code[data-e]').forEach(c => c.onclick = () => { $('#login [name=email]').value = c.dataset.e; $('#login [name=password]').value = c.dataset.e === 'admin@abs.pk' ? 'admin12345' : 'abs12345'; });
  $('#login').onsubmit = async e => {
    e.preventDefault(); const f = e.target;
    try { await api('POST', '/api/login', { email: f.email.value, password: f.password.value }); boot(); }
    catch (err) { $('#lerr').innerHTML = `<div class="err">${esc(err.message)}</div>`; }
  };
}

// ---------- shell ----------
function renderShell() {
  const m = state.meta;
  const groups = m.groups.map(g => `<div class="grp">${esc(g.label)}</div>` + Object.entries(m.entities).filter(([k, d]) => d.group === g.key && canI(k, 'r')).map(([k, d]) => `<a href="#/r/${k}" data-nav="/r/${k}"><span class="ico">${ICONS[k] || '•'}</span>${esc(d.plural)}</a>`).join('')).join('');
  app.innerHTML = `<div class="shell">
    <aside class="sidebar" id="sidebar">
      <div class="logo"><img src="/logo.png" alt="ABS Developers"><div class="sys">ABS Control</div><div class="sub">Management framework engine</div></div>
      <nav class="nav">
        <a href="#/dashboard" data-nav="/dashboard"><span class="ico">${ICONS.dashboard}</span>Dashboard</a>
        <a href="#/mywork" data-nav="/mywork"><span class="ico">${ICONS.mywork}</span>My work<span class="cnt" id="cnt-work"></span></a>
        ${['ceo', 'admin', 'chief_coord', 'pm'].includes(m.me.role) ? `<a href="#/inbox" data-nav="/inbox"><span class="ico">${ICONS.inbox}</span>Decisions inbox<span class="cnt hot" id="cnt-inbox"></span></a>` : ''}
        <a href="#/calendar" data-nav="/calendar"><span class="ico">${ICONS.calendar}</span>Deadlines</a>
        <a href="#/reports" data-nav="/reports"><span class="ico">${ICONS.reports}</span>Reports</a>
        ${groups}
        ${isAdmin() ? `<div class="grp">Administration</div><a href="#/admin/users" data-nav="/admin"><span class="ico">${ICONS.admin}</span>Admin & settings</a>` : ''}
      </nav>
      <div class="foot">${esc(m.config.org_name)} · as of ${fmtDate(m.today)}</div>
    </aside>
    <div class="scrim hidden" id="scrim"></div>
    <div class="main">
      <div class="topbar">
        <button class="iconbtn burger" id="burger">☰</button>
        <div class="crumb" id="crumb"></div>
        <div class="spacer"></div>
        <select class="proj-select" id="proj"><option value="all">All projects</option>${m.projects.map(p => `<option value="${p.id}" ${p.id === state.project ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
        <div class="search"><span class="ico">⌕</span><input id="q" placeholder="Search code, title, authority…" autocomplete="off"><div class="search-pop hidden" id="qpop"></div></div>
        <button class="iconbtn" id="theme" title="Toggle theme">◐</button>
        <button class="iconbtn" id="bell" title="Alerts">◍<span class="dot hidden" id="bell-n"></span></button>
        <div class="avatar" id="me" title="${esc(m.me.name)} — ${esc(m.roles[m.me.role].label)}">${initials(m.me.name)}</div>
      </div>
      <div class="content" id="content"></div>
    </div></div>`;
  $('#proj').onchange = e => { state.project = e.target.value; localStorage.setItem('abs_project', state.project); state.cache.clear(); route(); };
  $('#burger').onclick = () => { $('#sidebar').classList.toggle('open'); $('#scrim').classList.toggle('hidden'); };
  $('#scrim').onclick = () => { $('#sidebar').classList.remove('open'); $('#scrim').classList.add('hidden'); };
  $('#theme').onclick = () => { const cur = document.documentElement.dataset.theme; const next = cur === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = next; try { localStorage.setItem('abs_theme', next); } catch {} };
  $('#bell').onclick = () => go('/notifications');
  $('#me').onclick = () => profileMenu();
  let qt; $('#q').oninput = e => { clearTimeout(qt); const v = e.target.value.trim(); if (v.length < 2) return $('#qpop').classList.add('hidden'); qt = setTimeout(async () => {
    const r = await get('/api/search?q=' + encodeURIComponent(v));
    $('#qpop').innerHTML = r.length ? r.map(x => `<a href="#/r/${x.entity}/${x.id}"><span class="code">${esc(x.code)}</span><span style="flex:1">${esc(x.title)}</span><span class="muted small">${esc(def(x.entity).label)}${x.project_id ? ' · ' + esc(projName(x.project_id)) : ''}</span></a>`).join('') : '<div class="empty">No matches</div>';
    $('#qpop').classList.remove('hidden');
  }, 180); };
  document.addEventListener('click', e => { if (!e.target.closest('.search')) $('#qpop')?.classList.add('hidden'); });
  $('#q').addEventListener('keydown', e => { if (e.key === 'Escape') { e.target.value = ''; $('#qpop').classList.add('hidden'); } });
}
function setNav(path) {
  $$('[data-nav]').forEach(a => a.classList.toggle('active', path === a.dataset.nav || (a.dataset.nav !== '/dashboard' && path.startsWith(a.dataset.nav))));
  $('#sidebar')?.classList.remove('open'); $('#scrim')?.classList.add('hidden');
}
async function refreshNotifs() {
  try {
    state.notifs = await get('/api/notifications');
    const unread = state.notifs.filter(n => !n.read).length;
    const b = $('#bell-n'); if (b) { b.textContent = unread; b.classList.toggle('hidden', !unread); }
    const w = await get('/api/mywork'); const cw = $('#cnt-work'); if (cw) cw.textContent = w.length || '';
    if ($('#cnt-inbox')) { const ib = await get('/api/inbox'); $('#cnt-inbox').textContent = ib.length || ''; $('#cnt-inbox').classList.toggle('hidden', !ib.length); }
  } catch {}
}
function profileMenu() {
  const m = state.meta.me;
  modal(`<div class="drawer-head"><div><div class="eyebrow">Signed in</div><h2>${esc(m.name)}</h2><div class="muted small">${esc(state.meta.roles[m.role].label)} · ${esc(m.email)}</div></div><button class="btn ghost" data-close>✕</button></div>
    <div class="drawer-body"><div class="kv"><div><div class="k">Role</div><div class="v">${esc(state.meta.roles[m.role].label)}</div></div><div><div class="k">Project access</div><div class="v">${m.projects?.length ? m.projects.map(projName).filter(Boolean).join(', ') : 'All projects'}</div></div><div><div class="k">Last login</div><div class="v">${fmtDT(m.last_login)}</div></div></div>
    <h3 style="margin-top:20px">Your permissions</h3><div class="small muted" style="margin-bottom:8px">r = read · c = create · u = update · d = delete · a = approve</div>
    <div class="kv">${Object.entries(state.meta.entities).map(([k, d]) => `<div><div class="k">${esc(d.plural)}</div><div class="v mono">${esc(state.meta.myPerms[k] || '—')}</div></div>`).join('')}</div></div>
    <div class="drawer-foot"><button class="btn" id="pw">Change password</button><button class="btn danger" id="logout">Sign out</button></div>`);
  $('#pw').onclick = () => passwordModal(false);
  $('#logout').onclick = async () => { await api('POST', '/api/logout'); location.hash = ''; state.meta = null; renderLogin(); };
}
function passwordModal(forced) {
  modal(`<div class="drawer-head"><div><div class="eyebrow">Security</div><h2>${forced ? 'Set a new password' : 'Change password'}</h2>${forced ? '<div class="muted small">Your account uses a temporary password. Choose a new one to continue.</div>' : ''}</div>${forced ? '' : '<button class="btn ghost" data-close>✕</button>'}</div>
    <form class="drawer-body" id="pwf"><div id="pwerr"></div><div class="fgrid"><div class="field wide"><label>Current password</label><input type="password" name="current" required autocomplete="current-password"></div><div class="field wide"><label>New password (min 8 characters)</label><input type="password" name="next" required minlength="8" autocomplete="new-password"></div><div class="field wide"><label>Confirm new password</label><input type="password" name="confirm" required></div></div>
    <div style="margin-top:16px"><button class="btn primary">Save password</button></div></form>`, forced);
  $('#pwf').onsubmit = async e => { e.preventDefault(); const f = e.target; if (f.next.value !== f.confirm.value) return $('#pwerr').innerHTML = '<div class="err">Passwords do not match</div>';
    try { await api('POST', '/api/me/password', { current: f.current.value, next: f.next.value }); toast('Password updated', 'ok'); closeModal(); state.meta.me.must_change = false; if (forced) boot(); } catch (err) { $('#pwerr').innerHTML = `<div class="err">${esc(err.message)}</div>`; } };
}
function modal(html, sticky = false) {
  closeModal();
  const o = document.createElement('div'); o.className = 'overlay'; o.id = 'overlay'; o.innerHTML = `<div class="drawer">${html}</div>`;
  document.body.appendChild(o);
  if (!sticky) { o.addEventListener('click', e => { if (e.target === o) closeModal(); }); $$('[data-close]', o).forEach(b => b.onclick = closeModal); }
  document.body.style.overflow = 'hidden';
}
function closeModal() { $('#overlay')?.remove(); document.body.style.overflow = ''; }
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#overlay') && !$('#pwf')) closeModal(); });

// ---------- router ----------
async function route() {
  if (!state.meta) return;
  const { path, q } = qs();
  setNav(path);
  const c = $('#content'); c.innerHTML = '<div class="empty">Loading…</div>';
  try {
    const seg = path.split('/').filter(Boolean);
    if (seg[0] === 'dashboard' || !seg.length) await viewDashboard();
    else if (seg[0] === 'project' && seg[1]) await viewProject(seg[1], q);
    else if (seg[0] === 'r' && seg[1] === 'projects' && seg[2]) await viewProject(seg[2], q);
    else if (seg[0] === 'r' && seg[2]) await viewRecord(seg[1], seg[2]);
    else if (seg[0] === 'r' && seg[1]) await viewRegister(seg[1], q);
    else if (seg[0] === 'mywork') await viewMyWork();
    else if (seg[0] === 'inbox') await viewInbox();
    else if (seg[0] === 'calendar') await viewCalendar();
    else if (seg[0] === 'reports') viewReports();
    else if (seg[0] === 'notifications') await viewNotifications();
    else if (seg[0] === 'admin') await viewAdmin(seg[1] || 'users');
    else c.innerHTML = '<div class="empty">Page not found</div>';
  } catch (e) { if (e.message !== 'Signed out') c.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  window.scrollTo(0, 0);
}
const crumb = t => { $('#crumb').textContent = t; document.title = t + ' · ABS Control'; };

// ---------- dashboard ----------
async function viewDashboard() {
  crumb('Dashboard');
  const [pf, inbox, cal, notifs] = await Promise.all([get('/api/portfolio?x=1' + projQ()), get('/api/inbox?x=1' + projQ()), get('/api/calendar?days=7' + projQ()), get('/api/notifications')]);
  state.notifs = notifs;
  const P = pf.projects;
  const sumA = P.reduce((s, m) => ({ g: s.g + m.approvals.granted, t: s.t + m.approvals.total, o: s.o + m.approvals.overdue, e: s.e + m.approvals.expiring + m.approvals.expired }), { g: 0, t: 0, o: 0, e: 0 });
  const delays = P.reduce((s, m) => s + m.delays.open, 0), planOver = P.reduce((s, m) => s + m.delays.plan_overdue, 0);
  const unauth = P.reduce((s, m) => s + m.unauthorized30, 0);
  const k8 = pf.kpis.filter(k => k.sec === '§8'), k17 = pf.kpis.filter(k => k.sec === '§17');
  const alerts = notifs.slice(0, 8);
  const dueSoon = cal.filter(x => x.due >= pf.today.slice(0, 10) || x.overdue && x.due >= new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10));
  $('#content').innerHTML = `
    <div class="page-head"><div><div class="eyebrow">${esc(state.meta.config.org_name)} · Management framework</div><h1>${state.project === 'all' ? 'Portfolio command centre' : esc(projName(state.project))}</h1><p>Live from every register. Red/Amber/Green is computed by the engine against the framework's thresholds — nothing here is typed in by hand.</p></div>
    <div class="actions"><a class="btn" href="/report/weekly?project=${state.project}" target="_blank">Weekly dashboard</a><a class="btn primary" href="/report/monthly?project=${state.project}" target="_blank">Monthly CEO report</a></div></div>
    <div class="tiles">
      <div class="tile ${P.some(m => m.rag.overall === 'R') ? 'R' : P.some(m => m.rag.overall === 'A') ? 'A' : 'G'}"><div class="v">${P.length}</div><div class="l">Active projects</div><div class="s">${P.filter(m => m.rag.overall === 'R').length} off track · ${P.filter(m => m.rag.overall === 'A').length} at risk</div></div>
      <div class="tile ${sumA.o ? 'A' : 'G'}"><div class="v">${sumA.g}<span class="muted" style="font-size:16px">/${sumA.t}</span></div><div class="l">Approvals granted</div><div class="s"><a href="#/r/approvals">${sumA.o} past target decision · ${sumA.e} expiring/expired</a></div></div>
      <div class="tile ${planOver ? 'R' : delays ? 'A' : 'G'}"><div class="v">${delays}</div><div class="l">Open delays</div><div class="s"><a href="#/r/delays">${planOver} recovery plans overdue</a></div></div>
      <div class="tile ${inbox.length > 3 ? 'R' : inbox.length ? 'A' : 'G'}"><div class="v">${inbox.length}</div><div class="l">Decisions required</div><div class="s"><a href="#/inbox">CEO / delegated approvals</a></div></div>
      <div class="tile ${unauth ? 'R' : 'G'}"><div class="v">${unauth}</div><div class="l">Unauthorized-work attempts</div><div class="s">blocked by §5 in last 30 days</div></div>
    </div>
    <div class="grid g-2-1">
      <div class="card"><div class="card-head"><h2>Portfolio RAG</h2><span class="small muted">Approvals · Schedule · Cost · Quality · Safety · Decisions</span></div>
        <div class="tbl-wrap" style="box-shadow:none"><table class="tbl"><thead><tr><th>Project</th><th>Phase</th><th>Progress</th><th>Status</th><th>Forecast</th><th>Approvals</th></tr></thead><tbody>
        ${P.map(m => `<tr onclick="location.hash='#/project/${m.id}'"><td><div class="tt">${esc(m.name)}</div><div class="code">${esc(m.code)} · ${esc(userName(m.pm))}</div></td><td>${esc(PHASE_SHORT(m.phase))}</td>
          <td style="min-width:130px"><div class="bar"><i class="${m.rag.schedule}" style="width:${m.schedule.earned}%"></i><i class="plan" style="width:${m.schedule.planned}%"></i></div><div class="small muted">${m.schedule.earned}% vs ${m.schedule.planned}% plan · SPI ${m.schedule.spi}</div></td>
          <td><span class="rag-dots" title="Approvals ${RAGL[m.rag.approvals]} · Schedule ${RAGL[m.rag.schedule]} · Cost ${RAGL[m.rag.cost]} · Quality ${RAGL[m.rag.quality]} · Safety ${RAGL[m.rag.safety]} · Decisions ${RAGL[m.rag.decisions]}">${['approvals', 'schedule', 'cost', 'quality', 'safety', 'decisions'].map(k => `<i class="${m.rag[k]}"></i>`).join('')}</span> ${chip(m.rag.overall)}</td>
          <td>${fmtDate(m.forecast_completion)}<div class="small ${m.variance_days > 0 ? 'muted' : 'muted'}">${m.variance_days > 0 ? '+' + m.variance_days + ' d' : 'on baseline'}</div></td>
          <td>${m.approvals.granted}/${m.approvals.total}${m.approvals.overdue ? ` <span class="status bad">${m.approvals.overdue} late</span>` : ''}${m.approvals.rejected ? ` <span class="status bad">rejected</span>` : ''}</td></tr>`).join('')}
        ${P.length ? '' : '<tr><td colspan="6" class="empty">No projects in scope</td></tr>'}</tbody></table></div></div>
      <div class="card"><div class="card-head"><h2>Needs attention</h2><a href="#/notifications" class="small">All alerts</a></div>
        ${alerts.length ? alerts.map(alertRow).join('') : '<div class="empty">No open alerts</div>'}
        <h3 style="margin-top:16px">Due in the next 7 days</h3>
        ${dueSoon.length ? dueSoon.slice(0, 8).map(x => `<div class="rel" onclick="location.hash='#/r/${x.entity}/${x.id}'"><span>${x.overdue ? '<span class="status bad">overdue</span> ' : ''}${esc(x.title)}<span class="muted small"> · ${esc(def(x.entity).label)}</span></span><span class="muted small mono">${fmtDate(x.due)}</span></div>`).join('') : '<div class="muted small">Nothing due this week.</div>'}
      </div>
    </div>
    <div class="grid g2" style="margin-top:16px">
      <div class="card"><div class="card-head"><h2>KPIs — §8 Approvals & coordination</h2></div><div class="grid g2" style="gap:8px">${k8.map(kpiCard).join('')}</div></div>
      <div class="card"><div class="card-head"><h2>KPIs — §17 Project management</h2></div><div class="grid g2" style="gap:8px">${k17.map(kpiCard).join('')}</div></div>
    </div>
    ${inbox.length ? `<div class="card" style="margin-top:16px"><div class="card-head"><h2>Decisions required</h2><a href="#/inbox" class="small">Open inbox</a></div>${inbox.slice(0, 6).map(inboxRow).join('')}</div>` : ''}`;
}
const kpiCard = k => `<div class="kpi ${k.status}" title="${esc(k.basis)}"><div class="n">${k.value == null ? '—' : k.value}${k.value != null && k.unit === '%' ? '<span style="font-size:13px">%</span>' : ''}</div><div class="l">${esc(k.label)}</div><div class="b">${esc(k.n)}${k.unit && k.unit !== '%' ? ' · ' + esc(k.unit) : ''}</div></div>`;
const alertRow = n => `<div class="alert ${n.read ? '' : 'unread'}" onclick="location.hash='#/r/${n.entity}/${n.record_id}'"><span class="sev ${n.severity}"></span><div><div class="t">${esc(n.title)}</div><div class="b">${esc(n.body)}${n.project_id ? ' · ' + esc(projName(n.project_id)) : ''}</div></div></div>`;
const inboxRow = i => `<div class="rel" onclick="location.hash='#/r/${i.entity}/${i.id}'"><span>${chip(SEV[i.severity], i.severity)} <b>${esc(i.code)}</b> ${esc(i.title)}<div class="small muted">${esc(i.reason)} · ${esc(projName(i.project_id))}</div></span><span class="muted small">→</span></div>`;

// ---------- project ----------
async function viewProject(id, q) {
  const r = await get(`/api/r/projects/${id}`);
  const p = r.record, m = r.metrics;
  crumb(p.name);
  const [acts, aps, sc, gates, risks, budget] = await Promise.all([get(`/api/r/activities?project=${id}`), get(`/api/r/approvals?project=${id}`), get(`/api/scurve/${id}`), get(`/api/r/gates?project=${id}`), get(`/api/r/risks?project=${id}`), get(`/api/r/budget_lines?project=${id}`)]);
  const gate = gates.find(g => g.phase === p.phase && g.status !== 'Approved') || gates.find(g => g.phase === p.phase);
  const phases = state.meta.phases; const pi = phases.indexOf(p.phase);
  const apCounts = {}; for (const a of aps) apCounts[a.status] = (apCounts[a.status] || 0) + 1;
  const apOrder = ['Not Started', 'Preparing', 'Submitted', 'Observations', 'Resubmitted', 'Granted', 'Rejected', 'Expired'];
  const tab = q.tab || 'overview';
  const tabs = [['overview', 'Overview'], ['approvals', 'Approvals'], ['schedule', 'Schedule'], ['gate', 'Phase gate'], ['commercial', 'Commercial'], ['quality', 'Quality & safety'], ['records', 'Records'], ['details', 'Details & history']];
  $('#content').innerHTML = `
    <div class="page-head"><div><div class="eyebrow">${esc(p.code)} · ${esc(p.type || '')} · ${esc(p.location || '')}</div><h1>${esc(p.name)}</h1>
      <div class="actions" style="margin-top:8px">${chip(m.rag.overall, 'Overall ' + RAGL[m.rag.overall])}${['approvals', 'schedule', 'cost', 'quality', 'safety', 'decisions'].map(k => chip(m.rag[k], k[0].toUpperCase() + k.slice(1))).join('')}${p.baseline_locked ? '<span class="chip">🔒 Baseline locked</span>' : '<span class="chip">Baseline open</span>'}</div></div>
      <div class="actions">${canI('projects', 'u') ? `<button class="btn" id="edit-p">Edit project</button>` : ''}<a class="btn" href="/report/project?project=${id}" target="_blank">Project report</a><a class="btn primary" href="/report/monthly?project=${id}" target="_blank">Monthly report</a></div></div>
    <div class="stepper">${phases.map((ph, i) => `<span class="${i < pi ? 'done' : i === pi ? 'cur' : ''}">${i < pi ? '✓ ' : ''}${esc(ph)}</span>`).join('')}</div>
    <div class="tabs">${tabs.map(([k, l]) => `<a href="#/project/${id}?tab=${k}" class="${tab === k ? 'on' : ''}">${l}</a>`).join('')}</div>
    <div id="ptab"></div>`;
  $('#edit-p')?.addEventListener('click', () => recordForm('projects', p, () => route()));
  const T = $('#ptab');
  if (tab === 'overview') {
    T.innerHTML = `<div class="tiles">
      <div class="tile ${m.rag.schedule}"><div class="v">${m.schedule.earned}%</div><div class="l">Earned progress</div><div class="s">plan ${m.schedule.planned}% · SPI ${m.schedule.spi}</div></div>
      <div class="tile ${m.rag.approvals}"><div class="v">${m.approvals.granted}/${m.approvals.total}</div><div class="l">Approvals granted</div><div class="s">${m.approvals.pending} pending · ${m.approvals.overdue} late</div></div>
      <div class="tile ${m.rag.cost}"><div class="v">${(m.cost.ratio * 100 - 100).toFixed(1)}%</div><div class="l">Forecast vs budget</div><div class="s">${money(m.cost.forecast)} / ${money(m.cost.budget)}</div></div>
      <div class="tile ${m.variance_days > 30 ? 'R' : m.variance_days > 0 ? 'A' : 'G'}"><div class="v">${m.variance_days > 0 ? '+' : ''}${m.variance_days} d</div><div class="l">Completion variance</div><div class="s">forecast ${fmtDate(m.forecast_completion)}</div></div>
      <div class="tile ${m.rag.decisions}"><div class="v">${m.ceo_pending}</div><div class="l">Decisions pending</div><div class="s">${m.risks.ceo} risks escalated</div></div></div>
      <div class="grid g-2-1">
        <div class="card"><div class="card-head"><h2>S-curve — planned vs actual</h2><span class="small muted">weighted earned progress</span></div>${scurve(sc)}</div>
        <div class="card"><div class="card-head"><h2>Approvals pipeline</h2><a class="small" href="#/project/${id}?tab=approvals">Open</a></div>${apOrder.filter(s => apCounts[s]).map(s => `<div class="hbar"><span>${esc(s)}</span><div class="bar"><i class="${s === 'Granted' ? 'G' : /Rejected|Expired/.test(s) ? 'R' : ''}" style="width:${apCounts[s] / aps.length * 100}%"></i></div><span class="n">${apCounts[s]}</span></div>`).join('') || '<div class="empty">No approvals yet</div>'}
          <h3 style="margin-top:18px">Risk heat map</h3>${heat(risks)}</div></div>
      <div class="grid g2" style="margin-top:16px">
        <div class="card"><div class="card-head"><h2>Phase gate — ${esc(PHASE_SHORT(p.phase))}</h2><a class="small" href="#/project/${id}?tab=gate">Manage</a></div>${gate ? `<div class="bar" style="margin-bottom:8px"><i class="G" style="width:${(gate.checklist || []).filter(c => c.done).length / Math.max(1, (gate.checklist || []).length) * 100}%"></i></div><div class="small muted">${(gate.checklist || []).filter(c => c.done).length}/${(gate.checklist || []).length} checklist items · ${statusTag(gate.status)}</div>` : '<div class="empty">No gate record</div>'}</div>
        <div class="card"><div class="card-head"><h2>Budget by category</h2><a class="small" href="#/project/${id}?tab=commercial">Open</a></div>${budgetBars(budget)}</div></div>`;
  } else if (tab === 'approvals') T.innerHTML = `<div id="reg"></div>`, registerInto($('#reg'), 'approvals', { project: id }, { templates: true });
  else if (tab === 'schedule') { T.innerHTML = `<div class="card" style="margin-bottom:16px"><div class="card-head"><h2>Programme — Gantt</h2><span class="small muted">◆ critical path · bar = baseline, overlay = forecast/actual</span></div>${gantt(acts, sc.today)}</div><div id="reg"></div>`; registerInto($('#reg'), 'activities', { project: id }); }
  else if (tab === 'gate') gateView(T, p, gates);
  else if (tab === 'commercial') { T.innerHTML = `<div class="grid g2" style="margin-bottom:16px"><div class="card"><h2>Budget & cost</h2>${budgetBars(budget)}</div><div class="card"><h2>Cost summary</h2><div class="kv"><div><div class="k">Approved budget</div><div class="v">${money(m.cost.budget)}</div></div><div><div class="k">Committed</div><div class="v">${money(m.cost.committed)}</div></div><div><div class="k">Actual to date</div><div class="v">${money(m.cost.actual)}</div></div><div><div class="k">Forecast final</div><div class="v">${money(m.cost.forecast)}</div></div><div><div class="k">Approved changes</div><div class="v">${money(m.changes.approved_value)}</div></div><div><div class="k">Pending changes</div><div class="v">${m.changes.pending}</div></div></div></div></div><div class="tabs">${['budget_lines', 'contracts', 'payment_apps', 'changes'].map(e => `<a href="#/project/${id}?tab=commercial&sub=${e}" class="${(q.sub || 'budget_lines') === e ? 'on' : ''}">${esc(def(e).plural)}</a>`).join('')}</div><div id="reg"></div>`; registerInto($('#reg'), q.sub || 'budget_lines', { project: id }); }
  else if (tab === 'quality') { T.innerHTML = `<div class="tabs">${['ncrs', 'inspections', 'safety', 'snags', 'closeout'].map(e => `<a href="#/project/${id}?tab=quality&sub=${e}" class="${(q.sub || 'ncrs') === e ? 'on' : ''}">${esc(def(e).plural)}</a>`).join('')}</div><div id="reg"></div>`; registerInto($('#reg'), q.sub || 'ncrs', { project: id }); }
  else if (tab === 'records') { T.innerHTML = `<div class="tabs">${['documents', 'correspondence', 'fees', 'deficiencies', 'transmittals', 'meetings', 'actions', 'delays', 'risks', 'site_reports'].map(e => `<a href="#/project/${id}?tab=records&sub=${e}" class="${(q.sub || 'documents') === e ? 'on' : ''}">${esc(def(e).plural)}</a>`).join('')}</div><div id="reg"></div>`; registerInto($('#reg'), q.sub || 'documents', { project: id }); }
  else if (tab === 'details') T.innerHTML = `<div class="grid g-2-1"><div class="card"><h2>Project details</h2>${kvFields('projects', p)}</div><div class="card"><h2>History</h2>${timeline(r.history)}</div></div>`;
}

function gateView(T, p, gates) {
  const cur = gates.filter(g => g.phase === p.phase).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const canApprove = ['ceo', 'admin'].includes(state.meta.me.role);
  T.innerHTML = `<div class="grid g-2-1"><div class="card"><div class="card-head"><h2>Gate: ${esc(p.phase)}</h2>${cur ? statusTag(cur.status) : ''}</div>
    <div class="help">§14: the project advances to the next phase only when every checklist item is complete, the gate is submitted, and the CEO approves it in the system. Approval automatically moves the project forward and opens the next gate.</div>
    ${cur ? `<ul class="checklist" id="gcl">${(cur.checklist || []).map((c, i) => `<li><input type="checkbox" data-i="${i}" ${c.done ? 'checked' : ''} ${cur.status === 'Approved' || !canI('gates', 'u') ? 'disabled' : ''}><span>${esc(c.item)}</span></li>`).join('')}</ul>
    <div class="actions" style="margin-top:14px">
      ${cur.status === 'Open' || cur.status === 'Rejected' ? `<button class="btn" id="g-save">Save checklist</button><button class="btn primary" id="g-submit">Submit for CEO approval</button>` : ''}
      ${cur.status === 'Submitted' && canApprove ? `<button class="btn primary" id="g-approve">Approve gate → advance phase</button><button class="btn danger" id="g-reject">Reject</button>` : ''}
      ${cur.status === 'Submitted' && !canApprove ? '<span class="muted small">Awaiting CEO decision.</span>' : ''}
      ${cur.status === 'Approved' ? `<span class="muted small">Approved by ${esc(userName(cur.approved_by))} on ${fmtDate(cur.decided_on)}.</span>` : ''}
    </div>${cur.remarks ? `<div class="notice A" style="margin-top:12px"><b>Remarks:</b> ${esc(cur.remarks)}</div>` : ''}` : '<div class="empty">No gate record for this phase.</div>'}</div>
    <div class="card"><h2>Gate history</h2>${gates.sort((a, b) => b.created_at.localeCompare(a.created_at)).map(g => `<div class="rel" onclick="location.hash='#/r/gates/${g.id}'"><span>${esc(g.phase)}</span>${statusTag(g.status)}</div>`).join('') || '<div class="empty">—</div>'}</div></div>`;
  if (!cur) return;
  const checklist = () => (cur.checklist || []).map((c, i) => ({ item: c.item, done: $(`#gcl [data-i="${i}"]`).checked }));
  const act = async (patch, msg) => { try { await api('PUT', `/api/r/gates/${cur.id}`, patch); toast(msg, 'ok'); route(); } catch (e) { toast(e.message, 'err'); } };
  $('#g-save')?.addEventListener('click', () => act({ checklist: checklist() }, 'Checklist saved'));
  $('#g-submit')?.addEventListener('click', () => act({ checklist: checklist(), status: 'Submitted' }, 'Gate submitted to CEO'));
  $('#g-approve')?.addEventListener('click', () => { if (confirm(`Approve the ${PHASE_SHORT(p.phase)} gate and advance ${p.name} to the next phase?`)) act({ status: 'Approved', remarks: prompt('Remarks (optional)') || '' }, 'Gate approved — phase advanced'); });
  $('#g-reject')?.addEventListener('click', () => { const r = prompt('Reason for rejection (required)'); if (r) act({ status: 'Rejected', remarks: r }, 'Gate rejected'); });
}

// ---------- charts ----------
function scurve(sc) {
  const all = [...sc.planned, ...sc.actual]; if (!all.length) return '<div class="empty">No programme yet</div>';
  const W = 640, H = 240, L = 36, R = 12, T = 12, B = 28;
  const ds = all.map(d => d.date).sort(); const d0 = new Date(ds[0]), d1 = new Date(ds[ds.length - 1]); const span = Math.max(1, d1 - d0);
  const x = d => L + ((new Date(d) - d0) / span) * (W - L - R), y = v => T + (1 - v / 100) * (H - T - B);
  const path = arr => arr.map((p, i) => (i ? 'L' : 'M') + x(p.date).toFixed(1) + ' ' + y(p.value).toFixed(1)).join(' ');
  const ticks = [0, 25, 50, 75, 100];
  const months = []; for (let d = new Date(d0.getFullYear(), d0.getMonth(), 1); d <= d1; d.setMonth(d.getMonth() + 1)) months.push(new Date(d));
  const step = Math.ceil(months.length / 8);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" data-sc='${esc(JSON.stringify(sc))}' onmousemove="window.__sct(event,this)" onmouseleave="window.__scl()">
    ${ticks.map(t => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${t}%</text>`).join('')}
    ${months.filter((_, i) => i % step === 0).map(d => `<text x="${x(d)}" y="${H - 8}" text-anchor="middle">${d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}</text>`).join('')}
    <line class="axis" x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}"/>
    <line class="today" x1="${x(sc.today)}" x2="${x(sc.today)}" y1="${T}" y2="${y(0)}"/><text x="${x(sc.today) + 4}" y="${T + 10}">today</text>
    <path class="l1 dash" d="${path(sc.planned)}"/><path class="l2" d="${path(sc.actual)}"/>
    ${sc.actual.length ? `<circle cx="${x(sc.actual.at(-1).date)}" cy="${y(sc.actual.at(-1).value)}" r="4" fill="var(--series-2)" stroke="var(--surface)" stroke-width="2"/>` : ''}
  </svg><div class="legend"><span><i style="background:var(--series-1)"></i>Planned (baseline)</span><span><i style="background:var(--series-2)"></i>Actual / earned</span></div>`;
}
window.__sct = (ev, svg) => {
  const sc = JSON.parse(svg.dataset.sc); const r = svg.getBoundingClientRect(); const fx = (ev.clientX - r.left) / r.width * 640;
  const all = [...sc.planned, ...sc.actual]; const ds = all.map(d => d.date).sort(); const d0 = new Date(ds[0]), d1 = new Date(ds[ds.length - 1]);
  const t = new Date(d0.getTime() + (fx - 36) / (640 - 48) * (d1 - d0)); if (isNaN(t)) return;
  const near = arr => arr.reduce((b, p) => Math.abs(new Date(p.date) - t) < Math.abs(new Date(b.date) - t) ? p : b, arr[0]);
  const p = near(sc.planned), a = sc.actual.length ? near(sc.actual) : null;
  let tip = $('#tip'); if (!tip) { tip = document.createElement('div'); tip.id = 'tip'; tip.className = 'tip'; document.body.appendChild(tip); }
  tip.innerHTML = `${fmtDate(p.date)}<br>Planned ${p.value}%${a ? `<br>Actual ${a.value}% (${fmtDate(a.date)})` : ''}`;
  tip.style.left = (ev.clientX + 14) + 'px'; tip.style.top = (ev.clientY - 10) + 'px';
};
window.__scl = () => $('#tip')?.remove();
function heat(risks) {
  const open = risks.filter(r => r.status !== 'Closed'); const cell = {};
  for (const r of open) { const k = r.likelihood + ',' + r.impact; cell[k] = (cell[k] || 0) + 1; }
  let h = '<div class="heat"><div></div>' + [1, 2, 3, 4, 5].map(i => `<div class="h">I${i}</div>`).join('');
  for (let l = 5; l >= 1; l--) { h += `<div class="h">L${l}</div>`; for (let i = 1; i <= 5; i++) { const s = l * i, lv = s >= 20 ? 5 : s >= 15 ? 4 : s >= 10 ? 3 : s >= 5 ? 2 : 1; h += `<div class="c lv${lv}" title="Likelihood ${l} × Impact ${i} = ${s}">${cell[l + ',' + i] || ''}</div>`; } }
  return h + '</div><div class="small muted" style="margin-top:6px">' + open.length + ' open risks/issues · score ≥ 15 auto-escalates to CEO</div>';
}
function budgetBars(lines) {
  if (!lines.length) return '<div class="empty">No budget lines</div>';
  const by = {}; for (const l of lines) { const k = l.category || 'Other'; by[k] = by[k] || { b: 0, f: 0, a: 0 }; by[k].b += l.budget || 0; by[k].f += l.forecast || 0; by[k].a += l.actual || 0; }
  const max = Math.max(...Object.values(by).map(v => Math.max(v.b, v.f)));
  return Object.entries(by).map(([k, v]) => `<div class="hbar" title="Budget ${money(v.b)} · Forecast ${money(v.f)} · Actual ${money(v.a)}"><span>${esc(k)}</span><div class="bar" style="height:10px"><i class="${v.f > v.b * 1.05 ? 'R' : v.f > v.b ? 'A' : ''}" style="width:${v.f / max * 100}%;opacity:.55"></i><i class="G" style="width:${v.a / max * 100}%"></i><i class="plan" style="width:${v.b / max * 100}%"></i></div><span class="n">${(v.b ? v.f / v.b * 100 : 0).toFixed(0)}%</span></div>`).join('') + '<div class="legend"><span><i style="background:var(--good)"></i>Actual</span><span><i style="background:var(--gold);opacity:.55"></i>Forecast</span><span><i style="background:var(--text-2);width:2px"></i>Budget</span></div>';
}
function gantt(acts, today) {
  const a = acts.filter(x => x.base_start && x.base_finish).sort((x, y) => (x.wbs || '').localeCompare(y.wbs || '', undefined, { numeric: true }));
  if (!a.length) return '<div class="empty">No activities with baseline dates</div>';
  const d0 = new Date(a.reduce((m, x) => x.base_start < m ? x.base_start : m, '9999')), d1 = new Date(a.reduce((m, x) => (x.fc_finish || x.base_finish) > m ? (x.fc_finish || x.base_finish) : m, ''));
  const span = Math.max(1, d1 - d0), px = d => ((new Date(d) - d0) / span * 100);
  return `<div class="gantt">${a.map(x => { const bs = px(x.base_start), bf = px(x.base_finish), fs = px(x.act_start || x.fc_start || x.base_start), ff = px(x.act_finish || x.fc_finish || x.base_finish);
    return `<div class="row" onclick="location.hash='#/r/activities/${x.id}'" style="cursor:pointer"><div class="nm ${x.critical ? 'crit' : ''}" title="${esc(x.name)}">${esc(x.wbs || '')} ${esc(x.name)}</div><div class="lane">${x.milestone ? `<span class="ms" style="left:calc(${bs}% - 6px)"></span>` : `<i style="left:${bs}%;width:${Math.max(.5, bf - bs)}%"></i><b class="${x.status === 'Completed' ? 'done' : x._c.slip > 0 ? 'R' : ''}" style="left:${fs}%;width:${Math.max(.5, ff - fs)}%" title="${x.pct || 0}% · slip ${x._c.slip}d"></b>`}<span class="td" style="left:${px(today)}%"></span></div></div>`; }).join('')}</div>`;
}

// ---------- register (list/board) ----------
async function viewRegister(entity, q) {
  const d = def(entity); if (!d) throw new Error('Unknown register');
  crumb(d.plural);
  $('#content').innerHTML = `<div class="page-head"><div><div class="eyebrow">${esc(state.meta.groups.find(g => g.key === d.group)?.label || '')}</div><h1>${esc(d.plural)}</h1>${d.help ? `<p>${esc(d.help)}</p>` : ''}</div></div><div id="reg"></div>`;
  registerInto($('#reg'), entity, { project: state.project === 'all' ? undefined : state.project, ...q }, { templates: entity === 'approvals' });
}
async function registerInto(el, entity, opts = {}, extra = {}) {
  const d = def(entity);
  const rows = await get(`/api/r/${entity}?x=1${opts.project ? '&project=' + opts.project : ''}`);
  const st = { q: '', status: opts.status || '', sort: opts.sort || 'updated_at', dir: -1, mode: localStorage.getItem('abs_mode_' + entity) || 'list' };
  const cols = d.fields.filter(f => f.list);
  const statusF = d.status ? d.fields.find(f => f.k === d.status) : null;
  const render = () => {
    let r = rows.filter(x => (!st.status || x[d.status] === st.status) && (!st.q || JSON.stringify(x).toLowerCase().includes(st.q)));
    r.sort((a, b) => { const va = a[st.sort] ?? '', vb = b[st.sort] ?? ''; return (va > vb ? 1 : va < vb ? -1 : 0) * st.dir; });
    const openCount = rows.filter(x => x._c.open).length, overdue = rows.filter(x => x._c.overdue || x._c.plan_overdue).length;
    el.innerHTML = `<div class="toolbar">
      <input placeholder="Filter…" id="f-q" value="${esc(st.q)}" style="min-width:180px">
      ${statusF ? `<select id="f-s"><option value="">All statuses</option>${statusF.options.map(o => `<option ${st.status === o ? 'selected' : ''}>${o}</option>`).join('')}</select>` : ''}
      ${d.board ? `<div class="seg"><button class="${st.mode === 'list' ? 'on' : ''}" data-m="list">List</button><button class="${st.mode === 'board' ? 'on' : ''}" data-m="board">Board</button></div>` : ''}
      <span class="small muted">${r.length} of ${rows.length} · ${openCount} open${overdue ? ` · <span style="color:var(--critical)">${overdue} overdue</span>` : ''}</span>
      <span style="flex:1"></span>
      ${extra.templates && opts.project && canI('approvals', 'c') ? `<button class="btn sm" id="tpl">Apply approval templates</button>` : ''}
      <a class="btn sm" href="/api/export/${entity}?x=1${opts.project ? '&project=' + opts.project : ''}">Export CSV</a>
      ${canI(entity, 'c') ? `<button class="btn sm" id="imp">Import CSV</button><button class="btn primary sm" id="new">+ New ${esc(d.label)}</button>` : ''}
    </div>
    ${st.mode === 'board' && d.board ? board(entity, r) : table(entity, r, cols, st)}`;
    $('#f-q', el).oninput = e => { st.q = e.target.value.toLowerCase(); render(); $('#f-q', el).focus(); $('#f-q', el).setSelectionRange(99, 99); };
    $('#f-s', el) && ($('#f-s', el).onchange = e => { st.status = e.target.value; render(); });
    $$('[data-m]', el).forEach(b => b.onclick = () => { st.mode = b.dataset.m; localStorage.setItem('abs_mode_' + entity, st.mode); render(); });
    $$('th[data-k]', el).forEach(th => th.onclick = () => { if (st.sort === th.dataset.k) st.dir *= -1; else { st.sort = th.dataset.k; st.dir = 1; } render(); });
    $('#new', el)?.addEventListener('click', () => recordForm(entity, { project_id: opts.project || (state.project !== 'all' ? state.project : '') }, () => registerInto(el, entity, opts, extra)));
    $('#imp', el)?.addEventListener('click', () => importDialog(entity, opts.project, () => registerInto(el, entity, opts, extra)));
    $('#tpl', el)?.addEventListener('click', async () => { if (!confirm('Add the standard approval library items applicable to this project type? Existing items are kept.')) return; const r = await api('POST', `/api/projects/${opts.project}/apply-templates`); toast(`${r.created} approvals added`, 'ok'); registerInto(el, entity, opts, extra); });
    $$('[data-drop]', el).forEach(col => { col.ondragover = e => e.preventDefault(); col.ondrop = async e => { e.preventDefault(); const id = e.dataTransfer.getData('id'); try { await api('PUT', `/api/r/${entity}/${id}`, { [d.status]: col.dataset.drop }); toast('Updated', 'ok'); registerInto(el, entity, opts, extra); } catch (err) { toast(err.message, 'err'); } }; });
  };
  render();
}
function cellVal(entity, f, r) {
  const v = r[f.k];
  switch (f.type) {
    case 'date': return `<span class="mono ${r._c.due === v && r._c.overdue ? 'status bad' : ''}">${fmtDate(v)}</span>`;
    case 'money': return `<span class="mono">${money(v)}</span>`;
    case 'percent': return v == null || v === '' ? '—' : `<div class="bar" style="width:90px;display:inline-block;vertical-align:middle"><i style="width:${v}%"></i></div> <span class="small mono">${v}%</span>`;
    case 'number': return `<span class="mono">${num(v)}</span>`;
    case 'bool': return v ? '✓' : '—';
    case 'user': return esc(userName(v));
    case 'select': return f.k === def(entity).status ? statusTag(v) : esc(v || '—');
    case 'ref': return v ? `<span class="small">${esc(v)}</span>` : '—';
    case 'multiref': return (v || []).length ? `<span class="chip">${v.length} linked</span>` : '—';
    default: return esc(v || '—');
  }
}
function table(entity, rows, cols, st) {
  const d = def(entity); const showProj = entity !== 'projects' && state.project === 'all';
  if (!rows.length) return '<div class="card"><div class="empty">No records match.</div></div>';
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th data-k="code" class="${st.sort === 'code' ? 'sorted' : ''}">Code</th>${showProj ? '<th data-k="project_id">Project</th>' : ''}${cols.map(f => `<th data-k="${f.k}" class="${st.sort === f.k ? 'sorted' : ''}">${esc(f.label)}</th>`).join('')}<th>Flags</th></tr></thead><tbody>
    ${rows.map(r => `<tr class="${r._c.overdue || r._c.plan_overdue ? 'overdue' : ''}" onclick="location.hash='#/r/${entity}/${r.id}'"><td class="code">${esc(r.code)}</td>${showProj ? `<td class="small">${esc(projName(r.project_id) || '—')}</td>` : ''}${cols.map(f => `<td class="${f.k === d.title ? 'tt' : ''}">${cellVal(entity, f, r)}</td>`).join('')}<td>${flags(r)}</td></tr>`).join('')}</tbody></table></div>`;
}
function flags(r) {
  const c = r._c, out = [];
  if (c.overdue || c.plan_overdue) out.push(`<span class="status bad">overdue ${c.days_left != null ? Math.abs(c.days_left) + 'd' : ''}</span>`);
  else if (c.days_left != null && c.days_left <= 7) out.push(`<span class="status warn">due ${c.days_left}d</span>`);
  if (c.expiring) out.push(`<span class="status warn">expires ${c.days_to_expiry}d</span>`);
  if (c.blockers?.length) out.push(`<span class="status bad">blocked</span>`);
  if (c.slip > 0) out.push(`<span class="status ${c.slip >= 7 ? 'bad' : 'warn'}">slip +${c.slip}d</span>`);
  return out.join(' ');
}
function board(entity, rows) {
  const d = def(entity); const sf = d.fields.find(f => f.k === d.status);
  return `<div class="board">${sf.options.map(s => { const rs = rows.filter(r => r[d.status] === s); return `<div class="col" data-drop="${esc(s)}"><h4>${esc(s)}<span>${rs.length}</span></h4>${rs.map(r => `<div class="kcard ${r._c.overdue ? 'overdue' : ''}" draggable="${canI(entity, 'u')}" ondragstart="event.dataTransfer.setData('id','${r.id}')" onclick="location.hash='#/r/${entity}/${r.id}'"><div class="code">${esc(r.code)}${state.project === 'all' && r.project_id ? ' · ' + esc(projName(r.project_id)) : ''}</div><div>${esc(r[d.title])}</div><div class="meta"><span>${esc(userName(r.owner || r.internal_lead || r.pm) || '')}</span><span>${r._c.due ? fmtDate(r._c.due) : ''}</span></div></div>`).join('')}</div>`; }).join('')}</div>`;
}

// ---------- record detail ----------
async function viewRecord(entity, id) {
  const d = def(entity); if (!d) throw new Error('Unknown register');
  const r = await get(`/api/r/${entity}/${id}`); const rec = r.record;
  crumb(`${rec.code} · ${rec[d.title] || ''}`);
  const c = rec._c; const notices = [];
  if (c.blockers?.length) notices.push(`<div class="notice R"><b>Blocked (§5):</b> this activity cannot start — ${c.blockers.map(esc).join('; ')}.</div>`);
  if (c.overdue || c.plan_overdue) notices.push(`<div class="notice R"><b>Overdue</b> since ${fmtDate(c.due || rec.plan_due)}.</div>`);
  if (c.expiring) notices.push(`<div class="notice A"><b>Expires in ${c.days_to_expiry} days</b> — start renewal.</div>`);
  if (entity === 'approvals' && rec.status === 'Granted' && !rec.conditions_ack) notices.push(`<div class="notice A">Conditions not yet acknowledged by site — linked activities remain blocked.</div>`);
  if (entity === 'changes' && rec.status === 'Submitted') notices.push(`<div class="notice A">Awaiting approval. ${Math.abs(rec.cost_impact || 0) > state.meta.config.pm_change_limit || ['Scope', 'Schedule / Baseline'].includes(rec.kind) ? 'Requires CEO approval.' : 'Within PM delegated limit.'}</div>`);
  const quick = quickActions(entity, rec);
  $('#content').innerHTML = `
    <div class="detail-head"><div><div class="code">${esc(d.label).toUpperCase()} · ${esc(rec.code)}${rec.project_id ? ` · <a href="#/project/${rec.project_id}">${esc(projName(rec.project_id))}</a>` : ''}</div><h1>${esc(rec[d.title] || '')}</h1><div class="actions" style="margin-top:6px">${d.status ? statusTag(rec[d.status]) : ''}${flags(rec)}</div></div>
      <div class="actions">${quick}${canI(entity, 'u') ? `<button class="btn" id="edit">Edit</button>` : ''}${canI(entity, 'd') ? `<button class="btn danger" id="del">Delete</button>` : ''}<a class="btn ghost" href="#/r/${entity}">← ${esc(d.plural)}</a></div></div>
    ${notices.join('')}
    <div class="grid g-2-1"><div><div class="card">${kvFields(entity, rec, r.files, r.refs)}</div>
      ${r.related.length ? `<div class="card" style="margin-top:16px"><h2>Linked records</h2>${r.related.map(x => `<div class="rel" onclick="location.hash='#/r/${x.entity}/${x.id}'"><span><span class="code small muted">${esc(x.code)}</span> ${esc(x[def(x.entity).title])}<span class="small muted"> · ${esc(def(x.entity).label)}</span></span>${def(x.entity).status ? statusTag(x[def(x.entity).status]) : ''}</div>`).join('')}</div>` : ''}</div>
      <div class="card"><h2>Audit trail</h2>${timeline(r.history)}<div class="small muted" style="margin-top:10px">Created ${fmtDT(rec.created_at)} by ${esc(userName(rec.created_by))}</div></div></div>`;
  $('#edit')?.addEventListener('click', () => recordForm(entity, rec, () => route()));
  $('#del')?.addEventListener('click', async () => { if (!confirm(`Delete ${rec.code}? This is recorded in the audit log.`)) return; try { await api('DELETE', `/api/r/${entity}/${id}`); toast('Deleted', 'ok'); go(`/r/${entity}`); } catch (e) { toast(e.message, 'err'); } });
  $$('[data-qa]').forEach(b => b.onclick = async () => { const patch = JSON.parse(b.dataset.qa); if (b.dataset.confirm && !confirm(b.dataset.confirm)) return; if (b.dataset.prompt) { const v = prompt(b.dataset.prompt); if (!v) return; patch[b.dataset.promptk] = v; } try { await api('PUT', `/api/r/${entity}/${id}`, patch); toast('Updated', 'ok'); route(); refreshNotifs(); } catch (e) { toast(e.message, 'err'); } });
}
function quickActions(entity, r) {
  const b = (label, patch, o = {}) => `<button class="btn ${o.cls || ''}" data-qa='${esc(JSON.stringify(patch))}' ${o.confirm ? `data-confirm="${esc(o.confirm)}"` : ''} ${o.prompt ? `data-prompt="${esc(o.prompt)}" data-promptk="${o.promptk}"` : ''}>${label}</button>`;
  const me = state.meta.me.role, A = canI(entity, 'a'), U = canI(entity, 'u');
  const out = [];
  if (entity === 'changes' && r.status === 'Submitted' && A) out.push(b('Approve', { status: 'Approved' }, { cls: 'primary', confirm: 'Approve this change? It becomes a permanent record.' }), b('Reject', { status: 'Rejected' }, { cls: 'danger' }));
  if (entity === 'changes' && r.status === 'Draft' && U) out.push(b('Submit for approval', { status: 'Submitted' }, { cls: 'primary' }));
  if (entity === 'changes' && r.status === 'Approved' && U) out.push(b('Mark implemented', { status: 'Implemented' }));
  if (entity === 'approvals' && r.status === 'Granted' && !r.conditions_ack && U) out.push(b('Acknowledge conditions (site)', { conditions_ack: true }, { cls: 'primary' }));
  if (entity === 'approvals' && ['Preparing', 'Not Started'].includes(r.status) && U) out.push(b('Mark submitted', { status: 'Submitted' }, { cls: 'primary', prompt: 'Application / diary number', promptk: 'application_no' }));
  if (entity === 'approvals' && r.status === 'Observations' && U) out.push(b('Mark resubmitted', { status: 'Resubmitted' }, { cls: 'primary' }));
  if (entity === 'activities' && r.status === 'Not Started' && U) out.push(b('Start work', { status: 'In Progress' }, { cls: 'primary', confirm: 'Confirm the written approvals and conditions have been verified before starting (§5)?' }));
  if (entity === 'activities' && r.status === 'In Progress' && U) out.push(b('Mark completed', { status: 'Completed' }));
  if (entity === 'payment_apps' && r.status === 'Under QS Review' && A) out.push(b('Certify', { status: 'Certified' }, { cls: 'primary' }));
  if (entity === 'payment_apps' && r.status === 'Submitted' && U) out.push(b('Start QS review', { status: 'Under QS Review' }));
  if (entity === 'payment_apps' && r.status === 'Certified' && U) out.push(b('Mark paid', { status: 'Paid' }));
  if (entity === 'ncrs' && r.status === 'Action Done' && A) out.push(b('Verify & close', { status: 'Closed' }, { cls: 'primary' }));
  if (entity === 'actions' && r.status === 'Open' && U) out.push(b('Mark done', { status: 'Done' }, { cls: 'primary' }));
  if (entity === 'meetings' && r.status === 'Held' && U) out.push(b('Close meeting', { status: 'Closed' }, { cls: 'primary', confirm: 'Close this meeting? All actions must have an owner and due date.' }));
  if (entity === 'meetings' && r.status === 'Scheduled' && U) out.push(b('Mark held', { status: 'Held' }));
  if (entity === 'delays' && r.status === 'Plan Submitted' && U) out.push(b('Recovering', { status: 'Recovering' }), b('Close', { status: 'Closed' }));
  if (entity === 'risks' && r.status !== 'Closed' && U) out.push(b('Close', { status: 'Closed' }));
  if (entity === 'gates' && r.project_id) out.push(`<a class="btn" href="#/project/${r.project_id}?tab=gate">Open gate</a>`);
  if (entity === 'meetings' && U) out.push(`<button class="btn" onclick="window.__newAction('${r.id}','${r.project_id || ''}')">+ Action</button>`);
  return out.join('');
}
window.__newAction = (meeting, project_id) => recordForm('actions', { meeting, project_id }, () => route());
function kvFields(entity, rec, files = {}, refs = {}) {
  const d = def(entity);
  return `<div class="kv">${d.fields.filter(f => rec[f.k] !== '' && rec[f.k] != null && !(Array.isArray(rec[f.k]) && !rec[f.k].length) && f.k !== 'change_ref' || f.required).map(f => {
    let v = rec[f.k];
    const wide = ['textarea', 'checklist', 'multiref', 'files'].includes(f.type) || (typeof v === 'string' && v.length > 60);
    switch (f.type) {
      case 'date': v = fmtDate(v); break; case 'money': v = money(v); break; case 'number': v = num(v); break; case 'percent': v = v == null ? '—' : v + '%'; break;
      case 'bool': v = v ? 'Yes' : 'No'; break; case 'user': v = esc(userName(v)) || '—'; break;
      case 'select': v = f.k === d.status ? statusTag(v) : esc(v); break;
      case 'ref': v = refs[v] ? `<a href="#/r/${f.ref}/${rec[f.k]}">${esc(refs[v].code)} ${esc(refs[v].title)}</a> ${statusTag(refs[v].status)}` : '—'; break;
      case 'multiref': v = (v || []).map(id => refs[id] ? `<div><a href="#/r/${f.ref}/${id}">${esc(refs[id].code)} ${esc(refs[id].title)}</a> ${statusTag(refs[id].status)}</div>` : '').join('') || '—'; break;
      case 'file': v = files[v] ? fileChip(files[v]) : '—'; break; case 'files': v = (v || []).map(id => files[id] ? fileChip(files[id]) : '').join(' ') || '—'; break;
      case 'checklist': v = `<ul class="checklist">${(v || []).map(c => `<li>${c.done ? '☑' : '☐'} ${esc(c.item)}</li>`).join('')}</ul>`; break;
      case 'textarea': v = `<span class="pre">${esc(v)}</span>`; break;
      default: v = esc(v);
    }
    return `<div class="${wide ? 'wide' : ''}"><div class="k">${esc(f.label)}</div><div class="v ${f.type === 'textarea' ? 'pre' : ''}">${v || '—'}</div></div>`;
  }).join('')}</div>`;
}
const fileChip = f => `<a class="chip" href="/api/files/${f.id}" target="_blank">📎 ${esc(f.name)} <span class="muted">(${Math.round(f.size / 1024)} KB)</span></a>`;
function timeline(h) {
  if (!h.length) return '<div class="muted small">No history</div>';
  return `<ul class="timeline">${h.map(x => { const diff = JSON.parse(x.diff || '{}'); const keys = Object.keys(diff).filter(k => k !== 'snapshot');
    return `<li><div><b>${esc(x.action)}</b> · ${esc(x.user_name)}</div><div class="when">${fmtDT(x.at)}</div>${keys.length ? `<div class="diff small">${keys.slice(0, 6).map(k => Array.isArray(diff[k]) ? `${esc(k)}: ${esc(fmtV(diff[k][0]))} → <b>${esc(fmtV(diff[k][1]))}</b>` : `${esc(k)}: ${esc(fmtV(diff[k]))}`).join('<br>')}${keys.length > 6 ? `<br>+${keys.length - 6} more` : ''}</div>` : ''}</li>`; }).join('')}</ul>`;
}
const fmtV = v => v == null || v === '' ? '∅' : Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v).slice(0, 60) : String(v).slice(0, 80);

// ---------- record form ----------
async function recordForm(entity, rec, onSaved) {
  const d = def(entity); const isNew = !rec.id;
  const projectId = entity === 'projects' ? null : rec.project_id;
  const refData = {};
  for (const f of d.fields.filter(x => x.type === 'ref' || x.type === 'multiref')) refData[f.k] = projectId ? await get(`/api/r/${f.ref}?project=${projectId}`) : (def(f.ref).projectOptional ? await get(`/api/r/${f.ref}`) : []);
  const files = {}; for (const f of d.fields.filter(x => x.type === 'file' || x.type === 'files')) for (const id of [].concat(rec[f.k] || [])) files[id] = { id, name: 'attached file' };
  if (!isNew) { try { const full = await get(`/api/r/${entity}/${rec.id}`); Object.assign(files, full.files); } catch {} }
  const uploads = Object.fromEntries(d.fields.filter(x => x.type === 'file' || x.type === 'files').map(f => [f.k, [].concat(rec[f.k] || [])]));
  const field = f => {
    const v = rec[f.k] ?? ''; const req = f.required ? '<span class="req">*</span>' : ''; const ro = f.readonly ? 'readonly' : '';
    const wide = ['textarea', 'checklist', 'multiref', 'files'].includes(f.type);
    let inp;
    switch (f.type) {
      case 'textarea': inp = `<textarea name="${f.k}" ${ro}>${esc(v)}</textarea>`; break;
      case 'select': inp = `<select name="${f.k}" ${f.readonly ? 'disabled' : ''}><option value="">—</option>${f.options.map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`; break;
      case 'bool': inp = `<label class="chk"><input type="checkbox" name="${f.k}" ${v ? 'checked' : ''}> ${esc(f.help || 'Yes')}</label>`; break;
      case 'user': inp = `<select name="${f.k}" ${f.readonly ? 'disabled' : ''}><option value="">—</option>${state.meta.users.filter(u => u.active || u.id === v).map(u => `<option value="${u.id}" ${u.id === v ? 'selected' : ''}>${esc(u.name)} · ${esc(state.meta.roles[u.role]?.label || '')}</option>`).join('')}</select>`; break;
      case 'ref': inp = `<select name="${f.k}"><option value="">—</option>${(refData[f.k] || []).map(x => `<option value="${x.id}" ${x.id === v ? 'selected' : ''}>${esc(x.code)} · ${esc(x[def(f.ref).title])}${def(f.ref).status ? ' (' + esc(x[def(f.ref).status]) + ')' : ''}</option>`).join('')}</select>`; break;
      case 'multiref': inp = `<div class="multiref">${(refData[f.k] || []).map(x => `<label class="chk"><input type="checkbox" name="${f.k}" value="${x.id}" ${(v || []).includes(x.id) ? 'checked' : ''}> ${esc(x.code)} · ${esc(x[def(f.ref).title])} <span class="muted small">${esc(x[def(f.ref).status] || '')}</span></label>`).join('') || '<span class="muted small">No records to link in this project.</span>'}</div>`; break;
      case 'file': case 'files': inp = `<div class="filebox" data-fk="${f.k}">${uploads[f.k].map(id => `<span class="f" data-id="${id}">📎 ${esc(files[id]?.name || 'file')}<button type="button" data-rm="${id}">✕</button></span>`).join('')}<label class="btn sm">Upload<input type="file" hidden ${f.type === 'files' ? 'multiple' : ''} data-up="${f.k}"></label></div>`; break;
      case 'checklist': inp = `<ul class="checklist">${(v || []).map((c, i) => `<li><input type="checkbox" name="${f.k}" data-i="${i}" ${c.done ? 'checked' : ''}><span>${esc(c.item)}</span></li>`).join('') || '<li class="muted small">Checklist is created from the framework when saved.</li>'}</ul>`; break;
      case 'money': case 'number': inp = `<input name="${f.k}" type="number" step="any" value="${esc(v)}" ${ro} ${f.min != null ? `min="${f.min}" max="${f.max}"` : ''}>`; break;
      case 'percent': inp = `<input name="${f.k}" type="number" min="0" max="100" step="0.1" value="${esc(v)}" ${ro}>`; break;
      case 'date': inp = `<input name="${f.k}" type="date" value="${esc(v)}" ${ro}>`; break;
      default: inp = `<input name="${f.k}" value="${esc(v)}" ${ro}>`;
    }
    return `<div class="field ${wide ? 'wide' : ''}"><label>${esc(f.label)} ${req}</label>${inp}${f.help && f.type !== 'bool' ? `<div class="hint">${esc(f.help)}</div>` : ''}</div>`;
  };
  const projField = entity === 'projects' ? '' : `<div class="field ${d.projectOptional ? '' : ''}"><label>Project ${d.projectOptional ? '' : '<span class="req">*</span>'}</label><select name="project_id" ${!isNew ? 'disabled' : ''}><option value="">${d.projectOptional ? 'Company-level (no project)' : '— select —'}</option>${state.meta.projects.map(p => `<option value="${p.id}" ${p.id === projectId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>`;
  modal(`<div class="drawer-head"><div><div class="eyebrow">${isNew ? 'New' : 'Edit'} · ${esc(d.plural)}</div><h2>${isNew ? 'New ' + esc(d.label) : esc(rec.code)}</h2></div><button class="btn ghost" data-close>✕</button></div>
    <form class="drawer-body" id="rf">${d.help ? `<div class="help">${esc(d.help)}</div>` : ''}<div id="ferr"></div><div class="fgrid">${projField}${d.fields.map(field).join('')}</div></form>
    <div class="drawer-foot"><button class="btn" data-close type="button">Cancel</button><button class="btn primary" id="save">${isNew ? 'Create' : 'Save changes'}</button></div>`);
  const form = $('#rf');
  form.querySelector('[name=project_id]')?.addEventListener('change', async e => { rec.project_id = e.target.value; closeModal(); recordForm(entity, rec, onSaved); });
  $$('[data-up]', form).forEach(inp => inp.onchange = async () => {
    for (const file of inp.files) {
      if (file.size > 20 * 1024 * 1024) { toast(file.name + ' exceeds 20 MB', 'err'); continue; }
      const data = await new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(file); });
      try { const r = await api('POST', '/api/files', { name: file.name, mime: file.type, data }); const k = inp.dataset.up; const f = d.fields.find(x => x.k === k); if (f.type === 'file') uploads[k] = [r.id]; else uploads[k].push(r.id); files[r.id] = r;
        const box = inp.closest('.filebox'); box.querySelectorAll('.f').forEach(x => { if (f.type === 'file') x.remove(); }); box.insertAdjacentHTML('afterbegin', `<span class="f" data-id="${r.id}">📎 ${esc(r.name)}<button type="button" data-rm="${r.id}">✕</button></span>`); bindRm(); toast('Uploaded ' + r.name, 'ok'); } catch (e) { toast(e.message, 'err'); }
    }
  });
  const bindRm = () => $$('[data-rm]', form).forEach(b => b.onclick = () => { const k = b.closest('.filebox').dataset.fk; uploads[k] = uploads[k].filter(x => x !== b.dataset.rm); b.parentElement.remove(); });
  bindRm();
  $('#save').onclick = async () => {
    const data = {};
    for (const f of d.fields) {
      if (f.readonly) continue;
      const els = $$(`[name="${f.k}"]`, form);
      if (f.type === 'bool') data[f.k] = els[0].checked;
      else if (f.type === 'multiref') data[f.k] = els.filter(e => e.checked).map(e => e.value);
      else if (f.type === 'checklist') data[f.k] = (rec[f.k] || []).map((c, i) => ({ item: c.item, done: !!els.find(e => e.dataset.i == i)?.checked }));
      else if (f.type === 'file') data[f.k] = uploads[f.k][0] || '';
      else if (f.type === 'files') data[f.k] = uploads[f.k];
      else if (els[0]) data[f.k] = els[0].value;
    }
    if (entity !== 'projects' && isNew) data.project_id = form.querySelector('[name=project_id]').value;
    $('#save').disabled = true;
    try { const r = isNew ? await api('POST', `/api/r/${entity}`, data) : await api('PUT', `/api/r/${entity}/${rec.id}`, data); closeModal(); toast(`${r.code} saved`, 'ok'); refreshNotifs(); if (entity === 'projects') { state.meta = await get('/api/meta'); renderShell(); } onSaved?.(r); if (isNew && entity !== 'projects') go(`/r/${entity}/${r.id}`); else if (isNew) go(`/project/${r.id}`); }
    catch (e) { $('#ferr').innerHTML = `<div class="err"><b>${e.code === 'UNAUTHORIZED_WORK' ? 'Blocked by the framework' : e.code === 'BASELINE_LOCKED' ? 'Baseline is locked' : e.code === 'NO_WRITTEN_CONFIRMATION' ? 'Written confirmation required' : 'Cannot save'}:</b> ${esc(e.message)}</div>`; form.scrollTop = 0; $('#save').disabled = false; }
  };
}
function importDialog(entity, project, onDone) {
  const d = def(entity);
  modal(`<div class="drawer-head"><div><div class="eyebrow">Import</div><h2>Import ${esc(d.plural)} from CSV</h2></div><button class="btn ghost" data-close>✕</button></div>
    <div class="drawer-body"><div class="help">Header row must use the field labels shown in the form (or the export file). Dates as YYYY-MM-DD or DD/MM/YYYY. Users by name or email. A "Project" column (name or code) assigns rows; otherwise the selected project is used. Every row passes the same rules as manual entry.</div>
    <div class="field"><label>Project for rows without a Project column</label><select id="ip"><option value="">—</option>${state.meta.projects.map(p => `<option value="${p.id}" ${p.id === project ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
    <div class="field" style="margin-top:10px"><label>CSV file</label><input type="file" id="icsv" accept=".csv,text/csv"></div>
    <div class="field" style="margin-top:10px"><label>…or paste CSV</label><textarea id="itxt" style="min-height:140px;font-family:monospace;font-size:12px"></textarea></div>
    <div class="small muted" style="margin-top:8px">Expected columns: ${d.fields.filter(f => !['file', 'files', 'checklist', 'multiref'].includes(f.type) && !f.readonly).map(f => esc(f.label)).join(', ')}</div><div id="ires" style="margin-top:12px"></div></div>
    <div class="drawer-foot"><button class="btn" data-close>Close</button><button class="btn primary" id="irun">Import</button></div>`);
  $('#icsv').onchange = e => { const fr = new FileReader(); fr.onload = () => $('#itxt').value = fr.result; fr.readAsText(e.target.files[0]); };
  $('#irun').onclick = async () => { try { const r = await api('POST', `/api/import/${entity}`, { csv: $('#itxt').value, project_id: $('#ip').value }); $('#ires').innerHTML = `<div class="ok">${r.created} record(s) created.</div>${r.errors.length ? `<div class="err">${r.errors.length} row(s) rejected:<br>${r.errors.slice(0, 15).map(e => `Row ${e.row}: ${esc(e.error)}`).join('<br>')}</div>` : ''}`; if (r.created) onDone?.(); } catch (e) { $('#ires').innerHTML = `<div class="err">${esc(e.message)}</div>`; } };
}

// ---------- my work / inbox / calendar / notifications / reports ----------
async function viewMyWork() {
  crumb('My work'); const rows = await get('/api/mywork');
  const by = {}; for (const r of rows) (by[r._entity] = by[r._entity] || []).push(r);
  $('#content').innerHTML = `<div class="page-head"><div><div class="eyebrow">${esc(state.meta.me.name)}</div><h1>My work</h1><p>Everything open that is assigned to you, across all registers, soonest due first.</p></div></div>
    ${rows.length ? Object.entries(by).map(([e, rs]) => `<div class="card" style="margin-bottom:14px"><div class="card-head"><h2>${esc(def(e).plural)}</h2><span class="chip">${rs.length}</span></div>${rs.map(r => `<div class="rel" onclick="location.hash='#/r/${e}/${r.id}'"><span><span class="code small muted">${esc(r.code)}</span> ${esc(r[def(e).title])}<span class="small muted"> · ${esc(projName(r.project_id) || 'Company')}</span></span><span>${flags(r)} ${def(e).status ? statusTag(r[def(e).status]) : ''} <span class="small muted mono">${r._c.due ? fmtDate(r._c.due) : ''}</span></span></div>`).join('')}</div>`).join('') : '<div class="card"><div class="empty">Nothing assigned to you is open. 🎉</div></div>'}`;
}
async function viewInbox() {
  crumb('Decisions inbox'); const items = await get('/api/inbox?x=1' + projQ());
  $('#content').innerHTML = `<div class="page-head"><div><div class="eyebrow">Governance</div><h1>Decisions required</h1><p>Changes awaiting approval, phase gates, escalated risks, overdue recovery plans and authority rejections — everything that needs an executive decision.</p></div></div>
    <div class="card">${items.length ? items.map(inboxRow).join('') : '<div class="empty">Inbox clear.</div>'}</div>`;
}
async function viewCalendar() {
  crumb('Deadlines'); const items = await get('/api/calendar?days=120' + projQ());
  const by = {}; for (const i of items) (by[i.due] = by[i.due] || []).push(i);
  $('#content').innerHTML = `<div class="page-head"><div><div class="eyebrow">Next 120 days</div><h1>Deadlines & expiries</h1><p>Target decisions, follow-ups, recovery plans, forecast finishes, required-on-site dates and NOC expiries in one timeline.</p></div></div>
    <div class="card">${Object.entries(by).map(([d, rs]) => `<div class="cal-day"><div class="d ${rs[0].overdue ? 'status bad' : ''}">${fmtDate(d)}<small>${new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long' })}</small></div><div>${rs.map(i => `<div class="it" onclick="location.hash='#/r/${i.entity}/${i.id}'"><span class="chip ${i.kind === 'Expiry' ? 'A' : ''}">${esc(i.kind)}</span><span>${esc(i.title)}</span><span class="muted small">${esc(def(i.entity).label)} · ${esc(projName(i.project_id))}</span></div>`).join('')}</div></div>`).join('') || '<div class="empty">Nothing due.</div>'}</div>`;
}
async function viewNotifications() {
  crumb('Alerts'); const n = await get('/api/notifications'); state.notifs = n;
  $('#content').innerHTML = `<div class="page-head"><div><div class="eyebrow">Engine alerts</div><h1>Alerts</h1><p>Generated automatically by the engine: expiries, overdue decisions, slippage, blocked work, recovery plans and items awaiting approval. They resolve themselves when the underlying record is fixed.</p></div><div class="actions"><button class="btn" id="mark">Mark all read</button>${isAdmin() ? '<button class="btn" id="sweep">Run checks now</button>' : ''}</div></div>
    <div class="card">${n.length ? n.map(alertRow).join('') : '<div class="empty">No open alerts.</div>'}</div>`;
  $('#mark').onclick = async () => { await api('POST', '/api/notifications/read', { ids: n.map(x => x.id) }); refreshNotifs(); route(); };
  $('#sweep')?.addEventListener('click', async () => { const r = await api('POST', '/api/sweep'); toast(`${r.alerts} live alerts after sweep`, 'ok'); refreshNotifs(); route(); });
}
function viewReports() {
  crumb('Reports');
  const p = state.project;
  $('#content').innerHTML = `<div class="page-head"><div><div class="eyebrow">§4.7 · §6 · §15</div><h1>Management reports</h1><p>Generated live from the registers, formatted for print. Use the browser's print dialog to save as PDF. The project selector in the top bar sets the scope.</p></div></div>
    <div class="grid g3">
      <div class="card"><h2>Weekly coordination dashboard</h2><p class="small muted">RAG by project, decisions required, open approvals, delays, two-week look-ahead, top risks, actions and KPIs. Pack for the weekly coordination meeting.</p><a class="btn primary" target="_blank" href="/report/weekly?project=${p}">Open weekly</a></div>
      <div class="card"><h2>Monthly report to the CEO</h2><p class="small muted">Everything in the weekly plus the full §8/§17 KPI scorecard, budget &amp; forecast, quality &amp; safety, regularization and phase gates. Signature block included.</p><a class="btn primary" target="_blank" href="/report/monthly?project=${p}">Open monthly</a></div>
      <div class="card"><h2>Data exports</h2><p class="small muted">Any register exports to CSV (Excel-ready) from its toolbar. Full audit log is available under Admin.</p><a class="btn" href="#/r/approvals">Go to registers</a></div>
    </div>`;
}

// ---------- admin ----------
async function viewAdmin(tab) {
  if (!isAdmin()) throw new Error('Administrator access required');
  crumb('Admin & settings');
  const tabs = [['users', 'Users & access'], ['permissions', 'Role permissions'], ['settings', 'Thresholds & rules'], ['templates', 'Approval library'], ['audit', 'Audit log']];
  $('#content').innerHTML = `<div class="page-head"><div><div class="eyebrow">Administration</div><h1>Admin & settings</h1></div></div><div class="tabs">${tabs.map(([k, l]) => `<a href="#/admin/${k}" class="${tab === k ? 'on' : ''}">${l}</a>`).join('')}</div><div id="atab"></div>`;
  const T = $('#atab');
  if (tab === 'users') {
    const users = await get('/api/admin/users');
    T.innerHTML = `<div class="toolbar"><span class="small muted">${users.length} users · ${users.filter(u => u.active).length} active</span><span style="flex:1"></span><button class="btn primary sm" id="nu">+ New user</button></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Project access</th><th>Last login</th><th>Status</th><th></th></tr></thead><tbody>${users.map(u => `<tr><td class="tt">${esc(u.name)}<div class="small muted">${esc(u.title || '')}</div></td><td>${esc(u.email)}</td><td>${esc(state.meta.roles[u.role]?.label)}</td><td class="small">${u.projects?.length ? u.projects.map(projName).join(', ') : 'All'}</td><td class="small">${fmtDT(u.last_login) || '—'}</td><td>${u.active ? '<span class="status ok">Active</span>' : '<span class="status bad">Disabled</span>'}${u.must_change ? ' <span class="status warn">temp pw</span>' : ''}</td><td><button class="btn sm" data-eu="${u.id}">Edit</button></td></tr>`).join('')}</tbody></table></div>`;
    $('#nu').onclick = () => userForm(null, () => viewAdmin('users'));
    $$('[data-eu]').forEach(b => b.onclick = () => userForm(users.find(u => u.id === b.dataset.eu), () => viewAdmin('users')));
  } else if (tab === 'permissions') {
    const perms = await get('/api/admin/permissions'); const L = ['r', 'c', 'u', 'd', 'a'];
    T.innerHTML = `<div class="help">Letters: <b>r</b>ead · <b>c</b>reate · <b>u</b>pdate · <b>d</b>elete · <b>a</b>pprove (set statuses such as Granted/Approved/Certified/Closed). Administrators always have full access. The engine's hard rules (written confirmation, locked baselines, gate approval by CEO, delegation limits) apply regardless of permissions.</div>
      <div class="toolbar"><select id="prole">${Object.entries(state.meta.roles).filter(([k]) => k !== 'admin').map(([k, r]) => `<option value="${k}">${esc(r.label)}</option>`).join('')}</select><span style="flex:1"></span><button class="btn sm" id="preset">Reset all to framework defaults</button><button class="btn primary sm" id="psave">Save</button></div><div class="card" id="pgrid"></div>`;
    const draw = () => { const role = $('#prole').value; $('#pgrid').innerHTML = `<div class="perm-grid"><div class="row hd"><div></div>${L.map(l => `<div>${l}</div>`).join('')}</div>${Object.entries(state.meta.entities).map(([e, d]) => `<div class="row"><div>${esc(d.plural)}</div>${L.map(l => `<label><input type="checkbox" data-e="${e}" data-l="${l}" ${(perms[role]?.[e] || '').includes(l) ? 'checked' : ''}></label>`).join('')}</div>`).join('')}</div>`;
      $$('#pgrid input').forEach(i => i.onchange = () => { perms[role] = perms[role] || {}; perms[role][i.dataset.e] = L.filter(l => $(`#pgrid input[data-e="${i.dataset.e}"][data-l="${l}"]`).checked).join(''); }); };
    $('#prole').onchange = draw; draw();
    $('#psave').onclick = async () => { await api('PUT', '/api/admin/permissions', perms); toast('Permissions saved', 'ok'); state.meta = await get('/api/meta'); };
    $('#preset').onclick = async () => { if (confirm('Reset every role to the framework defaults?')) { await api('POST', '/api/admin/permissions/reset'); toast('Reset', 'ok'); viewAdmin('permissions'); } };
  } else if (tab === 'settings') {
    const c = state.meta.config;
    T.innerHTML = `<form class="card" id="sf"><div class="help">These are the numbers the engine uses to compute RAG, slippage, recovery deadlines and delegation. Change them once with the CEO's approval; every dashboard recalculates immediately.</div><div class="fgrid">
      <div class="field"><label>Organisation name</label><input name="org_name" value="${esc(c.org_name)}"></div>
      <div class="field"><label>Recovery plan deadline (working days, §6)</label><input name="recovery_days" type="number" min="1" value="${c.recovery_days}"></div>
      <div class="field"><label>Material slippage threshold (days)</label><input name="slip_threshold_days" type="number" min="1" value="${c.slip_threshold_days}"><div class="hint">Non-critical activity forecast beyond baseline by this many days creates a Delay record.</div></div>
      <div class="field"><label>Critical-path slippage threshold (days)</label><input name="slip_threshold_critical" type="number" min="0" value="${c.slip_threshold_critical}"></div>
      <div class="field"><label>PM change-approval limit (PKR)</label><input name="pm_change_limit" type="number" value="${c.pm_change_limit}"><div class="hint">Above this cost impact — or any scope/baseline change — only the CEO can approve.</div></div>
      <div class="field"><label>Expiry warnings (days, comma-separated)</label><input name="expiry_warn_days" value="${c.expiry_warn_days.join(', ')}"></div>
      <div class="field"><label>SPI green ≥</label><input name="spi_green" type="number" step="0.01" value="${c.rag.spi_green}"></div>
      <div class="field"><label>SPI amber ≥ (below = red)</label><input name="spi_amber" type="number" step="0.01" value="${c.rag.spi_amber}"></div>
      <div class="field"><label>Cost ratio green ≤</label><input name="cost_green" type="number" step="0.01" value="${c.rag.cost_green}"></div>
      <div class="field"><label>Cost ratio amber ≤ (above = red)</label><input name="cost_amber" type="number" step="0.01" value="${c.rag.cost_amber}"></div>
      <div class="field"><label>Weekend days (0=Sun … 6=Sat)</label><input name="weekend" value="${c.weekend.join(', ')}"></div>
      <div class="field"><label>Public holidays (YYYY-MM-DD, comma-separated)</label><input name="holidays" value="${esc(c.holidays.join(', '))}"></div>
    </div><div class="actions" style="margin-top:16px"><button class="btn primary">Save settings</button></div></form>`;
    $('#sf').onsubmit = async e => { e.preventDefault(); const f = e.target; const list = s => s.split(',').map(x => x.trim()).filter(Boolean);
      const b = { org_name: f.org_name.value, recovery_days: +f.recovery_days.value, slip_threshold_days: +f.slip_threshold_days.value, slip_threshold_critical: +f.slip_threshold_critical.value, pm_change_limit: +f.pm_change_limit.value, expiry_warn_days: list(f.expiry_warn_days.value).map(Number).sort((a, b) => b - a), weekend: list(f.weekend.value).map(Number), holidays: list(f.holidays.value), rag: { spi_green: +f.spi_green.value, spi_amber: +f.spi_amber.value, cost_green: +f.cost_green.value, cost_amber: +f.cost_amber.value } };
      try { await api('PUT', '/api/admin/settings', b); toast('Settings saved — dashboards recalculated', 'ok'); state.meta = await get('/api/meta'); } catch (err) { toast(err.message, 'err'); } };
  } else if (tab === 'templates') {
    const tpl = await get('/api/admin/templates'); const types = def('projects').fields.find(f => f.k === 'type').options;
    const row = (t, i) => `<tr><td><input value="${esc(t.title)}" data-i="${i}" data-k="title" style="width:100%"></td><td><select data-i="${i}" data-k="authority">${state.meta.authorities.map(a => `<option ${a === t.authority ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select></td><td><select data-i="${i}" data-k="category">${def('approvals').fields.find(f => f.k === 'category').options.map(a => `<option ${a === t.category ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select></td><td class="small">${['*', ...types].map(ty => `<label class="chk" style="display:inline-flex;margin-right:8px"><input type="checkbox" data-i="${i}" data-ty="${esc(ty)}" ${t.types.includes(ty) ? 'checked' : ''}>${ty === '*' ? 'All' : esc(ty)}</label>`).join('')}</td><td><button class="btn sm danger" data-del="${i}">✕</button></td></tr>`;
    const draw = () => { T.innerHTML = `<div class="help">The starter library of statutory approvals applied to new projects with "Apply approval templates". The Chief Town Planner should verify applicability for each project and authority; edit freely.</div><div class="toolbar"><span class="small muted">${tpl.length} templates</span><span style="flex:1"></span><button class="btn sm" id="tadd">+ Add</button><button class="btn primary sm" id="tsave">Save library</button></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Approval</th><th>Authority</th><th>Category</th><th>Applies to project types</th><th></th></tr></thead><tbody>${tpl.map(row).join('')}</tbody></table></div>`;
      $$('[data-k]', T).forEach(i => i.onchange = () => tpl[i.dataset.i][i.dataset.k] = i.value);
      $$('[data-ty]', T).forEach(i => i.onchange = () => { const t = tpl[i.dataset.i]; t.types = i.checked ? [...new Set([...t.types, i.dataset.ty])] : t.types.filter(x => x !== i.dataset.ty); });
      $$('[data-del]', T).forEach(b => b.onclick = () => { tpl.splice(+b.dataset.del, 1); draw(); });
      $('#tadd').onclick = () => { tpl.push({ title: '', authority: 'LDA', category: 'NOC', types: ['*'] }); draw(); };
      $('#tsave').onclick = async () => { await api('PUT', '/api/admin/templates', { templates: tpl }); toast('Library saved', 'ok'); }; };
    draw();
  } else if (tab === 'audit') {
    const rows = await get('/api/audit?limit=400');
    T.innerHTML = `<div class="toolbar"><span class="small muted">Last ${rows.length} events · every create, update, delete, login, block and settings change</span></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>When</th><th>User</th><th>Action</th><th>Register</th><th>Record</th><th>Changes</th></tr></thead><tbody>${rows.map(x => { const diff = JSON.parse(x.diff || '{}'); const keys = Object.keys(diff).filter(k => k !== 'snapshot'); return `<tr onclick="${x.record_id && def(x.entity) ? `location.hash='#/r/${x.entity}/${x.record_id}'` : ''}"><td class="small mono">${fmtDT(x.at)}</td><td>${esc(x.user_name)}</td><td>${statusTag(x.action)}</td><td class="small">${esc(def(x.entity)?.label || x.entity)}</td><td class="code">${esc(x.code || '')}</td><td class="small muted">${keys.slice(0, 4).map(k => `${esc(k)}: ${esc(fmtV(Array.isArray(diff[k]) ? diff[k][1] : diff[k]))}`).join(' · ')}${keys.length > 4 ? ' …' : ''}</td></tr>`; }).join('')}</tbody></table></div>`;
  }
}
function userForm(u, onDone) {
  const isNew = !u; u = u || { role: 'viewer', active: true, projects: [] };
  modal(`<div class="drawer-head"><div><div class="eyebrow">${isNew ? 'New user' : 'Edit user'}</div><h2>${isNew ? 'Create account' : esc(u.name)}</h2></div><button class="btn ghost" data-close>✕</button></div>
    <form class="drawer-body" id="uf"><div id="uerr"></div><div class="fgrid">
      <div class="field"><label>Full name <span class="req">*</span></label><input name="name" value="${esc(u.name || '')}" required></div>
      <div class="field"><label>Email <span class="req">*</span></label><input name="email" type="email" value="${esc(u.email || '')}" required></div>
      <div class="field"><label>Role <span class="req">*</span></label><select name="role">${Object.entries(state.meta.roles).filter(([k]) => k !== 'admin' || state.meta.me.role === 'admin').map(([k, r]) => `<option value="${k}" ${k === u.role ? 'selected' : ''}>${esc(r.label)}</option>`).join('')}</select></div>
      <div class="field"><label>Designation</label><input name="title" value="${esc(u.title || '')}"></div>
      <div class="field"><label>Phone</label><input name="phone" value="${esc(u.phone || '')}"></div>
      <div class="field"><label>Status</label><label class="chk"><input type="checkbox" name="active" ${u.active ? 'checked' : ''}> Active</label></div>
      <div class="field wide"><label>Project access <span class="muted">(none selected = all projects)</span></label><div class="multiref">${state.meta.projects.map(p => `<label class="chk"><input type="checkbox" name="projects" value="${p.id}" ${u.projects?.includes(p.id) ? 'checked' : ''}> ${esc(p.name)}</label>`).join('')}</div></div>
      ${isNew ? '<div class="field wide"><label>Initial password <span class="muted">(blank = generate temporary)</span></label><input name="password" type="text" autocomplete="off"></div>' : '<div class="field wide"><label class="chk"><input type="checkbox" name="reset_password"> Reset password (issue a temporary password; user must change it at next sign-in)</label></div>'}
    </div><div id="ures" style="margin-top:12px"></div></form>
    <div class="drawer-foot"><button class="btn" data-close type="button">Cancel</button><button class="btn primary" id="usave">${isNew ? 'Create user' : 'Save'}</button></div>`);
  $('#usave').onclick = async () => { const f = $('#uf'); const b = { name: f.name.value, email: f.email.value, role: f.role.value, title: f.title.value, phone: f.phone.value, active: f.active.checked, projects: $$('[name=projects]:checked', f).map(x => x.value) };
    if (isNew && f.password.value) b.password = f.password.value; if (!isNew && f.reset_password.checked) b.reset_password = true;
    try { const r = isNew ? await api('POST', '/api/admin/users', b) : await api('PUT', `/api/admin/users/${u.id}`, b); if (r.temp_password) { $('#ures').innerHTML = `<div class="ok">Temporary password for ${esc(r.user.email)}: <b style="font-family:monospace;font-size:15px">${esc(r.temp_password)}</b><br><span class="small">Share it securely; they must change it at first sign-in.</span></div>`; $('#usave').textContent = 'Done'; $('#usave').onclick = () => { closeModal(); onDone(); }; } else { closeModal(); toast('Saved', 'ok'); onDone(); } state.meta = await get('/api/meta'); }
    catch (e) { $('#uerr').innerHTML = `<div class="err">${esc(e.message)}</div>`; } };
}

// ---------- start ----------
try { const t = localStorage.getItem('abs_theme'); if (t) document.documentElement.dataset.theme = t; } catch {}
boot();
})();
