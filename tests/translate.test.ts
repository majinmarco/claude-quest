import { describe, expect, test } from 'claude-code/testing'
import type { SessionUsage } from 'claude-code'

import { translateCommand, translateMeasure, translateToolCall } from '../src/translate'
import { glob, grep, read, readMissing } from './fixtures/tool-calls'

describe('Event translator: tool.call', () => {
  test('a Read becomes a FILE_READ of the file it read', () => {
    expect(translateToolCall(read.input, read.result)).toEqual({
      type: 'FILE_READ',
      path: '/work/claude-quest/GLOSSARY.md',
    })
  })

  test('a Grep becomes a FILE_READ of the path it searched', () => {
    expect(translateToolCall(grep.input, grep.result)).toEqual({
      type: 'FILE_READ',
      path: '/work/claude-quest/GLOSSARY.md',
    })
  })

  test('a Glob becomes a FILE_READ of the folder it searched', () => {
    expect(translateToolCall(glob.input, glob.result)).toEqual({
      type: 'FILE_READ',
      path: '/work/claude-quest',
    })
  })

  test('a search with no path explores the working directory', () => {
    const { path: _, ...noPath } = grep.input

    expect(translateToolCall(noPath, grep.result)).toEqual({
      type: 'FILE_READ',
      path: '.',
    })
  })

  test('a Read that failed is no game event', () => {
    expect(translateToolCall(readMissing.input, readMissing.result)).toBeNull()
  })

  test('a Read a hook denied is no game event', () => {
    expect(translateToolCall(read.input, { deny: 'protected' })).toBeNull()
  })

  test('a tool that neither reads nor searches is no game event', () => {
    const bash = { tool: 'Bash', tool_use_id: 'toolu_x', command: 'ls' }

    expect(translateToolCall(bash, { result: {} })).toBeNull()
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
