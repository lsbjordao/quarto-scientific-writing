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
