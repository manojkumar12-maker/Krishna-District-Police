# Krishna District Police - Developer Reference

## Architecture
```
Frontend (GitHub Pages)  →  Backend (Cloudflare Worker)  →  D1 Database (SQLite)
Static HTML/CSS/JS           Hono.js + JOSE JWT           5GB free tier
```

## File Map

### Frontend (all served as static files)
| File | Role | Key Functions |
|------|------|--------------|
| `index.html` | Main HTML shell + all page divs | `#presidentialOrder`, `#dashboard`, modals |
| `config.js` | Global config, rank maps, police hierarchy | `API_BASE_URL`, `rankMap`, `psHierarchy`, `depUnits`, `rankGroups`, `displayRanksMap` |
| `api.js` | REST API calls to Worker | `apiRequest()`, `loginUser()`, `getAllPersonnel()`, CRUD |
| `auth.js` | Login/logout/session | `handleAuth()`, `checkAuth()`, `handleLogout()` |
| `app.js` | Entry point + UI utilities | `showToast()`, `showLoading()`, `hideLoading()`, DOMContentLoaded init |
| `dashboard.js` | Dashboard + erstwhile/new data display | `showPage()`, `loadAllData()`, `updateData()`, `showKNRanks()`, `showEWRanks()` |
| `personnel.js` | Personnel add/edit/delete forms | `openAddModal()`, `savePersonnel()`, `editPersonnel()`, `deletePersonnelRecord()` |
| `policeStation.js` | Police station hierarchy drill-down | `showPSPage()`, `selectPSSubDivision()`, `getPSPersonnelForLocation()`, **`escapeQuotes()`** |
| `deputation.js` | 19 deputation units management | `renderDepTiles()`, `showDepUnit()`, `updateDepConsolidated()` |
| `export.js` | CSV/PDF export utilities | `exportCSV()`, `exportAllPDF()`, **`downloadFile()`** |
| `auditlog.js` | Search/filter, Excel import, audit log viewer | `applySearchFilter()`, `handleExcelUpload()`, `loadAuditLogs()` |
| `presidentialOrder.js` | PO-2025 module (see below) | Seven-step workflow: ranks/cadres, working strength, seniority list, options, allocation, FAL, orders |
| `styles.css` | All CSS | `.page`, `.card`, `.sub-tile`, `.rank-tile`, `.po-*` classes |

### Backend (`workers/`)
| File | Role |
|------|------|
| `src/index.js` | Hono API server: auth, personnel CRUD, audit logs, sanctioned/deputation strength |
| `schema.sql` | D1 tables: `users`, `personnel`, `auditlogs`, `sanctionedstrengths`, `deputationstrengths` |
| `wrangler.toml` | Worker config + D1 binding |
| `package.json` | Dependencies: hono, jose, wrangler |

### Legacy (`Backend/`) - **NOT USED**
Express.js backend, replaced by Cloudflare Worker.

---

## Design System (`styles.css`)

`styles.css` is a token-driven design system. **Class names, element IDs and the
`--primary` / `--secondary` / `--accent` custom property names are part of the
app's contract** — they are referenced from inline styles across `index.html` and
every JS module. Renaming any of them silently breaks styling.

| Token group | Purpose |
|-------------|---------|
| `--brand-*` | Brand blue ramp (50–950) |
| `--primary` / `--secondary` / `--accent` | Legacy aliases. **Never rename** — 15 inline styles use `var(--primary)` |
| `--bg` / `--surface` / `--surface-2` / `--surface-3` | Neutral surface layers |
| `--border` / `--border-strong` | Hairlines and control borders |
| `--text` / `--text-muted` / `--text-subtle` | Text hierarchy |
| `--success` / `--danger` / `--warn` / `--info` (+ `-soft`) | Semantic status |
| `--r-xs` … `--r-full` | Radius scale (5 / 7 / 10 / 14 / 18 / 999) |
| `--sh-xs` … `--sh-xl`, `--sh-brand` | Cool-tinted elevation |
| `--ease`, `--t-fast` / `--t` / `--t-slow` | Motion |
| `--ring` | Focus ring |

### Tile tones

`.district-tile` reads `--t1` / `--t2` and builds its own gradient, so tile
colours live in CSS instead of inline styles. Add a tone class, never an inline
`background`:

