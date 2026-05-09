// src/detect/citations.js — Citation marker and citation position detection.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

  function countCitationSentStart(sentences) {
    return (sentences || []).filter(function (s) {
      return /^\s*[\(\[]/.test(s.trim());
    }).length;
  }

  function countCitationSentEnd(sentences) {
    return (sentences || []).filter(function (s) {
      return /\((?:[^)]*\d{4}[^)]*)\)\s*\.?\s*$|\[[0-9,\-\s]+\]\s*\.?\s*$/.test(s.trim());
    }).length;
  }

  function citationStatsForElement(el) {
    var keys = new Set();
    var markers = 0;
    if (el && el.querySelectorAll) {
      el.querySelectorAll('.citation').forEach(function (node) {
        markers++;
        String(node.getAttribute('data-cites') || '').split(/\s+/).forEach(function (key) {
          if (key) keys.add(key);
        });
      });
    }
    return { markers: markers, keys: Array.from(keys) };
  }
