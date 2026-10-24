// The Region map's art: the overworld (Tiny Town's land, a gate per Dungeon,
// a camp for the Wilds, Fog past the last of them), a Floor of a Dungeon or
// the Wilds (Tiny Dungeon's walls and floors, or camps on grass, one Room per
// Quest), and the Module view; each as an SVG for the surfaces that draw one
// and as a character grid for the terminal. Everything is seeded from the
// Region's id and its Dungeons' keys, never from the clock or a random
// source, so a Region is drawn the same in every session for every Player.
// Tiles are defined once per SVG and placed with <use>, which keeps a big
// map well under the 128 KiB an Svg element takes.

import { Canvas, Lettering, PIPS, pixelWidth } from './scroll-art'
import { GLYPH_HEIGHT } from './pixel-font'
import { SPRITES } from './sprites'
import type { SpriteName } from './sprites'
import { clearedOf, floorCount, floorRooms, isSiteCleared, ROOMS_PER_FLOOR } from './region-model'
import type { ModuleTile, Room, Site } from './region-model'

/** A tile, in the art's own pixels; the art is drawn at twice that in CSS pixels. */
const TILE = 16
const SCALE = 2

/**
 * The land a Region is drawn on. Only `meadow` for now: the seam where a
 * theme (Haiku's, issue #17) picks another set of tiles.
 */
export type Biome = 'meadow'

/** How a Dungeon's Rooms are drawn. Only `crypt` for now, the seam for a Dungeon's theme. */
export type DungeonTheme = 'crypt'

/** The tiles a biome draws its land with: open grass, its rarer kinds, and what grows on it, by weight. */
const BIOMES: Record<Biome, { grass: SpriteName; patches: SpriteName[]; growth: [SpriteName, number][] }> = {
  meadow: {
    grass: 'grass',
    patches: ['grassTufts', 'grassFlowers'],
    growth: [['treeGreen', 0.1], ['treeAutumn', 0.04], ['bush', 0.03], ['mushrooms', 0.015]],
  },
}

/** The tiles a Dungeon theme draws a Room with: its wall, the wall of a lit Room, its floor. */
const THEMES: Record<DungeonTheme, { wall: SpriteName; litWall: SpriteName; floor: SpriteName; floorAlt: SpriteName }> = {
  crypt: { wall: 'wall', litWall: 'banner', floor: 'floor', floorAlt: 'floorSpeckled' },
}

/** The map's colours, which the terminal's grid takes too. */
export const MAP_COLORS = {
  night: '#18141f',
  fog: '#0e0c18',
  fogText: '#4a4658',
  paper: '#fff1d2',
  label: '#3f2631',
  lit: '#fee761',
  dark: '#8b9bb4',
  corridor: '#be7d4b',
  tree: '#3e8948',
  road: '#c28d5f',
  pennant: '#e84537',
  pole: '#3f2631',
} as const

/** A seeded number in [0, 1) from its parts: FNV-1a over them, then a finishing mix. */
export const seeded = (...parts: readonly (string | number)[]): number => {
  let hash = 0x811c9dc5
  for (const character of parts.join('|')) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 0x01000193)
  }
  hash ^= hash >>> 15
  hash = Math.imul(hash, 0x2c1b3c6d)
  hash ^= hash >>> 12

  return (hash >>> 0) / 0x100000000
}

/** The tiles drawn on one SVG: each sprite defined once (as `t-<name>`, apart from the glyph ids), then placed with <use>. */
class Tiles {
  private readonly used = new Set<SpriteName>()

  /** `name` with its top left at `x`, `y`. */
  at(name: SpriteName, x: number, y: number): string {
    this.used.add(name)

    return `<use href="#t-${name}" x="${x}" y="${y}"/>`
  }

  defs(): string {
    return [...this.used]
      .map(name => {
        const canvas = new Canvas()
        canvas.sprite(SPRITES[name], 0, 0)

        return `<g id="t-${name}">${canvas.svg()}</g>`
      })
      .join('')
  }
}