```
.tone-brand .tone-sky .tone-teal .tone-green
.tone-amber .tone-violet .tone-red .tone-slate
```

### Visibility contract

These start hidden and are revealed by JS via **inline** `style.display`.
Do not "fix" them to be visible in CSS — the app would show before login.

```css
.page        { display: none }   .page.active        { display: block }
.header      { display: none }   /* auth.js sets flex */
.container   { display: none }   /* auth.js sets block */
.modal-overlay, .loading-spinner, .login-error { display: none }
.detail-section { display: none } .detail-section.visible { display: block }
```

### Verification

`.smoke/ui-verify.cjs` serves the repo, mocks the API and asserts no JS errors,
full class coverage, and that every drill-down still works:

```bash
node .smoke/ui-verify.cjs
```

It writes screenshots to `.smoke/shots/` and exits non-zero on regression.

---

## Script Load Order (CRITICAL)
```
config.js → api.js → auth.js → dashboard.js → personnel.js → deputation.js
→ policeStation.js → export.js → auditlog.js
→ poEngine.js → poRepository.js → poCore.js → presidentialOrder.js → app.js
```
Each file depends on the previous. `presidentialOrder.js` overrides `dashboard.js`'s `showPage()`.

The three Presidential Order files are strictly layered and must not be reordered:

| File | Layer | May depend on | Must never |
|------|-------|---------------|------------|
| `poEngine.js` | pure logic | nothing | touch `DOM`, `localStorage`, `window` state or `userRole` |
| `poRepository.js` | persistence boundary | nothing | contain allocation logic |
| `poCore.js` | state + official inputs | `poEngine.js` | render anything |
| `presidentialOrder.js` | rendering + handlers | all above | mutate official data directly (must go through `poCore.js`) |

`poEngine.js` and `poRepository.js` are the only files that may be `require()`d from
Node, which is what makes the allocation engine unit-testable outside a browser.

---

## Code Patterns

### Page Navigation
- All pages are `<div class="page">` in `index.html`
- CSS: `.page { display:none }`, `.page.active { display:block }`
- `showPage(pageId)` in `dashboard.js` toggles `.active` class
- `presidentialOrder.js` wraps `showPage` to add PO rendering

### API Calls
- All go through `apiRequest(endpoint, options)` in `api.js`
- JWT token stored in `localStorage.authToken`, sent as `Authorization: Bearer`
- Roles: `ADMIN` (full access) and `USER` (view-only)

### UI Patterns
- Toast: `showToast(message, 'success'|'error'|'loading')`
- Loading: `showLoading()` / `hideLoading()`
- Modals: Created with `document.createElement('div')`, appended to body
- Tables: `<table>` with `<thead>`/`<tbody>`, styled with `.dep-consol-table`
- Tiles: `.district-tile`, `.sub-tile`, `.rank-tile` with `.active` class

### Data Storage
- `allPersonnel` - array of all personnel from API
- `authToken`, `userRole`, `userEmail` - in localStorage + global vars
- `sanctionedData` - object keyed by `"DISTRICT_TYPE_RANK"`
- `depSanctionedData` - object keyed by unit name

---

## Presidential Order-2025 Module (G.O.Ms.No.129)

### How to read this section

Every rule below is labelled with its authority. **Do not mix these three.**

| Label | Meaning |
|-------|---------|
| `GO REQUIREMENT` | Prescribed by G.O.Ms.No.129. Change only if the order changes. |
| `SYSTEM IMPLEMENTATION RULE` | A deterministic software rule needed to make the order computable. Not stated in the order. |
| `DLC CONFIGURATION / POLICY DECISION` | A choice reserved to the Committee. Never presented as a legal requirement. |

**This module is not a legal compliance claim.** It is implemented with reference to
G.O.Ms.No.129; final procedural/legal validation is subject to the competent
authority/DLC. `POEngine.PO_GO_REFERENCE.disclaimer` is rendered in the module header.

### The module is deliberately minimal

Three things that used to exist **do not exist any more**. Do not reintroduce them
without an explicit instruction:

| Removed | Consequence |
|---------|-------------|
| The DSL stage and the DSL objection period | The Seniority List the DLC uploads **is** the authoritative personnel dataset. There is no draft list and no 5-day/7-day clock. |
| The audit trail (`poAudit`, `poState.audit`, the viewer modal) | There is no event log. **Versions, the procedural event register and `poState.history` are what remain** — see below. |
| The DLC dashboard (`poDashboard`, `poShowDashboard`) | Removed entirely. |

