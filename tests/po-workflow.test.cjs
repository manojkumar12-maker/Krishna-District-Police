/**
 * G.O.Ms.No.129 workflow tests — the state machine, the per-cadre seniority list
 * upload, the DLC policy freeze, the option lifecycle and the order stage.
 *
 *   node --test tests/po-workflow.test.cjs
 *
 * poCore.js is written for a browser, so a minimal localStorage / userRole /
 * showToast / navigator shim is installed before it is loaded. No engine logic
 * is re-implemented here: the assertions call the real poCore functions.
 *
 * There is no DSL stage, no objection window and no audit trail in this
 * workflow. Those absences are asserted, not merely assumed.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

// --- minimal browser shim ---------------------------------------------------
const store = new Map();
global.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k)
};
const toasts = [];
global.showToast = (msg, type) => toasts.push({ msg, type });
global.navigator = { userAgent: 'node-test' };
global.userRole = 'ADMIN';
global.localStorage.setItem('userEmail', 'dlc@krishna.police');
global.localStorage.setItem('userRole', 'ADMIN');

const E = require(path.join(ROOT, 'poEngine.js'));
const R = require(path.join(ROOT, 'poRepository.js'));

/** Names the tests need. Anything absent is simply omitted from the result, so
 *  a rename in poCore.js surfaces as one clear assertion failure rather than a
 *  ReferenceError in the loader. */
const CORE_EXPORTS = [
    'poFreshState', 'poLoad', 'poSave', 'poStageGuard', 'poAdvance', 'poStage', 'poCtx',
    'poSyncStrengthMatrix', 'poSaveExercise', 'poSetStrength', 'poSetApprovedStrength',
    'poAutoSplitWorkingStrength',
    'poImportSeniorityRows', 'poRowToSeniorityRecord', 'poRunSeniorityValidation',
    'poSeniorityTemplateCsv', 'poSeniorityExportCsv',
    'poFinalizeSeniorityList', 'poPublishFsl', 'poReviseFsl', 'poTimeline',
    'poSaveOption', 'poCorrectOption', 'poCloseOptions', 'poOpenOptions',
    'poOptionDeadline', 'poNoOptionEmployees', 'poApplicableCadreIds',
    'poSetPolicy', 'poFreezePolicy', 'poPolicyFrozen',
    'poRunEngine', 'poSimulateAllocation', 'poConfirmAllocation', 'poFALValidation',
    'poGenerateFal', 'poApproveFal', 'poPublishFal', 'poReviseFal',
    'poGenerateOoa', 'poApproveOoa', 'poIssueOoa', 'poReviseOoa',
    'poGenerateOot', 'poIssueOot', 'poRecordJoining',
    'poUnresolvedJoining', 'poOverrideJoiningClosure', 'poJoiningClosureOverridden',
    'poAcceptScstException', 'poExceptionReport', 'poErrorDetail', 'poIssueDetail',
    'poEvent', 'poRecordEvent', 'poIsAdmin', 'poUser', 'poNow',
    'poVersionLabel', 'poBumpVersion', 'poSetStageDirect', 'poCompetentAuthority',
    'poDlcSeats', 'poDlc', 'poSeatLabel', 'poFreshDlc', 'PO_DLC_ROLES',
    'poResetAll', 'PO_STEPS',
    'PO_JOINING_STATUS', 'PO_DEFAULT_OPTION_DAYS', 'PO_DEFAULT_JOINING_DAYS',
    'PO_STORAGE_MODE_NOTICE', 'PO_DEFAULT_SEG_PERCENTS', 'PO_EVENT_KEYS',
    'PO_DEFAULT_CADRES', 'PO_DATA_VERSION'
];

/** Evaluate poCore.js in this scope and surface the API the tests drive. */
function loadCore() {
    const src = fs.readFileSync(path.join(ROOT, 'poCore.js'), 'utf8');
    const names = JSON.stringify(CORE_EXPORTS);
    global.POEngine = E;
    global.poRepository = R;
    // A plain `for` loop keeps eval() in the SAME scope as the poCore
    // declarations. forEach() or an IIFE would create a nested scope.
    // eslint-disable-next-line no-new-func
    const fn = new Function(src +
        '\n;var __out={},__n=' + names + ';' +
        'for (var __i=0;__i<__n.length;__i++){try{__out[__n[__i]]=eval(__n[__i]);}catch(e){}}' +
        '__out.__state=function(){return poState;};return __out;');
    const api = fn();
    Object.defineProperty(api, 'poState', { get: () => api.__state() });
    return api;
}

let C;
test.before(() => { C = loadCore(); });

// --- scenario builder -------------------------------------------------------

function freshState() {
    store.clear();
    store.set('userEmail', 'dlc@krishna.police');
    store.set('userRole', 'ADMIN');
    C.poLoad();
    C.poState.categories = [
        { id: 'CAT_SI', code: 'SI', name: 'Sub-Inspector of Police', status: 'ACTIVE' }
    ];
    C.poSyncStrengthMatrix();
    C.poSetStrength('CAT_SI', 'DC_KRISHNA', 'cadre_strength', 8);
    C.poSetStrength('CAT_SI', 'DC_KRISHNA', 'fws', 3);
    C.poSetStrength('CAT_SI', 'DC_NTR', 'cadre_strength', 5);
    C.poSetStrength('CAT_SI', 'DC_NTR', 'fws', 1);
    C.poSetStrength('CAT_SI', 'DC_ELURU', 'cadre_strength', 0);
    C.poSetStrength('CAT_SI', 'DC_ELURU', 'fws', 0);
    C.poSetApprovedStrength('CAT_SI', 4);
    const ex = C.poState.exercise;
    ex.exercise_id = 'PO2026-KRN-001';
    ex.department = 'Police';
    ex.erstwhile_district = 'Krishna';
    // Only designations are official inputs; the nine seats are prescribed.
    C.poDlc().forEach((d, i) => { d.designation = i === 0 ? 'District Collector' : (i === 3 ? 'SP, Krishna' : 'Seat ' + (i + 1)); });
    C.poSaveExercise();
    return C.poState;
}