/** A dark veil over a rectangle: Fog, or a Room not yet cleared. */
const veil = (x: number, y: number, width: number, height: number, opacity: number): string =>
  `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${MAP_COLORS.fog}" fill-opacity="${opacity}"/>`

const rect = (x: number, y: number, width: number, height: number, color: string): string =>
  `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${color}"/>`

/** A frame one pixel wide just inside a rectangle: the selection. */
const frame = (x: number, y: number, width: number, height: number, color: string): string =>
  `<rect x="${x + 0.5}" y="${y + 0.5}" width="${width - 1}" height="${height - 1}" fill="none" stroke="${color}"/>`

/** A label: `text` lettered on a dark plate, its top left at `x`, `y`. */
const plate = (lettering: Lettering, text: string, x: number, y: number, color: string = MAP_COLORS.paper): string =>
  rect(x, y, pixelWidth(text) + 3, GLYPH_HEIGHT + 1, MAP_COLORS.label) + lettering.text(text, x + 2, y + 1, color)

const svgOf = (width: number, height: number, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width * SCALE}" height="${height * SCALE}" shape-rendering="crispEdges">${body}</svg>`

/** A choice's hotkey by its place among the choices: 1 to 9, then 0; none past the tenth. */
export const hotkeyOf = (at: number): string | undefined => (at < 9 ? String(at + 1) : at === 9 ? '0' : undefined)

// The overworld.

/** The overworld is this many tiles across. */
export const OVERWORLD_COLUMNS = 14

/** Each band of the overworld: a row of sites two tiles tall, then the road under them. */
const BAND_ROWS = 3

/** Four slots of three columns a band, one column of land either side; one slot is left as land. */
const SLOTS = 4
const SLOT_COLUMNS = 3

/** How many rows of Fog lie past the last band. */
const FOG_ROWS = 2

/** A site placed on the overworld: its top left tile; it takes two tiles by two. */
export type Placed = { key: string; column: number; row: number }

/** The overworld for some sites: its size in tiles, where each site is, and where the Fog starts. */
export type OverworldLayout = {
  columns: number
  rows: number
  places: Placed[]
  /** Whether the tile at a column and row is under Fog. */
  isFog: (column: number, row: number) => boolean
}

/**
 * Where the sites (`keys`, in their order) stand on the overworld of the
 * Region `regionId`: three to a band, in one of four slots each, the empty
 * slot of each band and the place of each site in its slot seeded from the
 * Region and the site; bands run left to right, then right to left, as a
 * road winds. Past the last site the land is Fog: the rest of its band, and
 * two rows more.
 */
export const overworldLayout = (regionId: string, keys: readonly string[]): OverworldLayout => {
  const perBand = SLOTS - 1
  const bands = Math.max(Math.ceil(keys.length / perBand), 1)
  const places: Placed[] = []
  const slotsTaken: number[][] = []
  for (let band = 0; band < bands; band++) {
    const empty = Math.floor(seeded(regionId, 'band', band) * SLOTS)
    const slots = Array.from({ length: SLOTS }, (_, slot) => slot).filter(slot => slot !== empty)
    const ordered = band % 2 === 0 ? slots : [...slots].reverse()
    const inBand = keys.slice(band * perBand, (band + 1) * perBand)
    slotsTaken.push(ordered.slice(0, inBand.length))
    inBand.forEach((key, at) => {
      const slot = ordered[at] ?? 0
      const nudge = seeded(regionId, 'site', key) < 0.5 ? 0 : 1
      places.push({ key, column: 1 + slot * SLOT_COLUMNS + nudge, row: 1 + band * BAND_ROWS })
    })
  }

  const rows = 1 + bands * BAND_ROWS + FOG_ROWS
  const lastBand = bands - 1
  const lastSlots = slotsTaken[lastBand] ?? []
  const lastSlot = lastSlots[lastSlots.length - 1]
  const lastBandTop = 1 + lastBand * BAND_ROWS
  // In the last band, the land past the last site, the way the road runs.
  const isPastLast = (column: number): boolean => {
    if (lastSlot === undefined) {
      return false
    }

    return lastBand % 2 === 1 ? column < 1 + lastSlot * SLOT_COLUMNS : column >= 1 + (lastSlot + 1) * SLOT_COLUMNS
  }
  const isFog = (column: number, row: number): boolean =>
    row >= lastBandTop + BAND_ROWS || (row >= lastBandTop && isPastLast(column))

  return { columns: OVERWORLD_COLUMNS, rows, places, isFog }
}

