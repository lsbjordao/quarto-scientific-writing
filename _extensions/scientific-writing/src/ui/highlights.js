// src/ui/highlights.js — Generic text and inline annotation highlighters.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

  function highlightItalicText(p) {
    p.querySelectorAll('em, i').forEach(function (el) {
      el.classList.add('ws-italic-text');
      markReason(el, 'italic', L.italicText);
    });
  }

  function wrapLongSentences(p, threshold) {
    var title = L.longSent;
    var marked = p.innerHTML.replace(
      /([.!?]+\s+)(?=[A-ZÁÉÍÓÚÀÂÊÔÃÕÜÇÑ"])/g,
      '$1\x00'
    );
    p.innerHTML = marked.split('\x00').map(function (part) {
      return countWords(part.replace(/<[^>]+>/g, ' ')) > threshold
        ? '<span class="ws-long-sentence" data-ws-focus="long" data-ws-reason="' + escapeHTML(title) + '" title="' + title + '">' + part + '</span>'
        : part;
    }).join('');
  }

  function wrapNoVerbSentences(p) {
    var re = getVerbRegex();
    var title = L.noVerb;
    var marked = p.innerHTML.replace(
      /([.!?]+\s+)(?=[A-ZÁÉÍÓÚÀÂÊÔÃÕÜÇÑ"])/g,
      '$1\x00'
    );
    p.innerHTML = marked.split('\x00').map(function (part) {
      var plain = part.replace(/<[^>]+>/g, ' ');
      return countWords(plain) >= 6 && !re.test(plain)
        ? '<span class="ws-no-verb" data-ws-focus="noverb" data-ws-reason="' + escapeHTML(title) + '" title="' + title + '">' + part + '</span>'
        : part;
    }).join('');
  }

  function highlightInNode(node, wordSet, cls) {
    var RE = LANG === 'en' ? /(\b[a-z]+\b)/gi : /(\b[a-záéíóúàâêôãõüç]+\b)/gi;
    if (node.nodeType === Node.TEXT_NODE) {
      var parts = node.textContent.split(RE);
      if (parts.length <= 1) return;
      var changed = false;
      var frag = document.createDocumentFragment();
      parts.forEach(function (part) {
        if (part.length >= 4 && wordSet.has(part.toLowerCase())) {
          var span = document.createElement('span');
          span.className = cls;
          span.dataset.word = part.toLowerCase();
          markReason(span, 'repeated', L.repeated + ' ' + part.toLowerCase());
          span.textContent = part;
          frag.appendChild(span);
          changed = true;
        } else {
          frag.appendChild(document.createTextNode(part));
        }
      });
      if (changed) node.parentNode.replaceChild(frag, node);
    } else if (
      node.nodeType === Node.ELEMENT_NODE &&
      node.tagName !== 'SCRIPT' && node.tagName !== 'STYLE' &&
      !node.classList.contains('ws-note')
    ) {
      Array.from(node.childNodes).forEach(function (c) { highlightInNode(c, wordSet, cls); });
    }
  }

  function highlightPatternInNode(node, patterns, cls, title) {
    if (node.nodeType === Node.TEXT_NODE) {
      var text = node.textContent;
      var ranges = [];
      patterns.forEach(function (re) {
        var r = new RegExp(re.source, 'gi');
        var m;
        while ((m = r.exec(text)) !== null) ranges.push([m.index, m.index + m[0].length]);
      });
      if (ranges.length === 0) return;

      ranges.sort(function (a, b) { return a[0] - b[0]; });
      var merged = [ranges[0].slice()];
      for (var i = 1; i < ranges.length; i++) {
        var last = merged[merged.length - 1];
        if (ranges[i][0] < last[1]) { last[1] = Math.max(last[1], ranges[i][1]); }
        else { merged.push(ranges[i].slice()); }
      }

      var spanTitle = title || (cls === 'ws-passive' ? L.passive : cls === 'ws-hedge' ? L.hedges : '');
      var frag = document.createDocumentFragment();
      var pos = 0;
      merged.forEach(function (rng) {
        if (rng[0] > pos) frag.appendChild(document.createTextNode(text.slice(pos, rng[0])));
        var span = document.createElement('span');
        span.className = cls;
        if (spanTitle) markReason(span, cls === 'ws-passive' ? 'passive' : cls === 'ws-hedge' ? 'hedge' : '', spanTitle);
        span.textContent = text.slice(rng[0], rng[1]);
        frag.appendChild(span);
        pos = rng[1];
      });
      if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
      node.parentNode.replaceChild(frag, node);

    } else if (
      node.nodeType === Node.ELEMENT_NODE &&
      node.tagName !== 'SCRIPT' && node.tagName !== 'STYLE' &&
      !node.classList.contains('ws-note')
    ) {
      Array.from(node.childNodes).forEach(function (c) { highlightPatternInNode(c, patterns, cls, title); });
    }
  }

  function highlightModalVerbs(p) {
    var re = LANG === 'en'
      ? /\b(may|might|could|would|should)\b/gi
      : /\b(pode|poderia|poderiam|deve|deveria|deveriam|seria|seriam)\b/gi;
    highlightRegexInNode(p, re, 'ws-modal', L.modalVerbs);
  }

  function highlightFirstPerson(p) {
    var re = LANG === 'en'
      ? /\b(I|we|our|ours|my|mine|us)\b/g
      : /\b(eu|n\u00f3s|nossa|nosso|nossas|nossos)\b/gi;
    highlightRegexInNode(p, re, 'ws-firstperson', L.firstPerson);
  }

  function highlightCitationSentStart(p) {
    var re = /(?:^|(?<=[.!?]\s{1,3}))(\((?:[^)]*\d{4}[^)]*)\)|\[[0-9,\-\s]+\])/g;
    highlightRegexInNode(p, re, 'ws-citation-start', L.citationSentStart);
  }

  // Citation immediately before sentence-ending punctuation. The terminal '.' is a
  // sibling text node of the .citation span, so this works on the DOM (the period is
  // not inside the citation's own text node, which rules out a lookahead regex).
  function highlightCitationSentEnd(p) {
    if (!p.querySelectorAll) return;
    p.querySelectorAll('.citation').forEach(function (cite) {
      var after = '';
      var n = cite.nextSibling;
      while (n && after.length < 4) {
        if (n.nodeType === Node.TEXT_NODE) { after += n.textContent; n = n.nextSibling; }
        else break;
      }
      if (/^\s*[.!?]/.test(after)) {
        cite.classList.add('ws-citation-end');
        markReason(cite, 'citation-end', L.citationSentEnd);
      }
    });
  }

  function highlightRegexInNode(node, re, cls, title) {
    if (node.nodeType === Node.TEXT_NODE) {
      var text = node.textContent;
      var ranges = [];
      var r = new RegExp(re.source, 'gi');
      var m;
      while ((m = r.exec(text)) !== null) ranges.push([m.index, m.index + m[0].length]);
      if (ranges.length === 0) return;
      var frag = document.createDocumentFragment();
      var pos = 0;
      ranges.forEach(function (rng) {
        if (rng[0] > pos) frag.appendChild(document.createTextNode(text.slice(pos, rng[0])));
        var span = document.createElement('span');
        span.className = cls;
        var focus = HIGHLIGHT_FOCUS_CLASSES[cls] || '';
        markReason(span, focus, title);
        span.textContent = text.slice(rng[0], rng[1]);
        frag.appendChild(span);
        pos = rng[1];
      });
      if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
      node.parentNode.replaceChild(frag, node);
    } else if (
      node.nodeType === Node.ELEMENT_NODE &&
      node.tagName !== 'SCRIPT' && node.tagName !== 'STYLE' &&
      !node.classList.contains('ws-note') &&
      !node.classList.contains('ws-passive') &&
      !node.classList.contains('ws-repeated')
    ) {
      Array.from(node.childNodes).forEach(function (c) { highlightRegexInNode(c, re, cls, title); });
    }
  }

  function termBoundaryOk(text, start, end) {
    var before = start > 0 ? text.charAt(start - 1) : '';
    var after = end < text.length ? text.charAt(end) : '';
    return (!before || !isWordChar(before)) && (!after || !isWordChar(after));
  }

  function highlightTermListInNode(node, terms, cls, title) {
    var list = (terms || [])
      .map(function (t) { return normalizeWord(t.text || t); })
      .filter(function (t) { return t.length >= 3; })
      .sort(function (a, b) { return b.length - a.length; })
      .slice(0, 20);
    if (!list.length) return;

    if (node.nodeType === Node.TEXT_NODE) {
      var text = node.textContent;
      var lower = text.toLowerCase();
      var ranges = [];
      list.forEach(function (term) {
        var from = 0;
        while (from < lower.length) {
          var idx = lower.indexOf(term, from);
          if (idx === -1) break;
          var end = idx + term.length;
          if (termBoundaryOk(lower, idx, end)) ranges.push([idx, end]);
          from = idx + Math.max(1, term.length);
        }
      });
      if (!ranges.length) return;
      ranges.sort(function (a, b) { return a[0] - b[0] || b[1] - a[1]; });
      var merged = [];
      ranges.forEach(function (rng) {
        var last = merged[merged.length - 1];
        if (last && rng[0] < last[1]) return;
        merged.push(rng);
      });
      var frag = document.createDocumentFragment();
      var pos = 0;
      merged.forEach(function (rng) {
        if (rng[0] > pos) frag.appendChild(document.createTextNode(text.slice(pos, rng[0])));
        var span = document.createElement('span');
        span.className = cls;
        var focus = HIGHLIGHT_FOCUS_CLASSES[cls] || '';
        markReason(span, focus, title);
        span.textContent = text.slice(rng[0], rng[1]);
        frag.appendChild(span);
        pos = rng[1];
      });
      if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
      node.parentNode.replaceChild(frag, node);
    } else if (
      node.nodeType === Node.ELEMENT_NODE &&
      node.tagName !== 'SCRIPT' && node.tagName !== 'STYLE' &&
      !node.classList.contains('ws-note') &&
      !node.classList.contains('citation') &&
      !node.classList.contains('csl-entry') &&
      node.id !== 'refs' &&
      node.getAttribute('role') !== 'doc-biblioref'
    ) {
      Array.from(node.childNodes).forEach(function (c) { highlightTermListInNode(c, list, cls, title); });
    }
  }

  function highlightNominalizations(p) {
    var re = LANG === 'en'
      ? /\b[a-z]{5,}(?:tion|ment|ity|ness|ance|ence)\b/gi
      : /\b[a-záéíóúàâêôãõüç]{5,}(?:ção|ções|são|sões|mento|mentos|dade|dades|ância|ência)\b/gi;
    var skip = new Set(Array.from(EXCLUDED_TERMS));
    if (skip.size === 0) {
      highlightRegexInNode(p, re, 'ws-nominalization', L.nominalization);
      return;
    }

    if (p.nodeType === Node.ELEMENT_NODE) {
      var walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT, null);
      var nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(function (node) {
        var parts = node.textContent.split(/(\b[a-záéíóúàâêôãõüçñ]+\b)/gi);
        if (parts.length <= 1) return;
        var changed = false;
        var frag = document.createDocumentFragment();
        parts.forEach(function (part) {
          var lower = normalizeWord(part);
          if (!skip.has(lower) && re.test(part)) {
            var span = document.createElement('span');
            span.className = 'ws-nominalization';
            markReason(span, 'nominal', L.nominalization);
            span.textContent = part;
            frag.appendChild(span);
            changed = true;
          } else {
            frag.appendChild(document.createTextNode(part));
          }
          re.lastIndex = 0;
        });
        if (changed) node.parentNode.replaceChild(frag, node);
      });
    }
  }

  function highlightHedges(p) {
    var patterns = getHedgeRegexes();
    highlightPatternInNode(p, patterns, 'ws-hedge');
  }

  function highlightColloquial(p) {
    var terms = getColloquialTerms();
    terms.forEach(function (term) {
      var safe = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var re = term.indexOf(' ') >= 0
        ? new RegExp(safe, 'gi')
        : new RegExp('\\b' + safe + '\\b', 'gi');
      highlightRegexInNode(p, re, 'ws-colloquial', L.colloquial);
    });
  }

  function highlightComplexSentences(p) {
    var title = L.complexSent;
    var marked = p.innerHTML.replace(
      /([.!?]+\s+)(?=[A-ZÁÉÍÓÚÀÂÊÔÃÕÜÇÑ"])/g,
      '$1\x00'
    );
    p.innerHTML = marked.split('\x00').map(function (part) {
      var plain = part.replace(/<[^>]+>/g, ' ');
      return sentenceComplexityScore(plain) >= 3
        ? '<span class="ws-complex-sent" data-ws-focus="complexsent" data-ws-reason="' + escapeHTML(title) + '" title="' + escapeHTML(title) + '">' + part + '</span>'
        : part;
    }).join('');
  }

  function highlightRepeatedStarts(p, repeatedParaStartSet) {
    if (!repeatedParaStartSet || repeatedParaStartSet.size === 0) return;
    var text = p.innerText || p.textContent || '';
    var key = getParaOpeningKey(text);
    if (!key || !repeatedParaStartSet.has(key)) return;

    var pattern = key.split(/\s+/).map(function (w) {
      return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('\\s+');
    var re = new RegExp("^(\\s*[\"'«\\(\\[]*)(" + pattern + ")\\b", 'i');
    var title = L.repeatedStarts;
    var walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT, null);
    while (walker.nextNode()) {
      var node = walker.currentNode;
      var src = node.textContent || '';
      if (!src.trim()) continue;
      var m = src.match(re);
      if (!m) return;
      var prefix = m[1] || '';
      var phrase = m[2] || '';
      var suffix = src.slice((prefix + phrase).length);
      var frag = document.createDocumentFragment();
      if (prefix) frag.appendChild(document.createTextNode(prefix));
      var span = document.createElement('span');
      span.className = 'ws-repeated-start';
      markReason(span, 'repeated-start', title);
      span.title = title;
      span.textContent = phrase;
      frag.appendChild(span);
      if (suffix) frag.appendChild(document.createTextNode(suffix));
      node.parentNode.replaceChild(frag, node);
      return;
    }
  }

  function highlightPronounAmbig(p) {
    var re = LANG === 'en'
      ? /(?:^|(?<=[.!?]\s{1,3}))(it|this|these|those|they|them|its)\b/gi
      : /(?:^|(?<=[.!?]\s{1,3}))(isso|este|esta|estes|estas|eles|elas|ele|ela|tal|tais)\b/gi;
    highlightRegexInNode(p, re, 'ws-pronoun-ambig', L.pronounAmbig);
  }

  function highlightWordyPhrases(p) {
    var regexes = getWordyPhrasesRegexes();
    regexes.forEach(function (item) {
      var title = L.wordyPhrases + (item.suggestion ? ' \u2192 ' + item.suggestion : '');
      highlightRegexInNode(p, item.re, 'ws-wordy', title);
    });
  }

  function highlightTermVariants(p, forms) {
    if (!forms || !forms.length) return;
    highlightTermListInNode(p, forms.map(function (f) { return { text: f }; }), 'ws-term-variant', L.termVariants);
  }

  function highlightUndefinedAcronyms(p, acronyms) {
    if (!acronyms || !acronyms.length) return;
    var alts = acronyms.map(function (a) { return String(a).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
    highlightRegexInNode(p, new RegExp('\\b(?:' + alts.join('|') + ')s?\\b', 'g'), 'ws-undefined-acronym', L.undefinedAcronyms);
  }

  function highlightUnitInconsistency(p, regexes) {
    if (!regexes || !regexes.length) return;
    regexes.forEach(function (re) {
      highlightRegexInNode(p, re, 'ws-unit-inconsistency', L.unitConsistency);
    });
  }

  function highlightEmphaticPunct(p) {
    highlightRegexInNode(p, /[!?](?:[!?]+)/g, 'ws-emphatic-punct', L.emphaticPunct);
  }

  function highlightConnectors(p) {
    var categories = getConnectorCategories();
    var contextual = getContextualConnectorTerms();
    Object.keys(categories).forEach(function (cat) {
      categories[cat].forEach(function (term) {
        var mode = getConnectorAmbiguityMode(term);
        highlightConnectorInNode(
          p,
          term,
          'ws-connector ws-connector-' + cat,
          connectorCategoryLabel(cat) + ' • ' + connectorAmbiguityLabel(mode),
          contextual.has(term),
          mode
        );
      });
    });
  }
