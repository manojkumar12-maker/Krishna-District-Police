/**
 * Presidential Order-2025 allocation engine tests.
 *
 *   node --test tests/
 *
 * Covers the rules that the G.O.Ms.No.129 workflow depends on:
 * official inputs are never invented, allocation is deterministic and
 * explainable, and no cadre is ever allotted beyond its Final Working Strength.
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const E = require(path.join(__dirname, '..', 'poEngine.js'));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CATEGORIES = [
    { id: 'CAT_SI', code: 'SI', name: 'Sub-Inspector of Police', status: 'ACTIVE' },
    { id: 'CAT_PC', code: 'PC', name: 'Police Constable', status: 'ACTIVE' }
];

const CADRES = [
    { id: 'DC_KRISHNA', name: 'Krishna District (Residuary)', cadre_type: 'RESIDUARY_ERSTWHILE', status: 'ACTIVE' },
    { id: 'DC_NTR', name: 'NTR District', cadre_type: 'NEWLY_FORMED_DISTRICT', status: 'ACTIVE' },
    { id: 'DC_ELURU', name: 'Eluru District', cadre_type: 'NEWLY_FORMED_DISTRICT', status: 'ACTIVE' }
];

// SI: 4 posts Krishna, 2 NTR, 1 Eluru  => FWS 7
// PC: 2 Krishna, 2 NTR, 0 Eluru        => FWS 4
const STRENGTHS = [
    { category_id: 'CAT_SI', cadre_id: 'DC_KRISHNA', cadre_strength: 10, fws: 4, status: 'ACTIVE' },
    { category_id: 'CAT_SI', cadre_id: 'DC_NTR', cadre_strength: 10, fws: 2, status: 'ACTIVE' },
    { category_id: 'CAT_SI', cadre_id: 'DC_ELURU', cadre_strength: 10, fws: 1, status: 'ACTIVE' },
    { category_id: 'CAT_PC', cadre_id: 'DC_KRISHNA', cadre_strength: 8, fws: 2, status: 'ACTIVE' },
    { category_id: 'CAT_PC', cadre_id: 'DC_NTR', cadre_strength: 8, fws: 2, status: 'ACTIVE' },
    { category_id: 'CAT_PC', cadre_id: 'DC_ELURU', cadre_strength: 8, fws: 0, status: 'ACTIVE' }
];

const APPROVED = [
    { category_id: 'CAT_SI', approved_working_strength: 7 },
    { category_id: 'CAT_PC', approved_working_strength: 4 }
];

function emp(id, sen, extra) {
    return Object.assign({
        employee_id: id,
        name: 'Employee ' + id,
        category_id: 'CAT_SI',
        rank_code: 'SI',
        seniority_no: sen,
        seniority_type: 'Provisional',
        parentage: '',
        gender: 'Male',
        cfms_id: 'C' + id,
        mobile: '90000000' + id,
        date_of_birth: '1990-01-01',
        date_of_joining_category: '2015-01-01',
        office: 'KRN PS',
        designation: 'SI',
        social_category: 'BC-B',
        sc_group: '',
        erstwhile_cadre_id: 'DC_KRISHNA',
        present_local_cadre_id: 'DC_KRISHNA',
        present_working_place: 'KRN PS',
        service_status: 'PRESENT',
        claims: {},
        fsl_version: 1
    }, extra || {});
}

function opts(map) {
    const o = {};
    Object.keys(map).forEach(k => {
        o[k] = { pref1: map[k][0] || '', pref2: map[k][1] || '', pref3: map[k][2] || '', submitted: true, submitted_at: '2026-08-01T00:00:00Z' };
    });
    return o;
}

function ctx() {
    return E.poBuildContext({
        exercise_id: 'PO2025-KRN-001',
        categories: CATEGORIES, cadres: CADRES, strengths: STRENGTHS, approved: APPROVED
    });
}

function run(fsl, options, cfg) {
    return E.runAllocation(Object.assign({ ctx: ctx(), fsl: fsl, options: options || {} }, cfg || {}));
}

// ---------------------------------------------------------------------------
// 1. Working strength reconciliation
// ---------------------------------------------------------------------------

test('working strength: reconciled when total FWS equals the approved strength', () => {
    const r = E.validateWorkingStrength({ ctx: ctx() });
    assert.strictEqual(r.valid, true);
    assert.strictEqual(r.errors.length, 0);
    assert.strictEqual(r.rows.find(x => x.category_id === 'CAT_SI').total_fws, 7);
});

test('working strength: blocks when FWS does not reconcile with the approved strength', () => {
    const bad = APPROVED.map(a => ({ category_id: a.category_id, approved_working_strength: a.approved_working_strength + 1 }));
    const r = E.validateWorkingStrength({ ctx: E.poBuildContext({ categories: CATEGORIES, cadres: CADRES, strengths: STRENGTHS, approved: bad }) });
    assert.strictEqual(r.valid, false);
    assert.ok(r.errors.some(e => e.code === 'FWS_RECONCILIATION'));
});

test('working strength: FWS above cadre strength is an error, never silently clamped', () => {
    const bad = STRENGTHS.map(s => s.cadre_id === 'DC_NTR' && s.category_id === 'CAT_SI' ? Object.assign({}, s, { cadre_strength: 1 }) : s);
    const r = E.validateWorkingStrength({ ctx: E.poBuildContext({ categories: CATEGORIES, cadres: CADRES, strengths: bad, approved: APPROVED }) });
    assert.ok(r.errors.some(e => e.code === 'FWS_EXCEEDS_CADRE_STRENGTH'));
});

test('working strength: FWS is never modified by the validator', () => {
    const before = JSON.stringify(STRENGTHS);
    E.validateWorkingStrength({ ctx: ctx() });
    assert.strictEqual(JSON.stringify(STRENGTHS), before);
});

// ---------------------------------------------------------------------------
// 2. DSL validation - official data is never manufactured
// ---------------------------------------------------------------------------

test('DSL: a missing seniority number is a blocking error and is not filled in', () => {
    const rec = emp('01', null);
    const r = E.validateDSL([rec], { ctx: ctx() });
    assert.strictEqual(r.valid, false);
    const err = r.errors.find(e => e.code === 'MISSING_SENIORITY');
    assert.ok(err, 'MISSING_SENIORITY expected');
    assert.strictEqual(rec.seniority_no, null, 'seniority must stay null');
});

test('DSL: duplicate seniority inside one category is a blocking error', () => {
    const r = E.validateDSL([emp('01', 5), emp('02', 5)], { ctx: ctx() });
    assert.ok(r.errors.some(e => e.code === 'DUPLICATE_SENIORITY'));
});

test('DSL: the same seniority may repeat across two different categories', () => {
    const r = E.validateDSL([
        emp('01', 5),
        emp('02', 5, { category_id: 'CAT_PC', rank_code: 'PC' })
    ], { ctx: ctx() });
    assert.ok(!r.errors.some(e => e.code === 'DUPLICATE_SENIORITY'));
});

test('DSL: duplicate CFMS inside one category is a blocking error', () => {
    const r = E.validateDSL([emp('01', 1), emp('02', 2, { cfms_id: 'C01' })], { ctx: ctx() });
    assert.ok(r.errors.some(e => e.code === 'DUPLICATE_CFMS'));
});

test('DSL: an employee duplicated across ranks is a blocking error', () => {
    const r = E.validateDSL([
        emp('01', 1),
        emp('02', 9, { category_id: 'CAT_PC', rank_code: 'PC', cfms_id: 'C01' })
    ], { ctx: ctx() });
    assert.ok(r.errors.some(e => e.code === 'DUPLICATE_ACROSS_RANKS'));
});

test('DSL: date of joining in the category is required', () => {
    const r = E.validateDSL([emp('01', 1, { date_of_joining_category: '' })], { ctx: ctx() });
    assert.ok(r.errors.some(e => e.code === 'MISSING_DOJ_CATEGORY'));
});

test('DSL: an unknown cadre is a blocking error', () => {
    const r = E.validateDSL([emp('01', 1, { erstwhile_cadre_id: 'DC_ATLANTIS' })], { ctx: ctx() });
    assert.ok(r.errors.some(e => e.code === 'INVALID_ERSTWHILE_CADRE'));
});

test('DSL: an employee borne on a cadre the category does not use is flagged', () => {
    // Eluru has no PC post (FWS 0), so a PC borne there is outside the category.
    const r = E.validateDSL([emp('01', 1, { category_id: 'CAT_PC', rank_code: 'PC', erstwhile_cadre_id: 'DC_ELURU' })], { ctx: ctx() });
    assert.ok(r.errors.some(e => e.code === 'EMPLOYEE_MISSING_FROM_CADRE'));
});

test('DSL: employees on deputation, leave, suspension and absence stay in the list', () => {
    const statuses = ['DEPUTATION', 'LEAVE', 'PROBATION', 'TRAINING', 'SUSPENSION', 'ABSENT', 'UNABSENT', 'ABSCONDING'];
    const fsl = statuses.map((s, i) => emp('0' + (i + 1), i + 1, { service_status: s }));
    const r = E.validateDSL(fsl, { ctx: ctx() });
    assert.strictEqual(r.stats.total, statuses.length, 'no employee may be dropped for their status');
    const res = run(fsl, {});
    assert.strictEqual(res.allocations.length + res.unallocated.length, statuses.length);
});

// ---------------------------------------------------------------------------
// 3. Preferential categories need certification, not just a flag
// ---------------------------------------------------------------------------

test('preferential: a manually ticked but unverified claim carries no preference', () => {
    const r = E.validateDSL([emp('01', 1, { claims: { widow: { claimed: true, verification: 'PENDING' } } })], { ctx: ctx() });
    assert.ok(r.warnings.some(w => w.code === 'CLAIM_NOT_VERIFIED'));
    assert.strictEqual(E.poPreferredClaim(emp('02', 2, { claims: { widow: { claimed: true, verification: 'PENDING' } } })), null);
});

test('preferential: a verified claim is honoured', () => {
    const rec = emp('01', 1, { claims: { widow: { claimed: true, verification: 'VERIFIED' } } });
    assert.strictEqual(E.poPreferredClaim(rec).id, 'widow');
});

test('preferential: PwBD below 70% certified is not preferential', () => {
    const rec = emp('01', 1, { claims: { pwbd: { claimed: true, verification: 'VERIFIED', disability_percent: 60 } } });
    assert.strictEqual(E.poPreferredClaim(rec), null);
    const r = E.validateDSL([rec], { ctx: ctx() });
    assert.ok(r.errors.some(e => e.code === 'CLAIM_PERCENT_BELOW_MIN'));
});

test('preferential: PwBD at 70% certified is preferential at priority 1', () => {
    const rec = emp('01', 1, { claims: { pwbd: { claimed: true, verification: 'VERIFIED', disability_percent: 70 } } });
    assert.strictEqual(E.poPreferredClaim(rec).priority, 1);
});

test('preferential: a rejected claim carries no preference', () => {
    const rec = emp('01', 1, { claims: { cancer: { claimed: true, verification: 'REJECTED' } } });
    assert.strictEqual(E.poPreferredClaim(rec), null);
});

test('preferential: the highest priority verified claim wins', () => {
    const rec = emp('01', 1, { claims: {
        widow: { claimed: true, verification: 'VERIFIED' },
        pwbd: { claimed: true, verification: 'VERIFIED', disability_percent: 82 }
    } });
    assert.strictEqual(E.poPreferredClaim(rec).id, 'pwbd');
});

// ---------------------------------------------------------------------------
// 4. Allocation order
// ---------------------------------------------------------------------------

test('allocation: preferential employees are processed before everyone else', () => {
    const fsl = [
        emp('01', 1),                                                            // senior, no claim
        emp('02', 9, { claims: { widow: { claimed: true, verification: 'VERIFIED' } } })
    ];
    const res = run(fsl, opts({ '01': ['DC_ELURU', 'DC_NTR', 'DC_KRISHNA'], '02': ['DC_NTR'] }));
    const pref = res.allocations.find(a => a.employee_id === '02');
    const other = res.allocations.find(a => a.employee_id === '01');
    assert.strictEqual(pref.allocation_reason, 'PREFERENTIAL_CATEGORY');
    assert.ok(pref.allocation_sequence < other.allocation_sequence,
        'the preferential allotment must be sequenced first');
});

test('allocation: preferences cascade 1 -> 2 -> 3', () => {
    // Four more senior employees consume the four Krishna posts, so the junior
    // employee's first preference is full and the cascade must move on.
    const fsl = [
        emp('10', 1), emp('11', 2), emp('12', 3), emp('13', 4),
        emp('01', 9)
    ];
    const res = run(fsl, opts({
        '10': ['DC_KRISHNA'], '11': ['DC_KRISHNA'], '12': ['DC_KRISHNA'], '13': ['DC_KRISHNA'],
        '01': ['DC_KRISHNA', 'DC_NTR', 'DC_ELURU']
    }));
    const a = res.allocations.find(x => x.employee_id === '01');
    assert.strictEqual(a.allocation_reason, 'SENIORITY_SECOND_PREFERENCE');
    assert.strictEqual(a.cadre_id, 'DC_NTR');
    assert.strictEqual(a.preference_rank, 2);
});

test('allocation: first preference is used when a post is free', () => {
    const res = run([emp('01', 1)], opts({ '01': ['DC_ELURU', 'DC_NTR', 'DC_KRISHNA'] }));
    const a = res.allocations[0];
    assert.strictEqual(a.allocation_reason, 'SENIORITY_FIRST_PREFERENCE');
    assert.strictEqual(a.cadre_id, 'DC_ELURU');
});

test('allocation: compulsory allotment happens only where a shortfall exists', () => {
    // Krishna holds 4 SI posts. Five employees all prefer Krishna only, so the
    // fifth has every preference exhausted and is allotted compulsorily to the
    // cadre holding the largest shortfall.
    const fsl = [emp('01', 1), emp('02', 2), emp('03', 3), emp('04', 4), emp('05', 5)];
    const res = run(fsl, opts({
        '01': ['DC_KRISHNA'], '02': ['DC_KRISHNA'], '03': ['DC_KRISHNA'],
        '04': ['DC_KRISHNA'], '05': ['DC_KRISHNA']
    }));
    const a5 = res.allocations.find(x => x.employee_id === '05');
    assert.strictEqual(a5.allocation_reason, 'COMPULSORY_ALLOTMENT');
    assert.strictEqual(a5.cadre_id, 'DC_NTR');
    assert.strictEqual(a5.preference_selected, '');
    assert.ok(a5.reason_detail.length > 0, 'a compulsory allotment must carry an explanation');
});

test('allocation: no compulsory allotment when there is no shortfall', () => {
    // One employee, seven posts: the first preference is honoured and the run
    // must not invent a second allotment anywhere.
    const res = run([emp('01', 1)], opts({ '01': ['DC_ELURU'] }));
    assert.strictEqual(res.allocations.length, 1);
    assert.strictEqual(res.allocations[0].allocation_reason, 'SENIORITY_FIRST_PREFERENCE');
    assert.strictEqual(res.exceptions.length, 0);
});

test('allocation: preference for a cadre not configured for the category is ignored', () => {
    // Eluru has FWS 0 for CAT_PC, so a PC employee may not be sent there.
    const pc = emp('01', 1, { category_id: 'CAT_PC', rank_code: 'PC' });
    const res = run([pc], opts({ '01': ['DC_ELURU', 'DC_KRISHNA'] }));
    const a = res.allocations[0];
    assert.strictEqual(a.cadre_id, 'DC_KRISHNA');
    assert.strictEqual(a.preference_rank, 2);
});

test('allocation: employees with no option are processed last', () => {
    const fsl = [
        emp('01', 1),                                                   // no option
        emp('02', 2),                                                   // option -> Krishna
        emp('03', 3),                                                   // option -> NTR
        emp('04', 4),                                                   // option -> Eluru
        emp('05', 5)                                                    // option -> Krishna
    ];
    const res = run(fsl, opts({ '02': ['DC_KRISHNA'], '03': ['DC_NTR'], '04': ['DC_ELURU'], '05': ['DC_KRISHNA'] }));
    const noOpt = res.allocations.find(a => a.employee_id === '01');
    assert.strictEqual(noOpt.allocation_reason, 'NO_OPTION_ALLOTMENT');
    assert.strictEqual(noOpt.allocation_sequence, res.allocations.length);
    const maxOptSeq = Math.max.apply(null, res.allocations.filter(a => a.employee_id !== '01').map(a => a.allocation_sequence));
    assert.ok(noOpt.allocation_sequence > maxOptSeq);
});

test('allocation: an unsubmitted option is never treated as an option', () => {
    const options = { '01': { pref1: 'DC_ELURU', pref2: '', pref3: '', submitted: false } };
    const res = run([emp('01', 1)], options);
    assert.strictEqual(res.allocations[0].allocation_reason, 'NO_OPTION_ALLOTMENT');
});

// ---------------------------------------------------------------------------
// 5. Absolute no-over-allocation rule
// ---------------------------------------------------------------------------

test('over-allocation: is impossible; excess employees are left unallocated with an exception', () => {
    const fsl = [];
    for (let i = 1; i <= 9; i++) fsl.push(emp(String(i).padStart(2, '0'), i));
    const res = run(fsl, {});
    assert.strictEqual(res.allocations.length, 7, 'exactly the 7 FWS posts may be filled');
    assert.strictEqual(res.unallocated.length, 2);
    res.unallocated.forEach(u => assert.ok(/Final Working Strength exhausted/.test(u.message)));
    assert.strictEqual(res.exceptions.filter(e => e.code === 'FWS_EXHAUSTED').length, 2);
    assert.ok(!res.allocations.some(a => a.allocation_reason === 'over_allocation'));
    assert.ok(!res.allocations.some(a => a.allocation_reason === 'over_allocation'));
});

test('over-allocation: no cadre ever exceeds its FWS', () => {
    const fsl = [];
    for (let i = 1; i <= 20; i++) fsl.push(emp(String(i).padStart(2, '0'), i));
    const res = run(fsl, {});
    STRENGTHS.forEach(s => {
        const n = res.allocations.filter(a => a.category_id === s.category_id && a.cadre_id === s.cadre_id).length;
        assert.ok(n <= s.fws, s.category_id + '/' + s.cadre_id + ' over-allocated');
    });
    assert.strictEqual(res.run.status, 'PASSED');
    assert.ok(!res.exceptions.some(e => e.code === 'OVER_ALLOCATION'));
});

test('over-allocation: SC/ST adjustment never breaks FWS', () => {
    const fsl = [];
    for (let i = 1; i <= 7; i++) {
        fsl.push(emp(String(i).padStart(2, '0'), i, { sc_group: i <= 2 ? 'SC_1' : (i <= 4 ? 'ST' : '') }));
    }
    const res = run(fsl, {});
    STRENGTHS.forEach(s => {
        const n = res.allocations.filter(a => a.category_id === s.category_id && a.cadre_id === s.cadre_id).length;
        assert.ok(n <= s.fws);
    });
});

// ---------------------------------------------------------------------------
// 6. Determinism and explainability
// ---------------------------------------------------------------------------

test('determinism: the same inputs always produce byte-identical allocations', () => {
    const fsl = [emp('01', 3), emp('02', 1), emp('03', 2), emp('04', 4)];
    const options = opts({ '01': ['DC_NTR'], '02': ['DC_ELURU'], '03': ['DC_KRISHNA'] });
    const a = run(fsl, options, { started_at: 'X' });
    const b = run(fsl, options, { started_at: 'X' });
    const strip = r => JSON.stringify(r.allocations);
    assert.strictEqual(strip(a), strip(b));
});

test('determinism: input order does not change the result', () => {
    const fsl = [emp('01', 3), emp('02', 1), emp('03', 2)];
    const options = opts({ '01': ['DC_NTR'], '02': ['DC_ELURU'], '03': ['DC_KRISHNA'] });
    const a = run(fsl, options, { started_at: 'X' });
    const b = run(fsl.slice().reverse(), options, { started_at: 'X' });
    const key = r => r.allocations.map(x => x.employee_id + '>' + x.cadre_id + '>' + x.allocation_reason).sort().join('|');
    assert.strictEqual(key(a), key(b));
});

test('explainability: every allotment carries a full provenance record', () => {
    const res = run([emp('01', 1)], opts({ '01': ['DC_ELURU', 'DC_NTR', 'DC_KRISHNA'] }));
    const a = res.allocations[0];
    const required = ['employee_id', 'name', 'category_id', 'rank_code', 'cadre_id', 'allocation_sequence',
        'allocation_reason', 'preference_considered', 'preference_selected', 'seniority_no',
        'preferential_status', 'vacancy_before', 'vacancy_after', 'sc_st_adjustment', 'allocated_at', 'engine_version'];
    required.forEach(k => assert.ok(k in a, 'missing provenance field: ' + k));
    assert.ok(E.PO_ALLOC_REASON_IDS.indexOf(a.allocation_reason) !== -1);
    assert.strictEqual(a.engine_version, E.PO_ENGINE_VERSION);
});

test('explainability: the reason answers "why this cadre"', () => {
    const res = run([
        emp('01', 1, { claims: { kidney: { claimed: true, verification: 'VERIFIED' } } })
    ], opts({ '01': ['DC_NTR'] }));
    const a = res.allocations[0];
    assert.strictEqual(a.allocation_reason, 'PREFERENTIAL_CATEGORY');
    assert.strictEqual(a.preferential_claim_id, 'kidney');
    assert.ok(/Preferential category/.test(a.reason_detail));
    assert.strictEqual(a.vacancy_before, 2);
    assert.strictEqual(a.vacancy_after, 1);
});

// ---------------------------------------------------------------------------
// 7. Categories are never mixed
// ---------------------------------------------------------------------------

test('no mixing: allocation for one category never consumes another category\'s posts', () => {
    const si = [emp('01', 1), emp('02', 2), emp('03', 3), emp('04', 4), emp('05', 5)];
    const pc = [
        emp('11', 1, { category_id: 'CAT_PC', rank_code: 'PC' }),
        emp('12', 2, { category_id: 'CAT_PC', rank_code: 'PC' })
    ];
    const res = run(si.concat(pc), opts({ '01': ['DC_KRISHNA'], '02': ['DC_KRISHNA'] }));
    const pcAllocs = res.allocations.filter(a => a.category_id === 'CAT_PC');
    assert.strictEqual(pcAllocs.length, 2);
    assert.strictEqual(pcAllocs.filter(a => a.cadre_id === 'DC_ELURU').length, 0, 'Eluru has 0 PC posts');
    assert.strictEqual(res.allocations.filter(a => a.category_id === 'CAT_SI').length, 5);
});

// ---------------------------------------------------------------------------
// 8. SC/ST proportionate review
// ---------------------------------------------------------------------------

test('SC/ST: reserved posts are reviewed after allocation, not reserved up front', () => {
    // Eluru has 1 SI post. The review runs after normal allocation and surfaces
    // any residual shortfall rather than reserving the post up front.
    const fsl = [];
    for (let i = 1; i <= 7; i++) fsl.push(emp(String(i).padStart(2, '0'), i));
    const res = run(fsl, {});
    assert.strictEqual(res.scstReview.enabled, true);
    assert.strictEqual(res.scstReview.perCategory.CAT_SI.basis, 'FINAL_WORKING_STRENGTH');
    res.scstReview.perCategory.CAT_SI.groups.forEach(g => {
        assert.strictEqual(typeof g.required, 'number');
        assert.strictEqual(typeof g.actual, 'number');
    });
});

test('SC/ST: a shortfall that cannot be resolved is carried, never forced', () => {
    // A category large enough that SC Group-I (1%) requires a post, with no
    // SC Group-I employee anywhere. The shortfall must be reported as an
    // exception rather than filled by moving or inventing an employee.
    const strengths = [
        { category_id: 'CAT_SI', cadre_id: 'DC_KRISHNA', cadre_strength: 50, fws: 60, status: 'ACTIVE' },
        { category_id: 'CAT_SI', cadre_id: 'DC_NTR', cadre_strength: 40, fws: 40, status: 'ACTIVE' }
    ];
    const c = E.poBuildContext({ categories: CATEGORIES, cadres: CADRES, strengths: strengths, approved: [{ category_id: 'CAT_SI', approved_working_strength: 100 }] });
    const fsl = [];
    for (let i = 1; i <= 100; i++) fsl.push(emp(String(i).padStart(3, '0'), i));

    const res = E.runAllocation({ ctx: c, fsl: fsl, options: {} });
    const row = res.scstReview.perCategory.CAT_SI;
    const sc1 = row.groups.find(g => g.group === 'SC_1');
    assert.strictEqual(sc1.required, 1, '1% of 100 posts');
    assert.strictEqual(sc1.actual, 0);
    assert.strictEqual(sc1.status, 'SHORTFALL');
    assert.strictEqual(sc1.shortfall, 1);
    assert.strictEqual(sc1.status_after, 'SHORTFALL', 'must remain unmet');

    const carried = res.scstReview.shortfalls.find(s => s.group === 'SC_1');
    assert.ok(carried, 'the unresolved shortfall must be carried into the FAL');
    assert.ok(/NOT forced/.test(carried.reason));

    // Nothing was invented: no allocation claims an SC Group-I membership.
    assert.ok(!res.allocations.some(a => a.sc_group === 'SC_1'));
    // Headcount per cadre is unchanged by the failed adjustment.
    assert.strictEqual(res.allocations.filter(a => a.cadre_id === 'DC_KRISHNA').length, 60);
    assert.strictEqual(res.allocations.filter(a => a.cadre_id === 'DC_NTR').length, 40);
});

test('SC/ST: an adjustment records inserted and replaced employees and stays inside one category', () => {
    // 7 SI posts: Eluru 1, NTR 2, Krishna 4. Three ST employees (ST needs 6% of 7 -> 0).
    // Use SC_3 (7.5% of 7 = 1) so a real adjustment can be exercised.
    const fsl = [
        emp('01', 1, { sc_group: 'SC_3' }),
        emp('02', 2),
        emp('03', 3),
        emp('04', 4),
        emp('05', 5),
        emp('06', 6),
        emp('07', 7)
    ];
    const res = run(fsl, opts({
        '01': ['DC_KRISHNA'], '02': ['DC_KRISHNA'], '03': ['DC_KRISHNA'], '04': ['DC_KRISHNA'],
        '05': ['DC_NTR'], '06': ['DC_NTR'], '07': ['DC_ELURU']
    }));
    const review = res.scstReview.perCategory.CAT_SI;
    const sc3 = review.groups.find(g => g.group === 'SC_3');
    assert.strictEqual(sc3.required, 1);
    res.scstReview.adjustments.forEach(a => {
        assert.strictEqual(a.category_id, 'CAT_SI');
        assert.ok(a.employee_inserted && a.employee_replaced);
        assert.ok(a.reason.length > 0);
    });
    // still within FWS after adjustment
    STRENGTHS.filter(s => s.category_id === 'CAT_SI').forEach(s => {
        const n = res.allocations.filter(a => a.cadre_id === s.cadre_id).length;
        assert.ok(n <= s.fws);
    });
});

test('SC/ST: adjustment is deterministic', () => {
    const fsl = [emp('01', 1, { sc_group: 'SC_3' }), emp('02', 2), emp('03', 3)];
    const strip = r => JSON.stringify(r.scstReview.adjustments);
    assert.strictEqual(strip(run(fsl, {})), strip(run(fsl, {})));
});

// ---------------------------------------------------------------------------
// 9. FAL validation
// ---------------------------------------------------------------------------

test('FAL validation: passes on a complete, clean run', () => {
    // Realistic fixture: enough reserved-category employees that the prescribed
    // proportions can actually be met.
    const fsl = [
        emp('01', 1, { sc_group: 'SC_3' }),
        emp('02', 2, { sc_group: 'ST' }),
        emp('03', 3),
        emp('04', 4),
        emp('05', 5),
        emp('06', 6),
        emp('07', 7)
    ];
    const res = run(fsl, opts({ '01': ['DC_KRISHNA'], '02': ['DC_KRISHNA'], '03': ['DC_KRISHNA'], '04': ['DC_KRISHNA'] }));
    assert.strictEqual(res.allocations.length, 7);
    const v = E.validateFAL(res, { ctx: ctx(), fsl: fsl });
    assert.strictEqual(v.valid, true, JSON.stringify(v.blocking));
});

test('FAL validation: an employee with no allotment is a blocking error', () => {
    const fsl = [emp('01', 1), emp('02', 2)];
    const res = run([fsl[0]], {});
    const v = E.validateFAL(res, { ctx: ctx(), fsl: fsl });
    assert.strictEqual(v.valid, false);
    assert.ok(v.blocking.some(b => b.code === 'EMPLOYEE_NOT_ALLOTTED'));
});

test('FAL validation: an employee allotted twice is a blocking error', () => {
    const fsl = [emp('01', 1)];
    const res = run(fsl, {});
    const tampered = { allocations: res.allocations.concat(res.allocations.map(a => Object.assign({}, a))), exceptions: [] };
    const v = E.validateFAL(tampered, { ctx: ctx(), fsl: fsl });
    assert.ok(v.blocking.some(b => b.code === 'EMPLOYEE_ALLOTTED_TWICE'));
});

test('FAL validation: a cadre holding more than its FWS is a blocking error', () => {
    // A deliberately tight configuration: Krishna holds a single SI post.
    const strengths = [
        { category_id: 'CAT_SI', cadre_id: 'DC_KRISHNA', cadre_strength: 1, fws: 1, status: 'ACTIVE' },
        { category_id: 'CAT_SI', cadre_id: 'DC_NTR', cadre_strength: 5, fws: 5, status: 'ACTIVE' },
        { category_id: 'CAT_SI', cadre_id: 'DC_ELURU', cadre_strength: 0, fws: 0, status: 'ACTIVE' }
    ];
    const c = E.poBuildContext({ categories: CATEGORIES, cadres: CADRES, strengths: strengths, approved: [] });
    const fsl = [emp('01', 1), emp('02', 2), emp('03', 3)];
    const res = E.runAllocation({ ctx: c, fsl: fsl, options: opts({ '01': ['DC_KRISHNA'], '02': ['DC_NTR'], '03': ['DC_NTR'] }) });
    assert.strictEqual(res.allocations.filter(a => a.cadre_id === 'DC_KRISHNA').length, 1);

    // Force a second allotment into the single-post cadre.
    const donor = res.allocations.find(a => a.cadre_id === 'DC_NTR');
    const tampered = {
        allocations: res.allocations.map(a => a === donor
            ? Object.assign({}, a, { cadre_id: 'DC_KRISHNA', cadre_name: 'Krishna District (Residuary)' })
            : a),
        exceptions: []
    };
    const v = E.validateFAL(tampered, { ctx: c, fsl: fsl });
    assert.ok(v.blocking.some(b => b.code === 'FWS_EXCEEDED'), JSON.stringify(v.blocking));
});

test('FAL validation: allotment to a cadre not configured for the category is blocking', () => {
    // Eluru has no PC post, so a PC may not be allotted there at all.
    const fsl = [emp('01', 1, { category_id: 'CAT_PC', rank_code: 'PC' })];
    const res = run(fsl, {});
    const tampered = {
        allocations: res.allocations.map(a => Object.assign({}, a, { cadre_id: 'DC_ELURU', cadre_name: 'Eluru District' })),
        exceptions: []
    };
    const v = E.validateFAL(tampered, { ctx: ctx(), fsl: fsl });
    assert.ok(v.blocking.some(b => b.code === 'INVALID_CADRE_ALLOTMENT'));
});

test('FAL validation: an allotment without a reason is a blocking error', () => {
    const fsl = [emp('01', 1)];
    const res = run(fsl, {});
    const tampered = { allocations: res.allocations.map(a => Object.assign({}, a, { allocation_reason: '' })), exceptions: [] };
    const v = E.validateFAL(tampered, { ctx: ctx(), fsl: fsl });
    assert.ok(v.blocking.some(b => b.code === 'REASON_MISSING'));
});

test('FAL validation: compulsory and no-option allotments are reported as warnings, not silently hidden', () => {
    const fsl = [emp('01', 1), emp('02', 2)];
    const res = run(fsl, opts({ '01': ['DC_ELURU'], '02': ['DC_ELURU'] }));
    const v = E.validateFAL(res, { ctx: ctx(), fsl: fsl });
    assert.ok(v.warnings.some(w => w.code === 'COMPULSORY_DOCUMENTED'));
});

// ---------------------------------------------------------------------------
// 10. FSL analysis - the four strengths are distinct
// ---------------------------------------------------------------------------

test('analysis: FWS, current working strength, FSL count and allocable strength are reported separately', () => {
    const fsl = [
        emp('01', 1, { present_local_cadre_id: 'DC_KRISHNA' }),
        emp('02', 2, { present_local_cadre_id: 'DC_KRISHNA' }),
        emp('03', 3, { present_local_cadre_id: 'DC_NTR' })
    ];
    const a = E.analyseFSL(fsl, { ctx: ctx(), options: opts({ '01': ['DC_KRISHNA'] }) });
    const si = a.N_strength.find(n => n.category_id === 'CAT_SI');
    assert.strictEqual(si.fws_total, 7);
    assert.strictEqual(si.fsl_employee_count, 3);
    assert.strictEqual(si.current_working_strength, 3);
    assert.strictEqual(si.allocable_strength, 4);
    assert.strictEqual(a.M_withOptions, 1);
    assert.strictEqual(a.L_noOptionCount, 2);
});

test('analysis: reserved groups and deputation counts are reported', () => {
    const fsl = [
        emp('01', 1, { sc_group: 'SC_1' }),
        emp('02', 2, { sc_group: 'ST' }),
        emp('03', 3, { service_status: 'DEPUTATION', deputation_unit: 'CID A.P.' })
    ];
    const a = E.analyseFSL(fsl, { ctx: ctx(), options: {} });
    assert.strictEqual(a.F_sc_group_1, 1);
    assert.strictEqual(a.I_st, 1);
    assert.strictEqual(a.K_deputation.total_on_deputation, 1);
    assert.strictEqual(a.total, 3);
});

// ---------------------------------------------------------------------------
// 11. Stage machine shape
// ---------------------------------------------------------------------------

test('stages: 21 states, strictly ordered, with no gaps', () => {
    assert.strictEqual(E.PO_STAGES.length, 21);
    assert.strictEqual(E.PO_STAGES[0], 'DRAFT');
    assert.strictEqual(E.PO_STAGES[E.PO_STAGES.length - 1], 'EXERCISE_CLOSED');
    E.PO_STAGES.forEach((s, i) => assert.strictEqual(E.PO_STAGE_INDEX[s], i));
});

test('stages: the workflow order matches para 22', () => {
    const expected = ['DRAFT', 'CADRE_CONFIGURED', 'WORKING_STRENGTH_FINALIZED', 'DSL_UPLOADED', 'DSL_VALIDATED',
        'DSL_PUBLISHED', 'FSL_FINALIZED', 'FSL_PUBLISHED', 'OPTIONS_OPEN', 'OPTIONS_CLOSED',
        'ALLOCATION_RUNNING', 'ALLOCATION_VALIDATED', 'FAL_GENERATED', 'FAL_APPROVED', 'FAL_PUBLISHED',
        'OOA_GENERATED', 'OOA_ISSUED', 'OOT_GENERATED', 'OOT_ISSUED', 'JOINING_COMPLETED', 'EXERCISE_CLOSED'];
    assert.deepStrictEqual(E.PO_STAGES, expected);
});

test('reserved percentages default to the values prescribed by the order', () => {
    const m = {};
    E.PO_SEG_GROUPS.forEach(g => { m[g.id] = g.percent; });
    assert.deepStrictEqual(m, { SC_1: 1, SC_2: 6.5, SC_3: 7.5, ST: 6 });
});

test('preferential priority order matches the order', () => {
    assert.deepStrictEqual(E.PO_PREF_CLAIMS.map(c => c.id),
        ['pwbd', 'disabled_children', 'widow', 'cancer', 'neurosurgery', 'kidney', 'liver', 'heart']);
});

test('preferential priorities are strictly increasing', () => {
    E.PO_PREF_CLAIMS.forEach((c, i) => {
        if (i > 0) assert.ok(c.priority > E.PO_PREF_CLAIMS[i - 1].priority);
    });
});