/** One site as the overworld shows it: its number on the map is its place, from 1. */
export type OverworldSite = { site: Site; isSelected: boolean }

/** The tiles of the road: under each band, from its first site to the farthest one, this band or the next. */
const roadTiles = (layout: OverworldLayout): Set<string> => {
  const road = new Set<string>()
  const byRow = new Map<number, number[]>()
  for (const place of layout.places) {
    byRow.set(place.row, [...(byRow.get(place.row) ?? []), place.column])
  }
  const rows = [...byRow.keys()].sort((a, b) => a - b)
  rows.forEach((row, at) => {
    const reach = [...(byRow.get(row) ?? []), ...(byRow.get(rows[at + 1] ?? -1) ?? [])]
    const to = Math.max(...reach) + 1
    for (let column = Math.min(...reach); column <= to; column++) {
      road.add(`${column},${row + 2}`)
    }
  })

  return road
}

/** What the land at a tile grows, by the biome and the seed: one of its weighted kinds, or nothing. */
const growthAt = (regionId: string, biome: Biome, column: number, row: number): SpriteName | undefined => {
  let roll = seeded(regionId, 'growth', column, row)
  for (const [name, weight] of BIOMES[biome].growth) {
    if (roll < weight) {
      return name
    }
    roll -= weight
  }

  return undefined
}

/** The grass at a tile: plain, or now and then one of its patches. */
const grassAt = (regionId: string, biome: Biome, column: number, row: number): SpriteName => {
  const roll = seeded(regionId, 'grass', column, row)
  const { grass, patches } = BIOMES[biome]

  return roll < 0.18 ? (patches[Math.floor((roll / 0.18) * patches.length)] ?? grass) : grass
}

/** The banner of a cleared Dungeon: a pennant on a pole at the top right of its gate. */
const pennant = (x: number, y: number): string =>
  rect(x + 27, y - 7, 1, 12, MAP_COLORS.pole) +
  rect(x + 28, y - 7, 6, 2, MAP_COLORS.pennant) +
  rect(x + 28, y - 5, 4, 2, MAP_COLORS.pennant)

/**
 * The overworld of the Region `regionId` as an SVG: open land with its
 * trees, the road, a gate in castle wall per Dungeon (a pennant once it is
 * cleared), a camp for the Wilds, each site numbered as its Button is, the
 * selected one framed; Fog past the last of them. `name` is lettered at the
 * top.
 */
