import { Hono } from 'hono';
import { cors } from 'hono/cors';
import * as jose from 'jose';

const app = new Hono();

// ── CORS ────────────────────────────────────────────────────────
app.use('*', cors({
    origin: (origin) => {
        if (!origin) return origin;
        if (origin.endsWith('.github.io') && origin.startsWith('https://')) return origin;
        if (origin.startsWith('http://localhost:')) return origin;
        return origin;
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
}));

// ── Auth helpers ─────────────────────────────────────────────────
async function getJwtSecret(c) {
    const secret = c.env.JWT_SECRET;
    return new TextEncoder().encode(secret);
}

async function createToken(userId, email, role, jwtSecret) {
    const secret = new TextEncoder().encode(jwtSecret);
    return new jose.SignJWT({ userId, email, role })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime('24h')
        .sign(secret);
}

async function verifyToken(c) {
    try {
        const auth = c.req.header('Authorization');
        if (!auth?.startsWith('Bearer ')) return null;
        const token = auth.slice(7);
        const secret = await getJwtSecret(c);
        const { payload } = await jose.jwtVerify(token, secret);
        return payload;
    } catch {
        return null;
    }
}

// Auth middleware
const authRequired = () => async (c, next) => {
    const user = await verifyToken(c);
    if (!user) return c.json({ error: 'Access token required' }, 401);
    c.set('user', user);
    await next();
};

const adminRequired = () => async (c, next) => {
    const user = c.get('user');
    if (!user) return c.json({ error: 'Access token required' }, 401);
    if (user.role !== 'ADMIN') return c.json({ error: 'Admin access required' }, 403);
    await next();
};

// Audit log helper
async function auditLog(db, action, performedBy, targetId, targetType, changes = {}) {
    try {
        await db.prepare(
            'INSERT INTO auditlogs (action, performedBy, targetId, targetType, changes) VALUES (?1, ?2, ?3, ?4, ?5)'
        ).bind(action, performedBy, String(targetId), targetType, JSON.stringify(changes)).run();
    } catch (e) {
        console.error('Audit log error:', e.message);
    }
}

// ── First-run admin seeding ──────────────────────────────────────
async function seedAdminOnce(db, env) {
    try {
        const result = await db.prepare('SELECT COUNT(*) as count FROM users').first();
        if (result.count === 0 && env.ADMIN_EMAIL && env.ADMIN_PASSWORD) {
            const hash = await hashPassword(env.ADMIN_PASSWORD);
            await db.prepare('INSERT INTO users (email, password, role) VALUES (?1, ?2, ?3)')
                .bind(env.ADMIN_EMAIL.toLowerCase(), hash, 'ADMIN').run();
            console.log('Initial admin user seeded');
        }
    } catch (e) {
        console.error('Seed admin error:', e.message);
    }
}

// Password hashing using Web Crypto (PBKDF2)
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey('raw', salt, 'PBKDF2', false, ['deriveBits']);
    const combined = new Uint8Array(salt.length + 64);
    combined.set(salt);
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
        key, 512
    );
    combined.set(new Uint8Array(bits), salt.length);
    return btoa(String.fromCharCode(...combined));
}

