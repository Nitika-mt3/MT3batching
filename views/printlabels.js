/* Quick Actions → Print Labels. Bulk (re)print batch labels / greensheets: pick batches (tick or scan),
   choose output (2×1 label | greensheet) + a label printer, then print — each print logs to the batch's
   activity history (same PB.logActivity the single-batch actions use in views/batches.js). */
(function () {
  let output = 'label';        // 'label' | 'greensheet'
  let printer = null;
  const picked = new Set();    // batch ids chosen to print

  const printable = () => PB.state.batches.filter(b => b.status === 'live' || b.status === 'complete');

  PB.view('printlabels', (v) => {
    if (printer == null) printer = (PB.labelPrinters()[0] || { name: 'ZDesigner ZD421' }).name;
    render(v);
  });

  function updateHead() {
    const c = PB.qs('#plCount'); if (c) c.textContent = `${picked.size} of ${printable().length} selected`;
    const p = PB.qs('#plPrint'); if (p) { p.disabled = !picked.size; p.textContent = `🖨 Print ${output === 'greensheet' ? 'greensheets' : 'labels'} (${picked.size})`; }
  }

  function render(v) {
    const rows = printable();
    [...picked].forEach(id => { if (!rows.some(b => b.id === id)) picked.delete(id); });   // drop stale picks
    const labels = PB.labelPrinters();
    v.innerHTML = PB.pageHead({ title: 'Print Labels', sub: 'Bulk (re)print batch labels & greensheets — tick or scan batches, pick a printer, print. Every print is logged to the batch’s activity history.' })
      + `<div class="card pad" style="margin-bottom:14px">
          <div class="form-row" style="gap:16px;flex-wrap:wrap;align-items:flex-end">
            <div class="field" style="margin:0"><label>Output</label>
              <div class="seg" id="plOut">
                <button class="${output === 'label' ? 'active' : ''}" data-out="label">2×1 label</button>
                <button class="${output === 'greensheet' ? 'active' : ''}" data-out="greensheet">Greensheet</button>
              </div></div>
            <div class="field" style="margin:0;min-width:220px"><label>Label / greensheet printer</label><div class="dd-mount" id="plPrinter"></div></div>
            <div class="field" style="margin:0;flex:1;min-width:220px"><label>Scan / type a batch # or barcode to add</label>
              <input class="input" id="plScan" placeholder="e.g. 500012 or PB-500012" autocomplete="off"></div>
          </div>
          <div class="hint" style="margin-top:8px">Operating as <b>${PB.esc(PB.operator)}</b> · ${labels.length ? labels.length + ' label printer(s) available' : 'no label printer configured — add one in Setup → Printers'}</div>
        </div>
        <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:8px">
          <b id="plCount">${picked.size} of ${rows.length} selected</b>
          <div class="row" style="gap:8px">
            <button class="btn ghost sm" id="plAll">Select all</button>
            <button class="btn ghost sm" id="plNone">Clear</button>
            <button class="btn primary" id="plPrint" ${picked.size ? '' : 'disabled'}>🖨 Print ${output === 'greensheet' ? 'greensheets' : 'labels'} (${picked.size})</button>
          </div>
        </div>
        <div id="grid"></div>`;

    PB.qsa('[data-out]', v).forEach(b => b.onclick = () => { output = b.dataset.out; render(v); });
    if (labels.length) PB.dropdown(PB.qs('#plPrinter'), { options: labels.map(p => p.name), value: printer, label: 'printer', onChange: x => printer = x });
    else PB.qs('#plPrinter').innerHTML = '<span class="page-sub">ZDesigner ZD421 (default)</span>';
    const sc = PB.qs('#plScan'); if (sc) sc.onkeydown = e => { if (e.key === 'Enter') { addByScan(sc.value.trim()); sc.value = ''; render(v); } };
    PB.qs('#plAll').onclick = () => { rows.forEach(b => picked.add(b.id)); render(v); };
    PB.qs('#plNone').onclick = () => { picked.clear(); render(v); };
    PB.qs('#plPrint').onclick = () => doPrint(v);

    const cols = [
      { headerName: '', minWidth: 44, maxWidth: 44, sortable: false, filter: false, cellRenderer: p => `<input type="checkbox" data-pick="${PB.esc(p.data.id)}" ${picked.has(p.data.id) ? 'checked' : ''} aria-label="Pick batch ${PB.esc(p.data.number)}">` },
      { headerName: 'Batch', field: 'number', minWidth: 120, cellRenderer: p => `<b class="mono">${PB.esc(p.value)}</b>` },
      { headerName: 'Barcode', field: 'barcode', minWidth: 120, cellRenderer: p => `<span class="mono">${PB.esc(p.value || '—')}</span>` },
      { headerName: 'Batched by', flex: 2, minWidth: 220, valueGetter: p => PB.batchByText(p.data), cellRenderer: p => PB.batchByHtml(p.data) },
      { headerName: 'Template', field: 'template', minWidth: 150 },
      { headerName: 'Qty', field: 'qty', maxWidth: 80, type: 'numericColumn' },
      { headerName: 'Status', field: 'status', maxWidth: 110, cellRenderer: p => `<span class="cell-tag ${p.value === 'live' ? 'live' : 'ok'}">${PB.esc(p.value)}</span>` },
    ];
    PB.grid(PB.qs('#grid'), cols, rows, {
      tall: true, gridKey: 'printlabels', searchPlaceholder: 'Filter batches…', colFilters: true,
      emptyText: 'No live or complete batches to print.',
      card: b => `<div class="card pad"><label class="row" style="gap:10px;align-items:center;cursor:pointer">
        <input type="checkbox" data-pick="${PB.esc(b.id)}" ${picked.has(b.id) ? 'checked' : ''}>
        <div style="flex:1;min-width:0"><b class="mono">${PB.esc(b.number)}</b><div class="page-sub">${PB.esc(b.template)} · ${b.qty} up</div></div></label></div>`
    });
    PB.qs('#grid').addEventListener('click', e => {
      const cb = e.target.closest('[data-pick]'); if (!cb) return; e.stopPropagation();
      cb.checked ? picked.add(cb.dataset.pick) : picked.delete(cb.dataset.pick); updateHead();
    });
  }

  function addByScan(q) {
    if (!q) return; const ql = q.toLowerCase(); const pool = printable();
    const b = pool.find(x => String(x.number).toLowerCase() === ql || String(x.barcode || '').toLowerCase() === ql)
      || pool.find(x => String(x.number).toLowerCase().includes(ql) || String(x.barcode || '').toLowerCase().includes(ql));
    if (!b) { PB.toast('No live/complete batch matches “' + q + '”', 'warn'); return; }
    picked.add(b.id); PB.toast('Added batch ' + b.number, 'info');
  }

  function doPrint(v) {
    const chosen = [...picked].map(id => PB.state.batches.find(b => b.id === id)).filter(Boolean);
    if (!chosen.length) return;
    const action = output === 'greensheet' ? 'greensheet_printed' : 'label_printed';
    chosen.forEach(b => PB.logActivity(b, action, { printer }));   // logs who + account + printer + at, and saves
    PB.toast(`${chosen.length} ${output === 'greensheet' ? 'greensheet' : 'label'}${chosen.length > 1 ? 's' : ''} sent to ${printer} · logged`, 'ok');
    picked.clear(); render(v);
  }
})();
