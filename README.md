# ABS Control

The operating engine for the **ABS Developers Management Framework** — Government Affairs, Planning Approvals & Project Coordination, plus the integrated Project Management function. Every register, control, phase gate and KPI in the framework document is implemented as live data with rules enforced by the system, and the CEO's weekly dashboard and monthly report are generated from the same data.

## Run

Requires Node 22.5+ (uses the built-in SQLite). No dependencies, no build step.

```
node server.js            # http://localhost:4800
node server.js --seed     # wipe and reload the demo dataset
```

On Windows, double-click `start.bat`.

First start seeds a demo portfolio of five Lahore projects across all four lifecycle phases.

| Account | Role | Password |
|---|---|---|
| admin@abs.pk | System Administrator | admin12345 |
| ceo@abs.pk | CEO | abs12345 |
| fahim@abs.pk | Chief Town Planner / Chief Coordinator | abs12345 |
| ayesha@abs.pk, bilal@abs.pk | Project Managers | abs12345 |
| ali@abs.pk | Resident Engineer | abs12345 |
| hamza@abs.pk | QA/QC Manager | abs12345 |
| fatima@abs.pk · imran@abs.pk · zainab@abs.pk · sana@abs.pk · usman@abs.pk · kashif@abs.pk · mariam@abs.pk | QS · Procurement · Document Control · Studio Head · Lead Architect · Supervisor · Handover | abs12345 |

**Before going live:** sign in as admin, create real users (temporary passwords are issued and must be changed at first sign-in), disable the demo accounts, and run `node server.js --seed` only if you want to clear the demo data (then create projects from scratch).

## What the engine enforces

| Framework clause | Rule in the system |
|---|---|
| §4.4 No approval is secured without written confirmation | An approval cannot be set to **Granted** without the authority's reference number, issue date and the uploaded letter. |
| §5 Submission is not authorization | An activity linked to approvals cannot start unless each is Granted, unexpired and its conditions acknowledged by site. Attempts are blocked, logged and alerted to the CEO and Chief Coordinator. |
| §6 Recovery plan within 3 working days | Material slippage auto-creates a Delay with a working-day deadline (weekend/holiday aware); overdue plans escalate to the CEO. |
| §14 Phase gates | Projects advance only when the gate checklist is complete, submitted, and approved by the CEO in the system. |
| §16 No change to scope/budget/baseline without written approval | Locked baselines (dates, budget) can only change through an Approved Change Request. Scope/baseline changes and anything above the PM's delegated limit require the CEO. |
| §15 Variations approved before implementation | A change cannot be marked Implemented unless it was Approved first. |
| §4.10 Lawful conduct | Every fee paid to an authority requires an official challan number and a bank receipt. |
| §16 Decision & action log | A meeting cannot be closed while any action lacks an owner or due date. |
| §5 Expiry / renewal | NOC and permit expiries raise alerts at 90/60/30 days and auto-expire, which re-blocks linked site work. |

RAG status, both KPI tables (§8 and §17), the CEO decisions inbox and all alerts are computed — never typed in.

## Structure

```
server.js          Local launcher · api/index.js — Vercel entry · vercel.json — routing
lib/schema.js      Every register and field (single source of truth), roles, default permissions, approval library, gate checklists
lib/engine.js      Rules, computed state, slippage detection, RAG, KPIs, inbox, alerts sweep
lib/app.js         HTTP application (hosted by server.js locally, api/index.js on Vercel)
lib/db.js          Storage selector → store-sqlite.js (durable) or store-memory.js (hosted demo)
lib/reports.js     Printable weekly dashboard & monthly CEO report
lib/seed.js        Demo dataset
public/            Zero-build single-page client (app.js, app.css)
data/              Database and uploads (created on first run; set ABS_DATA to relocate)
```

## Storage modes

`lib/db.js` selects a backend; every backend exposes the same interface, so the engine, API and UI never change.

| Mode | When | Persistence |
|---|---|---|
| `sqlite` (default) | Local, VPS, Docker | Durable on disk (`data/`, override with `ABS_DATA`) |
| `memory` | Vercel / hosted **demo** (chosen automatically when `VERCEL` is set, or `ABS_STORE=memory`) | In-memory working set, reseeded with the demo dataset on every cold start. Nothing is permanent; a gold banner says so. |

A persistent hosted database (Supabase / Neon Postgres) drops in as a third store behind the same interface: keep the working set in memory and persist mutations in `flush()` (called before every response) — see the notes at the top of `lib/store-memory.js`.

## Deploying

**Vercel (demo):** `npm run deploy` (uses `scripts/deploy.js`, which deploys from a git-free copy — Vercel Hobby blocks deployments whose git commit author email differs from the Vercel account's; alternatively set `git config user.email` to the Vercel account email and use `vercel deploy --prod`). Live demo: https://abs-control.vercel.app. `vercel.json` routes everything to `api/index.js`; static assets come from `public/`. Note Vercel caps request bodies at ~4.5 MB, so attachments are limited to ~3 MB (site photos are downscaled in the browser automatically).

**Production with durable data:** a VPS (`node server.js` behind nginx/Caddy with HTTPS) or a container platform with a volume (Railway, Render, Fly.io) using the included `Dockerfile` and mounting `/data`.

Environment: `PORT` (default 4800), `ABS_DATA` (data directory), `ABS_STORE` (`sqlite` | `memory`), `ABS_TZ` (default `Asia/Karachi`).