async function verifyPassword(password, storedHash) {
    try {
        const combined = Uint8Array.from(atob(storedHash), c => c.charCodeAt(0));
        const salt = combined.slice(0, 16);
        const storedKey = combined.slice(16);
        const key = await crypto.subtle.importKey('raw', salt, 'PBKDF2', false, ['deriveBits']);
        const bits = await crypto.subtle.deriveBits(
            { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
            key, 512
        );
        const newKey = new Uint8Array(bits);
        if (storedKey.length !== newKey.length) return false;
        return storedKey.every((b, i) => b === newKey[i]);
    } catch {
        return false;
    }
}

// ── Helpers ──────────────────────────────────────────────────────
const db = (c) => c.env.DB;

function transformRow(row) {
    if (!row) return null;
    return { ...row, is_on_deployment: Boolean(row.is_on_deployment) };
}

// ── Routes ───────────────────────────────────────────────────────

// Health check
app.get('/', (c) =>
    c.json({ message: 'Krishna District Police API', status: 'running', version: '4.0.0' })
);

// ── Auth routes ──────────────────────────────────────────────────

app.post('/api/auth/login', async (c) => {
    try {
        const { email, password } = await c.req.json();
        if (!email || !password) return c.json({ error: 'Email and password required' }, 400);

        const user = await db(c).prepare('SELECT * FROM users WHERE email = ?1').bind(email.toLowerCase()).first();
        if (!user) return c.json({ error: 'Invalid credentials' }, 400);

        const valid = await verifyPassword(password, user.password);
        if (!valid) return c.json({ error: 'Invalid credentials' }, 400);

        const token = await createToken(user.id, user.email, user.role, c.env.JWT_SECRET);

        return c.json({
            success: true,
            token,
            user: { id: user.id, email: user.email, role: user.role },
        });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

app.post('/api/auth/register', authRequired(), adminRequired(), async (c) => {
    try {
        const { email, password, role } = await c.req.json();
        if (!email || !password) return c.json({ error: 'Email and password required' }, 400);
        if (password.length < 6) return c.json({ error: 'Password must be at least 6 characters' }, 400);

        const exist = await db(c).prepare('SELECT id FROM users WHERE email = ?1').bind(email.toLowerCase()).first();
        if (exist) return c.json({ error: 'User already exists' }, 400);

        const validRoles = ['ADMIN', 'USER'];
        const assignedRole = validRoles.includes(role) ? role : 'USER';

        const hashed = await hashPassword(password);
        const result = await db(c).prepare(
            'INSERT INTO users (email, password, role) VALUES (?1, ?2, ?3)'
        ).bind(email.toLowerCase(), hashed, assignedRole).run();

        return c.json({
            success: true,
            message: 'User created successfully',
            user: { id: result.meta.last_row_id, email, role: assignedRole },
        }, 201);
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

// ── Personnel routes ─────────────────────────────────────────────

function buildPersonnelQuery(q) {
    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (q.search) {
        const term = `%${q.search}%`;
        conditions.push(`(name LIKE ?${paramIdx} OR rank LIKE ?${paramIdx} OR genl_no LIKE ?${paramIdx} OR previous_station LIKE ?${paramIdx} OR present_working LIKE ?${paramIdx} OR phone_number LIKE ?${paramIdx})`);
        params.push(term);
        paramIdx++;
    }
    if (q.name) {
        conditions.push(`name LIKE ?${paramIdx}`); params.push(`%${q.name}%`); paramIdx++;
    }
    if (q.rank) {
        conditions.push(`rank = ?${paramIdx}`); params.push(q.rank); paramIdx++;
    }
    if (q.genl_no) {
        conditions.push(`genl_no LIKE ?${paramIdx}`); params.push(`%${q.genl_no}%`); paramIdx++;
    }
    if (q.personnel_type) {
        conditions.push(`personnel_type = ?${paramIdx}`); params.push(q.personnel_type); paramIdx++;
    }
    if (q.district) {
        conditions.push(`district = ?${paramIdx}`); params.push(q.district); paramIdx++;
    }
    if (q.status) {
        conditions.push(`status = ?${paramIdx}`); params.push(q.status); paramIdx++;
    }
    if (q.gender) {
        conditions.push(`gender = ?${paramIdx}`); params.push(q.gender); paramIdx++;
    }
    if (q.station) {
        conditions.push(`present_working LIKE ?${paramIdx}`); params.push(`%${q.station}%`); paramIdx++;
    }
    if (q.is_on_deployment !== undefined) {
        conditions.push(`is_on_deployment = ?${paramIdx}`); params.push(q.is_on_deployment === 'true' ? 1 : 0); paramIdx++;
    }

    return { conditions, params };
}

app.get('/api/personnel', authRequired(), async (c) => {
    try {
        const q = c.req.query();
        const { conditions, params } = buildPersonnelQuery(q);

        let sql = 'SELECT * FROM personnel';
        if (conditions.length > 0) {
            sql += ' WHERE ' + conditions.join(' AND ');
        }
        sql += ' ORDER BY created_at DESC';

        const stmt = db(c).prepare(sql).bind(...params);
        const { results } = await stmt.all();
        const data = (results || []).map(transformRow);

        return c.json({ success: true, data, count: data.length });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

app.get('/api/personnel/:id', authRequired(), async (c) => {
    try {
        const row = await db(c).prepare('SELECT * FROM personnel WHERE id = ?1').bind(c.req.param('id')).first();
        if (!row) return c.json({ error: 'Personnel not found' }, 404);
        return c.json({ success: true, data: transformRow(row) });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

app.post('/api/personnel', authRequired(), adminRequired(), async (c) => {
    try {
        const body = await c.req.json();
        if (!body.name || !body.rank || !body.genl_no || !body.personnel_type || !body.district) {
            return c.json({ error: 'Missing required fields' }, 400);
        }

        const cols = ['name','rank','genl_no','personnel_type','district','gender','previous_station',
            'status','date_of_birth','caste','education','date_of_promotion','present_working',
            'phone_number','punishments','is_on_deployment','deployment_unit','date_of_deployment'];
        const values = cols.map(f => f === 'is_on_deployment' ? (body[f] ? 1 : 0) : (body[f] || ''));

        const now = new Date().toISOString();
        const result = await db(c).prepare(
            `INSERT INTO personnel (${cols.join(',')}, created_at, updated_at) VALUES (${cols.map((_,i) => `?${i+1}`).join(',')}, ?${cols.length+1}, ?${cols.length+2})`
        ).bind(...values, now, now).run();

        const newId = result.meta.last_row_id;
        await auditLog(c.env.DB, 'CREATE', c.get('user').email, newId, 'Personnel', body);

        const created = await db(c).prepare('SELECT * FROM personnel WHERE id = ?1').bind(newId).first();
        return c.json({ success: true, data: transformRow(created), message: 'Personnel created' }, 201);
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

app.put('/api/personnel/:id', authRequired(), adminRequired(), async (c) => {
    try {
        const body = await c.req.json();
        const id = c.req.param('id');

        const old = await db(c).prepare('SELECT * FROM personnel WHERE id = ?1').bind(id).first();
        if (!old) return c.json({ error: 'Personnel not found' }, 404);

        const now = new Date().toISOString();
        const sets = [];
        const vals = [];
        let pi = 1;

        const cols = ['name','rank','genl_no','personnel_type','district','gender','previous_station',
            'status','date_of_birth','caste','education','date_of_promotion','present_working',
            'phone_number','punishments','is_on_deployment','deployment_unit','date_of_deployment'];
        const changedFields = {};

        for (const col of cols) {
            if (body[col] !== undefined) {
                const val = col === 'is_on_deployment' ? (body[col] ? 1 : 0) : (body[col] || '');
                sets.push(`${col} = ?${pi}`);
                vals.push(val);
                pi++;
                const oldVal = col === 'is_on_deployment' ? Boolean(old[col]) : (old[col] || '');
                if (String(oldVal) !== String(val)) {
                    changedFields[col] = { from: oldVal, to: val };
                }
            }
        }

        sets.push(`updated_at = ?${pi}`); vals.push(now); pi++;

        if (sets.length > 1) {
            vals.push(id);
            await db(c).prepare(`UPDATE personnel SET ${sets.join(', ')} WHERE id = ?${pi}`).bind(...vals).run();
        }

        if (Object.keys(changedFields).length > 0) {
            await auditLog(c.env.DB, 'UPDATE', c.get('user').email, id, 'Personnel', changedFields);
        }

        return c.json({ success: true, message: 'Personnel updated' });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

app.delete('/api/personnel/:id', authRequired(), adminRequired(), async (c) => {
    try {
        const id = c.req.param('id');
        const old = await db(c).prepare('SELECT * FROM personnel WHERE id = ?1').bind(id).first();
        if (!old) return c.json({ error: 'Personnel not found' }, 404);

        await db(c).prepare('DELETE FROM personnel WHERE id = ?1').bind(id).run();
        await auditLog(c.env.DB, 'DELETE', c.get('user').email, id, 'Personnel', {
            name: old.name, rank: old.rank, genl_no: old.genl_no,
        });

        return c.json({ success: true, message: 'Personnel deleted' });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

app.delete('/api/personnel', authRequired(), adminRequired(), async (c) => {
    try {
        await auditLog(c.env.DB, 'CLEAR_ALL', c.get('user').email, 'ALL', 'Personnel', {});
        await db(c).prepare('DELETE FROM personnel').run();
        return c.json({ success: true, message: 'All personnel data cleared' });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

// Excel import
app.post('/api/personnel/import', authRequired(), adminRequired(), async (c) => {
    try {
        const formData = await c.req.parseBody();
        const file = formData.file;

        if (!file || typeof file === 'string') return c.json({ error: 'No file uploaded' }, 400);

        let buffer;
        if (file instanceof File) {
            buffer = await file.arrayBuffer();
        } else {
            buffer = new Uint8Array(Object.values(file)).buffer;
        }

        const text = new TextDecoder().decode(buffer);
        let rows;
        try {
            rows = JSON.parse(text);
            if (!Array.isArray(rows)) throw new Error('Not an array');
        } catch {
            rows = parseCSV(text);
        }

        if (!rows.length) return c.json({ error: 'Empty file' }, 400);

        const imported = [];
        const errors = [];
        const now = new Date().toISOString();
        const cols = ['name','rank','genl_no','personnel_type','district','gender','previous_station',
            'status','date_of_birth','caste','education','date_of_promotion','present_working',
            'phone_number','punishments','is_on_deployment','deployment_unit','date_of_deployment','created_at','updated_at'];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (!row.name && !row.genl_no) {
                errors.push({ row: i + 2, error: 'Missing name and genl_no' });
                continue;
            }
            try {
                const doc = normalizeRow(row);
                const values = cols.map(f => {
                    if (f === 'is_on_deployment') return (doc[f] ? 1 : 0);
                    if (f === 'created_at' || f === 'updated_at') return now;
                    return doc[f] || '';
                });
                const placeholders = cols.map((_, j) => `?${j+1}`);
                const result = await db(c).prepare(
                    `INSERT INTO personnel (${cols.join(',')}) VALUES (${placeholders.join(',')})`
                ).bind(...values).run();
                imported.push({ ...doc, id: result.meta.last_row_id });
            } catch (err) {
                errors.push({ row: i + 2, error: err.message });
            }
        }

        await auditLog(c.env.DB, 'IMPORT', c.get('user').email, 'BATCH', 'Personnel', {
            importedCount: imported.length, errorCount: errors.length,
        });

        return c.json({
            success: true, imported: imported.length, errors,
            message: `Imported ${imported.length} records` + (errors.length ? `, ${errors.length} errors` : ''),
        });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

function parseCSV(text) {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase().replace(/ /g, '_'));
    return lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const obj = {};
        headers.forEach((h, i) => { obj[h] = values[i] || null; });
        return normalizeRow(obj);
    });
}

function normalizeRow(row) {
    const doc = {};
    const fieldMap = {
        name: ['name'], rank: ['rank'], genl_no: ['genl_no', 'genlno', 'genl_no'],
        personnel_type: ['personnel_type', 'type'], district: ['district'],
        gender: ['gender'], previous_station: ['previous_station', 'previous_station'],
        status: ['status'], date_of_birth: ['date_of_birth', 'dob'],
        caste: ['caste'], education: ['education'],
        date_of_promotion: ['date_of_promotion'], present_working: ['present_working', 'station'],
        phone_number: ['phone_number', 'phone'],
        punishments: ['punishments'],
        is_on_deployment: ['is_on_deployment', 'on_deputation'],
        deployment_unit: ['deployment_unit'], date_of_deployment: ['date_of_deployment'],
    };
    for (const [field, aliases] of Object.entries(fieldMap)) {
        for (const alias of aliases) {
            if (row[alias] !== undefined && row[alias] !== null && row[alias] !== '') {
                let val = row[alias];
                if (field === 'is_on_deployment') {
                    val = String(val).toLowerCase() === 'true' || String(val).toLowerCase() === 'yes';
                }
                doc[field] = val;
                break;
            }
        }
    }
    return doc;
}

// ── Audit logs ───────────────────────────────────────────────────

app.get('/api/audit-logs', authRequired(), adminRequired(), async (c) => {
    try {
        const q = c.req.query();
        const conditions = [];
        const params = [];
        let pi = 1;

        if (q.action) {
            conditions.push(`action = ?${pi}`); params.push(q.action); pi++;
        }
        if (q.performedBy) {
            conditions.push(`performedBy LIKE ?${pi}`); params.push(`%${q.performedBy}%`); pi++;
        }

        const limit = parseInt(q.limit) || 500;
        let sql = 'SELECT * FROM auditlogs';
        if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
        sql += ' ORDER BY timestamp DESC LIMIT ?' + pi;
        params.push(limit);

        const { results } = await db(c).prepare(sql).bind(...params).all();

        return c.json({ success: true, data: (results || []).map(r => ({ ...r, changes: JSON.parse(r.changes || '{}') })), count: results?.length || 0 });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

// ── Sanctioned strength ──────────────────────────────────────────

app.get('/api/sanctioned-strength', authRequired(), async (c) => {
    try {
        const { results } = await db(c).prepare('SELECT * FROM sanctionedstrengths').all();
        return c.json({ success: true, data: results || [] });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

app.post('/api/sanctioned-strength', authRequired(), adminRequired(), async (c) => {
    try {
        const { district, personnel_type, rank, sanctioned_count } = await c.req.json();
        if (!district || !personnel_type || !rank) {
            return c.json({ error: 'District, personnel_type, and rank are required' }, 400);
        }

        const count = parseInt(sanctioned_count) || 0;
        const now = new Date().toISOString();

        const existing = await db(c).prepare(
            'SELECT id FROM sanctionedstrengths WHERE district = ?1 AND personnel_type = ?2 AND rank = ?3'
        ).bind(district, personnel_type, rank).first();

        if (existing) {
            await db(c).prepare(
                'UPDATE sanctionedstrengths SET sanctioned_count = ?1, updated_at = ?2 WHERE id = ?3'
            ).bind(count, now, existing.id).run();
        } else {
            await db(c).prepare(
                'INSERT INTO sanctionedstrengths (district, personnel_type, rank, sanctioned_count, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)'
            ).bind(district, personnel_type, rank, count, now, now).run();
        }

        await auditLog(c.env.DB, 'UPDATE_SANCTIONED', c.get('user').email, `${district}_${personnel_type}_${rank}`, 'SanctionedStrength', { district, personnel_type, rank, sanctioned_count: count });

        return c.json({ success: true, message: 'Sanctioned strength updated' });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

// ── Deputation strength ──────────────────────────────────────────

app.get('/api/deputation-strength', authRequired(), async (c) => {
    try {
        const { results } = await db(c).prepare('SELECT * FROM deputationstrengths').all();
        return c.json({ success: true, data: results || [] });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

app.post('/api/deputation-strength', authRequired(), adminRequired(), async (c) => {
    try {
        const { unit_name, rank, sanctioned_count } = await c.req.json();
        if (!unit_name || !rank) {
            return c.json({ error: 'Unit name and rank are required' }, 400);
        }

        const count = parseInt(sanctioned_count) || 0;
        const now = new Date().toISOString();

        const existing = await db(c).prepare(
            'SELECT id FROM deputationstrengths WHERE unit_name = ?1 AND rank = ?2'
        ).bind(unit_name, rank).first();

        if (existing) {
            await db(c).prepare(
                'UPDATE deputationstrengths SET sanctioned_count = ?1, updated_at = ?2 WHERE id = ?3'
            ).bind(count, now, existing.id).run();
        } else {
            await db(c).prepare(
                'INSERT INTO deputationstrengths (unit_name, rank, sanctioned_count, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)'
            ).bind(unit_name, rank, count, now, now).run();
        }

        await auditLog(c.env.DB, 'UPDATE_DEPUTATION', c.get('user').email, `${unit_name}_${rank}`, 'DeputationStrength', { unit_name, rank, sanctioned_count: count });

        return c.json({ success: true, message: 'Deputation strength updated' });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

// ── Export ───────────────────────────────────────────────────────
export default {
    async fetch(request, env, ctx) {
        ctx.waitUntil(seedAdminOnce(env.DB, env));
        return app.fetch(request, env, ctx);
    },
};