The cadre set is **fixed** to Krishna, NTR and Eluru (`POEngine.PO_DISTRICTS`). It
cannot be added to, renamed or retyped; `poLoad()` restores exactly that set even if
storage says otherwise, and there is no `poSaveCadre` / `poRemoveCadre`.

### Architecture

| File | Layer | Role |
|------|-------|------|
| `poEngine.js` | pure | Validators + allocation engine + SC/ST review. No DOM, no storage, no network, no knowledge of persistence. |
| `poRepository.js` | persistence boundary | `PORepository` contract (9 methods) + `LocalStoragePORepository` + `BackendPORepository`. |
| `poCore.js` | state | Working strength, the seniority list, options, versioning, the procedural event register, the 19-state machine. |
| `presidentialOrder.js` | UI | Seven stage-based screens, modals, print. Never writes `poState` directly. |

`poEngine.js` and `poRepository.js` are Node-`require`-able; that is what makes the
engine unit-testable and lets the same engine run server-side later.

### Current storage limitation

PO exercise data lives in `localStorage.po_state` in the browser that produced it.
The module header says **"LOCAL DEVELOPMENT MODE - NOT AN AUTHORITATIVE OFFICIAL
RECORD"**. It is not a shared DLC register, has no central backup and is lost with
browser data. `BackendPORepository` is declared but **not wired**: switching to it
requires the D1 schema and append-only endpoints first.

### Stage-based UI — seven steps

| # | Step | Key | Renderer |
|---|------|-----|----------|
| 1 | Ranks & Cadres — exercise, DLC composition, rank master, the fixed three districts, allocation policy | `ranks` | `renderStepRanks` |
| 2 | Working Strength — FWS entered for Krishna, NTR and Eluru, reconciled against the approved strength | `strength` | `renderStepStrength` |
| 3 | Seniority List — uploaded per cadre, validated, locked, published, analysed | `seniority` | `renderStepSeniority` |
| 4 | Option Filling | `options` | `renderStepOptions` |
| 5 | Allocation | `allocation` | `renderStepAllocation` |
| 6 | FAL | `fal` | `renderStepFal` |
| 7 | OOA / OOT | `orders` | `renderStepOrders` |

There is deliberately **no separate DLC Configuration screen**: `renderExerciseCards()`
renders inside step 1, because the same values (cadre scope, competent authority,
exercise identity) are needed by the rank master and appear on every downstream
document. The underlying fields still gate the `DRAFT` stage.

### State machine (19 states, no skipping)

```
DRAFT → CADRE_CONFIGURED → WORKING_STRENGTH_FINALIZED
→ FSL_UPLOADED → FSL_FINALIZED → FSL_PUBLISHED
→ OPTIONS_OPEN → OPTIONS_CLOSED
→ ALLOCATION_RUNNING → ALLOCATION_VALIDATED
→ FAL_GENERATED → FAL_APPROVED → FAL_PUBLISHED
→ OOA_GENERATED → OOA_ISSUED → OOT_GENERATED → OOT_ISSUED
→ JOINING_COMPLETED → EXERCISE_CLOSED
```

- `poAdvance(reason)` is the only mover; there is deliberately no stage setter.
- **Guard semantics: leaving a stage asserts that stage's own work is done.** This is
  the single most important rule when editing the guards, and it fixes the ORDER of
  actions in the UI:
  - lock the Seniority List **while at** `FSL_UPLOADED`, then advance;
  - publish it **while at** `FSL_FINALIZED`, then advance;
  - close and lock the options **while at** `OPTIONS_OPEN`, then advance;
  - generate → approve → publish the FAL in that order, advancing between each;
  - generate → approve → issue each OOA and OOT in that order.
- `CADRE_CONFIGURED` requires strength data *entered*; reconciliation is enforced when
  leaving `WORKING_STRENGTH_FINALIZED`, so the screen needed to fix a mismatch is
  always reachable.
- `FSL_UPLOADED` requires a non-empty, valid list. `FSL_FINALIZED` requires it locked.
- `FAL_APPROVED` requires the FAL **published** (not merely approved).
- `JOINING_COMPLETED` refuses closure while a mandatory joining record is unresolved
  unless `poOverrideJoiningClosure(reason, authority)` has been used.

