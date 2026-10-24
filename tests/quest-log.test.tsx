// The Quest Log (`/quest`, `/quest <ticket>`): everything the game knows of
// one Quest. Its rules as pure helpers (the active Quest's progress from the
// game alone, the description's cut, the Scroll's excerpt, the command's
// argument), then the pane as the Player sees it.

import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'

import { newGame, questProgressOf, step } from '../src/engine'
import type { GameEvent, GameState, QuestionContent } from '../src/engine'
import { DESCRIPTION_CUT, descriptionShown, EXCERPT_CHARS, excerptOf, questArgOf } from '../src/quest-log'
import { bandTexts, GAME, inPanel } from './fixtures/game-screen'

const play = (state: GameState, ...events: GameEvent[]): GameState =>
  events.reduce((played, event) => step(played, event).state, state)

const T = Date.UTC(2026, 9, 24, 12, 0)

const read = (path: string, module: string): GameEvent => ({ type: 'FILE_READ', path, module })
const forge = (path: string): GameEvent => ({
  type: 'FILE_EDIT',
  path,
  module: 'src',
  isNewFile: true,
  linesBefore: null,
  linesAdded: 12,
  linesRemoved: 0,
  diff: '@@ -0,0 +1,12 @@\n+export {}',
})
const fix: GameEvent = {
  type: 'FILE_EDIT',
  path: 'src/a.ts',
  module: 'src',
  isNewFile: false,
  linesBefore: 40,
  linesAdded: 1,
  linesRemoved: 1,
  diff: '@@ -1 +1 @@\n-a\n+b',
}
const fail = (failures: number, check = 'vitest run', kind: 'test' | 'lint' = 'test'): GameEvent => ({
  type: 'TEST_FAIL',
  check,
  kind,
  failures,
})
const pass = (check = 'vitest run'): GameEvent => ({ type: 'TEST_PASS', check, kind: 'test' })
const question = (prompt: string): QuestionContent => ({
  prompt,
  options: ['It throws', 'It adds the gold', 'It returns', 'It unlocks'],
  answer: 0,
  explanation: 'It throws before adding any gold.',
  stat: 'intelligence',
  source: { path: 'src/vault.ts', lines: ['if (vault.locked) {'] },
})
const ready = (prompt: string): GameEvent => ({ type: 'QUESTION_READY', question: question(prompt), at: T })
const answerFirst = (state: GameState, choice: number): GameState =>
  step(state, { type: 'QUESTION_ANSWERED', id: state.questions[0]?.id ?? 'none', choice, at: T + 60_000 }).state

/** A Quest well under way: two Modules discovered, an item forged, a Battle won and one standing, two answers. */
const underWay = (): GameState => {
  const started = play(
    newGame(),
    { type: 'QUEST_START', ticket: '#21' },
    read('src/engine.ts', 'src'),
    read('src/hud.tsx', 'src'),
    read('lib/x.ts', 'lib'),
    forge('src/order-ledger.ts'),
    fail(2),
    fix,
    pass(),
    fail(3, 'eslint .', 'lint'),
    ready('One?'),
    ready('Two?'),
    ready('Three?'),
  )

  return answerFirst(answerFirst(started, 0), 1)
}

