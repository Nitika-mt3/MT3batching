/* Current Work → a class-filtered queue of in-flight work: waiting pool + open buckets + live batches whose
   items match the chosen product/case class (HP "Current Work" filters). The sidebar links here as #/work/<class>. */
(function () {
  PB.view('work', (v, param) => {
    const cls = PB.WORK_FILTERS.includes(param) ? param : PB.WORK_FILTERS[0];
    const match = PB.workMatch[cls];
    const rows = [];
    const push = (it, where, extra) => { if (match(it)) rows.push(Object.assign({}, it, { _where: where }, extra || {})); };
    (PB.state.pool || []).forEach(it => push(it, PB.resolveRule(it) ? 'Pool · waiting' : 'Pool · needs a rule'));
    (PB.state.buckets || []).forEach(b => (b.items || []).forEach(it => push(it, 'Bucket · ' + (b.rule || ''))));
    (PB.state.batches || []).forEach(b => { if (b.status === 'void' || b.status === 'archived') return; (b.items || []).forEach(it => push(it, 'Batch ' + b.number, { _batchId: b.id })); });

    const counts = PB.workCounts();
    v.innerHTML = PB.pageHead({ title: 'Current work — ' + cls, sub: `${rows.length} item${rows.length !== 1 ? 's' : ''} in flight · ${cls} class · pool + open buckets + live batches` })
      + `<div class="tabs">${PB.WORK_FILTERS.map(k => `<a class="tab ${k === cls ? 'active' : ''}" href="#/work/${encodeURIComponent(k)}">${PB.esc(k)}<span class="cnt">${counts[k]}</span></a>`).join('')}</div>
        <div id="grid"></div>`;

    const cols = [
      { headerName: 'Source', minWidth: 140, valueGetter: p => PB.sourceText(p.data), cellRenderer: p => PB.sourceChip(p.data) },
      { headerName: 'Order #', field: 'source_id', minWidth: 120, cellRenderer: p => `<b class="mono">${PB.esc(p.value || '—')}</b>` },
      { headerName: 'Print SKU', field: 'print_sku', minWidth: 130, cellRenderer: p => `<span class="mono">${PB.esc(p.value || '—')}</span>` },
      { headerName: 'Model', field: 'model', minWidth: 120 },
      { headerName: 'Casetype', field: 'case_type', minWidth: 130 },
      { headerName: 'Where', field: '_where', minWidth: 170, cellRenderer: p => p.data._batchId ? `<a href="${PB.link('batches', p.data._batchId)}" class="cell-link">${PB.esc(p.value)}</a>` : PB.esc(p.value) },
    ];
    PB.grid(PB.qs('#grid'), cols, rows, {
      tall: true, gridKey: 'work', searchPlaceholder: 'Filter work…', colFilters: true,
      emptyText: `No ${cls} items in the current pool / buckets yet.`,
      card: it => `<div class="card pad"><div class="row" style="justify-content:space-between"><b class="mono">${PB.esc(it.source_id || '—')}</b>${PB.sourceChip(it)}</div>
        <div class="page-sub">${PB.esc(it.model || '')} · ${PB.esc(it.case_type || '')} · ${PB.esc(it.print_sku || '')}</div>
        <div class="page-sub" style="margin-top:2px">${PB.esc(it._where)}</div></div>`
    });
  });
})();
