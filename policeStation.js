// Police Station Management Module

let psCurrentSubDivision = '';
let psCurrentCircle = '';
let psCurrentStation = '';
let psViewRankGroup = '';

// ── Station-specific sanctioned strength ──
let stationSanctionedData = {};
let ssCurrentSubDiv = '';
let ssCurrentCircle = '';
let ssCurrentStation = '';

// Phase 6: sanctioned strength is server-authoritative (D1), loaded via API.
// localStorage is no longer used as the source of truth.
async function loadStationSanctionedData() {
    try {
        const result = await getStationSanctionedStrength();
        stationSanctionedData = {};
        if (result && result.data) {
            result.data.forEach(s => {
                stationSanctionedData[getStationSancKey(s.sub_division, s.circle, s.station, s.rank)] = s.sanctioned_count;
            });
        }
    } catch (e) {
        console.error('Error loading station sanctioned data:', e);
        showToast('Failed to load station sanctioned strength', 'error');
    }
}

function getStationSancKey(subDiv, circle, station, rank) {
    return [subDiv, circle || '', station || '', rank].join('|');
}

function getStationSanctioned(subDiv, circle, station, rank) {
    return stationSanctionedData[getStationSancKey(subDiv, circle, station, rank)] || 0;
}

function setStationSanctioned(subDiv, circle, station, rank, count) {
    stationSanctionedData[getStationSancKey(subDiv, circle, station, rank)] = parseInt(count) || 0;
}

function escapeQuotes(str) {
    return str.replace(/'/g, "\\'");
}

async function showPSPage() {
    showPage('policeStation');
    psCurrentSubDivision = '';
    psCurrentCircle = '';
    psCurrentStation = '';
    psViewRankGroup = '';

    await loadStationSanctionedData();
    await checkStationMigration();

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
        isNewKrishnaDistrict(p) &&
        !p.is_on_deployment &&
        locationNames.some(loc => p.present_working && p.present_working.toUpperCase() === loc.toUpperCase())
    );
}

function getPSDisplayRanks() {
    let allRanks = [...(displayRanksMap['NEW_CIVIL'] || [])];

    // Only Sub-divisions show DSP (no ADDL.SP)
    // Only D.T.C., MTM and AIRPORT show DSP at leaf level
    // All others (circles, stations, UPS, wings, functional) hide both DSP and ADDL.SP
    const leafWithDSP = ['D.T.C., MTM', 'AIRPORT', 'Women PS'];
    const currentLeaf = psCurrentStation || psCurrentCircle;

    if (psCurrentSubDivision && !psCurrentCircle && !psCurrentStation) {
        // Sub-division level: show DSP, hide ADDL.SP
        allRanks = allRanks.filter(r => r !== 'ADDL.SP');
    } else if (leafWithDSP.includes(currentLeaf)) {
        // Special leaf nodes: show DSP, hide ADDL.SP
        allRanks = allRanks.filter(r => r !== 'ADDL.SP');
    } else {
        // Everything else: hide both DSP and ADDL.SP
        allRanks = allRanks.filter(r => r !== 'DSP' && r !== 'ADDL.SP');
    }

    return allRanks;
}

function showPSStrengthAbstract() {
    const personnel = getPSPersonnelForLocation();
    const displayRanks = getPSDisplayRanks();
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

        // Use location-specific sanctioned strength (set via Manage Station Sanctions)
        let sanctioned = 0;
        if (psCurrentStation) {
            sanctioned = getStationSanctioned(psCurrentSubDivision, psCurrentCircle, psCurrentStation, rg);
        } else if (psCurrentCircle) {
            const circles = psHierarchy[psCurrentSubDivision];
            const circle = circles.find(c => c.name === psCurrentCircle);
            if (circle && circle.stations.length > 0) {
                circle.stations.forEach(s => {
                    sanctioned += getStationSanctioned(psCurrentSubDivision, psCurrentCircle, s, rg);
                });
            } else {
                sanctioned = getStationSanctioned(psCurrentSubDivision, psCurrentCircle, '', rg);
            }
        } else if (psCurrentSubDivision) {
            const circles = psHierarchy[psCurrentSubDivision];
            circles.forEach(c => {
                if (c.stations.length > 0) {
                    c.stations.forEach(s => {
                        sanctioned += getStationSanctioned(psCurrentSubDivision, c.name, s, rg);
                    });
                } else {
                    sanctioned += getStationSanctioned(psCurrentSubDivision, c.name, '', rg);
                }
            });
        } else {
            const sancKey = 'NEW_CIVIL_' + rg;
            sanctioned = sanctionedData[sancKey] || 0;
        }
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

    document.getElementById('psSearchInput').value = '';
    renderPSPersonnel(personnel);
    document.getElementById('psPersonnelSection').classList.add('visible');
}

