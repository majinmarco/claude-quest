// Claude Quest's contract: the game's data types, and the values the mod keeps
// in `$.state` for the session.

/**
 * A `$.state` key holding one value per `id` (a ticket), as Claude Code's
 * StateFamily marks it: the same shape, written here so the contract stands
 * alone. No value has this shape; a member reads as `T`.
 */
export type StateFamily<T> = { readonly byId: T }

export type Stats = {
  intelligence: number
  wisdom: number
  dexterity: number
  strength: number
  charisma: number
  constitution: number
}

export type Player = {
  level: number
  /** XP earned towards the next level. */
  xp: number
  /**
   * Every XP the Player has earned, lifetime: `level` and `xp` are derived
   * from it (see xpToClear). Filled in by migratePlayer for a Player kept by
   * an older mod.
   */
  totalXp: number
  hp: number
  maxHp: number
  stats: Stats
  /** What the Player has done, lifetime, as Badges count it. */
  tally: Tally
  /** The Badges earned, oldest first, one per id; absent on a Player kept by an older mod. */
  badges?: Badge[]
  /**
   * The Boss Fights won, one per Quest of a Region, oldest first: a Quest's
   * reward is paid once per (region, ticket). Absent until the first.
   */
  trophies?: Trophy[]
  /**
   * The Quests whose unfought share of the Quest reward was paid, so it is
   * paid once per (region, ticket) too. Absent until the first.
   */
  unfought?: QuestKey[]
}

/** A Quest as rewards know it: its ticket in its Region (null when not known). */
export type QuestKey = { region: string | null; ticket: string }

/** The Player's lifetime counts, as Badges read them. */
export type Tally = {
  /** Quests closed won, lost or unfought (not skipped). */
  questsClosed: number
  bossesWon: number
  /** Boss Fights won in a row: a loss or a skip resets it; unfought leaves it. */
  bossStreak: number
  /** Right Sage answers that were not hasty. */
  sageRight: number
  modulesDiscovered: number
  /** The Regions a Quest was closed in (won, lost or unfought). */
  regions: string[]
  /**
   * Right Prophecies in a row: a wrong one resets it, one never called or
   * never settled leaves it. Absent on a Player kept by an older mod.
   */
  prophecyStreak?: number
}

/** The ids of the Badges there are: a small, fixed set. */
export type BadgeId =
  | 'first-blood'
  | 'first-quest'
  | 'boss-slayer'
  | 'flawless'
  | 'dragon-slayer'
  | 'cartographer'
  | 'apprentice'
  | 'unbroken'
  | 'wayfarer'
  | 'second-wind'
  | 'oracle'

/** A Badge on the Player: a feat of play, earned once, across every project. */
export type Badge = {
  id: BadgeId
  /** `Boss Slayer`. */
  name: string
  /** When it was earned, in ms since the epoch; absent when not known. */
  earnedAt?: number
}

/**
 * A trophy on the Player: a Boss Fight won, named after its Quest and Region
 * (`Bane of claude-quest#12`). `region` is null for one kept from an older
 * mod's per-ticket badge, its Region unknown.
 */
export type Trophy = {
  name: string
  region: string | null
  ticket: string
  /** When it was won, in ms since the epoch. */
  earnedAt: number
}

/** The four XP pools: Claude's own activity, Battles, the Sage's answers, and Prophecies. */
export type XpPool = 'ambient' | 'battle' | 'sage' | 'prophecy'

/**
 * The XP paid into each pool so far, against its cap. Counters kept by an
 * older mod lack the pools added since (`prophecy`): read them as 0.
 */
export type PoolCounters = Record<XpPool, number>

/**
 * How the Player calls a Check will end: `red`, one failure (or failures it
 * counts none of); `green`, passing; `rout`, two failures or more.
 */
export type ProphecyCall = 'red' | 'green' | 'rout'

/**
 * A Prophecy armed by Claude editing a test file: the Player's call, once
 * made, of how the next Check will end. Settled by that Check.
 */
export type Prophecy = {
  /** The test file whose edit armed it, as the tool named it. */
  file: string
  /** The Player's call; absent until they make it. */
  call?: ProphecyCall
  /** When it was armed, in ms since the epoch. */
  armedAt: number
}

