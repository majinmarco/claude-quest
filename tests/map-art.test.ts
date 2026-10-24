// The Region map art: the overworld, a Floor and the Module view, as SVG and
// as the terminal grid, all seeded from the Region and its Dungeons, never
// from the clock. The snapshot is written by `node scripts/render-art.mjs
// --snapshot` after a look at the art (`node scripts/render-art.mjs <dir>`
// renders the previews).

import { describe, expect, test } from 'claude-code/testing'

import { floorGrid, floorSvg, hotkeyOf, overworldGrid, overworldLayout, overworldSvg } from '../src/map-art'
import { floorCount, floorRooms, liveRegion, snapshotOf, snapshotRegion, wonTickets } from '../src/region-model'
import type { Site } from '../src/region-model'
import type { QuestCard } from '../types'
import { mapSamples, SAMPLE_REGION } from './fixtures/region-map'
import { MAP_SNAPSHOTS } from './fixtures/map-snapshot'

/** The Svg element limit, in characters. */
const SVG_LIMIT = 131072

const card = (n: number, dungeon?: { key: string; name: string }): QuestCard => ({
  ticket: `#${n}`,
  title: `Quest ${n}`,
  status: 'open',
  difficulty: 'Medium',
  recommendedStats: ['intelligence'],
  ...(dungeon === undefined ? {} : { dungeon }),
})

const dungeon = (key: string, rooms: number, cleared = 0): Site => ({
  key,
  name: `Dungeon ${key}`,
  kind: 'dungeon',
  rooms: Array.from({ length: rooms }, (_, at) => ({ quest: card(at + 1), isCleared: at < cleared, difficulty: 'Medium' })),
})

const overworldOf = (regionId: string, keys: string[]) =>
  overworldSvg(regionId, regionId, keys.map(key => ({ site: dungeon(key, 3), isSelected: false })))

describe('Region map art: the overworld', () => {
  test('the sample Region is drawn as approved', () => {
    expect(mapSamples()).toEqual(MAP_SNAPSHOTS)
  })

  test('the same Region and Dungeon keys draw the same overworld, every time', () => {
    expect(overworldOf('claude-quest', ['2', '3', '5'])).toBe(overworldOf('claude-quest', ['2', '3', '5']))
  })

  test('two Regions with the same Dungeons are laid out differently', () => {
    expect(overworldOf('claude-quest', ['2', '3', '5'])).not.toBe(overworldOf('hotel-booking', ['2', '3', '5']))
    const places = (regionId: string) => overworldLayout(regionId, ['2', '3', '5', '8']).places
    expect(places('claude-quest')).not.toEqual(places('hotel-booking'))
  })

  test('the land past the last site is Fog: the rest of its band and two rows more', () => {
    const layout = overworldLayout('claude-quest', ['a'])
    const [place] = layout.places
    expect(place?.row).toBe(1)
    expect(layout.rows).toBe(6)
    expect(layout.isFog(0, 4)).toBe(true)
    expect(layout.isFog(place?.column ?? 0, 1)).toBe(false)
    expect(layout.isFog(13, 1)).toBe(true)
  })

  test('a Region of fifty Dungeons still fits an Svg element', () => {
    const keys = Array.from({ length: 50 }, (_, at) => `EPIC-${at + 1}`)
    expect(overworldOf('big-monorepo', keys).length).toBeLessThan(SVG_LIMIT)
  })

  test('a cleared Dungeon flies a pennant; one still open does not', () => {
    const cleared = overworldSvg('r', 'r', [{ site: dungeon('a', 2, 2), isSelected: false }])
    const open = overworldSvg('r', 'r', [{ site: dungeon('a', 2, 1), isSelected: false }])
    const pennant = /<rect[^>]*fill="#e84537"/
    expect(cleared).toMatch(pennant)
    expect(open).not.toMatch(pennant)
  })

  test('the terminal grid boxes each site with its number, lit squares in a cleared Dungeon, Fog after', () => {
    const rows = overworldGrid('claude-quest', [
      { site: dungeon('a', 2, 2), isSelected: false },
      { site: dungeon('b', 2, 0), isSelected: true },
    ]).map(row => row.map(run => run.text).join(''))
    expect(rows.some(row => row.includes('┌1─┐'))).toBe(true)
    expect(rows.some(row => row.includes('└▣▣┘'))).toBe(true)
    expect(rows.some(row => row.includes('╔2═╗'))).toBe(true)
    expect(rows.some(row => row.includes('╚▢▢╝'))).toBe(true)
    expect(rows.at(-1)).toMatch(/^░+$/)
  })
})

