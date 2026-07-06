/* Configure → Printers — manage the print devices (HP /api/device model). List + add/edit/delete editor. */
(function () {
  const TYPES = ['Sublimation press', 'UV / large format', 'Digital press', 'Label / greensheet (ZPL)', 'UV printer'];
  const PROTOCOLS = ['JDF', 'ZPL', 'IPP', 'Direct TCP', 'CUPS'];
  const STATUSES = ['available', 'busy', 'offline', 'maintenance', 'retired'];
  const EVENTS = ['Print', 'Cut', 'Pack', 'Label'];
  const STATUS_CLS = { available: 'ok', busy: 'warn', offline: 'err', maintenance: 'warn', retired: '' };
  PB.printerStatusChip = s => `<span class="badge ${STATUS_CLS[s] || ''} dot">${PB.esc(s || '—')}</span>`;

  PB.view('printers', (v, param) => {
    if (param === 'new') return editor(v, null);
    if (param) { const p = (PB.state.printers || []).find(x => x.id === param); return p ? editor(v, p) : notFound(v); }
    list(v);
  });

  function notFound(v) { v.innerHTML = PB.pageHead({ title: 'Printer not found', back: ['printers'] }) + '<div class="empty">No such printer.</div>'; }

  /* ---------------- list ---------------- */
  function list(v) {
    const all = PB.state.printers || [];
    const online = all.filter(p => p.status === 'available' || p.status === 'busy').length;
    v.innerHTML = PB.pageHead({
      title: 'Printers',
      sub: `${all.length} devices · ${online} online · presses & label printers. Send-to-print reads the active presses.`,
      actions: `<button class="btn primary" id="addPrinter">＋ Add printer</button>`
    }) + `<div id="grid"></div>`;
    PB.qs('#addPrinter').onclick = () => PB.go('printers', 'new');

    const cols = [
      { headerName: 'Name', field: 'name', minWidth: 200, cellRenderer: p => `<a href="${PB.link('printers', p.data.id)}" class="cell-link"><b>${PB.esc(p.value)}</b></a>${p.data.active === false ? ' <span class="badge">inactive</span>' : ''}` },
      { headerName: 'Model', field: 'model', maxWidth: 110 },
      { headerName: 'Type', field: 'type', minWidth: 170 },
      { headerName: 'Protocol', field: 'protocol', maxWidth: 110 },
      { headerName: 'Status', field: 'status', maxWidth: 130, cellRenderer: p => PB.printerStatusChip(p.value) },
      { headerName: 'Connection', field: 'connection', minWidth: 150, cellRenderer: p => `<span class="mono">${PB.esc(p.value || '—')}</span>` },
      { headerName: 'Location', field: 'location', minWidth: 110 },
      { headerName: 'Services', minWidth: 150, valueGetter: p => (p.data.events || []).join(', '), cellRenderer: p => (p.data.events || []).map(e => `<span class="cell-tag">${PB.esc(e)}</span>`).join(' ') || '—' },
    ];
    const cardFn = p => `<a class="card pad clickable" href="${PB.link('printers', p.id)}" style="display:block;text-decoration:none;color:inherit">
        <div class="row" style="justify-content:space-between"><b>${PB.esc(p.name)}</b>${PB.printerStatusChip(p.status)}</div>
        <div class="page-sub">${PB.esc(p.type)} · ${PB.esc(p.protocol || '')} · <span class="mono">${PB.esc(p.connection || '')}</span></div>
        <div class="page-sub" style="margin-top:2px">${PB.esc(p.location || '')} · ${(p.events || []).join(', ')}</div></a>`;
    PB.grid(PB.qs('#grid'), cols, all, { tall: true, pageSize: 25, search: true, colFilters: true, gridKey: 'printers', onRowClicked: e => PB.go('printers', e.data.id), card: cardFn });
  }

  /* ---------------- editor ---------------- */
  function editor(v, printer) {
    const base = printer || { id: 'PR' + Date.now(), name: '', deviceName: '', model: '', type: TYPES[0], protocol: 'JDF',
      status: 'available', connection: '', location: '', serial: '', events: ['Print'], capabilities: [], max_width_mm: '', max_height_mm: '', media: [], notes: '', active: true, _new: true };
    const work = JSON.parse(JSON.stringify(base));
    ['events', 'capabilities', 'media'].forEach(k => { if (!Array.isArray(work[k])) work[k] = []; });
    if (work.active === undefined) work.active = true;
    const $ = id => PB.qs('#' + id);

    v.innerHTML = PB.pageHead({
      back: ['printers'],
      crumbs: [{ label: 'Printers', route: ['printers'] }, { label: printer ? base.name || 'Printer' : 'New printer' }],
      title: printer ? 'Edit printer' : 'Add printer',
      sub: printer ? PB.esc(base.id) : 'Register a print device (press / label printer)',
      actions: `<label class="row" style="gap:8px;font-size:13px;margin-right:6px">Active <span class="toggle ${work.active ? 'on' : ''}" id="pActive" role="switch" tabindex="0" aria-checked="${!!work.active}"></span></label>
        ${printer ? '<button class="btn ghost" id="pDel" style="color:var(--err)">Delete</button>' : ''}
        <button class="btn primary" id="pSave">${printer ? 'Save printer' : 'Add printer'}</button>`
    }) + `<div class="detail-grid">
        <div class="card pad">
          <h3 class="card-title" style="margin:0 0 14px">Device</h3>
          <div class="field"><label>Name *</label><input class="input" id="pName" value="${PB.esc(work.name)}" placeholder="e.g. P6000 — Line 3"></div>
          <div class="field"><label>Full device name</label><input class="input" id="pDevice" value="${PB.esc(work.deviceName)}" placeholder="e.g. EPSON SureColor P6000 · 6-up Sublimation"></div>
          <div class="form-row">
            <div class="field"><label>Model</label><input class="input" id="pModel" value="${PB.esc(work.model)}" placeholder="P6000 / P7000 / ZD421"></div>
            <div class="field"><label>Serial</label><input class="input" id="pSerial" value="${PB.esc(work.serial)}" placeholder="P6000-2025-03"></div>
          </div>
          <div class="form-row">
            <div class="field"><label>Type</label><div class="dd-mount" id="pType"></div></div>
            <div class="field"><label>Status</label><div class="dd-mount" id="pStatus"></div></div>
          </div>
          <div class="field"><label>Services (production events)</label><div class="dd-mount" id="pEvents"></div>
            <div class="hint" style="margin-top:4px">Which route steps this device handles. Send-to-print offers presses that service <b>Print</b>.</div></div>
        </div>
        <div class="card pad">
          <h3 class="card-title" style="margin:0 0 14px">Connection & capability</h3>
          <div class="form-row">
            <div class="field"><label>Protocol</label><div class="dd-mount" id="pProto"></div></div>
            <div class="field"><label>Location / line</label><input class="input" id="pLoc" value="${PB.esc(work.location)}" placeholder="Line 3"></div>
          </div>
          <div class="field"><label>Connection (IP / host / queue)</label><input class="input mono" id="pConn" value="${PB.esc(work.connection)}" placeholder="192.168.10.53  or  \\\\printserver\\P6000_3"></div>
          <div class="form-row">
            <div class="field"><label>Max width (mm)</label><input class="input" id="pMaxW" value="${PB.esc(work.max_width_mm)}" placeholder="318" inputmode="decimal"></div>
            <div class="field"><label>Max height (mm)</label><input class="input" id="pMaxH" value="${PB.esc(work.max_height_mm)}" placeholder="706.5" inputmode="decimal"></div>
          </div>
          <div class="field"><label>Capabilities (N-up, comma-separated)</label><input class="input" id="pCaps" value="${PB.esc((work.capabilities || []).join(', '))}" placeholder="6-up, 4-up"></div>
          <div class="field"><label>Media (comma-separated)</label><input class="input" id="pMedia" value="${PB.esc((work.media || []).join(', '))}" placeholder="Sublimation paper, Polyester"></div>
          <div class="field"><label>Notes</label><textarea class="input" id="pNotes" rows="2" placeholder="Maintenance notes, warm-up, quirks…">${PB.esc(work.notes || '')}</textarea></div>
        </div>
      </div>`;

    PB.dropdown(PB.qs('#pType'), { options: TYPES, value: work.type, label: 'type', onChange: x => work.type = x });
    PB.dropdown(PB.qs('#pStatus'), { options: STATUSES, value: work.status, label: 'status', onChange: x => work.status = x });
    PB.dropdown(PB.qs('#pProto'), { options: PROTOCOLS, value: work.protocol, label: 'protocol', onChange: x => work.protocol = x });
    const evDd = PB.dropdown(PB.qs('#pEvents'), { multi: true, options: EVENTS, values: work.events, placeholder: 'Services…', label: 'event', onChange: x => work.events = x });
    { const t = $('pActive'); if (t) t.onclick = () => { work.active = !work.active; t.classList.toggle('on'); t.setAttribute('aria-checked', !!work.active); }; }

    function sync() {
      work.name = $('pName').value.trim(); work.deviceName = $('pDevice').value.trim();
      work.model = $('pModel').value.trim(); work.serial = $('pSerial').value.trim();
      work.connection = $('pConn').value.trim(); work.location = $('pLoc').value.trim();
      work.max_width_mm = $('pMaxW').value.trim(); work.max_height_mm = $('pMaxH').value.trim();
      work.notes = $('pNotes').value;
      const split = s => s.split(/\s*,\s*/).map(x => x.trim()).filter(Boolean);
      work.capabilities = split($('pCaps').value); work.media = split($('pMedia').value);
      if (evDd) work.events = evDd.value();
    }

    $('pSave').onclick = () => {
      sync();
      if (!work.name) { PB.toast('Name is required', 'warn'); return; }
      if (work._new) { delete work._new; (PB.state.printers = PB.state.printers || []).unshift(work); }
      else { const tgt = PB.state.printers.find(x => x.id === base.id); if (tgt) Object.assign(tgt, work); else PB.state.printers.unshift(work); }
      PB.save(); PB.toast('Printer saved', 'ok'); PB.go('printers');
    };
    const del = $('pDel'); if (del) del.onclick = async () => {
      if (!(await PB.confirm({ title: 'Delete printer', message: 'Delete “' + (base.name || base.id) + '”? Any send-to-print dropdown will no longer offer it.', confirmText: 'Delete', danger: true }))) return;
      PB.state.printers = (PB.state.printers || []).filter(x => x.id !== base.id); PB.save(); PB.toast('Printer deleted', 'warn'); PB.go('printers');
    };
  }
})();
