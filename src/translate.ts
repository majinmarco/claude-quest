// The event translator: turns what the mod sees of a session into game
// events for the Game Engine, or null when nothing in the game happened.

import { failuresOf, readCheck } from './checks'
import type { GameEvent } from './engine'

/** The part of a `tool.call` input the translator reads. */
export type ToolCallSeen = {
  tool: string
  file_path?: unknown
  path?: unknown
  command?: unknown
}

/** The part of what `next(e)` resolved to that the translator reads. */
export type ToolCallOutcome = {
  result?: unknown
  deny?: string
  isError?: true
  text?: string
}

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
  if (outcome.deny !== undefined) {
    return null
  }

  if (input.tool === 'Bash' && typeof input.command === 'string') {
    return translateCheck(input.command, outcome)
  }

  if (outcome.isError === true) {
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

/** A Bash call's output and exit code, or null when it did not run to an exit. */
const finished = (outcome: ToolCallOutcome): { output: string; exitCode: number } | null => {
  // Claude Code 2.1.308 hands a non-zero exit over as an error whose text is
  // `Exit code N`, then stdout and stderr; an error without one (the call was
  // interrupted, or could not run) has no exit to read.
  if (outcome.isError === true) {
    const exited = /^Exit code (\d+)\n?/.exec(outcome.text ?? '')

    return exited === null
      ? null
      : { output: (outcome.text ?? '').slice(exited[0].length), exitCode: Number(exited[1]) }
  }

  // An exit of 0 hands over the tool's record, which names no exit code. A
  // command sent to the background, or interrupted, has not finished.
  const record = outcome.result
  if (typeof record !== 'object' || record === null) {
    return null
  }
  const { stdout, stderr, interrupted, backgroundTaskId } = record as Record<string, unknown>
  if (interrupted === true || backgroundTaskId !== undefined || typeof stdout !== 'string') {
    return null
  }

  return { output: `${stdout}\n${typeof stderr === 'string' ? stderr : ''}`, exitCode: 0 }
}

/**
 * A Bash call that ran a check (a test run, a lint, a type-check) becomes a
 * TEST_FAIL of the failures it counts, or a TEST_PASS; any other, no event.
 */
const translateCheck = (command: string, outcome: ToolCallOutcome): GameEvent | null => {
  const check = readCheck(command)
  const run = check === null ? null : finished(outcome)
  if (check === null || run === null) {
    return null
  }

  const failures = failuresOf(check, run.output, run.exitCode)
  if (failures === undefined) {
    return null
  }

  return failures === 0
    ? { type: 'TEST_PASS', check: check.command, kind: check.kind }
    : { type: 'TEST_FAIL', check: check.command, kind: check.kind, failures }
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
