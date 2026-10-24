// The Game Engine: every game rule, as one pure step from (state, event) to
// (state, effects). It knows nothing of Claude Code.

import type { Badge, BadgeId, Battle, Prophecy, ProphecyCall, TicketVerified, BattleEncounter, BossFight, CheckKind, CraftingEncounter, Difficulty, Encounter, FileChange, GameState, Npc, Player, Quest, QuestOutcome, Question, QuestionAnswer, QuestionContent, PoolCounters, StatName, Tally, Trophy, Vitals, XpPool } from '../types'

export type { Badge, Battle, Prophecy, ProphecyCall, TicketVerified, BattleEncounter, BossFight, CheckKind, CraftingEncounter, Difficulty, Encounter, FileChange, GameState, Npc, Player, Quest, QuestOutcome, Question, QuestionAnswer, QuestionContent, PoolCounters, Tally, Trophy, Vitals, XpPool } from '../types'

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
      /**
       * True for an Edit that replaced every occurrence of a string (a rename
       * across the file): never a major edit, however many lines it touched.
       */
      replaceAll?: boolean
    }
  | {
      type: 'SESSION_MEASURED'
      /** Absent while the context window has no reading yet. */
      mana?: number
      model?: string
      spendUsd?: number
    }
  /**
   * A Quest starts for `ticket`; `difficulty` as the Quest Board listed it,
   * Unrated when absent (the board never listed it).
   */
  | { type: 'QUEST_START'; ticket: string; difficulty?: Difficulty }
  /**
   * What is known of the ticket of Quest `ticket`: its title, a summary of
   * its description, its difficulty and whether its Quest Source found it.
   * Kept on the active Quest when it is that ticket's; each field given
   * replaces the one kept, the others stay, but the difficulty, fixed at the
   * start, is taken only by a Quest still Unrated. The Sage and the boss show
   * the title and summary to Haiku, as data. A ticket `not-found` pays no
   * Quest reward.
   */
  | {
      type: 'QUEST_DETAILS'
      ticket: string
      title?: string
      summary?: string
      difficulty?: Difficulty
      verified?: TicketVerified
    }
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
  | {
      type: 'QUESTION_READY'
      question: QuestionContent
      at: number
      /**
       * The cache key of the change it asks about: a Question for a change
       * already answered this session is not queued again.
       */
      key?: string
      /** The NPC who asks it, drawn in the dialogue box; the Sage when absent. */
      npc?: Npc
    }
  /** The dialogue box put a waiting Question in front of the Player, at `at`. */
  | { type: 'QUESTION_SHOWN'; id: string; at: number }
  /** The Player chose option `choice` of a waiting Question, at `at`. */
  | { type: 'QUESTION_ANSWERED'; id: string; choice: number; at: number }
  /** The Player moved on from their last answer's explanation. */
  | { type: 'ANSWER_DISMISSED' }
  /**
   * Haiku is about to be called for `purpose`: granted while its budget lasts
   * (and counted), refused once spent. Ask before each call, never after.
   */
  | {
      type: 'HAIKU_CALL_REQUESTED'
      purpose: HaikuPurpose
      /**
       * The cache key of the change a Sage call would ask about: refused,
       * spending nothing, when that change was answered this session or its
       * Question is waiting.
       */
      key?: string
    }
  /**
   * A granted call for `purpose` failed for a passing reason (rate limited,
   * overloaded, no response): it is given back to the budget it was counted
   * on, `ticket`'s (null: the session's between Quests).
   */
  | { type: 'HAIKU_CALL_REFUNDED'; purpose: HaikuPurpose; ticket: string | null }
  /**
   * Haiku cannot be reached on this account (the model refused or not
   * found, the account not allowed): no call is made for the rest of the
   * session, Sage or Boss Fight.
   */
  | { type: 'HAIKU_UNAVAILABLE' }
  /**
   * A git commit was made through Claude's Bash tool: `sha` as git printed
   * it, `cwd` the folder the command moved to first (null: the session's).
   * `fromError`: read from the output of a command that failed after the
   * commit, so its diff must come from git, never from the Quest's changes.
   */
  | { type: 'COMMIT'; sha: string; cwd: string | null; fromError?: true }
  /** The Boss Fight of Quest `ticket` has its review Questions, made at `at`. */
  | { type: 'BOSS_FIGHT_READY'; ticket: string; questions: QuestionContent[]; at: number }
  /** No Boss Fight could be made for Quest `ticket`: why, in `reason`. */
  | { type: 'BOSS_FIGHT_UNAVAILABLE'; ticket: string; reason: string }
  /** The Player chose option `choice` of the Boss Fight's Question `id`, at `at`. */
  | { type: 'BOSS_ANSWERED'; id: string; choice: number; at: number }
  /** The Player skipped the Boss Fight. */
  | { type: 'BOSS_FIGHT_SKIPPED' }
  /**
   * Claude wrote or edited a test file (`path`, as the change named it; see
   * isTestFile), at `at`: a Prophecy is armed for the next Check. Played
   * after every FILE_EDIT of a test file, whatever saw the change (a Write,
   * Edit or NotebookEdit, a change read from git).
   */
  | { type: 'TEST_FILE_EDITED'; path: string; at: number }
  /** The Player called the armed Prophecy: how the next Check will end. */
  | { type: 'PROPHECY_MADE'; call: ProphecyCall }
  /**
   * A Check is about to run (its TEST_PASS or TEST_FAIL comes when it ends):
   * no Prophecy can be called from now, as its output could be read first.
   */
  | { type: 'CHECK_STARTED' }

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
  /**
   * A Question joined the Question Queue; `waiting` is how many wait now.
   * `npc` names who asks it when that is not the Sage.
   */
  | { type: 'QUESTION_QUEUED'; id: string; waiting: number; npc?: Exclude<Npc, 'sage'> }
  /**
   * The active Quest's ticket was found with a summary: the Quest Giver's
   * Briefing is to be made from it (outside the engine), then queued as a
   * QUESTION_READY from the `quest-giver`.
   */
  | { type: 'BRIEFING_WANTED'; ticket: string; title?: string; summary: string }
  /** The Player answered a Question: right or wrong, its explanation shows. */
  | { type: 'QUESTION_ANSWERED'; answer: QuestionAnswer }
  /** HP lost: a wrong answer's cost. */
  | { type: 'HP_LOST'; amount: number }
  /** HP healed: a new Quest, a level-up or a Boss Fight won. */
  | { type: 'HP_HEALED'; amount: number }
  /**
   * An XP pool just filled, for the active Quest (or the session, between
   * Quests): what it would pay is 0 from now. Told once per pool per Quest.
   */
  | { type: 'XP_CAPPED'; pool: XpPool }
  /** XP earned; `stat` is the Stat whose kind of work earned it, if any. */
  | { type: 'XP_GAINED'; amount: number; stat?: StatName }
  /** The Player's first visit to a Module in this Region. */
  | { type: 'MODULE_DISCOVERED'; module: string }
  | { type: 'LEVEL_UP'; level: number }
  | { type: 'COMPACTION_WARNING'; mana: number }
  | { type: 'QUEST_STARTED'; ticket: string }
  | { type: 'QUEST_ABANDONED'; ticket: string }
  /** A Haiku call for `purpose` may go ahead: the `used`th of `limit`. */
  | { type: 'HAIKU_CALL_GRANTED'; purpose: HaikuPurpose; used: number; limit: number }
  /**
   * No call is made for `purpose`: its budget is spent (`used` of `limit`);
   * with `reason` `unavailable`, Haiku is not available this session; with
   * `asked`, the change was asked about already (isAsked).
   */
  | { type: 'HAIKU_CALL_REFUSED'; purpose: HaikuPurpose; used: number; limit: number; reason?: 'unavailable' | 'asked' }
  /** Haiku was just found unavailable on this account: told once per session. */
  | { type: 'HAIKU_UNAVAILABLE' }
  /**
   * The active Quest's first commit summoned its Boss Fight: its Questions are
   * to be made from the commit's diff (`sha`, in `cwd`, null for the
   * session's folder), or from `changes`, the Quest's own, when git cannot
   * give it.
   */
  | {
      type: 'BOSS_FIGHT_SUMMONED'
      ticket: string
      sha: string
      cwd: string | null
      changes: FileChange[]
    }
  /**
   * The Boss Fight's `questionCount` Questions wait: the boss stands with
   * `hp`, two thirds of them rounded up, so two right of three win.
   */
  | { type: 'BOSS_FIGHT_STARTED'; ticket: string; hp: number; questionCount: number }
  /** A right answer hit the boss, while it stood: `hp` left. */
  | { type: 'BOSS_HIT'; hp: number }
  /** A Badge joined the Player's. */
  | { type: 'BADGE_EARNED'; badge: Badge }
  /** A Boss Fight won earned its Quest's trophy, the first win of that Quest in its Region. */
  | { type: 'TROPHY_EARNED'; trophy: Trophy }
  /** The active Quest closed, its Boss Fight ended as `outcome`. */
  | { type: 'QUEST_CLOSED'; ticket: string; outcome: QuestOutcome }
  /** A Prophecy is armed, not yet called, on the edit of test file `file`. */
  | { type: 'PROPHECY_ARMED'; file: string }
  /**
   * A Check settled the Prophecy the Player called: `call` theirs, `outcome`
   * how the Check ended, `xp` what a right call paid (0 when wrong, or its
   * pool full).
   */
  | { type: 'PROPHECY_SETTLED'; call: ProphecyCall; outcome: ProphecyCall; isRight: boolean; xp: number }

