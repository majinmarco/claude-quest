// The Quest Board's art: each Quest card as a pixel scroll, rolled (one strip
// between two rollers) or unrolled (the whole card, unrolling once), and the
// board's ribbon header. The rollers, ribbon and gems are Kenney's UI Pack –
// Pixel Adventure tiles (src/sprites.ts); the lettering is Kenney Mini baked
// to glyphs (src/pixel-font.ts), drawn as paths, so no font is loaded where
// the art is shown, and no text of the card reaches the markup.

import { GLYPH_HEIGHT, GLYPHS } from './pixel-font'
import { SPRITES } from './sprites'
import type { Sprite } from './sprites'
import type { Difficulty, QuestCard, StatName } from '../types'

/** The art's width in its own pixels, drawn at twice that in CSS pixels. */
const WIDTH = 192
const SCALE = 2

/** The CSS pixels the art takes across: the Scene's width. */
export const SCROLL_WIDTH = WIDTH * SCALE

/** The scroll's colours, which the terminal's text scroll takes too. */
export const SCROLL_COLORS = {
  paper: '#fff1d2',
  edge: '#c58747',
  edgeDark: '#a3703a',
  ink: '#6d4b27',
  ticket: '#8e3f38',
  ribbon: '#e2665b',
} as const

const { paper: PAPER, edge: EDGE, edgeDark: EDGE_DARK, ink: INK, ticket: TICKET, ribbon: RIBBON_RED } = SCROLL_COLORS

/** Between two lines of text, in pixels. */
const LINE = GLYPH_HEIGHT + 2

/** The paper's left and right edges, inside the rollers' caps; the text starts 3 pixels in. */
const LEFT = 6
const RIGHT = WIDTH - 6
const TEXT_X = LEFT + 3
const TEXT_WIDTH = RIGHT - LEFT - 6

/** A roller's height, and a rolled card's. */
const ROLLER = 10
const ROLLED_HEIGHT = 30

/** The unroll: how many steps, over how long. */
const UNROLL_STEPS = 6
const UNROLL_SECONDS = 0.45

/** The Stats by their short names, as a card shows them. */
export const STAT_ABBREVIATION: Record<StatName, string> = {
  intelligence: 'INT',
  wisdom: 'WIS',
  dexterity: 'DEX',
  strength: 'STR',
  charisma: 'CHA',
  constitution: 'CON',
}

/** A card's tags beside its status, the status itself left out. */
export const tagsOf = (card: QuestCard): string[] => (card.tags ?? []).filter(tag => tag !== card.status)

/** How many of the five gems a difficulty fills. */
export const PIPS: Record<Difficulty, number> = { Trivial: 1, Easy: 2, Medium: 3, Hard: 4, Epic: 5, Unrated: 0 }

/** The glyph a character is drawn with: its own, or `?` when the font lacks it. */
const glyphCharacter = (character: string): string => (GLYPHS[character] === undefined ? '?' : character)

/** The rows a character is drawn with. */
const glyphOf = (character: string): readonly string[] => GLYPHS[glyphCharacter(character)] ?? []

/** How wide `text` is drawn, in pixels. */
export const pixelWidth = (text: string): number =>
  [...text].reduce((width, character) => width + (glyphOf(character)[0]?.length ?? 0), 0)

/** How a text is measured, and the mark that ends one cut short. */
export type Measure = { width: (text: string) => number; ellipsis: string }

/** The scroll art's measure: pixels of the baked font, `...` its cut. */
const PIXELS: Measure = { width: pixelWidth, ellipsis: '...' }

/** `text` cut to `max`, the measure's ellipsis after it when cut, or always when `isEllipsisForced`. */
export const cutText = (text: string, max: number, measure: Measure = PIXELS, isEllipsisForced = false): string => {
  if (!isEllipsisForced && measure.width(text) <= max) {
    return text
  }
  let kept = [...text]
  while (kept.length > 0 && measure.width(`${kept.join('').trimEnd()}${measure.ellipsis}`) > max) {
    kept = kept.slice(0, -1)
  }

  return kept.length === 0 ? '' : `${kept.join('').trimEnd()}${measure.ellipsis}`
}

/**
 * `text` in lines of at most `max`, broken between words, at most `lines` of
 * them: the last cut with the ellipsis when the text runs over, and a word
 * too long for a line cut too.
 */
