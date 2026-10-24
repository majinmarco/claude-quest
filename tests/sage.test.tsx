import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { vitestFailing1, vitestPassing } from './fixtures/bash-calls'
import { editOneLine, writeNewFile } from './fixtures/file-changes'
import { GAME, inBand } from './fixtures/game-screen'

const SAGE = GAME

const HUD = {
  plugin: 'quest-mod',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const START = { cwd: '/work/forge', surface: 'desktop', isInteractive: true } as const

/** Haiku's reply about writeNewFile's user-profile-card.tsx, following the contract. */
const REPLY = {
  question: 'What does formatEmail return for " Ada@Example.COM "?',
  options: ['ada@example.com', 'Ada@Example.COM', 'ada@Example.com', 'ADA@EXAMPLE.COM'],
  answer: 0,
  explanation: 'It trims the email, then lowercases it.',
  stat: 'intelligence',
  path: '/work/forge/src/user-profile-card.tsx',
  source_lines: ['  return profile.email.trim().toLowerCase();'],
}

const USAGE = {
  input_tokens: 900,
  output_tokens: 120,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
}

/** How long the fake Haiku takes to answer, in ms of the mocked clock. */
const HAIKU_MS = 1500

type Recorded = { input: { tool: string; tool_use_id: string }; result: unknown }

/**
 * Answers the engine's side of the mod, Haiku with `reply` after HAIKU_MS,
 * and keeps what the mod stores, toasts and asks the model.
 */
const engine = (on: On, reply: unknown = REPLY) => {
  const kept = new Map<string, unknown>()
  on('store.get', (_, e) => ({ value: kept.get(e.key) }))
  on('store.set', (_, e) => {
    kept.set(e.key, e.value)

    return { value: undefined }
  })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('session.root', () => ({ value: '/work/forge' }))
  on('fs.exists', () => ({ value: false }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  const toasts: string[] = []
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('ui.log', () => ({ value: undefined }))
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 23, 20, 0) })

  const asked: { model: string; prompt: string }[] = []
  on('model.complete', async (_, e) => {
    asked.push({ model: e.model, prompt: e.prompt })
    await clock.sleep(HAIKU_MS)

    return {
      value: { isAnswered: true, text: JSON.stringify(reply), usage: USAGE },
    }
  })

  const answers = new Map<string, unknown>()
  on('tool.call', (_, e) => answers.get(e.tool_use_id ?? '') as never)

  return {
    clock,
    toasts,
    asked,
    player: () => kept.get('player') as Record<string, unknown> | undefined,
    recorded: (call: Recorded) => {
      answers.set(call.input.tool_use_id, call.result)

      return call.input as never
    },
  }
}

/** Runs `/sage`, with `args`, as the person types it. */
const sage = ($: Engine, args = '') =>
  $.command.run({
    command: 'sage',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })

/** The HUD's text that counts the Questions waiting, if any. */
const hudQuestions = async ($: Engine) => {
  const ui = await $.ui.mount({ ...HUD, surface: 'terminal' })
  const text = (await ui.find({ type: 'Text', text: /Question/ }))?.text
  const hp = (await ui.find({ type: 'Text', text: /^HP / }))?.text
  await ui.unmount()

  return { text, hp }
}

