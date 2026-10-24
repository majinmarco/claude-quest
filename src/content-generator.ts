// The Content Generator: Haiku's side of the game. It asks a model for a
// comprehension Question about a change and checks what comes back against
// the contract, so a Question that reaches the Question Queue always has four
// options, a right answer among them, an explanation, an allowed Stat tag and
// source lines the Player can find in the diff.
//
// The model is a dependency: the mod passes one over `$.model.complete`, the
// tests a fake. Anything short of a valid Question is a skip, told by reason,
// never a throw: the Sage stays quiet rather than block or break the session.

import type { FileChange, QuestionContent, StatName } from '../types'

/** What the generator sends: a system prompt and the one user message. */
export type ModelRequest = { system: string; prompt: string }

/** What a model answers: its text, or why there is none. */
export type ModelReply = { ok: true; text: string } | { ok: false; reason: string }

/** A model to ask: Haiku through the session in the mod, a fake in tests. */
export type Model = (request: ModelRequest) => Promise<ModelReply>

/**
 * What the Sage asks about: the change a code-changing Encounter made (one
 * file for a Crafting, the fix's files for a Battle won), and the Quest's
 * ticket when one is active (`#7 Bulk discounts`).
 */
export type QuestionInput = { changes: FileChange[]; ticket: string | null }

/**
 * Why no Question came of it: `no-change`, nothing to ask about; `model-failed`,
 * the model gave no text (an API error, a timeout); `not-json`, its text holds
 * no JSON object; `invalid`, the object breaks the contract, told in `detail`.
 */
export type SkipReason = 'no-change' | 'model-failed' | 'not-json' | 'invalid'

export type Generated =
  | { ok: true; question: QuestionContent }
  | { ok: false; reason: SkipReason; detail: string }

/** Haiku, which the spec picks for Questions: cheap and fast. */
export const QUESTION_MODEL = 'claude-haiku-5-5'

/** How many options a Question has. */
export const OPTION_COUNT = 4

/**
 * The Stats a comprehension Question may be tagged with: Intelligence for
 * logic and design, Wisdom for how the change fits the system around it.
 */
export const QUESTION_STATS: readonly StatName[] = ['intelligence', 'wisdom']

/** The most lines a Question may point at: a few, to read closely. */
export const MAX_SOURCE_LINES = 12

/**
 * The most diff text sent, in characters: whole hunks up to it, the rest left
 * out. A Question asks about a few lines, and Haiku's bill grows with input.
 */
export const MAX_DIFF_CHARS = 12_000

const SYSTEM = `You are the Sage, a wise NPC in an RPG played over real coding work. The Player has just watched code change. Ask them ONE multiple-choice comprehension question about the changed lines, so they read and understand the code.

Rules:
- The question must be answerable from the diff alone: the Player sees exactly these lines.
- Ask about behaviour, logic or design (what the code does, when, why), not trivia such as names or formatting.
- Exactly four options, exactly one right; the wrong ones plausible to someone who skimmed.
- The explanation is one sentence saying why the right option is right.
- stat is "intelligence" for logic, algorithms and design, or "wisdom" for how the change fits the wider system.
- path is the file the question is about, as given.
- source_lines are 1 to ${MAX_SOURCE_LINES} lines copied exactly from that file's diff, added or unchanged lines only (never removed ones), without the leading "+" or space: the lines the question is about.

Answer with one JSON object and nothing else:
{"question": string, "options": [string, string, string, string], "answer": 0-3, "explanation": string, "stat": "intelligence" | "wisdom", "path": string, "source_lines": [string, ...]}`

/** The hunks of a unified diff, each its `@@` line and the lines under it. */
const hunksOf = (diff: string): string[] =>
  diff
    .split(/\n(?=@@ )/)
    .map(hunk => hunk.replace(/\n+$/, ''))
    .filter(hunk => hunk.trim() !== '')

/**
 * The changes as sent: whole hunks, in order, while they fit MAX_DIFF_CHARS.
 * The first hunk always goes, cut to the limit, so a huge one still asks.
 */
const trimToBudget = (changes: readonly FileChange[]): FileChange[] => {
  let room = MAX_DIFF_CHARS
  const fitted: FileChange[] = []

  for (const { path, diff } of changes) {
    const kept: string[] = []
    for (const hunk of hunksOf(diff)) {
      if (hunk.length <= room) {
        kept.push(hunk)
        room -= hunk.length
      } else if (fitted.length === 0 && kept.length === 0) {
        kept.push(hunk.slice(0, room).replace(/\n[^\n]*$/, ''))
        room = 0
      }
    }
    if (kept.length > 0) {
      fitted.push({ path, diff: kept.join('\n') })
    }
  }

  return fitted
}

