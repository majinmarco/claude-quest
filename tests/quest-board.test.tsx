import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { McpToolResult, On, PromptFillInput, ProcessRunResult } from 'claude-code'

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

/**
 * A fake `gh`: `gh issue list` answers `answer()`, these issues by default;
 * `gh issue view N` answers issue N of them, with a body, or no such issue.
 * Counts its runs.
 */
const gh = (on: On, answer: () => ProcessRunResult = () => ran(0, JSON.stringify(ISSUES))) => {
  const runs: string[][] = []
  on('process.run', (_, e) => {
    runs.push([...e.argv])
    if (e.argv[2] === 'view') {
      const found = ISSUES.find(one => String(one.number) === e.argv[3])

      return {
        value:
          found === undefined
            ? ran(1, '', `GraphQL: Could not resolve to an issue or pull request with the number of ${e.argv[3]}. (repository.issue)\n`)
            : ran(0, JSON.stringify({ ...found, body: `The body of #${found.number}.` })),
      }
    }

    return { value: answer() }
  })

  return runs
}

/** What the session around the mod has: its repo, its commands, the draft in its prompt box. */
type Around = {
  repo?: { root: string; remote: string | null; internal: boolean; name: string | null } | null
  commands?: string[]
  draft?: string
}

const GITHUB_REPO = { root: '/work', remote: 'git@github.com:majinmarco/claude-quest.git', internal: false, name: null }

/** Answers the engine's side of the mod: its store, its command, its pane. */
const engine = (
  on: On,
  stored: Record<string, unknown> = {},
  { repo = GITHUB_REPO, commands = ['mattpocock-skills:implement', 'mattpocock-skills:triage'], draft = '' }: Around = {},
) => {
  const kept = new Map(Object.entries(stored))
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 23, 20, 0) })
  on('session.repo', () => ({ value: repo }))
  on('command.list', () => ({
    value: commands.map(name => ({ name, description: name, source: 'plugin' as const })),
  }))
  const prompt = { draft }
  on('prompt.read', () => ({ value: { text: prompt.draft, cursor: prompt.draft.length } }))
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

  return { opened, filled, submitted, toasts, prompt, settle: () => clock.settle() }
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
      expect(shown).toContain('Medium · Boss: +100 XP · INT · ready-for-agent')
      expect(shown).toContain('Hard · Boss: +140 XP · INT · needs-triage')
      expect(shown).toContain('Trivial · Boss: +40 XP · STR · ready-for-agent')
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
    expect(await texts(ui)).toContain('Medium · Boss: +100 XP · INT · ready-for-agent')
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

  test('a Quest started for a ticket the board listed takes its title and difficulty', async ($, on) => {
    engine(on)
    gh(on)
    on('command.run', () => ({}))
    const games: { quest?: { ticket: string; title?: string; difficulty?: string } | null }[] = []
    on('state.set', (_, e, next) => {
      games.push(e.value as (typeof games)[number])

      return next(e)
    })
    await $.session.start(START)
    await questBoard($)

    await $.command.run({
      command: 'mattpocock-skills:implement',
      args: '#5',
      origin: { kind: 'composer' },
      presentation: { isFullscreen: false, columns: 120 },
    })

    const quest = games.filter(game => game.quest !== undefined).at(-1)?.quest
    expect(quest).toMatchObject({ ticket: '#5', title: 'Quest Board from GitHub Issues', difficulty: 'Medium' })
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

  test('where commands cannot be run, the Quest Board says so, not that gh is missing', async ($, on) => {
    // No process.run hook: the call rejects, as on a surface that runs no
    // commands. (gh missing, ENOENT, is the adapter's test: a test hook's
    // throw never reaches the mod.)
    engine(on)
    await $.session.start(START)
    await questBoard($)

    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BOARD, surface })
      const shown = await texts(ui)
      expect(shown).toContain('The Quest Board could not be read.')
      expect(shown.some(text => text.startsWith('gh could not be run here ('))).toBe(true)
      expect(shown.some(text => text.includes('not installed'))).toBe(false)
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

const REGION = '/work/.claude/claude-quest.json'

/** The project's Region file, as the mod reads it with `$.fs`; absent when null. */
const regionFile = (on: On, region: unknown) => {
  on('session.root', () => ({ value: '/work' }))
  on('fs.exists', (_, e) => ({ value: e.path === REGION && region !== null }))
  on('fs.read', (_, e) => ({
    value: typeof region === 'string' ? region : JSON.stringify(region),
  }))
}

const answered = (value: unknown, isError = false): McpToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(value) }],
  isError,
})

