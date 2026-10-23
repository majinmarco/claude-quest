import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, PromptFillInput, ProcessRunResult } from 'claude-code'

const BOARD = {
  plugin: 'quest-mod',
  component: 'Pane',
  requestId: 'quest-board',
  props: {
    title: 'Quest Board',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

const SURFACES = ['terminal', 'desktop'] as const

const START = { cwd: '/work', surface: 'desktop', isInteractive: true } as const

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
})

const ISSUES = [
  issue(5, 'Quest Board from GitHub Issues', ['ready-for-agent', 'size: M', 'enhancement']),
  issue(6, 'Quest Board from Jira', ['needs-triage', 'size: L']),
  issue(9, 'Crash on an empty Region file', ['ready-for-agent', 'bug', 'points: 1']),
]

/** A fake `gh` answering every `gh issue list` with these issues; counts its runs. */
const gh = (on: On, answer: () => ProcessRunResult = () => ran(0, JSON.stringify(ISSUES))) => {
  const runs: string[][] = []
  on('process.run', (_, e) => {
    runs.push([...e.argv])

    return { value: answer() }
  })

  return runs
}

/** Answers the engine's side of the mod: its store, its command, its pane. */
const engine = (on: On, stored: Record<string, unknown> = {}) => {
  const kept = new Map(Object.entries(stored))
  on('store.get', (_, e) => ({ value: kept.get(e.key) }))
  on('store.set', (_, e) => {
    kept.set(e.key, e.value)

    return { value: undefined }
  })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  const opened: string[] = []
  on('ui.open', (_, e) => {
    opened.push(e.id)

    return { value: { isPlaced: true } }
  })

  const filled: PromptFillInput[] = []
  on('prompt.fill', (_, e) => {
    filled.push(e)

    return { isFilled: true }
  })

  const submitted: string[] = []
  on('prompt.submit', (_, e) => {
    submitted.push(e.text)

    return { text: e.text }
  })

  return { opened, filled, submitted }
}

/** Runs `/quest-board` as the person types it. */
const questBoard = ($: Engine) =>
  $.command.run({
    command: 'quest-board',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })

type Drawn = {
  findAll: (query: { type: string }) => Promise<{ key: string | undefined; text: string }[]>
}

/** Every Text the board shows, as shown. */
const texts = async (ui: Drawn) => (await ui.findAll({ type: 'Text' })).map(found => found.text)

/** The keys of the Quest cards the board shows, in order. */
const cards = async (ui: Drawn) =>
  (await ui.findAll({ type: 'Button' }))
    .map(found => found.key ?? '')
    .filter(key => key.startsWith('quest:'))


