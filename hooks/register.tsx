import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderSurface } from 'claude-code'

import { bossAnswerText, bossOutcomeText, bossQuestionText, bossStartText, drawBoss, NO_BOSS } from '../src/boss'
import type { BossActions } from '../src/boss'
import { briefingKeyOf, briefingLine, generateBriefing } from '../src/briefing'
import {
  changesOfGitShow,
  generateQuestion,
  generateReviewQuestions,
  QUESTION_MODEL,
  REVIEW_QUESTION_COUNT,
} from '../src/content-generator'
import type { Model, ModelFailure, QuestionInput, TicketContext } from '../src/content-generator'
import { isExhausted, isUnderWay, newGame, step, summonedChanges } from '../src/engine'
import type { Effect, FileChange, GameEvent, GameState, HaikuPurpose, Npc, QuestionContent, Rules } from '../src/engine'
import { badgesText, drawHud } from '../src/hud'
import {
  loadDiscovered,
  loadPlayer,
  loadPlayerMigrated,
  migratePlayer,
  pruneStaleQuests,
  readRegionFile,
  recordModulesDiscovered,
  recordQuestAbandoned,
  recordQuestClosed,
  recordQuestStarted,
  savePlayer,
} from '../src/persistence'
import { drawQuestBoard, implementCommandOf, isImplementDraft, noFilters, PREFERRED_IMPLEMENT } from '../src/quest-board'
import type { QuestBoardActions } from '../src/quest-board'
import { cachedQuestion, cacheKeyOf, remember } from '../src/question-cache'
import type { QuestionCache } from '../src/question-cache'
import { resolveQuestSource } from '../src/quest-source-setting'
import type { ResolvedQuestSource } from '../src/quest-source-setting'
import { answerText, choiceOf, drawSage, NO_QUESTION, NPC_NAMES, questionText } from '../src/sage'
import type { SageActions } from '../src/sage'
import { drawScene } from '../src/scene'
import { autoOpenSceneOf, hudStyleOf, rulesOf } from '../src/settings'
import { moduleOfFolder, translateCommand, translateCommit, translateMeasure, translateToolCall } from '../src/translate'
import type { MeasureSeen } from '../src/translate'
import type { QuestBoard, QuestCard, QuestSourceSetting, XpPool } from '../types'

/** The session's game, which the HUD draws from; it survives a reload. */
const game = atom({ plugin: 'quest-mod', key: 'game' } as const, null)

/**
 * The Quest Board: the Quests last listed, the Player's filters, the card
 * unrolled and the page shown (absent in a board kept by an older mod, which
 * the board draws as every card rolled, on the first page).
 */
