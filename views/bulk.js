/* Inputs → Amazon Bulk. The AMZ-prefix channel (Pulse's bulk-orders module). Same intake mechanics as Orders
   (PB.inputsPage), but scoped to AMZ- SKUs; imports auto-batch via the Amazon prefix rule; reprints are source #3. */
(function () {
  PB.view('bulk', (v) => PB.inputsPage(v, {
    route: 'bulk', reprintSub: 'amazon',
    title: 'Amazon Bulk',
    sub: 'Amazon bulk order ledger (SKU prefix AMZ-) — rule + batch per item. Import auto-batches via the Amazon prefix rule, kept separate from normal orders.',
    dataFilter: it => String(it.sku || '').toUpperCase().startsWith('AMZ-'),
    syncText: '⟳ Import bulk batch → auto-batch',
    batchSelText: 'Import selected',
    emptyText: 'No Amazon bulk orders waiting.',
    footNote: 'Amazon bulk auto-batches on import (prefix rule wins over general rules). Reprints from this page are reprint source #3 (Amazon bulk) → auto-batched, isolated from live Amazon orders.',
  }));
})();