function renderPSPersonnel(personnel) {
    if (personnel.length === 0) {
        document.getElementById('psPersonnelTable').style.display = 'none';
        document.getElementById('psPersonnelEmpty').style.display = 'block';
    } else {
        document.getElementById('psPersonnelTable').style.display = 'table';
        document.getElementById('psPersonnelEmpty').style.display = 'none';
        document.getElementById('psPersonnelBody').innerHTML = personnel.map((p, i) => {
            let actionCell = `<button class="action-btn btn-primary" onclick="showPersonnelDetail('${p.id}')">Details</button>`;
            if (userRole === 'ADMIN') {
                actionCell += ` <button class="action-btn btn-primary" onclick="editPersonnel('${p.id}')">Edit</button>
                              <button class="action-btn btn-danger" onclick="deletePersonnelRecord('${p.id}')">Del</button>`;
            }
            return `<tr>
                <td>${i+1}</td>
                <td>${escapeHtml(p.name)}</td>
                <td>${escapeHtml(p.rank)}</td>
                <td>${escapeHtml(p.genl_no)}</td>
                <td>${escapeHtml(p.present_working) || '-'}</td>
                <td style="color:${p.status === 'Present' ? 'green' : 'red'}">${escapeHtml(p.status)}</td>
                <td>${actionCell}</td>
            </tr>`;
        }).join('');
    }
}

function filterPSPersonnel() {
    const searchTerm = document.getElementById('psSearchInput').value.toLowerCase().trim();
    const ranks = rankGroups[psViewRankGroup] || [psViewRankGroup];
    let personnel = getPSPersonnelForLocation().filter(p => ranks.includes(p.rank));

    if (searchTerm) {
        personnel = personnel.filter(p => 
            p.name.toLowerCase().includes(searchTerm) ||
            p.genl_no.toLowerCase().includes(searchTerm) ||
            p.rank.toLowerCase().includes(searchTerm) ||
            (p.present_working && p.present_working.toLowerCase().includes(searchTerm))
        );
    }

    renderPSPersonnel(personnel);
}

// ==================== STATION SANCTIONS MANAGEMENT ====================

// Phase 6: the editor reads the server-authoritative in-memory cache, so it
// must be refreshed before rendering. Without this, entering the page directly
// (or after a reload) shows zeros even when D1 holds values.
async function showStationSanctionsPage() {
    await loadStationSanctionedData();
    showPage('stationSanctions');
    showSSLocationList();
}

function getAllLeafLocations() {
    const locations = [];
    for (const [subDiv, circles] of Object.entries(psHierarchy)) {
        circles.forEach(c => {
            if (c.stations.length === 0) {
                locations.push({ subDiv, circle: c.name, station: '', label: c.name, path: `${subDiv} > ${c.name}` });
            } else {
                c.stations.forEach(s => {
                    locations.push({ subDiv, circle: c.name, station: s, label: s, path: `${subDiv} > ${c.name} > ${s}` });
                });
            }
        });
    }
    return locations;
}

function showSSLocationList() {
    document.getElementById('ssLocationSection').classList.add('visible');
    document.getElementById('ssRankEditor').classList.remove('visible');
    renderSSLocations();
}

function renderSSLocations() {
    const locations = getAllLeafLocations();
    const searchTerm = document.getElementById('ssLocationSearch')?.value.toLowerCase().trim() || '';

    let filtered = locations;
    if (searchTerm) {
        filtered = locations.filter(l => l.path.toLowerCase().includes(searchTerm) || l.label.toLowerCase().includes(searchTerm));
    }

    document.getElementById('ssLocationTiles').innerHTML = filtered.map(l =>
        `<div class="sub-tile" onclick="selectSSLocation('${escapeQuotes(l.subDiv)}', '${escapeQuotes(l.circle)}', '${escapeQuotes(l.station)}', '${escapeQuotes(l.label)}')">${l.label}<div style="font-size:11px;color:#888;margin-top:4px;">${l.path}</div></div>`
    ).join('');
}

function filterSSLocations() {
    renderSSLocations();
}

