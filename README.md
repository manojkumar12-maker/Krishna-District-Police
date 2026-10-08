# Krishna District Police - PC/WPC Data Management System

## Architecture

```
┌─────────────────┐     ┌─────────────────────┐     ┌──────────────────┐
│   Frontend      │────▶│   Backend (Worker)   │────▶│   Cloudflare D1  │
│  GitHub Pages   │ API │  Cloudflare Workers  │ SQL │   (Free SQLite)  │
│  Static HTML/JS │◀────│  Hono + D1           │◀────│   5GB Storage    │
└─────────────────┘     └─────────────────────┘     └──────────────────┘
```

## Project Structure

```
├── index.html           # Main entry point (frontend)
├── styles.css           # All styles
├── config.js            # Configuration & API URL
├── api.js               # API helper functions
├── auth.js              # Authentication module
├── dashboard.js         # Dashboard & data display
├── personnel.js         # Personnel CRUD operations
├── deputation.js        # Deputation management
├── policeStation.js     # Police station hierarchy
├── export.js            # CSV/PDF export
├── auditlog.js          # Audit log viewer
├── app.js               # Main app initialization
├── poEngine.js          # PO-2025 pure logic: validators + allocation engine
├── poRepository.js      # PO-2025 persistence boundary (localStorage / backend)
├── poCore.js            # PO-2025 state, events, policy, audit, state machine
├── presidentialOrder.js # PO-2025 stage-based UI
├── tests/               # Engine, GO-conformance and workflow tests
├── workers/             # Cloudflare Worker (backend API)
│   ├── src/index.js     # Hono-based API server
│   ├── schema.sql       # D1 database schema
│   ├── wrangler.toml    # Worker configuration
│   └── package.json
└── Backend/             # Legacy Express backend (not used)
```

---

## Presidential Order-2025 (G.O.Ms.No.129)

A controlled, auditable workflow for the District Level Implementation Committee.
Scope is fixed to **"District and Contiguous District Cadre"**; zonal and multi-zonal
allocation are out of scope and are never mixed in.

```
Ranks & Cadres → Working Strength → DSL → (Objections) → FSL
→ Option Filling → Allocation → FAL → OOA / OOT → Joining
```

**Implemented with reference to G.O.Ms.No.129, G.A.(SPF & MC) Department, dated
17-07-2026. Final procedural/legal validation is subject to the competent
authority/DLC.** The module is not a legal-compliance claim.

There is no separate DLC Configuration screen: the exercise reference data and the DLC
composition live inside step 1, alongside the rank and cadre masters.

### How the rules are labelled

| Label | Meaning |
|-------|---------|
| `GO REQUIREMENT` | Prescribed by the order. |
| `SYSTEM IMPLEMENTATION RULE` | A deterministic software rule the order does not state (e.g. SC/ST rounding). |
| `DLC CONFIGURATION / POLICY DECISION` | Reserved to the Committee (e.g. which post a compulsory allotment takes). |

The UI tags each rule with one of these three. They are never mixed.

### Key behaviour

- **21 non-skippable workflow states.** `poAdvance()` is the only mover and there is no
  stage setter. A separate *procedural event register* records the statutory process
  (DSL publication, objection opening/closing/disposal, FSL publication, option
  opening/closing, allocation start/completion, FAL/OOA/OOT issue, joining deadline).
- **Objection subsystem.** Objections may be recorded for **5 days** after DSL
  publication; the FSL becomes eligible on the **7th day**. Both dates are calculated
  from the actual publication timestamp — nothing is hard-coded. Each objection is a
  full record with a status, disposal reason, disposing authority and revised value.
  The FAL cannot be finalized until every objection is disposed.
- **Personnel data enters only through the DSL/FSL.** Seniority numbers are copied from
  the official list and are never generated from row order. Employees on deputation,
  leave, probation, training, suspension or absence are retained.
- **The allocation engine is deterministic and reproducible.** Every allotment carries
  a reason, the preferences considered, vacancy before/after, the allocation sequence,
  the engine version+hash and an input fingerprint. Running the same inputs with the
  same policy produces byte-identical output.
- **`Allotted <= FWS` per rank + cadre is absolute.** There is no over-allocation
  fallback; a breached run fails whole and is reported for DLC review.
- **Preferential categories** need certification *and* verification. A ticked flag alone
  is never preferential.
- **SC/ST distribution is reviewed after normal allocation, on a working-strength
  basis.** A shortfall is corrected by substituting the **last allotted general-category
  employee** (by allocation sequence) with the relevant SC/ST employee. The adjustment is
  vacancy-neutral. If no valid substitution exists it is carried as
  `SC_ST_SHORTFALL_EXCEPTION` and **never forced**; a critical one blocks FAL
  publication until the DLC acknowledges it with a reason and authority.
