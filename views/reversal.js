/* Quick Actions → Bulk Batch Reversal. Select multiple batches (tick or scan) → return their items to the
   intake pool (PB.cleanItem, same primitive buckets use) and VOID the batches (kept for audit, with a
   'reversed' history entry). Shipped / already-void / archived batches are excluded. */
(function () {
  const picked = new Set();

  // reversible = live/complete batches with no shipped item
  const reversible = () => PB.state.batches.filter(b =>
    b.status !== 'void' && b.status !== 'archived' && !(b.items || []).some(it => it.shipped_date));
  const itemsIn = ids => [...ids].reduce((s, id) => { const b = PB.state.batches.find(x => x.id === id); return s + ((b && b.items) || []).reduce((a, i) => a + (+i.qty || 1), 0); }, 0);

  PB.view('reversal', (v) => render(v));

  function updateHead() {
    const c = PB.qs('#revCount'); if (c) c.textContent = `${picked.size} batch${picked.size !== 1 ? 'es' : ''} · ${itemsIn(picked)} unit${itemsIn(picked) !== 1 ? 's' : ''} selected`;
    const g = PB.qs('#revGo'); if (g) { g.disabled = !picked.size; g.textContent = `↩ Reverse selected (${picked.size})`; }
  }

  function render(v) {
    const rows = reversible();
    [...picked].forEach(id => { if (!rows.some(b => b.id === id)) picked.delete(id); });
    v.innerHTML = PB.pageHead({ title: 'Bulk Batch Reversal', sub: 'Un-batch in bulk — return the selected batches’ items to the intake pool and void the batches. Shipped batches are excluded; every reversal is logged.' })
      + `<div class="row" style="justify-content:space-between;align-items:center;margin:0 0 8px">
          <b id="revCount">${picked.size} batch${picked.size !== 1 ? 'es' : ''} · ${itemsIn(picked)} unit${itemsIn(picked) !== 1 ? 's' : ''} selected</b>
          <div class="row" style="gap:8px">
            <button class="btn ghost sm" id="revAll">Select all</button>
            <button class="btn ghost sm" id="revNone">Clear</button>
            <button class="btn" id="revGo" style="color:var(--err);border-color:var(--err)" ${picked.size ? '' : 'disabled'}>↩ Reverse selected (${picked.size})</button>
          </div></div>
        <div class="field" style="max-width:360px;margin-bottom:12px"><label>Scan / type a batch # or barcode to add</label>
          <input class="input" id="revScan" placeholder="e.g. 500012 or PB-500012" autocomplete="off"></div>
        <div id="grid"></div>`;

    const sc = PB.qs('#revScan'); if (sc) sc.onkeydown = e => { if (e.key === 'Enter') { addByScan(sc.value.trim()); sc.value = ''; render(v); } };
    PB.qs('#revAll').onclick = () => { rows.forEach(b => picked.add(b.id)); render(v); };
    PB.qs('#revNone').onclick = () => { picked.clear(); render(v); };
    PB.qs('#revGo').onclick = () => doReverse(v);

    const cols = [
      { headerName: '', minWidth: 44, maxWidth: 44, sortable: false, filter: false, cellRenderer: p => `<input type="checkbox" data-pick="${PB.esc(p.data.id)}" ${picked.has(p.data.id) ? 'checked' : ''} aria-label="Pick batch ${PB.esc(p.data.number)}">` },
      { headerName: 'Batch', field: 'number', minWidth: 120, cellRenderer: p => `<b class="mono">${PB.esc(p.value)}</b>` },
      { headerName: 'Batched by', flex: 2, minWidth: 220, valueGetter: p => PB.batchByText(p.data), cellRenderer: p => PB.batchByHtml(p.data) },
      { headerName: 'Template', field: 'template', minWidth: 150 },
      { headerName: 'Items', minWidth: 78, maxWidth: 90, type: 'numericColumn', valueGetter: p => (p.data.items || []).length },
      { headerName: 'Qty', field: 'qty', maxWidth: 80, type: 'numericColumn' },
      { headerName: 'Status', field: 'status', maxWidth: 110, cellRenderer: p => `<span class="cell-tag ${p.value === 'live' ? 'live' : 'ok'}">${PB.esc(p.value)}</span>` },
    ];
    PB.grid(PB.qs('#grid'), cols, rows, {
      tall: true, gridKey: 'reversal', searchPlaceholder: 'Filter batches…', colFilters: true,
      emptyText: 'No reversible batches — shipped, voided & archived batches are excluded.',
      card: b => `<div class="card pad"><label class="row" style="gap:10px;align-items:center;cursor:pointer">
        <input type="checkbox" data-pick="${PB.esc(b.id)}" ${picked.has(b.id) ? 'checked' : ''}>
        <div style="flex:1;min-width:0"><b class="mono">${PB.esc(b.number)}</b><div class="page-sub">${PB.esc(b.template)} · ${(b.items || []).length} items · ${b.qty} up</div></div></label></div>`
    });
    PB.qs('#grid').addEventListener('click', e => {
      const cb = e.target.closest('[data-pick]'); if (!cb) return; e.stopPropagation();
      cb.checked ? picked.add(cb.dataset.pick) : picked.delete(cb.dataset.pick); updateHead();
    });
    updateHead();
  }

  function addByScan(q) {
    if (!q) return; const ql = q.toLowerCase(); const pool = reversible();
    const b = pool.find(x => String(x.number).toLowerCase() === ql || String(x.barcode || '').toLowerCase() === ql)
      || pool.find(x => String(x.number).toLowerCase().includes(ql) || String(x.barcode || '').toLowerCase().includes(ql));
    if (!b) { PB.toast('No reversible batch matches “' + q + '”', 'warn'); return; }
    picked.add(b.id); PB.toast('Added batch ' + b.number, 'info');
  }

  async function doReverse(v) {
    const chosen = [...picked].map(id => PB.state.batches.find(b => b.id === id)).filter(Boolean);
    if (!chosen.length) return;
    const itemCount = chosen.reduce((s, b) => s + (b.items || []).length, 0);
    if (!(await PB.confirm({
      title: 'Reverse batches', danger: true, confirmText: 'Reverse',
      message: `Return ${itemCount} item${itemCount !== 1 ? 's' : ''} from ${chosen.length} batch${chosen.length !== 1 ? 'es' : ''} to the intake pool and void the batch${chosen.length !== 1 ? 'es' : ''}? This cannot be undone.`
    }))) return;
    let returned = 0;
    chosen.forEach(b => {
      const ids = (b.items || []).map(it => it.component_barcode || it.source_id || '—');
      (b.items || []).forEach(it => { (PB.state.pool = PB.state.pool || []).push(PB.cleanItem(it)); returned++; });
      b.status = 'void'; b.current_event = 'Reversed';
      PB.logActivity(b, 'reversed', { count: (b.items || []).length, items: ids, returnedTo: 'pool' });   // logs + saves (before clearing)
      b.items = []; b.qty = 0;
    });
    PB.save(); picked.clear(); PB.refreshNav();
    PB.toast(`Reversed ${chosen.length} batch${chosen.length !== 1 ? 'es' : ''} · ${returned} item${returned !== 1 ? 's' : ''} returned to pool`, 'ok');
    render(v);
  }
})();
