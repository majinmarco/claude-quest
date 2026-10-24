// Sample Quest cards for the scroll art's snapshot and for rendering the
// board to files (scripts/render-art.mjs): one per kind of card a board shows.

import { questXp } from '../../src/engine'
import type { Difficulty, QuestCard } from '../../types'

export const SAMPLE_CARDS: QuestCard[] = [
  { ticket: '#5', title: 'Quest Board from GitHub Issues', status: 'ready-for-agent', difficulty: 'Medium', recommendedStats: ['intelligence', 'wisdom'], tags: ['ready-for-agent', 'enhancement'] },
  { ticket: '#6', title: 'Quest Board from Jira: read the project, its statuses and story points', status: 'needs-triage', difficulty: 'Hard', recommendedStats: ['wisdom', 'constitution'], tags: ['needs-triage'] },
  { ticket: '#9', title: 'Crash on an empty Region file', status: 'ready-for-agent', difficulty: 'Trivial', recommendedStats: ['dexterity'] },
  { ticket: 'ABC-123', title: "Haiku budget: cache the Sage's questions per change", status: 'In Progress', difficulty: 'Unrated', recommendedStats: ['intelligence', 'charisma'] },
]

/** The card drawn unrolled. */
export const SAMPLE_SELECTED = '#6'

/** The Quest reward each difficulty shows. */
export const SAMPLE_XP = Object.fromEntries(
  (['Trivial', 'Easy', 'Medium', 'Hard', 'Epic', 'Unrated'] as const).map(difficulty => [difficulty, questXp(difficulty)]),
) as Record<Difficulty, number>
