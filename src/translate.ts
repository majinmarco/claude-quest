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
  notebook_path?: unknown
}

/** The part of what `next(e)` resolved to that the translator reads. */
export type ToolCallOutcome = {
  result?: unknown
  deny?: string
  isError?: true
  text?: string
}

const SEARCHES = new Set(['Grep', 'Glob'])

/** The tools that create or change a file. */
const FILE_CHANGES = new Set(['Write', 'Edit', 'NotebookEdit'])

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
export const folderOf = (path: string): string => `${path.replace(/\/+$/, '')}/..`

/** Whether the last segment looks like a file's name: `engine.ts`, not `.claude`. */
export const namesFile = (path: string): boolean => /[^/.][^/]*\.[^/.]+$/.test(path)

/** How many leading segments of a folder, relative to the root, name its Module. */
const MODULE_DEPTH = 2

/**
 * Folders that hold no code of the project's own (dependencies, build output,
 * caches): nothing in them is a Module, when they are a root-level folder.
 */
const IGNORED_FOLDERS = new Set(['node_modules', '.git', 'dist', 'build', 'target', 'vendor', '.venv', 'coverage'])

/**
 * A path with Windows' backslashes as slashes (`src\engine\x.ts` is
 * `src/engine/x.ts`), and a drive's path absolute (`C:\work` is `/C:/work`).
 */
const slashed = (path: string): string => path.replace(/\\/g, '/').replace(/^([A-Za-z]:\/)/, '/$1')

/**
 * The Module a folder is in: the first two segments of its path relative to
 * the project's root (`src/engine`, `packages/api`), `.` for the root itself.
 * A relative folder is taken from the root, where the session works. A folder
 * outside the project, in an ignored root-level folder (`node_modules`,
 * `dist`...), or any folder when the root is not known, is in no Module (null).
 */
export const moduleOf = (folder: string, root: string | null): string | null => {
  if (root === null) {
    return null
  }

  const base = resolve('/', slashed(root))
  const absolute = resolve(base, slashed(folder))
  if (absolute === base) {
    return '.'
  }

  const prefix = base === '/' ? '/' : `${base}/`

  return absolute.startsWith(prefix) ? moduleOfFolder(absolute.slice(prefix.length)) : null
}

/**
 * The Module a folder relative to the project's root is in: its first two
 * segments; null in an ignored root-level folder. As an older mod kept a
 * Module (any depth), it is the Module it is in now.
 */
export const moduleOfFolder = (relative: string): string | null => {
  const segments = slashed(relative).split('/').filter(segment => segment !== '' && segment !== '.')
  if (segments.length === 0) {
    return '.'
  }

  return IGNORED_FOLDERS.has(segments[0] ?? '') ? null : segments.slice(0, MODULE_DEPTH).join('/')
}

/** A file's name as a test runner names its tests: `*.test.*`, `*.spec.*`, `test_*.py`, `*_test.go`. */
const TEST_FILE_NAME = /^(?:.+\.(?:test|spec)\..+|test_.+\.py|.+_test\.go)$/

/** The folders whose files are all tests. */
const TEST_FOLDERS = new Set(['tests', 'test', '__tests__', 'spec'])

/**
 * Whether `path` is a test file, whose edit arms a Prophecy: named as a test
 * (`*.test.*`, `*.spec.*`, `test_*.py`, `*_test.go`), or lying under a
 * `tests/`, `test/`, `__tests__/` or `spec/` folder of the project. Only the
 * folders below the root count, so a project kept in `~/test/` is not all
 * tests; a relative path (as git names a change) is taken from the root.
 * Outside the project, or for an absolute path with no root, only the name
 * counts.
 */
export const isTestFile = (path: string, root: string | null = null): boolean => {
  const segments = slashed(path).split('/').filter(Boolean)
  if (TEST_FILE_NAME.test(segments.at(-1) ?? '')) {
    return true
  }
  if (root === null) {
    return !slashed(path).startsWith('/') && segments.slice(0, -1).some(folder => TEST_FOLDERS.has(folder))
  }

  const base = resolve('/', slashed(root))
  const absolute = resolve(base, slashed(path))
  const prefix = base === '/' ? '/' : `${base}/`
  if (!absolute.startsWith(prefix)) {
    return false
  }

  return absolute.slice(prefix.length).split('/').slice(0, -1).some(folder => TEST_FOLDERS.has(folder))
}

/**
 * The TEST_FILE_EDITED a game event plays after it, at `at`: a FILE_EDIT of a
 * test file (isTestFile), from any source, arms a Prophecy; any other event,
 * none.
 */
