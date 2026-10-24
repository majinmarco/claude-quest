import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { newGame } from '../src/engine'
import { stripOf } from '../src/hud'
import { codeLines, fakeRepo } from './fixtures/fake-git'
import type { FakeRepo } from './fixtures/fake-git'
import { catFile, heredocWrite } from './fixtures/bash-calls'
import { editTwelveLines } from './fixtures/file-changes'

// Wait-time engagement (#22) through the mod's own hooks: a Bash heredoc or
// script plays Crafting from the diff, Bash reads explore, and subagents go
// out as companions. Git is the in-memory repository of fixtures/fake-git,
// answered through `$.process.run`; the files through `$.fs.read`.

const ROOT = '/work/forge'

const START = { cwd: ROOT, surface: 'terminal', isInteractive: true } as const

const SCENE = {
  plugin: 'quest-mod',
  component: 'Pane',
  requestId: 'scene',
  props: { title: 'Scene', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

const HUD = {
  plugin: 'quest-mod',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

/** Haiku's reply about the order ledger a heredoc wrote, following the contract. */
const REPLY = {
  question: 'What does line3 export?',
  options: ['3', '1', '0', 'nothing'],
  answer: 0,
  explanation: 'It is the constant 3.',
  stat: 'intelligence',
  path: '/work/forge/src/order-ledger.ts',
  source_lines: ['export const line3 = 3'],
}

const USAGE = { input_tokens: 900, output_tokens: 120, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

const HAIKU_MS = 1500

type Recorded = { input: { tool: string; tool_use_id: string }; result: unknown }

/**
 * Answers the engine's side of the mod over `repo`: its git and its files,
 * a fake Haiku, the store, the toasts. Each tool call answers its recording
 * and does what it would have done to the working tree (`effect`).
 */
const engine = (on: On, repo: FakeRepo | null, { running = [] as string[] } = {}) => {
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
  on('session.root', () => ({ value: ROOT }))
  on('fs.exists', () => ({ value: false }))
  on('fs.write', () => ({ value: undefined }))
  on('fs.read', async (_, e) => {
    const relative = e.path.startsWith(`${ROOT}/`) ? e.path.slice(ROOT.length + 1) : e.path
    const text = repo?.work.get(relative)
    if (text === undefined) {
      throw new Error(`ENOENT: ${e.path}`)
    }

    return { value: text }
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.log', () => ({ value: undefined }))
  const toasts: string[] = []
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('agent.list', () => ({
    value: running.map(id => ({ agentId: id, id, description: 'still at it', type: 'general-purpose', status: 'running' })) as never,
  }))
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 24, 12, 0) })

  on('process.run', async (_, e) => {
    if (e.argv[0] !== 'git' || repo === null) {
      return { value: { exitCode: 1, stdout: '', stderr: 'offline\n', isStdoutTruncated: false, isStderrTruncated: false } }
    }
    const ran = await repo.git(e.argv.slice(1), e.init?.stdin)

    return { value: { ...ran, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })

  const asked: string[] = []
  on('model.complete', async (_, e) => {
    asked.push(e.prompt)
    await clock.sleep(HAIKU_MS)

    return { value: { isAnswered: true, text: JSON.stringify(REPLY), usage: USAGE } as never }
  })

  const answers = new Map<string, unknown>()
  const effects = new Map<string, () => void>()
  on('tool.call', (_, e) => {
    effects.get(e.tool_use_id ?? '')?.()

    return answers.get(e.tool_use_id ?? '') as never
  })
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'agent-7' }))
  on('turn.complete', (_, e) => ({ text: e.answer }))

  /** Plays a recorded tool call in `agentId`'s loop (the main loop when absent), doing `effect` first. */
  const call = async ($: Engine, recorded: Recorded, effect: () => void = () => undefined, agentId?: string) => {
    answers.set(recorded.input.tool_use_id, recorded.result)
    effects.set(recorded.input.tool_use_id, effect)
    const outcome = await $.tool.call({ ...recorded.input, ...(agentId === undefined ? {} : { agentId }) } as never)
    await clock.advance(HAIKU_MS)

    return outcome
  }

  /** Ends a turn of `agentId`'s loop (the main loop when absent). */
  const endTurn = async ($: Engine, agentId?: string) => {
    await $.turn.complete({
      answer: 'done',
      durationMs: 1000,
      isAborted: false,
      turnId: 'turn-1',
      reason: 'answer',
      ...(agentId === undefined ? {} : { agentId }),
    })
    await clock.advance(HAIKU_MS)
  }

  return { asked, toasts, clock, call, endTurn, player: () => kept.get('player') as { totalXp: number } | undefined }
}

/** Runs `/<command> <args>` as the person types it. */
const run = ($: Engine, command: string, args = '') =>
  $.command.run({ command, args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })

/** The Scene's line in the terminal. */
const sceneLine = async ($: Engine) => {
  const ui = await $.ui.mount({ ...SCENE, surface: 'terminal' })
  const text = (await ui.find({ type: 'Text' }))?.text
  await ui.unmount()

  return text
}

/** The HUD's texts in the terminal. */
const hudTexts = async ($: Engine) => {
  const ui = await $.ui.mount({ ...HUD, surface: 'terminal' })
  const texts = (await ui.findAll({ type: 'Text' })).map(text => text.text)
  await ui.unmount()

  return texts
}

/** Claude spawning a subagent for `description`, from the main loop, as the Agent tool does. */
const spawn = ($: Engine, description: string) =>
  $.agent.spawn({
    tool_use_id: 'toolu_agent',
    prompt: `${description}, then report back.`,
    description,
    subagentType: 'general-purpose',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'claude-opus-5-5',
    background: false,
    fork: false,
  } as never)

/** A Bash call running `command`, exiting 0 with nothing printed. */
const bash = (id: string, command: string): Recorded => ({
  input: { command, description: 'Run it', tool: 'Bash', tool_use_id: `toolu_${id}` } as never,
  result: { result: { stdout: '', stderr: '', interrupted: false, isImage: false, noOutputExpected: false }, text: '' },
})

describe('Crafting from the diff, through the hooks', () => {
  test('a file a heredoc created plays Crafting and the Sage asks about it', async ($, on) => {
    const repo = fakeRepo({ 'src/engine.ts': codeLines(10) })
    const { call, asked } = engine(on, repo)
    await $.session.start(START)
    await run($, 'mattpocock-skills:implement', '#22')

    await call($, heredocWrite, () => repo.work.set('src/order-ledger.ts', codeLines(5)))

    expect(await sceneLine($)).toBe('The blacksmith forges the Order Ledger: new file order-ledger.ts in src, 5 lines · +5 XP')
    expect(asked).toHaveLength(1)
    expect(asked[0]).toContain('File: /work/forge/src/order-ledger.ts')
  })

  test('a script\'s edit in a subagent plays at its turn\'s end; the Bash check waits 15 s between runs', async ($, on) => {
    const repo = fakeRepo({ 'src/engine.ts': codeLines(10) })
    const { call, endTurn, asked } = engine(on, repo)
    await $.session.start(START)
    await run($, 'mattpocock-skills:implement', '#22')

    await call($, bash('py1', 'python3 scripts/gen.py'), () => repo.work.set('src/a.ts', codeLines(4)), 'agent-7')
    expect(asked).toHaveLength(1)

    // Within 15 s of the last: not checked now, but at the turn's end.
    await call($, bash('py2', 'python3 scripts/gen.py --more'), () => repo.work.set('src/order-ledger.ts', codeLines(5)), 'agent-7')
    expect(asked).toHaveLength(1)

    await endTurn($, 'agent-7')
    expect(asked).toHaveLength(2)
    expect(await sceneLine($)).toMatch(/^The blacksmith forges the Order Ledger/)
  })

  test('an Edit followed by the turn\'s end plays Crafting once, and asks one Question', async ($, on) => {
    const original = editTwelveLines.result.result.originalFile
    const repo = fakeRepo({ 'src/order-ledger.ts': original })
    const { call, endTurn, asked, player } = engine(on, repo)
    await $.session.start(START)
    await run($, 'mattpocock-skills:implement', '#22')

    await call($, editTwelveLines as never, () =>
      repo.work.set('src/order-ledger.ts', original.replace(editTwelveLines.input.old_string, editTwelveLines.input.new_string)),
    )
    const xp = player()?.totalXp
    await endTurn($)

    expect(asked).toHaveLength(1)
    expect(player()?.totalXp).toBe(xp)
  })

  test('a commit is preceded by a check: what it commits still plays', async ($, on) => {
    const repo = fakeRepo({ 'src/engine.ts': codeLines(10) })
    const { call, asked } = engine(on, repo)
    await $.session.start(START)
    await run($, 'mattpocock-skills:implement', '#22')
    await call($, bash('py1', 'python3 scripts/gen.py'), () => repo.work.set('src/a.ts', codeLines(4)))

    // Written within 15 s, then committed: the commit would hide it.
    repo.work.set('src/order-ledger.ts', codeLines(5))
    await call($, bash('commit', 'git add -A && git commit -m wip'), () => {
      for (const [path, text] of repo.work) {
        repo.head.set(path, text)
      }
    })

    expect(asked).toHaveLength(2)
  })

  test('not a git repo: the diff path is off, with no error and no toast; the call\'s result stands', async ($, on) => {
    const repo = fakeRepo({}, { isRepo: false })
    const { call, endTurn, asked, toasts } = engine(on, repo)
    await $.session.start(START)

    const outcome = await call($, heredocWrite, () => repo.work.set('src/order-ledger.ts', codeLines(5)))
    await endTurn($)

    expect(outcome).toEqual(heredocWrite.result)
    expect(asked).toEqual([])
    expect(toasts).toEqual([])
    expect(await sceneLine($)).toMatch(/^No Encounter yet/)
  })

  test('git failing to run at all leaves the diff path off too', async ($, on) => {
    const repo = fakeRepo({}, { isMissing: true })
    const { call, endTurn, asked, toasts } = engine(on, repo)
    await $.session.start(START)

    await call($, heredocWrite, () => repo.work.set('src/order-ledger.ts', codeLines(5)))
    await endTurn($)

    expect(asked).toEqual([])
    expect(toasts).toEqual([])
  })
})

describe('Bash reads, through the hooks', () => {
  test('cat explores the file and discovers its Module', async ($, on) => {
    const repo = fakeRepo({ 'src/a.ts': codeLines(3) })
    const { call } = engine(on, repo)
    await $.session.start(START)

    await call($, catFile)

    expect(await sceneLine($)).toBe('Exploring a.ts in src · +1 XP · first visit, +5 XP (Wisdom)')
  })
})

describe('The party, through the hooks', () => {
  test('a subagent spawned during a Quest sets out: the Scene shows it leaving, the HUD counts it', async ($, on) => {
    const repo = fakeRepo({ 'src/a.ts': codeLines(3) })
    const { player } = engine(on, repo)
    await $.session.start(START)
    await run($, 'mattpocock-skills:implement', '#22')
    const xp = player()?.totalXp

    await spawn($, 'Implement issue #22')

    expect(await sceneLine($)).toBe('A companion sets out: Implement issue #22')
    expect(await hudTexts($)).toContain('Party: 1 out')
    expect(player()?.totalXp).toBe(xp)
  })

  test('on the desktop the Scene draws the companion walking off, and the pixel strip a companion with the count', async ($, on) => {
    engine(on, null)
    await $.session.start(START)
    await run($, 'mattpocock-skills:implement', '#22')
    await spawn($, 'Implement issue #22')

    const ui = await $.ui.mount({ ...SCENE, surface: 'desktop' })
    const art = await ui.find({ type: 'Svg' })
    await ui.unmount()
    expect(art?.props.alt).toBe('A companion sets out: Implement issue #22')
    expect(String(art?.props.source)).toMatch(/<animate attributeName="opacity" values="1;1;0"/)

    expect(stripOf(newGame(), 120, 2)).toContainEqual({ kind: 'party', count: 2 })
    expect(stripOf(newGame(), 120, 0).some(segment => segment.kind === 'party')).toBe(false)
  })

  test('its turn\'s end brings it back, with what its loop played; no XP for the return', async ($, on) => {
    const repo = fakeRepo({ 'src/a.ts': codeLines(3), 'docs/b.md': codeLines(3) })
    const { call, endTurn, toasts, player } = engine(on, repo)
    await $.session.start(START)
    await run($, 'mattpocock-skills:implement', '#22')
    await spawn($, 'Implement issue #22')

    await call($, catFile, () => undefined, 'agent-7')
    await call($, bash('cat2', 'cat docs/b.md'), () => undefined, 'agent-7')
    await call($, heredocWrite, () => repo.work.set('src/order-ledger.ts', codeLines(5)), 'agent-7')
    // The main loop's own read is not the companion's.
    await call($, bash('cat3', 'cat src/a.ts'))
    const xp = player()?.totalXp
    await endTurn($, 'agent-7')

    expect(toasts).toContain('Implement issue #22: back. 2 read, 1 forged, 0 Battles won')
    expect(await hudTexts($)).not.toContain('Party: 1 out')
    expect(player()?.totalXp).toBe(xp)
  })

  test('a subagent spawned outside a Quest is no companion', async ($, on) => {
    const { endTurn, toasts } = engine(on, null)
    await $.session.start(START)

    await spawn($, 'Explore')
    await endTurn($, 'agent-7')

    expect(await hudTexts($)).not.toContain('Party: 1 out')
    expect(toasts.some(text => text.includes('back.'))).toBe(false)
  })

  test('a companion whose agent no longer runs leaves the party quietly at the next session start', async ($, on) => {
    engine(on, null)
    await $.session.start(START)
    await run($, 'mattpocock-skills:implement', '#22')
    await spawn($, 'Implement issue #22')
    expect(await hudTexts($)).toContain('Party: 1 out')

    await $.session.start(START)

    expect(await hudTexts($)).not.toContain('Party: 1 out')
  })

  test('a companion still running stays out across a session start (a reload of the mod)', async ($, on) => {
    engine(on, null, { running: ['agent-7'] })
    await $.session.start(START)
    await run($, 'mattpocock-skills:implement', '#22')
    await spawn($, 'Implement issue #22')

    await $.session.start(START)

    expect(await hudTexts($)).toContain('Party: 1 out')
  })
})
