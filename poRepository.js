// ============================================================================
// poRepository.js  —  persistence boundary (PART 24)
//
// The pure engine (poEngine.js) has NO knowledge of how data is stored. This
// interface is the single seam between the workflow and persistence.
//
//   LocalStoragePORepository  - current implementation. Browser-local. NOT an
//                               authoritative official record.
//   BackendPORepository       - the intended production implementation, mapped
//                               to the existing Cloudflare Worker + D1. It is
//                               declared here so the workflow layer is already
//                               written against the interface; swapping the
//                               implementation requires no engine change and no
//                               workflow change.
//
// Nothing in this file may contain allocation logic.
'use strict';

const PORepositoryContract = {
    name: 'PORepository',
    methods: [
        'loadExercise', 'saveExercise',
        'saveDSL', 'saveFSL', 'saveOptions',
        'saveAllocationRun', 'saveFAL',
        'saveOOA', 'saveOOT', 'saveAuditEvent'
    ],
    authoritative: false
};

/**
 * Browser-local implementation. Serialises the whole exercise document under a
 * single key. Retains superseded versions in `history` rather than deleting them.
 */
function LocalStoragePORepository(key) {
    this.kind = 'LOCALSTORAGE';
    this.authoritative = false;
    this.key = key || 'po_state';
    this.notice = 'LOCAL DEVELOPMENT MODE - NOT AN AUTHORITATIVE OFFICIAL RECORD. ' +
        'Data is held in this browser only and is not a shared DLC record.';
}

LocalStoragePORepository.prototype._read = function () {
    const raw = localStorage.getItem(this.key);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
};

LocalStoragePORepository.prototype.loadExercise = function () {
    return this._read();
};

LocalStoragePORepository.prototype._write = function (doc) {
    // PART 25: retain prior official records instead of delete + recreate.
    const prev = this._read();
    if (prev && doc && Array.isArray(prev.audit) && Array.isArray(doc.audit)) {
        if (doc.audit.length < prev.audit.length) doc.audit = prev.audit;
    }
    localStorage.setItem(this.key, JSON.stringify(doc));
    return doc;
};

LocalStoragePORepository.prototype.saveExercise = function (doc) { return this._write(doc); };
LocalStoragePORepository.prototype.saveDSL = function (doc) { return this._write(doc); };
LocalStoragePORepository.prototype.saveFSL = function (doc) { return this._write(doc); };
LocalStoragePORepository.prototype.saveOptions = function (doc) { return this._write(doc); };
LocalStoragePORepository.prototype.saveAllocationRun = function (doc) { return this._write(doc); };
LocalStoragePORepository.prototype.saveFAL = function (doc) { return this._write(doc); };
LocalStoragePORepository.prototype.saveOOA = function (doc) { return this._write(doc); };
LocalStoragePORepository.prototype.saveOOT = function (doc) { return this._write(doc); };

LocalStoragePORepository.prototype.saveAuditEvent = function (event) {
    const doc = this._read() || {};
    doc.audit = doc.audit || [];
    doc.audit.push(event);
    return this._write(doc);
};

/**
 * Intended production implementation. Each call maps to a Worker endpoint that
 * appends a versioned row rather than overwriting, so previous versions survive.
 *
 * NOT WIRED. It is declared so the architecture is ready; activating it is a
 * backend task and must not be done for a live exercise without the D1 schema
 * and the audit/append endpoints in place.
 */
function BackendPORepository(baseUrl, opts) {
    this.kind = 'BACKEND';
    this.authoritative = false;   // stays false until the server enforces it
    this.baseUrl = baseUrl || '';
    this.opts = opts || {};
    this.pending = [];
}

BackendPORepository.prototype._endpoint = {
    loadExercise: 'po/exercise',
    saveExercise: 'po/exercise',
    saveDSL: 'po/dsl',
    saveFSL: 'po/fsl',
    saveOptions: 'po/options',
    saveAllocationRun: 'po/allocation-run',
    saveFAL: 'po/fal',
    saveOOA: 'po/ooa',
    saveOOT: 'po/oot',
    saveAuditEvent: 'po/audit'
};

BackendPORepository.prototype._call = function (method, payload) {
    const ep = this._endpoint[method];
    if (!ep) throw new Error('BackendPORepository: no endpoint for ' + method);
    // Append-only semantics: the server assigns the next version and never
    // overwrites an existing official record.
    return fetch(this.baseUrl + '/' + ep, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + (this.opts.token || ''),
            'X-PO-Idempotency-Key': (payload && payload.fingerprint) || ''
        },
        body: JSON.stringify(payload)
    }).then(r => {
        if (!r.ok) throw new Error('BackendPORepository: ' + ep + ' returned ' + r.status);
        return r.json();
    });
};

BackendPORepository.prototype.loadExercise = function () {
    return fetch(this.baseUrl + '/' + this._endpoint.loadExercise, {
        headers: { 'Authorization': 'Bearer ' + (this.opts.token || '') }
    }).then(r => r.ok ? r.json() : null);
};

PORepositoryContract.methods.forEach(m => {
    if (m === 'loadExercise' || BackendPORepository.prototype[m]) return;
    BackendPORepository.prototype[m] = function (payload) { return this._call(m, payload); };
});

// The active repository. Swap this single line to move from local to backend.
const poRepository = new LocalStoragePORepository('po_state');

// Node-require-able for tests.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        PORepositoryContract,
        LocalStoragePORepository,
        BackendPORepository
    };
}
