// The event translator: turns what the mod sees of a session into game
// events for the Game Engine, or null when nothing in the game happened.

import type { GameEvent } from './engine'

/** The part of a `tool.call` input the translator reads. */
export type ToolCallSeen = {
  tool: string
  file_path?: unknown
  path?: unknown
}

/** The part of what `next(e)` resolved to that the translator reads. */
export type ToolCallOutcome = { result?: unknown; deny?: string; isError?: true }

const SEARCHES = new Set(['Grep', 'Glob'])

export const translateToolCall = (
  input: ToolCallSeen,
  outcome: ToolCallOutcome,
): GameEvent | null => {
  if (outcome.deny !== undefined || outcome.isError === true) {
    return null
  }

  if (input.tool === 'Read' && typeof input.file_path === 'string') {
    return { type: 'FILE_READ', path: input.file_path }
  }

  if (SEARCHES.has(input.tool)) {
    const path = typeof input.path === 'string' ? input.path : '.'

    return { type: 'FILE_READ', path }
  }

  return null
}
