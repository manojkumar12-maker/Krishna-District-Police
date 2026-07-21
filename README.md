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
├── workers/             # Cloudflare Worker (backend API)
│   ├── src/index.js     # Hono-based API server
│   ├── schema.sql       # D1 database schema
│   ├── wrangler.toml    # Worker configuration
│   └── package.json
└── Backend/             # Legacy Express backend (not used)
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