/**
 * A game moment the session's activity played. An Exploration is a read or a
 * search: `target` is what was read or searched, `module` the Module it was in
 * (see `GameState.visitedModules`), null outside the project, `isFirstVisit`
 * whether the Player had never been in that Module before.
 */
export type Encounter =
  | {
      kind: 'Exploration'
      target: string
      module: string | null
      isFirstVisit: boolean
      /** The XP it paid, pools capped; absent in one kept by an older mod. */
      xp?: number
      /**
       * Of `xp`, the Wisdom XP a first visit paid for the discovery; absent
       * on a later visit, and in one kept by an older mod.
       */
      discoveryXp?: number
    }
  | BattleEncounter
  | CraftingEncounter

/**
 * A Crafting: a new file, or a major edit of one, forged by the blacksmith
 * into an item named after it. `target` is the file, `module` its Module as
 * for an Exploration; the lines count its diff, context left out.
 */
export type CraftingEncounter = {
  kind: 'Crafting'
  target: string
  module: string | null
  /** The item forged: the component the file is, in words (`Order Ledger`). */
  item: string
  isNewFile: boolean
  linesAdded: number
  linesRemoved: number
  /** The XP it paid, pools capped; absent in one kept by an older mod. */
  xp?: number
}

/**
 * A Battle against a failing check, as one run of it played: the monster's HP
 * after the run, the hits it landed and what came of it.
 */
export type BattleEncounter = {
  kind: 'Battle'
  /** The Check the Battle is against, as rerun: `vitest run`, `npm test`, `tsc -p .`. */
  check: string
  /** The kind of monster: what the check found failing. */
  foe: CheckKind
  hp: number
  maxHp: number
  /** The hits this run landed: the tests (or errors) newly passing. */
  hits: number
  /**
   * `spawned`: the check failed with no Battle against it; `hit`: it failed
   * fewer; `stands`: as many, or uncounted; `grew`: more; `won`: it passed.
   */
  outcome: 'spawned' | 'hit' | 'stands' | 'grew' | 'won'
  /** False when the failing run counted nothing readable: a one-HP monster. */
  isCounted: boolean
  /** Once won, the Strength XP it paid; absent before, and in one kept by an older mod. */
  xp?: number
}

/** A Battle under way: a monster standing against one check. */
export type Battle = {
  check: string
  foe: CheckKind
  hp: number
  maxHp: number
  isCounted: boolean
  /**
   * The monster's HP at the first run that counted its failures: what a win
   * pays by. Absent while uncounted, and in a Battle kept by an older mod.
   */
  firstHp?: number
  /**
   * The edits made while it stood, the latest few: the fix, which the Sage
   * asks about once the Battle is won. Absent in a Battle kept by an older mod.
   */
  edits?: FileChange[]
}

/** What a check finds: failing tests, lint errors or type errors. */
export type CheckKind = 'test' | 'lint' | 'typecheck'

/** The session's vitals, as the engine last measured them; null until then. */
export type Vitals = {
  /** Mana: the share of the context window used, a whole percentage. */
  mana: number | null
  /** The main loop's model, as `/model` shows it. */
  model: string | null
  /** What the session has cost so far, in US dollars. */
  spendUsd: number | null
}

/** The Quest the session is playing: one ticket, and its Encounters so far. */
export type Quest = {
  /** The ticket's reference as its Quest Source writes it: `#4`, `ABC-123`. */
  ticket: string
  /** The Encounters played during the Quest, oldest first. */
  encounters: Encounter[]
  /**
   * The changes made during the Quest, the latest few (a FileChange per
   * file-changing tool call): the Boss Fight's diff when git cannot give the
   * commit's. Absent until the first, and in a Quest kept by an older mod.
   */
  changes?: FileChange[]
  /** How hard its ticket is, as the Quest Board listed it: the Quest reward's measure. */
  difficulty?: Difficulty
  /** The XP paid into each pool during the Quest, against its caps. */
  pools?: PoolCounters
  /** Wrong Sage answers during the Quest: any one spoils a Flawless win. */
  sageWrong?: number
  /** Right Sage answers during the Quest, as the Quest Log counts them; absent until the first. */
  sageRight?: number
  /** The ticket's title, as its Quest Source lists it; absent until known. */
  title?: string
  /**
   * The start of the ticket's description, up to 1500 characters, for Haiku
   * to read as data; absent until known.
   */
  summary?: string
  /** Whether the ticket's Quest Source found it; absent until looked up. */
  verified?: TicketVerified
  /**
   * The Modules discovered during the Quest, counted: the third, sixth and
   * ninth want a Scouting. Absent until the first.
   */
  modulesDiscovered?: number
}

