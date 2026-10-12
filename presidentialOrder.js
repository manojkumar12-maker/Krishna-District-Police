// ============================================================================
// presidentialOrder.js  —  Presidential Order-2025 / G.O.Ms.No.129  UI
// ----------------------------------------------------------------------------
// Stage-based screens (para 28). One step is open at a time; every completed
// step is locked and rendered read-only.
//
// Rendering only. All official-input mutations live in poCore.js and all
// allocation / validation maths in poEngine.js.
// ============================================================================

const PO_STEP_CONTENT = 'poTabContent';
let poCurrentStep = 0;
let poFals = { view: 'cadre', query: '' };

// --- small UI helpers -------------------------------------------------------

function poQs(s) {
    const v = s === undefined || s === null ? '' : String(s);
    return typeof escapeQuotes === 'function' ? escapeQuotes(v) : v.replace(/'/g, "\\'");
}

function poTd(v, style) {
    const s = (v === undefined || v === null || String(v).trim() === '') ? '<span style="color:var(--text-subtle)">-</span>' : escapeHtml(v);
    return style ? '<td style="' + style + '">' + s + '</td>' : '<td>' + s + '</td>';
}

function poDash(v) { return (v === undefined || v === null || String(v).trim() === '') ? '-' : escapeHtml(v); }

function poSev(severity) {
    const map = { ERROR: 'danger', BLOCKING: 'danger', WARNING: 'warn', PASS: 'success', INFO: 'info' };
    return '<span class="po-badge po-badge-' + (map[severity] || 'info') + '">' + escapeHtml(severity) + '</span>';
}

function poCard(title, body, actions) {
    return '<div class="card">' +
        '<div class="po-card-head"><h3>' + title + '</h3>' + (actions ? '<div class="po-actions">' + actions + '</div>' : '') + '</div>' +
        body + '</div>';
}

function poStats(items) {
    return '<div class="po-stat-grid">' + items.map(i =>
        '<div class="po-stat"><div class="po-stat-num">' + escapeHtml(i.value) + '</div><div class="po-stat-label">' + escapeHtml(i.label) + '</div></div>'
    ).join('') + '</div>';
}

function poTable(headers, rows, cls) {
    if (!rows.length) return '<div class="empty-state">Nothing to show yet.</div>';
    return '<div class="po-table-wrap"><table class="' + (cls || '') + '"><thead><tr>' +
        headers.map(h => '<th>' + escapeHtml(h) + '</th>').join('') +
        '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
}

function poTally(list) {
    if (!list || !list.length) return '<span style="color:var(--text-subtle)">-</span>';
    return list.map(x => '<span class="po-chip">' + escapeHtml(x.key) + ' (' + x.count + ')</span>').join(' ');
}

function poValidationPanel(title, report) {
    if (!report) return '';
    const rows = []
        .concat((report.errors || []).map(e => Object.assign({ severity: 'ERROR' }, e)))
        .concat((report.blocking || []).map(e => Object.assign({ severity: 'BLOCKING' }, e)))
        .concat((report.warnings || []).map(e => Object.assign({ severity: 'WARNING' }, e)))
        .map(i => '<tr>' + poTd(i.severity, 'width:90px') + poTd(i.code, 'width:190px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px') +
            poTd(i.employee_id, 'width:110px;font-size:11px') + poTd(i.message) + '</tr>');
    const passed = report.passed || [];
    const passedHtml = passed.length
        ? '<details class="po-passed"><summary>' + passed.length + ' check(s) passed</summary><ul>' +
          passed.slice(0, 80).map(p => '<li>' + escapeHtml(p) + '</li>').join('') + '</ul></details>'
        : '';
    return '<div class="po-validation">' +
        '<div class="po-validation-head">' +
            '<span class="po-badge po-badge-' + (report.valid ? 'success' : 'danger') + '">' + (report.valid ? 'PASS' : 'BLOCKING') + '</span>' +
            '<span class="po-badge po-badge-warn">' + ((report.warnings || []).length) + ' warning(s)</span>' +
            (report.errors ? '<span class="po-badge po-badge-danger">' + report.errors.length + ' error(s)</span>' : '') +
        '</div>' +
        (rows.length ? '<div class="po-table-wrap"><table><thead><tr><th>Severity</th><th>Code</th><th>Employee</th><th>Detail</th></tr></thead><tbody>' + rows.join('') + '</tbody></table></div>' : '') +
        passedHtml +
    '</div>';
}


// ============================================================================
// Module shell
// ============================================================================

function showPOPage() {
    poLoad();
    renderPOModule();
}

function renderPOModule() {
    const container = document.getElementById('poMainContent');
    if (!container) { console.error('poMainContent not found'); return; }
    try {
        const stepIdx = poCurrentStepIndex();
        poCurrentStep = stepIdx;

        const header =
            '<div class="po-head">' +
                '<div class="po-head-main">' +
                    '<div class="po-head-title">Presidential Order-2025 &middot; District Level Implementation Committee</div>' +
                    '<div class="po-head-sub">' +
                        escapeHtml(POEngine.PO_GO_REFERENCE.order) + ', ' + escapeHtml(POEngine.PO_GO_REFERENCE.department) +
                        ', dated ' + escapeHtml(POEngine.PO_GO_REFERENCE.date) + ' &middot; Scope: ' + escapeHtml(POEngine.PO_GO_REFERENCE.scope) +
                    '</div>' +
                    '<div class="po-note po-note-danger po-head-warn">' +
                        '<strong>LOCAL DEVELOPMENT MODE &mdash; NOT AN AUTHORITATIVE OFFICIAL RECORD.</strong> ' +
                        'PO exercise data is held in this browser only. It is not a shared DLC record, has no central backup ' +
                        'and must not be treated as the statutory register. ' +
                        escapeHtml(POEngine.PO_GO_REFERENCE.disclaimer) +
                    '</div>' +
                    '<div class="po-head-meta">' +
                        '<span class="po-chip">Exercise: ' + poDash(poState.exercise.exercise_id || 'NOT CONFIGURED') + '</span>' +
                        '<span class="po-chip">Department: ' + poDash(poState.exercise.department || '-') + '</span>' +
                        '<span class="po-chip po-chip-strong">Stage: ' + escapeHtml(poStage()) + '</span>' +
                        '<span class="po-chip">Engine ' + escapeHtml(POEngine.PO_ENGINE_VERSION) + '</span>' +
                        '<span class="po-chip">FWS ' + escapeHtml(poVersionLabel('fws')) + '</span>' +
                        '<span class="po-chip">Seniority list ' + escapeHtml(poVersionLabel('fsl')) + '</span>' +
                        '<span class="po-chip">Options ' + escapeHtml(poVersionLabel('options')) + '</span>' +
                        '<span class="po-chip">FAL ' + escapeHtml(poVersionLabel('fal')) + '</span>' +
                    '</div>' +
                '</div>' +
                '<div class="po-actions">' +
                    (poIsAdmin() ? '<button class="btn btn-danger btn-sm" onclick="poResetAll()">Reset Module</button>' : '') +
                '</div>' +
            '</div>' +
            '<div class="po-rail">' + PO_STEPS.map((s, i) => {
                const state = poStepState(i);
                return '<button class="po-step ' + state + '" onclick="poGotoStep(' + i + ')">' +
                    '<span class="po-step-n">' + s.n + '</span>' +
                    '<span class="po-step-l">' + escapeHtml(s.label) + '</span>' +
                    (state === 'LOCKED' && i > stepIdx ? '<span class="po-step-lock">locked</span>' : '') +
                '</button>';
            }).join('') + '</div>' +
            '<div id="' + PO_STEP_CONTENT + '"></div>';

        container.innerHTML = header;
        renderCurrentPOTab();
    } catch (e) {
        console.error('renderPOModule error:', e);
        container.innerHTML = '<div class="card"><h2>Error</h2><p style="color:var(--danger);">' + escapeHtml(e.message) + '</p><pre style="font-size:11px;">' + escapeHtml(e.stack || '') + '</pre></div>';
    }
}

function poGotoStep(i) {
    if (i > poCurrentStepIndex()) { showToast('That step is locked. Complete the current stage first.', 'error'); return; }
    poCurrentStep = i;
    renderPOModule();
}

function switchPOTab(stepKey) {
    const i = PO_STEPS.findIndex(s => s.key === stepKey);
    if (i >= 0) poGotoStep(i);
}

function renderCurrentPOTab() {
    const content = document.getElementById(PO_STEP_CONTENT);
    if (!content) return;
    const i = Math.min(poCurrentStep, PO_STEPS.length - 1);
    try {
        switch (PO_STEPS[i].key) {
            case 'ranks': renderStepRanks(content); break;
            case 'strength': renderStepStrength(content); break;
            case 'seniority': renderStepSeniority(content); break;
            case 'options': renderStepOptions(content); break;
            case 'allocation': renderStepAllocation(content); break;
            case 'fal': renderStepFal(content); break;
            case 'orders': renderStepOrders(content); break;
        }
        poRenderAdvance(content);
    } catch (e) {
        console.error('renderCurrentPOTab error:', e);
        content.innerHTML = '<div class="card"><h2>Error in step ' + PO_STEPS[i].n + '</h2><p style="color:var(--danger);">' + escapeHtml(e.message) + '</p><pre style="font-size:11px;">' + escapeHtml(e.stack || '') + '</pre></div>';
    }
}

/** Locked-step banner + the single "advance the workflow" control. */
function poRenderAdvance(content) {
    const guard = poStageGuard();
    const next = guard.next;
    const locked = poStageIdx(poStage()) > poStageIdx(PO_STEPS[poCurrentStep].from) && poStage() !== 'EXERCISE_CLOSED';
    const closed = poStage() === 'EXERCISE_CLOSED';

    const blocks = [];
    if (locked) blocks.push('<div class="po-note po-note-info">This step is complete and locked. It is shown for the record. ' +
        'Any change now requires a revision workflow with a reason.</div>');
    if (closed) blocks.push('<div class="po-note po-note-info">The exercise is closed. The whole record is retained read-only.</div>');

    const guardHtml =
        '<div class="card po-advance">' +
            '<h3>Workflow control</h3>' +
            blocks.join('') +
            (guard.errors.length
                ? '<div class="po-note po-note-danger"><strong>Cannot advance to ' + escapeHtml(next || '-') + ':</strong><ul>' +
                  guard.errors.map(e => '<li>' + escapeHtml(e) + '</li>').join('') + '</ul></div>'
                : '') +
            (guard.warnings.length
                ? '<div class="po-note po-note-warn"><strong>Advisories:</strong><ul>' +
                  guard.warnings.map(e => '<li>' + escapeHtml(e) + '</li>').join('') + '</ul></div>'
                : '') +
            (next && !closed
                ? '<div class="po-advance-row">' +
                    '<div>Next stage: <strong>' + escapeHtml(next) + '</strong></div>' +
                    '<button class="btn btn-primary" ' + (guard.ok ? '' : 'disabled') + ' onclick="poAdvanceStage()">' +
                        (guard.ok ? 'Advance to ' + escapeHtml(next) : 'Blocked') + '</button>' +
                  '</div>'
                : '') +
            (closed ? '<div class="po-advance-row"><div>Exercise closed at ' + escapeHtml(poState.exercise.modified_at || '') + '</div></div>' : '') +
        '</div>';

    const div = document.createElement('div');
    div.innerHTML = guardHtml;
    while (div.firstChild) content.appendChild(div.firstChild);
}

function poAdvanceStage() {
    const reason = prompt('Reason / remark for advancing the workflow stage:', '');
    if (reason === null) return;
    const r = poAdvance(reason || '');
    if (!r.ok) { showToast('Stage not advanced: ' + (r.guard.errors[0] || 'guard failed'), 'error'); return; }
    showToast('Workflow advanced: ' + r.from + ' -> ' + r.to, 'success');
    poCurrentStep = poCurrentStepIndex();
    renderPOModule();
}


// ============================================================================
// STEP 1 - DLC Configuration (para 1)
// ============================================================================

/**
 * Exercise reference data and the DLC composition. There is no dedicated
 * "DLC Configuration" screen: this sits inside step 1 alongside the rank and
 * cadre masters, because the same values are needed by both (scope, competent
 * authority and exercise identity appear on every downstream document).
 */
function renderExerciseCards() {
    const ex = poState.exercise;
    const editable = poIsAdmin() && poStageIdx(poStage()) <= poStageIdx('CADRE_CONFIGURED');

    // Nine prescribed seats. Only the designation is an official input - the
    // members sign the generated lists, so no name is ever captured.
    const seats = poDlcSeats();
    const dlc = poDlc();

    const field = (label, id, val, opts) => {
        const o = opts || {};
        if (!editable) return '<div class="form-group"><label>' + escapeHtml(label) + '</label><div class="po-readonly">' + poDash(val) + '</div></div>';
        if (o.type === 'textarea') {
            return '<div class="form-group"><label>' + escapeHtml(label) + '</label><textarea id="' + id + '" rows="2">' + escapeHtml(val) + '</textarea></div>';
        }
        return '<div class="form-group"><label>' + escapeHtml(label) + '</label><input type="' + (o.type || 'text') + '" id="' + id + '" value="' + escapeHtml(val) + '"' + (o.readonly ? ' readonly' : '') + '></div>';
    };

    return poCard('Step 1a &middot; Exercise',
            '<p class="po-hint">Official input. Nothing here is generated by the system.</p>' +
            '<div class="form-grid">' +
                field('Exercise ID *', 'poExId', ex.exercise_id) +
                field('Department *', 'poExDept', ex.department) +
                field('Erstwhile District *', 'poExErst', ex.erstwhile_district) +
                field('Current / New District(s)', 'poExNew', ex.new_districts) +
                field('Cadre scope', 'poExScope', ex.cadre_scope, { readonly: true }) +
                field('Exercise status', 'poExStatus', ex.status, { readonly: true }) +
                field('Created date', 'poExCreated', (ex.created_at || '').slice(0, 10), { readonly: true }) +
                field('Last modified', 'poExModified', (ex.modified_at || '').slice(0, 10), { readonly: true }) +
            '</div>' +
            '<div class="po-note po-note-info">For district-level processing the cadre scope is fixed to <strong>' +
            escapeHtml(POEngine.PO_GO_REFERENCE.scope) + '</strong>. Zonal and multi-zonal allocation are not handled by this module and are never mixed in.</div>' +
            (editable ? '<div class="po-actions"><button class="btn btn-primary" onclick="poSaveExerciseFromForm()">Save exercise</button></div>' : ''),
            '') +
        poCard('Step 1b &middot; DLC composition as prescribed by ' + escapeHtml(POEngine.PO_GO_REFERENCE.order),
            '<p class="po-hint">The composition is fixed by the order: <strong>1 Chairman, 2 Co-Chairmen, 1 Member-Convener, ' +
            '2 Co-Convener, 1 Member and 2 Co-Members</strong>. Record the designation of each seat — the members sign the generated ' +
            'lists themselves, so their names are not held in this system.</p>' +
            poTable(['Seat', 'Prescribed holder', 'Designation'],
                seats.map((s, i) => '<tr>' +
                    '<td><strong>' + escapeHtml(poSeatLabel(s)) + '</strong></td>' +
                    poTd(s.desc) +
                    poTd(dlc[i] ? dlc[i].designation : '') +
                '</tr>')) +
            (editable
                ? '<div class="form-grid">' +
                    seats.map((s, i) =>
                        '<div class="form-group"><label>' + escapeHtml(poSeatLabel(s)) + ' &mdash; designation</label>' +
                        '<input id="poDlc_' + i + '" value="' + escapeHtml(dlc[i] ? dlc[i].designation : '') + '"></div>'
                    ).join('') +
                  '</div>' +
                  '<div class="po-actions"><button class="btn btn-primary" onclick="poSaveMembersFromForm()">Save composition</button></div>'
                : '<div class="po-note po-note-info">Signatories sign the generated FAL, OOA and OOT.</div>'),
            '') +
        poCard('Exercise status summary', poStats([
            { value: poState.cadres.length, label: 'Cadres' },
            { value: poState.strengths.reduce((n, s) => n + (parseInt(s.fws) || 0), 0), label: 'Total FWS' },
            { value: poState.categories.length, label: 'Rank categories' },
            { value: poState.fsl.length, label: 'Seniority list records' },
            { value: poState.fsl.filter(r => POEngine.poPreferredClaim(r)).length, label: 'Preferential' }
        ]), '');
}

function poSaveExerciseFromForm() {
    const g = id => (document.getElementById(id) || {}).value || '';
    poState.exercise.exercise_id = g('poExId');
    poState.exercise.department = g('poExDept');
    poState.exercise.erstwhile_district = g('poExErst');
    poState.exercise.new_districts = g('poExNew');
    poState.exercise.cadre_scope = 'District and Contiguous District Cadre';
    if (poSaveExercise()) { showToast('DLC configuration saved', 'success'); renderPOModule(); }
}

function poSaveMembersFromForm() {
    const seats = poDlcSeats();
    const dlc = poDlc();
    // Write back against the prescribed seat order, never against whatever the
    // saved order happens to be, so a re-ordered array cannot shift a designation.
    seats.forEach((s, i) => { dlc[i].designation = ((document.getElementById('poDlc_' + i) || {}).value || '').trim(); });
    if (poSaveExercise()) { showToast('DLC composition saved', 'success'); renderPOModule(); }
}


// ============================================================================
// STEP 1 - Exercise + DLC composition + rank master + cadre configuration (para 1, 2, 3)
// ============================================================================

function renderStepRanks(content) {
    const editable = poIsAdmin() && poStageIdx(poStage()) <= poStageIdx('CADRE_CONFIGURED');
    const ctx = poCtx();

    const catRows = poState.categories.map(c => {
        const configured = poState.strengths.filter(s => s.category_id === c.id).length;
        const approved = (poState.approved.find(a => a.category_id === c.id) || {}).approved_working_strength;
        return '<tr>' +
            poTd(c.id, 'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px') + poTd(c.code) + poTd(c.name) +
            poTd(c.department) + poTd(c.erstwhile_cadre) +
            (editable
                ? '<td><input type="number" min="0" class="po-strength-input" style="width:90px" value="' + (approved === undefined ? '' : approved) + '" onchange="poSetApprovedFromForm(\'' + poQs(c.id) + '\',this.value)"></td>'
                : poTd(String(approved === undefined ? '-' : approved))) +
            '<td>' + configured + '</td>' +
            '<td><span class="po-badge po-badge-' + (c.status === 'ACTIVE' ? 'success' : 'info') + '">' + escapeHtml(c.status) + '</span></td>' +
            '<td>' + (editable
                ? '<button class="action-btn btn-primary" onclick="poEditCategory(\'' + poQs(c.id) + '\')">Edit</button> ' +
                  '<button class="action-btn btn-danger" onclick="poDeleteCategory(\'' + poQs(c.id) + '\')">Del</button>'
                : '<span style="color:var(--text-subtle)">locked</span>') + '</td>' +
        '</tr>';
    });

    const cadreRows = poState.cadres.map(c => {
        const fws = poState.strengths.filter(s => s.cadre_id === c.id).reduce((n, s) => n + (parseInt(s.fws) || 0), 0);
        const type = POEngine.PO_CADRE_TYPES.find(t => t.id === c.cadre_type);
        const loaded = poState.fsl.filter(r => r.erstwhile_cadre_id === c.id || r.present_local_cadre_id === c.id).length;
        return '<tr>' +
            poTd(c.id, 'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px') + poTd(c.name) +
            poTd(type ? type.label : c.cadre_type) + poTd(String(fws)) + poTd(String(loaded)) +
            '</tr>';
    });

    content.innerHTML =
        renderExerciseCards() +
        poCard('Step 1c &middot; Post category / rank master',
            '<p class="po-hint">Ranks are configuration, not law. Add them here or upload a .csv/.xlsx file. ' +
            'The module holds its own data only and never reads any external master. The allocation engine never mixes two categories.</p>' +
            (editable
                ? '<div class="po-actions" style="margin-bottom:12px;">' +
                    '<button class="btn btn-primary" onclick="poEditCategory(\'\')">+ Add category</button>' +
                    '<button class="btn btn-secondary" onclick="poDownloadCategoryTemplate()">Download template</button>' +
                    '<button class="btn btn-secondary" onclick="document.getElementById(\'poCategoryFile\').click()">Upload categories (.csv/.xlsx)</button>' +
                    '<input type="file" id="poCategoryFile" accept=".csv,.xlsx,.xls" style="display:none" onchange="poImportCategoryFile(this)">' +
                  '</div>'
                : '') +
            poTable(['Category ID', 'Code', 'Category name', 'Department', 'Erstwhile cadre', 'Approved working strength', 'Cadres configured', 'Status', ''], catRows), '') +

        poCard('Step 1e &middot; Preferential categories and SC/ST reservation',
            '<div class="po-note po-note-info">These are <strong>two separate GO requirements</strong> and are never applied as one. ' +
            'Preferential categories decide the <strong>order of processing</strong>; SC/ST reservation decides ' +
            '<strong>representation while distributing the working strength</strong>. An SC/ST employee receives no preferential ranking.</div>' +
            '<div class="form-grid">' +
                '<div class="form-group"><label>Preferential categories (clauses ix&ndash;xii)</label>' +
                    '<div class="po-readonly">' + POEngine.PO_PREF_CLAIMS.map(d =>
                        escapeHtml(d.label) + (d.minPercent ? ' &mdash; ' + d.minPercent + '% or above' : '')).join('<br>') +
                    '</div>' +
                    '<div class="po-policy-notice">' + escapeHtml(POEngine.PO_PREF_NOTICE) + '</div></div>' +
                '<div class="form-group"><label>SC/ST reserved proportion</label>' +
                    '<div class="po-readonly">' + POEngine.PO_SEG_GROUPS.map(g =>
                        escapeHtml(g.label) + ' &mdash; ' + g.percent + '%').join('<br>') +
                    '</div>' +
                    '<div class="po-policy-notice">' + escapeHtml(POEngine.PO_SEG_NOTICE) + '</div></div>' +
            '</div>') +

        poCard('Step 1d &middot; The three district cadres',
            '<div class="po-note po-note-info">The cadre set is <strong>fixed by the module</strong>: Krishna, NTR and Eluru. ' +
            'It cannot be added to, renamed or retyped, so a rank&rsquo;s working strength is always entered against these three. ' +
            'The seniority list for each cadre is uploaded separately in Step 3.</div>' +
            poTable(['Cadre ID', 'Cadre name', 'Cadre type', 'Total FWS', 'List records'], cadreRows), '') +

        poCard('Scope declaration',
            '<div class="po-readonly-block"><strong>' + escapeHtml(POEngine.PO_GO_REFERENCE.scope) + '</strong><br>' +
            'Cadre types in use: ' + poState.cadres.map(c => escapeHtml((POEngine.PO_CADRE_TYPES.find(t => t.id === c.cadre_type) || {}).label || c.cadre_type)).join(' &middot; ') +
            '<br>Zonal / multi-zonal allocation is out of scope for this module and is never combined with district allocation.</div>', '') +

        renderPolicyPanel();
}

/**
 * PART 10 / 11 / 14 — the allocation policy.
 *
 * Nothing on this panel is a GO requirement. The GO permits compulsory allotment
 * to any available clear post within working strength and specifies the SC/ST
 * percentages on a working-strength basis; it does NOT prescribe the tie-breaker,
 * the prefer-existing switch, or the rounding convention. All three are DLC
 * decisions, labelled as such, and are frozen before ALLOCATION_RUNNING.
 */
function renderPolicyPanel() {
    const pol = poState.policy || {};
    const frozen = poPolicyFrozen();
    const canEdit = poIsAdmin() && !frozen && poStageIdx(poStage()) < poStageIdx('ALLOCATION_RUNNING');
    const splitEditable = poIsAdmin() && !frozen && poStageIdx(poStage()) <= poStageIdx('WORKING_STRENGTH_FINALIZED');
    const splitPercents = pol.district_split || POEngine.PO_DEFAULT_DISTRICT_SPLIT;

    const sel = (field, options, current, label, notice) => {
        const opts = options.map(o => '<option value="' + escapeHtml(o.id) + '"' +
            (o.id === current ? ' selected' : '') + '>' + escapeHtml(o.label) + '</option>').join('');
        return '<div class="form-group"><label>' + escapeHtml(label) + '</label>' +
            (canEdit
                ? '<select onchange="poSetPolicyFromUi(\'' + field + '\',this.value)">' + opts + '</select>'
                : '<div class="po-readonly">' + escapeHtml((options.find(o => o.id === current) || {}).label || current) + '</div>') +
            '<div class="po-policy-notice">' + escapeHtml(notice) + '</div></div>';
    };

    return poCard('Allocation policy &mdash; DLC configuration (not a GO requirement)',
        '<div class="po-note po-note-warn">' +
            (frozen
                ? '<strong>FROZEN.</strong> Frozen at ' + escapeHtml(String(pol.frozen_at || '').slice(0, 19).replace('T', ' ')) +
                  ' by ' + escapeHtml(pol.frozen_by || '') + '. It cannot be changed: the allocation run snapshot records it.'
                : 'These are <strong>DLC policy decisions</strong>, not provisions of the order. They must be settled and frozen before ALLOCATION_RUNNING.') +
        '</div>' +
        '<div class="form-grid">' +
            sel('compulsory_allocation_policy', POEngine.PO_COMPULSORY_POLICIES, pol.compulsory_allocation_policy,
                'Compulsory allotment tie-breaker', POEngine.PO_POLICY_NOTICE_COMPULSORY) +
            '<div class="form-group"><label>Prefer existing local cadre during compulsory allocation</label>' +
                (canEdit
                    ? '<select onchange="poSetPolicyFromUi(\'prefer_existing_on_compulsory\',this.value)">' +
                      ['YES', 'NO'].map(v => '<option value="' + v + '"' + ((pol.prefer_existing_on_compulsory ? 'YES' : 'NO') === v ? ' selected' : '') + '>' + v + '</option>').join('') +
                      '</select>'
                    : '<div class="po-readonly">' + (pol.prefer_existing_on_compulsory ? 'YES' : 'NO') + '</div>') +
                '<div class="po-policy-notice">DLC policy decision, not a GO requirement.</div></div>' +
            sel('scst_rounding_policy', POEngine.PO_ROUNDING_POLICIES, pol.scst_rounding_policy,
                'SC/ST rounding policy', POEngine.PO_POLICY_NOTICE_ROUNDING) +
            '<div class="form-group"><label>SC/ST basis</label>' +
                '<div class="po-readonly">' + escapeHtml(POEngine.PO_SEG_BASIS.replace(/_/g, ' ')) + '</div>' +
                '<div class="po-policy-notice">GO REQUIREMENT. The order refers to proportionate distribution based on working strength. ' +
                'This is not a user choice.</div></div>' +
            '<div class="form-group"><label>SC/ST adjustment</label>' +
                (canEdit
                    ? '<select onchange="poSetPolicyFromUi(\'scst_adjustment\',this.value)">' +
                      ['YES', 'NO'].map(v => '<option value="' + v + '"' + ((pol.scst_adjustment !== false ? 'YES' : 'NO') === v ? ' selected' : '') + '>' + v + '</option>').join('') +
                      '</select>'
                    : '<div class="po-readonly">' + (pol.scst_adjustment !== false ? 'YES' : 'NO') + '</div>') +
                '<div class="po-policy-notice">SYSTEM IMPLEMENTATION RULE. Adjustment substitutes the last allotted general-category employee with the relevant SC/ST employee.</div></div>' +
            '<div class="form-group"><label>District working-strength split</label>' +
                '<div style="display:flex;gap:10px;flex-wrap:wrap;">' +
                    poState.cadres.map(c => {
                        const v = splitPercents[c.id] !== undefined ? splitPercents[c.id] : '';
                        return '<div style="flex:1;min-width:120px;"><div class="po-policy-notice">' + escapeHtml(c.name) + '</div>' +
                            (splitEditable
                                ? '<input type="number" min="0" step="0.01" id="poSplit_' + c.id + '" class="po-strength-input" style="width:100%" value="' + v + '" onchange="poSetDistrictSplitFromUi()">'
                                : '<div class="po-readonly">' + v + '%</div>') + '</div>';
                    }).join('') +
                '</div>' +
                '<div class="po-policy-notice">DLC policy decision, not a GO requirement. The total working strength is apportioned to Krishna, NTR and Eluru by these percentages using largest-remainder rounding. This freezes with the working strength.</div></div>' +
        '</div>' +
        '<div class="po-legend">' +
            '<div><span class="po-tag po-tag-go">GO REQUIREMENT</span> prescribed by G.O.Ms.No.129</div>' +
            '<div><span class="po-tag po-tag-sys">SYSTEM IMPLEMENTATION RULE</span> deterministic software rule, labelled for DLC confirmation</div>' +
            '<div><span class="po-tag po-tag-dlc">DLC CONFIGURATION / POLICY DECISION</span> set by the Committee, not by the order</div>' +
        '</div>' +
        (canEdit
            ? '<div class="po-actions"><button class="btn btn-primary" onclick="poFreezePolicyFlow()">FREEZE POLICY before allocation</button></div>'
            : ''), '');
}

function poSetPolicyFromUi(field, value) {
    const v = (field === 'prefer_existing_on_compulsory' || field === 'scst_adjustment') ? (value === 'YES') : value;
    if (poSetPolicy(field, v)) { showToast('Allocation policy updated', 'success'); renderPOModule(); }
}

function poSetDistrictSplitFromUi() {
    const split = {};
    poState.cadres.forEach(c => {
        const el = document.getElementById('poSplit_' + c.id);
        split[c.id] = el ? parseFloat(el.value) : 0;
    });
    if (poSetPolicy('district_split', split)) { showToast('District split updated', 'success'); renderPOModule(); }
}

function poFreezePolicyFlow() {
    if (!confirm('Freeze the allocation policy for this exercise?\n\nIt cannot be changed once allocation begins.')) return;
    if (poFreezePolicy()) { showToast('Allocation policy frozen', 'success'); renderPOModule(); }
}

function poEditCategory(id) {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return; }
    const c = id ? poState.categories.find(x => x.id === id) : null;
    const dlg = document.createElement('div');
    dlg.className = 'modal-overlay';
    dlg.style.display = 'flex';
    dlg.innerHTML =
        '<div class="modal" style="max-width:620px;">' +
            '<div class="modal-header"><h3>' + (c ? 'Edit' : 'Add') + ' post category</h3>' +
            '<button class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()">&times;</button></div>' +
            '<div class="modal-body"><div class="form-grid">' +
                '<div class="form-group"><label>Category ID *</label><input id="poCatId" value="' + escapeHtml(c ? c.id : '') + '"></div>' +
                '<div class="form-group"><label>Code</label><input id="poCatCode" value="' + escapeHtml(c ? c.code : '') + '"></div>' +
                '<div class="form-group"><label>Category name *</label><input id="poCatName" value="' + escapeHtml(c ? c.name : '') + '"></div>' +
                '<div class="form-group"><label>Department</label><input id="poCatDept" value="' + escapeHtml(c ? c.department : poState.exercise.department) + '"></div>' +
                '<div class="form-group"><label>Existing / erstwhile cadre</label><input id="poCatErst" value="' + escapeHtml(c ? c.erstwhile_cadre : '') + '"></div>' +
                '<div class="form-group"><label>Status</label><input id="poCatStatus" value="' + escapeHtml(c ? c.status : 'ACTIVE') + '"></div>' +
            '</div></div>' +
            '<div class="modal-footer"><button class="btn btn-secondary" onclick="this.closest(\'.modal-overlay\').remove()">Cancel</button>' +
            '<button class="btn btn-primary" onclick="poSaveCategoryForm()">Save</button></div>' +
        '</div>';
    document.body.appendChild(dlg);
}

