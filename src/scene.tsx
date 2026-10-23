// The Scene pane: the current Encounter, played. Where the surface draws SVG
// (the desktop, the editor, the phone) it is an animated 16-bit scene above
// one line telling the Encounter; in the terminal, that one line alone.

import type { EngineInterface, RenderInput } from 'claude-code'

import { DISCOVERY_XP } from './engine'
import type { Encounter } from './engine'
import { sceneSvg } from './scene-art'

/** How wide the scene is drawn, in CSS pixels: its 128 pixels at 3x. */
const ART_WIDTH = 384

const IDLE = 'No Encounter yet: the Scene wakes as Claude reads the code.'

const nameOf = (path: string): string => path.split(/[\\/]/).filter(Boolean).pop() ?? '.'

const whereIn = (module: string | null): string => {
  if (module === null) {
    return 'outside the project'
  }

  return module === '.' ? 'in the project root' : `in ${module}`
}

/** The Encounter in one line, as the terminal shows it and the art's alt says. */
export const describeScene = (encounter: Encounter | null): string => {
  if (encounter === null) {
    return IDLE
  }

  const where = `Exploring ${nameOf(encounter.target)} ${whereIn(encounter.module)}`

  return encounter.isFirstVisit ? `${where} · first visit, +${DISCOVERY_XP} XP (Wisdom)` : where
}

export function drawScene(
  $: EngineInterface,
  e: RenderInput<'Pane'>,
  encounter: Encounter | null,
) {
  const elements = $.ui.resolve(e)
  const { Box, Text } = elements
  const line = describeScene(encounter)

  if (!('Svg' in elements)) {
    return <Text dimColor={encounter === null}>{line}</Text>
  }

  const { Svg } = elements

  return (
    <Box flexDirection="column" gap={1}>
      <Svg source={sceneSvg(encounter, ART_WIDTH)} alt={line} isInteractive />
      <Text dimColor={encounter === null}>{line}</Text>
    </Box>
  )
}
