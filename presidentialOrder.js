// Presidential Order-2025 Module
// Implementation of employee allocation per Presidential Order 2025 guidelines

const PO_ERSTWHILE = 'ERSTWHILE';
const PO_NEW = 'NEW';

let poData = {};
let poExtended = {};
let poDSL = [];
let poFSL = [];
let poOptions = {};
let poAllocations = [];
let poCadres = [];
let poCadreStrength = {};
let poStage = 'init';
let poCurrentTab = 'overview';
let poObjections = {};
let poPreferentialCategories = [];

const PREF_CATEGORIES = [
    { id: 'pwbd', label: 'PwBD (70%+ disability)', priority: 1 },
    { id: 'disabled_children', label: 'Dependent mentally challenged children', priority: 2 },
    { id: 'widow', label: 'Widows (unmarried)', priority: 3 },
    { id: 'cancer', label: 'Cancer', priority: 4 },
    { id: 'neurosurgery', label: 'Major Neurosurgery', priority: 5 },
    { id: 'kidney', label: 'Kidney Transplantation', priority: 6 },
    { id: 'liver', label: 'Liver Transplantation', priority: 7 },
    { id: 'heart', label: 'Open Heart Surgery', priority: 8 }
];

const SC_ST_GROUPS = [
    { id: 'SC_1', label: 'SC Group-I (1%)', percent: 1 },
    { id: 'SC_2', label: 'SC Group-II (6.5%)', percent: 6.5 },
    { id: 'SC_3', label: 'SC Group-III (7.5%)', percent: 7.5 },
    { id: 'ST', label: 'ST (6%)', percent: 6 }
];

const PO_STAGES = ['init', 'cadre_defined', 'dsl_published', 'objection_period', 'fsl_published', 'options_open', 'allocation_done'];

function loadPOData() {
    try {
        const stored = localStorage.getItem('po_state');
        if (stored) {
            const parsed = JSON.parse(stored);
            poData = parsed.poData || {};
            poExtended = parsed.poExtended || {};
            poDSL = parsed.poDSL || [];
            poFSL = parsed.poFSL || [];
            poOptions = parsed.poOptions || {};
            poAllocations = parsed.poAllocations || [];
            poCadres = parsed.poCadres || [];
            poCadreStrength = parsed.poCadreStrength || {};
            poStage = parsed.poStage || 'init';
            poObjections = parsed.poObjections || {};
            poPreferentialCategories = parsed.poPreferentialCategories || [];
        }
    } catch(e) {
        console.error('Error loading PO data:', e);
    }
}

function savePOData() {
    localStorage.setItem('po_state', JSON.stringify({
        poData, poExtended, poDSL, poFSL, poOptions, poAllocations,
        poCadres, poCadreStrength, poStage, poObjections, poPreferentialCategories
    }));
}

function initPOModule() {
    loadPOData();

    if (poCadres.length === 0) {
        defineDefaultCadres();
    }

    renderPOModule();
}

function defineDefaultCadres() {
    const allCivRanks = rankMap['ERSTWHILE_CIVIL'] || [];
    const allARRanks = rankMap['ERSTWHILE_AR'] || [];

    const districtCadres = [
        { id: 'DC_ERSTWHILE', name: 'Erstwhile Krishna District (Residuary)', type: 'DISTRICT', level: 'DISTRICT' },
        { id: 'DC_VJA', name: 'Vijayawada District (New)', type: 'DISTRICT', level: 'DISTRICT' },
        { id: 'DC_MTM', name: 'Machilipatnam District (New)', type: 'DISTRICT', level: 'DISTRICT' }
    ];

    poCadres = [...districtCadres];

    poCadres.forEach(c => {
        allCivRanks.forEach(r => {
            poCadreStrength[c.id + '_CIVIL_' + r] = 0;
        });
        allARRanks.forEach(r => {
            poCadreStrength[c.id + '_AR_' + r] = 0;
        });
    });

    savePOData();
}

// --- Page-level entry point ---
function showPOPage() {
    loadPOData();
    if (poCadres.length === 0) defineDefaultCadres();
    renderPOModule();
}

function renderPOModule() {
    const container = document.getElementById('poMainContent');
    if (!container) return;

    const isAdmin = userRole === 'ADMIN';
    const stageLabel = { init:'Not Started', cadre_defined:'Cadres Defined', dsl_published:'DSL Published',
        objection_period:'Objection Period', fsl_published:'FSL Published', options_open:'Options Open',
        allocation_done:'Allocation Complete' }[poStage] || 'Unknown';

    container.innerHTML = `
        <div class="po-nav">
            <button class="po-nav-btn ${poCurrentTab==='overview' ? 'active' : ''}" onclick="switchPOTab('overview')">Overview</button>
            <button class="po-nav-btn ${poCurrentTab==='cadres' ? 'active' : ''}" onclick="switchPOTab('cadres')">Cadres & Strength</button>
            <button class="po-nav-btn ${poCurrentTab==='seniority' ? 'active' : ''}" onclick="switchPOTab('seniority')">Seniority List</button>
            <button class="po-nav-btn ${poCurrentTab==='options' ? 'active' : ''}" onclick="switchPOTab('options')">Option Forms</button>
            <button class="po-nav-btn ${poCurrentTab==='prefcat' ? 'active' : ''}" onclick="switchPOTab('prefcat')">Pref. Categories</button>
            <button class="po-nav-btn ${poCurrentTab==='allocation' ? 'active' : ''}" onclick="switchPOTab('allocation')">Allocation</button>
            <button class="po-nav-btn ${poCurrentTab==='orders' ? 'active' : ''}" onclick="switchPOTab('orders')">Final Orders</button>
        </div>
        <div class="po-stage-indicator">Current Stage: <strong>${stageLabel}</strong></div>
        <div id="poTabContent" class="po-tab-content"></div>
    `;

    renderCurrentPOTab();
}

function switchPOTab(tab) {
    poCurrentTab = tab;
    const btns = document.querySelectorAll('.po-nav-btn');
    btns.forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`.po-nav-btn[onclick="switchPOTab('${tab}')"]`);
    if (activeBtn) activeBtn.classList.add('active');
    renderCurrentPOTab();
}

function renderCurrentPOTab() {
    const content = document.getElementById('poTabContent');
    if (!content) return;
    switch(poCurrentTab) {
        case 'overview': renderPOOverview(content); break;
        case 'cadres': renderPOCadres(content); break;
        case 'seniority': renderPOSeniority(content); break;
        case 'options': renderPOOptions(content); break;
        case 'prefcat': renderPOPrefCat(content); break;
        case 'allocation': renderPOAllocation(content); break;
        case 'orders': renderPOOrders(content); break;
    }
}