export const overworldSvg = (
  regionId: string,
  name: string,
  sites: readonly OverworldSite[],
  biome: Biome = 'meadow',
): string => {
  const layout = overworldLayout(regionId, sites.map(({ site }) => site.key))
  const tiles = new Tiles()
  const lettering = new Lettering()
  const width = layout.columns * TILE
  const height = layout.rows * TILE
  const road = roadTiles(layout)
  const taken = new Set(
    layout.places.flatMap(({ column, row }) => [0, 1].flatMap(dx => [0, 1].map(dy => `${column + dx},${row + dy}`))),
  )
  let land = ''
  let fog = ''
  for (let row = 0; row < layout.rows; row++) {
    for (let column = 0; column < layout.columns; column++) {
      const x = column * TILE
      const y = row * TILE
      const at = `${column},${row}`
      if (taken.has(at)) {
        land += tiles.at(BIOMES[biome].grass, x, y)
        continue
      }
      const isFog = layout.isFog(column, row)
      if (road.has(at) && !isFog) {
        land += tiles.at('dirt', x, y)
        continue
      }
      land += tiles.at(grassAt(regionId, biome, column, row), x, y)
      const growth = row === 0 ? undefined : growthAt(regionId, biome, column, row)
      if (growth !== undefined) {
        land += tiles.at(growth, x, y)
      }
      if (isFog) {
        fog += veil(x, y, TILE, TILE, 0.84)
      }
    }
  }

  let marks = ''
  layout.places.forEach((place, at) => {
    const entry = sites[at]
    if (entry === undefined) {
      return
    }
    const { site, isSelected } = entry
    const x = place.column * TILE
    const y = place.row * TILE
    if (site.kind === 'dungeon') {
      marks +=
        tiles.at('gateLeft', x, y) +
        tiles.at('gateRight', x + TILE, y) +
        tiles.at('gateFootLeft', x, y + TILE) +
        tiles.at('gateFootRight', x + TILE, y + TILE)
      if (isSiteCleared(site)) {
        marks += pennant(x, y)
      }
    } else {
      marks +=
        tiles.at('treeGreen', x, y) +
        tiles.at('cauldron', x + TILE, y) +
        tiles.at('logPile', x, y + TILE) +
        tiles.at('signpost', x + TILE, y + TILE)
    }
    marks += plate(lettering, String(at + 1), x - 2, y + TILE * 2 - 9)
    if (isSelected) {
      marks += frame(x - 1, y - 1, TILE * 2 + 2, TILE * 2 + 2, MAP_COLORS.lit)
    }
  })

  const title = plate(lettering, name.toUpperCase(), 2, 4)

  return svgOf(width, height, lettering.defs() + `<defs>${tiles.defs()}</defs>` + land + fog + marks + title)
}

// A Floor.

/** A Room: wall over floor, three tiles across, then a row of gems. */
const ROOM = 40
const CORRIDOR = 8
const ROOM_COLUMNS = 5
const ROOM_ROWS = ROOMS_PER_FLOOR / ROOM_COLUMNS
const HEADER = 12

/** A gem, as the Scroll shows difficulty. */
const GEM = 8

/** What a Floor shows: its site, which Floor (from 0), and the Room selected (its place on the Floor, from 0). */
export type FloorView = { site: Site; floor: number; selected: number | null; theme?: DungeonTheme }

const roomOrigin = (at: number): { x: number; y: number } => ({
  x: (at % ROOM_COLUMNS) * (ROOM + CORRIDOR),
  y: HEADER + Math.floor(at / ROOM_COLUMNS) * (ROOM + CORRIDOR),
})

/** A Room of a Dungeon: wall above floor, the wall bannered once it is lit. */
const dungeonRoom = (tiles: Tiles, theme: DungeonTheme, x: number, y: number, isLit: boolean, seed: number): string => {
  const { wall, litWall, floor, floorAlt } = THEMES[theme]
  const floorTile = seed < 0.5 ? floor : floorAlt

  return (
    tiles.at(wall, x, y) +
    tiles.at(wall, x + 24, y) +
    tiles.at(isLit ? litWall : wall, x + 12, y) +
    tiles.at(floorTile, x, y + TILE) +
    tiles.at(floorTile, x + 12, y + TILE) +
    tiles.at(floorTile, x + 24, y + TILE)
  )
}

/** A camp of the Wilds: trees above grass, a cauldron once it is lit, a pile of logs before. */
const camp = (tiles: Tiles, x: number, y: number, isLit: boolean, seed: number): string =>
  tiles.at('grass', x, y) +
  tiles.at('grass', x + 12, y) +
  tiles.at('grass', x + 24, y) +
  tiles.at(seed < 0.5 ? 'treeGreen' : 'treeAutumn', x, y) +
  tiles.at('bush', x + 24, y) +
  tiles.at('grassTufts', x, y + TILE) +
  tiles.at('grass', x + 12, y + TILE) +
  tiles.at('grass', x + 24, y + TILE) +
  tiles.at(isLit ? 'cauldron' : 'logPile', x + 12, y + TILE)