- **Options** accept only the cadres configured for that rank/category. A submitted
  option is immutable; a correction creates a new version with a reason and authority
  and retains the superseded one.
- **Allocation policy is a DLC decision, not a GO requirement** (compulsory-allotment
  tie-breaker, prefer-existing-cadre, SC/ST rounding). It is frozen before
  `ALLOCATION_RUNNING` and recorded in the run snapshot.
- **Official records are retained, never destroyed.** Revisions append to
  `poState.history`; nothing is deleted and recreated.

### Storage limitation

PO data lives in `localStorage.po_state` in the browser that produced it. The module
header states **"LOCAL DEVELOPMENT MODE — NOT AN AUTHORITATIVE OFFICIAL RECORD"**. It
is not a shared DLC register. A `PORepository` abstraction with a
`LocalStoragePORepository` (current) and `BackendPORepository` (declared, not wired)
is in place so the same pure engine can move server-side without engine changes. See
the migration plan in `AGENTS.md`.

See `AGENTS.md` for the full data model, validation codes, state machine and algorithm.

### Verification

```bash
node --test tests/po-engine.test.cjs        # 53 engine tests
node --test tests/po-conformance.test.cjs   # 44 GO conformance tests
node --test tests/po-workflow.test.cjs      # 15 workflow tests
node .smoke/po-flow.cjs                     # drives all 21 states in a browser
node .smoke/ui-verify.cjs                   # full-app regression + screenshots
```

---

## Part 1: Backend Setup (Cloudflare Worker + D1)

### 1.1 Prerequisites
- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free)
- Node.js 18+ installed

### 1.2 Install Wrangler & Login
```bash
npm install -g wrangler
wrangler login
```

### 1.3 Deploy D1 Database & Worker
```bash
cd workers
npm install

# Create the D1 database (free, 5GB)
wrangler d1 create krishna-police-db

# Copy the database_id from output → update wrangler.toml

# Run schema (creates all tables)
wrangler d1 execute krishna-police-db --remote --file=./schema.sql

# Set secrets
echo "your-jwt-secret-here" | wrangler secret put JWT_SECRET
echo "admin@example.com" | wrangler secret put ADMIN_EMAIL
echo "your-password" | wrangler secret put ADMIN_PASSWORD

# Deploy the Worker
wrangler deploy
```

### 1.4 Your API URL
```
https://krishna-police-api.YOUR-SUBDOMAIN.workers.dev
```
Update `config.js` with this URL.

---

## Part 2: Frontend (GitHub Pages)

### 2.1 Push to GitHub
```bash
git add .
git commit -m "Cloudflare Worker + D1 backend"
git push
```

### 2.2 Enable GitHub Pages
1. Repo → **Settings** → **Pages**
2. Source: **Deploy from a branch**, select **main**, **/ (root)**
3. Click **Save**

Your site: `https://YOUR-USERNAME.github.io/YOUR-REPO/`

---

## Part 3: Login & Usage

Use the admin credentials you set in Part 1 (ADMIN_EMAIL / ADMIN_PASSWORD).

---

## Local Development

```bash
# Start Worker locally
cd workers
cp .env.example .dev.vars   # Fill in JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npx wrangler d1 execute krishna-police-db --local --file=./schema.sql
npx wrangler dev             # Runs at http://localhost:8787

# Frontend: open index.html in browser
# Set in config.js: const API_BASE_URL = 'http://localhost:8787/api';
```

---

## Features
- **Login/Register** - JWT-based authentication (PBKDF2 via Web Crypto)
- **Dashboard** - District-wise personnel counts
- **Erstwhile Krishna District** - CIVIL & AR personnel with rank-wise strength
- **Krishna District (New)** - Rank-wise strength with sanctioned vs actual
- **Deputation** - 19 deputation units with consolidated reports
- **Police Stations** - Sub-division → Circle → Station hierarchy
- **Search & Filter** - Global search with multiple filters
- **Export** - CSV and PDF export
- **Excel Import** - Bulk import via Excel/CSV
- **Audit Logs** - Full audit trail
- **Role-Based Access** - Admin (full) and User (view-only)
- **Responsive Design** - Mobile + desktop

## Secrets Reference

| Secret | Description |
|---|---|
| `JWT_SECRET` | Random string for JWT signing |
| `ADMIN_EMAIL` | Default admin login email |
| `ADMIN_PASSWORD` | Default admin password |
