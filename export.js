function exportCSV() {
    if (allPersonnel.length === 0) {
        showToast('No data to export', 'error');
        return;
    }
    let csv = 'Name,Rank,Genl.No,Type,District,Status,Phone\n';
    allPersonnel.forEach(p => {
        csv += `"${p.name}","${p.rank}","${p.genl_no}","${p.personnel_type}","${p.district}","${p.status}","${p.phone_number || ''}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Krishna_Personnel_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Exported to CSV!', 'success');
}

async function clearAllData() {
    if (!confirm('Delete ALL data?')) return;
    try {
        await clearAllPersonnel();
        await loadAllData();
        showToast('All data cleared', 'success');
    } catch (e) {
        showToast('Error clearing data', 'error');
    }
}