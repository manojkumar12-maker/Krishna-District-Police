const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const xlsx = require('xlsx');
const connectDB = require('./db');
const User = require('./models/User');
const Personnel = require('./models/Personnel');
const AuditLog = require('./models/AuditLog');
const SanctionedStrength = require('./models/SanctionedStrength');
const DeputationStrength = require('./models/DeputationStrength');

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.JWT_SECRET) {
    console.error('FATAL: JWT_SECRET environment variable is required');
    process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ext = file.originalname.toLowerCase().endsWith('.xlsx') || file.originalname.toLowerCase().endsWith('.xls');
        cb(null, ext);
    }
});

// Middleware
app.use(cors());
app.use(express.json());

// First-run setup: seed an admin from env vars only if no users exist
async function initFirstRunSetup() {
    try {
        const userCount = await User.countDocuments();
        if (userCount === 0) {
            const email = process.env.ADMIN_EMAIL;
            const password = process.env.ADMIN_PASSWORD;
            if (!email || !password) {
                console.log('No users found. Set ADMIN_EMAIL and ADMIN_PASSWORD env vars to seed an admin account.');
                console.log('Or use POST /api/auth/register to create the first user (auto-assigned ADMIN role).');
                return;
            }
            const hashedPw = await bcrypt.hash(password, 10);
            await User.create({ email, password: hashedPw, role: 'ADMIN' });
            console.log('Initial admin user seeded from environment variables');
        }
    } catch (error) {
        console.error('First-run setup error:', error.message);
    }
}

// Initialize default deputation strength entries (only if empty)
const depUnits = [
    'GRP., Vijayawada', 'Intelligence Dept, VJA.', 'I.S.W.', 'I.S.W. (CMSG)',
    'R.I.O., SPL. Intelligence Cell', 'C.I.D. A.P., Mangalagiri', 'EOW-II, Mangalagiri',
    'Vigilance and Enforcement', 'A.P., Transco', 'A.P., Genco',
    'A.C.B., Vijayawada', 'CBI. Visakhapatnam', 'Grey Hounds', 'Octopus', 'APPA., Hyderabad',
    'Police Computer Service', 'Drugs Control Administration',
    'Eagle', 'CSPS, Visakhapatnam'
];

const depRanks = ['PC', 'HC', 'ASI', 'ARPC', 'ARHC'];

async function initializeDeputationStrength() {
    try {
        const count = await DeputationStrength.countDocuments();
        if (count === 0) {
            const entries = [];
            for (const unit of depUnits) {
                for (const rank of depRanks) {
                    entries.push({ unit_name: unit, rank, sanctioned_count: 0 });
                }
            }
            await DeputationStrength.insertMany(entries);
            console.log('Default deputation strength entries created');
        }
    } catch (error) {
        console.error('Failed to initialize deputation strength:', error.message);
    }
}

// Authentication Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
        }
        req.user = user;
        next();
    });
};

// Authorization Middleware
const checkRole = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                error: 'Insufficient permissions. Required role: ' + allowedRoles.join(' or ')
            });
        }
        next();
    };
};

// Audit logging helper
async function createAuditLog(action, performedBy, targetId, targetType, changes) {
    try {
        await AuditLog.create({ action, performedBy, targetId, targetType, changes });
    } catch (error) {
        console.error('Audit log error:', error.message);
    }
}

// Routes

// Health check
app.get('/', (req, res) => {
    res.json({
        message: 'Krishna District Police API',
        status: 'running',
        version: '2.0.0'
    });
});

// ===== Auth Routes =====

