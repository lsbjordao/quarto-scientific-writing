// src/detect/nlp/wink.js — wink-nlp loading, document analysis and wink-backed highlights.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

  // ── New analyses ───────────────────────────────────────────────────────────

  function getPronounAmbiguities(sentences) {
    var re = LANG === 'en'
      ? /^(it|this|these|those|they|them|its)\b/i
      : /^(isso|este|esta|estes|estas|eles|elas|ele|ela|tal|tais)\b/i;
    return sentences.filter(function (s) {
      return re.test(s.trim().replace(/^\s*["'«\u201c]/, ''));
    }).length;
  }

  function countModalVerbs(text) {
    var re = LANG === 'en'
      ? /\b(may|might|could|would|should)\b/gi
      : /\b(pode|poderia|poderiam|deve|deveria|deveriam|seria|seriam)\b/gi;
    return (String(text || '').match(re) || []).length;
  }

  function countFirstPerson(text) {
    var re = LANG === 'en'
      ? /\b(I|we|our|ours|my|mine|us)\b/g
      : /\b(eu|n\u00f3s|nossa|nosso|nossas|nossos)\b/gi;
    return (String(text || '').match(re) || []).length;
  }

  function contentWords(sentence) {
    var re = LANG === 'en' ? /\b[a-z]{3,}\b/gi : /\b[a-záéíóúàâêôãõüçñ]{3,}\b/gi;
    return (String(sentence || '').match(re) || [])
      .map(normalizeWord)
      .filter(function (w) {
        return w && !STOP_WORDS.has(w) && !shouldIgnoreWord(w);
      });
  }

  function jaccard(a, b) {
    if (!a.size && !b.size) return 0;
    var inter = 0;
    a.forEach(function (x) { if (b.has(x)) inter++; });
    var uni = new Set(Array.from(a).concat(Array.from(b))).size;
    return uni ? inter / uni : 0;
  }

  function sentenceSimilarityStats(sentences) {
    var list = sentences || [];
    if (list.length < 2) return { redundancyPct: 0, strongPairs: 0, avgOverlap: 0, flowScore: 0 };
    var strong = 0;
    var sum = 0;
    var connected = 0;
    var connectors = getConnectorTerms().map(normalizeWord);

    for (var i = 1; i < list.length; i++) {
      var prev = new Set(contentWords(list[i - 1]));
      var cur = new Set(contentWords(list[i]));
      var ov = jaccard(prev, cur);
      sum += ov;
      if (ov >= 0.55) strong++;

      var lead = normalizeWord(String(list[i] || '').slice(0, 80));
      var hasConnector = connectors.some(function (c) {
        return lead.indexOf(c + ' ') === 0 || lead.indexOf(c + ',') === 0 || lead === c;
      });
      if (hasConnector || ov >= 0.20) connected++;
    }

    var pairs = list.length - 1;
    return {
      redundancyPct: Math.round((strong / pairs) * 1000) / 10,
      strongPairs: strong,
      avgOverlap: Math.round((sum / pairs) * 1000) / 10,
      flowScore: Math.round((connected / pairs) * 1000) / 10,
    };
  }

  function inferWinkTense(token, lemma, pos) {
    var t = normalizeWord(token);
    var l = normalizeWord(lemma || t);
    var p = String(pos || '');
    if (p !== 'VERB' && p !== 'AUX') return 'other';
    var modal = new Set(['may', 'might', 'must', 'shall', 'should', 'will', 'would', 'can', 'could']);
    if (modal.has(l) || modal.has(t)) return 'future_modal';

    var pastAux = new Set(['was', 'were', 'had', 'did']);
    var presentAux = new Set(['is', 'are', 'am', 'has', 'have', 'do', 'does']);
    if (pastAux.has(t)) return 'past';
    if (presentAux.has(t)) return 'present';
    if (/ed$/.test(t) || /en$/.test(t) || /(went|saw|found|showed|observed|made|took|gave|came)$/.test(t)) return 'past';
    if (/ing$/.test(t) || /s$/.test(t)) return 'present';
    return 'other';
  }

  function winkNounStacks(doc, its) {
    var freq = {};
    var total = 0;
    if (!doc || !its) return { total: 0, items: [] };
    doc.sentences().each(function (s) {
      var toks = s.tokens();
      var pos = toks.out(its.pos);
      var vals = toks.out().map(normalizeWord);
      var run = [];

      function flush() {
        if (run.length >= 3) {
          var phrase = run.join(' ').trim();
          if (phrase) {
            freq[phrase] = (freq[phrase] || 0) + 1;
            total++;
          }
        }
        run = [];
      }

      for (var i = 0; i < pos.length; i++) {
        var tag = pos[i];
        var token = vals[i];
        var keep = (tag === 'NOUN' || tag === 'PROPN' || tag === 'ADJ') &&
          token && token.length >= 3 && !STOP_WORDS.has(token) && !shouldIgnoreWord(token);
        if (keep) run.push(token);
        else flush();
      }
      flush();
    });

    var items = Object.keys(freq)
      .sort(function (a, b) { return freq[b] - freq[a] || a.localeCompare(b); })
      .slice(0, 8)
      .map(function (k) { return { text: k, count: freq[k] }; });
    return { total: total, items: items };
  }

  function detectGlobalNlp() {
    var candidates = [window.nlp, window.compromise];
    for (var i = 0; i < candidates.length; i++) {
      if (candidates[i]) return candidates[i];
    }
    return null;
  }

  function ensureNlpEngine() {
    if (!NLP_CDN_ENABLED) {
      NLP_STATUS = 'disabled';
      return Promise.resolve(null);
    }
    var existing = detectGlobalNlp();
    if (existing) {
      NLP_LIB = existing;
      NLP_STATUS = 'loaded';
      return Promise.resolve(NLP_LIB);
    }
    if (NLP_READY) return NLP_READY;

    NLP_STATUS = 'loading';
    NLP_READY = new Promise(function (resolve) {
      var done = false;
      var preloaded = Array.from(document.scripts || []).some(function (s) {
        return s.src === NLP_CDN_URL;
      });
      var script = document.createElement('script');
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        NLP_STATUS = 'unavailable';
        NLP_ERROR = 'timeout';
        resolve(null);
      }, 4500);

      script.src = NLP_CDN_URL;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.onload = function () {
        if (done) return;
        done = true;
        clearTimeout(timer);
        NLP_LIB = detectGlobalNlp();
        NLP_STATUS = NLP_LIB ? 'loaded' : 'unavailable';
        if (!NLP_LIB) NLP_ERROR = 'global not found';
        resolve(NLP_LIB);
      };
      script.onerror = function () {
        if (done) return;
        done = true;
        clearTimeout(timer);
        NLP_STATUS = 'unavailable';
        NLP_ERROR = 'load error';
        resolve(null);
      };
      if (preloaded) {
        return;
      }
      document.head.appendChild(script);
    });
    return NLP_READY;
  }

  function detectWinkBundleUrl() {
    var scripts = document.querySelectorAll('script[src]');
    for (var i = 0; i < scripts.length; i++) {
      if (/scientific-writing\.js/.test(scripts[i].src)) {
        return scripts[i].src.replace(/scientific-writing\.js([?#].*)?$/, 'wink-bundle.min.js');
      }
    }
    return null;
  }

  function ensureWinkEngine() {
    if (LANG !== 'en') {
      WINK_STATUS = 'disabled';
      return Promise.resolve(null);
    }
    if (WINK_NLP) return Promise.resolve(WINK_NLP);
    if (WINK_READY) return WINK_READY;
    var url = detectWinkBundleUrl();
    if (!url) {
      WINK_STATUS = 'unavailable';
      WINK_ERROR = 'bundle not found';
      return Promise.resolve(null);
    }
    WINK_STATUS = 'loading';
    WINK_READY = new Promise(function (resolve) {
      var done = false;
      var script = document.createElement('script');
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        WINK_STATUS = 'unavailable';
        WINK_ERROR = 'timeout';
        resolve(null);
      }, 12000);
      script.src = url;
      script.async = true;
      script.onload = function () {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try {
          var winkNLPFn = window.winkNLP;
          var model = window.winkEngLiteWebModel;
          if (winkNLPFn && model) {
            WINK_NLP = winkNLPFn(model);
            WINK_LIB = winkNLPFn;
            WINK_STATUS = 'loaded';
          } else {
            WINK_STATUS = 'unavailable';
            WINK_ERROR = 'globals not found';
          }
        } catch (e) {
          WINK_STATUS = 'unavailable';
          WINK_ERROR = String(e.message || e);
        }
        resolve(WINK_NLP);
      };
      script.onerror = function () {
        if (done) return;
        done = true;
        clearTimeout(timer);
        WINK_STATUS = 'unavailable';
        WINK_ERROR = 'load error';
        resolve(null);
      };
      document.head.appendChild(script);
    });
    return WINK_READY;
  }

  function analyzeWinkNlp(text) {
    var result = {
      winkAvailable: false,
      fleschReadingEase: null,
      fleschKincaidGrade: null,
      avgWordsPerSentence: null,
      readingTimeSecs: 0,
      complexWordCount: 0,
      complexWords: [],
      modalCount: 0,
      modalTerms: [],
      passiveSentenceCount: 0,
      weakOpenerCount: 0,
      verbLemmaDiversity: null,
      complexWordDensity: null,
      posNounStackCount: 0,
      posNounStacks: [],
      pronounCount: 0,
      pronounTerms: [],
      pronounDensity: 0,
      auxiliaryCount: 0,
      auxiliaryTerms: [],
      auxiliaryVerbRatio: 0,
      numericTokenCount: 0,
      numericTerms: [],
      numericTokenDensity: 0,
      lexicalDensity: 0,
      properNounCount: 0,
      properNounTerms: [],
      properNounDensity: 0,
      tenseProfile: { past: 0, present: 0, future_modal: 0, other: 0 },
    };
    if (!WINK_NLP || LANG !== 'en') return result;
    try {
      var doc = WINK_NLP.readDoc(String(text || ''));
      var its = WINK_NLP.its;
      var tokenTexts = doc.tokens().out();
      var posAll = doc.tokens().out(its.pos);
      var lemmaAll = doc.tokens().out(its.lemma);
      var modalFreq = {};
      var pronounFreq = {};
      var auxFreq = {};
      var alphaNumTokenCount = 0;
      var openClassCount = 0;
      var numericTokenCount = 0;
      var numericFreq = {};
      var properNounFreq = {};
      var modalLemmas = {
        can: true, could: true, may: true, might: true, must: true,
        shall: true, should: true, will: true, would: true,
      };
      result.winkAvailable = true;
      var nounStacks = winkNounStacks(doc, its);
      result.posNounStackCount = nounStacks.total;
      result.posNounStacks = nounStacks.items;
      var stats = doc.out(its.readabilityStats);
      if (stats) {
        result.fleschReadingEase = typeof stats.fres === 'number' ? Math.round(stats.fres * 10) / 10 : null;
        if (stats.numOfWords > 0 && stats.numOfSentences > 0) {
          result.avgWordsPerSentence = Math.round((stats.numOfWords / stats.numOfSentences) * 10) / 10;
          result.fleschKincaidGrade = Math.round(((0.39 * (stats.numOfWords / stats.numOfSentences)) + (11.8 * (countSyllablesText(text) / stats.numOfWords)) - 15.59) * 10) / 10;
        }
        result.readingTimeSecs = Number(stats.readingTimeSecs) || 0;
        result.complexWordCount = Number(stats.numOfComplexWords) || 0;
        result.complexWords = Object.keys(stats.complexWords || {}).map(function (word) {
          return { text: normalizeWord(word), count: 1 };
        }).filter(function (item) { return item.text; });
        if (stats.numOfWords > 0) {
          result.complexWordDensity = Math.round((result.complexWordCount / stats.numOfWords) * 1000) / 10;
        }
      }
      var verbLemmaList = [];
      for (var t = 0; t < posAll.length; t++) {
        var surfaceToken = normalizeWord(tokenTexts[t]);
        var lemmaToken = normalizeWord(lemmaAll[t] || surfaceToken);
        if (/[a-z0-9]/i.test(surfaceToken)) alphaNumTokenCount++;
        if (posAll[t] === 'NOUN' || posAll[t] === 'VERB' || posAll[t] === 'ADJ' || posAll[t] === 'ADV' || posAll[t] === 'PROPN') {
          openClassCount++;
        }
        if (posAll[t] === 'NUM') {
          numericTokenCount++;
          if (surfaceToken) numericFreq[surfaceToken] = (numericFreq[surfaceToken] || 0) + 1;
        }
        if (posAll[t] === 'PROPN' && surfaceToken && surfaceToken.length >= 2) {
          properNounFreq[surfaceToken] = (properNounFreq[surfaceToken] || 0) + 1;
        }
        if (posAll[t] === 'PRON' && surfaceToken) {
          pronounFreq[surfaceToken] = (pronounFreq[surfaceToken] || 0) + 1;
        }
        if (posAll[t] === 'AUX') {
          var auxKey = lemmaToken || surfaceToken;
          if (auxKey) auxFreq[auxKey] = (auxFreq[auxKey] || 0) + 1;
        }
        if (posAll[t] === 'AUX' && modalLemmas[lemmaAll[t]]) {
          var surface = normalizeWord(tokenTexts[t]);
          if (surface) modalFreq[surface] = (modalFreq[surface] || 0) + 1;
        }
        var tense = inferWinkTense(tokenTexts[t], lemmaAll[t], posAll[t]);
        if (result.tenseProfile[tense] != null) result.tenseProfile[tense] += 1;
        if (posAll[t] === 'VERB' && lemmaAll[t]) verbLemmaList.push(lemmaAll[t]);
      }
      if (verbLemmaList.length > 0) {
        var uniqueVerbLemmas = new Set(verbLemmaList);
        result.verbLemmaDiversity = Math.round((uniqueVerbLemmas.size / verbLemmaList.length) * 1000) / 10;
      }
      result.modalTerms = Object.keys(modalFreq)
        .sort(function (a, b) { return modalFreq[b] - modalFreq[a] || a.localeCompare(b); })
        .map(function (term) { return { text: term, count: modalFreq[term] }; });
      result.modalCount = result.modalTerms.reduce(function (sum, item) { return sum + item.count; }, 0);
      result.pronounTerms = Object.keys(pronounFreq)
        .sort(function (a, b) { return pronounFreq[b] - pronounFreq[a] || a.localeCompare(b); })
        .slice(0, 8)
        .map(function (term) { return { text: term, count: pronounFreq[term] }; });
      result.pronounCount = result.pronounTerms.reduce(function (sum, item) { return sum + item.count; }, 0);
      result.auxiliaryTerms = Object.keys(auxFreq)
        .sort(function (a, b) { return auxFreq[b] - auxFreq[a] || a.localeCompare(b); })
        .slice(0, 8)
        .map(function (term) { return { text: term, count: auxFreq[term] }; });
      result.auxiliaryCount = result.auxiliaryTerms.reduce(function (sum, item) { return sum + item.count; }, 0);
      result.auxiliaryVerbRatio = verbLemmaList.length
        ? Math.round((result.auxiliaryCount / verbLemmaList.length) * 1000) / 10
        : (result.auxiliaryCount ? 999 : 0);
      result.numericTokenCount = numericTokenCount;
      result.numericTerms = Object.keys(numericFreq)
        .sort(function (a, b) { return numericFreq[b] - numericFreq[a] || a.localeCompare(b); })
        .slice(0, 10)
        .map(function (term) { return { text: term, count: numericFreq[term] }; });
      result.properNounTerms = Object.keys(properNounFreq)
        .sort(function (a, b) { return properNounFreq[b] - properNounFreq[a] || a.localeCompare(b); })
        .slice(0, 10)
        .map(function (term) { return { text: term, count: properNounFreq[term] }; });
      result.properNounCount = result.properNounTerms.reduce(function (sum, item) { return sum + item.count; }, 0);
      result.pronounDensity = alphaNumTokenCount ? Math.round((result.pronounCount / alphaNumTokenCount) * 1000) / 10 : 0;
      result.numericTokenDensity = alphaNumTokenCount ? Math.round((numericTokenCount / alphaNumTokenCount) * 1000) / 10 : 0;
      result.lexicalDensity = alphaNumTokenCount ? Math.round((openClassCount / alphaNumTokenCount) * 1000) / 10 : 0;
      result.properNounDensity = alphaNumTokenCount ? Math.round((result.properNounCount / alphaNumTokenCount) * 1000) / 10 : 0;
      var passiveCount = 0;
      var weakOpenerCount = 0;
      var WEAK_OPENER_PAT = /^(?:it\s+(?:is|was|has|had|will|would|can|could|might|should|may)\b|there\s+(?:is|are|was|were|has|have|had)\b|this\s+(?:is|was|has|had)\b)/i;
      doc.sentences().each(function (s) {
        var sentText = s.out().trim();
        if (WEAK_OPENER_PAT.test(sentText)) weakOpenerCount++;
        var tokens = s.tokens();
        var posArr = tokens.out(its.pos);
        var lemmaArr = tokens.out(its.lemma);
        for (var i = 1; i < posArr.length; i++) {
          if (posArr[i] === 'VERB') {
            var window3 = lemmaArr.slice(Math.max(0, i - 3), i);
            if (window3.indexOf('be') !== -1) {
              passiveCount++;
              break;
            }
          }
        }
      });
      result.passiveSentenceCount = passiveCount;
      result.weakOpenerCount = weakOpenerCount;
    } catch (e) {}
    return result;
  }

  function isWinkPassiveSentence(text) {
    if (!WINK_NLP || LANG !== 'en') return false;
    try {
      var doc = WINK_NLP.readDoc(String(text || ''));
      var its = WINK_NLP.its;
      var found = false;
      doc.sentences().each(function (s) {
        if (found) return;
        var tokens = s.tokens();
        var posArr = tokens.out(its.pos);
        var lemmaArr = tokens.out(its.lemma);
        for (var i = 1; i < posArr.length; i++) {
          if (posArr[i] === 'VERB') {
            var window3 = lemmaArr.slice(Math.max(0, i - 3), i);
            if (window3.indexOf('be') !== -1) {
              found = true;
              return;
            }
          }
        }
      });
      return found;
    } catch (e) {}
    return false;
  }