// ==================== OVERVIEW TAB ====================
function renderPOOverview(content) {
    const isAdmin = userRole === 'ADMIN';
    const erstwhileCount = allPersonnel.filter(p => p.district === 'ERSTWHILE' && !p.is_on_deployment).length;
    const newCount = allPersonnel.filter(p => p.district === 'NEW' && !p.is_on_deployment).length;
    const hasCFMS = Object.keys(poExtended).length;
    const optionSubmitted = Object.keys(poOptions).length;
    const allocated = poAllocations.length;

    content.innerHTML = `
        <div class="card">
            <h2>Presidential Order-2025 Implementation Dashboard</h2>
            <div class="district-tiles" style="grid-template-columns: repeat(4, 1fr);">
                <div class="district-tile">
                    <h3>Total Personnel</h3>
                    <div class="tile-count">${erstwhileCount + newCount}</div>
                    <div class="tile-label">Estwhile: ${erstwhileCount} | New: ${newCount}</div>
                </div>
                <div class="district-tile" style="background:linear-gradient(135deg,#2e7d32,#1b5e20);">
                    <h3>Cadres Defined</h3>
                    <div class="tile-count">${poCadres.length}</div>
                    <div class="tile-label">District Cadres</div>
                </div>
                <div class="district-tile" style="background:linear-gradient(135deg,#ef6c00,#e65100);">
                    <h3>Extended Data</h3>
                    <div class="tile-count">${hasCFMS}</div>
                    <div class="tile-label">Personnel with CFMS/SC-ST data</div>
                </div>
                <div class="district-tile" style="background:linear-gradient(135deg,#6a1b9a,#4a148c);">
                    <h3>Options Submitted</h3>
                    <div class="tile-count">${optionSubmitted}</div>
                    <div class="tile-label">of ${erstwhileCount + newCount} employees</div>
                </div>
            </div>
            <div style="margin-top:20px;">
                <h3 style="color:var(--primary);margin-bottom:15px;">Implementation Workflow</h3>
                <div class="po-workflow">
                    <div class="po-wf-step ${['init','cadre_defined','dsl_published','objection_period','fsl_published','options_open','allocation_done'].includes(poStage) ? 'done' : ''}">
                        <div class="po-wf-num">1</div>
                        <div class="po-wf-label">Define Cadres</div>
                    </div>
                    <div class="po-wf-arrow">→</div>
                    <div class="po-wf-step ${['dsl_published','objection_period','fsl_published','options_open','allocation_done'].includes(poStage) ? 'done' : ''}">
                        <div class="po-wf-num">2</div>
                        <div class="po-wf-label">DSL Published</div>
                    </div>
                    <div class="po-wf-arrow">→</div>
                    <div class="po-wf-step ${['fsl_published','options_open','allocation_done'].includes(poStage) ? 'done' : ''}">
                        <div class="po-wf-num">3</div>
                        <div class="po-wf-label">FSL Published</div>
                    </div>
                    <div class="po-wf-arrow">→</div>
                    <div class="po-wf-step ${['options_open','allocation_done'].includes(poStage) ? 'done' : ''}">
                        <div class="po-wf-num">4</div>
                        <div class="po-wf-label">Options Open</div>
                    </div>
                    <div class="po-wf-arrow">→</div>
                    <div class="po-wf-step ${poStage==='allocation_done' ? 'done' : ''}">
                        <div class="po-wf-num">5</div>
                        <div class="po-wf-label">Allocation</div>
                    </div>
                </div>
            </div>
            ${isAdmin ? `
            <div style="margin-top:20px;display:flex;gap:10px;flex-wrap:wrap;">
                <button class="btn btn-primary" onclick="generateDSLFromPersonnel()">Generate Seniority List</button>
                <button class="btn btn-secondary" onclick="exportPOData()">Export All PO Data (CSV)</button>
                <button class="btn btn-danger" onclick="resetPOModule()">Reset PO Module</button>
            </div>` : ''}
        </div>
    `;
}

// ==================== CADRES TAB ====================
function renderPOCadres(content) {
    const isAdmin = userRole === 'ADMIN';
    let html = '';
    html += `<h3 style="color:#1565c0;margin-bottom:10px;">District Cadres (${poCadres.length})</h3>`;
    poCadres.forEach(c => {
        html += `
        <div class="card" style="margin-bottom:10px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <h4 style="margin:0;">${c.name} <span style="font-size:12px;color:#888;">[${c.id}]</span></h4>
                <div>
                    <button class="action-btn btn-primary" onclick="viewCadreStrength('${c.id}')">View Strength</button>
                    ${isAdmin ? `<button class="action-btn btn-primary" onclick="editCadreStrength('${c.id}')">Edit Strength</button>` : ''}
                </div>
            </div>
            <div id="cadreStrength_${c.id}" class="detail-section"></div>
        </div>`;
    });

    if (isAdmin) {
        html += `
        <div class="card" style="margin-top:15px;">
            <h3>Add New Cadre</h3>
            <div class="filter-row">
                <select id="newCadreLevel"><option value="DISTRICT">District</option></select>
                <input type="text" id="newCadreName" placeholder="Cadre Name">
                <input type="text" id="newCadreId" placeholder="Cadre ID (short code)">
                <button class="btn btn-primary" onclick="addNewCadre()">Add Cadre</button>
            </div>
        </div>
        <div class="card">
            <h3>Bulk Set Working Strength</h3>
            <p style="font-size:13px;color:#666;">Assign sanctioned working strength from existing personnel distribution.</p>
            <div class="filter-row">
                <select id="bulkStrengthCadre"><option value="">Select Cadre</option>${poCadres.map(c=>`<option value="${c.id}">${c.name}</option>`).join('')}</select>
                <select id="bulkStrengthType"><option value="CIVIL">Civil</option><option value="AR">AR</option></select>
                <button class="btn btn-primary" onclick="autoFillCadreStrength()">Auto-Fill from Personnel Data</button>
            </div>
        </div>`;
    }

    content.innerHTML = html;
}

function viewCadreStrength(cadreId) {
    const section = document.getElementById('cadreStrength_' + cadreId);
    if (!section) return;

    if (section.classList.contains('visible')) {
        section.classList.remove('visible');
        section.innerHTML = '';
        return;
    }

    const allCivRanks = rankMap['ERSTWHILE_CIVIL'] || [];
    const allARRanks = rankMap['ERSTWHILE_AR'] || [];

    let html = '<table class="dep-consol-table" style="margin-top:10px;">';
    html += '<thead><tr><th>Rank</th><th>Type</th><th>Sanctioned</th><th>Actual (from Personnel)</th></tr></thead><tbody>';

    const personnelInCadre = getPersonnelForCadre(cadreId);

    allCivRanks.forEach(r => {
        const key = cadreId + '_CIVIL_' + r;
        const sanctioned = poCadreStrength[key] || 0;
        const actual = personnelInCadre.filter(p => p.personnel_type === 'CIVIL' && p.rank === r).length;
        const style = sanctioned !== 0 && sanctioned !== actual ? 'color:orange;font-weight:bold;' : '';
        html += `<tr><td>${r}</td><td>CIVIL</td><td>${sanctioned}</td><td style="${style}">${actual}</td></tr>`;
    });
    allARRanks.forEach(r => {
        const key = cadreId + '_AR_' + r;
        const sanctioned = poCadreStrength[key] || 0;
        const actual = personnelInCadre.filter(p => p.personnel_type === 'AR' && p.rank === r).length;
        const style = sanctioned !== 0 && sanctioned !== actual ? 'color:orange;font-weight:bold;' : '';
        html += `<tr><td>${r}</td><td>AR</td><td>${sanctioned}</td><td style="${style}">${actual}</td></tr>`;
    });

    html += '</tbody></table>';
    section.innerHTML = html;
    section.classList.add('visible');
}

function getPersonnelForCadre(cadreId) {
    if (cadreId === 'DC_ERSTWHILE') return allPersonnel.filter(p => p.district === 'ERSTWHILE' && !p.is_on_deployment);
    if (cadreId === 'DC_VJA') return allPersonnel.filter(p => p.district === 'NEW' && !p.is_on_deployment);
    if (cadreId === 'DC_MTM') return [];
    return [];
}

