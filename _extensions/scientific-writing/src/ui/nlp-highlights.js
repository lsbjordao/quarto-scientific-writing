// src/ui/nlp-highlights.js — NLP-specific paragraph highlighting helpers.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

  function highlightNlpNominalLoad(p) {
    var title = L.nlpNominalLoad;
    var marked = p.innerHTML.replace(
      /([.!?]+\s+)(?=[A-ZÁÉÍÓÚÀÂÊÔÃÕÜÇÑ"])/g,
      '$1\x00'
    );
    p.innerHTML = marked.split('\x00').map(function (part) {
      var plain = part.replace(/<[^>]+>/g, ' ');
      return sentenceNominalLoad(plain)
        ? '<span class="ws-nlp-nominal-load" data-ws-focus="nlp-nominal-load" data-ws-reason="' + escapeHTML(title) + '" title="' + escapeHTML(title) + '">' + part + '</span>'
        : part;
    }).join('');
  }

  function highlightNlpWeakVerbs(p) {
    var terms = getWeakVerbTerms().map(function (term) {
      return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    });
    if (!terms.length) return;
    var alpha = LANG === 'en' ? 'A-Za-z' : 'A-Za-zÀ-ÿ';
    try {
      highlightRegexInNode(p, new RegExp('(?<![' + alpha + '])(?:' + terms.join('|') + ')(?![' + alpha + '])', 'gi'), 'ws-nlp-weak-verb', L.nlpWeakVerbs);
    } catch (e) {
      highlightRegexInNode(p, new RegExp('\\b(?:' + terms.join('|') + ')\\b', 'gi'), 'ws-nlp-weak-verb', L.nlpWeakVerbs);
    }
  }

  function highlightNlpNounStacks(p) {
    if (LANG !== 'en') return;
    if (WINK_NLP) {
      var nlpStats = analyzeWinkNlp(p.innerText || p.textContent || '');
      if (nlpStats.posNounStacks && nlpStats.posNounStacks.length) {
        highlightTermListInNode(p, nlpStats.posNounStacks, 'ws-nlp-noun-stack', L.nlpNounStacks);
        return;
      }
    }
    highlightRegexInNode(p, /\b(?:[A-Za-z]{4,}\s+){2,}[A-Za-z]{4,}\b/g, 'ws-nlp-noun-stack', L.nlpNounStacks);
  }

  function highlightNlpTopics(p, nlpStats) {
    var terms = (nlpStats && nlpStats.topics && nlpStats.topics.length)
      ? nlpStats.topics
      : (nlpStats && nlpStats.keyTerms || []).map(function (term) {
          return { text: String(term).split(/\s+\xd7/)[0], count: 1 };
        });
    highlightTermListInNode(p, terms, 'ws-nlp-topic', L.nlpTopics);
  }

  function highlightNlpEntities(p, nlpStats) {
    if (!nlpStats) return;
    highlightTermListInNode(
      p,
      (nlpStats.people || []).concat(nlpStats.organizations || [], nlpStats.places || []),
      'ws-nlp-entity',
      L.nlpEntities
    );
  }

  function highlightNlpValuesDates(p, nlpStats) {
    if (!nlpStats) return;
    highlightTermListInNode(
      p,
      (nlpStats.values || []).concat(nlpStats.dates || []),
      'ws-nlp-value-date',
      L.nlpValuesDates
    );
  }

  function highlightNlpAdverbs(p, nlpStats) {
    if (!nlpStats || !nlpStats.adverbs || !nlpStats.adverbs.length) return;
    highlightTermListInNode(p, nlpStats.adverbs, 'ws-nlp-adverb', L.nlpAdverbs);
  }

  // English contractions. n't / 're / 've / 'll / 'd / 'm are always contractions;
  // 's only for a known whitelist so possessives ("Tukey's", "plant's") are left alone.
  // The apostrophe class matches straight, curly and modifier-letter forms so it works
  // regardless of Quarto's smart-quote conversion.
  function highlightNlpContractions(p) {
    if (LANG !== 'en') return;
    var apos = "['’ʼ]";
    var re = new RegExp(
      '\\b[a-z]+n' + apos + 't\\b' +
      '|\\b[a-z]+' + apos + '(?:re|ve|ll|d|m)\\b' +
      '|\\b(?:it|he|she|that|there|here|what|who|where|how|when|why|let|one)' + apos + 's\\b',
      'gi'
    );
    highlightRegexInNode(p, re, 'ws-nlp-contraction', L.nlpContractions);
  }

  // Interrogative sentences — wrap whole sentences ending in '?' (including '?!').
  // Runs in the innerHTML-rewriting group; see index.js for ordering.
  function highlightNlpQuestions(p) {
    var title = L.nlpQuestions;
    var marked = p.innerHTML.replace(
      /([.!?]+\s+)(?=[A-ZÁÉÍÓÚÀÂÊÔÃÕÜÇÑ"])/g,
      '$1\x00'
    );
    p.innerHTML = marked.split('\x00').map(function (part) {
      var plain = part.replace(/<[^>]+>/g, ' ').trim();
      return /\?[!?]*["'’)\]\s]*$/.test(plain)
        ? '<span class="ws-nlp-question" data-ws-focus="nlp-questions" data-ws-reason="' + escapeHTML(title) + '" title="' + escapeHTML(title) + '">' + part + '</span>'
        : part;
    }).join('');
  }

  function highlightNlpKeyTerms(p, nlpStats) {
    if (!nlpStats || !nlpStats.keyTerms || !nlpStats.keyTerms.length) return;
    var terms = nlpStats.keyTerms.map(function (t) {
      return { text: String(t).split(/\s+\xd7/)[0] };
    });
    highlightTermListInNode(p, terms, 'ws-nlp-key-term', L.nlpKeyTerms);
  }

  // Repeated sentence-opening patterns — wrap sentences whose first two content
  // words match a repeated opening detected for this paragraph (same key logic as
  // getSentenceStartRepeats). Runs in the innerHTML-rewriting group.
  function highlightNlpSentencePatternRepeats(p, nlpStats) {
    if (!nlpStats || !nlpStats.sentencePatternRepeats || !nlpStats.sentencePatternRepeats.length) return;
    var repeatSet = new Set(nlpStats.sentencePatternRepeats.map(function (x) { return x.start; }));
    var tokenRe = LANG === 'en' ? /\b[a-z]{2,}\b/gi : /\b[a-záéíóúàâêôãõüçñ]{2,}\b/gi;
    function startKey(plain) {
      var tokens = (plain.match(tokenRe) || [])
        .map(normalizeWord)
        .filter(function (w) { return !STOP_WORDS.has(w) && !shouldIgnoreWord(w); });
      if (!tokens.length) return '';
      return tokens.slice(0, Math.min(2, tokens.length)).join(' ');
    }
    var title = L.nlpSentencePatternRepeats;
    var marked = p.innerHTML.replace(
      /([.!?]+\s+)(?=[A-ZÁÉÍÓÚÀÂÊÔÃÕÜÇÑ"])/g,
      '$1\x00'
    );
    p.innerHTML = marked.split('\x00').map(function (part) {
      var plain = part.replace(/<[^>]+>/g, ' ');
      return repeatSet.has(startKey(plain))
        ? '<span class="ws-nlp-sentence-repeat" data-ws-focus="nlp-sentence-repeats" data-ws-reason="' + escapeHTML(title) + '" title="' + escapeHTML(title) + '">' + part + '</span>'
        : part;
    }).join('');
  }
