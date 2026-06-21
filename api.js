// API Helper Functions

async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const config = {
        headers: {
            'Content-Type': 'application/json',
            ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
        },
        ...options
    };

    if (config.body && typeof config.body === 'object') {
        config.body = JSON.stringify(config.body);
    }

    try {
        const response = await fetch(url, config);
        const data = await response.json();

        if (!response.ok) {
            const error = new Error(data.error || data.message || `HTTP ${response.status}`);
            if (response.status === 401 || response.status === 403) {
                error.authError = true;
            }
            throw error;
        }

        return data;
    } catch (error) {
        if (error.authError) {
            console.error('Auth Error:', error);
            throw error;
        }
        console.error('API Error:', error);
        throw error;
    }
}

// Auth API
async function loginUser(email, password) {
    return apiRequest('/auth/login', {
        method: 'POST',
        body: { email, password }
    });
}

// Personnel API
async function getAllPersonnel(filters = {}) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
        if (value) params.append(key, value);
    }
    const query = params.toString();
    return apiRequest('/personnel' + (query ? '?' + query : ''));
}

async function getPersonnelById(id) {
    return apiRequest(`/personnel/${id}`);
}

async function createPersonnel(data) {
    return apiRequest('/personnel', {
        method: 'POST',
        body: data
    });
}

async function updatePersonnel(id, data) {
    return apiRequest(`/personnel/${id}`, {
        method: 'PUT',
        body: data
    });
}

async function deletePersonnel(id) {
    return apiRequest(`/personnel/${id}`, {
        method: 'DELETE'
    });
}

async function clearAllPersonnel() {
    return apiRequest('/personnel', {
        method: 'DELETE'
    });
}

// Sanctioned Strength API
async function getSanctionedStrength() {
    return apiRequest('/sanctioned-strength');
}

async function updateSanctionedStrength(district, personnelType, rank, count) {
    return apiRequest('/sanctioned-strength', {
        method: 'POST',
        body: { district, personnel_type: personnelType, rank, sanctioned_count: count }
    });
}

// Deputation Strength API
async function getDeputationStrength() {
    return apiRequest('/deputation-strength');
}

async function updateDeputationStrength(unitName, rank, count) {
    return apiRequest('/deputation-strength', {
        method: 'POST',
        body: { unit_name: unitName, rank, sanctioned_count: count }
    });
}

// Excel Import
async function importPersonnelExcel(file) {
    const formData = new FormData();
    formData.append('file', file);
    const url = `${API_BASE_URL}/personnel/import`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` },
        body: formData
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Import failed');
    return data;
}

// Audit Logs
async function getAuditLogs(filters = {}) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
        if (value) params.append(key, value);
    }
    const query = params.toString();
    return apiRequest('/audit-logs' + (query ? '?' + query : ''));
}

// User Management
async function registerUser(email, password, role) {
    return apiRequest('/auth/register', {
        method: 'POST',
        body: { email, password, role }
    });
}
