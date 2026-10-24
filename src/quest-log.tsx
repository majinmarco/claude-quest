// The Quest Log pane (`/quest`, `/quest <ticket>`): all the game knows of one
// Quest, top to bottom. Its Scroll unrolled at full width (pixel art where the
// surface draws SVG, the text scroll in the terminal) with the ticket's link;
// the ticket's whole description (Markdown on every surface), cut at 8000
// characters; the Quest Giver's briefing, once it has one; for the Quest under
// way its progress (from the game alone, src/engine.ts questProgressOf), and
// for one that is not, Take Quest and its Region file history. It never
// opens itself: /quest, the Quest Board's Read more, and the Quest Log
// Buttons of the Sage and Boss panes open it.

import type { EngineInterface, RenderInput } from 'claude-code'

import { questXp } from './engine'
import type { QuestProgress } from './engine'
import { drawTextScroll, PROBLEM_HINT } from './quest-board'
import { statsOf } from './quest-source'
import { questLogScrollSvg, STAT_ABBREVIATION, tagsOf } from './scroll-art'
import { ticketOf } from './translate'
import type { Quest, QuestCard, QuestRecord, TicketFetch } from '../types'

/** The Quest Log's pane. */
export const QUEST_LOG = { id: 'quest-log', title: 'Quest Log' } as const

/** The most of a description the log shows, in characters. */
export const DESCRIPTION_CUT = 8000

/** What follows a description cut at DESCRIPTION_CUT. */
export const DESCRIPTION_REST = '… (open the ticket for the rest)'

/**
 * A description as the log shows it: whole up to DESCRIPTION_CUT characters,
 * else cut there, saying so; a Markdown code fence the cut left open is
 * closed first, so the note is not drawn as code.
 */
