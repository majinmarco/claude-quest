// Builds src/sprites.ts, the sprites the mod draws as pixel data, from the
// bundled Kenney tilesheets (CC0; see assets/CREDITS.md): Tiny Dungeon for the
// Scene, the HUD's portraits and the Region map's Rooms, UI Pack – Pixel
// Adventure for the scrolls, Tiny Town for the Region map's overworld:
//
//   node scripts/build-sprites.mjs
//
// The mod draws its art as SVG, so it needs pixels rather than a PNG: this
// decodes the sheets once, here, so nothing decodes a PNG while a session
// runs. Only Node's own zlib is used. Change SPRITES to pick other tiles.

import { readFileSync, writeFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

const OUT = new URL('../src/sprites.ts', import.meta.url)

/** A tile is 16 px square on every sheet, packed with no spacing. */
const TILE = 16

/** The sheets, each with its own count of tiles a row (its Tilesheet.txt). */
const SHEETS = {
  dungeon: { file: '../assets/kenney-tiny-dungeon/tilemap_packed.png', columns: 12, name: 'the sheet' },
  ui: { file: '../assets/kenney-ui-pixel-adventure/tilemap_packed.png', columns: 23, name: 'the Pixel Adventure sheet' },
  town: { file: '../assets/kenney-tiny-town/tilemap_packed.png', columns: 12, name: 'the Tiny Town sheet' },
}

/** Turns a tile on its side: its columns become rows. */
const transpose = rows => rows[0].map((_, x) => rows.map(row => row[x]))

/** Cuts the `height` rows from `top`, and the `width` columns from `left`. */
const crop = (left, top, width, height) => rows =>
  rows.slice(top, top + height).map(row => row.slice(left, left + width))

/**
 * The tiles drawn, by name: their sheet, their index on it, and how the tile
 * is cut or turned before it is drawn (`how` says so in the generated file).
 */
const SPRITES = {
  wall: { sheet: 'dungeon', index: 40 },
  banner: { sheet: 'dungeon', index: 29 },
  floor: { sheet: 'dungeon', index: 48 },
  floorSpeckled: { sheet: 'dungeon', index: 49 },
  floorStones: { sheet: 'dungeon', index: 42 },
  hero: { sheet: 'dungeon', index: 97 },
  chest: { sheet: 'dungeon', index: 89 },
  chestOpen: { sheet: 'dungeon', index: 91 },
  spider: { sheet: 'dungeon', index: 122 },
  slime: { sheet: 'dungeon', index: 108 },
  ghost: { sheet: 'dungeon', index: 121 },
  blacksmith: { sheet: 'dungeon', index: 86 },
  anvil: { sheet: 'dungeon', index: 74 },
  hammer: { sheet: 'dungeon', index: 117 },
  sword: { sheet: 'dungeon', index: 104 },
  shield: { sheet: 'dungeon', index: 102 },
  axe: { sheet: 'dungeon', index: 118 },
  dagger: { sheet: 'dungeon', index: 103 },
  staff: { sheet: 'dungeon', index: 129 },
  sage: { sheet: 'dungeon', index: 84 },
  // The Quest Giver, who briefs a Quest at its start: the grey-haired elder.
  questGiver: { sheet: 'dungeon', index: 100 },
  // The Cartographer, who asks about the Modules just read: the traveller in purple.
  cartographer: { sheet: 'dungeon', index: 99 },
  boss: { sheet: 'dungeon', index: 110 },
  // The HUD's portraits by Title; before a Title it is the hero tile, a plain adventurer.
  scholar: { sheet: 'dungeon', index: 111 },
  pathfinder: { sheet: 'dungeon', index: 112 },
  warrior: { sheet: 'dungeon', index: 87 },
  // A scroll's roller lies across the card: the rod's tiles turned on their
  // side, the 10 rows the rod fills kept. The cap's rounded end is on the left.
  rodCap: { sheet: 'ui', index: 115, how: 'turned on its side, rows 3-12', shape: rows => crop(0, 3, 16, 10)(transpose(rows)) },
  rodBody: { sheet: 'ui', index: 138, how: 'turned on its side, rows 3-12', shape: rows => crop(0, 3, 16, 10)(transpose(rows)) },
  ribbonLeft: { sheet: 'ui', index: 83 },
  ribbonMid: { sheet: 'ui', index: 84 },
  ribbonRight: { sheet: 'ui', index: 85 },
  // A difficulty pip: the gem's 8 x 8 centre, gold filled, grey empty.
  gem: { sheet: 'ui', index: 76, how: 'its 8 x 8 centre', shape: crop(4, 4, 8, 8) },
  gemEmpty: { sheet: 'ui', index: 53, how: 'its 8 x 8 centre', shape: crop(4, 4, 8, 8) },
  // The Region map's overworld (src/map-art.ts): open land, trees, the dirt
  // road between sites, a Dungeon's gate in castle wall, and a camp of the
  // Wilds.
  grass: { sheet: 'town', index: 0 },
  grassTufts: { sheet: 'town', index: 1 },
  grassFlowers: { sheet: 'town', index: 2 },
  treeGreen: { sheet: 'town', index: 28 },
  treeAutumn: { sheet: 'town', index: 27 },
  bush: { sheet: 'town', index: 5 },
  mushrooms: { sheet: 'town', index: 29 },
  dirt: { sheet: 'town', index: 25 },
  gateLeft: { sheet: 'town', index: 111 },
  gateRight: { sheet: 'town', index: 112 },
  gateFootLeft: { sheet: 'town', index: 123 },
  gateFootRight: { sheet: 'town', index: 124 },
  signpost: { sheet: 'town', index: 83 },
  cauldron: { sheet: 'town', index: 107 },
  logPile: { sheet: 'town', index: 106 },
}

/** Decodes an 8-bit indexed PNG (the sheet's kind) into RGBA rows. */
function decode(png) {
  let at = 8
  let width = 0
  let height = 0
  let palette = []
  let alpha = []
  const data = []

  while (at < png.length) {
    const length = png.readUInt32BE(at)
    const type = png.toString('ascii', at + 4, at + 8)
    const body = png.subarray(at + 8, at + 8 + length)
    if (type === 'IHDR') {
      width = body.readUInt32BE(0)
      height = body.readUInt32BE(4)
      const [depth, colorType, , , interlace] = body.subarray(8)
      if (depth !== 8 || colorType !== 3 || interlace !== 0) {
        throw new Error(`expected an 8-bit indexed, non-interlaced PNG; got depth ${depth}, type ${colorType}`)
      }
    }
    if (type === 'PLTE') {
      palette = [...Array(length / 3)].map((_, i) => [body[i * 3], body[i * 3 + 1], body[i * 3 + 2]])
    }
    if (type === 'tRNS') {
      alpha = [...body]
    }
    if (type === 'IDAT') {
      data.push(body)
    }
    at += 12 + length
  }

  const raw = inflateSync(Buffer.concat(data))
  const indices = []
  let previous = new Uint8Array(width)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (width + 1)]
    const line = raw.subarray(y * (width + 1) + 1, (y + 1) * (width + 1))
    const row = new Uint8Array(width)
    for (let x = 0; x < width; x++) {
      const a = x > 0 ? row[x - 1] : 0
      const b = previous[x]
      const c = x > 0 ? previous[x - 1] : 0
      const p = a + b - c
      const pa = Math.abs(p - a)
      const pb = Math.abs(p - b)
      const pc = Math.abs(p - c)
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      const predicted = [0, a, b, (a + b) >> 1, paeth][filter]
      if (predicted === undefined) {
        throw new Error(`unknown PNG filter ${filter}`)
      }
      row[x] = (line[x] + predicted) & 0xff
    }
    indices.push(row)
    previous = row
  }

  const rgba = (index) => [...palette[index], alpha[index] ?? 255]

  return { width, height, pixel: (x, y) => rgba(indices[y][x]) }
}