/** The difficulty as five gems under the Room (Unrated: a question mark); nothing for a Room known only by count. */
const gems = (tiles: Tiles, lettering: Lettering, room: Room, x: number, y: number): string => {
  if (room.quest === null) {
    return ''
  }
  if (room.difficulty === 'Unrated') {
    return lettering.text('?', x + Math.floor((ROOM - pixelWidth('?')) / 2), y, MAP_COLORS.paper)
  }

  return Array.from({ length: 5 }, (_, at) =>
    tiles.at(at < PIPS[room.difficulty] ? 'gem' : 'gemEmpty', x + at * GEM, y - 1),
  ).join('')
}

/**
 * Floor `floor` of a site as an SVG: five Rooms across and four down,
 * corridors between them; a Room per Quest (numbered as its Button is), lit
 * when cleared and dark when open, its difficulty in gems; Fog for the
 * Rooms past the last Quest; the selected Room framed. A Dungeon draws the
 * walls and floors of Tiny Dungeon, the Wilds camps on grass.
 */
export const floorSvg = ({ site, floor, selected, theme = 'crypt' }: FloorView): string => {
  const tiles = new Tiles()
  const lettering = new Lettering()
  const width = ROOM_COLUMNS * ROOM + (ROOM_COLUMNS - 1) * CORRIDOR
  const height = HEADER + ROOM_ROWS * ROOM + (ROOM_ROWS - 1) * CORRIDOR
  const rooms = floorRooms(site, floor)
  const ground = site.kind === 'wilds' ? MAP_COLORS.road : MAP_COLORS.corridor
  let corridors = ''
  let body = ''
  for (let at = 0; at < ROOMS_PER_FLOOR; at++) {
    const { x, y } = roomOrigin(at)
    const room = rooms[at]
    if (room === undefined) {
      body += site.kind === 'wilds' ? camp(tiles, x, y, false, 0) : dungeonRoom(tiles, theme, x, y, false, 0)
      body += veil(x, y, ROOM, ROOM, 0.9)
      continue
    }
    // A corridor to the Room on the right, and to the one below, when there is one.
    if (at % ROOM_COLUMNS < ROOM_COLUMNS - 1 && rooms[at + 1] !== undefined) {
      corridors += rect(x + ROOM, y + TILE + 4, CORRIDOR, 8, ground)
    }
    if (rooms[at + ROOM_COLUMNS] !== undefined) {
      corridors += rect(x + 16, y + ROOM, 8, CORRIDOR, ground)
    }
    const seed = seeded(site.key, 'room', floor, at)
    body +=
      site.kind === 'wilds'
        ? camp(tiles, x, y, room.isCleared, seed)
        : dungeonRoom(tiles, theme, x, y, room.isCleared, seed)
    if (!room.isCleared) {
      body += veil(x, y, ROOM, TILE * 2, 0.62)
    }
    body += plate(lettering, String(floor * ROOMS_PER_FLOOR + at + 1), x + 1, y + TILE + 1)
    body += gems(tiles, lettering, room, x, y + TILE * 2 + 1)
    if (selected === at) {
      body += frame(x, y, ROOM, ROOM, MAP_COLORS.lit)
    }
  }
  const floors = `FLOOR ${floor + 1}/${floorCount(site)}`
  const head =
    lettering.text(site.name.toUpperCase().slice(0, 40), 1, 2, MAP_COLORS.paper) +
    lettering.text(floors, width - pixelWidth(floors) - 1, 2, MAP_COLORS.dark)

  return svgOf(
    width,
    height,
    lettering.defs() + `<defs>${tiles.defs()}</defs>` + rect(0, 0, width, height, MAP_COLORS.night) + corridors + body + head,
  )
}

// The Module view.

const MODULE_COLUMNS = 2
const MODULE_WIDTH = 116
const MODULE_HEIGHT = 18

