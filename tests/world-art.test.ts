// The World: Islands placed on a spiral in first-played order, sized by their
// Quests, lit by their cleared share, the Region of the session marked. The
// snapshot is written by `node scripts/render-art.mjs --snapshot`, after a
// look at the art (`node scripts/render-art.mjs <dir>` renders it to files).

import { describe, expect, test } from 'claude-code/testing'

import type { RegionEntry } from '../src/region-registry'
import { GRID_MARKS, islandsOf, litCells, sizeOf, spiralSlot, worldAlt, worldGrid, worldSvg } from '../src/world-art'
import { FOUR_REGIONS, HERE, snapshotOf, THREE_REGIONS, TWO_REGIONS } from './fixtures/world-regions'
import { WORLD_SNAPSHOTS } from './fixtures/world-snapshot'

/** The Svg element's limit, in characters. */
const SVG_LIMIT = 131072

/** The characters an SVG letters, by the glyphs it places, in order. */
const lettered = (svg: string): string =>
  [...svg.matchAll(/<use href="#g([0-9a-f]+)"/g)].map(([, code]) => String.fromCodePoint(parseInt(code ?? '3f', 16))).join('')

/** Each Island's group in an SVG, by its number. */
const groupsOf = (svg: string): string[] =>
  svg
    .replace('</svg>', '')
    .split('<g id="island-')
    .slice(1)
    .map(group => `<g id="island-${group}`)

/** An Island's group without its lettering: its land, waves and flag, as placed. */
const landAndMarks = (group: string): string => group.slice(0, group.indexOf('<g fill='))

const region = (root: string, firstPlayedAt: string, overrides: Partial<RegionEntry> = {}): RegionEntry => ({
  id: root.split('/').pop() ?? root,
  root,
  remote: null,
  firstPlayedAt,
  lastPlayedAt: firstPlayedAt,
  ...overrides,
})

describe('The World: placing Islands', () => {
  test('Islands are placed on a square spiral from the centre outwards', () => {
    expect(Array.from({ length: 10 }, (_, at) => spiralSlot(at))).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: -1, y: 1 },
      { x: -1, y: 0 },
      { x: -1, y: -1 },
      { x: 0, y: -1 },
      { x: 1, y: -1 },
      { x: 2, y: -1 },
    ])
  })

  test('Islands follow the order their Regions were first played, not the registry order', () => {
    const regions = {
      '/w/late': region('/w/late', '2026-10-03T00:00:00.000Z'),
      '/w/first': region('/w/first', '2026-10-01T00:00:00.000Z'),
      '/w/tie-a': region('/w/tie-a', '2026-10-02T00:00:00.000Z'),
      '/w/tie-b': region('/w/tie-b', '2026-10-02T00:00:00.000Z'),
    }

    expect(islandsOf(regions, null).map(island => [island.number, island.name, island.slot])).toEqual([
      [1, 'first', { x: 0, y: 0 }],
      [2, 'tie-a', { x: 1, y: 0 }],
      [3, 'tie-b', { x: 1, y: 1 }],
      [4, 'late', { x: 0, y: 1 }],
    ])
  })

  test('a Region joining never moves an Island already placed: the art of two, then three', () => {
    const two = worldSvg(islandsOf(TWO_REGIONS, HERE))?.svg ?? ''
    const three = worldSvg(islandsOf(THREE_REGIONS, HERE))?.svg ?? ''

    expect(two).toBe(WORLD_SNAPSHOTS.two.svg)
    expect(three).toBe(WORLD_SNAPSHOTS.three.svg)
    // Each Island of two is drawn the same, at the same place, among three:
    // only its label may grow, to tell it from a newcomer of the same name.
    const placed = groupsOf(two).map(landAndMarks)
    expect(placed).toHaveLength(2)
    for (const art of placed) {
      expect(three).toContain(art)
    }
    const slots = (islands: ReturnType<typeof islandsOf>) => islands.map(({ slot, size }) => ({ slot, size }))
    expect(slots(islandsOf(THREE_REGIONS, HERE)).slice(0, 2)).toEqual(slots(islandsOf(TWO_REGIONS, HERE)))
  })

  test('the terminal grid of two, then three', () => {
    expect(worldGrid(islandsOf(TWO_REGIONS, HERE))).toEqual(WORLD_SNAPSHOTS.two.grid)
    expect(worldGrid(islandsOf(THREE_REGIONS, HERE))).toEqual(WORLD_SNAPSHOTS.three.grid)
  })

  test('many Islands stay within the Svg limit', () => {
    const regions = Object.fromEntries(
      Array.from({ length: 49 }, (_, at) => {
        const root = `/w/project-${at}`
        return [root, region(root, `2026-10-01T00:00:${String(at).padStart(2, '0')}.000Z`, { snapshot: snapshotOf([[60, at]]) })]
      }),
    )

    expect((worldSvg(islandsOf(regions, null))?.svg ?? '').length).toBeLessThan(SVG_LIMIT)
  })

  test('no Region played yet: no World to draw', () => {
    expect(worldSvg([])).toBeNull()
    expect(worldGrid([])).toEqual([])
  })
})