### The Seniority List (per cadre)

The DLC uploads **one file per cadre**. `poImportSeniorityRows(rows, true)` replaces
only the rows of the cadre the file names and leaves the other two untouched; a file
naming none of Krishna / NTR / Eluru is **refused**, never silently appended.

`poFinalizeSeniorityList()` locks the list, and refuses if it does not validate. After
that the list can only change through `poReviseFsl(reason)`, which voids the options
and creates a new version while retaining the superseded list in `poState.history.fsl`.

CSV/Excel header matching is punctuation-insensitive, so `Date of Joining in Category`,
`date_of_joining_in_category` and `dateofjoiningincategory` all map to one field.

### Allocation tiers (`GO REQUIREMENT`)

Every employee is allotted within exactly one tier, and tiers run in this order. A
lower tier never takes a post a higher tier could have filled. Tiers are processed
**strictly per category**, so sequence numbers interleave across ranks.

| Tier | Rule |
|------|------|
| T1 | Physically handicapped — PwBD certified ≥70% and employees with a dependent disabled child |
| T2 | Widow who remained unmarried |
| T3 | Health problems — cancer, major neurosurgery, kidney, liver, open-heart |
| T4 | **SC/ST reserved share** — each cadre's own reserved posts are allotted first, by FSL seniority |
| T5 | General category by FSL seniority |

Then, within each category:

| Step | Rule | Authority |
|------|------|-----------|
| compulsory | to an available clear post, **only where a shortfall exists** | `GO REQUIREMENT` (permission) + `DLC POLICY DECISION` (which post) |
| no-option | employees with no option, processed last, onto shortfall posts only | `GO REQUIREMENT` |
| verify | SC/ST proportions confirmed; absolute over-allocation check fails the run | `SYSTEM IMPLEMENTATION RULE` |

**T4 detail.** `runAllocation` builds a reserved ledger where each cadre's quota is its
own FWS times the prescribed percentage. A reserved employee considers cadres whose
quota is still unconsumed *before* the rest of their preference order; the reported
`preference_rank` stays the employee's own preference number, not the reordered
position. The quota is a **preference, never a hard cap** — once every quota is spent,
normal preference order resumes and `reserved_used_after` may exceed `reserved_quota`.
Allocation reason: `SC_ST_RESERVED_ALLOTMENT`.

Determinism: every sort is total (`seniority_no`, then `employee_id`), so identical
inputs and policy always produce byte-identical output.

### Compulsory allocation policy (`DLC CONFIGURATION / POLICY DECISION`)

The order permits compulsory allotment to any available clear post within working
strength. It does **not** prescribe which post, so `PO_COMPULSORY_POLICIES` is a DLC
choice:

```
LARGEST_REMAINING_VACANCY   (default) largest remaining vacancy, cadre order breaks ties
CONFIGURED_CADRE_ORDER      first cadre in configured order that has a vacancy
EXISTING_CADRE_FIRST        present local cadre first, then largest remaining vacancy
```

Separately, **prefer existing local cadre** (`YES`/`NO`, default `NO`) is also a DLC
decision. Both live in `poState.policy`, are editable only before `ALLOCATION_RUNNING`,
and are frozen by `poFreezePolicy()`. After that `poSetPolicy()` returns `false`.

### Preferential categories (`GO REQUIREMENT`)

`1 pwbd (>=70%)  2 disabled_children  3 widow  4 cancer  5 neurosurgery
6 kidney  7 liver  8 heart`

Only `verification === 'VERIFIED'` enters T1–T3 (`poClaimVerified()`). A claim must
carry category, claimed flag, document attached, verification status, verified by,
verified date and a document reference. Ties inside a priority band use FSL seniority.
A manually ticked flag is never sufficient on its own.

### SC/ST calculation

| Aspect | Rule | Authority |
|--------|------|-----------|
| Percentages | 1% / 6.5% / 7.5% / 6% | `GO REQUIREMENT` |
| Basis | `PO_SEG_BASIS = FINAL_WORKING_STRENGTH` | `GO REQUIREMENT` |
| Rounding | `PO_ROUNDING_POLICIES` (default `ROUND_HALF_UP`) | `SYSTEM IMPLEMENTATION RULE` |
| Substitution | last allotted general-category employee out, relevant SC/ST employee in | `GO REQUIREMENT` |