function poSaveCategoryForm() {
    const g = id => (document.getElementById(id) || {}).value || '';
    const id = g('poCatId').trim();
    const name = g('poCatName').trim();
    if (!id || !name) { showToast('Category ID and name are required', 'error'); return; }
    const okSave = poSaveCategory(id, g('poCatCode').trim() || name, name, g('poCatDept').trim(), g('poCatErst').trim());
    if (!okSave) return;
    const cat = poState.categories.find(c => c.id === id);
    if (cat) cat.status = g('poCatStatus').trim() || 'ACTIVE';
    poSave();
    document.querySelector('.modal-overlay').remove();
    showToast('Category saved', 'success');
    renderPOModule();
}

function poDeleteCategory(id) {
    if (!confirm('Delete category ' + id + '?')) return;
    if (poRemoveCategory(id)) { showToast('Category removed', 'success'); renderPOModule(); }
}

function poDownloadCategoryTemplate() {
    downloadFile(poCategoryTemplateCsv(), 'PO_CategoryMaster_Template.csv', 'text/csv');
    showToast('Template downloaded', 'success');
}

function poImportCategoryFile(input) {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    poReadSpreadsheet(file, rows => {
        if (!rows.length) { showToast('No usable rows found in the file', 'error'); return; }
        const n = poImportCategories(rows);
        showToast(n ? n + ' category record(s) imported' : 'Nothing was imported', n ? 'success' : 'error');
        renderPOModule();
    });
}



