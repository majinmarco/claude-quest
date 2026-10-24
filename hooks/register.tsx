import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderSurface } from 'claude-code'

import { bossAnswerText, bossOutcomeText, bossQuestionText, drawBoss, NO_BOSS } from '../src/boss'
import type { BossActions } from '../src/boss'
import {
  changesOfGitShow,
  generateQuestion,
  generateReviewQuestions,
  QUESTION_MODEL,
  REVIEW_QUESTION_COUNT,
} from '../src/content-generator'
import type { Model, QuestionInput } from '../src/content-generator'
import { isUnderWay, newGame, step } from '../src/engine'
import type { Effect, FileChange, GameEvent, HaikuPurpose, QuestionContent, Rules } from '../src/engine'
import { badgesText, drawHud } from '../src/hud'
import {
  loadDiscovered,
  loadPlayer,
  loadPlayerMigrated,
  migratePlayer,
  readRegionFile,
  recordModulesDiscovered,
  recordQuestAbandoned,
  recordQuestClosed,
  recordQuestStarted,
  savePlayer,
} from '../src/persistence'
import { drawQuestBoard, noFilters } from '../src/quest-board'
import type { QuestBoardActions } from '../src/quest-board'
import { cachedQuestion, cacheKeyOf, remember } from '../src/question-cache'
import type { QuestionCache } from '../src/question-cache'
import type { QuestSource } from '../src/quest-source'
import { questSourceFor, questSourceSettingOf, unavailable } from '../src/quest-source-setting'
import { answerText, choiceOf, drawSage, NO_QUESTION, questionText } from '../src/sage'
import type { SageActions } from '../src/sage'
import { drawScene } from '../src/scene'
import { autoOpenSceneOf, rulesOf } from '../src/settings'
import { moduleOfFolder, translateCommand, translateCommit, translateMeasure, translateToolCall } from '../src/translate'
import type { MeasureSeen } from '../src/translate'
import type { Difficulty, QuestBoard, XpPool } from '../types'

/** The session's game, which the HUD draws from; it survives a reload. */
const game = atom({ plugin: 'quest-mod', key: 'game' } as const, null)

/** The Quest Board: the Quests last listed, and the Player's filters. */
const board = atom({ plugin: 'quest-mod', key: 'board' } as const, {
  listing: { state: 'loading' },
  filters: noFilters(),
} satisfies QuestBoard)

/**
 * The Questions the Sage made, by the hash of their change: an identical diff
 * reuses one instead of calling Haiku. Kept beside the game, so it survives a
 * reload.
 */
const questionCache = atom(
  { plugin: 'quest-mod', key: 'questionCache' } as const,
  [] as QuestionCache,
)

/** Whether the Scene has opened itself this session: it does so once at most. */
const sceneOpened = atom({ plugin: 'quest-mod', key: 'sceneOpened' } as const, false)

const QUEST_BOARD = { id: 'quest-board', title: 'Quest Board' } as const

const SCENE = { id: 'scene', title: 'Scene' } as const

const SAGE = { id: 'sage', title: 'The Sage' } as const

const BOSS = { id: 'boss', title: 'The Boss' } as const

/**
 * Haiku through the session's own client and credentials (`$.model.complete`):
 * no tools, no history, text back. Low effort keeps a Question cheap and quick;
 * the token cap leaves room for its thinking and the JSON; the time limit
 * keeps a stuck call from hanging on for the rest of the session.
 */
const haikuModel =
  ($: EngineInterface): Model =>
  async ({ system, prompt }) => {
    const reply = await $.model.complete({
      model: QUESTION_MODEL,
      system,
      prompt,
      maxTokens: 4096,
      effort: 'low',
      timeoutMs: 60_000,
    })

    return reply.isAnswered ? { ok: true, text: reply.text } : { ok: false, reason: reply.reason }
  }

/**
 * The active Quest's ticket as the Sage reads it: its reference, and its
 * title when the Quest Board listed it (`#7 Bulk discounts`).
 */
async function activeTicket($: EngineInterface): Promise<string | null> {
  const ticket = (await read($, game))?.quest?.ticket
  if (ticket === undefined) {
    return null
  }

  const { listing } = await read($, board)
  const card =
    listing.state === 'listed' ? listing.quests.find(quest => quest.ticket === ticket) : undefined

  return card === undefined ? ticket : `${ticket} ${card.title}`
}

