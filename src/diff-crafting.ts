// Crafting from the diff: the code changes the game sees in the working tree,
// whatever tool made them. A Bash heredoc, a `python` script or a subagent's
// edit hands over no record of the change, as Write and Edit do; git's view
// of the working tree tells it instead. The session keeps a snapshot of each
// changed file as it last saw it; a file whose content moved on since is
// diffed against it and played as the same FILE_EDIT an Edit plays, under
// the same Crafting rules.

import type { GameEvent } from './engine'
import { allAdded, fileEditOf, linesOf } from './translate'
import type { Hunk } from './translate'

/** What a git run answered: its exit code and its output. */
export type GitRun = { exitCode: number; stdout: string }

/**
 * Runs git with `args` in the project's root (`$.process.run`), `stdin`
 * written to it; rejects when git cannot run at all.
 */
export type Git = (args: readonly string[], stdin?: string) => Promise<GitRun>

/** Reads a file by its path relative to the project's root (`$.fs.read`); rejects when it cannot. */
export type ReadFile = (path: string) => Promise<string>

/** A file as the snapshot last saw it: git's hash of its content, and the content when kept. */
type Seen = { hash: string; content: string | null }

/**
 * The session's snapshot of the working tree: each file changed from HEAD,
 * by its path relative to the root, as last seen. A file not in it is as
 * HEAD has it (or, untracked, not there).
 */
export type Snapshot = Map<string, Seen>

/** The largest file whose content the snapshot keeps (in characters): a bigger one is never diffed. */
export const MAX_KEPT_CHARS = 1_000_000

/** The most changed files one check lists: a tree with more is not a working session's. */
export const MAX_LISTED_FILES = 2000

/** The most FILE_EDITs one check plays: a generator writing hundreds of files is no hundred Craftings. */
export const MAX_DIFF_EDITS = 10

/** Lines of context around each change in a hunk, as git and Claude Code's patches have. */
const CONTEXT = 3

/** A changed path git listed: tracked (in HEAD's tree, or staged new), or untracked and not ignored. */
type Listed = { path: string; isTracked: boolean }

const NUMSTAT = ['diff', '--numstat', '-z', '--no-renames', '--no-ext-diff', '--ignore-submodules', '--diff-filter=d', '--relative', 'HEAD']
const UNTRACKED = ['ls-files', '--others', '--exclude-standard', '-z']

/** Runs git, null when it could not run or failed. */
const run = async (git: Git, args: readonly string[], stdin?: string): Promise<string | null> => {
  const ran = await git(args, stdin).catch(() => null)

  return ran?.exitCode === 0 ? ran.stdout : null
}

/**
 * The files changed from HEAD, text only (a binary's numstat is `-`), and the
 * untracked files `.gitignore` does not ignore; null when git cannot say.
 */
const listChanged = async (git: Git): Promise<Listed[] | null> => {
  const [numstat, untracked] = await Promise.all([run(git, NUMSTAT), run(git, UNTRACKED)])
  if (numstat === null || untracked === null) {
    return null
  }

  const tracked = numstat
    .split('\0')
    .map(entry => /^(\d+|-)\t(\d+|-)\t(.+)$/s.exec(entry))
    .filter(match => match !== null && match[1] !== '-')
    .map(match => ({ path: match?.[3] ?? '', isTracked: true }))
  const others = untracked
    .split('\0')
    .filter(path => path !== '')
    .map(path => ({ path, isTracked: false }))

  return [...tracked, ...others].slice(0, MAX_LISTED_FILES)
}

/** git's hash of each listed file's content, in order; null when git cannot give them all. */
const hashesOf = async (git: Git, listed: readonly Listed[]): Promise<string[] | null> => {
  if (listed.length === 0) {
    return []
  }
  const out = await run(git, ['hash-object', '--stdin-paths'], `${listed.map(file => file.path).join('\n')}\n`)
  const hashes = out?.split('\n').filter(line => line !== '') ?? []

  return hashes.length === listed.length ? hashes : null
}

/** A file's text, null when it cannot be read or is too big to keep. */
const contentOf = async (read: ReadFile, path: string): Promise<string | null> => {
  const text = await read(path).catch(() => null)

  return text !== null && text.length <= MAX_KEPT_CHARS ? text : null
}

/**
 * The snapshot the session starts from: every file already changed when it
 * started, as it is, so work done before is never played. Null when the
 * project is no git repo, or git cannot run: the diff path is off, and Edit
 * and Write play as they always did.
 */