export const wrapText = (text: string, max: number, lines: number, measure: Measure = PIXELS): string[] => {
  const out: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line === '' ? word : `${line} ${word}`
    if (measure.width(next) <= max || line === '') {
      line = next
      continue
    }
    out.push(line)
    line = word
  }
  if (line !== '') {
    out.push(line)
  }
  if (out.length > lines) {
    out.length = lines
    out[lines - 1] = cutText(out[lines - 1] ?? '', max, measure, true)
  }

  return out.map(each => cutText(each, max, measure))
}

/** `text` in lines of at most `max` pixels of the baked font: see wrapText. */
export const wrapPixelText = (text: string, max: number, lines: number): string[] => wrapText(text, max, lines)

/** `text` cut to `max` pixels: see cutText. */
const truncate = (text: string, max: number): string => cutText(text, max)

/** The pixels drawn: a colour per pixel, the last drawn on top. */
class Canvas {
  private readonly pixels = new Map<string, { x: number; y: number; color: string }>()

  set(x: number, y: number, color: string): void {
    this.pixels.set(`${x},${y}`, { x, y, color })
  }

  rect(x: number, y: number, width: number, height: number, color: string): void {
    for (let row = 0; row < height; row++) {
      for (let column = 0; column < width; column++) {
        this.set(x + column, y + row, color)
      }
    }
  }

  /** A sprite at `x`, `y`; its first `width` columns only, when given; mirrored left to right. */
  sprite(sprite: Sprite, x: number, y: number, { width = Infinity, mirrored = false } = {}): void {
    sprite.rows.forEach((row, at) => {
      const letters = mirrored ? [...row].reverse() : [...row]
      letters.slice(0, width).forEach((letter, column) => {
        const code = letter.charCodeAt(0)
        const color = letter === '.' ? undefined : sprite.palette[letter >= 'a' ? code - 97 : code - 65 + 26]
        if (color !== undefined) {
          this.set(x + column, y + at, color)
        }
      })
    })
  }

  /** The pixels as SVG: one path per colour, each row's run one segment. */
  svg(): string {
    const rows = new Map<string, number[]>()
    for (const { x, y, color } of this.pixels.values()) {
      const key = `${color}|${y}`
      const xs = rows.get(key) ?? []
      xs.push(x)
      rows.set(key, xs)
    }
    const byColor = new Map<string, string[]>()
    for (const [key, xs] of rows) {
      const [color = '', y] = key.split('|')
      const segments = byColor.get(color) ?? []
      xs.sort((a, b) => a - b)
      let start = xs[0] ?? 0
      let end = start
      for (const x of [...xs.slice(1), Infinity]) {
        if (x === end + 1) {
          end = x
          continue
        }
        const length = end - start + 1
        segments.push(`M${start} ${y}h${length}v1h-${length}z`)
        start = end = x
      }
      byColor.set(color, segments)
    }

    return [...byColor].map(([color, segments]) => `<path fill="${color}" d="${segments.join('')}"/>`).join('')
  }
}

/** The text drawn on one SVG: each glyph used is defined once, then placed. */
class Lettering {
  private readonly used = new Set<string>()

  /** `text` with its top left at `x`, `y`, in `color`. */
  text(text: string, x: number, y: number, color: string): string {
    let at = x
    let out = ''
    for (const character of text) {
      const drawn = glyphCharacter(character)
      if (drawn !== ' ') {
        this.used.add(drawn)
        out += `<use href="#${glyphId(drawn)}" x="${at}" y="${y}"/>`
      }
      at += glyphOf(character)[0]?.length ?? 0
    }

    return out === '' ? '' : `<g fill="${color}">${out}</g>`
  }

  /** The glyphs used, as `<defs>`. */
  defs(): string {
    return `<defs>${[...this.used].map(character => `<path id="${glyphId(character)}" d="${glyphPath(glyphOf(character))}"/>`).join('')}</defs>`
  }
}

/** A glyph's id in its SVG's `<defs>`: `g` and its code point in hex. */
const glyphId = (character: string): string => `g${(character.codePointAt(0) ?? 63).toString(16)}`

