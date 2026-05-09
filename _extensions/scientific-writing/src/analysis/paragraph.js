// src/analysis/paragraph.js — Paragraph analysis and worker-backed batch analysis.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

  function analyzeParagraphSync(text) {
    var sentences = getSentences(text);
    var maxSentLen = sentences.reduce(function (mx, s) { return Math.max(mx, countWords(s)); }, 0);
    return {
      sentences: sentences,
      maxSentLen: maxSentLen,
      lexDiv: getLexDiv(text),
      repeated: getIntraRepeated(text),
      passiveCount: countPassive(text),
      noVerbCount: countNoVerbSentences(sentences),
      syllableCount: countSyllablesText(text),
      complexWordCount: countComplexWords(text),
      hedgeCount: countHedges(text),
      wordyCount: countWordyPhrases(text),
      complexSentenceCount: countComplexSentences(sentences),
    };
  }

  function getAnalysisWorker() {
    if (ANALYSIS_WORKER_DISABLED) return null;
    if (ANALYSIS_WORKER) return ANALYSIS_WORKER;
    if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') {
      ANALYSIS_WORKER_DISABLED = true;
      return null;
    }

    var workerCode = [
      "self.onmessage = function (evt) {",
      "  var msg = evt.data || {};",
      "  if (msg.type !== 'analyze-batch') return;",
      "  var p = msg.payload || {};",
      "  var lang = p.lang === 'en' ? 'en' : 'pt';",
      "  function toSet(arr) { var s = Object.create(null); (arr || []).forEach(function (v) { s[String(v).toLowerCase()] = true; }); return s; }",
      "  function has(setObj, key) { return !!setObj[String(key || '').toLowerCase()]; }",
      "  var stopSet = toSet(p.stopWords || []);",
      "  var excludedSet = toSet(p.excludedTerms || []);",
      "  var hedgeTerms = p.hedgeTerms || [];",
      "  var wordyPhrases = p.wordyPhrases || [];",
      "  var passivePatterns = [];",
      "  (p.passivePatterns || []).forEach(function (src) { try { passivePatterns.push(new RegExp(src, 'gi')); } catch (e) {} });",
      "  function countWords(text) { return (String(text || '').match(/\\S+/g) || []).length; }",
      "  function normalizeWord(w) { return String(w || '').toLowerCase().trim(); }",
      "  function shouldIgnoreWord(w) { return has(excludedSet, normalizeWord(w)); }",
      "  function stripDiacritics(s) { return String(s || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, ''); }",
      "  function countSyllablesWord(word) {",
      "    var clean = stripDiacritics(String(word || '').toLowerCase()).replace(/[^a-z]/g, '');",
      "    if (!clean) return 0;",
      "    if (lang === 'en') {",
      "      if (clean.length <= 3) return 1;",
      "      var trimmed = clean.replace(/(?:e|es|ed)$/i, '');",
      "      var groups = trimmed.match(/[aeiouy]+/g);",
      "      return Math.max(1, groups ? groups.length : 1);",
      "    }",
      "    var ptGroups = clean.match(/[aeiou]+/g);",
      "    return Math.max(1, ptGroups ? ptGroups.length : 1);",
      "  }",
      "  function countSyllablesText(text) {",
      "    var RE = lang === 'en' ? /\\b[a-z]{2,}\\b/gi : /\\b[a-záéíóúàâêôãõüçñ]{2,}\\b/gi;",
      "    return (String(text || '').match(RE) || []).reduce(function (sum, w) { return sum + countSyllablesWord(w); }, 0);",
      "  }",
      "  function countComplexWords(text) {",
      "    var RE = lang === 'en' ? /\\b[a-z]{3,}\\b/gi : /\\b[a-záéíóúàâêôãõüçñ]{3,}\\b/gi;",
      "    return (String(text || '').match(RE) || []).filter(function (w) {",
      "      var lower = normalizeWord(w);",
      "      return !has(stopSet, lower) && !shouldIgnoreWord(lower) && countSyllablesWord(lower) >= 3;",
      "    }).length;",
      "  }",
      "  function countHedges(text) {",
      "    var source = String(text || '').toLowerCase();",
      "    return hedgeTerms.reduce(function (sum, term) {",
      "      var t = String(term || '').toLowerCase().trim();",
      "      if (!t) return sum;",
      "      var safe = t.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');",
      "      var re = t.indexOf(' ') >= 0 ? new RegExp(safe, 'gi') : new RegExp('\\\\b' + safe + '\\\\b', 'gi');",
      "      var m = source.match(re);",
      "      return sum + (m ? m.length : 0);",
      "    }, 0);",
      "  }",
      "  function countWordyPhrases(text) {",
      "    var source = String(text || '').toLowerCase();",
      "    return wordyPhrases.reduce(function (sum, phrase) {",
      "      var p = String(phrase || '').toLowerCase().trim();",
      "      if (!p) return sum;",
      "      var safe = p.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');",
      "      var re = p.indexOf(' ') >= 0 ? new RegExp(safe, 'gi') : new RegExp('\\\\b' + safe + '\\\\b', 'gi');",
      "      var m = source.match(re);",
      "      return sum + (m ? m.length : 0);",
      "    }, 0);",
      "  }",
      "  function sentenceComplexityScore(sentence) {",
      "    var s = String(sentence || '');",
      "    var words = countWords(s);",
      "    var commaClauses = (s.match(/[,:;]\\s+/g) || []).length;",
      "    var connectorClauses = lang === 'en'",
      "      ? (s.match(/\\b(which|that|while|although|because|whereas|however)\\b/gi) || []).length",
      "      : (s.match(/\\b(que|enquanto|embora|porque|pois|contudo|entretanto)\\b/gi) || []).length;",
      "    return (words >= 28 ? 2 : words >= 20 ? 1 : 0) + commaClauses + connectorClauses;",
      "  }",
      "  function countComplexSentences(sentences) {",
      "    return (sentences || []).filter(function (s) { return sentenceComplexityScore(s) >= 3; }).length;",
      "  }",
      "  function getSentences(text) {",
      "    return String(text || '').split(/(?<=[.!?])\\s+(?=[A-ZÁÉÍÓÚÀÂÊÔÃÕÜÇÑ\"'])/)",
      "      .map(function (s) { return s.trim(); })",
      "      .filter(function (s) { return s.length > 0; });",
      "  }",
      "  function getLexDiv(text) {",
      "    var RE = lang === 'en' ? /\\b[a-z]{3,}\\b/gi : /\\b[a-záéíóúàâêôãõüçñ]{3,}\\b/gi;",
      "    var tokens = (String(text || '').match(RE) || [])",
      "      .map(function (w) { return w.toLowerCase(); })",
      "      .filter(function (w) { return !has(stopSet, w) && !shouldIgnoreWord(w); });",
      "    if (tokens.length === 0) return 1;",
      "    var uniq = Object.create(null);",
      "    tokens.forEach(function (w) { uniq[w] = true; });",
      "    return Object.keys(uniq).length / tokens.length;",
      "  }",
      "  function getIntraRepeated(text) {",
      "    var RE = lang === 'en' ? /\\b[a-z]{4,}\\b/gi : /\\b[a-záéíóúàâêôãõüç]{4,}\\b/gi;",
      "    var freq = Object.create(null);",
      "    (String(text || '').match(RE) || []).forEach(function (w) {",
      "      var lower = w.toLowerCase();",
      "      if (!has(stopSet, lower) && !shouldIgnoreWord(lower)) freq[lower] = (freq[lower] || 0) + 1;",
      "    });",
      "    var result = Object.create(null);",
      "    Object.keys(freq).forEach(function (k) { if (freq[k] > 1) result[k] = freq[k]; });",
      "    return result;",
      "  }",
      "  function countPassive(text) {",
      "    return passivePatterns.reduce(function (total, re) {",
      "      var matches = String(text || '').match(new RegExp(re.source, 'gi'));",
      "      return total + (matches ? matches.length : 0);",
      "    }, 0);",
      "  }",
      "  function getVerbRegex() {",
      "    return lang === 'en'",
      "      ? /\\b(?:is|are|was|were|be|been|being|has|have|had|do|does|did|can|could|may|might|must|should|would|will|shall|[a-z]{3,}(?:ed|ing|es|s))\\b/i",
      "      : /\\b(?:é|são|foi|foram|era|eram|ser|estar|está|estão|teve|tiveram|tem|têm|pode|podem|deve|devem|[a-záéíóúàâêôãõüç]{3,}(?:ar|er|ir|ou|eu|iu|am|em|aram|eram|iram))\\b/i;",
      "  }",
      "  function countNoVerbSentences(sentences) {",
      "    var re = getVerbRegex();",
      "    return (sentences || []).filter(function (s) { return countWords(s) >= 6 && !re.test(s); }).length;",
      "  }",
      "  var out = (p.texts || []).map(function (text) {",
      "    var sentences = getSentences(text);",
      "    var maxSentLen = sentences.reduce(function (mx, s) { return Math.max(mx, countWords(s)); }, 0);",
      "    return {",
      "      sentences: sentences,",
      "      maxSentLen: maxSentLen,",
      "      lexDiv: getLexDiv(text),",
      "      repeated: getIntraRepeated(text),",
      "      passiveCount: countPassive(text),",
      "      noVerbCount: countNoVerbSentences(sentences),",
      "      syllableCount: countSyllablesText(text),",
      "      complexWordCount: countComplexWords(text),",
      "      hedgeCount: countHedges(text),",
      "      wordyCount: countWordyPhrases(text),",
      "      complexSentenceCount: countComplexSentences(sentences)",
      "    };",
      "  });",
      "  self.postMessage({ id: msg.id, results: out });",
      "};"
    ].join('\n');

    try {
      var blob = new Blob([workerCode], { type: 'application/javascript' });
      ANALYSIS_WORKER = new Worker(URL.createObjectURL(blob));
      return ANALYSIS_WORKER;
    } catch (e) {
      ANALYSIS_WORKER_DISABLED = true;
      return null;
    }
  }

  function analyzeParagraphsAsync(texts) {
    var startedAt = Date.now();
    var out = new Array(texts.length);
    var pendingTexts = [];
    var pendingIndexes = [];
    var pendingKeys = [];

    texts.forEach(function (text, idx) {
      var key = hashText(text);
      if (ANALYSIS_CACHE[key]) {
        out[idx] = ANALYSIS_CACHE[key];
      } else {
        pendingTexts.push(text);
        pendingIndexes.push(idx);
        pendingKeys.push(key);
      }
    });

    ANALYSIS_TELEMETRY.hits += texts.length - pendingTexts.length;
    ANALYSIS_TELEMETRY.misses += pendingTexts.length;
    ANALYSIS_TELEMETRY.batches += 1;

    if (pendingTexts.length === 0) {
      ANALYSIS_TELEMETRY.durationMs += Date.now() - startedAt;
      ANALYSIS_TELEMETRY.mode = ANALYSIS_TELEMETRY.mode === 'worker' ? 'worker' : 'sync';
      return Promise.resolve(out);
    }

    function fillSync() {
      pendingTexts.forEach(function (text, i) {
        var stat = analyzeParagraphSync(text);
        ANALYSIS_CACHE[pendingKeys[i]] = stat;
        out[pendingIndexes[i]] = stat;
      });
      ANALYSIS_TELEMETRY.mode = 'sync';
      ANALYSIS_TELEMETRY.durationMs += Date.now() - startedAt;
      return out;
    }

    var worker = getAnalysisWorker();
    if (!worker) return Promise.resolve(fillSync());

    return new Promise(function (resolve) {
      var id = ++ANALYSIS_REQ_ID;

      function onError() {
        ANALYSIS_WORKER_DISABLED = true;
        try { worker.terminate(); } catch (e) {}
        ANALYSIS_WORKER = null;
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
        resolve(fillSync());
      }

      function onMessage(evt) {
        var data = evt.data || {};
        if (data.id !== id) return;
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);

        var rows = Array.isArray(data.results) ? data.results : [];
        if (rows.length !== pendingTexts.length) {
          resolve(fillSync());
          return;
        }

        rows.forEach(function (stat, i) {
          ANALYSIS_CACHE[pendingKeys[i]] = stat;
          out[pendingIndexes[i]] = stat;
        });
        ANALYSIS_TELEMETRY.mode = 'worker';
        ANALYSIS_TELEMETRY.durationMs += Date.now() - startedAt;
        resolve(out);
      }

      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);
      worker.postMessage({
        type: 'analyze-batch',
        id: id,
        payload: {
          lang: LANG,
          texts: pendingTexts,
          stopWords: Array.from(STOP_WORDS),
          excludedTerms: Array.from(EXCLUDED_TERMS),
          passivePatterns: PASSIVE_PATTERNS.map(function (re) { return re.source; }),
          hedgeTerms: getHedgeTerms(),
          wordyPhrases: Object.keys(getWordyPhrasesMap())
        }
      });
    });
  }