/** The most Modules the view draws; the pane says how many more there are. */
export const MODULES_SHOWN = 80

/**
 * A Module tile: its name (none when it is known only by count, or under
 * Fog), whether it is discovered, and whether the Cartographer charted it
 * (src/scouting.ts).
 */
export type ModuleCell = { name: string | null; isDiscovered: boolean; isCharted?: boolean }

/** Cells for Modules known only by count (a Snapshot): the discovered ones lit, the rest Fog, all nameless. */
export const countedModules = (discovered: number, total: number): ModuleCell[] =>
  Array.from({ length: Math.max(total, 0) }, (_, at) => ({ name: null, isDiscovered: at < discovered }))

/** Modules by name as cells; a Module under Fog keeps no name; a discovered one in `charted` is charted. */
export const moduleCells = (modules: readonly ModuleTile[], charted: readonly string[] = []): ModuleCell[] => {
  const isCharted = new Set(charted)

  return modules.map(module => ({
    name: module.isDiscovered ? module.name : null,
    isDiscovered: module.isDiscovered,
    ...(module.isDiscovered && isCharted.has(module.name) ? { isCharted: true } : {}),
  }))
}

/** A charted Module's star: five pixels across, its top left at (x, y). */
const star = (x: number, y: number, color: string): string =>
  rect(x + 2, y, 1, 1, color) +
  rect(x + 1, y + 1, 3, 1, color) +
  rect(x, y + 2, 5, 1, color) +
  rect(x + 1, y + 3, 3, 1, color) +
  rect(x + 1, y + 4, 1, 1, color) +
  rect(x + 3, y + 4, 1, 1, color)

/** A name cut to fit `room` pixels, a dot where it was cut. */
const fitName = (name: string, room: number): string => {
  if (pixelWidth(name) <= room) {
    return name
  }
  let kept = name
  while (kept.length > 1 && pixelWidth(`${kept}.`) > room) {
    kept = kept.slice(0, -1)
  }

  return `${kept}.`
}

/**
 * The Module view as an SVG: a tile per Module, two across, lit and named
 * when discovered (a star at its end when charted), dark and nameless under
 * Fog when not; up to MODULES_SHOWN.
 */
export const modulesSvg = (cells: readonly ModuleCell[], counts: { discovered: number; total: number }): string => {
  const tiles = new Tiles()
  const lettering = new Lettering()
  const shown = cells.slice(0, MODULES_SHOWN)
  const width = MODULE_COLUMNS * MODULE_WIDTH
  const height = HEADER + Math.max(Math.ceil(shown.length / MODULE_COLUMNS), 1) * MODULE_HEIGHT
  let body = ''
  shown.forEach((cell, at) => {
    const x = (at % MODULE_COLUMNS) * MODULE_WIDTH
    const y = HEADER + Math.floor(at / MODULE_COLUMNS) * MODULE_HEIGHT
    body += tiles.at('grass', x + 1, y + 1)
    if (cell.isDiscovered) {
      body += tiles.at('signpost', x + 1, y + 1)
      if (cell.name !== null) {
        body += lettering.text(fitName(cell.name, MODULE_WIDTH - (cell.isCharted === true ? 32 : 24)), x + 20, y + 6, MAP_COLORS.paper)
      }
      if (cell.isCharted === true) {
        body += star(x + MODULE_WIDTH - 9, y + 6, MAP_COLORS.lit)
      }
    } else {
      body +=
        tiles.at('treeGreen', x + 1, y + 1) +
        veil(x + 1, y + 1, TILE, TILE, 0.84) +
        rect(x + 20, y + 8, MODULE_WIDTH - 26, 2, MAP_COLORS.label)
    }
  })
  const head = lettering.text(`MODULES ${counts.discovered}/${counts.total}`, 1, 2, MAP_COLORS.paper)

  return svgOf(
    width,
    height,
    lettering.defs() + `<defs>${tiles.defs()}</defs>` + rect(0, 0, width, height, MAP_COLORS.night) + body + head,
  )
}