const JIRA_ISSUES = [
  {
    key: 'CPI-12',
    webUrl: 'https://example.atlassian.net/browse/CPI-12',
    fields: {
      summary: 'Dashboard filters',
      labels: ['ready-for-agent'],
      issuetype: { name: 'Story' },
      status: { name: 'To Do' },
      customFields: { 'Story point estimate': { id: 'customfield_10016', value: 3 } },
    },
  },
  {
    key: 'CPI-9',
    webUrl: 'https://example.atlassian.net/browse/CPI-9',
    fields: {
      summary: 'Occupancy is off by one night',
      labels: [],
      issuetype: { name: 'Bug' },
      status: { name: 'In Progress' },
    },
  },
]

/** A fake Atlassian MCP answering through `$.mcp.call`; records each call. */
const atlassian = (on: On, answer?: () => McpToolResult) => {
  const calls: { server: string; tool: string; args: Record<string, unknown> }[] = []
  on('mcp.call', (_, e) => {
    calls.push(e)
    if (answer !== undefined) {
      return { value: answer() }
    }
    if (e.tool === 'getAccessibleAtlassianResources') {
      return {
        value: answered({
          data: { resources: [{ cloudId: 'cloud-1', products: [{ id: 'jira' }] }] },
        }),
      }
    }

    return { value: answered({ issues: { nodes: JIRA_ISSUES, pageInfo: { hasNextPage: false } } }) }
  })

  return calls
}

const JIRA_REGION = {
  questSource: { kind: 'jira', project: 'CPI', storyPointsField: 'customfield_10016' },
  quests: [],
}

