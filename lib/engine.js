// The engine: validation, framework rules, computed state, RAG, KPIs and alerts.
const S = require('./schema');
const { records, settings, users, audit, notifications, now } = require('./db');

class RuleError extends Error {
  constructor(message, status = 422, code = 'RULE') { super(message); this.status = status; this.code = code; }
}

// ---------- dates ----------
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const TZ = process.env.ABS_TZ || 'Asia/Karachi';
const today = () => process.env.ABS_TODAY || new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const days = (a, b) => Math.round((parse(b) - parse(a)) / 86400000); // b - a
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
function addWorkingDays(s, n) {
  const wk = cfg().weekend, hol = new Set(cfg().holidays);
  let d = parse(s), left = n;
  while (left > 0) { d.setDate(d.getDate() + 1); if (!wk.includes(d.getDay()) && !hol.has(iso(d))) left--; }
  return iso(d);
}
const cfg = () => ({ ...S.DEFAULT_SETTINGS, ...settings.get('config', {}) });

// ---------- permissions ----------
function permissions() {
  const stored = settings.get('permissions', null);
  const base = S.defaultPermissions();
  if (!stored) return base;
  for (const r in stored) base[r] = { ...base[r], ...stored[r] };
  return base;
}
function can(user, entity, letter) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return (permissions()[user.role]?.[entity] || '').includes(letter);
}
function projectIds(user) {
  const all = records.all('projects').map(p => p.id);
  if (!user || ['admin', 'ceo'].includes(user.role) || !user.projects?.length) return new Set(all);
  return new Set(user.projects.filter(id => all.includes(id)));
}
function visible(user, entity, rec) {
  if (entity === 'projects') return projectIds(user).has(rec.id);
  if (!rec.project_id) return !!S.ENTITIES[entity].projectOptional;
  return projectIds(user).has(rec.project_id);
}

// ---------- coercion ----------
function coerce(def, input, { system = false } = {}) {
  const out = {};
  for (const fd of def.fields) {
    if (!(fd.k in input)) continue;
    if (fd.readonly && !system) continue;
    let v = input[fd.k];
    switch (fd.type) {
      case 'number': case 'money': case 'percent':
        v = v === '' || v == null ? null : Number(String(v).replace(/,/g, ''));
        if (v != null && Number.isNaN(v)) throw new RuleError(`${fd.label} must be a number`);
        if (fd.type === 'percent' && v != null) v = Math.max(0, Math.min(100, v));
        if (fd.min != null && v != null && (v < fd.min || v > fd.max)) throw new RuleError(`${fd.label} must be between ${fd.min} and ${fd.max}`);
        break;
      case 'bool': v = v === true || v === 'true' || v === 1 || v === '1' || v === 'yes'; break;
      case 'date':
        v = v ? String(v).slice(0, 10) : '';
        if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new RuleError(`${fd.label} must be a date (YYYY-MM-DD)`);
        break;
      case 'multiref': case 'files': v = Array.isArray(v) ? v.filter(Boolean) : (v ? String(v).split(/[;,]/).map(x => x.trim()).filter(Boolean) : []); break;
      case 'checklist': v = Array.isArray(v) ? v.map(i => ({ item: String(i.item), done: !!i.done })) : []; break;
      case 'select':
        v = v == null ? '' : String(v);
        if (v && !fd.options.includes(v)) throw new RuleError(`${fd.label}: "${v}" is not a valid option`);
        break;
      default: v = v == null ? '' : String(v).trim();
    }
    out[fd.k] = v;
  }
  return out;
}

const changed = (next, prev, k) => prev && JSON.stringify(next[k] ?? '') !== JSON.stringify(prev[k] ?? '');
const fieldLabel = (entity, k) => S.ENTITIES[entity].fields.find(x => x.k === k)?.label || k;
const roleIn = (u, ...r) => r.includes(u.role) || u.role === 'admin';

// ---------- approval gating (§5) ----------
function approvalBlockers(ids) {
  const t = today(), out = [];
  for (const id of ids || []) {
    const a = records.get('approvals', id);
    if (!a) continue;
    if (a.status !== 'Granted') out.push(`${a.code} ${a.title} is "${a.status}", not Granted`);
    else if (a.expiry_date && a.expiry_date < t) out.push(`${a.code} ${a.title} expired on ${a.expiry_date}`);
    else if (!a.conditions_ack) out.push(`${a.code} ${a.title}: conditions not yet acknowledged by site`);
  }
  return out;
}

function requireApprovedChange(entity, next, prev, project, fieldsChanged) {
  const ref = next.change_ref;
  const cr = ref && records.get('changes', ref);
  if (!cr || cr.status !== 'Approved' || cr.project_id !== project.id)
    throw new RuleError(`Baseline is locked for ${project.name}. Changing ${fieldsChanged.map(k => fieldLabel(entity, k)).join(', ')} requires an Approved Change Request linked in "Change Request" (§16).`, 409, 'BASELINE_LOCKED');
}

