// The Scene's picture: the current Encounter as an animated SVG, drawn from
// the bundled 16-bit sprites (src/sprites.ts). The animation is SMIL, so the
// surface plays it with no script and no redraw from the mod.

import type { BattleEncounter, CheckKind, CraftingEncounter, Encounter } from '../types'
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
 * The monster each kind of Check's failures make: what it is called, and its
 * sprite. A failing test is a bug.
 */
export const MONSTERS: Record<CheckKind, { name: string; sprite: SpriteName }> = {
  test: { name: 'bug', sprite: 'spider' },
  lint: { name: 'slime', sprite: 'slime' },
  typecheck: { name: 'ghost', sprite: 'ghost' },
}

/** Where the Battle's two stand, in pixels from the left. */
const HERO_X = 2 * SPRITE_SIZE
const MONSTER_X = 5 * SPRITE_SIZE

/** A Battle's beat, in seconds: the strike, then the rest of the cycle. */
const BEAT = 2
const STRIKES_AT = 0.2

/** One animation over the Battle's beat: `values` at `keyTimes`, held between. */
const beat = (attribute: string, values: string, keyTimes: string): string =>
  `<animate attributeName="${attribute}" values="${values}" keyTimes="${keyTimes}" calcMode="discrete" dur="${BEAT}s" repeatCount="indefinite"/>`

/**
 * The monster's HP bar over its head: dark where HP is lost, red where it
 * remains. A hit drains it from what the monster had to what it has.
 */
const hpBar = (battle: BattleEncounter): string => {
  const x = MONSTER_X + 1
  const y = PATH_Y - 4
  const full = SPRITE_SIZE - 2
  const share = (hp: number) => Math.round((full * hp) / Math.max(1, battle.maxHp))
  const now = share(battle.hp)
  const before = share(battle.hp + battle.hits)
  const fill =
    before === now
      ? `<rect x="${x}" y="${y}" width="${now}" height="2" fill="#e43b44"/>`
      : `<rect x="${x}" y="${y}" width="${before}" height="2" fill="#e43b44">${beat('width', `${before};${now}`, `0;${STRIKES_AT}`)}</rect>`

  return (
    `<rect x="${x - 1}" y="${y - 1}" width="${full + 2}" height="4" fill="#181425"/>` +
    `<rect x="${x}" y="${y}" width="${full}" height="2" fill="#3a4466"/>` +
    fill
  )
}

/**
 * A Battle: the hero faces the check's monster, its HP over its head. A hit
 * is the hero's lunge, the monster's flash and its HP draining; a win, the
 * monster falling under sparkles; otherwise the two square off.
 */
const battle = (encounter: BattleEncounter): string => {
  const monster = drawSprite(MONSTERS[encounter.foe].sprite, MONSTER_X, PATH_Y)
  const bob = (period: number) =>
    `<animateTransform attributeName="transform" type="translate" values="0 0;0 -1" calcMode="discrete" dur="${period}s" repeatCount="indefinite"/>`
  const strikes = encounter.hits > 0
  const lunge = strikes
    ? `<animateTransform attributeName="transform" type="translate" values="${HERO_X} ${PATH_Y};${MONSTER_X - 10} ${PATH_Y};${HERO_X} ${PATH_Y}" keyTimes="0;${STRIKES_AT};${STRIKES_AT * 2}" dur="${BEAT}s" repeatCount="indefinite"/>`
    : ''
  const theHero =
    `<g transform="translate(${HERO_X} ${PATH_Y})">${lunge}` +
    `<g>${drawSprite('hero')}${bob(0.5)}</g></g>`

  if (encounter.outcome === 'won') {
    const sparkles = SPARKLES.map(
      ({ x: left, y: top, begin }) =>
        `<rect x="${left - 20}" y="${top + 2}" width="1" height="1" fill="#fee761">` +
        `<animate attributeName="opacity" values="0;1;0" calcMode="discrete" dur="0.9s" begin="${begin}s" repeatCount="indefinite"/></rect>`,
    ).join('')

    return (
      `<g>${monster}${beat('opacity', '1;0.5;0', `0;${STRIKES_AT};${STRIKES_AT * 2}`)}</g>` +
      hpBar(encounter) +
      sparkles +
      theHero
    )
  }

  const flash = strikes ? beat('opacity', '1;0.2;1', `0;${STRIKES_AT};${STRIKES_AT * 1.5}`) : ''

  return `<g><g>${monster}${bob(0.7)}</g>${flash}</g>` + hpBar(encounter) + theHero
}