export const takeSnapshot = async (git: Git, read: ReadFile): Promise<Snapshot | null> => {
  const inside = await run(git, ['rev-parse', '--is-inside-work-tree'])
  if (inside?.trim() !== 'true') {
    return null
  }
  const listed = await listChanged(git)
  const hashes = listed === null ? null : await hashesOf(git, listed)
  if (listed === null || hashes === null) {
    return null
  }

  const snapshot: Snapshot = new Map()
  for (const [at, file] of listed.entries()) {
    snapshot.set(file.path, { hash: hashes[at] ?? '', content: await contentOf(read, file.path) })
  }

  return snapshot
}

/** One step of a line diff: a line both share, one removed, one added. */
type Step = { kind: ' ' | '-' | '+'; line: string }

/** The most edits the line diff looks for before it calls the rest one change. */
const MAX_EDITS = 1000

/**
 * The steps turning `before` into `after`, shortest first (Myers' diff):
 * the lines they share at the start and end kept, the rest as few removals
 * and additions as it can find. Past MAX_EDITS, what lies between is all
 * removed, then all added.
 */
export const diffLines = (before: readonly string[], after: readonly string[]): Step[] => {
  let start = 0
  while (start < before.length && start < after.length && before[start] === after[start]) {
    start += 1
  }
  let end = 0
  while (end < before.length - start && end < after.length - start && before[before.length - 1 - end] === after[after.length - 1 - end]) {
    end += 1
  }
  const a = before.slice(start, before.length - end)
  const b = after.slice(start, after.length - end)
  const shared = (lines: readonly string[]): Step[] => lines.map(line => ({ kind: ' ', line }))

  return [
    ...shared(before.slice(0, start)),
    ...middleSteps(a, b),
    ...shared(before.slice(before.length - end)),
  ]
}

/** Myers' greedy diff of two runs of lines with nothing shared at either end. */
const middleSteps = (a: readonly string[], b: readonly string[]): Step[] => {
  const n = a.length
  const m = b.length
  const replaced = (): Step[] => [
    ...a.map((line): Step => ({ kind: '-', line })),
    ...b.map((line): Step => ({ kind: '+', line })),
  ]
  if (n === 0 || m === 0) {
    return replaced()
  }

  const max = Math.min(n + m, MAX_EDITS)
  const offset = max + 1
  const v = new Int32Array(2 * max + 3)
  const trace: Int32Array[] = []
  let found = -1
  for (let d = 0; d <= max && found < 0; d++) {
    trace.push(v.slice())
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && (v[offset + k - 1] ?? 0) < (v[offset + k + 1] ?? 0)) ? (v[offset + k + 1] ?? 0) : (v[offset + k - 1] ?? 0) + 1
      let y = x - k
      while (x < n && y < m && a[x] === b[y]) {
        x += 1
        y += 1
      }
      v[offset + k] = x
      if (x >= n && y >= m) {
        found = d
        break
      }
    }
  }
  if (found < 0) {
    return replaced()
  }

  // Back from the end: each edit, after the diagonal of shared lines that
  // followed it.
  const steps: Step[] = []
  let x = n
  let y = m
  for (let d = found; d > 0; d--) {
    const prev = trace[d] ?? v
    const k = x - y
    const isDown = k === -d || (k !== d && (prev[offset + k - 1] ?? 0) < (prev[offset + k + 1] ?? 0))
    const prevK = isDown ? k + 1 : k - 1
    const prevX = prev[offset + prevK] ?? 0
    const prevY = prevX - prevK
    while (x > prevX && y > prevY) {
      x -= 1
      y -= 1
      steps.push({ kind: ' ', line: a[x] ?? '' })
    }
    steps.push(isDown ? { kind: '+', line: b[prevY] ?? '' } : { kind: '-', line: a[prevX] ?? '' })
    x = prevX
    y = prevY
  }
  while (x > 0 && y > 0) {
    x -= 1
    y -= 1
    steps.push({ kind: ' ', line: a[x] ?? '' })
  }

  return steps.reverse()
}

/**
 * The hunks turning `before` into `after`, as a unified diff has them: each
 * change with CONTEXT lines either side, changes closer than twice that in
 * one hunk.
 */
