import { describe, expect, test } from 'claude-code/testing'
import type { ProcessRunResult } from 'claude-code'

import { githubIssues } from '../src/github-issues'
import { questSourceContract } from './quest-source-contract'
import type { ContractTicket, ContractWorld } from './quest-source-contract'

/** An issue as `gh issue list --json` and `gh issue view --json` write it. */
type GhIssue = {
  number: number
  title: string
  labels: { name: string }[]
  url: string
  state?: 'OPEN' | 'CLOSED'
  body?: string
}

const ran = (exitCode: number, stdout: string, stderr = ''): ProcessRunResult => ({
  exitCode,
  stdout,
  stderr,
  isStdoutTruncated: false,
  isStderrTruncated: false,
})

// What gh 2.x writes when it fails, as seen on a real machine.
const NOT_LOGGED_IN =
  'To get started with GitHub CLI, please run:  gh auth login\n' +
  'Alternatively, populate the GH_TOKEN environment variable with a GitHub API authentication token.\n'
const NOT_A_REPO =
  'failed to run git: fatal: not a git repository (or any of the parent directories): .git\n'
// gh in a repo whose remotes are not on GitHub (gh 2.x), and offline.
const NO_GITHUB_HOST =
  'none of the git remotes configured for this repository point to a known GitHub host. To tell gh about a new GitHub host, please use `gh auth login`\n'
const OFFLINE = 'error connecting to api.github.com\ncheck your internet connection or https://githubstatus.com\n'
const NO_SUCH_ISSUE = (n: string) =>
  `GraphQL: Could not resolve to an issue or pull request with the number of ${n}. (repository.issue)\n`

/**
 * A fake `gh` over some issues: it answers `issue list` and `issue view` with
 * the JSON fields asked for, as gh does. `calls` records every argv.
 */
const fakeGh = (issues: GhIssue[]) => {
  const calls: string[][] = []

  const run = async (argv: readonly string[]): Promise<ProcessRunResult> => {
    calls.push([...argv])
    const [tool, noun, verb, ...rest] = argv
    if (tool !== 'gh' || noun !== 'issue') {
      return ran(1, '', `unknown command "${String(noun)}" for "gh"\n`)
    }

    const fields = (rest[rest.indexOf('--json') + 1] ?? '').split(',')
    const pick = (issue: GhIssue) =>
      Object.fromEntries(fields.map(field => [field, issue[field as keyof GhIssue]]))

    if (verb === 'list') {
      const open = issues.filter(issue => issue.state !== 'CLOSED')

      return ran(0, JSON.stringify(open.map(pick)))
    }

    if (verb === 'view') {
      const n = rest[0] ?? ''
      const issue = issues.find(one => String(one.number) === n)

      return issue === undefined ? ran(1, '', NO_SUCH_ISSUE(n)) : ran(0, JSON.stringify(pick(issue)))
    }

    return ran(1, '', `unknown command "${String(verb)}" for "gh issue"\n`)
  }

  return { run, calls }
}

const KIND_LABEL = { bug: 'bug', feature: 'enhancement', docs: 'documentation' } as const

/** A contract ticket as a GitHub issue: points, size and kind become labels. */
const asIssue = (ticket: ContractTicket): GhIssue => ({
  number: ticket.n,
  title: ticket.title,
  url: `https://github.com/majinmarco/claude-quest/issues/${ticket.n}`,
  labels: [
    ...(ticket.points === undefined ? [] : [`points: ${ticket.points}`]),
    ...(ticket.size === undefined ? [] : [`size: ${ticket.size}`]),
    ...(ticket.kind === undefined ? [] : [KIND_LABEL[ticket.kind]]),
    ...(ticket.status === undefined ? [] : [ticket.status]),
    ...(ticket.triage === undefined ? [] : [ticket.triage]),
  ].map(name => ({ name })),
  ...(ticket.description === undefined ? {} : { body: ticket.description }),
})

const failing = (failure: Extract<ContractWorld, { failure: unknown }>['failure']) =>
  async (): Promise<ProcessRunResult> => {
    switch (failure) {
      case 'missing':
        throw new Error('spawn gh ENOENT')
      case 'unauthenticated':
        return ran(4, '', NOT_LOGGED_IN)
      case 'unreachable':
        return ran(1, '', OFFLINE)
      case 'none':
        return ran(1, '', NOT_A_REPO)
      default:
        throw new Error(`gh cannot fail as ${failure}`)
    }
  }

questSourceContract({
  name: 'GitHub Issues',
  source: world =>
    githubIssues('failure' in world ? failing(world.failure) : fakeGh(world.tickets.map(asIssue)).run),
  ticket: n => `#${n}`,
  failures: ['missing', 'unauthenticated', 'unreachable', 'none'],
})

const issue = (labels: string[], number = 7): GhIssue => ({
  number,
  title: 'Seven',
  url: `https://github.com/majinmarco/claude-quest/issues/${number}`,
  labels: labels.map(name => ({ name })),
})

const listOne = async (labels: string[]) => {
  const result = await githubIssues(fakeGh([issue(labels)]).run).list()
  if (!result.ok) {
    throw new Error(result.problem.message)
  }

  return result.value[0]
}