/** Upload one rank's seniority list. All employees are assigned to DC_KRISHNA. */
function importSeniority(n, categoryId) {
    const cat = categoryId || 'CAT_SI';
    const rows = [];
    for (let i = 1; i <= n; i++) {
        rows.push({
            seniority_no: String(i), name: 'E' + i, category_id: cat, gender: 'Male',
            cfms_id: 'C' + i, mobile: '90000000' + i, date_of_birth: '01-01-1990',
            date_of_joining_category: '01-01-2015', social_category: 'BC-B',
            present_working_place: 'Krishna PS', service_status: 'PRESENT'
        });
    }
    return C.poImportSeniorityRows(rows, true, cat);
}

/** Drive the real workflow to the point where the list can be locked.
 *  Locking is what COMPLETES FSL_UPLOADED, so it happens while the stage is
 *  still FSL_UPLOADED; advancing then asserts that the work is done. */
function advanceToListReady() {
    const st = C.poState;
    st.stage = 'FSL_UPLOADED';
    const locked = C.poFinalizeSeniorityList();
    if (locked) C.poAdvance('uploaded and locked');
    return locked;
}

/** A fully prepared state: list locked and published, options locked, run ready. */
function readyToAllocate(n, opts) {
    const o = opts || {};
    freshState();
    importSeniority(n);
    const locked = advanceToListReady();
    if (!locked) throw new Error('seniority list refused; errors=' + JSON.stringify(C.poStageGuard().errors));
    const st = C.poState;
    assert.strictEqual(C.poPublishFsl(), true);
    C.poOpenOptions();
    (o.options || []).forEach(p => {
        const r = C.poSaveOption(p.id, p.p1, p.p2 || '', p.p3 || '');
        if (!r.ok) throw new Error('option refused for ' + p.id + ': ' + r.errors[0]);
    });
    if (o.closeOptions !== false) C.poCloseOptions();
    return st;
}

function fslRows(list) {
    return (list || []).map((r, i) => Object.assign({
        employee_id: 'E' + (i + 1), name: 'E' + (i + 1), category_id: 'CAT_SI', rank_code: 'SI',
        seniority_no: i + 1, social_category: 'OC', sc_group: '',
        erstwhile_cadre_id: 'DC_KRISHNA', present_local_cadre_id: 'DC_KRISHNA',
        present_working_place: 'KRN PS', service_status: 'PRESENT',
        date_of_birth: '1990-01-01', date_of_joining_category: '2015-01-01',
        claims: {}, fsl_version: 1
    }, r || {}));
}

// ===========================================================================
// Scope and shape
// ===========================================================================
test('scope: the module is fixed to Krishna, NTR and Eluru', () => {
    const st = freshState();
    assert.deepStrictEqual(st.cadres.map(c => c.id), ['DC_KRISHNA', 'DC_NTR', 'DC_ELURU']);
    assert.strictEqual(C.PO_DEFAULT_CADRES.length, 3);
    assert.strictEqual(st.cadres.find(c => c.id === 'DC_ELURU').cadre_type, 'CONTIGUOUS_DISTRICT');
    // A reload always restores exactly the fixed set, never anything carried in.
    st.cadres.push({ id: 'DC_ATLANTIS', name: 'Atlantis', cadre_type: 'CONTIGUOUS_DISTRICT', status: 'ACTIVE' });
    C.poSave();
    C.poLoad();
    assert.deepStrictEqual(C.poState.cadres.map(c => c.id), ['DC_KRISHNA', 'DC_NTR', 'DC_ELURU']);
});

test('shape: the workflow has seven steps and no DSL screen', () => {
    assert.deepStrictEqual(C.PO_STEPS.map(s => s.key),
        ['ranks', 'strength', 'seniority', 'options', 'allocation', 'fal', 'orders']);
    C.PO_STEPS.forEach(s => assert.ok(E.PO_STAGE_INDEX[s.from] !== undefined, 'step ' + s.key + ' has a real stage'));
});

test('shape: the objection subsystem and the audit trail are gone', () => {
    const st = freshState();
    ['poRaiseObjection', 'poDisposeObjection', 'poCloseObjectionWindow',
     'poObjectionWindowOpen', 'poPendingObjections', 'poFslEligible',
     'poAudit', 'poDashboard', 'poBuildFslFromDsl', 'poImportDslRows'].forEach(n => {
        assert.strictEqual(C[n], undefined, n + ' must no longer exist');
    });
    assert.strictEqual(st.objections, undefined, 'no objection store');
    assert.strictEqual(st.audit, undefined, 'no audit store');
    assert.strictEqual(st.dsl, undefined, 'no draft seniority list');
    ['dsl_published_at', 'objection_opened_at', 'objections_disposed_at'].forEach(k => {
        assert.strictEqual(C.PO_EVENT_KEYS.indexOf(k), -1, k + ' is no longer a procedural event');
    });
});

test('DLC: the composition is the nine prescribed seats, designations only', () => {
    freshState();
    assert.deepStrictEqual(C.PO_DLC_ROLES.map(r => r.role),
        ['Chairman', 'Co-Chairman', 'Member-Convener', 'Co-Convener', 'Member', 'Co-Member']);
    assert.deepStrictEqual(C.PO_DLC_ROLES.map(r => r.count), [1, 2, 1, 2, 1, 2]);

    const seats = C.poDlcSeats();
    assert.strictEqual(seats.length, 9);
    assert.deepStrictEqual(seats.map(s => C.poSeatLabel(s)), [
        'Chairman', 'Co-Chairman 1', 'Co-Chairman 2',
        'Member-Convener', 'Co-Convener 1', 'Co-Convener 2',
        'Member', 'Co-Member 1', 'Co-Member 2'
    ]);

    // No name is ever held for any seat.
    const st = C.poState;
    assert.strictEqual(st.exercise.dlc.length, 9);
    Object.keys(st.exercise).forEach(k => {
        assert.ok(!/chairman_name|member_convener_name|co_convener_name|co_chairman_name|dro_name|other_members/.test(k),
            'the name field ' + k + ' must no longer exist');
    });
    st.exercise.dlc.forEach((d, i) => {
        assert.deepStrictEqual(Object.keys(d).sort(), ['designation', 'n', 'role']);
        assert.strictEqual(d.role, seats[i].role);
        assert.ok(!d.name, 'seat ' + i + ' must not carry a name');
    });
});

