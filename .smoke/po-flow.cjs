// End-to-end workflow driver for the Presidential Order-2025 module.
// Walks all 19 states through real user actions and asserts the GO invariants
// hold at each gate. READ ONLY with respect to Cloudflare/D1: API is mocked.
//
//   node .smoke/po-flow.cjs
const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Chromium is located by playwright-core itself, so this driver runs on any
// machine. Set CHROME_PATH to pin a specific build, e.g.
//   CHROME_PATH=/path/to/chrome.exe node .smoke/po-flow.cjs
const CHROME = process.env.CHROME_PATH || undefined;
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const fail = [];
const ok = (label, cond, extra = '') => {
    console.log(`${cond ? '  PASS' : '  FAIL'}  ${label}${extra ? ' — ' + extra : ''}`);
    if (!cond) fail.push(label);
};

const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); return res.end('not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
});

// Silence window.confirm / window.prompt so the flow can be driven headlessly.
const DIALOG_AUTO = `
window.__prompts = [];
window.confirm = () => { window.__prompts.push('confirm'); return true; };
window.prompt = (m) => { window.__prompts.push('prompt:' + m); return window.__promptAnswer || ''; };
`;

// Launch with a diagnosable failure: a missing browser is the single most likely
// reason this driver fails on a fresh machine.
async function launchChromium() {
    try {
        return await chromium.launch({ executablePath: CHROME, headless: true });
    } catch (e) {
        if (CHROME) throw new Error('CHROME_PATH could not be launched: ' + e.message);
        throw new Error('No Chromium found. Run "npm install" then "npx playwright install chromium", or set CHROME_PATH.\n' + e.message);
    }
}

