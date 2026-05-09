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
