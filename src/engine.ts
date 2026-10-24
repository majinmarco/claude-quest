// The Game Engine: every game rule, as one pure step from (state, event) to
// (state, effects). It knows nothing of Claude Code.

import type { Battle, BattleEncounter, CheckKind, CraftingEncounter, Difficulty, Encounter, FileChange, GameState, Player, Quest, Question, QuestionAnswer, QuestionContent, StatName, Vitals } from '../types'

export type { Battle, BattleEncounter, CheckKind, CraftingEncounter, Difficulty, Encounter, FileChange, GameState, Player, Quest, Question, QuestionAnswer, QuestionContent, Vitals } from '../types'

export type GameEvent =
  /**
   * A read or search of `path`, in `module` (see GameState.visitedModules);
   * null when it was outside the project, or where that is not known.
   */
  | { type: 'FILE_READ'; path: string; module: string | null }
  /**
   * A file created or changed (a Write, an Edit, a NotebookEdit), with its
   * Module as for FILE_READ. `linesAdded` and `linesRemoved` count the lines of
   * its diff, context left out: a line replaced is one of each. `diff` is the
   * change as unified-diff hunks (`@@ -1,3 +1,3 @@` and the lines under it).
   */
  | {
      type: 'FILE_EDIT'
      path: string
      module: string | null
      isNewFile: boolean
      /** The file's lines before the change; null for a new file, or when not known. */
      linesBefore: number | null
      linesAdded: number
      linesRemoved: number
      diff: string
    }
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
  /**
   * The Content Generator made a Question about a code-changing Encounter's
   * change, at `at` (ms since the epoch): the Sage queues it.
   */
  | { type: 'QUESTION_READY'; question: QuestionContent; at: number }
  /** The dialogue box put a waiting Question in front of the Player, at `at`. */
  | { type: 'QUESTION_SHOWN'; id: string; at: number }
  /** The Player chose option `choice` of a waiting Question, at `at`. */
  | { type: 'QUESTION_ANSWERED'; id: string; choice: number; at: number }
  /** The Player moved on from their last answer's explanation. */
  | { type: 'ANSWER_DISMISSED' }

export type Effect =
  | { type: 'ENCOUNTER_STARTED'; encounter: Encounter }
  /** The Encounter under way moved on: a Battle's monster was hit, grew or fell. */
  | { type: 'ENCOUNTER_UPDATED'; encounter: Encounter }
  /** Newly passing tests (or cleared errors) struck the check's monster. */
  | { type: 'MONSTER_HIT'; check: string; hits: number; hp: number }
  | { type: 'BATTLE_WON'; check: string; foe: CheckKind }
  /**
   * Code changed in a code-changing Encounter: what the Sage asks one
   * Question about. A Crafting's file, or the edits that won a Battle.
   */
  | { type: 'CODE_CHANGED'; changes: FileChange[] }
  /** A Question joined the Question Queue; `waiting` is how many wait now. */
  | { type: 'QUESTION_QUEUED'; id: string; waiting: number }
  /** The Player answered a Question: right or wrong, its explanation shows. */
  | { type: 'QUESTION_ANSWERED'; answer: QuestionAnswer }
  /** HP lost: a wrong answer's cost. */
  | { type: 'HP_LOST'; amount: number }
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

/**
 * How many lines an edit changes, at least, to be a major edit and forge an
 * item. A line replaced counts once, so the lines changed are the larger of
 * those added and those removed: 10 rewritten, 10 new, or 10 deleted.
 */
export const MAJOR_EDIT_LINES = 10

/**
 * The share of a file's lines a change replaces, at least, to be a
 * near-complete rewrite, a major edit however small the file: 4 of 5 lines.
 */
export const REWRITE_SHARE = 0.8

/** The XP a Crafting earns: something made. */
export const CRAFTING_XP = 10

/**
 * The Intelligence XP a right answer earns: twice a Crafting's, since reading
 * and understanding the code is what the game is for. Accuracy pays, not
 * volume: a wrong answer earns nothing and costs HP.
 */
export const QUESTION_XP = 20

