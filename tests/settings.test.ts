import { describe, expect, test } from 'claude-code/testing'

import { DEFAULT_RULES } from '../src/engine'
import { rulesOf } from '../src/settings'

describe('Settings', () => {
  test('with nothing set, the rules are the defaults', () => {
    expect(rulesOf({})).toEqual({
      sageCallsPerQuest: 10,
      bossFightCallsPerQuest: 3,
      sageCallsOutsideQuest: 5,
      hastyAnswerMs: 5000,
      nonTrivialLines: 3,
    })
  })

  test('each setting the Player changed replaces its default; seconds become ms', () => {
    expect(
      rulesOf({
        sageCallsPerQuest: 4,
        bossFightCallsPerQuest: 0,
        sageCallsOutsideQuest: 1,
        hastyAnswerSeconds: 2.5,
        nonTrivialLines: 6,
      }),
    ).toEqual({
      sageCallsPerQuest: 4,
      bossFightCallsPerQuest: 0,
      sageCallsOutsideQuest: 1,
      hastyAnswerMs: 2500,
      nonTrivialLines: 6,
    })
  })

  test('a value that is no count (negative, fractional, text) keeps its default; a fraction of a call rounds down', () => {
    expect(
      rulesOf({ sageCallsPerQuest: -1, bossFightCallsPerQuest: 2.9, hastyAnswerSeconds: 'soon', nonTrivialLines: Number.NaN }),
    ).toEqual({ ...DEFAULT_RULES, bossFightCallsPerQuest: 2 })
  })
})