describe('GitHub Issues adapter', () => {
  test('lists the open issues of the current repo through gh', async () => {
    const gh = fakeGh([issue([])])
    await githubIssues(gh.run).list()

    expect(gh.calls).toHaveLength(1)
    expect(gh.calls[0]?.slice(0, 5)).toEqual(['gh', 'issue', 'list', '--state', 'open'])
  })

  test('carries the issue URL', async () => {
    expect((await listOne([]))?.url).toBe('https://github.com/majinmarco/claude-quest/issues/7')
  })

  test('reads the size labels repos commonly use', async () => {
    for (const label of ['size: M', 'size:M', 'size/M', 'Size: m', 'size-M', 'size: medium']) {
      expect((await listOne([label]))?.difficulty).toBe('Medium')
    }
    expect((await listOne(['size: extra-large']))?.difficulty).toBe('Epic')
    expect((await listOne(['size/XS']))?.difficulty).toBe('Trivial')
  })

  test('reads story points from a points or estimate label', async () => {
    for (const label of ['points: 5', 'points:5', 'sp: 5', 'story points: 5', 'estimate: 5']) {
      expect((await listOne([label]))?.difficulty).toBe('Hard')
    }
  })

  test('an unlabelled issue has the status open', async () => {
    expect((await listOne([]))?.status).toBe('open')
  })

  test('a triage label is its status', async () => {
    for (const label of ['needs-triage', 'needs-info', 'ready-for-agent', 'ready-for-human', 'wontfix']) {
      expect((await listOne(['enhancement', label]))?.status).toBe(label)
    }
  })

  test('labels that name no Stat leave Intelligence recommended', async () => {
    expect((await listOne(['good first issue']))?.recommendedStats).toEqual(['intelligence'])
  })

  test('a bug that is also an enhancement recommends both Stats, as labelled', async () => {
    expect((await listOne(['bug', 'enhancement']))?.recommendedStats).toEqual([
      'strength',
      'intelligence',
    ])
  })

  test('an issue URL gets the Quest, as /implement reads one', async () => {
    const result = await githubIssues(fakeGh([issue([])]).run).get(
      'https://github.com/majinmarco/claude-quest/issues/7',
    )

    expect(result).toMatchObject({ ok: true, value: { ticket: '#7' } })
  })

  test('an error that only mentions authentication keeps gh’s own words', async () => {
    const result = await githubIssues(async () =>
      ran(1, '', 'HTTP 403: Resource protected by organization SAML enforcement. You must grant your OAuth token access to this organization. (authentication)\n'),
    ).list()

    expect(result).toMatchObject({ ok: false, problem: { kind: 'unreachable' } })
  })

  test('a closed issue got by its reference has the status closed', async () => {
    const result = await githubIssues(fakeGh([{ ...issue([]), state: 'CLOSED' }]).run).get('#7')

    expect(result).toMatchObject({ ok: true, value: { status: 'closed' } })
  })

  test('a reference that is not a GitHub issue gets no Quest, without calling gh', async () => {
    const gh = fakeGh([issue([])])
    const result = await githubIssues(gh.run).get('ABC-7')

    expect(result).toEqual({ ok: true, value: null })
    expect(gh.calls).toHaveLength(0)
  })

  test('without gh on the PATH, the problem says to install it and mentions the PATH', async () => {
    const result = await githubIssues(failing('missing')).list()

    expect(result).toMatchObject({ ok: false, problem: { kind: 'missing' } })
    expect(!result.ok && result.problem.message).toContain('https://cli.github.com')
    expect(!result.ok && result.problem.message).toContain('PATH')
  })

  test('gh that cannot be run here for another reason says so, not that gh is missing', async () => {
    const result = await githubIssues(async () => {
      throw new Error('process.run is not available on this surface')
    }).list()

    expect(result).toMatchObject({ ok: false, problem: { kind: 'unreachable' } })
    expect(!result.ok && result.problem.message).not.toContain('not installed')
    expect(!result.ok && result.problem.message).toContain('process.run is not available on this surface')
  })

  test('a project that is no GitHub repo has no GitHub Issues: the problem is none, not sign-in', async () => {
    for (const said of [NOT_A_REPO, NO_GITHUB_HOST]) {
      const result = await githubIssues(async () => ran(1, '', said)).list()

      expect(result).toMatchObject({ ok: false, problem: { kind: 'none' } })
    }
  })

  test('an issue got by its reference carries its body as its summary', async () => {
    const result = await githubIssues(fakeGh([{ ...issue([]), body: 'Orders of 10 or more.' }]).run).get('#7')

    expect(result).toMatchObject({ ok: true, value: { summary: 'Orders of 10 or more.' } })
  })

  test('an issue got by its reference keeps its body as Markdown, whole, as its description', async () => {
    const body = '## Problem\n\nOrders of **10** or more get [10% off](https://example.com).\n\n- [ ] done'
    const result = await githubIssues(fakeGh([{ ...issue([]), body }]).run).get('#7')

    expect(result).toMatchObject({ ok: true, value: { description: body } })
  })

  test('output gh did not write as JSON is unreachable, not a crash', async () => {
    const result = await githubIssues(async () => ran(0, 'not json')).list()

    expect(result).toMatchObject({ ok: false, problem: { kind: 'unreachable' } })
  })

  test('a repo with issues turned off is unreachable, with gh’s own words', async () => {
    const result = await githubIssues(async () =>
      ran(1, '', 'the \'majinmarco/claude-quest\' repository has disabled issues\n'),
    ).list()

    expect(result).toEqual({
      ok: false,
      problem: {
        kind: 'unreachable',
        message: "the 'majinmarco/claude-quest' repository has disabled issues",
      },
    })
  })
})
