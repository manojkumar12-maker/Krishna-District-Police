// ============================================================================
// poCore.js  —  Presidential Order-2025 / G.O.Ms.No.129  state & official-input layer
// ----------------------------------------------------------------------------
// Owns: persistence, versioning, the workflow state machine, and every mutation
// of OFFICIAL INPUT data (ranks, strengths, the seniority list, preferential
// claims, options, allocation, FAL, OOA, OOT).
//
// It does NOT render. All rendering lives in presidentialOrder.js.
// All allocation / validation maths lives in poEngine.js.
//
// The module is deliberately minimal. There is no DSL, no objection window and
// no audit trail: the DLC uploads the Seniority List for each cadre, that list
// is the only personnel dataset, and the allocation order is fixed by the order.
//
// Official inputs are only ever written by an explicit, permission-checked
// action. Nothing here invents a seniority number, a cadre, a strength or an
// option.
// ============================================================================

const PO_DATA_VERSION = 11;
const PO_STORAGE_KEY = 'po_state';

// --- Statutory periods (GO REQUIREMENT) -------------------------------------
// There is no objection period in this workflow. The option window opens on
// publication of the Seniority List; the joining deadline is set when the OOT
// is issued. Both are computed from the ACTUAL recorded timestamps.
const PO_DEFAULT_OPTION_DAYS = 5;
const PO_DEFAULT_JOINING_DAYS = 7;

// --- Persistence mode label --------------------------------------------------
const PO_STORAGE_MODE_NOTICE =
    'LOCAL DEVELOPMENT MODE - NOT AN AUTHORITATIVE OFFICIAL RECORD. ' +
    'PO exercise data is held in this browser only. It is not a shared DLC record, ' +
    'is not backed up centrally and must not be treated as the statutory register.';

// --- Cadres (fixed scope) ----------------------------------------------------
// This module covers exactly three districts. The cadre list is NOT editable:
// ids, names, order and cadre types are part of the module contract.
const PO_DEFAULT_CADRES = POEngine.PO_DISTRICTS.map(d => ({
    id: d.id,
    name: d.name,
    cadre_type: d.cadre_type,
    level: 'DISTRICT',
    status: 'ACTIVE'
}));

// Seed rank/categories preserved from the previous module (curated by request).
// Ranks are configuration, not law: the DLC may load the departmental rank
// master instead (see poSuggestCategoriesFromRankMaster).
const PO_DEFAULT_CATEGORIES = [
    'Assistant Sub-Inspector of Police', 'Head Constable (Civil)', 'Police Constable (Civil)',
    'Head Constable (AR)', 'Police Constable (AR)', 'Junior Assistant', 'Typists',
    'Record Assistant', 'Office Sub-Ordinates', 'Sweepers', 'Scavengers', 'Dhobi',
    'Barbers', 'Cobbler'
];

// --- The stage-based screens -------------------------------------------------
// Seven steps. The exercise reference data and the DLC composition are folded
// into step 1 (Ranks & Cadres) rather than given a screen of their own; the
// underlying values are unchanged and still gate the DRAFT stage.
const PO_STEPS = [
    { n: 1,  key: 'ranks',      label: 'Ranks & Cadres',   from: 'DRAFT' },
    { n: 2,  key: 'strength',   label: 'Working Strength', from: 'WORKING_STRENGTH_FINALIZED' },
    { n: 3,  key: 'seniority',  label: 'Seniority List',  from: 'FSL_UPLOADED' },
    { n: 4,  key: 'options',    label: 'Option Filling',   from: 'OPTIONS_OPEN' },
    { n: 5,  key: 'allocation', label: 'Allocation',       from: 'ALLOCATION_RUNNING' },
    { n: 6,  key: 'fal',        label: 'FAL',              from: 'FAL_GENERATED' },
    { n: 7,  key: 'orders',     label: 'OOA / OOT',        from: 'OOA_GENERATED' }
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
        // DLC policy decisions. Frozen before ALLOCATION_RUNNING.
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
        // The Seniority List. Uploaded per cadre by the DLC and locked as the
        // authoritative personnel dataset. There is no separate DSL.
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
        // Procedural event register - the statutory process behind the workflow.
        events: {},
        stage: 'DRAFT',
        versions: { fws: 0, fsl: 0, options: 0, fal: 0, ooa: 0, oot: 0, claims: 0, policy: 0 },
        // Retained prior versions of official records. Never delete + recreate:
        // every superseded version is appended here.
        history: { fsl: [], allocationRun: [], fal: [], ooa: [], oot: [], options: [] }
    };
}

