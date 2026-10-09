// ABS Control — single source of truth.
// Every register in the ABS Management Framework is defined here once; storage,
// forms, lists, permissions, CSV import/export and audit are all driven from it.

const ROLES = {
  admin:          { label: 'System Administrator' },
  ceo:            { label: 'Chief Executive Officer' },
  chief_coord:    { label: 'Chief Town Planner / Chief Coordinator' },
  pm:             { label: 'Project Manager' },
  studio_head:    { label: 'Studio Head' },
  lead_architect: { label: 'Lead Architect' },
  qaqc:           { label: 'QA/QC Manager' },
  qs_finance:     { label: 'QS / Cost Control / Finance' },
  procurement:    { label: 'Procurement / Contracts' },
  doc_controller: { label: 'Document Controller' },
  site_engineer:  { label: 'Site / Resident Engineer' },
  supervisor:     { label: 'Site Supervisor' },
  sales_handover: { label: 'Sales / Marketing & Handover' },
  viewer:         { label: 'Read-only Viewer' },
};

const GROUPS = [
  { key: 'gov',      label: 'Approvals & Government' },
  { key: 'delivery', label: 'Project Delivery' },
  { key: 'commercial', label: 'Commercial' },
  { key: 'quality',  label: 'Quality, Safety & Close-out' },
  { key: 'records',  label: 'Records' },
  { key: 'governance', label: 'Governance' },
];

const AUTHORITIES = ['LDA', 'TEPA (LDA)', 'MCL / TMA', 'WASA Lahore', 'LESCO', 'SNGPL', 'EPA Punjab',
  'Rescue 1122 / Civil Defence', 'CAA', 'Punjab Revenue / Land Record', 'PRERA / Real Estate Regulator', 'Other'];

const PROJECT_PHASES = ['I — Due Diligence & Planning', 'II — Design & Ramp-Up', 'III — Construction', 'IV — Completion & Close-out'];

const f = (k, label, type = 'text', o = {}) => ({ k, label, type, ...o });

