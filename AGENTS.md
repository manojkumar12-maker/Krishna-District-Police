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
```bash
cd workers
wrangler deploy
```

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