// ============================================================================
// STEP 2 - Working strength for Krishna, NTR and Eluru
// ============================================================================

function renderStepStrength(content) {
    const editable = poIsAdmin() && poStageIdx(poStage()) <= poStageIdx('WORKING_STRENGTH_FINALIZED');
    const report = POEngine.validateWorkingStrength({ ctx: poCtx() });
    const ctx = poCtx();

    const blocks = poState.categories.map(cat => {
        const rows = poState.strengths.filter(s => s.category_id === cat.id);
        const sumFws = rows.reduce((n, s) => n + (parseInt(s.fws) || 0), 0);
        const approved = (poState.approved.find(a => a.category_id === cat.id) || {}).approved_working_strength;
        const ok = approved !== undefined && Number(approved) === sumFws;

        const trs = rows.map(s => {
            const name = (ctx.cadreById[s.cadre_id] || {}).name || s.cadre_id;
            const fws = parseInt(s.fws) || 0;
            const cstr = parseInt(s.cadre_strength) || 0;
            const vacant = cstr - fws;
            return '<tr>' + poTd(name) +
                (editable
                    ? '<td><input type="number" min="0" class="po-strength-input" value="' + cstr + '" onchange="poSetStrengthField(\'' + poQs(cat.id) + '\',\'' + poQs(s.cadre_id) + '\',\'cadre_strength\',this.value)"></td>'
                    : poTd(String(cstr))) +
                poTd(String(fws), 'color:var(--accent)') +
                poTd(String(vacant), vacant < 0 ? 'color:var(--danger)' : 'color:var(--text-muted)') +
            '</tr>';
        });

        return '<div class="po-block">' +
            '<div class="po-block-head"><h4>' + escapeHtml(cat.code ? cat.code + ' - ' + cat.name : cat.name) + '</h4>' +
            '<span class="po-badge po-badge-' + (ok ? 'success' : 'danger') + '">' + (ok ? 'RECONCILED' : 'NOT RECONCILED') + '</span></div>' +
            '<div class="po-table-wrap"><table><thead><tr><th>Local cadre</th><th>Cadre strength (sanctioned)</th><th>Final Working Strength (FWS)</th><th>Vacant posts</th></tr></thead><tbody>' +
            (trs.join('') || '<tr><td colspan="4">No cadre configured for this category.</td></tr>') +
            '</tbody><tfoot><tr><th>Total FWS</th><th colspan="2">' + sumFws + '</th>' +
            '<th>' + (editable
                ? '<input type="number" min="0" class="po-strength-input" style="width:90px" value="' + (approved === undefined ? '' : approved) +
                  '" onchange="poSetApprovedFromForm(\'' + poQs(cat.id) + '\',this.value)">'
                : (approved === undefined ? '-' : approved)) + '</th></tr></tfoot></table></div>' +
            '<div class="po-hint">Enter the <strong>approved working strength</strong> (footer, last column). It auto-splits into the three districts by the ' +
            'district split percentages using largest-remainder rounding. <strong>Vacant posts = cadre strength &minus; FWS</strong>.</div>' +
        '</div>';
    });

    content.innerHTML =
        poCard('Step 2 &middot; Working strength and district split',
            '<p class="po-hint">Enter each rank&rsquo;s total working strength; the system splits it into Krishna, NTR and Eluru by the ' +
            'district split percentages (see Step 1 allocation policy). The three figures sum exactly to the total and are read-only. ' +
            'Cadre strength is the sanctioned figure; vacant posts are bifurcated with it.</p>' +
            blocks.join(''), '') +
        poCard('Working strength validation', poValidationPanel('Working strength', {
            valid: report.valid,
            errors: report.errors,
            warnings: report.warnings,
            passed: report.rows.filter(r => r.reconciled).map(r => r.category + ': FWS ' + r.total_fws + ' = approved ' + r.approved_working_strength)
        }), '');
}

function poSetStrengthField(categoryId, cadreId, field, value) {
    poSetStrength(categoryId, cadreId, field, value);
    renderPOModule();
}

function poSetApprovedFromForm(categoryId, value) {
    poSetApprovedStrength(categoryId, value);
    poAutoSplitWorkingStrength();
    renderPOModule();
}


// ============================================================================
// STEP 3 - Seniority List: upload per cadre, lock, publish, analyse
// ----------------------------------------------------------------------------
// This is the ONLY personnel dataset the module accepts. The DLC uploads one
// file per cadre (Krishna, NTR, Eluru); uploading a cadre's file replaces that
// cadre's rows and leaves the other two untouched.
// ============================================================================

function poSeniorityEditable() { return poIsAdmin() && poStageIdx(poStage()) <= poStageIdx('FSL_UPLOADED'); }

function renderStepSeniority(content) {
    const editable = poSeniorityEditable();
    const ctx = poCtx();
    const list = poState.fsl;
    const report = poState.fslValidation;
    const tl = poTimeline();
    const a = poFsAnalysis();
    const published = !!poState.fslPublishedAt;

    const issues = {};
    if (report) {
        report.errors.concat(report.warnings).forEach(i => {
            if (i.employee_id) {
                issues[i.employee_id] = issues[i.employee_id] || [];
                issues[i.employee_id].push(i.severity + ':' + i.code);
            }
        });
    }

    const rows = list.map(r => {
        const pref = POEngine.poPreferredClaim(r);
        const pending = poPendingClaims(r);
        const flag = issues[r.employee_id];
        return '<tr' + (flag && flag.some(f => f.indexOf('ERROR') === 0) ? ' class="po-row-error"' : '') + '>' +
            poTd(r.seniority_no) +
            poTd(r.name) +
            poTd((ctx.categoryById[r.category_id] || {}).name || r.rank_code) +
            poTd(r.gender) + poTd(r.cfms_id) + poTd(r.mobile) +
            poTd(r.date_of_birth) + poTd(r.date_of_joining_category) +
            poTd(r.social_category) + poTd(r.sc_group) +
            poTd((ctx.cadreById[r.erstwhile_cadre_id] || {}).name) +
            poTd((ctx.cadreById[r.present_local_cadre_id] || {}).name) +
            poTd(r.present_working_place) +
            poTd(poServiceLabel(r.service_status), r.service_status === 'PRESENT' ? '' : 'color:var(--warn)') +
            '<td>' + (pref ? '<span class="po-badge po-badge-success">VERIFIED: ' + escapeHtml(pref.label) + '</span>'
                : (pending ? '<span class="po-badge po-badge-warn">' + pending.length + ' claim(s) pending verification</span>' : '-')) + '</td>' +
            '<td>' + (flag ? flag.map(f => '<span class="po-badge po-badge-' + (f.indexOf('ERROR') === 0 ? 'danger' : 'warn') + '">' + escapeHtml(f.split(':')[1]) + '</span>').join(' ') : '-') + '</td>' +
            '<td>' + (editable
                ? '<button class="action-btn btn-primary" onclick="poEditSeniorityRecord(\'' + poQs(r.employee_id) + '\')">Edit</button> ' +
                  '<button class="action-btn btn-secondary" onclick="poOpenClaimPanel(\'' + poQs(r.employee_id) + '\')">Claims</button> ' +
                  '<button class="action-btn btn-danger" onclick="poDeleteSeniorityRecord(\'' + poQs(r.employee_id) + '\')">Del</button>'
                : '<span style="color:var(--text-subtle)">locked</span>') + '</td>' +
        '</tr>';
    });

    // per-cadre upload state, so the DLC can see which of the three is loaded
    const cadreCards = poState.cadres.map(c => {
        const n = list.filter(r => r.erstwhile_cadre_id === c.id || r.present_local_cadre_id === c.id).length;
        const total = poState.strengths.filter(s => s.cadre_id === c.id).reduce((x, s) => x + (parseInt(s.fws) || 0), 0);
        return '<div class="po-stat">' +
            '<div class="po-stat-num">' + n + '</div>' +
            '<div class="po-stat-label">' + escapeHtml(c.name) + ' &middot; FWS ' + total + '</div>' +
            '<div><span class="po-badge po-badge-' + (n ? 'success' : 'warn') + '">' + (n ? 'UPLOADED' : 'NOT UPLOADED') + '</span></div>' +
        '</div>';
    }).join('');

    const segRows = a.N_strength.map(n => '<tr>' +
        poTd(n.category) +
        poTd(String(n.approved_working_strength === null ? '-' : n.approved_working_strength)) +
        poTd(String(n.fws_total)) +
        poTd(String(n.current_working_strength)) +
        poTd(String(n.fsl_employee_count)) +
        poTd(String(n.allocable_strength)) +
        '</tr>');

    content.innerHTML =
        poCard('Step 3 &middot; Upload the Seniority List, cadre by cadre',
            '<p class="po-hint">Upload <strong>one file per cadre</strong>: Krishna, NTR and Eluru. Uploading a cadre&rsquo;s file replaces that ' +
            'cadre&rsquo;s rows and leaves the other two untouched. Seniority numbers are official: they are copied exactly as supplied and are never ' +
            'generated from row order. Employees on deputation, leave, probation, training, suspension or absence all remain on the list.</p>' +
            (editable
                ? '<div class="po-actions" style="margin-bottom:12px;">' +
                    '<button class="btn btn-primary" onclick="poEditSeniorityRecord(\'\')">+ Add record</button>' +
                    '<button class="btn btn-secondary" onclick="poDownloadSeniorityTemplate()">Download CSV template</button>' +
                    '<button class="btn btn-primary" onclick="document.getElementById(\'poSeniorityFile\').click()">Upload CSV / Excel for this cadre</button>' +
                    '<input type="file" id="poSeniorityFile" accept=".csv,.xlsx,.xls" style="display:none" onchange="poImportSeniorityFile(this)">' +
                    '<button class="btn btn-secondary" onclick="poExportSeniorityCsv()">Export</button>' +
                    '<button class="btn btn-primary" onclick="poValidateSeniorityNow()">Run validation</button>' +
                  '</div>'
                : '<div class="po-note po-note-info">The seniority list is frozen at this stage.</div>') +
            '<div class="po-stat-grid">' + cadreCards + '</div>' +
            poStats([
                { value: list.length, label: 'Records loaded' },
                { value: (report ? report.errors.length : '-'), label: 'Errors' },
                { value: (report ? report.warnings.length : '-'), label: 'Warnings' },
                { value: list.filter(r => r.service_status === 'DEPUTATION').length, label: 'On deputation' },
                { value: poVersionLabel('fsl'), label: 'List version' }
            ]) +
            poTable(['Seniority No', 'Employee Name', 'Category', 'Gender', 'CFMS ID', 'Mobile', 'Date of Birth',
                     'Date of Joining in Category', 'Social Category', 'SC/ST Group', 'Erstwhile Cadre',
                     'Present Local Cadre', 'Present Working Place', 'Status', 'Preferential', 'Validation', ''], rows), '') +

        poCard('Lock and publish the Seniority List',
            '<div class="po-hint">Once locked the list becomes the authoritative dataset for the allocation engine. A later change requires an ' +
            'authorised revision with a reason and creates a new version; superseded versions are retained, never destroyed.</div>' +
            '<div class="po-actions" style="margin-bottom:12px;">' +
                (editable && !poState.fslLocked && list.length
                    ? '<button class="btn btn-primary" onclick="poFinalizeSeniorityFlow()">Lock the seniority list</button>' : '') +
                (poIsAdmin() && poState.fslLocked && !published
                    ? '<button class="btn btn-primary" onclick="poPublishFslFlow()">Publish seniority list (opens the option window)</button>' : '') +
                (poState.fslLocked && published
                    ? '<button class="btn btn-secondary" onclick="poReviseFslFlow()">Start a revision</button>' : '') +
            '</div>' +
            (list.length ? '' : '<div class="po-note po-note-warn">No seniority list has been uploaded yet. Allocation is blocked until a list is uploaded, validated and locked.</div>') +
            (poState.fslLocked ? '' : (list.length ? '<div class="po-note po-note-warn">The list is not locked yet. Allocation is blocked until it is.</div>' : '')) +
            '<div class="po-window">' +
                '<div><span class="po-window-l">Uploaded</span><span class="po-window-v">' + poDash(tl.seniority_uploaded_at || '-') + '</span></div>' +
                '<div><span class="po-window-l">Locked</span><span class="po-window-v">' + poDash(tl.fsl_finalized_at || '-') + '</span></div>' +
                '<div><span class="po-window-l">Published</span><span class="po-window-v">' + poDash(tl.fsl_published_at || '-') + '</span></div>' +
                '<div><span class="po-window-l">State</span><span class="po-window-v">' + (poState.fslLocked ? (published ? 'PUBLISHED' : 'LOCKED') : (list.length ? 'OPEN' : 'EMPTY')) + '</span></div>' +
            '</div>', '') +

        poCard('Validation', report ? poValidationPanel('Seniority list', report) :
            '<div class="empty-state">Validation has not been run yet.</div>', '') +

        poCard('Seniority list analysis &mdash; the four strengths are NOT interchangeable',
            '<div class="po-hint">FWS = sanctioned posts. Current Working Strength = employees presently borne on the category. ' +
            'List Employee Count = rows in the seniority list. Available / Allocable Strength = FWS less those already borne.</div>' +
            poTable(['Category', 'Approved WS', 'FWS', 'Current Working Strength', 'List Employee Count', 'Available / Allocable'], segRows) +
            '<div class="po-analysis-grid">' +
                '<div><h4>A. Cadre-wise (present local cadre)</h4>' + poTally(a.A_cadreWise) + '</div>' +
                '<div><h4>B. Rank-wise</h4>' + poTally(a.B_rankWise) + '</div>' +
                '<div><h4>C. Erstwhile cadre distribution</h4>' + poTally(a.C_erstwhileCadre) + '</div>' +
                '<div><h4>D. Present working location</h4>' + poTally(a.D_workingLocation) + '</div>' +
                '<div><h4>J. Gender</h4>' + poTally(a.J_gender) + '</div>' +
                '<div><h4>K. Deputation / other status</h4>' + poTally(a.K_deputation.by_status) + '</div>' +
            '</div>' +
            '<div class="po-analysis-grid">' +
                '<div><h4>E. Preferential categories</h4><table class="po-mini"><thead><tr><th>Category</th><th>Claimed</th><th>Verified</th></tr></thead><tbody>' +
                    a.E_preferential.map(e => '<tr><td>' + escapeHtml(e.label) + '</td><td>' + e.claimed + '</td><td><strong>' + e.verified + '</strong></td></tr>').join('') +
                '</tbody></table></div>' +
                '<div><h4>F-I. Reserved groups</h4>' +
                    '<div class="po-chip">SC Group-I: ' + a.F_sc_group_1 + '</div>' +
                    '<div class="po-chip">SC Group-II: ' + a.G_sc_group_2 + '</div>' +
                    '<div class="po-chip">SC Group-III: ' + a.H_sc_group_3 + '</div>' +
                    '<div class="po-chip">ST: ' + a.I_st + '</div>' +
                    '<div class="po-chip">Total reserved: ' + (a.F_sc_group_1 + a.G_sc_group_2 + a.H_sc_group_3 + a.I_st) + '</div>' +
                '</div>' +
                '<div><h4>L / M. Option coverage</h4>' +
                    '<div class="po-chip">With valid options: ' + a.M_withOptions + '</div>' +
                    '<div class="po-chip">NO OPTION: ' + a.L_noOptionCount + '</div>' +
                    (a.L_noOptions.length ? '<details><summary>List of employees without options</summary><ul>' +
                        a.L_noOptions.slice(0, 100).map(e => '<li>' + escapeHtml((e.seniority_no || '-') + ' - ' + e.name) + '</li>').join('') + '</ul></details>' : '') +
                '</div>' +
            '</div>', '');
}