function selectSSLocation(subDiv, circle, station, label) {
    ssCurrentSubDiv = subDiv;
    ssCurrentCircle = circle;
    ssCurrentStation = station;

    document.getElementById('ssEditorTitle').textContent = label + ' - Sanctioned Strength';

    const displayRanks = displayRanksMap['NEW_CIVIL'] || [];
    let html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:15px;">';
    displayRanks.forEach(rg => {
        const val = getStationSanctioned(subDiv, circle, station, rg);
        html += `
            <div class="form-group">
                <label style="font-size:13px;font-weight:600;">${rg}</label>
                <input type="number" class="ss-sanc-input" data-rank="${escapeQuotes(rg)}" value="${val}" min="0" style="width:100%;padding:8px;text-align:center;font-size:16px;margin-top:5px;">
            </div>
        `;
    });
    html += '</div>';

    document.getElementById('ssRankInputs').innerHTML = html;
    document.getElementById('ssLocationSection').classList.remove('visible');
    document.getElementById('ssRankEditor').classList.add('visible');
}

async function saveStationSanctions() {
    const inputs = Array.from(document.querySelectorAll('.ss-sanc-input'));
    if (inputs.length === 0) {
        showToast('No sanctioned strength values to save', 'error');
        return;
    }
    if (userRole !== 'ADMIN') {
        showToast('Admin access required to modify sanctioned strength', 'error');
        return;
    }

    try {
        for (const inp of inputs) {
            const rank = inp.dataset.rank;
            const value = parseInt(inp.value) || 0;
            setStationSanctioned(ssCurrentSubDiv, ssCurrentCircle, ssCurrentStation, rank, value);
            await updateStationSanctionedStrength(ssCurrentSubDiv, ssCurrentCircle, ssCurrentStation, rank, value);
        }
        showToast('Station sanctioned strengths saved', 'success');
    } catch (e) {
        console.error('Error saving station sanctioned strength:', e);
        showToast('Failed to save station sanctioned strengths', 'error');
        return;
    }

    // Refresh Police Station Data strength abstract if visible
    if (document.getElementById('policeStation').classList.contains('active')) {
        showPSStrengthAbstract();
    }
}

// ── One-time station sanctioned strength migration from localStorage ──
async function checkStationMigration() {
    if (userRole !== 'ADMIN') return;
    if (localStorage.getItem('station_migration_complete')) return;
    const oldData = localStorage.getItem('station_sanctioned_data');
    if (!oldData) {
        localStorage.setItem('station_migration_complete', 'true');
        return;
    }

    let parsed;
    try { parsed = JSON.parse(oldData); } catch { localStorage.setItem('station_migration_complete', 'true'); return; }

    const keys = Object.keys(parsed);
    if (keys.length === 0) {
        localStorage.setItem('station_migration_complete', 'true');
        return;
    }

    const currentData = await getStationSanctionedStrength();
    const currentMap = {};
    if (currentData.data) {
        currentData.data.forEach(s => {
            const key = getStationSancKey(s.sub_division, s.circle, s.station, s.rank);
            currentMap[key] = s.sanctioned_count;
        });
    }

    const newEntries = [];
    const changedEntries = [];
    for (const key of keys) {
        const val = parseInt(parsed[key]) || 0;
        const parts = key.split('|');
        const subDiv = parts[0] || '';
        const circle = parts[1] || '';
        const station = parts[2] || '';
        const rank = parts[3] || '';
        if (!subDiv || !rank) continue;

        if (!(key in currentMap)) {
            newEntries.push({ sub_division: subDiv, circle, station, rank, sanctioned_count: val });
        } else if (currentMap[key] !== val) {
            changedEntries.push({ sub_division: subDiv, circle, station, rank, sanctioned_count: val, old_value: currentMap[key] });
        }
    }

    if (newEntries.length === 0 && changedEntries.length === 0) {
        localStorage.setItem('station_migration_complete', 'true');
        return;
    }

    const proceed = confirm(
        `Station Sanctioned Data Migration\n\n` +
        `New entries: ${newEntries.length}\n` +
        `Changed entries: ${changedEntries.length}\n\n` +
        `Do you want to migrate this data to the server?\n` +
        `(Existing server values will be overwritten for changed entries)`
    );

    if (!proceed) {
        const skip = confirm('Skip migration? (You can migrate later by clearing station_migration_complete flag)');
        if (skip) localStorage.setItem('station_migration_complete', 'true');
        return;
    }

    const allEntries = [...newEntries, ...changedEntries];
    for (const entry of allEntries) {
        await updateStationSanctionedStrength(entry.sub_division, entry.circle, entry.station, entry.rank, entry.sanctioned_count);
    }

    await loadStationSanctionedData();
    localStorage.setItem('station_migration_complete', 'true');
    showToast(`Station data migrated: ${allEntries.length} entries saved`, 'success');
}