/** Procedural event register keys. */
const PO_EVENT_KEYS = [
    'seniority_uploaded_at', 'fsl_created_at', 'fsl_finalized_at', 'fsl_published_at',
    'options_opened_at', 'options_closed_at',
    'allocation_started_at', 'allocation_completed_at',
    'fal_generated_at', 'fal_approved_at', 'fal_published_at',
    'ooa_generated_at', 'ooa_issued_at',
    'oot_generated_at', 'oot_issued_at', 'joining_deadline'
];

const PO_JOINING_STATUS = ['PENDING', 'JOINED', 'OVERDUE', 'EXCEPTION'];

/** Record a procedural event. The state machine shows the workflow; this shows
 *  the statutory process behind it. */
function poRecordEvent(key, at) {
    if (PO_EVENT_KEYS.indexOf(key) === -1) return null;
    poState.events = poState.events || {};
    poState.events[key] = at || poNow();
    return poState.events[key];
}

function poEvent(key) { return (poState.events || {})[key] || null; }

/** Timeline derived from the recorded events. Nothing is hard-coded. */
function poTimeline() {
    const d = iso => iso ? String(iso).slice(0, 10) : null;
    return {
        seniority_uploaded_at: d(poEvent('seniority_uploaded_at')),
        fsl_created_at: d(poEvent('fsl_created_at')),
        fsl_finalized_at: d(poEvent('fsl_finalized_at')),
        fsl_published_at: d(poEvent('fsl_published_at')),
        options_opened_at: d(poEvent('options_opened_at')),
        options_closed_at: d(poEvent('options_closed_at')),
        allocation_started_at: d(poEvent('allocation_started_at')),
        allocation_completed_at: d(poEvent('allocation_completed_at')),
        fal_generated_at: d(poEvent('fal_generated_at')),
        fal_approved_at: d(poEvent('fal_approved_at')),
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
        poState.versions = Object.assign({ fws: 0, fsl: 0, options: 0, fal: 0, ooa: 0, oot: 0, claims: 0, policy: 0 }, parsed.versions || {});
        poState.segPercents = Object.assign({}, PO_DEFAULT_SEG_PERCENTS, parsed.segPercents || {});
        poState.events = Object.assign({}, parsed.events || {});
        poState.history = Object.assign(poFreshState().history, parsed.history || {});
        poState.storage_mode_notice = PO_STORAGE_MODE_NOTICE;
        // The cadre set is fixed by the module, never carried in from storage.
        poState.cadres = PO_DEFAULT_CADRES.map(c => Object.assign({}, c));
        return poState;
    } catch (e) {
        console.error('poLoad failed', e);
        poState = poFreshState();
        return poState;
    }
}