// ---------- rules ----------
function beforeSave(entity, next, prev, user, ctx) {
  const def = S.ENTITIES[entity];
  const t = today();
  const st = def.status;
  const statusChanged = st && (!prev || next[st] !== prev[st]);

  // generic approval-authority check
  if (statusChanged && def.approveStatuses?.includes(next[st]) && !ctx.system && !can(user, entity, 'a'))
    throw new RuleError(`Your role (${S.ROLES[user.role].label}) cannot set ${def.label} to "${next[st]}". Approval authority required.`, 403, 'NO_AUTHORITY');

  // required fields
  for (const fd of def.fields) if (fd.required && (next[fd.k] === '' || next[fd.k] == null)) throw new RuleError(`${fd.label} is required`);

  const project = next.project_id ? records.get('projects', next.project_id) : null;

  switch (entity) {
    case 'projects': {
      if (prev && changed(next, prev, 'phase') && !ctx.system)
        throw new RuleError('Project phase advances only through an approved Phase Gate (§14). Submit the gate for CEO approval.', 409, 'GATE');
      if (prev && prev.baseline_locked && !next.baseline_locked && !roleIn(user, 'ceo'))
        throw new RuleError('Only the CEO can unlock an approved baseline.', 403);
      if (prev?.baseline_locked && next.baseline_locked && !ctx.system) {
        const bf = def.fields.filter(x => x.baseline && changed(next, prev, x.k)).map(x => x.k);
        if (bf.length) requireApprovedChange(entity, next, prev, prev, bf);
      }
      break;
    }
    case 'approvals': {
      if (next.status === 'Granted') {
        const miss = [];
        if (!next.reference_no) miss.push('approval reference no.');
        if (!next.issued_on) miss.push('issue date');
        if (!next.letter) miss.push('the authority letter / certificate');
        if (miss.length) throw new RuleError(`Cannot mark Granted without written confirmation from the issuing authority (§4.4). Missing: ${miss.join(', ')}.`, 409, 'NO_WRITTEN_CONFIRMATION');
      }
      if (['Submitted', 'Resubmitted'].includes(next.status) && !next.submitted_on) next.submitted_on = t;
      if (next.status === 'Observations' && !next.obs_received_on) next.obs_received_on = t;
      if (prev?.status === 'Observations' && next.status === 'Resubmitted' && !next.obs_closed_on) next.obs_closed_on = t;
      break;
    }
    case 'deficiencies':
      if (next.status === 'Closed' && !next.closure_evidence) throw new RuleError('A deficiency closes only with closure evidence attached (§5).', 409);
      break;
    case 'fees':
      if (['Paid', 'Verified'].includes(next.status) && !next.receipt) throw new RuleError('Lawful-conduct control (§4.10): attach the official bank receipt before marking Paid.', 409);
      break;
    case 'activities': {
      if (!next.weight) next.weight = 1;
      const starting = ['In Progress', 'Completed'].includes(next.status) || next.act_start || (next.pct > 0);
      const wasStarted = prev && (['In Progress', 'Completed'].includes(prev.status) || prev.act_start || prev.pct > 0);
      if (starting && !wasStarted && next.requires?.length) {
        const blk = approvalBlockers(next.requires);
        if (blk.length) {
          notifications.upsert({ dedupe: `evt:unauth:${prev?.id || 'new'}:${t}:${user.id}`, audience: ['role:ceo', 'role:chief_coord', project?.pm].filter(Boolean),
            severity: 'critical', kind: 'unauthorized', title: `Blocked: work start without approval — ${next.name}`,
            body: `${user.name} attempted to start "${next.name}" (${project?.name || ''}). ${blk.join('; ')}.`, entity, record_id: prev?.id, project_id: next.project_id });
          audit.log(user, entity, prev || { project_id: next.project_id }, 'blocked', { reason: blk });
          throw new RuleError(`Work cannot start: submission is not authorization (§5). ${blk.join('; ')}. The CEO and Chief Coordinator have been notified.`, 409, 'UNAUTHORIZED_WORK');
        }
      }
      if (next.status === 'In Progress' && !next.act_start) next.act_start = t;
      if (next.status === 'Completed') { next.pct = 100; if (!next.act_finish) next.act_finish = t; if (!next.act_start) next.act_start = next.act_finish; }
      if (next.pct === 100 && next.status !== 'Completed' && !ctx.system) { next.status = 'Completed'; if (!next.act_finish) next.act_finish = t; }
      if (!next.fc_start) next.fc_start = next.base_start;
      if (!next.fc_finish) next.fc_finish = next.base_finish;
      if (next.base_start && next.base_finish && next.base_finish < next.base_start) throw new RuleError('Baseline finish is before baseline start');
      if (project?.baseline_locked && !ctx.system) {
        const bf = prev ? def.fields.filter(x => x.baseline && changed(next, prev, x.k)).map(x => x.k) : ['base_start', 'base_finish'];
        if (bf.length) requireApprovedChange(entity, next, prev, project, bf);
      }
      break;
    }
    case 'budget_lines':
      if (project?.baseline_locked && !ctx.system) {
        const bf = prev ? (changed(next, prev, 'budget') ? ['budget'] : []) : ['budget'];
        if (bf.length) requireApprovedChange(entity, next, prev, project, bf);
      }
      break;
    case 'delays':
      next.plan_due = addWorkingDays(next.identified_on, cfg().recovery_days);
      if (next.status !== 'Plan Due' && (!prev || prev.status === 'Plan Due')) {
        if (!next.mitigation || !next.revised_forecast) throw new RuleError('A recovery plan needs mitigation actions and a revised forecast (§6).');
        if (!next.plan_submitted_on) next.plan_submitted_on = t;
      }
      break;
    case 'risks':
      next.score = (Number(next.likelihood) || 0) * (Number(next.impact) || 0);
      if (!next.escalation) next.escalation = 'None';
      if (next.score >= 15 && next.escalation !== 'CEO' && next.status !== 'Closed') next.escalation = 'CEO'; // §4.8 escalate material risks promptly
      if (next.kind === '') next.kind = 'Risk';
      if (!next.status) next.status = 'Open';
      break;
    case 'changes': {
      if (prev && ['Approved', 'Implemented'].includes(prev.status) && !ctx.system)
        for (const k of ['cost_impact', 'time_impact', 'kind', 'reason']) if (changed(next, prev, k)) throw new RuleError('An approved change cannot be altered. Raise a new Change Request.', 409);
      if (statusChanged && next.status === 'Approved') {
        const limit = cfg().pm_change_limit;
        if (Math.abs(next.cost_impact || 0) > limit && !roleIn(user, 'ceo') && !ctx.system)
          throw new RuleError(`Cost impact exceeds the PM delegated limit (PKR ${limit.toLocaleString()}). CEO approval required.`, 403, 'DELEGATION');
        if (['Schedule / Baseline', 'Scope'].includes(next.kind) && !roleIn(user, 'ceo') && !ctx.system)
          throw new RuleError('Scope and baseline changes require CEO approval (§16).', 403, 'DELEGATION');
        next.approved_by = user.id; next.approved_on = t;
      }
      if (statusChanged && next.status === 'Rejected') { next.approved_by = user.id; next.approved_on = t; }
      if (statusChanged && next.status === 'Implemented') {
        if (prev?.status !== 'Approved') throw new RuleError('A variation must be Approved before it is implemented (§15, Phase III).', 409, 'NOT_APPROVED');
        if (!next.implemented_on) next.implemented_on = t;
      }
      if (!next.status) next.status = 'Draft';
      break;
    }
    case 'payment_apps':
      if (next.status === 'Certified') {
        if (!(next.verified > 0)) throw new RuleError('Enter the verified work value before certifying.');
        if ((next.certified || 0) > next.verified) throw new RuleError('Certified amount cannot exceed verified work value.');
        if (!next.certified) next.certified = next.verified;
      }
      if (statusChanged && next.status === 'Paid' && prev?.status !== 'Certified') throw new RuleError('Only a Certified application can be marked Paid.', 409);
      break;
    case 'ncrs':
      if (statusChanged && next.status === 'Closed') {
        if (!next.corrective_action) throw new RuleError('Record the corrective action before closing.');
        next.verified_by = user.id; if (!next.closed_on) next.closed_on = t;
      }
      if (!next.raised_on) next.raised_on = t;
      break;
    case 'meetings':
      if (statusChanged && next.status === 'Closed' && prev) {
        const bad = records.all('actions').filter(a => a.meeting === prev.id && (!a.owner || !a.due_date));
        if (bad.length) throw new RuleError(`Cannot close: ${bad.length} decision/action item(s) lack an owner or target date (§16).`, 409);
      }
      break;
    case 'gates': {
      if (!prev && (!next.checklist || !next.checklist.length)) next.checklist = (S.GATE_CHECKLISTS[next.phase] || []).map(item => ({ item, done: false }));
      if (!next.status) next.status = 'Open';
      if (statusChanged && next.status === 'Submitted') {
        const open = (next.checklist || []).filter(c => !c.done);
        if (open.length) throw new RuleError(`Gate cannot be submitted — ${open.length} checklist item(s) incomplete: ${open.map(c => c.item).slice(0, 3).join('; ')}${open.length > 3 ? '…' : ''}`, 409);
        next.submitted_by = user.id;
      }
      if (statusChanged && next.status === 'Approved') {
        if (prev?.status !== 'Submitted' && !ctx.system) throw new RuleError('Only a Submitted gate can be approved.', 409);
        if (!roleIn(user, 'ceo') && !ctx.system) throw new RuleError('Phase gates are approved by the CEO (§14).', 403);
        next.approved_by = user.id; next.decided_on = t;
      }
      if (statusChanged && next.status === 'Rejected') {
        if (!next.remarks) throw new RuleError('Give remarks when rejecting a gate.');
        next.approved_by = user.id; next.decided_on = t;
      }
      if (prev && prev.status === 'Approved' && !ctx.system) throw new RuleError('An approved gate is closed and cannot be edited.', 409);
      break;
    }
  }
}

