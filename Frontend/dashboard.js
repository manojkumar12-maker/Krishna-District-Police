// Dashboard and Data Display Module

async function loadAllData() {
    showToast('Loading data...', 'loading');
    try {
        const pData = await getAllPersonnel();
        allPersonnel = pData.data || [];
        const sData = await getSanctionedStrength();
        if (sData.data) {
            sData.data.forEach(s => {
                sanctionedData[s.district + '_' + s.personnel_type + '_' + s.rank] = s.sanctioned_count;
            });
        }
        const dData = await getDeputationStrength();
        if (dData.data) {
            dData.data.forEach(d => {
                if (!depSanctionedData[d.unit_name]) depSanctionedData[d.unit_name] = {};
                depSanctionedData[d.unit_name][d.rank] = d.sanctioned_count;
            });
        }
        updateData();
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
    document.getElementById('dataCount').textContent = allPersonnel.length + ' records';
    if (knCurrentRank && document.getElementById('knStrengthSection')?.classList.contains('visible')) {
        refreshKNStrength();
    }
}

function updateRankOptions() {
    const type = document.getElementById('personnelType').value;
    const district = document.getElementById('district').value;
    const isDep = document.getElementById('isOnDeputation').value;
    const rankSelect = document.getElementById('rank');
    const currentRank = rankSelect.value;
    let key = isDep === 'true' ? 'DEP_' + type : district + '_' + type;
    const ranks = rankMap[key] || [];
    rankSelect.innerHTML = '<option value="">Select</option>' + ranks.map(r => `<option value="${r}">${r}</option>`).join('');
    if (ranks.includes(currentRank)) rankSelect.value = currentRank;
    toggleDeploymentFields();
}

function selectKNRank(rank, el) {
    knCurrentRank = rank;
    const parent = el.parentElement;
    parent.querySelectorAll('.rank-tile').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    refreshKNStrength();
    document.getElementById('knStrengthSection').classList.add('visible');
}

function refreshKNStrength() {
    const groupFilter = rankGroups[knCurrentRank] || [knCurrentRank];
    const actualCount = allPersonnel.filter(p => p.district === 'NEW' && p.personnel_type === knCurrentType && groupFilter.includes(p.rank) && !p.is_on_deployment).length;
    const sancKey = 'NEW_' + knCurrentType + '_' + knCurrentRank;
    const sanctionedCount = sanctionedData[sancKey] || 0;
    document.getElementById('knStrengthTitle').textContent = knCurrentRank + ' Strength Particulars';
    document.getElementById('knActual').textContent = actualCount;
    document.getElementById('knSanctioned').textContent = sanctionedCount;
    updateVacancyDisplay(sanctionedCount, actualCount, 'knVacancies');
}

function updateVacancyDisplay(sanctioned, actual, elId) {
    const vac = sanctioned - actual;
    const el = document.getElementById(elId);
    if (vac > 0) { el.textContent = vac; el.style.color = 'var(--secondary)'; }
    else if (vac < 0) { el.textContent = '+' + Math.abs(vac) + ' (Excess)'; el.style.color = 'orange'; }
    else { el.textContent = '0'; el.style.color = 'green'; }
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