/**
 * What looking a ticket up in its Quest Source found: `found`; `not-found`,
 * no such ticket; `unknown`, the source could not be reached.
 */
export type TicketVerified = 'found' | 'not-found' | 'unknown'

/**
 * How a Quest closed: its Boss Fight `won` (the boss fell: two of three
 * right), `lost` (every Question answered, the boss left standing),
 * `skipped` by the Player, or `unfought` when no Boss Fight could be made
 * (Haiku failed or over budget, no diff).
 */
export type QuestOutcome = 'won' | 'lost' | 'skipped' | 'unfought'

/**
 * The Boss Fight: the code review that ends a Quest, three Questions about
 * the diff its first commit made. It is `summoned` while its Questions are
 * being made, `fighting` once they wait, then how it ended; it stays after
 * its Quest closes, for the Scene, until the next Quest starts.
 */
export type BossFight = {
  ticket: string
  /** The commit whose diff it reviews, as git printed it. */
  sha: string
  /** The folder the commit ran in, as its command moved there; null for the session's. */
  cwd: string | null
  status: 'summoned' | 'fighting' | QuestOutcome
  /**
   * The boss's HP: two thirds of its Questions, rounded up; each right answer
   * while it stands is a hit. A fight kept by an older mod has one per Question.
   */
  hp: number
  maxHp: number
  /** The Questions not yet answered, in the order they are asked. */
  questions: Question[]
  /** The last answer, its verdict and explanation shown; null before the first. */
  lastAnswer: QuestionAnswer | null
  /** How many Questions it started with; absent in one kept by an older mod (maxHp). */
  questionCount?: number
  /** The right answers given so far; absent in one kept by an older mod (its hits). */
  rightAnswers?: number
  /**
   * The commit was read from a failed command's output (`git commit && npm
   * test`, the tests failing): its diff is git's or none, never the Quest's.
   */
  fromError?: boolean
  /** Once ended, the XP its end paid: the Quest reward (and Flawless bonus), or the unfought share. */
  reward?: number
  /** Won with every answer right and no wrong Sage answer in the Quest. */
  flawless?: boolean
  /** The trophy its win earned, by name; absent when none (lost, or the reward already paid). */
  trophy?: string
}

/** A file's change, as unified-diff hunks (`@@ -1,3 +1,3 @@` and the lines under it). */
export type FileChange = { path: string; diff: string }

/**
 * Where a Question points: the file, and the lines of its change the Question
 * is about, as the diff shows them (without the diff's `+`, `-` or ` ` mark).
 */
export type SourceRef = { path: string; lines: string[] }

/** What the Content Generator makes of a change: a Question's content. */
export type QuestionContent = {
  /** The question itself. */
  prompt: string
  /** Four options, exactly one right. */
  options: string[]
  /** The index of the right option in `options`. */
  answer: number
  /** One sentence telling why the right option is right. */
  explanation: string
  /** The Stat whose kind of understanding the Question tests. */
  stat: StatName
  source: SourceRef
}

/**
 * The NPCs who put Questions in the Question Queue, each drawn with their own
 * portrait and name in the dialogue box: the Sage (about a change), the Quest
 * Giver (the Briefing, about the ticket), the Cartographer (Scouting).
 */
export type Npc = 'sage' | 'quest-giver' | 'cartographer'

/** A comprehension Question an NPC put to the Player, in the Question Queue. */
export type Question = QuestionContent & {
  /**
   * The cache key of the change it asks about (see src/question-cache.ts):
   * once answered, a Question for the same change is not queued again.
   */
  key?: string
  /** Unique in the session: `sage-1`, `sage-2`, ... for the Sage, `boss-1` ... for the boss. */
  id: string
  /**
   * Who asks it: the Sage (the Question Queue) or the boss (the Boss Fight);
   * another NPC of the Question Queue by its Npc name (`quest-giver`,
   * `cartographer`). `Sage` is the Sage's spelling from before other NPCs
   * asked; read it through npcOf (src/engine.ts), which takes either.
   */
  npc: 'Sage' | 'Boss' | Npc
  /**
   * The Modules a right answer charts: a Scouting's, the three it asks
   * about. Absent for every other Question.
   */
  modules?: string[]
  /** When it joined the Question Queue, in ms since the epoch. */
  queuedAt: number
  /**
   * When the Player first had it in front of them in the dialogue box, in ms
   * since the epoch; null until then. An answer's time runs from it.
   */
  shownAt: number | null
}

