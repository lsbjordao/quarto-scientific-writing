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
