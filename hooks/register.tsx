import { atom, memberOf, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderInput, RenderSurface } from 'claude-code'

import { translateBashReads } from '../src/bash-reads'
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
import { changesSince, noteChanged, takeSnapshot } from '../src/diff-crafting'
import type { Git, ReadFile, Snapshot } from '../src/diff-crafting'
import { callName, isExhausted, isUnderWay, newGame, PROPHECY_CALLS, questProgressOf, step, summonedChanges } from '../src/engine'
import type { Effect, FileChange, GameEvent, GameState, HaikuPurpose, Npc, ProphecyCall, QuestionContent, Rules } from '../src/engine'
import {
  closeRetiredPanes,
  drawGameScreen,
  drawsArtOn,
  GAME,
  isGameScreenInView,
  openGameScreen,
  readGameScreen,
  showView,
  stageLayoutOf,
  updateGameScreen,
  updatePlace,
} from '../src/game-screen'
import type { GameView } from '../src/game-screen'
import { badgesText, drawHud } from '../src/hud'
import type { HudActions } from '../src/hud'
import {
  loadCharted,
  loadDiscovered,
  loadPlayer,
  loadPlayerMigrated,
  migratePlayer,
  pruneStaleQuests,
  readRegionFile,
  recordModulesCharted,
  recordModulesDiscovered,
  recordsOf,
  recordQuestAbandoned,
  recordQuestClosed,
  recordQuestStarted,
  savePlayer,
} from '../src/persistence'
import { drawOverview, emptyOverview } from '../src/overview'
import type { OverviewActions, OverviewState } from '../src/overview'
import { backText, comeBack, emptyParty, setOut, stillOut, tally } from '../src/party'
import type { Party } from '../src/party'
import { drawQuestBoard, noFilters } from '../src/quest-board'
import type { QuestBoardActions } from '../src/quest-board'
import {
  drawEmptyQuestLog,
  drawQuestHeader,
  drawQuestLog,
  NO_ACTIVE_QUEST,
  NOT_A_TICKET,
  questArgOf,
  scrollExcerptOf,
} from '../src/quest-log'
import type { QuestHeader, QuestLogActions } from '../src/quest-log'
import { cachedQuestion, cacheKeyOf, remember } from '../src/question-cache'
import type { QuestionCache } from '../src/question-cache'
import { regionQuestSource } from '../src/quest-source-setting'
import { openRegionMap, readRegionMapOnce, redrawRegionMap, renderRegionMap } from '../src/region-map'
import { clearedOf, readRegions, recordRegionQuestClosed, themeOf, touchRegion } from '../src/region-registry'
import type { RegionEntry } from '../src/region-registry'
import { answerText, choiceOf, drawSage, NO_QUESTION, NPC_NAMES, questionText } from '../src/sage'
import type { SageActions } from '../src/sage'
import { drawStage, sceneLineOf, sceneOf } from '../src/scene'
import type { SceneState } from '../src/scene'
import {
  cartographerText,
  chartedModulesOf,
  generateScouting,
  MAX_SCOUTING_FILES,
  outlinedFilesOf,
  outlinesOf,
  relativeTo,
  scoutingKeyOf,
} from '../src/scouting'
import type { ScoutingInput } from '../src/scouting'
import { takeQuest } from '../src/take-quest'
import { themeRegion } from '../src/theming'
import type { ThemingDeps } from '../src/theming'
import { autoOpenSceneOf, hudStyleOf, rulesOf, soundVolumeOf } from '../src/settings'
import { playCues, setSoundVolume } from '../src/sounds'
import { moduleOfFolder, testFileEditedOf, translateCheckStart, translateCommand, translateCommit, translateMeasure, translateToolCall } from '../src/translate'
import type { MeasureSeen } from '../src/translate'
import type { GameScreen, QuestBoard, QuestCard, QuestLog, QuestSourceSetting, TicketDetails, TicketFetch, XpPool } from '../types'
import type { Sourced } from '../src/quest-source'

/** The session's game, which the HUD draws from; it survives a reload. */
const game = atom({ plugin: 'quest-mod', key: 'game' } as const, null)

/**
 * The Quest Board: the Quests last listed and the Player's filters. Its
 * place (the page, the Scroll unrolled) is the Game Screen's.
 */
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

/** The Quest Log: the ticket last loaded, and its Region file history read then. */
const questLog = atom({ plugin: 'quest-mod', key: 'questLog' } as const, { ticket: null, history: [] } satisfies QuestLog)

/**
 * A ticket's details as fetched this session (TicketFetch), by its ticket:
 * fetched once per ticket per session by the Quest Log, the Quest Board's
 * Unroll or the ticket lookup, whichever comes first, and read by the others.
 */
const ticketDetails = { plugin: 'quest-mod', key: 'ticketDetails' } as const

/** The Quest Giver's briefing of a ticket (`{ text }`), which the Briefing (#19) writes and the Quest Log shows. */
const briefing = { plugin: 'quest-mod', key: 'briefing' } as const

/** Whether the Game Screen has opened itself this session (the `autoOpenScene` rule): once at most. */
const sceneOpened = atom({ plugin: 'quest-mod', key: 'sceneOpened' } as const, false)

/**
 * The Overview: the registry of Regions as last read (at session start, a
 * Quest's close and /overview), the session's root, the page of Islands.
 */
