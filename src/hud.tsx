// The HUD band above the prompt: level, XP bar and the current Encounter.

import type { EngineInterface, RenderInput } from 'claude-code'

import { xpToClear } from './engine'
import type { Encounter, GameState } from './engine'

const BAR_CELLS = 10

const xpBar = (xp: number, toClear: number): string => {
  const filled = Math.min(BAR_CELLS, Math.floor((xp / toClear) * BAR_CELLS))

  return '▰'.repeat(filled) + '▱'.repeat(BAR_CELLS - filled)
}

const describeEncounter = (encounter: Encounter): string => {
  const name = encounter.target.split(/[\\/]/).filter(Boolean).pop() ?? '.'

  return `Exploring ${name}`
}

export function drawHud(
  $: EngineInterface,
  e: RenderInput<'AbovePrompt'>,
  { player, encounter }: GameState,
) {
  const { Box, Text } = $.ui.resolve(e)
  const toClear = xpToClear(player.level)

  return (
    <Box flexDirection="row" gap={2}>
      <Text bold color="yellow">
        Lv {player.level}
      </Text>
      <Text color="cyan">{xpBar(player.xp, toClear)}</Text>
      <Text>
        XP {player.xp}/{toClear}
      </Text>
      {encounter !== null && <Text dimColor>{describeEncounter(encounter)}</Text>}
    </Box>
  )
}
