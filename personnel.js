// Personnel Management Module

function calculateRetirementDate(dateOfBirth) {
    if (!dateOfBirth) return null;
    const dob = new Date(dateOfBirth);
    if (isNaN(dob.getTime())) return null;
    // Add 62 years
    const retirementYear = dob.getFullYear() + 62;
    const retirementMonth = dob.getMonth();
    // Last day of that month
    const lastDay = new Date(retirementYear, retirementMonth + 1, 0).getDate();
    return `${lastDay.toString().padStart(2, '0')}-${(retirementMonth + 1).toString().padStart(2, '0')}-${retirementYear}`;
}

function calculateFiveYearsCompleted(dateOfJoiningPresent) {
    if (!dateOfJoiningPresent) return null;
    const joining = new Date(dateOfJoiningPresent);
    if (isNaN(joining.getTime())) return null;
    const now = new Date();
    const diffMs = now - joining;
    const diffYears = diffMs / (1000 * 60 * 60 * 24 * 365.25);
    return diffYears >= 5 ? 'Yes' : 'No';
}

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
    document.getElementById('presentDistrict').value = '';
    document.getElementById('gender').value = '';
    document.getElementById('previousStation').value = '';
    document.getElementById('status').value = 'Present';
    document.getElementById('dateOfBirth').value = '';
    document.getElementById('caste').value = '';
    document.getElementById('education').value = '';
    document.getElementById('dateOfPromotion').value = '';
    document.getElementById('nativePlace').value = '';
    document.getElementById('dateOfAppointment').value = '';
    document.getElementById('dateOfRetirement').value = '';
    document.getElementById('presentWorking').value = '';
    document.getElementById('dateOfJoiningPresent').value = '';
    document.getElementById('fiveYearsCompleted').value = '';
    document.getElementById('attachments').value = '';
    document.getElementById('previousDeputations').value = '';
    document.getElementById('isOnDeputation').value = 'false';
    document.getElementById('deploymentUnit').value = '';
    document.getElementById('dateOfDeployment').value = '';
    document.getElementById('punishments').value = '';
    document.getElementById('phoneNumber').value = '';

    updateRankOptions();
    toggleDeploymentFields();
}

