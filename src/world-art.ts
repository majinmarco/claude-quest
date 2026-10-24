// The World: every Region the Player has played, an Island each on water,
// placed on a square spiral in the order they were first played, so an
// Island never moves once placed. An Island is one of three sizes by how many
// Quests its Snapshot holds, lit by the share of them cleared; the Region of
// the session is marked, and a Region with no Snapshot yet is a small grey
// Island, not mapped yet. Drawn as pixel art where the surface draws SVG
// (worldSvg), as a character grid in the terminal (worldGrid).
//
// The art is drawn tile by tile through drawTile alone: swapping in Kenney
// Tiny Town's tiles (water, sand, grass) is a change to that one function.
// A Region's theme (issue #17: a name and a biome from Haiku) comes in at
// islandsOf (the name, its folder's name kept beside it) and drawTile (the
// biome's palette).

import { regionIdOf, remoteNameOf, rootKeyOf, themeOf } from './region-registry'
import type { Biome, RegionEntry } from './region-registry'
import { GLYPH_HEIGHT } from './pixel-font'
import { Canvas, cutText, Lettering } from './scroll-art'

/** An Island's size, by its Region's Quests: 1 to 10, 11 to 40, more. */
export type IslandSize = 'small' | 'medium' | 'large'

/** A Region as the World draws it. */
export type Island = {
  /** Its place in first-played order, from 1: what its Button and its label say. */
  number: number
  /** Its registry key (the Region's root). */
  key: string
  entry: RegionEntry
  /** Its Region's id, told apart from another of the same id by its remote (or its parent folder). */
  name: string
  /** The name its theme gives it, shown with `name` beside it; null without a theme. */
  themedName: string | null
  /** The land its theme chose; `meadow` without one. */
  biome: Biome
  /** Its slot on the spiral, (0, 0) the first Island's. */
  slot: { x: number; y: number }
  size: IslandSize
  /** The Quests its Snapshot holds, and how many are cleared; 0 of 0 when not mapped. */
  total: number
  cleared: number
  /** Whether it is the Region of the session. */
  isHere: boolean
  /** Whether it has a Snapshot to draw it from. */
  isMapped: boolean
}

/** The size of an Island of `total` Quests. */
export const sizeOf = (total: number): IslandSize => (total <= 10 ? 'small' : total <= 40 ? 'medium' : 'large')

/**
 * The slot of the Island placed `index`th (from 0) on the square spiral:
 * (0, 0), then right, down, left, left, up, up, right, right, right...
 * Every slot is the same whatever comes after it.
 */
export const spiralSlot = (index: number): { x: number; y: number } => {
  let x = 0
  let y = 0
  let walked = 0
  const directions = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ] as const
  for (let leg = 0; walked < index; leg++) {
    const [dx, dy] = directions[leg % 4] ?? [1, 0]
    const length = Math.floor(leg / 2) + 1
    const steps = Math.min(length, index - walked)
    x += dx * steps
    y += dy * steps
    walked += steps
  }

  return { x, y }
}

/** A root's parent folder: `/work/clients/vault` is in `clients`. */
const parentOf = (root: string): string | null => root.split(/[\\/]/).filter(Boolean).slice(-2, -1)[0] ?? null

/**
 * The Regions' Islands, in the order first played (the registry's order for
 * a tie), each on its slot of the spiral; `root` is the session's, whose
 * Island is here. Two Regions of the same id are told apart by their
 * remotes' owner/repo, else their parent folders, else their numbers.
 */
