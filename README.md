<p align="center">
  <img src="logo.png" alt="scientific-writing logo" width="500">
</p>

# scientific-writing

A Quarto extension that provides real-time, in-browser analysis of academic manuscripts. It annotates your rendered HTML document with style, structure, and linguistic diagnostics — helping you write cleaner, more rigorous scientific prose.

## Features

- **Inline highlights** — long sentences, passive voice, hedging language, nominalizations, repeated words, connectors, colloquialisms, wordy phrases, optional spelling issues, and more
- **Per-paragraph notes** — metrics sidebar for every paragraph (word count, sentence count, lexical diversity, passive density, readability)
- **Per-section summary** — section-level scoring and concept-coverage tracking
- **Document Analysis card** — always-visible overview with a structured text profile (sentences, paragraphs, readability, style, evidence) plus key issues and notices
- **Metrics panel** — full suite of document-level counters, grouped and collapsible, covering sentences, paragraphs, readability, vocabulary, voice, connectors, citations, evidence, and NLP diagnostics
- **Search & Select** — regex search with paragraph/sentence scope
- **Focus mode** — click any metric to isolate matching paragraphs
- **Export** — download a Markdown report of all metrics
- **Bilingual** — full Portuguese and English support (auto-detected from `lang:` in YAML)
- **NLP integration** — optional compromise.js and wink-nlp for deeper linguistic analysis

## Installation

Install the extension into your Quarto project:

```bash
quarto add lsbjordao/quarto-scientific-writing
```

## Minimal usage

Add the filter to your document's YAML front matter:

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

The extension activates automatically on HTML output only. No configuration is required to get started — all options have sensible defaults.

## YAML Configuration reference

All options are nested under the `scientific-writing:` key in your front matter.

