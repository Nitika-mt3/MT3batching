/* Amazon Bulk is now merged into the Orders page as the "Amazon" channel sub-tab.
   Kept as a redirect alias so old #/bulk deep-links (and any global-search hit) land on Orders → Amazon. */
(function () {
  PB.view('bulk', () => PB.go('orders', 'amazon'));
})();
