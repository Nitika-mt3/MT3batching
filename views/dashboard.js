/* Dashboard — customizable widget dashboard (parity with mt3narada Dashboard:
   widget registry + localStorage layout {id,size,on} + add/remove/resize/drag-reorder + customize mode). */
PB.view('dashboard', (v) => {
  const S = PB.state, D = PB.data;
  const LKEY = 'pb.dashLayout.v1';
  let editing = false;

  /* ---------- widget registry ---------- */
  const WIDGETS = {
    kpis:      { title: 'Overview', defSize: 'l', render: kpisHtml },
    recent:    { title: 'Recent batches', defSize: 'l', render: recentHtml, link: ['batches'] },
    byclass:   { title: 'Waiting pool by case-class', defSize: 'm', render: byClassHtml },
    attention: { title: 'Needs attention', defSize: 's', render: attentionHtml },
    templates: { title: 'Open buckets by template', defSize: 'm', render: byTemplateHtml },
    reprints:  { title: 'Reprints', defSize: 's', render: reprintsHtml },
  };
  const DEFAULT = [
    { id: 'kpis', size: 'l', on: true }, { id: 'recent', size: 'l', on: true },
    { id: 'byclass', size: 'm', on: true }, { id: 'attention', size: 's', on: true },
    { id: 'templates', size: 'm', on: false }, { id: 'reprints', size: 's', on: false },
  ];
  const SIZES = ['s', 'm', 'l'];
  function loadLayout() {
    try { const r = JSON.parse(localStorage.getItem(LKEY) || 'null');
      if (Array.isArray(r)) { const seen = new Set(), out = [];
        r.forEach(e => { if (WIDGETS[e.id] && !seen.has(e.id)) { seen.add(e.id); out.push({ id: e.id, size: SIZES.includes(e.size) ? e.size : WIDGETS[e.id].defSize, on: e.on !== false }); } });
        DEFAULT.forEach(d => { if (!seen.has(d.id)) out.push({ ...d, on: false }); });   // append newly-added widgets (off)
        return out; }
    } catch (e) {}
    return DEFAULT.map(d => ({ ...d }));
  }
  let layout = loadLayout();
  const save = () => { try { localStorage.setItem(LKEY, JSON.stringify(layout)); } catch (e) {} };

  /* ---------- shared bits ---------- */
  const metric = (color, icon, k, val, d, go) => `<a class="metric ${color} ${go ? 'clickable' : ''}" ${go ? `href="${PB.link(go)}"` : ''}>
      <div class="metric-icon">${icon}</div>
      <div class="metric-main"><div class="metric-k">${k}</div><div class="metric-v">${PB.fmt.num(val)}</div><div class="metric-d">${d}</div></div></a>`;
  const barRows = (rows, color) => { const max = Math.max(1, ...rows.map(r => r[1]));
    return rows.map(([label, n, c]) => `<div style="margin-bottom:11px">
        <div class="prog-lbl"><span>${c ? `<span class="case-dot" style="background:${c}"></span> ` : ''}${PB.esc(label)}</span><b>${PB.fmt.num(n)}</b></div>
        <div class="prog"><i style="width:${Math.round(n / max * 100)}%${c ? `;background:${c}` : (color ? `;background:${color}` : '')}"></i></div></div>`).join(''); };

  /* ---------- widget content renderers ---------- */
  function kpisHtml() {
    const waiting = S.pool.length, openBuckets = S.buckets.length;
    const liveBatches = S.batches.filter(b => b.status === 'live').length;
    const totalUnits = S.batches.reduce((s, b) => s + b.qty, 0);
    const reprintItems = (D.items || []).filter(i => /reprint/i.test(i.case_type || '')).length + S.batches.filter(b => b.mode === 'reprint').length;
    const nearClose = S.buckets.filter(b => b.progress >= 80).length;
    return `<div class="metric-row">
      ${metric('blue', '◳', 'Items waiting', waiting, 'ready to scan &amp; batch', 'reprints')}
      ${metric('orange', '◴', 'Open buckets', openBuckets, `${nearClose} near close (≥80%)`, 'buckets')}
      ${metric('green', '▥', 'Live batches', liveBatches, `${PB.fmt.num(totalUnits)} units in production`, 'batches')}
      ${metric('red', '⟲', 'Reprints', reprintItems, 'in the recent window', '')}</div>`;
  }
  function recentHtml() {
    return `<div class="ntable-wrap" style="border:0;border-radius:0">
      <table class="ntable"><thead><tr><th>Batch</th><th>Template</th><th>Batched by</th><th class="num">Qty</th><th>Status</th></tr></thead>
      <tbody>${S.batches.slice(0, 9).map(b => `<tr class="clickrow" data-openbatch="${PB.esc(b.id)}">
          <td><a href="${PB.link('batches', b.id)}" class="cell-link"><b class="mono">${PB.esc(b.number)}</b></a>${b.mode === 'merge' ? ' <span class="cell-tag merged">merged</span>' : b.mode === 'reprint' ? ' <span class="cell-tag">reprint</span>' : ''}</td>
          <td>${PB.esc(b.template)}</td>
          <td>${PB.batchByHtml(b)}</td>
          <td class="num">${b.qty}</td><td>${PB.statusChip(b.status)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No batches yet — go scan some.</td></tr>'}</tbody></table></div>`;
  }
  function byClassHtml() {
    const by = {}; S.pool.forEach(i => { const c = PB.caseClass(i.case_type); by[c] = (by[c] || 0) + 1; });
    const rows = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([c, n]) => [c, n, PB.classColor(c)]);
    return rows.length ? barRows(rows) : '<div class="empty">Pool empty.</div>';
  }
  function attentionHtml() {
    const hot = S.buckets.filter(b => b.progress >= 80).slice(0, 6);
    return hot.length ? hot.map(b => `<div class="row" style="justify-content:space-between;margin-top:9px">
        <span>${PB.esc(b.model)} · ${PB.esc(b.case_type)}</span><span class="badge warn">${b.progress}% · ${b.qty}/${b.threshold}</span></div>`).join('')
      : '<div class="page-sub">All buckets healthy.</div>';
  }
  function byTemplateHtml() {
    const by = {}; S.buckets.forEach(b => { by[b.template] = (by[b.template] || 0) + b.qty; });
    const rows = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 8);
    return rows.length ? barRows(rows, 'var(--primary)') : '<div class="empty">No open buckets.</div>';
  }
  function reprintsHtml() {
    const rp = (D.items || []).filter(i => /-RP\b/i.test(i.source_id || '')).length;
    const live = S.batches.filter(b => b.mode === 'reprint').length;
    return `<div class="metric-row" style="grid-template-columns:1fr 1fr">
      ${metric('red', '⟲', 'Reprint items', rp, 'in the recent window', '')}
      ${metric('orange', '▥', 'Reprint batches', live, 'in production', 'batches')}</div>`;
  }

  /* ---------- frame + grid ---------- */
  function frame(e) {
    const w = WIDGETS[e.id]; if (!w) return '';
    return `<div class="cd-widget cd-w-${e.size}" data-wid="${e.id}" ${editing ? 'draggable="true"' : ''}>
      <div class="cd-w-head">${editing ? '<span class="cd-grip" title="Drag to reorder">⠿</span> ' : ''}<span class="cd-w-title">${PB.esc(w.title)}</span>
        <div class="spacer" style="flex:1"></div>
        ${editing ? `<span class="cd-w-tools">${SIZES.map(s => `<button data-size="${s}" class="${e.size === s ? 'on' : ''}">${s.toUpperCase()}</button>`).join('')}<button data-hide title="Remove from dashboard">✕</button></span>`
          : (w.link ? `<a class="btn ghost sm" href="${PB.link(...w.link)}">View all →</a>` : '')}</div>
      <div class="cd-w-body">${w.render()}</div></div>`;
  }
  function render() {
    const on = layout.filter(e => e.on && WIDGETS[e.id]), off = layout.filter(e => !e.on && WIDGETS[e.id]);
    v.innerHTML = PB.pageHead({
      title: 'Dashboard',
      sub: `Live batching queue health · ${PB.fmt.num((D.items || []).length)} recent items · ${PB.fmt.num((D.rules || []).length)} rules`,
      actions: `<button class="btn outline" id="dashCustomize">${editing ? '✓ Done' : '⚙ Customize'}</button><button class="btn primary" data-go="reprints">⊹ Start batching</button>`,
    })
      + `<div class="cd-grid ${editing ? 'editing' : ''}" id="dgrid">${on.map(frame).join('') || '<div class="empty">No widgets — click Customize to add some.</div>'}</div>`
      + (editing ? `<div class="cd-avail"><div class="cd-avail-t">Available widgets</div>
          ${off.map(e => `<button class="cd-add" data-add="${e.id}">＋ ${PB.esc(WIDGETS[e.id].title)}</button>`).join('') || '<span class="page-sub">All widgets are on the dashboard.</span>'}</div>` : '');
    wire();
  }
  function wire() {
    const cust = PB.qs('#dashCustomize'); if (cust) cust.onclick = () => { editing = !editing; render(); };
    PB.qsa('[data-go]', v).forEach(el => el.onclick = () => PB.go(el.dataset.go));
    if (editing) {
      PB.qsa('.cd-widget [data-size]', v).forEach(b => b.onclick = () => { const id = b.closest('.cd-widget').dataset.wid, e = layout.find(x => x.id === id); if (e) { e.size = b.dataset.size; save(); render(); } });
      PB.qsa('.cd-widget [data-hide]', v).forEach(b => b.onclick = () => { const id = b.closest('.cd-widget').dataset.wid, e = layout.find(x => x.id === id); if (e) { e.on = false; save(); render(); } });
      PB.qsa('[data-add]', v).forEach(b => b.onclick = () => { const e = layout.find(x => x.id === b.dataset.add); if (e) { e.on = true; layout = layout.filter(x => x !== e); layout.push(e); save(); render(); } });
      let dragId = null;
      PB.qsa('.cd-widget', v).forEach(w => {
        w.addEventListener('dragstart', () => { dragId = w.dataset.wid; w.classList.add('dragging'); });
        w.addEventListener('dragend', () => w.classList.remove('dragging'));
        w.addEventListener('dragover', e => e.preventDefault());
        w.addEventListener('drop', e => { e.preventDefault(); const over = w.dataset.wid; if (!dragId || dragId === over) return;
          const from = layout.findIndex(x => x.id === dragId), to = layout.findIndex(x => x.id === over);
          if (from < 0 || to < 0) return; const [m] = layout.splice(from, 1); layout.splice(to, 0, m); save(); render(); });
      });
    } else {
      PB.qsa('[data-openbatch]', v).forEach(el => el.onclick = (e) => { if (e.target.closest('a')) return; PB.go('batches', el.dataset.openbatch); });
    }
  }
  render();
});
