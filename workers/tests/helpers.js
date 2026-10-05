export const TEST_PERSONNEL = {
    name: 'Test Person 001',
    rank: 'PC',
    genl_no: 'TEST-001',
    personnel_type: 'CIVIL',
    district: 'NEW',
    status: 'Present'
};

export const TEST_PERSONNEL_2 = {
    name: 'Test Person 002',
    rank: 'HC',
    genl_no: 'TEST-002',
    personnel_type: 'CIVIL',
    district: 'ERSTWHILE',
    status: 'Present'
};

export const TEST_ADMIN = { email: 'test-admin@example.com', password: 'testpass123', role: 'ADMIN' };
export const TEST_USER = { email: 'test-user@example.com', password: 'testpass123', role: 'USER' };

export function createMockEnv() {
    return {
        DB: createMockDB(),
        JWT_SECRET: 'test-secret-key-for-unit-tests-only',
        ADMIN_EMAIL: 'test-admin@example.com',
        ADMIN_PASSWORD: 'testpass123'
    };
}

function createMockDB() {
    const data = new Map();
    let idCounter = 1;
    return {
        prepare(sql) {
            const self = this;
            return {
                bind(...params) {
                    return {
                        async run() {
                            if (sql.startsWith('INSERT')) {
                                const id = idCounter++;
                                data.set(id, { id, ...params });
                                return { meta: { last_row_id: id, changes: 1 } };
                            }
                            if (sql.startsWith('UPDATE')) {
                                return { meta: { changes: 1 } };
                            }
                            if (sql.startsWith('DELETE')) {
                                return { meta: { changes: 1 } };
                            }
                            return { meta: { changes: 0 } };
                        },
                        async first() {
                            if (sql.startsWith('SELECT COUNT')) {
                                return { count: data.size };
                            }
                            if (sql.startsWith('SELECT * FROM users')) {
                                for (const [id, row] of data) {
                                    if (row.email === params[0]) return row;
                                }
                                return null;
                            }
                            return null;
                        },
                        async all() {
                            return { results: Array.from(data.values()) };
                        }
                    };
                }
            };
        }
    };
}
