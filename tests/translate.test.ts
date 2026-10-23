import { describe, expect, test } from 'claude-code/testing'
import type { SessionUsage } from 'claude-code'

import { translateCommand, translateMeasure, translateToolCall } from '../src/translate'
import { glob, grep, read, readMissing } from './fixtures/tool-calls'

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
