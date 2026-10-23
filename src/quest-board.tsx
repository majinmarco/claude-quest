// The Quest Board pane: the current Region's open Quests as cards, with
// filters by status and difficulty. Plain text and buttons on every surface,
// so the terminal's board is the desktop's. A card's press is the caller's:
// it fills the prompt with `/implement` for the ticket.

import type { EngineInterface, RenderInput } from 'claude-code'

import { questXp } from './engine'
import type { Difficulty, QuestBoard, QuestCard, StatName } from '../types'

export type QuestBoardActions = {
  /** The Player picked this Quest. */
  pick: (quest: QuestCard) => void
  /** Show only the Quests of this status, or every status (null). */
  filterStatus: (status: string | null) => void
  /** Show only the Quests of this difficulty, or every difficulty (null). */
  filterDifficulty: (difficulty: Difficulty | null) => void
  /** Read the Quest Source again. */
  refresh: () => void
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

const describeCard = (quest: QuestCard): string =>
  [
    quest.difficulty,
    `${questXp(quest.difficulty)} XP`,
    quest.recommendedStats.map(stat => STAT_ABBREVIATION[stat]).join(' '),
    quest.status,
  ].join(' · ')

export function drawQuestBoard(
  $: EngineInterface,
  e: RenderInput<'Pane'>,
  { listing, filters }: QuestBoard,
  actions: QuestBoardActions,
) {
  const { Box, Text, Button } = $.ui.resolve(e)

  const refresh = (
    <Button key="refresh" dimColor onPress={() => actions.refresh()}>
      Refresh
    </Button>
  )

  if (listing.state === 'loading') {
    return (
      <Box flexDirection="column" gap={1}>
        <Text dimColor>Reading the Quest Board…</Text>
        <Box flexDirection="row">{refresh}</Box>
      </Box>
    )
  }

  if (listing.state === 'unavailable') {
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold color="red">
          The Quest Board could not be read.
        </Text>
        <Text>{listing.problem.message}</Text>
        <Box flexDirection="row">{refresh}</Box>
      </Box>
    )
  }

  const { quests } = listing
  if (quests.length === 0) {
    return (
      <Box flexDirection="column" gap={1}>
        <Text dimColor>No open Quests in this Region: its Quest Source lists none open.</Text>
        <Box flexDirection="row">{refresh}</Box>
      </Box>
    )
  }

  const statuses = distinct(quests.map(quest => quest.status))
  const difficulties = DIFFICULTIES.filter(difficulty =>
    quests.some(quest => quest.difficulty === difficulty),
  )
  const shown = quests.filter(
    quest =>
      (filters.status === null || quest.status === filters.status) &&
      (filters.difficulty === null || quest.difficulty === filters.difficulty),
  )

  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="row" gap={1}>
        <Button
          key="filter-status"
          onPress={() => actions.filterStatus(nextFilter(statuses, filters.status))}
        >
          {`Status: ${filters.status ?? 'all'}`}
        </Button>
        <Button
          key="filter-difficulty"
          onPress={() => actions.filterDifficulty(nextFilter(difficulties, filters.difficulty))}
        >
          {`Difficulty: ${filters.difficulty ?? 'all'}`}
        </Button>
        {refresh}
      </Box>
      <Text dimColor>{`${shown.length} of ${quests.length} Quests`}</Text>
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
