const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

app.use(cors());
app.use(express.json());

const db = { users: [], personnel: [], sanctionedStrength: [], deputationStrength: [] };

const depUnits = [
    'GRP., Vijayawada', 'Intelligence Dept, VJA.', 'I.S.W.', 'I.S.W. (CMSG)',
    'R.I.O., SPL. Intelligence Cell', 'C.I.D. A.P., Mangalagiri',
    'Vigilance and Enforcement', 'A.P., Transco', 'A.P., Genco',
    'A.C.B., Vijayawada', 'Grey Hounds', 'Octopus', 'APPA., Hyderabad',
    'Police Computer Service', 'CBI. Visakhapatnam', 'Drugs Control Administration',
    'Eagle', 'CSPS, Visakhapatnam', 'EOW-II, Mangalagiri'
];

const depRanks = ['PC', 'HC', 'ASI', 'ARPC', 'ARHC'];

depUnits.forEach(unit => {
    depRanks.forEach(rank => {
        db.deputationStrength.push({
            id: uuidv4(),
            unit_name: unit,
            rank: rank,
            sanctioned_count: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        });
    });
});

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access token required' });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
};

app.get('/', (req, res) => {
    res.json({ message: 'Krishna District Police API', status: 'running', version: '1.0.0' });
});

app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
        if (db.users.find(u => u.email === email)) return res.status(400).json({ error: 'User already exists' });
        const hashedPassword = await bcrypt.hash(password, 10);
        db.users.push({ id: uuidv4(), email, password: hashedPassword, created_at: new Date().toISOString() });
        res.json({ success: true, message: 'User registered successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
        const user = db.users.find(u => u.email === email);
        if (!user) return res.status(400).json({ error: 'Invalid credentials' });
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(400).json({ error: 'Invalid credentials' });
        const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ success: true, token, user: { id: user.id, email: user.email } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/personnel', authenticateToken, (req, res) => {
    res.json({ success: true, data: db.personnel, count: db.personnel.length });
});

app.get('/api/personnel/:id', authenticateToken, (req, res) => {
    const personnel = db.personnel.find(p => p.id === req.params.id);
    if (!personnel) return res.status(404).json({ error: 'Personnel not found' });
    res.json({ success: true, data: personnel });
});

app.post('/api/personnel', authenticateToken, (req, res) => {
    try {
        const personnel = { id: uuidv4(), ...req.body, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        db.personnel.push(personnel);
        res.status(201).json({ success: true, data: personnel, message: 'Personnel created successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/personnel/:id', authenticateToken, (req, res) => {
    try {
        const index = db.personnel.findIndex(p => p.id === req.params.id);
        if (index === -1) return res.status(404).json({ error: 'Personnel not found' });
        db.personnel[index] = { ...db.personnel[index], ...req.body, updated_at: new Date().toISOString() };
        res.json({ success: true, data: db.personnel[index], message: 'Personnel updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/personnel/:id', authenticateToken, (req, res) => {
    try {
        const index = db.personnel.findIndex(p => p.id === req.params.id);
        if (index === -1) return res.status(404).json({ error: 'Personnel not found' });
        db.personnel.splice(index, 1);
        res.json({ success: true, message: 'Personnel deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/personnel', authenticateToken, (req, res) => {
    db.personnel = [];
    res.json({ success: true, message: 'All personnel data cleared' });
});

app.get('/api/sanctioned-strength', authenticateToken, (req, res) => {
    res.json({ success: true, data: db.sanctionedStrength });
});

app.post('/api/sanctioned-strength', authenticateToken, (req, res) => {
    try {
        const { district, personnel_type, rank, sanctioned_count } = req.body;
        const existingIndex = db.sanctionedStrength.findIndex(s => s.district === district && s.personnel_type === personnel_type && s.rank === rank);
        if (existingIndex >= 0) {
            db.sanctionedStrength[existingIndex] = { ...db.sanctionedStrength[existingIndex], sanctioned_count, updated_at: new Date().toISOString() };
        } else {
            db.sanctionedStrength.push({ id: uuidv4(), district, personnel_type, rank, sanctioned_count, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
        }
        res.json({ success: true, message: 'Sanctioned strength updated' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/deputation-strength', authenticateToken, (req, res) => {
    res.json({ success: true, data: db.deputationStrength });
});

app.post('/api/deputation-strength', authenticateToken, (req, res) => {
    try {
        const { unit_name, rank, sanctioned_count } = req.body;
        const existingIndex = db.deputationStrength.findIndex(d => d.unit_name === unit_name && d.rank === rank);
        if (existingIndex >= 0) {
            db.deputationStrength[existingIndex] = { ...db.deputationStrength[existingIndex], sanctioned_count, updated_at: new Date().toISOString() };
        } else {
            db.deputationStrength.push({ id: uuidv4(), unit_name, rank, sanctioned_count, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
        }
        res.json({ success: true, message: 'Deputation strength updated' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});