export const hunksBetween = (before: string, after: string): Hunk[] => {
  let oldLine = 1
  let newLine = 1
  // Each step with the line it stands at in the old file and the new.
  const placed = diffLines(linesOf(before), linesOf(after)).map(step => {
    const at = { ...step, oldLine, newLine }
    oldLine += step.kind === '+' ? 0 : 1
    newLine += step.kind === '-' ? 0 : 1

    return at
  })
  const changes = placed.flatMap((step, index) => (step.kind === ' ' ? [] : [index]))

  // Changes no more than 2 * CONTEXT shared lines apart share a hunk.
  const clusters: [number, number][] = []
  for (const index of changes) {
    const last = clusters.at(-1)
    if (last !== undefined && index - last[1] - 1 <= 2 * CONTEXT) {
      last[1] = index
    } else {
      clusters.push([index, index])
    }
  }

  return clusters.map(([first, last]) => {
    const steps = placed.slice(Math.max(0, first - CONTEXT), Math.min(placed.length, last + CONTEXT + 1))
    const start = steps[0] ?? { oldLine: 1, newLine: 1 }
    const oldLines = steps.filter(step => step.kind !== '+').length
    const newLines = steps.filter(step => step.kind !== '-').length

    // A side with no line starts at the line before, as git writes it.
    return {
      oldStart: oldLines === 0 ? start.oldLine - 1 : start.oldLine,
      oldLines,
      newStart: newLines === 0 ? start.newLine - 1 : start.newLine,
      newLines,
      lines: steps.map(step => `${step.kind}${step.line}`),
    }
  })
}

/** A changed file the diff path plays: its FILE_EDIT. */
export type DiffEdit = Extract<GameEvent, { type: 'FILE_EDIT' }>

/** `relative` under `root`, absolute, as a tool's record names its file. */
const under = (root: string, relative: string): string => `${root.replace(/[\\/]+$/, '')}/${relative}`

/**
 * The files changed since the snapshot last saw them, as FILE_EDITs, and the
 * snapshot moved on to what they are now. A file the snapshot has not seen
 * is diffed against HEAD (an untracked one is new); one it saw, against what
 * it saw. A file deleted, or back as HEAD has it, leaves the snapshot and
 * plays nothing; so does one whose earlier content was not kept (too big).
 * At most MAX_DIFF_EDITS a check; the rest are taken into the snapshot
 * unplayed. Git failing plays nothing and leaves the snapshot as it was.
 */
export const changesSince = async (
  snapshot: Snapshot,
  git: Git,
  read: ReadFile,
  /** The project's root, absolute: where git runs, and what each path is relative to. */
  root: string,
): Promise<DiffEdit[]> => {
  const listed = await listChanged(git)
  const hashes = listed === null ? null : await hashesOf(git, listed)
  if (listed === null || hashes === null) {
    return []
  }

  const edits: DiffEdit[] = []
  const stillChanged = new Set(listed.map(file => file.path))
  for (const path of [...snapshot.keys()]) {
    if (!stillChanged.has(path)) {
      snapshot.delete(path)
    }
  }

  for (const [at, file] of listed.entries()) {
    const hash = hashes[at] ?? ''
    const seen = snapshot.get(file.path)
    if (seen?.hash === hash) {
      continue
    }
    const now = await contentOf(read, file.path)
    snapshot.set(file.path, { hash, content: now })
    if (now === null || edits.length >= MAX_DIFF_EDITS) {
      continue
    }

    // Unseen: as HEAD has it, or new when HEAD has none (untracked, or staged new).
    const head = seen === undefined && file.isTracked ? await run(git, ['show', `HEAD:./${file.path}`]) : null
    const before = seen !== undefined ? seen.content : head
    const isNewFile = seen === undefined && head === null
    if (before === null && !isNewFile) {
      continue
    }

    const edit = fileEditOf(
      {
        path: under(root, file.path),
        isNewFile,
        linesBefore: isNewFile ? null : linesOf(before ?? '').length,
        hunks: isNewFile ? [allAdded(now)] : hunksBetween(before ?? '', now),
        source: 'diff',
      },
      root,
    )
    if (edit !== null) {
      edits.push(edit)
    }
  }

  return edits
}

/**
 * The snapshot told that a tool (a Write, an Edit, a NotebookEdit) changed
 * `path` and played it: it takes the file as it is now, so the diff path
 * never plays the same change again. A file outside the root is not the
 * snapshot's; one it cannot read is taken as unknown, so its next change is
 * taken in unplayed rather than played twice.
 */
export const noteChanged = async (
  snapshot: Snapshot,
  git: Git,
  read: ReadFile,
  root: string,
  /** The file's path, absolute or relative to the root. */
  path: string,
): Promise<void> => {
  const base = `${root.replace(/[\\/]+$/, '')}/`
  const slashed = path.replace(/\\/g, '/')
  const relative = slashed.startsWith('/') ? (slashed.startsWith(base) ? slashed.slice(base.length) : null) : slashed.replace(/^\.\//, '')
  if (relative === null || relative === '') {
    return
  }

  const hash = (await run(git, ['hash-object', '--', relative]))?.trim() ?? ''
  const content = hash === '' ? null : await contentOf(read, relative)
  snapshot.set(relative, { hash: hash === '' ? 'unknown' : hash, content })
}