// The terminal.

/** A run of a grid row, in its colour. */
export type GridRun = { text: string; color?: string }

/** A row of the grid. */
export type GridRow = GridRun[]

const LIT = '▣'
const CHARTED = '★'
const DARK = '▢'
const FOG = '░'
const TREE = '♣'
const ROAD = '·'
const CAMP = '▲'

/** Box-drawing pieces: across, down, then the corners clockwise from top left; doubled for the selection. */
const SINGLE = ['─', '│', '┌', '┐', '┘', '└'] as const
const DOUBLE = ['═', '║', '╔', '╗', '╝', '╚'] as const

/** Runs of one colour side by side, as one; the spaces at the end of the row dropped. */
const tidy = (runs: readonly GridRun[]): GridRow => {
  const merged: GridRow = []
  for (const run of runs) {
    const last = merged[merged.length - 1]
    if (last !== undefined && last.color === run.color) {
      last.text += run.text
    } else {
      merged.push({ ...run })
    }
  }
  while (merged.length > 0) {
    const last = merged[merged.length - 1]
    if (last === undefined) {
      break
    }
    last.text = last.text.replace(/ +$/, '')
    if (last.text !== '') {
      break
    }
    merged.pop()
  }

  return merged
}

/**
 * The overworld as a character grid: two cells a tile; each site a box with
 * its number in its top edge (doubled when selected), two lit squares inside
 * a cleared Dungeon, two dark ones inside a Dungeon still open, two tents
 * inside the camp of the Wilds; clubs for trees, dots for the road, shade
 * for Fog.
 */
export const overworldGrid = (regionId: string, sites: readonly OverworldSite[], biome: Biome = 'meadow'): GridRow[] => {
  const layout = overworldLayout(regionId, sites.map(({ site }) => site.key))
  const road = roadTiles(layout)
  // The two rows of each site, four cells each, by the column and row of its top left tile.
  const boxes = new Map<string, { top: GridRun[]; bottom: GridRun[] }>()
  layout.places.forEach((place, at) => {
    const entry = sites[at]
    if (entry === undefined) {
      return
    }
    const { site, isSelected } = entry
    const [across, , topLeft, topRight, bottomRight, bottomLeft] = isSelected ? DOUBLE : SINGLE
    const n = String(at + 1)
    const number = n.length === 1 ? `${n}${across}` : n.slice(-2)
    const color = isSelected ? MAP_COLORS.lit : MAP_COLORS.dark
    const isCleared = isSiteCleared(site)
    const inside = site.kind === 'wilds' ? CAMP + CAMP : isCleared ? LIT + LIT : DARK + DARK
    const insideColor = site.kind === 'wilds' ? MAP_COLORS.tree : isCleared ? MAP_COLORS.lit : MAP_COLORS.dark
    boxes.set(`${place.column},${place.row}`, {
      top: [{ text: `${topLeft}${number}${topRight}`, color }],
      bottom: [{ text: bottomLeft, color }, { text: inside, color: insideColor }, { text: bottomRight, color }],
    })
  })

  const rows: GridRow[] = []
  for (let row = 0; row < layout.rows; row++) {
    const runs: GridRun[] = []
    for (let column = 0; column < layout.columns; column++) {
      const top = boxes.get(`${column},${row}`)
      const bottom = boxes.get(`${column},${row - 1}`)
      if (top !== undefined || bottom !== undefined) {
        runs.push(...(top?.top ?? bottom?.bottom ?? []))
        column += 1
        continue
      }
      if (layout.isFog(column, row)) {
        runs.push({ text: FOG + FOG, color: MAP_COLORS.fogText })
      } else if (road.has(`${column},${row}`)) {
        runs.push({ text: ROAD + ROAD, color: MAP_COLORS.road })
      } else if (row > 0 && growthAt(regionId, biome, column, row)?.startsWith('tree') === true) {
        runs.push({ text: `${TREE} `, color: MAP_COLORS.tree })
      } else {
        runs.push({ text: '  ' })
      }
    }
    rows.push(tidy(runs))
  }

  return rows
}