/** The Player's answer to a Question, and what it earned or cost. */
export type QuestionAnswer = {
  question: Question
  /** The index of the option the Player chose. */
  choice: number
  isCorrect: boolean
  /** When the Player answered, in ms since the epoch. */
  answeredAt: number
  /** How long the answer took from `question.shownAt`; null when never shown first. */
  answerMs: number | null
  /**
   * A right answer quicker than the Question could be read (see the mod's
   * hasty-answer settings): it earned reduced XP. False when wrong, or when
   * its time is unknown.
   */
  isHasty: boolean
  /** The XP it paid, to its Stat; 0 when wrong, less when hasty, Exhausted or capped. */
  xp: number
  /** The HP it cost; 0 when right. */
  hpLost: number
}

export type GameState = {
  player: Player
  encounter: Encounter | null
  vitals: Vitals
  /** The active Quest; one at a time per session, null between Quests. */
  quest: Quest | null
  /**
   * The Modules the Player has explored in this Region, in order of first
   * visit. A Module is the first two segments of the folder a read or search
   * was in, relative to the project's root (`src`, `packages/api`, `.` for
   * the root itself); a folder outside the project, or in an ignored
   * root-level folder (`node_modules`, `dist`...), is no Module. Seeded at
   * session start from the Player's `$.store` key `discovered:<root>`.
   */
  visitedModules: string[]
  /**
   * The Battles under way, one per failing check, oldest first. A Battle ends
   * when its check passes.
   */
  battles: Battle[]
  /**
   * The Question Queue: the Questions waiting for the Player, oldest first.
   * They never interrupt the session; the Player answers them when they choose.
   */
  questions: Question[]
  /** How many Questions were queued this session, for the next one's id. */
  questionsAsked: number
  /** The Player's last answer, its explanation shown until they move on; null when none. */
  lastAnswer: QuestionAnswer | null
  /**
   * The Haiku calls the Sage made outside any Quest this session, against
   * its allowance between Quests.
   */
  sageCallsOutsideQuest: number
  /**
   * The Boss Fight of the active Quest, or of the Quest it just closed; null
   * before the active Quest's first commit. Absent in a game kept by an
   * older mod.
   */
  bossFight?: BossFight | null
  /** The XP paid into each pool this session outside any Quest, against the session's caps. */
  pools?: PoolCounters
  /** The cache keys of the changes whose Question was answered this session. */
  answeredKeys?: string[]
  /** The Region's name: the folder of the session's root; null when not known. */
  region?: string | null
  /**
   * The Haiku calls each ticket's Quests made this session, by purpose, each
   * against its own limit: a ticket started again keeps its count. Kept for
   * the session only (never in the Region file); absent until the first call.
   */
  haikuCallsByTicket?: Record<string, { sage: number; boss: number }>
  /**
   * Haiku was found unavailable on this account this session (refused, not
   * found, not allowed): no more calls are made, Sage or Boss Fight.
   */
  haikuUnavailable?: boolean
  /**
   * The Prophecy armed and not yet settled: a test file was edited, and the
   * next Check settles it. Null or absent when none is armed.
   */
  prophecy?: Prophecy | null
  /**
   * The files read lately in the project's Modules, the latest
   * MAX_RECENT_READS, each once, oldest first: what a Scouting is shown.
   * A search's folder may be among them. Absent until the first.
   */
  recentReads?: { path: string; module: string }[]
  /** The Modules discovered this session outside any Quest: every fifth wants a Scouting. */
  modulesDiscoveredOutsideQuest?: number
  /** The Scoutings wanted this session outside any Quest, two at most. */
  scoutingsOutsideQuest?: number
  /**
   * The Modules of this Region the Player has charted (a Scouting about them
   * answered right), in the order charted. Seeded at session start from the
   * Player's `$.store` key `charted:<root>`; absent until known.
   */
  chartedModules?: string[]
}