function poServiceLabel(id) {
    const hit = POEngine.PO_SERVICE_STATUS.find(s => s.id === id);
    return hit ? hit.label : (id || '-');
}

function poPendingClaims(rec) {
    poEnsureClaims(rec);
    return POEngine.PO_PREF_CLAIMS.filter(def => {
        const c = rec.claims[def.id];
        return c && c.claimed && String(c.verification).toUpperCase() !== 'VERIFIED' && String(c.verification).toUpperCase() !== 'REJECTED';
    });
}

function poValidateSeniorityNow() {
    const r = poRunSeniorityValidation();
    showToast(r.valid ? 'Validation passed with ' + r.warnings.length + ' warning(s)' : 'Validation failed: ' + r.errors.length + ' error(s)',
        r.valid ? 'success' : 'error');
    renderPOModule();
}

function poFinalizeSeniorityFlow() {
    if (!confirm('Lock the seniority list?\n\nIt becomes the authoritative dataset for allocation and can no longer be edited.')) return;
    const n = poFinalizeSeniorityList();
    if (n) { showToast('Seniority list locked with ' + n + ' records', 'success'); renderPOModule(); }
}

function poPublishFslFlow() {
    if (!confirm('Publish the seniority list?\n\nThis opens the option window for the employees.')) return;
    if (poPublishFsl()) { showToast('Seniority list published', 'success'); renderPOModule(); }
}

function poReviseFslFlow() {
    const reason = prompt('Revision reason (mandatory - a new version is created and the superseded list is retained):', '');
    if (reason === null) return;
    if (!confirm('This unlocks the list, clears its records, voids all submitted options and requires a fresh upload. Continue?')) return;
    if (poReviseFsl(reason)) { showToast('Revision started at ' + poVersionLabel('fsl'), 'success'); renderPOModule(); }
}

function poDownloadSeniorityTemplate() {
    downloadFile(poSeniorityTemplateCsv(), 'PO_SeniorityList_Template.csv', 'text/csv');
    showToast('Template downloaded', 'success');
}

function poExportSeniorityCsv() {
    if (!poState.fsl.length) { showToast('The seniority list is empty', 'error'); return; }
    downloadFile(poSeniorityExportCsv(), 'PO_SeniorityList_' + poState.exercise.exercise_id + '.csv', 'text/csv');
}

// --- CSV / Excel ingestion ---------------------------------------------------
// Header matching is case- and punctuation-insensitive, so 'Date of Joining in
// Category', 'date_of_joining_in_category' and 'dateofjoiningincategory' all
// map to the same field.

function poReadSpreadsheet(file, done) {
    const reader = new FileReader();
    reader.onload = e => {
        try {
            let text = e.target.result;
            const n = (file.name || '').toLowerCase();
            if (n.endsWith('.xlsx') || n.endsWith('.xls')) {
                if (typeof XLSX === 'undefined') throw new Error('SheetJS is not loaded; CSV upload only.');
                const data = new Uint8Array(text.split('').map(c => c.charCodeAt(0)));
                const wb = XLSX.read(data, { type: 'array' });
                text = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]);
            }
            done(poCsvToRows(text));
        } catch (err) {
            showToast('Read failed: ' + err.message, 'error');
        }
    };
    reader.readAsText(file);
}

function poCsvToRows(text) {
    const lines = poSplitCsvLines(text);
    if (lines.length < 2) return [];
    const headers = poParseCsvLine(lines[0]).map(h =>
        String(h).trim().toLowerCase().replace(/[^a-z0-9]+/g, ''));
    const rows = [];
    lines.slice(1).forEach(line => {
        if (!line.trim()) return;
        const vals = poParseCsvLine(line);
        const row = {};
        headers.forEach((h, i) => { row[h] = (vals[i] || '').trim(); });
        rows.push(row);
    });
    return rows;
}

function poSplitCsvLines(text) {
    const out = []; let cur = ''; let q = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i], nx = text[i + 1];
        if (ch === '"') {
            if (q && nx === '"') { cur += '"'; i++; } else { q = !q; }
        } else if (ch === '\n' || ch === '\r') {
            if (q) { cur += ch; } else { out.push(cur); cur = ''; if (ch === '\r' && nx === '\n') i++; }
        } else { cur += ch; }
    }
    if (cur) out.push(cur);
    return out.filter(l => l.trim() !== '');
}

function poParseCsvLine(line) {
    const out = []; let cur = ''; let q = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i], nx = text1(line, i);
        if (ch === '"') {
            if (q && nx === '"') { cur += '"'; i++; } else { q = !q; }
        } else if (ch === ',') {
            if (q) { cur += ','; } else { out.push(cur.trim()); cur = ''; }
        } else { cur += ch; }
    }
    out.push(cur.trim());
    return out;
}
function text1(s, i) { return s[i + 1]; }

/**
 * Upload one cadre's seniority list. The file must name Krishna, NTR or Eluru in
 * Erstwhile / Present Local Cadre; that cadre's existing rows are replaced and
 * the other two are left alone.
 */
function poImportSeniorityFile(input) {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    if (!confirm('Upload this file as a cadre seniority list?\n\nThe rows of the cadre named in the file will be REPLACED. Rows of the other two cadres are untouched.')) return;
    poReadSpreadsheet(file, rows => {
        if (!rows.length) { showToast('No usable rows found in the file', 'error'); return; }
        const n = poImportSeniorityRows(rows, true);
        if (!n) { renderPOModule(); return; }
        showToast(n + ' record(s) imported for ' + file.name + '. Run validation to see blocking errors.', 'success');
        renderPOModule();
    });
}

// --- manual record entry -----------------------------------------------------

function poEditSeniorityRecord(employeeId) {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return; }
    if (!poSeniorityEditable()) { showToast('The seniority list is frozen at this stage', 'error'); return; }
    const rec = employeeId
        ? poState.fsl.find(r => r.employee_id === employeeId)
        : poBlankRecord(poState.categories.length ? poState.categories[0].id : '');
    if (!rec) return;

    const catOpts = '<option value="">Select category</option>' + poState.categories.map(c =>
        '<option value="' + escapeHtml(c.id) + '"' + (rec.category_id === c.id ? ' selected' : '') + '>' + escapeHtml((c.code ? c.code + ' - ' : '') + c.name) + '</option>').join('');
    const cadreOpts = (sel, blank) => (blank ? '<option value="">' + blank + '</option>' : '') + poState.cadres.map(c =>
        '<option value="' + escapeHtml(c.id) + '"' + (sel === c.id ? ' selected' : '') + '>' + escapeHtml(c.name) + '</option>').join('');
    const statusOpts = POEngine.PO_SERVICE_STATUS.map(s =>
        '<option value="' + s.id + '"' + (rec.service_status === s.id ? ' selected' : '') + '>' + escapeHtml(s.label) + '</option>').join('');
    const segOpts = '<option value="">Not reserved</option>' + POEngine.PO_SEG_GROUPS.map(g =>
        '<option value="' + g.id + '"' + (rec.sc_group === g.id ? ' selected' : '') + '>' + escapeHtml(g.label + ' (' + g.percent + '%)') + '</option>').join('');

    const dlg = document.createElement('div');
    dlg.className = 'modal-overlay';
    dlg.style.display = 'flex';
    dlg.innerHTML =
        '<div class="modal" style="max-width:820px;">' +
        '<div class="modal-header"><h3>' + (employeeId ? 'Edit' : 'Add') + ' seniority list record</h3>' +
        '<button class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()">&times;</button></div>' +
        '<div class="modal-body"><div class="po-note po-note-info">Date of joining means <strong>date of joining in the category</strong>. ' +
        'Appointment, promotion and present-office joining dates are never substituted.</div>' +
        '<div class="form-grid">' +
            '<div class="form-group"><label>Seniority No. * (official)</label><input type="number" min="1" id="poR_sen" value="' + escapeHtml(rec.seniority_no === null ? '' : rec.seniority_no) + '"></div>' +
            '<div class="form-group"><label>Employee Name *</label><input id="poR_name" value="' + escapeHtml(rec.name) + '"></div>' +
            '<div class="form-group"><label>Parentage</label><input id="poR_par" value="' + escapeHtml(rec.parentage) + '"></div>' +
            '<div class="form-group"><label>Rank / category *</label><select id="poR_cat">' + catOpts + '</select></div>' +
            '<div class="form-group"><label>Gender</label><select id="poR_gen">' +
                ['', 'Male', 'Female', 'Other'].map(g => '<option value="' + g + '"' + (rec.gender === g ? ' selected' : '') + '>' + (g || 'Select') + '</option>').join('') +
            '</select></div>' +
            '<div class="form-group"><label>CFMS ID</label><input id="poR_cfms" value="' + escapeHtml(rec.cfms_id) + '"></div>' +
            '<div class="form-group"><label>Mobile Number</label><input id="poR_mob" value="' + escapeHtml(rec.mobile) + '"></div>' +
            '<div class="form-group"><label>Date of Birth</label><input type="date" id="poR_dob" value="' + escapeHtml(rec.date_of_birth) + '"></div>' +
            '<div class="form-group"><label>Date of Joining in Category *</label><input type="date" id="poR_doj" value="' + escapeHtml(rec.date_of_joining_category) + '"></div>' +
            '<div class="form-group"><label>Type of seniority</label><input id="poR_stype" value="' + escapeHtml(rec.seniority_type) + '"></div>' +
            '<div class="form-group"><label>Office</label><input id="poR_off" value="' + escapeHtml(rec.office) + '"></div>' +
            '<div class="form-group"><label>Designation</label><input id="poR_desig" value="' + escapeHtml(rec.designation) + '"></div>' +
            '<div class="form-group"><label>Social Category *</label><input id="poR_social" placeholder="e.g. BC-B / OC / SC / ST" value="' + escapeHtml(rec.social_category) + '"></div>' +
            '<div class="form-group"><label>SC/ST reserved group</label><select id="poR_seg">' + segOpts + '</select></div>' +
            '<div class="form-group"><label>Erstwhile Local Cadre</label><select id="poR_erc">' + cadreOpts(rec.erstwhile_cadre_id, 'Not stated') + '</select></div>' +
            '<div class="form-group"><label>Present Local Cadre</label><select id="poR_prc">' + cadreOpts(rec.present_local_cadre_id, 'Not stated') + '</select></div>' +
            '<div class="form-group"><label>Present Working Place</label><input id="poR_pwp" value="' + escapeHtml(rec.present_working_place) + '"></div>' +
            '<div class="form-group"><label>Deputation / other status</label><select id="poR_stat">' + statusOpts + '</select></div>' +
            '<div class="form-group"><label>Deputation unit</label><input id="poR_dunit" value="' + escapeHtml(rec.deputation_unit) + '"></div>' +
        '</div></div>' +
        '<div class="modal-footer"><button class="btn btn-secondary" onclick="this.closest(\'.modal-overlay\').remove()">Cancel</button>' +
        '<button class="btn btn-primary" onclick="poSaveSeniorityForm(' + (employeeId ? '\'' + poQs(employeeId) + '\'' : 'null') + ')">Save</button></div>' +
        '</div>';
    document.body.appendChild(dlg);
}

function poSaveSeniorityForm(employeeId) {
    const g = id => (document.getElementById(id) || {}).value;
    const catId = g('poR_cat') || '';
    const cat = poState.categories.find(c => c.id === catId);
    const senRaw = (g('poR_sen') || '').trim();
    const sen = /^\d+$/.test(senRaw) ? parseInt(senRaw, 10) : null;

    const rec = employeeId
        ? poState.fsl.find(r => r.employee_id === employeeId)
        : poBlankRecord(catId);
    if (!rec) return;
    if (!rec.claims) rec.claims = poBlankClaims();

    rec.category_id = catId;
    rec.rank_code = cat ? cat.code : '';
    rec.seniority_no = sen;              // null stays null - never a row number
    rec.name = (g('poR_name') || '').trim();
    rec.parentage = (g('poR_par') || '').trim();
    rec.gender = g('poR_gen') || '';
    rec.cfms_id = (g('poR_cfms') || '').trim();
    rec.mobile = (g('poR_mob') || '').trim();
    rec.date_of_birth = g('poR_dob') || '';
    rec.date_of_joining_category = g('poR_doj') || '';
    rec.seniority_type = poNormalizeSeniorityType(g('poR_stype'));
    rec.office = (g('poR_off') || '').trim();
    rec.designation = (g('poR_desig') || '').trim();
    rec.social_category = (g('poR_social') || '').trim();
    rec.sc_group = g('poR_seg') || '';
    rec.erstwhile_cadre_id = g('poR_erc') || '';
    rec.present_local_cadre_id = g('poR_prc') || '';
    rec.present_working_place = (g('poR_pwp') || '').trim();
    rec.service_status = g('poR_stat') || 'PRESENT';
    rec.deputation_unit = (g('poR_dunit') || '').trim();

    const isNew = !employeeId;
    if (!poSaveSeniorityRecord(rec, isNew)) return;
    document.querySelector('.modal-overlay').remove();
    showToast(isNew ? 'Record added' : 'Record saved', 'success');
    renderPOModule();
}

function poDeleteSeniorityRecord(employeeId) {
    const rec = poState.fsl.find(r => r.employee_id === employeeId);
    if (!confirm('Delete seniority list record for ' + (rec ? rec.name : employeeId) + '?')) return;
    if (poDeleteSeniorityRecord(employeeId)) { showToast('Record deleted', 'success'); renderPOModule(); }
}

// --- preferential claim certification & verification -------------------------
// A claim is not preferential merely because a flag was ticked. Claim ->
// supporting document -> verification -> eligible / not eligible. Only a
// VERIFIED claim is processed in the preferential phase.

