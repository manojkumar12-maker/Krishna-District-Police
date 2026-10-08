// ============================================================================
// poCore.js  —  Presidential Order-2025 / G.O.Ms.No.129  state & official-input layer
// ----------------------------------------------------------------------------
// Owns: persistence, versioning, audit trail, the workflow state machine, and every
// mutation of OFFICIAL INPUT data (cadres, rank/categories, FWS, DSL, FSL,
// preferential claims, options, allocation, FAL, OOA, OOT).
//
// It does NOT render. All rendering lives in presidentialOrder.js.
// All allocation / validation maths lives in poEngine.js.
//
// Official inputs are only ever written by an explicit, permission-checked,
// audited action. Nothing here invents a seniority number, a cadre, a strength
// or an option.
// ============================================================================

const PO_DATA_VERSION = 10;
const PO_STORAGE_KEY = 'po_state';
const PO_AUDIT_LIMIT = 3000;

// --- Statutory periods (GO REQUIREMENT) -------------------------------------
// The GO provides 5 days for objections after publication of the DSL, and the
// FSL is published on the 7th day from publication of the DSL. These are
// computed from the ACTUAL DSL publication timestamp; no date is hard-coded.
const PO_OBJECTION_DAYS = 5;
const PO_FSL_ELIGIBILITY_DAYS = 7;
const PO_DEFAULT_OPTION_DAYS = 5;
const PO_DEFAULT_JOINING_DAYS = 7;

// --- Persistence mode label (PART 24) --------------------------------------
const PO_STORAGE_MODE_NOTICE =
    'LOCAL DEVELOPMENT MODE - NOT AN AUTHORITATIVE OFFICIAL RECORD. ' +
    'PO exercise data is held in this browser only. It is not a shared DLC record, ' +
    'is not backed up centrally and must not be treated as the statutory register.';

// --- Cadres carried over unchanged from the previous module ------------------
// The exercise cadres are NOT hard-coded: they are seeded here for convenience
// and the DLC can add, rename, retype or retire any of them.
const PO_DEFAULT_CADRES = [
    { id: 'DC_KRISHNA', name: 'Krishna District (Residuary)', cadre_type: 'RESIDUARY_ERSTWHILE', level: 'DISTRICT', status: 'ACTIVE' },
    { id: 'DC_NTR',    name: 'NTR District',                   cadre_type: 'NEWLY_FORMED_DISTRICT', level: 'DISTRICT', status: 'ACTIVE' },
    { id: 'DC_ELURU',  name: 'Eluru District',                 cadre_type: 'NEWLY_FORMED_DISTRICT', level: 'DISTRICT', status: 'ACTIVE' }
];

// Seed rank/categories preserved from the previous module (curated by request).
// Ranks are configuration, not law: the DLC may load the departmental rank
// master instead (see poSuggestCategoriesFromRankMaster).
const PO_DEFAULT_CATEGORIES = [
    'Assistant Sub-Inspector of Police', 'Head Constable (Civil)', 'Police Constable (Civil)',
    'Head Constable (AR)', 'Police Constable (AR)', 'Junior Assistant', 'Typists',
    'Record Assistant', 'Office Sub-Ordinates', 'Sweepers', 'Scavengers', 'Dhobi',
    'Barbers', 'Cobbler'
];

// --- The stage-based screens (para 28) -------------------------------------
// The exercise reference data and the DLC composition are folded into step 1
// (Ranks & Cadres) rather than given a screen of their own; the underlying
// values are unchanged and still gate the DRAFT stage.
const PO_STEPS = [
    { n: 1,  key: 'ranks',      label: 'Ranks & Cadres',    from: 'DRAFT' },
    { n: 2,  key: 'strength',   label: 'Working Strength',  from: 'WORKING_STRENGTH_FINALIZED' },
    { n: 3,  key: 'dsl',        label: 'DSL',               from: 'DSL_UPLOADED' },
    { n: 4,  key: 'fsl',        label: 'FSL',               from: 'FSL_FINALIZED' },
    { n: 5,  key: 'options',    label: 'Option Filling',    from: 'OPTIONS_OPEN' },
    { n: 6,  key: 'allocation', label: 'Allocation',        from: 'ALLOCATION_RUNNING' },
    { n: 7,  key: 'fal',        label: 'FAL',               from: 'FAL_GENERATED' },
    { n: 8,  key: 'orders',     label: 'OOA / OOT',         from: 'OOA_GENERATED' }
];

const PO_DEFAULT_SEG_PERCENTS = { SC_1: 1, SC_2: 6.5, SC_3: 7.5, ST: 6 };

// ============================================================================
// State
// ============================================================================

let poState = null;

function poFreshState() {
    return {
        poDataVersion: PO_DATA_VERSION,
        storage_mode_notice: PO_STORAGE_MODE_NOTICE,
        exercise: {
            exercise_id: '',
            department: '',
            erstwhile_district: '',
            new_districts: '',
            cadre_scope: 'District and Contiguous District Cadre',
            chairman_name: '', chairman_designation: '',
            co_chairman_name: '', co_chairman_designation: '',
            member_convener_name: '', member_convener_designation: '',
            co_convener_name: '', co_convener_designation: '',
            dro_name: '', dro_designation: '',
            other_members: '',
            status: 'DRAFT',
            created_at: null,
            modified_at: null
        },
        // DLC policy decisions (PART 10 / 11 / 14). Frozen before ALLOCATION_RUNNING.
        policy: {
            compulsory_allocation_policy: POEngine.PO_DEFAULT_COMPULSORY_POLICY,
            prefer_existing_on_compulsory: false,
            scst_rounding_policy: POEngine.PO_DEFAULT_ROUNDING_POLICY,
            scst_adjustment: true,
            frozen_at: null,
            frozen_by: null
        },
        categories: [],
        cadres: [],
        strengths: [],
        approved: [],
        dsl: [],
        dslVersion: 0,
        dslPublishedAt: null,
        dslValidation: null,
        // Objection subsystem (PART 4) - one record per objection.
        objections: [],
        fsl: [],
        fslVersion: 0,
        fslLocked: false,
        fslCreatedAt: null,
        fslFinalizedAt: null,
        fslPublishedAt: null,
        fslValidation: null,
        fslRevisions: [],
        options: {},
        optionHistory: [],
        optionsLocked: false,
        optionsOpenedAt: null,
        optionsClosedAt: null,
        optionWindowDays: PO_DEFAULT_OPTION_DAYS,
        joiningWindowDays: PO_DEFAULT_JOINING_DAYS,
        segPercents: Object.assign({}, PO_DEFAULT_SEG_PERCENTS),
        allocations: [],
        allocationRun: null,
        simulation: null,
        fal: null,
        falRevisions: [],
        ooa: [],
        oot: [],
        // Procedural event register (PART 3) - the statutory process behind the
        // workflow state machine.
        events: {},
        stage: 'DRAFT',
        versions: { fws: 0, dsl: 0, fsl: 0, options: 0, fal: 0, ooa: 0, oot: 0, claims: 0, policy: 0 },
        // Retained prior versions of official records (PART 25). Never
        // delete + recreate: every superseded version is appended here.
        history: { fsl: [], allocationRun: [], fal: [], ooa: [], oot: [], options: [] },
        audit: []
    };
}

/** Procedural event register keys (PART 3). */
const PO_EVENT_KEYS = [
    'dsl_published_at', 'objection_opened_at', 'objection_closed_at', 'objections_disposed_at',
    'fsl_created_at', 'fsl_finalized_at', 'fsl_published_at',
    'options_opened_at', 'options_closed_at',
    'allocation_started_at', 'allocation_completed_at',
    'fal_generated_at', 'fal_approved_at', 'fal_published_at',
    'ooa_generated_at', 'ooa_issued_at',
    'oot_generated_at', 'oot_issued_at', 'joining_deadline'
];

const PO_OBJECTION_STATUS = ['PENDING', 'UNDER_REVIEW', 'ACCEPTED', 'PARTIALLY_ACCEPTED', 'REJECTED', 'DISPOSED'];
const PO_OBJECTION_TYPES = [
    'SENIORITY_NUMBER', 'DATE_OF_JOINING', 'NAME', 'CADRE', 'RANK_CATEGORY',
    'SOCIAL_CATEGORY', 'SERVICE_STATUS', 'PREFERENTIAL_CLAIM', 'OTHER'
];
const PO_JOINING_STATUS = ['PENDING', 'JOINED', 'OVERDUE', 'EXCEPTION'];

/** Record a procedural event. The state machine shows the workflow; this shows
 *  the statutory process behind it. Every write is audited. */
function poRecordEvent(key, at, opts) {
    if (PO_EVENT_KEYS.indexOf(key) === -1) return null;
    const o = opts || {};
    poState.events = poState.events || {};
    poState.events[key] = at || poNow();
    poAudit(o.action || 'STAGE_CHANGED', { prev: o.prev || '', next: o.next || key, reason: o.reason || '', employee_id: o.employee_id || '' });
    return poState.events[key];
}

function poEvent(key) { return (poState.events || {})[key] || null; }

/** Timeline derived from the recorded events. Nothing is hard-coded. */
function poTimeline() {
    const d = iso => iso ? String(iso).slice(0, 10) : null;
    const addDays = (iso, days) => iso ? new Date(new Date(iso).getTime() + days * 86400000) : null;
    const dslPub = poEvent('dsl_published_at');
    const objectionClose = dslPub ? addDays(dslPub, PO_OBJECTION_DAYS) : null;
    const fslEligible = dslPub ? addDays(dslPub, PO_FSL_ELIGIBILITY_DAYS) : null;
    return {
        dsl_published_at: dslPub,
        objection_window_days: PO_OBJECTION_DAYS,
        objection_opened_at: d(poEvent('objection_opened_at')),
        objection_closing_date: objectionClose ? objectionClose.toISOString().slice(0, 10) : null,
        objection_closed_at: d(poEvent('objection_closed_at')),
        objections_disposed_at: d(poEvent('objections_disposed_at')),
        objections_total: (poState.objections || []).length,
        objections_disposed: poDisposedObjections().length,
        objections_pending: poPendingObjections().length,
        fsl_eligibility_date: fslEligible ? fslEligible.toISOString().slice(0, 10) : null,
        fsl_eligible_reached: !!(fslEligible && Date.now() >= fslEligible.getTime()),
        fsl_created_at: d(poEvent('fsl_created_at')),
        fsl_finalized_at: d(poEvent('fsl_finalized_at')),
        fsl_published_at: d(poEvent('fsl_published_at')),
        options_opened_at: d(poEvent('options_opened_at')),
        options_closed_at: d(poEvent('options_closed_at')),
        allocation_started_at: d(poEvent('allocation_started_at')),
        allocation_completed_at: d(poEvent('allocation_completed_at')),
        fal_published_at: d(poEvent('fal_published_at')),
        ooa_issued_at: d(poEvent('ooa_issued_at')),
        oot_issued_at: d(poEvent('oot_issued_at'))
    };
}

function poLoad() {
    try {
        const raw = localStorage.getItem(PO_STORAGE_KEY);
        // Persistence goes through the PORepository boundary (PART 24).
        if (!raw) { poState = poFreshState(); poSeedMasters(); return poState; }
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.poDataVersion !== PO_DATA_VERSION) {
            // Schema changed: discard stale state rather than silently mis-map it.
            localStorage.removeItem(PO_STORAGE_KEY);
            poState = poFreshState();
            poSeedMasters();
            return poState;
        }
        poState = Object.assign(poFreshState(), parsed);
        poState.exercise = Object.assign(poFreshState().exercise, parsed.exercise || {});
        poState.policy = Object.assign(poFreshState().policy, parsed.policy || {});
        poState.versions = Object.assign({ fws: 0, dsl: 0, fsl: 0, options: 0, fal: 0, ooa: 0, oot: 0, claims: 0, policy: 0 }, parsed.versions || {});
        poState.segPercents = Object.assign({}, PO_DEFAULT_SEG_PERCENTS, parsed.segPercents || {});
        poState.events = Object.assign({}, parsed.events || {});
        poState.history = Object.assign(poFreshState().history, parsed.history || {});
        poState.storage_mode_notice = PO_STORAGE_MODE_NOTICE;
        return poState;
    } catch (e) {
        console.error('poLoad failed', e);
        poState = poFreshState();
        return poState;
    }
}

function poSave() {
    if (!poState) poState = poFreshState();
    if (poState.audit.length > PO_AUDIT_LIMIT) {
        poState.audit = poState.audit.slice(poState.audit.length - PO_AUDIT_LIMIT);
    }
    try {
        if (typeof poRepository !== 'undefined' && poRepository.saveExercise) poRepository.saveExercise(poState);
        else localStorage.setItem(PO_STORAGE_KEY, JSON.stringify(poState));
    } catch (e) {
        console.error('poSave failed', e);
        if (typeof showToast === 'function') showToast('Could not persist PO state (storage full)', 'error');
    }
    return poState;
}

function poNow() { return new Date().toISOString(); }

function poUser() {
    return localStorage.getItem('userEmail') || localStorage.getItem('userRole') || 'unknown-user';
}

function poIsAdmin() { return typeof userRole !== 'undefined' && userRole === 'ADMIN'; }

function poSessionId() {
    let s = localStorage.getItem('poSessionId');
    if (!s) {
        s = 'SES-' + Math.random().toString(36).slice(2, 10) + '-' + (poNow().length);
        localStorage.setItem('poSessionId', s);
    }
    return s;
}


// ============================================================================
// Audit trail (para 23)
// ============================================================================

