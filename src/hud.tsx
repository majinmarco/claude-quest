// The HUD band above the prompt: level and title, XP bar, HP (or Exhausted),
// the Badges earned, the active Quest, its Boss Fight under way, the
// Questions waiting and the current Encounter, then the session's vitals
// (Mana, the model and the spend) and the MVP Stats, dim: filled into at
// most three rows of the band's width, the lesser parts giving way. Where
// the surface draws SVG and the Player keeps the pixel style, the same parts
// are drawn as one pixel strip (src/hud-art.ts) instead.

import type { EngineInterface, RenderInput } from 'claude-code'

import { BADGES, isExhausted, isUnderWay, manaLevel, titleOf, xpToClear } from './engine'
import type { Encounter, GameState, ManaLevel, Player } from './engine'
import { hudStrip, PIXELS_PER_COLUMN, portraitOf, STRIP_HEIGHT, stripWidth } from './hud-art'
import type { StripMotion, StripSegment } from './hud-art'
import { MONSTERS } from './scene-art'
import type { HudStyle } from './settings'
import type { SpriteName } from './sprites'

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

/** The sprite an Encounter is drawn with on the strip: the monster, the anvil or a chest. */
const encounterSprite = (encounter: Encounter): SpriteName => {
  if (encounter.kind === 'Battle') {
    return MONSTERS[encounter.foe].sprite
  }

  return encounter.kind === 'Crafting' ? 'anvil' : 'chest'
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
 * when the band is too narrow, the part ranked last gives way first. `art`
 * is the same part as the pixel strip draws it, its versions longest first.
 */
type Part = { rank: number; versions: Piece[][]; art: StripSegment[] }

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
  const isLowHp = player.hp <= player.maxHp * LOW_HP
  const single = (rank: number, piece: Piece, art: StripSegment): Part => ({ rank, versions: [[piece]], art: [art] })
  const parts: (Part | null)[] = [
    single(0, { text: levelLine(player), bold: true, color: 'yellow' }, { kind: 'level', portrait: portraitOf(player), text: levelLine(player) }),
    {
      rank: 2,
      versions: [[{ text: bar(player.xp / toClear), color: 'cyan' }, { text: `XP ${player.xp}/${toClear}` }]],
      art: [{ kind: 'xp', xp: player.xp, toClear }],
    },
    single(
      1,
      isExhausted(player)
        ? { text: 'Exhausted', bold: true, color: 'red' }
        : { text: `HP ${player.hp}/${player.maxHp}`, color: isLowHp ? 'red' : 'green' },
      { kind: 'hp', hp: isExhausted(player) ? 0 : player.hp, maxHp: player.maxHp, isLow: isLowHp },
    ),
    badges > 0 ? single(10, { text: `★${badges}`, color: 'yellow' }, { kind: 'badges', count: badges }) : null,
    quest === null
      ? null
      : {
          rank: 3,
          versions: questVersions(quest).map(text => [{ text, bold: true, color: 'magenta' }]),
          // The banner says `#6 Jira Quest…`: the text's versions, `Quest ` left out.
          art: questVersions(quest).map(text => ({
            kind: 'quest',
            ticket: quest.ticket,
            title: text.slice(`Quest ${quest.ticket}`.length).trim(),
          })),
        },
    isUnderWay(bossFight)
      ? single(
          4,
          {
            text: bossFight.status === 'summoned' ? 'Boss approaching' : `Boss ${bossFight.hp}/${bossFight.maxHp} HP · /boss`,
            bold: true,
            color: 'red',
          },
          { kind: 'boss', isApproaching: bossFight.status === 'summoned', hp: bossFight.hp, maxHp: bossFight.maxHp },
        )
      : null,
    questions.length > 0
      ? single(
          5,
          {
            text: `${questions.length} Question${questions.length === 1 ? '' : 's'} waiting · /sage`,
            bold: true,
            color: 'green',
          },
          { kind: 'questions', count: questions.length },
        )
      : null,
    encounter === null
      ? null
      : single(
          6,
          { text: describeEncounter(encounter), dimColor: true },
          { kind: 'encounter', sprite: encounterSprite(encounter), text: describeEncounter(encounter) },
        ),
    {
      rank: 7,
      versions: [
        [
          { text: bar((vitals.mana ?? 0) / 100), color: MANA_COLOR[mana] },
          { text: vitals.mana === null ? 'Mana --' : `Mana ${vitals.mana}%`, color: MANA_COLOR[mana] },
          ...(mana === 'warning' ? [{ text: 'Compaction near', bold: true, color: 'red' }] : []),
        ],
      ],
      art: [{ kind: 'mana', mana: vitals.mana, level: mana }],
    },
    vitals.model === null && vitals.spendUsd === null
      ? null
      : (() => {
          const pieces = [
            ...(vitals.model === null ? [] : [{ text: vitals.model, dimColor: true }]),
            ...(vitals.spendUsd === null ? [] : [{ text: `$${vitals.spendUsd.toFixed(2)}`, dimColor: true }]),
          ]

          return { rank: 8, versions: [pieces], art: [{ kind: 'vitals', text: pieces.map(piece => piece.text).join(' ') }] }
        })(),
    single(9, { text: statsLine(player), dimColor: true }, { kind: 'stats', text: statsLine(player) }),
  ]

  return parts.filter(part => part !== null)
}