describe('Quest Board', () => {
  test('/quest-board opens the pane, listing the open issues as Quest cards', async ($, on) => {
    const { opened } = engine(on)
    const runs = gh(on)
    await $.session.start(START)

    await questBoard($)

    expect(opened).toContain('quest-board')
    expect(runs[0]?.slice(0, 3)).toEqual(['gh', 'issue', 'list'])

    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BOARD, surface })

      const card = await ui.find({ type: 'Button', key: 'quest:#5' })
      expect(card?.text).toBe('#5 Quest Board from GitHub Issues')
      const shown = await texts(ui)
      expect(shown).toContain('Medium · 100 XP · INT · ready-for-agent')
      expect(shown).toContain('Hard · 200 XP · INT · needs-triage')
      expect(shown).toContain('Trivial · 25 XP · STR · ready-for-agent')
      await ui.unmount()
    }
  })

  test('a Player of any level sees the same difficulty and reward', async ($, on) => {
    engine(on, {
      player: {
        level: 12,
        xp: 0,
        hp: 100,
        maxHp: 100,
        stats: {
          intelligence: 40,
          wisdom: 0,
          dexterity: 0,
          strength: 40,
          charisma: 0,
          constitution: 0,
        },
      },
    })
    gh(on)
    await $.session.start(START)
    await questBoard($)

    const ui = await $.ui.mount({ ...BOARD, surface: 'terminal' })
    expect(await texts(ui)).toContain('Medium · 100 XP · INT · ready-for-agent')
    await ui.unmount()
  })

  test('the status filter shows only the Quests of the status picked', async ($, on) => {
    engine(on)
    gh(on)
    await $.session.start(START)
    await questBoard($)

    const ui = await $.ui.mount({ ...BOARD, surface: 'terminal' })
    expect((await ui.find({ type: 'Button', key: 'filter-status' }))?.text).toBe('Status: all')

    await ui.press({ key: 'filter-status' })
    expect((await ui.find({ type: 'Button', key: 'filter-status' }))?.text).toBe(
      'Status: ready-for-agent',
    )
    expect(await ui.find({ type: 'Button', key: 'quest:#5' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'quest:#9' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'quest:#6' })).toBeUndefined()

    await ui.press({ key: 'filter-status' })
    expect((await ui.find({ type: 'Button', key: 'filter-status' }))?.text).toBe(
      'Status: needs-triage',
    )
    expect(await ui.find({ type: 'Button', key: 'quest:#5' })).toBeUndefined()
    expect(await ui.find({ type: 'Button', key: 'quest:#6' })).toBeDefined()

    await ui.press({ key: 'filter-status' })
    expect((await ui.find({ type: 'Button', key: 'filter-status' }))?.text).toBe('Status: all')
    expect(await cards(ui)).toEqual(['quest:#5', 'quest:#6', 'quest:#9'])
    await ui.unmount()
  })

  test('the difficulty filter steps through the difficulties listed, easiest first', async ($, on) => {
    engine(on)
    gh(on)
    await $.session.start(START)
    await questBoard($)

    const ui = await $.ui.mount({ ...BOARD, surface: 'desktop' })
    const filter = async () => (await ui.find({ type: 'Button', key: 'filter-difficulty' }))?.text

    expect(await filter()).toBe('Difficulty: all')
    await ui.press({ key: 'filter-difficulty' })
    expect(await filter()).toBe('Difficulty: Trivial')
    expect(await cards(ui)).toEqual(['quest:#9'])
    await ui.press({ key: 'filter-difficulty' })
    expect(await filter()).toBe('Difficulty: Medium')
    expect(await cards(ui)).toEqual(['quest:#5'])
    await ui.press({ key: 'filter-difficulty' })
    expect(await filter()).toBe('Difficulty: Hard')
    expect(await cards(ui)).toEqual(['quest:#6'])
    await ui.press({ key: 'filter-difficulty' })
    expect(await filter()).toBe('Difficulty: all')
    await ui.unmount()
  })

  test('filters that match no Quest say so', async ($, on) => {
    engine(on)
    gh(on)
    await $.session.start(START)
    await questBoard($)

    const ui = await $.ui.mount({ ...BOARD, surface: 'terminal' })
    await ui.press({ key: 'filter-status' }) // ready-for-agent
    await ui.press({ key: 'filter-difficulty' }) // Trivial: #9
    await ui.press({ key: 'filter-difficulty' }) // Medium: #5
    await ui.press({ key: 'filter-difficulty' }) // Hard: none ready-for-agent

    expect(await cards(ui)).toEqual([])
    expect(await texts(ui)).toContain('No Quests match these filters.')
    await ui.unmount()
  })

  test('clicking a card fills the prompt with /implement for its ticket, and does not send it', async ($, on) => {
    const { filled, submitted } = engine(on)
    gh(on)
    await $.session.start(START)
    await questBoard($)

    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BOARD, surface })
      await ui.press({ key: 'quest:#5' })
      await ui.unmount()
    }

    expect(filled.map(fill => [fill.text, fill.mode])).toEqual([
      ['/mattpocock-skills:implement #5', 'replace'],
      ['/mattpocock-skills:implement #5', 'replace'],
    ])
    expect(submitted).toEqual([])
  })

  test('a repo with no open issues shows an empty Quest Board', async ($, on) => {
    engine(on)
    gh(on, () => ran(0, '[]'))
    await $.session.start(START)
    await questBoard($)

    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BOARD, surface })
      expect(await texts(ui)).toContain('No open Quests in this Region: its Quest Source lists none open.')
      await ui.unmount()
    }
  })

  test('without gh installed, the Quest Board says how to get it', async ($, on) => {
    engine(on)
    on('process.run', () => {
      throw new Error('spawn gh ENOENT')
    })
    await $.session.start(START)
    await questBoard($)

    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BOARD, surface })
      const shown = await texts(ui)
      expect(shown).toContain('The Quest Board could not be read.')
      expect(shown).toContain('gh, the GitHub CLI, is not installed: see https://cli.github.com.')
      await ui.unmount()
    }
  })

  test('with gh signed out, the Quest Board says to sign in', async ($, on) => {
    engine(on)
    gh(on, () => ran(4, '', 'To get started with GitHub CLI, please run:  gh auth login\n'))
    await $.session.start(START)
    await questBoard($)

    const ui = await $.ui.mount({ ...BOARD, surface: 'terminal' })
    expect(await texts(ui)).toContain('gh is not signed in: run `gh auth login`.')
    await ui.unmount()
  })

  test('Refresh reads the Quest Source again', async ($, on) => {
    engine(on)
    let answer = ran(4, '', 'To get started with GitHub CLI, please run:  gh auth login\n')
    const runs = gh(on, () => answer)
    await $.session.start(START)
    await questBoard($)

    const ui = await $.ui.mount({ ...BOARD, surface: 'terminal' })
    expect(await ui.find({ type: 'Button', key: 'quest:#5' })).toBeUndefined()

    answer = ran(0, JSON.stringify(ISSUES))
    await ui.press({ key: 'refresh' })

    expect(runs).toHaveLength(2)
    expect(await ui.find({ type: 'Button', key: 'quest:#5' })).toBeDefined()
    await ui.unmount()
  })
})
