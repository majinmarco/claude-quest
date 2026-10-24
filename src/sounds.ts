// Sound cues: a short clip of the mod's own (assets/sounds/, CC0) for each
// game event, played through $.audio.play. Sound is decoration: it never pays,
// gates or waits for anything (ADR 0002), and a clip that cannot play is
// skipped, its cause logged once.

import type { AudioClip, EngineInterface, PlayOptions } from 'claude-code'

import type { Effect } from './engine'

/** A Sound cue: the name of its clip, `assets/sounds/<cue>.mp3`. */
export type Cue =
  | 'quest-start'
  | 'discover'
  | 'forge'
  | 'monster'
  | 'monster-ghost'
  | 'monster-slime'
  | 'hit'
  | 'battle-won'
  | 'sparkle'
  | 'scroll'
  | 'map'
  | 'right'
  | 'wrong'
  | 'tick'
  | 'chime'
  | 'fizzle'
  | 'boss'
  | 'boss-hit'
  | 'boss-fallen'
  | 'fanfare'
  | 'defeat'
  | 'level-up'
  | 'badge'
  | 'exhausted'
  | 'heal'
  | 'campfire'
  | 'ui'

/**
 * A Rest beginning or ending (#26): the engine effects the Rest Encounter is
 * to add. Typed here so the campfire is wired today; they join Effect then.
 */
export type RestSignal = { type: 'REST_STARTED' } | { type: 'REST_ENDED' }

/** What a cue may be asked for: an engine effect, or a Rest signal. */
export type CueInput = Effect | RestSignal

/** How the Player stands after the step that made the effect: an HP_LOST to 0 is Exhausted. */
export type CueContext = { hp: number }

/**
 * The cue an effect plays, or null for one that plays none (plain reads,
 * XP_CAPPED, toasts as such, a Quest closing unfought). Pure.
 *
 * `after` is the Player after the step: an HP_LOST that left them at 0 HP
 * plays the Exhausted heartbeat; any other plays nothing (the wrong answer
 * that cost it has its own cue).
 */
export const cueFor = (effect: CueInput, after?: CueContext): Cue | null => {
  switch (effect.type) {
    case 'QUEST_STARTED':
      return 'quest-start'
    case 'MODULE_DISCOVERED':
      return 'discover'
    case 'ENCOUNTER_STARTED': {
      const { encounter } = effect
      if (encounter.kind === 'Crafting') {
        return 'forge'
      }
      if (encounter.kind === 'Battle' && encounter.outcome === 'spawned') {
        return encounter.foe === 'typecheck' ? 'monster-ghost' : encounter.foe === 'lint' ? 'monster-slime' : 'monster'
      }

      return null
    }
    case 'MONSTER_HIT':
      return 'hit'
    case 'BATTLE_WON':
      return 'battle-won'
    case 'QUESTION_QUEUED':
      return effect.npc === 'quest-giver' ? 'scroll' : effect.npc === 'cartographer' ? 'map' : 'sparkle'
    case 'QUESTION_ANSWERED':
      return effect.answer.isCorrect ? 'right' : 'wrong'
    case 'HP_LOST':
      return after !== undefined && after.hp <= 0 ? 'exhausted' : null
    case 'HP_HEALED':
      return 'heal'
    case 'LEVEL_UP':
      return 'level-up'
    case 'BOSS_FIGHT_SUMMONED':
      return 'boss'
    case 'BOSS_HIT':
      return effect.hp <= 0 ? 'boss-fallen' : 'boss-hit'
    case 'BADGE_EARNED':
    case 'TROPHY_EARNED':
      return 'badge'
    case 'QUEST_CLOSED':
      return effect.outcome === 'won' ? 'fanfare' : effect.outcome === 'lost' ? 'defeat' : null
    case 'PROPHECY_ARMED':
      return 'tick'
    case 'PROPHECY_SETTLED':
      return effect.isRight ? 'chime' : 'fizzle'
    case 'REST_STARTED':
      return 'campfire'
    default:
      return null
  }
}

