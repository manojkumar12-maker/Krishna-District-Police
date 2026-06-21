// Audit Logs, Search & Filter, Excel Import Module

// Populate rank filter dropdown
function populateFilterRanks() {
    const allRanks = new Set();
    for (const key in rankMap) {
        rankMap[key].forEach(r => allRanks.add(r));
    }
    const sortedRanks = Array.from(allRanks).sort();
    const select = document.getElementById('filterRank');
    sortedRanks.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r;
        opt.textContent = r;
        select.appendChild(opt);
    });
}

// Search & Filter
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
    if (pageId === 'deputation') {
        renderDepTiles();
        updateDepConsolidated();
    }
    if (pageId === 'searchFilter') {
        if (!document.getElementById('filterRank').children.length > 1) {
            populateFilterRanks();
        }
        applySearchFilter();
    }
    if (pageId === 'auditLogs') {
        loadAuditLogs();
    }
}

async function applySearchFilter() {
    const search = document.getElementById('globalSearch').value.trim();
    const rank = document.getElementById('filterRank').value;
    const district = document.getElementById('filterDistrict').value;
    const personnel_type = document.getElementById('filterType').value;
    const status = document.getElementById('filterStatus').value;
    const gender = document.getElementById('filterGender').value;
    const is_on_deployment = document.getElementById('filterDeployment').value;

    const filters = {};
    if (search) filters.search = search;
    if (rank) filters.rank = rank;
    if (district) filters.district = district;
    if (personnel_type) filters.personnel_type = personnel_type;
    if (status) filters.status = status;
    if (gender) filters.gender = gender;
    if (is_on_deployment !== '') filters.is_on_deployment = is_on_deployment;

    try {
        const result = await getAllPersonnel(filters);
        const data = result.data || [];
        document.getElementById('filterResultInfo').textContent = data.length + ' result(s) found';

        if (data.length === 0) {
            document.getElementById('searchFilterTable').style.display = 'none';
            document.getElementById('searchFilterEmpty').style.display = 'block';
        } else {
            document.getElementById('searchFilterTable').style.display = 'table';
            document.getElementById('searchFilterEmpty').style.display = 'none';
            document.getElementById('searchFilterBody').innerHTML = data.map((p, i) => {
                let actions = '';
                if (userRole === 'ADMIN') {
                    actions = `<button class="action-btn btn-primary" onclick="editPersonnel('${p.id}')">Edit</button>
                               <button class="action-btn btn-danger" onclick="deletePersonnelRecord('${p.id}')">Del</button>`;
                }
                return `
                <tr>
                    <td>${i + 1}</td>
                    <td>${p.name}</td>
                    <td>${p.rank}</td>
                    <td>${p.genl_no}</td>
                    <td>${p.personnel_type}</td>
                    <td>${p.district === 'ERSTWHILE' ? 'Erstwhile' : p.district === 'NEW' ? 'Krishna New' : 'Deputation'}</td>
                    <td>${p.present_working || '-'}</td>
                    <td style="color:${p.status === 'Present' ? 'green' : 'red'}">${p.status}</td>
                    <td>${actions}</td>
                </tr>`;
            }).join('');
        }
    } catch (e) {
        console.error('Search/filter error:', e);
        showToast('Error searching personnel', 'error');
    }
}

// Excel Import
async function handleExcelUpload(input) {
    const file = input.files[0];
    if (!file) return;

    if (userRole !== 'ADMIN') {
        showToast('Only administrators can import data', 'error');
        input.value = '';
        return;
    }

    if (!confirm(`Import personnel from "${file.name}"? This will add all records from the Excel file.`)) {
        input.value = '';
        return;
    }

    showToast('Importing...', 'loading');
    try {
        const result = await importPersonnelExcel(file);
        showToast(result.message, 'success');
        await loadAllData();
        if (result.errors && result.errors.length > 0) {
            console.warn('Import errors:', result.errors);
            const errMsg = result.errors.map(e => `Row ${e.row}: ${e.error}`).join('; ');
            if (errMsg) showToast('Errors: ' + errMsg.substring(0, 200), 'error');
        }
    } catch (e) {
        console.error('Excel import error:', e);
        showToast('Import failed: ' + e.message, 'error');
    }
    input.value = '';
}

// Audit Logs
async function loadAuditLogs() {
    const action = document.getElementById('auditActionFilter').value;
    const performedBy = document.getElementById('auditUserFilter').value.trim();

    const filters = {};
    if (action) filters.action = action;
    if (performedBy) filters.performedBy = performedBy;

    try {
        const result = await getAuditLogs(filters);
        const logs = result.data || [];

        if (logs.length === 0) {
            document.getElementById('auditLogTable').style.display = 'none';
            document.getElementById('auditLogEmpty').style.display = 'block';
        } else {
            document.getElementById('auditLogTable').style.display = 'table';
            document.getElementById('auditLogEmpty').style.display = 'none';
            document.getElementById('auditLogBody').innerHTML = logs.map(log => {
                const dt = new Date(log.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
                const actionClass = { CREATE: 'green', UPDATE: '#1565c0', DELETE: 'red', IMPORT: '#ff8f00', CLEAR_ALL: '#b71c1c', UPDATE_SANCTIONED: '#6a1b9a', UPDATE_DEPUTATION: '#00695c' }[log.action] || '#333';

                let details = '';
                if (log.action === 'UPDATE' && log.changes) {
                    details = Object.entries(log.changes).map(([k, v]) => `${k}: "${v.from}" → "${v.to}"`).join('<br>');
                } else if (log.action === 'CREATE' && log.changes) {
                    details = Object.entries(log.changes).filter(([k]) => !['_id', '__v'].includes(k)).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('<br>');
                } else if (log.action === 'DELETE' && log.changes) {
                    details = 'Deleted: ' + (log.changes.name || '') + ' (' + (log.changes.genl_no || '') + ')';
                } else if (log.action === 'IMPORT' && log.changes) {
                    details = `Imported: ${log.changes.importedCount || 0} records` + (log.changes.errorCount ? `, ${log.changes.errorCount} errors` : '');
                } else if (log.action === 'CLEAR_ALL') {
                    details = 'Cleared all personnel records';
                } else {
                    details = JSON.stringify(log.changes || {}).substring(0, 200);
                }

                return `
                <tr>
                    <td style="white-space:nowrap;font-size:12px;">${dt}</td>
                    <td style="color:${actionClass};font-weight:bold;">${log.action}</td>
                    <td>${log.performedBy}</td>
                    <td>${log.targetType} #${log.targetId}</td>
                    <td style="font-size:12px;">${details}</td>
                </tr>`;
            }).join('');
        }
    } catch (e) {
        console.error('Audit log error:', e);
        if (e.authError) {
            showToast('Session expired. Please login again.', 'error');
        } else {
            showToast('Error loading audit logs', 'error');
        }
    }
}
