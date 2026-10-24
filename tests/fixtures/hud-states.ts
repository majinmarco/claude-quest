// Sample games for the HUD's pixel strip: its snapshot, its tests and the
// previews scripts/render-art.mjs writes.

import type { GameState, Player, Question } from '../../types'

const STATS = { intelligence: 0, wisdom: 0, dexterity: 0, strength: 0, charisma: 0, constitution: 0 }

const TALLY = { questsClosed: 0, bossesWon: 0, bossStreak: 0, sageRight: 0, modulesDiscovered: 0, regions: [] }

/** A Player at `level` whose Stats lean as given: the Title follows the highest. */
export const playerAt = (level: number, stats: Partial<Player['stats']> = {}): Player => ({
  level,
  xp: 40,
  totalXp: 40,
  hp: 100,
  maxHp: 100,
  stats: { ...STATS, ...stats },
  tally: TALLY,
})

/** A Question waiting, as the HUD counts it. */
const waiting = (id: string, npc: 'Sage' | 'Boss'): Question => ({
  id,
  npc,
  queuedAt: 0,
  shownAt: null,
  prompt: 'Q?',
  options: ['a', 'b', 'c', 'd'],
  answer: 0,
  explanation: '',
  stat: 'intelligence',
  source: { path: 'src/a.ts', lines: [] },
})


/** A level 2 Player between Quests: nothing under way, a read just made. */
export const HUD_CALM: GameState = {
  player: { ...playerAt(2), xp: 120, totalXp: 220, hp: 80 },
  encounter: { kind: 'Exploration', target: 'src/engine.ts', module: 'src', isFirstVisit: false },
  vitals: { mana: 18, model: 'claude-opus-5-5', spendUsd: 0.42 },
  quest: null,
  visitedModules: [],
  battles: [],
  questions: [],
  questionsAsked: 0,
  lastAnswer: null,
  sageCallsOutsideQuest: 0,
  bossFight: null,
}

/**
 * The HUD's worst case: Exhausted, three Badges, a Quest with a long title,
 * its Boss Fight under way, two Questions waiting, a Crafting, every vital.
 */
export const HUD_WORST: GameState = {
  player: {
    ...playerAt(4, { intelligence: 120, wisdom: 45, strength: 30 }),
    xp: 275,
    totalXp: 525,
    hp: 0,
    badges: [
      { id: 'first-quest', name: 'Questbound' },
      { id: 'boss-slayer', name: 'Boss Slayer' },
      { id: 'apprentice', name: 'Apprentice' },
    ],
  },
  encounter: { kind: 'Crafting', target: 'src/order-ledger.ts', module: 'src', item: 'Order Ledger', isNewFile: true, linesAdded: 40, linesRemoved: 0 },
  vitals: { mana: 62, model: 'claude-opus-5-5', spendUsd: 3.47 },
  quest: { ticket: '#6', encounters: [], title: 'Jira Quest Source: read the project, its statuses and story points' },
  visitedModules: [],
  battles: [],
  questions: [waiting('sage-1', 'Sage'), waiting('sage-2', 'Sage')],
  questionsAsked: 2,
  lastAnswer: null,
  sageCallsOutsideQuest: 0,
  bossFight: {
    ticket: '#6',
    sha: 'abc1234',
    cwd: null,
    status: 'fighting',
    hp: 1,
    maxHp: 2,
    questions: [waiting('boss-1', 'Boss')],
    lastAnswer: null,
    questionCount: 3,
  },
}

/** A Battle under way, its boss on its way and Mana near compaction. */
export const HUD_BATTLE: GameState = {
  ...HUD_CALM,
  player: { ...playerAt(3, { wisdom: 40, strength: 10 }), xp: 30, totalXp: 280, hp: 25 },
  encounter: { kind: 'Battle', foe: 'test', check: 'vitest run', outcome: 'hit', hp: 2, maxHp: 4, hits: 2, isCounted: true },
  vitals: { mana: 86, model: 'claude-sonnet-5', spendUsd: 7.1 },
  quest: { ticket: 'ABC-123', encounters: [], title: 'Crash on an empty Region file' },
  bossFight: { ticket: 'ABC-123', sha: 'def5678', cwd: null, status: 'summoned', hp: 2, maxHp: 2, questions: [], lastAnswer: null },
}

/** A Prophecy armed during a Quest, waiting for the Player's call. */
export const HUD_PROPHECY: GameState = {
  ...HUD_CALM,
  player: { ...playerAt(3, { dexterity: 30, intelligence: 20 }), xp: 60, totalXp: 310 },
  quest: { ticket: '#18', encounters: [], title: 'Prophecy: call the red test before it runs' },
  prophecy: { file: 'tests/vault.test.ts', armedAt: 0 },
}
