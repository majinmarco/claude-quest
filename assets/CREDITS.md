# Art credits

## Kenney: Tiny Dungeon 1.0

- Folder: `kenney-tiny-dungeon/` (the packed tilesheet, `tilemap_packed.png`, with the pack's own `License.txt` and `Tilesheet.txt`)
- Author: Kenney (www.kenney.nl)
- Source: https://kenney.nl/assets/tiny-dungeon, downloaded 2026-10-23 as `kenney_tiny-dungeon.zip` (SHA-256 `c109438ab06f65fd80f9b2686a4cf9c7c11dc64444b47333ec71d602f8bb5fc7`)
- Licence: Creative Commons Zero (CC0 1.0), http://creativecommons.org/publicdomain/zero/1.0/, as the pack's `License.txt` states. Crediting is not required; we credit Kenney anyway.

The Scene pane draws a few of its 16 x 16 tiles (wall, banner, floors, hero,
chests, monsters, the boss), and the Sage's and the boss's portraits in their dialogue boxes. `scripts/build-sprites.mjs` decodes the tilesheet into
`src/sprites.ts`, so no PNG is decoded while a session runs. To draw other
tiles, change `SPRITES` in the script and run `node scripts/build-sprites.mjs`.

## Kenney: UI Pack – Pixel Adventure 2.0

- Folder: `kenney-ui-pixel-adventure/` (the small, thick-outline packed tilesheet, `tilemap_packed.png`, 23 tiles a row, with the pack's own `License.txt` and `Tilesheet.txt`, whose 1 px spacing is the unpacked sheet's)
- Author: Kenney (www.kenney.nl)
- Source: https://kenney.nl/assets/ui-pack-pixel-adventure, downloaded 2026-10-23, the zip (SHA-256 `0b0ed4802ebcfff5e44e370f394baa1d751862a5a4a7612ac4ce84e85faa0627`)
- Licence: Creative Commons Zero (CC0 1.0), http://creativecommons.org/publicdomain/zero/1.0/, as the pack's `License.txt` states. Crediting is not required; we credit Kenney anyway.

The Quest Board draws its Scrolls from a few of its tiles: the rod's cap and
body (115, 138) turned on their side as the rollers, the ribbon (83, 84, 85)
as the board's header, and the gold and grey gems (76, 53) as the difficulty
pips. `scripts/build-sprites.mjs` bakes them into `src/sprites.ts` beside
the Tiny Dungeon tiles.

## Kenney: Kenney Fonts (Kenney Mini)

- Folder: `kenney-fonts/` (`Kenney Mini.ttf` alone, with the package's own `License.txt`)
- Author: Kenney (www.kenney.nl)
- Source: https://kenney.nl/assets/kenney-fonts, downloaded 2026-10-23, the zip (SHA-256 `4e69a86eef3cd47e9d8207413868cd08bcddeb2dae4047dbd10362e2a7a16bac`)
- Licence: Creative Commons Zero (CC0 1.0), http://creativecommons.org/publicdomain/zero/1.0/, as the package's `License.txt` states. Crediting is not required; we credit Kenney anyway.

The Scrolls are lettered in Kenney Mini. `scripts/build-font.mjs` reads the
font's pixel outlines and bakes 87 characters into bitmap glyphs in
`src/pixel-font.ts`, so the art draws the font's own pixels as paths and no
font is loaded where it is shown. To letter other characters, add them to
`CHARACTERS` in the script and run `node scripts/build-font.mjs`.