/** The items the blacksmith forges; which one a component makes is fixed by its name. */
const ITEMS: readonly SpriteName[] = ['sword', 'shield', 'axe', 'dagger', 'staff']

/** The item sprite for `item`: the same name always forges the same kind. */
const itemSpriteOf = (item: string): SpriteName => {
  let hash = 0
  for (const char of item) {
    hash = (hash * 31 + char.charCodeAt(0)) % 997
  }

  return ITEMS[hash % ITEMS.length] ?? 'sword'
}

/** Where the forge stands, in pixels from the left. */
const SMITH_X = 3 * SPRITE_SIZE - 2
const ANVIL_X = 4 * SPRITE_SIZE
const ITEM_X = 6 * SPRITE_SIZE

/** The Crafting's beat, in seconds: three strikes, then the item shines. */
const CRAFT_BEAT = 3
const FORGED_AT = 0.6

/** One animation over the Crafting's beat: `values` at `keyTimes`, held between. */
const craftBeat = (attribute: string, values: string, keyTimes: string): string =>
  `<animate attributeName="${attribute}" values="${values}" keyTimes="${keyTimes}" calcMode="discrete" dur="${CRAFT_BEAT}s" repeatCount="indefinite"/>`

/** The hammer's strikes on the anvil, as shares of the cycle. */
const STRIKES = [0, 0.2, 0.4]

/**
 * A Crafting: the blacksmith beside the anvil swings the hammer three times,
 * sparks fly at each strike, and the item named after the component appears
 * under sparkles.
 */
const crafting = (encounter: CraftingEncounter): string => {
  const smith =
    `<g>${drawSprite('blacksmith', SMITH_X, PATH_Y)}` +
    `<animateTransform attributeName="transform" type="translate" values="0 0;0 -1" calcMode="discrete" dur="0.6s" repeatCount="indefinite"/></g>`
  const anvil = drawSprite('anvil', ANVIL_X, PATH_Y)
  // Raised, then down on the anvil at each strike.
  const swing = STRIKES.flatMap(() => ['0 -6', '0 0']).join(';')
  const swingTimes = STRIKES.flatMap(at => [at, at + 0.1]).join(';')
  const hammer =
    `<g transform="translate(${ANVIL_X - 6} ${PATH_Y - 10})">` +
    `<g>${drawSprite('hammer')}<animateTransform attributeName="transform" type="translate" values="${swing};0 -6" keyTimes="${swingTimes};1" calcMode="discrete" dur="${CRAFT_BEAT}s" repeatCount="indefinite"/></g></g>`
  const sparks = STRIKES.map(
    (at, n) =>
      `<g opacity="0">` +
      [
        [ANVIL_X + 3, PATH_Y - 1],
        [ANVIL_X + 12, PATH_Y - 2],
        [ANVIL_X + 8, PATH_Y - 4],
      ]
        .map(([x, y]) => `<rect x="${(x ?? 0) + n}" y="${y}" width="1" height="1" fill="${n % 2 === 0 ? '#feae34' : '#fee761'}"/>`)
        .join('') +
      craftBeat('opacity', '0;1;0', `0;${at + 0.1};${at + 0.18}`) +
      '</g>',
  ).join('')
  const item =
    `<g opacity="0">${drawSprite(itemSpriteOf(encounter.item), ITEM_X, PATH_Y)}` +
    craftBeat('opacity', '0;1', `0;${FORGED_AT}`) +
    '</g>'
  const shine = SPARKLES.map(
    ({ x: left, y: top, begin }) =>
      `<rect x="${left}" y="${top}" width="1" height="1" fill="#fee761" opacity="0">` +
      `<animate attributeName="opacity" values="0;0;1;0" keyTimes="0;${FORGED_AT};${FORGED_AT + 0.1};1" calcMode="discrete" dur="${CRAFT_BEAT}s" begin="${begin}s" repeatCount="indefinite"/></rect>`,
  ).join('')

  return anvil + smith + hammer + sparks + item + shine
}

/**
 * The Scene for the current Encounter, as an SVG document `width` CSS pixels
 * wide. No Encounter yet: the hero waits at the corridor's start.
 */
export const sceneSvg = (encounter: Encounter | null, width: number): string => {
  const height = Math.round((width * HEIGHT) / WIDTH)
  const actors =
    encounter === null
      ? hero(SPRITE_SIZE, SPRITE_SIZE)
      : encounter.kind === 'Battle'
        ? battle(encounter)
        : encounter.kind === 'Crafting'
          ? crafting(encounter)
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
