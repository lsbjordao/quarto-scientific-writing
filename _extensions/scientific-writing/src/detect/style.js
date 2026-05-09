// src/detect/style.js — Hedges, wordy phrases, sentence complexity, acronyms, colloquial terms and vague quantifiers.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

  function getHedgeTerms() {
    if (LANG === 'en') {
      return [
        'may', 'might', 'could', 'possibly', 'perhaps', 'apparently', 'likely', 'unlikely',
        'seems', 'appears', 'suggests', 'suggest', 'indicates', 'indicate', 'approximately',
        'around', 'about', 'potentially', 'generally', 'relatively', 'somewhat', 'in part'
      ];
    }
    return [
      'pode', 'podem', 'poderia', 'poderiam', 'talvez', 'possivelmente', 'aparentemente',
      'provavelmente', 'improvavel', 'improvável', 'sugere', 'sugerem', 'indica', 'indicam',
      'aproximadamente', 'cerca de', 'em torno de', 'relativamente', 'parcialmente', 'em parte'
    ];
  }

  function getHedgeRegexes() {
    return getHedgeTerms().map(function (term) {
      var safe = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var pattern = safe.indexOf(' ') >= 0 ? safe : ('\\b' + safe + '\\b');
      return new RegExp(pattern, 'gi');
    });
  }

  function getWordyPhrasesMap() {
    if (LANG === 'en') {
      return {
        'at this point in time': 'now',
        'due to the fact that': 'because',
        'in order to': 'to',
        'in the event that': 'if',
        'prior to': 'before',
        'subsequent to': 'after',
        'a large number of': 'many',
        'a small number of': 'few',
        'in the near future': 'soon',
        'it is important to note that': '',
        'it is possible that': 'may',
        'it should be noted that': '',
        'has the ability to': 'can',
        'take into consideration': 'consider',
        'with the exception of': 'except',
        'for the purpose of': 'for',
        'by means of': 'by',
        'in the case of': 'if',
        'in view of the fact that': 'because',
        'on a regular basis': 'regularly'
      };
    }
    return {
      'no que diz respeito a': 'sobre',
      'com o objetivo de': 'para',
      'devido ao fato de que': 'porque',
      'em nível de': '',
      'no sentido de': 'para',
      'a nível de': '',
      'com relação a': 'sobre',
      'de modo a': 'para',
      'tendo em vista que': 'pois',
      'por meio de': 'por',
      'no que tange a': 'sobre',
      'em função de': 'por',
      'fazer a verificação': 'verificar',
      'dar início a': 'iniciar',
      'proceder à análise': 'analisar'
    };
  }

  function getWordyPhrasesRegexes() {
    var map = getWordyPhrasesMap();
    return Object.keys(map).map(function (phrase) {
      var safe = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var pattern = phrase.indexOf(' ') >= 0 ? safe : ('\\b' + safe + '\\b');
      return { re: new RegExp(pattern, 'gi'), suggestion: map[phrase] };
    });
  }

  function countWordyPhrases(text) {
    return getWordyPhrasesRegexes().reduce(function (sum, item) {
      var m = text.match(item.re);
      return sum + (m ? m.length : 0);
    }, 0);
  }

  function countHedges(text) {
    return getHedgeRegexes().reduce(function (sum, re) {
      var m = text.match(new RegExp(re.source, 'gi'));
      return sum + (m ? m.length : 0);
    }, 0);
  }

  function sentenceComplexityScore(sentence) {
    var s = String(sentence || '');
    var words = countWords(s);
    var commaClauses = (s.match(/[,:;]\s+/g) || []).length;
    var connectorClauses = LANG === 'en'
      ? (s.match(/\b(which|that|while|although|because|whereas|however)\b/gi) || []).length
      : (s.match(/\b(que|enquanto|embora|porque|pois|contudo|entretanto)\b/gi) || []).length;
    return (words >= 28 ? 2 : words >= 20 ? 1 : 0) + commaClauses + connectorClauses;
  }

  function countComplexSentences(sentences) {
    return sentences.filter(function (s) { return sentenceComplexityScore(s) >= 3; }).length;
  }

  function getSentenceStartRepeats(sentences) {
    var freq = {};
    sentences.forEach(function (s) {
      var tokens = (s.match(LANG === 'en' ? /\b[a-z]{2,}\b/gi : /\b[a-záéíóúàâêôãõüçñ]{2,}\b/gi) || [])
        .map(normalizeWord)
        .filter(function (w) { return !STOP_WORDS.has(w) && !shouldIgnoreWord(w); });
      if (!tokens.length) return;
      var key = tokens.slice(0, Math.min(2, tokens.length)).join(' ');
      if (!key) return;
      freq[key] = (freq[key] || 0) + 1;
    });

    return Object.keys(freq)
      .filter(function (k) { return freq[k] >= 2; })
      .sort(function (a, b) { return freq[b] - freq[a]; })
      .map(function (k) { return { start: k, count: freq[k] }; });
  }

  function countEmphaticPunctuation(text) {
    return (String(text || '').match(/[!?](?:[!?]+)/g) || []).length;
  }

  function getUndefinedAcronyms(sentences) {
    var defined = new Set();
    var freq = {};
    var defTermFirstRe = /\b([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\-]*(?:\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\-]*){1,8})\s+\(([A-Z]{2,})\)/g;
    var defAcrFirstRe = /\b([A-Z]{2,})\s*\(([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\-]*(?:\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\-]*){1,8})\)/g;
    var acrRe = /\b[A-Z]{2,}s?\b/g;

    sentences.forEach(function (sentence) {
      var s = String(sentence || '');
      var m;
      while ((m = defTermFirstRe.exec(s)) !== null) {
        defined.add(m[2]);
      }
      defTermFirstRe.lastIndex = 0;

      while ((m = defAcrFirstRe.exec(s)) !== null) {
        defined.add(m[1]);
      }
      defAcrFirstRe.lastIndex = 0;

      while ((m = acrRe.exec(s)) !== null) {
        var acr = m[0].replace(/s$/, '');
        if (!defined.has(acr)) {
          freq[acr] = (freq[acr] || 0) + 1;
        }
      }
      acrRe.lastIndex = 0;
    });

    return Object.keys(freq)
      .sort(function (a, b) { return freq[b] - freq[a]; })
      .map(function (k) { return { acronym: k, count: freq[k] }; });
  }

  function getColloquialTerms() {
    if (LANG === 'en') {
      return [
        'a lot', 'lots of', 'kind of', 'sort of', 'pretty much', 'huge', 'super',
        'really', 'basically', 'stuff', 'thing', 'cool', 'awesome'
      ];
    }
    return [
      'tipo', 'meio que', 'muito', 'bem', 'coisa', 'coisas', 'super', 'enorme',
      'legal', 'bacana', 'pra', 'tá', 'né', 'cara'
    ];
  }

  function countColloquialisms(text) {
    var source = String(text || '').toLowerCase();
    return getColloquialTerms().reduce(function (sum, term) {
      var safe = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var re = term.indexOf(' ') >= 0 ? new RegExp(safe, 'gi') : new RegExp('\\b' + safe + '\\b', 'gi');
      var m = source.match(re);
      return sum + (m ? m.length : 0);
    }, 0);
  }

  function countVagueQuantifiers(text) {
    var src = String(text || '');
    var terms = LANG === 'pt'
      ? ['muitos', 'muitas', 'vários', 'várias', 'alguns', 'algumas', 'poucos', 'poucas',
         'diversos', 'diversas', 'numerosos', 'numerosas', 'inúmeros', 'inúmeras',
         'bastante', 'bastantes', 'certos', 'certas', 'determinados', 'determinadas']
      : ['many', 'several', 'few', 'various', 'numerous', 'some', 'certain',
         'a number of', 'a variety of', 'a range of', 'multiple', 'considerable',
         'substantial', 'significant number'];
    var count = 0;
    terms.forEach(function (term) {
      var safe = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var re = term.indexOf(' ') >= 0 ? new RegExp(safe, 'gi') : new RegExp('\\b' + safe + '\\b', 'gi');
      var m;
      var re2 = new RegExp(re.source, 'gi');
      while ((m = re2.exec(src)) !== null) {
        // skip if immediately preceded or followed by a digit (e.g. "3 various" is fine)
        var before = src.slice(Math.max(0, m.index - 10), m.index);
        var after = src.slice(m.index + m[0].length, m.index + m[0].length + 10);
        if (!/\d/.test(before.slice(-3)) && !/^\s*\d/.test(after)) count++;
      }
    });
    return count;
  }

  function countEvidenceMarkers(text) {
    var src = String(text || '');
    var numberLike = src.match(/\b\d+(?:[\.,]\d+)?\b/g) || [];
    var percent = src.match(/\b\d+(?:[\.,]\d+)?\s*%\b/g) || [];
    var units = src.match(/\b\d+(?:[\.,]\d+)?\s*(?:mg|g|kg|ml|l|cm|mm|nm|ha|m\/?s|\u00b0c|kpa|pa|ppm|ppb)\b/gi) || [];
    var citations = src.match(/\((?:[^)]*\d{4}[^)]*)\)|\[[0-9,\-\s]+\]|@\w+/g) || [];
    return numberLike.length + percent.length + units.length + citations.length;
  }