```yaml
scientific-writing:
  # ── Thresholds ──────────────────────────────────────────────────────────────

  sentence-long: 30
  # Words above which a sentence is flagged as "long".
  # Default: 30. Sentences above this threshold are highlighted and counted.

  paragraph-long: 150
  # Words above which a paragraph is flagged as "long".
  # Default: 150. Long paragraphs receive a red left border.

  passive-threshold: 3
  # Number of passive constructions per paragraph that triggers an alert
  # in non-Methods sections. Default: 3.

  methods-passive-threshold: 5
  # Same threshold, but applied to sections identified as Materials & Methods.
  # A higher limit is used because passive is expected in methods writing.
  # Default: 5.

  lexical-diversity-low: 0.50
  # Lexical diversity ratio (unique words / total words) below which a
  # paragraph is considered lexically weak. Default: 0.50 (50%).

  repeated-strong: 3
  # Minimum number of occurrences of a word within a paragraph for it to be
  # highlighted as a "strong repetition". Default: 3.

  hedge-threshold: 4
  # Number of hedging expressions per paragraph that triggers an alert.
  # Hedges: "may", "might", "possibly", "appears to", "seems to", etc.
  # Default: 4.

  # ── Section goals (per-section thresholds) ──────────────────────────────────

  section-goals:
    Abstract:
      maxAvgSentence: 24        # Maximum average sentence length (words)
      maxLongSentenceRate: 18   # Maximum % of sentences above sentence-long
    Materials and Methods:
      maxPassivePer1000: 30     # Maximum passive constructions per 1 000 words
    Discussion:
      minLexicalDiversity: 0.58 # Minimum lexical diversity ratio (0–1)
  # Section goals override document-level thresholds for specific sections.
  # Match section names exactly as they appear in the headings (case-insensitive).
  # Available goal keys:
  #   maxAvgSentence         — max average words per sentence
  #   maxLongSentenceRate    — max % of long sentences
  #   maxPassivePer1000      — max passive count per 1 000 words
  #   minLexicalDiversity    — minimum lexical diversity (0–1)

  # ── Connector ambiguity ─────────────────────────────────────────────────────

  connector-ambiguity-mode: strict
  # How ambiguous words (e.g., "as", "since", "while") are treated when
  # deciding whether they function as connectors.
  # Values:
  #   strict   — only count as connectors in clearly unambiguous positions
  #   balanced — moderate; count in most positions (default in lenient contexts)
  #   lenient  — always count as connectors
  # Default: "strict".

  connector-ambiguity-overrides:
    as: strict
    then: balanced
    since: lenient
  # Per-word overrides for connector-ambiguity-mode.
  # Map each ambiguous word to its own mode, independent of the global setting.

  # ── Vocabulary exclusions ────────────────────────────────────────────────────

  ignore-terms:
    - bean
    - phaseolus
    - vulgaris
  # List of words (case-insensitive) to exclude from repetition detection.
  # Use for domain-specific terminology that is necessarily repeated.
  # These terms are also ignored by the optional spellchecker.

  # ── Spellcheck ──────────────────────────────────────────────────────────────

  spellcheck: false
  # Enable API-backed spellcheck underlines.
  # Default: false, because enabling it sends paragraph text to the configured
  # provider from the reader's browser.

  spellcheck-provider: languagetool
  # Currently supported provider: languagetool.

  spellcheck-endpoint: "https://api.languagetool.org/v2/check"
  # LanguageTool-compatible HTTP endpoint. You can point this to a self-hosted
  # LanguageTool instance if you do not want to use the public service.

  spellcheck-language: pt-BR
  # LanguageTool language code. If omitted, the extension derives pt-BR/en-US
  # from the document's <html lang="...">.

  spellcheck-ignore-terms:
    - Phaseolus
    - cultivar
    - SPAD
  # Case-insensitive terms to ignore only for spelling checks. This is useful
  # for scientific names, acronyms, cultivar names, software names, and jargon.

  spellcheck-timeout-ms: 8000
  # Request timeout per paragraph. Default: 8000.

  # ── DOI validation (CrossRef) ────────────────────────────────────────────────

  doi-validation: false
  # Validate each DOI in `ref.bib` against the CrossRef API *at render time*.
  # When enabled, the Lua filter runs `curl` to https://api.crossref.org for
  # every entry that has a `doi` field, comparing title, year, authors, journal,
  # volume, and pages against the registered metadata, and reports mismatches.
  # Default: false, because it requires network access during rendering, slows
  # the build, and sends each DOI to an external service.

  # ── Output mode ──────────────────────────────────────────────────────────────

  review: true
  # Master switch for the review UI. When false, the filter injects no script,
  # no stylesheet, and no extension markup — producing a clean published HTML.
  # Default: true. See "Final / published render" below for the recommended
  # profile-based workflow that does not require editing the document.

  # ── Display defaults ─────────────────────────────────────────────────────────

  default-compact: false
  # Start the metrics panel in compact (collapsed) mode.
  # Default: false (panel starts expanded).

  default-alerts-only: false
  # Start in "alerts only" mode, hiding non-critical annotations.
  # Default: false (all annotations visible).

  # ── NLP (compromise.js) ──────────────────────────────────────────────────────

  nlp-cdn: true
  # Load compromise.js from a CDN for deeper NLP analysis.
  # Disabling this turns off entity recognition, topic extraction,
  # adverb detection, tense profiling, and flow scoring.
  # Default: true.

  nlp-cdn-url: "https://cdn.jsdelivr.net/npm/compromise/builds/compromise.min.js"
  # CDN URL for the compromise.js library.
  # Override to use a self-hosted copy or a specific version.
```

### `_variables.yml` integration

