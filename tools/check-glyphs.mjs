// Report which bubble glyphs the embedded font subset still misses.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MESSAGES } from '../src/i18n.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const metadata = JSON.parse(fs.readFileSync(path.join(root, 'assets/fonts/manifest.json'), 'utf8'));
const covered = new Set(metadata.fonts.flatMap(font => font.codepoints));
console.log('families:', metadata.fonts.map(font => font.family).join(' | '));
console.log('covered codepoints:', covered.size);
const missing = new Map();
for (const [language, dictionary] of Object.entries(MESSAGES)) {
  for (const [key, text] of Object.entries(dictionary)) {
    if (!/^(state|working|celebrate|error)\./.test(key) && key !== 'pet.greeting') continue;
    for (const character of text) {
      const code = character.codePointAt(0);
      if (!covered.has(code)) {
        if (!missing.has(language)) missing.set(language, new Set());
        missing.get(language).add(character);
      }
    }
  }
}
if (!missing.size) console.log('all bubble strings covered');
for (const [language, set] of missing) console.log(language, 'missing:', [...set].join(''));
