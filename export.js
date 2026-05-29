// Export Module

function exportCSV() {
    if (allPersonnel.length === 0) {
        showToast('No data to export', 'error');
        return;
    }

    let csv = `Sl.No,Name,Rank,Genl.No,Type,District,Previous Station,Status,Date of Birth,Caste,Education,Date of Promotion,Present Working,On Deployment,Deployment Unit,Date of Deployment,Punishments,Phone Number
`;

    allPersonnel.forEach((p, i) => {
        csv += `${i+1},"${p.name}","${p.rank}","${p.genl_no}","${p.personnel_type}","${p.district}","${p.previous_station || ''}","${p.status}","${p.date_of_birth || ''}","${p.caste || ''}","${p.education || ''}","${p.date_of_promotion || ''}","${p.present_working || ''}","${p.is_on_deployment ? 'Yes' : 'No'}","${p.deployment_unit || ''}","${p.date_of_deployment || ''}","${p.punishments || ''}","${p.phone_number || ''}"
`;
    });

    downloadFile(csv, `Krishna_District_Personnel_${new Date().toISOString().slice(0,10)}.csv`, 'text/csv');
    showToast('Exported to CSV!', 'success');
}

function exportKNExcel() {
    const groupFilter = rankGroups[knCurrentRank] || [knCurrentRank];
    const data = allPersonnel.filter(p => 
        p.district === 'NEW' && 
        p.personnel_type === knCurrentType && 
        groupFilter.includes(p.rank) && 
        !p.is_on_deployment
    );

    const sancKey = 'NEW_' + knCurrentType + '_' + knCurrentRank;
    const sanctionedCount = sanctionedData[sancKey] || 0;
    const actualCount = data.length;
    const vac = sanctionedCount - actualCount;

    let csv = `Krishna District (New) - ${knCurrentType} - ${knCurrentRank}
`;
    csv += `Sanctioned Strength,${sanctionedCount}
Actual Strength,${actualCount}
Vacancies,${vac}

`;
    csv += `Sl.No,Name,Genl.No,Present Working,Status
`;

    data.forEach((p, i) => { 
        csv += `${i+1},"${p.name}","${p.genl_no}","${p.present_working || ''}","${p.status}"
`; 
    });

    downloadFile(csv, `Krishna_New_${knCurrentType}_${knCurrentRank.replace(/[^a-zA-Z0-9]/g, '_')}.csv`, 'text/csv');
    showToast('Exported to Excel!', 'success');
}

