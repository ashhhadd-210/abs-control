// Printable management reports (§4.7, §6): weekly dashboard and monthly CEO report.
// Rendered server-side as self-contained HTML; "Save as PDF" from the browser print dialog.
const S = require('./schema');
const { records, users } = require('./db');
const E = require('./engine');

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const uname = id => users.get(id)?.name || '—';
const money = n => n == null ? '—' : 'PKR ' + (Math.abs(n) >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : Math.round(n).toLocaleString());
const RAGL = { G: 'On track', A: 'At risk', R: 'Off track', N: 'No data' };
const rag = v => `<span class="rag rag-${v}"><i></i>${RAGL[v] || v}</span>`;
const fmtD = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

function render(kind, user, q) {
  const set = E.scope(user, q.project);
  const projects = [...set].map(id => records.get('projects', id)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
  const M = projects.map(E.projectMetrics);
  const pname = id => records.get('projects', id)?.name || '';
  const t = E.today();
  const monthly = kind === 'monthly';
  const title = monthly ? 'Monthly Management Report to the CEO' : kind === 'project' ? `Project Report — ${projects[0]?.name || ''}` : 'Weekly Coordination Dashboard';
  const inScope = e => records.all(e).filter(r => set.has(r.project_id));
  const kp = E.kpis(set);
  const inbox = E.inboxItems(set);
  const delays = inScope('delays').filter(d => d.status !== 'Closed').map(d => E.decorate('delays', d));
  const approvalsOpen = inScope('approvals').filter(a => !['Granted', 'Expired'].includes(a.status)).sort((a, b) => (a.decision_target || '9').localeCompare(b.decision_target || '9'));
  const expiring = inScope('approvals').filter(a => a.status === 'Granted' && a.expiry_date && E.days(t, a.expiry_date) <= 90).sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));
  const risks = inScope('risks').filter(r => r.status !== 'Closed').sort((a, b) => b.score - a.score).slice(0, monthly ? 12 : 6);
  const horizon = E.addDays(t, 14);
  const lookahead = inScope('activities').filter(a => a.status !== 'Completed' && (a.fc_start || a.base_start) <= horizon && (a.fc_finish || a.base_finish) >= t).slice(0, 15);
  const changes = inScope('changes').filter(c => c.updated_at.slice(0, 10) >= E.addDays(t, monthly ? -31 : -7));
  const actionsOpen = inScope('actions').filter(a => a.status === 'Open').map(a => E.decorate('actions', a));

  const tbl = (head, rows) => rows.length ? `<table><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>` : '<p class="muted">Nothing to report.</p>';

  const summary = (() => {
    const red = M.filter(m => m.rag.overall === 'R').length, amber = M.filter(m => m.rag.overall === 'A').length;
    const ap = M.reduce((s, m) => ({ g: s.g + m.approvals.granted, t: s.t + m.approvals.total, o: s.o + m.approvals.overdue }), { g: 0, t: 0, o: 0 });
    return `<div class="tiles">
      <div class="tile"><b>${M.length}</b><span>Active projects</span><small>${red} off track · ${amber} at risk</small></div>
      <div class="tile"><b>${ap.g}/${ap.t}</b><span>Approvals granted</span><small>${ap.o} past target decision</small></div>
      <div class="tile"><b>${delays.length}</b><span>Open delays</span><small>${delays.filter(d => d._c.plan_overdue).length} recovery plans overdue</small></div>
      <div class="tile"><b>${inbox.length}</b><span>Decisions required</span><small>from the CEO</small></div>
    </div>`;
  })();

  const ragTable = tbl(['Project', 'Phase', 'Approvals', 'Schedule', 'Cost', 'Quality', 'Safety', 'Decisions', 'Overall', 'Forecast completion'],
    M.map(m => `<tr><td><b>${esc(m.name)}</b><br><small>${esc(m.code)} · PM ${esc(uname(m.pm))}</small></td><td>${esc((m.phase || '').split(' — ')[0])}</td>
      ${['approvals', 'schedule', 'cost', 'quality', 'safety', 'decisions', 'overall'].map(k => `<td>${rag(m.rag[k])}</td>`).join('')}
      <td>${fmtD(m.forecast_completion)}<br><small>${m.variance_days > 0 ? '+' + m.variance_days + ' d vs baseline' : 'on baseline'}</small></td></tr>`));

  const kpiTable = tbl(['Ref', 'KPI', 'Value', 'Status', 'Basis'], kp.map(k => `<tr><td>${k.sec}</td><td>${esc(k.label)}</td><td><b>${k.value == null ? '—' : k.value + (k.unit === '%' ? '%' : k.unit ? ' ' + k.unit : '')}</b> <small>${esc(k.n)}</small></td><td>${rag(k.status)}</td><td><small>${esc(k.basis)}</small></td></tr>`));

  const sections = [
    ['Executive summary', summary],
    ['Portfolio RAG status', ragTable],
    ['Decisions required from the CEO', tbl(['Item', 'Project', 'Why it needs you'], inbox.map(i => `<tr><td><b>${esc(i.code)}</b> ${esc(i.title)}</td><td>${esc(pname(i.project_id))}</td><td>${esc(i.reason)}</td></tr>`))],
    ['Statutory approvals — open items', tbl(['Approval', 'Project', 'Authority', 'Status', 'Target decision', 'Next action', 'Lead'], approvalsOpen.slice(0, monthly ? 40 : 20).map(a => `<tr class="${a.decision_target && a.decision_target < t ? 'late' : ''}"><td><b>${esc(a.code)}</b> ${esc(a.title)}</td><td>${esc(pname(a.project_id))}</td><td>${esc(a.authority)}</td><td>${esc(a.status)}</td><td>${fmtD(a.decision_target)}</td><td>${esc(a.next_action || a.observations || '')}</td><td>${esc(uname(a.internal_lead))}</td></tr>`))],
    ['Approvals expiring within 90 days', tbl(['Approval', 'Project', 'Reference', 'Expires', 'Days'], expiring.map(a => `<tr><td>${esc(a.title)}</td><td>${esc(pname(a.project_id))}</td><td>${esc(a.reference_no)}</td><td>${fmtD(a.expiry_date)}</td><td>${E.days(t, a.expiry_date)}</td></tr>`))],
    ['Delays & recovery plans', tbl(['Delay', 'Project', 'Impact', 'Plan due', 'Status', 'Revised forecast', 'Owner'], delays.map(d => `<tr class="${d._c.plan_overdue ? 'late' : ''}"><td>${esc(d.title)}</td><td>${esc(pname(d.project_id))}</td><td>${d.impact_days || 0} d</td><td>${fmtD(d.plan_due)}</td><td>${esc(d.status)}</td><td>${fmtD(d.revised_forecast)}</td><td>${esc(uname(d.owner))}</td></tr>`))],
    ['Two-week look-ahead', tbl(['Activity', 'Project', 'Forecast', 'Progress', 'Approvals'], lookahead.map(a => { const d = E.decorate('activities', a); return `<tr><td>${a.critical ? '◆ ' : ''}${esc(a.name)}</td><td>${esc(pname(a.project_id))}</td><td>${fmtD(a.fc_start)} → ${fmtD(a.fc_finish)}</td><td>${a.pct || 0}% <small>(plan ${d._c.planned}%)</small></td><td>${d._c.blockers.length ? '<b class="bad">Blocked</b>' : 'Clear'}</td></tr>`; }))],
    ['Top risks & issues', tbl(['Risk', 'Project', 'Score', 'Escalation', 'Mitigation', 'Owner'], risks.map(r => `<tr><td>${esc(r.title)}</td><td>${esc(pname(r.project_id))}</td><td><b>${r.score}</b></td><td>${esc(r.escalation)}</td><td><small>${esc(r.mitigation)}</small></td><td>${esc(uname(r.owner))}</td></tr>`))],
    [`Change control — last ${monthly ? '30' : '7'} days`, tbl(['Change', 'Project', 'Type', 'Cost', 'Time', 'Status'], changes.map(c => `<tr><td>${esc(c.code)} ${esc(c.title)}</td><td>${esc(pname(c.project_id))}</td><td>${esc(c.kind)}</td><td>${money(c.cost_impact)}</td><td>${c.time_impact || 0} d</td><td>${esc(c.status)}</td></tr>`))],
    ['Open actions (decision & action log)', tbl(['Action', 'Project', 'Owner', 'Due'], actionsOpen.slice(0, 25).map(a => `<tr class="${a._c.overdue ? 'late' : ''}"><td>${esc(a.description)}</td><td>${esc(pname(a.project_id) || 'Company')}</td><td>${esc(uname(a.owner))}</td><td>${fmtD(a.due_date)}</td></tr>`))],
  ];
  if (monthly) {
    sections.splice(2, 0, ['KPI scorecard (§8 & §17)', kpiTable]);
    sections.push(['Budget & forecast', tbl(['Project', 'Budget', 'Committed', 'Actual', 'Forecast final', 'Variance', 'RAG'], M.map(m => `<tr><td>${esc(m.name)}</td><td>${money(m.cost.budget)}</td><td>${money(m.cost.committed)}</td><td>${money(m.cost.actual)}</td><td>${money(m.cost.forecast)}</td><td>${money(m.cost.forecast - m.cost.budget)}</td><td>${rag(m.rag.cost)}</td></tr>`))]);
    sections.push(['Quality & safety', tbl(['Project', 'Open NCRs', 'Overdue NCRs', 'Incidents (30 d)', 'Quality', 'Safety'], M.map(m => `<tr><td>${esc(m.name)}</td><td>${m.quality.open}</td><td>${m.quality.overdue}</td><td>${m.safety.incidents30}</td><td>${rag(m.rag.quality)}</td><td>${rag(m.rag.safety)}</td></tr>`))]);
    sections.push(['Regularization', tbl(['Deficiency', 'Project', 'Type', 'Lawful route', 'Status', 'Target'], inScope('deficiencies').filter(d => d.status !== 'Closed').map(d => `<tr><td>${esc(d.title)}</td><td>${esc(pname(d.project_id))}</td><td>${esc(d.type)}</td><td><small>${esc(d.lawful_route)}</small></td><td>${esc(d.status)}</td><td>${fmtD(d.target_date)}</td></tr>`))]);
    sections.push(['Phase gates', tbl(['Project', 'Current phase', 'Gate status'], M.map(m => `<tr><td>${esc(m.name)}</td><td>${esc(m.phase)}</td><td>${esc(m.gate?.status || '—')} ${m.gate ? `(${(m.gate.checklist || []).filter(c => c.done).length}/${(m.gate.checklist || []).length} items)` : ''}</td></tr>`))]);
  } else {
    sections.push(['KPI scorecard', kpiTable]);
  }

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>
:root{--ink:#14213d;--muted:#5b6475;--line:#d9dee8;--brand:#1f4e79;--G:#0ca30c;--A:#fab219;--R:#d03b3b;--N:#9aa3b2}
*{box-sizing:border-box}body{margin:0;font:13px/1.45 "Segoe UI",system-ui,Arial,sans-serif;color:var(--ink);background:#fff}
.page{max-width:1100px;margin:0 auto;padding:28px 32px}
header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid var(--brand);padding-bottom:12px;margin-bottom:18px}
header h1{margin:0;font-size:22px;color:var(--brand)}header .org{font-weight:700;letter-spacing:.12em;color:var(--brand);font-size:12px}
header .meta{text-align:right;color:var(--muted);font-size:12px}
h2{font-size:14px;text-transform:uppercase;letter-spacing:.06em;color:var(--brand);margin:24px 0 8px;border-bottom:1px solid var(--line);padding-bottom:4px}
table{width:100%;border-collapse:collapse;font-size:12px}th{text-align:left;background:#eef2f8;color:var(--ink);padding:6px 8px;font-weight:600}
td{padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}tr.late td{background:#fdf1f1}small{color:var(--muted)}
.rag{display:inline-flex;align-items:center;gap:5px;font-size:11px;white-space:nowrap}.rag i{width:10px;height:10px;border-radius:50%;display:inline-block}
.rag-G i{background:var(--G)}.rag-A i{background:var(--A)}.rag-R i{background:var(--R)}.rag-N i{background:var(--N)}
.tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.tile{border:1px solid var(--line);border-radius:8px;padding:10px 12px}
.tile b{display:block;font-size:24px;color:var(--brand)}.tile span{display:block;font-weight:600}.muted{color:var(--muted)}.bad{color:var(--R)}
.bar{position:sticky;top:0;background:#14213d;color:#fff;padding:8px 16px;display:flex;gap:10px;align-items:center}
.bar button,.bar a{background:#fff;color:#14213d;border:0;border-radius:6px;padding:6px 12px;font-weight:600;cursor:pointer;text-decoration:none;font-size:12px}
footer{margin-top:28px;border-top:1px solid var(--line);padding-top:8px;color:var(--muted);font-size:11px;display:flex;justify-content:space-between}
.sign{margin-top:30px;display:grid;grid-template-columns:1fr 1fr;gap:30px}.sign div{border-top:1px solid var(--ink);padding-top:4px;color:var(--muted)}
@media print{.bar{display:none}.page{padding:0}h2{break-after:avoid}tr{break-inside:avoid}@page{size:A4 landscape;margin:12mm}}
@media(max-width:700px){.tiles{grid-template-columns:1fr 1fr}.page{padding:16px}table{display:block;overflow-x:auto}}
</style></head><body>
<div class="bar"><button onclick="print()">Print / Save as PDF</button><a href="/">← Back to ABS Control</a><span style="opacity:.7">Report generated live from the registers</span></div>
<div class="page">
<header><div><div class="org">${esc(E.cfg().org_name.toUpperCase())}</div><h1>${esc(title)}</h1><small>Government Affairs, Planning Approvals & Project Coordination · Project Management</small></div>
<div class="meta">As of <b>${fmtD(t)}</b><br>Prepared by ${esc(user.name)}<br>${esc(S.ROLES[user.role].label)}<br>${projects.length === 1 ? esc(projects[0].name) : 'All projects in scope'}</div></header>
${sections.map(([h, b]) => `<h2>${esc(h)}</h2>${b}`).join('\n')}
${monthly ? `<div class="sign"><div>Chief Town Planner / Chief Coordinator</div><div>CEO decision &amp; signature</div></div>` : ''}
<footer><span>${esc(E.cfg().org_name)} | CONFIDENTIAL — FOR MANAGEMENT REVIEW</span><span>All statutory approvals remain subject to decisions of the competent authorities.</span></footer>
</div></body></html>`;
}

module.exports = { render };