const PO_AUDIT_LABEL = {
    CADRE_CREATED: 'Cadre created',
    CADRE_UPDATED: 'Cadre updated',
    FWS_CHANGED: 'Final Working Strength changed',
    CATEGORY_CREATED: 'Post category / rank created',
    CATEGORY_UPDATED: 'Post category / rank updated',
    APPROVED_STRENGTH_CHANGED: 'Approved working strength changed',
    DSL_UPLOADED: 'DSL uploaded',
    DSL_RECORD_SAVED: 'DSL record saved',
    DSL_RECORD_DELETED: 'DSL record deleted',
    DSL_VALIDATED: 'DSL validated',
    DSL_PUBLISHED: 'DSL published',
    OBJECTION_RECORDED: 'DSL objection recorded',
    FSL_UPLOADED: 'FSL uploaded',
    FSL_FINALIZED: 'FSL finalized',
    FSL_LOCKED: 'FSL locked',
    FSL_VALIDATED: 'FSL validated',
    FSL_PUBLISHED: 'FSL published',
    FSL_REVISED: 'FSL revised',
    CLAIM_VERIFIED: 'Preferential claim verified',
    CLAIM_REJECTED: 'Preferential claim rejected',
    OPTION_SUBMITTED: 'Option submitted',
    OPTION_LOCKED: 'Options locked',
    ALLOCATION_SIMULATED: 'Allocation simulated',
    ALLOCATION_STARTED: 'Allocation started',
    ALLOCATION_COMPLETED: 'Allocation completed',
    ALLOCATION_FAILED: 'Allocation failed',
    SC_ST_ADJUSTMENT: 'SC/ST adjustment',
    FAL_GENERATED: 'FAL generated',
    FAL_VALIDATED: 'FAL validated',
    FAL_APPROVED: 'FAL approved',
    FAL_PUBLISHED: 'FAL published',
    FAL_REVISED: 'FAL revised',
    OOA_GENERATED: 'OOA generated',
    OOA_APPROVED: 'OOA approved',
    OOA_ISSUED: 'OOA issued',
    OOA_REVISED: 'OOA revised',
    OOT_GENERATED: 'OOT generated',
    OOT_ISSUED: 'OOT issued',
    JOINING_RECORDED: 'Joining recorded',
    STAGE_CHANGED: 'Workflow stage changed',
    EXERCISE_CLOSED: 'Exercise closed',
    OBJECTION_DISPOSED: 'Objection disposed',
    OBJECTION_WINDOW_CLOSED: 'Objection window closed',
    OBJECTIONS_DISPOSED: 'Objections disposed',
    DSL_CORRECTED: 'DSL corrected',
    OPTION_CORRECTED: 'Option corrected (new version)',
    POLICY_CHANGED: 'Allocation policy changed',
    POLICY_FROZEN: 'Allocation policy frozen',
    SC_ST_EXCEPTION_ACCEPTED: 'Critical SC/ST shortfall acknowledged by the DLC',
    JOINING_CLOSURE_OVERRIDE: 'Joining closure override authorised',
    PO_RESET: 'PO module reset'
};

function poAudit(action, opts) {
    if (!poState) poState = poFreshState();
    const o = opts || {};
    const ev = {
        id: 'AUD-' + poState.audit.length + 1,
        ts: o.ts || poNow(),
        user: o.user || poUser(),
        action: action,
        label: PO_AUDIT_LABEL[action] || action,
        prev_value: o.prev === undefined ? '' : o.prev,
        new_value: o.next === undefined ? '' : o.next,
        reason: o.reason || '',
        exercise_id: poState.exercise.exercise_id || '',
        employee_id: o.employee_id || '',
        stage: poState.stage,
        version: o.version || ''
    };
    poState.audit.push(ev);
    return ev;
}


// ============================================================================
// Versioning (para 24)
// ============================================================================

function poBumpVersion(key) {
    if (!poState.versions) poState.versions = { fws: 0, dsl: 0, fsl: 0, options: 0, fal: 0, ooa: 0, oot: 0 };
    poState.versions[key] = (poState.versions[key] || 0) + 1;
    return poState.versions[key];
}

function poVersionLabel(key) {
    const v = (poState.versions && poState.versions[key]) || 0;
    if (key === 'engine') return POEngine.PO_ENGINE_VERSION;
    return 'v' + v;
}


// ============================================================================
// Workflow state machine (para 22)
// ============================================================================

function poStage() { return poState.stage || 'DRAFT'; }

function poStageIdx(s) {
    const i = POEngine.PO_STAGE_INDEX[s];
    return i === undefined ? 0 : i;
}

function poCurrentStepIndex() {
    const idx = poStageIdx(poStage());
    let step = 0;
    for (let i = 0; i < PO_STEPS.length; i++) {
        if (idx >= poStageIdx(PO_STEPS[i].from)) step = i;
    }
    return step;
}

function poStepState(stepIdx) {
    const idx = poStageIdx(poStage());
    const from = poStageIdx(PO_STEPS[stepIdx].from);
    if (stepIdx < poCurrentStepIndex()) return 'LOCKED';
    if (stepIdx > poCurrentStepIndex()) return 'LOCKED';
    if (poStage() === 'EXERCISE_CLOSED') return 'LOCKED';
    if (stepIdx === poCurrentStepIndex()) return 'OPEN';
    return 'LOCKED';
}

function poNextStage() {
    const i = poStageIdx(poStage());
    return POEngine.PO_STAGES[i + 1] || null;
}

/**
 * Guard for advancing OUT OF the current stage. Every guard is a hard check on
 * official data. Stages can never be skipped: only poStage() -> next stage.
 */
function poStageGuard() {
    const s = poStage();
    const g = { ok: false, errors: [], warnings: [], next: poNextStage() };

    if (!poIsAdmin()) { g.errors.push('Only an ADMIN may advance the workflow.'); return g; }
    if (!g.next) { g.errors.push('Exercise is already closed.'); return g; }
    if (poState.exercise.status === 'CLOSED') { g.errors.push('Exercise is closed.'); return g; }

    const ex = poState.exercise;
    switch (s) {
        case 'DRAFT': {
            if (!ex.exercise_id.trim()) g.errors.push('Exercise ID is required.');
            if (!ex.department.trim()) g.errors.push('Department is required.');
            if (!ex.erstwhile_district.trim()) g.errors.push('Erstwhile District is required.');
            if (!ex.chairman_name.trim()) g.errors.push('DLC Chairman (District Collector of the erstwhile district) is required.');
            if (!ex.member_convener_name.trim()) g.errors.push('Member-Convener (Departmental Head, erstwhile district) is required.');
            if (ex.cadre_scope !== 'District and Contiguous District Cadre') {
                g.errors.push('Cadre scope must be "District and Contiguous District Cadre" for district-level processing.');
            }
            if (!poState.categories.length) g.errors.push('Define at least one post category / rank.');
            if (!poState.cadres.length) g.errors.push('Define at least one local cadre.');
            poState.cadres.forEach(c => {
                if (!POEngine.PO_CADRE_TYPES.some(t => t.id === c.cadre_type)) {
                    g.errors.push('Cadre "' + c.name + '" has no cadre type. Choose Residuary / Newly Formed / Contiguous.');
                }
            });
            poState.categories.forEach(c => {
                const n = poState.strengths.filter(s2 => s2.category_id === c.id && s2.status !== 'INACTIVE').length;
                if (!n) g.errors.push('Category "' + c.name + '" has no local cadre configured.');
            });
            g.ok = g.errors.length === 0;
            break;
        }
        case 'CADRE_CONFIGURED': {
            // Only require that working-strength DATA has been entered. Reconciliation is
            // enforced when leaving step 3, otherwise a mismatched total would make the
            // screen the DLC needs in order to fix it unreachable.
            poState.categories.forEach(c => {
                const rows = poState.strengths.filter(s => s.category_id === c.id && s.status !== 'INACTIVE');
                if (!rows.length) g.errors.push('No local cadre configured for ' + c.name + '.');
                const approved = poState.approved.find(a => a.category_id === c.id);
                if (!approved || approved.approved_working_strength === null || approved.approved_working_strength === undefined) {
                    g.errors.push('Approved working strength not entered for ' + c.name + '.');
                }
            });
            if (!poState.categories.length) g.errors.push('No category to configure.');
            g.ok = g.errors.length === 0;
            break;
        }
        case 'WORKING_STRENGTH_FINALIZED': {
            // Leaving this stage means the working strength is FINALIZED, i.e. reconciled.
            const r = POEngine.validateWorkingStrength({ ctx: poCtx() });
            r.errors.forEach(e => g.errors.push(e.message));
            r.warnings.forEach(e => g.warnings.push(e.message));
            g.ok = g.errors.length === 0;
            break;
        }
        case 'DSL_UPLOADED': {
            if (!poState.dsl.length) {
                g.errors.push('DSL is empty. Upload or enter the Draft Seniority List first.');
                g.ok = false;
                break;
            }
            const r = POEngine.validateDSL(poState.dsl, { ctx: poCtx() });
            poState.dslValidation = r;
            if (!r.valid) {
                r.errors.slice(0, 12).forEach(e => g.errors.push(e.code + ': ' + e.message));
                if (r.errors.length > 12) g.errors.push('... and ' + (r.errors.length - 12) + ' more validation errors.');
            }
            g.ok = g.errors.length === 0;
            break;
        }
        case 'DSL_VALIDATED': {
            const r = POEngine.validateDSL(poState.dsl, { ctx: poCtx() });
            if (!r.valid) g.errors.push('DSL validation no longer passes. Re-validate before publishing.');
            g.ok = g.errors.length === 0;
            break;
        }
        case 'DSL_PUBLISHED': {
            // Publication starts the statutory clock: a 5-day objection period,
            // and FSL eligibility on the 7th day. Both are calculated, never hard-coded.
            if (!poState.dsl.length) g.errors.push('DSL is empty.');
            if (!poEvent('dsl_published_at')) {
                poRecordEvent('dsl_published_at', poNow(), {
                    action: 'DSL_PUBLISHED',
                    reason: 'Objection period ' + PO_OBJECTION_DAYS + ' days; FSL eligible on day ' + PO_FSL_ELIGIBILITY_DAYS
                });
            }
            if (!poEvent('objection_opened_at')) {
                poRecordEvent('objection_opened_at', poNow(), { action: 'OBJECTION_WINDOW_OPENED', next: 'closes ' + String(poObjectionClosingDate() || '').slice(0, 10) });
            }
            const pending = poPendingObjections();
            if (pending.length) g.warnings.push(pending.length + ' DSL objection(s) are still pending. They must be disposed before the FSL can be published.');
            g.ok = g.errors.length === 0;
            break;
        }
        case 'FSL_FINALIZED': {
            if (!poState.fslLocked) g.errors.push('FSL must be locked before it can be published.');
            const pending = poPendingObjections();
            if (pending.length) g.errors.push(pending.length + ' DSL objection(s) are not disposed. The objection period must be completed before the FSL is published.');
            if (!poEvent('objections_disposed_at')) g.errors.push('The DSL objection period has not been closed.');
            if (!poFslEligible()) {
                const d = poFslEligibilityDate();
                g.errors.push('The FSL is not yet eligible for publication. It becomes eligible on ' + d.toISOString().slice(0, 10) +
                    ' (calculated: day ' + PO_FSL_ELIGIBILITY_DAYS + ' from publication of the DSL on ' +
                    String(poEvent('dsl_published_at') || '').slice(0, 10) + ').');
            }
            const r = POEngine.validateFSL(poState.fsl, { ctx: poCtx(), dsl: poState.dsl });
            if (!r.valid) {
                r.errors.slice(0, 10).forEach(e => g.errors.push(e.code + ': ' + e.message));
            }
            g.ok = g.errors.length === 0;
            break;
        }
        case 'FSL_PUBLISHED': {
            if (!poState.fslPublishedAt) g.errors.push('Publish the FSL before opening the option period.');
            g.ok = g.errors.length === 0;
            break;
        }
        case 'OPTIONS_OPEN': {
            if (poState.optionsLocked) { g.errors.push('Options are already locked.'); break; }
            if (poOptionDeadlinePassed()) g.errors.push('The option period has already closed. Close the option stage instead.');
            g.ok = g.errors.length === 0;
            break;
        }
        case 'OPTIONS_CLOSED': {
            // Entering ALLOCATION_RUNNING only requires a closed option window. The
            // confirmed run is what the NEXT transition (ALLOCATION_RUNNING ->
            // ALLOCATION_VALIDATED) checks.
            if (!poState.optionsLocked) g.errors.push('Option entry is still open. Close and lock the options first.');
            if (!Object.keys(poState.options).length) g.warnings.push('No options were submitted at all.');
            g.ok = g.errors.length === 0;
            break;
        }
        case 'ALLOCATION_RUNNING': {
            if (!poPolicyFrozen()) g.errors.push('The allocation policy must be frozen before ALLOCATION_RUNNING.');
            const run = poState.allocationRun && poState.allocationRun.run;
            if (!run || run.mode !== 'CONFIRMED') {
                g.errors.push('No CONFIRMED allocation run exists. Run the simulation, then confirm the allocation.');
            } else if (run.status !== 'PASSED') {
                g.errors.push('The confirmed allocation run did not pass the over-allocation check. Re-run after correcting the working strength.');
            }
            g.ok = g.errors.length === 0;
            break;
        }
        case 'ALLOCATION_VALIDATED': {
            if (!poState.fal) g.errors.push('Generate the FAL first.');
            g.ok = g.errors.length === 0;
            break;
        }
        case 'FAL_GENERATED': {
            const v = POEngine.validateFAL({ allocations: poState.allocationRun ? poState.allocationRun.allocations : [], exceptions: [] }, { ctx: poCtx(), fsl: poState.fsl });
            if (!v.valid) v.blocking.slice(0, 10).forEach(b => g.errors.push(b.code + ': ' + b.message));
            g.ok = g.errors.length === 0;
            break;
        }
        case 'FAL_APPROVED': {
            if (!poState.fal || poState.fal.status !== 'APPROVED') g.errors.push('FAL must be in APPROVED state.');
            g.ok = g.errors.length === 0;
            break;
        }
        case 'FAL_PUBLISHED': {
            if (!poState.fal || poState.fal.status !== 'PUBLISHED') g.errors.push('Publish the FAL before generating orders.');
            g.ok = g.errors.length === 0;
            break;
        }
        case 'OOA_GENERATED': {
            if (!poState.ooa.length) g.errors.push('No OOA has been generated.');
            if (poState.ooa.some(o => o.status === 'DRAFT')) g.errors.push('Approve every OOA before issuing.');
            g.ok = g.errors.length === 0;
            break;
        }
        case 'OOA_ISSUED': {
            if (!poState.oot.length) {
                g.warnings.push('No transfer is required for any employee - OOT stage will be auto-completed.');
            }
            g.ok = g.errors.length === 0;
            break;
        }
        case 'OOT_GENERATED': {
            if (poState.oot.some(o => o.status === 'DRAFT')) g.errors.push('Issue every OOT before recording joining.');
            g.ok = g.errors.length === 0;
            break;
        }
        case 'OOT_ISSUED': {
            const open = poState.oot.filter(o => o.status === 'ISSUED' &&
                ['JOINED', 'EXCEPTION'].indexOf(o.joining_status) === -1);
            if (open.length) {
                g.errors.push(open.length + ' OOT(s) are still awaiting a joining report: ' +
                    open.map(o => o.name + ' (' + o.joining_status + ')').join(', '));
            }
            g.ok = g.errors.length === 0;
            break;
        }
        case 'JOINING_COMPLETED': {
            const open = poUnresolvedJoining();
            if (open.length) {
                if (!poJoiningClosureOverridden()) {
                    g.errors.push(open.length + ' mandatory joining record(s) are unresolved: ' +
                        open.map(o => o.name + ' (' + o.joining_status + ')').join(', ') +
                        '. Record the joining report, mark an exception, or authorise a closure override.');
                } else {
                    g.warnings.push('Closing under an authorised joining-closure override recorded at ' +
                        poState.joiningClosureOverride.at + '.');
                }
            }
            g.ok = g.errors.length === 0;
            break;
        }
        default:
            g.errors.push('Unknown stage ' + s);
    }
    return g;
}

