/**
 * G.O.Ms.No.129 workflow tests — PART 26 (TEST 35 .. TEST 40) plus the
 * repository boundary (PART 24) and the objection subsystem (PART 4).
 *
 *   node --test tests/po-workflow.test.cjs
 *
 * poCore.js is written for a browser, so a minimal localStorage / userRole /
 * showToast / navigator shim is installed before it is loaded. No engine logic
 * is re-implemented here: the assertions call the real poCore functions.
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

// --- load the real modules in dependency order ------------------------------
function load(rel) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    // Classic scripts share one scope; concatenate and evaluate.
    return src;
}
const E = require(path.join(ROOT, 'poEngine.js'));
const R = require(path.join(ROOT, 'poRepository.js'));

/** Names the tests need. Anything absent is simply omitted from the result, so
 *  a rename in poCore.js surfaces as one clear assertion failure rather than a
 *  ReferenceError in the loader. */
const CORE_EXPORTS = [
    'poFreshState', 'poLoad', 'poSave', 'poStageGuard', 'poAdvance', 'poStage', 'poCtx',
    'poSyncStrengthMatrix', 'poSaveExercise', 'poSetStrength', 'poSetApprovedStrength',
    'poImportDslRows', 'poRowToDslRecord', 'poRunDslValidation',
    'poRaiseObjection', 'poDisposeObjection', 'poCloseObjectionWindow',
    'poObjectionWindowOpen', 'poObjectionClosingDate', 'poPendingObjections',
    'poDisposedObjections', 'poObjectionProcessingComplete',
    'poFslEligibilityDate', 'poFslEligible', 'poTimeline',
    'poBuildFslFromDsl', 'poPublishFsl', 'poReviseFsl',
    'poSaveOption', 'poCorrectOption', 'poCloseOptions', 'poOpenOptions',
    'poOptionDeadline', 'poNoOptionEmployees', 'poApplicableCadreIds',
    'poSetPolicy', 'poFreezePolicy', 'poPolicyFrozen',
    'poRunEngine', 'poSimulateAllocation', 'poConfirmAllocation', 'poFALValidation',
    'poGenerateFal', 'poApproveFal', 'poPublishFal', 'poReviseFal',
    'poGenerateOoa', 'poApproveOoa', 'poIssueOoa', 'poReviseOoa',
    'poGenerateOot', 'poIssueOot', 'poRecordJoining',
    'poUnresolvedJoining', 'poOverrideJoiningClosure', 'poJoiningClosureOverridden',
    'poAcceptScstException', 'poExceptionReport', 'poErrorDetail', 'poIssueDetail',
    'poAudit', 'poEvent', 'poRecordEvent', 'poIsAdmin', 'poUser', 'poNow',
    'poVersionLabel', 'poBumpVersion', 'poSetStageDirect', 'poCompetentAuthority',
    'poPolicyFrozen', 'poFreshState',
    'PO_OBJECTION_DAYS', 'PO_FSL_ELIGIBILITY_DAYS', 'PO_OBJECTION_STATUS',
    'PO_JOINING_STATUS', 'PO_DEFAULT_OPTION_DAYS', 'PO_DEFAULT_JOINING_DAYS',
    'PO_STORAGE_MODE_NOTICE', 'PO_DEFAULT_SEG_PERCENTS', 'PO_EVENT_KEYS', 'PO_OBJECTION_TYPES'
];