describe('Quest Log: the active Quest\'s progress, from the game alone', () => {
  test('between Quests there is no progress to show', () => {
    expect(questProgressOf(newGame())).toBeNull()
  })

  test('a Quest just started has nothing yet, every XP pool empty against its cap', () => {
    const progress = questProgressOf(play(newGame(), { type: 'QUEST_START', ticket: '#21' }))

    expect(progress).toEqual({
      ticket: '#21',
      encounters: 0,
      modulesDiscovered: [],
      itemsForged: [],
      battlesWon: 0,
      battlesStanding: [],
      questions: { right: 0, wrong: 0, waiting: 0 },
      boss: { status: 'none' },
      pools: [
        { pool: 'ambient', earned: 0, cap: 60, isFull: false },
        { pool: 'battle', earned: 0, cap: 60, isFull: false },
        { pool: 'sage', earned: 0, cap: 200, isFull: false },
      ],
    })
  })

  test('counts the Modules discovered, items forged, Battles won and standing, and the answers', () => {
    const progress = questProgressOf(underWay())

    expect(progress).toMatchObject({
      ticket: '#21',
      modulesDiscovered: ['src', 'lib'],
      itemsForged: ['Order Ledger'],
      battlesWon: 1,
      battlesStanding: [{ check: 'eslint .', foe: 'lint', hp: 3, maxHp: 3 }],
      questions: { right: 1, wrong: 1, waiting: 1 },
      boss: { status: 'none' },
    })
    // Three reads, a Crafting, three Battle runs.
    expect(progress?.encounters).toBe(7)
  })

  test('XP by pool: reads, discoveries and Crafting ambient; the Battle 10 per HP; the Sage 20 a right answer', () => {
    expect(questProgressOf(underWay())?.pools).toEqual([
      // 3 reads (1 each), 2 discoveries (5 each), a Crafting (5).
      { pool: 'ambient', earned: 18, cap: 60, isFull: false },
      { pool: 'battle', earned: 20, cap: 60, isFull: false },
      { pool: 'sage', earned: 20, cap: 200, isFull: false },
    ])
  })

  test('a full pool says so', () => {
    const won = [fail(3), fix, pass()]
    const state = play(newGame(), { type: 'QUEST_START', ticket: '#21' }, ...won, ...won, ...won)

    expect(questProgressOf(state)?.pools[1]).toEqual({ pool: 'battle', earned: 60, cap: 60, isFull: true })
  })

  test('the first commit has the boss approaching; once its Questions wait, it stands with its HP', () => {
    const committed = play(underWay(), { type: 'COMMIT', sha: 'abc1234', cwd: null })
    expect(questProgressOf(committed)?.boss).toEqual({ status: 'approaching' })

    const fighting = play(committed, {
      type: 'BOSS_FIGHT_READY',
      ticket: '#21',
      questions: [question('B1?'), question('B2?'), question('B3?')],
      at: T,
    })
    expect(questProgressOf(fighting)?.boss).toEqual({ status: 'fighting', hp: 2, maxHp: 2, questionsLeft: 3 })
  })
})

describe('Quest Log: the description shown', () => {
  test('a description up to 8000 characters is shown whole', () => {
    const text = 'a'.repeat(8000)

    expect(DESCRIPTION_CUT).toBe(8000)
    expect(descriptionShown(text)).toBe(text)
  })

  test('a longer one is cut at 8000, saying the rest is on the ticket', () => {
    const shown = descriptionShown(`${'a'.repeat(8000)}b`)

    expect(shown.startsWith('a'.repeat(8000))).toBe(true)
    expect(shown).not.toContain('b')
    expect(shown.endsWith('… (open the ticket for the rest)')).toBe(true)
  })

  test('a cut inside a code fence closes it, so the note is not drawn as code', () => {
    const shown = descriptionShown(`Intro\n\n\`\`\`ts\n${'x'.repeat(8100)}\n\`\`\``)

    expect(shown.endsWith('\n```\n\n… (open the ticket for the rest)')).toBe(true)
  })
})

describe('Quest Log: the Scroll\'s excerpt', () => {
  test('is the description as plain text: Markdown marks taken out, lines run together', () => {
    expect(excerptOf('## Problem\n\nOrders of **10** or more get [10% off](https://example.com).\n\n- [ ] `done`')).toBe(
      'Problem Orders of 10 or more get 10% off. done',
    )
  })

  test('a description longer than 300 characters is cut to 300, with …', () => {
    const excerpt = excerptOf('word '.repeat(100))

    expect(EXCERPT_CHARS).toBe(300)
    expect(excerpt.length).toBeLessThanOrEqual(300)
    expect(excerpt.endsWith('…')).toBe(true)
  })

  test('a short one is whole, with no …', () => {
    expect(excerptOf('Fix the crash.')).toBe('Fix the crash.')
  })
})

describe('Quest Log: /quest\'s argument', () => {
  test('none is the active Quest', () => {
    expect(questArgOf('')).toEqual({ kind: 'active' })
    expect(questArgOf('  ')).toEqual({ kind: 'active' })
  })

  test('a GitHub issue as #N, N or its URL; a Jira key or its browse URL', () => {
    expect(questArgOf('#21')).toEqual({ kind: 'ticket', ticket: '#21' })
    expect(questArgOf('21')).toEqual({ kind: 'ticket', ticket: '#21' })
    expect(questArgOf('https://github.com/majinmarco/claude-quest/issues/21')).toEqual({ kind: 'ticket', ticket: '#21' })
    expect(questArgOf('ABC-123')).toEqual({ kind: 'ticket', ticket: 'ABC-123' })
    expect(questArgOf('https://acme.atlassian.net/browse/ABC-123')).toEqual({ kind: 'ticket', ticket: 'ABC-123' })
  })

  test('anything else names no ticket', () => {
    expect(questArgOf('the brief')).toEqual({ kind: 'invalid' })
    expect(questArgOf('abc-123')).toEqual({ kind: 'invalid' })
  })
})

