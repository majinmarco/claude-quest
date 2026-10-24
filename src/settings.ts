// The Player's settings: the Haiku budget, the hasty-answer rule, whether
// the Scene opens itself and how the HUD is drawn, as the rows of Claude Code's own settings menu
// (/config). They are the plugin's `userConfig` fields
// (.claude-plugin/plugin.json), stored by Claude Code in settings.json under
// pluginConfigs["quest-mod"].options and handed to `register(on, options)`; a
// change in /config reloads the mod with the new values. The manifest's defaults match DEFAULT_RULES.

import type { PluginOptions } from 'claude-code'

import { DEFAULT_RULES } from './engine'
import type { Rules } from './engine'

/** A setting as a number of at least 0, or undefined when it is none, so its default stands. */
const amountOf = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined

/** A setting as a count: a number of at least 0, rounded down; or undefined. */
const countOf = (value: unknown): number | undefined => {
  const amount = amountOf(value)

  return amount === undefined ? undefined : Math.floor(amount)
}

/**
 * The game's rules from the mod's settings, each value the Player set in
 * place of its default; one that is not a fitting number keeps the default.
 * The hasty-answer threshold is set in seconds and kept in ms.
 */
export const rulesOf = (options: PluginOptions): Rules => {
  const hastyAnswerSeconds = amountOf(options.hastyAnswerSeconds)

  return {
    sageCallsPerQuest: countOf(options.sageCallsPerQuest) ?? DEFAULT_RULES.sageCallsPerQuest,
    bossFightCallsPerQuest: countOf(options.bossFightCallsPerQuest) ?? DEFAULT_RULES.bossFightCallsPerQuest,
    sageCallsOutsideQuest:
      countOf(options.sageCallsOutsideQuest) ?? DEFAULT_RULES.sageCallsOutsideQuest,
    hastyAnswerMs:
      hastyAnswerSeconds === undefined ? DEFAULT_RULES.hastyAnswerMs : hastyAnswerSeconds * 1000,
    nonTrivialLines: countOf(options.nonTrivialLines) ?? DEFAULT_RULES.nonTrivialLines,
  }
}

/**
 * Whether the Scene opens itself, once per session, where a surface draws its
 * art (the `autoOpenScene` setting): yes unless the Player turned it off.
 */
export const autoOpenSceneOf = (options: PluginOptions): boolean => options.autoOpenScene !== false

/** How the HUD is drawn where a surface draws SVG: the pixel strip, or the text band. */
export type HudStyle = 'pixel' | 'text'

/** The `hudStyle` setting: the pixel strip unless the Player chose text. */
export const hudStyleOf = (options: PluginOptions): HudStyle => (options.hudStyle === 'text' ? 'text' : 'pixel')
