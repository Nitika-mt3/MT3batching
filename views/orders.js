/* Inputs → Orders. Also defines the shared PB.inputsPage used by Amazon Bulk.
   An orders LEDGER: one row per order item across pool (waiting / needs-a-rule) + buckets (bucketed) + batches
   (batched, with its Batch #). Sync → auto-batch waiting orders (PB.ingest); per-row/bulk Reprint → auto-batch. */
(function () {
  const tabState = {};   // remember the active tab per page (orders / bulk) across re-renders

  const statusCell = it => it.shipped_date
    ? `<span class="cell-tag ok" title="Shipped ${PB.esc(PB.fmt.date(it.shipped_date))}">Shipped</span>`
    : `<span class="cell-tag live">Live</span>`;
  const thumb = it => `<div class="thumb" title="${PB.esc(it.print_sku || '')}" style="${PB.swatch(it.print_sku || it.sku || it.source_id)};width:34px;height:34px;border-radius:6px"></div>`;
  const ruleCell = it => it._state === 'needsRule'
    ? `<span class="badge warn" title="No batch rule matches this item — create one to batch it">⚠ No rule</span>`
    : (it._ruleName ? `<span>${PB.esc(it._ruleName)}</span>` : `<span style="color:var(--muted)">—</span>`);
  const batchCell = it => it._batchNo
    ? `<a href="${PB.link('batches', it._batchId)}" class="cell-link mono">${PB.esc(it._batchNo)}</a>`
    : `<span style="color:var(--muted)">—</span>`;

  // Shared ledger page (Orders + Amazon Bulk). cfg: { route, title, sub, dataFilter, reprintSub, syncText, batchSelText, emptyText, footNote }
  PB.inputsPage = function (v, cfg) {
    const inCh = it => cfg.dataFilter(it);
    // build one row per order item across the whole system; rows are WRAPPERS (keep __ref to the real object for sync)
    function ledger() {
      const out = [];
      // wrapper rows only — never mutate the underlying pool/bucket/batch object (a stamped _uid would persist on
      // batch/bucket items). The per-render _uid maps the Reprint button back to its row within THIS render's rows.
      const push = (it, meta) => { out.push(Object.assign({ ...it }, meta, { _uid: PB.uid(), __ref: it })); };
      (PB.state.pool || []).forEach(it => { if (!inCh(it)) return; const r = PB.resolveRule(it);
        push(it, { _state: r ? 'waiting' : 'needsRule', _ruleName: r ? r.name : '', _batchNo: '', _batchId: '' }); });
      (PB.state.scanned || []).forEach(it => { if (!inCh(it)) return; const r = it._upload ? null : PB.resolveRule(it);   // staged on Direct
        push(it, { _state: 'staged', _ruleName: it._upload ? 'Test print' : (r ? r.name : ''), _batchNo: '', _batchId: '' }); });
      (PB.state.buckets || []).forEach(b => (b.items || []).forEach(it => { if (!inCh(it)) return;
        push(it, { _state: 'bucketed', _ruleName: b.rule || '', _batchNo: '', _batchId: '' }); }));
      (PB.state.batches || []).forEach(b => (b.items || []).forEach(it => { if (!inCh(it)) return;
        push(it, { _state: 'batched', _ruleName: b.rule || '', _batchNo: b.number, _batchId: b.id }); }));
      return out;
    }

    const TABS = [
      { key: 'all', label: 'All', match: () => true },
      { key: 'waiting', label: 'Waiting', match: r => r._state === 'waiting' || r._state === 'bucketed' || r._state === 'staged' },
      { key: 'needsRule', label: 'Needs a rule', match: r => r._state === 'needsRule' },
      { key: 'batched', label: 'Batched', match: r => r._state === 'batched' },
    ];
    let tab = tabState[cfg.route] || 'all';

    const cols = [
      { headerName: '', checkboxSelection: true, headerCheckboxSelection: true, width: 46, maxWidth: 46, minWidth: 46, sortable: false, filter: false, resizable: false, flex: 0 },
      { headerName: 'Source', minWidth: 150, valueGetter: p => PB.sourceText(p.data), cellRenderer: p => PB.sourceChip(p.data) },
      { headerName: 'Order #', field: 'source_id', minWidth: 120, cellRenderer: p => `<b class="mono">${PB.esc(p.value || '—')}</b>` },
      { headerName: 'Printfile', maxWidth: 90, minWidth: 80, sortable: false, filter: false, cellRenderer: p => thumb(p.data) },
      { headerName: 'Print SKU', field: 'print_sku', minWidth: 120, cellRenderer: p => `<span class="mono">${PB.esc(p.value || '—')}</span>` },
      { headerName: 'SKU', field: 'sku', minWidth: 140, cellRenderer: p => `<span class="mono">${PB.esc(p.value || '—')}</span>` },
      { headerName: 'Model', field: 'model', minWidth: 120 },
      { headerName: 'Casetype', field: 'case_type', minWidth: 130 },
      { headerName: 'Rule', minWidth: 150, valueGetter: p => p.data._state === 'needsRule' ? 'No rule' : (p.data._ruleName || ''), cellRenderer: p => ruleCell(p.data) },
      { headerName: 'Batch #', minWidth: 110, valueGetter: p => p.data._batchNo || '', cellRenderer: p => batchCell(p.data) },
      { headerName: 'Status', maxWidth: 100, valueGetter: p => p.data.shipped_date ? 'Shipped' : 'Live', cellRenderer: p => statusCell(p.data) },
      { headerName: 'Order date', field: 'created_date', minWidth: 120, valueFormatter: p => PB.fmt.date(p.value) },
      { headerName: '', minWidth: 96, maxWidth: 110, sortable: false, filter: false, cellRenderer: p => `<button class="btn ghost sm" data-rp="${PB.esc(p.data._uid)}">⟲ Reprint</button>` },
    ];

    const cardFn = it => `<div class="card pad"><div class="row" style="gap:10px;align-items:center">
        ${thumb(it)}
        <div style="flex:1;min-width:0">
          <div class="row" style="justify-content:space-between"><b class="mono">${PB.esc(it.source_id || '—')}</b>${PB.sourceChip(it)}</div>
          <div class="page-sub">${PB.esc(it.model || '')} · ${PB.esc(it.case_type || '')} · ${PB.esc(it.print_sku || '')}</div>
          <div class="page-sub" style="margin-top:2px">${ruleCell(it)} · Batch ${batchCell(it)} · ${statusCell(it)}</div>
          <div class="row" style="gap:8px;margin-top:8px"><button class="btn ghost sm" data-rp="${PB.esc(it._uid)}">⟲ Reprint</button></div>
        </div></div></div>`;

    // ---------- render ----------
    let api = null;
    function tabRows(all) { const t = TABS.find(x => x.key === tab) || TABS[0]; return all.filter(t.match); }

    function render() {
      if (api && api.destroy) { try { api.destroy(); } catch (e) {} }   // tear down the prior grid (frees its column-filter document listeners) before rebuilding
      const all = ledger();
      const counts = {}; TABS.forEach(t => counts[t.key] = all.filter(t.match).length);
      v.innerHTML = PB.pageHead({ title: cfg.title, sub: cfg.sub, actions: `<button class="btn primary" id="ipSync">${cfg.syncText}</button>` })
        + `<div class="tabs">${TABS.map(t => `<button class="tab ${tab === t.key ? 'active' : ''}" data-tab="${t.key}">${t.label}<span class="cnt">${counts[t.key]}</span></button>`).join('')}</div>
           <div class="card mergebar" id="ipSelBar" style="margin-bottom:14px;display:none"></div>
           <div id="grid"></div>
           <p class="page-sub" style="margin-top:10px">${cfg.footNote || ''}</p>`;

      PB.qsa('[data-tab]', v).forEach(b => b.onclick = () => { tab = b.dataset.tab; tabState[cfg.route] = tab; render(); });

      const data = tabRows(all);
      const emptyText = tab === 'needsRule' ? 'No unmatched orders — every waiting order has a rule.'
        : tab === 'batched' ? 'No batched orders yet.'
        : (cfg.emptyText || 'Nothing here.');
      api = PB.grid(PB.qs('#grid'), cols, data, {
        tall: true, pageSize: 25, search: true, colFilters: true, gridKey: cfg.route, emptyText,
        rowSelection: 'multiple', gridOptions: { suppressRowClickSelection: true },
        onSelectionChanged: e => updateSelBar(e.api), card: cardFn,
      });

      PB.qs('#ipSync').onclick = () => { const sel = api.getSelectedRows(); syncOrders(sel.length ? sel : all); };
      PB.qs('#grid').addEventListener('click', e => {
        const r = e.target.closest('[data-rp]'); if (!r) return; e.stopPropagation();
        const row = all.find(x => x._uid === r.dataset.rp); if (row) reprint([row]);
      });
      PB.refreshNav();
    }

    // ---- sync: only WAITING pool orders that have a rule; report the ones skipped for having no rule ----
    function syncOrders(list) {
      const waiting = list.filter(r => r._state === 'waiting' && r.__ref);
      const skipped = list.filter(r => r._state === 'needsRule').length;
      if (!waiting.length) { PB.toast(skipped ? `${skipped} order${skipped > 1 ? 's' : ''} need a rule before they can batch` : 'No waiting orders to sync', skipped ? 'warn' : 'info'); return; }
      const refs = waiting.map(r => r.__ref); const set = new Set(refs);
      PB.state.pool = (PB.state.pool || []).filter(it => !set.has(it));   // leave the intake pool → into batching (by object identity)
      const made = PB.ingest(refs, { auto: true });
      const extra = skipped ? ` · ${skipped} need a rule` : '';
      PB.toast(`Synced ${refs.length} order${refs.length > 1 ? 's' : ''} → ${made.batches.length} batch${made.batches.length !== 1 ? 'es' : ''}, ${made.buckets.length} bucket${made.buckets.length !== 1 ? 's' : ''}${extra}`, 'ok');
      render();
    }

    // ---- reprint: clone the underlying order as a reprint of this channel's sub-source → auto-batch ----
    function reprint(rows) {
      if (!rows.length) return;
      const rps = rows.map(r => PB.makeReprint(r.__ref || r, cfg.reprintSub));
      const made = PB.ingest(rps, { auto: true });
      const parts = [`${made.batches.length} batch${made.batches.length !== 1 ? 'es' : ''}`, `${made.buckets.length} bucket${made.buckets.length !== 1 ? 's' : ''}`];
      if (made.pooled) parts.push(`${made.pooled} need a rule`);
      PB.toast(`Reprint × ${rps.length} → ${parts.join(', ')}`, made.pooled ? 'warn' : 'ok');
      render();
    }

    // ---- selection action bar ----
    function updateSelBar(gapi) {
      const bar = PB.qs('#ipSelBar'); if (!bar) return;
      const chosen = gapi.getSelectedRows();
      if (!chosen.length) { bar.style.display = 'none'; return; }
      const waitN = chosen.filter(r => r._state === 'waiting').length;
      bar.style.display = '';
      bar.innerHTML = `<div class="card-head" style="border:0">
          <b>${chosen.length} selected · ${chosen.reduce((s, it) => s + (+it.qty || 1), 0)} units</b>
          <div class="spacer" style="flex:1"></div>
          <button class="btn primary" id="ipBatchSel" ${waitN ? '' : 'disabled'} title="${waitN ? '' : 'Only waiting orders with a rule can be batched'}">⚡ ${cfg.batchSelText} (${waitN})</button>
          <button class="btn outline sm" id="ipRpSel">⟲ Reprint selected (${chosen.length})</button>
          <button class="btn ghost sm" id="ipClrSel">clear</button></div>`;
      const b = PB.qs('#ipBatchSel'); if (b) b.onclick = () => syncOrders(chosen);
      const rp = PB.qs('#ipRpSel'); if (rp) rp.onclick = () => reprint(chosen);
      const c = PB.qs('#ipClrSel'); if (c) c.onclick = () => gapi.deselectAll();
    }

    render();
  };

  PB.view('orders', (v) => PB.inputsPage(v, {
    route: 'orders', reprintSub: 'orders',
    title: 'Orders',
    sub: 'Order ledger — new & reprint orders, what rule batches each, and which batch it landed in. Sync auto-batches waiting orders per the rules.',
    dataFilter: it => !String(it.sku || '').toUpperCase().startsWith('AMZ-'),
    syncText: '⟳ Sync new orders → auto-batch',
    batchSelText: 'Batch selected',
    emptyText: 'No orders here.',
    footNote: 'New orders auto-batch on sync; items with no matching rule wait in “Needs a rule”. Reprints from this page are reprint source #2 (Orders page) → auto-batched, separate from new orders.',
  }));
})();