test('DLC: the two presiding seats must carry a designation before DRAFT clears', () => {
    freshState();
    const st = C.poState;
    st.exercise.dlc[0].designation = '';
    let g = C.poStageGuard();
    assert.strictEqual(g.ok, false);
    assert.ok(g.errors.some(e => /Chairman designation/.test(e)), g.errors.join(' | '));

    st.exercise.dlc[0].designation = 'District Collector';
    const convener = st.exercise.dlc.filter(d => d.role === 'Member-Convener')[0];
    convener.designation = '';
    g = C.poStageGuard();
    assert.strictEqual(g.ok, false);
    assert.ok(g.errors.some(e => /Member-Convener designation/.test(e)), g.errors.join(' | '));

    convener.designation = 'Superintendent of Police';
    g = C.poStageGuard();
    assert.strictEqual(g.ok, true, g.errors.join(' | '));

    // The competent authority printed on orders is the Chairman's designation.
    assert.strictEqual(C.poCompetentAuthority(), 'District Collector');
    C.poDlc()[0].designation = '';
    assert.strictEqual(C.poCompetentAuthority(), 'DLC Chairman', 'falls back when unset');
});

// ===========================================================================
// TEST 35 - the seniority list is frozen once the option window opens
// ===========================================================================
test('TEST 35: the seniority list cannot be modified once options have opened', () => {
    freshState();
    importSeniority(3);
    assert.strictEqual(advanceToListReady(), 3, 'list locked');

    const before = C.poState.fsl.length;
    assert.strictEqual(before, 3);
    assert.strictEqual(C.poFinalizeSeniorityList(), 0, 'cannot lock twice');

    C.poState.fslPublishedAt = C.poNow();
    C.poOpenOptions();
    const n = C.poImportSeniorityRows([{
        seniority_no: '9', name: 'Late', category_id: 'CAT_SI', gender: 'Male',
        date_of_birth: '01-01-1990', date_of_joining_category: '01-01-2015',
        social_category: 'BC-B', erstwhile_cadre: 'DC_KRISHNA', present_local_cadre: 'DC_KRISHNA'
    }], true);
    assert.strictEqual(n, 0, 'an upload is refused once options have opened');
    assert.strictEqual(C.poState.fsl.length, before, 'the locked list is untouched');

    // And a revision, which is the sanctioned route, retains the previous version.
    C.poReviseFsl('Corrected a cadre after option opening');
    assert.strictEqual(C.poState.fsl.length, 0, 'revision clears the current list');
    assert.ok(C.poState.history.fsl.length > 0, 'the superseded list is retained, not destroyed');
    assert.ok(C.poState.history.options.length > 0, 'the voided options are retained');
});

// ===========================================================================
// Per-rank upload — all employees belong to the single Erstwhile Krishna District Cadre
// ===========================================================================
test('upload: each rank is uploaded separately and replaces only its own rows', () => {
    freshState();
    // Add a second category for the test.
    C.poState.categories.push({ id: 'CAT_HC', code: 'HC', name: 'Head Constable', status: 'ACTIVE' });
    C.poSyncStrengthMatrix();

    assert.strictEqual(importSeniority(3, 'CAT_SI'), 3);
    assert.strictEqual(importSeniority(2, 'CAT_HC'), 2);
    assert.strictEqual(C.poState.fsl.length, 5, 'both ranks present');

    // All employees belong to the single Erstwhile Krishna District Cadre.
    assert.strictEqual(C.poState.fsl.filter(r => r.erstwhile_cadre_id === 'DC_KRISHNA').length, 5);

    // Re-uploading CAT_SI replaces CAT_SI rows and leaves CAT_HC alone.
    assert.strictEqual(importSeniority(4, 'CAT_SI'), 4);
    assert.strictEqual(C.poState.fsl.length, 6, 'CAT_SI 4 + CAT_HC 2');
    assert.strictEqual(C.poState.fsl.filter(r => r.category_id === 'CAT_SI').length, 4);
    assert.strictEqual(C.poState.fsl.filter(r => r.category_id === 'CAT_HC').length, 2);

    // Employee ids are re-keyed so they stay unique after every import.
    const ids = C.poState.fsl.map(r => r.employee_id);
    assert.strictEqual(new Set(ids).size, ids.length, 'employee ids remain unique');
});

test('upload: a file with an unknown category is imported but flagged by validation', () => {
    freshState();
    assert.strictEqual(importSeniority(3, 'CAT_SI'), 3);
    // A row with an unknown category is still imported (the validator flags it).
    const n = C.poImportSeniorityRows([{
        seniority_no: '1', name: 'Stranger', category_id: 'CAT_UNKNOWN',
        date_of_birth: '01-01-1990', date_of_joining_category: '01-01-2015',
        social_category: 'OC'
    }], true);
    assert.strictEqual(n, 1, 'imported — the validator will flag the unknown category');
    assert.strictEqual(C.poState.fsl.length, 4, 'row appended');
    // The unknown category is flagged by the validator.
    const r = C.poRunSeniorityValidation();
    assert.ok(r.errors.some(e => e.code === 'INVALID_CATEGORY'), 'unknown category flagged');
});

