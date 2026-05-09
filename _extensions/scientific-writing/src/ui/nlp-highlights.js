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
