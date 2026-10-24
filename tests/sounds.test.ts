import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { AudioClip, On, PlayOptions, RenderSurface } from 'claude-code'

import type { Effect, Encounter, QuestionAnswer } from '../src/engine'
import { soundVolumeOf } from '../src/settings'
import { cueFor, cuesFor, gainOf, newMixer, playCues, playUiCue } from '../src/sounds'
import type { Cue, CueInput, Speaker } from '../src/sounds'
import { read } from './fixtures/tool-calls'

const battle = (outcome: 'spawned' | 'hit' | 'won', foe: 'test' | 'lint' | 'typecheck' = 'test'): Encounter => ({
  kind: 'Battle',
  check: 'npm test',
  foe,
  hp: 2,
  maxHp: 3,
  hits: 0,
  outcome,
  isCounted: true,
})

const crafting: Encounter = {
  kind: 'Crafting',
  target: 'src/ledger.ts',
  module: 'src',
  item: 'Ledger',
  isNewFile: true,
  linesAdded: 40,
  linesRemoved: 0,
}

const exploration: Encounter = { kind: 'Exploration', target: 'src/a.ts', module: 'src', isFirstVisit: true }

const answer = (isCorrect: boolean): QuestionAnswer =>
  ({ isCorrect, choice: 0, answeredAt: 0, answerMs: 1000, isHasty: false, xp: 0, hpLost: 0 }) as unknown as QuestionAnswer

/** A gain to two places, as the volume's mapping is stated. */
const rounded = (gain: number | undefined) => (gain === undefined ? undefined : Math.round(gain * 100) / 100)

const badge = { id: 'first-blood', name: 'First Blood' } as unknown as Extract<Effect, { type: 'BADGE_EARNED' }>['badge']

/**
 * The cue sheet of issue #27, row by row: every effect of the engine (and the
 * Rest signals), with the cue it plays or null. A new Effect type left out of
 * this table fails the coverage test below.
 */
const SHEET: readonly [CueInput, Cue | null, { hp: number }?][] = [
  [{ type: 'QUEST_STARTED', ticket: '#1' }, 'quest-start'],
  [{ type: 'MODULE_DISCOVERED', module: 'src' }, 'discover'],
  [{ type: 'ENCOUNTER_STARTED', encounter: crafting }, 'forge'],
  [{ type: 'ENCOUNTER_STARTED', encounter: battle('spawned') }, 'monster'],
  [{ type: 'ENCOUNTER_STARTED', encounter: battle('spawned', 'typecheck') }, 'monster-ghost'],
  [{ type: 'ENCOUNTER_STARTED', encounter: battle('spawned', 'lint') }, 'monster-slime'],
  [{ type: 'ENCOUNTER_STARTED', encounter: exploration }, null],
  [{ type: 'ENCOUNTER_UPDATED', encounter: battle('hit') }, null],
  [{ type: 'MONSTER_HIT', check: 'npm test', hits: 1, hp: 1 }, 'hit'],
  [{ type: 'BATTLE_WON', check: 'npm test', foe: 'test' }, 'battle-won'],
  [{ type: 'CODE_CHANGED', changes: [] }, null],
  [{ type: 'QUESTION_QUEUED', id: 'q1', waiting: 1 }, 'sparkle'],
  [{ type: 'QUESTION_QUEUED', id: 'q2', waiting: 1, npc: 'quest-giver' }, 'scroll'],
  [{ type: 'QUESTION_QUEUED', id: 'q3', waiting: 1, npc: 'cartographer' }, 'map'],
  [{ type: 'BRIEFING_WANTED', ticket: '#1', summary: 'x' }, null],
  [{ type: 'SCOUTING_WANTED', modules: [], files: [] }, null],
  [{ type: 'MODULES_CHARTED', modules: ['src'] }, null],
  [{ type: 'QUESTION_ANSWERED', answer: answer(true) }, 'right'],
  [{ type: 'QUESTION_ANSWERED', answer: answer(false) }, 'wrong'],
  [{ type: 'HP_LOST', amount: 10 }, null, { hp: 20 }],
  [{ type: 'HP_LOST', amount: 10 }, 'exhausted', { hp: 0 }],
  [{ type: 'HP_HEALED', amount: 30 }, 'heal'],
  [{ type: 'XP_CAPPED', pool: 'sage' }, null],
  [{ type: 'XP_GAINED', amount: 5 }, null],
  [{ type: 'LEVEL_UP', level: 3 }, 'level-up'],
  [{ type: 'COMPACTION_WARNING', mana: 20 }, null],
  [{ type: 'QUEST_ABANDONED', ticket: '#1' }, null],
  [{ type: 'HAIKU_CALL_GRANTED', purpose: 'sage', used: 1, limit: 10 }, null],
  [{ type: 'HAIKU_CALL_REFUSED', purpose: 'sage', used: 10, limit: 10 }, null],
  [{ type: 'HAIKU_UNAVAILABLE' }, null],
  [{ type: 'BOSS_FIGHT_SUMMONED', ticket: '#1', sha: 'abc', cwd: null, changes: [] }, 'boss'],
  [{ type: 'BOSS_FIGHT_STARTED', ticket: '#1', hp: 2, questionCount: 3 }, null],
  [{ type: 'BOSS_HIT', hp: 1 }, 'boss-hit'],
  [{ type: 'BOSS_HIT', hp: 0 }, 'boss-fallen'],
  [{ type: 'BADGE_EARNED', badge }, 'badge'],
  [{ type: 'TROPHY_EARNED', trophy: { ticket: '#1', name: 'Trophy' } as never }, 'badge'],
  [{ type: 'QUEST_CLOSED', ticket: '#1', outcome: 'won' }, 'fanfare'],
  [{ type: 'QUEST_CLOSED', ticket: '#1', outcome: 'lost' }, 'defeat'],
  [{ type: 'QUEST_CLOSED', ticket: '#1', outcome: 'skipped' }, null],
  [{ type: 'QUEST_CLOSED', ticket: '#1', outcome: 'unfought' }, null],
  [{ type: 'PROPHECY_ARMED', file: 'a.test.ts' }, 'tick'],
  [{ type: 'PROPHECY_SETTLED', call: 'green', outcome: 'green', isRight: true, xp: 10 }, 'chime'],
  [{ type: 'PROPHECY_SETTLED', call: 'green', outcome: 'red', isRight: false, xp: 0 }, 'fizzle'],
  [{ type: 'REST_STARTED' }, 'campfire'],
  [{ type: 'REST_ENDED' }, null],
]