const promptOf = (changes: readonly FileChange[], ticket: string | null): string =>
  [
    ticket === null ? 'No ticket is active.' : `The ticket being worked on: ${ticket}`,
    ...changes.map(({ path, diff }) => `File: ${path}\n\`\`\`diff\n${diff}\n\`\`\``),
  ].join('\n\n')

/**
 * The lines of a diff still in the code the Player sees, without their mark:
 * those added and the context around them. Removed lines are gone from the
 * file, and hunk headers are no code.
 */
const linesOf = (diff: string): string[] =>
  diff
    .split('\n')
    .filter(line => /^[+ ]/.test(line) && !/^\+\+\+ /.test(line))
    .map(line => line.slice(1))

/** The JSON object in a reply: bare, fenced, or amid a little prose. */
const objectIn = (text: string): unknown => {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end < start) {
    return undefined
  }

  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return undefined
  }
}

const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== ''

const invalid = (detail: string): Generated => ({ ok: false, reason: 'invalid', detail })

/**
 * Checks a model's reply against the contract and the changes it was shown,
 * and makes it a Question's content; every line it points at must be in the
 * diff of the file it names.
 */
export const validateQuestion = (reply: unknown, changes: readonly FileChange[]): Generated => {
  if (typeof reply !== 'object' || reply === null) {
    return invalid('the reply is not an object')
  }

  const { question, options, answer, explanation, stat, path, source_lines } = reply as Record<
    string,
    unknown
  >
  if (!isText(question)) {
    return invalid('no question')
  }
  if (
    !Array.isArray(options) ||
    options.length !== OPTION_COUNT ||
    !options.every(isText) ||
    new Set(options.map(option => option.trim())).size !== OPTION_COUNT
  ) {
    return invalid(`options are not ${OPTION_COUNT} distinct texts`)
  }
  if (typeof answer !== 'number' || !Number.isInteger(answer) || answer < 0 || answer >= OPTION_COUNT) {
    return invalid('the answer is no option\'s index')
  }
  if (!isText(explanation)) {
    return invalid('no explanation')
  }
  if (typeof stat !== 'string' || !QUESTION_STATS.includes(stat as StatName)) {
    return invalid(`the Stat tag is none of ${QUESTION_STATS.join(', ')}`)
  }

  // With one file changed, a reply naming no file means that one.
  const change =
    changes.find(each => each.path === path) ??
    (path === undefined && changes.length === 1 ? changes[0] : undefined)
  if (change === undefined) {
    return invalid('the path names no file changed')
  }

  if (
    !Array.isArray(source_lines) ||
    source_lines.length === 0 ||
    source_lines.length > MAX_SOURCE_LINES ||
    !source_lines.every(isText)
  ) {
    return invalid(`source lines are not 1 to ${MAX_SOURCE_LINES} lines`)
  }
  // Matched by their text, whitespace aside, and kept as the diff has them:
  // a model may drop indentation, or copy the diff's mark.
  const visible = linesOf(change.diff)
  const lines: string[] = []
  for (const line of source_lines) {
    const wanted = line.trim()
    const found =
      visible.find(each => each.trim() === wanted) ??
      (/^[-+]/.test(wanted) ? visible.find(each => each.trim() === wanted.slice(1).trim()) : undefined)
    if (found === undefined) {
      return invalid(`a source line is not in the diff: ${wanted}`)
    }
    lines.push(found)
  }
  // A brace or a blank alone points at nothing to read.
  if (!lines.some(line => /\w/.test(line))) {
    return invalid('the source lines hold no code, only punctuation')
  }

  return {
    ok: true,
    question: {
      prompt: question.trim(),
      options: options.map(option => option.trim()),
      answer,
      explanation: explanation.trim(),
      stat: stat as StatName,
      source: { path: change.path, lines },
    },
  }
}

/**
 * Asks `model` for one comprehension Question about `input`'s change, and
 * returns it once it holds to the contract; else the reason it was skipped.
 * Never throws: a model that throws is a `model-failed` skip.
 */
export const generateQuestion = async (input: QuestionInput, model: Model): Promise<Generated> => {
  const changes = trimToBudget(input.changes)
  if (changes.length === 0) {
    return { ok: false, reason: 'no-change', detail: 'the change has no diff to ask about' }
  }

  let reply: ModelReply
  try {
    reply = await model({ system: SYSTEM, prompt: promptOf(changes, input.ticket) })
  } catch (error) {
    return { ok: false, reason: 'model-failed', detail: String(error) }
  }
  if (!reply.ok) {
    return { ok: false, reason: 'model-failed', detail: reply.reason }
  }

  const parsed = objectIn(reply.text)
  if (parsed === undefined) {
    return { ok: false, reason: 'not-json', detail: reply.text.slice(0, 200) }
  }

  return validateQuestion(parsed, changes)
}
