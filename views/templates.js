/* Templates & Imposition Designer — list + URL-routed designer at #/templates/:name */
(function () {
  let dtab = 'sheet';
  let tplTab = 'active';   // templates list tab: active | inactive

  /* ---- marks (sheet slug: batch number, the two barcodes, per-slot item names) ---- */
  const MARK_TOKENS = [
    { value: '{{subBatch.barcode}}', label: 'Batch barcode', short: 'BARCODE' },
    { value: '{{batch.number}}', label: 'Batch number', short: 'BATCH #' },
    { value: '{{batch.productName}}', label: 'Product name', short: 'PRODUCT' },
    { value: '{{job.sourceOrderId}}-{{job.attributes.Description}}', label: 'Item (order + description)', short: 'ITEM' },
    { value: '{{job.sourceOrderId}}', label: 'Order ID', short: 'ORDER' },
    { value: '{{job.printSku}}', label: 'Print SKU', short: 'SKU' },
  ];
  const POS = [['LT', '↖', 'Top-left'], ['CT', '↑', 'Top-center'], ['RT', '↗', 'Top-right'],
    ['LC', '←', 'Middle-left'], ['CC', '•', 'Center'], ['RC', '→', 'Middle-right'],
    ['LB', '↙', 'Bottom-left'], ['CB', '↓', 'Bottom-center'], ['RB', '↘', 'Bottom-right']];
  const tokenOf = v => MARK_TOKENS.find(o => o.value.toLowerCase() === String(v || '').toLowerCase());
  const markLabel = v => { const h = tokenOf(v); return h ? h.label : (String(v || '').length > 18 ? String(v).slice(0, 16) + '…' : String(v || '') || 'text'); };
  const shortLabel = v => { const h = tokenOf(v); if (h) return h.short; const s = String(v || ''); return (s.length > 10 ? s.slice(0, 9) + '…' : s) || 'TEXT'; };
  let _mid = 0;
  const newId = () => 'M' + (Date.now().toString(36)) + (_mid++);
  function normMark(m) {
    let raw = m && m.value && typeof m.value === 'object' ? m.value.args : (m ? m.value : '');
    if (Array.isArray(raw)) raw = raw.join('');   // HP handlebars args can be a concat array
    const v = raw;
    return {
      id: (m && m.id) || newId(),
      name: (m && m.name) || 'Mark',
      type: m && m.type === 'asset' ? 'image' : (m && ['text', 'barcode', 'image'].includes(m.type) ? m.type : 'text'),
      relativeTo: m && m.relativeTo === 'slot' ? 'slot' : 'sheet',
      align: String((m && (m.align || m.alignment)) || 'CC').toUpperCase().slice(0, 2),
      value: v == null ? '' : String(v),
      barcodeType: m && /code ?128|c128/i.test(m.barcodeType || '') ? 'code128' : 'qrcode',
      fontSize: (m && +m.fontSize) || 12,
      rotation: (m && +m.rotation) || 0,
    };
  }
  function seedMarks(t) {
    if (t.geom && Array.isArray(t.geom.marks) && t.geom.marks.length) return t.geom.marks.map(normMark);
    return [   // standard HP-style slug when the template carries no marks geometry
      normMark({ name: 'Batch QR (top-left)', type: 'barcode', relativeTo: 'sheet', align: 'LT', value: '{{subBatch.barcode}}', barcodeType: 'qrcode' }),
      normMark({ name: 'Batch QR (bottom-right)', type: 'barcode', relativeTo: 'sheet', align: 'RB', value: '{{subBatch.barcode}}', barcodeType: 'qrcode' }),
      normMark({ name: 'Batch number', type: 'text', relativeTo: 'sheet', align: 'CT', value: '{{batch.number}}', fontSize: 14 }),
      normMark({ name: 'Item name', type: 'text', relativeTo: 'slot', align: 'CB', value: '{{job.sourceOrderId}}-{{job.attributes.Description}}', fontSize: 10 }),
    ];
  }

  PB.view('templates', (v, param) => {
    if (param) { const t = PB.state.templates.find(x => x.name === param); return t ? designer(v, t) : notFound(v); }
    list(v);
  });

  function notFound(v) { v.innerHTML = PB.pageHead({ title: 'Template not found', back: ['templates'] }) + '<div class="empty">No such template.</div>'; }

  // where a template is referenced — a template is "used in batching" if any batch or bucket was built with it
  function usage(name) {
    return {
      batches: PB.state.batches.filter(b => b.template === name).length,
      buckets: PB.state.buckets.filter(k => k.template === name).length,
      rules: PB.state.rules.filter(r => r.template === name).length,
      get inBatching() { return this.batches + this.buckets > 0; },
    };
  }
  async function removeTpl(t) {
    const u = usage(t.name);
    if (u.inBatching) { PB.toast(`Can’t delete — “${t.name}” is used in ${u.batches} batch(es) and ${u.buckets} bucket(s). Deactivate it instead.`, 'warn', 4200); return; }
    const warn = u.rules > 0 ? `\n\n${u.rules} rule(s) point to this template and will fall back to the default 6-up layout.` : '';
    if (!(await PB.confirm({ title: 'Delete template', message: `Delete template “${t.name}”?${warn}`, confirmText: 'Delete', danger: true }))) return;
    PB.state.templates = PB.state.templates.filter(x => x.name !== t.name);
    PB.save(); PB.toast('Template deleted', 'warn'); PB.go('templates');
  }

  /* ---------------- list ---------------- */
  function list(v) {
    const all = PB.state.templates;
    const activeList = all.filter(t => t.active !== false);
    const inactiveList = all.filter(t => t.active === false);
    const shown = tplTab === 'inactive' ? inactiveList : activeList;
    v.innerHTML = PB.pageHead({
      title: 'Templates & imposition',
      sub: `${activeList.length} active of ${all.length} templates · each maps to a press/machine layout`,
      actions: `<button class="btn primary" id="addTpl">＋ Upload template</button>`
    })
      + `<div class="tabs">
          <button class="tab ${tplTab === 'active' ? 'active' : ''}" data-tt="active">Active <span class="cnt">${activeList.length}</span></button>
          <button class="tab ${tplTab === 'inactive' ? 'active' : ''}" data-tt="inactive">Inactive <span class="cnt">${inactiveList.length}</span></button>
        </div>`
      + (shown.length
        ? `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">
            ${shown.map(t => `
              <a class="card pad clickable" href="${PB.link('templates', t.name)}" style="display:block;text-decoration:none;color:inherit${t.active === false ? ';opacity:.62' : ''}">
                <div class="row" style="justify-content:space-between"><b>${PB.esc(t.name)}</b><span class="badge ${t.active !== false ? 'ok' : ''} dot">${t.active !== false ? 'active' : 'inactive'}</span></div>
                ${miniSheet(t, 150)}
                <div class="row" style="justify-content:space-between;margin-top:10px">
                  <span class="badge">${t.cols}×${t.rows} = ${t.max}-up</span>
                  <span class="badge ${t.printing === 'UV' ? 'info' : 'live'}">${t.printing}</span></div>
                <div class="page-sub" style="margin-top:6px">${t.sheet_w}×${t.sheet_h} mm · ${t.productType}</div>
              </a>`).join('')}
          </div>`
        : `<div class="empty">No ${tplTab} templates.</div>`);
    PB.qsa('[data-tt]', v).forEach(b => b.onclick = () => { tplTab = b.dataset.tt; list(v); });
    PB.qs('#addTpl').onclick = uploadTpl;
  }
  PB._editTpl = (name) => PB.go('templates', name);  // back-compat

  /* ---------------- designer ---------------- */
  function designer(v, t) {
    if (!t.marks) t.marks = seedMarks(t);   // lazily adopt the template's marks (from geom or a standard slug)
    v.innerHTML = PB.pageHead({
      back: ['templates'],
      crumbs: [{ label: 'Templates', route: ['templates'] }, { label: t.name }],
      title: `Imposition · ${PB.esc(t.name)}${t.active === false ? ' <span class="badge dot" style="font-size:11px;vertical-align:middle">inactive</span>' : ''}`,
      sub: `${t.cols}×${t.rows} = ${t.max}-up · ${t.sheet_w}×${t.sheet_h} mm · ${t.printing}`,
      actions: `<label class="row" style="gap:8px;font-size:13px;margin-right:2px" title="Activate / deactivate this template">Active <span class="toggle ${t.active !== false ? 'on' : ''}" id="tplActive" role="switch" aria-checked="${t.active !== false}"></span></label>
        <div class="seg" id="ladder">
          <button data-l="impose">Impose</button><button data-l="populate">Populate</button>
          <button data-l="optimize">Optimize</button><button data-l="plan">Plan</button></div>
        <button class="btn ghost" id="delTpl" style="color:var(--err)">🗑 Delete</button>
        <button class="btn primary" id="saveTpl">Save</button>`
    })
      + `<div class="split">
          <div class="card pad">
            ${miniSheet(t, 360, true)}
            <div class="ticket" style="margin-top:14px">
              <div class="t"><div class="k">N-up</div><div class="v">${t.max}</div></div>
              <div class="t"><div class="k">Sheet usage</div><div class="v">${sheetUsage(t)}%</div></div>
              <div class="t"><div class="k">Run / sheet</div><div class="v">${t.max}</div></div>
              <div class="t"><div class="k">Waste</div><div class="v">${100 - sheetUsage(t)}%</div></div>
            </div>
          </div>
          <div class="card pad">
            <div class="tabs" style="margin-bottom:14px">
              ${['sheet', 'gutters', 'slot', 'marks', 'files'].map(x => `<button class="tab ${dtab === x ? 'active' : ''}" data-d="${x}">${x[0].toUpperCase() + x.slice(1)}</button>`).join('')}
            </div>
            <div id="dpanel">${panel(t)}</div>
          </div>
        </div>`;

    PB.qsa('#ladder button', v).forEach(b => b.onclick = () => PB.toast(ladderMsg(b.dataset.l), 'info'));
    PB.qs('#saveTpl').onclick = () => { PB.save(); PB.toast('Imposition saved', 'ok'); };
    PB.qs('#tplActive').onclick = () => { t.active = t.active === false; PB.save(); PB.toast(t.active ? 'Template activated' : 'Template deactivated', t.active ? 'ok' : 'warn'); designer(v, t); };
    PB.qs('#delTpl').onclick = () => removeTpl(t);
    PB.qsa('[data-d]', v).forEach(b => b.onclick = () => { dtab = b.dataset.d; designer(v, t); });
    wirePanel(t, v);
  }

  function panel(t) {
    if (dtab === 'sheet') return `
      <div class="form-row"><div class="field"><label>Units</label><select class="select"><option>Millimeters</option></select></div>
        <div class="field"><label>Runlist</label><select class="select"><option>Step and Repeat · Simplex</option></select></div></div>
      <div class="form-row"><div class="field"><label>Sheet width (mm)</label><input class="input" id="sw" value="${t.sheet_w}"></div>
        <div class="field"><label>Sheet height (mm)</label><input class="input" id="sh" value="${t.sheet_h}"></div></div>
      <div class="form-row"><div class="field"><label>Columns</label><input class="input" id="sc" type="number" value="${t.cols}"></div>
        <div class="field"><label>Rows</label><input class="input" id="sr" type="number" value="${t.rows}"></div></div>
      <div class="row" style="gap:18px;margin-top:6px">
        <label class="row" style="gap:8px"><span class="toggle ${t.crop ? 'on' : ''}" id="scrop"></span> Crop slots</label>
        <label class="row" style="gap:8px"><span class="toggle ${t.duplex ? 'on' : ''}" id="sdup"></span> Duplex</label></div>
      <button class="btn outline block" id="applyGeom" style="margin-top:14px">Apply &amp; re-render</button>`;
    if (dtab === 'gutters') return `<div class="form-row"><div class="field"><label>Gutter horizontal (mm)</label><input class="input" value="${(t.gutter && t.gutter.horizontal) || 0}"></div>
        <div class="field"><label>Gutter vertical (mm)</label><input class="input" value="${(t.gutter && t.gutter.vertical) || 0}"></div></div>
      <div class="form-row"><div class="field"><label>Margin left/right</label><input class="input" value="${(t.margin && t.margin.left) || 0}"></div>
        <div class="field"><label>Margin top/bottom</label><input class="input" value="${(t.margin && t.margin.top) || 0}"></div></div>`;
    if (dtab === 'slot') return `<div class="field"><label>Selected slot</label><input class="input" value="Slot 1" readonly></div>
      <div class="form-row"><div class="field"><label>X scale %</label><input class="input" value="100"></div><div class="field"><label>Y scale %</label><input class="input" value="100"></div></div>
      <div class="row" style="gap:18px;margin-top:6px"><label class="row" style="gap:8px"><span class="toggle on"></span> Lock marks</label>
        <label class="row" style="gap:8px"><span class="toggle on"></span> Lock bleed</label></div>
      <div class="hint" style="margin-top:10px">Direct manipulation: drag to move · Shift = constrain axis · Alt = duplicate · Ctrl+click = swap.</div>`;
    if (dtab === 'marks') {
      const marks = t.marks || [];
      return `<div class="row" style="justify-content:space-between;align-items:flex-start;margin-bottom:12px;gap:10px">
          <div class="hint" style="margin:0">Marks print in the sheet slug — the batch number, the two batch barcodes, and item names beside each slot. They appear on the preview.</div>
          <button class="btn outline sm" id="addMark" style="flex:none">＋ Add mark</button></div>
        <div class="marks-list">${marks.length ? marks.map(markRow).join('') : '<div class="empty">No marks defined.</div>'}</div>`;
    }
    return `<div class="form-row"><div class="field"><label>File sort order</label><div class="seg"><button class="active">First-Last</button><button>Last-First</button></div></div>
      <div class="field"><label>Page order</label><div class="seg"><button class="active">First-Last</button><button>Last-First</button></div></div></div>
      <label class="row" style="gap:8px;margin-top:8px"><input type="checkbox"> Add blank pages</label>`;
  }
  function wirePanel(t, v) {
    const ap = PB.qs('#applyGeom'); if (ap) ap.onclick = () => {
      t.sheet_w = +PB.qs('#sw').value || t.sheet_w; t.sheet_h = +PB.qs('#sh').value || t.sheet_h;
      t.cols = Math.max(1, +PB.qs('#sc').value || t.cols); t.rows = Math.max(1, +PB.qs('#sr').value || t.rows);
      t.max = t.cols * t.rows; t.crop = PB.qs('#scrop').classList.contains('on'); t.duplex = PB.qs('#sdup').classList.contains('on');
      PB.save(); PB.toast('Layout updated', 'ok'); designer(v, t);
    };
    ['scrop', 'sdup'].forEach(id => { const e = PB.qs('#' + id); if (e) e.onclick = () => e.classList.toggle('on'); });
    // marks tab
    const am = PB.qs('#addMark'); if (am) am.onclick = () => markEditor(t, null, v);
    PB.qsa('[data-medit]').forEach(b => b.onclick = () => markEditor(t, (t.marks || []).find(m => m.id === b.dataset.medit), v));
    PB.qsa('[data-mdel]').forEach(b => b.onclick = async () => {
      if (!(await PB.confirm({ title: 'Delete mark', message: 'Delete this mark?', confirmText: 'Delete', danger: true }))) return;
      t.marks = (t.marks || []).filter(m => m.id !== b.dataset.mdel); PB.save(); PB.toast('Mark deleted', 'warn'); designer(v, t);
    });
  }

  function markRow(m) {
    const ic = m.type === 'barcode' ? '▦' : m.type === 'image' ? '▣' : 'T';
    return `<div class="mark-row">
        <span class="mark-ic ${PB.esc(m.type)}">${ic}</span>
        <div class="mark-meta"><b>${PB.esc(m.name)}</b>
          <span class="page-sub">${PB.esc(m.type)} · ${m.relativeTo === 'slot' ? 'each slot' : 'sheet'} · ${PB.esc(markLabel(m.value))} · ${PB.esc(m.align)}</span></div>
        <button class="btn ghost sm" data-medit="${PB.esc(m.id)}">Edit</button>
        <button class="btn ghost sm" data-mdel="${PB.esc(m.id)}" style="color:var(--err)" title="Delete mark">✕</button></div>`;
  }

  function markEditor(t, mark, v) {
    const m = mark ? Object.assign({}, mark) : normMark({ name: 'New mark', type: 'text', relativeTo: 'sheet', align: 'CT', value: '{{batch.number}}' });
    const isCustom = !tokenOf(m.value);
    PB.modal.open(mark ? 'Edit mark' : 'Add mark', `
      <div class="modal-sub">Define what prints in the sheet slug — text, a barcode, or an asset — and where it sits.</div>
      <div class="field"><label>Mark name</label><input class="input" id="mkName" value="${PB.esc(m.name)}"></div>
      <div class="form-row">
        <div class="field"><label>Type</label><select class="select" id="mkType">
          ${['text', 'barcode', 'image'].map(x => `<option value="${x}" ${m.type === x ? 'selected' : ''}>${x[0].toUpperCase() + x.slice(1)}</option>`).join('')}</select></div>
        <div class="field"><label>Applies to</label><select class="select" id="mkRel">
          <option value="sheet" ${m.relativeTo === 'sheet' ? 'selected' : ''}>Whole sheet</option>
          <option value="slot" ${m.relativeTo === 'slot' ? 'selected' : ''}>Each slot</option></select></div></div>
      <div class="field"><label>Content</label><select class="select" id="mkToken">
          ${MARK_TOKENS.map(o => `<option value="${PB.esc(o.value)}" ${!isCustom && tokenOf(m.value).value === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
          <option value="__custom" ${isCustom ? 'selected' : ''}>Custom…</option></select></div>
      <div class="field" id="mkCustomWrap" style="${isCustom ? '' : 'display:none'}"><label>Custom value — supports {{handlebars}}</label><input class="input" id="mkValue" value="${PB.esc(m.value)}" placeholder="e.g. {{batch.number}}"></div>
      <div class="field"><label id="mkPosLabel">Position on ${m.relativeTo === 'slot' ? 'each slot' : 'the sheet'}</label>
        <div class="pos-grid" id="mkPos" role="radiogroup" aria-label="Mark position">
          ${POS.map(([code, ar, lbl]) => `<button type="button" role="radio" data-pos="${code}" aria-checked="${m.align === code ? 'true' : 'false'}" class="${m.align === code ? 'on' : ''}" aria-label="${lbl}" title="${lbl}">${ar}</button>`).join('')}</div></div>
      <div class="form-row" id="mkTextOpts" style="${m.type === 'text' ? '' : 'display:none'}">
        <div class="field"><label>Font size (pt)</label><input class="input" id="mkFont" type="number" min="4" value="${m.fontSize}"></div>
        <div class="field"><label>Rotation</label><select class="select" id="mkRot">${[0, 90, 180, 270].map(d => `<option ${m.rotation === d ? 'selected' : ''}>${d}</option>`).join('')}</select></div></div>
      <div class="field" id="mkBcOpts" style="${m.type === 'barcode' ? '' : 'display:none'}"><label>Barcode type</label><select class="select" id="mkBcType">
          <option value="qrcode" ${m.barcodeType === 'qrcode' ? 'selected' : ''}>QR code</option>
          <option value="code128" ${m.barcodeType === 'code128' ? 'selected' : ''}>Code 128 (1-D)</option></select></div>
      <div class="row" style="gap:8px;margin-top:10px"><button class="btn primary" id="mkSave" style="flex:1">${mark ? 'Save mark' : 'Add mark'}</button>
        <button class="btn ghost" id="mkCancel">Cancel</button></div>`);

    const $ = id => PB.qs('#' + id);
    let align = m.align;
    PB.qsa('#mkPos button').forEach(b => b.onclick = () => { align = b.dataset.pos; PB.qsa('#mkPos button').forEach(x => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', on ? 'true' : 'false'); }); });
    $('mkType').onchange = () => { const tp = $('mkType').value; $('mkTextOpts').style.display = tp === 'text' ? '' : 'none'; $('mkBcOpts').style.display = tp === 'barcode' ? '' : 'none'; };
    $('mkToken').onchange = () => { $('mkCustomWrap').style.display = $('mkToken').value === '__custom' ? '' : 'none'; };
    $('mkRel').onchange = () => { const l = $('mkPosLabel'); if (l) l.textContent = 'Position on ' + ($('mkRel').value === 'slot' ? 'each slot' : 'the sheet'); };
    $('mkCancel').onclick = () => PB.modal.close();
    $('mkSave').onclick = () => {
      const tok = $('mkToken').value, value = tok === '__custom' ? $('mkValue').value.trim() : tok;
      if (!value) { PB.toast('Give the mark some content', 'warn'); return; }
      const nm = { id: m.id, name: $('mkName').value.trim() || 'Mark', type: $('mkType').value, relativeTo: $('mkRel').value,
        align, value, barcodeType: $('mkBcType').value, fontSize: +$('mkFont').value || 12, rotation: +$('mkRot').value || 0 };
      t.marks = t.marks || [];
      const i = t.marks.findIndex(x => x.id === m.id);
      if (i >= 0) t.marks[i] = nm; else t.marks.push(nm);
      // re-render the designer first, THEN close — so focus lands on a node that still exists post-rebuild
      PB.save(); designer(v, t); PB.modal.close(); PB.toast(mark ? 'Mark saved' : 'Mark added', 'ok');
      requestAnimationFrame(() => { const el = PB.qs('[data-medit="' + nm.id + '"]') || PB.qs('#addMark'); if (el && el.focus) el.focus(); });
    };
  }

  function sheetUsage(t) { return Math.min(98, 60 + (t.max > 6 ? 25 : t.max * 3)); }
  function ladderMsg(l) { return ({ impose: 'Impose — fill the current die template.', populate: 'Populate — auto-assign products to balance overruns.', optimize: 'Optimize — search press/sheet combinations.', plan: 'Plan — pack across layouts/stock for lowest cost.' })[l]; }

  function miniSheet(t, W, withMarks) {
    if (!t.rows || !t.cols) return '<div class="empty">No geometry.</div>';
    const H = Math.round(W * (t.sheet_h / t.sheet_w || 1.4)), gw = W / t.cols, gh = H / t.rows; let slots = '', n = 1;
    for (let r = 0; r < t.rows; r++) for (let c = 0; c < t.cols; c++)
      slots += `<div class="imp-slot" style="left:${c * gw + 1.5}px;top:${r * gh + 1.5}px;width:${gw - 3}px;height:${gh - 3}px">${t.crop !== false ? '<span class="crop"></span>' : ''}${n++}</div>`;
    const marks = withMarks ? drawMarks(t, W, H, gw, gh) : '';
    return `<div class="imp-stage" style="min-height:auto;padding:12px"><div class="imp-sheet" style="width:${W}px;height:${H}px">${slots}${marks}</div></div>`;
  }

  function drawMarks(t, W, H, gw, gh) {
    const marks = t.marks || []; if (!marks.length) return '';
    const fx = a => ({ L: 0, C: .5, R: 1 }[a[0]] != null ? { L: 0, C: .5, R: 1 }[a[0]] : .5);
    const fy = a => ({ T: 0, C: .5, B: 1 }[a[1]] != null ? { T: 0, C: .5, B: 1 }[a[1]] : .5);
    const one = (m, rx, ry, rw, rh) => {
      const inset = Math.max(3, Math.min(10, rw * 0.12, rh * 0.12));
      const x = rx + inset + fx(m.align) * (rw - 2 * inset), y = ry + inset + fy(m.align) * (rh - 2 * inset);
      const tip = PB.esc(m.name + ' · ' + m.value);
      if (m.type === 'barcode') return `<div class="mk mk-bc" style="left:${x}px;top:${y}px" title="${tip}"></div>`;
      if (m.type === 'image') return `<div class="mk mk-im" style="left:${x}px;top:${y}px" title="${tip}">▣</div>`;
      const rot = m.rotation ? `transform:translate(-50%,-50%) rotate(${m.rotation}deg)` : '';
      return `<div class="mk mk-tx" style="left:${x}px;top:${y}px;${rot}" title="${tip}">${PB.esc(shortLabel(m.value))}</div>`;
    };
    let out = '';
    marks.forEach(m => {
      if (m.relativeTo === 'slot') { for (let r = 0; r < t.rows; r++) for (let c = 0; c < t.cols; c++) out += one(m, c * gw, r * gh, gw, gh); }
      else out += one(m, 0, 0, W, H);
    });
    return out;
  }

  function uploadTpl() {
    let dieFile = null,        // attached die-artwork filename (PDF/SVG/PNG)
      maxTouched = false,      // user manually edited "Maximum printfiles" — stop auto-deriving it from cols×rows
      nameFromFile = false;    // current name was auto-filled from an uploaded file (clear it if that file is removed)
    const ACCEPT = /\.(json|pdf|svg|png|jpe?g)$/i, JSON_MAX = 8 * 1024 * 1024, ART_MAX = 80 * 1024 * 1024;
    PB.modal.open('Upload template', `
      <p class="modal-sub">Upload an HP imposition <b>JSON</b> to auto-fill the layout, or attach a die <b>PDF / SVG / PNG</b> and enter the geometry below. <button type="button" class="lnk" id="dlSample">Download a sample JSON</button></p>
      <div class="upload-zone" id="dz" tabindex="0" role="button" aria-label="Upload template file — drop or browse">
        <input type="file" id="tplFile" accept=".json,application/json,.pdf,.svg,.png,image/*" hidden>
        <div class="uz-ic">⬆</div>
        <div class="uz-main"><b>Drop a template file here</b><span>or <span class="lnk">click to browse</span></span></div>
      </div>
      <div id="fileChip"></div>
      <div class="form-row" style="margin-top:14px"><div class="field"><label>Template name *</label><input class="input" id="tn" placeholder="e.g. 6up Korea"></div>
        <div class="field"><label>Maximum printfiles</label><input class="input" id="tmax" type="number" min="1" value="6"></div></div>
      <div class="form-row"><div class="field"><label>Printing type</label><select class="select" id="tprint"><option>Sublimation</option><option>UV</option></select></div>
        <div class="field"><label>Product type</label><select class="select" id="tprod"><option>Phone Case</option><option>iPad</option><option>Laptop sleeve</option><option>Water bottle</option></select></div></div>
      <div class="form-row"><div class="field"><label>Columns</label><input class="input" id="tc" type="number" min="1" value="3"></div><div class="field"><label>Rows</label><input class="input" id="tr" type="number" min="1" value="2"></div></div>
      <div class="form-row"><div class="field"><label>Sheet W (mm)</label><input class="input" id="tw" type="number" min="1" value="318"></div><div class="field"><label>Sheet H (mm)</label><input class="input" id="th" type="number" min="1" value="646"></div></div>
      <div class="field"><label>Preview</label><div id="tpreview" class="upload-preview"></div></div>
      <div class="row" style="gap:8px;margin-top:6px"><button class="btn primary" id="tSave" style="flex:1">Create template</button>
        <button class="btn ghost" id="tCancel">Cancel</button></div>`);

    const $ = id => PB.qs('#' + id);
    const numv = (id, d) => Math.max(1, +$(id).value || d);

    function updatePreview() {
      const t = { cols: numv('tc', 3), rows: numv('tr', 2), sheet_w: +$('tw').value || 318, sheet_h: +$('th').value || 646, crop: true };
      t.max = t.cols * t.rows;
      if (!maxTouched) $('tmax').value = t.max;   // keep N-up in sync with the grid unless the user overrode it
      $('tpreview').innerHTML = miniSheet(t, 190) + `<div class="page-sub" style="text-align:center;margin-top:4px">${t.cols}×${t.rows} = ${t.max}-up · ${t.sheet_w}×${t.sheet_h} mm</div>`;
    }

    function setFileChip(file, kind) {
      $('fileChip').innerHTML = file ? `<div class="file-chip"><span class="fc-ic">${kind === 'json' ? '◇' : '▢'}</span>
        <span class="fc-name">${PB.esc(file.name)}</span><span class="fc-size">${(file.size / 1024).toFixed(1)} KB</span>
        <button class="fc-x" id="fcX" type="button" aria-label="Remove file">✕</button></div>` : '';
      const x = $('fcX'); if (x) x.onclick = () => { dieFile = null; if (nameFromFile) { $('tn').value = ''; nameFromFile = false; } setFileChip(null); };
    }

    // liberal field mapping across HP "list" {name,rows,cols,sheet_w,sheet_h} and "full" {name,sheet:{width,height,rows,cols}} shapes
    function applyParsed(o) {
      if (!o || typeof o !== 'object') { PB.toast('JSON is not a template object', 'err'); return; }
      const s = o.sheet && typeof o.sheet === 'object' ? o.sheet : o;
      const name = String(o.name || o.description || s.name || '').trim().slice(0, 120);
      const cols = +(o.cols ?? o.columns ?? s.cols ?? s.columns);
      const rows = +(o.rows ?? s.rows);
      const w = +(o.sheet_w ?? o.sheetWidth ?? s.width ?? s.sheet_w);
      const h = +(o.sheet_h ?? o.sheetHeight ?? s.height ?? s.sheet_h);
      if (name) { $('tn').value = name; nameFromFile = true; }
      if (cols > 0) $('tc').value = cols;
      if (rows > 0) $('tr').value = rows;
      if (w > 0) $('tw').value = w;
      if (h > 0) $('th').value = h;
      if (o.printing === 'UV' || /uv|lux|mirror/i.test(name)) $('tprint').value = 'UV';
      updatePreview();   // re-derives "Maximum printfiles" from the parsed cols×rows
      PB.toast('Layout read from file', 'ok');
    }

    function readFile(file) {
      if (!file) return;
      const isJson = /\.json$/i.test(file.name) || file.type === 'application/json';
      if (!isJson && !ACCEPT.test(file.name)) { PB.toast('Unsupported file — use JSON, PDF, SVG or PNG', 'warn'); return; }
      // only the JSON path reads bytes into memory; a die file just records its filename, so it can be much larger
      if (isJson && file.size > JSON_MAX) { PB.toast('JSON too large (max 8 MB) — imposition files are usually a few KB', 'err'); return; }
      if (!isJson && file.size > ART_MAX) { PB.toast('File too large (max 80 MB)', 'err'); return; }
      setFileChip(file, isJson ? 'json' : 'art');
      if (isJson) {
        const reader = new FileReader();
        reader.onload = e => { try { applyParsed(JSON.parse(e.target.result)); } catch (err) { PB.toast('Could not parse JSON — check the file', 'err'); } };
        reader.onerror = () => PB.toast('Could not read file', 'err');
        reader.readAsText(file);
      } else { dieFile = file.name; if (!$('tn').value.trim()) { $('tn').value = file.name.replace(/\.[^.]+$/, ''); nameFromFile = true; } PB.toast(file.name + ' attached as die artwork', 'info'); }
    }

    const dz = $('dz'), fi = $('tplFile');
    dz.onclick = () => fi.click();
    dz.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fi.click(); } };
    fi.onchange = () => { if (fi.files[0]) readFile(fi.files[0]); fi.value = ''; };
    ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag'); }));
    dz.addEventListener('drop', e => { const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) readFile(f); });
    ['tc', 'tr', 'tw', 'th'].forEach(id => $(id).oninput = updatePreview);
    $('tn').oninput = () => { nameFromFile = false; };           // a manually-typed name is no longer "from file"
    $('tmax').oninput = () => { maxTouched = true; updatePreview(); };  // explicit N-up override wins over cols×rows
    updatePreview();

    $('dlSample').onclick = e => {
      e.preventDefault();
      const sample = { name: 'My 6up Template', rows: 3, cols: 2, sheet_w: 318, sheet_h: 646, bleed: 0.5, crop: true, printing: 'Sublimation' };
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(sample, null, 2)], { type: 'application/json' }));
      a.download = 'imposition-template-sample.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    };

    $('tCancel').onclick = () => PB.modal.close();
    $('tSave').onclick = () => {
      const c = numv('tc', 3), r = numv('tr', 2), name = $('tn').value.trim();
      if (!name) { PB.toast('Template name is required', 'warn'); $('tn').focus(); return; }
      if (PB.state.templates.some(t => t.name === name)) { PB.toast('A template named “' + name + '” already exists', 'warn'); return; }
      PB.state.templates.unshift({ name, max: Math.max(1, +$('tmax').value || c * r), cols: c, rows: r,
        sheet_w: +$('tw').value || 318, sheet_h: +$('th').value || 646, printing: $('tprint').value,
        productType: $('tprod').value, active: true, crop: true, source: dieFile || 'manual' });
      PB.save(); PB.modal.close(); PB.toast('Template created', 'ok'); PB.go('templates', name);
    };
  }
})();
