// Stub: replaced by issue #15 at merge.
//
// The Region map's opener, as the Overview's Island Buttons call it: the live
// map of the session's Region, or another Region's drawn from its Snapshot.
// Until #15 lands it opens a plain pane naming the Region (and the date of a
// Snapshot).

import type { EngineInterface, RenderInput } from 'claude-code'

import { regionIdOf } from './region-registry'
import type { RegionEntry } from './region-registry'

/** What the Region map draws: the session's Region, live, or another from its Snapshot. */
export type RegionMapTarget = { kind: 'live' } | { kind: 'snapshot'; entry: RegionEntry }

/** The Region map's pane. */
const REGION_MAP = { id: 'region-map', title: 'Region map' } as const

/** What the stub pane says, set as it opens. */
let lines: string[] = ['Region map: not drawn yet']

/** Opens the Region map on `target`. */
export async function openRegionMap($: EngineInterface, target: RegionMapTarget): Promise<void> {
  if (target.kind === 'live') {
    const root = await $.session.root().catch(() => null)
    lines = ['Region map: not drawn yet', `Region: ${root === null ? 'unknown' : regionIdOf(root)}`]
  } else {
    const { entry } = target
    lines = [
      'Region map: not drawn yet',
      `Region: ${entry.id}`,
      entry.snapshot === undefined ? 'not mapped yet' : `as of ${entry.snapshot.takenAt.slice(0, 10)}`,
    ]
  }
  await $.ui.open(REGION_MAP)
  try {
    $.ui.invalidate('ui.render')
  } catch {
    // A pane drawn for the first time needs no redraw.
  }
}

/** The stub pane: the lines set as it opened. */
export function drawRegionMapStub($: EngineInterface, e: RenderInput<'Pane'>) {
  const { Box, Text } = $.ui.resolve(e)

  return (
    <Box flexDirection="column">
      {lines.map((line, at) => (
        <Text key={`line:${at}`}>{line}</Text>
      ))}
    </Box>
  )
}
