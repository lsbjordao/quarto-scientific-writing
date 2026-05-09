// src/detect/passive.js — Connector totals, nominalization, verb presence and passive voice counters.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

  function countConnectors(text) {
    var byCat = countConnectorCategories(text);
    return Object.keys(byCat).reduce(function (sum, k) { return sum + byCat[k]; }, 0);
  }

  function countNominalizations(text) {
    var re = LANG === 'en'
      ? /\b[a-z]{5,}(?:tion|ment|ity|ness|ance|ence)\b/gi
      : /\b[a-záéíóúàâêôãõüç]{5,}(?:ção|ções|são|sões|mento|mentos|dade|dades|ância|ência)\b/gi;
    return (text.match(re) || []).filter(function (w) { return !shouldIgnoreWord(w); }).length;
  }

  function getVerbRegex() {
    return LANG === 'en'
      ? /\b(?:is|are|was|were|be|been|being|has|have|had|do|does|did|can|could|may|might|must|should|would|will|shall|[a-z]{3,}(?:ed|ing|es|s))\b/i
      : /\b(?:é|são|foi|foram|era|eram|ser|estar|está|estão|teve|tiveram|tem|têm|pode|podem|deve|devem|[a-záéíóúàâêôãõüç]{3,}(?:ar|er|ir|ou|eu|iu|am|em|aram|eram|iram))\b/i;
  }

  function countNoVerbSentences(sentences) {
    var re = getVerbRegex();
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
