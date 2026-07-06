/* SKU Database — list (deep-linked) + detail PAGE at #/skus/:sku */
(function () {
  let tab = 'skus';

  PB.view('skus', (v, param) => { if (param) return detail(v, param); list(v); });

  /* ---------------- list ---------------- */
  function list(v) {
    const db = PB.data.sku_db, prods = db.products || [];
    v.innerHTML = PB.pageHead({
      title: 'SKU Database',
      sub: `${PB.fmt.num(prods.length)} products · ${db.models.length} models · ${db.case_types.length} casetypes · the master data behind rules & pickers`
    })
      + `<div class="tabs">
          <button class="tab ${tab === 'skus' ? 'active' : ''}" data-t="skus">Products / SKUs <span class="cnt">${prods.length}</span></button>
          <button class="tab ${tab === 'attrs' ? 'active' : ''}" data-t="attrs">Batchable attributes</button>
        </div><div id="body"></div>`;
    PB.qsa('[data-t]', v).forEach(b => b.onclick = () => { tab = b.dataset.t; list(v); });
    tab === 'skus' ? skusTab() : attrsTab();
  }

  function skusTab() {
    const prods = PB.data.sku_db.products || [];
    const cols = [
      { headerName: 'SKU', field: 'sku', minWidth: 150, cellRenderer: p => `<a href="${PB.link('skus', p.value)}" class="cell-link"><b class="mono">${PB.esc(p.value || '—')}</b></a>` },
      { headerName: 'Brand', field: 'brand', maxWidth: 110 },
      { headerName: 'Model', field: 'model', minWidth: 140 },
      { headerName: 'Casetype', field: 'case_type', minWidth: 130, cellRenderer: p => `<span class="case-dot" style="background:${PB.classColor(PB.caseClass(p.value))}"></span> ${PB.esc(p.value || '—')}` },
      { headerName: 'Printing', field: 'case_printing', maxWidth: 130, cellRenderer: p => p.value ? `<span class="badge ${p.value === 'UV' ? 'info' : 'live'}">${p.value}</span>` : '—' },
      { headerName: 'Finish', field: 'case_finish', maxWidth: 120 },
      { headerName: 'MagSafe', field: 'magsafe', maxWidth: 100, cellRenderer: p => p.value ? '✓' : '' },
      { headerName: 'Type', field: 'product_type', minWidth: 120 },
    ];
    PB.grid(PB.qs('#body'), cols, prods, { tall: true, pageSize: 50, searchPlaceholder: 'Search SKU, model, casetype…',
      onRowClicked: e => PB.go('skus', e.data.sku),
      card: r => `<a class="card pad clickable" href="${PB.link('skus', r.sku)}" style="display:block;text-decoration:none;color:inherit">
        <b class="mono">${PB.esc(r.sku || '—')}</b><div class="page-sub">${PB.esc(r.brand)} ${PB.esc(r.model)} · ${PB.esc(r.case_type)}</div></a>` });
  }

  function attrsTab() {
    const ATTR = [['BatchImposition', 'links to template', false], ['Brand', '', false], ['Model', '', true], ['CaseType', '', true],
      ['Finish', '', false], ['MagSafe', '', false], ['Print Code', '', false], ['Country', '', false], ['Customer Name', '', false], ['Description', '', false]];
    PB.qs('#body').innerHTML = `
      <div class="card">
        <div class="ntable-wrap" style="border:0"><table class="ntable"><thead><tr><th>#</th><th>Attribute</th><th>Note</th><th>Batchable (grouping dimension)</th></tr></thead><tbody>
        ${ATTR.map((a, i) => `<tr><td>${i + 1}</td><td><b>${a[0]}</b></td><td class="page-sub">${a[1]}</td>
          <td><span class="toggle ${a[2] ? 'on' : ''}" style="pointer-events:none"></span></td></tr>`).join('')}</tbody></table></div></div>
      <p class="page-sub" style="margin-top:10px">Only <b>Batchable</b> attributes (Model, CaseType — plus optional Print Code) are used as grouping dimensions by rules. <code>BatchImposition</code> assigns the layout/template.</p>`;
  }

  /* ---------------- detail page ---------------- */
  function detail(v, sku) {
    const prods = PB.data.sku_db.products || [];
    const p = prods.find(x => x.sku === sku);
    if (!p) { v.innerHTML = PB.pageHead({ title: 'SKU not found', back: ['skus'] }) + '<div class="empty">No product with that SKU.</div>'; return; }
    const cls = PB.caseClass(p.case_type);
    const item = { sku: p.sku, model: p.model, case_type: p.case_type };
    const rule = PB.resolveRule(item);
    const tpl = rule ? PB.state.templates.find(t => t.name === rule.template) : null;
    const related = prods.filter(x => x.model === p.model && x.sku !== p.sku).slice(0, 16);
    // rules whose SCOPE actually targets this SKU (same PB.ruleScope as the resolver), most specific first
    const matchRules = PB.state.rules.filter(r => r.active && r.type !== 'reprint' && PB.ruleScope(r, item))
      .sort((a, b) => PB._ruleScore(b) - PB._ruleScore(a)).slice(0, 8);

    v.innerHTML = PB.pageHead({
      back: ['skus'],
      crumbs: [{ label: 'SKU Database', route: ['skus'] }, { label: p.sku }],
      title: `<span class="mono">${PB.esc(p.sku)}</span>`,
      sub: `${PB.esc(p.brand || '')} ${PB.esc(p.model || '')} · ${PB.esc(p.case_type || '')}`,
      actions: rule ? `<a class="btn outline" href="${PB.link('rules', rule.id)}">Batch rule →</a>` : ''
    })
      + `<div class="detail-grid">
          <div class="card pad">
            <h3 class="card-title" style="margin:0 0 12px">Attributes</h3>
            <div class="thumb" style="${PB.swatch(p.sku)};width:84px;height:84px;border-radius:12px;margin-bottom:14px"></div>
            <dl class="kv">
              <dt>Model</dt><dd>${PB.esc(p.model || '—')}</dd>
              <dt>Casetype</dt><dd><span class="case-dot" style="background:${PB.classColor(cls)}"></span> ${PB.esc(p.case_type || '—')}</dd>
              <dt>Case-class</dt><dd>${cls}</dd>
              <dt>Printing</dt><dd>${p.case_printing ? `<span class="badge ${p.case_printing === 'UV' ? 'info' : 'live'}">${p.case_printing}</span>` : '—'}</dd>
              <dt>Finish</dt><dd>${PB.esc(p.case_finish || '—')}</dd>
              <dt>MagSafe</dt><dd>${p.magsafe ? '✓ yes' : 'no'}</dd>
              <dt>Product type</dt><dd>${PB.esc(p.product_type || '—')}</dd>
              <dt>Brand</dt><dd>${PB.esc(p.brand || '—')}</dd>
            </dl>
          </div>
          <div>
            <div class="card pad" style="margin-bottom:14px">
              <h3 class="card-title" style="margin:0 0 12px">Batch routing</h3>
              ${rule ? `<dl class="kv">
                  <dt>Resolved rule</dt><dd><a href="${PB.link('rules', rule.id)}">${PB.esc(rule.name)}</a></dd>
                  <dt>Imposition</dt><dd>${tpl ? `<a href="${PB.link('templates', tpl.name)}">${PB.esc(tpl.name)}</a> · ${tpl.max}-up` : PB.esc(rule.template)}</dd>
                  <dt>Threshold</dt><dd>${rule.threshold}${rule.exact ? ' · exact' : ''}</dd>
                </dl>` : `<div class="empty" style="padding:14px">No active rule resolves this SKU — it would wait unbatched.</div>`}
              <div class="nav-section" style="padding-left:0;margin-top:12px">Where used · matching rules</div>
              <div class="chips">${matchRules.map(r => `<a class="chip" href="${PB.link('rules', r.id)}">${PB.esc(r.name)}</a>`).join('') || '<span class="page-sub">none</span>'}</div>
            </div>
            <div class="card pad">
              <h3 class="card-title" style="margin:0 0 4px">Related SKUs · same model <span class="cnt">${related.length}</span></h3>
              <div id="rel"></div>
            </div>
          </div>
        </div>`;

    if (related.length) {
      const cols = [
        { headerName: 'SKU', field: 'sku', minWidth: 150, cellRenderer: x => `<a href="${PB.link('skus', x.value)}" class="cell-link"><b class="mono">${PB.esc(x.value)}</b></a>` },
        { headerName: 'Casetype', field: 'case_type', minWidth: 130, cellRenderer: x => `<span class="case-dot" style="background:${PB.classColor(PB.caseClass(x.value))}"></span> ${PB.esc(x.value || '—')}` },
        { headerName: 'Printing', field: 'case_printing', maxWidth: 120, cellRenderer: x => x.value ? `<span class="badge ${x.value === 'UV' ? 'info' : 'live'}">${x.value}</span>` : '—' },
        { headerName: 'Finish', field: 'case_finish', minWidth: 110 },
      ];
      PB.grid(PB.qs('#rel'), cols, related, { pageSize: 10, search: related.length > 8, noPager: related.length <= 10,
        onRowClicked: e => PB.go('skus', e.data.sku),
        card: r => `<a class="card pad clickable" href="${PB.link('skus', r.sku)}" style="display:block;text-decoration:none;color:inherit"><b class="mono">${PB.esc(r.sku)}</b><div class="page-sub">${PB.esc(r.case_type)}</div></a>` });
    } else PB.qs('#rel').innerHTML = '<div class="empty" style="padding:14px">No other SKUs for this model in the snapshot.</div>';
  }
})();
