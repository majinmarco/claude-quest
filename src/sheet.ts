// The Player's character sheet, the Overview's first part, as rows of text:
// level and Title, XP to the next level, all six Stats (those not yet in play
// dimmed), every Badge with whether it is earned, the Trophies by Region and
// the tally. The Overview pane draws the rows (beside the portrait where the
// surface draws SVG); `/badges` prints them.

import { BADGES, isInPlay, titleOf, xpToClear } from './engine'
import type { Player } from './engine'
import { STAT_ABBREVIATION } from './scroll-art'
import type { BadgeId, StatName } from '../types'

/** A row of the sheet: its text, and how it is drawn. */
export type SheetRow = { text: string; dimColor?: boolean; color?: string; bold?: boolean }

/** The six Stats, in the order the sheet lists them, with their names. */
const STATS: [StatName, string][] = [
  ['intelligence', 'Intelligence'],
  ['wisdom', 'Wisdom'],
  ['dexterity', 'Dexterity'],
  ['strength', 'Strength'],
  ['charisma', 'Charisma'],
  ['constitution', 'Constitution'],
]

/** What a Stat not yet in play says after its value. */
export const NOT_IN_PLAY = 'not yet in play'

/** The cells of the XP bar. */
const BAR_CELLS = 10

/** What the Trophies of no known Region are listed under. */
const UNKNOWN_REGION = 'Region unknown'

/** `share` of BAR_CELLS filled: `▰▰▰▱▱▱▱▱▱▱`. */
const bar = (share: number): string => {
  const filled = Math.max(0, Math.min(BAR_CELLS, Math.floor(share * BAR_CELLS)))

  return '▰'.repeat(filled) + '▱'.repeat(BAR_CELLS - filled)
}

/** The Player's level and title: `Lv 4 Scholar`, `Lv 2`. */
const levelOf = (player: Player): string => {
  const title = titleOf(player)

  return title === null ? `Lv ${player.level}` : `Lv ${player.level} ${title}`
}

/** The Trophies, grouped by their Region in the order first won: `vault: #12, #14`. */
const trophiesByRegion = (player: Player): [string, string[]][] => {
  const groups = new Map<string, string[]>()
  for (const trophy of player.trophies ?? []) {
    const region = trophy.region ?? UNKNOWN_REGION
    groups.set(region, [...(groups.get(region) ?? []), trophy.ticket])
  }

  return [...groups]
}

/** The sheet's rows, top to bottom. */
export const sheetRows = (player: Player): SheetRow[] => {
  const toClear = xpToClear(player.level)
  const held = new Set((player.badges ?? []).map(badge => badge.id))
  const ids = Object.keys(BADGES) as BadgeId[]
  const trophies = player.trophies ?? []
  const { tally } = player

  return [
    { text: `${levelOf(player)} · ${player.totalXp} XP lifetime`, bold: true },
    { text: `XP ${player.xp}/${toClear} to Lv ${player.level + 1} ${bar(player.xp / toClear)}`, color: 'yellow' },
    { text: 'Stats', bold: true },
    ...STATS.map(([stat, name]): SheetRow => {
      const line = `  ${STAT_ABBREVIATION[stat]} ${name} ${player.stats[stat]}`

      return isInPlay(stat) ? { text: line } : { text: `${line} · ${NOT_IN_PLAY}`, dimColor: true }
    }),
    { text: `Badges (${held.size}/${ids.length})`, bold: true },
    ...ids.map((id): SheetRow => (held.has(id) ? { text: `  ★ ${BADGES[id]}`, color: 'yellow' } : { text: `  ☆ ${BADGES[id]}`, dimColor: true })),
    trophies.length === 0
      ? { text: "Trophies (0): none yet. Win a Boss Fight to earn its Quest's.", bold: true }
      : { text: `Trophies (${trophies.length})`, bold: true },
    ...trophiesByRegion(player).map(([region, tickets]): SheetRow => ({ text: `  ${region}: ${tickets.join(', ')}` })),
    {
      text: `Quests closed ${tally.questsClosed} · Bosses won ${tally.bossesWon} · Boss streak ${tally.bossStreak} · Modules discovered ${tally.modulesDiscovered}`,
      dimColor: true,
    },
  ]
}

/** The sheet as text, a row a line: what `/badges` prints. */
export const sheetText = (player: Player): string => sheetRows(player).map(row => row.text).join('\n')
