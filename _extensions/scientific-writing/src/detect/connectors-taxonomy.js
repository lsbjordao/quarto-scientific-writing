// src/detect/connectors-taxonomy.js — Connector categories, ambiguity handling and connector highlighting helpers.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

  function getConnectorCategories() {
    if (LANG === 'en') {
      return {
        add: [
          'also', 'moreover', 'furthermore', 'in addition', 'additionally',
          'besides', 'as well', 'as well as', 'not only', 'not only that',
          'similarly', 'likewise', 'another point', 'equally'
        ],
        contrast: [
          'however', 'although', 'whereas', 'nevertheless', 'nonetheless',
          'on the other hand', 'by contrast', 'in contrast', 'yet', 'still',
          'even so', 'despite this', 'conversely', 'rather'
        ],
        cause: [
          'because', 'since', 'as', 'due to', 'owing to', 'because of',
          'therefore', 'thus', 'consequently', 'as a result', 'for this reason',
          'hence', 'accordingly', 'thereby'
        ],
        conclusion: [
          'therefore', 'thus', 'in conclusion', 'to conclude', 'overall',
          'in summary', 'to sum up', 'finally', 'ultimately', 'in short',
          'all in all', 'taken together'
        ],
        time: [
          'then', 'afterwards', 'meanwhile', 'subsequently', 'before', 'after',
          'earlier', 'later', 'at first', 'first', 'second', 'third',
          'next', 'finally', 'at the same time', 'simultaneously',
          'currently', 'previously', 'thereafter'
        ],
      };
    }
    return {
      add: [
        'também', 'tambem', 'além disso', 'alem disso', 'assim como',
        'bem como', 'ainda', 'do mesmo modo', 'de igual modo',
        'não só', 'nao so', 'não apenas', 'nao apenas', 'igualmente'
      ],
      contrast: [
        'porém', 'porem', 'entretanto', 'contudo', 'embora', 'por outro lado',
        'todavia', 'no entanto', 'ainda assim', 'mesmo assim', 'ao contrário',
        'em contraste', 'em contrapartida', 'não obstante', 'nao obstante'
      ],
      cause: [
        'porque', 'pois', 'uma vez que', 'visto que', 'já que', 'ja que',
        'devido a', 'em razão de', 'em razao de', 'por causa de',
        'portanto', 'assim', 'desse modo', 'por isso', 'consequentemente',
        'logo', 'dessa forma', 'de modo que'
      ],
      conclusion: [
        'portanto', 'assim', 'desse modo', 'em síntese', 'em sintese',
        'em conclusão', 'em conclusao', 'em suma', 'em resumo',
        'por fim', 'finalmente', 'conclui-se', 'conclui se'
      ],
      time: [
        'então', 'entao', 'depois', 'posteriormente', 'enquanto', 'antes',
        'primeiramente', 'primeiro', 'segundo', 'terceiro', 'em seguida',
        'na sequência', 'na sequencia', 'ao mesmo tempo', 'simultaneamente',
        'anteriormente', 'atualmente', 'de início', 'de inicio'
      ],
    };
  }

  function getContextualConnectorTerms() {
    return LANG === 'en'
      ? new Set(['as', 'since', 'still', 'then', 'after', 'before', 'first', 'second', 'third', 'later', 'finally'])
      : new Set(['assim', 'logo', 'enquanto', 'antes', 'depois', 'primeiro', 'segundo', 'terceiro', 'então', 'entao', 'pois']);
  }

  function isWordChar(ch) {
    return /[a-z0-9áéíóúàâêôãõüçñ]/i.test(ch);
  }

  function findConnectorMatches(text, term, contextualOnly, ambiguityMode) {
    var lower = text.toLowerCase();
    var target = term.toLowerCase();
    var out = [];
    var from = 0;

    while (from < lower.length) {
      var idx = lower.indexOf(target, from);
      if (idx === -1) break;
      var end = idx + target.length;

      var before = idx > 0 ? lower.charAt(idx - 1) : '';
      var after = end < lower.length ? lower.charAt(end) : '';
      var boundaryOk = (!before || !isWordChar(before)) && (!after || !isWordChar(after));

      var contextualOk = true;
      if (contextualOnly) {
        var mode = ambiguityMode || CONNECTOR_AMBIGUITY_MODE;
        if (mode === 'lenient') {
          contextualOk = true;
        } else if (mode === 'balanced') {
          var jb = idx - 1;
          while (jb >= 0 && /\s/.test(lower.charAt(jb))) jb--;
          contextualOk = jb < 0 || /[.!?;:\n,\(\[\-]/.test(lower.charAt(jb));
        } else {
          var j = idx - 1;
          while (j >= 0 && /\s/.test(lower.charAt(j))) j--;
          contextualOk = j < 0 || /[.!?;:\n]/.test(lower.charAt(j));
        }
      }

      if (boundaryOk && contextualOk) {
        out.push([idx, end]);
      }

      from = idx + 1;
    }

    return out;
  }

  function getConnectorTerms() {
    var cats = getConnectorCategories();
    var all = [];
    Object.keys(cats).forEach(function (k) { all = all.concat(cats[k]); });
    return Array.from(new Set(all));
  }

  function countConnectorCategories(text) {
    var categories = getConnectorCategories();
    var contextual = getContextualConnectorTerms();
    var result = { add: 0, contrast: 0, cause: 0, conclusion: 0, time: 0 };

    Object.keys(categories).forEach(function (cat) {
      categories[cat].forEach(function (term) {
        var mode = getConnectorAmbiguityMode(term);
        var matches = findConnectorMatches(text, term, contextual.has(term), mode);
        result[cat] += matches.length;
      });
    });

    return result;
  }

  function highlightConnectorInNode(node, term, cls, title, contextualOnly, ambiguityMode) {
    if (node.nodeType === Node.TEXT_NODE) {
      var text = node.textContent;
      var ranges = findConnectorMatches(text, term, contextualOnly, ambiguityMode);
      if (ranges.length === 0) return;

      var frag = document.createDocumentFragment();
      var pos = 0;
      ranges.forEach(function (rng) {
        if (rng[0] > pos) frag.appendChild(document.createTextNode(text.slice(pos, rng[0])));
        var span = document.createElement('span');
        span.className = cls;
        var catMatch = cls.match(/ws-connector-([a-z-]+)/);
        markReason(span, catMatch ? 'connectors-' + catMatch[1] : 'connectors', title);
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
      Array.from(node.childNodes).forEach(function (c) {
        highlightConnectorInNode(c, term, cls, title, contextualOnly, ambiguityMode);
      });
    }
  }

  function connectorCategoryLabel(cat) {
    if (cat === 'add') return L.connectorAdd;
    if (cat === 'contrast') return L.connectorContrast;
    if (cat === 'cause') return L.connectorCause;
    if (cat === 'conclusion') return L.connectorConclusion;
    if (cat === 'time') return L.connectorTime;
    return L.connectors;
  }

  function connectorAmbiguityLabel(mode) {
    if (mode === 'lenient') return L.ambiguityLenient;
    if (mode === 'balanced') return L.ambiguityBalanced;
    return L.ambiguityStrict;
  }

  function getConnectorAmbiguityMode(term) {
    var nk = normalizeWord(term);
    if (nk && CONNECTOR_AMBIGUITY_OVERRIDES[nk]) {
      return CONNECTOR_AMBIGUITY_OVERRIDES[nk];
    }
    return CONNECTOR_AMBIGUITY_MODE;
  }
