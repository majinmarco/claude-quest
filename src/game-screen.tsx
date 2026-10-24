// The Game Screen: the whole game in one pane (id `game`), in four bands, as
// a JRPG screen is laid out. The Stage plays the current Encounter (the
// Scene's art, or its one line in the terminal); the Dialogue box under it
// holds whoever speaks (the Sage's Question, the boss) or the narrator's
// line; the Tab row picks the View the Panel shows (the Quest Board, the
// Region map, the Quest Log, the Overview), with the Player's level and
// Badges at its end. Each view's place is kept in one `$.state` record, so a
// switch or a reload loses nothing. The bands' contents are drawn by their
// own modules and handed in (hooks/register.tsx composes them); this module
// lays them out, keeps the record and opens the pane. It never asks for the
// focus: its Buttons' hotkeys work once the Player gives it the keyboard.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderChildren, RenderInput, RenderSurface, UiOpenResult } from 'claude-code'

import type { GameScreen, GameView } from '../types'

export type { GameScreen, GameView } from '../types'

/** The one pane the mod opens. */
export const GAME = { id: 'game', title: 'Claude Quest' } as const

/**
 * The panes the mod drew before the Game Screen: one an older load left
 * open is closed as the session starts.
 */
export const RETIRED_PANES: readonly string[] = ['scene', 'quest-board', 'sage', 'boss', 'region-map', 'quest-log', 'overview']

/** The tab row: each view's label and hotkey, in order. */
export const VIEWS: readonly { view: GameView; label: string; hotkey: string }[] = [
  { view: 'quests', label: 'Quests', hotkey: '1' },
  { view: 'map', label: 'Map', hotkey: '2' },
  { view: 'log', label: 'Log', hotkey: '3' },
  { view: 'sheet', label: 'Sheet', hotkey: '4' },
]

/** The Game Screen as a session starts: the Quest Board, every view at its start. */
export const initialGameScreen = (): GameScreen => ({
  view: 'quests',
  board: { page: 0, selected: null },
  map: { view: 'overworld', site: null, floor: 0, selected: null },
  log: { ticket: null },
  sheet: { page: 0 },
})

/** The view and each view's place, for the session; it survives a reload. */
export const gameScreen = atom({ plugin: 'quest-mod', key: 'gameScreen' } as const, initialGameScreen())

/** The record as kept, each place filled in where it lacks one. */
const filled = (kept: Partial<GameScreen> | undefined): GameScreen => {
  const initial = initialGameScreen()

  return {
    view: VIEWS.some(each => each.view === kept?.view) ? (kept?.view ?? initial.view) : initial.view,
    board: { ...initial.board, ...kept?.board },
    map: { ...initial.map, ...kept?.map },
    log: { ...initial.log, ...kept?.log },
    sheet: { ...initial.sheet, ...kept?.sheet },
  }
}

/** The Game Screen's record as kept now. */
export async function readGameScreen($: EngineInterface): Promise<GameScreen> {
  return filled(await read($, gameScreen))
}

/** Changes the record in one update. */
export async function updateGameScreen($: EngineInterface, change: (current: GameScreen) => GameScreen): Promise<void> {
  await update($, gameScreen, current => change(filled(current)))
}

/** Changes one view's place, the rest kept. */
export async function updatePlace<K extends Exclude<keyof GameScreen, 'view'>>(
  $: EngineInterface,
  key: K,
  change: (place: GameScreen[K]) => GameScreen[K],
): Promise<void> {
  await updateGameScreen($, current => ({ ...current, [key]: change(current[key]) }))
}

/** Opens the Game Screen as it is: the view last shown. Never with the focus. */
export async function openGameScreen($: EngineInterface): Promise<UiOpenResult> {
  return $.ui.open(GAME)
}

/** Opens the Game Screen on `view`. */
export async function showView($: EngineInterface, view: GameView): Promise<UiOpenResult> {
  await updateGameScreen($, current => ({ ...current, view }))

  return openGameScreen($)
}

/** Closes each pane of RETIRED_PANES an older load left open. */
export async function closeRetiredPanes($: EngineInterface): Promise<void> {
  const open = await $.ui.panes().catch(() => [])
  for (const pane of open) {
    if (RETIRED_PANES.includes(pane.id)) {
      await $.ui.close({ id: pane.id }).catch(() => undefined)
    }
  }
}

/** Whether the Game Screen is up where the Player sees it: shown and placed. */
export async function isGameScreenInView($: EngineInterface): Promise<boolean> {
  const panes = await $.ui.panes().catch(() => [])

  return panes.some(pane => pane.id === GAME.id && pane.isShown && pane.isPlaced)
}