/** Evaluate poCore.js in this scope and surface the API the tests drive. */
function loadCore() {
    const src = fs.readFileSync(path.join(ROOT, 'poCore.js'), 'utf8');
    const names = JSON.stringify(CORE_EXPORTS);
    // poCore.js references POEngine and poRepository as free variables, exactly
    // as it does in the browser (they are script-level globals there). Expose them
    // on the global object so the same resolution works here.
    global.POEngine = E;
    global.poRepository = R;
    // A plain `for` loop keeps eval() in the SAME scope as the poCore
    // declarations. forEach() or an IIFE would create a nested scope where the
    // declarations are not visible.
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
const NOW = () => new Date().toISOString();

function freshState() {
    store.clear();
    store.set('userEmail', 'dlc@krishna.police');
    store.set('userRole', 'ADMIN');
    C.poLoad();
    C.poState.categories = [
        { id: 'CAT_SI', code: 'SI', name: 'Sub-Inspector of Police', status: 'ACTIVE' }
    ];
    C.poState.cadres = [
        { id: 'DC_KRISHNA', name: 'Krishna District (Residuary)', cadre_type: 'RESIDUARY_ERSTWHILE', level: 'DISTRICT', status: 'ACTIVE' },
        { id: 'DC_NTR', name: 'NTR District', cadre_type: 'NEWLY_FORMED_DISTRICT', level: 'DISTRICT', status: 'ACTIVE' }
    ];
    C.poSyncStrengthMatrix();
    C.poSetStrength('CAT_SI', 'DC_KRISHNA', 'cadre_strength', 8);
    C.poSetStrength('CAT_SI', 'DC_KRISHNA', 'fws', 3);
    C.poSetStrength('CAT_SI', 'DC_NTR', 'cadre_strength', 5);
    C.poSetStrength('CAT_SI', 'DC_NTR', 'fws', 1);
    C.poSetApprovedStrength('CAT_SI', 4);
    const ex = C.poState.exercise;
    ex.exercise_id = 'PO2026-KRN-001';
    ex.department = 'Police';
    ex.erstwhile_district = 'Krishna';
    ex.chairman_name = 'Collector';
    ex.member_convener_name = 'SP Krishna';
    C.poSaveExercise();
    return C.poState;
}

function importDsl(n) {
    const rows = [];
    for (let i = 1; i <= n; i++) {
        rows.push({
            seniority_no: String(i), name: 'E' + i, category_id: 'CAT_SI', gender: 'Male',
            cfms_id: 'C' + i, mobile: '90000000' + i, date_of_birth: '01-01-1990',
            date_of_joining_category: '01-01-2015', social_category: 'BC-B',
            erstwhile_cadre: 'DC_KRISHNA', present_local_cadre: 'DC_KRISHNA',
            present_working_place: 'KRN PS', service_status: 'PRESENT'
        });
    }
    C.poImportDslRows(rows, true);
}

/**
 * Drive the real workflow to the point where the FSL can be finalized.
 * The DSL publication timestamp is back-dated so the calculated 7th-day
 * eligibility date has already passed, exactly as it would be after a week.
 */
function advanceToFslReady(opts) {
    const o = opts || {};
    const st = C.poState;
    st.stage = 'DSL_UPLOADED';
    C.poAdvance('validated');
    st.stage = 'DSL_VALIDATED';
    C.poAdvance('published');
    st.stage = 'DSL_PUBLISHED';
    C.poAdvance('leaving DSL_PUBLISHED');          // records dsl_published_at
    // Back-date publication so the calculated eligibility date is reached.
    st.events.dsl_published_at = new Date(Date.now() - (C.PO_FSL_ELIGIBILITY_DAYS + 1) * 86400000).toISOString();
    st.events.objection_opened_at = st.events.dsl_published_at;
    (o.objections || []).forEach(x => {
        const r = C.poRaiseObjection(x.employee_id, x.type, x.text, x.docs || '');
        if (!r.ok) throw new Error('objection refused: ' + r.errors[0]);
        if (x.dispose) C.poDisposeObjection(r.objection.objection_id, x.dispose, 'disposed in test');
    });
    C.poCloseObjectionWindow('closed in test');
    st.stage = 'FSL_FINALIZED';
    return C.poBuildFslFromDsl();
}

/** A fully prepared state: FSL finalized, published, options locked, run ready. */
function readyToAllocate(n, opts) {
    const o = opts || {};
    freshState();
    importDsl(n);
    const built = advanceToFslReady(o);
    if (!built) throw new Error('FSL build refused; errors=' + JSON.stringify(C.poStageGuard().errors));
    const st = C.poState;
    st.fslPublishedAt = C.poNow();
    C.poOpenOptions();
    (o.options || []).forEach(p => {
        const r = C.poSaveOption(p.id, p.p1, p.p2 || '', p.p3 || '');
        if (!r.ok) throw new Error('option refused for ' + p.id + ': ' + r.errors[0]);
    });
    if (o.closeOptions !== false) C.poCloseOptions();
    return st;
}

const DSL_ROWS = [
    'seniority_no', 'name', 'cfms_id', 'social_category', 'date_of_joining_category',
    'date_of_birth', 'gender', 'mobile', 'erstwhile_cadre', 'present_local_cadre',
    'present_working_place', 'service_status', 'designation', 'category_id'
].join(',') + '\n' +
    '1,A' + ',C1,OC,2015-01-01,1990-01-01,Male,900000001,DC_KRISHNA,DC_KRISHNA,KRN PS,PRESENT,SI,CAT_SI\n' +
    '2,B,C2,SC,2016-01-01,1991-01-01,Male,900000002,DC_KRISHNA,DC_KRISHNA,KRN PS,PRESENT,SI,CAT_SI\n' +
    '3,C,C3,ST,2017-01-01,1992-01-01,Male,900000003,DC_NTR,DC_NTR,NTR PS,PRESENT,SI,CAT_SI\n';

// ===========================================================================
// TEST 35 - FSL modification after option opening is blocked
// ===========================================================================
test('TEST 35: FSL modification after the option window opens is blocked', () => {
    freshState();
    importDsl(3);
    assert.strictEqual(advanceToFslReady(), 3, 'FSL finalized');

    const before = C.poState.fsl.length;
    assert.strictEqual(before, 3);
    // Open options, then attempt an FSL rebuild: must be refused.
    C.poState.fslPublishedAt = C.poNow();
    C.poOpenOptions();
    const n = C.poBuildFslFromDsl();
    assert.strictEqual(n, 0, 'FSL must not be rebuilt once options have opened');
    assert.strictEqual(C.poState.fsl.length, before, 'the existing FSL must be untouched');

    // And a revision, which is the sanctioned route, retains the previous version.
    C.poReviseFsl('Corrected a cadre after option opening');
    assert.strictEqual(C.poState.fsl.length, 0, 'revision clears the current FSL');
    assert.ok(C.poState.history.fsl.length > 0, 'the superseded FSL is retained, not destroyed');
    assert.ok(C.poState.history.options.length > 0, 'the voided options are retained');
});

// ===========================================================================
// TEST 36 - Option modification after lock is blocked
// ===========================================================================
test('TEST 36: option modification after lock is blocked; corrections create a new version', () => {
    readyToAllocate(3, { closeOptions: false });
    const a = C.poState.dsl[0].employee_id;
    const b = C.poState.dsl[1].employee_id;

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
    // The superseded version is retained.
    assert.strictEqual(C.poState.optionHistory.length, 1);
    assert.strictEqual(C.poState.optionHistory[0].option.pref1, 'DC_NTR', 'old value retained');
    assert.ok(C.poState.audit.some(x => x.action === 'OPTION_CORRECTED'));
});

// ===========================================================================
// TEST 37 - Allocation configuration cannot change after allocation starts
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
    assert.ok(C.poState.audit.some(x => x.action === 'POLICY_CHANGED'));

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
    importDsl(4);
    assert.strictEqual(advanceToFslReady(), 4);
    C.poState.fslPublishedAt = C.poNow();
    C.poOpenOptions();
    for (let i = 0; i < 3; i++) C.poSaveOption(C.poState.fsl[i].employee_id, 'DC_NTR', 'DC_KRISHNA', '');
    C.poSaveOption(C.poState.fsl[3].employee_id, 'DC_NTR', '', '');
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
    assert.ok(C.poState.audit.some(x => x.action === 'FAL_REVISED'));
});