const ENTITIES = {
  projects: {
    label: 'Project', plural: 'Projects', group: 'gov', prefix: 'PRJ', title: 'name', status: 'status', global: true,
    help: 'Project Status Register (§5): one controlled file per project.',
    fields: [
      f('name', 'Project name', 'text', { required: true, list: true }),
      f('type', 'Type', 'select', { options: ['Residential High-rise', 'Commercial', 'Mixed-use', 'Housing Scheme / Plotted', 'Residential Low-rise', 'Institutional'], list: true }),
      f('city', 'City', 'text', { list: true }),
      f('location', 'Location / address', 'text'),
      f('authority', 'Primary authority', 'select', { options: AUTHORITIES, list: true }),
      f('ownership', 'Ownership / development status', 'select', { options: ['Owned', 'Joint Venture', 'Land Sharing', 'Leased', 'Under Acquisition'] }),
      f('approval_position', 'Current approval position', 'textarea'),
      f('phase', 'Lifecycle phase', 'select', { options: PROJECT_PHASES, list: true, help: 'Advances only through an approved Phase Gate.' }),
      f('status', 'Status', 'select', { options: ['Active', 'On Hold', 'Completed', 'Cancelled'], list: true }),
      f('pm', 'Project Manager', 'user', { list: true }),
      f('site_lead', 'Site In-charge', 'user'),
      f('plot_area', 'Plot area (kanal)', 'number'),
      f('covered_area', 'Covered area (sq ft)', 'number'),
      f('floors', 'Floors', 'number'),
      f('start_date', 'Start date', 'date'),
      f('baseline_completion', 'Baseline completion', 'date', { list: true, baseline: true }),
      f('forecast_completion', 'Forecast completion', 'date', { list: true }),
      f('budget', 'Approved budget (PKR)', 'money', { baseline: true }),
      f('baseline_locked', 'Baseline locked', 'bool', { help: 'Once locked, baseline dates/budget change only through an approved Change Request (§16).' }),
      f('change_ref', 'Change Request (for baseline edits)', 'ref', { ref: 'changes' }),
      f('description', 'Brief / scope', 'textarea'),
    ],
  },

  approvals: {
    label: 'Approval / NOC', plural: 'Statutory Approvals', group: 'gov', prefix: 'APR', title: 'title', status: 'status', board: true,
    help: 'Statutory Approvals Matrix (§4.3, §5). An approval is never "Granted" without the authority\'s written confirmation.',
    approveStatuses: [],
    fields: [
      f('title', 'Approval / NOC', 'text', { required: true, list: true }),
      f('authority', 'Authority', 'select', { options: AUTHORITIES, required: true, list: true }),
      f('category', 'Category', 'select', { options: ['Planning / Land-use', 'Building Plan', 'NOC', 'Utility', 'Environmental', 'Fire & Life-safety', 'Traffic', 'Height / Aviation', 'Regulatory Registration', 'Completion / Occupancy', 'Other'] }),
      f('status', 'Status', 'select', { options: ['Not Started', 'Preparing', 'Submitted', 'Observations', 'Resubmitted', 'Granted', 'Rejected', 'Expired'], list: true, required: true }),
      f('internal_lead', 'Accountable internal lead', 'user', { list: true }),
      f('authority_officer', 'Authority officer / desk', 'text'),
      f('prerequisites', 'Prerequisites / documents required', 'textarea'),
      f('submission_target', 'Target submission', 'date'),
      f('submitted_on', 'Submitted on', 'date'),
      f('decision_target', 'Target decision', 'date', { list: true }),
      f('application_no', 'Application / diary no.', 'text'),
      f('obs_received_on', 'Observations received', 'date'),
      f('obs_closed_on', 'Observations closed', 'date'),
      f('observations', 'Outstanding observations', 'textarea'),
      f('next_action', 'Next action', 'text', { list: true }),
      f('reference_no', 'Approval reference no.', 'text', { help: 'Required to mark Granted.' }),
      f('issued_on', 'Issued on', 'date', { help: 'Required to mark Granted.' }),
      f('expiry_date', 'Expiry / renewal date', 'date', { list: true }),
      f('conditions', 'Approval conditions', 'textarea'),
      f('conditions_ack', 'Conditions communicated to site', 'bool', { help: 'Site work linked to this approval is blocked until acknowledged.' }),
      f('letter', 'Authority letter / certificate', 'file', { help: 'Written confirmation — mandatory for Granted (§4.4).' }),
      f('fee', 'Official fee (PKR)', 'money'),
    ],
  },

  deficiencies: {
    label: 'Deficiency', plural: 'Deficiency & Regularization', group: 'gov', prefix: 'DEF', title: 'title', status: 'status', board: true,
    help: 'Each deviation or missing approval, its lawful route to resolution and closure evidence (§5).',
    fields: [
      f('title', 'Deficiency', 'text', { required: true, list: true }),
      f('type', 'Type', 'select', { options: ['Missing approval', 'Deviation from sanctioned plan', 'Setback / coverage', 'Height', 'Parking', 'Land-use / commercialization', 'Land / title', 'Fire / life-safety', 'Other'], list: true }),
      f('description', 'Description', 'textarea'),
      f('lawful_route', 'Lawful route for resolution', 'textarea', { required: true }),
      f('approval', 'Linked approval', 'ref', { ref: 'approvals' }),
      f('owner', 'Responsible person', 'user', { list: true }),
      f('cost_impact', 'Cost implication (PKR)', 'money'),
      f('time_impact', 'Time implication (days)', 'number'),
      f('target_date', 'Target date', 'date', { list: true }),
      f('status', 'Status', 'select', { options: ['Identified', 'Plan Approved', 'In Progress', 'Submitted to Authority', 'Closed'], list: true, required: true }),
      f('closure_evidence', 'Closure evidence', 'file', { help: 'Mandatory to close.' }),
    ],
  },

  correspondence: {
    label: 'Correspondence', plural: 'Gov. Correspondence & Meetings', group: 'gov', prefix: 'COR', title: 'subject', status: 'status',
    help: 'Every interaction with a public authority — reference numbers, commitments, observations and follow-ups (§4.1, §4.10).',
    fields: [
      f('subject', 'Subject', 'text', { required: true, list: true }),
      f('authority', 'Authority', 'select', { options: AUTHORITIES, list: true }),
      f('kind', 'Kind', 'select', { options: ['Letter Out', 'Letter In', 'Meeting', 'Site Visit / Inspection', 'Hearing', 'Email'], list: true }),
      f('ref_no', 'Reference no.', 'text'),
      f('date', 'Date', 'date', { required: true, list: true }),
      f('approval', 'Linked approval', 'ref', { ref: 'approvals' }),
      f('attendees', 'Attendees / officers', 'text'),
      f('summary', 'Summary', 'textarea'),
      f('commitments', 'Commitments made', 'textarea'),
      f('observations', 'Observations raised', 'textarea'),
      f('follow_up', 'Follow-up date', 'date', { list: true }),
      f('owner', 'Follow-up owner', 'user'),
      f('status', 'Status', 'select', { options: ['Open', 'Awaiting Authority', 'Closed'], list: true }),
      f('outcome', 'Outcome', 'textarea'),
      f('attachment', 'Attachment', 'file'),
    ],
  },

  fees: {
    label: 'Official Fee', plural: 'Official Fees & Challans', group: 'gov', prefix: 'FEE', title: 'purpose', status: 'status',
    help: 'Lawful-conduct control (§4.10): every payment to an authority must carry an official challan and receipt.',
    fields: [
      f('purpose', 'Purpose', 'text', { required: true, list: true }),
      f('authority', 'Authority', 'select', { options: AUTHORITIES, list: true }),
      f('approval', 'Linked approval', 'ref', { ref: 'approvals' }),
      f('amount', 'Amount (PKR)', 'money', { required: true, list: true }),
      f('challan_no', 'Official challan / PSID no.', 'text', { required: true, list: true }),
      f('paid_on', 'Paid on', 'date', { list: true }),
      f('status', 'Status', 'select', { options: ['Challan Issued', 'Paid', 'Verified'], list: true }),
      f('receipt', 'Bank receipt', 'file', { help: 'Mandatory once Paid.' }),
    ],
  },

  activities: {
    label: 'Activity', plural: 'Schedule / Programme', group: 'delivery', prefix: 'ACT', title: 'name', status: 'status', board: true,
    help: 'Baseline programme (§6). Activities requiring prior approval cannot start until the linked approval is Granted, valid and acknowledged (§5).',
    fields: [
      f('wbs', 'WBS', 'text', { list: true }),
      f('name', 'Activity', 'text', { required: true, list: true }),
      f('lifecycle', 'Phase', 'select', { options: PROJECT_PHASES }),
      f('milestone', 'Milestone', 'bool'),
      f('critical', 'On critical path', 'bool', { list: true }),
      f('owner', 'Responsible', 'user'),
      f('base_start', 'Baseline start', 'date', { baseline: true }),
      f('base_finish', 'Baseline finish', 'date', { baseline: true, list: true }),
      f('fc_start', 'Forecast start', 'date'),
      f('fc_finish', 'Forecast finish', 'date', { list: true }),
      f('act_start', 'Actual start', 'date'),
      f('act_finish', 'Actual finish', 'date'),
      f('pct', 'Progress %', 'percent', { list: true }),
      f('weight', 'Weight', 'number', { help: 'Relative weight for earned progress (default 1).' }),
      f('predecessors', 'Predecessors (codes)', 'text'),
      f('requires', 'Requires approvals', 'multiref', { ref: 'approvals', help: 'Work cannot start until all are Granted.' }),
      f('status', 'Status', 'select', { options: ['Not Started', 'In Progress', 'Completed', 'On Hold'], list: true }),
      f('change_ref', 'Change Request (for baseline edits)', 'ref', { ref: 'changes' }),
    ],
  },

  site_reports: {
    label: 'Site Report', plural: 'Weekly Site Progress', group: 'delivery', prefix: 'SPR', title: 'week_ending', status: null,
    help: 'Weekly planned vs actual, manpower, materials, constraints, photos and next-week plan (§6).',
    fields: [
      f('week_ending', 'Week ending', 'date', { required: true, list: true }),
      f('planned_pct', 'Planned cumulative %', 'percent', { list: true }),
      f('actual_pct', 'Actual cumulative %', 'percent', { list: true }),
      f('manpower', 'Avg. daily manpower', 'number', { list: true }),
      f('materials', 'Materials received / required', 'textarea'),
      f('equipment', 'Equipment on site', 'text'),
      f('constraints', 'Constraints / issues', 'textarea'),
      f('safety', 'Safety observations', 'textarea'),
      f('lookahead', 'Next two-week look-ahead', 'textarea'),
      f('photos', 'Site photos', 'files'),
    ],
  },

  delays: {
    label: 'Delay', plural: 'Delays & Recovery', group: 'delivery', prefix: 'DLY', title: 'title', status: 'status', board: true,
    help: 'Material slippage requires a recovery plan within 3 working days (§6). Created automatically when slippage is detected.',
    fields: [
      f('title', 'Delay', 'text', { required: true, list: true }),
      f('activity', 'Activity', 'ref', { ref: 'activities' }),
      f('identified_on', 'Identified on', 'date', { required: true }),
      f('plan_due', 'Recovery plan due', 'date', { readonly: true, list: true, help: 'Auto: identified + working days per settings.' }),
      f('cause', 'Cause', 'textarea'),
      f('impact_days', 'Time impact (days)', 'number', { list: true }),
      f('accountable', 'Accountable party', 'text'),
      f('mitigation', 'Mitigation / recovery actions', 'textarea'),
      f('revised_forecast', 'Revised forecast', 'date'),
      f('plan_submitted_on', 'Plan submitted on', 'date'),
      f('owner', 'Owner', 'user', { list: true }),
      f('status', 'Status', 'select', { options: ['Plan Due', 'Plan Submitted', 'Recovering', 'Closed'], list: true }),
    ],
  },

  risks: {
    label: 'Risk / Issue', plural: 'Risks & Issues', group: 'delivery', prefix: 'RSK', title: 'title', status: 'status', board: true,
    help: 'Risk & issue register with escalation to the CEO for material risks (§4.8, §15).',
    fields: [
      f('title', 'Risk / issue', 'text', { required: true, list: true }),
      f('kind', 'Kind', 'select', { options: ['Risk', 'Issue'], list: true }),
      f('category', 'Category', 'select', { options: ['Approval', 'Regulatory change', 'Land / title', 'Schedule', 'Cost', 'Procurement', 'Quality', 'Safety', 'Unauthorized work', 'Other'], list: true }),
      f('likelihood', 'Likelihood (1-5)', 'number', { min: 1, max: 5 }),
      f('impact', 'Impact (1-5)', 'number', { min: 1, max: 5 }),
      f('score', 'Score', 'number', { readonly: true, list: true }),
      f('mitigation', 'Mitigation', 'textarea'),
      f('owner', 'Owner', 'user', { list: true }),
      f('due_date', 'Due date', 'date'),
      f('escalation', 'Escalation', 'select', { options: ['None', 'Project Manager', 'CEO'], list: true }),
      f('decision_needed', 'Decision needed from CEO', 'textarea'),
      f('status', 'Status', 'select', { options: ['Open', 'Mitigating', 'Closed'], list: true }),
    ],
  },

  budget_lines: {
    label: 'Budget Line', plural: 'Budget & Cost', group: 'commercial', prefix: 'BUD', title: 'description', status: null,
    help: 'Approved budget, commitments, actual cost and forecast final cost (§15).',
    fields: [
      f('cost_code', 'Cost code', 'text', { list: true }),
      f('description', 'Description', 'text', { required: true, list: true }),
      f('category', 'Category', 'select', { options: ['Land & Approvals', 'Design & Consultancy', 'Substructure', 'Superstructure', 'MEP', 'Finishes', 'External Works', 'Prelims & Site', 'Contingency'] , list: true }),
      f('budget', 'Approved budget', 'money', { list: true, baseline: true }),
      f('committed', 'Committed', 'money', { list: true }),
      f('actual', 'Actual to date', 'money', { list: true }),
      f('forecast', 'Forecast final cost', 'money', { list: true }),
      f('change_ref', 'Change Request (for budget edits)', 'ref', { ref: 'changes' }),
    ],
  },

  contracts: {
    label: 'Contract / Package', plural: 'Procurement & Contracts', group: 'commercial', prefix: 'CTR', title: 'package', status: 'stage', board: true,
    help: 'Tender status, lead times, vendors, values and required-on-site dates (§15).',
    fields: [
      f('package', 'Package', 'text', { required: true, list: true }),
      f('kind', 'Type', 'select', { options: ['Main Contract', 'Subcontract', 'Supply', 'Consultancy', 'Service'], list: true }),
      f('vendor', 'Vendor / contractor', 'text', { list: true }),
      f('stage', 'Stage', 'select', { options: ['Planning', 'Tendering', 'Bid Evaluation', 'Awarded', 'Active', 'Closed'], list: true }),
      f('value', 'Contract value (PKR)', 'money', { list: true }),
      f('bids', 'Bid comparison notes', 'textarea'),
      f('award_date', 'Award date', 'date'),
      f('lead_time', 'Lead time (days)', 'number'),
      f('required_on_site', 'Required on site', 'date', { list: true }),
      f('delivered_on', 'Delivered / mobilized on', 'date'),
      f('expiry', 'Contract expiry / renewal', 'date'),
      f('deliverables', 'Deliverables', 'textarea'),
      f('document', 'Contract document', 'file'),
    ],
  },

  payment_apps: {
    label: 'Payment Application', plural: 'Payment Applications', group: 'commercial', prefix: 'IPC', title: 'app_no', status: 'status', board: true,
    help: 'Contractor applications reviewed against verified work and approved variations before certification (Phase III).',
    approveStatuses: ['Certified'],
    fields: [
      f('app_no', 'Application no.', 'text', { required: true, list: true }),
      f('contract', 'Contract', 'ref', { ref: 'contracts', list: true }),
      f('period_end', 'Period ending', 'date', { list: true }),
      f('claimed', 'Amount claimed', 'money', { list: true }),
      f('verified', 'Verified work value', 'money', { list: true }),
      f('certified', 'Amount certified', 'money', { list: true }),
      f('status', 'Status', 'select', { options: ['Submitted', 'Under QS Review', 'Certified', 'Paid', 'Rejected'], list: true }),
      f('notes', 'QS notes', 'textarea'),
      f('certificate', 'Payment certificate', 'file'),
    ],
  },

  changes: {
    label: 'Change / Variation', plural: 'Change & Variation Control', group: 'commercial', prefix: 'CR', title: 'title', status: 'status', board: true,
    help: 'No change to scope, budget or baseline is authorized unless approved in writing (§16). Variations approved before implementation.',
    approveStatuses: ['Approved', 'Rejected'],
    fields: [
      f('title', 'Change', 'text', { required: true, list: true }),
      f('kind', 'Type', 'select', { options: ['Variation Order', 'Scope', 'Budget', 'Schedule / Baseline', 'Design'], list: true }),
      f('reason', 'Reason', 'textarea', { required: true }),
      f('technical_basis', 'Technical basis', 'textarea'),
      f('cost_impact', 'Cost impact (PKR)', 'money', { list: true }),
      f('time_impact', 'Time impact (days)', 'number', { list: true }),
      f('approval_impact', 'Statutory approval implication', 'textarea'),
      f('status', 'Status', 'select', { options: ['Draft', 'Submitted', 'Approved', 'Rejected', 'Implemented'], list: true }),
      f('approved_by', 'Approved by', 'user', { readonly: true }),
      f('approved_on', 'Approved on', 'date', { readonly: true }),
      f('implemented_on', 'Implemented on', 'date'),
    ],
  },

  inspections: {
    label: 'Inspection / Test', plural: 'Inspections & Tests', group: 'quality', prefix: 'ITR', title: 'title', status: 'result',
    fields: [
      f('title', 'Inspection / test', 'text', { required: true, list: true }),
      f('kind', 'Type', 'select', { options: ['Inspection Request', 'Material Test', 'Site Inspection', 'Authority Inspection'], list: true }),
      f('activity', 'Activity', 'ref', { ref: 'activities' }),
      f('date', 'Date', 'date', { list: true }),
      f('inspector', 'Inspector', 'text'),
      f('result', 'Result', 'select', { options: ['Pending', 'Pass', 'Conditional', 'Fail'], list: true }),
      f('notes', 'Notes', 'textarea'),
      f('record', 'Record / certificate', 'file'),
    ],
  },

  ncrs: {
    label: 'Non-conformance', plural: 'Non-conformances (NCR)', group: 'quality', prefix: 'NCR', title: 'title', status: 'status', board: true,
    approveStatuses: ['Closed'],
    help: 'NCRs close only after QA/QC verifies the corrective action.',
    fields: [
      f('title', 'Non-conformance', 'text', { required: true, list: true }),
      f('severity', 'Severity', 'select', { options: ['Minor', 'Major', 'Critical'], list: true }),
      f('raised_on', 'Raised on', 'date'),
      f('responsible', 'Responsible party', 'text', { list: true }),
      f('corrective_action', 'Corrective action', 'textarea'),
      f('target_date', 'Target close date', 'date', { list: true }),
      f('status', 'Status', 'select', { options: ['Open', 'Action Proposed', 'Action Done', 'Closed'], list: true }),
      f('verified_by', 'Verified by', 'user', { readonly: true }),
      f('closed_on', 'Closed on', 'date', { readonly: true }),
      f('evidence', 'Evidence', 'file'),
    ],
  },

  safety: {
    label: 'Safety Record', plural: 'Safety', group: 'quality', prefix: 'HSE', title: 'title', status: 'status',
    fields: [
      f('title', 'Record', 'text', { required: true, list: true }),
      f('kind', 'Type', 'select', { options: ['Incident', 'Near Miss', 'Observation', 'Inspection', 'Toolbox Talk'], list: true }),
      f('severity', 'Severity', 'select', { options: ['Low', 'Medium', 'High', 'Lost Time'], list: true }),
      f('date', 'Date', 'date', { list: true }),
      f('description', 'Description', 'textarea'),
      f('action', 'Corrective action', 'textarea'),
      f('owner', 'Owner', 'user'),
      f('status', 'Status', 'select', { options: ['Open', 'Closed'], list: true }),
      f('photo', 'Photo', 'file'),
    ],
  },

  snags: {
    label: 'Snag', plural: 'Snag / Punch List', group: 'quality', prefix: 'SNG', title: 'description', status: 'status', board: true,
    fields: [
      f('location', 'Location', 'text', { list: true }),
      f('description', 'Description', 'text', { required: true, list: true }),
      f('trade', 'Trade', 'select', { options: ['Civil', 'Finishes', 'Electrical', 'Plumbing', 'HVAC', 'Fire', 'Lifts', 'External'], list: true }),
      f('target_date', 'Target date', 'date', { list: true }),
      f('status', 'Status', 'select', { options: ['Open', 'Fixed', 'Verified'], list: true }),
      f('photo', 'Photo', 'file'),
    ],
  },

  closeout: {
    label: 'Close-out Item', plural: 'Close-out & Handover', group: 'quality', prefix: 'CLO', title: 'title', status: 'status',
    help: 'As-builts, O&M manuals, warranties, test certificates, completion certificate and handover (Phase IV).',
    fields: [
      f('title', 'Item', 'text', { required: true, list: true }),
      f('kind', 'Type', 'select', { options: ['As-built Drawings', 'O&M Manual', 'Warranty', 'Test Certificate', 'Completion Certificate', 'Handover Certificate', 'Contract Close-out', 'Training'], list: true }),
      f('status', 'Status', 'select', { options: ['Pending', 'Received', 'Verified'], list: true }),
      f('expiry', 'Expiry (warranties)', 'date', { list: true }),
      f('file', 'Document', 'file'),
    ],
  },

  documents: {
    label: 'Document', plural: 'Document Register', group: 'records', prefix: 'DOC', title: 'title', status: 'status',
    help: 'Approved-document & drawing register: sanctioned plans, permits, NOCs, revisions and expiry (§5, §15).',
    fields: [
      f('doc_no', 'Document no.', 'text', { list: true }),
      f('title', 'Title', 'text', { required: true, list: true }),
      f('kind', 'Type', 'select', { options: ['Sanctioned Plan', 'Permit / NOC', 'Certificate', 'Drawing', 'Specification', 'Report', 'Contract', 'Minutes', 'Other'], list: true }),
      f('discipline', 'Discipline', 'select', { options: ['Architecture', 'Structure', 'MEP', 'Planning', 'Legal', 'General'] }),
      f('revision', 'Revision', 'text', { list: true }),
      f('status', 'Status', 'select', { options: ['Draft', 'For Review', 'Approved', 'Issued for Construction', 'Superseded'], list: true }),
      f('issued', 'Issued date', 'date'),
      f('expiry', 'Expiry / renewal', 'date', { list: true }),
      f('approval', 'Linked approval', 'ref', { ref: 'approvals' }),
      f('file', 'File', 'file'),
    ],
  },

  transmittals: {
    label: 'Transmittal', plural: 'Transmittals', group: 'records', prefix: 'TRN', title: 'subject', status: 'status',
    fields: [
      f('subject', 'Subject', 'text', { required: true, list: true }),
      f('to', 'To', 'text', { list: true }),
      f('date', 'Date', 'date', { list: true }),
      f('purpose', 'Purpose', 'select', { options: ['For Approval', 'For Information', 'For Construction', 'For Submission to Authority'], list: true }),
      f('documents', 'Documents (codes)', 'textarea'),
      f('status', 'Status', 'select', { options: ['Sent', 'Acknowledged', 'Returned with Comments'], list: true }),
    ],
  },

  meetings: {
    label: 'Meeting', plural: 'Meetings', group: 'governance', prefix: 'MTG', title: 'title', status: 'status',
    help: 'Weekly coordination, weekly site review and monthly CEO review (§7, §16). A meeting closes only when every action has an owner and due date.',
    projectOptional: true,
    fields: [
      f('title', 'Title', 'text', { required: true, list: true }),
      f('kind', 'Type', 'select', { options: ['Weekly Coordination', 'Weekly Site Review', 'Monthly CEO Review', 'Authority Meeting', 'Ad-hoc'], list: true }),
      f('date', 'Date', 'date', { required: true, list: true }),
      f('chair', 'Chair', 'user', { list: true }),
      f('attendees', 'Attendees', 'text'),
      f('agenda', 'Agenda', 'textarea'),
      f('minutes', 'Minutes', 'textarea'),
      f('status', 'Status', 'select', { options: ['Scheduled', 'Held', 'Closed'], list: true }),
    ],
  },

  actions: {
    label: 'Decision / Action', plural: 'Decision & Action Log', group: 'governance', prefix: 'ACN', title: 'description', status: 'status', board: true,
    projectOptional: true,
    fields: [
      f('description', 'Decision / action', 'text', { required: true, list: true }),
      f('kind', 'Kind', 'select', { options: ['Action', 'Decision'], list: true }),
      f('meeting', 'Meeting', 'ref', { ref: 'meetings' }),
      f('owner', 'Responsible', 'user', { list: true }),
      f('due_date', 'Target date', 'date', { list: true }),
      f('status', 'Status', 'select', { options: ['Open', 'Done', 'Cancelled'], list: true }),
      f('notes', 'Closure notes', 'textarea'),
    ],
  },

  gates: {
    label: 'Phase Gate', plural: 'Phase Gates', group: 'governance', prefix: 'GATE', title: 'phase', status: 'status',
    help: 'Management approval before a project proceeds to the next stage (§14). CEO approval advances the project phase.',
    approveStatuses: ['Approved', 'Rejected'],
    fields: [
      f('phase', 'Phase', 'select', { options: PROJECT_PHASES, required: true, list: true }),
      f('checklist', 'Gate checklist', 'checklist'),
      f('status', 'Status', 'select', { options: ['Open', 'Submitted', 'Approved', 'Rejected'], list: true }),
      f('submitted_by', 'Submitted by', 'user', { readonly: true }),
      f('approved_by', 'Decision by', 'user', { readonly: true, list: true }),
      f('decided_on', 'Decision date', 'date', { readonly: true }),
      f('remarks', 'Remarks', 'textarea'),
    ],
  },
};