// ===========================================================================
// TEST 36 - option modification after lock
// ===========================================================================
test('TEST 36: option modification after lock is blocked; corrections create a new version', () => {
    readyToAllocate(3, { closeOptions: false });
    const a = C.poState.fsl[0].employee_id;
    const b = C.poState.fsl[1].employee_id;

    const r1 = C.poSaveOption(a, 'DC_NTR', '', '');
    assert.strictEqual(r1.ok, true);
    C.poSaveOption(b, 'DC_KRISHNA', '', '');

    C.poCloseOptions();
    assert.strictEqual(C.poState.optionsLocked, true);

    const afterLock = C.poSaveOption(a, 'DC_KRISHNA', '', '');
    assert.strictEqual(afterLock.ok, false, 'no submission after lock');

    // A correction requires reason AND authority.
    assert.strictEqual(C.poCorrectOption(a, 'DC_KRISHNA', '', '', '', 'DLC').ok, false);
    assert.strictEqual(C.poCorrectOption(a, 'DC_KRISHNA', '', '', 'typo', '').ok, false);

    const oldVersion = C.poState.options[a].version;
    const corr = C.poCorrectOption(a, 'DC_KRISHNA', '', '', 'Typographical error in cadre name', 'DLC Chairman');
    assert.strictEqual(corr.ok, true);
    assert.notStrictEqual(C.poState.options[a].version, oldVersion, 'a NEW version is created');
    assert.strictEqual(C.poState.options[a].pref1, 'DC_KRISHNA');
    assert.strictEqual(C.poState.optionHistory.length, 1);
    assert.strictEqual(C.poState.optionHistory[0].option.pref1, 'DC_NTR', 'old value retained');
});

// ===========================================================================
// TEST 37 - allocation configuration cannot change after allocation starts
// ===========================================================================
test('TEST 37: the allocation policy is frozen and cannot change after allocation starts', () => {
    freshState();
    assert.strictEqual(C.poPolicyFrozen(), false);
    assert.strictEqual(C.poSetPolicy('compulsory_allocation_policy', 'CONFIGURED_CADRE_ORDER'), true);
    assert.strictEqual(C.poState.policy.compulsory_allocation_policy, 'CONFIGURED_CADRE_ORDER');

    C.poFreezePolicy();
    assert.strictEqual(C.poPolicyFrozen(), true);

    assert.strictEqual(C.poSetPolicy('compulsory_allocation_policy', 'LARGEST_REMAINING_VACANCY'), false);
    assert.strictEqual(C.poSetPolicy('prefer_existing_on_compulsory', true), false);
    assert.strictEqual(C.poSetPolicy('scst_rounding_policy', 'ROUND_FLOOR'), false);
    assert.strictEqual(C.poState.policy.compulsory_allocation_policy, 'CONFIGURED_CADRE_ORDER');

    // And the frozen policy is recorded on the run snapshot.
    const res = C.poRunEngine('SIMULATION');
    assert.strictEqual(res.snapshot.compulsory_allocation_policy, 'CONFIGURED_CADRE_ORDER');
    assert.ok(res.snapshot.policy_frozen_at);
    assert.ok(res.snapshot.engine_hash);
    assert.ok(res.snapshot.input_fingerprint);
});

// ===========================================================================
// TEST 38 - FAL cannot be edited after publication
// ===========================================================================
test('TEST 38: a published FAL cannot be edited; only a reasoned revision applies', () => {
    freshState();
    importSeniority(4);
    assert.strictEqual(advanceToListReady(), 4);
    assert.strictEqual(C.poPublishFsl(), true);
    C.poOpenOptions();
    const ids = C.poState.fsl.map(r => r.employee_id);
    for (let i = 0; i < 3; i++) C.poSaveOption(ids[i], 'DC_NTR', 'DC_KRISHNA', '');
    C.poSaveOption(ids[3], 'DC_NTR', '', '');
    C.poCloseOptions();
    C.poState.stage = 'OPTIONS_CLOSED';

    const res = C.poConfirmAllocation();
    assert.ok(res, 'confirmed run');
    assert.strictEqual(C.poGenerateFal(), true);
    assert.strictEqual(C.poState.fal.status, 'DRAFT');
    assert.strictEqual(C.poApproveFal(), true);
    assert.strictEqual(C.poState.fal.status, 'APPROVED');
    assert.strictEqual(C.poPublishFal(), true);
    assert.strictEqual(C.poState.fal.status, 'PUBLISHED');
    assert.strictEqual(C.poState.fal.locked, true, 'a published FAL is immutable');

    // No edit function exists; only a reasoned revision.
    assert.strictEqual(C.poReviseFal(''), false, 'a revision requires a reason');
    assert.strictEqual(C.poReviseFal('   '), false);
    assert.strictEqual(C.poState.fal.status, 'PUBLISHED', 'a refused revision leaves the FAL published');

    assert.strictEqual(C.poReviseFal('Court-directed revision of one allotment'), true);
    assert.strictEqual(C.poState.fal, null);
    assert.ok(C.poState.history.fal.length > 0, 'the published FAL is retained in history');
    assert.ok(C.poState.history.allocationRun.length > 0, 'the run is retained in history');
});