function poOpenClaimPanel(employeeId) {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return; }
    const rec = poState.fsl.find(r => r.employee_id === employeeId);
    if (!rec) { showToast('Record not found', 'error'); return; }
    poEnsureClaims(rec);
    const canEdit = poSeniorityEditable();

    const rowsHtml = POEngine.PO_PREF_CLAIMS.map(def => {
        const c = rec.claims[def.id];
        const certd = POEngine.poClaimCertified(c);
        return '<tr>' +
            '<td>' + def.priority + '</td>' +
            '<td><strong>' + escapeHtml(def.label) + '</strong><br><span class="po-hint">' +
                (def.minPercent
                    ? 'Certified disability must be ' + def.minPercent + '% or above as per ' + escapeHtml(def.docName || 'certificate')
                    : 'Document: ' + escapeHtml(def.docName || 'supporting record')) + '</span></td>' +
            '<td>' + (canEdit
                ? '<input type="checkbox" id="cl_' + def.id + '"' + (c.claimed ? ' checked' : '') + '>'
                : (c.claimed ? 'CLAIMED' : '-')) + '</td>' +
            '<td>' + (canEdit
                ? '<input type="number" min="0" max="100" style="width:70px" id="pct_' + def.id + '" value="' + escapeHtml(c.disability_percent) + '"' + (def.minPercent ? '' : 'disabled') + '>'
                : poDash(c.disability_percent)) + '</td>' +
            '<td>' + (canEdit
                ? '<input id="cert_' + def.id + '" style="width:120px" placeholder="cert no" value="' + escapeHtml(c.cert_no) + '">'
                : poDash(c.cert_no)) + '</td>' +
            '<td>' + (canEdit
                ? '<input id="auth_' + def.id + '" style="width:150px" placeholder="Appointing authority" value="' + escapeHtml(c.appointing_authority || '') + '">'
                : (certd ? '<span class="po-badge po-badge-success">CERTIFIED</span><br><span class="po-hint">' + escapeHtml(c.appointing_authority) + '</span>' : '-')) + '</td>' +
            '<td><span class="po-badge po-badge-' + poVerifyTone(c.verification) + '">' + escapeHtml(c.verification || 'NOT_CLAIMED') + '</span></td>' +
            '<td>' + (canEdit
                ? '<button class="action-btn btn-primary" onclick="poVerifyClaim(\'' + poQs(employeeId) + '\',\'' + def.id + '\',\'VERIFIED\')">Verify</button> ' +
                  '<button class="action-btn btn-danger" onclick="poVerifyClaim(\'' + poQs(employeeId) + '\',\'' + def.id + '\',\'REJECTED\')">Reject</button>'
                : '') + '</td>' +
        '</tr>';
    }).join('');

    const dlg = document.createElement('div');
    dlg.className = 'modal-overlay';
    dlg.style.display = 'flex';
    dlg.innerHTML =
        '<div class="modal" style="max-width:980px;">' +
        '<div class="modal-header"><h3>Preferential claim certification - ' + escapeHtml(rec.name) + '</h3>' +
        '<button class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()">&times;</button></div>' +
        '<div class="modal-body">' +
        '<div class="po-note po-note-info">' + escapeHtml(POEngine.PO_PREF_NOTICE) + '</div>' +
        '<div class="po-table-wrap"><table><thead><tr><th>Priority</th><th>Category</th><th>Claimed</th><th>Disability %</th>' +
        '<th>Certificate no.</th><th>Appointing authority</th><th>Verification</th><th>Action</th></tr></thead><tbody>' + rowsHtml + '</tbody></table></div>' +
        '</div>' +
        '<div class="modal-footer">' +
            (canEdit ? '<button class="btn btn-primary" onclick="poSaveClaims(\'' + poQs(employeeId) + '\')">Save claims</button>' : '') +
            '<button class="btn btn-secondary" onclick="this.closest(\'.modal-overlay\').remove()">Close</button>' +
        '</div></div>';
    document.body.appendChild(dlg);
}

function poVerifyTone(v) {
    const s = String(v || '').toUpperCase();
    if (s === 'VERIFIED') return 'success';
    if (s === 'REJECTED') return 'danger';
    return 'warn';
}

function poSaveClaims(employeeId) {
    const rec = poState.fsl.find(r => r.employee_id === employeeId);
    if (!rec) return;
    poEnsureClaims(rec);
    POEngine.PO_PREF_CLAIMS.forEach(def => {
        const c = rec.claims[def.id];
        const box = document.getElementById('cl_' + def.id);
        if (!box) return;
        const wasClaimed = c.claimed;
        const prevAuthority = c.appointing_authority || '';
        c.claimed = box.checked;
        if (!c.claimed) { c.verification = 'NOT_CLAIMED'; c.verified_by = ''; c.verified_at = ''; }
        else if (c.verification === 'NOT_CLAIMED') c.verification = 'PENDING';
        c.disability_percent = (document.getElementById('pct_' + def.id) || {}).value || '';
        c.cert_no = ((document.getElementById('cert_' + def.id) || {}).value || '').trim();
        c.appointing_authority = ((document.getElementById('auth_' + def.id) || {}).value || '').trim();
        if (!c.claimed) c.appointing_authority = '';
        // A changed certification invalidates the verification that rested on it.
        if (wasClaimed !== c.claimed && c.claimed) {
            c.verification = 'PENDING';
            c.verified_by = ''; c.verified_at = '';
        } else if (c.appointing_authority !== prevAuthority) {
            c.verification = c.claimed ? 'PENDING' : 'NOT_CLAIMED';
            c.verified_by = ''; c.verified_at = '';
        }
    });
    if (!poSaveSeniorityRecord(rec, false)) return;
    document.querySelector('.modal-overlay').remove();
    showToast('Claims saved. A claim is preferential only once verified AND certified by the appointing authority.', 'success');
    renderPOModule();
}

function poVerifyClaim(employeeId, claimId, status) {
    const rec = poState.fsl.find(r => r.employee_id === employeeId);
    if (!rec) return;
    poEnsureClaims(rec);
    const c = rec.claims[claimId];
    if (!c) return;
    const def = POEngine.PO_PREF_CLAIMS.find(x => x.id === claimId);
    if (status === 'VERIFIED') {
        // G.O.Ms.No.129: verification follows certification by the appointing
        // authority. Verifying an uncertified claim would manufacture preference.
        if (!POEngine.poClaimCertified(c)) {
            showToast('Record the Appointing Authority that certified this claim before verifying it.', 'error');
            return;
        }
        if (def && def.minPercent != null) {
            const pct = parseFloat(c.disability_percent);
            if (isNaN(pct) || pct < def.minPercent) {
                showToast('A certified disability of ' + def.minPercent + '% or above is required as per ' + (def.docName || 'certificate') + '.', 'error');
                return;
            }
        }
    }
    const remark = prompt('Verification remark:', '');
    if (remark === null) return;
    if (!poSeniorityEditable()) { showToast('The seniority list is frozen; verification is not permitted at this stage', 'error'); return; }
    c.verification = status;
    c.verified_by = poUser();
    c.verified_at = poNow();
    c.remark = remark;
    poSaveSeniorityRecord(rec, false);
    document.querySelector('.modal-overlay').remove();
    showToast('Claim ' + status.toLowerCase(), 'success');
    renderPOModule();
}




// ============================================================================
// STEP 4 - Option filling (para 12 & 13)
// ============================================================================

function renderStepOptions(content) {
    const fsl = poActiveFsl();
    const deadline = poOptionDeadline();
    const remaining = deadline ? Math.max(0, deadline.getTime() - Date.now()) : null;
    const withOpt = fsl.filter(r => (poState.options[r.employee_id] || {}).submitted).length;
    const open = !poState.optionsLocked && !poOptionDeadlinePassed();
    const canEdit = poIsAdmin() && poStageIdx(poStage()) >= poStageIdx('OPTIONS_OPEN') && poStageIdx(poStage()) <= poStageIdx('OPTIONS_OPEN') && open && !!poState.fslPublishedAt;

    const rows = fsl.map(r => {
        const allowed = poApplicableCadreIds(r.category_id);
        const ctx = poCtx();
        const catName = (ctx.categoryById[r.category_id] || {}).name || r.category_id;
        const opt = poState.options[r.employee_id] || {};
        const sel = (field, n) => '<select class="po-opt-select" id="opt_' + n + '" ' + (canEdit ? '' : 'disabled') + '>' +
            '<option value="">-</option>' + allowed.map(cid =>
                '<option value="' + escapeHtml(cid) + '"' + (opt[field] === cid ? ' selected' : '') + '>' +
                escapeHtml((ctx.cadreById[cid] || {}).name || cid) + '</option>').join('') + '</select>';

        return '<tr>' +
            poTd(r.seniority_no) + poTd(r.name) + poTd(catName) +
            '<td>' + sel('pref1', '1_' + r.employee_id) + '</td>' +
            '<td>' + sel('pref2', '2_' + r.employee_id) + '</td>' +
            '<td>' + sel('pref3', '3_' + r.employee_id) + '</td>' +
            '<td>' + (opt.submitted
                ? '<span class="po-badge po-badge-success">SUBMITTED</span><br><span class="po-hint">' + escapeHtml(opt.version || '') + ' ' + escapeHtml((opt.submitted_at || '').slice(0, 16).replace('T', ' ')) +
                  (opt.corrected_from_version ? '<br>corrected from ' + escapeHtml(opt.corrected_from_version) : '') + '</span>' +
                  (canEdit ? '<br><button class="action-btn btn-secondary" onclick="poCorrectOptionFlow(\'' + poQs(r.employee_id) + '\')">Corrected version</button>' : '')
                : (poState.optionsLocked ? '<span class="po-badge po-badge-danger">NO OPTION</span>' : '<span class="po-badge po-badge-warn">PENDING</span>')) + '</td>' +
            '<td>' + (canEdit
                ? '<button class="action-btn btn-primary" onclick="poSubmitOption(\'' + poQs(r.employee_id) + '\')">Submit</button>'
                : '<span style="color:var(--text-subtle)">-</span>') + '</td>' +
        '</tr>';
    });

    const window_ = deadline
        ? '<div class="po-window">' +
            '<div><span class="po-window-l">FSL published</span><span class="po-window-v">' + escapeHtml((poState.fslPublishedAt || '').slice(0, 10)) + '</span></div>' +
            '<div><span class="po-window-l">Options opened</span><span class="po-window-v">' + escapeHtml((poState.optionsOpenedAt || '').slice(0, 16).replace('T', ' ')) + '</span></div>' +
            '<div><span class="po-window-l">Options close</span><span class="po-window-v">' + escapeHtml(deadline.toISOString().slice(0, 10)) + '</span></div>' +
            '<div><span class="po-window-l">Remaining</span><span class="po-window-v">' +
                (poOptionDeadlinePassed() ? 'CLOSED' : Math.floor(remaining / 86400000) + 'd ' + Math.floor((remaining % 86400000) / 3600000) + 'h') +
            '</span></div>' +
            '<div><span class="po-window-l">Submitted / pending</span><span class="po-window-v">' + withOpt + ' / ' + (fsl.length - withOpt) + '</span></div>' +
          '</div>'
        : '<div class="po-note po-note-info">Publish the FSL to start the option window. Default window: ' +
          (poState.optionWindowDays || 5) + ' days from FSL publication.</div>';

    content.innerHTML =
        poCard('Step 4 &middot; Option filling', window_, '') +
        poCard('Employee options',
            '<div class="po-note po-note-warn"><strong>Option once exercised is final and irrevocable.</strong> ' +
            'Only cadres configured for that employee&rsquo;s rank/category are selectable. Options are never generated by the system.</div>' +
            (poState.optionsLocked
                ? '<div class="po-note po-note-info">Options are LOCKED at ' + escapeHtml(poVersionLabel('options')) + '. No further submission is possible.</div>'
                : '') +
            poTable(['Seniority No', 'Employee Name', 'Category', 'First Preference', 'Second Preference', 'Third Preference', 'Status', ''], rows),
            (poIsAdmin() && !poState.optionsLocked && poState.fslPublishedAt
                ? '<button class="btn btn-danger" onclick="poCloseOptionsFlow()">Close option entry &amp; lock</button>'
                : '')) +
        poCard('Option window setting',
            '<div class="form-grid"><div class="form-group"><label>Option window (days from FSL publication)</label>' +
            '<input type="number" min="1" max="60" id="poOptWindow" value="' + (poState.optionWindowDays || 5) + '"' + (poState.fslPublishedAt ? ' readonly' : '') + '></div></div>' +
            '<div class="po-actions"><button class="btn btn-secondary" onclick="poSaveOptionWindow()">Save window</button></div>', '');
}

function poSubmitOption(employeeId) {
    const v = n => {
        const el = document.getElementById('opt_' + n + '_' + employeeId);
        return el ? el.value : '';
    };
    const r = poSaveOption(employeeId, v('1'), v('2'), v('3'));
    if (!r.ok) { showToast(r.errors[0] || 'Option rejected', 'error'); return; }
    showToast('Option recorded', 'success');
    renderPOModule();
}

function poSaveOptionWindow() {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return; }
    const n = parseInt((document.getElementById('poOptWindow') || {}).value, 10);
    if (!n || n < 1) { showToast('Enter a valid number of days', 'error'); return; }
    poState.optionWindowDays = n;
    poSave();
    showToast('Option window saved', 'success');
    renderPOModule();
}

function poCorrectOptionFlow(employeeId) {
    const rec = poActiveFsl().find(r => r.employee_id === employeeId);
    const cur = poState.options[employeeId];
    if (!rec || !cur) { showToast('Option not found', 'error'); return; }
    if (!confirm('Correct the option for ' + rec.name + '?\n\nThe submitted option is immutable. A NEW option version will be created and the superseded version retained with an audit entry. A reason and the correcting authority are mandatory.')) return;
    const allowed = poApplicableCadreIds(rec.category_id);
    const ctx = poCtx();
    const pick = (n, current) => {
        const v = prompt('Preference ' + n + ' for ' + ((ctx.categoryById[rec.category_id] || {}).name || rec.category_id) +
            '\nOptions (type nothing to skip):\n' +
            allowed.map((cid, i) => (i + 1) + ' = ' + ((ctx.cadreById[cid] || {}).name || cid)).join('\n') +
            '\nCurrent: ' + (current || '(none)'), current || '');
        if (v === null) return null;
        const t = String(v).trim();
        if (!t) return '';
        const byIndex = parseInt(t, 10);
        if (!isNaN(byIndex) && byIndex >= 1 && byIndex <= allowed.length) return allowed[byIndex - 1];
        return t;
    };
    const p1 = pick(1, cur.pref1); if (p1 === null) return;
    const p2 = pick(2, cur.pref2); if (p2 === null) return;
    const p3 = pick(3, cur.pref3); if (p3 === null) return;
    const reason = prompt('Correction reason (mandatory, recorded in the audit trail):', '');
    if (reason === null) return;
    const authority = prompt('Correcting authority (mandatory):', poCompetentAuthority());
    if (authority === null) return;
    const r = poCorrectOption(employeeId, p1, p2, p3, reason, authority);
    if (!r.ok) { showToast((r.errors || [])[0] || 'Correction refused', 'error'); return; }
    showToast('Corrected option version ' + r.version + ' created', 'success');
    renderPOModule();
}

function poCloseOptionsFlow() {
    const pending = poNoOptionEmployees().length;
    if (!confirm('Close option entry and lock all options?\n' + pending + ' employee(s) will be recorded as NO OPTION and processed at the end of the allocation run.')) return;
    if (poCloseOptions()) { showToast('Options locked. ' + pending + ' employee(s) marked NO OPTION.', 'success'); renderPOModule(); }
}


// ============================================================================
// STEP 5 - Allocation (para 14, 15, 16, 17, 29)
// ============================================================================