/**
 * What a Haiku call is for: the Sage's Question after a code-changing
 * Encounter, or the Boss Fight's review Questions at a Quest's end. Each has
 * a budget of its own per ticket for the session.
 */
export type HaikuPurpose = 'sage' | 'boss'

/**
 * The game's rules the Player can tune (the mod's settings): the Haiku
 * budget, and when a right answer is too hasty for full XP.
 */
export type Rules = {
  /** Haiku calls the Sage may make per ticket, for the session (0 disables its Questions). */
  sageCallsPerQuest: number
  /** Haiku calls the Boss Fight may make per ticket, for the session (0: Quests close unfought). */
  bossFightCallsPerQuest: number
  /**
   * Haiku calls the Sage may make outside any Quest, for the whole session:
   * a small allowance, so work done between Quests is still asked about.
   */
  sageCallsOutsideQuest: number
  /** A right answer quicker than this, from when it was shown, is hasty: ms. */
  hastyAnswerMs: number
  /** A Question pointing at this many source lines or more is non-trivial. */
  nonTrivialLines: number
}

/**
 * The defaults: ten Sage calls and three Boss Fight calls per Quest, as the
 * spec bounds Haiku; five Sage calls between Quests; a right answer within
 * five seconds to a Question of three lines or more is hasty.
 */
export const DEFAULT_RULES: Rules = {
  sageCallsPerQuest: 10,
  bossFightCallsPerQuest: 3,
  sageCallsOutsideQuest: 5,
  hastyAnswerMs: 5000,
  nonTrivialLines: 3,
}

// The reward economy (docs/adr/0002-reward-economy.md): understanding the
// code pays the most. XP from Claude's own activity is ambient and fills a
// small pool per Quest; Battles have their own pool, and so do the Sage's
// answers. The Boss Fight's answers and the Quest reward are uncapped, once
// per Quest by construction.

/** The XP a read or search pays: a trickle, into the ambient pool. */
export const READ_XP = 1

/**
 * The bonus for a first visit to a Module: Wisdom XP, for learning how the
 * system is laid out. Ambient, as the read is.
 */
export const DISCOVERY_XP = 5

/**
 * The Strength XP a Battle won pays, per HP of its monster at the first
 * counted run, up to BATTLE_HP_PAID of them: a big red suite is no bigger win.
 */
export const BATTLE_XP_PER_HP = 10

/** The most monster HP a Battle won pays for. */
export const BATTLE_HP_PAID = 3

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

/**
 * The fewest lines a Crafting changes: a new file adds at least this many,
 * and a near-complete rewrite changes at least this many, so an empty stub
 * or a one-line file rewritten forges nothing.
 */
export const MIN_CRAFT_LINES = 3

/** The XP a Crafting pays: something made, by Claude, so ambient. */
export const CRAFTING_XP = 5

/**
 * The XP a right Sage answer pays, to the Question's Stat: four Craftings'
 * worth, since reading and understanding the code is what the game is for.
 * Accuracy pays, not volume: a wrong answer earns nothing and costs HP.
 */
export const QUESTION_XP = 20

/**
 * The XP a hasty right answer pays: a quarter of QUESTION_XP. A right answer
 * is hasty when it came quicker than the Player could have read a non-trivial
 * Question (Rules.hastyAnswerMs, Rules.nonTrivialLines), so guessing fast pays
 * little; it still pays something, as a quick reader may well be right.
 */
export const HASTY_ANSWER_XP = QUESTION_XP / 4

/** The Intelligence XP a right Boss Fight answer pays: uncapped, the review is the point. */
export const BOSS_ANSWER_XP = 30

/**
 * The HP a wrong answer costs: a tenth of MAX_HP, so guessing hurts without
 * ten wrong answers being far off. At 0 HP the Player is Exhausted.
 */
export const WRONG_ANSWER_HP = 10

/** The Player's most HP, fixed. */
export const MAX_HP = 100

/** The HP a new Quest heals: starting work rests the Player a little. */
export const QUEST_HEAL = 25

/** The share of the Quest reward an unfought Quest pays (no Boss Fight could be made). */
export const UNFOUGHT_SHARE = 1 / 4

/** How many Questions a full Boss Fight asks: fewer scale its reward down. */
export const BOSS_QUESTIONS = 3

/**
 * The Dexterity XP a right Prophecy pays, from the prophecy pool: half a Sage
 * answer, as it is a call made before the fact, not a reading of the code.
 * A wrong one pays nothing and costs nothing (docs/adr/0004-prophecy.md).
 */
export const PROPHECY_XP = 10

/** What each XP pool holds per Quest. */
export const POOL_CAPS: Record<XpPool, number> = { ambient: 60, battle: 60, sage: 200, prophecy: 30 }

/** What each XP pool holds per session, outside any Quest. */
export const SESSION_POOL_CAPS: Record<XpPool, number> = { ambient: 20, battle: 30, sage: 100, prophecy: 15 }

const emptyPools = (): PoolCounters => ({ ambient: 0, battle: 0, sage: 0, prophecy: 0 })

/**
 * How many edits made during a Battle the Sage asks about once it is won:
 * the latest, the fix; the earlier ones are often false starts.
 */
export const MAX_FIX_EDITS = 5

/**
 * How many of a Quest's changes it keeps for its Boss Fight, the latest:
 * enough to review when git cannot give the commit's diff, few enough to
 * keep the session's state small.
 */
export const MAX_QUEST_CHANGES = 20

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
 * The Quest reward, by the ticket's difficulty alone, paid when its Boss
 * Fight is won. Unrated sits in the middle, so a Region without size labels
 * or story points is not penalised.
 */
const QUEST_XP: Record<Difficulty, number> = {
  Trivial: 40,
  Easy: 60,
  Medium: 100,
  Hard: 140,
  Epic: 180,
  Unrated: 80,
}

export const questXp = (difficulty: Difficulty): number => QUEST_XP[difficulty]

/** XP needed to clear a level: 100 at level 1, 150 at 2, 300 at 3, 550 at 4. */
export const xpToClear = (level: number): number => 100 + 50 * (level - 1) ** 2

/** The level lifetime XP reaches, and the XP into it. */
export const levelOf = (totalXp: number): { level: number; xp: number } => {
  let level = 1
  let xp = Math.max(0, totalXp)
  while (xp >= xpToClear(level)) {
    xp -= xpToClear(level)
    level += 1
  }

  return { level, xp }
}

/** A new Player's tally: nothing done yet. */
export const emptyTally = (): Tally => ({
  questsClosed: 0,
  bossesWon: 0,
  bossStreak: 0,
  sageRight: 0,
  modulesDiscovered: 0,
  regions: [],
  prophecyStreak: 0,
})

export const newPlayer = (): Player => ({
  level: 1,
  xp: 0,
  totalXp: 0,
  hp: MAX_HP,
  maxHp: MAX_HP,
  stats: {
    intelligence: 0,
    wisdom: 0,
    dexterity: 0,
    strength: 0,
    charisma: 0,
    constitution: 0,
  },
  tally: emptyTally(),
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
  sageCallsOutsideQuest: 0,
  bossFight: null,
  pools: emptyPools(),
  answeredKeys: [],
  region: null,
})

