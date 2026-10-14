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

const PO_DATA_VERSION = 13;
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

// Seed rank/categories for the Erstwhile Krishna District (curated by request).
// Ranks are configuration, not law: the DLC enters or uploads them here. No
// external rank master is consulted; the module holds its own data only.
const PO_DEFAULT_CATEGORIES = [
    'Assistant Sub-Inspector of Police (Civil)',
    'Head Constable (Civil)',
    'Head Constable (AR)',
    'Police Constable (Civil)',
    'Police Constable (AR)',
    'Junior Office Assistant',
    'Typists',
    'Record Assistant',
    'Office Sub-ordinate',
    'Scavenger',
    'Sweeper',
    'Barber',
    'Cobbler',
    'Dhobi'
];

// Pre-populated strength data for the Erstwhile Krishna District (Step 2).
// cadre_strength = sanctioned; working = physically working in the district;
// deputation = employees on deputation (still borne on the cadre);
// total_working = working + deputation; vacant = cadre_strength - total_working (min 0).
// The district split apportions total_working to Krishna, NTR and Eluru cadres.
const PO_ERSTWHILE_STRENGTH = {
    'Assistant Sub-Inspector of Police (Civil)': { cadre_strength: 150, working: 82,  deputation: 10 },
    'Head Constable (Civil)':                   { cadre_strength: 381, working: 378, deputation: 69 },
    'Head Constable (AR)':                       { cadre_strength: 108, working: 104, deputation: 14 },
    'Police Constable (Civil)':                  { cadre_strength: 1215, working: 991, deputation: 102 },
    'Police Constable (AR)':                     { cadre_strength: 367, working: 244, deputation: 25 },
    'Junior Office Assistant':                   { cadre_strength: 32, working: 32,  deputation: 0 },
    'Typists':                                   { cadre_strength: 13, working: 11,  deputation: 0 },
    'Record Assistant':                          { cadre_strength: 1, working: 1,   deputation: 0 },
    'Office Sub-ordinate':                       { cadre_strength: 2, working: 2,   deputation: 0 },
    'Scavenger':                                 { cadre_strength: 3, working: 2,   deputation: 0 },
    'Sweeper':                                   { cadre_strength: 9, working: 3,   deputation: 0 },
    'Barber':                                    { cadre_strength: 4, working: 2,   deputation: 0 },
    'Cobbler':                                   { cadre_strength: 1, working: 1,   deputation: 0 },
    'Dhobi':                                     { cadre_strength: 5, working: 1,   deputation: 0 }
};

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
            // The nine prescribed seats and their designations. Members sign the
            // generated lists, so no name is ever recorded here.
            dlc: poFreshDlc(),
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
            district_split: Object.assign({}, POEngine.PO_DEFAULT_DISTRICT_SPLIT),
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
        // Rank-by-rank completion tracking for Steps 3-7.
        rankProgress: { seniority: {}, options: {}, allocation: {}, fal: {}, ooa: {} },
        selectedRank: '',
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
        selectedRank: '',
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
        poState.rankProgress = Object.assign({ seniority: {}, options: {}, allocation: {}, fal: {}, ooa: {} }, parsed.rankProgress || {});
        poState.selectedRank = parsed.selectedRank || '';
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

// ============================================================================
// DLC composition (para 3)
//
// The Committee's roles and their prescribed strengths are fixed by the order.
// Only the DESIGNATION of each seat is an official input: the members sign the
// generated lists, so their names are never keyed into the system and the
// module never holds them.
// ============================================================================

const PO_DLC_ROLES = [
    { role: 'Member-Convener', count: 1, desc: 'District-level Departmental Head, erstwhile district' },
    { role: 'Co-Convener',     count: 2, desc: 'District-level Departmental Head(s) of the newly formed district(s)' },
    { role: 'Co-Member',       count: 2, desc: 'Co-Member(s) from the newly formed district(s)' },
    { role: 'Member',          count: 1, desc: 'Member nominated by the Committee' },
    { role: 'Co-Chairman',     count: 2, desc: 'District Collector(s) of the newly formed district(s)' },
    { role: 'Chairman',        count: 1, desc: 'District Collector of the erstwhile district' }
];

const PO_DLC_SIGN_ORDER = [
    'Member-Convener',
    'Co-Convener', 'Co-Convener',
    'Co-Member', 'Co-Member',
    'Member',
    'Co-Chairman', 'Co-Chairman',
    'Chairman'
];

/** The nine seats, in order. `n` disambiguates repeated roles for labelling. */
function poDlcSeats() {
    const out = [];
    PO_DLC_ROLES.forEach(r => {
        for (let i = 0; i < r.count; i++) {
            out.push({ role: r.role, n: i + 1, of: r.count, desc: r.desc, key: r.role.toLowerCase().replace(/[^a-z]+/g, '_') + (r.count > 1 ? '_' + (i + 1) : '') });
        }
    });
    return out;
}

/** The nine seats in FAL signatory order (same format for taking manual signs). */
function poDlcSignSeats() {
    const out = [];
    const byRole = {};
    PO_DLC_ROLES.forEach(r => {
        byRole[r.role] = [];
        for (let i = 0; i < r.count; i++) {
            byRole[r.role].push({ role: r.role, n: i + 1, of: r.count, desc: r.desc, key: r.role.toLowerCase().replace(/[^a-z]+/g, '_') + (r.count > 1 ? '_' + (i + 1) : '') });
        }
    });
    PO_DLC_SIGN_ORDER.forEach(role => {
        if (byRole[role] && byRole[role].length) out.push(byRole[role].shift());
    });
    return out;
}

