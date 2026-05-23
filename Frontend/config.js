// Backend API URL - Update this with your Render deployment URL
const API_BASE_URL = 'https://your-render-app.onrender.com/api';

// Rank mappings
const rankMap = {
    'NEW_CIVIL': ['PC','WPC','HC','WHC','ASI','WASI','SI','WSI','CI','WCI','DSP','ADDL.SP'],
    'NEW_AR': ['ARPC','ARWPC','ARHC','ARWHC','ARSI','WARSI','RSI','WRSI','RI','WRI','ARDSP','ADDL.SP.AR'],
    'ERSTWHILE_CIVIL': ['PC','WPC','HC','WHC','ASI','WASI'],
    'ERSTWHILE_AR': ['ARPC','ARWPC','ARHC','ARWHC','ARSI','WARSI'],
    'DEP_CIVIL': ['PC','WPC','HC','WHC','ASI','WASI'],
    'DEP_AR': ['ARPC','ARWPC','ARHC','ARWHC']
};

const displayRanksMap = {
    'NEW_CIVIL': ['PC & WPC','HC & WHC','ASI & WASI','SI & WSI','CI & WCI','DSP','ADDL.SP'],
    'NEW_AR': ['ARPC & ARWPC','ARHC & ARWHC','ARSI & WARSI','RSI & WRSI','RI & WRI','ARDSP','ADDL.SP.AR']
};

const rankGroups = {
    'PC & WPC': ['PC', 'WPC'], 'HC & WHC': ['HC', 'WHC'], 'ASI & WASI': ['ASI', 'WASI'],
    'SI & WSI': ['SI', 'WSI'], 'CI & WCI': ['CI', 'WCI'], 'DSP': ['DSP'],
    'ADDL.SP': ['ADDL.SP'], 'ARPC & ARWPC': ['ARPC', 'ARWPC'],
    'ARHC & ARWHC': ['ARHC', 'ARWHC'], 'ARSI & WARSI': ['ARSI', 'WARSI'],
    'RSI & WRSI': ['RSI', 'WRSI'], 'RI & WRI': ['RI', 'WRI'],
    'ARDSP': ['ARDSP'], 'ADDL.SP.AR': ['ADDL.SP.AR']
};

const depRanks = ['PC', 'HC', 'ASI', 'ARPC', 'ARHC'];

const depUnits = [
    'GRP., Vijayawada', 'Intelligence Dept, VJA.', 'I.S.W.', 'I.S.W. (CMSG)',
    'R.I.O., SPL. Intelligence Cell', 'C.I.D. A.P., Mangalagiri',
    'Vigilance and Enforcement', 'A.P., Transco', 'A.P., Genco',
    'A.C.B., Vijayawada', 'Grey Hounds', 'Octopus', 'APPA., Hyderabad',
    'Police Computer Service', 'CBI. Visakhapatnam', 'Drugs Control Administration',
    'Eagle', 'CSPS, Visakhapatnam', 'EOW-II, Mangalagiri'
];

// Global state
let allPersonnel = [];
let sanctionedData = {};
let depSanctionedData = {};
let editingId = null;
let knCurrentType = '';
let knCurrentRank = '';
let depCurrentUnit = '';
let authMode = 'login';
let authToken = localStorage.getItem('authToken') || null;