describe('The Sage', () => {
  test('a Crafting queues one Question from Haiku, after the tool call has returned', async ($, on) => {
    const { recorded, clock, asked, toasts } = engine(on)
    await $.session.start(START)

    const outcome = await $.tool.call(recorded(writeNewFile))

    // The tool call is back before Haiku has answered: nothing waits on it.
    expect(outcome).toEqual(writeNewFile.result)
    expect((await hudQuestions($)).text).toBeUndefined()

    await clock.advance(HAIKU_MS)

    expect(asked).toHaveLength(1)
    expect(asked[0]?.model).toBe('haiku')
    expect(asked[0]?.prompt).toContain('user-profile-card.tsx')

    expect((await hudQuestions($)).text).toBe('1 Question waiting · /sage')
    expect(toasts).toContain('The Sage has a Question for you: /sage')
  })

  test('a Battle won asks about the fix: the edits made while it stood, a minor one too', async ($, on) => {
    const { recorded, clock, asked } = engine(on, {
      ...REPLY,
      path: '/work/forge/src/greeting.ts',
      source_lines: ['export const greet = (name: string): string => `Hi, ${name}`'],
    })
    await $.session.start(START)

    await $.tool.call(recorded(vitestFailing1))
    await $.tool.call(recorded(editOneLine))
    expect(asked).toHaveLength(0)
    await $.tool.call(recorded(vitestPassing))
    await clock.advance(HAIKU_MS)

    expect(asked).toHaveLength(1)
    expect(asked[0]?.prompt).toContain('+export const greet = (name: string): string => `Hi, ${name}`')
    expect((await hudQuestions($)).text).toBe('1 Question waiting · /sage')
  })

  test('a minor edit plays no Encounter and asks nothing', async ($, on) => {
    const { recorded, clock, asked } = engine(on)
    await $.session.start(START)

    await $.tool.call(recorded(editOneLine))
    await clock.advance(HAIKU_MS)

    expect(asked).toHaveLength(0)
    expect((await hudQuestions($)).text).toBeUndefined()
  })

  test('a reply that breaks the contract is skipped silently: no Question, the session carries on', async ($, on) => {
    const { recorded, clock } = engine(on, { ...REPLY, options: ['Yes', 'No'] })
    await $.session.start(START)

    const outcome = await $.tool.call(recorded(writeNewFile))
    await clock.advance(HAIKU_MS)

    expect(outcome).toEqual(writeNewFile.result)
    expect((await hudQuestions($)).text).toBeUndefined()
  })

  test('on the desktop the dialogue box shows the Sage\'s portrait, the lines and the options', async ($, on) => {
    const { recorded, clock } = engine(on)
    await $.session.start(START)
    await $.tool.call(recorded(writeNewFile))
    await clock.advance(HAIKU_MS)

    await sage($)
    const ui = await $.ui.mount({ ...SAGE, surface: 'desktop' })

    expect((await inBand(ui, 'game-dialogue', 'Svg'))[0]?.props.alt).toBe('The Sage')
    expect((await ui.find({ type: 'Text', text: /formatEmail/ }))?.text).toBe(
      'What does formatEmail return for " Ada@Example.COM "?',
    )
    expect((await ui.find({ type: 'Code' }))?.text).toBe('  return profile.email.trim().toLowerCase();')
    expect((await inBand(ui, 'game-dialogue', 'Button')).map(button => button.text)).toEqual([
      'A. ada@example.com',
      'B. Ada@Example.COM',
      'C. ada@Example.com',
      'D. ADA@EXAMPLE.COM',
    ])
    await ui.unmount()
  })

  test('a right answer earns 20 Intelligence XP and shows the explanation', async ($, on) => {
    const { recorded, clock, player } = engine(on)
    await $.session.start(START)
    await $.tool.call(recorded(writeNewFile))
    await clock.advance(HAIKU_MS)
    await sage($)
    const ui = await $.ui.mount({ ...SAGE, surface: 'desktop' })

    await ui.press({ key: 'option:sage-1:0' })

    expect((await ui.find({ type: 'Text', text: /^Right/ }))?.text).toBe('Right! +20 XP (Intelligence)')
    expect(await ui.find({ type: 'Text', text: 'It trims the email, then lowercases it.' })).toBeDefined()
    // The Crafting's 5 and the answer's 20.
    expect(player()).toMatchObject({ xp: 25, hp: 100, stats: { intelligence: 20 } })
    expect((await hudQuestions($)).text).toBeUndefined()
    await ui.unmount()
  })

  test('in the terminal a wrong answer costs 10 HP, shows the right one and the explanation', async ($, on) => {
    const { recorded, clock, player } = engine(on)
    await $.session.start({ ...START, surface: 'terminal' })
    await $.tool.call(recorded(writeNewFile))
    await clock.advance(HAIKU_MS)
    await sage($)
    const ui = await $.ui.mount({ ...SAGE, surface: 'terminal' })
    expect(await ui.find({ type: 'Svg' })).toBeUndefined()

    await ui.press({ key: 'option:sage-1:3' })

    expect((await ui.find({ type: 'Text', text: /^Not quite/ }))?.text).toBe(
      'Not quite: -10 HP. The answer was A: ada@example.com',
    )
    expect(await ui.find({ type: 'Text', text: 'It trims the email, then lowercases it.' })).toBeDefined()
    expect(player()).toMatchObject({ hp: 90, stats: { intelligence: 0 } })
    expect((await hudQuestions($)).hp).toBe('HP 90/100')
    await ui.unmount()
  })

  test('/sage tells the Question as text, and /sage with a letter answers it', async ($, on) => {
    const { recorded, clock, player } = engine(on)
    await $.session.start({ ...START, surface: 'terminal' })
    await $.tool.call(recorded(writeNewFile))
    await clock.advance(HAIKU_MS)

    const asked = await sage($)
    expect(asked.text).toBe(
      [
        'The Sage asks (1 Question waiting): What does formatEmail return for " Ada@Example.COM "?',
        '/work/forge/src/user-profile-card.tsx:',
        '      return profile.email.trim().toLowerCase();',
        '  A. ada@example.com',
        '  B. Ada@Example.COM',
        '  C. ada@Example.com',
        '  D. ADA@EXAMPLE.COM',
        'Answer with /sage A, B, C or D, or the buttons on the Game Screen.',
      ].join('\n'),
    )

    const answered = await sage($, 'a')
    expect(answered.text).toBe(
      'Right! +20 XP (Intelligence)\nIt trims the email, then lowercases it.',
    )
    expect(player()).toMatchObject({ stats: { intelligence: 20 } })
  })

  test('a right answer quicker than the Question can be read earns a quarter of the XP, and says why', { options: { nonTrivialLines: 1 } }, async ($, on) => {
    const { recorded, clock, player } = engine(on)
    await $.session.start({ ...START, surface: 'terminal' })
    await $.tool.call(recorded(writeNewFile))
    await clock.advance(HAIKU_MS)

    await sage($)
    await clock.advance(2000)
    const answered = await sage($, 'A')

    expect(answered.text).toBe(
      'Right, but hasty: +5 XP (Intelligence). A closer read earns the full 20.\nIt trims the email, then lowercases it.',
    )
    expect(player()).toMatchObject({ stats: { intelligence: 5 } })
  })

  test('/sage with a letter on a Question never shown shows it and starts its time instead of answering', { options: { nonTrivialLines: 1 } }, async ($, on) => {
    const { recorded, clock, player } = engine(on)
    await $.session.start({ ...START, surface: 'terminal' })
    await $.tool.call(recorded(writeNewFile))
    await clock.advance(HAIKU_MS)

    const blind = await sage($, 'A')

    expect(blind.text).toMatch(/^Read it first/)
    expect(blind.text).toContain('What does formatEmail return for " Ada@Example.COM "?')
    expect(player()).toMatchObject({ stats: { intelligence: 0 } })

    await clock.advance(6000)
    const answered = await sage($, 'A')

    expect(answered.text).toBe('Right! +20 XP (Intelligence)\nIt trims the email, then lowercases it.')
  })

  test('the dialogue box drawing a Question starts its time: an answer there is timed', async ($, on) => {
    const { recorded, clock } = engine(on)
    const games: { lastAnswer?: { answerMs: number | null } | null }[] = []
    on('state.set', (_, e, next) => {
      games.push(e.value as (typeof games)[number])

      return next(e)
    })
    await $.session.start(START)
    await $.tool.call(recorded(writeNewFile))
    await clock.advance(HAIKU_MS)

    const ui = await $.ui.mount({ ...SAGE, surface: 'desktop' })
    await clock.advance(0)
    await clock.advance(7000)
    await ui.press({ key: 'option:sage-1:0' })

    expect(games.at(-1)?.lastAnswer?.answerMs).toBe(7000)
    await ui.unmount()
  })

  test('with nothing queued /sage says so, and a letter answers nothing', async ($, on) => {
    const { player } = engine(on)
    await $.session.start(START)

    const answered = await sage($, 'B')

    expect(answered.text).toMatch(/^The Sage has no Question for you yet/)
    expect(player()).toMatchObject({ hp: 100 })
  })

  test('a Question arriving while the Game Screen is in view is timed from then', async ($, on) => {
    const { recorded, clock } = engine(on)
    on('ui.panes', () => ({
      value: [{ id: 'game', title: 'Claude Quest', isShown: true, isFocused: false, isPlaced: true }],
    }))
    const games: { questions?: { shownAt: number | null }[]; lastAnswer?: { answerMs: number | null } | null }[] = []
    on('state.set', (_, e, next) => {
      games.push(e.value as (typeof games)[number])

      return next(e)
    })
    await $.session.start(START)
    await $.tool.call(recorded(writeNewFile))
    await clock.advance(HAIKU_MS)
    const ui = await $.ui.mount({ ...SAGE, surface: 'desktop' })

    await clock.advance(7000)
    await ui.press({ key: 'option:sage-1:0' })

    expect(games.at(-1)?.lastAnswer?.answerMs).toBe(7000)
    await ui.unmount()
  })

  test('the Question Queue survives a reload of the mod', async ($, on) => {
    const { recorded, clock } = engine(on)
    await $.session.start(START)
    await $.tool.call(recorded(writeNewFile))
    await clock.advance(HAIKU_MS)

    // A reload runs session.start again over the session's $.state.
    await $.session.start(START)

    expect((await hudQuestions($)).text).toBe('1 Question waiting · /sage')
  })
})