function poSave() {
    if (!poState) poState = poFreshState();
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
// Versioning
//
// Versions are NOT an audit trail. They are the reproducibility contract: the
// allocation run snapshot and the FAL both record which version of the seniority
// list, options and working strength they were computed against.
// ============================================================================

function poBumpVersion(key) {
    if (!poState.versions) poState.versions = { fws: 0, fsl: 0, options: 0, fal: 0, ooa: 0, oot: 0, claims: 0, policy: 0 };
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
    const current = poCurrentStepIndex();
    if (poStage() === 'EXERCISE_CLOSED') return 'LOCKED';
    // A step already passed is DONE, not LOCKED: "finished" and "not yet
    // reachable" are different facts and the rail must not conflate them.
    if (stepIdx < current) return 'DONE';
    if (stepIdx === current) return 'OPEN';
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
            if (poState.cadres.length !== PO_DEFAULT_CADRES.length) g.errors.push('The cadre set must be Krishna, NTR and Eluru.');
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
        case 'FSL_UPLOADED': {
            // The seniority list is the only personnel dataset. It must be
            // non-empty and pass validation before it can be finalized.
            if (!poState.fsl.length) {
                g.errors.push('The seniority list is empty. Upload it for Krishna, NTR and Eluru first.');
                g.ok = false;
                break;
            }
            const r = POEngine.validateSeniorityList(poState.fsl, { ctx: poCtx() });
            poState.fslValidation = r;
            if (!r.valid) {
                r.errors.slice(0, 12).forEach(e => g.errors.push(e.code + ': ' + e.message));
                if (r.errors.length > 12) g.errors.push('... and ' + (r.errors.length - 12) + ' more validation errors.');
            }
            g.ok = g.errors.length === 0;
            break;
        }
        case 'FSL_FINALIZED': {
            if (!poState.fslLocked) g.errors.push('Lock the seniority list before it can be published.');
            const r = POEngine.validateSeniorityList(poState.fsl, { ctx: poCtx() });
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
            // Leaving this stage asserts its own work is done: the option window
            // was closed and every submitted option was locked.
            if (!poState.optionsLocked) {
                g.errors.push(poOptionDeadlinePassed()
                    ? 'The option period has closed. Close and lock the options to continue.'
                    : 'Close and lock the option entry before advancing.');
            }
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
            // Leaving this stage asserts its own work is done: published and locked.
            if (!poState.fal || poState.fal.status !== 'PUBLISHED') g.errors.push('Publish the FAL before advancing.');
            g.ok = g.errors.length === 0;
            break;
        }
        case 'FAL_PUBLISHED': {
            if (!poState.fal || poState.fal.status !== 'PUBLISHED') g.errors.push('The FAL must be published before orders can be generated.');
            if (!poState.fal || !poState.fal.rows.length) g.errors.push('The FAL has no rows; orders cannot be generated from it.');
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

function poActiveFsl() { return poState.fsl; }


// ============================================================================
// Masters: ranks/categories + the fixed cadre set + working strength
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
    const ex = poState.exercise;
    ex.exercise_id = (ex.exercise_id || '').trim();
    ex.department = (ex.department || '').trim();
    ex.erstwhile_district = (ex.erstwhile_district || '').trim();
    ex.new_districts = (ex.new_districts || '').trim();
    if (!ex.created_at) ex.created_at = poNow();
    ex.modified_at = poNow();
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
        existing.code = code; existing.name = name; existing.department = department; existing.erstwhile_cadre = erstwhileCadre;
    } else {
        poState.categories.push({ id: clean, code: code, name: name, department: department, erstwhile_cadre: erstwhileCadre, status: 'ACTIVE', created_at: poNow() });
    }
    poSyncStrengthMatrix();
    poSave();
    return true;
}

function poRemoveCategory(id) {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return false; }
    if (poState.fsl.some(r => r.category_id === id)) {
        showToast('Cannot remove a category while it has personnel on the seniority list.', 'error');
        return false;
    }
    poState.categories = poState.categories.filter(c => c.id !== id);
    poState.strengths = poState.strengths.filter(s => s.category_id !== id);
    poState.approved = poState.approved.filter(a => a.category_id !== id);
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
    if (!row) { row = { category_id: categoryId, approved_working_strength: 0 }; poState.approved.push(row); }
    row.approved_working_strength = parseInt(value) || 0;
    const v = poBumpVersion('fws');
    poSave();
    return v;
}