describe('Region map art: Floors and Rooms', () => {
  test('a Dungeon of 45 Quests has three Floors of 20, 20 and 5 Rooms', () => {
    const site = dungeon('a', 45)
    expect(floorCount(site)).toBe(3)
    expect([0, 1, 2].map(floor => floorRooms(site, floor).length)).toEqual([20, 20, 5])
    expect(floorCount(dungeon('b', 20))).toBe(1)
    expect(floorCount(dungeon('c', 0))).toBe(1)
  })

  test('the terminal draws a Floor: lit and dark Rooms by number, Fog past the last', () => {
    const rows = floorGrid({ site: dungeon('a', 22, 1), floor: 1, selected: 0 }).map(row => row.map(run => run.text).join(''))
    expect(rows[0]).toBe('Dungeon a · Floor 2/2 · 1/22 cleared')
    expect(rows[2]).toBe('║▢21║──│▢22│  ░░░░░  ░░░░░  ░░░░░')
  })

  test('the SVG of a Floor stays well under the Svg limit', () => {
    expect(floorSvg({ site: dungeon('a', 20, 7), floor: 0, selected: 3 }).length).toBeLessThan(SVG_LIMIT / 2)
  })

  test('the first ten choices have hotkeys 1 to 9 and 0; the rest none', () => {
    expect([0, 8, 9, 10].map(hotkeyOf)).toEqual(['1', '9', '0', undefined])
  })
})

describe('Region model', () => {
  test('a Room is cleared when its ticket is closed, or its latest run here was won', () => {
    const region = liveRegion(SAMPLE_REGION)
    const room = (ticket: string) => region.sites.flatMap(site => site.rooms).find(one => one.quest?.ticket === ticket)
    expect(room('#3')?.isCleared).toBe(true)
    expect(room('#12')?.isCleared).toBe(true)
    expect(room('#101')?.isCleared).toBe(true)
    expect(room('#11')?.isCleared).toBe(false)
    expect(room('#7')?.isCleared).toBe(false)
  })

  test('the latest run of a ticket decides whether it was won', () => {
    expect([...wonTickets(SAMPLE_REGION.history)].sort()).toEqual(['#101', '#12'])
  })

  test('the Wilds come first, then the Dungeons by key; a Region with no epics is all Wilds', () => {
    expect(liveRegion(SAMPLE_REGION).sites.map(site => site.name)).toEqual(['The Wilds', 'Billing', 'Search v2', 'Onboarding'])
    const loose = liveRegion({ ...SAMPLE_REGION, open: [card(1), card(2)], closed: [] })
    expect(loose.sites.map(site => site.kind)).toEqual(['wilds'])
    const none = liveRegion({ ...SAMPLE_REGION, open: [], closed: [] })
    expect(none.sites.map(site => [site.kind, site.rooms.length])).toEqual([['wilds', 0]])
  })

  test('a Snapshot keeps the counts the World needs, and draws the same sites again', () => {
    const snapshot = snapshotOf(liveRegion(SAMPLE_REGION), '2026-10-24T09:00:00.000Z')
    expect(snapshot).toEqual({
      takenAt: '2026-10-24T09:00:00.000Z',
      dungeons: [
        { key: '2', name: 'Billing', total: 3, cleared: 2 },
        { key: '3', name: 'Search v2', total: 45, cleared: 13 },
        { key: '5', name: 'Onboarding', total: 2, cleared: 2 },
      ],
      wilds: { total: 3, cleared: 1 },
      modules: { discovered: 4, total: 10 },
    })
    expect(snapshotOf(snapshotRegion(snapshot), snapshot.takenAt)).toEqual(snapshot)
  })
})