There is **no** user-facing `ALLOCATED` vs `FWS` choice: the basis is fixed. The
requirement is evaluated **per local cadre** on that cadre's own working strength,
because the order distributes the proportion *among local cadres*.

Because the reserved share is already allotted first in T4, the post-allocation review
normally confirms the proportions rather than having to substitute. Where a cadre is
still short the engine substitutes, which is vacancy-neutral. If no valid substitution
exists the shortfall is **never forced**: it becomes `SC_ST_SHORTFALL_EXCEPTION` with a
stable `exception_key`, `critical: true` when the category total itself cannot meet the
proportion. A critical shortfall **blocks** FAL publication until
`poAcceptScstException(reason, authority)` records the DLC's acknowledgement; the
computed figures are never altered.

### Option workflow (`GO REQUIREMENT`)

Default window **5 days** from publication of the Seniority List
(`PO_DEFAULT_OPTION_DAYS`). Only cadres configured for the employee's rank/category may
be selected; duplicates and out-of-set cadres are rejected. An option is **immutable**
once submitted. A correction goes through `poCorrectOption(empId, p1, p2, p3, reason,
authority)`, which requires a reason and an authority, creates a **new version**,
retains the superseded version in `poState.optionHistory`, and is refused once
allocation has begun.

Every refusal returns `{ ok: false, errors: [message] }` — not just a toast — so callers
can surface the reason.

### FAL

`poGenerateFal()` only from a validated confirmed run. `validateFAL()` blocking checks:
`EMPLOYEE_NOT_ALLOTTED`, `EMPLOYEE_ALLOTTED_TWICE`, `FWS_EXCEEDED`,
`CATEGORY_MISMATCH`, `NOT_IN_FSL`, `REASON_MISSING`, `INVALID_CADRE_ALLOTMENT`,
`INVALID_OPTION`, `INVALID_PREFERENTIAL_CLAIM`, `INVALID_COMPULSORY`,
`INVALID_NO_OPTION`, `ALLOCATION_OUTSIDE_EXERCISE`, `SC_ST_SHORTFALL_EXCEPTION`.

It also warns (`TIER_ORDER`) when an allotment is sequenced against its tier, and
records a `passed` line confirming the tier order per category.

No edit function exists. After `FAL_APPROVED` normal editing is prevented; after
`FAL_PUBLISHED` the FAL is immutable and `poReviseFal(reason)` is the only route, which
retains the previous FAL rows and run in `poState.history`.

### OOA / OOT / joining

- **OOA** `DRAFT → APPROVED → ISSUED`, generated only from valid FAL rows. An issued
  OOA is never deleted; `poReviseOoa()` supersedes it as `REVISED` with a reason.
- **OOT** only where `allotted cadre != present local cadre`. Others carry
  `transfer_required: false` / `NOT REQUIRED`. Joining deadline = issue + 7 days.
- **Joining** statuses `PENDING | JOINED | OVERDUE | EXCEPTION`. `OVERDUE` is derived by
  `poRefreshJoiningStatus()`. Only `JOINED` and `EXCEPTION` resolve a record.

### Versioning, events and retained history (no audit trail)

Because there is no audit trail, these three are the record:

| Store | Purpose |
|-------|---------|
| `poState.versions` (`fws, fsl, options, fal, ooa, oot, claims, policy`) | Which version of each input a run was computed against. |
| `poState.events` (`poState.events`, whitelisted by `PO_EVENT_KEYS`) | The procedural process: `seniority_uploaded_at`, `fsl_created_at`, `fsl_finalized_at`, `fsl_published_at`, `options_opened_at`, `options_closed_at`, `allocation_started_at`, `allocation_completed_at`, `fal_*`, `ooa_*`, `oot_*`, `joining_deadline`. |
| `poState.history` (`fsl, allocationRun, fal, ooa, oot, options`) | Every superseded official record. Appends only, never delete-and-recreate. |

`poRunSnapshot(run)` additionally captures engine version and hash, both policy
decisions, the SC/ST configuration, input counts and an `input_fingerprint` (FNV-1a over
the FSL, options and FWS).

### Simulation vs confirmation

`poSimulateAllocation()` writes only `poState.simulation`; the run, FAL, OOA and OOT
are untouched. `poConfirmAllocation()` requires the list locked and published, options
locked and working strength reconciled; freezes the policy and stamps the snapshot. A
failed over-allocation check discards the run whole — no correction is applied.

