// The Quest Source contract: what every adapter (GitHub Issues, Jira) does,
// written once against a fake of the tool behind it. An adapter's test file
// calls `questSourceContract` with a harness that builds the adapter over a
// fake world, described here in no one Quest Source's words.

import { describe, expect, test } from 'claude-code/testing'

import type { QuestSource, QuestSourceProblem } from '../src/quest-source'

/** A T-shirt size, as a ticket's size field or label names it. */
export type ContractSize = 'XS' | 'S' | 'M' | 'L' | 'XL'

/** One open ticket of the fake world, in no one Quest Source's words. */
export type ContractTicket = {
  /** The ticket's number; the harness writes it as its Quest Source does. */
  n: number
  title: string
  /** Story points, as the Quest Source records them. */
  points?: number
  /** A size, as the Quest Source records it. */
  size?: ContractSize
  /** What kind of work the ticket is, as the Quest Source records it. */
  kind?: 'bug' | 'feature' | 'docs'
  /** The ticket's status, as the Quest Source names it; the harness's default when absent. */
  status?: string
  /** A triage label (`needs-info`), as the Quest Source labels its tickets. */
  triage?: string
  /** The ticket's description, as the Quest Source writes it. */
  description?: string
  /** The epic the ticket belongs to, by its name, as the Quest Source groups tickets (a milestone, a parent). */
  epic?: string
  /** Whether the ticket is closed (done); open when absent. */
  closed?: boolean
}

/** A way the tool behind a Quest Source can fail, named as the problem it is. */
export type ContractFailure = QuestSourceProblem['kind']

/** The fake world an adapter runs against: some tickets, or a failure. */
export type ContractWorld =
  | { tickets: ContractTicket[] }
  | { failure: ContractFailure }

export type ContractHarness = {
  /** The adapter's name, for the test titles. */
  name: string
  /** The adapter, over a fake of the tool it calls holding this world. */
  source: (world: ContractWorld) => QuestSource
  /** Ticket `n`'s reference as the adapter's Quest Source writes it. */
  ticket: (n: number) => string
  /** The failures the adapter's tool can have, each its own problem kind. */
  failures: readonly ContractFailure[]
}

