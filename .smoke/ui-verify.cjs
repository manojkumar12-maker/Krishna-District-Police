// UI verification harness — serves the repo locally, mocks the API, and asserts
// the redesign introduced no JS errors and no lost functionality.
// READ ONLY with respect to Cloudflare/D1: all API traffic is intercepted.
const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:/Users/a2dpo/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const RANKS = ['SI', 'HC', 'ASI', 'PC', 'DSP', 'WPC'];
const DISTRICTS = ['ERSTWHILE', 'NEW'];
const TYPES = ['CIVIL', 'AR', 'MINISTERIAL', 'CLASS_IV'];
const STATIONS = ['VIJAYAWADA', 'MACHILIPATNAM', 'NANDIKONDA'];

function fixturePersonnel() {
    const out = [];
    let n = 0;
    for (const district of DISTRICTS) {
        for (const rank of RANKS) {
            for (const type of TYPES) {
                for (let k = 0; k < 3; k++) {
                    out.push({
                        id: String(++n),
                        name: `${district === 'ERSTWHILE' ? 'Erstwhile' : 'New'} ${rank} ${type} ${k + 1}`,
                        rank,
                        genl_no: `G${1000 + n}`,
                        personnel_type: type,
                        district,
                        present_district: district === 'ERSTWHILE' ? 'NTR' : 'KRISHNA',
                        gender: k % 2 ? 'Female' : 'Male',
                        previous_station: STATIONS[n % STATIONS.length],
                        status: n % 7 === 0 ? 'Absent' : 'Present',
                        date_of_birth: '1990-01-15',
                        caste: n % 3 === 0 ? 'BC-B' : 'OC',
                        education: 'Graduate',
                        date_of_promotion: '2020-06-01',
                        present_working: STATIONS[n % STATIONS.length],
                        phone_number: `9000000${String(n).padStart(3, '0')}`,
                        punishments: '',
                        is_on_deployment: n % 5 === 0 ? 1 : 0,
                        deployment_unit: n % 5 === 0 ? 'SP Guntur' : '',
                        date_of_deployment: n % 5 === 0 ? '2024-02-01' : '',
                        native_place: 'Vijayawada',
                        date_of_appointment: '2012-04-01',
                        date_of_joining_present: '2021-06-01',
                        attachments: '',
                        previous_deputations: '',
                        is_on_deployment_bool: false,
                    });
                }
            }
        }
    }
    return out;
}

const PERSONNEL = fixturePersonnel();

// Sanctioned strength is keyed by district + type + DISPLAY rank label
// (e.g. ERSTWHILE_CIVIL_PC & WPC), matching displayRanksMap in config.js.
const DISPLAY = {
    CIVIL: ['PC & WPC', 'HC & WHC', 'ASI & WASI', 'SI & WSI', 'CI & WCI', 'DSP', 'ADDL.SP'],
    AR: ['ARPC & ARWPC', 'ARHC & ARWHC', 'ARSI & WARSI', 'RSI & WRSI', 'RI & WRI', 'ARDSP', 'ADDL.SP.AR'],
    MINISTERIAL: ['Administrative Officer', 'Asst. Administrative Officer', 'Office Supdt.', 'Senior Assistant', 'Junior Assistant', 'Typists', 'Record Assistant', 'Office Sub-Ordinates'],
    CLASS_IV: ['Sweepers', 'Scavengers', 'Dhobi', 'Barbers', 'Cobbler', 'Waterman'],
};

const sanctioned = [];
for (const district of DISTRICTS)
    for (const [type, labels] of Object.entries(DISPLAY))
        for (const rank of labels) sanctioned.push({ district, personnel_type: type, rank, sanctioned_count: 40 });

const deputation = [];
for (const unit of ['SP Guntur', 'DIG Guntur', 'CID', 'Road Safety'])
    for (const rank of RANKS) deputation.push({ unit_name: unit, rank, sanctioned_count: 8 });

const stationSanctioned = [];
for (const sub of ['Vijayawada', 'Nandikonda', 'Machilipatnam'])
    for (const circle of ['Vijayawada City', 'Vijayawada Rural'])
        for (const st of STATIONS)
            for (const rank of RANKS) stationSanctioned.push({ sub_division: sub, circle, station: st, rank, sanctioned_count: 5 });