describe('Quest Board: the Region chooses its Quest Source', () => {
  test('a Region set to Jira lists its project through the Atlassian connection', async ($, on) => {
    engine(on)
    regionFile(on, JIRA_REGION)
    const runs = gh(on)
    const calls = atlassian(on)
    await $.session.start(START)
    await questBoard($)

    expect(runs).toEqual([])
    expect(calls.map(call => call.tool)).toEqual([
      'getAccessibleAtlassianResources',
      'searchJiraIssuesUsingJql',
    ])
    expect(calls[1]?.args.jql).toBe('project = "CPI" AND statusCategory != Done ORDER BY created DESC')

    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BOARD, surface })
      expect((await ui.find({ type: 'Button', key: 'quest:CPI-12' }))?.text).toBe(
        'CPI-12 Dashboard filters',
      )
      const shown = await texts(ui)
      expect(shown).toContain('Medium · Boss: +100 XP · INT · To Do · #ready-for-agent')
      expect(shown).toContain('Unrated · Boss: +80 XP · STR · In Progress')
      await ui.unmount()
    }
  })

  test('clicking a Jira Quest card fills the prompt with /implement for its key', async ($, on) => {
    const { filled } = engine(on)
    regionFile(on, JIRA_REGION)
    atlassian(on)
    await $.session.start(START)
    await questBoard($)

    const ui = await $.ui.mount({ ...BOARD, surface: 'terminal' })
    await ui.press({ key: 'quest:CPI-12' })
    await ui.unmount()

    expect(filled.map(fill => fill.text)).toEqual(['/mattpocock-skills:implement CPI-12'])
  })

  test('a Region set to GitHub Issues lists them with gh', async ($, on) => {
    engine(on)
    regionFile(on, { questSource: { kind: 'github' }, quests: [] })
    const runs = gh(on)
    const calls = atlassian(on)
    await $.session.start(START)
    await questBoard($)

    expect(runs[0]?.slice(0, 3)).toEqual(['gh', 'issue', 'list'])
    expect(calls).toEqual([])
  })

  test('a Region that names no Quest Source lists its GitHub Issues', async ($, on) => {
    engine(on)
    regionFile(on, { quests: [] })
    const runs = gh(on)
    await $.session.start(START)
    await questBoard($)

    expect(runs[0]?.slice(0, 3)).toEqual(['gh', 'issue', 'list'])
  })

  test('without the Atlassian connection, the Quest Board says to connect it', async ($, on) => {
    engine(on)
    regionFile(on, JIRA_REGION)
    on('mcp.call', () => {
      throw new Error('MCP server "claude.ai Atlassian MCP" is not connected')
    })
    await $.session.start(START)
    await questBoard($)

    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BOARD, surface })
      const shown = await texts(ui)
      expect(shown).toContain('The Quest Board could not be read.')
      expect(shown.some(text => text.startsWith(
        'The Atlassian connection (claude.ai Atlassian MCP) is not available: connect it with /mcp.',
      ))).toBe(true)
      await ui.unmount()
    }
  })

  test('with the Atlassian connection signed out, the Quest Board says to sign in', async ($, on) => {
    engine(on)
    regionFile(on, JIRA_REGION)
    atlassian(on, () => answered({ error: true, message: 'Unauthorized', statusCode: 401 }, true))
    await $.session.start(START)
    await questBoard($)

    const ui = await $.ui.mount({ ...BOARD, surface: 'terminal' })
    expect(await texts(ui)).toContain(
      'The Atlassian connection (claude.ai Atlassian MCP) is not signed in: authenticate it with /mcp.',
    )
    await ui.unmount()
  })

  test('a Jira Quest Source without a project says what to set', async ($, on) => {
    engine(on)
    regionFile(on, { questSource: { kind: 'jira' }, quests: [] })
    const calls = atlassian(on)
    await $.session.start(START)
    await questBoard($)

    expect(calls).toEqual([])
    const ui = await $.ui.mount({ ...BOARD, surface: 'terminal' })
    expect(await texts(ui)).toContain(
      'The Jira Quest Source needs its project: set questSource.project in .claude/claude-quest.json.',
    )
    await ui.unmount()
  })

  test('a Quest Source the mod does not know says which ones it does', async ($, on) => {
    engine(on)
    regionFile(on, { questSource: { kind: 'linear' }, quests: [] })
    const runs = gh(on)
    await $.session.start(START)
    await questBoard($)

    expect(runs).toEqual([])
    const ui = await $.ui.mount({ ...BOARD, surface: 'terminal' })
    expect(await texts(ui)).toContain(
      'Unknown Quest Source "linear" in .claude/claude-quest.json: use "github" or "jira".',
    )
    await ui.unmount()
  })

  test('an unavailable Quest Board says where the Quest Source is chosen', async ($, on) => {
    engine(on)
    regionFile(on, null)
    gh(on, () => ran(1, '', 'error connecting to api.github.com\n'))
    await $.session.start(START)
    await questBoard($)

    const ui = await $.ui.mount({ ...BOARD, surface: 'terminal' })
    expect(await texts(ui)).toContain(
      'The Quest Source is chosen in .claude/claude-quest.json: "github" (the default) or "jira".',
    )
    await ui.unmount()
  })

  test('a Region file that is not JSON says so, rather than guess its Quest Source', async ($, on) => {
    engine(on)
    regionFile(on, '{ "questSource": { "kind": "jira", }')
    const runs = gh(on)
    const calls = atlassian(on)
    await $.session.start(START)
    await questBoard($)

    expect(runs).toEqual([])
    expect(calls).toEqual([])
    const ui = await $.ui.mount({ ...BOARD, surface: 'terminal' })
    expect(await texts(ui)).toContain('.claude/claude-quest.json is not valid JSON.')
    await ui.unmount()
  })
})

