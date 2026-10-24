# Art credits

## Kenney: Tiny Dungeon 1.0

- Folder: `kenney-tiny-dungeon/` (the packed tilesheet, `tilemap_packed.png`, with the pack's own `License.txt` and `Tilesheet.txt`)
- Author: Kenney (www.kenney.nl)
- Source: https://kenney.nl/assets/tiny-dungeon, downloaded 2026-10-23 as `kenney_tiny-dungeon.zip` (SHA-256 `c109438ab06f65fd80f9b2686a4cf9c7c11dc64444b47333ec71d602f8bb5fc7`)
- Licence: Creative Commons Zero (CC0 1.0), http://creativecommons.org/publicdomain/zero/1.0/, as the pack's `License.txt` states. Crediting is not required; we credit Kenney anyway.

The Scene pane draws a few of its 16 x 16 tiles (wall, banner, floors, hero,
chests, monsters, the boss), the Sage's and the boss's portraits in their dialogue boxes, and the HUD's portraits by Title (111 Scholar, 112 Pathfinder, 87 Warrior; the hero, 97, before a Title). `scripts/build-sprites.mjs` decodes the tilesheet into
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
pips; the HUD's Quest banner stands the rod's tiles upright as its rollers. `scripts/build-sprites.mjs` bakes them into `src/sprites.ts` beside
the Tiny Dungeon tiles.

## Kenney: Tiny Town 1.1

- Folder: `kenney-tiny-town/` (the packed tilesheet, `tilemap_packed.png` (SHA-256 `3a54d99ecde790d4fdea207a3644cf130fc56fa838f1beb1507c185a95b8e902`), 12 tiles a row, with the pack's own `License.txt` and `Tilesheet.txt`, whose 1 px spacing is the unpacked sheet's)
- Author: Kenney (www.kenney.nl)
- Source: https://kenney.nl/assets/tiny-town, downloaded 2026-10-24 as `kenney_tiny-town.zip` (SHA-256 `9768692dccff1d706408a5aedd6ca4f6cd1409506cbc84cb2f862919764be977`)
- Licence: Creative Commons Zero (CC0 1.0), http://creativecommons.org/publicdomain/zero/1.0/, as the pack's `License.txt` states. Crediting is not required; we credit Kenney anyway.

The Region map's overworld draws its land from a few of its tiles: grass (0,
1, 2), trees and growth (28, 27, 5, 29), the dirt road (25), a Dungeon's
gate in castle wall (111, 112, 123, 124), and a camp of the Wilds (107, 106,
83), whose signpost the Module view uses too. `scripts/build-sprites.mjs` bakes them into `src/sprites.ts` beside
the Tiny Dungeon tiles, whose wall, banner and floors (40, 29, 48, 49) draw
the Rooms of a Dungeon.

## Kenney: Kenney Fonts (Kenney Mini)