function afterSave(entity, rec, prev, user) {
  if (entity === 'gates' && rec.status === 'Approved' && prev?.status !== 'Approved') {
    const p = records.get('projects', rec.project_id);
    const i = S.PROJECT_PHASES.indexOf(rec.phase);
    if (p && i >= 0 && i < S.PROJECT_PHASES.length - 1 && p.phase === rec.phase) {
      const nextPhase = S.PROJECT_PHASES[i + 1];
      save('projects', p.id, { phase: nextPhase }, user, { system: true });
      save('gates', null, { project_id: p.id, phase: nextPhase }, user, { system: true });
    }
  }
  if (entity === 'projects' && !prev) {
    save('gates', null, { project_id: rec.id, phase: rec.phase || S.PROJECT_PHASES[0] }, user, { system: true });
  }
  if (entity === 'activities') detectSlippage(rec, user);
}

function slipDays(a) {
  if (a.status === 'Completed' || !a.base_finish) return a.act_finish && a.base_finish ? Math.max(0, days(a.base_finish, a.act_finish)) : 0;
  const fc = a.fc_finish || a.base_finish;
  const t = today();
  const eff = fc < t && a.status !== 'Completed' ? t : fc;  // overdue & unfinished: slips day by day
  return Math.max(0, days(a.base_finish, eff));
}

function detectSlippage(a, user) {
  if (a.status === 'Completed') return;
  const c = cfg();
  const slip = slipDays(a);
  const material = slip >= c.slip_threshold_days || (a.critical && slip >= c.slip_threshold_critical);
  if (!material) return;
  const open = records.all('delays').find(d => d.activity === a.id && d.status !== 'Closed');
  if (open) return;
  const p = records.get('projects', a.project_id);
  const d = save('delays', null, {
    project_id: a.project_id, title: `Slippage: ${a.name} (+${slip}d)`, activity: a.id, identified_on: today(),
    impact_days: slip, owner: a.owner || p?.pm || '', status: 'Plan Due',
    cause: 'Auto-detected: forecast finish beyond baseline beyond the material-slippage threshold.',
  }, user || systemUser(), { system: true });
  notifications.upsert({ dedupe: `evt:slip:${a.id}:${d.id}`, audience: ['role:ceo', 'role:chief_coord', p?.pm, a.owner].filter(Boolean), severity: 'serious', kind: 'slippage',
    title: `Material slippage — recovery plan due ${d.plan_due}`, body: `${a.code} ${a.name} on ${p?.name} is ${slip} day(s) behind baseline${a.critical ? ' (critical path)' : ''}.`,
    entity: 'delays', record_id: d.id, project_id: a.project_id });
}

