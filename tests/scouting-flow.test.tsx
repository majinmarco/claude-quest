import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'

import { writeNewFile } from './fixtures/file-changes'
import { GAME, inBand } from './fixtures/game-screen'

const START = { cwd: '/work/forge', surface: 'terminal', isInteractive: true } as const

const SAGE = GAME

/** The project's files Claude reads, by path: three Modules, src/engine, hooks and tests. */
const PROJECT: Record<string, string> = {
  '/work/forge/src/engine/index.ts': "import { sha256Of } from './hash'\n\nexport const step = () => {\n  const body = 'never sent'\n}\n",
  '/work/forge/src/engine/hash.ts': 'export const sha256Of = (text: string) => text\n',
  '/work/forge/hooks/register.tsx': "import { step } from '../src/engine'\n\nexport const register = () => step()\n",
  '/work/forge/tests/engine.test.ts': "import { step } from '../src/engine'\n",
  '/work/forge/docs/a/x.ts': 'export const a = 1\n',
  '/work/forge/docs/b/x.ts': 'export const b = 1\n',
}

/** Haiku's Scouting, following the contract. */
const SCOUTING = {
  question: 'Which Module does hooks/register.tsx import step from?',
  options: ['src/engine', 'tests', 'docs', 'hooks'],
  answer: 0,
  explanation: 'Its import line names ../src/engine.',
  stat: 'wisdom',
  path: 'hooks/register.tsx',
}

/** Haiku's Sage Question about writeNewFile's user-profile-card.tsx. */
const SAGE_REPLY = {
  question: 'What does formatEmail return for " Ada@Example.COM "?',
  options: ['ada@example.com', 'Ada@Example.COM', 'ada@Example.com', 'ADA@EXAMPLE.COM'],
  answer: 0,
  explanation: 'It trims the email, then lowercases it.',
  stat: 'intelligence',
  path: '/work/forge/src/user-profile-card.tsx',
  source_lines: ['  return profile.email.trim().toLowerCase();'],
}

const USAGE = { input_tokens: 900, output_tokens: 120, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

/** How long the fake Haiku takes, in ms of the mocked clock. */
const HAIKU_MS = 1500

const ran = (exitCode: number, stdout: string, stderr = ''): ProcessRunResult => ({
  exitCode,
  stdout,
  stderr,
  isStdoutTruncated: false,
  isStderrTruncated: false,
})

/**
 * Answers the engine's side of the mod: a GitHub repo whose `gh issue view`
 * finds #20 with no body (so no Briefing), the PROJECT's files, and a fake
 * Haiku that scouts when asked as the Cartographer (`scouting` its reply)
 * and asks as the Sage otherwise.
 */
const engine = (on: On, scouting: unknown = SCOUTING) => {
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
  on('session.repo', () => ({
    value: { root: '/work/forge', remote: 'git@github.com:majinmarco/forge.git', internal: false, name: null },
  }))
  on('fs.exists', () => ({ value: false }))
  on('fs.write', () => ({ value: undefined }))
  on('fs.stat', (_, e) => {
    const text = PROJECT[e.path]
    if (text === undefined) {
      throw new Error(`ENOENT: ${e.path}`)
    }

    return { value: { kind: 'file', size: text.length, mtimeMs: 0, isLink: false } }
  })
  const reads: string[] = []
  on('fs.read', (_, e) => {
    reads.push(e.path)

    return { value: PROJECT[e.path] ?? '' }
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.log', () => ({ value: undefined }))
  const toasts: string[] = []
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 24, 12, 0) })

  on('process.run', (_, e) => {
    if (e.argv[1] === 'issue' && e.argv[2] === 'view') {
      return { value: ran(0, JSON.stringify({ number: 20, url: '', state: 'OPEN', labels: [], title: 'Scouting', body: '' })) }
    }

    return { value: ran(0, '[]') }
  })

  const scouted: { system: string; prompt: string }[] = []
  const sageAsked: string[] = []
  on('model.complete', async (_, e) => {
    const isScouting = (e.system ?? '').includes('Cartographer')
    if (isScouting) {
      scouted.push({ system: e.system ?? '', prompt: e.prompt })
    } else {
      sageAsked.push(e.prompt)
    }
    await clock.sleep(HAIKU_MS)

    return { value: { isAnswered: true, text: JSON.stringify(isScouting ? scouting : SAGE_REPLY), usage: USAGE } }
  })

  const answers = new Map<string, unknown>()
  on('tool.call', (_, e) => answers.get(e.tool_use_id ?? '') as never)
  let calls = 0

  /** Plays Claude's Read of `path`, and lets Haiku answer whatever it started. */
  const readFile = async ($: Engine, path: string) => {
    calls += 1
    const id = `toolu_read_${calls}`
    answers.set(id, { result: { type: 'text' }, text: '1\tok', isReadOnly: true })
    await $.tool.call({ tool: 'Read', file_path: path, tool_use_id: id } as never)
    // A Scouting reads files before it calls Haiku: each step settled in turn.
    for (let step = 0; step < 4; step += 1) {
      await clock.settle()
      await clock.advance(HAIKU_MS)
    }
  }

  return {
    scouted,
    sageAsked,
    toasts,
    reads,
    clock,
    kept,
    readFile,
    player: () => kept.get('player') as { stats: Record<string, number> } | undefined,
    /** Plays a recorded tool call, and lets Haiku answer whatever it started. */
    call: async ($: Engine, recorded: { input: { tool_use_id: string }; result: unknown }) => {
      answers.set(recorded.input.tool_use_id, recorded.result)
      await $.tool.call(recorded.input as never)
      await clock.settle()
      await clock.advance(HAIKU_MS)
    },
  }
}