/** Every Effect type of src/engine.ts, checked against Effect by the compiler. */
const EFFECT_TYPES: { [T in Effect['type']]: true } = {
  ENCOUNTER_STARTED: true,
  ENCOUNTER_UPDATED: true,
  MONSTER_HIT: true,
  BATTLE_WON: true,
  CODE_CHANGED: true,
  QUESTION_QUEUED: true,
  BRIEFING_WANTED: true,
  SCOUTING_WANTED: true,
  MODULES_CHARTED: true,
  QUESTION_ANSWERED: true,
  HP_LOST: true,
  HP_HEALED: true,
  XP_CAPPED: true,
  XP_GAINED: true,
  MODULE_DISCOVERED: true,
  LEVEL_UP: true,
  COMPACTION_WARNING: true,
  QUEST_STARTED: true,
  QUEST_ABANDONED: true,
  HAIKU_CALL_GRANTED: true,
  HAIKU_CALL_REFUSED: true,
  HAIKU_UNAVAILABLE: true,
  BOSS_FIGHT_SUMMONED: true,
  BOSS_FIGHT_STARTED: true,
  BOSS_HIT: true,
  BADGE_EARNED: true,
  TROPHY_EARNED: true,
  QUEST_CLOSED: true,
  PROPHECY_ARMED: true,
  PROPHECY_SETTLED: true,
}

describe('Sound cues: cueFor', () => {
  for (const [input, cue, after] of SHEET) {
    const outcome = 'outcome' in input ? ` ${String(input.outcome)}` : ''
    const label = `${input.type}${outcome}${after === undefined ? '' : ` at ${after.hp} HP`}`
    test(`${label} plays ${cue ?? 'nothing'}`, () => {
      expect(cueFor(input, after)).toBe(cue)
    })
  }

  test('the sheet covers every effect type the engine has', () => {
    const covered = new Set<string>(SHEET.map(([input]) => input.type))
    expect(Object.keys(EFFECT_TYPES).filter(type => !covered.has(type))).toEqual([])
  })
})

