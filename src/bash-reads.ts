// Bash reads: a finished Bash call that only reads the code (`cat`, `sed -n`,
// `grep -rn`, `rg`, `find`...) explores it as a Read, a Grep or a Glob does.
// Agents told Bash is fine for reading do most of their reading this way, so
// the game would see almost none of it otherwise.

import type { GameEvent } from './engine'
import { finished, folderOf, moduleOf, namesFile } from './translate'
import type { ToolCallOutcome, ToolCallSeen } from './translate'

/** The most FILE_READs one Bash call plays: reads pay from the capped ambient pool, so this bounds discovery, not XP. */
export const MAX_BASH_READS = 5

/** Commands whose path arguments are files read: each a read in its file's folder. */
const FILE_READERS = new Set(['cat', 'head', 'tail', 'less', 'bat', 'nl', 'wc', 'sed', 'awk'])

/** Commands whose path arguments are folders searched (or a file, taken as its folder). */
const SEARCHERS = new Set(['grep', 'rg', 'ag', 'find'])

/** The commands that only read, and `cd`, which only moves: a command of these alone changes no file. */
const READ_ONLY = new Set([...FILE_READERS, ...SEARCHERS, 'cd'])

/** The flags of each command that take the next word as their value, not a path. */
const VALUE_FLAGS: Record<string, ReadonlySet<string>> = {
  head: new Set(['-n', '-c', '--lines', '--bytes']),
  tail: new Set(['-n', '-c', '--lines', '--bytes', '-s', '--pid']),
  bat: new Set(['-r', '-l', '-H', '-m', '--line-range', '--language', '--highlight-line', '--map-syntax', '--theme', '--style']),
  nl: new Set(['-b', '-d', '-f', '-h', '-i', '-l', '-n', '-s', '-v', '-w']),
  less: new Set(['-b', '-h', '-j', '-p', '-P', '-t', '-T', '-x', '-y', '-z']),
  sed: new Set(['-e', '-f', '-l', '--expression', '--file', '--line-length']),
  awk: new Set(['-F', '-v', '-f', '--field-separator', '--assign', '--file']),
  grep: new Set(['-e', '-f', '-A', '-B', '-C', '-m', '-d', '-D', '--regexp', '--file', '--max-count', '--context', '--after-context', '--before-context', '--include', '--exclude', '--exclude-dir']),
  rg: new Set(['-e', '-f', '-g', '-t', '-T', '-A', '-B', '-C', '-m', '-M', '-j', '-E', '--regexp', '--file', '--glob', '--iglob', '--type', '--type-not', '--max-count', '--max-columns', '--context', '--after-context', '--before-context', '--threads', '--encoding', '--sort', '--sortr']),
  ag: new Set(['-G', '-A', '-B', '-C', '-m', '-p', '--file-search-regex', '--ignore', '--max-count', '--context', '--after', '--before', '--path-to-ignore']),
}

/** The flags that hand the pattern (or the program) over themselves, so no word is the pattern. */
const PATTERN_FLAGS: Record<string, ReadonlySet<string>> = {
  sed: new Set(['-e', '-f', '--expression', '--file']),
  awk: new Set(['-f', '--file']),
  grep: new Set(['-e', '-f', '--regexp', '--file']),
  rg: new Set(['-e', '-f', '--regexp', '--file', '--files']),
  ag: new Set(['-g']),
}

/** `find` actions that write or run something: such a find is no read. */
const FIND_WRITES = new Set(['-delete', '-exec', '-execdir', '-ok', '-okdir', '-fprint', '-fprint0', '-fprintf', '-fls'])

/** A redirection: `>`, `>>`, `2>`, `&>`, `<`, `<<`, `<<<`, `>&`, and its target. */
type Redirect = { op: string; target: string }

/** A simple command between `&&`, `||`, `;`, `|`, `&` or a newline: its words and redirections. */
type Segment = { words: string[]; redirects: Redirect[]; isPiped: boolean }

/**
 * A command line as its simple commands, quotes and escapes taken off; null
 * for one this does not read (a subshell, a command substitution, a quote
 * left open), so nothing in it is taken as a read.
 */