/**
 * Cues a louder cue of the same step tells: a heal under a level-up, a new
 * Quest or a Boss Fight won (each heals fully); a right answer under the
 * boss's hit or fall; a monster's last hit under the Battle won.
 */
const TOLD_BY: Partial<Record<Cue, readonly Cue[]>> = {
  heal: ['level-up', 'quest-start', 'fanfare'],
  right: ['boss-hit', 'boss-fallen'],
  hit: ['battle-won'],
}

/**
 * The cues one step's effects play, each once, in the order the effects
 * came; one a louder cue of the step already tells is left out (TOLD_BY).
 */
export const cuesFor = (effects: readonly CueInput[], after?: CueContext): Cue[] => {
  const cues = [...new Set(effects.map(effect => cueFor(effect, after)).filter(cue => cue !== null))]

  return cues.filter(cue => !(TOLD_BY[cue] ?? []).some(louder => cues.includes(louder)))
}

/** What a Game Screen act plays: the click, on opening it and on switching its View (#24). */
export type UiAct = 'game-screen-opened' | 'view-switched'

/** The cue each Game Screen act plays: both the tiny click. */
export const UI_CUES: Record<UiAct, Cue> = { 'game-screen-opened': 'ui', 'view-switched': 'ui' }

/** The `soundVolume` setting's default, 0 to 100. */
export const DEFAULT_SOUND_VOLUME = 60

/** The gain at volume 100: a little over the clips' own loudness. */
const MAX_GAIN = 1.2

/** The gain `$.audio.play` is given at `volume` (0 to 100): 0 to 1.2, in line. */
export const gainOf = (volume: number): number => (Math.min(100, Math.max(0, volume)) / 100) * MAX_GAIN

/** The campfire's gain, beside the volume's: a bed under the other cues. */
const CAMPFIRE_GAIN = 0.35

/** Where a cue's clip is, in the mod's folder. */
export const assetOf = (cue: Cue): string => `assets/sounds/${cue}.mp3`

/**
 * Each cue's priority under the rate rule, 0 the highest: tier 0 is never
 * dropped; then answers, Battle and Boss cues and the like; then the quieter
 * notices; the UI click last.
 */
const TIER: Record<Exclude<Cue, 'campfire'>, 0 | 1 | 2 | 3> = {
  boss: 0,
  fanfare: 0,
  'level-up': 0,
  defeat: 0,
  badge: 0,
  right: 1,
  wrong: 1,
  monster: 1,
  'monster-ghost': 1,
  'monster-slime': 1,
  hit: 1,
  'battle-won': 1,
  'boss-hit': 1,
  'boss-fallen': 1,
  'quest-start': 1,
  exhausted: 1,
  heal: 1,
  chime: 1,
  fizzle: 1,
  discover: 2,
  forge: 2,
  sparkle: 2,
  scroll: 2,
  map: 2,
  tick: 2,
  ui: 3,
}

/** At most this many cues start in any WINDOW_MS (tier 0 past it); the campfire is not counted. */
const MAX_IN_WINDOW = 6
const WINDOW_MS = 10_000

/** At most one hit a second: the hits of one run coalesce. */
const HIT_MS = 1000

/** A clip that never settles stops counting as playing after this long. */
const LONGEST_CUE_MS = 10_000

/** What the mixer plays through: `$.audio.play`, and where a cause is logged. */
export type Speaker = {
  play: (clip: AudioClip, options?: PlayOptions) => Promise<void>
  log: (text: string) => void
}

/** The session's mixer: what plays, what played lately, the causes told. */
export type Mixer = {
  /** Plays `cues` at `now` (ms) under the rules; returns the cues started. */
  play: (speaker: Speaker, cues: readonly Cue[], now: number) => Cue[]
  /** Stops the campfire loop, if it burns. */
  stopCampfire: () => void
}

/** A cause without the clip it named, so one cause is told once whatever clip met it. */
const causeOf = (error: unknown, asset: string): string =>
  (error instanceof Error ? error.message : String(error)).split(asset).join('<clip>')

