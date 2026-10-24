// A sample Region for the Region map: two Dungeons (one of them cleared, one
// of 45 Quests, three Floors), the Wilds, a history with Quests won, and
// Modules on disk, some discovered. The map previews (scripts/render-art.mjs)
// and the map art snapshot (tests/map-art.test.ts) are drawn from it.

import { floorSvg, moduleCells, modulesSvg, overworldGrid, overworldSvg } from '../../src/map-art'
import { liveRegion } from '../../src/region-model'
import type { LiveRegion } from '../../src/region-model'
import type { Difficulty, QuestCard } from '../../types'

const DIFFICULTIES: Difficulty[] = ['Trivial', 'Easy', 'Medium', 'Hard', 'Epic', 'Unrated']

const card = (n: number, dungeon?: { key: string; name: string }): QuestCard => ({
  ticket: `#${n}`,
  title: `Quest number ${n}`,
  status: 'open',
  difficulty: DIFFICULTIES[n % DIFFICULTIES.length] ?? 'Unrated',
  recommendedStats: ['intelligence'],
  ...(dungeon === undefined ? {} : { dungeon }),
})

export const BILLING = { key: '2', name: 'Billing' }
export const SEARCH = { key: '3', name: 'Search v2' }
export const ONBOARDING = { key: '5', name: 'Onboarding' }

/** 45 Quests in Search v2 (#100 to #144): every fourth closed, #101 won here. */
const searchQuests = Array.from({ length: 45 }, (_, at) => card(100 + at, SEARCH))

export const SAMPLE_REGION_ID = 'claude-quest'

export const SAMPLE_REGION: LiveRegion = {
  open: [
    card(4),
    card(7),
    card(11, BILLING),
    card(12, BILLING),
    ...searchQuests.filter((_, at) => at % 4 !== 0),
  ],
  closed: [
    card(3),
    card(10, BILLING),
    card(20, ONBOARDING),
    card(21, ONBOARDING),
    ...searchQuests.filter((_, at) => at % 4 === 0),
  ],
  history: [
    { ticket: '#12', startedAt: '2026-10-20T10:00:00.000Z', status: 'won', endedAt: '2026-10-20T12:00:00.000Z' },
    { ticket: '#101', startedAt: '2026-10-21T10:00:00.000Z', status: 'lost', endedAt: '2026-10-21T11:00:00.000Z' },
    { ticket: '#101', startedAt: '2026-10-22T10:00:00.000Z', status: 'won', endedAt: '2026-10-22T11:00:00.000Z' },
    { ticket: '#7', startedAt: '2026-10-22T10:00:00.000Z', status: 'won', endedAt: '2026-10-22T11:00:00.000Z' },
    { ticket: '#7', startedAt: '2026-10-23T10:00:00.000Z', status: 'abandoned' },
  ],
  folders: ['.', 'assets', 'docs/adr', 'docs/agents', 'hooks', 'scripts', 'src', 'tests', 'tests/fixtures', 'types'],
  discovered: ['src', 'hooks', 'tests', 'tests/fixtures'],
}

/** The art the snapshot keeps: the overworld (the second site selected), a Floor of Search v2 (its second Room selected), the Module view. */
export const mapSamples = (): Record<string, string> => {
  const region = liveRegion(SAMPLE_REGION)
  const sites = region.sites.map((site, at) => ({ site, isSelected: at === 1 }))
  const search = region.sites.find(site => site.key === SEARCH.key)
  if (search === undefined) {
    throw new Error('the sample Region has no Search v2')
  }

  return {
    overworld: overworldSvg(SAMPLE_REGION_ID, SAMPLE_REGION_ID, sites),
    overworldGrid: overworldGrid(SAMPLE_REGION_ID, sites).map(row => row.map(run => run.text).join('')).join('\n'),
    floor: floorSvg({ site: search, floor: 0, selected: 1 }),
    modules: modulesSvg(moduleCells(region.modules ?? []), region.moduleCounts),
  }
}