function poSeatLabel(seat) {
    return seat.of > 1 ? seat.role + ' ' + seat.n : seat.role;
}

/** A blank composition in the prescribed order. */
function poFreshDlc() {
    return poDlcSeats().map(s => ({ role: s.role, n: s.n, designation: '' }));
}

/** Read the composition off state, tolerating state saved before it existed. */
function poDlc() {
    if (!poState.exercise.dlc || !poState.exercise.dlc.length) poState.exercise.dlc = poFreshDlc();
    return poState.exercise.dlc;
}

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

function poStage() { if (!poState) poLoad(); return poState.stage || 'DRAFT'; }

function poStageIdx(s) {
    if (!poState) poLoad();
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
            // Names are never held; the two presiding seats must at least carry a
            // designation, because it is what appears on the generated lists.
            // After reordering, Chairman is the last seat (index 8).
            const dlc = poDlc();
            const chairman = dlc.filter(d => d.role === 'Chairman')[0];
            if (!chairman || !String(chairman.designation || '').trim()) {
                g.errors.push('Chairman designation (District Collector of the erstwhile district) is required.');
            }
            const convener = dlc.filter(d => d.role === 'Member-Convener')[0];
            if (!convener || !String(convener.designation || '').trim()) {
                g.errors.push('Member-Convener designation (Departmental Head, erstwhile district) is required.');
            }
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
    poSeedErstwhileStrength();
    poSave();
}

/**
 * Pre-populate the working strength for the Erstwhile Krishna District ranks.
 * Sets the approved working strength and per-cadre FWS for each rank that has
 * an entry in PO_ERSTWHILE_STRENGTH. The district split apportions the total
 * working strength into Krishna, NTR and Eluru cadres.
 */
function poSeedErstwhileStrength() {
    const percents = poDistrictSplitPercents();
    poState.categories.forEach(cat => {
        const data = PO_ERSTWHILE_STRENGTH[cat.name];
        if (!data) return;
        const totalWorking = data.working + data.deputation;
        // Set cadre strength for each district from the percentage split of total sanctioned.
        const cadreShares = POEngine.poSplitByPercent(data.cadre_strength, percents);
        poState.cadres.forEach((cadre, i) => {
            const strRow = poState.strengths.find(s => s.category_id === cat.id && s.cadre_id === cadre.id);
            if (strRow) strRow.cadre_strength = cadreShares[i] || 0;
        });
        // Approved working strength is the Total Working figure (working + deputation).
        let approved = poState.approved.find(a => a.category_id === cat.id);
        if (!approved) { approved = { category_id: cat.id, approved_working_strength: 0 }; poState.approved.push(approved); }
        approved.approved_working_strength = totalWorking;
    });
    // Apply the district split so FWS is apportioned to Krishna, NTR and Eluru.
    poApplySplits();
    poBumpVersion('fws');
}

/**
 * Import categories from rows produced by the in-module CSV/Excel upload.
 * Columns map punctuation-insensitively: categoryid, code, categoryname,
 * department, erstwhilecadre, approvedworkingstrength. An existing Category ID
 * is updated in place; a new one is created. No external master is consulted.
 */
function poImportCategories(rows) {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return 0; }
    if (!Array.isArray(rows) || !rows.length) { showToast('No category rows to import', 'error'); return 0; }
    let added = 0, updated = 0, skipped = 0;
    rows.forEach(r => {
        const id = String(r.categoryid || '').trim();
        const name = String(r.categoryname || r.name || '').trim();
        if (!id || !name) { skipped++; return; }
        const code = String(r.code || '').trim() || name;
        const department = String(r.department || '').trim() || poState.exercise.department || '';
        const erstwhile = String(r.erstwhilecadre || r.erstwhile_cadre || '').trim();
        const existing = poState.categories.find(c => c.id === id);
        if (existing) {
            existing.code = code; existing.name = name;
            existing.department = department; existing.erstwhile_cadre = erstwhile;
            updated++;
        } else {
            poState.categories.push({ id: id, code: code, name: name, department: department,
                erstwhile_cadre: erstwhile, status: 'ACTIVE', created_at: poNow() });
            added++;
        }
        const aws = r.approvedworkingstrength;
        if (aws !== undefined && String(aws).trim() !== '') {
            const n = parseInt(aws, 10);
            if (!isNaN(n) && n >= 0) {
                let row = poState.approved.find(a => a.category_id === id);
                if (!row) { row = { category_id: id, approved_working_strength: 0 }; poState.approved.push(row); }
                row.approved_working_strength = n;
            }
        }
    });
    poSyncStrengthMatrix();
    poApplySplits();
    poSave();
    if (skipped && !added && !updated) { showToast('No usable rows found. Rows need a Category ID and name.', 'error'); return 0; }
    return added + updated;
}

