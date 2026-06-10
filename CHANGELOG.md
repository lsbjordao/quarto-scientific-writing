# Changelog

All notable changes to this project are documented here. This project adheres to
[Semantic Versioning](https://semver.org/).

## v1.0.0 — 2026-06-09

First public release of **scientific-writing**, a Quarto extension that turns a
rendered HTML manuscript into an in-browser writing reviewer. It runs entirely in
the reader's browser and annotates the document with style, structure, and
linguistic diagnostics to help you write cleaner, more rigorous scientific prose.

### Highlights

- **Inline highlights** — long sentences, passive voice, hedging language,
  nominalizations, repeated words, connectors, colloquialisms, wordy phrases,
  vague quantifiers, undefined acronyms, and optional spelling issues.
- **Per-paragraph margin notes** — word/sentence counts, lexical diversity,
  passive density, and readability for every paragraph.
- **Per-section summary** — section-level scoring and concept-coverage tracking.
- **Document Analysis card** — an always-visible overview with a structured text
  profile (sentences, paragraphs, readability, style, evidence) plus key issues
  and notices, each with actionable suggestions.
- **Metrics panel** — 70+ document-level counters, grouped and collapsible:
  sentences, paragraphs, readability, vocabulary, voice, connectors, citations,
  evidence, and NLP diagnostics.
- **Search & Select** — regex search with paragraph/sentence scope.
- **Focus mode** — click any metric to isolate the paragraphs that match it.
- **Markdown report export** — download a full report of every metric.
- **Bilingual** — full Portuguese and English support, auto-detected from
  `lang:` in the YAML front matter.

### Analysis features

- **NLP integration** — optional [compromise.js](https://compromise.cool/) (via
  CDN) and bundled [wink-nlp](https://winkjs.org/) for deeper linguistic
  analysis: entities, topics, tense profiling, POS-based noun stacks, weak verbs,
  Flesch reading ease, grade level, and more.
- **Citation & reference checking** — detects in-text `@key` citations, undefined
  keys, and unused references by reading `ref.bib`.
- **Figure & table cross-references** — coverage (referenced vs. total) and
  out-of-order reference detection.
- **Numeric evidence tracking** — distinguishes cited from hard-coded values and
  parameterized (`_variables.yml`) from unparameterized numbers.
- **`_variables.yml` integration** — tracks `{{< var >}}` usage and reports
  unused variables and undefined shortcodes.
- **DOI validation (opt-in)** — validates each DOI in `ref.bib` against the
  CrossRef API at render time, comparing title, year, authors, journal, volume,
  and pages.

### Install

```bash
quarto add lsbjordao/quarto-scientific-writing
```

```yaml
---
title: "My Manuscript"
lang: en-US
format:
  html:
    theme: cosmo
filters:
  - scientific-writing
---
```

The extension activates on HTML output only, with sensible defaults — no
configuration required to get started. See the README for the full YAML
reference.

### Drafting vs. publishing

The review UI is meant for use while you write. For the final published artifact
you can produce a clean, lightweight HTML with none of the review machinery:

```bash
quarto render --profile publish
```

The bundled `_quarto-publish.yml` activates the `publish` profile, which the
filter detects by name and uses to skip all injection (no script, no stylesheet,
no markup, and no render-time DOI calls). You can also set
`scientific-writing.review: false` in a single document's front matter.

### Privacy & network

Most analysis runs locally in the browser. Three optional features reach external
services — review them before publishing:

- **NLP (compromise.js)** — *on by default*; loads a script from a CDN.
- **DOI validation** — *off by default*; sends each DOI to `api.crossref.org`.
- **Spellcheck** — *off by default*; sends paragraph text to a LanguageTool
  endpoint.

### Requirements & notes

- Quarto ≥ 1.3.0; HTML output only.
- The optional "connect source" spellcheck control needs the File System Access
  API and is shown only in Chromium-based browsers (Chrome/Edge).
- Licensed under the MIT License.
