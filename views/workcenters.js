/* Work-centers & devices (events + machines + schedule + agent jobs) */
(function () {
  let tab = 'centers';
  const DEVICES = [['Element Pro 6 4up Machine', 'Sublimation press', 'available'], ['Element Pro 6 6up Machine', 'Sublimation press', 'available'],
    ['EPSON SC-P6000', 'UV / large format', 'available'], ['P6000 — Line 1', 'Digital press', 'available'],
    ['ZDesigner ZD421', 'Label / greensheet (ZPL)', 'available'], ['DEL UV Printing 1', 'UV printer', 'busy']];

  function render(v) {
    v.innerHTML = `
      <div class="page-head"><div><h1 class="page-title">Work-centers &amp; devices</h1>
        <p class="page-sub">Production routing + machines. Press scheduling &amp; print-agent are advanced integrations.</p></div></div>
      <div class="tabs">
        ${[['centers', 'Work-centers'], ['devices', 'Devices'], ['schedule', 'Schedule'], ['agent', 'Recent agent jobs']].map(([k, l]) =>
          `<button class="tab ${tab === k ? 'active' : ''}" data-t="${k}">${l}${k !== 'centers' ? ' <span class="badge">stub</span>' : ''}</button>`).join('')}
      </div><div id="body"></div>`;
    PB.qsa('[data-t]').forEach(b => b.onclick = () => { tab = b.dataset.t; render(v); });
    ({ centers, devices, schedule, agent }[tab])();
  }

  function centers() {
    const evs = (Array.isArray(PB.data.events) ? PB.data.events : (PB.data.events.data || [])).slice(0, 30);
    PB.qs('#body').innerHTML = `<div class="ntable-wrap"><table class="ntable">
      <thead><tr><th>Code</th><th>Name</th><th>Description</th><th>Phase</th></tr></thead><tbody>
      ${evs.map((e, i) => `<tr><td>${e.code || i + 1}</td><td><b>${PB.esc(e.name || e.displayName || '—')}</b></td>
        <td class="page-sub">${PB.esc(e.description || e.phase || 'Print on digital printer')}</td>
        <td><span class="badge">${PB.esc(e.phase || e.type || 'print')}</span></td></tr>`).join('')
      || '<tr><td colspan="4" class="empty">No work-centers in snapshot.</td></tr>'}</tbody></table></div>
      <p class="page-sub" style="margin-top:10px">Work-centers (Essential / Bold / Classic / UV / …) are the production routing steps a batch flows through.</p>`;
  }
  function devices() {
    PB.qs('#body').innerHTML = `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr))">
      ${DEVICES.map(d => `<div class="card pad"><div class="row" style="justify-content:space-between">
        <b>${d[0]}</b><span class="badge ${d[2] === 'available' ? 'ok' : 'warn'} dot">${d[2]}</span></div>
        <div class="page-sub" style="margin-top:6px">${d[1]}</div></div>`).join('')}</div>
      <div class="card pad" style="margin-top:14px"><b>P6000 integration</b>
        <p class="page-sub">Send batch JDF directly to the press and record the job. <span class="badge">planned</span></p>
        <button class="btn outline sm" onclick="PB.toast('Press command sent (stub)','info')">▶ Test send to P6000</button></div>`;
  }
  function schedule() {
    const hours = [9, 10, 11, 12, 13, 14, 15, 16, 17];
    PB.qs('#body').innerHTML = `<div class="card pad" style="overflow-x:auto">
      <div style="display:grid;grid-template-columns:160px repeat(${hours.length},1fr);gap:1px;min-width:760px">
        <div></div>${hours.map(h => `<div class="page-sub" style="text-align:center">${h}:00</div>`).join('')}
        ${DEVICES.slice(0, 5).map((d, i) => `<div style="padding:8px 0;font-size:13px;font-weight:600">${d[0].split(' ').slice(0, 3).join(' ')}</div>
          ${hours.map(h => { const on = (i === 0 && h >= 16) || (i === 3 && h >= 15 && h < 17); return `<div style="height:30px;border-radius:5px;${on ? 'background:' + PB.classColor(i === 0 ? 'Bold' : 'Classic') : 'background:#f1f5f9'}"></div>`; }).join('')}`).join('')}
      </div></div>
      <p class="page-sub" style="margin-top:10px">Machine schedule (Gantt) — drag batches onto presses. <span class="badge">stub</span></p>`;
  }
  function agent() {
    const rows = PB.state.batches.slice(0, 8);
    PB.qs('#body').innerHTML = `<div class="ntable-wrap"><table class="ntable">
      <thead><tr><th>Status</th><th>Service</th><th>Job</th><th>Device</th><th>When</th></tr></thead><tbody>
      ${rows.map(b => `<tr><td><span class="badge ok dot">complete</span></td><td>Print</td>
        <td>greensheet · batch ${PB.esc(b.number)}</td><td>ZDesigner ZD421 · 300dpi ZPL</td><td>${PB.fmt.ago(b.created)}</td></tr>`).join('')
      || '<tr><td colspan="5" class="empty">No agent jobs.</td></tr>'}</tbody></table></div>
      <p class="page-sub" style="margin-top:10px">Print-agent log — greensheets &amp; labels dispatched to physical printers. <span class="badge">stub</span></p>`;
  }

  PB.view('workcenters', render);
})();