function renderStepAllocation(content) {
    const canRun = poIsAdmin() && !!poState.fslPublishedAt && poState.fslLocked;
    const sim = poState.simulation;
    const run = poState.allocationRun;

    const preview = (data, title, tag) => {
        if (!data) return '';
        const alloc = data.allocations || [];
        const ctx = poCtx();
        const byReason = {};
        alloc.forEach(a => { byReason[a.allocation_reason] = (byReason[a.allocation_reason] || 0) + 1; });

        const reasonRows = POEngine.PO_ALLOC_REASONS.map(r =>
            '<tr>' + poTd(r.label, 'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px') + poTd(String(byReason[r.id] || 0)) + '</tr>');

        const ledger = [];
        poState.strengths.forEach(s => {
            const n = alloc.filter(a => a.category_id === s.category_id && a.cadre_id === s.cadre_id).length;
            const fws = parseInt(s.fws) || 0;
            ledger.push('<tr' + (n > fws ? ' class="po-row-error"' : '') + '>' +
                poTd((ctx.categoryById[s.category_id] || {}).name) + poTd((ctx.cadreById[s.cadre_id] || {}).name) +
                poTd(String(fws)) + poTd(String(n)) + poTd(String(fws - n)) +
                '<td>' + (n > fws ? '<span class="po-badge po-badge-danger">OVER-ALLOCATED</span>' : '<span class="po-badge po-badge-success">OK</span>') + '</td></tr>');
        });

        const scst = data.scstReview || {};
        const scstRows = [];
        Object.keys(scst.perCategory || {}).forEach(catId => {
            const row = scst.perCategory[catId];
            const ws = row.total_working_strength !== undefined ? row.total_working_strength : row.total_posts;
            row.groups.forEach(g => {
                scstRows.push('<tr>' + poTd(row.category_name) + poTd(g.label) +
                    poTd(String(ws)) + poTd(g.percent + '%') +
                    poTd(String(g.required)) + poTd(String(g.actual)) + poTd(String(g.shortfall)) + poTd(String(g.actual_after === undefined ? '-' : g.actual_after)) +
                    '<td><span class="po-badge po-badge-' + (g.actual_after !== undefined && g.actual_after >= g.required ? 'success' : 'warn') + '">' +
                    (g.actual_after !== undefined && g.actual_after >= g.required ? 'MET' : 'SHORTFALL') + '</span></td></tr>');
            });
        });
        const adjRows = (scst.adjustments || []).map(a =>
            '<tr>' + poTd(a.category) + poTd(a.sc_group_label || a.group_label) + poTd(a.to_cadre) +
            poTd((a.inserted_employee_name || a.inserted_employee_id) + ' (seq ' + (a.inserted_allocation_sequence === null ? '-' : a.inserted_allocation_sequence) + ')') +
            poTd((a.replaced_employee_name || a.replaced_employee_id) + ' (seq ' + (a.replaced_allocation_sequence === null ? '-' : a.replaced_allocation_sequence) + ')') +
            poTd(a.from_cadre) + poTd(a.reason) + '</tr>');

        const snap = data.snapshot || {};
        const snapHtml = '<h4>Allocation run snapshot (reproducibility)</h4>' +
            poTable(['Field', 'Value'], [
                ['Exercise ID', snap.exercise_id], ['Run ID', snap.run_id],
                ['Engine version', snap.engine_version], ['Engine hash', snap.engine_hash],
                ['FWS version', snap.fws_version], ['FSL version', snap.fsl_version],
                ['Options version', snap.options_version], ['Preferential-claim version', snap.preferential_claim_version],
                ['Policy version', snap.policy_version], ['Policy frozen at', snap.policy_frozen_at],
                ['SC/ST basis', (snap.scst_configuration || {}).basis],
                ['SC/ST rounding policy', (snap.scst_configuration || {}).rounding_policy],
                ['Compulsory allocation policy', snap.compulsory_allocation_policy],
                ['Prefer existing cadre', snap.prefer_existing_on_compulsory === undefined ? '-' : (snap.prefer_existing_on_compulsory ? 'YES' : 'NO')],
                ['Started at', snap.started_at], ['User', snap.user],
                ['Input fingerprint', snap.input_fingerprint],
                ['Input counts', snap.input_counts ? JSON.stringify(snap.input_counts) : '']
            ].map(r => '<tr>' + poTd(r[0]) + poTd(r[1]) + '</tr>')) +
            '<div class="po-note po-note-warn"><span class="po-tag po-tag-dlc">DLC POLICY DECISION</span> ' +
            escapeHtml(POEngine.PO_POLICY_NOTICE_COMPULSORY) + '</div>' +
            '<div class="po-note po-note-warn"><span class="po-tag po-tag-sys">SYSTEM CALCULATION RULE</span> ' +
            escapeHtml(POEngine.PO_POLICY_NOTICE_ROUNDING) + '</div>';

        const errRows = poExceptionRows(data.exceptions || []);

        return poCard(title,
            '<div class="po-actions" style="margin-bottom:12px;"><span class="po-badge po-badge-' +
                (data.run.status === 'PASSED' ? 'success' : 'danger') + '">Run ' + tag + ' - ' + data.run.status + '</span>' +
                '<span class="po-chip">Run id ' + escapeHtml(data.run.run_id) + '</span>' +
                '<span class="po-chip">Engine ' + escapeHtml(data.run.engine_version) + '</span>' +
                '<span class="po-chip">FSL ' + escapeHtml(data.run.fsl_version) + '</span>' +
                '<span class="po-chip">Options ' + escapeHtml(data.run.options_version) + '</span>' +
                '<span class="po-chip">FWS ' + escapeHtml(data.run.fws_version) + '</span></div>' +
            poStats([
                { value: data.run.total_fsl, label: 'FSL employees' },
                { value: data.run.allocated, label: 'Allotted' },
                { value: data.run.unallocated, label: 'Not allocable' },
                { value: (data.exceptions || []).length, label: 'Exceptions' },
                { value: (scst.adjustments || []).length, label: 'SC/ST adjustments' }
            ]) +
            '<div class="po-two-col">' +
                '<div><h4>Allocation reasons</h4>' + poTable(['Reason', 'Count'], reasonRows) + '</div>' +
                '<div><h4>Vacancy ledger by rank + cadre (FWS utilisation)</h4>' + poTable(['Category', 'Cadre', 'FWS', 'Allotted', 'Remaining working strength', 'Check'], ledger) + '</div>' +
            '</div>' +
            snapHtml +
            '<h4>SC/ST proportionate review <span class="po-tag po-tag-go">GO REQUIREMENT</span> basis: ' +
                escapeHtml(scst.basis || '') + '</h4>' +
            '<div class="po-note po-note-info">Required representation is calculated from <strong>working strength</strong>, ' +
                'not from the number of employees allotted. Rounding policy: <strong>' +
                escapeHtml(scst.rounding_policy || POEngine.PO_DEFAULT_ROUNDING_POLICY) + '</strong>.</div>' +
            poTable(['Category', 'Reserved group', 'Working strength', 'Percent', 'Required representation',
                     'Actual allocated', 'Shortfall', 'Actual after adjustment', 'Status'], scstRows) +
            (adjRows.length ? '<h4>SC/ST adjustments made (substituting the LAST ALLOTTED general category employee)</h4>' +
                poTable(['Category', 'SC/ST group', 'Cadre', 'Employee inserted', 'Employee replaced (last allotted general category)', 'Replaced moved to', 'Reason'], adjRows) : '') +
            ((scst.shortfalls || []).length ? '<h4>SC/ST shortfalls carried to the FAL as exceptions</h4>' +
                poTable(['Category', 'Group', 'Cadre', 'Working strength', 'Required', 'Actual', 'Shortfall', 'Reason'],
                    scst.shortfalls.map(s => '<tr>' + poTd(s.category) + poTd(s.group_label) + poTd(s.cadre) +
                        poTd(String(s.working_strength)) + poTd(String(s.required)) + poTd(String(s.actual)) +
                        poTd(String(s.shortfall)) + poTd(s.reason) + '</tr>')) : '') +
            (errRows.length ? '<h4>Exceptions (PART 29 error format)</h4>' + errRows : ''),
            '');
    };

    /** PART 29: code / description / employee / rank / cadre / source data / action. */
    function poExceptionRows(list) {
        if (!list.length) return '';
        return '<div class="po-table-wrap"><table><thead><tr>' +
            '<th>Severity</th><th>Error code</th><th>Description</th><th>Employee</th><th>Rank</th>' +
            '<th>Cadre</th><th>Source data</th><th>Recommended action</th>' +
            '</tr></thead><tbody>' +
            list.map(e => {
                const d = poIssueDetail(e);
                return '<tr><td>' + poSev(e.severity) + '</td>' +
                    '<td style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px">' + escapeHtml(d.code) + '</td>' +
                    '<td>' + escapeHtml(d.description) + '</td>' + poTd(d.employee) + poTd(d.rank) + poTd(d.cadre) +
                    poTd(d.source_data || e.message) + '<td>' + escapeHtml(d.recommended_action) + '</td></tr>';
            }).join('') + '</tbody></table></div>';
    }

    content.innerHTML =
        poCard('Step 5 &middot; Allocation engine',
            '<p class="po-hint">The engine is deterministic and repeatable: FWS + seniority list + preferential claims + seniority + options + vacancy + SC/ST review. ' +
            'Every allotment carries a reason and can be explained.</p>' +
            '<div class="po-phases">' +
                '<div><b>1. Physically handicapped</b> PwBD (70%+) and employees with a dependent disabled child &mdash; verified claims</div>' +
                '<div><b>2. Widow</b> widow who remained unmarried &mdash; verified claims</div>' +
                '<div><b>3. Health problems</b> cancer, major neurosurgery, kidney, liver, open-heart &mdash; verified claims</div>' +
                '<div><b>4. SC/ST reserved share</b> each cadre&rsquo;s own reserved posts are allotted first, by seniority</div>' +
                '<div><b>5. General category</b> remaining employees by seniority list: preference 1, then 2, then 3</div>' +
                '<div><b>Compulsory</b> where every stated preference is unavailable, only where a shortfall exists</div>' +
                '<div><b>No option</b> employees with no option &mdash; processed last, only onto shortfall posts</div>' +
                '<div><b>Final check</b> SC/ST proportions verified; allocation beyond FWS fails the run</div>' +
            '</div>' +
            (canRun
                ? '<div class="po-actions">' +
                    '<button class="btn btn-secondary" onclick="poRunSimulation()">RUN SIMULATION (does not alter official data)</button>' +
                    '<button class="btn btn-primary" onclick="poConfirmAllocationFlow()">CONFIRM ALLOCATION (official version)</button>' +
                  '</div>'
                : '<div class="po-note po-note-info">Allocation is available once the FSL is finalized, locked and published.</div>'), '') +
        preview(sim, 'Simulation result', 'SIMULATION') +
        preview(run, 'Official allocation run', 'CONFIRMED');
}

function poRunSimulation() {
    const r = poSimulateAllocation();
    if (!r) return;
    showToast('Simulation complete: ' + r.run.allocated + ' proposed allotments, ' + r.run.unallocated + ' not allocable', r.run.status === 'PASSED' ? 'success' : 'error');
    renderPOModule();
}

function poConfirmAllocationFlow() {
    if (!poState.simulation) { showToast('Run a simulation first', 'error'); return; }
    if (!confirm('CONFIRM ALLOCATION?\n\nThis creates the official allocation version against the current FWS (' + poVersionLabel('fws') +
        '), FSL (' + poVersionLabel('fsl') + ') and Options (' + poVersionLabel('options') + '). It cannot be silently re-run.')) return;
    const r = poConfirmAllocation();
    if (!r) return;
    if (r.run.status !== 'PASSED') {
        showToast('ALLOCATION FAILED: ' + r.exceptions.filter(e => e.severity === 'BLOCKING').map(e => e.code).join(', ') + '. No automatic correction applied.', 'error');
        renderPOModule();
        return;
    }
    showToast('Allocation confirmed: ' + r.run.allocated + ' allotted', 'success');
    renderPOModule();
}

function poExplainAllocation(employeeId) {
    const a = (poState.allocations || []).find(x => x.employee_id === employeeId);
    if (!a) { showToast('No allotment recorded for this employee', 'error'); return; }
    const dlg = document.createElement('div');
    dlg.className = 'modal-overlay';
    dlg.style.display = 'flex';
    const rows = [
        ['Employee', a.name], ['Rank / category', a.category_name + ' (' + a.rank_code + ')'],
        ['FSL seniority', a.seniority_no], ['Preferential status', a.preferential_status + (a.preferential_claim_label ? ' - ' + a.preferential_claim_label : '')],
        ['Options considered', (a.preference_considered || []).join(' -> ') || 'none stated'],
        ['Option 1 / 2 / 3', [a.option_pref1, a.option_pref2, a.option_pref3].filter(Boolean).join(' / ') || 'none stated'],
        ['Preference selected', a.preference_selected ? ((poCtx().cadreById[a.preference_selected] || {}).name || a.preference_selected) + ' (preference ' + a.preference_rank + ')' : 'none'],
        ['FINAL ALLOYMENT', a.cadre_name],
        ['Allocation reason', a.allocation_reason],
        ['Why', a.reason_detail || ''],
        ['Allocation sequence', a.allocation_sequence],
        ['Vacancy before / after', a.vacancy_before + ' -> ' + a.vacancy_after],
        ['SC/ST group', a.sc_group || 'not reserved'],
        ['SC/ST adjustment', a.sc_st_adjustment ? (a.sc_st_adjustment.role + ' - ' + a.sc_st_adjustment.group + ' for ' + a.sc_st_adjustment.reason) : 'none'],
        ['Run id', a.run_id], ['FSL version', a.fsl_version], ['Options version', a.options_version],
        ['Allocation engine version', a.engine_version], ['Allocated at', a.allocated_at]
    ];
    dlg.innerHTML = '<div class="modal" style="max-width:640px;">' +
        '<div class="modal-header"><h3>Why was ' + escapeHtml(a.name) + ' allotted to ' + escapeHtml(a.cadre_name) + '?</h3>' +
        '<button class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()">&times;</button></div>' +
        '<div class="modal-body"><div class="po-table-wrap"><table class="po-mini"><tbody>' +
        rows.map(r => '<tr><th style="width:230px">' + escapeHtml(r[0]) + '</th><td>' + poDash(r[1]) + '</td></tr>').join('') +
        '</tbody></table></div></div>' +
        '<div class="modal-footer"><button class="btn btn-secondary" onclick="this.closest(\'.modal-overlay\').remove()">Close</button></div></div>';
    document.body.appendChild(dlg);
}


// ============================================================================
// STEP 6 - FAL (para 18 & 19)
// ============================================================================

