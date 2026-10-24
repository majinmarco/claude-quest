import { describe, expect, test } from 'claude-code/testing'
import type { SessionUsage } from 'claude-code'

import { translateCommand, translateMeasure, translateToolCall } from '../src/translate'
import { glob, grep, read, readMissing } from './fixtures/tool-calls'
import * as bash from './fixtures/bash-calls'
import { CLAUDE_PLUGIN_TEST_FAILING, vitestFailing3 } from './fixtures/bash-calls'
import * as changes from './fixtures/file-changes'

/** The project's root, as `$.session.root()` answers in the recorded session. */
const ROOT = '/work/claude-quest'

describe('Event translator: tool.call', () => {
  test('a Read becomes a FILE_READ of the file it read, in the root module', () => {
    expect(translateToolCall(read.input, read.result, ROOT)).toEqual({
      type: 'FILE_READ',
      path: '/work/claude-quest/GLOSSARY.md',
      module: '.',
    })
  })

  test('a Read is in the module of its directory, relative to the root', () => {
    const nested = { ...read.input, file_path: '/work/claude-quest/tests/fixtures/tool-calls.ts' }

    expect(translateToolCall(nested, read.result, ROOT)).toEqual({
      type: 'FILE_READ',
      path: '/work/claude-quest/tests/fixtures/tool-calls.ts',
      module: 'tests/fixtures',
    })
  })

  test('a Read outside the project is in no module', () => {
    const outside = { ...read.input, file_path: '/home/marco/.claude/settings.json' }

    expect(translateToolCall(outside, read.result, ROOT)).toEqual({
      type: 'FILE_READ',
      path: '/home/marco/.claude/settings.json',
      module: null,
    })
  })

  test('a relative Read climbing out of the project is in no module', () => {
    const climbing = { ...read.input, file_path: '../other/a.ts' }

    expect(translateToolCall(climbing, read.result, ROOT)).toMatchObject({ module: null })
  })

  test('a path through .. that stays in the project names the module it lands in', () => {
    const through = { ...read.input, file_path: '/work/claude-quest/tests/../src/engine.ts' }

    expect(translateToolCall(through, read.result, ROOT)).toMatchObject({ module: 'src' })
  })

  test('a root with a trailing slash names the same modules', () => {
    const nested = { ...read.input, file_path: '/work/claude-quest/src/engine.ts' }

    expect(translateToolCall(nested, read.result, `${ROOT}/`)).toMatchObject({ module: 'src' })
  })

  test('a sibling folder sharing the root as a prefix is outside the project', () => {
    const sibling = { ...read.input, file_path: '/work/claude-quest-old/src/a.ts' }

    expect(translateToolCall(sibling, read.result, ROOT)).toMatchObject({ module: null })
  })

  test('a relative Read is relative to the root', () => {
    const relative = { ...read.input, file_path: './src/engine.ts' }

    expect(translateToolCall(relative, read.result, ROOT)).toMatchObject({ module: 'src' })
  })

  test('a Grep of a file becomes a FILE_READ of it, in its directory\'s module', () => {
    expect(translateToolCall(grep.input, grep.result, ROOT)).toEqual({
      type: 'FILE_READ',
      path: '/work/claude-quest/GLOSSARY.md',
      module: '.',
    })
  })

  test('a Grep of a folder explores that folder as a module', () => {
    const folder = { ...grep.input, path: '/work/claude-quest/src' }

    expect(translateToolCall(folder, grep.result, ROOT)).toMatchObject({ module: 'src' })
  })

  test('a Glob becomes a FILE_READ of the folder it searched, that folder its module', () => {
    expect(translateToolCall(glob.input, glob.result, ROOT)).toEqual({
      type: 'FILE_READ',
      path: '/work/claude-quest',
      module: '.',
    })
  })

  test('a Glob folder with a dot in its name is still a folder', () => {
    const dotted = { ...glob.input, path: '/work/claude-quest/.claude-plugin' }

    expect(translateToolCall(dotted, glob.result, ROOT)).toMatchObject({
      module: '.claude-plugin',
    })
  })

  test('a search with no path explores the working directory, the root module', () => {
    const { path: _, ...noPath } = grep.input

    expect(translateToolCall(noPath, grep.result, ROOT)).toEqual({
      type: 'FILE_READ',
      path: '.',
      module: '.',
    })
  })

  test('with no root known, a Read is still a FILE_READ, in no module', () => {
    expect(translateToolCall(read.input, read.result, null)).toEqual({
      type: 'FILE_READ',
      path: '/work/claude-quest/GLOSSARY.md',
      module: null,
    })
  })

  test('a Read that failed is no game event', () => {
    expect(translateToolCall(readMissing.input, readMissing.result, ROOT)).toBeNull()
  })

  test('a Read a hook denied is no game event', () => {
    expect(translateToolCall(read.input, { deny: 'protected' }, ROOT)).toBeNull()
  })

  test('a tool that neither reads nor searches is no game event', () => {
    const bash = { tool: 'Bash', tool_use_id: 'toolu_x', command: 'ls' }

    expect(translateToolCall(bash, { result: {} }, ROOT)).toBeNull()
  })
})

