// Which Quest Source a Region reads: its choice, kept by hand in the Region
// file (`.claude/claude-quest.json`, beside the Quest history) as
// `questSource`, so it travels with the project and every session in it reads
// the same one. A Region that names none reads the repo's GitHub Issues: the
// common case, and the gh adapter says plainly when the project is no repo.

import { githubIssues } from './github-issues'
import type { RunCommand } from './github-issues'
import { jiraIssues } from './jira-issues'
import type { CallTool } from './jira-issues'
import { REGION_FILE } from './persistence'
import type { QuestSource, QuestSourceProblem, Sourced } from './quest-source'
import type { QuestSourceSetting } from '../types'

const GITHUB: QuestSourceSetting = { kind: 'github' }

const misconfigured = (message: string): Sourced<QuestSourceSetting> => ({
  ok: false,
  problem: { kind: 'unreachable', message },
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
})
