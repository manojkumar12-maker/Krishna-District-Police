// ============================================================================
// poEngine.js  —  Presidential Order-2025 / G.O.Ms.No.129 allocation engine
// ----------------------------------------------------------------------------
// PURE LOGIC MODULE. No DOM, no localStorage, no network.
//
// Every function here is deterministic: the same official inputs always produce
// the same output, in the same order, with the same explanations. That is what
// makes an allotment reproducible and auditable ("why was this employee allotted
// to this cadre?").
//
// OFFICIAL INPUTS  (supplied by the DLC - never invented here)
//   categories / cadres / strengths / approvedStrength
//   fsl      - the Final Seniority List (authoritative personnel dataset)
//   options  - employee preference 1/2/3 as submitted and locked
//   claims   - preferential-category claims with certification + verification
//
// SYSTEM CALCULATIONS (produced here, always traceable)
//   vacancy, seniority ordering, preferential ordering, preference matching,
//   compulsory allotment, no-option allotment, SC/ST review, FAL validation
// ============================================================================

const PO_ENGINE_VERSION = '1.0.0';

// --- Workflow stages (strict, non-skippable) --------------------------------
const PO_STAGES = [
    'DRAFT',
    'CADRE_CONFIGURED',
    'WORKING_STRENGTH_FINALIZED',
    'DSL_UPLOADED',
    'DSL_VALIDATED',
    'DSL_PUBLISHED',
    'FSL_FINALIZED',
    'FSL_PUBLISHED',
    'OPTIONS_OPEN',
    'OPTIONS_CLOSED',
    'ALLOCATION_RUNNING',
    'ALLOCATION_VALIDATED',
    'FAL_GENERATED',
    'FAL_APPROVED',
    'FAL_PUBLISHED',
    'OOA_GENERATED',
    'OOA_ISSUED',
    'OOT_GENERATED',
    'OOT_ISSUED',
    'JOINING_COMPLETED',
    'EXERCISE_CLOSED'
];

const PO_STAGE_INDEX = {};
PO_STAGES.forEach((s, i) => { PO_STAGE_INDEX[s] = i; });

// --- Preferential categories (G.O.Ms.No.129 priority order) ----------------
// A claim only confers preference once the supporting document has been
// VERIFIED by the DLC. A manually ticked flag is never sufficient on its own.
const PO_PREF_CLAIMS = [
    { id: 'pwbd',              label: 'PwBD with certified disability of 70% or above', priority: 1, minPercent: 70, requiresDoc: true },
    { id: 'disabled_children', label: 'Employee having dependent mentally challenged child', priority: 2, requiresDoc: true },
    { id: 'widow',             label: 'Widow who remained unmarried', priority: 3, requiresDoc: true },
    { id: 'cancer',            label: 'Cancer', priority: 4, requiresDoc: true },
    { id: 'neurosurgery',      label: 'Major Neurosurgery', priority: 5, requiresDoc: true },
    { id: 'kidney',            label: 'Kidney Transplantation', priority: 6, requiresDoc: true },
    { id: 'liver',             label: 'Liver Transplantation', priority: 7, requiresDoc: true },
    { id: 'heart',             label: 'Open Heart Surgery', priority: 8, requiresDoc: true }
];

// --- Reserved (SC/ST) social groups ----------------------------------------
const PO_SEG_GROUPS = [
    { id: 'SC_1', label: 'SC Group-I',  percent: 1 },
    { id: 'SC_2', label: 'SC Group-II', percent: 6.5 },
    { id: 'SC_3', label: 'SC Group-III', percent: 7.5 },
    { id: 'ST',   label: 'ST',           percent: 6 }
];

// --- Employee service status -----------------------------------------------
// NONE of these statuses removes an employee from the DSL/FSL. An employee borne
// on a cadre stays represented regardless of where they are physically posted.
const PO_SERVICE_STATUS = [
    { id: 'PRESENT',          label: 'Present' },
    { id: 'DEPUTATION',       label: 'On Deputation' },
    { id: 'LEAVE',            label: 'On Leave' },
    { id: 'PROBATION',        label: 'On Probation' },
    { id: 'TRAINING',         label: 'On Training' },
    { id: 'SUSPENSION',       label: 'Under Suspension' },
    { id: 'ABSENT',           label: 'On Authorized Absence' },
    { id: 'UNABSENT',         label: 'Unauthorized Absence' },
    { id: 'ABSCONDING',       label: 'Absconding' }
];

const PO_SERVICE_STATUS_IDS = PO_SERVICE_STATUS.map(s => s.id);

// --- Cadre types ------------------------------------------------------------
const PO_CADRE_TYPES = [
    { id: 'RESIDUARY_ERSTWHILE',   label: 'Residuary Erstwhile District' },
    { id: 'NEWLY_FORMED_DISTRICT', label: 'Newly Formed District' },
    { id: 'CONTIGUOUS_DISTRICT',   label: 'Contiguous District' }
];

const PO_CADRE_TYPE_IDS = PO_CADRE_TYPES.map(c => c.id);

// --- Allocation reasons -----------------------------------------------------
const PO_ALLOC_REASONS = [
    { id: 'PREFERENTIAL_CATEGORY',         label: 'Preferential Category' },
    { id: 'SENIORITY_FIRST_PREFERENCE',    label: 'Seniority - First Preference' },
    { id: 'SENIORITY_SECOND_PREFERENCE',   label: 'Seniority - Second Preference' },
    { id: 'SENIORITY_THIRD_PREFERENCE',    label: 'Seniority - Third Preference' },
    { id: 'COMPULSORY_ALLOTMENT',         label: 'Compulsory Allotment' },
    { id: 'NO_OPTION_ALLOTMENT',           label: 'No Option - Allotment on Shortfall' },
    { id: 'SC_ST_ADJUSTMENT',              label: 'SC/ST Proportionate Adjustment' }
];

const PO_ALLOC_REASON_IDS = PO_ALLOC_REASONS.map(r => r.id);

// --- Compulsory allotment tie-breaker (PART 10) -----------------------------
// The GO permits compulsory allotment to any remaining clear post within working
// strength where a shortfall exists after preferences are exhausted. It does NOT
// prescribe WHICH post. The choice below is therefore a SYSTEM IMPLEMENTATION
// RULE, surfaced as a DLC policy and frozen before ALLOCATION_RUNNING.
const PO_COMPULSORY_POLICIES = [
    { id: 'LARGEST_REMAINING_VACANCY', label: 'Largest remaining vacancy (cadre order breaks ties)' },
    { id: 'CONFIGURED_CADRE_ORDER',   label: 'First cadre in configured order that has a vacancy' },
    { id: 'EXISTING_CADRE_FIRST',     label: 'Present local cadre first, then largest remaining vacancy' }
];
const PO_COMPULSORY_POLICY_IDS = PO_COMPULSORY_POLICIES.map(p => p.id);
const PO_DEFAULT_COMPULSORY_POLICY = 'LARGEST_REMAINING_VACANCY';
const PO_POLICY_NOTICE_COMPULSORY =
    'System allocation tie-breaker - DLC confirmation required. The GO permits compulsory ' +
    'allotment to any available clear post within working strength; it does not prescribe the ' +
    'order in which posts are considered.';

// --- SC/ST rounding policy (PART 14) -----------------------------------------
// The GO prescribes the percentages and the working-strength basis but the
// rounding convention is not stated in the provisions supplied to us. The policy
// below is a SYSTEM IMPLEMENTATION RULE and is labelled as such everywhere.
const PO_ROUNDING_POLICIES = [
    { id: 'ROUND_HALF_UP',   label: 'Round half up to the nearest whole post' },
    { id: 'ROUND_FLOOR',    label: 'Round down (floor) to the nearest whole post' },
    { id: 'ROUND_CEILING',  label: 'Round up (ceiling) to the nearest whole post' }
];
const PO_ROUNDING_POLICY_IDS = PO_ROUNDING_POLICIES.map(r => r.id);
const PO_DEFAULT_ROUNDING_POLICY = 'ROUND_HALF_UP';
const PO_POLICY_NOTICE_ROUNDING =
    'Software calculation rule - requires DLC confirmation if not explicitly prescribed ' +
    'elsewhere. The prescribed percentages are 1% / 6.5% / 7.5% / 6% of working strength.';

function poApplyRounding(value, policy) {
    const v = Number(value) || 0;
    switch (policy) {
        case 'ROUND_FLOOR': return Math.floor(v);
        case 'ROUND_CEILING': return Math.ceil(v);
        default: return Math.round(v);   // ROUND_HALF_UP
    }
}

// --- SC/ST basis is fixed by the order ---------------------------------------
// PART 14: the GO refers to proportionate distribution based on WORKING STRENGTH.
// There is deliberately no user-facing ALLOCATED-vs-FWS choice.
const PO_SEG_BASIS = 'FINAL_WORKING_STRENGTH';

// --- Error catalogue (PART 29) ----------------------------------------------
// Every critical condition surfaces code + description + employee + rank +
// cadre + source data + recommended action, so nothing is silently corrected.
const PO_ERROR_CATALOGUE = {
    FWS_EXCEEDED:              { description: 'Allotted count exceeds the Final Working Strength for a rank and cadre', recommended: 'Correct the working strength configuration or re-run allocation. Never force an allotment beyond FWS.' },
    FWS_EXHAUSTED:             { description: 'No post remains within Final Working Strength', recommended: 'Review whether the approved working strength requires amendment by the DLC.' },
    MISSING_SENIORITY:         { description: 'Seniority number is missing; it is official data and is never generated', recommended: 'Obtain the official seniority number and enter it. The record cannot be finalized without it.' },
    DUPLICATE_SENIORITY:       { description: 'Seniority number is duplicated within the same rank/category', recommended: 'Correct the duplicate in the DSL before finalizing.' },
    DUPLICATE_CFMS:            { description: 'CFMS ID is duplicated within the same rank/category', recommended: 'Verify the CFMS IDs and correct the duplicate.' },
    DUPLICATE_ACROSS_RANKS:    { description: 'The same employee appears under more than one rank/category', recommended: 'Remove the erroneous entry. Rank/category mixing is not permitted.' },
    MISSING_DOJ_CATEGORY:      { description: 'Date of joining in the category is missing', recommended: 'Enter the date of joining in the category. Appointment or promotion dates are not substituted.' },
    MISSING_SOCIAL_CATEGORY:   { description: 'Social category is missing', recommended: 'Enter the social category from the official records.' },
    INVALID_CADRE:             { description: 'A cadre referenced by the record is not configured for the exercise', recommended: 'Configure the cadre in Step 2 or correct the record.' },
    CATEGORY_MISMATCH:         { description: 'An employee was processed under a rank/category other than the one on the FSL', recommended: 'Allocation must run independently per rank. Re-run the allocation.' },
    EMPLOYEE_NOT_ALLOTTED:     { description: 'An eligible FSL employee has no allotment in the FAL', recommended: 'Confirm the shortfall position. The FAL cannot be published while an employee is unallotted.' },
    INVALID_OPTION:            { description: 'A preference names a cadre not configured for that rank/category or is repeated', recommended: 'Have the employee submit a corrected option through the audited correction process.' },
    INVALID_PREFERENTIAL_CLAIM:{ description: 'A preferential claim is unverified or below the prescribed threshold', recommended: 'Attach the supporting document and complete verification before the FSL is finalized.' },
    SC_ST_SHORTFALL:           { description: 'SC/ST representation is below the prescribed proportion and cannot be corrected', recommended: 'Review whether a valid substitution exists. The shortfall is carried as an exception and is not forced.' },
    EMPLOYEE_ALLOTTED_TWICE:   { description: 'An employee appears more than once in the FAL', recommended: 'Re-run the allocation. A single employee may hold only one allotment.' },
    ALLOCATION_OUTSIDE_EXERCISE:{ description: 'An allotment references a cadre outside the exercise cadre set', recommended: 'Correct the cadre configuration and re-run the allocation.' },
    INVALID_COMPULSORY:        { description: 'A compulsory allotment has no documented shortfall or exceeds working strength', recommended: 'Report the exception. The run has failed and no automatic correction is applied.' },
    INVALID_NO_OPTION:         { description: 'An employee with no option was not processed in the final group or was given a fabricated preference', recommended: 'Re-run the allocation. No-option employees must be processed last with NO_OPTION_ALLOTMENT.' }
};

