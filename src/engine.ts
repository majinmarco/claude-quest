// The Game Engine: every game rule, as one pure step from (state, event) to
// (state, effects). It knows nothing of Claude Code.

import type { Battle, BattleEncounter, CheckKind, Difficulty, Encounter, GameState, Player, Quest, StatName, Vitals } from '../types'

export type { Battle, BattleEncounter, CheckKind, Difficulty, Encounter, GameState, Player, Quest, Vitals } from '../types'

export type GameEvent =
  /**
   * A read or search of `path`, in `module` (see GameState.visitedModules);
   * null when it was outside the project, or where that is not known.
   */
  | { type: 'FILE_READ'; path: string; module: string | null }
  | {
      type: 'SESSION_MEASURED'
      /** Absent while the context window has no reading yet. */
      mana?: number
      model?: string
      spendUsd?: number
    }
  | { type: 'QUEST_START'; ticket: string }
  /**
   * A check (a test run, lint or type-check) failed: `failures` is how many
   * its output counts, null when it counts none that can be read.
   */
  | { type: 'TEST_FAIL'; check: string; kind: CheckKind; failures: number | null }
  /** A check passed: nothing failing. */
  | { type: 'TEST_PASS'; check: string; kind: CheckKind }

export type Effect =
  | { type: 'ENCOUNTER_STARTED'; encounter: Encounter }
  /** The Encounter under way moved on: a Battle's monster was hit, grew or fell. */
  | { type: 'ENCOUNTER_UPDATED'; encounter: Encounter }
  /** Newly passing tests (or cleared errors) struck the check's monster. */
  | { type: 'MONSTER_HIT'; check: string; hits: number; hp: number }
  | { type: 'BATTLE_WON'; check: string; foe: CheckKind }
  /** XP earned; `stat` is the Stat whose kind of work earned it, if any. */
  | { type: 'XP_GAINED'; amount: number; stat?: StatName }
  /** The Player's first visit to a Module in this Region. */
  | { type: 'MODULE_DISCOVERED'; module: string }
  | { type: 'LEVEL_UP'; level: number }
  | { type: 'COMPACTION_WARNING'; mana: number }
  | { type: 'QUEST_STARTED'; ticket: string }
  | { type: 'QUEST_ABANDONED'; ticket: string }

const EXPLORATION_XP = 5

/**
 * The bonus for a first visit to a Module: Wisdom's kind of XP, for learning
 * how the system is laid out. It goes to the Player's XP like any other; no
 * Stat grows from it yet.
 */
export const DISCOVERY_XP = 10

/**
 * The Strength XP a Battle won earns, per HP of its monster at its largest:
 * the more that was failing, the bigger the win.
 */
export const BATTLE_XP_PER_HP = 10

/** How full Mana is: it turns `filling`, then `warning` before compaction. */
export type ManaLevel = 'calm' | 'filling' | 'warning'

/** Mana's thresholds, as whole percentages of the context window. */
const MANA_FILLING = 50
const MANA_WARNING = 80

export const manaLevel = (mana: number | null): ManaLevel => {
  if (mana === null || mana < MANA_FILLING) {
    return 'calm'
  }

  return mana < MANA_WARNING ? 'filling' : 'warning'
}

/**
 * The XP a Quest rewards, by its difficulty alone: it doubles with each step.
 * A ticket that names no size is Unrated and rewards as Easy, so an unsized
 * ticket is still worth taking but never worth more than a sized one.
 */
const QUEST_XP: Record<Difficulty, number> = {
  Trivial: 25,
  Easy: 50,
  Medium: 100,
  Hard: 200,
  Epic: 400,
  Unrated: 50,
}

export const questXp = (difficulty: Difficulty): number => QUEST_XP[difficulty]

/** XP needed to clear a level: 100 at level 1, 200 at level 2, and so on. */
export const xpToClear = (level: number): number => 100 * level