describe('Event translator: session.measure', () => {
  test('a measurement becomes a SESSION_MEASURED of its Mana, model and spend', () => {
    const measured = {
      context: { tokens: 84_000, window: 200_000, percent: 42 },
      rateLimits: [],
      cost: { usd: 1.25 },
      changed: ['context', 'cost'],
    }

    expect(translateMeasure(measured, 'claude-opus-5-5')).toEqual({
      type: 'SESSION_MEASURED',
      mana: 42,
      model: 'claude-opus-5-5',
      spendUsd: 1.25,
    })
  })

  test('a window with no reading yet and no cost ledger leaves Mana and spend out', () => {
    const fresh: SessionUsage = {
      startedAt: 0,
      context: { window: 200_000 },
      rateLimits: [],
    }

    expect(translateMeasure(fresh, 'claude-opus-5-5')).toEqual({
      type: 'SESSION_MEASURED',
      mana: undefined,
      model: 'claude-opus-5-5',
      spendUsd: undefined,
    })
  })
})

describe('Event translator: command.run', () => {
  const implement = (args: string, command = 'mattpocock-skills:implement') => ({
    command,
    args,
    origin: { kind: 'composer' },
  })

  const STARTS = [
    ['#4', '#4'],
    ['4', '#4'],
    ['ABC-123', 'ABC-123'],
    ['abc-123', 'ABC-123'],
    ['https://github.com/majinmarco/claude-quest/issues/4', '#4'],
    ['https://acme.atlassian.net/browse/ABC-123', 'ABC-123'],
    ['  #4  then review it', '#4'],
  ] as const

  for (const [args, ticket] of STARTS) {
    test(`/implement ${args.trim()} starts the Quest for ${ticket}`, () => {
      expect(translateCommand(implement(args))).toEqual({ type: 'QUEST_START', ticket })
    })
  }

  test('bare /implement, as typed without its plugin, starts a Quest too', () => {
    expect(translateCommand(implement('#4', 'implement'))).toEqual({
      type: 'QUEST_START',
      ticket: '#4',
    })
  })

  test('/implement with no ticket reference is no game event', () => {
    expect(translateCommand(implement(''))).toBeNull()
    expect(translateCommand(implement('the spec in docs/spec.md'))).toBeNull()
  })

  test('another command with a ticket reference is no game event', () => {
    expect(translateCommand(implement('#4', 'mattpocock-skills:triage'))).toBeNull()
  })
})

describe('Event translator: a Bash check', () => {
  test('a failing vitest run becomes a TEST_FAIL of its failures', () => {
    expect(translateToolCall(vitestFailing3.input, vitestFailing3.result, ROOT)).toEqual({
      type: 'TEST_FAIL',
      check: 'vitest run',
      kind: 'test',
      failures: 3,
    })
  })
})