// Gate checklists from §14 of the framework.
const GATE_CHECKLISTS = {
  [PROJECT_PHASES[0]]: [
    'Existing facilities, site conditions, access, utilities and constraints surveyed',
    'Project brief / programme, scope and development objectives validated',
    'Preliminary budget prepared',
    'Land/title, planning, environmental, utility and statutory dependencies identified',
    'Initial risk register, feasibility assumptions and cash-flow needs prepared',
    'Overall programme schedule prepared',
  ],
  [PROJECT_PHASES[1]]: [
    'Architects, engineers and specialist consultants appointed',
    'Schematic & design-development packages reviewed (scope, buildability, regulation, budget)',
    'Construction cost estimate and value-engineering review completed',
    'Statutory submission package coordinated; observations recorded',
    'Tendering and bid analysis completed; contractor selected',
    'Programme, budget and procurement strategy revalidated',
    'All approvals required before construction are Granted',
  ],
  [PROJECT_PHASES[2]]: [
    'Master construction schedule maintained with critical path',
    'Authority approvals and inspections current',
    'Contractor performance reviewed against contract',
    'All variations approved and recorded',
    'Payment applications reconciled with verified work',
    'Quality & safety records complete; no open critical NCRs',
  ],
  [PROJECT_PHASES[3]]: [
    'Snag / punch list closed',
    'Final inspections, testing and commissioning complete',
    'Completion certificates obtained from competent authorities',
    'As-builts, O&M manuals, warranties and certificates archived',
    'Handover / operational readiness achieved',
    'Contracts, accounts and claims closed out',
    'Final project completion report and lessons learned issued',
  ],
};