const systemUser = () => ({ id: 'system', name: 'System', role: 'admin' });

// ---------- save / remove ----------
function save(entity, id, input, user, ctx = {}) {
  const def = S.ENTITIES[entity];
  if (!def) throw new RuleError('Unknown register', 404);
  const prev = id ? records.get(entity, id) : null;
  if (id && !prev) throw new RuleError('Record not found', 404);
  if (!ctx.system) {
    if (!can(user, entity, id ? 'u' : 'c')) throw new RuleError(`Your role cannot ${id ? 'edit' : 'create'} ${def.plural}.`, 403);
    if (prev && !visible(user, entity, prev)) throw new RuleError('No access to this project', 403);
  }
  const data = coerce(def, input, ctx);
  let project_id = prev ? prev.project_id : null;
  if (entity !== 'projects') {
    if ('project_id' in input) project_id = input.project_id || null;
    if (!project_id && !def.projectOptional) throw new RuleError('Select a project');
    if (project_id && !ctx.system && !projectIds(user).has(project_id)) throw new RuleError('No access to this project', 403);
  }
  // defaults for status on create
  if (!prev && def.status && !data[def.status]) data[def.status] = def.fields.find(x => x.k === def.status).options[0];
  if (!prev && entity === 'projects') { data.phase = data.phase || S.PROJECT_PHASES[0]; }
  const next = { ...(prev ? records.strip(prev) : {}), ...data, project_id };
  if (entity === 'projects') delete next.project_id;
  beforeSave(entity, next, prev, user, ctx);
  const payload = { ...next }; delete payload.project_id;
  let rec;
  if (prev) {
    const diff = {};
    for (const k of Object.keys(payload)) if (changed(payload, prev, k)) diff[k] = [prev[k] ?? null, payload[k]];
    if (project_id !== prev.project_id) diff.project_id = [prev.project_id, project_id];
    if (!Object.keys(diff).length) return prev;
    rec = records.update(entity, id, { ...payload, project_id: entity === 'projects' ? null : project_id }, user.id);
    audit.log(user, entity, rec, ctx.system ? 'system-update' : 'update', diff);
  } else {
    rec = records.insert(entity, def.prefix, entity === 'projects' ? null : project_id, payload, user.id);
    audit.log(user, entity, rec, ctx.system ? 'system-create' : 'create', {});
  }
  afterSave(entity, rec, prev, user);
  return records.get(entity, rec.id);
}

function remove(entity, id, user) {
  const prev = records.get(entity, id);
  if (!prev) throw new RuleError('Not found', 404);
  if (!can(user, entity, 'd') || !visible(user, entity, prev)) throw new RuleError('Your role cannot delete this record.', 403);
  if (entity === 'gates' && prev.status === 'Approved') throw new RuleError('Approved gates are permanent records.', 409);
  if (entity === 'approvals' && prev.status === 'Granted' && user.role !== 'admin') throw new RuleError('Granted approvals are permanent records; mark Expired or Superseded instead.', 409);
  if (entity === 'changes' && ['Approved', 'Implemented'].includes(prev.status)) throw new RuleError('Approved changes are permanent records.', 409);
  records.remove(entity, id);
  audit.log(user, entity, prev, 'delete', { snapshot: records.strip(prev) });
}

// ---------- computed decoration ----------
const CLOSED = new Set(['Closed', 'Done', 'Granted', 'Verified', 'Completed', 'Implemented', 'Approved', 'Paid', 'Cancelled', 'Rejected', 'Pass', 'Fixed', 'Acknowledged', 'Superseded', 'Expired']);
const DUE_FIELDS = ['due_date', 'target_date', 'plan_due', 'decision_target', 'follow_up', 'fc_finish', 'required_on_site', 'date'];
function dueOf(entity, r) {
  if (entity === 'approvals' && r.status === 'Granted') return r.expiry_date || null;
  if (entity === 'contracts') return r.delivered_on ? (r.expiry || null) : (r.required_on_site || null);
  for (const k of DUE_FIELDS) if (r[k] && S.ENTITIES[entity].fields.some(x => x.k === k)) return r[k];
  return null;
}
function isOpen(entity, r) { const st = S.ENTITIES[entity].status; return st ? !CLOSED.has(r[st]) : false; }

function plannedPct(a, t) {
  if (!a.base_start || !a.base_finish) return 0;
  if (t < a.base_start) return 0;
  if (t >= a.base_finish) return 100;
  const span = days(a.base_start, a.base_finish) || 1;
  return Math.round((days(a.base_start, t) / span) * 1000) / 10;
}

function decorate(entity, r) {
  const t = today(), c = {};
  const st = S.ENTITIES[entity].status;
  const due = dueOf(entity, r);
  c.open = isOpen(entity, r);
  if (due && c.open) { c.due = due; c.days_left = days(t, due); c.overdue = c.days_left < 0; }
  if (entity === 'approvals') {
    if (r.status === 'Granted' && r.expiry_date) { c.days_to_expiry = days(t, r.expiry_date); c.expiring = c.days_to_expiry <= cfg().expiry_warn_days[0]; c.overdue = false; }
    c.complete = !!(r.status && r.internal_lead && r.decision_target);
  }
  if (entity === 'activities') {
    c.planned = plannedPct(r, t); c.slip = slipDays(r);
    c.blockers = r.status === 'Not Started' ? approvalBlockers(r.requires) : [];
    c.overdue = r.status !== 'Completed' && r.fc_finish && r.fc_finish < t;
  }
  if (entity === 'delays') c.plan_overdue = r.status === 'Plan Due' && r.plan_due < t;
  return { ...r, _c: c };
}