function downloadPersonnelTemplate() {
    try {
        const headers = [
            'name', 'rank', 'genl_no', 'personnel_type', 'district', 'present_district',
            'gender', 'previous_station', 'status', 'date_of_birth',
            'caste', 'education', 'date_of_promotion', 'present_working',
            'phone_number', 'punishments', 'is_on_deployment',
            'deployment_unit', 'date_of_deployment',
            'native_place', 'date_of_appointment', 'date_of_joining_present',
            'attachments', 'previous_deputations'
        ];
        const districts = [
            { code: 'ERSTWHILE', label: 'Erstwhile Krishna District' },
            { code: 'NEW', label: 'Krishna District (New)' }
        ];
        let csvContent = '\uFEFF' + headers.join(',') + '\n';

        // Generate mock rows for all CIVIL and AR ranks in both districts
        districts.forEach(d => {
            const civRanks = rankMap[d.code + '_CIVIL'] || [];
            const arRanks = rankMap[d.code + '_AR'] || [];
            let rowNum = 1;
            civRanks.forEach((r, idx) => {
                csvContent += [
                    `Sample ${r} Civil ${d.label}`, r, `${1000 + rowNum}`, 'CIVIL', d.code, 'KRISHNA',
                    idx % 2 === 0 ? 'Male' : 'Female', '', 'Present', '',
                    '', '', '', '',
                    '', '', 'false',
                    '', '',
                    '', '', '',
                    '', ''
                ].join(',') + '\n';
                rowNum++;
            });
            arRanks.forEach((r, idx) => {
                csvContent += [
                    `Sample ${r} AR ${d.label}`, r, `${2000 + rowNum}`, 'AR', d.code, 'KRISHNA',
                    idx % 2 === 0 ? 'Male' : 'Female', '', 'Present', '',
                    '', '', '', '',
                    '', '', 'false',
                    '', '',
                    '', '', '',
                    '', ''
                ].join(',') + '\n';
                rowNum++;
            });
        });

        downloadFile(csvContent, 'personnel_template.csv', 'text/csv;charset=utf-8');
        showToast('Template downloaded with all ranks!', 'success');
    } catch (e) {
        console.error('Template download error:', e);
        showToast('Failed to download template: ' + e.message, 'error');
    }
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
    const presentDistrict = document.getElementById('presentDistrict').value || null;
    const gender = document.getElementById('gender').value || null;
    const previousStation = document.getElementById('previousStation').value.trim();
    const status = document.getElementById('status').value;
    const dateOfBirth = document.getElementById('dateOfBirth').value || null;
    const caste = document.getElementById('caste').value.trim() || null;
    const education = document.getElementById('education').value.trim() || null;
    const dateOfPromotion = document.getElementById('dateOfPromotion').value || null;
    const nativePlace = document.getElementById('nativePlace').value.trim() || null;
    const dateOfAppointment = document.getElementById('dateOfAppointment').value || null;
    const presentWorking = document.getElementById('presentWorking').value.trim() || null;
    const dateOfJoiningPresent = document.getElementById('dateOfJoiningPresent').value || null;
    const attachments = document.getElementById('attachments').value.trim() || null;
    const previousDeputations = document.getElementById('previousDeputations').value.trim() || null;
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
        present_district: presentDistrict,
        gender,
        previous_station: previousStation || null,
        status,
        date_of_birth: dateOfBirth,
        caste,
        education,
        date_of_promotion: dateOfPromotion,
        native_place: nativePlace,
        date_of_appointment: dateOfAppointment,
        present_working: presentWorking,
        date_of_joining_present: dateOfJoiningPresent,
        attachments: attachments,
        previous_deputations: previousDeputations,
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
        document.getElementById('presentDistrict').value = personnel.present_district || '';
        document.getElementById('gender').value = personnel.gender || '';
        document.getElementById('previousStation').value = personnel.previous_station || '';
        document.getElementById('status').value = personnel.status;
        document.getElementById('dateOfBirth').value = personnel.date_of_birth || '';
        document.getElementById('caste').value = personnel.caste || '';
        document.getElementById('education').value = personnel.education || '';
        document.getElementById('dateOfPromotion').value = personnel.date_of_promotion || '';
        document.getElementById('nativePlace').value = personnel.native_place || '';
        document.getElementById('dateOfAppointment').value = personnel.date_of_appointment || '';
        document.getElementById('presentWorking').value = personnel.present_working || '';
        document.getElementById('dateOfJoiningPresent').value = personnel.date_of_joining_present || '';
        document.getElementById('attachments').value = personnel.attachments || '';
        document.getElementById('previousDeputations').value = personnel.previous_deputations || '';
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

function showPersonnelDetail(id) {
    const p = allPersonnel.find(x => String(x.id) === String(id));
    if (!p) { showToast('Personnel not found', 'error'); return; }

    const dialog = document.createElement('div');
    dialog.className = 'modal-overlay';
    dialog.style.display = 'flex';
    dialog.id = 'detailModal';

    const fields = [
        { label: 'Name', value: p.name },
        { label: 'Rank', value: p.rank },
        { label: 'Genl. No.', value: p.genl_no },
        { label: 'Type', value: p.personnel_type },
        { label: 'District', value: p.district === 'ERSTWHILE' ? 'Erstwhile Krishna District' : p.district === 'NEW' ? 'Krishna District (New)' : p.district },
        { label: 'Present District', value: p.present_district || '-' },
        { label: 'Gender', value: p.gender || '-' },
        { label: 'Status', value: p.status || '-' },
        { label: 'Date of Birth', value: p.date_of_birth || '-' },
        { label: 'Caste', value: p.caste || '-' },
        { label: 'Education', value: p.education || '-' },
        { label: 'Date of Promotion', value: p.date_of_promotion || '-' },
        { label: 'Native Place', value: p.native_place || '-' },
        { label: 'Date of Appointment', value: p.date_of_appointment || '-' },
        { label: 'Date of Retirement', value: calculateRetirementDate(p.date_of_birth) || '-' },
        { label: 'Present Working', value: p.present_working || '-' },
        { label: 'Date of Joining of Present Working', value: p.date_of_joining_present || '-' },
        { label: '5 Years Completed', value: calculateFiveYearsCompleted(p.date_of_joining_present) || '-' },
        { label: 'Attachments', value: p.attachments || '-' },
        { label: 'Previous Deputations', value: p.previous_deputations || '-' },
        { label: 'Previous Station', value: p.previous_station || '-' },
        { label: 'Phone Number', value: p.phone_number || '-' },
        { label: 'On Deputation', value: p.is_on_deployment ? 'Yes' : 'No' },
        { label: 'Deployment Unit', value: p.deployment_unit || '-' },
        { label: 'Date of Deployment', value: p.date_of_deployment || '-' },
        { label: 'Punishments', value: p.punishments || '-' }
    ];

    const rowsHtml = fields.map(f => `
        <div class="form-group" style="margin-bottom:8px;">
            <label style="font-size:12px;color:#666;margin-bottom:2px;">${f.label}</label>
            <div style="font-size:14px;font-weight:500;word-break:break-word;">${f.value}</div>
        </div>
    `).join('');

    dialog.innerHTML = `
        <div class="modal" style="max-width:700px;max-height:90vh;overflow-y:auto;">
            <div class="modal-header">
                <h3>Personnel Details</h3>
                <button class="modal-close" onclick="document.getElementById('detailModal').remove()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="form-grid" style="grid-template-columns: 1fr 1fr;">${rowsHtml}</div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="document.getElementById('detailModal').remove()">Close</button>
                ${userRole === 'ADMIN' ? `
                <button class="btn btn-primary" onclick="document.getElementById('detailModal').remove(); editPersonnel('${p.id}')">Edit</button>
                <button class="btn btn-danger" onclick="if(confirm('Delete this record?')){ document.getElementById('detailModal').remove(); deletePersonnelRecord('${p.id}'); }">Delete</button>
                ` : ''}
            </div>
        </div>
    `;
    document.body.appendChild(dialog);
}
