// src/ui/doi-tooltip.js — DOI validation tooltip (data pre-fetched at render time by Lua).
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

  function tokenDiff(strA, strB) {
    var tA = (strA || '').match(/\S+/g) || [];
    var tB = (strB || '').match(/\S+/g) || [];
    var m = tA.length, n = tB.length;
    var dp = new Array(m + 1);
    for (var i = 0; i <= m; i++) dp[i] = new Array(n + 1).fill(0);
    for (var i = 1; i <= m; i++) {
      for (var j = 1; j <= n; j++) {
        dp[i][j] = tA[i-1].toLowerCase() === tB[j-1].toLowerCase()
          ? dp[i-1][j-1] + 1
          : Math.max(dp[i-1][j], dp[i][j-1]);
      }
    }
    var mA = new Set(), mB = new Set();
    var i = m, j = n;
    while (i > 0 && j > 0) {
      if (tA[i-1].toLowerCase() === tB[j-1].toLowerCase()) {
        mA.add(i-1); mB.add(j-1); i--; j--;
      } else if (dp[i-1][j] >= dp[i][j-1]) { i--; } else { j--; }
    }
    var bibHtml = tA.map(function (w, idx) {
      return '<span class="' + (mA.has(idx) ? 'ws-diff-ok' : 'ws-diff-err') + '">' + escapeHTML(w) + '</span>';
    }).join(' ');
    var apiHtml = tB.map(function (w, idx) {
      return '<span class="' + (mB.has(idx) ? 'ws-diff-ok' : 'ws-diff-add') + '">' + escapeHTML(w) + '</span>';
    }).join(' ');
    return { bibHtml: bibHtml, apiHtml: apiHtml };
  }

  var _doiTipEl = null;
  var _doiTipAnchor = null;

  function _doiTip() {
    if (!_doiTipEl) {
      _doiTipEl = document.createElement('div');
      _doiTipEl.className = 'ws-doi-tip';
      document.body.appendChild(_doiTipEl);
      _doiTipEl.addEventListener('mouseenter', function () { _clearDOIHideTimer(); });
      _doiTipEl.addEventListener('mouseleave', function () { hideDOITip(); });
    }
    return _doiTipEl;
  }

  var _doiHideTimer = null;
  function _clearDOIHideTimer() {
    if (_doiHideTimer) { clearTimeout(_doiHideTimer); _doiHideTimer = null; }
  }

  function hideDOITip() {
    _doiHideTimer = setTimeout(function () {
      var el = _doiTipEl;
      if (el) { el.classList.remove('ws-doi-tip-visible'); el.innerHTML = ''; }
      _doiTipAnchor = null;
    }, 120);
  }

  function positionDOITip(anchor) {
    var el = _doiTip();
    var rect = anchor.getBoundingClientRect();
    var scrollY = window.scrollY || document.documentElement.scrollTop;
    var scrollX = window.scrollX || document.documentElement.scrollLeft;
    var vw = window.innerWidth || document.documentElement.clientWidth;
    var vh = window.innerHeight || document.documentElement.clientHeight;
    var tipH = el.offsetHeight;
    var gap = 6;
    var top;
    if (vh - rect.bottom - gap >= tipH || rect.top < tipH + gap) {
      top = rect.bottom + scrollY + gap;
    } else {
      top = rect.top + scrollY - tipH - gap;
    }
    var left = Math.max(8, Math.min(rect.left + scrollX, vw - 10));
    el.style.top = top + 'px';
    el.style.left = left + 'px';
    el.style.maxWidth = Math.min(460, vw - left - 10) + 'px';
  }

  function renderDOITip(anchor, doi, comparison) {
    var el = _doiTip();
    var pt = LANG === 'pt';

    var rows = comparison.map(function (r) {
      if (r.status === 'skip') return '';
      var icon = r.status === 'ok' ? '✓'
               : r.status === 'warn' ? '⚠'
               : '✗';
      var cls = 'ws-doi-tip-' + (r.status === 'ok' ? 'ok' : r.status === 'warn' ? 'warn' : 'err');
      var val = (r.status === 'ok' && r.value)
        ? ' <span class="ws-doi-tip-val">(' + escapeHTML(String(r.value)) + ')</span>' : '';
      var detail = '';
      if (r.status !== 'ok') {
        if (r.bib && r.api) {
          var diff = tokenDiff(r.bib, r.api);
          detail = '<div class="ws-doi-tip-diff">' +
            '<span class="ws-doi-tip-lbl">bib:</span> ' + diff.bibHtml + '<br>' +
            '<span class="ws-doi-tip-lbl">api:</span> ' + diff.apiHtml + '</div>';
        } else if (r.notes && r.notes.length) {
          detail = '<div class="ws-doi-tip-diff">' +
            r.notes.map(function (n) { return escapeHTML(n); }).join('<br>') + '</div>';
        }
      }
      return '<div class="ws-doi-tip-row ' + cls + '">' +
        '<span class="ws-doi-tip-icon">' + icon + '</span>' +
        '<span class="ws-doi-tip-field">' + escapeHTML(r.field) + '</span>' + val +
        detail + '</div>';
    }).join('');

    var allOk = comparison.every(function (r) { return r.status === 'ok' || r.status === 'skip'; });
    var hasError = comparison.some(function (r) { return r.status === 'error'; });

    el.innerHTML =
      '<div class="ws-doi-tip-hdr">' +
        '<span class="ws-doi-tip-title">CrossRef ' + (pt ? 'validação' : 'validation') + '</span>' +
        '<span class="ws-doi-tip-badge ws-doi-tip-badge-' + (allOk ? 'ok' : hasError ? 'err' : 'warn') + '">' +
          (allOk ? (pt ? 'ok' : 'ok') : hasError ? (pt ? 'divergência' : 'mismatch') : (pt ? 'aviso' : 'warning')) +
        '</span>' +
      '</div>' +
      '<div class="ws-doi-tip-doi">' + escapeHTML(doi) + '</div>' +
      rows;

    el.classList.add('ws-doi-tip-visible');
    positionDOITip(anchor);
  }

  function wireDOITooltips(root) {
    var validation = (window.WritingStatsConfig || {}).doiValidation;
    if (!validation || !Object.keys(validation).length) return;

    // Find all DOI links in the bibliography section
    var refSections = root.querySelectorAll('#refs, .references');
    refSections.forEach(function (sec) {
      sec.querySelectorAll('a[href]').forEach(function (link) {
        if (!/doi\.org/i.test(link.href)) return;
        var doi = link.href.replace(/^.*doi\.org\//i, '').toLowerCase();
        var comparison = validation[doi];
        if (!comparison || !comparison.length) return;

        link.classList.add('ws-doi-checkable');
        var hasIssue = comparison.some(function (r) { return r.status === 'error'; });
        var hasWarn  = comparison.some(function (r) { return r.status === 'warn'; });
        if (hasIssue) link.classList.add('ws-doi-has-error');
        else if (hasWarn) link.classList.add('ws-doi-has-warn');
        else link.classList.add('ws-doi-verified');

        link.addEventListener('mouseenter', function () {
          _clearDOIHideTimer();
          _doiTipAnchor = link;
          renderDOITip(link, doi, comparison);
        });
        link.addEventListener('mouseleave', function (e) {
          var related = e.relatedTarget;
          if (_doiTipEl && related && _doiTipEl.contains(related)) return;
          hideDOITip();
        });
      });
    });

    document.addEventListener('scroll', function () {
      if (_doiTipEl) _doiTipEl.classList.remove('ws-doi-tip-visible');
    }, { passive: true });
  }
