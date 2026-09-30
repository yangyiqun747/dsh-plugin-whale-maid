# Changelog

## 1.0.0 — first whale-maid build

Forked from `dsh-plugin-whale-pet` 0.2.9 (MIT code), keeping its behaviour and replacing the
character entirely.

### Added

- A chibi whale-maid character: one owner-supplied illustration, cut out to a transparent
  raster and turned into six state assets plus a plugin-manager icon.
- `artwork/tools/cutout.py`, `artwork/tools/make-assets.py` and
  `artwork/tools/review-states.py` regenerate the whole asset set from the source image.
- `tools/check-glyphs.mjs` verifies that every bubble phrase is drawable with the embedded
  font subset.
- Per-state vector effects: soft hearts (resting), progress sparkles (working), a thought
  bubble (waiting), stars and confetti (celebrate), drifting "Z" marks (sleeping), and a
  warning badge (error).

### Changed

- Package name `dsh-plugin-whale-maid`, entry id `whale-maid`, host service and remote
  namespace `whaleMaid`, preference key `dsh-plugin-whale-maid:v1`.
- The plugin icon now embeds the whale-maid raster on a flat brand disc instead of the
  upstream whale SVG.
- Interface wording is re-themed (English and Chinese) while staying inside the glyphs the
  bundled bubble font already covers.
- `tools/bridge-build.mjs` rewrites the bundler's module labels to checkout-relative paths,
  so generated artifacts never contain the building machine's directory; it also accepts any
  esbuild >= 0.21 while still requiring zod 4.4.3.
- `tools/entry-id-migration.mjs` now exposes `ENTRY_ID` and `LEGACY_ENTRY_IDS`.
- Asset validation accepts an embedded base64 PNG inside `<image>` (and still rejects
  scripting, remote references and inline styles) instead of only pure-vector SVG.

### Removed

- All upstream whale artwork, its preview image and the upstream repository/package-manager
  metadata from `package.json`.

### Verification

- 189 automated checks pass, covering the strict Host contract, the widget state machine,
  celebration/cancellation semantics, localization, fonts, packaging and asset inertness.
- The state assets were reviewed as a rendered contact sheet after each asset change.

Wait for active tasks to finish before updating. Fully quit and reopen DSH after the update
to load the new Host and client modules. No profile migration or restart is performed
automatically.
