// The Quest Board pane: the current Region's open Quests as cards, with
// filters by status (and tag) and difficulty, under a header of the Player's
// trophies and Badges. Plain text and buttons on every surface, so the
// terminal's board is the desktop's. A card's press is the caller's: it fills
// the prompt with an implement command for the ticket.

import type { EngineInterface, RenderInput } from 'claude-code'

import { questXp } from './engine'
import type { Player } from './engine'
import { REGION_FILE } from './persistence'
import { LISTING_CAP } from './quest-source'
import { isImplementCommand } from './translate'
import type { Difficulty, QuestBoard, QuestCard, QuestSourceProblem, QuestSourceSetting, StatName } from '../types'

export type QuestBoardActions = {
  /** The Player picked this Quest. */
  pick: (quest: QuestCard) => void
  /** Show only the Quests of this status or tag, or every one (null). */
  filterStatus: (status: string | null) => void
  /** Show only the Quests of this difficulty, or every difficulty (null). */
  filterDifficulty: (difficulty: Difficulty | null) => void
  /** Read the Quest Source again. */
  refresh: () => void
}

/** The implement command the Quest Board fills when it is there. */
export const PREFERRED_IMPLEMENT = 'mattpocock-skills:implement'

/**
 * The implement command a session has, among the command names it lists:
 * mattpocock-skills' first, then any plugin's, then a bare `implement`;
 * undefined when it has none.
 */
export const implementCommandOf = (names: readonly string[]): string | undefined =>
  names.find(name => name === PREFERRED_IMPLEMENT) ??
  names.find(name => name.includes(':') && isImplementCommand(name)) ??
  names.find(name => name === 'implement')

/** Whether a prompt draft is itself an implement command (`/implement #6`). */
export const isImplementDraft = (draft: string): boolean => {
  const command = /^\/(\S+)/.exec(draft.trim())?.[1]

  return command !== undefined && isImplementCommand(command)
}

/** The filters as the board starts: everything shown. */
export const noFilters = (): QuestBoard['filters'] => ({ status: null, difficulty: null })

const DIFFICULTIES: Difficulty[] = ['Trivial', 'Easy', 'Medium', 'Hard', 'Epic', 'Unrated']

const STAT_ABBREVIATION: Record<StatName, string> = {
  intelligence: 'INT',
  wisdom: 'WIS',
  dexterity: 'DEX',
  strength: 'STR',
  charisma: 'CHA',
  constitution: 'CON',
}

/**
 * The filter's value after `current`, among the values the listing holds;
 * after the last, every value again (null). A value no longer listed goes
 * back to every value too.
 */
const nextFilter = <T,>(values: readonly T[], current: T | null): T | null => {
  if (current === null) {
    return values[0] ?? null
  }

  const at = values.indexOf(current)

  return at === -1 ? null : (values[at + 1] ?? null)
}

const distinct = <T,>(values: readonly T[]): T[] => [...new Set(values)]

/** A card's tags beside its status, the status itself left out. */
const tagsOf = (quest: QuestCard): string[] => (quest.tags ?? []).filter(tag => tag !== quest.status)

const describeCard = (quest: QuestCard): string =>
  [
    quest.difficulty,
    `Boss: +${questXp(quest.difficulty)} XP`,
    quest.recommendedStats.map(stat => STAT_ABBREVIATION[stat]).join(' '),
    quest.status,
    ...tagsOf(quest).map(tag => `#${tag}`),
  ].join(' · ')

/** Whether the Quest has `value` as its status or one of its tags. */
const hasStatus = (quest: QuestCard, value: string): boolean =>
  quest.status === value || (quest.tags ?? []).includes(value)

/** What to do about each kind of problem, one line under its message. */
const PROBLEM_HINT: Record<QuestSourceProblem['kind'], string> = {
  missing: 'Once it is installed or connected, press Refresh.',
  unauthenticated: 'Once signed in, press Refresh.',
  misconfigured: `Fix questSource in ${REGION_FILE}: { "kind": "github" }, or { "kind": "jira", "project": "KEY" }, then Refresh.`,
  none: `To read a Jira project, set "questSource": { "kind": "jira", "project": "KEY" } in ${REGION_FILE}.`,
  forbidden: `The project is questSource.project in ${REGION_FILE}.`,
  unreachable: `The Quest Source is chosen in ${REGION_FILE}: "github" (the default) or "jira".`,
}