const overview = atom({ plugin: 'quest-mod', key: 'overview' } as const, emptyOverview() satisfies OverviewState)
/** The party: the companions (subagents) out during a Quest, and the Scene's beat of one setting out. */
const party = atom({ plugin: 'quest-mod', key: 'party' } as const, emptyParty() as Party)

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
  modules?: string[],
): Promise<boolean> {
  const effects = await play(
    $,
    {
      type: 'QUESTION_READY',
      question,
      key,
      at: await $.clock.now(),
      ...(npc === 'sage' ? {} : { npc }),
      ...(modules === undefined ? {} : { modules }),
    },
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

  // The ticket's Dungeon, from its card as fetched this session (else as the board listed it).
  const fetched = await read($, memberOf(ticketDetails, { requestId: ticket }))
  const dungeon = (fetched?.state === 'got' ? fetched.details?.dungeon : undefined) ?? (await listedCard($, ticket))?.dungeon
  const generated = await generateBriefing(
    { ref: ticket, summary, ...(title === undefined ? {} : { title }), ...(dungeon === undefined ? {} : { dungeon: dungeon.name }) },
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

/** The biggest file whose outline a Scouting reads: anything larger is no source file. */
const MAX_OUTLINED_BYTES = 512 * 1024

/**
 * What the Cartographer is shown of a Scouting the Game Engine wants: of the
 * paths read, the files (a searched folder is none), the latest
 * MAX_SCOUTING_FILES, relative to the project's root; and the outlines of a
 * few of them, read with `$.fs.read`. A file that cannot be read is left out.
 */
async function scoutingInputOf(
  $: EngineInterface,
  { modules, files }: Extract<Effect, { type: 'SCOUTING_WANTED' }>,
): Promise<ScoutingInput> {
  const root = await $.session.root().catch(() => null)
  const found: { path: string; size: number }[] = []
  for (const path of files) {
    const stat = await $.fs.stat(path).catch(() => null)
    if (stat?.kind === 'file') {
      found.push({ path, size: stat.size })
    }
  }
  const kept = found.slice(-MAX_SCOUTING_FILES)
  const shown = new Map(kept.map(file => [relativeTo(root, file.path), file]))

  const read: { path: string; text: string }[] = []
  for (const path of outlinedFilesOf([...shown.keys()])) {
    const file = shown.get(path)
    if (file !== undefined && file.size <= MAX_OUTLINED_BYTES) {
      const text = await $.fs.read(file.path).catch(() => null)
      if (typeof text === 'string') {
        read.push({ path, text })
      }
    }
  }

  return { modules, files: [...shown.keys()], outlines: outlinesOf(read) }
}

/**
 * The Scoutings being made, by their cache key: the same Modules read the
 * same way meanwhile wait on the one call. The module's own, as sageInFlight is.
 */
const scoutingInFlight = new Map<string, Promise<void>>()

/**
 * The Cartographer's Scouting of the Modules just discovered: from the cache
 * when the same Modules were outlined the same way before, at no cost; else,
 * while the Sage's budget lasts (the ticket's in a Quest, the session's
 * outside), Haiku makes it and its contract is checked. It joins the
 * Question Queue as the Cartographer's, told in a toast, with the Modules a
 * right answer charts. Started unawaited after the read that discovered the
 * third Module; one that could not be made, or was over budget, is skipped,
 * logged to the debug log alone. No file read in them asks nothing.
 */
async function askScouting(
  $: EngineInterface,
  wanted: Extract<Effect, { type: 'SCOUTING_WANTED' }>,
  rules: Rules,
): Promise<void> {
  const input = await scoutingInputOf($, wanted)
  if (input.files.length === 0) {
    $.ui.log('The Cartographer skipped a Scouting: no file read in the Modules.', { to: 'debug' })
    return
  }

  const key = await scoutingKeyOf(input)
  const making = scoutingInFlight.get(key)
  if (making !== undefined) {
    return making
  }

  const made = makeScouting($, input, key, rules).finally(() => scoutingInFlight.delete(key))
  scoutingInFlight.set(key, made)

  return made
}

async function makeScouting($: EngineInterface, input: ScoutingInput, key: string, rules: Rules): Promise<void> {
  const cached = cachedQuestion(await read($, questionCache), key)
  if (cached !== undefined) {
    await queueQuestion($, cached, key, rules, 'cartographer', input.modules)
    return
  }

  const granted = await spendHaikuCall($, 'sage', rules, key)
  if (granted === null) {
    return
  }

  const generated = await generateScouting(input, haikuModel($))
  if (!generated.ok) {
    $.ui.log(`The Cartographer skipped a Scouting (${generated.reason}): ${generated.detail}`, { to: 'debug' })
    await noteModelFailure($, 'sage', granted, generated.failure, rules)
    return
  }

  await update($, questionCache, cache => remember(cache, key, generated.question))
  await queueQuestion($, generated.question, key, rules, 'cartographer', input.modules)
}

/**
 * Times the first Question from now when the Game Screen is up, its
 * dialogue box showing it: one that arrives while the Player looks.
 */
async function showIfInView($: EngineInterface, rules: Rules): Promise<void> {
  if (await isGameScreenInView($)) {
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

/** What the Overview's buttons do: an Island opens its Region's map, live for the session's own. */
const overviewActions = ($: EngineInterface): OverviewActions => ({
  open: island => {
    void openRegionMap($, island.isHere ? { kind: 'live' } : { kind: 'snapshot', entry: island.entry }).catch(() => undefined)
  },
  page: page => {
    void updatePlace($, 'sheet', () => ({ page }))
  },
})

/**
 * Puts the registry in the Overview's state, with the session's root: as
 * given, or read from the store.
 */
async function showRegions($: EngineInterface, regions?: Record<string, RegionEntry>): Promise<void> {
  const root = await $.session.root().catch(() => null)
  const kept = regions ?? (await readRegions($).catch(() => ({})))
  await update($, overview, (current): OverviewState => ({ ...current, regions: kept, root }))
}

/**
 * What Haiku theming needs of the session (src/theming.ts): Haiku, whether
 * it was found unavailable this session, and the views to draw again once a
 * theme is kept, the Overview and the Region map.
 */
const themingOf = ($: EngineInterface): ThemingDeps => ({
  model: haikuModel($),
  isHaikuUnavailable: async () => (await read($, game))?.haikuUnavailable === true,
  onThemed: async regions => {
    await showRegions($, regions)
    await redrawRegionMap($)
  },
})

/**
 * Opens the Game Screen, unasked, when one of `surfaces` draws its art, at
 * most once per session, and only with the `autoOpenScene` setting on. In
 * the terminal alone it waits for a command: the HUD already tells the
 * Encounter.
 */
async function openGameForArt(
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
    await openGameScreen($).catch(() => undefined)
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

/** The Quest Source as the Player knows it, for a toast: `GitHub Issues`, `Jira project CPI`. */
const sourceName = (setting: QuestSourceSetting | undefined): string =>
  setting?.kind === 'jira' ? `Jira project ${setting.project}` : 'GitHub Issues'

/** Lists the Region's open Quests again, from its Quest Source. */
async function listQuests($: EngineInterface): Promise<void> {
  await update($, board, (current): QuestBoard => ({ ...current, listing: { state: 'loading' } }))

  const { source, setting } = await regionQuestSource($)
  const listed = await source.list()

  await update($, board, (current): QuestBoard => ({
    ...current,
    listing: listed.ok
      ? { state: 'listed', quests: listed.value, ...(setting === undefined ? {} : { source: setting }) }
      : { state: 'unavailable', problem: listed.problem },
  }))
  // A Scroll unrolled whose ticket is no longer listed is rolled for good.
  if (listed.ok) {
    await updatePlace($, 'board', place =>
      listed.value.some(quest => quest.ticket === place.selected) ? place : { ...place, selected: null },
    )
  }
}

/** What the Quest Board's buttons do. */
const boardActions = ($: EngineInterface): QuestBoardActions => ({
  pick: quest => {
    void takeQuest($, quest).catch(() => undefined)
  },
  // A filter changed shows its first page.
  filterStatus: status => {
    void update($, board, current => ({ ...current, filters: { ...current.filters, status } })).then(() =>
      updatePlace($, 'board', place => ({ ...place, page: 0 })),
    )
  },
  filterDifficulty: difficulty => {
    void update($, board, current => ({ ...current, filters: { ...current.filters, difficulty } })).then(() =>
      updatePlace($, 'board', place => ({ ...place, page: 0 })),
    )
  },
  refresh: () => {
    void listQuests($)
  },
  // Unrolled, the card shows the start of its description: fetched now, once.
  select: ticket => {
    void updatePlace($, 'board', place => ({ ...place, selected: ticket }))
    if (ticket !== null) {
      void fetchTicket($, ticket).catch(() => undefined)
    }
  },
  page: page => {
    void updatePlace($, 'board', place => ({ ...place, page }))
  },
  readMore: ticket => {
    void openQuestLog($, ticket).catch(() => undefined)
  },
})

/**
 * Fetches `ticket`'s details from the Region's Quest Source into `$.state`,
 * once per ticket per session: nothing when they are fetched, or being
 * fetched, already; again when the source could not be reached, or when
 * `isForced` (the log's Refresh).
 */
async function fetchTicket($: EngineInterface, ticket: string, isForced = false): Promise<void> {
  let isMine = false
  await update($, memberOf(ticketDetails, { requestId: ticket }), (current): TicketFetch => {
    isMine = isForced || current === undefined || current.state === 'unavailable'

    return isMine ? { state: 'loading' } : (current ?? { state: 'loading' })
  })
  if (!isMine) {
    return
  }

  // Any failure, the Quest Source not even resolved included, is told as
  // unreachable: the ticket never stays `loading` for the session.
  const got = await regionQuestSource($)
    .then(({ source }) => source.get(ticket))
    .catch((error: unknown): Sourced<TicketDetails | null> => ({
      ok: false,
      problem: { kind: 'unreachable', message: String(error) },
    }))
  await keepTicket($, ticket, got)
}

/** Keeps what fetching `ticket` found (its details, or why it could not be reached), for the Quest Log and the Quest Board's Scroll. */
async function keepTicket($: EngineInterface, ticket: string, got: Sourced<TicketDetails | null>): Promise<void> {
  const fetched: TicketFetch = got.ok ? { state: 'got', details: got.value } : { state: 'unavailable', problem: got.problem }
  await update($, memberOf(ticketDetails, { requestId: ticket }), (): TicketFetch => fetched)
}

/**
 * Loads the Quest Log's `ticket`: its Region file history read now, its
 * details fetched (once per session).
 */
async function loadQuestLog($: EngineInterface, ticket: string): Promise<void> {
  const region = await readRegionFile($).catch(() => ({ ok: true as const, value: undefined }))
  const history = region.ok ? recordsOf(region.value, ticket) : []
  await update($, questLog, (): QuestLog => ({ ticket, history }))
  void fetchTicket($, ticket).catch(() => undefined)
}

/**
 * Opens the Game Screen on the Quest Log of `ticket`, loaded now. Only the
 * Player picks a ticket: /quest, the Quest Board's Read more, the Quest Log
 * Button over the Sage's and the boss's dialogue box.
 */
async function openQuestLog($: EngineInterface, ticket: string): Promise<{ isPlaced: boolean }> {
  await updatePlace($, 'log', () => ({ ticket }))
  await loadQuestLog($, ticket)

  return showView($, 'log')
}

/** The ticket the Quest Log shows: the one picked, else the active Quest's; null with neither. */
async function logTicketOf($: EngineInterface): Promise<string | null> {
  return (await readGameScreen($)).log.ticket ?? (await read($, game))?.quest?.ticket ?? null
}

/**
 * Shows `view` on the Game Screen, from its tab row: its place as kept, and
 * what it reads when nothing is read yet (the Board's listing, the map's
 * project, the log's ticket, the World's Regions). It opens nothing.
 */
async function chooseView($: EngineInterface, view: GameView): Promise<void> {
  await updateGameScreen($, current => ({ ...current, view }))
  if (view === 'quests' && (await read($, board)).listing.state === 'loading') {
    await listQuests($)
  }
  if (view === 'map') {
    await readRegionMapOnce($)
  }
  if (view === 'log') {
    const ticket = await logTicketOf($)
    if (ticket !== null && (await read($, questLog)).ticket !== ticket) {
      await loadQuestLog($, ticket)
    }
  }
  if (view === 'sheet') {
    await showRegions($)
  }
}

/** What the Quest Log's buttons do. */
const questLogActions = ($: EngineInterface, ticket: string): QuestLogActions => ({
  // The Quest Board's own Take Quest: the same implement command, the same draft guard.
  take: quest => {
    void takeQuest($, quest).catch(() => undefined)
  },
  refresh: () => {
    void fetchTicket($, ticket, true).catch(() => undefined)
  },
})

/** The Quest header over the Sage's and the boss's dialogue box for `ticket`, its Quest Log a press away. */
const questHeaderOf = ($: EngineInterface, ticket: string, title: string | undefined): QuestHeader => ({
  ticket,
  ...(title === undefined ? {} : { title }),
  openLog: () => {
    void openQuestLog($, ticket).catch(() => undefined)
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
  // The Quest Log (or an unrolled Scroll) may have fetched the ticket this
  // session already: its details are taken rather than asked again. The
  // lookup's own answer is kept for them in turn, description and all.
  const kept = await read($, memberOf(ticketDetails, { requestId: ticket }))
  const got: Awaited<ReturnType<typeof source.get>> =
    kept?.state === 'got' && kept.details !== null ? { ok: true, value: kept.details } : await source.get(ticket)
  await keepTicket($, ticket, got)

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
    case 'prophecy':
      return `Prophecy XP is full for ${scope}. Right calls still count toward the Oracle.`
  }
}

/** What a settled Prophecy's toast says: `Prophecy fulfilled: Red (+10 DEX)`, `Prophecy failed: it was Green`. */
const prophecyText = ({ call, outcome, isRight, xp }: Extract<Effect, { type: 'PROPHECY_SETTLED' }>): string =>
  isRight
    ? `Prophecy fulfilled: ${callName(call)}${xp > 0 ? ` (+${xp} DEX)` : ''}`
    : `Prophecy failed: it was ${callName(outcome)}`

/** What the HUD's Buttons do: a Prophecy's call. */
const hudActions = ($: EngineInterface, rules: Rules): HudActions => ({
  prophesy: call => {
    void play($, { type: 'PROPHECY_MADE', call }, rules)
  },
})

/** How to call a Prophecy from the prompt. */
const PROPHECY_USAGE = 'Call it with /prophecy red, green or rout.'

/** The call `/prophecy <args>` names, in any case; undefined for anything else. */
const prophecyCallOf = (args: string): ProphecyCall | undefined =>
  PROPHECY_CALLS.find(call => call === args.trim().toLowerCase())

/** What the session is told, once, when Haiku turns out unavailable. */
const HAIKU_UNAVAILABLE_TEXT = "Questions are off: Haiku isn't available on this account"

/**
 * Steps the session's game by one event as playOne does and returns the
 * effects; a FILE_EDIT of a test file, from whatever saw the change (a Write,
 * Edit or NotebookEdit; a change read from git), then plays the
 * TEST_FILE_EDITED that arms a Prophecy, its effects returned too.
 * `agentId` is the loop the event happened in (a subagent's; absent on the
 * main loop): its companion counts the Encounters it played.
 */
async function play($: EngineInterface, event: GameEvent, rules: Rules, agentId?: string): Promise<Effect[]> {
  const effects = await playOne($, event, rules, agentId)

  if (event.type === 'FILE_EDIT') {
    const root = await $.session.root().catch(() => null)
    const tested = testFileEditedOf(event, root, await $.clock.now())
    if (tested !== null) {
      return [...effects, ...(await playOne($, tested, rules, agentId))]
    }
  }

  return effects
}

/** Steps the session's game by one event, keeps the Player, plays the effects, and returns them. */
async function playOne($: EngineInterface, event: GameEvent, rules: Rules, agentId?: string): Promise<Effect[]> {
  const effects = await stepGame($, event, rules)

  if (effects.some(effect => effect.type === 'ENCOUNTER_STARTED' || effect.type === 'ENCOUNTER_UPDATED' || effect.type === 'BATTLE_WON')) {
    await update($, party, current => tally(current, agentId, effects))
  }

  const saved = await read($, game)
  if (saved !== null) {
    await savePlayer($, saved.player)
  }

  // The step's Sound cues, never awaited: sound waits for nothing and fails nothing.
  void playCues($, effects, saved?.player)

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
    if (effect.type === 'SCOUTING_WANTED') {
      // Never awaited: the read that discovered the Module returns at once.
      void askScouting($, effect, rules).catch(() => undefined)
    }
    if (effect.type === 'MODULES_CHARTED' && saved !== null) {
      $.ui.toast(`Charted: ${effect.modules.join(', ')} · /badges`)
      // The session's whole list goes to the Player's for this project, as
      // the discovered Modules do.
      void $.session
        .root()
        .then(root => recordModulesCharted($, root, saved.chartedModules ?? []))
        .catch(() => undefined)
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
      $.ui.toast(`Quest started: ${effect.ticket} · /quest for the brief`)
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
    if (effect.type === 'PROPHECY_SETTLED') {
      $.ui.toast(prophecyText(effect))
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
      // The registry's Region is touched; a ticket cleared here for the first
      // time (its trophy just won) lights its Dungeon in the Snapshot, when
      // the board's card says which.
      const root = await $.session.root().catch(() => null)
      if (root !== null) {
        const isCleared = effect.outcome === 'won' && effects.some(each => each.type === 'TROPHY_EARNED')
        const cleared = isCleared ? clearedOf(await listedCard($, effect.ticket)) : null
        await recordRegionQuestClosed($, root, cleared)
          .then(regions => showRegions($, regions))
          .catch(() => undefined)
      }
    }
  }

  return effects
}

/** Plays a reading of the session's vitals, with the model it runs on. */
async function measure($: EngineInterface, usage: MeasureSeen, rules: Rules): Promise<void> {
  await play($, translateMeasure(usage, await $.session.model()), rules)
}

/** How long one git run of the diff path may take: a stuck one gives up, and plays nothing. */
const GIT_TIMEOUT_MS = 5000

/** The Bash-triggered checks of the working tree come at most this often, in ms; `turn.complete` always checks. */
export const BASH_CHECK_MS = 15_000

/** A command that may commit: the working tree is checked before it runs, as the commit would hide its changes. */
const MAY_COMMIT = /\bgit\b[^;&|\n]*\bcommit\b/

/** git in the project's root, through `$.process` (CLI only: elsewhere it rejects, and the diff path is off). */
const gitOf =
  ($: EngineInterface, root: string): Git =>
  async (args, stdin) =>
    $.process.run(['git', ...args], { cwd: root, timeoutMs: GIT_TIMEOUT_MS, ...(stdin === undefined ? {} : { stdin }) })

/** A file of the project, by its path relative to the root. */
const readerOf =
  ($: EngineInterface, root: string): ReadFile =>
  async path =>
    $.fs.read(`${root.replace(/[\\/]+$/, '')}/${path}`)

/** The agent statuses of a companion still out. */
const STILL_RUNNING = new Set(['pending', 'running', 'waiting'])

/**
 * Crafting from the diff (src/diff-crafting.ts): the session's snapshot of
 * the working tree (null: the diff path off), when a Bash call last checked
 * it, and the steps on it, run in turn, so a check never sees a change a
 * Write is still being played for, and two checks never play one change
 * twice. The module's own: session.start takes the snapshot again.
 */
let snapshot: Snapshot | null = null
let lastBashCheck = Number.NEGATIVE_INFINITY
let diffTurn: Promise<void> = Promise.resolve()

/** Runs `work` after every step on the snapshot before it; a failure plays nothing more. */
function inDiffTurn<T>(work: () => Promise<T>): Promise<T> {
  const done = diffTurn.then(work)
  diffTurn = done.then(
    () => undefined,
    () => undefined,
  )

  return done
}

/** The snapshot the session starts from; none (the diff path off) outside a git repo, or without git. */
function startDiff($: EngineInterface, root: string | null): Promise<void> {
  lastBashCheck = Number.NEGATIVE_INFINITY

  return inDiffTurn(async () => {
    snapshot = root === null ? null : await takeSnapshot(gitOf($, root), readerOf($, root))
  }).catch(() => undefined)
}

/** Plays what changed in the working tree since the last check, in `agentId`'s loop: at every turn's end, and before a commit. */
function checkDiff($: EngineInterface, root: string | null, agentId: string | undefined, rules: Rules): Promise<void> {
  return inDiffTurn(async () => {
    if (snapshot === null || root === null) {
      return
    }
    for (const edit of await changesSince(snapshot, gitOf($, root), readerOf($, root), root)) {
      await play($, edit, rules, agentId)
    }
  }).catch(() => undefined)
}

/** As checkDiff, after a Bash call that may have changed files: at most every BASH_CHECK_MS. */
async function checkDiffAfterBash($: EngineInterface, root: string | null, agentId: string | undefined, rules: Rules): Promise<void> {
  // The snapshot itself is read in turn: the first may still be being taken.
  const now = await $.clock.now()
  if (now - lastBashCheck < BASH_CHECK_MS) {
    return
  }
  lastBashCheck = now
  await checkDiff($, root, agentId, rules)
}

/**
 * Plays a tool's FILE_EDIT, then takes its file into the snapshot, so the
 * diff path never plays that change again. Called in the diff's turn.
 */
async function playFileEdit(
  $: EngineInterface,
  edit: Extract<GameEvent, { type: 'FILE_EDIT' }>,
  root: string | null,
  agentId: string | undefined,
  rules: Rules,
): Promise<void> {
  await play($, edit, rules, agentId)
  if (snapshot !== null && root !== null) {
    await noteChanged(snapshot, gitOf($, root), readerOf($, root), root, edit.path)
  }
}

/** The tools that change a file and hand over its change: played from their record, never from the diff. */
const FILE_CHANGE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit'])

/** The Quest Board's panel, at its place: the unrolled Scroll's excerpt as fetched on Unroll. */
async function boardPanel($: EngineInterface, e: RenderInput<'Pane'>, place: GameScreen['board']) {
  const shown = await read($, board)
  const excerpt = place.selected == null ? undefined : scrollExcerptOf(await read($, memberOf(ticketDetails, { requestId: place.selected })))

  return drawQuestBoard($, e, shown, place, boardActions($), (await read($, game))?.player ?? null, excerpt)
}

// The Quest Log draws what is already kept: the fetch, the game, the
// briefing. It fetches nothing itself.
async function logPanel($: EngineInterface, e: RenderInput<'Pane'>, picked: string | null) {
  const current = await read($, game)
  const ticket = picked ?? current?.quest?.ticket ?? null
  if (ticket === null) {
    return drawEmptyQuestLog($, e)
  }

  const kept = await read($, questLog)
  const history = kept.ticket === ticket ? kept.history : []
  const quest = current?.quest?.ticket === ticket ? current.quest : null
  const briefed = await read($, memberOf(briefing, { requestId: ticket }))
  const fetch = await read($, memberOf(ticketDetails, { requestId: ticket }))
  const listed = await listedCard($, ticket)
  // The Dungeon the ticket is in, as its Quest Source says (fetched, else listed).
  const dungeon = (fetch?.state === 'got' ? fetch.details?.dungeon : undefined) ?? listed?.dungeon

  return drawQuestLog(
    $,
    e,
    {
      ticket,
      fetch,
      listed,
      quest,
      progress: quest === null || current === null ? null : questProgressOf(current),
      history,
      briefing: typeof briefed?.text === 'string' && briefed.text.trim() !== '' ? briefed.text : null,
      ...(dungeon === undefined ? {} : { dungeon: dungeon.name }),
    },
    questLogActions($, ticket),
  )
}

async function mapPanel($: EngineInterface, e: RenderInput<'Pane'>) {
  const current = await read($, game)

  return renderRegionMap($, e, current?.visitedModules ?? [], current === null ? [] : chartedModulesOf(current), themingOf($))
}

// Drawing the World asks, just after (a drawing may not write), for the
// theme of each Island with none yet: once each at most (src/theming.ts).
async function sheetPanel($: EngineInterface, e: RenderInput<'Pane'>, place: GameScreen['sheet']) {
  const state = await read($, overview)
  const unthemed = Object.entries(state.regions)
    .filter(([, entry]) => themeOf(entry) === undefined)
    .map(([key]) => key)
  if (unthemed.length > 0) {
    const theming = themingOf($)
    $.clock.after(0, () => {
      for (const key of unthemed) {
        void themeRegion($, theming, key)
      }
    })
  }

  return drawOverview($, e, (await read($, game))?.player ?? (await loadPlayer($)), state, place, overviewActions($))
}

/** What the Scene plays now, from the game, the party and the Briefing kept. */
async function sceneStateOf($: EngineInterface, current: GameState | null): Promise<SceneState> {
  // The Quest Giver's Briefing tells the Scene's line until the Quest's first Encounter.
  const quest = current?.quest ?? null
  const briefed =
    quest !== null && quest.encounters.length === 0
      ? ((await read($, { plugin: 'quest-mod', key: 'briefing', id: quest.ticket }))?.text ?? null)
      : null

  return {
    encounter: current?.encounter ?? null,
    fight: current?.bossFight ?? null,
    briefing: briefed,
    beat: (await read($, party)).beat,
  }
}

/**
 * The dialogue box: the boss while its fight is under way; else the
 * Sage's Question or answer while one waits or shows; else the boss's
 * outcome while the Scene still plays the fight just ended; else the
 * narrator. On the desktop the narrator tells the Scene's line under the
 * stage's art; in the terminal, where the stage is that line, it says
 * who may speak next. Drawing a Question puts it in front of the Player:
 * its time starts, recorded just after (a drawing may not write).
 */
function dialogueOf(
  $: EngineInterface,
  e: RenderInput<'Pane'>,
  current: GameState | null,
  scene: SceneState,
  drawsArt: boolean,
  rules: Rules,
) {
  const { Box, Text } = $.ui.resolve(e)
  const fight = current?.bossFight ?? null
  const quest = current?.quest ?? null
  const boss = () => {
    // The Quest the fight ends, or ended: the active one's, else the fight's own ticket.
    const ticket = fight?.ticket ?? quest?.ticket
    const title = quest?.ticket === ticket ? quest?.title : undefined

    return drawBoss(
      $,
      e,
      fight,
      bossActions($, rules),
      current !== null && isExhausted(current.player),
      ticket === undefined ? null : drawQuestHeader($, e, questHeaderOf($, ticket, title)),
    )
  }

  if (isUnderWay(fight)) {
    return boss()
  }
  if (current !== null && (current.lastAnswer !== null || current.questions.length > 0)) {
    if (current.lastAnswer === null && current.questions[0]?.shownAt === null) {
      $.clock.after(0, () => {
        void showFirstQuestion($, rules).catch(() => undefined)
      })
    }

    return drawSage(
      $,
      e,
      { questions: current.questions, lastAnswer: current.lastAnswer },
      sageActions($, rules),
      quest === null ? null : drawQuestHeader($, e, questHeaderOf($, quest.ticket, quest.title)),
    )
  }
  if (fight !== null && sceneOf(scene.encounter, fight).kind === 'boss') {
    return boss()
  }

  const { line, isIdle } = sceneLineOf(scene)
  const narrator = drawsArt ? <Text dimColor={isIdle}>{line}</Text> : <Text dimColor>{NO_QUESTION}</Text>

  // During a Quest the box is headed by it, its Quest Log a press away, as when someone speaks.
  return quest === null ? (
    narrator
  ) : (
    <Box flexDirection="column" gap={1}>
      {drawQuestHeader($, e, questHeaderOf($, quest.ticket, quest.title))}
      {narrator}
    </Box>
  )
}

export const register: Register = (on, options) => {
  // The Player's settings, from /config: a change there reloads the mod, and
  // register runs again with the new values.
  const rules = rulesOf(options)
  const autoOpenScene = autoOpenSceneOf(options)
  const hudStyle = hudStyleOf(options)
  setSoundVolume(soundVolumeOf(options))

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
    const charted = root === null ? [] : await loadCharted($, root).catch(() => [])
    // Quests earlier sessions left active for over a week were abandoned.
    if (root !== null) {
      await pruneStaleQuests($).catch(() => undefined)
    }
    // The project joins the World, or is touched there (the registry seeded
    // once from an older Player's Regions); the World plays on without it.
    if (root !== null) {
      const repo = await $.session.repo().catch(() => null)
      await touchRegion($, root, repo?.remote ?? null)
        .then(regions => showRegions($, regions))
        .catch(() => undefined)
    }
    // The working tree as it is now: work done before is never played. Not
    // awaited: the checks wait their turn behind it.
    void startDiff($, root)
    // A companion whose agent no longer runs (killed, its session ended)
    // quietly leaves the party.
    const running = await Promise.resolve()
      .then(() => $.agent.list())
      .then(agents => new Set(agents.filter(agent => STILL_RUNNING.has(agent.status)).map(agent => agent.id)))
      .catch(() => new Set<string>())
    await update($, party, current => stillOut(current, running))
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
        chartedModules: [...new Set([...charted, ...(resumed.chartedModules ?? [])])],
      }
    })

    // The Game Screen is the mod's one pane: one an older load left open
    // under its own id is closed.
    await closeRetiredPanes($)

    // The commands are a convenience: the game plays without them.
    await $.command
      .register({ name: 'game', description: 'Open the Game Screen: the stage, the dialogue box and the view you left' })
      .catch(() => undefined)
    await $.command
      .register({ name: 'quest-board', description: 'Open the Game Screen on the Quest Board: this Region\'s open Quests' })
      .catch(() => undefined)
    await $.command
      .register({ name: 'scene', description: 'Open the Game Screen: the current Encounter, played on its stage' })
      .catch(() => undefined)
    await $.command
      .register({ name: 'map', description: 'Open the Game Screen on the Region map: this Region\'s Dungeons, the Wilds and its Modules' })
      .catch(() => undefined)
    await $.command
      .register({
        name: 'sage',
        description: 'Answer the Sage\'s Questions on the Game Screen; /sage A-D answers the first one',
      })
      .catch(() => undefined)
    await $.command
      .register({ name: 'badges', description: 'Your character sheet as text, and the Game Screen on the Sheet: level, Stats, Badges, Trophies' })
      .catch(() => undefined)
    await $.command
      .register({ name: 'overview', description: 'Open the Game Screen on the Sheet: your character sheet and the World of Islands' })
      .catch(() => undefined)
    await $.command
      .register({
        name: 'prophecy',
        description: 'Call the armed Prophecy: /prophecy red, green or rout',
      })
      .catch(() => undefined)
    await $.command
      .register({
        name: 'quest',
        description: 'Open the Game Screen on the Quest Log: the active Quest\'s ticket, description and progress; /quest #N for any ticket',
        argumentHint: '[#N | ABC-123]',
      })
      .catch(() => undefined)
    await $.command
      .register({
        name: 'boss',
        description: 'Fight the Quest\'s Boss Fight on the Game Screen; /boss A-D answers, /boss skip skips it',
      })
      .catch(() => undefined)

    await openGameForArt($, await $.session.surfaces().catch(() => []), autoOpenScene)

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
    const { agentId } = e
    // A Check about to run: no Prophecy is called from now, with its output
    // in sight.
    const starting = translateCheckStart(e)
    if (starting !== null) {
      await play($, starting, rules, agentId)
    }

    // Without the root, a read still explores, but discovers no Module.
    const root = await $.session.root().catch(() => null)

    // A file-changing tool runs in the diff's turn, from the call to its
    // change noted: no check (another loop's) sees the change in between.
    if (FILE_CHANGE_TOOLS.has(e.tool)) {
      return inDiffTurn(async () => {
        const changed = await next(e)
        const edit = translateToolCall(e, changed, root)
        if (edit?.type === 'FILE_EDIT') {
          await playFileEdit($, edit, root, agentId, rules).catch(() => undefined)
        }

        return changed
      })
    }

    // A commit hides what it commits from the diff: what changed is played first.
    if (e.tool === 'Bash' && typeof e.command === 'string' && MAY_COMMIT.test(e.command)) {
      await checkDiff($, root, agentId, rules)
    }
    const outcome = await next(e)
    const event = translateToolCall(e, outcome, root)

    if (event !== null) {
      await play($, event, rules, agentId)
    }

    // A Bash call that is no Check may read the code, or change it (a
    // heredoc, a script): its reads explore, and the working tree is checked.
    if (e.tool === 'Bash' && event === null) {
      const bash = translateBashReads(e, outcome, root)
      for (const read of bash.reads) {
        await play($, read, rules, agentId)
      }
      if (!bash.isReadOnly && outcome.deny === undefined) {
        await checkDiffAfterBash($, root, agentId, rules)
      }
    }

    // A Bash call may run a check and commit too (`npm test && git commit`).
    const commit = translateCommit(e, outcome)
    if (commit !== null) {
      await play($, commit, rules, agentId)
    }

    return outcome
  })
    // The game never blocks a tool call: on a failure the call's own result
    // stands.
    .catch(($, e, next) => next(e))

  // Every turn's end, the main loop's and each subagent's, checks the
  // working tree; a subagent's brings its companion back, with what its
  // loop played. Nothing pays for the return.
  on('turn.complete', async ($, e, next) => {
    const ended = await next(e)
    const { agentId } = e
    await checkDiff($, await $.session.root().catch(() => null), agentId, rules)

    if (agentId !== undefined) {
      let back: ReturnType<typeof comeBack>['companion'] = null
      await update($, party, current => {
        const returned = comeBack(current, agentId)
        back = returned.companion

        return returned.party
      })
      if (back !== null) {
        $.ui.toast(backText(back))
      }
    }

    return ended
  })
    // The game never holds up a turn's end: on a failure its answer stands.
    .catch(($, e, next) => next(e))

  // A subagent started during a Quest is a companion setting out. Nothing
  // pays for it: spawning agents is Claude's activity (ADR 0002).
  on('agent.spawn', async ($, e, next) => {
    const spawned = await next(e)
    const { agentId } = spawned
    if (spawned.deny === undefined && agentId !== undefined && (await read($, game))?.quest != null) {
      await update($, party, current => setOut(current, agentId, e.description))
    }

    return spawned
  })
    // The game never blocks a spawn: on a failure it starts as asked.
    .catch(($, e, next) => next(e))

  /** What a command that opened the Game Screen says: `what` opened, and when it shows if it waits undrawn. */
  const openedText = (what: string, opened: { isPlaced: boolean }) =>
    opened.isPlaced ? `${what} opened.` : `${what} opened: it shows once the window is wide enough.`

  // /game opens the Game Screen on the view last shown; /scene too, the
  // stage being always there.
  on('command.run', { command: 'game' }, async $ => ({ text: openedText('Game Screen', await openGameScreen($)) }))

  on('command.run', { command: 'scene' }, async $ => ({ text: openedText('Scene', await openGameScreen($)) }))

  on('command.run', { command: 'quest-board' }, async $ => {
    const opened = await showView($, 'quests')
    await listQuests($)

    return { text: openedText('Quest Board', opened) }
  })

  on('command.run', { command: 'map' }, async $ => ({ text: openedText('Region map', await openRegionMap($, { kind: 'live' })) }))

  // /sage opens the Game Screen, its dialogue box on the first Question, and
  // tells the Question as text, for the terminal; /sage A to D answers it.
  on('command.run', { command: 'sage' }, async ($, e) => {
    const choice = e.args.trim() === '' ? undefined : choiceOf(e.args)
    const current = await read($, game)
    const first = current?.questions[0]

    if (e.args.trim() !== '' && choice === undefined) {
      return { text: 'Answer with /sage A, B, C or D.' }
    }

    if (first === undefined) {
      await openGameScreen($).catch(() => undefined)

      return { text: NO_QUESTION }
    }

    // A letter for a Question the Player was never shown is no answer: it
    // could not have been read. It is shown instead, and its time starts.
    if (choice !== undefined && first.shownAt === null) {
      if (current?.lastAnswer != null) {
        await play($, { type: 'ANSWER_DISMISSED' }, rules)
      }
      await openGameScreen($).catch(() => undefined)
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
    await openGameScreen($).catch(() => undefined)
    await showFirstQuestion($, rules)

    return { text: questionText(first, current?.questions.length ?? 1) }
  })

  // /boss opens the boss's dialogue box and tells its Question as text, for
  // the terminal; /boss A to D answers it, /boss skip skips the fight.
  on('command.run', { command: 'boss' }, async ($, e) => {
    const args = e.args.trim()
    const current = await read($, game)
    const fight = current?.bossFight ?? null
    await openGameScreen($).catch(() => undefined)

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

  // /prophecy tells the Prophecy armed; /prophecy red, green or rout calls
  // it, as the HUD's Buttons do, for a band that cannot take the focus.
  on('command.run', { command: 'prophecy' }, async ($, e) => {
    const args = e.args.trim()
    const call = args === '' ? undefined : prophecyCallOf(args)
    if (args !== '' && call === undefined) {
      return { text: PROPHECY_USAGE }
    }

    const prophecy = (await read($, game))?.prophecy
    if (prophecy == null) {
      return { text: 'No Prophecy is armed: one is when Claude edits a test file.' }
    }
    if (prophecy.call !== undefined) {
      return { text: `You called it already: ${callName(prophecy.call)}. The next Check will tell.` }
    }
    if (call === undefined) {
      const file = prophecy.file.split(/[\\/]/).filter(Boolean).pop() ?? prophecy.file

      return { text: `A Prophecy is armed (${file}): call the next Check with /prophecy red, green or rout.` }
    }

    await play($, { type: 'PROPHECY_MADE', call }, rules)

    return { text: `You call it: ${callName(call)}. The next Check will tell.` }
  })

  // /quest opens the active Quest's log; /quest #N (or a Jira key) any ticket's.
  on('command.run', { command: 'quest' }, async ($, e) => {
    const arg = questArgOf(e.args)
    if (arg.kind === 'invalid') {
      return { text: NOT_A_TICKET }
    }

    const quest = (await read($, game))?.quest ?? null
    const ticket = arg.kind === 'ticket' ? arg.ticket : quest?.ticket
    if (ticket === undefined) {
      return { text: NO_ACTIVE_QUEST }
    }

    const opened = await openQuestLog($, ticket)
    const title = quest?.ticket === ticket ? quest.title : (await listedCard($, ticket))?.title
    const named = `${ticket}${title === undefined ? '' : ` ${title}`}`

    return {
      text: opened.isPlaced
        ? `Quest Log opened: ${named}.`
        : `Quest Log opened: ${named}. It shows once the window is wide enough.`,
    }
  })

  on('command.run', { command: 'badges' }, async $ => {
    const current = await read($, game)
    const player = current?.player ?? (await loadPlayer($))
    const charted = current === null ? [] : chartedModulesOf(current)
    // The sheet as text, for the terminal; the Game Screen on the Sheet beside it.
    await showRegions($)
    await showView($, 'sheet').catch(() => undefined)

    return { text: `${badgesText(player)}\n${cartographerText(player, charted)}` }
  })

  on('command.run', { command: 'overview' }, async $ => {
    await showRegions($)

    return { text: openedText('Overview', await showView($, 'sheet')) }
  })

  on('session.attach', async ($, e, next) => {
    const attached = await next(e)
    await openGameForArt($, [e.surface], autoOpenScene)

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

  // The Game Screen draws what the game already holds: it never runs in a
  // tool call, so it never slows one. Its panel is the view chosen, at the
  // place the Game Screen keeps for it.
  on('ui.render', { component: 'Pane', requestId: GAME.id }, async ($, e) => {
    const current = await read($, game)
    const screen = await readGameScreen($)
    const drawsArt = drawsArtOn(e.surface, $.ui.resolve(e))
    const layout = stageLayoutOf(drawsArt, e.props.scroll.bodyRows, e.props.bodyColumns)
    const scene = await sceneStateOf($, current)
    const player = current?.player ?? (await loadPlayer($))
    const panel =
      screen.view === 'quests'
        ? await boardPanel($, e, screen.board)
        : screen.view === 'map'
          ? await mapPanel($, e)
          : screen.view === 'log'
            ? await logPanel($, e, screen.log.ticket)
            : await sheetPanel($, e, screen.sheet)

    return drawGameScreen($, e, {
      stage: drawStage($, e, layout, scene),
      dialogue: dialogueOf($, e, current, scene, drawsArt, rules),
      panel,
      view: screen.view,
      level: `Lv ${player.level}`,
      badges: player.badges?.length ?? 0,
      choose: view => {
        void chooseView($, view).catch(() => undefined)
      },
    })
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, game)

    if (e.props.hasSurvey || current === null) {
      return next(e)
    }

    return drawHud($, e, current, hudStyle, hudActions($, rules), (await read($, party)).companions.length)
  })
}