/**
 * A Floor as a character grid: each Room a box five cells wide, a lit square
 * and its number when cleared, a dark one when open, its edges doubled when
 * selected; corridors between them; shade for the Rooms past the last Quest.
 */
export const floorGrid = ({ site, floor, selected }: FloorView): GridRow[] => {
  const rooms = floorRooms(site, floor)
  const rows: GridRow[] = [
    [{ text: `${site.name} ${ROAD} Floor ${floor + 1}/${floorCount(site)} ${ROAD} ${clearedOf(site)}/${site.rooms.length} cleared` }],
  ]
  for (let row = 0; row < ROOM_ROWS; row++) {
    const top: GridRun[] = []
    const middle: GridRun[] = []
    const bottom: GridRun[] = []
    const below: GridRun[] = []
    for (let column = 0; column < ROOM_COLUMNS; column++) {
      const at = row * ROOM_COLUMNS + column
      const room = rooms[at]
      const gap = column === 0 ? '' : '  '
      if (room === undefined) {
        const fog = { text: FOG.repeat(5), color: MAP_COLORS.fogText }
        top.push({ text: gap }, fog)
        middle.push({ text: gap }, fog)
        bottom.push({ text: gap }, fog)
        below.push({ text: `${gap}     ` })
        continue
      }
      const [across, down, topLeft, topRight, bottomRight, bottomLeft] = selected === at ? DOUBLE : SINGLE
      const color = selected === at ? MAP_COLORS.lit : MAP_COLORS.dark
      const isLinked = column > 0 && rooms[at - 1] !== undefined
      top.push({ text: gap }, { text: `${topLeft}${across.repeat(3)}${topRight}`, color })
      middle.push(
        { text: isLinked ? SINGLE[0] + SINGLE[0] : gap, color: MAP_COLORS.corridor },
        { text: down, color },
        { text: room.isCleared ? LIT : DARK, color: room.isCleared ? MAP_COLORS.lit : MAP_COLORS.dark },
        { text: String(floor * ROOMS_PER_FLOOR + at + 1).padStart(2, ' ') },
        { text: down, color },
      )
      bottom.push({ text: gap }, { text: `${bottomLeft}${across.repeat(3)}${bottomRight}`, color })
      below.push(
        { text: gap },
        { text: rooms[at + ROOM_COLUMNS] === undefined ? '     ' : `  ${SINGLE[1]}  `, color: MAP_COLORS.corridor },
      )
    }
    rows.push(tidy(top), tidy(middle), tidy(bottom))
    if (row < ROOM_ROWS - 1) {
      rows.push(tidy(below))
    }
  }

  return rows
}

/**
 * The Module view as lines: a lit square and its name for a Module
 * discovered (a star for one charted), a run of shade for one under Fog, nameless; two to a line when
 * `width` cells allow; up to MODULES_SHOWN.
 */
export const modulesGrid = (cells: readonly ModuleCell[], width: number): GridRow[] => {
  const shown = cells.slice(0, MODULES_SHOWN)
  const cell = 26
  const across = width >= cell * 2 + 2 ? 2 : 1
  const runsOf = (module: ModuleCell): GridRun[] =>
    module.isDiscovered
      ? [{ text: `${module.isCharted === true ? CHARTED : LIT} `, color: MAP_COLORS.lit }, { text: (module.name ?? '').slice(0, cell - 2).padEnd(cell - 2, ' ') }]
      : [{ text: FOG.repeat(cell - 2), color: MAP_COLORS.fogText }]
  const rows: GridRow[] = []
  for (let at = 0; at < shown.length; at += across) {
    const runs: GridRun[] = []
    shown.slice(at, at + across).forEach((module, i) => {
      if (i > 0) {
        runs.push({ text: '  ' })
      }
      runs.push(...runsOf(module))
    })
    rows.push(tidy(runs))
  }

  return rows
}