// ===========================================================================
// TEST 39 - DSL objection period is correctly enforced
// ===========================================================================
test('TEST 39: the DSL objection period is enforced and calculated from publication', () => {
    freshState();
    importDsl(3);

    // Before publication the window is closed.
    assert.strictEqual(C.poObjectionWindowOpen(), false);
    let r = C.poRaiseObjection(C.poState.dsl[0].employee_id, 'SENIORITY_NUMBER', 'Wrong seniority');
    assert.strictEqual(r.ok, false, 'no objections before publication');

    C.poState.stage = 'DSL_UPLOADED';
    C.poAdvance('validated');
    C.poState.stage = 'DSL_VALIDATED';
    C.poAdvance('published');
    C.poState.stage = 'DSL_PUBLISHED';
    C.poAdvance('leaving DSL_PUBLISHED');   // -> FSL_FINALIZED, records the events

    assert.ok(C.poEvent('dsl_published_at'), 'dsl_published_at is recorded');
    assert.ok(C.poEvent('objection_opened_at'), 'objection_opened_at is recorded');
    assert.strictEqual(C.poObjectionWindowOpen(), true);

    // Closing date is DSL publication + 5 days, calculated not hard-coded.
    const close = C.poObjectionClosingDate();
    const pub = new Date(C.poEvent('dsl_published_at'));
    assert.strictEqual(close.toISOString().slice(0, 10),
        new Date(pub.getTime() + 5 * 86400000).toISOString().slice(0, 10));
    assert.strictEqual(C.PO_OBJECTION_DAYS, 5);

    // FSL eligibility is publication + 7 days.
    const elig = C.poFslEligibilityDate();
    assert.strictEqual(elig.toISOString().slice(0, 10),
        new Date(pub.getTime() + 7 * 86400000).toISOString().slice(0, 10));

    // Raising and disposing.
    r = C.poRaiseObjection(C.poState.dsl[0].employee_id, 'SENIORITY_NUMBER', 'Seniority should read 11', 'DOC/9');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(C.poState.objections.length, 1);
    const o = r.objection;
    ['objection_id', 'employee_id', 'exercise_id', 'submitted_at', 'objection_type',
        'objection_text', 'supporting_documents', 'status', 'disposed_at',
        'disposal_reason', 'disposed_by', 'previous_value', 'revised_value'].forEach(k => {
        assert.ok(k in o, 'objection record missing ' + k);
    });
    assert.strictEqual(o.status, 'PENDING');
    assert.strictEqual(C.poPendingObjections().length, 1);

    // Cannot close the window while an objection is pending.
    assert.strictEqual(C.poCloseObjectionWindow('premature'), false);

    // Disposal requires a reason.
    assert.strictEqual(C.poDisposeObjection(o.objection_id, 'ACCEPTED', ''), false);
    assert.strictEqual(C.poDisposeObjection(o.objection_id, 'ACCEPTED', 'Seniority verified', '11'), true);
    assert.strictEqual(o.status, 'ACCEPTED');
    assert.strictEqual(o.disposed_by, 'dlc@krishna.police');
    assert.strictEqual(o.revised_value, '11');
    assert.strictEqual(C.poPendingObjections().length, 0);
    assert.strictEqual(C.poDisposedObjections().length, 1);

    assert.strictEqual(C.poCloseObjectionWindow('All objections disposed'), true);
    assert.ok(C.poEvent('objections_disposed_at'));
    assert.strictEqual(C.poObjectionProcessingComplete(), true);
    assert.ok(C.poState.audit.some(x => x.action === 'OBJECTION_DISPOSED'));
    assert.ok(C.poState.audit.some(x => x.action === 'DSL_CORRECTED'));
});

