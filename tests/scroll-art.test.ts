// The Quest Board's scroll art: each Quest card as a pixel scroll, rolled or
// unrolled, lettered in the baked Kenney Mini glyphs. The snapshot is
// written by `node scripts/render-art.mjs --snapshot`, after a look at the
// art (`node scripts/render-art.mjs <dir>` renders it to files).

import { describe, expect, test } from 'claude-code/testing'

import { boardHeaderSvg, pixelWidth, scrollCardSvg, wrapPixelText } from '../src/scroll-art'
import type { QuestCard } from '../types'
import { SAMPLE_CARDS, SAMPLE_SELECTED, SAMPLE_XP } from './fixtures/quest-cards'
import { CARD_SNAPSHOTS, HEADER_SNAPSHOT } from './fixtures/scroll-snapshot'

/** The Svg element's limit, in characters. */
const SVG_LIMIT = 131072

const card = (overrides: Partial<QuestCard> = {}): QuestCard => ({
  ticket: '#6',
  title: 'Quest Board from Jira: read the project, its statuses and story points',
  status: 'needs-triage',
  difficulty: 'Hard',
  recommendedStats: ['wisdom', 'constitution'],
  ...overrides,
})

/** The characters a card's SVG letters, by the glyphs it places, in order. */
const lettered = (svg: string): string =>
  [...svg.matchAll(/<use href="#g([0-9a-f]+)"/g)].map(([, code]) => String.fromCodePoint(parseInt(code ?? '3f', 16))).join('')

describe('Scroll art: lettering', () => {
  test('a glyph is as wide as its advance: "I" 2 pixels, "W" 6, "IW" 8', () => {
    expect(pixelWidth('I')).toBe(2)
    expect(pixelWidth('IW')).toBe(8)
  })

  test('a character the font lacks is drawn, and measured, as ?', () => {
    expect(pixelWidth('é')).toBe(pixelWidth('?'))
    expect(lettered(scrollCardSvg(card({ title: 'Café crash' }), { unrolled: false, xp: 140 }))).toContain('Caf?crash')
  })

  test('text wraps at word boundaries, the last line cut with ... when it runs over', () => {
    expect(wrapPixelText('one two three', pixelWidth('one two'), 3)).toEqual(['one two', 'three'])
    const cut = wrapPixelText('one two three four', pixelWidth('one two'), 1)
    expect(cut).toHaveLength(1)
    expect(cut[0]?.endsWith('...')).toBe(true)
    expect(pixelWidth(cut[0] ?? '')).toBeLessThanOrEqual(pixelWidth('one two'))
  })
})

describe('Scroll art: cards', () => {
  test('a rolled card is a strip between two rollers, 384 CSS pixels wide', () => {
    const svg = scrollCardSvg(card(), { unrolled: false, xp: 140 })

    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 192 30" width="384" height="60"/)
    expect(lettered(svg).startsWith('#6Quest')).toBe(true)
    expect(lettered(svg)).toContain('...')
    expect(svg).not.toContain('<animate')
  })

  test('an unrolled card says its Quest, reward, Stats, status and tags, and unrolls once', () => {
    const svg = scrollCardSvg(card({ tags: ['bug'] }), { unrolled: true, xp: 140 })
    const letters = lettered(svg)

    for (const line of ['Quest#6', 'Hard·Boss:+140XP', 'Stats:WISCON', 'Status:needs-triage', 'Tags:#bug']) {
      expect(letters).toContain(line)
    }
    expect(svg).toContain('calcMode="discrete" dur="0.45s" fill="freeze"')
    expect(svg).not.toContain('repeatCount')
  })

  test('each glyph is defined once and placed with <use>', () => {
    const svg = scrollCardSvg(card({ title: 'qqqq qqqq qqqq' }), { unrolled: true, xp: 140 })

    expect(svg.match(/<path id="g71"/g)).toHaveLength(1)
    expect(svg.match(/href="#g71"/g)?.length).toBe(12)
  })

  test('the difficulty is five gems: Hard fills four, Unrated none and says ?', () => {
    const gold = /fill="#ffb600"/
    const hard = scrollCardSvg(card(), { unrolled: false, xp: 140 })
    const unrated = scrollCardSvg(card({ difficulty: 'Unrated', title: 'x' }), { unrolled: false, xp: 80 })

    expect(hard).toMatch(gold)
    expect(unrated).not.toMatch(gold)
    expect(lettered(unrated)).toBe('#6x?')
  })

  test('no card outgrows the Svg limit, a 120-character title and many tags included', () => {
    const long = card({ title: 'W'.repeat(60) + ' ' + 'm'.repeat(59), tags: Array.from({ length: 30 }, (_, at) => `tag-${at}`) })

    for (const unrolled of [false, true]) {
      expect(scrollCardSvg(long, { unrolled, xp: 140 }).length).toBeLessThan(SVG_LIMIT)
    }
  })

  test("the board's header is a ribbon carrying its label", () => {
    const svg = boardHeaderSvg('QUEST BOARD')

    expect(svg).toMatch(/viewBox="0 0 192 16" width="384" height="32"/)
    expect(lettered(svg)).toBe('QUESTBOARD')
  })
})

describe('Scroll art: snapshot', () => {
  test('the sample board, one card unrolled, draws as approved', () => {
    expect(boardHeaderSvg('QUEST BOARD')).toBe(HEADER_SNAPSHOT)
    expect(
      SAMPLE_CARDS.map(sample =>
        scrollCardSvg(sample, { unrolled: sample.ticket === SAMPLE_SELECTED, xp: SAMPLE_XP[sample.difficulty] }),
      ),
    ).toEqual(CARD_SNAPSHOTS)
  })
})