/**
 * Asks the Game Engine for one Haiku call for `purpose`, against the active
 * Quest's budget (the session's allowance between Quests): true when granted,
 * and counted; false when the budget is spent, logged to the debug log alone.
 * The Boss Fight (#12) asks with `'boss'` before each of its calls, while its
 * Quest is still active: outside a Quest the Boss Fight has no budget.
 */
async function spendHaikuCall(
  $: EngineInterface,
  purpose: HaikuPurpose,
  rules: Rules,
): Promise<boolean> {
  // It changes no Player and plays nothing, so the game is only stepped.
  const effects = await stepGame($, { type: 'HAIKU_CALL_REQUESTED', purpose }, rules)
  const refused = effects.find(effect => effect.type === 'HAIKU_CALL_REFUSED')
  if (refused?.type === 'HAIKU_CALL_REFUSED') {
    $.ui.log(
      `No Haiku call for the ${purpose === 'sage' ? 'Sage' : 'Boss Fight'}: its budget is spent (${refused.used} of ${refused.limit}).`,
      { to: 'debug' },
    )
  }

  return effects.some(effect => effect.type === 'HAIKU_CALL_GRANTED')
}

/**
 * The Sage's one Question about a code-changing Encounter's change: from the
 * cache when the same change was asked about before, at no cost; else, while
 * the budget lasts, Haiku makes it and the Content Generator checks it. It
 * joins the Question Queue. Started unawaited after the tool call has
 * returned, so the session never waits on it; a Question that could not be
 * made, or was over budget, is skipped, logged to the debug log alone.
 */
async function askSage($: EngineInterface, changes: FileChange[], rules: Rules): Promise<void> {
  const key = await cacheKeyOf(changes)
  const cached = cachedQuestion(await read($, questionCache), key)
  if (cached !== undefined) {
    await queueQuestion($, cached, key, rules)
    return
  }

  if (!(await spendHaikuCall($, 'sage', rules))) {
    return
  }

  const input: QuestionInput = { changes, ticket: await activeTicket($) }
  const generated = await generateQuestion(input, haikuModel($))

  if (!generated.ok) {
    $.ui.log(`The Sage skipped a Question (${generated.reason}): ${generated.detail}`, { to: 'debug' })
    return
  }

  await update($, questionCache, cache => remember(cache, key, generated.question))
  await queueQuestion($, generated.question, key, rules)
}

/**
 * Queues a Question the Sage made about the change cached under `key`,
 * unless the same one is already waiting (an identical change, cached, made
 * again before it was answered); the Game Engine queues none for a change
 * already answered this session.
 */
async function queueQuestion(
  $: EngineInterface,
  question: QuestionContent,
  key: string,
  rules: Rules,
): Promise<void> {
  const waiting = (await read($, game))?.questions ?? []
  const isWaiting = waiting.some(
    each => each.prompt === question.prompt && each.source.path === question.source.path,
  )
  if (isWaiting) {
    $.ui.log('The Sage skipped a Question (already-waiting).', { to: 'debug' })
    return
  }

  await play($, { type: 'QUESTION_READY', question, key, at: await $.clock.now() }, rules)
  await showIfInView($, rules)
}

/**
 * Times the first Question from now when the Sage's pane is up and showing
 * it: one that arrives while the Player looks at the dialogue box.
 */
async function showIfInView($: EngineInterface, rules: Rules): Promise<void> {
  const panes = await $.ui.panes().catch(() => [])
  if (panes.some(pane => pane.id === SAGE.id && pane.isShown && pane.isPlaced)) {
    await showFirstQuestion($, rules)
  }
}

/** Records that the Player has the Question Queue's first Question in front of them. */
async function showFirstQuestion($: EngineInterface, rules: Rules): Promise<void> {
  const current = await read($, game)
  const first = current?.questions[0]
  if (current === null || current.lastAnswer !== null || first === undefined) {
    return
  }

  await play($, { type: 'QUESTION_SHOWN', id: first.id, at: await $.clock.now() }, rules)
}

/** Answers Question `id` with option `choice`, now, under the Player's rules. */
async function answer($: EngineInterface, id: string, choice: number, rules: Rules): Promise<void> {
  await play($, { type: 'QUESTION_ANSWERED', id, choice, at: await $.clock.now() }, rules)
}

/** What the dialogue box's buttons do. */
const sageActions = ($: EngineInterface, rules: Rules): SageActions => ({
  answer: (id, choice) => {
    void answer($, id, choice, rules)
  },
  dismiss: () => {
    void play($, { type: 'ANSWER_DISMISSED' }, rules).then(() => showFirstQuestion($, rules))
  },
})