### Error reporting

`POEngine.PO_ERROR_CATALOGUE` gives every critical code a description and a
recommended action. `poIssueDetail(issue)` normalises any engine issue to
`{code, description, employee, rank, cadre, source_data, recommended_action}`, which is
what the Step 5 exception table renders. Official data is never silently corrected.

### Verification

```bash
node --test tests/po-engine.test.cjs        # 59 engine tests
node --test tests/po-conformance.test.cjs   # 44 GO conformance tests (TEST 1..34)
node --test tests/po-workflow.test.cjs      # 21 workflow + shape tests
node .smoke/po-flow.cjs                     # all 19 states in a real browser
node .smoke/ui-verify.cjs                   # full-app regression + screenshots
```

`tests/po-workflow.test.cjs` evaluates the real `poCore.js` behind a minimal
localStorage shim, so it drives production code rather than a re-implementation. It
also asserts the **absences**: that the objection subsystem, the audit mechanism and
the DSL do not exist.

### Backend migration plan

1. Add D1 tables for exercise, seniority_list, fsl, options, allocation_run, fal, ooa,
   oot, audit_event, each **append-only** with a version column.
2. Add Worker endpoints matching `PORepositoryContract.methods`, all idempotent via
   a fingerprint header, and refusing to overwrite an existing version.
3. Instantiate `BackendPORepository(API_BASE_URL, { token })` in `poCore.js` instead
   of `LocalStoragePORepository`.
4. Nothing in `poEngine.js` changes: it has no knowledge of persistence.
5. Flip `authoritative` to `true` only once the server enforces immutability, and
   only then remove the development-mode banner.

### Assumptions requiring DLC confirmation

1. The SC/ST substitution partner is the **last allotted general-category employee**
   by allocation sequence, and the donor cadre must be over its own prescribed share.
2. The rounding convention. `ROUND_HALF_UP` is a `SYSTEM IMPLEMENTATION RULE`.
3. Which post a compulsory allotment takes (`PO_COMPULSORY_POLICIES`).
4. Whether the prefer-existing-cadre switch is used at all.
5. Whether a cadre-level SC/ST imbalance is reportable when the category total is
   satisfied (currently AMBER) or critical (currently BLOCKING).
6. The reserved-group percentages are taken as given from the order.
7. That the reserved share is a preference and not a hard cap (see T4 above).

## Deployment

### Backend (Cloudflare Worker)

**Deploy order matters.** `migrateSchema()` in `src/index.js` only issues
`ALTER TABLE ... ADD COLUMN` for tables that already exist. It does **not**
create new tables or indexes. A Worker deploy alone will therefore leave
`stationsanctionedstrengths` and the `idx_personnel_*` indexes missing, and
any endpoint that queries them will fail at runtime.

```bash
cd workers

# 1. BACKUP production D1 first (read-only export; contains credential hashes)
mkdir -p ../.backups
npx wrangler d1 export krishna-police-db --remote \
  --output "../.backups/prod-$(date +%Y%m%d-%H%M%S).sql"

# 2. Deploy Worker (adds missing columns on first request)
npx wrangler deploy

# 3. Apply schema.sql — REQUIRED for new tables and indexes.
#    All statements are IF NOT EXISTS, so this is idempotent and will not
#    alter existing rows.
npx wrangler d1 execute krishna-police-db --remote --file=./schema.sql

# 4. Verify
npx wrangler d1 execute krishna-police-db --remote \
  --command "SELECT name FROM sqlite_master WHERE type='table';"
npx wrangler d1 execute krishna-police-db --remote \
  --command "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='personnel';"
```

Deploy the Worker **before** the frontend. The frontend calls
`/api/station-sanctioned`, which 404s until the Worker is deployed.

### Frontend (GitHub Pages)
```bash
git push origin main
# GitHub Pages auto-deploys from main branch, / (root)
```

### API URL
```javascript
// config.js
const API_BASE_URL = 'https://krishna-police-api.manoj-spoffice-kri.workers.dev/api';
```

### Secrets (Cloudflare Dashboard)
- `JWT_SECRET` - Random string for JWT signing
- `ADMIN_EMAIL` - Default admin login
- `ADMIN_PASSWORD` - Default admin password