// ---------- metrics ----------
function scope(user, pid) {
  const ids = projectIds(user);
  if (pid && pid !== 'all') return ids.has(pid) ? new Set([pid]) : new Set();
  return ids;
}
const inScope = (set, entity) => records.all(entity).filter(r => set.has(r.project_id));
const sum = (arr, k) => arr.reduce((s, r) => s + (Number(r[k]) || 0), 0);
const pct = (n, d) => d ? Math.round((n / d) * 1000) / 10 : null;

function scheduleOf(acts, t = today()) {
  const W = sum(acts, 'weight') || acts.length || 1;
  const planned = acts.reduce((s, a) => s + (a.weight || 1) * plannedPct(a, t), 0) / W;
  const earned = acts.reduce((s, a) => s + (a.weight || 1) * (a.pct || 0), 0) / W;
  return { planned: Math.round(planned * 10) / 10, earned: Math.round(earned * 10) / 10, spi: planned > 0 ? Math.round((earned / planned) * 100) / 100 : 1 };
}

function projectMetrics(p) {
  const t = today(), c = cfg();
  const by = e => records.all(e).filter(r => r.project_id === p.id);
  const ap = by('approvals'), acts = by('activities'), lines = by('budget_lines'), ncr = by('ncrs'), hse = by('safety');
  const delays = by('delays'), risks = by('risks'), changes = by('changes'), gates = by('gates'), defs = by('deficiencies');
  const sch = scheduleOf(acts, t);
  const actsMax = acts.reduce((m, a) => (a.fc_finish || a.base_finish) > m ? (a.fc_finish || a.base_finish) : m, '');
  const fcFinish = [actsMax, p.forecast_completion || '', p.baseline_completion || ''].sort().pop() || '';
  const variance = p.baseline_completion && fcFinish ? days(p.baseline_completion, fcFinish) : 0;
  const approvals = {
    total: ap.length, granted: ap.filter(a => a.status === 'Granted').length,
    pending: ap.filter(a => !['Granted', 'Rejected', 'Expired'].includes(a.status)).length,
    overdue: ap.filter(a => !['Granted', 'Rejected'].includes(a.status) && a.decision_target && a.decision_target < t).length,
    overdue14: ap.filter(a => !['Granted', 'Rejected'].includes(a.status) && a.decision_target && days(a.decision_target, t) > 14).length,
    observations: ap.filter(a => a.status === 'Observations').length,
    rejected: ap.filter(a => a.status === 'Rejected').length,
    expired: ap.filter(a => a.status === 'Expired' || (a.status === 'Granted' && a.expiry_date && a.expiry_date < t)).length,
    expiring: ap.filter(a => a.status === 'Granted' && a.expiry_date && a.expiry_date >= t && days(t, a.expiry_date) <= 60).length,
  };
  const budget = sum(lines, 'budget') || p.budget || 0, forecast = sum(lines, 'forecast'), actual = sum(lines, 'actual'), committed = sum(lines, 'committed');
  const costRatio = budget ? forecast / budget : 1;
  const ncrOpen = ncr.filter(n => n.status !== 'Closed');
  const since30 = addDays(t, -30);
  const incidents = hse.filter(h => ['Incident', 'Near Miss'].includes(h.kind) && h.date >= since30);
  const ceoPending = inboxItems(new Set([p.id])).length;
  const unauth = notifications.forUser({ id: '-', role: 'ceo' }, 1000).filter(n => n.kind === 'unauthorized' && n.project_id === p.id && n.at >= addDays(t, -30)).length;
  const critSlip = acts.filter(a => a.critical && slipDays(a) >= c.slip_threshold_critical).length;

  const rag = {
    approvals: approvals.overdue14 || approvals.rejected || approvals.expired || unauth ? 'R' : approvals.overdue || approvals.observations || approvals.expiring ? 'A' : 'G',
    schedule: sch.spi < c.rag.spi_amber || variance > 30 ? 'R' : sch.spi < c.rag.spi_green || critSlip || variance > 0 ? 'A' : 'G',
    cost: costRatio > c.rag.cost_amber ? 'R' : costRatio > c.rag.cost_green ? 'A' : 'G',
    quality: ncrOpen.some(n => n.severity === 'Critical') || ncrOpen.some(n => n.severity === 'Major' && n.target_date < t) ? 'R' : ncrOpen.some(n => n.target_date < t) ? 'A' : 'G',
    safety: incidents.some(h => ['High', 'Lost Time'].includes(h.severity)) ? 'R' : incidents.length || hse.some(h => h.status === 'Open' && h.kind === 'Incident') ? 'A' : 'G',
    decisions: ceoPending > 3 ? 'R' : ceoPending ? 'A' : 'G',
  };
  const order = { G: 0, A: 1, R: 2 };
  rag.overall = Object.values(rag).reduce((w, v) => order[v] > order[w] ? v : w, 'G');
  return {
    id: p.id, code: p.code, name: p.name, phase: p.phase, status: p.status, pm: p.pm, city: p.city, type: p.type,
    baseline_completion: p.baseline_completion, forecast_completion: fcFinish, variance_days: variance,
    approvals, schedule: { ...sch, critical_slipping: critSlip, activities: acts.length },
    cost: { budget, committed, actual, forecast, ratio: Math.round(costRatio * 1000) / 1000 },
    quality: { open: ncrOpen.length, overdue: ncrOpen.filter(n => n.target_date < t).length },
    safety: { incidents30: incidents.length },
    delays: { open: delays.filter(d => d.status !== 'Closed').length, plan_overdue: delays.filter(d => d.status === 'Plan Due' && d.plan_due < t).length },
    risks: { open: risks.filter(r => r.status !== 'Closed').length, ceo: risks.filter(r => r.escalation === 'CEO' && r.status !== 'Closed').length },
    deficiencies: { open: defs.filter(d => d.status !== 'Closed').length, total: defs.length },
    changes: { pending: changes.filter(x => x.status === 'Submitted').length, approved_value: sum(changes.filter(x => ['Approved', 'Implemented'].includes(x.status)), 'cost_impact') },
    gate: gates.filter(g => g.phase === p.phase).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] || null,
    unauthorized30: unauth, ceo_pending: ceoPending, rag,
  };
}