(async () => {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const SITE = `http://127.0.0.1:${server.address().port}/index.html`;

    const browser = await launchChromium();
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    const errs = [];
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

    await page.route('**/api/**', r => r.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [], personnel: [], sanctioned: [], deputation: [], auditlogs: [], total: 0 })
    }));
    await page.addInitScript(DIALOG_AUTO);
    await page.addInitScript(() => {
        localStorage.setItem('authToken', 'e2e.token');
        localStorage.setItem('userRole', 'ADMIN');
        localStorage.setItem('userEmail', 'dlc@krishna.police');
    });

    await page.goto(SITE, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);
    await page.evaluate(() => showPage('presidentialOrder'));
    await page.waitForTimeout(500);

    const r = async (fn, arg) => page.evaluate(fn, arg);
    const advance = () => r(() => { const res = poAdvance('e2e'); return { ok: res.ok, stage: poStage(), errors: res.guard.errors }; });

    console.log('\n[setup: narrow the module to two categories for a readable scenario]');
    const setup = await r(() => {
        poState.categories = [
            { id: 'CAT_SI', code: 'SI', name: 'Sub-Inspector of Police', status: 'ACTIVE', department: 'Police' },
            { id: 'CAT_PC', code: 'PC', name: 'Police Constable', status: 'ACTIVE', department: 'Police' }
        ];
        poSyncStrengthMatrix();
        poSave();
        return { cats: poState.categories.length, cadres: poState.cadres.length, strengths: poState.strengths.length };
    });
    ok('two categories configured', setup.cats === 2, JSON.stringify(setup));
    ok('three cadres retained', setup.cadres === 3, JSON.stringify(setup.cadres));

    console.log('\n[STEP 1 - DLC configuration is blocked while incomplete]');
    let g = await r(() => poStageGuard());
    ok('DRAFT cannot advance before the DLC is configured', !g.ok && g.errors.length > 0, g.errors[0]);

    await r(() => {
        const ex = poState.exercise;
        ex.exercise_id = 'PO2026-KRN-001';
        ex.department = 'Police';
        ex.erstwhile_district = 'Krishna';
        ex.new_districts = 'NTR, Eluru';
        // Only designations are official inputs; the nine seats are prescribed.
        poDlc().forEach((d, i) => {
            d.designation = ['District Collector', 'District Collector, NTR', 'District Collector, Eluru',
                'Superintendent of Police', 'SP, NTR', 'SP, Eluru',
                'Member', 'Co-Member', 'Co-Member'][i] || '';
        });
        poSaveExercise();
    });
    g = await r(() => poStageGuard());
    ok('DRAFT advances once the DLC is configured', g.ok, JSON.stringify(g.errors));

    console.log('\n[STEP 3 - working strength reconciliation blocks a mismatch]');
    s1 = await advance();
    ok('DRAFT -> CADRE_CONFIGURED', s1.ok && s1.stage === 'CADRE_CONFIGURED', s1.stage);

    g = await r(() => poStageGuard());
    ok('approved working strength must be entered before the step is reachable', !g.ok, g.errors[0]);

    await r(() => {
        poSetStrength('CAT_SI', 'DC_KRISHNA', 'cadre_strength', 10);
        poSetStrength('CAT_SI', 'DC_KRISHNA', 'fws', 4);
        poSetStrength('CAT_SI', 'DC_NTR', 'cadre_strength', 6);
        poSetStrength('CAT_SI', 'DC_NTR', 'fws', 2);
        poSetStrength('CAT_SI', 'DC_ELURU', 'cadre_strength', 3);
        poSetStrength('CAT_SI', 'DC_ELURU', 'fws', 1);
        poSetStrength('CAT_PC', 'DC_KRISHNA', 'cadre_strength', 9);
        poSetStrength('CAT_PC', 'DC_KRISHNA', 'fws', 3);
        poSetStrength('CAT_PC', 'DC_NTR', 'cadre_strength', 9);
        poSetStrength('CAT_PC', 'DC_NTR', 'fws', 2);
        poSetStrength('CAT_PC', 'DC_ELURU', 'cadre_strength', 9);
        poSetStrength('CAT_PC', 'DC_ELURU', 'fws', 0);
        poSetApprovedStrength('CAT_SI', 7);
        poSetApprovedStrength('CAT_PC', 6);   // deliberately wrong: total FWS is 5
    });
    s1 = await advance();
    ok('CADRE_CONFIGURED -> WORKING_STRENGTH_FINALIZED', s1.ok && s1.stage === 'WORKING_STRENGTH_FINALIZED', s1.stage);

    g = await r(() => poStageGuard());
    ok('reconciliation mismatch blocks the DSL stage (and the screen stays reachable)',
        !g.ok && /does not reconcile/.test(g.errors[0] || ''), g.errors[0]);

    await r(() => poSetApprovedStrength('CAT_PC', 5));
    g = await r(() => poStageGuard());
    ok('reconciled working strength unblocks the seniority-list stage', g.ok, JSON.stringify(g.errors));

    console.log('\n[STEP 3 - Seniority List: uploaded per cadre, seniority is never manufactured]');
    s1 = await advance();
    ok('WORKING_STRENGTH_FINALIZED -> FSL_UPLOADED', s1.ok && s1.stage === 'FSL_UPLOADED', s1.stage);

    g = await r(() => poStageGuard());
    ok('an empty seniority list blocks the next stage',
        !g.ok && /seniority list is empty/i.test(g.errors[0] || ''), g.errors[0]);

    // The DLC uploads ONE FILE PER CADRE: Krishna, then NTR, then Eluru.
    const CADRE_FILES = {
        DC_KRISHNA: [
            { seniority_no: '1', name: 'A. Ramana', category_id: 'CAT_SI', gender: 'Male', cfms_id: 'C1001', mobile: '9000000001', date_of_birth: '01-02-1985', date_of_joining_category: '10-06-2012', social_category: 'BC-B', erstwhile_cadre: 'DC_KRISHNA', present_local_cadre: 'DC_KRISHNA', present_working_place: 'KRN Town PS', service_status: 'PRESENT' },
            { seniority_no: '2', name: 'B. Suresh', category_id: 'CAT_SI', gender: 'Male', cfms_id: 'C1002', mobile: '9000000002', date_of_birth: '05-03-1987', date_of_joining_category: '12-08-2013', social_category: 'SC', sc_group: 'SC_3', erstwhile_cadre: 'DC_KRISHNA', present_local_cadre: 'DC_KRISHNA', present_working_place: 'KRN Rural PS', service_status: 'DEPUTATION', deputation_unit: 'CID A.P.' },
            { seniority_no: '', name: 'D. Ramesh', category_id: 'CAT_SI', gender: 'Male', cfms_id: 'C1004', mobile: '9000000004', date_of_birth: '02-02-1988', date_of_joining_category: '04-04-2014', social_category: 'OC', erstwhile_cadre: 'DC_KRISHNA', present_local_cadre: 'DC_KRISHNA', present_working_place: 'Machilipatnam PS', service_status: 'PRESENT' },
            { seniority_no: '1', name: 'F. Padma', category_id: 'CAT_PC', gender: 'Female', cfms_id: 'C2001', mobile: '9000002001', date_of_birth: '03-03-1995', date_of_joining_category: '05-05-2019', social_category: 'BC-B', erstwhile_cadre: 'DC_KRISHNA', present_local_cadre: 'DC_KRISHNA', present_working_place: 'Gudivada PS', service_status: 'PRESENT' },
            { seniority_no: '3', name: 'H. Ravi', category_id: 'CAT_PC', gender: 'Male', cfms_id: 'C2003', mobile: '9000002003', date_of_birth: '09-09-1997', date_of_joining_category: '09-09-2021', social_category: 'BC-B', erstwhile_cadre: 'DC_KRISHNA', present_local_cadre: 'DC_KRISHNA', present_working_place: 'Avagudem PS', service_status: 'PROBATION' }
        ],
        DC_NTR: [
            { seniority_no: '3', name: 'C. Lakshmi', category_id: 'CAT_SI', gender: 'Female', cfms_id: 'C1003', mobile: '9000000003', date_of_birth: '11-09-1990', date_of_joining_category: '01-01-2016', social_category: 'SC', sc_group: 'SC_3', erstwhile_cadre: 'DC_NTR', present_local_cadre: 'DC_NTR', present_working_place: 'NTR PS', service_status: 'LEAVE' },
            { seniority_no: '2', name: 'G. Anil', category_id: 'CAT_PC', gender: 'Male', cfms_id: 'C2002', mobile: '9000002002', date_of_birth: '06-06-1996', date_of_joining_category: '08-08-2020', social_category: 'SC', sc_group: 'SC_1', erstwhile_cadre: 'DC_NTR', present_local_cadre: 'DC_NTR', present_working_place: 'Vijayawada East PS', service_status: 'PRESENT' }
        ],
        DC_ELURU: [
            { seniority_no: '5', name: 'E. Rao', category_id: 'CAT_SI', gender: 'Male', cfms_id: 'C1005', mobile: '9000000005', date_of_birth: '07-07-1992', date_of_joining_category: '20-02-2018', social_category: 'ST', sc_group: 'ST', erstwhile_cadre: 'DC_ELURU', present_local_cadre: 'DC_ELURU', present_working_place: 'Eluru PS', service_status: 'SUSPENSION' }
        ]
    };

    const perCadre = await r((files) => {
        const out = [];
        ['DC_KRISHNA', 'DC_NTR', 'DC_ELURU'].forEach(cid => {
            const n = poImportSeniorityRows(files[cid], true);
            out.push({ cadre: cid, n, total: poState.fsl.length });
        });
        return out;
    }, CADRE_FILES);
    perCadre.forEach(x => ok('uploaded ' + x.cadre + ' (' + x.n + ' rows, ' + x.total + ' total)', x.n > 0));

    // Re-uploading one cadre must replace only that cadre.
    const reupload = await r((files) => {
        const before = poState.fsl.filter(f => f.erstwhile_cadre_id === 'DC_NTR').length;
        const otherBefore = poState.fsl.length;
        const n = poImportSeniorityRows(files.DC_KRISHNA, true);
        return {
            n, before, afterKrishna: poState.fsl.filter(f => f.erstwhile_cadre_id === 'DC_KRISHNA').length,
            afterNtr: poState.fsl.filter(f => f.erstwhile_cadre_id === 'DC_NTR').length,
            total: poState.fsl.length, otherBefore
        };
    }, CADRE_FILES);
    ok('re-uploading Krishna replaces only the Krishna rows',
        reupload.afterKrishna === CADRE_FILES.DC_KRISHNA.length && reupload.afterNtr === reupload.before,
        reupload.afterKrishna + ' Krishna / ' + reupload.afterNtr + ' NTR');
    ok('the other two districts are untouched by a single-cadre upload',
        reupload.total === CADRE_FILES.DC_KRISHNA.length + reupload.before + CADRE_FILES.DC_ELURU.length,
        String(reupload.total));

    const badCadre = await r(() => poImportSeniorityRows([{
        seniority_no: '1', name: 'Stranger', category_id: 'CAT_SI', date_of_birth: '01-01-1990',
        date_of_joining_category: '01-01-2015', social_category: 'OC',
        erstwhile_cadre: 'Atlantis', present_local_cadre: 'Atlantis'
    }], true));
    ok('a file naming none of the three districts is refused', badCadre === 0, String(badCadre));

    const imported = await r(() => ({
        records: poState.fsl.map(d => ({ id: d.employee_id, sen: d.seniority_no, name: d.name, cat: d.category_id, status: d.service_status }))
    }));
    ok('the row with no seniority keeps it empty (not row order)',
        imported.records.find(x => x.name === 'D. Ramesh').sen === null,
        String(imported.records.find(x => x.name === 'D. Ramesh').sen));
    ok('employees on deputation / leave / suspension / probation are retained',
        ['DEPUTATION', 'LEAVE', 'SUSPENSION', 'PROBATION'].every(st => imported.records.some(x => x.status === st)),
        imported.records.map(x => x.name + ':' + x.status).join(' '));

    const v1 = await r(() => poRunSeniorityValidation());
    ok('validation blocks on the missing seniority', !v1.valid && v1.errors.some(e => e.code === 'MISSING_SENIORITY'));
    ok('deputation produces no exclusion error', !v1.errors.some(e => /DEPUT|abscond|absen/i.test(e.code)),
        JSON.stringify(v1.errors.map(e => e.code)));
    g = await r(() => poStageGuard());
    ok('validation errors block the stage', !g.ok, g.errors[0]);
    ok('locking is refused while the list is invalid',
        await r(() => poFinalizeSeniorityList()) === 0);

    // The DLC supplies the official seniority number, and one record is left short of a
    // mobile number so the PASS / WARNING / ERROR triad is exercised.
    await r(() => {
        const rec = poState.fsl.find(d => d.name === 'D. Ramesh');
        rec.seniority_no = 4;
        rec.mobile = '';
        poSaveSeniorityRecord(rec, false);
    });
    const v2 = await r(() => poRunSeniorityValidation());
    ok('validation passes once the official seniority is supplied', v2.valid, JSON.stringify(v2.errors.map(e => e.code)));
    ok('a missing mobile is a WARNING, not a blocking error',
        v2.warnings.some(w => w.code === 'MISSING_MOBILE') && v2.errors.length === 0,
        v2.warnings.map(w => w.code).join(','));

    console.log('\n[claims: a flag alone is not preferential, and the appointing authority must certify it]');
    const claimRes = await r(() => {
        const rec = poState.fsl.find(d => d.name === 'B. Suresh');
        rec.claims.widow = { claimed: true, doc_present: 'Yes', cert_no: 'W/2026/11', cert_date: '2026-02-01', disability_percent: '', appointing_authority: '', verification: 'PENDING', verified_by: '', verified_at: '', remark: '' };
        poSaveSeniorityRecord(rec, false);
        const pending = POEngine.poPreferredClaim(rec);
        rec.claims.widow.verification = 'VERIFIED';
        rec.claims.widow.verified_by = poUser();
        rec.claims.widow.verified_at = poNow();
        poSaveSeniorityRecord(rec, false);
        // Verified but NOT certified by the appointing authority: the GO requires
        // certification after verification of the records, so this is not yet preferential.
        const uncertified = POEngine.poPreferredClaim(rec);
        const uncertifiedIsBlocking = POEngine.validateSeniorityList(poState.fsl, { ctx: poCtx() })
            .errors.some(e => e.code === 'CLAIM_NOT_CERTIFIED');
        rec.claims.widow.appointing_authority = 'District Collector & District Magistrate';
        poSaveSeniorityRecord(rec, false);
        const after = POEngine.poPreferredClaim(rec);
        const stillBlocking = POEngine.validateSeniorityList(poState.fsl, { ctx: poCtx() })
            .errors.some(e => e.code === 'CLAIM_NOT_CERTIFIED');
        return {
            pending: pending,
            uncertified: uncertified,
            uncertifiedCertifiedFlag: uncertified ? uncertified.certified : null,
            uncertifiedIsBlocking: uncertifiedIsBlocking,
            after: after,
            stillBlocking: stillBlocking
        };
    });
    ok('pending claim is not preferential', claimRes.pending === null);
    // The engine ranks a VERIFIED claim; certification is enforced where the GO
    // puts it - an uncertified claim is a BLOCKING seniority-list error, so the
    // list cannot be locked or allocated from until the authority is recorded.
    ok('an uncertified claim is a blocking error on the list', claimRes.uncertifiedIsBlocking === true);
    ok('an uncertified claim is reported as uncertified', claimRes.uncertifiedCertifiedFlag === false,
        String(claimRes.uncertifiedCertifiedFlag));
    ok('certifying by the appointing authority clears the block and keeps priority 3',
        claimRes.after && claimRes.after.priority === 3 && claimRes.after.certified === true &&
        claimRes.stillBlocking === false,
        claimRes.after ? claimRes.after.id : 'null');

    console.log('\n[STEP 4 - lock and publish the Seniority List]');
    const locked = await r(() => {
        const n = poFinalizeSeniorityList();
        return { n, locked: poState.fslLocked, version: poVersionLabel('fsl') };
    });
    ok('the seniority list is locked', locked.n === 8 && locked.locked === true, locked.version + ' ' + locked.n);
    ok('locking twice is refused', await r(() => poFinalizeSeniorityList()) === 0);

    const fslRes = await r(() => {
        const analysis = poFsAnalysis();
        return {
            locked: poState.fslLocked, version: poVersionLabel('fsl'),
            strength: analysis.N_strength, noOption: analysis.L_noOptionCount, total: analysis.total,
            sc: [analysis.F_sc_group_1, analysis.G_sc_group_2, analysis.H_sc_group_3, analysis.I_st],
            dep: analysis.K_deputation.total_on_deputation
        };
    });
    const siRow = fslRes.strength.find(x => x.category_id === 'CAT_SI');
    ok('FWS, current working strength, list count and allocable strength reported separately',
        siRow.fws_total === 7 && siRow.fsl_employee_count === 5 && siRow.current_working_strength === 5 && siRow.allocable_strength === 2,
        JSON.stringify(siRow));

    const editableAfter = await r(() => ({ editable: poSeniorityEditable(), stage: poStage() }));
    ok('the list is still editable while FSL_UPLOADED is open', editableAfter.editable === true, editableAfter.stage);

    s1 = await advance();
    ok('FSL_UPLOADED -> FSL_FINALIZED', s1.ok && s1.stage === 'FSL_FINALIZED', s1.stage);
    ok('the list is frozen once the stage has moved on',
        await r(() => poSeniorityEditable()) === false);

    console.log('\n[STEP 4b - no objection window: publication is immediate]');
    const noObjection = await r(() => ({
        objectionFns: [typeof poRaiseObjection, typeof poObjectionWindowOpen, typeof poFslEligible].join(','),
        dslStore: typeof poState.dsl,
        auditStore: typeof poState.audit,
        objectionEvents: Object.keys(poState.events).filter(k => /objection|dsl/i.test(k)).length,
        publish: poPublishFsl()
    }));
    ok('the objection subsystem does not exist', noObjection.objectionFns === 'undefined,undefined,undefined', noObjection.objectionFns);
    ok('there is no DSL store and no audit store',
        noObjection.dslStore === 'undefined' && noObjection.auditStore === 'undefined',
        noObjection.dslStore + ' / ' + noObjection.auditStore);
    ok('no objection or DSL procedural events are recorded', noObjection.objectionEvents === 0);
    ok('the list is published without waiting for any window', noObjection.publish === true);

    console.log('\n[STEP 4c - allocation policy frozen before allocation]');
    const pol = await r(() => ({
        before: poPolicyFrozen(),
        compulsory: poState.policy.compulsory_allocation_policy,
        prefer: poState.policy.prefer_existing_on_compulsory,
        basis: POEngine.PO_SEG_BASIS,
        set: poSetPolicy('compulsory_allocation_policy', 'LARGEST_REMAINING_VACANCY'),
        frozenNow: poFreezePolicy(),
        thenFrozen: poPolicyFrozen(),
        refuseChange: poSetPolicy('compulsory_allocation_policy', 'CONFIGURED_CADRE_ORDER'),
        stillSame: poState.policy.compulsory_allocation_policy,
        notice: POEngine.PO_POLICY_NOTICE_COMPULSORY
    }));
    ok('policy starts unfrozen', pol.before === false);
    ok('policy is a DLC decision, not a GO requirement', /DLC confirmation required/.test(pol.notice));
    ok('policy frozen before allocation', pol.frozenNow === true && pol.thenFrozen === true);
    ok('policy cannot change after freezing', pol.refuseChange === false && pol.stillSame === 'LARGEST_REMAINING_VACANCY');
    ok('SC/ST basis fixed to working strength', pol.basis === 'FINAL_WORKING_STRENGTH', pol.basis);

    const pub = await r(() => {
        poOpenOptions();
        const dl = poOptionDeadline();
        return { close: dl ? dl.toISOString().slice(0, 10) : null, window: poState.optionWindowDays };
    });
    ok('publication opens a ' + pub.window + '-day option window', pub.window === 5 && !!pub.close, pub.close);

    console.log('\n[STEP 4d - options only accept cadres configured for the rank]');
    s1 = await advance();
    ok('FSL_FINALIZED -> FSL_PUBLISHED', s1.ok && s1.stage === 'FSL_PUBLISHED', s1.stage);
    s1 = await advance();
    ok('FSL_PUBLISHED -> OPTIONS_OPEN', s1.ok && s1.stage === 'OPTIONS_OPEN', s1.stage);

    const optRes = await r(() => {
        const out = {};
        const si = poState.fsl.find(f => f.category_id === 'CAT_SI');
        const pc = poState.fsl.find(f => f.category_id === 'CAT_PC');
        out.siAllowed = poApplicableCadreIds('CAT_SI');
        out.pcAllowed = poApplicableCadreIds('CAT_PC');
        const bad = poSaveOption(si.employee_id, 'DC_ELURU', '', '');   // valid for SI (fws 1)
        out.eluruOkForSi = bad.ok;
        const badPc = poSaveOption(pc.employee_id, 'DC_ELURU', '', ''); // fws 0 for PC
        out.eluruRejectedForPc = !badPc.ok ? badPc.errors[0] : null;
        const dup = poSaveOption(si.employee_id, 'DC_KRISHNA', 'DC_KRISHNA', '');
        out.duplicateRejected = !dup.ok ? dup.errors[0] : null;
        const good = poSaveOption(si.employee_id, 'DC_ELURU', 'DC_NTR', 'DC_KRISHNA');
        out.siOptions = good.ok;
        const pcGood = poSaveOption(pc.employee_id, 'DC_NTR', 'DC_KRISHNA', '');
        out.pcOptions = pcGood.ok;
        return out;
    });
    ok('Eluru is a valid SI cadre', optRes.eluruOkForSi === true);
    ok('Eluru is not a valid PC cadre (FWS 0) and is rejected', !!optRes.eluruRejectedForPc, optRes.eluruRejectedForPc);
    ok('a repeated preference is rejected', !!optRes.duplicateRejected, optRes.duplicateRejected);
    ok('valid SI options accepted', optRes.siOptions === true);
    ok('valid PC options accepted', optRes.pcOptions === true);

    const rest = await r(() => {
        // Options for the remaining employees, including one who exercises none.
        const others = poState.fsl.filter(f => f.category_id === 'CAT_SI' && !(poState.options[f.employee_id] || {}).submitted);
        let n = 0;
        others.forEach((f, i) => {
            if (i === others.length - 1) return;      // this one submits nothing
            const prefs = [['DC_KRISHNA', 'DC_NTR', 'DC_ELURU'], ['DC_NTR', 'DC_KRISHNA', 'DC_ELURU']][i % 2];
            if (poSaveOption(f.employee_id, prefs[0], prefs[1], prefs[2]).ok) n++;
        });
        const pcs = poState.fsl.filter(f => f.category_id === 'CAT_PC' && !(poState.options[f.employee_id] || {}).submitted);
        pcs.forEach(f => { if (poSaveOption(f.employee_id, 'DC_KRISHNA', 'DC_NTR', '').ok) n++; });
        return { submitted: Object.keys(poState.options).length, noOption: poNoOptionEmployees().map(e => e.name) };
    });
    ok('options recorded for 7 of 8 employees', rest.submitted === 7, String(rest.submitted));
    ok('one employee is left without an option', rest.noOption.length === 1, rest.noOption.join(','));

    // Closing and locking the option window IS the work of OPTIONS_OPEN, so it
    // happens before the stage is left.
    const lock = await r(() => { poCloseOptions(); const before = poNoOptionEmployees().length; poSaveOption(poState.fsl[0].employee_id, 'DC_ELURU', '', ''); return { locked: poState.optionsLocked, noOption: before, stage: poStage() }; });
    ok('options are locked after closing', lock.locked === true);
    ok('the no-option employee remains marked NO OPTION', lock.noOption === 1, String(lock.noOption));

    s1 = await advance();
    ok('OPTIONS_OPEN -> OPTIONS_CLOSED', s1.ok && s1.stage === 'OPTIONS_CLOSED', s1.stage);

    console.log('\n[STEP 7 - simulation then confirmation]');
    const sim = await r(() => {
        const res = poSimulateAllocation();
        return {
            mode: res.run.mode, status: res.run.status, allocated: res.run.allocated,
            unallocated: res.run.unallocated, reasons: res.run.by_reason,
            exceptions: res.exceptions.map(e => e.code),
            officialUntouched: poState.allocations.length === 0 && poState.allocationRun === null
        };
    });
    ok('simulation runs', sim.allocated + sim.unallocated === 8, JSON.stringify(sim.reasons));
    ok('simulation does not alter official allocation data', sim.officialUntouched === true);
    ok('simulation is marked SIMULATION', sim.mode === 'SIMULATION');

    s1 = await advance();
    ok('OPTIONS_CLOSED -> ALLOCATION_RUNNING', s1.ok && s1.stage === 'ALLOCATION_RUNNING', s1.stage);
    const simOnly = await r(() => poStageGuard());
    ok('a SIMULATION alone does not unblock ALLOCATION_VALIDATED',
        !simOnly.ok && simOnly.errors.some(e => /CONFIRMED allocation run/.test(e)), simOnly.errors[0]);

    const confirm = await r(() => {
        const res = poConfirmAllocation();
        return {
            status: res.run.status, allocated: res.run.allocated, unallocated: res.run.unallocated,
            rows: poState.allocations.map(a => ({
                name: a.name, cat: a.category_id, cadre: a.cadre_name, reason: a.allocation_reason,
                vb: a.vacancy_before, va: a.vacancy_after, seq: a.allocation_sequence,
                pref: a.preference_selected, prefRank: a.preference_rank
            })),
            exceptions: res.exceptions.map(e => e.code + ':' + e.message)
        };
    });
    ok('confirmed run passes the over-allocation check', confirm.status === 'PASSED', confirm.status);
    const ledger0 = await r(() => poState.strengths.map(s => ({
        key: s.category_id + '/' + s.cadre_id, fws: s.fws,
        n: poState.allocations.filter(a => a.category_id === s.category_id && a.cadre_id === s.cadre_id).length
    })));
    ok('no cadre exceeds FWS', ledger0.every(x => x.n <= x.fws), JSON.stringify(ledger0));
    ok('every allotment carries a known reason',
        confirm.rows.every(a => ['PREFERENTIAL_CATEGORY', 'SC_ST_RESERVED_ALLOTMENT', 'SENIORITY_FIRST_PREFERENCE',
            'SENIORITY_SECOND_PREFERENCE', 'SENIORITY_THIRD_PREFERENCE', 'COMPULSORY_ALLOTMENT',
            'NO_OPTION_ALLOTMENT', 'SC_ST_ADJUSTMENT'].indexOf(a.reason) !== -1),
        confirm.rows.map(a => a.name + '=' + a.reason).join(' '));

    // Tiers run per category, so the reserved share must precede the general
    // category WITHIN each rank, never across the exercise.
    const tierOrder = ['CAT_SI', 'CAT_PC'].map(catId => {
        const rows = confirm.rows.filter(x => x.cat === catId);
        const res = rows.filter(x => x.reason === 'SC_ST_RESERVED_ALLOTMENT').map(x => x.seq);
        const gen = rows.filter(x => x.reason.indexOf('SENIORITY_') === 0).map(x => x.seq);
        return {
            catId, res, gen,
            ok: res.length > 0 && gen.length > 0 && Math.max(...res) < Math.min(...gen)
        };
    });
    tierOrder.forEach(t => ok('in ' + t.catId + ' the SC/ST reserved share is allotted before the general category',
        t.ok, 'reserved#' + t.res.join(',') + ' general#' + t.gen.join(',')));

    const noOptName = rest.noOption[0];
    const noOpt = confirm.rows.find(x => x.name === noOptName);
    const noOptCat = confirm.rows.filter(x => x.cat === noOpt.cat).map(x => x.seq);
    ok('the employee who submitted no option is allotted last within their rank/category',
        noOpt && noOpt.reason === 'NO_OPTION_ALLOTMENT' && noOpt.seq === Math.max(...noOptCat),
        noOpt ? noOpt.name + ' ' + noOpt.reason + ' seq ' + noOpt.seq + ' of ' + noOpt.cat + ' ' + noOptCat.join(',') : 'not allotted');

    const widow = confirm.rows.find(x => x.name === 'B. Suresh');
    ok('the verified widow claim is allotted first with PREFERENTIAL_CATEGORY', widow.reason === 'PREFERENTIAL_CATEGORY', widow.reason);

    const ledger = await r(() => poState.strengths.map(s => ({
        key: s.category_id + '/' + s.cadre_id, fws: s.fws,
        n: poState.allocations.filter(a => a.category_id === s.category_id && a.cadre_id === s.cadre_id).length
    })));
    ok('vacancy ledger never goes negative', ledger.every(x => x.n <= x.fws), JSON.stringify(ledger));

    s1 = await advance();
    ok('ALLOCATION_RUNNING -> ALLOCATION_VALIDATED', s1.ok && s1.stage === 'ALLOCATION_VALIDATED', s1.stage);

    console.log('\n[STEP 8 - FAL validation and publication lock]');
    const falv = await r(() => poFALValidation());
    ok('FAL validation passes on the confirmed run', falv.valid === true, JSON.stringify(falv.blocking));
    ok('compulsory allotments are surfaced as warnings, not hidden',
        falv.warnings.some(w => w.code === 'COMPULSORY_DOCUMENTED') || falv.warnings.some(w => w.code === 'NO_OPTION_DOCUMENTED'),
        falv.warnings.map(w => w.code).join(','));

    const falRes = await r(() => {
        poGenerateFal();
        return { version: poVersionLabel('fal'), status: poState.fal.status, rows: poState.fal.rows.length };
    });
    ok('FAL generated from the confirmed run in DRAFT', falRes.status === 'DRAFT', falRes.version + ' ' + falRes.status);
    ok('FAL row count matches the allocation', falRes.rows === confirm.allocated, falRes.rows + ' rows');
    s1 = await advance();
    ok('ALLOCATION_VALIDATED -> FAL_GENERATED', s1.ok && s1.stage === 'FAL_GENERATED', s1.stage);

    const noReasonBeforeApprove = await r(() => poReviseFal('   '));
    ok('a generated FAL cannot be revised without a reason', noReasonBeforeApprove === false);

    const approvedRes = await r(() => { poApproveFal(); return poState.fal.status; });
    ok('FAL approved', approvedRes === 'APPROVED', approvedRes);
    s1 = await advance();
    ok('FAL_GENERATED -> FAL_APPROVED', s1.ok && s1.stage === 'FAL_APPROVED', s1.stage);

    const published = await r(() => { poPublishFal(); return { status: poState.fal.status, locked: poState.fal.locked }; });
    ok('FAL published and locked', published.status === 'PUBLISHED' && published.locked === true);
    s1 = await advance();
    ok('FAL_APPROVED -> FAL_PUBLISHED', s1.ok && s1.stage === 'FAL_PUBLISHED', s1.stage);

    const noEdit = await r(() => {
        const stillLocked = poState.fal.locked;
        const withReason = poReviseFal('Court-directed revision of one allotment');
        return {
            stillLocked, withReason,
            cleared: poState.fal === null && poState.allocationRun === null,
            retained: poState.history.fal.length > 0 && poState.history.allocationRun.length > 0
        };
    });
    ok('a published FAL is locked until a reasoned revision, and the old one is retained',
        noEdit.stillLocked === true && noEdit.withReason === true && noEdit.cleared && noEdit.retained, JSON.stringify(noEdit));

    // Re-run the official allocation and FAL so the rest of the workflow can complete.
    await r(() => {
        poConfirmAllocation();
        poGenerateFal();
        poApproveFal();
        poPublishFal();
    });
    console.log('\n[STEP 7 - OOA and OOT]');
    const ooaRes = await r(() => {
        const n = poGenerateOoa();
        poApproveOoa();
        poIssueOoa('OOA/2026/');
        return {
            n, issued: poState.ooa.filter(o => o.status === 'ISSUED').length,
            first: poState.ooa[0],
            goRef: poState.ooa[0].go_reference
        };
    });
    ok('OOA generated for every allotted employee', ooaRes.n === confirm.allocated, String(ooaRes.n));
    ok('OOA issued with order number and date', ooaRes.issued === ooaRes.n && !!ooaRes.first.order_no, ooaRes.first.order_no + ' ' + ooaRes.first.order_date);
    ok('OOA carries the GO reference', /G\.O\.Ms\.No\.129/.test(ooaRes.goRef), ooaRes.goRef);

    const rev = await r(() => {
        const id = poState.ooa[0].ooa_id;
        const before = poState.ooa.length;
        const okRev = poReviseOoa(id, 'Typographical error in cadre name');
        const o = poState.ooa.find(x => x.ooa_id === id);
        return { okRev, status: o.status, count: before, deleteRemoved: false };
    });
    ok('an issued OOA can only be revised, never deleted', rev.okRev && rev.status === 'REVISED' && rev.count === ooaRes.n,
        rev.status);

    s1 = await advance();
    ok('FAL_PUBLISHED -> OOA_GENERATED', s1.ok && s1.stage === 'OOA_GENERATED', s1.stage);

    const ootRes = await r(() => {
        const n = poGenerateOot();
        const required = poState.oot.filter(o => o.transfer_required);
        const notRequired = poState.oot.filter(o => !o.transfer_required);
        return {
            n, requiredCount: required.length, notRequiredCount: notRequired.length,
            sample: notRequired.slice(0, 2).map(o => o.name + ' -> ' + o.order_no)
        };
    });
    ok('OOT generated only where the allotted cadre differs from the present cadre',
        ootRes.requiredCount > 0 && ootRes.notRequiredCount > 0,
        ootRes.requiredCount + ' required, ' + ootRes.notRequiredCount + ' not required');
    ok('no-transfer employees carry NOT REQUIRED', ootRes.sample.every(s => /NOT REQUIRED/.test(s)), ootRes.sample.join(' | '));
    s1 = await advance();
    ok('OOA_GENERATED -> OOA_ISSUED', s1.ok && s1.stage === 'OOA_ISSUED', s1.stage);

    const issuedRes = await r(() => {
        const nIssued = poIssueOot('OOT/2026/');
        const first = poState.oot.find(o => o.transfer_required);
        return {
            issued: nIssued, deadline: first ? first.joining_deadline : null,
            orderDate: first ? first.order_date : null, window: poState.joiningWindowDays
        };
    });
    ok('joining deadline is 7 days from issue',
        issuedRes.window === 7 && !!issuedRes.deadline, issuedRes.orderDate + ' -> ' + issuedRes.deadline);
    s1 = await advance();
    ok('OOA_ISSUED -> OOT_GENERATED', s1.ok && s1.stage === 'OOT_GENERATED', s1.stage);
    s1 = await advance();
    ok('OOT_GENERATED -> OOT_ISSUED', s1.ok && s1.stage === 'OOT_ISSUED', s1.stage);

    const beforeJoin = await r(() => {
        poState.oot.filter(o => o.status === 'ISSUED').forEach(o => { o.joining_status = 'PENDING'; });
        const guard = poStageGuard();
        return { guard: guard.errors, unresolved: poUnresolvedJoining().length, stage: poStage() };
    });
    ok('unresolved joining blocks leaving OOT_ISSUED',
        beforeJoin.guard.length > 0 && beforeJoin.unresolved > 0, beforeJoin.stage + ': ' + beforeJoin.guard[0]);
    s1 = await advance();
    ok('the stage does not advance while joining is unresolved', !s1.ok && s1.stage === 'OOT_ISSUED', s1.stage);

    const joinRes = await r(() => {
        let n = 0;
        poState.oot.filter(o => o.status === 'ISSUED').forEach(o => {
            if (poRecordJoining(o.oot_id, o.order_date, 'Reported and joined')) n++;
        });
        return { n, open: poState.oot.filter(o => ['JOINED', 'EXCEPTION'].indexOf(o.joining_status) === -1 && o.transfer_required).length,
                 statuses: poState.oot.filter(o => o.transfer_required).map(o => o.joining_status) };
    });
    ok('joining recorded for every issued OOT (status JOINED)', joinRes.open === 0 &&
        joinRes.statuses.every(s => s === 'JOINED'), joinRes.n + ' recorded, statuses=' + joinRes.statuses.join(','));

    const afterJoin = await r(() => ({ guard: poStageGuard().errors, unresolved: poUnresolvedJoining().length }));
    ok('recording every joining unblocks closure', afterJoin.unresolved === 0 && afterJoin.guard.length === 0, afterJoin.guard.join(' | '));

    // The override route is still exercised: mark one record EXCEPTION.
    const excRes = await r(() => {
        const o = poState.oot.find(x => x.transfer_required && x.status === 'ISSUED');
        poRecordJoining(o.oot_id, '', 'Medical, referred for extension', 'EXCEPTION');
        return { status: o.joining_status, unresolved: poUnresolvedJoining().length, guard: poStageGuard().errors };
    });
    ok('an EXCEPTION disposition resolves the record', excRes.status === 'EXCEPTION' && excRes.unresolved === 0, excRes.status);
    const ovrRes = await r(() => {
        const noReason = poOverrideJoiningClosure('', 'DLC');
        const noAuthority = poOverrideJoiningClosure('x', '');
        const okOne = poOverrideJoiningClosure('Post held pending court direction', 'DLC Chairman');
        return {
            noReason, noAuthority, okOne,
            recorded: !!poState.joiningClosureOverride && !!poState.joiningClosureOverride.reason &&
                      !!poState.joiningClosureOverride.authority
        };
    });
    ok('closure override requires a reason and an authority',
        ovrRes.noReason === false && ovrRes.noAuthority === false && ovrRes.okOne === true, JSON.stringify(ovrRes));
    ok('the closure override records its reason and authority', ovrRes.recorded === true);
    s1 = await advance();
    ok('OOT_ISSUED -> JOINING_COMPLETED', s1.ok && s1.stage === 'JOINING_COMPLETED', s1.stage);
    s1 = await advance();
    ok('JOINING_COMPLETED -> EXERCISE_CLOSED', s1.ok && s1.stage === 'EXERCISE_CLOSED', s1.stage);
    ok('exercise marked closed', await r(() => poState.exercise.status) === 'CLOSED');

    console.log('\n[versioning, procedural events and retained history]');
    const ver = await r(() => ({
        versions: Object.assign({}, poState.versions),
        events: Object.keys(poState.events),
        historyKeys: Object.keys(poState.history),
        historyCounts: Object.keys(poState.history).reduce((m, k) => { m[k] = poState.history[k].length; return m; }, {}),
        engine: POEngine.PO_ENGINE_VERSION,
        engineHash: POEngine.poEngineHash()
    }));
    ok('every version is stamped',
        ['fws', 'fsl', 'options', 'fal', 'ooa', 'oot', 'claims', 'policy'].every(k => ver.versions[k] >= 0) &&
        Object.keys(ver.versions).length === 8,
        JSON.stringify(ver.versions));
    ok('the engine carries a version and a behaviour hash', !!ver.engine && !!ver.engineHash, ver.engine + ' ' + ver.engineHash);
    ['seniority_uploaded_at', 'fsl_created_at', 'fsl_finalized_at', 'fsl_published_at',
     'options_opened_at', 'options_closed_at', 'allocation_started_at', 'allocation_completed_at',
     'fal_published_at', 'ooa_issued_at', 'oot_issued_at', 'joining_deadline'].forEach(k => {
        ok('procedural event recorded: ' + k, ver.events.indexOf(k) !== -1);
    });
    ok('no DSL or objection events exist',
        !ver.events.some(k => /dsl|objection/i.test(k)), ver.events.filter(k => /dsl|objection/i.test(k)).join(','));
    ok('superseded official records are retained', ver.historyCounts.fsl > 0 && ver.historyCounts.fal > 0,
        JSON.stringify(ver.historyCounts));

    console.log('\n[stage skipping is impossible]');
    const skip = await r(() => {
        const before = poStage();
        const direct = typeof poSetStageDirect === 'function' ? poSetStageDirect('FAL_PUBLISHED') : 'missing';
        return { before, after: poStage(), direct, ret: poSetStageDirect() };
    });
    ok('there is no function that jumps stages', skip.direct === false && skip.before === skip.after, skip.after);

    console.log('\n[final render sweep across all steps]');
    const render = await r(async () => {
        showPage('presidentialOrder');
        await new Promise(r => setTimeout(r, 400));
        const lens = [];
        for (let i = 0; i < PO_STEPS.length; i++) {
            poCurrentStep = i;
            renderCurrentPOTab();
            await new Promise(r => setTimeout(r, 100));
            lens.push(PO_STEPS[i].key + ':' + (document.getElementById('poTabContent').textContent || '').trim().length);
        }
        return lens;
    });
    render.forEach(l => {
        const [k, n] = l.split(':');
        ok('step ' + k + ' renders with content', Number(n) > 200, n + 'b');
    });

    console.log('\nJS errors during the whole run: ' + errs.length);
    errs.slice(0, 10).forEach(e => console.log('   ' + e));
    ok('no JS errors during the full workflow', errs.length === 0, errs.join(' | '));

    await browser.close();
    server.close();

    console.log('\n===== RESULT =====');
    console.log(fail.length ? 'FAILURES: ' + fail.length + '\n - ' + fail.join('\n - ') : 'ALL WORKFLOW CHECKS PASSED');
    process.exit(fail.length ? 1 : 0);
})();
