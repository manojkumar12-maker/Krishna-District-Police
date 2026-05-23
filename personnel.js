function openAddModal() {
    document.getElementById('personnelModal').style.display = 'flex';
    document.getElementById('modalTitle').textContent = 'Add Personnel';
    document.getElementById('personnelId').value = '';
    document.getElementById('name').value = '';
    document.getElementById('rank').value = '';
    document.getElementById('genlNo').value = '';
    document.getElementById('personnelType').value = 'CIVIL';
    document.getElementById('district').value = 'NEW';
    document.getElementById('status').value = 'Present';
    document.getElementById('presentWorking').value = '';
    document.getElementById('isOnDeputation').value = 'false';
    document.getElementById('deploymentUnit').value = '';
    document.getElementById('phoneNumber').value = '';
    populateDeploymentUnits();
    updateRankOptions();
}

function closeModal() {
    document.getElementById('personnelModal').style.display = 'none';
}

function populateDeploymentUnits() {
    const select = document.getElementById('deploymentUnit');
    select.innerHTML = '<option value="">Select Unit</option>' + depUnits.map(u => `<option value="${u}">${u}</option>`).join('');
}

async function savePersonnel() {
    const personnelId = document.getElementById('personnelId').value;
    const name = document.getElementById('name').value.trim();
    const rank = document.getElementById('rank').value;
    const genlNo = document.getElementById('genlNo').value.trim();
    const personnelType = document.getElementById('personnelType').value;
    const district = document.getElementById('district').value;
    const status = document.getElementById('status').value;
    const presentWorking = document.getElementById('presentWorking').value.trim() || null;
    const isOnDeployment = document.getElementById('isOnDeputation').value === 'true';
    const deploymentUnit = document.getElementById('deploymentUnit').value || null;
    const phoneNumber = document.getElementById('phoneNumber').value.trim() || null;

    if (!name || !rank || !genlNo || !personnelType || !district) {
        showToast('Please fill all required fields', 'error');
        return;
    }

    const personnelData = {
        name, rank, genl_no: genlNo, personnel_type: personnelType, district,
        status, present_working: presentWorking,
        is_on_deployment: isOnDeployment, deployment_unit: deploymentUnit, phone_number: phoneNumber
    };

    try {
        if (personnelId) {
            await updatePersonnel(personnelId, personnelData);
        } else {
            await createPersonnel(personnelData);
        }
        closeModal();
        await loadAllData();
        showToast('Personnel saved successfully', 'success');
    } catch (error) {
        showToast('Error saving personnel', 'error');
    }
}

async function editPersonnel(id) {
    try {
        const result = await getPersonnelById(id);
        const personnel = result.data;
        document.getElementById('personnelModal').style.display = 'flex';
        document.getElementById('modalTitle').textContent = 'Edit Personnel';
        document.getElementById('personnelId').value = personnel.id;
        document.getElementById('name').value = personnel.name;
        document.getElementById('rank').value = personnel.rank;
        document.getElementById('genlNo').value = personnel.genl_no;
        document.getElementById('personnelType').value = personnel.personnel_type;
        document.getElementById('district').value = personnel.district;
        document.getElementById('status').value = personnel.status;
        document.getElementById('presentWorking').value = personnel.present_working || '';
        document.getElementById('isOnDeputation').value = personnel.is_on_deployment ? 'true' : 'false';
        document.getElementById('deploymentUnit').value = personnel.deployment_unit || '';
        document.getElementById('phoneNumber').value = personnel.phone_number || '';
        populateDeploymentUnits();
        updateRankOptions();
    } catch (error) {
        showToast('Error loading personnel data', 'error');
    }
}

async function deletePersonnelRecord(id) {
    if (!confirm('Delete this record?')) return;
    try {
        await deletePersonnel(id);
        await loadAllData();
        showToast('Personnel deleted', 'success');
    } catch (error) {
        showToast('Error deleting personnel', 'error');
    }
}