// User registration (first user auto-gets ADMIN, subsequent need ADMIN to create)
app.post('/api/auth/register', authenticateToken, checkRole(['ADMIN']), async (req, res) => {
    try {
        const { email, password, role } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        const existing = await User.findOne({ email: email.toLowerCase() });
        if (existing) {
            return res.status(400).json({ error: 'User already exists' });
        }

        const validRoles = ['ADMIN', 'USER'];
        const assignedRole = validRoles.includes(role) ? role : 'USER';

        const hashedPw = await bcrypt.hash(password, 10);
        const user = await User.create({ email, password: hashedPw, role: assignedRole });

        res.status(201).json({
            success: true,
            message: 'User created successfully',
            user: { id: user._id, email: user.email, role: user.role }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        const validPassword = await user.comparePassword(password);
        if (!validPassword) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { userId: user._id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            token,
            user: { id: user._id, email: user.email, role: user.role }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===== Personnel Routes =====

// GET all personnel with search & filters
app.get('/api/personnel', authenticateToken, async (req, res) => {
    try {
        const { search, name, rank, genl_no, personnel_type, district, status, gender, station, is_on_deployment } = req.query;
        const filter = {};

        if (search) {
            const regex = new RegExp(search, 'i');
            filter.$or = [
                { name: regex },
                { rank: regex },
                { genl_no: regex },
                { previous_station: regex },
                { present_working: regex },
                { phone_number: regex }
            ];
        }

        if (name) filter.name = new RegExp(name, 'i');
        if (rank) filter.rank = rank;
        if (genl_no) filter.genl_no = new RegExp(genl_no, 'i');
        if (personnel_type) filter.personnel_type = personnel_type;
        if (district) filter.district = district;
        if (status) filter.status = status;
        if (gender) filter.gender = gender;
        if (station) filter.present_working = new RegExp(station, 'i');
        if (is_on_deployment !== undefined) filter.is_on_deployment = is_on_deployment === 'true';

        const personnel = await Personnel.find(filter).sort({ created_at: -1 });
        res.json({
            success: true,
            data: personnel,
            count: personnel.length
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/personnel/:id', authenticateToken, async (req, res) => {
    try {
        const personnel = await Personnel.findById(req.params.id);
        if (!personnel) {
            return res.status(404).json({ error: 'Personnel not found' });
        }
        res.json({ success: true, data: personnel });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/personnel', authenticateToken, checkRole(['ADMIN']), async (req, res) => {
    try {
        const personnel = await Personnel.create(req.body);
        await createAuditLog('CREATE', req.user.email, personnel._id, 'Personnel', req.body);
        res.status(201).json({
            success: true,
            data: personnel,
            message: 'Personnel created successfully'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/personnel/:id', authenticateToken, checkRole(['ADMIN']), async (req, res) => {
    try {
        const oldDoc = await Personnel.findById(req.params.id);
        if (!oldDoc) {
            return res.status(404).json({ error: 'Personnel not found' });
        }

        const personnel = await Personnel.findByIdAndUpdate(
            req.params.id,
            { ...req.body, updated_at: new Date().toISOString() },
            { new: true, runValidators: true }
        );

        const changedFields = {};
        for (const key of Object.keys(req.body)) {
            if (JSON.stringify(oldDoc[key]) !== JSON.stringify(req.body[key])) {
                changedFields[key] = { from: oldDoc[key], to: req.body[key] };
            }
        }
        await createAuditLog('UPDATE', req.user.email, personnel._id, 'Personnel', changedFields);

        res.json({
            success: true,
            data: personnel,
            message: 'Personnel updated successfully'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/personnel/:id', authenticateToken, checkRole(['ADMIN']), async (req, res) => {
    try {
        const oldDoc = await Personnel.findById(req.params.id);
        if (!oldDoc) {
            return res.status(404).json({ error: 'Personnel not found' });
        }
        await Personnel.findByIdAndDelete(req.params.id);
        await createAuditLog('DELETE', req.user.email, oldDoc._id, 'Personnel', {
            name: oldDoc.name,
            rank: oldDoc.rank,
            genl_no: oldDoc.genl_no
        });
        res.json({
            success: true,
            message: 'Personnel deleted successfully'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/personnel', authenticateToken, checkRole(['ADMIN']), async (req, res) => {
    try {
        await createAuditLog('CLEAR_ALL', req.user.email, 'ALL', 'Personnel', {});
        await Personnel.deleteMany({});
        res.json({
            success: true,
            message: 'All personnel data cleared'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Excel Import
app.post('/api/personnel/import', authenticateToken, checkRole(['ADMIN']), upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = xlsx.utils.sheet_to_json(sheet);

        if (rows.length === 0) {
            return res.status(400).json({ error: 'Excel file is empty' });
        }

        const fieldMap = {
            'name': ['name', 'Name', 'NAME'],
            'rank': ['rank', 'Rank', 'RANK'],
            'genl_no': ['genl_no', 'genlno', 'genl no', 'Genl.No', 'General Number', 'Genl No'],
            'personnel_type': ['personnel_type', 'type', 'Type', 'Personnel Type'],
            'district': ['district', 'District', 'DISTRICT'],
            'gender': ['gender', 'Gender', 'GENDER', 'Sex', 'SEX'],
            'previous_station': ['previous_station', 'previous station', 'Previous Station'],
            'status': ['status', 'Status', 'STATUS'],
            'date_of_birth': ['date_of_birth', 'dob', 'DOB', 'Date of Birth'],
            'caste': ['caste', 'Caste', 'CASTE'],
            'education': ['education', 'Education', 'Qualification'],
            'date_of_promotion': ['date_of_promotion', 'promotion date', 'Date of Promotion'],
            'present_working': ['present_working', 'present working', 'Present Working', 'Station'],
            'phone_number': ['phone_number', 'phone', 'Phone', 'Mobile', 'Phone Number'],
            'punishments': ['punishments', 'Punishments'],
            'is_on_deployment': ['is_on_deployment', 'on deputation', 'Deputation'],
            'deployment_unit': ['deployment_unit', 'deployment unit', 'Deployment Unit'],
            'date_of_deployment': ['date_of_deployment', 'deployment date', 'Date of Deployment']
        };

        const imported = [];
        const errors = [];
        const headerKeys = Object.keys(rows[0]);

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const data = {};

            for (const [field, aliases] of Object.entries(fieldMap)) {
                for (const key of headerKeys) {
                    if (aliases.some(a => a.toLowerCase() === key.toLowerCase())) {
                        let val = row[key];
                        if (val !== undefined && val !== null && val !== '') {
                            if (field === 'is_on_deployment') {
                                val = String(val).toLowerCase() === 'true' || String(val).toLowerCase() === 'yes';
                            }
                            data[field] = val;
                        }
                        break;
                    }
                }
            }

            if (!data.name && !data.genl_no) {
                errors.push({ row: i + 2, error: 'Missing name and genl_no' });
                continue;
            }

            try {
                const personnel = await Personnel.create(data);
                imported.push(personnel);
            } catch (err) {
                errors.push({ row: i + 2, error: err.message });
            }
        }

        await createAuditLog('IMPORT', req.user.email, 'BATCH', 'Personnel', {
            importedCount: imported.length,
            errorCount: errors.length
        });

        res.json({
            success: true,
            imported: imported.length,
            errors: errors,
            message: `Imported ${imported.length} records` + (errors.length ? `, ${errors.length} errors` : '')
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===== Audit Log Routes =====

app.get('/api/audit-logs', authenticateToken, checkRole(['ADMIN']), async (req, res) => {
    try {
        const { action, performedBy, limit } = req.query;
        const filter = {};
        if (action) filter.action = action;
        if (performedBy) filter.performedBy = new RegExp(performedBy, 'i');

        const logs = await AuditLog.find(filter)
            .sort({ timestamp: -1 })
            .limit(parseInt(limit) || 500);

        res.json({ success: true, data: logs, count: logs.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===== Sanctioned Strength Routes =====

app.get('/api/sanctioned-strength', authenticateToken, async (req, res) => {
    try {
        const data = await SanctionedStrength.find();
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/sanctioned-strength', authenticateToken, checkRole(['ADMIN']), async (req, res) => {
    try {
        const { district, personnel_type, rank, sanctioned_count } = req.body;

        const result = await SanctionedStrength.findOneAndUpdate(
            { district, personnel_type, rank },
            { sanctioned_count, updated_at: new Date().toISOString() },
            { upsert: true, new: true, runValidators: true }
        );

        await createAuditLog('UPDATE_SANCTIONED', req.user.email, result._id, 'SanctionedStrength', req.body);

        res.json({
            success: true,
            data: result,
            message: 'Sanctioned strength updated'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===== Deputation Strength Routes =====

app.get('/api/deputation-strength', authenticateToken, async (req, res) => {
    try {
        const data = await DeputationStrength.find();
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/deputation-strength', authenticateToken, checkRole(['ADMIN']), async (req, res) => {
    try {
        const { unit_name, rank, sanctioned_count } = req.body;

        const result = await DeputationStrength.findOneAndUpdate(
            { unit_name, rank },
            { sanctioned_count, updated_at: new Date().toISOString() },
            { upsert: true, new: true, runValidators: true }
        );

        await createAuditLog('UPDATE_DEPUTATION', req.user.email, result._id, 'DeputationStrength', req.body);

        res.json({
            success: true,
            data: result,
            message: 'Deputation strength updated'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
connectDB()
    .then(async () => {
        await initFirstRunSetup();
        await initializeDeputationStrength();
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
            console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
        });
    })
    .catch((error) => {
        console.error('Failed to start server:', error.message);
        process.exit(1);
    });
