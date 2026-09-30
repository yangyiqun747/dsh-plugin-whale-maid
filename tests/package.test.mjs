import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const manifest = JSON.parse(read('package.json'));
test('package is a self-contained DSH bundle with only its own inserted row', () => {
  assert.equal(manifest.name, 'dsh-plugin-whale-maid');
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml');
  assert.equal(manifest.dsh.client.platform, 'web');
  for (const target of Object.values(manifest.exports)) assert.equal(fs.existsSync(path.join(root, target)), true);
  assert.equal((read('cordis.patch.yml').match(/- id:/g) || []).length, 1);
  assert.match(read('cordis.patch.yml'), /id: whale-maid\s*\n\s*name: dsh-plugin-whale-maid/);
  assert.equal(manifest.dependencies, undefined);
  for (const hook of ['preinstall', 'install', 'postinstall', 'prepare', 'prepack', 'postpack']) {
    assert.equal(manifest.scripts[hook], undefined);
  }
  assert.equal(manifest.version, '1.0.0');
  assert.equal(fs.existsSync(path.join(root, 'lib/version.js')), false);
  assert.equal(manifest.files.includes('DIAGNOSTICS.md'), false);
  assert.equal(manifest.license, 'MIT');
  assert.equal(manifest.repository, undefined);
  assert.equal(manifest.homepage, undefined);
  assert.equal(manifest.packageManager, undefined);
  assert.equal(manifest.engines.node, '>=22');
  assert.equal(manifest.scripts.build, 'node tools/bridge-build.mjs && node tools/build.mjs');
  assert.equal(manifest.scripts.test, 'node --test tests/*.test.mjs');
  assert.equal(manifest.scripts['test:browser'], undefined);
  assert.ok(manifest.files.includes('CHANGELOG.md'));
  // Every declared documentation file must actually exist, so a rename or a manifest
  // edit can never silently drop it from the published package.
  for (const declared of manifest.files.filter(entry => entry.endsWith('.md'))) {
    assert.equal(fs.existsSync(path.join(root, declared)), true, `declared but missing: ${declared}`);
  }
  // No absolute host path may leak into the published build tooling.
  assert.doesNotMatch(read('tools/bridge-build.mjs'), /WHALE_BRIDGE_DEPS|dsh-pet-research|[A-Za-z]:[\\/]Users[\\/]|\/(?:home|Users)\//);
});
test('publishing copies the client payload while install-time deps stay optional', () => {
  // The package ships its built lib/ output, so a missing node_modules tree cannot break
  // installation; the build tools only need esbuild/zod when regenerating the contract.
  assert.ok(manifest.files.includes('lib'));
  assert.equal(manifest.dependencies, undefined);
  for (const file of ['lib/client.js', 'lib/index.js', 'lib/remote.js', 'lib/typert.host.js']) {
    assert.ok(fs.statSync(path.join(root, file)).size > 0, `${file} must be shipped built`);
  }
  assert.doesNotMatch(read('lib/client.js'), /require\(['"]esbuild|require\(['"]zod/);
});
test('no host-specific absolute path is committed anywhere in the repository', () => {
  // The artwork scripts derive their own root, and documentation uses placeholders, so a
  // clone on any machine works and no contributor's directory leaks into the repository.
  const skip = new Set(['node_modules', '.git', 'artwork', 'preview']);
  const offenders = [];
  const planted = /(?:[A-Za-z]:[\\/](?:Users|deepseek_harness|Git|node)|[\\/](?:Users|home)[\\/][^\\/\s"']+)/;
  const walk = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.') && entry.name !== '.github') continue;
      if (skip.has(entry.name)) continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.(?:js|mjs|json|ya?ml|md|py|css|html)$/.test(entry.name)) continue;
      const text = fs.readFileSync(full, 'utf8');
      // Large generated bundles are checked by their own assertions below.
      if (text.length > 400000) continue;
      for (const line of text.split(/\r?\n/)) if (planted.test(line)) offenders.push(`${path.relative(root, full)}: ${line.trim().slice(0, 90)}`);
    }
  };
  walk(root);
  // UPGRADE.md documents the historical upstream identifiers, which contain no host path.
  assert.deepEqual(offenders, []);
  for (const file of ['artwork/tools/make-assets.py', 'artwork/tools/cutout.py', 'artwork/tools/review-states.py']) {
    assert.match(read(file), /os\.path\.dirname\(os\.path\.abspath\(__file__\)\)/, `${file} must derive its own root`);
  }
});
test('formal runtime has no diagnostic feature or prerelease helper', () => {
  for (const file of ['src/widget.js', 'src/adapter.js', 'src/bridge-client.js', 'src/host-bridge.js', 'src/global-state.js', 'lib/client.js', 'lib/index.js', 'lib/remote.js', 'lib/typert.host.js']) {
    assert.doesNotMatch(read(file), /WhaleDiagnostics|refreshHostDiagnostics|WHALE_DIAGNOSTICS|onDiagnosticsRefresh|diagnostics-toggle|namespaceFailures/);
  }
  assert.equal(fs.existsSync(path.join(root, 'src/diagnostics.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'DIAGNOSTICS.md')), false);
  assert.ok(manifest.files.includes('CHANGELOG.md'));
  assert.doesNotMatch(read('README.md'), /Local test build|Local diagnostic build|Install the beta/);
});
test('browser output registers one lazy factory using host React and official icons', () => {
  const registrations = [];
  vm.runInNewContext(read('lib/client.js'), { window: { __ModuleLoader__: { load: item => registrations.push(item) } } });
  assert.equal(registrations.length, 1); assert.equal(registrations[0].id, manifest.name);
  const requested = [];
  const plugin = registrations[0].factory(id => { requested.push(id); return { Component: class {}, createElement() {} }; });
  assert.deepEqual(requested, ['react', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives']);
  assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-primitives'));
  assert.doesNotMatch(read('lib/client.js'), /M4 6L7\.29289|__WhaleOfficialIconTest|react\.production\.min/); assert.deepEqual(Array.from(plugin.inject), ['slots', 'sessions', 'connection', 'locale', 'remote']);
  const slots = [];
  plugin.apply({ slots: { inject(name, fn) { assert.equal(name, 'shell.overlay'); fn(); }, register(options, component) { slots.push(options); assert.equal(typeof component, 'function'); return () => {}; } } });
  assert.equal(slots.length, 1); assert.equal(slots[0].name, 'shell.overlay'); assert.equal(slots[0].id, 'whale-maid');
});
test('pet has no extra status indicator dot in source or generated bundle', () => {
  for (const file of ['src/widget.js', 'src/pet.css', 'lib/client.js']) {
    assert.doesNotMatch(read(file), /class="indicator"|\.indicator\b/);
  }
});
test('host contributes only a read-only boundary service and owned listener', async () => {
  const host = await import('../lib/index.js');
  assert.equal(host.name, 'whaleMaid'); assert.deepEqual(host.inject, ['agents']);
  let service, cleanup;
  host.apply({ get: () => ({ list: () => [], roots: () => [] }),
    provide(key, value) { assert.equal(key, 'whaleMaid'); service = value; },
    on(event, callback, options) { assert.equal(event, 'session/event'); assert.equal(options.global, true); assert.equal(typeof callback, 'function'); },
    effect(factory) { cleanup = factory(); },
  });
  assert.equal(service.typertRemote.service, service);
  const stream = service.watch(new AbortController().signal);
  assert.equal((await stream.next()).value.type, 'baseline'); cleanup();
  assert.equal((await stream.next()).done, true);
  assert.doesNotMatch(read('lib/index.js'), /from ['"](?:node:)?(?:fs|http|https|child_process)|createServer|writeFile|fetch\(/);
});
test('embedded bubble fonts ship with OFL notices and no runtime font dependency', () => {
  let total = 0;
  for (const language of ['en', 'zh']) {
    const bytes = fs.readFileSync(path.join(root, `assets/fonts/bubble-${language}.woff2`));
    assert.equal(bytes.toString('ascii', 0, 4), 'wOF2'); total += bytes.length;
  }
  assert.ok(total < 150000, 'Only a compact bubble subset belongs in the runtime');
  const notices = fs.readdirSync(path.join(root, 'assets/fonts')).filter(name => /OFL|LICENSE/i.test(name));
  assert.ok(notices.length >= 2);
  for (const notice of notices) assert.match(read(`assets/fonts/${notice}`), /SIL OPEN FONT LICENSE/);
  assert.ok(manifest.files.includes('FONT-LICENSES.md'));
  assert.match(read('FONT-LICENSES.md'), /Fredoka/); assert.match(read('FONT-LICENSES.md'), /ZCOOL/);
  assert.match(read('lib/client.js'), /data:font\/woff2;base64,/);
});
test('six inert SVGs and offline preview are present, without source paths', () => {
  for (const name of ['working', 'celebrate', 'waiting', 'resting', 'sleeping', 'error']) {
    const svg = read(`assets/${name}.svg`);
    assert.match(svg, /^<svg/);
    // Inert: no scripting, no remote or scriptable reference, no inline style.
    assert.doesNotMatch(svg, /<script|<foreignObject|\son\w+\s*=|javascript:|\sstyle\s*=|https?:\/\/(?!www\.w3\.org)/i);
    // The character artwork ships as an embedded PNG; effects stay flat vectors.
    assert.match(svg, /xlink:href="data:image\/png;base64,/);
    for (const match of svg.matchAll(/(?:xlink:)?href\s*=\s*"([^"]*)"/gi)) {
      assert.match(match[1], /^data:image\/png;base64,/);
    }
  }
  // The bundle is minified and full of base64, so only recognisable absolute paths are
  // rejected: a user-profile root or a Windows user path, never a bare "x:/" substring.
  assert.doesNotMatch(read('lib/client.js'), /[A-Za-z]:[\\/]Users[\\/]|\/(?:home|Users)\/|fetch\(|XMLHttpRequest|dsh-pet-research|bridge-build-probe/);
  assert.doesNotMatch(read('lib/remote.js'), /[A-Za-z]:[\\/]Users[\\/]|\/(?:home|Users)\/|dsh-pet-research|bridge-build-probe/);
  const preview = read('preview/index.html');
  assert.doesNotMatch(preview, /<script[^>]+src=|__PACKAGE_VERSION__/);
  assert.ok(preview.includes(`DSH PLUGIN / ${manifest.version}`));
  assert.doesNotMatch(read('tools/build.mjs'), /tools\/fixtures|dsh-chevron\.svg/);
  assert.ok(read('preview/runtime.js').includes('M 4 6 L 8 10 L 12 6'));
  assert.ok(!read('lib/client.js').includes('M 4 6 L 8 10 L 12 6'));
});
test('manifest icon is a shippable, inert, package-relative SVG within DSH limits', () => {
  const icon = manifest.icon;
  assert.equal(typeof icon, 'string');
  // DSH accepts only a relative file path; absolute paths, URLs and data: URIs are rejected.
  assert.doesNotMatch(icon, /^(?:[A-Za-z]:[\\/]|[\\/]|[A-Za-z][A-Za-z\d+.-]*:)/);
  assert.equal(path.extname(icon).toLowerCase(), '.svg');
  const resolved = path.resolve(root, icon);
  const relative = path.relative(root, resolved);
  assert.ok(!relative.startsWith('..') && !path.isAbsolute(relative));
  const stat = fs.statSync(resolved);
  assert.ok(stat.isFile());
  assert.ok(stat.size <= 256 * 1024, 'the icon must stay within the 256 KiB DSH limit');
  const svg = fs.readFileSync(resolved, 'utf8');
  assert.match(svg, /^<svg\s/);
  assert.doesNotMatch(svg, /<script|<foreignObject|\son\w+\s*=|\sstyle\s*=|javascript:/i);
  assert.doesNotMatch(svg.replace(/xmlns(?::xlink)?="http:\/\/www\.w3\.org\/[^"]*"/g, ''), /https?:\/\//);
  const tags = [...svg.matchAll(/<\/?([a-zA-Z][\w:-]*)\b/g)].map(match => match[1]);
  assert.deepEqual([...new Set(tags)].sort(), ['circle', 'clipPath', 'defs', 'g', 'image', 'linearGradient', 'path', 'rect', 'stop', 'svg']);
  // A clip reference must resolve inside the same file.
  for (const match of svg.matchAll(/clip-path\s*=\s*"url\(#([^)]+)\)"/g)) assert.ok(svg.includes(`id="${match[1]}"`));
  // The icon carries the same artwork as the resting state, embedded once as base64 PNG.
  assert.match(svg, /xlink:href="data:image\/png;base64,[A-Za-z0-9+/]+={0,2}"/);
  const payload = svg.match(/xlink:href="data:image\/png;base64,([A-Za-z0-9+/]+={0,2})"/)[1];
  assert.equal(Buffer.from(payload.slice(0, 24), 'base64').subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  // assets/ is published, so the icon travels with the package.
  assert.ok(manifest.files.includes('assets'));
});