export function questSourceContract(harness: ContractHarness): void {
  const { name, source, ticket, failures } = harness

  const listed = async (tickets: ContractTicket[]) => {
    const result = await source({ tickets }).list()
    if (!result.ok) {
      throw new Error(`expected a listing, got ${result.problem.kind}`)
    }

    return result.value
  }

  const one = async (fields: Omit<ContractTicket, 'n' | 'title'>) => {
    const [quest] = await listed([{ n: 7, title: 'Seven', ...fields }])

    return quest
  }

  describe(`Quest Source contract: ${name}`, () => {
    test('lists each open ticket as a Quest, by its reference and title', async () => {
      const quests = await listed([
        { n: 5, title: 'Quest Board from GitHub Issues' },
        { n: 6, title: 'Quest Board from Jira' },
      ])

      expect(quests.map(quest => [quest.ticket, quest.title])).toEqual([
        [ticket(5), 'Quest Board from GitHub Issues'],
        [ticket(6), 'Quest Board from Jira'],
      ])
    })

    test('a ticket in an epic carries its Dungeon, by a key and the epic\'s name; one in none carries none', async () => {
      const [billing, alsoBilling, loose, search] = await listed([
        { n: 5, title: 'Five', epic: 'Billing' },
        { n: 6, title: 'Six', epic: 'Billing' },
        { n: 7, title: 'Seven' },
        { n: 8, title: 'Eight', epic: 'Search' },
      ])

      expect(billing?.dungeon?.name).toBe('Billing')
      expect(billing?.dungeon?.key.length).toBeGreaterThan(0)
      expect(alsoBilling?.dungeon).toEqual(billing?.dungeon)
      expect(loose?.dungeon).toBeUndefined()
      expect(search?.dungeon?.name).toBe('Search')
      expect(search?.dungeon?.key).not.toBe(billing?.dungeon?.key)
    })

    test('lists the closed tickets apart from the open ones, each with its Dungeon', async () => {
      const world = {
        tickets: [
          { n: 5, title: 'Five', epic: 'Billing', closed: true },
          { n: 6, title: 'Six', epic: 'Billing' },
          { n: 7, title: 'Seven', closed: true },
        ],
      }
      const open = await source(world).list()
      const closed = await source(world).listClosed()

      expect(open.ok && open.value.map(quest => quest.ticket)).toEqual([ticket(6)])
      expect(closed.ok && closed.value.map(quest => [quest.ticket, quest.dungeon?.name])).toEqual([
        [ticket(5), 'Billing'],
        [ticket(7), undefined],
      ])
    })

    test('a world with no open tickets lists no Quests', async () => {
      expect(await listed([])).toEqual([])
    })

    test('story points set the difficulty', async () => {
      expect((await one({ points: 1 }))?.difficulty).toBe('Trivial')
      expect((await one({ points: 2 }))?.difficulty).toBe('Easy')
      expect((await one({ points: 3 }))?.difficulty).toBe('Medium')
      expect((await one({ points: 5 }))?.difficulty).toBe('Hard')
      expect((await one({ points: 8 }))?.difficulty).toBe('Epic')
      expect((await one({ points: 13 }))?.difficulty).toBe('Epic')
    })

    test('a size sets the difficulty', async () => {
      expect((await one({ size: 'XS' }))?.difficulty).toBe('Trivial')
      expect((await one({ size: 'S' }))?.difficulty).toBe('Easy')
      expect((await one({ size: 'M' }))?.difficulty).toBe('Medium')
      expect((await one({ size: 'L' }))?.difficulty).toBe('Hard')
      expect((await one({ size: 'XL' }))?.difficulty).toBe('Epic')
    })

    test('story points win over a size', async () => {
      expect((await one({ points: 8, size: 'S' }))?.difficulty).toBe('Epic')
    })

    test('a ticket with neither points nor a size is Unrated', async () => {
      expect((await one({}))?.difficulty).toBe('Unrated')
    })

    test('the kind of work recommends the Stats', async () => {
      expect((await one({ kind: 'bug' }))?.recommendedStats).toEqual(['strength'])
      expect((await one({ kind: 'feature' }))?.recommendedStats).toEqual(['intelligence'])
      // Only Intelligence and Strength are in play in the MVP.
      expect((await one({ kind: 'docs' }))?.recommendedStats).toEqual(['intelligence'])
      expect((await one({}))?.recommendedStats).toEqual(['intelligence'])
    })

    test('a ticket keeps its status', async () => {
      expect((await one({ status: 'ready-for-agent' }))?.status).toBe('ready-for-agent')
    })

    test('a triage label is a tag', async () => {
      expect((await one({ triage: 'needs-info' }))?.tags).toEqual(['needs-info'])
      expect((await one({}))?.tags ?? []).toEqual([])
    })

    test('gets a ticket\'s description, as text, with its Quest', async () => {
      const result = await source({
        tickets: [{ n: 5, title: 'Five', description: 'Orders of **10** or more get 10% off.' }],
      }).get(ticket(5))

      expect(result.ok && result.value?.summary).toContain('Orders of')
      expect(result.ok && result.value?.summary).toContain('10% off.')
    })

    test('gets one Quest by its reference', async () => {
      const result = await source({
        tickets: [
          { n: 5, title: 'Quest Board from GitHub Issues', size: 'M' },
          { n: 6, title: 'Quest Board from Jira' },
        ],
      }).get(ticket(5))

      expect(result).toMatchObject({
        ok: true,
        value: {
          ticket: ticket(5),
          title: 'Quest Board from GitHub Issues',
          difficulty: 'Medium',
        },
      })
    })

    test('a reference that names no ticket gets no Quest', async () => {
      const result = await source({ tickets: [{ n: 5, title: 'Five' }] }).get(ticket(99))

      expect(result).toEqual({ ok: true, value: null })
    })

    for (const failure of failures) {
      test(`a ${failure} tool lists nothing and says why`, async () => {
        const quests = source({ failure })
        const list = await quests.list()
        const get = await quests.get(ticket(5))
        const closed = await quests.listClosed()

        expect(list).toMatchObject({ ok: false, problem: { kind: failure } })
        expect(closed).toMatchObject({ ok: false, problem: { kind: failure } })
        expect(get).toMatchObject({ ok: false, problem: { kind: failure } })
        if (!list.ok) {
          expect(list.problem.message.length).toBeGreaterThan(0)
        }
      })
    }
  })
}