const segmentsOf = (command: string): Segment[] | null => {
  const segments: Segment[] = []
  let segment: Segment = { words: [], redirects: [], isPiped: false }
  let word: string | null = null
  let pendingOp: string | null = null
  let quote: '"' | "'" | null = null

  const endWord = () => {
    if (word === null) {
      return
    }
    if (pendingOp !== null) {
      segment.redirects.push({ op: pendingOp, target: word })
      pendingOp = null
    } else {
      segment.words.push(word)
    }
    word = null
  }
  const endSegment = (isNextPiped: boolean) => {
    endWord()
    if (pendingOp !== null) {
      segment.redirects.push({ op: pendingOp, target: '' })
      pendingOp = null
    }
    if (segment.words.length > 0 || segment.redirects.length > 0) {
      segments.push(segment)
    }
    segment = { words: [], redirects: [], isPiped: isNextPiped }
  }

  for (let at = 0; at < command.length; at++) {
    const char = command[at] ?? ''
    const following = command[at + 1] ?? ''
    if (quote !== null) {
      if (char === quote) {
        quote = null
      } else if (quote === '"' && (char === '$' && following === '(' || char === '`')) {
        return null
      } else if (quote === '"' && char === '\\' && following !== '') {
        word = (word ?? '') + following
        at += 1
      } else {
        word = (word ?? '') + char
      }
      continue
    }
    if (char === "'" || char === '"') {
      quote = char
      word ??= ''
    } else if (char === '\\' && following !== '') {
      if (following !== '\n') {
        word = (word ?? '') + following
      }
      at += 1
    } else if ((char === '$' && following === '(') || char === '`' || char === '(' || char === ')' || char === '{' && word === null) {
      return null
    } else if (char === ' ' || char === '\t') {
      endWord()
    } else if (char === '\n' || char === ';') {
      endSegment(false)
    } else if (char === '|') {
      const isOr = following === '|'
      endSegment(!isOr)
      at += isOr ? 1 : 0
    } else if (char === '&' && following === '&') {
      endSegment(false)
      at += 1
    } else if (char === '&' && following === '>') {
      endWord()
      pendingOp = following === '>' && command[at + 2] === '>' ? '&>>' : '&>'
      at += pendingOp.length - 1
    } else if (char === '&') {
      endSegment(false)
    } else if (char === '>' || char === '<') {
      // A file descriptor written before it (`2>`) is part of it.
      const fd = word !== null && /^\d+$/.test(word) ? word : ''
      if (fd !== '') {
        word = null
      } else {
        endWord()
      }
      let op = char
      while (command[at + 1] === char || (char === '>' && command[at + 1] === '&') || (char === '<' && op.length < 3 && command[at + 1] === '<')) {
        op += command[at + 1]
        at += 1
      }
      pendingOp = fd + op
      // `2>&1`: the target is a descriptor, written right after.
      if (op.endsWith('&')) {
        let target = ''
        while (/[\d-]/.test(command[at + 1] ?? '')) {
          target += command[at + 1]
          at += 1
        }
        segment.redirects.push({ op: pendingOp, target })
        pendingOp = null
      }
    } else {
      word = (word ?? '') + char
    }
  }
  if (quote !== null) {
    return null
  }
  endSegment(false)

  return segments
}

/** Whether a redirection writes a file: anything but to a descriptor or /dev/null, or reading in. */
const writesFile = ({ op, target }: Redirect): boolean =>
  op.includes('>') && !op.endsWith('&') && target !== '/dev/null'

/** The words of a segment after any leading `NAME=value` assignments. */
const commandWords = (words: readonly string[]): string[] => {
  const start = words.findIndex(word => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(word))

  return start < 0 ? [] : words.slice(start)
}

/** Whether a short flag cluster (`-ni`, `-i.bak`) or a long flag edits in place. */
const isInPlace = (command: string, flag: string): boolean =>
  (command === 'sed' && (/^-[a-zA-Z]*i/.test(flag) && !flag.startsWith('--') || flag.startsWith('--in-place'))) ||
  (command === 'awk' && (flag === '-i' || flag === '--include'))

/** A command's arguments split into flags and positional words, values of flags left out. */
const argumentsOf = (command: string, args: readonly string[]): { flags: string[]; positional: string[] } => {
  const flags: string[] = []
  const positional: string[] = []
  const takesValue = VALUE_FLAGS[command] ?? new Set<string>()
  let isEndOfFlags = false
  for (let at = 0; at < args.length; at++) {
    const arg = args[at] ?? ''
    if (isEndOfFlags || !arg.startsWith('-') || arg === '-') {
      positional.push(arg)
      continue
    }
    if (arg === '--') {
      isEndOfFlags = true
      continue
    }
    flags.push(arg)
    if (takesValue.has(arg)) {
      at += 1
    }
  }

  return { flags, positional }
}

/** The paths a find searches: the words before its first expression; `.` when none. */
const findPaths = (args: readonly string[]): string[] | null => {
  if (args.some(arg => FIND_WRITES.has(arg))) {
    return null
  }
  const start = args.findIndex(arg => !/^-[HLP]$/.test(arg) && !/^-O\d$/.test(arg))
  const rest = start < 0 ? [] : args.slice(start)
  const end = rest.findIndex(arg => arg.startsWith('-') || arg === '(' || arg === '!')
  const paths = end < 0 ? rest : rest.slice(0, end)

  return paths.length === 0 ? ['.'] : paths
}

