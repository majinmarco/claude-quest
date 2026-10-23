// The Quest Source: where Quests come from, one interface over a repo's
// GitHub Issues and, in time, a Jira project. Each adapter reads its own
// ticket fields; the rules turning those fields into a Quest's difficulty and
// recommended Stats are here, shared, so a ticket means the same whichever
// Quest Source it comes from.

import type { Difficulty, QuestCard, QuestSourceProblem, StatName } from '../types'

export type { Difficulty, QuestCard, QuestSourceProblem, StatName } from '../types'

/** What a Quest Source answers: its value, or why it could not reach it. */
export type Sourced<T> = { ok: true; value: T } | { ok: false; problem: QuestSourceProblem }

export type QuestSource = {
  /** The current Region's open Quests. */
  list: () => Promise<Sourced<QuestCard[]>>
  /** One Quest by its ticket reference; null when the reference names none. */
  get: (ticket: string) => Promise<Sourced<QuestCard | null>>
}

export type Size = 'XS' | 'S' | 'M' | 'L' | 'XL'

const SIZE_DIFFICULTY: Record<Size, Difficulty> = {
  XS: 'Trivial',
  S: 'Easy',
  M: 'Medium',
  L: 'Hard',
  XL: 'Epic',
}

/** Story points, Fibonacci-style, to difficulty: 1, 2, 3, 5, then 8 and up. */
const pointsDifficulty = (points: number): Difficulty => {
  if (points <= 1) {
    return 'Trivial'
  }
  if (points <= 2) {
    return 'Easy'
  }
  if (points <= 4) {
    return 'Medium'
  }

  return points <= 7 ? 'Hard' : 'Epic'
}

/**
 * A Quest's difficulty, from its ticket alone: story points when it has them,
 * else its size, else Unrated. Nothing about the Player goes in.
 */
export const difficultyOf = (ticket: { points?: number; size?: Size }): Difficulty => {
  if (ticket.points !== undefined && Number.isFinite(ticket.points) && ticket.points >= 0) {
    return pointsDifficulty(ticket.points)
  }

  return ticket.size === undefined ? 'Unrated' : SIZE_DIFFICULTY[ticket.size]
}

// The kinds of work a ticket can be, as Quest Sources commonly name them, and
// the Stat each calls on. Only Intelligence (logic and design) and Strength
// (debugging) are in play in the MVP (spec #1), so nothing else is recommended.
const KIND_STAT: [RegExp, StatName][] = [
  [/^(bug|defect|fix|regression|incident)$/i, 'strength'],
  [/^(feature|enhancement|story|improvement)$/i, 'intelligence'],
]

/**
 * The Stats a ticket's kinds of work recommend, in the order they are named,
 * each once; Intelligence when none names a Stat.
 */
export const statsOf = (kinds: readonly string[]): StatName[] => {
  const stats: StatName[] = []
  for (const kind of kinds) {
    const stat = KIND_STAT.find(([pattern]) => pattern.test(kind.trim()))?.[1]
    if (stat !== undefined && !stats.includes(stat)) {
      stats.push(stat)
    }
  }

  return stats.length === 0 ? ['intelligence'] : stats
}