// The layout.

/** CSS pixels a cell of the body takes across, and a row down: the measure the stage is fitted with. */
export const COLUMN_PX = 8
export const ROW_PX = 16

/** The full stage at its widest, in CSS pixels: the Scene's 128 pixels at 3×. */
export const STAGE_WIDTH = 384

/** The strip stage, in CSS pixels: 128 pixels across, one 16 px sprite tall, at 2×. */
export const STRIP_WIDTH = 256

/** The rows the dialogue box keeps however short the pane, the tab row's, and the panel's least. */
export const DIALOGUE_ROWS = 3
export const TAB_ROWS = 1
export const PANEL_ROWS = 8

/**
 * How the stage is drawn: the full Scene `width` CSS pixels across, one
 * strip of sprites, or the Scene's one line of text.
 */
export type StageLayout = { kind: 'full'; width: number } | { kind: 'strip'; width: number } | { kind: 'line' }

/**
 * The stage for a pane `bodyColumns` across and `bodyRows` down: the
 * terminal (or a surface without SVG) has the one line; elsewhere the full
 * Scene, as wide as the pane allows, when it leaves room for the dialogue
 * box's three rows, the tab row and eight rows of panel; else one strip.
 * The stage shrinks first: the dialogue box and the panel keep their rows.
 */
export const stageLayoutOf = (drawsArt: boolean, bodyRows: number, bodyColumns: number): StageLayout => {
  if (!drawsArt) {
    return { kind: 'line' }
  }

  const across = Math.max(bodyColumns, 1) * COLUMN_PX
  const width = Math.min(STAGE_WIDTH, across)
  const stageRows = Math.ceil(width / 2 / ROW_PX)

  return bodyRows >= stageRows + DIALOGUE_ROWS + TAB_ROWS + PANEL_ROWS
    ? { kind: 'full', width }
    : { kind: 'strip', width: Math.min(STRIP_WIDTH, across) }
}

/** Whether `surface` draws the stage's art: everywhere `Svg` is drawn, the terminal aside. */
export const drawsArtOn = (surface: RenderSurface, elements: object): boolean => surface !== 'terminal' && 'Svg' in elements

/** What the shell is handed: each band's tree, the view chosen, the HUD's first parts, what a tab does. */
export type GameScreenParts = {
  stage: RenderChildren
  dialogue: RenderChildren
  panel: RenderChildren
  view: GameView
  /** `Lv 4`, as the HUD says it. */
  level: string
  /** The Badges earned, `★N`. */
  badges: number
  /** The Player picked this view on the tab row. */
  choose: (view: GameView) => void
}

/**
 * The Game Screen: the stage, the dialogue box, the tab row and the panel,
 * each in a Box keyed by its band (`game-stage`, `game-dialogue`,
 * `game-tabs`, `game-panel`). The terminal parts them with rules; the panel
 * is drawn whole, and the pane scrolls it.
 */
export function drawGameScreen($: EngineInterface, e: RenderInput<'Pane'>, parts: GameScreenParts) {
  const elements = $.ui.resolve(e)
  const { Box, Text, Button } = elements
  const isText = !drawsArtOn(e.surface, elements)
  const rule = (at: string) =>
    isText ? (
      <Text key={`game-rule:${at}`} dimColor>
        {'─'.repeat(Math.max(e.props.bodyColumns, 1))}
      </Text>
    ) : null

  const tabs = (
    <Box key="game-tabs" flexDirection="row" gap={1}>
      {VIEWS.map(({ view, label, hotkey }) =>
        view === parts.view ? (
          <Button key={`game-tab:${view}`} hotkey={hotkey} variant="primary" onPress={() => parts.choose(view)}>
            {`${hotkey} ${label}`}
          </Button>
        ) : (
          <Button key={`game-tab:${view}`} hotkey={hotkey} dimColor onPress={() => parts.choose(view)}>
            {`${hotkey} ${label}`}
          </Button>
        ),
      )}
      <Box flexGrow={1} />
      <Text color="yellow">{`★${parts.badges}`}</Text>
      <Text bold>{parts.level}</Text>
    </Box>
  )

  return (
    <Box flexDirection="column" gap={isText ? 0 : 1}>
      <Box key="game-stage" flexDirection="column">
        {parts.stage}
      </Box>
      {rule('stage')}
      <Box key="game-dialogue" flexDirection="column">
        {parts.dialogue}
      </Box>
      {rule('dialogue')}
      {tabs}
      {rule('tabs')}
      <Box key="game-panel" flexDirection="column">
        {parts.panel}
      </Box>
    </Box>
  )
}