describe('Sound cues: one step\'s cues', () => {
  test('a cue named twice in one step plays once', () => {
    expect(
      cuesFor([
        { type: 'BADGE_EARNED', badge },
        { type: 'TROPHY_EARNED', trophy: { ticket: '#1', name: 'Trophy' } as never },
      ]),
    ).toEqual(['badge'])
  })

  test('a heal told by a louder cue of the same step is not played: a level-up, a new Quest, a Boss Fight won', () => {
    const heal: Effect = { type: 'HP_HEALED', amount: 30 }
    expect(cuesFor([{ type: 'LEVEL_UP', level: 2 }, heal])).toEqual(['level-up'])
    expect(cuesFor([{ type: 'QUEST_STARTED', ticket: '#2' }, heal])).toEqual(['quest-start'])
    expect(cuesFor([{ type: 'QUEST_CLOSED', ticket: '#1', outcome: 'won' }, heal])).toEqual(['fanfare'])
    expect(cuesFor([heal])).toEqual(['heal'])
  })

  test('a right answer that hits the boss plays the boss\'s cue alone; a monster hit that wins plays the win', () => {
    expect(cuesFor([{ type: 'QUESTION_ANSWERED', answer: answer(true) }, { type: 'BOSS_HIT', hp: 1 }])).toEqual(['boss-hit'])
    expect(
      cuesFor([
        { type: 'MONSTER_HIT', check: 'npm test', hits: 1, hp: 0 },
        { type: 'BATTLE_WON', check: 'npm test', foe: 'test' },
      ]),
    ).toEqual(['battle-won'])
  })

  test('a wrong answer that leaves the Player at 0 HP plays the thud and the heartbeat', () => {
    expect(cuesFor([{ type: 'QUESTION_ANSWERED', answer: answer(false) }, { type: 'HP_LOST', amount: 10 }], { hp: 0 })).toEqual([
      'wrong',
      'exhausted',
    ])
  })
})

describe('Sound cues: the volume', () => {
  test('soundVolume is 60 unless set; 0 to 100, a value out of range clamped, one that is no number the default', () => {
    expect(soundVolumeOf({})).toBe(60)
    expect(soundVolumeOf({ soundVolume: 0 })).toBe(0)
    expect(soundVolumeOf({ soundVolume: 100 })).toBe(100)
    expect(soundVolumeOf({ soundVolume: 250 })).toBe(100)
    expect(soundVolumeOf({ soundVolume: -5 })).toBe(0)
    expect(soundVolumeOf({ soundVolume: 'loud' })).toBe(60)
  })

  test('the volume maps to gain 0 to 1.2', () => {
    expect(gainOf(0)).toBe(0)
    expect(rounded(gainOf(50))).toBe(0.6)
    expect(rounded(gainOf(60))).toBe(0.72)
    expect(rounded(gainOf(100))).toBe(1.2)
  })
})

type Played = { asset: string; options: PlayOptions | undefined; finish: () => void }

/** A recording $.audio.play: each clip stays playing until the test finishes it, or fails as `failing` says. */
const recorder = (failing: (asset: string) => string | undefined = () => undefined) => {
  const played: Played[] = []
  const logged: string[] = []
  const speaker: Speaker = {
    play: (clip: AudioClip, options?: PlayOptions) => {
      const asset = clip.asset ?? ''
      const cause = failing(asset)
      if (cause !== undefined) {
        return Promise.reject(new Error(cause))
      }

      return new Promise<void>(resolve => {
        played.push({ asset, options, finish: resolve })
      })
    },
    log: text => {
      logged.push(text)
    },
  }
  const names = () => played.map(each => each.asset.replace(/^assets\/sounds\/|\.mp3$/g, ''))

  return { played, logged, speaker, names }
}

/** Lets the mixer see the clips that settled. */
const settle = async () => {
  for (let turn = 0; turn < 5; turn += 1) {
    await Promise.resolve()
  }
}