export const islandsOf = (regions: Record<string, RegionEntry>, root: string | null): Island[] => {
  const here = root === null ? null : rootKeyOf(root)
  const ordered = Object.entries(regions)
    .map(([key, entry], at) => ({ key, entry, at }))
    .sort((a, b) => (a.entry.firstPlayedAt < b.entry.firstPlayedAt ? -1 : a.entry.firstPlayedAt > b.entry.firstPlayedAt ? 1 : a.at - b.at))

  const ids = new Map<string, number>()
  for (const { entry } of ordered) {
    ids.set(entry.id, (ids.get(entry.id) ?? 0) + 1)
  }
  const telling = (pick: (entry: RegionEntry) => string | null) => {
    const picked = ordered.map(({ entry }) => ((ids.get(entry.id) ?? 0) > 1 ? pick(entry) : null))
    const seen = new Map<string, number>()
    picked.forEach((value, at) => {
      if (value !== null) {
        const key = `${ordered[at]?.entry.id}|${value}`
        seen.set(key, (seen.get(key) ?? 0) + 1)
      }
    })

    return picked.map((value, at) => (value !== null && seen.get(`${ordered[at]?.entry.id}|${value}`) === 1 ? value : null))
  }
  const byRemote = telling(entry => remoteNameOf(entry.remote))
  const byFolder = telling(entry => parentOf(entry.root))

  return ordered.map(({ key, entry }, at): Island => {
    const { snapshot } = entry
    const total = snapshot === undefined ? 0 : snapshot.dungeons.reduce((sum, dungeon) => sum + dungeon.total, snapshot.wilds.total)
    const cleared = snapshot === undefined ? 0 : snapshot.dungeons.reduce((sum, dungeon) => sum + dungeon.cleared, snapshot.wilds.cleared)
    const id = entry.id === '' ? regionIdOf(key) : entry.id
    const apart = (ids.get(entry.id) ?? 0) > 1 ? (byRemote[at] ?? byFolder[at] ?? `#${at + 1}`) : null
    const theme = themeOf(entry)

    return {
      number: at + 1,
      key,
      entry,
      name: apart === null ? id : `${id} (${apart})`,
      themedName: theme?.name ?? null,
      biome: theme?.biome ?? 'meadow',
      slot: spiralSlot(at),
      size: snapshot === undefined ? 'small' : sizeOf(total),
      total,
      cleared: Math.min(cleared, total),
      isHere: key === here,
      isMapped: snapshot !== undefined,
    }
  })
}

/**
 * How many of an Island's `cells` are lit: its cleared share, rounded, but
 * at least one when any Quest is cleared and one dark while any is open.
 */
export const litCells = (island: Pick<Island, 'total' | 'cleared'>, cells: number): number => {
  if (island.total === 0 || island.cleared === 0) {
    return 0
  }
  if (island.cleared >= island.total) {
    return cells
  }

  return Math.max(1, Math.min(cells - 1, Math.round((island.cleared / island.total) * cells)))
}

/** An Island's name for its Button and the art's alt: its themed name with its own beside it, or its own alone. */
export const islandName = (island: Pick<Island, 'name' | 'themedName'>): string =>
  island.themedName === null ? island.name : `${island.themedName} (${island.name})`

/** What an Island says of itself, for its Button and the art's alt. */
export const islandNote = (island: Island): string =>
  [
    ...(island.isHere ? ['you are here'] : []),
    island.isMapped ? `${island.cleared}/${island.total} cleared` : 'not mapped yet',
  ].join(' · ')

// The pixel art.

/** A tile's side, in the art's pixels. */
const TILE = 4

/** A slot's width and height, in tiles: room for the largest Island and its two lines. */
const SLOT_TILES = 22

/** A slot's width and height, in the art's pixels. */
const SLOT = SLOT_TILES * TILE

/** The tile an Island's centre sits on in its slot. */
const CENTRE = { x: 10, y: 11 }

/** CSS px an art pixel takes, at most. */
export const WORLD_SCALE = 2

/** An Island's radius, in tiles, by its size. */
const RADIUS: Record<IslandSize, number> = { small: 3, medium: 5, large: 7 }

/** The kinds of tile the World is drawn with. */
export type TileKind = 'wave' | 'shore' | 'land' | 'lit' | 'litShore' | 'fog' | 'fogShore'

/** The tiles of an Island's land each biome draws in its own palette; the rest are the World's. */
type LandKind = 'land' | 'lit' | 'shore' | 'litShore'

/** Each biome's land: open and lit, inland and on the coast. A meadow's are the World's own colours. */
const BIOME_COLORS: Record<Biome, Record<LandKind, string>> = {
  meadow: { land: '#3e8948', lit: '#63c74d', shore: '#e4a672', litShore: '#fee761' },
  forest: { land: '#265c42', lit: '#3e8948', shore: '#b07a4a', litShore: '#fee761' },
  coast: { land: '#d4b484', lit: '#f4e4c4', shore: '#8fd3e0', litShore: '#ffffff' },
  desert: { land: '#c88a5a', lit: '#eab585', shore: '#bd6c4a', litShore: '#feae34' },
  snow: { land: '#94a8c4', lit: '#ffffff', shore: '#c0cbdc', litShore: '#e8f4ff' },
  swamp: { land: '#3f5a35', lit: '#6c8a4f', shore: '#6a5038', litShore: '#a0a060' },
}

/** The World's colours, from the sprites' palette. */
const COLORS: Record<TileKind | 'water' | 'flag' | 'pole' | 'text' | 'dim' | 'here', string> = {
  water: '#124e89',
  wave: '#2ce8f5',
  shore: '#e4a672',
  land: '#3e8948',
  lit: '#63c74d',
  litShore: '#fee761',
  fog: '#5a6988',
  fogShore: '#8b9bb4',
  flag: '#e43b44',
  pole: '#c0cbdc',
  text: '#ffffff',
  dim: '#c0cbdc',
  here: '#fee761',
}