// The Game Screen, as the Player sees it: the log is its panel.

const LOG = GAME

const START = { cwd: '/work', surface: 'desktop', isInteractive: true } as const
const REGION = '/work/.claude/claude-quest.json'
const GITHUB_REPO = { root: '/work', remote: 'git@github.com:majinmarco/claude-quest.git', internal: false, name: null }

const ran = (exitCode: number, stdout: string, stderr = ''): ProcessRunResult => ({
  exitCode,
  stdout,
  stderr,
  isStdoutTruncated: false,
  isStderrTruncated: false,
})

const BODY = '## Problem\n\nThe Player never sees the **description**.\n\n- [ ] Show it whole'

const ISSUES = [
  {
    number: 5,
    title: 'Quest Log: the whole ticket',
    url: 'https://github.com/majinmarco/claude-quest/issues/5',
    state: 'OPEN',
    labels: [{ name: 'ready-for-agent' }, { name: 'size: M' }],
    body: BODY,
  },
  {
    number: 6,
    title: 'Quest Board from Jira',
    url: 'https://github.com/majinmarco/claude-quest/issues/6',
    state: 'CLOSED',
    labels: [{ name: 'size: L' }],
    body: 'Done already.',
  },
]

/**
 * The session around the mod: `gh` answering these issues (`gh issue view N`
 * with its body), a Region file, the commands, a prompt box, toasts and
 * panes opened. Counts gh's runs.
 */
const world = (
  on: On,
  { issues = ISSUES, region = null as unknown, failing = false, draft = '' } = {},
) => {
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 24, 12, 0) })
  const kept = new Map<string, unknown>()
  on('store.get', (_, e) => ({ value: kept.get(e.key) }))
  on('store.set', (_, e) => {
    kept.set(e.key, e.value)

    return { value: undefined }
  })
  on('session.repo', () => ({ value: GITHUB_REPO }))
  on('session.root', () => ({ value: '/work' }))
  let file = region
  on('fs.exists', (_, e) => ({ value: e.path === REGION && file !== null }))
  on('fs.read', () => ({ value: JSON.stringify(file) }))
  on('fs.write', (_, e) => {
    file = JSON.parse(e.text)

    return { value: undefined }
  })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('command.list', () => ({
    value: ['mattpocock-skills:implement'].map(name => ({ name, description: name, source: 'plugin' as const })),
  }))
  on('command.run', () => ({}))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.log', () => ({ value: undefined }))
  const toasts: string[] = []
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  const opened: string[] = []
  on('ui.open', (_, e) => {
    opened.push(e.id)

    return { value: { isPlaced: true } }
  })
  on('prompt.read', () => ({ value: { text: draft, cursor: draft.length } }))
  const filled: string[] = []
  on('prompt.fill', (_, e) => {
    filled.push(e.text)

    return { isFilled: true }
  })
  const views: string[] = []
  on('process.run', (_, e) => {
    if (failing) {
      return { value: ran(1, '', 'error connecting to api.github.com\n') }
    }
    if (e.argv[2] === 'view') {
      views.push(String(e.argv[3]))
      const found = issues.find(one => String(one.number) === e.argv[3])

      return {
        value:
          found === undefined
            ? ran(1, '', `GraphQL: Could not resolve to an issue or pull request with the number of ${e.argv[3]}. (repository.issue)\n`)
            : ran(0, JSON.stringify(found)),
      }
    }

    return { value: ran(0, JSON.stringify(issues.map(({ body: _, ...listed }) => listed))) }
  })

  return { toasts, opened, filled, views, settle: () => clock.settle(), region: () => file }
}

const run = ($: Engine, command: string, args = '') =>
  $.command.run({ command, args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })

type Drawn = Parameters<typeof inPanel>[0]

/** The Texts of the panel: the view shown. */
const textsOf = async (ui: Drawn) => (await inPanel(ui, 'Text')).map(found => found.text)

