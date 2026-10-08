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
        const d = poDashboard();
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
                        '<span class="po-chip">FWS ' + escapeHtml(d.versions.fws) + '</span>' +
                        '<span class="po-chip">DSL ' + escapeHtml(d.versions.dsl) + '</span>' +
                        '<span class="po-chip">FSL ' + escapeHtml(d.versions.fsl) + '</span>' +
                        '<span class="po-chip">Options ' + escapeHtml(d.versions.options) + '</span>' +
                        '<span class="po-chip">FAL ' + escapeHtml(d.versions.fal) + '</span>' +
                    '</div>' +
                '</div>' +
                '<div class="po-actions">' +
                    '<button class="btn btn-secondary btn-sm" onclick="poShowAudit()">Audit Trail (' + poState.audit.length + ')</button>' +
                    '<button class="btn btn-secondary btn-sm" onclick="poShowDashboard()">DLC Dashboard</button>' +
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
            case 'dlc': renderStepDlc(content); break;
            case 'ranks': renderStepRanks(content); break;
            case 'strength': renderStepStrength(content); break;
            case 'dsl': renderStepDsl(content); break;
            case 'fsl': renderStepFsl(content); break;
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
        'Any change now requires a revision workflow with a reason and an audit entry.</div>');
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
    const reason = prompt('Reason / remark for advancing the workflow stage (recorded in the audit trail):', '');
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

