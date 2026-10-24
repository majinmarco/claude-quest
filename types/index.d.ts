// Claude Quest's contract: the game's data types, and the values the mod keeps
// in `$.state` for the session.

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
  hp: number
  maxHp: number
  stats: Stats
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
}

/** A Battle under way: a monster standing against one check. */
export type Battle = {
  check: string
  foe: CheckKind
  hp: number
  maxHp: number
  isCounted: boolean
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
}

export type GameState = {
  player: Player
  encounter: Encounter | null
  vitals: Vitals
  /** The active Quest; one at a time per session, null between Quests. */
  quest: Quest | null
  /**
   * The Modules the Player has explored in this Region, in order of first
   * visit. A Module is the folder a read or search was in, relative to the
   * project's root (`src`, `tests/fixtures`, `.` for the root itself); a
   * folder outside the project is no Module. Seeded from the Region file at
   * session start.
   */
  visitedModules: string[]
  /**
   * The Battles under way, one per failing check, oldest first. A Battle ends
   * when its check passes.
   */
  battles: Battle[]
}

/** One Quest in a Region's history, as the Region file keeps it. */
export type QuestRecord = {
  ticket: string
  /** When the Quest started, as an ISO 8601 timestamp. */
  startedAt: string
  /** `abandoned` once another Quest replaced it before it closed. */
  status: 'active' | 'abandoned'
}

/** The Region file: one project's `.claude/claude-quest.json`. */
export type Region = {
  /** Every Quest started in the project, oldest first. */
  quests: QuestRecord[]
  /** Where the Region's Quests come from; GitHub Issues when absent. */
  questSource?: QuestSourceSetting
  /**
   * The Modules the Player has explored in the project, in order of first
   * visit (GameState.visitedModules), so a first visit is a first visit once.
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
}

/** Why a Quest Source could not list its Quests. */
export type QuestSourceProblem = {
  /**
   * `missing`: the tool it calls is not installed; `unauthenticated`: it is
   * not signed in; `unreachable`: any other failure, told in `message`.
   */
  kind: 'missing' | 'unauthenticated' | 'unreachable'
  message: string
}

/** What the Quest Board shows: its Quests as last listed, and its filters. */
export type QuestBoard = {
  listing:
    | { state: 'loading' }
    | { state: 'listed'; quests: QuestCard[] }
    | { state: 'unavailable'; problem: QuestSourceProblem }
  /** null shows every status, or every difficulty. */
  filters: { status: string | null; difficulty: Difficulty | null }
}

declare module 'claude-code' {
  interface PluginState {
    'quest-mod': { game: GameState | null; board: QuestBoard }
  }
}