If your project uses a `_variables.yml` file (Quarto's variable substitution), the extension automatically detects it and uses its numeric values to:

- Track which `{{< var name >}}` shortcodes appear in the text
- Distinguish parameterized evidence (values from variables) from hard-coded numbers
- Report unused variables and undefined shortcodes

No extra configuration is needed — the Lua filter reads the file at render time.

### `ref.bib` integration

If a `ref.bib` file exists at the project root, the extension reads its citation keys and uses them to:

- Detect in-text citations (`@key`)
- Identify undefined citation keys (used in text but not in the bibliography)
- Report unused references (defined but never cited)

## Privacy & network

Most analysis runs entirely in the reader's browser with no network access. Three
optional features reach external services — review them before publishing:

| Feature | Default | What leaves the machine | How to disable |
| --- | --- | --- | --- |
| NLP (compromise.js) | **on** | Loads a script from a CDN into the reader's browser | `nlp-cdn: false` (or self-host via `nlp-cdn-url`) |
| DOI validation | off | Each DOI in `ref.bib` is sent to `api.crossref.org` **at render time** | leave `doi-validation` unset/`false` |
| Spellcheck | off | Paragraph text is sent to a LanguageTool endpoint from the reader's browser | leave `spellcheck` unset/`false` |

By default the compiled JavaScript and CSS are injected into **every** HTML output,
and the bundle is sizeable (`wink-bundle.min.js` is ~3.6 MB). The extension is a
drafting aid, so for the final published artifact you usually want a clean output
with none of the review machinery — see the next section.

## Final / published render

The extension is meant for use while you write and revise. For the version you ship
to readers (a journal, a website, a colleague) you typically want a clean,
lightweight HTML without the highlights, the metrics panel, or the ~4 MB of
JavaScript. The in-browser "Final review" button only *hides* the highlights; the
payload is still embedded. To leave it out entirely, turn the review UI off.

**Recommended — a publish profile (no document edits):**

```bash
quarto render --profile publish
```

The bundled `_quarto-publish.yml` activates the `publish` profile, and the filter
detects it by name (via the `QUARTO_PROFILE` environment variable Quarto exports)
and injects nothing — no script, no stylesheet, no extension markup. Your everyday
`quarto render` keeps the full review UI. Name additional profiles whatever you
like; only `publish` switches the extension off.

**Alternative — per document:**

```yaml
scientific-writing:
  review: false
```

Set this in a document's front matter to keep that one file clean regardless of how
it is rendered.

When the review UI is off, the filter also skips the render-time DOI/CrossRef
network calls, since they only feed the UI.

## How it works

### Runtime flow

1. **Quarto renders** the `.qmd` file to HTML using Pandoc.
2. The **Lua filter** (`scientific-writing.lua`) runs during rendering and:
   - Injects a `<script>` block with `window.WritingStatsConfig` containing all YAML options
   - Adds the compiled `scientific-writing.js` and `scientific-writing.css` as HTML dependencies
   - Reads `_variables.yml` and `ref.bib` for variable and reference data
3. **In the browser**, `scientific-writing.js` runs on `DOMContentLoaded` and:
   - Scans all `<section>` elements and their `<p>` children
   - Runs synchronous analysis on each paragraph (sentence splitting, passive detection, repetition, etc.)
   - Optionally loads compromise.js and wink-nlp for NLP-powered checks
   - Injects highlights, margin notes, section summaries, the metrics panel, and the Document Analysis card

### Key architectural note

`scientific-writing.js` is a **bundled runtime file** — it is the output of the build process and is what the browser actually loads. It must exist alongside `scientific-writing.lua` in the extension directory. The `src/` directory contains the development source modules; after any edit, run the build script to regenerate the bundle.

## Building from source

Source files live in `_extensions/scientific-writing/src/`. They are concatenated (not bundled with a module bundler) in dependency order by the build script.

```bash
cd _extensions/scientific-writing/build
node build-scientific-writing.mjs
```

This reads all modules listed in `build-scientific-writing.mjs`, concatenates them, wraps the result in an IIFE (`(function () { 'use strict'; ... })();`), and writes `scientific-writing.js`.

After building, copy the updated file to the article's lib folder if you are working with a pre-rendered HTML file (the version segment matches `version:` in `_extension.yml`):

```bash
cp ../scientific-writing.js \
   ../../../<article>_files/libs/quarto-contrib/scientific-writing-<version>/scientific-writing.js
```

wink-nlp is bundled separately via esbuild (see `build/build.mjs`), producing `wink-bundle.min.js`.

## Source module reference

### `src/config.js`

Reads `window.WritingStatsConfig` (injected by the Lua filter) and exposes all threshold constants and runtime flags used throughout the extension. Key exports: `PARA_LONG`, `SENT_LONG`, `PASSIVE_ALERT`, `HEDGE_ALERT`, `LEX_LOW`, `REPEATED_STRONG`, `SECTION_GOALS`, `EXCLUDED_TERMS`, `LANG`, `CONNECTOR_AMBIGUITY_MODE`, and optional spellcheck settings.

### `src/lang/pt.js` and `src/lang/en.js`

String tables for Portuguese and English UI labels. Every user-visible string is defined here, including card titles, metric names, tooltip text, and issue descriptions. The active table is selected in `src/lang/index.js` based on `LANG`.

### `src/utils/text.js`

Low-level text utilities:
- `getSentences(text)` — splits text into sentences
- `countWords(text)` — word count
- `countSyllablesText(text)` — syllable counting (used for readability formulas)
- `escapeHTML(s)` — HTML-escapes a string for safe injection
- `getLexDiv(text)` — lexical diversity ratio (unique / total words)
- `countFirstPerson(text)` — counts first-person pronouns
- `countEmphaticPunctuation(text)` — counts `!` and `?` outside expected contexts

### `src/utils/math.js`

Statistical helpers: `mean(arr)`, `variance(arr)`, `round1(n)` (one decimal place).

### `src/detect/style.js`

Pattern-based style checks:
- `countHedges(text)` — hedging language (may, might, possibly, appears to…)
- `countWordyPhrases(text)` — wordy multi-word phrases with concise alternatives
- `countComplexSentences(sentences)` — sentences with embedded subordinate clauses
- `countVagueQuantifiers(text)` — unquantified vague terms (many, several, numerous…)
- `countColloquialisms(text)` — informal/colloquial expressions
- `getUndefinedAcronyms(sentences)` — acronyms used before being defined

### `src/detect/passive.js`

Passive voice and related structural checks:
- `countPassive(text)` — passive voice constructions (regex-based, PT and EN)
- `countNominalizations(text)` — noun forms derived from verbs (-tion, -ment, -ance…)
- `getVerbRegex()` / `countNoVerbSentences(sentences)` — sentences lacking a clear verb
- `countConnectors(text)` — total connector count (delegates to connectors module)
- `getCrossRepeated(paraTexts)` — words repeated across paragraphs within a section

### `src/detect/connectors.js` and `src/detect/connectors-taxonomy.js`

Connector detection with full categorical breakdown:
- `getConnectorTerms()` — full list of recognized connectors
- `countConnectors(text)` — total connector count
- `countConnectorCategories(text)` — breakdown by category: `add`, `contrast`, `cause`, `conclusion`, `time`

Taxonomy defines ~150 connectors per language, grouped by rhetorical function, with per-word ambiguity modes that interact with `connector-ambiguity-mode`.

### `src/detect/vocabulary.js`

Vocabulary-level checks:
- `getGlobalRepeatedItems(text, minCount, minLen)` — most-repeated terms across the whole document
- `getIntraRepeated(text)` — words repeated within a single paragraph
- `getParaOpeningRepeats(paraTexts)` — paragraphs starting with the same word
- `getTerminologyVariants(text)` — detects variant spellings of the same term (e.g., "behavior"/"behaviour")
- `getUnitInconsistency(text)` — mixed unit systems (e.g., "kg" and "g/kg" without standardization)

### `src/detect/sections.js`

Section identification helpers:
- `isMethodsTitle(title)` — recognizes Methods / Materials & Methods headings
- `isIntroductionTitle(title)` — recognizes Introduction headings
- `isDiscussionTitle(title)` / `isResultsTitle(title)` — recognizes Discussion / Results headings
- `getSectionBalance(sections)` — computes coefficient of variation (CV) across section lengths and identifies outlier sections

### `src/detect/citations.js`

Citation-level analysis:
- `citationStatsForElement(p)` — extracts all `@key` citation markers from a paragraph element
- `countCitationSentStart(sentences)` — sentences that open with a citation
- `countCitationSentEnd(sentences)` — sentences that end with a citation (good practice)
- `countCohesionGaps(paraTexts)` — consecutive paragraphs where the second lacks a connector opening

### `src/detect/references.js`

Bibliography cross-checking:
- `getReferenceUsage(root)` — compares `@key` citations found in text against `ref.bib` keys; returns used, unused, and undefined references

### `src/detect/crossrefs.js`

Figure and table cross-reference tracking:
- `getCrossRefUsage(root)` — counts figures and tables, checks that each is referenced in text, and detects out-of-order references

### `src/detect/evidence.js`

Numeric evidence tracking:
- `countEvidenceDetailed(root, docText)` — distinguishes cited evidence (numbers near `@key`) from hard-coded values, and parameterized values (from `_variables.yml`) from unparameterized ones
- `highlightEvidenceInParagraph(p)` — wraps evidence numbers in highlight spans
- `getVariableUsage(root)` — reports which variables from `_variables.yml` are actually used in the text

### `src/detect/nlp/compromise.js`

Wraps compromise.js for deeper NLP analysis:
- `analyzeScientificNlp(text, sentences)` — extracts topics, entities (people, places, organizations), adverbs, key terms, nominal load, weak verbs, noun stacks, action verb score, semantic redundancy, flow score, tense profile, contractions, and questions
- `analyzeWinkNlp(text)` — (delegates to wink module) wink-nlp-powered metrics

### `src/detect/nlp/wink.js`

Wraps wink-nlp (bundled separately as `wink-bundle.min.js`):
- `ensureWinkEngine()` — loads wink-nlp asynchronously
- `analyzeWinkNlp(docText)` — Flesch reading ease, grade level, complex word density, modal verbs, pronouns, auxiliaries, numeric tokens, proper nouns, lexical density, passive sentences, POS-based noun stacks, verb lemma diversity

### `src/analysis/readability.js`

- `computeReadability(words, sentences, syllables, complexWords)` — computes Flesch Reading Ease, Flesch-Kincaid Grade Level, and Gunning Fog Index

### `src/analysis/paragraph.js`

Per-paragraph analysis orchestration:
- `analyzeParagraphSync(text)` — runs all synchronous checks on a single paragraph
- `analyzeParagraphsAsync(paraTexts)` — batches paragraph analysis, using a Web Worker when available, falling back to sync
- `hasParagraphAlert(stats, inMethods)` — determines whether a paragraph should receive an alert badge
- `getAbstractWordCount(sections)` / `getAbstractCoverage(sections)` — evaluates the abstract's coverage of key document concepts

### `src/analysis/section.js`

Per-section aggregation:
- `sectionSummary(id, title, statsList, words, text)` — builds a section-level stats object from paragraph stats, including aggregate scores, concept coverage, passive distribution, and section type flags

### `src/analysis/document.js`

Document-level orchestration and metrics panel construction:
- `buildDocStats(root, totalWords, statsList, sections, docText, winkStats)` — the main function that aggregates all paragraph and section stats, computes document-level metrics (70+), builds the metrics panel HTML, inserts it into the DOM, and then inserts the Document Analysis card as a separate always-visible element below the panel
- `buildControls()` / `wireMetricGroups()` / `wireMetricFocus()` — UI wiring for the floating controls bar, collapsible metric groups, and focus-mode click handlers

### `src/ui/highlight-core.js`

Core highlight injection:
- `highlightPatternInNode(p, patterns, cls)` — walks text nodes and wraps regex matches in `<span>` elements with the given CSS class
- `highlightInNode(p, wordSet, cls)` — highlights whole words from a set
- `markReason(span, type, title)` — attaches tooltip data to a highlight span
- `refreshHighlightTooltips(root)` — rebuilds the consolidated tooltip title for each paragraph

### `src/ui/highlights.js`

Pattern-specific highlight wrappers:
- `wrapLongSentences(p, threshold)` — wraps sentences above the length threshold
- `wrapNoVerbSentences(p)` — wraps sentences lacking a clear finite verb
- `highlightComplexSentences(p)` — highlights multi-clause sentences
- `highlightConnectors(p)` — highlights connector words
- `highlightNominalizations(p)` — highlights nominalized forms
- `highlightHedges(p)` — highlights hedging expressions
- `highlightWordyPhrases(p)` — highlights wordy multi-word phrases
- `highlightColloquial(p)` — highlights colloquial/informal expressions
- `highlightItalicText(p)` — marks italic spans (potential emphasis overuse)
- `highlightRepeatedStarts(p, globalSet)` — highlights paragraph-opening repeated words
- `highlightModalVerbs(p)` / `highlightFirstPerson(p)` — modal and first-person highlights
- `highlightCitationSentStart(p)` — highlights sentences starting with a citation
- `highlightPronounAmbig(p)` — highlights ambiguous pronoun references

### `src/ui/spelling.js`

Optional spellcheck integration. When `scientific-writing.spellcheck` is enabled, the browser sends paragraph text to a LanguageTool-compatible endpoint, filters misspellings through `spellcheck-ignore-terms` and `ignore-terms`, and wraps possible errors with `.ws-spelling`.

### `src/ui/nlp-highlights.js` and `src/ui/wink-highlights.js`

NLP-powered highlight injection using compromise.js and wink-nlp data respectively:
- Nominal load, weak verbs, noun stacks, topics, entities, adverbs, dates/values
- wink: complex words, modal verbs, pronouns, auxiliaries, numeric tokens, proper nouns, passive sentences

### `src/ui/evidence.js`

Evidence-specific UI: highlights parameterized and hard-coded numeric evidence, color-coded by type.

### `src/ui/cards.js`

Per-paragraph note card generation:
- `buildNote(stats)` — builds the margin note shown to the right of each paragraph, summarizing its metrics and listing any alerts

### `src/ui/rhythm.js`

Section rhythm visualization:
- `scaledBlocks(sections)` — generates a mini bar-chart of section lengths using CSS-styled `<span>` blocks, used in the metrics panel
- `wireRhythmNavigation(metrics)` — makes rhythm blocks clickable to scroll to the corresponding section

### `src/ui/summary.js`

Document Analysis card — the central synthesis view:
- `buildDocSummaryCard(opts)` — generates the full card HTML, including:
  - **Text profile** — a 6-row grid (Document · Sentences · Paragraphs · Readability · Style · Evidence) with color-coded threshold indicators
  - **Section pills** — compact per-section breakdown (words, %, sentences, avg sentence length)
  - **Key issues** (alerts) — high-priority problems with 4 actionable bullet-point suggestions each
  - **Notices** (warns) — lower-priority observations with improvement guidance

The card is always visible and not part of any collapsible group. It uses ~50 issue checks covering: long sentences, passive voice, hedging, connectors, cohesion gaps, section balance, citations, references, figures, tables, acronyms, wordy phrases, colloquialisms, vague quantifiers, lexical diversity, evidence, and more.

### `src/ui/modal.js`

Modal verb focus panel: clicking the modal verb metric isolates paragraphs with modal constructions.

### `src/ui/doi-tooltip.js`

Renders the DOI-validation tooltips from the comparison data pre-fetched at render time by the Lua filter (only present when `doi-validation: true`). Builds a word-level diff between the `ref.bib` field and the CrossRef metadata so mismatches in title, authors, journal, volume, and pages are highlighted inline.

### `src/ui/regex.js`

Regex search engine:
- `wireRegexSearch(metrics, root)` — wires the search input, scope toggles (paragraph / sentence), apply and clear buttons
- `parseRegexInput(raw)` — accepts plain text or `/pattern/flags` regex syntax
- `highlightRegexRangesInParagraph(p, ranges, title)` — injects `ws-regex-match` highlights with precise character-offset mapping

### `src/ui/report.js`

- `exportMarkdownReport()` — serializes all metrics from `window.WritingStatsReport` into a structured Markdown file and triggers a browser download

### `src/ui/focus.js`

- `addFocusMode(wrappers)` — enables clicking metric items to show only paragraphs that match the selected annotation type; click again to clear

### `src/ui/controls.js`

Floating control bar in the bottom-right corner:
- **Hide/Show** — toggle all annotations on/off
- **Alerts only** — hide non-critical (warn-level) annotations
- **Final review** — enter a clean reading mode with no highlights
- **Export** — download the Markdown metrics report

### `src/index.js`

Entry point. The `run()` function orchestrates the full analysis pipeline:
1. Apply configuration
2. Collect all `<section>` elements
3. Pre-analyze text for global repeated words and the longest sentence (to set `_longWrapThreshold`)
4. For each section and paragraph: run all detectors, inject highlights, build paragraph notes
5. After all paragraphs: aggregate document stats, build metrics panel and Document Analysis card
6. Wire up controls and focus mode

## Language detection

The extension reads the `lang` attribute of the `<html>` element (set automatically by Quarto from the `lang:` YAML field). If `lang` starts with `en`, English strings and patterns are used; otherwise, Portuguese is assumed.

```yaml
lang: en-US    # English
lang: pt-BR    # Portuguese
```

No additional configuration is needed.

## File structure

```
_extensions/scientific-writing/
├── _extension.yml                  # Extension metadata
├── scientific-writing.lua          # Lua filter (config injection + HTML deps)
├── scientific-writing.js           # Bundled runtime (build output — DO NOT delete)
├── scientific-writing.css          # Stylesheet
├── wink-bundle.min.js              # wink-nlp bundle (built separately)
├── src/
│   ├── config.js                   # Runtime config and thresholds
│   ├── index.js                    # Entry point and pipeline orchestration
│   ├── lang/
│   │   ├── pt.js                   # Portuguese string table
│   │   ├── en.js                   # English string table
│   │   └── index.js                # Language selector
│   ├── utils/
│   │   ├── text.js                 # Text utilities (sentences, words, syllables)
│   │   └── math.js                 # Statistical helpers (mean, variance)
│   ├── detect/
│   │   ├── style.js                # Hedges, wordy phrases, vague quantifiers, acronyms
│   │   ├── passive.js              # Passive voice, nominalizations, verb-less sentences
│   │   ├── connectors.js           # Connector counting and ambiguity handling
│   │   ├── connectors-taxonomy.js  # Full connector word list by category
│   │   ├── vocabulary.js           # Repetition, variants, unit inconsistency
│   │   ├── sections.js             # Section type recognition and balance
│   │   ├── citations.js            # In-text citation analysis and cohesion gaps
│   │   ├── references.js           # Bibliography cross-reference checking
│   │   ├── crossrefs.js            # Figure and table cross-reference tracking
│   │   ├── evidence.js             # Numeric evidence and variable usage
│   │   └── nlp/
│   │       ├── compromise.js       # compromise.js NLP wrapper
│   │       └── wink.js             # wink-nlp wrapper
│   ├── analysis/
│   │   ├── readability.js          # Flesch, grade level, Fog index
│   │   ├── paragraph.js            # Per-paragraph analysis and async batching
│   │   ├── section.js              # Per-section aggregation and scoring
│   │   └── document.js             # Document-level metrics and panel generation
│   └── ui/
│       ├── highlight-core.js       # Core highlight injection (pattern/word-set)
│       ├── highlights.js           # Pattern-specific highlight wrappers
│       ├── nlp-highlights.js       # compromise.js-powered highlights
│       ├── wink-highlights.js      # wink-nlp-powered highlights
│       ├── evidence.js             # Evidence highlight rendering
│       ├── cards.js                # Per-paragraph note card builder
│       ├── rhythm.js               # Section rhythm bar chart
│       ├── summary.js              # Document Analysis card
│       ├── modal.js                # Modal verb focus panel
│       ├── regex.js                # Regex search engine
│       ├── report.js               # Markdown export
│       ├── focus.js                # Focus mode wiring
│       └── controls.js             # Floating control bar
└── build/
    ├── build-scientific-writing.mjs  # Concatenation build script
    └── build.mjs                     # wink-nlp esbuild bundler
```



## License

MIT — see `LICENSE` for details.

## Author

Lucas S.B. Jordão
