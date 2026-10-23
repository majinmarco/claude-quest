// The Scene's picture: the current Encounter as an animated SVG, drawn from
// the bundled 16-bit sprites (src/sprites.ts). The animation is SMIL, so the
// surface plays it with no script and no redraw from the mod.

import type { Encounter } from '../types'
import { SPRITE_SIZE, SPRITES } from './sprites'
import type { Sprite, SpriteName } from './sprites'

/** The Scene in tiles: a wall along the top, three rows of floor below it. */
const COLUMNS = 8
const ROWS = 4
const WIDTH = COLUMNS * SPRITE_SIZE
const HEIGHT = ROWS * SPRITE_SIZE

/** The row the hero walks along, in pixels from the top. */
const PATH_Y = 2 * SPRITE_SIZE

/** Where the banners hang on the wall, by column. */
const BANNERS = [2, 5]

/** The floor's tiles, by column and row; mostly plain, a few worn. */
const floorAt = (column: number, row: number): SpriteName => {
  const worn = (column * 7 + row * 3) % 11
  if (worn === 0) {
    return 'floorStones'
  }

  return worn === 4 ? 'floorSpeckled' : 'floor'
}

/** A run of one colour: `x` to `x + length` on row `y`. */
type Run = { x: number; y: number; length: number }

/** A sprite placed in the Scene, its top left at `x`, `y`. */
type PlacedSprite = { sprite: Sprite; x: number; y: number }

/** The colour a palette letter names: `a`-`z` are 0-25, `A`-`Z` 26-51. */
const colorOf = (sprite: Sprite, letter: string): string | undefined => {
  const code = letter.charCodeAt(0)

  return sprite.palette[letter >= 'a' ? code - 97 : code - 65 + 26]
}

/**
 * A sprite as SVG paths, one per colour, each pixel run a path segment: an
 * SVG of rectangles the surface draws crisp at any scale.
 */
const paths = (sprites: readonly PlacedSprite[]): string => {
  const runs = new Map<string, Run[]>()

  for (const { sprite, x: left, y: top } of sprites) {
    sprite.rows.forEach((row, y) => {
      let x = 0
      while (x < row.length) {
        const letter = row[x] ?? '.'
        let length = 1
        while (row[x + length] === letter) {
          length += 1
        }
        if (letter !== '.') {
          const color = colorOf(sprite, letter)
          if (color !== undefined) {
            const colorRuns = runs.get(color) ?? []
            colorRuns.push({ x: left + x, y: top + y, length })
            runs.set(color, colorRuns)
          }
        }
        x += length
      }
    })
  }

  return [...runs]
    .map(
      ([color, colorRuns]) =>
        `<path fill="${color}" d="${colorRuns.map(run => `M${run.x} ${run.y}h${run.length}v1h-${run.length}z`).join('')}"/>`,
    )
    .join('')
}

const drawSprite = (name: SpriteName, x = 0, y = 0) => paths([{ sprite: SPRITES[name], x, y }])

const backdrop = (): string => {
  const tiles: PlacedSprite[] = []
  for (let column = 0; column < COLUMNS; column++) {
    tiles.push({ sprite: SPRITES.wall, x: column * SPRITE_SIZE, y: 0 })
    for (let row = 1; row < ROWS; row++) {
      tiles.push({
        sprite: SPRITES[floorAt(column, row)],
        x: column * SPRITE_SIZE,
        y: row * SPRITE_SIZE,
      })
    }
  }

  return paths(tiles)
}

/** The banners' flames flicker: their brightness steps, never fades. */
const banners = (): string =>
  BANNERS.map(
    (column, at) =>
      `<g>${drawSprite('banner', column * SPRITE_SIZE, 0)}` +
      `<animate attributeName="opacity" values="1;0.8;1;0.9" calcMode="discrete" dur="${0.6 + at * 0.2}s" repeatCount="indefinite"/></g>`,
  ).join('')

/** The walk's cycle, in seconds. */
const WALK = 4

/**
 * The hero, stepping (a one-pixel bob) as it goes from `from` to `to` along
 * the path; on a first visit it stops at `to` for the rest of the cycle.
 */
const hero = (from: number, to: number, stopsAt?: number): string => {
  const travel =
    stopsAt === undefined
      ? `values="${from} ${PATH_Y};${to} ${PATH_Y}"`
      : `values="${from} ${PATH_Y};${to} ${PATH_Y};${to} ${PATH_Y}" keyTimes="0;${stopsAt};1"`
  const moves = from === to ? '' : `<animateTransform attributeName="transform" type="translate" ${travel} dur="${WALK}s" repeatCount="indefinite"/>`

  return (
    `<g transform="translate(${from} ${PATH_Y})">${moves}` +
    `<g>${drawSprite('hero')}<animateTransform attributeName="transform" type="translate" values="0 0;0 -1" calcMode="discrete" dur="0.5s" repeatCount="indefinite"/></g>` +
    '</g>'
  )
}

/** A light that blinks, in pixels from the top left. */
const SPARKLES = [
  { x: 99, y: 27, begin: 0 },
  { x: 108, y: 25, begin: 0.3 },
  { x: 104, y: 30, begin: 0.6 },
]

/**
 * A first visit's discovery: a chest at the corridor's end that opens as the
 * hero reaches it, and sparkles over it.
 */
const discovery = (opensAt: number): string => {
  const x = 6 * SPRITE_SIZE
  const shown = (from: number, to: number) =>
    `<animate attributeName="opacity" values="${from};${to}" keyTimes="0;${opensAt}" calcMode="discrete" dur="${WALK}s" repeatCount="indefinite"/>`
  const sparkles = SPARKLES.map(
    ({ x: left, y: top, begin }) =>
      `<rect x="${left}" y="${top}" width="1" height="1" fill="#fee761">` +
      `<animate attributeName="opacity" values="0;1;0" calcMode="discrete" dur="0.9s" begin="${begin}s" repeatCount="indefinite"/></rect>`,
  ).join('')

  return (
    `<g>${drawSprite('chest', x, PATH_Y)}${shown(1, 0)}</g>` +
    `<g opacity="0">${drawSprite('chestOpen', x, PATH_Y)}${shown(0, 1)}</g>` +
    sparkles
  )
}

/** Where a first visit's hero stops: the tile before the chest. */
const BESIDE_CHEST = 5 * SPRITE_SIZE
const REACHES_CHEST = 0.7

/**
 * The Scene for the current Encounter, as an SVG document `width` CSS pixels
 * wide. No Encounter yet: the hero waits at the corridor's start.
 */
export const sceneSvg = (encounter: Encounter | null, width: number): string => {
  const height = Math.round((width * HEIGHT) / WIDTH)
  const actors =
    encounter === null
      ? hero(SPRITE_SIZE, SPRITE_SIZE)
      : encounter.isFirstVisit
        ? discovery(REACHES_CHEST) + hero(0, BESIDE_CHEST, REACHES_CHEST)
        : hero(0, WIDTH - SPRITE_SIZE)

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${width}" height="${height}" shape-rendering="crispEdges">` +
    backdrop() +
    banners() +
    actors +
    '</svg>'
  )
}