/** One Quest in a Region's history, as the Region file keeps it. */
export type QuestRecord = {
  ticket: string
  /** When the Quest started, as an ISO 8601 timestamp. */
  startedAt: string
  /**
   * The session that started it, or last took it up again (`$.session.id()`);
   * absent in a record kept by an older mod, or when the id was not known.
   */
  sessionId?: string
  /** When a later start of the same ticket took the active run up again, as an ISO 8601 timestamp. */
  resumedAt?: string
  /**
   * `abandoned` once another Quest replaced it before it closed, or it was
   * left active for over 7 days; how its Boss Fight closed it (QuestOutcome)
   * once it did.
   */
  status: 'active' | 'abandoned' | QuestOutcome
  /**
   * When the Quest closed, as an ISO 8601 timestamp; absent while active, and
   * on an abandoned run unless its record was only written as it ended.
   */
  endedAt?: string
}

/** The Region file: one project's `.claude/claude-quest.json`. */
export type Region = {
  /** Every Quest started in the project, oldest first. */
  quests: QuestRecord[]
  /** Where the Region's Quests come from; GitHub Issues when absent. */
  questSource?: QuestSourceSetting
  /**
   * The Modules an older mod kept here, in order of first visit. Read once,
   * to seed the Player's own (`$.store` key `discovered:<root>`), and never
   * written again.
   */
  discoveredModules?: string[]
}

/**
 * The Region's choice of Quest Source, kept by hand in its Region file:
 * `{ "kind": "github" }` or `{ "kind": "jira", "project": "CPI", ... }`.
 */
export type QuestSourceSetting = { kind: 'github' } | ({ kind: 'jira' } & JiraSettings)

/** How a Region reads its Quests from Jira, through the Atlassian MCP server. */
export type JiraSettings = {
  /** The Jira project's key (`CPI`). */
  project: string
  /**
   * The JQL listing the open Quests; by default the project's issues not
   * done, newest first.
   */
  jql?: string
  /**
   * The Atlassian site: its cloudId or URL (`https://acme.atlassian.net`).
   * By default the first Jira site the connection can reach.
   */
  site?: string
  /** The Atlassian MCP server's name as /mcp lists it; `claude.ai Atlassian MCP` by default. */
  server?: string
  /**
   * The story points field's id (`customfield_10016`), which differs per
   * site: getJiraIssue with view "evidence" lists each custom field's label
   * and id under fields.customFields. Without it only a points label
   * (`points: 5`) gives story points: the server's default view leaves custom
   * fields out unless asked by id.
   */
  storyPointsField?: string
}

/** One of the six Stats, by its key in `Stats`. */
export type StatName = keyof Stats

/**
 * How hard a Quest is, read only from its ticket (story points, a size
 * label), never from the Player. `Unrated` when the ticket names neither.
 */
export type Difficulty = 'Trivial' | 'Easy' | 'Medium' | 'Hard' | 'Epic' | 'Unrated'

/** One Quest on the Quest Board, as its Quest Source lists it. */
export type QuestCard = {
  /** The ticket's reference as its Quest Source writes it: `#4`, `ABC-123`. */
  ticket: string
  title: string
  /** The ticket's status, as its Quest Source names it (`ready-for-agent`, `open`). */
  status: string
  difficulty: Difficulty
  /** The Stats the Quest calls on, as guidance; never empty. */
  recommendedStats: StatName[]
  /** Where the ticket lives, for the Player to open; absent when unknown. */
  url?: string
  /**
   * The ticket's triage labels (`needs-info`, `ready-for-agent`), as tags
   * beside its status; absent or empty when it has none.
   */
  tags?: string[]
  /**
   * The Dungeon the Quest is in: its epic (a GitHub milestone, a Jira
   * parent), by a key stable for the epic (the milestone's number, the
   * parent's issue key) and its name; absent for a Quest of the Wilds.
   */
  dungeon?: { key: string; name: string }
}

/**
 * One ticket as its Quest Source gets it by reference: its card, and its
 * description, when it has one: as plain text, cut for Haiku (`summary`), and
 * whole (`description`: Markdown for GitHub Issues, plain text for Jira), as
 * the Quest Log shows it.
 */
export type TicketDetails = QuestCard & {
  summary?: string
  description?: string
  /** How `description` is written: `markdown` (GitHub Issues) or plain `text` (Jira); absent with no description. */
  descriptionFormat?: 'markdown' | 'text'
}

