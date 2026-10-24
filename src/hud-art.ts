// The HUD's pixel strip, where the surface draws SVG: one row of segments
// drawn from the same sprites and baked Kenney Mini glyphs as the Scene and
// the Scrolls (src/sprites.ts, src/pixel-font.ts). Its pixels are drawn at 2x
// (the portrait at 3x) on a band 48 CSS px tall. What the strip shows, and in
// what order of importance, is the HUD's (src/hud.tsx); this draws it.

import type { Player } from '../types'
import { titleOf } from './engine'
import type { ManaLevel } from './engine'
import { Canvas, Lettering, pixelWidth, SCROLL_COLORS } from './scroll-art'
import { SPRITES } from './sprites'
import type { Sprite, SpriteName } from './sprites'

/** CSS px a strip pixel takes. */
const SCALE = 2

/** The strip's height in its own pixels. */
const HEIGHT = 24

/** The strip's height in CSS px. */
export const STRIP_HEIGHT = HEIGHT * SCALE

/** Strip pixels a column of the band takes: about 8 CSS px. */
export const PIXELS_PER_COLUMN = 4

/** Strip pixels between two segments. */
export const SEGMENT_GAP = 6

/** A bar's least width and its thickness, in strip pixels (6 CSS px thick). */
const BAR = 36
const BAR_THICKNESS = 3

/** Where a line of text alone sits, centred. */
const LINE_Y = 8

/** Where a bar's label sits, and the bar under it. */
const LABEL_Y = 3
const BAR_Y = 13

/** Where a 16 px sprite sits, centred on the strip. */
const SPRITE_Y = 4

/** The strip's colours, from the sprites' palette. */
const COLORS = {
  panel: '#181425',
  panelInner: '#262b44',
  frame: '#3a4466',
  text: '#c0cbdc',
  dim: '#8b9bb4',
  gold: '#fee761',
  xp: '#feae34',
  red: '#e43b44',
  green: '#63c74d',
  blue: '#0099db',
  barEmpty: '#3a4466',
  flash: '#ffffff',
} as const

/** Mana's colour as it fills, as the text band colours it. */
const MANA_COLORS: Record<ManaLevel, string> = { calm: COLORS.blue, filling: COLORS.gold, warning: COLORS.red }

/** The portraits a Player can have: a plain adventurer until a Title, then the Title's. */
export type Portrait = 'adventurer' | 'scholar' | 'pathfinder' | 'warrior'

/** Each Title's portrait. */
const PORTRAITS: Record<string, Portrait> = { Scholar: 'scholar', Pathfinder: 'pathfinder', Warrior: 'warrior' }

/** The sprite each portrait is drawn with: the adventurer is the Scene's hero tile. */
const PORTRAIT_SPRITES: Record<Portrait, SpriteName> = {
  adventurer: 'hero',
  scholar: 'scholar',
  pathfinder: 'pathfinder',
  warrior: 'warrior',
}

/** The Player's portrait: by their Title (a Veteran's too), else the plain adventurer. */
export const portraitOf = (player: Player): Portrait => {
  const title = titleOf(player)

  return title === null ? 'adventurer' : (PORTRAITS[title.replace(/^Veteran /, '')] ?? 'adventurer')
}

/** A segment of the strip: what it shows, as the HUD's parts say. */
export type StripSegment =
  | { kind: 'level'; portrait: Portrait; text: string }
  | { kind: 'hp'; hp: number; maxHp: number; isLow: boolean }
  | { kind: 'xp'; xp: number; toClear: number }
  | { kind: 'badges'; count: number }
  | { kind: 'quest'; ticket: string; title: string }
  | { kind: 'boss'; isApproaching: boolean; hp: number; maxHp: number }
  | { kind: 'questions'; count: number }
  | { kind: 'encounter'; sprite: SpriteName; text: string }
  | { kind: 'mana'; mana: number | null; level: ManaLevel }
  | { kind: 'vitals'; text: string }
  | { kind: 'stats'; text: string }

/** The one-shot motion of a draw: HP lost since the last, or XP gained from `xpFrom` (a share). */
export type StripMotion = { isHpLost: boolean; xpFrom: number | null }

/** A draw with nothing to play. */
export const STILL: StripMotion = { isHpLost: false, xpFrom: null }

/** Small marks the font lacks: a star for the Badges, a heart for the boss's HP. */
const STAR = ['...#...', '..###..', '#######', '.#####.', '..###..', '.##.##.', '.#...#.']
const HEART = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...']

/** One of the marks above, its `#` pixels in `color`. */
const mark = (canvas: Canvas, rows: readonly string[], x: number, y: number, color: string): void =>
  rows.forEach((row, at) => [...row].forEach((pixel, column) => pixel === '#' && canvas.set(x + column, y + at, color)))

