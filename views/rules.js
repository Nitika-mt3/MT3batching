/* Rules — list (deep-linked) + full-page guided editor at #/rules/:id and #/rules/new */
(function () {
  const DAYS = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']];
  const CLASSES = ['Bold', 'Classic', 'Essential', 'Luxe', 'Mirror', 'Clear', 'Any'];
  let rulesTab = 'active', fq = '', fTpl = [], fCls = [], fClose = [];   // rules list: tab + search + filters

  PB.view('rules', (v, param) => {
    if (param === 'new') return editor(v, null);
    if (param) { const r = PB.state.rules.find(x => x.id === param); return r ? editor(v, r) : notFound(v); }
    list(v);
  });

  function notFound(v) { v.innerHTML = PB.pageHead({ title: 'Rule not found', back: ['rules'] }) + '<div class="empty">No such rule.</div>'; }

  const scopeText = r => [
    (r.models || []).length && (r.models.length + ' models'),
    (r.casetypes || []).length && (r.casetypes.length + ' casetypes'),
    (r.skuList || []).length && (r.skuList.length + ' SKUs'),
  ].filter(Boolean).join(' · ') || 'all of class';
  // how this rule merges reprints (drives the bucketKey reprint segment) — reprints are never merged with new orders
  const reprintMode = r => r.reprintMergeReprints ? 'Pooled' : 'Isolated';

  /* ---------------- list ---------------- */
  function list(v) {
    const all = PB.state.rules;
    const activeList = all.filter(r => r.active !== false);
    const inactiveList = all.filter(r => r.active === false);
    const tabRules = rulesTab === 'inactive' ? inactiveList : activeList;
    const templates = [...new Set(tabRules.map(r => r.template).filter(Boolean))].sort();
    const classes = [...new Set(tabRules.map(r => r.caseClass).filter(Boolean))].sort();
    const closes = ['Manual', 'Automatic'];
    fTpl = fTpl.filter(x => templates.includes(x));   // drop filter picks no longer present in this tab
    fCls = fCls.filter(x => classes.includes(x));
    // search matches the rule's scope values (models/casetypes/print codes/SKUs) + name/desc/template/etc.
    const hay = r => [r.name, r.desc, r.template, r.caseClass, r.prefix, 'reprints ' + reprintMode(r), ...(r.models || []), ...(r.casetypes || []), ...(r.printcodes || []), ...(r.skuList || []),
      [r.filterModel && 'Model', r.filterCase && 'Casetype', r.filterCode && 'PrintCode', r.filterSku && 'SKU'].filter(Boolean).join(' '),
      r.closeMode === 'auto' ? 'Automatic' : 'Manual'].filter(Boolean).join(' ').toLowerCase();
    const computeRows = () => { const ql = fq.trim().toLowerCase();
      return tabRules.filter(r =>
        (!fTpl.length || fTpl.includes(r.template)) &&
        (!fCls.length || fCls.includes(r.caseClass)) &&
        (!fClose.length || fClose.includes(r.closeMode === 'auto' ? 'Automatic' : 'Manual')) &&
        (!ql || hay(r).includes(ql))); };

    v.innerHTML = PB.pageHead({
      title: 'Batching rules',
      sub: `${activeList.length} active of ${all.length} rules · define how SKUs group. Filters decide split-vs-merge.`,
      actions: `<button class="btn primary" id="addRule">＋ Add batch rule</button>`
    })
      + `<div class="tabs">
          <button class="tab ${rulesTab === 'active' ? 'active' : ''}" data-rt="active">Active <span class="cnt">${activeList.length}</span></button>
          <button class="tab ${rulesTab === 'inactive' ? 'active' : ''}" data-rt="inactive">Inactive <span class="cnt">${inactiveList.length}</span></button>
        </div>
        <div class="grid-toolbar" style="margin-bottom:12px">
          <div class="qf"><span class="qf-ic">⌕</span><input id="ruleSearch" aria-label="Search rules" placeholder="Search name, template, model, casetype, print code…" value="${PB.esc(fq)}"></div>
          <div class="dd-mount" id="dd_rtpl" style="width:175px;flex:none"></div>
          <div class="dd-mount" id="dd_rcls" style="width:160px;flex:none"></div>
          <div class="dd-mount" id="dd_rclose" style="width:150px;flex:none"></div>
          <button class="btn ghost sm" id="rClr">Clear</button>
          <button class="btn ghost sm" id="rCols" title="Show / hide & reorder columns">⚙ Columns</button>
          <span class="page-sub" id="ruleCount" style="margin-left:auto;white-space:nowrap"></span>
        </div>
        <div id="grid"></div>`;
    PB.qsa('[data-rt]', v).forEach(b => b.onclick = () => { rulesTab = b.dataset.rt; list(v); });
    PB.qs('#addRule').onclick = () => PB.go('rules', 'new');

    const cols = [
      { headerName: 'Name', field: 'name', minWidth: 200, cellRenderer: p => `<a href="${PB.link('rules', p.data.id)}" class="cell-link"><b>${PB.esc(p.value)}</b></a>${p.data.type === 'reprint' ? ' <span class="badge info" title="Legacy HP reprint rule — no longer routes; reprints follow their order&#39;s own rule">reprint · legacy</span>' : ''}${p.data.prefix ? ` <span class="badge" title="SKU prefix priority">${PB.esc(p.data.prefix)}</span>` : ''}` },
      { headerName: 'Case-class', field: 'caseClass', maxWidth: 120, cellRenderer: p => `<span class="case-dot" style="background:${PB.classColor(p.value)}"></span> ${p.value}` },
      { headerName: 'Template', field: 'template', minWidth: 150 },
      { headerName: 'Split by', minWidth: 150, valueGetter: p => [p.data.filterModel && 'Model', p.data.filterCase && 'Casetype', p.data.filterCode && 'PrintCode', p.data.filterSku && 'SKU'].filter(Boolean).join(', ') || 'none (→ one batch)' },
      { headerName: 'Scope', minWidth: 130, valueGetter: p => scopeText(p.data) },
      { headerName: 'Reprints', maxWidth: 110, valueGetter: p => reprintMode(p.data) },
      { headerName: 'Close', maxWidth: 110, valueGetter: p => p.data.closeMode === 'auto' ? 'Automatic' : 'Manual' },
      { headerName: 'Active', maxWidth: 90, valueGetter: p => p.data.active ? 'On' : 'Off', cellRenderer: p => `<span style="font-weight:600;color:${p.data.active ? 'var(--success-ink, #047857)' : 'var(--muted)'}">${p.data.active ? 'On' : 'Off'}</span>` },
    ];
    const cardFn = r => `<a class="card pad clickable" href="${PB.link('rules', r.id)}" style="display:block;text-decoration:none;color:inherit">
        <div class="row" style="justify-content:space-between"><b>${PB.esc(r.name)}</b><span class="badge ${r.active ? 'ok' : ''} dot">${r.active ? 'on' : 'off'}</span></div>
        <div class="page-sub"><span class="case-dot" style="background:${PB.classColor(r.caseClass)}"></span> ${r.caseClass} · ${PB.esc(r.template)} · ${PB.esc(scopeText(r))} · ${r.closeMode === 'auto' ? 'auto-close' : 'manual close'}</div></a>`;
    const rows = computeRows();
    const api = PB.grid(PB.qs('#grid'), cols, rows, {
      tall: true, pageSize: 25, search: false, gridKey: 'rules', onRowClicked: e => PB.go('rules', e.data.id), card: cardFn
    });
    const setCount = n => { const e = PB.qs('#ruleCount'); if (e) e.textContent = n === tabRules.length ? `${tabRules.length} rules` : `${n} of ${tabRules.length}`; };
    const applyLive = () => { const r = computeRows(); api.setGridOption('rowData', r);
      const c = PB.qs('#grid .mobile-cards'); if (c) c.innerHTML = r.length ? r.map(cardFn).join('') : '<div class="empty">No rules match.</div>'; setCount(r.length); };
    setCount(rows.length);

    const search = PB.qs('#ruleSearch'); if (search) search.oninput = () => { fq = search.value; applyLive(); };
    PB.dropdown(PB.qs('#dd_rtpl'), { multi: true, options: templates, values: fTpl, placeholder: 'All templates', label: 'template', onChange: x => { fTpl = x; applyLive(); } });
    PB.dropdown(PB.qs('#dd_rcls'), { multi: true, options: classes, values: fCls, placeholder: 'All case-classes', label: 'case-class', onChange: x => { fCls = x; applyLive(); } });
    PB.dropdown(PB.qs('#dd_rclose'), { multi: true, options: closes, values: fClose, placeholder: 'All close modes', label: 'close mode', onChange: x => { fClose = x; applyLive(); } });
    const clr = PB.qs('#rClr'); if (clr) clr.onclick = () => { fq = ''; fTpl = []; fCls = []; fClose = []; list(v); };
    const rcols = PB.qs('#rCols'); if (rcols) rcols.onclick = () => PB.columnConfig(api, 'pb.cols.rules');
  }
  PB._editRule = (id) => PB.go('rules', id);  // back-compat

  /* ---------------- full-page editor ---------------- */
  function editor(v, rule) {
    const SKU = PB.data.sku_db || {};
    const MODELS = SKU.models || [], CASETYPES = SKU.case_types || [];
    const PRODSKUS = [...new Set((SKU.products || []).map(p => p.sku).filter(Boolean))];
    // model <-> casetype co-occurrence from the SKU database (faceted cross-filter)
    const m2c = {}, c2m = {};
    (SKU.products || []).forEach(p => {
      if (p.model && p.case_type) {
        (m2c[p.model.toLowerCase()] = m2c[p.model.toLowerCase()] || new Set()).add(p.case_type);
        (c2m[p.case_type.toLowerCase()] = c2m[p.case_type.toLowerCase()] || new Set()).add(p.model);
      }
    });

    const base = rule || { id: 'R' + Date.now(), name: '', desc: '', caseClass: 'Bold', template: (PB.state.templates[0] || {}).name,
      exact: false, active: true, closeMode: 'manual',
      filterModel: true, filterCase: false, filterCode: false, filterSku: false,
      models: [], casetypes: [], printcodes: [], skuList: [],
      prefix: '', prefixMode: 'include', reprintMergeReprints: false,   // reprints isolated per order by default; never merged with new orders
      closeDays: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false }, closeTimes: ['17:00'], _new: true };
    const work = JSON.parse(JSON.stringify(base));
    work.closeMode = work.closeMode || 'manual';
    ['models', 'casetypes', 'printcodes', 'skuList'].forEach(k => { if (!Array.isArray(work[k])) work[k] = []; });
    work.closeDays = work.closeDays || { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false };
    work.closeTimes = work.closeTimes || ['17:00'];
    work.prefix = work.prefix || '';   // existing rules predate these fields
    work.prefixMode = work.prefixMode === 'exclude' ? 'exclude' : 'include';
    if (work.reprintMergeReprints === undefined) work.reprintMergeReprints = false;

    const $ = id => PB.qs('#' + id);
    const PICKERS = {
      models: { label: 'Models', split: 'filterModel', mode: 'select',
        help: 'Select the models this rule applies to (from the SKU database). On → each model batches separately; off → all batch together. Empty = all models of this class. Selecting models narrows the casetype list.' },
      casetypes: { label: 'Casetype', split: 'filterCase', mode: 'select',
        help: 'Select the casetypes this rule applies to. On → each casetype batches separately; off → all batch together. Empty = all casetypes of this class. Selecting casetypes narrows the model list.' },
      printcodes: { label: 'Print code', split: 'filterCode', mode: 'free', csv: true, csvLabel: 'Upload print codes (CSV)',
        help: 'Add design print codes (e.g. B-377JJ-MS) — type one and press Enter, or upload a CSV of print codes. On → each print code batches separately. Optional — empty = all print codes included.' },
      skuList: { label: 'SKU list', mode: 'hybrid', csv: true, csvLabel: 'Upload SKUs (CSV)', split: 'filterSku',
        help: 'Optionally target specific SKUs — search & add, or upload a CSV of SKUs. On → each SKU batches separately; off → all batch together. Leave empty to scope by the attributes above instead.' },
    };

    // available options for a picker, faceted by the OTHER attribute's current selection
    function availFor(key) {
      if (key === 'casetypes') { if (!work.models.length) return CASETYPES; const s = new Set(); work.models.forEach(m => (m2c[m.toLowerCase()] || []).forEach(c => s.add(c))); return [...s].sort(); }
      if (key === 'models') { if (!work.casetypes.length) return MODELS; const s = new Set(); work.casetypes.forEach(c => (c2m[c.toLowerCase()] || []).forEach(m => s.add(m))); return [...s].sort(); }
      if (key === 'skuList') return PRODSKUS;
      return [];
    }
    const isSel = (key, val) => (work[key] || []).some(x => x.toLowerCase() === val.toLowerCase());

    function renderChips(key) {
      const el = $('chips_' + key); if (!el) return;
      el.innerHTML = (work[key] || []).map(val => `<span class="chip attr">${PB.esc(val)} <button class="x" type="button" data-rmk="${key}" data-rm="${PB.esc(val)}" aria-label="Remove ${PB.esc(val)}">×</button></span>`).join('');
      PB.qsa('[data-rmk="' + key + '"]', el).forEach(b => b.onclick = ev => { ev.stopPropagation(); removeVal(key, b.dataset.rm, false); });
    }
    function renderOpts(key) {
      const el = $('opts_' + key); if (!el) return; const c = PICKERS[key];
      const q = (($('pk_' + key) || {}).value || '').trim().toLowerCase();
      // selected-first + case-insensitive de-dupe → selected rows always render within the cap and never appear twice
      const map = new Map();
      [...(work[key] || []), ...availFor(key)].forEach(o => { const k = o.toLowerCase(); if (!map.has(k)) map.set(k, o); });
      const union = [...map.values()];
      const filtered = q ? union.filter(o => o.toLowerCase().includes(q)) : union;
      const cap = 200, shown = filtered.slice(0, cap);
      el.innerHTML = shown.length
        ? shown.map(o => `<label class="ms-opt"><input type="checkbox" data-optk="${key}" data-opt="${PB.esc(o)}" ${isSel(key, o) ? 'checked' : ''}><span>${PB.esc(o)}</span></label>`).join('')
          + (filtered.length > cap ? `<div class="ms-foot">${filtered.length - cap} more… keep typing to narrow</div>` : '')
        : `<div class="ms-empty">No matches${c.mode === 'hybrid' && q ? ` — press Enter to add “${PB.esc(q)}”` : ''}.</div>`;
      PB.qsa('[data-optk="' + key + '"]', el).forEach(cb => cb.onclick = ev => {
        ev.stopPropagation(); const val = cb.dataset.opt;
        if (cb.checked) addVal(key, val, false, true);
        else { removeVal(key, val, true); if (!availFor(key).some(o => o.toLowerCase() === val.toLowerCase())) { const row = cb.closest('.ms-opt'); if (row) row.remove(); } }
      });
    }
    function crossRefresh(key, skipSelf) {
      renderChips(key);
      if (!skipSelf) { const p = $('msp_' + key); if (p && !p.hidden) renderOpts(key); }
      if (key === 'models') { const p = $('msp_casetypes'); if (p && !p.hidden) renderOpts('casetypes'); }
      if (key === 'casetypes') { const p = $('msp_models'); if (p && !p.hidden) renderOpts('models'); }
      refreshPreview();   // grouping changed → update the matched-SKU preview
    }

    /* ---------- live "Matched SKUs" preview (FB-ads-style) ---------- */
    let _previewSkus = [];
    const tally = (arr, f) => { const m = {}; arr.forEach(p => { const k = p[f] || '—'; m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
    const chipRow = (label, t) => t.length ? `<div class="page-sub" style="margin-top:8px">${label} (${t.length})</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">${t.slice(0, 5).map(([k, n]) => `<span class="chip attr">${PB.esc(k)} · ${n}</span>`).join('')}${t.length > 5 ? `<span class="chip attr">+${t.length - 5}</span>` : ''}</div>` : '';
    function refreshPreview() {
      const box = $('skuPreview'); if (!box) return;
      const prods = (PB.data.sku_db && PB.data.sku_db.products) || [];
      const total = prods.filter(p => p && p.sku).length;
      const inc = PB.prefixesOf(work).length && work.prefixMode !== 'exclude';
      const skuScoped = (work.caseClass && work.caseClass !== 'Any') || work.casetypes.length || work.models.length || work.skuList.length || inc;
      if (!skuScoped) { _previewSkus = []; box.innerHTML = `<div class="empty" style="padding:16px">No SKU scope yet — pick a case-class, models, casetypes or SKUs (or an Include prefix) to preview which SKUs this rule targets.</div>`; return; }
      const m = PB.matchingSkus(work); _previewSkus = m;
      const pct = total ? Math.round(m.length / total * 100) : 0;
      const codeNote = work.printcodes.length ? `<div class="hint" style="margin-top:8px">Also narrowed by ${work.printcodes.length} print code(s) at the item level (not reflected in this SKU count).</div>` : '';
      const amzNote = (inc && !m.length) ? `<div class="hint" style="margin-top:8px">This prefix matches at the order channel — the catalog isn't prefixed, so 0 catalog SKUs.</div>` : '';
      box.innerHTML = `
        <div class="row" style="align-items:baseline;gap:8px"><div style="font-size:26px;font-weight:700;line-height:1">${m.length.toLocaleString()}</div><div class="page-sub">of ${total.toLocaleString()} SKUs · ${pct}%</div></div>
        <div class="prog ${pct >= 100 ? 'ok' : ''}" style="margin:8px 0"><i style="width:${Math.min(100, pct)}%"></i></div>
        ${chipRow('Models', tally(m, 'model'))}
        ${chipRow('Casetypes', tally(m, 'case_type'))}
        <div class="page-sub" style="margin-top:8px">Sample SKUs</div>
        <div class="mono" style="font-size:11px;max-height:130px;overflow:auto;margin-top:4px;line-height:1.7">${m.slice(0, 50).map(p => PB.esc(p.sku)).join('<br>') || '—'}${m.length > 50 ? `<br><span style="color:var(--muted)">… +${m.length - 50} more</span>` : ''}</div>
        ${codeNote}${amzNote}`;
    }
    function downloadSkuCsv() {
      const rows = _previewSkus;
      if (!rows.length) { PB.toast('No matched SKUs to download', 'warn'); return; }
      const head = ['sku', 'model', 'case_type', 'case_style'];
      const cell = s => { s = String(s == null ? '' : s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
      const csv = [head.join(',')].concat(rows.map(p => head.map(h => cell(p[h])).join(','))).join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' }), url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = ((work.name || 'rule').replace(/\W+/g, '_') || 'rule') + '_skus.csv';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
      PB.toast(`Downloaded ${rows.length} SKUs`, 'ok');
    }
    function addVal(key, raw, loud, skipSelf) {
      const val = (raw || '').trim(); if (!val) return 'empty';
      const master = key === 'models' ? MODELS : key === 'casetypes' ? CASETYPES : null;
      let canon = val;
      if (master) { canon = master.find(o => o.toLowerCase() === val.toLowerCase()); if (!canon) { if (loud) PB.toast('“' + val + '” is not in the SKU database', 'warn'); return 'invalid'; } }
      if (isSel(key, canon)) { if (loud) PB.toast('“' + canon + '” is already added', 'info'); return 'dup'; }
      work[key].push(canon); crossRefresh(key, skipSelf); return 'added';
    }
    function removeVal(key, val, skipSelf) { work[key] = (work[key] || []).filter(x => x.toLowerCase() !== val.toLowerCase()); crossRefresh(key, skipSelf); }

    function openPanel(key) {
      const p = $('msp_' + key); if (!p || !p.hidden) return;   // idempotent — don't re-render an already-open panel
      PB.qsa('.ms-panel', v).forEach(x => { if (x !== p) x.hidden = true; });
      PB.qsa('.ms-input', v).forEach(i => { i.value = ''; i.setAttribute('aria-expanded', 'false'); });  // each open starts with a fresh, unfiltered list (no stale search text)
      p.hidden = false;
      const inp = $('pk_' + key); if (inp) inp.setAttribute('aria-expanded', 'true');
      renderOpts(key);
    }

    function pickSec(key) {
      const c = PICKERS[key];
      return `<div class="pick-sec">
        <div class="pick-head">
          <div class="pick-titles"><b>${c.label}</b><div class="hint">${c.help}</div></div>
          ${c.split ? `<label class="split-toggle" title="On → each value gets its own batch; off → all values share one batch">
            <span class="split-toggle-l">Split separately</span>
            <span class="toggle ${work[c.split] ? 'on' : ''}" data-f="${c.split}" role="switch" tabindex="0" aria-checked="${!!work[c.split]}" aria-label="Split ${c.label} separately"></span></label>` : ''}</div>
        <div class="ms" style="margin-top:8px">
          <div class="ms-control" id="msc_${key}">
            <span class="ms-chips" id="chips_${key}"></span>
            <input class="ms-input" id="pk_${key}" aria-label="${c.label}" autocomplete="off" ${c.mode !== 'free' ? `role="combobox" aria-expanded="false" aria-haspopup="listbox" aria-controls="msp_${key}"` : ''} placeholder="${c.mode === 'free' ? 'Type a value, press Enter' : 'Search & select…'}">
          </div>
          ${c.mode !== 'free' ? `<div class="ms-panel" id="msp_${key}" hidden><div class="ms-opts" id="opts_${key}" role="group" aria-label="${c.label} options"></div></div>` : ''}
        </div>
        ${c.csv ? `<div style="margin-top:8px"><button class="btn outline sm" type="button" id="up_${key}">⤓ ${c.csvLabel || 'Upload CSV'}</button><input type="file" id="file_${key}" accept=".csv,.txt,text/csv,text/plain" hidden></div>` : ''}
      </div>`;
    }

    function paint() {
      v.innerHTML = PB.pageHead({
        back: ['rules'],
        crumbs: [{ label: 'Batching rules', route: ['rules'] }, { label: rule ? base.name || 'Rule' : 'New rule' }],
        title: rule ? 'Edit rule' : 'New batch rule',
        sub: rule ? PB.esc(base.id) : 'Define how SKUs group — filters decide split-vs-merge',
        actions: `<label class="row" style="gap:8px;font-size:13px;margin-right:6px">Active <span class="toggle ${work.active ? 'on' : ''}" id="rActive" role="switch" tabindex="0" aria-checked="${!!work.active}"></span></label>
          ${rule ? '<button class="btn ghost" id="rDel" style="color:var(--err)">Delete</button>' : ''}
          <button class="btn primary" id="rSave">${rule ? 'Save rule' : 'Create rule'}</button>`
      })
        + `<div class="detail-grid">
            <div class="card pad">
              <h3 class="card-title" style="margin:0 0 14px">General</h3>
              <div class="field"><label>Batch rule name *</label><input class="input" id="rName" value="${PB.esc(work.name)}" placeholder="e.g. 6up_AllModels_Bold"></div>
              <div class="field"><label>Description</label><input class="input" id="rDesc" value="${PB.esc(work.desc || '')}"></div>
              <div class="field"><label>SKU prefix <span class="muted" style="font-weight:400">· optional</span></label>
                <div class="row" style="gap:8px;align-items:stretch">
                  <input class="input" id="rPrefix" style="flex:1" value="${PB.esc(work.prefix || '')}" placeholder="e.g. AMZ-  (comma-separate for several)">
                  <div class="seg" id="rPfxMode" style="flex:none">
                    <button type="button" data-pm="include" class="${work.prefixMode !== 'exclude' ? 'active' : ''}">Include</button>
                    <button type="button" data-pm="exclude" class="${work.prefixMode === 'exclude' ? 'active' : ''}">Exclude</button></div>
                </div>
                <div class="hint" style="margin-top:4px"><b>Include</b> → this rule is <b>for</b> SKUs starting with the prefix (wins over general rules). <b>Exclude</b> → this rule applies to everything <b>except</b> those SKUs. Amazon bulk uses <code>AMZ-</code>.</div></div>
              <div class="form-row">
                <div class="field"><label>Template</label><div class="dd-mount" id="rTpl"></div></div>
                <div class="field"><label>Case-class</label><div class="dd-mount" id="rClass"></div></div>
              </div>

              <div class="nav-section" style="padding-left:0;margin-top:10px">Grouping filters</div>
              <div id="matchArea">
                ${pickSec('models')}
                ${pickSec('casetypes')}
                ${pickSec('printcodes')}
                ${pickSec('skuList')}
              </div>
            </div>

            <div>
            <div class="card pad" id="skuPreviewCard" style="position:sticky;top:12px;margin-bottom:16px">
              <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:8px">
                <h3 class="card-title" style="margin:0">Matched SKUs</h3>
                <button class="btn outline sm" id="skuDl" title="Download the matched SKUs as CSV">⤓ CSV</button>
              </div>
              <div id="skuPreview"></div>
            </div>
            <div class="card pad">
              <h3 class="card-title" style="margin:0 0 14px">Batch close</h3>
              <div class="field"><label>How buckets close</label>
                <div class="seg" id="closeSeg">
                  <button type="button" data-cm="manual" class="${work.closeMode === 'manual' ? 'active' : ''}">Manual</button>
                  <button type="button" data-cm="auto" class="${work.closeMode === 'auto' ? 'active' : ''}">Automatic</button></div></div>
              ${work.closeMode === 'manual'
                ? `<div class="hint" style="margin-top:2px">Buckets stay open until you close them manually (<b>Batch Now</b> / <b>Merge</b>). No date/time auto-close. A batch still closes on its own once it fills the template (e.g. 6-up).</div>`
                : `<div class="field"><label>Batch close days</label><div class="daypick" id="rDays">${DAYS.map(([k, l]) => `<button type="button" data-d="${k}" class="${work.closeDays[k] ? 'on' : ''}">${l}</button>`).join('')}</div></div>
                   <div class="field"><label>Close times</label><input class="input" id="rTimes" value="${PB.esc((work.closeTimes || []).join(', '))}" placeholder="09:00, 17:00"></div>
                   <div class="hint">Open buckets auto-close on these day(s) at these time(s).</div>`}

              <div class="nav-section" style="padding-left:0;margin-top:14px">Reprint handling</div>
              <div class="hint" style="margin-top:2px;margin-bottom:8px">Reprints are <b>always separate</b> from new orders. Choose whether this rule's reprints pool together or stay isolated per original order.</div>
              <label class="row" style="gap:10px;margin-top:2px"><span class="toggle ${work.reprintMergeReprints ? 'on' : ''}" id="rRpRp" role="switch" tabindex="0" aria-checked="${!!work.reprintMergeReprints}" aria-label="Merge reprints with other reprints (same rule)"></span> Merge reprints with other reprints (same rule)</label>
              <div class="hint" style="margin-top:8px">Off → each order's reprints batch on their own sheet. On → all of this rule's reprints pool into one bucket (still separate from new orders).</div>

              <div class="nav-section" style="padding-left:0;margin-top:14px">Options</div>
              <label class="row" style="gap:10px;margin-top:2px"><span class="toggle ${work.exact ? 'on' : ''}" id="rExact" role="switch" tabindex="0" aria-checked="${!!work.exact}"></span> Attempt exact quantity</label>
              <div class="hint" style="margin-top:8px">Exact quantity holds the bucket until it can fill the imposition exactly, minimising waste.</div>
            </div>
            </div>
          </div>`;
      wire();
    }

    function sync() {
      if ($('rName')) work.name = $('rName').value;
      if ($('rDesc')) work.desc = $('rDesc').value;   // template + case-class are kept in sync via their dropdown onChange
      if ($('rPrefix')) work.prefix = $('rPrefix').value.trim();
      if ($('rTimes')) work.closeTimes = $('rTimes').value.split(/[\s,;]+/).map(s => s.trim()).filter(s => /^\d{1,2}:\d{2}$/.test(s));
    }

    function wirePicker(key) {
      const c = PICKERS[key];
      renderChips(key);
      const inp = $('pk_' + key), control = $('msc_' + key), panel = $('msp_' + key);
      const closePanel = () => { if (panel && !panel.hidden) { panel.hidden = true; inp.setAttribute('aria-expanded', 'false'); inp.focus(); } };
      if (c.mode !== 'free') {
        control.onclick = () => { openPanel(key); inp.focus(); };
        inp.onfocus = () => openPanel(key);
        inp.oninput = () => { if (panel && !panel.hidden) renderOpts(key); };
        // Escape works even when focus is on a checkbox inside the panel
        if (panel) panel.onkeydown = e => { if (e.key === 'Escape') { e.stopPropagation(); closePanel(); } };
      }
      inp.onkeydown = e => {
        if (e.key === 'Enter') { e.preventDefault(); const r = addVal(key, inp.value, true, false); if (r === 'added' || r === 'dup') { inp.value = ''; if (c.mode !== 'free') renderOpts(key); } }
        else if (e.key === 'Escape' && panel && !panel.hidden) { e.stopPropagation(); closePanel(); }
      };
      const up = $('up_' + key);
      if (up) {
        const f = $('file_' + key);
        up.onclick = () => f.click();
        f.onchange = () => {
          const file = f.files[0]; f.value = ''; if (!file) return;
          if (file.size > 2 * 1024 * 1024) { PB.toast('File too large (max 2 MB)', 'err'); return; }
          const rd = new FileReader();
          rd.onload = e => { const vals = String(e.target.result).split(/[\s,;]+/).map(s => s.trim()).filter(Boolean); let n = 0; vals.forEach(val => { if (addVal(key, val, false, false) === 'added') n++; }); PB.toast(n ? n + ' added from file' : 'Nothing new in file', n ? 'ok' : 'warn'); if (c.mode !== 'free') renderOpts(key); };
          rd.onerror = () => PB.toast('Could not read file', 'err');
          rd.readAsText(file);
        };
      }
    }

    function wire() {
      PB.qsa('[data-f]', v).forEach(t => t.onclick = () => { const k = t.dataset.f; work[k] = !work[k]; t.classList.toggle('on'); t.setAttribute('aria-checked', !!work[k]); });
      PB.qsa('#rDays button', v).forEach(b => b.onclick = () => { const k = b.dataset.d; work.closeDays[k] = !work.closeDays[k]; b.classList.toggle('on'); });
      const tg = (id, key) => { const e = $(id); if (e) e.onclick = () => { work[key] = !work[key]; e.classList.toggle('on'); e.setAttribute('aria-checked', !!work[key]); }; };
      tg('rExact', 'exact'); tg('rActive', 'active'); tg('rRpRp', 'reprintMergeReprints');
      PB.dropdown(PB.qs('#rTpl'), { options: PB.state.templates.map(t => t.name), value: work.template, label: 'template', onChange: x => { work.template = x; } });
      PB.dropdown(PB.qs('#rClass'), { options: CLASSES, value: work.caseClass, label: 'case-class', onChange: x => { work.caseClass = x; refreshPreview(); } });

      PB.qsa('#closeSeg button', v).forEach(b => b.onclick = () => { if (work.closeMode === b.dataset.cm) return; sync(); work.closeMode = b.dataset.cm; paint(); });
      // SKU-prefix: live text + Include/Exclude mode both refresh the preview
      { const pf = $('rPrefix'); if (pf) pf.oninput = () => { work.prefix = pf.value.trim(); refreshPreview(); }; }
      PB.qsa('#rPfxMode button', v).forEach(b => b.onclick = () => { if (work.prefixMode === b.dataset.pm) return; work.prefixMode = b.dataset.pm; PB.qsa('#rPfxMode button', v).forEach(x => x.classList.toggle('active', x.dataset.pm === work.prefixMode)); refreshPreview(); });
      { const dl = $('skuDl'); if (dl) dl.onclick = downloadSkuCsv; }

      ['models', 'casetypes', 'printcodes', 'skuList'].forEach(wirePicker);
      refreshPreview();   // initial preview for the current scope

      $('rSave').onclick = () => {
        sync();
        work.name = (work.name || '').trim() || 'Untitled rule';
        let saved;
        if (work._new) { delete work._new; PB.state.rules.unshift(work); saved = work; }
        else { const tgt = PB.state.rules.find(x => x.id === base.id); if (tgt) { Object.assign(tgt, work); saved = tgt; } else { PB.state.rules.unshift(work); saved = work; } }
        if (PB.resyncRuleBuckets) PB.resyncRuleBuckets(saved);   // a template/threshold change must reflow this rule's open buckets
        PB.save(); PB.toast('Rule saved', 'ok'); PB.go('rules');
      };
      const del = $('rDel'); if (del) del.onclick = async () => {
        if (!(await PB.confirm({ title: 'Delete rule', message: 'Delete rule “' + (base.name || base.id) + '”?', confirmText: 'Delete', danger: true }))) return;
        PB.state.rules = PB.state.rules.filter(x => x.id !== base.id); PB.save(); PB.toast('Rule deleted', 'warn'); PB.go('rules');
      };
    }

    // close any open dropdown when clicking outside a picker (one listener for this editor instance;
    // self-removes once the editor is no longer mounted, so it doesn't linger app-wide)
    if (PB._rulesCloseAway) document.removeEventListener('mousedown', PB._rulesCloseAway);
    PB._rulesCloseAway = e => {
      if (!PB.qs('#matchArea')) { document.removeEventListener('mousedown', PB._rulesCloseAway); PB._rulesCloseAway = null; return; }
      if (!(e.target.closest && e.target.closest('.ms'))) { PB.qsa('.ms-panel', v).forEach(p => p.hidden = true); PB.qsa('.ms-input', v).forEach(i => i.setAttribute('aria-expanded', 'false')); }
    };
    document.addEventListener('mousedown', PB._rulesCloseAway);

    paint();
  }
})();
