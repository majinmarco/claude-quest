import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { editTwelveLines, writeNewFile, writeRewrite } from './fixtures/file-changes'

const START = { cwd: '/work/forge', surface: 'terminal', isInteractive: true } as const

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
 * Answers the engine's side of the mod, a fake Haiku with REPLY after
 * HAIKU_MS, and keeps what the mod asks the model and logs.
 */
const engine = (on: On) => {
  const kept = new Map<string, unknown>()
  on('store.get', (_, e) => ({ value: kept.get(e.key) }))
  on('store.set', (_, e) => {
    kept.set(e.key, e.value)

    return { value: undefined }
  })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('command.run', () => ({}))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('session.root', () => ({ value: '/work/forge' }))
  on('fs.exists', () => ({ value: false }))
  on('fs.write', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', () => ({ value: undefined }))
  const debug: string[] = []
  on('ui.log', (_, e) => {
    if (e.to === 'debug') {
      debug.push(e.text)
    }

    return { value: undefined }
  })
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 23, 20, 0) })

  const asked: string[] = []
  on('model.complete', async (_, e) => {
    asked.push(e.prompt)
    await clock.sleep(HAIKU_MS)

    return { value: { isAnswered: true, text: JSON.stringify(REPLY), usage: USAGE } }
  })

  const answers = new Map<string, unknown>()
  on('tool.call', (_, e) => answers.get(e.tool_use_id ?? '') as never)

  /** Plays a recorded tool call, and lets Haiku answer whatever it started. */
  const call = async ($: Engine, recorded: Recorded) => {
    answers.set(recorded.input.tool_use_id, recorded.result)
    await $.tool.call(recorded.input as never)
    await clock.advance(HAIKU_MS)
  }

  return { asked, debug, call }
}

/** Runs `/<command> <args>` as the person types it. */
const run = ($: Engine, command: string, args = '') =>
  $.command.run({
    command,
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })

const waiting = async ($: Engine) => (await run($, 'sage')).text?.match(/\((\d+) Questions? waiting\)/)?.[1]

describe('The Haiku budget', () => {
  test('over the Quest\'s budget the Sage skips the Question without calling Haiku, logged to debug alone', { options: { sageCallsPerQuest: 2 } }, async ($, on) => {
    const { asked, debug, call } = engine(on)
    await $.session.start(START)
    await run($, 'mattpocock-skills:implement', '#11')

    await call($, writeNewFile)
    await call($, editTwelveLines)
    await call($, writeRewrite)

    expect(asked).toHaveLength(2)
    expect(debug.some(line => /budget/i.test(line))).toBe(true)
  })

  test('a new Quest brings a new budget', { options: { sageCallsPerQuest: 1 } }, async ($, on) => {
    const { asked, call } = engine(on)
    await $.session.start(START)
    await run($, 'mattpocock-skills:implement', '#11')
    await call($, writeNewFile)
    await call($, editTwelveLines)
    expect(asked).toHaveLength(1)

    await run($, 'mattpocock-skills:implement', '#12')
    await call($, writeRewrite)

    expect(asked).toHaveLength(2)
  })

  test('outside a Quest the Sage has its own small allowance for the session', { options: { sageCallsOutsideQuest: 1 } }, async ($, on) => {
    const { asked, call } = engine(on)
    await $.session.start(START)

    await call($, editTwelveLines)
    await call($, writeRewrite)

    expect(asked).toHaveLength(1)
  })

  test('the default budget is ten Sage calls per Quest', async ($, on) => {
    const { asked, call } = engine(on)
    await $.session.start(START)
    await run($, 'mattpocock-skills:implement', '#11')

    // Twelve different changes: a Write of a new file, each with a body of its own.
    for (let n = 0; n < 12; n += 1) {
      const content = `export const n = ${n}\n`
      const write = {
        input: { ...writeNewFile.input, content, tool_use_id: `toolu_budget_${n}` },
        result: { ...writeNewFile.result, result: { ...writeNewFile.result.result, content } },
      }
      await call($, write)
    }

    expect(asked).toHaveLength(10)
  })
})

describe('The Question cache', () => {
  test('an identical diff, its Question answered, asks Haiku nothing and queues nothing: an answer pays once', async ($, on) => {
    const { asked, call } = engine(on)
    await $.session.start(START)

    await call($, writeNewFile)
    await run($, 'sage', 'A')
    await call($, writeNewFile)

    expect(asked).toHaveLength(1)
    expect(await waiting($)).toBeUndefined()
  })

  test('a cache hit spends no budget', { options: { sageCallsOutsideQuest: 1 } }, async ($, on) => {
    const { asked, call } = engine(on)
    await $.session.start(START)

    await call($, writeNewFile)
    await run($, 'sage', 'A')
    await call($, writeNewFile)
    await run($, 'sage', 'A')
    await call($, writeRewrite)

    // The hit was free, but the one call of the allowance is spent.
    expect(asked).toHaveLength(1)
  })

  test('a Question already waiting is not queued twice', async ($, on) => {
    const { call } = engine(on)
    await $.session.start(START)

    await call($, writeNewFile)
    await call($, writeNewFile)

    expect(await waiting($)).toBe('1')
  })

  test('the cache survives a reload of the mod', async ($, on) => {
    const { asked, call } = engine(on)
    await $.session.start(START)
    await call($, writeNewFile)
    await run($, 'sage', 'A')

    // A reload runs session.start again over the session's $.state.
    await $.session.start(START)
    await call($, writeNewFile)

    expect(asked).toHaveLength(1)
    expect(await waiting($)).toBeUndefined()
  })
})