function poAdvance(reason) {
    const guard = poStageGuard();
    if (!guard.ok) {
        return { ok: false, guard: guard };
    }
    const from = poStage();
    const to = guard.next;
    poState.stage = to;
    if (!poState.exercise.created_at) poState.exercise.created_at = poNow();
    poState.exercise.modified_at = poNow();
    if (to === 'OPTIONS_OPEN' && !poState.optionsOpenedAt) poState.optionsOpenedAt = poNow();
    if (to === 'EXERCISE_CLOSED') poState.exercise.status = 'CLOSED';
    if (poState.exercise.status === 'DRAFT' && to !== 'DRAFT') poState.exercise.status = 'ACTIVE';
    poAudit('STAGE_CHANGED', { prev: from, next: to, reason: reason || '' });
    // A named audit event is also emitted for the transitions that the order lists
    // individually, so the trail is searchable without scanning stage names.
    const NAMED = {
        DSL_VALIDATED: 'DSL_VALIDATED',
        DSL_PUBLISHED: 'DSL_PUBLISHED',
        FSL_PUBLISHED: 'FSL_PUBLISHED',
        EXERCISE_CLOSED: 'EXERCISE_CLOSED'
    };
    if (NAMED[to]) poAudit(NAMED[to], { prev: from, next: to, reason: reason || '' });
    poSave();
    return { ok: true, from: from, to: to, guard: guard };
}

/** Skip-ahead is impossible; only this function moves the workflow. */
function poSetStageDirect() { return false; }


// ============================================================================
// Engine context
// ============================================================================

function poCtx() {
    return POEngine.poBuildContext({
        exercise_id: poState.exercise.exercise_id,
        categories: poState.categories,
        cadres: poState.cadres,
        strengths: poState.strengths,
        approved: poState.approved,
        segPercents: poState.segPercents
    });
}

function poActiveFsl() { return poState.fsl.length ? poState.fsl : poState.dsl; }


// ============================================================================
// Masters: categories + cadres + strength
// ============================================================================

function poSeedMasters() {
    poState.cadres = PO_DEFAULT_CADRES.map(c => Object.assign({}, c));
    poState.categories = PO_DEFAULT_CATEGORIES.map((name, i) => ({
        id: 'CAT_' + String(i + 1).padStart(2, '0'),
        code: name,
        name: name,
        department: poState.exercise.department || '',
        erstwhile_cadre: '',
        status: 'ACTIVE',
        created_at: poNow()
    }));
    poSyncStrengthMatrix();
    poSave();
}

function poSuggestCategoriesFromRankMaster() {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return 0; }
    const seen = {};
    poState.categories.forEach(c => { seen[poKeyOf(c.name)] = true; });
    const pool = []
        .concat((typeof rankMap !== 'undefined' && rankMap.ERSTWHILE_CIVIL) || [])
        .concat((typeof rankMap !== 'undefined' && rankMap.ERSTWHILE_AR) || [])
        .concat((typeof rankMap !== 'undefined' && rankMap.ERSTWHILE_MINISTERIAL) || [])
        .concat((typeof rankMap !== 'undefined' && rankMap.ERSTWHILE_CLASS_IV) || []);

    let added = 0;
    pool.forEach(name => {
        const k = poKeyOf(name);
        if (!k || seen[k]) return;
        seen[k] = true;
        poState.categories.push({
            id: 'CAT_' + String(poState.categories.length + 1).padStart(2, '0') + '_' + String(added + 1).padStart(2, '0'),
            code: name,
            name: name,
            department: poState.exercise.department || '',
            erstwhile_cadre: '',
            status: 'ACTIVE',
            created_at: poNow()
        });
        added++;
    });
    poSyncStrengthMatrix();
    poAudit('CATEGORY_CREATED', { next: added + ' categories loaded from departmental rank master' });
    poSave();
    return added;
}

function poKeyOf(s) { return String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ''); }

function poSyncStrengthMatrix() {
    const activeCategories = poState.categories.filter(c => c.status !== 'INACTIVE');
    const activeCadres = poState.cadres.filter(c => c.status !== 'INACTIVE');
    const next = [];
    activeCategories.forEach(cat => {
        activeCadres.forEach(cadre => {
            const old = poState.strengths.find(s => s.category_id === cat.id && s.cadre_id === cadre.id);
            next.push({
                category_id: cat.id,
                cadre_id: cadre.id,
                cadre_strength: old ? (old.cadre_strength || 0) : 0,
                fws: old ? (old.fws || 0) : 0,
                status: 'ACTIVE'
            });
        });
    });
    poState.strengths = next;
}

function poSaveExercise() {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return false; }
    const prev = poState.exercise.exercise_id;
    const ex = poState.exercise;
    ex.exercise_id = (ex.exercise_id || '').trim();
    ex.department = (ex.department || '').trim();
    ex.erstwhile_district = (ex.erstwhile_district || '').trim();
    ex.new_districts = (ex.new_districts || '').trim();
    if (!ex.created_at) ex.created_at = poNow();
    ex.modified_at = poNow();
    poAudit('CADRE_UPDATED', { prev: prev, next: ex.exercise_id, reason: 'DLC configuration saved' });
    poSave();
    return true;
}

function poSaveCadre(id, name, cadreType) {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return false; }
    if (poStageIdx(poStage()) > poStageIdx('WORKING_STRENGTH_FINALIZED') && poState.strengths.some(s => s.cadre_id === id && (s.fws || 0) > 0)) {
        showToast('Cadre carries Final Working Strength and can no longer be renamed or retyped.', 'error');
        return false;
    }
    const clean = (id || '').trim();
    if (!clean || !name) { showToast('Cadre ID and name are required', 'error'); return false; }
    if (poState.cadres.some(c => c.id === clean && c.id !== id)) { showToast('Cadre ID already exists', 'error'); return false; }
    if (POEngine.PO_CADRE_TYPES.some(t => t.id === id)) { showToast('"' + id + '" is a reserved cadre-type id. Choose another.', 'error'); return false; }

    const existing = poState.cadres.find(c => c.id === id);
    if (existing) {
        poAudit('CADRE_UPDATED', { prev: existing.name + ' / ' + existing.cadre_type, next: name + ' / ' + cadreType });
        existing.name = name; existing.cadre_type = cadreType;
    } else {
        poState.cadres.push({ id: clean, name: name, cadre_type: cadreType, level: 'DISTRICT', status: 'ACTIVE' });
        poAudit('CADRE_CREATED', { next: clean + ' - ' + name + ' (' + cadreType + ')' });
    }
    poSyncStrengthMatrix();
    poSave();
    return true;
}

function poRemoveCadre(id) {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return false; }
    if (poState.dsl.length || poState.fsl.length) { showToast('Cannot remove a cadre once personnel data exists.', 'error'); return false; }
    if (poState.strengths.some(s => s.cadre_id === id && (s.fws || 0) > 0)) { showToast('Cannot remove a cadre carrying Final Working Strength.', 'error'); return false; }
    poState.cadres = poState.cadres.filter(c => c.id !== id);
    poSyncStrengthMatrix();
    poAudit('CADRE_UPDATED', { prev: id, next: 'removed' });
    poSave();
    return true;
}

function poSaveCategory(id, code, name, department, erstwhileCadre) {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return false; }
    const clean = (id || '').trim();
    if (!clean || !name) { showToast('Category ID and name are required', 'error'); return false; }
    if (poState.categories.some(c => c.id === clean && c.id !== id)) { showToast('Category ID already exists', 'error'); return false; }
    const existing = poState.categories.find(c => c.id === id);
    if (existing) {
        poAudit('CATEGORY_UPDATED', { prev: existing.code + ' / ' + existing.name, next: code + ' / ' + name });
        existing.code = code; existing.name = name; existing.department = department; existing.erstwhile_cadre = erstwhileCadre;
    } else {
        poState.categories.push({ id: clean, code: code, name: name, department: department, erstwhile_cadre: erstwhileCadre, status: 'ACTIVE', created_at: poNow() });
        poAudit('CATEGORY_CREATED', { next: clean + ' - ' + name });
    }
    poSyncStrengthMatrix();
    poSave();
    return true;
}

function poRemoveCategory(id) {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return false; }
    if (poState.dsl.some(r => r.category_id === id) || poState.fsl.some(r => r.category_id === id)) {
        showToast('Cannot remove a category while it has personnel.', 'error');
        return false;
    }
    poState.categories = poState.categories.filter(c => c.id !== id);
    poState.strengths = poState.strengths.filter(s => s.category_id !== id);
    poState.approved = poState.approved.filter(a => a.category_id !== id);
    poAudit('CATEGORY_UPDATED', { prev: id, next: 'removed' });
    poSave();
    return true;
}

function poSetApprovedStrength(categoryId, value) {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return; }
    if (poStageIdx(poStage()) > poStageIdx('WORKING_STRENGTH_FINALIZED')) {
        showToast('Approved working strength is frozen. Use a revision to change it.', 'error');
        return;
    }
    let row = poState.approved.find(a => a.category_id === categoryId);
    const prev = row ? row.approved_working_strength : null;
    if (!row) { row = { category_id: categoryId, approved_working_strength: 0 }; poState.approved.push(row); }
    row.approved_working_strength = parseInt(value) || 0;
    const v = poBumpVersion('fws');
    poAudit('APPROVED_STRENGTH_CHANGED', { prev: String(prev), next: String(row.approved_working_strength), reason: 'Approved working strength', version: poVersionLabel('fws') });
    poSave();
    return v;
}

function poSetStrength(categoryId, cadreId, field, value) {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return; }
    if (poStageIdx(poStage()) > poStageIdx('WORKING_STRENGTH_FINALIZED')) {
        showToast('Working strength is frozen once Finalized. FWS changes after DSL upload require a revision.', 'error');
        return;
    }
    let row = poState.strengths.find(s => s.category_id === categoryId && s.cadre_id === cadreId);
    if (!row) { row = { category_id: categoryId, cadre_id: cadreId, cadre_strength: 0, fws: 0, status: 'ACTIVE' }; poState.strengths.push(row); }
    const prev = row[field];
    const n = parseInt(value);
    if (isNaN(n) || n < 0) { showToast('Strength must be a non-negative number', 'error'); return; }
    row[field] = n;
    const v = poBumpVersion('fws');
    poAudit(field === 'fws' ? 'FWS_CHANGED' : 'CADRE_UPDATED', {
        prev: String(prev), next: String(n),
        reason: (poCtx().categoryById[categoryId] || {}).name + ' / ' + (poCtx().cadreById[cadreId] || {}).name,
        version: poVersionLabel('fws')
    });
    poSave();
}


// ============================================================================
// DSL  (para 5 - official entry; seniority is never manufactured)
// ============================================================================

