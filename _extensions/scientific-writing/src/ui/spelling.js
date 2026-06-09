// src/ui/spelling.js — Optional API-backed spelling underlines.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

  var SPELLCHECK_CACHE = Object.create(null);
  var SPELLING_SOURCE_HANDLE = null;
  var SPELLING_SOURCE_NAME = '';
  var SPELLING_SOURCE_BUTTON = null;
  var SPELLING_TOOLTIP = null;
  var SPELLING_TOOLTIP_TARGET = null;
  var SPELLING_TOAST = null;
  var SPELLING_TOAST_TIMER = null;

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

  function spellingContextFor(text, start, end) {
    return {
      before: text.slice(Math.max(0, start - 48), start),
      after: text.slice(end, Math.min(text.length, end + 48)),
    };
  }

  function normalizeSourceContext(s) {
    return String(s || '')
      .replace(/\{\{<\s*var\s+[\w-]+\s*>}}/g, ' ')
      .replace(/\[@[^\]]+]/g, ' ')
      .replace(/[*_`{}[\]()#>~]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
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
              word: item.word,
              replacements: item.replacements,
              before: item.before,
              after: item.after,
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
          span.dataset.wsFocus = HIGHLIGHT_FOCUS_CLASSES[cls] || '';
          span.dataset.wsSpellingWord = item.word || span.textContent;
          span.dataset.wsSpellingReplacements = JSON.stringify(item.replacements || []);
          span.dataset.wsSpellingBefore = item.before || '';
          span.dataset.wsSpellingAfter = item.after || '';
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
      var replacements = Array.isArray(match.replacements)
        ? match.replacements.map(function (r) { return r && r.value; }).filter(Boolean).slice(0, 5)
        : [];
      var context = spellingContextFor(text, start, end);
      ranges.push({
        start: start,
        end: end,
        word: word,
        replacements: replacements,
        before: context.before,
        after: context.after,
        reason: spellingLabelFor(match, word),
      });
    });
    var count = wrapRangesInTextNodes(p, ranges, 'ws-spelling');
    if (count) {
      ensureSpellingTooltipWired();
    }
    return count;
  }

  function supportsSourceFileAccess() {
    return typeof window.showOpenFilePicker === 'function';
  }

  function sourceValidationText() {
    var root =
      document.getElementById('quarto-document-content') ||
      document.querySelector('main') ||
      document.body;
    return normalizeSourceContext((root.innerText || root.textContent || '')).toLowerCase();
  }

  function validateSpellingSourceFile(name, content) {
    if (!/\.qmd$/i.test(String(name || ''))) {
      throw new Error(L.sourceMustBeQmd || 'Choose a .qmd file.');
    }

    var source = normalizeSourceContext(content).toLowerCase();
    var rendered = sourceValidationText();
    var title = (document.querySelector('h1.title, .quarto-title h1, #title-block-header h1') || {}).textContent || '';
    var checks = [];
    if (title) checks.push(normalizeSourceContext(title).toLowerCase());

    var paras = Array.from(document.querySelectorAll('#quarto-document-content p, main p'))
      .map(function (p) { return normalizeSourceContext(p.innerText || p.textContent || '').toLowerCase(); })
      .filter(function (s) { return s.length >= 35; })
      .slice(0, 4);
    paras.forEach(function (p) {
      checks.push(p.slice(0, Math.min(90, p.length)));
    });

    var passed = checks.filter(function (needle) {
      return needle && (source.indexOf(needle) !== -1 || rendered.indexOf(needle) !== -1 && source.indexOf(needle.slice(0, 45)) !== -1);
    }).length;

    if (!checks.length || passed < Math.min(2, checks.length)) {
      throw new Error(L.sourceDoesNotMatch || 'The selected .qmd does not appear to be the source for this HTML.');
    }
  }

  function setSpellingSourceButtonState() {
    if (!SPELLING_SOURCE_BUTTON) return;
    SPELLING_SOURCE_BUTTON.textContent = SPELLING_SOURCE_HANDLE
      ? (L.sourceConnectedBtn || 'source connected')
      : (L.sourceConnectBtn || 'connect source');
    SPELLING_SOURCE_BUTTON.classList.toggle('ws-control-on', !!SPELLING_SOURCE_HANDLE);
    SPELLING_SOURCE_BUTTON.title = SPELLING_SOURCE_HANDLE
      ? ((L.sourceConnectedTitle || 'Connected source file') + ': ' + SPELLING_SOURCE_NAME)
      : (L.sourceConnectTitle || 'Connect the source .qmd file');
  }

  function showSpellingToast(message, level) {
    if (!message) return;
    if (!SPELLING_TOAST) {
      SPELLING_TOAST = document.createElement('div');
      SPELLING_TOAST.className = 'ws-toast';
      document.body.appendChild(SPELLING_TOAST);
    }
    SPELLING_TOAST.textContent = message;
    SPELLING_TOAST.className = 'ws-toast ws-toast-visible ws-toast-' + (level || 'warn');
    if (SPELLING_TOAST_TIMER) clearTimeout(SPELLING_TOAST_TIMER);
    SPELLING_TOAST_TIMER = setTimeout(function () {
      if (SPELLING_TOAST) SPELLING_TOAST.classList.remove('ws-toast-visible');
    }, 4200);
  }

  async function connectSpellingSourceFile() {
    if (!supportsSourceFileAccess()) {
      window.alert(L.sourceUnsupported || 'This browser does not allow direct source-file editing from the page.');
      return;
    }
    var handles = await window.showOpenFilePicker({
      multiple: false,
      types: [{
        description: 'Quarto document',
        accept: { 'text/markdown': ['.qmd'] },
      }],
      excludeAcceptAllOption: true,
    });
    var handle = handles && handles[0] || null;
    if (!handle) return;
    var file = await handle.getFile();
    var content = await file.text();
    validateSpellingSourceFile(handle.name || file.name, content);
    SPELLING_SOURCE_HANDLE = handle;
    SPELLING_SOURCE_NAME = SPELLING_SOURCE_HANDLE.name || file.name || '';
    setSpellingSourceButtonState();
  }

  function initSpellingSourceControls(box) {
    if (!SPELLCHECK_ENABLED || !box) return;
    // The "connect source" button relies on the File System Access API
    // (window.showOpenFilePicker), available only in Chromium-based browsers.
    // On Firefox/Safari, omit the control entirely rather than show a disabled,
    // broken-looking button.
    if (!supportsSourceFileAccess()) return;
    SPELLING_SOURCE_BUTTON = makeControlButton(L.sourceConnectBtn || 'connect source', L.sourceConnectTitle || 'Connect source .qmd');
    SPELLING_SOURCE_BUTTON.classList.add('ws-source-file-btn');
    SPELLING_SOURCE_BUTTON.addEventListener('click', function () {
      connectSpellingSourceFile().catch(function (err) {
        console.warn('[scientific-writing] source connect failed', err);
        showSpellingToast(err && err.message ? err.message : String(err), 'warn');
      });
    });
    setSpellingSourceButtonState();
    box.appendChild(SPELLING_SOURCE_BUTTON);
  }

  function hideSpellingTooltip() {
    if (SPELLING_TOOLTIP && SPELLING_TOOLTIP.parentNode) SPELLING_TOOLTIP.parentNode.removeChild(SPELLING_TOOLTIP);
    SPELLING_TOOLTIP = null;
    SPELLING_TOOLTIP_TARGET = null;
  }

  function showSpellingTooltip(target) {
    hideSpellingTooltip();
    SPELLING_TOOLTIP_TARGET = target;

    var word = target.dataset.wsSpellingWord || target.textContent || '';
    var replacements = [];
    try { replacements = JSON.parse(target.dataset.wsSpellingReplacements || '[]'); } catch (e) {}

    var tip = document.createElement('div');
    tip.className = 'ws-spelling-tip';

    var title = document.createElement('div');
    title.className = 'ws-spelling-tip-title';
    title.textContent = L.spellingIssue || 'Possible spelling issue';
    tip.appendChild(title);

    var original = document.createElement('div');
    original.className = 'ws-spelling-tip-word';
    original.textContent = word;
    tip.appendChild(original);

    var list = document.createElement('div');
    list.className = 'ws-spelling-tip-actions';
    if (replacements.length) {
      replacements.forEach(function (replacement) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ws-spelling-suggestion';
        btn.textContent = replacement;
        btn.addEventListener('click', function () {
          applySpellingSuggestion(target, replacement, tip).catch(function (err) {
            setSpellingTipStatus(tip, err && err.message ? err.message : String(err), true);
          });
        });
        list.appendChild(btn);
      });
    } else {
      var empty = document.createElement('span');
      empty.className = 'ws-spelling-tip-empty';
      empty.textContent = L.noSpellingSuggestions || 'No suggestions';
      list.appendChild(empty);
    }
    tip.appendChild(list);

    var status = document.createElement('div');
    status.className = 'ws-spelling-tip-status';
    status.textContent = SPELLING_SOURCE_HANDLE
      ? ((L.sourceReady || 'Source ready') + ': ' + SPELLING_SOURCE_NAME)
      : (L.sourceNotConnected || 'Connect the .qmd source to apply fixes.');
    tip.appendChild(status);

    var footer = document.createElement('div');
    footer.className = 'ws-spelling-tip-footer';
    var ignore = document.createElement('button');
    ignore.type = 'button';
    ignore.className = 'ws-spelling-tip-secondary';
    ignore.textContent = L.ignoreSpellingBtn || 'ignore';
    ignore.addEventListener('click', function () {
      target.classList.add('ws-spelling-ignored');
      target.classList.remove('ws-spelling');
      hideSpellingTooltip();
    });
    var ignoreSource = document.createElement('button');
    ignoreSource.type = 'button';
    ignoreSource.className = 'ws-spelling-tip-secondary';
    ignoreSource.textContent = L.ignoreSpellingSourceBtn || 'ignore in source';
    ignoreSource.addEventListener('click', function () {
      addSpellingIgnoreToSource(target, tip).catch(function (err) {
        setSpellingTipStatus(tip, err && err.message ? err.message : String(err), true);
      });
    });
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'ws-spelling-tip-secondary';
    close.textContent = L.closeBtn || 'close';
    close.addEventListener('click', hideSpellingTooltip);
    footer.appendChild(ignore);
    footer.appendChild(ignoreSource);
    footer.appendChild(close);
    tip.appendChild(footer);

    document.body.appendChild(tip);
    SPELLING_TOOLTIP = tip;

    var rect = target.getBoundingClientRect();
    var scrollY = window.scrollY || document.documentElement.scrollTop;
    var scrollX = window.scrollX || document.documentElement.scrollLeft;
    var left = Math.min(scrollX + rect.left, scrollX + window.innerWidth - 310);
    var top = scrollY + rect.bottom + 8;
    tip.style.left = Math.max(12, left) + 'px';
    tip.style.top = top + 'px';
  }

  function setSpellingTipStatus(tip, message, error) {
    var status = tip && tip.querySelector('.ws-spelling-tip-status');
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('ws-spelling-tip-error', !!error);
  }

  function findSourceReplacement(content, wrong, replacement, before, after) {
    var positions = [];
    var from = 0;
    while (from < content.length) {
      var idx = content.indexOf(wrong, from);
      if (idx === -1) break;
      positions.push(idx);
      from = idx + Math.max(1, wrong.length);
    }
    if (!positions.length) throw new Error(L.sourceWordMissing || 'Word not found in source file.');

    var beforeNeedle = normalizeSourceContext(before).slice(-28);
    var afterNeedle = normalizeSourceContext(after).slice(0, 28);
    var matches = positions.filter(function (idx) {
      var windowStart = Math.max(0, idx - 140);
      var windowEnd = Math.min(content.length, idx + wrong.length + 140);
      var ctx = normalizeSourceContext(content.slice(windowStart, windowEnd));
      return (!beforeNeedle || ctx.indexOf(beforeNeedle) !== -1) &&
        (!afterNeedle || ctx.indexOf(afterNeedle) !== -1);
    });

    if (matches.length === 0 && positions.length === 1) matches = positions;
    if (matches.length !== 1) throw new Error(L.sourceAmbiguous || 'Ambiguous source match. No change was made.');

    var idx = matches[0];
    return content.slice(0, idx) + replacement + content.slice(idx + wrong.length);
  }

  function frontMatterBounds(content) {
    var text = String(content || '');
    if (text.slice(0, 3) !== '---') return null;
    var end = text.indexOf('\n---', 3);
    if (end === -1) return null;
    var closeEnd = end + 4;
    if (text.charAt(closeEnd) === '\r') closeEnd++;
    if (text.charAt(closeEnd) === '\n') closeEnd++;
    return { bodyStart: 4, closeStart: end + 1, closeEnd: closeEnd };
  }

  function yamlScalarValue(line) {
    var raw = String(line || '').replace(/^\s*-\s*/, '').trim();
    if ((raw.charAt(0) === '"' && raw.charAt(raw.length - 1) === '"') ||
        (raw.charAt(0) === "'" && raw.charAt(raw.length - 1) === "'")) {
      raw = raw.slice(1, -1);
    }
    return raw;
  }

  function yamlQuoteWord(word) {
    var w = String(word || '').trim();
    if (/^[A-Za-z0-9_ .-]+$/.test(w)) return w;
    return '"' + w.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }

  function addIgnoreTermToYaml(content, word) {
    var term = String(word || '').trim();
    if (!term) throw new Error(L.sourceNoChange || 'No source change was needed.');
    var bounds = frontMatterBounds(content);
    if (!bounds) throw new Error(L.sourceYamlMissing || 'YAML front matter not found.');

    var before = content.slice(0, bounds.bodyStart);
    var yaml = content.slice(bounds.bodyStart, bounds.closeStart);
    var after = content.slice(bounds.closeStart);
    var lines = yaml.split(/\n/);
    var sciIdx = -1;
    var sciIndent = 0;
    var sciEnd = lines.length;
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(/^(\s*)scientific-writing:\s*$/);
      if (m) {
        sciIdx = i;
        sciIndent = m[1].length;
        break;
      }
    }
    if (sciIdx === -1) throw new Error(L.sourceScientificWritingMissing || 'scientific-writing YAML block not found.');

    for (var j = sciIdx + 1; j < lines.length; j++) {
      if (/^\s*$/.test(lines[j])) continue;
      var indent = (lines[j].match(/^(\s*)/) || ['',''])[1].length;
      if (indent <= sciIndent && !/^\s*-/.test(lines[j])) {
        sciEnd = j;
        break;
      }
    }

    var keyIdx = -1;
    var keyIndent = sciIndent + 2;
    for (var k = sciIdx + 1; k < sciEnd; k++) {
      var km = lines[k].match(/^(\s*)spellcheck-ignore-terms:\s*(.*)$/);
      if (km) {
        keyIdx = k;
        keyIndent = km[1].length;
        break;
      }
    }

    var lower = term.toLowerCase();
    if (keyIdx !== -1) {
      var listEnd = keyIdx + 1;
      while (listEnd < sciEnd) {
        if (/^\s*$/.test(lines[listEnd])) {
          listEnd++;
          continue;
        }
        var indent2 = (lines[listEnd].match(/^(\s*)/) || ['',''])[1].length;
        if (indent2 <= keyIndent && !/^\s*-/.test(lines[listEnd])) break;
        if (lines[listEnd].match(/^\s*-\s*/)) {
          var existing = yamlScalarValue(lines[listEnd]);
          if (existing.toLowerCase() === lower) return content;
        }
        listEnd++;
      }
      lines.splice(listEnd, 0, Array(keyIndent + 3).join(' ') + '- ' + yamlQuoteWord(term));
      return before + lines.join('\n') + after;
    }

    var insertAt = sciIdx + 1;
    while (insertAt < sciEnd && /^\s*$/.test(lines[insertAt])) insertAt++;
    var pad = Array(keyIndent + 1).join(' ');
    lines.splice(insertAt, 0, pad + 'spellcheck-ignore-terms:', pad + '  - ' + yamlQuoteWord(term));
    return before + lines.join('\n') + after;
  }

  async function addSpellingIgnoreToSource(target, tip) {
    if (!SPELLING_SOURCE_HANDLE) {
      setSpellingTipStatus(tip, L.sourceNotConnected || 'Connect the .qmd source to apply fixes.');
      await connectSpellingSourceFile().catch(function (err) {
        var msg = err && err.message ? err.message : String(err);
        setSpellingTipStatus(tip, msg, true);
        showSpellingToast(msg, 'warn');
        throw err;
      });
      if (!SPELLING_SOURCE_HANDLE) {
        throw new Error(L.sourceNotConnected || 'Connect the .qmd source to apply fixes.');
      }
    }

    var word = target.dataset.wsSpellingWord || target.textContent || '';
    setSpellingTipStatus(tip, L.sourceAddingIgnore || 'Adding to ignore list...');
    var file = await SPELLING_SOURCE_HANDLE.getFile();
    var content = await file.text();
    var next = addIgnoreTermToYaml(content, word);
    if (next === content) {
      target.classList.add('ws-spelling-ignored');
      setSpellingTipStatus(tip, L.sourceIgnoreAlreadyExists || 'Already in spellcheck-ignore-terms.');
      return;
    }

    var writable = await SPELLING_SOURCE_HANDLE.createWritable();
    await writable.write(next);
    await writable.close();

    target.classList.add('ws-spelling-ignored');
    target.classList.remove('ws-spelling');
    SPELLCHECK_IGNORE_TERMS.add(normalizeWord(word));
    setSpellingTipStatus(tip, L.sourceIgnoreAdded || 'Added to spellcheck-ignore-terms. Render again to refresh the HTML.');
  }

  async function applySpellingSuggestion(target, replacement, tip) {
    if (!SPELLING_SOURCE_HANDLE) {
      setSpellingTipStatus(tip, L.sourceNotConnected || 'Connect the .qmd source to apply fixes.');
      await connectSpellingSourceFile().catch(function (err) {
        var msg = err && err.message ? err.message : String(err);
        setSpellingTipStatus(tip, msg, true);
        showSpellingToast(msg, 'warn');
        throw err;
      });
      if (!SPELLING_SOURCE_HANDLE) {
        throw new Error(L.sourceNotConnected || 'Connect the .qmd source to apply fixes.');
      }
    }
    var wrong = target.dataset.wsSpellingWord || target.textContent || '';
    if (!wrong || !replacement || wrong === replacement) return;

    setSpellingTipStatus(tip, L.sourceApplying || 'Applying to source...');
    var file = await SPELLING_SOURCE_HANDLE.getFile();
    var content = await file.text();
    var next = findSourceReplacement(
      content,
      wrong,
      replacement,
      target.dataset.wsSpellingBefore || '',
      target.dataset.wsSpellingAfter || ''
    );
    if (next === content) throw new Error(L.sourceNoChange || 'No source change was needed.');

    var writable = await SPELLING_SOURCE_HANDLE.createWritable();
    await writable.write(next);
    await writable.close();

    target.textContent = replacement;
    target.classList.add('ws-spelling-fixed');
    target.classList.remove('ws-spelling');
    setSpellingTipStatus(tip, L.sourceApplied || 'Applied to source. Render again to refresh the HTML.');
  }

  function ensureSpellingTooltipWired() {
    if (document.body.dataset.wsSpellingTooltipWired === 'true') return;
    document.body.dataset.wsSpellingTooltipWired = 'true';
    document.addEventListener('click', function (ev) {
      var target = ev.target && ev.target.closest ? ev.target.closest('.ws-spelling') : null;
      if (target) {
        ev.preventDefault();
        ev.stopPropagation();
        showSpellingTooltip(target);
        return;
      }
      if (SPELLING_TOOLTIP && ev.target && !ev.target.closest('.ws-spelling-tip')) hideSpellingTooltip();
    }, true);
  }