const hex = ([r, g, b]) => `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`

/** A tile as rows of colours, null clear. */
function tile(sheet, columns, index) {
  const left = (index % columns) * TILE
  const top = Math.floor(index / columns) * TILE

  return [...Array(TILE)].map((_, y) =>
    [...Array(TILE)].map((_, x) => {
      const color = sheet.pixel(left + x, top + y)

      return color[3] < 128 ? null : hex(color)
    }),
  )
}

/** Rows of colours as a palette and rows of palette letters, `.` clear. */
function sprite(pixels) {
  const palette = []
  const rows = pixels.map(row =>
    row
      .map(color => {
        if (color === null) {
          return '.'
        }
        let at = palette.indexOf(color)
        if (at === -1) {
          at = palette.push(color) - 1
        }

        return 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'[at]
      })
      .join(''),
  )

  return { palette, rows }
}

const sheets = Object.fromEntries(
  Object.entries(SHEETS).map(([key, { file }]) => [key, decode(readFileSync(new URL(file, import.meta.url)))]),
)
const entries = Object.entries(SPRITES).map(([name, { sheet, index, how, shape = rows => rows }]) => {
  const { palette, rows } = sprite(shape(tile(sheets[sheet], SHEETS[sheet].columns, index)))

  return `  /** Tile ${index} of ${SHEETS[sheet].name}${how === undefined ? '' : `, ${how}`}. */\n  ${name}: {\n    palette: ${JSON.stringify(palette)},\n    rows: [\n${rows.map(row => `      '${row}',`).join('\n')}\n    ],\n  },`
})

writeFileSync(
  OUT,
  `// Generated by scripts/build-sprites.mjs from Kenney's Tiny Dungeon, UI Pack –
// Pixel Adventure and Tiny Town (all CC0): assets/kenney-tiny-dungeon,
// assets/kenney-ui-pixel-adventure and assets/kenney-tiny-town, credited in
// assets/CREDITS.md. Do not edit; change the script and run it again.

/**
 * A sprite: each row a string of letters, each letter an index into
 * \`palette\` (\`a\` the first), \`.\` a clear pixel. A whole tile is 16 x 16;
 * the scroll's pieces are cut smaller.
 */
export type Sprite = { palette: readonly string[]; rows: readonly string[] }

export const SPRITE_SIZE = ${TILE}

export const SPRITES = {
${entries.join('\n')}
} as const satisfies Record<string, Sprite>

export type SpriteName = keyof typeof SPRITES
`,
)