function exportKNPDF() {
    const groupFilter = rankGroups[knCurrentRank] || [knCurrentRank];
    const data = allPersonnel.filter(p => 
        p.district === 'NEW' && 
        p.personnel_type === knCurrentType && 
        groupFilter.includes(p.rank) && 
        !p.is_on_deployment
    );

    const sancKey = 'NEW_' + knCurrentType + '_' + knCurrentRank;
    const sanctionedCount = sanctionedData[sancKey] || 0;
    const vac = sanctionedCount - data.length;

    const printWind = window.open('', '', 'width=800,height=600');
    printWind.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Krishna District Police</title>
            <style>
                body { font-family: serif; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid #000; padding: 8px; text-align: left; }
                h2, h3 { text-align: center; }
                .summary { display: flex; justify-content: space-around; margin: 20px 0; font-size: 18px; }
                @media print { .no-print { display: none; } }
            </style>
        </head>
        <body>
            <h2>Krishna District (New)</h2>
            <h3>Strength: ${knCurrentType} - ${knCurrentRank}</h3>
            <div class="summary">
                <div><b>Sanctioned:</b> ${sanctionedCount}</div>
                <div><b>Actual:</b> ${data.length}</div>
                <div><b>Vacancies:</b> ${vac}</div>
            </div>
            <table>
                <thead>
                    <tr><th>Sl.No</th><th>Name</th><th>Genl.No</th><th>Present Working</th><th>Status</th></tr>
                </thead>
                <tbody>
                    ${data.map((p, i) => `<tr><td>${i+1}</td><td>${p.name}</td><td>${p.genl_no}</td><td>${p.present_working || '-'}</td><td>${p.status}</td></tr>`).join('')}
                </tbody>
            </table>
            <br>
            <button class="no-print" onclick="window.print()">Print</button>
        </body>
        </html>
    `);
    printWind.document.close();
}

function exportEWExcel() {
    const groupFilter = rankGroups[ewCurrentRank] || [ewCurrentRank];
    const data = allPersonnel.filter(p => 
        p.district === 'ERSTWHILE' && 
        p.personnel_type === ewCurrentType && 
        groupFilter.includes(p.rank) && 
        !p.is_on_deployment
    );

    const sancKey = 'ERSTWHILE_' + ewCurrentType + '_' + ewCurrentRank;
    const sanctionedCount = sanctionedData[sancKey] || 0;
    const actualCount = data.length;
    const vac = sanctionedCount - actualCount;

    let csv = `Erstwhile Krishna District - ${ewCurrentType} - ${ewCurrentRank}
`;
    csv += `Sanctioned Strength,${sanctionedCount}
Actual Strength,${actualCount}
Vacancies,${vac}

`;
    csv += `Sl.No,Name,Genl.No,Present Working,Status
`;

    data.forEach((p, i) => { 
        csv += `${i+1},"${p.name}","${p.genl_no}","${p.present_working || ''}","${p.status}"
`; 
    });

    downloadFile(csv, `Erstwhile_${ewCurrentType}_${ewCurrentRank.replace(/[^a-zA-Z0-9]/g, '_')}.csv`, 'text/csv');
    showToast('Exported to Excel!', 'success');
}

function exportEWPDF() {
    const groupFilter = rankGroups[ewCurrentRank] || [ewCurrentRank];
    const data = allPersonnel.filter(p => 
        p.district === 'ERSTWHILE' && 
        p.personnel_type === ewCurrentType && 
        groupFilter.includes(p.rank) && 
        !p.is_on_deployment
    );

    const sancKey = 'ERSTWHILE_' + ewCurrentType + '_' + ewCurrentRank;
    const sanctionedCount = sanctionedData[sancKey] || 0;
    const vac = sanctionedCount - data.length;

    const printWind = window.open('', '', 'width=800,height=600');
    printWind.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Krishna District Police</title>
            <style>
                body { font-family: serif; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid #000; padding: 8px; text-align: left; }
                h2, h3 { text-align: center; }
                .summary { display: flex; justify-content: space-around; margin: 20px 0; font-size: 18px; }
                @media print { .no-print { display: none; } }
            </style>
        </head>
        <body>
            <h2>Erstwhile Krishna District</h2>
            <h3>Strength: ${ewCurrentType} - ${ewCurrentRank}</h3>
            <div class="summary">
                <div><b>Sanctioned:</b> ${sanctionedCount}</div>
                <div><b>Actual:</b> ${data.length}</div>
                <div><b>Vacancies:</b> ${vac}</div>
            </div>
            <table>
                <thead>
                    <tr><th>Sl.No</th><th>Name</th><th>Genl.No</th><th>Present Working</th><th>Status</th></tr>
                </thead>
                <tbody>
                    ${data.map((p, i) => `<tr><td>${i+1}</td><td>${p.name}</td><td>${p.genl_no}</td><td>${p.present_working || '-'}</td><td>${p.status}</td></tr>`).join('')}
                </tbody>
            </table>
            <br>
            <button class="no-print" onclick="window.print()">Print</button>
        </body>
        </html>
    `);
    printWind.document.close();
}

function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function clearAllData() {
    if (userRole !== 'ADMIN') {
        showToast('Only administrators can clear data', 'error');
        return;
    }

    if (!confirm('WARNING: This will delete ALL personnel data. This action cannot be undone. Continue?')) {
        return;
    }
    if (!confirm('Are you absolutely sure? This will delete all records from the database.')) {
        return;
    }

    try {
        await clearAllPersonnel();
        await loadAllData();
        showToast('All data cleared', 'success');
    } catch (e) {
        showToast('Error clearing data', 'error');
    }
}