function poSetStrength(categoryId, cadreId, field, value) {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return; }
    if (poStageIdx(poStage()) > poStageIdx('WORKING_STRENGTH_FINALIZED')) {
        showToast('Working strength is frozen once Finalized. Revise it before re-running allocation.', 'error');
        return;
    }
    let row = poState.strengths.find(s => s.category_id === categoryId && s.cadre_id === cadreId);
    if (!row) { row = { category_id: categoryId, cadre_id: cadreId, cadre_strength: 0, fws: 0, status: 'ACTIVE' }; poState.strengths.push(row); }
    const n = parseInt(value);
    if (isNaN(n) || n < 0) { showToast('Strength must be a non-negative number', 'error'); return; }
    row[field] = n;
    poBumpVersion('fws');
    poSave();
}


// ============================================================================
// SENIORITY LIST  (official entry - seniority is never manufactured)
// ============================================================================

const PO_SENIORITY_COLUMNS = [
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
        employee_id: 'PO-' + String(poState.fsl.length + 1).padStart(4, '0'),
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
        fsl_version: 0,
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

/** The seniority list may only be edited while it is open, i.e. up to and
 *  including FSL_UPLOADED. After that it is locked. */
function poAssertSeniorityEditable() {
    if (poStageIdx(poStage()) > poStageIdx('FSL_UPLOADED')) {
        showToast('The seniority list is frozen at this stage. Use the revision workflow instead.', 'error');
        return false;
    }
    return true;
}

function poSaveSeniorityRecord(rec, isNew) {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return false; }
    if (!poAssertSeniorityEditable()) return false;
    poEnsureClaims(rec);
    rec.modified_at = poNow();
    if (isNew) { rec.created_at = poNow(); poState.fsl.push(rec); }
    const v = poBumpVersion('fsl');
    rec.fsl_version = v;
    poSave();
    return true;
}

function poDeleteSeniorityRecord(employeeId) {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return false; }
    if (!poAssertSeniorityEditable()) return false;
    poState.fsl = poState.fsl.filter(r => r.employee_id !== employeeId);
    poBumpVersion('fsl');
    poSave();
    return true;
}

/**
 * Normalise one uploaded row into a seniority-list record.
 * Seniority is copied verbatim. If it is absent it stays absent and is reported
 * as MISSING_SENIORITY - the system never substitutes a row number.
 */
function poRowToSeniorityRecord(row, rowNo) {
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
        employee_id: 'PO-' + String(poState.fsl.length + 1).padStart(4, '0') + '-' + rowNo,
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
        fsl_version: 0,
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
                verification: 'PENDING', verified_by: '', verified_at: '',
                remark: 'Imported from seniority list upload'
            };
        }
    }
    return rec;
}

/**
 * Import uploaded rows into the seniority list.
 *
 * `replace` is how the DLC uploads one file PER CADRE: uploading the Krishna
 * file REPLACES the Krishna rows and leaves the NTR and Eluru rows untouched.
 * Uploading a file that names no known cadre is refused rather than silently
 * appending duplicates - the per-cadre file must state Erstwhile or Present
 * Local Cadre.
 */
function poImportSeniorityRows(rows, replace) {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return 0; }
    if (!poAssertSeniorityEditable()) return 0;
    if (replace) {
        const fileCadres = {};
        (rows || []).forEach(r => {
            [r.erstwhile_cadre, r.present_local_cadre].filter(Boolean).forEach(x => {
                const hit = poState.cadres.find(c => c.id.toLowerCase() === String(x).trim().toLowerCase() ||
                    poKeyOf(c.name) === poKeyOf(x));
                if (hit) fileCadres[hit.id] = true;
            });
        });
        const ids = Object.keys(fileCadres);
        if (!ids.length) {
            showToast('The file does not name Krishna, NTR or Eluru in Erstwhile/Present Local Cadre. Each cadre must be uploaded as its own file.', 'error');
            return 0;
        }
        poState.fsl = poState.fsl.filter(r =>
            ids.indexOf(r.erstwhile_cadre_id) === -1 && ids.indexOf(r.present_local_cadre_id) === -1);
    }
    let n = 0;
    (rows || []).forEach((row, i) => {
        poState.fsl.push(poRowToSeniorityRecord(row, i + 1));
        n++;
    });
    // re-key surrogates so they stay unique and stable after an import
    poState.fsl.forEach((r, i) => { r.employee_id = 'PO-' + String(i + 1).padStart(4, '0'); });
    const v = poBumpVersion('fsl');
    poState.fsl.forEach(r => { r.fsl_version = v; });
    poState.fslCreatedAt = poState.fslCreatedAt || poNow();
    poRecordEvent('seniority_uploaded_at', poNow());
    poSave();
    return n;
}

