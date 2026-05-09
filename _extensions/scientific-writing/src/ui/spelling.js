// src/ui/spelling.js — Optional API-backed spelling underlines.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

  var SPELLCHECK_CACHE = Object.create(null);

  function spellingLabelFor(match, word) {
    var replacements = Array.isArray(match.replacements)
      ? match.replacements.map(function (r) { return r && r.value; }).filter(Boolean).slice(0, 4)
      : [];
    var base = L.spellingIssue || 'Possible spelling issue';
    var msg = match.message || base;
    var out = base + ': ' + word;
    if (replacements.length) out += ' -> ' + replacements.join(', ');
    if (msg && msg !== base) out += ' (' + msg + ')';
    return out;
  }

  function isSpellingMatch(match) {
    var rule = match && match.rule || {};
    var issueType = String(rule.issueType || '').toLowerCase();
    var category = String(rule.category && rule.category.id || '').toUpperCase();
    return issueType === 'misspelling' || category === 'TYPOS';
  }

  function cleanSpellingMatches(text, matches) {
    return (matches || []).filter(function (match) {
      if (!isSpellingMatch(match)) return false;
      var start = Number(match.offset);
      var len = Number(match.length);
      if (!isFinite(start) || !isFinite(len) || len <= 0) return false;
      var word = text.slice(start, start + len);
      if (!/[A-Za-zÁÉÍÓÚÀÂÊÔÃÕÜÇÑáéíóúàâêôãõüçñ]/.test(word)) return false;
      if (/[0-9/@]/.test(word)) return false;
      if (/^[A-ZÁÉÍÓÚÀÂÊÔÃÕÜÇÑ]{2,}$/.test(word)) return false;
      if (shouldIgnoreSpellingWord(word)) return false;
      return true;
    }).sort(function (a, b) {
      return a.offset - b.offset || b.length - a.length;
    });
  }

  function requestLanguageTool(text) {
    var key = SPELLCHECK_LANGUAGE + '\u0000' + hashText(text);
    if (SPELLCHECK_CACHE[key]) return SPELLCHECK_CACHE[key];

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, SPELLCHECK_TIMEOUT_MS) : null;
    var body = new URLSearchParams();
    body.set('text', text);
    body.set('language', SPELLCHECK_LANGUAGE);
    body.set('enabledOnly', 'false');

    SPELLCHECK_CACHE[key] = fetch(SPELLCHECK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: controller ? controller.signal : undefined,
    })
      .then(function (res) {
        if (!res.ok) throw new Error('spellcheck HTTP ' + res.status);
        return res.json();
      })
      .then(function (json) {
        return cleanSpellingMatches(text, json && json.matches);
      })
      .catch(function (err) {
        console.warn('[scientific-writing] spellcheck failed', err);
        return [];
      })
      .finally(function () {
        if (timer) clearTimeout(timer);
      });

    return SPELLCHECK_CACHE[key];
  }

  function wrapRangesInTextNodes(root, ranges, cls) {
    if (!ranges.length) return 0;
    var rangeIndex = 0;
    var offset = 0;
    var wrapped = 0;

    function visit(node) {
      if (rangeIndex >= ranges.length) return;
      if (node.nodeType === Node.TEXT_NODE) {
        var text = node.textContent;
        var nodeStart = offset;
        var nodeEnd = offset + text.length;
        offset = nodeEnd;
        var local = [];
        while (rangeIndex < ranges.length && ranges[rangeIndex].end <= nodeStart) rangeIndex++;
        var scan = rangeIndex;
        while (scan < ranges.length && ranges[scan].start < nodeEnd) {
          var item = ranges[scan];
          if (item.start >= nodeStart && item.end <= nodeEnd) {
            local.push({
              start: item.start - nodeStart,
              end: item.end - nodeStart,
              reason: item.reason,
            });
          }
          scan++;
        }
        if (!local.length) return;

        var frag = document.createDocumentFragment();
        var pos = 0;
        local.forEach(function (item) {
          if (item.start > pos) frag.appendChild(document.createTextNode(text.slice(pos, item.start)));
          var span = document.createElement('span');
          span.className = cls;
          markReason(span, HIGHLIGHT_FOCUS_CLASSES[cls] || '', item.reason);
          span.textContent = text.slice(item.start, item.end);
          frag.appendChild(span);
          pos = item.end;
          wrapped++;
        });
        if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
        node.parentNode.replaceChild(frag, node);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (
          node.tagName === 'SCRIPT' ||
          node.tagName === 'STYLE' ||
          node.classList.contains('ws-note') ||
          node.classList.contains('citation') ||
          node.classList.contains('csl-entry') ||
          node.classList.contains('ws-spelling') ||
          node.id === 'refs'
        ) {
          offset += (node.textContent || '').length;
          return;
        }
        Array.from(node.childNodes).forEach(visit);
      }
    }

    visit(root);
    return wrapped;
  }

  async function highlightSpelling(p, text) {
    if (!SPELLCHECK_ENABLED) return 0;
    if (SPELLCHECK_PROVIDER !== 'languagetool') return 0;
    if (!text || text.length < 3 || typeof fetch !== 'function' || typeof URLSearchParams !== 'function') return 0;

    var matches = await requestLanguageTool(text);
    var ranges = [];
    matches.forEach(function (match) {
      var start = Number(match.offset);
      var end = start + Number(match.length);
      if (ranges.length && start < ranges[ranges.length - 1].end) return;
      var word = text.slice(start, end);
      ranges.push({ start: start, end: end, reason: spellingLabelFor(match, word) });
    });
    var count = wrapRangesInTextNodes(p, ranges, 'ws-spelling');
    if (count) refreshHighlightTooltips(p);
    return count;
  }