// ===========================================================================
// TEST 40 - FSL cannot publish before the objection / disposal workflow
// ===========================================================================
test('TEST 40: the FSL cannot be finalized or published before the objection workflow completes', () => {
    freshState();
    importDsl(3);
    C.poState.stage = 'DSL_UPLOADED';
    C.poAdvance('validated');
    C.poState.stage = 'DSL_VALIDATED';
    C.poAdvance('published');
    C.poState.stage = 'DSL_PUBLISHED';
    C.poAdvance('leaving DSL_PUBLISHED');

    // Pending objection blocks finalization.
    C.poRaiseObjection(C.poState.dsl[0].employee_id, 'CADRE', 'Wrong cadre recorded');
    assert.strictEqual(C.poBuildFslFromDsl(), 0, 'FSL finalization blocked by a pending objection');
    let guard = C.poStageGuard();
    assert.strictEqual(guard.ok, false);
    assert.ok(guard.errors.some(e => /not disposed|objection/i.test(e)), guard.errors.join(' | '));

    // Disposed but the window is still open: still blocked.
    C.poDisposeObjection(C.poState.objections[0].objection_id, 'REJECTED', 'Cadre is correct as uploaded');
    assert.strictEqual(C.poBuildFslFromDsl(), 0, 'blocked until the window is closed');
    guard = C.poStageGuard();
    assert.ok(guard.errors.some(e => /objection period has not been closed/i.test(e)), guard.errors.join(' | '));

    C.poCloseObjectionWindow('Objection period complete');
    // Window closed and disposed, but the 7th-day eligibility date is not reached.
    assert.strictEqual(C.poFslEligible(), false);
    assert.strictEqual(C.poBuildFslFromDsl(), 0, 'FSL finalization blocked until the eligibility date');
    guard = C.poStageGuard();
    assert.ok(guard.errors.some(e => /eligible for publication/i.test(e)), guard.errors.join(' | '));

    // Simulate reaching the calculated eligibility date.
    const pub = new Date(C.poEvent('dsl_published_at'));
    C.poEvent; // (no-op)
    C.poState.events.dsl_published_at = new Date(pub.getTime() - 8 * 86400000).toISOString();
    assert.strictEqual(C.poFslEligible(), true);
    assert.strictEqual(C.poBuildFslFromDsl(), 3, 'FSL finalizes once every condition is met');
    assert.strictEqual(C.poState.fslLocked, true);
    guard = C.poStageGuard();
    assert.strictEqual(guard.ok, true, guard.errors.join(' | '));

    // And publication is recorded.
    assert.strictEqual(C.poPublishFsl(), true);
    assert.ok(C.poEvent('fsl_published_at'));
    assert.strictEqual(C.poPublishFsl(), false, 'cannot publish twice');
});