const PO_DSL_COLUMNS = [
    { key: 'seniority_no',                header: 'Seniority No',                      required: true },
    { key: 'name',                        header: 'Employee Name',                    required: true },
    { key: 'parentage',                   header: 'Parentage',                        required: false },
    { key: 'gender',                      header: 'Gender',                           required: false },
    { key: 'cfms_id',                     header: 'CFMS ID',                          required: false },
    { key: 'mobile',                      header: 'Mobile Number',                    required: false },
    { key: 'date_of_birth',               header: 'Date of Birth',                    required: false },
    { key: 'date_of_joining_category',    header: 'Date of Joining in Category',      required: true },
    { key: 'rank_code',                   header: 'Rank',                             required: true },
    { key: 'category_id',                 header: 'Category ID',                      required: false },
    { key: 'office',                      header: 'Office',                           required: false },
    { key: 'designation',                 header: 'Designation',                      required: false },
    { key: 'social_category',             header: 'Social Category',                  required: true },
    { key: 'sc_group',                    header: 'SC/ST Group',                      required: false },
    { key: 'erstwhile_cadre',             header: 'Erstwhile Local Cadre',            required: false },
    { key: 'present_local_cadre',         header: 'Present Local Cadre',              required: false },
    { key: 'present_working_place',       header: 'Present Working Place',            required: false },
    { key: 'service_status',              header: 'Deputation/Status',                required: false },
    { key: 'deputation_unit',             header: 'Deputation Unit',                  required: false },
    { key: 'preferential_category',       header: 'Preferential Category',            required: false },
    { key: 'supporting_document_status',  header: 'Supporting Document',              required: false },
    { key: 'seniority_type',              header: 'Type of Seniority',                required: false }
];

function poBlankRecord(categoryId) {
    return {
        employee_id: 'PO-' + String(poState.dsl.length + 1).padStart(4, '0'),
        category_id: categoryId || '',
        rank_code: '',
        seniority_no: null,
        seniority_type: '',
        name: '', parentage: '', gender: '', cfms_id: '', mobile: '',
        date_of_birth: '', date_of_joining_category: '',
        office: '', designation: '',
        social_category: '', sc_group: '',
        erstwhile_cadre_id: '', present_local_cadre_id: '', present_working_place: '',
        service_status: 'PRESENT', deputation_unit: '',
        claims: poBlankClaims(),
        dsl_version: 0,
        created_at: poNow(), modified_at: poNow()
    };
}

function poBlankClaims() {
    const c = {};
    POEngine.PO_PREF_CLAIMS.forEach(def => {
        c[def.id] = { claimed: false, doc_present: '', cert_no: '', cert_date: '', disability_percent: '', verification: 'NOT_CLAIMED', verified_by: '', verified_at: '', remark: '' };
    });
    return c;
}

function poEnsureClaims(rec) {
    if (!rec.claims) rec.claims = {};
    POEngine.PO_PREF_CLAIMS.forEach(def => {
        if (!rec.claims[def.id]) {
            rec.claims[def.id] = { claimed: false, doc_present: '', cert_no: '', cert_date: '', disability_percent: '', verification: 'NOT_CLAIMED', verified_by: '', verified_at: '', remark: '' };
        }
    });
    return rec;
}

function poAssertDslEditable() {
    if (poStageIdx(poStage()) > poStageIdx('DSL_UPLOADED')) {
        showToast('The DSL is frozen at this stage. Use the FSL revision workflow instead.', 'error');
        return false;
    }
    return true;
}

function poSaveDslRecord(rec, isNew) {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return false; }
    if (!poAssertDslEditable()) return false;
    poEnsureClaims(rec);
    rec.modified_at = poNow();
    if (isNew) { rec.created_at = poNow(); poState.dsl.push(rec); }
    const v = poBumpVersion('dsl');
    rec.dsl_version = v;
    poAudit(isNew ? 'DSL_UPLOADED' : 'DSL_RECORD_SAVED', {
        prev: isNew ? '' : 'edited', next: rec.name + ' (' + rec.category_id + ')',
        employee_id: rec.employee_id, version: poVersionLabel('dsl')
    });
    poSave();
    return true;
}

function poDeleteDslRecord(employeeId) {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return false; }
    if (!poAssertDslEditable()) return false;
    const rec = poState.dsl.find(r => r.employee_id === employeeId);
    poState.dsl = poState.dsl.filter(r => r.employee_id !== employeeId);
    poAudit('DSL_RECORD_DELETED', { prev: rec ? rec.name : employeeId, next: '', employee_id: employeeId });
    poBumpVersion('dsl');
    poSave();
    return true;
}

/**
 * Normalise one uploaded row into a DSL record.
 * Seniority is copied verbatim. If it is absent it stays absent and is reported
 * as MISSING_SENIORITY - the system never substitutes a row number.
 */
function poRowToDslRecord(row, rowNo) {
    const catRaw = (row.category_id || row.rank_code || '').trim();
    const category = poState.categories.find(c =>
        c.id.toLowerCase() === catRaw.toLowerCase() ||
        poKeyOf(c.code) === poKeyOf(catRaw) ||
        poKeyOf(c.name) === poKeyOf(catRaw));
    const cadre = function(v) {
        const s = (v || '').trim();
        if (!s) return '';
        const hit = poState.cadres.find(c => c.id.toLowerCase() === s.toLowerCase() || poKeyOf(c.name) === poKeyOf(s));
        return hit ? hit.id : s;   // unknown value preserved -> flagged as INVALID_* by the validator
    };
    const senRaw = (row.seniority_no || '').trim();
    const sen = /^\d+$/.test(senRaw) ? parseInt(senRaw, 10) : null;

    const rec = {
        employee_id: 'PO-' + String(poState.dsl.length + 1).padStart(4, '0') + '-' + rowNo,
        category_id: category ? category.id : catRaw,
        rank_code: category ? category.code : (row.rank_code || '').trim(),
        seniority_no: sen,
        seniority_type: poNormalizeSeniorityType(row.seniority_type),
        name: (row.name || '').trim(),
        parentage: (row.parentage || '').trim(),
        gender: poNormalizeGender(row.gender),
        cfms_id: (row.cfms_id || '').trim(),
        mobile: (row.mobile || '').trim(),
        date_of_birth: poNormalizeDate(row.date_of_birth),
        date_of_joining_category: poNormalizeDate(row.date_of_joining_category || row.date_of_joining),
        office: (row.office || '').trim(),
        designation: (row.designation || '').trim(),
        social_category: (row.social_category || '').trim(),
        sc_group: poNormalizeSegGroup(row.sc_group),
        erstwhile_cadre_id: cadre(row.erstwhile_cadre),
        present_local_cadre_id: cadre(row.present_local_cadre),
        present_working_place: (row.present_working_place || '').trim(),
        service_status: poNormalizeStatus(row.service_status),
        deputation_unit: (row.deputation_unit || '').trim(),
        claims: poBlankClaims(),
        dsl_version: 0,
        created_at: poNow(),
        modified_at: poNow()
    };

    // A single free-text preferential column maps to one claim; verification
    // always starts as PENDING - a typed flag never grants preference.
    const prefRaw = (row.preferential_category || '').trim();
    if (prefRaw) {
        const def = POEngine.PO_PREF_CLAIMS.find(p =>
            poKeyOf(p.label) === poKeyOf(prefRaw) || poKeyOf(p.id) === poKeyOf(prefRaw) ||
            poKeyOf(p.label).indexOf(poKeyOf(prefRaw)) !== -1);
        if (def) {
            rec.claims[def.id] = {
                claimed: true,
                doc_present: poNormalizeYesNo(row.supporting_document_status),
                cert_no: '', cert_date: '', disability_percent: '',
                verification: 'PENDING', verified_by: '', verified_at: '', remark: 'Imported from DSL upload'
            };
        }
    }
    return rec;
}

function poImportDslRows(rows, replace) {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return 0; }
    if (!poAssertDslEditable()) return 0;
    if (replace) {
        poState.dsl = [];
        poAudit('DSL_UPLOADED', { prev: poState.dsl.length + ' records', next: 'replaced by upload' });
    }
    let n = 0;
    rows.forEach((row, i) => {
        const rec = poRowToDslRecord(row, i + 1);
        poState.dsl.push(rec);
        n++;
    });
    // re-key surrogates so they stay unique and stable after an import
    poState.dsl.forEach((r, i) => { r.employee_id = 'PO-' + String(i + 1).padStart(4, '0'); });
    const v = poBumpVersion('dsl');
    poState.dsl.forEach(r => { r.dsl_version = v; });
    poAudit('DSL_UPLOADED', { prev: '', next: n + ' records', reason: 'DSL upload', version: poVersionLabel('dsl') });
    poSave();
    return n;
}

function poRunDslValidation() {
    const r = POEngine.validateDSL(poState.dsl, { ctx: poCtx() });
    poState.dslValidation = r;
    poSave();
    return r;
}

function poDslTemplateCsv() {
    const headers = PO_DSL_COLUMNS.map(c => c.header);
    const sample = ['', 'Sample Name', 'S/o Sample', 'Male', '1234567', '9000000000', '01-01-1990', '01-01-2015', '', '', 'KRN PS', 'Police Constable', '', '', '', '', 'PRESENT', '', '', 'No', 'Provisional'];
    return headers.join(',') + '\n' + sample.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',') + '\n';
}

function poDslExportCsv() {
    const headers = PO_DSL_COLUMNS.map(c => c.header);
    const rows = poState.dsl.map(r => PO_DSL_COLUMNS.map(c => {
        let v = r[c.key];
        if (c.key === 'erstwhile_cadre') v = r.erstwhile_cadre_id;
        if (c.key === 'present_local_cadre') v = r.present_local_cadre_id;
        if (c.key === 'preferential_category') v = POEngine.poPreferredClaim(r) ? POEngine.poPreferredClaim(r).label : '';
        if (c.key === 'supporting_document_status') v = '';
        return v === undefined || v === null ? '' : String(v);
    }));
    return poToCsv(headers, rows);
}

function poToCsv(headers, rows) {
    const q = v => '"' + String(v === undefined || v === null ? '' : v).replace(/"/g, '""') + '"';
    return headers.map(q).join(',') + '\n' + rows.map(r => r.map(q).join(',')).join('\n') + '\n';
}


// ============================================================================
// Normalisers (shared by manual entry and CSV/Excel import)
// ============================================================================

function poNormalizeDate(val) {
    if (val === undefined || val === null || String(val).trim() === '') return '';
    const num = Number(val);
    if (!isNaN(num) && num > 20000 && num < 80000) {
        const d = new Date(Date.UTC(1899, 11, 30) + Math.round(num) * 86400000);
        return poFmtDate(d);
    }
    const s = String(val).trim();
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
        const p = s.split('-');
        return p[0] + '-' + String(p[1]).padStart(2, '0') + '-' + String(p[2]).padStart(2, '0');
    }
    const m = s.match(/^(\d{1,2})[\-\/.](\d{1,2})[\-\/.](\d{4})$/);
    if (m) {
        const d = parseInt(m[1], 10), mo = parseInt(m[2], 10), y = m[3];
        if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    }
    const n = new Date(s);
    if (!isNaN(n.getTime()) && s.length > 5) return poFmtDate(n);
    return s;
}

function poFmtDate(d) {
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
}

function poNormalizeGender(val) {
    const v = String(val || '').trim().toLowerCase();
    if (['male', 'm'].indexOf(v) !== -1) return 'Male';
    if (['female', 'f'].indexOf(v) !== -1) return 'Female';
    if (['other', 'transgender', 'tg'].indexOf(v) !== -1) return 'Other';
    return String(val || '').trim();
}

function poNormalizeSegGroup(val) {
    // strip dots, dashes, spaces AND underscores so SC_3, SC-3, SC 3 and SC3 all match
    const v = String(val || '').toUpperCase().replace(/[._\-\s]/g, '');
    if (!v) return '';
    if (['SC1', 'S1', 'SCGROUP1', 'SCGRP1', 'SCG1'].indexOf(v) !== -1) return 'SC_1';
    if (['SC2', 'S2', 'SCGROUP2', 'SCGRP2', 'SCG2'].indexOf(v) !== -1) return 'SC_2';
    if (['SC3', 'S3', 'SCGROUP3', 'SCGRP3', 'SCG3'].indexOf(v) !== -1) return 'SC_3';
    if (['ST', 'SCHEDULEDTRIBE', 'STGROUP'].indexOf(v) !== -1) return 'ST';
    return '';
}

function poNormalizeYesNo(val) {
    const v = String(val || '').trim().toLowerCase();
    if (['yes', 'y', 'true', '1', 'available', 'attached', 'yes '].indexOf(v) !== -1) return 'Yes';
    if (['no', 'n', 'false', '0', 'nil', 'none'].indexOf(v) !== -1) return 'No';
    return '';
}

function poNormalizeStatus(val) {
    const v = String(val || '').trim().toUpperCase().replace(/[\s\-/]+/g, '_');
    if (!v) return 'PRESENT';
    const hit = POEngine.PO_SERVICE_STATUS.find(s => s.id === v ||
        s.id.indexOf(v) !== -1 || v.indexOf(s.id) !== -1);
    return hit ? hit.id : String(val || '').trim();
}

function poNormalizeSeniorityType(val) {
    const v = String(val || '').trim().toLowerCase();
    if (v.indexOf('final') !== -1) return 'Final';
    if (v.indexOf('tent') !== -1) return 'Tentative';
    return 'Provisional';
}


// ============================================================================
// FSL  (para 8 - authoritative, locked, versioned)
// ============================================================================