/**
 * The HP a wrong answer costs: a tenth of a new Player's 100, so guessing
 * hurts without ten wrong answers being far off.
 */
export const WRONG_ANSWER_HP = 10

/**
 * How many edits made during a Battle the Sage asks about once it is won:
 * the latest, the fix; the earlier ones are often false starts.
 */
export const MAX_FIX_EDITS = 5

/**
 * Whether an Encounter changed code, for the Sage to ask about: a Crafting,
 * or a Battle won.
 */
export const isCodeChanging = (encounter: Encounter): boolean =>
  encounter.kind === 'Crafting' || (encounter.kind === 'Battle' && encounter.outcome === 'won')

/** A file's stem says nothing of the component in these: its folder does. */
const GENERIC_STEMS = new Set(['index', '__init__', 'mod'])

/**
 * The item a file forges, named after the component it is: its name without
 * the last extension, in words. Words split at `-`, `_`, `.`, spaces and
 * camelCase humps (`HTTPServer` is `HTTP Server`), each capitalised.
 * An `index`, `__init__` or `mod` file is named after its folder.
 */
export const itemNameOf = (path: string): string => {
  const segments = path.split(/[\\/]/).filter(Boolean)
  const stemOf = (name: string) => name.replace(/^\.+/, '').replace(/\.[^.]+$/, '')
  let stem = stemOf(segments.pop() ?? '')
  if (GENERIC_STEMS.has(stem) && segments.length > 0) {
    stem = segments.pop() ?? stem
  }
  const words = stem
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s._-]+/)
    .filter(Boolean)

  return words.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

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
  questions: [],
  questionsAsked: 0,
  lastAnswer: null,
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
    case 'FILE_EDIT':
      return craft(withFix(state, event), event)
    case 'QUESTION_READY':
      return queueQuestion(state, event.question, event.at)
    case 'QUESTION_SHOWN':
      return showQuestion(state, event.id, event.at)
    case 'QUESTION_ANSWERED':
      return answerQuestion(state, event)
    case 'ANSWER_DISMISSED':
      return { state: { ...state, lastAnswer: null }, effects: [] }
  }
}

// A new file, or a major edit, is forged: the blacksmith makes an item named
// after the component. A major edit changes MAJOR_EDIT_LINES lines or more,
// or rewrites a file near completely (REWRITE_SHARE of its lines replaced).
// A minor edit plays nothing.
const craft = (
  state: GameState,
  event: Extract<GameEvent, { type: 'FILE_EDIT' }>,
): { state: GameState; effects: Effect[] } => {
  const { linesBefore } = event
  const changed = Math.max(event.linesAdded, event.linesRemoved)
  // Emptying a file makes nothing, so a rewrite must add lines too.
  const isRewrite =
    linesBefore !== null &&
    linesBefore > 0 &&
    event.linesAdded > 0 &&
    event.linesRemoved >= REWRITE_SHARE * linesBefore
  if (!event.isNewFile && changed < MAJOR_EDIT_LINES && !isRewrite) {
    return { state, effects: [] }
  }

  const { path, module, isNewFile, linesAdded, linesRemoved, diff } = event
  const item = itemNameOf(path)
  const encounter: CraftingEncounter = {
    kind: 'Crafting',
    target: path,
    module,
    item,
    isNewFile,
    linesAdded,
    linesRemoved,
  }
  const gained = gainXp(state.player, CRAFTING_XP)

  return {
    state: { ...state, player: gained.player, encounter, quest: attach(state.quest, encounter) },
    effects: [
      { type: 'ENCOUNTER_STARTED', encounter },
      { type: 'CODE_CHANGED', changes: [{ path, diff }] },
      { type: 'XP_GAINED', amount: CRAFTING_XP },
      ...gained.effects,
    ],
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

/** XP earned by a Stat's kind of work: the Player's, and that Stat's. */
const gainStatXp = (
  player: Player,
  stat: StatName,
  amount: number,
): { player: Player; effects: Effect[] } => {
  const gained = gainXp(player, amount)

  return {
    player: {
      ...gained.player,
      stats: { ...gained.player.stats, [stat]: gained.player.stats[stat] + amount },
    },
    effects: gained.effects,
  }
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
  { check, foe, hp, maxHp, isCounted }: Battle,
  hits: number,
  outcome: BattleEncounter['outcome'],
): BattleEncounter => ({ kind: 'Battle', check, foe, hp, maxHp, isCounted, hits, outcome })

// Every edit made while a Battle stands may be part of its fix, minor ones
// above all: each Battle under way keeps the latest MAX_FIX_EDITS.
const withFix = (
  state: GameState,
  { path, diff }: Extract<GameEvent, { type: 'FILE_EDIT' }>,
): GameState =>
  state.battles.length === 0
    ? state
    : {
        ...state,
        battles: state.battles.map(battle => ({
          ...battle,
          edits: [...(battle.edits ?? []), { path, diff }].slice(-MAX_FIX_EDITS),
        })),
      }

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
  // The Sage asks about the fix; a Battle won with no edit changed no code.
  const fix = open.edits ?? []
  const gained = gainStatXp(state.player, 'strength', amount)
  const { player } = gained

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
      ...(fix.length > 0 ? [{ type: 'CODE_CHANGED', changes: fix } as const] : []),
      { type: 'XP_GAINED', amount, stat: 'strength' },
      ...gained.effects,
    ],
  }
}