/** A mixer at `volume` (0 to 100); at 0 it plays nothing. */
export const newMixer = (volume: number): Mixer => {
  const gain = gainOf(volume)
  const playing = new Map<Cue, number>()
  let started: number[] = []
  let lastHit = Number.NEGATIVE_INFINITY
  let campfire: AbortController | null = null
  const told = new Set<string>()

  const start = (speaker: Speaker, cue: Cue, options: PlayOptions): void => {
    const asset = assetOf(cue)
    let done: Promise<void>
    try {
      done = speaker.play({ asset }, options)
    } catch (error) {
      done = Promise.reject(error)
    }
    done
      .catch(error => {
        const cause = causeOf(error, asset)
        if (!told.has(cause)) {
          told.add(cause)
          speaker.log(`A Sound cue was skipped: ${cause}`)
        }
      })
      .finally(() => {
        if (cue === 'campfire') {
          if (campfire?.signal === options.signal) {
            campfire = null
          }
        } else {
          playing.delete(cue)
        }
      })
  }

  return {
    play: (speaker, cues, now) => {
      if (gain <= 0) {
        return []
      }
      started = started.filter(at => now - at < WINDOW_MS)
      const played: Cue[] = []

      if (cues.includes('campfire') && campfire === null) {
        campfire = new AbortController()
        start(speaker, 'campfire', { shouldLoop: true, gain: gain * CAMPFIRE_GAIN, signal: campfire.signal })
        played.push('campfire')
      }

      const ranked = cues
        .filter((cue): cue is Exclude<Cue, 'campfire'> => cue !== 'campfire')
        .map((cue, index) => ({ cue, index }))
        .sort((a, b) => TIER[a.cue] - TIER[b.cue] || a.index - b.index)
      for (const { cue } of ranked) {
        const since = playing.get(cue)
        if (since !== undefined && now - since < LONGEST_CUE_MS) {
          continue
        }
        if (cue === 'hit' && now - lastHit < HIT_MS) {
          continue
        }
        if (TIER[cue] > 0 && started.length >= MAX_IN_WINDOW) {
          continue
        }
        playing.set(cue, now)
        started.push(now)
        if (cue === 'hit') {
          lastHit = now
        }
        start(speaker, cue, { gain })
        played.push(cue)
      }

      return played
    },
    stopCampfire: () => {
      campfire?.abort()
      campfire = null
    },
  }
}

/**
 * The session's mixer, at the `soundVolume` the mod was loaded with. A
 * reload of the mod (a change in /config among them) makes a new one; the
 * old one's campfire is put out first.
 */
let mixer: Mixer = newMixer(DEFAULT_SOUND_VOLUME)

/** Sets the session's volume (register does, from the setting): a new mixer, the old one's campfire put out. */
export const setSoundVolume = (volume: number): void => {
  mixer.stopCampfire()
  mixer = newMixer(volume)
}

/**
 * Plays `cues` through the session's mixer, never waiting for a clip and
 * never failing: what cannot play is skipped. Headless, with no surface
 * attached (`claude -p`), nothing plays.
 */
async function mix($: EngineInterface, cues: readonly Cue[]): Promise<void> {
  try {
    if (cues.length === 0) {
      return
    }
    const surfaces = await $.session.surfaces().catch(() => [])
    if (surfaces.length === 0) {
      return
    }
    const speaker: Speaker = {
      play: (clip, options) => $.audio.play(clip, options),
      log: text => $.ui.log(text, { to: 'debug' }),
    }
    mixer.play(speaker, cues, await $.clock.now())
  } catch {
    // Sound is decoration: nothing it meets reaches the game.
  }
}

/**
 * Plays the cues of one step's effects. `after` is the Player after the
 * step (the Exhausted heartbeat). A Rest ending puts the campfire out.
 */
export async function playCues($: EngineInterface, effects: readonly CueInput[], after?: CueContext): Promise<void> {
  if (effects.some(effect => effect.type === 'REST_ENDED')) {
    mixer.stopCampfire()
  }
  await mix($, cuesFor(effects, after))
}

/** Plays the click of a Game Screen act (#24): opening it, switching its View. */
export async function playUiCue($: EngineInterface, act: UiAct): Promise<void> {
  await mix($, [UI_CUES[act]])
}