/** Why a Quest Source could not list its Quests. */
export type QuestSourceProblem = {
  /**
   * `missing`: the tool it calls is not installed or not connected;
   * `unauthenticated`: it is not signed in; `misconfigured`: the Region's
   * `questSource` (or the Region file) is wrong, or Jira refused the query
   * (400) or has no site; `none`: the Region names no Quest Source and the
   * project is no GitHub repo; `forbidden`: the account may not see the
   * project (403); `unreachable`: any other failure, told in `message`.
   */
  kind: 'missing' | 'unauthenticated' | 'misconfigured' | 'none' | 'forbidden' | 'unreachable'
  message: string
}

/**
 * What the Quest Board shows: its Quests as last listed and its filters.
 * Its place (the card unrolled, the page shown) is the Game Screen's
 * (`GameScreen.board`); a board kept by an older mod may still hold them,
 * which nothing reads.
 */
export type QuestBoard = {
  listing:
    | { state: 'loading' }
    | {
        state: 'listed'
        quests: QuestCard[]
        /** The Quest Source listed, for the board's hints; absent in a board kept by an older mod. */
        source?: QuestSourceSetting
      }
    | { state: 'unavailable'; problem: QuestSourceProblem }
  /** null shows every status, or every difficulty. */
  filters: { status: string | null; difficulty: Difficulty | null }
}

/**
 * One ticket as the Quest Log and the Quest Board's Scroll fetched it from
 * its Quest Source, once per ticket per session: `loading` while asked,
 * `got` its details (null: no such ticket), `unavailable` the source could
 * not be reached, its problem told (asked again on the next open).
 */
export type TicketFetch =
  | { state: 'loading' }
  | { state: 'got'; details: TicketDetails | null }
  | { state: 'unavailable'; problem: QuestSourceProblem }

/**
 * The Quest Log pane: the ticket it shows (null before it was first opened),
 * and the Region file's records of that ticket, read as it opened.
 */
export type QuestLog = { ticket: string | null; history: QuestRecord[] }

/** The Quest Giver's briefing of a ticket, as its Briefing writes it for the Quest Log. */
export type QuestBriefing = { text: string }

/** The land a Region is drawn on, as its theme chose it (`meadow` without one). */
export type Biome = 'meadow' | 'forest' | 'coast' | 'desert' | 'snow' | 'swamp'

/** How a Dungeon's walls, floors and banner are drawn, as its theme chose it (`crypt` without one). */
export type DungeonKind = 'crypt' | 'fortress' | 'aqueduct' | 'mine' | 'library' | 'tower'

/**
 * A Region's theme, from one Haiku call (issue #17): the name it is shown
 * by (its folder's name beside it) and its biome; when it was made, ISO 8601.
 */
export type RegionTheme = { name: string; biome: Biome; themedAt: string }

/** A Dungeon's theme, from one Haiku call: the name it is shown by (its epic's beside it) and its kind. */
export type DungeonTheme = { name: string; kind: DungeonKind; themedAt: string }

/** What the World remembers of a Region: its Dungeons by name with their counts, the Wilds, the Modules. */
export type RegionSnapshot = {
  /** When it was taken, ISO 8601. */
  takenAt: string
  /** Its Dungeons, each with its theme once one was made (kept when the Snapshot is taken again). */
  dungeons: { key: string; name: string; total: number; cleared: number; theme?: DungeonTheme }[]
  wilds: { total: number; cleared: number }
  modules: { discovered: number; total: number }
}

/**
 * A Region in the registry (`$.store` key `regions`, by root): its id (the
 * folder name), its root, its remote (null when none was read), when it was
 * first and last played (ISO 8601), and its Snapshot once its map was drawn.
 * A Region seeded from an older Player's tally alone has no root (`''`)
 * until it is played again.
 */
export type RegionEntry = {
  id: string
  root: string
  remote: string | null
  firstPlayedAt: string
  lastPlayedAt: string
  snapshot?: RegionSnapshot
  /** Its theme once Haiku made one: made at most once, kept for ever. */
  theme?: RegionTheme
}

/**
 * The Overview's state: the registry as last read and the session's root.
 * The page of Islands shown is the Game Screen's (`GameScreen.sheet`).
 */