function renderStepDlc(content) {
    const ex = poState.exercise;
    const editable = poIsAdmin() && poStage() === 'DRAFT';
    const d = poDashboard();

    const composition = [
        { role: 'Chairman', desc: 'District Collector of the erstwhile district', who: ex.chairman_name, desig: ex.chairman_designation },
        { role: 'Co-Chairman', desc: 'District Collector(s) of newly formed district(s)', who: ex.co_chairman_name, desig: ex.co_chairman_designation },
        { role: 'Member-Convener', desc: 'District-level Departmental Head, erstwhile district', who: ex.member_convener_name, desig: ex.member_convener_designation },
        { role: 'Co-Convener', desc: 'District-level Departmental Head(s) of newly formed district(s)', who: ex.co_convener_name, desig: ex.co_convener_designation },
        { role: 'Members', desc: 'District Revenue Officer(s)', who: ex.dro_name, desig: ex.dro_designation }
    ];

    const field = (label, id, val, opts) => {
        const o = opts || {};
        if (!editable) return '<div class="form-group"><label>' + escapeHtml(label) + '</label><div class="po-readonly">' + poDash(val) + '</div></div>';
        if (o.type === 'textarea') {
            return '<div class="form-group"><label>' + escapeHtml(label) + '</label><textarea id="' + id + '" rows="2">' + escapeHtml(val) + '</textarea></div>';
        }
        return '<div class="form-group"><label>' + escapeHtml(label) + '</label><input type="' + (o.type || 'text') + '" id="' + id + '" value="' + escapeHtml(val) + '"' + (o.readonly ? ' readonly' : '') + '></div>';
    };

    content.innerHTML =
        poCard('Step 1 &middot; DLC exercise configuration',
            '<p class="po-hint">Official input. Nothing on this screen is generated by the system.</p>' +
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
            (editable ? '<div class="po-actions"><button class="btn btn-primary" onclick="poSaveExerciseFromForm()">Save DLC configuration</button></div>' : ''),
            '') +
        poCard('DLC composition as prescribed by ' + escapeHtml(POEngine.PO_GO_REFERENCE.order),
            poTable(['Role', 'Prescribed holder', 'Name', 'Designation'],
                composition.map(c => '<tr><td><strong>' + escapeHtml(c.role) + '</strong></td><td>' + escapeHtml(c.desc) + '</td>' + poTd(c.who) + poTd(c.desig) + '</tr>')) +
            (editable
                ? '<div class="form-grid">' +
                    '<div class="form-group"><label>Chairman - name</label><input id="poExChName" value="' + escapeHtml(ex.chairman_name) + '"></div>' +
                    '<div class="form-group"><label>Chairman - designation</label><input id="poExChDesig" value="' + escapeHtml(ex.chairman_designation) + '"></div>' +
                    '<div class="form-group"><label>Co-Chairman - name</label><input id="poExCoName" value="' + escapeHtml(ex.co_chairman_name) + '"></div>' +
                    '<div class="form-group"><label>Co-Chairman - designation</label><input id="poExCoDesig" value="' + escapeHtml(ex.co_chairman_designation) + '"></div>' +
                    '<div class="form-group"><label>Member-Convener - name</label><input id="poExMcName" value="' + escapeHtml(ex.member_convener_name) + '"></div>' +
                    '<div class="form-group"><label>Member-Convener - designation</label><input id="poExMcDesig" value="' + escapeHtml(ex.member_convener_designation) + '"></div>' +
                    '<div class="form-group"><label>Co-Convener - name</label><input id="poExCvName" value="' + escapeHtml(ex.co_convener_name) + '"></div>' +
                    '<div class="form-group"><label>Co-Convener - designation</label><input id="poExCvDesig" value="' + escapeHtml(ex.co_convener_designation) + '"></div>' +
                    '<div class="form-group"><label>DRO - name</label><input id="poExDroName" value="' + escapeHtml(ex.dro_name) + '"></div>' +
                    '<div class="form-group"><label>DRO - designation</label><input id="poExDroDesig" value="' + escapeHtml(ex.dro_designation) + '"></div>' +
                  '</div>' +
                  '<div class="form-group"><label>Other DLC members</label><textarea id="poExOther" rows="2">' + escapeHtml(ex.other_members) + '</textarea></div>' +
                  '<div class="po-actions"><button class="btn btn-primary" onclick="poSaveMembersFromForm()">Save composition</button></div>'
                : (ex.other_members ? '<div class="po-readonly-block"><strong>Other members</strong><br>' + escapeHtml(ex.other_members) + '</div>' : '')),
            '') +
        poCard('Exercise status summary', poStats([
            { value: d.cadres.total, label: 'Cadres' },
            { value: d.cadres.fws, label: 'Total FWS' },
            { value: poState.categories.length, label: 'Rank categories' },
            { value: d.personnel.fsl_total, label: 'FSL records' },
            { value: d.personnel.preferential_cases, label: 'Preferential' },
            { value: d.personnel.no_option, label: 'No option' }
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
    const g = id => (document.getElementById(id) || {}).value || '';
    const ex = poState.exercise;
    ex.chairman_name = g('poExChName'); ex.chairman_designation = g('poExChDesig');
    ex.co_chairman_name = g('poExCoName'); ex.co_chairman_designation = g('poExCoDesig');
    ex.member_convener_name = g('poExMcName'); ex.member_convener_designation = g('poExMcDesig');
    ex.co_convener_name = g('poExCvName'); ex.co_convener_designation = g('poExCvDesig');
    ex.dro_name = g('poExDroName'); ex.dro_designation = g('poExDroDesig');
    ex.other_members = g('poExOther');
    if (poSaveExercise()) { showToast('DLC composition saved', 'success'); renderPOModule(); }
}


// ============================================================================
// STEP 2 - Post category / rank master + cadre configuration (para 2 & 3)
// ============================================================================

function renderStepRanks(content) {
    const editable = poIsAdmin() && poStageIdx(poStage()) <= poStageIdx('CADRE_CONFIGURED');
    const ctx = poCtx();

    const catRows = poState.categories.map(c => {
        const configured = poState.strengths.filter(s => s.category_id === c.id).length;
        return '<tr>' +
            poTd(c.id, 'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px') + poTd(c.code) + poTd(c.name) +
            poTd(c.department) + poTd(c.erstwhile_cadre) +
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
        return '<tr>' +
            poTd(c.id, 'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px') + poTd(c.name) +
            poTd(type ? type.label : c.cadre_type) + poTd(c.level) + poTd(String(fws)) +
            '<td><span class="po-badge po-badge-' + (c.status === 'ACTIVE' ? 'success' : 'info') + '">' + escapeHtml(c.status) + '</span></td>' +
            '<td>' + (editable
                ? '<button class="action-btn btn-primary" onclick="poEditCadre(\'' + poQs(c.id) + '\')">Edit</button> ' +
                  '<button class="action-btn btn-danger" onclick="poDeleteCadre(\'' + poQs(c.id) + '\')">Del</button>'
                : '<span style="color:var(--text-subtle)">locked</span>') + '</td>' +
        '</tr>';
    });

    content.innerHTML =
        poCard('Step 2a &middot; Post category / rank master',
            '<p class="po-hint">Ranks are configuration, not law. Load them from the departmental rank master or define them here. ' +
            'The allocation engine never mixes two categories.</p>' +
            (editable
                ? '<div class="po-actions" style="margin-bottom:12px;">' +
                    '<button class="btn btn-primary" onclick="poEditCategory(\'\')">+ Add category</button>' +
                    '<button class="btn btn-secondary" onclick="poLoadRankMaster()">Load from departmental rank master</button>' +
                  '</div>'
                : '') +
            poTable(['Category ID', 'Code', 'Category name', 'Department', 'Erstwhile cadre', 'Cadres configured', 'Status', ''], catRows), '') +

        poCard('Step 2b &middot; Cadre configuration',
            '<p class="po-hint">Cadres are not hard-coded. The three district cadres are seeded for convenience and can be renamed, retyped or added.</p>' +
            (editable
                ? '<div class="po-actions" style="margin-bottom:12px;"><button class="btn btn-primary" onclick="poEditCadre(\'\')">+ Add cadre</button></div>'
                : '') +
            poTable(['Cadre ID', 'Cadre name', 'Cadre type', 'Level', 'Total FWS', 'Status', ''], cadreRows), '') +

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

function poLoadRankMaster() {
    const n = poSuggestCategoriesFromRankMaster();
    showToast(n ? n + ' categories loaded from the rank master' : 'No new categories to add', n ? 'success' : 'error');
    renderPOModule();
}

function poEditCadre(id) {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return; }
    const c = id ? poState.cadres.find(x => x.id === id) : null;
    const typeOpts = POEngine.PO_CADRE_TYPES.map(t =>
        '<option value="' + t.id + '"' + (c && c.cadre_type === t.id ? ' selected' : '') + '>' + escapeHtml(t.label) + '</option>').join('');
    const dlg = document.createElement('div');
    dlg.className = 'modal-overlay';
    dlg.style.display = 'flex';
    dlg.innerHTML =
        '<div class="modal" style="max-width:560px;">' +
            '<div class="modal-header"><h3>' + (c ? 'Edit' : 'Add') + ' local cadre</h3>' +
            '<button class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()">&times;</button></div>' +
            '<div class="modal-body"><div class="form-grid">' +
                '<div class="form-group"><label>Cadre ID *</label><input id="poCadId" value="' + escapeHtml(c ? c.id : '') + '"></div>' +
                '<div class="form-group"><label>Cadre name *</label><input id="poCadName" value="' + escapeHtml(c ? c.name : '') + '"></div>' +
                '<div class="form-group"><label>Cadre type *</label><select id="poCadType">' + typeOpts + '</select></div>' +
                '<div class="form-group"><label>Level</label><input id="poCadLevel" value="DISTRICT" readonly></div>' +
            '</div></div>' +
            '<div class="modal-footer"><button class="btn btn-secondary" onclick="this.closest(\'.modal-overlay\').remove()">Cancel</button>' +
            '<button class="btn btn-primary" onclick="poSaveCadreForm()">Save</button></div>' +
        '</div>';
    document.body.appendChild(dlg);
}

function poSaveCadreForm() {
    const g = id => (document.getElementById(id) || {}).value || '';
    if (!poSaveCadre(g('poCadId').trim(), g('poCadName').trim(), g('poCadType'))) return;
    document.querySelector('.modal-overlay').remove();
    showToast('Cadre saved', 'success');
    renderPOModule();
}

function poDeleteCadre(id) {
    if (!confirm('Delete cadre ' + id + '?')) return;
    if (poRemoveCadre(id)) { showToast('Cadre removed', 'success'); renderPOModule(); }
}


// ============================================================================
// STEP 3 - Cadre + working strength definition and validation (para 3 & 4)
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
            return '<tr>' + poTd(name) +
                (editable
                    ? '<td><input type="number" min="0" class="po-strength-input" value="' + cstr + '" onchange="poSetStrengthField(\'' + poQs(cat.id) + '\',\'' + poQs(s.cadre_id) + '\',\'cadre_strength\',this.value)"></td>' +
                      '<td><input type="number" min="0" class="po-strength-input" value="' + fws + '" onchange="poSetStrengthField(\'' + poQs(cat.id) + '\',\'' + poQs(s.cadre_id) + '\',\'fws\',this.value)"></td>'
                    : poTd(String(cstr)) + poTd(String(fws))) +
                poTd(String(fws - 0), 'color:var(--text-muted)') +
            '</tr>';
        });

        return '<div class="po-block">' +
            '<div class="po-block-head"><h4>' + escapeHtml(cat.code ? cat.code + ' - ' + cat.name : cat.name) + '</h4>' +
            '<span class="po-badge po-badge-' + (ok ? 'success' : 'danger') + '">' + (ok ? 'RECONCILED' : 'NOT RECONCILED') + '</span></div>' +
            '<div class="po-table-wrap"><table><thead><tr><th>Local cadre</th><th>Cadre strength</th><th>Final Working Strength (FWS)</th><th>Posts available</th></tr></thead><tbody>' +
            (trs.join('') || '<tr><td colspan="4">No cadre configured for this category.</td></tr>') +
            '</tbody><tfoot><tr><th>Total FWS</th><th colspan="2">' + sumFws + '</th>' +
            '<th>' + (editable
                ? '<input type="number" min="0" class="po-strength-input" style="width:90px" value="' + (approved === undefined ? 0 : approved) +
                  '" onchange="poSetApprovedFromForm(\'' + poQs(cat.id) + '\',this.value)">'
                : (approved === undefined ? '-' : approved)) + '</th></tr></tfoot></table></div>' +
            '<div class="po-hint">Last column of the footer is the <strong>approved working strength for the exercise</strong>. Total FWS must equal it exactly.</div>' +
        '</div>';
    });

    content.innerHTML =
        poCard('Step 3 &middot; Cadre strength, Final Working Strength and reconciliation',
            '<p class="po-hint">FWS is official data. The system never changes it silently and never allocates beyond it.</p>' +
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
    renderPOModule();
}


// ============================================================================
// STEP 4 - DSL (para 5, 6, 7)
// ============================================================================

function poDslEditable() { return poIsAdmin() && poStageIdx(poStage()) <= poStageIdx('DSL_UPLOADED'); }

