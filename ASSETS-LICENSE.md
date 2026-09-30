# Character Asset Notes

## Source and ownership

The six state illustrations in `assets/` (working, celebrate, waiting, resting, sleeping,
error), the icon in `assets/icon.svg`, and the source image in
`artwork/source/whale-maid-source.jpg` were supplied by this package's owner. All rights to
that illustration stay with its owner or the respective rights holders.

The artwork was not redrawn. It was processed mechanically by the scripts in `artwork/tools/`:

1. the white background is removed by a border flood fill, keeping the enclosed white lace
   and apron areas opaque;
2. detached fragments (stray hearts from the source file) are dropped by keeping only the
   largest connected silhouette;
3. the silhouette is recoloured per state (saturation/brightness/contrast plus, for sleeping
   and error, a blue-grey tint) and rasterised at 480 px;
4. a small set of flat vector effects is composited on top of each state.

## Scope of permission

These assets are licensed for use inside this plugin and in the installation packages built
from this directory. That permission does not automatically extend to extraction,
redistribution or reuse by third parties.

No right is granted here to resell the artwork, use it commercially, or use any associated
trademarks beyond the scope of this plugin.

## Separate from the code license

The MIT license in [LICENSE](LICENSE) covers the code only. It does not cover the character
illustration, the generated state assets, the preview images, or the copies of that artwork
embedded in generated bundles.

The upstream project's own whale stickers are **not** part of this package.

## Unofficial project

This is a personal, independently developed plugin. It is not an official DeepSeek product
and does not represent DeepSeek's position or imply endorsement.
