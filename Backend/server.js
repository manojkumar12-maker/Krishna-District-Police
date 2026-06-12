const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const connectDB = require('./db');
const User = require('./models/User');
const Personnel = require('./models/Personnel');
const SanctionedStrength = require('./models/SanctionedStrength');
const DeputationStrength = require('./models/DeputationStrength');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

// Middleware
app.use(cors());
app.use(express.json());

// Initialize default users (only if they don't exist)
async function initializeDefaultUsers() {
    try {
        const adminExists = await User.findOne({ email: 'manoj.spoffice.kri@gmail.com' });
        if (!adminExists) {
            const hashedAdminPw = await bcrypt.hash('Sanju@1227#', 10);
            await User.create({
                email: 'manoj.spoffice.kri@gmail.com',
                password: hashedAdminPw,
                role: 'ADMIN'
            });
            console.log('Default admin user created');
        }

        const userExists = await User.findOne({ email: 'user.spoffice.kri@gmail.com' });
        if (!userExists) {
            const hashedUserPw = await bcrypt.hash('A8DPO#USER', 10);
            await User.create({
                email: 'user.spoffice.kri@gmail.com',
                password: hashedUserPw,
                role: 'USER'
            });
            console.log('Default user created');
        }
    } catch (error) {
        console.error('Failed to initialize default users:', error.message);
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

// Routes

// Health check
app.get('/', (req, res) => {
    res.json({
        message: 'Krishna District Police API',
        status: 'running',
        version: '1.0.0'
    });
});

// Auth Routes
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

// Personnel Routes
app.get('/api/personnel', authenticateToken, async (req, res) => {
    try {
        const personnel = await Personnel.find().sort({ created_at: -1 });
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
        const personnel = await Personnel.findByIdAndUpdate(
            req.params.id,
            { ...req.body, updated_at: new Date().toISOString() },
            { new: true, runValidators: true }
        );
        if (!personnel) {
            return res.status(404).json({ error: 'Personnel not found' });
        }
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
        const personnel = await Personnel.findByIdAndDelete(req.params.id);
        if (!personnel) {
            return res.status(404).json({ error: 'Personnel not found' });
        }
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
        await Personnel.deleteMany({});
        res.json({
            success: true,
            message: 'All personnel data cleared'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Sanctioned Strength Routes
app.get('/api/sanctioned-strength', authenticateToken, async (req, res) => {
    try {
        const data = await SanctionedStrength.find();
        res.json({
            success: true,
            data
        });
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

        res.json({
            success: true,
            data: result,
            message: 'Sanctioned strength updated'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Deputation Strength Routes
app.get('/api/deputation-strength', authenticateToken, async (req, res) => {
    try {
        const data = await DeputationStrength.find();
        res.json({
            success: true,
            data
        });
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
        await initializeDefaultUsers();
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
