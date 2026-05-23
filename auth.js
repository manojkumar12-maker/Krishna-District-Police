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
    btn.textContent = authMode === 'login' ? 'Logging in...' : 'Registering...';
    try {
        let result;
        if (authMode === 'login') {
            result = await loginUser(email, password);
        } else {
            const confirmPw = document.getElementById('loginConfirmPassword').value;
            if (password !== confirmPw) {
                errorEl.textContent = 'Passwords do not match';
                errorEl.style.display = 'block';
                btn.disabled = false;
                btn.textContent = 'Register';
                return;
            }
            result = await registerUser(email, password);
            if (result.success) {
                errorEl.textContent = 'Registration successful! You can now login.';
                errorEl.style.color = '#2e7d32';
                errorEl.style.display = 'block';
                toggleAuthMode();
                btn.disabled = false;
                btn.textContent = 'Login';
                return;
            }
        }
        if (result.token) {
            authToken = result.token;
            localStorage.setItem('authToken', authToken);
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('mainHeader').style.display = 'flex';
            document.getElementById('mainContainer').style.display = 'block';
            document.getElementById('userEmail').textContent = email;
            await loadAllData();
            showToast('Welcome!', 'success');
        }
    } catch (e) {
        errorEl.textContent = e.message || 'Authentication failed';
        errorEl.style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.textContent = authMode === 'login' ? 'Login' : 'Register';
    }
}

async function handleLogout() {
    authToken = null;
    localStorage.removeItem('authToken');
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('mainHeader').style.display = 'none';
    document.getElementById('mainContainer').style.display = 'none';
    document.getElementById('loginEmail').value = '';
    document.getElementById('loginPassword').value = '';
    allPersonnel = [];
}

function toggleAuthMode() {
    authMode = authMode === 'login' ? 'register' : 'login';
    document.getElementById('loginTitle').textContent = authMode === 'login' ? 'Login' : 'Register';
    document.getElementById('loginBtn').textContent = authMode === 'login' ? 'Login' : 'Register';
    document.getElementById('registerFields').style.display = authMode === 'register' ? 'block' : 'none';
    document.getElementById('authToggleText').textContent = authMode === 'login' ? "Don't have an account?" : "Already have an account?";
    document.getElementById('authToggleLink').textContent = authMode === 'login' ? 'Register' : 'Login';
    document.getElementById('loginError').style.display = 'none';
}

async function checkAuth() {
    if (authToken) {
        try {
            await getAllPersonnel();
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('mainHeader').style.display = 'flex';
            document.getElementById('mainContainer').style.display = 'block';
            await loadAllData();
        } catch (e) {
            handleLogout();
        }
    }
}