export const testFileEditedOf = (event: GameEvent, root: string | null, at: number): GameEvent | null =>
  event.type === 'FILE_EDIT' && isTestFile(event.path, root) ? { type: 'TEST_FILE_EDITED', path: event.path, at } : null

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

  if (FILE_CHANGES.has(input.tool)) {
    return translateFileChange(input.tool, outcome.result, root)
  }

  if (SEARCHES.has(input.tool)) {
    const path = typeof input.path === 'string' ? input.path : '.'
    const folder = input.tool === 'Grep' && namesFile(path) ? folderOf(path) : path

    return { type: 'FILE_READ', path, module: moduleOf(folder, root) }
  }

  return null
}

/** One hunk of a Write's or Edit's `structuredPatch`, or of the working tree's diff. */
export type Hunk = {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: string[]
}

/** A text's lines; a last newline ends the last line, it starts no other. */
export const linesOf = (text: string): string[] =>
  text === '' ? [] : text.replace(/\n$/, '').split('\n')

const isHunk = (value: unknown): value is Hunk =>
  typeof value === 'object' &&
  value !== null &&
  Array.isArray((value as Hunk).lines) &&
  typeof (value as Hunk).oldStart === 'number'

/** Hunks as a unified diff, and how many lines they add and remove. */
const asDiff = (hunks: Hunk[]) => {
  const lines = hunks.flatMap(hunk => hunk.lines)

  return {
    linesAdded: lines.filter(line => line.startsWith('+')).length,
    linesRemoved: lines.filter(line => line.startsWith('-')).length,
    diff: hunks
      .map(
        hunk =>
          `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@\n` +
          hunk.lines.join('\n'),
      )
      .join('\n'),
  }
}

/** All of `text` added, as one hunk: a new file, or one whose old content is unknown. */
export const allAdded = (text: string): Hunk => {
  const lines = linesOf(text)

  return { oldStart: 0, oldLines: 0, newStart: 1, newLines: lines.length, lines: lines.map(line => `+${line}`) }
}

/**
 * The hunk turning `before` into `after`, for a NotebookEdit, which hands
 * over no patch: the lines both share at the start and the end are left out,
 * and everything between is removed and added.
 */
const hunkBetween = (before: string, after: string): Hunk => {
  const old = linesOf(before)
  const next = linesOf(after)
  let start = 0
  while (start < old.length && start < next.length && old[start] === next[start]) {
    start += 1
  }
  let end = 0
  while (
    end < old.length - start &&
    end < next.length - start &&
    old[old.length - 1 - end] === next[next.length - 1 - end]
  ) {
    end += 1
  }
  const removed = old.slice(start, old.length - end)
  const added = next.slice(start, next.length - end)

  return {
    oldStart: removed.length === 0 ? start : start + 1,
    oldLines: removed.length,
    newStart: added.length === 0 ? start : start + 1,
    newLines: added.length,
    lines: [...removed.map(line => `-${line}`), ...added.map(line => `+${line}`)],
  }
}

/**
 * A Write, Edit or NotebookEdit that changed a file becomes a FILE_EDIT of it,
 * its lines counted from the diff Claude Code hands over; one that changed
 * nothing (or was held for review, `staged`) is no event.
 */
const translateFileChange = (
  tool: string,
  result: unknown,
  root: string | null,
): GameEvent | null => {
  if (typeof result !== 'object' || result === null) {
    return null
  }
  const record = result as Record<string, unknown>
  if (record.staged === true) {
    return null
  }

  const path = tool === 'NotebookEdit' ? record.notebook_path : record.filePath
  if (typeof path !== 'string') {
    return null
  }

  // A Write says it created the file; an Edit with nothing to replace in a
  // file that had no content to read (originalFile null) creates it too.
  const isNewFile =
    (tool === 'Write' && record.type === 'create') ||
    (tool === 'Edit' && record.oldString === '' && record.originalFile === null)
  // A notebook's original_file is its JSON, not lines of code: not counted.
  const linesBefore =
    !isNewFile && tool !== 'NotebookEdit' && typeof record.originalFile === 'string'
      ? linesOf(record.originalFile).length
      : null
  const hunks = hunksOf(tool, record, isNewFile)
  if (hunks === null) {
    return null
  }

  return fileEditOf(
    // An Edit of every occurrence (a rename) is said so: it is never major.
    { path, isNewFile, linesBefore, hunks, ...(tool === 'Edit' && record.replaceAll === true ? { replaceAll: true } : {}) },
    root,
  )
}

