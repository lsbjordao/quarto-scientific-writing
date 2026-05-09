// src/ui/cards.js — Margin note card construction.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

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

    // Long sentence alert (with hover-to-highlight)
    if (stats.maxSentLen > SENT_LONG) {
      var sentEl = document.createElement('div');
      sentEl.className = 'ws-sent-alert';
      sentEl.textContent = L.longSent + ': ' + stats.maxSentLen + L.wSuffix;
      addHoverHighlight(sentEl, note, '.ws-long-sentence', 'ws-long-sentence-active');
      note.appendChild(sentEl);
    }

    // Passive voice (with hover-to-highlight)
    if (stats.passiveCount > 0) {
      var passEl = document.createElement('div');
      passEl.className = 'ws-passive-count';
      passEl.textContent = L.passive + ': ' + stats.passiveCount;
      addHoverHighlight(passEl, note, '.ws-passive, .ws-wink-passive', 'ws-passive-active');
      note.appendChild(passEl);
    }

    // Wordy phrases
    if ((stats.wordyCount || 0) > 0) {
      var wordyEl = document.createElement('div');
      wordyEl.className = 'ws-wordy-count';
      wordyEl.textContent = L.wordyPhrases + ': ' + stats.wordyCount;
      addHoverHighlight(wordyEl, note, '.ws-wordy', 'ws-wordy-active');
      note.appendChild(wordyEl);
    }

    if (typeof stats.citationMarkers === 'number') {
      var citeEl = document.createElement('div');
      citeEl.className = 'ws-citation-count' +
        (stats.needsCitation && !stats.citationMarkers ? ' ws-citation-low-count' : '') +
        (stats.resultsCitation && stats.citationMarkers > 0 ? ' ws-results-citation-count' : '');
      var citeText = L.citations + ': ' + stats.citationMarkers;
      if (stats.citationKeyCount && stats.citationKeyCount !== stats.citationMarkers) {
        citeText += ' / ' + stats.citationKeyCount + ' refs';
      }
      citeEl.textContent = citeText;
      if (stats.needsCitation && !stats.citationMarkers) citeEl.title = L.noCitationsIntroDiscussion;
      if (stats.resultsCitation && stats.citationMarkers > 0) citeEl.title = L.resultsCitationDesc;
      note.appendChild(citeEl);
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