/** How the Quests could be rated, when none is: by the Quest Source listed. */
const ratingHint = (source: QuestSourceSetting | undefined): string => {
  if (source?.kind === 'jira') {
    return source.storyPointsField === undefined
      ? 'No Quest is rated: set questSource.storyPointsField (e.g. customfield_10016) to rate Quests.'
      : `No Quest is rated: none has a value in ${source.storyPointsField} (questSource.storyPointsField).`
  }

  return 'No Quest is rated: add `size: S…XL` or `points: N` labels to rate them.'
}

/** The board's header: the Player's trophies and Badges. */
const headerOf = (player: Player | null): string =>
  `Trophies ${player?.trophies?.length ?? 0} · ★${player?.badges?.length ?? 0}`

export function drawQuestBoard(
  $: EngineInterface,
  e: RenderInput<'Pane'>,
  { listing, filters }: QuestBoard,
  actions: QuestBoardActions,
  player: Player | null = null,
) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const header = <Text color="yellow">{headerOf(player)}</Text>

  const refresh = (
    <Button key="refresh" dimColor onPress={() => actions.refresh()}>
      Refresh
    </Button>
  )

  if (listing.state === 'loading') {
    return (
      <Box flexDirection="column" gap={1}>
        {header}
        <Text dimColor>Reading the Quest Board…</Text>
        <Box flexDirection="row">{refresh}</Box>
      </Box>
    )
  }

  if (listing.state === 'unavailable') {
    return (
      <Box flexDirection="column" gap={1}>
        {header}
        <Text bold color="red">
          The Quest Board could not be read.
        </Text>
        <Text>{listing.problem.message}</Text>
        <Text dimColor>{PROBLEM_HINT[listing.problem.kind] ?? PROBLEM_HINT.unreachable}</Text>
        <Box flexDirection="row">{refresh}</Box>
      </Box>
    )
  }

  const { quests } = listing
  if (quests.length === 0) {
    return (
      <Box flexDirection="column" gap={1}>
        {header}
        <Text dimColor>No open Quests in this Region: its Quest Source lists none open.</Text>
        <Box flexDirection="row">{refresh}</Box>
      </Box>
    )
  }

  // A status filter steps through every status and tag; a filter with
  // fewer than two values to pick from is no choice, and is not shown.
  const statuses = distinct(quests.flatMap(quest => [quest.status, ...(quest.tags ?? [])]))
  const difficulties = DIFFICULTIES.filter(difficulty =>
    quests.some(quest => quest.difficulty === difficulty),
  )
  // A filter whose button is hidden, or whose value is no longer listed,
  // filters nothing: the Player could not take it off.
  const status = statuses.length >= 2 && filters.status !== null && statuses.includes(filters.status) ? filters.status : null
  const difficulty =
    difficulties.length >= 2 && filters.difficulty !== null && difficulties.includes(filters.difficulty)
      ? filters.difficulty
      : null
  const shown = quests.filter(
    quest =>
      (status === null || hasStatus(quest, status)) && (difficulty === null || quest.difficulty === difficulty),
  )
  const isUnrated = quests.every(quest => quest.difficulty === 'Unrated')
  // A listing as long as the cap may have been cut short.
  const total = quests.length >= LISTING_CAP ? `${quests.length}+` : `${quests.length}`

  return (
    <Box flexDirection="column" gap={1}>
      {header}
      <Box flexDirection="row" gap={1}>
        {statuses.length >= 2 && (
          <Button
            key="filter-status"
            onPress={() => actions.filterStatus(nextFilter(statuses, status))}
          >
            {`Status: ${status ?? 'all'}`}
          </Button>
        )}
        {difficulties.length >= 2 && (
          <Button
            key="filter-difficulty"
            onPress={() => actions.filterDifficulty(nextFilter(difficulties, difficulty))}
          >
            {`Difficulty: ${difficulty ?? 'all'}`}
          </Button>
        )}
        {refresh}
      </Box>
      <Text dimColor>{`${shown.length} of ${total} Quests`}</Text>
      {isUnrated && <Text dimColor>{ratingHint(listing.source)}</Text>}
      {shown.length === 0 && <Text dimColor>No Quests match these filters.</Text>}
      {shown.map(quest => (
        <Box key={`card:${quest.ticket}`} flexDirection="column">
          <Button key={`quest:${quest.ticket}`} plain onPress={() => actions.pick(quest)}>
            {`${quest.ticket} ${quest.title}`}
          </Button>
          <Text dimColor>{describeCard(quest)}</Text>
        </Box>
      ))}
    </Box>
  )
}