/** A file changed, as whatever saw it tells it: a file-changing tool's record, or the working tree's diff. */
export type FileChangeSeen = {
  /** The file's path, absolute. */
  path: string
  isNewFile: boolean
  /** The file's lines before the change; null for a new file, or when not known. */
  linesBefore: number | null
  hunks: Hunk[]
  replaceAll?: true
  /** `diff`: seen in the working tree's diff, not in a tool's record (Bash, a script, a subagent). */
  source?: 'diff'
}

/**
 * The one way a changed file becomes its FILE_EDIT, whichever path saw it (a
 * Write, an Edit or a NotebookEdit; the working tree's diff after Bash): its
 * Module, and its lines counted from its hunks. A change of no line to a
 * file that was there is no event.
 */
export const fileEditOf = (
  { path, isNewFile, linesBefore, hunks, replaceAll, source }: FileChangeSeen,
  /** The project's root, absolute; null when it cannot be read. */
  root: string | null,
): Extract<GameEvent, { type: 'FILE_EDIT' }> | null => {
  const change = asDiff(hunks)
  if (!isNewFile && change.linesAdded + change.linesRemoved === 0) {
    return null
  }

  return {
    type: 'FILE_EDIT',
    path,
    module: moduleOf(folderOf(path), root),
    isNewFile,
    linesBefore,
    ...change,
    ...(replaceAll === true ? { replaceAll: true } : {}),
    ...(source === undefined ? {} : { source }),
  }
}

/** The change a file-changing tool's record tells, as hunks; null when it tells none. */
const hunksOf = (
  tool: string,
  record: Record<string, unknown>,
  isNewFile: boolean,
): Hunk[] | null => {
  if (tool === 'NotebookEdit') {
    if (typeof record.error === 'string' && record.error !== '') {
      return null
    }
    const source = (value: unknown) => (typeof value === 'string' ? value : '')
    const before = record.edit_mode === 'insert' ? '' : source(record.old_source)
    const after = record.edit_mode === 'delete' ? '' : source(record.new_source)

    return [hunkBetween(before, after)]
  }

  const content = typeof record.content === 'string' ? record.content : null
  if (tool === 'Write' && isNewFile) {
    return content === null ? null : [allAdded(content)]
  }

  const patch = Array.isArray(record.structuredPatch) ? record.structuredPatch.filter(isHunk) : []
  // An update's patch is empty when nothing changed, or, with originalFile
  // null, when the old content was too large to diff: then its new content is
  // all that can be counted.
  if (patch.length === 0 && tool === 'Write' && record.originalFile === null && content !== null) {
    return [allAdded(content)]
  }

  return patch
}

