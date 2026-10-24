// The Question cache: Questions the Content Generator made, by the change
// they are about, so an identical diff (a file written again as it was, the
// same fix winning a Battle again) reuses its Question instead of asking
// Haiku again. A hit spends no Haiku budget.
//
// The key is a SHA-256 of the change's files and diffs, through the
// environment's Web Crypto (`crypto.subtle`, which a hooks module has). The
// cache is kept in the session's `$.state` beside the Question Queue, so it
// survives a reload of the mod; it holds the latest MAX_CACHED_QUESTIONS.

import type { FileChange, QuestionContent } from '../types'

/** A cached Question, under its change's key. */
export type CachedQuestion = { key: string; question: QuestionContent }

/** The cache: the latest Questions made, oldest first. */
export type QuestionCache = CachedQuestion[]

/** The most Questions kept: enough for a long session, small in `$.state`. */
export const MAX_CACHED_QUESTIONS = 50

const hex = (buffer: ArrayBuffer): string =>
  [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('')

/**
 * The key a change is cached under: a SHA-256 of each file's path and diff,
 * in order. The path counts, since the Question names its file.
 */
export const cacheKeyOf = async (changes: readonly FileChange[]): Promise<string> => {
  const text = JSON.stringify(changes.map(({ path, diff }) => [path, diff]))

  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
}

/** The Question cached under `key`, if any. */
export const cachedQuestion = (
  cache: QuestionCache,
  key: string,
): QuestionContent | undefined => cache.find(entry => entry.key === key)?.question

/**
 * The cache with `question` kept under `key`, as the newest: one already
 * under that key is replaced, and the oldest go past MAX_CACHED_QUESTIONS.
 */
export const remember = (
  cache: QuestionCache,
  key: string,
  question: QuestionContent,
): QuestionCache =>
  [...cache.filter(entry => entry.key !== key), { key, question }].slice(-MAX_CACHED_QUESTIONS)