function renderStepDsl(content) {
    const editable = poDslEditable();
    const ctx = poCtx();
    const report = poState.dslValidation;
    const issues = {};
    if (report) {
        report.errors.concat(report.warnings).forEach(i => {
            if (i.employee_id) {
                issues[i.employee_id] = issues[i.employee_id] || [];
                issues[i.employee_id].push(i.severity + ':' + i.code);
            }
        });
    }

    const rows = poState.dsl.map(r => {
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
                ? '<button class="action-btn btn-primary" onclick="poEditDslRecord(\'' + poQs(r.employee_id) + '\')">Edit</button> ' +
                  '<button class="action-btn btn-secondary" onclick="poOpenClaimPanel(\'' + poQs(r.employee_id) + '\')">Claims</button> ' +
                  '<button class="action-btn btn-danger" onclick="poDeleteDslRecord(\'' + poQs(r.employee_id) + '\')">Del</button>'
                : '<span style="color:var(--text-subtle)">locked</span>') + '</td>' +
        '</tr>';
    });

    content.innerHTML =
        poCard('Step 4 &middot; Draft Seniority List',
            '<p class="po-hint">The DSL is the single source of personnel data. Seniority numbers are official: they are copied exactly as supplied and ' +
            'are never generated from row order. Employees on deputation, leave, probation, training, suspension or absence remain in the DSL.</p>' +
            (editable
                ? '<div class="po-actions" style="margin-bottom:12px;">' +
                    '<button class="btn btn-primary" onclick="poEditDslRecord(\'\')">+ Add record</button>' +
                    '<button class="btn btn-secondary" onclick="poDownloadDslTemplate()">Download CSV template</button>' +
                    '<button class="btn btn-secondary" onclick="document.getElementById(\'poDslFile\').click()">Upload CSV / Excel</button>' +
                    '<input type="file" id="poDslFile" accept=".csv,.xlsx,.xls" style="display:none" onchange="poImportDslFile(this)">' +
                    '<button class="btn btn-secondary" onclick="poExportDslCsv()">Export DSL</button>' +
                    '<button class="btn btn-primary" onclick="poValidateDslNow()">Run DSL validation</button>' +
                  '</div>'
                : '<div class="po-note po-note-info">The DSL is frozen at this stage.</div>') +
            poStats([
                { value: poState.dsl.length, label: 'DSL records' },
                { value: (report ? report.errors.length : '-'), label: 'Errors' },
                { value: (report ? report.warnings.length : '-'), label: 'Warnings' },
                { value: poState.dsl.filter(r => r.service_status === 'DEPUTATION').length, label: 'On deputation' },
                { value: poVersionLabel('dsl'), label: 'DSL version' }
            ]) +
            poTable(['Seniority No', 'Employee Name', 'Category', 'Gender', 'CFMS ID', 'Mobile', 'Date of Birth',
                     'Date of Joining in Category', 'Social Category', 'SC/ST Group', 'Erstwhile Cadre',
                     'Present Local Cadre', 'Present Working Place', 'Status', 'Preferential', 'Validation', ''], rows), '') +

        poCard('DSL validation (para 7)', report ? poValidationPanel('DSL', report) :
            '<div class="empty-state">Validation has not been run yet.</div>', '') +

        renderObjectionPanel();
}

/**
 * PART 4 - the DSL objection subsystem. The order allows a period for objections
 * after publication of the DSL, and the FSL follows on a later calculated date.
 * Both are derived from the actual publication timestamp; nothing is hard-coded.
 * The FAL cannot be finalized until every objection is disposed and the window
 * has been closed.
 */
function renderObjectionPanel() {
    const tl = poTimeline();
    const rows = (poState.objections || []).map(o => '<tr>' +
        poTd(o.objection_id, 'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px') +
        poTd((o.submitted_at || '').slice(0, 16).replace('T', ' ')) +
        poTd(o.employee_name || o.employee_id) +
        poTd(o.objection_type) + poTd(o.objection_text) + poTd(o.supporting_documents) +
        '<td><span class="po-badge po-badge-' + poObjectionTone(o.status) + '">' + escapeHtml(o.status) + '</span></td>' +
        poTd(o.disposed_at ? String(o.disposed_at).slice(0, 16).replace('T', ' ') : '-') +
        poTd(o.disposal_reason) + poTd(o.disposed_by) + poTd(o.revised_value) +
        '<td>' + (poIsAdmin() && ['PENDING', 'UNDER_REVIEW'].indexOf(o.status) !== -1
            ? '<button class="action-btn btn-primary" onclick="poDisposeObjectionFlow(\'' + poQs(o.objection_id) + '\')">Dispose</button>'
            : '') + '</td></tr>');

    const dslRecs = (poState.dsl || []).filter(r => !poState.objections.some(o => o.employee_id === r.employee_id));
    const raise = '<div class="po-raise"><div class="po-raise-row">' +
        '<select id="poObjEmp">' + dslRecs.map(r => '<option value="' + escapeHtml(r.employee_id) + '">' +
            escapeHtml(r.name) + ' (' + escapeHtml(r.seniority_no === null ? 'no seniority' : r.seniority_no) + ')</option>').join('') + '</select>' +
        '<select id="poObjType">' + PO_OBJECTION_TYPES.map(t => '<option value="' + t + '">' + escapeHtml(t) + '</option>').join('') + '</select>' +
        '<input id="poObjText" placeholder="Objection" style="flex:2 1 240px">' +
        '<input id="poObjDocs" placeholder="Supporting document ref" style="flex:1 1 160px">' +
        '<button class="btn btn-primary" onclick="poRaiseObjectionFlow()">Record objection</button>' +
        '</div></div>';

    return poCard('DSL objection process',
        '<div class="po-window">' +
            '<div><span class="po-window-l">DSL publication date</span><span class="po-window-v">' + poDash(tl.dsl_published_at ? String(tl.dsl_published_at).slice(0, 10) : '-') + '</span></div>' +
            '<div><span class="po-window-l">Objection closing date</span><span class="po-window-v">' + poDash(tl.objection_closing_date) + '</span></div>' +
            '<div><span class="po-window-l">Objection window</span><span class="po-window-v">' + (poObjectionWindowOpen() ? 'OPEN' : (tl.objection_closed_at ? 'CLOSED' : 'NOT OPEN')) + '</span></div>' +
            '<div><span class="po-window-l">Objections</span><span class="po-window-v">' + tl.objections_pending + ' pending / ' + tl.objections_disposed + ' disposed</span></div>' +
            '<div><span class="po-window-l">FSL eligibility date</span><span class="po-window-v">' + poDash(tl.fsl_eligibility_date) + '</span></div>' +
        '</div>' +
        '<div class="po-note po-note-info"><span class="po-tag po-tag-go">GO REQUIREMENT</span> Objections may be recorded for ' +
            PO_OBJECTION_DAYS + ' days following publication of the DSL. The FSL is published on the ' + PO_FSL_ELIGIBILITY_DAYS +
            'th day from publication of the DSL. Both dates are calculated from the actual publication timestamp.</div>' +
        (poIsAdmin() && poObjectionWindowOpen()
            ? raise
            : '<div class="po-note po-note-warn">The objection window is not open. Objections may only be recorded during the period following publication of the DSL.</div>') +
        poTable(['Objection ID', 'Submitted', 'Employee', 'Type', 'Objection', 'Supporting documents',
                 'Status', 'Disposed at', 'Disposal reason', 'Disposed by', 'Revised value', ''], rows) +
        (poIsAdmin() && poObjectionWindowOpen() && !poPendingObjections().length
            ? '<div class="po-actions"><button class="btn btn-primary" onclick="poCloseObjectionWindowFlow()">Close objection window</button></div>'
            : '') +
        (poPendingObjections().length
            ? '<div class="po-note po-note-danger">The FAL cannot be finalized: ' + poPendingObjections().length +
              ' objection(s) must be disposed and the window closed first.</div>'
            : (tl.objections_disposed_at
                ? '<div class="po-note po-note-info">Objection process complete at ' + escapeHtml(tl.objections_disposed_at) + '.</div>'
                : '')), '');
}