function editCadreStrength(cadreId) {
    if (userRole !== 'ADMIN') { showToast('Admin only', 'error'); return; }
    const section = document.getElementById('cadreStrength_' + cadreId);
    if (!section) return;

    const allCivRanks = rankMap['ERSTWHILE_CIVIL'] || [];
    const allARRanks = rankMap['ERSTWHILE_AR'] || [];

    let html = '<table class="dep-consol-table" style="margin-top:10px;">';
    html += '<thead><tr><th>Rank</th><th>Type</th><th>Working Strength</th></tr></thead><tbody>';

    allCivRanks.forEach(r => {
        const key = cadreId + '_CIVIL_' + r;
        const val = poCadreStrength[key] || 0;
        html += `<tr><td>${r}</td><td>CIVIL</td><td><input type="number" class="po-strength-input" data-key="${key}" value="${val}" min="0" style="width:80px;padding:4px;text-align:center;"></td></tr>`;
    });
    allARRanks.forEach(r => {
        const key = cadreId + '_AR_' + r;
        const val = poCadreStrength[key] || 0;
        html += `<tr><td>${r}</td><td>AR</td><td><input type="number" class="po-strength-input" data-key="${key}" value="${val}" min="0" style="width:80px;padding:4px;text-align:center;"></td></tr>`;
    });

    html += '</tbody></table>';
    html += `<button class="btn btn-primary" style="margin-top:10px;" onclick="saveCadreStrengthEdits('${cadreId}')">Save Working Strength</button>`;

    section.innerHTML = html;
    section.classList.add('visible');
}

function saveCadreStrengthEdits(cadreId) {
    const inputs = document.querySelectorAll('.po-strength-input');
    inputs.forEach(inp => {
        poCadreStrength[inp.dataset.key] = parseInt(inp.value) || 0;
    });
    savePOData();
    if (poStage === 'init') poStage = 'cadre_defined';
    savePOData();
    showToast('Cadre working strength saved', 'success');
    renderPOModule();
}

function addNewCadre() {
    if (userRole !== 'ADMIN') return;
    const level = document.getElementById('newCadreLevel').value;
    const name = document.getElementById('newCadreName').value.trim();
    const id = document.getElementById('newCadreId').value.trim();
    if (!name || !id) { showToast('Fill all fields', 'error'); return; }

    poCadres.push({ id, name, type: level, level });
    const allCivRanks = rankMap['ERSTWHILE_CIVIL'] || [];
    const allARRanks = rankMap['ERSTWHILE_AR'] || [];
    allCivRanks.forEach(r => { poCadreStrength[id + '_CIVIL_' + r] = 0; });
    allARRanks.forEach(r => { poCadreStrength[id + '_AR_' + r] = 0; });
    savePOData();
    renderPOModule();
    showToast('Cadre added', 'success');
}

function autoFillCadreStrength() {
    if (userRole !== 'ADMIN') return;
    const cadreId = document.getElementById('bulkStrengthCadre').value;
    const type = document.getElementById('bulkStrengthType').value;
    if (!cadreId) { showToast('Select a cadre', 'error'); return; }

    const personnel = getPersonnelForCadre(cadreId).filter(p => p.personnel_type === type);
    const ranks = type === 'CIVIL' ? (rankMap['ERSTWHILE_CIVIL'] || []) : (rankMap['ERSTWHILE_AR'] || []);
    ranks.forEach(r => {
        const count = personnel.filter(p => p.rank === r).length;
        poCadreStrength[cadreId + '_' + type + '_' + r] = count;
    });
    savePOData();
    showToast('Strength auto-filled from personnel counts', 'success');
    renderPOModule();
}

// ==================== SENIORITY LIST TAB ====================
function renderPOSeniority(content) {
    const isAdmin = userRole === 'ADMIN';
    const stageText = { init:'Not Started', cadre_defined:'DSL not yet generated', dsl_published:'DSL Published',
        objection_period:'Objection Period Open', fsl_published:'FSL Published', options_open:'Options Open',
        allocation_done:'Allocation Complete' }[poStage] || '';

    let dslCount = poDSL.length;
    let fslCount = poFSL.length;
    let objCount = Object.keys(poObjections).length;

    content.innerHTML = `
        <div class="card">
            <h2>Seniority List Management</h2>
            <p style="color:#666;">Status: <strong>${stageText}</strong></p>
            <div class="district-tiles" style="grid-template-columns: repeat(3, 1fr);margin:15px 0;">
                <div class="district-tile">
                    <h3>DSL Records</h3><div class="tile-count">${dslCount}</div>
                </div>
                <div class="district-tile" style="background:linear-gradient(135deg,#2e7d32,#1b5e20);">
                    <h3>Objections</h3><div class="tile-count">${objCount}</div>
                </div>
                <div class="district-tile" style="background:linear-gradient(135deg,#ef6c00,#e65100);">
                    <h3>FSL Records</h3><div class="tile-count">${fslCount}</div>
                </div>
            </div>
            ${isAdmin ? `
            <div style="display:flex;gap:10px;margin-bottom:15px;flex-wrap:wrap;">
                <button class="btn btn-primary" onclick="generateDSLFromPersonnel()">Generate DSL from Personnel</button>
                ${dslCount > 0 && poStage === 'cadre_defined' ? `<button class="btn btn-primary" onclick="publishDSL()">Publish DSL (Start 5-day Objection Period)</button>` : ''}
                ${poStage === 'objection_period' ? `<button class="btn btn-primary" onclick="publishFSL()">Close Objections & Publish FSL</button>` : ''}
                ${poStage === 'fsl_published' ? `<button class="btn btn-primary" onclick="openOptionsPhase()">Open Option Form Phase</button>` : ''}
            </div>` : ''}
            <div id="poSeniorityContent"></div>
        </div>
    `;

    renderSeniorityTable();
}

function generateDSLFromPersonnel() {
    if (userRole !== 'ADMIN') { showToast('Admin only', 'error'); return; }
    if (allPersonnel.length === 0) { showToast('No personnel data available', 'error'); return; }

    const personnel = allPersonnel.filter(p => !p.is_on_deployment);

    poDSL = personnel.map((p, i) => {
        const ext = poExtended[p.id] || {};
        return {
            id: p.id,
            name: p.name,
            gender: p.gender || '-',
            cfms_id: ext.cfms_id || '',
            mobile: p.phone_number || '',
            date_of_birth: p.date_of_birth || '',
            date_of_joining: ext.date_of_joining || p.date_of_promotion || '',
            sc_st_group: ext.sc_st_group || '',
            rank: p.rank,
            personnel_type: p.personnel_type,
            district: p.district,
            present_working: p.present_working || '',
            status: p.status,
            is_on_deployment: p.is_on_deployment,
            seniority_no: ext.seniority_no || (i + 1)
        };
    });

    poDSL.sort((a, b) => a.seniority_no - b.seniority_no);
    poStage = 'dsl_published';
    savePOData();
    showToast('DSL generated with ' + poDSL.length + ' records', 'success');
    renderPOModule();
}

function publishDSL() {
    if (userRole !== 'ADMIN') return;
    poStage = 'objection_period';
    savePOData();
    showToast('DSL published. 5-day objection period started.', 'success');
    renderPOModule();
}

function publishFSL() {
    if (userRole !== 'ADMIN') return;
    poFSL = [...poDSL];

    const currentUserEmail = localStorage.getItem('userEmail') || 'admin';
    const resolved = [];
    const rejected = [];
    Object.entries(poObjections).forEach(([id, obj]) => {
        if (obj.resolution === 'accepted') resolved.push(id);
        else rejected.push(id);
    });

    poFSL = poFSL.map(p => {
        const obj = poObjections[p.id];
        const resolution = obj ? obj.resolution || 'pending' : 'none';
        return { ...p, objection: obj ? obj.reason : '', objection_resolution: resolution };
    });

    poStage = 'fsl_published';
    savePOData();
    showToast('FSL published. Resolved ' + resolved.length + ' accepted, ' + rejected.length + ' rejected.', 'success');
    renderPOModule();
}

function openOptionsPhase() {
    if (userRole !== 'ADMIN') return;
    poStage = 'options_open';
    savePOData();
    showToast('Option form phase opened. Employees can now submit preferences.', 'success');
    renderPOModule();
}