/** A Bash call's output and exit code, or null when it did not run to an exit. */
export const finished = (outcome: ToolCallOutcome): { output: string; exitCode: number } | null => {
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

/**
 * A Bash call that will run a Check, seen before it runs: a CHECK_STARTED,
 * which stops the Prophecy from being called; any other call, no event.
 */
export const translateCheckStart = (input: ToolCallSeen): GameEvent | null =>
  input.tool === 'Bash' && typeof input.command === 'string' && readCheck(input.command) !== null
    ? { type: 'CHECK_STARTED' }
    : null

/**
 * The folder a command's commit ran in, when the command moved there first
 * (`cd vault && git commit ...`): the target of its last `cd` before the
 * `git commit`, as written, relative to the session's folder or absolute.
 * Null when it changed no folder, so the commit ran where the session works.
 */
const commitFolderOf = (command: string): string | null => {
  let folder: string | null = null
  for (const segment of command.split(/&&|\|\||;|\n/)) {
    const words = segment.trim().split(/\s+/)
    if (words[0] === 'git' && words.includes('commit')) {
      break
    }
    if (words[0] === 'cd' && words[1] !== undefined) {
      folder = words[1].replace(/^(['"])(.*)\1$/, '$2')
    }
  }

  return folder
}

/** git's summary line of a commit made: `[main 7ab19e4] subject`, `[main (root-commit) 0a1b2c3] ...`. */
const COMMIT_SUMMARY = /^\[[^\]]*? ([0-9a-f]{7,40})\] /m

/** The flags that make `git commit` no new commit, or print no summary. */
const NOT_A_PLAIN_COMMIT = new Set(['--amend', '--dry-run', '--quiet'])

/** A short flag that holds `-q` among others (`-q`, `-qm`, `-aqm`). */
const QUIET_SHORT_FLAGS = /^-[a-zA-Z]*q[a-zA-Z]*$/

/**
 * Whether a command runs a plain `git commit` in one of its segments, and
 * only goes on after it succeeded: a new commit that prints git's summary
 * line (not an amend, a dry run, a quiet one), with no `||` after it, which
 * would run what follows only when the commit failed (and could print a
 * summary line of its own).
 */
const runsPlainCommit = (command: string): boolean => {
  const parts = command.split(/(&&|\|\||[;&|\n])/)

  return parts.some((segment, at) => {
    const words = segment.trim().replace(/^\(+/, '').trim().split(/\s+/)
    const isPlain =
      words[0] === 'git' &&
      words[1] === 'commit' &&
      !words.some(word => NOT_A_PLAIN_COMMIT.has(word) || QUIET_SHORT_FLAGS.test(word))

    return isPlain && !parts.slice(at + 1).includes('||')
  })
}

// A commit is read from what Claude Code says the Bash call did, not from
// the command: Claude Code 2.1.308 hands a successful Bash call's record a
// gitOperation, { commit: { sha, kind, branch } } when it committed. Only a
// new commit (`committed`) counts: an amend rewrites one already made, a
// cherry-pick replays another's work. A dry run or a failed commit (an error,
// `Exit code 1`) hands over no gitOperation, so it is no commit.
//
// A commit chained before a command that failed (`git commit && npm test`,
// the tests failing) made its commit, but the call is an error with no
// record. When the error's text is an exit (`Exit code N`) and a segment of
// the command is a plain `git commit`, the sha is read from git's summary
// line in it; such a commit is marked `fromError`, as its diff must come from
// git itself (the text could be anything the command printed).
export const translateCommit = (
  input: ToolCallSeen,
  outcome: ToolCallOutcome,
): GameEvent | null => {
  if (input.tool !== 'Bash' || outcome.deny !== undefined) {
    return null
  }

  const cwd = typeof input.command === 'string' ? commitFolderOf(input.command) : null

  if (outcome.isError === true) {
    const text = outcome.text ?? ''
    if (typeof input.command !== 'string' || !/^Exit code \d+/.test(text) || !runsPlainCommit(input.command)) {
      return null
    }
    const sha = COMMIT_SUMMARY.exec(text)?.[1]

    return sha === undefined ? null : { type: 'COMMIT', sha, cwd, fromError: true }
  }

  const record = outcome.result
  if (typeof record !== 'object' || record === null) {
    return null
  }
  const commit = (record as { gitOperation?: { commit?: { sha?: unknown; kind?: unknown } } })
    .gitOperation?.commit
  if (commit?.kind !== 'committed' || typeof commit.sha !== 'string') {
    return null
  }

  return { type: 'COMMIT', sha: commit.sha, cwd }
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

/**
 * Whether `command` is an implement command: `/implement`, or any plugin's
 * (`/mattpocock-skills:implement`, `/acme:implement`).
 */
export const isImplementCommand = (command: string): boolean => /^(?:[^:\s]+:)?implement$/.test(command)


const GITHUB_ISSUE = /^#?(\d+)$/
const GITHUB_ISSUE_URL = /^https?:\/\/[^\s]*\/issues\/(\d+)\/?$/
// A Jira key's project is upper case (`ABC-123`), as Jira writes it: a word
// in lower case (`utf-8`) names no ticket.
const KEY = '([A-Z][A-Z0-9_]*-\\d+)'
const JIRA_KEY = new RegExp(`^${KEY}$`)
const JIRA_URL = new RegExp(`^https?://\\S*/browse/${KEY}/?$`)

/**
 * The ticket the arguments name, as its Quest Source writes it, or null. Only
 * the first word is read, so `/implement step 2 of the spec` names no ticket.
 */
export const ticketOf = (args: string): string | null => {
  const first = args.trim().split(/\s+/)[0] ?? ''

  const issue = GITHUB_ISSUE.exec(first) ?? GITHUB_ISSUE_URL.exec(first)
  if (issue !== null) {
    return `#${issue[1]}`
  }

  const key = JIRA_KEY.exec(first) ?? JIRA_URL.exec(first)

  return key?.[1] ?? null
}

// `/implement` starts a Quest when it names a ticket. It is read at
// `command.run`, not `skill.prompt`: Claude Code 2.1.308's types give
// `skill.prompt` the skill's expanded text but not its arguments, while
// `command.run` carries them as typed. The skill sets
// `disable-model-invocation`, so the Skill tool never runs it: every run is a
// slash command that `command.run` sees.
export const translateCommand = (input: CommandSeen): GameEvent | null => {
  if (!isImplementCommand(input.command)) {
    return null
  }

  const ticket = ticketOf(input.args)

  return ticket === null ? null : { type: 'QUEST_START', ticket }
}