function poObjectionTone(v) {
    if (v === 'ACCEPTED' || v === 'PARTIALLY_ACCEPTED' || v === 'DISPOSED') return 'success';
    if (v === 'REJECTED') return 'danger';
    if (v === 'UNDER_REVIEW') return 'info';
    return 'warn';
}

function poRaiseObjectionFlow() {
    const g = id => (document.getElementById(id) || {}).value || '';
    const r = poRaiseObjection(g('poObjEmp'), g('poObjType'), g('poObjText'), g('poObjDocs'));
    if (!r.ok) { showToast((r.errors || [])[0] || 'Objection not recorded', 'error'); return; }
    showToast('Objection ' + r.objection.objection_id + ' recorded', 'success');
    renderPOModule();
}

function poDisposeObjectionFlow(objectionId) {
    const status = prompt('Disposition (ACCEPTED / PARTIALLY_ACCEPTED / REJECTED / DISPOSED):', 'ACCEPTED');
    if (!status) return;
    const reason = prompt('Disposal reason (mandatory, recorded in the audit trail):', '');
    if (reason === null) return;
    const revised = prompt('Revised value if the objection requires a DSL correction (optional):', '') || '';
    if (!poDisposeObjection(objectionId, status.trim().toUpperCase(), reason, revised)) return;
    showToast('Objection disposed', 'success');
    renderPOModule();
}

function poCloseObjectionWindowFlow() {
    const reason = prompt('Reason for closing the objection window (recorded in the audit trail):', '');
    if (reason === null) return;
    if (poCloseObjectionWindow(reason)) { showToast('Objection window closed', 'success'); renderPOModule(); }
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

function poValidateDslNow() {
    const r = poRunDslValidation();
    showToast(r.valid ? 'DSL validation passed with ' + r.warnings.length + ' warning(s)' : 'DSL validation failed: ' + r.errors.length + ' error(s)',
        r.valid ? 'success' : 'error');
    renderPOModule();
}

function poDownloadDslTemplate() {
    downloadFile(poDslTemplateCsv(), 'PO_DSL_Template.csv', 'text/csv');
    showToast('DSL template downloaded', 'success');
}

function poExportDslCsv() {
    if (!poState.dsl.length) { showToast('DSL is empty', 'error'); return; }
    downloadFile(poDslExportCsv(), 'PO_DSL_' + poState.exercise.exercise_id + '.csv', 'text/csv');
}

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

/** Header-driven CSV reader. Header matching is case- and punctuation-insensitive. */
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
        const ch = line[i], nx = line[i + 1];
        if (ch === '"') {
            if (q && nx === '"') { cur += '"'; i++; } else { q = !q; }
        } else if (ch === ',') {
            if (q) { cur += ','; } else { out.push(cur.trim()); cur = ''; }
        } else { cur += ch; }
    }
    out.push(cur.trim());
    return out;
}

function poImportDslFile(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    if (!confirm('Import this file into the DSL? Existing DSL records will be replaced.')) { input.value = ''; return; }
    poReadSpreadsheet(file, rows => {
        if (!rows.length) { showToast('No usable rows found in the file', 'error'); input.value = ''; return; }
        const n = poImportDslRows(rows, true);
        poAudit('DSL_UPLOADED', { prev: '', next: file.name + ' -> ' + n + ' records', reason: 'DSL upload' });
        poSave();
        showToast(n + ' DSL records imported. Run DSL validation to see blocking errors.', 'success');
        input.value = '';
        renderPOModule();
    });
    input.value = '';
}

function poEditDslRecord(employeeId) {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return; }
    if (!poDslEditable()) { showToast('The DSL is frozen at this stage', 'error'); return; }
    const rec = employeeId
        ? poState.dsl.find(r => r.employee_id === employeeId)
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
        '<div class="modal-header"><h3>' + (employeeId ? 'Edit' : 'Add') + ' DSL record</h3>' +
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
        '<button class="btn btn-primary" onclick="poSaveDslForm(' + (employeeId ? '\'' + poQs(employeeId) + '\'' : 'null') + ')">Save</button></div>' +
        '</div>';
    document.body.appendChild(dlg);
}

function poSaveDslForm(employeeId) {
    const g = id => (document.getElementById(id) || {}).value;
    const catId = g('poR_cat') || '';
    const cat = poState.categories.find(c => c.id === catId);
    const senRaw = (g('poR_sen') || '').trim();
    const sen = /^\d+$/.test(senRaw) ? parseInt(senRaw, 10) : null;

    const rec = employeeId
        ? poState.dsl.find(r => r.employee_id === employeeId)
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
    if (!poSaveDslRecord(rec, isNew)) return;
    document.querySelector('.modal-overlay').remove();
    showToast(isNew ? 'DSL record added' : 'DSL record saved', 'success');
    renderPOModule();
}

function poDeleteDslRecord(employeeId) {
    const rec = poState.dsl.find(r => r.employee_id === employeeId);
    if (!confirm('Delete DSL record for ' + (rec ? rec.name : employeeId) + '?')) return;
    if (poDeleteDslRecord(employeeId)) { showToast('DSL record deleted', 'success'); renderPOModule(); }
}

/** Convenience: raise an objection for one employee from the DSL table. */
function poRecordDslObjection(employeeId) {
    const type = prompt('Objection type (' + PO_OBJECTION_TYPES.join(' / ') + '):', 'SENIORITY_NUMBER');
    if (!type) return;
    const text = prompt('Objection:');
    if (!text) return;
    const docs = prompt('Supporting document reference (optional):', '') || '';
    const r = poRaiseObjection(employeeId, type.trim().toUpperCase(), text, docs);
    if (!r.ok) { showToast((r.errors || [])[0] || 'Objection not recorded', 'error'); return; }
    showToast('Objection ' + r.objection.objection_id + ' recorded', 'success');
    renderPOModule();
}


// --- preferential claim certification & verification (para 10) --------------

