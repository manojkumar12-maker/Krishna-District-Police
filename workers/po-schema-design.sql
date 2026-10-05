-- PO-2025 Schema Design
-- FOR REVIEW ONLY - DO NOT EXECUTE YET
-- All personnel data is SNAPSHOT (not live reference)

CREATE TABLE IF NOT EXISTS po_exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    allocation_status TEXT NOT NULL DEFAULT 'none',
    po_data_version INTEGER NOT NULL DEFAULT 8,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS po_cadres (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exercise_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'DISTRICT',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (exercise_id) REFERENCES po_exercises(id)
);

CREATE TABLE IF NOT EXISTS po_cadre_strength (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cadre_id INTEGER NOT NULL,
    personnel_type TEXT NOT NULL,
    rank TEXT NOT NULL,
    sanctioned_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(cadre_id, personnel_type, rank),
    FOREIGN KEY (cadre_id) REFERENCES po_cadres(id)
);

CREATE TABLE IF NOT EXISTS po_personnel (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exercise_id INTEGER NOT NULL,
    rank TEXT NOT NULL,
    name TEXT NOT NULL,
    genl_no TEXT NOT NULL,
    seniority_no INTEGER,
    gender TEXT DEFAULT '',
    date_of_birth TEXT DEFAULT '',
    date_of_joining TEXT DEFAULT '',
    cfms_id TEXT DEFAULT '',
    mobile TEXT DEFAULT '',
    caste TEXT DEFAULT '',
    sc_st_group TEXT DEFAULT '',
    pwbd_percent INTEGER DEFAULT 0,
    widow INTEGER DEFAULT 0,
    disabled_children INTEGER DEFAULT 0,
    cancer INTEGER DEFAULT 0,
    neurosurgery INTEGER DEFAULT 0,
    kidney INTEGER DEFAULT 0,
    liver INTEGER DEFAULT 0,
    heart INTEGER DEFAULT 0,
    seniority_type TEXT DEFAULT '',
    proceedings_no TEXT DEFAULT '',
    proceedings_date TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(exercise_id, genl_no),
    FOREIGN KEY (exercise_id) REFERENCES po_exercises(id)
);

CREATE TABLE IF NOT EXISTS po_dsl (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exercise_id INTEGER NOT NULL,
    personnel_id INTEGER NOT NULL,
    published_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(exercise_id, personnel_id),
    FOREIGN KEY (exercise_id) REFERENCES po_exercises(id),
    FOREIGN KEY (personnel_id) REFERENCES po_personnel(id)
);

CREATE TABLE IF NOT EXISTS po_fsl (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exercise_id INTEGER NOT NULL,
    personnel_id INTEGER NOT NULL,
    published_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(exercise_id, personnel_id),
    FOREIGN KEY (exercise_id) REFERENCES po_exercises(id),
    FOREIGN KEY (personnel_id) REFERENCES po_personnel(id)
);

CREATE TABLE IF NOT EXISTS po_objections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exercise_id INTEGER NOT NULL,
    personnel_id INTEGER NOT NULL,
    reason TEXT NOT NULL,
    resolution TEXT DEFAULT '',
    resolved INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (exercise_id) REFERENCES po_exercises(id),
    FOREIGN KEY (personnel_id) REFERENCES po_personnel(id)
);

CREATE TABLE IF NOT EXISTS po_options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exercise_id INTEGER NOT NULL,
    personnel_id INTEGER NOT NULL,
    pref1 TEXT DEFAULT '',
    pref2 TEXT DEFAULT '',
    pref3 TEXT DEFAULT '',
    submitted INTEGER DEFAULT 0,
    submitted_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(exercise_id, personnel_id),
    FOREIGN KEY (exercise_id) REFERENCES po_exercises(id),
    FOREIGN KEY (personnel_id) REFERENCES po_personnel(id)
);

CREATE TABLE IF NOT EXISTS po_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exercise_id INTEGER NOT NULL,
    personnel_id INTEGER NOT NULL,
    cadre_id INTEGER NOT NULL,
    allocation_method TEXT DEFAULT '',
    sc_st_adjustment INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(exercise_id, personnel_id),
    FOREIGN KEY (exercise_id) REFERENCES po_exercises(id),
    FOREIGN KEY (personnel_id) REFERENCES po_personnel(id),
    FOREIGN KEY (cadre_id) REFERENCES po_cadres(id)
);

CREATE TABLE IF NOT EXISTS po_workflow_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exercise_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    description TEXT DEFAULT '',
    performed_by TEXT NOT NULL,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (exercise_id) REFERENCES po_exercises(id)
);

CREATE INDEX IF NOT EXISTS idx_po_personnel_exercise ON po_personnel(exercise_id);
CREATE INDEX IF NOT EXISTS idx_po_dsl_exercise ON po_dsl(exercise_id);
CREATE INDEX IF NOT EXISTS idx_po_fsl_exercise ON po_fsl(exercise_id);
CREATE INDEX IF NOT EXISTS idx_po_options_exercise ON po_options(exercise_id);
CREATE INDEX IF NOT EXISTS idx_po_allocations_exercise ON po_allocations(exercise_id);
CREATE INDEX IF NOT EXISTS idx_po_workflow_exercise ON po_workflow_events(exercise_id);