function poBuildFslFromDsl() {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return 0; }
    if (!poState.dsl.length) { showToast('DSL is empty', 'error'); return 0; }
    if (poState.optionsLocked || poState.optionsOpenedAt || poStageIdx(poStage()) > poStageIdx('FSL_FINALIZED')) {
        showToast('The option window has opened. An FSL change now needs the revision workflow.', 'error');
        return 0;
    }
    // PART 4: the DSL objection process must be complete before the FSL can exist.
    if (!poEvent('dsl_published_at')) {
        showToast('The DSL has not been published. Objections can only follow publication of the DSL.', 'error');
        return 0;
    }
    const pending = poPendingObjections();
    if (pending.length) {
        showToast('FSL cannot be finalized: ' + pending.length + ' objection(s) are still pending or under review.', 'error');
        return 0;
    }
    if (!poEvent('objections_disposed_at')) {
        showToast('FSL cannot be finalized: the objection window has not been closed and disposed.', 'error');
        return 0;
    }
    if (!poFslEligible()) {
        showToast('FSL cannot be finalized before ' + poFslEligibilityDate().toISOString().slice(0, 10) +
            ' (calculated: day ' + PO_FSL_ELIGIBILITY_DAYS + ' from publication of the DSL).', 'error');
        return 0;
    }
    // The DSL is validated with the DSL validator here; the FSL validator needs the
    // fsl_version stamp that is applied below, so it runs afterwards for the record.
    const pre = POEngine.validateDSL(poState.dsl, { ctx: poCtx() });
    if (!pre.valid) { showToast('FSL cannot be built: ' + pre.errors.length + ' validation errors remain in the DSL.', 'error'); return 0; }

    // PART 25: retain the superseded FSL rather than destroying it.
    if (poState.fsl.length) {
        poState.history.fsl.push({
            at: poNow(), version: poVersionLabel('fsl'),
            records: JSON.parse(JSON.stringify(poState.fsl))
        });
    }
    const v = poBumpVersion('fsl');
    poState.fsl = poState.dsl.map(rec => Object.assign({}, JSON.parse(JSON.stringify(rec)), {
        fsl_version: v,
        finalized_at: poNow(),
        objections: (poState.objections || []).filter(o => o.employee_id === rec.employee_id).map(o => ({
            objection_id: o.objection_id, type: o.objection_type, status: o.status,
            disposal_reason: o.disposal_reason, revised_value: o.revised_value
        }))
    }));
    poState.fslLocked = true;
    poState.fslCreatedAt = poState.fslCreatedAt || poNow();
    poState.fslFinalizedAt = poNow();
    poState.fslValidation = POEngine.validateFSL(poState.fsl, { ctx: poCtx(), dsl: poState.dsl });
    poRecordEvent('fsl_created_at', poState.fslCreatedAt, { action: 'FSL_CREATED', prev: '', next: 'v' + v });
    poRecordEvent('fsl_finalized_at', poState.fslFinalizedAt, { action: 'FSL_FINALIZED', prev: '', next: poState.fsl.length + ' records' });
    poAudit('FSL_LOCKED', { prev: '', next: 'FSL locked at ' + poVersionLabel('fsl') });
    poSave();
    return poState.fsl.length;
}

function poImportFslRows(rows) {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return 0; }
    if (poState.fslLocked) { showToast('FSL is locked. Unlock through the revision workflow before importing.', 'error'); return 0; }
    const tmp = poState.dsl.slice();
    const n = poImportDslRows(rows, true);
    poState.dsl = tmp;                      // DSL is untouched by an FSL import
    return n;
}

function poReviseFsl(reason) {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return false; }
    if (!reason || !reason.trim()) { showToast('A reason is mandatory for an FSL revision', 'error'); return false; }
    const from = poVersionLabel('fsl');
    poState.fslRevisions.push({ at: poNow(), by: poUser(), reason: reason.trim(), from_version: from, to_version: 'v' + (poState.versions.fsl + 1), stage: poStage() });
    // PART 25: retain the superseded FSL, options and run. Nothing is destroyed.
    poState.history.fsl.push({ at: poNow(), version: from, superseded_by: 'v' + (poState.versions.fsl + 1), reason: reason.trim(), records: JSON.parse(JSON.stringify(poState.fsl)) });
    poState.history.options.push({ at: poNow(), version: poVersionLabel('options'), reason: 'FSL revised - options voided', options: JSON.parse(JSON.stringify(poState.options)) });
    poState.optionHistory = poState.optionHistory.concat(
        Object.keys(poState.options).map(k => ({
            employee_id: k, version: (poState.options[k] || {}).version || 'v1',
            voided_at: poNow(), void_reason: 'FSL revised', option: poState.options[k]
        }))
    );
    poState.fslLocked = false;
    poState.fslPublishedAt = null;
    poState.optionsLocked = false;
    poState.optionsOpenedAt = null;
    poState.optionsClosedAt = null;
    poState.options = {};
    poState.events.fsl_published_at = null;
    poState.events.options_opened_at = null;
    poState.events.options_closed_at = null;
    poBumpVersion('fsl');
    poState.fsl = [];
    poAudit('FSL_REVISED', { prev: from, next: 'v' + poState.versions.fsl, reason: reason.trim() });
    poSave();
    return true;
}

/** Publish the FSL. PART 5: the eligibility date is CALCULATED from the actual
 *  DSL publication timestamp (GO: FSL on the 7th day from DSL publication).
 *  No date is hard-coded and publication cannot precede it. */
function poPublishFsl() {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return false; }
    if (!poState.fsl.length) { showToast('The FSL is not finalized', 'error'); return false; }
    if (!poState.fslLocked) { showToast('The FSL must be locked before publication', 'error'); return false; }
    if (poState.fslPublishedAt) { showToast('The FSL is already published', 'error'); return false; }
    const pending = poPendingObjections();
    if (pending.length) { showToast('Cannot publish: ' + pending.length + ' objection(s) are not disposed', 'error'); return false; }
    if (!poEvent('objections_disposed_at')) { showToast('Cannot publish: the objection period is not complete', 'error'); return false; }
    if (!poFslEligible()) {
        const d = poFslEligibilityDate();
        showToast('The FSL becomes eligible for publication on ' + d.toISOString().slice(0, 10) +
            ' (7th day from publication of the DSL on ' + String(poEvent('dsl_published_at')).slice(0, 10) + ').', 'error');
        return false;
    }
    poState.fslPublishedAt = poNow();
    poRecordEvent('fsl_published_at', poState.fslPublishedAt, { action: 'FSL_PUBLISHED', prev: poVersionLabel('fsl'), next: 'published' });
    poSave();
    return true;
}

function poFsAnalysis() {
    return POEngine.analyseFSL(poActiveFsl(), { ctx: poCtx(), options: poState.options });
}

function poOptionDeadline() {
    if (!poState.fslPublishedAt) return null;
    const opened = poState.optionsOpenedAt ? new Date(poState.optionsOpenedAt) : new Date(poState.fslPublishedAt);
    return new Date(opened.getTime() + (poState.optionWindowDays || 5) * 86400000);
}

function poOptionDeadlinePassed() {
    const d = poOptionDeadline();
    return !!(d && Date.now() > d.getTime());
}


// ============================================================================
// Options  (para 12/13 - 1/2/3, locked, no random generation, ever)
// ============================================================================

function poOpenOptions() {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return false; }
    if (!poState.fslPublishedAt) { showToast('Publish the FSL first', 'error'); return false; }
    poState.optionsOpenedAt = poState.optionsOpenedAt || poNow();
    poBumpVersion('options');
    poRecordEvent('options_opened_at', poState.optionsOpenedAt, { action: 'OPTION_WINDOW_OPENED', next: 'closing ' + poOptionDeadline() });
    poSave();
    return true;
}

function poApplicableCadreIds(categoryId) {
    return POEngine.poApplicableCadres(categoryId, poState.strengths, poState.cadres);
}

function poSaveOption(employeeId, pref1, pref2, pref3) {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return { ok: false }; }
    if (poState.optionsLocked) { showToast('Options are locked. Option once exercised is final and irrevocable.', 'error'); return { ok: false }; }
    if (!poState.fslPublishedAt) { showToast('Options can only be submitted after the FSL is published.', 'error'); return { ok: false }; }
    if (poOptionDeadlinePassed()) { showToast('The option period has closed.', 'error'); return { ok: false }; }

    const rec = poActiveFsl().find(r => r.employee_id === employeeId);
    if (!rec) return { ok: false, errors: ['Employee is not on the FSL'] };

    const allowed = poApplicableCadreIds(rec.category_id);
    const picked = [pref1, pref2, pref3].map(x => (x || '').trim());
    if (picked.filter(Boolean).length === 0) return { ok: false, errors: ['At least one preference must be given'] };

    const errs = [];
    picked.forEach((p, i) => {
        if (!p) return;
        if (allowed.indexOf(p) === -1) {
            errs.push('Preference ' + (i + 1) + ' (' + (((poCtx().cadreById[p] || {}).name) || p) + ') is not configured for ' + (((poCtx().categoryById[rec.category_id] || {}).name) || rec.category_id));
        }
    });
    const seen = {};
    picked.forEach(p => {
        if (!p) return;
        if (seen[p]) errs.push('The same cadre cannot be repeated in more than one preference.');
        seen[p] = true;
    });
    if (errs.length) return { ok: false, errors: errs };

    const v = poState.versions.options || 1;
    const prev = poState.options[employeeId];
    poState.options[employeeId] = {
        employee_id: employeeId,
        category_id: rec.category_id,
        pref1: picked[0], pref2: picked[1], pref3: picked[2],
        submitted: true,
        submitted_at: poNow(),
        submitted_by: poUser(),
        session_id: poSessionId(),
        user_agent: (navigator && navigator.userAgent) ? navigator.userAgent : '',
        note: 'Client-side capture only. Source IP is not observable from the browser; server-side capture required.',
        version: 'v' + v
    };
    poAudit('OPTION_SUBMITTED', {
        prev: prev ? (prev.pref1 + '/' + prev.pref2 + '/' + prev.pref3) : 'no option',
        next: picked.join(' / '),
        employee_id: employeeId,
        reason: 'Option once exercised is final and irrevocable',
        version: 'v' + v
    });
    poSave();
    return { ok: true };
}

function poCloseOptions() {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return false; }
    if (poState.optionsLocked) { showToast('Options are already locked.', 'error'); return false; }
    poState.optionsLocked = true;
    poState.optionsClosedAt = poNow();
    poBumpVersion('options');
    poRecordEvent('options_closed_at', poState.optionsClosedAt, { action: 'OPTIONS_CLOSED', next: poVersionLabel('options') });
    const pending = poActiveFsl().filter(r => !(poState.options[r.employee_id] || {}).submitted);
    poAudit('OPTION_LOCKED', {
        prev: '', next: 'options closed; ' + pending.length + ' employee(s) recorded as NO OPTION',
        reason: 'Option window closed'
    });
    poSave();
    return true;
}

function poNoOptionEmployees() {
    return poActiveFsl().filter(r => !(poState.options[r.employee_id] || {}).submitted);
}

/**
 * PART 6 - audited correction of a locked option.
 *
 * An option, once submitted, is IMMUTABLE and is never edited in place. A
 * correction creates a NEW option version, retains the superseded version in
 * poState.optionHistory, and records reason / authority / old value / new value
 * in the audit trail. A correction is refused once allocation has begun, because
 * the run snapshot freezes the options version it was computed against.
 */
function poCorrectOption(employeeId, pref1, pref2, pref3, reason, authority) {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return { ok: false }; }
    if (!reason || !reason.trim()) { showToast('A correction reason is mandatory', 'error'); return { ok: false }; }
    if (!authority || !authority.trim()) { showToast('The correcting authority is mandatory', 'error'); return { ok: false }; }

    const prior = poState.options[employeeId];
    if (!prior) { showToast('That employee has not submitted an option', 'error'); return { ok: false }; }
    if (poStageIdx(poStage()) >= poStageIdx('ALLOCATION_RUNNING')) {
        showToast('Allocation has begun. The options version is frozen in the run snapshot and cannot be changed.', 'error');
        return { ok: false };
    }

    const rec = poActiveFsl().find(r => r.employee_id === employeeId);
    if (!rec) return { ok: false, errors: ['Employee is not on the FSL'] };

    const allowed = poApplicableCadreIds(rec.category_id);
    const picked = [pref1, pref2, pref3].map(x => (x || '').trim());
    if (picked.filter(Boolean).length === 0) return { ok: false, errors: ['At least one preference must be given'] };

    const errs = [];
    picked.forEach((p, i) => {
        if (!p) return;
        if (allowed.indexOf(p) === -1) {
            errs.push('Preference ' + (i + 1) + ' (' + (((poCtx().cadreById[p] || {}).name) || p) +
                ') is not configured for ' + (((poCtx().categoryById[rec.category_id] || {}).name) || rec.category_id));
        }
    });
    const seen = {};
    picked.forEach(p => {
        if (!p) return;
        if (seen[p]) errs.push('The same cadre cannot be repeated in more than one preference.');
        seen[p] = true;
    });
    if (errs.length) return { ok: false, errors: errs };

    const newVersionNumber = (poState.versions.options || 1) + 1;
    poState.optionHistory.push({
        employee_id: employeeId,
        version: prior.version || ('v' + (newVersionNumber - 1)),
        superseded_at: poNow(),
        superseded_by: 'v' + newVersionNumber,
        reason: reason.trim(),
        authority: authority.trim(),
        corrected_by: poUser(),
        option: JSON.parse(JSON.stringify(prior))
    });

    const v = poBumpVersion('options');
    poState.options[employeeId] = Object.assign({}, JSON.parse(JSON.stringify(prior)), {
        pref1: picked[0], pref2: picked[1], pref3: picked[2],
        version: 'v' + v,
        corrected_from_version: prior.version,
        correction_reason: reason.trim(),
        correction_authority: authority.trim(),
        corrected_at: poNow(),
        corrected_by: poUser(),
        immutable: true
    });
    poAudit('OPTION_CORRECTED', {
        prev: prior.pref1 + '/' + prior.pref2 + '/' + prior.pref3 + ' (' + (prior.version || '') + ')',
        next: picked.join(' / ') + ' (v' + v + ')',
        reason: reason.trim() + ' | authority: ' + authority.trim(),
        employee_id: employeeId,
        version: 'v' + v
    });
    poSave();
    return { ok: true, version: 'v' + v };
}


// ============================================================================
// Allocation / FAL  (para 14, 17, 18, 19, 29)
// ============================================================================