describe('Event translator: real runner output', () => {
  const RUNS = [
    ['vitestFailing3', { type: 'TEST_FAIL', check: 'vitest run', kind: 'test', failures: 3 }],
    ['vitestFailing1', { type: 'TEST_FAIL', check: 'vitest run', kind: 'test', failures: 1 }],
    ['vitestPassing', { type: 'TEST_PASS', check: 'vitest run', kind: 'test' }],
    ['npmTestFailing', { type: 'TEST_FAIL', check: 'npm test', kind: 'test', failures: 3 }],
    ['vitestNoTestFiles', { type: 'TEST_FAIL', check: 'vitest run nothing', kind: 'test', failures: null }],
    ['jestFailing', { type: 'TEST_FAIL', check: 'jest', kind: 'test', failures: 3 }],
    ['jestPassing', { type: 'TEST_PASS', check: 'jest', kind: 'test' }],
    ['jestSuiteBroken', { type: 'TEST_FAIL', check: 'jest', kind: 'test', failures: null }],
    ['pytestFailing', { type: 'TEST_FAIL', check: 'pytest', kind: 'test', failures: 3 }],
    ['pytestPassing', { type: 'TEST_PASS', check: 'pytest -q', kind: 'test' }],
    ['pytestCollectionError', { type: 'TEST_FAIL', check: 'pytest', kind: 'test', failures: 1 }],
    ['tscFailing3', { type: 'TEST_FAIL', check: 'tsc --noEmit bad3.ts', kind: 'typecheck', failures: 3 }],
    ['tscFailing1', { type: 'TEST_FAIL', check: 'tsc --noEmit bad1.ts', kind: 'typecheck', failures: 1 }],
    ['tscPassing', { type: 'TEST_PASS', check: 'tsc --noEmit good.ts', kind: 'typecheck' }],
    ['eslintFailing', { type: 'TEST_FAIL', check: 'eslint bad.js', kind: 'lint', failures: 3 }],
    ['eslintPassing', { type: 'TEST_PASS', check: 'eslint good.js', kind: 'lint' }],
    ['eslintCrashed', { type: 'TEST_FAIL', check: 'eslint --config missing.mjs bad.js', kind: 'lint', failures: null }],
    ['biomeFailing', { type: 'TEST_FAIL', check: 'biome lint bad.js', kind: 'lint', failures: 3 }],
    ['biomePassing', { type: 'TEST_PASS', check: 'biome lint good.js', kind: 'lint' }],
    ['ruffFailing', { type: 'TEST_FAIL', check: 'ruff check bad.py', kind: 'lint', failures: 5 }],
    ['ruffPassing', { type: 'TEST_PASS', check: 'ruff check good.py', kind: 'lint' }],
  ] as const

  for (const [name, event] of RUNS) {
    test(`${name}: ${bash[name].input.command.replace(/^cd \S+ && /, '')}`, () => {
      const { input, result } = bash[name]

      expect(translateToolCall(input, result, ROOT)).toEqual(event)
    })
  }
})