/** Runs `/<command> <args>` as the person types it. */
const run = ($: Engine, command: string, args = '') =>
  $.command.run({
    command,
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })

/** The game the mod keeps, as last written. */
const gamesOf = (on: On) => {
  const games: { quest?: Record<string, unknown> | null }[] = []
  on('state.set', (_, e, next) => {
    games.push(e.value as (typeof games)[number])

    return next(e)
  })

  return () => games.filter(game => game.quest !== undefined).at(-1)?.quest
}

describe('Quest Board: where its Quests come from', () => {
  test('a project in no git repo, naming no Quest Source, says it has none and how to set Jira', async ($, on) => {
    engine(on, {}, { repo: null })
    const runs = gh(on)
    await $.session.start(START)
    await questBoard($)

    expect(runs).toEqual([])
    const ui = await $.ui.mount({ ...BOARD, surface: 'terminal' })
    const shown = await texts(ui)
    expect(shown.some(text => text.startsWith('This project is not in a git repository'))).toBe(true)
    expect(shown).toContain(
      'To read a Jira project, set "questSource": { "kind": "jira", "project": "KEY" } in .claude/claude-quest.json.',
    )
    await ui.unmount()
  })

  test('a repo with no remote has no GitHub Issues either', async ($, on) => {
    engine(on, {}, { repo: { ...GITHUB_REPO, remote: null } })
    const runs = gh(on)
    await $.session.start(START)
    await questBoard($)

    expect(runs).toEqual([])
    const ui = await $.ui.mount({ ...BOARD, surface: 'terminal' })
    expect((await texts(ui)).some(text => text.startsWith('This repo has no remote'))).toBe(true)
    await ui.unmount()
  })

  test('a repo whose remote is not on GitHub has no GitHub Issues: gh says so', async ($, on) => {
    engine(on)
    gh(on, () =>
      ran(1, '', 'none of the git remotes configured for this repository point to a known GitHub host. To tell gh about a new GitHub host, please use `gh auth login`\n'),
    )
    await $.session.start(START)
    await questBoard($)

    const ui = await $.ui.mount({ ...BOARD, surface: 'terminal' })
    const shown = await texts(ui)
    expect(shown).not.toContain('gh is not signed in: run `gh auth login`.')
    expect(shown).toContain(
      'To read a Jira project, set "questSource": { "kind": "jira", "project": "KEY" } in .claude/claude-quest.json.',
    )
    await ui.unmount()
  })

  test('a Region file that is not JSON is misconfigured: the hint says to fix questSource', async ($, on) => {
    engine(on)
    regionFile(on, '{ "questSource": ')
    await $.session.start(START)
    await questBoard($)

    const ui = await $.ui.mount({ ...BOARD, surface: 'terminal' })
    expect(await texts(ui)).toContain(
      'Fix questSource in .claude/claude-quest.json: { "kind": "github" }, or { "kind": "jira", "project": "KEY" }, then Refresh.',
    )
    await ui.unmount()
  })

  test('a Jira project the account cannot see is forbidden, with its own hint', async ($, on) => {
    engine(on)
    regionFile(on, JIRA_REGION)
    atlassian(on, () => answered({ error: true, message: 'Forbidden', statusCode: 403 }, true))
    await $.session.start(START)
    await questBoard($)

    const ui = await $.ui.mount({ ...BOARD, surface: 'terminal' })
    const shown = await texts(ui)
    expect(shown).toContain(
      "Your Atlassian account can't see project CPI (403): check questSource.project or ask for Browse permission.",
    )
    expect(shown).toContain('The project is questSource.project in .claude/claude-quest.json.')
    await ui.unmount()
  })
})

