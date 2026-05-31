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
    depUnitStrength.innerHTML = `<h3>${unitName} - Strength Particulars</h3>`;

    // Build strength table
    let html = '<table class="dep-consol-table" id="depUnitStrengthTable">';
    html += '<thead><tr><th>Rank</th><th>Sanctioned</th><th>Actual</th><th>Vacancies</th></tr></thead><tbody>';

    let totalSanc = 0, totalActual = 0, totalVac = 0;

    depRanks.forEach(rank => {
        const sanctioned = depSanctionedData[unitName] ? depSanctionedData[unitName][rank] || 0 : 0;
        const actual = allPersonnel.filter(p => p.is_on_deployment && p.deployment_unit === unitName && p.rank === rank).length;
        const vac = sanctioned - actual;

        totalSanc += sanctioned;
        totalActual += actual;
        totalVac += vac;

        const vacStyle = vac > 0 ? '#ffeb3b' : vac < 0 ? 'orange' : '#4caf50';
        const vacText = vac > 0 ? vac : vac < 0 ? '+' + Math.abs(vac) + ' (Excess)' : '0';

        const sancCell = userRole === 'ADMIN'
            ? `<input type="number" class="dep-sranctioned-input" value="${sanctioned}" min="0" onchange="updateDepSanctioned('${unitName}', '${rank}', this.value)" style="width:60px;padding:3px;border:1px solid #ccc;border-radius:3px;text-align:center;font-size:12px;">`
            : sanctioned;

        html += `<tr>
            <td>${rank}</td>
            <td>${sancCell}</td>
            <td>${actual}</td>
            <td style="color:${vacStyle}">${vacText}</td>
        </tr>`;
    });

    const totalVacStyle = totalVac > 0 ? '#ffeb3b' : totalVac < 0 ? 'orange' : '#4caf50';
    const totalVacText = totalVac > 0 ? totalVac : totalVac < 0 ? '+' + Math.abs(totalVac) + ' (Excess)' : '0';

    html += `<tr style="font-weight:bold;background-color:rgba(0,0,0,0.1);">
        <td>TOTAL</td>
        <td>${totalSanc}</td>
        <td>${totalActual}</td>
        <td style="color:${totalVacStyle}">${totalVacText}</td>
    </tr>`;

    html += '</tbody></table>';

    // Export and More Details buttons
    html += `<div style="margin-top:15px;display:flex;gap:10px;flex-wrap:wrap;">
        <button class="action-btn btn-primary" onclick="exportDepUnitStrength('${escapeQuotes(unitName)}')">Export CSV</button>
        <button class="action-btn btn-primary" onclick="exportDepUnitStrengthPDF('${escapeQuotes(unitName)}')">Export PDF</button>
        <button class="action-btn btn-primary" onclick="toggleDepPersonnelDetails()">More Details</button>
    </div>`;

    depUnitStrength.innerHTML += html;

    // Personnel details section (hidden by default)
    const personnelDetails = document.createElement('div');
    personnelDetails.id = 'depPersonnelDetails';
    personnelDetails.style.marginTop = '20px';
    personnelDetails.style.display = 'none';
    personnelDetails.innerHTML = `
        <h4 style="color: var(--primary); margin-bottom: 10px;">Personnel Details</h4>
        <div style="margin-bottom:10px;display:flex;gap:10px;flex-wrap:wrap;">
            <button class="action-btn btn-primary" onclick="exportDepUnitPersonnel('${escapeQuotes(unitName)}')">Export CSV</button>
            <button class="action-btn btn-primary" onclick="exportDepUnitPersonnelPDF('${escapeQuotes(unitName)}')">Export PDF</button>
        </div>
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

function toggleDepPersonnelDetails() {
    const section = document.getElementById('depPersonnelDetails');
    if (section) {
        section.style.display = section.style.display === 'none' ? 'block' : 'none';
    }
}

function exportDepUnitStrength(unitName) {
    let csv = `Rank,Sanctioned,Actual,Vacancies\n`;
    depRanks.forEach(rank => {
        const sanctioned = depSanctionedData[unitName] ? depSanctionedData[unitName][rank] || 0 : 0;
        const actual = allPersonnel.filter(p => p.is_on_deployment && p.deployment_unit === unitName && p.rank === rank).length;
        const vac = sanctioned - actual;
        csv += `${rank},${sanctioned},${actual},${vac}\n`;
    });
    downloadFile(csv, `${unitName.replace(/[^a-zA-Z0-9]/g, '_')}_Strength.csv`, 'text/csv');
    showToast('Exported to CSV!', 'success');
}

function exportDepUnitPersonnel(unitName) {
    const data = allPersonnel.filter(p => p.is_on_deployment && p.deployment_unit === unitName);
    if (data.length === 0) {
        showToast('No personnel to export', 'error');
        return;
    }
    let csv = `Sl.No,Name,Rank,Genl.No,Type,District,Status\n`;
    data.forEach((p, i) => {
        csv += `${i+1},"${p.name}","${p.rank}","${p.genl_no}","${p.personnel_type}","${p.district}","${p.status}"\n`;
    });
    downloadFile(csv, `${unitName.replace(/[^a-zA-Z0-9]/g, '_')}_Personnel.csv`, 'text/csv');
    showToast('Exported to CSV!', 'success');
}

function exportDepUnitStrengthPDF(unitName) {
    let totalSanc = 0, totalActual = 0, totalVac = 0;
    depRanks.forEach(rank => {
        const sanctioned = depSanctionedData[unitName] ? depSanctionedData[unitName][rank] || 0 : 0;
        const actual = allPersonnel.filter(p => p.is_on_deployment && p.deployment_unit === unitName && p.rank === rank).length;
        totalSanc += sanctioned;
        totalActual += actual;
        totalVac += sanctioned - actual;
    });

    const printWind = window.open('', '', 'width=800,height=600');
    printWind.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Deputation Unit Strength</title>
            <style>
                body { font-family: serif; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid #000; padding: 8px; text-align: center; }
                h2, h3 { text-align: center; }
                .summary { display: flex; justify-content: space-around; margin: 20px 0; font-size: 18px; }
                @media print { .no-print { display: none; } }
            </style>
        </head>
        <body>
            <h2>Deputation Unit Strength</h2>
            <h3>${unitName}</h3>
            <div class="summary">
                <div><b>Sanctioned:</b> ${totalSanc}</div>
                <div><b>Actual:</b> ${totalActual}</div>
                <div><b>Vacancies:</b> ${totalVac}</div>
            </div>
            <table>
                <thead>
                    <tr><th>Rank</th><th>Sanctioned</th><th>Actual</th><th>Vacancies</th></tr>
                </thead>
                <tbody>
                    ${depRanks.map(rank => {
                        const sanctioned = depSanctionedData[unitName] ? depSanctionedData[unitName][rank] || 0 : 0;
                        const actual = allPersonnel.filter(p => p.is_on_deployment && p.deployment_unit === unitName && p.rank === rank).length;
                        const vac = sanctioned - actual;
                        return `<tr><td>${rank}</td><td>${sanctioned}</td><td>${actual}</td><td>${vac}</td></tr>`;
                    }).join('')}
                    <tr style="font-weight:bold;"><td>TOTAL</td><td>${totalSanc}</td><td>${totalActual}</td><td>${totalVac}</td></tr>
                </tbody>
            </table>
            <br>
            <button class="no-print" onclick="window.print()">Print</button>
        </body>
        </html>
    `);
    printWind.document.close();
}