/** What one segment reads: the files read and the folders searched, as written; null when it is no read. */
const readsOfSegment = (segment: Segment): { files: string[]; folders: string[] } | null => {
  const [command = '', ...args] = commandWords(segment.words)
  if (!FILE_READERS.has(command) && !SEARCHERS.has(command)) {
    return null
  }
  if (segment.redirects.some(writesFile) || segment.redirects.some(redirect => redirect.op.startsWith('<<'))) {
    return null
  }

  if (command === 'find') {
    const paths = findPaths(args)

    return paths === null ? null : { files: [], folders: paths }
  }

  const { flags, positional } = argumentsOf(command, args)
  if (flags.some(flag => isInPlace(command, flag))) {
    return null
  }
  const givesPattern = PATTERN_FLAGS[command]
  const hasPatternWord = givesPattern !== undefined && !flags.some(flag => givesPattern.has(flag))
  const paths = (hasPatternWord ? positional.slice(1) : positional).filter(path => path !== '-')
  const awkPaths = command === 'awk' ? paths.filter(path => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(path)) : paths

  if (FILE_READERS.has(command)) {
    return { files: awkPaths, folders: [] }
  }
  if (awkPaths.length > 0) {
    return { files: [], folders: awkPaths }
  }
  // No path: grep reads its input unless recursive; rg and ag search the
  // folder they run in, unless they filter a pipe.
  const isRecursive = flags.some(flag => /^-[a-zA-Z]*[rR]/.test(flag) && !flag.startsWith('--')) || flags.includes('--recursive')
  const searchesHere = command === 'grep' ? isRecursive && !segment.isPiped : !segment.isPiped

  return { files: [], folders: searchesHere ? ['.'] : [] }
}

/** Whether a path is one the shell would have to expand first: `~`, `$HOME`. */
const isUnexpanded = (path: string): boolean => path.startsWith('~') || path.includes('$')

/** A path as written in a segment that ran in `folder` (null: the session's). */
const inFolder = (folder: string | null, path: string): string =>
  folder === null || path.startsWith('/') ? path : `${folder.replace(/\/+$/, '')}/${path}`

/** What a Bash command reads, and whether all it does is read (and move with `cd`). */
export type BashReads = { reads: Extract<GameEvent, { type: 'FILE_READ' }>[]; isReadOnly: boolean }

const NONE: BashReads = { reads: [], isReadOnly: false }

/**
 * A finished Bash call (exit 0) that reads the code becomes FILE_READs, as
 * Read, Grep and Glob do: one per path a segment names, a file read in its
 * folder and a search in the folder it names (`.` when none). A segment
 * starts with `cat`, `head`, `tail`, `less`, `bat`, `nl`, `wc`, `sed` (not
 * `-i`), `awk`, `grep`, `rg`, `ag` or `find` (not `-delete`, `-exec`); one
 * writing a file (`>`, a heredoc) reads nothing. Only paths inside the
 * project count, in a Module (an ignored folder is in none), and at most
 * MAX_BASH_READS of them. A failed call, or one denied, reads nothing.
 */
export const translateBashReads = (
  input: ToolCallSeen,
  outcome: ToolCallOutcome,
  /** The project's root, absolute; null when it cannot be read. */
  root: string | null,
): BashReads => {
  if (input.tool !== 'Bash' || typeof input.command !== 'string' || outcome.deny !== undefined) {
    return NONE
  }
  const segments = segmentsOf(input.command)
  if (segments === null) {
    return NONE
  }

  let folder: string | null = null
  let isReadOnly = segments.length > 0
  const reads: BashReads['reads'] = []
  const seen = new Set<string>()
  const add = (path: string, searched: string) => {
    const module = moduleOf(searched, root)
    if (module === null || isUnexpanded(path) || seen.has(path) || reads.length >= MAX_BASH_READS) {
      return
    }
    seen.add(path)
    reads.push({ type: 'FILE_READ', path, module })
  }

  for (const segment of segments) {
    const words = commandWords(segment.words)
    if (words[0] === 'cd' && segment.redirects.length === 0) {
      const target = words[1]
      folder = target === undefined || isUnexpanded(target) ? null : inFolder(folder, target)
      continue
    }
    const read = readsOfSegment(segment)
    if (read === null) {
      isReadOnly = false
      continue
    }
    if (!READ_ONLY.has(words[0] ?? '')) {
      isReadOnly = false
    }
    for (const file of read.files) {
      const path = inFolder(folder, file)
      add(path, folderOf(path))
    }
    for (const searched of read.folders) {
      const path = inFolder(folder, searched)
      add(path, namesFile(path) ? folderOf(path) : path)
    }
  }

  const run = finished(outcome)

  return run === null || run.exitCode !== 0 ? { reads: [], isReadOnly } : { reads, isReadOnly }
}
