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
            throw new Error(data.error || data.message || `HTTP ${response.status}`);
        }

        return data;
    } catch (error) {
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

async function registerUser(email, password) {
    return apiRequest('/auth/register', {
        method: 'POST',
        body: { email, password }
    });
}

// Personnel API
async function getAllPersonnel() {
    return apiRequest('/personnel');
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

async function updateSanctionedStrength(district, type, rank, count) {
    return apiRequest('/sanctioned-strength', {
        method: 'POST',
        body: { district, personnel_type: type, rank, sanctioned_count: count }
    });
}

// Deputation Strength API
async function getDeputationStrength() {
    return apiRequest('/deputation-strength');
}

async function updateDeputationStrength(unit, rank, count) {
    return apiRequest('/deputation-strength', {
        method: 'POST',
        body: { unit_name: unit, rank, sanctioned_count: count }
    });
}