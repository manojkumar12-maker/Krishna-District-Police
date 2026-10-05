# Dashboard Data Contract

Every dashboard number must trace to a specific source.

## KPI Cards

| KPI | Source | API | Worker Query | D1 Table |
|-----|--------|-----|--------------|----------|
| Sanctioned Strength | `sanctionedstrengths` table | `GET /api/sanctioned-strength` | `SELECT SUM(sanctioned_count) FROM sanctionedstrengths` | `sanctionedstrengths` |
| Actual Strength | `personnel` table | `GET /api/personnel` | `SELECT COUNT(*) FROM personnel WHERE deleted_at IS NULL AND is_on_deployment = 0` | `personnel` |
| Vacancy | Calculated | N/A | `sanctioned - actual` | N/A |
| On Deputation | `personnel` table | `GET /api/personnel?is_on_deployment=true` | `SELECT COUNT(*) FROM personnel WHERE deleted_at IS NULL AND is_on_deployment = 1` | `personnel` |

## Strength Overview

| Value | Source | API | Worker Query |
|-------|--------|-----|--------------|
| Sanctioned (per rank) | `sanctionedstrengths` | `GET /api/sanctioned-strength` | `SELECT rank, SUM(sanctioned_count) FROM sanctionedstrengths GROUP BY rank` |
| Actual (per rank) | `personnel` | `GET /api/personnel` | `SELECT rank, COUNT(*) FROM personnel WHERE deleted_at IS NULL AND is_on_deployment = 0 GROUP BY rank` |
| Vacancy (per rank) | Calculated | N/A | `sanctioned - actual` |

## District Distribution

| Value | Source | API | Worker Query |
|-------|--------|-----|--------------|
| Erstwhile Krishna | `personnel` + `sanctionedstrengths` | `GET /api/personnel?district=ERSTWHILE` | `SELECT COUNT(*) FROM personnel WHERE district = 'ERSTWHILE' AND deleted_at IS NULL` |
| Krishna New | `personnel` + `sanctionedstrengths` | `GET /api/personnel?district=NEW` | `SELECT COUNT(*) FROM personnel WHERE district = 'NEW' AND deleted_at IS NULL` |

## Attention Required

| Alert | Condition | Source |
|-------|-----------|--------|
| High vacancy rank | vacancy > threshold (configurable) | `sanctionedstrengths` + `personnel` |
| Personnel on deputation | count > 0 | `personnel` |
| Station data mismatch | station totals != district totals | `stationsanctionedstrengths` vs `sanctionedstrengths` |

## Recent Activity

| Value | Source | API | Worker Query |
|-------|--------|-----|--------------|
| Recent changes | `auditlogs` table | `GET /api/audit-logs?limit=10` | `SELECT * FROM auditlogs ORDER BY timestamp DESC LIMIT 10` |

## Quick Actions

| Action | Route | Function |
|--------|-------|----------|
| Add Personnel | `personnel` page | `openAddModal()` |
| Import Excel | `auditlog` page | `handleExcelUpload()` |
| View Strength | `dashboard` page | `showKNRanks()` / `showEWRanks()` |
| Deputation | `deputation` page | `showDepPage()` |
| Police Stations | `policeStation` page | `showPSPage()` |
| Export Report | `export` page | `exportCSV()` / `exportAllPDF()` |

## Data Flow

```
Dashboard UI (dashboard.js)
        ↓
API calls (api.js)
        ↓
Cloudflare Worker (workers/src/index.js)
        ↓
D1 Database (SQLite)
```

## localStorage Dependencies (REMAINING)

| Key | Used By | Risk | Migration Status |
|-----|---------|------|-----------------|
| `authToken` | `auth.js` | Required for API calls | Keep (authentication) |
| `userRole` | Multiple files | UI permission hints | Keep (backend enforces) |
| `userEmail` | `auth.js` | Display only | Keep |
| `po_state` | `presidentialOrder.js` | HIGH — data loss risk | Phase 7 (pending) |
| `station_sanctioned_data` | `policeStation.js` | LOW — one-time migration | Phase 6.6 (helper added) |