describe('Event translator: which Bash commands are checks', () => {
  /** A Bash call of `command` that exited `code`, its output `output`. */
  const ran = (command: string, output: string, code = 1) => [
    { tool: 'Bash', tool_use_id: 'toolu_x', command },
    code === 0
      ? { result: { stdout: output, stderr: '', interrupted: false } }
      : { result: `Error: Exit code ${code}\n${output}`, text: `Exit code ${code}\n${output}`, isError: true as const },
  ] as const

  const VITEST_3 = ' Test Files  1 failed (1)\n      Tests  3 failed | 2 passed (5)\n'

  const CHECKS = [
    ['npx vitest run', 'vitest run', 'test'],
    ['vitest', 'vitest', 'test'],
    ['./node_modules/.bin/vitest run', 'vitest run', 'test'],
    ['pnpm test', 'pnpm test', 'test'],
    ['npm run test', 'npm test', 'test'],
    ['npm t', 'npm test', 'test'],
    ['yarn test --watch=false', 'yarn test --watch=false', 'test'],
    ['pnpm exec jest src', 'jest src', 'test'],
    ['uv run pytest -x', 'pytest -x', 'test'],
    ['python -m pytest tests', 'pytest tests', 'test'],
    ['bun test', 'bun test', 'test'],
    ['npx tsc -p .', 'tsc -p .', 'typecheck'],
    ['npm run typecheck', 'npm run typecheck', 'typecheck'],
    ['npx eslint src', 'eslint src', 'lint'],
    ['npx biome check .', 'biome check .', 'lint'],
    ['ruff check .', 'ruff check .', 'lint'],
    ['ruff', 'ruff', 'lint'],
    ['npm run lint', 'npm run lint', 'lint'],
    ['cd app && CI=1 npx vitest run 2>&1', 'vitest run', 'test'],
    ['npm run test:unit', 'npm run test:unit', 'test'],
    ['(cd app; npx --yes vitest run > out.txt)', 'vitest run', 'test'],
  ] as const

  for (const [command, check, kind] of CHECKS) {
    test(`${command} is the ${kind} check ${check}`, () => {
      const [input, outcome] = ran(command, 'boom')

      expect(translateToolCall(input, outcome, ROOT)).toEqual({
        type: 'TEST_FAIL',
        check,
        kind,
        failures: null,
      })
    })
  }

  const NOT_CHECKS = [
    'ls',
    'grep -r vitest src',
    'cat jest.config.js',
    'npm install vitest',
    'npm run build',
    'echo tsc',
    'git commit -m "fix eslint errors"',
    'ruff format .',
    'biome format .',
    'bun install',
  ]

  for (const command of NOT_CHECKS) {
    test(`${command} is no check`, () => {
      const [input, outcome] = ran(command, 'boom')

      expect(translateToolCall(input, outcome, ROOT)).toBeNull()
    })
  }

  test('a failing run piped into tail exits 0, and its counts still fail it', () => {
    const [input, outcome] = ran('npx vitest run | tail -5', VITEST_3, 0)

    expect(translateToolCall(input, outcome, ROOT)).toEqual({
      type: 'TEST_FAIL',
      check: 'vitest run',
      kind: 'test',
      failures: 3,
    })
  })

  test('a check piped through a filter that drops its counts is no event: the exit is the filter\'s', () => {
    const [input, outcome] = ran('npx vitest run 2>&1 | grep FAIL', ' FAIL  math.test.ts > add\n', 0)

    expect(translateToolCall(input, outcome, ROOT)).toBeNull()
  })

  for (const command of ['npx vitest run || true', 'npx vitest run; echo done']) {
    test(`${command}: another command's exit, no counts: no event`, () => {
      const [input, outcome] = ran(command, 'done\n', 0)

      expect(translateToolCall(input, outcome, ROOT)).toBeNull()
    })
  }

  test('a check piped with its counts kept is read by them, whatever the exit', () => {
    const [input, outcome] = ran('npx vitest run | head -40', VITEST_3, 0)

    expect(translateToolCall(input, outcome, ROOT)).toMatchObject({ type: 'TEST_FAIL', failures: 3 })
  })

  test('a check passing with nothing to read passes', () => {
    const [input, outcome] = ran('npm test', '', 0)

    expect(translateToolCall(input, outcome, ROOT)).toEqual({
      type: 'TEST_PASS',
      check: 'npm test',
      kind: 'test',
    })
  })

  test('colour codes do not hide the counts', () => {
    const coloured = '\u001b[2m      Tests \u001b[22m \u001b[1m\u001b[31m2 failed\u001b[39m\u001b[22m\u001b[2m | \u001b[22m\u001b[1m\u001b[32m3 passed\u001b[39m\u001b[22m\u001b[90m (5)\u001b[39m\n'
    const [input, outcome] = ran('npx vitest run', coloured)

    expect(translateToolCall(input, outcome, ROOT)).toMatchObject({ failures: 2 })
  })

  test('npm test reads the summary of the runner it ran: here, claude plugin test', () => {
    const [input, outcome] = ran('npm test', CLAUDE_PLUGIN_TEST_FAILING)

    expect(translateToolCall(input, outcome, ROOT)).toMatchObject({ check: 'npm test', failures: 1 })
  })

  test('an interrupted check never finished: no event', () => {
    const input = { tool: 'Bash', tool_use_id: 'toolu_x', command: 'npx vitest run' }
    const outcome = { result: { stdout: '', stderr: '', interrupted: true } }

    expect(translateToolCall(input, outcome, ROOT)).toBeNull()
  })

  test('a check sent to the background has not finished: no event', () => {
    const input = { tool: 'Bash', tool_use_id: 'toolu_x', command: 'npx vitest run' }
    const outcome = {
      result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'b1' },
    }

    expect(translateToolCall(input, outcome, ROOT)).toBeNull()
  })

  test('an error with no exit code (it could not run) is no event', () => {
    const input = { tool: 'Bash', tool_use_id: 'toolu_x', command: 'npx vitest run' }
    const outcome = { result: 'Error: sandbox refused', text: 'sandbox refused', isError: true as const }

    expect(translateToolCall(input, outcome, ROOT)).toBeNull()
  })

  test('a check a hook denied is no event', () => {
    const input = { tool: 'Bash', tool_use_id: 'toolu_x', command: 'npx vitest run' }

    expect(translateToolCall(input, { deny: 'no tests now' }, ROOT)).toBeNull()
  })
})

