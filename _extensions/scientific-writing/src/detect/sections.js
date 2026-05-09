// src/detect/sections.js — Paragraph opening repetition helpers. Section summary helpers are in analysis/section.js.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

  function getParaOpeningKey(text) {
    var src = String(text || '').trim().replace(/^["'«\(\[\{\s]+/, '');
    var words = (src.match(LANG === 'en' ? /\b[a-z]+\b/gi : /\b[a-záéíóúàâêôãõüçñ]+\b/gi) || [])
      .map(normalizeWord)
      .filter(Boolean);
    if (!words.length) return '';
    if (words.length === 1) return words[0];
    return words[0] + ' ' + words[1];
  }

  function getParaOpeningRepeats(paragraphTexts) {
    var freq = {};
    (paragraphTexts || []).forEach(function (t) {
      var key = getParaOpeningKey(t);
      if (!key || key.length < 3) return;
      freq[key] = (freq[key] || 0) + 1;
    });
    return Object.keys(freq)
      .filter(function (k) { return freq[k] >= 2; })
      .sort(function (a, b) { return freq[b] - freq[a] || a.localeCompare(b); })
      .map(function (k) { return { word: k, count: freq[k] }; });
  }
