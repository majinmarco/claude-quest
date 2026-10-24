import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'

import { writeNewFile } from './fixtures/file-changes'

const START = { cwd: '/work/forge', surface: 'terminal', isInteractive: true } as const

const SAGE = {
  plugin: 'quest-mod',
  component: 'Pane',
  requestId: 'sage',
  props: {
    title: 'The Sage',
    isFocused: true,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

const SCENE = {
  plugin: 'quest-mod',
  component: 'Pane',
  requestId: 'scene',
  props: {
    title: 'Scene',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

/** Haiku's Briefing of #19, following the contract. */
const BRIEFING = {
  briefing: 'Hear me, adventurer: the Quest Giver needs a voice.\nRead the ticket before Claude writes a line.',
  question: {
    question: 'What does the ticket say defines done?',
    options: ['One call per ticket', 'A new setting', 'A second pane', 'Nothing at all'],
    answer: 0,
    explanation: 'Its acceptance criteria ask for one call per ticket.',
    stat: 'wisdom',
  },
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

/** How long the fake Haiku and gh take, in ms of the mocked clock. */
const HAIKU_MS = 1500

const ran = (exitCode: number, stdout: string, stderr = ''): ProcessRunResult => ({
  exitCode,
  stdout,
  stderr,
  isStdoutTruncated: false,
  isStderrTruncated: false,
})

/** The repo's issues `gh issue view` finds: #19 with a body, #20 with none. */
const ISSUES: Record<string, { title: string; body: string }> = {
  '19': { title: "The Quest Giver's briefing", body: 'One Haiku call writes a briefing and one Question about the ticket.' },
  '20': { title: 'Scouting', body: '' },
}

/**
 * Answers the engine's side of the mod: a GitHub repo whose `gh issue view`
 * finds ISSUES (any other number is no such issue), and a fake Haiku that
 * briefs when asked as the Quest Giver and asks as the Sage otherwise.
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
  on('session.repo', () => ({
    value: { root: '/work/forge', remote: 'git@github.com:majinmarco/forge.git', internal: false, name: null },
  }))
  on('fs.exists', () => ({ value: false }))
  on('fs.write', () => ({ value: undefined }))
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
      const found = ISSUES[String(e.argv[3])]

      return {
        value:
          found === undefined
            ? ran(1, '', `GraphQL: Could not resolve to an issue or pull request with the number of ${e.argv[3]}. (repository.issue)\n`)
            : ran(0, JSON.stringify({ number: Number(e.argv[3]), url: '', state: 'OPEN', labels: [], ...found })),
      }
    }

    return { value: ran(0, '[]') }
  })

  const briefings: string[] = []
  const sageAsked: string[] = []
  on('model.complete', async (_, e) => {
    const isBriefing = (e.system ?? '').includes('Quest Giver')
    ;(isBriefing ? briefings : sageAsked).push(e.prompt)
    await clock.sleep(HAIKU_MS)

    return { value: { isAnswered: true, text: JSON.stringify(isBriefing ? BRIEFING : SAGE_REPLY), usage: USAGE } }
  })

  const answers = new Map<string, unknown>()
  on('tool.call', (_, e) => answers.get(e.tool_use_id ?? '') as never)

  return {
    briefings,
    sageAsked,
    toasts,
    clock,
    player: () => kept.get('player') as { stats: Record<string, number> } | undefined,
    /** Plays a recorded tool call, and lets Haiku answer whatever it started. */
    call: async ($: Engine, recorded: { input: { tool_use_id: string }; result: unknown }) => {
      answers.set(recorded.input.tool_use_id, recorded.result)
      await $.tool.call(recorded.input as never)
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

/** Starts the Quest of `ticket`, and lets its lookup and any Briefing finish. */
const startQuest = async (
  $: Engine,
  clock: { advance: (ms: number) => Promise<void>; settle: () => Promise<void> },
  ticket: string,
) => {
  await run($, 'mattpocock-skills:implement', ticket)
  await clock.settle()
  await clock.advance(HAIKU_MS)
}

describe("The Quest Giver's Briefing", () => {
  test('a ticket found with a summary is briefed in one call: its Question queued as the Quest Giver\'s, told in a toast', async ($, on) => {
    const { briefings, toasts, clock } = engine(on)
    await $.session.start(START)

    await startQuest($, clock, '#19')

    expect(briefings).toHaveLength(1)
    expect(briefings[0]).toContain('Ticket: #19')
    expect(briefings[0]).toContain('One Haiku call writes a briefing')
    expect(toasts).toContain('Quest Giver: Hear me, adventurer: the Quest Giver needs a voice.')
    const asked = (await run($, 'sage')).text ?? ''
    expect(asked).toContain('The Quest Giver asks (1 Question waiting): What does the ticket say defines done?')
    expect(asked).toContain("About the Quest's ticket.")
  })

  test('a ticket with no summary, or not found, is not briefed', async ($, on) => {
    const { briefings, clock } = engine(on)
    await $.session.start(START)

    await startQuest($, clock, '#20')
    await startQuest($, clock, '#404')

    expect(briefings).toHaveLength(0)
  })

  test('with sageCallsPerQuest 0 there is no Briefing', { options: { sageCallsPerQuest: 0 } }, async ($, on) => {
    const { briefings, clock } = engine(on)
    await $.session.start(START)

    await startQuest($, clock, '#19')

    expect(briefings).toHaveLength(0)
  })

  test("the call counts against the Sage's budget for the ticket", { options: { sageCallsPerQuest: 1 } }, async ($, on) => {
    const { briefings, sageAsked, clock, call } = engine(on)
    await $.session.start(START)
    await startQuest($, clock, '#19')

    await call($, writeNewFile)

    expect(briefings).toHaveLength(1)
    expect(sageAsked).toHaveLength(0)
  })

  test('the ticket started again costs no call, and its Question answered is not asked again', async ($, on) => {
    const { briefings, clock } = engine(on)
    await $.session.start(START)
    await startQuest($, clock, '#19')
    await run($, 'sage')
    await run($, 'sage', 'A')

    await startQuest($, clock, '#20')
    await startQuest($, clock, '#19')

    expect(briefings).toHaveLength(1)
    expect((await run($, 'sage')).text).toContain('no Question for you')
  })

  test('a Quest replaced while the Briefing is written is not asked it; started again, it is, at no cost', async ($, on) => {
    const { briefings, toasts, clock } = engine(on)
    await $.session.start(START)
    await run($, 'mattpocock-skills:implement', '#19')
    // The lookup has found #19 and Haiku is writing its Briefing.
    await clock.settle()
    await clock.advance(HAIKU_MS / 2)
    await run($, 'mattpocock-skills:implement', '#20')
    await clock.advance(HAIKU_MS)

    expect(briefings).toHaveLength(1)
    expect((await run($, 'sage')).text).toContain('no Question for you')
    expect(toasts.some(text => text.startsWith('Quest Giver:'))).toBe(false)

    await startQuest($, clock, '#19')

    expect(briefings).toHaveLength(1)
    expect((await run($, 'sage')).text).toContain('The Quest Giver asks')
  })

  test('its Question is paid as a Sage Question: 20 XP to its Stat tag', async ($, on) => {
    const { clock, player } = engine(on)
    await $.session.start(START)
    await startQuest($, clock, '#19')

    await run($, 'sage')
    await clock.advance(30_000)
    const answered = (await run($, 'sage', 'A')).text

    expect(answered).toContain('Right! +20 XP (Wisdom)')
    expect(player()?.stats.wisdom).toBe(20)
  })

  test("on the desktop the dialogue box shows the Quest Giver's portrait and name", async ($, on) => {
    const { clock } = engine(on)
    await $.session.start(START)
    await startQuest($, clock, '#19')

    const ui = await $.ui.mount({ ...SAGE, surface: 'desktop' })

    expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe('The Quest Giver')
    expect((await ui.find({ type: 'Text', text: /^The Quest Giver$/ }))?.text).toBe('The Quest Giver')
    expect(await ui.find({ type: 'Code' })).toBeUndefined()
    await ui.unmount()
  })

  test('the Scene tells the Briefing while the Quest has no Encounter yet', async ($, on) => {
    const { clock, call } = engine(on)
    await $.session.start(START)
    await startQuest($, clock, '#19')

    const briefed = await $.ui.mount({ ...SCENE, surface: 'terminal' })
    expect((await briefed.find({ type: 'Text' }))?.text).toBe('Quest Giver: Hear me, adventurer: the Quest Giver needs a voice.')
    await briefed.unmount()

    await call($, writeNewFile)

    const playing = await $.ui.mount({ ...SCENE, surface: 'terminal' })
    expect((await playing.find({ type: 'Text' }))?.text).toMatch(/^The blacksmith forges/)
    await playing.unmount()
  })
})
