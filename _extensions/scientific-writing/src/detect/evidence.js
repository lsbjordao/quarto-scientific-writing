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