/**
 * The diff the Boss Fight reviews: the commit's own, from `git show` where
 * the commit ran; the Quest's changes when git cannot give it (not a repo,
 * git missing, the sha gone, no text change).
 */
async function bossFightDiff(
  $: EngineInterface,
  { sha, cwd, changes }: Extract<Effect, { type: 'BOSS_FIGHT_SUMMONED' }>,
): Promise<FileChange[]> {
  const shown = await $.process
    .run(['git', 'show', '--format=', '--no-color', '--no-ext-diff', sha], cwd === null ? undefined : { cwd })
    .catch(() => null)
  const committed = shown?.exitCode === 0 ? changesOfGitShow(shown.stdout) : []

  return committed.length > 0 ? committed : changes
}

/**
 * Makes the Boss Fight's review Questions from its diff and starts the fight.
 * Each Haiku call asks for the Questions still missing, while the Boss
 * Fight's budget lasts; whatever Questions it has then (one to three) make
 * the fight. With none (no diff, Haiku failed, no budget) the Quest closes
 * unfought. Started unawaited after the commit's tool call has returned.
 */
async function summonBossFight(
  $: EngineInterface,
  summoned: Extract<Effect, { type: 'BOSS_FIGHT_SUMMONED' }>,
  rules: Rules,
): Promise<void> {
  const changes = await bossFightDiff($, summoned)
  let ticket: string | null | undefined
  const questions: QuestionContent[] = []
  let reason = changes.length === 0 ? 'no diff to review' : 'its budget is spent'

  while (changes.length > 0 && questions.length < REVIEW_QUESTION_COUNT) {
    // Skipped, or its Quest replaced, meanwhile: another Quest's budget is
    // not this Boss Fight's to spend.
    const fight = (await read($, game))?.bossFight
    if (fight?.status !== 'summoned' || fight.ticket !== summoned.ticket) {
      return
    }
    if (!(await spendHaikuCall($, 'boss', rules))) {
      break
    }
    ticket ??= await activeTicket($)
    const generated = await generateReviewQuestions(
      { changes, ticket, avoid: questions.map(question => question.prompt) },
      haikuModel($),
    )
    if (generated.ok) {
      questions.push(...generated.questions.slice(0, REVIEW_QUESTION_COUNT - questions.length))
    } else {
      reason = `${generated.reason}: ${generated.detail}`
      $.ui.log(`The boss skipped its Questions (${reason})`, { to: 'debug' })
    }
  }

  await play(
    $,
    questions.length > 0
      ? { type: 'BOSS_FIGHT_READY', ticket: summoned.ticket, questions, at: await $.clock.now() }
      : { type: 'BOSS_FIGHT_UNAVAILABLE', ticket: summoned.ticket, reason },
    rules,
  )
}

/** What the boss's dialogue box's buttons do. */
const bossActions = ($: EngineInterface, rules: Rules): BossActions => ({
  answer: (id, choice) => {
    void $.clock.now().then(at => play($, { type: 'BOSS_ANSWERED', id, choice, at }, rules))
  },
  skip: () => {
    void play($, { type: 'BOSS_FIGHT_SKIPPED' }, rules)
  },
})

/**
 * Opens the Scene, unasked, when one of `surfaces` draws its art, at most once
 * per session, and only with the `autoOpenScene` setting on. In the terminal
 * alone it waits for /scene: the HUD already tells the Encounter.
 */