function mockBody(url) {
    if (url.includes('/personnel?')) return { success: true, data: PERSONNEL, count: PERSONNEL.length, page: 1, limit: 500 };
    if (url.includes('/sanctioned-strength')) return { success: true, data: sanctioned };
    if (url.includes('/deputation-strength')) return { success: true, data: deputation };
    if (url.includes('/station-sanctioned')) return { success: true, data: stationSanctioned };
    if (url.includes('/audit-logs')) return { success: true, data: [], count: 0 };
    if (url.includes('/personnel/import')) return { success: true, imported: 0 };
    return { success: true };
}

// ── static server ───────────────────────────────────────────────────────────
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

(async () => {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const SITE = `http://127.0.0.1:${port}/index.html`;
    console.log('serving', SITE);

    const browser = await chromium.launch({ executablePath: CHROME, headless: true });
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();

    const errs = [], failed = [];
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    page.on('requestfailed', r => failed.push(`${r.url()} :: ${r.failure()?.errorText}`));

    await page.route('**/api/**', route => {
        const u = route.request().url();
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockBody(u)) });
    });

    await page.addInitScript(() => {
        localStorage.setItem('authToken', 'verify.token.value');
        localStorage.setItem('userRole', 'ADMIN');
        localStorage.setItem('userEmail', 'verify@krishna.police');
    });

    const resp = await page.goto(SITE, { waitUntil: 'networkidle', timeout: 30000 });
    console.log('HTTP:', resp.status());
    await page.waitForTimeout(1200);

    const fail = [];
    const ok = (label, cond, extra = '') => {
        console.log(`${cond ? '  PASS' : '  FAIL'}  ${label}${extra ? ' — ' + extra : ''}`);
        if (!cond) fail.push(label);
    };

    // ── 1. stylesheet loaded and parsed ──────────────────────────────────
    console.log('\n[stylesheet]');
    const css = await page.evaluate(() => {
        const sh = [...document.styleSheets].find(s => (s.href || '').includes('styles.css'));
        if (!sh) return { found: false };
        let rules = 0;
        try { rules = sh.cssRules.length; } catch { rules = -1; }
        return { found: true, rules, href: sh.href };
    });
    ok('styles.css present', css.found);
    ok('parsed >150 rules', css.rules > 150, `${css.rules} rules`);

    // ── 2. design tokens present, legacy var names preserved ─────────────
    console.log('\n[tokens]');
    const tokens = await page.evaluate(() => {
        const cs = getComputedStyle(document.documentElement);
        const g = n => cs.getPropertyValue(n).trim();
        return {
            primary: g('--primary'), secondary: g('--secondary'), accent: g('--accent'),
            radius: g('--r-lg'), bodyFont: getComputedStyle(document.body).fontFamily,
            bodyBg: getComputedStyle(document.body).backgroundColor,
        };
    });
    ok('--primary defined (inline styles depend on it)', !!tokens.primary, tokens.primary);
    ok('--secondary defined', !!tokens.secondary, tokens.secondary);
    ok('--accent defined', !!tokens.accent, tokens.accent);
    ok('serif Bookman removed', !/Bookman/i.test(tokens.bodyFont), tokens.bodyFont.slice(0, 46));
    ok('modern neutral page bg', tokens.bodyBg === 'rgb(245, 246, 249)', tokens.bodyBg);

    // ── 3. app shell revealed (auth path works) ──────────────────────────
    console.log('\n[app shell]');
    const shell = await page.evaluate(() => ({
        login: getComputedStyle(document.getElementById('loginScreen')).display,
        header: getComputedStyle(document.getElementById('mainHeader')).display,
        container: getComputedStyle(document.getElementById('mainContainer')).display,
        headerPos: getComputedStyle(document.getElementById('mainHeader')).position,
        headerBg: getComputedStyle(document.getElementById('mainHeader')).backgroundImage,
        navBtns: document.querySelectorAll('.nav-btn').length,
        tiles: document.querySelectorAll('.district-tile').length,
        rows: document.querySelectorAll('#searchFilterBody tr').length,
        total: (typeof allPersonnel !== 'undefined' ? allPersonnel.length : -1),
    }));
    ok('login hidden after auth', shell.login === 'none', shell.login);
    ok('header shown', shell.header === 'flex', shell.header);
    ok('container shown', shell.container === 'block', shell.container);
    ok('header is sticky', shell.headerPos === 'sticky', shell.headerPos);
    ok('header has modern gradient', /gradient/.test(shell.headerBg));
    ok('4 nav buttons intact', shell.navBtns === 4, String(shell.navBtns));
    ok('9 dashboard tiles intact', shell.tiles === 9, String(shell.tiles));
    ok('data loaded into allPersonnel', shell.total === PERSONNEL.length, String(shell.total));

    // ── 4. component styling actually applied ───────────────────────────
    console.log('\n[components]');
    const comp = await page.evaluate(() => {
        const card = document.querySelector('.card');
        const tile = document.querySelector('.district-tile');
        const nav = document.querySelector('.nav-btn');
        const th = document.querySelector('thead th');
        const cs = e => getComputedStyle(e);
        return {
            cardRadius: cs(card).borderRadius,
            cardBorder: cs(card).borderTopWidth,
            cardShadow: cs(card).boxShadow,
            tileBg: cs(tile).backgroundImage,
            navBg: cs(nav).backgroundColor,
            navRadius: cs(nav).borderRadius,
            thPos: th ? cs(th).position : 'none',
            thBg: th ? cs(th).backgroundColor : 'none',
        };
    });
    ok('.card radius = 14px', comp.cardRadius === '14px', comp.cardRadius);
    ok('.card has 1px border', comp.cardBorder === '1px', comp.cardBorder);
    ok('.card has layered shadow', /rgba/.test(comp.cardShadow));
    ok('.district-tile is gradient', /gradient/.test(comp.tileBg));
    ok('.nav-btn is surface white', comp.navBg === 'rgb(255, 255, 255)', comp.navBg);
    ok('thead th sticky', comp.thPos === 'sticky', comp.thPos);

    // ── 5. every page renders without error ─────────────────────────────
    console.log('\n[pages]');
    const pages = ['erstwhile', 'krishnaNew', 'policeStation', 'deputation', 'presidentialOrder', 'searchFilter', 'auditLogs', 'dashboard'];
    for (const id of pages) {
        const before = errs.length;
        const r = await page.evaluate(async (pid) => {
            showPage(pid);
            await new Promise(r => setTimeout(r, 700));
            const el = document.getElementById(pid);
            return {
                active: el.classList.contains('active'),
                display: getComputedStyle(el).display,
                visibleTiles: el.querySelectorAll('.district-tile, .sub-tile, .rank-tile').length,
                visibleRows: el.querySelectorAll('tbody tr').length,
                text: (el.textContent || '').trim().length,
            };
        }, id);
        const newErrs = errs.length - before;
        ok(`${id}: active+visible`, r.active && r.display !== 'none', `display=${r.display} text=${r.text}b`);
        ok(`${id}: rendered content`, r.text > 20 && newErrs === 0, `tiles=${r.visibleTiles} rows=${r.visibleRows} newErrs=${newErrs}`);
    }

    // ── 6. PO module: eight stage-based steps ──────────────────────────
    console.log('\n[presidential order steps]');
    const poStepCheck = await page.evaluate(async () => {
        showPage('presidentialOrder');
        await new Promise(r => setTimeout(r, 700));
        const out = { steps: [], labels: [], stage: null, version: null, engine: null, open: null };
        out.labels = [...document.querySelectorAll('.po-step .po-step-l')].map(e => e.textContent.trim());
        out.states = [...document.querySelectorAll('.po-step')].map(e => e.className.replace('po-step ', '').trim());
        out.stage = poStage();
        out.version = PO_DATA_VERSION;
        out.engine = POEngine.PO_ENGINE_VERSION;
        out.stageCount = POEngine.PO_STAGES.length;
        // force each step open for render coverage
        for (let i = 0; i < PO_STEPS.length; i++) {
            poCurrentStep = i;
            renderCurrentPOTab();
            await new Promise(r => setTimeout(r, 120));
            out.steps.push({
                key: PO_STEPS[i].key,
                len: (document.getElementById('poTabContent').textContent || '').trim().length,
                hasAdvance: !!document.querySelector('.po-advance'),
            });
        }
        poCurrentStep = poCurrentStepIndex();
        renderCurrentPOTab();
        return out;
    });
    ok('PO renders 7 stage steps (ranks/cadres, strength, seniority list, options, allocation, FAL, orders)',
        poStepCheck.labels.length === 7, poStepCheck.labels.join(' | '));
    ok('PO labels match spec order',
        poStepCheck.labels.join('|') === 'Ranks & Cadres|Working Strength|Seniority List|Option Filling|Allocation|FAL|OOA / OOT',
        poStepCheck.labels.join('|'));
    ok('no DLC Configuration step exists',
        poStepCheck.labels.indexOf('DLC Configuration') === -1,
        poStepCheck.labels.join('|'));
    ok('no DSL step exists',
        poStepCheck.labels.indexOf('DSL') === -1 && poStepCheck.labels.indexOf('FSL') === -1,
        poStepCheck.labels.join('|'));
    ok('PO workflow state machine has 19 stages', poStepCheck.stageCount === 19, String(poStepCheck.stageCount));
    ok('PO starts at DRAFT', poStepCheck.stage === 'DRAFT', String(poStepCheck.stage));
    ok('PO_DATA_VERSION is 11', poStepCheck.version === 11, String(poStepCheck.version));
    ok('allocation engine version stamped', /^[0-9.]+$/.test(poStepCheck.engine), String(poStepCheck.engine));
    poStepCheck.steps.forEach((s, i) => {
        ok('PO step ' + (i + 1) + ' ' + s.key + ' renders', s.len > 200 && s.hasAdvance, s.len + 'b advance=' + s.hasAdvance);
    });
    const poMarkup = await page.evaluate(async () => {
        showPage('presidentialOrder');
        await new Promise(r => setTimeout(r, 500));
        poCurrentStep = 0;
        renderCurrentPOTab();
        await new Promise(r => setTimeout(r, 250));
        const html = document.getElementById('poTabContent').innerHTML;
        return {
            strayUndefined: /(^|>)\s*undefined\s*(<|$)/.test(html),
            hasExercise: html.indexOf('Step 1a') !== -1,
            hasDlc: html.indexOf('Step 1b') !== -1,
            hasRank: html.indexOf('Step 1c') !== -1,
            hasCadre: html.indexOf('Step 1d') !== -1,
        };
    });
    ok('no stray "undefined" text node in the module', poMarkup.strayUndefined === false);
    ok('step 1 renders the exercise card', poMarkup.hasExercise === true);
    ok('step 1 renders the DLC composition card', poMarkup.hasDlc === true);
    ok('step 1 renders the rank master', poMarkup.hasRank === true);
    ok('step 1 renders the fixed cadre set', poMarkup.hasCadre === true);
    ok('only the current step is OPEN', poStepCheck.states.filter(x => x === 'OPEN').length === 1,
        poStepCheck.states.join(','));

    // ── 6b. PO engine invariants reachable from the page ─────────────────
    console.log('\n[PO engine invariants]');
    const poInv = await page.evaluate(async () => {
        const src = POEngine;
        return {
            hasRun: typeof src.runAllocation === 'function',
            hasValidateFsl: typeof src.validateFSL === 'function',
            hasValidateSeniorityList: typeof src.validateSeniorityList === 'function',
            hasValidateFal: typeof src.validateFAL === 'function',
            noOverAllocCode: /over_allocation|allocate anyway/.test(String(src.runAllocation) + String(src.runAllocation.toString())),
            segPercentsConfigurable: typeof poState.segPercents.SC_1 === 'number',
            reasons: src.PO_ALLOC_REASONS.map(r => r.id),
            tiers: src.PO_ALLOC_TIERS.map(t => t.order + ':' + t.label),
            seg: src.PO_SEG_GROUPS.map(g => g.id + '=' + g.percent),
            claims: src.PO_PREF_CLAIMS.map(c => c.id),
            goRef: src.PO_GO_REFERENCE.order,
            goScope: src.PO_GO_REFERENCE.scope,
            districts: src.PO_DISTRICTS.map(d => d.id + '/' + d.cadre_type),
            seededCadres: poState.cadres.map(c => c.id),
            seededCategories: poState.categories.length,
            noDslFn: typeof poState.dsl,
            noObjectionFns: [typeof poRaiseObjection, typeof poObjectionWindowOpen, typeof poFslEligible, typeof poBuildFslFromDsl].join(','),
            noAuditFn: typeof poAudit,
            noAuditStore: typeof poState.audit,
            noDashboardFn: typeof poDashboard,
            noDslValidator: typeof src.validateDSL,
            scstBasis: src.PO_SEG_BASIS,
            compulsoryPolicies: src.PO_COMPULSORY_POLICIES.length,
            roundingPolicies: src.PO_ROUNDING_POLICIES.length,
            compulsoryPolicy: poState.policy.compulsory_allocation_policy,
            repository: poRepository ? poRepository.kind : 'missing',
            storageNotice: String(poState.storage_mode_notice).indexOf('NOT AN AUTHORITATIVE OFFICIAL RECORD') !== -1,
            disclaimer: src.PO_GO_REFERENCE.disclaimer,
            engineHash: src.poEngineHash(),
            joiningStatuses: PO_JOINING_STATUS.join(','),
        };
    });
    ok('POEngine.runAllocation exposed', poInv.hasRun);
    ok('POEngine.validateFSL exposed', poInv.hasValidateFsl);
    ok('POEngine.validateSeniorityList exposed', poInv.hasValidateSeniorityList);
    ok('POEngine.validateFAL exposed', poInv.hasValidateFal);
    ok('no over-allocation fallback in engine', poInv.noOverAllocCode === false);
    ok('SC/ST percentages are configuration driven', poInv.segPercentsConfigurable === true);
    ok('8 allocation reasons including the SC/ST reserved share',
        poInv.reasons.length === 8 && poInv.reasons.indexOf('SC_ST_RESERVED_ALLOTMENT') !== -1,
        poInv.reasons.join(','));
    ok('allocation tiers run PH, widow, health, SC/ST, seniority',
        poInv.tiers.length === 5 && poInv.tiers[0].indexOf('1:') === 0 && poInv.tiers[4].indexOf('5:') === 0,
        poInv.tiers.join(' | '));
    ok('SC/ST percentages from the order', poInv.seg.join(',') === 'SC_1=1,SC_2=6.5,SC_3=7.5,ST=6', poInv.seg.join(','));
    ok('8 preferential claims in GO order',
        poInv.claims.join(',') === 'pwbd,disabled_children,widow,cancer,neurosurgery,kidney,liver,heart', poInv.claims.join(','));
    ok('the exercise is fixed to Krishna, NTR and Eluru',
        poInv.districts.join(',') === 'DC_KRISHNA/RESIDUARY_ERSTWHILE,DC_NTR/NEWLY_FORMED_DISTRICT,DC_ELURU/CONTIGUOUS_DISTRICT',
        poInv.districts.join(','));
    ok('cadres unchanged (Krishna/NTR/Eluru)',
        poInv.seededCadres.join(',') === 'DC_KRISHNA,DC_NTR,DC_ELURU', poInv.seededCadres.join(','));
    ok('rank categories seeded', poInv.seededCategories > 0, String(poInv.seededCategories));
    ok('there is no DSL store', poInv.noDslFn === 'undefined', poInv.noDslFn);
    ok('the objection subsystem does not exist', poInv.noObjectionFns === 'undefined,undefined,undefined,undefined', poInv.noObjectionFns);
    ok('the audit mechanism does not exist',
        poInv.noAuditFn === 'undefined' && poInv.noAuditStore === 'undefined',
        poInv.noAuditFn + ' / ' + poInv.noAuditStore);
    ok('the DLC dashboard does not exist', poInv.noDashboardFn === 'undefined', poInv.noDashboardFn);
    ok('validateDSL is gone', poInv.noDslValidator === 'undefined', poInv.noDslValidator);
    ok('joining statuses PENDING/JOINED/OVERDUE/EXCEPTION',
        poInv.joiningStatuses === 'PENDING,JOINED,OVERDUE,EXCEPTION', poInv.joiningStatuses);
    ok('SC/ST basis is fixed to final working strength', poInv.scstBasis === 'FINAL_WORKING_STRENGTH', poInv.scstBasis);
    ok('3 compulsory-allocation policies offered', poInv.compulsoryPolicies === 3, String(poInv.compulsoryPolicies));
    ok('3 SC/ST rounding policies offered', poInv.roundingPolicies === 3, String(poInv.roundingPolicies));
    ok('a policy decision is recorded', !!poInv.compulsoryPolicy, poInv.compulsoryPolicy);
    ok('repository abstraction active', poInv.repository === 'LOCALSTORAGE', poInv.repository);
    ok('storage mode clearly labelled as non-authoritative', poInv.storageNotice === true);
    ok('engine hash stamped for reproducibility', /^fnv1a-/.test(poInv.engineHash), poInv.engineHash);
    ok('disclaimer avoids any compliance claim',
        /subject to the competent authority/.test(poInv.disclaimer) && !/compliant/i.test(poInv.disclaimer),
        poInv.disclaimer);

    // ── 6c. drill-down interactions (real functionality) ─────────────────
    console.log('\n[drill-down]');
    const drill = await page.evaluate(async () => {
        showPage('erstwhile');
        await new Promise(r => setTimeout(r, 400));

        const group = document.querySelector('#erstwhile .sub-tile');
        if (!group) return { group: false };
        group.click();                                  // rank group  -> showEWRanks
        await new Promise(r => setTimeout(r, 500));
        const rankTiles = document.querySelectorAll('#ewRankTiles .rank-tile');
        const rankSectionVisible = document.getElementById('ewRankSection').classList.contains('visible');

        const tile = rankTiles[0];
        if (!tile) return { group: true, rankTiles: rankTiles.length, rankSectionVisible };
        tile.click();                                    // rank  -> selectEWRank (strength only)
        await new Promise(r => setTimeout(r, 600));
        const midStrength = document.getElementById('ewStrengthSection').classList.contains('visible');
        const midPersonnel = document.getElementById('ewPersonnelSection').classList.contains('visible');
        const strength = {
            actual: document.getElementById('ewActual').textContent.trim(),
            sanctioned: document.getElementById('ewSanctioned').textContent.trim(),
            vacancies: document.getElementById('ewVacancies').textContent.trim(),
            title: document.getElementById('ewStrengthTitle').textContent.trim(),
        };
        showEWPersonnel();                               // explicit "View Personnel"
        await new Promise(r => setTimeout(r, 700));
        return {
            group: true,
            rankTiles: rankTiles.length,
            rankSectionVisible,
            rank: tile.textContent.trim(),
            rankActive: tile.classList.contains('active'),
            midStrength, midPersonnel,
            strength,
            rows: document.querySelectorAll('#ewPersonnelBody tr').length,
            firstCell: document.querySelector('#ewPersonnelBody tr td')?.textContent.trim(),
            personnelVisible: document.getElementById('ewPersonnelSection').classList.contains('visible'),
        };
    });
    ok('erstwhile rank-group sub-tile click', drill.group === true);
    ok('rank tiles generated', drill.rankTiles > 0, `${drill.rankTiles} ranks`);
    ok('rank section revealed', drill.rankSectionVisible === true);
    ok('rank tile click works', drill.rankActive === true, drill.rank);
    ok('strength section revealed on rank click', drill.midStrength === true);
    ok('personnel hidden until View Personnel', drill.midPersonnel === false);
    ok('sanctioned strength populated', drill.strength.sanctioned === '40', `sanctioned=${drill.strength.sanctioned} actual=${drill.strength.actual} vac=${drill.strength.vacancies}`);
    ok('strength title reflects rank', drill.strength.title.includes(drill.rank), drill.strength.title);
    ok('View Personnel reveals rows', drill.personnelVisible === true);
    ok('personnel rows render', drill.rows > 0, `${drill.rows} rows, first="${drill.firstCell}"`);

    // station drill-down
    const st = await page.evaluate(async () => {
        await showPSPage();
        await new Promise(r => setTimeout(r, 600));
        const t = document.querySelector('#psSubDivisionTiles .sub-tile');
        if (!t) return { found: false, n: document.querySelectorAll('#psSubDivisionTiles > *').length };
        t.click();
        await new Promise(r => setTimeout(r, 700));
        return {
            found: true,
            circles: document.querySelectorAll('#psCircleTiles .sub-tile').length,
            circleVisible: document.getElementById('psCircleSection').classList.contains('visible'),
        };
    });
    ok('police station sub-division click', st.found === true);
    ok('circle tiles generated', st.circles > 0, `${st.circles} circles`);
    ok('circle section revealed', st.circleVisible === true);

    // ── 7. modals ───────────────────────────────────────────────────────
    console.log('\n[modals]');
    const modal = await page.evaluate(async () => {
        showPage('dashboard');
        await new Promise(r => setTimeout(r, 200));
        openAddModal();
        await new Promise(r => setTimeout(r, 500));
        const ov = document.querySelector('.modal-overlay');
        const m = document.querySelector('.modal');
        const cs = getComputedStyle(ov);
        const out = {
            overlayDisplay: cs.display,
            bg: cs.backgroundColor,
            modalRadius: getComputedStyle(m).borderRadius,
            fields: m.querySelectorAll('input, select, textarea').length,
            footerBtns: m.querySelectorAll('.modal-footer button').length,
        };
        closeModal && closeModal();
        return out;
    });
    ok('add-personnel modal opens', modal.overlayDisplay === 'flex', modal.overlayDisplay);
    ok('modal overlay dimmed', /rgba/.test(modal.bg), modal.bg);
    ok('modal radius 18px', modal.modalRadius === '18px', modal.modalRadius);
    ok('modal fields present', modal.fields > 10, `${modal.fields} inputs`);
    ok('modal footer buttons', modal.footerBtns >= 2, String(modal.footerBtns));

    // ── 8. every used class resolves to a real rule ─────────────────────
    console.log('\n[class coverage]');
    const coverage = await page.evaluate(() => {
        const defined = new Set();
        for (const sh of document.styleSheets) {
            try {
                const walk = rules => {
                    for (const r of rules) {
                        if (r.selectorText) r.selectorText.split(',').forEach(s => {
                            s.replace(/^[^\w-]*/, '').split(/[\s.:>#\[]/).filter(Boolean).forEach(c => defined.add(c));
                        });
                        if (r.cssRules) walk(r.cssRules);
                    }
                };
                walk(sh.cssRules);
            } catch { }
        }
        const used = new Set();
        document.querySelectorAll('[class]').forEach(e => e.classList.forEach(c => used.add(c)));
        return { missing: [...used].filter(c => !defined.has(c)), usedCount: used.size };
    });
    ok('no unstyled classes', coverage.missing.length === 0, coverage.missing.length ? coverage.missing.join(',') : `${coverage.usedCount} classes all styled`);

    // ── screenshots ─────────────────────────────────────────────────────
    console.log('\n[screenshots]');
    const shots = [
        ['dashboard', 1440, 900], ['erstwhile', 1440, 900], ['policeStation', 1440, 900],
        ['deputation', 1440, 900], ['presidentialOrder', 1440, 900], ['searchFilter', 1440, 900],
        ['dashboard', 390, 844], ['erstwhile', 390, 844],
    ];
    for (const [pid, w, h] of shots) {
        await page.setViewportSize({ width: w, height: h });
        await page.evaluate(async (p) => { showPage(p); await new Promise(r => setTimeout(r, 700)); }, pid);
        const f = path.join(SHOTS, `${pid}-${w}.png`);
        await page.screenshot({ path: f, fullPage: false });
        console.log('  saved', path.relative(ROOT, f));
    }
    // login screen
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => handleLogout());
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOTS, 'login.png') });
    console.log('  saved .smoke/shots/login.png');

    console.log('\n===== RESULT =====');
    const realErrs = errs.filter(e => !/API Error|Auth Error|Failed to load|net::ERR/.test(e));
    console.log('JS/page errors :', errs.length, errs.length ? '\n  ' + errs.join('\n  ') : '(none)');
    console.log('Failed requests:', failed.length, failed.length ? '\n  ' + failed.join('\n  ') : '(none)');
    console.log('Ignored (mock API noise):', errs.length - realErrs.length);
    console.log(fail.length ? `\nFAILURES (${fail.length}):\n  ` + fail.join('\n  ') : '\nALL CHECKS PASSED');

    await browser.close();
    server.close();
    process.exit(fail.length || realErrs.length ? 1 : 0);
})();