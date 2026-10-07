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
→ policeStation.js → export.js → auditlog.js → presidentialOrder.js → app.js
```
Each file depends on the previous. `presidentialOrder.js` overrides `dashboard.js`'s `showPage()`.

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

## Presidential Order-2025 Module (`presidentialOrder.js`)

### State (stored in `localStorage.po_state`)
```javascript
{ poDataVersion: 7, poCadres, poCadreStrength, poExtended, poDSL, poFSL,
  poOptions, poAllocations, poUnitPersonnel, poStage, poObjections,
  poPreferentialCategories }
```
- **Version check**: If `poDataVersion !== PO_DATA_VERSION`, localStorage is cleared (auto-migration)
- **Always bump `PO_DATA_VERSION` when changing data schema**

### Tabs (rendered in `#poMainContent` inside `#presidentialOrder` page)
1. **Unit Data** (`renderPOUnitData`) - 16 district cadre ranks, per-cadre strength, personnel with Format-I(A) columns
2. **Overview** (`renderPOOverview`) - Dashboard with workflow stepper
3. **Cadres & Strength** (`renderPOCadres`) - Define/manage cadres
4. **Seniority List** (`renderPOSeniority`) - DSL → Objections → FSL workflow
5. **Option Forms** (`renderPOOptions`) - Employee preference tracking
6. **Pref. Categories** (`renderPOPrefCat`) - PwBD, widow, medical conditions
7. **Allocation** (`renderPOAllocation`) - Run allocation algorithm, view FAL
8. **Final Orders** (`renderPOOrders`) - Export OOA (Annexure-IV), OOT

### Default Cadres
```javascript
{ id: 'DC_KRISHNA', name: 'Krishna District (Residuary)' }
{ id: 'DC_NTR',    name: 'NTR District' }
{ id: 'DC_ELURU',  name: 'Eluru District' }
```
All are `level: 'DISTRICT'`. Only district-level cadres exist (no zonal/multi-zonal).

### PO Unit Ranks (16 ranks)
```
Assistant Sub-Inspector of Police, Head Constable (Civil), Police Constable (Civil),
Head Constable (AR), Police Constable (AR), Senior Assistant, Junior Assistant,
Typists, Record Assistant, Office Sub-Ordinates, Sweepers, Scavengers,
Dhobi, Barbers, Cobbler, Waterman
```

### Personnel Record Structure (Format-I(A) compliant)
```javascript
{
    rank, name, genl_no, seniority_no, gender, date_of_birth, date_of_joining,
    cfms_id, mobile, caste, sc_st_group, pwbd_percent, widow, disabled_children,
    cancer, neurosurgery, kidney, liver, heart,
    seniority_type, proceedings_no, proceedings_date,
    allocated_cadre_id, _idx
}
```

### Allocation Algorithm (runAllocation)
1. Separate employees into preferential and non-preferential
2. Sort preferential by priority order (PwBD → MCC → Widow → Cancer → Neuro → Kidney → Liver → Heart)
3. Sort non-preferential by seniority_no
4. For each employee, try preference options 1→2→3 for their rank+type
5. If no preference matches, compulsory allocation to any cadre with vacancy
6. SC/ST proportionate distribution review (1% SC-I, 6.5% SC-II, 7.5% SC-III, 6% ST)

### SC/ST Groups
```javascript
{ id: 'SC_1', percent: 1 }, { id: 'SC_2', percent: 6.5 },
{ id: 'SC_3', percent: 7.5 }, { id: 'ST', percent: 6 }
```

### Workflow Stages
```
init → cadre_defined → dsl_published → objection_period → fsl_published → options_open → allocation_done
```

### Key PO Functions
| Function | Purpose |
|----------|---------|
| `showPOPage()` | Entry point, called when PO page is shown |
| `renderPOModule()` | Renders tab navigation + stage indicator |
| `switchPOTab(tab)` | Switch between Unit Data/Overview/etc tabs |
| `selectPOUnitRank(rank, el)` | Click a rank tile to see its detail |
| `saveUnitCadreStrength(input)` | Save working strength for a rank+type+cadre |
| `savePOUnitPersonnel(rank, editIdx)` | Save person record from modal |
| `downloadPOUnitTemplate(rank)` | Download CSV template file |
| `importPOUnitData(input, rank)` | Bulk import from CSV |
| `runAllocation()` | Execute allocation algorithm |
| `resetPOModule()` | Clear all PO data |

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

1. **Script load order matters** - `presidentialOrder.js` overrides `dashboard.js`'s `showPage()`, so it must load AFTER `dashboard.js` but BEFORE `app.js`
2. **PO data is in localStorage** - Clearing browser data resets the PO module
3. **PO version mismatch clears all data** - Bump `PO_DATA_VERSION` when changing schema
4. **`escapeQuotes()`** is defined in `policeStation.js`, used by `presidentialOrder.js`
5. **`downloadFile()`** is defined in `export.js`, used by `presidentialOrder.js`
6. **All onclick handlers in template strings need proper escaping** - use `escapeQuotes()` for rank names
7. **CSV import maps lowercase/snake_case column headers** - case-insensitive mapping
8. **Cache-Control is 10 minutes** on GitHub Pages - wait or hard-refresh after push
9. **Personnel from `ERSTWHILE` district** are allocated to new districts via PO process
10. **`allPersonnel` is loaded once** by `loadAllData()`, then cached in memory