// ============================================================================
// DLC POLICY  (PART 10 / 11 / 14)
// These are POLICY DECISIONS, not GO requirements. They are configurable by the
// DLC, labelled as such, and FROZEN before ALLOCATION_RUNNING. After that point
// they cannot change, because the run snapshot records them.
// ============================================================================

function poPolicyFrozen() {
    return !!(poState.policy && poState.policy.frozen_at);
}

/** The policy may only be edited while unfrozen and before allocation begins. */
function poAssertPolicyEditable() {
    if (poPolicyFrozen() || poStageIdx(poStage()) >= poStageIdx('ALLOCATION_RUNNING')) {
        showToast('The allocation policy is frozen. It was locked before allocation began and cannot be changed.', 'error');
        return false;
    }
    return true;
}

function poSetPolicy(field, value) {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return false; }
    if (!poAssertPolicyEditable()) return false;
    const pol = poState.policy;
    if (field === 'compulsory_allocation_policy') {
        if (POEngine.PO_COMPULSORY_POLICY_IDS.indexOf(value) === -1) { showToast('Unknown compulsory allocation policy', 'error'); return false; }
    } else if (field === 'scst_rounding_policy') {
        if (POEngine.PO_ROUNDING_POLICY_IDS.indexOf(value) === -1) { showToast('Unknown rounding policy', 'error'); return false; }
    } else if (field === 'prefer_existing_on_compulsory' || field === 'scst_adjustment') {
        value = !!value;
    } else { showToast('Unknown policy field', 'error'); return false; }

    const prev = pol[field];
    pol[field] = value;
    poBumpVersion('policy');
    poAudit('POLICY_CHANGED', { prev: String(prev), next: String(value), reason: 'DLC policy decision (not a GO requirement)' });
    poSave();
    return true;
}

function poFreezePolicy() {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return false; }
    if (poPolicyFrozen()) { showToast('The allocation policy is already frozen', 'error'); return false; }
    poState.policy.frozen_at = poNow();
    poState.policy.frozen_by = poUser();
    poBumpVersion('policy');
    poAudit('POLICY_FROZEN', {
        prev: '', next: poState.policy.compulsory_allocation_policy,
        reason: 'Allocation policy frozen for ' + poState.exercise.exercise_id
    });
    poSave();
    return true;
}

/** Stable fingerprint of the official inputs a run was computed against. */
function poInputFingerprint() {
    const fsl = poActiveFsl().slice().sort((a, b) => String(a.employee_id).localeCompare(String(b.employee_id)));
    const rows = fsl.map(r => [
        r.employee_id, r.category_id, r.seniority_no, r.sc_group || '',
        r.erstwhile_cadre_id || '', r.present_local_cadre_id || '', r.service_status || '',
        POEngine.poPreferredClaim(r) ? POEngine.poPreferredClaim(r).id : ''
    ].join('|'));
    const optRows = Object.keys(poState.options).sort()
        .map(k => k + ':' + poState.options[k].pref1 + ',' + poState.options[k].pref2 + ',' + poState.options[k].pref3);
    const strRows = poState.strengths.map(s2 => s2.category_id + '/' + s2.cadre_id + '=' + s2.fws).sort();
    const src = rows.join('\n') + '\n#\n' + optRows.join('\n') + '\n#\n' + strRows.join('\n');
    let h = 0x811c9dc5;
    for (let i = 0; i < src.length; i++) {
        h ^= src.charCodeAt(i);
        h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return 'fnv1a-' + h.toString(16).padStart(8, '0');
}

/** Immutable allocation-run snapshot (PART 17): everything needed to reproduce
 *  this exact output, captured when the run starts. */
function poRunSnapshot(run) {
    const pol = poState.policy || {};
    return {
        exercise_id: poState.exercise.exercise_id || '',
        run_id: run.run_id,
        engine_version: POEngine.PO_ENGINE_VERSION,
        engine_hash: POEngine.poEngineHash(),
        fws_version: poVersionLabel('fws'),
        fsl_version: poVersionLabel('fsl'),
        options_version: poVersionLabel('options'),
        preferential_claim_version: poVersionLabel('claims'),
        policy_version: poVersionLabel('policy'),
        policy_frozen_at: pol.frozen_at || null,
        scst_configuration: {
            basis: POEngine.PO_SEG_BASIS,
            rounding_policy: pol.scst_rounding_policy,
            adjustment_enabled: !!pol.scst_adjustment,
            percents: Object.assign({}, poState.segPercents),
            notice: POEngine.PO_POLICY_NOTICE_ROUNDING
        },
        compulsory_allocation_policy: pol.compulsory_allocation_policy,
        compulsory_policy_notice: POEngine.PO_POLICY_NOTICE_COMPULSORY,
        prefer_existing_on_compulsory: !!pol.prefer_existing_on_compulsory,
        prefer_existing_notice: 'DLC policy decision, not a GO requirement.',
        started_at: run.started_at,
        user: poUser(),
        input_counts: run.input_counts,
        input_fingerprint: poInputFingerprint()
    };
}

function poRunEngine(mode) {
    const started = poNow();
    const pol = poState.policy || {};
    const result = POEngine.runAllocation({
        ctx: poCtx(),
        fsl: poActiveFsl(),
        options: poState.options,
        mode: mode,
        started_at: started,
        finished_at: poNow(),
        user: poUser(),
        // Frozen policy snapshot - identical inputs and policy always reproduce
        // identical output.
        compulsory_allocation_policy: pol.compulsory_allocation_policy,
        prefer_existing_on_compulsory: !!pol.prefer_existing_on_compulsory,
        scst_adjustment: pol.scst_adjustment !== false,
        rounding_policy: pol.scst_rounding_policy,
        fsl_version: poVersionLabel('fsl'),
        options_version: poVersionLabel('options'),
        fws_version: poVersionLabel('fws'),
        preferential_claim_version: poVersionLabel('claims')
    });
    result.snapshot = poRunSnapshot(result.run);
    return result;
}

function poSimulateAllocation() {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return null; }
    if (!poState.fsl.length) { showToast('FSL is not finalized', 'error'); return null; }
    if (!poState.fslLocked) { showToast('FSL must be locked before allocation.', 'error'); return null; }
    const ws = POEngine.validateWorkingStrength({ ctx: poCtx() });
    if (!ws.valid) { showToast('Working strength does not reconcile. Allocation is blocked.', 'error'); return null; }

    // PART 28: a simulation never modifies official state. It writes only the
    // preview held in poState.simulation, never the allocation run, FAL, OOA or OOT.
    const r = poRunEngine('SIMULATION');
    poState.simulation = {
        at: r.run.started_at, run: r.run, snapshot: r.snapshot,
        allocations: r.allocations, unallocated: r.unallocated,
        exceptions: r.exceptions, scstReview: r.scstReview
    };
    poAudit('ALLOCATION_SIMULATED', { prev: '', next: r.run.allocated + ' proposed allotments, ' + r.run.unallocated + ' not allocable', reason: 'Simulation only - no official state altered', version: POEngine.PO_ENGINE_VERSION });
    poSave();
    return r;
}

function poConfirmAllocation() {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return null; }
    if (!poState.fsl.length) { showToast('FSL is not finalized', 'error'); return null; }
    if (!poState.fslLocked) { showToast('FSL must be locked before allocation.', 'error'); return null; }
    if (!poState.fslPublishedAt) { showToast('FSL must be published before allocation.', 'error'); return null; }
    if (!poState.optionsLocked) { showToast('Close the option stage before confirming allocation.', 'error'); return null; }
    const ws = POEngine.validateWorkingStrength({ ctx: poCtx() });
    if (!ws.valid) { showToast('Working strength does not reconcile. Allocation is blocked.', 'error'); return null; }

    // PART 10: the policy is frozen the moment allocation officially begins.
    if (!poPolicyFrozen()) poFreezePolicy();

    poRecordEvent('allocation_started_at', poNow(), { action: 'ALLOCATION_STARTED', next: 'confirmed run started' });
    const r = poRunEngine('CONFIRMED');

    if (r.run.status !== 'PASSED') {
        // PART 29: never silently correct official data. The run is discarded
        // whole and the blocking exceptions are reported for DLC review.
        poState.allocationRun = null;
        poState.allocations = [];
        poAudit('ALLOCATION_FAILED', { prev: '', next: r.exceptions.filter(e => e.severity === 'BLOCKING').map(e => e.code).join(', '), reason: 'Allocation run failed. No automatic correction applied; DLC review required.', version: POEngine.PO_ENGINE_VERSION });
        poSave();
        return r;
    }

    // PART 25: retain the superseded run rather than destroying it.
    if (poState.allocationRun) {
        poState.history.allocationRun.push({
            at: poNow(), run_id: poState.allocationRun.run.run_id,
            snapshot: poState.allocationRun.snapshot || null,
            reason: 'Superseded by run ' + r.run.run_id
        });
    }

    poState.allocationRun = {
        at: r.run.started_at, run: r.run, snapshot: r.snapshot,
        allocations: r.allocations, unallocated: r.unallocated,
        exceptions: r.exceptions, scstReview: r.scstReview
    };
    poState.allocations = r.allocations;
    poRecordEvent('allocation_completed_at', poNow(), { action: 'ALLOCATION_COMPLETED', next: r.run.allocated + ' allotted, ' + r.run.unallocated + ' not allocable' });
    (r.scstReview.adjustments || []).forEach(a => {
        poAudit('SC_ST_ADJUSTMENT', {
            prev: (a.replaced_employee_name || a.replaced_employee_id) + ' allotted to ' + a.to_cadre +
                  ' (allocation sequence ' + (a.replaced_allocation_sequence === null ? '-' : a.replaced_allocation_sequence) + ')',
            next: (a.inserted_employee_name || a.inserted_employee_id) + ' allotted to ' + a.to_cadre +
                  ' (allocation sequence ' + (a.inserted_allocation_sequence === null ? '-' : a.inserted_allocation_sequence) + ')',
            reason: a.reason,
            employee_id: a.inserted_employee_id
        });
    });
    poSave();
    return r;
}

function poFALValidation() {
    if (!poState.allocationRun) return { valid: false, blocking: [{ code: 'NO_RUN', message: 'No confirmed allocation run' }], warnings: [], passed: [], accepted: [] };
    const r = POEngine.validateFAL(poState.allocationRun, { ctx: poCtx(), fsl: poState.fsl });
    // A critical SC/ST shortfall the DLC has formally acknowledged is reported as
    // an ACCEPTED EXCEPTION on the FAL rather than an unresolved blocker. The
    // computed figures are never altered.
    const ack = poAcceptedScstExceptions();
    if (ack.length) {
        r.blocking = r.blocking.filter(b => !(b.code === 'SC_ST_SHORTFALL_EXCEPTION' &&
            ack.some(a => a.exception_key === b.exception_key)));
    }
    if (ack.length) r.valid = r.blocking.length === 0;
    r.accepted = ack;
    return r;
}

function poGenerateFal() {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return false; }
    if (!poState.allocationRun) { showToast('Run a confirmed allocation first.', 'error'); return false; }
    const v = poFALValidation();
    if (!v.valid) { showToast('FAL cannot be generated: ' + v.blocking.length + ' blocking error(s).', 'error'); return false; }

    const ver = poBumpVersion('fal');
    const run = poState.allocationRun;
    // PART 25: retain any prior FAL before replacing it.
    if (poState.fal) {
        poState.history.fal.push({ at: poNow(), version: poState.fal.version, reason: 'Superseded by v' + ver });
    }
    poState.fal = {
        version: 'v' + ver,
        run_id: run.run.run_id,
        snapshot: run.snapshot || null,
        engine_version: run.run.engine_version,
        engine_hash: run.run.engine_hash,
        fsl_version: run.run.fsl_version,
        options_version: run.run.options_version,
        generated_at: poNow(),
        status: 'DRAFT',
        approved_at: null, approved_by: null,
        published_at: null, published_by: null,
        locked: false,
        rows: JSON.parse(JSON.stringify(run.allocations)),
        validation: { blocking: v.blocking, warnings: v.warnings }
    };
    poAudit('FAL_GENERATED', { prev: '', next: 'FAL ' + poState.fal.version + ' (' + run.allocations.length + ' rows)', version: 'v' + ver });
    poSave();
    return true;
}

function poApproveFal() {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return false; }
    if (!poState.fal || poState.fal.status !== 'DRAFT') { showToast('Generate the FAL first.', 'error'); return false; }
    const v = poFALValidation();
    if (!v.valid) { showToast('FAL cannot be approved: blocking errors present.', 'error'); return false; }
    poState.fal.status = 'APPROVED';
    poState.fal.approved_at = poNow();
    poState.fal.approved_by = poUser();
    poState.fal.validation = { blocking: v.blocking, warnings: v.warnings };
    poRecordEvent('fal_approved_at', poState.fal.approved_at, { action: 'FAL_APPROVED', prev: 'DRAFT', next: 'APPROVED' });
    poAudit('FAL_VALIDATED', { prev: '', next: v.warnings.length + ' warning(s), 0 blocking', version: poState.fal.version });
    poSave();
    return true;
}

function poPublishFal() {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return false; }
    if (!poState.fal || poState.fal.status !== 'APPROVED') { showToast('FAL must be approved before publication.', 'error'); return false; }
    poState.fal.status = 'PUBLISHED';
    poState.fal.published_at = poNow();
    poState.fal.published_by = poUser();
    poState.fal.locked = true;
    poRecordEvent('fal_generated_at', poState.fal.generated_at, { action: 'FAL_GENERATED', prev: '', next: poState.fal.version });
    poRecordEvent('fal_published_at', poState.fal.published_at, { action: 'FAL_PUBLISHED', prev: 'APPROVED', next: 'PUBLISHED (locked)' });
    poSave();
    return true;
}

