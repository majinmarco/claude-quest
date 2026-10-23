import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderSurface } from 'claude-code'

import { newGame, step } from '../src/engine'
import type { Effect, GameEvent } from '../src/engine'
import { drawHud } from '../src/hud'
import {
  discoveredModulesOf,
  loadPlayer,
  readRegionFile,
  recordModulesDiscovered,
  recordQuestAbandoned,
  recordQuestStarted,
  savePlayer,
} from '../src/persistence'
import { drawQuestBoard, noFilters } from '../src/quest-board'
import type { QuestBoardActions } from '../src/quest-board'
import type { QuestSource } from '../src/quest-source'
import { questSourceFor, questSourceSettingOf, unavailable } from '../src/quest-source-setting'
import { drawScene } from '../src/scene'
import { translateCommand, translateMeasure, translateToolCall } from '../src/translate'
import type { MeasureSeen } from '../src/translate'
import type { QuestBoard } from '../types'

/** The session's game, which the HUD draws from; it survives a reload. */
const game = atom({ plugin: 'quest-mod', key: 'game' } as const, null)

/** The Quest Board: the Quests last listed, and the Player's filters. */
const board = atom({ plugin: 'quest-mod', key: 'board' } as const, {
  listing: { state: 'loading' },
  filters: noFilters(),
} satisfies QuestBoard)

const QUEST_BOARD = { id: 'quest-board', title: 'Quest Board' } as const

const SCENE = { id: 'scene', title: 'Scene' } as const

/**
 * Opens the Scene, unasked, when one of `surfaces` draws its art. In the
 * terminal alone it waits for /scene: the HUD already tells the Encounter.
 */
async function openSceneForArt(
  $: EngineInterface,
  surfaces: readonly RenderSurface[],
): Promise<void> {
  if (surfaces.some(surface => surface !== 'terminal')) {
    await $.ui.open(SCENE).catch(() => undefined)
  }
}

/** The command a Quest card fills the prompt with; the Player sends it. */
const IMPLEMENT = '/mattpocock-skills:implement'

/**
 * The Quest Source the Region chose in its Region file, GitHub Issues when it
 * chose none or the file cannot be read. A file that is not JSON may hold a
 * choice gone wrong, so the board says so rather than guess.
 */
async function regionQuestSource($: EngineInterface): Promise<QuestSource> {
  const region = await readRegionFile($).catch(() => ({ ok: true as const, value: undefined }))
  if (!region.ok) {
    return unavailable({ kind: 'unreachable', message: region.reason })
  }

  const setting = questSourceSettingOf(region.value)
  if (!setting.ok) {
    return unavailable(setting.problem)
  }

  return questSourceFor(setting.value, {
    run: argv => $.process.run(argv),
    call: (server, tool, args) => $.mcp.call(server, tool, args),
  })
}

/** Lists the Region's open Quests again, from its Quest Source. */
async function listQuests($: EngineInterface): Promise<void> {
  await update($, board, (current): QuestBoard => ({ ...current, listing: { state: 'loading' } }))

  const listed = await (await regionQuestSource($)).list()

  await update($, board, (current): QuestBoard => ({
    ...current,
    listing: listed.ok
      ? { state: 'listed', quests: listed.value }
      : { state: 'unavailable', problem: listed.problem },
  }))
}

/** What the Quest Board's buttons do. */
const boardActions = ($: EngineInterface): QuestBoardActions => ({
  pick: quest => {
    // Filled, never sent: the Player sends it, and command.run starts the
    // Quest as for one they typed.
    const command = `${IMPLEMENT} ${quest.ticket}`
    const unfilled = () => $.ui.toast(`Could not fill the prompt: run ${command} yourself.`)
    void $.prompt
      .fill({ text: command })
      .then(filled => (filled.isFilled ? undefined : unfilled()), unfilled)
  },
  filterStatus: status => {
    void update($, board, current => ({ ...current, filters: { ...current.filters, status } }))
  },
  filterDifficulty: difficulty => {
    void update($, board, current => ({
      ...current,
      filters: { ...current.filters, difficulty },
    }))
  },
  refresh: () => {
    void listQuests($)
  },
})

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

  // The session's whole list goes to the Region file, not awaited: a file
  // write never holds up the tool call that made the discovery. One that
  // fails leaves the discovery to this session, until the next writes it.
  if (saved !== null && effects.some(effect => effect.type === 'MODULE_DISCOVERED')) {
    void recordModulesDiscovered($, saved.visitedModules).catch(() => undefined)
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
    // The modules explored in this Region in earlier sessions are no first
    // visit; with no Region file to read, every module is new.
    const region = await readRegionFile($).catch(() => ({ ok: false as const }))
    const discovered = region.ok ? discoveredModulesOf(region.value) : []
    await update($, game, current => {
      const resumed = { ...newGame(player), ...current }

      return {
        ...resumed,
        visitedModules: [...new Set([...discovered, ...resumed.visitedModules])],
      }
    })

    // The commands are a convenience: the game plays without them.
    await $.command
      .register({ name: 'quest-board', description: 'Open the Quest Board: this Region\'s open Quests' })
      .catch(() => undefined)
    await $.command
      .register({ name: 'scene', description: 'Open the Scene: the current Encounter, played' })
      .catch(() => undefined)

    await openSceneForArt($, await $.session.surfaces().catch(() => []))

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
    // Without the root, the read still explores, but discovers no Module.
    const root = await $.session.root().catch(() => null)
    const event = translateToolCall(e, outcome, root)

    if (event !== null) {
      await play($, event)
    }

    return outcome
  })
    // The game never blocks a tool call: on a failure the call's own result
    // stands.
    .catch(($, e, next) => next(e))

  on('command.run', { command: 'quest-board' }, async $ => {
    const opened = await $.ui.open(QUEST_BOARD)
    await listQuests($)

    return {
      text: opened.isPlaced
        ? 'Quest Board opened.'
        : 'Quest Board opened: it shows once the window is wide enough.',
    }
  })

  on('command.run', { command: 'scene' }, async $ => {
    const opened = await $.ui.open(SCENE)

    return {
      text: opened.isPlaced
        ? 'Scene opened.'
        : 'Scene opened: it shows once the window is wide enough.',
    }
  })

  on('session.attach', async ($, e, next) => {
    const attached = await next(e)
    await openSceneForArt($, [e.surface])

    return attached
  })

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

  on('ui.render', { component: 'Pane', requestId: QUEST_BOARD.id }, async ($, e) =>
    drawQuestBoard($, e, await read($, board), boardActions($)),
  )

  // The Scene draws what the game already holds: it never runs in a tool
  // call, so it never slows one.
  on('ui.render', { component: 'Pane', requestId: SCENE.id }, async ($, e) =>
    drawScene($, e, (await read($, game))?.encounter ?? null),
  )

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, game)

    if (e.props.hasSurvey || current === null) {
      return next(e)
    }

    return drawHud($, e, current)
  })
}