function poCategoryTemplateCsv() {
    return poToCsv(['Category ID', 'Code', 'Category name', 'Department', 'Erstwhile cadre', 'Approved working strength'],
        [['CAT_15', 'Police Constable (AR) (Women)', 'Police Constable (AR) (Women)', 'Police', '', '0']]);
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

/**
 * Split percentages for the three cadres, in cadre order. Reads the DLC's
 * district_split policy (default 54/28/18) and returns one number per cadre.
 */
function poDistrictSplitPercents() {
    const pol = poState.policy && poState.policy.district_split;
    return poState.cadres.map(c => {
        const v = pol && pol[c.id] !== undefined ? pol[c.id] : 0;
        return Number(v) || 0;
    });
}

/**
 * Recompute the per-cadre FWS for every category from its approved working
 * strength and the district split, using largest-remainder apportionment. The
 * three district figures always sum exactly to the approved total.
 */
function poApplySplits() {
    const percents = poDistrictSplitPercents();
    const krishnaId = PO_DEFAULT_CADRES[0].id;
    poState.categories.forEach(cat => {
        const approved = (poState.approved.find(a => a.category_id === cat.id) || {}).approved_working_strength;
        if (approved === undefined || approved === null) return;
        const shares = POEngine.poSplitByPercent(approved, percents);
        // Cap NTR and Eluru at their cadre strength. Krishna (erstwhile residuary)
        // absorbs any overflow as deputation — it can exceed its sanctioned strength.
        const cappedShares = shares.slice();
        let overflow = 0;
        poState.cadres.forEach((cadre, i) => {
            if (cadre.id === krishnaId) return;
            const csRow = poState.strengths.find(s => s.category_id === cat.id && s.cadre_id === cadre.id);
            const cs = csRow ? (parseInt(csRow.cadre_strength) || 0) : 0;
            if (cappedShares[i] > cs) {
                overflow += cappedShares[i] - cs;
                cappedShares[i] = cs;
            }
        });
        // Krishna gets its own share plus all overflow from capped districts
        const krishnaIdx = poState.cadres.findIndex(c => c.id === krishnaId);
        if (krishnaIdx >= 0) cappedShares[krishnaIdx] += overflow;
        poState.cadres.forEach((cadre, i) => {
            const row = poState.strengths.find(s => s.category_id === cat.id && s.cadre_id === cadre.id);
            if (row) row.fws = cappedShares[i] || 0;
        });
    });
}

/**
 * Auto-split the working strength for every category. Called from the UI when
 * the DLC enters a total (or changes the split): the approved total is
 * apportioned to Krishna, NTR and Eluru and the per-cadre FWS becomes read-only.
 */
function poAutoSplitWorkingStrength() {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return false; }
    if (poStageIdx(poStage()) > poStageIdx('WORKING_STRENGTH_FINALIZED')) {
        showToast('Working strength is finalized and can no longer be split.', 'error');
        return false;
    }
    poApplySplits();
    poBumpVersion('fws');
    poSave();
    return true;
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
    { key: 'preferential_certificate_no', header: 'Preferential Certificate No',      required: false },
    { key: 'preferential_certificate_date', header: 'Certificate Date',               required: false },
    { key: 'disability_percent',          header: 'Certified Disability %',           required: false },
    { key: 'appointing_authority',        header: 'Appointing Authority',             required: false },
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

/**
 * A blank preferential claim. `appointing_authority` carries the certification
 * the GO requires: the category must be certified by the APPOINTING AUTHORITY
 * after verification of the records. Verification alone is not sufficient.
 */
function poBlankClaim() {
    return {
        claimed: false, doc_present: '', cert_no: '', cert_date: '',
        disability_percent: '', appointing_authority: '',
        verification: 'NOT_CLAIMED', verified_by: '', verified_at: '', remark: ''
    };
}

function poBlankClaims() {
    const c = {};
    POEngine.PO_PREF_CLAIMS.forEach(def => { c[def.id] = poBlankClaim(); });
    return c;
}

function poEnsureClaims(rec) {
    if (!rec.claims) rec.claims = {};
    POEngine.PO_PREF_CLAIMS.forEach(def => {
        if (!rec.claims[def.id]) rec.claims[def.id] = poBlankClaim();
        else if (rec.claims[def.id].appointing_authority === undefined) rec.claims[def.id].appointing_authority = '';
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
 * Header alias map: maps normalized header keys from uploaded files to
 * standard field names. The module's template headers and the official
 * "MODEL SENIORITY LIST" format both resolve through this map.
 * Keys are already normalized (lowercase, non-alphanumerics stripped) by poCsvToRows.
 */
const PO_HEADER_ALIASES = {
    seniority_no:            ['senioritynumber', 'seniorityno', 'seniority', 'empid', 'idno'],
    seniority_type:          ['typeofseniority', 'typeofseniorityflnalprovisionaltentative', 'typeofseniorityfinalprovisionaltentative', 'senioritytype', 'type'],
    proceedings_no:          ['senioritylist', 'aproceedingsnumber', 'proceedingsno', 'proceedingno', 'procno', 'caseno'],
    proceedings_date:        ['bdate', 'proceedingsdate', 'proceedingdate', 'procdate', 'date'],
    name:                    ['nameofthegovtservant', 'name', 'employeename', 'nameofemployee', 'nameofthegovts servant'],
    parentage:               ['parentage', 'fathername', 'spousename', 'parent'],
    gender:                  ['gendermf', 'gender', 'sex'],
    cfms_id:                 ['cfmsidno', 'cfmsid', 'cfms', 'cfmsno', 'cfms_id'],
    mobile:                  ['mobilenoof theemployee', 'mobilenooftheemployee', 'mobile', 'mobileno', 'mobile_number', 'phoneno', 'contactno'],
    date_of_birth:           ['dobddmmyyyy', 'dobddmmyy', 'dob', 'dateofbirth', 'birthdate', 'date_of_birth'],
    date_of_joining_category: ['dateofjoininginthecategory', 'dateofjoiningincategory', 'dateofjoining', 'doj', 'joiningdate', 'date_of_joining_category', 'dateofjoiningthecategory'],
    sc_group:                ['indicateifscgroupiiiiii', 'indicateifscgroupiii', 'scgroup', 'sc_group', 'reservedcategory', 'scstgroup', 'socialcategory', 'caste', 'category'],
    pwd_percent:             ['ifpwbdcertifieddisabilityasperthevalidsadaremcertificate', 'ifpwbd', 'pwbd', 'disabilitypercent', 'disability_percent', 'certifieddisability', 'sadarem', 'disabliltypercent', 'disability'],
    widow:                   ['ifwidowmentionyes', 'widow', 'iswidow', 'widowstatus'],
    disabled_children:       ['mentionyesifhavingmentallychallengedchildren', 'disabledchildren', 'disabled_children', 'mentallychallengedchildren', 'challengedchildren'],
    health_issues:           ['mentionifapplicableicanceriineurosurgeryiiikidneytransplantivopenheartsurgery', 'mentionifappilcabeicancer', 'cancer', 'healthissues', 'healthproblems', 'medicalcondition'],
    deputation:              ['deputation', 'on_deputation', 'is_deputation', 'deputationyesno', 'deputationyes/no'],
    g_no:                    ['gno', 'g_no', 'pfno', 'pf_no', 'pfnumber'],
    qualification:           ['ssc', 'qualification', 'education', 'qual'],
    native_place:            ['nativeplace', 'native_place', 'native', 'hometown', 'nativetown'],
    present_working_place:   ['presentworkingplace', 'present_working_place', 'presentworking', 'workingplace', 'presentoffice', 'present_working', 'presentposting'],
    remarks:                 ['remarks', 'remark', 'notes', 'note'],
    office:                  ['office', 'presentoffice', 'workingoffice'],
    designation:             ['designation', 'presentdesignation', 'post'],
    social_category:         ['socialcategory', 'social_category', 'caste', 'community']
};

/** Look up a field value from the row using the alias map. */
function poField(row, fieldName) {
    const aliases = PO_HEADER_ALIASES[fieldName] || [fieldName];
    for (const a of aliases) {
        const ak = String(a).toLowerCase().replace(/[^a-z0-9]+/g, '');
        if (row[ak] !== undefined && row[ak] !== null) return row[ak];
    }
    // Also try the raw fieldName itself
    if (row[fieldName] !== undefined && row[fieldName] !== null) return row[fieldName];
    return '';
}

/**
 * Normalise one uploaded row into a seniority-list record.
 * Seniority is copied verbatim. If it is absent it stays absent and is reported
 * as MISSING_SENIORITY - the system never substitutes a row number.
 */
function poRowToSeniorityRecord(row, rowNo) {
    const catRaw = (poField(row, 'category_id') || poField(row, 'rank_code') || '').trim();
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
    const senRaw = (poField(row, 'seniority_no') || '').trim();
    const sen = /^\d+$/.test(senRaw) ? parseInt(senRaw, 10) : null;

    const scGroupVal = poNormalizeSegGroup(poField(row, 'sc_group'));
    const socialCatRaw = (poField(row, 'social_category') || '').trim();

    const rec = {
        employee_id: 'PO-' + String(poState.fsl.length + 1).padStart(4, '0') + '-' + rowNo,
        category_id: category ? category.id : catRaw,
        rank_code: category ? category.code : (poField(row, 'rank_code') || '').trim(),
        seniority_no: sen,
        seniority_type: poNormalizeSeniorityType(poField(row, 'seniority_type')),
        name: (poField(row, 'name') || '').trim(),
        parentage: (poField(row, 'parentage') || '').trim(),
        gender: poNormalizeGender(poField(row, 'gender')),
        cfms_id: (poField(row, 'cfms_id') || '').trim(),
        mobile: (poField(row, 'mobile') || '').trim(),
        date_of_birth: poNormalizeDate(poField(row, 'date_of_birth')),
        date_of_joining_category: poNormalizeDate(poField(row, 'date_of_joining_category')),
        office: (poField(row, 'office') || '').trim(),
        designation: (poField(row, 'designation') || '').trim(),
        social_category: socialCatRaw || scGroupVal,
        sc_group: scGroupVal,
        erstwhile_cadre_id: cadre(poField(row, 'erstwhile_cadre')),
        present_local_cadre_id: cadre(poField(row, 'present_local_cadre')),
        present_working_place: (poField(row, 'present_working_place') || '').trim(),
        service_status: poNormalizeStatus(poField(row, 'deputation') || poField(row, 'service_status')),
        deputation_unit: (poField(row, 'deputation_unit') || '').trim(),
        claims: poBlankClaims(),
        fsl_version: 0,
        created_at: poNow(),
        modified_at: poNow()
    };

    // Parse preferential claims from the model file's individual columns.
    // The model file has separate columns for PwBD, Widow, Disabled Children,
    // and a combined Health Issues column (Cancer/Neuro Surgery/Kidney/Heart).
    const pwdVal = (poField(row, 'pwd_percent') || '').trim();
    if (pwdVal) {
        const pwdUpper = pwdVal.toUpperCase();
        const isYes = ['YES', 'Y', 'TRUE', '1', 'AVAILABLE'].indexOf(pwdUpper) !== -1;
        const pct = parseFloat(pwdVal.replace(/[^0-9.]/g, ''));
        if (isYes || (!isNaN(pct) && pct > 0)) {
            rec.claims.pwbd = Object.assign(poBlankClaim(), {
                claimed: true,
                doc_present: isYes ? 'Yes' : '',
                disability_percent: isYes ? '' : String(pct),
                verification: 'PENDING', verified_by: '', verified_at: '',
                remark: 'Imported from seniority list upload'
            });
        }
    }

    const widowVal = (poField(row, 'widow') || '').trim();
    if (widowVal && ['YES', 'Y', 'TRUE', '1'].indexOf(widowVal.toUpperCase()) !== -1) {
        rec.claims.widow = Object.assign(poBlankClaim(), {
            claimed: true, doc_present: 'Yes',
            verification: 'PENDING', verified_by: '', verified_at: '',
            remark: 'Imported from seniority list upload'
        });
    }

    const dcVal = (poField(row, 'disabled_children') || '').trim();
    if (dcVal && ['YES', 'Y', 'TRUE', '1'].indexOf(dcVal.toUpperCase()) !== -1) {
        rec.claims.disabled_children = Object.assign(poBlankClaim(), {
            claimed: true, doc_present: 'Yes',
            verification: 'PENDING', verified_by: '', verified_at: '',
            remark: 'Imported from seniority list upload'
        });
    }

    const healthVal = (poField(row, 'health_issues') || '').trim().toUpperCase();
    if (healthVal && ['YES', 'Y', 'TRUE', '1'].indexOf(healthVal) !== -1) {
        // Model file uses a single combined column; map to individual claims.
        rec.claims.cancer = Object.assign(poBlankClaim(), {
            claimed: true, doc_present: 'Yes',
            verification: 'PENDING', verified_by: '', verified_at: '',
            remark: 'Imported from seniority list upload'
        });
    } else if (healthVal) {
        // Check for specific health conditions mentioned in the combined column
        if (healthVal.indexOf('CANCER') !== -1) {
            rec.claims.cancer = Object.assign(poBlankClaim(), { claimed: true, doc_present: 'Yes', verification: 'PENDING', remark: 'Imported' });
        }
        if (healthVal.indexOf('NEURO') !== -1) {
            rec.claims.neurosurgery = Object.assign(poBlankClaim(), { claimed: true, doc_present: 'Yes', verification: 'PENDING', remark: 'Imported' });
        }
        if (healthVal.indexOf('KIDNEY') !== -1) {
            rec.claims.kidney = Object.assign(poBlankClaim(), { claimed: true, doc_present: 'Yes', verification: 'PENDING', remark: 'Imported' });
        }
        if (healthVal.indexOf('HEART') !== -1) {
            rec.claims.heart = Object.assign(poBlankClaim(), { claimed: true, doc_present: 'Yes', verification: 'PENDING', remark: 'Imported' });
        }
    }

    // Legacy: a single free-text preferential column (from the module template).
    const prefRaw = (poField(row, 'preferential_category') || '').trim();
    if (prefRaw && !pwdVal && !widowVal && !dcVal && !healthVal) {
        const def = POEngine.PO_PREF_CLAIMS.find(p =>
            poKeyOf(p.label) === poKeyOf(prefRaw) || poKeyOf(p.id) === poKeyOf(prefRaw) ||
            poKeyOf(p.label).indexOf(poKeyOf(prefRaw)) !== -1);
        if (def) {
            rec.claims[def.id] = Object.assign(poBlankClaim(), {
                claimed: true,
                doc_present: poNormalizeYesNo(poField(row, 'supporting_document_status')),
                cert_no: (poField(row, 'preferential_certificate_no') || '').trim(),
                cert_date: (poField(row, 'preferential_certificate_date') || '').trim(),
                disability_percent: (poField(row, 'disability_percent') || '').trim(),
                appointing_authority: (poField(row, 'appointing_authority') || '').trim(),
                verification: 'PENDING', verified_by: '', verified_at: '',
                remark: 'Imported from seniority list upload'
            });
        }
    }
    return rec;
}

/**
 * Import uploaded rows into the seniority list.
 *
 * `replace` is how the DLC uploads one file per rank: uploading the Police
 * Constable file replaces that rank's rows and leaves the other ranks untouched.
 *
 * `categoryId` is set when the UI uploads against a specific rank button. It
 * replaces only that rank's rows, assigns the single Erstwhile Krishna District
 * Cadre (DC_KRISHNA) as both erstwhile and present local cadre, and never reads
 * the category from the file — so the official model format (which carries no
 * category column) works. The bifurcation into Krishna, NTR and Eluru happens
 * during allocation.
 */
function poImportSeniorityRows(rows, replace, categoryId) {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return 0; }
    if (!poAssertSeniorityEditable()) return 0;
    const theCadre = PO_DEFAULT_CADRES[0].id;   // DC_KRISHNA — single erstwhile cadre
    if (replace && categoryId) {
        // Replace only the selected rank's rows; leave other ranks untouched.
        poState.fsl = poState.fsl.filter(r => r.category_id !== categoryId);
    }
    let n = 0;
    (rows || []).forEach((row, i) => {
        const rec = poRowToSeniorityRecord(row, i + 1);
        // Force the rank from the upload button.
        if (categoryId) {
            rec.category_id = categoryId;
            const cat = poState.categories.find(c => c.id === categoryId);
            rec.rank_code = cat ? cat.code : rec.rank_code;
        }
        // All employees belong to the single Erstwhile Krishna District Cadre.
        rec.erstwhile_cadre_id = theCadre;
        rec.present_local_cadre_id = theCadre;
        poState.fsl.push(rec);
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
    // Template mirrors the official MODEL SENIORITY LIST format so the DLC can
    // fill it in the same layout as the paper list.
    const headers = [
        'SI.No',
        'Type of Seniority\nFinal/ Provisional/ Tentative',
        'Seniority List',
        '(a) Proceedings Number',
        '(b) Date',
        'Seniority Number',
        'Name of the Govt. Servant',
        'Gender\nM/F',
        'CFMS ID NO.',
        'Mobile No of the employee',
        'DOB\ndd.mm.yyyy',
        'Date of Joining in the category',
        'Indicate if SC. (Group-I, II, III)',
        'If PwBD, certified Disability % as per the valid SADAREM certificate',
        'if widow, mention Yes.',
        'Mention Yes\nIf having Mentally Challenged Children',
        'Mention, If applicable\n(i) Cancer (ii)Neuro Surgery (iii) Kidney Transplant (iv) Open Heart Surgery',
        'Deputation\nYes/No',
        'G.No.'
    ];
    const sample = [
        '1',
        'Provisional',
        'C.No.125/A2/26',
        'C.No.125/A2/26',
        '09.03.26',
        '2',
        'B.NAGA RAJU',
        'M',
        '14381002',
        '9866832528',
        '30.05.1969',
        '21.01.1992',
        'SC-III',
        'NO',
        'NO',
        'NO',
        'NO',
        'NO',
        '610'
    ];
    return poToCsv(headers, [sample]);
}

function poSeniorityExportCsv(records) {
    const headers = PO_SENIORITY_COLUMNS.map(c => c.header);
    const data = records || poState.fsl;
    // Preferential fields live on the claim, not on the record. The highest
    // priority VERIFIED claim is what the list reports, and it is reported only
    // when the appointing authority has certified it.
    const claimKeys = ['preferential_certificate_no', 'preferential_certificate_date', 'disability_percent', 'appointing_authority'];
    const rows = data.map(r => PO_SENIORITY_COLUMNS.map(c => {
        let v = r[c.key];
        if (c.key === 'erstwhile_cadre') v = r.erstwhile_cadre_id;
        if (c.key === 'present_local_cadre') v = r.present_local_cadre_id;
        if (c.key === 'preferential_category') v = POEngine.poPreferredClaim(r) ? POEngine.poPreferredClaim(r).label : '';
        if (claimKeys.indexOf(c.key) !== -1) {
            const claim = POEngine.poPreferredClaim(r);
            const def = claim ? POEngine.PO_PREF_CLAIMS.find(d => d.id === claim.id) : null;
            const raw = def ? (r.claims && r.claims[def.id] ? r.claims[def.id][c.key] : '') : '';
            v = raw || '';
        }
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
    // Excel serial date number (model file provides these for some DOB cells)
    const num = Number(val);
    if (!isNaN(num) && num > 20000 && num < 80000) {
        const d = new Date(Date.UTC(1899, 11, 30) + Math.round(num) * 86400000);
        return poFmtDate(d);
    }
    const s = String(val).trim();
    // Some cells contain two dates separated by a newline (e.g. "21.01.1992\n23.01.1992").
    // Take the first one — it is the original date of joining.
    const firstLine = s.split(/\r?\n/)[0].trim();
    const s2 = firstLine || s;
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s2)) {
        const p = s2.split('-');
        return p[0] + '-' + String(p[1]).padStart(2, '0') + '-' + String(p[2]).padStart(2, '0');
    }
    const m = s2.match(/^(\d{1,2})[\-\/.](\d{1,2})[\-\/.](\d{4})$/);
    if (m) {
        const d = parseInt(m[1], 10), mo = parseInt(m[2], 10), y = m[3];
        if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    }
    // Two-digit year (e.g. "09.03.26" -> proceedings date in the model file)
    const m2 = s2.match(/^(\d{1,2})[\-\/.](\d{1,2})[\-\/.](\d{2})$/);
    if (m2) {
        const d = parseInt(m2[1], 10), mo = parseInt(m2[2], 10), y = parseInt(m2[3], 10);
        const yr = y >= 50 ? 1900 + y : 2000 + y;
        if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return String(yr) + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    }
    const n = new Date(s2);
    if (!isNaN(n.getTime()) && s2.length > 5) return poFmtDate(n);
    return s2;
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
    // strip dots, dashes, spaces AND underscores so SC_3, SC-3, SC 3 and SC3 all match.
    // Also strip Roman numerals (I, II, III) used by the model file: SC-III -> SC3.
    const v = String(val || '').toUpperCase()
        .replace(/[._\-\s]/g, '')
        .replace(/III$/g, '3').replace(/II$/g, '2').replace(/I$/g, '1').replace(/IV$/g, '4');
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
    // Handle Yes/No style deputation column: YES/Y/TRUE/1 => DEPUTATION
    if (['YES', 'Y', 'TRUE', '1', 'AVAILABLE'].indexOf(v) !== -1) return 'DEPUTATION';
    if (['NO', 'N', 'FALSE', '0', 'NIL', 'NONE', 'PRESENT'].indexOf(v) !== -1) return 'PRESENT';
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


// ============================================================================
// RANK-BY-RANK PROCESSING  (Steps 3-7)
// Each step processes one rank at a time with verification before confirming.
// ============================================================================

/** Mark a rank's step as completed (verified + confirmed by the DLC). */
function poMarkRankStepDone(step, categoryId) {
    if (!poIsAdmin()) return false;
    poState.rankProgress[step] = poState.rankProgress[step] || {};
    poState.rankProgress[step][categoryId] = poNow();
    poSave();
    return true;
}

/** Check whether a rank's step has been completed. */
function poIsRankStepDone(step, categoryId) {
    return !!(poState.rankProgress[step] && poState.rankProgress[step][categoryId]);
}

/** Count of ranks completed for a given step. */
function poRankStepDoneCount(step) {
    return Object.keys(poState.rankProgress[step] || {}).length;
}

/** All active categories. */
function poActiveCategories() {
    return poState.categories.filter(c => c.status !== 'INACTIVE');
}

/** Set the currently selected rank for rank-by-rank processing. */
function poSelectRank(categoryId) {
    poState.selectedRank = categoryId;
    poSave();
}

/** Records on the seniority list for the selected rank. */
function poSelectedRankFsl() {
    return poState.fsl.filter(r => r.category_id === poState.selectedRank);
}

/** Get the FAL rows for a specific rank. */
function poRankFalRows(categoryId) {
    if (!poState.fal) return [];
    return poState.fal.rows.filter(r => r.category_id === categoryId);
}

/** Get the allocation rows for a specific rank. */
function poRankAllocations(categoryId) {
    if (!poState.allocationRun) return [];
    return poState.allocationRun.allocations.filter(a => a.category_id === categoryId);
}

/** Get the OOA rows for a specific rank. */
function poRankOoaRows(categoryId) {
    return poState.ooa.filter(o => poState.fal && poState.fal.rows.some(r => r.employee_id === o.employee_id && r.category_id === categoryId));
}

/** Deputation summary for a rank: employees carried beyond cadre strength. */
function poRankDeputationSummary(categoryId) {
    const rows = poRankFalRows(categoryId);
    const deputed = rows.filter(r => r.deputation);
    return { total: rows.length, deputed: deputed.length, employees: deputed.map(r => ({ name: r.name, seniority_no: r.seniority_no, cadre_name: r.cadre_name })) };
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
    } else if (field === 'district_split') {
        // One non-negative percentage per fixed cadre. This drives the FWS split,
        // so it is frozen together with the working strength.
        if (poStageIdx(poStage()) > poStageIdx('WORKING_STRENGTH_FINALIZED')) {
            showToast('District split is frozen once the working strength is finalized.', 'error');
            return false;
        }
        const clean = {};
        let bad = false;
        poState.cadres.forEach(c => {
            const v = Number(value && value[c.id]);
            if (isNaN(v) || v < 0) bad = true;
            clean[c.id] = isNaN(v) ? 0 : v;
        });
        if (bad) { showToast('District split needs a non-negative percentage per district.', 'error'); return false; }
        if (poState.cadres.reduce((a, c) => a + (clean[c.id] || 0), 0) <= 0) {
            showToast('District split percentages must sum to more than zero.', 'error'); return false;
        }
        value = clean;
    } else { showToast('Unknown policy field', 'error'); return false; }

    const prev = pol[field];
    pol[field] = value;
    if (field === 'district_split') { poApplySplits(); poBumpVersion('fws'); }
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
    // Deputation adjustment: NTR and Eluru cannot exceed their sanctioned strength.
    // Excess employees are re-allocated to Krishna (which can hold deputation).
    poAdjustDeputation();
    poSave();
    return r;
}

/**
 * Deputation adjustment (G.O.Ms.No.129 clause 4.7).
 *
 * NTR and Eluru cadres CANNOT exceed their sanctioned (cadre_strength) posts.
 * When the allocation places more employees there than the cadre can hold,
 * the excess (last allotted, by allocation_sequence) is moved to Krishna,
 * which CAN exceed its sanctioned strength and carries the excess as deputation.
 *
 * Krishna is PO_DEFAULT_CADRES[0] (DC_KRISHNA — the residuary erstwhile district).
 * This adjustment runs after the allocation engine and SC/ST review.
 */
function poAdjustDeputation() {
    const run = poState.allocationRun;
    if (!run) return;
    const krishnaId = PO_DEFAULT_CADRES[0].id;
    const cadreStrength = {};
    poState.strengths.forEach(s => {
        if (s.status === 'INACTIVE') return;
        cadreStrength[s.category_id + '|' + s.cadre_id] = parseInt(s.cadre_strength) || 0;
    });

    const byCatCadre = {};
    run.allocations.forEach(a => {
        const k = a.category_id + '|' + a.cadre_id;
        (byCatCadre[k] = byCatCadre[k] || []).push(a);
    });

    // Sort each group by allocation_sequence so we can identify the "last allotted"
    Object.keys(byCatCadre).forEach(k => {
        byCatCadre[k].sort((a, b) => (a.allocation_sequence || 0) - (b.allocation_sequence || 0));
    });

    // For each category + non-Krishna cadre, move excess to Krishna
    Object.keys(byCatCadre).forEach(k => {
        const [catId, cadreId] = k.split('|');
        if (cadreId === krishnaId) return;  // Krishna can hold deputation
        const cs = cadreStrength[k] || 0;
        if (cs <= 0) return;
        const allocs = byCatCadre[k];
        if (allocs.length <= cs) return;

        // Excess employees: the LAST allotted (highest allocation_sequence)
        const excess = allocs.slice(cs);  // beyond sanctioned count
        excess.forEach(a => {
            const oldCadre = a.cadre_name;
            a.cadre_id = krishnaId;
            a.cadre_name = (POEngine.poBuildContext({ cadres: poState.cadres }).cadreById[krishnaId] || {}).name || krishnaId;
            a.deputation = true;
            a.allocation_reason = a.allocation_reason === 'SC_ST_ADJUSTMENT' ? 'SC_ST_ADJUSTMENT' : 'COMPULSORY_ALLOTMENT';
            a.remarks = 'Deputation: allotted beyond ' + oldCadre + ' sanctioned strength (' + cs + '). Carried to ' + a.cadre_name + '.';
            a.reason_detail = (a.reason_detail || '') + ' [Deputation adjustment: moved from ' + oldCadre + ' to ' + a.cadre_name + ' (' + oldCadre + ' exceeded sanctioned ' + cs + ')]';
        });
    });

    // Mark Krishna employees beyond Krishna's sanctioned as deputation
    Object.keys(byCatCadre).forEach(k => {
        const [catId, cadreId] = k.split('|');
        if (cadreId !== krishnaId) return;
        const cs = cadreStrength[k] || 0;
        if (cs <= 0) return;
        const allocs = byCatCadre[k];
        allocs.forEach((a, idx) => {
            if (idx + 1 > cs) {
                a.deputation = true;
                if (!a.remarks) a.remarks = 'Deputation: beyond Krishna sanctioned strength (' + cs + ').';
            }
        });
    });
}

/**
 * Compute vacant posts per cadre for the FAL.
 * Vacant = cadre_strength - min(allotted, cadre_strength) for each category+cadre.
 * Returns an array of { category_id, cadre_id, cadre_name, sanctioned, allotted, vacant }.
 */
function poVacantPosts() {
    const run = poState.allocationRun;
    if (!run) return [];
    const cadreStrength = {};
    poState.strengths.forEach(s => {
        if (s.status === 'INACTIVE') return;
        cadreStrength[s.category_id + '|' + s.cadre_id] = parseInt(s.cadre_strength) || 0;
    });
    const allotted = {};
    run.allocations.forEach(a => {
        const k = a.category_id + '|' + a.cadre_id;
        allotted[k] = (allotted[k] || 0) + 1;
    });
    const result = [];
    poState.strengths.forEach(s => {
        if (s.status === 'INACTIVE') return;
        const k = s.category_id + '|' + s.cadre_id;
        const cs = cadreStrength[k] || 0;
        const al = allotted[k] || 0;
        const effective = Math.min(al, cs);
        result.push({
            category_id: s.category_id,
            cadre_id: s.cadre_id,
            cadre_name: (POEngine.poBuildContext({ cadres: poState.cadres }).cadreById[s.cadre_id] || {}).name || s.cadre_id,
            category_name: (poState.categories.find(c => c.id === s.category_id) || {}).name || s.category_id,
            sanctioned: cs,
            allotted: al,
            vacant: Math.max(0, cs - effective)
        });
    });
    return result;
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
    const rows = JSON.parse(JSON.stringify(run.allocations));

    // Deputation marking: the allocation engine already marks deputation via
    // poAdjustDeputation(). For Krishna cadre, employees beyond sanctioned strength
    // are flagged as deputation. NTR/Eluru excess has already been moved to Krishna.
    const cadreStrength = {};
    poState.strengths.forEach(s => { cadreStrength[s.category_id + '|' + s.cadre_id] = parseInt(s.cadre_strength) || 0; });
    const byCadre = {};
    rows.forEach(r => { const k = r.category_id + '|' + r.cadre_id; (byCadre[k] = byCadre[k] || []).push(r); });
    Object.keys(byCadre).forEach(k => {
        byCadre[k].sort((a, b) => (a.allocation_sequence || 0) - (b.allocation_sequence || 0));
        const cs = cadreStrength[k] || 0;
        byCadre[k].forEach((r, idx) => {
            if (!r.remarks) r.remarks = '';
            // Krishna can hold deputation; flag beyond sanctioned
            if (k.endsWith('|' + PO_DEFAULT_CADRES[0].id) && cs > 0 && (idx + 1) > cs) {
                r.deputation = true;
                if (!r.remarks) r.remarks = 'Deputation: beyond Krishna sanctioned strength (' + cs + ').';
            }
        });
    });

    const vacantPosts = poVacantPosts();

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
        rows: rows,
        vacantPosts: vacantPosts,
        validation: { blocking: v.blocking, warnings: v.warnings }
    };
    poSave();
    return true;
}

/**
 * Record a remark against an FAL row (e.g. "deputation"). The FAL itself cannot
 * be hand-edited, but remarks are a DLC working note and remain editable until
 * the FAL is published/locked.
 */
function poSetFalRemark(employeeId, text) {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return false; }
    if (!poState.fal) { showToast('No FAL to edit', 'error'); return false; }
    if (poState.fal.locked) { showToast('The FAL is published and locked. Use the revision workflow to change remarks.', 'error'); return false; }
    const row = poState.fal.rows.find(r => r.employee_id === employeeId);
    if (!row) { showToast('FAL row not found', 'error'); return false; }
    row.remarks = String(text || '').trim();
    poBumpVersion('fal');
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
    const dlc = poDlc();
    const chairman = dlc.filter(d => d.role === 'Chairman')[0] || dlc[dlc.length - 1];
    return (chairman && String(chairman.designation || '').trim()) || 'DLC Chairman';
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