// Starter library of statutory approvals for Lahore projects. Editable in Admin;
// the Chief Town Planner must verify applicability for each project.
const APPROVAL_TEMPLATES = [
  { title: 'Land-use / Master Plan conformity verification', authority: 'LDA', category: 'Planning / Land-use', types: ['*'] },
  { title: 'Title verification (Fard / mutation / registry)', authority: 'Punjab Revenue / Land Record', category: 'Planning / Land-use', types: ['*'] },
  { title: 'Commercialization / change of land-use', authority: 'LDA', category: 'Planning / Land-use', types: ['Commercial', 'Mixed-use'] },
  { title: 'Layout plan approval', authority: 'LDA', category: 'Planning / Land-use', types: ['Housing Scheme / Plotted'] },
  { title: 'Traffic Impact Assessment NOC', authority: 'TEPA (LDA)', category: 'Traffic', types: ['Commercial', 'Mixed-use', 'Residential High-rise', 'Housing Scheme / Plotted'] },
  { title: 'Environmental approval (IEE / EIA)', authority: 'EPA Punjab', category: 'Environmental', types: ['*'] },
  { title: 'Height clearance NOC', authority: 'CAA', category: 'Height / Aviation', types: ['Residential High-rise', 'Commercial', 'Mixed-use'] },
  { title: 'Structural design vetting', authority: 'LDA', category: 'Building Plan', types: ['Residential High-rise', 'Commercial', 'Mixed-use'] },
  { title: 'Fire safety NOC', authority: 'Rescue 1122 / Civil Defence', category: 'Fire & Life-safety', types: ['*'] },
  { title: 'Building plan approval (sanctioned plan)', authority: 'LDA', category: 'Building Plan', types: ['*'] },
  { title: 'Water & sewerage NOC', authority: 'WASA Lahore', category: 'Utility', types: ['*'] },
  { title: 'Electricity load sanction / NOC', authority: 'LESCO', category: 'Utility', types: ['*'] },
  { title: 'Gas connection NOC (if applicable)', authority: 'SNGPL', category: 'Utility', types: ['Residential Low-rise', 'Housing Scheme / Plotted'] },
  { title: 'Project registration (verify applicability)', authority: 'PRERA / Real Estate Regulator', category: 'Regulatory Registration', types: ['*'] },
  { title: 'Plinth / stage inspection certificate', authority: 'LDA', category: 'Building Plan', types: ['*'] },
  { title: 'Completion certificate', authority: 'LDA', category: 'Completion / Occupancy', types: ['*'] },
];

