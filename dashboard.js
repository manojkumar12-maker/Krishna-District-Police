// Dashboard and Data Display Module

async function loadAllData() {
    showToast('Loading data...', 'loading');

    try {
        // Load personnel
        const pData = await getAllPersonnel();
        allPersonnel = pData.data || [];

        // Load sanctioned strength
        const sData = await getSanctionedStrength();
        if (sData.data) {
            sData.data.forEach(s => {
                sanctionedData[s.district + '_' + s.personnel_type + '_' + s.rank] = s.sanctioned_count;
            });
        }

        // Load deputation strength
        const dData = await getDeputationStrength();
        if (dData.data) {
            dData.data.forEach(d => {
                if (!depSanctionedData[d.unit_name]) depSanctionedData[d.unit_name] = {};
                depSanctionedData[d.unit_name][d.rank] = d.sanctioned_count;
            });
        }

        updateData();
        updateUIForRole();
        showToast('Data loaded', 'success');
    } catch (e) {
        console.error('Load data error:', e);
        showToast('Error loading data', 'error');
    }
}

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
    if (pageId === 'deputation') updateDepConsolidated();
}

function updateData() {
    const erstwhileCount = allPersonnel.filter(p => p.district === 'ERSTWHILE' && !p.is_on_deployment).length;
    const newCount = allPersonnel.filter(p => p.district === 'NEW' && !p.is_on_deployment).length;
    const depCount = allPersonnel.filter(p => p.is_on_deployment).length;

    document.getElementById('erstwhileCount').textContent = erstwhileCount;
    document.getElementById('krishnaNewCount').textContent = newCount;
    document.getElementById('deputationCount').textContent = depCount;
    document.getElementById('erstwhileCivilCount').textContent = allPersonnel.filter(p => p.district === 'ERSTWHILE' && p.personnel_type === 'CIVIL' && !p.is_on_deployment).length;
    document.getElementById('erstwhileArCount').textContent = allPersonnel.filter(p => p.district === 'ERSTWHILE' && p.personnel_type === 'AR' && !p.is_on_deployment).length;
    document.getElementById('krishnaNewCivilCount').textContent = allPersonnel.filter(p => p.district === 'NEW' && p.personnel_type === 'CIVIL' && !p.is_on_deployment).length;
    document.getElementById('krishnaNewArCount').textContent = allPersonnel.filter(p => p.district === 'NEW' && p.personnel_type === 'AR' && !p.is_on_deployment).length;
    document.getElementById('dataCount').textContent = allPersonnel.length + ' records';

    if (knCurrentRank && document.getElementById('knStrengthSection')?.classList.contains('visible')) {
        refreshKNStrength();
    }
    if (ewCurrentRank && document.getElementById('ewStrengthSection')?.classList.contains('visible')) {
        refreshEWStrength();
    }
}

function updateUIForRole() {
    const isAdmin = userRole === 'ADMIN';

    const addBtn = document.querySelector('button[onclick="openAddModal()"]');
    if (addBtn) addBtn.style.display = isAdmin ? 'block' : 'none';

    const clearBtn = document.querySelector('button[onclick="clearAllData()"]');
    if (clearBtn) clearBtn.style.display = isAdmin ? 'block' : 'none';
}

function updateRankOptions() {
    const type = document.getElementById('personnelType').value;
    const district = document.getElementById('district').value;
    const isDep = document.getElementById('isOnDeputation').value;
    const rankSelect = document.getElementById('rank');
    const currentRank = rankSelect.value;

    let key;
    if (isDep === 'true') { key = 'DEP_' + type; }
    else { key = district + '_' + type; }

    const ranks = rankMap[key] || [];
    rankSelect.innerHTML = '<option value="">Select</option>' + ranks.map(r => `<option value="${r}">${r}</option>`).join('');
    if (ranks.includes(currentRank)) rankSelect.value = currentRank;
    toggleDeploymentFields();
}

