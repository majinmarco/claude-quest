// The registry of Regions the World draws: every project the Player has
// played, by its root, with its Snapshot. The pure rules are tested here; the
// mod writing it at session start and Quest close in tests/overview.test.tsx.

import { describe, expect, test } from 'claude-code/testing'

import { newPlayer } from '../src/engine'
import {
  closedIn,
  fitRegions,
  regionIdOf,
  remoteNameOf,
  seedRegions,
  touched,
  withSnapshot,
} from '../src/region-registry'
import type { RegionEntry, RegionSnapshot } from '../src/region-registry'

const T0 = '2026-10-24T10:00:00.000Z'
const T1 = '2026-10-24T11:00:00.000Z'

const SNAPSHOT: RegionSnapshot = {
  takenAt: T0,
  dungeons: [
    { key: 'm1', name: 'Overview', total: 4, cleared: 1 },
    { key: 'm2', name: 'Region map', total: 3, cleared: 3 },
  ],
  wilds: { total: 5, cleared: 2 },
  modules: { discovered: 6, total: 20 },
}

const entry = (root: string, overrides: Partial<RegionEntry> = {}): RegionEntry => ({
  id: regionIdOf(root),
  root,
  remote: null,
  firstPlayedAt: T0,
  lastPlayedAt: T0,
  ...overrides,
})

