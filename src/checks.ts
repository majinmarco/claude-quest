// Checks: the test runs, lints and type-checks a Bash call may be. Reads which
// check a command runs, by the command alone, and how many failures its
// output counts, from the runners' own summaries.

import type { CheckKind } from '../types'

/** The failures an output counts; null when it counts none it can be read for. */
type Counter = (output: string) => number | null

/** One check a command runs, as read from it. */
export type Check = {
  /**
   * The check's command as the Player would rerun it: its runner and
   * arguments, without the launcher (`npx`, a path), environment
   * assignments, redirections or output-only flags (`-q`, `--reporter=dot`).
   * A Battle is against one Check.
   */
  command: string
  kind: CheckKind
  /** The failures its output counts. */
  count: Counter
  /**
   * Whether the command ends with it, so the call's exit code is its own.
   * After it, a pipe (`| head`), `|| true` or `; echo done` ends the call
   * with another command's exit, and may have dropped its counts.
   */
  endsCommand: boolean
}

const lastMatch = (output: string, pattern: RegExp): RegExpExecArray | null => {
  let last: RegExpExecArray | null = null
  for (const match of output.matchAll(new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`))) {
    last = match as RegExpExecArray
  }

  return last
}

const number = (text: string | undefined): number => Number(text ?? 0)

/** `Tests  3 failed | 2 passed (5)`; `Test Files` is the files, not the tests. */
const vitest: Counter = output => {
  const line = lastMatch(output, /^\s*Tests\s+(.*\(\d+\))\s*$/m)?.[1]

  return line === undefined ? null : number(/(\d+) failed/.exec(line)?.[1])
}

/** `Tests:       3 failed, 2 passed, 5 total`. */
const jest: Counter = output => {
  const line = lastMatch(output, /^Tests:\s+(.*\d+ total)\s*$/m)?.[1]

  return line === undefined ? null : number(/(\d+) failed/.exec(line)?.[1])
}

/**
 * `=== 3 failed, 2 passed in 0.01s ===`, or with -q the same unframed. An
 * error (a test file that would not load) counts as a failure.
 */
const pytest: Counter = output => {
  const line = lastMatch(
    output,
    /^=*\s*((?:\d+ (?:failed|passed|errors?|skipped|xfailed|xpassed|warnings?|deselected|rerun)(?:, )?)+) in [\d.]+s\b/m,
  )?.[1]

  return line === undefined
    ? null
    : number(/(\d+) failed/.exec(line)?.[1]) + number(/(\d+) errors?/.exec(line)?.[1])
}

/**
 * Off a terminal tsc prints one `file(line,col): error TS2322: ...` line per
 * error and no summary; on one, `Found 3 errors in 2 files.`
 */
const tsc: Counter = output => {
  const found = lastMatch(output, /^Found (\d+) errors?\b/m)?.[1]

  return found === undefined ? [...output.matchAll(/\berror TS\d+:/g)].length : number(found)
}

/** `✖ 5 problems (3 errors, 2 warnings)`: warnings fail nothing. */
const eslint: Counter = output => {
  const errors = lastMatch(output, /✖ \d+ problems? \((\d+) errors?, \d+ warnings?\)/)?.[1]

  return errors === undefined ? null : number(errors)
}

/** ruff's `Found 5 errors.` or `All checks passed!`. */
const ruff: Counter = output => {
  const found = lastMatch(output, /^Found (\d+) errors?\./m)?.[1]
  if (found !== undefined) {
    return number(found)
  }

  return /^All checks passed!/m.test(output) ? 0 : null
}

/** biome's `Found 3 errors.` (warnings apart), or only `Checked 1 file ...`. */
const biome: Counter = output => {
  const found = lastMatch(output, /^Found (\d+) errors?\./m)?.[1]
  if (found !== undefined) {
    return number(found)
  }

  return /^Checked \d+ files? in /m.test(output) ? 0 : null
}

/** bun's summary, which `claude plugin test` prints too: ` 3 fail`. */
const bun: Counter = output => {
  const failed = lastMatch(output, /^\s*(\d+) fail\s*$/m)?.[1]

  return failed === undefined ? null : number(failed)
}

/**
 * A package script runs a runner the command does not name, so its output is
 * read by every runner's summary, the first that counts winning.
 */
const anyRunner: Counter = output => {
  for (const counter of [vitest, jest, pytest, bun, eslint, ruff, biome]) {
    const failures = counter(output)
    if (failures !== null) {
      return failures
    }
  }

  // tsc's error lines last: any runner's output may quote one.
  const typeErrors = tsc(output)

  return typeErrors === 0 ? null : typeErrors
}

/** The runners read by name: their kind, how they count, and their subcommands. */
const RUNNERS: Record<string, { kind: CheckKind; count: Counter; subcommands?: string[] }> = {
  vitest: { kind: 'test', count: vitest },
  jest: { kind: 'test', count: jest },
  pytest: { kind: 'test', count: pytest },
  'py.test': { kind: 'test', count: pytest },
  tsc: { kind: 'typecheck', count: tsc },
  'vue-tsc': { kind: 'typecheck', count: tsc },
  eslint: { kind: 'lint', count: eslint },
  ruff: { kind: 'lint', count: ruff, subcommands: ['check'] },
  biome: { kind: 'lint', count: biome, subcommands: ['lint', 'check', 'ci'] },
  bun: { kind: 'test', count: bun, subcommands: ['test'] },
}

/** Package managers, whose scripts are read by name. */
const PACKAGE_MANAGERS = new Set(['npm', 'pnpm', 'yarn'])

/** A package script's name, by the kind of check it is taken for. */
const SCRIPTS: Record<string, CheckKind> = {
  test: 'test',
  lint: 'lint',
  typecheck: 'typecheck',
  'type-check': 'typecheck',
  tsc: 'typecheck',
}

/** Words that launch the command after them: `npx vitest`, `uv run pytest`. */
const LAUNCHERS: readonly (readonly string[])[] = [
  ['npx'],
  ['bunx'],
  ['pnpx'],
  ['npm', 'exec'],
  ['pnpm', 'exec'],
  ['pnpm', 'dlx'],
  ['yarn', 'exec'],
  ['yarn', 'dlx'],
  ['uv', 'run'],
  ['poetry', 'run'],
  ['pipenv', 'run'],
  ['python', '-m'],
  ['python3', '-m'],
  ['time'],
  ['env'],
]

const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/
const REDIRECTION = /^\d*(?:>>?|<)(?:&\d+)?/

/** A word's command name: its path's last segment. */
const baseName = (word: string): string => word.split('/').pop() ?? word

/** The words a segment runs, after its environment assignments and launchers. */
const commandWords = (segment: string): string[] => {
  let words = segment
    .replace(/^[\s(]+|[\s)]+$/g, '')
    .split(/\s+/)
    .filter(word => word !== '')

  for (;;) {
    while (words[0] !== undefined && ENV_ASSIGNMENT.test(words[0])) {
      words = words.slice(1)
    }
    const launcher = LAUNCHERS.find(prefix =>
      prefix.every((word, at) => (at === 0 ? baseName(words[0] ?? '') : words[at]) === word),
    )
    if (launcher === undefined) {
      break
    }
    words = words.slice(launcher.length)
    // The launcher's own options: `npx --yes vitest`.
    while (words[0]?.startsWith('-')) {
      words = words.slice(1)
    }
  }

  // A redirection (`2>&1`, `> out.txt`) is the shell's, not the check's.
  const kept: string[] = []
  for (let at = 0; at < words.length; at++) {
    const word = words[at] ?? ''
    if (REDIRECTION.test(word)) {
      if (/^\d*(?:>>?|<)$/.test(word)) {
        at += 1
      }
      continue
    }
    kept.push(word)
  }

  return kept
}

/** Flags that change how a check prints, never what it checks. */
const OUTPUT_FLAGS = new Set(['-q', '--verbose', '--no-color', '--silent'])

/**
 * The runners whose `-v` is verbose. To tsc, eslint, jest and vitest `-v`
 * prints the version and checks nothing, so there it stays in the key.
 */
const VERBOSE_V = new Set(['pytest', 'py.test'])

/**
 * A check's arguments without its output-only flags (`-q`, pytest's `-v`, `--verbose`,
 * `--silent`, `--no-color`, `--color=...`, `--reporter...` and its value), so
 * `vitest run -q` and `vitest run` are one Check. A `--` left with nothing
 * after it goes too: `npm test -- --reporter=dot` is `npm test`.
 */
const withoutOutputFlags = (name: string, words: readonly string[]): string[] => {
  const kept: string[] = []
  for (let at = 0; at < words.length; at++) {
    const word = words[at] ?? ''
    if (OUTPUT_FLAGS.has(word) || word.startsWith('--color=') || (word === '-v' && VERBOSE_V.has(name))) {
      continue
    }
    if (word.startsWith('--reporter')) {
      // `--reporter dot`: its value is the next word.
      const next = words[at + 1]
      if (!word.includes('=') && next !== undefined && !next.startsWith('-')) {
        at += 1
      }
      continue
    }
    kept.push(word)
  }

  return kept.at(-1) === '--' ? kept.slice(0, -1) : kept
}

/** The check one segment of a command runs, or null. */
const checkOf = (segment: string): Omit<Check, 'endsCommand'> | null => {
  const [first, ...words] = commandWords(segment)
  if (first === undefined) {
    return null
  }
  const name = baseName(first)
  const rest = withoutOutputFlags(name, words)

  if (PACKAGE_MANAGERS.has(name)) {
    const script = rest[0] === 'run' || rest[0] === 'run-script' ? rest[1] : rest[0] === 't' ? 'test' : rest[0]
    // `test:unit` is a test script, `lint:fix` a lint one.
    const kind = script === undefined ? undefined : SCRIPTS[script.split(':')[0] ?? script]
    if (kind === undefined || script === undefined) {
      return null
    }
    // `npm run test` and `npm t` are `npm test`; the script's arguments stay.
    const args = rest.slice(rest[0] === 'run' || rest[0] === 'run-script' ? 2 : 1)
    const command = [name, script === 'test' ? 'test' : `run ${script}`, ...args].join(' ')

    return { command, kind, count: anyRunner }
  }

  const runner = RUNNERS[name]
  if (runner === undefined) {
    return null
  }
  const subcommand = rest.find(word => !word.startsWith('-'))
  if (runner.subcommands !== undefined && !runner.subcommands.includes(subcommand ?? '')) {
    // ruff with no subcommand is ruff check; any other runner needs one.
    if (!(name === 'ruff' && subcommand === undefined)) {
      return null
    }
  }

  return { command: [name, ...rest].join(' '), kind: runner.kind, count: runner.count }
}

/**
 * The check a Bash command runs, or null when it runs none. Of a chain
 * (`cd app && npx vitest run | tail`), the first check is the one read.
 */
export const readCheck = (command: string): Check | null => {
  // Each segment with the operator after it, `` at the command's end.
  for (const [, segment = '', operator] of command.matchAll(/([^|&;\n]*(?:&(?!&)[^|&;\n]*)*)(&&|\|\||\|&|[|;\n]|$)/g)) {
    const check = checkOf(segment)
    if (check !== null) {
      return { ...check, endsCommand: operator === '' }
    }
    if (operator === '') {
      break
    }
  }

  return null
}

const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g

/**
 * The failures a check's run counts: what its output says when it can be
 * read, else none on a zero exit, unknown (null) on any other. An output
 * counting no failures beside a non-zero exit (a suite that would not load)
 * is unknown too. A check that does not end its command, its output counting
 * nothing, tells nothing (undefined): the exit is another command's.
 */
export const failuresOf = (
  check: Check,
  output: string,
  exitCode: number,
): number | null | undefined => {
  const counted = check.count(output.replace(ANSI, ''))
  if (counted !== null && counted > 0) {
    return counted
  }
  if (!check.endsCommand && counted === null) {
    return undefined
  }

  return exitCode === 0 ? 0 : null
}
