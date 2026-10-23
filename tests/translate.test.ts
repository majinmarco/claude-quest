import { describe, expect, test } from 'claude-code/testing'

import { translateToolCall } from '../src/translate'
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
