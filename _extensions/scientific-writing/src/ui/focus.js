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
