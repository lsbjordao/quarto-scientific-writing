// src/ui/wink-highlights.js — wink-nlp-backed highlight helpers.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

  function highlightWinkPassiveSentences(p) {
    if (!WINK_NLP || LANG !== 'en') return;
    var title = L.nlpWinkPassive;
    var marked = p.innerHTML.replace(
      /([.!?]+\s+)(?=[A-ZÁÉÍÓÚÀÂÊÔÃÕÜÇÑ"])/g,
      '$1\x00'
    );
    p.innerHTML = marked.split('\x00').map(function (part) {
      var plain = part.replace(/<[^>]+>/g, ' ').trim();
      return plain && isWinkPassiveSentence(plain)
        ? '<span class="ws-wink-passive" data-ws-focus="wink-passive" data-ws-reason="' + escapeHTML(title) + '" title="' + escapeHTML(title) + '">' + part + '</span>'
        : part;
    }).join('');
  }

  function highlightWinkComplexWords(p, nlpStats) {
    if (!nlpStats || !nlpStats.winkComplexWords || !nlpStats.winkComplexWords.length) return;
    highlightTermListInNode(p, nlpStats.winkComplexWords, 'ws-wink-complex', L.nlpWinkComplexWords);
  }

  function highlightWinkModalVerbs(p, nlpStats) {
    var terms = (nlpStats && nlpStats.winkModalTerms) || [];
    var list = terms
      .map(function (item) { return normalizeWord(item.text || item); })
      .filter(Boolean)
      .sort(function (a, b) { return b.length - a.length; });
    if (!list.length) return;
    var escaped = list.map(function (term) {
      return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    });
    highlightRegexInNode(p, new RegExp('\\b(?:' + escaped.join('|') + ')\\b', 'gi'), 'ws-wink-modal', L.nlpWinkModalVerbs);
  }

  function highlightWinkPronouns(p, nlpStats) {
    var terms = (nlpStats && nlpStats.winkPronounTerms) || [];
    var list = terms
      .map(function (item) { return normalizeWord(item.text || item); })
      .filter(Boolean)
      .sort(function (a, b) { return b.length - a.length; });
    if (!list.length) return;
    var escaped = list.map(function (term) {
      return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    });
    highlightRegexInNode(p, new RegExp('\\b(?:' + escaped.join('|') + ')\\b', 'gi'), 'ws-wink-pronoun', L.nlpWinkPronouns);
  }

  function highlightWinkAuxiliaries(p, nlpStats) {
    var terms = (nlpStats && nlpStats.winkAuxiliaryTerms) || [];
    var list = terms
      .map(function (item) { return normalizeWord(item.text || item); })
      .filter(Boolean)
      .sort(function (a, b) { return b.length - a.length; });
    if (!list.length) return;
    var escaped = list.map(function (term) {
      return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    });
    highlightRegexInNode(p, new RegExp('\\b(?:' + escaped.join('|') + ')\\b', 'gi'), 'ws-wink-auxiliary', L.nlpWinkAuxiliaries);
  }

  function highlightWinkNumericTokens(p, nlpStats) {
    var terms = (nlpStats && nlpStats.winkNumericTerms) || [];
    var list = terms
      .map(function (item) { return normalizeWord(item.text || item); })
      .filter(Boolean)
      .sort(function (a, b) { return b.length - a.length; });
    if (list.length) {
      var escaped = list.map(function (term) {
        return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      });
      highlightRegexInNode(p, new RegExp('\\b(?:' + escaped.join('|') + ')\\b', 'gi'), 'ws-wink-numeric', L.nlpWinkNumericDensity);
      return;
    }
    highlightRegexInNode(p, /\b\d+(?:[.,]\d+)?\b/g, 'ws-wink-numeric', L.nlpWinkNumericDensity);
  }

  function highlightWinkProperNouns(p, nlpStats) {
    var terms = (nlpStats && nlpStats.winkProperNounTerms) || [];
    var list = terms
      .map(function (item) { return normalizeWord(item.text || item); })
      .filter(Boolean)
      .sort(function (a, b) { return b.length - a.length; });
    if (!list.length) return;
    var escaped = list.map(function (term) {
      return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    });
    highlightRegexInNode(p, new RegExp('\\b(?:' + escaped.join('|') + ')\\b', 'gi'), 'ws-wink-propn', L.nlpWinkProperNouns);
  }
