const API_BASE_URL = 'https://YOUR-RENDER-URL.onrender.com/api';

const rankMap = {
    'NEW_CIVIL': ['PC','WPC','HC','WHC','ASI','WASI','SI','WSI','CI','WCI','DSP','ADDL.SP'],
    'NEW_AR': ['ARPC','ARWPC','ARHC','ARWHC','ARSI','WARSI','RSI','WRSI','RI','WRI','ARDSP','ADDL.SP.AR'],
    'ERSTWHILE_CIVIL': ['PC','WPC','HC','WHC','ASI','WASI'],
    'ERSTWHILE_AR': ['ARPC','ARWPC','ARHC','ARWHC','ARSI','WARSI'],
    'DEP_CIVIL': ['PC','WPC','HC','WHC','ASI','WASI'],
    'DEP_AR': ['ARPC','ARWPC','ARHC','ARWHC']
};

const depUnits = [
    'GRP., Vijayawada', 'Intelligence Dept, VJA.', 'I.S.W.', 'I.S.W. (CMSG)',
    'R.I.O., SPL. Intelligence Cell', 'C.I.D. A.P., Mangalagiri',
    'Vigilance and Enforcement', 'A.P., Transco', 'A.P., Genco',
    'A.C.B., Vijayawada', 'Grey Hounds', 'Octopus', 'APPA., Hyderabad',
    'Police Computer Service', 'CBI. Visakhapatnam', 'Drugs Control Administration',
    'Eagle', 'CSPS, Visakhapatnam', 'EOW-II, Mangalagiri'
];

const depRanks = ['PC', 'HC', 'ASI', 'ARPC', 'ARHC'];

let allPersonnel = [];
let sanctionedData = {};
let depSanctionedData = {};
let editingId = null;
let authMode = 'login';
let authToken = localStorage.getItem('authToken') || null;