/** A glyph's inked pixels as one path, each row's run a segment. */
const glyphPath = (rows: readonly string[]): string =>
  rows
    .flatMap((row, y) => {
      const segments: string[] = []
      let x = 0
      while (x < row.length) {
        if (row[x] !== '#') {
          x += 1
          continue
        }
        let length = 1
        while (row[x + length] === '#') {
          length += 1
        }
        segments.push(`M${x} ${y}h${length}v1h-${length}z`)
        x += length
      }

      return segments
    })
    .join('')

/** A roller across the card at `y`: the rod's rounded caps, its body between. */
const roller = (canvas: Canvas, y: number): void => {
  const left = 2
  const right = WIDTH - 2
  // The cap's first two columns are clear: its rounded end starts on the third.
  canvas.sprite(SPRITES.rodCap, left - 2, y)
  for (let x = left + 12; x < right - 12; x += 16) {
    canvas.sprite(SPRITES.rodBody, x, y, { width: right - 12 - x })
  }
  canvas.sprite(SPRITES.rodCap, right - 14, y, { mirrored: true })
}

/** A gem's width, its rounded corners keeping the five apart. */
const GEM = 8

/** Where the gems end, a pixel of paper before the card's right edge. */
const GEMS_RIGHT = RIGHT - 2

/**
 * The difficulty at the card's right: five gems filled by difficulty, their
 * right end at GEMS_RIGHT; Unrated, a `?` alone in their place.
 */
const difficultyMark = (canvas: Canvas, lettering: Lettering, difficulty: Difficulty, y: number): string => {
  if (difficulty === 'Unrated') {
    return lettering.text('?', GEMS_RIGHT - pixelWidth('?'), y + 1, TICKET)
  }
  for (let at = 0; at < 5; at++) {
    canvas.sprite(at < PIPS[difficulty] ? SPRITES.gem : SPRITES.gemEmpty, GEMS_RIGHT - (5 - at) * GEM, y)
  }

  return ''
}

/** How wide the difficulty is drawn: the five gems, or an Unrated `?`. */
const difficultyWidth = (difficulty: Difficulty): number => (difficulty === 'Unrated' ? pixelWidth('?') : 5 * GEM)

/** The paper between `top` and `bottom`, its edges shaded. */
const paper = (canvas: Canvas, top: number, bottom: number): void => {
  canvas.rect(LEFT, top, RIGHT - LEFT, bottom - top, PAPER)
  canvas.rect(LEFT, top, 1, bottom - top, EDGE)
  canvas.rect(RIGHT - 1, top, 1, bottom - top, EDGE_DARK)
}

