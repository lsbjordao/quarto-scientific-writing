// src/ui/modal.js — Metric row and search control render helpers.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

  function metricItem(label, value, focus, title) {
    return '<div class="ws-doc-metric"' +
      (focus ? ' data-ws-focus="' + focus + '"' : '') +
      (title ? ' title="' + escapeHTML(title) + '"' : '') + '>' +
      '<span class="ws-doc-metric-label">' + label + '</span>' +
      '<span class="ws-doc-metric-value">' + value + '</span>' +
      '</div>';
  }

  function metricGroup(label) {
    return '<div class="ws-doc-metric-group" data-ws-group>' +
      '<button type="button" class="ws-doc-group-toggle" aria-expanded="true">' + escapeHTML(label) + '</button>' +
      '</div>';
  }

  function metricSubgroup(label, url) {
    var badge = url
      ? '<a class="ws-pkg-badge" href="' + escapeHTML(url) + '" target="_blank" rel="noopener noreferrer">' + escapeHTML(label) + '</a>'
      : '<span class="ws-pkg-badge ws-pkg-builtin">' + escapeHTML(label) + '</span>';
    return '<div class="ws-doc-metric-subgroup">' + badge + '</div>';
  }

  function metricRegexSearch() {
    return '<div class="ws-doc-metric ws-doc-metric-search" data-ws-regex-block title="' + escapeHTML(L.regexSearchDesc) + '">' +
      '<span class="ws-doc-metric-label">' + L.regexSearch + '</span>' +
      '<div class="ws-doc-regex-row">' +
        '<input type="text" class="ws-doc-regex-input" placeholder="' + escapeHTML(L.regexPlaceholder) + '" spellcheck="false" />' +
        '<button type="button" class="ws-doc-regex-btn ws-doc-regex-apply">' + L.regexApply + '</button>' +
        '<button type="button" class="ws-doc-regex-btn ws-doc-regex-clear">' + L.regexClear + '</button>' +
      '</div>' +
      '<div class="ws-doc-regex-scope ws-doc-regex-scope-hidden">' +
        '<label><input type="checkbox" class="ws-doc-regex-scope-paragraph" checked /> ' + L.parag + '</label>' +
        '<label><input type="checkbox" class="ws-doc-regex-scope-sentence" checked /> ' + L.sentP + '</label>' +
      '</div>' +
      '<span class="ws-doc-regex-count">0 ' + L.regexMatches + '</span>' +
    '</div>';
  }

  function wireMetricFocus(metrics) {
    metrics.querySelectorAll('[data-ws-focus]').forEach(function (item) {
      item.addEventListener('click', function () {
        var focus = item.dataset.wsFocus;
        var cls = 'ws-focus-' + focus;
        var active = document.body.classList.contains(cls);
        document.body.classList.toggle(cls, !active);
        item.classList.toggle('ws-doc-metric-active', !active);
        refreshHighlightTooltips(document);
      });
    });
  }

  function wireRhythmNavigation(metrics) {
    metrics.querySelectorAll('.ws-doc-rhythm-block[data-ws-target]').forEach(function (block) {
      block.addEventListener('click', function () {
        var id = block.getAttribute('data-ws-target');
        if (!id) return;
        var target = document.getElementById(id);
        if (!target) return;
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  function wireMetricGroups(metrics) {
    var rows = Array.from(metrics.children || []);
    var groups = [];
    var current = null;
    rows.forEach(function (row) {
      if (row.classList.contains('ws-doc-metric-group')) {
        current = { header: row, items: [] };
        groups.push(current);
      } else if (current) {
        current.items.push(row);
      }
    });
    groups.forEach(function (group) {
      var btn = group.header.querySelector('.ws-doc-group-toggle');
      if (!btn) return;
      btn.addEventListener('click', function () {
        var expanded = btn.getAttribute('aria-expanded') !== 'false';
        var next = !expanded;
        btn.setAttribute('aria-expanded', next ? 'true' : 'false');
        group.header.classList.toggle('ws-doc-metric-group-collapsed', !next);
        group.items.forEach(function (item) {
          item.classList.toggle('ws-group-item-hidden', !next);
        });
      });
    });
  }
