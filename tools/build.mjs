import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const { version } = JSON.parse(read('package.json'));
// Independently authored geometric preview stand-in, not copied from DSH artwork.
// Production continues to render the official icon supplied by the live host.
const previewChevron = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true"><path d="M 4 6 L 8 10 L 12 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
// The character artwork is a compressed raster embedded in each state SVG, so the
// allowlist below accepts <image> only with an inline base64 PNG payload and never
// a remote or scriptable reference. Vector state effects stay on the same allowlist.
const ALLOWED_TAGS = ['svg', 'path', 'defs', 'linearGradient', 'stop', 'g', 'circle', 'ellipse', 'rect', 'image', 'clipPath', 'title', 'desc'];
const MAX_ASSET_BYTES = 512 * 1024;
const MAX_ICON_BYTES = 256 * 1024;

/** Validate one inert asset SVG: no scripting, no remote or scriptable reference,
 * <image> only with an inline base64 PNG, and only allowlisted elements. */
function validateSvg(svg, label, limit) {
  if (Buffer.byteLength(svg) > limit) throw new Error(`Oversized asset: ${label}`);
  if (!/^<svg\s/.test(svg)) throw new Error(`Not an SVG document: ${label}`);
  if (/<!|<\?|<\w*script|\bon[a-z]+\s*=|style\s*=|javascript:|<foreignObject|<!ENTITY/i.test(svg)) throw new Error(`Unsafe SVG: ${label}`);
  const tags = [...svg.matchAll(/<\/?([a-zA-Z][\w:-]*)\b/g)].map(m => m[1]);
  if (tags.some(tag => !ALLOWED_TAGS.includes(tag))) throw new Error(`Unexpected SVG element: ${label}`);
  if (!/viewBox="[\d. -]+"/.test(svg)) throw new Error(`Missing viewBox: ${label}`);
  // Every href must be an embedded base64 PNG; nothing may point outside the file.
  for (const match of svg.matchAll(/(?:xlink:)?href\s*=\s*"([^"]*)"/gi)) {
    const target = match[1];
    if (!target.startsWith('data:image/png;base64,')) throw new Error(`External or non-PNG reference: ${label}`);
    const payload = target.slice('data:image/png;base64,'.length);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(payload)) throw new Error(`Malformed embedded PNG: ${label}`);
    if (Buffer.from(payload.slice(0, 24), 'base64').subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`Embedded payload is not a PNG: ${label}`);
  }
  if (!/(?:xlink:)?href\s*=\s*"data:image\/png;base64,/.test(svg)) throw new Error(`Missing character artwork: ${label}`);
  // Any clip-path reference must resolve to a clipPath id defined in the same file.
  for (const match of svg.matchAll(/clip-path\s*=\s*"url\(#([^)]+)\)"/g)) {
    if (!svg.includes(`id="${match[1]}"`)) throw new Error(`Unresolved clip reference: ${label}`);
  }
  // No http(s) URL may appear anywhere in the document.
  if (/https?:\/\//i.test(svg.replace(/xmlns(?::xlink)?="http:\/\/www\.w3\.org\/[^"]*"/gi, ''))) throw new Error(`Remote reference: ${label}`);
}

const assets = {};
for (const name of ['working', 'celebrate', 'waiting', 'resting', 'sleeping', 'error']) {
  const svg = read(`assets/${name}.svg`);
  validateSvg(svg, name, MAX_ASSET_BYTES);
  assets[name] = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}
// The manifest icon is resolved by DSH directly from disk, so it is validated here too.
validateSvg(read('assets/icon.svg'), 'icon.svg', MAX_ICON_BYTES);
const bubbleFonts = {};
for (const language of ['en', 'zh']) {
  const bytes = fs.readFileSync(path.join(root, `assets/fonts/bubble-${language}.woff2`));
  if (bytes.toString('ascii', 0, 4) !== 'wOF2') throw new Error(`Invalid embedded font: ${language}`);
  bubbleFonts[language] = `data:font/woff2;base64,${bytes.toString('base64')}`;
}
const fontLoader = read('src/fonts.js').replace(/^export /gm, '');
const bubblePosition = read('src/bubble-layout.js').replace(/^export /gm, '');
const bubbleSurface = read('src/bubble-surface.js').replace(/^export /gm, '');
const css = read('src/pet.css');
const i18n = read('src/i18n.js').replace(/^export /gm, '');
const state = read('src/state.js').replace(/^export /gm, '');
const globalState = read('src/global-state.js').replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
const widget = read('src/widget.js').replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
const adapter = read('src/adapter.js').replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
const common = `const ASSETS=${JSON.stringify(assets)};\nconst CSS=${JSON.stringify(css)};\nconst BUBBLE_FONTS=${JSON.stringify(bubbleFonts)};\n${i18n}\n${state}\n${globalState}\n${fontLoader}\n${bubblePosition}\n${bubbleSurface}\n${widget}\n`;
fs.mkdirSync(path.join(root, 'lib'), { recursive: true });
fs.mkdirSync(path.join(root, 'preview'), { recursive: true });
if (!process.argv.includes('--preview-only')) {
  const bridge = read('src/bridge-client.js').replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  const remote = read('lib/remote.js');
  const exportsBlock = /\nexport \{([^}]+)\};?\s*$/;
  const expectedExports = ['TYPERT_REMOTE', 'WHALE_FRAME_SCHEMA', 'WHALE_WATCH_DESCRIPTOR'];
  const exportedNames = remote.match(exportsBlock)?.[1].split(',').map(name => name.trim()).filter(Boolean).sort();
  if (JSON.stringify(exportedNames) !== JSON.stringify(expectedExports)) throw new Error('Unexpected bridge contract exports; refusing a broken bundle');
  const contract = `const WhaleBridgeContract=(()=>{${remote.replace(exportsBlock, '')}\nreturn {${expectedExports.join(',')}};})();`;
  fs.writeFileSync(path.join(root, 'lib/index.js'), read('src/host-bridge.js'));
  fs.writeFileSync(path.join(root, 'lib/client.js'), `// Generated by tools/build.mjs. Uses the existing authenticated DSH connection only.\nwindow.__ModuleLoader__.load({id:'dsh-plugin-whale-maid',factory:function(require){\n'use strict';\n${common}\n${contract}\n${bridge}\n${adapter}\nreturn createPlugin(require, ASSETS, CSS, BUBBLE_FONTS);\n}});\n`);
}
fs.writeFileSync(path.join(root, 'preview/runtime.js'), `// Generated from the same UI and state machine as the DSH plugin.\n(function(){'use strict';\n${common}\nwindow.WhaleMaid={WhaleWidget,PetStateMachine,SessionAggregate,STATES,assets:ASSETS,css:CSS,fonts:BUBBLE_FONTS,previewChevron:${JSON.stringify(previewChevron)}};\n})();\n`);
// Single-file preview works offline and in a browser with file://, no dev server required.
const html = read('src/preview.html')
  .replaceAll('__PACKAGE_VERSION__', version)
  .replace('/*__RUNTIME__*/', fs.readFileSync(path.join(root, 'preview/runtime.js'), 'utf8').replace(/<\/script/gi, '<\\/script'));
fs.writeFileSync(path.join(root, 'preview/index.html'), html);
console.log(`Built ${process.argv.includes('--preview-only') ? 'offline preview only' : 'client bundle and offline preview'}; validated 6 SVG assets.`);
