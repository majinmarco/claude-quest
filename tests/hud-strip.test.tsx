import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { HUD_CALM, HUD_WORST } from './fixtures/hud-states'

const HUD = {
  plugin: 'quest-mod',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

/** The session's game, as `$.state` holds it, answered from `game`. */
const keptGame = (on: On, game: unknown) =>
  on('state.get', (_, e, next) => (e.key === 'game' ? { value: { value: game, version: 1 } } : next(e)))

type Node = { type: string; text?: string; props?: Record<string, unknown>; children?: (Node | string)[] }

const textOf = (node: Node | string): string =>
  typeof node === 'string' ? node : (node.children ?? []).map(textOf).join('')

/** The text HUD's first row as the terminal draws it, its texts two cells apart. */
const terminalFirstRow = async ($: Engine, bodyColumns = 80): Promise<string> => {
  const ui = await $.ui.mount({ ...HUD, surface: 'terminal', props: { ...HUD.props, bodyColumns } })
  const [band] = (await ui.findAll({ type: 'Box' })) as unknown as Node[]
  await ui.unmount()
  const [row] = band?.children ?? []

  return typeof row === 'string' || row === undefined ? String(row) : (row.children ?? []).map(textOf).join('  ')
}

const SURFACES_WITH_SVG = ['desktop', 'vscode'] as const

describe('HUD: the pixel strip', () => {
  test('where the surface draws SVG, the HUD is one strip 48 px tall, its alt the text HUD\'s first row', async ($, on) => {
    keptGame(on, HUD_WORST)
    const firstRow = await terminalFirstRow($)

    for (const surface of SURFACES_WITH_SVG) {
      const ui = await $.ui.mount({ ...HUD, surface })

      const strips = await ui.findAll({ type: 'Svg' })
      expect(strips).toHaveLength(1)
      expect(await ui.find({ type: 'Text' })).toBeUndefined()
      expect(strips[0]?.props.height).toBe(48)
      expect(strips[0]?.props.alt).toBe(firstRow)
      expect(String(strips[0]?.props.source)).toContain('height="48"')
      await ui.unmount()
    }
  })

  test('the terminal keeps the text band', async ($, on) => {
    keptGame(on, HUD_WORST)

    const ui = await $.ui.mount({ ...HUD, surface: 'terminal' })
    expect(await ui.find({ type: 'Svg' })).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: /^Lv / }))?.text).toBe('Lv 4 Scholar')
    await ui.unmount()
  })

  test('with hudStyle text, the desktop draws the text band', { options: { hudStyle: 'text' } }, async ($, on) => {
    keptGame(on, HUD_CALM)

    const ui = await $.ui.mount({ ...HUD, surface: 'desktop' })
    expect(await ui.find({ type: 'Svg' })).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: /^Lv / }))?.text).toBe('Lv 2')
    await ui.unmount()
  })

  test('the strip is as wide as the band\'s columns allow, about 8 px a column', async ($, on) => {
    keptGame(on, HUD_WORST)

    for (const bodyColumns of [40, 80, 160]) {
      const ui = await $.ui.mount({ ...HUD, surface: 'desktop', props: { ...HUD.props, bodyColumns } })
      const width = Number((await ui.find({ type: 'Svg' }))?.props.width)
      expect(width).toBeGreaterThan(0)
      expect(width).toBeLessThanOrEqual(bodyColumns * 8)
      await ui.unmount()
    }
  })

  test('HP lost flashes the HP bar on the next draw, once; XP gained fills the XP bar', async ($, on) => {
    let game = HUD_CALM
    on('state.get', (_, e, next) => (e.key === 'game' ? { value: { value: game, version: 1 } } : next(e)))
    const sourceNow = async () => {
      const ui = await $.ui.mount({ ...HUD, surface: 'desktop' })
      const source = String((await ui.find({ type: 'Svg' }))?.props.source)
      await ui.unmount()

      return source
    }

    expect(await sourceNow()).not.toContain('<animate')
    game = { ...HUD_CALM, player: { ...HUD_CALM.player, hp: 60 } }
    expect(await sourceNow()).toContain('<animate attributeName="opacity"')
    expect(await sourceNow()).not.toContain('<animate')
    game = { ...game, player: { ...game.player, xp: 150, totalXp: 250 } }
    const filled = await sourceNow()
    expect(filled).toContain('<animate attributeName="width"')
    expect(filled).not.toContain('attributeName="opacity"')
  })
})