function poReviseFal(reason) {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return false; }
    if (!reason || !reason.trim()) { showToast('A reason is mandatory for an FAL revision', 'error'); return false; }
    if (!poState.fal) { showToast('No FAL to revise', 'error'); return false; }
    const prev = poState.fal.version;
    poState.falRevisions = poState.falRevisions || [];
    poState.falRevisions.push({ at: poNow(), by: poUser(), reason: reason.trim(), from_version: prev, status: poState.fal.status });
    // PART 25: the superseded FAL and run are retained in full, never destroyed.
    poState.history.fal.push({ at: poNow(), version: prev, reason: reason.trim(), rows: JSON.parse(JSON.stringify(poState.fal.rows || [])) });
    if (poState.allocationRun) {
        poState.history.allocationRun.push({
            at: poNow(), run_id: poState.allocationRun.run.run_id,
            snapshot: poState.allocationRun.snapshot || null,
            reason: 'FAL revised: ' + reason.trim()
        });
    }
    poState.fal = null;
    poState.allocationRun = null;
    poState.allocations = [];
    poState.events.fal_published_at = null;
    poState.events.fal_approved_at = null;
    poAudit('FAL_REVISED', { prev: prev, next: 'unlocked for revision', reason: reason.trim() });
    poSave();
    return true;
}


// ============================================================================
// Orders  (para 20 OOA, para 21 OOT)
// ============================================================================

function poCompetentAuthority() {
    return (poState.exercise.chairman_name ? poState.exercise.chairman_designation : '') || 'DLC Chairman';
}

function poGenerateOoa() {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return 0; }
    if (!poState.fal || poState.fal.status !== 'PUBLISHED') { showToast('Publish the FAL before generating OOA.', 'error'); return 0; }
    const ver = poBumpVersion('ooa');
    // PART 21: an OOA may only be generated from a valid FAL allocation.
    const invalid = poState.fal.rows.filter(r => !r.allocation_reason || !r.cadre_id);
    if (invalid.length) {
        showToast('OOA cannot be generated: ' + invalid.length + ' FAL row(s) carry an invalid allocation.', 'error');
        return 0;
    }
    poState.history.ooa.push({ at: poNow(), version: poVersionLabel('ooa'), reason: 'Superseded by a new OOA generation', orders: JSON.parse(JSON.stringify(poState.ooa)) });
    poState.ooa = poState.fal.rows.map((r, i) => ({
        ooa_id: 'OOA-' + String(i + 1).padStart(5, '0'),
        employee_id: r.employee_id,
        name: r.name,
        parentage: r.parentage,
        cfms_id: poActiveFsl().find(f => f.employee_id === r.employee_id).cfms_id || '',
        mobile: poActiveFsl().find(f => f.employee_id === r.employee_id).mobile || '',
        designation: r.designation || r.rank_code,
        erstwhile_cadre: r.erstwhile_cadre_name,
        new_cadre: r.cadre_name,
        cadre_id: r.cadre_id,
        department: poState.exercise.department,
        competent_authority: poCompetentAuthority(),
        po_reference: 'Presidential Order-2025',
        go_reference: POEngine.PO_GO_REFERENCE.order + ', ' + POEngine.PO_GO_REFERENCE.department + ', dated ' + POEngine.PO_GO_REFERENCE.date,
        order_no: '',
        order_date: '',
        status: 'DRAFT',
        version: 'v' + ver,
        generated_at: poNow(),
        revision_of: '',
        revision_reason: ''
    }));
    poAudit('OOA_GENERATED', { prev: '', next: poState.ooa.length + ' OOA draft(s)', version: 'v' + ver });
    poSave();
    return poState.ooa.length;
}

function poApproveOoa() {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return 0; }
    const drafts = poState.ooa.filter(o => o.status === 'DRAFT');
    if (!drafts.length) { showToast('No OOA in DRAFT state.', 'error'); return 0; }
    drafts.forEach(o => { o.status = 'APPROVED'; });
    poAudit('OOA_APPROVED', { prev: 'DRAFT', next: drafts.length + ' OOA approved' });
    poSave();
    return drafts.length;
}

function poIssueOoa(prefix) {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return 0; }
    const pending = poState.ooa.filter(o => o.status === 'APPROVED');
    if (!pending.length) { showToast('No approved OOA to issue.', 'error'); return 0; }
    const base = prefix || ('OOA/' + (new Date().getFullYear()) + '/');
    const start = poState.ooa.filter(o => o.status === 'ISSUED').length + 1;
    pending.forEach((o, i) => {
        o.order_no = o.order_no || (base + String(start + i).padStart(4, '0'));
        o.order_date = o.order_date || new Date().toISOString().slice(0, 10);
        o.status = 'ISSUED';
        o.issued_at = poNow();
        o.issued_by = poUser();
    });
    poRecordEvent('ooa_issued_at', poNow(), { action: 'OOA_ISSUED', prev: 'APPROVED', next: pending.length + ' OOA issued' });
    poSave();
    return pending.length;
}

function poReviseOoa(ooaId, reason) {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return false; }
    if (!reason || !reason.trim()) { showToast('A revision reason is mandatory', 'error'); return false; }
    const o = poState.ooa.find(x => x.ooa_id === ooaId);
    if (!o) { showToast('OOA not found', 'error'); return false; }
    // An issued OOA is never deleted. It is superseded by a revision.
    o.status = 'REVISED';
    o.revision_reason = reason.trim();
    o.revised_at = poNow();
    poAudit('OOA_REVISED', { prev: 'ISSUED ' + o.order_no, next: 'REVISED', reason: reason.trim(), employee_id: o.employee_id });
    poSave();
    return true;
}

function poTransferRequired(alloc) {
    return !!(alloc.present_local_cadre_id && alloc.cadre_id && alloc.present_local_cadre_id !== alloc.cadre_id);
}

function poGenerateOot() {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return 0; }
    if (!poState.ooa.length || poState.ooa.some(o => o.status === 'DRAFT')) {
        showToast('Every OOA must be issued before OOT is generated.', 'error');
        return 0;
    }
    const ver = poBumpVersion('oot');
    const issued = {};
    poState.ooa.forEach(o => { issued[o.employee_id] = o; });

    poState.history.oot.push({ at: poNow(), version: poVersionLabel('oot'), reason: 'Superseded by a new OOT generation', orders: JSON.parse(JSON.stringify(poState.oot)) });
    poState.oot = (poState.fal ? poState.fal.rows : []).map((r, i) => {
        const required = poTransferRequired(r);
        return {
            oot_id: 'OOT-' + String(i + 1).padStart(5, '0'),
            employee_id: r.employee_id,
            name: r.name,
            designation: r.designation || r.rank_code,
            ooa_no: (issued[r.employee_id] || {}).order_no || '',
            transfer_required: required,
            existing_cadre: r.present_local_cadre_name || r.erstwhile_cadre_name || '',
            existing_office: (poActiveFsl().find(f => f.employee_id === r.employee_id) || {}).present_working_place || '',
            new_cadre: r.cadre_name,
            new_reporting_office: r.office || r.cadre_name,
            service_status_at_allotment: r.service_status,
            order_no: required ? '' : 'NOT REQUIRED',
            order_date: '',
            competent_authority: poCompetentAuthority(),
            joining_deadline: '',
            joining_window_days: poState.joiningWindowDays || 7,
            issued_date: '',
            joining_report_date: '',
            joining_status: required ? 'PENDING' : 'NOT_REQUIRED',
            status: required ? 'DRAFT' : 'NOT_REQUIRED',
            version: 'v' + ver
        };
    });
    const n = poState.oot.filter(o => o.transfer_required).length;
    poAudit('OOT_GENERATED', { prev: '', next: n + ' transfer order(s) required out of ' + poState.oot.length + ' employee(s)', version: 'v' + ver });
    poSave();
    return n;
}

function poIssueOot(prefix) {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return 0; }
    const pending = poState.oot.filter(o => o.status === 'DRAFT');
    if (!pending.length) { showToast('No OOT in DRAFT state.', 'error'); return 0; }
    const base = prefix || ('OOT/' + (new Date().getFullYear()) + '/');
    const start = poState.oot.filter(o => o.status === 'ISSUED').length + 1;
    const today = new Date();
    pending.forEach((o, i) => {
        o.order_no = o.order_no || (base + String(start + i).padStart(4, '0'));
        o.order_date = today.toISOString().slice(0, 10);
        o.issued_date = today.toISOString().slice(0, 10);
        o.joining_deadline = new Date(today.getTime() + (o.joining_window_days || 7) * 86400000).toISOString().slice(0, 10);
        o.status = 'ISSUED';
        o.joining_status = 'PENDING';
        o.issued_by = poUser();
    });
    const latestDeadline = pending.map(o => o.joining_deadline).sort().pop() || null;
    poRecordEvent('oot_issued_at', poNow(), { action: 'OOT_ISSUED', prev: 'DRAFT', next: pending.length + ' OOT issued' });
    poRecordEvent('joining_deadline', latestDeadline ? latestDeadline + 'T23:59:59.000Z' : null, { action: 'JOINING_DEADLINE', next: latestDeadline || 'n/a' });
    poAudit('OOT_ISSUED', { prev: 'DRAFT', next: pending.length + ' OOT issued; joining within ' + (poState.joiningWindowDays || 7) + ' days', reason: 'Latest joining deadline ' + (latestDeadline || 'n/a') });
    poSave();
    return pending.length;
}

function poRecordJoining(ootId, reportDate, remark, statusOverride) {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return false; }
    const o = poState.oot.find(x => x.oot_id === ootId);
    if (!o) { showToast('OOT not found', 'error'); return false; }
    if (o.status !== 'ISSUED') { showToast('Only an issued OOT can have a joining report.', 'error'); return false; }

    const prev = o.joining_status;
    const allowed = ['JOINED', 'OVERDUE', 'EXCEPTION'];
    const next = allowed.indexOf(statusOverride) !== -1 ? statusOverride : 'JOINED';
    o.joining_report_date = next === 'JOINED' ? (reportDate || new Date().toISOString().slice(0, 10)) : (reportDate || '');
    o.joining_status = next;
    o.joining_remark = remark || '';
    o.joining_within_deadline = o.joining_deadline ? (o.joining_report_date <= o.joining_deadline) : true;
    poAudit('JOINING_RECORDED', {
        prev: prev,
        next: next + (o.joining_report_date ? ' on ' + o.joining_report_date : '') +
              (o.joining_deadline ? (o.joining_within_deadline ? ' (within deadline)' : ' (after deadline)') : ''),
        reason: remark || '',
        employee_id: o.employee_id
    });
    poSave();
    return true;
}

/** Refresh derived joining statuses so OVERDUE appears without a manual edit. */
function poRefreshJoiningStatus() {
    const today = new Date().toISOString().slice(0, 10);
    poState.oot.forEach(o => {
        if (!o.transfer_required) return;
        if (o.joining_status === 'JOINED' || o.joining_status === 'EXCEPTION') return;
        if (o.joining_deadline && today > o.joining_deadline) o.joining_status = 'OVERDUE';
        else if (!o.joining_status) o.joining_status = 'PENDING';
    });
    return poState.oot;
}

/** Mandatory joining records still unresolved (PART 23). */
function poUnresolvedJoining() {
    poRefreshJoiningStatus();
    return poState.oot.filter(o => o.transfer_required && ['JOINED', 'EXCEPTION'].indexOf(o.joining_status) === -1);
}

/** Authorized closure override: the DLC may close the exercise with unresolved
 *  joining records only by giving a reason and authority, which is audited. */
function poOverrideJoiningClosure(reason, authority) {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return false; }
    if (!reason || !reason.trim()) { showToast('A closure-override reason is mandatory', 'error'); return false; }
    if (!authority || !authority.trim()) { showToast('The authorising authority is mandatory', 'error'); return false; }
    const open = poUnresolvedJoining();
    poState.joiningClosureOverride = {
        at: poNow(), by: poUser(), reason: reason.trim(), authority: authority.trim(),
        unresolved: open.map(o => ({ oot_id: o.oot_id, name: o.name, status: o.joining_status, deadline: o.joining_deadline }))
    };
    poAudit('JOINING_CLOSURE_OVERRIDE', {
        prev: open.length + ' unresolved joining record(s)',
        next: 'closure authorised',
        reason: reason.trim() + ' | authority: ' + authority.trim()
    });
    poSave();
    return true;
}

function poJoiningClosureOverridden() {
    return !!(poState.joiningClosureOverride && poState.joiningClosureOverride.at);
}


// ============================================================================
// Dashboard counters (para 25)
// ============================================================================