// The Question Queue: Questions wait, oldest first, until the Player answers
// them; nothing in it ever holds up the session.
const queueQuestion = (
  state: GameState,
  content: QuestionContent,
  at: number,
): { state: GameState; effects: Effect[] } => {
  const questionsAsked = state.questionsAsked + 1
  const question: Question = {
    ...content,
    id: `sage-${questionsAsked}`,
    npc: 'Sage',
    queuedAt: at,
    shownAt: null,
  }
  const questions = [...state.questions, question]

  return {
    state: { ...state, questions, questionsAsked },
    effects: [{ type: 'QUESTION_QUEUED', id: question.id, waiting: questions.length }],
  }
}

// An answer's time runs from the first time the Player saw the Question.
const showQuestion = (
  state: GameState,
  id: string,
  at: number,
): { state: GameState; effects: Effect[] } => ({
  state: {
    ...state,
    questions: state.questions.map(question =>
      question.id === id && question.shownAt === null ? { ...question, shownAt: at } : question,
    ),
  },
  effects: [],
})

// A right answer earns QUESTION_XP of Intelligence, the Stat in play for
// understanding code, whatever the Question's tag; a wrong one costs
// WRONG_ANSWER_HP, never below zero. Either way the Question leaves the queue
// and its explanation shows.
const answerQuestion = (
  state: GameState,
  { id, choice, at }: Extract<GameEvent, { type: 'QUESTION_ANSWERED' }>,
): { state: GameState; effects: Effect[] } => {
  const question = state.questions.find(each => each.id === id)
  if (question === undefined || !Number.isInteger(choice) || choice < 0 || choice >= question.options.length) {
    return { state, effects: [] }
  }

  const isCorrect = choice === question.answer
  const xp = isCorrect ? QUESTION_XP : 0
  const hpLost = isCorrect ? 0 : Math.min(WRONG_ANSWER_HP, state.player.hp)
  const answer: QuestionAnswer = {
    question,
    choice,
    isCorrect,
    answeredAt: at,
    answerMs: question.shownAt === null ? null : at - question.shownAt,
    xp,
    hpLost,
  }
  const questions = state.questions.filter(each => each !== question)

  if (!isCorrect) {
    return {
      state: {
        ...state,
        questions,
        lastAnswer: answer,
        player: { ...state.player, hp: state.player.hp - hpLost },
      },
      effects: [
        { type: 'QUESTION_ANSWERED', answer },
        { type: 'HP_LOST', amount: hpLost },
      ],
    }
  }

  const gained = gainStatXp(state.player, 'intelligence', xp)

  return {
    state: { ...state, questions, lastAnswer: answer, player: gained.player },
    effects: [
      { type: 'QUESTION_ANSWERED', answer },
      { type: 'XP_GAINED', amount: xp, stat: 'intelligence' },
      ...gained.effects,
    ],
  }
}
