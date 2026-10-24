// The Quest Source: where Quests come from, one interface over a repo's
// GitHub Issues and, in time, a Jira project. Each adapter reads its own
// ticket fields; the rules turning those fields into a Quest's difficulty and
// recommended Stats are here, shared, so a ticket means the same whichever
// Quest Source it comes from.

import type { Difficulty, QuestCard, QuestSourceProblem, StatName, TicketDetails } from '../types'

export type { Difficulty, QuestCard, QuestSourceProblem, StatName, TicketDetails } from '../types'

/** What a Quest Source answers: its value, or why it could not reach it. */
export type Sourced<T> = { ok: true; value: T } | { ok: false; problem: QuestSourceProblem }

export type QuestSource = {
  /** The current Region's open Quests. */
  list: () => Promise<Sourced<QuestCard[]>>
  /** One Quest by its ticket reference, with its description; null when the reference names none. */
  get: (ticket: string) => Promise<Sourced<TicketDetails | null>>
}

/**
 * The most Quests one listing reads. A listing this long may have been cut
 * short: the Quest Board says `200+`.
 */
export const LISTING_CAP = 200

// The triage labels (docs/agents/triage-labels.md), shown as a ticket's tags,
// and as a GitHub issue's status, which has none of its own.
export const TRIAGE: ReadonlySet<string> = new Set([
  'needs-triage',
  'needs-info',
  'ready-for-agent',
  'ready-for-human',
  'wontfix',
])

/** The triage labels among `labels`, in their order. */
export const triageTagsOf = (labels: readonly string[]): string[] => labels.filter(label => TRIAGE.has(label))

/** The most of a description a ticket's summary keeps, in characters, before the Quest cuts it further. */
const SUMMARY_READ = 4000

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }

/**
 * A ticket's description as plain text: Markdown and plain text as written,
 * HTML with its tags taken out, Atlassian Document Format's text nodes joined
 * (a paragraph or heading a line). Blank lines squeezed; undefined when it
 * holds no text.
 */
export const plainTextOf = (description: unknown): string | undefined => {
  const raw = typeof description === 'string' ? htmlToText(description) : adfToText(description)
  const text = raw.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()

  return text === '' ? undefined : text.slice(0, SUMMARY_READ)
}

const htmlToText = (text: string): string => {
  if (!/<\/?[a-z][^>]*>/i.test(text)) {
    return text
  }

  return text
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#39|[a-z]+);/gi, (entity, name: string) => ENTITIES[name.toLowerCase()] ?? entity)
}

const BLOCKS = new Set(['paragraph', 'heading', 'listItem', 'codeBlock', 'blockquote', 'tableRow', 'rule'])

const adfToText = (node: unknown): string => {
  if (typeof node !== 'object' || node === null) {
    return ''
  }

  const { type, text, content } = node as { type?: unknown; text?: unknown; content?: unknown }
  if (typeof text === 'string') {
    return text
  }
  if (type === 'hardBreak') {
    return '\n'
  }

  const inner = Array.isArray(content) ? content.map(adfToText).join('') : ''

  return typeof type === 'string' && BLOCKS.has(type) ? `${inner.replace(/\n+$/, '')}\n` : inner
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

// Labels are where a Quest Source with no size or points field of its own
// (GitHub Issues; Jira, for size) keeps them.
const SIZE_WORDS: Record<string, Size> = {
  xs: 'XS',
  'extra-small': 'XS',
  xsmall: 'XS',
  tiny: 'XS',
  s: 'S',
  small: 'S',
  m: 'M',
  medium: 'M',
  l: 'L',
  large: 'L',
  xl: 'XL',
  'extra-large': 'XL',
  xlarge: 'XL',
  huge: 'XL',
}

// `size: M`, `size:M`, `size/M`, `size-M`, `Size: medium`.
const SIZE_LABEL = /^size\s*[:/-]?\s*([a-z-]+)$/i
// `points: 5`, `sp:5`, `story points: 5`, `estimate: 5`.
const POINTS_LABEL = /^(?:points|sp|story[ -]?points|estimate)\s*[:/-]?\s*(\d+(?:\.\d+)?)$/i

/** The size a label names, the first that names one. */
export const sizeFromLabels = (labels: readonly string[]): Size | undefined => {
  for (const label of labels) {
    const word = SIZE_LABEL.exec(label.trim())?.[1]?.toLowerCase()
    const size = word === undefined ? undefined : SIZE_WORDS[word]
    if (size !== undefined) {
      return size
    }
  }

  return undefined
}

/** The story points a label names, the first that names some. */
export const pointsFromLabels = (labels: readonly string[]): number | undefined => {
  for (const label of labels) {
    const points = POINTS_LABEL.exec(label.trim())?.[1]
    if (points !== undefined) {
      return Number(points)
    }
  }

  return undefined
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
