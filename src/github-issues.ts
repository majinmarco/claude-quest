// The GitHub Issues adapter of the Quest Source: the current repo's issues,
// read with the `gh` CLI. Difficulty and recommended Stats come from labels,
// as GitHub issues have no story points or size of their own.

import type { ProcessRunResult } from 'claude-code'

import { difficultyOf, pointsFromLabels, sizeFromLabels, statsOf } from './quest-source'
import type { QuestCard, QuestSource, QuestSourceProblem } from './quest-source'

/** Runs a command by argv, as `$.process.run` does; rejects when it cannot start. */
export type RunCommand = (argv: readonly string[]) => Promise<ProcessRunResult>

/** An issue as `gh --json number,title,labels,url,state` writes it. */
type GhIssue = {
  number: number
  title: string
  labels?: { name: string }[]
  url?: string
  state?: string
}

const FIELDS = 'number,title,labels,url,state'

/** The most issues one listing reads; gh's own default is 30. */
const LIMIT = '200'

// This repo's triage labels (docs/agents/triage-labels.md), shown as status.
const TRIAGE = new Set([
  'needs-triage',
  'needs-info',
  'ready-for-agent',
  'ready-for-human',
  'wontfix',
])

const asQuest = (issue: GhIssue): QuestCard => {
  const labels = (issue.labels ?? []).map(label => label.name)
  const triage = labels.find(label => TRIAGE.has(label))
  const closed = issue.state?.toUpperCase() === 'CLOSED'

  return {
    ticket: `#${issue.number}`,
    title: issue.title,
    status: closed ? 'closed' : (triage ?? 'open'),
    difficulty: difficultyOf({ points: pointsFromLabels(labels), size: sizeFromLabels(labels) }),
    recommendedStats: statsOf(labels),
    ...(issue.url === undefined ? {} : { url: issue.url }),
  }
}

/** The first line gh wrote to say what went wrong. */
const firstLine = (text: string): string =>
  text.split('\n').map(line => line.trim()).find(line => line.length > 0) ?? ''

// gh exits 4 when it needs signing in (gh 2.x); older ones say so in words.
const NEEDS_AUTH = /gh auth login|not logged in/i
const NO_SUCH_ISSUE = /could not resolve to an issue/i

const problemOf = (ran: ProcessRunResult): QuestSourceProblem => {
  const said = firstLine(ran.stderr) || firstLine(ran.stdout)

  if (ran.exitCode === 4 || NEEDS_AUTH.test(ran.stderr)) {
    return { kind: 'unauthenticated', message: 'gh is not signed in: run `gh auth login`.' }
  }

  return { kind: 'unreachable', message: said || `gh exited with ${ran.exitCode}.` }
}

const MISSING: QuestSourceProblem = {
  kind: 'missing',
  message: 'gh, the GitHub CLI, is not installed: see https://cli.github.com.',
}

/**
 * Runs gh and reads its JSON; any failure is a problem, never a throw. A
 * failure keeps what gh wrote to standard error, for the caller to read.
 */
const runGh = async (
  run: RunCommand,
  argv: string[],
): Promise<{ ok: true; value: unknown } | { ok: false; problem: QuestSourceProblem; stderr: string }> => {
  let ran: ProcessRunResult
  try {
    ran = await run(['gh', ...argv])
  } catch {
    return { ok: false, problem: MISSING, stderr: '' }
  }

  if (ran.exitCode !== 0) {
    return { ok: false, problem: problemOf(ran), stderr: ran.stderr }
  }

  try {
    return { ok: true, value: JSON.parse(ran.stdout) as unknown }
  } catch {
    return {
      ok: false,
      problem: { kind: 'unreachable', message: 'gh answered with something other than JSON.' },
      stderr: '',
    }
  }
}

const isIssue = (value: unknown): value is GhIssue =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as GhIssue).number === 'number' &&
  typeof (value as GhIssue).title === 'string'

// `#5`, `5`, or the issue's URL: what /implement reads as a GitHub issue.
const GITHUB_REF = /^#?(\d+)$|^https?:\/\/\S*\/issues\/(\d+)\/?$/

export const githubIssues = (run: RunCommand): QuestSource => ({
  list: async () => {
    const answered = await runGh(run, [
      'issue',
      'list',
      '--state',
      'open',
      '--limit',
      LIMIT,
      '--json',
      FIELDS,
    ])
    if (!answered.ok) {
      return { ok: false, problem: answered.problem }
    }
    if (!Array.isArray(answered.value)) {
      return {
        ok: false,
        problem: { kind: 'unreachable', message: 'gh answered with something other than a list.' },
      }
    }

    return { ok: true, value: answered.value.filter(isIssue).map(asQuest) }
  },

  get: async ticket => {
    const ref = GITHUB_REF.exec(ticket.trim())
    const n = ref?.[1] ?? ref?.[2]
    if (n === undefined) {
      return { ok: true, value: null }
    }

    const answered = await runGh(run, ['issue', 'view', n, '--json', FIELDS])
    if (!answered.ok) {
      return NO_SUCH_ISSUE.test(answered.stderr)
        ? { ok: true, value: null }
        : { ok: false, problem: answered.problem }
    }

    return { ok: true, value: isIssue(answered.value) ? asQuest(answered.value) : null }
  },
})
