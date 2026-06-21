// Personnel Management Module

function openAddModal() {
    if (userRole !== 'ADMIN') {
        showToast('Only administrators can add personnel', 'error');
        return;
    }

    document.getElementById('personnelModal').style.display = 'flex';
    document.getElementById('modalTitle').textContent = 'Add Personnel';
    document.getElementById('personnelId').value = '';

    // Reset all fields
    document.getElementById('name').value = '';
    document.getElementById('rank').value = '';
    document.getElementById('genlNo').value = '';
    document.getElementById('personnelType').value = 'CIVIL';
    document.getElementById('district').value = 'ERSTWHILE';
    document.getElementById('gender').value = '';
    document.getElementById('previousStation').value = '';
    document.getElementById('status').value = 'Present';
    document.getElementById('dateOfBirth').value = '';
    document.getElementById('caste').value = '';
    document.getElementById('education').value = '';
    document.getElementById('dateOfPromotion').value = '';
    document.getElementById('presentWorking').value = '';
    document.getElementById('isOnDeputation').value = 'false';
    document.getElementById('deploymentUnit').value = '';
    document.getElementById('dateOfDeployment').value = '';
    document.getElementById('punishments').value = '';
    document.getElementById('phoneNumber').value = '';

    updateRankOptions();
    toggleDeploymentFields();
}

function closeModal() {
    document.getElementById('personnelModal').style.display = 'none';
}

function toggleDeploymentFields() {
    const isOnDeployment = document.getElementById('isOnDeputation').value === 'true';
    document.getElementById('deploymentUnitGroup').style.display = isOnDeployment ? 'block' : 'none';
    document.getElementById('deploymentDateGroup').style.display = isOnDeployment ? 'block' : 'none';
    document.getElementById('presentWorkingGroup').style.display = !isOnDeployment ? 'block' : 'none';

    if (!isOnDeployment) {
        document.getElementById('deploymentUnit').value = '';
        document.getElementById('dateOfDeployment').value = '';
    } else {
        document.getElementById('presentWorking').value = '';
    }
}

async function savePersonnel() {
    if (userRole !== 'ADMIN') {
        showToast('Only administrators can modify personnel data', 'error');
        return;
    }

    const personnelId = document.getElementById('personnelId').value;
    const name = document.getElementById('name').value.trim();
    const rank = document.getElementById('rank').value;
    const genlNo = document.getElementById('genlNo').value.trim();
    const personnelType = document.getElementById('personnelType').value;
    const district = document.getElementById('district').value;
    const gender = document.getElementById('gender').value || null;
    const previousStation = document.getElementById('previousStation').value.trim();
    const status = document.getElementById('status').value;
    const dateOfBirth = document.getElementById('dateOfBirth').value || null;
    const caste = document.getElementById('caste').value.trim() || null;
    const education = document.getElementById('education').value.trim() || null;
    const dateOfPromotion = document.getElementById('dateOfPromotion').value || null;
    const presentWorking = document.getElementById('presentWorking').value.trim() || null;
    const isOnDeployment = document.getElementById('isOnDeputation').value === 'true';
    const deploymentUnit = document.getElementById('deploymentUnit').value || null;
    const dateOfDeployment = document.getElementById('dateOfDeployment').value || null;
    const punishments = document.getElementById('punishments').value.trim() || null;
    const phoneNumber = document.getElementById('phoneNumber').value.trim() || null;

    if (!name || !rank || !genlNo || !personnelType || !district) {
        showToast('Please fill all required fields', 'error');
        return;
    }

    const personnelData = {
        name,
        rank,
        genl_no: genlNo,
        personnel_type: personnelType,
        district,
        gender,
        previous_station: previousStation || null,
        status,
        date_of_birth: dateOfBirth,
        caste,
        education,
        date_of_promotion: dateOfPromotion,
        present_working: presentWorking,
        is_on_deployment: isOnDeployment,
        deployment_unit: deploymentUnit,
        date_of_deployment: dateOfDeployment,
        punishments,
        phone_number: phoneNumber
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
        console.error('Error saving personnel:', error);
        showToast('Error saving personnel: ' + error.message, 'error');
    }
}

async function editPersonnel(id) {
    if (userRole !== 'ADMIN') {
        showToast('Only administrators can edit personnel', 'error');
        return;
    }

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
        document.getElementById('gender').value = personnel.gender || '';
        document.getElementById('previousStation').value = personnel.previous_station || '';
        document.getElementById('status').value = personnel.status;
        document.getElementById('dateOfBirth').value = personnel.date_of_birth || '';
        document.getElementById('caste').value = personnel.caste || '';
        document.getElementById('education').value = personnel.education || '';
        document.getElementById('dateOfPromotion').value = personnel.date_of_promotion || '';
        document.getElementById('presentWorking').value = personnel.present_working || '';
        document.getElementById('isOnDeputation').value = personnel.is_on_deployment ? 'true' : 'false';
        document.getElementById('deploymentUnit').value = personnel.deployment_unit || '';
        document.getElementById('dateOfDeployment').value = personnel.date_of_deployment || '';
        document.getElementById('punishments').value = personnel.punishments || '';
        document.getElementById('phoneNumber').value = personnel.phone_number || '';

        updateRankOptions();
        toggleDeploymentFields();
    } catch (error) {
        console.error('Error loading personnel for edit:', error);
        showToast('Error loading personnel data', 'error');
    }
}

async function deletePersonnelRecord(id) {
    if (userRole !== 'ADMIN') {
        showToast('Only administrators can delete personnel', 'error');
        return;
    }

    if (!confirm('Are you sure you want to delete this personnel record?')) {
        return;
    }

    try {
        await deletePersonnel(id);
        await loadAllData();
        showToast('Personnel deleted successfully', 'success');
    } catch (error) {
        console.error('Error deleting personnel:', error);
        showToast('Error deleting personnel: ' + error.message, 'error');
    }
}