function showSubData(pageKey, type, el) {
    const parent = el.parentElement;
    parent.querySelectorAll('.sub-tile').forEach(t => t.classList.remove('active'));
    el.classList.add('active');

    const district = pageKey === 'erstwhile' ? 'ERSTWHILE' : 'NEW';
    const data = allPersonnel.filter(p => p.district === district && p.personnel_type === type && !p.is_on_deployment);

    const tbody = document.getElementById(pageKey + 'TableBody');
    const detail = document.getElementById(pageKey + 'Detail');
    const table = document.getElementById(pageKey + 'Table');
    const empty = document.getElementById(pageKey + 'Empty');
    const loading = document.getElementById(pageKey + 'Loading');

    detail.classList.add('visible');
    if (loading) loading.style.display = 'none';

    if (data.length === 0) {
        table.style.display = 'none';
        empty.style.display = 'block';
        empty.textContent = 'No ' + type + ' personnel records found.';
    } else {
        table.style.display = 'table';
        empty.style.display = 'none';
        tbody.innerHTML = data.map((p, i) => {
            let actionCell = '';
            if (userRole === 'ADMIN') {
                actionCell = `<button class="action-btn btn-primary" onclick="editPersonnel('${p.id}')">Edit</button>
                             <button class="action-btn btn-danger" onclick="deletePersonnelRecord('${p.id}')">Del</button>`;
            }
            return `
            <tr>
                <td>${i+1}</td>
                <td>${p.name}</td>
                <td>${p.rank}</td>
                <td>${p.genl_no}</td>
                <td>${p.present_working || '-'}</td>
                <td style="color:${p.status === 'Present' ? 'green' : 'red'}">${p.status}</td>
                <td>
                    ${actionCell}
                </td>
            </tr>
        `;
        }).join('');
    }
}

function showKNRanks(type, el) {
    knCurrentType = type;
    const parent = el.parentElement;
    parent.querySelectorAll('.sub-tile').forEach(t => t.classList.remove('active'));
    el.classList.add('active');

    const key = 'NEW_' + type;
    const ranks = displayRanksMap[key] || [];

    document.getElementById('knRankTiles').innerHTML = ranks.map(r => 
        `<div class="rank-tile" onclick="selectKNRank('${r}', this)">${r}</div>`
    ).join('');

    document.getElementById('knRankSection').classList.add('visible');
    document.getElementById('knStrengthSection').classList.remove('visible');
    document.getElementById('knPersonnelSection').classList.remove('visible');
    document.getElementById('knPSLink').style.display = type === 'CIVIL' ? 'block' : 'none';
}

function selectKNRank(rank, el) {
    knCurrentRank = rank;
    const parent = el.parentElement;
    parent.querySelectorAll('.rank-tile').forEach(t => t.classList.remove('active'));
    el.classList.add('active');

    refreshKNStrength();
    document.getElementById('knStrengthSection').classList.add('visible');
    document.getElementById('knPersonnelSection').classList.remove('visible');
}

function refreshKNStrength() {
    const groupFilter = rankGroups[knCurrentRank] || [knCurrentRank];
    const actualCount = allPersonnel.filter(p => 
        p.district === 'NEW' && 
        p.personnel_type === knCurrentType && 
        groupFilter.includes(p.rank) && 
        !p.is_on_deployment
    ).length;

    const sancKey = 'NEW_' + knCurrentType + '_' + knCurrentRank;
    const sanctionedCount = sanctionedData[sancKey] || 0;

    document.getElementById('knStrengthTitle').textContent = knCurrentRank + ' Strength Particulars';
    document.getElementById('knActual').textContent = actualCount;
    document.getElementById('knSanctioned').textContent = sanctionedCount;
    const sancInput = document.getElementById('knSanctionedInput');
    sancInput.value = sanctionedCount;
    sancInput.style.display = userRole === 'ADMIN' ? 'inline-block' : 'none';
    updateVacancyDisplay(sanctionedCount, actualCount, 'knVacancies');
}

function updateVacancyDisplay(sanctioned, actual, elId) {
    const vac = sanctioned - actual;
    const el = document.getElementById(elId);
    if (vac > 0) { 
        el.textContent = vac; 
        el.style.color = 'var(--secondary)'; 
    }
    else if (vac < 0) { 
        el.textContent = '+' + Math.abs(vac) + ' (Excess)'; 
        el.style.color = 'orange'; 
    }
    else { 
        el.textContent = '0'; 
        el.style.color = 'green'; 
    }
}