export const descriptionShown = (text: string): string => {
  if (text.length <= DESCRIPTION_CUT) {
    return text
  }

  const cut = text.slice(0, DESCRIPTION_CUT).trimEnd()
  const isFenceOpen = (cut.match(/^ {0,3}(```|~~~)/gm) ?? []).length % 2 === 1

  return `${cut}${isFenceOpen ? '\n```' : ''}\n\n${DESCRIPTION_REST}`
}

/** The most of a description the Quest Board's unrolled Scroll shows, in characters. */
export const EXCERPT_CHARS = 300

/**
 * A description as plain text on one run of lines, its Markdown marks taken
 * out (headings, emphasis, code, links and images as their words, lists and
 * checkboxes, HTML tags), cut to EXCERPT_CHARS with `…`: the unrolled
 * Scroll's excerpt.
 */
export const excerptOf = (description: string): string => {
  const plain = description
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*(?:#{1,6}|>+|[-*+]|\d+[.)])\s+/gm, '')
    .replace(/^\s*\[[ xX]\]\s+/gm, '')
    .replace(/(\*\*|__|~~|[*`])/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (plain.length <= EXCERPT_CHARS) {
    return plain
  }

  const cut = plain.slice(0, EXCERPT_CHARS - 1)
  const space = cut.lastIndexOf(' ')

  return `${(space > EXCERPT_CHARS / 2 ? cut.slice(0, space) : cut).trimEnd()}…`
}

/** What `/quest`'s argument names: the active Quest, a ticket, or nothing it reads. */
export type QuestArg = { kind: 'active' } | { kind: 'ticket'; ticket: string } | { kind: 'invalid' }

/** `/quest`'s argument: none, the active Quest; a ticket as /implement reads one (`#21`, `21`, `ABC-123`, their URLs). */
export const questArgOf = (args: string): QuestArg => {
  if (args.trim() === '') {
    return { kind: 'active' }
  }

  const ticket = ticketOf(args)

  return ticket === null ? { kind: 'invalid' } : { kind: 'ticket', ticket }
}

/** What `/quest` says with no Quest under way and no ticket named. */
export const NO_ACTIVE_QUEST =
  'No Quest under way: pick one on the Quest Board (/quest-board), or open any ticket\'s log with /quest #N or /quest ABC-123.'

/** What `/quest` says of an argument that names no ticket. */
export const NOT_A_TICKET = 'The Quest Log opens a ticket by its reference: /quest #N, or a Jira key such as /quest ABC-123.'

/** What the log says while it fetches the ticket. */
export const FETCHING = 'Fetching the ticket…'

/** A ticket's status that says its work is over: no Quest to take. */
const CLOSED = /^(closed|done|resolved|cancell?ed|won't do|wontfix)$/i

/** Whether a Quest card's ticket is still open, so its Quest can be taken. */
export const isOpenTicket = (card: QuestCard): boolean => !CLOSED.test(card.status.trim())

/** An ISO 8601 time as the log shows it: `2026-10-24 12:00 UTC`; as written when it is no time. */
export const timeOf = (iso: string): string => {
  const at = Date.parse(iso)

  return Number.isNaN(at) ? iso : `${new Date(at).toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

const plural = (count: number, one: string) => `${count} ${one}${count === 1 ? '' : 's'}`

/** A list of names, up to six, the rest counted. */
const namesOf = (names: readonly string[]): string =>
  names.length <= 6 ? names.join(', ') : `${names.slice(0, 6).join(', ')} and ${names.length - 6} more`

/** The Boss Fight in one line, as the progress tells it. */
const bossLineOf = (boss: QuestProgress['boss']): string => {
  switch (boss.status) {
    case 'none':
      return "Boss: not yet: the Quest's first commit summons it."
    case 'approaching':
      return 'Boss: approaching: its review Questions are being made.'
    case 'fighting':
      return boss.hp === 0
        ? `Boss: fallen, ${plural(boss.questionsLeft, 'finishing blow')} left (/boss).`
        : `Boss: stands, ${boss.hp}/${boss.maxHp} HP, ${plural(boss.questionsLeft, 'Question')} left (/boss).`
    default:
      return `Boss: ${boss.status}.`
  }
}

/**
 * The active Quest's progress as lines: when it started (and was taken up
 * again), its Encounters, its Questions, its Boss Fight, and its XP by pool
 * against each cap. `record` is the Region file's record of its run, when read.
 */
export const progressLines = (progress: QuestProgress, record: QuestRecord | undefined): string[] => {
  const { modulesDiscovered, itemsForged, battlesWon, battlesStanding, questions, pools } = progress
  const standing = battlesStanding.map(battle => `${battle.check} ${battle.hp}/${battle.maxHp} HP`)
  const anyFull = pools.some(pool => pool.isFull)

  return [
    ...(record === undefined
      ? []
      : [`Started ${timeOf(record.startedAt)}${record.resumedAt === undefined ? '' : ` · resumed ${timeOf(record.resumedAt)}`}`]),
    `Encounters: ${progress.encounters} · Modules discovered: ${modulesDiscovered.length}${modulesDiscovered.length === 0 ? '' : ` (${namesOf(modulesDiscovered)})`} · Items forged: ${itemsForged.length}${itemsForged.length === 0 ? '' : ` (${namesOf(itemsForged)})`}`,
    `Battles: ${battlesWon} won · ${battlesStanding.length} standing${standing.length === 0 ? '' : ` (${namesOf(standing)})`}`,
    `Questions: ${questions.right} right · ${questions.wrong} wrong · ${questions.waiting} waiting${questions.waiting === 0 ? '' : ' (/sage)'}`,
    bossLineOf(progress.boss),
    `XP this Quest, by pool: ${pools.map(pool => `${pool.pool} ${pool.earned}/${pool.cap}${pool.isFull ? ' (full)' : ''}`).join(' · ')}`,
    ...(anyFull ? ['A full pool pays nothing more this Quest; the Sage and the Boss Fight still may.'] : []),
  ]
}

/** One run of the ticket's Quest in the Region file, in one line. */
export const historyLineOf = (record: QuestRecord): string =>
  [
    record.status === 'active' ? 'active (another session)' : record.status,
    `started ${timeOf(record.startedAt)}`,
    ...(record.resumedAt === undefined ? [] : [`resumed ${timeOf(record.resumedAt)}`]),
    ...(record.endedAt === undefined ? [] : [`ended ${timeOf(record.endedAt)}`]),
  ].join(' · ')

/** Everything the log draws of one ticket. */
export type QuestLogModel = {
  ticket: string
  /** Its details as fetched this session; undefined before the first fetch. */
  fetch: TicketFetch | undefined
  /** Its card as the Quest Board last listed it, when it did. */
  listed: QuestCard | undefined
  /** The active Quest, when it is this ticket's; null otherwise. */
  quest: Quest | null
  /** That Quest's progress (questProgressOf), when it is this ticket's. */
  progress: QuestProgress | null
  /** The Region file's records of this ticket, oldest first. */
  history: QuestRecord[]
  /** The Quest Giver's briefing of this ticket, once it has one (#19). */
  briefing: string | null
  /** The Dungeon the Quest is in, once the Region map knows it (#15). */
  dungeon?: string
}

export type QuestLogActions = {
  /** Take this Quest, as the Quest Board's Take Quest does (the draft guard included). */
  take: (card: QuestCard) => void
  /** Fetch the ticket again. */
  refresh: () => void
}

/**
 * The ticket's card as best known: fetched, else as the board listed it,
 * else what the active Quest holds (its Stats the rule's default); null when
 * nothing is known yet.
 */
export const cardOf = ({ ticket, fetch, listed, quest }: Pick<QuestLogModel, 'ticket' | 'fetch' | 'listed' | 'quest'>): QuestCard | null => {
  if (fetch?.state === 'got' && fetch.details !== null) {
    return fetch.details
  }
  if (listed !== undefined) {
    return listed
  }

  return quest === null
    ? null
    : { ticket, title: quest.title ?? ticket, status: 'open', difficulty: quest.difficulty ?? 'Unrated', recommendedStats: statsOf([]) }
}

/** The card in one line, as the Scroll's alt says it. */
const describeCard = (card: QuestCard, dungeon: string | undefined): string =>
  [
    `${card.ticket} ${card.title}`,
    card.difficulty,
    `Boss: +${questXp(card.difficulty)} XP`,
    card.recommendedStats.map(stat => STAT_ABBREVIATION[stat]).join(' '),
    card.status,
    ...tagsOf(card).map(tag => `#${tag}`),
    ...(dungeon === undefined ? [] : [`Dungeon: ${dungeon}`]),
  ].join(' · ')

/** The terminal's Scroll is as wide as the pane, up to this many cells. */
const LOG_FRAME_MAX = 100

export function drawQuestLog($: EngineInterface, e: RenderInput<'Pane'>, model: QuestLogModel, actions: QuestLogActions) {
  const elements = $.ui.resolve(e)
  const { Box, Text, Button, Link, Markdown } = elements
  // The terminal's table lists Svg too, as a fragment: it draws no SVG.
  const Svg = e.surface !== 'terminal' && 'Svg' in elements ? elements.Svg : undefined
  const { ticket, fetch, quest, progress, history, briefing, dungeon } = model
  const card = cardOf(model)
  // A card that carries its Dungeon already says it among its details.
  const extra = dungeon === undefined || card?.dungeon !== undefined ? [] : [`Dungeon: ${dungeon}`]
  const isActive = quest !== null && quest.ticket === ticket

  const heading = (text: string) => (
    <Text bold color="yellow">
      {text}
    </Text>
  )

  // 1. The Scroll, unrolled at full width, and the ticket's link.
  const scroll =
    card === null ? (
      <Text bold>{`Quest ${ticket}`}</Text>
    ) : Svg !== undefined ? (
      <Svg source={questLogScrollSvg(card, { xp: questXp(card.difficulty), extra })} alt={describeCard(card, dungeon)} />
    ) : (
      drawTextScroll($, e, card, Math.min(e.props.bodyColumns, LOG_FRAME_MAX), { titleLines: 6, extra })
    )
  const link = card?.url === undefined ? null : <Link href={card.url} label={card.url} />

  // 2. The description, whole up to the cut; or why it is not shown.
  const refresh = (
    <Box flexDirection="row">
      <Button key="quest-log-refresh" dimColor onPress={() => actions.refresh()}>
        Refresh
      </Button>
    </Box>
  )
  const description =
    fetch === undefined || fetch.state === 'loading' ? (
      <Box flexDirection="column">
        <Text dimColor>{FETCHING}</Text>
        {refresh}
      </Box>
    ) : fetch.state === 'unavailable' ? (
      <Box flexDirection="column">
        <Text bold color="red">
          The ticket could not be fetched.
        </Text>
        <Text>{fetch.problem.message}</Text>
        <Text dimColor>{PROBLEM_HINT[fetch.problem.kind] ?? PROBLEM_HINT.unreachable}</Text>
        {refresh}
      </Box>
    ) : fetch.details === null ? (
      <Text dimColor>{`No ticket ${ticket} in this Region's Quest Source.`}</Text>
    ) : fetch.details.description === undefined ? (
      <Text dimColor>The ticket has no description.</Text>
    ) : fetch.details.descriptionFormat === 'text' ? (
      // Jira's, flattened to plain text: drawn as written, never read as Markdown.
      <Text>{descriptionShown(fetch.details.description)}</Text>
    ) : (
      <Markdown key="quest-log-description" text={descriptionShown(fetch.details.description)} />
    )

  // 3. The Quest Giver's briefing: the slot the Briefing (#19) fills, by
  // writing `$.state` `briefing` with the ticket as its id.
  const briefed =
    briefing === null ? null : (
      <Box flexDirection="column">
        {heading("The Quest Giver's briefing")}
        <Text>{briefing}</Text>
      </Box>
    )

  // 4. The Quest under way: its progress, from the game alone.
  const record = [...history].reverse().find(each => each.status === 'active') ?? history.at(-1)
  const underWay =
    !isActive || progress === null ? null : (
      <Box flexDirection="column">
        {heading('Progress')}
        {progressLines(progress, record).map((line, at) => (
          <Text key={`progress:${at}`}>{line}</Text>
        ))}
      </Box>
    )

  // 5. A Quest not under way: Take Quest while its ticket is open, and its runs.
  const take =
    isActive || card === null || !isOpenTicket(card) || (fetch?.state === 'got' && fetch.details === null) ? null : (
      <Box flexDirection="row">
        <Button key={`quest-log-take:${card.ticket}`} variant="primary" onPress={() => actions.take(card)}>
          {`Take Quest ${card.ticket}`}
        </Button>
      </Box>
    )
  const runs =
    isActive || history.length === 0 ? null : (
      <Box flexDirection="column">
        {heading('History')}
        {history.map((each, at) => (
          <Text key={`history:${at}`}>{historyLineOf(each)}</Text>
        ))}
      </Box>
    )

  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        {scroll}
        {link}
      </Box>
      {heading('The ticket')}
      {description}
      {briefed}
      {underWay}
      {take}
      {runs}
    </Box>
  )
}

/** The log before it was first opened for a ticket. */
export function drawEmptyQuestLog($: EngineInterface, e: RenderInput<'Pane'>) {
  const { Text } = $.ui.resolve(e)

  return <Text dimColor>{NO_ACTIVE_QUEST}</Text>
}

/**
 * What the Quest Board's unrolled Scroll says of its description: the
 * excerpt once fetched, that it is being fetched until then; nothing for a
 * ticket with no description, or that could not be fetched.
 */
export const scrollExcerptOf = (fetch: TicketFetch | undefined): string | undefined => {
  if (fetch === undefined || fetch.state === 'loading') {
    return FETCHING
  }

  return fetch.state === 'got' && fetch.details?.description !== undefined ? excerptOf(fetch.details.description) : undefined
}

/** A Quest as the Sage's and Boss's panes head themselves with it. */
export type QuestHeader = { ticket: string; title?: string; openLog: () => void }

/** The one-line `Quest #N Title` header, with a Quest Log Button. */
export function drawQuestHeader($: EngineInterface, e: RenderInput<'Pane'>, { ticket, title, openLog }: QuestHeader) {
  const { Box, Text, Button } = $.ui.resolve(e)

  return (
    <Box flexDirection="row" gap={1}>
      <Text bold>{`Quest ${ticket}${title === undefined ? '' : ` ${title}`}`}</Text>
      <Button key="quest-log-open" dimColor onPress={() => openLog()}>
        Quest Log
      </Button>
    </Box>
  )
}
