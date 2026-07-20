// Authentication Module

async function handleAuth() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');
    const btn = document.getElementById('loginBtn');

    errorEl.style.display = 'none';

    if (!email || !password) {
        errorEl.textContent = 'Please fill all fields';
        errorEl.style.display = 'block';
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Logging in...';
    showLoading();

    try {
        const result = await loginUser(email, password);

        if (result.token) {
            authToken = result.token;
            userRole = result.user.role;
            localStorage.setItem('authToken', authToken);
            localStorage.setItem('userRole', userRole);
            localStorage.setItem('userEmail', email);
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('mainHeader').style.display = 'flex';
            document.getElementById('mainContainer').style.display = 'block';
            document.getElementById('userEmail').textContent = email;
            updateUserBadge();
            await loadAllData();
            showToast('Welcome!', 'success');
        }
    } catch (e) {
        errorEl.textContent = e.message || 'Authentication failed';
        errorEl.style.display = 'block';
        console.error('Auth error:', e);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Login';
        hideLoading();
    }
}

async function handleLogout() {
    authToken = null;
    userRole = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userEmail');
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('mainHeader').style.display = 'none';
    document.getElementById('mainContainer').style.display = 'none';
    document.getElementById('loginEmail').value = '';
    document.getElementById('loginPassword').value = '';
    allPersonnel = [];
}

async function checkAuth() {
    if (authToken) {
        userRole = localStorage.getItem('userRole');
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('mainHeader').style.display = 'flex';
        document.getElementById('mainContainer').style.display = 'block';
        document.getElementById('userEmail').textContent = localStorage.getItem('userEmail') || 'User';
        updateUserBadge();

        try {
            await loadAllData();
        } catch (e) {
            if (e.authError) {
                handleLogout();
                showToast('Session expired. Please login again.', 'error');
            } else {
                showToast('Could not load data. Retrying...', 'error');
            }
        }
    }
}

function updateUserBadge() {
    const badge = document.getElementById('userRoleBadge');
    if (badge && userRole) {
        badge.textContent = userRole === 'ADMIN' ? 'Admin' : 'User';
        badge.style.backgroundColor = userRole === 'ADMIN' ? '#d32f2f' : '#1976d2';
        badge.style.color = 'white';
    }
}