async function saveSanctionedKN() {
    const sancKey = 'NEW_' + knCurrentType + '_' + knCurrentRank;
    const val = parseInt(document.getElementById('knSanctionedInput').value) || 0;

    try {
        await updateSanctionedStrength('NEW', knCurrentType, knCurrentRank, val);
        sanctionedData[sancKey] = val;
        refreshKNStrength();
        showToast('Sanctioned strength updated', 'success');
    } catch (e) {
        showToast('Error updating sanctioned strength', 'error');
    }
}

function showKNPersonnel() {
    const groupFilter = rankGroups[knCurrentRank] || [knCurrentRank];
    const data = allPersonnel.filter(p => 
        p.district === 'NEW' && 
        p.personnel_type === knCurrentType && 
        groupFilter.includes(p.rank) && 
        !p.is_on_deployment
    );

    document.getElementById('knSearchInput').value = '';
    renderKNPersonnel(data);
    document.getElementById('knPersonnelSection').classList.add('visible');
}

function renderKNPersonnel(data) {
    if (data.length === 0) {
        document.getElementById('knPersonnelTable').style.display = 'none';
        document.getElementById('knPersonnelEmpty').style.display = 'block';
    } else {
        document.getElementById('knPersonnelTable').style.display = 'table';
        document.getElementById('knPersonnelEmpty').style.display = 'none';
        document.getElementById('knPersonnelBody').innerHTML = data.map((p, i) => {
            let actionCell = '';
            if (userRole === 'ADMIN') {
                actionCell = `<button class="action-btn btn-primary" onclick="editPersonnel('${p.id}')">Edit</button>
                              <button class="action-btn btn-danger" onclick="deletePersonnelRecord('${p.id}')">Del</button>`;
            }
            return `
            <tr>
                <td>${i+1}</td>
                <td>${p.name}</td>
                <td>${p.genl_no}</td>
                <td>${p.present_working || '-'}</td>
                <td style="color:${p.status === 'Present' ? 'green' : 'red'}">${p.status}</td>
                <td>${actionCell}</td>
            </tr>
        `;
        }).join('');
    }
}

function filterKNPersonnel() {
    const searchTerm = document.getElementById('knSearchInput').value.toLowerCase().trim();
    const groupFilter = rankGroups[knCurrentRank] || [knCurrentRank];
    let data = allPersonnel.filter(p => 
        p.district === 'NEW' && 
        p.personnel_type === knCurrentType && 
        groupFilter.includes(p.rank) && 
        !p.is_on_deployment
    );

    if (searchTerm) {
        data = data.filter(p => 
            p.name.toLowerCase().includes(searchTerm) ||
            p.genl_no.toLowerCase().includes(searchTerm) ||
            (p.present_working && p.present_working.toLowerCase().includes(searchTerm))
        );
    }

    renderKNPersonnel(data);
}

function showEWRanks(type, el) {
    ewCurrentType = type;
    const parent = el.parentElement;
    parent.querySelectorAll('.sub-tile').forEach(t => t.classList.remove('active'));
    el.classList.add('active');

    const key = 'ERSTWHILE_' + type;
    const ranks = displayRanksMap[key] || [];

    document.getElementById('ewRankTiles').innerHTML = ranks.map(r => 
        `<div class="rank-tile" onclick="selectEWRank('${r}', this)">${r}</div>`
    ).join('');

    document.getElementById('ewRankSection').classList.add('visible');
    document.getElementById('ewStrengthSection').classList.remove('visible');
    document.getElementById('ewPersonnelSection').classList.remove('visible');
}

function selectEWRank(rank, el) {
    ewCurrentRank = rank;
    const parent = el.parentElement;
    parent.querySelectorAll('.rank-tile').forEach(t => t.classList.remove('active'));
    el.classList.add('active');

    refreshEWStrength();
    document.getElementById('ewStrengthSection').classList.add('visible');
    document.getElementById('ewPersonnelSection').classList.remove('visible');
}

