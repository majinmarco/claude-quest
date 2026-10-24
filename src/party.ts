// The party: the subagents Claude sends out during a Quest, each a companion
// setting out and coming back. A companion pays no XP of its own (spawning
// agents is Claude's activity, and paying for it would be a farm: ADR 0002);
// what its loop does (reads, Crafting, Battles) plays and pays as any other
// work does, and is counted for the toast it comes back with.

import type { Companion, Party, PartyBeat } from '../types'
import type { Effect } from './engine'

export type { Companion, Party, PartyBeat } from '../types'

export const emptyParty = (): Party => ({ companions: [], beat: null })

/** The most of a description the party keeps, in characters. */
const DESCRIPTION_CHARS = 60

/** A spawn's description as the party names its companion: trimmed, cut, `A companion` when it has none. */
const describe = (description: string): string => {
  const shown = description.trim().replace(/\s+/g, ' ')
  if (shown === '') {
    return 'A companion'
  }

  return shown.length <= DESCRIPTION_CHARS ? shown : `${shown.slice(0, DESCRIPTION_CHARS - 1).trimEnd()}…`
}

/**
 * A companion sets out: subagent `agentId`, spawned during a Quest. One
 * already out under that id (a resumed run) is not added twice.
 */
export const setOut = (party: Party, agentId: string, description: string): Party => {
  if (party.companions.some(companion => companion.agentId === agentId)) {
    return party
  }
  const named = describe(description)

  return {
    companions: [...party.companions, { agentId, description: named, read: 0, forged: 0, battlesWon: 0 }],
    beat: { kind: 'out', description: named },
  }
}

/**
 * The party with the effects of an event played in `agentId`'s loop counted
 * on its companion: an Exploration a read, a Crafting forged, a Battle won.
 * Any Encounter played ends the Scene's beat.
 */
export const tally = (party: Party, agentId: string | undefined, effects: readonly Effect[]): Party => {
  const started = effects.flatMap(effect => (effect.type === 'ENCOUNTER_STARTED' ? [effect.encounter] : []))
  const isEncounter = started.length > 0 || effects.some(effect => effect.type === 'ENCOUNTER_UPDATED')
  const beat = isEncounter ? null : party.beat
  if (agentId === undefined || !party.companions.some(companion => companion.agentId === agentId)) {
    return beat === party.beat ? party : { ...party, beat }
  }

  const read = started.filter(encounter => encounter.kind === 'Exploration').length
  const forged = started.filter(encounter => encounter.kind === 'Crafting').length
  const battlesWon = effects.filter(effect => effect.type === 'BATTLE_WON').length

  return {
    beat,
    companions: party.companions.map(companion =>
      companion.agentId === agentId
        ? { ...companion, read: companion.read + read, forged: companion.forged + forged, battlesWon: companion.battlesWon + battlesWon }
        : companion,
    ),
  }
}

/** A companion comes back: its loop's turn ended. The party without it, and it; null when it was not out. */
export const comeBack = (party: Party, agentId: string): { party: Party; companion: Companion | null } => {
  const companion = party.companions.find(each => each.agentId === agentId) ?? null

  return companion === null
    ? { party, companion }
    : { party: { ...party, companions: party.companions.filter(each => each !== companion) }, companion }
}

/**
 * The companions still out when a session starts: those whose agent is still
 * running (`$.agent.list()`'s ids). One that never ended its turn (killed,
 * its session ended) quietly leaves the party.
 */
export const stillOut = (party: Party, running: ReadonlySet<string>): Party => ({
  companions: party.companions.filter(companion => running.has(companion.agentId)),
  beat: null,
})

const counted = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`

/** The toast of a companion back: `Implement #22: back. 12 read, 3 forged, 1 Battle won`. */
export const backText = (companion: Companion): string =>
  `${companion.description}: back. ${companion.read} read, ${companion.forged} forged, ${counted(companion.battlesWon, 'Battle won', 'Battles won')}`

/** The HUD's part for the party: `Party: 2 out`. */
export const partyLine = (out: number): string => `Party: ${out} out`

/** The Scene's line for a companion setting out. */
export const setOutText = (beat: PartyBeat): string => `A companion sets out: ${beat.description}`