// ===========================================================================
// TEST 39 - the seniority list must validate before it can be locked
// ===========================================================================
test('TEST 39: an unvalidated seniority list cannot be locked or published', () => {
    freshState();
    // A duplicate seniority inside one category is a blocking error.
    C.poImportSeniorityRows([
        { seniority_no: '1', name: 'A', category_id: 'CAT_SI', date_of_birth: '01-01-1990', date_of_joining_category: '01-01-2015', social_category: 'OC', erstwhile_cadre: 'DC_KRISHNA', present_local_cadre: 'DC_KRISHNA' },
        { seniority_no: '1', name: 'B', category_id: 'CAT_SI', date_of_birth: '01-01-1990', date_of_joining_category: '01-01-2015', social_category: 'OC', erstwhile_cadre: 'DC_KRISHNA', present_local_cadre: 'DC_KRISHNA' }
    ], true);

    const v = C.poRunSeniorityValidation();
    assert.strictEqual(v.valid, false);
    assert.ok(v.errors.some(e => e.code === 'DUPLICATE_SENIORITY'));

    C.poState.stage = 'FSL_UPLOADED';
    C.poAdvance('uploaded');
    let guard = C.poStageGuard();
    assert.strictEqual(guard.ok, false, 'the stage cannot be left with errors outstanding');
    assert.ok(guard.errors.some(e => /DUPLICATE_SENIORITY/.test(e)), guard.errors.join(' | '));

    assert.strictEqual(C.poFinalizeSeniorityList(), 0, 'locking is refused');
    assert.strictEqual(C.poPublishFsl(), false, 'publication is refused');

    // Correct the duplicate and the list locks and publishes cleanly.
    C.poState.fsl[1].seniority_no = 2;
    assert.strictEqual(C.poRunSeniorityValidation().valid, true);
    assert.strictEqual(C.poFinalizeSeniorityList(), 2);
    assert.strictEqual(C.poState.fslLocked, true);
    guard = C.poStageGuard();
    assert.strictEqual(guard.ok, true, guard.errors.join(' | '));

    assert.strictEqual(C.poPublishFsl(), true);
    assert.ok(C.poEvent('fsl_published_at'));
    assert.strictEqual(C.poPublishFsl(), false, 'cannot publish twice');
});

// ===========================================================================
// TEST 40 - publication is the precondition for the option window
// ===========================================================================
test('TEST 40: options can only be submitted after the list is published', () => {
    freshState();
    importSeniority(3);
    advanceToListReady();
    C.poOpenOptions();

    const first = C.poState.fsl[0].employee_id;
    let r = C.poSaveOption(first, 'DC_KRISHNA', '', '');
    assert.strictEqual(r.ok, false, 'no options before publication');
    assert.ok(r.errors.some(e => /after the FSL is published/i.test(e)), JSON.stringify(r.errors));

    assert.strictEqual(C.poPublishFsl(), true);
    r = C.poSaveOption(first, 'DC_KRISHNA', '', '');
    assert.strictEqual(r.ok, true, 'options accepted after publication');

    // Duplicated and out-of-set cadres are refused.
    assert.strictEqual(C.poSaveOption(first, 'DC_KRISHNA', 'DC_KRISHNA', '').ok, false,
        'the same cadre cannot be repeated');
    assert.strictEqual(C.poSaveOption(first, 'DC_ELURU', '', '').ok, false,
        'a cadre with no posts for this category is refused');
});

// ===========================================================================
// Procedural event register
// ===========================================================================
test('events: the procedural event register records the statutory process', () => {
    const st = freshState();
    assert.strictEqual(Object.keys(st.events).length, 0, 'no events before anything happens');
    ['seniority_uploaded_at', 'fsl_created_at', 'fsl_finalized_at', 'fsl_published_at',
        'options_opened_at', 'options_closed_at', 'allocation_started_at',
        'allocation_completed_at', 'fal_published_at', 'ooa_issued_at',
        'oot_issued_at', 'joining_deadline'].forEach(k => {
        assert.ok(C.PO_EVENT_KEYS.indexOf(k) !== -1, 'undeclared event key ' + k);
    });
    // Only whitelisted keys may be written.
    const before = Object.keys(C.poState.events).length;
    C.poRecordEvent('not_a_real_event', C.poNow());
    assert.strictEqual(Object.keys(C.poState.events).length, before);
});

// ===========================================================================
// Joining closure gate
// ===========================================================================
test('joining: the exercise cannot be closed with unresolved mandatory joining records', () => {
    const st = freshState();
    assert.deepStrictEqual(C.poState.oot, []);
    st.oot = [{
        oot_id: 'OOT-1', employee_id: 'E1', name: 'E1', transfer_required: true,
        status: 'ISSUED', joining_status: 'PENDING', joining_deadline: '2026-08-14'
    }];
    assert.strictEqual(C.poUnresolvedJoining().length, 1);
    st.stage = 'JOINING_COMPLETED';
    let guard = C.poStageGuard();
    assert.strictEqual(guard.ok, false);
    assert.ok(guard.errors.some(e => /joining record/i.test(e)), guard.errors.join(' | '));

    // An authorised closure override unblocks it.
    assert.strictEqual(C.poOverrideJoiningClosure('', 'DLC'), false);
    assert.strictEqual(C.poOverrideJoiningClosure('Post held pending court direction', ''), false);
    assert.strictEqual(C.poOverrideJoiningClosure('Post held pending court direction', 'DLC Chairman'), true);
    assert.strictEqual(C.poJoiningClosureOverridden(), true);
    guard = C.poStageGuard();
    assert.strictEqual(guard.ok, true, guard.errors.join(' | '));
    assert.ok(guard.warnings.some(w => /closure override/i.test(w)));

    // Recording joining resolves it without any override.
    const st2 = freshState();
    st2.oot = [{
        oot_id: 'OOT-1', employee_id: 'E1', name: 'E1', transfer_required: true,
        status: 'ISSUED', joining_status: 'PENDING', joining_deadline: '2026-08-14'
    }];
    C.poRecordJoining('OOT-1', '2026-08-10', 'joined on time');
    assert.strictEqual(C.poState.oot[0].joining_status, 'JOINED');
    assert.strictEqual(C.poUnresolvedJoining().length, 0);

    // An overdue record is derived, not left stale.
    C.poState.oot[0].joining_status = 'PENDING';
    C.poState.oot[0].joining_deadline = '2020-01-01';
    C.poUnresolvedJoining();
    assert.strictEqual(C.poState.oot[0].joining_status, 'OVERDUE');

    // EXCEPTION is an accepted disposition.
    C.poRecordJoining('OOT-1', '', 'Medical, referred for extension', 'EXCEPTION');
    assert.strictEqual(C.poState.oot[0].joining_status, 'EXCEPTION');
    assert.strictEqual(C.poUnresolvedJoining().length, 0);
});