function exportDepUnitPersonnelPDF(unitName) {
    const data = allPersonnel.filter(p => p.is_on_deployment && p.deployment_unit === unitName);
    if (data.length === 0) {
        showToast('No personnel to export', 'error');
        return;
    }

    const printWind = window.open('', '', 'width=800,height=600');
    printWind.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Deputation Unit Personnel</title>
            <style>
                body { font-family: serif; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid #000; padding: 8px; text-align: left; }
                h2, h3 { text-align: center; }
                @media print { .no-print { display: none; } }
            </style>
        </head>
        <body>
            <h2>Deputation Unit Personnel</h2>
            <h3>${unitName}</h3>
            <table>
                <thead>
                    <tr><th>Sl.No</th><th>Name</th><th>Rank</th><th>Genl.No</th><th>Type</th><th>District</th><th>Status</th></tr>
                </thead>
                <tbody>
                    ${data.map((p, i) => `<tr><td>${i+1}</td><td>${p.name}</td><td>${p.rank}</td><td>${p.genl_no}</td><td>${p.personnel_type}</td><td>${p.district}</td><td>${p.status}</td></tr>`).join('')}
                </tbody>
            </table>
            <br>
            <button class="no-print" onclick="window.print()">Print</button>
        </body>
        </html>
    `);
    printWind.document.close();
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