describe('Quest Board: hints, tags and the header', () => {
  test('a filter with fewer than two values to pick from is hidden', async ($, on) => {
    engine(on)
    gh(on, () => ran(0, JSON.stringify([issue(5, 'Five', ['ready-for-agent', 'size: M']), issue(6, 'Six', ['ready-for-agent', 'size: L'])])))
    await $.session.start(START)
    await questBoard($)

    const ui = await $.ui.mount({ ...BOARD, surface: 'terminal' })
    expect(await ui.find({ type: 'Button', key: 'filter-status' })).toBeUndefined()
    expect(await ui.find({ type: 'Button', key: 'filter-difficulty' })).toBeDefined()
    await ui.unmount()
  })

  test('when no GitHub Quest is rated, a hint says which labels rate them', async ($, on) => {
    engine(on)
    gh(on, () => ran(0, JSON.stringify([issue(5, 'Five', []), issue(6, 'Six', ['bug'])])))
    await $.session.start(START)
    await questBoard($)

    const ui = await $.ui.mount({ ...BOARD, surface: 'terminal' })
    const hint = await ui.find({ type: 'Text', text: /^No Quest is rated/ })
    expect(hint?.text).toBe('No Quest is rated: add `size: S…XL` or `points: N` labels to rate them.')
    expect(hint?.props.dimColor).toBe(true)
    await ui.unmount()
  })

  test('a board with a rated Quest shows no rating hint', async ($, on) => {
    engine(on)
    gh(on)
    await $.session.start(START)
    await questBoard($)

    const ui = await $.ui.mount({ ...BOARD, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /rate/ })).toBeUndefined()
    await ui.unmount()
  })

  test('when no Jira Quest is rated and no story points field is set, the hint says to set it', async ($, on) => {
    engine(on)
    regionFile(on, { questSource: { kind: 'jira', project: 'CPI' }, quests: [] })
    atlassian(on)
    await $.session.start(START)
    await questBoard($)

    const ui = await $.ui.mount({ ...BOARD, surface: 'terminal' })
    expect(await texts(ui)).toContain('No Quest is rated: set questSource.storyPointsField (e.g. customfield_10016) to rate Quests.')
    await ui.unmount()
  })

  test('when the story points field is set but no Jira Quest has points, the hint says so', async ($, on) => {
    engine(on)
    regionFile(on, { questSource: { kind: 'jira', project: 'CPI', storyPointsField: 'customfield_10028' }, quests: [] })
    atlassian(on)
    await $.session.start(START)
    await questBoard($)

    const ui = await $.ui.mount({ ...BOARD, surface: 'terminal' })
    expect(await texts(ui)).toContain(
      'No Quest is rated: none has a value in customfield_10028 (questSource.storyPointsField).',
    )
    await ui.unmount()
  })

  test('a Jira card shows its status and its triage tags; the status filter steps through both', async ($, on) => {
    engine(on)
    regionFile(on, JIRA_REGION)
    atlassian(on)
    await $.session.start(START)
    await questBoard($)

    const ui = await $.ui.mount({ ...BOARD, surface: 'terminal' })
    expect(await texts(ui)).toContain('Medium · Boss: +100 XP · INT · To Do · #ready-for-agent')
    const filter = async () => (await ui.find({ type: 'Button', key: 'filter-status' }))?.text
    await ui.press({ key: 'filter-status' })
    expect(await filter()).toBe('Status: To Do')
    await ui.press({ key: 'filter-status' })
    expect(await filter()).toBe('Status: ready-for-agent')
    expect(await cards(ui)).toEqual(['quest:CPI-12'])
    await ui.press({ key: 'filter-status' })
    expect(await filter()).toBe('Status: In Progress')
    expect(await cards(ui)).toEqual(['quest:CPI-9'])
    await ui.unmount()
  })

  test('a listing as long as the cap says there may be more: 200+', async ($, on) => {
    engine(on)
    const many = Array.from({ length: 200 }, (_, at) => issue(at + 1, `Quest ${at + 1}`, ['size: S']))
    gh(on, () => ran(0, JSON.stringify(many)))
    await $.session.start(START)
    await questBoard($)

    const ui = await $.ui.mount({ ...BOARD, surface: 'terminal' })
    expect(await texts(ui)).toContain('200 of 200+ Quests')
    await ui.unmount()
  })

  test("the header shows the Player's trophies and Badges", async ($, on) => {
    engine(on, {
      player: {
        level: 4,
        xp: 10,
        totalXp: 560,
        hp: 100,
        maxHp: 100,
        stats: { intelligence: 300, wisdom: 40, dexterity: 0, strength: 60, charisma: 0, constitution: 0 },
        badges: [
          { id: 'first-quest', name: 'Questbound' },
          { id: 'boss-slayer', name: 'Boss Slayer' },
        ],
        trophies: [{ name: 'Bane of work#2', region: 'work', ticket: '#2', earnedAt: 0 }],
      },
    })
    gh(on)
    await $.session.start(START)
    await questBoard($)

    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BOARD, surface })
      expect(await texts(ui)).toContain('Trophies 1 · ★2')
      await ui.unmount()
    }
  })
})

