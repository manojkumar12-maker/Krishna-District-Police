-- D1 Database Schema for Krishna District Police
-- Run: wrangler d1 execute krishna-police-db --file=./schema.sql

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'USER',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS personnel (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    rank TEXT NOT NULL,
    genl_no TEXT NOT NULL,
    personnel_type TEXT NOT NULL DEFAULT 'CIVIL',
    district TEXT NOT NULL,
    gender TEXT DEFAULT '',
    previous_station TEXT DEFAULT '',
    status TEXT DEFAULT 'Present',
    date_of_birth TEXT DEFAULT '',
    caste TEXT DEFAULT '',
    education TEXT DEFAULT '',
    date_of_promotion TEXT DEFAULT '',
    present_working TEXT DEFAULT '',
    phone_number TEXT DEFAULT '',
    punishments TEXT DEFAULT '',
    is_on_deployment INTEGER DEFAULT 0,
    deployment_unit TEXT DEFAULT '',
    date_of_deployment TEXT DEFAULT '',
    present_district TEXT DEFAULT '',
    native_place TEXT DEFAULT '',
    date_of_appointment TEXT DEFAULT '',
    date_of_joining_present TEXT DEFAULT '',
    attachments TEXT DEFAULT '',
    previous_deputations TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT DEFAULT NULL,
    deleted_by TEXT DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_personnel_rank ON personnel(rank);
CREATE INDEX IF NOT EXISTS idx_personnel_district ON personnel(district);
CREATE INDEX IF NOT EXISTS idx_personnel_type ON personnel(personnel_type);
CREATE INDEX IF NOT EXISTS idx_personnel_status ON personnel(status);
CREATE INDEX IF NOT EXISTS idx_personnel_deployment ON personnel(is_on_deployment);
CREATE INDEX IF NOT EXISTS idx_personnel_genl_no ON personnel(genl_no);
CREATE INDEX IF NOT EXISTS idx_personnel_deleted ON personnel(deleted_at);

CREATE TABLE IF NOT EXISTS auditlogs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    performedBy TEXT NOT NULL,
    targetId TEXT DEFAULT '',
    targetType TEXT DEFAULT '',
    changes TEXT DEFAULT '{}',
    timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sanctionedstrengths (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    district TEXT NOT NULL,
    personnel_type TEXT NOT NULL,
    rank TEXT NOT NULL,
    sanctioned_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(district, personnel_type, rank)
);

CREATE TABLE IF NOT EXISTS deputationstrengths (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    unit_name TEXT NOT NULL,
    rank TEXT NOT NULL,
    sanctioned_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(unit_name, rank)
);

CREATE TABLE IF NOT EXISTS stationsanctionedstrengths (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sub_division TEXT NOT NULL,
    circle TEXT DEFAULT '',
    station TEXT DEFAULT '',
    rank TEXT NOT NULL,
    sanctioned_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(sub_division, circle, station, rank)
);

-- Note: For existing databases that predate these columns, no manual migration is
-- required. The Worker runs idempotent schema migrations on startup (see
-- SCHEMA_COLUMNS / migrateSchema in src/index.js) and adds any missing columns
-- automatically. The equivalent manual statements are:
-- ALTER TABLE personnel ADD COLUMN present_district TEXT DEFAULT '';
-- ALTER TABLE personnel ADD COLUMN native_place TEXT DEFAULT '';
-- ALTER TABLE personnel ADD COLUMN date_of_appointment TEXT DEFAULT '';
-- ALTER TABLE personnel ADD COLUMN date_of_joining_present TEXT DEFAULT '';
-- ALTER TABLE personnel ADD COLUMN attachments TEXT DEFAULT '';
-- ALTER TABLE personnel ADD COLUMN previous_deputations TEXT DEFAULT '';
