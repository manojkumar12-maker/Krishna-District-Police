// Export Module

function exportCSV() {
    if (allPersonnel.length === 0) {
        showToast('No data to export', 'error');
        return;
    }
    let csv = 'Sl.No,Name,Rank,Genl.No,Type,District,Previous Station,Status,Date of Birth,Caste,Education,Date of Promotion,Present Working,On Deployment,Deployment Unit,Date of Deployment,Punishments,Phone Number\n';
    allPersonnel.forEach((p, i) => {
        csv += `${i+1},"${p.name}","${p.rank}","${p.genl_no}","${p.personnel_type}","${p.district}","${p.previous_station || ''}","${p.status}","${p.date_of_birth || ''}","${p.caste || ''}","${p.education || ''}","${p.date_of_promotion || ''}","${p.present_working || ''}","${p.is_on_deployment ? 'Yes' : 'No'}","${p.deployment_unit || ''}","${p.date_of_deployment || ''}","${p.punishments || ''}","${p.phone_number || ''}"\n`;
    });
    downloadFile(csv, `Krishna_District_Personnel_${new Date().toISOString().slice(0,10)}.csv`, 'text/csv');
    showToast('Exported to CSV!', 'success');
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
    if (!confirm('WARNING: This will delete ALL personnel data. This action cannot be undone. Continue?')) return;
    if (!confirm('Are you absolutely sure? This will delete all records from the database.')) return;
    try {
        await clearAllPersonnel();
        await loadAllData();
        showToast('All data cleared', 'success');
    } catch (e) {
        showToast('Error clearing data', 'error');
    }
}