function renderStepFal(content) {
    const fal = poState.fal;
    const report = poFALValidation();
    const ctx = poCtx();
    const admin = poIsAdmin();

    const viewSel =
        '<select id="poFalView" onchange="poFalViewChanged(this.value)">' +
        ['cadre', 'rank', 'employee', 'erstwhile'].map(v =>
            '<option value="' + v + '"' + (poFals.view === v ? ' selected' : '') + '>' +
            escapeHtml({ cadre: 'Cadre-wise', rank: 'Rank-wise', employee: 'Employee-wise', erstwhile: 'Erstwhile-cadre-wise' }[v]) + '</option>').join('') +
        '</select>';

    let rows = [];
    if (fal && fal.rows.length) {
        let list = fal.rows;
        if (poFals.query) {
            const q = poFals.query.toLowerCase();
            list = list.filter(r => (r.name || '').toLowerCase().indexOf(q) !== -1 ||
                                     String(r.seniority_no).indexOf(q) !== -1 ||
                                     (r.cadre_name || '').toLowerCase().indexOf(q) !== -1);
        }
        const keyOf = { cadre: r => r.cadre_name, rank: r => r.category_name, employee: r => r.name, erstwhile: r => r.erstwhile_cadre_name || '(not stated)' }[poFals.view];
        const grouped = {};
        list.forEach(r => {
            const k = keyOf(r) || '(not stated)';
            (grouped[k] = grouped[k] || []).push(r);
        });
        Object.keys(grouped).sort().forEach(k => {
            rows.push('<tr class="po-group-row"><th colspan="22">' + escapeHtml(k) + ' (' + grouped[k].length + ')</th></tr>');
            grouped[k].forEach((r, i) => {
                const f = poState.fsl.find(x => x.employee_id === r.employee_id) || {};
                const isExc = (report.blocking || []).some(b => b.employee_id === r.employee_id) ||
                              ((poState.allocationRun ? poState.allocationRun.exceptions : []) || []).some(e => e.employee_id === r.employee_id);
                rows.push('<tr>' +
                    poTd(String(i + 1)) +
                    poTd((ctx.cadreById[r.erstwhile_cadre_id] || {}).name || r.erstwhile_cadre_name) +
                    poTd(r.name) + poTd(poState.exercise.department) +
                    poTd(f.present_working_place || r.office) + poTd(r.designation || r.rank_code) +
                    poTd(f.gender) + poTd(f.social_category) + poTd(f.cfms_id) + poTd(f.mobile) + poTd(f.date_of_birth) +
                    poTd(r.seniority_no) + poTd(r.category_name) +
                    poTd(r.preferential_claim_label || 'None') + poTd(r.preferential_status) +
                    poTd([r.option_pref1, r.option_pref2, r.option_pref3].filter(Boolean).join(' / ') || '-') +
                    '<td><strong>' + escapeHtml(r.cadre_name) + '</strong>' +
                        (r.deputation ? ' <span class="po-badge po-badge-warn">DEPUTATION</span>' : '') + '</td>' +
                    poTd(r.allocation_reason, 'font-size:10px') +
                    poTd(String(r.allocation_sequence), 'text-align:center') +
                    '<td>' + (isExc ? '<span class="po-badge po-badge-danger">EXCEPTION</span>' : '<span class="po-badge po-badge-success">CLEAR</span>') + '</td>' +
                    '<td>' + (admin && !fal.locked
                        ? '<input type="text" class="po-strength-input" style="width:130px" placeholder="e.g. deputation" value="' + escapeHtml(r.remarks || '') + '" onchange="poSetFalRemarkFromUi(\'' + poQs(r.employee_id) + '\',this.value)">'
                        : escapeHtml(r.remarks || '-')) + '</td>' +
                    '<td><button class="action-btn btn-secondary" onclick="poExplainAllocation(\'' + poQs(r.employee_id) + '\')">Why?</button></td>' +
                '</tr>');
            });
        });
    }

    content.innerHTML =
        poCard('Step 6 &middot; Final Allocation List',
            '<p class="po-hint">The FAL is generated by the allocation engine and cannot be hand-edited. ' +
            '<strong>Remarks</strong> (e.g. &ldquo;deputation&rdquo;) are DLC notes per employee and stay editable until the FAL is published; ' +
            'employees allotted beyond a cadre&rsquo;s sanctioned strength are flagged <strong>DEPUTATION</strong>.</p>' +
            '<div class="po-actions" style="margin-bottom:12px;">' +
                (admin && !fal ? '<button class="btn btn-primary" onclick="poGenerateFalFlow()">Generate FAL from the confirmed run</button>' : '') +
                (admin && fal && fal.status === 'DRAFT' ? '<button class="btn btn-primary" onclick="poApproveFalFlow()">Approve FAL</button>' : '') +
                (admin && fal && fal.status === 'APPROVED' ? '<button class="btn btn-primary" onclick="poPublishFalFlow()">Publish FAL (locks it)</button>' : '') +
                (admin && fal && fal.locked ? '<button class="btn btn-secondary" onclick="poReviseFalFlow()">Start FAL revision</button>' : '') +
                (fal ? '<button class="btn btn-secondary" onclick="poExportFalCsv()">Export FAL</button>' +
                       '<button class="btn btn-secondary" onclick="poPrintFal()">Print / PDF</button>' : '') +
            '</div>' +
            poStats([
                { value: fal ? fal.rows.length : 0, label: 'FAL rows' },
                { value: fal ? fal.version : '-', label: 'FAL version' },
                { value: fal ? fal.status : 'NONE', label: 'FAL status' },
                { value: report.counts ? report.counts.preferential : 0, label: 'Preferential' },
                { value: report.counts ? report.counts.compulsory : 0, label: 'Compulsory' },
                { value: report.counts ? report.counts.no_option : 0, label: 'No-option' }
            ]) +
            (fal && fal.locked ? '<div class="po-note po-note-info">FAL published at ' + escapeHtml((fal.published_at || '').slice(0, 16).replace('T', ' ')) + ' and LOCKED.</div>' : '') +
            '<div class="po-filters">' + viewSel +
                '<input type="text" id="poFalSearch" placeholder="Search name, seniority, cadre" value="' + escapeHtml(poFals.query) + '" oninput="poFalSearchChanged(this.value)">' +
            '</div>' +
            poTable(['Sl.No', 'Erstwhile Local Cadre', 'Employee Name', 'Department', 'Present Office', 'Designation', 'Gender',
                     'Social Category', 'CFMS ID', 'Mobile', 'Date of Birth', 'Seniority No.', 'Rank',
                     'Preferential Category', 'Claim Status', 'Preference 1/2/3', 'Final Allotted Local Cadre',
                     'Allocation Reason', 'Alloc Seq', 'Exception Status', 'Remarks', ''], rows), '') +

        poCard('FAL validation (para 19)', poValidationPanel('FAL', {
            valid: report.valid,
            errors: [],
            blocking: report.blocking || [],
            warnings: report.warnings || [],
            passed: report.passed || []
        }), '');
}

function poFalViewChanged(v) { poFals.view = v; renderCurrentPOTab(); }
function poFalSearchChanged(v) { poFals.query = v; renderCurrentPOTab(); const el = document.getElementById('poFalSearch'); if (el) { el.focus(); el.setSelectionRange(v.length, v.length); } }
function poSetFalRemarkFromUi(employeeId, value) {
    if (poSetFalRemark(employeeId, value)) { renderCurrentPOTab(); }
}

function poGenerateFalFlow() {
    if (!confirm('Generate the FAL from the confirmed allocation run?')) return;
    if (poGenerateFal()) { showToast('FAL generated', 'success'); renderPOModule(); }
}
function poApproveFalFlow() {
    if (!confirm('Approve the FAL?')) return;
    if (poApproveFal()) { showToast('FAL approved', 'success'); renderPOModule(); }
}
function poPublishFalFlow() {
    if (!confirm('Publish and LOCK the FAL? Subsequent change requires the revision workflow.')) return;
    if (poPublishFal()) { showToast('FAL published and locked', 'success'); renderPOModule(); }
}
function poReviseFalFlow() {
    const reason = prompt('FAL revision reason (mandatory):', '');
    if (reason === null) return;
    if (!confirm('This unlocks the FAL and discards the confirmed allocation run so it can be re-simulated and re-confirmed. Continue?')) return;
    if (poReviseFal(reason)) { showToast('FAL revision started', 'success'); renderPOModule(); }
}

function poExportFalCsv() {
    const fal = poState.fal;
    if (!fal) return;
    const fslById = {}; poState.fsl.forEach(f => { fslById[f.employee_id] = f; });
    // Annexure-III (17 columns) plus the DLC's deputation working notes.
    const headers = ['Sl.No', 'Erstwhile Local Cadre', 'Department', 'Office', 'Employee Name', 'Present Working Place',
        'Designation', 'Date of Birth', 'Gender', 'CFMS ID', 'Community', 'Mobile Number',
        'Order of Preference', 'Preferential Claim', 'Seniority No', 'Final Allotted Local Cadre', 'Remarks', 'Deputation'];
    const rows = fal.rows.map((r, i) => {
        const f = fslById[r.employee_id] || {};
        return [i + 1, r.erstwhile_cadre_name, poState.exercise.department, r.office || f.present_working_place,
            r.name, f.present_working_place, r.designation || r.rank_code, f.date_of_birth, f.gender, f.cfms_id,
            f.social_category, f.mobile, [r.option_pref1, r.option_pref2, r.option_pref3].filter(Boolean).join(' / '),
            r.preferential_claim_label || '', r.seniority_no, r.cadre_name, r.remarks || '', r.deputation ? 'YES' : ''];
    });
    downloadFile(poToCsv(headers, rows), 'PO_FAL_' + poState.exercise.exercise_id + '_' + fal.version + '.csv', 'text/csv');
    showToast('FAL exported', 'success');
}

function poPrintFal() {
    const fal = poState.fal;
    if (!fal) return;
    const fslById = {}; poState.fsl.forEach(f => { fslById[f.employee_id] = f; });
    const headers = ['Sl.No', 'Erstwhile Local Cadre', 'Department', 'Office', 'Employee Name', 'Present Working Place',
        'Designation', 'Date of Birth', 'Gender', 'CFMS ID', 'Community', 'Mobile',
        'Order of Preference', 'Preferential Claim', 'Seniority No', 'Final Allotted Local Cadre'];
    const body = fal.rows.map((r, i) => {
        const f = fslById[r.employee_id] || {};
        return '<tr>' +
            '<td>' + (i + 1) + '</td>' +
            '<td>' + escapeHtml(r.erstwhile_cadre_name) + '</td>' +
            '<td>' + escapeHtml(poState.exercise.department) + '</td>' +
            '<td>' + escapeHtml(r.office || f.present_working_place) + '</td>' +
            '<td>' + escapeHtml(r.name) + '</td>' +
            '<td>' + escapeHtml(f.present_working_place) + '</td>' +
            '<td>' + escapeHtml(r.designation || r.rank_code) + '</td>' +
            '<td>' + poDash(f.date_of_birth) + '</td>' +
            '<td>' + poDash(f.gender) + '</td>' +
            '<td>' + poDash(f.cfms_id) + '</td>' +
            '<td>' + poDash(f.social_category) + '</td>' +
            '<td>' + poDash(f.mobile) + '</td>' +
            '<td>' + poDash([r.option_pref1, r.option_pref2, r.option_pref3].filter(Boolean).join(' / ')) + '</td>' +
            '<td>' + poDash(r.preferential_claim_label) + '</td>' +
            '<td>' + poDash(r.seniority_no) + '</td>' +
            '<td><strong>' + escapeHtml(r.cadre_name) + '</strong>' + (r.deputation ? ' <em>(deputation)</em>' : '') + '</td>' +
            '</tr>';
    }).join('');
    const html = '<table><thead><tr>' + headers.map(h => '<th>' + escapeHtml(h) + '</th>').join('') +
        '</tr></thead><tbody>' + body + '</tbody></table>';
    poPrintDocument('ANNEXURE-III - Final Allocation List (FAL)', html);
}


// ============================================================================
// STEP 7 - OOA / OOT / joining (para 20 & 21)
// ============================================================================

function renderStepOrders(content) {
    const admin = poIsAdmin();
    const ooaRows = poState.ooa.map(o =>
        '<tr>' + poTd(o.ooa_id) + poTd(o.name) + poTd(o.parentage) + poTd(o.cfms_id) + poTd(o.mobile) +
        poTd(o.designation) + poTd(o.erstwhile_cadre) + poTd(o.new_cadre) +
        poTd(o.order_no) + poTd(o.order_date) +
        '<td><span class="po-badge po-badge-' + poOoaTone(o.status) + '">' + escapeHtml(o.status) + '</span></td>' +
        '<td>' + (admin && o.status === 'DRAFT'
            ? '<button class="action-btn btn-secondary" onclick="poReviseOoaFlow(\'' + poQs(o.ooa_id) + '\')">Cancel/Revise</button>'
            : (admin && o.status === 'ISSUED'
                ? '<button class="action-btn btn-secondary" onclick="poReviseOoaFlow(\'' + poQs(o.ooa_id) + '\')">Revise (never deleted)</button>' +
                  '<button class="action-btn btn-primary" onclick="poPrintOoa(\'' + poQs(o.ooa_id) + '\')">Print</button>'
                : '')) + '</td></tr>');

    const ootRows = poState.oot.map(o =>
        '<tr class="' + (o.transfer_required ? '' : 'po-row-muted') + '">' +
        poTd(o.oot_id) + poTd(o.name) +
        '<td><span class="po-badge po-badge-' + (o.transfer_required ? 'info' : 'success') + '">' + (o.transfer_required ? 'TRANSFER REQUIRED' : 'NO TRANSFER') + '</span></td>' +
        poTd(o.existing_cadre) + poTd(o.existing_office) + poTd(o.new_cadre) + poTd(o.new_reporting_office) +
        poTd(o.ooa_no) + poTd(o.order_no) + poTd(o.order_date) + poTd(o.joining_deadline) +
        '<td><span class="po-badge po-badge-' + poJoiningTone(o.joining_status) + '">' + escapeHtml(poJoiningLabel(o.joining_status)) + '</span></td>' +
        '<td>' + (admin && o.status === 'ISSUED' && o.transfer_required
            ? '<button class="action-btn btn-primary" onclick="poRecordJoiningFlow(\'' + poQs(o.oot_id) + '\')">Record joining</button>' +
              (o.joining_status === 'OVERDUE' ? '<button class="action-btn btn-secondary" onclick="poRecordJoiningFlow(\'' + poQs(o.oot_id) + '\',\'EXCEPTION\')">Mark exception</button>' : '')
            : '') + '</td></tr>');

    content.innerHTML =
        poCard('Step 7a &middot; Order of Allotment (OOA)',
            '<p class="po-hint">Status DRAFT &rarr; APPROVED &rarr; ISSUED. An issued OOA is never deleted; it is superseded by a recorded revision.</p>' +
            '<div class="po-actions" style="margin-bottom:12px;">' +
                (admin ? '<button class="btn btn-primary" onclick="poGenerateOoaFlow()">Generate OOA</button>' +
                         '<button class="btn btn-secondary" onclick="poApproveOoaFlow()">Approve drafts</button>' +
                         '<button class="btn btn-secondary" onclick="poIssueOoaFlow()">Issue approved OOA</button>' : '') +
                (poState.ooa.length ? '<button class="btn btn-secondary" onclick="poPrintAllOoa()">Print all</button>' : '') +
            '</div>' +
            poTable(['OOA ID', 'Employee', 'Parentage', 'CFMS ID', 'Mobile', 'Designation',
                     'Erstwhile Local Cadre', 'New Allotted Local Cadre', 'Order No', 'Order Date', 'Status', ''], ooaRows), '') +

        poCard('Step 7b &middot; Order of Transfer (OOT) and joining',
            '<p class="po-hint">If the allotted cadre equals the present local cadre, no transfer order is required and the employee continues in the existing post. ' +
            'Otherwise an OOT is generated. Joining is to be reported within ' + (poState.joiningWindowDays || 7) + ' days of issue.</p>' +
            '<div class="po-actions" style="margin-bottom:12px;">' +
                (admin ? '<button class="btn btn-primary" onclick="poGenerateOotFlow()">Generate OOT where required</button>' +
                         '<button class="btn btn-secondary" onclick="poIssueOotFlow()">Issue OOT</button>' : '') +
                (poState.oot.length ? '<button class="btn btn-secondary" onclick="poPrintAllOot()">Print all</button>' : '') +
                (poUnresolvedJoining().length ? '<button class="btn btn-danger" onclick="poJoiningClosureOverrideFlow()">Authorise closure override (' + poUnresolvedJoining().length + ')</button>' : '') +
            '</div>' +
            (poUnresolvedJoining().length
                ? '<div class="po-note po-note-warn">' + poUnresolvedJoining().length + ' mandatory joining record(s) unresolved. The exercise cannot be closed until each is recorded, marked as an exception, or covered by an authorised closure override.</div>'
                : '') +
            poTable(['OOT ID', 'Employee', 'Transfer', 'Existing Local Cadre', 'Existing Office',
                     'New Reporting Cadre', 'New Reporting Office', 'OOA No', 'OOT No', 'OOT Date',
                     'Joining Deadline', 'Joining Status', ''], ootRows), '');
}

