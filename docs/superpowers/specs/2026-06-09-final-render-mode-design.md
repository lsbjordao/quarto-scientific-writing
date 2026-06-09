# Final / published render mode — design

**Date:** 2026-06-09
**Status:** approved (conversation), pending implementation

## Problem

The `scientific-writing` filter injects the full review UI into **every** HTML
render: `scientific-writing.js` (~364 KB), `wink-bundle.min.js` (~3.6 MB),
`scientific-writing.css` (~52 KB), plus inline highlights, margin notes, and the
metrics panel. That is the intended experience while drafting, but the final,
published artifact (sent to readers, a journal, a website) should be a clean,
lightweight HTML with none of the review machinery.

Today the only way to get a clean output is to delete the `- scientific-writing`
line from the YAML before the final render and add it back afterwards. The
in-browser "Final review" button merely *hides* highlights — the 4 MB payload is
still embedded.

## Goal

Let the author produce a clean published HTML without editing the document body,
and keep the default (review on) unchanged.

## Design

### 1. New option

```yaml
scientific-writing:
  review: true   # default; false → do not inject the review UI
```

### 2. Lua filter behaviour when `review: false`

- Skip the in-`<head>` config `<script>` and the NLP CDN preload.
- Skip `quarto.doc.add_html_dependency` (so the HTML never references the JS/CSS,
  and therefore never pulls `wink-bundle.min.js`).
- Skip the render-time DOI/CrossRef network calls (useless without the UI).
- Skip wrapping `{{< var >}}` shortcodes in `<span class="ws-var-origin">`
  (consumed only by the UI) so the published HTML carries no extension markup.

When `review: true` (default) everything behaves exactly as today.

### 3. Filter structure

Pandoc applies block/inline functions **before** `Meta` within a single filter,
so a flag set in `Meta` is not visible to `Para`/`Plain`. To gate the var-marking
correctly, return a two-pass filter list:

```lua
return {
  { Meta  = ... },             -- pass 1: read review flag, inject (or not)
  { Para  = ..., Plain = ... } -- pass 2: mark vars only when review is on
}
```

Pass 1 sets a file-local `REVIEW_ENABLED`; pass 2 reads it. Sequential passes
guarantee the order.

### 4. Trigger in daily use

- Drafting/review: `quarto render` → UI on (default).
- Final: `quarto render --profile publish`. The author never edits the `.qmd`.

**How the profile is detected (revised after testing).** The original plan was to
set `scientific-writing.review: false` in `_quarto-publish.yml` and read it from
merged metadata. Testing showed a document-level `scientific-writing:` block
**shadows** the project/profile value (no deep merge), and project-level top-level
custom keys do not reach the filter `meta` either. The reliable signal is the
`QUARTO_PROFILE` environment variable, which Quarto exports to filters and which
correctly reads `publish` under `--profile publish`. So the filter detects the
profile **by name**: if `publish` is among the active profiles, the review UI is
off. `_quarto-publish.yml` still exists (it must be a non-empty mapping, or Quarto's
profile merge errors) and carries `review: false` as a documented fallback for
documents that do not define their own `scientific-writing:` block.

### 5. No JS change

If the UI is not loaded, the bundle needs no knowledge of `review`. No rebuild of
`scientific-writing.js` / `wink-bundle.min.js`.

## Files

- `scientific-writing.lua` — read flag; `publish_profile_active()` via
  `QUARTO_PROFILE`; early-return in `Meta` skips injection; two-pass structure
  gates var-marking.
- `_quarto-publish.yml` — new publish profile (non-empty mapping required).
- `README.md` — new "Final / published render" section + `review:` in the YAML
  reference, matching the existing manual style.

## Verification (done)

1. `quarto render article-en.qmd` (default) → `scientific-writing.js` referenced
   (38×), `WritingStatsConfig`, and `ws-var-origin` spans present. ✅
2. `quarto render article-en.qmd --profile publish` → output references neither
   `scientific-writing.js` nor `wink-bundle.min.js`, no `WritingStatsConfig`, no
   `ws-var-origin` spans. ✅
3. Document-level `scientific-writing.review: false` → same clean output. ✅
4. A comment-only `_quarto-publish.yml` makes Quarto's profile merge error — the
   file must contain a real mapping. ✅ (fixed)

## Out of scope

- Disabling per-feature at render (only the whole UI toggles).
- Any change to the in-browser controls.