/**
 * Draws one tile of `kind` at tile (`x`, `y`) of the World: the one place
 * the World's look is chosen. Today a flat colour on a canvas of tiles (drawn
 * at TILE pixels each); Kenney Tiny Town's 16 px tiles would be drawn here
 * instead (canvas.sprite at x and y times 16, the canvas then scaled by
 * TILE / 16). An Island's land takes its biome's palette (its Region's theme).
 */
export const drawTile = (canvas: Canvas, kind: TileKind, x: number, y: number, biome: Biome = 'meadow'): void =>
  canvas.set(x, y, kind === 'land' || kind === 'lit' || kind === 'shore' || kind === 'litShore' ? BIOME_COLORS[biome][kind] : COLORS[kind])

/** A number from 0 to 2^32 for `text`, the same on every machine (FNV-1a). */
const hashOf = (text: string): number => {
  let hash = 0x811c9dc5
  for (const character of text) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 0x01000193) >>> 0
  }

  return hash
}

/** An Island's land, as tiles from its centre, column by column: a disc with a coastline seeded from its key. */
export const landOf = (island: Pick<Island, 'key' | 'size'>): { x: number; y: number }[] => {
  const radius = RADIUS[island.size]
  const tiles: { x: number; y: number }[] = []
  for (let x = -radius; x <= radius; x++) {
    for (let y = -radius; y <= radius; y++) {
      const wobble = (hashOf(`${island.key}|${x}|${y}`) % 3) - 1
      if (x * x + y * y <= radius * radius + wobble * radius) {
        tiles.push({ x, y })
      }
    }
  }

  return tiles
}

/** The four neighbours of a tile. */
const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const

/**
 * One Island's art, in world coordinates: a few waves, its land lit column
 * by column by its cleared share (grey when not mapped), a flag when it is
 * here; then its label, and what it says under it.
 */
const islandArt = (island: Island, lettering: Lettering): string => {
  const tiles = new Canvas()
  const marks = new Canvas()
  const left = island.slot.x * SLOT_TILES
  const top = island.slot.y * SLOT_TILES
  const seed = hashOf(island.key)
  // A few waves around it, where its seed says.
  for (let at = 0; at < 4; at++) {
    const wx = left + 1 + ((seed >>> (at * 4)) % 19)
    const wy = top + 3 + ((seed >>> (at * 4 + 16)) % 15)
    drawTile(tiles, 'wave', wx, wy)
    drawTile(tiles, 'wave', wx + 1, wy)
  }

  const land = landOf(island)
  const isLand = new Set(land.map(tile => `${tile.x},${tile.y}`))
  const lit = litCells(island, land.length)
  land.forEach((tile, at) => {
    const isCoast = NEIGHBOURS.some(([dx, dy]) => !isLand.has(`${tile.x + dx},${tile.y + dy}`))
    const kind: TileKind = !island.isMapped
      ? isCoast ? 'fogShore' : 'fog'
      : at < lit
        ? isCoast ? 'litShore' : 'lit'
        : isCoast ? 'shore' : 'land'
    drawTile(tiles, kind, left + CENTRE.x + tile.x, top + CENTRE.y + tile.y, island.biome)
  })

  // Pixels from here on: the slot's top left, and the centre tile's middle.
  const x = left * TILE
  const y = top * TILE
  const middle = { x: x + CENTRE.x * TILE + TILE / 2, y: y + CENTRE.y * TILE + TILE / 2 }
  // The Region of the session: a flag on its peak.
  if (island.isHere) {
    const peak = middle.y - RADIUS[island.size] * TILE - 4
    marks.rect(middle.x, peak - 12, 1, 14, COLORS.pole)
    marks.rect(middle.x + 1, peak - 12, 6, 2, COLORS.flag)
    marks.rect(middle.x + 1, peak - 10, 4, 2, COLORS.flag)
    marks.rect(middle.x + 1, peak - 8, 2, 2, COLORS.flag)
  }

  const label = cutText(`${island.number} ${island.themedName ?? island.name}`, SLOT - 4)
  // A themed Island's own name, under its themed one, dim: the project stays findable.
  const own = island.themedName === null ? '' : cutText(island.name, SLOT - 4)
  const footer = island.isHere ? 'you are here' : island.isMapped ? '' : 'not mapped yet'

  return (
    `<g id="island-${island.number}"><g transform="scale(${TILE})">${tiles.svg()}</g>${marks.svg()}` +
    lettering.text(label, x + 2, y + 2, COLORS.text) +
    (own === '' ? '' : lettering.text(own, x + 2, y + 4 + GLYPH_HEIGHT, COLORS.dim)) +
    (island.isMapped ? '' : lettering.text('?', middle.x - 2, middle.y - 4, COLORS.text)) +
    (footer === '' ? '' : lettering.text(footer, x + 2, y + SLOT - 9, island.isHere ? COLORS.here : COLORS.dim)) +
    '</g>'
  )
}

