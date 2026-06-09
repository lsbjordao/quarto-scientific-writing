(function () {
  'use strict';

// src/config.js — Runtime configuration and shared thresholds.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

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
  var SPELLCHECK_ENABLED = false;
  var SPELLCHECK_PROVIDER = 'languagetool';
  var SPELLCHECK_ENDPOINT = 'https://api.languagetool.org/v2/check';
  var SPELLCHECK_LANGUAGE = '';
  var SPELLCHECK_IGNORE_TERMS = new Set();
  var SPELLCHECK_TIMEOUT_MS = 8000;
  var NLP_CDN_ENABLED = true;
  var NLP_CDN_URL = 'https://cdn.jsdelivr.net/npm/compromise/builds/compromise.min.js';
  var NLP_LIB = null;
  var NLP_READY = null;
  var NLP_STATUS = 'pending';
  var NLP_ERROR = '';
  var ANALYSIS_CACHE = Object.create(null);
    var WINK_LIB = null;
    var WINK_NLP = null;
    var WINK_READY = null;
    var WINK_STATUS = 'pending';
    var WINK_ERROR = '';
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

  function defaultSpellcheckLanguage() {
    var raw = ((document.documentElement.getAttribute('lang') || '') + '').trim();
    if (/^en\b/i.test(raw)) return raw.indexOf('-') > 0 ? raw : 'en-US';
    if (/^pt\b/i.test(raw)) return raw.indexOf('-') > 0 ? raw : 'pt-BR';
    return LANG === 'en' ? 'en-US' : 'pt-BR';
  }

  function shouldIgnoreSpellingWord(w) {
    var norm = normalizeWord(w).replace(/^[^\wáéíóúàâêôãõüçñ]+|[^\wáéíóúàâêôãõüçñ]+$/gi, '');
    return !norm || SPELLCHECK_IGNORE_TERMS.has(norm) || EXCLUDED_TERMS.has(norm);
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
    SPELLCHECK_ENABLED = CFG.spellcheckEnabled === true;
    SPELLCHECK_PROVIDER = String(CFG.spellcheckProvider || SPELLCHECK_PROVIDER).toLowerCase();
    SPELLCHECK_ENDPOINT = String(CFG.spellcheckEndpoint || SPELLCHECK_ENDPOINT);
    SPELLCHECK_LANGUAGE = String(CFG.spellcheckLanguage || defaultSpellcheckLanguage());
    SPELLCHECK_TIMEOUT_MS = Math.max(1000, Number(CFG.spellcheckTimeoutMs) || SPELLCHECK_TIMEOUT_MS);
    SPELLCHECK_IGNORE_TERMS = new Set(
      parseTermList(CFG.spellcheckIgnoreTerms)
        .concat(parseTermList(CFG.ignoreTerms))
        .map(normalizeWord)
        .filter(Boolean)
    );
    NLP_CDN_ENABLED = CFG.nlpCdn !== false;
    NLP_CDN_URL = String(CFG.nlpCdnUrl || NLP_CDN_URL);
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

// src/lang/pt.js — Portuguese UI strings
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.
var L_PT = {
  wSuffix: 'p', sent: 'frase', sentP: 'frases',
  diversity: 'diversidade', longSent: '🟡 frase longa',
  passive: 'voz passiva', repeated: 'repetidas:', cross: 'recorrente na seção:',
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
  topRepeated: 'repetições globais', repeatedTerms: 'repetições',
  connectors: 'conectores', nominalization: 'nominalizações',
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
  reasonWordy: 'prolixidade',
  reasonFewCitations: 'poucas citações na seção',
  reasonResultsCitation: 'citação em Resultados',
  wordyPhrases: 'expressões prolixas',
  wordyPhrasesDesc: 'Expressões que podem ser simplificadas para maior clareza.',
  tenseWarning: 'tempo verbal inadequado',
  tenseWarningDesc: 'O tempo verbal predominante nesta seção parece divergir do padrão esperado para este tipo de seção científica.',
  acronymFirstUse: 'sigla sem definição inicial',
  analysisPreparing: 'analisando texto...', spellcheckPreparing: 'verificando ortografia...',
  spellingIssue: 'possível erro ortográfico',
  sourceConnectBtn: 'conectar fonte',
  sourceConnectedBtn: 'fonte conectada',
  sourceConnectTitle: 'Conectar o arquivo .qmd fonte para aplicar correções ortográficas',
  sourceConnectedTitle: 'Arquivo fonte conectado',
  sourceUnsupported: 'Este navegador não permite editar o arquivo fonte diretamente. Use Chrome ou Edge em uma página local/segura.',
  sourceMustBeQmd: 'Escolha um arquivo .qmd.',
  sourceDoesNotMatch: 'O .qmd selecionado não parece ser a fonte deste HTML.',
  sourceNotConnected: 'Conecte o .qmd fonte para aplicar correções.',
  sourceReady: 'Fonte pronta',
  sourceApplying: 'Aplicando no fonte...',
  sourceApplied: 'Aplicado no fonte. Renderize novamente para atualizar o HTML.',
  sourceAmbiguous: 'Correspondência ambígua no fonte. Nada foi alterado.',
  sourceWordMissing: 'Palavra não encontrada no arquivo fonte.',
  sourceNoChange: 'Nenhuma alteração no fonte foi necessária.',
  sourceYamlMissing: 'Front matter YAML não encontrado.',
  sourceScientificWritingMissing: 'Bloco YAML scientific-writing não encontrado.',
  sourceAddingIgnore: 'Adicionando à lista de ignorados...',
  sourceIgnoreAdded: 'Adicionado a spellcheck-ignore-terms. Renderize novamente para atualizar o HTML.',
  sourceIgnoreAlreadyExists: 'Já está em spellcheck-ignore-terms.',
  noSpellingSuggestions: 'Sem sugestões',
  ignoreSpellingBtn: 'ignorar',
  ignoreSpellingSourceBtn: 'ignorar no fonte',
  closeBtn: 'fechar',
  analysisEngine: 'motor JS-only',
  analysisLoadingNlp: 'carregando NLP via CDN...',
  analysisWorker: 'worker', analysisSync: 'direto', analysisCache: 'cache', analysisTime: 'tempo',
  nlpEngine: 'motor NLP',
  nlpLoaded: 'cdnjs ativo',
  nlpDisabled: 'desligado',
  nlpFallback: 'fallback heurístico',
  nlpUnavailable: 'CDN indisponível',
  nlpNominalLoad: 'frases nominalmente densas',
  nlpNominalLoadDesc: 'Frases com alta carga de substantivos/nominalizações, comum em prosa científica densa. Clique para destacar.',
  nlpWeakVerbs: 'verbos genéricos',
  nlpWeakVerbsDesc: 'Predicados pouco informativos ou muito genéricos; em manuscritos, prefira verbos que expressem a relação científica com precisão. Clique para destacar.',
  nlpNounStacks: 'cadeias nominais',
  nlpNounStacksDesc: 'Sequências longas de termos técnicos sem preposição ou pausa. Podem dificultar leitura, especialmente em títulos e Resultados. Clique para destacar.',
  nlpVerbDiversity: 'diversidade verbal',
  nlpVerbDiversityDesc: 'Proporção de verbos distintos entre os verbos detectados. Valores baixos indicam dependência de poucos predicados.',
  nlpNounVerbRatio: 'razão subst./verbo',
  nlpNounVerbRatioDesc: 'Razão entre substantivos e verbos detectados pelo motor NLP. Valores altos sugerem estilo nominal e menos orientado a ação.',
  nlpNounDensity: 'densidade de substantivos',
  nlpNounDensityDesc: 'Substantivos por 100 palavras. Densidade muito alta pode indicar excesso de nominalização e menor clareza de ação.',
  nlpKeyTerms: 'termos-chave NLP',
  nlpKeyTermsDesc: 'Candidatos a termos centrais do manuscrito extraídos por frequência e, quando disponível, pelo analisador NLP.',
  nlpTermDrift: 'deriva terminológica',
  nlpTermDriftDesc: 'Número de famílias de termos com variações concorrentes no mesmo texto/seção. Valores altos sugerem inconsistência de nomenclatura.',
  nlpTopics: 'tópicos NLP',
  nlpEntityDensity: 'densidade de entidades',
  nlpEntityDensityDesc: 'Entidades nomeadas por 100 palavras. Excesso sem contextualização pode reduzir fluidez argumentativa.',
  nlpEntityOverload: 'sobrecarga de entidades',
  nlpEntityOverloadDesc: 'Sentenças com concentração alta de entidades nomeadas. Útil para revisar excesso de nomes próprios/termos sem explicação.',
  nlpActionVerbScore: 'score de ação verbal',
  nlpActionVerbScoreDesc: 'Percentual de verbos não genéricos em relação ao total de verbos. Quanto maior, mais concreta e orientada a ação tende a ser a redação.',
  nlpSentencePatternRepeats: 'padrões de abertura (frases)',
  nlpSentencePatternRepeatsDesc: 'Repetição de padrões sintáticos no início das frases (duas primeiras palavras úteis).',
  nlpSemanticRedundancy: 'redundância semântica',
  nlpSemanticRedundancyDesc: 'Percentual de pares adjacentes de frases com alta sobreposição lexical de conteúdo.',
  nlpFlowScore: 'score de fluxo',
  nlpFlowScoreDesc: 'Indicador de continuidade entre frases adjacentes usando sobreposição lexical e conectores discursivos.',
  nlpTenseProfile: 'perfil temporal',
  nlpTenseProfileDesc: 'Distribuição aproximada de tempos/modos verbais (passado, presente, futuro/modal) via wink-nlp.',
  nlpWinkPosNounStacks: 'cadeias nominais POS (wink)',
  nlpWinkPosNounStacksDesc: 'Cadeias nominais longas detectadas por POS tagging (NOUN/PROPN/ADJ) no wink-nlp. Mais robusto que regex para inglês técnico.',
  nlpWinkReadingEase: 'facilidade de leitura (Flesch)',
  nlpWinkReadingEaseDesc: 'Flesch Reading Ease (0–100). Valores menores indicam texto mais difícil. Artigos científicos: tipicamente 30–50.',
  nlpWinkGradeLevel: 'nível escolar (F-K)',
  nlpWinkGradeLevelDesc: 'Flesch-Kincaid Grade Level — nível de escolaridade necessário para compreender o texto. Artigos científicos: tipicamente 12–16.',
  nlpWinkAvgWords: 'média pal./frase (wink)',
  nlpWinkAvgWordsDesc: 'Média de palavras por frase calculada pelo wink-nlp.',
  nlpWinkReadTime: 'tempo de leitura (wink)',
  nlpWinkReadTimeDesc: 'Tempo estimado de leitura calculado pelo wink-nlp para o texto em inglês.',
  nlpWinkComplexWords: 'palavras complexas (wink)',
  nlpWinkComplexWordsDesc: 'Palavras complexas detectadas pelo wink-nlp. Em inglês científico, densidade muito alta pode indicar prosa excessivamente pesada. Clique para destacar.',
  nlpWinkModalVerbs: 'verbos modais (wink)',
  nlpWinkModalVerbsDesc: 'Modais detectados pelo wink-nlp (can, could, may, might, should, would etc.). Útil para revisar grau de cautela, especulação ou obrigação. Clique para destacar.',
  nlpWinkPassive: 'voz passiva (wink)',
  nlpWinkPassiveDesc: 'Frases em voz passiva detectadas via POS tagging do wink-nlp (verbo principal precedido por forma de "to be"). Clique para destacar.',
  nlpWinkComplexDensity: 'densidade pal. complexas (wink)',
  nlpWinkComplexDensityDesc: 'Percentual de palavras polissilábicas (≥3 sílabas) no texto, calculado pelo wink-nlp. Valores acima de 20% podem indicar prosa muito densa.',
  nlpWinkVerbDiversity: 'diversidade verbal (wink)',
  nlpWinkVerbDiversityDesc: 'Proporção entre lemas verbais únicos e total de verbos detectados pelo wink-nlp (POS: VERB). Valores maiores indicam vocabulário verbal mais variado.',
  nlpWinkPronouns: 'pronomes (wink)',
  nlpWinkPronounsDesc: 'Pronomes detectados por POS tagging (PRON). Uso elevado pode reduzir precisão referencial em trechos densos.',
  nlpWinkPronounDensity: 'densidade de pronomes (wink)',
  nlpWinkPronounDensityDesc: 'Pronomes por 100 tokens alfanuméricos. Valores altos podem sinalizar referência anafórica excessiva.',
  nlpWinkAuxiliaries: 'auxiliares (wink)',
  nlpWinkAuxiliariesDesc: 'Verbos auxiliares detectados (AUX). Concentração alta pode indicar cadeia verbal longa e estilo menos direto.',
  nlpWinkAuxVerbRatio: 'razão AUX/VERB (wink)',
  nlpWinkAuxVerbRatioDesc: 'Razão entre auxiliares e verbos lexicais detectados. Útil para revisar sobrecarga de perífrases.',
  nlpWinkNumericDensity: 'densidade numérica (wink)',
  nlpWinkNumericDensityDesc: 'Tokens numéricos por 100 tokens alfanuméricos (POS: NUM). Ajuda a avaliar concentração de dados quantitativos.',
  nlpWinkLexicalDensity: 'densidade lexical (wink)',
  nlpWinkLexicalDensityDesc: 'Proporção de classes abertas (NOUN/VERB/ADJ/ADV/PROPN) por 100 tokens alfanuméricos.',
  nlpWinkProperNouns: 'nomes próprios (wink)',
  nlpWinkProperNounsDesc: 'Termos marcados como nomes próprios (PROPN) pelo wink-nlp. Útil para revisar excesso de entidades no texto.',
  nlpWinkProperNounDensity: 'densidade de nomes próprios (wink)',
  nlpWinkProperNounDensityDesc: 'Nomes próprios por 100 tokens alfanuméricos (PROPN). Valores altos podem reduzir fluidez se sem contextualização.',
  nlpTopicsDesc: 'Tópicos e entidades recorrentes extraídos pelo pacote NLP. Úteis para conferir foco terminológico do manuscrito. Clique para destacar.',
  nlpEntities: 'entidades nomeadas',
  nlpEntitiesDesc: 'Pessoas, organizações e lugares detectados no corpo do manuscrito. Útil para conferir nomes próprios, instituições, softwares e locais. Clique para destacar.',
  nlpValuesDates: 'valores/datas NLP',
  nlpValuesDatesDesc: 'Valores e datas reconhecidos pelo NLP, incluindo alguns números escritos por extenso. Use para checar evidências textuais. Clique para destacar.',
  nlpAdverbs: 'advérbios',
  nlpAdverbsDesc: 'Advérbios detectados pelo NLP. Excesso pode enfraquecer precisão ou criar tom menos objetivo em manuscritos. Clique para destacar.',
  nlpContractions: 'contrações',
  nlpContractionsDesc: "Contrações detectadas (ex.: isn't, don't). Em inglês formal, contrações devem ser evitadas em textos científicos.",
  nlpQuestions: 'frases interrogativas',
  nlpQuestionsDesc: 'Frases interrogativas detectadas no corpo do texto. Perguntas retóricas devem ser usadas com cautela em manuscritos científicos.',
  readability: 'legibilidade', flesch: 'flesch', grade: 'nível', fog: 'fog',
  complexSent: 'frases complexas', hedges: 'atenuadores', repeatedStarts: 'inícios repetidos',
  hedgeDensity: 'dens. atenuadores',
  undefinedAcronyms: 'siglas sem definição', emphaticPunct: 'pontuação enfática',
  evidence: 'evidências', evidenceDensity: 'dens. evidências',
  termVariants: 'variações de termo', cohesionGaps: 'lacunas de coesão',
  longParagraphs: 'parágrafos longos',
  citationGaps: 'lacunas de citação',
  resultsCitations: 'citações em Resultados',
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
  repeatedTermsDesc: 'Número de termos repetidos no documento, excluindo palavras funcionais e termos ignorados. Clique para destacar as repetições nos parágrafos.',
  connectorsDesc: 'Total de conectores detectados. Clique para destacar no texto.',
  nominalizationDesc: 'Nominalizações: substantivos derivados de verbos/adjetivos que densificam o texto. Clique para destacar.',
  fleschDesc: 'Flesch Reading Ease: quanto maior, mais fácil. 0–30 = muito difícil (acadêmico); 60–70 = padrão jornalístico.',
  gradeDesc: 'Flesch-Kincaid Grade Level: equivalência ao ano escolar americano. Artigos científicos típicos ficam entre 12–16.',
  fogDesc: 'Gunning Fog Index: estima os anos de escolaridade necessários para compreender o texto na primeira leitura. Fórmula: 0,4 × (palavras/frase + % palavras complexas). Textos acadêmicos: 12–18.',
  complexSentDesc: 'Frases com múltiplas orações subordinadas ou alta complexidade sintática. Clique para destacar.',
  hedgeDesc: 'Atenuadores: expressões que reduzem a força assertiva (ex.: pode, sugere, parece). Clique para destacar.',
  undefinedAcronymsDesc: 'Siglas usadas no texto sem definição prévia entre parênteses.',
  emphaticPunctDesc: 'Ocorrências de pontuação enfática (! ou ??) — inadequadas em textos científicos.',
  evidenceDesc: 'Marcadores de evidência: números, percentuais, unidades de medida e citações. Clique para destacar no texto.',
  termVariantsDesc: 'Formas divergentes de um mesmo termo — possível inconsistência terminológica.',
  cohesionGapsDesc: 'Parágrafos sem conector de transição no início, após parágrafo de múltiplas frases. Clique para destacar.',
  longParagraphsDesc: 'Parágrafos acima do limite configurado de palavras. Clique para destacar.',
  citationGapsDesc: 'Parágrafos em Introdução/Discussão sem marcador de citação detectado. Clique para destacar.',
  resultsCitationsDesc: 'Parágrafos de Resultados com citação bibliográfica detectada. Clique para destacar.',
  abstractCoverageDesc: 'Presença dos elementos esperados no Resumo: objetivo, método, resultado, conclusão.',
  colloquialDesc: 'Termos informais ou coloquiais detectados — evitar em textos científicos. Clique para destacar.',
  repeatedStartsDesc: 'Frases consecutivas que iniciam com a mesma palavra ou expressão. Clique para destacar.',
  sectionScoreDesc: 'Score médio de complexidade das seções (0–100). Valores altos indicam seções mais densas.',
  noVerbDesc: 'Frases sem verbo principal identificável. Clique para destacar no texto.',
  connectorAddDesc: 'Conectores aditivos (e, além disso, também…). Clique para destacar.',
  connectorContrastDesc: 'Conectores de contraste (mas, porém, contudo…). Clique para destacar.',
  connectorCauseDesc: 'Conectores de causa/efeito (porque, pois, portanto…). Clique para destacar.',
  connectorConclusionDesc: 'Conectores de conclusão (logo, assim, portanto…). Clique para destacar.',
  connectorTimeDesc: 'Conectores temporais (quando, depois, antes…). Clique para destacar.',
  pronounAmbig: 'pronomes ambíguos',
  pronounAmbigDesc: 'Frases iniciadas com pronomes demonstrativos/pessoais sem antecedente claro (isso, este, eles…). Clique para destacar.',
  modalVerbs: 'verbos modais',
  modalVerbsDesc: 'Verbos modais (pode, deve, seria…). Excesso em Resultados indica falta de assertividade. Clique para destacar.',
  firstPerson: 'primeira pessoa',
  firstPersonDesc: 'Uso de primeira pessoa (eu, nós, nossa…). Verifique as normas do periódico. Clique para destacar.',
  sectionBalance: 'balanço de seções',
  sectionBalanceDesc: 'Variação (CV) no comprimento das seções. Seções muito curtas ou longas em relação ao total são sinalizadas.',
  conceptCoverage: 'cobertura conceitual',
  conceptCoverageDesc: 'Cobertura de elementos fundamentais esperados por seção (heurística conservadora).',
  conceptMissing: 'lacunas conceituais',
  conceptMissingDesc: 'Total de itens essenciais ausentes nas seções avaliadas.',
  conceptWeakSections: 'seções com lacunas',
  conceptWeakSectionsDesc: 'Seções com baixa cobertura conceitual (heurística textual).',
  conceptGap: 'lacuna de conhecimento',
  conceptObjective: 'objetivo/hipótese',
  conceptSignificance: 'relevância/impacto',
  conceptDesign: 'desenho e amostra',
  conceptReproducibility: 'reprodutibilidade/análise',
  conceptQuantResult: 'resultado quantitativo',
  conceptInterpretation: 'interpretação dos achados',
  conceptLimitations: 'limitações',
  conceptImplications: 'implicações/próximos passos',
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
  groupSentences: 'Frases',
  groupParagraphs: 'Parágrafos & Seções',
  groupReadability: 'Legibilidade',
  groupVocabulary: 'Vocabulário',
  groupVoice: 'Voz & Tom',
  groupConnectors: 'Conectores',
  groupCitations: 'Citações & Referências',
  groupEvidence: 'Evidências',
  groupNlp: 'NLP científico',
  groupAbstract: 'Resumo',
  groupSearchSelection: 'Busca & Seleção',
  italicText: 'itálico',
  italicTextDesc: 'Elementos em itálico no manuscrito. Clique para destacar.',
  regexSearch: 'busca regex',
  regexSearchDesc: 'Informe uma regex para destacar ocorrências no texto.',
  regexPlaceholder: 'regex (ex.: gene[s]?|p-valor)',
  regexApply: 'marcar',
  regexClear: 'limpar',
  regexMatches: 'ocorrências',
  regexInvalid: 'regex inválida',
  referencesUsed: 'referências usadas',
  referencesUsedDesc: 'Entradas do ref.bib citadas no manuscrito.',
  citationsTotal: 'citações',
  citationsTotalDesc: 'Marcadores de citação detectados no texto.',
  doiValidation: 'validação DOI',
  doiValidationDesc: 'Entradas DOI validadas via CrossRef (ok / total). Passe o mouse sobre os links DOI nas Referências para ver os detalhes por campo.',
  figuresTotal: 'figuras',
  figuresTotalDesc: 'Quantidade total de figuras com identificador fig- no documento.',
  figureCrossRefs: 'cross-ref de figuras',
  figureCrossRefsDesc: 'Cobertura de referências cruzadas para figuras (referenciadas/total).',
  figureRefOrder: 'ordem refs figuras break',
  figureRefOrderDesc: 'Quantidade de quebras de ordem nas referências de figuras (ex.: Figura 2 citada antes da Figura 1).',
  tablesTotal: 'tabelas',
  tablesTotalDesc: 'Quantidade total de tabelas com identificador tbl- no documento.',
  tableCrossRefs: 'cross-ref de tabelas',
  tableCrossRefsDesc: 'Cobertura de referências cruzadas para tabelas (referenciadas/total).',
  tableRefOrder: 'ordem refs tabelas break',
  tableRefOrderDesc: 'Quantidade de quebras de ordem nas referências de tabelas (ex.: Tabela 2 citada antes da Tabela 1).',
  citations: 'citações',
  noCitationsIntroDiscussion: 'Introdução/Discussão sem citação neste parágrafo.',
  resultsCitationDesc: 'Resultados com citação: verifique se é realmente necessário.',
};

// src/lang/en.js — English UI strings
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.
var L_EN = {
  wSuffix: 'w', sent: 'sentence', sentP: 'sentences',
  diversity: 'diversity', longSent: '🟡 long sentence',
  passive: 'passive voice', repeated: 'repeated:', cross: 'recurrent in section:',
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
  topRepeated: 'global repeats', repeatedTerms: 'repetitions',
  connectors: 'connectors', nominalization: 'nominalizations',
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
  analysisPreparing: 'analyzing text...', spellcheckPreparing: 'checking spelling...',
  spellingIssue: 'possible spelling issue',
  sourceConnectBtn: 'connect source',
  sourceConnectedBtn: 'source connected',
  sourceConnectTitle: 'Connect the source .qmd file to apply spelling fixes',
  sourceConnectedTitle: 'Connected source file',
  sourceUnsupported: 'This browser does not support direct source-file editing. Use Chrome or Edge on a local/secure page.',
  sourceMustBeQmd: 'Choose a .qmd file.',
  sourceDoesNotMatch: 'The selected .qmd does not appear to be the source for this HTML.',
  sourceNotConnected: 'Connect the .qmd source to apply fixes.',
  sourceReady: 'Source ready',
  sourceApplying: 'Applying to source...',
  sourceApplied: 'Applied to source. Render again to refresh the HTML.',
  sourceAmbiguous: 'Ambiguous source match. No change was made.',
  sourceWordMissing: 'Word not found in source file.',
  sourceNoChange: 'No source change was needed.',
  sourceYamlMissing: 'YAML front matter not found.',
  sourceScientificWritingMissing: 'scientific-writing YAML block not found.',
  sourceAddingIgnore: 'Adding to ignore list...',
  sourceIgnoreAdded: 'Added to spellcheck-ignore-terms. Render again to refresh the HTML.',
  sourceIgnoreAlreadyExists: 'Already in spellcheck-ignore-terms.',
  noSpellingSuggestions: 'No suggestions',
  ignoreSpellingBtn: 'ignore',
  ignoreSpellingSourceBtn: 'ignore in source',
  closeBtn: 'close',
  analysisEngine: 'JS-only engine',
  analysisLoadingNlp: 'loading NLP from CDN...',
  analysisWorker: 'worker', analysisSync: 'direct', analysisCache: 'cache', analysisTime: 'time',
  nlpEngine: 'NLP engine',
  nlpLoaded: 'cdnjs active',
  nlpDisabled: 'disabled',
  nlpFallback: 'heuristic fallback',
  nlpUnavailable: 'CDN unavailable',
  nlpNominalLoad: 'noun-dense sentences',
  nlpNominalLoadDesc: 'Sentences with high noun/nominalization load, a common source of dense scientific prose. Click to highlight.',
  nlpWeakVerbs: 'generic verbs',
  nlpWeakVerbsDesc: 'Low-information or overly generic predicates; in manuscripts, prefer verbs that express the scientific relationship precisely. Click to highlight.',
  nlpNounStacks: 'noun stacks',
  nlpNounStacksDesc: 'Long technical term chains without a preposition or pause. They can reduce readability, especially in titles and Results. Click to highlight.',
  nlpVerbDiversity: 'verb diversity',
  nlpVerbDiversityDesc: 'Share of distinct verbs among detected verbs. Low values indicate reliance on a small predicate set.',
  nlpNounVerbRatio: 'noun/verb ratio',
  nlpNounVerbRatioDesc: 'Ratio between nouns and verbs detected by the NLP engine. High values suggest a nominal, less action-oriented style.',
  nlpNounDensity: 'noun density',
  nlpNounDensityDesc: 'Nouns per 100 words. Very high density can indicate over-nominalized prose and less explicit action.',
  nlpKeyTerms: 'NLP key terms',
  nlpKeyTermsDesc: 'Candidate central manuscript terms extracted by frequency and, when available, by the NLP analyzer.',
  nlpTermDrift: 'term drift',
  nlpTermDriftDesc: 'Number of term families with competing surface forms in the same text/section. High values suggest naming inconsistency.',
  nlpTopics: 'NLP topics',
  nlpEntityDensity: 'entity density',
  nlpEntityDensityDesc: 'Named entities per 100 words. High density without context may hurt readability.',
  nlpEntityOverload: 'entity overload',
  nlpEntityOverloadDesc: 'Sentences with high concentration of named entities. Useful to review overloaded proper names/terms.',
  nlpActionVerbScore: 'action verb score',
  nlpActionVerbScoreDesc: 'Share of non-generic verbs over total verbs. Higher values indicate more concrete, action-oriented writing.',
  nlpSentencePatternRepeats: 'sentence opening patterns',
  nlpSentencePatternRepeatsDesc: 'Repeated syntactic opening patterns across sentences (first two content words).',
  nlpSemanticRedundancy: 'semantic redundancy',
  nlpSemanticRedundancyDesc: 'Percentage of adjacent sentence pairs with high content-word overlap.',
  nlpFlowScore: 'flow score',
  nlpFlowScoreDesc: 'Continuity indicator between adjacent sentences using lexical overlap and discourse connectors.',
  nlpTenseProfile: 'tense profile',
  nlpTenseProfileDesc: 'Approximate distribution of verbal tense/mood (past, present, future/modal) via wink-nlp.',
  nlpWinkPosNounStacks: 'POS noun stacks (wink)',
  nlpWinkPosNounStacksDesc: 'Long noun stacks detected via POS tagging (NOUN/PROPN/ADJ) in wink-nlp. More robust than regex for technical English.',
  nlpWinkReadingEase: 'reading ease (Flesch)',
  nlpWinkReadingEaseDesc: 'Flesch Reading Ease Score (0–100). Lower values indicate harder text. Typical scientific range: 30–50.',
  nlpWinkGradeLevel: 'grade level (F-K)',
  nlpWinkGradeLevelDesc: 'Flesch-Kincaid Grade Level — education level needed to understand the text. Scientific articles typically score 12–16.',
  nlpWinkAvgWords: 'avg words/sentence (wink)',
  nlpWinkAvgWordsDesc: 'Average number of words per sentence computed by wink-nlp.',
  nlpWinkReadTime: 'reading time (wink)',
  nlpWinkReadTimeDesc: 'Estimated reading time computed by wink-nlp for the English text.',
  nlpWinkComplexWords: 'complex words (wink)',
  nlpWinkComplexWordsDesc: 'Complex words detected by wink-nlp. In scientific English, very high density can signal overly heavy prose. Click to highlight.',
  nlpWinkModalVerbs: 'modal verbs (wink)',
  nlpWinkModalVerbsDesc: 'Modals detected by wink-nlp (can, could, may, might, should, would, etc.). Useful for reviewing caution, speculation, or obligation. Click to highlight.',
  nlpWinkPassive: 'passive voice (wink)',
  nlpWinkPassiveDesc: 'Passive-voice sentences detected via wink-nlp POS tagging (main verb preceded by a form of "to be"). Click to highlight.',
  nlpWinkComplexDensity: 'complex word density (wink)',
  nlpWinkComplexDensityDesc: 'Percentage of polysyllabic words (≥3 syllables) in the text, computed by wink-nlp. Values above 20% may indicate very dense prose.',
  nlpWinkVerbDiversity: 'verb diversity (wink)',
  nlpWinkVerbDiversityDesc: 'Ratio of unique verb lemmas to total verbs detected by wink-nlp (POS: VERB). Higher values indicate more varied verb vocabulary.',
  nlpWinkPronouns: 'pronouns (wink)',
  nlpWinkPronounsDesc: 'Pronouns detected via POS tagging (PRON). Excessive usage can reduce referential precision in dense passages.',
  nlpWinkPronounDensity: 'pronoun density (wink)',
  nlpWinkPronounDensityDesc: 'Pronouns per 100 alphanumeric tokens. High values may indicate over-reliance on anaphoric references.',
  nlpWinkAuxiliaries: 'auxiliaries (wink)',
  nlpWinkAuxiliariesDesc: 'Auxiliary verbs detected (AUX). High concentration can indicate long verbal chains and less direct style.',
  nlpWinkAuxVerbRatio: 'AUX/VERB ratio (wink)',
  nlpWinkAuxVerbRatioDesc: 'Ratio between auxiliaries and lexical verbs. Useful for reviewing periphrastic overload.',
  nlpWinkNumericDensity: 'numeric density (wink)',
  nlpWinkNumericDensityDesc: 'Numeric tokens per 100 alphanumeric tokens (POS: NUM). Helps assess concentration of quantitative evidence.',
  nlpWinkLexicalDensity: 'lexical density (wink)',
  nlpWinkLexicalDensityDesc: 'Share of open-class tokens (NOUN/VERB/ADJ/ADV/PROPN) per 100 alphanumeric tokens.',
  nlpWinkProperNouns: 'proper nouns (wink)',
  nlpWinkProperNounsDesc: 'Terms tagged as proper nouns (PROPN) by wink-nlp. Useful for reviewing entity concentration.',
  nlpWinkProperNounDensity: 'proper noun density (wink)',
  nlpWinkProperNounDensityDesc: 'Proper nouns per 100 alphanumeric tokens (PROPN). High values may hurt readability without context.',
  nlpTopicsDesc: "Recurring topics and entities extracted by the NLP package. Useful for checking the manuscript’s terminological focus. Click to highlight.",
  nlpEntities: 'named entities',
  nlpEntitiesDesc: 'People, organizations, and places detected in the manuscript body. Useful for checking proper names, institutions, software, and locations. Click to highlight.',
  nlpValuesDates: 'NLP values/dates',
  nlpValuesDatesDesc: 'Values and dates recognized by NLP, including some numbers written as words. Use to check textual evidence. Click to highlight.',
  nlpAdverbs: 'adverbs',
  nlpAdverbsDesc: 'Adverbs detected by NLP. Excess can weaken precision or create a less objective manuscript tone. Click to highlight.',
  nlpContractions: 'contractions',
  nlpContractionsDesc: "Contractions detected (e.g., isn't, don't). In formal scientific writing, contractions should be avoided.",
  nlpQuestions: 'interrogative sentences',
  nlpQuestionsDesc: 'Interrogative sentences detected in the body text. Rhetorical questions should be used sparingly in scientific manuscripts.',
  readability: 'readability', flesch: 'flesch', grade: 'grade', fog: 'fog',
  complexSent: 'complex sentences', hedges: 'hedges', repeatedStarts: 'repeated starts',
  hedgeDensity: 'hedge density',
  undefinedAcronyms: 'undefined acronyms', emphaticPunct: 'emphatic punctuation',
  evidence: 'evidence', evidenceDensity: 'evidence density',
  termVariants: 'term variants', cohesionGaps: 'cohesion gaps',
  longParagraphs: 'long paragraphs',
  citationGaps: 'citation gaps',
  resultsCitations: 'Results citations',
  abstractCoverage: 'abstract coverage', colloquial: 'colloquial tone',
  avgSentenceDesc: 'Average sentence length (words). Recommended: ≤25 for scientific texts.',
  sentenceVarDesc: 'Variation in sentence length. Greater variation suggests a more dynamic rhythm.',
  avgParagraphDesc: 'Average paragraph length in words.',
  longestSentenceDesc: 'Longest sentence in the document. Click to highlight long sentences in text.',
  docDiversityDesc: 'Lexical diversity: % of unique words. Above 55% indicates good vocabulary variation.',
  passiveTotalDesc: 'Total passive voice constructions detected. Click to highlight in text.',
  passiveDensityDesc: 'Passive voice per 1000 words. Acceptable in Methods; avoid elsewhere.',
  longSentRateDesc: 'Proportion of long sentences (above threshold). Click to highlight in text.',
  topRepeatedDesc: 'Most repeated words in the document. Click to highlight.',
  repeatedTermsDesc: 'Number of repeated terms in the document, excluding function words and ignored terms. Click to highlight repetitions in paragraphs.',
  connectorsDesc: 'Total connectors detected. Click to highlight in text.',
  nominalizationDesc: 'Nominalizations: nouns derived from verbs/adjectives that can densify prose. Click to highlight.',
  fleschDesc: 'Flesch Reading Ease: higher = easier. 0–30 = very difficult (academic); 60–70 = standard.',
  gradeDesc: 'Flesch-Kincaid Grade Level: U.S. school year equivalent. Academic papers typically score 12–16.',
  fogDesc: 'Gunning Fog Index: estimates years of schooling needed to understand the text on first reading. Formula: 0.4 × (words/sentence + % complex words). Academic texts: 12–18.',
  complexSentDesc: 'Sentences with multiple subordinate clauses or high syntactic complexity. Click to highlight.',
  hedgeDesc: 'Hedges: expressions that weaken assertive force (e.g., may, suggests, appears). Click to highlight.',
  undefinedAcronymsDesc: 'Acronyms used in the text without a prior parenthetical definition.',
  emphaticPunctDesc: 'Emphatic punctuation occurrences (! or ??) — inappropriate in scientific texts.',
  evidenceDesc: 'Evidence markers: numbers, percentages, measurement units, and citations. Click to highlight in text.',
  termVariantsDesc: 'Divergent forms of the same term — possible terminological inconsistency.',
  cohesionGapsDesc: 'Paragraphs without a transition connector at the start, after a multi-sentence paragraph. Click to highlight.',
  longParagraphsDesc: 'Paragraphs above the configured word limit. Click to highlight.',
  citationGapsDesc: 'Introduction/Discussion paragraphs without a detected citation marker. Click to highlight.',
  resultsCitationsDesc: 'Results paragraphs with a detected bibliographic citation. Click to highlight.',
  abstractCoverageDesc: 'Presence of expected elements in the Abstract: objective, method, result, conclusion.',
  colloquialDesc: 'Informal or colloquial terms detected — avoid in scientific writing. Click to highlight.',
  repeatedStartsDesc: 'Consecutive sentences beginning with the same word or phrase. Click to highlight.',
  sectionScoreDesc: 'Average section complexity score (0–100). Higher values indicate denser sections.',
  noVerbDesc: 'Sentences with no identifiable main verb. Click to highlight in text.',
  connectorAddDesc: 'Additive connectors (and, furthermore, also…). Click to highlight.',
  connectorContrastDesc: 'Contrast connectors (but, however, yet…). Click to highlight.',
  connectorCauseDesc: 'Causal connectors (because, therefore, since…). Click to highlight.',
  connectorConclusionDesc: 'Conclusion connectors (thus, hence, therefore…). Click to highlight.',
  connectorTimeDesc: 'Temporal connectors (when, after, before…). Click to highlight.',
  pronounAmbig: 'ambiguous pronouns',
  pronounAmbigDesc: 'Sentences starting with demonstrative/personal pronouns without a clear antecedent (it, this, they…). Click to highlight.',
  modalVerbs: 'modal verbs',
  modalVerbsDesc: 'Modal verbs (may, might, would, should…). Overuse in Results signals lack of assertiveness. Click to highlight.',
  firstPerson: 'first person',
  firstPersonDesc: 'First-person usage (I, we, our…). Check your journal’s style guide. Click to highlight.',
  sectionBalance: 'section balance',
  sectionBalanceDesc: 'Coefficient of variation (CV) of section lengths. Flags sections disproportionately short or long.',
  conceptCoverage: 'concept coverage',
  conceptCoverageDesc: 'Coverage of core high-impact elements expected per section (conservative heuristic).',
  conceptMissing: 'concept gaps',
  conceptMissingDesc: 'Total missing core items across evaluated sections.',
  conceptWeakSections: 'sections with gaps',
  conceptWeakSectionsDesc: 'Sections with low concept coverage (textual heuristic).',
  conceptGap: 'knowledge gap',
  conceptObjective: 'objective/hypothesis',
  conceptSignificance: 'significance/impact',
  conceptDesign: 'design and sample',
  conceptReproducibility: 'reproducibility/analysis',
  conceptQuantResult: 'quantitative result',
  conceptInterpretation: 'interpretation of findings',
  conceptLimitations: 'limitations',
  conceptImplications: 'implications/next steps',
  paraOpeningRepeat: 'repeated ¶ openings',
  paraOpeningRepeatDesc: 'Paragraphs starting with the same word — signals structural monotony.',
  citationSentStart: 'citations at start',
  citationSentStartDesc: 'Sentences opening directly with a citation — poor editorial practice. Click to highlight.',
  citationSentEnd: 'citations at end',
  citationSentEndDesc: 'Sentences ending with a citation before completing the author’s own idea.',
  abstractWordCount: 'abstract words',
  abstractWordCountDesc: 'Word count of the Abstract. Typical range: 150–300 words.',
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
  groupSentences: 'Sentences',
  groupParagraphs: 'Paragraphs & Sections',
  groupReadability: 'Readability',
  groupVocabulary: 'Vocabulary',
  groupVoice: 'Voice & Tone',
  groupConnectors: 'Connectors',
  groupCitations: 'Citations & References',
  groupEvidence: 'Evidence',
  groupNlp: 'Scientific NLP',
  groupAbstract: 'Abstract',
  groupSearchSelection: 'Search & Select',
  italicText: 'italic',
  italicTextDesc: 'Italicized elements in the manuscript. Click to highlight.',
  regexSearch: 'regex search',
  regexSearchDesc: 'Enter a regex to highlight matches in text.',
  regexPlaceholder: 'regex (e.g.: gene[s]?|p-value)',
  regexApply: 'highlight',
  regexClear: 'clear',
  regexMatches: 'matches',
  regexInvalid: 'invalid regex',
  referencesUsed: 'references used',
  referencesUsedDesc: 'ref.bib entries cited in the manuscript.',
  citationsTotal: 'citations',
  citationsTotalDesc: 'Citation markers detected in the text.',
  doiValidation: 'DOI validation',
  doiValidationDesc: 'DOI entries validated against CrossRef (ok / total). Hover over DOI links in References to see field-by-field details.',
  figuresTotal: 'figures',
  figuresTotalDesc: 'Total number of figures with fig- identifiers in the document.',
  figureCrossRefs: 'figure cross-refs',
  figureCrossRefsDesc: 'Cross-reference coverage for figures (referenced/total).',
  figureRefOrder: 'figure ref order break',
  figureRefOrderDesc: 'Number of figure reference order breaks (e.g., Figure 2 cited before Figure 1).',
  tablesTotal: 'tables',
  tablesTotalDesc: 'Total number of tables with tbl- identifiers in the document.',
  tableCrossRefs: 'table cross-refs',
  tableCrossRefsDesc: 'Cross-reference coverage for tables (referenced/total).',
  tableRefOrder: 'table ref order break',
  tableRefOrderDesc: 'Number of table reference order breaks (e.g., Table 2 cited before Table 1).',
  citations: 'citations',
  noCitationsIntroDiscussion: 'Introduction/Discussion paragraph without citation.',
  resultsCitationDesc: 'Results paragraph with citation: verify whether it is necessary.',
  wordyPhrases: 'wordy phrases',
  wordyPhrasesDesc: 'Expressions that can be simplified for greater clarity.',
  tenseWarning: 'verb tense warning',
  tenseWarningDesc: 'The dominant verb tense in this section appears to diverge from the expected pattern for this type of scientific section.',
  acronymFirstUse: 'acronym without initial definition',
};

// src/lang/index.js — selects UI strings for the active document language.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

  var L = LANG === 'en' ? L_EN : L_PT;

// src/utils/text.js — Basic text normalization, sentence splitting, word and syllable counts.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

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

// src/detect/connectors.js — Paragraph-level cohesion gap detection. Connector taxonomy lives below with connector highlighting helpers.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

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

// src/detect/sections.js — Paragraph opening repetition helpers. Section summary helpers are in analysis/section.js.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

  function getParaOpeningKey(text) {
    var src = String(text || '').trim().replace(/^["'«\(\[\{\s]+/, '');
    var words = (src.match(LANG === 'en' ? /\b[a-z]+\b/gi : /\b[a-záéíóúàâêôãõüçñ]+\b/gi) || [])
      .map(normalizeWord)
      .filter(Boolean);
    if (!words.length) return '';
    if (words.length === 1) return words[0];
    return words[0] + ' ' + words[1];
  }

  function getParaOpeningRepeats(paragraphTexts) {
    var freq = {};
    (paragraphTexts || []).forEach(function (t) {
      var key = getParaOpeningKey(t);
      if (!key || key.length < 3) return;
      freq[key] = (freq[key] || 0) + 1;
    });
    return Object.keys(freq)
      .filter(function (k) { return freq[k] >= 2; })
      .sort(function (a, b) { return freq[b] - freq[a] || a.localeCompare(b); })
      .map(function (k) { return { word: k, count: freq[k] }; });
  }

// src/detect/citations.js — Citation marker and citation position detection.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

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

// src/detect/references.js — Bibliography key usage detection.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

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

// src/detect/crossrefs.js — Figure and table cross-reference coverage/order checks.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

  function getCrossRefUsage(root) {
    var scope = root || document;
    scope.querySelectorAll('.ws-xref-order-fig, .ws-xref-order-tbl').forEach(function (el) {
      el.classList.remove('ws-xref-order-fig', 'ws-xref-order-tbl');
      if (el.dataset && (el.dataset.wsFocus === 'figure-ref-order' || el.dataset.wsFocus === 'table-ref-order')) {
        delete el.dataset.wsFocus;
        delete el.dataset.wsReason;
      }
    });

    var figureTargets = new Set();
    var tableTargets = new Set();

    // Quarto emits a secondary anchor for every float caption with an id like
    // "tbl-foo-caption-0ceaefa1-69ba-4598-a22c-09a6ac19f8ca". These share the
    // fig-/tbl- prefix but are not cross-reference targets, so counting them
    // double-counts every figure/table. Skip them.
    function isCaptionAnchorId(id) {
      return /-caption-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    }

    scope.querySelectorAll('[id^="fig-"]').forEach(function (node) {
      var id = String(node.id || '').trim();
      if (id && !isCaptionAnchorId(id)) figureTargets.add(id);
    });
    scope.querySelectorAll('[id^="tbl-"]').forEach(function (node) {
      var id = String(node.id || '').trim();
      if (id && !isCaptionAnchorId(id)) tableTargets.add(id);
    });

    var figureRefs = new Set();
    var tableRefs = new Set();
    scope.querySelectorAll('a[href^="#fig-"]').forEach(function (a) {
      var id = String(a.getAttribute('href') || '').replace(/^#/, '').trim();
      if (id) figureRefs.add(id);
    });
    scope.querySelectorAll('a[href^="#tbl-"]').forEach(function (a) {
      var id = String(a.getAttribute('href') || '').replace(/^#/, '').trim();
      if (id) tableRefs.add(id);
    });

    var figureReferenced = Array.from(figureTargets).filter(function (id) { return figureRefs.has(id); });
    var tableReferenced = Array.from(tableTargets).filter(function (id) { return tableRefs.has(id); });
    var figureMissing = Array.from(figureTargets).filter(function (id) { return !figureRefs.has(id); });
    var tableMissing = Array.from(tableTargets).filter(function (id) { return !tableRefs.has(id); });

    function getRefNumber(node) {
      var txt = String((node && node.textContent) || '').trim();
      var m = txt.match(/(\d+)(?!.*\d)/);
      return m ? Number(m[1]) : null;
    }

    function getOrderIssues(selector, cls, focusKey, title) {
      var prev = null;
      var issues = [];
      scope.querySelectorAll(selector).forEach(function (a) {
        var n = getRefNumber(a);
        if (n == null) return;
        if (prev != null && n < prev) {
          var issue = prev + '→' + n;
          issues.push(issue);
          a.classList.add(cls);
          markReason(a, focusKey, title + ' (' + issue + ')');
        }
        prev = n;
      });
      return {
        count: issues.length,
        examples: issues.slice(0, 5),
      };
    }

    var figureOrder = getOrderIssues('a[href^="#fig-"]', 'ws-xref-order-fig', 'figure-ref-order', L.figureRefOrder);
    var tableOrder = getOrderIssues('a[href^="#tbl-"]', 'ws-xref-order-tbl', 'table-ref-order', L.tableRefOrder);

    return {
      figureCount: figureTargets.size,
      figureReferenced: figureReferenced.length,
      figureMissing: figureMissing,
      figureOrder: figureOrder,
      tableCount: tableTargets.size,
      tableReferenced: tableReferenced.length,
      tableMissing: tableMissing,
      tableOrder: tableOrder,
    };
  }

// src/detect/evidence.js — Abstract length, unit consistency and numeric evidence checks.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

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

// src/analysis/readability.js — Readability, lexical diversity and repetition metrics.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

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
    return getGlobalRepeatedItems(text, 3, limit).map(function (item) {
      return item.text + ' ×' + item.count;
    });
  }

  function getGlobalRepeatedItems(text, minCount, limit) {
    var RE = LANG === 'en' ? /\b[a-z]{4,}\b/gi : /\b[a-záéíóúàâêôãõüç]{4,}\b/gi;
    var freq = {};
    (text.match(RE) || []).forEach(function (w) {
      var lower = w.toLowerCase();
      if (!STOP_WORDS.has(lower) && !shouldIgnoreWord(lower)) freq[lower] = (freq[lower] || 0) + 1;
    });
    var repeated = Object.keys(freq)
      .filter(function (k) { return freq[k] >= (minCount || 3); })
      .sort(function (a, b) { return freq[b] - freq[a]; })
      .map(function (k) { return { text: k, count: freq[k] }; });
    return limit ? repeated.slice(0, limit) : repeated;
  }

// src/detect/connectors-taxonomy.js — Connector categories, ambiguity handling and connector highlighting helpers.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

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

// src/detect/passive.js — Connector totals, nominalization, verb presence and passive voice counters.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

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

// src/utils/math.js — Small math and escaping helpers.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

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

// src/ui/highlight-core.js — Highlight focus registry, reasons and tooltip state.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

  var HIGHLIGHT_FOCUS_CLASSES = {
    'ws-passive': 'passive',
    'ws-long-sentence': 'long',
    'ws-repeated': 'repeated',
    'ws-nominalization': 'nominal',
    'ws-no-verb': 'noverb',
    'ws-hedge': 'hedge',
    'ws-wordy': 'wordy',
    'ws-evidence': 'evidence',
    'ws-evidence-hardcoded': 'evidence-hardcoded',
    'ws-evidence-parameterized': 'evidence-parameterized',
    'ws-modal': 'modal',
    'ws-firstperson': 'firstperson',
    'ws-citation-start': 'citation-start',
    'ws-colloquial': 'colloquial',
    'ws-complex-sent': 'complexsent',
    'ws-repeated-start': 'repeated-start',
    'ws-pronoun-ambig': 'pronounambig',
    'ws-nlp-nominal-load': 'nlp-nominal-load',
    'ws-nlp-weak-verb': 'nlp-weakverb',
    'ws-nlp-noun-stack': 'nlp-nounstack',
    'ws-nlp-topic': 'nlp-topics',
    'ws-nlp-entity': 'nlp-entities',
    'ws-nlp-value-date': 'nlp-values-dates',
    'ws-nlp-adverb': 'nlp-adverbs',
    'ws-xref-order-fig': 'figure-ref-order',
    'ws-xref-order-tbl': 'table-ref-order',
    'ws-wink-passive': 'wink-passive',
    'ws-wink-complex': 'wink-complex',
    'ws-wink-modal': 'wink-modal',
    'ws-wink-pronoun': 'wink-pronoun',
    'ws-wink-auxiliary': 'wink-auxiliary',
    'ws-wink-numeric': 'wink-numeric',
    'ws-wink-propn': 'wink-propn',
    'ws-connector': 'connectors',
    'ws-connector-add': 'connectors-add',
    'ws-connector-contrast': 'connectors-contrast',
    'ws-connector-cause': 'connectors-cause',
    'ws-connector-conclusion': 'connectors-conclusion',
    'ws-connector-time': 'connectors-time',
    'ws-para-long': 'paragraph-long',
    'ws-citation-low': 'citation-low',
    'ws-results-citation': 'results-citation',
    'ws-italic-text': 'italic',
    'ws-regex-match': 'regex',
    'ws-spelling': 'spelling',
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
    if (document.body.classList.contains('ws-focus-evidence-unparameterized')) {
      return 'evidence-unparameterized';
    }
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
            (activeFocus === 'evidence' && r.focus.indexOf('evidence-') === 0) ||
            (activeFocus === 'evidence-unparameterized' &&
              (r.focus === 'evidence' || r.focus === 'evidence-hardcoded'));
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

// src/ui/highlights.js — Generic text and inline annotation highlighters.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

  function highlightItalicText(p) {
    p.querySelectorAll('em, i').forEach(function (el) {
      el.classList.add('ws-italic-text');
      markReason(el, 'italic', L.italicText);
    });
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

  function termBoundaryOk(text, start, end) {
    var before = start > 0 ? text.charAt(start - 1) : '';
    var after = end < text.length ? text.charAt(end) : '';
    return (!before || !isWordChar(before)) && (!after || !isWordChar(after));
  }

  function highlightTermListInNode(node, terms, cls, title) {
    var list = (terms || [])
      .map(function (t) { return normalizeWord(t.text || t); })
      .filter(function (t) { return t.length >= 3; })
      .sort(function (a, b) { return b.length - a.length; })
      .slice(0, 20);
    if (!list.length) return;

    if (node.nodeType === Node.TEXT_NODE) {
      var text = node.textContent;
      var lower = text.toLowerCase();
      var ranges = [];
      list.forEach(function (term) {
        var from = 0;
        while (from < lower.length) {
          var idx = lower.indexOf(term, from);
          if (idx === -1) break;
          var end = idx + term.length;
          if (termBoundaryOk(lower, idx, end)) ranges.push([idx, end]);
          from = idx + Math.max(1, term.length);
        }
      });
      if (!ranges.length) return;
      ranges.sort(function (a, b) { return a[0] - b[0] || b[1] - a[1]; });
      var merged = [];
      ranges.forEach(function (rng) {
        var last = merged[merged.length - 1];
        if (last && rng[0] < last[1]) return;
        merged.push(rng);
      });
      var frag = document.createDocumentFragment();
      var pos = 0;
      merged.forEach(function (rng) {
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
      !node.classList.contains('citation') &&
      !node.classList.contains('csl-entry') &&
      node.id !== 'refs' &&
      node.getAttribute('role') !== 'doc-biblioref'
    ) {
      Array.from(node.childNodes).forEach(function (c) { highlightTermListInNode(c, list, cls, title); });
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

  function highlightColloquial(p) {
    var terms = getColloquialTerms();
    terms.forEach(function (term) {
      var safe = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var re = term.indexOf(' ') >= 0
        ? new RegExp(safe, 'gi')
        : new RegExp('\\b' + safe + '\\b', 'gi');
      highlightRegexInNode(p, re, 'ws-colloquial', L.colloquial);
    });
  }

  function highlightComplexSentences(p) {
    var title = L.complexSent;
    var marked = p.innerHTML.replace(
      /([.!?]+\s+)(?=[A-ZÁÉÍÓÚÀÂÊÔÃÕÜÇÑ"])/g,
      '$1\x00'
    );
    p.innerHTML = marked.split('\x00').map(function (part) {
      var plain = part.replace(/<[^>]+>/g, ' ');
      return sentenceComplexityScore(plain) >= 3
        ? '<span class="ws-complex-sent" data-ws-focus="complexsent" data-ws-reason="' + escapeHTML(title) + '" title="' + escapeHTML(title) + '">' + part + '</span>'
        : part;
    }).join('');
  }

  function highlightRepeatedStarts(p, repeatedParaStartSet) {
    if (!repeatedParaStartSet || repeatedParaStartSet.size === 0) return;
    var text = p.innerText || p.textContent || '';
    var key = getParaOpeningKey(text);
    if (!key || !repeatedParaStartSet.has(key)) return;

    var pattern = key.split(/\s+/).map(function (w) {
      return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('\\s+');
    var re = new RegExp("^(\\s*[\"'«\\(\\[]*)(" + pattern + ")\\b", 'i');
    var title = L.repeatedStarts;
    var walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT, null);
    while (walker.nextNode()) {
      var node = walker.currentNode;
      var src = node.textContent || '';
      if (!src.trim()) continue;
      var m = src.match(re);
      if (!m) return;
      var prefix = m[1] || '';
      var phrase = m[2] || '';
      var suffix = src.slice((prefix + phrase).length);
      var frag = document.createDocumentFragment();
      if (prefix) frag.appendChild(document.createTextNode(prefix));
      var span = document.createElement('span');
      span.className = 'ws-repeated-start';
      markReason(span, 'repeated-start', title);
      span.title = title;
      span.textContent = phrase;
      frag.appendChild(span);
      if (suffix) frag.appendChild(document.createTextNode(suffix));
      node.parentNode.replaceChild(frag, node);
      return;
    }
  }

  function highlightPronounAmbig(p) {
    var re = LANG === 'en'
      ? /(?:^|(?<=[.!?]\s{1,3}))(it|this|these|those|they|them|its)\b/gi
      : /(?:^|(?<=[.!?]\s{1,3}))(isso|este|esta|estes|estas|eles|elas|ele|ela|tal|tais)\b/gi;
    highlightRegexInNode(p, re, 'ws-pronoun-ambig', L.pronounAmbig);
  }

  function highlightWordyPhrases(p) {
    var regexes = getWordyPhrasesRegexes();
    regexes.forEach(function (item) {
      var title = L.wordyPhrases + (item.suggestion ? ' \u2192 ' + item.suggestion : '');
      highlightRegexInNode(p, item.re, 'ws-wordy', title);
    });
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

// src/ui/spelling.js — Optional API-backed spelling underlines.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

  var SPELLCHECK_CACHE = Object.create(null);
  var SPELLING_SOURCE_HANDLE = null;
  var SPELLING_SOURCE_NAME = '';
  var SPELLING_SOURCE_BUTTON = null;
  var SPELLING_TOOLTIP = null;
  var SPELLING_TOOLTIP_TARGET = null;
  var SPELLING_TOAST = null;
  var SPELLING_TOAST_TIMER = null;

  function spellingLabelFor(match, word) {
    var replacements = Array.isArray(match.replacements)
      ? match.replacements.map(function (r) { return r && r.value; }).filter(Boolean).slice(0, 4)
      : [];
    var base = L.spellingIssue || 'Possible spelling issue';
    var msg = match.message || base;
    var out = base + ': ' + word;
    if (replacements.length) out += ' -> ' + replacements.join(', ');
    if (msg && msg !== base) out += ' (' + msg + ')';
    return out;
  }

  function isSpellingMatch(match) {
    var rule = match && match.rule || {};
    var issueType = String(rule.issueType || '').toLowerCase();
    var category = String(rule.category && rule.category.id || '').toUpperCase();
    return issueType === 'misspelling' || category === 'TYPOS';
  }

  function cleanSpellingMatches(text, matches) {
    return (matches || []).filter(function (match) {
      if (!isSpellingMatch(match)) return false;
      var start = Number(match.offset);
      var len = Number(match.length);
      if (!isFinite(start) || !isFinite(len) || len <= 0) return false;
      var word = text.slice(start, start + len);
      if (!/[A-Za-zÁÉÍÓÚÀÂÊÔÃÕÜÇÑáéíóúàâêôãõüçñ]/.test(word)) return false;
      if (/[0-9/@]/.test(word)) return false;
      if (/^[A-ZÁÉÍÓÚÀÂÊÔÃÕÜÇÑ]{2,}$/.test(word)) return false;
      if (shouldIgnoreSpellingWord(word)) return false;
      return true;
    }).sort(function (a, b) {
      return a.offset - b.offset || b.length - a.length;
    });
  }

  function requestLanguageTool(text) {
    var key = SPELLCHECK_LANGUAGE + '\u0000' + hashText(text);
    if (SPELLCHECK_CACHE[key]) return SPELLCHECK_CACHE[key];

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, SPELLCHECK_TIMEOUT_MS) : null;
    var body = new URLSearchParams();
    body.set('text', text);
    body.set('language', SPELLCHECK_LANGUAGE);
    body.set('enabledOnly', 'false');

    SPELLCHECK_CACHE[key] = fetch(SPELLCHECK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: controller ? controller.signal : undefined,
    })
      .then(function (res) {
        if (!res.ok) throw new Error('spellcheck HTTP ' + res.status);
        return res.json();
      })
      .then(function (json) {
        return cleanSpellingMatches(text, json && json.matches);
      })
      .catch(function (err) {
        console.warn('[scientific-writing] spellcheck failed', err);
        return [];
      })
      .finally(function () {
        if (timer) clearTimeout(timer);
      });

    return SPELLCHECK_CACHE[key];
  }

  function spellingContextFor(text, start, end) {
    return {
      before: text.slice(Math.max(0, start - 48), start),
      after: text.slice(end, Math.min(text.length, end + 48)),
    };
  }

  function normalizeSourceContext(s) {
    return String(s || '')
      .replace(/\{\{<\s*var\s+[\w-]+\s*>}}/g, ' ')
      .replace(/\[@[^\]]+]/g, ' ')
      .replace(/[*_`{}[\]()#>~]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function wrapRangesInTextNodes(root, ranges, cls) {
    if (!ranges.length) return 0;
    var rangeIndex = 0;
    var offset = 0;
    var wrapped = 0;

    function visit(node) {
      if (rangeIndex >= ranges.length) return;
      if (node.nodeType === Node.TEXT_NODE) {
        var text = node.textContent;
        var nodeStart = offset;
        var nodeEnd = offset + text.length;
        offset = nodeEnd;
        var local = [];
        while (rangeIndex < ranges.length && ranges[rangeIndex].end <= nodeStart) rangeIndex++;
        var scan = rangeIndex;
        while (scan < ranges.length && ranges[scan].start < nodeEnd) {
          var item = ranges[scan];
          if (item.start >= nodeStart && item.end <= nodeEnd) {
            local.push({
              start: item.start - nodeStart,
              end: item.end - nodeStart,
              reason: item.reason,
              word: item.word,
              replacements: item.replacements,
              before: item.before,
              after: item.after,
            });
          }
          scan++;
        }
        if (!local.length) return;

        var frag = document.createDocumentFragment();
        var pos = 0;
        local.forEach(function (item) {
          if (item.start > pos) frag.appendChild(document.createTextNode(text.slice(pos, item.start)));
          var span = document.createElement('span');
          span.className = cls;
          span.dataset.wsFocus = HIGHLIGHT_FOCUS_CLASSES[cls] || '';
          span.dataset.wsSpellingWord = item.word || span.textContent;
          span.dataset.wsSpellingReplacements = JSON.stringify(item.replacements || []);
          span.dataset.wsSpellingBefore = item.before || '';
          span.dataset.wsSpellingAfter = item.after || '';
          span.textContent = text.slice(item.start, item.end);
          frag.appendChild(span);
          pos = item.end;
          wrapped++;
        });
        if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
        node.parentNode.replaceChild(frag, node);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (
          node.tagName === 'SCRIPT' ||
          node.tagName === 'STYLE' ||
          node.classList.contains('ws-note') ||
          node.classList.contains('citation') ||
          node.classList.contains('csl-entry') ||
          node.classList.contains('ws-spelling') ||
          node.id === 'refs'
        ) {
          offset += (node.textContent || '').length;
          return;
        }
        Array.from(node.childNodes).forEach(visit);
      }
    }

    visit(root);
    return wrapped;
  }

  async function highlightSpelling(p, text) {
    if (!SPELLCHECK_ENABLED) return 0;
    if (SPELLCHECK_PROVIDER !== 'languagetool') return 0;
    if (!text || text.length < 3 || typeof fetch !== 'function' || typeof URLSearchParams !== 'function') return 0;

    var matches = await requestLanguageTool(text);
    var ranges = [];
    matches.forEach(function (match) {
      var start = Number(match.offset);
      var end = start + Number(match.length);
      if (ranges.length && start < ranges[ranges.length - 1].end) return;
      var word = text.slice(start, end);
      var replacements = Array.isArray(match.replacements)
        ? match.replacements.map(function (r) { return r && r.value; }).filter(Boolean).slice(0, 5)
        : [];
      var context = spellingContextFor(text, start, end);
      ranges.push({
        start: start,
        end: end,
        word: word,
        replacements: replacements,
        before: context.before,
        after: context.after,
        reason: spellingLabelFor(match, word),
      });
    });
    var count = wrapRangesInTextNodes(p, ranges, 'ws-spelling');
    if (count) {
      ensureSpellingTooltipWired();
    }
    return count;
  }

  function supportsSourceFileAccess() {
    return typeof window.showOpenFilePicker === 'function';
  }

  function sourceValidationText() {
    var root =
      document.getElementById('quarto-document-content') ||
      document.querySelector('main') ||
      document.body;
    return normalizeSourceContext((root.innerText || root.textContent || '')).toLowerCase();
  }

  function validateSpellingSourceFile(name, content) {
    if (!/\.qmd$/i.test(String(name || ''))) {
      throw new Error(L.sourceMustBeQmd || 'Choose a .qmd file.');
    }

    var source = normalizeSourceContext(content).toLowerCase();
    var rendered = sourceValidationText();
    var title = (document.querySelector('h1.title, .quarto-title h1, #title-block-header h1') || {}).textContent || '';
    var checks = [];
    if (title) checks.push(normalizeSourceContext(title).toLowerCase());

    var paras = Array.from(document.querySelectorAll('#quarto-document-content p, main p'))
      .map(function (p) { return normalizeSourceContext(p.innerText || p.textContent || '').toLowerCase(); })
      .filter(function (s) { return s.length >= 35; })
      .slice(0, 4);
    paras.forEach(function (p) {
      checks.push(p.slice(0, Math.min(90, p.length)));
    });

    var passed = checks.filter(function (needle) {
      return needle && (source.indexOf(needle) !== -1 || rendered.indexOf(needle) !== -1 && source.indexOf(needle.slice(0, 45)) !== -1);
    }).length;

    if (!checks.length || passed < Math.min(2, checks.length)) {
      throw new Error(L.sourceDoesNotMatch || 'The selected .qmd does not appear to be the source for this HTML.');
    }
  }

  function setSpellingSourceButtonState() {
    if (!SPELLING_SOURCE_BUTTON) return;
    SPELLING_SOURCE_BUTTON.textContent = SPELLING_SOURCE_HANDLE
      ? (L.sourceConnectedBtn || 'source connected')
      : (L.sourceConnectBtn || 'connect source');
    SPELLING_SOURCE_BUTTON.classList.toggle('ws-control-on', !!SPELLING_SOURCE_HANDLE);
    SPELLING_SOURCE_BUTTON.title = SPELLING_SOURCE_HANDLE
      ? ((L.sourceConnectedTitle || 'Connected source file') + ': ' + SPELLING_SOURCE_NAME)
      : (L.sourceConnectTitle || 'Connect the source .qmd file');
  }

  function showSpellingToast(message, level) {
    if (!message) return;
    if (!SPELLING_TOAST) {
      SPELLING_TOAST = document.createElement('div');
      SPELLING_TOAST.className = 'ws-toast';
      document.body.appendChild(SPELLING_TOAST);
    }
    SPELLING_TOAST.textContent = message;
    SPELLING_TOAST.className = 'ws-toast ws-toast-visible ws-toast-' + (level || 'warn');
    if (SPELLING_TOAST_TIMER) clearTimeout(SPELLING_TOAST_TIMER);
    SPELLING_TOAST_TIMER = setTimeout(function () {
      if (SPELLING_TOAST) SPELLING_TOAST.classList.remove('ws-toast-visible');
    }, 4200);
  }

  async function connectSpellingSourceFile() {
    if (!supportsSourceFileAccess()) {
      window.alert(L.sourceUnsupported || 'This browser does not allow direct source-file editing from the page.');
      return;
    }
    var handles = await window.showOpenFilePicker({
      multiple: false,
      types: [{
        description: 'Quarto document',
        accept: { 'text/markdown': ['.qmd'] },
      }],
      excludeAcceptAllOption: true,
    });
    var handle = handles && handles[0] || null;
    if (!handle) return;
    var file = await handle.getFile();
    var content = await file.text();
    validateSpellingSourceFile(handle.name || file.name, content);
    SPELLING_SOURCE_HANDLE = handle;
    SPELLING_SOURCE_NAME = SPELLING_SOURCE_HANDLE.name || file.name || '';
    setSpellingSourceButtonState();
  }

  function initSpellingSourceControls(box) {
    if (!SPELLCHECK_ENABLED || !box) return;
    // The "connect source" button relies on the File System Access API
    // (window.showOpenFilePicker), available only in Chromium-based browsers.
    // On Firefox/Safari, omit the control entirely rather than show a disabled,
    // broken-looking button.
    if (!supportsSourceFileAccess()) return;
    SPELLING_SOURCE_BUTTON = makeControlButton(L.sourceConnectBtn || 'connect source', L.sourceConnectTitle || 'Connect source .qmd');
    SPELLING_SOURCE_BUTTON.classList.add('ws-source-file-btn');
    SPELLING_SOURCE_BUTTON.addEventListener('click', function () {
      connectSpellingSourceFile().catch(function (err) {
        console.warn('[scientific-writing] source connect failed', err);
        showSpellingToast(err && err.message ? err.message : String(err), 'warn');
      });
    });
    setSpellingSourceButtonState();
    box.appendChild(SPELLING_SOURCE_BUTTON);
  }

  function hideSpellingTooltip() {
    if (SPELLING_TOOLTIP && SPELLING_TOOLTIP.parentNode) SPELLING_TOOLTIP.parentNode.removeChild(SPELLING_TOOLTIP);
    SPELLING_TOOLTIP = null;
    SPELLING_TOOLTIP_TARGET = null;
  }

  function showSpellingTooltip(target) {
    hideSpellingTooltip();
    SPELLING_TOOLTIP_TARGET = target;

    var word = target.dataset.wsSpellingWord || target.textContent || '';
    var replacements = [];
    try { replacements = JSON.parse(target.dataset.wsSpellingReplacements || '[]'); } catch (e) {}

    var tip = document.createElement('div');
    tip.className = 'ws-spelling-tip';

    var title = document.createElement('div');
    title.className = 'ws-spelling-tip-title';
    title.textContent = L.spellingIssue || 'Possible spelling issue';
    tip.appendChild(title);

    var original = document.createElement('div');
    original.className = 'ws-spelling-tip-word';
    original.textContent = word;
    tip.appendChild(original);

    var list = document.createElement('div');
    list.className = 'ws-spelling-tip-actions';
    if (replacements.length) {
      replacements.forEach(function (replacement) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ws-spelling-suggestion';
        btn.textContent = replacement;
        btn.addEventListener('click', function () {
          applySpellingSuggestion(target, replacement, tip).catch(function (err) {
            setSpellingTipStatus(tip, err && err.message ? err.message : String(err), true);
          });
        });
        list.appendChild(btn);
      });
    } else {
      var empty = document.createElement('span');
      empty.className = 'ws-spelling-tip-empty';
      empty.textContent = L.noSpellingSuggestions || 'No suggestions';
      list.appendChild(empty);
    }
    tip.appendChild(list);

    var status = document.createElement('div');
    status.className = 'ws-spelling-tip-status';
    status.textContent = SPELLING_SOURCE_HANDLE
      ? ((L.sourceReady || 'Source ready') + ': ' + SPELLING_SOURCE_NAME)
      : (L.sourceNotConnected || 'Connect the .qmd source to apply fixes.');
    tip.appendChild(status);

    var footer = document.createElement('div');
    footer.className = 'ws-spelling-tip-footer';
    var ignore = document.createElement('button');
    ignore.type = 'button';
    ignore.className = 'ws-spelling-tip-secondary';
    ignore.textContent = L.ignoreSpellingBtn || 'ignore';
    ignore.addEventListener('click', function () {
      target.classList.add('ws-spelling-ignored');
      target.classList.remove('ws-spelling');
      hideSpellingTooltip();
    });
    var ignoreSource = document.createElement('button');
    ignoreSource.type = 'button';
    ignoreSource.className = 'ws-spelling-tip-secondary';
    ignoreSource.textContent = L.ignoreSpellingSourceBtn || 'ignore in source';
    ignoreSource.addEventListener('click', function () {
      addSpellingIgnoreToSource(target, tip).catch(function (err) {
        setSpellingTipStatus(tip, err && err.message ? err.message : String(err), true);
      });
    });
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'ws-spelling-tip-secondary';
    close.textContent = L.closeBtn || 'close';
    close.addEventListener('click', hideSpellingTooltip);
    footer.appendChild(ignore);
    footer.appendChild(ignoreSource);
    footer.appendChild(close);
    tip.appendChild(footer);

    document.body.appendChild(tip);
    SPELLING_TOOLTIP = tip;

    var rect = target.getBoundingClientRect();
    var scrollY = window.scrollY || document.documentElement.scrollTop;
    var scrollX = window.scrollX || document.documentElement.scrollLeft;
    var left = Math.min(scrollX + rect.left, scrollX + window.innerWidth - 310);
    var top = scrollY + rect.bottom + 8;
    tip.style.left = Math.max(12, left) + 'px';
    tip.style.top = top + 'px';
  }

  function setSpellingTipStatus(tip, message, error) {
    var status = tip && tip.querySelector('.ws-spelling-tip-status');
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('ws-spelling-tip-error', !!error);
  }

  function findSourceReplacement(content, wrong, replacement, before, after) {
    var positions = [];
    var from = 0;
    while (from < content.length) {
      var idx = content.indexOf(wrong, from);
      if (idx === -1) break;
      positions.push(idx);
      from = idx + Math.max(1, wrong.length);
    }
    if (!positions.length) throw new Error(L.sourceWordMissing || 'Word not found in source file.');

    var beforeNeedle = normalizeSourceContext(before).slice(-28);
    var afterNeedle = normalizeSourceContext(after).slice(0, 28);
    var matches = positions.filter(function (idx) {
      var windowStart = Math.max(0, idx - 140);
      var windowEnd = Math.min(content.length, idx + wrong.length + 140);
      var ctx = normalizeSourceContext(content.slice(windowStart, windowEnd));
      return (!beforeNeedle || ctx.indexOf(beforeNeedle) !== -1) &&
        (!afterNeedle || ctx.indexOf(afterNeedle) !== -1);
    });

    if (matches.length === 0 && positions.length === 1) matches = positions;
    if (matches.length !== 1) throw new Error(L.sourceAmbiguous || 'Ambiguous source match. No change was made.');

    var idx = matches[0];
    return content.slice(0, idx) + replacement + content.slice(idx + wrong.length);
  }

  function frontMatterBounds(content) {
    var text = String(content || '');
    if (text.slice(0, 3) !== '---') return null;
    var end = text.indexOf('\n---', 3);
    if (end === -1) return null;
    var closeEnd = end + 4;
    if (text.charAt(closeEnd) === '\r') closeEnd++;
    if (text.charAt(closeEnd) === '\n') closeEnd++;
    return { bodyStart: 4, closeStart: end + 1, closeEnd: closeEnd };
  }

  function yamlScalarValue(line) {
    var raw = String(line || '').replace(/^\s*-\s*/, '').trim();
    if ((raw.charAt(0) === '"' && raw.charAt(raw.length - 1) === '"') ||
        (raw.charAt(0) === "'" && raw.charAt(raw.length - 1) === "'")) {
      raw = raw.slice(1, -1);
    }
    return raw;
  }

  function yamlQuoteWord(word) {
    var w = String(word || '').trim();
    if (/^[A-Za-z0-9_ .-]+$/.test(w)) return w;
    return '"' + w.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }

  function addIgnoreTermToYaml(content, word) {
    var term = String(word || '').trim();
    if (!term) throw new Error(L.sourceNoChange || 'No source change was needed.');
    var bounds = frontMatterBounds(content);
    if (!bounds) throw new Error(L.sourceYamlMissing || 'YAML front matter not found.');

    var before = content.slice(0, bounds.bodyStart);
    var yaml = content.slice(bounds.bodyStart, bounds.closeStart);
    var after = content.slice(bounds.closeStart);
    var lines = yaml.split(/\n/);
    var sciIdx = -1;
    var sciIndent = 0;
    var sciEnd = lines.length;
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(/^(\s*)scientific-writing:\s*$/);
      if (m) {
        sciIdx = i;
        sciIndent = m[1].length;
        break;
      }
    }
    if (sciIdx === -1) throw new Error(L.sourceScientificWritingMissing || 'scientific-writing YAML block not found.');

    for (var j = sciIdx + 1; j < lines.length; j++) {
      if (/^\s*$/.test(lines[j])) continue;
      var indent = (lines[j].match(/^(\s*)/) || ['',''])[1].length;
      if (indent <= sciIndent && !/^\s*-/.test(lines[j])) {
        sciEnd = j;
        break;
      }
    }

    var keyIdx = -1;
    var keyIndent = sciIndent + 2;
    for (var k = sciIdx + 1; k < sciEnd; k++) {
      var km = lines[k].match(/^(\s*)spellcheck-ignore-terms:\s*(.*)$/);
      if (km) {
        keyIdx = k;
        keyIndent = km[1].length;
        break;
      }
    }

    var lower = term.toLowerCase();
    if (keyIdx !== -1) {
      var listEnd = keyIdx + 1;
      while (listEnd < sciEnd) {
        if (/^\s*$/.test(lines[listEnd])) {
          listEnd++;
          continue;
        }
        var indent2 = (lines[listEnd].match(/^(\s*)/) || ['',''])[1].length;
        if (indent2 <= keyIndent && !/^\s*-/.test(lines[listEnd])) break;
        if (lines[listEnd].match(/^\s*-\s*/)) {
          var existing = yamlScalarValue(lines[listEnd]);
          if (existing.toLowerCase() === lower) return content;
        }
        listEnd++;
      }
      lines.splice(listEnd, 0, Array(keyIndent + 3).join(' ') + '- ' + yamlQuoteWord(term));
      return before + lines.join('\n') + after;
    }

    var insertAt = sciIdx + 1;
    while (insertAt < sciEnd && /^\s*$/.test(lines[insertAt])) insertAt++;
    var pad = Array(keyIndent + 1).join(' ');
    lines.splice(insertAt, 0, pad + 'spellcheck-ignore-terms:', pad + '  - ' + yamlQuoteWord(term));
    return before + lines.join('\n') + after;
  }

  async function addSpellingIgnoreToSource(target, tip) {
    if (!SPELLING_SOURCE_HANDLE) {
      setSpellingTipStatus(tip, L.sourceNotConnected || 'Connect the .qmd source to apply fixes.');
      await connectSpellingSourceFile().catch(function (err) {
        var msg = err && err.message ? err.message : String(err);
        setSpellingTipStatus(tip, msg, true);
        showSpellingToast(msg, 'warn');
        throw err;
      });
      if (!SPELLING_SOURCE_HANDLE) {
        throw new Error(L.sourceNotConnected || 'Connect the .qmd source to apply fixes.');
      }
    }

    var word = target.dataset.wsSpellingWord || target.textContent || '';
    setSpellingTipStatus(tip, L.sourceAddingIgnore || 'Adding to ignore list...');
    var file = await SPELLING_SOURCE_HANDLE.getFile();
    var content = await file.text();
    var next = addIgnoreTermToYaml(content, word);
    if (next === content) {
      target.classList.add('ws-spelling-ignored');
      setSpellingTipStatus(tip, L.sourceIgnoreAlreadyExists || 'Already in spellcheck-ignore-terms.');
      return;
    }

    var writable = await SPELLING_SOURCE_HANDLE.createWritable();
    await writable.write(next);
    await writable.close();

    target.classList.add('ws-spelling-ignored');
    target.classList.remove('ws-spelling');
    SPELLCHECK_IGNORE_TERMS.add(normalizeWord(word));
    setSpellingTipStatus(tip, L.sourceIgnoreAdded || 'Added to spellcheck-ignore-terms. Render again to refresh the HTML.');
  }

  async function applySpellingSuggestion(target, replacement, tip) {
    if (!SPELLING_SOURCE_HANDLE) {
      setSpellingTipStatus(tip, L.sourceNotConnected || 'Connect the .qmd source to apply fixes.');
      await connectSpellingSourceFile().catch(function (err) {
        var msg = err && err.message ? err.message : String(err);
        setSpellingTipStatus(tip, msg, true);
        showSpellingToast(msg, 'warn');
        throw err;
      });
      if (!SPELLING_SOURCE_HANDLE) {
        throw new Error(L.sourceNotConnected || 'Connect the .qmd source to apply fixes.');
      }
    }
    var wrong = target.dataset.wsSpellingWord || target.textContent || '';
    if (!wrong || !replacement || wrong === replacement) return;

    setSpellingTipStatus(tip, L.sourceApplying || 'Applying to source...');
    var file = await SPELLING_SOURCE_HANDLE.getFile();
    var content = await file.text();
    var next = findSourceReplacement(
      content,
      wrong,
      replacement,
      target.dataset.wsSpellingBefore || '',
      target.dataset.wsSpellingAfter || ''
    );
    if (next === content) throw new Error(L.sourceNoChange || 'No source change was needed.');

    var writable = await SPELLING_SOURCE_HANDLE.createWritable();
    await writable.write(next);
    await writable.close();

    target.textContent = replacement;
    target.classList.add('ws-spelling-fixed');
    target.classList.remove('ws-spelling');
    setSpellingTipStatus(tip, L.sourceApplied || 'Applied to source. Render again to refresh the HTML.');
  }

  function ensureSpellingTooltipWired() {
    if (document.body.dataset.wsSpellingTooltipWired === 'true') return;
    document.body.dataset.wsSpellingTooltipWired = 'true';
    document.addEventListener('click', function (ev) {
      var target = ev.target && ev.target.closest ? ev.target.closest('.ws-spelling') : null;
      if (target) {
        ev.preventDefault();
        ev.stopPropagation();
        showSpellingTooltip(target);
        return;
      }
      if (SPELLING_TOOLTIP && ev.target && !ev.target.closest('.ws-spelling-tip')) hideSpellingTooltip();
    }, true);
  }

// src/ui/evidence.js — Variable usage and numeric evidence highlighting.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

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
          var paramNames = getParamName(m[0]);
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
        var paramNames = rng[3];
        var isCit = rng[2];
        if (paramNames) {
          span.className = 'ws-evidence-parameterized';
          markReason(span, 'evidence-parameterized', paramNames[0]);
        } else if (isCit) {
          span.className = 'ws-evidence';
          markReason(span, 'evidence', L.evidence);
        } else {
          span.className = 'ws-evidence-hardcoded';
          markReason(span, 'evidence-hardcoded',
            VARIABLE_COUNT > 0 ? L.evidenceHardcoded + ' | ' + L.evidenceUnparameterized : L.evidenceHardcoded);
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

// src/ui/nlp-highlights.js — NLP-specific paragraph highlighting helpers.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

  function highlightNlpNominalLoad(p) {
    var title = L.nlpNominalLoad;
    var marked = p.innerHTML.replace(
      /([.!?]+\s+)(?=[A-ZÁÉÍÓÚÀÂÊÔÃÕÜÇÑ"])/g,
      '$1\x00'
    );
    p.innerHTML = marked.split('\x00').map(function (part) {
      var plain = part.replace(/<[^>]+>/g, ' ');
      return sentenceNominalLoad(plain)
        ? '<span class="ws-nlp-nominal-load" data-ws-focus="nlp-nominal-load" data-ws-reason="' + escapeHTML(title) + '" title="' + escapeHTML(title) + '">' + part + '</span>'
        : part;
    }).join('');
  }

  function highlightNlpWeakVerbs(p) {
    var terms = getWeakVerbTerms().map(function (term) {
      return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    });
    if (!terms.length) return;
    var alpha = LANG === 'en' ? 'A-Za-z' : 'A-Za-zÀ-ÿ';
    try {
      highlightRegexInNode(p, new RegExp('(?<![' + alpha + '])(?:' + terms.join('|') + ')(?![' + alpha + '])', 'gi'), 'ws-nlp-weak-verb', L.nlpWeakVerbs);
    } catch (e) {
      highlightRegexInNode(p, new RegExp('\\b(?:' + terms.join('|') + ')\\b', 'gi'), 'ws-nlp-weak-verb', L.nlpWeakVerbs);
    }
  }

  function highlightNlpNounStacks(p) {
    if (LANG !== 'en') return;
    if (WINK_NLP) {
      var nlpStats = analyzeWinkNlp(p.innerText || p.textContent || '');
      if (nlpStats.posNounStacks && nlpStats.posNounStacks.length) {
        highlightTermListInNode(p, nlpStats.posNounStacks, 'ws-nlp-noun-stack', L.nlpNounStacks);
        return;
      }
    }
    highlightRegexInNode(p, /\b(?:[A-Za-z]{4,}\s+){2,}[A-Za-z]{4,}\b/g, 'ws-nlp-noun-stack', L.nlpNounStacks);
  }

  function highlightNlpTopics(p, nlpStats) {
    var terms = (nlpStats && nlpStats.topics && nlpStats.topics.length)
      ? nlpStats.topics
      : (nlpStats && nlpStats.keyTerms || []).map(function (term) {
          return { text: String(term).split(/\s+\xd7/)[0], count: 1 };
        });
    highlightTermListInNode(p, terms, 'ws-nlp-topic', L.nlpTopics);
  }

  function highlightNlpEntities(p, nlpStats) {
    if (!nlpStats) return;
    highlightTermListInNode(
      p,
      (nlpStats.people || []).concat(nlpStats.organizations || [], nlpStats.places || []),
      'ws-nlp-entity',
      L.nlpEntities
    );
  }

  function highlightNlpValuesDates(p, nlpStats) {
    if (!nlpStats) return;
    highlightTermListInNode(
      p,
      (nlpStats.values || []).concat(nlpStats.dates || []),
      'ws-nlp-value-date',
      L.nlpValuesDates
    );
  }

  function highlightNlpAdverbs(p, nlpStats) {
    if (!nlpStats || !nlpStats.adverbs || !nlpStats.adverbs.length) return;
    highlightTermListInNode(p, nlpStats.adverbs, 'ws-nlp-adverb', L.nlpAdverbs);
  }

// src/ui/wink-highlights.js — wink-nlp-backed highlight helpers.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

  function highlightWinkPassiveSentences(p) {
    if (!WINK_NLP || LANG !== 'en') return;
    var title = L.nlpWinkPassive;
    var marked = p.innerHTML.replace(
      /([.!?]+\s+)(?=[A-ZÁÉÍÓÚÀÂÊÔÃÕÜÇÑ"])/g,
      '$1\x00'
    );
    p.innerHTML = marked.split('\x00').map(function (part) {
      var plain = part.replace(/<[^>]+>/g, ' ').trim();
      return plain && isWinkPassiveSentence(plain)
        ? '<span class="ws-wink-passive" data-ws-focus="wink-passive" data-ws-reason="' + escapeHTML(title) + '" title="' + escapeHTML(title) + '">' + part + '</span>'
        : part;
    }).join('');
  }

  function highlightWinkComplexWords(p, nlpStats) {
    if (!nlpStats || !nlpStats.winkComplexWords || !nlpStats.winkComplexWords.length) return;
    highlightTermListInNode(p, nlpStats.winkComplexWords, 'ws-wink-complex', L.nlpWinkComplexWords);
  }

  function highlightWinkModalVerbs(p, nlpStats) {
    var terms = (nlpStats && nlpStats.winkModalTerms) || [];
    var list = terms
      .map(function (item) { return normalizeWord(item.text || item); })
      .filter(Boolean)
      .sort(function (a, b) { return b.length - a.length; });
    if (!list.length) return;
    var escaped = list.map(function (term) {
      return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    });
    highlightRegexInNode(p, new RegExp('\\b(?:' + escaped.join('|') + ')\\b', 'gi'), 'ws-wink-modal', L.nlpWinkModalVerbs);
  }

  function highlightWinkPronouns(p, nlpStats) {
    var terms = (nlpStats && nlpStats.winkPronounTerms) || [];
    var list = terms
      .map(function (item) { return normalizeWord(item.text || item); })
      .filter(Boolean)
      .sort(function (a, b) { return b.length - a.length; });
    if (!list.length) return;
    var escaped = list.map(function (term) {
      return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    });
    highlightRegexInNode(p, new RegExp('\\b(?:' + escaped.join('|') + ')\\b', 'gi'), 'ws-wink-pronoun', L.nlpWinkPronouns);
  }

  function highlightWinkAuxiliaries(p, nlpStats) {
    var terms = (nlpStats && nlpStats.winkAuxiliaryTerms) || [];
    var list = terms
      .map(function (item) { return normalizeWord(item.text || item); })
      .filter(Boolean)
      .sort(function (a, b) { return b.length - a.length; });
    if (!list.length) return;
    var escaped = list.map(function (term) {
      return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    });
    highlightRegexInNode(p, new RegExp('\\b(?:' + escaped.join('|') + ')\\b', 'gi'), 'ws-wink-auxiliary', L.nlpWinkAuxiliaries);
  }

  function highlightWinkNumericTokens(p, nlpStats) {
    var terms = (nlpStats && nlpStats.winkNumericTerms) || [];
    var list = terms
      .map(function (item) { return normalizeWord(item.text || item); })
      .filter(Boolean)
      .sort(function (a, b) { return b.length - a.length; });
    if (list.length) {
      var escaped = list.map(function (term) {
        return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      });
      highlightRegexInNode(p, new RegExp('\\b(?:' + escaped.join('|') + ')\\b', 'gi'), 'ws-wink-numeric', L.nlpWinkNumericDensity);
      return;
    }
    highlightRegexInNode(p, /\b\d+(?:[.,]\d+)?\b/g, 'ws-wink-numeric', L.nlpWinkNumericDensity);
  }

  function highlightWinkProperNouns(p, nlpStats) {
    var terms = (nlpStats && nlpStats.winkProperNounTerms) || [];
    var list = terms
      .map(function (item) { return normalizeWord(item.text || item); })
      .filter(Boolean)
      .sort(function (a, b) { return b.length - a.length; });
    if (!list.length) return;
    var escaped = list.map(function (term) {
      return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    });
    highlightRegexInNode(p, new RegExp('\\b(?:' + escaped.join('|') + ')\\b', 'gi'), 'ws-wink-propn', L.nlpWinkProperNouns);
  }

// src/ui/cards.js — Margin note card construction.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

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

    // Long sentence alert (with hover-to-highlight)
    if (stats.maxSentLen > SENT_LONG) {
      var sentEl = document.createElement('div');
      sentEl.className = 'ws-sent-alert';
      sentEl.textContent = L.longSent + ': ' + stats.maxSentLen + L.wSuffix;
      addHoverHighlight(sentEl, note, '.ws-long-sentence', 'ws-long-sentence-active');
      note.appendChild(sentEl);
    }

    // Passive voice (with hover-to-highlight)
    if (stats.passiveCount > 0) {
      var passEl = document.createElement('div');
      passEl.className = 'ws-passive-count';
      passEl.textContent = L.passive + ': ' + stats.passiveCount;
      addHoverHighlight(passEl, note, '.ws-passive, .ws-wink-passive', 'ws-passive-active');
      note.appendChild(passEl);
    }

    // Wordy phrases
    if ((stats.wordyCount || 0) > 0) {
      var wordyEl = document.createElement('div');
      wordyEl.className = 'ws-wordy-count';
      wordyEl.textContent = L.wordyPhrases + ': ' + stats.wordyCount;
      addHoverHighlight(wordyEl, note, '.ws-wordy', 'ws-wordy-active');
      note.appendChild(wordyEl);
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

// src/ui/rhythm.js — Per-section stats/rhythm UI.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

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

// src/ui/summary.js — Document summary card and issue guidance.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

  function buildDocSummaryCard(opts) {
    var pt = LANG === 'pt';
    var sentMean = opts.sentLengths.length ? mean(opts.sentLengths) : 0;
    var sentCv   = sentMean > 0 ? opts.sentStd / sentMean : 0;
    var maxParaLen = opts.paraLengths && opts.paraLengths.length ? Math.max.apply(null, opts.paraLengths) : 0;

    function D(lines) {
      return '<span class="ws-sum-detail">' + lines.join('<br>') + '</span>';
    }
    function em(s) { return '<em>' + s + '</em>'; }
    function topList(items, limit, formatter) {
      if (!items || !items.length) return '';
      return items.slice(0, limit || 4).map(formatter || function (x) {
        return typeof x === 'string' ? x : (x.text ? x.text + (x.count ? ' ×' + x.count : '') : String(x));
      }).join(', ');
    }
    function connectorTotal(byCat) {
      byCat = byCat || {};
      return (byCat.add || 0) + (byCat.contrast || 0) + (byCat.cause || 0) + (byCat.conclusion || 0) + (byCat.time || 0);
    }
    function rhythmLabel(cv) {
      if (cv < 0.30) return pt ? 'cadência muito regular' : 'very regular cadence';
      if (cv <= 0.55) return pt ? 'cadência variada e controlada' : 'varied, controlled cadence';
      return pt ? 'cadência bastante irregular' : 'markedly uneven cadence';
    }
    function sectionCadenceLabel(cv) {
      if (cv < 0.25) return pt ? 'distribuição bem uniforme' : 'very even distribution';
      if (cv < 0.35) return pt ? 'distribuição relativamente equilibrada' : 'relatively balanced distribution';
      if (cv < 0.55) return pt ? 'distribuição desigual entre seções' : 'uneven section distribution';
      return pt ? 'distribuição fortemente concentrada' : 'strongly concentrated distribution';
    }
    function buildTextProfile() {
      var sections = opts.sections || [];
      var paraMean = opts.paraLengths && opts.paraLengths.length ? mean(opts.paraLengths) : 0;
      var minutes = Math.max(1, Math.round((opts.totalWords || 0) / READ_WPM));

      function ind(v, wThresh, aThresh) {
        return v >= aThresh ? ' ws-profile-alert' : v >= wThresh ? ' ws-profile-warn' : '';
      }
      function indLow(v, wThresh, aThresh) {
        return v <= aThresh ? ' ws-profile-alert' : v <= wThresh ? ' ws-profile-warn' : '';
      }
      function pval(text, cls) {
        return '<span class="ws-profile-val' + (cls || '') + '">' + escapeHTML(String(text)) + '</span>';
      }
      function row(label, vals) {
        return '<div class="ws-profile-row">' +
          '<span class="ws-profile-label">' + escapeHTML(label) + '</span>' +
          '<span class="ws-profile-vals">' + vals + '</span>' +
          '</div>';
      }
      function fleschLabel(f) {
        if (f == null) return '';
        if (f >= 70) return pt ? ' — fácil' : ' — easy';
        if (f >= 60) return pt ? ' — relativamente fácil' : ' — fairly easy';
        if (f >= 50) return pt ? ' — padrão' : ' — standard';
        if (f >= 30) return pt ? ' — difícil' : ' — difficult';
        return pt ? ' — muito difícil' : ' — very difficult';
      }

      var DOT = ' \xb7 ';
      var readability = opts.readability || {};
      var fleschVal = typeof readability.flesch === 'number' ? readability.flesch : null;
      var fleschCls = fleschVal != null ? indLow(fleschVal, 50, 30) : '';
      var cvCls = sentCv >= 0.55 ? ' ws-profile-alert' : sentCv < 0.30 ? ' ws-profile-warn' : '';
      var longRateCls = ind(opts.longSentenceRate || 0, 6, 20);
      var lexCls = indLow(opts.lexDiv || 0, 55, 40);
      var passiveCls = ind(opts.passiveTotal || 0, 20, 40);
      var passiveDensity = opts.totalWords ? round1((opts.passiveTotal || 0) / opts.totalWords * 1000) : 0;
      var sectionCv = (opts.sectionBalance && opts.sectionBalance.cv) || 0;
      var sectionCvCls = ind(sectionCv, 0.35, 0.55);
      var byCat = opts.connectorByCat || {};
      var catCount = ['add', 'contrast', 'cause', 'conclusion', 'time'].filter(function (c) { return (byCat[c] || 0) > 0; }).length;
      var catCls = catCount <= 1 ? ' ws-profile-warn' : '';
      var unusedRefCount = (opts.referencesDefined > 0 && opts.referencesUsed < opts.referencesDefined)
        ? opts.referencesDefined - opts.referencesUsed : 0;
      var refCls = unusedRefCount > 0 ? ' ws-profile-warn' : '';
      var figRefd = opts.figureCrossRefs != null ? opts.figureCrossRefs : null;
      var figCls = (figRefd != null && figRefd < (opts.figuresTotal || 0)) ? ' ws-profile-warn' : '';

      var rows =
        row(pt ? 'Documento' : 'Document',
          pval((opts.totalWords || 0).toLocaleString() + (pt ? 'p' : 'w')) +
          DOT + pval(sections.length + (pt ? ' seções' : ' sections')) +
          DOT + '~' + pval(minutes + ' min read')) +
        row(pt ? 'Frases' : 'Sentences',
          (pt ? 'méd ' : 'avg ') + pval(round1(sentMean) + (pt ? 'p' : 'w')) +
          DOT + 'max ' + pval((opts.maxSentLen || 0) + (pt ? 'p' : 'w')) +
          DOT + 'CV ' + pval(round1(sentCv) + ' — ' + rhythmLabel(sentCv), cvCls) +
          DOT + pval(round1(opts.longSentenceRate || 0) + '% long', longRateCls)) +
        row(pt ? 'Parágrafos' : 'Paragraphs',
          (pt ? 'méd ' : 'avg ') + pval(round1(paraMean) + (pt ? 'p' : 'w')) +
          DOT + 'max ' + pval(maxParaLen + (pt ? 'p' : 'w'), maxParaLen > PARA_LONG ? ' ws-profile-warn' : '') +
          ((opts.longParagraphCount || 0) > 0 ? DOT + pval(opts.longParagraphCount + (pt ? ' longos' : ' long'), ' ws-profile-warn') : '') +
          DOT + (pt ? 'seções CV ' : 'sections CV ') + pval(round1(sectionCv) + ' — ' + sectionCadenceLabel(sectionCv), sectionCvCls)) +
        row(pt ? 'Legibilidade' : 'Readability',
          'Flesch ' + pval((fleschVal != null ? fleschVal : '—') + fleschLabel(fleschVal), fleschCls) +
          DOT + 'Grade ' + pval(readability.grade != null ? readability.grade : '—') +
          DOT + 'Fog ' + pval(readability.fog != null ? readability.fog : '—')) +
        row('Style',
          (pt ? 'div ' : 'div ') + pval((opts.lexDiv || 0) + '%', lexCls) +
          DOT + pval((opts.passiveTotal || 0) + ' passive (' + passiveDensity + '‰)', passiveCls) +
          DOT + pval((opts.hedgeCount || 0) + (pt ? ' aten' : ' hedges')) +
          DOT + pval((opts.connectorCount || 0) + ' connectors · ' + catCount + '/5 cat', catCls)) +
        row(pt ? 'Evidências' : 'Evidence',
          pval((opts.citationsTotal || 0) + (pt ? ' cit' : ' citations')) +
          DOT + pval((opts.referencesUsed || 0) + '/' + (opts.referencesDefined || 0) + ' refs' +
            (unusedRefCount > 0 ? ' (' + unusedRefCount + (pt ? ' não usadas' : ' unused') + ')' : ''), refCls) +
          (figRefd != null
            ? DOT + pval(figRefd + '/' + (opts.figuresTotal || 0) + (pt ? ' figs ref.' : ' figs cross-ref\'d'), figCls)
            : DOT + pval((opts.figuresTotal || 0) + ' figs')) +
          DOT + pval((opts.tablesTotal || 0) + (pt ? ' tab' : ' tables')));

      var sectionWords = sections.map(function (s) {
        var title = s.title || (pt ? 'Seção' : 'Section');
        var share = opts.totalWords ? Math.round(((s.words || 0) / opts.totalWords) * 100) : 0;
        return '<span class="ws-sum-section-pill">' +
          '<strong>' + escapeHTML(title) + '</strong> ' +
          escapeHTML(String(s.words || 0)) + (pt ? 'p' : 'w') +
          ' \xb7 ' + escapeHTML(String(share)) + '%' +
          (s.sentences ? ' \xb7 ' + escapeHTML(String(s.sentences)) + (pt ? 'fr' : 's') : '') +
          (s.avgSentence ? ' \xb7 ' + escapeHTML(round1(s.avgSentence) + (pt ? 'p/fr' : 'w/s')) : '') +
        '</span>';
      }).join('');

      return '<div class="ws-sum-profile">' +
        '<div class="ws-sum-section-label ws-sum-section-profile">' + (pt ? 'Perfil do texto' : 'Text profile') + '</div>' +
        '<div class="ws-profile-grid">' + rows + '</div>' +
        (sectionWords ? '<div class="ws-sum-section-words">' + sectionWords + '</div>' : '') +
      '</div>';
    }

    var issues = [];

    // Frases longas
    if (opts.longSentenceRate >= 6) {
      issues.push({ level: opts.longSentenceRate >= 20 ? 'alert' : 'warn',
        text: pt
          ? round1(opts.longSentenceRate) + '% das frases superam ' + SENT_LONG + ' palavras (max detectado: ' + opts.maxSentLen + 'p)'
          : round1(opts.longSentenceRate) + '% of sentences exceed ' + SENT_LONG + ' words (longest detected: ' + opts.maxSentLen + 'w)',
        detail: pt
          ? D(['· divida em conjunções coordenativas: ' + em('e, mas, pois, portanto, porém'),
               '· elimine orações relativas encadeadas: ' + em('"…que foi então submetido…" → frase separada'),
               '· nominalizações inflam frases — prefira verbos: ' + em('"a análise foi realizada" → "analisamos"'),
               '· meta: 15–25 palavras por frase para máxima legibilidade'])
          : D(['· split at coordinating conjunctions: ' + em('and, but, so, yet, therefore'),
               '· break stacked relative clauses: ' + em('"…which was then submitted…" → separate sentence'),
               '· nominalizations inflate length — prefer verbs: ' + em('"an analysis was performed" → "we analyzed"'),
               '· target: 15–25 words per sentence for best readability']) });
    }

    // Complexidade sintática
    if (opts.complexSentenceRate >= 12 || opts.complexSentenceCount > 8) {
      issues.push({ level: opts.complexSentenceRate >= 28 ? 'alert' : 'warn',
        text: pt
          ? opts.complexSentenceCount + (opts.complexSentenceCount === 1 ? ' frase complexa detectada' : ' frases complexas detectadas') + ' (' + round1(opts.complexSentenceRate || 0) + '%)'
          : opts.complexSentenceCount + (opts.complexSentenceCount === 1 ? ' complex sentence detected' : ' complex sentences detected') + ' (' + round1(opts.complexSentenceRate || 0) + '%)',
        detail: pt
          ? D(['· procure cadeias com "que", "quando", "embora", "enquanto" e múltiplas vírgulas',
               '· separe condição, método e resultado em frases distintas',
               '· mantenha uma oração principal clara antes de qualificadores longos',
               '· use o card "frases complexas" para destacar os trechos'])
          : D(['· look for chains with "which", "that", "although", "whereas" and multiple commas',
               '· separate condition, method, and result into distinct sentences',
               '· keep a clear main clause before long qualifiers',
               '· use the complex-sentence card to highlight passages']) });
    }

    // Frases sem verbo principal claro
    if (opts.noVerbCount > 0) {
      issues.push({ level: opts.noVerbCount > 4 ? 'alert' : 'warn',
        text: pt
          ? opts.noVerbCount + (opts.noVerbCount === 1 ? ' frase sem' : ' frases sem') + ' verbo principal claro'
          : opts.noVerbCount + (opts.noVerbCount === 1 ? ' sentence has' : ' sentences have') + ' no clear main verb',
        detail: pt
          ? D(['· verifique fragmentos em legendas, listas e frases iniciadas por abreviações',
               '· transforme rótulos em afirmações completas quando estiverem no corpo do texto',
               '· garanta sujeito + verbo + complemento em resultados e conclusões'])
          : D(['· check fragments in captions, lists, and abbreviation-led sentences',
               '· turn labels into full claims when they appear in body prose',
               '· ensure subject + verb + complement in Results and Conclusions']) });
    }

    // Legibilidade global
    if (opts.readability && (opts.readability.flesch < 45 || opts.readability.grade > 16 || opts.readability.fog > 18)) {
      var readAlert = opts.readability.flesch < 30 || opts.readability.grade > 20 || opts.readability.fog > 22;
      issues.push({ level: readAlert ? 'alert' : 'warn',
        text: pt
          ? 'Legibilidade difícil: Flesch ' + opts.readability.flesch + ', grade ' + opts.readability.grade + ', fog ' + opts.readability.fog
          : 'Difficult readability: Flesch ' + opts.readability.flesch + ', grade ' + opts.readability.grade + ', fog ' + opts.readability.fog,
        detail: pt
          ? D(['· priorize frases longas, palavras complexas e nominalizações',
               '· artigos científicos aceitam densidade, mas valores extremos atrasam revisão',
               '· reduza uma ideia secundária por frase antes de trocar terminologia técnica'])
          : D(['· prioritize long sentences, complex words, and nominalizations',
               '· scientific articles tolerate density, but extreme scores slow review',
               '· remove one secondary idea per sentence before changing technical terms']) });
    }

    // Ritmo irregular
    if (sentCv > 0.55) {
      issues.push({ level: 'warn',
        text: pt
          ? 'Variação alta no comprimento das frases (CV ' + round1(sentCv) + ') — ritmo pode ser irregular'
          : 'High sentence length variation (CV ' + round1(sentCv) + ') — rhythm may feel uneven',
        detail: pt
          ? D(['· alterne: frase curta de impacto (8–12p) seguida de análise mais longa',
               '· evite sequências de 4+ frases com comprimento parecido',
               '· frases curtas no final de parágrafo reforçam a conclusão',
               '· meta: CV entre 0.30 e 0.55'])
          : D(['· alternate: short punchy sentence (8–12w) followed by a longer analytical one',
               '· avoid runs of 4+ sentences of similar length',
               '· short sentences at paragraph end reinforce the conclusion',
               '· target: CV between 0.30 and 0.55']) });
    }

    // Parágrafos longos
    if (opts.longParagraphCount > 0) {
      issues.push({ level: opts.longParagraphCount > 2 ? 'alert' : 'warn',
        text: pt
          ? opts.longParagraphCount + (opts.longParagraphCount === 1 ? ' parágrafo excede' : ' parágrafos excedem') + ' ' + PARA_LONG + ' palavras (max: ' + maxParaLen + 'p)'
          : opts.longParagraphCount + (opts.longParagraphCount === 1 ? ' paragraph exceeds' : ' paragraphs exceed') + ' ' + PARA_LONG + ' words (max: ' + maxParaLen + 'w)',
        detail: pt
          ? D(['· a primeira frase deve enunciar o tópico; a última deve concluí-lo',
               '· divida onde houver mudança de subtópico ou evidência nova',
               '· use um conector de abertura na frase inicial do segundo parágrafo',
               '· parágrafo ideal: 3–6 frases desenvolvendo uma ideia central'])
          : D(['· first sentence states the topic; last sentence closes it',
               '· split where a new sub-topic or piece of evidence begins',
               '· open the second paragraph with a transition connector',
               '· ideal paragraph: 3–6 sentences developing one central idea']) });
    }

    // Gaps de coesão
    if (opts.cohesionGaps > 0) {
      issues.push({ level: opts.cohesionGaps > 3 ? 'alert' : 'warn',
        text: pt
          ? opts.cohesionGaps + (opts.cohesionGaps === 1 ? ' parágrafo sem' : ' parágrafos sem') + ' conector de abertura após parágrafo longo'
          : opts.cohesionGaps + (opts.cohesionGaps === 1 ? ' paragraph missing' : ' paragraphs missing') + ' an opening connector after a multi-sentence paragraph',
        detail: pt
          ? D(['· aditivo ' + em('(continua o raciocínio)') + ': ' + em('além disso, também, ademais, igualmente'),
               '· contraste ' + em('(nova perspectiva)') + ': ' + em('porém, entretanto, no entanto, todavia'),
               '· causa/efeito ' + em('(relação lógica)') + ': ' + em('portanto, assim, por isso, consequentemente'),
               '· temporal ' + em('(sequência)') + ': ' + em('em seguida, posteriormente, então, nesse momento'),
               '· conclusão ' + em('(fechamento)') + ': ' + em('em suma, dessa forma, assim sendo, diante disso')])
          : D(['· additive ' + em('(continues reasoning)') + ': ' + em('furthermore, in addition, also, moreover'),
               '· contrast ' + em('(new perspective)') + ': ' + em('however, nevertheless, yet, on the other hand'),
               '· causal ' + em('(logical link)') + ': ' + em('therefore, because, thus, consequently'),
               '· temporal ' + em('(sequence)') + ': ' + em('subsequently, then, following this, at this stage'),
               '· conclusion ' + em('(closing)') + ': ' + em('in summary, thus, overall, taken together')]) });
    }

    // Aberturas repetidas de parágrafo
    if (opts.paraOpeningRepeats && opts.paraOpeningRepeats.length > 0) {
      var paraOpenList = topList(opts.paraOpeningRepeats, 4, function (x) { return (x.word || x.start || x.text) + ' ×' + x.count; });
      issues.push({ level: opts.paraOpeningRepeats.length > 4 ? 'alert' : 'warn',
        text: pt
          ? opts.paraOpeningRepeats.length + (opts.paraOpeningRepeats.length === 1 ? ' abertura de parágrafo repetida' : ' aberturas de parágrafo repetidas')
          : opts.paraOpeningRepeats.length + (opts.paraOpeningRepeats.length === 1 ? ' repeated paragraph opening' : ' repeated paragraph openings'),
        detail: pt
          ? D((paraOpenList ? ['· exemplos: ' + em(paraOpenList)] : []).concat([
               '· varie a função da primeira frase: contexto, contraste, resultado, consequência',
               '· quando a repetição for intencional, mantenha só em blocos paralelos',
               '· conectores diferentes ajudam a explicitar a progressão lógica']))
          : D((paraOpenList ? ['· examples: ' + em(paraOpenList)] : []).concat([
               '· vary the function of first sentences: context, contrast, result, consequence',
               '· when repetition is intentional, keep it only in parallel blocks',
               '· varied connectors make the logical progression explicit'])) });
    }

    // Cobertura conceitual das seções
    if ((opts.conceptCoverageAvg > 0 && opts.conceptCoverageAvg < 70) || opts.conceptMissingTotal > 0 || (opts.conceptWeakSections || []).length > 0) {
      var weakSections = topList(opts.conceptWeakSections || [], 5);
      issues.push({ level: opts.conceptCoverageAvg < 50 || opts.conceptMissingTotal > 5 ? 'alert' : 'warn',
        text: pt
          ? 'Cobertura conceitual incompleta: ' + (opts.conceptCoverageAvg || 0) + '% média, ' + (opts.conceptMissingTotal || 0) + ' lacunas'
          : 'Incomplete concept coverage: ' + (opts.conceptCoverageAvg || 0) + '% average, ' + (opts.conceptMissingTotal || 0) + ' gaps',
        detail: pt
          ? D((weakSections ? ['· seções frágeis: ' + em(weakSections)] : []).concat([
               '· Introdução deve explicitar lacuna, objetivo e relevância',
               '· Métodos deve cobrir desenho, amostra, análise e reprodutibilidade',
               '· Resultados precisa de achados quantitativos; Discussão precisa interpretação, limitações e implicações']))
          : D((weakSections ? ['· weak sections: ' + em(weakSections)] : []).concat([
               '· Introduction should state gap, objective, and significance',
               '· Methods should cover design, sample, analysis, and reproducibility',
               '· Results need quantitative findings; Discussion needs interpretation, limitations, and implications'])) });
    }

    // Lacunas de citação (Introdução / Discussão)
    if (opts.citationGapCount > 0) {
      issues.push({ level: opts.citationGapCount > 2 ? 'alert' : 'warn',
        text: pt
          ? opts.citationGapCount + (opts.citationGapCount === 1 ? ' parágrafo da Introdução/Discussão' : ' parágrafos da Introdução/Discussão') + ' sem citação detectada'
          : opts.citationGapCount + (opts.citationGapCount === 1 ? ' Introduction/Discussion paragraph' : ' Introduction/Discussion paragraphs') + ' without a detected citation',
        detail: pt
          ? D(['· toda afirmação de contexto ou interpretação deve ser ancorada',
               '· insira com ' + em('@chave') + ' — Quarto converte automaticamente para o estilo da revista',
               '· Introdução: cite ao estabelecer gaps; Discussão: cite ao comparar achados',
               '· parágrafos sinalizados estão destacados no painel de coesão'])
          : D(['· every context claim or interpretive statement needs a literature anchor',
               '· insert with ' + em('@citationKey') + ' — Quarto renders it to the journal\'s citation style',
               '· Introduction: cite when establishing gaps; Discussion: cite when comparing findings',
               '· flagged paragraphs are highlighted in the cohesion panel']) });
    }

    // Citações em Resultados
    if (opts.resultsCitationCount > 0) {
      issues.push({ level: 'warn',
        text: pt
          ? opts.resultsCitationCount + (opts.resultsCitationCount === 1 ? ' parágrafo de Resultados' : ' parágrafos de Resultados') + ' com citação bibliográfica'
          : opts.resultsCitationCount + (opts.resultsCitationCount === 1 ? ' Results paragraph' : ' Results paragraphs') + ' contains a bibliographic citation',
        detail: pt
          ? D(['· Resultados relata dados e achados — não compara com literatura',
               '· mova a citação para a Discussão, onde ela serve de contraponto ou suporte',
               '· exceção aceitável: validação de protocolo metodológico na própria seção',
               '· se necessário, combine Results+Discussion em uma única seção'])
          : D(['· Results reports data and findings — it does not compare to prior literature',
               '· move the citation to Discussion where it serves as support or counterpoint',
               '· acceptable exception: method protocol validation within the same section',
               '· if needed, combine Results+Discussion into a single section']) });
    }

    // Variáveis não usadas
    if (opts.unusedVars && opts.unusedVars.length > 0) {
      var unusedList = opts.unusedVars.join(', ');
      issues.push({ level: 'alert',
        text: pt
          ? opts.unusedVars.length + (opts.unusedVars.length === 1 ? ' variável definida' : ' variáveis definidas') + ' em _variables.yml mas não referenciada' + (opts.unusedVars.length === 1 ? '' : 's') + ' no texto'
          : opts.unusedVars.length + (opts.unusedVars.length === 1 ? ' variable defined' : ' variables defined') + ' in _variables.yml but not referenced in text',
        detail: pt
          ? D(['· variáveis: ' + em(unusedList),
               '· referencie com ' + em('{{&lt; var nome &gt;}}') + ' no local do valor numérico',
               '· se a variável foi renomeada na análise, atualize a chave em ' + em('_variables.yml'),
               '· se não for mais necessária, remova para evitar confusão'])
          : D(['· variables: ' + em(unusedList),
               '· reference with ' + em('{{&lt; var name &gt;}}') + ' at the location of the numeric value',
               '· if the variable was renamed in the analysis, update the key in ' + em('_variables.yml'),
               '· if no longer needed, remove it to avoid confusion']) });
    }

    // Evidências não parametrizadas
    if (opts.evidenceUnparameterized > 0) {
      issues.push({ level: 'warn',
        text: pt
          ? opts.evidenceUnparameterized + (opts.evidenceUnparameterized === 1 ? ' valor numérico' : ' valores numéricos') + ' hardcoded sem variável associada'
          : opts.evidenceUnparameterized + (opts.evidenceUnparameterized === 1 ? ' hardcoded numeric value' : ' hardcoded numeric values') + ' without a variable binding',
        detail: pt
          ? D(['· defina em ' + em('_variables.yml') + ': ' + em('nome_da_variavel: 42.3'),
               '· insira no texto: ' + em('{{&lt; var nome_da_variavel &gt;}}'),
               '· se o dado mudar na análise, basta atualizar o arquivo YAML',
               '· os valores estão destacados no painel de evidências'])
          : D(['· define in ' + em('_variables.yml') + ': ' + em('variable_name: 42.3'),
               '· insert in text: ' + em('{{&lt; var variable_name &gt;}}'),
               '· if the value changes in the analysis, only the YAML file needs updating',
               '· the values are highlighted in the evidence panel']) });
    }

    // Evidências numéricas sem citação próxima
    if (opts.evidenceHardcoded > 0) {
      issues.push({ level: opts.evidenceHardcoded > 12 ? 'alert' : 'warn',
        text: pt
          ? opts.evidenceHardcoded + (opts.evidenceHardcoded === 1 ? ' evidência numérica' : ' evidências numéricas') + ' sem citação bibliográfica próxima'
          : opts.evidenceHardcoded + (opts.evidenceHardcoded === 1 ? ' numeric evidence item' : ' numeric evidence items') + ' without a nearby bibliographic citation',
        detail: pt
          ? D(['· cite a fonte de valores importados da literatura',
               '· para achados próprios, garanta que a frase deixe claro que o dado vem deste estudo',
               '· valores parametrizados resolvem atualização; citações resolvem rastreabilidade',
               '· revise o painel de Evidências antes da submissão'])
          : D(['· cite the source for values imported from literature',
               '· for original findings, make clear that the value comes from this study',
               '· parameterization solves updating; citations solve traceability',
               '· review the Evidence panel before submission']) });
    }

    // Baixa densidade de evidência
    if (opts.totalWords >= 800 && opts.evidenceDensity < 3) {
      issues.push({ level: 'warn',
        text: pt
          ? 'Baixa densidade de evidências detectáveis: ' + round1(opts.evidenceDensity || 0) + '/1000p'
          : 'Low detectable evidence density: ' + round1(opts.evidenceDensity || 0) + '/1000w',
        detail: pt
          ? D(['· verifique se afirmações centrais estão acompanhadas por números, tabelas, figuras ou citações',
               '· se o manuscrito for conceitual/qualitativo, esse alerta pode ser menos relevante',
               '· em Resultados, prefira achados quantificados a descrições genéricas'])
          : D(['· check whether central claims are supported by numbers, tables, figures, or citations',
               '· if the manuscript is conceptual/qualitative, this warning may be less relevant',
               '· in Results, prefer quantified findings over generic descriptions']) });
    }

    // Referências citadas mas não definidas
    if (opts.undefinedRefs && opts.undefinedRefs.length > 0) {
      var undefRefList = topList(opts.undefinedRefs, 5);
      issues.push({ level: 'alert',
        text: pt
          ? opts.undefinedRefs.length + (opts.undefinedRefs.length === 1 ? ' citação aponta' : ' citações apontam') + ' para chave ausente no ref.bib'
          : opts.undefinedRefs.length + (opts.undefinedRefs.length === 1 ? ' citation points' : ' citations point') + ' to a key missing from ref.bib',
        detail: pt
          ? D(['· chaves: ' + em(undefRefList),
               '· adicione as entradas ao .bib ou corrija a grafia da chave',
               '· esse problema costuma quebrar renderizações e referências finais'])
          : D(['· keys: ' + em(undefRefList),
               '· add entries to the .bib file or correct the citation key spelling',
               '· this often breaks rendering and final reference lists']) });
    }

    // Figuras/tabelas presentes mas não referenciadas
    if ((opts.figureMissing && opts.figureMissing.length) || (opts.tableMissing && opts.tableMissing.length)) {
      var missingBits = [];
      if (opts.figureMissing && opts.figureMissing.length) missingBits.push((pt ? 'figuras: ' : 'figures: ') + topList(opts.figureMissing, 4));
      if (opts.tableMissing && opts.tableMissing.length) missingBits.push((pt ? 'tabelas: ' : 'tables: ') + topList(opts.tableMissing, 4));
      issues.push({ level: 'alert',
        text: pt
          ? 'Figuras ou tabelas aparecem sem chamada no texto'
          : 'Figures or tables appear without an in-text callout',
        detail: pt
          ? D(['· ' + em(missingBits.join(' | ')),
               '· todo elemento visual deve ser citado antes ou perto de sua apresentação',
               '· use @fig-id e @tbl-id para manter a numeração automática'])
          : D(['· ' + em(missingBits.join(' | ')),
               '· every visual element should be cited before or near its appearance',
               '· use @fig-id and @tbl-id to keep numbering automatic']) });
    }

    // Order breaks de figuras
    if (opts.figureOrderIssues > 0) {
      var figExamples = opts.figureOrderExamples && opts.figureOrderExamples.length
        ? opts.figureOrderExamples.slice(0, 4).join(', ') : '';
      issues.push({ level: 'alert',
        text: pt
          ? opts.figureOrderIssues + (opts.figureOrderIssues === 1 ? ' quebra de ordem' : ' quebras de ordem') + ' nas referências de figuras'
          : opts.figureOrderIssues + (opts.figureOrderIssues === 1 ? ' figure reference' : ' figure references') + ' out of sequence',
        detail: pt
          ? D((figExamples ? ['· quebras detectadas: ' + em(figExamples)] : []).concat([
               '· figuras devem ser citadas em ordem crescente conforme surgem no texto',
               '· verifique se figuras foram renumeradas na análise sem atualizar o manuscrito',
               '· use o painel de cross-references para navegar até cada referência']))
          : D((figExamples ? ['· detected breaks: ' + em(figExamples)] : []).concat([
               '· figures must be cited in ascending order as they appear in text',
               '· check if figures were renumbered in analysis without updating the manuscript',
               '· use the cross-references panel to navigate to each reference'])) });
    }

    // Order breaks de tabelas
    if (opts.tableOrderIssues > 0) {
      var tblExamples = opts.tableOrderExamples && opts.tableOrderExamples.length
        ? opts.tableOrderExamples.slice(0, 4).join(', ') : '';
      issues.push({ level: 'alert',
        text: pt
          ? opts.tableOrderIssues + (opts.tableOrderIssues === 1 ? ' quebra de ordem' : ' quebras de ordem') + ' nas referências de tabelas'
          : opts.tableOrderIssues + (opts.tableOrderIssues === 1 ? ' table reference' : ' table references') + ' out of sequence',
        detail: pt
          ? D((tblExamples ? ['· quebras detectadas: ' + em(tblExamples)] : []).concat([
               '· tabelas devem ser citadas em ordem crescente conforme surgem no texto',
               '· verifique se tabelas foram renumeradas na análise sem atualizar o manuscrito',
               '· use o painel de cross-references para navegar até cada referência']))
          : D((tblExamples ? ['· detected breaks: ' + em(tblExamples)] : []).concat([
               '· tables must be cited in ascending order as they appear in text',
               '· check if tables were renumbered in analysis without updating the manuscript',
               '· use the cross-references panel to navigate to each reference'])) });
    }

    // Tamanho do abstract
    if (opts.abstractWordCount > 0 && (opts.abstractWordCount < 150 || opts.abstractWordCount > 300)) {
      issues.push({ level: 'warn',
        text: pt
          ? 'Abstract com ' + opts.abstractWordCount + ' palavras — faixa típica: 150–300'
          : 'Abstract has ' + opts.abstractWordCount + ' words — typical range: 150–300',
        detail: pt
          ? D(['· se estiver curto, acrescente resultado quantitativo e implicação',
               '· se estiver longo, remova contexto secundário e detalhes de método',
               '· sempre confirme o limite específico da revista'])
          : D(['· if it is short, add a quantitative result and implication',
               '· if it is long, remove secondary context and method details',
               '· always confirm the target journal limit']) });
    }

    // Cobertura do abstract
    if (opts.abstractWordCount > 0 && opts.abstractCoverage.score < 75) {
      var missItems = opts.abstractCoverage.missing || [];
      var abstractHints = pt
        ? { objective:   'objetivo — ' + em('Este estudo visa…, O objetivo foi…, Buscou-se…'),
            method:      'método — ' + em('foram avaliados…, utilizou-se…, o experimento consistiu em…'),
            result:      'resultado — ' + em('os resultados indicam…, observou-se…, verificou-se que…'),
            conclusion:  'conclusão — ' + em('conclui-se que…, os dados sugerem…, portanto…') }
        : { objective:   'objective — ' + em('This study aims to…, The purpose was…, We sought to…'),
            method:      'method — ' + em('We used…, Samples were collected…, The experiment consisted of…'),
            result:      'result — ' + em('Results showed…, We found…, It was observed that…'),
            conclusion:  'conclusion — ' + em('We conclude…, The data suggest…, Therefore…') };
      issues.push({ level: opts.abstractCoverage.score < 50 ? 'alert' : 'warn',
        text: pt
          ? 'Abstract cobre ' + opts.abstractCoverage.score + '% dos elementos esperados (objetivo, método, resultado, conclusão)'
          : 'Abstract covers ' + opts.abstractCoverage.score + '% of expected elements (objective, method, result, conclusion)',
        detail: D(missItems.length
          ? (pt ? ['· elementos ausentes:'] : ['· missing elements:']).concat(missItems.map(function(m) {
              return '&nbsp;&nbsp;– ' + (abstractHints[m] || em(m));
            }))
          : (pt ? ['· revise os sinalizadores de presença de cada elemento'] : ['· review signal phrases for each element'])) });
    }

    // Equilíbrio entre seções
    if (opts.sectionBalance.cv >= 0.35) {
      var outliers = opts.sectionBalance.outliers || [];
      issues.push({ level: opts.sectionBalance.cv >= 0.55 ? 'alert' : 'warn',
        text: pt
          ? 'Desequilíbrio entre seções — CV ' + opts.sectionBalance.cv
          : 'Section length imbalance — CV ' + opts.sectionBalance.cv,
        detail: pt
          ? D((outliers.length ? ['· seções discrepantes: ' + em(outliers.slice(0, 3).join(', '))] : []).concat([
               '· CV atual: ' + em(String(opts.sectionBalance.cv)) + ' — meta ≤ 0.35 (alerta ≥ 0.55)',
               '· Métodos pode ser legitimamente mais longa — verifique Introdução e Discussão primeiro',
               '· seções muito curtas podem indicar argumentação incompleta']))
          : D((outliers.length ? ['· outlier sections: ' + em(outliers.slice(0, 3).join(', '))] : []).concat([
               '· current CV: ' + em(String(opts.sectionBalance.cv)) + ' — target ≤ 0.35 (alert at ≥ 0.55)',
               '· Methods is legitimately longer — check Introduction and Discussion first',
               '· very short sections may indicate incomplete argumentation'])) });
    }

    // Perfil de conectores
    if (opts.totalWords >= 500) {
      var connTotal = connectorTotal(opts.connectorByCat);
      var connDensity = opts.totalWords ? (connTotal / opts.totalWords) * 1000 : 0;
      var contrastCause = ((opts.connectorByCat || {}).contrast || 0) + ((opts.connectorByCat || {}).cause || 0);
      var addShare = connTotal ? (((opts.connectorByCat || {}).add || 0) / connTotal) : 0;
      if (connDensity < 6 || (connTotal >= 12 && addShare > 0.7) || (connTotal >= 8 && contrastCause === 0)) {
        issues.push({ level: connDensity < 3 ? 'alert' : 'warn',
          text: pt
            ? 'Perfil de conectores pode enfraquecer a progressão lógica (' + round1(connDensity) + '/1000p)'
            : 'Connector profile may weaken logical progression (' + round1(connDensity) + '/1000w)',
          detail: pt
            ? D(['· baixa densidade sugere parágrafos justapostos, não encadeados',
                 '· excesso de aditivos cria lista; inclua contraste, causa e consequência',
                 '· bons pontos de revisão: início de parágrafos e transição Resultados→Discussão'])
            : D(['· low density suggests juxtaposed rather than connected paragraphs',
                 '· too many additive connectors creates a list; add contrast, cause, and consequence',
                 '· good revision points: paragraph openings and the Results→Discussion transition']) });
      }
    }

    // Voz passiva elevada
    if (opts.passiveDensity > 60) {
      issues.push({ level: 'warn',
        text: pt
          ? 'Densidade de voz passiva elevada: ' + round1(opts.passiveDensity) + '/1000p (meta ≤ 60)'
          : 'High passive voice density: ' + round1(opts.passiveDensity) + '/1000w (target ≤ 60)',
        detail: pt
          ? D(['· converta: ' + em('"foram coletadas amostras" → "coletamos amostras"'),
               '· converta: ' + em('"foi observado que" → "observamos que"'),
               '· passiva é aceitável em Métodos e quando o agente é desconhecido',
               '· prefira ativa em Resultados e Discussão para maior clareza'])
          : D(['· convert: ' + em('"samples were collected" → "we collected samples"'),
               '· convert: ' + em('"it was observed that" → "we observed that"'),
               '· passive is acceptable in Methods and when the agent is unknown',
               '· prefer active in Results and Discussion for greater clarity']) });
    }

    // Hedges excessivos
    if (opts.hedgeDensity > 30) {
      issues.push({ level: 'warn',
        text: pt
          ? 'Alta densidade de atenuadores: ' + round1(opts.hedgeDensity) + '/1000p (meta ≤ 30)'
          : 'High hedge density: ' + round1(opts.hedgeDensity) + '/1000w (target ≤ 30)',
        detail: pt
          ? D(['· reduza: ' + em('pode, poderia, talvez, parece, aparentemente, possivelmente'),
               '· hedges são necessários para afirmações incertas — mas não para resultados diretos',
               '· troque: ' + em('"parece indicar" → "indica"') + ' quando os dados suportam',
               '· assertividade calibrada aumenta a credibilidade científica do texto'])
          : D(['· reduce: ' + em('may, might, could, possibly, appears to, seems to, perhaps'),
               '· hedges are needed for uncertain claims — but not for direct results',
               '· replace: ' + em('"appears to indicate" → "indicates"') + ' when data supports it',
               '· calibrated assertiveness strengthens the scientific credibility of the text']) });
    }

    // Nominalizações
    if (opts.nominalizationCount > 0 && opts.totalWords > 0) {
      var nominalDensity = (opts.nominalizationCount / opts.totalWords) * 1000;
      if (nominalDensity > 18 || opts.nominalizationCount > 30) {
        issues.push({ level: nominalDensity > 35 ? 'alert' : 'warn',
          text: pt
            ? 'Nominalizações elevadas: ' + opts.nominalizationCount + ' (' + round1(nominalDensity) + '/1000p)'
            : 'High nominalization load: ' + opts.nominalizationCount + ' (' + round1(nominalDensity) + '/1000w)',
          detail: pt
            ? D(['· transforme nomes abstratos em verbos quando a ação importa',
                 '· exemplo: ' + em('"a realização da análise" → "analisamos"'),
                 '· preserve termos técnicos estáveis, mas reduza cadeias como "avaliação da determinação da variação"',
                 '· esse ajuste costuma reduzir frases longas e melhorar Flesch/Fog'])
            : D(['· turn abstract nouns into verbs when the action matters',
                 '· example: ' + em('"the performance of the analysis" → "we analyzed"'),
                 '· preserve stable technical terms, but reduce chains like "evaluation of determination of variation"',
                 '· this often shortens sentences and improves Flesch/Fog']) });
      }
    }

    // Pronomes ambíguos
    if (opts.pronounAmbigCount > 2) {
      issues.push({ level: opts.pronounAmbigCount > 8 ? 'alert' : 'warn',
        text: pt
          ? opts.pronounAmbigCount + (opts.pronounAmbigCount === 1 ? ' pronome ambíguo' : ' pronomes ambíguos') + ' no início de frase'
          : opts.pronounAmbigCount + (opts.pronounAmbigCount === 1 ? ' ambiguous pronoun' : ' ambiguous pronouns') + ' at sentence start',
        detail: pt
          ? D(['· troque "isso/isto/eles" por um referente explícito',
               '· exemplo: ' + em('"Isso sugere…" → "Esse aumento sugere…"'),
               '· em parágrafos densos, pronomes fazem o leitor procurar o antecedente'])
          : D(['· replace "this/it/they" with an explicit referent',
               '· example: ' + em('"This suggests…" → "This increase suggests…"'),
               '· in dense paragraphs, pronouns force readers to search for the antecedent']) });
    }

    // Modais, primeira pessoa e pontuação enfática
    if (opts.modalVerbCount > 12) {
      issues.push({ level: opts.modalVerbCount > 28 ? 'alert' : 'warn',
        text: pt
          ? opts.modalVerbCount + ' verbos modais detectados — revise cautela excessiva'
          : opts.modalVerbCount + ' modal verbs detected — review excessive caution',
        detail: pt
          ? D(['· mantenha modais em hipóteses, limitações e recomendações',
               '· em Resultados, substitua "pode indicar" por "indica" quando o dado sustenta',
               '· diferencie incerteza real de hábito de escrita defensiva'])
          : D(['· keep modals for hypotheses, limitations, and recommendations',
               '· in Results, replace "may indicate" with "indicates" when the data supports it',
               '· distinguish real uncertainty from defensive writing habit']) });
    }
    if (opts.firstPersonCount > 8) {
      issues.push({ level: 'warn',
        text: pt
          ? opts.firstPersonCount + ' usos de primeira pessoa — confirme a política da revista'
          : opts.firstPersonCount + ' first-person uses — confirm the journal policy',
        detail: pt
          ? D(['· primeira pessoa pode ser aceitável em periódicos modernos',
               '· se a revista preferir impessoalidade, reescreva sem voltar à passiva excessiva',
               '· evite alternar "nós", "os autores" e voz passiva para a mesma ação'])
          : D(['· first person can be acceptable in modern journals',
               '· if the journal prefers impersonal style, revise without overusing passive voice',
               '· avoid alternating "we", "the authors", and passive voice for the same action']) });
    }
    if (opts.emphaticPunct > 0) {
      issues.push({ level: 'warn',
        text: pt
          ? opts.emphaticPunct + (opts.emphaticPunct === 1 ? ' pontuação enfática' : ' pontuações enfáticas') + ' detectada' + (opts.emphaticPunct === 1 ? '' : 's')
          : opts.emphaticPunct + (opts.emphaticPunct === 1 ? ' emphatic punctuation mark' : ' emphatic punctuation marks') + ' detected',
        detail: pt
          ? D(['· substitua exclamações e perguntas retóricas por afirmações analíticas',
               '· em manuscritos científicos, ênfase deve vir de dados, contraste e conclusão'])
          : D(['· replace exclamation marks and rhetorical emphasis with analytical statements',
               '· in scientific manuscripts, emphasis should come from data, contrast, and conclusion']) });
    }

    // Voz passiva fora de Métodos
    if (opts.nonMethodsPassiveDensity > 45) {
      issues.push({ level: opts.nonMethodsPassiveDensity > 80 ? 'alert' : 'warn',
        text: pt
          ? 'Voz passiva elevada fora de Métodos: ' + round1(opts.nonMethodsPassiveDensity) + '/1000p (meta ≤ 45)'
          : 'High passive voice outside Methods: ' + round1(opts.nonMethodsPassiveDensity) + '/1000w (target ≤ 45)',
        detail: pt
          ? D(['· Introdução, Resultados e Discussão beneficiam de voz ativa',
               '· converta: ' + em('"foi observado que" → "observamos que"'),
               '· converta: ' + em('"foram coletados dados" → "coletamos dados"'),
               '· voz passiva em Métodos é esperada — concentre revisão nas demais seções'])
          : D(['· Introduction, Results, and Discussion benefit from active voice',
               '· convert: ' + em('"it was observed that" → "we observed that"'),
               '· convert: ' + em('"data were collected" → "we collected data"'),
               '· passive in Methods is expected — focus revisions on other sections']) });
    }

    // Termos coloquiais
    if (opts.colloquialCount > 0) {
      issues.push({ level: opts.colloquialCount > 3 ? 'alert' : 'warn',
        text: pt
          ? opts.colloquialCount + (opts.colloquialCount === 1 ? ' expressão coloquial' : ' expressões coloquiais') + ' detectada' + (opts.colloquialCount === 1 ? '' : 's') + ' — inadequada' + (opts.colloquialCount === 1 ? '' : 's') + ' em escrita científica'
          : opts.colloquialCount + (opts.colloquialCount === 1 ? ' colloquial expression' : ' colloquial expressions') + ' detected — inappropriate in scientific writing',
        detail: pt
          ? D(['· substitua: ' + em('"muito bom" → "notável, substancial"'),
               '· substitua: ' + em('"tipo" → "como, tal como"') + ', ' + em('"coisa" → "elemento, fator"'),
               '· use o painel de Tom/Estilo para localizar cada ocorrência',
               '· registros coloquiais reduzem a credibilidade do manuscrito'])
          : D(['· replace: ' + em('"a lot" → "substantial, considerable"'),
               '· replace: ' + em('"kind of" → "somewhat, relatively"') + ', ' + em('"huge" → "substantial, marked"'),
               '· use the Voice & Tone panel to locate each occurrence',
               '· colloquial register undermines the credibility of the manuscript']) });
    }

    // Quantificadores vagos
    if (opts.vagueCount > 8) {
      issues.push({ level: opts.vagueCount > 25 ? 'alert' : 'warn',
        text: pt
          ? opts.vagueCount + ' quantificadores vagos sem dados precisos (' + em('muitos, vários, alguns…') + ')'
          : opts.vagueCount + ' vague quantifiers without precise data (' + em('many, several, some…') + ')',
        detail: pt
          ? D(['· substitua por valores exatos: ' + em('"muitos" → "43 (82%)"'),
               '· se o número exato não for relevante, use: ' + em('"a maioria (>75%)"'),
               '· quantificadores vagos são aceitáveis apenas em contexto qualitativo explícito',
               '· valores em _variables.yml facilitam a parametrização desses dados'])
          : D(['· replace with exact values: ' + em('"many" → "43 (82%)"'),
               '· if exact count is not meaningful, use: ' + em('"the majority (>75%)"'),
               '· vague quantifiers are acceptable only in explicitly qualitative contexts',
               '· define values in _variables.yml to keep numbers updateable']) });
    }

    // Frases com abertura fraca (It is / There is / This is)
    if (opts.weakOpenerCount > 3) {
      issues.push({ level: opts.weakOpenerCount > 10 ? 'alert' : 'warn',
        text: pt
          ? opts.weakOpenerCount + (opts.weakOpenerCount === 1 ? ' frase abre' : ' frases abrem') + ' com sujeito vazio (estrutura It is / There is)'
          : opts.weakOpenerCount + (opts.weakOpenerCount === 1 ? ' sentence opens' : ' sentences open') + ' with an empty subject (It is / There is / This is)',
        detail: pt
          ? D(['· converta: ' + em('"É importante notar que…" → "Nota-se que…" ou omita'),
               '· converta: ' + em('"Há evidências de que…" → "Evidências indicam que…"'),
               '· converta: ' + em('"This is consistent with…" → "These findings are consistent with…"'),
               '· sujeito direto comunica com mais clareza e autoridade'])
          : D(['· convert: ' + em('"It is important to note that…" → "Notably,…" or omit'),
               '· convert: ' + em('"There is evidence that…" → "Evidence indicates that…"'),
               '· convert: ' + em('"This is consistent with…" → "These findings are consistent with…"'),
               '· direct subject communicates with greater clarity and authority']) });
    }

    // Frases iniciando com citação
    if (opts.citationSentStartCount > 3) {
      issues.push({ level: 'warn',
        text: pt
          ? opts.citationSentStartCount + (opts.citationSentStartCount === 1 ? ' frase inicia' : ' frases iniciam') + ' com citação — o argumento deve preceder a referência'
          : opts.citationSentStartCount + (opts.citationSentStartCount === 1 ? ' sentence starts' : ' sentences start') + ' with a citation — the argument should precede the reference',
        detail: pt
          ? D(['· reestruture: ' + em('"@Smith2020 mostrou que X" → "X foi demonstrado [@Smith2020]"'),
               '· a ideia do autor deve abrir a frase; a citação ancora ao final',
               '· excepção: revisões de literatura podem citar o autor como sujeito'])
          : D(['· restructure: ' + em('"@Smith2020 showed that X" → "X has been demonstrated [@Smith2020]"'),
               '· the author\'s idea should open the sentence; the citation anchors at the end',
               '· exception: literature reviews may use the cited author as grammatical subject']) });
    }

    // Siglas não definidas
    if (opts.undefinedAcronyms && opts.undefinedAcronyms.length > 0) {
      var acroList = opts.undefinedAcronyms.slice(0, 6).map(function(a) { return a.acronym; }).join(', ');
      issues.push({ level: opts.undefinedAcronyms.length > 2 ? 'alert' : 'warn',
        text: pt
          ? opts.undefinedAcronyms.length + (opts.undefinedAcronyms.length === 1 ? ' sigla usada' : ' siglas usadas') + ' sem definição prévia'
          : opts.undefinedAcronyms.length + (opts.undefinedAcronyms.length === 1 ? ' acronym used' : ' acronyms used') + ' without prior definition',
        detail: pt
          ? D(['· siglas: ' + em(acroList),
               '· defina na primeira ocorrência: ' + em('Nome Completo (NC)'),
               '· exceção: siglas universalmente conhecidas (DNA, RNA, pH, CO₂)',
               '· verifique também se a sigla está consistente ao longo do texto'])
          : D(['· acronyms: ' + em(acroList),
               '· define at first use: ' + em('Full Name (FN)'),
               '· exception: universally recognized acronyms (DNA, RNA, pH, CO₂)',
               '· also verify consistent capitalization throughout the text']) });
    }

    // Frases com expressões prolixas
    if (opts.wordyCount > 5) {
      issues.push({ level: opts.wordyCount > 20 ? 'alert' : 'warn',
        text: pt
          ? opts.wordyCount + (opts.wordyCount === 1 ? ' expressão prolixa' : ' expressões prolixas') + ' detectada' + (opts.wordyCount === 1 ? '' : 's'  )
          : opts.wordyCount + (opts.wordyCount === 1 ? ' wordy phrase' : ' wordy phrases') + ' detected',
        detail: pt
          ? D(['· substitua: ' + em('"pelo fato de que" → "porque"'),
               '· substitua: ' + em('"no que diz respeito a" → "sobre"') + ', ' + em('"com o objetivo de" → "para"'),
               '· substitua: ' + em('"é necessário que" → "deve"') + ', ' + em('"em função de" → "por"'),
               '· use o painel de Tom/Estilo para localizar cada ocorrência'])
          : D(['· replace: ' + em('"due to the fact that" → "because"'),
               '· replace: ' + em('"in order to" → "to"') + ', ' + em('"with regard to" → "regarding"'),
               '· replace: ' + em('"it is necessary to" → "must"') + ', ' + em('"in the event that" → "if"'),
               '· use the Voice & Tone panel to locate each occurrence']) });
    }

    // Inconsistência de unidades
    if (opts.unitInconsistency && opts.unitInconsistency.length > 0) {
      var unitList = opts.unitInconsistency.slice(0, 4).join('; ');
      issues.push({ level: 'alert',
        text: pt
          ? opts.unitInconsistency.length + (opts.unitInconsistency.length === 1 ? ' inconsistência de unidade' : ' inconsistências de unidades') + ' detectada' + (opts.unitInconsistency.length === 1 ? '' : 's')
          : opts.unitInconsistency.length + (opts.unitInconsistency.length === 1 ? ' unit inconsistency' : ' unit inconsistencies') + ' detected',
        detail: pt
          ? D(['· conflitos: ' + em(unitList),
               '· padronize: use ' + em('mg kg⁻¹') + ' ou ' + em('mg/kg') + ' — nunca os dois',
               '· prefira notação com expoente negativo em periódicos científicos',
               '· verifique também % vs. por cento e h vs. hora'])
          : D(['· conflicts: ' + em(unitList),
               '· standardize: use ' + em('mg kg⁻¹') + ' or ' + em('mg/kg') + ' — never both',
               '· prefer negative exponent notation in scientific journals',
               '· also check % vs. percent and h vs. hour']) });
    }

    // Variantes terminológicas
    if (opts.termVariants && opts.termVariants.length > 3) {
      var tvList = opts.termVariants.slice(0, 4).map(function(v) {
        return v.forms ? v.forms.slice(0, 2).join('/') : '';
      }).filter(Boolean).join(', ');
      issues.push({ level: 'warn',
        text: pt
          ? opts.termVariants.length + ' grupos de variantes terminológicas — risco de ambiguidade conceitual'
          : opts.termVariants.length + ' terminology variant groups — risk of conceptual ambiguity',
        detail: pt
          ? D((tvList ? ['· exemplos: ' + em(tvList)] : []).concat([
               '· escolha uma forma canônica e use-a consistentemente',
               '· variantes como ' + em('análise/analisar/analítico') + ' podem ser intencionais — revise',
               '· inconsistência terminológica dificulta buscas bibliográficas']))
          : D((tvList ? ['· examples: ' + em(tvList)] : []).concat([
               '· choose a canonical form and use it consistently',
               '· variants like ' + em('analyze/analysis/analytical') + ' may be intentional — review',
               '· terminology inconsistency hampers literature search and review'])) });
    }

    // Repetição lexical global
    if (opts.repeatedTermCount > 12) {
      var repeatedList = topList(opts.topRepeated, 6, function (x) {
        if (typeof x === 'string') return x;
        return (x.text || '') + (x.count ? ' ×' + x.count : '');
      });
      issues.push({ level: opts.repeatedTermCount > 28 ? 'alert' : 'warn',
        text: pt
          ? opts.repeatedTermCount + ' termos com repetição forte no documento'
          : opts.repeatedTermCount + ' strongly repeated terms in the document',
        detail: pt
          ? D((repeatedList ? ['· mais repetidos: ' + em(repeatedList)] : []).concat([
               '· preserve palavras-chave técnicas quando forem necessárias para rastreabilidade',
               '· revise repetições de verbos genéricos, conectores e nomes abstratos',
               '· se o termo central domina muitas seções, varie a estrutura da frase em vez de trocar o termo']))
          : D((repeatedList ? ['· most repeated: ' + em(repeatedList)] : []).concat([
               '· preserve technical keywords when needed for traceability',
               '· review repeated generic verbs, connectors, and abstract nouns',
               '· if the central term dominates many sections, vary sentence structure rather than replacing the term'])) });
    }

    // Inícios repetidos de frase
    if (opts.repeatedStarts && opts.repeatedStarts.length > 2) {
      var startList = topList(opts.repeatedStarts, 4, function (x) { return (x.start || x.word || x.text) + ' ×' + x.count; });
      issues.push({ level: opts.repeatedStarts.length > 6 ? 'alert' : 'warn',
        text: pt
          ? opts.repeatedStarts.length + ' padrões repetidos de início de frase'
          : opts.repeatedStarts.length + ' repeated sentence-start patterns',
        detail: pt
          ? D((startList ? ['· exemplos: ' + em(startList)] : []).concat([
               '· varie sujeito, conector e ordem da informação conhecida/nova',
               '· repetição pode ser recurso retórico, mas perde força quando aparece por hábito',
               '· revise principalmente sequências de Resultados']))
          : D((startList ? ['· examples: ' + em(startList)] : []).concat([
               '· vary subject, connector, and old/new information order',
               '· repetition can be rhetorical, but weakens when it appears by habit',
               '· review Results sequences first'])) });
    }

    // Baixa diversidade lexical
    if (opts.lexDiv < 50) {
      issues.push({ level: opts.lexDiv < 35 ? 'alert' : 'warn',
        text: pt
          ? 'Baixa diversidade lexical: ' + opts.lexDiv + '% (meta ≥ 50%)'
          : 'Low lexical diversity: ' + opts.lexDiv + '% (target ≥ 50%)',
        detail: pt
          ? D(['· diversidade mede palavras únicas / total de palavras de conteúdo',
               '· varie o vocabulário: use sinônimos precisos, não genéricos',
               '· repetição controlada de termos técnicos é esperada — o problema é a repetição de verbo/conectivo',
               '· revise os termos mais repetidos abaixo no painel de Vocabulário'])
          : D(['· diversity measures unique / total content words in the document',
               '· vary vocabulary: use precise synonyms, not generic ones',
               '· controlled repetition of technical terms is expected — the issue is verb/connector repetition',
               '· review most repeated terms in the Vocabulary panel below']) });
    }

    // Sinais NLP de densidade e fluxo
    var nlpTotals = opts.nlpTotals || {};
    if ((nlpTotals.nominalLoadCount || 0) > 5 || (nlpTotals.weakVerbCount || 0) > 8 || (nlpTotals.nounStackCount || 0) > 4) {
      var nlpAlert = (nlpTotals.nominalLoadCount || 0) > 18 || (nlpTotals.weakVerbCount || 0) > 24 || (nlpTotals.nounStackCount || 0) > 12;
      issues.push({ level: nlpAlert ? 'alert' : 'warn',
        text: pt
          ? 'NLP detectou densidade nominal/verbos fracos: ' + (nlpTotals.nominalLoadCount || 0) + ' frases densas, ' + (nlpTotals.weakVerbCount || 0) + ' verbos genéricos, ' + (nlpTotals.nounStackCount || 0) + ' noun stacks'
          : 'NLP detected nominal density/weak predicates: ' + (nlpTotals.nominalLoadCount || 0) + ' dense sentences, ' + (nlpTotals.weakVerbCount || 0) + ' generic verbs, ' + (nlpTotals.nounStackCount || 0) + ' noun stacks',
        detail: pt
          ? D(['· substitua verbos genéricos por relações científicas precisas: aumenta, reduz, prediz, modula',
               '· quebre cadeias nominais com preposições ou frases relativas curtas',
               '· revise os highlights NLP antes de editar terminologia técnica'])
          : D(['· replace generic verbs with precise scientific relations: increases, reduces, predicts, modulates',
               '· break noun chains with prepositions or short relative clauses',
               '· review NLP highlights before editing technical terminology']) });
    }
    if ((nlpTotals.entityOverloadCount || 0) > 0 || opts.nlpEntityDensity > 8) {
      issues.push({ level: (nlpTotals.entityOverloadCount || 0) > 5 || opts.nlpEntityDensity > 16 ? 'alert' : 'warn',
        text: pt
          ? 'Alta concentração de entidades/nomes próprios (' + round1(opts.nlpEntityDensity || 0) + '/100p)'
          : 'High concentration of entities/proper names (' + round1(opts.nlpEntityDensity || 0) + '/100w)',
        detail: pt
          ? D(['· agrupe nomes institucionais, softwares e locais quando possível',
               '· explique a função do nome próprio na primeira menção',
               '· frases com muitas entidades tendem a obscurecer a relação científica'])
          : D(['· group institutional names, software, and locations where possible',
               '· explain the role of a proper name at first mention',
               '· entity-heavy sentences can obscure the scientific relationship']) });
    }
    if (opts.nlpActionVerbScore < 55 || opts.nlpSemanticRedundancy > 22 || (opts.nlpFlowScore > 0 && opts.nlpFlowScore < 45) || (nlpTotals.termDriftCount || 0) > 0) {
      issues.push({ level: opts.nlpActionVerbScore < 35 || opts.nlpSemanticRedundancy > 35 || (opts.nlpFlowScore > 0 && opts.nlpFlowScore < 30) ? 'alert' : 'warn',
        text: pt
          ? 'Sinais NLP de fluxo/redundância: ação ' + round1(opts.nlpActionVerbScore || 0) + '%, redundância ' + round1(opts.nlpSemanticRedundancy || 0) + '%, fluxo ' + round1(opts.nlpFlowScore || 0) + '%'
          : 'NLP flow/redundancy signals: action ' + round1(opts.nlpActionVerbScore || 0) + '%, redundancy ' + round1(opts.nlpSemanticRedundancy || 0) + '%, flow ' + round1(opts.nlpFlowScore || 0) + '%',
        detail: pt
          ? D(['· frases vizinhas muito parecidas devem ser fundidas ou diferenciadas',
               '· baixo fluxo geralmente pede conector ou retomada explícita do conceito anterior',
               '· drift terminológico sugere escolher uma forma canônica para o mesmo conceito'])
          : D(['· very similar adjacent sentences should be merged or differentiated',
               '· low flow usually needs a connector or explicit reprise of the previous concept',
               '· term drift suggests choosing one canonical form for the same concept']) });
    }
    if (LANG === 'en' && ((nlpTotals.contractionCount || 0) > 0 || (nlpTotals.questionCount || 0) > 1)) {
      issues.push({ level: 'warn',
        text: (nlpTotals.contractionCount || 0) + ' contractions and ' + (nlpTotals.questionCount || 0) + ' interrogative sentences detected',
        detail: D(['· avoid contractions in formal scientific English',
                   '· convert rhetorical questions into explicit knowledge gaps or objectives',
                   '· questions are acceptable only when the article genre explicitly supports them']) });
    }
    if (opts.winkStats && opts.winkStats.winkAvailable && (
      (opts.winkStats.complexWordDensity || 0) > 18 ||
      (opts.winkStats.pronounDensity || 0) > 5 ||
      (opts.winkStats.auxiliaryVerbRatio || 0) > 70 ||
      (opts.winkStats.posNounStackCount || 0) > 5
    )) {
      issues.push({ level: (opts.winkStats.complexWordDensity || 0) > 24 || (opts.winkStats.posNounStackCount || 0) > 14 ? 'alert' : 'warn',
        text: pt
          ? 'wink-nlp reforça sinais de prosa densa em inglês'
          : 'wink-nlp confirms dense English prose signals',
        detail: pt
          ? D(['· revise palavras complexas, pronomes, auxiliares e noun stacks nos cards wink',
               '· essa checagem usa POS tagging e complementa as heurísticas internas'])
          : D(['· review complex words, pronouns, auxiliaries, and noun stacks in wink cards',
               '· this check uses POS tagging and complements the built-in heuristics']) });
    }

    // Erros/avisos de DOI
    if (opts.doiWithError && opts.doiWithError > 0) {
      issues.push({ level: 'alert',
        text: pt
          ? opts.doiWithError + (opts.doiWithError === 1 ? ' DOI com erro' : ' DOIs com erro') + ' — validação falhou ou URL inválida'
          : opts.doiWithError + (opts.doiWithError === 1 ? ' DOI failed' : ' DOIs failed') + ' validation or invalid URL',
        detail: pt
          ? D(['· abra o tooltip DOI (passe o mouse) para ver detalhes do erro',
               '· DOIs devem estar no formato 10.xxxx/yyyyy',
               '· verifique em https://doi.org/SEU-DOI',
               '· corrija ou remova DOIs inválidos das referências'])
          : D(['· open DOI tooltip (hover) to see error details',
               '· DOIs must be in format 10.xxxx/yyyyy',
               '· verify at https://doi.org/YOUR-DOI',
               '· fix or remove invalid DOIs from references']) });
    } else if (opts.doiWithWarn && opts.doiWithWarn > 0) {
      issues.push({ level: 'warn',
        text: pt
          ? opts.doiWithWarn + (opts.doiWithWarn === 1 ? ' DOI com aviso' : ' DOIs com aviso') + ' — validação lenta ou metadata incompleta'
          : opts.doiWithWarn + (opts.doiWithWarn === 1 ? ' DOI has warning' : ' DOIs have warnings') + ' — slow validation or incomplete metadata',
        detail: pt
          ? D(['· abra o tooltip DOI (passe o mouse) para ver detalhes do aviso',
               '· avisos geralmente indicam problema de timeout ou API indisponível',
               '· tente recarregar a página em alguns segundos',
               '· se persistir, verifique a URL original no registro bibliográfico'])
          : D(['· open DOI tooltip (hover) to see warning details',
               '· warnings usually indicate timeout or API unavailability',
               '· try reloading the page in a few seconds',
               '· if persistent, check the original URL in the bibliographic record']) });
    }

    // Referências não citadas
    if (opts.unusedRefs && opts.unusedRefs.length > 0) {
      var unusedRefList = opts.unusedRefs.slice(0, 5).join(', ');
      issues.push({ level: 'warn',
        text: pt
          ? opts.unusedRefs.length + (opts.unusedRefs.length === 1 ? ' referência definida' : ' referências definidas') + ' em ref.bib mas não citada' + (opts.unusedRefs.length === 1 ? '' : 's') + ' no texto'
          : opts.unusedRefs.length + (opts.unusedRefs.length === 1 ? ' reference defined' : ' references defined') + ' in ref.bib but not cited in text',
        detail: pt
          ? D(['· chaves: ' + em(unusedRefList),
               '· remova do .bib se não for relevante para o manuscrito atual',
               '· ou insira uma citação onde o trabalho sustenta uma afirmação',
               '· bibliografias infladas são penalizadas em revisão por pares'])
          : D(['· keys: ' + em(unusedRefList),
               '· remove from .bib if not relevant to the current manuscript',
               '· or insert a citation where the work supports a claim',
               '· inflated reference lists are flagged in peer review']) });
    }

    var alerts = issues.filter(function(i) { return i.level === 'alert'; });
    var warns  = issues.filter(function(i) { return i.level === 'warn'; });

    function renderIssue(iss) {
      return '<div class="ws-sum-issue ws-sum-issue-' + iss.level + '">' +
        (iss.level === 'alert' ? '⚠ ' : '› ') + escapeHTML(iss.text) +
        (iss.detail ? '<br>' + iss.detail : '') +
      '</div>';
    }

    var html = buildTextProfile();
    if (issues.length === 0) {
      html += '<div class="ws-sum-ok">' + (pt ? '✓ Nenhum problema detectado.' : '✓ No issues detected.') + '</div>';
    } else {
      if (alerts.length > 0) {
        html += '<div class="ws-sum-section-label ws-sum-section-alert">' + (pt ? 'Problemas críticos' : 'Key issues') + '</div>';
        html += alerts.map(renderIssue).join('');
      }
      if (warns.length > 0) {
        html += '<div class="ws-sum-section-label ws-sum-section-warn">' + (pt ? 'Atenções' : 'Notices') + '</div>';
        html += warns.map(renderIssue).join('');
      }
    }

    return '<div class="ws-doc-summary">' +
      '<div class="ws-sum-header">' +
        '<span class="ws-sum-title">' + (pt ? 'Análise do documento' : 'Document analysis') + '</span>' +
        '<span class="ws-sum-badge">' + (pt ? 'automático' : 'auto') + '</span>' +
      '</div>' +
      html +
    '</div>';
  }

// src/ui/modal.js — Metric row and search control render helpers.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

  function metricItem(label, value, focus, title) {
    return '<div class="ws-doc-metric"' +
      (focus ? ' data-ws-focus="' + focus + '"' : '') +
      (title ? ' title="' + escapeHTML(title) + '"' : '') + '>' +
      '<span class="ws-doc-metric-label">' + label + '</span>' +
      '<span class="ws-doc-metric-value">' + value + '</span>' +
      '</div>';
  }

  function metricGroup(label) {
    return '<div class="ws-doc-metric-group" data-ws-group>' +
      '<button type="button" class="ws-doc-group-toggle" aria-expanded="true">' + escapeHTML(label) + '</button>' +
      '</div>';
  }

  function metricSubgroup(label, url) {
    var badge = url
      ? '<a class="ws-pkg-badge" href="' + escapeHTML(url) + '" target="_blank" rel="noopener noreferrer">' + escapeHTML(label) + '</a>'
      : '<span class="ws-pkg-badge ws-pkg-builtin">' + escapeHTML(label) + '</span>';
    return '<div class="ws-doc-metric-subgroup">' + badge + '</div>';
  }

  function metricRegexSearch() {
    return '<div class="ws-doc-metric ws-doc-metric-search" data-ws-regex-block title="' + escapeHTML(L.regexSearchDesc) + '">' +
      '<span class="ws-doc-metric-label">' + L.regexSearch + '</span>' +
      '<div class="ws-doc-regex-row">' +
        '<input type="text" class="ws-doc-regex-input" placeholder="' + escapeHTML(L.regexPlaceholder) + '" spellcheck="false" />' +
        '<button type="button" class="ws-doc-regex-btn ws-doc-regex-apply">' + L.regexApply + '</button>' +
        '<button type="button" class="ws-doc-regex-btn ws-doc-regex-clear">' + L.regexClear + '</button>' +
      '</div>' +
      '<div class="ws-doc-regex-scope ws-doc-regex-scope-hidden">' +
        '<label><input type="checkbox" class="ws-doc-regex-scope-paragraph" checked /> ' + L.parag + '</label>' +
        '<label><input type="checkbox" class="ws-doc-regex-scope-sentence" checked /> ' + L.sentP + '</label>' +
      '</div>' +
      '<span class="ws-doc-regex-count">0 ' + L.regexMatches + '</span>' +
    '</div>';
  }

  function wireMetricFocus(metrics) {
    metrics.querySelectorAll('[data-ws-focus]').forEach(function (item) {
      item.addEventListener('click', function () {
        var focus = item.dataset.wsFocus;
        var cls = 'ws-focus-' + focus;
        var active = document.body.classList.contains(cls);
        document.body.classList.toggle(cls, !active);
        item.classList.toggle('ws-doc-metric-active', !active);
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

  function wireMetricGroups(metrics) {
    var rows = Array.from(metrics.children || []);
    var groups = [];
    var current = null;
    rows.forEach(function (row) {
      if (row.classList.contains('ws-doc-metric-group')) {
        current = { header: row, items: [] };
        groups.push(current);
      } else if (current) {
        current.items.push(row);
      }
    });
    groups.forEach(function (group) {
      var btn = group.header.querySelector('.ws-doc-group-toggle');
      if (!btn) return;
      btn.addEventListener('click', function () {
        var expanded = btn.getAttribute('aria-expanded') !== 'false';
        var next = !expanded;
        btn.setAttribute('aria-expanded', next ? 'true' : 'false');
        group.header.classList.toggle('ws-doc-metric-group-collapsed', !next);
        group.items.forEach(function (item) {
          item.classList.toggle('ws-group-item-hidden', !next);
        });
      });
    });
  }

// src/ui/doi-tooltip.js — DOI validation tooltip (data pre-fetched at render time by Lua).
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

  function tokenDiff(strA, strB) {
    var tA = (strA || '').match(/\S+/g) || [];
    var tB = (strB || '').match(/\S+/g) || [];
    var m = tA.length, n = tB.length;
    var dp = new Array(m + 1);
    for (var i = 0; i <= m; i++) dp[i] = new Array(n + 1).fill(0);
    for (var i = 1; i <= m; i++) {
      for (var j = 1; j <= n; j++) {
        dp[i][j] = tA[i-1].toLowerCase() === tB[j-1].toLowerCase()
          ? dp[i-1][j-1] + 1
          : Math.max(dp[i-1][j], dp[i][j-1]);
      }
    }
    var mA = new Set(), mB = new Set();
    var i = m, j = n;
    while (i > 0 && j > 0) {
      if (tA[i-1].toLowerCase() === tB[j-1].toLowerCase()) {
        mA.add(i-1); mB.add(j-1); i--; j--;
      } else if (dp[i-1][j] >= dp[i][j-1]) { i--; } else { j--; }
    }
    var bibHtml = tA.map(function (w, idx) {
      return '<span class="' + (mA.has(idx) ? 'ws-diff-ok' : 'ws-diff-err') + '">' + escapeHTML(w) + '</span>';
    }).join(' ');
    var apiHtml = tB.map(function (w, idx) {
      return '<span class="' + (mB.has(idx) ? 'ws-diff-ok' : 'ws-diff-add') + '">' + escapeHTML(w) + '</span>';
    }).join(' ');
    return { bibHtml: bibHtml, apiHtml: apiHtml };
  }

  var _doiTipEl = null;
  var _doiTipAnchor = null;

  function _doiTip() {
    if (!_doiTipEl) {
      _doiTipEl = document.createElement('div');
      _doiTipEl.className = 'ws-doi-tip';
      document.body.appendChild(_doiTipEl);
      _doiTipEl.addEventListener('mouseenter', function () { _clearDOIHideTimer(); });
      _doiTipEl.addEventListener('mouseleave', function () { hideDOITip(); });
    }
    return _doiTipEl;
  }

  var _doiHideTimer = null;
  function _clearDOIHideTimer() {
    if (_doiHideTimer) { clearTimeout(_doiHideTimer); _doiHideTimer = null; }
  }

  function hideDOITip() {
    _doiHideTimer = setTimeout(function () {
      var el = _doiTipEl;
      if (el) { el.classList.remove('ws-doi-tip-visible'); el.innerHTML = ''; }
      _doiTipAnchor = null;
    }, 120);
  }

  function positionDOITip(anchor) {
    var el = _doiTip();
    var rect = anchor.getBoundingClientRect();
    var scrollY = window.scrollY || document.documentElement.scrollTop;
    var scrollX = window.scrollX || document.documentElement.scrollLeft;
    var vw = window.innerWidth || document.documentElement.clientWidth;
    var vh = window.innerHeight || document.documentElement.clientHeight;
    var tipH = el.offsetHeight;
    var gap = 6;
    var top;
    if (vh - rect.bottom - gap >= tipH || rect.top < tipH + gap) {
      top = rect.bottom + scrollY + gap;
    } else {
      top = rect.top + scrollY - tipH - gap;
    }
    var left = Math.max(8, Math.min(rect.left + scrollX, vw - 10));
    el.style.top = top + 'px';
    el.style.left = left + 'px';
    el.style.maxWidth = Math.min(460, vw - left - 10) + 'px';
  }

  function renderDOITip(anchor, doi, comparison) {
    var el = _doiTip();
    var pt = LANG === 'pt';

    var rows = comparison.map(function (r) {
      if (r.status === 'skip') return '';
      var icon = r.status === 'ok' ? '✓'
               : r.status === 'warn' ? '⚠'
               : '✗';
      var cls = 'ws-doi-tip-' + (r.status === 'ok' ? 'ok' : r.status === 'warn' ? 'warn' : 'err');
      var val = (r.status === 'ok' && r.value)
        ? ' <span class="ws-doi-tip-val">(' + escapeHTML(String(r.value)) + ')</span>' : '';
      var detail = '';
      if (r.status !== 'ok') {
        if (r.bib && r.api) {
          var diff = tokenDiff(r.bib, r.api);
          detail = '<div class="ws-doi-tip-diff">' +
            '<span class="ws-doi-tip-lbl">bib:</span> ' + diff.bibHtml + '<br>' +
            '<span class="ws-doi-tip-lbl">api:</span> ' + diff.apiHtml + '</div>';
        } else if (r.notes && r.notes.length) {
          detail = '<div class="ws-doi-tip-diff">' +
            r.notes.map(function (n) { return escapeHTML(n); }).join('<br>') + '</div>';
        }
      }
      return '<div class="ws-doi-tip-row ' + cls + '">' +
        '<span class="ws-doi-tip-icon">' + icon + '</span>' +
        '<span class="ws-doi-tip-field">' + escapeHTML(r.field) + '</span>' + val +
        detail + '</div>';
    }).join('');

    var allOk = comparison.every(function (r) { return r.status === 'ok' || r.status === 'skip'; });
    var hasError = comparison.some(function (r) { return r.status === 'error'; });

    el.innerHTML =
      '<div class="ws-doi-tip-hdr">' +
        '<span class="ws-doi-tip-title">CrossRef ' + (pt ? 'validação' : 'validation') + '</span>' +
        '<span class="ws-doi-tip-badge ws-doi-tip-badge-' + (allOk ? 'ok' : hasError ? 'err' : 'warn') + '">' +
          (allOk ? (pt ? 'ok' : 'ok') : hasError ? (pt ? 'divergência' : 'mismatch') : (pt ? 'aviso' : 'warning')) +
        '</span>' +
      '</div>' +
      '<div class="ws-doi-tip-doi">' + escapeHTML(doi) + '</div>' +
      rows;

    el.classList.add('ws-doi-tip-visible');
    positionDOITip(anchor);
  }

  function wireDOITooltips(root) {
    var validation = (window.WritingStatsConfig || {}).doiValidation;
    if (!validation || !Object.keys(validation).length) return;

    // Find all DOI links in the bibliography section
    var refSections = root.querySelectorAll('#refs, .references');
    refSections.forEach(function (sec) {
      sec.querySelectorAll('a[href]').forEach(function (link) {
        if (!/doi\.org/i.test(link.href)) return;
        var doi = link.href.replace(/^.*doi\.org\//i, '').toLowerCase();
        var comparison = validation[doi];
        if (!comparison || !comparison.length) return;

        link.classList.add('ws-doi-checkable');
        var hasIssue = comparison.some(function (r) { return r.status === 'error'; });
        var hasWarn  = comparison.some(function (r) { return r.status === 'warn'; });
        if (hasIssue) link.classList.add('ws-doi-has-error');
        else if (hasWarn) link.classList.add('ws-doi-has-warn');
        else link.classList.add('ws-doi-verified');

        link.addEventListener('mouseenter', function () {
          _clearDOIHideTimer();
          _doiTipAnchor = link;
          renderDOITip(link, doi, comparison);
        });
        link.addEventListener('mouseleave', function (e) {
          var related = e.relatedTarget;
          if (_doiTipEl && related && _doiTipEl.contains(related)) return;
          hideDOITip();
        });
      });
    });

    document.addEventListener('scroll', function () {
      if (_doiTipEl) _doiTipEl.classList.remove('ws-doi-tip-visible');
    }, { passive: true });
  }

// src/ui/regex.js — Regex search parsing, matching and highlight wiring.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

  function parseRegexInput(raw) {
    var value = String(raw || '').trim();
    if (!value) return null;
    var m = value.match(/^\/(.*)\/([dgimsuy]*)$/);
    var src;
    var flags;
    if (m) {
      src = m[1];
      flags = m[2] || '';
    } else {
      src = value;
      flags = 'i';
    }
    if (flags.indexOf('g') === -1) flags += 'g';
    return new RegExp(src, flags);
  }

  function clearRegexMatches(root) {
    root.querySelectorAll('.ws-regex-match').forEach(function (span) {
      var parent = span.parentNode;
      if (!parent) return;
      while (span.firstChild) {
        parent.insertBefore(span.firstChild, span);
      }
      parent.removeChild(span);
      parent.normalize();
    });
  }

  function normalizeBlockBounds(text, start, end) {
    while (start < end && /\s/.test(text.charAt(start))) start += 1;
    while (end > start && /\s/.test(text.charAt(end - 1))) end -= 1;
    return [start, end];
  }

  function getSentenceBlocks(text) {
    var src = String(text || '');
    var blocks = [];
    var re = /[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g;
    var m;
    while ((m = re.exec(src)) !== null) {
      var start = m.index;
      var end = m.index + m[0].length;
      var bounds = normalizeBlockBounds(src, start, end);
      if (bounds[1] > bounds[0]) blocks.push({ start: bounds[0], end: bounds[1] });
    }
    return blocks;
  }

  function findRegexRangesInBlocks(text, re, blocks) {
    var src = String(text || '');
    var ranges = [];
    (blocks || []).forEach(function (block) {
      var start = Math.max(0, Number(block.start) || 0);
      var end = Math.min(src.length, Number(block.end) || 0);
      if (end <= start) return;
      var segment = src.slice(start, end);
      re.lastIndex = 0;
      var m;
      while ((m = re.exec(segment)) !== null) {
        if (!m[0]) {
          re.lastIndex += 1;
          continue;
        }
        ranges.push([start + m.index, start + m.index + m[0].length]);
      }
    });
    return ranges;
  }

  function mergeRanges(ranges) {
    if (!ranges || !ranges.length) return [];
    var sorted = ranges.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    var out = [sorted[0].slice()];
    for (var i = 1; i < sorted.length; i++) {
      var last = out[out.length - 1];
      var cur = sorted[i];
      if (cur[0] <= last[1]) last[1] = Math.max(last[1], cur[1]);
      else out.push(cur.slice());
    }
    return out;
  }

  function textNodesWithOffsets(root) {
    var nodes = [];
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var offset = 0;
    var node;
    while ((node = walker.nextNode())) {
      var txt = node.textContent || '';
      var len = txt.length;
      if (!len) continue;
      nodes.push({ node: node, start: offset, end: offset + len });
      offset += len;
    }
    return nodes;
  }

  function resolveTextOffset(nodes, pos) {
    for (var i = 0; i < nodes.length; i++) {
      if (pos <= nodes[i].end) {
        return { node: nodes[i].node, offset: Math.max(0, pos - nodes[i].start) };
      }
    }
    if (!nodes.length) return null;
    var last = nodes[nodes.length - 1];
    return { node: last.node, offset: (last.node.textContent || '').length };
  }

  function highlightRegexRangesInParagraph(p, ranges, title) {
    var merged = mergeRanges(ranges);
    if (!merged.length) return 0;
    var map = textNodesWithOffsets(p);
    if (!map.length) return 0;
    var total = 0;
    for (var i = 0; i < map.length; i++) {
      var entry = map[i];
      var text = entry.node.textContent || '';
      if (!text) continue;
      var local = [];
      for (var j = 0; j < merged.length; j++) {
        var s = Math.max(merged[j][0], entry.start);
        var e = Math.min(merged[j][1], entry.end);
        if (e > s) local.push([s - entry.start, e - entry.start]);
      }
      if (!local.length) continue;
      var frag = document.createDocumentFragment();
      var pos = 0;
      for (var k = 0; k < local.length; k++) {
        if (local[k][0] > pos) frag.appendChild(document.createTextNode(text.slice(pos, local[k][0])));
        var span = document.createElement('span');
        span.className = 'ws-regex-match';
        markReason(span, 'regex', title || L.regexSearch);
        span.textContent = text.slice(local[k][0], local[k][1]);
        frag.appendChild(span);
        pos = local[k][1];
        total += 1;
      }
      if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
      entry.node.parentNode.replaceChild(frag, entry.node);
    }
    return total;
  }

  function wireRegexSearch(metrics, root) {
    var block = metrics.querySelector('[data-ws-regex-block]');
    if (!block) return;
    var input = block.querySelector('.ws-doc-regex-input');
    var applyBtn = block.querySelector('.ws-doc-regex-apply');
    var clearBtn = block.querySelector('.ws-doc-regex-clear');
    var scopeWrap = block.querySelector('.ws-doc-regex-scope');
    var scopeParagraph = block.querySelector('.ws-doc-regex-scope-paragraph');
    var scopeSentence = block.querySelector('.ws-doc-regex-scope-sentence');
    var countEl = block.querySelector('.ws-doc-regex-count');

    function updateScopeVisibility() {
      var raw = String(input.value || '');
      var show = raw.indexOf('^') !== -1 || raw.indexOf('$') !== -1;
      if (scopeWrap) scopeWrap.classList.toggle('ws-doc-regex-scope-hidden', !show);
    }

    function setCount(value) {
      countEl.textContent = value + ' ' + L.regexMatches;
    }

    function applyRegex() {
      clearRegexMatches(root);
      document.body.classList.remove('ws-focus-regex');
      block.classList.remove('ws-doc-regex-invalid');
      var raw = input.value || '';
      if (!raw.trim()) {
        setCount(0);
        refreshHighlightTooltips(document);
        return;
      }
      var re;
      try {
        re = parseRegexInput(raw);
      } catch (e) {
        block.classList.add('ws-doc-regex-invalid');
        countEl.textContent = L.regexInvalid;
        return;
      }
      if (!re) {
        setCount(0);
        refreshHighlightTooltips(document);
        return;
      }
      var total = 0;
      root.querySelectorAll('.ws-wrapper > p').forEach(function (p) {
        var text = p.textContent || '';
        var blocks = [];
        var useParagraph = scopeParagraph && scopeParagraph.checked;
        var useSentence = scopeSentence && scopeSentence.checked;
        if (!useParagraph && !useSentence) useParagraph = true;
        if (useParagraph) {
          var bounds = normalizeBlockBounds(text, 0, text.length);
          if (bounds[1] > bounds[0]) blocks.push({ start: bounds[0], end: bounds[1] });
        }
        if (useSentence) {
          blocks = blocks.concat(getSentenceBlocks(text));
        }
        var ranges = findRegexRangesInBlocks(text, re, blocks);
        total += highlightRegexRangesInParagraph(p, ranges, L.regexSearch + ': ' + raw);
      });
      setCount(total);
      if (total > 0) document.body.classList.add('ws-focus-regex');
      refreshHighlightTooltips(document);
    }

    function clearRegex() {
      clearRegexMatches(root);
      input.value = '';
      setCount(0);
      block.classList.remove('ws-doc-regex-invalid');
      document.body.classList.remove('ws-focus-regex');
      updateScopeVisibility();
      refreshHighlightTooltips(document);
    }

    applyBtn.addEventListener('click', applyRegex);
    clearBtn.addEventListener('click', clearRegex);
    input.addEventListener('input', function () {
      updateScopeVisibility();
    });
    input.addEventListener('keydown', function (evt) {
      if (evt.key === 'Enter') {
        evt.preventDefault();
        applyRegex();
      }
    });
    updateScopeVisibility();
  }

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
      metricItem(L.termVariants, termVariants.length ? termVariants.slice(0, 3).map(function (x) { return x.forms.slice(0, 2).join('/'); }).join(', ') : '0', null, L.termVariantsDesc) +
      metricItem(L.unitConsistency, unitInconsistency.length ? unitInconsistency.join('; ') : '0', null, L.unitConsistencyDesc) +
      metricItem(L.undefinedAcronyms, undefinedAcronyms.length ? undefinedAcronyms.slice(0, 4).map(function (x) { return x.acronym + ' \xd7' + x.count; }).join(', ') : '0', null, L.undefinedAcronymsDesc) +
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
      metricItem(L.emphaticPunct, emphaticPunct, null, L.emphaticPunctDesc) +
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
      metricItem(L.nlpSentencePatternRepeats, nlpTotals.sentencePatternRepeatCount, null, L.nlpSentencePatternRepeatsDesc) +
      metricItem(L.nlpSemanticRedundancy, nlpSemanticRedundancy + '%', null, L.nlpSemanticRedundancyDesc) +
      metricItem(L.nlpFlowScore, nlpFlowScore + '%', null, L.nlpFlowScoreDesc) +
      metricItem(L.nlpTermDrift, nlpTotals.termDriftCount, null, L.nlpTermDriftDesc) +
      metricItem(L.nlpTenseProfile, nlpTenseProfileText, null, L.nlpTenseProfileDesc) +
      (LANG === 'en' ? metricItem(L.nlpContractions, nlpTotals.contractionCount, null, L.nlpContractionsDesc) : '') +
      metricItem(L.nlpQuestions, nlpTotals.questionCount, null, L.nlpQuestionsDesc) +
      metricItem(L.nlpNounVerbRatio, round1(nlpNounVerbRatio), null, L.nlpNounVerbRatioDesc) +
      metricItem(L.nlpVerbDiversity, round1(nlpVerbDiversity * 100) + '%', null, L.nlpVerbDiversityDesc) +
      metricItem(L.nlpKeyTerms, nlpKeyTerms.length ? nlpKeyTerms.join(', ') : '0', null, L.nlpKeyTermsDesc) +
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

// src/ui/focus.js — Focus/dim interaction for margin notes.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

  // ── Focus mode ─────────────────────────────────────────────────────────────

  function addFocusMode(allWrappers) {
    allWrappers.forEach(function (w) {
      var note = w.querySelector('.ws-note');
      if (!note) return;
      note.addEventListener('mouseenter', function () {
        allWrappers.forEach(function (other) {
          if (other !== w) other.classList.add('ws-dimmed');
        });
      });
      note.addEventListener('mouseleave', function () {
        allWrappers.forEach(function (other) { other.classList.remove('ws-dimmed'); });
      });
    });
  }

// src/ui/controls.js — Floating controls for annotation visibility, filters and report export.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

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
    if (typeof initSpellingSourceControls === 'function') initSpellingSourceControls(box);
    document.body.appendChild(box);

    document.body.classList.toggle('ws-alerts-only', alertsOnly);
    alertBtn.classList.toggle('ws-control-on', alertsOnly);
  }

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
    var spellcheckJobs = [];

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
        if (LANG === 'en' && WINK_NLP && nlpStats && nlpStats.passiveSentenceCount > 0) highlightWinkPassiveSentences(p);
        // highlightPatternInNode must run before highlightNlpWeakVerbs: weak verb highlighting
        // fragments auxiliary verbs (was/were/been) into individual spans, breaking the passive
        // regex which needs to match "auxiliary + past participle" as a continuous text node.
        if (passiveCount > 0)       highlightPatternInNode(p, PASSIVE_PATTERNS, 'ws-passive');
        if (nlpStats.weakVerbCount > 0) highlightNlpWeakVerbs(p);
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
        if (SPELLCHECK_ENABLED) {
          spellcheckJobs.push(highlightSpelling(p, text).catch(function (err) {
            console.warn('[scientific-writing] spellcheck paragraph failed', err);
            return 0;
          }));
        }

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
    if (spellcheckJobs.length) {
      if (loadingPill) loadingPill.textContent = L.spellcheckPreparing || 'checking spelling...';
      await Promise.all(spellcheckJobs);
    }
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
})();
