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
| `presidentialOrder.js` | PO-2025 module (see below) | Full 5-stage allocation workflow |
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
→ poEngine.js → poCore.js → presidentialOrder.js → app.js
```
Each file depends on the previous. `presidentialOrder.js` overrides `dashboard.js`'s `showPage()`.

The three Presidential Order files are strictly layered and must not be reordered:

| File | Layer | May depend on | Must never |
|------|-------|---------------|------------|
| `poEngine.js` | pure logic | nothing | touch `DOM`, `localStorage`, `window` state or `userRole` |
| `poCore.js` | state + official inputs | `poEngine.js` | render anything |
| `presidentialOrder.js` | rendering + handlers | both above | mutate official data directly (must go through `poCore.js`) |

`poEngine.js` is the only file that may be `require()`d from Node, which is what
makes the allocation engine unit-testable outside a browser.

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

### Architecture

| File | Layer | Role |
|------|-------|------|
| `poEngine.js` | pure | Validators + allocation engine + SC/ST review. No DOM, no storage, no network, no knowledge of persistence. |
| `poRepository.js` | persistence boundary | `PORepository` contract + `LocalStoragePORepository` + `BackendPORepository`. |
| `poCore.js` | state | Official inputs, persistence, versioning, audit trail, procedural events, policy, 21-state machine. |
| `presidentialOrder.js` | UI | Nine stage-based screens, modals, print. Never writes `poState` directly. |

`poEngine.js` and `poRepository.js` are Node-`require`-able; that is what makes the
engine unit-testable and lets the same engine run server-side later.

### Current storage limitation (PART 24)

PO exercise data lives in `localStorage.po_state` in the browser that produced it.
The module header says **"LOCAL DEVELOPMENT MODE - NOT AN AUTHORITATIVE OFFICIAL
RECORD"**. It is not a shared DLC register, has no central backup and is lost with
browser data. `BackendPORepository` is declared but **not wired**: switching to it
requires the D1 schema and append-only audit endpoints first.

### Workflow

The state machine is the workflow; the **procedural event register** (`poState.events`)
is the statutory process behind it. `PO_EVENT_KEYS` is a whitelist, so only these
can be recorded, and every write is audited:

```
dsl_published_at      objection_opened_at     objection_closed_at    objections_disposed_at
fsl_created_at        fsl_finalized_at        fsl_published_at
options_opened_at     options_closed_at
allocation_started_at allocation_completed_at
fal_generated_at      fal_approved_at         fal_published_at
ooa_generated_at      ooa_issued_at
oot_generated_at      oot_issued_at           joining_deadline
```

### State machine (21 states, no skipping)

```
DRAFT → CADRE_CONFIGURED → WORKING_STRENGTH_FINALIZED
→ DSL_UPLOADED → DSL_VALIDATED → DSL_PUBLISHED
→ FSL_FINALIZED → FSL_PUBLISHED
→ OPTIONS_OPEN → OPTIONS_CLOSED
→ ALLOCATION_RUNNING → ALLOCATION_VALIDATED
→ FAL_GENERATED → FAL_APPROVED → FAL_PUBLISHED
→ OOA_GENERATED → OOA_ISSUED → OOT_GENERATED → OOT_ISSUED
→ JOINING_COMPLETED → EXERCISE_CLOSED
```

- `poAdvance(reason)` is the only mover; there is deliberately no stage setter.
- Guard semantics: leaving a stage asserts that stage's own work is done.
- `CADRE_CONFIGURED` requires strength data *entered*; reconciliation is enforced
  when leaving `WORKING_STRENGTH_FINALIZED`, so the screen needed to fix a
  mismatch is always reachable.
- `DSLFINALIZED` (i.e. `FSL_FINALIZED`) additionally requires: the objection period
  complete, every objection disposed, and the calculated FSL eligibility date reached.
- `JOINING_COMPLETED` refuses closure while a mandatory joining record is unresolved
  unless `poOverrideJoiningClosure(reason, authority)` has been used (audited).

### DSL objection workflow (`GO REQUIREMENT`)

| Value | Meaning |
|-------|---------|
| `PO_OBJECTION_DAYS = 5` | period for objections after DSL publication |
| `PO_FSL_ELIGIBILITY_DAYS = 7` | FSL is published on the 7th day from DSL publication |

Both are **calculated from the actual `dsl_published_at` timestamp**; no date is
hard-coded and neither can be bypassed. Each objection is a full record:
`objection_id, employee_id, exercise_id, submitted_at, objection_type,
objection_text, supporting_documents, status, disposed_at, disposal_reason,
disposed_by, previous_value, revised_value`. Statuses are
`PENDING | UNDER_REVIEW | ACCEPTED | PARTIALLY_ACCEPTED | REJECTED | DISPOSED`.

| Function | Purpose |
|----------|---------|
| `poRaiseObjection(empId, type, text, docs)` | only while the window is open |
| `poDisposeObjection(id, status, reason, revised)` | reason mandatory; retains the previous value |
| `poCloseObjectionWindow(reason)` | only when nothing is pending |
| `poObjectionProcessingComplete()` | gates FSL finalization |

### FSL timeline

`poTimeline()` returns DSL publication, objection closing date, FSL eligibility date,
and `fsl_created_at / fsl_finalized_at / fsl_published_at`. `poPublishFsl()` refuses
publication before the eligibility date.

### Allocation phases

Runs strictly **per category**, in configured order, so ranks are never mixed.

| Phase | Rule | Authority |
|-------|------|-----------|
| 1 | Verified preferential claims, priority order then FSL seniority | `GO REQUIREMENT` |
| 2-4 | Remaining employees by FSL seniority; preference 1 → 2 → 3, restricted to that category's cadres | `GO REQUIREMENT` |
| 5 | Compulsory allotment, **only where a shortfall exists** | `GO REQUIREMENT` (permission) + `DLC POLICY DECISION` (which post) |
| 6 | No-option employees, last, only onto shortfall posts | `GO REQUIREMENT` |
| 7 | SC/ST proportionate review and substitution | `GO REQUIREMENT` + `SYSTEM IMPLEMENTATION RULE` |
| 8 | Final result + absolute over-allocation check | `SYSTEM IMPLEMENTATION RULE` |

Determinism: every sort is total (`seniority_no`, then `employee_id`), so identical
inputs and policy always produce byte-identical output (TEST 23, PART 18).

### Compulsory allocation policy (`DLC CONFIGURATION / POLICY DECISION`)

The order permits allotment to any available clear post within working strength. It
does **not** prescribe which post, so `PO_COMPULSORY_POLICIES` is a DLC choice:

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

Only `verification === 'VERIFIED'` enters Phase 1 (`poClaimVerified()`). A claim must
carry category, claimed flag, document attached, verification status, verified by,
verified date and a document reference. Ties inside a priority band use FSL seniority.

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

For each deficit the engine:

1. identifies an eligible SC/ST employee of the same category sitting in a cadre that is **over** its own prescribed share (never a preferential employee);
2. identifies the **LAST ALLOTTED GENERAL CATEGORY** employee in the affected cadre, resolved by the highest `allocation_sequence` — *not* by seniority;
3. substitutes, which is vacancy-neutral: the cadre's headcount, the category and FWS are unchanged;
4. records `inserted_employee, replaced_employee, cadre, category, old_allocation, new_allocation, sc_group, allocation_sequence, reason`;
5. repeats until the requirement is met or no valid substitution exists.

If none exists the shortfall is **never forced**. It becomes
`SC_ST_SHORTFALL_EXCEPTION` with a stable `exception_key` (`category|group|cadre`),
`critical: true` when the category total itself cannot meet the proportion. A critical
shortfall **blocks** FAL publication until `poAcceptScstException(reason, authority)`
records the DLC's acknowledgement; the computed figures are never altered.

### Option workflow (`GO REQUIREMENT`)

Default window **5 days** from FSL publication (`PO_DEFAULT_OPTION_DAYS`). Only
cadres configured for the employee's rank/category may be selected; duplicates and
out-of-set cadres are rejected. An option is **immutable** once submitted. A correction
goes through `poCorrectOption(empId, p1, p2, p3, reason, authority)`, which requires
a reason and an authority, creates a **new version**, retains the superseded version in
`poState.optionHistory`, and is refused once allocation has begun.

### FAL

`poGenerateFal()` only from a validated confirmed run. `validateFAL()` blocking checks:
`EMPLOYEE_NOT_ALLOTTED`, `EMPLOYEE_ALLOTTED_TWICE`, `FWS_EXCEEDED`,
`CATEGORY_MISMATCH`, `NOT_IN_FSL`, `REASON_MISSING`, `INVALID_CADRE_ALLOTMENT`,
`INVALID_OPTION`, `INVALID_PREFERENTIAL_CLAIM`, `INVALID_COMPULSORY`,
`INVALID_NO_OPTION`, `ALLOCATION_OUTSIDE_EXERCISE`, `SC_ST_SHORTFALL_EXCEPTION`.

No edit function exists. After `FAL_APPROVED` normal editing is prevented; after
`FAL_PUBLISHED` the FAL is immutable and `poReviseFal(reason)` is the only route,
which retains the previous FAL rows and run in `poState.history`.

### OOA / OOT / joining

- **OOA** `DRAFT → APPROVED → ISSUED`, generated only from valid FAL rows. An issued
  OOA is never deleted; `poReviseOoa()` supersedes it as `REVISED` with a reason.
- **OOT** only where `allotted cadre != present local cadre`. Others carry
  `transfer_required: false` / `NOT REQUIRED`. Joining deadline = issue + 7 days.
- **Joining** statuses `PENDING | JOINED | OVERDUE | EXCEPTION`. `OVERDUE` is derived by
  `poRefreshJoiningStatus()`. Only `JOINED` and `EXCEPTION` resolve a record.

### Audit and versioning

`poAudit(action, {prev, next, reason, employee_id, version})` appends to
`poState.audit` (capped at 3000). Versions: `fws, dsl, fsl, options, claims, policy,
fal, ooa, oot` plus the engine's own `engine_version` and `engine_hash`.

### Official data is never silently destroyed

`poState.history` retains superseded FSL, allocation runs, FAL rows, OOA, OOT and
options. Revisions append; they never delete-and-recreate.

### Allocation run snapshot (reproducibility)

`poRunSnapshot()` captures exercise id, run id, engine version and hash, FWS/FSL/
options/claims/policy versions, the SC/ST configuration, both policy decisions,
start time, user, input counts and an `input_fingerprint` (FNV-1a over the FSL,
options and FWS). Re-running the same inputs with the same policy reproduces the
same output exactly.

### Simulation vs confirmation

`poSimulateAllocation()` writes only `poState.simulation`; the run, FAL, OOA and OOT
are untouched. `poConfirmAllocation()` requires FSL locked and published, options
locked and working strength reconciled, freezes the policy, stamps the snapshot and
records `allocation_started_at` / `allocation_completed_at`. A failed over-allocation
check discards the run whole and audits `ALLOCATION_FAILED` — no correction is applied.

### Error reporting (PART 29)

`POEngine.PO_ERROR_CATALOGUE` gives every critical code a description and a
recommended action. `poIssueDetail(issue)` normalises any engine issue to
`{code, description, employee, rank, cadre, source_data, recommended_action}`, which
is what the Step 7 exception table renders. Official data is never silently corrected.

### Verification

```bash
node --test tests/po-engine.test.cjs        # 53 engine tests (originals + fixes)
node --test tests/po-conformance.test.cjs   # 44 GO conformance tests (TEST 1..34)
node --test tests/po-workflow.test.cjs      # 15 workflow tests (TEST 35..40 + PART 24)
node .smoke/po-flow.cjs                     # all 21 states in a real browser
node .smoke/ui-verify.cjs                   # full-app regression + screenshots
```

`tests/po-workflow.test.cjs` evaluates the real `poCore.js` behind a minimal
localStorage shim, so it drives production code rather than a re-implementation.

### Backend migration plan

1. Add D1 tables for exercise, dsl, fsl, options, allocation_run, fal, ooa, oot,
   objection, audit_event, each **append-only** with a version column.
2. Add Worker endpoints matching `PORepositoryContract.methods`, all idempotent via
   a fingerprint header, and refusing to overwrite an existing version.
3. Instantiate `BackendPORepository(API_BASE_URL, { token })` in `poCore.js` instead
   of `LocalStoragePORepository`.
4. Nothing in `poEngine.js` changes: it has no knowledge of persistence.
5. Flip `authoritative` to `true` only once the server enforces immutability and
   audit, and only then remove the development-mode banner.

### Assumptions requiring DLC confirmation

1. The SC/ST substitution partner is the **last allotted general-category employee**
   by allocation sequence, and the donor cadre must be over its own prescribed share.
2. The rounding convention. `ROUND_HALF_UP` is a `SYSTEM IMPLEMENTATION RULE`.
3. Which post a compulsory allotment takes (`PO_COMPULSORY_POLICIES`).
4. Whether the prefer-existing-cadre switch is used at all.
5. Whether a cadre-level SC/ST imbalance is reportable when the category total is
   satisfied (currently AMBER) or critical (currently BLOCKING).
6. The objection and FSL-eligibility periods as supplied (5 and 7 days).
7. The reserved-group percentages are taken as given from the order.
### Key PO Functions

Engine (`poEngine.js`):

| Function | Purpose |
|----------|---------|
| `poBuildContext(input)` | Normalise categories/cadres/strengths into the engine context |
| `validateWorkingStrength(input)` | FWS reconciliation gate |
| `validateDSL(records, input)` | DSL validation (para 7) |
| `validateFSL(fsl, input)` | FSL validation, incl. version stamp and DSL↔FSL reconciliation |
| `analyseFSL(fsl, input)` | FSL analysis dashboard metrics A-N |
| `runAllocation(input)` | The allocation engine (mode `SIMULATION` or `CONFIRMED`) |
| `reviewSegProportion(args)` | SC/ST review + last-allotted substitution, working-strength basis |
| `validateFAL(result, input)` | FAL GREEN/RED/AMBER validation, 13 blocking checks |
| `poPreferredClaim(rec)` | Highest-priority **verified** claim, or `null` |
| `poEngineHash()` | FNV-1a fingerprint of the behaviour-defining engine code |
| `poApplyRounding(v, policy)` | The `scst_rounding_policy` implementation |
| `poClaimVerified(rec, id)` | Claim + `verification === 'VERIFIED'` |

Repository (`poRepository.js`):

| Item | Purpose |
|------|---------|
| `PORepositoryContract` | The 10-method persistence contract |
| `LocalStoragePORepository` | Current implementation, `authoritative: false` |
| `BackendPORepository` | Declared for the Cloudflare Worker, **not wired** |

State (`poCore.js`):

| Function | Purpose |
|----------|---------|
| `poLoad()` / `poSave()` | Persist `po_state`; discard stale schema versions |
| `poStageGuard()` | Preconditions to leave the current stage |
| `poAdvance(reason)` | The only state mover — one stage forward, audited |
| `poAudit(action, opts)` | Append an audit event |
| `poRecordEvent(key, at, opts)` | Procedural event register, whitelisted keys |
| `poTimeline()` | Calculated DSL / objection / FSL / option / allocation timeline |
| `poRaiseObjection` / `poDisposeObjection` / `poCloseObjectionWindow` | Objection subsystem |
| `poPublishFsl()` | FSL publication with the eligibility-date gate |
| `poCorrectOption(...)` | Audited, versioned option correction |
| `poSetPolicy` / `poFreezePolicy` / `poPolicyFrozen` | DLC policy and its freeze |
| `poRunSnapshot(run)` / `poInputFingerprint()` | Reproducibility record |
| `poAcceptScstException(reason, authority)` | Acknowledge an unavoidable SC/ST shortfall |
| `poErrorDetail(code, ctx)` / `poIssueDetail(issue)` | PART 29 error shape |
| `poRefreshJoiningStatus` / `poUnresolvedJoining` / `poOverrideJoiningClosure` | Joining tracking and closure gate |
| `poSaveCadre` / `poRemoveCadre` | Cadre master |
| `poSaveCategory` / `poRemoveCategory` / `poSuggestCategoriesFromRankMaster` | Rank master |
| `poSetStrength` / `poSetApprovedStrength` | Cadre strength, FWS, approved WS |
| `poImportDslRows` / `poRowToDslRecord` / `poDownloadDslTemplate` | DSL entry (seniority copied verbatim) |
| `poRunDslValidation` | Validate the DSL and cache the report |
| `poBuildFslFromDsl` / `poReviseFsl` / `poFsAnalysis` | FSL lifecycle |
| `poSaveOption` / `poCloseOptions` / `poOptionDeadline` | Option lifecycle and window |
| `poSimulateAllocation` / `poConfirmAllocation` / `poFALValidation` | Allocation |
| `poGenerateFal` / `poApproveFal` / `poPublishFal` / `poReviseFal` | FAL lifecycle |
| `poGenerateOoa` / `poApproveOoa` / `poIssueOoa` / `poReviseOoa` | OOA lifecycle |
| `poGenerateOot` / `poIssueOot` / `poRecordJoining` | OOT and joining |
| `poDashboard()` | DLC dashboard counters, timeline, policy, objections, joining |
| `poResetAll()` | Guarded, audited full reset |

UI (`presidentialOrder.js`):

| Function | Purpose |
|----------|---------|
| `showPOPage()` / `renderPOModule()` | Module shell + step rail + versions |
| `renderCurrentPOTab()` | Render the open step, then the workflow control |
| `renderStepDlc` … `renderStepOrders` | The nine step screens |
| `poAdvanceStage()` | Advance the workflow, prompting for a reason |
| `poExplainAllocation(employeeId)` | Full "why this cadre?" explanation |
| `poShowAudit()` / `poShowDashboard()` | Audit trail and DLC dashboard modals |

---

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
   the change is permission-checked, versioned and audited.
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
    DSL/FSL, so the district database can never silently become official seniority data
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
18. **`poBuildFslFromDsl()` is gated three ways**: the option window must not have
    opened, every objection must be disposed, and `poFslEligible()` must be true.
19. **`poNormalizeSegGroup()` strips dots, dashes, spaces and underscores** so
    `SC_3`, `SC-3`, `SC 3` and `SC3` all parse. Keep the underscore in that class.
20. **Persistence goes through `poRepository`.** `poSave()` writes via the repository,
    falling back to `localStorage.setItem` only if it is absent.