function renderSeniorityTable() {
    const container = document.getElementById('poSeniorityContent');
    if (!container) return;

    const list = poFSL.length > 0 ? poFSL : poDSL;
    if (list.length === 0) {
        container.innerHTML = '<div class="empty-state">No seniority list generated yet. Click "Generate DSL from Personnel" to create one.</div>';
        return;
    }

    const isAdmin = userRole === 'ADMIN';
    const showFsl = poFSL.length > 0;

    let html = `<div class="search-box" style="margin-bottom:10px;">
        <input type="text" id="poSenioritySearch" class="search-input" placeholder="Search by name, rank, CFMS ID, or mobile..." oninput="filterPOSeniority()">
    </div>
    <div style="overflow-x:auto;">
    <table>
        <thead>
            <tr>
                <th>Sr.No</th><th>Name</th><th>Gender</th><th>CFMS ID</th><th>Mobile</th>
                <th>DOB</th><th>DOJ</th><th>Rank</th><th>Type</th><th>District</th>
                <th>SC/ST</th><th>Present Working</th><th>Status</th>
                ${showFsl ? '<th>Objection</th><th>Resolution</th>' : ''}
                <th>Actions</th>
            </tr>
        </thead>
        <tbody>`;

    list.forEach((p, i) => {
        const doj = p.date_of_joining ? new Date(p.date_of_joining).toLocaleDateString('en-IN') : '-';
        const dob = p.date_of_birth ? new Date(p.date_of_birth).toLocaleDateString('en-IN') : '-';
        const scst = SC_ST_GROUPS.find(g => g.id === p.sc_st_group);
        const scstLabel = scst ? scst.label : '-';

        let objectionCol = '';
        if (showFsl) {
            objectionCol = `<td style="font-size:11px;">${p.objection || '-'}</td><td style="font-size:11px;color:${p.objection_resolution==='accepted'?'green':p.objection_resolution==='rejected'?'red':'#888'}">${p.objection_resolution || '-'}</td>`;
        }

        html += `<tr>
            <td>${p.seniority_no}</td>
            <td>${p.name}</td>
            <td>${p.gender}</td>
            <td>${p.cfms_id || '-'}</td>
            <td>${p.mobile || '-'}</td>
            <td>${dob}</td>
            <td>${doj}</td>
            <td>${p.rank}</td>
            <td>${p.personnel_type}</td>
            <td>${p.district === 'ERSTWHILE' ? 'Erstwhile' : 'Krishna New'}</td>
            <td>${scstLabel}</td>
            <td>${p.present_working || '-'}</td>
            <td style="color:${p.status==='Present'?'green':'red'}">${p.status}</td>
            ${objectionCol}
            <td>
                ${isAdmin ? `<button class="action-btn btn-primary" onclick="editPOExtended('${p.id}')">Edit</button>` : ''}
                ${poStage === 'objection_period' && isAdmin ? `<button class="action-btn" style="background:#ef6c00;color:white;" onclick="addObjection('${p.id}')">Object</button>` : ''}
            </td>
        </tr>`;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
}

function filterPOSeniority() {
    const search = document.getElementById('poSenioritySearch').value.toLowerCase().trim();
    const container = document.getElementById('poSeniorityContent');
    if (!container) return;

    const list = poFSL.length > 0 ? poFSL : poDSL;
    let filtered = list;
    if (search) {
        filtered = list.filter(p =>
            p.name.toLowerCase().includes(search) ||
            p.rank.toLowerCase().includes(search) ||
            (p.cfms_id && p.cfms_id.toLowerCase().includes(search)) ||
            (p.mobile && p.mobile.includes(search))
        );
    }

    const isAdmin = userRole === 'ADMIN';
    const showFsl = poFSL.length > 0;
    const tbody = container.querySelector('tbody');
    if (!tbody) return;

    tbody.innerHTML = filtered.map((p, i) => {
        const doj = p.date_of_joining ? new Date(p.date_of_joining).toLocaleDateString('en-IN') : '-';
        const dob = p.date_of_birth ? new Date(p.date_of_birth).toLocaleDateString('en-IN') : '-';
        const scst = SC_ST_GROUPS.find(g => g.id === p.sc_st_group);
        const scstLabel = scst ? scst.label : '-';

        let objectionCol = '';
        if (showFsl) {
            objectionCol = `<td style="font-size:11px;">${p.objection || '-'}</td><td style="font-size:11px;color:${p.objection_resolution==='accepted'?'green':p.objection_resolution==='rejected'?'red':'#888'}">${p.objection_resolution || '-'}</td>`;
        }

        return `<tr>
            <td>${p.seniority_no}</td>
            <td>${p.name}</td>
            <td>${p.gender}</td>
            <td>${p.cfms_id || '-'}</td>
            <td>${p.mobile || '-'}</td>
            <td>${dob}</td>
            <td>${doj}</td>
            <td>${p.rank}</td>
            <td>${p.personnel_type}</td>
            <td>${p.district === 'ERSTWHILE' ? 'Erstwhile' : 'Krishna New'}</td>
            <td>${scstLabel}</td>
            <td>${p.present_working || '-'}</td>
            <td style="color:${p.status==='Present'?'green':'red'}">${p.status}</td>
            ${objectionCol}
            <td>
                ${isAdmin ? `<button class="action-btn btn-primary" onclick="editPOExtended('${p.id}')">Edit</button>` : ''}
            </td>
        </tr>`;
    }).join('');
}

function editPOExtended(persId) {
    if (userRole !== 'ADMIN') return;
    const ext = poExtended[persId] || {};
    const pers = allPersonnel.find(p => p.id == persId);
    if (!pers) return;

    const scstOpts = SC_ST_GROUPS.map(g => `<option value="${g.id}" ${ext.sc_st_group===g.id?'selected':''}>${g.label}</option>`).join('');

    const dialog = document.createElement('div');
    dialog.className = 'modal-overlay';
    dialog.style.display = 'flex';
    dialog.innerHTML = `
        <div class="modal" style="max-width:550px;">
            <div class="modal-header">
                <h3>Extended Data: ${pers.name}</h3>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="form-grid" style="grid-template-columns: 1fr 1fr;">
                    <div class="form-group"><label>CFMS ID</label><input type="text" id="poedit_cfms" value="${ext.cfms_id || ''}"></div>
                    <div class="form-group"><label>Mobile</label><input type="text" id="poedit_mobile" value="${ext.mobile || pers.phone_number || ''}"></div>
                    <div class="form-group"><label>Date of Joining</label><input type="date" id="poedit_doj" value="${ext.date_of_joining || pers.date_of_promotion || ''}"></div>
                    <div class="form-group"><label>Seniority No.</label><input type="number" id="poedit_srno" value="${ext.seniority_no || ''}" min="1"></div>
                    <div class="form-group"><label>SC/ST Group</label><select id="poedit_scst"><option value="">None</option>${scstOpts}</select></div>
                </div>
                <h4 style="margin-top:15px;color:var(--primary);">Preferential Categories</h4>
                <div class="form-grid" style="grid-template-columns: 1fr 1fr;">
                    ${PREF_CATEGORIES.map(pc => {
                        const checked = ext[pc.id] ? 'checked' : '';
                        return `<div class="form-group" style="display:flex;align-items:center;gap:8px;">
                            <input type="checkbox" id="poedit_${pc.id}" ${checked}>
                            <label for="poedit_${pc.id}" style="margin:0;">${pc.label}</label>
                        </div>`;
                    }).join('')}
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                <button class="btn btn-primary" onclick="savePOExtended('${persId}')">Save</button>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);
}

function savePOExtended(persId) {
    const ext = poExtended[persId] || {};
    ext.cfms_id = document.getElementById('poedit_cfms').value.trim();
    ext.mobile = document.getElementById('poedit_mobile').value.trim();
    ext.date_of_joining = document.getElementById('poedit_doj').value;
    ext.seniority_no = parseInt(document.getElementById('poedit_srno').value) || 0;
    ext.sc_st_group = document.getElementById('poedit_scst').value;

    PREF_CATEGORIES.forEach(pc => {
        ext[pc.id] = document.getElementById('poedit_' + pc.id).checked;
    });

    poExtended[persId] = ext;
    savePOData();

    document.querySelector('.modal-overlay').remove();
    showToast('Extended data saved', 'success');

    // Refresh seniority list if visible
    if (poDSL.length > 0) {
        const sIdx = poDSL.findIndex(p => p.id == persId);
        if (sIdx >= 0) {
            poDSL[sIdx].cfms_id = ext.cfms_id || '';
            poDSL[sIdx].mobile = ext.mobile || poDSL[sIdx].mobile;
            poDSL[sIdx].date_of_joining = ext.date_of_joining || poDSL[sIdx].date_of_joining;
            poDSL[sIdx].seniority_no = ext.seniority_no || poDSL[sIdx].seniority_no;
            poDSL[sIdx].sc_st_group = ext.sc_st_group || '';
            savePOData();
        }
    }
    renderSeniorityTable();
}

function addObjection(persId) {
    if (userRole !== 'ADMIN') return;
    const reason = prompt('Enter objection reason for this employee:');
    if (!reason) return;
    const resolution = confirm('Accept this objection? Click OK to accept, Cancel to reject.') ? 'accepted' : 'rejected';
    poObjections[persId] = { reason, resolution, timestamp: new Date().toISOString() };
    savePOData();
    showToast('Objection recorded (' + resolution + ')', 'success');
    renderPOModule();
}

// ==================== OPTION FORMS TAB ====================
function renderPOOptions(content) {
    const isAdmin = userRole === 'ADMIN';
    const list = poFSL.length > 0 ? poFSL : poDSL;
    const submitted = Object.keys(poOptions).length;

    let cadreOpts = poCadres.map(c => `<option value="${c.id}">${c.name} (${c.level})</option>`).join('');

    content.innerHTML = `
        <div class="card">
            <h2>Option Forms (Annexure-II)</h2>
            <p style="color:#666;">
                Options Submitted: <strong>${submitted}</strong> of <strong>${list.length}</strong> employees
                ${poStage === 'options_open' ? '<span style="color:green;"> (Phase Open)</span>' : ''}
            </p>
            ${isAdmin && poStage === 'options_open' ? `
            <div style="margin:15px 0;display:flex;gap:10px;flex-wrap:wrap;">
                <button class="btn btn-secondary" onclick="bulkInitOptions()">Initialize Options for All</button>
            </div>` : ''}
            <div class="search-box" style="margin-bottom:10px;">
                <input type="text" id="poOptionSearch" class="search-input" placeholder="Search by name..." oninput="filterPOOptions()">
            </div>
            <div style="overflow-x:auto;" id="poOptionsTableContainer">
                ${renderOptionsTable(list, cadreOpts, isAdmin, submitted)}
            </div>
        </div>
    `;
}

function renderOptionsTable(list, cadreOpts, isAdmin, submitted) {
    if (list.length === 0) return '<div class="empty-state">Generate FSL first and open option phase.</div>';

    let html = '<table><thead><tr><th>Sr.No</th><th>Name</th><th>Rank</th><th>District</th><th>Preference 1</th><th>Preference 2</th><th>Preference 3</th><th>Submitted</th></tr></thead><tbody>';

    list.forEach(p => {
        const opt = poOptions[p.id] || {};
        const pref1 = opt.pref1 || '-';
        const pref2 = opt.pref2 || '-';
        const pref3 = opt.pref3 || '-';
        const sub = opt.submitted ? '✓' : '✗';
        const subColor = opt.submitted ? 'green' : 'red';

        html += `<tr>
            <td>${p.seniority_no}</td>
            <td>${p.name}</td>
            <td>${p.rank}</td>
            <td>${p.district === 'ERSTWHILE' ? 'Erstwhile' : 'Krishna New'}</td>
            <td>${pref1}</td>
            <td>${pref2}</td>
            <td>${pref3}</td>
            <td style="color:${subColor};font-weight:bold;">${sub}</td>
        </tr>`;
    });

    html += '</tbody></table>';
    return html;
}

function filterPOOptions() {
    const search = document.getElementById('poOptionSearch').value.toLowerCase().trim();
    const container = document.getElementById('poOptionsTableContainer');
    if (!container) return;
    const list = poFSL.length > 0 ? poFSL : poDSL;
    const filtered = search ? list.filter(p => p.name.toLowerCase().includes(search)) : list;
    const cadreOpts = poCadres.map(c => `<option value="${c.id}">${c.name} (${c.level})</option>`).join('');
    const isAdmin = userRole === 'ADMIN';
    container.innerHTML = renderOptionsTable(filtered, cadreOpts, isAdmin, Object.keys(poOptions).length);
}

function bulkInitOptions() {
    if (userRole !== 'ADMIN') return;
    const list = poFSL.length > 0 ? poFSL : poDSL;
    if (list.length === 0) return;

    if (!confirm('This will randomly assign first 3 cadre preferences for ' + list.length + ' employees. Continue?')) return;

    const districtCadres = poCadres.filter(c => c.level === 'DISTRICT').map(c => c.id);
    list.forEach((p, i) => {
        if (poOptions[p.id] && poOptions[p.id].submitted) return;
        const shuffled = [...districtCadres].sort(() => Math.random() - 0.5);
        poOptions[p.id] = {
            pref1: shuffled[0] || '',
            pref2: shuffled[1] || '',
            pref3: shuffled[2] || '',
            submitted: true,
            submittedAt: new Date().toISOString()
        };
    });
    savePOData();
    showToast('Options initialized for eligible employees', 'success');
    renderPOModule();
}

// ==================== PREFERENTIAL CATEGORIES TAB ====================
function renderPOPrefCat(content) {
    const isAdmin = userRole === 'ADMIN';
    const list = poFSL.length > 0 ? poFSL : poDSL;

    let prefCounts = {};
    PREF_CATEGORIES.forEach(pc => { prefCounts[pc.id] = 0; });

    list.forEach(p => {
        const ext = poExtended[p.id] || {};
        PREF_CATEGORIES.forEach(pc => {
            if (ext[pc.id]) prefCounts[pc.id]++;
        });
    });

    let html = '<div class="card"><h2>Preferential Categories</h2>';
    html += '<p style="color:#666;margin-bottom:15px;">Priority order for allocation (as per Para 4.4 of Presidential Order 2025)</p>';

    html += '<table><thead><tr><th>Priority</th><th>Category</th><th>Count</th></tr></thead><tbody>';
    PREF_CATEGORIES.forEach(pc => {
        html += `<tr><td>${pc.priority}</td><td>${pc.label}</td><td>${prefCounts[pc.id]}</td></tr>`;
    });
    html += '</tbody></table>';

    html += '<h3 style="margin-top:20px;color:var(--primary);">Employees in Preferential Categories</h3>';
    html += '<div class="search-box" style="margin-bottom:10px;"><input type="text" id="poPrefSearch" class="search-input" placeholder="Search by name..." oninput="filterPOPrefCat()"></div>';
    html += '<div style="overflow-x:auto;" id="poPrefTableContainer">';

    const prefEntries = list.filter(p => {
        const ext = poExtended[p.id] || {};
        return PREF_CATEGORIES.some(pc => ext[pc.id]);
    });

    if (prefEntries.length === 0) {
        html += '<div class="empty-state">No employees identified in preferential categories. Edit extended data in Seniority List tab.</div>';
    } else {
        html += '<table><thead><tr><th>Sr.No</th><th>Name</th><th>Rank</th><th>District</th>';
        PREF_CATEGORIES.forEach(pc => { html += `<th>${pc.label}</th>`; });
        html += '</tr></thead><tbody>';

        prefEntries.forEach(p => {
            const ext = poExtended[p.id] || {};
            html += `<tr><td>${p.seniority_no}</td><td>${p.name}</td><td>${p.rank}</td><td>${p.district==='ERSTWHILE'?'Erstwhile':'Krishna New'}</td>`;
            PREF_CATEGORIES.forEach(pc => {
                html += `<td style="text-align:center;">${ext[pc.id] ? '✓' : '-'}</td>`;
            });
            html += '</tr>';
        });
        html += '</tbody></table>';
    }

    html += '</div></div>';
    content.innerHTML = html;
}

function filterPOPrefCat() {
    const search = document.getElementById('poPrefSearch').value.toLowerCase().trim();
    const container = document.getElementById('poPrefTableContainer');
    if (!container) return;
    const list = poFSL.length > 0 ? poFSL : poDSL;
    let prefEntries = list.filter(p => {
        const ext = poExtended[p.id] || {};
        return PREF_CATEGORIES.some(pc => ext[pc.id]);
    });
    if (search) prefEntries = prefEntries.filter(p => p.name.toLowerCase().includes(search));

    if (prefEntries.length === 0) {
        container.innerHTML = '<div class="empty-state">No matching employees found.</div>';
        return;
    }

    let html = '<table><thead><tr><th>Sr.No</th><th>Name</th><th>Rank</th><th>District</th>';
    PREF_CATEGORIES.forEach(pc => { html += `<th>${pc.label}</th>`; });
    html += '</tr></thead><tbody>';

    prefEntries.forEach(p => {
        const ext = poExtended[p.id] || {};
        html += `<tr><td>${p.seniority_no}</td><td>${p.name}</td><td>${p.rank}</td><td>${p.district==='ERSTWHILE'?'Erstwhile':'Krishna New'}</td>`;
        PREF_CATEGORIES.forEach(pc => {
            html += `<td style="text-align:center;">${ext[pc.id] ? '✓' : '-'}</td>`;
        });
        html += '</tr>';
    });
    html += '</tbody></table>';
    container.innerHTML = html;
}

// ==================== ALLOCATION TAB ====================
function renderPOAllocation(content) {
    const isAdmin = userRole === 'ADMIN';
    const allocated = poAllocations.length;
    const list = poFSL.length > 0 ? poFSL : poDSL;

    content.innerHTML = `
        <div class="card">
            <h2>Allocation of Persons (Stage III & IV)</h2>
            <div class="district-tiles" style="grid-template-columns: repeat(3, 1fr);margin:15px 0;">
                <div class="district-tile">
                    <h3>Eligible Employees</h3><div class="tile-count">${list.length}</div>
                </div>
                <div class="district-tile" style="background:linear-gradient(135deg,#2e7d32,#1b5e20);">
                    <h3>Options Submitted</h3><div class="tile-count">${Object.keys(poOptions).length}</div>
                </div>
                <div class="district-tile" style="background:linear-gradient(135deg,#6a1b9a,#4a148c);">
                    <h3>Allocated</h3><div class="tile-count">${allocated}</div>
                </div>
            </div>
            ${isAdmin ? `
            <div style="display:flex;gap:10px;margin-bottom:15px;flex-wrap:wrap;">
                <button class="btn btn-primary" onclick="runAllocation()">Run Allocation Algorithm</button>
                ${allocated > 0 ? `<button class="btn btn-secondary" onclick="exportFAL()">Export FAL (Annexure-III)</button>` : ''}
            </div>` : ''}
            <div id="poAllocationContent">
                ${allocated > 0 ? renderAllocationTable() : '<div class="empty-state">Allocation not yet performed. Click "Run Allocation Algorithm" to process.</div>'}
            </div>
        </div>
    `;
}

function runAllocation() {
    if (userRole !== 'ADMIN') { showToast('Admin only', 'error'); return; }
    const list = poFSL.length > 0 ? poFSL : poDSL;
    if (list.length === 0) { showToast('No seniority list available', 'error'); return; }

    showToast('Running allocation algorithm...', 'loading');

    poAllocations = [];
    const districtCadres = poCadres.filter(c => c.level === 'DISTRICT');

    // Step 1: Identify employees in preferential categories (in priority order)
    const prefEmployees = [];
    const nonPrefEmployees = [];

    list.forEach(p => {
        const ext = poExtended[p.id] || {};
        let prefCat = null;
        for (const pc of PREF_CATEGORIES) {
            if (ext[pc.id]) { prefCat = pc; break; }
        }
        if (prefCat) {
            prefEmployees.push({ ...p, prefCategory: prefCat });
        } else {
            nonPrefEmployees.push(p);
        }
    });

    // Sort preferential by priority
    prefEmployees.sort((a, b) => a.prefCategory.priority - b.prefCategory.priority || a.seniority_no - b.seniority_no);

    // Sort non-preferential by seniority
    nonPrefEmployees.sort((a, b) => a.seniority_no - b.seniority_no);

    const allEligible = [...prefEmployees, ...nonPrefEmployees];

    // Initialize cadre vacancy tracking (per rank + type)
    const cadreVacancies = {};
    districtCadres.forEach(c => {
        cadreVacancies[c.id] = {};
        const allRanks = [...(rankMap['ERSTWHILE_CIVIL'] || []), ...(rankMap['ERSTWHILE_AR'] || [])];
        allRanks.forEach(r => {
            cadreVacancies[c.id][r + '_CIVIL'] = poCadreStrength[c.id + '_CIVIL_' + r] || 0;
            cadreVacancies[c.id][r + '_AR'] = poCadreStrength[c.id + '_AR_' + r] || 0;
        });
    });

    // Allocate each employee
    allEligible.forEach(emp => {
        const opt = poOptions[emp.id];
        let allocatedCadre = null;
        let allocMethod = 'none';

        const hrKey = emp.rank + '_' + emp.personnel_type;

        // Try preferences in order
        if (opt && opt.pref1) {
            const prefs = [opt.pref1, opt.pref2, opt.pref3].filter(Boolean);
            for (const pref of prefs) {
                if (!cadreVacancies[pref]) continue;
                const vac = cadreVacancies[pref][hrKey];
                if (vac !== undefined && vac > 0) {
                    cadreVacancies[pref][hrKey]--;
                    allocatedCadre = pref;
                    allocMethod = emp.prefCategory ? 'preferential_option' : 'seniority_option';
                    break;
                }
            }
        }

        // Compulsory allocation - find any cadre with vacancy for this rank+type
        if (!allocatedCadre) {
            for (const c of districtCadres) {
                const vac = cadreVacancies[c.id][hrKey];
                if (vac !== undefined && vac > 0) {
                    cadreVacancies[c.id][hrKey]--;
                    allocatedCadre = c.id;
                    allocMethod = emp.prefCategory ? 'preferential_compulsory' : 'compulsory';
                    break;
                }
            }
        }

        // If still no allocation, assign to first cadre (overallocation)
        if (!allocatedCadre && districtCadres.length > 0) {
            allocatedCadre = districtCadres[0].id;
            allocMethod = 'over_allocation';
        }

        const cadre = poCadres.find(c => c.id === allocatedCadre);
        poAllocations.push({
            personnel_id: emp.id,
            name: emp.name,
            rank: emp.rank,
            personnel_type: emp.personnel_type,
            district: emp.district,
            seniority_no: emp.seniority_no,
            sc_st_group: emp.sc_st_group || '',
            pref_category: emp.prefCategory ? emp.prefCategory.id : '',
            pref_category_label: emp.prefCategory ? emp.prefCategory.label : '',
            option_pref1: opt ? opt.pref1 : '',
            option_pref2: opt ? opt.pref2 : '',
            option_pref3: opt ? opt.pref3 : '',
            allocated_cadre_id: allocatedCadre,
            allocated_cadre_name: cadre ? cadre.name : 'Unallocated',
            allocation_method: allocMethod,
            allocated_at: new Date().toISOString()
        });
    });

    // SC/ST proportionate distribution review
    reviewSCSTDistribution(districtCadres);

    poStage = 'allocation_done';
    savePOData();

    // Summary
    const byCadre = {};
    poAllocations.forEach(a => {
        if (!byCadre[a.allocated_cadre_name]) byCadre[a.allocated_cadre_name] = 0;
        byCadre[a.allocated_cadre_name]++;
    });

    let summary = 'Allocation complete!\n';
    Object.entries(byCadre).forEach(([name, count]) => {
        summary += name + ': ' + count + ' employees\n';
    });

    showToast(summary, 'success');
    renderPOModule();
}

function reviewSCSTDistribution(districtCadres) {
    districtCadres.forEach(cadre => {
        const cadreAllocs = poAllocations.filter(a => a.allocated_cadre_id === cadre.id);
        const total = cadreAllocs.length;
        if (total === 0) return;

        SC_ST_GROUPS.forEach(group => {
            const groupCount = cadreAllocs.filter(a => a.sc_st_group === group.id).length;
            const targetCount = Math.round(total * group.percent / 100);
            const shortfall = targetCount - groupCount;

            if (shortfall > 0) {
                const nonMatchingInCadre = cadreAllocs.filter(a => a.sc_st_group !== group.id && !a.pref_category);
                const eligibleFromOther = poAllocations.filter(a =>
                    a.allocated_cadre_id !== cadre.id &&
                    a.sc_st_group === group.id &&
                    !a.pref_category &&
                    a.rank === nonMatchingInCadre[0]?.rank
                );

                for (let i = 0; i < Math.min(shortfall, eligibleFromOther.length); i++) {
                    const toMove = eligibleFromOther[i];
                    const toSwap = nonMatchingInCadre[i];
                    if (toMove && toSwap) {
                        const tempCadre = toMove.allocated_cadre_id;
                        toMove.allocated_cadre_id = toSwap.allocated_cadre_id;
                        toMove.allocated_cadre_name = toSwap.allocated_cadre_name;
                        toSwap.allocated_cadre_id = tempCadre;
                        toSwap.allocated_cadre_name = (poCadres.find(c => c.id === tempCadre) || {}).name || '';
                        toMove.sc_st_adjustment = true;
                        toSwap.sc_st_adjustment = true;
                    }
                }
            }
        });
    });

    savePOData();
}

function renderAllocationTable() {
    if (poAllocations.length === 0) return '<div class="empty-state">No allocations yet.</div>';

    const byCadre = {};
    poAllocations.forEach(a => {
        if (!byCadre[a.allocated_cadre_name]) byCadre[a.allocated_cadre_name] = [];
        byCadre[a.allocated_cadre_name].push(a);
    });

    let html = '';
    for (const [cadreName, allocs] of Object.entries(byCadre)) {
        html += `<h3 style="color:var(--primary);margin-top:15px;">${cadreName} (${allocs.length} allocated)</h3>`;
        html += '<table><thead><tr><th>Sr.No</th><th>Name</th><th>Rank</th><th>Type</th><th>Pref.Cat</th><th>Option 1</th><th>Allot Method</th><th>SC/ST</th></tr></thead><tbody>';
        allocs.forEach(a => {
            const methodColor = { preferential_option: 'green', preferential_compulsory: '#1565c0', seniority_option: '#333', compulsory: '#ef6c00', over_allocation: 'red' }[a.allocation_method] || '#333';
            const scst = SC_ST_GROUPS.find(g => g.id === a.sc_st_group);
            const scstLabel = scst ? scst.label : '-';
            html += `<tr>
                <td>${a.seniority_no}</td>
                <td>${a.name}</td>
                <td>${a.rank}</td>
                <td>${a.personnel_type}</td>
                <td>${a.pref_category_label || '-'}</td>
                <td>${a.option_pref1 || '-'}</td>
                <td style="color:${methodColor};font-weight:500;">${a.allocation_method.replace(/_/g,' ')}</td>
                <td>${scstLabel}</td>
            </tr>`;
        });
        html += '</tbody></table>';
    }
    return html;
}

function exportFAL() {
    if (poAllocations.length === 0) { showToast('No allocations to export', 'error'); return; }

    let csv = 'Final Allocation List (Annexure-III) - Presidential Order 2025\n\n';
    csv += 'Cadre,Seniority No.,Name,Rank,Type,SC/ST Group,Preferential Category,Preference 1,Preference 2,Preference 3,Allocation Method\n';
    poAllocations.forEach(a => {
        csv += `"${a.allocated_cadre_name}",${a.seniority_no},"${a.name}","${a.rank}","${a.personnel_type}","${a.sc_st_group}","${a.pref_category_label}","${a.option_pref1}","${a.option_pref2}","${a.option_pref3}","${a.allocation_method}"\n`;
    });

    downloadFile(csv, 'FAL_Presidential_Order_2025.csv', 'text/csv');
    showToast('FAL exported to CSV', 'success');
}

// ==================== ORDERS TAB (Stage V) ====================
function renderPOOrders(content) {
    const isAdmin = userRole === 'ADMIN';
    const allocated = poAllocations.length;

    content.innerHTML = `
        <div class="card">
            <h2>Final Orders (Stage V)</h2>
            ${allocated === 0 ? '<div class="empty-state">Run allocation first to generate orders.</div>' : `
            <div class="district-tiles" style="grid-template-columns: repeat(3, 1fr);margin:15px 0;">
                <div class="district-tile"><h3>Total Allocated</h3><div class="tile-count">${allocated}</div></div>
                <div class="district-tile" style="background:linear-gradient(135deg,#2e7d32,#1b5e20);"><h3>OOA Ready</h3><div class="tile-count">${allocated}</div></div>
                <div class="district-tile" style="background:linear-gradient(135deg,#ef6c00,#e65100);"><h3>OOT Needed</h3><div class="tile-count">${poAllocations.filter(a => a.allocated_cadre_id !== 'DC_ERSTWHILE' && a.district === 'ERSTWHILE').length + poAllocations.filter(a => a.allocated_cadre_id === 'DC_VJA' && a.district !== 'NEW').length}</div></div>
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
                <button class="btn btn-primary" onclick="exportOOA()">Export OOA (Annexure-IV)</button>
                <button class="btn btn-primary" onclick="exportOOT()">Export OOT</button>
                <button class="btn btn-secondary" onclick="viewAllocationSummary()">View Summary</button>
                <button class="btn btn-secondary" onclick="exportPOPrintFormat()">Print-Ready Format</button>
            </div>
            `}
            <div id="poOrdersContent" style="margin-top:15px;"></div>
        </div>
    `;
}

function viewAllocationSummary() {
    const container = document.getElementById('poOrdersContent');
    if (!container) return;

    const byCadre = {};
    const byMethod = {};
    poAllocations.forEach(a => {
        if (!byCadre[a.allocated_cadre_name]) byCadre[a.allocated_cadre_name] = [];
        byCadre[a.allocated_cadre_name].push(a);
        byMethod[a.allocation_method] = (byMethod[a.allocation_method] || 0) + 1;
    });

    let html = '<h3 style="color:var(--primary);">Allocation Summary</h3>';

    html += '<table><thead><tr><th>Cadre</th><th>Allocated</th><th>Pref. Categories</th><th>Seniority Options</th><th>Compulsory</th></tr></thead><tbody>';
    for (const [cadre, allocs] of Object.entries(byCadre)) {
        const prefCount = allocs.filter(a => a.pref_category).length;
        const senCount = allocs.filter(a => a.allocation_method === 'seniority_option').length;
        const compCount = allocs.filter(a => a.allocation_method.includes('compulsory') || a.allocation_method === 'over_allocation').length;
        html += `<tr><td>${cadre}</td><td>${allocs.length}</td><td>${prefCount}</td><td>${senCount}</td><td>${compCount}</td></tr>`;
    }
    html += '</tbody></table>';

    container.innerHTML = html;
    container.classList.add('visible');
}

function exportOOA() {
    if (poAllocations.length === 0) { showToast('No allocations to export', 'error'); return; }

    let csv = 'Orders of Allotment (Annexure-IV) - Presidential Order 2025\n\n';
    csv += 'SI.No,Name,Rank,Type,Seniority No.,Allocated Cadre,Allocation Method,SC/ST Group,Preferential Category,Option 1,Option 2,Option 3\n';
    poAllocations.forEach((a, i) => {
        csv += `${i+1},"${a.name}","${a.rank}","${a.personnel_type}",${a.seniority_no},"${a.allocated_cadre_name}","${a.allocation_method}","${a.sc_st_group}","${a.pref_category_label}","${a.option_pref1}","${a.option_pref2}","${a.option_pref3}"\n`;
    });

    downloadFile(csv, 'OOA_Annexure_IV.csv', 'text/csv');
    showToast('OOA exported to CSV', 'success');
}

function exportOOT() {
    if (poAllocations.length === 0) { showToast('No allocations to export', 'error'); return; }

    let csv = 'Orders of Transfer (OOT) - Presidential Order 2025\n\n';
    csv += 'SI.No,Name,Rank,Type,Allocated Cadre,Original District,Transfer Required,Date\n';
    poAllocations.forEach((a, i) => {
        let transferNeeded = 'No';
        if ((a.district === 'ERSTWHILE' && a.allocated_cadre_id !== 'DC_ERSTWHILE') ||
            (a.district === 'NEW' && a.allocated_cadre_id !== 'DC_VJA')) {
            transferNeeded = 'Yes';
        }
        csv += `${i+1},"${a.name}","${a.rank}","${a.personnel_type}","${a.allocated_cadre_name}","${a.district}","${transferNeeded}","${new Date().toISOString().slice(0,10)}"\n`;
    });

    downloadFile(csv, 'OOT_Presidential_Order_2025.csv', 'text/csv');
    showToast('OOT exported to CSV', 'success');
}

function exportPOPrintFormat() {
    if (poAllocations.length === 0) { showToast('No data', 'error'); return; }

    const byCadre = {};
    poAllocations.forEach(a => {
        if (!byCadre[a.allocated_cadre_name]) byCadre[a.allocated_cadre_name] = [];
        byCadre[a.allocated_cadre_name].push(a);
    });

    let html = '';
    for (const [cadre, allocs] of Object.entries(byCadre)) {
        html += `<h2>Cadre: ${cadre}</h2>`;
        html += `<p>Total Allocated: ${allocs.length}</p>`;
        html += '<table><thead><tr><th>SI.No</th><th>Name</th><th>Rank</th><th>Type</th><th>Seniority No.</th><th>Pref.Cat</th><th>SC/ST</th><th>Method</th></tr></thead><tbody>';
        allocs.forEach((a, i) => {
            html += `<tr><td>${i+1}</td><td>${a.name}</td><td>${a.rank}</td><td>${a.personnel_type}</td><td>${a.seniority_no}</td><td>${a.pref_category_label || '-'}</td><td>${a.sc_st_group || '-'}</td><td>${a.allocation_method.replace(/_/g,' ')}</td></tr>`;
        });
        html += '</tbody></table><br>';
    }

    const printWind = window.open('', '', 'width=1000,height=700');
    printWind.document.write(`
        <!DOCTYPE html><html><head><title>Presidential Order 2025 - Allotment</title>
        <style>
            body { font-family:serif;padding:30px; }
            h1 { text-align:center; }
            table { width:100%;border-collapse:collapse;margin-top:10px;font-size:13px; }
            th, td { border:1px solid #000;padding:6px;text-align:left; }
            th { background:#e0e0e0; }
            @media print { .no-print { display:none; } }
        </style></head><body>
            <h1>Presidential Order 2025 - Final Allocation List</h1>
            <h3 style="text-align:center;">Krishna District Police</h3>
            ${html}
            <br><button class="no-print" onclick="window.print()">Print</button>
        </body></html>
    `);
    printWind.document.close();
}

// ==================== EXPORT / RESET ====================
function exportPOData() {
    if (Object.keys(poExtended).length === 0 && poAllocations.length === 0) {
        showToast('No PO data to export', 'error');
        return;
    }

    let csv = 'Presidential Order 2025 - Complete Data Export\n\n';

    if (poAllocations.length > 0) {
        csv += '--- Final Allocation List ---\n';
        csv += 'SI.No,Name,Rank,Type,Seniority No.,Allocated Cadre,Allocation Method,SC/ST,Pref.Category,Option1,Option2,Option3\n';
        poAllocations.forEach((a, i) => {
            csv += `${i+1},"${a.name}","${a.rank}","${a.personnel_type}",${a.seniority_no},"${a.allocated_cadre_name}","${a.allocation_method}","${a.sc_st_group}","${a.pref_category_label}","${a.option_pref1}","${a.option_pref2}","${a.option_pref3}"\n`;
        });
    }

    csv += '\n--- Extended Personnel Data ---\n';
    csv += 'Name,CFMS ID,SC/ST Group,Seniority No.,DOJ\n';
    Object.entries(poExtended).forEach(([id, ext]) => {
        const pers = allPersonnel.find(p => p.id == id);
        csv += `"${pers ? pers.name : id}",${ext.cfms_id || ''},${ext.sc_st_group || ''},${ext.seniority_no || ''},${ext.date_of_joining || ''}\n`;
    });

    downloadFile(csv, 'PO2025_Complete_Data.csv', 'text/csv');
    showToast('PO data exported to CSV', 'success');
}

function resetPOModule() {
    if (userRole !== 'ADMIN') { showToast('Admin only', 'error'); return; }
    if (!confirm('Reset all Presidential Order data? This cannot be undone.')) return;
    if (!confirm('Are you sure? All cadres, seniority lists, options, and allocations will be cleared.')) return;

    poData = {};
    poExtended = {};
    poDSL = [];
    poFSL = [];
    poOptions = {};
    poAllocations = [];
    poCadres = [];
    poCadreStrength = {};
    poStage = 'init';
    poObjections = {};
    poPreferentialCategories = [];
    poCurrentTab = 'overview';
    savePOData();
    defineDefaultCadres();
    renderPOModule();
    showToast('PO module reset', 'success');
}

// Initialize from existing showPage flow
const origShowPage = showPage;
showPage = function(pageId) {
    origShowPage(pageId);
    if (pageId === 'presidentialOrder') {
        showPOPage();
    }
};

// Attach to window
window.initPOModule = initPOModule;
window.showPOPage = showPOPage;
window.switchPOTab = switchPOTab;
window.renderCurrentPOTab = renderCurrentPOTab;
window.viewCadreStrength = viewCadreStrength;
window.editCadreStrength = editCadreStrength;
window.saveCadreStrengthEdits = saveCadreStrengthEdits;
window.addNewCadre = addNewCadre;
window.autoFillCadreStrength = autoFillCadreStrength;
window.generateDSLFromPersonnel = generateDSLFromPersonnel;
window.publishDSL = publishDSL;
window.publishFSL = publishFSL;
window.openOptionsPhase = openOptionsPhase;
window.editPOExtended = editPOExtended;
window.savePOExtended = savePOExtended;
window.addObjection = addObjection;
window.bulkInitOptions = bulkInitOptions;
window.filterPOSeniority = filterPOSeniority;
window.filterPOOptions = filterPOOptions;
window.filterPOPrefCat = filterPOPrefCat;
window.runAllocation = runAllocation;
window.exportFAL = exportFAL;
window.exportOOA = exportOOA;
window.exportOOT = exportOOT;
window.viewAllocationSummary = viewAllocationSummary;
window.exportPOPrintFormat = exportPOPrintFormat;
window.exportPOData = exportPOData;
window.resetPOModule = resetPOModule;
window.downloadFile = downloadFile;
