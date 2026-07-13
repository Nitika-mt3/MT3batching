/* ============================================================================
   Pulse Batching — core: data, router, engine (rules/buckets/merge), UI helpers
   ========================================================================== */
window.PB = (function () {
  const PB = { data:{}, state:{}, views:{}, routes:[
    'orders','reprints','manual','buckets','batches','printlabels','reversal','work',
    'rules','templates','skus','printers','workcenters','dashboard','bulk' ] };
  const LS = 'pb.state.v4';   // v4: enlarged scan pool (+52 items) so 'Simulate scan' has plenty to pull; supersedes v3 curated demo

  /* ---------- identity: logged-in account + selectable operator (activities record BOTH) ---------- */
  PB.user = { name:'Nitika Jain', email:'nitikaj@getmt3.com', initials:'NJ' };   // logged-in account
  PB.operators = ['Nitika Jain','Arvind Kumar','Maria Santos','Chen Wei','Diego Rivera','Priya Nair'];
  PB.operator = (()=>{ try{ return localStorage.getItem('pb.operator')||PB.user.name; }catch(e){ return PB.user.name; } })();
  PB.setOperator = (name)=>{ PB.operator = name || PB.user.name; try{ localStorage.setItem('pb.operator', PB.operator); }catch(e){} };
  // managed printers → the print-target dropdowns (send-to-print reads presses; labels read ZPL/label devices)
  PB.presses = ()=> (PB.state.printers||[]).filter(p=>p.active!==false && p.status!=='offline' && p.status!=='retired' && !/label/i.test(p.type));
  PB.labelPrinters = ()=> (PB.state.printers||[]).filter(p=>p.active!==false && p.status!=='offline' && p.status!=='retired' && /label/i.test(p.type));

  /* ---------- tiny DOM helper ---------- */
  PB.el = (html) => { const t=document.createElement('template'); t.innerHTML=html.trim(); return t.content.firstElementChild; };
  PB.esc = (s) => String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  PB.qs = (s,r=document)=>r.querySelector(s); PB.qsa=(s,r=document)=>[...r.querySelectorAll(s)];

  /* ---------- format ---------- */
  const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  PB.fmt = {
    date(d){ if(!d) return '—'; const x=new Date(d); if(isNaN(x)) return String(d).slice(0,10);
      return `${MON[x.getMonth()]} ${x.getDate()}, ${x.getFullYear()}`; },
    dt(d){ if(!d) return '—'; const x=new Date(d); if(isNaN(x)) return String(d);
      let h=x.getHours(),m=String(x.getMinutes()).padStart(2,'0'),ap=h<12?'AM':'PM';h=h%12||12;
      return `${MON[x.getMonth()]} ${x.getDate()}, ${h}:${m} ${ap}`; },
    ago(d){ if(!d) return ''; const t=new Date(d); if(isNaN(t)) return ''; const s=(Date.now()-t)/1000; if(s<60)return'just now';
      if(s<3600)return Math.floor(s/60)+'m ago'; if(s<86400)return Math.floor(s/3600)+'h ago'; return Math.floor(s/86400)+'d ago'; },
    num(n){ return (n==null?0:n).toLocaleString(); }
  };

  /* ---------- case-class + colour + swatch ---------- */
  PB.caseClass = (ct='') => { const s=String(ct).toUpperCase();
    if(s.includes('BOLD')) return 'Bold';
    if(s.includes('CLAS')) return 'Classic';
    if(s.includes('ESSENTIAL')||s.includes('SLIM')) return 'Essential';
    if(s.includes('MIRROR')) return 'Mirror';
    if(s.includes('LUX')||s.includes('ALIGN')||s.includes('MAGSAFE')) return 'Luxe';
    if(s.includes('TOUGH')||s.includes('CLEAR')) return 'Clear';
    return 'Other'; };
  const CLASS_COLOR={Bold:'#1e293b',Classic:'#7c3aed',Essential:'#0ea5e9',Mirror:'#06b6d4',Luxe:'#d97706',Clear:'#64748b',Other:'#94a3b8'};
  PB.classColor=(c)=>CLASS_COLOR[c]||'#94a3b8';

  /* ---------- channel (direct vs amazon) + Current-Work class filters (HP-faithful) ---------- */
  PB.channelOf = (it) => (it && (it.source==='amazon' || String(it.sku||'').toUpperCase().startsWith('AMZ-'))) ? 'amazon' : 'direct';
  PB._uvSet = null;   // sku(upper) → UV lookup, built once from sku_db; reset in seed()
  PB.isUV = (it) => { if(!PB._uvSet){ PB._uvSet=new Set((((PB.data||{}).sku_db&&PB.data.sku_db.products)||[])
      .filter(p=>p&&p.sku&&p.case_printing==='UV').map(p=>String(p.sku).toUpperCase())); }
    return PB._uvSet.has(String((it&&it.sku)||'').toUpperCase()); };
  // current-work population = items still waiting (pool) + accumulating in open buckets
  PB.workPopulation = () => [ ...(PB.state.pool||[]), ...((PB.state.buckets||[]).flatMap(b=>b.items||[])) ];
  PB.workMatch = {
    Amazon:    it=>PB.channelOf(it)==='amazon',
    Classic:   it=>PB.caseClass(it.case_type)==='Classic',
    Bold:      it=>PB.caseClass(it.case_type)==='Bold',
    Reprint:   it=>!!(it.is_reprint||it.source==='reprint'),
    Essential: it=>PB.caseClass(it.case_type)==='Essential',
    Luxe:      it=>PB.caseClass(it.case_type)==='Luxe',
    Mirror:    it=>PB.caseClass(it.case_type)==='Mirror',
    Clear:     it=>PB.caseClass(it.case_type)==='Clear',
    'UV Print':it=>PB.isUV(it) };
  PB.WORK_FILTERS = ['Amazon','Classic','Bold','Reprint','Essential','Luxe','Mirror','Clear','UV Print'];
  PB.workCounts = () => { const pop=PB.workPopulation(), out={}; PB.WORK_FILTERS.forEach(k=>out[k]=pop.filter(PB.workMatch[k]).length); return out; };

  /* ---------- "Batch by" rendering (shared by buckets + batches) ----------
     A SPLIT dimension shows its single value (bold); a non-split dimension lists
     the actual values present in the row's items, falling back to "Multi …" only
     when there are no items. Print code shows when the resolving rule splits by it. */
  PB.batchSegs = (k) => {
    const items = k.items || [];
    const uniq = f => [...new Set(items.map(it => it[f]).filter(Boolean))];
    const rule = k.ruleId ? PB.state.rules.find(r => r.id === k.ruleId) : null;
    const seg = (val, multiLabel, field) => {
      if (val && !/^Multi /i.test(val)) return { html: `<b>${PB.esc(val)}</b>`, text: val };
      const vals = uniq(field);
      if (vals.length) return { html: vals.map(PB.esc).join(', '), text: vals.join(', ') };
      return { html: `<span style="color:var(--muted)">${PB.esc(multiLabel)}</span>`, text: multiLabel };
    };
    const out = [seg(k.model, 'Multi Model', 'model'), seg(k.case_type, 'Multi Casetype', 'case_type')];
    if (rule && rule.filterCode) { const codes = uniq('print_sku'); if (codes.length) out.push({ html: codes.map(c => `<b>${PB.esc(c)}</b>`).join(', '), text: codes.join(', ') }); }
    return out;
  };
  PB.batchByHtml = k => `<span class="case-dot" style="background:${PB.classColor(k.caseClass)}"></span> ${PB.batchSegs(k).map(s => s.html).join(' · ')}`;
  PB.batchByText = k => PB.batchSegs(k).map(s => s.text).join(' · ');
  function hash(s){let h=2166136261;for(let i=0;i<String(s).length;i++){h^=String(s).charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
  // collision-proof unique id (monotonic counter → unique even within one millisecond). For row keys + reprint ids.
  let _uidn=0; PB.uid=()=>'u'+Date.now().toString(36)+(++_uidn).toString(36);
  PB.swatch = (seed) => { const h=hash(seed); const a=h%360,b=(h>>9)%360;
    return `background:linear-gradient(135deg,hsl(${a} 70% 78%),hsl(${b} 65% 60%));`; };
  // printfile thumbnail: a real uploaded image, but ONLY a strictly-validated base64 data: URL of a known image type.
  // The anchored allow-list guarantees the value is base64-only (no quote/angle chars), so it is safe to inline in
  // style="…url('…')…" and a tampered localStorage / non-image upload simply falls back to the deterministic swatch.
  const SAFE_DATA_IMG = /^data:image\/(png|jpe?g|gif|webp|svg\+xml|avif|bmp);base64,[A-Za-z0-9+/=]+$/;
  PB.thumbStyle = (it) => (it && it.image && SAFE_DATA_IMG.test(it.image)) ? `background-image:url('${it.image}')` : PB.swatch((it && (it.print_sku || it.sku || it.source_id)) || '');

  /* ---------- audio + haptic feedback (configurable, multi-modal) ---------- */
  let AC=null; PB.fb={sound:true,haptic:true};
  PB.beep=(ok=true)=>{ if(!PB.fb.sound)return; try{AC=AC||new (window.AudioContext||window.webkitAudioContext)();
    const o=AC.createOscillator(),g=AC.createGain();o.connect(g);g.connect(AC.destination);
    o.frequency.value=ok?880:220;g.gain.value=.06;o.start();o.stop(AC.currentTime+(ok?.09:.18));}catch(e){} };
  PB.haptic=(ms=20)=>{ if(PB.fb.haptic&&navigator.vibrate)try{navigator.vibrate(ms);}catch(e){} };
  PB.feedback=(ok)=>{ PB.beep(ok); PB.haptic(ok?18:[40,30,40]); };

  /* ---------- toast ---------- */
  PB.toast=(msg,type='info',ms=2600)=>{ const t=PB.el(`<div class="toast ${type}">${PB.esc(msg)}</div>`);
    PB.qs('#toasts').appendChild(t); setTimeout(()=>{t.style.opacity='0';t.style.transition='.3s';setTimeout(()=>t.remove(),300);},ms); };

  /* ---------- promise-based confirm / alert / prompt (parity with mt3narada ConfirmModal; replaces native dialogs) ---------- */
  PB._dialog=(opts)=>new Promise(res=>{
    const o=typeof opts==='string'?{message:opts}:(opts||{}); const mode=o.mode||'confirm';
    const ov=PB.el(`<div class="confirm-overlay" role="dialog" aria-modal="true">
      <div class="confirm-modal">
        ${o.title?`<div class="confirm-title">${PB.esc(o.title)}</div>`:''}
        ${o.message?`<div class="confirm-message">${PB.esc(o.message)}</div>`:''}
        ${mode==='prompt'?(o.inputType==='textarea'
          ?`<textarea class="confirm-input confirm-textarea" rows="4" placeholder="${PB.esc(o.placeholder||'')}">${PB.esc(o.defaultValue||'')}</textarea>`
          :`<input class="confirm-input" type="text" placeholder="${PB.esc(o.placeholder||'')}" value="${PB.esc(o.defaultValue||'')}">`):''}
        <div class="confirm-actions">
          ${(mode!=='alert'&&o.cancelText!==null)?`<button class="confirm-btn confirm-btn-cancel">${PB.esc(o.cancelText||'Cancel')}</button>`:''}
          <button class="confirm-btn ${o.danger?'confirm-btn-danger':'confirm-btn-primary'}">${PB.esc(o.confirmText||'OK')}</button>
        </div>
      </div></div>`);
    const prev=document.activeElement; document.body.appendChild(ov); document.body.classList.add('overlay-open');
    const input=ov.querySelector('.confirm-input');
    const okBtn=ov.querySelector('.confirm-btn-primary,.confirm-btn-danger'), cancelBtn=ov.querySelector('.confirm-btn-cancel');
    const cancelVal=mode==='prompt'?null:(mode==='alert'?undefined:false);
    const okVal=()=>mode==='prompt'?(input?input.value:''):(mode==='alert'?undefined:true);
    const done=(v)=>{ ov.remove(); document.removeEventListener('keydown',onKey);
      if(!PB.qs('.confirm-overlay')&&!(PB.qs('#modal')&&PB.qs('#modal').classList.contains('open'))) document.body.classList.remove('overlay-open');
      if(prev&&prev.focus){try{prev.focus();}catch(e){}} res(v); };
    const onKey=(e)=>{ if(e.key==='Escape'){e.preventDefault();done(cancelVal);}
      else if(e.key==='Enter'&&!(e.target&&e.target.classList&&e.target.classList.contains('confirm-textarea'))){e.preventDefault();done(okVal());} };
    if(cancelBtn) cancelBtn.onclick=()=>done(cancelVal);
    if(okBtn) okBtn.onclick=()=>done(okVal());
    ov.onmousedown=(e)=>{ if(e.target===ov) done(cancelVal); };
    document.addEventListener('keydown',onKey);
    setTimeout(()=>{ const f=input||okBtn; if(f&&f.focus){ try{ f.focus(); if(input&&input.select) input.select(); }catch(e){} } },50);
  });
  PB.confirm=(o)=>PB._dialog(Object.assign(typeof o==='string'?{message:o}:{...o},{mode:'confirm'}));
  PB.alert  =(o)=>PB._dialog(Object.assign(typeof o==='string'?{message:o}:{...o},{mode:'alert',cancelText:null}));
  PB.prompt =(o,def)=>PB._dialog(typeof o==='string'?{message:o,defaultValue:def,mode:'prompt'}:Object.assign({...o},{mode:'prompt'}));

  /* ---------- status chip (parity with mt3narada deriveCombinedStatus + .status-* palette) ---------- */
  PB.statusChip=(status,extraClass='')=>{ const s=String(status||'').toLowerCase().trim();
    const map={ live:['Live','live'], active:['Live','live'], complete:['Complete','delivered'], completed:['Completed','delivered'],
      shipped:['Shipped','shipped'], delivered:['Delivered','delivered'], pending:['Pending','pending'], waiting:['Waiting','pending'],
      archived:['Archived','cancelled'], cancelled:['Cancelled','cancelled'], void:['Void','cancelled'],
      'in transit':['In Transit','transit'], transit:['In Transit','transit'], printready:['Print Ready','printready'], 'print ready':['Print Ready','printready'] };
    const m=map[s]||[status||'—','gray'];
    return `<span class="status-chip status-${m[1]} ${extraClass}">${PB.esc(m[0])}</span>`; };

  /* ---------- source / reprint chips (where an item entered batching) ---------- */
  // the 4 reprint sub-sources (doc) → human labels
  PB.SRC_SUB = { pulse:'Pulse request', orders:'Orders page', amazon:'Amazon bulk', scan:'Auto-scan' };
  PB.sourceLabel = (it) => { if(!it) return 'New order';
    if(it.source==='manual' || it._manual) return 'Manual';
    if(it.source==='reprint' || it.is_reprint) return 'Reprint · '+(PB.SRC_SUB[it.reprint_source]||'Reprint');
    if(it.source==='amazon') return 'Amazon bulk';
    return 'New order'; };
  PB.sourceClass = (it) => { if(!it) return 'src-order';
    if(it.source==='manual' || it._manual) return 'src-manual';
    if(it.source==='reprint' || it.is_reprint) return 'src-reprint';
    if(it.source==='amazon') return 'src-amazon';
    return 'src-order'; };
  PB.sourceChip = (it) => `<span class="source-chip ${PB.sourceClass(it)}">${PB.esc(PB.sourceLabel(it))}</span>`;
  // batch/bucket rows carry a set of items → show the single source, or "Mixed"; HP-mirror rows (no items) infer from mode
  PB.rowSourceChip = (row) => { const items=(row&&row.items)||[];
    if(items.length){ const labels=[...new Set(items.map(PB.sourceLabel))];
      return labels.length===1 ? PB.sourceChip(items[0]) : `<span class="source-chip src-mixed" title="${PB.esc(labels.join(', '))}">Mixed</span>`; }
    if(row && row.mode==='reprint') return PB.sourceChip({ source:'reprint', reprint_source:row.reprint_source||'orders' });
    return PB.sourceChip({ source:'order' }); };
  // plain text for filter/sort/valueGetter (item or batch/bucket row)
  PB.sourceText = (x) => { const items=(x&&x.items);
    if(Array.isArray(items)){ const labels=[...new Set(items.map(PB.sourceLabel))]; return labels.length>1?'Mixed':(labels[0]||'New order'); }
    if(x && (x.mode==='reprint') && !items) return 'Reprint · Orders page';
    return PB.sourceLabel(x); };

  /* ---------- focusable-elements helper (for the modal focus trap) ---------- */
  const FOCUS_SEL='a[href],button:not([disabled]),input:not([type=hidden]):not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  const focusables=(root)=>PB.qsa(FOCUS_SEL,root).filter(el=>el.offsetParent!==null||el===document.activeElement);

  /* ---------- drawer (side panel — for lightweight, contextual content) ---------- */
  PB.drawer={ open(title,html){ PB.qs('#drawerTitle').innerHTML=title; PB.qs('#drawerBody').innerHTML=html;
      PB.qs('#drawer').classList.add('open'); PB.qs('#drawerScrim').classList.add('open'); document.body.classList.add('overlay-open'); },
    close(){ PB.qs('#drawer').classList.remove('open'); PB.qs('#drawerScrim').classList.remove('open');
      if(!PB.qs('#modal')||!PB.qs('#modal').classList.contains('open')) document.body.classList.remove('overlay-open'); } };

  /* ---------- centered modal popup (accessible dialog — for focused create/upload flows) ---------- */
  PB.modal={ _opener:null, _trap:null,
    open(title,html){
      const m=PB.qs('#modal'), body=PB.qs('#modalBody');
      PB.qs('#modalTitle').innerHTML=title; body.innerHTML=html;
      this._opener=document.activeElement;                                   // remember trigger for focus-return
      const desc=body.querySelector('.modal-sub');                           // associate intro text as the dialog description
      if(desc){ if(!desc.id) desc.id='modalDesc'; m.setAttribute('aria-describedby',desc.id); } else m.removeAttribute('aria-describedby');
      m.classList.add('open'); m.setAttribute('aria-hidden','false');
      PB.qs('#modalScrim').classList.add('open'); document.body.classList.add('overlay-open');
      PB.qsa('.topbar,.layout,#drawer').forEach(el=>el.setAttribute('inert',''));   // make the rest of the page inert (focus + AT)
      this._trap=(e)=>{ if(e.key!=='Tab') return; const f=focusables(m); if(!f.length) return;
        const first=f[0], last=f[f.length-1];
        if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); }
        else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); } };
      m.addEventListener('keydown',this._trap);
      const ff=focusables(body); if(ff.length) setTimeout(()=>ff[0].focus(),60); },  // focus first BODY field, not the X
    close(){
      const m=PB.qs('#modal'), s=PB.qs('#modalScrim');
      if(m){ if(this._trap){ m.removeEventListener('keydown',this._trap); this._trap=null; }
        if(m.contains(document.activeElement)&&document.activeElement.blur) document.activeElement.blur();  // move focus out before aria-hidden
        m.classList.remove('open'); m.setAttribute('aria-hidden','true'); }
      if(s) s.classList.remove('open');
      PB.qsa('.topbar,.layout,#drawer').forEach(el=>el.removeAttribute('inert'));
      document.body.classList.remove('overlay-open');
      if(this._opener&&this._opener.focus){ try{ this._opener.focus(); }catch(e){} } this._opener=null; } };

  /* ---------- page header / breadcrumb ---------- */
  PB.pageHead=(o={})=>{
    const crumbs=(o.crumbs||[]).map((c,i,a)=> (c.route && i<a.length-1)
      ? `<a href="${PB.link(...c.route)}">${PB.esc(c.label)}</a>` : `<span>${PB.esc(c.label)}</span>`).join('<i class="bc-sep">/</i>');
    return `<div class="page-head">
      ${o.back?`<a class="backlink" href="${PB.link(...o.back)}" title="Back">←</a>`:''}
      <div class="ph-main">${crumbs?`<div class="breadcrumb">${crumbs}</div>`:''}
        <h1 class="page-title">${o.title||''}</h1>${o.sub?`<p class="page-sub">${o.sub}</p>`:''}</div>
      <div class="spacer"></div><div class="page-actions">${o.actions||''}</div></div>`;
  };

  /* ---------- data table (vanilla, parity with mt3narada NordicTable) + mobile cards ----------
     Accepts AG-style colDefs (field/headerName/cellRenderer/valueGetter/valueFormatter/checkboxSelection/
     type:'numericColumn'/minWidth/sortable/filter…) and returns an AG-compatible `api` shim
     (setGridOption('rowData'|'quickFilterText'), getSelectedRows, deselectAll, destroy) so views are unchanged. */
  let _gid=0;
  const SORT_ICON='<span class="sort-icon"><svg class="sort-arrow-up" viewBox="0 0 8 5" fill="currentColor"><path d="M4 0L8 5H0z"/></svg><svg class="sort-arrow-down" viewBox="0 0 8 5" fill="currentColor"><path d="M4 5L0 0h8z"/></svg></span>';
  const FILTER_ICON=(a)=>`<svg class="col-filter-icon ${a?'active':''}" width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M1.5 2h13L9.5 8.5V13l-3 1.5V8.5L1.5 2z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" fill="${a?'currentColor':'none'}"/></svg>`;
  PB.grid=(mount, colDefs, rows, opts={})=>{
    if(mount.__pbGridApi){ try{ mount.__pbGridApi.destroy(); }catch(e){} mount.__pbGridApi=null; }
    const id=++_gid, colKey=opts.gridKey?('pb.cols.'+opts.gridKey):null;
    let data=(rows||[]).slice(), qf='', sortKey=null, sortDir=null, page=1;
    let pageSize=opts.noPager?Infinity:(opts.pageSize||25);
    const colFilters={}; const sel=new Set();   // sel holds row OBJECT references (AG-compatible getSelectedRows)
    /* ---- column model from AG colDefs ---- */
    const cols=(colDefs||[]).map((cd,idx)=>{
      const checkbox=!!cd.checkboxSelection, action=!checkbox && !cd.headerName && !cd.field;
      const field=cd.field;
      const getVal = cd.valueGetter ? (row)=>cd.valueGetter({data:row}) : (row)=> field? row[field] : undefined;
      const renderCell = cd.cellRenderer ? (row)=>String(cd.cellRenderer({value:getVal(row), data:row}))
        : cd.valueFormatter ? (row)=>PB.esc(String(cd.valueFormatter({value:getVal(row), data:row})))
        : (row)=>{ const v=getVal(row); return PB.esc(v==null?'':String(v)); };
      return { colId:(field||('col'+idx)), label:cd.headerName||'', checkbox, action, headerCheckbox:!!cd.headerCheckboxSelection,
        sortable:!checkbox&&!action&&cd.sortable!==false&&!!(field||cd.valueGetter),
        filterable:!!opts.colFilters&&!checkbox&&!action&&cd.filter!==false&&!!field,
        numeric:cd.type==='numericColumn', minWidth:cd.minWidth, getVal, renderCell,
        hidden:false, order:(checkbox?-1:action?1000+idx:idx), _def:(checkbox?-1:action?1000+idx:idx) };
    });
    const ordered=()=>cols.slice().sort((a,b)=>a.order-b.order);
    const visible=()=>ordered().filter(c=>!c.hidden);
    if(colKey){ try{ const saved=JSON.parse(localStorage.getItem(colKey)||'null'); if(Array.isArray(saved)) saved.forEach((s,i)=>{ const c=cols.find(x=>x.colId===s.colId&&!x.checkbox&&!x.action); if(c){ c.hidden=!!s.hidden; c.order=i; } }); }catch(e){} }
    const persist=()=>{ if(colKey){ try{ localStorage.setItem(colKey, JSON.stringify(ordered().filter(c=>!c.checkbox&&!c.action&&c.label).map(c=>({colId:c.colId,hidden:c.hidden})))); }catch(e){} } };
    /* ---- pipeline: filter → sort (paging applied at render) ---- */
    const compute=()=>{ let r=data; const q=qf.trim().toLowerCase();
      if(q){ const vc=visible(); r=r.filter(row=>vc.some(c=>{ const v=c.getVal(row); return v!=null && String(v).toLowerCase().includes(q); })); }
      Object.keys(colFilters).forEach(k=>{ const set=colFilters[k]; const col=cols.find(c=>c.colId===k); if(set&&set.size&&col) r=r.filter(row=>{ const v=col.getVal(row); return set.has(v==null?'':String(v)); }); });
      if(sortKey){ const col=cols.find(c=>c.colId===sortKey); if(col){ const dir=sortDir==='desc'?-1:1; r=r.slice().sort((a,b)=>{ let av=col.getVal(a), bv=col.getVal(b);
        if(col.numeric){ return ((+av||0)-(+bv||0))*dir; } av=(av==null?'':String(av)).toLowerCase(); bv=(bv==null?'':String(bv)).toLowerCase(); return av<bv?-dir:av>bv?dir:0; }); } }
      return r; };
    /* ---- portal column-filter dropdown ---- */
    let _cf=null, _cfDoc=null;
    const closeCf=()=>{ if(_cf){ _cf.remove(); _cf=null; } if(_cfDoc){ document.removeEventListener('mousedown',_cfDoc); _cfDoc=null; } };
    const openCf=(colId, anchor)=>{ closeCf(); const col=cols.find(c=>c.colId===colId); if(!col) return;
      const vals=[...new Set(data.map(r=>{ const v=col.getVal(r); return v==null?'':String(v); }).filter(x=>x!==''))].sort((a,b)=>a.localeCompare(b));
      const local=new Set(colFilters[colId]||[]); const rect=anchor.getBoundingClientRect();
      _cf=PB.el(`<div class="col-filter-dropdown" style="top:${Math.round(rect.bottom+2)}px;left:${Math.round(rect.left)}px">
        <div class="col-filter-search"><input type="text" placeholder="Search…"></div>
        <div class="col-filter-list">${vals.length?vals.map(v=>`<label class="col-filter-item"><input type="checkbox" data-v="${PB.esc(v)}" ${local.has(v)?'checked':''}><span class="col-filter-value">${PB.esc(v)}</span></label>`).join(''):'<div class="col-filter-empty">No values</div>'}</div>
        <div class="col-filter-actions"><button class="col-filter-clear">Clear</button><button class="col-filter-apply">Apply${local.size?' ('+local.size+')':''}</button></div></div>`);
      document.body.appendChild(_cf);
      const s=_cf.querySelector('.col-filter-search input'); if(s){ s.focus(); s.oninput=()=>{ const q=s.value.toLowerCase(); _cf.querySelectorAll('.col-filter-item').forEach(it=>{ it.style.display=(it.querySelector('input').dataset.v||'').toLowerCase().includes(q)?'':'none'; }); }; }
      _cf.querySelectorAll('[data-v]').forEach(cb=>cb.onchange=()=>{ cb.checked?local.add(cb.dataset.v):local.delete(cb.dataset.v); });
      _cf.querySelector('.col-filter-apply').onclick=()=>{ if(local.size) colFilters[colId]=local; else delete colFilters[colId]; closeCf(); page=1; renderBody(); };
      _cf.querySelector('.col-filter-clear').onclick=()=>{ delete colFilters[colId]; closeCf(); page=1; renderBody(); };
      _cfDoc=(e)=>{ if(_cf && !_cf.contains(e.target) && !anchor.contains(e.target)) closeCf(); }; setTimeout(()=>document.addEventListener('mousedown',_cfDoc),0); };
    /* ---- pagination bar ---- */
    const pagerHtml=(total)=>{ const pages=Math.max(1,Math.ceil(total/pageSize)); if(opts.noPager||pages<=1) return '';
      const from=(page-1)*pageSize+1, to=Math.min(total,page*pageSize);
      const nums=[]; const add=n=>nums.push(`<button class="np-btn ${n===page?'active':''}" data-pg="${n}">${n}</button>`);
      const win=[1]; for(let n=page-1;n<=page+1;n++) if(n>1&&n<pages) win.push(n); if(pages>1) win.push(pages);
      let last=0; [...new Set(win)].sort((a,b)=>a-b).forEach(n=>{ if(last&&n-last>1) nums.push('<span class="np-gap">…</span>'); add(n); last=n; });
      return `<div class="nordic-pagination">
        <div class="np-left">Rows <select class="np-size">${[10,25,50,100,200].map(s=>`<option value="${s}" ${s===pageSize?'selected':''}>${s}</option>`).join('')}</select></div>
        <div class="np-mid"><button class="np-btn" data-pg="${Math.max(1,page-1)}" ${page<=1?'disabled':''}>‹</button>${nums.join('')}<button class="np-btn" data-pg="${Math.min(pages,page+1)}" ${page>=pages?'disabled':''}>›</button></div>
        <div class="np-right">${PB.fmt.num(from)}–${PB.fmt.num(to)} of ${PB.fmt.num(total)}</div></div>`; };
    /* ---- render ---- */
    let _pageRows=[];
    const colsBtn=(opts.columnsButton===false)?'':`<button class="btn ghost sm" id="cols${id}" title="Show / hide & reorder columns">⚙ Columns</button>`;
    const toolbar = opts.search===false ? '' :
      `<div class="grid-toolbar"><div class="qf"><span class="qf-ic">⌕</span><input id="qf${id}" placeholder="${opts.searchPlaceholder||'Quick filter…'}"></div><div class="grid-toolbar-right">${opts.toolbarRight||''}${colsBtn}</div></div>`;
    mount.innerHTML = toolbar + `<div class="nordic-table-container ${opts.tall?'tall':''}" id="ntbox${id}"></div>`
      + (opts.card?`<div class="mobile-cards" id="ntcards${id}"></div>`:'') + `<div id="ntpg${id}"></div>`;
    const host=mount.querySelector('#ntbox'+id), cardsEl=mount.querySelector('#ntcards'+id), pg=mount.querySelector('#ntpg'+id);
    if(opts.card) mount.classList.add('has-cards');   // desktop shows the table; mobile swaps to the card list (CSS)
    const api={};
    function renderBody(){
      const filtered=compute(); sel.forEach(r=>{ if(!filtered.includes(r)) sel.delete(r); });   // keep selection scoped to visible rows
      const pages=Math.max(1,Math.ceil(filtered.length/pageSize)); if(page>pages) page=pages; if(page<1) page=1;   // clamp so a filtered-down list never slices to empty
      _pageRows = opts.noPager? filtered : filtered.slice((page-1)*pageSize, page*pageSize);
      const vc=visible();
      const allSel = filtered.length>0 && filtered.every(r=>sel.has(r));
      const thead=`<thead><tr>${vc.map(c=>{
        if(c.checkbox) return `<th class="nt-checkcol"><input type="checkbox" class="nt-all" ${allSel?'checked':''} aria-label="Select all"></th>`;
        const sc=c.sortable?('sortable '+(sortKey===c.colId?(sortDir==='asc'?'sort-asc':'sort-desc'):'')):'';
        const fa=colFilters[c.colId]&&colFilters[c.colId].size;
        return `<th class="${sc} ${c.filterable?'filterable':''} ${fa?'filter-active':''} ${c.numeric?'num':''}" data-col="${PB.esc(c.colId)}" ${c.minWidth?`style="min-width:${c.minWidth}px"`:''}>
          <span class="th-content">${PB.esc(c.label)}${c.sortable?SORT_ICON:''}${c.filterable?`<span class="col-filter-trigger" data-filter="${PB.esc(c.colId)}" title="Filter">${FILTER_ICON(fa)}</span>`:''}</span></th>`; }).join('')}</tr></thead>`;
      const tbody=`<tbody>${_pageRows.length? _pageRows.map((row,i)=>`<tr data-i="${i}" class="${opts.onRowClicked?'clickable':''} ${sel.has(row)?'nt-sel':''}">${vc.map(c=>
        c.checkbox? `<td class="nt-checkcol"><input type="checkbox" class="nt-row" ${sel.has(row)?'checked':''}></td>` : `<td class="${c.numeric?'num':''}">${c.renderCell(row)}</td>`).join('')}</tr>`).join('')
        : `<tr><td colspan="${vc.length||1}"><div class="nordic-table-empty">${PB.esc(opts.emptyText||'No rows.')}</div></td></tr>`}</tbody>`;
      host.innerHTML=`<table class="nordic-table">${thead}${tbody}</table>`;
      if(cardsEl) cardsEl.innerHTML = _pageRows.length? _pageRows.map(opts.card).join('') : `<div class="empty">${PB.esc(opts.emptyText||'No rows.')}</div>`;
      if(pg) pg.innerHTML=pagerHtml(filtered.length);
      // wire body
      host.querySelectorAll('th.sortable').forEach(th=>th.onclick=(e)=>{ if(e.target.closest('.col-filter-trigger'))return; const k=th.dataset.col;
        if(sortKey===k){ sortDir = sortDir==='asc'?'desc':(sortDir==='desc'?(sortKey=null,null):'asc'); } else { sortKey=k; sortDir='asc'; } renderBody(); });
      host.querySelectorAll('.col-filter-trigger').forEach(t=>t.onclick=(e)=>{ e.stopPropagation(); openCf(t.dataset.filter, t); });
      if(opts.onRowClicked) host.querySelectorAll('tbody tr[data-i]').forEach(tr=>tr.onclick=(e)=>{ if(e.target.closest('input,button,a,[data-act],[data-bact]'))return; const row=_pageRows[+tr.dataset.i]; if(row) opts.onRowClicked({data:row}); });
      host.querySelectorAll('.nt-row').forEach((cb,i)=>cb.onchange=()=>{ const row=_pageRows[i]; if(!row)return; cb.checked?sel.add(row):sel.delete(row); if(opts.onSelectionChanged) opts.onSelectionChanged({api}); renderBody(); });
      const all=host.querySelector('.nt-all'); if(all) all.onchange=()=>{ filtered.forEach(r=>all.checked?sel.add(r):sel.delete(r)); if(opts.onSelectionChanged) opts.onSelectionChanged({api}); renderBody(); };
      if(pg){ const sz=pg.querySelector('.np-size'); if(sz) sz.onchange=()=>{ const first=(page-1)*pageSize; pageSize=+sz.value; page=Math.floor(first/pageSize)+1; renderBody(); };
        pg.querySelectorAll('[data-pg]').forEach(b=>b.onclick=()=>{ if(b.disabled)return; page=+b.dataset.pg; renderBody(); }); }
    }
    mount.__pbGridApi=api;
    api._cols=colDefs; api._opts=opts; try{ Object.defineProperty(api,'_rowData',{get:()=>data,configurable:true}); }catch(e){}   // introspection for tests
    Object.assign(api,{
      setGridOption(k,v){ if(k==='rowData'){ data=(v||[]).slice(); renderBody(); } else if(k==='quickFilterText'){ qf=v||''; page=1; renderBody(); } },
      getSelectedRows(){ return [...sel]; },
      deselectAll(){ sel.clear(); renderBody(); if(opts.onSelectionChanged) opts.onSelectionChanged({api}); },
      forEachNode(fn){ data.forEach((d,i)=>fn({data:d,rowIndex:i})); }, sizeColumnsToFit(){}, refreshCells(){},
      pbCols(){ return ordered().filter(c=>!c.checkbox&&!c.action&&c.label).map(c=>({colId:c.colId,label:c.label,hidden:c.hidden})); },
      pbApply(state){ state.forEach((s,i)=>{ const c=cols.find(x=>x.colId===s.colId); if(c){ c.hidden=!!s.hidden; c.order=i; } }); persist(); renderBody(); },
      pbReset(){ cols.forEach(c=>{ c.hidden=false; c.order=c._def; }); if(colKey){ try{ localStorage.removeItem(colKey); }catch(e){} } renderBody(); },
      destroy(){ closeCf(); },
    });
    renderBody();
    if(toolbar){ const q=mount.querySelector('#qf'+id); if(q) q.oninput=()=>{ qf=q.value; page=1; renderBody(); };
      const cb=mount.querySelector('#cols'+id); if(cb) cb.onclick=()=>PB.columnConfig(api, colKey); }
    return api;
  };

  /* ---------- column-config modal: show/hide + reorder (ColumnConfigModal parity), persisted per grid ---------- */
  PB.columnConfig=(api)=>{
    if(!api||!api.pbCols) return; let st=api.pbCols();
    const draw=()=>`<div class="col-cfg">${st.map((s,i)=>`<div class="cc-row">
        <label class="cc-show"><input type="checkbox" data-vis="${i}" ${s.hidden?'':'checked'}> ${PB.esc(s.label)}</label>
        <span class="cc-ord"><button data-up="${i}" ${i===0?'disabled':''} title="Move up">↑</button><button data-dn="${i}" ${i===st.length-1?'disabled':''} title="Move down">↓</button></span>
      </div>`).join('')}</div>
      <div class="row" style="justify-content:space-between;margin-top:14px"><button class="btn ghost sm" id="ccReset">Reset to default</button><button class="btn primary" id="ccDone">Done</button></div>`;
    const refresh=()=>{ const b=PB.qs('#modalBody'); if(b){ b.innerHTML=draw(); wire(); } };
    const wire=()=>{
      PB.qsa('#modalBody [data-vis]').forEach(cb=>cb.onchange=()=>{ st[+cb.dataset.vis].hidden=!cb.checked; api.pbApply(st); });
      PB.qsa('#modalBody [data-up]').forEach(b=>b.onclick=()=>{ const i=+b.dataset.up; if(i>0){ [st[i-1],st[i]]=[st[i],st[i-1]]; api.pbApply(st); refresh(); } });
      PB.qsa('#modalBody [data-dn]').forEach(b=>b.onclick=()=>{ const i=+b.dataset.dn; if(i<st.length-1){ [st[i+1],st[i]]=[st[i],st[i+1]]; api.pbApply(st); refresh(); } });
      const r=PB.qs('#ccReset'); if(r) r.onclick=()=>{ api.pbReset(); st=api.pbCols(); refresh(); };
      const d=PB.qs('#ccDone'); if(d) d.onclick=()=>PB.modal.close();
    };
    PB.modal.open('Columns', draw()); wire();
  };

  /* ---------- searchable dropdown (single + multi) ---------- */
  // Mount into an element; options = [string|{value,label}]. Single: opts.value + onChange(value). Multi: opts.values[] + onChange(values[]).
  PB.dropdown = (mount, o = {}) => {
    if (!mount) return null;
    const norm = x => (x && typeof x === 'object') ? { value: String(x.value), label: String(x.label) } : { value: String(x), label: String(x) };
    const options = (o.options || []).map(norm);
    const multi = !!o.multi;
    let sel = multi ? new Set((o.values || []).map(String)) : (o.value != null ? String(o.value) : '');
    const labelFor = v => { const f = options.find(op => op.value === v); return f ? f.label : v; };
    const ph = o.placeholder || (multi ? 'All' : 'Select…');
    mount.classList.add('dd-wrap');
    mount.innerHTML = `<button type="button" class="dd" aria-haspopup="listbox" aria-expanded="false">
        <span class="dd-val"></span><span class="dd-caret" aria-hidden="true">▾</span></button>
      <div class="dd-panel" hidden>
        <div class="dd-search"><input class="dd-input" type="text" placeholder="Search…" aria-label="Search ${PB.esc(o.label || 'options')}"></div>
        <div class="dd-opts" role="listbox" aria-multiselectable="${multi}"></div></div>`;
    const ctrl = mount.querySelector('.dd'), panel = mount.querySelector('.dd-panel'),
      valEl = mount.querySelector('.dd-val'), input = mount.querySelector('.dd-input'), listEl = mount.querySelector('.dd-opts');
    const renderVal = () => {
      valEl.textContent = multi ? ([...sel].map(labelFor).join(', ') || ph) : (sel ? labelFor(sel) : ph);
      valEl.classList.toggle('dd-ph', multi ? !sel.size : !sel);
    };
    const renderOpts = () => {
      const q = input.value.trim().toLowerCase();
      const shown = options.filter(op => !q || op.label.toLowerCase().includes(q));
      listEl.innerHTML = shown.length
        ? shown.map(op => { const on = multi ? sel.has(op.value) : sel === op.value;
            return `<div class="dd-opt ${on ? 'on' : ''}" role="option" aria-selected="${on}" data-v="${PB.esc(op.value)}">${multi ? `<span class="dd-box">${on ? '✓' : ''}</span>` : ''}<span class="dd-lbl">${PB.esc(op.label)}</span></div>`; }).join('')
        : '<div class="dd-empty">No matches</div>';
      listEl.querySelectorAll('.dd-opt').forEach(el => el.onmousedown = e => {
        e.preventDefault();   // act before the outside-mousedown handler closes the panel
        const v = el.dataset.v;
        if (multi) { sel.has(v) ? sel.delete(v) : sel.add(v); renderVal(); const st = listEl.scrollTop; renderOpts(); listEl.scrollTop = st; o.onChange && o.onChange([...sel]); }
        else { sel = v; renderVal(); close(); ctrl.focus(); o.onChange && o.onChange(v); }
      });
    };
    const open = () => { PB.qsa('.dd-panel').forEach(p => { if (p !== panel) p.hidden = true; }); panel.hidden = false; ctrl.setAttribute('aria-expanded', 'true'); input.value = ''; renderOpts(); setTimeout(() => input.focus(), 0); };
    const close = () => { panel.hidden = true; ctrl.setAttribute('aria-expanded', 'false'); };
    ctrl.onclick = () => (panel.hidden ? open() : close());
    ctrl.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); panel.hidden ? open() : close(); } else if (e.key === 'Escape') close(); };
    input.oninput = renderOpts;
    input.onkeydown = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); ctrl.focus(); } };
    renderVal();
    return { value: () => multi ? [...sel] : sel, close,
      set: v => { sel = multi ? new Set((v || []).map(String)) : (v != null ? String(v) : ''); renderVal(); if (!panel.hidden) renderOpts(); } };
  };

  /* ---------- templates (from impositions) ---------- */
  function maxOf(imp){ const c=(imp.cols||1)*(imp.rows||1); return c||1; }
  function buildTemplates(){
    const list=(PB.data.impositions.list||[]).filter(i=>i.active);
    const seen=new Set(); const out=[];
    list.forEach(i=>{ if(!i.name||seen.has(i.name))return; seen.add(i.name);
      const sub=/sublimation|sub|casely|amazon|artisti|orders/i.test(i.name)&&!/uv|lux|mirror/i.test(i.name);
      out.push({ name:i.name, max:maxOf(i), rows:i.rows, cols:i.cols, sheet_w:i.sheet_w, sheet_h:i.sheet_h,
        printing: /uv|lux|mirror/i.test(i.name)?'UV':'Sublimation',
        productType:'Phone Case', active:true, _id:i._id, geom:(PB.data.impositions.full||{})[i.name]||null }); });
    return out;
  }

  /* ---------- load rules (data/rules.json is authored in the internal shape) ---------- */
  function buildRules(){
    const WEEK={mon:true,tue:true,wed:true,thu:true,fri:true,sat:false,sun:false};
    return (PB.data.rules||[]).map((r,idx)=>Object.assign({
      id:'R'+idx, name:'Rule '+idx, active:true, type:'standard', caseClass:'Any', template:(PB.state.templates[0]||{}).name||'6up_Sublimation',
      threshold:6, maxThreshold:6, exact:false, singlesSplit:false, byShipDate:false,
      closeMode:'manual', closeTimes:['17:00'], closeDays:{...WEEK},
      filterModel:true, filterCase:true, filterCode:false, filterSku:false,
      models:[], casetypes:[], printcodes:[], skuList:[], prefix:'', prefixMode:'include', reprintMergeReprints:false,
    }, r, {
      models:Array.isArray(r.models)?r.models:[], casetypes:Array.isArray(r.casetypes)?r.casetypes:[],
      printcodes:Array.isArray(r.printcodes)?r.printcodes:[], skuList:Array.isArray(r.skuList)?r.skuList:[],
    }));
  }

  /* ---------- rule resolver — SCOPE-based ---------- */
  // a rule's prefixes (comma-separated, case-insensitive)
  PB.prefixesOf=(rule)=>String(rule&&rule.prefix||'').split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);
  // prefix eligibility: include → sku must start with a prefix; exclude → sku must NOT start with any prefix.
  PB.prefixEligible=(rule,sku)=>{ const ps=PB.prefixesOf(rule); if(!ps.length) return true;
    const hit=ps.some(p=>String(sku||'').toUpperCase().startsWith(p)); return rule.prefixMode==='exclude'? !hit : hit; };
  // does this rule's SCOPE target this item? caseClass 'Any' = any class; empty filters = any value; a FULLY-unscoped
  // rule (Any class, no casetypes/models/printcodes/skuList, no include-prefix) matches NOTHING (must be scoped).
  // (Single source of truth — also used by the SKU-preview + SKU-detail. print-codes narrow further at item level.)
  PB.ruleScope=(rule,item)=>{ if(!rule) return false; const sku=String(item.sku||'').toUpperCase();
    if(!PB.prefixEligible(rule,sku)) return false;
    const ps=PB.prefixesOf(rule), incPrefix=ps.length && rule.prefixMode!=='exclude';
    const hasClass=rule.caseClass && rule.caseClass!=='Any';
    const cases=rule.casetypes||[], models=rule.models||[], codes=rule.printcodes||[], skus=rule.skuList||[];
    if(!hasClass && !cases.length && !models.length && !codes.length && !skus.length && !incPrefix) return false;   // unconfigured
    if(hasClass && rule.caseClass!==PB.caseClass(item.case_type)) return false;
    if(cases.length && !cases.includes(item.case_type)) return false;
    if(models.length && !models.includes(item.model)) return false;
    if(codes.length && item.print_sku!=null && !codes.includes(item.print_sku)) return false;
    if(skus.length && !skus.map(s=>String(s).toUpperCase()).includes(sku)) return false;
    return true; };
  // specificity — the most specific scoped rule wins (include-prefix > SKU > print-code > casetype > model ≈ class)
  PB._ruleScore=(rule)=>{ let s=0; const ps=PB.prefixesOf(rule);
    if(ps.length && rule.prefixMode!=='exclude') s+=16; if((rule.skuList||[]).length) s+=8;
    if((rule.printcodes||[]).length) s+=4; if((rule.casetypes||[]).length) s+=2;
    if((rule.models||[]).length) s+=1; if(rule.caseClass && rule.caseClass!=='Any') s+=1; return s; };
  PB.resolveRule=(item)=>{
    // reprint-type rules never route — a reprint follows its ORDER's product rule (re-resolved by attributes).
    const cands=PB.state.rules.filter(r=>r.active && r.type!=='reprint' && PB.ruleScope(r,item));
    if(!cands.length) return null;   // no scoped rule → UNMATCHED, surfaced as "needs a rule"
    return cands.reduce((best,r)=>PB._ruleScore(r)>PB._ruleScore(best)?r:best, cands[0]); };

  // catalog SKUs (sku_db) this rule's scope targets — for the editor's live preview + CSV download. Same PB.ruleScope
  // as the resolver. Print-codes narrow at the ITEM level (catalog products carry no print_sku), so they're ignored
  // here. Returns [] when the rule has no SKU-level scope (unconfigured, exclude-prefix-only, or print-code-only).
  PB.matchingSkus=(rule)=>{ const prods=(PB.data.sku_db&&PB.data.sku_db.products)||[]; if(!rule) return [];
    const inc=PB.prefixesOf(rule).length && rule.prefixMode!=='exclude';
    const skuScoped=(rule.caseClass&&rule.caseClass!=='Any')||(rule.casetypes||[]).length||(rule.models||[]).length||(rule.skuList||[]).length||inc;
    if(!skuScoped) return [];
    const r={...rule, printcodes:[]};
    return prods.filter(p=>p&&p.sku&&PB.ruleScope(r,{sku:p.sku,case_type:p.case_type,model:p.model})); };

  /* ---------- bucketing key + fill ---------- */
  // reprint segment — reprints are ALWAYS separate from new orders (never 'NEW'); the rule's single toggle decides
  // whether the rule's reprints pool together or stay isolated per original order:
  //   not a reprint                        → 'NEW'
  //   reprint, rule merges reprints (ON)   → 'RP'          (all reprints under the rule pool together)
  //   reprint, no merge (OFF, default)     → 'RP:<order>'  (isolated per original order)
  PB._reprintSeg=(rule,item)=>{ if(!item || !(item.is_reprint||item.source==='reprint')) return 'NEW';
    if(rule && rule.reprintMergeReprints) return 'RP';
    return 'RP:'+(item.source_id||item.component_barcode||item.item_barcode||'x'); };
  PB.bucketKey=(rule,item)=>[rule.id, rule.filterModel?item.model:'*', rule.filterCase?item.case_type:'*',
      rule.filterCode?item.print_sku:'*', PB._reprintSeg(rule,item)].join('|');

  PB.tplMax=(name)=>{ const t=PB.state.templates.find(t=>t.name===name); return t?t.max:6; };

  // group a set of (resolved) items into closed batches + a remainder bucket per key
  PB.formItems=(items)=>{
    const groups={};
    items.forEach(it=>{ const r=it._rule; if(!r)return; const k=PB.bucketKey(r,it);
      (groups[k]=groups[k]||{rule:r,key:k,items:[]}).items.push(it); });
    const made={batches:[],buckets:[]};
    Object.values(groups).forEach(g=>{ const max=PB.tplMax(g.rule.template); let q=[...g.items];
      while(q.length>=max){ made.batches.push(mkBatch(g.rule,q.splice(0,max),'auto')); }
      if(q.length) made.buckets.push(mkBucket(g.rule,q,g.key));
    });
    return made; };

  let _bn=Math.max(0,...(PB.data?.batches||[]).map(b=>+b.main_batch_number||0))||500000;  // re-seeded from restored state in seed()
  let _kn=0;   // monotonic bucket-id counter (re-seeded from restored buckets in seed())
  function mkBatch(rule,items,mode,name){ _bn++; items=(items||[]).map(stripTransient); const first=items[0]||{}; const cls=PB.caseClass(first.case_type);
    const now=new Date().toISOString();
    return { id:'B'+_bn, number:name||String(_bn), name, rule:rule.name, ruleId:rule.id, template:rule.template,
      model: rule.filterModel? first.model : 'Multi Model', case_type: rule.filterCase? first.case_type : 'Multi Casetype',
      caseClass:cls, qty:items.reduce((s,i)=>s+(+i.qty||1),0), items, status:'live', current_event:cls, mode,
      created:now, barcode:'PB-'+_bn,
      history:[{ at:now, action:'created', by: mode==='auto'?'Auto-batch (rule close)':(PB.operator||PB.user.name) }] }; }
  // append an activity to a batch's history (records who = current operator + the logged-in account, + printer/detail)
  PB.logActivity=(b, action, extra)=>{ if(!b) return; (b.history=b.history||[]).unshift(
    Object.assign({ at:new Date().toISOString(), action, by:(PB.operator||PB.user.name), account:PB.user.name }, extra||{}));
    try{ PB.save(); }catch(e){} };
  // minimal, valid one-page PDF of the batch summary (real download; the backend imposition PDF is the production artefact)
  PB.downloadBatchPdf=(b)=>{ if(!b) return;
    const L=['Pulse Batching — Batch '+b.number, '', 'Template: '+(b.template||'—'), 'Batched by: '+(b.model||'')+' / '+(b.case_type||''),
      'Rule: '+(b.rule||'—'), 'Quantity (up): '+(b.qty||0), 'Status: '+(b.status||'—'), 'Barcode: '+(b.barcode||'—'),
      'Items on sheet: '+((b.items||[]).length), '', '(Lightweight placeholder — the imposed CMYK PDF is a backend job.)'];
    const esc=s=>String(s).replace(/([\\()])/g,'\\$1');
    const lines=L.map((t,i)=>`BT /F1 ${i===0?15:10} Tf 60 ${760-i*22} Td (${esc(t)}) Tj ET`).join('\n');
    const objs=[ '<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
      `<< /Length ${lines.length} >>\nstream\n${lines}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>' ];
    let pdf='%PDF-1.4\n', off=[]; objs.forEach((o,i)=>{ off.push(pdf.length); pdf+=`${i+1} 0 obj\n${o}\nendobj\n`; });
    const xref=pdf.length; pdf+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`+off.map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+
      `trailer\n<< /Size ${objs.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    const blob=new Blob([pdf],{type:'application/pdf'}), url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download='Batch-'+b.number+'.pdf'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
    PB.logActivity(b, 'pdf_downloaded'); return blob; };
  // normalize any parseable date to a canonical UTC ISO string so all added_at values sort lexically == chronologically
  // (always round-trip — even 'T'-bearing inputs — so an offset-bearing ISO like ...+05:30 can't break the lexical sort)
  PB._iso=(d)=>{ if(!d) return null; const x=new Date(d); return isNaN(x)?null:x.toISOString(); };
  // newest "added to bucket" time among a set of items (ISO strings sort chronologically)
  PB.bucketUpdatedAt=(items)=>(items||[]).map(i=>i.added_at).filter(Boolean).sort().pop()||null;
  // backfill added_at / updated_at on buckets that predate the feature (old saved state, HP buckets) — idempotent
  PB._backfillBucketTimes=(buckets)=>{ (buckets||[]).forEach(b=>{
    (b.items||[]).forEach(it=>{ if(!it.added_at) it.added_at = PB._iso(it.created_date) || new Date().toISOString(); });
    if(!b.updated_at) b.updated_at = PB.bucketUpdatedAt(b.items);
  }); };
  function mkBucket(rule,items,key){ items=(items||[]).map(stripTransient); const first=items[0]||{}; const cls=PB.caseClass(first.case_type); const max=PB.tplMax(rule.template);
    const now=new Date().toISOString();
    // when each item entered the bucket: live scans pre-stamp added_at; seed falls back to the order date
    items.forEach(it=>{ if(!it.added_at) it.added_at = PB._iso(it.created_date) || now; });
    const q=items.reduce((s,i)=>s+(+i.qty||1),0);
    return { id:'K'+(++_kn)+'-'+key.replace(/\W+/g,'').slice(0,14), key, rule:rule.name, ruleId:rule.id, template:rule.template,
      model: rule.filterModel? first.model : 'Multi Model', case_type: rule.filterCase? first.case_type : 'Multi Casetype',
      caseClass:cls, qty:q, threshold:max, exact:rule.exact, items, progress:Math.min(100,Math.round(q/max*100)),
      updated_at: PB.bucketUpdatedAt(items) || now }; }
  PB.mkBatch=mkBatch;
  // recompute a bucket's aggregates after its items change (top-up / removal)
  function recalcBucket(b){ const max=b.threshold||PB.tplMax(b.template); b.qty=(b.items||[]).reduce((s,i)=>s+(+i.qty||1),0);
    b.progress=Math.min(100,Math.round(b.qty/max*100)); b.updated_at=PB.bucketUpdatedAt(b.items)||new Date().toISOString(); }
  PB.recalcBucket=recalcBucket;
  // a rule's template/threshold can change after its buckets exist — re-point its open buckets at the CURRENT
  // template, spill any now-overfull sheet, and recompute progress so the bucket never shows a stale threshold.
  PB.resyncRuleBuckets=(rule)=>{ if(!rule) return; const max=PB.tplMax(rule.template); let changed=false;
    PB.state.buckets.filter(b=>b.ruleId===rule.id && Array.isArray(b.items)).forEach(b=>{
      b.template=rule.template; b.threshold=max;
      while(b.items.length>=max){ const nb=mkBatch(rule,b.items.splice(0,max),'auto'); PB.state.batches.unshift(nb); changed=true; }
      if(b.items.length) recalcBucket(b); else { const i=PB.state.buckets.indexOf(b); if(i>=0)PB.state.buckets.splice(i,1); changed=true; }
    });
    if(changed) PB.save(); return changed; };

  /* ---------- live ingest = the real auto-batch trigger ----------
     New orders / Amazon bulk / reprint sources 1–3 call this on receipt. It resolves each item to its rule,
     groups by bucketKey (which already segregates reprints per the rule), TOPS UP a matching open bucket
     (formItems only ever makes fresh groups), spills every full sheet into a batch, and leaves the remainder
     as an open bucket. Rule-less items fall back to the scan pool. Persists + returns what it made. */
  PB.ingest=(incoming, opts={})=>{
    const now=new Date().toISOString(); const made={batches:[], buckets:[], pooled:0};
    const items=(incoming||[]).map(it=>{ const x={...it}; if(!x.added_at) x.added_at=now; x._rule=PB.resolveRule(x); return x; });
    const groups={};
    items.forEach(it=>{ const r=it._rule; if(!r){ (PB.state.pool=PB.state.pool||[]).push(stripTransient(it)); made.pooled++; return; }
      const k=PB.bucketKey(r,it); (groups[k]=groups[k]||{rule:r,key:k,items:[]}).items.push(stripTransient(it)); });
    Object.values(groups).forEach(g=>{ const max=PB.tplMax(g.rule.template);
      let bucket=PB.state.buckets.find(b=>b.key===g.key);
      if(bucket){ bucket.items=(bucket.items||[]).concat(g.items);
        bucket.template=g.rule.template; bucket.threshold=max;   // adopt the rule's CURRENT template so spill + progress agree
        while(bucket.items.length>=max){ const b=mkBatch(g.rule,bucket.items.splice(0,max),'auto'); made.batches.push(b); PB.state.batches.unshift(b); }
        if(bucket.items.length) recalcBucket(bucket);
        else PB.state.buckets=PB.state.buckets.filter(b=>b!==bucket);
      } else { let q=[...g.items];
        while(q.length>=max){ const b=mkBatch(g.rule,q.splice(0,max),'auto'); made.batches.push(b); PB.state.batches.unshift(b); }
        if(q.length){ const nb=mkBucket(g.rule,q,g.key); made.buckets.push(nb); PB.state.buckets.push(nb); }
      }
    });
    PB.save(); return made; };
  // shed transient view fields so they never leak into persisted batches/buckets (incl. the Orders-ledger display fields)
  function stripTransient(it){ const {_rule,include,_rowId,_manual,_upload,_fileName,__k,__i,_uid,
    _state,_ruleName,_batchNo,_batchId,_bucketId,_loc,__ref,_disp,...o}=it; return o; }
  // return an item to the intake pool as a pristine NEW order: drop all transient + scan/bucket cruft and
  // RESET the reprint classification (so an item that was a reprint can be synced as a normal order again).
  // Channel (amazon vs order) is re-derived from the SKU so AMZ- items stay on the Bulk page.
  PB.cleanItem=(it)=>{ const o=stripTransient(it); delete o.added_at; delete o.reprint_id; delete o.reprint_source;
    o.is_reprint=false; o.source=String(o.sku||'').toUpperCase().startsWith('AMZ-')?'amazon':'order'; return o; };

  /* ---------- reprint factory: clone an order item as a reprint of the given sub-source (1–4) ---------- */
  PB.makeReprint=(item, sub)=>{ const rp=stripTransient({...item});
    rp.is_reprint=true; rp.source='reprint'; rp.reprint_source=(sub in PB.SRC_SUB)?sub:'pulse';
    rp.added_at=new Date().toISOString();
    rp.reprint_id='RP-'+PB.uid();   // collision-proof even for two reprints of the same order in one tick
    return rp; };

  /* ---------- merge buckets (same template + case-class + ≤ threshold) ---------- */
  PB.canMerge=(list)=>{ if(list.length<2) return {ok:false,why:'Select 2+ buckets'};
    const t=list[0].template, c=list[0].caseClass;
    if(!list.every(b=>b.template===t)) return {ok:false,why:'Different templates can’t merge'};
    if(!list.every(b=>b.caseClass===c)) return {ok:false,why:'Different case-classes can’t merge'};
    const q=list.reduce((s,b)=>s+b.qty,0), max=PB.tplMax(t);
    if(q>max) return {ok:false,why:`Merged qty ${q} > threshold ${max}`};
    return {ok:true,q,max}; };
  PB.mergeBuckets=(list)=>{ const items=list.flatMap(b=>b.items); const rule=PB.state.rules.find(r=>r.id===list[0].ruleId)||list[0];
    const b=mkBatch(rule,items,'merge'); b.model='Multi Model'; b.case_type='Multi Casetype';
    PB.state.batches.unshift(b); list.forEach(k=>{ const i=PB.state.buckets.findIndex(x=>x.id===k.id); if(i>=0)PB.state.buckets.splice(i,1); });
    PB.save(); return b; };

  /* ---------- persistence ---------- */
  // before persisting pool/scanned items: drop base64 data-URL thumbnails (they bloat localStorage → quota errors)
  // AND strip the heavy/stale transient `_rule` (a full rule-object copy per item) + the view row-keys (_uid/__k/__i).
  // Scanned-row routing fields (_rowId/_manual/_upload/_fileName) are kept; _rule re-resolves fresh on reload.
  const slimItems=(arr)=>(arr||[]).map(it=>{ if(!it||typeof it!=='object') return it;
    const {_rule,_uid,__k,__i,...o}=it; if(typeof o.image==='string'&&o.image.startsWith('data:')) o.image=null; return o; });
  const slimRows=(arr)=>(arr||[]).map(b=> (b && Array.isArray(b.items) && b.items.some(i=>i&&typeof i.image==='string'&&i.image.startsWith('data:'))) ? {...b, items:slimItems(b.items)} : b);
  PB.save=()=>{ try{ localStorage.setItem(LS, JSON.stringify({
    batches:slimRows(PB.state.batches), buckets:slimRows(PB.state.buckets), rules:PB.state.rules, templates:PB.state.templates,
    printers:PB.state.printers, scanned:slimItems(PB.state.scanned), pool:slimItems(PB.state.pool) })); }
    catch(e){ if(e && (e.name==='QuotaExceededError' || e.code===22)) { try{ PB.toast('Storage full — recent changes were not saved','warn',3500); }catch(_){} } } };
  function restore(){ try{ const s=JSON.parse(localStorage.getItem(LS)||'null'); return s; }catch(e){ return null; } }
  PB.reset=()=>{ localStorage.removeItem(LS); location.reload(); };

  /* ---------- seed live state from snapshots ---------- */
  function seed(){
    PB._uvSet = null;   // rebuild the UV lookup from the (possibly reloaded) sku_db
    PB.state.templates = buildTemplates();
    PB.state.rules = buildRules();   // curated Classic-sublimation + Amazon-bulk rules (data/rules.json, internal shape)
    // Curated demo items are pre-tagged (source / is_reprint / reprint_source / AMZ- sku) and carry a `_disp`
    // hint: 'prebatch' = already received → into buckets/batches; 'pool' = waiting in the upload queue.
    const items=(PB.data.items||[]).map(it=>({ ...it, source:it.source||'order', is_reprint:!!it.is_reprint, _rule:null }));
    items.forEach(it=>it._rule=PB.resolveRule(it));
    const preMatched=items.filter(it=>it._disp!=='pool' && it._rule);
    const poolItems=items.filter(it=>it._disp==='pool' || !it._rule);   // waiting + any unmatched (no item lost)
    const formed=PB.formItems(preMatched);
    PB.state.batches=[...formed.batches];   // HP-mirror sample cleared → batches/buckets come only from the curated data
    PB.state.buckets=[...formed.buckets];
    PB.state.pool = poolItems.map(it=>{ const {_rule,_disp,...o}=it; return o; });
    PB.state.scanned=[];
    PB.state.printers = (PB.data.printers||[]).map(p=>({...p}));   // managed printer registry (Configure → Printers)
    // Ops realism: advance batches through the route + build a real activity timeline (created → sheet printed →
    // [greensheet + label when complete]) with staggered timestamps, varied operators, and real printer names.
    const ROUTE=['Cut','Pack','QC','Print','complete'];
    const presses=PB.state.printers.filter(p=>!/label/i.test(p.type)), labels=PB.state.printers.filter(p=>/label/i.test(p.type));
    const ago=m=>new Date(Date.now()-m*60000).toISOString(), op=k=>PB.operators[((k%PB.operators.length)+PB.operators.length)%PB.operators.length];
    formed.batches.forEach((b,i)=>{ const ev=ROUTE[i%ROUTE.length];
      if(ev==='complete'){ b.status='complete'; b.current_event='Ready'; } else b.current_event=ev;
      const createdMin=380-i*55, printedMin=createdMin-22;                    // older batches created longer ago
      b.created=ago(createdMin);
      b.history=[{ at:b.created, action:'created', by:'Auto-batch (rule close)' }];   // oldest → last
      const press=presses[i%(presses.length||1)]||{name:'P6000 — Line 1'};
      b.history.unshift({ at:ago(printedMin), action:'sheet_printed', by:op(i+1), account:PB.user.name, printer:press.name });
      if(ev==='complete'){ const lp=labels[0]||{name:'ZDesigner ZD421'};
        b.history.unshift({ at:ago(printedMin-40), action:'greensheet_printed', by:op(i+2), account:PB.user.name, printer:lp.name });
        b.history.unshift({ at:ago(printedMin-55), action:'label_printed', by:op(i+3), account:PB.user.name, printer:lp.name }); }
    });
    const s=restore(); if(s){ ['batches','buckets','rules','templates','printers','scanned','pool'].forEach(k=>{ if(k in s && !Array.isArray(s[k])) delete s[k]; }); Object.assign(PB.state, s); }
    // re-seed id counters above anything already persisted, so reloads never re-mint a colliding batch number / bucket id
    _bn = Math.max(_bn, 0, ...PB.state.batches.map(b=>+String(b.number).replace(/\D/g,'')||0));
    _kn = Math.max(_kn, 0, ...PB.state.buckets.map(b=>{ const m=/^K(\d+)-/.exec(b.id||''); return m?+m[1]:0; }));
    PB._backfillBucketTimes(PB.state.buckets);   // normalize timestamps (older saved state, HP buckets)
  }

  /* ---------- router ---------- */
  PB.view=(name,fn)=>{ PB.views[name]=fn; };
  PB.link=(name,param)=> '#/'+name + (param!=null&&param!==''? '/'+encodeURIComponent(param):'');
  PB.go=(name,param)=>{ location.hash=PB.link(name,param); };
  PB.route=()=>{ const h=(location.hash||'#/batches').replace(/^#\/?/,''); const i=h.indexOf('/');
    const name=i<0?h:h.slice(0,i); const param=i<0?null:decodeURIComponent(h.slice(i+1));
    return { name: PB.routes.includes(name)?name:'batches', param }; };
  function render(){ const {name,param}=PB.route();
    // two nav regions (sidebar + second bar): highlight by data-route; data-param scopes Current-Work class links
    PB.qsa('[data-route]').forEach(a=>a.classList.toggle('active', a.dataset.route===name && (a.dataset.param==null || a.dataset.param===param)));
    PB.syncSetupAccordion(name);   // auto-expand Setup when a Setup child route is active
    document.body.classList.remove('nav-open'); if(PB.drawer) PB.drawer.close(); if(PB.modal) PB.modal.close();
    const v=PB.qs('#view'); v.scrollTop=0;
    try{ (PB.views[name]||PB.views.batches)(v, param); }catch(e){ v.innerHTML='<div class="empty">View error: '+PB.esc(e.message)+'</div>'; console.error(e); }
    refreshNavCounts();
  }
  function refreshNavCounts(){ const bc=PB.qs('#navBucketCount'); if(bc) bc.textContent=PB.state.buckets.length;
    const wc=PB.workCounts(); PB.qsa('[data-wc]').forEach(el=>{ const n=wc[el.dataset.wc]||0; el.textContent=n; el.classList.toggle('zero', n===0); }); }   // live Current-Work class counts
  PB.refreshNav=refreshNavCounts;

  /* ---------- Setup sidebar group → a right-side FLYOUT popover (net-new) ----------
     A transient popover that pops out to the RIGHT of the sidebar, so full labels fit and it never
     merges with the flat nav list. Opens on click; closes on selection / outside-click / Escape / route
     change. The Setup header stays highlighted while a Setup child route is active. No persistence. */
  const SETUP_ROUTES=['rules','templates','skus','printers','workcenters'];
  function positionSetupFlyout(){ const b=PB.qs('#setupBody'), t=PB.qs('#setupToggle'), nav=PB.qs('#sidenav'); if(!b||!t||!nav) return;
    if(window.matchMedia && window.matchMedia('(max-width:1024px)').matches){ b.style.left=''; b.style.top=''; b.style.maxHeight=''; return; }   // inline within the mobile drawer
    const tr=t.getBoundingClientRect(), nr=nav.getBoundingClientRect(), vh=window.innerHeight||800;
    b.style.left=Math.round(nr.right+6)+'px'; b.style.maxHeight=(vh-16)+'px';
    let top=tr.top-6; const h=b.offsetHeight||260; if(top+h>vh-8) top=Math.max(8, vh-8-h);
    b.style.top=Math.round(top)+'px'; }
  PB.setSetupOpen=(open)=>{ const b=PB.qs('#setupBody'), t=PB.qs('#setupToggle'), g=PB.qs('#setupGroup'); if(!b||!t) return;
    b.hidden=!open; t.setAttribute('aria-expanded',open?'true':'false'); if(g) g.classList.toggle('open',open);
    if(open) positionSetupFlyout(); };
  // called from render(): highlight Setup while on a child route + dismiss the transient flyout on any route change
  PB.syncSetupAccordion=(name)=>{ const g=PB.qs('#setupGroup'); if(g) g.classList.toggle('child-active', SETUP_ROUTES.includes(name)); PB.setSetupOpen(false); };
  PB.initSetupAccordion=()=>{ const t=PB.qs('#setupToggle'), g=PB.qs('#setupGroup'); if(!t) return;
    PB.setSetupOpen(false); if(g) g.classList.toggle('child-active', SETUP_ROUTES.includes(PB.route().name));
    t.onclick=(e)=>{ if(e&&e.stopPropagation) e.stopPropagation(); PB.setSetupOpen(!!PB.qs('#setupBody').hidden); };
    document.addEventListener('mousedown',(e)=>{ const gg=PB.qs('#setupGroup'), b=PB.qs('#setupBody'); if(b && !b.hidden && gg && !(gg.contains&&gg.contains(e.target))) PB.setSetupOpen(false); });
    document.addEventListener('keydown',(e)=>{ if(e.key==='Escape'){ const b=PB.qs('#setupBody'); if(b && !b.hidden) PB.setSetupOpen(false); } });
    if(window.addEventListener) window.addEventListener('resize',()=>{ const b=PB.qs('#setupBody'); if(b && !b.hidden) positionSetupFlyout(); }); };

  /* ---------- boot ---------- */
  async function load(name){ const r=await fetch('data/'+name+'.json'); return r.json(); }
  PB.start=async ()=>{
    try{
      const [items,sku,batches,rules,buckets,impositions,events,printers]=await Promise.all(
        ['items','sku_db','batches','rules','buckets','impositions','events','printers'].map(n=>load(n).catch(()=>[])));
      PB.data={items,sku_db:sku,batches,rules,buckets,impositions,events,printers};
    }catch(e){ PB.qs('#view').innerHTML='<div class="empty">Could not load data snapshots.<br>Run <code>python tools/fetch_data.py</code> then serve over http.</div>'; return; }
    seed();
    PB.qs('#dataStamp').textContent = (PB.data.items[0]?.created_date? 'orders to '+PB.fmt.date(PB.data.items[0].created_date):'live snapshot');
    // wiring
    PB.qs('#navToggle').onclick=()=>document.body.classList.toggle('nav-open');
    PB.qs('#scrim').onclick=()=>document.body.classList.remove('nav-open');
    PB.qs('#drawerClose').onclick=PB.drawer.close; PB.qs('#drawerScrim').onclick=PB.drawer.close;
    PB.qs('#modalClose').onclick=PB.modal.close; PB.qs('#modalScrim').onclick=PB.modal.close;
    document.addEventListener('keydown',e=>{ if(e.key!=='Escape') return; const m=PB.qs('#modal');
      if(m&&m.classList.contains('open')) PB.modal.close(); else PB.drawer.close(); });
    // .toggle spans are keyboard-operable (Enter/Space) when focusable, and keep aria-checked in sync
    document.addEventListener('keydown',e=>{ const t=e.target; if((e.key==='Enter'||e.key===' ')&&t.classList&&t.classList.contains('toggle')&&t.hasAttribute('tabindex')){ e.preventDefault(); t.click(); } });
    document.addEventListener('click',e=>{ const t=e.target.closest&&e.target.closest('.toggle'); if(t&&t.getAttribute('role')==='switch') t.setAttribute('aria-checked', t.classList.contains('on')?'true':'false'); });
    // close any open searchable dropdown when clicking outside it (and keep its control's aria-expanded in sync)
    document.addEventListener('mousedown',e=>{ if(!(e.target.closest&&e.target.closest('.dd-wrap'))) PB.qsa('.dd-wrap').forEach(w=>{ const p=w.querySelector('.dd-panel'); if(p)p.hidden=true; const c=w.querySelector('.dd'); if(c)c.setAttribute('aria-expanded','false'); }); });
    PB.qs('#refreshBtn').onclick=async ()=>{ if(await PB.confirm({title:'Reset prototype',message:'Reset prototype state to the fresh data snapshot?',confirmText:'Reset',danger:true})) PB.reset(); };
    // operator selector (activities log under this name; the logged-in account stays nitikaj@getmt3.com)
    { const op=PB.qs('#opPick'); if(op) PB.dropdown(op, { options:PB.operators, value:PB.operator, label:'operator', onChange:x=>{ PB.setOperator(x); PB.toast('Operating as '+x, 'info'); } }); }
    PB.initSetupAccordion();   // collapsible Setup group (side key pb.ui.setupOpen)
    { const pa=PB.qs('#prodArea'); if(pa) pa.onclick=()=>PB.go('batches'); }   // Production area → landing
    PB.qsa('.nav-item, .subnav-item').forEach(a=>a.addEventListener('click',()=>document.body.classList.remove('nav-open')));
    PB.initGlobalSearch();
    window.addEventListener('hashchange',render);
    if(!location.hash) location.hash='#/batches';
    render();
  };

  /* ---------- global search (parity with mt3narada GlobalSearch: live suggestions + recent + saved) ---------- */
  const GS_RK='pb.search.recent', GS_SK='pb.search.saved';
  const gsRead=k=>{ try{ return JSON.parse(localStorage.getItem(k)||'[]'); }catch(e){ return []; } };
  const gsWrite=(k,v)=>{ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} };
  const GS_ICON={ batch:'▥', bucket:'◴', rule:'⚖', sku:'≣', order:'⊞', query:'⌕' };
  const GS_TAG={ batch:'Batch', bucket:'Bucket', rule:'Rule', sku:'SKU', order:'Order', query:'Search' };
  PB.gsuggest=(q)=>{ q=(q||'').trim().toLowerCase(); if(!q) return [];
    const PER=4, g={ batch:[], bucket:[], rule:[], sku:[], order:[] };   // cap per type so every entity surfaces (Pulse-style grouped results)
    const add=(t,label,sub,go)=>{ if(g[t].length<PER) g[t].push({ type:t, label:String(label), sub:String(sub||''), go }); };
    PB.state.batches.forEach(b=>{ if(g.batch.length<PER && (String(b.number).toLowerCase().includes(q)||(b.barcode||'').toLowerCase().includes(q))) add('batch','Batch '+b.number, b.rule, ['batches',b.id]); });
    PB.state.buckets.forEach(k=>{ if(g.bucket.length<PER && [(k.rule||''),(k.model||''),(k.case_type||'')].join(' ').toLowerCase().includes(q)) add('bucket', k.rule, (k.model||'')+' · '+(k.case_type||''), ['buckets',k.id]); });
    PB.state.rules.forEach(r=>{ if(g.rule.length<PER && (r.name||'').toLowerCase().includes(q)) add('rule', r.name, 'Batch rule · '+(r.template||''), ['rules',r.id]); });
    ((PB.data.sku_db&&PB.data.sku_db.products)||[]).forEach(p=>{ if(g.sku.length<PER && (p.sku||'').toLowerCase().includes(q)) add('sku', p.sku, (p.Model||'')+(p.CaseType?' · '+p.CaseType:''), ['skus',p.sku]); });
    (PB.state.pool||[]).forEach(it=>{ if(g.order.length<PER && [(it.source_id||''),(it.component_barcode||''),(it.item_barcode||''),(it.print_sku||'')].join(' ').toLowerCase().includes(q)) add('order', it.source_id||it.component_barcode, (it.model||'')+(it.print_sku?' · '+it.print_sku:''), ['reprints']); });
    const out=[...g.batch,...g.bucket,...g.rule,...g.sku,...g.order], seen=new Set();
    return out.filter(r=>{ const kk=r.type+'|'+r.label; if(seen.has(kk)) return false; seen.add(kk); return true; }).slice(0,10);
  };
  PB.search=(q)=>{ q=(q||'').trim(); if(!q) return; const r=PB.gsuggest(q)[0]; if(r) PB.go(...r.go); else PB.toast('No match for “'+q+'”','warn'); };
  PB.initGlobalSearch=()=>{
    const inp=PB.qs('#globalSearch'), panel=PB.qs('#gsPanel'), wrap=PB.qs('#gsWrap'); if(!inp||!panel) return;
    const open=()=>{ panel.hidden=false; inp.setAttribute('aria-expanded','true'); };
    const close=()=>{ panel.hidden=true; inp.setAttribute('aria-expanded','false'); };
    const recent=(r)=>{ const cur=gsRead(GS_RK).filter(x=>!(x.type===r.type&&x.label===r.label)); cur.unshift({type:r.type,label:r.label,sub:r.sub,go:r.go}); gsWrite(GS_RK, cur.slice(0,8)); };
    const nav=(r)=>{ if(r.go&&r.go[0]==='__q'){ inp.value=r.go[1]; recent({type:'query',label:r.go[1],sub:'search',go:['__q',r.go[1]]}); render(); open(); inp.focus(); return; } recent(r); close(); inp.value=''; PB.go(...r.go); };
    const row=(r)=>`<button class="gs-row" type="button" data-go='${PB.esc(JSON.stringify(r.go))}' data-type="${PB.esc(r.type)}" data-label="${PB.esc(r.label)}" data-sub="${PB.esc(r.sub||'')}">
        <span class="gs-row-ic">${GS_ICON[r.type]||'⊙'}</span>
        <span class="gs-row-main"><b>${PB.esc(r.label)}</b>${r.sub?`<span class="gs-row-sub">${PB.esc(r.sub)}</span>`:''}</span>
        <span class="gs-row-tag">${GS_TAG[r.type]||''}</span><span class="gs-row-go">⇱</span></button>`;
    const render=()=>{ const q=inp.value.trim();
      if(q){ const res=PB.gsuggest(q); panel.innerHTML = res.length
          ? `<div class="gs-sec"><span>Results</span></div>${res.map(row).join('')}`
          : `<div class="gs-empty">No matches for “${PB.esc(q)}”.</div>`; }
      else { const rec=gsRead(GS_RK), sav=gsRead(GS_SK);
        panel.innerHTML = (rec.length?`<div class="gs-sec"><span>Recent</span><button class="gs-clear" type="button" data-clear="${GS_RK}">Clear</button></div>${rec.map(row).join('')}`:'')
          + (sav.length?`<div class="gs-sec"><span>Saved searches</span><button class="gs-clear" type="button" data-clear="${GS_SK}">Clear</button></div>${sav.map(row).join('')}`:'')
          + (!rec.length&&!sav.length?`<div class="gs-empty">Search batches, buckets, rules, SKUs, orders, barcodes &amp; print codes…</div>`:''); }
      PB.qsa('.gs-row',panel).forEach(b=>b.onmousedown=(e)=>{ e.preventDefault(); nav({type:b.dataset.type,label:b.dataset.label,sub:b.dataset.sub,go:JSON.parse(b.dataset.go)}); });
      PB.qsa('[data-clear]',panel).forEach(b=>b.onmousedown=(e)=>{ e.preventDefault(); e.stopPropagation(); gsWrite(b.dataset.clear,[]); render(); }); };
    inp.addEventListener('focus',()=>{ render(); open(); });
    inp.addEventListener('input',()=>{ render(); open(); });
    inp.addEventListener('keydown',e=>{ if(e.key==='Escape'){ close(); inp.blur(); } else if(e.key==='Enter'){ const r=PB.gsuggest(inp.value)[0]; if(r) nav(r); else if(inp.value.trim()) PB.toast('No match for “'+inp.value.trim()+'”','warn'); } });
    const sb=PB.qs('#gsSavedBtn'); if(sb) sb.onmousedown=(e)=>{ e.preventDefault(); const q=inp.value.trim();
      if(q){ const s=gsRead(GS_SK).filter(x=>x.label!==q); s.unshift({type:'query',label:q,sub:'saved search',go:['__q',q]}); gsWrite(GS_SK,s.slice(0,12)); PB.toast('Search saved','ok'); } render(); open(); inp.focus(); };
    document.addEventListener('mousedown',e=>{ if(wrap && !(e.target.closest&&e.target.closest('#gsWrap'))) close(); });
  };

  PB._seed = seed;  // exposed for headless tests
  PB._render = render;  // exposed for headless router/active-state tests
  return PB;
})();
