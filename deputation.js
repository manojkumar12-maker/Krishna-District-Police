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
        html += `<tr><td>${rank}</td><td>${sanctioned}</td><td>${actual}</td><td>${vac > 0 ? vac : vac < 0 ? '+' + Math.abs(vac) : '0'}</td></tr>`;
    });
    html += `<tr style="font-weight: bold;"><td>TOTAL</td><td>${totalSanc}</td><td>${totalActual}</td><td>${totalVac > 0 ? totalVac : totalVac < 0 ? '+' + Math.abs(totalVac) : '0'}</td></tr>`;
    tbody.innerHTML = html;
}

function showDepUnit(unitName, el) {
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
        item.innerHTML = `<h4>${rank}</h4>
            <div class="dep-sr-row">
                <div class="dep-sr-item"><div class="dep-sr-label">Sanctioned</div><div class="dep-sr-value">${sanctioned}</div></div>
                <div class="dep-sr-item"><div class="dep-sr-label">Actual</div><div class="dep-sr-value">${actual}</div></div>
                <div class="dep-sr-item"><div class="dep-sr-label">Vacancies</div><div class="dep-sr-value vac">${vac > 0 ? vac : vac < 0 ? '+' + Math.abs(vac) : '0'}</div></div>
            </div>
            <input type="number" class="dep-sranctioned-input" value="${sanctioned}" min="0" onchange="updateDepSanctioned('${unitName}', '${rank}', this.value)">`;
        strengthGrid.appendChild(item);
    });
    depUnitStrength.appendChild(strengthGrid);
}

async function updateDepSanctioned(unitName, rank, value) {
    try {
        await updateDeputationStrength(unitName, rank, parseInt(value) || 0);
        if (!depSanctionedData[unitName]) depSanctionedData[unitName] = {};
        depSanctionedData[unitName][rank] = parseInt(value) || 0;
        updateDepConsolidated();
        showToast('Updated', 'success');
    } catch (e) {
        showToast('Error updating', 'error');
    }
}