// Permission letters: r=read c=create u=update d=delete a=approve
const ALL = 'rcuda';
function defaultPermissions() {
  const P = {};
  const keys = Object.keys(ENTITIES);
  const set = (role, ents, p) => { P[role] = P[role] || {}; (ents === '*' ? keys : ents).forEach(e => P[role][e] = p); };
  for (const r of Object.keys(ROLES)) set(r, '*', 'r');
  set('admin', '*', ALL);
  set('ceo', '*', ALL);
  set('chief_coord', ['approvals', 'deficiencies', 'correspondence', 'fees', 'documents', 'transmittals', 'meetings', 'actions', 'risks'], 'rcud');
  set('chief_coord', ['projects', 'delays', 'gates', 'changes'], 'rcu');
  set('pm', ['activities', 'site_reports', 'delays', 'risks', 'budget_lines', 'contracts', 'payment_apps', 'changes', 'inspections', 'ncrs', 'safety', 'snags', 'closeout', 'meetings', 'actions', 'transmittals'], 'rcud');
  set('pm', ['projects', 'gates', 'documents', 'deficiencies', 'correspondence'], 'rcu');
  P.pm.changes = 'rcuda'; // PM approves within delegated limit (settings.pm_change_limit)
  set('studio_head', ['documents', 'transmittals', 'actions', 'deficiencies'], 'rcu');
  set('lead_architect', ['documents', 'transmittals', 'actions', 'deficiencies', 'approvals'], 'rcu');
  set('qaqc', ['inspections', 'ncrs', 'safety', 'snags'], 'rcuda');
  set('qaqc', ['actions', 'closeout'], 'rcu');
  set('qs_finance', ['budget_lines', 'payment_apps', 'changes', 'fees'], 'rcu');
  P.qs_finance.payment_apps = 'rcuda';
  set('procurement', ['contracts'], 'rcud');
  set('procurement', ['actions'], 'rcu');
  set('doc_controller', ['documents', 'transmittals', 'correspondence', 'closeout'], 'rcud');
  set('doc_controller', ['actions'], 'rcu');
  set('site_engineer', ['site_reports', 'inspections', 'safety', 'snags', 'activities', 'delays', 'actions'], 'rcu');
  set('site_engineer', ['ncrs', 'risks'], 'rcu');
  set('supervisor', ['site_reports', 'safety', 'snags'], 'rcu');
  set('sales_handover', ['snags', 'closeout'], 'rcu');
  return P;
}

const DEFAULT_SETTINGS = {
  org_name: 'ABS Developers',
  currency: 'PKR',
  weekend: [0],                 // Sunday (0=Sun … 6=Sat)
  holidays: [],                 // ISO dates
  recovery_days: 3,             // §6: plan within 3 working days
  slip_threshold_days: 7,       // forecast finish beyond baseline → material slippage
  slip_threshold_critical: 1,   // any slip on a critical activity
  expiry_warn_days: [90, 60, 30],
  pm_change_limit: 500000,      // PKR — PM may approve changes up to this cost impact
  rag: { spi_green: 0.95, spi_amber: 0.85, cost_green: 1.0, cost_amber: 1.05 },
  notify_email: '',             // hook: SMTP relay / WhatsApp gateway (future)
};

module.exports = { ROLES, GROUPS, ENTITIES, AUTHORITIES, PROJECT_PHASES, GATE_CHECKLISTS, APPROVAL_TEMPLATES, defaultPermissions, DEFAULT_SETTINGS };