describe('Quest Board: picking a Quest', () => {
  test('the card fills whichever implement command the session has', async ($, on) => {
    const { filled, settle } = engine(on, {}, { commands: ['acme:implement', 'implement'] })
    gh(on)
    await $.session.start(START)
    await questBoard($)

    const ui = await $.ui.mount({ ...BOARD, surface: 'terminal' })
    await ui.press({ key: 'quest:#5' })
    await settle()
    await ui.unmount()

    expect(filled.map(fill => fill.text)).toEqual(['/acme:implement #5'])
  })

  test('mattpocock-skills:implement is preferred, and a bare implement is the last choice', async ($, on) => {
    const { filled, settle } = engine(on, {}, { commands: ['implement', 'acme:implement', 'mattpocock-skills:implement'] })
    gh(on)
    await $.session.start(START)
    await questBoard($)

    const ui = await $.ui.mount({ ...BOARD, surface: 'terminal' })
    await ui.press({ key: 'quest:#5' })
    await settle()
    await ui.unmount()

    expect(filled.map(fill => fill.text)).toEqual(['/mattpocock-skills:implement #5'])
  })

  test('with no implement command, the card fills nothing and says so', async ($, on) => {
    const { filled, toasts, settle } = engine(on, {}, { commands: ['mattpocock-skills:triage'] })
    gh(on)
    await $.session.start(START)
    await questBoard($)

    const ui = await $.ui.mount({ ...BOARD, surface: 'terminal' })
    await ui.press({ key: 'quest:#5' })
    await settle()
    await ui.unmount()

    expect(filled).toEqual([])
    expect(toasts).toContain('No implement command in this session: install one, such as mattpocock-skills:implement, to start Quests from the board.')
  })

  test('a draft the Player is writing is kept, and a toast says how to start the Quest', async ($, on) => {
    const { filled, toasts, settle } = engine(on, {}, { draft: 'why does the build fail on' })
    gh(on)
    await $.session.start(START)
    await questBoard($)

    const ui = await $.ui.mount({ ...BOARD, surface: 'terminal' })
    await ui.press({ key: 'quest:#5' })
    await settle()
    await ui.unmount()

    expect(filled).toEqual([])
    expect(toasts).toContain('Draft kept: clear it and pick again, or run /mattpocock-skills:implement #5')
  })

  test('a draft that is itself an implement command is replaced', async ($, on) => {
    const { filled, settle } = engine(on, {}, { draft: '/mattpocock-skills:implement #6' })
    gh(on)
    await $.session.start(START)
    await questBoard($)

    const ui = await $.ui.mount({ ...BOARD, surface: 'terminal' })
    await ui.press({ key: 'quest:#5' })
    await settle()
    await ui.unmount()

    expect(filled.map(fill => [fill.text, fill.mode])).toEqual([['/mattpocock-skills:implement #5', 'replace']])
  })
})