// --- Statement of legal basis, surfaced in the UI --------------------------
const PO_GO_REFERENCE = {
    order: 'G.O.Ms.No.129',
    department: 'G.A.(SPF & MC) Department',
    date: '17-07-2026',
    scope: 'District and Contiguous District Cadre',
    disclaimer: 'Implemented with reference to G.O.Ms.No.129. Final procedural/legal validation ' +
        'is subject to the competent authority/DLC.'
};

/** Reproducibility stamp: version plus a deterministic fingerprint of the
 *  behaviour-defining code. Two engines with different maths can never share a
 *  hash, and the value is identical in Node and in the browser. */
function poEngineHash() {
    const parts = [
        PO_ENGINE_VERSION,
        String(PO_PREF_CLAIMS), String(PO_SEG_GROUPS), String(PO_SEG_BASIS),
        String(PO_COMPULSORY_POLICIES), String(PO_ROUNDING_POLICIES),
        String(PO_ALLOC_REASONS), String(PO_STAGES),
        String(poBuildContext), String(validateWorkingStrength), String(validateDSL),
        String(validateFSL), String(analyseFSL), String(runAllocation),
        String(reviewSegProportion), String(validateFAL),
        String(poPreferredClaim), String(poApplicableCadres), String(poApplyRounding)
    ];
    let h = 0x811c9dc5;
    const s = parts.join('\u0001');
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return 'fnv1a-' + h.toString(16).padStart(8, '0');
}


// ============================================================================
// Helpers
// ============================================================================

function poBlank() { return v => v === undefined || v === null || String(v).trim() === ''; }

