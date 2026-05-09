// src/detect/vocabulary.js — Terminology variants, abstract coverage and sentence-level similarity helpers.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

  function getTerminologyVariants(text) {
    var RE = LANG === 'en' ? /\b[a-z]{6,}\b/gi : /\b[a-záéíóúàâêôãõüçñ]{6,}\b/gi;
    var bucket = {};

    function lemma(w) {
      var s = stripDiacritics(normalizeWord(w));
      if (LANG === 'en') {
        return s.replace(/(ies|es|s)$/i, '');
      }
      return s
        .replace(/(coes|s)$/i, '')
        .replace(/(oes)$/i, 'ao');
    }

    function numberNeutralForm(w) {
      var s = normalizeWord(w);
      if (LANG === 'en') {
        return s
          .replace(/ies$/i, 'y')
          .replace(/(?:ches|shes|xes|zes|ses)$/i, function (m) { return m.slice(0, -2); })
          .replace(/s$/i, '');
      }
      return s
        .replace(/ções$/i, 'ção')
        .replace(/sões$/i, 'são')
        .replace(/ães$/i, 'ão')
        .replace(/ões$/i, 'ão')
        .replace(/s$/i, '');
    }

    function hasNonNumberVariation(forms) {
      var normalized = new Set(forms.map(numberNeutralForm));
      return normalized.size >= 2;
    }

    (String(text || '').match(RE) || []).forEach(function (w) {
      var low = normalizeWord(w);
      if (STOP_WORDS.has(low) || shouldIgnoreWord(low)) return;
      var key = lemma(low);
      if (!bucket[key]) bucket[key] = { forms: {}, count: 0 };
      bucket[key].forms[low] = true;
      bucket[key].count += 1;
    });

    return Object.keys(bucket)
      .map(function (k) {
        return {
          base: k,
          forms: Object.keys(bucket[k].forms),
          count: bucket[k].count,
        };
      })
      .filter(function (x) { return x.forms.length >= 2 && x.count >= 3 && hasNonNumberVariation(x.forms); })
      .sort(function (a, b) { return b.count - a.count; });
  }

  function isAbstractLikeTitle(title) {
    var t = normalizeSectionName(title);
    return LANG === 'en'
      ? /\babstract\b/.test(t)
      : /\bresumo\b|\bresumo\s+expandido\b/.test(t);
  }

  function getAbstractCoverage(sectionSummaries) {
    var abs = (sectionSummaries || []).find(function (s) { return isAbstractLikeTitle(s.title || ''); });
    if (!abs || !abs.text) {
      return { score: 0, found: [], missing: [] };
    }

    var text = normalizeWord(abs.text);
    var checks = LANG === 'en'
      ? {
          objective: /\b(aim|objective|purpose|this study)\b/,
          method: /\b(method|methods|we (used|evaluated|analyzed)|experiment)\b/,
          result: /\b(result|results|found|showed|observed)\b/,
          conclusion: /\b(conclusion|conclude|therefore|in summary)\b/
        }
      : {
          objective: /\b(objetivo|visa|este estudo)\b/,
          method: /\b(metodo|metodos|foram avaliados|foi realizado|experimento)\b/,
          result: /\b(resultado|resultados|observou|mostrou|indicou)\b/,
          conclusion: /\b(conclusao|conclui|portanto|em resumo)\b/
        };

    var found = [];
    var missing = [];
    Object.keys(checks).forEach(function (k) {
      if (checks[k].test(text)) found.push(k);
      else missing.push(k);
    });

    return {
      score: Math.round((found.length / 4) * 100),
      found: found,
      missing: missing,
    };
  }