/** A sprite stood upright: its rows become its columns. */
const upright = (sprite: Sprite): Sprite => ({
  palette: sprite.palette,
  rows: [...(sprite.rows[0] ?? '')].map((_, x) => sprite.rows.map(row => row[x] ?? '.').join('')),
})

/** A banner's roller, standing on the strip's full height: the Scrolls' rod upright. */
const ROLLER_WIDTH = 10
const ROLLER_CAP = upright(SPRITES.rodCap)

/** The roller's foot: its cap upside down. */
const ROLLER_FOOT: Sprite = { palette: ROLLER_CAP.palette, rows: [...ROLLER_CAP.rows].reverse() }

/** The banner's paper, inside its rollers; the text starts this far in. */
const BANNER_TEXT_X = ROLLER_WIDTH + 2

/** A segment's words: a bar's label, a count, the Quest's ticket and title. */
const labelOf = (segment: StripSegment): string => {
  switch (segment.kind) {
    case 'hp':
      return segment.hp <= 0 ? 'Exhausted' : `HP ${segment.hp}/${segment.maxHp}`
    case 'xp':
      return `XP ${segment.xp}/${segment.toClear}`
    case 'mana':
      return segment.mana === null ? 'Mana --' : `Mana ${segment.mana}%`
    case 'badges':
      return String(segment.count)
    case 'questions':
      return `${segment.count} waiting`
    case 'quest':
      return `${segment.ticket} ${segment.title}`.trim()
    case 'boss':
      return segment.isApproaching ? 'approaching' : ''
    default:
      return segment.text
  }
}

/** What Mana says beside its bar when compaction is near. */
export const COMPACTION_WARNING = 'Compaction near'

/** How wide Mana's bar is: its label's width, or the bars' least. */
const manaBarWidth = (segment: StripSegment): number => Math.max(BAR, pixelWidth(labelOf(segment)))

/** How wide a segment is drawn, in strip pixels. */
export const segmentWidth = (segment: StripSegment): number => {
  const label = pixelWidth(labelOf(segment))
  switch (segment.kind) {
    case 'level':
      return HEIGHT + 4 + label
    case 'hp':
    case 'xp':
      return Math.max(BAR, label)
    case 'mana':
      return manaBarWidth(segment) + (segment.level === 'warning' ? 4 + pixelWidth(COMPACTION_WARNING) : 0)
    case 'badges':
      return STAR.length + 2 + label
    case 'quest':
      return BANNER_TEXT_X * 2 + label
    case 'boss':
      return 18 + (segment.isApproaching ? label : segment.maxHp * (HEART.length + 2))
    case 'questions':
    case 'encounter':
      return 18 + label
    default:
      return label
  }
}

/** The pixels of a bar `width` across that `share` of it fills. */
const filledOf = (width: number, share: number): number => Math.round(width * Math.max(0, Math.min(1, share)))

/**
 * A bar `width` across at `x`, dark, outlined; filled by `share` in `color`
 * unless `color` is null, when the caller draws the fill. Its fill's width.
 */
const bar = (canvas: Canvas, x: number, width: number, share: number, color: string | null): number => {
  const fill = filledOf(width, share)
  canvas.rect(x - 1, BAR_Y - 1, width + 2, BAR_THICKNESS + 2, COLORS.panel)
  canvas.rect(x, BAR_Y, width, BAR_THICKNESS, COLORS.barEmpty)
  if (color !== null) {
    canvas.rect(x, BAR_Y, fill, BAR_THICKNESS, color)
  }

  return fill
}

