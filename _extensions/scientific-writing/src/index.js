// src/index.js — Main orchestration and DOMContentLoaded entrypoint.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

  // ── Main ───────────────────────────────────────────────────────────────────

  async function run() {
    applyConfig();
    ANALYSIS_TELEMETRY = { hits: 0, misses: 0, batches: 0, durationMs: 0, mode: 'sync' };
    SOURCE_EVIDENCE_INDEX = 0;

    var root =
      document.getElementById('quarto-document-content') ||
      document.querySelector('main') ||
      document.body;

    var loadingAnchor = document.getElementById('title-block-header') || root.querySelector('section');
    var loadingPill = null;
    if (loadingAnchor) {
      loadingPill = document.createElement('div');
      loadingPill.className = 'ws-doc-loading';
      loadingPill.textContent = L.analysisPreparing;
      loadingAnchor.after(loadingPill);
    }
    if (NLP_CDN_ENABLED) {
      NLP_LIB = detectGlobalNlp();
      NLP_STATUS = NLP_LIB ? 'loaded' : 'unavailable';
      if (!NLP_LIB) ensureNlpEngine();
    } else {
      NLP_STATUS = 'disabled';
    }
      var winkPromise = ensureWinkEngine();

    await winkPromise;

    var totalDocWords = 0;
    var allWrappers   = [];
    var allStats      = [];
    var allTexts      = [];
    var allSections   = [];

    var sections = Array.from(root.querySelectorAll('section.level1, section.level2, section.level3, section.level4'));
    var preAnalysisText = sections.map(function (section) {
      return Array.from(section.querySelectorAll(':scope > p')).map(function (p) {
        return p.innerText || p.textContent || '';
      }).join('\n\n');
    }).join('\n\n');
    var globalParaOpeningSet = new Set(getParaOpeningRepeats(sections.reduce(function (acc, section) {
      return acc.concat(Array.from(section.querySelectorAll(':scope > p')).map(function (p) {
        return p.innerText || p.textContent || '';
      }));
    }, [])).map(function (item) { return item.word; }));
    var globalRepeatedSet = new Set(getGlobalRepeatedItems(preAnalysisText, 3, 0).map(function (item) {
      return item.text;
    }));
    var globalMaxSentLen = sections.reduce(function (mx, section) {
      return Array.from(section.querySelectorAll(':scope > p')).reduce(function (smx, p) {
        var text = p.innerText || p.textContent || '';
        return getSentences(text).reduce(function (pmx, sent) {
          return Math.max(pmx, countWords(sent));
        }, smx);
      }, mx);
    }, 0);
    // subtract 1 so the longest sentence (at or below SENT_LONG) is caught by wrapLongSentences
    var _longWrapThreshold = globalMaxSentLen > 1 && globalMaxSentLen <= SENT_LONG
      ? globalMaxSentLen - 1
      : SENT_LONG;
    for (var sIdx = 0; sIdx < sections.length; sIdx++) {
      var section = sections[sIdx];
      var paras = Array.from(section.querySelectorAll(':scope > p'));
      if (paras.length === 0) continue;
      var heading = section.querySelector('h1, h2, h3, h4');
      var sectionTitle = heading ? heading.textContent.replace(/\s*#?$/, '').trim() : '';
      var inMethods = isMethodsTitle(sectionTitle);
      var needsCitationSection = isIntroductionTitle(sectionTitle) || isDiscussionTitle(sectionTitle);
      var resultsSection = isResultsTitle(sectionTitle);
      var sectionId = section.id || (heading && heading.id) || '';
      if (!sectionId) {
        sectionId = 'ws-section-' + (allSections.length + 1);
        section.id = sectionId;
      }

      var paraTexts  = paras.map(function (p) { return p.innerText || p.textContent || ''; });
      var crossWords = getCrossRepeated(paraTexts);
        var asyncStats = await analyzeParagraphsAsync(paraTexts);

      var statsList    = [];
      var sectionWords = 0;

      paras.forEach(function (p, i) {
        var text = p.innerText || p.textContent || '';
        var wordCount = countWords(text);
        if (wordCount < 8) return;
        var citeStats = citationStatsForElement(p);

        var row = asyncStats[i] || analyzeParagraphSync(text);
        var sentences    = Array.isArray(row.sentences) ? row.sentences : getSentences(text);
        var maxSentLen   = Number(row.maxSentLen) || sentences.reduce(function (mx, s) { return Math.max(mx, countWords(s)); }, 0);
        var lexDiv       = Number(row.lexDiv);
        if (!isFinite(lexDiv) || lexDiv <= 0) lexDiv = getLexDiv(text);
        var repeated     = row.repeated && typeof row.repeated === 'object' ? row.repeated : getIntraRepeated(text);
        var repeatedSet  = new Set(Object.keys(repeated));
        globalRepeatedSet.forEach(function (word) {
          if (new RegExp('\\b' + word + '\\b', 'i').test(text)) repeatedSet.add(word);
        });
        var passiveCount = Number(row.passiveCount);
        if (!isFinite(passiveCount) || passiveCount < 0) passiveCount = countPassive(text);
        var syllableCount = Number(row.syllableCount);
        if (!isFinite(syllableCount) || syllableCount < 0) syllableCount = countSyllablesText(text);
        var complexWordCount = Number(row.complexWordCount);
        if (!isFinite(complexWordCount) || complexWordCount < 0) complexWordCount = countComplexWords(text);
        var hedgeCount = Number(row.hedgeCount);
        if (!isFinite(hedgeCount) || hedgeCount < 0) hedgeCount = countHedges(text);
        var complexSentenceCount = Number(row.complexSentenceCount);
        if (!isFinite(complexSentenceCount) || complexSentenceCount < 0) complexSentenceCount = countComplexSentences(sentences);
        var nlpStats = analyzeScientificNlp(text, sentences);
        var paraLong     = wordCount > PARA_LONG;

        var crossInPara = Array.from(crossWords)
          .filter(function (w) {
            return !repeatedSet.has(w) && new RegExp('\\b' + w + '\\b', 'i').test(text);
          })
          .sort();

        sectionWords += wordCount;

        // Cohesion gap: mark paragraph if it follows a multi-sentence paragraph with no connector opening
        if (i > 0) {
          var prevText = paraTexts[i - 1] || '';
          var prevSentCount = getSentences(prevText).length;
          var connStarts = getConnectorTerms().map(function (t) { return normalizeWord(t); });
          var lead = normalizeWord(text.slice(0, 80));
          var hasConnector = connStarts.some(function (c) {
            return lead.indexOf(c + ' ') === 0 || lead.indexOf(c + ',') === 0 || lead === c;
          });
          if (prevSentCount >= 2 && !hasConnector) {
            p.classList.add('ws-cohesion-gap');
            p.title = (p.title ? p.title + ' | ' : '') + L.cohesionGaps;
          }
        }

        // Order matters: long sentences → passive → repeated words
        if (maxSentLen > _longWrapThreshold) wrapLongSentences(p, _longWrapThreshold);
        wrapNoVerbSentences(p);
        // Functions that use p.innerHTML = must run FIRST to avoid destroying other highlights
        highlightComplexSentences(p);
        if (nlpStats.nominalLoadCount > 0) highlightNlpNominalLoad(p);
        if (nlpStats.weakVerbCount > 0) highlightNlpWeakVerbs(p);
        if (LANG === 'en' && WINK_NLP && nlpStats && nlpStats.passiveSentenceCount > 0) highlightWinkPassiveSentences(p);
        if (passiveCount > 0)       highlightPatternInNode(p, PASSIVE_PATTERNS, 'ws-passive');
        // Now run functions that preserve highlights
        if (LANG === 'en' && WINK_NLP && nlpStats && nlpStats.winkComplexWordCount > 0) highlightWinkComplexWords(p, nlpStats);
        if (LANG === 'en' && WINK_NLP && nlpStats && nlpStats.winkModalCount > 0) highlightWinkModalVerbs(p, nlpStats);
        if (LANG === 'en' && WINK_NLP && nlpStats && nlpStats.winkPronounCount > 0) highlightWinkPronouns(p, nlpStats);
        if (LANG === 'en' && WINK_NLP && nlpStats && nlpStats.winkAuxiliaryCount > 0) highlightWinkAuxiliaries(p, nlpStats);
        if (LANG === 'en' && WINK_NLP && nlpStats && nlpStats.winkNumericTokenCount > 0) highlightWinkNumericTokens(p, nlpStats);
        if (LANG === 'en' && WINK_NLP && nlpStats && nlpStats.winkProperNounCount > 0) highlightWinkProperNouns(p, nlpStats);

        highlightRepeatedStarts(p, globalParaOpeningSet);
        highlightConnectors(p);
        highlightNominalizations(p);
        if (hedgeCount > 0) highlightHedges(p);
        var wordyCount = Number(row.wordyCount);
        if (!isFinite(wordyCount) || wordyCount < 0) wordyCount = countWordyPhrases(text);
        if (wordyCount > 0) highlightWordyPhrases(p);
        if (countColloquialisms(text) > 0) highlightColloquial(p);
        highlightItalicText(p);
        if (nlpStats.nounStackCount > 0) highlightNlpNounStacks(p);
        if (nlpStats.topicCount > 0) highlightNlpTopics(p, nlpStats);
        if (nlpStats.entityCount > 0) highlightNlpEntities(p, nlpStats);
        if (nlpStats.dateValueCount > 0) highlightNlpValuesDates(p, nlpStats);
        if (nlpStats.adverbCount > 0) highlightNlpAdverbs(p, nlpStats);
        if (repeatedSet.size > 0)   highlightInNode(p, repeatedSet, 'ws-repeated');
        highlightEvidenceInParagraph(p);
        highlightModalVerbs(p);
        highlightFirstPerson(p);
        highlightCitationSentStart(p);
        highlightPronounAmbig(p);
        refreshHighlightTooltips(p);

        var stats = {
          text: text,
          wordCount: wordCount, sentences: sentences, maxSentLen: maxSentLen,
          lexDiv: lexDiv, repeated: repeated, passiveCount: passiveCount,
          paraLong: paraLong, crossInPara: crossInPara,
          citationMarkers: citeStats.markers,
          citationKeyCount: citeStats.keys.length,
          citationKeys: citeStats.keys,
          needsCitation: needsCitationSection,
          resultsCitation: resultsSection,
          noVerbCount: Number(row.noVerbCount) || countNoVerbSentences(sentences),
          syllableCount: syllableCount,
          complexWordCount: complexWordCount,
          hedgeCount: hedgeCount,
          wordyCount: wordyCount,
          complexSentenceCount: complexSentenceCount,
          nlpStats: nlpStats,
        };
        stats.alert = hasParagraphAlert(stats, inMethods);
        stats.critical = paraLong || maxSentLen > SENT_LONG || maxRepeatedCount(repeated) >= REPEATED_STRONG ||
          passiveCount >= (inMethods ? METHODS_PASSIVE_ALERT : PASSIVE_ALERT) ||
          hedgeCount >= HEDGE_ALERT ||
          (needsCitationSection && !citeStats.markers) ||
          (resultsSection && citeStats.markers > 0);
        if (needsCitationSection && !citeStats.markers) {
          p.classList.add('ws-citation-low');
          p.title = (p.title ? p.title + ' | ' : '') + L.noCitationsIntroDiscussion;
        }
        if (resultsSection && citeStats.markers > 0) {
          p.classList.add('ws-results-citation');
          p.title = (p.title ? p.title + ' | ' : '') + L.resultsCitationDesc;
        }

        var note    = buildNote(stats);
        var wrapper = document.createElement('div');
        wrapper.className = 'ws-wrapper' + (paraLong ? ' ws-para-long' : '') +
          (stats.alert ? ' ws-has-alert' : '') + (stats.critical ? ' ws-has-critical' : '');
        p.parentNode.insertBefore(wrapper, p);
        wrapper.appendChild(p);
        wrapper.appendChild(note);

        allWrappers.push(wrapper);
        allStats.push(stats);
        allTexts.push(text);
        statsList.push(stats);
      });

      totalDocWords += sectionWords;
      var summary = sectionSummary(sectionId, sectionTitle, statsList, sectionWords, paraTexts.join(' '));
      allSections.push(summary);
      buildSectionStats(section, statsList, sectionWords, summary);
    }

    await winkPromise;
    var _docText = allTexts.join('\n\n');
    var _winkStats = analyzeWinkNlp(_docText);
    buildDocStats(root, totalDocWords, allStats, allSections, _docText, _winkStats);
    if (loadingPill && loadingPill.parentNode) loadingPill.remove();
    addFocusMode(allWrappers);
    buildControls();
  }

  function runSafe() {
    run().catch(function (err) {
      console.error('[scientific-writing] analysis failed', err);
    });
  }

  function bootDOITooltips() {
    var r = document.getElementById('quarto-document-content') ||
            document.querySelector('main') ||
            document.body;
    try { wireDOITooltips(r); } catch (e) {
      console.error('[scientific-writing] wireDOITooltips failed', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runSafe);
    document.addEventListener('DOMContentLoaded', bootDOITooltips);
  } else {
    runSafe();
    bootDOITooltips();
  }