export const step = (
  state: GameState,
  event: GameEvent,
  rules: Rules = DEFAULT_RULES,
): { state: GameState; effects: Effect[] } => {
  switch (event.type) {
    case 'FILE_READ':
      return explore(state, event.path, event.module)
    case 'SESSION_MEASURED':
      return measure(state, event)
    case 'QUEST_START':
      return startQuest(state, event.ticket, event.difficulty ?? 'Unrated')
    case 'QUEST_DETAILS':
      return { state: withDetails(state, event), effects: briefingWanted(state, event, rules) }
    case 'TEST_FAIL':
      return settleProphecy(checkFailed(state, event), event.failures === null || event.failures <= 1 ? 'red' : 'rout')
    case 'TEST_PASS':
      return settleProphecy(checkPassed(state, event.check), 'green')
    case 'FILE_EDIT':
      return craft(withFix(withQuestChange(state, event), event), event)
    case 'QUESTION_READY':
      return queueQuestion(state, event.question, event.at, event.key, event.npc ?? 'sage')
    case 'QUESTION_SHOWN':
      return showQuestion(state, event.id, event.at)
    case 'QUESTION_ANSWERED':
      return answerQuestion(state, event, rules)
    case 'ANSWER_DISMISSED':
      return { state: { ...state, lastAnswer: null }, effects: [] }
    case 'HAIKU_CALL_REQUESTED':
      return requestHaikuCall(state, event.purpose, rules, event.key)
    case 'HAIKU_CALL_REFUNDED':
      return { state: countCall(state, event.ticket, event.purpose, -1), effects: [] }
    case 'HAIKU_UNAVAILABLE':
      return state.haikuUnavailable === true
        ? { state, effects: [] }
        : { state: { ...state, haikuUnavailable: true }, effects: [{ type: 'HAIKU_UNAVAILABLE' }] }
    case 'COMMIT':
      return summonBoss(state, event.sha, event.cwd, event.fromError === true)
    case 'BOSS_FIGHT_READY':
      return startBossFight(state, event)
    case 'BOSS_FIGHT_UNAVAILABLE':
      return isSummoned(state, event.ticket) ? closeQuest(state, 'unfought') : { state, effects: [] }
    case 'BOSS_ANSWERED':
      return answerBoss(state, event)
    case 'BOSS_FIGHT_SKIPPED':
      return isUnderWay(state.bossFight) ? closeQuest(state, 'skipped') : { state, effects: [] }
    case 'TEST_FILE_EDITED':
      return armProphecy(state, event.path, event.at)
    case 'PROPHECY_MADE':
      return makeProphecy(state, event.call)
    case 'CHECK_STARTED':
      return { state: state.prophecy != null && state.prophecy.call === undefined ? { ...state, prophecy: null } : state, effects: [] }
  }
}

/** A purpose's Haiku calls so far, and its limit. */
type Budget = { used: number; limit: number }

/** The Haiku calls a ticket's Quests made this session, by purpose. */
type TicketCalls = { sage: number; boss: number }

/** What ticket `ticket` spent this session: nothing until its first call. */
const callsOf = (state: GameState, ticket: string): TicketCalls => ({
  sage: 0,
  boss: 0,
  ...state.haikuCallsByTicket?.[ticket],
})

/** The budget of `purpose` now: the active Quest's ticket's, or the session's between Quests. */
const budgetOf = (state: GameState, purpose: HaikuPurpose, rules: Rules): Budget => {
  const { quest } = state
  if (quest === null) {
    // Between Quests the Sage has its allowance for the session; the Boss
    // Fight, which ends a Quest, has none.
    return purpose === 'sage'
      ? { used: state.sageCallsOutsideQuest ?? 0, limit: rules.sageCallsOutsideQuest }
      : { used: 0, limit: 0 }
  }

  return {
    used: callsOf(state, quest.ticket)[purpose],
    limit: purpose === 'sage' ? rules.sageCallsPerQuest : rules.bossFightCallsPerQuest,
  }
}

/** The game with `ticket`'s (null: the session's between Quests) count of `purpose` moved by `by`. */
const countCall = (state: GameState, ticket: string | null, purpose: HaikuPurpose, by: number): GameState => {
  if (ticket === null) {
    return purpose === 'sage'
      ? { ...state, sageCallsOutsideQuest: Math.max(0, (state.sageCallsOutsideQuest ?? 0) + by) }
      : state
  }

  const calls = callsOf(state, ticket)

  return {
    ...state,
    haikuCallsByTicket: {
      ...state.haikuCallsByTicket,
      [ticket]: { ...calls, [purpose]: Math.max(0, calls[purpose] + by) },
    },
  }
}

// Haiku is bounded per ticket for the session: the Sage's calls and the Boss
// Fight's are counted on the active Quest's ticket, each against its own
// limit, and the count stays when the Quest closes or another replaces it,
// so starting a ticket again never refills its budget. A new session starts
// every ticket afresh. Between Quests the Sage has a small allowance for the
// session; the Boss Fight, which ends a Quest, has none. Once Haiku is known
// to be unavailable on this account, every call is refused for the session.
// A refused call is no failure: what would have used it is skipped.
const requestHaikuCall = (
  state: GameState,
  purpose: HaikuPurpose,
  rules: Rules,
  key: string | undefined,
): { state: GameState; effects: Effect[] } => {
  const { used, limit } = budgetOf(state, purpose, rules)

  if (state.haikuUnavailable === true) {
    return { state, effects: [{ type: 'HAIKU_CALL_REFUSED', purpose, used, limit, reason: 'unavailable' }] }
  }
  if (key !== undefined && isAsked(state, key)) {
    return { state, effects: [{ type: 'HAIKU_CALL_REFUSED', purpose, used, limit, reason: 'asked' }] }
  }
  if (used >= limit) {
    return { state, effects: [{ type: 'HAIKU_CALL_REFUSED', purpose, used, limit }] }
  }

  return {
    state: countCall(state, state.quest?.ticket ?? null, purpose, 1),
    effects: [{ type: 'HAIKU_CALL_GRANTED', purpose, used: used + 1, limit }],
  }
}

// A new file of MIN_CRAFT_LINES lines or more, or a major edit, is forged:
// the blacksmith makes an item named after the component. A major edit
// changes MAJOR_EDIT_LINES lines or more, or rewrites a file near completely
// (REWRITE_SHARE of its lines replaced, MIN_CRAFT_LINES lines at least). An
// Edit of every occurrence (`replace_all`, a rename) is never major. Anything
// else plays nothing; its change is still kept on the Quest and the Battles.
const craft = (
  state: GameState,
  event: Extract<GameEvent, { type: 'FILE_EDIT' }>,
): { state: GameState; effects: Effect[] } => {
  if (!isForged(event)) {
    return { state, effects: [] }
  }

  const { path, module, isNewFile, linesAdded, linesRemoved, diff } = event
  const paid = pay(state, 'ambient', null, CRAFTING_XP)
  const encounter: CraftingEncounter = {
    kind: 'Crafting',
    target: path,
    module,
    item: itemNameOf(path),
    isNewFile,
    linesAdded,
    linesRemoved,
    xp: paid.paid,
  }

  return {
    state: { ...paid.state, encounter, quest: attach(paid.state.quest, encounter) },
    effects: [
      { type: 'ENCOUNTER_STARTED', encounter },
      { type: 'CODE_CHANGED', changes: [{ path, diff }] },
      ...paid.effects,
    ],
  }
}

/** Whether a file change forges an item: a new file of some size, or a major edit. */
const isForged = (event: Extract<GameEvent, { type: 'FILE_EDIT' }>): boolean => {
  if (event.isNewFile) {
    return event.linesAdded >= MIN_CRAFT_LINES
  }
  if (event.replaceAll === true) {
    return false
  }

  const { linesBefore } = event
  const changed = Math.max(event.linesAdded, event.linesRemoved)
  // Emptying a file makes nothing, so a rewrite must add lines too.
  const isRewrite =
    linesBefore !== null &&
    linesBefore > 0 &&
    event.linesAdded > 0 &&
    changed >= MIN_CRAFT_LINES &&
    event.linesRemoved >= REWRITE_SHARE * linesBefore

  return changed >= MAJOR_EDIT_LINES || isRewrite
}

