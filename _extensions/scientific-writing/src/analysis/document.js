// src/analysis/document.js — Document-level metrics, report export and metric wiring.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

  function analysisModeLabel(mode) {
    return mode === 'worker' ? L.analysisWorker : L.analysisSync;
  }

  function analysisBadgeText() {
    return L.analysisEngine + ': ' + analysisModeLabel(ANALYSIS_TELEMETRY.mode) +
      ' • ' + L.analysisTime + ' ' + Math.max(0, Math.round(ANALYSIS_TELEMETRY.durationMs)) + 'ms';
  }

  function buildDocStats(root, totalWords, statsList, sections, docText, winkStats) {
    if (totalWords === 0) return;
    winkStats = winkStats || {};
    var minutes = Math.max(1, Math.round(totalWords / READ_WPM));

    var sentenceLengths = [];
    statsList.forEach(function (stats) {
      stats.sentences.forEach(function (sent) {
        var n = countWords(sent);
        if (n > 0) sentenceLengths.push(n);
      });
    });

    var paraLengths = statsList.map(function (stats) { return stats.wordCount; });
    var maxSentLen = sentenceLengths.length ? Math.max.apply(null, sentenceLengths) : 0;
    var passiveTotal = statsList.reduce(function (sum, stats) { return sum + stats.passiveCount; }, 0);
    var sentVar = variance(sentenceLengths);
    var sentStd = Math.sqrt(sentVar);
    var lexDiv = Math.round(getLexDiv(docText) * 100);
    var passiveDensity = totalWords ? (passiveTotal / totalWords) * 1000 : 0;
    var longSentenceCount = sentenceLengths.filter(function (n) { return n > SENT_LONG; }).length;
    var longSentenceRate = sentenceLengths.length ? (longSentenceCount / sentenceLengths.length) * 100 : 0;
    var globalRepeatedItems = getGlobalRepeatedItems(docText, 3, 0);
    var topRepeated = globalRepeatedItems.slice(0, 5).map(function (item) {
      return item.text + ' ×' + item.count;
    });
    var repeatedTermCount = globalRepeatedItems.length;
    var longParagraphCount = statsList.filter(function (stats) { return stats.paraLong; }).length;
    var citationGapCount = statsList.filter(function (stats) {
      return stats.needsCitation && !stats.citationMarkers;
    }).length;
    var resultsCitationCount = statsList.filter(function (stats) {
      return stats.resultsCitation && stats.citationMarkers > 0;
    }).length;
    var connectorCount = countConnectors(docText);
    var connectorByCat = countConnectorCategories(docText);
    var nominalizationCount = countNominalizations(docText);
    var totalSyllables = statsList.reduce(function (sum, stats) { return sum + (stats.syllableCount || 0); }, 0);
    var complexWordCount = statsList.reduce(function (sum, stats) { return sum + (stats.complexWordCount || 0); }, 0);
    var hedgeCount = statsList.reduce(function (sum, stats) { return sum + (stats.hedgeCount || 0); }, 0);
    var wordyCount = statsList.reduce(function (sum, stats) { return sum + (stats.wordyCount || 0); }, 0);
    var complexSentenceCount = statsList.reduce(function (sum, stats) { return sum + (stats.complexSentenceCount || 0); }, 0);
    var allSentences = statsList.reduce(function (all, stats) { return all.concat(stats.sentences || []); }, []);
    var undefinedAcronyms = getUndefinedAcronyms(allSentences);
    var readability = computeReadability(totalWords, allSentences.length, totalSyllables, complexWordCount);
    var emphaticPunct = countEmphaticPunctuation(docText);
    var evidenceDetailed = countEvidenceDetailed(root, docText);
    var evidenceCited = evidenceDetailed.cited;
    var evidenceHardcoded = evidenceDetailed.hardcoded;
    var evidenceParameterized = evidenceDetailed.parameterized;
    var evidenceUnparameterized = evidenceDetailed.unparameterized;
    var evidenceMarkers = evidenceCited + evidenceHardcoded;
    var evidenceDensity = totalWords ? (evidenceMarkers / totalWords) * 1000 : 0;
    var varUsage = VARIABLE_COUNT > 0 ? getVariableUsage(root) : { used: [], unused: [] };
    var usedVarCount = varUsage.used.length;
    var termVariants = getTerminologyVariants(docText);
    var cohesionGaps = countCohesionGaps(statsList.map(function (s) { return s.text || ''; }).filter(Boolean));
    var abstractCoverage = getAbstractCoverage(sections);
    var colloquialCount = countColloquialisms(docText);
    var vagueCount = countVagueQuantifiers(docText);
    var noVerbCount = statsList.reduce(function (sum, stats) {
      return sum + (stats.noVerbCount || 0);
    }, 0);
    var hedgeDensity = totalWords ? (hedgeCount / totalWords) * 1000 : 0;
    var complexSentenceRate = allSentences.length ? (complexSentenceCount / allSentences.length) * 100 : 0;
    var pronounAmbigCount = getPronounAmbiguities(allSentences);
    var modalVerbCount = root.querySelectorAll('.ws-modal').length;
    var firstPersonCount = countFirstPerson(docText);
    var allParaTexts = statsList.map(function (s) { return s.text || ''; }).filter(Boolean);
    var paraOpeningRepeats = getParaOpeningRepeats(allParaTexts);
    var repeatedStarts = paraOpeningRepeats.map(function (item) {
      return { start: item.word, count: item.count };
    });
    var citationSentStartCount = countCitationSentStart(allSentences);
    var citationSentEndCount = countCitationSentEnd(allSentences);
    var abstractWordCount = getAbstractWordCount(sections);
    var unitInconsistency = getUnitInconsistency(docText);
    var italicTextCount = root.querySelectorAll('.ws-wrapper p .ws-italic-text').length;
    var sectionBalance = getSectionBalance(sections);
    var referenceUsage = getReferenceUsage(root);
    var crossRefUsage = getCrossRefUsage(root);
    var doiValidationData = (window.WritingStatsConfig || {}).doiValidation || {};
    var doiKeys = Object.keys(doiValidationData);
    var doiTotal = doiKeys.length;
    var doiWithError = doiKeys.filter(function (doi) {
      return doiValidationData[doi].some(function (r) { return r.status === 'error'; });
    }).length;
    var doiWithWarn = doiKeys.filter(function (doi) {
      return !doiValidationData[doi].some(function (r) { return r.status === 'error'; }) &&
             doiValidationData[doi].some(function (r) { return r.status === 'warn'; });
    }).length;
    var doiOk = doiTotal - doiWithError - doiWithWarn;
    var avgSectionScore = sections.length
      ? Math.round(sections.reduce(function (sum, s) { return sum + (s.score || 0); }, 0) / sections.length)
      : 0;
    var conceptCoverageAvg = sections.length
      ? Math.round(sections.reduce(function (sum, s) { return sum + (s.conceptCoverage || 0); }, 0) / sections.length)
      : 0;
    var conceptMissingTotal = sections.reduce(function (sum, s) { return sum + (s.conceptMissingCount || 0); }, 0);
    var conceptWeakSections = sections
      .filter(function (s) { return (s.conceptCoverage || 100) < 60; })
      .map(function (s) { return s.title; })
      .slice(0, 5);
    var nlpTotals = statsList.reduce(function (acc, stats) {
      var n = stats.nlpStats || {};
      acc.nounCount += n.nounCount || 0;
      acc.verbCount += n.verbCount || 0;
      acc.adverbCount += n.adverbCount || 0;
      acc.topicCount += n.topicCount || 0;
      acc.entityCount += n.entityCount || 0;
      acc.dateValueCount += n.dateValueCount || 0;
      acc.nominalLoadCount += n.nominalLoadCount || 0;
      acc.weakVerbCount += n.weakVerbCount || 0;
      acc.nounStackCount += n.nounStackCount || 0;
      acc.entityOverloadCount += n.entityOverloadCount || 0;
      acc.sentencePatternRepeatCount += n.sentencePatternRepeatCount || 0;
      acc.termDriftCount += n.termDriftCount || 0;
      acc.verbInstances += n.verbCount || 0;
      acc.verbDiversitySum += (n.verbDiversity || 0) * (n.verbCount || 0);
      acc.actionVerbScoreSum += n.actionVerbScore || 0;
      acc.actionVerbScoreN += 1;
      acc.semanticRedundancySum += n.semanticRedundancyPct || 0;
      acc.semanticRedundancyN += 1;
      acc.flowScoreSum += n.flowScore || 0;
      acc.flowScoreN += 1;
      var tp = n.tenseProfile || {};
      acc.tenseProfile.past += tp.past || 0;
      acc.tenseProfile.present += tp.present || 0;
      acc.tenseProfile.future_modal += tp.future_modal || 0;
      acc.tenseProfile.other += tp.other || 0;
      acc.contractionCount += n.contractionCount || 0;
      acc.questionCount += n.questionCount || 0;

      (n.keyTerms || []).forEach(function (term) {
        var parts = String(term).split(/\s+\xd7/);
        var key = parts[0];
        var count = Number(parts[1]) || 1;
        if (key) acc.keyTerms[key] = (acc.keyTerms[key] || 0) + count;
      });
      ['topics', 'people', 'organizations', 'places', 'dates', 'values', 'adverbs'].forEach(function (name) {
        (n[name] || []).forEach(function (item) {
          var key = item.text;
          if (key) acc[name][key] = (acc[name][key] || 0) + (Number(item.count) || 1);
        });
      });
      return acc;
    }, {
      nounCount: 0, verbCount: 0, adverbCount: 0, topicCount: 0, entityCount: 0, dateValueCount: 0,
      nominalLoadCount: 0, weakVerbCount: 0, nounStackCount: 0, entityOverloadCount: 0,
      sentencePatternRepeatCount: 0, termDriftCount: 0,
      verbInstances: 0, verbDiversitySum: 0,
      actionVerbScoreSum: 0, actionVerbScoreN: 0,
      semanticRedundancySum: 0, semanticRedundancyN: 0,
      flowScoreSum: 0, flowScoreN: 0,
      tenseProfile: { past: 0, present: 0, future_modal: 0, other: 0 },
      contractionCount: 0, questionCount: 0,

      keyTerms: {}, topics: {}, people: {}, organizations: {}, places: {}, dates: {}, values: {}, adverbs: {}
    });
    function topNlpMap(map, limit) {
      return Object.keys(map)
        .sort(function (a, b) { return map[b] - map[a] || a.localeCompare(b); })
        .slice(0, limit || 6)
        .map(function (k) { return { text: k, count: map[k] }; });
    }
    var nlpKeyTerms = Object.keys(nlpTotals.keyTerms)
      .sort(function (a, b) { return nlpTotals.keyTerms[b] - nlpTotals.keyTerms[a] || a.localeCompare(b); })
      .slice(0, 6)
      .map(function (k) { return k + ' \xd7' + nlpTotals.keyTerms[k]; });
    var nlpTopics = displayNlpItems(topNlpMap(nlpTotals.topics, 6));
    var entityMap = {};
    [nlpTotals.people, nlpTotals.organizations, nlpTotals.places].forEach(function (src) {
      Object.keys(src).forEach(function (k) { entityMap[k] = (entityMap[k] || 0) + src[k]; });
    });
    var nlpEntities = displayNlpItems(topNlpMap(entityMap, 6));
    var nlpAdverbs = displayNlpItems(topNlpMap(nlpTotals.adverbs, 6));
    var nlpNounVerbRatio = nlpTotals.verbCount ? nlpTotals.nounCount / nlpTotals.verbCount : nlpTotals.nounCount ? nlpTotals.nounCount : 0;
    var nlpVerbDiversity = nlpTotals.verbInstances ? nlpTotals.verbDiversitySum / nlpTotals.verbInstances : 1;
    var nlpNounDensity = totalWords ? Math.round((nlpTotals.nounCount / totalWords) * 1000) / 10 : 0;
    var nlpEntityDensity = totalWords ? Math.round((nlpTotals.entityCount / totalWords) * 1000) / 10 : 0;
    var nlpActionVerbScore = nlpTotals.actionVerbScoreN ? Math.round((nlpTotals.actionVerbScoreSum / nlpTotals.actionVerbScoreN) * 10) / 10 : 100;
    var nlpSemanticRedundancy = nlpTotals.semanticRedundancyN ? Math.round((nlpTotals.semanticRedundancySum / nlpTotals.semanticRedundancyN) * 10) / 10 : 0;
    var nlpFlowScore = nlpTotals.flowScoreN ? Math.round((nlpTotals.flowScoreSum / nlpTotals.flowScoreN) * 10) / 10 : 0;
    var tense = nlpTotals.tenseProfile;
    var tenseTotal = (tense.past || 0) + (tense.present || 0) + (tense.future_modal || 0) + (tense.other || 0);
    var nlpTenseProfileText = tenseTotal
      ? ('PST ' + Math.round((tense.past / tenseTotal) * 100) + '% | PRS ' + Math.round((tense.present / tenseTotal) * 100) + '% | FUT/MOD ' + Math.round((tense.future_modal / tenseTotal) * 100) + '%')
      : '—';
    var nlpStatusLabel = NLP_STATUS === 'loaded'
      ? L.nlpLoaded
      : NLP_STATUS === 'disabled'
        ? L.nlpDisabled
        : NLP_STATUS === 'unavailable'
          ? L.nlpUnavailable
          : L.nlpFallback;

    window.WritingStatsReport = {
      words: totalWords,
      readMinutes: minutes,
      avgSentence: round1(mean(sentenceLengths)),
      sentenceVariance: round1(sentVar),
      sentenceStdDev: round1(sentStd),
      avgParagraph: round1(mean(paraLengths)),
      longestSentence: maxSentLen,
      lexicalDiversity: lexDiv,
      passiveTotal: passiveTotal,
      passiveDensity: round1(passiveDensity),
      longSentenceRate: round1(longSentenceRate),
      topRepeated: topRepeated,
      repeatedTermCount: repeatedTermCount,
      longParagraphCount: longParagraphCount,
      citationGapCount: citationGapCount,
      resultsCitationCount: resultsCitationCount,
      connectors: connectorCount,
      connectorByCat: connectorByCat,
      nominalizations: nominalizationCount,
      readabilityFlesch: readability.flesch,
      readabilityGrade: readability.grade,
      readabilityFog: readability.fog,
      complexSentences: complexSentenceCount,
      complexSentenceRate: round1(complexSentenceRate),
      hedges: hedgeCount,
      hedgeDensity: round1(hedgeDensity),
      undefinedAcronyms: undefinedAcronyms,
      emphaticPunct: emphaticPunct,
      evidenceMarkers: evidenceMarkers,
      evidenceCited: evidenceCited,
      evidenceHardcoded: evidenceHardcoded,
      evidenceParameterized: evidenceParameterized,
      evidenceUnparameterized: evidenceUnparameterized,
      usedVarCount: usedVarCount,
      variableCount: VARIABLE_COUNT,
      evidenceDensity: round1(evidenceDensity),
      termVariants: termVariants,
      cohesionGaps: cohesionGaps,
      abstractCoverage: abstractCoverage,
      colloquialCount: colloquialCount,
      repeatedStarts: repeatedStarts,
      noClearVerb: noVerbCount,
      avgSectionScore: avgSectionScore,
      conceptCoverageAvg: conceptCoverageAvg,
      conceptMissingTotal: conceptMissingTotal,
      conceptWeakSections: conceptWeakSections,
      pronounAmbigCount: pronounAmbigCount,
      modalVerbCount: modalVerbCount,
      firstPersonCount: firstPersonCount,
      paraOpeningRepeats: paraOpeningRepeats,
      citationSentStartCount: citationSentStartCount,
      citationSentEndCount: citationSentEndCount,
      abstractWordCount: abstractWordCount,
      unitInconsistency: unitInconsistency,
      sectionBalance: sectionBalance,
      referencesDefined: referenceUsage.defined,
      referencesUsed: referenceUsage.used.length,
      referencesUnused: referenceUsage.unused,
      citationsTotal: referenceUsage.markerCount,
      figuresTotal: crossRefUsage.figureCount,
      figureCrossRefs: crossRefUsage.figureReferenced,
      figureCrossRefsMissing: crossRefUsage.figureMissing,
      figureRefOrderIssues: crossRefUsage.figureOrder.count,
      figureRefOrderExamples: crossRefUsage.figureOrder.examples,
      tablesTotal: crossRefUsage.tableCount,
      tableCrossRefs: crossRefUsage.tableReferenced,
      tableCrossRefsMissing: crossRefUsage.tableMissing,
      tableRefOrderIssues: crossRefUsage.tableOrder.count,
      tableRefOrderExamples: crossRefUsage.tableOrder.examples,
      nlpStatus: NLP_STATUS,
      nlpNounVerbRatio: round1(nlpNounVerbRatio),
      nlpNounDensity: nlpNounDensity,
      nlpEntityDensity: nlpEntityDensity,
      nlpVerbDiversity: round1(nlpVerbDiversity * 100),
      nlpNominalLoadCount: nlpTotals.nominalLoadCount,
      nlpWeakVerbCount: nlpTotals.weakVerbCount,
      nlpNounStackCount: nlpTotals.nounStackCount,
      nlpEntityOverloadCount: nlpTotals.entityOverloadCount,
      nlpActionVerbScore: nlpActionVerbScore,
      nlpSentencePatternRepeatCount: nlpTotals.sentencePatternRepeatCount,
      nlpSemanticRedundancy: nlpSemanticRedundancy,
      nlpFlowScore: nlpFlowScore,
      nlpTermDriftCount: nlpTotals.termDriftCount,
      nlpTenseProfile: nlpTotals.tenseProfile,
      nlpTenseProfileText: nlpTenseProfileText,
      nlpKeyTerms: nlpKeyTerms,
      nlpTopicCount: nlpTotals.topicCount,
      nlpTopics: nlpTopics,
      nlpEntityCount: nlpTotals.entityCount,
      nlpEntities: nlpEntities,
      nlpDateValueCount: nlpTotals.dateValueCount,
      nlpAdverbCount: nlpTotals.adverbCount,
      nlpAdverbs: nlpAdverbs,
      nlpContractionCount: nlpTotals.contractionCount,
      nlpQuestionCount: nlpTotals.questionCount,
      winkAvailable: !!winkStats.winkAvailable,
      winkStatus: WINK_STATUS,
      winkReadingEase: winkStats.fleschReadingEase,
      winkGradeLevel: winkStats.fleschKincaidGrade,
      winkAvgWordsPerSentence: winkStats.avgWordsPerSentence,
      winkReadingTimeSecs: winkStats.readingTimeSecs || 0,
      winkComplexWordCount: winkStats.complexWordCount || 0,
      winkComplexWords: displayNlpItems((winkStats.complexWords || []).slice(0, 6)),
      winkModalCount: winkStats.modalCount || 0,
      winkModalTerms: displayNlpItems((winkStats.modalTerms || []).slice(0, 6)),
      winkPronounCount: winkStats.pronounCount || 0,
      winkPronounTerms: displayNlpItems((winkStats.pronounTerms || []).slice(0, 6)),
      winkPronounDensity: winkStats.pronounDensity || 0,
      winkAuxiliaryCount: winkStats.auxiliaryCount || 0,
      winkAuxiliaryTerms: displayNlpItems((winkStats.auxiliaryTerms || []).slice(0, 6)),
      winkAuxiliaryVerbRatio: winkStats.auxiliaryVerbRatio || 0,
      winkNumericTokenCount: winkStats.numericTokenCount || 0,
      winkNumericTerms: displayNlpItems((winkStats.numericTerms || []).slice(0, 6)),
      winkNumericTokenDensity: winkStats.numericTokenDensity || 0,
      winkLexicalDensity: winkStats.lexicalDensity || 0,
      winkProperNounCount: winkStats.properNounCount || 0,
      winkProperNounTerms: displayNlpItems((winkStats.properNounTerms || []).slice(0, 6)),
      winkProperNounDensity: winkStats.properNounDensity || 0,

      winkPassiveSentenceCount: winkStats.passiveSentenceCount || 0,
      sections: sections,
    };

    var badge = document.createElement('div');
    badge.className = 'ws-doc-stats';
    badge.innerHTML =
      '<span class="ws-doc-time">~' + minutes + ' ' + L.readTime + '</span>' +
      '<span class="ws-doc-dot">\xb7</span>' +
      '<span>' + totalWords + ' ' + L.words + '</span>' +
      '<span class="ws-doc-dot">\xb7</span>' +
      '<span class="ws-doc-engine" title="' + escapeHTML(analysisBadgeText()) + '">' +
        escapeHTML(analysisBadgeText()) +
      '</span>';

    var rhythmHtml = sections.length > 0 ? scaledBlocks(sections) : '—';
    var methodPassiveCount = sections
      .filter(function (s) { return s.isMethods; })
      .reduce(function (sum, s) { return sum + s.passive; }, 0);
    var passiveDistribRatio = passiveTotal > 0 ? methodPassiveCount / passiveTotal : 0;
    var passiveDistribNote = passiveDistribRatio >= 0.45 ? L.passiveExpected : L.passiveSpread;
    var denseSectionsList = sections.slice().sort(function (a, b) { return b.score - a.score; }).slice(0, 2);
    var denseText = denseSectionsList.length
      ? denseSectionsList.map(function (s) { return escapeHTML(s.title) + ' (' + s.score + '/100)'; }).join(', ')
      : L.noDenseSections;

    var metrics = document.createElement('div');
    metrics.className = 'ws-doc-metrics';
    metrics.innerHTML =
      // ── Frases ──────────────────────────────────────────────────────────────
      metricGroup(L.groupSentences) +
      metricItem(L.avgSentence, round1(mean(sentenceLengths)) + L.wSuffix, null, L.avgSentenceDesc) +
      metricItem(L.sentenceVar, round1(sentVar) + ' / σ ' + round1(sentStd) + L.wSuffix, null, L.sentenceVarDesc) +
      metricItem(L.longestSentence, maxSentLen + L.wSuffix, 'long', L.longestSentenceDesc) +
      metricItem(L.longSentenceRate, round1(longSentenceRate) + '%', 'long', L.longSentRateDesc) +
      metricItem(L.complexSent, complexSentenceCount + ' (' + round1(complexSentenceRate) + '%)', 'complexsent', L.complexSentDesc) +
      metricItem(L.noVerb, noVerbCount, 'noverb', L.noVerbDesc) +
      // ── Parágrafos & Seções ──────────────────────────────────────────────────
      metricGroup(L.groupParagraphs) +
      metricItem(L.avgParagraph, round1(mean(paraLengths)) + L.wSuffix, null, L.avgParagraphDesc) +
      metricItem(L.longParagraphs, longParagraphCount, 'paragraph-long', L.longParagraphsDesc) +
      metricItem(L.paraOpeningRepeat, paraOpeningRepeats.length ? paraOpeningRepeats.slice(0, 3).map(function (x) { return x.word + ' \xd7' + x.count; }).join(', ') : '0', null, L.paraOpeningRepeatDesc) +
      metricItem(L.cohesionGaps, cohesionGaps, 'cohesion', L.cohesionGapsDesc) +
      metricItem(L.sectionScore, avgSectionScore + '/100', null, L.sectionScoreDesc) +
      metricItem(L.conceptCoverage, conceptCoverageAvg + '%', null, L.conceptCoverageDesc) +
      metricItem(L.conceptMissing, conceptMissingTotal, null, L.conceptMissingDesc) +
      metricItem(L.conceptWeakSections, conceptWeakSections.length ? conceptWeakSections.join(', ') : '0', null, L.conceptWeakSectionsDesc) +
      metricItem(L.sectionBalance, sectionBalance.cv + (sectionBalance.outliers.length ? ' | ' + sectionBalance.outliers.slice(0, 2).join(', ') : ''), null, L.sectionBalanceDesc) +
      metricItem(L.denseSections, denseText, null, null) +
      metricItem(L.rhythm, rhythmHtml, null, L.rhythmTitle) +
      metricItem(L.abstractWordCount, abstractWordCount + ' ' + L.words, null, L.abstractWordCountDesc) +
      metricItem(L.abstractCoverage, abstractCoverage.score + '%', null, L.abstractCoverageDesc + (abstractCoverage.missing.length ? (' | missing: ' + abstractCoverage.missing.join(', ')) : '')) +
      // ── Legibilidade ─────────────────────────────────────────────────────────
      metricGroup(L.groupReadability) +
      metricItem(L.readability + ' (' + L.flesch + ')', readability.flesch, null, L.fleschDesc) +
      metricItem(L.grade, readability.grade, null, L.gradeDesc) +
      metricItem(L.fog, readability.fog, null, L.fogDesc) +
      // ── Vocabulário ──────────────────────────────────────────────────────────
      metricGroup(L.groupVocabulary) +
      metricItem(L.docDiversity, lexDiv + '%', null, L.docDiversityDesc) +
      metricItem(L.repeatedTerms, repeatedTermCount + (topRepeated.length ? ' | ' + topRepeated.join(', ') : ''), 'repeated', L.repeatedTermsDesc) +
      metricItem(L.repeatedStarts, repeatedStarts.length ? repeatedStarts.slice(0, 3).map(function (x) { return x.start + ' \xd7' + x.count; }).join(', ') : '0', 'repeated-start', L.repeatedStartsDesc) +
      metricItem(L.nominalization, nominalizationCount, 'nominal', L.nominalizationDesc) +
      metricItem(L.termVariants, termVariants.length ? termVariants.slice(0, 3).map(function (x) { return x.forms.slice(0, 2).join('/'); }).join(', ') : '0', 'term-variants', L.termVariantsDesc) +
      metricItem(L.unitConsistency, unitInconsistency.length ? unitInconsistency.join('; ') : '0', 'unit-consistency', L.unitConsistencyDesc) +
      metricItem(L.undefinedAcronyms, undefinedAcronyms.length ? undefinedAcronyms.slice(0, 4).map(function (x) { return x.acronym + ' \xd7' + x.count; }).join(', ') : '0', 'undefined-acronyms', L.undefinedAcronymsDesc) +
      // ── Voz & Tom ────────────────────────────────────────────────────────────
      metricGroup(L.groupVoice) +
      metricItem(L.passiveTotal, passiveTotal, 'passive', L.passiveTotalDesc) +
      metricItem(L.passiveDensity, round1(passiveDensity) + '/1000' + L.wSuffix, 'passive', L.passiveDensityDesc) +
      metricItem(L.passive, passiveDistribNote, null, null) +
      metricItem(L.hedges, hedgeCount, 'hedge', L.hedgeDesc + ' | ' + L.hedgeDensity + ': ' + round1(hedgeDensity) + '/1000' + L.wSuffix) +
      metricItem(L.wordyPhrases, wordyCount, 'wordy', L.wordyPhrasesDesc) +
      metricItem(L.pronounAmbig, pronounAmbigCount, 'pronounambig', L.pronounAmbigDesc) +
      metricItem(L.modalVerbs, modalVerbCount, 'modal', L.modalVerbsDesc) +
      metricItem(L.firstPerson, firstPersonCount, 'firstperson', L.firstPersonDesc) +
      metricItem(L.colloquial, colloquialCount, 'colloquial', L.colloquialDesc) +
      metricItem(L.emphaticPunct, emphaticPunct, 'emphatic-punct', L.emphaticPunctDesc) +
      // ── Conectores ───────────────────────────────────────────────────────────
      metricGroup(L.groupConnectors) +
      metricItem(L.connectors, connectorCount, 'connectors', L.connectorsDesc) +
      metricItem(L.connectorAdd, connectorByCat.add || 0, 'connectors-add', L.connectorAddDesc) +
      metricItem(L.connectorContrast, connectorByCat.contrast || 0, 'connectors-contrast', L.connectorContrastDesc) +
      metricItem(L.connectorCause, connectorByCat.cause || 0, 'connectors-cause', L.connectorCauseDesc) +
      metricItem(L.connectorConclusion, connectorByCat.conclusion || 0, 'connectors-conclusion', L.connectorConclusionDesc) +
      metricItem(L.connectorTime, connectorByCat.time || 0, 'connectors-time', L.connectorTimeDesc) +
      // ── Citações & Referências ───────────────────────────────────────────────
      metricGroup(L.groupCitations) +
      metricItem(L.citationsTotal, referenceUsage.markerCount, null, L.citationsTotalDesc) +
      (doiTotal > 0 ? (function () {
        try {
          var parts = [];
          if (doiOk > 0) parts.push('<span class="ws-doi-tip-badge ws-doi-tip-badge-ok">' + doiOk + ' ok</span>');
          if (doiWithWarn > 0) parts.push('<span class="ws-doi-tip-badge ws-doi-tip-badge-warn">' + doiWithWarn + ' ⚠</span>');
          if (doiWithError > 0) parts.push('<span class="ws-doi-tip-badge ws-doi-tip-badge-err">' + doiWithError + ' ✗</span>');
          return metricItem(L.doiValidation, parts.join(' '), null, L.doiValidationDesc);
        } catch (e) { return ''; }
      })() : '') +
      metricItem(L.referencesUsed, referenceUsage.used.length + ' / ' + referenceUsage.defined, null,
        L.referencesUsedDesc +
        (referenceUsage.unused.length ? ' | ' + (LANG === 'pt' ? 'n\u00e3o usadas' : 'unused') + ': ' + referenceUsage.unused.join(', ') : '') +
        (referenceUsage.undefinedKeys.length ? ' | ' + (LANG === 'pt' ? 'n\u00e3o definidas' : 'undefined') + ': ' + referenceUsage.undefinedKeys.join(', ') : '')) +
      metricItem(L.figuresTotal, crossRefUsage.figureCount, null, L.figuresTotalDesc) +
      metricItem(L.figureCrossRefs, crossRefUsage.figureReferenced + ' / ' + crossRefUsage.figureCount, null,
        L.figureCrossRefsDesc +
        (crossRefUsage.figureMissing.length ? ' | ' + (LANG === 'pt' ? 'sem referência' : 'unreferenced') + ': ' + crossRefUsage.figureMissing.join(', ') : '')) +
      metricItem(L.figureRefOrder, crossRefUsage.figureOrder.count === 0 ? 'ok' : crossRefUsage.figureOrder.count, 'figure-ref-order',
        L.figureRefOrderDesc +
        (crossRefUsage.figureOrder.examples.length ? ' | ' + (LANG === 'pt' ? 'quebras' : 'breaks') + ': ' + crossRefUsage.figureOrder.examples.join(', ') : '')) +
      metricItem(L.tablesTotal, crossRefUsage.tableCount, null, L.tablesTotalDesc) +
      metricItem(L.tableCrossRefs, crossRefUsage.tableReferenced + ' / ' + crossRefUsage.tableCount, null,
        L.tableCrossRefsDesc +
        (crossRefUsage.tableMissing.length ? ' | ' + (LANG === 'pt' ? 'sem referência' : 'unreferenced') + ': ' + crossRefUsage.tableMissing.join(', ') : '')) +
      metricItem(L.tableRefOrder, crossRefUsage.tableOrder.count === 0 ? 'ok' : crossRefUsage.tableOrder.count, 'table-ref-order',
        L.tableRefOrderDesc +
        (crossRefUsage.tableOrder.examples.length ? ' | ' + (LANG === 'pt' ? 'quebras' : 'breaks') + ': ' + crossRefUsage.tableOrder.examples.join(', ') : '')) +
      metricItem(L.citationSentStart, citationSentStartCount, 'citation-start', L.citationSentStartDesc) +
      metricItem(L.citationSentEnd, citationSentEndCount, null, L.citationSentEndDesc) +
      metricItem(L.citationGaps, citationGapCount, 'citation-low', L.citationGapsDesc) +
      metricItem(L.resultsCitations, resultsCitationCount, 'results-citation', L.resultsCitationsDesc) +
      // ── Evidências ───────────────────────────────────────────────────────────
      metricGroup(L.groupEvidence) +
      metricItem(L.evidence, evidenceCited, 'evidence', L.evidenceCitedDesc + ' | ' + L.evidenceDensity + ': ' + round1(evidenceDensity) + '/1000' + L.wSuffix) +
      metricItem(L.evidenceHardcoded, evidenceHardcoded, 'evidence-hardcoded', L.evidenceHardcodedDesc) +
      metricItem(L.evidenceUnparameterized, evidenceUnparameterized, 'evidence-unparameterized', L.evidenceUnparameterizedDesc) +
      (VARIABLE_COUNT > 0
        ? metricItem(L.evidenceParameterized, evidenceParameterized + ' / ' + (evidenceParameterized + evidenceUnparameterized), 'evidence-parameterized', L.evidenceParameterizedDesc) +
          metricItem(L.variableCount, usedVarCount + ' / ' + VARIABLE_COUNT, null,
            L.variableCountDesc +
            (varUsage.unused.length
              ? ' | \u26a0\ufe0f ' + (LANG === 'pt' ? 'n\u00e3o usadas' : 'unused') + ': ' + varUsage.unused.join(', ')
              : ''))
        : '') +
      // ── NLP científico ─────────────────────────────────────────────────────
      metricGroup(L.groupNlp) +
      metricItem(L.nlpEngine, nlpStatusLabel, null, NLP_ERROR ? (nlpStatusLabel + ' | ' + NLP_ERROR) : nlpStatusLabel) +
      metricSubgroup(LANG === 'pt' ? 'interno' : 'built-in', null) +
      metricItem(L.nlpNominalLoad, nlpTotals.nominalLoadCount, 'nlp-nominal-load', L.nlpNominalLoadDesc) +
      metricItem(L.nlpWeakVerbs, nlpTotals.weakVerbCount, 'nlp-weakverb', L.nlpWeakVerbsDesc) +
      metricItem(L.nlpNounStacks, nlpTotals.nounStackCount, 'nlp-nounstack', L.nlpNounStacksDesc) +
      metricSubgroup('compromise', 'https://compromisenlp.com') +
      metricItem(L.nlpTopics, nlpTopics.length ? nlpTopics.join(', ') : '0', 'nlp-topics', L.nlpTopicsDesc) +
      metricItem(L.nlpEntities, nlpTotals.entityCount + (nlpEntities.length ? ' | ' + nlpEntities.join(', ') : ''), 'nlp-entities', L.nlpEntitiesDesc) +
      metricItem(L.nlpValuesDates, nlpTotals.dateValueCount, 'nlp-values-dates', L.nlpValuesDatesDesc) +
      metricItem(L.nlpAdverbs, nlpTotals.adverbCount + (nlpAdverbs.length ? ' | ' + nlpAdverbs.join(', ') : ''), 'nlp-adverbs', L.nlpAdverbsDesc) +
      metricItem(L.nlpNounDensity, nlpNounDensity + '/100w', null, L.nlpNounDensityDesc) +
      metricItem(L.nlpEntityDensity, nlpEntityDensity + '/100w', null, L.nlpEntityDensityDesc) +
      metricItem(L.nlpEntityOverload, nlpTotals.entityOverloadCount, null, L.nlpEntityOverloadDesc) +
      metricItem(L.nlpActionVerbScore, nlpActionVerbScore + '%', null, L.nlpActionVerbScoreDesc) +
      metricItem(L.nlpSentencePatternRepeats, nlpTotals.sentencePatternRepeatCount, 'nlp-sentence-repeats', L.nlpSentencePatternRepeatsDesc) +
      metricItem(L.nlpSemanticRedundancy, nlpSemanticRedundancy + '%', null, L.nlpSemanticRedundancyDesc) +
      metricItem(L.nlpFlowScore, nlpFlowScore + '%', null, L.nlpFlowScoreDesc) +
      metricItem(L.nlpTermDrift, nlpTotals.termDriftCount, 'term-variants', L.nlpTermDriftDesc) +
      metricItem(L.nlpTenseProfile, nlpTenseProfileText, null, L.nlpTenseProfileDesc) +
      (LANG === 'en' ? metricItem(L.nlpContractions, nlpTotals.contractionCount, 'nlp-contractions', L.nlpContractionsDesc) : '') +
      metricItem(L.nlpQuestions, nlpTotals.questionCount, 'nlp-questions', L.nlpQuestionsDesc) +
      metricItem(L.nlpNounVerbRatio, round1(nlpNounVerbRatio), null, L.nlpNounVerbRatioDesc) +
      metricItem(L.nlpVerbDiversity, round1(nlpVerbDiversity * 100) + '%', null, L.nlpVerbDiversityDesc) +
      metricItem(L.nlpKeyTerms, nlpKeyTerms.length ? nlpKeyTerms.join(', ') : '0', 'nlp-keyterms', L.nlpKeyTermsDesc) +
      (LANG === 'en' && winkStats.winkAvailable
        ? metricSubgroup('wink-nlp', 'https://winkjs.org/wink-nlp/') +
          metricItem(L.nlpWinkReadingEase, winkStats.fleschReadingEase, null, L.nlpWinkReadingEaseDesc) +
          metricItem(L.nlpWinkGradeLevel, winkStats.fleschKincaidGrade, null, L.nlpWinkGradeLevelDesc) +
          metricItem(L.nlpWinkAvgWords, winkStats.avgWordsPerSentence, null, L.nlpWinkAvgWordsDesc) +
          metricItem(L.nlpWinkReadTime, (winkStats.readingTimeSecs || 0) + 's', null, L.nlpWinkReadTimeDesc) +
          metricItem(L.nlpWinkComplexWords, (winkStats.complexWordCount || 0) + ((winkStats.complexWords || []).length ? ' | ' + displayNlpItems((winkStats.complexWords || []).slice(0, 4)) : ''), 'wink-complex', L.nlpWinkComplexWordsDesc) +
          metricItem(L.nlpWinkComplexDensity, winkStats.complexWordDensity != null ? winkStats.complexWordDensity + '%' : '—', null, L.nlpWinkComplexDensityDesc) +
          metricItem(L.nlpWinkModalVerbs, (winkStats.modalCount || 0) + ((winkStats.modalTerms || []).length ? ' | ' + displayNlpItems((winkStats.modalTerms || []).slice(0, 4)) : ''), 'wink-modal', L.nlpWinkModalVerbsDesc) +
          metricItem(L.nlpWinkPronouns, (winkStats.pronounCount || 0) + ((winkStats.pronounTerms || []).length ? ' | ' + displayNlpItems((winkStats.pronounTerms || []).slice(0, 4)) : ''), 'wink-pronoun', L.nlpWinkPronounsDesc) +
          metricItem(L.nlpWinkPronounDensity, (winkStats.pronounDensity != null ? winkStats.pronounDensity : 0) + '/100t', 'wink-pronoun', L.nlpWinkPronounDensityDesc) +
          metricItem(L.nlpWinkAuxiliaries, (winkStats.auxiliaryCount || 0) + ((winkStats.auxiliaryTerms || []).length ? ' | ' + displayNlpItems((winkStats.auxiliaryTerms || []).slice(0, 4)) : ''), 'wink-auxiliary', L.nlpWinkAuxiliariesDesc) +
          metricItem(L.nlpWinkAuxVerbRatio, winkStats.auxiliaryVerbRatio != null ? winkStats.auxiliaryVerbRatio : 0, 'wink-auxiliary', L.nlpWinkAuxVerbRatioDesc) +
          metricItem(L.nlpWinkNumericDensity, (winkStats.numericTokenDensity != null ? winkStats.numericTokenDensity : 0) + '/100t', 'wink-numeric', L.nlpWinkNumericDensityDesc) +
          metricItem(L.nlpWinkProperNouns, (winkStats.properNounCount || 0) + ((winkStats.properNounTerms || []).length ? ' | ' + displayNlpItems((winkStats.properNounTerms || []).slice(0, 4)) : ''), 'wink-propn', L.nlpWinkProperNounsDesc) +
          metricItem(L.nlpWinkProperNounDensity, (winkStats.properNounDensity != null ? winkStats.properNounDensity : 0) + '/100t', 'wink-propn', L.nlpWinkProperNounDensityDesc) +
          metricItem(L.nlpWinkLexicalDensity, (winkStats.lexicalDensity != null ? winkStats.lexicalDensity : 0) + '/100t', null, L.nlpWinkLexicalDensityDesc) +
          metricItem(L.nlpWinkPassive, winkStats.passiveSentenceCount || 0, 'wink-passive', L.nlpWinkPassiveDesc) +

          metricItem(L.nlpWinkPosNounStacks, winkStats.posNounStackCount || 0, 'nlp-nounstack', L.nlpWinkPosNounStacksDesc) +
          metricItem(L.nlpWinkVerbDiversity, winkStats.verbLemmaDiversity != null ? winkStats.verbLemmaDiversity + '%' : '—', null, L.nlpWinkVerbDiversityDesc)
        : '') +
      // ── Busca & Seleção ─────────────────────────────────────────────────────
      metricGroup(L.groupSearchSelection) +
      metricItem(L.italicText, italicTextCount, 'italic', L.italicTextDesc) +
      metricRegexSearch();

    var _summaryHtml = buildDocSummaryCard((function () {
        var nmWords = 0, nmPassive = 0;
        sections.forEach(function (s) {
          if (!s.isMethods && (s.words || 0) > 0) {
            nmWords += s.words;
            nmPassive += s.passive || 0;
          }
        });
        return {
          sentLengths: sentenceLengths,
          sentStd: sentStd,
          maxSentLen: maxSentLen,
          readability: readability,
          complexSentenceCount: complexSentenceCount,
          complexSentenceRate: complexSentenceRate,
          noVerbCount: noVerbCount,
          longSentenceRate: longSentenceRate,
          longSentenceCount: longSentenceCount,
          paraLengths: paraLengths,
          longParagraphCount: longParagraphCount,
          paraOpeningRepeats: paraOpeningRepeats,
          repeatedStarts: repeatedStarts,
          cohesionGaps: cohesionGaps,
          avgSectionScore: avgSectionScore,
          conceptCoverageAvg: conceptCoverageAvg,
          conceptMissingTotal: conceptMissingTotal,
          conceptWeakSections: conceptWeakSections,
          citationGapCount: citationGapCount,
          resultsCitationCount: resultsCitationCount,
          referencesDefined: referenceUsage.defined,
          referencesUsed: referenceUsage.used.length,
          citationsTotal: referenceUsage.markerCount,
          undefinedRefs: referenceUsage.undefinedKeys || [],
          unusedVars: varUsage.unused,
          variableCount: VARIABLE_COUNT,
          usedVarCount: usedVarCount,
          evidenceHardcoded: evidenceHardcoded,
          evidenceCited: evidenceCited,
          evidenceParameterized: evidenceParameterized,
          evidenceUnparameterized: evidenceUnparameterized,
          evidenceDensity: evidenceDensity,
          figureMissing: crossRefUsage.figureMissing || [],
          figureOrderIssues: crossRefUsage.figureOrder ? crossRefUsage.figureOrder.count : 0,
          figureOrderExamples: crossRefUsage.figureOrder ? crossRefUsage.figureOrder.examples : [],
          tableMissing: crossRefUsage.tableMissing || [],
          tableOrderIssues: crossRefUsage.tableOrder ? crossRefUsage.tableOrder.count : 0,
          tableOrderExamples: crossRefUsage.tableOrder ? crossRefUsage.tableOrder.examples : [],
          figuresTotal: crossRefUsage.figureCount,
          figureCrossRefs: crossRefUsage.figureReferenced,
          tablesTotal: crossRefUsage.tableCount,
          tableCrossRefs: crossRefUsage.tableReferenced,
          abstractWordCount: abstractWordCount,
          abstractCoverage: abstractCoverage,
          sectionBalance: sectionBalance,
          passiveDensity: passiveDensity,
          nonMethodsPassiveDensity: nmWords > 0 ? (nmPassive / nmWords) * 1000 : 0,
          passiveTotal: passiveTotal,
          hedgeCount: hedgeCount,
          hedgeDensity: hedgeDensity,
          totalWords: totalWords,
          connectorCount: connectorCount,
          connectorByCat: connectorByCat,
          colloquialCount: colloquialCount,
          vagueCount: vagueCount,
          wordyCount: wordyCount,
          nominalizationCount: nominalizationCount,
          pronounAmbigCount: pronounAmbigCount,
          modalVerbCount: modalVerbCount,
          firstPersonCount: firstPersonCount,
          emphaticPunct: emphaticPunct,
          lexDiv: lexDiv,
          undefinedAcronyms: undefinedAcronyms,
          unitInconsistency: unitInconsistency,
          termVariants: termVariants,
          topRepeated: globalRepeatedItems.slice(0, 8),
          repeatedTermCount: repeatedTermCount,
          unusedRefs: referenceUsage.unused || [],
          weakOpenerCount: winkStats.weakOpenerCount || 0,
          citationSentStartCount: citationSentStartCount,
          nlpTotals: nlpTotals,
          nlpNounVerbRatio: nlpNounVerbRatio,
          nlpVerbDiversity: nlpVerbDiversity,
          nlpNounDensity: nlpNounDensity,
          nlpEntityDensity: nlpEntityDensity,
          nlpActionVerbScore: nlpActionVerbScore,
          nlpSemanticRedundancy: nlpSemanticRedundancy,
          nlpFlowScore: nlpFlowScore,
          nlpKeyTerms: nlpKeyTerms,
          nlpTopics: nlpTopics,
          nlpEntities: nlpEntities,
          nlpAdverbs: nlpAdverbs,
          winkStats: winkStats,
          doiTotal: doiTotal,
          doiWithError: doiWithError,
          doiWithWarn: doiWithWarn,
          doiOk: doiOk,
          sections: sections.map(function (s) {
            return {
              title: s.title,
              words: s.words || 0,
              paras: s.paras || 0,
              sentences: s.sentences || 0,
              avgSentence: s.avgSentence || 0,
              avgParagraph: s.avgParagraph || 0
            };
          })
        };
      })());

    var anchor = document.getElementById('title-block-header') || root.querySelector('section');
    if (anchor) {
      anchor.after(badge);
      badge.after(metrics);
      metrics.insertAdjacentHTML('afterend', _summaryHtml);
      wireMetricGroups(metrics);
      wireMetricFocus(metrics);
      wireRegexSearch(metrics, root);
      wireRhythmNavigation(metrics);
    }
  }