function poOpenClaimPanel(employeeId) {
    if (!poIsAdmin()) { showToast('Admin only', 'error'); return; }
    const rec = poState.dsl.find(r => r.employee_id === employeeId) || poState.fsl.find(r => r.employee_id === employeeId);
    if (!rec) { showToast('Record not found', 'error'); return; }
    poEnsureClaims(rec);
    const readOnly = !poDslEditable() && poStageIdx(poStage()) < poStageIdx('DSL_UPLOADED');

    const rowsHtml = POEngine.PO_PREF_CLAIMS.map(def => {
        const c = rec.claims[def.id];
        const canEdit = !readOnly;
        return '<tr>' +
            '<td>' + def.priority + '</td>' +
            '<td><strong>' + escapeHtml(def.label) + '</strong><br><span class="po-hint">' +
                (def.minPercent ? 'Certified disability must be ' + def.minPercent + '% or above' : 'Supporting document required') + '</span></td>' +
            '<td>' + (canEdit
                ? '<input type="checkbox" id="cl_' + def.id + '"' + (c.claimed ? ' checked' : '') + '>'
                : (c.claimed ? 'CLAIMED' : '-')) + '</td>' +
            '<td>' + (canEdit
                ? '<input type="number" min="0" max="100" style="width:70px" id="pct_' + def.id + '" value="' + escapeHtml(c.disability_percent) + '"' + (def.minPercent ? '' : 'disabled') + '>'
                : poDash(c.disability_percent)) + '</td>' +
            '<td>' + (canEdit
                ? '<input id="cert_' + def.id + '" style="width:130px" value="' + escapeHtml(c.cert_no) + '">'
                : poDash(c.cert_no)) + '</td>' +
            '<td>' + (canEdit
                ? '<select id="doc_' + def.id + '">' + ['', 'Yes', 'No'].map(v =>
                    '<option value="' + v + '"' + (c.doc_present === v ? ' selected' : '') + '>' + (v || 'select') + '</option>').join('') + '</select>'
                : poDash(c.doc_present)) + '</td>' +
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
        '<div class="po-note po-note-info">A claim is <strong>not</strong> preferential merely because a flag was ticked. ' +
        'Claim &rarr; supporting document &rarr; verification &rarr; eligible / not eligible. Only VERIFIED claims are processed in the preferential phase.</div>' +
        '<div class="po-table-wrap"><table><thead><tr><th>Priority</th><th>Category</th><th>Claimed</th><th>Disability %</th>' +
        '<th>Certification no.</th><th>Document</th><th>Verification</th><th>Action</th></tr></thead><tbody>' + rowsHtml + '</tbody></table></div>' +
        '</div>' +
        '<div class="modal-footer">' +
            (readOnly ? '' : '<button class="btn btn-primary" onclick="poSaveClaims(\'' + poQs(employeeId) + '\')">Save claims</button>') +
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
    const rec = poState.dsl.find(r => r.employee_id === employeeId) || poState.fsl.find(r => r.employee_id === employeeId);
    if (!rec) return;
    poEnsureClaims(rec);
    POEngine.PO_PREF_CLAIMS.forEach(def => {
        const c = rec.claims[def.id];
        const box = document.getElementById('cl_' + def.id);
        if (!box) return;
        const wasClaimed = c.claimed;
        c.claimed = box.checked;
        if (!c.claimed) { c.verification = 'NOT_CLAIMED'; c.verified_by = ''; c.verified_at = ''; }
        else if (c.verification === 'NOT_CLAIMED') c.verification = 'PENDING';
        c.disability_percent = (document.getElementById('pct_' + def.id) || {}).value || '';
        c.cert_no = ((document.getElementById('cert_' + def.id) || {}).value || '').trim();
        c.doc_present = (document.getElementById('doc_' + def.id) || {}).value || '';
        if (wasClaimed !== c.claimed && c.claimed) {
            c.verification = 'PENDING';
            c.verified_by = ''; c.verified_at = '';
        }
    });
    if (!poDslEditable()) { showToast('DSL is frozen; claim edits are not permitted at this stage', 'error'); return; }
    poSaveDslRecord(rec, false);
    document.querySelector('.modal-overlay').remove();
    showToast('Claims saved. Verification is still required before the claim is preferential.', 'success');
    renderPOModule();
}

function poVerifyClaim(employeeId, claimId, status) {
    const rec = poState.dsl.find(r => r.employee_id === employeeId) || poState.fsl.find(r => r.employee_id === employeeId);
    if (!rec) return;
    poEnsureClaims(rec);
    const c = rec.claims[claimId];
    if (!c) return;
    const remark = prompt('Verification remark (recorded in the audit trail):', '') ;
    if (remark === null) return;
    const prev = c.verification;
    c.verification = status;
    c.verified_by = poUser();
    c.verified_at = poNow();
    c.remark = remark;
    if (!poDslEditable()) { showToast('DSL is frozen; verification is not permitted at this stage', 'error'); return; }
    poSaveDslRecord(rec, false);
    poAudit(status === 'VERIFIED' ? 'CLAIM_VERIFIED' : 'CLAIM_REJECTED', {
        prev: prev, next: status + ' (' + claimId + ')', reason: remark, employee_id: employeeId
    });
    poSave();
    document.querySelector('.modal-overlay').remove();
    showToast('Claim ' + status.toLowerCase(), 'success');
    renderPOModule();
}


// ============================================================================
// STEP 5 - FSL + analysis (para 8 & 9)
// ============================================================================

function renderStepFsl(content) {
    const editableDsl = poDslEditable();
    const ctx = poCtx();
    const fsl = poState.fsl;
    const a = poFsAnalysis();
    const tl = poTimeline();
    const canFinalize = poIsAdmin() && poStageIdx(poStage()) <= poStageIdx('FSL_FINALIZED') && !poState.optionsLocked;
    const published = !!poState.fslPublishedAt;

    const rows = fsl.map(r => '<tr>' +
        poTd(r.seniority_no) + poTd(r.name) +
        poTd((ctx.categoryById[r.category_id] || {}).name || r.rank_code) +
        poTd(r.cfms_id) + poTd(r.mobile) + poTd(r.date_of_joining_category) +
        poTd(r.social_category) + poTd(r.sc_group) +
        poTd((ctx.cadreById[r.erstwhile_cadre_id] || {}).name) +
        poTd((ctx.cadreById[r.present_local_cadre_id] || {}).name) +
        poTd(r.service_status) +
        poTd(POEngine.poPreferredClaim(r) ? POEngine.poPreferredClaim(r).label : '-') +
        poTd(r.fsl_version, 'font-size:11px') +
        poTd((poState.objections[r.employee_id] || {}).reason || '-') +
        '</tr>');

    const segRows = a.N_strength.map(n => '<tr>' +
        poTd(n.category) +
        poTd(String(n.approved_working_strength === null ? '-' : n.approved_working_strength)) +
        poTd(String(n.fws_total)) +
        poTd(String(n.current_working_strength)) +
        poTd(String(n.fsl_employee_count)) +
        poTd(String(n.allocable_strength)) +
        '</tr>');

    content.innerHTML =
        poCard('Step 5 &middot; FSL timeline',
            '<div class="po-note po-note-info"><span class="po-tag po-tag-go">GO REQUIREMENT</span> The FSL is published on the ' +
                PO_FSL_ELIGIBILITY_DAYS + 'th day from publication of the DSL. Every date below is calculated from the actual ' +
                'DSL publication timestamp &mdash; no date is hard-coded and publication cannot precede eligibility.</div>' +
            '<div class="po-window">' +
                '<div><span class="po-window-l">DSL publication date</span><span class="po-window-v">' + poDash(tl.dsl_published_at ? String(tl.dsl_published_at).slice(0, 10) : '-') + '</span></div>' +
                '<div><span class="po-window-l">Objection closing date</span><span class="po-window-v">' + poDash(tl.objection_closing_date) + '</span></div>' +
                '<div><span class="po-window-l">Objections disposed</span><span class="po-window-v">' + (tl.objections_disposed_at ? escapeHtml(tl.objections_disposed_at) : tl.objections_pending + ' pending') + '</span></div>' +
                '<div><span class="po-window-l">FSL eligibility date</span><span class="po-window-v">' + poDash(tl.fsl_eligibility_date) +
                    (tl.fsl_eligible_reached ? ' <span class="po-badge po-badge-success">REACHED</span>' : ' <span class="po-badge po-badge-warn">NOT YET</span>') + '</span></div>' +
                '<div><span class="po-window-l">FSL created</span><span class="po-window-v">' + poDash(tl.fsl_created_at || '-') + '</span></div>' +
                '<div><span class="po-window-l">FSL finalized</span><span class="po-window-v">' + poDash(tl.fsl_finalized_at || '-') + '</span></div>' +
                '<div><span class="po-window-l">FSL publication date</span><span class="po-window-v">' + poDash(tl.fsl_published_at || '-') + '</span></div>' +
            '</div>' +
            (poPendingObjections().length
                ? '<div class="po-note po-note-danger">' + poPendingObjections().length + ' objection(s) not disposed. The FSL cannot be finalized.</div>'
                : ''), '') +

        poCard('Step 5 &middot; Final Seniority List',
            '<p class="po-hint">The FSL is the authoritative personnel dataset for the allocation engine. Once finalized it is locked; ' +
            'any later change requires an authorized revision with a reason and creates a new version. Superseded versions are retained, never destroyed.</p>' +
            '<div class="po-actions" style="margin-bottom:12px;">' +
                (canFinalize ? '<button class="btn btn-primary" onclick="poFinalizeFsl()">Build &amp; finalize FSL from DSL</button>' : '') +
                (poIsAdmin() && poState.fsl.length && !published ? '<button class="btn btn-primary" onclick="poPublishFslFlow()">Publish FSL</button>' : '') +
                '<button class="btn btn-secondary" onclick="poExportFslCsv()">Export FSL</button>' +
                (poIsAdmin() && poState.fslLocked ? '<button class="btn btn-secondary" onclick="poReviseFslFlow()">Start FSL revision</button>' : '') +
            '</div>' +
            poStats([
                { value: fsl.length, label: 'FSL records' },
                { value: poVersionLabel('fsl'), label: 'FSL version' },
                { value: poState.fslLocked ? 'LOCKED' : 'OPEN', label: 'FSL state' },
                { value: poState.fslPublishedAt ? (poState.fslPublishedAt.slice(0, 10)) : '-', label: 'Published' },
                { value: Object.keys(poState.objections || {}).length, label: 'DSL objections' }
            ]) +
            (poState.fslLocked ? '' : '<div class="po-note po-note-warn">FSL is not locked yet. Allocation is blocked until it is.</div>') +
            poTable(['Seniority No', 'Employee Name', 'Category', 'CFMS ID', 'Mobile', 'DOJ in Category',
                     'Social Category', 'SC/ST Group', 'Erstwhile Cadre', 'Present Cadre', 'Status',
                     'Verified Preferential Claim', 'FSL Ver', 'DSL Objection'], rows), '') +

        poCard('FSL analysis (para 9) - the four strengths are NOT interchangeable',
            '<div class="po-hint">FWS = sanctioned posts. Current Working Strength = employees presently borne on the category. ' +
            'FSL Employee Count = rows in the FSL. Available / Allocable Strength = FWS less those already borne.</div>' +
            poTable(['Category', 'Approved WS', 'FWS', 'Current Working Strength', 'FSL Employee Count', 'Available / Allocable'], segRows) +
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

function poFinalizeFsl() {
    if (!confirm('Finalize the FSL from the DSL? The FSL will be locked and becomes the authoritative dataset for allocation.')) return;
    const n = poBuildFslFromDsl();
    if (n) { showToast('FSL finalized and locked with ' + n + ' records', 'success'); renderPOModule(); }
}

function poPublishFslFlow() {
    if (!confirm('Publish the FSL?\n\nPublication is permitted only after the objection period is complete, every objection is disposed, and the eligibility date has been reached.')) return;
    if (poPublishFsl()) { showToast('FSL published', 'success'); renderPOModule(); }
}

function poExportFslCsv() {
    const fsl = poState.fsl;
    if (!fsl.length) { showToast('FSL is empty', 'error'); return; }
    const headers = ['FSL Version', 'Seniority No', 'Employee Name', 'Parentage', 'Gender', 'CFMS ID', 'Mobile',
        'Date of Birth', 'Date of Joining in Category', 'Category', 'Office', 'Designation', 'Social Category',
        'SC/ST Group', 'Erstwhile Cadre', 'Present Local Cadre', 'Present Working Place', 'Status',
        'Deputation Unit', 'Verified Preferential Claim', 'DSL Objection', 'Objection Resolution'];
    const ctx = poCtx();
    const rows = fsl.map(r => [
        r.fsl_version, r.seniority_no, r.name, r.parentage, r.gender, r.cfms_id, r.mobile,
        r.date_of_birth, r.date_of_joining_category, (ctx.categoryById[r.category_id] || {}).name || r.rank_code,
        r.office, r.designation, r.social_category, r.sc_group,
        (ctx.cadreById[r.erstwhile_cadre_id] || {}).name, (ctx.cadreById[r.present_local_cadre_id] || {}).name,
        r.present_working_place, r.service_status, r.deputation_unit,
        POEngine.poPreferredClaim(r) ? POEngine.poPreferredClaim(r).label : '',
        (poState.objections[r.employee_id] || {}).reason || '',
        (poState.objections[r.employee_id] || {}).resolution || ''
    ]);
    downloadFile(poToCsv(headers, rows), 'PO_FSL_' + poState.exercise.exercise_id + '_' + poVersionLabel('fsl') + '.csv', 'text/csv');
}

function poReviseFslFlow() {
    const reason = prompt('FSL revision reason (mandatory - recorded in the audit trail and a new FSL version is created):', '');
    if (reason === null) return;
    if (!confirm('This unlocks the FSL, clears the FSL records, voids all submitted options and requires a fresh FSL build. Continue?')) return;
    if (poReviseFsl(reason)) { showToast('FSL revision started at ' + poVersionLabel('fsl'), 'success'); renderPOModule(); }
}


// ============================================================================
// STEP 6 - Option filling (para 12 & 13)
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
        poCard('Step 6 &middot; Option filling', window_, '') +
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
    poAudit('OPTION_LOCKED', { prev: '', next: 'option window set to ' + n + ' days' });
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
// STEP 7 - Allocation (para 14, 15, 16, 17, 29)
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
        poCard('Step 7 &middot; Allocation engine',
            '<p class="po-hint">The engine is deterministic and repeatable: FWS + FSL + preferential claims + FSL seniority + options + vacancy + SC/ST review. ' +
            'Every allotment carries a reason and can be explained.</p>' +
            '<div class="po-phases">' +
                '<div><b>Phase 1</b> Preferential categories (verified claims, priority order)</div>' +
                '<div><b>Phase 2-4</b> Remaining employees by FSL seniority: preference 1, then 2, then 3</div>' +
                '<div><b>Phase 5</b> Compulsory allotment to an available clear post, only where a shortfall exists</div>' +
                '<div><b>Phase 6</b> Employees with no option - processed at the end, only onto shortfall posts</div>' +
                '<div><b>Phase 7</b> SC/ST proportionate review and documented adjustment</div>' +
                '<div><b>Phase 8</b> Final result; allocation beyond FWS fails the run</div>' +
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
// STEP 8 - FAL (para 18 & 19)
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
            rows.push('<tr class="po-group-row"><th colspan="17">' + escapeHtml(k) + ' (' + grouped[k].length + ')</th></tr>');
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
                    '<td><strong>' + escapeHtml(r.cadre_name) + '</strong></td>' +
                    poTd(r.allocation_reason, 'font-size:10px') +
                    poTd(String(r.allocation_sequence), 'text-align:center') +
                    '<td>' + (isExc ? '<span class="po-badge po-badge-danger">EXCEPTION</span>' : '<span class="po-badge po-badge-success">CLEAR</span>') + '</td>' +
                    '<td><button class="action-btn btn-secondary" onclick="poExplainAllocation(\'' + poQs(r.employee_id) + '\')">Why?</button></td>' +
                '</tr>');
            });
        });
    }

    content.innerHTML =
        poCard('Step 8 &middot; Final Allocation List',
            '<p class="po-hint">The FAL is generated by the allocation engine. It cannot be hand-edited: a change after publication requires the revision workflow with a reason and an audit entry.</p>' +
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
                     'Allocation Reason', 'Alloc Seq', 'Exception Status', ''], rows), '') +

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
    const headers = ['Sl.No', 'Erstwhile Local Cadre', 'Employee Name', 'Department', 'Office', 'Designation', 'Gender',
        'Social Category', 'CFMS ID', 'Mobile', 'Date of Birth', 'Seniority No', 'Preferential Category',
        'Claim Status', 'Final Allotted Local Cadre', 'Allocation Reason', 'Allocation Sequence',
        'Vacancy Before', 'Vacancy After', 'SC/ST Adjustment', 'FAL Version', 'Engine Version'];
    const rows = fal.rows.map((r, i) => {
        const f = fslById[r.employee_id] || {};
        return [i + 1, r.erstwhile_cadre_name, r.name, poState.exercise.department, r.office, r.designation || r.rank_code,
            f.gender, f.social_category, f.cfms_id, f.mobile, f.date_of_birth, r.seniority_no,
            r.preferential_claim_label || '', r.preferential_status, r.cadre_name, r.allocation_reason,
            r.allocation_sequence, r.vacancy_before, r.vacancy_after,
            r.sc_st_adjustment ? (r.sc_st_adjustment.role + ' for ' + r.sc_st_adjustment.group) : '', fal.version, r.engine_version];
    });
    downloadFile(poToCsv(headers, rows), 'PO_FAL_' + poState.exercise.exercise_id + '_' + fal.version + '.csv', 'text/csv');
    showToast('FAL exported', 'success');
}