/** Runs `/<command> <args>` as the person types it. */
const run = ($: Engine, command: string, args = '') =>
  $.command.run({
    command,
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })

/** Starts the Quest of #20, and lets its lookup finish. */
const startQuest = async ($: Engine, clock: { advance: (ms: number) => Promise<void>; settle: () => Promise<void> }) => {
  await run($, 'mattpocock-skills:implement', '#20')
  await clock.settle()
  await clock.advance(HAIKU_MS)
}

/** Claude reads src/engine (twice), hooks and tests: the third Module discovered is tests. */
const exploreThree = async (readFile: (path: string) => Promise<void>) => {
  await readFile('/work/forge/src/engine/hash.ts')
  await readFile('/work/forge/src/engine/index.ts')
  await readFile('/work/forge/hooks/register.tsx')
  await readFile('/work/forge/tests/engine.test.ts')
}

describe('Scouting: the Cartographer asks about the Modules just read', () => {
  test('the third Module discovered in a Quest makes one call with paths and outlines only, its Question queued as the Cartographer\'s', async ($, on) => {
    const { scouted, toasts, clock, readFile } = engine(on)
    await $.session.start(START)
    await startQuest($, clock)

    await exploreThree(path => readFile($, path))

    expect(scouted).toHaveLength(1)
    const prompt = scouted[0]?.prompt ?? ''
    expect(prompt).toContain('Modules: src/engine, hooks, tests')
    expect(prompt).toContain('- src/engine/hash.ts\n- src/engine/index.ts\n- hooks/register.tsx\n- tests/engine.test.ts')
    expect(prompt).toContain("import { step } from '../src/engine'")
    expect(prompt).toContain('export const step')
    expect(prompt).not.toContain('never sent')
    expect(toasts).toContain('The Cartographer has a Question for you: /sage')
    const asked = (await run($, 'sage')).text ?? ''
    expect(asked).toContain('The Cartographer asks (1 Question waiting): Which Module does hooks/register.tsx import step from?')
    expect(asked).toContain('hooks/register.tsx:')
  })

  test('answered right it pays 20 Wisdom XP and charts its Modules, listed in /badges', async ($, on) => {
    const { clock, readFile, player, kept, toasts } = engine(on)
    await $.session.start(START)
    await startQuest($, clock)
    await exploreThree(path => readFile($, path))

    await run($, 'sage')
    await clock.advance(30_000)
    const answered = (await run($, 'sage', 'A')).text
    await clock.settle()

    expect(answered).toContain('Right! +20 XP (Wisdom)')
    expect(player()?.stats.wisdom).toBe(20 + 3 * 5)
    expect(kept.get('charted:/work/forge')).toEqual(['src/engine', 'hooks', 'tests'])
    expect(toasts).toContain('Charted: src/engine, hooks, tests · /badges')
    expect((await run($, 'badges')).text).toContain('Cartographer: 3/25 Modules discovered\n  Charted here (3): src/engine, hooks, tests')
  })

  test('a reply naming a file not in the input is skipped, never queued', async ($, on) => {
    const { scouted, clock, readFile } = engine(on, { ...SCOUTING, path: 'src/secret.ts' })
    await $.session.start(START)
    await startQuest($, clock)

    await exploreThree(path => readFile($, path))

    expect(scouted).toHaveLength(1)
    expect((await run($, 'sage')).text).toContain('no Question for you')
  })

  test('with sageCallsPerQuest 0 there is no Scouting', { options: { sageCallsPerQuest: 0 } }, async ($, on) => {
    const { scouted, clock, readFile } = engine(on)
    await $.session.start(START)
    await startQuest($, clock)

    await exploreThree(path => readFile($, path))

    expect(scouted).toHaveLength(0)
  })

  test("the call counts against the Sage's budget for the ticket", { options: { sageCallsPerQuest: 1 } }, async ($, on) => {
    const { scouted, sageAsked, clock, readFile, call } = engine(on)
    await $.session.start(START)
    await startQuest($, clock)
    await exploreThree(path => readFile($, path))

    await call($, writeNewFile)

    expect(scouted).toHaveLength(1)
    expect(sageAsked).toHaveLength(0)
  })

  test('outside a Quest the fifth Module discovered scouts, on the session\'s allowance', async ($, on) => {
    const { scouted, clock, readFile } = engine(on)
    await $.session.start(START)

    await exploreThree(path => readFile($, path))
    expect(scouted).toHaveLength(0)
    await readFile($, '/work/forge/docs/a/x.ts')
    await readFile($, '/work/forge/docs/b/x.ts')

    expect(scouted).toHaveLength(1)
    expect(scouted[0]?.prompt).toContain('Modules: tests, docs/a, docs/b')
  })

  test("on the desktop the dialogue box shows the Cartographer's portrait and name", async ($, on) => {
    const { clock, readFile } = engine(on)
    await $.session.start(START)
    await startQuest($, clock)
    await exploreThree(path => readFile($, path))

    const ui = await $.ui.mount({ ...SAGE, surface: 'desktop' })

    expect((await inBand(ui, 'game-dialogue', 'Svg'))[0]?.props.alt).toBe('The Cartographer')
    expect((await ui.find({ type: 'Text', text: /^The Cartographer$/ }))?.text).toBe('The Cartographer')
    await ui.unmount()
  })
})
