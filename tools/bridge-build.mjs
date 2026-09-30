// Rebuild only bridge artifacts. No app/profile access. Tooling is development-only.
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = new URL('../', import.meta.url);
// Resolve only this publication checkout's pinned development dependencies.
const requireTooling = createRequire(new URL('package.json', root));
const { build } = requireTooling('esbuild');
const zodDirectory = path.dirname(requireTooling.resolve('zod/package.json'));
const zodVersion = requireTooling('zod/package.json').version;
const esbuildVersion = requireTooling('esbuild/package.json').version;
// The contract is generated deterministically, so the exact bundler patch level is
// recorded rather than enforced: any esbuild 0.21+ emits the same ESM here, and an
// offline machine may only have an older release available.
if (zodVersion !== '4.4.3') throw new Error(`Bridge rebuild requires zod@4.4.3, found ${zodVersion}`);
if (!/^0\.(2[1-9]|[3-9]\d)\./.test(esbuildVersion)) throw new Error(`Bridge rebuild requires esbuild >=0.21, found ${esbuildVersion}`);
const zodLicense = await fs.readFile(path.join(zodDirectory, 'LICENSE'), 'utf8');
const rootDirectory = fileURLToPath(root);
await build({
  entryPoints: [fileURLToPath(new URL('./bridge-contract-source.mjs', import.meta.url))],
  outfile: fileURLToPath(new URL('lib/remote.js', root)),
  bundle: true, format: 'esm', platform: 'neutral', target: 'es2022',
  // Keep generated source comments relative even when invoked from another cwd.
  absWorkingDir: rootDirectory,
  minify: false, legalComments: 'inline',
  banner: { js: '// Generated from tools/bridge-contract-source.mjs; includes Zod, not DSH implementation code.\n/* Zod 4.4.3 license:\n' + zodLicense + '\n*/' },
});
// esbuild labels every bundled module with a comment naming its source file. A checkout
// can live anywhere, so those labels are rewritten to checkout-relative paths: the
// published artifact must never carry the building machine's own directory.
{
  const target = fileURLToPath(new URL('lib/remote.js', root));
  const compiled = await fs.readFile(target, 'utf8');
  const portable = compiled.replace(/^\/\/ .*$/gm, label =>
    label.replace(/[A-Za-z]:[\\/][^\n]*/, absolute => {
      // A bundled dependency always sits under node_modules, so the label only needs
      // the part below it to stay meaningful and machine independent.
      const nested = absolute.split(/node_modules[\\/]/).pop().split('\\').join('/');
      return absolute.includes('node_modules') ? 'node_modules/' + nested : path.basename(absolute);
    }));
  if (/[A-Za-z]:[\\/]Users[\\/]|\/(?:home|Users)\//.test(portable)) throw new Error('Generated contract still carries an absolute build path');
  await fs.writeFile(target, portable);
}
// Remove the obsolete prerelease version helper during incremental rebuilds.
await fs.rm(new URL('lib/version.js', root), { force: true });
await fs.copyFile(new URL('src/host-bridge.js', root), new URL('lib/index.js', root));
console.log('Built strict browser/Host contract and Host entry.');