function refreshEWStrength() {
    const groupFilter = rankGroups[ewCurrentRank] || [ewCurrentRank];
    const actualCount = allPersonnel.filter(p => 
        p.district === 'ERSTWHILE' && 
        p.personnel_type === ewCurrentType && 
        groupFilter.includes(p.rank) && 
        !p.is_on_deployment
    ).length;

    const sancKey = 'ERSTWHILE_' + ewCurrentType + '_' + ewCurrentRank;
    const sanctionedCount = sanctionedData[sancKey] || 0;

    document.getElementById('ewStrengthTitle').textContent = ewCurrentRank + ' Strength Particulars';
    document.getElementById('ewActual').textContent = actualCount;
    document.getElementById('ewSanctioned').textContent = sanctionedCount;
    const sancInput = document.getElementById('ewSanctionedInput');
    sancInput.value = sanctionedCount;
    sancInput.style.display = userRole === 'ADMIN' ? 'inline-block' : 'none';
    updateVacancyDisplay(sanctionedCount, actualCount, 'ewVacancies');
}

async function saveSanctionedEW() {
    const sancKey = 'ERSTWHILE_' + ewCurrentType + '_' + ewCurrentRank;
    const val = parseInt(document.getElementById('ewSanctionedInput').value) || 0;

    try {
        await updateSanctionedStrength('ERSTWHILE', ewCurrentType, ewCurrentRank, val);
        sanctionedData[sancKey] = val;
        refreshEWStrength();
        showToast('Sanctioned strength updated', 'success');
    } catch (e) {
        showToast('Error updating sanctioned strength', 'error');
    }
}

function showEWPersonnel() {
    const groupFilter = rankGroups[ewCurrentRank] || [ewCurrentRank];
    const data = allPersonnel.filter(p => 
        p.district === 'ERSTWHILE' && 
        p.personnel_type === ewCurrentType && 
        groupFilter.includes(p.rank) && 
        !p.is_on_deployment
    );

    document.getElementById('ewSearchInput').value = '';
    renderEWPersonnel(data);
    document.getElementById('ewPersonnelSection').classList.add('visible');
}

function renderEWPersonnel(data) {
    if (data.length === 0) {
        document.getElementById('ewPersonnelTable').style.display = 'none';
        document.getElementById('ewPersonnelEmpty').style.display = 'block';
    } else {
        document.getElementById('ewPersonnelTable').style.display = 'table';
        document.getElementById('ewPersonnelEmpty').style.display = 'none';
        document.getElementById('ewPersonnelBody').innerHTML = data.map((p, i) => {
            let actionCell = '';
            if (userRole === 'ADMIN') {
                actionCell = `<button class="action-btn btn-primary" onclick="editPersonnel('${p.id}')">Edit</button>
                              <button class="action-btn btn-danger" onclick="deletePersonnelRecord('${p.id}')">Del</button>`;
            }
            return `
            <tr>
                <td>${i+1}</td>
                <td>${p.name}</td>
                <td>${p.genl_no}</td>
                <td>${p.present_working || '-'}</td>
                <td style="color:${p.status === 'Present' ? 'green' : 'red'}">${p.status}</td>
                <td>${actionCell}</td>
            </tr>
        `;
        }).join('');
    }
}

function filterEWPersonnel() {
    const searchTerm = document.getElementById('ewSearchInput').value.toLowerCase().trim();
    const groupFilter = rankGroups[ewCurrentRank] || [ewCurrentRank];
    let data = allPersonnel.filter(p => 
        p.district === 'ERSTWHILE' && 
        p.personnel_type === ewCurrentType && 
        groupFilter.includes(p.rank) && 
        !p.is_on_deployment
    );

    if (searchTerm) {
        data = data.filter(p => 
            p.name.toLowerCase().includes(searchTerm) ||
            p.genl_no.toLowerCase().includes(searchTerm) ||
            (p.present_working && p.present_working.toLowerCase().includes(searchTerm))
        );
    }

    renderEWPersonnel(data);
}
