// Builds src/pixel-font.ts, the Quest Board's lettering as bitmap glyphs,
// from the bundled Kenney Mini font (CC0; see assets/CREDITS.md):
//
//   node scripts/build-font.mjs
//
// Kenney Mini is a pixel font: every outline runs along a grid. This reads
// the TTF's outlines (cmap format 4, simple glyphs only) and samples each
// grid cell's centre, so the scroll art draws the font's own pixels as SVG
// paths and needs no font loaded where it is shown. Only the characters in
// CHARACTERS are baked; the art draws any other as `?`.

import { readFileSync, writeFileSync } from 'node:fs'

const FONT = new URL('../assets/kenney-fonts/Kenney Mini.ttf', import.meta.url)
const OUT = new URL('../src/pixel-font.ts', import.meta.url)

/** What the Quest Board writes: letters, digits, and the marks its cards use. */
const CHARACTERS = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#.-:/()·,\'!?_+&[]%"<>=*@ ',
]

const b = readFileSync(FONT)

const tables = {}
for (let i = 0; i < b.readUInt16BE(4); i++) {
  const at = 12 + i * 16
  tables[b.toString('ascii', at, at + 4)] = b.readUInt32BE(at + 8)
}
const T = tables

const locaFormat = b.readInt16BE(T.head + 50)
const metricCount = b.readUInt16BE(T.hhea + 34)
const ascender = b.readInt16BE(T.hhea + 4)
const descender = b.readInt16BE(T.hhea + 6)
const loca = g => (locaFormat ? b.readUInt32BE(T.loca + g * 4) : b.readUInt16BE(T.loca + g * 2) * 2)
const advance = g => b.readUInt16BE(T.hmtx + Math.min(g, metricCount - 1) * 4)

// The Unicode cmap, format 4.
let cmap = null
for (let i = 0; i < b.readUInt16BE(T.cmap + 2); i++) {
  const at = T.cmap + 4 + i * 8
  const platform = b.readUInt16BE(at)
  const offset = T.cmap + b.readUInt32BE(at + 4)
  if (b.readUInt16BE(offset) === 4 && (platform === 3 || platform === 0)) {
    cmap = offset
  }
}
if (cmap === null) {
  throw new Error('no Unicode cmap of format 4')
}
const segmentsX2 = b.readUInt16BE(cmap + 6)
const ends = cmap + 14
const starts = ends + segmentsX2 + 2
const deltas = starts + segmentsX2
const rangeOffsets = deltas + segmentsX2

/** The glyph index of a code point; 0 when the font has none. */
const glyphOf = code => {
  for (let i = 0; i < segmentsX2 / 2; i++) {
    const end = b.readUInt16BE(ends + i * 2)
    const start = b.readUInt16BE(starts + i * 2)
    if (code > end) {
      continue
    }
    if (code < start) {
      return 0
    }
    const delta = b.readInt16BE(deltas + i * 2)
    const rangeOffset = b.readUInt16BE(rangeOffsets + i * 2)
    if (rangeOffset === 0) {
      return (code + delta) & 0xffff
    }
    const g = b.readUInt16BE(rangeOffsets + i * 2 + rangeOffset + (code - start) * 2)

    return g === 0 ? 0 : (g + delta) & 0xffff
  }

  return 0
}

/** A simple glyph's contours, as lists of points in font units. */
function contours(g) {
  const at = T.glyf + loca(g)
  if (loca(g + 1) === loca(g)) {
    return []
  }
  const count = b.readInt16BE(at)
  if (count < 0) {
    throw new Error(`glyph ${g} is composite`)
  }
  const endPoints = [...Array(count)].map((_, i) => b.readUInt16BE(at + 10 + i * 2))
  const points = endPoints[count - 1] + 1
  let p = at + 10 + count * 2
  p += 2 + b.readUInt16BE(p)
  const flags = []
  while (flags.length < points) {
    const flag = b[p++]
    flags.push(flag)
    if (flag & 8) {
      for (let repeat = b[p++]; repeat > 0; repeat--) {
        flags.push(flag)
      }
    }
  }
  const coordinates = (short, same) => {
    const out = []
    let v = 0
    for (const flag of flags) {
      if (flag & short) {
        const d = b[p++]
        v += flag & same ? d : -d
      } else if (!(flag & same)) {
        v += b.readInt16BE(p)
        p += 2
      }
      out.push(v)
    }

    return out
  }
  const xs = coordinates(2, 16)
  const ys = coordinates(4, 32)
  const out = []
  let first = 0
  for (const end of endPoints) {
    out.push(xs.slice(first, end + 1).map((x, i) => [x, ys[first + i]]))
    first = end + 1
  }

  return out
}

/** Whether a point is inside the contours, by the even-odd rule. */
const inside = (shape, x, y) => {
  let crossings = 0
  for (const contour of shape) {
    for (let i = 0; i < contour.length; i++) {
      const [x1, y1] = contour[i]
      const [x2, y2] = contour[(i + 1) % contour.length]
      if (y1 <= y !== y2 <= y && x < x1 + ((y - y1) * (x2 - x1)) / (y2 - y1)) {
        crossings ^= 1
      }
    }
  }

  return crossings === 1
}

// The font's pixel: the greatest common divisor of every coordinate and advance.
const gcd = (a, c) => (c ? gcd(c, a % c) : Math.abs(a))
let unit = 0
const glyphs = CHARACTERS.map(character => {
  const g = glyphOf(character.codePointAt(0))
  if (g === 0 && character !== ' ') {
    throw new Error(`Kenney Mini has no ${JSON.stringify(character)}`)
  }
  const shape = g === 0 ? [] : contours(g)
  for (const [x, y] of shape.flat()) {
    unit = gcd(gcd(unit, x), y)
  }
  unit = gcd(unit, advance(g))

  return { character, g, shape }
})

const top = Math.ceil(ascender / unit)
const bottom = Math.floor(descender / unit)
const baked = {}
for (const { character, g, shape } of glyphs) {
  const width = advance(g) / unit
  const rows = []
  for (let row = top - 1; row >= bottom; row--) {
    let line = ''
    for (let x = 0; x < width; x++) {
      line += inside(shape, (x + 0.5) * unit, (row + 0.5) * unit) ? '#' : '.'
    }
    rows.push(line)
  }
  baked[character] = rows
}

// Rows no glyph inks are left out, above and below.
const isEmpty = row => Object.values(baked).every(rows => !rows[row].includes('#'))
let first = 0
let last = top - bottom - 1
while (isEmpty(first)) first++
while (isEmpty(last)) last--
for (const character in baked) {
  baked[character] = baked[character].slice(first, last + 1)
}
const height = last - first + 1

writeFileSync(
  OUT,
  `// Generated by scripts/build-font.mjs from Kenney Mini (CC0):
// assets/kenney-fonts, credited in assets/CREDITS.md. Do not edit; change the
// script and run it again.

/** How many pixel rows every glyph has: a capital takes ${height - 2} of them. */
export const GLYPH_HEIGHT = ${height}

/**
 * The glyphs, by character: each row a string, \`#\` inked, \`.\` clear; a
 * glyph's width is its advance, the gap after it included.
 */
export const GLYPHS: Readonly<Record<string, readonly string[]>> = {
${Object.entries(baked)
  .map(([character, rows]) => `  ${JSON.stringify(character)}: [${rows.map(row => `'${row}'`).join(', ')}],`)
  .join('\n')}
}
`,
)

console.log(`${Object.keys(baked).length} glyphs, ${height} rows`)
