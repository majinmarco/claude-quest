# Art credits

## Kenney: Tiny Dungeon 1.0

- Folder: `kenney-tiny-dungeon/` (the packed tilesheet, `tilemap_packed.png`, with the pack's own `License.txt` and `Tilesheet.txt`)
- Author: Kenney (www.kenney.nl)
- Source: https://kenney.nl/assets/tiny-dungeon, downloaded 2026-10-23 as `kenney_tiny-dungeon.zip` (SHA-256 `c109438ab06f65fd80f9b2686a4cf9c7c11dc64444b47333ec71d602f8bb5fc7`)
- Licence: Creative Commons Zero (CC0 1.0), http://creativecommons.org/publicdomain/zero/1.0/, as the pack's `License.txt` states. Crediting is not required; we credit Kenney anyway.

The Scene pane draws a few of its 16 x 16 tiles (wall, banner, floors, hero,
chests), and the Sage's portrait in the dialogue box. `scripts/build-sprites.mjs` decodes the tilesheet into
`src/sprites.ts`, so no PNG is decoded while a session runs. To draw other
tiles, change `SPRITES` in the script and run `node scripts/build-sprites.mjs`.
