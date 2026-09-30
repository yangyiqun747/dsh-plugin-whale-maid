# Compatibility and verification boundaries

## Release and target environment

- Release: **1.0.0**.
- Forked from `dsh-plugin-whale-pet` 0.2.9, which was originally developed against DSH
  Desktop 0.1.6-alpha.2 on macOS arm64.
- This build was assembled and verified on Windows with Node.js 24 (the package requires
  Node.js 22 or newer for development).
- This is a personal plugin, not an official DeepSeek product. A formal package release is
  not universal certification for every DSH version or operating system.

## What this build changes relative to upstream

- Character artwork and every state asset, plus the plugin-manager icon.
- Package name, entry id, host service name, remote namespace and preference key.
- Interface wording (English and Chinese).
- The build's module-label portability fix and its asset validator.
- Test expectations that referenced upstream artwork, wording and packaging metadata.

Behaviour is otherwise unchanged: the same state machine, the same completion semantics, the
same slots, the same settings, and the same privacy boundaries.

## Architecture and behavior

- Root overlay slot: `shell.overlay`.
- Host React/ReactDOM and public UI icon references; no second React runtime or extracted DSH implementation is bundled.
- Root session catalog/status supplies work and waiting state independently of completion delivery.
- A plugin-owned read-only Host service projects live turn boundaries through the existing authenticated connection.
- No model calls, approval handling, external listening port, telemetry or runtime font/CDN downloads.
- Subagent activity is not counted as separate ordinary main sessions.
- Normal completion is eligible immediately; it does not wait for driver idle. Waiting and errors retain their display priority.
- Cancellation, history, reconnect baselines and falling running counts alone do not produce success. DSH's green unread indicator is not substituted for a normal completion reason.
- Brief notices are bounded and not replayed from disconnected history.

## Tests versus installation

The portable Node suite uses synthetic data and isolated components. It covers strict
contracts, scope/capability access, aggregation, ordering, cancellation, reconnects,
lifecycle cleanup, localization, font coverage, packaging, asset inertness and migration
planning. Its namespace fixture rejects undeclared access instead of exposing a permissive
plain-object Remote.

The offline browser preview simulates state. Opening it establishes menu and rendering
behaviour, not delivery of real Host events. This fork has not re-run the upstream
in-app verification on a live DSH session; upstream's own confirmation of normal-reply
celebration is the reference for that path.

## Entry-ID migration

```yaml
- insert:
    - id: whale-maid
      name: dsh-plugin-whale-maid
```

DSH matches user overrides by ID; an override that targets a missing entry is skipped. This
package's earlier IDs (`dsh-plugin-whale-maid`, `whalePet`) can be migrated with
`tools/entry-id-migration.mjs`. Read the [upgrade notes](UPGRADE.md). No automatic profile
migration runs on install.

## UI and assets

Native customizable selects and `corner-shape` rely on the target browser's support.
Production uses the host's theme tokens and icon; the offline preview uses an independently
drawn generic chevron.

Each state SVG embeds a base64 PNG of the character plus flat vector effects; the build
rejects scripting, remote references, inline styles and oversized assets. The character
artwork keeps its own terms — see [character asset notes](ASSETS-LICENSE.md),
[code license](LICENSE) and [font licenses](FONT-LICENSES.md).
