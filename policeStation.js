// Police Station Management Module

let psCurrentSubDivision = '';
let psCurrentCircle = '';
let psCurrentStation = '';
let psViewRankGroup = '';

function escapeQuotes(str) {
    return str.replace(/'/g, "\\'");
}

function showPSPage() {
    showPage('policeStation');
    psCurrentSubDivision = '';
    psCurrentCircle = '';
    psCurrentStation = '';
    psViewRankGroup = '';

    const subDivNames = Object.keys(psHierarchy);
    document.getElementById('psSubDivisionTiles').innerHTML = subDivNames.map(sd =>
        `<div class="sub-tile" onclick="selectPSSubDivision('${escapeQuotes(sd)}', this)">${sd}</div>`
    ).join('');

    document.getElementById('psSubDivisionSection').classList.add('visible');
    document.getElementById('psCircleSection').classList.remove('visible');
    document.getElementById('psStationSection').classList.remove('visible');
    document.getElementById('psStrengthSection').classList.remove('visible');
    document.getElementById('psPersonnelSection').classList.remove('visible');
}

function selectPSSubDivision(name, el) {
    psCurrentSubDivision = name;
    psCurrentCircle = '';
    psCurrentStation = '';

    setActiveTile(el);

    const circles = psHierarchy[name];
    document.getElementById('psCircleTiles').innerHTML = circles.map(c =>
        `<div class="sub-tile" onclick="selectPSCircle('${escapeQuotes(c.name)}', this)">${c.name}${c.isUPS && !c.name.toUpperCase().includes('UPS') ? ' (UPS)' : ''}</div>`
    ).join('');

    showPSStrengthAbstract();
    document.getElementById('psStrengthSection').classList.add('visible');
    document.getElementById('psCircleSection').classList.add('visible');
    document.getElementById('psStationSection').classList.remove('visible');
    document.getElementById('psPersonnelSection').classList.remove('visible');
}

function selectPSCircle(name, el) {
    psCurrentCircle = name;
    psCurrentStation = '';

    setActiveTile(el);

    const circles = psHierarchy[psCurrentSubDivision];
    const circle = circles.find(c => c.name === name);

    if (circle && circle.stations.length > 0) {
        document.getElementById('psStationTiles').innerHTML = circle.stations.map(s =>
            `<div class="sub-tile" onclick="selectPSStation('${escapeQuotes(s)}', this)">${s}</div>`
        ).join('');
        document.getElementById('psStationSection').classList.add('visible');
    } else {
        document.getElementById('psStationSection').classList.remove('visible');
    }

    showPSStrengthAbstract();
    document.getElementById('psStrengthSection').classList.add('visible');
    document.getElementById('psPersonnelSection').classList.remove('visible');
}

function selectPSStation(name, el) {
    psCurrentStation = name;

    setActiveTile(el);

    showPSStrengthAbstract();
    document.getElementById('psStrengthSection').classList.add('visible');
    document.getElementById('psPersonnelSection').classList.remove('visible');
}

function setActiveTile(el) {
    if (el && el.parentElement) {
        el.parentElement.querySelectorAll('.sub-tile').forEach(t => t.classList.remove('active'));
        el.classList.add('active');
    }
}

function getPSPersonnelForLocation() {
    let locationNames = [];

    if (psCurrentStation) {
        locationNames = [psCurrentStation];
    } else if (psCurrentCircle) {
        const circles = psHierarchy[psCurrentSubDivision];
        const c = circles.find(circ => circ.name === psCurrentCircle);
        if (c) {
            locationNames = c.stations.length > 0 ? c.stations : [c.name];
        }
    } else if (psCurrentSubDivision) {
        const circles = psHierarchy[psCurrentSubDivision];
        circles.forEach(c => {
            if (c.stations.length > 0) locationNames.push(...c.stations);
            else locationNames.push(c.name);
        });
    }

    return allPersonnel.filter(p =>
        p.district === 'NEW' &&
        !p.is_on_deployment &&
        locationNames.some(loc => p.present_working && p.present_working.toUpperCase() === loc.toUpperCase())
    );
}

function showPSStrengthAbstract() {
    const personnel = getPSPersonnelForLocation();
    const displayRanks = displayRanksMap['NEW_CIVIL'] || [];
    let title;

    if (psCurrentStation) title = psCurrentStation;
    else if (psCurrentCircle) title = psCurrentCircle;
    else if (psCurrentSubDivision) title = psCurrentSubDivision;
    else title = 'Police Station';

    document.getElementById('psStrengthTitle').textContent = title + ' - Strength Particulars';

    const tbody = document.getElementById('psStrengthBody');
    let html = '';
    let totalSanc = 0, totalActual = 0, totalVac = 0;

    displayRanks.forEach(rg => {
        const ranks = rankGroups[rg] || [rg];
        const actual = personnel.filter(p => ranks.includes(p.rank)).length;
        const sancKey = 'NEW_CIVIL_' + rg;
        const sanctioned = sanctionedData[sancKey] || 0;
        const vac = sanctioned - actual;

        totalSanc += sanctioned;
        totalActual += actual;
        totalVac += vac;

        const vacStyle = vac > 0 ? '#ffeb3b' : vac < 0 ? 'orange' : '#4caf50';
        const vacText = vac > 0 ? vac : vac < 0 ? '+' + Math.abs(vac) + ' (Excess)' : '0';

        html += `<tr>
            <td>${rg}</td>
            <td>${sanctioned}</td>
            <td>${actual}</td>
            <td style="color:${vacStyle}">${vacText}</td>
            <td><button class="action-btn btn-primary" onclick="showPSPersonnel('${escapeQuotes(rg)}')">Details</button></td>
        </tr>`;
    });

    const totalVacStyle = totalVac > 0 ? '#ffeb3b' : totalVac < 0 ? 'orange' : '#4caf50';
    const totalVacText = totalVac > 0 ? totalVac : totalVac < 0 ? '+' + Math.abs(totalVac) + ' (Excess)' : '0';

    html += `<tr style="font-weight: bold; background-color: rgba(0,0,0,0.1);">
        <td>TOTAL</td>
        <td>${totalSanc}</td>
        <td>${totalActual}</td>
        <td style="color:${totalVacStyle}">${totalVacText}</td>
        <td></td>
    </tr>`;

    tbody.innerHTML = html;
}

function showPSPersonnel(rankGroup) {
    psViewRankGroup = rankGroup;
    const ranks = rankGroups[rankGroup] || [rankGroup];
    const personnel = getPSPersonnelForLocation().filter(p => ranks.includes(p.rank));

    if (personnel.length === 0) {
        document.getElementById('psPersonnelTable').style.display = 'none';
        document.getElementById('psPersonnelEmpty').style.display = 'block';
    } else {
        document.getElementById('psPersonnelTable').style.display = 'table';
        document.getElementById('psPersonnelEmpty').style.display = 'none';
        document.getElementById('psPersonnelBody').innerHTML = personnel.map((p, i) => {
            let actionCell = '';
            if (userRole === 'ADMIN') {
                actionCell = `<button class="action-btn btn-primary" onclick="editPersonnel('${p.id}')">Edit</button>
                              <button class="action-btn btn-danger" onclick="deletePersonnelRecord('${p.id}')">Del</button>`;
            }
            return `<tr>
                <td>${i+1}</td>
                <td>${p.name}</td>
                <td>${p.rank}</td>
                <td>${p.genl_no}</td>
                <td>${p.present_working || '-'}</td>
                <td style="color:${p.status === 'Present' ? 'green' : 'red'}">${p.status}</td>
                <td>${actionCell}</td>
            </tr>`;
        }).join('');
    }
    document.getElementById('psPersonnelSection').classList.add('visible');
}