const board = atom({ plugin: 'quest-mod', key: 'board' } as const, {
  listing: { state: 'loading' },
  filters: noFilters(),
  selected: null,
  page: 0,
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
 * The API errors that say Haiku cannot be used on this account at all: its
 * credentials refused, the organization or account not allowed, the model
 * not found. Any of them stops Questions for the session.
 */
const UNAVAILABLE_ERRORS = new Set([
  'authentication_failed',
  'oauth_org_not_allowed',
  'account_on_hold',
  'billing_error',
  'model_not_found',
  'cloud_credential_error',
])

/** The HTTP statuses that say the same: unauthorised, forbidden, not found. */
const UNAVAILABLE_STATUSES = new Set([401, 403, 404])

/** The HTTP statuses of a passing failure: rate limited, overloaded. */
const TRANSIENT_STATUSES = new Set([429, 529])

/**
 * Haiku through the session's own client and credentials (`$.model.complete`):
 * no tools, no history, text back. Low effort keeps a Question cheap and quick;
 * the token cap leaves room for its thinking and the JSON; the time limit
 * keeps a stuck call from hanging on for the rest of the session. A request
 * Claude Code refuses to send (the model blocked or unknown), or an API error
 * of auth, access or a missing model, is `unavailable`; a rate limit, an
 * overload or no response at all (status null) is `transient`.
 */
const haikuModel =
  ($: EngineInterface): Model =>
  async ({ system, prompt }) => {
    let reply: Awaited<ReturnType<EngineInterface['model']['complete']>>
    try {
      reply = await $.model.complete({
        model: QUESTION_MODEL,
        system,
        prompt,
        maxTokens: 4096,
        effort: 'low',
        timeoutMs: 60_000,
      })
    } catch (error) {
      return { ok: false, reason: `refused: ${String(error)}`, failure: 'unavailable' }
    }

    if (reply.isAnswered) {
      return { ok: true, text: reply.text }
    }
    if (reply.reason !== 'api-error') {
      return { ok: false, reason: reply.reason }
    }

    const { status, error } = reply
    const failure: ModelFailure | undefined =
      UNAVAILABLE_ERRORS.has(error) || (status !== null && UNAVAILABLE_STATUSES.has(status))
        ? 'unavailable'
        : status === null || TRANSIENT_STATUSES.has(status)
          ? 'transient'
          : undefined

    return { ok: false, reason: `api-error ${status ?? 'no response'} ${error}`, ...(failure === undefined ? {} : { failure }) }
  }

/**
 * The active Quest's ticket as Haiku is shown it: its reference, and the
 * title and summary the Quest holds (QUEST_DETAILS); null between Quests.
 */
async function activeTicket($: EngineInterface): Promise<TicketContext | null> {
  const quest = (await read($, game))?.quest
  if (quest == null) {
    return null
  }

  return {
    ref: quest.ticket,
    ...(quest.title === undefined ? {} : { title: quest.title }),
    ...(quest.summary === undefined ? {} : { summary: quest.summary }),
  }
}

/** A Haiku call the Game Engine granted, and the ticket whose budget it counts on. */
type Granted = { ticket: string | null }

/**
 * Asks the Game Engine for one Haiku call for `purpose`, against the active
 * Quest's ticket's budget (the session's allowance between Quests): the
 * grant when given, and counted; null when the budget is spent, logged to the
 * debug log alone, or when Haiku is unavailable this session.
 * The Boss Fight asks with `'boss'` before each of its calls, while its
 * Quest is still active: outside a Quest the Boss Fight has no budget.
 */
async function spendHaikuCall(
  $: EngineInterface,
  purpose: HaikuPurpose,
  rules: Rules,
  key?: string,
): Promise<Granted | null> {
  // It changes no Player and plays nothing, so the game is only stepped.
  const { effects, state } = await stepGameTo(
    $,
    key === undefined ? { type: 'HAIKU_CALL_REQUESTED', purpose } : { type: 'HAIKU_CALL_REQUESTED', purpose, key },
    rules,
  )
  const refused = effects.find(effect => effect.type === 'HAIKU_CALL_REFUSED')
  if (refused?.type === 'HAIKU_CALL_REFUSED' && refused.reason === undefined) {
    $.ui.log(
      `No Haiku call for the ${purpose === 'sage' ? 'Sage' : 'Boss Fight'}: its budget is spent (${refused.used} of ${refused.limit}).`,
      { to: 'debug' },
    )
  }
  if (refused?.type === 'HAIKU_CALL_REFUSED' && refused.reason === 'asked') {
    $.ui.log('The Sage skipped a Question (already asked).', { to: 'debug' })
  }
  if (!effects.some(effect => effect.type === 'HAIKU_CALL_GRANTED')) {
    return null
  }

  // The ticket the call was counted on, from the very step that counted it.
  return { ticket: state.quest?.ticket ?? null }
}

/**
 * What a failed Haiku call means for the session: Haiku unavailable stops
 * every later call (told once); a passing failure gives the call back to
 * the budget it was counted on. Any other failure keeps the call spent.
 */
async function noteModelFailure(
  $: EngineInterface,
  purpose: HaikuPurpose,
  granted: Granted,
  failure: ModelFailure | undefined,
  rules: Rules,
): Promise<void> {
  if (failure === 'unavailable') {
    await play($, { type: 'HAIKU_UNAVAILABLE' }, rules)
  }
  if (failure === 'transient') {
    await stepGame($, { type: 'HAIKU_CALL_REFUNDED', purpose, ticket: granted.ticket }, rules)
  }
}

/**
 * The Sage's Questions being made, by their change's cache key: an identical
 * change arriving meanwhile waits on the one call rather than making its own.
 * The module's own, so a reload of the mod forgets it, as it does the calls.
 */
const sageInFlight = new Map<string, Promise<void>>()

/**
 * The Sage's one Question about a code-changing Encounter's change: from the
 * cache when the same change was asked about before, at no cost; else, while
 * the budget lasts, Haiku makes it and the Content Generator checks it. It
 * joins the Question Queue. Started unawaited after the tool call has
 * returned, so the session never waits on it; a Question that could not be
 * made, or was over budget, is skipped, logged to the debug log alone. A
 * change already answered this session, or whose Question waits or is being
 * made, asks nothing.
 */
async function askSage($: EngineInterface, changes: FileChange[], rules: Rules): Promise<void> {
  const key = await cacheKeyOf(changes)
  const making = sageInFlight.get(key)
  if (making !== undefined) {
    return making
  }

  const made = makeSageQuestion($, changes, key, rules).finally(() => sageInFlight.delete(key))
  sageInFlight.set(key, made)

  return made
}

async function makeSageQuestion($: EngineInterface, changes: FileChange[], key: string, rules: Rules): Promise<void> {
  // A hit costs nothing; the Game Engine queues it only when not asked already.
  const cached = cachedQuestion(await read($, questionCache), key)
  if (cached !== undefined) {
    await queueQuestion($, cached, key, rules)
    return
  }

  // A change asked about already (its Question evicted from the cache) is
  // refused by the Game Engine before any budget is spent.
  const granted = await spendHaikuCall($, 'sage', rules, key)
  if (granted === null) {
    return
  }

  const input: QuestionInput = { changes, ticket: await activeTicket($) }
  const generated = await generateQuestion(input, haikuModel($))

  if (!generated.ok) {
    $.ui.log(`The Sage skipped a Question (${generated.reason}): ${generated.detail}`, { to: 'debug' })
    await noteModelFailure($, 'sage', granted, generated.failure, rules)
    return
  }

  await update($, questionCache, cache => remember(cache, key, generated.question))
  await queueQuestion($, generated.question, key, rules)
}

/**
 * Queues a Question `npc` (the Sage unless told) made about what is cached
 * under `key`; the Game Engine queues none for a change already answered
 * this session, or whose Question is waiting. Whether it was queued.
 */
async function queueQuestion(
  $: EngineInterface,
  question: QuestionContent,
  key: string,
  rules: Rules,
  npc: Npc = 'sage',
): Promise<boolean> {
  const effects = await play(
    $,
    { type: 'QUESTION_READY', question, key, at: await $.clock.now(), ...(npc === 'sage' ? {} : { npc }) },
    rules,
  )
  await showIfInView($, rules)

  return effects.some(effect => effect.type === 'QUESTION_QUEUED')
}

/**
 * The Briefings being made, by their cache key: a ticket looked up twice
 * meanwhile waits on the one call. The module's own, as sageInFlight is.
 */
const briefingInFlight = new Map<string, Promise<void>>()

/**
 * The Quest Giver's Briefing of the Quest just started: from the cache when
 * the ticket was briefed before with the same summary, at no cost; else,
 * while the Sage's budget for the ticket lasts, Haiku writes it and its
 * contract is checked. Its text is kept as `briefing:<ticket>` for the Quest
 * Log and the Scene; its Question joins the Question Queue as the Quest
 * Giver's, told in a toast. Started unawaited after the lookup; a Briefing
 * that could not be made, or was over budget, is skipped, logged to the debug
 * log alone. A Quest replaced meanwhile is briefed no more.
 */
async function askBriefing(
  $: EngineInterface,
  wanted: Extract<Effect, { type: 'BRIEFING_WANTED' }>,
  rules: Rules,
): Promise<void> {
  const key = await briefingKeyOf(wanted.ticket, wanted.summary)
  const making = briefingInFlight.get(key)
  if (making !== undefined) {
    return making
  }

  const made = makeBriefing($, wanted, key, rules).finally(() => briefingInFlight.delete(key))
  briefingInFlight.set(key, made)

  return made
}

async function makeBriefing(
  $: EngineInterface,
  { ticket, title, summary }: Extract<Effect, { type: 'BRIEFING_WANTED' }>,
  key: string,
  rules: Rules,
): Promise<void> {
  // Outside its Quest (closed, or replaced meanwhile) nothing is asked.
  const isActive = async () => (await read($, game))?.quest?.ticket === ticket
  if (!(await isActive())) {
    return
  }

  const cached = cachedQuestion(await read($, questionCache), key)
  if (cached !== undefined) {
    const kept = await read($, { plugin: 'quest-mod', key: 'briefing', id: ticket })
    if ((await queueQuestion($, cached, key, rules, 'quest-giver')) && kept !== undefined) {
      $.ui.toast(briefingLine(kept.text))
    }
    return
  }

  const granted = await spendHaikuCall($, 'sage', rules, key)
  if (granted === null) {
    return
  }
  // Counted on another ticket (the Quest replaced as it was asked): given back.
  if (granted.ticket !== ticket) {
    await stepGame($, { type: 'HAIKU_CALL_REFUNDED', purpose: 'sage', ticket: granted.ticket }, rules)
    return
  }

  const generated = await generateBriefing(
    { ref: ticket, summary, ...(title === undefined ? {} : { title }) },
    haikuModel($),
  )
  if (!generated.ok) {
    $.ui.log(`The Quest Giver skipped the Briefing (${generated.reason}): ${generated.detail}`, { to: 'debug' })
    await noteModelFailure($, 'sage', granted, generated.failure, rules)
    return
  }

  // Kept whatever happened meanwhile: the call is spent, and the ticket's
  // next start reuses it. Asked only while its Quest is still the active one.
  await update($, questionCache, cache => remember(cache, key, generated.question))
  await update($, { plugin: 'quest-mod', key: 'briefing', id: ticket }, () => ({ text: generated.briefing }))
  if ((await isActive()) && (await queueQuestion($, generated.question, key, rules, 'quest-giver'))) {
    $.ui.toast(briefingLine(generated.briefing))
  }
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
 * git missing, the sha gone, no text change). A commit read from a failed
 * command's output hands no Quest changes over: its diff is git's or none.
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
  let ticket: TicketContext | null | undefined
  const questions: QuestionContent[] = []
  let reason = changes.length === 0 ? 'no diff to review' : 'its budget is spent'
  let retried = false

  while (changes.length > 0 && questions.length < REVIEW_QUESTION_COUNT) {
    // Skipped, or its Quest replaced, meanwhile: another Quest's budget is
    // not this Boss Fight's to spend.
    const fight = (await read($, game))?.bossFight
    if (fight?.status !== 'summoned' || fight.ticket !== summoned.ticket) {
      return
    }
    const granted = await spendHaikuCall($, 'boss', rules)
    if (granted === null) {
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
      await noteModelFailure($, 'boss', granted, generated.failure, rules)
      // Haiku unavailable ends it. A passing failure, given back to the
      // budget, is tried again once: a second one ends it too, rather
      // than spend and refund for as long as the rate limit lasts.
      if (generated.failure === 'unavailable' || (generated.failure === 'transient' && retried)) {
        break
      }
      retried ||= generated.failure === 'transient'
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

/**
 * A game kept by an older mod counted the Haiku calls on its active Quest
 * (`Quest.haikuCalls`): they become that ticket's, unless it has a count.
 */
const withTicketCalls = (state: GameState): GameState => {
  const { quest } = state
  const older = (quest as { haikuCalls?: { sage?: number; boss?: number } } | null)?.haikuCalls
  if (quest === null || older === undefined || state.haikuCallsByTicket?.[quest.ticket] !== undefined) {
    return state
  }

  return {
    ...state,
    haikuCallsByTicket: { ...state.haikuCallsByTicket, [quest.ticket]: { sage: older.sage ?? 0, boss: older.boss ?? 0 } },
  }
}

/**
 * The Quest Source the Region chose in its Region file; when it chose none,
 * the repo's GitHub Issues, or none when the project is no git repo with a
 * remote. A file that is not JSON may hold a choice gone wrong, so the board
 * says so rather than guess. `$.process` runs only where Claude Code runs
 * commands (the CLI): elsewhere its rejection is told as such by the gh
 * adapter, never as gh missing.
 */
async function regionQuestSource($: EngineInterface): Promise<ResolvedQuestSource> {
  const region = await readRegionFile($).catch(() => ({ ok: true as const, value: undefined }))

  return resolveQuestSource(region, () => $.session.repo(), {
    run: argv => $.process.run(argv),
    call: (server, tool, args) => $.mcp.call(server, tool, args),
  })
}

/** The Quest Source as the Player knows it, for a toast: `GitHub Issues`, `Jira project CPI`. */
const sourceName = (setting: QuestSourceSetting | undefined): string =>
  setting?.kind === 'jira' ? `Jira project ${setting.project}` : 'GitHub Issues'

/** Lists the Region's open Quests again, from its Quest Source. */
async function listQuests($: EngineInterface): Promise<void> {
  await update($, board, (current): QuestBoard => ({ ...current, listing: { state: 'loading' } }))

  const { source, setting } = await regionQuestSource($)
  const listed = await source.list()

  // A card unrolled whose ticket is no longer listed is rolled for good.
  await update($, board, (current): QuestBoard => ({
    ...current,
    ...(listed.ok && !listed.value.some(quest => quest.ticket === current.selected) ? { selected: null } : {}),
    listing: listed.ok
      ? { state: 'listed', quests: listed.value, ...(setting === undefined ? {} : { source: setting }) }
      : { state: 'unavailable', problem: listed.problem },
  }))
}

/**
 * Puts the implement command for `quest` in the prompt box, for the Player
 * to send: whichever implement command the session has (mattpocock-skills'
 * first). A draft the Player is writing is never written over: only an empty
 * one, or one that is itself an implement command, is replaced.
 */
async function pickQuest($: EngineInterface, quest: QuestCard): Promise<void> {
  // Commands that cannot be listed: the usual one is tried.
  const names = await $.command.list().then(
    commands => commands.map(command => command.name),
    () => [PREFERRED_IMPLEMENT],
  )
  const implement = implementCommandOf(names)
  if (implement === undefined) {
    $.ui.toast(
      `No implement command in this session: install one, such as ${PREFERRED_IMPLEMENT}, to start Quests from the board.`,
    )
    return
  }

  const command = `/${implement} ${quest.ticket}`
  const draft = await $.prompt.read().then(box => box.text, () => '')
  if (draft.trim() !== '' && !isImplementDraft(draft)) {
    $.ui.toast(`Draft kept: clear it and pick again, or run ${command}`)
    return
  }

  // Filled, never sent: the Player sends it, and command.run starts the
  // Quest as for one they typed.
  const unfilled = () => $.ui.toast(`Could not fill the prompt: run ${command} yourself.`)
  await $.prompt
    .fill({ text: command })
    .then(filled => (filled.isFilled ? undefined : unfilled()), unfilled)
}

/** What the Quest Board's buttons do. */
const boardActions = ($: EngineInterface): QuestBoardActions => ({
  pick: quest => {
    void pickQuest($, quest).catch(() => undefined)
  },
  // A filter changed shows its first page.
  filterStatus: status => {
    void update($, board, current => ({ ...current, filters: { ...current.filters, status }, page: 0 }))
  },
  filterDifficulty: difficulty => {
    void update($, board, current => ({
      ...current,
      filters: { ...current.filters, difficulty },
      page: 0,
    }))
  },
  refresh: () => {
    void listQuests($)
  },
  select: ticket => {
    void update($, board, current => ({ ...current, selected: ticket }))
  },
  page: page => {
    void update($, board, current => ({ ...current, page }))
  },
})

/**
 * Looks the active Quest's ticket up in the Region's Quest Source, after it
 * started: its title, description and difficulty (taken only by a Quest
 * started Unrated), and whether the source has it. Started unawaited, so the
 * command never waits on gh or MCP. A ticket the source has not got, and the
 * board never listed, runs Unrated for no Quest reward, told in a toast; a
 * source that cannot be reached is logged to the debug log alone, and the
 * Quest rewarded as before.
 */
async function lookUpTicket($: EngineInterface, ticket: string, listed: boolean, rules: Rules): Promise<void> {
  const { source, setting } = await regionQuestSource($)
  const got = await source.get(ticket)

  if (!got.ok) {
    $.ui.log(`Could not look ${ticket} up in its Quest Source: ${got.problem.message}`, { to: 'debug' })
    if (!listed) {
      await play($, { type: 'QUEST_DETAILS', ticket, verified: 'unknown' }, rules)
    }
    return
  }

  if (got.value === null) {
    // Listed by the board, the ticket is there: the lookup's reference missed it.
    if (listed) {
      await play($, { type: 'QUEST_DETAILS', ticket, verified: 'found' }, rules)
      return
    }
    await play($, { type: 'QUEST_DETAILS', ticket, verified: 'not-found' }, rules)
    if ((await read($, game))?.quest?.ticket === ticket) {
      $.ui.toast(`No ticket ${ticket} in ${sourceName(setting)}: the Quest runs Unrated and pays no Quest reward`)
    }
    return
  }

  const { title, summary, difficulty } = got.value
  await play(
    $,
    { type: 'QUEST_DETAILS', ticket, title, difficulty, verified: 'found', ...(summary === undefined ? {} : { summary }) },
    rules,
  )
}

/**
 * Steps the session's game by one event under the Player's rules (the mod's
 * settings), in one update, and returns the effects.
 */
async function stepGame($: EngineInterface, event: GameEvent, rules: Rules): Promise<Effect[]> {
  return (await stepGameTo($, event, rules)).effects
}

/** Steps the session's game as stepGame does, and returns the game it stepped to as well. */
async function stepGameTo(
  $: EngineInterface,
  event: GameEvent,
  rules: Rules,
): Promise<{ effects: Effect[]; state: GameState }> {
  // Before session.start has set the game up, start from the kept Player,
  // never a new one that would overwrite it.
  const before = (await read($, game)) ?? newGame(await loadPlayer($))
  let stepped = { effects: [] as Effect[], state: before }
  await update($, game, current => {
    stepped = step(current ?? before, event, rules)

    return stepped.state
  })

  return stepped
}

/** The Quest Board's card for `ticket`, as last listed; undefined when the board never listed it. */
async function listedCard($: EngineInterface, ticket: string): Promise<QuestCard | undefined> {
  const { listing } = await read($, board)

  return listing.state === 'listed' ? listing.quests.find(quest => quest.ticket === ticket) : undefined
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

/** What the session is told, once, when Haiku turns out unavailable. */
const HAIKU_UNAVAILABLE_TEXT = "Questions are off: Haiku isn't available on this account"

/** Steps the session's game by one event, keeps the Player, plays the effects, and returns them. */
async function play($: EngineInterface, event: GameEvent, rules: Rules): Promise<Effect[]> {
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
    if (effect.type === 'HAIKU_UNAVAILABLE') {
      $.ui.toast(HAIKU_UNAVAILABLE_TEXT)
    }
    // The Quest Giver's Question is told by the Briefing's own toast.
    if (effect.type === 'QUESTION_QUEUED' && effect.npc === undefined) {
      $.ui.toast('The Sage has a Question for you: /sage')
    }
    if (effect.type === 'QUESTION_QUEUED' && effect.npc === 'cartographer') {
      $.ui.toast(`${NPC_NAMES.cartographer} has a Question for you: /sage`)
    }
    if (effect.type === 'BRIEFING_WANTED') {
      // Never awaited: the lookup that found the ticket returns at once.
      void askBriefing($, effect, rules).catch(() => undefined)
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
      $.ui.toast(`The boss of Quest ${effect.ticket} bars the way: ${bossStartText(effect)}. /boss`)
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
        $.ui.toast(`${bossOutcomeText(fight)} /quest-board for your next Quest`)
      }
      await recordQuestClosed($, effect.ticket, effect.outcome)
    }
  }

  return effects
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
  const hudStyle = hudStyleOf(options)

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
    // Quests earlier sessions left active for over a week were abandoned.
    if (root !== null) {
      await pruneStaleQuests($).catch(() => undefined)
    }
    await update($, game, current => {
      const resumed = withTicketCalls({ ...newGame(player), ...current })

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
        { type: 'BOSS_FIGHT_SUMMONED', ticket, sha, cwd: cwd ?? null, changes: summonedChanges(resumed.quest, resumed.bossFight) },
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

    // A letter for a Question the Player was never shown is no answer: it
    // could not have been read. It is shown instead, and its time starts.
    if (choice !== undefined && first.shownAt === null) {
      if (current?.lastAnswer != null) {
        await play($, { type: 'ANSWER_DISMISSED' }, rules)
      }
      await $.ui.open(SAGE).catch(() => undefined)
      await showFirstQuestion($, rules)

      return { text: `Read it first: no answer was taken.\n${questionText(first, current?.questions.length ?? 1)}` }
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
    const current = await read($, game)
    const fight = current?.bossFight ?? null
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
    const exhausted = isExhausted(current?.player ?? (await loadPlayer($)))
    if (choice === undefined || first === undefined) {
      return { text: fight.status === 'fighting' ? bossQuestionText(fight, exhausted) : bossOutcomeText(fight) }
    }

    await play($, { type: 'BOSS_ANSWERED', id: first.id, choice, at: await $.clock.now() }, rules)
    const after = await read($, game)
    const answered = after?.bossFight

    return {
      text:
        answered == null
          ? 'The boss did not hear that answer.'
          : bossAnswerText(answered, after !== null && isExhausted(after.player)),
    }
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

    if (event?.type === 'QUEST_START') {
      // The difficulty is the Quest Board's (Unrated when it never listed
      // the ticket, until its lookup rates it), and so is the title the Sage
      // and the boss show Haiku. Looking the ticket up in its Quest Source
      // for the rest comes after, unawaited (QUEST_DETAILS).
      const { ticket } = event
      const card = await listedCard($, ticket)
      try {
        await play($, { ...event, difficulty: card?.difficulty ?? 'Unrated' }, rules)
      } finally {
        // Kept even when the Region file could not record the start.
        if (card !== undefined) {
          await play($, { type: 'QUEST_DETAILS', ticket, title: card.title }, rules)
        }
        // A Quest whose ticket was looked up (started again) is not again;
        // one whose source could not be reached is tried again.
        const quest = (await read($, game))?.quest
        if (quest?.ticket === ticket && (quest.verified === undefined || quest.verified === 'unknown')) {
          void lookUpTicket($, ticket, card !== undefined, rules).catch(() => undefined)
        }
      }
    } else if (event !== null) {
      await play($, event, rules)
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
    drawQuestBoard($, e, await read($, board), boardActions($), (await read($, game))?.player ?? null),
  )

  // The Scene draws what the game already holds: it never runs in a tool
  // call, so it never slows one.
  on('ui.render', { component: 'Pane', requestId: SCENE.id }, async ($, e) => {
    const current = await read($, game)
    // The Quest Giver's Briefing tells the Scene's line until the Quest's first Encounter.
    const quest = current?.quest ?? null
    const briefing =
      quest !== null && quest.encounters.length === 0
        ? ((await read($, { plugin: 'quest-mod', key: 'briefing', id: quest.ticket }))?.text ?? null)
        : null

    return drawScene($, e, current?.encounter ?? null, current?.bossFight ?? null, briefing)
  })

  on('ui.render', { component: 'Pane', requestId: SAGE.id }, async ($, e) => {
    const current = await read($, game)
    // Drawing a Question puts it in front of the Player: its time starts.
    // A drawing may not write, so it is recorded just after; showing a
    // Question already shown changes nothing.
    if (current !== null && current.lastAnswer === null && current.questions[0]?.shownAt === null) {
      $.clock.after(0, () => {
        void showFirstQuestion($, rules).catch(() => undefined)
      })
    }

    return drawSage(
      $,
      e,
      { questions: current?.questions ?? [], lastAnswer: current?.lastAnswer ?? null },
      sageActions($, rules),
    )
  })

  on('ui.render', { component: 'Pane', requestId: BOSS.id }, async ($, e) => {
    const current = await read($, game)

    return drawBoss($, e, current?.bossFight ?? null, bossActions($, rules), current !== null && isExhausted(current.player))
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, game)

    if (e.props.hasSurvey || current === null) {
      return next(e)
    }

    return drawHud($, e, current, hudStyle)
  })
}
