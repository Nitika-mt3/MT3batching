/* Batch workspace — barcode-first "scan → match rule → route to batch" (Auto + Manual) */
(function () {
  let mode = 'auto';        // 'auto' | 'manual'
  let scanReprint = false;  // automatic scanning as reprints (source #4) — batched on the user's "Create batches" click
  let manualTpl = null, manualName = '', manualCode = '';
  let fq = '', fMdl = [], fCse = [], fDate = [];   // scanned-items search + filters (multi-select)
  const sel = new Set();                              // selected rows (by key) for bulk delete
  let _rid = 0;                                       // fallback counter (per-session)
  // globally-unique row id — survives reloads (persisted scanned/upload rows would collide with a reset counter)
  const newRowId = () => 'r' + ((typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : (Date.now().toString(36) + (_rid++) + Math.random().toString(36).slice(2, 8)));
  const keyOf = s => s._rowId || s.component_barcode || s.item_barcode || s.source_id || '';

  function rootRender(v) {
    if (!manualTpl) manualTpl = (PB.state.templates[0] || {}).name || '';
    reconcileFilters(); pruneSel();      // drop filters / selections that no longer apply to the current rows
    const included = PB.state.scanned;   // every scanned row is in the batch; remove unwanted ones via ✕ / bulk delete
    // route per item: manual/upload rows → manual sheets; the rest → the auto (rule) pipeline
    const withR = included.map(withRule);
    const autoItems = withR.filter(s => !isManual(s));
    const manualItems = withR.filter(isManual);
    const autoFormed = autoItems.length ? PB.formItems(autoItems.filter(s => s._rule)) : null;

    v.innerHTML = `
      <div class="page-head">
        <div>
          <h1 class="page-title">${mode === 'auto' ? 'Reprints' : 'Manual upload'}</h1>
          <p class="page-sub">${mode === 'auto'
            ? 'Automatic batching — scan an item barcode / order # to match its rule and route to a batch. Toggle “Reprint scan” to batch scans as reprints (source #4).'
            : 'Manual batching — build sheets by hand from scanned items or uploaded design / colour-test files; manual sheets skip the bucket and go straight to a batch.'}</p>
        </div>
        <div class="spacer"></div>
        <div class="page-actions">
          <a class="btn ghost sm" href="#/${mode === 'auto' ? 'manual' : 'reprints'}">${mode === 'auto' ? 'Manual upload →' : '← Reprints'}</a>
        </div>
      </div>

      <div class="scanwrap" style="margin-bottom:16px">
        <div class="scanbox" id="scanbox">
          <div class="row" style="justify-content:space-between;margin-bottom:10px">
            <b>${mode === 'auto' ? 'Automatic batching' : 'Manual batching'}${mode === 'auto' && scanReprint ? ' <span class="source-chip src-reprint" style="vertical-align:middle">Reprint</span>' : ''}</b>
            <div class="row" style="gap:14px">
              ${mode === 'auto' ? `<label class="row" style="gap:6px;font-size:12px;color:var(--muted)" title="Scan these items as reprints (source #4). They keep the reprint rules and batch when you click Create batches.">Reprint scan <span class="toggle sm ${scanReprint ? 'on' : ''}" id="tgReprint" role="switch" aria-checked="${scanReprint}"></span></label>` : ''}
              <label class="row" style="gap:6px;font-size:12px;color:var(--muted)">Sound <span class="toggle sm ${PB.fb.sound ? 'on' : ''}" id="tgSound"></span></label>
              <label class="row" style="gap:6px;font-size:12px;color:var(--muted)">Haptic <span class="toggle sm ${PB.fb.haptic ? 'on' : ''}" id="tgHaptic"></span></label>
            </div>
          </div>
          <input class="scan-input" id="scanInput" list="scanList" placeholder="◳ Scan component / item barcode or order #" autocomplete="off" />
          <datalist id="scanList">${PB.state.pool.slice(0, 300).flatMap(s => [s.component_barcode, s.source_id, s.print_sku]).filter(Boolean).map(x => `<option value="${PB.esc(x)}"></option>`).join('')}</datalist>
          <div class="row" style="margin-top:12px;gap:8px">
            <button class="btn primary scan-trigger" id="simScan" style="flex:1">⊕ Simulate scan</button>
            <button class="btn outline scan-trigger" id="bulkBtn">≣ Bulk add</button>
            ${mode === 'manual' ? '<button class="btn outline scan-trigger" id="uploadBtn" title="Upload design / colour test files — they batch as test prints per the selected template">⤒ Upload files</button>' : ''}
          </div>
          ${PB.state.pool.length
            ? `<div class="hint" style="margin-top:10px">Demo data only matches the snapshot. No scanner handy? Tap a real one from the pool:<br>
                ${PB.state.pool.slice(0, 4).map(s => `<button class="btn ghost sm mono" type="button" data-scan="${PB.esc(s.component_barcode)}" style="margin-top:6px">${PB.esc(s.component_barcode)}</button>`).join(' ')}</div>`
            : `<div class="hint" style="margin-top:10px">Pool is empty — tap ⟳ in the top bar to reload the snapshot.</div>`}
          ${mode === 'manual' ? `
            <div class="form-row" style="margin-top:14px">
              <div class="field" style="margin:0"><label>Template</label>
                <div class="dd-mount" id="mTpl"></div></div>
              <div class="field" style="margin:0"><label>Custom batch name (optional)</label>
                <input class="input" id="mName" placeholder="overrides number sequence" value="${PB.esc(manualName)}"></div>
            </div>
            <div class="form-row" style="margin-top:10px">
              <div class="field" style="margin:0"><label>Print code (optional)</label>
                <input class="input" id="mCode" placeholder="design print code, e.g. B-377JJ-MS" value="${PB.esc(manualCode)}"></div>
            </div>
            <div class="hint" style="margin-top:6px">Manual sheets skip the bucket and go straight to a batch — even below threshold. Qty is editable.</div>` : ''}
        </div>

        <div class="card pad">
          <h3 class="card-title" style="margin:0 0 10px">Will create</h3>
          ${!included.length ? '<div class="empty" style="padding:18px">Scan items to preview batches.</div>'
            : `${autoItems.length ? autoPreview(autoFormed, autoItems.length) : ''}${(autoItems.length && manualItems.length) ? '<div style="height:12px"></div>' : ''}${manualItems.length ? manualPreview(manualItems) : ''}`}
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3 class="card-title">Scanned items <span class="badge">${PB.state.scanned.length}</span></h3>
          <div class="spacer" style="flex:1"></div>
          <span id="scanActions">${sel.size ? `<button class="btn outline sm" id="delSel" style="color:var(--err)">🗑 Delete selected (${sel.size})</button>` : ''}</span>
          <button class="btn ghost sm" id="clearScan">Clear</button>
          <button class="btn primary" id="createBtn" ${included.length ? '' : 'disabled'}>✓ Done &amp; create batches (${included.length})</button>
        </div>
        ${PB.state.scanned.length ? filterBar() : ''}
        <div id="scanResults">${resultsTable()}</div>
      </div>`;

    wire(v);
  }

  // upload/test items never carry a rule (they go to manual sheets, never the auto bucket pipeline)
  const withRule = (s) => ({ ...s, _rule: s._upload ? null : (s._rule || PB.resolveRule(s)) });
  const isManual = (s) => !!(s._manual || s._upload);   // route per-item, not by the global mode toggle
  // return a scanned row to the intake pool: SKIP synthetic upload/test rows (never real orders), and reset any
  // reprint flags so an item put back becomes a normal new order again (PB.cleanItem). Used by Clear / ✕ / bulk-delete.
  const toPool = (s) => { if (s._upload) return; PB.state.pool.push(PB.cleanItem(s)); };

  function autoPreview(p, n) {
    if (!n) return '<div class="empty" style="padding:18px">Scan items to preview batches.</div>';
    return `<div class="metric-row" style="grid-template-columns:1fr 1fr">
        <div class="metric ok"><div class="metric-k">Full batches</div><div class="metric-v">${p.batches.length}</div></div>
        <div class="metric warn"><div class="metric-k">→ bucket</div><div class="metric-v">${p.buckets.reduce((s, b) => s + b.qty, 0)}</div></div>
      </div>
      <div style="margin-top:10px">${p.batches.slice(0, 4).map(b => `<div class="row" style="justify-content:space-between;margin-top:7px">
        <span><span class="case-dot" style="background:${PB.classColor(b.caseClass)}"></span> ${PB.esc(b.template)}</span><b>${b.qty} up</b></div>`).join('')}</div>`;
  }
  function manualPreview(inc) {
    const t = PB.state.templates.find(t => t.name === manualTpl) || {};
    const max = t.max || 6;
    const q = inc.reduce((s, i) => s + (+i.qty || 1), 0);
    const sheets = Math.ceil(q / max);
    return `<div class="ticket"><div class="t"><div class="k">Template</div><div class="v" style="font-size:14px">${PB.esc(manualTpl)}</div></div>
      <div class="t"><div class="k">Max printfiles</div><div class="v">${t.max || '—'}</div></div>
      <div class="t"><div class="k">Selected qty</div><div class="v">${q}</div></div>
      <div class="t"><div class="k">Sheets to create</div><div class="v">${sheets}</div></div></div>
      <div class="hint" style="margin-top:10px">${q ? `Done → creates <b>${sheets}</b> sheet${sheets !== 1 ? 's' : ''} / batch${sheets !== 1 ? 'es' : ''} · ${max} printfiles per sheet.` : 'Scan items to build the manual sheet.'}</div>`;
  }

  const COLS = ['Source ID', 'Component', 'Item', 'Partner', 'Created', '', 'Model', 'Casetype', 'Qty', 'Print SKU', 'Batch Rule', 'Shipped', 'Manifest', 'HAWB'];

  const distinct = field => [...new Set(PB.state.scanned.map(s => s[field]).filter(Boolean))].sort();
  const distinctDates = () => [...new Set(PB.state.scanned.map(s => PB.fmt.date(s.created_date)).filter(Boolean))].sort();
  function filteredScanned() {
    const ql = fq.trim().toLowerCase();
    return PB.state.scanned.filter(s => {
      if (fMdl.length && !fMdl.includes(s.model)) return false;
      if (fCse.length && !fCse.includes(s.case_type)) return false;
      if (fDate.length && !fDate.includes(PB.fmt.date(s.created_date))) return false;
      if (ql) { const hay = [s.source_id, s.component_barcode, s.item_barcode, s.print_sku, s.model, s.case_type, s.partner].filter(Boolean).join(' ').toLowerCase(); if (!hay.includes(ql)) return false; }
      return true;
    });
  }
  function reconcileFilters() {   // drop filter picks that no longer exist among the scanned items (multi-select arrays)
    fMdl = fMdl.filter(x => distinct('model').includes(x));
    fCse = fCse.filter(x => distinct('case_type').includes(x));
    fDate = fDate.filter(x => distinctDates().includes(x));
  }
  function pruneSel() { const vis = new Set(filteredScanned().map(keyOf)); [...sel].forEach(k => { if (!vis.has(k)) sel.delete(k); }); }  // keep selection scoped to visible rows
  function filterBar() {
    const dM = distinct('model'), dC = distinct('case_type'), dD = distinctDates();
    fMdl = fMdl.filter(x => dM.includes(x)); fCse = fCse.filter(x => dC.includes(x)); fDate = fDate.filter(x => dD.includes(x));  // drop stale picks
    return `<div class="grid-toolbar" style="padding:0 16px 12px;margin:0">
      <div class="qf"><span class="qf-ic">⌕</span><input id="scanSearch" aria-label="Search scanned items" placeholder="Search source, barcode, SKU, model…" value="${PB.esc(fq)}"></div>
      <div class="dd-mount" id="dd_sm" style="width:175px;flex:none"></div>
      <div class="dd-mount" id="dd_sc" style="width:195px;flex:none"></div>
      <div class="dd-mount" id="dd_sd" style="width:160px;flex:none"></div>
      <button class="btn ghost sm" id="fClear">Clear filters</button>
    </div>`;
  }

  function resultsTable() {
    if (!PB.state.scanned.length) return '<div class="empty">No scans yet. Use “Simulate scan”, type a barcode, or Bulk add.</div>';
    const rows = filteredScanned(), total = PB.state.scanned.length;
    const note = rows.length < total ? `<div class="page-sub" style="padding:8px 16px 0">Showing ${rows.length} of ${total} (filters applied)</div>` : '';
    if (!rows.length) return note + '<div class="empty">No items match your search / filters.</div>';
    const allSel = rows.every(s => sel.has(keyOf(s)));
    return note + `<div class="ntable-wrap" style="border:0;border-radius:0"><table class="ntable">
      <thead><tr><th><input type="checkbox" id="selAll" ${allSel ? 'checked' : ''} aria-label="Select all"></th>${COLS.map(c => `<th>${c}</th>`).join('')}<th></th></tr></thead><tbody>
      ${rows.map(s => {
        const r = withRule(s)._rule, k = keyOf(s);
        return `<tr>
          <td><input type="checkbox" class="rowsel" data-sel="${PB.esc(k)}" ${sel.has(k) ? 'checked' : ''} aria-label="Select ${PB.esc(s.source_id || '')}"></td>
          <td><b class="mono">${PB.esc(s.source_id || '—')}</b>${s._upload ? ' <span class="badge info">test file</span>' : s._manual ? ' <span class="badge live">manual</span>' : ''}${s.is_reprint ? ' <span class="badge warn">reprint</span>' : ''}</td>
          <td class="mono">${PB.esc(s.component_barcode || '—')}</td>
          <td class="mono">${PB.esc(s.item_barcode || '—')}</td>
          <td>${PB.esc(s.partner || '—')}</td>
          <td>${PB.esc(PB.fmt.date(s.created_date))}</td>
          <td><div class="thumb" title="${PB.esc(s._fileName || s.print_sku || '')}" style="${PB.thumbStyle(s)}"></div></td>
          <td>${PB.esc(s.model || '—')}</td>
          <td><span class="case-dot" style="background:${PB.classColor(PB.caseClass(s.case_type))}"></span> ${PB.esc(s.case_type || '—')}</td>
          <td class="num">${mode === 'manual'
            ? `<input class="input" style="width:64px;min-height:30px;padding:4px 8px;text-align:right" data-qty="${PB.esc(k)}" value="${s.qty || 1}">`
            : (s.qty || 1)}</td>
          <td class="mono">${PB.esc(s.print_sku || '—')}</td>
          <td>${s._upload ? '<span class="page-sub">test print</span>' : r ? PB.esc(r.name) : '<span class="badge warn">no rule</span>'}</td>
          <td>${PB.esc(PB.fmt.date(s.shipped_date))}</td>
          <td>${PB.esc(s.manifest || '—')}</td>
          <td>${PB.esc(s.hawb || '—')}</td>
          <td><button class="btn ghost sm" type="button" data-del="${PB.esc(k)}" title="Remove from list" aria-label="Remove ${PB.esc(s.source_id || 'item')}" style="color:var(--err)">✕</button></td>
        </tr>`; }).join('')}</tbody></table></div>`;
  }

  function renderResults() { pruneSel(); const el = PB.qs('#scanResults'); if (!el) return; el.innerHTML = resultsTable(); wireRows(); updateBulkUI(); }
  function updateBulkUI() {
    const acts = PB.qs('#scanActions');
    if (acts) { acts.innerHTML = sel.size ? `<button class="btn outline sm" id="delSel" style="color:var(--err)">🗑 Delete selected (${sel.size})</button>` : ''; const d = PB.qs('#delSel'); if (d) d.onclick = deleteSelected; }
    const sa = PB.qs('#selAll'); if (sa) { const rows = filteredScanned(); sa.checked = rows.length > 0 && rows.every(s => sel.has(keyOf(s))); }
  }
  function deleteSelected() {
    if (!sel.size) return;
    const keep = [];
    PB.state.scanned.forEach(s => { if (sel.has(keyOf(s))) { toPool(s); } else keep.push(s); });
    const n = PB.state.scanned.length - keep.length; PB.state.scanned = keep; sel.clear();
    PB.save(); PB.toast(n + ' removed', 'warn'); rootRender(PB.qs('#view'));
  }
  function wireRows() {
    const box = PB.qs('#scanResults'); if (!box) return;
    const sa = PB.qs('#selAll'); if (sa) sa.onclick = () => { filteredScanned().forEach(s => sa.checked ? sel.add(keyOf(s)) : sel.delete(keyOf(s))); PB.qsa('.rowsel', box).forEach(cb => cb.checked = sa.checked); updateBulkUI(); };
    PB.qsa('.rowsel', box).forEach(cb => cb.onclick = () => { const k = cb.dataset.sel; cb.checked ? sel.add(k) : sel.delete(k); updateBulkUI(); });
    PB.qsa('[data-del]', box).forEach(b => b.onclick = () => {
      const k = b.dataset.del, i = PB.state.scanned.findIndex(s => keyOf(s) === k); if (i < 0) return;
      toPool(PB.state.scanned[i]);
      PB.state.scanned.splice(i, 1); sel.delete(k); PB.save(); rootRender(PB.qs('#view'));
    });
    PB.qsa('[data-qty]', box).forEach(inp => inp.onchange = () => { const it = PB.state.scanned.find(s => keyOf(s) === inp.dataset.qty); if (it) it.qty = Math.max(1, +inp.value || 1); PB.save(); rootRender(PB.qs('#view')); });
  }

  /* ---- scanning ---- */
  function flash(ok) { const b = PB.qs('#scanbox'); if (!b) return; b.classList.add(ok ? 'flash-ok' : 'flash-err');
    setTimeout(() => b.classList.remove('flash-ok', 'flash-err'), 500); PB.feedback(ok); }

  function doScan(code) {
    code = (code || '').trim(); if (!code) return;
    let it = PB.state.pool.find(p => [p.component_barcode, p.item_barcode, p.source_id].some(x => (x || '').toLowerCase() === code.toLowerCase()));
    if (!it) { // accept print-code or simulate-from-pool match
      it = PB.state.pool.find(p => (p.print_sku || '').toLowerCase() === code.toLowerCase());
    }
    if (!it) { flash(false); PB.toast('No matching item for ' + code, 'err'); return; }
    addItem(it);
  }
  function addItem(it) {
    PB.state.pool = PB.state.pool.filter(p => p !== it);
    // automatic-scan reprint = source #4: tag so the reprint rules segregate it; it still waits for "Create batches"
    const rp = (mode === 'auto' && scanReprint) ? { is_reprint: true, source: 'reprint', reprint_source: 'scan' } : {};
    PB.state.scanned.unshift({ ...it, ...rp, added_at: new Date().toISOString(), _rowId: newRowId(), _rule: PB.resolveRule(it), include: true, _manual: mode === 'manual' });
    PB.save(); flash(true);
    rootRender(PB.qs('#view'));
    const si = PB.qs('#scanInput'); if (si) si.focus();
  }
  PB.scanItem = doScan;

  // build manual sheets from items, qty-aware: each unit of qty is one printfile slot, sliced per template.max
  // (matches manualPreview's ceil(sum(qty)/max) promise instead of slicing by row count)
  function makeManualSheets(items) {
    const t = PB.state.templates.find(t => t.name === manualTpl) || { max: 6 };
    const max = t.max || 6;
    const slots = items.flatMap(it => Array.from({ length: Math.max(1, +it.qty || 1) }, () => ({ ...it, qty: 1 })));
    let n = 0, first = true;
    while (slots.length) {
      const slice = slots.splice(0, max);
      const rule = { id: 'manual', name: 'Manual — ' + manualTpl, template: manualTpl, filterModel: false, filterCase: false, exact: false };
      const b = PB.mkBatch(rule, slice, 'manual', first && manualName ? manualName : null); first = false;
      b.model = 'Multi Model'; b.case_type = 'Multi Casetype'; if (manualCode) b.printCode = manualCode;
      PB.state.batches.unshift(b); n++;
    }
    return n;
  }
  function createBatches() {
    const inc = PB.state.scanned.map(withRule);
    if (!inc.length) return;
    // route per item — never let an upload/test row reach the auto pipeline, never force a real auto scan into a manual sheet
    const manualItems = inc.filter(isManual);
    const autoItems = inc.filter(s => !isManual(s));
    let nBatches = 0, nBuckets = 0, nSheets = 0;
    let nOrphans = 0;
    if (autoItems.length) {
      // route through PB.ingest — the SAME top-up path the Orders/Bulk/reprint auto-flows use, so a Direct scan
      // merges into a matching open bucket instead of minting a duplicate-key bucket. Rule-less items → pool.
      const made = PB.ingest(autoItems, { auto: true });
      nBatches = made.batches.length; nBuckets = made.buckets.length; nOrphans = made.pooled;
    }
    if (manualItems.length) nSheets = makeManualSheets(manualItems);
    const parts = [];
    if (nSheets) parts.push(`${nSheets} manual sheet${nSheets !== 1 ? 's' : ''}`);
    if (nBatches) parts.push(`${nBatches} batch${nBatches !== 1 ? 'es' : ''} closed`);
    if (nBuckets) parts.push(`${nBuckets} to bucket`);
    if (nOrphans) parts.push(`${nOrphans} returned to pool (no rule)`);
    PB.toast(parts.length ? parts.join(' · ') : 'Nothing to batch', parts.length ? 'ok' : 'warn');
    PB.state.scanned = []; sel.clear();
    PB.save(); PB.refreshNav();
    PB.go((nSheets || nBatches) ? 'batches' : (PB.state.buckets.length ? 'buckets' : 'batches'));
  }

  function openBulk() {
    PB.drawer.open('Bulk add', `
      <div class="field"><label>Paste component barcodes, item barcodes or order IDs (one per line)</label>
        <textarea class="input" id="bulkText" rows="8" placeholder="B431BD5335&#10;#5075845&#10;…"></textarea></div>
      <div class="hint" style="margin-bottom:14px">For a multi-item order, all of its items are added.</div>
      <button class="btn primary block" id="bulkGo">Add to scan list</button>`);
    PB.qs('#bulkGo').onclick = () => {
      const lines = (PB.qs('#bulkText').value || '').split(/\s*[\n,]\s*/).filter(Boolean);
      let added = 0;
      lines.forEach(code => { const matches = PB.state.pool.filter(p =>
        [p.component_barcode, p.item_barcode, p.source_id, p.print_sku].some(x => (x || '').toLowerCase() === code.toLowerCase()));
        (matches.length ? matches : []).forEach(it => { addItemSilent(it); added++; }); });
      PB.drawer.close(); PB.toast(added ? added + ' items added' : 'No matches found', added ? 'ok' : 'warn');
      rootRender(PB.qs('#view'));
    };
  }
  function addItemSilent(it) { PB.state.pool = PB.state.pool.filter(p => p !== it);
    // mirror addItem's reprint tagging so Bulk-add honours the auto-mode 'Reprint scan' toggle (source #4)
    const rp = (mode === 'auto' && scanReprint) ? { is_reprint: true, source: 'reprint', reprint_source: 'scan' } : {};
    PB.state.scanned.unshift({ ...it, ...rp, added_at: new Date().toISOString(), _rowId: newRowId(), _rule: PB.resolveRule(it), include: true, _manual: mode === 'manual' }); PB.save(); }

  /* ---- upload design/colour test files: each file → a "test print" item batched per the template ---- */
  function openUpload() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.multiple = true;
    inp.accept = 'image/*,.pdf,.svg,.eps,.ai,.tif,.tiff,.psd';
    inp.onchange = () => {
      const files = [...(inp.files || [])]; if (!files.length) return;   // upload is Manual-mode only (button hidden in Automatic)
      let pending = files.length;
      const done = (f, dataUrl) => { addUploadItem(f, dataUrl); if (--pending === 0) finishUpload(files.length); };
      files.forEach(f => {
        if (/^image\//.test(f.type)) { const rd = new FileReader(); rd.onload = () => done(f, rd.result); rd.onerror = () => done(f, null); rd.readAsDataURL(f); }
        else done(f, null);   // non-image (PDF/AI/EPS…): no inline preview, falls back to a colour swatch
      });
    };
    inp.click();
  }
  function addUploadItem(f, dataUrl) {
    const id = _rid++;
    const base = String(f.name || ('file-' + id)).replace(/\.[^.]+$/, '');   // strip extension
    PB.state.scanned.unshift({
      source_id: 'TEST-' + base, component_barcode: 'TST' + id, item_barcode: 'TST' + id,
      model: 'Test design', case_type: 'Test print', print_sku: base.toUpperCase(),
      image: dataUrl || null, qty: 1, created_date: new Date().toISOString(), partner: 'test',
      _upload: true, _fileName: f.name, _rowId: newRowId(), _rule: null, include: true, _manual: true,
    });
  }
  function finishUpload(n) {
    PB.save(); PB.refreshNav();
    PB.toast(`${n} test file${n > 1 ? 's' : ''} added — batched per the selected template (manual)`, 'ok');
    rootRender(PB.qs('#view'));
  }

  function wire(v) {
    { const tr = PB.qs('#tgReprint'); if (tr) tr.onclick = () => { scanReprint = !scanReprint; rootRender(v); }; }
    const si = PB.qs('#scanInput'); if (si) { si.focus(); si.onkeydown = e => { if (e.key === 'Enter') { doScan(si.value); si.value = ''; } }; }
    PB.qs('#simScan').onclick = () => { if (!PB.state.pool.length) return PB.toast('Pool empty', 'warn'); addItem(PB.state.pool[Math.floor(Math.random() * Math.min(PB.state.pool.length, 30))]); };
    PB.qsa('[data-scan]', v).forEach(b => b.onclick = () => doScan(b.dataset.scan));
    PB.qs('#bulkBtn').onclick = openBulk;
    { const ub = PB.qs('#uploadBtn'); if (ub) ub.onclick = openUpload; }
    PB.qs('#clearScan').onclick = () => { PB.state.scanned.forEach(toPool); PB.state.scanned = []; sel.clear(); fq = ''; fMdl = []; fCse = []; fDate = []; PB.save(); rootRender(v); };
    PB.qs('#createBtn').onclick = createBatches;
    const tg = (id, key) => { const e = PB.qs(id); if (e) e.onclick = () => { PB.fb[key] = !PB.fb[key]; e.classList.toggle('on'); if (key === 'sound') PB.beep(true); }; };
    tg('#tgSound', 'sound'); tg('#tgHaptic', 'haptic');
    if (mode === 'manual') { PB.dropdown(PB.qs('#mTpl'), { options: PB.state.templates.map(t => t.name), value: manualTpl, label: 'template', onChange: val => { manualTpl = val; rootRender(PB.qs('#view')); } });
      const mn = PB.qs('#mName'); if (mn) mn.oninput = () => manualName = mn.value;
      const mc = PB.qs('#mCode'); if (mc) mc.oninput = () => manualCode = mc.value; }
    // scanned-items search + filters
    const ss = PB.qs('#scanSearch'); if (ss) ss.oninput = () => { fq = ss.value; renderResults(); };
    PB.dropdown(PB.qs('#dd_sm'), { multi: true, options: distinct('model'), values: fMdl, placeholder: 'All models', label: 'model', onChange: x => { fMdl = x; renderResults(); } });
    PB.dropdown(PB.qs('#dd_sc'), { multi: true, options: distinct('case_type'), values: fCse, placeholder: 'All casetypes', label: 'casetype', onChange: x => { fCse = x; renderResults(); } });
    PB.dropdown(PB.qs('#dd_sd'), { multi: true, options: distinctDates(), values: fDate, placeholder: 'All dates', label: 'created date', onChange: x => { fDate = x; renderResults(); } });
    const fcl = PB.qs('#fClear'); if (fcl) fcl.onclick = () => { fq = ''; fMdl = []; fCse = []; fDate = []; rootRender(v); };
    wireRows(); updateBulkUI();
  }

  // two entry surfaces from the second bar: Reprints = automatic batching, Manual upload = manual batching
  PB.view('reprints', v => { mode = 'auto';   rootRender(v); });
  PB.view('manual',   v => { mode = 'manual'; rootRender(v); });
})();
