/* Buckets — list (deep-linked) + Merge + full detail PAGE at #/buckets/:id */
(function () {
  PB.view('buckets', (v, param) => { if (param) return detail(v, param); list(v); });

  let fq = '', fTpl = [], fMdl = [], fCse = [], fCde = [], fSrc = [];   // buckets list search + Batch-by + Source filters (multi-select)

  // "Batch by" rendering is shared with the Batches page — see PB.batchSegs in core.js.
  const batchByHtml = PB.batchByHtml, batchByText = PB.batchByText;

  // a bucket's Batch-by values, used for the filters (split single value, else the actual item values)
  const bModels = k => (k.model && !/^Multi /i.test(k.model)) ? [k.model] : [...new Set((k.items || []).map(it => it.model).filter(Boolean))];
  const bCases = k => (k.case_type && !/^Multi /i.test(k.case_type)) ? [k.case_type] : [...new Set((k.items || []).map(it => it.case_type).filter(Boolean))];
  const bCodes = k => [...new Set((k.items || []).map(it => it.print_sku).filter(Boolean))];

  /* ---------------- list ---------------- */
  function list(v) {
    const all = PB.state.buckets;
    const templates = [...new Set(all.map(b => b.template).filter(Boolean))].sort();
    const models = [...new Set(all.flatMap(bModels))].sort();
    const cases = [...new Set(all.flatMap(bCases))].sort();
    const codes = [...new Set(all.flatMap(bCodes))].sort();
    const sources = [...new Set(all.map(b => PB.sourceText(b)).filter(Boolean))].sort();
    fTpl = fTpl.filter(x => templates.includes(x));   // drop filter values that no longer exist
    fMdl = fMdl.filter(x => models.includes(x));
    fCse = fCse.filter(x => cases.includes(x));
    fCde = fCde.filter(x => codes.includes(x));
    fSrc = fSrc.filter(x => sources.includes(x));

    const anyIn = (arr, picks) => !picks.length || arr.some(x => picks.includes(x));
    const hay = b => [b.rule, b.model, b.case_type, b.template, PB.sourceText(b), ...(b.items || []).flatMap(it => [it.component_barcode, it.item_barcode, it.source_id, it.print_sku])].filter(Boolean).join(' ').toLowerCase();
    const computeRows = () => { const ql = fq.trim().toLowerCase();
      return all.filter(b => (!fTpl.length || fTpl.includes(b.template)) && anyIn(bModels(b), fMdl) && anyIn(bCases(b), fCse) && anyIn(bCodes(b), fCde) && (!fSrc.length || fSrc.includes(PB.sourceText(b))) && (!ql || hay(b).includes(ql))); };

    v.innerHTML = PB.pageHead({
      title: 'Buckets',
      sub: `${all.length} open · items waiting to reach threshold. Merge buckets to batch flexibly (HP can’t).`,
      actions: `<button class="btn outline" data-go="batch">⊹ Scan more</button>`
    })
      + `<div class="grid-toolbar" style="margin-bottom:12px">
          <div class="qf"><span class="qf-ic">⌕</span><input id="bktSearch" aria-label="Search buckets" placeholder="Search barcode, order #, print code, rule…" value="${PB.esc(fq)}"></div>
          <div class="dd-mount" id="dd_tpl" style="width:170px;flex:none"></div>
          <div class="dd-mount" id="dd_mdl" style="width:165px;flex:none"></div>
          <div class="dd-mount" id="dd_cse" style="width:180px;flex:none"></div>
          <div class="dd-mount" id="dd_cde" style="width:160px;flex:none"></div>
          <div class="dd-mount" id="dd_src" style="width:160px;flex:none"></div>
          <button class="btn ghost sm" id="fClr">Clear</button>
          <button class="btn ghost sm" id="bktCols" title="Show / hide & reorder columns">⚙ Columns</button>
          <span class="page-sub" id="bktCount" style="margin-left:auto;white-space:nowrap"></span>
        </div>
        <div class="card mergebar" id="mergeBar" style="margin-bottom:14px;display:none"></div>
        <div id="grid"></div>
        <p class="page-sub" style="margin-top:10px">Merging is allowed within the same template and case-class (Bold/Classic/…), only while combined qty stays ≤ threshold.</p>`;
    PB.qsa('[data-go]', v).forEach(b => b.onclick = () => PB.go(b.dataset.go));

    const progCell = b => `<div class="prog-lbl"><span>${b.qty}/${b.threshold}</span><b>${b.progress}%</b></div>
      <div class="prog ${b.progress >= 100 ? 'ok' : ''}"><i style="width:${Math.min(100, b.progress)}%"></i></div>`;
    const cardFn = b => `<div class="card pad">
        <div class="row" style="justify-content:space-between"><a href="${PB.link('buckets', b.id)}" class="cell-link"><b>${PB.esc(b.rule)}</b></a>
          <span class="badge ${b.progress >= 100 ? 'ok' : ''} dot">${b.progress}%</span></div>
        <div class="page-sub">${batchByHtml(b)} · ${PB.esc(b.template)}</div>
        ${b.updated_at ? `<div class="page-sub" style="margin-top:2px">updated ${PB.fmt.ago(b.updated_at)}</div>` : ''}
        <div class="prog ${b.progress >= 100 ? 'ok' : ''}" style="margin-top:8px"><i style="width:${Math.min(100, b.progress)}%"></i></div>
        <div class="row" style="gap:8px;margin-top:10px"><button class="btn outline sm" style="flex:1" data-now="${PB.esc(b.id)}">Batch now → ${b.qty} units</button>
          <button class="btn ghost sm" data-del="${PB.esc(b.id)}" title="Delete bucket" style="color:var(--err)">✕</button></div></div>`;
    const cols = [
      { headerName: '', checkboxSelection: true, headerCheckboxSelection: true, width: 46, maxWidth: 46, minWidth: 46, sortable: false, filter: false, resizable: false, flex: 0 },
      { headerName: 'Rule', field: 'rule', minWidth: 180, cellRenderer: p => `<a href="${PB.link('buckets', p.data.id)}" class="cell-link">${PB.esc(p.value)}</a>` },
      { headerName: 'Source', minWidth: 140, valueGetter: p => PB.sourceText(p.data), cellRenderer: p => PB.rowSourceChip(p.data) },
      { headerName: 'Batch by', flex: 2, minWidth: 240, wrapText: true, autoHeight: true, valueGetter: p => batchByText(p.data), cellRenderer: p => batchByHtml(p.data) },
      { headerName: 'Template', field: 'template', minWidth: 150 },
      { headerName: 'Qty', field: 'qty', maxWidth: 80, type: 'numericColumn' },
      { headerName: 'Threshold', field: 'threshold', maxWidth: 110, type: 'numericColumn' },
      { headerName: 'Progress', field: 'progress', minWidth: 160, cellRenderer: p => progCell(p.data) },
      { headerName: 'Last updated', field: 'updated_at', minWidth: 120, cellRenderer: p => p.value ? `<span title="${PB.esc(PB.fmt.dt(p.value))}">${PB.esc(PB.fmt.ago(p.value))}</span>` : `<span style="color:var(--muted)">—</span>` },
      { headerName: '', minWidth: 150, maxWidth: 160, sortable: false, filter: false, cellRenderer: p => `<button class="btn outline sm" data-now="${PB.esc(p.data.id)}">Batch now</button> <button class="btn ghost sm" data-del="${PB.esc(p.data.id)}" title="Delete bucket" style="color:var(--err)">✕</button>` },
    ];
    const rows = computeRows();
    const api = PB.grid(PB.qs('#grid'), cols, rows, {
      tall: true, search: false, rowSelection: 'multiple', gridKey: 'buckets',
      gridOptions: { suppressRowClickSelection: true },
      onSelectionChanged: e => updateMergeBar(e.api),
      card: cardFn,
    });
    const setCount = n => { const e = PB.qs('#bktCount'); if (e) e.textContent = n === all.length ? `${all.length} buckets` : `${n} of ${all.length}`; };
    const applyLive = () => { const r = computeRows(); api.setGridOption('rowData', r);
      const c = PB.qs('#grid .mobile-cards'); if (c) c.innerHTML = r.length ? r.map(cardFn).join('') : '<div class="empty">No buckets match.</div>'; setCount(r.length); };
    setCount(rows.length);

    // toolbar: live search (no re-render → keeps focus); dropdowns re-render the list
    const search = PB.qs('#bktSearch'); if (search) search.oninput = () => { fq = search.value; applyLive(); };
    PB.dropdown(PB.qs('#dd_tpl'), { multi: true, options: templates, values: fTpl, placeholder: 'All templates', label: 'template', onChange: x => { fTpl = x; applyLive(); } });
    PB.dropdown(PB.qs('#dd_mdl'), { multi: true, options: models, values: fMdl, placeholder: 'All models', label: 'model', onChange: x => { fMdl = x; applyLive(); } });
    PB.dropdown(PB.qs('#dd_cse'), { multi: true, options: cases, values: fCse, placeholder: 'All casetypes', label: 'casetype', onChange: x => { fCse = x; applyLive(); } });
    PB.dropdown(PB.qs('#dd_cde'), { multi: true, options: codes, values: fCde, placeholder: 'All print codes', label: 'print code', onChange: x => { fCde = x; applyLive(); } });
    PB.dropdown(PB.qs('#dd_src'), { multi: true, options: sources, values: fSrc, placeholder: 'All sources', label: 'source', onChange: x => { fSrc = x; applyLive(); } });
    const fclr = PB.qs('#fClr'); if (fclr) fclr.onclick = () => { fq = ''; fTpl = []; fMdl = []; fCse = []; fCde = []; fSrc = []; list(v); };
    const bcols = PB.qs('#bktCols'); if (bcols) bcols.onclick = () => PB.columnConfig(api, 'pb.cols.buckets');
    // row actions: Batch now + delete (grid cells + cards)
    PB.qs('#grid').addEventListener('click', e => {
      const n = e.target.closest('[data-now]'); if (n) { e.stopPropagation(); batchNow(n.dataset.now); return; }
      const d = e.target.closest('[data-del]'); if (d) { e.stopPropagation(); deleteBuckets([d.dataset.del]); }
    });
    PB._bucketApi = api;
  }

  function updateMergeBar(api) {
    const bar = PB.qs('#mergeBar'); if (!bar) return;
    const chosen = api.getSelectedRows();
    if (!chosen.length) { bar.style.display = 'none'; return; }
    const m = PB.canMerge(chosen);
    bar.style.display = '';
    bar.innerHTML = `<div class="card-head" style="border:0">
      <b>${chosen.length} selected · ${chosen.reduce((s, b) => s + b.qty, 0)} units</b>
      <div class="spacer" style="flex:1"></div>
      ${chosen.length >= 2 ? `<span class="badge ${m.ok ? 'ok' : 'err'}">${m.ok ? 'mergeable → ' + m.q + '/' + m.max : m.why}</span>` : '<span class="page-sub">select 2+ to merge</span>'}
      <button class="btn primary" id="mergeBtn" ${m.ok ? '' : 'disabled'}>⇆ Merge &amp; batch now</button>
      <button class="btn outline sm" id="delSelBkt" style="color:var(--err)">🗑 Delete selected (${chosen.length})</button>
      <button class="btn ghost sm" id="clrSel">clear</button></div>`;
    const mb = PB.qs('#mergeBtn'); if (mb) mb.onclick = () => { const b = PB.mergeBuckets(chosen); PB.toast('Merged into batch ' + b.number, 'ok'); PB.refreshNav(); list(PB.qs('#view')); };
    const ds = PB.qs('#delSelBkt'); if (ds) ds.onclick = () => deleteBuckets(chosen.map(b => b.id));
    const c = PB.qs('#clrSel'); if (c) c.onclick = () => api.deselectAll();
  }

  async function deleteBuckets(ids) {
    if (!ids || !ids.length) return;
    if (!(await PB.confirm({ title: ids.length === 1 ? 'Delete bucket' : 'Delete buckets', message: ids.length === 1 ? 'Delete this bucket? Its waiting items go back to the scan pool.' : `Delete ${ids.length} buckets? Their waiting items go back to the scan pool.`, confirmText: 'Delete', danger: true }))) return;
    const set = new Set(ids);
    PB.state.buckets = PB.state.buckets.filter(k => {
      if (!set.has(k.id)) return true;
      (k.items || []).forEach(it => PB.state.pool.push(PB.cleanItem(it)));   // back to the pool as pristine new orders (resets reprint flags)
      return false;
    });
    PB.save(); PB.refreshNav(); PB.toast(ids.length + ' bucket' + (ids.length > 1 ? 's' : '') + ' deleted', 'warn'); list(PB.qs('#view'));
  }

  function batchNow(id) {
    const i = PB.state.buckets.findIndex(b => b.id === id); if (i < 0) return;
    const k = PB.state.buckets[i];
    const rule = PB.state.rules.find(r => r.id === k.ruleId) || { id: k.ruleId, name: k.rule, template: k.template, filterModel: true, filterCase: false };
    let b;
    if (k.items && k.items.length) b = PB.mkBatch(rule, k.items, 'manual');
    else { b = PB.mkBatch(rule, [], 'manual'); b.qty = k.qty; b.model = k.model; b.case_type = k.case_type; b.caseClass = k.caseClass; }
    PB.state.batches.unshift(b); PB.state.buckets.splice(i, 1);
    PB.save(); PB.refreshNav(); PB.toast('Bucket closed → batch ' + b.number, 'ok');
    // stay on the Buckets page — re-render the list in place; only leave if we're on a (now-gone) bucket detail
    const r = PB.route(); if (r.name === 'buckets' && r.param) PB.go('buckets'); else list(PB.qs('#view'));
  }

  /* ---------------- detail page ---------------- */
  function detail(v, id) {
    const k = PB.state.buckets.find(b => b.id === id);
    if (!k) { v.innerHTML = PB.pageHead({ title: 'Bucket not found', back: ['buckets'] }) + '<div class="empty">This bucket may already be batched.</div>'; return; }
    const items = k.items || []; items.forEach((it, i) => it.__i = i);
    const t = PB.state.templates.find(x => x.name === k.template);
    const uniq = f => [...new Set(items.map(it => it[f]).filter(Boolean))];
    const modelDisp = k.model && !/^Multi /i.test(k.model) ? `<b>${PB.esc(k.model)}</b>` : (uniq('model').map(PB.esc).join(', ') || 'Multi Model');
    const caseDisp = k.case_type && !/^Multi /i.test(k.case_type) ? `<b>${PB.esc(k.case_type)}</b>` : (uniq('case_type').map(PB.esc).join(', ') || 'Multi Casetype');
    v.innerHTML = PB.pageHead({
      back: ['buckets'],
      crumbs: [{ label: 'Buckets', route: ['buckets'] }, { label: k.rule }],
      title: `${PB.esc(k.rule)} <span class="badge ${k.progress >= 100 ? 'ok' : ''} dot" style="font-size:11px;vertical-align:middle">${k.progress}%</span>`,
      sub: `${PB.esc(k.template)} · waiting to reach threshold ${k.threshold}`,
      actions: `<button class="btn outline" data-go="batch">⊹ Add via scan</button><button class="btn primary" data-now>Batch now → ${k.qty} units</button>`
    })
      + `<div class="bkt-detail">
          <div class="card pad">
            <div class="ticket" style="margin-bottom:14px">
              <div class="t"><div class="k">Model</div><div class="v" style="font-size:14px">${modelDisp}</div></div>
              <div class="t"><div class="k">Casetype</div><div class="v" style="font-size:14px"><span class="case-dot" style="background:${PB.classColor(k.caseClass)}"></span> ${caseDisp}</div></div>
              <div class="t"><div class="k">Qty / Threshold</div><div class="v">${k.qty}/${k.threshold}</div></div>
              <div class="t"><div class="k">Exact</div><div class="v" style="font-size:14px">${k.exact ? 'yes' : 'no'}</div></div>
            </div>
            <div class="prog ${k.progress >= 100 ? 'ok' : ''}" style="margin-bottom:6px"><i style="width:${Math.min(100, k.progress)}%"></i></div>
            <div class="prog-lbl"><span>${k.qty} of ${k.threshold} units</span><b>${k.progress}%</b></div>
            <dl class="kv" style="margin-top:14px">
              <dt>Rule</dt><dd>${k.ruleId ? `<a href="${PB.link('rules', k.ruleId)}">${PB.esc(k.rule)}</a>` : PB.esc(k.rule)}</dd>
              <dt>Template</dt><dd>${t ? `<a href="${PB.link('templates', t.name)}">${PB.esc(k.template)}</a>` : PB.esc(k.template)}</dd>
              <dt>Last updated</dt><dd>${k.updated_at ? PB.fmt.dt(k.updated_at) : '—'}</dd>
            </dl>
          </div>
          <div class="card pad">
            <div class="row" style="justify-content:space-between;margin-bottom:10px"><h3 class="card-title" style="margin:0">Items <span class="cnt">${items.length}</span></h3></div>
            <div id="igrid"></div>
          </div>
        </div>`;
    PB.qsa('[data-go]', v).forEach(b => b.onclick = () => PB.go(b.dataset.go));
    PB.qs('[data-now]').onclick = () => batchNow(k.id);

    const cols = [
      { headerName: 'Source', field: 'source_id', minWidth: 120, cellRenderer: p => `<b class="mono">${PB.esc(p.value || '—')}</b>` },
      { headerName: 'Printfile', maxWidth: 90, minWidth: 80, sortable: false, filter: false, cellRenderer: p => `<div class="thumb" title="${PB.esc(p.data.print_sku || '')}" style="${PB.swatch(p.data.print_sku || p.data.sku || p.data.source_id)};width:34px;height:34px;border-radius:6px"></div>` },
      { headerName: 'Print SKU', field: 'print_sku', minWidth: 130, cellRenderer: p => `<span class="mono">${PB.esc(p.value || '—')}</span>` },
      { headerName: 'Model', field: 'model', minWidth: 120 },
      { headerName: 'Casetype', field: 'case_type', minWidth: 120 },
      { headerName: 'Status', maxWidth: 110, valueGetter: p => p.data.shipped_date ? 'Shipped' : 'Live', cellRenderer: p => p.data.shipped_date ? `<span class="cell-tag ok" title="Shipped ${PB.esc(PB.fmt.date(p.data.shipped_date))}">Shipped</span>` : `<span class="cell-tag live">Live</span>` },
      { headerName: 'Added to bucket', field: 'added_at', minWidth: 150, valueFormatter: p => PB.fmt.dt(p.value) },
      { headerName: '', maxWidth: 100, sortable: false, filter: false, cellRenderer: p => `<button class="btn ghost sm" data-del="${p.data.__i}">remove</button>` },
    ];
    PB.grid(PB.qs('#igrid'), cols, items, { tall: true, pageSize: 25, search: items.length > 8, noPager: items.length <= 25, gridKey: 'bucket-items',
      card: it => `<div class="card pad"><div class="row" style="gap:10px;align-items:center">
        <div class="thumb" style="${PB.swatch(it.print_sku || it.sku || it.source_id)};width:40px;height:40px;border-radius:6px;flex:none"></div>
        <div style="flex:1;min-width:0"><div class="row" style="justify-content:space-between"><b class="mono">${PB.esc(it.source_id || '—')}</b><button class="btn ghost sm" data-del="${it.__i}">remove</button></div>
          <div class="page-sub">${PB.esc(it.model)} · ${PB.esc(it.case_type)} · ${PB.esc(it.print_sku || '')} · <span class="cell-tag ${it.shipped_date ? 'ok' : 'live'}">${it.shipped_date ? 'Shipped' : 'Live'}</span></div>
          <div class="page-sub" style="margin-top:2px">Added ${PB.esc(PB.fmt.dt(it.added_at))}</div></div></div></div>`,
      gridOptions: { suppressNoRowsOverlay: false } });
    if (!items.length) PB.qs('#igrid .mobile-cards') && (PB.qs('#igrid .mobile-cards').innerHTML = '<div class="empty">Live HP bucket — items not in snapshot.</div>');

    PB.qs('#igrid').addEventListener('click', e => {
      const d = e.target.closest('[data-del]'); if (!d) return;
      const idx = +d.dataset.del; const it = (k.items || [])[idx]; if (!it) return;
      k.items.splice(idx, 1); PB.state.pool.push(PB.cleanItem(it));   // back to the pool as a pristine new order
      k.qty = k.items.reduce((s, i) => s + (+i.qty || 1), 0); k.progress = Math.round(k.qty / k.threshold * 100);
      k.updated_at = new Date().toISOString();   // removing an item IS an update → stamp the change time
      if (!k.items.length) { const bi = PB.state.buckets.findIndex(x => x.id === k.id); if (bi >= 0) PB.state.buckets.splice(bi, 1); PB.save(); PB.refreshNav(); PB.toast('Bucket emptied', 'warn'); PB.go('buckets'); return; }
      PB.save(); PB.refreshNav(); detail(v, id);
    });
  }

  PB.openBucket = (id) => PB.go('buckets', id);  // back-compat
})();
