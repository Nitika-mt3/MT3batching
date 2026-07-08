/* Batches — list (deep-linked) + full detail PAGE at #/batches/:id */
(function () {
  let tab = 'all', dtab = 'summary';

  PB.view('batches', (v, param) => { if (param) return detail(v, param); list(v); });

  /* ---------------- list ---------------- */
  function list(v) {
    const all = PB.state.batches;
    const counts = { all: all.length, live: all.filter(b => b.status === 'live').length, complete: all.filter(b => b.status === 'complete').length, archived: all.filter(b => b.status === 'archived').length };
    const rows = tab === 'all' ? all : all.filter(b => b.status === tab);
    v.innerHTML = PB.pageHead({ title: 'Batches', sub: 'Closed & live batches · download/print the imposed PDF + greensheet' })
      + `<div class="tabs">${['all', 'live', 'complete', 'archived'].map(t => `<button class="tab ${tab === t ? 'active' : ''}" data-tab="${t}">${t[0].toUpperCase() + t.slice(1)}<span class="cnt">${counts[t]}</span></button>`).join('')}</div><div id="grid"></div>`;
    PB.qsa('[data-tab]', v).forEach(b => b.onclick = () => { tab = b.dataset.tab; list(v); });

    const cols = [
      { headerName: 'Batch', field: 'number', minWidth: 130, cellRenderer: p => `<b class="mono">${PB.esc(p.value)}</b>${p.data.mode === 'merge' ? ' <span class="cell-tag merged">merged</span>' : p.data.mode === 'manual' ? ' <span class="cell-tag">manual</span>' : p.data.mode === 'reprint' ? ' <span class="cell-tag">reprint</span>' : ''}` },
      { headerName: 'Source', minWidth: 140, valueGetter: p => PB.sourceText(p.data), cellRenderer: p => PB.rowSourceChip(p.data) },
      { headerName: 'Batched by', flex: 2, minWidth: 240, wrapText: true, autoHeight: true, valueGetter: p => PB.batchByText(p.data), cellRenderer: p => PB.batchByHtml(p.data) },
      { headerName: 'Template', field: 'template', minWidth: 150 },
      { headerName: 'Qty', field: 'qty', maxWidth: 90, type: 'numericColumn' },
      { headerName: 'Status', field: 'status', maxWidth: 120, cellRenderer: p => `<span class="cell-tag ${p.value === 'live' ? 'live' : (p.value === 'archived' || p.value === 'void') ? '' : 'ok'}">${p.value === 'void' ? 'reversed' : p.value}</span>` },
      { headerName: 'Created', field: 'created', minWidth: 120, valueFormatter: p => PB.fmt.ago(p.value) },
      { headerName: 'Actions', minWidth: 210, maxWidth: 260, sortable: false, filter: false, cellRenderer: p => rowActions(p.data.id) },
    ];
    PB.grid(PB.qs('#grid'), cols, rows, {
      tall: true, searchPlaceholder: 'Filter batches…', gridKey: 'batches', colFilters: true, onRowClicked: e => PB.go('batches', e.data.id),
      card: b => `<div class="card pad">
        <a href="${PB.link('batches', b.id)}" style="display:block;text-decoration:none;color:inherit">
          <div class="row" style="justify-content:space-between"><b class="mono">${PB.esc(b.number)}</b><span class="cell-tag ${b.status === 'live' ? 'live' : 'ok'}">${PB.esc(b.status)}</span></div>
          <div style="margin-top:6px">${PB.esc(b.template)}</div>
          <div class="page-sub">${PB.batchByHtml(b)} · ${b.qty} up</div></a>
        <div class="row" style="gap:6px;margin-top:10px">${rowActions(b.id)}</div></div>`
    });
    // per-row actions (PDF / send-to-print / label) — the grid's row-click ignores buttons
    PB.qs('#grid').addEventListener('click', e => {
      const btn = e.target.closest('[data-bact]'); if (!btn) return; e.stopPropagation();
      const b = PB.state.batches.find(x => x.id === btn.dataset.id); if (b) act(btn.dataset.bact, b, () => list(v));
    });
  }

  // written text commands (not tiny icons) — clear labels; full intent in the tooltip
  const ROW_CMDS = [
    ['pdf', 'PDF', 'Download the imposed PDF'],
    ['print', 'Send to print', 'Send the sheet to a press (P6000 / P7000)'],
    ['label', 'Print label', 'Print the 2×1 batch label'],
  ];
  const rowActions = id => `<span class="row-cmds">` + ROW_CMDS.map(([a, txt, tip]) =>
    `<button class="row-cmd" data-bact="${a}" data-id="${PB.esc(id)}" title="${tip}">${txt}</button>`).join('') + `</span>`;

  /* ---------------- detail page ---------------- */
  function detail(v, id) {
    const b = PB.state.batches.find(x => x.id === id || String(x.number) === id);
    if (!b) { v.innerHTML = PB.pageHead({ title: 'Batch not found', back: ['batches'] }) + '<div class="empty">No such batch.</div>'; return; }
    const t = PB.state.templates.find(x => x.name === b.template);
    if (!['summary', 'imposition', 'settings', 'jdf'].includes(dtab)) dtab = 'summary';   // Items tab removed → fall back
    v.innerHTML = PB.pageHead({
      back: ['batches'],
      crumbs: [{ label: 'Batches', route: ['batches'] }, { label: 'Batch ' + b.number }],
      title: `Batch ${PB.esc(b.number)} <span style="vertical-align:middle">${PB.statusChip(b.status)}</span>`,
      sub: `${PB.esc(b.rule)} · ${PB.fmt.dt(b.created)}`,
      actions: `<button class="btn outline" data-act="pdf">⤓ PDF (CMYK)</button>
        <button class="btn primary" data-act="print">🖨 Send to print</button>
        <button class="btn outline" data-act="green">🏷 Greensheet</button>
        <button class="btn outline" data-act="label">2×1 label</button>
        ${b.status !== 'archived' ? '<button class="btn ghost" data-act="archive">Archive</button>' : ''}`
    })
      + `<div class="tabs">${['summary', 'imposition', 'settings', 'jdf'].map(x => `<button class="tab ${dtab === x ? 'active' : ''}" data-d="${x}">${x[0].toUpperCase() + x.slice(1)}</button>`).join('')}</div>
        <div id="dbody"></div>`;

    PB.qsa('[data-d]', v).forEach(x => x.onclick = () => { dtab = x.dataset.d; renderTab(b, t); });
    PB.qsa('[data-act]', v).forEach(x => x.onclick = () => act(x.dataset.act, b, () => detail(v, id)));
    renderTab(b, t);
  }

  function renderTab(b, t) {
    const el = PB.qs('#dbody'); if (!el) return;
    if (dtab === 'summary') el.innerHTML = `
      <div class="detail-grid">
        <div class="card pad">
          <div class="ticket" style="margin-bottom:14px">
            <div class="t"><div class="k">Quantity</div><div class="v">${b.qty}</div></div>
            <div class="t"><div class="k">Template</div><div class="v" style="font-size:13px">${PB.esc(b.template)}</div></div>
            <div class="t"><div class="k">Current event</div><div class="v" style="font-size:13px">${PB.esc(b.current_event || '—')}</div></div>
            <div class="t"><div class="k">Mode</div><div class="v" style="font-size:13px">${b.mode}</div></div>
          </div>
          <dl class="kv">
            <dt>Batched by</dt><dd><span class="case-dot" style="background:${PB.classColor(b.caseClass)}"></span> ${PB.esc(b.model)} · ${PB.esc(b.case_type)}</dd>
            <dt>Rule</dt><dd>${b.ruleId ? `<a href="${PB.link('rules', b.ruleId)}">${PB.esc(b.rule)}</a>` : PB.esc(b.rule)}</dd>
            <dt>Barcode</dt><dd class="mono">${PB.esc(b.barcode)}</dd>
            <dt>Created</dt><dd>${PB.fmt.dt(b.created)}</dd>
          </dl>
        </div>
        <div class="card pad"><h3 class="card-title" style="margin:0 0 10px">Imposed sheet</h3>${miniSheet(t, 240, (b.items || []).length ? b.qty : null)}</div>
      </div>
      <div class="card pad" style="margin-top:16px">
        <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:10px">
          <h3 class="card-title" style="margin:0">Items <span class="cnt">${(b.items || []).length}</span></h3>
          <span id="itemBar"></span>
        </div>
        ${(b.items || []).length ? '<div id="igrid"></div>' : ((b.history || []).length ? '<div class="empty">All items have been removed from this batch.</div>' : '<div class="empty">No item-level detail in the snapshot for this batch.</div>')}
      </div>
      ${(b.history || []).length ? `<div class="card pad" style="margin-top:16px">
        <h3 class="card-title" style="margin:0 0 12px">Activity history <span class="cnt">${b.history.length}</span></h3>
        <ul class="activity">${b.history.map(actItem).join('')}</ul>
      </div>` : ''}`;
    else if (dtab === 'imposition') el.innerHTML = `
      <div class="card pad"><div class="row" style="justify-content:space-between;margin-bottom:12px">
        <b>${PB.esc(b.template)}</b>${t ? `<a class="btn outline sm" href="${PB.link('templates', t.name)}">Open in designer →</a>` : ''}</div>
        ${miniSheet(t, 420, (b.items || []).length ? b.qty : null)}</div>`;
    else if (dtab === 'settings') el.innerHTML = `
      <div class="card pad" style="max-width:560px"><dl class="kv">
        <dt>Greensheet template</dt><dd>Greensheet Manifest Label · ${PB.esc(b.caseClass)}</dd>
        <dt>Block size</dt><dd>${t ? t.max : 6}</dd><dt>Copies</dt><dd>1000</dd><dt>Output</dt><dd>PDF · CMYK</dd></dl></div>`;
    else if (dtab === 'jdf') el.innerHTML = `
      <div class="card pad" style="max-width:620px">
        <div class="field"><label>Machine</label><div class="dd-mount" id="jdfMachine"></div></div>
        <button class="btn primary" data-act="press">▶ Send to press</button></div>`;
    if (dtab === 'summary' && (b.items || []).length) itemsGrid(b, t);
    if (dtab === 'jdf') { const machines = ['Element Pro 6 ' + (/ext/i.test(b.template) ? '6up Extended' : '4up') + ' Machine', 'EPSON SC-P6000', 'P6000 — Line 1']; PB.dropdown(PB.qs('#jdfMachine'), { options: machines, value: machines[0], label: 'machine' }); }
    PB.qsa('[data-act]', PB.qs('#dbody')).forEach(x => x.onclick = () => act(x.dataset.act, b, () => renderTab(b, t)));
  }

  const itemKey = it => String(it.component_barcode || it.source_id || '');
  const statusTag = it => it.shipped_date
    ? `<span class="cell-tag ok" title="Shipped ${PB.esc(PB.fmt.date(it.shipped_date))}">Shipped</span>`
    : `<span class="cell-tag live">Live</span>`;

  function itemsGrid(b, t) {
    const items = b.items || [];
    const cols = [
      { headerName: '', checkboxSelection: true, headerCheckboxSelection: true, width: 46, maxWidth: 46, minWidth: 46, sortable: false, filter: false, resizable: false, flex: 0 },
      { headerName: 'Source ID', field: 'source_id', minWidth: 120, cellRenderer: p => `<b class="mono">${PB.esc(p.value || '—')}</b>` },
      { headerName: 'Printfile', maxWidth: 90, minWidth: 80, sortable: false, filter: false, cellRenderer: p => `<div class="thumb" title="${PB.esc(p.data._fileName || p.data.print_sku || '')}" style="${PB.thumbStyle(p.data)};width:34px;height:34px;border-radius:6px"></div>` },
      { headerName: 'Print SKU', field: 'print_sku', minWidth: 130, cellRenderer: p => `<span class="mono">${PB.esc(p.value || '—')}</span>` },
      { headerName: 'Model', field: 'model', minWidth: 120 },
      { headerName: 'Casetype', field: 'case_type', minWidth: 130 },
      { headerName: 'Status', maxWidth: 110, valueGetter: p => p.data.shipped_date ? 'Shipped' : 'Live', cellRenderer: p => statusTag(p.data) },
      { headerName: 'Order date', field: 'created_date', minWidth: 130, valueFormatter: p => PB.fmt.date(p.value) },
      { headerName: 'Qty', field: 'qty', maxWidth: 80, type: 'numericColumn' },
      { headerName: 'Barcode', field: 'component_barcode', minWidth: 120, cellRenderer: p => `<span class="mono">${PB.esc(p.value || '—')}</span>` },
    ];
    const api = PB.grid(PB.qs('#igrid'), cols, items, {
      pageSize: 10, search: items.length > 8, gridKey: 'batch-items', rowSelection: 'multiple', gridOptions: { suppressRowClickSelection: true },
      onSelectionChanged: e => updateItemBar(b, t, e.api),
      card: it => `<div class="card pad"><div class="row" style="gap:10px;align-items:center">
        <div class="thumb" style="${PB.thumbStyle(it)};width:40px;height:40px;border-radius:6px;flex:none"></div>
        <div style="flex:1;min-width:0"><div class="row" style="justify-content:space-between"><b class="mono">${PB.esc(it.source_id || '—')}</b><button class="btn ghost sm" data-del="${PB.esc(itemKey(it))}" style="color:var(--err)">remove</button></div>
          <div class="page-sub">${PB.esc(it.model)} · ${PB.esc(it.case_type)} · ${PB.esc(it.print_sku || '')} · ${statusTag(it)}</div>
          <div class="page-sub" style="margin-top:2px">Ordered ${PB.esc(PB.fmt.date(it.created_date))}</div></div></div></div>` });
    updateItemBar(b, t, api);
    // per-item remove from the mobile cards (desktop uses checkbox multi-select + Delete selected)
    PB.qs('#igrid').addEventListener('click', e => {
      const d = e.target.closest('[data-del]'); if (!d) return; e.stopPropagation();
      const victim = (b.items || []).find(it => itemKey(it) === d.dataset.del); if (victim) removeItems(b, t, [victim]);
    });
  }

  function updateItemBar(b, t, api) {
    const bar = PB.qs('#itemBar'); if (!bar) return;
    const sel = api.getSelectedRows();
    bar.innerHTML = sel.length
      ? `<button class="btn outline sm" id="delItems" style="color:var(--err)">🗑 Delete selected (${sel.length})</button>`
      : `<span class="page-sub">tick rows to delete — the sheet is re-imposed and the change saved to history</span>`;
    const del = PB.qs('#delItems'); if (del) del.onclick = () => removeItems(b, t, api.getSelectedRows());
  }

  // delete items from the sheet → recompute qty, re-impose, and append an audit entry to the batch history
  async function removeItems(b, t, victims) {
    victims = (victims || []).filter(Boolean);
    if (!victims.length) return;
    if (!(await PB.confirm({ title: 'Delete items', message: `Delete ${victims.length} item${victims.length > 1 ? 's' : ''} from this sheet? The batch will be re-imposed and the change recorded in history.`, confirmText: 'Delete', danger: true }))) return;
    const set = new Set(victims);
    const sumQty = arr => (arr || []).reduce((s, i) => s + (+i.qty || 1), 0);   // "up" = printfile positions = summed qty
    const removedIds = victims.map(it => it.component_barcode || it.source_id || '—');   // barcode-first, matching itemKey/selection
    const fromUp = sumQty(b.items);
    b.items = (b.items || []).filter(it => !set.has(it));
    const toUp = sumQty(b.items);
    b.qty = toUp;
    if (b.items.length) b.caseClass = PB.caseClass(b.items[0].case_type);   // keep the case-class dot in sync with surviving items
    PB.logActivity(b, 'items-removed', { count: victims.length, items: removedIds, fromUp, toUp });   // records who + at + saves
    PB.refreshNav();
    PB.toast(`${victims.length} item${victims.length > 1 ? 's' : ''} removed · sheet re-imposed (${fromUp}→${toUp}-up)`, 'ok');
    renderTab(b, t);   // re-render Summary: new imposition + updated items grid + history
  }

  /* ---------------- activity feed ---------------- */
  const ACT = {
    created: { ic: '✚', label: 'Batch created' },
    sheet_printed: { ic: '🖨', label: 'Sheet sent to print' },
    label_printed: { ic: '🏷', label: 'Batch label printed' },
    greensheet_printed: { ic: '📄', label: 'Greensheet printed' },
    pdf_downloaded: { ic: '⤓', label: 'PDF downloaded' },
    archived: { ic: '📦', label: 'Batch archived' },
    reversed: { ic: '↩', label: 'Batch reversed → items returned to pool' },
    'items-removed': { ic: '🗑', label: 'Items removed from sheet' },
  };
  function actItem(h) {
    const m = ACT[h.action] || { ic: '•', label: h.action || 'activity' };
    const extra = h.action === 'items-removed'
      ? ` — ${h.count} item${h.count > 1 ? 's' : ''} (${(h.items || []).map(PB.esc).join(', ')}) · re-imposed ${h.fromUp}→${h.toUp}-up`
      : h.action === 'reversed'
      ? ` — ${h.count} item${h.count > 1 ? 's' : ''} returned to ${PB.esc(h.returnedTo || 'pool')}` : '';
    const meta = [`<span class="act-who">${PB.esc(h.by || '—')}</span>`];
    if (h.printer) meta.push(`<span class="act-printer">${PB.esc(h.printer)}</span>`);
    if (h.account && h.account !== h.by) meta.push(`<span title="Logged-in account">acct: ${PB.esc(h.account)}</span>`);
    return `<li><div class="act-ic">${m.ic}</div><div class="act-body">
      <div class="act-title">${PB.esc(m.label)}${extra}</div>
      <div class="act-meta"><span title="${PB.esc(PB.fmt.dt(h.at))}">${PB.esc(PB.fmt.dt(h.at))}</span> · ${meta.join(' ')}</div></div></li>`;
  }

  // shared action handler — used by list-row buttons (after = re-render list) and detail buttons (after = re-render tab)
  function act(a, b, after) {
    const done = () => { if (after) after(); };
    if (a === 'pdf') { PB.downloadBatchPdf(b); PB.toast('Batch PDF downloaded · logged', 'ok'); done(); }
    else if (a === 'print' || a === 'press') sendToPrint(b, after);
    else if (a === 'green') { const lp = (PB.labelPrinters()[0] || {}).name || 'ZDesigner ZD421'; PB.logActivity(b, 'greensheet_printed', { printer: lp }); PB.toast('Greensheet sent to ' + lp + ' · logged', 'ok'); done(); }
    else if (a === 'label') labelPreview(b, after);
    else if (a === 'archive') { b.status = 'archived'; PB.logActivity(b, 'archived'); PB.toast('Batch archived', 'ok'); PB.go('batches'); }
  }

  // Send-to-print: pick a press (default P6000) → record sheet_printed{printer, operator} + advance current_event
  function sendToPrint(b, after) {
    const presses = PB.presses();
    if (!presses.length) { PB.toast('No active press — add one in Configure → Printers', 'warn'); return; }
    let chosen = (presses.find(p => /P6000/i.test(p.name)) || presses[0]).name;
    PB.drawer.open('Send to print · batch ' + PB.esc(b.number), `
      <div class="card pad">
        <div class="page-sub" style="margin-bottom:10px">${PB.esc(b.template)} · ${b.qty}-up · ${PB.esc(b.model)} · ${PB.esc(b.case_type)}</div>
        <div class="field"><label>Press / printer</label><div class="dd-mount" id="sendPick"></div></div>
        <div class="hint">Operating as <b>${PB.esc(PB.operator)}</b> · logged in as ${PB.esc(PB.user.email)}.</div>
      </div>
      <button class="btn primary block" id="sendGo" style="margin-top:14px">🖨 Send to press</button>`);
    PB.dropdown(PB.qs('#sendPick'), { options: presses.map(p => p.name), value: chosen, label: 'printer', onChange: x => chosen = x });
    PB.qs('#sendGo').onclick = () => {
      PB.logActivity(b, 'sheet_printed', { printer: chosen });
      if (b.status !== 'complete') b.current_event = 'Print';
      PB.save(); PB.drawer.close(); PB.toast('Sent to ' + chosen + ' · logged', 'ok'); if (after) after();
    };
  }

  // fill = number of occupied positions (items on the sheet); null → all positions filled (template geometry only)
  function miniSheet(t, W, fill) {
    W = W || 240; if (!t || !t.rows || !t.cols) return '<div class="empty">No imposition geometry.</div>';
    const max = t.max || (t.rows * t.cols);
    const occ = (fill == null) ? max : Math.max(0, Math.min(max, fill));
    const H = Math.round(W * (t.sheet_h / t.sheet_w || 1.4)), gw = W / t.cols, gh = H / t.rows; let slots = '', n = 1;
    for (let r = 0; r < t.rows; r++) for (let c = 0; c < t.cols; c++) { const on = n <= occ;
      slots += `<div class="imp-slot ${on ? '' : 'imp-empty'}" style="left:${c * gw + 1.5}px;top:${r * gh + 1.5}px;width:${gw - 3}px;height:${gh - 3}px">${on ? `<span class="crop"></span>${n}` : ''}</div>`; n++; }
    return `<div class="imp-stage" style="min-height:auto;padding:12px"><div class="imp-sheet" style="width:${W}px;height:${H}px">${slots}</div></div>
      <div class="page-sub" style="text-align:center">${t.cols}×${t.rows} = ${t.max}-up · ${t.sheet_w}×${t.sheet_h} mm${fill != null ? ` · ${occ} filled` : ''}</div>`;
  }

  function labelPreview(b, after) {
    const labels = PB.labelPrinters();
    PB.drawer.open('2×1 label · batch ' + PB.esc(b.number), `
      <div class="card pad" style="text-align:center;max-width:340px;margin:0 auto">
        <div style="font-size:13px;color:var(--muted)">BATCH</div>
        <div style="font-size:30px;font-weight:800" class="mono">${PB.esc(b.number)}</div>
        <svg id="bc" width="280" height="70"></svg>
        <div class="mono" style="font-size:12px">${PB.esc(b.barcode)}</div>
        <div style="margin-top:8px">${PB.esc(b.template)} · ${b.qty} up</div>
      </div>
      ${labels.length ? `<div class="field" style="margin-top:12px"><label>Label printer</label><div class="dd-mount" id="labelPick"></div></div>` : ''}
      <button class="btn primary block" style="margin-top:14px" id="labelGo">🖨 Print label</button>`);
    const svg = PB.qs('#bc'); if (svg) { let x = 6; const s = b.barcode; for (let i = 0; i < s.length * 3 && x < 274; i++) { const w = 1 + (s.charCodeAt(i % s.length) % 3); if (i % 2 === 0) svg.insertAdjacentHTML('beforeend', `<rect x="${x}" y="6" width="${w}" height="58" fill="#111"/>`); x += w + 1; } }
    let lp = (labels[0] || { name: 'ZDesigner ZD421' }).name;
    if (labels.length) PB.dropdown(PB.qs('#labelPick'), { options: labels.map(p => p.name), value: lp, label: 'label printer', onChange: x => lp = x });
    PB.qs('#labelGo').onclick = () => { PB.logActivity(b, 'label_printed', { printer: lp }); PB.drawer.close(); PB.toast('Label sent to ' + lp + ' · logged', 'ok'); if (after) after(); };
  }

  PB.openBatch = (b) => PB.go('batches', b.id);  // back-compat
})();