describe('The World: an Island', () => {
  test('three sizes by its Quests: 1 to 10, 11 to 40, more', () => {
    expect([1, 10, 11, 40, 41, 200].map(sizeOf)).toEqual(['small', 'small', 'medium', 'medium', 'large', 'large'])
    expect(islandsOf(FOUR_REGIONS, HERE).map(island => [island.name, island.size, island.total])).toEqual([
      ['claude-quest', 'medium', 12],
      ['vault (majinmarco/vault)', 'small', 6],
      ['vault (acme/vault)', 'small', 0],
      ['monorepo', 'large', 64],
    ])
  })

  test('lit by the share of its Quests cleared, never all lit while one is open nor dark once one is cleared', () => {
    expect(litCells({ total: 12, cleared: 5 }, 12)).toBe(5)
    expect(litCells({ total: 6, cleared: 6 }, 4)).toBe(4)
    expect(litCells({ total: 100, cleared: 1 }, 4)).toBe(1)
    expect(litCells({ total: 100, cleared: 99 }, 4)).toBe(3)
    expect(litCells({ total: 0, cleared: 0 }, 4)).toBe(0)
    // In the terminal: claude-quest, 5 of 12 cleared, has 5 of its 12 cells lit.
    const grid = worldGrid(islandsOf(TWO_REGIONS, HERE)).join('\n')
    expect([...grid].filter(cell => cell === GRID_MARKS.lit)).toHaveLength(5 + 4)
  })

  test('the Region of the session is marked: you are here', () => {
    const islands = islandsOf(TWO_REGIONS, HERE)
    expect(islands.map(island => island.isHere)).toEqual([true, false])
    expect(lettered(worldSvg(islands)?.svg ?? '')).toContain('youarehere')
    expect(worldGrid(islands).join('\n').split(GRID_MARKS.here)).toHaveLength(2)
    expect(worldAlt(islands)).toBe(
      'World: 1 claude-quest (medium, you are here · 5/12 cleared); 2 vault (small, 6/6 cleared)',
    )
  })

  test('a Region without a Snapshot is a small Island, not mapped yet', () => {
    const islands = islandsOf(THREE_REGIONS, HERE)
    expect(islands[2]).toMatchObject({ size: 'small', isMapped: false, total: 0, cleared: 0 })
    expect(lettered(worldSvg(islands)?.svg ?? '')).toContain('notmappedyet')
    expect(worldGrid(islands).some(line => line.includes('not mapped yet'))).toBe(true)
  })

  test('two Regions of one folder name are told apart by owner/repo, else by their parent folders', () => {
    expect(islandsOf(THREE_REGIONS, HERE).map(island => island.name)).toEqual(['claude-quest', 'vault (majinmarco/vault)', 'vault (acme/vault)'])

    const noRemotes = {
      '/a/vault': region('/a/vault', '2026-10-01T00:00:00.000Z'),
      '/b/vault': region('/b/vault', '2026-10-02T00:00:00.000Z'),
    }
    expect(islandsOf(noRemotes, null).map(island => island.name)).toEqual(['vault (a)', 'vault (b)'])
  })
})
