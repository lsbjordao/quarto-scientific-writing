// src/ui/report.js — Markdown/text report generation and export.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

  function buildMarkdownReport() {
    var r = window.WritingStatsReport;
    if (!r) return '';
    var lines = [
      L.reportTitle,
      ''.padEnd(72, '='),
      '',
      'RESUMO GERAL',
      '- ' + L.words + ': ' + r.words,
      '- ' + L.readTime + ': ~' + r.readMinutes,
      '- ' + L.avgSentence + ': ' + r.avgSentence + L.wSuffix,
      '- ' + L.sentenceVar + ': ' + r.sentenceVariance + ' / σ ' + r.sentenceStdDev + L.wSuffix,
      '- ' + L.avgParagraph + ': ' + r.avgParagraph + L.wSuffix,
      '- ' + L.longestSentence + ': ' + r.longestSentence + L.wSuffix,
      '- ' + L.docDiversity + ': ' + r.lexicalDiversity + '%',
      '- ' + L.passiveTotal + ': ' + r.passiveTotal,
      '- ' + L.passiveDensity + ': ' + r.passiveDensity + '/1000' + L.wSuffix,
      '- ' + L.longSentenceRate + ': ' + r.longSentenceRate + '%',
      '- ' + L.repeatedTerms + ': ' + r.repeatedTermCount + (r.topRepeated.length ? ' | ' + r.topRepeated.join(', ') : ''),
      '- ' + L.longParagraphs + ': ' + r.longParagraphCount,
      '- ' + L.citationGaps + ': ' + r.citationGapCount,
      '- ' + L.resultsCitations + ': ' + r.resultsCitationCount,
      '- ' + L.figuresTotal + ': ' + r.figuresTotal,
      '- ' + L.figureCrossRefs + ': ' + r.figureCrossRefs + ' / ' + r.figuresTotal,
      '- ' + L.figureRefOrder + ': ' + (r.figureRefOrderIssues || 0) + ((r.figureRefOrderExamples && r.figureRefOrderExamples.length) ? ' | ' + r.figureRefOrderExamples.join(', ') : ''),
      '- ' + L.tablesTotal + ': ' + r.tablesTotal,
      '- ' + L.tableCrossRefs + ': ' + r.tableCrossRefs + ' / ' + r.tablesTotal,
      '- ' + L.tableRefOrder + ': ' + (r.tableRefOrderIssues || 0) + ((r.tableRefOrderExamples && r.tableRefOrderExamples.length) ? ' | ' + r.tableRefOrderExamples.join(', ') : ''),
      '- ' + L.connectors + ': ' + r.connectors,
      '- ' + L.nominalization + ': ' + r.nominalizations,
      '- ' + L.readability + ' (' + L.flesch + '): ' + r.readabilityFlesch,
      '- ' + L.grade + ': ' + r.readabilityGrade,
      '- ' + L.fog + ': ' + r.readabilityFog,
      '- ' + L.complexSent + ': ' + r.complexSentences + ' (' + r.complexSentenceRate + '%)',
      '- ' + L.hedges + ': ' + r.hedges + ' (' + L.hedgeDensity + ': ' + r.hedgeDensity + '/1000' + L.wSuffix + ')',
      '- ' + L.undefinedAcronyms + ': ' + (r.undefinedAcronyms.length ? r.undefinedAcronyms.slice(0, 8).map(function (x) { return x.acronym + ' ×' + x.count; }).join(', ') : '0'),
      '- ' + L.emphaticPunct + ': ' + r.emphaticPunct,
      '- ' + L.evidence + ': ' + r.evidenceMarkers + ' (' + L.evidenceDensity + ': ' + r.evidenceDensity + '/1000' + L.wSuffix + ')',
      '- ' + L.nlpEngine + ': ' + r.nlpStatus,
      '- ' + L.nlpNominalLoad + ': ' + r.nlpNominalLoadCount,
      '- ' + L.nlpWeakVerbs + ': ' + r.nlpWeakVerbCount,
      '- ' + L.nlpNounStacks + ': ' + r.nlpNounStackCount,
      '- ' + L.nlpTopics + ': ' + (r.nlpTopics.length ? r.nlpTopics.join(', ') : '0'),
      '- ' + L.nlpEntities + ': ' + r.nlpEntityCount + (r.nlpEntities.length ? ' | ' + r.nlpEntities.join(', ') : ''),
      '- ' + L.nlpValuesDates + ': ' + r.nlpDateValueCount,
      '- ' + L.nlpAdverbs + ': ' + r.nlpAdverbCount + (r.nlpAdverbs.length ? ' | ' + r.nlpAdverbs.join(', ') : ''),
      '- ' + L.nlpNounDensity + ': ' + r.nlpNounDensity + '/100w',
      '- ' + L.nlpEntityDensity + ': ' + r.nlpEntityDensity + '/100w',
      '- ' + L.nlpEntityOverload + ': ' + r.nlpEntityOverloadCount,
      '- ' + L.nlpActionVerbScore + ': ' + r.nlpActionVerbScore + '%',
      '- ' + L.nlpSentencePatternRepeats + ': ' + r.nlpSentencePatternRepeatCount,
      '- ' + L.nlpSemanticRedundancy + ': ' + r.nlpSemanticRedundancy + '%',
      '- ' + L.nlpFlowScore + ': ' + r.nlpFlowScore + '%',
      '- ' + L.nlpTermDrift + ': ' + r.nlpTermDriftCount,
      '- ' + L.nlpTenseProfile + ': ' + r.nlpTenseProfileText,
      '- ' + L.nlpNounVerbRatio + ': ' + r.nlpNounVerbRatio,
      '- ' + L.nlpVerbDiversity + ': ' + r.nlpVerbDiversity + '%',
      '- ' + L.nlpKeyTerms + ': ' + (r.nlpKeyTerms.length ? r.nlpKeyTerms.join(', ') : '0'),
      (LANG === 'en' && r.winkAvailable ? '- ' + L.nlpWinkReadingEase + ': ' + r.winkReadingEase : null),
      (LANG === 'en' && r.winkAvailable ? '- ' + L.nlpWinkGradeLevel + ': ' + r.winkGradeLevel : null),
      (LANG === 'en' && r.winkAvailable ? '- ' + L.nlpWinkAvgWords + ': ' + r.winkAvgWordsPerSentence : null),
      (LANG === 'en' && r.winkAvailable ? '- ' + L.nlpWinkReadTime + ': ' + r.winkReadingTimeSecs + 's' : null),
      (LANG === 'en' && r.winkAvailable ? '- ' + L.nlpWinkComplexWords + ': ' + r.winkComplexWordCount + (r.winkComplexWords.length ? ' | ' + r.winkComplexWords.join(', ') : '') : null),
      (LANG === 'en' && r.winkAvailable ? '- ' + L.nlpWinkModalVerbs + ': ' + r.winkModalCount + (r.winkModalTerms.length ? ' | ' + r.winkModalTerms.join(', ') : '') : null),
      (LANG === 'en' && r.winkAvailable ? '- ' + L.nlpWinkPronouns + ': ' + r.winkPronounCount + (r.winkPronounTerms.length ? ' | ' + r.winkPronounTerms.join(', ') : '') : null),
      (LANG === 'en' && r.winkAvailable ? '- ' + L.nlpWinkPronounDensity + ': ' + r.winkPronounDensity + '/100t' : null),
      (LANG === 'en' && r.winkAvailable ? '- ' + L.nlpWinkAuxiliaries + ': ' + r.winkAuxiliaryCount + (r.winkAuxiliaryTerms.length ? ' | ' + r.winkAuxiliaryTerms.join(', ') : '') : null),
      (LANG === 'en' && r.winkAvailable ? '- ' + L.nlpWinkAuxVerbRatio + ': ' + r.winkAuxiliaryVerbRatio : null),
      (LANG === 'en' && r.winkAvailable ? '- ' + L.nlpWinkNumericDensity + ': ' + r.winkNumericTokenDensity + '/100t' + (r.winkNumericTerms.length ? ' | ' + r.winkNumericTerms.join(', ') : '') : null),
      (LANG === 'en' && r.winkAvailable ? '- ' + L.nlpWinkProperNouns + ': ' + r.winkProperNounCount + (r.winkProperNounTerms.length ? ' | ' + r.winkProperNounTerms.join(', ') : '') : null),
      (LANG === 'en' && r.winkAvailable ? '- ' + L.nlpWinkProperNounDensity + ': ' + r.winkProperNounDensity + '/100t' : null),
      (LANG === 'en' && r.winkAvailable ? '- ' + L.nlpWinkLexicalDensity + ': ' + r.winkLexicalDensity + '/100t' : null),
      (LANG === 'en' && r.winkAvailable ? '- ' + L.nlpWinkPassive + ': ' + r.winkPassiveSentenceCount : null),
      (LANG === 'en' && r.winkAvailable ? '- ' + L.nlpWinkPosNounStacks + ': ' + r.nlpNounStackCount : null),
      '- ' + L.termVariants + ': ' + (r.termVariants.length ? r.termVariants.slice(0, 6).map(function (x) { return x.forms.slice(0, 3).join('/') + ' ×' + x.count; }).join(', ') : '0'),
      '- ' + L.cohesionGaps + ': ' + r.cohesionGaps,
      '- ' + L.abstractCoverage + ': ' + r.abstractCoverage.score + '%',
      '- ' + L.conceptCoverage + ': ' + r.conceptCoverageAvg + '%',
      '- ' + L.conceptMissing + ': ' + r.conceptMissingTotal,
      '- ' + L.colloquial + ': ' + r.colloquialCount,
      '- ' + L.repeatedStarts + ': ' + (r.repeatedStarts.length ? r.repeatedStarts.slice(0, 5).map(function (x) { return x.start + ' ×' + x.count; }).join(', ') : '0'),
      '- ' + L.sectionScore + ': ' + (r.avgSectionScore || 0) + '/100',
      '- ' + L.noVerb + ': ' + r.noClearVerb,
      '',
      'PRIORIDADES (P1/P2/P3)',
    ].filter(Boolean);

    r.sections.forEach(function (s) {
      var pr = 'P3';
      if ((s.goalIssueCount || 0) > 0 || (s.score || 0) < 60) pr = 'P1';
      else if ((s.score || 0) < 75 || (s.longSentenceRate || 0) > 20) pr = 'P2';
      lines.push('- ' + pr + ' | ' + s.title + ' | ' + L.sectionScore + ': ' + (s.score || 0) + '/100 | ' + L.goalIssues + ': ' + (s.goalIssueCount || 0));
    });

    lines.push('');
    lines.push('DETALHE POR SECAO');
    r.sections.forEach(function (s) {
      lines.push('[' + s.title + ']');
      lines.push('  ' + L.words + ': ' + s.words);
      lines.push('  ' + L.avgSentence + ': ' + round1(s.avgSentence) + L.wSuffix);
      lines.push('  ' + L.avgParagraph + ': ' + round1(s.avgParagraph) + L.wSuffix);
      lines.push('  ' + L.passive + ': ' + s.passive);
      lines.push('  ' + L.nlpNounDensity + ': ' + round1(s.nlpNounDensity || 0) + '/100w');
      lines.push('  ' + L.nlpEntityDensity + ': ' + round1(s.nlpEntityDensity || 0) + '/100w');
      lines.push('  ' + L.nlpActionVerbScore + ': ' + round1(s.nlpActionVerbScore || 0) + '%');
      lines.push('  ' + L.nlpSemanticRedundancy + ': ' + round1(s.nlpSemanticRedundancy || 0) + '%');
      lines.push('  ' + L.nlpFlowScore + ': ' + round1(s.nlpFlowScore || 0) + '%');
      lines.push('  ' + L.conceptCoverage + ': ' + (s.conceptCoverage || 0) + '%');
      lines.push('  ' + L.conceptMissing + ': ' + (s.conceptMissingCount || 0));
      if (s.conceptMissing && s.conceptMissing.length) {
        lines.push('  ' + L.conceptWeakSections + ': ' + s.conceptMissing.join(', '));
      }
      lines.push('  ' + L.nlpTenseProfile + ': ' +
        ('PST ' + (s.nlpTenseProfile && s.nlpTenseProfile.past || 0) +
        ' | PRS ' + (s.nlpTenseProfile && s.nlpTenseProfile.present || 0) +
        ' | FUT/MOD ' + (s.nlpTenseProfile && s.nlpTenseProfile.future_modal || 0)));
      lines.push('  ' + L.sectionScore + ': ' + (s.score || 0) + '/100');
      lines.push('  ' + L.goalIssues + ': ' + (s.goalIssueCount || 0));
      if (s.goalIssues && s.goalIssues.length) {
        s.goalIssues.forEach(function (g) { lines.push('    - ' + g); });
      }
      lines.push('');
    });
    return lines.join('\n');
  }

  function exportMarkdownReport() {
    var blob = new Blob([buildMarkdownReport()], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = LANG === 'en' ? 'writing-report.txt' : 'relatorio-escrita.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
