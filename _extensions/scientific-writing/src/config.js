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
