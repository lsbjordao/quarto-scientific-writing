(function () {
  'use strict';

  var CFG = window.WritingStatsConfig || {};
  var PARA_LONG = Number(CFG.paragraphLong) || 150;
  var SENT_LONG = Number(CFG.sentenceLong) || 30;
  var READ_WPM  = 200;
  var PASSIVE_ALERT = Number(CFG.passiveThreshold) || 3;
  var METHODS_PASSIVE_ALERT = Number(CFG.methodsPassiveThreshold) || 5;
  var LEX_LOW = Number(CFG.lexicalDiversityLow) || 0.50;
  var REPEATED_STRONG = Number(CFG.repeatedStrong) || 3;
  var HEDGE_ALERT = Number(CFG.hedgeThreshold) || 4;
  var SECTION_GOALS = {};
  var EXCLUDED_TERMS = new Set();
  var CONNECTOR_AMBIGUITY_MODE = 'strict';
  var CONNECTOR_AMBIGUITY_OVERRIDES = {};
  var VARIABLE_COUNT = 0;
  var VARIABLE_NAMES = [];
  var VARIABLE_NUMERIC_VALUES = new Set(); // numeric strings from _variables.yml
  var VARIABLE_MAP = {};  // value_string -> [name, ...] from _variables.yml
  var SOURCE_EVIDENCE_TOKENS = [];
  var SOURCE_EVIDENCE_INDEX = 0;
  var REFERENCE_KEYS = [];
  var ANALYSIS_CACHE = Object.create(null);
  var ANALYSIS_WORKER = null;
  var ANALYSIS_WORKER_DISABLED = false;
  var ANALYSIS_REQ_ID = 0;
  var ANALYSIS_TELEMETRY = {
    hits: 0,
    misses: 0,
    batches: 0,
    durationMs: 0,
    mode: 'sync',
  };

  function parseSectionGoals(raw) {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    if (typeof raw !== 'string') return {};
    try {
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function parseTermList(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      return raw.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    }
    return [];
  }

  function normalizeWord(w) {
    return String(w || '').toLowerCase().trim();
  }

  function normalizeConnectorAmbiguityMode(mode) {
    var m = String(mode || 'strict').toLowerCase().trim();
    if (m === 'lenient') return 'lenient';
    if (m === 'balanced') return 'balanced';
    return 'strict';
  }

  function parseAmbiguityOverrides(raw) {
    if (!raw) return {};
    var obj = raw;
    if (typeof raw === 'string') {
      try {
        obj = JSON.parse(raw);
      } catch (e) {
        return {};
      }
    }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};

    var out = {};
    Object.keys(obj).forEach(function (k) {
      var nk = normalizeWord(k);
      if (!nk) return;
      out[nk] = normalizeConnectorAmbiguityMode(obj[k]);
    });
    return out;
  }

  function shouldIgnoreWord(w) {
    return EXCLUDED_TERMS.has(normalizeWord(w));
  }

  function applyConfig() {
    CFG = window.WritingStatsConfig || CFG || {};
    PARA_LONG = Number(CFG.paragraphLong) || PARA_LONG;
    SENT_LONG = Number(CFG.sentenceLong) || SENT_LONG;
    PASSIVE_ALERT = Number(CFG.passiveThreshold) || PASSIVE_ALERT;
    METHODS_PASSIVE_ALERT = Number(CFG.methodsPassiveThreshold) || METHODS_PASSIVE_ALERT;
    LEX_LOW = Number(CFG.lexicalDiversityLow) || LEX_LOW;
    REPEATED_STRONG = Number(CFG.repeatedStrong) || REPEATED_STRONG;
    HEDGE_ALERT = Number(CFG.hedgeThreshold) || HEDGE_ALERT;
    SECTION_GOALS = parseSectionGoals(CFG.sectionGoalsRaw || CFG.sectionGoals);
    EXCLUDED_TERMS = new Set(parseTermList(CFG.ignoreTerms).map(normalizeWord));
    CONNECTOR_AMBIGUITY_MODE = normalizeConnectorAmbiguityMode(CFG.connectorAmbiguityMode);
    CONNECTOR_AMBIGUITY_OVERRIDES = parseAmbiguityOverrides(CFG.connectorAmbiguityOverrides);
    VARIABLE_COUNT = Number(CFG.variableCount) || 0;
    var rawEntries = CFG.variableEntries;
    if (Array.isArray(rawEntries)) {
      VARIABLE_MAP = {};
      VARIABLE_NAMES = [];
      VARIABLE_NUMERIC_VALUES = new Set();
      rawEntries.forEach(function (e) {
        var v = String(e.value);
        VARIABLE_NAMES.push(e.name);
        VARIABLE_NUMERIC_VALUES.add(v);
        if (!VARIABLE_MAP[v]) VARIABLE_MAP[v] = [];
        VARIABLE_MAP[v].push(e.name);
      });
    }
    SOURCE_EVIDENCE_TOKENS = Array.isArray(CFG.sourceEvidenceTokens) ? CFG.sourceEvidenceTokens : [];
    SOURCE_EVIDENCE_INDEX = 0;
    REFERENCE_KEYS = Array.isArray(CFG.referenceKeys) ? CFG.referenceKeys : [];
  }

  // Quarto propagates YAML `lang` to <html lang="...">.
  // Keep the extension configuration-free by using that value at runtime.
  function getDocumentLang() {
    var raw = ((document.documentElement.getAttribute('lang') || 'pt') + '').toLowerCase();
    var base = raw.split('-')[0];
    return base === 'en' ? 'en' : 'pt';
  }

  var LANG = getDocumentLang();

  // ── Stop words ─────────────────────────────────────────────────────────────

  var STOP_PT = new Set([
    'para', 'como', 'mais', 'esse', 'essa', 'este', 'esta', 'estes', 'estas',
    'isso', 'aqui', 'também', 'tambem', 'sobre', 'após', 'apos', 'além', 'alem',
    'ainda', 'muito', 'pelo', 'pela', 'pelos', 'pelas', 'entre', 'todo', 'toda',
    'todos', 'todas', 'seus', 'suas', 'nosso', 'nossa', 'quando', 'qual', 'onde',
    'quem', 'cada', 'eram', 'foram', 'sera', 'será', 'sendo', 'tendo', 'serão',
    'cujo', 'cuja', 'cujos', 'cujas', 'disso', 'desse', 'dessa', 'neste', 'nesta',
    'numa', 'numas', 'outro', 'outra', 'outros', 'outras', 'mesmo', 'mesma',
    'pois', 'logo', 'porém', 'porem', 'contudo', 'entretanto', 'embora',
    'enquanto', 'portanto', 'assim', 'então', 'entao', 'jamais', 'nunca',
  ]);

  var STOP_EN = new Set([
    'the', 'and', 'for', 'with', 'that', 'this', 'these', 'those', 'from',
    'have', 'been', 'were', 'which', 'when', 'where', 'what', 'their', 'there',
    'they', 'into', 'some', 'also', 'than', 'then', 'them', 'such', 'after',
    'while', 'will', 'shall', 'would', 'could', 'should', 'must', 'does',
    'both', 'each', 'other', 'most', 'over', 'even', 'just', 'very', 'well',
    'here', 'only', 'more', 'about', 'under', 'between', 'among', 'within',
    'through', 'during', 'before', 'being', 'having', 'making', 'using',
  ]);

  var STOP_WORDS = LANG === 'en' ? STOP_EN : STOP_PT;

  // ── Passive voice patterns ─────────────────────────────────────────────────

  var PT_WORD = '[a-záéíóúàâêôãõüç]+';

  // PT: ser/estar auxiliary + optional adverb + regular or common irregular
  //     past participle, OR reflexive passive verb-se.
  var PASSIVE_PT = [
    new RegExp(
      '(?<![a-záéíóúàâêôãõüç])(?:é|são|foi|foram|era|eram|será|serão|seja|sejam|seria|seriam|' +
      'está|estão|esteve|estiveram|estava|estavam)\\s+' +
      '(?:' + PT_WORD + '\\s+){0,2}' +
      '(?:' + PT_WORD + '(?:ado|ada|ados|adas|ido|ida|idos|idas)|' +
      '(?:aberto|aberta|abertos|abertas|coberto|coberta|cobertos|cobertas|' +
      'dito|dita|ditos|ditas|escrito|escrita|escritos|escritas|' +
      'feito|feita|feitos|feitas|posto|posta|postos|postas|' +
      'visto|vista|vistos|vistas|seco|seca|secos|secas))\\b',
      'gi'
    ),
    /(?<![a-záéíóúàâêôãõüç])[a-záéíóúàâêôãõüç]{3,}(?:ou|iu|eu|aram|eram|iram|am|em)\s*-\s*se\b/gi,
  ];

  // EN: to-be auxiliary + optional adverb + past participle (-ed/-en),
  //     including perfect passive and a small set of common irregulars.
  var PASSIVE_EN = [
    /\b(?:is|are|was|were|be|being|been)\s+(?:(?:often|widely|visibly|strongly|significantly|usually|commonly|fully|partly|partially|previously|recently|carefully|rapidly|slowly)\s+){0,2}(?:[a-z]{3,}(?:ed|en)|built|done|found|given|grown|kept|known|made|seen|shown|taken|used)\b/gi,
    /\b(?:has|have|had)\s+been\s+(?:[a-z]+ly\s+){0,2}(?:[a-z]{3,}(?:ed|en)|built|done|found|given|grown|kept|known|made|seen|shown|taken|used)\b/gi,
  ];

  var PASSIVE_PATTERNS = LANG === 'en' ? PASSIVE_EN : PASSIVE_PT;

  // ── UI labels ──────────────────────────────────────────────────────────────

  var L = {
    pt: {
      wSuffix: 'p', sent: 'frase', sentP: 'frases',
      diversity: '🔵 diversidade', longSent: '🟡 frase longa',
      passive: '〰 passiva', repeated: 'repetidas:', cross: 'recorrente na seção:',
      readTime: 'min de leitura', words: 'palavras', parag: 'parágrafo', paragP: 'parágrafos',
      alert: 'alerta', alertP: 'alertas', observation: 'observação', observationP: 'observações',
      hideBtn: 'ocultar anotações', showBtn: 'mostrar anotações',
      alertsOnlyBtn: 'só alertas', allNotesBtn: 'todas as notas',
      compactBtn: 'compacto', fullBtn: 'completo', exportBtn: 'exportar relatório',
      reviewBtn: 'revisão final', reviewOffBtn: 'revisão final: off',
      rhythmTitle: 'ritmo das frases (comprimento relativo de cada frase)',
      toggleTitle: 'Alternar anotações de escrita',
      alertsOnlyTitle: 'Mostrar somente parágrafos com alertas',
      compactTitle: 'Alternar painel geral compacto',
      exportTitle: 'Exportar relatório Markdown das métricas',
      reviewTitle: 'Mostrar somente pontos críticos para revisão final',
      avgSentence: 'frase média', sentenceVar: 'var. frases',
      avgParagraph: 'parágrafo médio', longestSentence: 'maior frase',
      docDiversity: 'diversidade', passiveTotal: 'passivas',
      passiveDensity: 'dens. passiva', longSentenceRate: 'frases longas',
      topRepeated: 'repetições globais', connectors: 'conectores', nominalization: 'nominalizações',
      connectorAdd: 'conectores aditivos', connectorContrast: 'conectores de contraste',
      connectorCause: 'conectores de causa', connectorConclusion: 'conectores de conclusão',
      connectorTime: 'conectores temporais',
      ambiguityStrict: 'ambiguidade: estrito',
      ambiguityBalanced: 'ambiguidade: balanceado',
      ambiguityLenient: 'ambiguidade: tolerante',
      sectionScore: 'score seção', goalIssues: 'metas',
      noVerb: 'sem verbo claro', sectionMap: 'mapa de seções',
      rhythm: 'ritmo por seção', denseSections: 'seções densas',
      passiveExpected: 'passiva concentrada onde é esperada',
      passiveSpread: 'passiva espalhada fora de métodos',
      noDenseSections: 'sem seção muito densa',
      reportTitle: 'Relatório de escrita', alertReasons: 'motivos do alerta',
      reasonParaLong: 'parágrafo longo', reasonSentLong: 'frase longa',
      reasonLexLow: 'diversidade lexical baixa', reasonRepeat: 'repetição forte',
      reasonPassive: 'muita voz passiva',
      reasonHedge: 'atenuadores excessivos',
      reasonFewCitations: 'poucas citações na seção',
      reasonResultsCitation: 'citação em Resultados',
      analysisPreparing: 'analisando texto...', analysisEngine: 'motor JS-only',
      analysisWorker: 'worker', analysisSync: 'direto', analysisCache: 'cache', analysisTime: 'tempo',
      readability: 'legibilidade', flesch: 'flesch', grade: 'nível', fog: 'fog',
      complexSent: 'frases complexas', hedges: 'atenuadores', repeatedStarts: 'inícios repetidos',
      hedgeDensity: 'dens. atenuadores',
      undefinedAcronyms: 'siglas sem definição', emphaticPunct: 'pontuação enfática',
      evidence: 'evidências', evidenceDensity: 'dens. evidências',
      termVariants: 'variações de termo', cohesionGaps: 'lacunas de coesão',
      abstractCoverage: 'cobertura resumo', colloquial: 'informalidade',
      avgSentenceDesc: 'Comprimento médio das frases (palavras). Recomendado: ≤25 para textos científicos.',
      sentenceVarDesc: 'Variação no comprimento das frases. Maior variação indica ritmo mais dinâmico.',
      avgParagraphDesc: 'Comprimento médio dos parágrafos em palavras.',
      longestSentenceDesc: 'Maior frase do documento. Clique para destacar frases longas no texto.',
      docDiversityDesc: 'Diversidade lexical: % de palavras únicas. Acima de 55% indica boa variação vocabular.',
      passiveTotalDesc: 'Total de construções em voz passiva detectadas. Clique para destacar no texto.',
      passiveDensityDesc: 'Voz passiva por 1000 palavras. Aceitável em Métodos; evitar nas demais seções.',
      longSentRateDesc: 'Proporção de frases longas (acima do limite configurado). Clique para destacar no texto.',
      topRepeatedDesc: 'Palavras com maior número de repetições no documento. Clique para destacar.',
      connectorsDesc: 'Total de conectores detectados. Clique para destacar no texto.',
      nominalizationDesc: 'Nominalizações: substantivos derivados de verbos/adjetivos que densificam o texto. Clique para destacar.',
      fleschDesc: 'Flesch Reading Ease: quanto maior, mais fácil. 0–30 = muito difícil (acadêmico); 60–70 = padrão jornalístico.',
      gradeDesc: 'Flesch-Kincaid Grade Level: equivalência ao ano escolar americano. Artigos científicos típicos ficam entre 12–16.',
      fogDesc: 'Gunning Fog Index: estima os anos de escolaridade necessários para compreender o texto na primeira leitura. Fórmula: 0,4 × (palavras/frase + % palavras complexas). Textos acadêmicos: 12–18.',
      complexSentDesc: 'Frases com múltiplas orações subordinadas ou alta complexidade sintática.',
      hedgeDesc: 'Atenuadores: expressões que reduzem a força assertiva (ex.: pode, sugere, parece). Clique para destacar.',
      undefinedAcronymsDesc: 'Siglas usadas no texto sem definição prévia entre parênteses.',
      emphaticPunctDesc: 'Ocorrências de pontuação enfática (! ou ??) — inadequadas em textos científicos.',
      evidenceDesc: 'Marcadores de evidência: números, percentuais, unidades de medida e citações. Clique para destacar no texto.',
      termVariantsDesc: 'Formas divergentes de um mesmo termo — possível inconsistência terminológica.',
      cohesionGapsDesc: 'Parágrafos sem conector de transição no início, após parágrafo de múltiplas frases. Clique para destacar.',
      abstractCoverageDesc: 'Presença dos elementos esperados no Resumo: objetivo, método, resultado, conclusão.',
      colloquialDesc: 'Termos informais ou coloquiais detectados — evitar em textos científicos.',
      repeatedStartsDesc: 'Frases consecutivas que iniciam com a mesma palavra ou expressão.',
      sectionScoreDesc: 'Score médio de complexidade das seções (0–100). Valores altos indicam seções mais densas.',
      noVerbDesc: 'Frases sem verbo principal identificável. Clique para destacar no texto.',
      connectorAddDesc: 'Conectores aditivos (e, além disso, também…). Clique para destacar.',
      connectorContrastDesc: 'Conectores de contraste (mas, porém, contudo…). Clique para destacar.',
      connectorCauseDesc: 'Conectores de causa/efeito (porque, pois, portanto…). Clique para destacar.',
      connectorConclusionDesc: 'Conectores de conclusão (logo, assim, portanto…). Clique para destacar.',
      connectorTimeDesc: 'Conectores temporais (quando, depois, antes…). Clique para destacar.',
      pronounAmbig: 'pronomes ambíguos',
      pronounAmbigDesc: 'Frases iniciadas com pronomes demonstrativos/pessoais sem antecedente claro (isso, este, eles…).',
      modalVerbs: 'verbos modais',
      modalVerbsDesc: 'Verbos modais (pode, deve, seria…). Excesso em Resultados indica falta de assertividade. Clique para destacar.',
      firstPerson: 'primeira pessoa',
      firstPersonDesc: 'Uso de primeira pessoa (eu, nós, nossa…). Verifique as normas do periódico. Clique para destacar.',
      sectionBalance: 'balanço de seções',
      sectionBalanceDesc: 'Variação (CV) no comprimento das seções. Seções muito curtas ou longas em relação ao total são sinalizadas.',
      paraOpeningRepeat: 'aberturas de ¶ repetidas',
      paraOpeningRepeatDesc: 'Parágrafos que iniciam com a mesma palavra — indicativo de monotonia estrutural.',
      citationSentStart: 'citações no início',
      citationSentStartDesc: 'Frases que iniciam diretamente com uma citação — má prática editorial. Clique para destacar.',
      citationSentEnd: 'citações no fim',
      citationSentEndDesc: 'Frases que terminam com citação antes de concluir a ideia própria.',
      abstractWordCount: 'palavras no resumo',
      abstractWordCountDesc: 'Contagem de palavras no Resumo/Abstract. Faixa típica: 150–300 palavras.',
      unitConsistency: 'unidades inconsistentes',
      unitConsistencyDesc: 'Diferentes formas de escrever a mesma unidade de medida no documento.',
      evidenceCited: 'evidências citadas',
      evidenceCitedDesc: 'Valores numéricos e citações em frases com referência bibliográfica próxima.',
      evidenceHardcoded: 'evidências sem citação',
      evidenceHardcodedDesc: 'Valores numéricos em frases sem referência bibliográfica próxima. Considere citar a fonte. Clique para destacar.',
      evidenceParameterized: 'evidências parametrizadas',
      evidenceParameterizedDesc: 'Valores numéricos que correspondem a variáveis definidas em _variables.yml.',
      evidenceUnparameterized: 'evidências não parametrizadas',
      evidenceUnparameterizedDesc: 'Valores numéricos não vinculados a nenhuma variável em _variables.yml — considere parametrizá-los para facilitar atualizações.',
      variableCount: 'variáveis definidas',
      variableCountDesc: 'Número de variáveis escalares definidas em _variables.yml.',
      referencesUsed: 'referências usadas',
      referencesUsedDesc: 'Entradas do ref.bib citadas no manuscrito.',
      citationsTotal: 'citações',
      citationsTotalDesc: 'Marcadores de citação detectados no texto.',
      citations: 'citações',
      noCitationsIntroDiscussion: 'Introdução/Discussão sem citação neste parágrafo.',
      resultsCitationDesc: 'Resultados com citação: verifique se é realmente necessário.',
    },
    en: {
      wSuffix: 'w', sent: 'sentence', sentP: 'sentences',
      diversity: '🔵 diversity', longSent: '🟡 long sentence',
      passive: '〰 passive', repeated: 'repeated:', cross: 'recurrent in section:',
      readTime: 'min read', words: 'words', parag: 'paragraph', paragP: 'paragraphs',
      alert: 'alert', alertP: 'alerts', observation: 'observation', observationP: 'observations',
      hideBtn: 'hide notes', showBtn: 'show notes',
      alertsOnlyBtn: 'alerts only', allNotesBtn: 'all notes',
      compactBtn: 'compact', fullBtn: 'full', exportBtn: 'export report',
      reviewBtn: 'final review', reviewOffBtn: 'final review: off',
      rhythmTitle: 'sentence rhythm (relative length per sentence)',
      toggleTitle: 'Toggle writing annotations',
      alertsOnlyTitle: 'Show only paragraphs with alerts',
      compactTitle: 'Toggle compact document panel',
      exportTitle: 'Export a Markdown report with writing metrics',
      reviewTitle: 'Show only critical points for final revision',
      avgSentence: 'avg sentence', sentenceVar: 'sentence var.',
      avgParagraph: 'avg paragraph', longestSentence: 'longest sentence',
      docDiversity: 'diversity', passiveTotal: 'passives',
      passiveDensity: 'passive dens.', longSentenceRate: 'long sentences',
      topRepeated: 'global repeats', connectors: 'connectors', nominalization: 'nominalizations',
      connectorAdd: 'additive connectors', connectorContrast: 'contrast connectors',
      connectorCause: 'causal connectors', connectorConclusion: 'conclusion connectors',
      connectorTime: 'temporal connectors',
      ambiguityStrict: 'ambiguity: strict',
      ambiguityBalanced: 'ambiguity: balanced',
      ambiguityLenient: 'ambiguity: lenient',
      sectionScore: 'section score', goalIssues: 'goals',
      noVerb: 'no clear verb', sectionMap: 'section map',
      rhythm: 'rhythm by section', denseSections: 'dense sections',
      passiveExpected: 'passive voice concentrated where expected',
      passiveSpread: 'passive voice spread beyond methods',
      noDenseSections: 'no very dense section',
      reportTitle: 'Writing report', alertReasons: 'alert reasons',
      reasonParaLong: 'long paragraph', reasonSentLong: 'long sentence',
      reasonLexLow: 'low lexical diversity', reasonRepeat: 'strong repetition',
      reasonPassive: 'high passive voice',
      reasonHedge: 'excessive hedging',
      reasonFewCitations: 'few citations in section',
      reasonResultsCitation: 'citation in Results',
      analysisPreparing: 'analyzing text...', analysisEngine: 'JS-only engine',
      analysisWorker: 'worker', analysisSync: 'direct', analysisCache: 'cache', analysisTime: 'time',
      readability: 'readability', flesch: 'flesch', grade: 'grade', fog: 'fog',
      complexSent: 'complex sentences', hedges: 'hedges', repeatedStarts: 'repeated starts',
      hedgeDensity: 'hedge density',
      undefinedAcronyms: 'undefined acronyms', emphaticPunct: 'emphatic punctuation',
      evidence: 'evidence', evidenceDensity: 'evidence density',
      termVariants: 'term variants', cohesionGaps: 'cohesion gaps',
      abstractCoverage: 'abstract coverage', colloquial: 'colloquial tone',
      avgSentenceDesc: 'Average sentence length (words). Recommended: \u226425 for scientific texts.',
      sentenceVarDesc: 'Variation in sentence length. Greater variation suggests a more dynamic rhythm.',
      avgParagraphDesc: 'Average paragraph length in words.',
      longestSentenceDesc: 'Longest sentence in the document. Click to highlight long sentences in text.',
      docDiversityDesc: 'Lexical diversity: % of unique words. Above 55% indicates good vocabulary variation.',
      passiveTotalDesc: 'Total passive voice constructions detected. Click to highlight in text.',
      passiveDensityDesc: 'Passive voice per 1000 words. Acceptable in Methods; avoid elsewhere.',
      longSentRateDesc: 'Proportion of long sentences (above threshold). Click to highlight in text.',
      topRepeatedDesc: 'Most repeated words in the document. Click to highlight.',
      connectorsDesc: 'Total connectors detected. Click to highlight in text.',
      nominalizationDesc: 'Nominalizations: nouns derived from verbs/adjectives that can densify prose. Click to highlight.',
      fleschDesc: 'Flesch Reading Ease: higher = easier. 0\u201330 = very difficult (academic); 60\u201370 = standard.',
      gradeDesc: 'Flesch-Kincaid Grade Level: U.S. school year equivalent. Academic papers typically score 12\u201316.',
      fogDesc: 'Gunning Fog Index: estimates years of schooling needed to understand the text on first reading. Formula: 0.4 \u00d7 (words/sentence + % complex words). Academic texts: 12\u201318.',
      complexSentDesc: 'Sentences with multiple subordinate clauses or high syntactic complexity.',
      hedgeDesc: 'Hedges: expressions that weaken assertive force (e.g., may, suggests, appears). Click to highlight.',
      undefinedAcronymsDesc: 'Acronyms used in the text without a prior parenthetical definition.',
      emphaticPunctDesc: 'Emphatic punctuation occurrences (! or ??) \u2014 inappropriate in scientific texts.',
      evidenceDesc: 'Evidence markers: numbers, percentages, measurement units, and citations. Click to highlight in text.',
      termVariantsDesc: 'Divergent forms of the same term \u2014 possible terminological inconsistency.',
      cohesionGapsDesc: 'Paragraphs without a transition connector at the start, after a multi-sentence paragraph. Click to highlight.',
      abstractCoverageDesc: 'Presence of expected elements in the Abstract: objective, method, result, conclusion.',
      colloquialDesc: 'Informal or colloquial terms detected \u2014 avoid in scientific writing.',
      repeatedStartsDesc: 'Consecutive sentences beginning with the same word or phrase.',
      sectionScoreDesc: 'Average section complexity score (0\u2013100). Higher values indicate denser sections.',
      noVerbDesc: 'Sentences with no identifiable main verb. Click to highlight in text.',
      connectorAddDesc: 'Additive connectors (and, furthermore, also\u2026). Click to highlight.',
      connectorContrastDesc: 'Contrast connectors (but, however, yet\u2026). Click to highlight.',
      connectorCauseDesc: 'Causal connectors (because, therefore, since\u2026). Click to highlight.',
      connectorConclusionDesc: 'Conclusion connectors (thus, hence, therefore\u2026). Click to highlight.',
      connectorTimeDesc: 'Temporal connectors (when, after, before\u2026). Click to highlight.',
      pronounAmbig: 'ambiguous pronouns',
      pronounAmbigDesc: 'Sentences starting with demonstrative/personal pronouns without a clear antecedent (it, this, they\u2026).',
      modalVerbs: 'modal verbs',
      modalVerbsDesc: 'Modal verbs (may, might, would, should\u2026). Overuse in Results signals lack of assertiveness. Click to highlight.',
      firstPerson: 'first person',
      firstPersonDesc: 'First-person usage (I, we, our\u2026). Check your journal\u2019s style guide. Click to highlight.',
      sectionBalance: 'section balance',
      sectionBalanceDesc: 'Coefficient of variation (CV) of section lengths. Flags sections disproportionately short or long.',
      paraOpeningRepeat: 'repeated \u00b6 openings',
      paraOpeningRepeatDesc: 'Paragraphs starting with the same word \u2014 signals structural monotony.',
      citationSentStart: 'citations at start',
      citationSentStartDesc: 'Sentences opening directly with a citation \u2014 poor editorial practice. Click to highlight.',
      citationSentEnd: 'citations at end',
      citationSentEndDesc: 'Sentences ending with a citation before completing the author\u2019s own idea.',
      abstractWordCount: 'abstract words',
      abstractWordCountDesc: 'Word count of the Abstract. Typical range: 150\u2013300 words.',
      unitConsistency: 'unit inconsistency',
      unitConsistencyDesc: 'Different notations for the same measurement unit detected in the document.',
      evidenceCited: 'cited evidence',
      evidenceCitedDesc: 'Numeric values and citations in sentences with a nearby bibliographic reference.',
      evidenceHardcoded: 'uncited evidence',
      evidenceHardcodedDesc: 'Numeric values in sentences without a nearby bibliographic reference. Consider citing the source. Click to highlight.',
      evidenceParameterized: 'parameterized evidence',
      evidenceParameterizedDesc: 'Numeric values that match a variable defined in _variables.yml.',
      evidenceUnparameterized: 'unparameterized evidence',
      evidenceUnparameterizedDesc: 'Numeric values not linked to any variable in _variables.yml — consider parameterizing them for easier updates.',
      variableCount: 'defined variables',
      variableCountDesc: 'Number of scalar variables defined in _variables.yml.',
      referencesUsed: 'references used',
      referencesUsedDesc: 'ref.bib entries cited in the manuscript.',
      citationsTotal: 'citations',
      citationsTotalDesc: 'Citation markers detected in the text.',
      citations: 'citations',
      noCitationsIntroDiscussion: 'Introduction/Discussion paragraph without citation.',
      resultsCitationDesc: 'Results paragraph with citation: verify whether it is necessary.',
    },
  }[LANG];

  // ── Text analysis ──────────────────────────────────────────────────────────

  function countWords(text) {
    return (text.match(/\S+/g) || []).length;
  }

  function stripDiacritics(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function hashText(text) {
    var s = String(text || '');
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36) + ':' + s.length;
  }

  function getSentences(text) {
    return text
      .split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÀÂÊÔÃÕÜÇÑ"'])/)
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 0; });
  }

  function countSyllablesWord(word) {
    var clean = stripDiacritics(String(word || '').toLowerCase()).replace(/[^a-z]/g, '');
    if (!clean) return 0;

    if (LANG === 'en') {
      if (clean.length <= 3) return 1;
      var trimmed = clean.replace(/(?:e|es|ed)$/i, '');
      var groups = trimmed.match(/[aeiouy]+/g);
      var count = groups ? groups.length : 1;
      return Math.max(1, count);
    }

    var ptGroups = clean.match(/[aeiou]+/g);
    var ptCount = ptGroups ? ptGroups.length : 1;
    return Math.max(1, ptCount);
  }

  function countSyllablesText(text) {
    var RE = LANG === 'en' ? /\b[a-z]{2,}\b/gi : /\b[a-záéíóúàâêôãõüçñ]{2,}\b/gi;
    return (text.match(RE) || []).reduce(function (sum, w) {
      return sum + countSyllablesWord(w);
    }, 0);
  }

  function countComplexWords(text) {
    var RE = LANG === 'en' ? /\b[a-z]{3,}\b/gi : /\b[a-záéíóúàâêôãõüçñ]{3,}\b/gi;
    return (text.match(RE) || []).filter(function (w) {
      var lower = normalizeWord(w);
      return !STOP_WORDS.has(lower) && !shouldIgnoreWord(lower) && countSyllablesWord(lower) >= 3;
    }).length;
  }

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
    var defRe = /\b([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\-]*(?:\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\-]*){1,8})\s+\(([A-Z]{2,})\)/g;
    var acrRe = /\b[A-Z]{2,}s?\b/g;

    sentences.forEach(function (sentence) {
      var s = String(sentence || '');
      var m;
      while ((m = defRe.exec(s)) !== null) {
        defined.add(m[2]);
      }
      defRe.lastIndex = 0;

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

  function countEvidenceMarkers(text) {
    var src = String(text || '');
    var numberLike = src.match(/\b\d+(?:[\.,]\d+)?\b/g) || [];
    var percent = src.match(/\b\d+(?:[\.,]\d+)?\s*%\b/g) || [];
    var units = src.match(/\b\d+(?:[\.,]\d+)?\s*(?:mg|g|kg|ml|l|cm|mm|nm|ha|m\/?s|°c|kpa|pa|ppm|ppb)\b/gi) || [];
    var citations = src.match(/\((?:[^)]*\d{4}[^)]*)\)|\[[0-9,\-\s]+\]|@\w+/g) || [];
    return numberLike.length + percent.length + units.length + citations.length;
  }

  function countCohesionGaps(paragraphTexts) {
    var texts = paragraphTexts || [];
    if (texts.length < 2) return 0;

    var starts = getConnectorTerms().map(function (t) { return normalizeWord(t); });
    var gaps = 0;

    function startsWithConnector(p) {
      var lead = normalizeWord(String(p || '').slice(0, 80));
      return starts.some(function (c) {
        return lead.indexOf(c + ' ') === 0 || lead.indexOf(c + ',') === 0 || lead === c;
      });
    }

    for (var i = 1; i < texts.length; i++) {
      var prev = texts[i - 1] || '';
      var cur = texts[i] || '';
      var prevSent = getSentences(prev).length;
      if (prevSent >= 2 && !startsWithConnector(cur)) gaps++;
    }
    return gaps;
  }

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

  function getParaOpeningRepeats(paragraphTexts) {
    var freq = {};
    (paragraphTexts || []).forEach(function (t) {
      var first = (t.trim().split(/\s+/)[0] || '').toLowerCase().replace(/[^a-z\u00e1\u00e9\u00ed\u00f3\u00fa\u00e0\u00e2\u00ea\u00f4\u00e3\u00f5\u00fc\u00e7]/gi, '');
      if (first.length < 3) return;
      freq[first] = (freq[first] || 0) + 1;
    });
    return Object.keys(freq)
      .filter(function (k) { return freq[k] >= 2; })
      .sort(function (a, b) { return freq[b] - freq[a]; })
      .map(function (k) { return { word: k, count: freq[k] }; });
  }

  function countCitationSentStart(sentences) {
    return (sentences || []).filter(function (s) {
      return /^\s*[\(\[]/.test(s.trim());
    }).length;
  }

  function countCitationSentEnd(sentences) {
    return (sentences || []).filter(function (s) {
      return /\((?:[^)]*\d{4}[^)]*)\)\s*\.?\s*$|\[[0-9,\-\s]+\]\s*\.?\s*$/.test(s.trim());
    }).length;
  }

  function citationStatsForElement(el) {
    var keys = new Set();
    var markers = 0;
    if (el && el.querySelectorAll) {
      el.querySelectorAll('.citation').forEach(function (node) {
        markers++;
        String(node.getAttribute('data-cites') || '').split(/\s+/).forEach(function (key) {
          if (key) keys.add(key);
        });
      });
    }
    return { markers: markers, keys: Array.from(keys) };
  }

  function getReferenceUsage(root) {
    var keys = new Set();
    var markerCount = 0;
    (root || document).querySelectorAll('.citation').forEach(function (node) {
      markerCount++;
      String(node.getAttribute('data-cites') || '').split(/\s+/).forEach(function (key) {
        if (key) keys.add(key);
      });
    });
    var defined = new Set(REFERENCE_KEYS);
    var used = Array.from(keys);
    var unused = REFERENCE_KEYS.filter(function (key) { return !keys.has(key); });
    var undefinedKeys = used.filter(function (key) { return !defined.has(key); });
    return {
      defined: REFERENCE_KEYS.length,
      used: used,
      unused: unused,
      undefinedKeys: undefinedKeys,
      markerCount: markerCount,
    };
  }

  function getAbstractWordCount(sectionSummaries) {
    var abs = (sectionSummaries || []).find(function (s) { return isAbstractLikeTitle(s.title || ''); });
    return abs ? (abs.words || 0) : 0;
  }

  function getUnitInconsistency(text) {
    var src = String(text || '').toLowerCase();
    var forms = [];
    if (/\bmg\/kg\b/.test(src) && /\bmg\s*kg[\-\u2212]1\b/.test(src)) forms.push('mg/kg ~ mg kg\u207b\u00b9');
    if (/\bg\/kg\b/.test(src) && /\bg\s*kg[\-\u2212]1\b/.test(src)) forms.push('g/kg ~ g kg\u207b\u00b9');
    if (/\bml\/l\b/.test(src) && /\bml\s*l[\-\u2212]1\b/.test(src)) forms.push('mL/L ~ mL L\u207b\u00b9');
    if (/\b\d+\s*%/.test(src) && /\bpercent\b/.test(src)) forms.push('% ~ percent');
    if (/\bcm2\b/.test(src) && /\bcm\u00b2\b/.test(src)) forms.push('cm2 ~ cm\u00b2');
    return forms;
  }

  function getSectionBalance(sections) {
    if (!sections || sections.length < 2) return { cv: 0, outliers: [] };
    var words = sections.map(function (s) { return s.words || 0; });
    var avg = words.reduce(function (a, b) { return a + b; }, 0) / words.length;
    if (avg === 0) return { cv: 0, outliers: [] };
    var std = Math.sqrt(words.reduce(function (sum, w) { return sum + Math.pow(w - avg, 2); }, 0) / words.length);
    var cv = std / avg;
    var outliers = sections.filter(function (s) { return Math.abs((s.words || 0) - avg) > 1.5 * std; }).map(function (s) { return s.title; });
    return { cv: round1(cv), outliers: outliers };
  }

  function countEvidenceDetailed(root, text) {
    if (root && root.querySelectorAll) {
      var parameterizedNodes = root.querySelectorAll('.ws-evidence-parameterized').length;
      var hardcodedNodes = root.querySelectorAll('.ws-evidence-hardcoded').length;
      var citedNodes = root.querySelectorAll('.ws-evidence').length;
      return {
        cited: citedNodes,
        hardcoded: hardcodedNodes,
        parameterized: parameterizedNodes,
        unparameterized: citedNodes + hardcodedNodes,
      };
    }

    var src = String(text || '');
    var citationRe = /\((?:[^)]*\d{4}[^)]*)\)|\[[0-9,\-\s]+\]|@\w+/g;
    var cm;
    var citationPositions = [];
    while ((cm = citationRe.exec(src)) !== null) citationPositions.push(cm.index);
    citationRe.lastIndex = 0;
    var WINDOW = 200;
    function isCited(pos) {
      return citationPositions.some(function (cp) { return Math.abs(cp - pos) <= WINDOW; });
    }
    function isParameterized() { return false; }
    var numRe = /\b\d+(?:[\.,]\d+)?\s*(?:%|mg|g|kg|ml|l|cm|mm|nm|ha|m\/s|\u00b0c|kpa|pa|ppm|ppb)?\b/gi;
    var cited = 0, hardcoded = 0, parameterized = 0, unparameterized = 0;
    var m;
    while ((m = numRe.exec(src)) !== null) {
      var numOnly = m[0].replace(/[^0-9,\.]/g, '').trim();
      var cited_ = isCited(m.index);
      var param_ = isParameterized(numOnly);
      if (cited_) cited++; else hardcoded++;
      if (param_) parameterized++; else unparameterized++;
    }
    cited += citationPositions.length;
    return { cited: cited, hardcoded: hardcoded, parameterized: parameterized, unparameterized: unparameterized };
  }

  function isInsideBibliographicCitation(node) {
    return !!(node && node.parentElement && node.parentElement.closest &&
      node.parentElement.closest('.citation, .csl-entry, #refs, [role="doc-biblioref"]'));
  }

  function computeReadability(totalWords, sentenceCount, totalSyllables, complexWords) {
    if (!totalWords || !sentenceCount) {
      return { flesch: 0, grade: 0, fog: 0 };
    }
    var wordsPerSentence = totalWords / sentenceCount;
    var syllablesPerWord = totalSyllables > 0 ? totalSyllables / totalWords : 1;
    var complexPct = complexWords > 0 ? (complexWords / totalWords) * 100 : 0;

    var flesch = LANG === 'en'
      ? 206.835 - (1.015 * wordsPerSentence) - (84.6 * syllablesPerWord)
      : 248.835 - (1.015 * wordsPerSentence) - (84.6 * syllablesPerWord);
    var grade = (0.39 * wordsPerSentence) + (11.8 * syllablesPerWord) - 15.59;
    var fog = 0.4 * (wordsPerSentence + complexPct);

    return {
      flesch: round1(flesch),
      grade: round1(grade),
      fog: round1(fog),
    };
  }

  function getLexDiv(text) {
    var RE = LANG === 'en' ? /\b[a-z]{3,}\b/gi : /\b[a-záéíóúàâêôãõüçñ]{3,}\b/gi;
    var tokens = (text.match(RE) || [])
      .map(function (w) { return w.toLowerCase(); })
      .filter(function (w) { return !STOP_WORDS.has(w) && !shouldIgnoreWord(w); });
    if (tokens.length === 0) return 1;
    return (new Set(tokens)).size / tokens.length;
  }

  function getIntraRepeated(text) {
    var RE = LANG === 'en' ? /\b[a-z]{4,}\b/gi : /\b[a-záéíóúàâêôãõüç]{4,}\b/gi;
    var freq = {};
    (text.match(RE) || []).forEach(function (w) {
      var lower = w.toLowerCase();
      if (!STOP_WORDS.has(lower) && !shouldIgnoreWord(lower)) freq[lower] = (freq[lower] || 0) + 1;
    });
    var result = {};
    Object.keys(freq)
      .filter(function (k) { return freq[k] > 1; })
      .sort(function (a, b) { return freq[b] - freq[a]; })
      .forEach(function (k) { result[k] = freq[k]; });
    return result;
  }

  function getGlobalFrequent(text, limit) {
    var RE = LANG === 'en' ? /\b[a-z]{4,}\b/gi : /\b[a-záéíóúàâêôãõüç]{4,}\b/gi;
    var freq = {};
    (text.match(RE) || []).forEach(function (w) {
      var lower = w.toLowerCase();
      if (!STOP_WORDS.has(lower) && !shouldIgnoreWord(lower)) freq[lower] = (freq[lower] || 0) + 1;
    });
    return Object.keys(freq)
      .filter(function (k) { return freq[k] > 2; })
      .sort(function (a, b) { return freq[b] - freq[a]; })
      .slice(0, limit)
      .map(function (k) { return k + ' ×' + freq[k]; });
  }

  function getConnectorCategories() {
    if (LANG === 'en') {
      return {
        add: [
          'also', 'moreover', 'furthermore', 'in addition', 'additionally',
          'besides', 'as well', 'as well as', 'not only', 'not only that',
          'similarly', 'likewise', 'another point', 'equally'
        ],
        contrast: [
          'however', 'although', 'whereas', 'nevertheless', 'nonetheless',
          'on the other hand', 'by contrast', 'in contrast', 'yet', 'still',
          'even so', 'despite this', 'conversely', 'rather'
        ],
        cause: [
          'because', 'since', 'as', 'due to', 'owing to', 'because of',
          'therefore', 'thus', 'consequently', 'as a result', 'for this reason',
          'hence', 'accordingly', 'thereby'
        ],
        conclusion: [
          'therefore', 'thus', 'in conclusion', 'to conclude', 'overall',
          'in summary', 'to sum up', 'finally', 'ultimately', 'in short',
          'all in all', 'taken together'
        ],
        time: [
          'then', 'afterwards', 'meanwhile', 'subsequently', 'before', 'after',
          'earlier', 'later', 'at first', 'first', 'second', 'third',
          'next', 'finally', 'at the same time', 'simultaneously',
          'currently', 'previously', 'thereafter'
        ],
      };
    }
    return {
      add: [
        'também', 'tambem', 'além disso', 'alem disso', 'assim como',
        'bem como', 'ainda', 'do mesmo modo', 'de igual modo',
        'não só', 'nao so', 'não apenas', 'nao apenas', 'igualmente'
      ],
      contrast: [
        'porém', 'porem', 'entretanto', 'contudo', 'embora', 'por outro lado',
        'todavia', 'no entanto', 'ainda assim', 'mesmo assim', 'ao contrário',
        'em contraste', 'em contrapartida', 'não obstante', 'nao obstante'
      ],
      cause: [
        'porque', 'pois', 'uma vez que', 'visto que', 'já que', 'ja que',
        'devido a', 'em razão de', 'em razao de', 'por causa de',
        'portanto', 'assim', 'desse modo', 'por isso', 'consequentemente',
        'logo', 'dessa forma', 'de modo que'
      ],
      conclusion: [
        'portanto', 'assim', 'desse modo', 'em síntese', 'em sintese',
        'em conclusão', 'em conclusao', 'em suma', 'em resumo',
        'por fim', 'finalmente', 'conclui-se', 'conclui se'
      ],
      time: [
        'então', 'entao', 'depois', 'posteriormente', 'enquanto', 'antes',
        'primeiramente', 'primeiro', 'segundo', 'terceiro', 'em seguida',
        'na sequência', 'na sequencia', 'ao mesmo tempo', 'simultaneamente',
        'anteriormente', 'atualmente', 'de início', 'de inicio'
      ],
    };
  }

  function getContextualConnectorTerms() {
    return LANG === 'en'
      ? new Set(['as', 'since', 'still', 'then', 'after', 'before', 'first', 'second', 'third', 'later', 'finally'])
      : new Set(['assim', 'logo', 'enquanto', 'antes', 'depois', 'primeiro', 'segundo', 'terceiro', 'então', 'entao', 'pois']);
  }

  function isWordChar(ch) {
    return /[a-z0-9áéíóúàâêôãõüçñ]/i.test(ch);
  }

  function findConnectorMatches(text, term, contextualOnly, ambiguityMode) {
    var lower = text.toLowerCase();
    var target = term.toLowerCase();
    var out = [];
    var from = 0;

    while (from < lower.length) {
      var idx = lower.indexOf(target, from);
      if (idx === -1) break;
      var end = idx + target.length;

      var before = idx > 0 ? lower.charAt(idx - 1) : '';
      var after = end < lower.length ? lower.charAt(end) : '';
      var boundaryOk = (!before || !isWordChar(before)) && (!after || !isWordChar(after));

      var contextualOk = true;
      if (contextualOnly) {
        var mode = ambiguityMode || CONNECTOR_AMBIGUITY_MODE;
        if (mode === 'lenient') {
          contextualOk = true;
        } else if (mode === 'balanced') {
          var jb = idx - 1;
          while (jb >= 0 && /\s/.test(lower.charAt(jb))) jb--;
          contextualOk = jb < 0 || /[.!?;:\n,\(\[\-]/.test(lower.charAt(jb));
        } else {
          var j = idx - 1;
          while (j >= 0 && /\s/.test(lower.charAt(j))) j--;
          contextualOk = j < 0 || /[.!?;:\n]/.test(lower.charAt(j));
        }
      }

      if (boundaryOk && contextualOk) {
        out.push([idx, end]);
      }

      from = idx + 1;
    }

    return out;
  }

  function getConnectorTerms() {
    var cats = getConnectorCategories();
    var all = [];
    Object.keys(cats).forEach(function (k) { all = all.concat(cats[k]); });
    return Array.from(new Set(all));
  }

  function countConnectorCategories(text) {
    var categories = getConnectorCategories();
    var contextual = getContextualConnectorTerms();
    var result = { add: 0, contrast: 0, cause: 0, conclusion: 0, time: 0 };

    Object.keys(categories).forEach(function (cat) {
      categories[cat].forEach(function (term) {
        var mode = getConnectorAmbiguityMode(term);
        var matches = findConnectorMatches(text, term, contextual.has(term), mode);
        result[cat] += matches.length;
      });
    });

    return result;
  }

  function highlightConnectorInNode(node, term, cls, title, contextualOnly, ambiguityMode) {
    if (node.nodeType === Node.TEXT_NODE) {
      var text = node.textContent;
      var ranges = findConnectorMatches(text, term, contextualOnly, ambiguityMode);
      if (ranges.length === 0) return;

      var frag = document.createDocumentFragment();
      var pos = 0;
      ranges.forEach(function (rng) {
        if (rng[0] > pos) frag.appendChild(document.createTextNode(text.slice(pos, rng[0])));
        var span = document.createElement('span');
        span.className = cls;
        var catMatch = cls.match(/ws-connector-([a-z-]+)/);
        markReason(span, catMatch ? 'connectors-' + catMatch[1] : 'connectors', title);
        span.textContent = text.slice(rng[0], rng[1]);
        frag.appendChild(span);
        pos = rng[1];
      });
      if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
      node.parentNode.replaceChild(frag, node);

    } else if (
      node.nodeType === Node.ELEMENT_NODE &&
      node.tagName !== 'SCRIPT' && node.tagName !== 'STYLE' &&
      !node.classList.contains('ws-note')
    ) {
      Array.from(node.childNodes).forEach(function (c) {
        highlightConnectorInNode(c, term, cls, title, contextualOnly, ambiguityMode);
      });
    }
  }

  function connectorCategoryLabel(cat) {
    if (cat === 'add') return L.connectorAdd;
    if (cat === 'contrast') return L.connectorContrast;
    if (cat === 'cause') return L.connectorCause;
    if (cat === 'conclusion') return L.connectorConclusion;
    if (cat === 'time') return L.connectorTime;
    return L.connectors;
  }

  function connectorAmbiguityLabel(mode) {
    if (mode === 'lenient') return L.ambiguityLenient;
    if (mode === 'balanced') return L.ambiguityBalanced;
    return L.ambiguityStrict;
  }

  function getConnectorAmbiguityMode(term) {
    var nk = normalizeWord(term);
    if (nk && CONNECTOR_AMBIGUITY_OVERRIDES[nk]) {
      return CONNECTOR_AMBIGUITY_OVERRIDES[nk];
    }
    return CONNECTOR_AMBIGUITY_MODE;
  }

  function countConnectors(text) {
    var byCat = countConnectorCategories(text);
    return Object.keys(byCat).reduce(function (sum, k) { return sum + byCat[k]; }, 0);
  }

  function countNominalizations(text) {
    var re = LANG === 'en'
      ? /\b[a-z]{5,}(?:tion|ment|ity|ness|ance|ence)\b/gi
      : /\b[a-záéíóúàâêôãõüç]{5,}(?:ção|ções|são|sões|mento|mentos|dade|dades|ância|ência)\b/gi;
    return (text.match(re) || []).filter(function (w) { return !shouldIgnoreWord(w); }).length;
  }

  function getVerbRegex() {
    return LANG === 'en'
      ? /\b(?:is|are|was|were|be|been|being|has|have|had|do|does|did|can|could|may|might|must|should|would|will|shall|[a-z]{3,}(?:ed|ing|es|s))\b/i
      : /\b(?:é|são|foi|foram|era|eram|ser|estar|está|estão|teve|tiveram|tem|têm|pode|podem|deve|devem|[a-záéíóúàâêôãõüç]{3,}(?:ar|er|ir|ou|eu|iu|am|em|aram|eram|iram))\b/i;
  }

  function countNoVerbSentences(sentences) {
    var re = getVerbRegex();
    return sentences.filter(function (s) {
      return countWords(s) >= 6 && !re.test(s);
    }).length;
  }

  function getCrossRepeated(paraTexts) {
    var seenInParas = {};
    paraTexts.forEach(function (text) {
      Object.keys(getIntraRepeated(text)).forEach(function (w) {
        seenInParas[w] = (seenInParas[w] || 0) + 1;
      });
    });
    return new Set(Object.keys(seenInParas).filter(function (w) { return seenInParas[w] >= 2; }));
  }

  function countPassive(text) {
    return PASSIVE_PATTERNS.reduce(function (total, re) {
      var matches = text.match(new RegExp(re.source, 'gi'));
      return total + (matches ? matches.length : 0);
    }, 0);
  }

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
          hedgeTerms: getHedgeTerms()
        }
      });
    });
  }

  function sparkline(sentences) {
    var BLOCKS = '▁▂▃▄▅▆▇█';
    if (sentences.length === 0) return '';
    var lengths = sentences.map(countWords);
    var max = Math.max.apply(null, lengths);
    if (max === 0) return '';
    return lengths.map(function (n) {
      return BLOCKS[Math.min(7, Math.round((n / max) * 7))];
    }).join('');
  }

  function mean(nums) {
    if (nums.length === 0) return 0;
    return nums.reduce(function (sum, n) { return sum + n; }, 0) / nums.length;
  }

  function variance(nums) {
    if (nums.length === 0) return 0;
    var avg = mean(nums);
    return mean(nums.map(function (n) { return Math.pow(n - avg, 2); }));
  }

  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

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

  // ── DOM manipulation ───────────────────────────────────────────────────────

  var HIGHLIGHT_FOCUS_CLASSES = {
    'ws-passive': 'passive',
    'ws-long-sentence': 'long',
    'ws-repeated': 'repeated',
    'ws-nominalization': 'nominal',
    'ws-no-verb': 'noverb',
    'ws-hedge': 'hedge',
    'ws-evidence': 'evidence',
    'ws-evidence-hardcoded': 'evidence-hardcoded',
    'ws-evidence-parameterized': 'evidence-parameterized',
    'ws-modal': 'modal',
    'ws-firstperson': 'firstperson',
    'ws-citation-start': 'citation-start',
    'ws-connector': 'connectors',
    'ws-connector-add': 'connectors-add',
    'ws-connector-contrast': 'connectors-contrast',
    'ws-connector-cause': 'connectors-cause',
    'ws-connector-conclusion': 'connectors-conclusion',
    'ws-connector-time': 'connectors-time',
  };

  function markReason(el, focus, reason) {
    if (!el || !reason) return el;
    el.dataset.wsFocus = focus || '';
    el.dataset.wsReason = reason;
    el.title = reason;
    return el;
  }

  function getElementReasons(el) {
    var reasons = [];
    var seen = new Set();
    var node = el;
    while (node && node.nodeType === Node.ELEMENT_NODE && !node.classList.contains('ws-wrapper')) {
      if (node.dataset && node.dataset.wsReason) {
        var key = (node.dataset.wsFocus || '') + '\u0000' + node.dataset.wsReason;
        if (!seen.has(key)) {
          reasons.push({ focus: node.dataset.wsFocus || '', reason: node.dataset.wsReason });
          seen.add(key);
        }
      }
      node = node.parentElement;
    }
    return reasons;
  }

  function getActiveFocus() {
    for (var cls in HIGHLIGHT_FOCUS_CLASSES) {
      var focus = HIGHLIGHT_FOCUS_CLASSES[cls];
      if (focus && document.body.classList.contains('ws-focus-' + focus)) return focus;
    }
    return '';
  }

  function updateTooltipForElement(el) {
    if (document.body.classList.contains('ws-annotations-hidden')) return;
    var reasons = getElementReasons(el);
    if (!reasons.length) return;
    var activeFocus = getActiveFocus();
    var filtered = activeFocus
      ? reasons.filter(function (r) {
          return r.focus === activeFocus ||
            (activeFocus === 'connectors' && r.focus.indexOf('connectors-') === 0) ||
            (activeFocus === 'evidence' && r.focus.indexOf('evidence-') === 0);
        })
      : reasons;
    if (!filtered.length) filtered = reasons;
    el.title = filtered.map(function (r) { return r.reason; }).join(' | ');
  }

  function refreshHighlightTooltips(root) {
    var selector = Object.keys(HIGHLIGHT_FOCUS_CLASSES).map(function (cls) { return '.' + cls; }).join(',');
    (root || document).querySelectorAll(selector).forEach(updateTooltipForElement);
  }

  function annotationTitleSelector() {
    var highlightClasses = Object.keys(HIGHLIGHT_FOCUS_CLASSES).map(function (cls) { return '.' + cls; });
    return highlightClasses.concat([
      '.ws-note',
      '.ws-section-stats',
      '.ws-doc-stats',
      '.ws-doc-loading',
      '.ws-doc-metrics',
      '.ws-doc-rhythm-block',
      '.ws-cohesion-gap',
      '.ws-citation-low',
      '.ws-results-citation',
      '.ws-para-long',
    ]).join(',');
  }

  function setAnnotationTitlesEnabled(enabled) {
    document.querySelectorAll(annotationTitleSelector()).forEach(function (el) {
      if (enabled) {
        if (el.hasAttribute('data-ws-hidden-title')) {
          el.setAttribute('title', el.getAttribute('data-ws-hidden-title') || '');
          el.removeAttribute('data-ws-hidden-title');
        }
      } else if (el.hasAttribute('title')) {
        el.setAttribute('data-ws-hidden-title', el.getAttribute('title') || '');
        el.removeAttribute('title');
      }
    });
    if (enabled) refreshHighlightTooltips(document);
  }

  function setAnnotationsVisible(visible) {
    document.body.classList.toggle('ws-annotations-hidden', !visible);
    setAnnotationTitlesEnabled(visible);
  }

  function wrapLongSentences(p, threshold) {
    var title = L.longSent;
    var marked = p.innerHTML.replace(
      /([.!?]+\s+)(?=[A-ZÁÉÍÓÚÀÂÊÔÃÕÜÇÑ"])/g,
      '$1\x00'
    );
    p.innerHTML = marked.split('\x00').map(function (part) {
      return countWords(part.replace(/<[^>]+>/g, ' ')) > threshold
        ? '<span class="ws-long-sentence" data-ws-focus="long" data-ws-reason="' + escapeHTML(title) + '" title="' + title + '">' + part + '</span>'
        : part;
    }).join('');
  }

  function wrapNoVerbSentences(p) {
    var re = getVerbRegex();
    var title = L.noVerb;
    var marked = p.innerHTML.replace(
      /([.!?]+\s+)(?=[A-ZÁÉÍÓÚÀÂÊÔÃÕÜÇÑ"])/g,
      '$1\x00'
    );
    p.innerHTML = marked.split('\x00').map(function (part) {
      var plain = part.replace(/<[^>]+>/g, ' ');
      return countWords(plain) >= 6 && !re.test(plain)
        ? '<span class="ws-no-verb" data-ws-focus="noverb" data-ws-reason="' + escapeHTML(title) + '" title="' + title + '">' + part + '</span>'
        : part;
    }).join('');
  }

  function highlightInNode(node, wordSet, cls) {
    var RE = LANG === 'en' ? /(\b[a-z]+\b)/gi : /(\b[a-záéíóúàâêôãõüç]+\b)/gi;
    if (node.nodeType === Node.TEXT_NODE) {
      var parts = node.textContent.split(RE);
      if (parts.length <= 1) return;
      var changed = false;
      var frag = document.createDocumentFragment();
      parts.forEach(function (part) {
        if (part.length >= 4 && wordSet.has(part.toLowerCase())) {
          var span = document.createElement('span');
          span.className = cls;
          span.dataset.word = part.toLowerCase();
          markReason(span, 'repeated', L.repeated + ' ' + part.toLowerCase());
          span.textContent = part;
          frag.appendChild(span);
          changed = true;
        } else {
          frag.appendChild(document.createTextNode(part));
        }
      });
      if (changed) node.parentNode.replaceChild(frag, node);
    } else if (
      node.nodeType === Node.ELEMENT_NODE &&
      node.tagName !== 'SCRIPT' && node.tagName !== 'STYLE' &&
      !node.classList.contains('ws-note')
    ) {
      Array.from(node.childNodes).forEach(function (c) { highlightInNode(c, wordSet, cls); });
    }
  }

  function highlightPatternInNode(node, patterns, cls, title) {
    if (node.nodeType === Node.TEXT_NODE) {
      var text = node.textContent;
      var ranges = [];
      patterns.forEach(function (re) {
        var r = new RegExp(re.source, 'gi');
        var m;
        while ((m = r.exec(text)) !== null) ranges.push([m.index, m.index + m[0].length]);
      });
      if (ranges.length === 0) return;

      ranges.sort(function (a, b) { return a[0] - b[0]; });
      var merged = [ranges[0].slice()];
      for (var i = 1; i < ranges.length; i++) {
        var last = merged[merged.length - 1];
        if (ranges[i][0] < last[1]) { last[1] = Math.max(last[1], ranges[i][1]); }
        else { merged.push(ranges[i].slice()); }
      }

      var spanTitle = title || (cls === 'ws-passive' ? L.passive : cls === 'ws-hedge' ? L.hedges : '');
      var frag = document.createDocumentFragment();
      var pos = 0;
      merged.forEach(function (rng) {
        if (rng[0] > pos) frag.appendChild(document.createTextNode(text.slice(pos, rng[0])));
        var span = document.createElement('span');
        span.className = cls;
        if (spanTitle) markReason(span, cls === 'ws-passive' ? 'passive' : cls === 'ws-hedge' ? 'hedge' : '', spanTitle);
        span.textContent = text.slice(rng[0], rng[1]);
        frag.appendChild(span);
        pos = rng[1];
      });
      if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
      node.parentNode.replaceChild(frag, node);

    } else if (
      node.nodeType === Node.ELEMENT_NODE &&
      node.tagName !== 'SCRIPT' && node.tagName !== 'STYLE' &&
      !node.classList.contains('ws-note')
    ) {
      Array.from(node.childNodes).forEach(function (c) { highlightPatternInNode(c, patterns, cls, title); });
    }
  }

  function getVariableUsage(root) {
    var used = [];
    var unused = [];
    var usedSet = new Set();
    if (root && root.querySelectorAll) {
      root.querySelectorAll('.ws-var-origin[data-ws-var-name]').forEach(function (el) {
        usedSet.add(el.dataset.wsVarName);
      });
      root.querySelectorAll('.ws-evidence-parameterized[data-ws-reason]').forEach(function (el) {
        var name = (el.dataset.wsReason || '').split('|')[0].trim();
        if (name) usedSet.add(name);
      });
    }
    VARIABLE_NAMES.forEach(function (name) {
      if (usedSet.has(name)) used.push(name);
      else unused.push(name);
    });
    return { used: used, unused: unused };
  }

  function normalizeEvidenceNumber(raw) {
    var m = String(raw || '').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
    return m ? m[0] : '';
  }

  function getSourceTokenOrigin(raw) {
    var value = normalizeEvidenceNumber(raw);
    if (!value || !SOURCE_EVIDENCE_TOKENS.length) return null;

    for (var i = SOURCE_EVIDENCE_INDEX; i < Math.min(SOURCE_EVIDENCE_TOKENS.length, SOURCE_EVIDENCE_INDEX + 40); i++) {
      var token = SOURCE_EVIDENCE_TOKENS[i] || {};
      if (normalizeEvidenceNumber(token.value) === value) {
        SOURCE_EVIDENCE_INDEX = i + 1;
        return token.name ? [token.name] : null;
      }
    }
    return null;
  }

  function highlightEvidenceInNode(node, isCited, offset) {
    var numRe = /\b\d+(?:[\.,]\d+)?\s*(?:%|mg|g|kg|ml|l|cm|mm|nm|ha|m\/s|\u00b0c|kpa|pa|ppm|ppb)?\b|\((?:[^)]*\d{4}[^)]*)\)|\[[0-9,\-\s]+\]|@\w+/gi;
    function getParamName(raw) {
      var origin = node.parentElement && node.parentElement.closest
        ? node.parentElement.closest('.ws-var-origin')
        : null;
      if (origin && origin.dataset && origin.dataset.wsVarName) {
        return [origin.dataset.wsVarName];
      }
      return getSourceTokenOrigin(raw);
    }
    if (node.nodeType === Node.TEXT_NODE) {
      var text = node.textContent;
      if (isInsideBibliographicCitation(node)) {
        offset.v += text.length;
        return;
      }
      var ranges = [];
      var r = new RegExp(numRe.source, 'gi');
      var m;
      while ((m = r.exec(text)) !== null) {
        if (m[0].trim().length > 0) {
          var globalPos = offset.v + m.index;
          var cited = isCited ? isCited(globalPos) : true;
          var paramNames = getParamName(m[0]); // null or array of var names
          ranges.push([m.index, m.index + m[0].length, cited, paramNames]);
        }
      }
      offset.v += text.length;
      if (ranges.length === 0) return;
      ranges.sort(function (a, b) { return a[0] - b[0]; });
      var merged = [ranges[0].slice()];
      for (var i = 1; i < ranges.length; i++) {
        var last = merged[merged.length - 1];
        if (ranges[i][0] < last[1]) {
          last[1] = Math.max(last[1], ranges[i][1]);
          last[2] = last[2] || ranges[i][2];
          last[3] = last[3] || ranges[i][3];
        } else merged.push(ranges[i].slice());
      }
      var frag = document.createDocumentFragment();
      var pos = 0;
      merged.forEach(function (rng) {
        if (rng[0] > pos) frag.appendChild(document.createTextNode(text.slice(pos, rng[0])));
        var span = document.createElement('span');
        var paramNames = rng[3]; // null or array
        var isCit = rng[2];
        if (paramNames) {
          span.className = 'ws-evidence-parameterized';
          markReason(span, 'evidence-parameterized', paramNames[0]);
        } else if (isCit) {
          span.className = 'ws-evidence';
          markReason(span, 'evidence', L.evidence);
        } else {
          span.className = 'ws-evidence-hardcoded';
          markReason(span, 'evidence-hardcoded', L.evidenceHardcoded);
        }
        span.textContent = text.slice(rng[0], rng[1]);
        frag.appendChild(span);
        pos = rng[1];
      });
      if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
      node.parentNode.replaceChild(frag, node);
    } else if (
      node.nodeType === Node.ELEMENT_NODE &&
      node.tagName !== 'SCRIPT' && node.tagName !== 'STYLE' &&
      !node.classList.contains('ws-note') &&
      !node.classList.contains('citation') &&
      !node.classList.contains('csl-entry') &&
      node.id !== 'refs' &&
      node.getAttribute('role') !== 'doc-biblioref'
    ) {
      Array.from(node.childNodes).forEach(function (c) { highlightEvidenceInNode(c, isCited, offset); });
    }
  }

  function highlightEvidenceInParagraph(p) {
    var paraText = p.innerText || p.textContent || '';
    var citationRe = /\((?:[^)]*\d{4}[^)]*)\)|\[[0-9,\-\s]+\]|@\w+/g;
    var citationPositions = [];
    var cm;
    while ((cm = citationRe.exec(paraText)) !== null) citationPositions.push(cm.index);
    var WINDOW = 200;
    function isCited(globalPos) {
      return citationPositions.some(function (cp) { return Math.abs(cp - globalPos) <= WINDOW; });
    }
    highlightEvidenceInNode(p, isCited, { v: 0 });
  }

  function highlightModalVerbs(p) {
    var re = LANG === 'en'
      ? /\b(may|might|could|would|should)\b/gi
      : /\b(pode|poderia|poderiam|deve|deveria|deveriam|seria|seriam)\b/gi;
    highlightRegexInNode(p, re, 'ws-modal', L.modalVerbs);
  }

  function highlightFirstPerson(p) {
    var re = LANG === 'en'
      ? /\b(I|we|our|ours|my|mine|us)\b/g
      : /\b(eu|n\u00f3s|nossa|nosso|nossas|nossos)\b/gi;
    highlightRegexInNode(p, re, 'ws-firstperson', L.firstPerson);
  }

  function highlightCitationSentStart(p) {
    var re = /(?:^|(?<=[.!?]\s{1,3}))(\((?:[^)]*\d{4}[^)]*)\)|\[[0-9,\-\s]+\])/g;
    highlightRegexInNode(p, re, 'ws-citation-start', L.citationSentStart);
  }

  function highlightRegexInNode(node, re, cls, title) {
    if (node.nodeType === Node.TEXT_NODE) {
      var text = node.textContent;
      var ranges = [];
      var r = new RegExp(re.source, 'gi');
      var m;
      while ((m = r.exec(text)) !== null) ranges.push([m.index, m.index + m[0].length]);
      if (ranges.length === 0) return;
      var frag = document.createDocumentFragment();
      var pos = 0;
      ranges.forEach(function (rng) {
        if (rng[0] > pos) frag.appendChild(document.createTextNode(text.slice(pos, rng[0])));
        var span = document.createElement('span');
        span.className = cls;
        var focus = HIGHLIGHT_FOCUS_CLASSES[cls] || '';
        markReason(span, focus, title);
        span.textContent = text.slice(rng[0], rng[1]);
        frag.appendChild(span);
        pos = rng[1];
      });
      if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
      node.parentNode.replaceChild(frag, node);
    } else if (
      node.nodeType === Node.ELEMENT_NODE &&
      node.tagName !== 'SCRIPT' && node.tagName !== 'STYLE' &&
      !node.classList.contains('ws-note') &&
      !node.classList.contains('ws-passive') &&
      !node.classList.contains('ws-repeated')
    ) {
      Array.from(node.childNodes).forEach(function (c) { highlightRegexInNode(c, re, cls, title); });
    }
  }

  function highlightNominalizations(p) {
    var re = LANG === 'en'
      ? /\b[a-z]{5,}(?:tion|ment|ity|ness|ance|ence)\b/gi
      : /\b[a-záéíóúàâêôãõüç]{5,}(?:ção|ções|são|sões|mento|mentos|dade|dades|ância|ência)\b/gi;
    var skip = new Set(Array.from(EXCLUDED_TERMS));
    if (skip.size === 0) {
      highlightRegexInNode(p, re, 'ws-nominalization', L.nominalization);
      return;
    }

    if (p.nodeType === Node.ELEMENT_NODE) {
      var walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT, null);
      var nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(function (node) {
        var parts = node.textContent.split(/(\b[a-záéíóúàâêôãõüçñ]+\b)/gi);
        if (parts.length <= 1) return;
        var changed = false;
        var frag = document.createDocumentFragment();
        parts.forEach(function (part) {
          var lower = normalizeWord(part);
          if (!skip.has(lower) && re.test(part)) {
            var span = document.createElement('span');
            span.className = 'ws-nominalization';
            markReason(span, 'nominal', L.nominalization);
            span.textContent = part;
            frag.appendChild(span);
            changed = true;
          } else {
            frag.appendChild(document.createTextNode(part));
          }
          re.lastIndex = 0;
        });
        if (changed) node.parentNode.replaceChild(frag, node);
      });
    }
  }

  function highlightHedges(p) {
    var patterns = getHedgeRegexes();
    highlightPatternInNode(p, patterns, 'ws-hedge');
  }

  function highlightConnectors(p) {
    var categories = getConnectorCategories();
    var contextual = getContextualConnectorTerms();
    Object.keys(categories).forEach(function (cat) {
      categories[cat].forEach(function (term) {
        var mode = getConnectorAmbiguityMode(term);
        highlightConnectorInNode(
          p,
          term,
          'ws-connector ws-connector-' + cat,
          connectorCategoryLabel(cat) + ' • ' + connectorAmbiguityLabel(mode),
          contextual.has(term),
          mode
        );
      });
    });
  }

  // ── UI helpers ─────────────────────────────────────────────────────────────

  function sep() {
    var d = document.createElement('div');
    d.className = 'ws-sep';
    return d;
  }

  function addHoverHighlight(item, note, selector, activeClass) {
    item.addEventListener('mouseenter', function () {
      var para = note.parentNode && note.parentNode.querySelector('p');
      if (!para) return;
      para.querySelectorAll(selector).forEach(function (s) { s.classList.add(activeClass); });
    });
    item.addEventListener('mouseleave', function () {
      var para = note.parentNode && note.parentNode.querySelector('p');
      if (!para) return;
      para.querySelectorAll('.' + activeClass).forEach(function (s) { s.classList.remove(activeClass); });
    });
  }

  // ── Margin note ────────────────────────────────────────────────────────────

  function buildNote(stats) {
    var note = document.createElement('aside');
    note.className = 'ws-note' + (stats.alert ? ' ws-note-alert' : '');
    if (stats.alertReasons && stats.alertReasons.length) {
      note.title = L.alertReasons + ': ' + stats.alertReasons.join('; ');
    }

    // Header: word count · sentence count
    var nSent = stats.sentences.length;
    var hdr = document.createElement('div');
    hdr.className = 'ws-count' + (stats.paraLong ? ' ws-count-red' : '');
    hdr.textContent =
      (stats.alert ? '🔴 ' : '') +
      stats.wordCount + L.wSuffix + ' · ' +
      nSent + ' ' + (nSent === 1 ? L.sent : L.sentP);
    if (stats.alertReasons && stats.alertReasons.length) hdr.title = note.title;
    note.appendChild(hdr);

    // Sparkline of sentence rhythm
    if (nSent > 1) {
      var sl = document.createElement('div');
      sl.className = 'ws-sparkline';
      sl.title = L.rhythmTitle;
      sl.textContent = sparkline(stats.sentences);
      note.appendChild(sl);
    }

    // Lexical diversity
    var ldPct = Math.round(stats.lexDiv * 100);
    var ldMod = stats.lexDiv >= 0.70 ? 'ws-ld-high' : stats.lexDiv >= 0.50 ? 'ws-ld-mid' : 'ws-ld-low';
    var ldEl = document.createElement('div');
    ldEl.className = 'ws-ld ' + ldMod;
    ldEl.textContent = L.diversity + ': ' + ldPct + '%';
    note.appendChild(ldEl);

    // Long sentence alert
    if (stats.maxSentLen > SENT_LONG) {
      var sentEl = document.createElement('div');
      sentEl.className = 'ws-sent-alert';
      sentEl.textContent = L.longSent + ': ' + stats.maxSentLen + L.wSuffix;
      note.appendChild(sentEl);
    }

    // Passive voice (with hover-to-highlight)
    if (stats.passiveCount > 0) {
      var passEl = document.createElement('div');
      passEl.className = 'ws-passive-count';
      passEl.textContent = L.passive + ': ' + stats.passiveCount;
      addHoverHighlight(passEl, note, '.ws-passive', 'ws-passive-active');
      note.appendChild(passEl);
    }

    if (stats.hedgeCount > 0) {
      var hedgeEl = document.createElement('div');
      hedgeEl.className = 'ws-hedge-count';
      hedgeEl.textContent = L.hedges + ': ' + stats.hedgeCount;
      addHoverHighlight(hedgeEl, note, '.ws-hedge', 'ws-hedge-active');
      note.appendChild(hedgeEl);
    }

    if (typeof stats.citationMarkers === 'number') {
      var citeEl = document.createElement('div');
      citeEl.className = 'ws-citation-count' +
        (stats.needsCitation && !stats.citationMarkers ? ' ws-citation-low-count' : '') +
        (stats.resultsCitation && stats.citationMarkers > 0 ? ' ws-results-citation-count' : '');
      var citeText = L.citations + ': ' + stats.citationMarkers;
      if (stats.citationKeyCount && stats.citationKeyCount !== stats.citationMarkers) {
        citeText += ' / ' + stats.citationKeyCount + ' refs';
      }
      citeEl.textContent = citeText;
      if (stats.needsCitation && !stats.citationMarkers) citeEl.title = L.noCitationsIntroDiscussion;
      if (stats.resultsCitation && stats.citationMarkers > 0) citeEl.title = L.resultsCitationDesc;
      note.appendChild(citeEl);
    }

    // Intra-paragraph repeated words (with hover-to-highlight)
    var entries = Object.entries(stats.repeated);
    if (entries.length > 0) {
      note.appendChild(sep());
      var repLbl = document.createElement('div');
      repLbl.className = 'ws-rep-label';
      repLbl.textContent = L.repeated;
      note.appendChild(repLbl);

      entries.forEach(function (kv) {
        var word = kv[0];
        var item = document.createElement('div');
        item.className = 'ws-rep-item';
        item.dataset.word = word;
        item.textContent = word + ' \xd7' + kv[1];
        addHoverHighlight(item, note, '.ws-repeated[data-word="' + word + '"]', 'ws-active');
        note.appendChild(item);
      });
    }

    // Cross-section words
    if (stats.crossInPara && stats.crossInPara.length > 0) {
      note.appendChild(sep());
      var crossLbl = document.createElement('div');
      crossLbl.className = 'ws-cross-label';
      crossLbl.textContent = L.cross;
      note.appendChild(crossLbl);
      var crossEl = document.createElement('div');
      crossEl.className = 'ws-cross-words';
      crossEl.textContent = stats.crossInPara.join(', ');
      note.appendChild(crossEl);
    }

    return note;
  }

  // ── Section stats bar ──────────────────────────────────────────────────────

  function buildSectionStats(section, statsList, totalWords, summary) {
    if (statsList.length === 0) return;
    var h = section.querySelector('h2, h3');
    if (!h) return;

    var nP = statsList.length;
    var nAlerts = statsList.filter(function (s) { return s.alert; }).length;
    var nObs = statsList.filter(function (s) {
      return !s.alert && (s.passiveCount > 0 || Object.keys(s.repeated).length > 0 || (s.crossInPara && s.crossInPara.length > 0));
    }).length;

    var bar = document.createElement('div');
    bar.className = 'ws-section-stats';
    var parts = [
      totalWords + ' ' + L.words,
      nP + ' ' + (nP === 1 ? L.parag : L.paragP),
    ];
    if (nAlerts > 0) {
      parts.push('<span class="ws-stat-alert">' +
        nAlerts + ' ' + (nAlerts === 1 ? L.alert : L.alertP) + '</span>');
    }
    if (nObs > 0) {
      parts.push('<span class="ws-stat-observation">' +
        nObs + ' ' + (nObs === 1 ? L.observation : L.observationP) + '</span>');
    }
    if (summary && typeof summary.score === 'number') {
      parts.push('<span class="ws-stat-score">' + L.sectionScore + ': ' + summary.score + '/100</span>');
    }
    if (summary && summary.goalIssueCount > 0) {
      parts.push('<span class="ws-stat-goals">' + L.goalIssues + ': ' + summary.goalIssueCount + '</span>');
    }
    bar.innerHTML = parts.join(' <span class="ws-stat-dot">\xb7</span> ');
    if (summary && summary.goalIssues && summary.goalIssues.length > 0) {
      bar.title = L.goalIssues + ': ' + summary.goalIssues.join('; ');
    }
    h.after(bar);
  }

  // ── Document reading-time badge ────────────────────────────────────────────

  function metricItem(label, value, focus, title) {
    return '<div class="ws-doc-metric"' +
      (focus ? ' data-ws-focus="' + focus + '"' : '') +
      (title ? ' title="' + escapeHTML(title) + '"' : '') + '>' +
      '<span class="ws-doc-metric-label">' + label + '</span>' +
      '<span class="ws-doc-metric-value">' + value + '</span>' +
      '</div>';
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

  function wireMetricFocus(metrics) {
    metrics.querySelectorAll('[data-ws-focus]').forEach(function (item) {
      item.addEventListener('click', function () {
        var focus = item.dataset.wsFocus;
        var cls = 'ws-focus-' + focus;
        var active = document.body.classList.contains(cls);
        [
          'ws-focus-passive', 'ws-focus-long', 'ws-focus-repeated', 'ws-focus-nominal',
          'ws-focus-connectors', 'ws-focus-connectors-add', 'ws-focus-connectors-contrast',
          'ws-focus-connectors-cause', 'ws-focus-connectors-conclusion', 'ws-focus-connectors-time',
          'ws-focus-noverb', 'ws-focus-hedge', 'ws-focus-evidence', 'ws-focus-cohesion',
          'ws-focus-evidence-hardcoded', 'ws-focus-modal', 'ws-focus-firstperson', 'ws-focus-citation-start',
          'ws-focus-evidence-parameterized'
        ].forEach(function (c) {
          document.body.classList.remove(c);
        });
        metrics.querySelectorAll('.ws-doc-metric-active').forEach(function (m) {
          m.classList.remove('ws-doc-metric-active');
        });
        if (!active) {
          document.body.classList.add(cls);
          item.classList.add('ws-doc-metric-active');
        }
        refreshHighlightTooltips(document);
      });
    });
  }

  function wireRhythmNavigation(metrics) {
    metrics.querySelectorAll('.ws-doc-rhythm-block[data-ws-target]').forEach(function (block) {
      block.addEventListener('click', function () {
        var id = block.getAttribute('data-ws-target');
        if (!id) return;
        var target = document.getElementById(id);
        if (!target) return;
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

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
      '- ' + L.topRepeated + ': ' + (r.topRepeated.length ? r.topRepeated.join(', ') : '0'),
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
      '- ' + L.termVariants + ': ' + (r.termVariants.length ? r.termVariants.slice(0, 6).map(function (x) { return x.forms.slice(0, 3).join('/') + ' ×' + x.count; }).join(', ') : '0'),
      '- ' + L.cohesionGaps + ': ' + r.cohesionGaps,
      '- ' + L.abstractCoverage + ': ' + r.abstractCoverage.score + '%',
      '- ' + L.colloquial + ': ' + r.colloquialCount,
      '- ' + L.repeatedStarts + ': ' + (r.repeatedStarts.length ? r.repeatedStarts.slice(0, 5).map(function (x) { return x.start + ' ×' + x.count; }).join(', ') : '0'),
      '- ' + L.sectionScore + ': ' + (r.avgSectionScore || 0) + '/100',
      '- ' + L.noVerb + ': ' + r.noClearVerb,
      '',
      'PRIORIDADES (P1/P2/P3)',
    ];

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

  function analysisModeLabel(mode) {
    return mode === 'worker' ? L.analysisWorker : L.analysisSync;
  }

  function analysisBadgeText() {
    var total = ANALYSIS_TELEMETRY.hits + ANALYSIS_TELEMETRY.misses;
    var hitRate = total > 0 ? Math.round((ANALYSIS_TELEMETRY.hits / total) * 100) : 0;
    return L.analysisEngine + ': ' + analysisModeLabel(ANALYSIS_TELEMETRY.mode) +
      ' • ' + L.analysisCache + ' ' + hitRate + '%' +
      ' • ' + L.analysisTime + ' ' + Math.max(0, Math.round(ANALYSIS_TELEMETRY.durationMs)) + 'ms';
  }

  function buildDocStats(root, totalWords, statsList, sections, docText) {
    if (totalWords === 0) return;
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
    var topRepeated = getGlobalFrequent(docText, 5);
    var connectorCount = countConnectors(docText);
    var connectorByCat = countConnectorCategories(docText);
    var nominalizationCount = countNominalizations(docText);
    var totalSyllables = statsList.reduce(function (sum, stats) { return sum + (stats.syllableCount || 0); }, 0);
    var complexWordCount = statsList.reduce(function (sum, stats) { return sum + (stats.complexWordCount || 0); }, 0);
    var hedgeCount = statsList.reduce(function (sum, stats) { return sum + (stats.hedgeCount || 0); }, 0);
    var complexSentenceCount = statsList.reduce(function (sum, stats) { return sum + (stats.complexSentenceCount || 0); }, 0);
    var allSentences = statsList.reduce(function (all, stats) { return all.concat(stats.sentences || []); }, []);
    var repeatedStarts = getSentenceStartRepeats(allSentences);
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
    var noVerbCount = statsList.reduce(function (sum, stats) {
      return sum + (stats.noVerbCount || 0);
    }, 0);
    var hedgeDensity = totalWords ? (hedgeCount / totalWords) * 1000 : 0;
    var complexSentenceRate = allSentences.length ? (complexSentenceCount / allSentences.length) * 100 : 0;
    var pronounAmbigCount = getPronounAmbiguities(allSentences);
    var modalVerbCount = countModalVerbs(docText);
    var firstPersonCount = countFirstPerson(docText);
    var allParaTexts = statsList.map(function (s) { return s.text || ''; }).filter(Boolean);
    var paraOpeningRepeats = getParaOpeningRepeats(allParaTexts);
    var citationSentStartCount = countCitationSentStart(allSentences);
    var citationSentEndCount = countCitationSentEnd(allSentences);
    var abstractWordCount = getAbstractWordCount(sections);
    var unitInconsistency = getUnitInconsistency(docText);
    var sectionBalance = getSectionBalance(sections);
    var referenceUsage = getReferenceUsage(root);
    var avgSectionScore = sections.length
      ? Math.round(sections.reduce(function (sum, s) { return sum + (s.score || 0); }, 0) / sections.length)
      : 0;

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

    var metrics = document.createElement('div');
    metrics.className = 'ws-doc-metrics';
    metrics.innerHTML =
      metricItem(L.avgSentence, round1(mean(sentenceLengths)) + L.wSuffix, null, L.avgSentenceDesc) +
      metricItem(L.sentenceVar, round1(sentVar) + ' / σ ' + round1(sentStd) + L.wSuffix, null, L.sentenceVarDesc) +
      metricItem(L.avgParagraph, round1(mean(paraLengths)) + L.wSuffix, null, L.avgParagraphDesc) +
      metricItem(L.longestSentence, maxSentLen + L.wSuffix, 'long', L.longestSentenceDesc) +
      metricItem(L.docDiversity, lexDiv + '%', null, L.docDiversityDesc) +
      metricItem(L.passiveTotal, passiveTotal, 'passive', L.passiveTotalDesc) +
      metricItem(L.passiveDensity, round1(passiveDensity) + '/1000' + L.wSuffix, 'passive', L.passiveDensityDesc) +
      metricItem(L.longSentenceRate, round1(longSentenceRate) + '%', 'long', L.longSentRateDesc) +
      metricItem(L.topRepeated, topRepeated.length ? topRepeated.join(', ') : '0', 'repeated', L.topRepeatedDesc) +
      metricItem(L.connectors, connectorCount, 'connectors', L.connectorsDesc) +
      metricItem(L.connectorAdd, connectorByCat.add || 0, 'connectors-add', L.connectorAddDesc) +
      metricItem(L.connectorContrast, connectorByCat.contrast || 0, 'connectors-contrast', L.connectorContrastDesc) +
      metricItem(L.connectorCause, connectorByCat.cause || 0, 'connectors-cause', L.connectorCauseDesc) +
      metricItem(L.connectorConclusion, connectorByCat.conclusion || 0, 'connectors-conclusion', L.connectorConclusionDesc) +
      metricItem(L.connectorTime, connectorByCat.time || 0, 'connectors-time', L.connectorTimeDesc) +
      metricItem(L.nominalization, nominalizationCount, 'nominal', L.nominalizationDesc) +
      metricItem(L.readability + ' (' + L.flesch + ')', readability.flesch, null, L.fleschDesc) +
      metricItem(L.grade, readability.grade, null, L.gradeDesc) +
      metricItem(L.fog, readability.fog, null, L.fogDesc) +
      metricItem(L.complexSent, complexSentenceCount + ' (' + round1(complexSentenceRate) + '%)', null, L.complexSentDesc) +
      metricItem(L.hedges, hedgeCount, 'hedge', L.hedgeDesc + ' | ' + L.hedgeDensity + ': ' + round1(hedgeDensity) + '/1000' + L.wSuffix) +
      metricItem(L.undefinedAcronyms, undefinedAcronyms.length ? undefinedAcronyms.slice(0, 4).map(function (x) { return x.acronym + ' ×' + x.count; }).join(', ') : '0', null, L.undefinedAcronymsDesc) +
      metricItem(L.emphaticPunct, emphaticPunct, null, L.emphaticPunctDesc) +
      metricItem(L.evidence, evidenceCited, 'evidence', L.evidenceCitedDesc + ' | ' + L.evidenceDensity + ': ' + round1(evidenceDensity) + '/1000' + L.wSuffix) +
      metricItem(L.evidenceHardcoded, evidenceHardcoded, 'evidence-hardcoded', L.evidenceHardcodedDesc) +
      (VARIABLE_COUNT > 0
        ? metricItem(L.evidenceParameterized, evidenceParameterized + ' / ' + (evidenceParameterized + evidenceUnparameterized), 'evidence-parameterized', L.evidenceParameterizedDesc) +
          metricItem(L.variableCount, usedVarCount + ' / ' + VARIABLE_COUNT, null,
            L.variableCountDesc +
            (varUsage.unused.length
              ? ' | \u26a0\ufe0f ' + (LANG === 'pt' ? 'n\u00e3o usadas' : 'unused') + ': ' + varUsage.unused.join(', ')
              : ''))
        : '') +
      metricItem(L.termVariants, termVariants.length ? termVariants.slice(0, 3).map(function (x) { return x.forms.slice(0, 2).join('/'); }).join(', ') : '0', null, L.termVariantsDesc) +
      metricItem(L.cohesionGaps, cohesionGaps, 'cohesion', L.cohesionGapsDesc) +
      metricItem(L.abstractCoverage, abstractCoverage.score + '%', null, L.abstractCoverageDesc + (abstractCoverage.missing.length ? (' | missing: ' + abstractCoverage.missing.join(', ')) : '')) +
      metricItem(L.colloquial, colloquialCount, null, L.colloquialDesc) +
      metricItem(L.repeatedStarts, repeatedStarts.length ? repeatedStarts.slice(0, 3).map(function (x) { return x.start + ' \xd7' + x.count; }).join(', ') : '0', null, L.repeatedStartsDesc) +
      metricItem(L.sectionScore, avgSectionScore + '/100', null, L.sectionScoreDesc) +
      metricItem(L.noVerb, noVerbCount, 'noverb', L.noVerbDesc) +
      metricItem(L.pronounAmbig, pronounAmbigCount, null, L.pronounAmbigDesc) +
      metricItem(L.modalVerbs, modalVerbCount, 'modal', L.modalVerbsDesc) +
      metricItem(L.firstPerson, firstPersonCount, 'firstperson', L.firstPersonDesc) +
      metricItem(L.citationSentStart, citationSentStartCount, 'citation-start', L.citationSentStartDesc) +
      metricItem(L.citationSentEnd, citationSentEndCount, null, L.citationSentEndDesc) +
      metricItem(L.paraOpeningRepeat, paraOpeningRepeats.length ? paraOpeningRepeats.slice(0, 3).map(function (x) { return x.word + ' \xd7' + x.count; }).join(', ') : '0', null, L.paraOpeningRepeatDesc) +
      metricItem(L.abstractWordCount, abstractWordCount + ' ' + L.words, null, L.abstractWordCountDesc) +
      metricItem(L.unitConsistency, unitInconsistency.length ? unitInconsistency.join('; ') : '0', null, L.unitConsistencyDesc) +
      metricItem(L.referencesUsed, referenceUsage.used.length + ' / ' + referenceUsage.defined, null,
        L.referencesUsedDesc +
        (referenceUsage.unused.length ? ' | ' + (LANG === 'pt' ? 'não usadas' : 'unused') + ': ' + referenceUsage.unused.join(', ') : '') +
        (referenceUsage.undefinedKeys.length ? ' | ' + (LANG === 'pt' ? 'não definidas' : 'undefined') + ': ' + referenceUsage.undefinedKeys.join(', ') : '')) +
      metricItem(L.citationsTotal, referenceUsage.markerCount, null, L.citationsTotalDesc) +
      metricItem(L.sectionBalance, sectionBalance.cv + (sectionBalance.outliers.length ? ' | ' + sectionBalance.outliers.slice(0, 2).join(', ') : ''), null, L.sectionBalanceDesc) +
      buildDiagnostics(sections, passiveTotal, longSentenceRate);

    var anchor = document.getElementById('title-block-header') || root.querySelector('section');
    if (anchor) {
      anchor.after(badge);
      badge.after(metrics);
      wireMetricFocus(metrics);
      wireRhythmNavigation(metrics);
    }
  }

  // ── Focus mode ─────────────────────────────────────────────────────────────

  function addFocusMode(allWrappers) {
    allWrappers.forEach(function (w) {
      w.addEventListener('mouseenter', function () {
        allWrappers.forEach(function (other) {
          if (other !== w) other.classList.add('ws-dimmed');
        });
      });
      w.addEventListener('mouseleave', function () {
        allWrappers.forEach(function (other) { other.classList.remove('ws-dimmed'); });
      });
    });
  }

  // ── Controls ───────────────────────────────────────────────────────────────

  function makeControlButton(label, title) {
    var btn = document.createElement('button');
    btn.className = 'ws-control-btn';
    btn.setAttribute('title', title);
    btn.textContent = label;
    return btn;
  }

  function buildControls() {
    var visible = true;
    var alertsOnly = !!CFG.defaultAlertsOnly;
    var finalReview = false;

    var box = document.createElement('div');
    box.className = 'ws-controls';

    var btn = makeControlButton(L.hideBtn, L.toggleTitle);
    var alertBtn = makeControlButton(alertsOnly ? L.allNotesBtn : L.alertsOnlyBtn, L.alertsOnlyTitle);
    var reviewBtn = makeControlButton(finalReview ? L.reviewOffBtn : L.reviewBtn, L.reviewTitle);
    var exportBtn = makeControlButton(L.exportBtn, L.exportTitle);

    btn.addEventListener('click', function () {
      visible = !visible;
      setAnnotationsVisible(visible);
      btn.textContent = visible ? L.hideBtn : L.showBtn;
      btn.classList.toggle('ws-control-off', !visible);
    });

    alertBtn.addEventListener('click', function () {
      alertsOnly = !alertsOnly;
      document.body.classList.toggle('ws-alerts-only', alertsOnly);
      alertBtn.textContent = alertsOnly ? L.allNotesBtn : L.alertsOnlyBtn;
      alertBtn.classList.toggle('ws-control-on', alertsOnly);
    });

    reviewBtn.addEventListener('click', function () {
      finalReview = !finalReview;
      document.body.classList.toggle('ws-final-review', finalReview);
      reviewBtn.textContent = finalReview ? L.reviewOffBtn : L.reviewBtn;
      reviewBtn.classList.toggle('ws-control-on', finalReview);
    });

    exportBtn.addEventListener('click', exportMarkdownReport);

    box.appendChild(btn);
    box.appendChild(alertBtn);
    box.appendChild(reviewBtn);
    box.appendChild(exportBtn);
    document.body.appendChild(box);

    document.body.classList.toggle('ws-alerts-only', alertsOnly);
    alertBtn.classList.toggle('ws-control-on', alertsOnly);
  }

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

    var totalDocWords = 0;
    var allWrappers   = [];
    var allStats      = [];
    var allTexts      = [];
    var allSections   = [];

    var sections = Array.from(root.querySelectorAll('section.level2'));
    for (var sIdx = 0; sIdx < sections.length; sIdx++) {
      var section = sections[sIdx];
      var paras = Array.from(section.querySelectorAll(':scope > p'));
      if (paras.length === 0) continue;
      var heading = section.querySelector('h2, h3');
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
        if (maxSentLen > SENT_LONG) wrapLongSentences(p, SENT_LONG);
        wrapNoVerbSentences(p);
        if (passiveCount > 0)       highlightPatternInNode(p, PASSIVE_PATTERNS, 'ws-passive');
        highlightConnectors(p);
        highlightNominalizations(p);
        if (hedgeCount > 0) highlightHedges(p);
        if (repeatedSet.size > 0)   highlightInNode(p, repeatedSet, 'ws-repeated');
        highlightEvidenceInParagraph(p);
        highlightModalVerbs(p);
        highlightFirstPerson(p);
        highlightCitationSentStart(p);
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
          complexSentenceCount: complexSentenceCount,
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

    buildDocStats(root, totalDocWords, allStats, allSections, allTexts.join('\n\n'));
    if (loadingPill && loadingPill.parentNode) loadingPill.remove();
    addFocusMode(allWrappers);
    buildControls();
  }

  function runSafe() {
    run().catch(function (err) {
      console.error('[scientific-writing] analysis failed', err);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runSafe);
  } else {
    runSafe();
  }
})();
