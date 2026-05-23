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
        showToast('Error loading data', 'error');
    }
}

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
    if (pageId === 'deputation') updateDepConsolidated();
}

function updateData() {
    const newCivil = allPersonnel.filter(p => p.district === 'NEW' && p.personnel_type === 'CIVIL' && !p.is_on_deployment).length;
    const newAr = allPersonnel.filter(p => p.district === 'NEW' && p.personnel_type === 'AR' && !p.is_on_deployment).length;
    const depCount = allPersonnel.filter(p => p.is_on_deployment).length;
    document.getElementById('krishnaNewCivilCount').textContent = newCivil;
    document.getElementById('krishnaNewArCount').textContent = newAr;
    document.getElementById('deputationCount').textContent = depCount;
    document.getElementById('dataCount').textContent = allPersonnel.length + ' records';
}

function updateRankOptions() {
    const type = document.getElementById('personnelType').value;
    const district = document.getElementById('district').value;
    const isDep = document.getElementById('isOnDeputation').value;
    const rankSelect = document.getElementById('rank');
    let key = isDep === 'true' ? 'DEP_' + type : district + '_' + type;
    const ranks = rankMap[key] || [];
    rankSelect.innerHTML = '<option value="">Select</option>' + ranks.map(r => `<option value="${r}">${r}</option>`).join('');
    toggleDeploymentFields();
}

function toggleDeploymentFields() {
    const isOnDeployment = document.getElementById('isOnDeputation').value === 'true';
    document.getElementById('deploymentUnitGroup').style.display = isOnDeployment ? 'block' : 'none';
    document.getElementById('presentWorkingGroup').style.display = !isOnDeployment ? 'block' : 'none';
    if (!isOnDeployment) {
        document.getElementById('deploymentUnit').value = '';
    }
}

function showKNRanks(type, el) {
    const parent = el.parentElement;
    parent.querySelectorAll('.district-tile').forEach(t => t.style.opacity = '0.5');
    el.style.opacity = '1';
    showPage('personnel');
}

function showDepUnitsPage() {
    const tiles = depUnits.map(unit => `<div class="sub-tile" onclick="showDepUnit('${unit}', this)">${unit}</div>`).join('');
    document.getElementById('depUnitTiles').innerHTML = tiles;
    showPage('deputation');
}