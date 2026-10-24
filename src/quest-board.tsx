// The Quest Board pane: the current Region's open Quests as cards, with
// filters by status (and tag, and Dungeon) and difficulty, under a header of
// the Player's trophies and Badges, six cards a page. Each card is a scroll: pixel art
// where the surface draws SVG (src/scroll-art.ts), a scroll framed in text in
// the terminal; rolled, or unrolled to show the whole card. Under each, Take
// Quest (the caller's: it fills the prompt with an implement command for the
// ticket) and Unroll or Roll up.

import type { EngineInterface, RenderChildren, RenderInput } from 'claude-code'

import { questXp } from './engine'
import type { Player } from './engine'
import { REGION_FILE } from './persistence'
import { LISTING_CAP } from './quest-source'
import { boardHeaderSvg, cardDetails, cutText, PIPS, SCROLL_COLORS, SCROLL_WIDTH, scrollCardSvg, STAT_ABBREVIATION, tagsOf, wrapText } from './scroll-art'
import type { Measure } from './scroll-art'
import { isImplementCommand } from './translate'
import type { Difficulty, QuestBoard, QuestCard, QuestSourceProblem, QuestSourceSetting } from '../types'

export type QuestBoardActions = {
  /** The Player picked this Quest. */
  pick: (quest: QuestCard) => void
  /** Show only the Quests of this status or tag, or every one (null). */
  filterStatus: (status: string | null) => void
  /** Show only the Quests of this difficulty, or every difficulty (null). */
  filterDifficulty: (difficulty: Difficulty | null) => void
  /** Read the Quest Source again. */
  refresh: () => void
  /** Unroll this ticket's card, rolling any other; or roll every card (null). */
  select: (ticket: string | null) => void
  /** Show this page, from 0. */
  page: (page: number) => void
  /** Open the Quest Log for this ticket. */
  readMore: (ticket: string) => void
}

/** How many cards a page of the board shows. */
export const PAGE_SIZE = 6

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

/** A card in one line, as its scroll's alt says it: its ticket and title, then what the scroll shows. */
const describeCard = (quest: QuestCard): string =>
  [
    `${quest.ticket} ${quest.title}`,
    quest.difficulty,
    `Boss: +${questXp(quest.difficulty)} XP`,
    quest.recommendedStats.map(stat => STAT_ABBREVIATION[stat]).join(' '),
    quest.status,
    ...tagsOf(quest).map(tag => `#${tag}`),
    ...(quest.dungeon === undefined ? [] : [`Dungeon: ${quest.dungeon.name}`]),
  ].join(' · ')

/** Whether the Quest has `value` as its status, one of its tags, or its Dungeon's name. */
const hasStatus = (quest: QuestCard, value: string): boolean =>
  quest.status === value || (quest.tags ?? []).includes(value) || quest.dungeon?.name === value