function kpis(set) {
  const t = today(), c = cfg();
  const ap = inScope(set, 'approvals'), defs = inScope(set, 'deficiencies'), acts = inScope(set, 'activities'), dl = inScope(set, 'delays');
  const clo = inScope(set, 'closeout'), lines = inScope(set, 'budget_lines'), ctr = inScope(set, 'contracts'), ch = inScope(set, 'changes');
  const ncr = inScope(set, 'ncrs'), hse = inScope(set, 'safety');
  const projs = [...set].map(id => records.get('projects', id)).filter(Boolean);
  const k = [];
  const band = (v, g, a, higher = true) => v == null ? 'N' : higher ? (v >= g ? 'G' : v >= a ? 'A' : 'R') : (v <= g ? 'G' : v <= a ? 'A' : 'R');
  const add = (sec, key, label, value, unit, status, basis, n) => k.push({ sec, key, label, value, unit, status, basis, n });

  const tracked = ap.filter(a => a.status && a.internal_lead && a.decision_target).length;
  add('§8', 'approval_tracking', 'Approval tracking', pct(tracked, ap.length), '%', band(pct(tracked, ap.length), 100, 90), 'Approvals with current status, owner and target date recorded', `${tracked}/${ap.length}`);
  const subm = ap.filter(a => a.submission_target && a.submitted_on);
  const onTime = subm.filter(a => a.submitted_on <= a.submission_target).length;
  add('§8', 'submission_readiness', 'Submission readiness', pct(onTime, subm.length), '%', band(pct(onTime, subm.length), 90, 75), 'Submissions made complete on or before target date', `${onTime}/${subm.length}`);
  const obs = ap.filter(a => a.obs_received_on && a.obs_closed_on);
  const avgObs = obs.length ? Math.round(obs.reduce((s, a) => s + days(a.obs_received_on, a.obs_closed_on), 0) / obs.length) : null;
  add('§8', 'observation_closure', 'Observation closure', avgObs, 'days', band(avgObs, 14, 30, false), 'Average days to respond to and close authority observations', `${obs.length} closed, ${ap.filter(a => a.status === 'Observations').length} open`);
  const dClosed = defs.filter(d => d.status === 'Closed').length;
  add('§8', 'regularization', 'Regularization progress', pct(dClosed, defs.length), '%', band(pct(dClosed, defs.length), 75, 40), 'Deficiencies closed against the lawful regularization plan', `${dClosed}/${defs.length}`);
  const sch = scheduleOf(acts, t);
  add('§8', 'spi', 'Schedule performance (SPI)', sch.spi, '', band(sch.spi, c.rag.spi_green, c.rag.spi_amber), `Earned ${sch.earned}% vs planned ${sch.planned}% (weighted)`, `${acts.length} activities`);
  const dueDl = dl.filter(d => d.plan_submitted_on || d.plan_due < t);
  const dlOk = dueDl.filter(d => d.plan_submitted_on && d.plan_submitted_on <= d.plan_due).length;
  add('§8', 'delay_escalation', 'Delay escalation', pct(dlOk, dueDl.length), '%', band(pct(dlOk, dueDl.length), 90, 70), `Recovery plans submitted within ${c.recovery_days} working days`, `${dlOk}/${dueDl.length}`);
  const granted = ap.filter(a => a.status === 'Granted');
  const recOk = granted.filter(a => a.letter && a.reference_no).length;
  add('§8', 'records', 'Records compliance', pct(recOk, granted.length), '%', band(pct(recOk, granted.length), 100, 90), 'Granted approvals with letter and reference filed and retrievable', `${recOk}/${granted.length}`);
  const cloOk = clo.filter(x => x.status === 'Verified').length;
  add('§8', 'closeout', 'Project close-out', pct(cloOk, clo.length), '%', band(pct(cloOk, clo.length), 100, 70), 'Completion, as-built and handover documents verified', `${cloOk}/${clo.length}`);

  const ms = acts.filter(a => a.milestone && a.base_finish && a.base_finish <= t);
  const msOk = ms.filter(a => a.act_finish && a.act_finish <= a.base_finish).length;
  add('§17', 'milestones', 'Milestone adherence', pct(msOk, ms.length), '%', band(pct(msOk, ms.length), 90, 70), 'Milestones achieved on or before baseline', `${msOk}/${ms.length}`);
  const vars = projs.filter(p => p.baseline_completion).map(p => projectMetrics(p).variance_days);
  const avgVar = vars.length ? Math.round(vars.reduce((a, b) => a + b, 0) / vars.length) : null;
  add('§17', 'variance', 'Schedule variance', avgVar, 'days', band(avgVar, 0, 30, false), 'Forecast vs baseline completion (avg per project)', `${vars.length} projects`);
  const B = sum(lines, 'budget'), F = sum(lines, 'forecast');
  const cr = B ? Math.round((F / B) * 1000) / 1000 : null;
  add('§17', 'cost', 'Cost performance', cr, '× budget', band(cr, c.rag.cost_green, c.rag.cost_amber, false), 'Forecast final cost ÷ approved budget', `PKR ${Math.round(F / 1e6)}M / ${Math.round(B / 1e6)}M`);
  const req = ctr.filter(x => x.required_on_site && x.required_on_site <= t);
  const reqOk = req.filter(x => x.delivered_on && x.delivered_on <= x.required_on_site).length;
  add('§17', 'procurement', 'Procurement performance', pct(reqOk, req.length), '%', band(pct(reqOk, req.length), 90, 75), 'Critical packages delivered by required-on-site date', `${reqOk}/${req.length}`);
  const impl = ch.filter(x => x.status === 'Implemented');
  const implOk = impl.filter(x => x.approved_on && (!x.implemented_on || x.approved_on <= x.implemented_on)).length;
  add('§17', 'change_control', 'Change control', pct(implOk, impl.length), '%', band(pct(implOk, impl.length), 100, 95), 'Variations approved before implementation', `${implOk}/${impl.length}`);
  const nc = ncr.filter(n => n.status === 'Closed');
  const ncOk = nc.filter(n => !n.target_date || (n.closed_on || n.updated_at.slice(0, 10)) <= n.target_date).length;
  add('§17', 'quality', 'Quality closure', pct(ncOk, nc.length), '%', band(pct(ncOk, nc.length), 90, 75), 'NCRs closed within target date', `${ncOk}/${nc.length} closed, ${ncr.length - nc.length} open`);
  const hc = hse.filter(h => h.status === 'Closed').length;
  add('§17', 'safety', 'Safety performance', pct(hc, hse.length), '%', band(pct(hc, hse.length), 90, 75), 'Safety records with corrective action closed', `${hse.filter(h => h.kind === 'Incident').length} incidents logged`);
  const dueSub = ap.filter(a => a.submission_target && a.submission_target <= t);
  const dueOk = dueSub.filter(a => a.submitted_on).length;
  add('§17', 'approval_readiness', 'Approval readiness', pct(dueOk, dueSub.length), '%', band(pct(dueOk, dueSub.length), 90, 75), 'Submissions due by today that were actually made', `${dueOk}/${dueSub.length}`);
  return k;
}

