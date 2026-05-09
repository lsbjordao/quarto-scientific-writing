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
