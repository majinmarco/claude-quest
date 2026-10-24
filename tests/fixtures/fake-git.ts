// A git repository in memory, for the diff path's tests: HEAD's files and
// the working tree's, and `.gitignore` as a set of paths. It answers the
// git commands the diff path runs as git 2.51 does, in the root
// (`--relative`, paths relative to it), byte for byte where the diff path
// reads the output. The test kit runs no real process, so this stands in
// for a temporary repository.

import type { Git, ReadFile } from '../../src/diff-crafting'

/** An FNV-1a hash of `text`, 40 hex digits as git's are. */
const hashOf = (text: string): string => {
  let hash = 0x811c9dc5
  for (let at = 0; at < text.length; at++) {
    hash = Math.imul(hash ^ text.charCodeAt(at), 0x01000193) >>> 0
  }

  return hash.toString(16).padStart(8, '0').repeat(5)
}

const ok = (stdout: string) => ({ exitCode: 0, stdout })

const NOT_A_REPO = { exitCode: 128, stdout: '' }

export type FakeRepo = {
  /** The files as HEAD has them, by path relative to the root. */
  head: Map<string, string>
  /** The files as the working tree has them. */
  work: Map<string, string>
  /** The paths `.gitignore` ignores. */
  ignored: Set<string>
  /** Binary files: numstat counts them `-`. */
  binary: Set<string>
  /** Every git command run, its arguments joined. */
  runs: string[]
  git: Git
  read: ReadFile
}

/**
 * A repository whose HEAD and working tree hold `files`; `isRepo` false
 * answers every command as git does outside a repository, `isMissing` true
 * as when git is not installed (the call rejects).
 */
export const fakeRepo = (
  files: Record<string, string> = {},
  { isRepo = true, isMissing = false }: { isRepo?: boolean; isMissing?: boolean } = {},
): FakeRepo => {
  const head = new Map(Object.entries(files))
  const work = new Map(Object.entries(files))
  const ignored = new Set<string>()
  const binary = new Set<string>()
  const runs: string[] = []

  const git: Git = async (args, stdin) => {
    runs.push(args.join(' '))
    if (isMissing) {
      throw new Error('spawn git ENOENT')
    }
    if (!isRepo) {
      return NOT_A_REPO
    }
    const [command, ...rest] = args
    switch (command) {
      case 'rev-parse':
        return ok('true\n')
      case 'diff':
        return ok(
          [...head.keys()]
            .filter(path => work.has(path) && work.get(path) !== head.get(path))
            .sort()
            .map(path => (binary.has(path) ? `-\t-\t${path}\0` : `1\t1\t${path}\0`))
            .join(''),
        )
      case 'ls-files':
        return ok(
          [...work.keys()]
            .filter(path => !head.has(path) && !ignored.has(path))
            .sort()
            .map(path => `${path}\0`)
            .join(''),
        )
      case 'hash-object': {
        const paths = rest[0] === '--stdin-paths' ? (stdin ?? '').split('\n').filter(Boolean) : rest.filter(arg => arg !== '--')
        if (paths.some(path => !work.has(path))) {
          return { exitCode: 128, stdout: '' }
        }

        return ok(paths.map(path => `${hashOf(work.get(path) ?? '')}\n`).join(''))
      }
      case 'show': {
        const path = (rest[0] ?? '').replace(/^HEAD:\.\//, '')

        return head.has(path) ? ok(head.get(path) ?? '') : { exitCode: 128, stdout: '' }
      }
      default:
        return { exitCode: 129, stdout: '' }
    }
  }

  const read: ReadFile = async path => {
    const text = work.get(path.replace(/^\.\//, ''))
    if (text === undefined) {
      throw new Error(`ENOENT: ${path}`)
    }

    return text
  }

  return { head, work, ignored, binary, runs, git, read }
}

/** `count` lines of code, numbered from `from`: `export const line1 = 1`. */
export const codeLines = (count: number, from = 1, word = 'line'): string =>
  Array.from({ length: count }, (_, at) => `export const ${word}${from + at} = ${from + at}\n`).join('')