/** A segment at `x`: its pixels onto the canvas, and the markup it adds over them. */
const draw = (
  segment: StripSegment,
  x: number,
  { canvas, lettering, motion }: { canvas: Canvas; lettering: Lettering; motion: StripMotion },
): string => {
  const width = segmentWidth(segment)
  const label = labelOf(segment)
  const sprite = (name: SpriteName) => canvas.sprite(SPRITES[name], x, SPRITE_Y)
  switch (segment.kind) {
    case 'level': {
      const portrait = new Canvas()
      portrait.rect(0, 0, 16, 16, COLORS.frame)
      portrait.sprite(SPRITES[PORTRAIT_SPRITES[segment.portrait]], 0, 0)

      return (
        `<g transform="translate(${x} 0) scale(1.5)">${portrait.svg()}</g>` +
        lettering.text(segment.text, x + HEIGHT + 4, LINE_Y, COLORS.gold)
      )
    }
    case 'hp': {
      const isExhausted = segment.hp <= 0
      bar(canvas, x, width, segment.hp / Math.max(1, segment.maxHp), COLORS.red)
      const flash = motion.isHpLost
        ? `<rect x="${x}" y="${BAR_Y}" width="${width}" height="${BAR_THICKNESS}" fill="${COLORS.flash}" opacity="0">` +
          '<animate attributeName="opacity" values="0.9;0" dur="0.4s" fill="freeze"/></rect>'
        : ''

      return lettering.text(label, x, LABEL_Y, isExhausted || segment.isLow ? COLORS.red : COLORS.text) + flash
    }
    case 'xp': {
      const share = segment.xp / Math.max(1, segment.toClear)
      const from = motion.xpFrom === null ? null : filledOf(width, motion.xpFrom)
      const isFilling = from !== null && from < filledOf(width, share)
      const fill = bar(canvas, x, width, share, isFilling ? null : COLORS.xp)
      const filling = isFilling
        ? `<rect x="${x}" y="${BAR_Y}" width="${fill}" height="${BAR_THICKNESS}" fill="${COLORS.xp}">` +
          `<animate attributeName="width" values="${from};${fill}" dur="0.6s" fill="freeze"/></rect>`
        : ''

      return lettering.text(label, x, LABEL_Y, COLORS.text) + filling
    }
    case 'mana': {
      const color = MANA_COLORS[segment.level]
      const barWidth = manaBarWidth(segment)
      bar(canvas, x, barWidth, (segment.mana ?? 0) / 100, color)
      const warning = segment.level === 'warning' ? lettering.text(COMPACTION_WARNING, x + barWidth + 4, LINE_Y, COLORS.red) : ''

      return lettering.text(label, x, LABEL_Y, color) + warning
    }
    case 'badges':
      mark(canvas, STAR, x, LINE_Y, COLORS.gold)

      return lettering.text(label, x + STAR.length + 2, LINE_Y, COLORS.gold)
    case 'quest': {
      const right = x + width - ROLLER_WIDTH
      canvas.rect(x + 4, 4, width - 8, HEIGHT - 8, SCROLL_COLORS.paper)
      canvas.rect(x + 4, 4, width - 8, 1, SCROLL_COLORS.edge)
      canvas.rect(x + 4, HEIGHT - 5, width - 8, 1, SCROLL_COLORS.edgeDark)
      for (const left of [x, right]) {
        canvas.sprite(ROLLER_CAP, left, -2, { width: ROLLER_WIDTH })
        canvas.sprite(ROLLER_FOOT, left, HEIGHT - 14, { width: ROLLER_WIDTH })
      }
      const ticket = `${segment.ticket} `

      return (
        lettering.text(ticket, x + BANNER_TEXT_X, LINE_Y, SCROLL_COLORS.ticket) +
        lettering.text(segment.title, x + BANNER_TEXT_X + pixelWidth(ticket), LINE_Y, SCROLL_COLORS.ink)
      )
    }
    case 'boss': {
      if (segment.isApproaching) {
        const shadow = new Canvas()
        shadow.sprite(SPRITES.boss, x, SPRITE_Y)

        return `<g opacity="0.5">${shadow.svg()}</g>` + lettering.text(label, x + 18, LINE_Y, COLORS.red)
      }
      sprite('boss')
      for (let at = 0; at < segment.maxHp; at++) {
        mark(canvas, HEART, x + 18 + at * (HEART.length + 2), LINE_Y + 1, at < segment.hp ? COLORS.red : COLORS.barEmpty)
      }

      return ''
    }
    case 'questions':
      sprite('sage')

      return lettering.text(label, x + 18, LINE_Y, COLORS.green)
    case 'encounter':
      sprite(segment.sprite)

      return lettering.text(label, x + 18, LINE_Y, COLORS.dim)
    default:
      return lettering.text(label, x, LINE_Y, COLORS.dim)
  }
}

/** How wide `segments` are drawn side by side, the gaps between them counted. */
export const stripWidth = (segments: readonly StripSegment[]): number =>
  segments.reduce((sum, segment) => sum + segmentWidth(segment), 0) + SEGMENT_GAP * Math.max(segments.length - 1, 0)

/**
 * The strip as an SVG document 48 CSS px tall, and its width in CSS px:
 * `segments` left to right on a dark panel, at most `maxWidth` strip pixels
 * across. `motion` adds the HP bar's flash or the XP bar's fill, each played
 * once; nothing else moves.
 */
export const hudStrip = (
  segments: readonly StripSegment[],
  maxWidth: number,
  motion: StripMotion = STILL,
): { svg: string; width: number } => {
  const width = Math.max(1, Math.min(stripWidth(segments), maxWidth))
  const canvas = new Canvas()
  const lettering = new Lettering()
  let x = 0
  let markup = ''
  for (const segment of segments) {
    markup += draw(segment, x, { canvas, lettering, motion })
    x += segmentWidth(segment) + SEGMENT_GAP
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${HEIGHT}" width="${width * SCALE}" height="${STRIP_HEIGHT}" shape-rendering="crispEdges">` +
    `<rect width="${width}" height="${HEIGHT}" fill="${COLORS.panelInner}"/>` +
    lettering.defs() +
    canvas.svg() +
    markup +
    '</svg>'

  return { svg, width: width * SCALE }
}