function poPrintFal() {
    const fal = poState.fal;
    if (!fal) return;
    const byCadre = {};
    fal.rows.forEach(r => { (byCadre[r.cadre_name] = byCadre[r.cadre_name] || []).push(r); });
    let html = '';
    Object.keys(byCadre).sort().forEach(cadre => {
        html += '<h3>Local cadre: ' + escapeHtml(cadre) + ' (' + byCadre[cadre].length + ')</h3><table><thead><tr>' +
            '<th>Sl.No</th><th>Erstwhile Local Cadre</th><th>Employee Name</th><th>Designation</th><th>Gender</th>' +
            '<th>Social Cat.</th><th>CFMS ID</th><th>Seniority No.</th><th>Preferential Category</th><th>Reason</th></tr></thead><tbody>' +
            byCadre[cadre].map((r, i) => '<tr><td>' + (i + 1) + '</td><td>' + escapeHtml(r.erstwhile_cadre_name) + '</td><td>' + escapeHtml(r.name) +
                '</td><td>' + escapeHtml(r.designation || r.rank_code) + '</td><td>' + poDash((poState.fsl.find(f => f.employee_id === r.employee_id) || {}).gender) +
                '</td><td>' + poDash((poState.fsl.find(f => f.employee_id === r.employee_id) || {}).social_category) +
                '</td><td>' + poDash((poState.fsl.find(f => f.employee_id === r.employee_id) || {}).cfms_id) +
                '</td><td>' + poDash(r.seniority_no) + '</td><td>' + poDash(r.preferential_claim_label) +
                '</td><td>' + escapeHtml(r.allocation_reason) + '</td></tr>').join('') +
            '</tbody></table><br>';
    });
    poPrintDocument('Final Allocation List (FAL)', html);
}