/** The World's bounds, in slots. */
const boundsOf = (islands: readonly Island[]) => {
  const xs = islands.map(island => island.slot.x)
  const ys = islands.map(island => island.slot.y)

  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) }
}

/**
 * The World as an SVG document, its pixels at WORLD_SCALE: the water, then
 * each Island as its own group, in world coordinates, so an Island already
 * placed is drawn the same however many join it. Null with no Islands.
 */
export const worldSvg = (islands: readonly Island[]): { svg: string; width: number; height: number } | null => {
  if (islands.length === 0) {
    return null
  }

  const { left, top, right, bottom } = boundsOf(islands)
  const x = left * SLOT
  const y = top * SLOT
  const width = (right - left + 1) * SLOT
  const height = (bottom - top + 1) * SLOT
  const lettering = new Lettering()
  const art = islands.map(island => islandArt(island, lettering)).join('')

  return {
    svg:
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}" width="${width * WORLD_SCALE}" height="${height * WORLD_SCALE}" shape-rendering="crispEdges">` +
      lettering.defs() +
      `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${COLORS.water}"/>` +
      art +
      '</svg>',
    width: width * WORLD_SCALE,
    height: height * WORLD_SCALE,
  }
}

/** The World in a sentence, for the art's alt. */
export const worldAlt = (islands: readonly Island[]): string =>
  `World: ${islands.map(island => `${island.number} ${islandName(island)} (${island.size}, ${islandNote(island)})`).join('; ')}`

// The terminal's grid.

/** A slot's width and height, in cells. */
const CELLS = { width: 20, height: 5 }

/** An Island's block, in cells, by its size. */
const BLOCK: Record<IslandSize, { width: number; height: number }> = {
  small: { width: 4, height: 1 },
  medium: { width: 6, height: 2 },
  large: { width: 10, height: 3 },
}

/** The terminal's measure: a cell a character, `…` its cut. */
const TEXT_CELLS = { width: (text: string) => [...text].length, ellipsis: '…' }

/** The marks the grid draws with. */
export const GRID_MARKS = { lit: '▓', open: '░', here: '◉' } as const

/** One Island's slot as rows of cells: its label, its block (`▓` lit, `░` the rest, `◉` here), its note. */
const islandCells = (island: Island): string[] => {
  const block = BLOCK[island.size]
  const cells = block.width * block.height
  const lit = litCells(island, cells)
  const rows: string[] = Array.from({ length: CELLS.height }, () => '')
  rows[0] = cutText(`${island.number} ${island.name}`, CELLS.width - 1, TEXT_CELLS)
  const firstRow = 1 + Math.floor((3 - block.height) / 2)
  for (let row = 0; row < block.height; row++) {
    // Lit column by column from the left, as the art lights its land.
    const line = Array.from({ length: block.width }, (_, column) =>
      column * block.height + row < lit ? GRID_MARKS.lit : GRID_MARKS.open,
    ).join('')
    const mark = island.isHere && row === Math.floor((block.height - 1) / 2) ? `${GRID_MARKS.here} ` : '  '
    const pad = ' '.repeat(Math.max(Math.floor((CELLS.width - 1 - block.width) / 2) - 2, 0))
    rows[firstRow + row] = `${pad}${mark}${line}`
  }
  rows[CELLS.height - 1] = island.isMapped ? (island.isHere ? 'you are here' : '') : 'not mapped yet'

  return rows.map(row => row + ' '.repeat(Math.max(CELLS.width - [...row].length, 0)))
}

/** The World as the terminal draws it: a line per row of cells, each Island in its slot of the spiral. */
export const worldGrid = (islands: readonly Island[]): string[] => {
  if (islands.length === 0) {
    return []
  }

  const { left, top, right, bottom } = boundsOf(islands)
  const empty = Array.from({ length: CELLS.height }, () => ' '.repeat(CELLS.width))
  const lines: string[] = []
  for (let y = top; y <= bottom; y++) {
    const slots: string[][] = []
    for (let x = left; x <= right; x++) {
      const island = islands.find(each => each.slot.x === x && each.slot.y === y)
      slots.push(island === undefined ? empty : islandCells(island))
    }
    for (let row = 0; row < CELLS.height; row++) {
      lines.push(slots.map(slot => slot[row] ?? '').join('').trimEnd())
    }
  }

  return lines
}
