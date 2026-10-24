// The HUD band above the prompt: level and title, XP bar, HP (or Exhausted),
// the Badges earned, the active Quest, its Boss Fight under way, the
// Questions waiting and the current Encounter, then the session's vitals
// (Mana, the model and the spend) and the MVP Stats, dim: filled into at
// most three rows of the band's width, the lesser parts giving way.

import type { EngineInterface, RenderInput } from 'claude-code'

import { BADGES, isExhausted, isUnderWay, manaLevel, titleOf, xpToClear } from './engine'
import type { Encounter, GameState, ManaLevel, Player } from './engine'
import { MONSTERS } from './scene-art'

const BAR_CELLS = 10

/** HP turns red at or below this share of its most: a few wrong answers left. */
const LOW_HP = 0.3

const bar = (share: number): string => {
  const filled = Math.max(0, Math.min(BAR_CELLS, Math.floor(share * BAR_CELLS)))

  return '▰'.repeat(filled) + '▱'.repeat(BAR_CELLS - filled)
}

const MANA_COLOR: Record<ManaLevel, string> = {
  calm: 'blue',
  filling: 'yellow',
  warning: 'red',
}

const describeEncounter = (encounter: Encounter): string => {
  if (encounter.kind === 'Battle') {
    return encounter.outcome === 'won'
      ? 'Battle won'
      : `Battle: ${MONSTERS[encounter.foe].name} ${encounter.hp}/${encounter.maxHp} HP`
  }

  if (encounter.kind === 'Crafting') {
    return `Crafting: ${encounter.item}`
  }

  const name = encounter.target.split(/[\\/]/).filter(Boolean).pop() ?? '.'

  return `Exploring ${name}`
}

/** The most of a Quest's title the HUD shows, in characters. */
const TITLE_CHARS = 30

/** The active Quest as the HUD names it, its title cut to `chars`: `Quest #4 Bulk discounts for big…`. */
export const questLine = ({ ticket, title }: { ticket: string; title?: string }, chars = TITLE_CHARS): string => {
  if (title === undefined || title.trim() === '') {
    return `Quest ${ticket}`
  }

  const shown = title.trim()

  return `Quest ${ticket} ${shown.length <= chars ? shown : `${shown.slice(0, chars - 1).trimEnd()}…`}`
}

/** The MVP Stats, abbreviated, in one line: `INT 120 · WIS 15 · STR 40`. */
export const statsLine = ({ stats }: Player): string =>
  `INT ${stats.intelligence} · WIS ${stats.wisdom} · STR ${stats.strength}`

/** The Player's level and title: `Lv 4 Scholar`, `Lv 2`. */
export const levelLine = (player: Player): string => {
  const title = titleOf(player)

  return title === null ? `Lv ${player.level}` : `Lv ${player.level} ${title}`
}

/**
 * The Player's Badges, trophies, title and Stats as text, for `/badges`: in the
 * terminal, until the v0.2 sheet.
 */
export const badgesText = (player: Player): string => {
  const badges = player.badges ?? []
  const trophies = player.trophies ?? []
  const total = Object.keys(BADGES).length

  return [
    `${levelLine(player)} · ${player.totalXp} XP lifetime · ${statsLine(player)}`,
    badges.length === 0
      ? `Badges (0/${total}): none yet.`
      : `Badges (${badges.length}/${total}): ${badges.map(badge => badge.name).join(', ')}`,
    trophies.length === 0
      ? 'Trophies (0): none yet. Win a Boss Fight to earn its Quest\'s.'
      : `Trophies (${trophies.length}): ${trophies.map(trophy => trophy.name).join(', ')}`,
  ].join('\n')
}

/** A Text of the HUD: its words and how it is drawn. */
type Piece = { text: string; color?: string; bold?: boolean; dimColor?: boolean }

/**
 * A part of the HUD, kept whole on one row: its pieces, then shorter
 * versions of them, longest first. `rank` is how much it matters, 0 most:
 * when the band is too narrow, the part ranked last gives way first.
 */
type Part = { rank: number; versions: Piece[][] }

/** Cells between two Texts of a row. */
const GAP = 2

/** The most rows the HUD takes. */
const MAX_ROWS = 3

/** The band's width when the host gives none. */
const DEFAULT_COLUMNS = 80

/** The parts ranked this or lower (level, HP, XP) are always shown, cut at the band's edge if need be. */
const LAST_ALWAYS_SHOWN = 2

/** The cells `pieces` take across in one row, the gaps between them counted. */
const cellsOf = (pieces: Piece[]): number =>
  pieces.reduce((sum, piece) => sum + [...piece.text].length, 0) + GAP * Math.max(pieces.length - 1, 0)

/** `parts` in order, each with its pieces, filled into rows of at most `columns` cells. */
const packRows = (parts: Piece[][], columns: number): Piece[][] => {
  const rows: Piece[][] = []
  let row: Piece[] = []
  for (const pieces of parts) {
    if (row.length > 0 && cellsOf(row) + GAP + Math.min(cellsOf(pieces), columns) > columns) {
      rows.push(row)
      row = []
    }
    row = [...row, ...pieces]
  }

  return row.length === 0 ? rows : [...rows, row]
}

/**
 * The HUD's rows for a band `columns` wide and `maxRows` tall. The parts are
 * placed by rank in their shortest version, a part that no longer fits left
 * out; then each, by rank, takes its longest version that still fits. Drawn
 * in their own order, filled row by row.
 */
