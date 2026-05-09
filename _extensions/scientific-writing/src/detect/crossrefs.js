// src/detect/crossrefs.js — Figure and table cross-reference coverage/order checks.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

  function getCrossRefUsage(root) {
    var scope = root || document;
    scope.querySelectorAll('.ws-xref-order-fig, .ws-xref-order-tbl').forEach(function (el) {
      el.classList.remove('ws-xref-order-fig', 'ws-xref-order-tbl');
      if (el.dataset && (el.dataset.wsFocus === 'figure-ref-order' || el.dataset.wsFocus === 'table-ref-order')) {
        delete el.dataset.wsFocus;
        delete el.dataset.wsReason;
      }
    });

    var figureTargets = new Set();
    var tableTargets = new Set();

    scope.querySelectorAll('[id^="fig-"]').forEach(function (node) {
      var id = String(node.id || '').trim();
      if (id) figureTargets.add(id);
    });
    scope.querySelectorAll('[id^="tbl-"]').forEach(function (node) {
      var id = String(node.id || '').trim();
      if (id) tableTargets.add(id);
    });

    var figureRefs = new Set();
    var tableRefs = new Set();
    scope.querySelectorAll('a[href^="#fig-"]').forEach(function (a) {
      var id = String(a.getAttribute('href') || '').replace(/^#/, '').trim();
      if (id) figureRefs.add(id);
    });
    scope.querySelectorAll('a[href^="#tbl-"]').forEach(function (a) {
      var id = String(a.getAttribute('href') || '').replace(/^#/, '').trim();
      if (id) tableRefs.add(id);
    });

    var figureReferenced = Array.from(figureTargets).filter(function (id) { return figureRefs.has(id); });
    var tableReferenced = Array.from(tableTargets).filter(function (id) { return tableRefs.has(id); });
    var figureMissing = Array.from(figureTargets).filter(function (id) { return !figureRefs.has(id); });
    var tableMissing = Array.from(tableTargets).filter(function (id) { return !tableRefs.has(id); });

    function getRefNumber(node) {
      var txt = String((node && node.textContent) || '').trim();
      var m = txt.match(/(\d+)(?!.*\d)/);
      return m ? Number(m[1]) : null;
    }

    function getOrderIssues(selector, cls, focusKey, title) {
      var prev = null;
      var issues = [];
      scope.querySelectorAll(selector).forEach(function (a) {
        var n = getRefNumber(a);
        if (n == null) return;
        if (prev != null && n < prev) {
          var issue = prev + '→' + n;
          issues.push(issue);
          a.classList.add(cls);
          markReason(a, focusKey, title + ' (' + issue + ')');
        }
        prev = n;
      });
      return {
        count: issues.length,
        examples: issues.slice(0, 5),
      };
    }

    var figureOrder = getOrderIssues('a[href^="#fig-"]', 'ws-xref-order-fig', 'figure-ref-order', L.figureRefOrder);
    var tableOrder = getOrderIssues('a[href^="#tbl-"]', 'ws-xref-order-tbl', 'table-ref-order', L.tableRefOrder);

    return {
      figureCount: figureTargets.size,
      figureReferenced: figureReferenced.length,
      figureMissing: figureMissing,
      figureOrder: figureOrder,
      tableCount: tableTargets.size,
      tableReferenced: tableReferenced.length,
      tableMissing: tableMissing,
      tableOrder: tableOrder,
    };
  }
