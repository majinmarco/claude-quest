// The HUD band above the prompt: level, XP bar and the current Encounter, and
// below them the session's vitals: Mana, the model and the spend.

import type { EngineInterface, RenderInput } from 'claude-code'

import { manaLevel, xpToClear } from './engine'
import type { Encounter, GameState, ManaLevel } from './engine'

const BAR_CELLS = 10

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
  const name = encounter.target.split(/[\\/]/).filter(Boolean).pop() ?? '.'

  return `Exploring ${name}`
}

export function drawHud(
  $: EngineInterface,
  e: RenderInput<'AbovePrompt'>,
  { player, encounter, vitals }: GameState,
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
