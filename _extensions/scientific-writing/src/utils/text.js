// src/utils/text.js — Basic text normalization, sentence splitting, word and syllable counts.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

  // ── Text analysis ──────────────────────────────────────────────────────────

  function countWords(text) {
    return (text.match(/\S+/g) || []).length;
  }

  function stripDiacritics(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function hashText(text) {
    var s = String(text || '');
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36) + ':' + s.length;
  }

  function getSentences(text) {
    return text
      .split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÀÂÊÔÃÕÜÇÑ"'])/)
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 0; });
  }

  function countSyllablesWord(word) {
    var clean = stripDiacritics(String(word || '').toLowerCase()).replace(/[^a-z]/g, '');
    if (!clean) return 0;

    if (LANG === 'en') {
      if (clean.length <= 3) return 1;
      var trimmed = clean.replace(/(?:e|es|ed)$/i, '');
      var groups = trimmed.match(/[aeiouy]+/g);
      var count = groups ? groups.length : 1;
      return Math.max(1, count);
    }

    var ptGroups = clean.match(/[aeiou]+/g);
    var ptCount = ptGroups ? ptGroups.length : 1;
    return Math.max(1, ptCount);
  }

  function countSyllablesText(text) {
    var RE = LANG === 'en' ? /\b[a-z]{2,}\b/gi : /\b[a-záéíóúàâêôãõüçñ]{2,}\b/gi;
    return (text.match(RE) || []).reduce(function (sum, w) {
      return sum + countSyllablesWord(w);
    }, 0);
  }

  function countComplexWords(text) {
    var RE = LANG === 'en' ? /\b[a-z]{3,}\b/gi : /\b[a-záéíóúàâêôãõüçñ]{3,}\b/gi;
    return (text.match(RE) || []).filter(function (w) {
      var lower = normalizeWord(w);
      return !STOP_WORDS.has(lower) && !shouldIgnoreWord(lower) && countSyllablesWord(lower) >= 3;
    }).length;
  }
