// src/detect/connectors.js — Paragraph-level cohesion gap detection. Connector taxonomy lives below with connector highlighting helpers.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

  function countCohesionGaps(paragraphTexts) {
    var texts = paragraphTexts || [];
    if (texts.length < 2) return 0;

    var starts = getConnectorTerms().map(function (t) { return normalizeWord(t); });
    var gaps = 0;

    function startsWithConnector(p) {
      var lead = normalizeWord(String(p || '').slice(0, 80));
      return starts.some(function (c) {
        return lead.indexOf(c + ' ') === 0 || lead.indexOf(c + ',') === 0 || lead === c;
      });
    }

    for (var i = 1; i < texts.length; i++) {
      var prev = texts[i - 1] || '';
      var cur = texts[i] || '';
      var prevSent = getSentences(prev).length;
      if (prevSent >= 2 && !startsWithConnector(cur)) gaps++;
    }
    return gaps;
  }