describe('Sound cues: the mixer', () => {
  test('a cue plays its clip from assets/sounds at the volume\'s gain, once', () => {
    const { played, speaker } = recorder()
    newMixer(60).play(speaker, ['discover'], 0)

    expect(played.map(each => each.asset)).toEqual(['assets/sounds/discover.mp3'])
    expect(rounded(played[0]?.options?.gain)).toBe(0.72)
    expect(played[0]?.options?.shouldLoop).toBeFalsy()
  })

  test('at volume 0 nothing plays', () => {
    const { played, speaker } = recorder()
    const mixer = newMixer(0)
    mixer.play(speaker, ['badge', 'discover'], 0)
    mixer.play(speaker, ['campfire'], 0)

    expect(played).toEqual([])
  })

  test('a cue still playing is not restarted; once it ends it plays again', async () => {
    const { played, speaker, names } = recorder()
    const mixer = newMixer(60)
    mixer.play(speaker, ['sparkle'], 0)
    mixer.play(speaker, ['sparkle', 'discover'], 100)
    expect(names()).toEqual(['sparkle', 'discover'])

    played[0]?.finish()
    await settle()
    mixer.play(speaker, ['sparkle'], 200)
    expect(names()).toEqual(['sparkle', 'discover', 'sparkle'])
  })

  test('a clip that never says it ended stops counting as playing after ten seconds', () => {
    const { speaker, names } = recorder()
    const mixer = newMixer(60)
    mixer.play(speaker, ['sparkle'], 0)
    mixer.play(speaker, ['sparkle'], 9_999)
    mixer.play(speaker, ['sparkle'], 10_000)

    expect(names()).toEqual(['sparkle', 'sparkle'])
  })

  test('hits coalesce: at most one hit a second', async () => {
    const { played, speaker, names } = recorder()
    const mixer = newMixer(60)
    const finishAll = async () => {
      played.forEach(each => each.finish())
      await settle()
    }
    mixer.play(speaker, ['hit'], 0)
    await finishAll()
    mixer.play(speaker, ['hit'], 400)
    await finishAll()
    mixer.play(speaker, ['hit'], 999)
    await finishAll()
    mixer.play(speaker, ['hit'], 1_000)

    expect(names()).toEqual(['hit', 'hit'])
  })

  test('at most six cues in ten seconds, the lowest priority dropped first', () => {
    const { speaker, names } = recorder()
    const mixer = newMixer(60)
    mixer.play(speaker, ['ui', 'discover', 'forge'], 0)
    mixer.play(speaker, ['sparkle', 'right'], 1_000)
    // One place left: the Battle cue takes it over the notices.
    mixer.play(speaker, ['tick', 'scroll', 'monster'], 2_000)

    // Each step's cues start highest priority first.
    expect(names()).toEqual(['discover', 'forge', 'ui', 'right', 'sparkle', 'monster'])
  })

  test('the boss, the fanfare, a level-up, a defeat and a badge are never dropped', () => {
    const { speaker, names } = recorder()
    const mixer = newMixer(60)
    mixer.play(speaker, ['discover', 'forge', 'sparkle', 'right', 'hit', 'monster'], 0)
    mixer.play(speaker, ['boss', 'fanfare', 'level-up', 'defeat', 'badge', 'scroll'], 500)

    expect(names().slice(6)).toEqual(['boss', 'fanfare', 'level-up', 'defeat', 'badge'])
  })

  test('the window moves on: ten seconds after the first cue, room again', () => {
    const { speaker, names } = recorder()
    const mixer = newMixer(60)
    mixer.play(speaker, ['discover', 'forge', 'sparkle', 'right', 'hit', 'monster'], 0)
    mixer.play(speaker, ['ui'], 9_999)
    mixer.play(speaker, ['ui'], 10_000)

    expect(names()).toEqual(['right', 'hit', 'monster', 'discover', 'forge', 'sparkle', 'ui'])
  })

  test('a clip that cannot play is skipped, each cause logged once per session', async () => {
    const { speaker, logged } = recorder(asset =>
      asset.includes('forge') ? '$.audio.play: <audio> could not play (not decodable)' : `$.audio.play: could not read ${asset}: no such file`,
    )
    const mixer = newMixer(60)
    mixer.play(speaker, ['discover'], 0)
    mixer.play(speaker, ['sparkle'], 20_000)
    mixer.play(speaker, ['forge'], 40_000)
    mixer.play(speaker, ['forge'], 60_000)
    await settle()

    expect(logged).toHaveLength(2)
    expect(logged[0]).toMatch(/no such file/)
    expect(logged[1]).toMatch(/not decodable/)
  })

  test('the campfire loops at a low gain with a signal until the Rest ends', () => {
    const { played, speaker, names } = recorder()
    const mixer = newMixer(100)
    mixer.play(speaker, ['campfire'], 0)
    mixer.play(speaker, ['campfire'], 5_000)

    expect(names()).toEqual(['campfire'])
    const options = played[0]?.options
    expect(options?.shouldLoop).toBe(true)
    expect(options?.gain).toBeLessThan(gainOf(100) / 2)
    expect(options?.signal?.aborted).toBe(false)

    mixer.stopCampfire()
    expect(options?.signal?.aborted).toBe(true)
    mixer.stopCampfire()

    mixer.play(speaker, ['campfire'], 6_000)
    expect(names()).toEqual(['campfire', 'campfire'])
  })

  test('the campfire is a bed: it takes no place among the six', () => {
    const { speaker, names } = recorder()
    const mixer = newMixer(60)
    mixer.play(speaker, ['campfire'], 0)
    mixer.play(speaker, ['discover', 'forge', 'sparkle', 'right', 'hit', 'monster'], 1)

    expect(names()).toHaveLength(7)
  })
})

const ROOT = '/work/claude-quest'
const START = { cwd: ROOT, surface: 'desktop', isInteractive: true } as const