/** The order the strip draws its segments in, left to right. */
const STRIP_ORDER: StripSegment['kind'][] = [
  'level',
  'hp',
  'xp',
  'badges',
  'quest',
  'boss',
  'questions',
  'encounter',
  'mana',
  'vitals',
  'stats',
]

/**
 * The strip's segments for a band `room` strip pixels wide, as the text rows
 * choose theirs but strictly by rank: each part's shortest version until one
 * does not fit (level, HP and XP always shown), then each its longest that
 * still fits; in strip order.
 */
const layOutStrip = (parts: Part[], room: number): StripSegment[] => {
  const chosen = new Map<Part, StripSegment>()
  const inOrder = () =>
    [...chosen.values()].sort((a, b) => STRIP_ORDER.indexOf(a.kind) - STRIP_ORDER.indexOf(b.kind))
  const fitsWith = (part: Part, version: StripSegment): boolean => {
    const before = chosen.get(part)
    chosen.set(part, version)
    const fits = stripWidth(inOrder()) <= room
    if (before === undefined) {
      chosen.delete(part)
    } else {
      chosen.set(part, before)
    }

    return fits
  }
  const byRank = [...parts].sort((a, b) => a.rank - b.rank)
  for (const part of byRank) {
    const shortest = part.art.at(-1)
    if (shortest === undefined || (part.rank > LAST_ALWAYS_SHOWN && !fitsWith(part, shortest))) {
      // One row: the first part that does not fit ends it, so none lesser shows in its place.
      break
    }
    chosen.set(part, shortest)
  }
  for (const part of byRank) {
    const longest = chosen.has(part) ? part.art.find(version => fitsWith(part, version)) : undefined
    if (longest !== undefined) {
      chosen.set(part, longest)
    }
  }

  return inOrder()
}

/** The strip's segments for `state` in a band `columns` wide, in the order drawn. */
export const stripOf = (state: GameState, columns: number): StripSegment[] =>
  layOutStrip(partsOf(state), columns * PIXELS_PER_COLUMN)

/** What a surface last drew of the Player, to tell a loss of HP or a gain of XP since. */
type Drawn = { level: number; hp: number; totalXp: number; xpShare: number }

/** The motion a draw plays: HP lost, or XP gained, since `before`. */
const motionOf = (before: Drawn | undefined, player: Player): StripMotion => {
  if (before === undefined) {
    return { isHpLost: false, xpFrom: null }
  }
  const isXpGained = player.totalXp > before.totalXp

  return {
    isHpLost: player.hp < before.hp,
    xpFrom: isXpGained ? (player.level === before.level ? before.xpShare : 0) : null,
  }
}

/** What each surface drew last, so the next draw knows what changed. */
const lastDrawn = new Map<string, Drawn>()

/**
 * The HUD: its parts filled into at most three rows of the band's width. When
 * they do not all fit, the Quest's title shortens first, down to the ticket
 * alone; then the lesser parts give way: the Badge count, the Stats, the
 * model and spend, Mana, the Encounter, the Questions waiting, the boss.
 *
 * Where the surface draws SVG and `hudStyle` is pixel, the same parts are one
 * pixel strip 48 px tall instead, its alt the text's first row.
 */
export function drawHud($: EngineInterface, e: RenderInput<'AbovePrompt'>, state: GameState, hudStyle: HudStyle = 'pixel') {
  const elements = $.ui.resolve(e)
  const { Box, Text } = elements
  const columns = Number.isFinite(e.props.bodyColumns) && e.props.bodyColumns > 0 ? e.props.bodyColumns : DEFAULT_COLUMNS
  const maxRows = Number.isFinite(e.props.maxRows) ? Math.max(1, Math.min(MAX_ROWS, e.props.maxRows)) : MAX_ROWS
  const parts = partsOf(state)
  const rows = layOut(parts, columns, maxRows)

  // The terminal's table lists Svg too, as a fragment: it draws no SVG.
  if (hudStyle === 'pixel' && e.surface !== 'terminal' && 'Svg' in elements) {
    const { Svg } = elements
    const room = columns * PIXELS_PER_COLUMN
    const { player } = state
    const motion = motionOf(lastDrawn.get(e.surface), player)
    lastDrawn.set(e.surface, { level: player.level, hp: player.hp, totalXp: player.totalXp, xpShare: player.xp / xpToClear(player.level) })
    const strip = hudStrip(layOutStrip(parts, room), room, motion)

    return (
      <Svg
        source={strip.svg}
        alt={(rows[0] ?? []).map(piece => piece.text).join(' '.repeat(GAP))}
        width={strip.width}
        height={STRIP_HEIGHT}
        isInteractive
      />
    )
  }

  return (
    <Box flexDirection="column">
      {rows.map(row => (
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
