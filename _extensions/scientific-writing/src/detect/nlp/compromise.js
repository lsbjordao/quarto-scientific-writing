// src/detect/nlp/compromise.js — compromise-backed scientific NLP helpers and term extraction.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

  function makeNlpDoc(text) {
    var lib = NLP_LIB || detectGlobalNlp();
    if (!lib) return null;
    try {
      if (typeof lib === 'function') return lib(String(text || ''));
      if (lib && typeof lib.text === 'function') return lib.text(String(text || ''));
    } catch (e) {}
    return null;
  }

  function stripNlpNoise(text) {
    return String(text || '')
      .replace(/\((?:[^)]*\d{4}[^)]*)\)/g, ' ')
      .replace(/\[[0-9,\-\s]+\]/g, ' ')
      .replace(/\b[A-ZÁÉÍÓÚÀÂÊÔÃÕÜÇ][A-Za-zÀ-ÿ'’-]+\s+et\s+al\.?/g, ' ')
      .replace(/\bet\s+al\.?/gi, ' ')
      .replace(/\bal\.\s*\d{4}\b/gi, ' ')
      .replace(/\b\d{4}\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeNlpTerm(value) {
    if (value == null) return '';
    if (typeof value === 'string') return normalizeWord(value).replace(/\s+/g, ' ').trim();
    if (typeof value === 'object') {
      return normalizeWord(value.text || value.normal || value.normalized || value.implicit || value.word || '')
        .replace(/\s+/g, ' ')
        .trim();
    }
    return '';
  }

  function nlpViewArray(doc, method) {
    if (!doc || typeof doc[method] !== 'function') return [];
    try {
      var view = doc[method]();
      var raw = [];
      if (view && typeof view.out === 'function') {
        try { raw = view.out('array'); } catch (e1) {}
        if (!Array.isArray(raw)) {
          try { raw = String(view.out('text') || '').split(/\s*,\s*|\n+/); } catch (e2) {}
        }
      }
      if ((!raw || !raw.length) && view && typeof view.data === 'function') raw = view.data();
      if ((!raw || !raw.length) && Array.isArray(view)) raw = view;
      return (raw || []).map(normalizeNlpTerm).filter(Boolean);
    } catch (e) {
      return [];
    }
  }

  function nlpViewItems(doc, method) {
    if (!doc || typeof doc[method] !== 'function') return [];
    try {
      var view = doc[method]();
      var raw = [];
      if (view && typeof view.out === 'function') {
        try { raw = view.out('array'); } catch (e1) {}
      }
      if ((!raw || !raw.length) && view && typeof view.data === 'function') raw = view.data();
      if ((!raw || !raw.length) && Array.isArray(view)) raw = view;
      return (raw || []).map(function (item) {
        var text = normalizeNlpTerm(item);
        var count = item && typeof item === 'object' ? Number(item.count || item.frequency || 1) : 1;
        return text ? { text: text, count: isFinite(count) && count > 0 ? count : 1 } : null;
      }).filter(Boolean);
    } catch (e) {
      return [];
    }
  }

  function compactNlpItems(items, limit) {
    var freq = {};
    (items || []).forEach(function (item) {
      var text = normalizeNlpTerm(item.text || item);
      if (!text || text.length < 3 || STOP_WORDS.has(text) || shouldIgnoreWord(text)) return;
      freq[text] = (freq[text] || 0) + (Number(item.count) || 1);
    });
    return Object.keys(freq)
      .sort(function (a, b) { return freq[b] - freq[a] || a.localeCompare(b); })
      .slice(0, limit || 8)
      .map(function (text) { return { text: text, count: freq[text] }; });
  }

  function looksLikeNamedEntity(text) {
    var raw = String(text || '').trim();
    if (!raw) return false;
    var cleaned = raw.replace(/^[^\wÀ-ÿ]+|[^\wÀ-ÿ.]+$/g, '').trim();
    if (!cleaned || cleaned.length < 3) return false;
    var lower = normalizeWord(cleaned.replace(/\.+$/g, ''));
    var blocked = new Set([
      'que', 'al', 'et al', 'alta', 'colo', 'luz', 'dia', 'dias', 'semana', 'semanas',
      'tratamento', 'tratamentos', 'temperatura', 'temperaturas', 'plantas', 'planta',
      'crescimento', 'resultados', 'discussao', 'discussão', 'metodos', 'métodos',
      'resumo', 'introducao', 'introdução', 'conclusao', 'conclusão',
      'which', 'that', 'while', 'whereas', 'however', 'results', 'methods', 'discussion',
      'abstract', 'conclusion', 'plant', 'plants', 'temperature', 'temperatures',
    ]);
    if (blocked.has(lower) || STOP_WORDS.has(lower) || shouldIgnoreWord(lower)) return false;
    if (/^(?:al|et al)\.?(?:\s+\d{4})?$/i.test(cleaned)) return false;
    if (/\d{4}/.test(cleaned)) return false;
    if (/[,;:]\s*$/.test(raw)) return false;

    var words = cleaned.split(/\s+/).filter(Boolean);
    if (words.length > 6) return false;
    var hasAcronym = words.some(function (w) { return /^[A-Z]{2,}(?:\.[A-Z]+)*\.?$/.test(w); });
    var hasOrgSuffix = /\b(inc|corp|ltd|university|institute|department|team|foundation|software|R|universidade|instituto|embrapa|fapesp|cnpq|capes)\b/i.test(cleaned);
    var capitalized = words.filter(function (w) {
      return /^[A-ZÁÉÍÓÚÀÂÊÔÃÕÜÇ][A-Za-zÀ-ÿ'’-]{2,}$/.test(w) || /^[A-Z]\.$/.test(w);
    }).length;
    return hasAcronym || hasOrgSuffix || capitalized >= Math.min(2, words.length);
  }

  function compactNamedEntities(items, limit) {
    return compactNlpItems((items || []).filter(function (item) {
      return looksLikeNamedEntity(item.text || item);
    }), limit || 8);
  }

  function extractNamedEntityTerms(text) {
    var src = String(text || '');
    var candidates = src.match(/\b(?:[A-ZÁÉÍÓÚÀÂÊÔÃÕÜÇ][A-Za-zÀ-ÿ'’-]{2,}|[A-Z]{2,})(?:\s+(?:[A-ZÁÉÍÓÚÀÂÊÔÃÕÜÇ][A-Za-zÀ-ÿ'’-]{2,}|[A-Z]{2,})){0,4}\b/g) || [];
    return candidates
      .map(function (t) { return normalizeWord(t); })
      .filter(function (t) { return looksLikeNamedEntity(t); });
  }

  function extractValueDateTerms(text) {
    var src = String(text || '');
    var ranges = [];
    var patterns = [
      /\b\d+(?:[\.,]\d+)?\s*(?:%|mg|g|kg|ml|l|cm|mm|nm|ha|m\/s|\u00b0c|kpa|pa|ppm|ppb)\b/gi,
      /\b\d+(?:[\.,]\d+)?\b/g,
      LANG === 'en'
        ? /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)\b(?:[\s-]+\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)\b)*/gi
        : /\b(?:um|uma|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|mil)\b(?:\s+(?:e\s+)?\b(?:um|uma|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|mil)\b)*/gi,
      LANG === 'en'
        ? /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:,\s*\d{4})?\b/gi
        : /\b\d{1,2}\s+de\s+(?:janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+\d{4})?\b/gi
    ];
    patterns.forEach(function (re) {
      var r = new RegExp(re.source, re.flags || 'gi');
      var m;
      while ((m = r.exec(src)) !== null) {
        ranges.push([m.index, m.index + m[0].length]);
      }
    });
    if (!ranges.length) return [];
    ranges.sort(function (a, b) { return a[0] - b[0] || b[1] - a[1]; });
    var merged = [];
    ranges.forEach(function (rng) {
      var last = merged[merged.length - 1];
      if (last && rng[0] < last[1]) {
        last[1] = Math.max(last[1], rng[1]);
      } else {
        merged.push(rng.slice());
      }
    });
    return merged.map(function (rng) {
      return { text: src.slice(rng[0], rng[1]).toLowerCase(), count: 1 };
    });
  }

  function displayNlpItems(items) {
    return (items || []).map(function (item) {
      return item.text + (item.count > 1 ? ' \xd7' + item.count : '');
    });
  }

  function getWeakVerbTerms() {
    return LANG === 'en'
      ? ['be', 'is', 'are', 'was', 'were', 'have', 'has', 'had', 'show', 'shows', 'showed',
          'indicate', 'indicates', 'indicated', 'suggest', 'suggests', 'suggested', 'present',
          'presents', 'presented', 'occur', 'occurs', 'occurred', 'perform', 'performed',
          'conduct', 'conducted', 'make', 'made', 'do', 'does', 'did']
      : ['ser', 'é', 'são', 'foi', 'foram', 'estar', 'está', 'estão', 'ter', 'tem', 'têm',
          'apresentar', 'apresenta', 'apresentaram', 'realizar', 'realiza', 'realizado',
          'fazer', 'faz', 'ocorrer', 'ocorre', 'ocorreram', 'mostrar', 'mostra', 'indicou',
          'indica', 'indicam', 'sugerir', 'sugere', 'sugerem', 'observar', 'observou'];
  }

  function countWeakVerbs(text) {
    var source = String(text || '').toLowerCase();
    var alpha = LANG === 'en' ? 'A-Za-z' : 'A-Za-zÀ-ÿ';
    return getWeakVerbTerms().reduce(function (sum, term) {
      var safe = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var re;
      try {
        re = new RegExp('(?<![' + alpha + '])' + safe + '(?![' + alpha + '])', 'gi');
      } catch (e) {
        re = new RegExp('(^|[^' + alpha + '])' + safe + '(?=$|[^' + alpha + '])', 'gi');
      }
      var m = source.match(re);
      return sum + (m ? m.length : 0);
    }, 0);
  }

  function countNounStacks(text) {
    if (LANG !== 'en') return 0;
    var matches = String(text || '').match(/\b(?:[A-Za-z]{4,}\s+){2,}[A-Za-z]{4,}\b/g) || [];
    return matches.filter(function (m) {
      var terms = m.toLowerCase().split(/\s+/).filter(function (w) {
        return !STOP_WORDS.has(w) && !shouldIgnoreWord(w);
      });
      return terms.length >= 3;
    }).length;
  }

  function sentenceNominalLoad(sentence) {
    var words = countWords(sentence);
    if (words < 14) return false;
    var nominal = countNominalizations(sentence);
    var verbRe = getVerbRegex();
    var verbs = (String(sentence || '').match(new RegExp(verbRe.source, 'gi')) || []).length;
    var content = (String(sentence || '').match(LANG === 'en' ? /\b[a-z]{5,}\b/gi : /\b[a-záéíóúàâêôãõüçñ]{5,}\b/gi) || [])
      .filter(function (w) {
        var lower = normalizeWord(w);
        return !STOP_WORDS.has(lower) && !shouldIgnoreWord(lower);
      }).length;
    return nominal >= 3 || (content >= 10 && verbs <= 1);
  }

  function countNominalLoadSentences(sentences) {
    return (sentences || []).filter(sentenceNominalLoad).length;
  }

  function candidateKeyTerms(text, nlpNouns) {
    var freq = {};
    (nlpNouns && nlpNouns.length ? nlpNouns : (String(text || '').match(LANG === 'en' ? /\b[a-z]{6,}\b/gi : /\b[a-záéíóúàâêôãõüçñ]{6,}\b/gi) || []))
      .forEach(function (term) {
        var t = normalizeWord(term).replace(/[^a-z0-9áéíóúàâêôãõüçñ\s-]/gi, '').replace(/\s+/g, ' ').trim();
        if (!t || t.length < 5 || STOP_WORDS.has(t) || shouldIgnoreWord(t)) return;
        freq[t] = (freq[t] || 0) + 1;
      });
    return Object.keys(freq)
      .filter(function (k) { return freq[k] >= 2; })
      .sort(function (a, b) { return freq[b] - freq[a] || a.localeCompare(b); })
      .slice(0, 6)
      .map(function (k) { return k + ' \xd7' + freq[k]; });
  }

  function analyzeScientificNlp(text, sentences) {
    var cleanText = stripNlpNoise(text);
    var doc = makeNlpDoc(cleanText);
    var winkStats = (LANG === 'en' && WINK_NLP) ? analyzeWinkNlp(text) : null;
    var sentenceList = (sentences && sentences.length) ? sentences : getSentences(text);
    var simStats = sentenceSimilarityStats(sentenceList);
    var sentenceStarts = getSentenceStartRepeats(sentenceList);
    var nouns = nlpViewArray(doc, 'nouns');
    var verbs = nlpViewArray(doc, 'verbs');
    var adjectives = nlpViewArray(doc, 'adjectives');
    var adverbs = nlpViewArray(doc, 'adverbs');
    var topics = compactNlpItems(nlpViewItems(doc, 'topics'), 8);
    var people = compactNamedEntities(nlpViewItems(doc, 'people'), 8);
    var organizations = compactNamedEntities(nlpViewItems(doc, 'organizations').concat(nlpViewItems(doc, 'organisations')), 8);
    var places = compactNamedEntities(nlpViewItems(doc, 'places'), 8);
    var valueDateTerms = compactNlpItems(extractValueDateTerms(text), 50);
    var dates = compactNlpItems(nlpViewItems(doc, 'dates'), 8);
    var values = valueDateTerms.length ? valueDateTerms : compactNlpItems(nlpViewItems(doc, 'values'), 8);
    var adverbItems = compactNlpItems(adverbs.map(function (text) { return { text: text, count: 1 }; }), 8);
    var verbUniq = new Set(verbs.map(function (v) { return v.replace(/\s+/g, ' '); }));
    var nounVerbRatio = verbs.length ? nouns.length / verbs.length : nouns.length ? nouns.length : 0;
    var lexicalTagged = nouns.length + verbs.length + adjectives.length + adverbs.length;
    var wordCount = countWords(text);
    var nounDensity = wordCount ? Math.round((nouns.length / wordCount) * 1000) / 10 : 0;
    var entityCount = people.concat(organizations, places).reduce(function (sum, x) { return sum + x.count; }, 0);
    var entityDensity = wordCount ? Math.round((entityCount / wordCount) * 1000) / 10 : 0;
    var termDriftCount = getTerminologyVariants(text).length;
    var weakVerbCount = countWeakVerbs(text);
    var actionVerbScore = verbs.length ? Math.round((Math.max(0, 1 - (weakVerbCount / verbs.length))) * 1000) / 10 : 100;
    var entityOverloadCount = sentenceList.filter(function (s) {
      var local = extractNamedEntityTerms(s);
      return local.length >= 3;
    }).length;

    // compromise v14: contractions (EN only), questions, verb tense
    var contractionItems = [];
    if (LANG === 'en' && doc && typeof doc.contractions === 'function') {
      try { contractionItems = doc.contractions().out('array') || []; } catch (e) {}
    }
    var questionItems = [];
    if (doc && typeof doc.questions === 'function') {
      try { questionItems = doc.questions().out('array') || []; } catch (e) {}
    }
    return {
      nlpAvailable: !!doc,
      nounCount: nouns.length,
      verbCount: verbs.length,
      adjectiveCount: adjectives.length,
      adverbCount: adverbs.length,
      nounVerbRatio: nounVerbRatio,
      verbDiversity: verbs.length ? verbUniq.size / verbs.length : 1,
      taggedDensity: countWords(text) ? lexicalTagged / countWords(text) : 0,
      nominalLoadCount: countNominalLoadSentences(sentences || getSentences(text)),
      weakVerbCount: weakVerbCount,
      nounStackCount: winkStats && winkStats.posNounStackCount ? winkStats.posNounStackCount : countNounStacks(text),
      nounDensity: nounDensity,
      entityDensity: entityDensity,
      entityOverloadCount: entityOverloadCount,
      actionVerbScore: actionVerbScore,
      sentencePatternRepeats: sentenceStarts,
      sentencePatternRepeatCount: sentenceStarts.length,
      semanticRedundancyPct: simStats.redundancyPct,
      flowScore: simStats.flowScore,
      termDriftCount: termDriftCount,
      tenseProfile: winkStats && winkStats.tenseProfile ? winkStats.tenseProfile : { past: 0, present: 0, future_modal: 0, other: 0 },
      winkPosNounStacks: winkStats && winkStats.posNounStacks ? winkStats.posNounStacks : [],
      keyTerms: candidateKeyTerms(text, topics.length ? topics.map(function (x) { return x.text; }) : nouns),
      topics: topics,
      people: people,
      organizations: organizations,
      places: places,
      dates: dates,
      values: values,
      adverbs: adverbItems,
      winkComplexWordCount: winkStats ? (winkStats.complexWordCount || 0) : 0,
      winkComplexWords: winkStats ? (winkStats.complexWords || []) : [],
      winkModalCount: winkStats ? (winkStats.modalCount || 0) : 0,
      winkModalTerms: winkStats ? (winkStats.modalTerms || []) : [],
      winkPronounCount: winkStats ? (winkStats.pronounCount || 0) : 0,
      winkPronounTerms: winkStats ? (winkStats.pronounTerms || []) : [],
      winkPronounDensity: winkStats ? (winkStats.pronounDensity || 0) : 0,
      winkAuxiliaryCount: winkStats ? (winkStats.auxiliaryCount || 0) : 0,
      winkAuxiliaryTerms: winkStats ? (winkStats.auxiliaryTerms || []) : [],
      winkAuxiliaryVerbRatio: winkStats ? (winkStats.auxiliaryVerbRatio || 0) : 0,
      winkNumericTokenCount: winkStats ? (winkStats.numericTokenCount || 0) : 0,
      winkNumericTerms: winkStats ? (winkStats.numericTerms || []) : [],
      winkNumericTokenDensity: winkStats ? (winkStats.numericTokenDensity || 0) : 0,
      winkLexicalDensity: winkStats ? (winkStats.lexicalDensity || 0) : 0,
      winkProperNounCount: winkStats ? (winkStats.properNounCount || 0) : 0,
      winkProperNounTerms: winkStats ? (winkStats.properNounTerms || []) : [],
      winkProperNounDensity: winkStats ? (winkStats.properNounDensity || 0) : 0,
      winkReadingTimeSecs: winkStats ? (winkStats.readingTimeSecs || 0) : 0,
      passiveSentenceCount: winkStats ? (winkStats.passiveSentenceCount || 0) : 0,

      topicCount: topics.reduce(function (sum, x) { return sum + x.count; }, 0),
      entityCount: entityCount,
      dateValueCount: values.length + dates.length,
      contractionCount: contractionItems.length,
      questionCount: questionItems.length,
    };
  }
