import { Hono } from 'hono';
import { cors } from 'hono/cors';
import * as jose from 'jose';

const app = new Hono();

// ── Configuration ────────────────────────────────────────────────
const getEnv = (c) => ({
    MONGODB_APP_ID: c.env.MONGODB_APP_ID,
    MONGODB_API_KEY: c.env.MONGODB_API_KEY,
    MONGODB_DATA_SOURCE: c.env.MONGODB_DATA_SOURCE,
    MONGODB_DATABASE: c.env.MONGODB_DATABASE || 'krishna-police',
    JWT_SECRET: c.env.JWT_SECRET,
    ADMIN_EMAIL: c.env.ADMIN_EMAIL,
    ADMIN_PASSWORD: c.env.ADMIN_PASSWORD,
});

// ── MongoDB Data API helper ──────────────────────────────────────
async function mongoAction(env, collection, action, body = {}) {
    const url = `https://data.mongodb-api.com/app/${env.MONGODB_APP_ID}/endpoint/data/v1/action/${action}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'api-key': env.MONGODB_API_KEY,
        },
        body: JSON.stringify({
            dataSource: env.MONGODB_DATA_SOURCE,
            database: env.MONGODB_DATABASE,
            collection,
            ...body,
        }),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`MongoDB API error (${action}): ${res.status} ${err}`);
    }
    return res.json();
}

// Helpers for each collection
const db = (env) => ({
    find: (col, filter = {}, options = {}) =>
        mongoAction(env, col, 'find', { filter, ...options }),
    findOne: (col, filter = {}) =>
        mongoAction(env, col, 'findOne', { filter }),
    insertOne: (col, doc) =>
        mongoAction(env, col, 'insertOne', { document: doc }),
    insertMany: (col, docs) =>
        mongoAction(env, col, 'insertMany', { documents: docs }),
    updateOne: (col, filter, update) =>
        mongoAction(env, col, 'updateOne', { filter, update: { $set: update } }),
    updateOneRaw: (col, filter, update) =>
        mongoAction(env, col, 'updateOne', { filter, update }),
    replaceOne: (col, filter, replacement) =>
        mongoAction(env, col, 'replaceOne', { filter, document: replacement }),
    deleteOne: (col, filter) =>
        mongoAction(env, col, 'deleteOne', { filter }),
    deleteMany: (col, filter = {}) =>
        mongoAction(env, col, 'deleteMany', { filter }),
    countDocuments: (col, filter = {}) =>
        mongoAction(env, col, 'aggregate', {
            pipeline: [{ $match: filter }, { $count: 'count' }],
        }).then(r => r.documents?.[0]?.count || 0),
});

// ── CORS ────────────────────────────────────────────────────────
app.use('*', cors({
    origin: ['https://*.github.io', 'http://localhost:*'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
}));

// ── Auth helpers ─────────────────────────────────────────────────
async function getJwtSecret(c) {
    const env = getEnv(c);
    return new TextEncoder().encode(env.JWT_SECRET);
}

async function createToken(user) {
    const secret = await getJwtSecret({ env: getEnv });
    return new jose.SignJWT({ userId: user._id, email: user.email, role: user.role })
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
    if (!user) {
        const u = await verifyToken(c);
        if (!u) return c.json({ error: 'Access token required' }, 401);
        c.set('user', u);
        if (u.role !== 'ADMIN') return c.json({ error: 'Admin access required' }, 403);
    } else if (user.role !== 'ADMIN') {
        return c.json({ error: 'Admin access required' }, 403);
    }
    await next();
};

// Audit log helper
async function auditLog(env, action, performedBy, targetId, targetType, changes = {}) {
    try {
        await db(env).insertOne('auditlogs', {
            action,
            performedBy,
            targetId,
            targetType,
            changes,
            timestamp: new Date().toISOString(),
        });
    } catch (e) {
        console.error('Audit log error:', e.message);
    }
}

// ── First-run admin seeding ──────────────────────────────────────
async function seedAdminOnce(env) {
    const count = await db(env).countDocuments('users');
    if (count === 0 && env.ADMIN_EMAIL && env.ADMIN_PASSWORD) {
        const hash = await hashPassword(env.ADMIN_PASSWORD);
        await db(env).insertOne('users', {
            email: env.ADMIN_EMAIL.toLowerCase(),
            password: hash,
            role: 'ADMIN',
            created_at: new Date().toISOString(),
        });
        console.log('Initial admin user seeded');
    }
}

// BCrypt alternative using Web Crypto
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey('raw', salt, 'PBKDF2', false, ['deriveBits']);
    const combined = new Uint8Array(salt.length + 64);
    combined.set(salt);
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
        key,
        512,
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
            key,
            512,
        );
        const newKey = new Uint8Array(bits);
        if (storedKey.length !== newKey.length) return false;
        return storedKey.every((b, i) => b === newKey[i]);
    } catch {
        return false;
    }
}

// ── Routes ───────────────────────────────────────────────────────

// Health check
app.get('/', (c) =>
    c.json({ message: 'Krishna District Police API', status: 'running', version: '3.0.0' })
);

// ── Auth routes ──────────────────────────────────────────────────

app.post('/api/auth/login', async (c) => {
    try {
        const { email, password } = await c.req.json();
        if (!email || !password) return c.json({ error: 'Email and password required' }, 400);

        const env = getEnv(c);
        const result = await db(env).findOne('users', { email: email.toLowerCase() });
        const user = result.document;
        if (!user) return c.json({ error: 'Invalid credentials' }, 400);

        const valid = await verifyPassword(password, user.password);
        if (!valid) return c.json({ error: 'Invalid credentials' }, 400);

        const token = await createToken(user);

        return c.json({
            success: true,
            token,
            user: { id: user._id, email: user.email, role: user.role },
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

        const env = getEnv(c);
        const exist = await db(env).findOne('users', { email: email.toLowerCase() });
        if (exist.document) return c.json({ error: 'User already exists' }, 400);

        const validRoles = ['ADMIN', 'USER'];
        const assignedRole = validRoles.includes(role) ? role : 'USER';

        const hashed = await hashPassword(password);
        const result = await db(env).insertOne('users', {
            email: email.toLowerCase(),
            password: hashed,
            role: assignedRole,
            created_at: new Date().toISOString(),
        });

        return c.json({
            success: true,
            message: 'User created successfully',
            user: { id: result.insertedId, email, role: assignedRole },
        }, 201);
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

// ── Personnel routes ─────────────────────────────────────────────

app.get('/api/personnel', authRequired(), async (c) => {
    try {
        const env = getEnv(c);
        const q = c.req.query();
        const filter = {};

        if (q.search) {
            const re = new BSONRegExp(q.search, 'i');
            filter.$or = [
                { name: re }, { rank: re }, { genl_no: re },
                { previous_station: re }, { present_working: re }, { phone_number: re },
            ];
        }
        if (q.name) filter.name = new BSONRegExp(q.name, 'i');
        if (q.rank) filter.rank = q.rank;
        if (q.genl_no) filter.genl_no = new BSONRegExp(q.genl_no, 'i');
        if (q.personnel_type) filter.personnel_type = q.personnel_type;
        if (q.district) filter.district = q.district;
        if (q.status) filter.status = q.status;
        if (q.gender) filter.gender = q.gender;
        if (q.station) filter.present_working = new BSONRegExp(q.station, 'i');
        if (q.is_on_deployment !== undefined) filter.is_on_deployment = q.is_on_deployment === 'true';

        // Simple regex workaround for BSONRegExp not being available in Data API directly
        // We'll use $regex operator
        const mongoFilter = buildFilter(filter, q);

        const result = await db(env).find('personnel', mongoFilter, {
            sort: { created_at: -1 },
        });

        return c.json({ success: true, data: result.documents || [], count: result.documents?.length || 0 });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

function buildFilter(filter, q) {
    const mongoFilter = {};
    const regexFields = [];

    if (q.search) {
        const re = { $regex: q.search, $options: 'i' };
        mongoFilter.$or = [
            { name: re }, { rank: re }, { genl_no: re },
            { previous_station: re }, { present_working: re }, { phone_number: re },
        ];
    }

    if (q.name) mongoFilter.name = { $regex: q.name, $options: 'i' };
    if (q.rank) mongoFilter.rank = q.rank;
    if (q.genl_no) mongoFilter.genl_no = { $regex: q.genl_no, $options: 'i' };
    if (q.personnel_type) mongoFilter.personnel_type = q.personnel_type;
    if (q.district) mongoFilter.district = q.district;
    if (q.status) mongoFilter.status = q.status;
    if (q.gender) mongoFilter.gender = q.gender;
    if (q.station) mongoFilter.present_working = { $regex: q.station, $options: 'i' };
    if (q.is_on_deployment !== undefined) mongoFilter.is_on_deployment = q.is_on_deployment === 'true';

    return mongoFilter;
}

app.get('/api/personnel/:id', authRequired(), async (c) => {
    try {
        const env = getEnv(c);
        const result = await db(env).findOne('personnel', { _id: { $oid: c.req.param('id') } });
        if (!result.document) return c.json({ error: 'Personnel not found' }, 404);
        return c.json({ success: true, data: transformDoc(result.document) });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

app.post('/api/personnel', authRequired(), adminRequired(), async (c) => {
    try {
        const env = getEnv(c);
        const body = await c.req.json();
        if (!body.name || !body.rank || !body.genl_no || !body.personnel_type || !body.district) {
            return c.json({ error: 'Missing required fields' }, 400);
        }
        const doc = { ...body, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        const result = await db(env).insertOne('personnel', doc);
        await auditLog(env, 'CREATE', c.get('user').email, result.insertedId, 'Personnel', body);
        return c.json({ success: true, data: { ...doc, id: result.insertedId }, message: 'Personnel created' }, 201);
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

app.put('/api/personnel/:id', authRequired(), adminRequired(), async (c) => {
    try {
        const env = getEnv(c);
        const body = await c.req.json();
        const oid = c.req.param('id');

        const old = await db(env).findOne('personnel', { _id: { $oid: oid } });
        if (!old.document) return c.json({ error: 'Personnel not found' }, 404);

        body.updated_at = new Date().toISOString();
        await db(env).updateOne('personnel', { _id: { $oid: oid } }, body);

        const changedFields = {};
        for (const key of Object.keys(body)) {
            if (JSON.stringify(old.document[key]) !== JSON.stringify(body[key])) {
                changedFields[key] = { from: old.document[key], to: body[key] };
            }
        }
        await auditLog(env, 'UPDATE', c.get('user').email, oid, 'Personnel', changedFields);

        return c.json({ success: true, message: 'Personnel updated' });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

app.delete('/api/personnel/:id', authRequired(), adminRequired(), async (c) => {
    try {
        const env = getEnv(c);
        const oid = c.req.param('id');
        const old = await db(env).findOne('personnel', { _id: { $oid: oid } });
        if (!old.document) return c.json({ error: 'Personnel not found' }, 404);

        await db(env).deleteOne('personnel', { _id: { $oid: oid } });
        await auditLog(env, 'DELETE', c.get('user').email, oid, 'Personnel', {
            name: old.document.name, rank: old.document.rank, genl_no: old.document.genl_no,
        });

        return c.json({ success: true, message: 'Personnel deleted' });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

app.delete('/api/personnel', authRequired(), adminRequired(), async (c) => {
    try {
        const env = getEnv(c);
        await auditLog(env, 'CLEAR_ALL', c.get('user').email, 'ALL', 'Personnel', {});
        await db(env).deleteMany('personnel');
        return c.json({ success: true, message: 'All personnel data cleared' });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

// Excel import
app.post('/api/personnel/import', authRequired(), adminRequired(), async (c) => {
    try {
        const env = getEnv(c);
        const formData = await c.req.parseBody();
        const file = formData.file;

        if (!file || typeof file === 'string') return c.json({ error: 'No file uploaded' }, 400);

        let buffer;
        if (file instanceof File) {
            buffer = await file.arrayBuffer();
        } else {
            buffer = new Uint8Array(Object.values(file)).buffer;
        }

        // Simple CSV/TSV parsing (XLSX parsing is complex in Workers)
        // Accept JSON array or simple CSV
        const text = new TextDecoder().decode(buffer);
        let rows;
        try {
            rows = JSON.parse(text);
            if (!Array.isArray(rows)) throw new Error('Not an array');
        } catch {
            // Try CSV parsing
            rows = parseCSV(text);
        }

        if (!rows.length) return c.json({ error: 'Empty file' }, 400);

        const imported = [];
        const errors = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (!row.name && !row.genl_no) {
                errors.push({ row: i + 2, error: 'Missing name and genl_no' });
                continue;
            }
            try {
                const doc = normalizeRow(row);
                const result = await db(env).insertOne('personnel', doc);
                imported.push({ ...doc, id: result.insertedId });
            } catch (err) {
                errors.push({ row: i + 2, error: err.message });
            }
        }

        await auditLog(env, 'IMPORT', c.get('user').email, 'BATCH', 'Personnel', {
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
    doc.created_at = new Date().toISOString();
    doc.updated_at = new Date().toISOString();
    return doc;
}

// ── Audit logs ───────────────────────────────────────────────────

app.get('/api/audit-logs', authRequired(), adminRequired(), async (c) => {
    try {
        const env = getEnv(c);
        const q = c.req.query();
        const filter = {};
        if (q.action) filter.action = q.action;
        if (q.performedBy) filter.performedBy = { $regex: q.performedBy, $options: 'i' };

        const result = await db(env).find('auditlogs', filter, {
            sort: { timestamp: -1 },
            limit: parseInt(q.limit) || 500,
        });

        return c.json({ success: true, data: result.documents || [], count: result.documents?.length || 0 });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

// ── Sanctioned strength ──────────────────────────────────────────

app.get('/api/sanctioned-strength', authRequired(), async (c) => {
    try {
        const env = getEnv(c);
        const result = await db(env).find('sanctionedstrengths');
        return c.json({ success: true, data: result.documents || [] });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

app.post('/api/sanctioned-strength', authRequired(), adminRequired(), async (c) => {
    try {
        const env = getEnv(c);
        const { district, personnel_type, rank, sanctioned_count } = await c.req.json();
        if (!district || !personnel_type || !rank) {
            return c.json({ error: 'District, personnel_type, and rank are required' }, 400);
        }

        const existing = await db(env).findOne('sanctionedstrengths', { district, personnel_type, rank });
        if (existing.document) {
            await db(env).updateOne('sanctionedstrengths', { _id: existing.document._id }, {
                sanctioned_count: parseInt(sanctioned_count) || 0,
                updated_at: new Date().toISOString(),
            });
        } else {
            await db(env).insertOne('sanctionedstrengths', {
                district, personnel_type, rank,
                sanctioned_count: parseInt(sanctioned_count) || 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            });
        }

        await auditLog(env, 'UPDATE_SANCTIONED', c.get('user').email, `${district}_${personnel_type}_${rank}`, 'SanctionedStrength', { district, personnel_type, rank, sanctioned_count });

        return c.json({ success: true, message: 'Sanctioned strength updated' });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

// ── Deputation strength ──────────────────────────────────────────

app.get('/api/deputation-strength', authRequired(), async (c) => {
    try {
        const env = getEnv(c);
        const result = await db(env).find('deputationstrengths');
        return c.json({ success: true, data: result.documents || [] });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

app.post('/api/deputation-strength', authRequired(), adminRequired(), async (c) => {
    try {
        const env = getEnv(c);
        const { unit_name, rank, sanctioned_count } = await c.req.json();
        if (!unit_name || !rank) {
            return c.json({ error: 'Unit name and rank are required' }, 400);
        }

        const existing = await db(env).findOne('deputationstrengths', { unit_name, rank });
        if (existing.document) {
            await db(env).updateOne('deputationstrengths', { _id: existing.document._id }, {
                sanctioned_count: parseInt(sanctioned_count) || 0,
                updated_at: new Date().toISOString(),
            });
        } else {
            await db(env).insertOne('deputationstrengths', {
                unit_name, rank,
                sanctioned_count: parseInt(sanctioned_count) || 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            });
        }

        await auditLog(env, 'UPDATE_DEPUTATION', c.get('user').email, `${unit_name}_${rank}`, 'DeputationStrength', { unit_name, rank, sanctioned_count });

        return c.json({ success: true, message: 'Deputation strength updated' });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

// ── Document transformer ─────────────────────────────────────────
function transformDoc(doc) {
    if (!doc) return doc;
    const d = { ...doc };
    if (d._id) {
        d.id = typeof d._id === 'string' ? d._id : d._id.$oid || d._id;
        delete d._id;
    }
    return d;
}

// ── Export ───────────────────────────────────────────────────────
export default {
    async fetch(request, env, ctx) {
        // Seed admin on first request
        ctx.waitUntil(seedAdminOnce(env));
        return app.fetch(request, env, ctx);
    },
};
