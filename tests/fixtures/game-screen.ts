// The Game Screen as the tests mount it, and readers that look inside one of
// its bands: the panel (the chosen view), the dialogue box, the stage, the
// tab row. A view's tests read its band, so the shell around it (the tab
// row's Buttons, the stage's art) never counts among the view's elements.

/** The Game Screen's pane, docked with room for the full stage: 60 cells across, 40 rows. */
export const GAME = {
  plugin: 'quest-mod',
  component: 'Pane',
  requestId: 'game',
  props: {
    title: 'Claude Quest',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

/** The Game Screen with other room: `bodyRows` rows, `bodyColumns` cells. */
export const gameSized = (bodyRows: number, bodyColumns = 60, placement: 'dock' | 'inline' = 'dock') => ({
  ...GAME,
  props: { ...GAME.props, bodyColumns, placement, scroll: { offset: 0, bodyRows } },
})

/** An element as a mounted drawing describes it. */
export type Described = { type: string; key: string | undefined; text: string; props: Record<string, unknown>; children: unknown[] }

type Drawing = { find: (query: { type?: string; key?: string }) => Promise<Described | undefined> }

/** The Game Screen's bands, by the key of the Box that holds each. */
export type Band = 'game-stage' | 'game-dialogue' | 'game-tabs' | 'game-panel'

/** An element under the one found, as the drawing holds it: its tag, its props, its children. */
type Raw = { type: string; props?: Record<string, unknown>; children?: unknown[] }

const isRaw = (child: unknown): child is Raw => typeof child === 'object' && child !== null && 'type' in child

/** What an element shows, as `find` tells it: its string children in order, a Button's label. */
const textOf = (element: Raw): string =>
  typeof element.props?.label === 'string'
    ? element.props.label
    : (element.children ?? []).map(child => (typeof child === 'string' ? child : isRaw(child) ? textOf(child) : '')).join('')

/** A raw element described as `find` describes one. */
const described = (element: Raw): Described => ({
  type: element.type,
  key: typeof element.props?.key === 'string' ? element.props.key : undefined,
  text: textOf(element),
  props: element.props ?? {},
  children: element.children ?? [],
})

/** Every element under `root` (itself included), in document order. */
const descendants = (root: Described): Described[] => [
  root,
  ...root.children.filter(isRaw).flatMap(child => descendants(described(child))),
]

/** The elements of type `type` inside the band; none when it is not drawn. */
export const inBand = async (ui: Drawing, band: Band, type: string): Promise<Described[]> => {
  const box = await ui.find({ type: 'Box', key: band })

  return box === undefined ? [] : descendants(box).filter(element => element.type === type)
}

/** The panel's elements of type `type`: the chosen view's alone. */
export const inPanel = (ui: Drawing, type: string) => inBand(ui, 'game-panel', type)

/** The texts the band shows, each Text whole. */
export const bandTexts = async (ui: Drawing, band: Band): Promise<string[]> =>
  (await inBand(ui, band, 'Text')).map(found => found.text)

/** The keys of the band's Buttons. */
export const bandButtons = async (ui: Drawing, band: Band): Promise<string[]> =>
  (await inBand(ui, band, 'Button')).map(found => found.key ?? '')