// A read pays READ_XP, a first visit to a Module DISCOVERY_XP of Wisdom
// beside it, both ambient: a full pool pays nothing, but a discovery still
// counts toward the Cartographer.
const explore = (
  state: GameState,
  path: string,
  module: string | null,
): { state: GameState; effects: Effect[] } => {
  // Outside the project there is no Module to discover.
  const isFirstVisit = module !== null && !state.visitedModules.includes(module)
  const readPaid = pay(state, 'ambient', null, READ_XP)
  let played = readPaid.state
  const effects: Effect[] = [...readPaid.effects]
  let xp = readPaid.paid
  let discoveryXp = 0

  if (isFirstVisit) {
    const found = pay(played, 'ambient', 'wisdom', DISCOVERY_XP)
    const { player } = found.state
    const tallied: GameState = {
      ...found.state,
      player: { ...player, tally: { ...player.tally, modulesDiscovered: player.tally.modulesDiscovered + 1 } },
      visitedModules: [...state.visitedModules, module],
    }
    const awarded = award(tallied, {})
    played = awarded.state
    xp += found.paid
    discoveryXp = found.paid
    effects.push({ type: 'MODULE_DISCOVERED', module }, ...found.effects, ...awarded.effects)
  }

  const encounter: Encounter = {
    kind: 'Exploration',
    target: path,
    module,
    isFirstVisit,
    xp,
    ...(isFirstVisit ? { discoveryXp } : {}),
  }

  return {
    state: { ...played, encounter, quest: attach(played.quest, encounter) },
    effects: [{ type: 'ENCOUNTER_STARTED', encounter }, ...effects],
  }
}

/** An Encounter belongs to the active Quest; between Quests, to none. */
const attach = (quest: Quest | null, encounter: Encounter): Quest | null =>
  quest === null
    ? null
    : { ...quest, encounters: [...quest.encounters, encounter] }

/** The Stat a right answer to `question` pays: Wisdom for a `wisdom` tag, else Intelligence. */
export const statOf = (question: QuestionContent): StatName =>
  question.stat === 'wisdom' ? 'wisdom' : 'intelligence'

/** Whether the Player is Exhausted: at 0 HP, wrong answers cost nothing and right ones pay half. */
export const isExhausted = (player: Player): boolean => player.hp <= 0

/** What a right answer worth `amount` pays the Player: half, rounded down, when Exhausted. */
const exhaustedPay = (player: Player, amount: number): number =>
  isExhausted(player) ? Math.floor(amount / 2) : amount

/** The Player healed by up to `amount` HP (all the way with Infinity), and what it healed. */
const heal = (player: Player, amount: number): { player: Player; effects: Effect[] } => {
  const healed = Math.min(amount, player.maxHp - player.hp)

  return healed > 0
    ? { player: { ...player, hp: player.hp + healed }, effects: [{ type: 'HP_HEALED', amount: healed }] }
    : { player, effects: [] }
}

/**
 * Pays the Player `amount` XP from `pool` (null: uncapped), to `stat` when
 * one earned it: the pool, the active Quest's or the session's between
 * Quests, pays what it has left and tells XP_CAPPED as it fills. Lifetime
 * XP grows and the level follows it; a level-up heals fully. Halving an
 * Exhausted Player's answers is the caller's (exhaustedPay).
 */
const pay = (
  state: GameState,
  pool: XpPool | null,
  stat: StatName | null,
  amount: number,
): { state: GameState; effects: Effect[]; paid: number } => {
  let paid = Math.max(0, Math.floor(amount))
  let next = state
  const capped: Effect[] = []

  if (pool !== null) {
    const { quest } = state
    // Counters kept by an older mod lack the pools added since.
    const counters = { ...emptyPools(), ...(quest !== null ? quest.pools : state.pools) }
    const cap = (quest !== null ? POOL_CAPS : SESSION_POOL_CAPS)[pool]
    const before = counters[pool]
    paid = Math.min(paid, Math.max(0, cap - before))
    const pools = { ...counters, [pool]: before + paid }
    next = quest !== null ? { ...state, quest: { ...quest, pools } } : { ...state, pools }
    if (before < cap && before + paid >= cap) {
      capped.push({ type: 'XP_CAPPED', pool })
    }
  }

  if (paid === 0) {
    return { state: next, effects: capped, paid }
  }

  const { player } = next
  const totalXp = player.totalXp + paid
  const { level, xp } = levelOf(totalXp)
  const effects: Effect[] = [stat === null ? { type: 'XP_GAINED', amount: paid } : { type: 'XP_GAINED', amount: paid, stat }]
  for (let reached = player.level + 1; reached <= level; reached += 1) {
    effects.push({ type: 'LEVEL_UP', level: reached })
  }
  const earned: Player = {
    ...player,
    totalXp,
    level,
    xp,
    stats: stat === null ? player.stats : { ...player.stats, [stat]: player.stats[stat] + paid },
  }
  const healed = level > player.level ? heal(earned, Infinity) : { player: earned, effects: [] }

  return {
    state: { ...next, player: healed.player },
    effects: [...effects, ...healed.effects, ...capped],
    paid,
  }
}

/** The Badges there are, by id, with their names. */
export const BADGES: Record<BadgeId, string> = {
  'first-blood': 'First Blood',
  'first-quest': 'Questbound',
  'boss-slayer': 'Boss Slayer',
  flawless: 'Flawless',
  'dragon-slayer': 'Dragon Slayer',
  cartographer: 'Cartographer',
  apprentice: "Sage's Apprentice",
  unbroken: 'Unbroken',
  wayfarer: 'Wayfarer',
  'second-wind': 'Second Wind',
  oracle: 'Oracle',
}

/** What just happened, for the Badges a single moment earns. */
export type BadgeContext = {
  /** A Battle won, with edits made while it stood: its monster at its largest. */
  battleWon?: { maxHp: number }
  /** A Boss Fight won: Flawless, and whether the Player was Exhausted. */
  bossWon?: { flawless: boolean; exhausted: boolean }
}

/** The monster HP, at least, a Battle won must have had for the Dragon Slayer. */
export const DRAGON_HP = 20

/** How many of a lifetime count earn its Badge. */
export const BADGE_COUNTS = { modules: 25, sageRight: 25, bossStreak: 5, regions: 3, prophecyStreak: 5 } as const

/**
 * The Badges the Player earns now and does not hold yet, by their lifetime
 * tally and what just happened.
 */
export const earnedBadges = (player: Player, context: BadgeContext = {}): BadgeId[] => {
  const { tally } = player
  const held = new Set((player.badges ?? []).map(badge => badge.id))
  const earned: Record<BadgeId, boolean> = {
    'first-blood': context.battleWon !== undefined,
    'first-quest': tally.questsClosed >= 1,
    'boss-slayer': tally.bossesWon >= 1,
    flawless: context.bossWon?.flawless === true,
    'dragon-slayer': (context.battleWon?.maxHp ?? 0) >= DRAGON_HP,
    cartographer: tally.modulesDiscovered >= BADGE_COUNTS.modules,
    apprentice: tally.sageRight >= BADGE_COUNTS.sageRight,
    unbroken: tally.bossStreak >= BADGE_COUNTS.bossStreak,
    wayfarer: tally.regions.length >= BADGE_COUNTS.regions,
    'second-wind': context.bossWon?.exhausted === true,
    oracle: (tally.prophecyStreak ?? 0) >= BADGE_COUNTS.prophecyStreak,
  }

  return (Object.keys(BADGES) as BadgeId[]).filter(id => earned[id] && !held.has(id))
}

/** The Player given the Badges they earn now, each told as BADGE_EARNED. */
const award = (
  state: GameState,
  context: BadgeContext,
  at?: number,
): { state: GameState; effects: Effect[] } => {
  const badges = earnedBadges(state.player, context).map(
    (id): Badge => (at === undefined ? { id, name: BADGES[id] } : { id, name: BADGES[id], earnedAt: at }),
  )
  if (badges.length === 0) {
    return { state, effects: [] }
  }

  return {
    state: { ...state, player: { ...state.player, badges: [...(state.player.badges ?? []), ...badges] } },
    effects: badges.map(badge => ({ type: 'BADGE_EARNED', badge }) as const),
  }
}

/**
 * The Stats in play: earned by play and shown at full strength. The others
 * stay at 0, drawn dimmed as not yet in play (the Overview's sheet).
 */
export const STATS_IN_PLAY: readonly StatName[] = ['intelligence', 'wisdom', 'dexterity', 'strength']