function poRunSeniorityValidation() {
    const r = POEngine.validateSeniorityList(poState.fsl, { ctx: poCtx() });
    poState.fslValidation = r;
    poSave();
    return r;
}

function poSeniorityTemplateCsv() {
    const headers = PO_SENIORITY_COLUMNS.map(c => c.header);
    const sample = ['', 'Sample Name', 'S/o Sample', 'Male', '1234567', '9000000000', '01-01-1990', '01-01-2015', '', '', 'KRN PS', 'Police Constable', '', '', '', '', 'PRESENT', '', '', 'No', 'Provisional'];
    return headers.join(',') + '\n' + sample.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',') + '\n';
}

function poSeniorityExportCsv() {
    const headers = PO_SENIORITY_COLUMNS.map(c => c.header);
    const rows = poState.fsl.map(r => PO_SENIORITY_COLUMNS.map(c => {
        let v = r[c.key];
        if (c.key === 'erstwhile_cadre') v = r.erstwhile_cadre_id;
        if (c.key === 'present_local_cadre') v = r.present_local_cadre_id;
        if (c.key === 'preferential_category') v = POEngine.poPreferredClaim(r) ? POEngine.poPreferredClaim(r).label : '';
        if (c.key === 'supporting_document_status') v = '';
        return v === undefined || v === null ? '' : String(v);
    }));
    return poToCsv(headers, rows);
}

/** Quote every cell so a comma or quote inside a name cannot break the file. */
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
// SENIORITY LIST LIFECYCLE  (lock -> publish -> revise)
// The uploaded list IS the authoritative personnel dataset. There is no draft
// list and no objection window.
// ============================================================================

/** Lock the uploaded seniority list. It may only be locked once it validates
 *  cleanly, so the DLC cannot freeze a list that cannot be allocated from. */
function poFinalizeSeniorityList() {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return 0; }
    if (!poState.fsl.length) { showToast('The seniority list is empty', 'error'); return 0; }
    if (poState.fslLocked) { showToast('The seniority list is already locked', 'error'); return 0; }
    if (poState.optionsOpenedAt || poStageIdx(poStage()) > poStageIdx('FSL_UPLOADED')) {
        showToast('The option window has opened. A seniority list change now needs the revision workflow.', 'error');
        return 0;
    }
    const r = POEngine.validateSeniorityList(poState.fsl, { ctx: poCtx() });
    poState.fslValidation = r;
    if (!r.valid) {
        showToast('The seniority list cannot be locked: ' + r.errors.length + ' validation error(s) remain.', 'error');
        return 0;
    }

    // Retain the superseded list rather than destroying it.
    poState.history.fsl.push({
        at: poNow(), version: poVersionLabel('fsl'),
        records: JSON.parse(JSON.stringify(poState.fsl))
    });
    const v = poBumpVersion('fsl');
    poState.fsl = poState.fsl.map(rec => Object.assign({}, JSON.parse(JSON.stringify(rec)), {
        fsl_version: v,
        finalized_at: poNow()
    }));
    poState.fslLocked = true;
    poState.fslCreatedAt = poState.fslCreatedAt || poNow();
    poState.fslFinalizedAt = poNow();
    poState.fslValidation = POEngine.validateFSL(poState.fsl, { ctx: poCtx() });
    poRecordEvent('fsl_created_at', poState.fslCreatedAt);
    poRecordEvent('fsl_finalized_at', poState.fslFinalizedAt);
    poSave();
    return poState.fsl.length;
}