// ---------- CEO inbox ----------
function inboxItems(set) {
  const t = today(), out = [];
  const push = (entity, r, reason, sev) => out.push({ entity, id: r.id, code: r.code, project_id: r.project_id, title: r[S.ENTITIES[entity].title], reason, severity: sev, at: r.updated_at });
  for (const r of inScope(set, 'changes')) if (r.status === 'Submitted') push('changes', r, `Change awaiting approval — PKR ${(r.cost_impact || 0).toLocaleString()}, ${r.time_impact || 0} days`, Math.abs(r.cost_impact || 0) > cfg().pm_change_limit ? 'serious' : 'warning');
  for (const r of inScope(set, 'gates')) if (r.status === 'Submitted') push('gates', r, 'Phase gate submitted for CEO approval', 'warning');
  for (const r of inScope(set, 'risks')) if (r.escalation === 'CEO' && r.status !== 'Closed') push('risks', r, r.decision_needed || `Escalated risk, score ${r.score}`, r.score >= 20 ? 'critical' : 'serious');
  for (const r of inScope(set, 'delays')) if (r.status === 'Plan Due' && r.plan_due < t) push('delays', r, `Recovery plan overdue since ${r.plan_due}`, 'critical');
  for (const r of inScope(set, 'approvals')) if (r.status === 'Rejected') push('approvals', r, 'Rejected by authority — decide resubmission / appeal route', 'critical');
  return out;
}

// ---------- my work ----------
function myWork(user) {
  const out = [];
  for (const [entity, def] of Object.entries(S.ENTITIES)) {
    const uf = def.fields.filter(x => x.type === 'user' && !x.readonly).map(x => x.k);
    if (!uf.length) continue;
    for (const r of records.all(entity)) {
      if (!uf.some(k => r[k] === user.id) || !visible(user, entity, r) || !isOpen(entity, r)) continue;
      if (entity === 'projects') continue;
      out.push(decorate(entity, { ...r, _entity: entity }));
    }
  }
  return out.sort((a, b) => (a._c.due || '9999').localeCompare(b._c.due || '9999'));
}

