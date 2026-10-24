import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { writeNewFile } from './fixtures/file-changes'
import { commitAfterAdd, commitInFolder, commitNothingToCommit, commitPlain, GIT_SHOW_DEPOSIT } from './fixtures/git-commits'

const ROOT = '/work/vault'
const REGION = `${ROOT}/.claude/claude-quest.json`
const START = { cwd: ROOT, surface: 'terminal', isInteractive: true } as const

const pane = (requestId: string, title: string) =>
  ({
    plugin: 'quest-mod',
    component: 'Pane',
    requestId,
    props: {
      title,
      isFocused: true,
      bodyColumns: 80,
      placement: 'dock',
      scroll: { offset: 0, bodyRows: 30 },
      view: {},
    },
  }) as const

const BOSS = pane('boss', 'The Boss')
const SCENE = pane('scene', 'Scene')

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

/** A review Question about GIT_SHOW_DEPOSIT's deposit(), as Haiku writes one; option A right. */
const review = (n: number) => ({
  question: `What does deposit do with a locked vault? (${n})`,
  options: ['It throws', 'It adds the gold anyway', 'It returns the vault unchanged', 'It unlocks it first'],
  answer: 0,
  explanation: 'deposit throws "The vault is locked" before adding any gold.',
  stat: 'intelligence',
  path: 'src/vault.ts',
  source_lines: ['  if (vault.locked) {', '    throw new Error("The vault is locked")'],
})

const THREE = { questions: [review(1), review(2), review(3)] }

const USAGE = {
  input_tokens: 2000,
  output_tokens: 600,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
}

/** How long the fake Haiku takes to answer, in ms of the mocked clock. */
const HAIKU_MS = 1500

type Recorded = { input: { tool: string; tool_use_id: string }; result: unknown }

/**
 * Answers the engine's side of the mod: the store, the project's files, a
 * fake git answering `git show` with `show`, and a fake Haiku answering each
 * call with the next of `replies` (the last again once they run out); with
 * `losesFirstCall`, its first call never answers, as work lost with a reload.
 */
