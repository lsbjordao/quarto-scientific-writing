(function () {
  'use strict';

  var CFG = window.WritingStatsConfig || {};
  var PARA_LONG = Number(CFG.paragraphLong) || 150;
  var SENT_LONG = Number(CFG.sentenceLong) || 30;
  var READ_WPM  = 200;
  var PASSIVE_ALERT = Number(CFG.passiveThreshold) || 3;
  var METHODS_PASSIVE_ALERT = Number(CFG.methodsPassiveThreshold) || 5;
  var LEX_LOW = Number(CFG.lexicalDiversityLow) || 0.50;
  var REPEATED_STRONG = Number(CFG.repeatedStrong) || 3;

  function applyConfig() {
    CFG = window.WritingStatsConfig || CFG || {};
    PARA_LONG = Number(CFG.paragraphLong) || PARA_LONG;
    SENT_LONG = Number(CFG.sentenceLong) || SENT_LONG;
    PASSIVE_ALERT = Number(CFG.passiveThreshold) || PASSIVE_ALERT;
    METHODS_PASSIVE_ALERT = Number(CFG.methodsPassiveThreshold) || METHODS_PASSIVE_ALERT;
    LEX_LOW = Number(CFG.lexicalDiversityLow) || LEX_LOW;
    REPEATED_STRONG = Number(CFG.repeatedStrong) || REPEATED_STRONG;
  }

  // Quarto propagates YAML `lang` to <html lang="...">.
  // Keep the extension configuration-free by using that value at runtime.
  function getDocumentLang() {
    var raw = ((document.documentElement.getAttribute('lang') || 'pt') + '').toLowerCase();
    var base = raw.split('-')[0];
    return base === 'en' ? 'en' : 'pt';
  }

  var LANG = getDocumentLang();

  // ── Stop words ─────────────────────────────────────────────────────────────

  var STOP_PT = new Set([
    'para', 'como', 'mais', 'esse', 'essa', 'este', 'esta', 'estes', 'estas',
    'isso', 'aqui', 'também', 'tambem', 'sobre', 'após', 'apos', 'além', 'alem',
    'ainda', 'muito', 'pelo', 'pela', 'pelos', 'pelas', 'entre', 'todo', 'toda',
    'todos', 'todas', 'seus', 'suas', 'nosso', 'nossa', 'quando', 'qual', 'onde',
    'quem', 'cada', 'eram', 'foram', 'sera', 'será', 'sendo', 'tendo', 'serão',
    'cujo', 'cuja', 'cujos', 'cujas', 'disso', 'desse', 'dessa', 'neste', 'nesta',
    'numa', 'numas', 'outro', 'outra', 'outros', 'outras', 'mesmo', 'mesma',
    'pois', 'logo', 'porém', 'porem', 'contudo', 'entretanto', 'embora',
    'enquanto', 'portanto', 'assim', 'então', 'entao', 'jamais', 'nunca',
  ]);

  var STOP_EN = new Set([
    'the', 'and', 'for', 'with', 'that', 'this', 'these', 'those', 'from',
    'have', 'been', 'were', 'which', 'when', 'where', 'what', 'their', 'there',
    'they', 'into', 'some', 'also', 'than', 'then', 'them', 'such', 'after',
    'while', 'will', 'shall', 'would', 'could', 'should', 'must', 'does',
    'both', 'each', 'other', 'most', 'over', 'even', 'just', 'very', 'well',
    'here', 'only', 'more', 'about', 'under', 'between', 'among', 'within',
    'through', 'during', 'before', 'being', 'having', 'making', 'using',
  ]);

  var STOP_WORDS = LANG === 'en' ? STOP_EN : STOP_PT;

  // ── Passive voice patterns ─────────────────────────────────────────────────

  var PT_WORD = '[a-záéíóúàâêôãõüç]+';

  // PT: ser/estar auxiliary + optional adverb + regular or common irregular
  //     past participle, OR reflexive passive verb-se.
  var PASSIVE_PT = [
    new RegExp(
      '(?<![a-záéíóúàâêôãõüç])(?:é|são|foi|foram|era|eram|será|serão|seja|sejam|seria|seriam|' +
      'está|estão|esteve|estiveram|estava|estavam)\\s+' +
      '(?:' + PT_WORD + '\\s+){0,2}' +
      '(?:' + PT_WORD + '(?:ado|ada|ados|adas|ido|ida|idos|idas)|' +
      '(?:aberto|aberta|abertos|abertas|coberto|coberta|cobertos|cobertas|' +
      'dito|dita|ditos|ditas|escrito|escrita|escritos|escritas|' +
      'feito|feita|feitos|feitas|posto|posta|postos|postas|' +
      'visto|vista|vistos|vistas|seco|seca|secos|secas))\\b',
      'gi'
    ),
    /(?<![a-záéíóúàâêôãõüç])[a-záéíóúàâêôãõüç]{3,}(?:ou|iu|eu|aram|eram|iram|am|em)\s*-\s*se\b/gi,
  ];

  // EN: to-be auxiliary + optional adverb + past participle (-ed/-en),
  //     including perfect passive and a small set of common irregulars.
  var PASSIVE_EN = [
    /\b(?:is|are|was|were|be|being|been)\s+(?:(?:often|widely|visibly|strongly|significantly|usually|commonly|fully|partly|partially|previously|recently|carefully|rapidly|slowly)\s+){0,2}(?:[a-z]{3,}(?:ed|en)|built|done|found|given|grown|kept|known|made|seen|shown|taken|used)\b/gi,
    /\b(?:has|have|had)\s+been\s+(?:[a-z]+ly\s+){0,2}(?:[a-z]{3,}(?:ed|en)|built|done|found|given|grown|kept|known|made|seen|shown|taken|used)\b/gi,
  ];

  var PASSIVE_PATTERNS = LANG === 'en' ? PASSIVE_EN : PASSIVE_PT;

  // ── UI labels ──────────────────────────────────────────────────────────────

  var L = {
    pt: {
      wSuffix: 'p', sent: 'frase', sentP: 'frases',
      diversity: '🔵 diversidade', longSent: '🟡 frase longa',
      passive: 'voz passiva', repeated: 'repetidas:', cross: 'recorrente na seção:',
      readTime: 'min de leitura', words: 'palavras', parag: 'parágrafo', paragP: 'parágrafos',
      alert: 'alerta', alertP: 'alertas', observation: 'observação', observationP: 'observações',
      hideBtn: 'ocultar anotações', showBtn: 'mostrar anotações',
      alertsOnlyBtn: 'só alertas', allNotesBtn: 'todas as notas',
      compactBtn: 'compacto', fullBtn: 'completo', exportBtn: 'exportar relatório',
      rhythmTitle: 'ritmo das frases (comprimento relativo de cada frase)',
      toggleTitle: 'Alternar anotações de escrita',
      alertsOnlyTitle: 'Mostrar somente parágrafos com alertas',
      compactTitle: 'Alternar painel geral compacto',
      exportTitle: 'Exportar relatório Markdown das métricas',
      avgSentence: 'frase média', sentenceVar: 'var. frases',
      avgParagraph: 'parágrafo médio', longestSentence: 'maior frase',
      docDiversity: 'diversidade', passiveTotal: 'passivas',
      passiveDensity: 'dens. passiva', longSentenceRate: 'frases longas',
      topRepeated: 'repetições globais', connectors: 'conectores', nominalization: 'nominalizações',
      noVerb: 'sem verbo claro', sectionMap: 'mapa de seções',
      rhythm: 'ritmo por seção', denseSections: 'seções densas',
      passiveExpected: 'passiva concentrada onde é esperada',
      passiveSpread: 'passiva espalhada fora de métodos',
      noDenseSections: 'sem seção muito densa',
      reportTitle: 'Relatório de escrita', alertReasons: 'motivos do alerta',
      reasonParaLong: 'parágrafo longo', reasonSentLong: 'frase longa',
      reasonLexLow: 'diversidade lexical baixa', reasonRepeat: 'repetição forte',
      reasonPassive: 'muita voz passiva',
    },
    en: {
      wSuffix: 'w', sent: 'sentence', sentP: 'sentences',
      diversity: '🔵 diversity', longSent: '🟡 long sentence',
      passive: 'passive voice', repeated: 'repeated:', cross: 'recurrent in section:',
      readTime: 'min read', words: 'words', parag: 'paragraph', paragP: 'paragraphs',
      alert: 'alert', alertP: 'alerts', observation: 'observation', observationP: 'observations',
      hideBtn: 'hide notes', showBtn: 'show notes',
      alertsOnlyBtn: 'alerts only', allNotesBtn: 'all notes',
      compactBtn: 'compact', fullBtn: 'full', exportBtn: 'export report',
      rhythmTitle: 'sentence rhythm (relative length per sentence)',
      toggleTitle: 'Toggle writing annotations',
      alertsOnlyTitle: 'Show only paragraphs with alerts',
      compactTitle: 'Toggle compact document panel',
      exportTitle: 'Export a Markdown report with writing metrics',
      avgSentence: 'avg sentence', sentenceVar: 'sentence var.',
      avgParagraph: 'avg paragraph', longestSentence: 'longest sentence',
      docDiversity: 'diversity', passiveTotal: 'passives',
      passiveDensity: 'passive dens.', longSentenceRate: 'long sentences',
      topRepeated: 'global repeats', connectors: 'connectors', nominalization: 'nominalizations',
      noVerb: 'no clear verb', sectionMap: 'section map',
      rhythm: 'rhythm by section', denseSections: 'dense sections',
      passiveExpected: 'passive voice concentrated where expected',
      passiveSpread: 'passive voice spread beyond methods',
      noDenseSections: 'no very dense section',
      reportTitle: 'Writing report', alertReasons: 'alert reasons',
      reasonParaLong: 'long paragraph', reasonSentLong: 'long sentence',
      reasonLexLow: 'low lexical diversity', reasonRepeat: 'strong repetition',
      reasonPassive: 'high passive voice',
    },
  }[LANG];

  // ── Text analysis ──────────────────────────────────────────────────────────

  function countWords(text) {
    return (text.match(/\S+/g) || []).length;
  }

  function getSentences(text) {
    return text
      .split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÀÂÊÔÃÕÜÇÑ"'])/)
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 0; });
  }

  function getLexDiv(text) {
    var RE = LANG === 'en' ? /\b[a-z]{3,}\b/gi : /\b[a-záéíóúàâêôãõüçñ]{3,}\b/gi;
    var tokens = (text.match(RE) || [])
      .map(function (w) { return w.toLowerCase(); })
      .filter(function (w) { return !STOP_WORDS.has(w); });
    if (tokens.length === 0) return 1;
    return (new Set(tokens)).size / tokens.length;
  }

  function getIntraRepeated(text) {
    var RE = LANG === 'en' ? /\b[a-z]{4,}\b/gi : /\b[a-záéíóúàâêôãõüç]{4,}\b/gi;
    var freq = {};
    (text.match(RE) || []).forEach(function (w) {
      var lower = w.toLowerCase();
      if (!STOP_WORDS.has(lower)) freq[lower] = (freq[lower] || 0) + 1;
    });
    var result = {};
    Object.keys(freq)
      .filter(function (k) { return freq[k] > 1; })
      .sort(function (a, b) { return freq[b] - freq[a]; })
      .forEach(function (k) { result[k] = freq[k]; });
    return result;
  }

  function getGlobalFrequent(text, limit) {
    var RE = LANG === 'en' ? /\b[a-z]{4,}\b/gi : /\b[a-záéíóúàâêôãõüç]{4,}\b/gi;
    var freq = {};
    (text.match(RE) || []).forEach(function (w) {
      var lower = w.toLowerCase();
      if (!STOP_WORDS.has(lower)) freq[lower] = (freq[lower] || 0) + 1;
    });
    return Object.keys(freq)
      .filter(function (k) { return freq[k] > 2; })
      .sort(function (a, b) { return freq[b] - freq[a]; })
      .slice(0, limit)
      .map(function (k) { return k + ' ×' + freq[k]; });
  }

  function getConnectorTerms() {
    return LANG === 'en'
      ? ['however', 'therefore', 'moreover', 'furthermore', 'although', 'whereas', 'thus', 'consequently', 'nevertheless', 'in addition']
      : ['porém', 'porem', 'portanto', 'entretanto', 'contudo', 'embora', 'assim', 'além disso', 'alem disso', 'desse modo', 'por outro lado'];
  }

  function countConnectors(text) {
    var connectors = getConnectorTerms();
    var lower = text.toLowerCase();
    return connectors.reduce(function (total, c) {
      var re = new RegExp('\\b' + c.replace(/\s+/g, '\\s+') + '\\b', 'g');
      var matches = lower.match(re);
      return total + (matches ? matches.length : 0);
    }, 0);
  }

  function countNominalizations(text) {
    var re = LANG === 'en'
      ? /\b[a-z]{5,}(?:tion|ment|ity|ness|ance|ence)\b/gi
      : /\b[a-záéíóúàâêôãõüç]{5,}(?:ção|ções|são|sões|mento|mentos|dade|dades|ância|ência)\b/gi;
    return (text.match(re) || []).length;
  }

  function countNoVerbSentences(sentences) {
    var re = LANG === 'en'
      ? /\b(?:is|are|was|were|be|been|being|has|have|had|do|does|did|can|could|may|might|must|should|would|will|shall|[a-z]{3,}(?:ed|ing|es|s))\b/i
      : /\b(?:é|são|foi|foram|era|eram|ser|estar|está|estão|teve|tiveram|tem|têm|pode|podem|deve|devem|[a-záéíóúàâêôãõüç]{3,}(?:ar|er|ir|ou|eu|iu|am|em|aram|eram|iram))\b/i;
    return sentences.filter(function (s) {
      return countWords(s) >= 6 && !re.test(s);
    }).length;
  }

  function getCrossRepeated(paraTexts) {
    var seenInParas = {};
    paraTexts.forEach(function (text) {
      Object.keys(getIntraRepeated(text)).forEach(function (w) {
        seenInParas[w] = (seenInParas[w] || 0) + 1;
      });
    });
    return new Set(Object.keys(seenInParas).filter(function (w) { return seenInParas[w] >= 2; }));
  }

  function countPassive(text) {
    return PASSIVE_PATTERNS.reduce(function (total, re) {
      var matches = text.match(new RegExp(re.source, 'gi'));
      return total + (matches ? matches.length : 0);
    }, 0);
  }

  function sparkline(sentences) {
    var BLOCKS = '▁▂▃▄▅▆▇█';
    if (sentences.length === 0) return '';
    var lengths = sentences.map(countWords);
    var max = Math.max.apply(null, lengths);
    if (max === 0) return '';
    return lengths.map(function (n) {
      return BLOCKS[Math.min(7, Math.round((n / max) * 7))];
    }).join('');
  }

  function mean(nums) {
    if (nums.length === 0) return 0;
    return nums.reduce(function (sum, n) { return sum + n; }, 0) / nums.length;
  }

  function variance(nums) {
    if (nums.length === 0) return 0;
    var avg = mean(nums);
    return mean(nums.map(function (n) { return Math.pow(n - avg, 2); }));
  }

  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function isMethodsTitle(title) {
    var t = title.toLowerCase();
    return LANG === 'en'
      ? /\b(method|methods|materials)\b/.test(t)
      : /\b(m[eé]todo|m[eé]todos|material|materiais)\b/.test(t);
  }

  function maxRepeatedCount(repeated) {
    var counts = Object.keys(repeated).map(function (k) { return repeated[k]; });
    return counts.length ? Math.max.apply(null, counts) : 0;
  }

  function getAlertReasons(stats, inMethods) {
    var reasons = [];
    if (stats.paraLong) reasons.push(L.reasonParaLong);
    if (stats.maxSentLen > SENT_LONG) reasons.push(L.reasonSentLong + ': ' + stats.maxSentLen + L.wSuffix);
    if (stats.lexDiv < LEX_LOW) reasons.push(L.reasonLexLow + ': ' + Math.round(stats.lexDiv * 100) + '%');
    if (maxRepeatedCount(stats.repeated) >= REPEATED_STRONG) reasons.push(L.reasonRepeat + ': ×' + maxRepeatedCount(stats.repeated));
    if (stats.passiveCount >= (inMethods ? METHODS_PASSIVE_ALERT : PASSIVE_ALERT)) {
      reasons.push(L.reasonPassive + ': ' + stats.passiveCount);
    }
    return reasons;
  }

  function hasParagraphAlert(stats, inMethods) {
    return getAlertReasons(stats, inMethods).length > 0;
  }

  function scaledBlocks(values, titles) {
    var BLOCKS = '▁▂▃▄▅▆▇█';
    if (values.length === 0) return '';
    var max = Math.max.apply(null, values);
    if (max === 0) return '';
    return values.map(function (n, i) {
      var block = BLOCKS[Math.min(7, Math.round((n / max) * 7))];
      var title = titles && titles[i] ? String(titles[i]).trim() : '';
      return title
        ? '<span class="ws-doc-rhythm-block" title="' + escapeHTML(title) + '">' + block + '</span>'
        : block;
    }).join('');
  }

  // ── DOM manipulation ───────────────────────────────────────────────────────

  function wrapLongSentences(p, threshold) {
    var marked = p.innerHTML.replace(
      /([.!?]+\s+)(?=[A-ZÁÉÍÓÚÀÂÊÔÃÕÜÇÑ"])/g,
      '$1\x00'
    );
    p.innerHTML = marked.split('\x00').map(function (part) {
      return countWords(part.replace(/<[^>]+>/g, ' ')) > threshold
        ? '<span class="ws-long-sentence">' + part + '</span>'
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

  function highlightPatternInNode(node, patterns, cls) {
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

      var frag = document.createDocumentFragment();
      var pos = 0;
      merged.forEach(function (rng) {
        if (rng[0] > pos) frag.appendChild(document.createTextNode(text.slice(pos, rng[0])));
        var span = document.createElement('span');
        span.className = cls;
        if (cls === 'ws-passive') span.title = L.passive;
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
      Array.from(node.childNodes).forEach(function (c) { highlightPatternInNode(c, patterns, cls); });
    }
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
        span.title = title;
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

  function highlightNominalizations(p) {
    var re = LANG === 'en'
      ? /\b[a-z]{5,}(?:tion|ment|ity|ness|ance|ence)\b/gi
      : /\b[a-záéíóúàâêôãõüç]{5,}(?:ção|ções|são|sões|mento|mentos|dade|dades|ância|ência)\b/gi;
    highlightRegexInNode(p, re, 'ws-nominalization', L.nominalization);
  }

  function highlightConnectors(p) {
    getConnectorTerms().forEach(function (term) {
      var re = new RegExp('\\b' + term.replace(/\s+/g, '\\s+') + '\\b', 'gi');
      highlightRegexInNode(p, re, 'ws-connector', L.connectors);
    });
  }

  // ── UI helpers ─────────────────────────────────────────────────────────────

  function sep() {
    var d = document.createElement('div');
    d.className = 'ws-sep';
    return d;
  }

  function addHoverHighlight(item, note, selector, activeClass) {
    item.addEventListener('mouseenter', function () {
      var para = note.parentNode && note.parentNode.querySelector('p');
      if (!para) return;
      para.querySelectorAll(selector).forEach(function (s) { s.classList.add(activeClass); });
    });
    item.addEventListener('mouseleave', function () {
      var para = note.parentNode && note.parentNode.querySelector('p');
      if (!para) return;
      para.querySelectorAll('.' + activeClass).forEach(function (s) { s.classList.remove(activeClass); });
    });
  }

  // ── Margin note ────────────────────────────────────────────────────────────

  function buildNote(stats) {
    var note = document.createElement('aside');
    note.className = 'ws-note' + (stats.alert ? ' ws-note-alert' : '');
    if (stats.alertReasons && stats.alertReasons.length) {
      note.title = L.alertReasons + ': ' + stats.alertReasons.join('; ');
    }

    // Header: word count · sentence count
    var nSent = stats.sentences.length;
    var hdr = document.createElement('div');
    hdr.className = 'ws-count' + (stats.paraLong ? ' ws-count-red' : '');
    hdr.textContent =
      (stats.alert ? '🔴 ' : '') +
      stats.wordCount + L.wSuffix + ' · ' +
      nSent + ' ' + (nSent === 1 ? L.sent : L.sentP);
    if (stats.alertReasons && stats.alertReasons.length) hdr.title = note.title;
    note.appendChild(hdr);

    // Sparkline of sentence rhythm
    if (nSent > 1) {
      var sl = document.createElement('div');
      sl.className = 'ws-sparkline';
      sl.title = L.rhythmTitle;
      sl.textContent = sparkline(stats.sentences);
      note.appendChild(sl);
    }

    // Lexical diversity
    var ldPct = Math.round(stats.lexDiv * 100);
    var ldMod = stats.lexDiv >= 0.70 ? 'ws-ld-high' : stats.lexDiv >= 0.50 ? 'ws-ld-mid' : 'ws-ld-low';
    var ldEl = document.createElement('div');
    ldEl.className = 'ws-ld ' + ldMod;
    ldEl.textContent = L.diversity + ': ' + ldPct + '%';
    note.appendChild(ldEl);

    // Long sentence alert
    if (stats.maxSentLen > SENT_LONG) {
      var sentEl = document.createElement('div');
      sentEl.className = 'ws-sent-alert';
      sentEl.textContent = L.longSent + ': ' + stats.maxSentLen + L.wSuffix;
      note.appendChild(sentEl);
    }

    // Passive voice (with hover-to-highlight)
    if (stats.passiveCount > 0) {
      var passEl = document.createElement('div');
      passEl.className = 'ws-passive-count';
      passEl.textContent = L.passive + ': ' + stats.passiveCount;
      addHoverHighlight(passEl, note, '.ws-passive', 'ws-passive-active');
      note.appendChild(passEl);
    }

    // Intra-paragraph repeated words (with hover-to-highlight)
    var entries = Object.entries(stats.repeated);
    if (entries.length > 0) {
      note.appendChild(sep());
      var repLbl = document.createElement('div');
      repLbl.className = 'ws-rep-label';
      repLbl.textContent = L.repeated;
      note.appendChild(repLbl);

      entries.forEach(function (kv) {
        var word = kv[0];
        var item = document.createElement('div');
        item.className = 'ws-rep-item';
        item.dataset.word = word;
        item.textContent = word + ' \xd7' + kv[1];
        addHoverHighlight(item, note, '.ws-repeated[data-word="' + word + '"]', 'ws-active');
        note.appendChild(item);
      });
    }

    // Cross-section words
    if (stats.crossInPara && stats.crossInPara.length > 0) {
      note.appendChild(sep());
      var crossLbl = document.createElement('div');
      crossLbl.className = 'ws-cross-label';
      crossLbl.textContent = L.cross;
      note.appendChild(crossLbl);
      var crossEl = document.createElement('div');
      crossEl.className = 'ws-cross-words';
      crossEl.textContent = stats.crossInPara.join(', ');
      note.appendChild(crossEl);
    }

    return note;
  }

  // ── Section stats bar ──────────────────────────────────────────────────────

  function buildSectionStats(section, statsList, totalWords) {
    if (statsList.length === 0) return;
    var h = section.querySelector('h2, h3');
    if (!h) return;

    var nP = statsList.length;
    var nAlerts = statsList.filter(function (s) { return s.alert; }).length;
    var nObs = statsList.filter(function (s) {
      return !s.alert && (s.passiveCount > 0 || Object.keys(s.repeated).length > 0 || (s.crossInPara && s.crossInPara.length > 0));
    }).length;

    var bar = document.createElement('div');
    bar.className = 'ws-section-stats';
    var parts = [
      totalWords + ' ' + L.words,
      nP + ' ' + (nP === 1 ? L.parag : L.paragP),
    ];
    if (nAlerts > 0) {
      parts.push('<span class="ws-stat-alert">' +
        nAlerts + ' ' + (nAlerts === 1 ? L.alert : L.alertP) + '</span>');
    }
    if (nObs > 0) {
      parts.push('<span class="ws-stat-observation">' +
        nObs + ' ' + (nObs === 1 ? L.observation : L.observationP) + '</span>');
    }
    bar.innerHTML = parts.join(' <span class="ws-stat-dot">\xb7</span> ');
    h.after(bar);
  }

  // ── Document reading-time badge ────────────────────────────────────────────

  function metricItem(label, value, focus, title) {
    return '<div class="ws-doc-metric"' +
      (focus ? ' data-ws-focus="' + focus + '"' : '') +
      (title ? ' title="' + escapeHTML(title) + '"' : '') + '>' +
      '<span class="ws-doc-metric-label">' + label + '</span>' +
      '<span class="ws-doc-metric-value">' + value + '</span>' +
      '</div>';
  }

  function sectionSummary(title, statsList, totalWords) {
    var sentLens = [];
    var passive = 0;
    var longSentences = 0;
    statsList.forEach(function (stats) {
      passive += stats.passiveCount;
      stats.sentences.forEach(function (sent) {
        var n = countWords(sent);
        if (n > 0) {
          sentLens.push(n);
          if (n > SENT_LONG) longSentences++;
        }
      });
    });
    return {
      title: title,
      words: totalWords,
      paras: statsList.length,
      sentences: sentLens.length,
      passive: passive,
      longSentences: longSentences,
      avgSentence: mean(sentLens),
      avgParagraph: mean(statsList.map(function (stats) { return stats.wordCount; })),
      isMethods: isMethodsTitle(title),
    };
  }

  function buildDiagnostics(sections, passiveTotal, longSentenceRate) {
    if (sections.length === 0) return '';

    var rhythm = scaledBlocks(
      sections.map(function (s) { return s.avgSentence; }),
      sections.map(function (s) { return s.title; })
    );
    var methodPassive = sections
      .filter(function (s) { return s.isMethods; })
      .reduce(function (sum, s) { return sum + s.passive; }, 0);
    var passiveRatio = passiveTotal > 0 ? methodPassive / passiveTotal : 0;

    var dense = sections.map(function (s) {
      var passiveDensity = s.words ? (s.passive / s.words) * 1000 : 0;
      var longRate = s.sentences ? s.longSentences / s.sentences : 0;
      return {
        title: s.title,
        score: s.avgSentence + (s.avgParagraph / 10) + (longRate * 18) + (passiveDensity / 2),
      };
    }).sort(function (a, b) { return b.score - a.score; }).slice(0, 2);

    var passiveNote = passiveRatio >= 0.45 ? L.passiveExpected : L.passiveSpread;
    var denseText = dense.length
      ? dense.map(function (s) { return escapeHTML(s.title); }).join(', ')
      : L.noDenseSections;

    return '<div class="ws-doc-diagnostics">' +
      '<div><span>' + L.rhythm + '</span><strong class="ws-doc-rhythm">' + rhythm + '</strong></div>' +
      '<div><span>' + L.denseSections + '</span><strong>' + denseText + '</strong></div>' +
      '<div><span>' + L.longSentenceRate + '</span><strong>' + round1(longSentenceRate) + '%</strong></div>' +
      '<div><span>' + L.passive + '</span><strong>' + passiveNote + '</strong></div>' +
      '</div>';
  }

  function wireMetricFocus(metrics) {
    metrics.querySelectorAll('[data-ws-focus]').forEach(function (item) {
      item.addEventListener('click', function () {
        var focus = item.dataset.wsFocus;
        var cls = 'ws-focus-' + focus;
        var active = document.body.classList.contains(cls);
        ['ws-focus-passive', 'ws-focus-long', 'ws-focus-repeated', 'ws-focus-nominal', 'ws-focus-connectors'].forEach(function (c) {
          document.body.classList.remove(c);
        });
        metrics.querySelectorAll('.ws-doc-metric-active').forEach(function (m) {
          m.classList.remove('ws-doc-metric-active');
        });
        if (!active) {
          document.body.classList.add(cls);
          item.classList.add('ws-doc-metric-active');
        }
      });
    });
  }

  function buildMarkdownReport() {
    var r = window.WritingStatsReport;
    if (!r) return '';
    var lines = [
      '# ' + L.reportTitle,
      '',
      '- ' + L.words + ': ' + r.words,
      '- ' + L.readTime + ': ~' + r.readMinutes,
      '- ' + L.avgSentence + ': ' + r.avgSentence + L.wSuffix,
      '- ' + L.sentenceVar + ': ' + r.sentenceVariance + ' / σ ' + r.sentenceStdDev + L.wSuffix,
      '- ' + L.avgParagraph + ': ' + r.avgParagraph + L.wSuffix,
      '- ' + L.longestSentence + ': ' + r.longestSentence + L.wSuffix,
      '- ' + L.docDiversity + ': ' + r.lexicalDiversity + '%',
      '- ' + L.passiveTotal + ': ' + r.passiveTotal,
      '- ' + L.passiveDensity + ': ' + r.passiveDensity + '/1000' + L.wSuffix,
      '- ' + L.longSentenceRate + ': ' + r.longSentenceRate + '%',
      '- ' + L.topRepeated + ': ' + (r.topRepeated.length ? r.topRepeated.join(', ') : '0'),
      '- ' + L.connectors + ': ' + r.connectors,
      '- ' + L.nominalization + ': ' + r.nominalizations,
      '- ' + L.noVerb + ': ' + r.noClearVerb,
      '',
      '## ' + L.sectionMap,
      '',
    ];
    r.sections.forEach(function (s) {
      lines.push('- ' + s.title + ': ' + s.words + ' ' + L.words + ', ' +
        round1(s.avgSentence) + L.wSuffix + '/' + L.sent + ', ' +
        s.passive + ' ' + L.passive);
    });
    return lines.join('\n');
  }

  function exportMarkdownReport() {
    var blob = new Blob([buildMarkdownReport()], { type: 'text/markdown;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = LANG === 'en' ? 'writing-report.md' : 'relatorio-escrita.md';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function buildDocStats(root, totalWords, statsList, sections, docText) {
    if (totalWords === 0) return;
    var minutes = Math.max(1, Math.round(totalWords / READ_WPM));

    var sentenceLengths = [];
    statsList.forEach(function (stats) {
      stats.sentences.forEach(function (sent) {
        var n = countWords(sent);
        if (n > 0) sentenceLengths.push(n);
      });
    });

    var paraLengths = statsList.map(function (stats) { return stats.wordCount; });
    var maxSentLen = sentenceLengths.length ? Math.max.apply(null, sentenceLengths) : 0;
    var passiveTotal = statsList.reduce(function (sum, stats) { return sum + stats.passiveCount; }, 0);
    var sentVar = variance(sentenceLengths);
    var sentStd = Math.sqrt(sentVar);
    var lexDiv = Math.round(getLexDiv(docText) * 100);
    var passiveDensity = totalWords ? (passiveTotal / totalWords) * 1000 : 0;
    var longSentenceCount = sentenceLengths.filter(function (n) { return n > SENT_LONG; }).length;
    var longSentenceRate = sentenceLengths.length ? (longSentenceCount / sentenceLengths.length) * 100 : 0;
    var topRepeated = getGlobalFrequent(docText, 5);
    var connectorCount = countConnectors(docText);
    var nominalizationCount = countNominalizations(docText);
    var noVerbCount = countNoVerbSentences(statsList.reduce(function (all, stats) {
      return all.concat(stats.sentences);
    }, []));

    window.WritingStatsReport = {
      words: totalWords,
      readMinutes: minutes,
      avgSentence: round1(mean(sentenceLengths)),
      sentenceVariance: round1(sentVar),
      sentenceStdDev: round1(sentStd),
      avgParagraph: round1(mean(paraLengths)),
      longestSentence: maxSentLen,
      lexicalDiversity: lexDiv,
      passiveTotal: passiveTotal,
      passiveDensity: round1(passiveDensity),
      longSentenceRate: round1(longSentenceRate),
      topRepeated: topRepeated,
      connectors: connectorCount,
      nominalizations: nominalizationCount,
      noClearVerb: noVerbCount,
      sections: sections,
    };

    var badge = document.createElement('div');
    badge.className = 'ws-doc-stats';
    badge.innerHTML =
      '<span class="ws-doc-time">~' + minutes + ' ' + L.readTime + '</span>' +
      '<span class="ws-doc-dot">\xb7</span>' +
      '<span>' + totalWords + ' ' + L.words + '</span>';

    var metrics = document.createElement('div');
    metrics.className = 'ws-doc-metrics';
    metrics.innerHTML =
      metricItem(L.avgSentence, round1(mean(sentenceLengths)) + L.wSuffix) +
      metricItem(L.sentenceVar, round1(sentVar) + ' / σ ' + round1(sentStd) + L.wSuffix) +
      metricItem(L.avgParagraph, round1(mean(paraLengths)) + L.wSuffix) +
      metricItem(L.longestSentence, maxSentLen + L.wSuffix, 'long', L.longSent) +
      metricItem(L.docDiversity, lexDiv + '%') +
      metricItem(L.passiveTotal, passiveTotal, 'passive', L.passive) +
      metricItem(L.passiveDensity, round1(passiveDensity) + '/1000' + L.wSuffix, 'passive', L.passive) +
      metricItem(L.longSentenceRate, round1(longSentenceRate) + '%', 'long', L.longSent) +
      metricItem(L.topRepeated, topRepeated.length ? topRepeated.join(', ') : '0', 'repeated', L.repeated) +
      metricItem(L.connectors, connectorCount, 'connectors', L.connectors) +
      metricItem(L.nominalization, nominalizationCount, 'nominal', L.nominalization) +
      metricItem(L.noVerb, noVerbCount, null, L.noVerb) +
      buildDiagnostics(sections, passiveTotal, longSentenceRate);

    var anchor = document.getElementById('title-block-header') || root.querySelector('section');
    if (anchor) {
      anchor.after(badge);
      badge.after(metrics);
      wireMetricFocus(metrics);
    }
  }

  // ── Focus mode ─────────────────────────────────────────────────────────────

  function addFocusMode(allWrappers) {
    allWrappers.forEach(function (w) {
      w.addEventListener('mouseenter', function () {
        allWrappers.forEach(function (other) {
          if (other !== w) other.classList.add('ws-dimmed');
        });
      });
      w.addEventListener('mouseleave', function () {
        allWrappers.forEach(function (other) { other.classList.remove('ws-dimmed'); });
      });
    });
  }

  // ── Controls ───────────────────────────────────────────────────────────────

  function makeControlButton(label, title) {
    var btn = document.createElement('button');
    btn.className = 'ws-control-btn';
    btn.setAttribute('title', title);
    btn.textContent = label;
    return btn;
  }

  function buildControls() {
    var visible = true;
    var alertsOnly = !!CFG.defaultAlertsOnly;

    var box = document.createElement('div');
    box.className = 'ws-controls';

    var btn = makeControlButton(L.hideBtn, L.toggleTitle);
    var alertBtn = makeControlButton(alertsOnly ? L.allNotesBtn : L.alertsOnlyBtn, L.alertsOnlyTitle);
    var exportBtn = makeControlButton(L.exportBtn, L.exportTitle);

    btn.addEventListener('click', function () {
      visible = !visible;
      document.body.classList.toggle('ws-annotations-hidden', !visible);
      btn.textContent = visible ? L.hideBtn : L.showBtn;
      btn.classList.toggle('ws-control-off', !visible);
    });

    alertBtn.addEventListener('click', function () {
      alertsOnly = !alertsOnly;
      document.body.classList.toggle('ws-alerts-only', alertsOnly);
      alertBtn.textContent = alertsOnly ? L.allNotesBtn : L.alertsOnlyBtn;
      alertBtn.classList.toggle('ws-control-on', alertsOnly);
    });

    exportBtn.addEventListener('click', exportMarkdownReport);

    box.appendChild(btn);
    box.appendChild(alertBtn);
    box.appendChild(exportBtn);
    document.body.appendChild(box);

    document.body.classList.toggle('ws-alerts-only', alertsOnly);
    alertBtn.classList.toggle('ws-control-on', alertsOnly);
  }

  // ── Main ───────────────────────────────────────────────────────────────────

  function run() {
    applyConfig();

    var root =
      document.getElementById('quarto-document-content') ||
      document.querySelector('main') ||
      document.body;

    var totalDocWords = 0;
    var allWrappers   = [];
    var allStats      = [];
    var allTexts      = [];
    var allSections   = [];

    root.querySelectorAll('section.level2').forEach(function (section) {
      var paras = Array.from(section.querySelectorAll(':scope > p'));
      if (paras.length === 0) return;
      var heading = section.querySelector('h2, h3');
      var sectionTitle = heading ? heading.textContent.replace(/\s*#?$/, '').trim() : '';
      var inMethods = isMethodsTitle(sectionTitle);

      var paraTexts  = paras.map(function (p) { return p.innerText || p.textContent || ''; });
      var crossWords = getCrossRepeated(paraTexts);

      var statsList    = [];
      var sectionWords = 0;

      paras.forEach(function (p) {
        var text = p.innerText || p.textContent || '';
        var wordCount = countWords(text);
        if (wordCount < 8) return;

        var sentences    = getSentences(text);
        var maxSentLen   = sentences.reduce(function (mx, s) { return Math.max(mx, countWords(s)); }, 0);
        var lexDiv       = getLexDiv(text);
        var repeated     = getIntraRepeated(text);
        var repeatedSet  = new Set(Object.keys(repeated));
        var passiveCount = countPassive(text);
        var paraLong     = wordCount > PARA_LONG;

        var crossInPara = Array.from(crossWords)
          .filter(function (w) {
            return !repeatedSet.has(w) && new RegExp('\\b' + w + '\\b', 'i').test(text);
          })
          .sort();

        sectionWords += wordCount;

        // Order matters: long sentences → passive → repeated words
        if (maxSentLen > SENT_LONG) wrapLongSentences(p, SENT_LONG);
        if (passiveCount > 0)       highlightPatternInNode(p, PASSIVE_PATTERNS, 'ws-passive');
        highlightConnectors(p);
        highlightNominalizations(p);
        if (repeatedSet.size > 0)   highlightInNode(p, repeatedSet, 'ws-repeated');

        var stats = {
          wordCount: wordCount, sentences: sentences, maxSentLen: maxSentLen,
          lexDiv: lexDiv, repeated: repeated, passiveCount: passiveCount,
          paraLong: paraLong, crossInPara: crossInPara,
        };
        stats.alert = hasParagraphAlert(stats, inMethods);

        var note    = buildNote(stats);
        var wrapper = document.createElement('div');
        wrapper.className = 'ws-wrapper' + (paraLong ? ' ws-para-long' : '') + (stats.alert ? ' ws-has-alert' : '');
        p.parentNode.insertBefore(wrapper, p);
        wrapper.appendChild(p);
        wrapper.appendChild(note);

        allWrappers.push(wrapper);
        allStats.push(stats);
        allTexts.push(text);
        statsList.push(stats);
      });

      totalDocWords += sectionWords;
      allSections.push(sectionSummary(sectionTitle, statsList, sectionWords));
      buildSectionStats(section, statsList, sectionWords);
    });

    buildDocStats(root, totalDocWords, allStats, allSections, allTexts.join('\n\n'));
    addFocusMode(allWrappers);
    buildControls();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