// ---------- sweep: alerts & auto-state ----------
function sweep() {
  const t = today(), c = cfg(), live = new Set(), sys = systemUser();
  const up = n => { live.add(n.dedupe); notifications.upsert(n); };
  const pmOf = pid => records.get('projects', pid)?.pm;
  for (const a of records.all('approvals')) {
    if (a.status === 'Granted' && a.expiry_date) {
      const d = days(t, a.expiry_date);
      if (d < 0) { save('approvals', a.id, { status: 'Expired' }, sys, { system: true }); continue; }
      if (d <= c.expiry_warn_days[0]) {
        const sev = d <= c.expiry_warn_days[2] ? 'critical' : d <= c.expiry_warn_days[1] ? 'serious' : 'warning';
        up({ dedupe: `sweep:exp:${a.id}:${sev}`, audience: ['role:chief_coord', a.internal_lead].filter(Boolean), severity: sev, kind: 'expiry', title: `${a.title} expires in ${d} days`, body: `${a.authority} · ${a.reference_no} · renew before ${a.expiry_date}`, entity: 'approvals', record_id: a.id, project_id: a.project_id });
      }
    }
    if (!['Granted', 'Rejected', 'Expired'].includes(a.status) && a.decision_target && a.decision_target < t)
      up({ dedupe: `sweep:aprod:${a.id}`, audience: ['role:chief_coord', a.internal_lead].filter(Boolean), severity: days(a.decision_target, t) > 14 ? 'serious' : 'warning', kind: 'overdue', title: `Approval decision overdue: ${a.title}`, body: `Target ${a.decision_target} · status ${a.status}`, entity: 'approvals', record_id: a.id, project_id: a.project_id });
    if (a.status === 'Expired')
      up({ dedupe: `sweep:expired:${a.id}`, audience: ['role:ceo', 'role:chief_coord', a.internal_lead].filter(Boolean), severity: 'critical', kind: 'expiry', title: `EXPIRED: ${a.title}`, body: `Expired ${a.expiry_date}. Linked site work is now blocked.`, entity: 'approvals', record_id: a.id, project_id: a.project_id });
  }
  for (const act of records.all('activities')) detectSlippage(act, sys);
  for (const d of records.all('delays')) if (d.status === 'Plan Due' && d.plan_due < t)
    up({ dedupe: `sweep:plan:${d.id}`, audience: ['role:ceo', pmOf(d.project_id), d.owner].filter(Boolean), severity: 'critical', kind: 'overdue', title: `Recovery plan overdue: ${d.title}`, body: `Due ${d.plan_due} (§6: ${c.recovery_days} working days)`, entity: 'delays', record_id: d.id, project_id: d.project_id });
  for (const a of records.all('actions')) if (a.status === 'Open' && a.due_date && a.due_date < t)
    up({ dedupe: `sweep:act:${a.id}`, audience: [a.owner].filter(Boolean), severity: 'warning', kind: 'overdue', title: `Action overdue: ${a.description}`, body: `Due ${a.due_date}`, entity: 'actions', record_id: a.id, project_id: a.project_id });
  for (const n of records.all('ncrs')) if (n.status !== 'Closed' && n.target_date && n.target_date < t)
    up({ dedupe: `sweep:ncr:${n.id}`, audience: ['role:qaqc', pmOf(n.project_id)].filter(Boolean), severity: n.severity === 'Critical' ? 'critical' : 'serious', kind: 'overdue', title: `NCR overdue: ${n.title}`, body: `${n.severity} · target ${n.target_date}`, entity: 'ncrs', record_id: n.id, project_id: n.project_id });
  for (const x of records.all('correspondence')) if (x.status !== 'Closed' && x.follow_up && x.follow_up <= t)
    up({ dedupe: `sweep:cor:${x.id}`, audience: [x.owner, 'role:chief_coord'].filter(Boolean), severity: 'warning', kind: 'follow_up', title: `Authority follow-up due: ${x.subject}`, body: `${x.authority} · ${x.follow_up}`, entity: 'correspondence', record_id: x.id, project_id: x.project_id });
  for (const x of records.all('contracts')) if (x.required_on_site && !x.delivered_on && days(t, x.required_on_site) <= 14)
    up({ dedupe: `sweep:ros:${x.id}`, audience: ['role:procurement', pmOf(x.project_id)].filter(Boolean), severity: x.required_on_site < t ? 'serious' : 'warning', kind: 'procurement', title: `${x.package} required on site ${x.required_on_site}`, body: `${x.vendor || 'No vendor'} · ${x.stage}`, entity: 'contracts', record_id: x.id, project_id: x.project_id });
  for (const x of records.all('closeout')) if (x.expiry && days(t, x.expiry) <= 60 && days(t, x.expiry) >= 0)
    up({ dedupe: `sweep:warr:${x.id}`, audience: ['role:pm', 'role:sales_handover'], severity: 'warning', kind: 'expiry', title: `Warranty expiring: ${x.title}`, body: x.expiry, entity: 'closeout', record_id: x.id, project_id: x.project_id });
  for (const g of records.all('gates')) if (g.status === 'Submitted')
    up({ dedupe: `sweep:gate:${g.id}`, audience: ['role:ceo'], severity: 'warning', kind: 'decision', title: `Gate awaiting your decision: ${g.phase}`, body: records.get('projects', g.project_id)?.name, entity: 'gates', record_id: g.id, project_id: g.project_id });
  for (const x of records.all('changes')) if (x.status === 'Submitted')
    up({ dedupe: `sweep:cr:${x.id}`, audience: Math.abs(x.cost_impact || 0) > c.pm_change_limit || ['Scope', 'Schedule / Baseline'].includes(x.kind) ? ['role:ceo'] : ['role:ceo', pmOf(x.project_id)].filter(Boolean), severity: 'warning', kind: 'decision', title: `Change awaiting approval: ${x.title}`, body: `PKR ${(x.cost_impact || 0).toLocaleString()} · ${x.time_impact || 0} days`, entity: 'changes', record_id: x.id, project_id: x.project_id });
  notifications.resolveExcept('sweep:', live);
  return live.size;
}

function applyTemplates(projectId, user) {
  const p = records.get('projects', projectId);
  if (!p) throw new RuleError('Project not found', 404);
  const lib = settings.get('approval_templates', S.APPROVAL_TEMPLATES);
  const existing = new Set(records.all('approvals').filter(a => a.project_id === projectId).map(a => a.title.toLowerCase()));
  let n = 0;
  for (const tp of lib) {
    if (!(tp.types.includes('*') || tp.types.includes(p.type))) continue;
    if (existing.has(tp.title.toLowerCase())) continue;
    save('approvals', null, { project_id: projectId, title: tp.title, authority: tp.authority, category: tp.category, status: 'Not Started', internal_lead: '' }, user);
    n++;
  }
  return n;
}

module.exports = { RuleError, save, remove, decorate, can, visible, projectIds, permissions, projectMetrics, kpis, inboxItems, myWork, sweep,
  applyTemplates, scope, cfg, today, days, addDays, addWorkingDays, plannedPct, scheduleOf, isOpen, systemUser };
