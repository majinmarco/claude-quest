// The HUD's pixel strip: what it shows by the band's width, the portrait by
// Title, its two one-shot animations, and its art against a snapshot written
// by `node scripts/render-art.mjs --snapshot` after a look.

import { describe, expect, test } from 'claude-code/testing'

import { hudStrip, PIXELS_PER_COLUMN, portraitOf } from '../src/hud-art'
import { stripOf } from '../src/hud'
import { HUD_BATTLE, HUD_CALM, HUD_PROPHECY, HUD_WORST, playerAt } from './fixtures/hud-states'
import { HUD_SNAPSHOTS } from './fixtures/hud-snapshot'

/** The parts by how much they matter, as the text HUD ranks them. */
const BY_RANK = ['level', 'hp', 'xp', 'quest', 'boss', 'questions', 'encounter', 'mana', 'vitals', 'stats', 'badges']

const kindsAt = (columns: number) => stripOf(HUD_WORST, columns).map(segment => segment.kind)

describe('HUD strip: by the band\'s width', () => {
  test('a wide band shows every segment, left to right: portrait and level, HP, XP, Badges, Quest, boss, Questions, Encounter, Mana, model, Stats', () => {
    expect(kindsAt(400)).toEqual(['level', 'hp', 'xp', 'badges', 'quest', 'boss', 'questions', 'encounter', 'mana', 'vitals', 'stats'])
  })

  test('as the band narrows, segments drop in priority order: what is shown is always the most important few', () => {
    for (let columns = 400; columns >= 10; columns -= 2) {
      const shown = kindsAt(columns)
      expect([...shown].sort()).toEqual([...BY_RANK.slice(0, shown.length)].sort())
    }
  })

  test('at 80 columns the strip shows at least the portrait and level, HP, XP and the Quest', () => {
    expect(kindsAt(80).slice(0, 4)).toEqual(['level', 'hp', 'xp', 'quest'])
  })

  test('the Quest\'s title shortens before any segment gives way, down to its ticket alone', () => {
    const titleAt = (columns: number) => {
      const quest = stripOf(HUD_WORST, columns).find(segment => segment.kind === 'quest')

      return quest?.kind === 'quest' ? quest.title : undefined
    }
    const columns = Array.from({ length: 196 }, (_, at) => 400 - at * 2)
    const firstCut = columns.find(each => titleAt(each) !== 'Jira Quest Source: read the p…') ?? 0
    const lastWhole = [...columns].reverse().find(each => kindsAt(each).length === 11) ?? 0

    expect(titleAt(400)).toBe('Jira Quest Source: read the p…')
    expect(kindsAt(firstCut)).toHaveLength(11)
    expect(titleAt(lastWhole)).toBe('')
  })

  test('the strip never draws wider than the band', () => {
    for (const columns of [10, 40, 80, 200]) {
      const { width } = hudStrip(stripOf(HUD_WORST, columns), columns * PIXELS_PER_COLUMN)
      expect(width).toBeLessThanOrEqual(columns * 8)
    }
  })
})

describe('HUD strip: the portrait', () => {
  test('below level 3 the portrait is the plain adventurer; then it follows the Title', () => {
    expect(portraitOf(playerAt(2, { intelligence: 50 }))).toBe('adventurer')
    expect(portraitOf(playerAt(3))).toBe('adventurer')
    expect(portraitOf(playerAt(3, { intelligence: 5, wisdom: 2 }))).toBe('scholar')
    expect(portraitOf(playerAt(5, { wisdom: 9, strength: 3 }))).toBe('pathfinder')
    expect(portraitOf(playerAt(4, { strength: 9 }))).toBe('warrior')
    expect(portraitOf(playerAt(12, { strength: 9 }))).toBe('warrior')
    // The Duelist has no portrait of its own yet: the plain adventurer.
    expect(portraitOf(playerAt(3, { dexterity: 9 }))).toBe('adventurer')
  })
})

describe('HUD strip: motion', () => {
  const animations = (svg: string) => [...svg.matchAll(/<animate\w* attributeName="(\w+)"/g)].map(([, name]) => name)

  test('a still draw has no animation at all', () => {
    for (const state of [HUD_CALM, HUD_WORST, HUD_BATTLE]) {
      expect(animations(hudStrip(stripOf(state, 200), 800).svg)).toEqual([])
    }
  })

  test('HP lost flashes the HP bar once; XP gained fills the XP bar once, from where it was; nothing loops', () => {
    const { svg } = hudStrip(stripOf(HUD_CALM, 200), 800, { isHpLost: true, xpFrom: 0.1 })

    expect(animations(svg)).toEqual(['opacity', 'width'])
    expect(svg).not.toContain('repeatCount')
    expect(svg).toContain('fill="freeze"')
  })
})

describe('HUD strip: snapshot', () => {
  test('the strip at 200 columns, with a Quest, a boss, Questions waiting and Exhausted, and without, matches the approved art', () => {
    expect(hudStrip(stripOf(HUD_WORST, 200), 800).svg).toBe(HUD_SNAPSHOTS.worst)
    expect(hudStrip(stripOf(HUD_CALM, 200), 800).svg).toBe(HUD_SNAPSHOTS.calm)
    expect(hudStrip(stripOf(HUD_BATTLE, 200), 800).svg).toBe(HUD_SNAPSHOTS.battle)
    expect(hudStrip(stripOf(HUD_PROPHECY, 200), 800).svg).toBe(HUD_SNAPSHOTS.prophecy)
  })
})

describe('HUD strip: the Prophecy', () => {
  test('armed and not yet called, the strip draws it waiting beside the Quest; called, the call, dim', () => {
    const segment = (state: typeof HUD_PROPHECY) => stripOf(state, 200).find(each => each.kind === 'prophecy')

    expect(segment(HUD_PROPHECY)).toEqual({ kind: 'prophecy', call: null })
    expect(segment({ ...HUD_PROPHECY, prophecy: { file: 'tests/a.test.ts', armedAt: 0, call: 'rout' } })).toEqual({ kind: 'prophecy', call: 'rout' })
    expect(segment(HUD_CALM)).toBeUndefined()
  })
})