function poKey(v) {
    return String(v === undefined || v === null ? '' : v)
        .trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function poInt(v) {
    if (v === undefined || v === null || String(v).trim() === '') return null;
    const n = parseInt(String(v).replace(/[^0-9-]/g, ''), 10);
    return Number.isFinite(n) ? n : null;
}

function poNum(v) {
    if (v === undefined || v === null || String(v).trim() === '') return null;
    const n = Number(String(v).replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) ? n : null;
}

function poIssue(list, severity, code, message, extra) {
    list.push(Object.assign({ severity: severity, code: code, message: message }, extra || {}));
}

function poIndexBy(arr, key) {
    const m = {};
    (arr || []).forEach(x => { if (x && x[key] != null) m[x[key]] = x; });
    return m;
}

function poOrderBy(arr, m) { return m || 0; }


/** Resolve a claim object regardless of whether the record uses
 *  `{ claims: {...} }` or flat `claim_*` keys. Returns null when absent. */
function poClaim(rec, claimId) {
    if (!rec) return null;
    if (rec.claims && typeof rec.claims === 'object') return rec.claims[claimId] || null;
    const flat = rec['claim_' + claimId];
    if (flat && typeof flat === 'object') return flat;
    if (flat === true || flat === 'Yes' || flat === 'yes') return { claimed: true };
    return null;
}

/** A claim is preferential only when claimed AND verified. */
function poClaimVerified(rec, claimId) {
    const c = poClaim(rec, claimId);
    if (!c) return false;
    if (c.claimed === false || c.claimed === undefined || c.claimed === null) return false;
    if (String(c.claimed).toLowerCase() === 'false' || String(c.claimed).toLowerCase() === 'no') return false;
    return String(c.verification || '').toUpperCase() === 'VERIFIED';
}

/**
 * Highest-priority VERIFIED preferential claim for a record.
 * Returns { id, label, priority, detail } or null.
 */
function poPreferredClaim(rec) {
    let best = null;
    PO_PREF_CLAIMS.forEach(def => {
        if (!poClaimVerified(rec, def.id)) return;
        const c = poClaim(rec, def.id);
        if (def.minPercent != null) {
            const pct = poNum(c.disability_percent);
            if (pct === null || pct < def.minPercent) return;
        }
        if (!best || def.priority < best.priority) {
            best = { id: def.id, label: def.label, priority: def.priority };
        }
    });
    return best;
}

/** Employee comparator: FSL seniority first, employee_id as total tie-breaker. */
function poSeniorityCompare(a, b) {
    const sa = poInt(a.seniority_no);
    const sb = poInt(b.seniority_no);
    const va = sa === null ? Number.MAX_SAFE_INTEGER : sa;
    const vb = sb === null ? Number.MAX_SAFE_INTEGER : sb;
    if (va !== vb) return va - vb;
    return String(a.employee_id || '').localeCompare(String(b.employee_id || ''));
}

/** Most-junior-first ordering. Records without an official seniority sort last. */
function poJuniorFirst(a, b) {
    const sa = poInt(a.seniority_no);
    const sb = poInt(b.seniority_no);
    const va = sa === null ? Number.MAX_SAFE_INTEGER : sa;
    const vb = sb === null ? Number.MAX_SAFE_INTEGER : sb;
    if (va !== vb) return vb - va;
    return String(a.employee_id || '').localeCompare(String(b.employee_id || ''));
}


/** Options for a record, restricted to cadres configured for its category. */
function poApplicableCadres(categoryId, strengths, cadres) {
    const order = {};
    (cadres || []).forEach((c, i) => { order[c.id] = i; });
    return (strengths || [])
        .filter(s => s.category_id === categoryId && s.status !== 'INACTIVE')
        .filter(s => poInt(s.fws) > 0)
        .map(s => s.cadre_id)
        .filter((cid, i, arr) => arr.indexOf(cid) === i)
        .sort((a, b) => poOrderBy(order, a) - poOrderBy(order, b) || String(a).localeCompare(String(b)));
}


/** Sum of FWS for a category across its configured cadres. */
function poCategoryFws(categoryId, strengths) {
    return (strengths || [])
        .filter(s => s.category_id === categoryId && s.status !== 'INACTIVE')
        .reduce((n, s) => n + (poInt(s.fws) || 0), 0);
}

function poApprovedFor(categoryId, approved) {
    const row = (approved || []).find(a => a.category_id === categoryId);
    return row ? poInt(row.approved_working_strength) : null;
}


/** Build the shared context object used by the validators and the engine. */
function poBuildContext(input) {
    const src = input || {};
    const categories = (src.categories || []).filter(c => c.status !== 'INACTIVE');
    return {
        exercise_id: src.exercise_id || null,
        categories: categories,
        categoryById: poIndexBy(categories, 'id'),
        categoryOrder: categories.map(c => c.id),
        cadres: (src.cadres || []).filter(c => c.status !== 'INACTIVE'),
        cadreById: poIndexBy(src.cadres || [], 'id'),
        cadreOrder: (src.cadres || []).map(c => c.id),
        strengths: src.strengths || [],
        approved: src.approved || [],
        segGroups: (src.segGroups || PO_SEG_GROUPS).map(g => ({
            id: g.id, label: g.label,
            percent: src.segPercents && src.segPercents[g.id] !== undefined ? src.segPercents[g.id] : g.percent
        }))
    };
}


// ============================================================================
// 1. WORKING STRENGTH VALIDATION
//    Total FWS of all applicable local cadres must reconcile with the approved
//    working strength applicable to the exercise. FWS is never silently changed.
// ============================================================================

function validateWorkingStrength(input) {
    const ctx = input.ctx || poBuildContext(input);
    const errors = [];
    const warnings = [];
    const rows = [];

    ctx.categories.forEach(cat => {
        const catStrengths = ctx.strengths.filter(s => s.category_id === cat.id && s.status !== 'INACTIVE');
        const sumFws = catStrengths.reduce((n, s) => n + (poInt(s.fws) || 0), 0);
        const approved = poApprovedFor(cat.id, ctx.approved);

        catStrengths.forEach(s => {
            const fws = poInt(s.fws);
            const cStrength = poInt(s.cadre_strength);
            if (fws === null || fws < 0) {
                poIssue(errors, 'ERROR', 'FWS_INVALID', 'Final Working Strength must be a non-negative number for ' + cat.name + ' / ' + (ctx.cadreById[s.cadre_id] || {}).name,
                    { category_id: cat.id, cadre_id: s.cadre_id, value: s.fws });
            }
            if (cStrength !== null && fws !== null && fws > cStrength) {
                poIssue(errors, 'ERROR', 'FWS_EXCEEDS_CADRE_STRENGTH',
                    'FWS (' + fws + ') exceeds cadre strength (' + cStrength + ') for ' + cat.name + ' / ' + (ctx.cadreById[s.cadre_id] || {}).name,
                    { category_id: cat.id, cadre_id: s.cadre_id });
            }
            if (cStrength !== null && cStrength > 0 && fws === 0) {
                poIssue(warnings, 'WARNING', 'FWS_ZERO_WITH_STRENGTH',
                    'Cadre strength is ' + cStrength + ' but FWS is 0 for ' + cat.name + ' / ' + (ctx.cadreById[s.cadre_id] || {}).name,
                    { category_id: cat.id, cadre_id: s.cadre_id });
            }
        });

        if (catStrengths.length === 0) {
            poIssue(errors, 'ERROR', 'NO_CADRE_CONFIGURED', 'No local cadre is configured for category ' + cat.name, { category_id: cat.id });
        }
        if (sumFws === 0) {
            poIssue(warnings, 'WARNING', 'FWS_NOT_CONFIGURED', 'Total FWS for ' + cat.name + ' is 0', { category_id: cat.id });
        }
        if (approved === null) {
            poIssue(errors, 'ERROR', 'APPROVED_STRENGTH_MISSING', 'Approved working strength not entered for ' + cat.name, { category_id: cat.id });
        } else if (approved !== sumFws) {
            poIssue(errors, 'ERROR', 'FWS_RECONCILIATION',
                'Allocation cannot proceed: total FWS (' + sumFws + ') does not reconcile with approved working strength (' + approved + ') for ' + cat.name,
                { category_id: cat.id, sum_fws: sumFws, approved: approved });
        }

        rows.push({
            category_id: cat.id,
            category: cat.name,
            approved_working_strength: approved,
            total_fws: sumFws,
            reconciled: approved !== null && approved === sumFws,
            cadres: catStrengths.map(s => ({
                cadre_id: s.cadre_id,
                cadre_name: (ctx.cadreById[s.cadre_id] || {}).name || s.cadre_id,
                cadre_strength: poInt(s.cadre_strength) || 0,
                fws: poInt(s.fws) || 0
            }))
        });
    });

    return {
        valid: errors.length === 0,
        errors: errors,
        warnings: warnings,
        rows: rows
    };
}


// ============================================================================
// 2. DSL VALIDATION
// ============================================================================

function validateDSL(records, input) {
    const cfg = input || {};
    const ctx = cfg.ctx || poBuildContext(cfg);
    const errors = [];
    const warnings = [];
    const recs = records || [];

    const senByCategory = {};   // category -> {seniority: [ {v, rec} ]}
    const cfmsByCategory = {};  // category -> {cfms: [...]}
    const cfmsByRanks = {};     // cfms -> Set(category_id)

    recs.forEach(r => {
        const catId = r.category_id;
        const cat = ctx.categoryById[catId];

        // -- identity -------------------------------------------------------
        if (poBlank()(r.name)) {
            poIssue(errors, 'ERROR', 'MISSING_NAME', 'Employee name is missing (row ' + (r._row || '-') + ')', { employee_id: r.employee_id });
        }

        // -- category / rank ------------------------------------------------
        if (!catId) {
            poIssue(errors, 'ERROR', 'MISSING_CATEGORY', 'Rank/category is missing for ' + (r.name || 'unnamed record'), { employee_id: r.employee_id });
        } else if (!cat) {
            poIssue(errors, 'ERROR', 'INVALID_CATEGORY', 'Rank/category "' + catId + '" is not a configured category for ' + (r.name || 'record'), { employee_id: r.employee_id, field: 'category_id' });
        }

        // -- seniority: never manufactured ----------------------------------
        const sen = poInt(r.seniority_no);
        if (sen === null || sen < 0) {
            poIssue(errors, 'ERROR', 'MISSING_SENIORITY',
                'Seniority number is missing for ' + (r.name || 'record') + '. Seniority is official data and is never generated by the system.',
                { employee_id: r.employee_id, field: 'seniority_no' });
        } else {
            (senByCategory[catId] = senByCategory[catId] || { seniority: [], cfms: {} });
            senByCategory[catId].seniority.push({ v: sen, rec: r });
        }

        // -- CFMS -----------------------------------------------------------
        if (poBlank()(r.cfms_id)) {
            poIssue(warnings, 'WARNING', 'MISSING_CFMS', 'CFMS ID missing for ' + (r.name || 'record'), { employee_id: r.employee_id, field: 'cfms_id' });
        } else {
            const c = poKey(r.cfms_id);
            (cfmsByCategory[catId] = cfmsByCategory[catId] || { seniority: [], cfms: {} });
            (cfmsByCategory[catId].cfms[c] = cfmsByCategory[catId].cfms[c] || []).push(r);
            (cfmsByRanks[c] = cfmsByRanks[c] || []).push({ catId: catId, rec: r });
        }

        // -- date of joining IN THE CATEGORY --------------------------------
        if (poBlank()(r.date_of_joining_category)) {
            poIssue(errors, 'ERROR', 'MISSING_DOJ_CATEGORY',
                'Date of joining in the category is missing for ' + (r.name || 'record') + '. Appointment / promotion / present-office joining dates are not substituted.',
                { employee_id: r.employee_id, field: 'date_of_joining_category' });
        }
        if (!poBlank()(r.date_of_birth) && !poBlank()(r.date_of_joining_category)) {
            if (String(r.date_of_joining_category) < String(r.date_of_birth)) {
                poIssue(warnings, 'WARNING', 'DOJ_BEFORE_DOB', 'Date of joining in the category precedes date of birth for ' + (r.name || 'record'), { employee_id: r.employee_id });
            }
        }

        // -- social category ------------------------------------------------
        if (poBlank()(r.social_category)) {
            poIssue(errors, 'ERROR', 'MISSING_SOCIAL_CATEGORY', 'Social category is missing for ' + (r.name || 'record'), { employee_id: r.employee_id, field: 'social_category' });
        }
        if (!poBlank()(r.sc_group)) {
            const known = PO_SEG_GROUPS.some(g => g.id === r.sc_group);
            if (!known) {
                poIssue(errors, 'ERROR', 'INVALID_SC_GROUP', 'Reserved group "' + r.sc_group + '" is not one of SC Group-I / II / III / ST for ' + (r.name || 'record'), { employee_id: r.employee_id, field: 'sc_group' });
            } else {
                const sc = poKey(r.social_category);
                if (sc && sc.indexOf('sc') !== 0 && sc.indexOf('st') !== 0) {
                    poIssue(errors, 'ERROR', 'SC_GROUP_MISMATCH',
                        'Reserved group ' + r.sc_group + ' contradicts social category ' + r.social_category + ' for ' + (r.name || 'record'),
                        { employee_id: r.employee_id, field: 'sc_group' });
                }
            }
        }

        // -- cadres ---------------------------------------------------------
        if (!poBlank()(r.erstwhile_cadre_id) && !ctx.cadreById[r.erstwhile_cadre_id]) {
            poIssue(errors, 'ERROR', 'INVALID_ERSTWHILE_CADRE', 'Erstwhile cadre "' + r.erstwhile_cadre_id + '" is not configured for the exercise (' + (r.name || 'record') + ')', { employee_id: r.employee_id, field: 'erstwhile_cadre_id' });
        }
        if (!poBlank()(r.present_local_cadre_id)) {
            if (!ctx.cadreById[r.present_local_cadre_id]) {
                poIssue(errors, 'ERROR', 'INVALID_PRESENT_CADRE', 'Present local cadre "' + r.present_local_cadre_id + '" is not configured for the exercise (' + (r.name || 'record') + ')', { employee_id: r.employee_id, field: 'present_local_cadre_id' });
            }
        } else {
            poIssue(warnings, 'WARNING', 'MISSING_PRESENT_CADRE', 'Present local cadre not stated for ' + (r.name || 'record'), { employee_id: r.employee_id, field: 'present_local_cadre_id' });
        }

        // employee expected on a cadre that this category does not use
        if (cat && !poBlank()(r.erstwhile_cadre_id) && ctx.cadreById[r.erstwhile_cadre_id]) {
            const applicable = poApplicableCadres(cat.id, ctx.strengths, ctx.cadres);
            if (applicable.indexOf(r.erstwhile_cadre_id) === -1) {
                poIssue(errors, 'ERROR', 'EMPLOYEE_MISSING_FROM_CADRE',
                    (r.name || 'record') + ' is borne on ' + ctx.cadreById[r.erstwhile_cadre_id].name + ' which is not configured for category ' + cat.name,
                    { employee_id: r.employee_id, field: 'erstwhile_cadre_id' });
            }
        }

        // -- service status --------------------------------------------------
        if (!poBlank()(r.service_status) && PO_SERVICE_STATUS_IDS.indexOf(r.service_status) === -1) {
            poIssue(warnings, 'WARNING', 'INVALID_SERVICE_STATUS', 'Service status "' + r.service_status + '" is not a recognised status (' + (r.name || 'record') + ')', { employee_id: r.employee_id, field: 'service_status' });
        }

        // -- preferential claims --------------------------------------------
        PO_PREF_CLAIMS.forEach(def => {
            const c = poClaim(r, def.id);
            if (!c) return;
            const claimed = !(c.claimed === false || c.claimed === undefined || c.claimed === null ||
                             String(c.claimed).toLowerCase() === 'false' || String(c.claimed).toLowerCase() === 'no');
            if (!claimed) return;

            if (def.minPercent != null) {
                const pct = poNum(c.disability_percent);
                if (pct === null) {
                    poIssue(errors, 'ERROR', 'CLAIM_PERCENT_MISSING',
                        'PwBD claim for ' + (r.name || 'record') + ' has no certified disability percentage; 70% or above is required',
                        { employee_id: r.employee_id, field: 'claim_pwbd' });
                } else if (pct < def.minPercent) {
                    poIssue(errors, 'ERROR', 'CLAIM_PERCENT_BELOW_MIN',
                        'PwBD claim for ' + (r.name || 'record') + ' is certified at ' + pct + '%, below the 70% threshold',
                        { employee_id: r.employee_id, field: 'claim_pwbd', value: pct });
                }
            }
            if (def.requiresDoc) {
                const noDoc = c.doc_present === false || String(c.doc_present || '').toLowerCase() === 'no';
                if (noDoc) {
                    poIssue(warnings, 'WARNING', 'CLAIM_DOCUMENT_MISSING',
                        'Supporting document not stated for "' + def.label + '" claim (' + (r.name || 'record') + ')',
                        { employee_id: r.employee_id, field: 'claim_' + def.id });
                }
                if (poBlank()(c.cert_no)) {
                    poIssue(warnings, 'WARNING', 'CLAIM_CERT_NO_MISSING',
                        'Certification number not stated for "' + def.label + '" claim (' + (r.name || 'record') + ')',
                        { employee_id: r.employee_id, field: 'claim_' + def.id });
                }
            }
            const v = String(c.verification || 'PENDING').toUpperCase();
            if (v !== 'VERIFIED' && v !== 'REJECTED') {
                poIssue(warnings, 'WARNING', 'CLAIM_NOT_VERIFIED',
                    'Claim "' + def.label + '" for ' + (r.name || 'record') + ' is ' + v + '. It will NOT be treated as preferential until verified.',
                    { employee_id: r.employee_id, field: 'claim_' + def.id });
            }
            if (v === 'REJECTED') {
                poIssue(warnings, 'WARNING', 'CLAIM_REJECTED',
                    'Claim "' + def.label + '" for ' + (r.name || 'record') + ' was rejected and carries no preference',
                    { employee_id: r.employee_id, field: 'claim_' + def.id });
            }
        });

        // -- soft checks -----------------------------------------------------
        if (poBlank()(r.mobile)) {
            poIssue(warnings, 'WARNING', 'MISSING_MOBILE', 'Mobile number missing for ' + (r.name || 'record'), { employee_id: r.employee_id, field: 'mobile' });
        }
        if (poBlank()(r.present_working_place)) {
            poIssue(warnings, 'WARNING', 'MISSING_WORKING_PLACE', 'Present working place missing for ' + (r.name || 'record'), { employee_id: r.employee_id, field: 'present_working_place' });
        }
        if (!poBlank()(r.gender) && ['Male', 'Female', 'Other'].indexOf(r.gender) === -1) {
            poIssue(warnings, 'WARNING', 'INVALID_GENDER', 'Gender "' + r.gender + '" is not normalised (' + (r.name || 'record') + ')', { employee_id: r.employee_id, field: 'gender' });
        }
    });

    // -- duplicate seniority within a category ------------------------------
    Object.keys(senByCategory).forEach(catId => {
        const byVal = {};
        senByCategory[catId].seniority.forEach(e => {
            (byVal[e.v] = byVal[e.v] || []).push(e.rec);
        });
        Object.keys(byVal).forEach(v => {
            if (byVal[v].length > 1) {
                poIssue(errors, 'ERROR', 'DUPLICATE_SENIORITY',
                    'Seniority number ' + v + ' appears ' + byVal[v].length + ' times in category ' + catId + ': ' + byVal[v].map(r => r.name).join(', '),
                    { category_id: catId, value: v, employees: byVal[v].map(r => r.name) });
            }
        });
    });

    // -- duplicate CFMS within a category ------------------------------------
    Object.keys(cfmsByCategory).forEach(catId => {
        const m = cfmsByCategory[catId];
        Object.keys(m.cfms).forEach(c => {
            if (m.cfms[c].length > 1) {
                poIssue(errors, 'ERROR', 'DUPLICATE_CFMS',
                    'CFMS ID ' + m.cfms[c][0].cfms_id + ' appears ' + m.cfms[c].length + ' times in category ' + catId,
                    { category_id: catId, employees: m.cfms[c].map(r => r.name) });
            }
        });
    });

    // -- employee duplicated across ranks ------------------------------------
    Object.keys(cfmsByRanks).forEach(c => {
        const rowsIn = cfmsByRanks[c];
        const distinctCats = {};
        rowsIn.forEach(x => { distinctCats[x.catId] = true; });
        if (Object.keys(distinctCats).length > 1) {
            poIssue(errors, 'ERROR', 'DUPLICATE_ACROSS_RANKS',
                'CFMS ID ' + rowsIn[0].rec.cfms_id + ' appears under more than one rank/category: ' + Object.keys(distinctCats).join(', '),
                { employees: rowsIn.map(x => x.rec.name) });
        }
    });

    const byCategory = {};
    recs.forEach(r => {
        byCategory[r.category_id] = (byCategory[r.category_id] || 0) + 1;
    });

    return {
        valid: errors.length === 0,
        errors: errors,
        warnings: warnings,
        stats: {
            total: recs.length,
            by_category: byCategory,
            error_count: errors.length,
            warning_count: warnings.length
        }
    };
}


// ============================================================================
// 3. FSL VALIDATION
//    The FSL is the authoritative personnel dataset. It may not invent or
//    reconstruct seniority from row order.
// ============================================================================

function validateFSL(fsl, input) {
    const cfg = input || {};
    const base = validateDSL(fsl, cfg);
    const errors = base.errors.slice();
    const warnings = base.warnings.slice();

    const recs = fsl || [];
    const dsl = cfg.dsl || [];
    const dslById = poIndexBy(dsl, 'employee_id');
    const seen = {};

    recs.forEach(r => {
        if (!r.fsl_version) {
            poIssue(errors, 'ERROR', 'FSL_VERSION_MISSING', 'FSL record ' + (r.name || r.employee_id) + ' carries no FSL version stamp', { employee_id: r.employee_id });
        }
        if (seen[r.employee_id]) {
            poIssue(errors, 'ERROR', 'FSL_DUPLICATE_EMPLOYEE', 'Employee ' + (r.name || r.employee_id) + ' appears more than once in the FSL', { employee_id: r.employee_id });
        }
        seen[r.employee_id] = true;
    });

    // An employee dropped between DSL and FSL must be explainable, not silent.
    recs.forEach(r => {
        if (dsl.length && !dslById[r.employee_id]) {
            poIssue(warnings, 'WARNING', 'FSL_NOT_IN_DSL', 'FSL contains ' + (r.name || r.employee_id) + ' who is not in the DSL', { employee_id: r.employee_id });
        }
    });
    dsl.forEach(r => {
        if (recs.length && !seen[r.employee_id]) {
            poIssue(warnings, 'WARNING', 'DSL_DROPPED_FROM_FSL', (r.name || r.employee_id) + ' is in the DSL but not in the FSL', { employee_id: r.employee_id });
        }
    });

    return {
        valid: errors.length === 0,
        errors: errors,
        warnings: warnings,
        stats: Object.assign({}, base.stats, { dropped_from_fsl: dsl.filter(r => !seen[r.employee_id]).length })
    };
}


// ============================================================================
// 4. FSL ANALYSIS DASHBOARD  (para 9 metrics A..N)
// ============================================================================

function analyseFSL(fsl, input) {
    const cfg = input || {};
    const ctx = cfg.ctx || poBuildContext(cfg);
    const options = cfg.options || {};
    const recs = fsl || [];

    const tally = (list, keyFn) => {
        const m = {};
        list.forEach(r => {
            const k = keyFn(r);
            const key = (k === undefined || k === null || String(k).trim() === '') ? '(not stated)' : String(k);
            m[key] = (m[key] || 0) + 1;
        });
        return Object.keys(m).map(k => ({ key: k, count: m[k] })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
    };

    // A. cadre-wise (present local cadre)
    const A_cadreWise = tally(recs, r => (ctx.cadreById[r.present_local_cadre_id] || {}).name);
    // B. rank-wise
    const B_rankWise = tally(recs, r => (ctx.categoryById[r.category_id] || {}).name || r.rank_code);
    // C. erstwhile cadre distribution
    const C_erstwhileCadre = tally(recs, r => (ctx.cadreById[r.erstwhile_cadre_id] || {}).name);
    // D. present working location
    const D_workingLocation = tally(recs, r => r.present_working_place);

    // E. preferential-category counts (claimed vs verified)
    const E_preferential = PO_PREF_CLAIMS.map(def => {
        const claimed = recs.filter(r => {
            const c = poClaim(r, def.id);
            return c && !(c.claimed === false || String(c.claimed).toLowerCase() === 'false' || String(c.claimed).toLowerCase() === 'no');
        }).length;
        const verified = recs.filter(r => poClaimVerified(r, def.id) &&
            (def.minPercent == null || (poNum((poClaim(r, def.id) || {}).disability_percent) || 0) >= def.minPercent)).length;
        return { id: def.id, label: def.label, priority: def.priority, claimed: claimed, verified: verified };
    });

    // F..I reserved group counts (verified membership drives reservation)
    const groupCount = id => recs.filter(r => r.sc_group === id).length;
    const reserved = {
        SC_1: groupCount('SC_1'),
        SC_2: groupCount('SC_2'),
        SC_3: groupCount('SC_3'),
        ST: groupCount('ST')
    };

    // J. gender
    const J_gender = tally(recs, r => r.gender);

    // K. deputation / other status
    const K_deputation = {
        total_on_deputation: recs.filter(r => r.service_status === 'DEPUTATION').length,
        by_status: tally(recs, r => {
            const hit = PO_SERVICE_STATUS.find(s => s.id === r.service_status);
            return hit ? hit.label : (r.service_status || '(not stated)');
        })
    };

    // L / M. option coverage
    const eligible = recs.filter(r => !ctx.categoryById[r.category_id] || ctx.categoryById[r.category_id].status !== 'INACTIVE');
    const withOpt = eligible.filter(r => {
        const o = options[r.employee_id];
        return o && o.submitted && (o.pref1 || o.pref2 || o.pref3);
    });
    const L_noOptions = eligible.filter(r => {
        const o = options[r.employee_id];
        return !(o && o.submitted && (o.pref1 || o.pref2 || o.pref3));
    }).map(r => ({ employee_id: r.employee_id, name: r.name, seniority_no: r.seniority_no }));
    const M_withOptions = withOpt.length;

    // N. FWS vs employee count vs allocable  (these are NOT interchangeable)
    const N_strength = ctx.categories.map(cat => {
        const catRecs = recs.filter(r => r.category_id === cat.id);
        const fwsTotal = poCategoryFws(cat.id, ctx.strengths);
        const currentWorking = catRecs.filter(r => ctx.cadreById[r.present_local_cadre_id] &&
            poApplicableCadres(cat.id, ctx.strengths, ctx.cadres).indexOf(r.present_local_cadre_id) !== -1).length;
        return {
            category_id: cat.id,
            category: cat.name,
            fws_total: fwsTotal,
            current_working_strength: currentWorking,
            fsl_employee_count: catRecs.length,
            allocable_strength: Math.max(0, fwsTotal - currentWorking),
            approved_working_strength: poApprovedFor(cat.id, ctx.approved)
        };
    });

    return {
        total: recs.length,
        A_cadreWise: A_cadreWise,
        B_rankWise: B_rankWise,
        C_erstwhileCadre: C_erstwhileCadre,
        D_workingLocation: D_workingLocation,
        E_preferential: E_preferential,
        F_sc_group_1: reserved.SC_1,
        G_sc_group_2: reserved.SC_2,
        H_sc_group_3: reserved.SC_3,
        I_st: reserved.ST,
        J_gender: J_gender,
        K_deputation: K_deputation,
        L_noOptions: L_noOptions,
        L_noOptionCount: L_noOptions.length,
        M_withOptions: M_withOptions,
        N_strength: N_strength
    };
}


// ============================================================================
// 5. ALLOCATION ENGINE
//    Deterministic. No over-allocation, ever.
// ============================================================================

function poRunId(ts, exerciseId) {
    return 'RUN-' + String(exerciseId || 'EX') + '-' + (ts || 0);
}

function runAllocation(input) {
    const cfg = input || {};
    const ctx = cfg.ctx || poBuildContext(cfg);
    const fsl = (cfg.fsl || []).slice();
    const options = cfg.options || {};
    const mode = cfg.mode === 'CONFIRMED' ? 'CONFIRMED' : 'SIMULATION';
    const runId = cfg.run_id || poRunId(cfg.started_at || 0, ctx.exercise_id);
    const doScst = cfg.scst_adjustment !== false;

    // --- frozen policy snapshot (PART 10/11/14) -----------------------------
    const compulsoryPolicy = PO_COMPULSORY_POLICY_IDS.indexOf(cfg.compulsory_allocation_policy) !== -1
        ? cfg.compulsory_allocation_policy : PO_DEFAULT_COMPULSORY_POLICY;
    const preferExisting = cfg.prefer_existing_on_compulsory === true;
    const roundingPolicy = PO_ROUNDING_POLICY_IDS.indexOf(cfg.rounding_policy) !== -1
        ? cfg.rounding_policy : PO_DEFAULT_ROUNDING_POLICY;
    // The GO basis for SC/ST proportions is working strength. There is no
    // ALLOCATED-vs-FWS user choice (PART 14).
    const reservedBasis = PO_SEG_BASIS;

    const exceptions = [];
    const allocations = [];
    const unallocated = [];
    const vacancy = {};      // 'catId|cadreId' -> remaining posts
    const allotted = {};     // 'catId|cadreId' -> allocated count

    function key(catId, cadreId) { return catId + '|' + cadreId; }
    function getVac(catId, cadreId) { return vacancy[key(catId, cadreId)] || 0; }

    // -- vacancy ledger, seeded from OFFICIAL FWS only ----------------------
    ctx.strengths.forEach(s => {
        if (s.status === 'INACTIVE') return;
        vacancy[key(s.category_id, s.cadre_id)] = poInt(s.fws) || 0;
        allotted[key(s.category_id, s.cadre_id)] = 0;
    });

    let sequence = 0;

    /**
     * Try to give `rec` a post.
     *  - preferences 1 -> 2 -> 3, restricted to cadres configured for the category
     *  - then compulsory / no-option allotment, ONLY where a shortfall exists
     * Never allocates beyond FWS and never invents a cadre.
     */
    function place(rec, opts) {
        const catId = rec.category_id;
        const applicable = poApplicableCadres(catId, ctx.strengths, ctx.cadres);
        const prefs = [rec._pref1, rec._pref2, rec._pref3].filter(Boolean);
        const considered = [];

        for (let i = 0; i < prefs.length; i++) {
            const cid = prefs[i];
            considered.push(cid);
            if (applicable.indexOf(cid) === -1) continue;
            if (getVac(catId, cid) <= 0) continue;

            const prefRank = i + 1;
            const reason = opts.preferential
                ? 'PREFERENTIAL_CATEGORY'
                : 'SENIORITY_' + ['FIRST', 'SECOND', 'THIRD'][prefRank - 1] + '_PREFERENCE';
            commit(rec, cid, reason, {
                preference_selected: cid,
                preference_rank: prefRank,
                preference_considered: considered.slice(),
                reason_detail: opts.preferential
                    ? 'Preferential category #' + rec._prefClaim.priority + ' (' + rec._prefClaim.label + '); allotted to preference ' + prefRank
                    : 'FSL seniority ' + rec.seniority_no + '; allotted to preference ' + prefRank
            });
            return true;
        }

        // Shortfall test: is there any post left anywhere for this category?
        const totalVac = applicable.reduce((n, cid) => n + getVac(catId, cid), 0);
        if (totalVac > 0) {
            // PART 10: the GO permits a compulsory allotment to any available clear
            // post within working strength. WHICH post is chosen by the frozen
            // exercise policy, and the choice is recorded on the allotment.
            let target = null;
            if (compulsoryPolicy === 'EXISTING_CADRE_FIRST' && rec.present_local_cadre_id &&
                applicable.indexOf(rec.present_local_cadre_id) !== -1 &&
                getVac(catId, rec.present_local_cadre_id) > 0) {
                target = rec.present_local_cadre_id;
            } else if (compulsoryPolicy === 'CONFIGURED_CADRE_ORDER') {
                target = applicable.filter(cid => getVac(catId, cid) > 0)[0] || null;
            } else {
                // LARGEST_REMAINING_VACANCY (configured cadre order breaks ties)
                target = applicable.slice().sort((a, b) => (getVac(catId, b) - getVac(catId, a)) ||
                    String(a).localeCompare(String(b)))[0];
            }
            // PART 11: prefer-existing-cadre is a separate DLC policy switch and
            // applies on top of the tie-breaker.
            if (!target || getVac(catId, target) <= 0) {
                if (preferExisting && rec.present_local_cadre_id &&
                    applicable.indexOf(rec.present_local_cadre_id) !== -1 &&
                    getVac(catId, rec.present_local_cadre_id) > 0) {
                    target = rec.present_local_cadre_id;
                }
            }
            if (!target || getVac(catId, target) <= 0) {
                target = applicable.slice().sort((a, b) => (getVac(catId, b) - getVac(catId, a)) ||
                    String(a).localeCompare(String(b)))[0];
            }
            commit(rec, target, opts.noOption ? 'NO_OPTION_ALLOTMENT' : 'COMPULSORY_ALLOTMENT', {
                preference_selected: '',
                preference_rank: 0,
                preference_considered: considered.slice(),
                compulsory_policy: compulsoryPolicy,
                prefer_existing_applied: preferExisting && target === rec.present_local_cadre_id,
                shortfall_before: totalVac,
                reason_detail: (opts.noOption
                    ? 'No option submitted; processed at the end of the run'
                    : 'All stated preferences unavailable') +
                    '. Compulsory allotment under policy ' + compulsoryPolicy +
                    ' to the largest available shortfall (' + getVac(catId, target) + ' post(s) remaining)'
            });
            return true;
        }

        const reason = 'Final Working Strength exhausted for ' + ((ctx.categoryById[catId] || {}).name || catId) +
            (applicable.length === 1 ? ' - ' + ((ctx.cadreById[applicable[0]] || {}).name || applicable[0]) : '');
        exceptions.push({
            code: 'FWS_EXHAUSTED',
            severity: 'BLOCKING',
            employee_id: rec.employee_id,
            employee: rec.name,
            category_id: catId,
            message: 'Allocation cannot proceed: ' + reason
        });
        unallocated.push({
            employee_id: rec.employee_id,
            name: rec.name,
            category_id: catId,
            seniority_no: rec.seniority_no,
            reason: 'FWS_EXHAUSTED',
            message: reason
        });
        return false;
    }

    function commit(rec, cadreId, reason, extra) {
        const catId = rec.category_id;
        const k = key(catId, cadreId);
        const before = getVac(catId, cadreId);
        if (before <= 0) return;                       // absolute guard: never over-allocate
        vacancy[k] = before - 1;
        allotted[k] = (allotted[k] || 0) + 1;
        sequence += 1;
        allocations.push(Object.assign({
            run_id: runId,
            employee_id: rec.employee_id,
            name: rec.name,
            parentage: rec.parentage || '',
            category_id: catId,
            category_name: (ctx.categoryById[catId] || {}).name || catId,
            rank_code: rec.rank_code || '',
            office: rec.office || '',
            designation: rec.designation || '',
            erstwhile_cadre_id: rec.erstwhile_cadre_id || '',
            erstwhile_cadre_name: (ctx.cadreById[rec.erstwhile_cadre_id] || {}).name || '',
            present_local_cadre_id: rec.present_local_cadre_id || '',
            present_local_cadre_name: (ctx.cadreById[rec.present_local_cadre_id] || {}).name || '',
            service_status: rec.service_status || 'PRESENT',
            cadre_id: cadreId,
            cadre_name: (ctx.cadreById[cadreId] || {}).name || cadreId,
            cadre_type: (ctx.cadreById[cadreId] || {}).cadre_type || '',
            allocation_sequence: sequence,
            allocation_reason: reason,
            seniority_no: rec.seniority_no === undefined ? null : rec.seniority_no,
            preferential_status: rec._prefClaim ? 'VERIFIED' : 'NONE',
            preferential_claim_id: rec._prefClaim ? rec._prefClaim.id : '',
            preferential_claim_label: rec._prefClaim ? rec._prefClaim.label : '',
            option_pref1: rec._pref1 || '',
            option_pref2: rec._pref2 || '',
            option_pref3: rec._pref3 || '',
            sc_group: rec.sc_group || '',
            vacancy_before: before,
            vacancy_after: vacancy[k],
            sc_st_adjustment: null,
            allocated_at: cfg.started_at || null,
            engine_version: PO_ENGINE_VERSION,
            fsl_version: rec.fsl_version || null,
            options_version: cfg.options_version || null
        }, extra || {}));
    }

    // -- PHASE 1..6, strictly per category (categories are never mixed) ------
    ctx.categoryOrder.forEach(catId => {
        const catRecs = fsl.filter(r => r.category_id === catId);

        // annotate
        catRecs.forEach(r => {
            r._prefClaim = poPreferredClaim(r);
            const o = options[r.employee_id];
            r._pref1 = (o && o.submitted) ? (o.pref1 || '') : '';
            r._pref2 = (o && o.submitted) ? (o.pref2 || '') : '';
            r._pref3 = (o && o.submitted) ? (o.pref3 || '') : '';
            r._hasOption = !!(r._pref1 || r._pref2 || r._pref3);
        });

        // PHASE 1 - preferential categories, priority order then FSL seniority
        const prefRecs = catRecs.filter(r => r._prefClaim).sort((a, b) =>
            a._prefClaim.priority - b._prefClaim.priority || poSeniorityCompare(a, b));
        prefRecs.forEach(r => place(r, { preferential: true, noOption: false }));

        // PHASE 2..5 - remaining employees by FSL seniority, then compulsory
        const rest = catRecs.filter(r => !r._prefClaim && r._hasOption).sort(poSeniorityCompare);
        rest.forEach(r => place(r, { preferential: false, noOption: false }));

        // PHASE 6 - employees who submitted no option, processed at the end
        const noOpt = catRecs.filter(r => !r._prefClaim && !r._hasOption).sort(poSeniorityCompare);
        noOpt.forEach(r => place(r, { preferential: false, noOption: true }));
    });

    // -- PHASE 7 - SC/ST proportionate review on the WORKING STRENGTH basis ---
    const scstReview = doScst
        ? reviewSegProportion({
            ctx, allocations, fsl,
            basis: reservedBasis,
            roundingPolicy: roundingPolicy,
            compulsoryPolicy: compulsoryPolicy
        })
        : { enabled: false, basis: reservedBasis, groups: [], adjustments: [], shortfalls: [] };

    (scstReview.adjustments || []).forEach(adj => {
        const moved = allocations.find(a => a.employee_id === adj.inserted_employee_id);
        const replaced = allocations.find(a => a.employee_id === adj.replaced_employee_id);
        if (moved) moved.sc_st_adjustment = { group: adj.sc_group, from_cadre: adj.from_cadre, to_cadre: adj.to_cadre, reason: adj.reason, role: 'inserted' };
        if (replaced) replaced.sc_st_adjustment = { group: adj.sc_group, from_cadre: adj.from_cadre, to_cadre: adj.to_cadre, reason: adj.reason, role: 'replaced' };
        adj.inserted_employee_name = moved ? moved.name : adj.inserted_employee_id;
        adj.replaced_employee_name = replaced ? replaced.name : adj.replaced_employee_id;
        adj.inserted_allocation_sequence = moved ? moved.allocation_sequence : null;
        adj.replaced_allocation_sequence = replaced ? replaced.allocation_sequence : null;
    });

    // -- PHASE 8 - final result + ABSOLUTE over-allocation check --------------
    const breach = [];
    ctx.strengths.forEach(s => {
        if (s.status === 'INACTIVE') return;
        const fws = poInt(s.fws) || 0;
        const n = allotted[key(s.category_id, s.cadre_id)] || 0;
        if (n > fws) {
            breach.push({
                code: 'FWS_EXCEEDED',
                severity: 'BLOCKING',
                category_id: s.category_id,
                cadre_id: s.cadre_id,
                cadre_name: (ctx.cadreById[s.cadre_id] || {}).name || s.cadre_id,
                source_data: 'FWS=' + fws + ', allotted=' + n,
                message: 'Over-allocation: ' + (ctx.categoryById[s.category_id] || {}).name + ' / ' +
                    ((ctx.cadreById[s.cadre_id] || {}).name || s.cadre_id) + ' allotted ' + n + ' against FWS ' + fws
            });
        }
    });
    breach.forEach(b => exceptions.push(b));

    const byReason = {};
    allocations.forEach(a => { byReason[a.allocation_reason] = (byReason[a.allocation_reason] || 0) + 1; });

    // PART 17/18: reproducible run record. Everything needed to re-derive this
    // exact output is captured here and frozen.
    const run = {
        run_id: runId,
        exercise_id: ctx.exercise_id,
        mode: mode,
        engine_version: PO_ENGINE_VERSION,
        engine_hash: poEngineHash(),
        fsl_version: cfg.fsl_version || null,
        options_version: cfg.options_version || null,
        fws_version: cfg.fws_version || null,
        preferential_claim_version: cfg.preferential_claim_version || null,
        policy_snapshot: {
            compulsory_allocation_policy: compulsoryPolicy,
            compulsory_allocation_policy_notice: PO_POLICY_NOTICE_COMPULSORY,
            prefer_existing_on_compulsory: preferExisting,
            prefer_existing_is_policy_notice: true,
            scst_basis: reservedBasis,
            scst_rounding_policy: roundingPolicy,
            scst_rounding_policy_notice: PO_POLICY_NOTICE_ROUNDING,
            seg_percents: ctx.segGroups.map(g => ({ id: g.id, percent: g.percent }))
        },
        started_at: cfg.started_at || null,
        finished_at: cfg.finished_at || null,
        user: cfg.user || null,
        input_counts: {
            fsl_employees: fsl.length,
            options_submitted: Object.keys(options).filter(k => options[k] && options[k].submitted).length,
            categories: ctx.categories.length,
            cadres: ctx.cadres.length,
            strength_rows: ctx.strengths.filter(s => s.status !== 'INACTIVE').length,
            total_fws: ctx.strengths.filter(s => s.status !== 'INACTIVE').reduce((n, s) => n + (poInt(s.fws) || 0), 0)
        },
        status: breach.length ? 'FAILED' : 'PASSED',
        total_fsl: fsl.length,
        allocated: allocations.length,
        unallocated: unallocated.length,
        by_reason: byReason,
        scst_adjustments: (scstReview.adjustments || []).length,
        scst_shortfalls: (scstReview.shortfalls || []).length,
        blocking_exceptions: exceptions.filter(e => e.severity === 'BLOCKING').length
    };

    return {
        run: run,
        allocations: allocations,
        unallocated: unallocated,
        exceptions: exceptions,
        scstReview: scstReview
    };
}


/**
 * SC/ST proportionate review.
 *
 * Order of operations (para 11): preferential allocation -> seniority+preference
 * allocation -> SC/ST proportional review -> adjustment for shortfall -> final FAL.
 * Reserved posts are therefore NOT carved out before normal allocation.
 *
 * Adjustment is vacancy-neutral: one reserved-category employee moves into the
 * short cadre and one non-reserved, non-preferential employee of the SAME
 * category moves out. Categories are never mixed and FWS is never breached.
 * Every swap records employee_inserted / employee_replaced / reason.
 */

/**
 * SC/ST proportionate review and adjustment.
 *
 * GO REQUIREMENT
 *   SC Group-I 1%, SC Group-II 6.5%, SC Group-III 7.5%, ST 6%, proportionately
 *   distributed among local cadres BASED ON WORKING STRENGTH, reviewed AFTER
 *   normal allocation. Where there is a shortfall the adjustment is made by
 *   substituting the LAST ALLOTTED GENERAL CATEGORY employee with the relevant
 *   SC/ST employee.
 *
 * SYSTEM IMPLEMENTATION RULE
 *   - "Last allotted" is resolved by the highest `allocation_sequence`, NOT by
 *     seniority. The engine therefore records allocation_sequence on every
 *     allotment (see commit()).
 *   - The rounding convention is `PO_ROUNDING_POLICY_IDS`; it is not stated in
 *     the provisions supplied, so it is surfaced for DLC confirmation.
 *   - Substitutions are vacancy-neutral: total allocation per cadre and per
 *     category never changes, FWS is never breached and category is never mixed.
 *
 * The function returns the review table, every adjustment performed, and every
 * shortfall that could NOT be corrected. Uncorrected shortfalls are carried as
 * SC_ST_SHORTFALL_EXCEPTION and are never forced.
 */
function reviewSegProportion(args) {
    const ctx = args.ctx;
    const allocations = args.allocations;
    const basis = args.basis || PO_SEG_BASIS;
    const roundingPolicy = PO_ROUNDING_POLICY_IDS.indexOf(args.roundingPolicy) !== -1
        ? args.roundingPolicy : PO_DEFAULT_ROUNDING_POLICY;

    const groups = ctx.segGroups;
    const perCategory = {};
    const adjustments = [];
    const shortfalls = [];

    /** FWS for one category+cadre cell (the GO basis). */
    function fwsFor(catId, cadreId) {
        const row = ctx.strengths.find(s => s.category_id === catId && s.cadre_id === cadreId && s.status !== 'INACTIVE');
        return row ? (poInt(row.fws) || 0) : 0;
    }

    ctx.categoryOrder.forEach(catId => {
        const catAllocs = allocations.filter(a => a.category_id === catId);
        const applicable = poApplicableCadres(catId, ctx.strengths, ctx.cadres);
        const catName = (ctx.categoryById[catId] || {}).name || catId;

        // GO basis: requirement is computed from WORKING STRENGTH, per cadre.
        const cells = applicable.map(cid => ({
            cadre_id: cid,
            cadre_name: (ctx.cadreById[cid] || {}).name || cid,
            working_strength: fwsFor(catId, cid),
            allocated: catAllocs.filter(a => a.cadre_id === cid).length
        }));
        const totalWs = cells.reduce((n, c) => n + c.working_strength, 0);

        perCategory[catId] = {
            category_id: catId,
            category_name: catName,
            basis: basis,
            rounding_policy: roundingPolicy,
            total_working_strength: totalWs,
            total_allocated: catAllocs.length,
            cells: cells,
            groups: []
        };

        // Per-group required representation for the category, on the WS basis.
        const required = {};
        groups.forEach(g => {
            required[g.id] = poApplyRounding((totalWs * g.percent) / 100, roundingPolicy);
        });

        perCategory[catId].groups = groups.map(g => {
            const actualTotal = catAllocs.filter(a => a.sc_group === g.id).length;
            return {
                group: g.id,
                sc_group: g.id,
                label: g.label,
                percent: g.percent,
                working_strength: totalWs,
                required: required[g.id],
                required_per_cadre: cells.map(c => ({
                    cadre_id: c.cadre_id,
                    cadre_name: c.cadre_name,
                    working_strength: c.working_strength,
                    required: poApplyRounding((c.working_strength * g.percent) / 100, roundingPolicy)
                })),
                actual: actualTotal,
                actual_per_cadre: cells.map(c => ({
                    cadre_id: c.cadre_id,
                    cadre_name: c.cadre_name,
                    actual: catAllocs.filter(a => a.cadre_id === c.cadre_id && a.sc_group === g.id).length
                })),
                status: actualTotal >= required[g.id] ? 'MET' : 'SHORTFALL',
                shortfall: Math.max(0, required[g.id] - actualTotal),
                excess: Math.max(0, actualTotal - required[g.id])
            };
        });
    });

    // ---------------------------------------------------------------------
    // Adjustment: for each deficit, substitute the LAST ALLOTTED GENERAL
    // CATEGORY employee with the relevant SC/ST employee.
    // ---------------------------------------------------------------------
    ctx.categoryOrder.forEach(catId => {
        const row = perCategory[catId];
        const catName = row.category_name;
        const applicable = row.cells.map(c => c.cadre_id);
        const inCat = () => allocations.filter(a => a.category_id === catId);

        const countFor = (cadreId, groupId) =>
            inCat().filter(a => a.cadre_id === cadreId && a.sc_group === groupId).length;
        const totalFor = (groupId) => inCat().filter(a => a.sc_group === groupId).length;

        // The proportion applies to each local cadre on that cadre's own working
        // strength, so the deficit is evaluated PER CADRE. The category total is
        // respected as a ceiling, so the adjustment never over-represents a group.
        row.groups.forEach(g => {
            applicable.forEach(fixedTarget => {
                const fixedPerCadre = g.required_per_cadre.filter(c => c.cadre_id === fixedTarget)[0];
                let deficit = Math.max(0, (fixedPerCadre ? fixedPerCadre.required : 0) - countFor(fixedTarget, g.group));
                if (deficit <= 0) return;
                const targetName = (ctx.cadreById[fixedTarget] || {}).name || fixedTarget;
                const target = fixedTarget;

                for (let guard = 0; guard < 200 && deficit > 0; guard++) {

                // 1. eligible SC/ST employee NOT currently in the required cadre,
                //    same category, never a preferential-category employee.
                const overOwnShare = cid => {
                    const pc = g.required_per_cadre.filter(c => c.cadre_id === cid)[0];
                    const want = pc ? pc.required : 0;
                    return countFor(cid, g.group) > want;
                };
                const inserted = inCat()
                    .filter(a => a.sc_group === g.group &&
                                 a.cadre_id !== target &&
                                 overOwnShare(a.cadre_id) &&
                                 a.allocation_reason !== 'PREFERENTIAL_CATEGORY' &&
                                 !a.sc_st_adjustment)
                    .sort((a, b) => a.allocation_sequence - b.allocation_sequence)[0];

                // 2. the LAST ALLOTTED GENERAL CATEGORY employee in the affected
                //    cadre: highest allocation_sequence, no reserved group, not
                //    preferential. This is the substitution prescribed by the GO.
                const replaced = inCat()
                    .filter(a => a.cadre_id === target &&
                                 !a.sc_group &&
                                 a.allocation_reason !== 'PREFERENTIAL_CATEGORY' &&
                                 !a.sc_st_adjustment)
                    .sort((a, b) => b.allocation_sequence - a.allocation_sequence)[0];

                // 3. both must exist and be distinct, else the substitution is
                //    not legally/algorithmically available. Do NOT force it.
                if (!inserted || !replaced || inserted.employee_id === replaced.employee_id) {
                    shortfalls.push({
                        code: 'SC_ST_SHORTFALL_EXCEPTION',
                        severity: 'BLOCKING',
                        category_id: catId,
                        category: catName,
                        cadre_id: target,
                        cadre: targetName,
                        group: g.group,
                        sc_group: g.group,
                        group_label: g.label,
                        required: g.required,
                        actual: g.actual,
                        shortfall: deficit,
                        working_strength: row.total_working_strength,
                        // Critical = the category as a whole cannot meet the prescribed
                        // proportion, so no rearrangement can help. Non-critical = the
                        // category total is met but this cadre's share is short.
                        critical: g.actual < g.required,
                        category_required: g.required,
                        category_actual: g.actual,
                        reason: !inserted
                            ? 'No eligible ' + g.label + ' employee of ' + catName + ' is allotted in a cadre that is over its ' +
                              'prescribed share and can therefore be substituted into ' + targetName +
                              '. Shortfall carried as an exception; it is NOT forced.'
                            : 'No eligible GENERAL CATEGORY employee allotted to ' + targetName +
                              ' is available for substitution (every post is either reserved or preferential). ' +
                              'Shortfall carried as an exception; it is NOT forced.'
                    });
                    return;
                }

                // 4. substitute. Vacancy-neutral: the cadre's headcount is
                //    unchanged, category is unchanged, FWS is unchanged.
                const fromCadreId = inserted.cadre_id;
                const fromCadreName = inserted.cadre_name;
                const oldAllocationOfInserted = {
                    cadre_id: inserted.cadre_id, cadre_name: inserted.cadre_name,
                    allocation_sequence: inserted.allocation_sequence, reason: inserted.allocation_reason
                };
                const oldAllocationOfReplaced = {
                    cadre_id: replaced.cadre_id, cadre_name: replaced.cadre_name,
                    allocation_sequence: replaced.allocation_sequence, reason: replaced.allocation_reason
                };

                inserted.cadre_id = target;
                inserted.cadre_name = targetName;
                replaced.cadre_id = fromCadreId;
                replaced.cadre_name = fromCadreName;
                replaced.allocation_reason = 'SC_ST_ADJUSTMENT';

                adjustments.push({
                    category_id: catId,
                    category: catName,
                    sc_group: g.group,
                    sc_group_label: g.label,
                    percent: g.percent,
                    working_strength: row.total_working_strength,
                    required: g.required,
                    cadre_id: target,
                    cadre: targetName,
                    to_cadre: targetName,
                    from_cadre: fromCadreName,
                    inserted_employee_id: inserted.employee_id,
                    inserted_employee: inserted.name,
                    inserted_seniority: inserted.seniority_no,
                    inserted_allocation_sequence: inserted.allocation_sequence,
                    replaced_employee_id: replaced.employee_id,
                    replaced_employee: replaced.name,
                    replaced_seniority: replaced.seniority_no,
                    replaced_allocation_sequence: replaced.allocation_sequence,
                    old_allocation: { inserted_from: oldAllocationOfInserted, replaced_from: oldAllocationOfReplaced },
                    new_allocation: { inserted_to: { cadre_id: target, cadre_name: targetName, allocation_sequence: inserted.allocation_sequence }, replaced_to: { cadre_id: fromCadreId, cadre_name: fromCadreName, allocation_sequence: replaced.allocation_sequence } },
                    reason: 'Deficit of ' + deficit + ' post(s) for ' + g.label + ' (' + g.percent + '% of working strength ' +
                        row.total_working_strength + ' = ' + g.required + '). Substituted the last allotted GENERAL CATEGORY ' +
                        'employee in ' + targetName + ' (allocation sequence ' + replaced.allocation_sequence + ') with ' +
                        inserted.name + ' (allocation sequence ' + inserted.allocation_sequence + ').',
                    vacancy_neutral: true,
                    at: null
                });

                deficit -= 1;
                }

                if (deficit > 0) {
                    const perCadre = g.required_per_cadre.filter(c => c.cadre_id === target)[0];
                    shortfalls.push({
                        code: 'SC_ST_SHORTFALL_EXCEPTION',
                        severity: 'BLOCKING',
                        category_id: catId,
                        category: catName,
                        cadre_id: target,
                        cadre: targetName,
                        group: g.group,
                        sc_group: g.group,
                        group_label: g.label,
                        working_strength: row.total_working_strength,
                        cadre_required: perCadre ? perCadre.required : 0,
                        cadre_actual: countFor(target, g.group),
                        required: g.required,
                        actual: totalFor(g.group),
                        shortfall: deficit,
                        // Critical = the category total cannot meet the prescribed
                        // proportion either, so no rearrangement can help.
                        critical: totalFor(g.group) < g.required,
                        exception_key: catId + '|' + g.group + '|' + target,
                        category_required: g.required,
                        category_actual: totalFor(g.group),
                        reason: 'Deficit of ' + deficit + ' post(s) for ' + g.label + ' in ' + targetName +
                            ' (working strength ' + row.total_working_strength + ', prescribed ' + g.percent + '% = ' +
                            (perCadre ? perCadre.required : 0) + ' for this cadre). No eligible ' + g.label +
                            ' employee is available in a cadre that is over its prescribed share. ' +
                            'Shortfall carried as an exception; it is NOT forced.'
                    });
                }
            });
        });

        // Category-level check: if the prescribed proportion cannot be met across
        // the whole category even after every substitution, record it.
        row.groups.forEach(g => {
            if (totalFor(g.group) >= g.required) return;
            if (shortfalls.some(x => x.category_id === catId && x.group === g.group && x.cadre === null)) return;
            shortfalls.push({
                code: 'SC_ST_SHORTFALL_EXCEPTION',
                severity: 'BLOCKING',
                category_id: catId,
                category: catName,
                cadre_id: null,
                cadre: null,
                group: g.group,
                sc_group: g.group,
                group_label: g.label,
                working_strength: row.total_working_strength,
                required: g.required,
                actual: totalFor(g.group),
                shortfall: Math.max(0, g.required - totalFor(g.group)),
                critical: true,
                exception_key: catId + '|' + g.group + '|CATEGORY',
                category_required: g.required,
                category_actual: totalFor(g.group),
                reason: 'Category-wide shortfall of ' + Math.max(0, g.required - totalFor(g.group)) + ' post(s) for ' +
                    g.label + ' (' + g.percent + '% of working strength ' + row.total_working_strength + ' = ' + g.required +
                    ', actual ' + totalFor(g.group) + '). No valid substitution exists. Carried as an exception; it is NOT forced.'
            });
        });
    });

    // refresh actual figures after adjustment
    ctx.categoryOrder.forEach(catId => {
        const row = perCategory[catId];
        const catAllocs = allocations.filter(a => a.category_id === catId);
        row.groups.forEach(g => {
            const n = catAllocs.filter(a => a.sc_group === g.group).length;
            g.actual_after = n;
            g.status_after = n >= g.required ? 'MET' : 'SHORTFALL';
            g.shortfall_after = Math.max(0, g.required - n);
        });
        row.cells.forEach(c => {
            c.allocated_after = catAllocs.filter(a => a.cadre_id === c.cadre_id).length;
            c.fws_respected = c.allocated_after <= c.working_strength;
        });
    });

    return {
        enabled: true,
        basis: basis,
        critical_shortfalls: shortfalls.filter(s => s.critical).length,
        reported_shortfalls: shortfalls.filter(s => !s.critical).length,
        rounding_policy: roundingPolicy,
        rounding_policy_notice: PO_POLICY_NOTICE_ROUNDING,
        perCategory: perCategory,
        adjustments: adjustments,
        shortfalls: shortfalls
    };
}

function target2label(cadres, ctx) {
    return (cadres || []).map(c => (ctx.cadreById[c] || {}).name || c).join(', ');
}

// ============================================================================
// 6. FAL VALIDATION  (GREEN = pass, RED = blocking, AMBER = warning)
// ============================================================================

function validateFAL(result, input) {
    const cfg = input || {};
    const ctx = cfg.ctx || poBuildContext(input);
    const allocations = (result && result.allocations) || [];
    const fsl = cfg.fsl || [];
    const blocking = [];
    const warnings = [];
    const passed = [];

    const counts = {};
    allocations.forEach(a => {
        const k = a.category_id + '|' + a.cadre_id;
        counts[k] = (counts[k] || 0) + 1;
    });

    // every eligible employee allotted
    fsl.forEach(r => {
        if (!allocations.some(a => a.employee_id === r.employee_id)) {
            blocking.push({ code: 'EMPLOYEE_NOT_ALLOTTED', message: (r.name || r.employee_id) + ' has no allotment in the FAL', employee_id: r.employee_id });
        } else {
            passed.push('Allotted: ' + (r.name || r.employee_id));
        }
    });

    // no employee allotted twice
    const seen = {};
    allocations.forEach(a => {
        if (seen[a.employee_id]) {
            blocking.push({ code: 'EMPLOYEE_ALLOTTED_TWICE', message: (a.name || a.employee_id) + ' appears more than once in the FAL', employee_id: a.employee_id });
        }
        seen[a.employee_id] = true;
    });

    // no cadre exceeds FWS
    ctx.strengths.forEach(s => {
        if (s.status === 'INACTIVE') return;
        const n = counts[s.category_id + '|' + s.cadre_id] || 0;
        const fws = poInt(s.fws) || 0;
        if (n > fws) {
            blocking.push({ code: 'FWS_EXCEEDED', message: (ctx.cadreById[s.cadre_id] || {}).name + ' / ' + (ctx.categoryById[s.category_id] || {}).name + ' has ' + n + ' allotted against FWS ' + fws });
        } else {
            passed.push('Within FWS: ' + (ctx.cadreById[s.cadre_id] || {}).name + ' / ' + (ctx.categoryById[s.category_id] || {}).name);
        }
    });

    // no rank/category mismatch
    const fslById = poIndexBy(fsl, 'employee_id');
    allocations.forEach(a => {
        const r = fslById[a.employee_id];
        if (r && r.category_id !== a.category_id) {
            blocking.push({ code: 'CATEGORY_MISMATCH', message: (a.name || a.employee_id) + ' was allotted under a different rank/category than in the FSL', employee_id: a.employee_id });
        }
        if (!r) {
            blocking.push({ code: 'NOT_IN_FSL', message: (a.name || a.employee_id) + ' is in the FAL but not in the FSL', employee_id: a.employee_id });
        }
    });

    // every allocation carries a reason
    allocations.forEach(a => {
        if (!a.allocation_reason || PO_ALLOC_REASON_IDS.indexOf(a.allocation_reason) === -1) {
            blocking.push({ code: 'REASON_MISSING', message: (a.name || a.employee_id) + ' has no valid allocation reason', employee_id: a.employee_id });
        }
    });

    // no invalid cadre assignment
    allocations.forEach(a => {
        const applicable = poApplicableCadres(a.category_id, ctx.strengths, ctx.cadres);
        if (applicable.indexOf(a.cadre_id) === -1) {
            blocking.push({ code: 'INVALID_CADRE_ALLOTMENT', message: (a.name || a.employee_id) + ' was allotted to ' + a.cadre_name + ' which is not configured for ' + a.category_name, employee_id: a.employee_id });
        }
    });

    // preferential processed before the rest
    ctx.categoryOrder.forEach(catId => {
        const inCat = allocations.filter(a => a.category_id === catId);
        const prefSeqs = inCat.filter(a => a.allocation_reason === 'PREFERENTIAL_CATEGORY').map(a => a.allocation_sequence);
        const restSeqs = inCat.filter(a => a.allocation_reason !== 'PREFERENTIAL_CATEGORY').map(a => a.allocation_sequence);
        if (prefSeqs.length && restSeqs.length && Math.max.apply(null, prefSeqs) > Math.min.apply(null, restSeqs)) {
            warnings.push({ code: 'PREFERENTIAL_ORDER', message: 'In ' + (ctx.categoryById[catId] || {}).name + ' at least one preferential allotment was sequenced after a non-preferential allotment' });
        } else if (prefSeqs.length) {
            passed.push('Preferential processed first in ' + (ctx.categoryById[catId] || {}).name);
        }
    });

    // ---- PART 8: rank/category isolation and an explicit sequence ---------
    allocations.forEach(a => {
        if (!ctx.categoryById[a.category_id]) {
            blocking.push({ code: 'CATEGORY_MISMATCH', message: (a.name || a.employee_id) + ' is allotted under a rank/category that is not configured for the exercise', employee_id: a.employee_id });
        }
        if (!a.allocation_sequence || a.allocation_sequence < 1) {
            blocking.push({ code: 'REASON_MISSING', message: (a.name || a.employee_id) + ' has no allocation_sequence, so "last allotted" cannot be determined', employee_id: a.employee_id });
        }
    });
    if (!blocking.some(b => b.code === 'CATEGORY_MISMATCH')) {
        passed.push('Rank/category isolation verified: no employee allotted outside their category');
    }

    // ---- PART 19: invalid option and invalid preferential claim -------------
    allocations.forEach(a => {
        const opt = [a.option_pref1, a.option_pref2, a.option_pref3].filter(Boolean);
        const applicable = poApplicableCadres(a.category_id, ctx.strengths, ctx.cadres);
        opt.forEach(cid => {
            if (applicable.indexOf(cid) === -1) {
                blocking.push({ code: 'INVALID_OPTION', message: (a.name || a.employee_id) + ' exercised an option for ' + cid + ' which is not configured for ' + a.category_name, employee_id: a.employee_id });
            }
        });
        if (opt.length && a.preference_selected && opt.indexOf(a.preference_selected) === -1) {
            blocking.push({ code: 'INVALID_OPTION', message: (a.name || a.employee_id) + ' was allotted to ' + a.cadre_name + ' which is not among the options exercised', employee_id: a.employee_id });
        }
        if (a.allocation_reason === 'PREFERENTIAL_CATEGORY') {
            const rec = fslById[a.employee_id];
            if (!rec || !poPreferredClaim(rec)) {
                blocking.push({ code: 'INVALID_PREFERENTIAL_CLAIM', message: (a.name || a.employee_id) + ' received preferential priority without a verified claim', employee_id: a.employee_id });
            }
        }
    });

    // ---- PART 19: invalid compulsory and invalid no-option handling ---------
    const shortfallByCat = {};
    ctx.categoryOrder.forEach(catId => {
        shortfallByCat[catId] = poCategoryFws(catId, ctx.strengths) -
            allocations.filter(a => a.category_id === catId).length;
    });
    allocations.forEach(a => {
        // Validity is judged from the shortfall recorded at the moment of allotment,
        // because filling the last vacant post legitimately leaves no shortfall at
        // the end of the run.
        if (a.allocation_reason === 'COMPULSORY_ALLOTMENT' && !(a.shortfall_before > 0)) {
            blocking.push({ code: 'INVALID_COMPULSORY', message: (a.name || a.employee_id) + ' was allotted compulsorily although no shortfall existed for ' + a.category_name + ' at that point', employee_id: a.employee_id });
        }
        if (a.allocation_reason === 'NO_OPTION_ALLOTMENT' &&
            [a.option_pref1, a.option_pref2, a.option_pref3].filter(Boolean).length) {
            blocking.push({ code: 'INVALID_NO_OPTION', message: (a.name || a.employee_id) + ' is recorded as NO_OPTION but carries submitted preferences', employee_id: a.employee_id });
        }
    });
    ctx.categoryOrder.forEach(catId => {
        const inCat = allocations.filter(a => a.category_id === catId);
        const noOpt = inCat.filter(a => a.allocation_reason === 'NO_OPTION_ALLOTMENT');
        const others = inCat.filter(a => a.allocation_reason !== 'NO_OPTION_ALLOTMENT');
        if (noOpt.length && others.length &&
            Math.min.apply(null, noOpt.map(a => a.allocation_sequence)) <
            Math.max.apply(null, others.map(a => a.allocation_sequence))) {
            blocking.push({ code: 'INVALID_NO_OPTION', message: 'In ' + (ctx.categoryById[catId] || {}).name + ' a NO_OPTION employee was allotted before an employee holding an option', employee_id: noOpt[0].employee_id });
        }
    });

    // ---- PART 19: allotment outside the exercise ----------------------------
    const exerciseCadres = ctx.cadres.map(c => c.id);
    allocations.forEach(a => {
        if (exerciseCadres.indexOf(a.cadre_id) === -1) {
            blocking.push({ code: 'ALLOCATION_OUTSIDE_EXERCISE', message: (a.name || a.employee_id) + ' was allotted to ' + a.cadre_id + ' which is outside the exercise cadre set', employee_id: a.employee_id });
        }
    });

    // ---- PART 13/15: an unresolved SC/ST shortfall blocks FAL publication ----
    const review = (result && result.scstReview) || {};
    (review.shortfalls || []).forEach(s => {
        const rec = {
            code: 'SC_ST_SHORTFALL_EXCEPTION',
            exception_key: s.exception_key,
            message: s.reason,
            source_data: 'working strength=' + s.working_strength + ', category required=' + s.category_required +
                         ', category actual=' + s.category_actual + ', cadre required=' + s.required +
                         ', cadre actual=' + s.actual + ', shortfall=' + s.shortfall
        };
        if (s.critical) {
            // PART 19: an unresolved CRITICAL SC/ST issue blocks FAL publication.
            blocking.push(rec);
        } else {
            // The category total meets the proportion; this cadre's share does not.
            warnings.push(Object.assign({ warning: true }, rec));
        }
    });
    if (review.enabled) passed.push('SC/ST proportionate review executed on the ' + review.basis + ' basis');

    // options respected / documented deviations
    const compulsory = allocations.filter(a => a.allocation_reason === 'COMPULSORY_ALLOTMENT');
    const noOption = allocations.filter(a => a.allocation_reason === 'NO_OPTION_ALLOTMENT');
    if (compulsory.length) {
        warnings.push({ code: 'COMPULSORY_DOCUMENTED', message: compulsory.length + ' employee(s) allotted compulsorily because every stated preference was unavailable: ' + compulsory.map(a => a.name).join(', ') });
    }
    if (noOption.length) {
        warnings.push({ code: 'NO_OPTION_DOCUMENTED', message: noOption.length + ' employee(s) submitted no option and were processed at the end of the run: ' + noOption.map(a => a.name).join(', ') });
    }

    // engine-level exceptions
    ((result && result.exceptions) || []).forEach(e => {
        if (e.severity === 'BLOCKING') blocking.push({ code: e.code, message: e.message, employee_id: e.employee_id });
        else warnings.push({ code: e.code, message: e.message });
    });

    return {
        valid: blocking.length === 0,
        blocking: blocking,
        warnings: warnings,
        passed: passed,
        counts: { allocated: allocations.length, compulsory: compulsory.length, no_option: noOption.length, preferential: allocations.filter(a => a.allocation_reason === 'PREFERENTIAL_CATEGORY').length }
    };
}


// ============================================================================
// Exports (browser global + node module)
// ============================================================================

const POEngine = {
    PO_ENGINE_VERSION: PO_ENGINE_VERSION,
    poEngineHash: poEngineHash,
    PO_STAGES: PO_STAGES,
    PO_STAGE_INDEX: PO_STAGE_INDEX,
    PO_PREF_CLAIMS: PO_PREF_CLAIMS,
    PO_SEG_GROUPS: PO_SEG_GROUPS,
    PO_SERVICE_STATUS: PO_SERVICE_STATUS,
    PO_CADRE_TYPES: PO_CADRE_TYPES,
    PO_ALLOC_REASONS: PO_ALLOC_REASONS,
    PO_ALLOC_REASON_IDS: PO_ALLOC_REASON_IDS,
    PO_SERVICE_STATUS_IDS: PO_SERVICE_STATUS_IDS,
    PO_CADRE_TYPE_IDS: PO_CADRE_TYPE_IDS,
    PO_SEG_BASIS: PO_SEG_BASIS,
    PO_COMPULSORY_POLICIES: PO_COMPULSORY_POLICIES,
    PO_COMPULSORY_POLICY_IDS: PO_COMPULSORY_POLICY_IDS,
    PO_DEFAULT_COMPULSORY_POLICY: PO_DEFAULT_COMPULSORY_POLICY,
    PO_POLICY_NOTICE_COMPULSORY: PO_POLICY_NOTICE_COMPULSORY,
    PO_ROUNDING_POLICIES: PO_ROUNDING_POLICIES,
    PO_ROUNDING_POLICY_IDS: PO_ROUNDING_POLICY_IDS,
    PO_DEFAULT_ROUNDING_POLICY: PO_DEFAULT_ROUNDING_POLICY,
    PO_POLICY_NOTICE_ROUNDING: PO_POLICY_NOTICE_ROUNDING,
    PO_ERROR_CATALOGUE: PO_ERROR_CATALOGUE,
    poApplyRounding: poApplyRounding,
    PO_GO_REFERENCE: PO_GO_REFERENCE,
    poBuildContext: poBuildContext,
    poPreferredClaim: poPreferredClaim,
    poClaimVerified: poClaimVerified,
    poApplicableCadres: poApplicableCadres,
    poCategoryFws: poCategoryFws,
    poSeniorityCompare: poSeniorityCompare,
    poJuniorFirst: poJuniorFirst,
    validateWorkingStrength: validateWorkingStrength,
    validateDSL: validateDSL,
    validateFSL: validateFSL,
    analyseFSL: analyseFSL,
    runAllocation: runAllocation,
    validateFAL: validateFAL,
    reviewSegProportion: reviewSegProportion
};

if (typeof window !== 'undefined') { window.POEngine = POEngine; }
if (typeof module !== 'undefined' && module.exports) { module.exports = POEngine; }
