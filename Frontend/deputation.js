// Deputation Module

function updateDepConsolidated() {
    const tbody = document.getElementById('depConsolidatedBody');
    let html = '';
    let totalSanc = 0, totalActual = 0, totalVac = 0;

    depRanks.forEach(rank => {
        let sanctioned = 0;
        depUnits.forEach(u => {
            if (depSanctionedData[u] && depSanctionedData[u][rank]) {
                sanctioned += depSanctionedData[u][rank];
            }
        });

        const actual = allPersonnel.filter(p => p.is_on_deployment && p.rank === rank).length;
        const vac = sanctioned - actual;

        totalSanc += sanctioned;
        totalActual += actual;
        totalVac += vac;

        html += `<tr>
            <td>${rank}</td>
            <td>${sanctioned}</td>
            <td>${actual}</td>
            <td style="color:${vac > 0 ? '#ffeb3b' : vac < 0 ? 'orange' : '#4caf50'}">${vac > 0 ? vac : vac < 0 ? '+' + Math.abs(vac) + ' (Excess)' : '0'}</td>
        </tr>`;
    });

    html += `<tr style="font-weight: bold; background-color: rgba(0,0,0,0.1);">
        <td>TOTAL</td>
        <td>${totalSanc}</td>
        <td>${totalActual}</td>
        <td style="color:${totalVac > 0 ? '#ffeb3b' : totalVac < 0 ? 'orange' : '#4caf50'}">${totalVac > 0 ? totalVac : totalVac < 0 ? '+' + Math.abs(totalVac) + ' (Excess)' : '0'}</td>
    </tr>`;

    tbody.innerHTML = html;
}

function showDepUnit(unitName, el) {
    depCurrentUnit = unitName;
    const parent = el.parentElement;
    parent.querySelectorAll('.sub-tile').forEach(t => t.classList.remove('active'));
    el.classList.add('active');

    const depUnitStrength = document.getElementById('depUnitStrength');
    depUnitStrength.innerHTML = `<h3>${unitName}</h3>`;

    const strengthGrid = document.createElement('div');
    strengthGrid.className = 'dep-strength-grid';

    depRanks.forEach(rank => {
        const sanctioned = depSanctionedData[unitName] ? depSanctionedData[unitName][rank] || 0 : 0;
        const actual = allPersonnel.filter(p => p.is_on_deployment && p.deployment_unit === unitName && p.rank === rank).length;
        const vac = sanctioned - actual;

        const item = document.createElement('div');
        item.className = 'dep-rank-strength';
        item.innerHTML = `
            <h4>${rank}</h4>
            <div class="dep-sr-row">
                <div class="dep-sr-item">
                    <div class="dep-sr-label">Sanctioned</div>
                    <div class="dep-sr-value">${sanctioned}</div>
                </div>
                <div class="dep-sr-item">
                    <div class="dep-sr-label">Actual</div>
                    <div class="dep-sr-value">${actual}</div>
                </div>
                <div class="dep-sr-item">
                    <div class="dep-sr-label">Vacancies</div>
                    <div class="dep-sr-value vac">${vac > 0 ? vac : vac < 0 ? '+' + Math.abs(vac) + ' (Excess)' : '0'}</div>
                </div>
            </div>
            ${userRole === 'ADMIN' ? `<div style="margin-top:8px;">
                <label style="font-size:11px; color:#666;">Update Sanctioned:</label>
                <input type="number" class="dep-sranctioned-input" value="${sanctioned}" min="0" onchange="updateDepSanctioned('${unitName}', '${rank}', this.value)">
            </div>` : ''}
        `;
        strengthGrid.appendChild(item);
    });

    depUnitStrength.appendChild(strengthGrid);

    // Personnel details section
    const personnelDetails = document.createElement('div');
    personnelDetails.style.marginTop = '20px';
    personnelDetails.innerHTML = `
        <h4 style="color: var(--primary); margin-bottom: 10px;">Personnel Details</h4>
        <table id="deputationTable" style="display:none;">
            <thead>
                <tr><th>Sl.No</th><th>Name</th><th>Rank</th><th>Genl.No</th><th>Type</th><th>District</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody id="deputationTableBody"></tbody>
        </table>
        <div id="deputationEmpty" class="empty-state">No personnel in this unit.</div>
    `;
    depUnitStrength.appendChild(personnelDetails);

    loadDepUnitPersonnel();
}

function loadDepUnitPersonnel() {
    const depUnitStrength = document.getElementById('depUnitStrength');
    const personnelTable = depUnitStrength.querySelector('#deputationTable');
    const personnelEmpty = depUnitStrength.querySelector('#deputationEmpty');

    const data = allPersonnel.filter(p => p.is_on_deployment && p.deployment_unit === depCurrentUnit);

    if (data.length === 0) {
        personnelTable.style.display = 'none';
        personnelEmpty.style.display = 'block';
    } else {
        personnelTable.style.display = 'table';
        personnelEmpty.style.display = 'none';
        depUnitStrength.querySelector('#deputationTableBody').innerHTML = data.map((p, i) => {
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
                <td>${p.personnel_type}</td>
                <td>${p.district}</td>
                <td style="color:${p.status === 'Present' ? 'green' : 'red'}">${p.status}</td>
                <td>${actionCell}</td>
            </tr>
        `;
        }).join('');
    }
}

async function updateDepSanctioned(unitName, rank, value) {
    const val = parseInt(value) || 0;

    try {
        await updateDeputationStrength(unitName, rank, val);

        if (!depSanctionedData[unitName]) depSanctionedData[unitName] = {};
        depSanctionedData[unitName][rank] = val;

        // Refresh the display
        const activeTile = document.querySelector('.sub-tile.active');
        if (activeTile) {
            showDepUnit(unitName, activeTile);
        }

        updateDepConsolidated();
        showToast('Sanctioned strength updated', 'success');
    } catch (e) {
        showToast('Error updating sanctioned strength', 'error');
    }
}
