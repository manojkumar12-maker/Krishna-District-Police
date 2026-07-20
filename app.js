// Main Application Entry Point

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast';
    if (type === 'success') toast.classList.add('success');
    else if (type === 'error') toast.classList.add('error');
    else if (type === 'loading') toast.classList.add('loading');
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function showLoading() {
    document.getElementById('loadingSpinner').classList.add('show');
}

function hideLoading() {
    document.getElementById('loadingSpinner').classList.remove('show');
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Attach event listeners
    document.getElementById('loginBtn').addEventListener('click', handleAuth);

    // Check if user is already logged in
    checkAuth();
});
