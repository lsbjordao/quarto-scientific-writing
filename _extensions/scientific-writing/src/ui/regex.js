// src/ui/regex.js — Regex search parsing, matching and highlight wiring.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

  function parseRegexInput(raw) {
    var value = String(raw || '').trim();
    if (!value) return null;
    var m = value.match(/^\/(.*)\/([dgimsuy]*)$/);
    var src;
    var flags;
    if (m) {
      src = m[1];
      flags = m[2] || '';
    } else {
      src = value;
      flags = 'i';
    }
    if (flags.indexOf('g') === -1) flags += 'g';
    return new RegExp(src, flags);
  }

  function clearRegexMatches(root) {
    root.querySelectorAll('.ws-regex-match').forEach(function (span) {
      var parent = span.parentNode;
      if (!parent) return;
      while (span.firstChild) {
        parent.insertBefore(span.firstChild, span);
      }
      parent.removeChild(span);
      parent.normalize();
    });
  }

  function normalizeBlockBounds(text, start, end) {
    while (start < end && /\s/.test(text.charAt(start))) start += 1;
    while (end > start && /\s/.test(text.charAt(end - 1))) end -= 1;
    return [start, end];
  }

  function getSentenceBlocks(text) {
    var src = String(text || '');
    var blocks = [];
    var re = /[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g;
    var m;
    while ((m = re.exec(src)) !== null) {
      var start = m.index;
      var end = m.index + m[0].length;
      var bounds = normalizeBlockBounds(src, start, end);
      if (bounds[1] > bounds[0]) blocks.push({ start: bounds[0], end: bounds[1] });
    }
    return blocks;
  }

  function findRegexRangesInBlocks(text, re, blocks) {
    var src = String(text || '');
    var ranges = [];
    (blocks || []).forEach(function (block) {
      var start = Math.max(0, Number(block.start) || 0);
      var end = Math.min(src.length, Number(block.end) || 0);
      if (end <= start) return;
      var segment = src.slice(start, end);
      re.lastIndex = 0;
      var m;
      while ((m = re.exec(segment)) !== null) {
        if (!m[0]) {
          re.lastIndex += 1;
          continue;
        }
        ranges.push([start + m.index, start + m.index + m[0].length]);
      }
    });
    return ranges;
  }

  function mergeRanges(ranges) {
    if (!ranges || !ranges.length) return [];
    var sorted = ranges.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    var out = [sorted[0].slice()];
    for (var i = 1; i < sorted.length; i++) {
      var last = out[out.length - 1];
      var cur = sorted[i];
      if (cur[0] <= last[1]) last[1] = Math.max(last[1], cur[1]);
      else out.push(cur.slice());
    }
    return out;
  }

  function textNodesWithOffsets(root) {
    var nodes = [];
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var offset = 0;
    var node;
    while ((node = walker.nextNode())) {
      var txt = node.textContent || '';
      var len = txt.length;
      if (!len) continue;
      nodes.push({ node: node, start: offset, end: offset + len });
      offset += len;
    }
    return nodes;
  }

  function resolveTextOffset(nodes, pos) {
    for (var i = 0; i < nodes.length; i++) {
      if (pos <= nodes[i].end) {
        return { node: nodes[i].node, offset: Math.max(0, pos - nodes[i].start) };
      }
    }
    if (!nodes.length) return null;
    var last = nodes[nodes.length - 1];
    return { node: last.node, offset: (last.node.textContent || '').length };
  }

  function highlightRegexRangesInParagraph(p, ranges, title) {
    var merged = mergeRanges(ranges);
    if (!merged.length) return 0;
    var map = textNodesWithOffsets(p);
    if (!map.length) return 0;
    var total = 0;
    for (var i = 0; i < map.length; i++) {
      var entry = map[i];
      var text = entry.node.textContent || '';
      if (!text) continue;
      var local = [];
      for (var j = 0; j < merged.length; j++) {
        var s = Math.max(merged[j][0], entry.start);
        var e = Math.min(merged[j][1], entry.end);
        if (e > s) local.push([s - entry.start, e - entry.start]);
      }
      if (!local.length) continue;
      var frag = document.createDocumentFragment();
      var pos = 0;
      for (var k = 0; k < local.length; k++) {
        if (local[k][0] > pos) frag.appendChild(document.createTextNode(text.slice(pos, local[k][0])));
        var span = document.createElement('span');
        span.className = 'ws-regex-match';
        markReason(span, 'regex', title || L.regexSearch);
        span.textContent = text.slice(local[k][0], local[k][1]);
        frag.appendChild(span);
        pos = local[k][1];
        total += 1;
      }
      if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
      entry.node.parentNode.replaceChild(frag, entry.node);
    }
    return total;
  }

  function wireRegexSearch(metrics, root) {
    var block = metrics.querySelector('[data-ws-regex-block]');
    if (!block) return;
    var input = block.querySelector('.ws-doc-regex-input');
    var applyBtn = block.querySelector('.ws-doc-regex-apply');
    var clearBtn = block.querySelector('.ws-doc-regex-clear');
    var scopeWrap = block.querySelector('.ws-doc-regex-scope');
    var scopeParagraph = block.querySelector('.ws-doc-regex-scope-paragraph');
    var scopeSentence = block.querySelector('.ws-doc-regex-scope-sentence');
    var countEl = block.querySelector('.ws-doc-regex-count');

    function updateScopeVisibility() {
      var raw = String(input.value || '');
      var show = raw.indexOf('^') !== -1 || raw.indexOf('$') !== -1;
      if (scopeWrap) scopeWrap.classList.toggle('ws-doc-regex-scope-hidden', !show);
    }

    function setCount(value) {
      countEl.textContent = value + ' ' + L.regexMatches;
    }

    function applyRegex() {
      clearRegexMatches(root);
      document.body.classList.remove('ws-focus-regex');
      block.classList.remove('ws-doc-regex-invalid');
      var raw = input.value || '';
      if (!raw.trim()) {
        setCount(0);
        refreshHighlightTooltips(document);
        return;
      }
      var re;
      try {
        re = parseRegexInput(raw);
      } catch (e) {
        block.classList.add('ws-doc-regex-invalid');
        countEl.textContent = L.regexInvalid;
        return;
      }
      if (!re) {
        setCount(0);
        refreshHighlightTooltips(document);
        return;
      }
      var total = 0;
      root.querySelectorAll('.ws-wrapper > p').forEach(function (p) {
        var text = p.textContent || '';
        var blocks = [];
        var useParagraph = scopeParagraph && scopeParagraph.checked;
        var useSentence = scopeSentence && scopeSentence.checked;
        if (!useParagraph && !useSentence) useParagraph = true;
        if (useParagraph) {
          var bounds = normalizeBlockBounds(text, 0, text.length);
          if (bounds[1] > bounds[0]) blocks.push({ start: bounds[0], end: bounds[1] });
        }
        if (useSentence) {
          blocks = blocks.concat(getSentenceBlocks(text));
        }
        var ranges = findRegexRangesInBlocks(text, re, blocks);
        total += highlightRegexRangesInParagraph(p, ranges, L.regexSearch + ': ' + raw);
      });
      setCount(total);
      if (total > 0) document.body.classList.add('ws-focus-regex');
      refreshHighlightTooltips(document);
    }

    function clearRegex() {
      clearRegexMatches(root);
      input.value = '';
      setCount(0);
      block.classList.remove('ws-doc-regex-invalid');
      document.body.classList.remove('ws-focus-regex');
      updateScopeVisibility();
      refreshHighlightTooltips(document);
    }

    applyBtn.addEventListener('click', applyRegex);
    clearBtn.addEventListener('click', clearRegex);
    input.addEventListener('input', function () {
      updateScopeVisibility();
    });
    input.addEventListener('keydown', function (evt) {
      if (evt.key === 'Enter') {
        evt.preventDefault();
        applyRegex();
      }
    });
    updateScopeVisibility();
  }
