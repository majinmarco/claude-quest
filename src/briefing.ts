// The Briefing: the Quest Giver's two lines on a Quest just started, and one
// Question about the ticket itself (what done means, what is out of scope,
// where the change belongs), so the Player reads the ticket while Claude
// reads the code. One Haiku call makes both, from the ticket its lookup found;
// the reply is checked against the contract here, and one that breaks it is
// skipped, never queued, as the Content Generator does for the Sage.
//
// The Question points at the ticket (`<ticket>`, no lines) and is paid as a
// Sage Question. Its cache key is the ticket and a hash of its summary, so a
// ticket started again, its summary the same, costs no call. The text is kept
// in `$.state` as `{ text }` under `{ plugin: 'quest-mod', key: 'briefing',
// id: <ticket> }` (a family by ticket: a state key must be a literal), for
// the Scene and the Quest Log.

import type { QuestionContent } from '../types'
import { checkQuestionContent, objectIn, TICKET_IS_DATA, ticketText } from './content-generator'
import type { Model, ModelFailure, ModelReply, SkipReason, TicketContext } from './content-generator'
import { TICKET_SOURCE } from './engine'
import { sha256Of } from './question-cache'

/** The most characters a Briefing has: two short lines. */
export const MAX_BRIEFING_CHARS = 200

/** The most lines a Briefing has. */
export const MAX_BRIEFING_LINES = 2

/**
 * What the Quest Giver is shown: the ticket's reference, its title when
 * known, the summary its lookup fetched, and its Dungeon's name when known.
 * All of it written by whoever filed the ticket: data, never instructions.
 */
export type BriefingInput = TicketContext & { summary: string }

export type BriefingGenerated =
  | { ok: true; briefing: string; question: QuestionContent }
  | { ok: false; reason: SkipReason; detail: string; failure?: ModelFailure }

const SYSTEM = `You are the Quest Giver, an NPC in an RPG played over real coding work. The Player has just taken a Quest: the ticket below. Brief them in your own voice, then ask them ONE multiple-choice question about the ticket itself, so they read it before the code changes.

Rules:
- briefing is at most ${MAX_BRIEFING_LINES} short lines and ${MAX_BRIEFING_CHARS} characters in all, in the Quest Giver's voice, telling what the Quest is for.
- The question must be answerable from the ticket alone: which acceptance criterion defines done, what is out of scope, which part of the system the change belongs to, or what the user story asks for.
- Exactly four options, exactly one right; the wrong ones plausible to someone who skimmed the ticket.
- The explanation is one sentence saying why the right option is right.
- stat is "wisdom" for scope and where the change fits the system, or "intelligence" for what the change must do.
${TICKET_IS_DATA}

Answer with one JSON object and nothing else:
{"briefing": string, "question": {"question": string, "options": [string, string, string, string], "answer": 0-3, "explanation": string, "stat": "intelligence" | "wisdom"}}`

const invalid = (detail: string): BriefingGenerated => ({ ok: false, reason: 'invalid', detail })

/**
 * Checks a model's reply against the Briefing's contract: a briefing of at
 * most MAX_BRIEFING_LINES lines (blank ones dropped) and MAX_BRIEFING_CHARS
 * characters, and a Question under the Content Generator's contract, made to
 * point at the ticket with no lines.
 */
export const validateBriefing = (reply: unknown): BriefingGenerated => {
  if (typeof reply !== 'object' || reply === null) {
    return invalid('the reply is not an object')
  }

  const { briefing, question } = reply as Record<string, unknown>
  if (typeof briefing !== 'string' || briefing.trim() === '') {
    return invalid('no briefing')
  }
  const lines = briefing
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line !== '')
  if (lines.length > MAX_BRIEFING_LINES) {
    return invalid(`the briefing is over ${MAX_BRIEFING_LINES} lines`)
  }
  const text = lines.join('\n')
  if (text.length > MAX_BRIEFING_CHARS) {
    return invalid(`the briefing is over ${MAX_BRIEFING_CHARS} characters`)
  }

  if (question === undefined || question === null) {
    return invalid('no question')
  }
  const checked = checkQuestionContent(question)
  if (!checked.ok) {
    return checked
  }

  return { ok: true, briefing: text, question: { ...checked.content, source: { path: TICKET_SOURCE, lines: [] } } }
}

/**
 * Asks `model` for the Quest Giver's Briefing of `input`'s ticket, and
 * returns it once it holds to the contract; else the reason it was skipped.
 * Never throws: a model that throws is a `model-failed` skip.
 */
export const generateBriefing = async (input: BriefingInput, model: Model): Promise<BriefingGenerated> => {
  let reply: ModelReply
  try {
    reply = await model({ system: SYSTEM, prompt: ticketText(input) })
  } catch (error) {
    return { ok: false, reason: 'model-failed', detail: String(error) }
  }
  if (!reply.ok) {
    return { ok: false, reason: 'model-failed', detail: reply.reason, ...(reply.failure === undefined ? {} : { failure: reply.failure }) }
  }

  const parsed = objectIn(reply.text)
  if (parsed === undefined) {
    return { ok: false, reason: 'not-json', detail: reply.text.slice(0, 200) }
  }

  return validateBriefing(parsed)
}

/**
 * The Question cache's key for `ticket`'s Briefing: `briefing:<ticket>:` and
 * a SHA-256 of its summary. The same summary is the same key, so a ticket
 * started again costs no call, and once its Question is answered the
 * answered-keys guard keeps it from being asked again.
 */
export const briefingKeyOf = async (ticket: string, summary: string): Promise<string> =>
  `briefing:${ticket}:${await sha256Of(summary)}`

/** A Briefing as its toast and the Scene's line tell it: its first line, said by the Quest Giver. */
export const briefingLine = (briefing: string): string => `Quest Giver: ${briefing.split('\n')[0] ?? ''}`
