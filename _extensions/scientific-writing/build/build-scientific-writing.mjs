import { readFile, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const extensionRoot = resolve(__dirname, '..');

const parts = [
  'src/config.js',
  'src/lang/pt.js',
  'src/lang/en.js',
  'src/lang/index.js',
  'src/utils/text.js',
  'src/detect/style.js',
  'src/detect/connectors.js',
  'src/detect/vocabulary.js',
  'src/detect/nlp/wink.js',
  'src/detect/nlp/compromise.js',
  'src/detect/sections.js',
  'src/detect/citations.js',
  'src/detect/references.js',
  'src/detect/crossrefs.js',
  'src/detect/evidence.js',
  'src/analysis/readability.js',
  'src/detect/connectors-taxonomy.js',
  'src/detect/passive.js',
  'src/analysis/paragraph.js',
  'src/utils/math.js',
  'src/analysis/section.js',
  'src/ui/highlight-core.js',
  'src/ui/highlights.js',
  'src/ui/evidence.js',
  'src/ui/nlp-highlights.js',
  'src/ui/wink-highlights.js',
  'src/ui/cards.js',
  'src/ui/rhythm.js',
  'src/ui/summary.js',
  'src/ui/modal.js',
  'src/ui/doi-tooltip.js',
  'src/ui/regex.js',
  'src/ui/report.js',
  'src/analysis/document.js',
  'src/ui/focus.js',
  'src/ui/controls.js',
  'src/index.js',
];

const sources = await Promise.all(
  parts.map(async (part) => {
    const contents = await readFile(resolve(extensionRoot, part), 'utf8');
    return contents.trimEnd();
  })
);

const output = `(function () {
  'use strict';

${sources.join('\n\n')}
})();
`;

await writeFile(resolve(extensionRoot, 'scientific-writing.js'), output);
console.log(`built scientific-writing.js from ${parts.length} source modules`);