/** What to do about each kind of problem, one line under its message; the Quest Log's too. */
export const PROBLEM_HINT: Record<QuestSourceProblem['kind'], string> = {
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

/** The terminal's measure: a cell a character, `…` its cut. */
const CELLS: Measure = { width: text => [...text].length, ellipsis: '…' }

/** The terminal's scroll is as wide as the pane, up to this many cells. */
const FRAME_MAX = 64

/** The header's ribbon, drawn once: its label never changes. */
let headerArt: string | undefined
const headerArtOf = (): string => (headerArt ??= boardHeaderSvg('QUEST BOARD'))

/** The difficulty as five pips, `◆` filled; Unrated, a `?` alone. */
const pipsOf = (difficulty: Difficulty): string =>
  difficulty === 'Unrated' ? '?' : `${'◆'.repeat(PIPS[difficulty])}${'◇'.repeat(5 - PIPS[difficulty])}`

/** A run of a text scroll's row, in its colour. */
type TextRun = { text: string; color: string }

/** How an unrolled text scroll is drawn: its title in up to `titleLines` rows, an `excerpt` under it, `extra` rows after its details. */
type TextScrollOptions = { titleLines?: number; excerpt?: string; extra?: readonly string[] }

/** The most rows an excerpt of the description takes on an unrolled text scroll. */
const EXCERPT_ROWS = 8

/**
 * A card as the terminal's text scroll: a roller (`◖═══◗`), rows of paper
 * (`│ … │`), a roller. Rolled, one row: the ticket and title, cut to fit,
 * and the pips; unrolled, the whole card, with the excerpt of its
 * description when given. `width` cells in all.
 */
const textScroll = (
  quest: QuestCard,
  unrolled: boolean,
  width: number,
  { titleLines = 3, excerpt, extra = [] }: TextScrollOptions = {},
): { roller: string; rows: TextRun[][] } => {
  const inner = Math.max(width - 4, 8)
  const pips = pipsOf(quest.difficulty)
  const room = Math.max(inner - [...pips].length - 1, 1)
  const pad = (text: string, cells: number) => text + ' '.repeat(Math.max(cells - [...text].length, 0))
  const { ink, ticket, edge } = SCROLL_COLORS
  const headRow = (lead: string, rest: string): TextRun[] => {
    const head = cutText(`${lead}${rest}`, room, CELLS)
    const isLeadWhole = head.startsWith(lead)

    return [
      { text: isLeadWhole ? lead : head, color: ticket },
      { text: isLeadWhole ? pad(head.slice(lead.length), room - [...lead].length) : pad('', room - [...head].length), color: ink },
      { text: ` ${pips}`, color: edge },
    ]
  }
  const roller = `◖${'═'.repeat(inner + 2)}◗`

  if (!unrolled) {
    return { roller, rows: [headRow(`${quest.ticket} `, quest.title)] }
  }

  const line = (text: string, color: string = ink): TextRun[] => [{ text: pad(cutText(text, inner, CELLS), inner), color }]

  return {
    roller,
    rows: [
      headRow(`Quest ${quest.ticket}`, ''),
      ...wrapText(quest.title, inner, titleLines, CELLS).map(title => line(title)),
      ...(excerpt === undefined || excerpt === '' ? [] : wrapText(excerpt, inner, EXCERPT_ROWS, CELLS).map(row => line(row, edge))),
      line('┄'.repeat(inner), edge),
      ...[...cardDetails(quest, questXp(quest.difficulty)), ...extra].map((detail, at) => line(detail, at === 0 ? ticket : ink)),
    ],
  }
}

/**
 * A card unrolled as the terminal's text scroll, as plain lines (colours
 * left out): what scripts/render-art.mjs previews the Quest Log's with.
 */
export const textScrollLines = (quest: QuestCard, width: number, options: TextScrollOptions = {}): string[] => {
  const { roller, rows } = textScroll(quest, true, width, options)

  return [roller, ...rows.map(runs => `│ ${runs.map(run => run.text).join('')} │`), roller]
}

/** A text scroll drawn: its rollers and its rows of paper, each a Text. */
function textScrollElement(
  { Box, Text }: Pick<ReturnType<EngineInterface['ui']['resolve']>, 'Box' | 'Text'>,
  { roller, rows }: { roller: string; rows: TextRun[][] },
  children?: RenderChildren,
) {
  const { edgeDark, paper } = SCROLL_COLORS

  return (
    <Box flexDirection="column">
      <Text color={edgeDark}>{roller}</Text>
      {rows.map((runs, row) => (
        <Text key={`row:${row}`}>
          <Text color={edgeDark}>│</Text>
          <Text backgroundColor={paper}> </Text>
          {runs.map((run, at) => (
            <Text key={`run:${at}`} backgroundColor={paper} color={run.color}>
              {run.text}
            </Text>
          ))}
          <Text backgroundColor={paper}> </Text>
          <Text color={edgeDark}>│</Text>
        </Text>
      ))}
      <Text color={edgeDark}>{roller}</Text>
      {children}
    </Box>
  )
}

/**
 * A card unrolled as the terminal's text scroll, `width` cells across: the
 * Quest Log's, its title in up to `titleLines` rows and `extra` rows after
 * its details.
 */
export function drawTextScroll(
  $: EngineInterface,
  e: RenderInput<'Pane'>,
  quest: QuestCard,
  width: number,
  options: TextScrollOptions = {},
) {
  return textScrollElement($.ui.resolve(e), textScroll(quest, true, width, options))
}

export function drawQuestBoard(
  $: EngineInterface,
  e: RenderInput<'Pane'>,
  board: QuestBoard,
  actions: QuestBoardActions,
  player: Player | null = null,
  /**
   * What the unrolled card says of its description under its title: the
   * excerpt, or that it is being fetched; absent, nothing.
   */
  excerpt?: string,
) {
  const elements = $.ui.resolve(e)
  const { Box, Text, Button } = elements
  const { listing, filters } = board
  // The terminal's table lists Svg too, as a fragment: it draws no SVG.
  const Svg = e.surface !== 'terminal' && 'Svg' in elements ? elements.Svg : undefined
  const frameWidth = Math.min(e.props.bodyColumns, FRAME_MAX)
  const bannerLabel = ' ✦ QUEST BOARD ✦ '
  const bannerSide = Math.max(Math.floor((frameWidth - [...bannerLabel].length) / 2), 0)

  const header = (
    <Box flexDirection="column">
      <Text color="yellow">{headerOf(player)}</Text>
      {Svg === undefined ? (
        <Text bold color={SCROLL_COLORS.ribbon}>
          {`${'═'.repeat(bannerSide)}${bannerLabel}${'═'.repeat(bannerSide)}`}
        </Text>
      ) : (
        <Svg source={headerArtOf()} alt="Quest Board" width={SCROLL_WIDTH} />
      )}
    </Box>
  )

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

  // A status filter steps through every status and tag, then every
  // Dungeon; a filter with fewer than two values to pick from is no choice,
  // and is not shown.
  const statuses = distinct([
    ...quests.flatMap(quest => [quest.status, ...(quest.tags ?? [])]),
    ...quests.flatMap(quest => (quest.dungeon === undefined ? [] : [quest.dungeon.name])),
  ])
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
  // A page past the last (the listing shrank) shows the last; a ticket no
  // longer listed is no card to unroll.
  const pages = Math.max(Math.ceil(shown.length / PAGE_SIZE), 1)
  const page = Math.min(Math.max(board.page ?? 0, 0), pages - 1)
  const selected = quests.some(quest => quest.ticket === board.selected) ? board.selected : null

  const cardOf = (quest: QuestCard) => {
    const unrolled = quest.ticket === selected
    const buttons = (
      <Box flexDirection="row" gap={1}>
        <Button key={`quest:${quest.ticket}`} variant="primary" onPress={() => actions.pick(quest)}>
          {`Take Quest ${quest.ticket}`}
        </Button>
        <Button key={`scroll:${quest.ticket}`} onPress={() => actions.select(unrolled ? null : quest.ticket)}>
          {unrolled ? 'Roll up' : 'Unroll'}
        </Button>
        {unrolled && (
          <Button key={`log:${quest.ticket}`} onPress={() => actions.readMore(quest.ticket)}>
            Read more
          </Button>
        )}
      </Box>
    )
    const shownExcerpt = unrolled ? excerpt : undefined

    if (Svg !== undefined) {
      return (
        <Box key={`card:${quest.ticket}`} flexDirection="column">
          <Svg
            source={scrollCardSvg(quest, {
              unrolled,
              xp: questXp(quest.difficulty),
              ...(shownExcerpt === undefined ? {} : { excerpt: shownExcerpt }),
            })}
            alt={describeCard(quest)}
            width={SCROLL_WIDTH}
            {...(unrolled ? { isInteractive: true } : {})}
          />
          {buttons}
        </Box>
      )
    }

    const scroll = textScroll(quest, unrolled, frameWidth, shownExcerpt === undefined ? {} : { excerpt: shownExcerpt })

    return (
      <Box key={`card:${quest.ticket}`} flexDirection="column">
        {textScrollElement(elements, scroll, buttons)}
      </Box>
    )
  }

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
      {shown.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(cardOf)}
      {pages > 1 && (
        <Box flexDirection="row" gap={1}>
          {page > 0 && (
            <Button key="page-prev" onPress={() => actions.page(page - 1)}>
              ◂ Prev
            </Button>
          )}
          <Text dimColor>{`Page ${page + 1} of ${pages}`}</Text>
          {page < pages - 1 && (
            <Button key="page-next" onPress={() => actions.page(page + 1)}>
              Next ▸
            </Button>
          )}
        </Box>
      )}
    </Box>
  )
}