- Folder: `kenney-fonts/` (`Kenney Mini.ttf` alone, with the package's own `License.txt`)
- Author: Kenney (www.kenney.nl)
- Source: https://kenney.nl/assets/kenney-fonts, downloaded 2026-10-23, the zip (SHA-256 `4e69a86eef3cd47e9d8207413868cd08bcddeb2dae4047dbd10362e2a7a16bac`)
- Licence: Creative Commons Zero (CC0 1.0), http://creativecommons.org/publicdomain/zero/1.0/, as the package's `License.txt` states. Crediting is not required; we credit Kenney anyway.

The Scrolls and the HUD's strip are lettered in Kenney Mini. `scripts/build-font.mjs` reads the
font's pixel outlines and bakes 89 characters into bitmap glyphs in
`src/pixel-font.ts`, so the art draws the font's own pixels as paths and no
font is loaded where it is shown. To letter other characters, add them to
`CHARACTERS` in the script and run `node scripts/build-font.mjs`.

# Sound credits

The Sound cues in `sounds/` are each one clip of a CC0 pack (two laid
together for `boss`, `wrong` and `map`), converted with ffmpeg to mono
44.1 kHz MP3 at 96 kb/s, nothing else changed; 27 files, 272 KB in all.
Each pack's licence is Creative Commons Zero (CC0 1.0),
http://creativecommons.org/publicdomain/zero/1.0/, as its `License.txt`
or its OpenGameArt page states. Crediting is not required; we credit the
authors anyway. Chosen by name and length: no person has listened to the
set yet.

## The packs

- **Kenney: RPG Audio**, Kenney (www.kenney.nl), https://kenney.nl/assets/rpg-audio, downloaded 2026-10-24 as `kenney_rpg-audio.zip` (SHA-256 `6dbeaf8544da958d8f2adcb4a4a4b76c1ade34a05f8ab9edccd327da7375f38b`)
- **Kenney: Interface Sounds**, Kenney, https://kenney.nl/assets/interface-sounds, downloaded 2026-10-24 as `kenney_interface-sounds.zip` (SHA-256 `f2193d072726d6758a5f7871b2dcc54dcce0d5c35c6f0a62f92549b327c81232`)
- **Kenney: Impact Sounds**, Kenney, https://kenney.nl/assets/impact-sounds, downloaded 2026-10-24 as `kenney_impact-sounds.zip` (SHA-256 `029d734af1582474edf3a694d1b0cebc97c1c152f2f39fa34d4c2bafc5de77f8`)
- **Kenney: Music Jingles**, Kenney, https://kenney.nl/assets/music-jingles, downloaded 2026-10-24 as `kenney_music-jingles.zip` (SHA-256 `b729ba57959bd58793d2c5cafa348aaf2655d354f3da35ec4729e03ec77197b8`)
- **80 CC0 creature SFX**, rubberduck, https://opengameart.org/content/80-cc0-creature-sfx, downloaded 2026-10-24 as `80-CC0-creature-SFX_0.zip` (SHA-256 `5d4002eea42f278e76543bb36e8ddd2cb978588a13271984191d8228f5d26768`)
- **Heartbeat sounds**, bart, https://opengameart.org/content/heartbeat-sounds, downloaded 2026-10-24 as `heartbeat_slow_0.wav` (SHA-256 `ce5d2bbe4c9e2a8843fc76419070b9e88f71b2aa4ba7226a5f50a6b45d13be60`)
- **Fire crackling**, AntumDeluge, https://opengameart.org/content/fire-crackling, downloaded 2026-10-24 as `fire-1.ogg` (SHA-256 `f922929805bc6afdf0a35727fa3998033db544c1b6f62ed3aeab94341ed6ddeb`)

## The cues

| Cue | File (SHA-256 of the MP3) | From |
|---|---|---|
| quest-start | `quest-start.mp3` (`582ecd2aa6d3568b29b66f20b63e7e5af63ed7c3a1cfa2a048b01752ac789f7c`) | Music Jingles, `Sax jingles/jingles_SAX00.ogg` |
| discover | `discover.mp3` (`21730eb59e4b6fa7b9b298d3e2cbed7f17e5c57a5909110051ff62aa1168fa35`) | Interface Sounds, `glass_004.ogg` |
| forge | `forge.mp3` (`9d3423b428f737af42ec9089f0885022fc80ab28ca56b808b1ae6ff3bf76af22`) | Impact Sounds, `impactMetal_heavy_001.ogg` |
| monster (a bug) | `monster.mp3` (`cf2eb93f66be2b81b3cd4d938d53ad5cf0aa1b49191bc5bdfc734fc312c1ed20`) | creature SFX, `monster_02.ogg` |
| monster (a ghost) | `monster-ghost.mp3` (`29abdb7307fb84d79d3424557c0dcccbc425b5162a0b4fe1854ee19fa6fb1b45`) | creature SFX, `howl.ogg` |
| monster (a slime) | `monster-slime.mp3` (`ca8aae49f42075f34ca7c394fee6bfe5943df6cf6fa6e33978a21f540f44b10e`) | creature SFX, `burble_01.ogg` |
| hit | `hit.mp3` (`41965d55c043ebf2e5ed5b477a2b1fd48818bac0e01d0bfb8d47a59f582ea302`) | RPG Audio, `knifeSlice.ogg` |
| battle-won | `battle-won.mp3` (`23438499660a4de966441e05085022e8308bc626556a5d1e15b4a82079402813`) | Music Jingles, `8-Bit jingles/jingles_NES03.ogg` |
| sparkle | `sparkle.mp3` (`d1c92d5cf0d70eab19ed43fafa86b54220341e5fa11d9b49fd9c98820e781474`) | Interface Sounds, `question_001.ogg` |
| scroll | `scroll.mp3` (`74be662bdf180b4870fc67b5877bec7c1f6ab21f97555824f11f3fbd0653b779`) | RPG Audio, `bookFlip1.ogg` |
| map | `map.mp3` (`6bee898ea37cd4be1d8fdee778bf9c26b60524fcd0b682f58f3b30eb29e4d437`) | RPG Audio, `bookFlip2.ogg`, then `metalClick.ogg` at 0.3 s |
| right | `right.mp3` (`2e9d0a3464828da18f051aa593271d24230f859f22936b447fa99ad59174bccd`) | Interface Sounds, `confirmation_002.ogg` |
| wrong | `wrong.mp3` (`3868b82045cff71fd67a7c181fe0f31bb24ef082c59b40a3f8dc1444557811bc`) | Impact Sounds, `impactSoft_heavy_000.ogg`, under creature SFX `hurt_01.ogg` at 0.08 s |
| tick | `tick.mp3` (`f2791d831e2afc54f4f76de8bedac800cdb7da5e5284312f66d41d30c0ce935e`) | Interface Sounds, `tick_004.ogg` |
| chime | `chime.mp3` (`b0a6c15c223b0d483a2a6f14d5abe7bb0f3b85a6c163075e53d430ff17a29b65`) | Interface Sounds, `confirmation_003.ogg` |
| fizzle | `fizzle.mp3` (`924f274e9317fd08babaa01f568783e3d39381382f21afc161fdc08989e560fe`) | Interface Sounds, `error_005.ogg` |
| boss | `boss.mp3` (`c5e0a1210a805fb4a1900bb294e4a0fdadc6d5c6c3493b295310cf1f7676e95b`) | Impact Sounds, `impactPunch_heavy_000.ogg` (the drum), under creature SFX `roar_02.ogg` at 0.12 s |
| boss-hit | `boss-hit.mp3` (`7fb0d561e685b03e36ea5816ce74db633d2e10f74170fc94aab0936d1f7cee65`) | Impact Sounds, `impactPunch_heavy_001.ogg` |
| boss-fallen | `boss-fallen.mp3` (`e123cb4a036f12cb91d08915e2dffef87ae9d9c976e2d2a7e2e7f584d38b9ef2`) | creature SFX, `scream_01.ogg` |
| fanfare | `fanfare.mp3` (`a84e4909a3f186a93389f2da249b941b06c62ba60c7f27a4f49a02353b10d6ee`) | Music Jingles, `8-Bit jingles/jingles_NES13.ogg` |
| defeat | `defeat.mp3` (`79d38db400a29ba378602b58f962d456e11d2b66729ab309b8b66bc0d5440dc6`) | Music Jingles, `8-Bit jingles/jingles_NES08.ogg` |
| level-up | `level-up.mp3` (`7acd919d895429b6c1d70b8c88299c614f88c8bafbed93c95dee2f130cf65b73`) | Music Jingles, `8-Bit jingles/jingles_NES00.ogg` |
| badge | `badge.mp3` (`1c0e6f03eecf1f7996737870035c8f4dccc019ca07708daf84d52eea85e18949`) | RPG Audio, `handleCoins.ogg` |
| exhausted | `exhausted.mp3` (`30804463f6bab69f0159e9fae5390f673bc17b22f38b9f901bd0bb3b3b90b784`) | Heartbeat sounds, `heartbeat_slow_0.wav` |
| heal | `heal.mp3` (`16cc36b75c0b1cdcd776dd7cee9cff4929d4ccd512e9378c3edd3bf880c16307`) | Interface Sounds, `maximize_004.ogg` |
| campfire | `campfire.mp3` (`6a4645e21d285203e3ae2dbab1e2fce44e66c68a3b9061e3097fce66ad1192a1`) | Fire crackling, `fire-1.ogg` |
| ui | `ui.mp3` (`43876186db9da6844c6d9b95e103f3c39b25441f92b25edfcc44f079175561f1`) | Interface Sounds, `click_001.ogg` |

To change a clip, convert the pack's file the same way, for example
`ffmpeg -i in.ogg -ac 1 -ar 44100 -c:a libmp3lame -b:a 96k -map_metadata -1 -id3v2_version 0 -write_xing 0 sounds/<cue>.mp3`
(two laid together: `-i a.ogg -i b.ogg -filter_complex "[1]adelay=120|120[b];[0][b]amix=inputs=2:duration=longest:normalize=0"`),
keep each under 100 KB and the set under 1.5 MB, and update its row.
