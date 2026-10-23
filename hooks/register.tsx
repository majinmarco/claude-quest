import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { newGame, step } from '../src/engine'
import type { Effect, GameEvent } from '../src/engine'
import { drawHud } from '../src/hud'
import {
  loadPlayer,
  recordQuestAbandoned,
  recordQuestStarted,
  savePlayer,
} from '../src/persistence'
import { translateCommand, translateMeasure, translateToolCall } from '../src/translate'
import type { MeasureSeen } from '../src/translate'

/** The session's game, which the HUD draws from; it survives a reload. */
const game = atom({ plugin: 'quest-mod', key: 'game' } as const, null)

/** Steps the session's game by one event, keeps the Player, plays the effects. */
async function play($: EngineInterface, event: GameEvent): Promise<void> {
  // Before session.start has set the game up, start from the kept Player,
  // never a new one that would overwrite it.
  const before = (await read($, game)) ?? newGame(await loadPlayer($))
  let effects: Effect[] = []
  await update($, game, current => {
    const stepped = step(current ?? before, event)
    effects = stepped.effects

    return stepped.state
  })

  const saved = await read($, game)
  if (saved !== null) {
    await savePlayer($, saved.player)
  }

  for (const effect of effects) {
    if (effect.type === 'LEVEL_UP') {
      $.ui.toast(`Level up! You are now level ${effect.level}.`)
    }
    if (effect.type === 'COMPACTION_WARNING') {
      $.ui.toast(
        `Mana at ${effect.mana}%: the context will compact soon. Wrap up or start a fresh session.`,
      )
    }
    if (effect.type === 'QUEST_ABANDONED') {
      $.ui.toast(`Quest abandoned: ${effect.ticket}`)
      await recordQuestAbandoned($, effect.ticket)
    }
    if (effect.type === 'QUEST_STARTED') {
      $.ui.toast(`Quest started: ${effect.ticket}`)
      await recordQuestStarted($, effect.ticket)
    }
  }
}

/** Plays a reading of the session's vitals, with the model it runs on. */
async function measure($: EngineInterface, usage: MeasureSeen): Promise<void> {
  await play($, translateMeasure(usage, await $.session.model()))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // After a reload of the mod the session's game is still in $.state; one
    // kept by an older version of the mod gains the fields it lacks.
    const kept = await read($, game)
    const player = kept?.player ?? (await loadPlayer($))
    await update($, game, current => ({ ...newGame(player), ...current }))

    const started = await next(e)

    // Vitals read from the start, not only after the first turn; a failed
    // reading leaves them blank until the next measurement.
    const usage = await $.session.usage().catch(() => null)
    if (usage !== null) {
      await measure($, usage)
    }

    return started
  })

  on('tool.call', async ($, e, next) => {
    const outcome = await next(e)
    const event = translateToolCall(e, outcome)

    if (event !== null) {
      await play($, event)
    }

    return outcome
  })
    // The game never blocks a tool call: on a failure the call's own result
    // stands.
    .catch(($, e, next) => next(e))

  on('command.run', async ($, e, next) => {
    // The Quest starts before the command runs: `next(e)` may not resolve
    // until the run is under way, and its Encounters belong to the Quest.
    const event = translateCommand(e)

    if (event !== null) {
      await play($, event)
    }

    return next(e)
  })
    // The game never blocks a command: on a failure it runs as typed.
    .catch(($, e, next) => next(e))

  on('session.measure', async ($, e, next) => {
    await measure($, e)

    return next(e)
  })
    // Vitals are a reading: a failed one leaves the last on the HUD.
    .catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, game)

    if (e.props.hasSurvey || current === null) {
      return next(e)
    }

    return drawHud($, e, current)
  })
}