// ===========================================================================
// Official records are retained, never destroyed
// ===========================================================================
test('history: superseded official records are retained, not destroyed', () => {
    const st = freshState();
    assert.ok(st.history, 'a history store exists');
    assert.strictEqual(C.PO_DEFAULT_OPTION_DAYS, 5);
    assert.strictEqual(C.PO_DEFAULT_JOINING_DAYS, 7);
    assert.ok(C.PO_STORAGE_MODE_NOTICE.indexOf('NOT AN AUTHORITATIVE OFFICIAL RECORD') !== -1);
    ['fsl', 'allocationRun', 'fal', 'ooa', 'oot', 'options'].forEach(k => {
        assert.ok(Array.isArray(st.history[k]), 'history.' + k + ' must be an array');
    });
    // Locking a non-empty list retains the previous version.
    st.fsl = [{ employee_id: 'X1', fsl_version: 1, name: 'X1', category_id: 'CAT_SI',
        seniority_no: 1, social_category: 'OC', erstwhile_cadre_id: 'DC_KRISHNA',
        present_local_cadre_id: 'DC_KRISHNA', date_of_joining_category: '2015-01-01',
        date_of_birth: '1990-01-01', service_status: 'PRESENT', claims: {} }];
    const n = advanceToListReady();
    assert.strictEqual(n, 1);
    assert.strictEqual(st.history.fsl.length, 1, 'the prior list is retained');
    assert.strictEqual(st.history.fsl[0].records[0].employee_id, 'X1');
});