function poOoaTone(s) {
    if (s === 'ISSUED') return 'success';
    if (s === 'APPROVED') return 'info';
    if (s === 'REVISED' || s === 'CANCELLED') return 'danger';
    return 'warn';
}

function poGenerateOoaFlow() {
    if (!confirm('Generate an OOA draft for every employee on the published FAL?')) return;
    const n = poGenerateOoa();
    if (n) { showToast(n + ' OOA draft(s) generated', 'success'); renderPOModule(); }
}
function poApproveOoaFlow() {
    if (!confirm('Approve every OOA in DRAFT?')) return;
    const n = poApproveOoa();
    if (n) { showToast(n + ' OOA approved', 'success'); renderPOModule(); }
}
function poIssueOoaFlow() {
    const prefix = prompt('Order number prefix (default OOA/<year>/):', 'OOA/' + new Date().getFullYear() + '/');
    if (prefix === null) return;
    if (!confirm('Issue every approved OOA? An issued order cannot be deleted afterwards.')) return;
    const n = poIssueOoa(prefix);
    if (n) { showToast(n + ' OOA issued', 'success'); renderPOModule(); }
}
function poReviseOoaFlow(ooaId) {
    const reason = prompt('Revision / cancellation reason (mandatory, recorded in the audit trail):', '');
    if (reason === null) return;
    if (poReviseOoa(ooaId, reason)) { showToast('OOA marked REVISED', 'success'); renderPOModule(); }
}
function poGenerateOotFlow() {
    if (!confirm('Generate an OOT for every employee whose allotted cadre differs from the present local cadre?')) return;
    const n = poGenerateOot();
    if (n === 0 && !poState.oot.length) { showToast('OOT generation blocked', 'error'); return; }
    showToast(n + ' transfer order(s) required out of ' + poState.oot.length + ' employee(s)', 'success');
    renderPOModule();
}
function poIssueOotFlow() {
    const prefix = prompt('Order number prefix (default OOT/<year>/):', 'OOT/' + new Date().getFullYear() + '/');
    if (prefix === null) return;
    if (!confirm('Issue every draft OOT? Joining deadline is ' + (poState.joiningWindowDays || 7) + ' days from the issue date.')) return;
    const n = poIssueOot(prefix);
    if (n) { showToast(n + ' OOT issued', 'success'); renderPOModule(); }
}
function poJoiningLabel(s) {
    return s === 'NOT_REQUIRED' ? 'NOT REQUIRED' : (s === 'REPORTED' ? 'JOINED' : (s || 'PENDING'));
}

function poJoiningTone(s) {
    if (s === 'JOINED' || s === 'REPORTED') return 'success';
    if (s === 'OVERDUE') return 'danger';
    if (s === 'EXCEPTION') return 'warn';
    if (s === 'NOT_REQUIRED') return 'info';
    return 'warn';
}

function poRecordJoiningFlow(ootId, statusOverride) {
    const d = prompt('Joining report date (YYYY-MM-DD):', new Date().toISOString().slice(0, 10));
    if (!d) return;
    const remark = prompt('Remark (optional):', '') || '';
    if (poRecordJoining(ootId, d, remark, statusOverride)) { showToast('Joining recorded', 'success'); renderPOModule(); }
}

function poJoiningClosureOverrideFlow() {
    const open = poUnresolvedJoining();
    if (!open.length) { showToast('No unresolved joining records', 'error'); return; }
    if (!confirm('Authorise closure with ' + open.length + ' unresolved joining record(s)?\n\n' +
        open.map(o => o.name + ' - ' + o.joining_status + (o.joining_deadline ? ' (deadline ' + o.joining_deadline + ')' : '')).join('\n') +
        '\n\nThis is recorded as an audit event with the reason and authority.')) return;
    const reason = prompt('Reason for the closure override (mandatory):', '');
    if (reason === null) return;
    const authority = prompt('Authorising authority (mandatory):', '');
    if (authority === null) return;
    if (poOverrideJoiningClosure(reason, authority)) { showToast('Closure override authorised and recorded', 'success'); renderPOModule(); }
}

function poPrintOoa(ooaId) {
    const o = poState.ooa.find(x => x.ooa_id === ooaId);
    if (!o) return;
    const numbered = [
        ['1', 'Full name of the Government Servant', o.name],
        ['2', 'S/o, W/o, M/o', o.parentage],
        ['3', 'CFMS ID of Government Servant', o.cfms_id],
        ['4', 'Government Servant\u2019s Mobile No.', o.mobile],
        ['5', 'Designation', o.designation],
        ['6', 'Erstwhile local cadre as per Presidential Order, 1975.', o.erstwhile_cadre],
        ['7', 'Organised and allotted to the new local cadre in terms of para 4 of the Andhra Pradesh Public Employment (Organisation of Local Cadres and Regulation of Direct Recruitment) Order, 2025:', o.new_cadre]
    ];
    const html =
        '<div class="ooa-head"><strong>GOVERNMENT OF ANDHRA PRADESH</strong><br>' +
        escapeHtml(o.department || 'Police') + ' Department</div>' +
        '<div class="ooa-no">Order No-' + poDash(o.order_no) + ', dated: ' + poDash(o.order_date) + '</div>' +
        '<div class="ooa-sub">Sub: Allotment of persons and organizing them into local cadres as per the Andhra Pradesh ' +
        'Public Employment (Organisation of Local Cadres and Regulation of Direct Recruitment) Order, 2025 &mdash; ' +
        'Allotment to new local cadre &mdash; Orders &mdash; Issued.</div>' +
        '<div class="ooa-ref">Ref:&nbsp;1. G.O.Ms.No.45, GA(SPF &amp; MC) Dept., dated 20.04.2026 published in the Andhra Pradesh ' +
        'Gazette, Part-I Extraordinary No-197, Amaravati, dated 20.04.2026.<br>' +
        '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2. G.O.Ms.No.129, GA(SPF&amp;MC) Dept., dated 17.07.2026.</div>' +
        '<div class="ooa-order"><strong>ORDER</strong><br>' +
        'In exercise of powers conferred under sub-para (1) of paragraph 4 of the Andhra Pradesh Public Employment ' +
        '(Organisation of Local Cadres and Regulation of Direct Recruitment) Order, 2025, orders issued on the process of ' +
        'allotment of persons in the G.O. 2nd cited, and upon considering the option form submitted by the Government servant, ' +
        'and on considering the advice of the Implementation Committee authorized by the Government, the following Order of ' +
        'Allotment (OOA) is hereby issued:-</div>' +
        '<table class="ooa-fields"><tbody>' +
        numbered.map(r => '<tr><td class="ooa-num">' + r[0] + '</td><td class="ooa-label">' + escapeHtml(r[1]) + '</td>' +
            '<td class="ooa-val">' + poDash(r[2]) + '</td></tr>').join('') +
        '</tbody></table>' +
        '<div class="ooa-clauses">2. The above orders shall come into force with immediate effect, and the Local cadre of the ' +
        'above Government servant shall stand organized and allotted to the new local cadre mentioned above.<br>' +
        '3. The Government servant is directed to report to the new local cadre office, within seven (7) days from the date of ' +
        'issue of this order.</div>' +
        '<div class="ooa-sign"><div>Place: ____________________</div>' +
        '<div class="ooa-sign-right">Signature of the district head/HoD/Secretary to Government<br>' +
        '<strong>' + escapeHtml(o.competent_authority || '') + '</strong></div></div>' +
        '<div class="ooa-to"><strong>To</strong><br>' +
        'Sri/Smt ' + escapeHtml(o.name) + '<br>' + escapeHtml(o.designation || '') + '<br>Present Office address</div>' +
        '<div class="ooa-copies"><strong>Copy to:</strong><br>The DTO (districts)<br>' +
        'The Director of Treasuries and Accounts, AP Mangalagiri.<br>' +
        'The Principal Accountant General, A.P., Vijayawada.</div>';
    poPrintDocument('ANNEXURE-IV - Order of Allotment - ' + (o.order_no || o.ooa_id), html, true);
}

function poPrintAllOoa() {
    poPrintDocument('Orders of Allotment',
        '<table><thead><tr><th>Order No</th><th>Date</th><th>Name</th><th>CFMS ID</th><th>Designation</th>' +
        '<th>Erstwhile Cadre</th><th>New Allotted Cadre</th><th>Status</th></tr></thead><tbody>' +
        poState.ooa.map(o => '<tr><td>' + poDash(o.order_no) + '</td><td>' + poDash(o.order_date) + '</td><td>' + escapeHtml(o.name) +
            '</td><td>' + poDash(o.cfms_id) + '</td><td>' + poDash(o.designation) + '</td><td>' + poDash(o.erstwhile_cadre) +
            '</td><td>' + escapeHtml(o.new_cadre) + '</td><td>' + escapeHtml(o.status) + '</td></tr>').join('') +
        '</tbody></table>');
}

function poPrintAllOot() {
    const req = poState.oot.filter(o => o.transfer_required);
    poPrintDocument('Orders of Transfer',
        '<p>Joining is to be reported within ' + (poState.joiningWindowDays || 7) + ' days of issue.</p>' +
        '<table><thead><tr><th>OOT No</th><th>Date</th><th>Name</th><th>Designation</th><th>Existing Local Cadre</th>' +
        '<th>Existing Office</th><th>New Reporting Cadre</th><th>Joining Deadline</th><th>Joining Status</th></tr></thead><tbody>' +
        (req.length ? req.map(o => '<tr><td>' + poDash(o.order_no) + '</td><td>' + poDash(o.order_date) + '</td><td>' + escapeHtml(o.name) +
            '</td><td>' + poDash(o.designation) + '</td><td>' + poDash(o.existing_cadre) + '</td><td>' + poDash(o.existing_office) +
            '</td><td>' + escapeHtml(o.new_cadre) + '</td><td>' + poDash(o.joining_deadline) + '</td><td>' + escapeHtml(o.joining_status) + '</td></tr>').join('')
            : '<tr><td colspan="9">No transfer is required for any employee.</td></tr>') +
        '</tbody></table>');
}

function poPrintDocument(title, bodyHtml, bare) {
    const w = window.open('', '', 'width=1000,height=760');
    if (!w) { showToast('Allow pop-ups to print the order document', 'error'); return; }
    w.document.write('<!DOCTYPE html><html><head><title>' + escapeHtml(title) + '</title><style>' +
        'body{font-family:serif;padding:34px;font-size:13px;color:#000}' +
        'h1{text-align:center;font-size:18px;text-transform:uppercase}' +
        'h3{text-align:center;font-weight:normal;margin-top:4px}' +
        '.ref{text-align:center;font-size:11px;margin-bottom:18px}' +
        'table{width:100%;border-collapse:collapse;margin-top:10px;font-size:12px}' +
        'th,td{border:1px solid #000;padding:5px;text-align:left;vertical-align:top}' +
        'th{background:#eee;width:200px}' +
        '.po-order th{width:230px}' +
        '.po-sign{margin-top:60px;text-align:right;padding-right:40px}' +
        '.ooa-head{text-align:center;font-size:15px;margin-bottom:6px}' +
        '.ooa-no,.ooa-sub,.ooa-ref{margin:6px 0}' +
        '.ooa-order{margin:14px 0}' +
        '.ooa-fields td{padding:6px;border:1px solid #000}' +
        '.ooa-fields .ooa-num{width:28px;text-align:center}' +
        '.ooa-fields .ooa-label{width:300px}' +
        '.ooa-fields .ooa-val{font-weight:bold}' +
        '.ooa-clauses{margin:14px 0}' +
        '.ooa-sign{margin-top:70px;display:flex;justify-content:space-between}' +
        '.ooa-sign-right{text-align:right}' +
        '.ooa-to{margin-top:40px}' +
        '.ooa-copies{margin-top:20px}' +
        '@media print{.no-print{display:none}}</style></head><body>' +
        (bare
            ? '<h1 style="text-align:center;font-size:14px">ANNEXURE-IV</h1>' +
              '<div style="text-align:center;font-size:11px">[to G.O. Ms.No.129, G.A.(SPF &amp; MC) Dept., dated:17.07.2026]<br>' +
              '<strong>Format for Order of Allotment (OOA)</strong></div><hr>' + bodyHtml
            : '<h1>' + escapeHtml(title) + '</h1>' +
              '<h3>' + escapeHtml(POEngine.PO_GO_REFERENCE.order) + ', ' + escapeHtml(POEngine.PO_GO_REFERENCE.department) + ', dated ' + escapeHtml(POEngine.PO_GO_REFERENCE.date) + '</h3>' +
              '<div class="ref">Presidential Order-2025 &middot; ' + escapeHtml(poState.exercise.exercise_id || 'Exercise ID not set') + ' &middot; ' + escapeHtml(POEngine.PO_GO_REFERENCE.scope) + '</div>' +
              bodyHtml) +
        '<br><button class="no-print" onclick="window.print()">Print</button></body></html>');
    w.document.close();
}



// ============================================================================
// Wiring into the existing page navigation
// ============================================================================

function initPOModule() {
    poLoad();
    renderPOModule();
}

const origShowPage = showPage;
showPage = function (pageId) {
    try {
        origShowPage(pageId);
    } catch (e) {
        console.error('showPage error:', e);
    }
    if (pageId === 'presidentialOrder') {
        try {
            showPOPage();
        } catch (e) {
            console.error('PO module render error:', e);
            const c = document.getElementById('poMainContent');
            if (c) c.innerHTML = '<div class="card"><h2>Error</h2><p style="color:var(--danger);">' + escapeHtml(e.message) +
                '</p><p>Please hard-refresh (Ctrl+Shift+R) and try again.</p></div>';
        }
    }
};

// Inline onclick handlers resolve against the global object. Classic scripts
// already expose function declarations, but they are bound explicitly here so
// the module keeps working if it is ever loaded as a non-classic script.
[
    'initPOModule', 'showPOPage', 'renderPOModule', 'renderCurrentPOTab', 'switchPOTab', 'poGotoStep',
    'poAdvanceStage', 'poSaveExerciseFromForm', 'poSaveMembersFromForm',
    'poDlcSeats', 'poDlc', 'poSeatLabel', 'poFreshDlc',
    'poEditCategory', 'poSaveCategoryForm', 'poDeleteCategory', 'poDownloadCategoryTemplate', 'poImportCategoryFile',
    'poSetStrengthField', 'poSetApprovedFromForm',
    'poValidateSeniorityNow', 'poDownloadSeniorityTemplate', 'poExportSeniorityCsv', 'poImportSeniorityFile',
    'poEditSeniorityRecord', 'poSaveSeniorityForm', 'poDeleteSeniorityRecord',
    'poOpenClaimPanel', 'poSaveClaims', 'poVerifyClaim',
    'poFinalizeSeniorityFlow', 'poPublishFslFlow', 'poReviseFslFlow',
    'poSubmitOption', 'poSaveOptionWindow', 'poCloseOptionsFlow', 'poCorrectOptionFlow',
    'poRunSimulation', 'poConfirmAllocationFlow', 'poExplainAllocation',
    'poFalViewChanged', 'poFalSearchChanged', 'poSetFalRemarkFromUi', 'poGenerateFalFlow', 'poApproveFalFlow',
    'poPublishFalFlow', 'poReviseFalFlow', 'poExportFalCsv', 'poPrintFal',
    'poGenerateOoaFlow', 'poApproveOoaFlow', 'poIssueOoaFlow', 'poReviseOoaFlow', 'poPrintOoa',
    'poGenerateOotFlow', 'poIssueOotFlow', 'poRecordJoiningFlow', 'poPrintAllOoa', 'poPrintAllOot',
    'poSetPolicyFromUi', 'poSetDistrictSplitFromUi', 'poFreezePolicyFlow', 'poJoiningClosureOverrideFlow'
].forEach(name => {
    try { window[name] = window[name] || eval(name); } catch (e) { /* not a function - ignore */ }
});