function poDashboard() {
    const fsl = poActiveFsl();
    const prefs = fsl.filter(r => POEngine.poPreferredClaim(r));
    const withOpt = fsl.filter(r => (poState.options[r.employee_id] || {}).submitted);
    const alloc = poState.allocations || [];
    const ctx = poCtx();
    const segCount = id => fsl.filter(r => r.sc_group === id).length;

    return {
        exercise_status: poState.exercise.status,
        stage: poStage(),
        cadres: {
            total: poState.cadres.length,
            active: poState.cadres.filter(c => c.status !== 'INACTIVE').length,
            fws: poState.strengths.reduce((n, s) => n + (parseInt(s.fws) || 0), 0)
        },
        personnel: {
            fsl_total: fsl.length,
            preferential_cases: prefs.length,
            sc: segCount('SC_1') + segCount('SC_2') + segCount('SC_3'),
            st: segCount('ST'),
            deputation: fsl.filter(r => r.service_status === 'DEPUTATION').length,
            no_option: fsl.length - withOpt.length
        },
        options: {
            submitted: withOpt.length,
            pending: fsl.length - withOpt.length,
            locked: poState.optionsLocked
        },
        allocation: {
            allocated: alloc.length,
            pending: (poState.allocationRun ? poState.allocationRun.unallocated.length : 0),
            exceptions: (poState.allocationRun ? poState.allocationRun.exceptions.length : 0),
            fws_exhausted: (poState.allocationRun ? poState.allocationRun.exceptions.filter(e => e.code === 'FWS_EXHAUSTED').length : 0),
            last_run: poState.allocationRun ? poState.allocationRun.run : null
        },
        fal: {
            generated: !!poState.fal,
            status: poState.fal ? poState.fal.status : 'NONE',
            validated: !!(poState.fal && poState.fal.approved_at),
            published: !!(poState.fal && poState.fal.published_at),
            version: poState.fal ? poState.fal.version : '-'
        },
        orders: {
            ooa_generated: poState.ooa.filter(o => o.status !== 'REVISED').length,
            ooa_issued: poState.ooa.filter(o => o.status === 'ISSUED').length,
            oot_generated: poState.oot.filter(o => o.transfer_required).length,
            oot_issued: poState.oot.filter(o => o.status === 'ISSUED').length,
            joining_completed: poState.oot.filter(o => o.joining_status === 'JOINED').length,
            joining_overdue: poState.oot.filter(o => o.joining_status === 'OVERDUE').length,
            joining_exception: poState.oot.filter(o => o.joining_status === 'EXCEPTION').length,
            joining_unresolved: poUnresolvedJoining().length,
            no_transfer_required: poState.oot.filter(o => !o.transfer_required).length
        },
        objections: {
            total: (poState.objections || []).length,
            pending: poPendingObjections().length,
            disposed: poDisposedObjections().length,
            window_open: poObjectionWindowOpen(),
            closing_date: poObjectionClosingDate() ? poObjectionClosingDate().toISOString().slice(0, 10) : null,
            processing_complete: poObjectionProcessingComplete()
        },
        timeline: poTimeline(),
        policy: {
            compulsory_allocation_policy: poState.policy.compulsory_allocation_policy,
            compulsory_notice: POEngine.PO_POLICY_NOTICE_COMPULSORY,
            prefer_existing_on_compulsory: !!poState.policy.prefer_existing_on_compulsory,
            prefer_existing_notice: 'DLC policy decision, not a GO requirement.',
            scst_rounding_policy: poState.policy.scst_rounding_policy,
            scst_notice: POEngine.PO_POLICY_NOTICE_ROUNDING,
            scst_basis: POEngine.PO_SEG_BASIS,
            frozen: poPolicyFrozen(),
            frozen_at: poState.policy.frozen_at
        },
        joining: {
            pending: poState.oot.filter(o => o.transfer_required && o.joining_status === 'PENDING').length,
            joined: poState.oot.filter(o => o.joining_status === 'JOINED').length,
            overdue: poState.oot.filter(o => o.joining_status === 'OVERDUE').length,
            exception: poState.oot.filter(o => o.joining_status === 'EXCEPTION').length,
            unresolved: poUnresolvedJoining().length,
            closure_overridden: poJoiningClosureOverridden()
        },
        storage: {
            mode: 'LOCALSTORAGE',
            authoritative: false,
            notice: PO_STORAGE_MODE_NOTICE
        },
        disclaimer: POEngine.PO_GO_REFERENCE.disclaimer,
        versions: {
            fws: poVersionLabel('fws'), dsl: poVersionLabel('dsl'), fsl: poVersionLabel('fsl'),
            options: poVersionLabel('options'), engine: POEngine.PO_ENGINE_VERSION,
            engine_hash: POEngine.poEngineHash(),
            claims: poVersionLabel('claims'), policy: poVersionLabel('policy'),
            fal: poVersionLabel('fal'), ooa: poVersionLabel('ooa'), oot: poVersionLabel('oot')
        }
    };
}

/**
 * PART 29 — every critical condition is reported with the same shape:
 * error code, description, employee, rank, cadre, source data and the
 * recommended action. Nothing is silently corrected.
 */
function poErrorDetail(code, ctx) {
    const c = ctx || {};
    const meta = POEngine.PO_ERROR_CATALOGUE[code] || { description: 'Unclassified condition', recommended: 'Report to the DLC for review.' };
    return {
        code: code,
        description: meta.description,
        employee: c.employee || '',
        rank: c.rank || c.category || '',
        cadre: c.cadre || '',
        source_data: c.source_data || '',
        recommended_action: meta.recommended
    };
}

/**
 * PART 15 / 19 — a critical SC/ST shortfall that cannot be corrected by any
 * valid substitution is carried as SC_ST_SHORTFALL_EXCEPTION and BLOCKS FAL
 * publication. The DLC may acknowledge it as an accepted exception with a
 * reason and an authority. Acceptance never changes the computed figures; it
 * records that the DLC has seen the shortfall and accepted it.
 */
function poAcceptScstException(reason, authority) {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return false; }
    if (!reason || !reason.trim()) { showToast('A reason is mandatory', 'error'); return false; }
    if (!authority || !authority.trim()) { showToast('The accepting authority is mandatory', 'error'); return false; }
    const data = poState.allocationRun || poState.simulation;
    if (!data) { showToast('There is no allocation result to acknowledge', 'error'); return false; }
    const critical = (data.scstReview && data.scstReview.shortfalls || []).filter(x => x.critical);
    if (!critical.length) { showToast('There is no critical SC/ST shortfall to acknowledge', 'error'); return false; }

    poState.acceptedExceptions = poState.acceptedExceptions || [];
    critical.forEach(x => {
        if (poState.acceptedExceptions.some(a => a.exception_key === x.exception_key)) return;
        poState.acceptedExceptions.push({
            code: x.code, exception_key: x.exception_key, category: x.category, cadre: x.cadre, group: x.group,
            group_label: x.group_label, required: x.required, actual: x.actual,
            shortfall: x.shortfall, working_strength: x.working_strength,
            reason: x.reason, acknowledged_reason: reason.trim(),
            acknowledged_by: authority.trim(), acknowledged_at: poNow(), user: poUser()
        });
    });
    poAudit('SC_ST_EXCEPTION_ACCEPTED', {
        prev: '', next: critical.length + ' critical SC/ST shortfall(s) acknowledged',
        reason: reason.trim() + ' | authority: ' + authority.trim()
    });
    poSave();
    return true;
}

/** Shortfalls the DLC has formally acknowledged. */
function poAcceptedScstExceptions() {
    return poState.acceptedExceptions || [];
}

/** Normalise any engine issue into the PART 29 shape. */
function poIssueDetail(issue) {
    const c = poCtx();
    return poErrorDetail(issue.code, {
        employee: issue.employee || issue.employee_id || '',
        rank: (c.categoryById[issue.category_id] || {}).name || '',
        cadre: issue.cadre || (c.cadreById[issue.cadre_id] || {}).name || '',
        source_data: issue.source_data || ''
    });
}

/** Full exception report for the current simulation / confirmed run. */
function poExceptionReport() {
    const data = poState.allocationRun || poState.simulation;
    if (!data) return [];
    return (data.exceptions || []).map(i => Object.assign(poIssueDetail(i), { severity: i.severity, message: i.message }));
}


// ============================================================================
// DSL OBJECTION SUBSYSTEM (PART 4)
// Every objection is its own record. Nothing is stored as a bare string, and
// nothing is overwritten: the previous value is retained and any revised value
// is recorded alongside it.
// ============================================================================

function poObjectionId() {
    return 'OBJ-' + String((poState.objections || []).length + 1).padStart(4, '0');
}

/** Objection window. Only open while the DSL is published and the statutory
 *  5-day period has not expired. */
function poObjectionWindowOpen() {
    const published = poEvent('dsl_published_at');
    if (!published) return false;
    if (poEvent('objection_closed_at')) return false;
    const close = new Date(new Date(published).getTime() + PO_OBJECTION_DAYS * 86400000);
    return Date.now() <= close.getTime();
}

function poObjectionClosingDate() {
    const published = poEvent('dsl_published_at');
    return published ? new Date(new Date(published).getTime() + PO_OBJECTION_DAYS * 86400000) : null;
}

/** FSL may only be finalized after the objection period has completed and
 *  every objection has been disposed. */
function poObjectionProcessingComplete() {
    return poPendingObjections().length === 0 && !!poEvent('objections_disposed_at');
}

function poPendingObjections() {
    return (poState.objections || []).filter(o => ['PENDING', 'UNDER_REVIEW'].indexOf(o.status) !== -1);
}

function poDisposedObjections() {
    return (poState.objections || []).filter(o => ['ACCEPTED', 'PARTIALLY_ACCEPTED', 'REJECTED', 'DISPOSED'].indexOf(o.status) !== -1);
}

/** Register an objection against a DSL record. */
function poRaiseObjection(employeeId, type, text, docs) {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return { ok: false }; }
    if (!poObjectionWindowOpen()) {
        return { ok: false, errors: ['The objection window is not open. Objections may only be recorded during the period following publication of the DSL.'] };
    }
    const rec = poState.dsl.find(r => r.employee_id === employeeId);
    if (!rec) return { ok: false, errors: ['Employee is not on the DSL'] };
    if (!text || !text.trim()) return { ok: false, errors: ['Objection text is required'] };
    if (PO_OBJECTION_TYPES.indexOf(type) === -1) return { ok: false, errors: ['Unknown objection type'] };

    const rec0 = {
        objection_id: poObjectionId(),
        employee_id: employeeId,
        employee_name: rec.name,
        exercise_id: poState.exercise.exercise_id || '',
        submitted_at: poNow(),
        objection_type: type,
        objection_text: text.trim(),
        supporting_documents: (docs || '').trim(),
        status: 'PENDING',
        disposed_at: null,
        disposal_reason: '',
        disposed_by: '',
        previous_value: '',
        revised_value: ''
    };
    poState.objections.push(rec0);
    poAudit('OBJECTION_RECORDED', {
        prev: '', next: rec0.objection_id + ' ' + type + ' [' + rec0.status + ']',
        reason: rec0.objection_text, employee_id: employeeId
    });
    poSave();
    return { ok: true, objection: rec0 };
}

/** Move an objection through its lifecycle. A required revision to the DSL is
 *  captured as previous_value -> revised_value and is audited. */
function poDisposeObjection(objectionId, status, disposalReason, revisedValue) {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return false; }
    if (['ACCEPTED', 'PARTIALLY_ACCEPTED', 'REJECTED', 'DISPOSED'].indexOf(status) === -1) {
        showToast('Unknown objection status', 'error');
        return false;
    }
    if (!disposalReason || !disposalReason.trim()) { showToast('A disposal reason is mandatory', 'error'); return false; }
    const o = (poState.objections || []).find(x => x.objection_id === objectionId);
    if (!o) { showToast('Objection not found', 'error'); return false; }
    if (o.status !== 'PENDING' && o.status !== 'UNDER_REVIEW') {
        showToast('That objection has already been disposed.', 'error');
        return false;
    }
    const prev = o.status;
    o.status = status;
    o.disposed_at = poNow();
    o.disposal_reason = disposalReason.trim();
    o.disposed_by = poUser();
    if (revisedValue !== undefined && revisedValue !== null && String(revisedValue).trim() !== '') {
        o.revised_value = String(revisedValue).trim();
    }
    poAudit('OBJECTION_DISPOSED', {
        prev: prev, next: status, reason: o.disposal_reason, employee_id: o.employee_id
    });
    if (o.revised_value) {
        poAudit('DSL_CORRECTED', {
            prev: o.previous_value || '(as uploaded)', next: o.revised_value,
            reason: 'Revision arising from objection ' + o.objection_id,
            employee_id: o.employee_id
        });
        // Retain the pre-revision value so nothing is silently destroyed (PART 25).
        poState.history.dsl = poState.history.dsl || [];
        poState.history.dsl.push({
            at: poNow(), employee_id: o.employee_id, objection_id: o.objection_id,
            before: JSON.parse(JSON.stringify(poState.dsl.find(r => r.employee_id === o.employee_id) || {})),
            after: o.revised_value, reason: o.disposal_reason
        });
    }
    poSave();
    return true;
}

/** Close the objection window. Only the DLC may do this and only once every
 *  objection has been disposed. */
function poCloseObjectionWindow(reason) {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return false; }
    if (poEvent('objection_closed_at')) { showToast('The objection window is already closed', 'error'); return false; }
    const pending = poPendingObjections();
    if (pending.length) {
        showToast('Cannot close: ' + pending.length + ' objection(s) are still pending.', 'error');
        return false;
    }
    poRecordEvent('objection_closed_at', poNow(), { action: 'OBJECTION_WINDOW_CLOSED', reason: reason || '' });
    poRecordEvent('objections_disposed_at', poNow(), { action: 'OBJECTIONS_DISPOSED', prev: String(pending.length) });
    poSave();
    return true;
}

/** FSL is eligible for publication only from the calculated date derived from
 *  the actual DSL publication timestamp. No date is hard-coded. */
function poFslEligibilityDate() {
    const published = poEvent('dsl_published_at');
    return published ? new Date(new Date(published).getTime() + PO_FSL_ELIGIBILITY_DAYS * 86400000) : null;
}

function poFslEligible() {
    const d = poFslEligibilityDate();
    return !!(d && Date.now() >= d.getTime());
}


// ============================================================================
// Reset (guarded, audited)
// ============================================================================

function poResetAll() {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return false; }
    if (!confirm('Reset the whole Presidential Order module? Every stage, list, order and audit record will be destroyed. This cannot be undone.')) return false;
    if (!confirm('Second confirmation: all FSL, options, allocations, FAL, OOA and OOT data will be lost.')) return false;
    const old = poState.audit.slice(-1)[0];
    poState = poFreshState();
    poSeedMasters();
    poAudit('PO_RESET', { prev: old ? old.action : '', next: 'module reset' });
    poSave();
    return true;
}