async function openSceneForArt(
  $: EngineInterface,
  surfaces: readonly RenderSurface[],
  autoOpen: boolean,
): Promise<void> {
  if (!autoOpen || !surfaces.some(surface => surface !== 'terminal')) {
    return
  }

  // Taken in one update, so a start and an attach at once open it once.
  let wasOpened = true
  await update($, sceneOpened, opened => {
    wasOpened = opened
    return true
  })
  if (!wasOpened) {
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

/**
 * Steps the session's game by one event under the Player's rules (the mod's
 * settings), in one update, and returns the effects.
 */
async function stepGame($: EngineInterface, event: GameEvent, rules: Rules): Promise<Effect[]> {
  // Before session.start has set the game up, start from the kept Player,
  // never a new one that would overwrite it.
  const before = (await read($, game)) ?? newGame(await loadPlayer($))
  let effects: Effect[] = []
  await update($, game, current => {
    const stepped = step(current ?? before, event, rules)
    effects = stepped.effects

    return stepped.state
  })

  return effects
}

/**
 * A Quest's difficulty, as the Quest Board last listed its ticket: Unrated
 * when the board never listed it, so the Quest reward is never lost to it.
 */
async function listedDifficulty($: EngineInterface, ticket: string): Promise<Difficulty> {
  const { listing } = await read($, board)
  const card = listing.state === 'listed' ? listing.quests.find(quest => quest.ticket === ticket) : undefined

  return card?.difficulty ?? 'Unrated'
}

/** What a full XP pool's toast says: the Sage still pays (or, once hers is full, the boss). */
const cappedText = (pool: XpPool, inQuest: boolean): string => {
  const scope = inQuest ? 'this Quest' : 'this session, outside a Quest'
  switch (pool) {
    case 'ambient':
      return `Exploration and Crafting XP is full for ${scope}. The Sage's Questions still pay: /sage`
    case 'battle':
      return `Battle XP is full for ${scope}. The Sage's Questions still pay: /sage`
    case 'sage':
      return `The Sage's XP is full for ${scope}. ${inQuest ? 'The Boss Fight still pays.' : 'Start a Quest for more: /quest-board'}`
  }
}

/** Steps the session's game by one event, keeps the Player, plays the effects. */
async function play($: EngineInterface, event: GameEvent, rules: Rules): Promise<void> {
  const effects = await stepGame($, event, rules)

  const saved = await read($, game)
  if (saved !== null) {
    await savePlayer($, saved.player)
  }

  // The session's whole list goes to the Player's for this project, not
  // awaited: a write never holds up the tool call that made the discovery.
  // One that fails leaves the discovery to this session, until the next
  // writes it.
  if (saved !== null && effects.some(effect => effect.type === 'MODULE_DISCOVERED')) {
    void $.session
      .root()
      .then(root => recordModulesDiscovered($, root, saved.visitedModules))
      .catch(() => undefined)
  }

  for (const effect of effects) {
    if (effect.type === 'LEVEL_UP') {
      $.ui.toast(`Level up! You are now level ${effect.level}, fully healed.`)
    }
    if (effect.type === 'COMPACTION_WARNING') {
      $.ui.toast(
        `Mana at ${effect.mana}%: the context will compact soon. Wrap up or start a fresh session.`,
      )
    }
    if (effect.type === 'CODE_CHANGED') {
      // Never awaited: the tool call that changed the code returns at once.
      void askSage($, effect.changes, rules).catch(() => undefined)
    }
    if (effect.type === 'QUESTION_QUEUED') {
      $.ui.toast('The Sage has a Question for you: /sage')
    }
    if (effect.type === 'BATTLE_WON') {
      const xp = effects.find(gained => gained.type === 'XP_GAINED' && gained.stat === 'strength')
      $.ui.toast(
        `Battle won! ${effect.check} is all green${xp?.type === 'XP_GAINED' ? `: +${xp.amount} XP (Strength)` : ''}`,
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
    if (effect.type === 'BOSS_FIGHT_SUMMONED') {
      $.ui.toast(`A boss approaches Quest ${effect.ticket}: the commit summoned the Boss Fight.`)
      // Never awaited: the commit's tool call returns at once.
      void summonBossFight($, effect, rules).catch(() => undefined)
    }
    if (effect.type === 'BOSS_FIGHT_STARTED') {
      $.ui.toast(`The boss of Quest ${effect.ticket} bars the way: ${effect.hp} review Questions. /boss`)
    }
    if (effect.type === 'BADGE_EARNED') {
      $.ui.toast(`Badge earned: ${effect.badge.name} · /badges`)
    }
    if (effect.type === 'TROPHY_EARNED') {
      $.ui.toast(`Trophy won: ${effect.trophy.name}`)
    }
    if (effect.type === 'XP_CAPPED') {
      $.ui.toast(cappedText(effect.pool, saved?.quest != null))
    }
    // A level-up heals fully: its own toast says so.
    if (effect.type === 'HP_HEALED' && saved !== null && !effects.some(each => each.type === 'LEVEL_UP')) {
      $.ui.toast(`Healed +${effect.amount} HP: ${saved.player.hp}/${saved.player.maxHp}`)
    }
    if (effect.type === 'QUEST_CLOSED') {
      const fight = saved?.bossFight
      if (fight != null) {
        $.ui.toast(bossOutcomeText(fight))
      }
      await recordQuestClosed($, effect.ticket, effect.outcome)
    }
  }
}

/** Plays a reading of the session's vitals, with the model it runs on. */
async function measure($: EngineInterface, usage: MeasureSeen, rules: Rules): Promise<void> {
  await play($, translateMeasure(usage, await $.session.model()), rules)
}

export const register: Register = (on, options) => {
  // The Player's settings, from /config: a change there reloads the mod, and
  // register runs again with the new values.
  const rules = rulesOf(options)
  const autoOpenScene = autoOpenSceneOf(options)

  on('session.start', async ($, e, next) => {
    // After a reload of the mod the session's game is still in $.state; one
    // kept by an older version of the mod gains the fields it lacks.
    // A Player kept by an older mod is migrated (ADR 0002): a level the new
    // curve changes is told once, as the migrated Player is kept.
    const kept = await read($, game)
    const loaded = kept === null ? await loadPlayerMigrated($) : migratePlayer(kept.player)
    const { player } = loaded
    // Kept migrated, so the next load migrates nothing and tells nothing.
    if (kept !== null) {
      await savePlayer($, player)
    }
    if (loaded.levelChange !== null) {
      $.ui.toast(
        `Claude Quest's levels were rebalanced: you are level ${loaded.levelChange.to} (was ${loaded.levelChange.from}), your XP kept.`,
      )
    }
    const root = await $.session.root().catch(() => null)
    const regionName = root === null ? null : (root.split(/[\\/]/).filter(Boolean).pop() ?? null)
    // The modules the Player explored in this project in earlier sessions
    // are no first visit (seeded once from an older mod's Region file).
    const discovered = root === null ? [] : await loadDiscovered($, root).catch(() => [])
    await update($, game, current => {
      const resumed = { ...newGame(player), ...current }

      return {
        ...resumed,
        player,
        region: regionName,
        // A game kept by an older mod may hold deeper folders: each is the
        // Module it is in now.
        visitedModules: [
          ...new Set([...discovered, ...resumed.visitedModules.map(moduleOfFolder).filter(module => module !== null)]),
        ],
      }
    })

    // The commands are a convenience: the game plays without them.
    await $.command
      .register({ name: 'quest-board', description: 'Open the Quest Board: this Region\'s open Quests' })
      .catch(() => undefined)
    await $.command
      .register({ name: 'scene', description: 'Open the Scene: the current Encounter, played' })
      .catch(() => undefined)
    await $.command
      .register({
        name: 'sage',
        description: 'Answer the Sage\'s Questions; /sage A-D answers the first one',
      })
      .catch(() => undefined)
    await $.command
      .register({ name: 'badges', description: 'Your Badges, trophies, title and Stats' })
      .catch(() => undefined)
    await $.command
      .register({
        name: 'boss',
        description: 'Fight the Quest\'s Boss Fight; /boss A-D answers, /boss skip skips it',
      })
      .catch(() => undefined)

    await openSceneForArt($, await $.session.surfaces().catch(() => []), autoOpenScene)

    // A Boss Fight summoned before a reload of the mod may have lost the
    // unawaited work making its Questions: it is made again. Should that work
    // still run, the first to finish starts the fight and the other's
    // Questions start nothing; the budget bounds the calls either way.
    const resumed = await read($, game)
    if (resumed?.bossFight?.status === 'summoned' && resumed.quest?.ticket === resumed.bossFight.ticket) {
      const { ticket, sha, cwd } = resumed.bossFight
      void summonBossFight(
        $,
        { type: 'BOSS_FIGHT_SUMMONED', ticket, sha, cwd: cwd ?? null, changes: resumed.quest.changes ?? [] },
        rules,
      ).catch(() => undefined)
    }

    const started = await next(e)

    // Vitals read from the start, not only after the first turn; a failed
    // reading leaves them blank until the next measurement.
    const usage = await $.session.usage().catch(() => null)
    if (usage !== null) {
      await measure($, usage, rules)
    }

    return started
  })

  on('tool.call', async ($, e, next) => {
    const outcome = await next(e)
    // Without the root, the read still explores, but discovers no Module.
    const root = await $.session.root().catch(() => null)
    const event = translateToolCall(e, outcome, root)

    if (event !== null) {
      await play($, event, rules)
    }

    // A Bash call may run a check and commit too (`npm test && git commit`).
    const commit = translateCommit(e, outcome)
    if (commit !== null) {
      await play($, commit, rules)
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

  // /sage opens the dialogue box and tells the first Question as text, for
  // the terminal; /sage A to D answers it.
  on('command.run', { command: 'sage' }, async ($, e) => {
    const choice = e.args.trim() === '' ? undefined : choiceOf(e.args)
    const current = await read($, game)
    const first = current?.questions[0]

    if (e.args.trim() !== '' && choice === undefined) {
      return { text: 'Answer with /sage A, B, C or D.' }
    }

    if (first === undefined) {
      await $.ui.open(SAGE).catch(() => undefined)

      return { text: NO_QUESTION }
    }

    if (choice !== undefined) {
      await answer($, first.id, choice, rules)
      const answered = (await read($, game))?.lastAnswer

      return { text: answered == null ? 'The Sage did not hear that answer.' : answerText(answered) }
    }

    // An explanation still showing is put away: the Player asked for a Question.
    if (current?.lastAnswer != null) {
      await play($, { type: 'ANSWER_DISMISSED' }, rules)
    }
    await $.ui.open(SAGE).catch(() => undefined)
    await showFirstQuestion($, rules)

    return { text: questionText(first, current?.questions.length ?? 1) }
  })

  // /boss opens the boss's dialogue box and tells its Question as text, for
  // the terminal; /boss A to D answers it, /boss skip skips the fight.
  on('command.run', { command: 'boss' }, async ($, e) => {
    const args = e.args.trim()
    const fight = (await read($, game))?.bossFight ?? null
    await $.ui.open(BOSS).catch(() => undefined)

    if (!isUnderWay(fight)) {
      return { text: fight === null ? NO_BOSS : `${NO_BOSS} ${bossOutcomeText(fight)}` }
    }

    if (args.toLowerCase() === 'skip') {
      await play($, { type: 'BOSS_FIGHT_SKIPPED' }, rules)
      const skipped = (await read($, game))?.bossFight

      return { text: skipped == null ? NO_BOSS : bossOutcomeText(skipped) }
    }

    const choice = args === '' ? undefined : choiceOf(args)
    if (args !== '' && choice === undefined) {
      return { text: 'Answer with /boss A, B, C or D, or skip it with /boss skip.' }
    }

    const first = fight.questions[0]
    if (choice === undefined || first === undefined) {
      return { text: fight.status === 'fighting' ? bossQuestionText(fight) : bossOutcomeText(fight) }
    }

    await play($, { type: 'BOSS_ANSWERED', id: first.id, choice, at: await $.clock.now() }, rules)
    const answered = (await read($, game))?.bossFight

    return { text: answered == null ? 'The boss did not hear that answer.' : bossAnswerText(answered) }
  })

  on('command.run', { command: 'badges' }, async $ => {
    const player = (await read($, game))?.player ?? (await loadPlayer($))

    return { text: badgesText(player) }
  })

  on('session.attach', async ($, e, next) => {
    const attached = await next(e)
    await openSceneForArt($, [e.surface], autoOpenScene)

    return attached
  })

  on('command.run', async ($, e, next) => {
    // The Quest starts before the command runs: `next(e)` may not resolve
    // until the run is under way, and its Encounters belong to the Quest.
    const event = translateCommand(e)

    if (event !== null) {
      await play(
        $,
        event.type === 'QUEST_START' ? { ...event, difficulty: await listedDifficulty($, event.ticket) } : event,
        rules,
      )
    }

    return next(e)
  })
    // The game never blocks a command: on a failure it runs as typed.
    .catch(($, e, next) => next(e))

  on('session.measure', async ($, e, next) => {
    await measure($, e, rules)

    return next(e)
  })
    // Vitals are a reading: a failed one leaves the last on the HUD.
    .catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: QUEST_BOARD.id }, async ($, e) =>
    drawQuestBoard($, e, await read($, board), boardActions($)),
  )

  // The Scene draws what the game already holds: it never runs in a tool
  // call, so it never slows one.
  on('ui.render', { component: 'Pane', requestId: SCENE.id }, async ($, e) => {
    const current = await read($, game)

    return drawScene($, e, current?.encounter ?? null, current?.bossFight ?? null)
  })

  on('ui.render', { component: 'Pane', requestId: SAGE.id }, async ($, e) => {
    const current = await read($, game)

    return drawSage(
      $,
      e,
      { questions: current?.questions ?? [], lastAnswer: current?.lastAnswer ?? null },
      sageActions($, rules),
    )
  })

  on('ui.render', { component: 'Pane', requestId: BOSS.id }, async ($, e) =>
    drawBoss($, e, (await read($, game))?.bossFight ?? null, bossActions($, rules)),
  )

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, game)

    if (e.props.hasSurvey || current === null) {
      return next(e)
    }

    return drawHud($, e, current)
  })
}
