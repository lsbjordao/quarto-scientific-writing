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