/** Answers the engine's side of the mod, and records every clip it is asked to play. */
const engine = (on: On, surfaces: RenderSurface[] = ['desktop'], failing?: string) => {
  const kept = new Map<string, unknown>()
  on('store.get', (_, e) => ({ value: kept.get(e.key) }))
  on('store.set', (_, e) => {
    kept.set(e.key, e.value)

    return { value: undefined }
  })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.surfaces', () => ({ value: surfaces }))
  on('session.root', () => ({ value: ROOT }))
  on('tool.call', () => read.result)
  on('fs.exists', () => ({ value: false }))
  on('fs.read', () => ({ value: '' }))
  on('fs.write', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  const toasts: string[] = []
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 24, 20, 0) })

  const clips: { asset: string; gain: number | undefined }[] = []
  on('audio.play', (_, e) => {
    if (failing !== undefined) {
      throw new Error(failing)
    }
    clips.push({ asset: e.clip.asset ?? '', gain: e.gain })

    return { value: undefined }
  })

  return { clips, toasts, clock }
}

/** A Read of `file`, under the project's root, as Claude Code makes it. */
const readOf = (file: string) => ({ ...read.input, file_path: `${ROOT}/${file}` })

/** Reads a file in a Module never visited: a discovery. */
const discover = async ($: Engine, clock: { settle: () => Promise<void> }) => {
  await $.tool.call(readOf('src/engine.ts'))
  await clock.settle()
}

describe('Sound cues in a session', () => {
  test('a discovery plays its chime at the default volume', async ($, on) => {
    const { clips, clock } = engine(on)
    await $.session.start(START)

    await discover($, clock)

    expect(clips.map(each => each.asset)).toEqual(['assets/sounds/discover.mp3'])
    expect(rounded(clips[0]?.gain)).toBe(0.72)
  })

  test('soundVolume 0 plays nothing', { options: { soundVolume: 0 } }, async ($, on) => {
    const { clips, clock } = engine(on)
    await $.session.start(START)

    await discover($, clock)

    expect(clips).toEqual([])
  })

  test('headless, with no surface attached, nothing plays', async ($, on) => {
    const { clips, clock } = engine(on, [])
    await $.session.start({ ...START, isInteractive: false })

    await discover($, clock)

    expect(clips).toEqual([])
  })

  test('a session with no player runs on: no error, no toast', async ($, on) => {
    const { clock, toasts } = engine(on, ['desktop'], '$.audio.play: afplay failed to start: spawn afplay ENOENT')
    await $.session.start(START)

    await discover($, clock)
    await $.tool.call(readOf('hooks/register.tsx'))
    await clock.settle()

    expect(toasts.filter(text => /audio|sound|afplay/i.test(text))).toEqual([])
  })

})

/** The few nouns of `$` the cues use, with `surfaces` attached, recording each clip. */
const fakeEngine = (surfaces: RenderSurface[]) => {
  const clips: string[] = []
  let now = 0
  const $ = {
    session: { surfaces: async () => surfaces },
    clock: { now: async () => now },
    ui: { log: () => undefined },
    audio: {
      play: async (clip: AudioClip) => {
        clips.push(clip.asset ?? '')
      },
    },
  }

  return { $: $ as never, clips, wait: (ms: number) => (now += ms) }
}

describe('Sound cues of the Game Screen (#24 calls playUiCue)', () => {
  test('opening the Game Screen and switching its View click', async () => {
    const { $, clips, wait } = fakeEngine(['desktop'])

    await playUiCue($, 'game-screen-opened')
    wait(2_000)
    await playUiCue($, 'view-switched')

    expect(clips).toEqual(['assets/sounds/ui.mp3', 'assets/sounds/ui.mp3'])
  })

  test('headless, the click plays nothing', async () => {
    const { $, clips } = fakeEngine([])

    await playUiCue($, 'view-switched')

    expect(clips).toEqual([])
  })
})

describe('Sound cues of a Rest (#26 calls playCues with its effects)', () => {
  test('the campfire burns from REST_STARTED to REST_ENDED', async () => {
    const signals: AbortSignal[] = []
    const { $ } = fakeEngine(['desktop'])
    const engine$ = $ as unknown as { audio: { play: (clip: AudioClip, options?: PlayOptions) => Promise<void> } }
    engine$.audio.play = (_clip, options) => {
      if (options?.signal !== undefined) {
        signals.push(options.signal)
      }

      return new Promise(() => undefined)
    }

    await playCues($, [{ type: 'REST_STARTED' }])
    expect(signals.map(signal => signal.aborted)).toEqual([false])

    await playCues($, [{ type: 'REST_ENDED' }])
    expect(signals.map(signal => signal.aborted)).toEqual([true])
  })
})