// ============================================================================
// STEP 9 - OOA / OOT / joining (para 20 & 21)
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
        poCard('Step 9a &middot; Order of Allotment (OOA)',
            '<p class="po-hint">Status DRAFT &rarr; APPROVED &rarr; ISSUED. An issued OOA is never deleted; it is superseded by a recorded revision.</p>' +
            '<div class="po-actions" style="margin-bottom:12px;">' +
                (admin ? '<button class="btn btn-primary" onclick="poGenerateOoaFlow()">Generate OOA</button>' +
                         '<button class="btn btn-secondary" onclick="poApproveOoaFlow()">Approve drafts</button>' +
                         '<button class="btn btn-secondary" onclick="poIssueOoaFlow()">Issue approved OOA</button>' : '') +
                (poState.ooa.length ? '<button class="btn btn-secondary" onclick="poPrintAllOoa()">Print all</button>' : '') +
            '</div>' +
            poTable(['OOA ID', 'Employee', 'Parentage', 'CFMS ID', 'Mobile', 'Designation',
                     'Erstwhile Local Cadre', 'New Allotted Local Cadre', 'Order No', 'Order Date', 'Status', ''], ooaRows), '') +

        poCard('Step 9b &middot; Order of Transfer (OOT) and joining',
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
    poPrintDocument('Order of Allotment - ' + (o.order_no || o.ooa_id),
        '<table class="po-order"><tbody>' +
        [['Order No', o.order_no || '(draft)'], ['Date', o.order_date || '(draft)'], ['Department', o.department],
         ['Designation', o.designation], ['Name', o.name + ' ' + (o.parentage ? '(' + o.parentage + ')' : '')],
         ['CFMS ID', o.cfms_id], ['Mobile', o.mobile],
         ['Erstwhile Local Cadre', o.erstwhile_cadre], ['New Allotted Local Cadre', o.new_cadre],
         ['Competent Authority', o.competent_authority],
         ['Reference', o.po_reference], ['Reference', o.go_reference], ['Status', o.status], ['Version', o.version]]
        .map(r => '<tr><th>' + escapeHtml(r[0]) + '</th><td>' + poDash(r[1]) + '</td></tr>').join('') +
        '</tbody></table>' +
        '<div class="po-sign">Signature of the Competent Authority</div>');
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

function poPrintDocument(title, bodyHtml) {
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
        '@media print{.no-print{display:none}}</style></head><body>' +
        '<h1>' + escapeHtml(title) + '</h1>' +
        '<h3>' + escapeHtml(POEngine.PO_GO_REFERENCE.order) + ', ' + escapeHtml(POEngine.PO_GO_REFERENCE.department) + ', dated ' + escapeHtml(POEngine.PO_GO_REFERENCE.date) + '</h3>' +
        '<div class="ref">Presidential Order-2025 &middot; ' + escapeHtml(poState.exercise.exercise_id || 'Exercise ID not set') + ' &middot; ' + escapeHtml(POEngine.PO_GO_REFERENCE.scope) + '</div>' +
        bodyHtml +
        '<br><button class="no-print" onclick="window.print()">Print</button></body></html>');
    w.document.close();
}