describe('Region registry', () => {
  test('a Region is named after its root folder', () => {
    expect(regionIdOf('/home/marco/development/claude-quest')).toBe('claude-quest')
    expect(regionIdOf('/work/vault/')).toBe('vault')
  })

  test('a session start creates the entry of a root not played yet, first and last played now', () => {
    expect(touched({}, '/work/vault', 'git@github.com:acme/vault.git', T0)).toEqual({
      '/work/vault': { id: 'vault', root: '/work/vault', remote: 'git@github.com:acme/vault.git', firstPlayedAt: T0, lastPlayedAt: T0 },
    })
  })

  test('a session start touches a root played before: last played now, the rest kept', () => {
    const before = { '/work/vault': entry('/work/vault', { snapshot: SNAPSHOT }) }
    const after = touched(before, '/work/vault', 'https://github.com/acme/vault', T1)

    expect(after['/work/vault']).toEqual({ ...entry('/work/vault', { snapshot: SNAPSHOT }), remote: 'https://github.com/acme/vault', lastPlayedAt: T1 })
  })

  test('a remote that cannot be read now does not erase the one known', () => {
    const before = { '/work/vault': entry('/work/vault', { remote: 'git@github.com:acme/vault.git' }) }

    expect(touched(before, '/work/vault', null, T1)['/work/vault']?.remote).toBe('git@github.com:acme/vault.git')
  })

  test('a seeded Region known only by name takes its root when played again, in its place', () => {
    const seeded = { '/work/a': entry('/work/a'), 'name:vault': entry('', { id: 'vault' }), '/work/b': entry('/work/b') }
    const after = touched(seeded, '/work/vault', null, T1)

    expect(Object.keys(after)).toEqual(['/work/a', '/work/vault', '/work/b'])
    expect(after['/work/vault']).toEqual({ id: 'vault', root: '/work/vault', remote: null, firstPlayedAt: T0, lastPlayedAt: T1 })
  })

  test('a Snapshot written replaces the one kept and nothing else; a Region not known is created by it', () => {
    const before = { '/work/vault': entry('/work/vault') }
    const after = withSnapshot(before, '/work/vault', SNAPSHOT, { id: 'vault', remote: null }, T1)
    expect(after['/work/vault']).toEqual({ ...entry('/work/vault'), snapshot: SNAPSHOT })

    const created = withSnapshot({}, '/work/new', SNAPSHOT, { id: 'new', remote: 'git@github.com:acme/new.git' }, T1)
    expect(created['/work/new']).toEqual({
      id: 'new',
      root: '/work/new',
      remote: 'git@github.com:acme/new.git',
      firstPlayedAt: T1,
      lastPlayedAt: T1,
      snapshot: SNAPSHOT,
    })
  })

  test('a Snapshot keeps names and counts only, its names cut and its Dungeons bounded', () => {
    const many: RegionSnapshot = {
      ...SNAPSHOT,
      dungeons: Array.from({ length: 200 }, (_, at) => ({ key: `k${at}`, name: 'x'.repeat(500), total: 3, cleared: 9, tickets: ['#1'] }) as never),
    }
    const kept = withSnapshot({}, '/w', many, { id: 'w', remote: null }, T1)['/w']?.snapshot

    expect(kept?.dungeons.length).toBe(64)
    expect(kept?.dungeons[0]).toEqual({ key: 'k0', name: 'x'.repeat(80), total: 3, cleared: 3 })
  })

  test('a Quest closed touches its Region; one cleared lights its Dungeon, or the Wilds, never past its total', () => {
    const before = { '/work/vault': entry('/work/vault', { snapshot: SNAPSHOT }) }

    const inDungeon = closedIn(before, '/work/vault', { dungeon: 'm1' }, T1)['/work/vault']
    expect(inDungeon?.lastPlayedAt).toBe(T1)
    expect(inDungeon?.snapshot?.dungeons[0]?.cleared).toBe(2)
    expect(inDungeon?.snapshot?.wilds.cleared).toBe(2)

    expect(closedIn(before, '/work/vault', { dungeon: null }, T1)['/work/vault']?.snapshot?.wilds.cleared).toBe(3)
    expect(closedIn(before, '/work/vault', { dungeon: 'm2' }, T1)['/work/vault']?.snapshot?.dungeons[1]?.cleared).toBe(3)
    // Not cleared (lost, unfought), or its Dungeon not known: the counts stay.
    expect(closedIn(before, '/work/vault', null, T1)['/work/vault']?.snapshot).toEqual(SNAPSHOT)
  })

  test('a Quest closed in a Region the registry lacks creates it', () => {
    expect(closedIn({}, '/work/vault', null, T1)['/work/vault']).toEqual(entry('/work/vault', { firstPlayedAt: T1, lastPlayedAt: T1 }))
  })

  test("an older Player is seeded once: a Region per discovered root, then the tally's Regions not among them", () => {
    const player = { ...newPlayer(), tally: { ...newPlayer().tally, regions: ['vault', 'gone'] } }
    const seeded = seedRegions(player, ['/work/vault', '/work/claude-quest'], T0)

    expect(Object.keys(seeded)).toEqual(['/work/vault', '/work/claude-quest', 'name:gone'])
    expect(seeded['name:gone']).toEqual({ id: 'gone', root: '', remote: null, firstPlayedAt: T0, lastPlayedAt: T0 })
    expect(seeded['/work/vault']?.snapshot).toBeUndefined()
  })

  test('the registry is kept small: the least recently played Regions lose their Snapshots first', () => {
    const regions = {
      '/old': entry('/old', { lastPlayedAt: T0, snapshot: SNAPSHOT }),
      '/new': entry('/new', { lastPlayedAt: T1, snapshot: SNAPSHOT }),
    }
    const size = JSON.stringify(regions).length
    const fitted = fitRegions(regions, size - 10)

    expect(fitted['/old']?.snapshot).toBeUndefined()
    expect(fitted['/new']?.snapshot).toEqual(SNAPSHOT)
    expect(Object.keys(fitted)).toEqual(['/old', '/new'])
  })

  test('a remote is named owner/repo when it can be read from its URL', () => {
    expect(remoteNameOf('git@github.com:majinmarco/claude-quest.git')).toBe('majinmarco/claude-quest')
    expect(remoteNameOf('https://github.com/acme/vault')).toBe('acme/vault')
    expect(remoteNameOf('ssh://git@gitlab.example.com:2222/group/sub/vault.git')).toBe('sub/vault')
    expect(remoteNameOf('/srv/git/vault.git')).toBeNull()
    expect(remoteNameOf(null)).toBeNull()
  })
})