const engine = (
  on: On,
  {
    replies = [THREE] as unknown[],
    show = { exitCode: 0, stdout: GIT_SHOW_DEPOSIT },
    losesFirstCall = false,
  } = {},
) => {
  const kept = new Map<string, unknown>()
  on('store.get', (_, e) => ({ value: kept.get(e.key) }))
  on('store.set', (_, e) => {
    kept.set(e.key, e.value)

    return { value: undefined }
  })
  const files = new Map<string, string>()
  on('session.root', () => ({ value: ROOT }))
  on('fs.exists', (_, e) => ({ value: files.has(e.path) }))
  on('fs.read', (_, e) => ({ value: files.get(e.path) ?? '' }))
  on('fs.write', (_, e) => {
    files.set(e.path, e.text)

    return { value: undefined }
  })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('command.run', () => ({}))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.surfaces', () => ({ value: ['terminal'] }))
  const opened: string[] = []
  on('ui.open', (_, e) => {
    opened.push(e.id)

    return { value: { isPlaced: true } }
  })
  const toasts: string[] = []
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('ui.log', () => ({ value: undefined }))
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 23, 21, 0) })

  const runs: { argv: string[]; cwd?: string }[] = []
  on('process.run', (_, e) => {
    runs.push({ argv: [...e.argv], cwd: e.init?.cwd })

    return {
      value: { stderr: '', isStdoutTruncated: false, isStderrTruncated: false, ...show },
    }
  })

  const asked: string[] = []
  on('model.complete', async (_, e) => {
    const reply = replies[Math.min(asked.length, replies.length - 1)]
    asked.push(e.prompt)
    if (losesFirstCall && asked.length === 1) {
      return new Promise(() => undefined)
    }
    await clock.sleep(HAIKU_MS)

    return { value: { isAnswered: true, text: JSON.stringify(reply), usage: USAGE } }
  })

  const answers = new Map<string, unknown>()
  on('tool.call', (_, e) => answers.get(e.tool_use_id ?? '') as never)

  /** Plays a recorded tool call, then lets Haiku answer what it started. */
  const call = async ($: Engine, recorded: Recorded) => {
    answers.set(recorded.input.tool_use_id, recorded.result)
    const outcome = await $.tool.call(recorded.input as never)
    await clock.advance(HAIKU_MS * 3)

    return outcome
  }

  return {
    call,
    clock,
    toasts,
    asked,
    runs,
    opened,
    answers,
    player: () => kept.get('player') as Record<string, unknown> | undefined,
    region: () => JSON.parse(files.get(REGION) ?? '{}') as { quests?: Record<string, unknown>[] },
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

const startQuest = ($: Engine) => run($, 'mattpocock-skills:implement', '#12')

/** The HUD's texts, in the terminal. */
const hud = async ($: Engine) => {
  const ui = await $.ui.mount({ ...HUD, surface: 'terminal' })
  const texts = (await ui.findAll({ type: 'Text' })).map(text => text.text)
  await ui.unmount()

  return texts
}

describe('The Boss Fight', () => {
  test('the first commit in a Quest summons it from the commit\'s diff, after the tool call has returned', async ($, on) => {
    const { answers, clock, asked, runs, toasts } = engine(on)
    await $.session.start(START)
    await startQuest($)

    answers.set(commitAfterAdd.input.tool_use_id, commitAfterAdd.result)
    const outcome = await $.tool.call(commitAfterAdd.input as never)

    // The commit is back before Haiku has answered: nothing waits on it.
    expect(outcome).toEqual(commitAfterAdd.result)
    expect(asked).toHaveLength(0)

    await clock.advance(HAIKU_MS)

    expect(runs).toEqual([{ argv: ['git', 'show', '--format=', '--no-color', '--no-ext-diff', '7ab19e4'], cwd: undefined }])
    expect(asked).toHaveLength(1)
    expect(asked[0]).toContain('+export function deposit(vault: Vault, amount: number): Vault {')
    expect(asked[0]).toContain('#12')
    expect(toasts).toContain('The boss of Quest #12 bars the way: 3 review Questions. /boss')
    expect(await hud($)).toContain('Boss 3/3 HP · /boss')
  })

  test('a commit under cd reads its diff in that folder', async ($, on) => {
    const { call, runs } = engine(on)
    await $.session.start(START)
    await startQuest($)

    await call($, commitInFolder)

    expect(runs[0]?.cwd).toBe('vault')
  })

  test('later commits start no other Boss Fight', async ($, on) => {
    const { call, asked, runs } = engine(on)
    await $.session.start(START)
    await startQuest($)

    await call($, commitAfterAdd)
    await call($, commitPlain)

    expect(runs).toHaveLength(1)
    expect(asked).toHaveLength(1)
  })

  test('a failed commit, or one outside a Quest, summons nothing', async ($, on) => {
    const { call, runs } = engine(on)
    await $.session.start(START)

    await call($, commitAfterAdd)
    await startQuest($)
    await call($, commitNothingToCommit)

    expect(runs).toHaveLength(0)
  })

  test('when git cannot show the commit, the Quest\'s own changes are reviewed', async ($, on) => {
    const { call, asked } = engine(on, {
      replies: [THREE, { questions: [{ ...review(1), path: '/work/forge/src/user-profile-card.tsx', source_lines: ['  return profile.email.trim().toLowerCase();'] }] }],
      show: { exitCode: 128, stdout: '' },
    })
    await $.session.start(START)
    await startQuest($)
    await call($, writeNewFile)

    await call($, commitAfterAdd)

    expect(asked.at(-1)).toContain('/work/forge/src/user-profile-card.tsx')
  })

  test('Haiku is asked again for the Questions missing, within the Boss Fight\'s budget', async ($, on) => {
    const { call, asked } = engine(on, {
      replies: [{ questions: [review(1)] }, { questions: [review(2)] }, { questions: [review(3)] }],
    })
    await $.session.start(START)
    await startQuest($)

    await call($, commitAfterAdd)

    expect(asked).toHaveLength(3)
    expect(asked[2]).toContain('What does deposit do with a locked vault? (2)')
    expect((await run($, 'boss')).text).toContain('(3 review Questions left, boss 3/3 HP)')
  })

  test('a Boss Fight skipped while its Questions are made asks Haiku no more', async ($, on) => {
    const { answers, clock, asked, region } = engine(on, {
      replies: [{ questions: [review(1)] }, { questions: [review(2)] }, { questions: [review(3)] }],
    })
    await $.session.start(START)
    await startQuest($)
    answers.set(commitAfterAdd.input.tool_use_id, commitAfterAdd.result)
    await $.tool.call(commitAfterAdd.input as never)
    await clock.advance(HAIKU_MS / 2)

    expect((await run($, 'boss', 'skip')).text).toBe('Boss Fight skipped: Quest #12 closed without its reward.')
    await clock.advance(HAIKU_MS * 3)

    expect(asked).toHaveLength(1)
    expect(region().quests?.[0]).toMatchObject({ status: 'skipped' })
  })

  test('a Quest replaced while its Boss Fight\'s Questions are made leaves the new Quest its whole budget', async ($, on) => {
    const { answers, call, clock } = engine(on, {
      replies: [1, 2, 3, 4, 5, 6].map(n => ({ questions: [review(n)] })),
    })
    await $.session.start(START)
    await startQuest($)
    answers.set(commitAfterAdd.input.tool_use_id, commitAfterAdd.result)
    await $.tool.call(commitAfterAdd.input as never)
    await clock.advance(HAIKU_MS / 2)

    await run($, 'mattpocock-skills:implement', '#13')
    await clock.advance(HAIKU_MS * 3)
    await call($, commitPlain)

    expect((await run($, 'boss')).text).toMatch(/^The boss of Quest #13 asks \(3 review Questions left/)
  })

  test('with the Boss Fight\'s budget spent, the Quest closes unfought, recorded so', { options: { bossFightCallsPerQuest: 0 } }, async ($, on) => {
    const { call, asked, toasts, region } = engine(on)
    await $.session.start(START)
    await startQuest($)

    await call($, commitAfterAdd)

    expect(asked).toHaveLength(0)
    // Unfought, an Unrated Quest pays a quarter of its 80.
    expect(toasts).toContain('No boss came for Quest #12: it closes without a Boss Fight. +20 XP (Intelligence).')
    expect(region().quests?.[0]).toMatchObject({ ticket: '#12', status: 'unfought', endedAt: '2026-10-23T21:00:00.000Z' })
    expect((await hud($)).some(text => text?.startsWith('Quest '))).toBe(false)
  })

  test('/boss tells the Question as text; three right answers win the Quest reward and a trophy, and the Region file records it', async ($, on) => {
    const { call, clock, player, region, toasts } = engine(on)
    await $.session.start(START)
    await startQuest($)
    await call($, commitAfterAdd)

    const asked = await run($, 'boss')
    expect(asked.text).toBe(
      [
        'The boss of Quest #12 asks (3 review Questions left, boss 3/3 HP): What does deposit do with a locked vault? (1)',
        'src/vault.ts:',
        '      if (vault.locked) {',
        '        throw new Error("The vault is locked")',
        '  A. It throws',
        '  B. It adds the gold anyway',
        '  C. It returns the vault unchanged',
        '  D. It unlocks it first',
        'Answer with /boss A, B, C or D, or skip it with /boss skip.',
      ].join('\n'),
    )

    await clock.advance(60_000)
    const first = await run($, 'boss', 'A')
    expect(first.text).toMatch(/^Hit! \+30 XP \(Intelligence\)\. Boss 2\/3 HP\ndeposit throws/)
    await run($, 'boss', 'a')
    const last = await run($, 'boss', 'A')

    // An Unrated Quest (the board never listed it) rewards 80, Flawless 40 more.
    expect(last.text).toContain('The boss falls! +120 XP (Intelligence). Flawless! Trophy: Bane of vault#12. Quest #12 closed.')
    // 3 × 30 + 120 = 210: level 2 (at 100) with 110 into it.
    expect(player()).toMatchObject({
      level: 2,
      xp: 110,
      totalXp: 210,
      trophies: [{ name: 'Bane of vault#12', region: 'vault', ticket: '#12' }],
    })
    expect(toasts).toContain('Trophy won: Bane of vault#12')
    expect(toasts).toContain('Badge earned: Boss Slayer · /badges')
    expect(region().quests?.[0]).toMatchObject({ ticket: '#12', status: 'won' })
    expect(typeof region().quests?.[0]?.endedAt).toBe('string')
    expect((await hud($)).some(text => text?.startsWith('Quest '))).toBe(false)
  })

  test('a wrong answer costs HP; the boss left standing, the Quest closes lost', async ($, on) => {
    const { call, player, region } = engine(on)
    await $.session.start(START)
    await startQuest($)
    await call($, commitAfterAdd)

    const wrong = await run($, 'boss', 'B')
    await run($, 'boss', 'A')
    const last = await run($, 'boss', 'A')

    expect(wrong.text).toMatch(/^The boss strikes: -10 HP\. The answer was A: It throws/)
    expect(last.text).toContain('The boss still stands, 1/3 HP: Quest #12 closed without the Boss Fight\'s reward.')
    expect(player()).toMatchObject({ hp: 90, xp: 60 })
    expect(player()?.trophies).toBeUndefined()
    expect(region().quests?.[0]).toMatchObject({ status: 'lost' })
  })

  test('/boss skip closes the Quest without the reward, recorded as skipped', async ($, on) => {
    const { call, player, region } = engine(on)
    await $.session.start(START)
    await startQuest($)
    await call($, commitAfterAdd)

    const skipped = await run($, 'boss', 'skip')

    expect(skipped.text).toBe('Boss Fight skipped: Quest #12 closed without its reward.')
    expect(player()).toMatchObject({ xp: 0 })
    expect(region().quests?.[0]).toMatchObject({ ticket: '#12', status: 'skipped' })
    expect((await run($, 'boss')).text).toMatch(/^No Boss Fight under way/)
  })

  test('on the desktop the boss\'s pane shows its portrait, the lines, the options and a skip button', async ($, on) => {
    const { call, player, region } = engine(on)
    await $.session.start({ ...START, surface: 'desktop' })
    await startQuest($)
    await call($, commitAfterAdd)

    const ui = await $.ui.mount({ ...BOSS, surface: 'desktop' })

    expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe('The boss of Quest #12')
    expect((await ui.find({ type: 'Code' }))?.text).toBe('  if (vault.locked) {\n    throw new Error("The vault is locked")')
    expect((await ui.findAll({ type: 'Button' })).map(button => button.text)).toEqual([
      'A. It throws',
      'B. It adds the gold anyway',
      'C. It returns the vault unchanged',
      'D. It unlocks it first',
      'Skip the Boss Fight',
    ])

    await ui.press({ key: 'boss-option:boss-1:0' })
    expect((await ui.find({ type: 'Text', text: /^Hit!/ }))?.text).toBe('Hit! +30 XP (Intelligence). Boss 2/3 HP')
    expect(player()).toMatchObject({ xp: 30 })

    await ui.press({ key: 'boss-skip' })
    expect(region().quests?.[0]).toMatchObject({ status: 'skipped' })
    await ui.unmount()
  })

  test('in the terminal the boss\'s pane is the same box, without the portrait', async ($, on) => {
    const { call } = engine(on)
    await $.session.start(START)
    await startQuest($)
    await call($, commitAfterAdd)

    const ui = await $.ui.mount({ ...BOSS, surface: 'terminal' })

    expect(await ui.find({ type: 'Svg' })).toBeUndefined()
    expect(await ui.find({ type: 'Button', text: 'A. It throws' })).toBeDefined()
    await ui.unmount()
  })

  test('the Scene plays the Boss Fight: the boss on the desktop, one line in the terminal', async ($, on) => {
    const { call } = engine(on)
    await $.session.start(START)
    await startQuest($)
    await call($, commitAfterAdd)
    await run($, 'boss', 'A')

    const desktop = await $.ui.mount({ ...SCENE, surface: 'desktop' })
    expect((await desktop.find({ type: 'Svg' }))?.props.alt).toBe('A hit on the boss of Quest #12 · 2/3 HP · /boss')
    await desktop.unmount()

    const terminal = await $.ui.mount({ ...SCENE, surface: 'terminal' })
    expect(await terminal.find({ type: 'Svg' })).toBeUndefined()
    expect((await terminal.find({ type: 'Text' }))?.text).toBe('A hit on the boss of Quest #12 · 2/3 HP · /boss')
    await terminal.unmount()

    await run($, 'boss', 'A')
    await run($, 'boss', 'A')
    const won = await $.ui.mount({ ...SCENE, surface: 'terminal' })
    expect((await won.find({ type: 'Text' }))?.text).toBe(
      'The boss of Quest #12 falls! +120 XP (Intelligence) · Flawless · trophy: Bane of vault#12',
    )
    await won.unmount()
  })

  test('a Boss Fight whose Questions were being made at a reload is made again', async ($, on) => {
    const { answers, clock } = engine(on, { losesFirstCall: true })
    await $.session.start(START)
    await startQuest($)
    answers.set(commitAfterAdd.input.tool_use_id, commitAfterAdd.result)
    await $.tool.call(commitAfterAdd.input as never)
    await clock.advance(HAIKU_MS)
    expect(await hud($)).toContain('Boss approaching')

    await $.session.start(START)
    await clock.advance(HAIKU_MS)

    expect(await hud($)).toContain('Boss 3/3 HP · /boss')
  })

  test('the Boss Fight survives a reload of the mod', async ($, on) => {
    const { call } = engine(on)
    await $.session.start(START)
    await startQuest($)
    await call($, commitAfterAdd)

    await $.session.start(START)

    expect(await hud($)).toContain('Boss 3/3 HP · /boss')
  })
})
