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
        { name: 'Chilakalapudi UPS', isUPS: true, stations: [] },
        { name: 'Inaguduru UPS', isUPS: true, stations: [] },
        { name: 'Robertsonpet UPS', isUPS: true, stations: [] },
        { name: 'Bandar Taluk PS', isUPS: false, stations: [] },
        { name: 'Machilipatnam PS', isUPS: false, stations: [] },
        { name: 'Bandar Traffic PS', isUPS: false, stations: [] },
        { name: 'Bandar Rural Circle @ Pedana Circle:', isUPS: false, stations: ['Pedana PS', 'Bantumilli PS', 'Kruthivennu PS', 'Guduru PS'] },
    ],
    'AVANIGADDA SUB-DIVISION': [
        { name: 'Avanigadda Circle:', isUPS: false, stations: ['Avanigadda PS', 'Koduru PS', 'Nagayalanka PS'] },
        { name: 'Challapalli Circle:', isUPS: false, stations: ['Challapalli PS', 'Ghantasala PS'] },
    ],
    'GUDIVADA SUB-DIVISION': [
        { name: 'Gudivada Town Circle:', isUPS: false, stations: ['Gudivada I Town PS', 'Gudivada II Town PS', 'Gudivada Traffic PS'] },
        { name: 'Gudivada Rural Circle:', isUPS: false, stations: ['Gudivada Taluk PS', 'Nandivada PS', 'Gudlavalleru PS'] },
        { name: 'Pamarru Circle:', isUPS: false, stations: ['Pamarru PS', 'Kuchipudi PS', 'Pedaparupudi PS'] },
        { name: 'Pamidimukkala Circle', isUPS: false, stations: ['Pamidimukkala PS', 'Thotlavalluru PS'] },
    ],
    'GANNAVARAM SUB-DIVISION': [
        { name: 'Gannavaram UPS', isUPS: true, stations: [] },
        { name: 'Unguturu PS', isUPS: false, stations: [] },
        { name: 'Gannavaram Traffic UPS', isUPS: true, stations: [] },
        { name: 'Penamaluru UPS', isUPS: true, stations: [] },
        { name: 'Penamaluru Crime PS', isUPS: false, stations: [] },
        { name: 'Vuyyuru Town UPS', isUPS: true, stations: [] },
        { name: 'H.Junction Circle:', isUPS: false, stations: ['H.Junction PS', 'Veeravalli PS', 'Atkuru PS'] },
        { name: 'Kankipadu Circle:', isUPS: false, stations: ['Kankipadu PS', 'Vuyyuru Rural PS'] },
    ],
    'FUNCTIONAL (HEAD QUARTER POSTS)': [
        { name: 'DSB, Krishna', isUPS: false, stations: [] },
        { name: 'DCRB, Krishna', isUPS: false, stations: [] },
        { name: 'DTRB, Krishna', isUPS: false, stations: [] },
        { name: 'PCR, Krishna', isUPS: false, stations: [] },
        { name: 'Women PS', isUPS: false, stations: [] },
        { name: 'CCS, Machilipatnam', isUPS: false, stations: [] },
        { name: 'CCS, Gudivada', isUPS: false, stations: [] },
        { name: 'SC/ST Cell', isUPS: false, stations: [] },
        { name: 'D.T.C., MTM', isUPS: false, stations: [] },
        { name: 'Cyber Crime', isUPS: false, stations: [] },
        { name: 'AIRPORT', isUPS: false, stations: [] },
        { name: 'VR., KRISHNA', isUPS: false, stations: [] },
    ],
};

const depUnits = [
    'GRP., Vijayawada', 'Intelligence Dept, VJA.', 'I.S.W.', 'I.S.W. (CMSG)',
    'R.I.O., SPL. Intelligence Cell', 'C.I.D. A.P., Mangalagiri', 'EOW-II, Mangalagiri',
    'Vigilance and Enforcement', 'A.P., Transco', 'A.P., Genco',
    'A.C.B., Vijayawada', 'CBI. Visakhapatnam', 'Grey Hounds', 'Octopus', 'APPA., Hyderabad',
    'Police Computer Service', 'Drugs Control Administration',
    'Eagle', 'CSPS, Visakhapatnam'
];

const depUnitGroups = {
    'A.C.B., Vijayawada': ['A.C.B., Vijayawada', 'CBI. Visakhapatnam'],
    'C.I.D. A.P., Mangalagiri': ['C.I.D. A.P., Mangalagiri', 'EOW-II, Mangalagiri'],
    'Intelligence Dept, VJA.': ['Intelligence Dept, VJA.', 'I.S.W.', 'I.S.W. (CMSG)', 'R.I.O., SPL. Intelligence Cell']
};

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
