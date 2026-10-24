// The HUD band above the prompt: level, HP, XP bar, the active Quest, the
// Questions waiting and the current Encounter, and below them the session's
// vitals: Mana, the model and the spend.

import type { EngineInterface, RenderInput } from 'claude-code'

import { manaLevel, xpToClear } from './engine'
import type { Encounter, GameState, ManaLevel } from './engine'
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

export function drawHud(
  $: EngineInterface,
  e: RenderInput<'AbovePrompt'>,
  { player, encounter, vitals, quest, questions }: GameState,
) {
  const { Box, Text } = $.ui.resolve(e)
  const toClear = xpToClear(player.level)

  const mana = manaLevel(vitals.mana)

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" gap={2}>
        <Text bold color="yellow">
          Lv {player.level}
        </Text>
        <Text color="cyan">{bar(player.xp / toClear)}</Text>
        <Text>
          XP {player.xp}/{toClear}
        </Text>
        <Text color={player.hp <= player.maxHp * LOW_HP ? 'red' : 'green'}>
          HP {player.hp}/{player.maxHp}
        </Text>
        {quest !== null && (
          <Text bold color="magenta">
            Quest {quest.ticket}
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
    </Box>
  )
}
