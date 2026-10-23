import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { newGame, step } from '../src/engine'
import type { Effect } from '../src/engine'
import { drawHud } from '../src/hud'
import { loadPlayer, savePlayer } from '../src/persistence'
import { translateToolCall } from '../src/translate'

/** The session's game, which the HUD draws from; it survives a reload. */
const game = atom({ plugin: 'quest-mod', key: 'game' } as const, null)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // After a reload of the mod the session's game is still in $.state.
    if ((await read($, game)) === null) {
      const player = await loadPlayer($)
      await update($, game, () => newGame(player))
    }

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const outcome = await next(e)
    const event = translateToolCall(e, outcome)

    if (event !== null) {
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
      }
    }

    return outcome
  })
    // The game never blocks a tool call: on a failure the call's own result
    // stands.
    .catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, game)

    if (e.props.hasSurvey || current === null) {
      return next(e)
    }

    return drawHud($, e, current)
  })
}
