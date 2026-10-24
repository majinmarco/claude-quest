// The HUD band above the prompt: level and title, XP bar, HP (or Exhausted),
// the Badges earned, the active Quest, its Boss Fight under way, the
// Questions waiting and the current Encounter; below them the session's
// vitals (Mana, the model and the spend), then the MVP Stats, dim.

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

export function drawHud(
  $: EngineInterface,
  e: RenderInput<'AbovePrompt'>,
  { player, encounter, vitals, quest, questions, bossFight }: GameState,
) {
  const { Box, Text } = $.ui.resolve(e)
  const toClear = xpToClear(player.level)

  const mana = manaLevel(vitals.mana)

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" gap={2}>
        <Text bold color="yellow">
          {levelLine(player)}
        </Text>
        <Text color="cyan">{bar(player.xp / toClear)}</Text>
        <Text>
          XP {player.xp}/{toClear}
        </Text>
        {isExhausted(player) ? (
          <Text bold color="red">
            Exhausted
          </Text>
        ) : (
          <Text color={player.hp <= player.maxHp * LOW_HP ? 'red' : 'green'}>
            HP {player.hp}/{player.maxHp}
          </Text>
        )}
        {(player.badges ?? []).length > 0 && <Text color="yellow">★{player.badges?.length}</Text>}
        {quest !== null && (
          <Text bold color="magenta">
            Quest {quest.ticket}
          </Text>
        )}
        {isUnderWay(bossFight) && (
          <Text bold color="red">
            {bossFight.status === 'summoned'
              ? 'Boss approaching'
              : `Boss ${bossFight.hp}/${bossFight.maxHp} HP · /boss`}
          </Text>
        )}
        {questions.length > 0 && (
          <Text bold color="green">
            {`${questions.length} Question${questions.length === 1 ? '' : 's'} waiting · /sage`}
          </Text>
        )}
        {encounter !== null && <Text dimColor>{describeEncounter(encounter)}</Text>}
      </Box>
      <Box flexDirection="row" gap={2}>
        <Text color={MANA_COLOR[mana]}>{bar((vitals.mana ?? 0) / 100)}</Text>
        <Text color={MANA_COLOR[mana]}>
          {vitals.mana === null ? 'Mana --' : `Mana ${vitals.mana}%`}
        </Text>
        {mana === 'warning' && (
          <Text bold color="red">
            Compaction near
          </Text>
        )}
        {vitals.model !== null && <Text dimColor>{vitals.model}</Text>}
        {vitals.spendUsd !== null && (
          <Text dimColor>${vitals.spendUsd.toFixed(2)}</Text>
        )}
      </Box>
      <Text dimColor>{statsLine(player)}</Text>
    </Box>
  )
}