export const newPlayer = (): Player => ({
  level: 1,
  xp: 0,
  hp: 100,
  maxHp: 100,
  stats: {
    intelligence: 0,
    wisdom: 0,
    dexterity: 0,
    strength: 0,
    charisma: 0,
    constitution: 0,
  },
})

export const newGame = (player: Player = newPlayer()): GameState => ({
  player,
  encounter: null,
  vitals: { mana: null, model: null, spendUsd: null },
  quest: null,
  visitedModules: [],
  battles: [],
})

export const step = (
  state: GameState,
  event: GameEvent,
): { state: GameState; effects: Effect[] } => {
  switch (event.type) {
    case 'FILE_READ':
      return explore(state, event.path, event.module)
    case 'SESSION_MEASURED':
      return measure(state, event)
    case 'QUEST_START':
      return startQuest(state, event.ticket)
    case 'TEST_FAIL':
      return checkFailed(state, event)
    case 'TEST_PASS':
      return checkPassed(state, event.check)
  }
}

const explore = (
  state: GameState,
  path: string,
  module: string | null,
): { state: GameState; effects: Effect[] } => {
  // Outside the project there is no Module to discover.
  const isFirstVisit = module !== null && !state.visitedModules.includes(module)
  const encounter: Encounter = { kind: 'Exploration', target: path, module, isFirstVisit }
  const earned: Effect[] = [{ type: 'XP_GAINED', amount: EXPLORATION_XP }]
  if (isFirstVisit) {
    earned.push(
      { type: 'MODULE_DISCOVERED', module },
      { type: 'XP_GAINED', amount: DISCOVERY_XP, stat: 'wisdom' },
    )
  }
  const total = earned.reduce(
    (sum, effect) => sum + (effect.type === 'XP_GAINED' ? effect.amount : 0),
    0,
  )
  const gained = gainXp(state.player, total)

  return {
    state: {
      ...state,
      player: gained.player,
      encounter,
      quest: attach(state.quest, encounter),
      visitedModules:
        isFirstVisit && module !== null ? [...state.visitedModules, module] : state.visitedModules,
    },
    effects: [{ type: 'ENCOUNTER_STARTED', encounter }, ...earned, ...gained.effects],
  }
}

/** An Encounter belongs to the active Quest; between Quests, to none. */
const attach = (quest: Quest | null, encounter: Encounter): Quest | null =>
  quest === null
    ? null
    : { ...quest, encounters: [...quest.encounters, encounter] }

const gainXp = (
  player: Player,
  amount: number,
): { player: Player; effects: Effect[] } => {
  let { level, xp } = player
  const effects: Effect[] = []
  xp += amount

  while (xp >= xpToClear(level)) {
    xp -= xpToClear(level)
    level += 1
    effects.push({ type: 'LEVEL_UP', level })
  }

  return { player: { ...player, level, xp }, effects }
}

const measure = (
  state: GameState,
  event: Extract<GameEvent, { type: 'SESSION_MEASURED' }>,
): { state: GameState; effects: Effect[] } => {
  // A measurement with no Mana reading clears it; the model and spend keep
  // their last.
  const mana = event.mana ?? null
  const vitals: Vitals = {
    mana,
    model: event.model ?? state.vitals.model,
    spendUsd: event.spendUsd ?? state.vitals.spendUsd,
  }

  // Warn once as Mana crosses into `warning`, not on every measurement there.
  const effects: Effect[] =
    mana !== null &&
    manaLevel(mana) === 'warning' &&
    manaLevel(state.vitals.mana) !== 'warning'
      ? [{ type: 'COMPACTION_WARNING', mana }]
      : []

  return { state: { ...state, vitals }, effects }
}