// ===========================================================================
// Repository boundary
// ===========================================================================
test('repository: the contract is honoured by both implementations', () => {
    const methods = R.PORepositoryContract.methods;
    assert.strictEqual(methods.length, 9);
    assert.deepStrictEqual(methods, [
        'loadExercise', 'saveExercise', 'saveSeniorityList', 'saveFSL', 'saveOptions',
        'saveAllocationRun', 'saveFAL', 'saveOOA', 'saveOOT'
    ]);
    assert.strictEqual(methods.indexOf('saveAuditEvent'), -1, 'no audit endpoint survives');
    assert.strictEqual(methods.indexOf('saveDSL'), -1, 'no draft-list endpoint survives');
    const ls = new R.LocalStoragePORepository('po_test_repo');
    const be = new R.BackendPORepository('http://example/api');
    [ls, be].forEach(impl => {
        methods.forEach(m => assert.strictEqual(typeof impl[m], 'function', impl.kind + '.' + m));
        assert.strictEqual(impl.authoritative, false, 'neither implementation may claim authority');
    });
    // The local implementation round-trips a document and never shortens history.
    ls.saveExercise({ hello: 'world', history: { fsl: [] } });
    assert.deepStrictEqual(ls.loadExercise(), { hello: 'world', history: { fsl: [] } });
    ls.saveExercise({ hello: 'world', history: { fsl: [{ v: 1 }] } });
    ls.saveExercise({ hello: 'world', history: { fsl: [] } });
    assert.strictEqual(ls.loadExercise().history.fsl.length, 1, 'history is never truncated');
    // The engine never touches persistence.
    const engineSrc = fs.readFileSync(path.join(ROOT, 'poEngine.js'), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
    assert.ok(engineSrc.indexOf('localStorage') === -1, 'engine must not touch localStorage');
    assert.ok(engineSrc.indexOf('PORepository') === -1, 'engine must not know about persistence');
    assert.ok(!/document.(getElementById|createElement|querySelector)/.test(engineSrc), 'engine must not touch the DOM');
    assert.ok(engineSrc.indexOf('fetch(') === -1, 'engine must not perform network calls');
});

// ===========================================================================
// Critical SC/ST shortfall
// ===========================================================================
test('SC/ST: a critical shortfall blocks the FAL until the DLC acknowledges it', () => {
    const st = freshState();
    // 20 working strength => SC Group-III required = round(1.5) = 2, with no SC_3
    // employee on the cadre, so the shortfall is unavoidable and therefore critical.
    C.poSetStrength('CAT_SI', 'DC_KRISHNA', 'cadre_strength', 40);
    C.poSetStrength('CAT_SI', 'DC_KRISHNA', 'fws', 20);
    C.poSetStrength('CAT_SI', 'DC_NTR', 'cadre_strength', 5);
    C.poSetStrength('CAT_SI', 'DC_NTR', 'fws', 0);
    C.poSetStrength('CAT_SI', 'DC_ELURU', 'cadre_strength', 0);
    C.poSetStrength('CAT_SI', 'DC_ELURU', 'fws', 0);
    C.poSetApprovedStrength('CAT_SI', 20);

    st.fsl = fslRows([{}]);
    st.fslLocked = true;
    st.fslPublishedAt = C.poNow();
    st.optionsLocked = true;
    st.options = { E1: { pref1: 'DC_KRISHNA', pref2: '', pref3: '', submitted: true } };

    const res = C.poConfirmAllocation();
    assert.ok(res.run, 'run produced');
    assert.ok(res.scstReview.critical_shortfalls >= 1, 'a critical shortfall exists');
    let v = C.poFALValidation();
    assert.strictEqual(v.valid, false, 'the FAL is blocked');
    assert.ok(v.blocking.some(b => b.code === 'SC_ST_SHORTFALL_EXCEPTION'));

    // Acknowledgement requires a reason and an authority.
    assert.strictEqual(C.poAcceptScstException('', 'DLC'), false);
    assert.strictEqual(C.poAcceptScstException('No SC_3 employee exists on the cadre', ''), false);
    assert.strictEqual(C.poAcceptScstException('No reserved-category employee exists on the cadre', 'DLC Chairman'), true);
    v = C.poFALValidation();
    assert.strictEqual(v.valid, true, 'acknowledged shortfall no longer blocks: ' + JSON.stringify(v.blocking));
    assert.ok(v.accepted.length >= 1);
});

// ===========================================================================
// Error detail shape
// ===========================================================================
test('errors: every critical condition is reported with code, description and recommended action', () => {
    const d = C.poErrorDetail('MISSING_SENIORITY', {
        employee: 'E1', rank: 'Sub-Inspector of Police', cadre: 'Krishna District', source_data: 'seniority_no=null'
    });
    assert.deepStrictEqual(Object.keys(d).sort(),
        ['cadre', 'code', 'description', 'employee', 'rank', 'recommended_action', 'source_data']);
    assert.strictEqual(d.code, 'MISSING_SENIORITY');
    assert.ok(d.description.length > 10);
    assert.ok(d.recommended_action.length > 10);
    const u = C.poErrorDetail('SOMETHING_NEW', {});
    assert.strictEqual(u.code, 'SOMETHING_NEW');
    assert.ok(u.description && u.recommended_action);
});

// ===========================================================================
// Simulation must not alter official state
// ===========================================================================
test('simulation: RUN SIMULATION does not modify official state', () => {
    const st = freshState();
    st.fsl = fslRows([{}, {}]).map(r => Object.assign(r, { sc_group: 'SC_3' }));
    st.fslLocked = true;
    st.fslPublishedAt = C.poNow();
    st.optionsLocked = true;
    st.options = { E1: { pref1: 'DC_KRISHNA', pref2: '', pref3: '', submitted: true } };

    const before = JSON.stringify({
        run: st.allocationRun, allocs: st.allocations, fal: st.fal,
        ooa: st.ooa, oot: st.oot, events: st.events
    });
    const res = C.poSimulateAllocation();
    assert.ok(res, 'simulation ran');
    assert.strictEqual(res.run.mode, 'SIMULATION');
    assert.ok(st.simulation, 'the preview is stored');
    const after = JSON.stringify({
        run: st.allocationRun, allocs: st.allocations, fal: st.fal,
        ooa: st.ooa, oot: st.oot, events: st.events
    });
    assert.strictEqual(before, after, 'no official state changed');
    assert.strictEqual(st.allocationRun, null);
    assert.strictEqual(st.fal, null);
    assert.strictEqual(st.ooa.length, 0);
    assert.strictEqual(st.oot.length, 0);
});

// ===========================================================================
// Rank/category isolation at the workflow layer
// ===========================================================================
test('isolation: a cadre is never allotted an employee of another rank', () => {
    const st = freshState();
    st.categories.push({ id: 'CAT_PC', code: 'PC', name: 'Police Constable', status: 'ACTIVE' });
    C.poSyncStrengthMatrix();
    C.poSetStrength('CAT_PC', 'DC_KRISHNA', 'cadre_strength', 5);
    C.poSetStrength('CAT_PC', 'DC_KRISHNA', 'fws', 2);
    C.poSetStrength('CAT_PC', 'DC_NTR', 'cadre_strength', 5);
    C.poSetStrength('CAT_PC', 'DC_NTR', 'fws', 0);
    C.poSetStrength('CAT_PC', 'DC_ELURU', 'cadre_strength', 5);
    C.poSetStrength('CAT_PC', 'DC_ELURU', 'fws', 0);
    C.poSetApprovedStrength('CAT_PC', 2);

    st.fsl = fslRows([
        { employee_id: 'SI1', name: 'SI1', category_id: 'CAT_SI' },
        { employee_id: 'PC1', name: 'PC1', category_id: 'CAT_PC' }
    ]);
    st.fslLocked = true;
    st.fslPublishedAt = C.poNow();
    // PC1 asks for NTR, which has zero PC posts. It must be refused and the
    // employee must never land in a cadre belonging to another rank.
    const r = C.poSaveOption('PC1', 'DC_NTR', '', '');
    assert.strictEqual(r.ok, false, 'an invalid option is refused');
    assert.ok(r.errors && r.errors[0].indexOf('not configured for Police Constable') !== -1,
        JSON.stringify(r.errors));
    st.optionsLocked = true;

    const res = C.poConfirmAllocation();
    assert.ok(res, 'confirmed run');
    res.allocations.forEach(a => {
        const allowed = E.poApplicableCadres(a.category_id, st.strengths, st.cadres);
        assert.ok(allowed.indexOf(a.cadre_id) !== -1,
            a.name + ' (' + a.category_id + ') was allotted to ' + a.cadre_name);
    });
    // The eligible-options list itself is category scoped.
    assert.deepStrictEqual(C.poApplicableCadreIds('CAT_PC'), ['DC_KRISHNA']);
    assert.deepStrictEqual(C.poApplicableCadreIds('CAT_SI'), ['DC_KRISHNA', 'DC_NTR']);
});

// ===========================================================================
// Seniority is never manufactured
// ===========================================================================
test('import: an uploaded row without a seniority keeps it empty', () => {
    freshState();
    C.poImportSeniorityRows([
        { seniority_no: '', name: 'No Seniority', category_id: 'CAT_SI', date_of_birth: '01-01-1990', date_of_joining_category: '01-01-2015', social_category: 'OC', erstwhile_cadre: 'DC_KRISHNA', present_local_cadre: 'DC_KRISHNA' },
        { seniority_no: '7', name: 'Has Seniority', category_id: 'CAT_SI', date_of_birth: '01-01-1990', date_of_joining_category: '01-01-2015', social_category: 'OC', erstwhile_cadre: 'DC_KRISHNA', present_local_cadre: 'DC_KRISHNA' }
    ], true);
    const recs = C.poState.fsl;
    assert.strictEqual(recs.length, 2);
    assert.strictEqual(recs[0].seniority_no, null, 'no seniority is generated');
    assert.strictEqual(recs[1].seniority_no, 7);
    const v = C.poRunSeniorityValidation();
    assert.strictEqual(v.valid, false);
    assert.strictEqual(v.errors.filter(e => e.code === 'MISSING_SENIORITY').length, 1);
});

test('working strength: the total auto-splits into the three districts', () => {
    freshState();
    C.poSetStrength('CAT_SI', 'DC_KRISHNA', 'cadre_strength', 200);
    C.poSetStrength('CAT_SI', 'DC_NTR', 'cadre_strength', 200);
    C.poSetStrength('CAT_SI', 'DC_ELURU', 'cadre_strength', 200);
    C.poSetApprovedStrength('CAT_SI', 150);
    assert.strictEqual(C.poAutoSplitWorkingStrength(), true);
    const fws = ['DC_KRISHNA', 'DC_NTR', 'DC_ELURU'].map(id =>
        C.poState.strengths.find(s => s.category_id === 'CAT_SI' && s.cadre_id === id).fws);
    assert.deepStrictEqual(fws, [81, 42, 27]);
    assert.strictEqual(fws.reduce((a, b) => a + b, 0), 150);
});

// ===========================================================================
// End-to-end through the real state machine
// ===========================================================================
test('end to end: upload -> lock -> publish -> options -> allocation -> FAL', () => {
    freshState();
    assert.strictEqual(importSeniority(3, 'CAT_SI'), 3);

    // DRAFT -> CADRE_CONFIGURED -> WORKING_STRENGTH_FINALIZED -> FSL_UPLOADED
    assert.strictEqual(C.poAdvance('configured').ok, true);
    assert.strictEqual(C.poAdvance('strength entered').ok, true);
    assert.strictEqual(C.poAdvance('strength reconciled').ok, true);
    assert.strictEqual(C.poStage(), 'FSL_UPLOADED');

    // Locking is what completes FSL_UPLOADED; then publish, then advance.
    assert.strictEqual(C.poRunSeniorityValidation().valid, true);
    assert.strictEqual(C.poFinalizeSeniorityList(), 3);
    assert.strictEqual(C.poAdvance('uploaded and locked').ok, true);
    assert.strictEqual(C.poStage(), 'FSL_FINALIZED');
    assert.strictEqual(C.poPublishFsl(), true);
    assert.strictEqual(C.poAdvance('published').ok, true);
    assert.strictEqual(C.poStage(), 'FSL_PUBLISHED');
    assert.strictEqual(C.poAdvance('option window opens').ok, true);
    assert.strictEqual(C.poStage(), 'OPTIONS_OPEN');

    const ids = C.poState.fsl.map(r => r.employee_id);
    C.poSaveOption(ids[0], 'DC_NTR', '', '');
    C.poSaveOption(ids[1], 'DC_KRISHNA', '', '');
    C.poCloseOptions();
    assert.strictEqual(C.poAdvance('options closed').ok, true);

    const run = C.poConfirmAllocation();
    assert.ok(run, 'confirmed run');
    assert.strictEqual(run.run.status, 'PASSED');
    assert.strictEqual(run.allocations.length, 3);
    // Leaving OPTIONS_CLOSED records the run; leaving ALLOCATION_RUNNING records
    // that it was confirmed and validated. The FAL is generated once validated.
    assert.strictEqual(C.poAdvance('options closed into the run').ok, true);
    assert.strictEqual(C.poStage(), 'ALLOCATION_RUNNING');
    assert.strictEqual(C.poAdvance('run validated').ok, true);
    assert.strictEqual(C.poStage(), 'ALLOCATION_VALIDATED');

    assert.strictEqual(C.poGenerateFal(), true);
    assert.strictEqual(C.poState.fal.rows.length, 3);
    assert.strictEqual(C.poAdvance('fal generated').ok, true);
    assert.strictEqual(C.poStage(), 'FAL_GENERATED');
    assert.strictEqual(C.poApproveFal(), true);
    assert.strictEqual(C.poAdvance('fal approved').ok, true);
    assert.strictEqual(C.poStage(), 'FAL_APPROVED');
    assert.strictEqual(C.poPublishFal(), true);

    // Every FAL row names the district the employee was allotted to.
    C.poState.fal.rows.forEach(row => {
        assert.ok(row.cadre_name, 'the FAL names the allotted district for ' + row.name);
        assert.ok(['Krishna District', 'NTR District', 'Eluru District'].indexOf(row.cadre_name) !== -1,
            'allotted cadre is one of the three districts: ' + row.cadre_name);
    });

    assert.strictEqual(C.poAdvance('fal published').ok, true);
    assert.strictEqual(C.poStage(), 'FAL_PUBLISHED');

    // OOA: generated, approved and issued from the published FAL, then advance.
    assert.strictEqual(C.poGenerateOoa(), 3);
    assert.strictEqual(C.poApproveOoa(), 3);
    assert.strictEqual(C.poIssueOoa(), 3);
    assert.strictEqual(C.poState.ooa.every(o => o.status === 'ISSUED'), true);
    assert.strictEqual(C.poAdvance('ooa issued').ok, true);
    assert.strictEqual(C.poStage(), 'OOA_GENERATED');

    // OOT: generated only where the allotted cadre differs from the present one.
    const transfers = C.poGenerateOot();
    assert.strictEqual(typeof transfers, 'number');
    assert.strictEqual(C.poState.oot.length, 3, 'an OOT row exists for every FAL row');
    C.poState.oot.forEach(o => {
        assert.ok(o.new_cadre, 'each OOT names the reporting cadre');
    });
    assert.strictEqual(C.poAdvance('oot generated').ok, true);
    assert.strictEqual(C.poStage(), 'OOA_ISSUED');
    assert.strictEqual(C.poIssueOot() >= 0, true, 'every draft OOT is issued');
    assert.strictEqual(C.poAdvance('oot issued').ok, true);
    assert.strictEqual(C.poStage(), 'OOT_GENERATED');
});