const layOut = (parts: Part[], columns: number, maxRows: number): Piece[][] => {
  const chosen = new Map<Part, Piece[]>()
  const inOrder = () => parts.flatMap(part => (chosen.has(part) ? [chosen.get(part) ?? []] : []))
  const fitsWith = (part: Part, version: Piece[]): boolean => {
    const before = chosen.get(part)
    chosen.set(part, version)
    const rows = packRows(inOrder(), columns)
    if (before === undefined) {
      chosen.delete(part)
    } else {
      chosen.set(part, before)
    }

    return rows.length <= maxRows && rows.every(row => cellsOf(row) <= columns || row.length === 1)
  }
  const byRank = [...parts].sort((a, b) => a.rank - b.rank)
  for (const part of byRank) {
    const shortest = part.versions.at(-1) ?? []
    if (part.rank <= LAST_ALWAYS_SHOWN || fitsWith(part, shortest)) {
      chosen.set(part, shortest)
    }
  }
  for (const part of byRank) {
    const longest = chosen.has(part) ? part.versions.find(version => fitsWith(part, version)) : undefined
    if (longest !== undefined) {
      chosen.set(part, longest)
    }
  }

  return packRows(inOrder(), columns)
}

/** The active Quest's versions: its title cut ever shorter, then its reference alone. */
const questVersions = (quest: { ticket: string; title?: string }): string[] => {
  const versions = [questLine(quest)]
  for (let chars = TITLE_CHARS - 1; chars > 1; chars--) {
    versions.push(questLine(quest, chars))
  }
  versions.push(questLine({ ticket: quest.ticket }))

  return [...new Set(versions)]
}

/** The HUD's parts for `state`, in the order they are drawn. */
const partsOf = ({ player, encounter, vitals, quest, questions, bossFight }: GameState): Part[] => {
  const toClear = xpToClear(player.level)
  const mana = manaLevel(vitals.mana)
  const badges = (player.badges ?? []).length
  const single = (rank: number, piece: Piece): Part => ({ rank, versions: [[piece]] })
  const parts: (Part | null)[] = [
    single(0, { text: levelLine(player), bold: true, color: 'yellow' }),
    {
      rank: 2,
      versions: [[{ text: bar(player.xp / toClear), color: 'cyan' }, { text: `XP ${player.xp}/${toClear}` }]],
    },
    isExhausted(player)
      ? single(1, { text: 'Exhausted', bold: true, color: 'red' })
      : single(1, { text: `HP ${player.hp}/${player.maxHp}`, color: player.hp <= player.maxHp * LOW_HP ? 'red' : 'green' }),
    badges > 0 ? single(10, { text: `★${badges}`, color: 'yellow' }) : null,
    quest === null
      ? null
      : { rank: 3, versions: questVersions(quest).map(text => [{ text, bold: true, color: 'magenta' }]) },
    isUnderWay(bossFight)
      ? single(4, {
          text: bossFight.status === 'summoned' ? 'Boss approaching' : `Boss ${bossFight.hp}/${bossFight.maxHp} HP · /boss`,
          bold: true,
          color: 'red',
        })
      : null,
    questions.length > 0
      ? single(5, {
          text: `${questions.length} Question${questions.length === 1 ? '' : 's'} waiting · /sage`,
          bold: true,
          color: 'green',
        })
      : null,
    encounter === null ? null : single(6, { text: describeEncounter(encounter), dimColor: true }),
    {
      rank: 7,
      versions: [
        [
          { text: bar((vitals.mana ?? 0) / 100), color: MANA_COLOR[mana] },
          { text: vitals.mana === null ? 'Mana --' : `Mana ${vitals.mana}%`, color: MANA_COLOR[mana] },
          ...(mana === 'warning' ? [{ text: 'Compaction near', bold: true, color: 'red' }] : []),
        ],
      ],
    },
    vitals.model === null && vitals.spendUsd === null
      ? null
      : {
          rank: 8,
          versions: [
            [
              ...(vitals.model === null ? [] : [{ text: vitals.model, dimColor: true }]),
              ...(vitals.spendUsd === null ? [] : [{ text: `$${vitals.spendUsd.toFixed(2)}`, dimColor: true }]),
            ],
          ],
        },
    single(9, { text: statsLine(player), dimColor: true }),
  ]

  return parts.filter(part => part !== null)
}

/**
 * The HUD: its parts filled into at most three rows of the band's width. When
 * they do not all fit, the Quest's title shortens first, down to the ticket
 * alone; then the lesser parts give way: the Badge count, the Stats, the
 * model and spend, Mana, the Encounter, the Questions waiting, the boss.
 */
export function drawHud($: EngineInterface, e: RenderInput<'AbovePrompt'>, state: GameState) {
  const { Box, Text } = $.ui.resolve(e)
  const columns = Number.isFinite(e.props.bodyColumns) && e.props.bodyColumns > 0 ? e.props.bodyColumns : DEFAULT_COLUMNS
  const maxRows = Number.isFinite(e.props.maxRows) ? Math.max(1, Math.min(MAX_ROWS, e.props.maxRows)) : MAX_ROWS

  return (
    <Box flexDirection="column">
      {layOut(partsOf(state), columns, maxRows).map(row => (
        <Box flexDirection="row" gap={GAP}>
          {row.map(({ text, ...style }) => (
            <Text {...style} wrap="truncate-end">
              {text}
            </Text>
          ))}
        </Box>
      ))}
    </Box>
  )
}
