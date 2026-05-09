// src/analysis/readability.js — Readability, lexical diversity and repetition metrics.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

  function computeReadability(totalWords, sentenceCount, totalSyllables, complexWords) {
    if (!totalWords || !sentenceCount) {
      return { flesch: 0, grade: 0, fog: 0 };
    }
    var wordsPerSentence = totalWords / sentenceCount;
    var syllablesPerWord = totalSyllables > 0 ? totalSyllables / totalWords : 1;
    var complexPct = complexWords > 0 ? (complexWords / totalWords) * 100 : 0;

    var flesch = LANG === 'en'
      ? 206.835 - (1.015 * wordsPerSentence) - (84.6 * syllablesPerWord)
      : 248.835 - (1.015 * wordsPerSentence) - (84.6 * syllablesPerWord);
    var grade = (0.39 * wordsPerSentence) + (11.8 * syllablesPerWord) - 15.59;
    var fog = 0.4 * (wordsPerSentence + complexPct);

    return {
      flesch: round1(flesch),
      grade: round1(grade),
      fog: round1(fog),
    };
  }

  function getLexDiv(text) {
    var RE = LANG === 'en' ? /\b[a-z]{3,}\b/gi : /\b[a-záéíóúàâêôãõüçñ]{3,}\b/gi;
    var tokens = (text.match(RE) || [])
      .map(function (w) { return w.toLowerCase(); })
      .filter(function (w) { return !STOP_WORDS.has(w) && !shouldIgnoreWord(w); });
    if (tokens.length === 0) return 1;
    return (new Set(tokens)).size / tokens.length;
  }

  function getIntraRepeated(text) {
    var RE = LANG === 'en' ? /\b[a-z]{4,}\b/gi : /\b[a-záéíóúàâêôãõüç]{4,}\b/gi;
    var freq = {};
    (text.match(RE) || []).forEach(function (w) {
      var lower = w.toLowerCase();
      if (!STOP_WORDS.has(lower) && !shouldIgnoreWord(lower)) freq[lower] = (freq[lower] || 0) + 1;
    });
    var result = {};
    Object.keys(freq)
      .filter(function (k) { return freq[k] > 1; })
      .sort(function (a, b) { return freq[b] - freq[a]; })
      .forEach(function (k) { result[k] = freq[k]; });
    return result;
  }

  function getGlobalFrequent(text, limit) {
    return getGlobalRepeatedItems(text, 3, limit).map(function (item) {
      return item.text + ' ×' + item.count;
    });
  }

  function getGlobalRepeatedItems(text, minCount, limit) {
    var RE = LANG === 'en' ? /\b[a-z]{4,}\b/gi : /\b[a-záéíóúàâêôãõüç]{4,}\b/gi;
    var freq = {};
    (text.match(RE) || []).forEach(function (w) {
      var lower = w.toLowerCase();
      if (!STOP_WORDS.has(lower) && !shouldIgnoreWord(lower)) freq[lower] = (freq[lower] || 0) + 1;
    });
    var repeated = Object.keys(freq)
      .filter(function (k) { return freq[k] >= (minCount || 3); })
      .sort(function (a, b) { return freq[b] - freq[a]; })
      .map(function (k) { return { text: k, count: freq[k] }; });
    return limit ? repeated.slice(0, limit) : repeated;
  }