/** The characters an SVG letters, by the glyphs it places, in order. */
const lettered = (svg: string): string =>
  [...svg.matchAll(/<use href="#g([0-9a-f]+)"/g)].map(([, code]) => String.fromCodePoint(parseInt(code ?? '3f', 16))).join('')

describe('Quest Log: /quest', () => {
  test('with no Quest under way and no ticket named, it says so and points to the Quest Board, opening nothing', async ($, on) => {
    const { opened, views } = world(on)
    await $.session.start(START)

    const said = await run($, 'quest')

    expect(said.text).toBe(
      "No Quest under way: pick one on the Quest Board (/quest-board), or open any ticket's log with /quest #N or /quest ABC-123.",
    )
    expect(opened).toEqual([])
    expect(views).toEqual([])
  })

  test('an argument that names no ticket says how to name one', async ($, on) => {
    const { opened } = world(on)
    await $.session.start(START)

    expect((await run($, 'quest', 'the brief')).text).toBe(
      'The Quest Log opens a ticket by its reference: /quest #N, or a Jira key such as /quest ABC-123.',
    )
    expect(opened).toEqual([])
  })

  test('/quest #N opens any ticket\'s log: its Scroll at full width, its link, its whole description as Markdown', async ($, on) => {
    const { opened, views, settle } = world(on)
    await $.session.start(START)

    const said = await run($, 'quest', '#5')
    await settle()

    expect(said.text).toBe('Quest Log opened: #5.')
    expect(opened).toEqual(['game'])
    expect(views).toEqual(['5'])

    const ui = await $.ui.mount({ ...LOG, surface: 'desktop' })
    const art = (await inPanel(ui, 'Svg'))[0]
    expect(art?.props.alt).toBe('#5 Quest Log: the whole ticket · Medium · Boss: +100 XP · INT · ready-for-agent')
    expect(String(art?.props.source)).toMatch(/^<svg [^>]*viewBox="0 0 320 \d+" width="640"/)
    expect(lettered(String(art?.props.source))).toContain('QuestLog:thewholeticket')
    expect((await ui.find({ type: 'Link' }))?.props.href).toBe('https://github.com/majinmarco/claude-quest/issues/5')
    expect((await ui.find({ type: 'Markdown' }))?.props.text).toBe(BODY)
    await ui.unmount()
  })

  test('a ticket is fetched once per session: opened again, it is not asked again', async ($, on) => {
    const { views, settle } = world(on)
    await $.session.start(START)

    await run($, 'quest', '#5')
    await settle()
    await run($, 'quest', '5')
    await settle()

    expect(views).toEqual(['5'])
  })

  test('a description over 8000 characters is cut there, pointing to the ticket', async ($, on) => {
    const long = `${'x'.repeat(8000)}TAIL`
    const { settle } = world(on, { issues: [{ ...ISSUES[0]!, body: long }] })
    await $.session.start(START)
    await run($, 'quest', '#5')
    await settle()

    const ui = await $.ui.mount({ ...LOG, surface: 'terminal' })
    const text = String((await ui.find({ type: 'Markdown' }))?.props.text)
    expect(text).not.toContain('TAIL')
    expect(text.endsWith('… (open the ticket for the rest)')).toBe(true)
    await ui.unmount()
  })

  test('a Quest Source that cannot be reached says why, with the Board\'s hint, and Refresh asks again', async ($, on) => {
    const { settle } = world(on, { failing: true })
    await $.session.start(START)
    await run($, 'quest', '#5')
    await settle()

    const ui = await $.ui.mount({ ...LOG, surface: 'terminal' })
    const shown = await textsOf(ui)
    expect(shown).toContain('The ticket could not be fetched.')
    expect(shown).toContain('error connecting to api.github.com')
    expect(shown).toContain('The Quest Source is chosen in .claude/claude-quest.json: "github" (the default) or "jira".')
    expect(await ui.find({ type: 'Markdown' })).toBeUndefined()
    await ui.unmount()
  })

  test('a ticket the Quest Source has not got says so, and offers no Take Quest', async ($, on) => {
    const { settle } = world(on)
    await $.session.start(START)
    await run($, 'quest', '#99')
    await settle()

    const ui = await $.ui.mount({ ...LOG, surface: 'terminal' })
    expect(await textsOf(ui)).toContain("No ticket #99 in this Region's Quest Source.")
    expect((await ui.findAll({ type: 'Button' })).some(button => button.text.startsWith('Take Quest'))).toBe(false)
    await ui.unmount()
  })

  test('a Quest not under way: Take Quest fills the implement command, as the Board does, keeping a draft', async ($, on) => {
    const { filled, settle } = world(on)
    await $.session.start(START)
    await run($, 'quest', '#5')
    await settle()

    const ui = await $.ui.mount({ ...LOG, surface: 'desktop' })
    await ui.press({ key: 'quest-log-take:#5' })
    await ui.unmount()

    expect(filled).toEqual(['/mattpocock-skills:implement #5'])
  })

  test('Take Quest never writes over a draft the Player is writing', async ($, on) => {
    const { filled, toasts, settle } = world(on, { draft: 'half a thought' })
    await $.session.start(START)
    await run($, 'quest', '#5')
    await settle()

    const ui = await $.ui.mount({ ...LOG, surface: 'terminal' })
    await ui.press({ key: 'quest-log-take:#5' })
    await ui.unmount()

    expect(filled).toEqual([])
    expect(toasts).toContain('Draft kept: clear it and pick again, or run /mattpocock-skills:implement #5')
  })

  test('a closed ticket offers no Take Quest; its Region file history shows each run', async ($, on) => {
    const { settle } = world(on, {
      region: {
        quests: [
          { ticket: '#6', startedAt: '2026-10-20T10:00:00.000Z', status: 'lost', endedAt: '2026-10-20T11:30:00.000Z' },
          { ticket: '#5', startedAt: '2026-10-21T09:00:00.000Z', status: 'abandoned' },
          { ticket: '#6', startedAt: '2026-10-22T08:00:00.000Z', resumedAt: '2026-10-23T08:00:00.000Z', status: 'won', endedAt: '2026-10-23T09:15:00.000Z' },
        ],
      },
    })
    await $.session.start(START)
    await run($, 'quest', '#6')
    await settle()

    const ui = await $.ui.mount({ ...LOG, surface: 'terminal' })
    const shown = await textsOf(ui)
    expect(shown).toContain('History')
    expect(shown).toContain('lost · started 2026-10-20 10:00 UTC · ended 2026-10-20 11:30 UTC')
    expect(shown).toContain('won · started 2026-10-22 08:00 UTC · resumed 2026-10-23 08:00 UTC · ended 2026-10-23 09:15 UTC')
    expect(shown.some(text => text.includes('2026-10-21'))).toBe(false)
    expect((await ui.findAll({ type: 'Button' })).some(button => button.text.startsWith('Take Quest'))).toBe(false)
    await ui.unmount()
  })

  test('in the terminal the same sections, the Scroll as text inside the pane', async ($, on) => {
    const { settle } = world(on)
    await $.session.start(START)
    await run($, 'quest', '#5')
    await settle()

    const ui = await $.ui.mount({ ...LOG, surface: 'terminal' })
    expect(await ui.find({ type: 'Svg' })).toBeUndefined()
    const shown = await textsOf(ui)
    expect(shown.some(text => /^│ Quest #5 +◆◆◆◇◇ │$/.test(text))).toBe(true)
    expect(shown.some(text => text.startsWith('│ Quest Log: the whole ticket'))).toBe(true)
    expect(shown.filter(text => text.startsWith('│')).every(text => [...text].length <= 80)).toBe(true)
    expect(shown).toContain('The ticket')
    expect((await ui.find({ type: 'Markdown' }))?.props.text).toBe(BODY)
    expect((await ui.find({ type: 'Link' }))?.props.href).toBe('https://github.com/majinmarco/claude-quest/issues/5')
    await ui.unmount()
  })

  test("the Quest Giver's briefing shows once it is written for the ticket", async ($, on) => {
    const { settle } = world(on)
    on('state.get', (_, e, next) =>
      e.key === 'briefing' && e.id === '#5' ? { value: { value: { text: 'Bring back the whole ticket.' }, version: 1 } } : next(e),
    )
    await $.session.start(START)
    await run($, 'quest', '#5')
    await settle()

    const ui = await $.ui.mount({ ...LOG, surface: 'terminal' })
    const shown = await textsOf(ui)
    expect(shown).toContain("The Quest Giver's briefing")
    expect(shown).toContain('Bring back the whole ticket.')
    await ui.unmount()
  })
})

describe('Quest Log: the Quest under way', () => {
  test('QUEST_STARTED points to the brief; the log never opens itself', async ($, on) => {
    const { toasts, opened, settle } = world(on)
    await $.session.start(START)

    await run($, 'mattpocock-skills:implement', '#5')
    await settle()

    expect(toasts).toContain('Quest started: #5 · /quest for the brief')
    expect(opened).toEqual([])
  })

  test('/quest opens it, reusing the ticket lookup\'s fetch, with the Quest\'s progress and no Take Quest', async ($, on) => {
    const { views, settle } = world(on)
    await $.session.start(START)
    await run($, 'mattpocock-skills:implement', '#5')
    await settle()

    const said = await run($, 'quest')
    await settle()

    expect(said.text).toBe('Quest Log opened: #5 Quest Log: the whole ticket.')
    expect(views).toEqual(['5'])
    const ui = await $.ui.mount({ ...LOG, surface: 'terminal' })
    const shown = await textsOf(ui)
    expect((await ui.find({ type: 'Markdown' }))?.props.text).toBe(BODY)
    expect(shown).toContain('Progress')
    expect(shown).toContain('Started 2026-10-24 12:00 UTC')
    expect(shown).toContain('Encounters: 0 · Modules discovered: 0 · Items forged: 0')
    expect(shown).toContain('Battles: 0 won · 0 standing')
    expect(shown).toContain('Questions: 0 right · 0 wrong · 0 waiting')
    expect(shown).toContain("Boss: not yet: the Quest's first commit summons it.")
    expect(shown).toContain('XP this Quest, by pool: ambient 0/60 · battle 0/60 · sage 0/200')
    expect((await ui.findAll({ type: 'Button' })).some(button => button.text.startsWith('Take Quest'))).toBe(false)
    await ui.unmount()
  })

  test('a ticket fetched by the log first is not looked up again when its Quest starts', async ($, on) => {
    const { views, settle } = world(on)
    await $.session.start(START)
    await run($, 'quest', '#5')
    await settle()

    await run($, 'mattpocock-skills:implement', '#5')
    await settle()

    expect(views).toEqual(['5'])
  })
})

describe('Quest Log: opened from the other views', () => {
  test("the Quest Board's unrolled Scroll shows the description's start, and Read more opens the log", async ($, on) => {
    const { opened, views, settle } = world(on)
    await $.session.start(START)
    await run($, 'quest-board')
    await settle()

    const ui = await $.ui.mount({ ...LOG, surface: 'desktop' })
    expect(await ui.find({ type: 'Button', key: 'log:#5' })).toBeUndefined()
    await ui.press({ key: 'scroll:#5' })
    await settle()
    expect(views).toEqual(['5'])
    const art = (await inPanel(ui, 'Svg')).find(svg => String(svg.props.alt).startsWith('#5 '))
    expect(lettered(String(art?.props.source))).toContain('ProblemThePlayerneverseesthedescription.Showitwhole')
    await ui.unmount()

    const terminal = await $.ui.mount({ ...LOG, surface: 'terminal' })
    expect((await textsOf(terminal)).some(text => text.startsWith('│ Problem The Player never sees'))).toBe(true)
    await terminal.press({ key: 'log:#5' })
    await settle()
    expect(opened).toEqual(['game', 'game'])
    expect((await terminal.find({ type: 'Button', key: 'game-tab:log' }))?.props.variant).toBe('primary')
    expect(await terminal.find({ type: 'Markdown' })).toBeDefined()
    // Fetched on Unroll, the log asks nothing again.
    expect(views).toEqual(['5'])
    await terminal.unmount()
  })

  test("the dialogue box is headed by the active Quest, its Quest Log a press away", async ($, on) => {
    const { opened, settle } = world(on)
    await $.session.start(START)
    await run($, 'mattpocock-skills:implement', '#5')
    await settle()

    const ui = await $.ui.mount({ ...LOG, surface: 'terminal' })
    expect((await bandTexts(ui, 'game-dialogue'))[0]).toBe('Quest #5 Quest Log: the whole ticket')
    await ui.press({ key: 'quest-log-open' })
    expect((await ui.find({ type: 'Button', key: 'game-tab:log' }))?.props.variant).toBe('primary')
    await ui.unmount()

    expect(opened).toContain('game')
  })

  test('between Quests the dialogue box has no Quest header', async ($, on) => {
    world(on)
    await $.session.start(START)

    const ui = await $.ui.mount({ ...LOG, surface: 'terminal' })
    expect(await ui.find({ type: 'Button', key: 'quest-log-open' })).toBeUndefined()
    await ui.unmount()
  })
})
