// The Scene pane: the current Encounter, played. Where the surface draws SVG
// (the desktop, the editor, the phone) it is an animated 16-bit scene above
// one line telling the Encounter; in the terminal, that one line alone.

import type { EngineInterface, RenderInput } from 'claude-code'

import { BATTLE_XP_PER_HP, CRAFTING_XP, DISCOVERY_XP } from './engine'
import type { BattleEncounter, CheckKind, CraftingEncounter, Encounter } from './engine'
import { MONSTERS, sceneSvg } from './scene-art'

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


const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`

/** What a check's failures are called: `3 failing`, `1 error`, `2 type errors`. */
const failuresNamed = (kind: CheckKind, count: number): string => {
  switch (kind) {
    case 'test':
      return `${count} failing`
    case 'lint':
      return plural(count, 'error')
    case 'typecheck':
      return plural(count, 'type error')
  }
}

/** A Battle in one line. */
export const describeBattle = (battle: BattleEncounter): string => {
  const monster = MONSTERS[battle.foe].name
  const hp = `${battle.hp}/${battle.maxHp} HP`

  switch (battle.outcome) {
    case 'spawned':
      return battle.isCounted
        ? `A ${monster} appears: ${battle.check}, ${failuresNamed(battle.foe, battle.hp)} · ${hp}`
        : `A ${monster} appears: ${battle.check} failed, its failures unread · ${hp}`
    case 'hit':
      return `${plural(battle.hits, 'hit')} on the ${monster}: ${battle.check} · ${hp}`
    case 'stands':
      return `The ${monster} stands: ${battle.check} · ${hp}`
    case 'grew':
      return `The ${monster} grows: ${battle.check} · ${hp}`
    case 'won':
      return `Battle won: ${battle.check} all green · +${BATTLE_XP_PER_HP * battle.maxHp} XP (Strength)`
  }
}

/**
 * A Crafting in one line: a new file is forged, a major edit reforges the
 * item; then the file, its Module and the lines it changed.
 */
export const describeCrafting = (crafting: CraftingEncounter): string => {
  const file = `${nameOf(crafting.target)} ${whereIn(crafting.module)}`
  const made = crafting.isNewFile
    ? `forges the ${crafting.item}: new file ${file}, ${plural(crafting.linesAdded, 'line')}`
    : `reforges the ${crafting.item}: ${file}, +${crafting.linesAdded} -${crafting.linesRemoved} lines`

  return `The blacksmith ${made} · +${CRAFTING_XP} XP`
}

/** The Encounter in one line, as the terminal shows it and the art's alt says. */
export const describeScene = (encounter: Encounter | null): string => {
  if (encounter === null) {
    return IDLE
  }

  if (encounter.kind === 'Battle') {
    return describeBattle(encounter)
  }

  if (encounter.kind === 'Crafting') {
    return describeCrafting(encounter)
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
