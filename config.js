// Backend API URL - Update this with your Render deployment URL
const API_BASE_URL = 'https://krishna-district-police.onrender.com/api';

// Rank mappings
const rankMap = {
    'NEW_CIVIL': ['PC','WPC','HC','WHC','ASI','WASI','SI','WSI','CI','WCI','DSP','ADDL.SP'],
    'NEW_AR': ['ARPC','ARWPC','ARHC','ARWHC','ARSI','WARSI','RSI','WRSI','RI','WRI','ARDSP','ADDL.SP.AR'],
    'ERSTWHILE_CIVIL': ['PC','WPC','HC','WHC','ASI','WASI','SI','WSI','CI','WCI','DSP','ADDL.SP'],
    'ERSTWHILE_AR': ['ARPC','ARWPC','ARHC','ARWHC','ARSI','WARSI','RSI','WRSI','RI','WRI','ARDSP','ADDL.SP.AR'],
    'DEP_CIVIL': ['PC','WPC','HC','WHC','ASI','WASI'],
    'DEP_AR': ['ARPC','ARWPC','ARHC','ARWHC']
};

const displayRanksMap = {
    'NEW_CIVIL': ['PC & WPC','HC & WHC','ASI & WASI','SI & WSI','CI & WCI','DSP','ADDL.SP'],
    'NEW_AR': ['ARPC & ARWPC','ARHC & ARWHC','ARSI & WARSI','RSI & WRSI','RI & WRI','ARDSP','ADDL.SP.AR'],
    'ERSTWHILE_CIVIL': ['PC & WPC','HC & WHC','ASI & WASI','SI & WSI','CI & WCI','DSP','ADDL.SP'],
    'ERSTWHILE_AR': ['ARPC & ARWPC','ARHC & ARWHC','ARSI & WARSI','RSI & WRSI','RI & WRI','ARDSP','ADDL.SP.AR']
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

// Police Station hierarchy data
const psHierarchy = {
    'BANDAR SUB-DIVISION': [
        { name: 'BANDAR CIRCLE', isUPS: false, stations: ['Machilipatnam Town PS', 'Machilipatnam Rural PS', 'Pedana PS', 'Bantumilli PS'] },
        { name: 'BANTUMILLI CIRCLE (UPS)', isUPS: true, stations: [] },
    ],
    'AVANIGADDA SUB-DIVISION': [
        { name: 'AVANIGADDA CIRCLE', isUPS: false, stations: ['Avanigadda PS', 'Nagayalanka PS', 'Koduru PS', 'Movva PS', 'Challapalli PS'] },
        { name: 'DIVI CIRCLE (UPS)', isUPS: true, stations: [] },
    ],
    'GUDIVADA SUB-DIVISION': [
        { name: 'GUDIVADA CIRCLE', isUPS: false, stations: ['Gudivada Town PS', 'Gudivada Rural PS', 'Nandivada PS'] },
        { name: 'KAIKALURU CIRCLE', isUPS: false, stations: ['Kaikaluru PS', 'Mudinepalli PS'] },
    ],
    'GANNAVARAM SUB-DIVISION': [
        { name: 'GANNAVARAM CIRCLE', isUPS: false, stations: ['Gannavaram Town PS', 'Gannavaram Rural PS', 'Agiripalli PS', 'Kankipadu PS'] },
        { name: 'AGIRIPALLI CIRCLE (UPS)', isUPS: true, stations: [] },
    ],
    'FUNCTIONAL (HEAD QUARTER POSTS)': [
        { name: 'DPO', isUPS: true, stations: [] },
        { name: 'AR HQ', isUPS: true, stations: [] },
        { name: 'Police Transport', isUPS: true, stations: [] },
        { name: 'Computer Centre', isUPS: true, stations: [] },
    ],
};

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
let ewCurrentType = '';
let ewCurrentRank = '';
let depCurrentUnit = '';
let authToken = localStorage.getItem('authToken') || null;
let userRole = localStorage.getItem('userRole') || null;