describe('Event translator: a file changed', () => {
  /** The scratch project's root in the recorded session. */
  const FORGE = '/work/forge'

  test('a Write of a new file is a FILE_EDIT of a new file, every line added', () => {
    const event = translateToolCall(changes.writeNewFile.input, changes.writeNewFile.result, FORGE)

    expect(event).toMatchObject({
      type: 'FILE_EDIT',
      path: '/work/forge/src/user-profile-card.tsx',
      module: 'src',
      isNewFile: true,
      linesBefore: null,
      linesAdded: 23,
      linesRemoved: 0,
    })
    expect(event?.type === 'FILE_EDIT' && event.diff).toMatch(
      /^@@ -0,0 \+1,23 @@\n\+export type UserProfile = \{\n\+  id: string;\n/,
    )
  })

  test('a one-line Edit counts one line removed and one added, its context left out', () => {
    expect(translateToolCall(changes.editOneLine.input, changes.editOneLine.result, FORGE)).toEqual({
      type: 'FILE_EDIT',
      path: '/work/forge/src/greeting.ts',
      module: 'src',
      isNewFile: false,
      linesBefore: 3,
      linesAdded: 1,
      linesRemoved: 1,
      diff:
        '@@ -1,3 +1,3 @@\n' +
        '-export const greet = (name: string): string => `Hello, ${name}`\n' +
        '+export const greet = (name: string): string => `Hi, ${name}`\n' +
        ' \n' +
        ' export const farewell = (name: string): string => `Bye, ${name}`',
    })
  })

  test('an Edit replacing ten lines with twelve counts both', () => {
    const { input, result } = changes.editTwelveLines

    expect(translateToolCall(input, result, FORGE)).toMatchObject({
      isNewFile: false,
      linesAdded: 12,
      linesRemoved: 10,
    })
  })

  test('an Edit replacing all occurrences counts every line it touched', () => {
    const { input, result } = changes.editReplaceAll

    expect(translateToolCall(input, result, FORGE)).toMatchObject({ linesAdded: 32, linesRemoved: 32 })
  })

  test('a Write over an existing file is no new file: its diff is counted', () => {
    const { input, result } = changes.writeRewrite

    expect(translateToolCall(input, result, FORGE)).toMatchObject({
      path: '/work/forge/src/config.ts',
      isNewFile: false,
      linesBefore: 5,
      linesAdded: 13,
      linesRemoved: 4,
    })
  })

  test('a Write changing one line of an existing file counts that line', () => {
    const { input, result } = changes.writeOneLineChanged

    expect(translateToolCall(input, result, FORGE)).toMatchObject({ linesAdded: 1, linesRemoved: 1 })
  })

  test('a NotebookEdit replacing a cell counts the cell lines it changed', () => {
    const { input, result } = changes.notebookReplace

    expect(translateToolCall(input, result, FORGE)).toEqual({
      type: 'FILE_EDIT',
      path: '/work/forge/analysis.ipynb',
      module: '.',
      isNewFile: false,
      linesBefore: null,
      linesAdded: 2,
      linesRemoved: 2,
      diff: '@@ -1,2 +1,2 @@\n-x = 1\n-print(x)\n+y = 2\n+print(y * 3)',
    })
  })

  test('a NotebookEdit inserting a cell adds its lines', () => {
    const { input, result } = changes.notebookInsert

    expect(translateToolCall(input, result, FORGE)).toMatchObject({ linesAdded: 1, linesRemoved: 0 })
  })

  test('an Edit that failed changed nothing: no event', () => {
    const { input, result } = changes.editNotFound

    expect(translateToolCall(input, result, FORGE)).toBeNull()
  })

  test('a denied Write changed nothing: no event', () => {
    expect(translateToolCall(changes.writeNewFile.input, { deny: 'not now' }, FORGE)).toBeNull()
  })

  // Built from Claude Code 2.1.308's types (BuiltinToolResults.Write and
  // Edit), not recorded: `staged` holds the change for review, the file
  // unchanged; an update's patch is empty when nothing changed, or, with
  // originalFile null, when the old content was too large to diff.
  test('a change held for review (staged) changed nothing yet: no event', () => {
    const { input, result } = changes.editTwelveLines
    const staged = { ...result, result: { ...result.result, staged: true } }

    expect(translateToolCall(input, staged, FORGE)).toBeNull()
  })

  test('an Edit with nothing to replace in a file that did not exist creates it: a new file', () => {
    const { input, result } = changes.editOneLine
    const creating = {
      ...result,
      result: {
        ...result.result,
        oldString: '',
        newString: 'export const a = 1\n',
        originalFile: null,
        structuredPatch: [
          { oldStart: 0, oldLines: 0, newStart: 1, newLines: 1, lines: ['+export const a = 1'] },
        ],
      },
    }

    expect(translateToolCall(input, creating, FORGE)).toMatchObject({
      isNewFile: true,
      linesBefore: null,
      linesAdded: 1,
    })
  })

  test('a Write that changed nothing is no event', () => {
    const { input, result } = changes.writeOneLineChanged
    const unchanged = { ...result, result: { ...result.result, structuredPatch: [] } }

    expect(translateToolCall(input, unchanged, FORGE)).toBeNull()
  })

  test('a Write over a file too large to diff counts its new content as added', () => {
    const { input, result } = changes.writeRewrite
    const undiffed = {
      ...result,
      result: { ...result.result, structuredPatch: [], originalFile: null },
    }

    expect(translateToolCall(input, undiffed, FORGE)).toMatchObject({
      isNewFile: false,
      linesBefore: null,
      linesAdded: 14,
      linesRemoved: 0,
    })
  })
})
