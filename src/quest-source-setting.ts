// Which Quest Source a Region reads: its choice, kept by hand in the Region
// file (`.claude/claude-quest.json`, beside the Quest history) as
// `questSource`, so it travels with the project and every session in it reads
// the same one. A Region that names none reads the repo's GitHub Issues when
// the project is a git repo with a remote (the common case), and has none
// otherwise: the Quest Board then says how to set Jira.

import type { EngineInterface, SessionRepo } from 'claude-code'

import { githubIssues } from './github-issues'
import type { RunCommand } from './github-issues'
import { jiraIssues } from './jira-issues'
import type { CallTool } from './jira-issues'
import { readRegionFile, REGION_FILE } from './persistence'
import type { QuestSource, QuestSourceProblem, Sourced } from './quest-source'
import type { QuestSourceSetting } from '../types'

const GITHUB: QuestSourceSetting = { kind: 'github' }

const misconfigured = (message: string): Sourced<QuestSourceSetting> => ({
  ok: false,
  problem: { kind: 'misconfigured', message },
})

const OPTIONAL_TEXT = ['jql', 'site', 'server', 'storyPointsField'] as const

/**
 * The Region's Quest Source setting, read from its Region file's JSON: GitHub
 * Issues when there is no file or it names none; a problem, saying what to
 * set, when it names one wrongly.
 */
export const questSourceSettingOf = (region: unknown): Sourced<QuestSourceSetting> => {
  const chosen = (region as { questSource?: unknown } | null | undefined)?.questSource
  if (chosen === undefined) {
    return { ok: true, value: GITHUB }
  }
  if (typeof chosen !== 'object' || chosen === null) {
    return misconfigured(`questSource in ${REGION_FILE} should be an object, such as { "kind": "github" }.`)
  }

  const setting = chosen as Record<string, unknown>
  if (setting.kind === 'github') {
    return { ok: true, value: GITHUB }
  }
  if (setting.kind !== 'jira') {
    return misconfigured(`Unknown Quest Source "${String(setting.kind)}" in ${REGION_FILE}: use "github" or "jira".`)
  }

  if (typeof setting.project !== 'string' || setting.project.trim() === '') {
    return misconfigured(`The Jira Quest Source needs its project: set questSource.project in ${REGION_FILE}.`)
  }
  for (const key of OPTIONAL_TEXT) {
    if (setting[key] !== undefined && typeof setting[key] !== 'string') {
      return misconfigured(`questSource.${key} in ${REGION_FILE} should be text.`)
    }
  }

  return {
    ok: true,
    value: {
      kind: 'jira',
      project: setting.project.trim(),
      ...Object.fromEntries(
        OPTIONAL_TEXT.flatMap(key => (typeof setting[key] === 'string' ? [[key, setting[key]]] : [])),
      ),
    },
  }
}

/** The tools Quest Sources call: the shell for gh, MCP for Jira. */
export type QuestSourceTools = { run: RunCommand; call: CallTool }

/** The Quest Source a setting names, over the tools it calls. */
export const questSourceFor = (setting: QuestSourceSetting, tools: QuestSourceTools): QuestSource =>
  setting.kind === 'jira' ? jiraIssues(tools.call, setting) : githubIssues(tools.run)

/** A Quest Source that answers only why there is none. */
export const unavailable = (problem: QuestSourceProblem): QuestSource => ({
  list: async () => ({ ok: false, problem }),
  get: async () => ({ ok: false, problem }),
  listClosed: async () => ({ ok: false, problem }),
})

/** What the Region file held when read: its JSON, or why it could not be read as JSON. */
export type RegionRead = { ok: true; value: unknown } | { ok: false; reason: string }

/** The Quest Source a Region reads, and the setting it reads it by; no setting when there is none. */
export type ResolvedQuestSource = { source: QuestSource; setting?: QuestSourceSetting }

/**
 * The Region's Quest Source: the one its Region file names; when it names
 * none, GitHub Issues if the project is a git repo with a remote (`repo`,
 * as `$.session.repo()` answers; GitHub is tried when that cannot be told),
 * else none, a problem saying how to set Jira. A Region file that is not
 * JSON, or names a Quest Source wrongly, is misconfigured.
 */
export const resolveQuestSource = async (
  region: RegionRead,
  repo: () => Promise<SessionRepo | null>,
  tools: QuestSourceTools,
): Promise<ResolvedQuestSource> => {
  if (!region.ok) {
    return { source: unavailable({ kind: 'misconfigured', message: region.reason }) }
  }

  const named = (region.value as { questSource?: unknown } | null | undefined)?.questSource !== undefined
  const setting = questSourceSettingOf(region.value)
  if (!setting.ok) {
    return { source: unavailable(setting.problem) }
  }

  if (!named) {
    // Unknown (the call failed): gh finds out, and says so.
    const found = await repo().then(
      answer => ({ known: true as const, answer }),
      () => ({ known: false as const }),
    )
    if (found.known && found.answer === null) {
      return {
        source: unavailable({
          kind: 'none',
          message: 'This project is not in a git repository, so it has no GitHub Issues to list.',
        }),
      }
    }
    if (found.known && found.answer?.remote === null) {
      return {
        source: unavailable({
          kind: 'none',
          message: 'This repo has no remote, so it has no GitHub Issues to list.',
        }),
      }
    }
  }

  return { source: questSourceFor(setting.value, tools), setting: setting.value }
}

/**
 * The Quest Source the Region chose in its Region file; when it chose none,
 * the repo's GitHub Issues, or none when the project is no git repo with a
 * remote. A file that is not JSON may hold a choice gone wrong, so the board
 * says so rather than guess. `$.process` runs only where Claude Code runs
 * commands (the CLI): elsewhere its rejection is told as such by the gh
 * adapter, never as gh missing.
 */
export async function regionQuestSource($: EngineInterface): Promise<ResolvedQuestSource> {
  const region = await readRegionFile($).catch(() => ({ ok: true as const, value: undefined }))

  return resolveQuestSource(region, () => $.session.repo(), {
    run: argv => $.process.run(argv),
    call: (server, tool, args) => $.mcp.call(server, tool, args),
  })
}