// One active Quest per session. Starting another replaces it: the Quest
// running is abandoned, not refused, because until a Boss Fight can close a
// Quest a refusal would hold the session to its first Quest for good. The
// Quest already running, started again, carries on with its Encounters.
const startQuest = (
  state: GameState,
  ticket: string,
): { state: GameState; effects: Effect[] } => {
  if (state.quest?.ticket === ticket) {
    return { state, effects: [] }
  }

  const abandoned: Effect[] =
    state.quest === null ? [] : [{ type: 'QUEST_ABANDONED', ticket: state.quest.ticket }]
  const quest: Quest = { ticket, encounters: [] }

  return {
    state: { ...state, quest },
    effects: [...abandoned, { type: 'QUEST_STARTED', ticket }],
  }
}

/** The game with `battle`'s Encounter played: current, and on the Quest. */
const playBattle = (
  state: GameState,
  encounter: BattleEncounter,
  battles: Battle[],
): GameState => ({
  ...state,
  encounter,
  quest: attach(state.quest, encounter),
  battles,
})

const encounterOf = (
  battle: Battle,
  hits: number,
  outcome: BattleEncounter['outcome'],
): BattleEncounter => ({ kind: 'Battle', ...battle, hits, outcome })

// A Battle is against one Check: the same command run again. Its
// monster's HP is the failures the check last counted; each failure fewer on
// the next run is a hit. A run that counts none readable spawns a one-HP
// monster, or leaves the one standing as it was. Another Check has its own
// Battle.
const checkFailed = (
  state: GameState,
  event: Extract<GameEvent, { type: 'TEST_FAIL' }>,
): { state: GameState; effects: Effect[] } => {
  const { check, failures } = event
  const open = state.battles.find(battle => battle.check === check)

  if (open === undefined) {
    const hp = failures ?? 1
    const battle: Battle = { check, foe: event.kind, hp, maxHp: hp, isCounted: failures !== null }
    const encounter = encounterOf(battle, 0, 'spawned')

    return {
      state: playBattle(state, encounter, [...state.battles, battle]),
      effects: [{ type: 'ENCOUNTER_STARTED', encounter }],
    }
  }

  const hp = failures ?? open.hp
  const hits = Math.max(0, open.hp - hp)
  const battle: Battle = {
    ...open,
    hp,
    maxHp: Math.max(open.maxHp, hp),
    isCounted: failures === null ? open.isCounted : true,
  }
  const outcome = hits > 0 ? 'hit' : hp > open.hp ? 'grew' : 'stands'
  const encounter = encounterOf(battle, hits, outcome)

  return {
    state: playBattle(
      state,
      encounter,
      state.battles.map(each => (each === open ? battle : each)),
    ),
    effects: [
      { type: 'ENCOUNTER_UPDATED', encounter },
      ...(hits > 0 ? [{ type: 'MONSTER_HIT', check, hits, hp } as const] : []),
    ],
  }
}

// All green wins: the monster takes its last hits and falls, and the Player
// earns Strength XP for it, by the monster's largest HP. A check passing with
// no Battle against it plays nothing.
const checkPassed = (
  state: GameState,
  check: string,
): { state: GameState; effects: Effect[] } => {
  const open = state.battles.find(battle => battle.check === check)
  if (open === undefined) {
    return { state, effects: [] }
  }

  const encounter = encounterOf({ ...open, hp: 0 }, open.hp, 'won')
  const amount = BATTLE_XP_PER_HP * open.maxHp
  const gained = gainXp(state.player, amount)
  const player = {
    ...gained.player,
    stats: { ...gained.player.stats, strength: gained.player.stats.strength + amount },
  }

  return {
    state: {
      ...playBattle(
        state,
        encounter,
        state.battles.filter(battle => battle !== open),
      ),
      player,
    },
    effects: [
      { type: 'ENCOUNTER_UPDATED', encounter },
      { type: 'MONSTER_HIT', check, hits: open.hp, hp: 0 },
      { type: 'BATTLE_WON', check, foe: open.foe },
      { type: 'XP_GAINED', amount, stat: 'strength' },
      ...gained.effects,
    ],
  }
}
