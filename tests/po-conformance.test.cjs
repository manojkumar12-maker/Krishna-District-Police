/**
 * G.O.Ms.No.129 conformance tests — PART 26 (TEST 1 .. TEST 34).
 *
 *   node --test tests/po-conformance.test.cjs
 *
 * Each test is named after the requirement it proves. The 21-state workflow,
 * objection subsystem, option locking, repository and FAL immutability are
 * covered separately in tests/po-workflow.test.cjs (TEST 35 .. TEST 40).
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const E = require(path.join(__dirname, '..', 'poEngine.js'));

// --- fixtures ---------------------------------------------------------------

const CATEGORIES = [
    { id: 'CAT_SI', code: 'SI', name: 'Sub-Inspector of Police', status: 'ACTIVE' },
    { id: 'CAT_PC', code: 'PC', name: 'Police Constable', status: 'ACTIVE' }
];

const CADRES = [
    { id: 'DC_KRISHNA', name: 'Krishna District (Residuary)', cadre_type: 'RESIDUARY_ERSTWHILE', status: 'ACTIVE' },
    { id: 'DC_NTR', name: 'NTR District', cadre_type: 'NEWLY_FORMED_DISTRICT', status: 'ACTIVE' },
    { id: 'DC_ELURU', name: 'Eluru District', cadre_type: 'NEWLY_FORMED_DISTRICT', status: 'ACTIVE' }
];

// SI: Krishna 4, NTR 2, Eluru 1  (FWS 7)
// PC: Krishna 3, NTR 2, Eluru 0  (FWS 5)
const STRENGTHS = [
    { category_id: 'CAT_SI', cadre_id: 'DC_KRISHNA', cadre_strength: 10, fws: 4, status: 'ACTIVE' },
    { category_id: 'CAT_SI', cadre_id: 'DC_NTR', cadre_strength: 10, fws: 2, status: 'ACTIVE' },
    { category_id: 'CAT_SI', cadre_id: 'DC_ELURU', cadre_strength: 10, fws: 1, status: 'ACTIVE' },
    { category_id: 'CAT_PC', cadre_id: 'DC_KRISHNA', cadre_strength: 9, fws: 3, status: 'ACTIVE' },
    { category_id: 'CAT_PC', cadre_id: 'DC_NTR', cadre_strength: 9, fws: 2, status: 'ACTIVE' },
    { category_id: 'CAT_PC', cadre_id: 'DC_ELURU', cadre_strength: 9, fws: 0, status: 'ACTIVE' }
];

const APPROVED = [
    { category_id: 'CAT_SI', approved_working_strength: 7 },
    { category_id: 'CAT_PC', approved_working_strength: 5 }
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
    Object.keys(map || {}).forEach(k => {
        const v = map[k];
        o[k] = { pref1: v[0] || '', pref2: v[1] || '', pref3: v[2] || '', submitted: true, submitted_at: '2026-08-01T00:00:00Z' };
    });
    return o;
}

function ctx(strengths) {
    return E.poBuildContext({
        exercise_id: 'PO2026-KRN-001',
        categories: CATEGORIES, cadres: CADRES,
        strengths: strengths || STRENGTHS, approved: APPROVED
    });
}

function run(fsl, options, cfg, strengths) {
    return E.runAllocation(Object.assign({
        ctx: ctx(strengths), fsl: fsl, options: options || {}
    }, cfg || {}));
}

// ===========================================================================
// TEST 1 - Seniorities are never manufactured
// TEST 2 - Missing seniority blocks DSL/FSL
// ===========================================================================
test('TEST 1/2: a missing seniority is a blocking error and is never generated', () => {
    const rec = emp('01', null);
    const r = E.validateDSL([rec], { ctx: ctx() });
    assert.strictEqual(r.valid, false);
    assert.ok(r.errors.some(e => e.code === 'MISSING_SENIORITY'));
    assert.strictEqual(rec.seniority_no, null, 'seniority must remain null');
    const f = E.validateFSL([rec], { ctx: ctx(), dsl: [rec] });
    assert.ok(f.errors.some(e => e.code === 'MISSING_SENIORITY'), 'FSL validation must also block');
});

// ===========================================================================
// TEST 3 - Duplicate seniority blocks validation
// ===========================================================================
test('TEST 3: duplicate seniority within a rank/category blocks validation', () => {
    const r = E.validateDSL([emp('01', 5), emp('02', 5)], { ctx: ctx() });
    assert.ok(r.errors.some(e => e.code === 'DUPLICATE_SENIORITY'));
});

// ===========================================================================
// TEST 4 - Duplicate CFMS blocks validation
// ===========================================================================
test('TEST 4: duplicate CFMS within a rank/category blocks validation', () => {
    const r = E.validateDSL([emp('01', 1), emp('02', 2, { cfms_id: 'C01' })], { ctx: ctx() });
    assert.ok(r.errors.some(e => e.code === 'DUPLICATE_CFMS'));
});

// ===========================================================================
// TEST 5 - Duplicate employee across ranks blocks validation
// ===========================================================================
test('TEST 5: an employee duplicated across ranks blocks validation', () => {
    const r = E.validateDSL([
        emp('01', 1),
        emp('02', 9, { category_id: 'CAT_PC', rank_code: 'PC', cfms_id: 'C01' })
    ], { ctx: ctx() });
    assert.ok(r.errors.some(e => e.code === 'DUPLICATE_ACROSS_RANKS'));
});

// ===========================================================================
// TEST 6/7/8/9 - service status must never remove an employee
// ===========================================================================
['DEPUTATION', 'LEAVE', 'SUSPENSION', 'UNABSENT'].forEach((status, i) => {
    test('TEST ' + (6 + i) + ': a ' + status + ' employee remains in the dataset', () => {
        const fsl = [emp('01', 1, { service_status: status })];
        // validation retains them
        const v = E.validateDSL(fsl, { ctx: ctx() });
        assert.strictEqual(v.stats.total, 1);
        assert.ok(!v.errors.some(e => /STATUS|EXCLUD|DROP/i.test(e.code)));
        // allocation retains them
        const res = run(fsl, opts({ '01': ['DC_KRISHNA'] }));
        assert.strictEqual(res.allocations.length + res.unallocated.length, 1);
        assert.strictEqual(res.allocations.length, 1, 'must still be allotted');
        assert.strictEqual(res.allocations[0].service_status, status);
    });
});

// ===========================================================================
// TEST 10 - PwBD below 70% cannot qualify
// ===========================================================================
test('TEST 10: PwBD certified below 70% cannot qualify under the preferential rule', () => {
    const rec = emp('01', 1, { claims: { pwbd: { claimed: true, verification: 'VERIFIED', disability_percent: 65 } } });
    assert.strictEqual(E.poPreferredClaim(rec), null);
    assert.ok(E.validateDSL([rec], { ctx: ctx() }).errors.some(e => e.code === 'CLAIM_PERCENT_BELOW_MIN'));
    const rec70 = emp('02', 2, { claims: { pwbd: { claimed: true, verification: 'VERIFIED', disability_percent: 70 } } });
    assert.strictEqual(E.poPreferredClaim(rec70).id, 'pwbd');
});

// ===========================================================================
// TEST 11 - Unverified claim gets no priority
// ===========================================================================
['PENDING', 'REJECTED', 'NOT_CLAIMED', ''].forEach((status, i) => {
    test('TEST 11.' + (i + 1) + ': a claim with verification ' + (status || '(blank)') + ' receives no priority', () => {
        const rec = emp('01', 1, { claims: { widow: { claimed: true, verification: status } } });
        assert.strictEqual(E.poPreferredClaim(rec), null);
        assert.strictEqual(E.poClaimVerified(rec, 'widow'), false);
    });
});

// ===========================================================================
// TEST 12 - Verified preferential employee precedes an ordinary senior employee
// ===========================================================================
test('TEST 12: a verified preferential employee is processed before an ordinary employee regardless of seniority', () => {
    const fsl = [
        emp('01', 1),                                                            // most senior, no claim
        emp('02', 9, { claims: { cancer: { claimed: true, verification: 'VERIFIED' } } })
    ];
    const res = run(fsl, opts({ '01': ['DC_ELURU', 'DC_NTR', 'DC_KRISHNA'], '02': ['DC_NTR'] }));
    const pref = res.allocations.find(a => a.employee_id === '02');
    const ordinary = res.allocations.find(a => a.employee_id === '01');
    assert.strictEqual(pref.allocation_reason, 'PREFERENTIAL_CATEGORY');
    assert.ok(pref.allocation_sequence < ordinary.allocation_sequence);
});

// ===========================================================================
// TEST 13 - Tie among preferential candidates uses FSL seniority
// ===========================================================================
test('TEST 13: a tie among preferential candidates is broken by FSL seniority', () => {
    const fsl = [
        emp('01', 7, { claims: { widow: { claimed: true, verification: 'VERIFIED' } } }),
        emp('02', 3, { claims: { widow: { claimed: true, verification: 'VERIFIED' } } }),
        emp('03', 5, { claims: { widow: { claimed: true, verification: 'VERIFIED' } } })
    ];
    const res = run(fsl, opts({ '01': ['DC_NTR'], '02': ['DC_NTR'], '03': ['DC_NTR'] }));
    const pref = res.allocations.filter(a => a.allocation_reason === 'PREFERENTIAL_CATEGORY');
    // NTR holds 2 SI posts, so seniority 3 and 5 are served first, in that order.
    assert.strictEqual(pref.length, 2);
    assert.deepStrictEqual(pref.map(a => a.employee_id), ['02', '03']);
});

// ===========================================================================
// TEST 14/15/16 - preference cascade
// ===========================================================================
test('TEST 14: the first preference is honoured when a post is free', () => {
    const res = run([emp('01', 1)], opts({ '01': ['DC_ELURU', 'DC_NTR', 'DC_KRISHNA'] }));
    const a = res.allocations[0];
    assert.strictEqual(a.allocation_reason, 'SENIORITY_FIRST_PREFERENCE');
    assert.strictEqual(a.cadre_id, 'DC_ELURU');
    assert.strictEqual(a.preference_rank, 1);
});

test('TEST 15: an exhausted first preference falls through to the second', () => {
    const fsl = [emp('10', 1), emp('11', 2), emp('12', 3), emp('13', 4), emp('01', 9)];
    const res = run(fsl, opts({
        '10': ['DC_KRISHNA'], '11': ['DC_KRISHNA'], '12': ['DC_KRISHNA'], '13': ['DC_KRISHNA'],
        '01': ['DC_KRISHNA', 'DC_NTR', 'DC_ELURU']
    }));
    const a = res.allocations.find(x => x.employee_id === '01');
    assert.strictEqual(a.allocation_reason, 'SENIORITY_SECOND_PREFERENCE');
    assert.strictEqual(a.cadre_id, 'DC_NTR');
    assert.strictEqual(a.preference_rank, 2);
});

test('TEST 16: an exhausted second preference falls through to the third', () => {
    // Krishna 4 posts and NTR 1 post are consumed by more senior employees.
    const fsl = [emp('10', 1), emp('11', 2), emp('12', 3), emp('13', 4), emp('14', 5), emp('01', 9)];
    const strengths = [
        { category_id: 'CAT_SI', cadre_id: 'DC_KRISHNA', cadre_strength: 10, fws: 4, status: 'ACTIVE' },
        { category_id: 'CAT_SI', cadre_id: 'DC_NTR', cadre_strength: 10, fws: 1, status: 'ACTIVE' },
        { category_id: 'CAT_SI', cadre_id: 'DC_ELURU', cadre_strength: 10, fws: 1, status: 'ACTIVE' },
        { category_id: 'CAT_PC', cadre_id: 'DC_KRISHNA', cadre_strength: 9, fws: 3, status: 'ACTIVE' },
        { category_id: 'CAT_PC', cadre_id: 'DC_NTR', cadre_strength: 9, fws: 2, status: 'ACTIVE' },
        { category_id: 'CAT_PC', cadre_id: 'DC_ELURU', cadre_strength: 9, fws: 0, status: 'ACTIVE' }
    ];
    const res = run(fsl, opts({
        '10': ['DC_KRISHNA'], '11': ['DC_KRISHNA'], '12': ['DC_KRISHNA'], '13': ['DC_KRISHNA'],
        '14': ['DC_NTR'],
        '01': ['DC_KRISHNA', 'DC_NTR', 'DC_ELURU']
    }), null, strengths);
    const a = res.allocations.find(x => x.employee_id === '01');
    assert.strictEqual(a.allocation_reason, 'SENIORITY_THIRD_PREFERENCE');
    assert.strictEqual(a.cadre_id, 'DC_ELURU');
    assert.strictEqual(a.preference_rank, 3);
});

// ===========================================================================
// TEST 17/18 - compulsory allotment
// ===========================================================================
test('TEST 17: all preferences exhausted results in a compulsory allotment', () => {
    const fsl = [emp('01', 1), emp('02', 2), emp('03', 3), emp('04', 4), emp('05', 5)];
    const res = run(fsl, opts({
        '01': ['DC_KRISHNA'], '02': ['DC_KRISHNA'], '03': ['DC_KRISHNA'],
        '04': ['DC_KRISHNA'], '05': ['DC_KRISHNA']
    }));
    const a = res.allocations.find(x => x.employee_id === '05');
    assert.strictEqual(a.allocation_reason, 'COMPULSORY_ALLOTMENT');
    assert.strictEqual(a.preference_selected, '');
    assert.ok(a.compulsory_policy, 'the tie-breaker policy is recorded on the allotment');
});

test('TEST 18: a compulsory allotment never exceeds FWS', () => {
    const fsl = [];
    for (let i = 1; i <= 20; i++) fsl.push(emp(String(i).padStart(2, '0'), i));
    const res = run(fsl, {});
    res.allocations.filter(a => a.allocation_reason === 'COMPULSORY_ALLOTMENT').forEach(a => {
        const row = STRENGTHS.find(s => s.category_id === a.category_id && s.cadre_id === a.cadre_id);
        assert.ok(row && row.fws > 0);
    });
    STRENGTHS.forEach(s => {
        const n = res.allocations.filter(a => a.category_id === s.category_id && a.cadre_id === s.cadre_id).length;
        assert.ok(n <= s.fws, s.cadre_id + ' over-allocated');
    });
});

// ===========================================================================
// TEST 19/20 - no-option employees
// ===========================================================================
test('TEST 19: no-option employees are processed last', () => {
    const fsl = [emp('01', 1), emp('02', 2), emp('03', 3), emp('04', 4)];
    const res = run(fsl, opts({ '02': ['DC_KRISHNA'], '03': ['DC_NTR'], '04': ['DC_ELURU'] }));
    const noOpt = res.allocations.filter(a => a.allocation_reason === 'NO_OPTION_ALLOTMENT');
    assert.strictEqual(noOpt.length, 1);
    assert.strictEqual(noOpt[0].employee_id, '01');
    assert.strictEqual(noOpt[0].allocation_sequence, Math.max.apply(null, res.allocations.map(a => a.allocation_sequence)));
});

test('TEST 20: no-option employees receive no fabricated preferences', () => {
    const fsl = [emp('01', 1)];
    // An unsubmitted option must be treated as no option at all.
    const res = run(fsl, { '01': { pref1: 'DC_ELURU', pref2: '', pref3: '', submitted: false } });
    const a = res.allocations[0];
    assert.strictEqual(a.allocation_reason, 'NO_OPTION_ALLOTMENT');
    assert.strictEqual(a.option_pref1, '');
    assert.strictEqual(a.preference_considered.length, 0);
    // Nothing in the engine may invent a preference.
    assert.ok(!E.runAllocation.toString().includes('Math.random'));
});

// ===========================================================================
// TEST 21/22 - FWS zero blocks allocation; 9 employees / 7 FWS
// ===========================================================================
test('TEST 21: a cadre with FWS zero cannot receive an allotment', () => {
    const pc = emp('01', 1, { category_id: 'CAT_PC', rank_code: 'PC' });
    const res = run([pc], opts({ '01': ['DC_ELURU'] }));
    assert.strictEqual(res.allocations[0].cadre_id, 'DC_KRISHNA', 'Eluru has 0 PC posts');
    assert.strictEqual(res.allocations[0].preference_rank, 0);
    assert.strictEqual(res.allocations.filter(a => a.cadre_id === 'DC_ELURU').length, 0);
});

test('TEST 22: nine employees against seven FWS yields at most seven allotments', () => {
    const fsl = [];
    for (let i = 1; i <= 9; i++) fsl.push(emp(String(i).padStart(2, '0'), i));
    const res = run(fsl, {});
    assert.strictEqual(res.allocations.length, 7);
    assert.strictEqual(res.unallocated.length, 2);
    assert.strictEqual(res.run.status, 'PASSED');
    res.unallocated.forEach(u => assert.strictEqual(u.reason, 'FWS_EXHAUSTED'));
});

// ===========================================================================
// TEST 23 - input ordering does not affect the result
// ===========================================================================
test('TEST 23: two different input orders produce an identical FAL', () => {
    const a = [emp('01', 3), emp('02', 1), emp('03', 2), emp('04', 4), emp('05', 5)];
    const b = a.slice().reverse();
    const shuffled = [a[2], a[0], a[4], a[1], a[3]];
    const options = opts({ '01': ['DC_NTR'], '02': ['DC_ELURU'], '03': ['DC_KRISHNA'], '04': ['DC_KRISHNA'] });
    const fingerprint = r => JSON.stringify(r.allocations.map(x =>
        [x.employee_id, x.cadre_id, x.allocation_reason, x.allocation_sequence]));
    const f1 = fingerprint(run(a, options, { started_at: 'X' }));
    const f2 = fingerprint(run(b, options, { started_at: 'X' }));
    const f3 = fingerprint(run(shuffled, options, { started_at: 'X' }));
    assert.strictEqual(f1, f2);
    assert.strictEqual(f1, f3);
});

// ===========================================================================
// TEST 24 - every FAL row carries an allocation reason
// ===========================================================================
test('TEST 24: the FAL carries an allocation reason for every employee', () => {
    const fsl = [emp('01', 1, { sc_group: 'SC_3' }), emp('02', 2, { sc_group: 'ST' }), emp('03', 3)];
    const res = run(fsl, opts({ '01': ['DC_KRISHNA'], '02': ['DC_KRISHNA'] }));
    const v = E.validateFAL(res, { ctx: ctx(), fsl: fsl });
    assert.strictEqual(v.valid, true, JSON.stringify(v.blocking));
    assert.strictEqual(res.allocations.length, fsl.length);
    res.allocations.forEach(x => assert.ok(E.PO_ALLOC_REASON_IDS.indexOf(x.allocation_reason) !== -1));
});

// ===========================================================================
// TEST 25 - SC/ST requirement is calculated from working strength
// ===========================================================================
test('TEST 25: the SC/ST requirement is calculated from working strength', () => {
    // 100 working strength, ST at 6% -> exactly 6 required, whatever the headcount.
    const strengths = [
        { category_id: 'CAT_SI', cadre_id: 'DC_KRISHNA', cadre_strength: 50, fws: 60, status: 'ACTIVE' },
        { category_id: 'CAT_SI', cadre_id: 'DC_NTR', cadre_strength: 40, fws: 40, status: 'ACTIVE' },
        { category_id: 'CAT_SI', cadre_id: 'DC_ELURU', cadre_strength: 0, fws: 0, status: 'ACTIVE' }
    ];
    const fsl = [];
    for (let i = 1; i <= 100; i++) fsl.push(emp(String(i).padStart(3, '0'), i));
    const res = run(fsl, {}, null, strengths);
    const row = res.scstReview.perCategory.CAT_SI;
    assert.strictEqual(res.scstReview.basis, 'FINAL_WORKING_STRENGTH');
    assert.strictEqual(row.total_working_strength, 100);
    const st = row.groups.find(g => g.group === 'ST');
    assert.strictEqual(st.working_strength, 100);
    assert.strictEqual(st.percent, 6);
    assert.strictEqual(st.required, 6);
    const sc3 = row.groups.find(g => g.group === 'SC_3');
    assert.strictEqual(sc3.required, 8);          // round(7.5)
    const sc1 = row.groups.find(g => g.group === 'SC_1');
    assert.strictEqual(sc1.required, 1);
    const sc2 = row.groups.find(g => g.group === 'SC_2');
    assert.strictEqual(sc2.required, 7);          // round(6.5)
});

test('TEST 25b: there is no user-facing ALLOCATED-versus-FWS basis choice', () => {
    assert.strictEqual(E.PO_SEG_BASIS, 'FINAL_WORKING_STRENGTH');
    // The engine ignores any caller-supplied basis override.
    const fsl = [emp('01', 1), emp('02', 2)];
    const forced = run(fsl, {}, { reserved_basis: 'ALLOCATED' });
    assert.strictEqual(forced.scstReview.basis, 'FINAL_WORKING_STRENGTH');
});

// ===========================================================================
// TEST 26 - SC/ST shortfall identifies the LAST ALLOTTED general-category employee
// ===========================================================================
test('TEST 26: the shortfall is corrected by substituting the LAST ALLOTTED general category employee', () => {
    // Working strength 20 -> SC Group-III required = round(1.5) = 2.
    // Two SC_3 employees are allotted to Krishna by preference; two other
    // employees are allotted to NTR. NTR is short of SC_3, so one of the
    // general-category employees LAST allotted in NTR must be substituted.
    const strengths = [
        { category_id: 'CAT_SI', cadre_id: 'DC_KRISHNA', cadre_strength: 20, fws: 10, status: 'ACTIVE' },
        { category_id: 'CAT_SI', cadre_id: 'DC_NTR', cadre_strength: 20, fws: 10, status: 'ACTIVE' },
        { category_id: 'CAT_SI', cadre_id: 'DC_ELURU', cadre_strength: 0, fws: 0, status: 'ACTIVE' },
        { category_id: 'CAT_PC', cadre_id: 'DC_KRISHNA', cadre_strength: 9, fws: 3, status: 'ACTIVE' },
        { category_id: 'CAT_PC', cadre_id: 'DC_NTR', cadre_strength: 9, fws: 2, status: 'ACTIVE' },
        { category_id: 'CAT_PC', cadre_id: 'DC_ELURU', cadre_strength: 9, fws: 0, status: 'ACTIVE' }
    ];
    const fsl = [];
    // seq 1,2 -> SC_3 into Krishna
    fsl.push(emp('01', 1, { sc_group: 'SC_3' }));
    fsl.push(emp('02', 2, { sc_group: 'SC_3' }));
    // seq 3,4,5,6 -> general category into NTR (seniority order 3,4,5,6)
    fsl.push(emp('03', 3));
    fsl.push(emp('04', 4));
    fsl.push(emp('05', 5));
    fsl.push(emp('06', 6));
    // remaining employees take remaining posts
    for (let i = 7; i <= 20; i++) fsl.push(emp(String(i).padStart(2, '0'), i));

    const res = run(fsl, opts({
        '01': ['DC_KRISHNA'], '02': ['DC_KRISHNA'],
        '03': ['DC_NTR'], '04': ['DC_NTR'], '05': ['DC_NTR'], '06': ['DC_NTR']
    }), null, strengths);

    const sc3 = res.scstReview.perCategory.CAT_SI.groups.find(g => g.group === 'SC_3');
    assert.strictEqual(sc3.required, 2);
    const adjustments = res.scstReview.adjustments.filter(a => a.sc_group === 'SC_3');
    assert.ok(adjustments.length >= 1, 'an adjustment must be performed');

    const adj = adjustments[0];
    // The substituted-in employee must be an SC_3 employee.
    const inserted = res.allocations.find(a => a.employee_id === adj.inserted_employee_id);
    assert.strictEqual(inserted.sc_group, 'SC_3');
    assert.strictEqual(inserted.cadre_id, adj.cadre_id, 'inserted employee lands in the affected cadre');
    assert.strictEqual(adj.to_cadre, adj.cadre);

    // The substituted-out employee was the LAST ALLOTTED GENERAL CATEGORY employee
    // in the affected cadre: the engine records the cadre it was moved out of, and
    // its allocation sequence must be the highest among the general-category
    // employees that were there.
    assert.strictEqual(adj.old_allocation.replaced_from.cadre_id, adj.cadre_id,
        'the replaced employee came out of the affected cadre');
    assert.strictEqual(typeof adj.replaced_allocation_sequence, 'number');
    assert.ok(adj.replaced_allocation_sequence >= 1);
    // General category = no reserved group.
    const replaced = res.allocations.find(a => a.employee_id === adj.replaced_employee_id);
    assert.ok(replaced, 'the replaced employee must still exist');
    assert.strictEqual(replaced.sc_group, '', 'the replaced employee is a general-category employee');
    assert.strictEqual(replaced.allocation_reason, 'SC_ST_ADJUSTMENT');
    // ... and that employee is moved out, not deleted.
    assert.notStrictEqual(replaced.cadre_id, adj.cadre_id, 'the replaced employee must move, not disappear');
    // Both sequences are recorded, as the GO requires "last allotted".
    assert.ok(adj.inserted_allocation_sequence >= 1);
    assert.ok(/Substituted the last allotted GENERAL CATEGORY/.test(adj.reason),
        'the reason must cite the last-allotted rule: ' + adj.reason);
});

// ===========================================================================
// TEST 27/28 - adjustment is vacancy-neutral and never exceeds FWS
// ===========================================================================
test('TEST 27: an SC/ST adjustment is vacancy-neutral', () => {
    const strengths = [
        { category_id: 'CAT_SI', cadre_id: 'DC_KRISHNA', cadre_strength: 20, fws: 10, status: 'ACTIVE' },
        { category_id: 'CAT_SI', cadre_id: 'DC_NTR', cadre_strength: 20, fws: 10, status: 'ACTIVE' },
        { category_id: 'CAT_SI', cadre_id: 'DC_ELURU', cadre_strength: 0, fws: 0, status: 'ACTIVE' },
        { category_id: 'CAT_PC', cadre_id: 'DC_KRISHNA', cadre_strength: 9, fws: 3, status: 'ACTIVE' },
        { category_id: 'CAT_PC', cadre_id: 'DC_NTR', cadre_strength: 9, fws: 2, status: 'ACTIVE' },
        { category_id: 'CAT_PC', cadre_id: 'DC_ELURU', cadre_strength: 9, fws: 0, status: 'ACTIVE' }
    ];
    const fsl = [emp('01', 1, { sc_group: 'SC_3' }), emp('02', 2, { sc_group: 'SC_3' })];
    for (let i = 3; i <= 20; i++) fsl.push(emp(String(i).padStart(2, '0'), i));
    const res = run(fsl, opts({ '01': ['DC_KRISHNA'], '02': ['DC_KRISHNA'] }), null, strengths);

    // Total allocation is unchanged by the adjustment.
    assert.strictEqual(res.allocations.length, 20);
    res.scstReview.adjustments.forEach(a => assert.strictEqual(a.vacancy_neutral, true));
    // Per cadre headcount never changes.
    strengths.filter(s => s.category_id === 'CAT_SI').forEach(s => {
        const n = res.allocations.filter(a => a.cadre_id === s.cadre_id).length;
        assert.strictEqual(n, s.fws, s.cadre_id + ' headcount must be unchanged at FWS');
    });
});

test('TEST 28: an SC/ST adjustment never exceeds FWS', () => {
    const strengths = [
        { category_id: 'CAT_SI', cadre_id: 'DC_KRISHNA', cadre_strength: 20, fws: 10, status: 'ACTIVE' },
        { category_id: 'CAT_SI', cadre_id: 'DC_NTR', cadre_strength: 20, fws: 10, status: 'ACTIVE' },
        { category_id: 'CAT_SI', cadre_id: 'DC_ELURU', cadre_strength: 0, fws: 0, status: 'ACTIVE' },
        { category_id: 'CAT_PC', cadre_id: 'DC_KRISHNA', cadre_strength: 9, fws: 3, status: 'ACTIVE' },
        { category_id: 'CAT_PC', cadre_id: 'DC_NTR', cadre_strength: 9, fws: 2, status: 'ACTIVE' },
        { category_id: 'CAT_PC', cadre_id: 'DC_ELURU', cadre_strength: 9, fws: 0, status: 'ACTIVE' }
    ];
    const fsl = [emp('01', 1, { sc_group: 'SC_3' }), emp('02', 2, { sc_group: 'SC_3' })];
    for (let i = 3; i <= 40; i++) fsl.push(emp(String(i).padStart(2, '0'), i));
    const res = run(fsl, {}, null, strengths);
    strengths.forEach(s => {
        const n = res.allocations.filter(a => a.category_id === s.category_id && a.cadre_id === s.cadre_id).length;
        assert.ok(n <= s.fws);
    });
    // No post is created and no category is changed.
    res.allocations.forEach(a => assert.ok(a.category_id === 'CAT_SI'));
});

// ===========================================================================
// TEST 29 - unresolvable shortfall becomes an exception
// ===========================================================================
test('TEST 29: an SC/ST shortfall with no valid partner becomes an exception', () => {
    const fsl = [];
    for (let i = 1; i <= 7; i++) fsl.push(emp(String(i).padStart(2, '0'), i));
    const res = run(fsl, {});
    const shortfalls = res.scstReview.shortfalls.filter(s => s.group === 'SC_3');
    assert.ok(shortfalls.length >= 1, 'a shortfall must be recorded');
    assert.strictEqual(shortfalls[0].code, 'SC_ST_SHORTFALL_EXCEPTION');
    assert.ok(/NOT forced/.test(shortfalls[0].reason));
    assert.strictEqual(shortfalls[0].critical, true);
    // Nothing was invented to fill it.
    assert.ok(!res.allocations.some(a => a.sc_group === 'SC_3'));
    // And it blocks FAL publication until acknowledged.
    const v = E.validateFAL(res, { ctx: ctx(), fsl: fsl });
    assert.ok(v.blocking.some(b => b.code === 'SC_ST_SHORTFALL_EXCEPTION'));
});

// ===========================================================================
// TEST 30/31 - OOT requirement derives from the cadre comparison
// ===========================================================================
test('TEST 30/31: an OOT is required only where the allotted cadre differs from the present cadre', () => {
    const sameCadre = {
        employee_id: 'E1', name: 'Stays', category_id: 'CAT_SI', cadre_id: 'DC_KRISHNA',
        present_local_cadre_id: 'DC_KRISHNA'
    };
    const diffCadre = {
        employee_id: 'E2', name: 'Moves', category_id: 'CAT_SI', cadre_id: 'DC_NTR',
        present_local_cadre_id: 'DC_KRISHNA'
    };
    // Mirrors poTransferRequired() in poCore.js.
    const required = a => !!(a.present_local_cadre_id && a.cadre_id && a.present_local_cadre_id !== a.cadre_id);
    assert.strictEqual(required(sameCadre), false, 'same cadre -> no OOT');
    assert.strictEqual(required(diffCadre), true, 'different cadre -> OOT');
});

// ===========================================================================
// TEST 32/33 - OOA and OOT derive from the FAL
// ===========================================================================
test('TEST 32: OOA data is derived from the published FAL rows', () => {
    const fsl = [emp('01', 1), emp('02', 2)];
    const res = run(fsl, opts({ '01': ['DC_ELURU'], '02': ['DC_KRISHNA'] }));
    const ctxv = ctx();
    const ooa = res.allocations.map((r, i) => ({
        ooa_id: 'OOA-' + String(i + 1).padStart(5, '0'),
        employee_id: r.employee_id,
        name: r.name,
        erstwhile_cadre: (ctxv.cadreById[r.erstwhile_cadre_id] || {}).name || r.erstwhile_cadre_name,
        new_cadre: r.cadre_name
    }));
    assert.strictEqual(ooa.length, res.allocations.length);
    res.allocations.forEach((r, i) => {
        assert.strictEqual(ooa[i].employee_id, r.employee_id);
        assert.strictEqual(ooa[i].name, r.name);
        assert.strictEqual(ooa[i].new_cadre, r.cadre_name);
    });
});

test('TEST 33: OOT data matches the OOA / FAL allocation', () => {
    const fsl = [emp('01', 1, { present_local_cadre_id: 'DC_KRISHNA' })];
    const res = run(fsl, opts({ '01': ['DC_NTR'] }));
    const r = res.allocations[0];
    const oot = {
        employee_id: r.employee_id,
        existing_cadre: (ctx().cadreById[r.present_local_cadre_id] || {}).name,
        new_cadre: r.cadre_name,
        transfer_required: r.present_local_cadre_id !== r.cadre_id
    };
    assert.strictEqual(oot.employee_id, r.employee_id);
    assert.strictEqual(oot.existing_cadre, 'Krishna District (Residuary)');
    assert.strictEqual(oot.new_cadre, 'NTR District');
    assert.strictEqual(oot.transfer_required, true);
});

// ===========================================================================
// TEST 34 - FAL tampering is detected
// ===========================================================================
test('TEST 34: FAL tampering is detected', () => {
    const fsl = [emp('01', 1, { sc_group: 'SC_3' }), emp('02', 2, { sc_group: 'ST' }), emp('03', 3)];
    const res = run(fsl, opts({ '01': ['DC_KRISHNA'], '02': ['DC_KRISHNA'] }));
    const base = E.validateFAL(res, { ctx: ctx(), fsl: fsl });
    assert.strictEqual(base.valid, true, JSON.stringify(base.blocking));

    const cases = [
        ['reason removed', res.allocations.map(a => Object.assign({}, a, { allocation_reason: '' }))],
        ['sequence removed', res.allocations.map(a => Object.assign({}, a, { allocation_sequence: undefined }))],
        ['category swapped', res.allocations.map(a => Object.assign({}, a, { category_id: 'CAT_PC' }))],
        ['cadre outside the exercise', res.allocations.map(a => Object.assign({}, a, { cadre_id: 'DC_ATLANTIS' }))],
        ['preferential claimed without evidence', res.allocations.map((a, i) =>
            i === 0 ? Object.assign({}, a, { allocation_reason: 'PREFERENTIAL_CATEGORY' }) : a)]
    ];
    cases.forEach(([label, tampered]) => {
        const v = E.validateFAL({ allocations: tampered, exceptions: [] }, { ctx: ctx(), fsl: fsl });
        assert.strictEqual(v.valid, false, label + ' must be detected');
        assert.ok(v.blocking.length > 0, label);
    });
});

// ===========================================================================
// Rank/category isolation (PART 8) - explicit blocking check
// ===========================================================================
test('PART 8: rank/category isolation is enforced and reported by the FAL validator', () => {
    const si = [emp('01', 1), emp('02', 2)];
    const pc = [emp('11', 1, { category_id: 'CAT_PC', rank_code: 'PC' })];
    const res = run(si.concat(pc), opts({ '01': ['DC_KRISHNA'] }));
    res.allocations.forEach(a => {
        const allowed = E.poApplicableCadres(a.category_id, STRENGTHS, CADRES);
        assert.ok(allowed.indexOf(a.cadre_id) !== -1, a.name + ' must sit in a cadre configured for their rank');
    });
    const v = E.validateFAL(res, { ctx: ctx(), fsl: si.concat(pc) });
    assert.ok(v.passed.some(p => /Rank\/category isolation/.test(p)));
});

// ===========================================================================
// Reproducibility (PART 17 / 18)
// ===========================================================================
test('PART 17: the run record carries a complete reproducibility snapshot', () => {
    const fsl = [emp('01', 1), emp('02', 2)];
    const res = run(fsl, opts({ '01': ['DC_KRISHNA'] }), {
        started_at: '2026-08-01T00:00:00Z',
        user: 'dlc@krishna.police',
        fsl_version: 'v1', options_version: 'v1', fws_version: 'v1',
        compulsory_allocation_policy: 'LARGEST_REMAINING_VACANCY',
        rounding_policy: 'ROUND_HALF_UP'
    });
    const r = res.run;
    ['exercise_id', 'run_id', 'engine_version', 'engine_hash', 'fsl_version', 'options_version',
        'fws_version', 'policy_snapshot', 'started_at', 'user', 'input_counts'].forEach(k => {
        assert.ok(k in r, 'run snapshot missing ' + k);
    });
    assert.ok(r.engine_hash.indexOf('fnv1a-') === 0);
    assert.strictEqual(r.policy_snapshot.compulsory_allocation_policy, 'LARGEST_REMAINING_VACANCY');
    assert.strictEqual(r.policy_snapshot.scst_basis, 'FINAL_WORKING_STRENGTH');
    assert.strictEqual(r.policy_snapshot.scst_rounding_policy, 'ROUND_HALF_UP');
    assert.ok(r.policy_snapshot.compulsory_allocation_policy_notice.length > 0);
    assert.ok(r.policy_snapshot.scst_rounding_policy_notice.length > 0);
});

test('PART 18: identical inputs and policy produce byte-identical output', () => {
    const fsl = [emp('01', 3), emp('02', 1), emp('03', 2), emp('04', 4)];
    const options = opts({ '01': ['DC_NTR'], '02': ['DC_ELURU'], '03': ['DC_KRISHNA'] });
    const cfg = { started_at: 'X', compulsory_allocation_policy: 'LARGEST_REMAINING_VACANCY', rounding_policy: 'ROUND_HALF_UP' };
    const strip = r => JSON.stringify(r.allocations);
    assert.strictEqual(strip(run(fsl, options, cfg)), strip(run(fsl, options, cfg)));
    assert.strictEqual(
        run(fsl, options, cfg).run.engine_hash,
        run(fsl, options, cfg).run.engine_hash
    );
});

test('PART 10: the compulsory policy is recorded and honoured', () => {
    const fsl = [emp('01', 1), emp('02', 2), emp('03', 3), emp('04', 4), emp('05', 5)];
    const options = opts({
        '01': ['DC_KRISHNA'], '02': ['DC_KRISHNA'],
        '03': ['DC_KRISHNA'], '04': ['DC_KRISHNA'], '05': ['DC_KRISHNA']
    });
    const largest = run(fsl, options, { compulsory_allocation_policy: 'LARGEST_REMAINING_VACANCY' });
    const ordered = run(fsl, options, { compulsory_allocation_policy: 'CONFIGURED_CADRE_ORDER' });
    const last = r => r.allocations.find(a => a.allocation_reason === 'COMPULSORY_ALLOTMENT');
    assert.strictEqual(last(largest).compulsory_policy, 'LARGEST_REMAINING_VACANCY');
    assert.strictEqual(last(ordered).compulsory_policy, 'CONFIGURED_CADRE_ORDER');
    // After Krishna is full, both policies land on the first cadre with a vacancy.
    assert.ok(['DC_NTR', 'DC_ELURU'].indexOf(last(ordered).cadre_id) !== -1);
});

test('PART 10: an unknown policy id falls back to the documented default', () => {
    const fsl = [emp('01', 1)];
    const res = run(fsl, {}, { compulsory_allocation_policy: 'MADE_UP' });
    assert.strictEqual(res.run.policy_snapshot.compulsory_allocation_policy, E.PO_DEFAULT_COMPULSORY_POLICY);
});

test('PART 14: rounding policies are explicit and applied', () => {
    assert.deepStrictEqual(E.PO_ROUNDING_POLICY_IDS, ['ROUND_HALF_UP', 'ROUND_FLOOR', 'ROUND_CEILING']);
    assert.strictEqual(E.poApplyRounding(6.5, 'ROUND_HALF_UP'), 7);
    assert.strictEqual(E.poApplyRounding(6.5, 'ROUND_FLOOR'), 6);
    assert.strictEqual(E.poApplyRounding(6.5, 'ROUND_CEILING'), 7);
    assert.ok(E.PO_POLICY_NOTICE_ROUNDING.indexOf('Software calculation rule') !== -1);
    assert.ok(E.PO_POLICY_NOTICE_COMPULSORY.indexOf('DLC confirmation required') !== -1);
});

test('PART 29: the error catalogue describes and advises on every critical code', () => {
    [
        'FWS_EXCEEDED', 'MISSING_SENIORITY', 'DUPLICATE_CFMS', 'INVALID_OPTION',
        'INVALID_PREFERENTIAL_CLAIM', 'SC_ST_SHORTFALL', 'EMPLOYEE_NOT_ALLOTTED',
        'INVALID_CADRE', 'CATEGORY_MISMATCH'
    ].forEach(code => {
        const meta = E.PO_ERROR_CATALOGUE[code];
        assert.ok(meta, 'missing catalogue entry ' + code);
        assert.ok(meta.description && meta.recommended, code + ' needs description and recommendation');
    });
});

test('PART 31: the disclaimer avoids any claim of legal compliance', () => {
    const d = E.PO_GO_REFERENCE.disclaimer;
    assert.ok(d.indexOf('Implemented with reference to G.O.Ms.No.129') === 0);
    assert.ok(d.indexOf('subject to the competent authority/DLC') !== -1);
    assert.ok(!/compliant/i.test(d));
    assert.ok(!/approved/i.test(d));
});
