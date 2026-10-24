// The Overview, the Game Screen's Sheet view (`/overview`, `/badges`): the Player's character sheet (src/sheet.ts)
// above the World (src/world-art.ts). Where the surface draws SVG the sheet
// stands beside the Player's portrait (the HUD's, by Title, at 4x) and the
// World is pixel art; in the terminal the sheet is text and the World a
// character grid. Under the World, a numbered Button per Island, nine a page
// with hotkeys 1 to 9, opens that Region's map (the caller's).

import type { EngineInterface, RenderInput } from 'claude-code'

import { titleOf } from './engine'
import type { Player } from './engine'
import { portraitSpriteOf } from './hud-art'
import { portraitSvg } from './scene-art'
import { sheetRows } from './sheet'
import { GRID_MARKS, islandName, islandNote, islandsOf, worldAlt, worldGrid, worldSvg } from './world-art'
import type { Island } from './world-art'
import type { GameScreen, OverviewState } from '../types'

export type { OverviewState } from '../types'

/** The Overview as it starts: no Region read yet. */
export const emptyOverview = (): OverviewState => ({ regions: {}, root: null })

export type OverviewActions = {
  /** Open this Island's Region map. */
  open: (island: Island) => void
  /** Show this page of Islands, from 0. */
  page: (page: number) => void
}

/** How many Island Buttons a page shows: one per digit hotkey. */
export const ISLANDS_PER_PAGE = 9

/** The portrait's width in CSS px: its 20 px frame at 4x. */
export const PORTRAIT_WIDTH = 80

/** The widest the World's art is drawn, in CSS px. */
const WORLD_MAX_WIDTH = 528

/** What the World says before any Region joined it. */
export const NO_ISLANDS = 'No Islands yet: a project joins the World the first time you play in it.'

/**
 * Draws the Overview for `player`: the sheet (beside the portrait where the
 * surface draws SVG), the World (art, or the terminal's grid), and the page
 * of Island Buttons at `place` (the Game Screen's), page and hotkeys 1 to 9
 * by `actions`.
 */
export function drawOverview(
  $: EngineInterface,
  e: RenderInput<'Pane'>,
  player: Player,
  state: OverviewState,
  place: GameScreen['sheet'],
  actions: OverviewActions,
) {
  const elements = $.ui.resolve(e)
  const { Box, Text, Button } = elements
  // The terminal's table lists Svg too, as a fragment: it draws no SVG.
  const Svg = e.surface !== 'terminal' && 'Svg' in elements ? elements.Svg : undefined

  const rows = (
    <Box flexDirection="column">
      {sheetRows(player).map((row, at) => (
        <Text
          key={`sheet:${at}`}
          {...(row.bold === true ? { bold: true } : {})}
          {...(row.dimColor === true ? { dimColor: true } : {})}
          {...(row.color === undefined ? {} : { color: row.color })}
        >
          {row.text}
        </Text>
      ))}
    </Box>
  )
  const sheet =
    Svg === undefined ? (
      rows
    ) : (
      <Box flexDirection="row" gap={2}>
        <Svg
          source={portraitSvg(portraitSpriteOf(player), PORTRAIT_WIDTH)}
          alt={`Portrait: ${titleOf(player) ?? 'Adventurer'}`}
          width={PORTRAIT_WIDTH}
        />
        {rows}
      </Box>
    )

  const islands = islandsOf(state.regions, state.root)
  const pages = Math.max(Math.ceil(islands.length / ISLANDS_PER_PAGE), 1)
  const page = Math.min(Math.max(place.page, 0), pages - 1)
  const shown = islands.slice(page * ISLANDS_PER_PAGE, (page + 1) * ISLANDS_PER_PAGE)
  const art = Svg === undefined ? null : worldSvg(islands)

  const world =
    islands.length === 0 ? (
      <Text dimColor>{NO_ISLANDS}</Text>
    ) : Svg !== undefined && art !== null ? (
      <Svg source={art.svg} alt={worldAlt(islands)} width={Math.min(art.width, WORLD_MAX_WIDTH)} />
    ) : (
      <Box flexDirection="column">
        {worldGrid(islands).map((line, at) => (
          <Text key={`world:${at}`} wrap="truncate-end">
            {line === '' ? ' ' : line}
          </Text>
        ))}
        <Text dimColor>{`${GRID_MARKS.lit} cleared · ${GRID_MARKS.open} open · ${GRID_MARKS.here} you are here`}</Text>
      </Box>
    )

  return (
    <Box flexDirection="column" gap={1}>
      {sheet}
      <Text bold>{`World (${islands.length} ${islands.length === 1 ? 'Island' : 'Islands'})`}</Text>
      {world}
      {shown.length > 0 && (
        <Box flexDirection="column">
          {shown.map((island, at) => (
            <Button
              key={`island:${island.key}`}
              hotkey={String(at + 1)}
              {...(island.isHere ? { variant: 'primary' as const } : {})}
              onPress={() => actions.open(island)}
            >
              {`${island.number} ${islandName(island)} · ${islandNote(island)}`}
            </Button>
          ))}
        </Box>
      )}
      {pages > 1 && (
        <Box flexDirection="row" gap={1}>
          {page > 0 && (
            <Button key="islands-prev" hotkey="p" onPress={() => actions.page(page - 1)}>
              ◂ Prev
            </Button>
          )}
          <Text dimColor>{`Page ${page + 1} of ${pages}`}</Text>
          {page < pages - 1 && (
            <Button key="islands-next" hotkey="n" onPress={() => actions.page(page + 1)}>
              Next ▸
            </Button>
          )}
        </Box>
      )}
    </Box>
  )
}