describe('Quest Board: the started Quest\'s ticket is looked up', () => {
  test("a listed ticket's Quest takes its summary from its Quest Source", async ($, on) => {
    const { settle } = engine(on)
    on('command.run', () => ({}))
    const quest = gamesOf(on)
    const runs = gh(on)
    await $.session.start(START)
    await questBoard($)

    await run($, 'mattpocock-skills:implement', '#5')
    await settle()

    expect(runs.some(argv => argv[2] === 'view' && argv[3] === '5')).toBe(true)
    expect(quest()).toMatchObject({
      ticket: '#5',
      title: 'Quest Board from GitHub Issues',
      summary: 'The body of #5.',
      difficulty: 'Medium',
      verified: 'found',
    })
  })

  test('a ticket the board never listed is rated and titled by its lookup', async ($, on) => {
    const { settle } = engine(on)
    on('command.run', () => ({}))
    const quest = gamesOf(on)
    gh(on)
    await $.session.start(START)

    await run($, 'mattpocock-skills:implement', '#6')
    await settle()

    expect(quest()).toMatchObject({ ticket: '#6', title: 'Quest Board from Jira', difficulty: 'Hard', verified: 'found' })
  })

  test('a ticket its Quest Source has not got says the Quest runs Unrated, for no Quest reward', async ($, on) => {
    const { toasts, settle } = engine(on)
    on('command.run', () => ({}))
    const quest = gamesOf(on)
    gh(on)
    await $.session.start(START)

    await run($, 'implement', '#9999')
    await settle()

    expect(quest()).toMatchObject({ ticket: '#9999', difficulty: 'Unrated', verified: 'not-found' })
    expect(toasts).toContain('No ticket #9999 in GitHub Issues: the Quest runs Unrated and pays no Quest reward')
  })

  test('a Quest Source that cannot be reached leaves the Quest as it is, logged to debug alone', async ($, on) => {
    const { toasts, settle } = engine(on)
    on('command.run', () => ({}))
    const debug: string[] = []
    on('ui.log', (_, e) => {
      debug.push(e.text)

      return { value: undefined }
    })
    const quest = gamesOf(on)
    on('process.run', () => ({ value: ran(1, '', 'error connecting to api.github.com\n') }))
    await $.session.start(START)

    await run($, 'implement', '#4')
    await settle()

    expect(quest()).toMatchObject({ ticket: '#4', verified: 'unknown' })
    expect(toasts).toEqual(['Quest started: #4'])
    expect(debug.some(line => line.includes('#4') && line.includes('error connecting to api.github.com'))).toBe(true)
  })

  test("the HUD shows the Quest's title, cut to about 30 characters", async ($, on) => {
    const { settle } = engine(on)
    on('command.run', () => ({}))
    gh(on)
    await $.session.start(START)
    await questBoard($)

    await run($, 'mattpocock-skills:implement', '#9')
    await settle()

    const ui = await $.ui.mount({
      plugin: 'quest-mod',
      component: 'AbovePrompt',
      requestId: 'above-prompt',
      surface: 'terminal',
      props: {
        hasSurvey: false,
        isWorking: false,
        maxRows: 10,
        bodyColumns: 80,
        scroll: { offset: 0, bodyRows: 10 },
        view: {},
      },
    })
    expect((await ui.find({ type: 'Text', text: /^Quest / }))?.text).toBe('Quest #9 Crash on an empty Region file')
    await ui.unmount()
  })
})
