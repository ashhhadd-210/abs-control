// Demo dataset — five ABS Pearl Court Yard towers (Bahria Town, Lahore) spanning all four lifecycle phases.
// Dates are relative to today so the demo stays current whenever it is seeded.
const fs = require('fs');
const path = require('path');
const D = require('./db');
const S = require('./schema');

function run(reset) {
  const E = require('./engine');
  if (reset) {
    D.reset();
    process.stdout.write('Database reset.\n');
  }
  const T = E.today(), A = n => E.addDays(T, n);
  const PW = 'abs12345';
  const mk = (name, email, role, title) => D.users.create({ name, email, role, title, password: PW });
  const U = {
    admin: D.users.create({ name: 'System Admin', email: 'admin@abs.pk', role: 'admin', title: 'IT', password: 'admin12345' }),
    ceo: mk('CEO Office', 'ceo@abs.pk', 'ceo', 'Chief Executive Officer'),
    cc: mk('Muhammad Fahim Chaudhary', 'fahim@abs.pk', 'chief_coord', 'Chief Town Planner / Chief Coordinator'),
    pm1: mk('Ayesha Malik', 'ayesha@abs.pk', 'pm', 'Project Manager'),
    pm2: mk('Bilal Ahmed', 'bilal@abs.pk', 'pm', 'Project Manager'),
    sh: mk('Sana Iqbal', 'sana@abs.pk', 'studio_head', 'Studio Head'),
    la: mk('Usman Tariq', 'usman@abs.pk', 'lead_architect', 'Lead Architect'),
    qa: mk('Hamza Raza', 'hamza@abs.pk', 'qaqc', 'QA/QC Manager'),
    qs: mk('Fatima Noor', 'fatima@abs.pk', 'qs_finance', 'Quantity Surveyor'),
    pr: mk('Imran Shah', 'imran@abs.pk', 'procurement', 'Procurement Lead'),
    dc: mk('Zainab Ali', 'zainab@abs.pk', 'doc_controller', 'Document Controller'),
    se: mk('Ali Hassan', 'ali@abs.pk', 'site_engineer', 'Resident Engineer'),
    sv: mk('Kashif Mehmood', 'kashif@abs.pk', 'supervisor', 'Site Supervisor'),
    sl: mk('Mariam Khan', 'mariam@abs.pk', 'sales_handover', 'Handover Manager'),
  };
  D.settings.set('demo', true);
  const sys = { ...U.admin, role: 'admin' };
  const ctx = { system: true };
  const save = (e, data, u = sys) => E.save(e, null, data, u, ctx);
  const upd = (e, id, data, u = sys) => E.save(e, id, data, u, ctx);

  // tiny valid PDF used as the demo "authority letter"
  const pdf = t => Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj 4 0 obj<</Length ${44 + t.length}>>stream\nBT /F1 14 Tf 60 760 Td (DEMO - ${t}) Tj ET\nendstream endobj 5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF`);
  const letter = name => D.files.save(`${name}.pdf`, 'application/pdf', pdf(name), U.dc.id).id;

  // ---------- projects ----------
  const P = {};
  const proj = (k, data) => { P[k] = save('projects', data); return P[k]; };
  proj('heights', { name: 'ABS Pearl Court Yard Tower-1', type: 'Residential High-rise', city: 'Lahore', location: 'Bahria Town, Lahore', authority: 'LDA', ownership: 'Owned', phase: S.PROJECT_PHASES[0], status: 'Active', pm: U.pm1.id, site_lead: U.se.id, plot_area: 16, covered_area: 610000, floors: 22, start_date: A(-560), baseline_completion: A(355), budget: 4200000000, description: '22-storey residential tower with 3 basements, 240 apartments and podium amenities.', approval_position: 'Building plan sanctioned; height NOC granted; fire NOC under observations.' });
  proj('square', { name: 'ABS Pearl Court Yard Tower-2', type: 'Commercial', city: 'Lahore', location: 'Bahria Town, Lahore', authority: 'LDA', ownership: 'Joint Venture', phase: S.PROJECT_PHASES[0], status: 'Active', pm: U.pm2.id, site_lead: U.se.id, plot_area: 8, covered_area: 280000, floors: 12, start_date: A(-250), baseline_completion: A(630), budget: 2800000000, description: 'Grade-A office and retail block, 12 floors over 2 basements.', approval_position: 'Commercialization fee paid; building plan submitted, TIA observations pending.' });
  proj('greens', { name: 'ABS Pearl Court Yard Tower-3', type: 'Mixed-use', city: 'Lahore', location: 'Bahria Town, Lahore', authority: 'LDA', ownership: 'Land Sharing', phase: S.PROJECT_PHASES[0], status: 'Active', pm: U.pm2.id, site_lead: U.sv.id, plot_area: 12, covered_area: 720000, floors: 30, start_date: A(-720), baseline_completion: A(200), budget: 1600000000, description: '30-storey mixed-use tower — retail podium, offices and apartments.', approval_position: 'Under regularization: deviations from the sanctioned plan and pending NOCs being resolved through LDA procedures.' });
  proj('residency', { name: 'ABS Pearl Court Yard Tower-4', type: 'Residential High-rise', city: 'Lahore', location: 'Bahria Town, Lahore', authority: 'LDA', ownership: 'Owned', phase: S.PROJECT_PHASES[0], status: 'Active', pm: U.pm1.id, site_lead: U.sv.id, plot_area: 6, covered_area: 260000, floors: 14, start_date: A(-900), baseline_completion: A(20), budget: 900000000, description: '14-storey residential tower, 140 apartments — in completion and handover.', approval_position: 'All construction approvals in place; completion certificate applied.' });
  proj('one', { name: 'ABS Pearl Court Yard Tower-5', type: 'Mixed-use', city: 'Lahore', location: 'Bahria Town, Lahore', authority: 'LDA', ownership: 'Under Acquisition', phase: S.PROJECT_PHASES[0], status: 'Active', pm: U.pm2.id, start_date: A(-60), baseline_completion: A(1250), budget: 6500000000, description: '45-storey mixed-use landmark: retail podium, serviced apartments and offices.', approval_position: 'Due diligence; land-use conformity and title verification under review.' });

  // walk projects through gates to their real phase (gate records are the audit trail)
  const walk = (p, toIdx, decidedAgo) => {
    for (let i = 0; i < toIdx; i++) {
      const gate = D.records.all('gates').find(x => x.project_id === p.id && x.phase === S.PROJECT_PHASES[i] && x.status !== 'Approved');
      upd('gates', gate.id, { checklist: S.GATE_CHECKLISTS[S.PROJECT_PHASES[i]].map(item => ({ item, done: true })), status: 'Submitted' }, U.cc);
      upd('gates', gate.id, { status: 'Approved', remarks: 'Approved in monthly CEO review.' }, U.ceo);
    }
  };
  walk(P.heights, 2); walk(P.square, 1); walk(P.greens, 2); walk(P.residency, 3);
  const oneGate = D.records.all('gates').find(x => x.project_id === P.one.id);
  upd('gates', oneGate.id, { checklist: S.GATE_CHECKLISTS[S.PROJECT_PHASES[0]].map(item => ({ item, done: true })), status: 'Submitted' }, U.cc);
  const sqGate = D.records.all('gates').find(x => x.project_id === P.square.id && x.status === 'Open');
  upd('gates', sqGate.id, { checklist: S.GATE_CHECKLISTS[S.PROJECT_PHASES[1]].map((item, i) => ({ item, done: i < 3 })) });

  // ---------- approvals ----------
  const AP = {};
  const apr = (p, key, data) => {
    const d = { project_id: p.id, internal_lead: U.cc.id, ...data };
    if (d.status === 'Granted') { d.letter = d.letter || letter(`${p.name} - ${data.title}`); d.conditions_ack = d.conditions_ack ?? true; }
    AP[key] = save('approvals', d); return AP[key];
  };
  // Heights
  apr(P.heights, 'h_land', { title: 'Land-use / Master Plan conformity verification', authority: 'LDA', category: 'Planning / Land-use', status: 'Granted', submission_target: A(-640), submitted_on: A(-645), decision_target: A(-600), reference_no: 'LDA/TP/2025/0412', issued_on: A(-598) });
  apr(P.heights, 'h_title', { title: 'Title verification (Fard / mutation / registry)', authority: 'Punjab Revenue / Land Record', category: 'Planning / Land-use', status: 'Granted', submission_target: A(-650), submitted_on: A(-650), decision_target: A(-620), reference_no: 'REV/LHR/88213', issued_on: A(-622) });
  apr(P.heights, 'h_tia', { title: 'Traffic Impact Assessment NOC', authority: 'TEPA (LDA)', category: 'Traffic', status: 'Granted', submission_target: A(-610), submitted_on: A(-612), decision_target: A(-570), reference_no: 'TEPA/TIA/25/117', issued_on: A(-575), conditions: 'Dedicated drop-off lane; 2 traffic wardens at peak hours during construction.' });
  apr(P.heights, 'h_epa', { title: 'Environmental approval (IEE / EIA)', authority: 'EPA Punjab', category: 'Environmental', status: 'Granted', submission_target: A(-620), submitted_on: A(-618), decision_target: A(-580), reference_no: 'EPA/IEE/2025/339', issued_on: A(-581), expiry_date: A(45), conditions: 'Dust suppression, noise limits 7am–10pm, quarterly monitoring report.' });
  apr(P.heights, 'h_caa', { title: 'Height clearance NOC', authority: 'CAA', category: 'Height / Aviation', status: 'Granted', submission_target: A(-600), submitted_on: A(-590), decision_target: A(-540), reference_no: 'CAA/HQ/NOC/7781', issued_on: A(-548), conditions: 'Max height 92 m AMSL incl. crane; obstruction lights mandatory.' });
  apr(P.heights, 'h_struct', { title: 'Structural design vetting', authority: 'LDA', category: 'Building Plan', status: 'Granted', submission_target: A(-590), submitted_on: A(-592), decision_target: A(-560), reference_no: 'LDA/BC/SV/223', issued_on: A(-561) });
  apr(P.heights, 'h_bp', { title: 'Building plan approval (sanctioned plan)', authority: 'LDA', category: 'Building Plan', status: 'Granted', submission_target: A(-575), submitted_on: A(-578), decision_target: A(-520), reference_no: 'LDA/BC/2025/1189', issued_on: A(-522), expiry_date: A(1100), conditions: 'Construction per sanctioned plan only; stage inspections at plinth and every 5th floor.' });
  apr(P.heights, 'h_fire', { title: 'Fire safety NOC', authority: 'Rescue 1122 / Civil Defence', category: 'Fire & Life-safety', status: 'Observations', submission_target: A(-60), submitted_on: A(-58), decision_target: A(-10), obs_received_on: A(-25), observations: 'Second staircase pressurization calcs; fire-fighting lift lobby size; hydrant ring main drawings.', next_action: 'MEP consultant to revise drawings; resubmit', authority_officer: 'Divisional Emergency Officer, Lahore' });
  apr(P.heights, 'h_wasa', { title: 'Water & sewerage NOC', authority: 'WASA Lahore', category: 'Utility', status: 'Submitted', submission_target: A(-30), submitted_on: A(-26), decision_target: A(15), next_action: 'Follow-up with Director Planning WASA', application_no: 'WASA/NC/26/4410' });
  apr(P.heights, 'h_lesco', { title: 'Electricity load sanction / NOC', authority: 'LESCO', category: 'Utility', status: 'Preparing', submission_target: A(10), decision_target: A(70), prerequisites: 'Load calculation (3.2 MW), grid station land offer, transformer room layout', internal_lead: U.la.id, next_action: 'Electrical consultant to finalise load calc' });
  apr(P.heights, 'h_plinth', { title: 'Plinth / stage inspection certificate', authority: 'LDA', category: 'Building Plan', status: 'Granted', submission_target: A(-300), submitted_on: A(-298), decision_target: A(-280), reference_no: 'LDA/BC/INS/0918', issued_on: A(-283) });
  apr(P.heights, 'h_prera', { title: 'Project registration (verify applicability)', authority: 'PRERA / Real Estate Regulator', category: 'Regulatory Registration', status: 'Granted', submission_target: A(-400), submitted_on: A(-395), decision_target: A(-360), reference_no: 'PRERA/LHR/0055', issued_on: A(-362), expiry_date: A(28) });
  // Business Square
  apr(P.square, 's_land', { title: 'Land-use / Master Plan conformity verification', authority: 'LDA', category: 'Planning / Land-use', status: 'Granted', submission_target: A(-230), submitted_on: A(-232), decision_target: A(-200), reference_no: 'LDA/TP/2026/0077', issued_on: A(-205) });
  apr(P.square, 's_comm', { title: 'Commercialization / change of land-use', authority: 'LDA', category: 'Planning / Land-use', status: 'Granted', submission_target: A(-200), submitted_on: A(-198), decision_target: A(-120), reference_no: 'LDA/COM/26/0154', issued_on: A(-131), fee: 185000000 });
  apr(P.square, 's_tia', { title: 'Traffic Impact Assessment NOC', authority: 'TEPA (LDA)', category: 'Traffic', status: 'Observations', submission_target: A(-90), submitted_on: A(-88), decision_target: A(-20), obs_received_on: A(-40), observations: 'Revise parking count (shortfall 46 bays); queue analysis on MM Alam Road entry.', next_action: 'Add half-basement level; traffic consultant re-run model' });
  apr(P.square, 's_bp', { title: 'Building plan approval (sanctioned plan)', authority: 'LDA', category: 'Building Plan', status: 'Submitted', submission_target: A(-50), submitted_on: A(-44), decision_target: A(30), application_no: 'LDA/BC/26/2201', internal_lead: U.la.id, next_action: 'Awaiting TIA NOC (prerequisite)' });
  apr(P.square, 's_caa', { title: 'Height clearance NOC', authority: 'CAA', category: 'Height / Aviation', status: 'Granted', submission_target: A(-150), submitted_on: A(-149), decision_target: A(-90), reference_no: 'CAA/HQ/NOC/8120', issued_on: A(-95) });
  apr(P.square, 's_epa', { title: 'Environmental approval (IEE / EIA)', authority: 'EPA Punjab', category: 'Environmental', status: 'Rejected', submission_target: A(-120), submitted_on: A(-118), decision_target: A(-30), observations: 'IEE returned: baseline air-quality data older than 12 months; EIA required given basement dewatering volume.', next_action: 'CEO to decide: commission full EIA vs. redesign dewatering' });
  apr(P.square, 's_fire', { title: 'Fire safety NOC', authority: 'Rescue 1122 / Civil Defence', category: 'Fire & Life-safety', status: 'Not Started', submission_target: A(40), decision_target: A(100) });
  apr(P.square, 's_struct', { title: 'Structural design vetting', authority: 'LDA', category: 'Building Plan', status: 'Preparing', submission_target: A(-5), decision_target: A(40), internal_lead: '' });
  // Greens
  apr(P.greens, 'g_layout', { title: 'Building plan approval (sanctioned plan)', authority: 'LDA', category: 'Building Plan', status: 'Granted', submission_target: A(-760), submitted_on: A(-760), decision_target: A(-700), reference_no: 'LDA/MP/LP/24/031', issued_on: A(-701), conditions: 'Construction per sanctioned plan; commercial use limited to podium; 240 parking bays; stage inspections.' });
  apr(P.greens, 'g_rev', { title: 'Revised building plan (regularization)', authority: 'LDA', category: 'Building Plan', status: 'Resubmitted', submission_target: A(-80), submitted_on: A(-78), decision_target: A(-5), obs_received_on: A(-50), obs_closed_on: A(-22), next_action: 'Hearing with DG LDA committee', internal_lead: U.cc.id });
  apr(P.greens, 'g_epa', { title: 'Environmental approval (IEE / EIA)', authority: 'EPA Punjab', category: 'Environmental', status: 'Granted', submission_target: A(-740), submitted_on: A(-745), decision_target: A(-690), reference_no: 'EPA/EIA/24/118', issued_on: A(-692) });
  apr(P.greens, 'g_wasa', { title: 'Water & sewerage NOC', authority: 'WASA Lahore', category: 'Utility', status: 'Granted', submission_target: A(-500), submitted_on: A(-505), decision_target: A(-440), reference_no: 'WASA/HS/24/77', issued_on: A(-438), conditions_ack: false });
  apr(P.greens, 'g_lesco', { title: 'Electricity load sanction / NOC', authority: 'LESCO', category: 'Utility', status: 'Submitted', submission_target: A(-100), submitted_on: A(-60), decision_target: A(-15), next_action: 'Revise substation location per LESCO site visit' });
  apr(P.greens, 'g_gas', { title: 'Gas connection NOC (if applicable)', authority: 'SNGPL', category: 'Utility', status: 'Not Started', submission_target: A(60), decision_target: A(150), internal_lead: '' });
  // Residency
  for (const [k, title, auth, cat, ref, ago, exp] of [
    ['r_land', 'Land-use / Master Plan conformity verification', 'LDA', 'Planning / Land-use', 'LDA/TP/2023/1033', -1000],
    ['r_bp', 'Building plan approval (sanctioned plan)', 'LDA', 'Building Plan', 'LDA/BC/2023/2290', -930],
    ['r_fire', 'Fire safety NOC', 'Rescue 1122 / Civil Defence', 'Fire & Life-safety', 'R1122/LHR/FS/23/554', -900, 70],
    ['r_wasa', 'Water & sewerage NOC', 'WASA Lahore', 'Utility', 'WASA/NC/23/1022', -880],
    ['r_lesco', 'Electricity load sanction / NOC', 'LESCO', 'Utility', 'LESCO/LS/23/671', -860],
  ]) apr(P.residency, k, { title, authority: auth, category: cat, status: 'Granted', submission_target: A(ago - 40), submitted_on: A(ago - 42), decision_target: A(ago), reference_no: ref, issued_on: A(ago - 3), expiry_date: exp ? A(exp) : '' });
  apr(P.residency, 'r_cc', { title: 'Completion certificate', authority: 'LDA', category: 'Completion / Occupancy', status: 'Submitted', submission_target: A(-20), submitted_on: A(-18), decision_target: A(25), next_action: 'LDA final inspection scheduled', application_no: 'LDA/BC/CC/26/091' });
  // One
  apr(P.one, 'o_land', { title: 'Land-use / Master Plan conformity verification', authority: 'LDA', category: 'Planning / Land-use', status: 'Submitted', submission_target: A(-30), submitted_on: A(-28), decision_target: A(20) });
  apr(P.one, 'o_title', { title: 'Title verification (Fard / mutation / registry)', authority: 'Punjab Revenue / Land Record', category: 'Planning / Land-use', status: 'Preparing', submission_target: A(-10), decision_target: A(30), next_action: 'Two khasra numbers pending mutation — legal opinion requested' });
  E.applyTemplates(P.one.id, sys);

  // ---------- schedule ----------
  const act = (p, wbs, name, bs, bf, pct, o = {}) => save('activities', { project_id: p.id, wbs, name, base_start: A(bs), base_finish: A(bf), pct, weight: o.w || 1, owner: o.owner || p.pm, critical: !!o.crit, milestone: !!o.ms, requires: o.req || [], fc_finish: o.fc != null ? A(o.fc) : '', fc_start: o.fs != null ? A(o.fs) : '', act_start: pct > 0 ? A(o.as ?? bs) : '', act_finish: pct === 100 ? A(o.af ?? bf) : '', status: pct === 100 ? 'Completed' : pct > 0 ? 'In Progress' : 'Not Started', lifecycle: o.ph || S.PROJECT_PHASES[2] });
  const H = P.heights;
  act(H, '1.1', 'Site mobilization & hoarding', -540, -520, 100, { w: 1, req: [AP.h_bp.id] });
  act(H, '1.2', 'Excavation & shoring (3 basements)', -520, -430, 100, { w: 4, crit: true, req: [AP.h_bp.id, AP.h_epa.id] });
  act(H, '1.3', 'Raft foundation', -430, -380, 100, { w: 3, crit: true, req: [AP.h_struct.id], af: -374 });
  act(H, 'M1', 'Plinth inspection passed', -300, -300, 100, { ms: true, crit: true, af: -283 });
  act(H, '2.1', 'Basement structure B3–B1', -380, -290, 100, { w: 4, crit: true, af: -285 });
  act(H, '2.2', 'Superstructure L1–L10', -290, -90, 100, { w: 6, crit: true, af: -78 });
  act(H, '2.3', 'Superstructure L11–L22', -90, 110, 38, { w: 6, crit: true, req: [AP.h_caa.id], fc: 132 });
  act(H, 'M2', 'Structure topped out', 110, 110, 0, { ms: true, crit: true, fc: 132 });
  act(H, '3.1', 'Blockwork & plaster L1–L12', -60, 120, 30, { w: 4 });
  act(H, '3.2', 'MEP first fix', -30, 180, 18, { w: 5 });
  act(H, '3.3', 'Fire-fighting & detection system', 30, 220, 0, { w: 3, req: [AP.h_fire.id] });
  act(H, '3.4', 'Lift installation (6 cars)', 150, 280, 0, { w: 3, crit: true });
  act(H, '3.5', 'Façade & glazing', 60, 260, 0, { w: 4 });
  act(H, '3.6', 'LESCO grid connection & substation', 200, 300, 0, { w: 2, crit: true, req: [AP.h_lesco.id] });
  act(H, '4.1', 'Finishes & fit-out', 140, 330, 0, { w: 5 });
  act(H, 'M3', 'Practical completion', 355, 355, 0, { ms: true, crit: true, fc: 377 });
  const SQ = P.square;
  act(SQ, '1.1', 'Schematic design', -240, -170, 100, { ph: S.PROJECT_PHASES[1], owner: U.sh.id });
  act(SQ, '1.2', 'Design development', -170, -80, 100, { ph: S.PROJECT_PHASES[1], owner: U.la.id, af: -70 });
  act(SQ, '1.3', 'Statutory submission package', -100, -40, 85, { ph: S.PROJECT_PHASES[1], owner: U.cc.id, crit: true, fc: 20 });
  act(SQ, '1.4', 'Tender documentation', -40, 30, 40, { ph: S.PROJECT_PHASES[1], owner: U.pr.id });
  act(SQ, '1.5', 'Main contractor tender & award', 30, 90, 0, { ph: S.PROJECT_PHASES[1], owner: U.pr.id, crit: true });
  act(SQ, '2.1', 'Excavation & dewatering', 100, 190, 0, { crit: true, w: 3, req: [AP.s_bp.id, AP.s_epa.id] });
  act(SQ, 'M1', 'Construction start', 100, 100, 0, { ms: true, crit: true, req: [AP.s_bp.id] });
  const G = P.greens;
  act(G, '1.1', 'Excavation & shoring (2 basements)', -650, -500, 100, { w: 3 });
  act(G, '1.2', 'Raft & basement structure', -500, -330, 100, { w: 3 });
  act(G, '1.3', 'Superstructure L1–L15', -480, -280, 100, { w: 4 });
  act(G, '1.4', 'Superstructure L16–L30', -300, -60, 80, { w: 3, crit: true, fc: 40 });
  act(G, '1.5', 'MEP first fix & substation', -120, 120, 15, { w: 4, crit: true, fc: 190 });
  act(G, '1.6', 'Façade & glazing', -60, 150, 20, { w: 2 });
  act(G, '1.7', 'Finishes & fit-out', 30, 160, 0, { w: 3 });
  act(G, '1.8', 'Commercial podium fit-out', 60, 200, 0, { w: 2, req: [AP.g_rev.id, AP.g_wasa.id] });
  const RS = P.residency;
  act(RS, '1.1', 'Structure complete', -800, -400, 100, { w: 5, crit: true, ms: true, af: -404 });
  act(RS, '1.2', 'Finishes', -400, -60, 100, { w: 5, af: -40 });
  act(RS, '1.3', 'Testing & commissioning', -60, -10, 90, { w: 2, crit: true, fc: 6 });
  act(RS, '1.4', 'Snag rectification', -20, 10, 55, { w: 1, ph: S.PROJECT_PHASES[3] });
  act(RS, 'M1', 'Handover to buyers', 20, 20, 0, { ms: true, crit: true, ph: S.PROJECT_PHASES[3], fc: 32 });
  const O = P.one;
  act(O, '0.1', 'Site survey & existing conditions', -55, -30, 100, { ph: S.PROJECT_PHASES[0], owner: U.cc.id });
  act(O, '0.2', 'Feasibility & development brief', -40, 10, 70, { ph: S.PROJECT_PHASES[0] });
  act(O, '0.3', 'Land/title due diligence', -45, 25, 50, { ph: S.PROJECT_PHASES[0], owner: U.cc.id, crit: true });

  for (const p of [P.heights, P.greens, P.residency]) upd('projects', p.id, { baseline_locked: true });

  // ---------- site reports (S-curve history for Heights & Greens) ----------
  for (let w = 16; w >= 1; w--) {
    const we = A(-7 * w);
    const sch = E.scheduleOf(D.records.all('activities').filter(a => a.project_id === H.id), we);
    save('site_reports', { project_id: H.id, week_ending: we, planned_pct: sch.planned, actual_pct: Math.round((sch.planned - 1.2 - (16 - w) * 0.18) * 10) / 10, manpower: 180 + (w % 4) * 12, materials: 'Rebar 120 t, concrete 900 m³, blocks 40k', constraints: w < 6 ? 'Tower crane downtime 2 days; formwork shortage on L14' : 'None material', safety: 'Toolbox talks daily; 1 near miss (unsecured edge) closed', lookahead: 'Pour L' + (12 + Math.floor((16 - w) / 2)) + ' slab; continue blockwork L6–L8' }, U.se);
  }
  for (let w = 8; w >= 1; w--) {
    const we = A(-7 * w);
    const sch = E.scheduleOf(D.records.all('activities').filter(a => a.project_id === G.id), we);
    save('site_reports', { project_id: G.id, week_ending: we, planned_pct: sch.planned, actual_pct: Math.round((sch.planned - 4 - (8 - w) * 0.4) * 10) / 10, manpower: 90, constraints: 'LESCO substation location pending; commercial podium on hold for regularization' }, U.sv);
  }

  // ---------- budget ----------
  const bud = (p, rows) => rows.forEach(([cat, desc, b, c, a, f]) => save('budget_lines', { project_id: p.id, category: cat, cost_code: cat.slice(0, 3).toUpperCase() + '-' + desc.length, description: desc, budget: b * 1e6, committed: c * 1e6, actual: a * 1e6, forecast: f * 1e6 }));
  bud(P.heights, [['Land & Approvals', 'Approvals, fees & regulatory', 120, 110, 104, 124], ['Design & Consultancy', 'Design & supervision consultants', 160, 160, 120, 165], ['Substructure', 'Excavation, shoring & raft', 520, 520, 520, 548], ['Superstructure', 'RCC frame', 1250, 1200, 760, 1310], ['MEP', 'MEP services', 820, 410, 90, 860], ['Finishes', 'Finishes & fit-out', 760, 120, 0, 760], ['External Works', 'Landscaping & external', 110, 0, 0, 105], ['Prelims & Site', 'Prelims & site overheads', 300, 300, 190, 318], ['Contingency', 'Contingency', 160, 0, 0, 60]]);
  bud(P.square, [['Land & Approvals', 'Commercialization & approvals', 230, 215, 215, 236], ['Design & Consultancy', 'Design consultants', 120, 120, 70, 122], ['Substructure', 'Basement & dewatering', 480, 0, 0, 540], ['Superstructure', 'RCC frame', 900, 0, 0, 900], ['MEP', 'MEP', 600, 0, 0, 600], ['Finishes', 'Finishes', 320, 0, 0, 320], ['Contingency', 'Contingency', 150, 0, 0, 150]]);
  bud(P.greens, [['Land & Approvals', 'Approvals & regularization', 60, 58, 52, 84], ['Substructure', 'Basements & raft', 520, 500, 380, 540], ['Superstructure', 'RCC frame', 420, 410, 330, 430], ['MEP', 'MEP & substation', 360, 200, 60, 395], ['Finishes', 'Finishes & façade', 90, 40, 20, 90], ['Prelims & Site', 'Prelims', 100, 100, 75, 108], ['Contingency', 'Contingency', 50, 0, 0, 0]]);
  bud(P.residency, [['Superstructure', 'Structure', 380, 380, 380, 380], ['Finishes', 'Finishes', 260, 260, 248, 262], ['MEP', 'MEP', 170, 170, 160, 171], ['Prelims & Site', 'Prelims', 60, 60, 57, 60], ['Contingency', 'Contingency', 30, 0, 0, 8]]);
  bud(P.one, [['Land & Approvals', 'Due diligence & approvals', 90, 20, 12, 90], ['Design & Consultancy', 'Concept & feasibility', 60, 25, 8, 60]]);

  // ---------- contracts & payments ----------
  const C = {};
  const ctr = (k, p, d) => C[k] = save('contracts', { project_id: p.id, ...d });
  ctr('h_main', P.heights, { package: 'Main civil contract', kind: 'Main Contract', vendor: 'Habib Construction Services (demo)', stage: 'Active', value: 2150e6, award_date: A(-560), required_on_site: A(-545), delivered_on: A(-547), expiry: A(400) });
  ctr('h_lift', P.heights, { package: 'Lifts (6 cars)', kind: 'Supply', vendor: 'Elevate Pakistan (demo)', stage: 'Awarded', value: 186e6, award_date: A(-40), lead_time: 180, required_on_site: A(150) });
  ctr('h_glass', P.heights, { package: 'Façade & glazing', kind: 'Subcontract', vendor: '', stage: 'Bid Evaluation', value: 420e6, lead_time: 120, required_on_site: A(60), bids: '3 bids: 398M / 420M / 455M — technical evaluation ongoing' });
  ctr('h_mep', P.heights, { package: 'MEP works', kind: 'Subcontract', vendor: 'Trimech Engineering (demo)', stage: 'Active', value: 780e6, award_date: A(-200), required_on_site: A(-40), delivered_on: A(-31) });
  ctr('h_trans', P.heights, { package: 'Transformers & HT panels', kind: 'Supply', vendor: 'Power Systems Ltd (demo)', stage: 'Tendering', value: 95e6, lead_time: 150, required_on_site: A(12) });
  ctr('g_roads', P.greens, { package: 'Main civil contract', kind: 'Main Contract', vendor: 'Punjab Infra Builders (demo)', stage: 'Active', value: 1050e6, award_date: A(-700), required_on_site: A(-660), delivered_on: A(-655) });
  ctr('s_cons', P.square, { package: 'Design consultancy', kind: 'Consultancy', vendor: 'ABS D&A Studio', stage: 'Active', value: 120e6, award_date: A(-245), required_on_site: A(-240), delivered_on: A(-240) });
  ctr('r_main', P.residency, { package: 'Main contract', kind: 'Main Contract', vendor: 'Lahore Builders (demo)', stage: 'Active', value: 720e6, award_date: A(-910), required_on_site: A(-900), delivered_on: A(-898) });
  const ipc = (c, p, no, end, cl, ver, cert, st) => {
    const r = save('payment_apps', { project_id: p.id, contract: c.id, app_no: no, period_end: A(end), claimed: cl * 1e6, verified: ver * 1e6, certified: cert * 1e6, status: st === 'Paid' ? 'Certified' : st, notes: cl > ver ? `Claim reduced: ${cl - ver}M unverified quantities` : '' }, U.qs);
    if (st === 'Paid') upd('payment_apps', r.id, { status: 'Paid' }, U.qs);
  };
  ipc(C.h_main, P.heights, 'IPC-17', -40, 92, 88, 88, 'Paid');
  ipc(C.h_main, P.heights, 'IPC-18', -10, 104, 96, 96, 'Certified');
  ipc(C.h_main, P.heights, 'IPC-19', -2, 118, 0, 0, 'Under QS Review');
  ipc(C.h_mep, P.heights, 'MEP-06', -12, 41, 38, 38, 'Certified');
  ipc(C.g_roads, P.greens, 'IPC-31', -15, 36, 31, 31, 'Certified');

  // ---------- changes ----------
  const ch = (p, d, by) => save('changes', { project_id: p.id, ...d }, by);
  const c1 = ch(P.heights, { title: 'Upgrade lobby lift to 2.5 m/s', kind: 'Variation Order', reason: 'Sales feedback; reduce peak wait times', cost_impact: 18e6, time_impact: 0, status: 'Draft' });
  upd('changes', c1.id, { status: 'Approved' }, U.ceo); upd('changes', c1.id, { status: 'Implemented' }, U.pm1);
  ch(P.heights, { title: 'Additional basement waterproofing (crystalline)', kind: 'Variation Order', reason: 'Water table higher than geotech report at B3', technical_basis: 'Seepage observed at 3 locations', cost_impact: 3.8e6, time_impact: 4, status: 'Submitted' });
  ch(P.heights, { title: 'Re-baseline superstructure finish +22 days', kind: 'Schedule / Baseline', reason: 'Formwork supply disruption L11–L14', technical_basis: 'Recovery plan DLY attached; second formwork set mobilized', cost_impact: 0, time_impact: 22, status: 'Submitted' });
  ch(P.square, { title: 'Add half-basement to meet parking requirement', kind: 'Scope', reason: 'TEPA observation — 46-bay shortfall', technical_basis: 'Adds 52 bays', cost_impact: 140e6, time_impact: 45, approval_impact: 'Building plan must be revised and resubmitted', status: 'Submitted' });
  const c5 = ch(P.greens, { title: 'Relocate substation per LESCO', kind: 'Design', reason: 'LESCO site visit observation', cost_impact: 35e6, time_impact: 30, status: 'Draft' });
  upd('changes', c5.id, { status: 'Approved' }, U.ceo);

  // ---------- delays (Heights superstructure auto-created by slippage) ----------
  const autoD = D.records.all('delays').find(d => d.project_id === H.id);
  if (autoD) upd('delays', autoD.id, { identified_on: A(-12), cause: 'Formwork supplier default; tower crane breakdown (4 days).', accountable: 'Main contractor', mitigation: 'Second formwork set mobilized; night shift on core walls; crane service contract upgraded.', revised_forecast: A(132), status: 'Plan Submitted', plan_submitted_on: A(-10) });
  for (const d of D.records.all('delays').filter(d => d.project_id === G.id)) upd('delays', d.id, { identified_on: A(-6), cause: 'LESCO substation revision; contractor slow on upper floors.', accountable: 'LESCO / contractor' });

  // ---------- risks ----------
  const rk = (p, d) => save('risks', { project_id: p.id, status: 'Open', ...d });
  rk(P.heights, { title: 'Fire NOC delay holds fire-system installation', kind: 'Risk', category: 'Approval', likelihood: 4, impact: 4, owner: U.cc.id, mitigation: 'Weekly follow-up with Rescue 1122; MEP consultant to resubmit within 10 days', due_date: A(14) });
  rk(P.heights, { title: 'Transformer lead time exceeds required-on-site', kind: 'Risk', category: 'Procurement', likelihood: 3, impact: 4, owner: U.pr.id, mitigation: 'Expedite tender; consider rental genset bridging' });
  rk(P.square, { title: 'EPA rejection — EIA adds 4–6 months', kind: 'Issue', category: 'Approval', likelihood: 5, impact: 5, owner: U.cc.id, mitigation: 'Option A: commission EIA now (PKR 9M, 5 months). Option B: redesign dewatering to recharge wells and resubmit IEE (PKR 4M, 2 months, design risk).', decision_needed: 'Select EIA vs dewatering redesign route', due_date: A(5) });
  rk(P.greens, { title: 'Regularization hearing outcome uncertain for commercial podium', kind: 'Risk', category: 'Regulatory change', likelihood: 3, impact: 5, owner: U.cc.id, mitigation: 'Legal counsel briefed; fallback plan prepared within approved commercialization' });
  rk(P.one, { title: 'Two khasra numbers with pending mutation', kind: 'Issue', category: 'Land / title', likelihood: 4, impact: 4, owner: U.cc.id, mitigation: 'Legal opinion; hold acquisition payment tranche until mutation' });
  rk(P.residency, { title: 'Completion certificate inspection may flag parking ramp slope', kind: 'Risk', category: 'Approval', likelihood: 2, impact: 3, owner: U.pm1.id, mitigation: 'Pre-inspection by consultant; ramp markings', status: 'Mitigating' });

  // ---------- deficiencies (Greens regularization) ----------
  const df = (p, d) => save('deficiencies', { project_id: p.id, owner: U.cc.id, ...d });
  df(P.greens, { title: 'Commercial floors exceed approved commercialization', type: 'Land-use / commercialization', lawful_route: 'Submit revised building plan limiting commercial use to the podium, or apply for additional commercialization under LDA rules with prescribed fee.', approval: AP.g_rev.id, cost_impact: 25e6, time_impact: 60, target_date: A(30), status: 'Submitted to Authority' });
  df(P.greens, { title: 'Rear setback 8 ft vs required 10 ft', type: 'Setback / coverage', lawful_route: 'Regularize under LDA compounding rules with prescribed fee; record in revised building plan.', approval: AP.g_rev.id, cost_impact: 18e6, time_impact: 0, target_date: A(30), status: 'In Progress' });
  df(P.greens, { title: 'Parking bays 180 vs required 240', type: 'Parking', lawful_route: 'Add mechanical stack parking in B2; show in revised building plan.', cost_impact: 12e6, time_impact: 45, target_date: A(-10), status: 'In Progress' });
  const dfc = df(P.greens, { title: 'Stage inspection at plinth not recorded', type: 'Missing approval', lawful_route: 'Apply for post-facto plinth verification; LDA site inspection.', target_date: A(-60), status: 'In Progress' });
  upd('deficiencies', dfc.id, { status: 'Closed', closure_evidence: letter('Plinth verification certificate') });
  df(P.square, { title: 'Parking shortfall 46 bays', type: 'Parking', lawful_route: 'Design change (half-basement) — see Change Request.', owner: U.la.id, target_date: A(25), status: 'Plan Approved' });

  // ---------- correspondence & fees ----------
  const cor = (p, d) => save('correspondence', { project_id: p.id, owner: U.cc.id, ...d });
  cor(P.heights, { subject: 'Fire NOC observations — meeting with DEO', authority: 'Rescue 1122 / Civil Defence', kind: 'Meeting', date: A(-20), approval: AP.h_fire.id, attendees: 'DEO Lahore; Fire Safety Officer; ABS MEP consultant', summary: 'Observations explained in detail.', commitments: 'ABS to resubmit revised drawings within 10 working days.', follow_up: A(-3), status: 'Open' });
  cor(P.heights, { subject: 'WASA connection application', authority: 'WASA Lahore', kind: 'Letter Out', ref_no: 'ABS/WASA/26/031', date: A(-26), approval: AP.h_wasa.id, follow_up: A(4), status: 'Awaiting Authority' });
  cor(P.square, { subject: 'TIA observations letter', authority: 'TEPA (LDA)', kind: 'Letter In', ref_no: 'TEPA/OBS/26/440', date: A(-40), approval: AP.s_tia.id, observations: 'Parking shortfall 46 bays; queue analysis', follow_up: A(-5), status: 'Open' });
  cor(P.square, { subject: 'EPA IEE return letter', authority: 'EPA Punjab', kind: 'Letter In', ref_no: 'EPA/IEE/R/26/88', date: A(-30), approval: AP.s_epa.id, status: 'Closed', outcome: 'Rejected — escalated to CEO' });
  cor(P.greens, { subject: 'Regularization hearing — LDA committee', authority: 'LDA', kind: 'Hearing', date: A(6), approval: AP.g_rev.id, attendees: 'Director Town Planning; ABS legal counsel', follow_up: A(6), status: 'Open' });
  const fee = (p, d) => save('fees', { project_id: p.id, ...d });
  fee(P.square, { purpose: 'Commercialization fee', authority: 'LDA', approval: AP.s_comm.id, amount: 185e6, challan_no: 'PSID-LDA-26-1145-0091', paid_on: A(-140), status: 'Verified', receipt: letter('Commercialization fee receipt') });
  fee(P.heights, { purpose: 'Building plan scrutiny fee', authority: 'LDA', approval: AP.h_bp.id, amount: 6.4e6, challan_no: 'PSID-LDA-25-0332-1180', paid_on: A(-580), status: 'Verified', receipt: letter('Building plan fee receipt') });
  fee(P.heights, { purpose: 'Fire NOC processing fee', authority: 'Rescue 1122 / Civil Defence', approval: AP.h_fire.id, amount: 0.35e6, challan_no: 'R1122-FS-26-7731', status: 'Challan Issued' });

  // ---------- quality & safety ----------
  save('inspections', { project_id: H.id, title: 'L16 slab rebar inspection', kind: 'Inspection Request', date: A(-3), inspector: 'Hamza Raza', result: 'Pass' }, U.qa);
  save('inspections', { project_id: H.id, title: 'Cube test L15 slab (28-day)', kind: 'Material Test', date: A(-8), inspector: 'UET lab', result: 'Conditional', notes: '1 of 6 cubes below 5000 psi; core test ordered' }, U.qa);
  save('inspections', { project_id: RS.id, title: 'Fire alarm system commissioning', kind: 'Inspection Request', date: A(-12), result: 'Pass' }, U.qa);
  const ncr = (p, d) => save('ncrs', { project_id: p.id, ...d }, U.qa);
  ncr(H, { title: 'Honeycombing at L14 column C-12', severity: 'Major', raised_on: A(-18), responsible: 'Main contractor', corrective_action: 'Chip out, bonding agent, micro-concrete repair; engineer to inspect', target_date: A(-4), status: 'Action Proposed' });
  ncr(H, { title: 'Cube strength below spec L15 slab', severity: 'Critical', raised_on: A(-8), responsible: 'Main contractor / batching plant', corrective_action: '', target_date: A(7), status: 'Open' });
  const n3 = ncr(H, { title: 'Blockwork mortar ratio deviation L6', severity: 'Minor', raised_on: A(-30), responsible: 'Main contractor', corrective_action: 'Re-done affected panels; mortar mix supervision', target_date: A(-20), status: 'Action Done' });
  upd('ncrs', n3.id, { status: 'Closed', closed_on: A(-22) }, U.qa);
  ncr(G, { title: 'Column verticality out of tolerance (L12)', severity: 'Major', raised_on: A(-25), responsible: 'Main contractor', corrective_action: 'Survey and correct 4 columns before L13 pour', target_date: A(-10), status: 'Open' });
  const hse = (p, d) => save('safety', { project_id: p.id, owner: U.se.id, ...d }, U.se);
  hse(H, { title: 'Unsecured slab edge L15', kind: 'Near Miss', severity: 'Medium', date: A(-9), description: 'Worker near unprotected edge; no fall', action: 'Edge protection installed full perimeter', status: 'Closed' });
  hse(H, { title: 'Hand injury — rebar cutting', kind: 'Incident', severity: 'Medium', date: A(-14), description: 'Minor laceration; first aid; returned to work', action: 'Cut-resistant gloves mandatory', status: 'Closed' });
  hse(H, { title: 'Weekly HSE inspection', kind: 'Inspection', severity: 'Low', date: A(-2), status: 'Open', action: 'Scaffold tags missing on 2 towers' });
  hse(G, { title: 'Excavation trench without shoring', kind: 'Observation', severity: 'High', date: A(-4), action: 'Stop work until trench box installed', status: 'Open' });

  // ---------- close-out (Residency) ----------
  for (const [loc, desc, tr, st, tg] of [['Block A L3 Apt 304', 'Bathroom tile hollow', 'Finishes', 'Fixed', -5], ['Block A L5 corridor', 'Paint touch-up', 'Finishes', 'Verified', -10], ['Basement', 'Ramp anti-skid strips', 'Civil', 'Open', 7], ['Roof', 'Water tank overflow pipe', 'Plumbing', 'Open', 4], ['Lobby', 'Intercom panel not working', 'Electrical', 'Open', -2], ['Lift 2', 'Door sensor adjustment', 'Lifts', 'Fixed', 0]])
    save('snags', { project_id: RS.id, location: loc, description: desc, trade: tr, status: st, target_date: A(tg) });
  for (const [title, kind, st, exp] of [['Architectural as-built set', 'As-built Drawings', 'Received', null], ['MEP as-built set', 'As-built Drawings', 'Pending', null], ['Lift O&M manuals', 'O&M Manual', 'Verified', null], ['Waterproofing warranty (10 yr)', 'Warranty', 'Verified', 3650], ['Generator warranty', 'Warranty', 'Verified', 45], ['Fire system test certificate', 'Test Certificate', 'Verified', null], ['LDA completion certificate', 'Completion Certificate', 'Pending', null], ['Main contract final account', 'Contract Close-out', 'Pending', null]])
    save('closeout', { project_id: RS.id, title, kind, status: st, expiry: exp ? A(exp) : '' }, U.sl);

  // ---------- documents ----------
  const doc = (p, d) => save('documents', { project_id: p.id, ...d }, U.dc);
  doc(H, { doc_no: 'H-SP-001', title: 'Sanctioned building plan (LDA)', kind: 'Sanctioned Plan', discipline: 'Planning', revision: 'R0', status: 'Approved', issued: A(-522), approval: AP.h_bp.id, file: AP.h_bp.letter });
  doc(H, { doc_no: 'H-ST-210', title: 'Structural drawings L11–L22', kind: 'Drawing', discipline: 'Structure', revision: 'R3', status: 'Issued for Construction', issued: A(-80) });
  doc(H, { doc_no: 'H-ST-210', title: 'Structural drawings L11–L22', kind: 'Drawing', discipline: 'Structure', revision: 'R2', status: 'Superseded', issued: A(-160) });
  doc(H, { doc_no: 'H-FS-101', title: 'Fire strategy & life-safety drawings', kind: 'Drawing', discipline: 'MEP', revision: 'R2', status: 'For Review', issued: A(-4), approval: AP.h_fire.id });
  doc(H, { doc_no: 'H-ENV-01', title: 'EPA IEE approval', kind: 'Permit / NOC', discipline: 'Planning', revision: 'R0', status: 'Approved', issued: A(-581), expiry: A(45), approval: AP.h_epa.id, file: AP.h_epa.letter });
  doc(P.square, { doc_no: 'S-AR-001', title: 'Design development package', kind: 'Drawing', discipline: 'Architecture', revision: 'R1', status: 'Approved', issued: A(-70) });
  save('transmittals', { project_id: H.id, subject: 'Revised fire drawings to Rescue 1122', to: 'Rescue 1122 Lahore', date: A(-1), purpose: 'For Submission to Authority', documents: 'H-FS-101 R2', status: 'Sent' }, U.dc);

  // ---------- meetings & actions ----------
  const m1 = save('meetings', { project_id: H.id, title: 'Weekly coordination — Tower-1', kind: 'Weekly Coordination', date: A(-3), chair: U.pm1.id, attendees: 'PM, Chief Coordinator, Studio Head, QA/QC, QS, Procurement, Doc Control, RE', agenda: '1. Approvals segment (Chief Coordinator)\n2. Programme & recovery\n3. Procurement\n4. Quality & safety\n5. Decisions & actions', minutes: 'Fire NOC resubmission on track. Superstructure recovery plan adopted. Glazing bid evaluation to close this week.', status: 'Held' });
  const m2 = save('meetings', { title: 'Monthly CEO review — September', kind: 'Monthly CEO Review', date: A(-9), chair: U.ceo.id, attendees: 'CEO, Chief Coordinator, PMs, QS', status: 'Closed', minutes: 'Portfolio reviewed. EPA rejection on Tower-2 escalated.' });
  const acn = (d) => save('actions', { status: 'Open', kind: 'Action', ...d });
  acn({ project_id: H.id, meeting: m1.id, description: 'Resubmit revised fire drawings to Rescue 1122', owner: U.cc.id, due_date: A(4) });
  acn({ project_id: H.id, meeting: m1.id, description: 'Close glazing bid evaluation and recommend award', owner: U.pr.id, due_date: A(3) });
  acn({ project_id: H.id, meeting: m1.id, description: 'Core test on L15 slab and report', owner: U.qa.id, due_date: A(-1) });
  acn({ project_id: H.id, meeting: m1.id, kind: 'Decision', description: 'Night shift approved on core walls for 6 weeks', owner: U.pm1.id, due_date: A(-3), status: 'Done' });
  acn({ meeting: m2.id, description: 'Prepare EIA vs. redesign option paper for Tower-2', owner: U.cc.id, due_date: A(-2) });
  acn({ project_id: P.greens.id, meeting: m2.id, description: 'Brief legal counsel for regularization hearing (Tower-3)', owner: U.cc.id, due_date: A(4) });
  save('meetings', { project_id: H.id, title: 'Weekly coordination — Tower-1', kind: 'Weekly Coordination', date: A(4), chair: U.pm1.id, status: 'Scheduled', agenda: 'Standing agenda' });
  save('meetings', { title: 'Monthly CEO review — October', kind: 'Monthly CEO Review', date: A(21), chair: U.ceo.id, status: 'Scheduled' });

  // assign project access for project-scoped roles
  D.users.update(U.pm1.id, { projects: [P.heights.id, P.residency.id] });
  D.users.update(U.pm2.id, { projects: [P.square.id, P.greens.id, P.one.id] });
  D.users.update(U.sv.id, { projects: [P.greens.id, P.residency.id] });

  E.sweep();
  console.log(`Seeded ${D.users.all().length} users, ${Object.keys(S.ENTITIES).reduce((s, e) => s + D.records.all(e).length, 0)} records.`);
}

module.exports = { run };
