// src/analysis/section.js — Section classification, goals, scoring and section rhythm data.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

  function isMethodsTitle(title) {
    var t = title.toLowerCase();
    return LANG === 'en'
      ? /\b(method|methods|materials)\b/.test(t)
      : /\b(m[eé]todo|m[eé]todos|material|materiais)\b/.test(t);
  }

  function isIntroductionTitle(title) {
    var t = normalizeSectionName(title);
    return LANG === 'en' ? /\bintroduction\b/.test(t) : /\bintroducao\b/.test(t);
  }

  function isDiscussionTitle(title) {
    var t = normalizeSectionName(title);
    return LANG === 'en' ? /\bdiscussion\b/.test(t) : /\bdiscussao\b/.test(t);
  }

  function isResultsTitle(title) {
    var t = normalizeSectionName(title);
    return LANG === 'en' ? /\bresults\b/.test(t) : /\bresultados\b/.test(t);
  }

  function normalizeSectionName(title) {
    return (title || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getSectionGoal(sectionTitle) {
    var key = normalizeSectionName(sectionTitle);
    if (!key || !SECTION_GOALS) return null;

    if (SECTION_GOALS[key] && typeof SECTION_GOALS[key] === 'object') {
      return SECTION_GOALS[key];
    }

    var keys = Object.keys(SECTION_GOALS);
    for (var i = 0; i < keys.length; i++) {
      var cand = normalizeSectionName(keys[i]);
      if (!cand) continue;
      if (key === cand || key.indexOf(cand) !== -1 || cand.indexOf(key) !== -1) {
        return SECTION_GOALS[keys[i]];
      }
    }
    return null;
  }

  function evaluateSectionGoals(summary) {
    var goal = getSectionGoal(summary.title);
    if (!goal) return { count: 0, details: [] };
    var issues = [];

    function goalNum(name) {
      var v = goal[name];
      if (Array.isArray(v) && v.length > 0) v = v[0];
      if (v == null) return null;
      var n = Number(v);
      return isFinite(n) ? n : null;
    }

    var maxAvgSentence = goalNum('maxAvgSentence');
    var maxLongSentenceRate = goalNum('maxLongSentenceRate');
    var maxPassivePer1000 = goalNum('maxPassivePer1000');
    var minLexicalDiversity = goalNum('minLexicalDiversity');

    if (maxAvgSentence != null && summary.avgSentence > maxAvgSentence) {
      issues.push(L.avgSentence + ' > ' + maxAvgSentence + L.wSuffix);
    }
    if (maxLongSentenceRate != null && summary.longSentenceRate > maxLongSentenceRate) {
      issues.push(L.longSentenceRate + ' > ' + maxLongSentenceRate + '%');
    }
    if (maxPassivePer1000 != null && summary.passiveDensity > maxPassivePer1000) {
      issues.push(L.passiveDensity + ' > ' + maxPassivePer1000 + '/1000' + L.wSuffix);
    }
    if (minLexicalDiversity != null && summary.lexicalDiversity < minLexicalDiversity) {
      issues.push(L.docDiversity + ' < ' + Math.round(minLexicalDiversity * 100) + '%');
    }

    return { count: issues.length, details: issues };
  }

  function calcSectionScore(summary) {
    var score = 100;
    score -= Math.max(0, summary.avgSentence - 22) * 1.4;
    score -= Math.max(0, summary.avgParagraph - 170) * 0.06;
    score -= summary.longSentenceRate * 0.9;
    score -= summary.passiveDensity * 0.35;
    score -= Math.max(0, 0.6 - summary.lexicalDiversity) * 45;
    score -= summary.goalIssueCount * 6;
    return Math.max(0, Math.round(score));
  }

  function maxRepeatedCount(repeated) {
    var counts = Object.keys(repeated).map(function (k) { return repeated[k]; });
    return counts.length ? Math.max.apply(null, counts) : 0;
  }

  function getAlertReasons(stats, inMethods) {
    var reasons = [];
    if (stats.paraLong) reasons.push(L.reasonParaLong);
    if (stats.maxSentLen > SENT_LONG) reasons.push(L.reasonSentLong + ': ' + stats.maxSentLen + L.wSuffix);
    if (stats.lexDiv < LEX_LOW) reasons.push(L.reasonLexLow + ': ' + Math.round(stats.lexDiv * 100) + '%');
    if (maxRepeatedCount(stats.repeated) >= REPEATED_STRONG) reasons.push(L.reasonRepeat + ': ×' + maxRepeatedCount(stats.repeated));
    if (stats.passiveCount >= (inMethods ? METHODS_PASSIVE_ALERT : PASSIVE_ALERT)) {
      reasons.push(L.reasonPassive + ': ' + stats.passiveCount);
    }
    if ((stats.hedgeCount || 0) >= HEDGE_ALERT) {
      reasons.push(L.reasonHedge + ': ' + stats.hedgeCount);
    }
    if ((stats.wordyCount || 0) > 0) {
      reasons.push(L.reasonWordy + ': ' + stats.wordyCount);
    }
    if (stats.needsCitation && !stats.citationMarkers) {
      reasons.push(L.reasonFewCitations);
    }
    if (stats.resultsCitation && stats.citationMarkers > 0) {
      reasons.push(L.reasonResultsCitation + ': ' + stats.citationMarkers);
    }
    return reasons;
  }

  function hasParagraphAlert(stats, inMethods) {
    return getAlertReasons(stats, inMethods).length > 0;
  }

  function scaledBlocks(sections) {
    var BLOCKS = '▁▂▃▄▅▆▇█';
    if (sections.length === 0) return '';
    var values = sections.map(function (s) { return s.avgSentence; });
    var max = Math.max.apply(null, values);
    if (max === 0) return '';
    return sections.map(function (s, i) {
      var n = s.avgSentence;
      var block = BLOCKS[Math.min(7, Math.round((n / max) * 7))];
      var tone = n <= 17 ? 'low' : n <= 24 ? 'mid' : 'high';
      var sectionTitle = s.title || ('#' + (i + 1));
      var title = sectionTitle + ' • ' + round1(n) + L.wSuffix + '/' + L.sent + ' • ' + s.words + ' ' + L.words;
      return '<span class="ws-doc-rhythm-block ws-doc-rhythm-' + tone + '"' +
        (s.id ? ' data-ws-target="' + escapeHTML(s.id) + '"' : '') +
        ' data-ws-section-title="' + escapeHTML(sectionTitle) + '"' +
        ' title="' + escapeHTML(title.trim()) + '">' + block + '</span>';
    }).join('');
  }

  function sectionTypeFromTitle(title) {
    var t = normalizeSectionName(title);
    if (LANG === 'en') {
      if (/\babstract\b/.test(t)) return 'abstract';
      if (/\bintroduction\b/.test(t)) return 'introduction';
      if (/\b(method|methods|materials|methodology)\b/.test(t)) return 'methods';
      if (/\bresults\b/.test(t)) return 'results';
      if (/\bdiscussion\b/.test(t)) return 'discussion';
      if (/\b(conclusion|conclusions)\b/.test(t)) return 'conclusion';
      return 'other';
    }
    if (/\b(resumo|abstract)\b/.test(t)) return 'abstract';
    if (/\bintroducao\b/.test(t)) return 'introduction';
    if (/\b(metodo|metodos|material|materiais|metodologia)\b/.test(t)) return 'methods';
    if (/\bresultados\b/.test(t)) return 'results';
    if (/\bdiscussao\b/.test(t)) return 'discussion';
    if (/\b(conclusao|conclusoes)\b/.test(t)) return 'conclusion';
    return 'other';
  }

  function hasAnyPattern(text, patterns) {
    return (patterns || []).some(function (re) { return re.test(text); });
  }

  function analyzeSectionConceptCoverage(title, sectionText) {
    var raw = String(sectionText || '');
    var text = normalizeSectionName(raw);
    var sectionType = sectionTypeFromTitle(title);
    var checks = [];

    if (sectionType === 'introduction' || sectionType === 'abstract') {
      checks.push({
        label: L.conceptGap,
        ok: hasAnyPattern(text, LANG === 'en'
          ? [/\b(gap|unknown|unclear|remains unknown|little is known|not well understood)\b/]
          : [/\b(lacuna|desconhecid|nao se sabe|pouco se sabe|nao esta claro)\b/]),
      });
      checks.push({
        label: L.conceptObjective,
        ok: hasAnyPattern(text, LANG === 'en'
          ? [/\b(objective|aim|we hypothesize|hypothesis|this study investigates|this study evaluates|we tested)\b/]
          : [/\b(objetivo|hipotese|este estudo investig|este estudo avali|testamos|avaliamos)\b/]),
      });
      checks.push({
        label: L.conceptSignificance,
        ok: hasAnyPattern(text, LANG === 'en'
          ? [/\b(important|relevant|impact|implication|significance|clinical relevance|practical relevance)\b/]
          : [/\b(importante|relevante|impacto|implicac|significancia|relevancia clinica|relevancia pratica)\b/]),
      });
    }

    if (sectionType === 'methods') {
      checks.push({
        label: L.conceptDesign,
        ok: hasAnyPattern(text, LANG === 'en'
          ? [/\b(randomized|controlled|experimental design|study design|n\s*=|sample|replicate|participants)\b/]
          : [/\b(delineamento|desenho experimental|n\s*=|amostra|replic|participantes|controle|randomiz)\b/]),
      });
      checks.push({
        label: L.conceptReproducibility,
        ok: hasAnyPattern(text, LANG === 'en'
          ? [/\b(protocol|according to|as described|anova|regression|confidence interval|p\s*[<=>]|statistical analysis)\b/]
          : [/\b(protocolo|conforme|como descrito|anova|regress|intervalo de confianca|p\s*[<=>]|analise estatistica)\b/]),
      });
    }

    if (sectionType === 'results' || sectionType === 'abstract') {
      checks.push({
        label: L.conceptQuantResult,
        ok: hasAnyPattern(raw, LANG === 'en'
          ? [/\b\d+(?:[.,]\d+)?\b/, /\bp\s*[<=>]\s*0?\.?\d+/i, /\b\d+(?:[.,]\d+)?\s*(%|mg|g|kg|ml|l|mm|cm|m|s|min|h|days?)\b/i]
          : [/\b\d+(?:[.,]\d+)?\b/, /\bp\s*[<=>]\s*0?\.?\d+/i, /\b\d+(?:[.,]\d+)?\s*(%|mg|g|kg|ml|l|mm|cm|m|s|min|h|dias?)\b/i]),
      });
    }

    if (sectionType === 'discussion' || sectionType === 'conclusion') {
      checks.push({
        label: L.conceptInterpretation,
        ok: hasAnyPattern(text, LANG === 'en'
          ? [/\b(suggest|indicate|indicates|interpreted|interpretation|explain|explains)\b/]
          : [/\b(sugere|indica|indicam|interpret|explica|explicam)\b/]),
      });
      checks.push({
        label: L.conceptLimitations,
        ok: hasAnyPattern(text, LANG === 'en'
          ? [/\b(limitation|limitations|constraint|constraints|caution)\b/]
          : [/\b(limitac|restric|cautela)\b/]),
      });
      checks.push({
        label: L.conceptImplications,
        ok: hasAnyPattern(text, LANG === 'en'
          ? [/\b(implication|implications|future work|future studies|further research|therefore)\b/]
          : [/\b(implicac|estudos futuros|trabalhos futuros|pesquisas futuras|portanto)\b/]),
      });
    }

    if (!checks.length) {
      return {
        sectionType: sectionType,
        score: 100,
        missingCount: 0,
        missing: [],
      };
    }

    var okCount = checks.filter(function (c) { return c.ok; }).length;
    var missing = checks.filter(function (c) { return !c.ok; }).map(function (c) { return c.label; });
    var score = Math.round((okCount / checks.length) * 100);

    return {
      sectionType: sectionType,
      score: score,
      missingCount: missing.length,
      missing: missing,
    };
  }

  function sectionSummary(id, title, statsList, totalWords, sectionText) {
    var sentLens = [];
    var passive = 0;
    var longSentences = 0;
    var lexSum = 0;
    statsList.forEach(function (stats) {
      passive += stats.passiveCount;
      lexSum += stats.lexDiv;
      stats.sentences.forEach(function (sent) {
        var n = countWords(sent);
        if (n > 0) {
          sentLens.push(n);
          if (n > SENT_LONG) longSentences++;
        }
      });
    });
    var citationMarkers = statsList.reduce(function (sum, stats) { return sum + (stats.citationMarkers || 0); }, 0);
    var citationKeys = statsList.reduce(function (sum, stats) { return sum + (stats.citationKeyCount || 0); }, 0);
    var summary = {
      id: id,
      title: title,
      text: sectionText || '',
      words: totalWords,
      paras: statsList.length,
      sentences: sentLens.length,
      passive: passive,
      citationMarkers: citationMarkers,
      citationKeys: citationKeys,
      longSentences: longSentences,
      avgSentence: mean(sentLens),
      avgParagraph: mean(statsList.map(function (stats) { return stats.wordCount; })),
      lexicalDiversity: statsList.length ? (lexSum / statsList.length) : 1,
      isMethods: isMethodsTitle(title),
    };

    var secSentences = getSentences(sectionText || '');
    var secNlp = analyzeScientificNlp(sectionText || '', secSentences);
    summary.nlpNounDensity = secNlp.nounDensity || 0;
    summary.nlpEntityDensity = secNlp.entityDensity || 0;
    summary.nlpEntityOverload = secNlp.entityOverloadCount || 0;
    summary.nlpActionVerbScore = secNlp.actionVerbScore || 0;
    summary.nlpPatternRepeats = secNlp.sentencePatternRepeatCount || 0;
    summary.nlpSemanticRedundancy = secNlp.semanticRedundancyPct || 0;
    summary.nlpFlowScore = secNlp.flowScore || 0;
    summary.nlpTermDrift = secNlp.termDriftCount || 0;
    summary.nlpTenseProfile = secNlp.tenseProfile || { past: 0, present: 0, future_modal: 0, other: 0 };
    summary.nlpPosNounStacks = secNlp.nounStackCount || 0;
    var concept = analyzeSectionConceptCoverage(title, sectionText || '');
    summary.sectionType = concept.sectionType;
    summary.conceptCoverage = concept.score;
    summary.conceptMissingCount = concept.missingCount;
    summary.conceptMissing = concept.missing;

    summary.passiveDensity = summary.words ? (summary.passive / summary.words) * 1000 : 0;
    summary.longSentenceRate = summary.sentences ? (summary.longSentences / summary.sentences) * 100 : 0;
    var goals = evaluateSectionGoals(summary);
    summary.goalIssueCount = goals.count;
    summary.goalIssues = goals.details;
    summary.score = calcSectionScore(summary);
    return summary;
  }

  function buildDiagnostics(sections, passiveTotal, longSentenceRate) {
    if (sections.length === 0) return '';

    var rhythm = scaledBlocks(sections);
    var methodPassive = sections
      .filter(function (s) { return s.isMethods; })
      .reduce(function (sum, s) { return sum + s.passive; }, 0);
    var passiveRatio = passiveTotal > 0 ? methodPassive / passiveTotal : 0;

    var dense = sections
      .slice()
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, 2);

    var passiveNote = passiveRatio >= 0.45 ? L.passiveExpected : L.passiveSpread;
    var denseText = dense.length
      ? dense.map(function (s) { return escapeHTML(s.title) + ' (' + s.score + '/100)'; }).join(', ')
      : L.noDenseSections;

    return '<div class="ws-doc-diagnostics">' +
      '<div><span>' + L.rhythm + '</span><strong class="ws-doc-rhythm">' + rhythm + '</strong></div>' +
      '<div><span>' + L.denseSections + '</span><strong>' + denseText + '</strong></div>' +
      '<div><span>' + L.longSentenceRate + '</span><strong>' + round1(longSentenceRate) + '%</strong></div>' +
      '<div><span>' + L.passive + '</span><strong>' + passiveNote + '</strong></div>' +
      '</div>';
  }