/** The art as an SVG document, `height` pixels tall, drawn at twice its size. */
const svgOf = (height: number, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${height}" width="${WIDTH * SCALE}" height="${height * SCALE}" shape-rendering="crispEdges">${body}</svg>`

/**
 * What an unrolled card says under its title, a line each: its difficulty
 * and Quest reward (`xp`), Stats, status, and tags beside the status.
 */
export const cardDetails = (card: QuestCard, xp: number): string[] => {
  const tags = tagsOf(card)

  return [
    `${card.difficulty} · Boss: +${xp} XP`,
    `Stats: ${card.recommendedStats.map(stat => STAT_ABBREVIATION[stat]).join(' ')}`,
    `Status: ${card.status}`,
    ...(tags.length === 0 ? [] : [`Tags: ${tags.map(tag => `#${tag}`).join(' ')}`]),
  ]
}

/** The pixels left for a card's head line, 3 before its gems (or an Unrated `?`). */
const headRoom = (difficulty: Difficulty): number => GEMS_RIGHT - difficultyWidth(difficulty) - 3 - TEXT_X

/** A rolled card: a strip between two rollers. */
const rolledCard = (card: QuestCard): string => {
  const canvas = new Canvas()
  const lettering = new Lettering()
  const y = 12
  paper(canvas, 8, 22)
  roller(canvas, 0)
  roller(canvas, ROLLED_HEIGHT - ROLLER)
  const mark = difficultyMark(canvas, lettering, card.difficulty, y - 1)
  const ticket = `${card.ticket} `
  const room = headRoom(card.difficulty)
  const shownTicket = truncate(ticket, room)
  const text =
    lettering.text(shownTicket, TEXT_X, y, TICKET) +
    lettering.text(truncate(card.title, room - pixelWidth(shownTicket)), TEXT_X + pixelWidth(shownTicket), y, INK) +
    mark

  return svgOf(ROLLED_HEIGHT, lettering.defs() + canvas.svg() + text)
}

/** An unrolled card: the whole card, unrolling once. */
const unrolledCard = (card: QuestCard, xp: number): string => {
  const canvas = new Canvas()
  const lettering = new Lettering()
  const headY = 12
  const title = wrapPixelText(card.title, TEXT_WIDTH, 3)
  const details = cardDetails(card, xp).map(line => truncate(line, TEXT_WIDTH))
  const titleY = headY + 12
  const divider = titleY + title.length * LINE + 2
  const detailsY = divider + 5
  const paperBottom = detailsY + details.length * LINE + 4
  const height = paperBottom + ROLLER

  paper(canvas, 8, paperBottom)
  for (let x = TEXT_X; x < TEXT_X + TEXT_WIDTH; x += 3) {
    canvas.set(x, divider, EDGE)
  }
  roller(canvas, 0)
  const mark = difficultyMark(canvas, lettering, card.difficulty, headY - 1)
  const room = headRoom(card.difficulty)
  const text =
    lettering.text(truncate(`Quest ${card.ticket}`, room), TEXT_X, headY, TICKET) +
    mark +
    title.map((line, at) => lettering.text(line, TEXT_X, titleY + at * LINE, INK)).join('') +
    details.map((line, at) => lettering.text(line, TEXT_X, detailsY + at * LINE, at === 0 ? TICKET : INK)).join('')

  const bottom = new Canvas()
  roller(bottom, 0)

  // The paper unrolls: a clip growing in steps from a rolled card's height,
  // the bottom roller going down with it. The resting values are the open
  // card's, so a viewer without SMIL draws it open.
  const rest = paperBottom - 2
  const from = ROLLED_HEIGHT - ROLLER
  const steps = Array.from({ length: UNROLL_STEPS + 1 }, (_, at) => Math.round(from + ((rest - from) * at) / UNROLL_STEPS))
  const timing = `calcMode="discrete" dur="${UNROLL_SECONDS}s" fill="freeze"`
  const body =
    `<clipPath id="unroll"><rect width="${WIDTH}" height="${rest + 2}">` +
    `<animate attributeName="height" values="${steps.map(y => y + 2).join(';')}" ${timing}/></rect></clipPath>` +
    `<g clip-path="url(#unroll)">${canvas.svg()}${text}</g>` +
    `<g transform="translate(0 ${rest})">${bottom.svg()}` +
    `<animateTransform attributeName="transform" type="translate" values="${steps.map(y => `0 ${y}`).join(';')}" ${timing}/></g>`

  return svgOf(height, lettering.defs() + body)
}

/**
 * A Quest card as a scroll, an SVG document 384 CSS pixels wide. Rolled: its
 * ticket and title on one strip, the title cut to fit, and its difficulty as
 * five gems (Unrated: a `?` alone). Unrolled: `Quest #6` and the
 * gems, the title in up to three lines, then its difficulty and Quest reward
 * (`xp`), Stats, status and tags; it unrolls once as it is first drawn.
 */
export const scrollCardSvg = (card: QuestCard, { unrolled, xp }: { unrolled: boolean; xp: number }): string =>
  unrolled ? unrolledCard(card, xp) : rolledCard(card)

/** The board's header: a red ribbon, `label` across its middle. */
export const boardHeaderSvg = (label: string): string => {
  const canvas = new Canvas()
  const lettering = new Lettering()
  const left = 16
  const right = WIDTH - 16
  canvas.sprite(SPRITES.ribbonLeft, left, 0)
  for (let x = left + 16; x < right - 16; x += 16) {
    canvas.sprite(SPRITES.ribbonMid, x, 0, { width: right - 16 - x })
  }
  canvas.sprite(SPRITES.ribbonRight, right - 16, 0)
  const shown = truncate(label, right - left - 40)
  const width = pixelWidth(shown)
  const x = Math.round((WIDTH - width) / 2)
  // The ribbon's stripes run through its middle: red laid under the words.
  canvas.rect(x - 3, 6, width + 5, 6, RIBBON_RED)
  const text = lettering.text(shown, x, 5, PAPER)

  return svgOf(16, lettering.defs() + canvas.svg() + text)
}
