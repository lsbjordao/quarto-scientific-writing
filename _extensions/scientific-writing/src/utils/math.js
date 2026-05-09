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
