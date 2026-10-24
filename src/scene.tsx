// The Scene pane: the current Encounter, played. Where the surface draws SVG
// (the desktop, the editor, the phone) it is an animated 16-bit scene above
// one line telling the Encounter; in the terminal, that one line alone.

import type { EngineInterface, RenderInput } from 'claude-code'

import { isUnderWay } from './engine'
import type { BattleEncounter, BossFight, CheckKind, CraftingEncounter, Encounter } from './engine'
import { bossStartText, questionCountOf } from './boss'
import { briefingLine } from './briefing'
import { bossSceneSvg, MONSTERS, sceneSvg } from './scene-art'

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


/**
 * The XP an Encounter paid, after `before` (` · `, `, `): `+5 XP (Wisdom)`;
 * nothing when it paid none, its pool full.
 */
const paidXp = (xp: number | undefined, before: string, stat?: string): string =>
  xp === undefined || xp <= 0 ? '' : `${before}+${xp} XP${stat === undefined ? '' : ` (${stat})`}`

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
      return `Battle won: ${battle.check} all green${paidXp(battle.xp, ' · ', 'Strength')}`
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

  return `The blacksmith ${made}${paidXp(crafting.xp, ' · ')}`
}

/** The Boss Fight in one line: how it stands after the last answer, or how it ended. */
export const describeBossFight = (fight: BossFight): string => {
  const boss = `the boss of Quest ${fight.ticket}`
  const hp = `${fight.hp}/${fight.maxHp} HP`
  const last = fight.lastAnswer

  switch (fight.status) {
    case 'summoned':
      return `A boss approaches Quest ${fight.ticket}: its review Questions are being made`
    case 'fighting':
      if (last === null) {
        return `The boss of Quest ${fight.ticket} bars the way: ${bossStartText({ hp: fight.hp, questionCount: questionCountOf(fight) })} · /boss`
      }
      if (last.isCorrect && fight.hp === 0) {
        return `The boss of Quest ${fight.ticket} has fallen · finishing blows left: ${fight.questions.length} · /boss`
      }

      return last.isCorrect
        ? `A hit on ${boss} · ${hp} · /boss`
        : `The boss of Quest ${fight.ticket} strikes back${last.hpLost > 0 ? `: -${last.hpLost} HP` : ''} · ${hp} · /boss`
    case 'won':
      return `The boss of Quest ${fight.ticket} falls!${paidXp(fight.reward, ' ', 'Intelligence')}${fight.flawless === true ? ' · Flawless' : ''}${fight.trophy === undefined ? '' : ` · trophy: ${fight.trophy}`}`
    case 'lost':
      return `The boss of Quest ${fight.ticket} still stands, ${hp}: Quest closed without its reward`
    case 'skipped':
      return `Boss Fight skipped: Quest ${fight.ticket} closed without its reward`
    case 'unfought':
      return `No boss came for Quest ${fight.ticket}: Quest closed without a Boss Fight${paidXp(fight.reward, ' · ', 'Intelligence')}`
  }
}

/**
 * What the Scene plays: the Boss Fight while it is under way, whatever else
 * happens; once it has ended, until the next Encounter; else the Encounter.
 */
export const sceneOf = (
  encounter: Encounter | null,
  fight: BossFight | null,
): { kind: 'boss'; fight: BossFight } | { kind: 'encounter'; encounter: Encounter | null } =>
  fight !== null && (isUnderWay(fight) || encounter === null)
    ? { kind: 'boss', fight }
    : { kind: 'encounter', encounter }

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

  if (!encounter.isFirstVisit) {
    return where
  }

  // The read's XP, then the discovery's, which is Wisdom; an older mod's
  // Exploration has their sum alone.
  const discoveryXp = encounter.discoveryXp
  if (discoveryXp === undefined) {
    return `${where} · first visit${paidXp(encounter.xp, ', ')}`
  }
  const readXp = (encounter.xp ?? 0) - discoveryXp

  return `${where}${paidXp(readXp, ' · ')} · first visit${paidXp(discoveryXp, ', ', 'Wisdom')}`
}

/**
 * The Scene pane. `briefing` is the Quest Giver's Briefing of the active
 * Quest while it has no Encounter yet, else null: it then takes the line.
 */
export function drawScene(
  $: EngineInterface,
  e: RenderInput<'Pane'>,
  encounter: Encounter | null,
  fight: BossFight | null = null,
  briefing: string | null = null,
) {
  const elements = $.ui.resolve(e)
  const { Box, Text } = elements
  const shown = sceneOf(encounter, fight)
  // While the Quest has no Encounter yet, the Quest Giver's Briefing (its
  // first line) is what the Scene tells.
  const isBriefing = shown.kind === 'encounter' && briefing !== null
  const line =
    shown.kind === 'boss'
      ? describeBossFight(shown.fight)
      : isBriefing
        ? briefingLine(briefing)
        : describeScene(encounter)
  const isIdle = shown.kind === 'encounter' && encounter === null && !isBriefing

  // The terminal's table lists Svg too, as a fragment: it draws no SVG.
  if (e.surface === 'terminal' || !('Svg' in elements)) {
    return <Text dimColor={isIdle}>{line}</Text>
  }

  const { Svg } = elements
  const art = shown.kind === 'boss' ? bossSceneSvg(shown.fight, ART_WIDTH) : sceneSvg(encounter, ART_WIDTH)

  return (
    <Box flexDirection="column" gap={1}>
      <Svg source={art} alt={line} isInteractive />
      <Text dimColor={isIdle}>{line}</Text>
    </Box>
  )
}