// ============================================================================
// DLC dashboard + audit trail (para 23 & 25)
// ============================================================================

function poShowDashboard() {
    const d = poDashboard();
    const dlg = document.createElement('div');
    dlg.className = 'modal-overlay';
    dlg.style.display = 'flex';
    const block = (title, rows) => '<div class="po-block"><h4>' + title + '</h4>' +
        rows.map(r => '<div class="po-dash-row"><span>' + escapeHtml(r[0]) + '</span><strong>' + escapeHtml(r[1]) + '</strong></div>').join('') + '</div>';

    dlg.innerHTML = '<div class="modal" style="max-width:900px;">' +
        '<div class="modal-header"><h3>DLC dashboard</h3>' +
        '<button class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()">&times;</button></div>' +
        '<div class="modal-body">' +
        block('Exercise status', [['Status', d.exercise_status], ['Stage', d.stage],
            ['Exercise ID', poState.exercise.exercise_id || '-'], ['Department', poState.exercise.department || '-']]) +
        block('Cadres', [['Total', d.cadres.total], ['Active', d.cadres.active], ['Total FWS', d.cadres.fws]]) +
        block('Personnel', [['FSL total', d.personnel.fsl_total], ['Preferential cases', d.personnel.preferential_cases],
            ['SC', d.personnel.sc], ['ST', d.personnel.st], ['Deputation', d.personnel.deputation], ['No option', d.personnel.no_option]]) +
        block('Options', [['Submitted', d.options.submitted], ['Pending', d.options.pending], ['Locked', d.options.locked ? 'YES' : 'NO']]) +
        block('Allocation', [['Allocated', d.allocation.allocated], ['Pending', d.allocation.pending],
            ['Exceptions', d.allocation.exceptions], ['FWS exhausted', d.allocation.fws_exhausted],
            ['Last run', d.allocation.last_run ? d.allocation.last_run.run_id + ' (' + d.allocation.last_run.status + ')' : '-']]) +
        block('FAL', [['Generated', d.fal.generated ? 'YES' : 'NO'], ['Status', d.fal.status],
            ['Validated', d.fal.validated ? 'YES' : 'NO'], ['Published', d.fal.published ? 'YES' : 'NO'], ['Version', d.fal.version]]) +
        block('Orders', [['OOA generated', d.orders.ooa_generated], ['OOA issued', d.orders.ooa_issued],
            ['OOT generated', d.orders.oot_generated], ['OOT issued', d.orders.oot_issued],
            ['Joining completed', d.orders.joining_completed], ['No transfer required', d.orders.no_transfer_required]]) +
        block('Versions', Object.keys(d.versions).map(k => [k, d.versions[k]])) +
        '</div><div class="modal-footer"><button class="btn btn-secondary" onclick="this.closest(\'.modal-overlay\').remove()">Close</button></div></div>';
    document.body.appendChild(dlg);
}

function poShowAudit() {
    const list = poState.audit.slice().reverse();
    const dlg = document.createElement('div');
    dlg.className = 'modal-overlay';
    dlg.style.display = 'flex';
    dlg.innerHTML = '<div class="modal" style="max-width:1180px;">' +
        '<div class="modal-header"><h3>Audit trail (' + list.length + ' events)</h3>' +
        '<button class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()">&times;</button></div>' +
        '<div class="modal-body">' +
        (list.length
            ? '<div class="po-table-wrap" style="max-height:62vh;overflow:auto"><table><thead><tr>' +
              '<th>#</th><th>When</th><th>User</th><th>Action</th><th>Previous</th><th>New</th><th>Reason</th>' +
              '<th>Exercise</th><th>Employee</th><th>Stage</th><th>Version</th></tr></thead><tbody>' +
              list.map(e => '<tr><td>' + escapeHtml(e.id) + '</td><td style="font-size:10px">' + escapeHtml((e.ts || '').slice(0, 19).replace('T', ' ')) + '</td>' +
                  '<td>' + poDash(e.user) + '</td><td>' + escapeHtml(e.label) + '</td>' + poTd(e.prev_value) + poTd(e.new_value) +
                  poTd(e.reason) + poTd(e.exercise_id) + poTd(e.employee_id) + poTd(e.stage) + poTd(e.version) + '</tr>').join('') +
              '</tbody></table></div>'
            : '<div class="empty-state">No audit events yet.</div>') +
        '<div class="po-actions" style="margin-top:12px;"><button class="btn btn-secondary" onclick="poExportAudit()">Export audit CSV</button></div>' +
        '</div><div class="modal-footer"><button class="btn btn-secondary" onclick="this.closest(\'.modal-overlay\').remove()">Close</button></div></div>';
    document.body.appendChild(dlg);
}

function poExportAudit() {
    const headers = ['Event ID', 'Timestamp', 'User', 'Action', 'Label', 'Previous Value', 'New Value', 'Reason', 'Exercise ID', 'Employee ID', 'Stage', 'Version'];
    const rows = poState.audit.map(e => [e.id, e.ts, e.user, e.action, e.label, e.prev_value, e.new_value, e.reason, e.exercise_id, e.employee_id, e.stage, e.version]);
    downloadFile(poToCsv(headers, rows), 'PO_Audit_' + poState.exercise.exercise_id + '.csv', 'text/csv');
    showToast('Audit trail exported', 'success');
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
    'poEditCategory', 'poSaveCategoryForm', 'poDeleteCategory', 'poLoadRankMaster',
    'poEditCadre', 'poSaveCadreForm', 'poDeleteCadre',
    'poSetStrengthField', 'poSetApprovedFromForm',
    'poValidateDslNow', 'poDownloadDslTemplate', 'poExportDslCsv', 'poImportDslFile',
    'poEditDslRecord', 'poSaveDslForm', 'poDeleteDslRecord', 'poRecordDslObjection',
    'poOpenClaimPanel', 'poSaveClaims', 'poVerifyClaim',
    'poFinalizeFsl', 'poExportFslCsv', 'poReviseFslFlow',
    'poSubmitOption', 'poSaveOptionWindow', 'poCloseOptionsFlow',
    'poRunSimulation', 'poConfirmAllocationFlow', 'poExplainAllocation',
    'poFalViewChanged', 'poFalSearchChanged', 'poGenerateFalFlow', 'poApproveFalFlow',
    'poPublishFalFlow', 'poReviseFalFlow', 'poExportFalCsv', 'poPrintFal',
    'poGenerateOoaFlow', 'poApproveOoaFlow', 'poIssueOoaFlow', 'poReviseOoaFlow', 'poPrintOoa',
    'poGenerateOotFlow', 'poIssueOotFlow', 'poRecordJoiningFlow', 'poPrintAllOoa', 'poPrintAllOot',
    'poSetPolicyFromUi', 'poFreezePolicyFlow', 'poRaiseObjectionFlow', 'poDisposeObjectionFlow',
    'poCloseObjectionWindowFlow', 'poPublishFslFlow', 'poCorrectOptionFlow',
    'poJoiningClosureOverrideFlow', 'poRecordDslObjection',
    'poShowAudit', 'poExportAudit', 'poShowDashboard'
].forEach(name => {
    try { window[name] = window[name] || eval(name); } catch (e) { /* not a function - ignore */ }
});
