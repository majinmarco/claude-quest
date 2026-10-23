// The event translator: turns what the mod sees of a session into game
// events for the Game Engine, or null when nothing in the game happened.

import type { GameEvent } from './engine'

/** The part of a `tool.call` input the translator reads. */
export type ToolCallSeen = {
  tool: string
  file_path?: unknown
  path?: unknown
}

/** The part of what `next(e)` resolved to that the translator reads. */
export type ToolCallOutcome = { result?: unknown; deny?: string; isError?: true }

const SEARCHES = new Set(['Grep', 'Glob'])

/**
 * An absolute path with `.` and `..` resolved and no trailing slash; a
 * relative one taken from `base`.
 */
const resolve = (base: string, path: string): string => {
  const segments: string[] = []
  for (const segment of `${path.startsWith('/') ? '' : base}/${path}`.split('/')) {
    if (segment === '..') {
      segments.pop()
    } else if (segment !== '' && segment !== '.') {
      segments.push(segment)
    }
  }

  return `/${segments.join('/')}`
}

/** The folder holding `path`. */
const folderOf = (path: string): string => `${path.replace(/\/+$/, '')}/..`

/** Whether the last segment looks like a file's name: `engine.ts`, not `.claude`. */
const namesFile = (path: string): boolean => /[^/.][^/]*\.[^/.]+$/.test(path)

/**
 * The Module a folder is: its path relative to the project's root, `.` for
 * the root itself. A relative folder is taken from the root, where the
 * session works. A folder outside the project, or any folder when the root is
 * not known, is no Module (null).
 */
const moduleOf = (folder: string, root: string | null): string | null => {
  if (root === null) {
    return null
  }

  const base = resolve('/', root)
  const absolute = resolve(base, folder)
  if (absolute === base) {
    return '.'
  }

  const prefix = base === '/' ? '/' : `${base}/`

  return absolute.startsWith(prefix) ? absolute.slice(prefix.length) : null
}

// A Module is a folder of the project: a Read is in its file's folder; a
// search, in the folder it searched. A Glob searches a folder always; a Grep
// may search one file, taken as a file when its last segment has an extension.
export const translateToolCall = (
  input: ToolCallSeen,
  outcome: ToolCallOutcome,
  /** The project's root, absolute; null when it cannot be read. */
  root: string | null,
): GameEvent | null => {
  if (outcome.deny !== undefined || outcome.isError === true) {
    return null
  }

  if (input.tool === 'Read' && typeof input.file_path === 'string') {
    const path = input.file_path

    return { type: 'FILE_READ', path, module: moduleOf(folderOf(path), root) }
  }

  if (SEARCHES.has(input.tool)) {
    const path = typeof input.path === 'string' ? input.path : '.'
    const folder = input.tool === 'Grep' && namesFile(path) ? folderOf(path) : path

    return { type: 'FILE_READ', path, module: moduleOf(folder, root) }
  }

  return null
}

/** The part of a `session.measure` input, or of `$.session.usage()`, it reads. */
export type MeasureSeen = {
  context: { percent?: number }
  cost?: { usd: number }
}

export const translateMeasure = (
  usage: MeasureSeen,
  model: string,
): GameEvent => ({
  type: 'SESSION_MEASURED',
  mana: usage.context.percent,
  model,
  spendUsd: usage.cost?.usd,
})

/** The part of a `command.run` input the translator reads. */
export type CommandSeen = { command: string; args: string }

// `/mattpocock-skills:implement`, or `/implement` as typed without its plugin.
const IMPLEMENT = new Set(['implement', 'mattpocock-skills:implement'])

const GITHUB_ISSUE = /^#?(\d+)$/
const GITHUB_ISSUE_URL = /^https?:\/\/[^\s]*\/issues\/(\d+)\/?$/
const KEY = '([A-Za-z][A-Za-z0-9_]*-\\d+)'
const JIRA_KEY = new RegExp(`^${KEY}$`)
const JIRA_URL = new RegExp(`^https?://\\S*/browse/${KEY}/?$`)

/**
 * The ticket the arguments name, as its Quest Source writes it, or null. Only
 * the first word is read, so `/implement step 2 of the spec` names no ticket.
 */
const ticketOf = (args: string): string | null => {
  const first = args.trim().split(/\s+/)[0] ?? ''

  const issue = GITHUB_ISSUE.exec(first) ?? GITHUB_ISSUE_URL.exec(first)
  if (issue !== null) {
    return `#${issue[1]}`
  }

  const key = JIRA_KEY.exec(first) ?? JIRA_URL.exec(first)

  return key?.[1] === undefined ? null : key[1].toUpperCase()
}

// `/implement` starts a Quest when it names a ticket. It is read at
// `command.run`, not `skill.prompt`: Claude Code 2.1.308's types give
// `skill.prompt` the skill's expanded text but not its arguments, while
// `command.run` carries them as typed. The skill sets
// `disable-model-invocation`, so the Skill tool never runs it: every run is a
// slash command that `command.run` sees.
export const translateCommand = (input: CommandSeen): GameEvent | null => {
  if (!IMPLEMENT.has(input.command)) {
    return null
  }

  const ticket = ticketOf(input.args)

  return ticket === null ? null : { type: 'QUEST_START', ticket }
}
