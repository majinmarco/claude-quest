// Take Quest, the contract: what picking a Quest does wherever the Player
// picks it (the Quest Board's Take Quest, a Room of the Region map), written
// once over a session with an implement command, a prompt box and a repo of
// three open issues. A view's test file calls `takeQuestContract` with how to
// open the view and press Take Quest on ticket #5 there.

import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, PromptFillInput, ProcessRunResult } from 'claude-code'

const ran = (exitCode: number, stdout: string, stderr = ''): ProcessRunResult => ({
  exitCode,
  stdout,
  stderr,
  isStdoutTruncated: false,
  isStderrTruncated: false,
})

const issue = (number: number, title: string, labels: string[]) => ({
  number,
  title,
  url: `https://github.com/majinmarco/claude-quest/issues/${number}`,
  state: 'OPEN',
  labels: labels.map(name => ({ name })),
  milestone: null,
})

/** Three open issues, none in a milestone; no closed ones. */
const ISSUES = [
  issue(5, 'Quest Board from GitHub Issues', ['ready-for-agent', 'size: M', 'enhancement']),
  issue(6, 'Quest Board from Jira', ['needs-triage', 'size: L']),
  issue(9, 'Crash on an empty Region file', ['ready-for-agent', 'bug', 'points: 1']),
]

const START = { cwd: '/work', surface: 'desktop', isInteractive: true } as const

/** The session: its repo, commands and prompt box; gh over ISSUES; the project at /work, empty. */
const session = (on: On, { commands, draft }: { commands: string[]; draft: string }) => {
  const kept = new Map<string, unknown>()
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 23, 20, 0) })
  on('session.root', () => ({ value: '/work' }))
  on('session.repo', () => ({
    value: { root: '/work', remote: 'git@github.com:majinmarco/claude-quest.git', internal: false, name: null },
  }))
  on('fs.exists', () => ({ value: false }))
  on('fs.list', () => ({ value: [] }))
  on('command.list', () => ({ value: commands.map(name => ({ name, description: name, source: 'plugin' as const })) }))
  on('prompt.read', () => ({ value: { text: draft, cursor: draft.length } }))
  const toasts: string[] = []
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('store.get', (_, e) => ({ value: kept.get(e.key) }))
  on('store.set', (_, e) => {
    kept.set(e.key, e.value)

    return { value: undefined }
  })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('process.run', (_, e) => ({ value: ran(0, JSON.stringify(e.argv.includes('closed') ? [] : ISSUES)) }))
  const filled: PromptFillInput[] = []
  on('prompt.fill', (_, e) => {
    filled.push(e)

    return { isFilled: true }
  })

  return { filled, toasts, settle: () => clock.settle() }
}

export type TakeQuestHarness = {
  /** The view, for the test titles. */
  name: string
  /** Opens the view, as the Player does. */
  open: ($: Engine) => Promise<unknown>
  /** Presses Take Quest on ticket #5 in the view, drawn in the terminal. */
  take: ($: Engine) => Promise<void>
}

export function takeQuestContract({ name, open, take }: TakeQuestHarness): void {
  const picked = async (
    $: Engine,
    on: On,
    { commands = ['mattpocock-skills:implement', 'mattpocock-skills:triage'], draft = '' }: { commands?: string[]; draft?: string } = {},
  ) => {
    const around = session(on, { commands, draft })
    await $.session.start(START)
    await open($)
    await take($)
    await around.settle()

    return around
  }

  describe(`${name}: picking a Quest`, () => {
    test('Take Quest fills whichever implement command the session has', async ($, on) => {
      const { filled } = await picked($, on, { commands: ['acme:implement', 'implement'] })

      expect(filled.map(fill => fill.text)).toEqual(['/acme:implement #5'])
    })

    test('mattpocock-skills:implement is preferred, and a bare implement is the last choice', async ($, on) => {
      const { filled } = await picked($, on, { commands: ['implement', 'acme:implement', 'mattpocock-skills:implement'] })

      expect(filled.map(fill => [fill.text, fill.mode])).toEqual([['/mattpocock-skills:implement #5', 'replace']])
    })

    test('with no implement command, Take Quest fills nothing and says so', async ($, on) => {
      const { filled, toasts } = await picked($, on, { commands: ['mattpocock-skills:triage'] })

      expect(filled).toEqual([])
      expect(toasts).toContain(
        'No implement command in this session: install one, such as mattpocock-skills:implement, to start Quests from the board.',
      )
    })

    test('a draft the Player is writing is kept, and a toast says how to start the Quest', async ($, on) => {
      const { filled, toasts } = await picked($, on, { draft: 'why does the build fail on' })

      expect(filled).toEqual([])
      expect(toasts).toContain('Draft kept: clear it and pick again, or run /mattpocock-skills:implement #5')
    })

    test('a draft that is itself an implement command is replaced', async ($, on) => {
      const { filled } = await picked($, on, { draft: '/mattpocock-skills:implement #6' })

      expect(filled.map(fill => [fill.text, fill.mode])).toEqual([['/mattpocock-skills:implement #5', 'replace']])
    })
  })
}