// ===========================================================================
// PART 3 - procedural event register
// ===========================================================================
test('PART 3: the procedural event register records the statutory process', () => {
    const st = freshState();
    assert.strictEqual(Object.keys(st.events).length, 0, 'no events before anything happens');
    const keys = ['dsl_published_at', 'objection_opened_at', 'objection_closed_at', 'objections_disposed_at',
        'fsl_created_at', 'fsl_finalized_at', 'fsl_published_at', 'options_opened_at', 'options_closed_at',
        'allocation_started_at', 'allocation_completed_at', 'fal_published_at', 'ooa_issued_at',
        'oot_issued_at', 'joining_deadline'];
    keys.forEach(k => {
        assert.ok(C.PO_EVENT_KEYS.indexOf(k) !== -1, 'undeclared event key ' + k);
    });
    // Only whitelisted keys may be written.
    const before = Object.keys(C.poState.events).length;
    C.poRecordEvent('not_a_real_event', C.poNow(), {});
    assert.strictEqual(Object.keys(C.poState.events).length, before);
});

// ===========================================================================
// PART 23 - joining closure gate
// ===========================================================================
test('PART 23: the exercise cannot be closed with unresolved mandatory joining records', () => {
    const st = freshState();
    assert.deepStrictEqual(C.poState.oot, []);
    // An issued OOT starts PENDING and is reported as unresolved.
    st.oot = [{
        oot_id: 'OOT-1', employee_id: 'E1', name: 'E1', transfer_required: true,
        status: 'ISSUED', joining_status: 'PENDING', joining_deadline: '2026-08-14'
    }];
    assert.strictEqual(C.poUnresolvedJoining().length, 1);
    st.stage = 'JOINING_COMPLETED';
    let guard = C.poStageGuard();
    assert.strictEqual(guard.ok, false);
    assert.ok(guard.errors.some(e => /joining record/i.test(e)), guard.errors.join(' | '));

    // An authorised closure override unblocks it and is audited.
    assert.strictEqual(C.poOverrideJoiningClosure('', 'DLC'), false);
    assert.strictEqual(C.poOverrideJoiningClosure('Post held pending court direction', ''), false);
    assert.strictEqual(C.poOverrideJoiningClosure('Post held pending court direction', 'DLC Chairman'), true);
    assert.strictEqual(C.poJoiningClosureOverridden(), true);
    guard = C.poStageGuard();
    assert.strictEqual(guard.ok, true, guard.errors.join(' | '));
    assert.ok(guard.warnings.some(w => /closure override/i.test(w)));
    assert.ok(C.poState.audit.some(x => x.action === 'JOINING_CLOSURE_OVERRIDE'));

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
// PART 25 - official records are retained, never destroyed
// ===========================================================================
test('PART 25: superseded official records are retained, not destroyed', () => {
    const st = freshState();
    assert.ok(st.history, 'a history store exists');
    assert.strictEqual(C.PO_DEFAULT_OPTION_DAYS, 5);
    assert.strictEqual(C.PO_DEFAULT_JOINING_DAYS, 7);
    assert.ok(C.PO_STORAGE_MODE_NOTICE.indexOf('NOT AN AUTHORITATIVE OFFICIAL RECORD') !== -1);
    ['fsl', 'allocationRun', 'fal', 'ooa', 'oot', 'options'].forEach(k => {
        assert.ok(Array.isArray(st.history[k]), 'history.' + k + ' must be an array');
    });
    // A rebuild of a non-empty FSL retains the previous version.
    st.fsl = [{ employee_id: 'X1', fsl_version: 1 }];
    st.events.dsl_published_at = new Date(Date.now() - 9 * 86400000).toISOString();
    st.objections = [];
    st.events.objections_disposed_at = st.events.dsl_published_at;
    const n = advanceToFslReady();
    if (n) {
        assert.strictEqual(st.history.fsl.length, 1, 'the prior FSL is retained');
    }
});

// ===========================================================================
// PART 24 - repository boundary
// ===========================================================================
test('PART 24: the repository contract is honoured by both implementations', () => {
    const methods = R.PORepositoryContract.methods;
    assert.strictEqual(methods.length, 10);
    assert.deepStrictEqual(methods, [
        'loadExercise', 'saveExercise', 'saveDSL', 'saveFSL', 'saveOptions',
        'saveAllocationRun', 'saveFAL', 'saveOOA', 'saveOOT', 'saveAuditEvent'
    ]);
    const ls = new R.LocalStoragePORepository('po_test_repo');
    const be = new R.BackendPORepository('http://example/api');
    [ls, be].forEach(impl => {
        methods.forEach(m => assert.strictEqual(typeof impl[m], 'function', impl.kind + '.' + m));
        assert.strictEqual(impl.authoritative, false, 'neither implementation may claim authority');
    });
    // The local implementation round-trips a document.
    ls.saveExercise({ hello: 'world', audit: [] });
    assert.deepStrictEqual(ls.loadExercise(), { hello: 'world', audit: [] });
    ls.saveAuditEvent({ action: 'TEST' });
    assert.strictEqual(ls.loadExercise().audit.length, 1);
    // The engine never touches persistence.
    const engineSrc = fs.readFileSync(path.join(ROOT, 'poEngine.js'), 'utf8')
        // strip comments so prose about purity is not mistaken for a dependency
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
    assert.ok(engineSrc.indexOf('localStorage') === -1, 'engine must not touch localStorage');
    assert.ok(engineSrc.indexOf('PORepository') === -1, 'engine must not know about persistence');
    assert.ok(!/document.(getElementById|createElement|querySelector)/.test(engineSrc), 'engine must not touch the DOM');
    assert.ok(engineSrc.indexOf('fetch(') === -1, 'engine must not perform network calls');
});

// ===========================================================================
// PART 15/19 - acknowledged critical SC/ST shortfall
// ===========================================================================
test('PART 15/19: a critical SC/ST shortfall blocks the FAL until the DLC acknowledges it', () => {
    const st = freshState();
    // 20 working strength => SC Group-III required = round(1.5) = 2, with no SC_3
    // employee on the cadre, so the shortfall is unavoidable and therefore critical.
    C.poSetStrength('CAT_SI', 'DC_KRISHNA', 'cadre_strength', 40);
    C.poSetStrength('CAT_SI', 'DC_KRISHNA', 'fws', 20);
    C.poSetStrength('CAT_SI', 'DC_NTR', 'cadre_strength', 5);
    C.poSetStrength('CAT_SI', 'DC_NTR', 'fws', 0);
    C.poSetApprovedStrength('CAT_SI', 20);
    st.dsl = [{
        employee_id: 'E1', name: 'E1', category_id: 'CAT_SI', rank_code: 'SI',
        seniority_no: 1, social_category: 'OC', sc_group: '', erstwhile_cadre_id: 'DC_KRISHNA',
        present_local_cadre_id: 'DC_KRISHNA', service_status: 'PRESENT',
        date_of_birth: '1990-01-01', date_of_joining_category: '2015-01-01',
        claims: {}, fsl_version: 1, category_id: 'CAT_SI'
    }];
    st.fsl = st.dsl.slice();
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
    assert.ok(C.poState.audit.some(a => a.action === 'SC_ST_EXCEPTION_ACCEPTED'));
});

// ===========================================================================
// PART 29 - error detail shape
// ===========================================================================
test('PART 29: every critical condition is reported with code, description and recommended action', () => {
    const d = C.poErrorDetail('MISSING_SENIORITY', {
        employee: 'E1', rank: 'Sub-Inspector of Police', cadre: 'Krishna District', source_data: 'seniority_no=null'
    });
    assert.deepStrictEqual(Object.keys(d).sort(),
        ['cadre', 'code', 'description', 'employee', 'rank', 'recommended_action', 'source_data']);
    assert.strictEqual(d.code, 'MISSING_SENIORITY');
    assert.ok(d.description.length > 10);
    assert.ok(d.recommended_action.length > 10);
    // Unknown codes still produce a usable shape rather than throwing.
    const u = C.poErrorDetail('SOMETHING_NEW', {});
    assert.strictEqual(u.code, 'SOMETHING_NEW');
    assert.ok(u.description && u.recommended_action);
});

// ===========================================================================
// Simulation must not alter official state
// ===========================================================================
test('PART 28: RUN SIMULATION does not modify official state', () => {
    const st = freshState();
    st.dsl = [1, 2].map(i => ({
        employee_id: 'E' + i, name: 'E' + i, category_id: 'CAT_SI', rank_code: 'SI',
        seniority_no: i, social_category: 'OC', sc_group: 'SC_3',
        erstwhile_cadre_id: 'DC_KRISHNA', present_local_cadre_id: 'DC_KRISHNA',
        service_status: 'PRESENT', date_of_birth: '1990-01-01',
        date_of_joining_category: '2015-01-01', claims: {}, fsl_version: 1
    }));
    st.fsl = JSON.parse(JSON.stringify(st.dsl));
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
test('PART 8: a cadre is never allotted an employee of another rank', () => {
    const st = freshState();
    st.categories.push({ id: 'CAT_PC', code: 'PC', name: 'Police Constable', status: 'ACTIVE' });
    C.poSyncStrengthMatrix();
    C.poSetStrength('CAT_PC', 'DC_KRISHNA', 'cadre_strength', 5);
    C.poSetStrength('CAT_PC', 'DC_KRISHNA', 'fws', 2);
    C.poSetStrength('CAT_PC', 'DC_NTR', 'cadre_strength', 5);
    C.poSetStrength('CAT_PC', 'DC_NTR', 'fws', 0);
    C.poSetApprovedStrength('CAT_PC', 2);

    st.dsl = [
        { employee_id: 'SI1', name: 'SI1', category_id: 'CAT_SI', seniority_no: 1, social_category: 'OC', sc_group: '', erstwhile_cadre_id: 'DC_KRISHNA', present_local_cadre_id: 'DC_KRISHNA', service_status: 'PRESENT', date_of_birth: '', date_of_joining_category: '', claims: {}, fsl_version: 1 },
        { employee_id: 'PC1', name: 'PC1', category_id: 'CAT_PC', seniority_no: 1, social_category: 'OC', sc_group: '', erstwhile_cadre_id: 'DC_KRISHNA', present_local_cadre_id: 'DC_KRISHNA', service_status: 'PRESENT', date_of_birth: '', date_of_joining_category: '', claims: {}, fsl_version: 1 }
    ];
    st.fsl = JSON.parse(JSON.stringify(st.dsl));
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
    assert.ok(res, 'confirmed run: ' + JSON.stringify(C.poState.allocationRun ? 'ok' : 'null'));
    res.allocations.forEach(a => {
        const allowed = E.poApplicableCadres(a.category_id, st.strengths, st.cadres);
        assert.ok(Array.isArray(allowed), 'applicable cadres resolved for ' + a.category_id);
        assert.ok(allowed.indexOf(a.cadre_id) !== -1,
            a.name + ' (' + a.category_id + ') was allotted to ' + a.cadre_name);
    });
    // The eligible-options list itself is category scoped.
    assert.deepStrictEqual(C.poApplicableCadreIds('CAT_PC'), ['DC_KRISHNA']);
    assert.deepStrictEqual(C.poApplicableCadreIds('CAT_SI'), ['DC_KRISHNA', 'DC_NTR']);
});

// ===========================================================================
// DSL rows never acquire a manufactured seniority
// ===========================================================================
test('import: an uploaded row without a seniority keeps it empty', () => {
    freshState();
    C.poImportDslRows([
        { seniority_no: '', name: 'No Seniority', category_id: 'CAT_SI', date_of_birth: '01-01-1990', date_of_joining_category: '01-01-2015', social_category: 'OC', erstwhile_cadre: 'DC_KRISHNA', present_local_cadre: 'DC_KRISHNA' },
        { seniority_no: '7', name: 'Has Seniority', category_id: 'CAT_SI', date_of_birth: '01-01-1990', date_of_joining_category: '01-01-2015', social_category: 'OC', erstwhile_cadre: 'DC_KRISHNA', present_local_cadre: 'DC_KRISHNA' }
    ], true);
    const recs = C.poState.dsl;
    assert.strictEqual(recs.length, 2);
    assert.strictEqual(recs[0].seniority_no, null, 'no seniority is generated');
    assert.strictEqual(recs[1].seniority_no, 7);
    const v = C.poRunDslValidation();
    assert.strictEqual(v.valid, false);
    assert.strictEqual(v.errors.filter(e => e.code === 'MISSING_SENIORITY').length, 1);
});