/** Whether `stat` is in play. */
export const isInPlay = (stat: StatName): boolean => STATS_IN_PLAY.includes(stat)

/** The Stats in play and the title each names, in the order a tie goes. */
const TITLES: [StatName, string][] = [
  ['intelligence', 'Scholar'],
  ['wisdom', 'Pathfinder'],
  ['dexterity', 'Duelist'],
  ['strength', 'Warrior'],
]

/** The level a Player first has a title at. */
export const TITLE_LEVEL = 3

/** The level a Player's title gains `Veteran` at. */
export const VETERAN_LEVEL = 10

/**
 * The Player's title: from level 3, named by their highest Stat in play
 * (Scholar, Pathfinder, Duelist, Warrior), Veteran from level 10; null
 * before, or with no Stat earned yet.
 */
export const titleOf = (player: Player): string | null => {
  if (player.level < TITLE_LEVEL) {
    return null
  }

  const [stat, title] = TITLES.reduce((best, each) =>
    player.stats[each[0]] > player.stats[best[0]] ? each : best,
  )
  if (player.stats[stat] <= 0) {
    return null
  }

  return player.level >= VETERAN_LEVEL ? `Veteran ${title}` : title
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
// Quest already running, started again, carries on with its Encounters. A new
// Quest heals QUEST_HEAL HP; the Quest just closed, started again, does not.
// The Battles under way are cleared, silently: they belong to the work before
// it, and a win now would pay the new Quest for it. So is a Prophecy armed.
const startQuest = (
  state: GameState,
  ticket: string,
  difficulty: Difficulty,
): { state: GameState; effects: Effect[] } => {
  if (state.quest?.ticket === ticket) {
    return { state, effects: [] }
  }

  const abandoned: Effect[] =
    state.quest === null ? [] : [{ type: 'QUEST_ABANDONED', ticket: state.quest.ticket }]
  const quest: Quest = { ticket, encounters: [], difficulty, pools: emptyPools(), sageWrong: 0 }
  const rested = state.bossFight?.ticket === ticket ? { player: state.player, effects: [] } : heal(state.player, QUEST_HEAL)

  // The Boss Fight belongs to the Quest it ends: a new Quest has none yet.
  return {
    state: { ...state, player: rested.player, quest, bossFight: null, battles: [], prophecy: null },
    effects: [...abandoned, { type: 'QUEST_STARTED', ticket }, ...rested.effects],
  }
}

/** The most of a ticket's summary a Quest keeps, in characters: what Haiku is shown of it. */
export const MAX_SUMMARY_CHARS = 1500

/** Where a Question about the ticket itself points (the Briefing's): no file, no lines. */
export const TICKET_SOURCE = '<ticket>'

/** Whether `question` is about the ticket itself (the Briefing's), pointing at no file. */
export const isAboutTicket = (question: Pick<QuestionContent, 'source'>): boolean =>
  question.source.path === TICKET_SOURCE

/** Who asks `question`: its Npc, the Sage for one queued before other NPCs asked. */
export const npcOf = (question: Pick<Question, 'npc'>): Npc =>
  question.npc === 'quest-giver' || question.npc === 'cartographer' ? question.npc : 'sage'

// The Quest Giver briefs a Quest once its ticket is found with a summary:
// details for the active Quest's ticket, not verified missing, with a summary
// to read. The Briefing is a Sage Question, so with no Sage budget per ticket
// (`sageCallsPerQuest` 0) there is none, not even from the cache. Whether it
// costs a call, or was asked already, is for HAIKU_CALL_REQUESTED and the
// Question Queue to say.
const briefingWanted = (
  state: GameState,
  { ticket, title, summary, verified }: Extract<GameEvent, { type: 'QUEST_DETAILS' }>,
  rules: Rules,
): Effect[] => {
  const { quest } = state
  if (
    quest === null ||
    quest.ticket !== ticket ||
    summary === undefined ||
    summary.trim() === '' ||
    (verified ?? quest.verified) === 'not-found' ||
    rules.sageCallsPerQuest <= 0
  ) {
    return []
  }
  const known = title ?? quest.title

  return [
    {
      type: 'BRIEFING_WANTED',
      ticket,
      summary: summary.slice(0, MAX_SUMMARY_CHARS),
      ...(known === undefined ? {} : { title: known }),
    },
  ]
}

// What is known of a ticket arrives after its Quest started (looked up
// unawaited): it is kept on the Quest if that ticket's Quest is still the
// active one, and dropped otherwise. The difficulty is fixed at the start (the
// Quest Board's): a lookup only rates a Quest started Unrated, as one the board
// never listed is.
const withDetails = (state: GameState, details: Extract<GameEvent, { type: 'QUEST_DETAILS' }>): GameState => {
  const { quest } = state
  if (quest === null || quest.ticket !== details.ticket) {
    return state
  }

  const { title, summary, difficulty, verified } = details

  return {
    ...state,
    quest: {
      ...quest,
      ...(title === undefined ? {} : { title }),
      ...(summary === undefined ? {} : { summary: summary.slice(0, MAX_SUMMARY_CHARS) }),
      ...(difficulty === undefined || (quest.difficulty ?? 'Unrated') !== 'Unrated' ? {} : { difficulty }),
      ...(verified === undefined ? {} : { verified }),
    },
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
// placeholder, or leaves the one standing as it was; the first counted run
// after a placeholder spawns the monster at its count. Another Check has its
// own Battle.
const checkFailed = (
  state: GameState,
  event: Extract<GameEvent, { type: 'TEST_FAIL' }>,
): { state: GameState; effects: Effect[] } => {
  const { check, failures } = event
  const open = state.battles.find(battle => battle.check === check)

  if (open === undefined) {
    const hp = failures ?? 1
    const battle: Battle = {
      check,
      foe: event.kind,
      hp,
      maxHp: hp,
      isCounted: failures !== null,
      ...(failures !== null ? { firstHp: hp } : {}),
    }
    const encounter = encounterOf(battle, 0, 'spawned')

    return {
      state: playBattle(state, encounter, [...state.battles, battle]),
      effects: [{ type: 'ENCOUNTER_STARTED', encounter }],
    }
  }

  // The placeholder stood for failures unread: the first count is the real
  // monster, spawned at its HP, the fix made so far still its fix.
  if (!open.isCounted && failures !== null) {
    const battle: Battle = { ...open, hp: failures, maxHp: failures, isCounted: true, firstHp: failures }
    const encounter = encounterOf(battle, 0, 'spawned')

    return {
      state: playBattle(
        state,
        encounter,
        state.battles.map(each => (each === open ? battle : each)),
      ),
      effects: [{ type: 'ENCOUNTER_STARTED', encounter }],
    }
  }

  const hp = failures ?? open.hp
  const hits = Math.max(0, open.hp - hp)
  const battle: Battle = {
    ...open,
    hp,
    maxHp: Math.max(open.maxHp, hp),
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

// All green wins: the monster takes its last hits and falls. A Battle won
// with edits made while it stood pays Strength XP into the battle pool, by
// the monster's HP at its first counted run, BATTLE_HP_PAID of them at most;
// one won with no edit changed no code (a flaky check) and pays nothing. A
// check passing with no Battle against it plays nothing.
const checkPassed = (
  state: GameState,
  check: string,
): { state: GameState; effects: Effect[] } => {
  const open = state.battles.find(battle => battle.check === check)
  if (open === undefined) {
    return { state, effects: [] }
  }

  // The Sage asks about the fix; a Battle won with no edit changed no code.
  const fix = open.edits ?? []
  const isEarned = fix.length > 0
  const paid = isEarned
    ? pay(state, 'battle', 'strength', BATTLE_XP_PER_HP * Math.min(open.firstHp ?? open.maxHp, BATTLE_HP_PAID))
    : { state, effects: [], paid: 0 }
  const awarded = isEarned ? award(paid.state, { battleWon: { maxHp: open.maxHp } }) : { state: paid.state, effects: [] }
  const encounter: BattleEncounter = { ...encounterOf({ ...open, hp: 0 }, open.hp, 'won'), xp: paid.paid }

  return {
    state: playBattle(
      awarded.state,
      encounter,
      state.battles.filter(battle => battle !== open),
    ),
    effects: [
      { type: 'ENCOUNTER_UPDATED', encounter },
      { type: 'MONSTER_HIT', check, hits: open.hp, hp: 0 },
      { type: 'BATTLE_WON', check, foe: open.foe },
      ...(isEarned ? [{ type: 'CODE_CHANGED', changes: fix } as const] : []),
      ...paid.effects,
      ...awarded.effects,
    ],
  }
}

/** The three calls of a Prophecy, in the order of their Buttons and hotkeys. */
export const PROPHECY_CALLS: readonly ProphecyCall[] = ['red', 'green', 'rout']

/** A call as the Player reads it: `Red`, `Green`, `Rout`. */
export const callName = (call: ProphecyCall): string => call.charAt(0).toUpperCase() + call.slice(1)

// A Prophecy: when Claude writes or edits a test file, the Player may call
// how the next Check will end before it runs. Once a Check starts
// (CHECK_STARTED), one not yet called goes: none is made with the Check's
// output in sight. Re-arming replaces a Prophecy
// not yet called (its file and time); one called stays until its Check.
const armProphecy = (
  state: GameState,
  file: string,
  armedAt: number,
): { state: GameState; effects: Effect[] } => {
  if (state.prophecy?.call !== undefined) {
    return { state, effects: [] }
  }

  return {
    state: { ...state, prophecy: { file, armedAt } },
    effects: [{ type: 'PROPHECY_ARMED', file }],
  }
}

// The Player's call: taken only while a Prophecy is armed and not yet called.
const makeProphecy = (state: GameState, call: ProphecyCall): { state: GameState; effects: Effect[] } => {
  const { prophecy } = state
  if (prophecy == null || prophecy.call !== undefined) {
    return { state, effects: [] }
  }

  return { state: { ...state, prophecy: { ...prophecy, call } }, effects: [] }
}

// The next Check run, of any kind, settles the Prophecy armed: `outcome` is
// how it ended (green passing; red one failure, or failures it counts none
// of; rout two or more). Not the Check the test file belongs to: the mod
// cannot tell which that is (docs/adr/0004-prophecy.md). A right call pays
// PROPHECY_XP of Dexterity from the prophecy pool and adds to the streak
// the Oracle counts, paid or not; a wrong one pays nothing, costs nothing
// and resets the streak. One never called goes, leaving the streak.
const settleProphecy = (
  played: { state: GameState; effects: Effect[] },
  outcome: ProphecyCall,
): { state: GameState; effects: Effect[] } => {
  const { prophecy } = played.state
  if (prophecy == null) {
    return played
  }

  const cleared: GameState = { ...played.state, prophecy: null }
  const { call } = prophecy
  if (call === undefined) {
    return { state: cleared, effects: played.effects }
  }

  const isRight = call === outcome
  const paid = isRight ? pay(cleared, 'prophecy', 'dexterity', PROPHECY_XP) : { state: cleared, effects: [], paid: 0 }
  const { player } = paid.state
  const streak = isRight ? (player.tally.prophecyStreak ?? 0) + 1 : 0
  const awarded = award({ ...paid.state, player: { ...player, tally: { ...player.tally, prophecyStreak: streak } } }, {})

  return {
    state: awarded.state,
    effects: [
      ...played.effects,
      { type: 'PROPHECY_SETTLED', call, outcome, isRight, xp: paid.paid },
      ...paid.effects,
      ...awarded.effects,
    ],
  }
}

/**
 * Whether the change cached under `key` was asked about already this
 * session: its Question answered, or waiting. It is not asked again.
 */
export const isAsked = (state: GameState, key: string): boolean =>
  (state.answeredKeys ?? []).includes(key) || state.questions.some(waiting => waiting.key === key)

// The Question Queue: Questions wait, oldest first, until the Player answers
// them; nothing in it ever holds up the session. A Question about a change
// whose Question was already answered this session (a cache hit, the same
// diff again) is not queued: an answer known pays once. Nor is one about a
// change whose Question is waiting already: it is asked once. Another NPC's
// Question (the Quest Giver's Briefing) waits in the same queue, answered
// and paid as the Sage's are; the Sage keeps her older spelling, `Sage`.
const queueQuestion = (
  state: GameState,
  content: QuestionContent,
  at: number,
  key: string | undefined,
  npc: Npc,
): { state: GameState; effects: Effect[] } => {
  if (key !== undefined && isAsked(state, key)) {
    return { state, effects: [] }
  }

  const questionsAsked = state.questionsAsked + 1
  const question: Question = {
    ...content,
    ...(key !== undefined ? { key } : {}),
    id: `sage-${questionsAsked}`,
    npc: npc === 'sage' ? 'Sage' : npc,
    queuedAt: at,
    shownAt: null,
  }
  const questions = [...state.questions, question]

  return {
    state: { ...state, questions, questionsAsked },
    effects: [
      { type: 'QUESTION_QUEUED', id: question.id, waiting: questions.length, ...(npc === 'sage' ? {} : { npc }) },
    ],
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

/**
 * Whether a right answer came too fast for the Question: the Question
 * non-trivial (it points at `nonTrivialLines` source lines or more), and
 * answered in under `hastyAnswerMs` from when it was shown. With no answer
 * time (never recorded as shown: `/sage A` on a Question never told is shown
 * instead, and the Sage's pane records what it draws) it could not have been
 * read, so it is hasty. A Question about the ticket itself (the Briefing's)
 * points at no lines but asks for the ticket read: it is non-trivial.
 */
const isHasty = (question: Question, answerMs: number | null, rules: Rules): boolean =>
  (isAboutTicket(question) || question.source.lines.length >= rules.nonTrivialLines) &&
  (answerMs === null || answerMs < rules.hastyAnswerMs)

// A right answer pays QUESTION_XP to the Question's Stat (Wisdom for a
// `wisdom` tag, else Intelligence) from the sage pool, HASTY_ANSWER_XP when it
// came too fast, half either way when Exhausted; a wrong one costs
// WRONG_ANSWER_HP, never below zero, and spoils a Flawless win. Either way
// the Question leaves the queue, its change counts as answered, and its
// explanation shows.
const answerQuestion = (
  state: GameState,
  { id, choice, at }: Extract<GameEvent, { type: 'QUESTION_ANSWERED' }>,
  rules: Rules,
): { state: GameState; effects: Effect[] } => {
  const question = state.questions.find(each => each.id === id)
  if (question === undefined || !Number.isInteger(choice) || choice < 0 || choice >= question.options.length) {
    return { state, effects: [] }
  }

  const isCorrect = choice === question.answer
  const answerMs = question.shownAt === null ? null : at - question.shownAt
  const hasty = isCorrect && isHasty(question, answerMs, rules)
  const answered: GameState = {
    ...state,
    questions: state.questions.filter(each => each !== question),
    answeredKeys:
      question.key === undefined ? state.answeredKeys : [...(state.answeredKeys ?? []), question.key],
  }

  if (!isCorrect) {
    const hpLost = Math.min(WRONG_ANSWER_HP, state.player.hp)
    const answer: QuestionAnswer = { question, choice, isCorrect, answeredAt: at, answerMs, isHasty: false, xp: 0, hpLost }
    const { quest } = answered

    return {
      state: {
        ...answered,
        quest: quest === null ? null : { ...quest, sageWrong: (quest.sageWrong ?? 0) + 1 },
        lastAnswer: answer,
        player: { ...state.player, hp: state.player.hp - hpLost },
      },
      effects: [
        { type: 'QUESTION_ANSWERED', answer },
        // Exhausted, a wrong answer costs nothing: no HP is lost.
        ...(hpLost > 0 ? [{ type: 'HP_LOST', amount: hpLost } as const] : []),
      ],
    }
  }

  const paid = pay(answered, 'sage', statOf(question), exhaustedPay(state.player, hasty ? HASTY_ANSWER_XP : QUESTION_XP))
  const answer: QuestionAnswer = { question, choice, isCorrect, answeredAt: at, answerMs, isHasty: hasty, xp: paid.paid, hpLost: 0 }
  const { player } = paid.state
  const tallied: GameState = hasty
    ? paid.state
    : { ...paid.state, player: { ...player, tally: { ...player.tally, sageRight: player.tally.sageRight + 1 } } }
  const awarded = award(tallied, {}, at)
  const { quest } = awarded.state

  return {
    state: {
      ...awarded.state,
      quest: quest === null ? null : { ...quest, sageRight: (quest.sageRight ?? 0) + 1 },
      lastAnswer: answer,
    },
    effects: [{ type: 'QUESTION_ANSWERED', answer }, ...paid.effects, ...awarded.effects],
  }
}

// Every change made during a Quest is kept on it, the latest
// MAX_QUEST_CHANGES: the Boss Fight's diff when git cannot give its commit's.
const withQuestChange = (
  state: GameState,
  { path, diff }: Extract<GameEvent, { type: 'FILE_EDIT' }>,
): GameState =>
  state.quest === null
    ? state
    : {
        ...state,
        quest: {
          ...state.quest,
          changes: [...(state.quest.changes ?? []), { path, diff }].slice(-MAX_QUEST_CHANGES),
        },
      }

// The first commit in an active Quest summons its Boss Fight; later commits
// summon no other, as the Quest has one. Its Questions are made outside the
// engine, then BOSS_FIGHT_READY starts the fight. A commit between Quests
// plays nothing.
const summonBoss = (
  state: GameState,
  sha: string,
  cwd: string | null,
  fromError: boolean,
): { state: GameState; effects: Effect[] } => {
  const { quest } = state
  if (quest === null || state.bossFight?.ticket === quest.ticket) {
    return { state, effects: [] }
  }

  const bossFight: BossFight = {
    ticket: quest.ticket,
    sha,
    cwd,
    status: 'summoned',
    hp: 0,
    maxHp: 0,
    questions: [],
    lastAnswer: null,
    ...(fromError ? { fromError } : {}),
  }

  return {
    state: { ...state, bossFight },
    effects: [
      { type: 'BOSS_FIGHT_SUMMONED', ticket: quest.ticket, sha, cwd, changes: summonedChanges(state.quest, bossFight) },
    ],
  }
}

/**
 * The changes a Boss Fight reviews when git cannot show its commit: the
 * Quest's own; none for a commit read from a failed command's output, whose
 * diff is git's or nothing.
 */
export const summonedChanges = (quest: Quest | null, bossFight: BossFight): FileChange[] =>
  bossFight.fromError === true ? [] : (quest?.changes ?? [])

/** Whether a Boss Fight is being summoned or fought: not yet ended. */
export const isUnderWay = (bossFight: BossFight | null | undefined): bossFight is BossFight =>
  bossFight?.status === 'summoned' || bossFight?.status === 'fighting'

/** Whether the active Quest `ticket`'s Boss Fight is waiting for its Questions. */
const isSummoned = (state: GameState, ticket: string): boolean =>
  state.bossFight?.status === 'summoned' &&
  state.bossFight.ticket === ticket &&
  state.quest?.ticket === ticket

/**
 * The boss's HP for `questionCount` Questions: two thirds of them, rounded
 * up, so two right answers of three fell it (one of one, two of two).
 */
export const bossHpOf = (questionCount: number): number => Math.ceil((2 * questionCount) / 3)

// The Questions made, the fight starts: every one is asked, and the boss has
// bossHpOf them in HP. Questions for a Boss Fight no longer summoned
// (skipped, or its Quest replaced) start nothing; none at all leave the
// Quest unfought.
const startBossFight = (
  state: GameState,
  { ticket, questions, at }: Extract<GameEvent, { type: 'BOSS_FIGHT_READY' }>,
): { state: GameState; effects: Effect[] } => {
  if (!isSummoned(state, ticket) || state.bossFight === null || state.bossFight === undefined) {
    return { state, effects: [] }
  }
  if (questions.length === 0) {
    return closeQuest(state, 'unfought')
  }

  const asked: Question[] = questions.map((content, index) => ({
    ...content,
    id: `boss-${index + 1}`,
    npc: 'Boss',
    queuedAt: at,
    shownAt: null,
  }))
  const questionCount = asked.length
  const hp = bossHpOf(questionCount)

  return {
    state: {
      ...state,
      bossFight: { ...state.bossFight, status: 'fighting', hp, maxHp: hp, questions: asked, questionCount, rightAnswers: 0 },
    },
    effects: [{ type: 'BOSS_FIGHT_STARTED', ticket, hp, questionCount }],
  }
}

/**
 * The name of the trophy Quest `ticket`'s Boss Fight won earns in `region`:
 * `Bane of claude-quest#12`, `Bane of vault ABC-123`; `Bane of #12` when the
 * Region is not known.
 */
export const trophyNameOf = (region: string | null, ticket: string): string =>
  `Bane of ${region ?? ''}${region === null || ticket.startsWith('#') ? '' : ' '}${ticket}`

/**
 * The Quest reward a Boss Fight won pays for a Quest of `difficulty`: its
 * questXp, scaled down when fewer than BOSS_QUESTIONS Questions could be made.
 */
export const bossRewardOf = (difficulty: Difficulty, questionCount: number): number =>
  Math.round((questXp(difficulty) * Math.min(questionCount, BOSS_QUESTIONS)) / BOSS_QUESTIONS)

// Every Question is asked. A right answer pays BOSS_ANSWER_XP of
// Intelligence, uncapped (half when Exhausted), and hits the boss while it
// stands; once it has fallen, the Questions left are finishing blows, paid
// the same. A wrong one costs WRONG_ANSWER_HP, as the Sage's do (nothing when
// Exhausted: the Player fights on). No haste rule: the boss's Questions are
// not timed. The last Question answered closes the Quest: won when the boss
// fell (see closeQuest for its reward), Flawless with every Boss answer right
// and no wrong Sage answer in the Quest; lost with the boss standing, the
// answers keeping what they earned or cost.
const answerBoss = (
  state: GameState,
  { id, choice, at }: Extract<GameEvent, { type: 'BOSS_ANSWERED' }>,
): { state: GameState; effects: Effect[] } => {
  const { bossFight } = state
  const question = bossFight?.status === 'fighting' ? bossFight.questions.find(each => each.id === id) : undefined
  if (
    bossFight === null ||
    bossFight === undefined ||
    question === undefined ||
    !Number.isInteger(choice) ||
    choice < 0 ||
    choice >= question.options.length
  ) {
    return { state, effects: [] }
  }

  const isCorrect = choice === question.answer
  const hpLost = isCorrect ? 0 : Math.min(WRONG_ANSWER_HP, state.player.hp)
  const scored = isCorrect
    ? pay(state, null, 'intelligence', exhaustedPay(state.player, BOSS_ANSWER_XP))
    : { state: { ...state, player: { ...state.player, hp: state.player.hp - hpLost } }, effects: [], paid: 0 }
  const answer: QuestionAnswer = {
    question,
    choice,
    isCorrect,
    answeredAt: at,
    answerMs: question.shownAt === null ? null : at - question.shownAt,
    isHasty: false,
    xp: scored.paid,
    hpLost,
  }
  const isHit = isCorrect && bossFight.hp > 0
  const hp = isHit ? bossFight.hp - 1 : bossFight.hp
  const questionCount = bossFight.questionCount ?? bossFight.maxHp
  // A fight kept by an older mod counted no right answers: its hits did.
  const rightAnswers = (bossFight.rightAnswers ?? bossFight.maxHp - bossFight.hp) + (isCorrect ? 1 : 0)
  const questions = bossFight.questions.filter(each => each !== question)
  const answered: GameState = {
    ...scored.state,
    bossFight: { ...bossFight, hp, questions, lastAnswer: answer, rightAnswers },
  }
  const effects: Effect[] = [
    { type: 'QUESTION_ANSWERED', answer },
    ...(isHit ? [{ type: 'BOSS_HIT', hp } as const] : hpLost > 0 ? [{ type: 'HP_LOST', amount: hpLost } as const] : []),
    ...scored.effects,
  ]

  if (questions.length > 0) {
    return { state: answered, effects }
  }

  const closed =
    hp === 0
      ? closeQuest(answered, 'won', {
          at,
          flawless: rightAnswers >= questionCount && (state.quest?.sageWrong ?? 0) === 0,
          exhausted: isExhausted(state.player),
        })
      : closeQuest(answered, 'lost', { at })

  return { state: closed.state, effects: [...effects, ...closed.effects] }
}

/** What closing a Quest knows of how its Boss Fight ended. */
type Closing = { at?: number; flawless?: boolean; exhausted?: boolean }

/** Whether the Player holds the trophy of Quest `ticket` in `region` already: its reward was paid. */
const isRewarded = (player: Player, region: string | null, ticket: string): boolean =>
  (player.trophies ?? []).some(trophy => trophy.region === region && trophy.ticket === ticket)

/** Whether the unfought share of Quest `ticket` in `region` was paid already. */
const isConsoled = (player: Player, region: string | null, ticket: string): boolean =>
  (player.unfought ?? []).some(quest => quest.region === region && quest.ticket === ticket)

// The Boss Fight ended, so its Quest closes: no Quest is active after it.
// Won, it pays the Quest reward by the Quest's difficulty (and half again
// when Flawless) and its trophy, once per (Region, ticket), and heals fully;
// unfought, it pays UNFOUGHT_SHARE of the reward, once per (Region, ticket)
// and never after a win; lost or skipped, nothing. A ticket its Quest Source
// did not find (`verified` not-found) pays no reward and earns no trophy: the
// answers' XP is all it earns, and the tally, Boss streak and Badges stay
// as they were. Otherwise the tally and Badges follow. The Boss
// Fight stays, ended, until the next Quest starts; the Encounter under way is
// put away, so the Scene shows how the Quest ended until the next Encounter.
// The Battles under way are cleared, paying nothing: the Quest's work is done.
// A Prophecy armed is cleared too, silently.
const closeQuest = (
  state: GameState,
  outcome: QuestOutcome,
  { at, flawless = false, exhausted = false }: Closing = {},
): { state: GameState; effects: Effect[] } => {
  const ticket = state.bossFight?.ticket ?? state.quest?.ticket
  if (ticket === undefined) {
    return { state, effects: [] }
  }

  const region = state.region ?? null
  const difficulty = state.quest?.difficulty ?? 'Unrated'
  const fight = state.bossFight ?? null
  // Paid once per (Region, ticket), and never for a ticket its Quest Source did not find.
  const isPayable = !isRewarded(state.player, region, ticket) && state.quest?.verified !== 'not-found'
  let played = state
  const effects: Effect[] = []
  let reward = 0
  let trophy: Trophy | undefined

  if (outcome === 'won') {
    if (isPayable) {
      const earned = pay(played, null, 'intelligence', bossRewardOf(difficulty, fight?.questionCount ?? fight?.maxHp ?? BOSS_QUESTIONS))
      const bonus = flawless ? pay(earned.state, null, 'intelligence', Math.floor(earned.paid / 2)) : { state: earned.state, effects: [], paid: 0 }
      reward = earned.paid + bonus.paid
      trophy = { name: trophyNameOf(region, ticket), region, ticket, earnedAt: at ?? 0 }
      played = { ...bonus.state, player: { ...bonus.state.player, trophies: [...(bonus.state.player.trophies ?? []), trophy] } }
      effects.push(...earned.effects, ...bonus.effects)
    }
    const healed = heal(played.player, Infinity)
    played = { ...played, player: healed.player }
    effects.push(...healed.effects, ...(trophy === undefined ? [] : [{ type: 'TROPHY_EARNED', trophy } as const]))
  }

  if (outcome === 'unfought' && isPayable && !isConsoled(state.player, region, ticket)) {
    const earned = pay(played, null, 'intelligence', Math.floor(questXp(difficulty) * UNFOUGHT_SHARE))
    reward = earned.paid
    const { player } = earned.state
    played = { ...earned.state, player: { ...player, unfought: [...(player.unfought ?? []), { region, ticket }] } }
    effects.push(...earned.effects)
  }

  // A ticket its Quest Source did not find counts for nothing: the tally,
  // the Boss streak and the Badges stay as they were.
  if (state.quest?.verified === 'not-found') {
    return { state: closedState(played, fight, outcome, reward, flawless, trophy), effects: [...effects, { type: 'QUEST_CLOSED', ticket, outcome }] }
  }

  const { tally } = played.player
  const counts = outcome !== 'skipped'
  const tallied: Tally = {
    ...tally,
    questsClosed: tally.questsClosed + (counts ? 1 : 0),
    bossesWon: tally.bossesWon + (outcome === 'won' ? 1 : 0),
    bossStreak: outcome === 'won' ? tally.bossStreak + 1 : outcome === 'unfought' ? tally.bossStreak : 0,
    regions: counts && region !== null && !tally.regions.includes(region) ? [...tally.regions, region] : tally.regions,
  }
  const awarded = award(
    { ...played, player: { ...played.player, tally: tallied } },
    outcome === 'won' ? { bossWon: { flawless, exhausted } } : {},
    at,
  )

  return {
    state: closedState(awarded.state, fight, outcome, reward, flawless, trophy),
    effects: [...effects, ...awarded.effects, { type: 'QUEST_CLOSED', ticket, outcome }],
  }
}

/** The game once its Quest closed: no Quest, Encounter, Battle or Prophecy; the Boss Fight ended. */
const closedState = (
  state: GameState,
  fight: BossFight | null,
  outcome: QuestOutcome,
  reward: number,
  flawless: boolean,
  trophy: Trophy | undefined,
): GameState => ({
  ...state,
  quest: null,
  encounter: null,
  battles: [],
  prophecy: null,
  bossFight:
    fight === null
      ? null
      : {
          ...fight,
          status: outcome,
          reward,
          ...(outcome === 'won' ? { flawless } : {}),
          ...(trophy === undefined ? {} : { trophy: trophy.name }),
        },
})

/**
 * The Boss Fight as the Quest Log tells it: none yet, approaching (its
 * Questions being made), fighting (its HP and the Questions left), or how it
 * ended, once its Quest closed.
 */
export type BossProgress =
  | { status: 'none' }
  | { status: 'approaching' }
  | { status: 'fighting'; hp: number; maxHp: number; questionsLeft: number }
  | { status: QuestOutcome }

/** One XP pool as the Quest Log tells it: what the Quest paid into it, against its cap. */
export type PoolProgress = { pool: XpPool; earned: number; cap: number; isFull: boolean }

/**
 * The active Quest's progress, as the Quest Log shows it: its Encounters so
 * far (the Modules first discovered in it, in order, the items forged, the
 * Battles won and those standing), its Sage Questions answered right and
 * wrong and waiting, its Boss Fight, and the XP paid into each pool against
 * the Quest's cap.
 */
export type QuestProgress = {
  ticket: string
  encounters: number
  modulesDiscovered: string[]
  itemsForged: string[]
  battlesWon: number
  battlesStanding: Pick<Battle, 'check' | 'foe' | 'hp' | 'maxHp'>[]
  questions: { right: number; wrong: number; waiting: number }
  boss: BossProgress
  pools: PoolProgress[]
}

const POOLS: readonly XpPool[] = ['ambient', 'battle', 'sage']

/** The Boss Fight of `ticket`'s Quest, as the Quest Log tells it. */
const bossProgressOf = (fight: BossFight | null | undefined, ticket: string): BossProgress => {
  if (fight == null || fight.ticket !== ticket) {
    return { status: 'none' }
  }
  if (fight.status === 'summoned') {
    return { status: 'approaching' }
  }

  return fight.status === 'fighting'
    ? { status: 'fighting', hp: fight.hp, maxHp: fight.maxHp, questionsLeft: fight.questions.length }
    : { status: fight.status }
}

/**
 * The active Quest's progress, from the game alone; null between Quests.
 * Deterministic: the same game, the same progress.
 */
export const questProgressOf = (state: GameState): QuestProgress | null => {
  const { quest } = state
  if (quest === null) {
    return null
  }

  const pools = quest.pools ?? emptyPools()
  const discovered = quest.encounters.flatMap(encounter =>
    encounter.kind === 'Exploration' && encounter.isFirstVisit && encounter.module !== null ? [encounter.module] : [],
  )
  const forged = quest.encounters.flatMap(encounter => (encounter.kind === 'Crafting' ? [encounter.item] : []))

  return {
    ticket: quest.ticket,
    encounters: quest.encounters.length,
    modulesDiscovered: [...new Set(discovered)],
    itemsForged: [...new Set(forged)],
    battlesWon: quest.encounters.filter(encounter => encounter.kind === 'Battle' && encounter.outcome === 'won').length,
    battlesStanding: state.battles.map(({ check, foe, hp, maxHp }) => ({ check, foe, hp, maxHp })),
    questions: {
      right: quest.sageRight ?? 0,
      wrong: quest.sageWrong ?? 0,
      waiting: state.questions.filter(question => question.npc === 'Sage').length,
    },
    boss: bossProgressOf(state.bossFight, quest.ticket),
    pools: POOLS.map(pool => ({
      pool,
      earned: pools[pool],
      cap: POOL_CAPS[pool],
      isFull: pools[pool] >= POOL_CAPS[pool],
    })),
  }
}