### Outstanding security risk: login rate limiting

**There is currently NO rate limiting on `/api/auth/login`.**

The account has no Cloudflare zone and the Worker is served from
`*.workers.dev`, which is not zone-proxied. A zone-level WAF rate-limiting
rule therefore **cannot** be applied to this endpoint.

Do not assume the login route is protected against brute force.

Options if this must be closed (none implemented):

1. Attach a custom domain on a proxied zone, then add a WAF rate-limiting
   rule (5 requests / IP / 15 min on `/api/auth/login`).
2. Add a Durable Object counter keyed by IP.
3. Put Cloudflare Turnstile in front of the login form.

---

## Common Gotchas

1. **PO file order is strict** - `poEngine.js` → `poCore.js` → `presidentialOrder.js`,
   all before `app.js`. `presidentialOrder.js` overrides `dashboard.js`'s `showPage()`.
2. **`poEngine.js` must stay pure** - no DOM, no `localStorage`, no `userRole`. That is
   what lets `tests/po-engine.test.cjs` run it under Node.
3. **Never mutate `poState` fields from the UI** - go through a `poCore.js` function so
   the change is permission-checked and versioned.
4. **PO data is in localStorage** - Clearing browser data resets the PO module
5. **PO version mismatch discards all data** - Bump `PO_DATA_VERSION` when changing schema
6. **`escapeQuotes()`** is defined in `policeStation.js`, used by `presidentialOrder.js`
7. **`downloadFile()`** is defined in `export.js`, used by `presidentialOrder.js`
8. **All onclick handlers in template strings need proper escaping** - use `escapeQuotes()`
   for any value interpolated into an inline handler; use `escapeHtml()` for table cells
9. **CSV import maps punctuation-insensitive headers** - `poCsvToRows()` strips
   non-alphanumerics and lowercases, so `Date of Joining in Category`,
   `date_of_joining_in_category` and `dateofjoiningincategory` all match
10. **`poTable(headers, rows)` takes an array of HTML row strings** - not an array of
     objects, and not a pre-joined string
11. **Cache-Control is 10 minutes** on GitHub Pages - wait or hard-refresh after push
12. **`allPersonnel` is loaded once** by `loadAllData()`, then cached in memory
13. **The PO module does NOT read `allPersonnel`.** Personnel data enters only through the
     uploaded Seniority List, so the district database can never silently become
     official seniority data
14. **`poStepState()` derives the open step from `poStage()`.** To make a step reachable
     for testing, set `poState.stage` — never add a direct stage setter
15. **SC/ST basis is not configurable.** `PO_SEG_BASIS` is fixed to
     `FINAL_WORKING_STRENGTH` because the order refers to working strength. Do not
     reintroduce an `ALLOCATED` vs `FWS` toggle.
16. **Joining statuses are `PENDING | JOINED | OVERDUE | EXCEPTION`.** The old
     `REPORTED` value is gone; `poRefreshJoiningStatus()` derives `OVERDUE`.
17. **A critical SC/ST shortfall blocks the FAL** until
     `poAcceptScstException(reason, authority)`. Never resolve it by inventing a
     reserved-category employee.
18. **Leaving a stage asserts that stage's work is done.** Do the work *before* you
     advance: lock the seniority list at `FSL_UPLOADED`, close the options at
     `OPTIONS_OPEN`, publish the FAL at `FAL_APPROVED`. `FAL_APPROVED` requires
     status `PUBLISHED`, not `APPROVED`.
19. **`poNormalizeSegGroup()` strips dots, dashes, spaces and underscores** so
     `SC_3`, `SC-3`, `SC 3` and `SC3` all parse. Keep the underscore in that class.
20. **Persistence goes through `poRepository`.** `poSave()` writes via the repository,
     falling back to `localStorage.setItem` only if it is absent.
21. **The cadre set is fixed** to Krishna / NTR / Eluru. There is no `poSaveCadre`,
     `poRemoveCadre` or cadre master, and `poLoad()` restores the fixed set regardless
     of what storage contains.
22. **There is no DSL, no objection subsystem and no audit trail.** Do not
     reintroduce `poAudit`, `poDashboard`, `poRaiseObjection` or `poBuildFslFromDsl`.
     The upload **is** the Seniority List; versions, `poState.events` and
     `poState.history` are the record.