export type OverviewState = { regions: Record<string, RegionEntry>; root: string | null }
/** A companion out with the party: one subagent sent out during a Quest, by its loop's agent id. */
export type Companion = {
  agentId: string
  /** The spawn's short description of its task: `Implement issue #22`. */
  description: string
  /** What its loop played so far: reads, Craftings, Battles won. */
  read: number
  forged: number
  battlesWon: number
}

/** A beat of the party the Scene plays: a companion setting out, until the next Encounter. */
export type PartyBeat = { kind: 'out'; description: string }

/** The session's party: the companions out, oldest first, and the Scene's beat. */
export type Party = { companions: Companion[]; beat: PartyBeat | null }

/** A listing of tickets for the Region map: loading, listed, or why it could not be. */
export type RegionMapListing =
  | { state: 'loading' }
  | { state: 'listed'; quests: QuestCard[] }
  | { state: 'unavailable'; problem: QuestSourceProblem }

/**
 * The Region map: which Region it draws (the current project, or another
 * from its Snapshot), and what it read of the current project. The place in
 * it is the Game Screen's (`GameScreen.map`). See src/region-map.tsx.
 */
export type RegionMapState = {
  target: { kind: 'live' } | { kind: 'snapshot'; entry: RegionEntry }
  /** The current project as read when the map opened: its root, id (folder name), remote, history and Modules on disk. */
  project: { root: string; id: string; remote: string | null; history: QuestRecord[]; folders: string[] } | null
  /** Its open tickets, read each time the pane opens. */
  open: RegionMapListing
  /** Its closed tickets, by project root: read once a session per Region (again only after a failure). */
  closed: Record<string, RegionMapListing>
}

/** The Game Screen's views, as its tab row lists them: the Quest Board, the Region map, the Quest Log, the Overview. */
export type GameView = 'quests' | 'map' | 'log' | 'sheet'

/**
 * The Game Screen (src/game-screen.tsx): the view its panel shows, and each
 * view's place in it, kept across a view switch and a reload.
 */
export type GameScreen = {
  view: GameView
  /** The Quest Board's: the page shown, from 0 (a filter changed goes back to 0, a page past the last shows the last), and the ticket whose Scroll is unrolled (null: every Scroll rolled, as is a ticket no longer listed). */
  board: { page: number; selected: string | null }
  map: {
    /** The overworld, a site's Floors, or the Module view. */
    view: 'overworld' | 'dungeon' | 'modules'
    /** The site entered last: a Dungeon's key, or '' for the Wilds; null before any. */
    site: string | null
    /** The Floor shown, from 0. */
    floor: number
    /** The Room selected, by its place on the Floor (from 0); null when none. */
    selected: number | null
  }
  /** The Quest Log's: the ticket shown; null shows the active Quest's. */
  log: { ticket: string | null }
  /** The Overview's: the page of Islands shown, from 0. */
  sheet: { page: number }
}

declare module 'claude-code' {
  interface PluginState {
    'quest-mod': {
      game: GameState | null
      board: QuestBoard
      /** The Game Screen: the view shown and each view's place. */
      gameScreen: GameScreen
      /** The Quest Log: the ticket last loaded, its Region file history. */
      questLog: QuestLog
      /** Each ticket's details fetched this session, by ticket (`#21`, `ABC-123`): see TicketFetch. */
      ticketDetails: StateFamily<TicketFetch>
      /** The Quest Giver's briefing, by ticket; written by the Briefing (#19), read by the Quest Log. */
      briefing: StateFamily<QuestBriefing>
      /** Questions made, by their change's hash: see src/question-cache.ts. */
      questionCache: { key: string; question: QuestionContent }[]
      /** Whether the Game Screen opened itself this session (the `autoOpenScene` rule): once at most. */
      sceneOpened: boolean
      /**
       * The Quest Giver's Briefing of each ticket, its two lines as they
       * arrived: a family by ticket, `{ plugin: 'quest-mod', key: 'briefing',
       * id: '#19' }` (see src/briefing.ts). Kept for the session.
       */
      briefing: StateFamily<{ text: string }>
      /** The Overview: the registry as last read, the session's root. */
      overview: OverviewState
      /** The companions out with the party: see src/party.ts. */
      party: Party
      /** The Region map: see src/region-map.tsx. */
      regionMap: RegionMapState
      /** The Regions and Dungeons a theme was asked for this session, by key: see src/theming.ts. */
      themeAttempts: string[]
    }
  }
}