function poReviseFsl(reason) {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return false; }
    if (!reason || !reason.trim()) { showToast('A reason is mandatory for an FSL revision', 'error'); return false; }
    const from = poVersionLabel('fsl');
    poState.fslRevisions.push({ at: poNow(), by: poUser(), reason: reason.trim(), from_version: from, to_version: 'v' + (poState.versions.fsl + 1), stage: poStage() });
    // Retain the superseded FSL and options. Nothing is destroyed.
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
    poSave();
    return true;
}

/** Publish the locked seniority list. The option window opens from this
 *  timestamp; nothing is hard-coded. */
function poPublishFsl() {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return false; }
    if (!poState.fsl.length) { showToast('The seniority list has not been uploaded', 'error'); return false; }
    if (!poState.fslLocked) { showToast('The seniority list must be locked before publication', 'error'); return false; }
    if (poState.fslPublishedAt) { showToast('The seniority list is already published', 'error'); return false; }
    poState.fslPublishedAt = poNow();
    poRecordEvent('fsl_published_at', poState.fslPublishedAt);
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
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return { ok: false, errors: ['Admin only'] }; }
    if (poState.optionsLocked) { const m = 'Options are locked. Option once exercised is final and irrevocable.'; showToast(m, 'error'); return { ok: false, errors: [m] }; }
    if (!poState.fslPublishedAt) { const m = 'Options can only be submitted after the FSL is published.'; showToast(m, 'error'); return { ok: false, errors: [m] }; }
    if (poOptionDeadlinePassed()) { const m = 'The option period has closed.'; showToast(m, 'error'); return { ok: false, errors: [m] }; }

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
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return { ok: false, errors: ['Admin only'] }; }
    if (!reason || !reason.trim()) { showToast('A correction reason is mandatory', 'error'); return { ok: false, errors: ['A correction reason is mandatory'] }; }
    if (!authority || !authority.trim()) { showToast('The correcting authority is mandatory', 'error'); return { ok: false, errors: ['The correcting authority is mandatory'] }; }

    const prior = poState.options[employeeId];
    if (!prior) { showToast('That employee has not submitted an option', 'error'); return { ok: false, errors: ['That employee has not submitted an option'] }; }
    if (poStageIdx(poStage()) >= poStageIdx('ALLOCATION_RUNNING')) {
        const m = 'Allocation has begun. The options version is frozen in the run snapshot and cannot be changed.';
        showToast(m, 'error');
        return { ok: false, errors: [m] };
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
    poSave();
    return true;
}

function poFreezePolicy() {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return false; }
    if (poPolicyFrozen()) { showToast('The allocation policy is already frozen', 'error'); return false; }
    poState.policy.frozen_at = poNow();
    poState.policy.frozen_by = poUser();
    poBumpVersion('policy');
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
    poSave();
    return poState.ooa.length;
}

function poApproveOoa() {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return 0; }
    const drafts = poState.ooa.filter(o => o.status === 'DRAFT');
    if (!drafts.length) { showToast('No OOA in DRAFT state.', 'error'); return 0; }
    drafts.forEach(o => { o.status = 'APPROVED'; });
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
    poSave();
    return true;
}

function poJoiningClosureOverridden() {
    return !!(poState.joiningClosureOverride && poState.joiningClosureOverride.at);
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
// Reset (guarded)
// ============================================================================

function poResetAll() {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return false; }
    if (!confirm('Reset the whole Presidential Order module? Every stage, list, order and record will be destroyed. This cannot be undone.')) return false;
    if (!confirm('Second confirmation: all seniority list, options, allocations, FAL, OOA and OOT data will be lost.')) return false;
    poState = poFreshState();
    poSeedMasters();
    poSave();
    return true;
}
