// The boss's dialogue box: the Boss Fight's current Question, its source
// lines, its four options and a skip button; above it the boss's HP and the
// last answer's verdict and explanation; once the fight is over, how it
// ended. Where the surface draws SVG the boss's portrait sits beside it; the
// terminal has the same box in text, Buttons included, and `/boss A`-`D` and
// `/boss skip` answer there too.

import type { EngineInterface, RenderInput } from 'claude-code'

import type { BossFight, QuestionAnswer } from '../types'
import { isUnderWay } from './engine'
import { portraitSvg } from './scene-art'
import { LETTERS } from './sage'

export type BossActions = {
  /** The Player chose option `choice` of the Boss Fight's Question `id`. */
  answer: (id: string, choice: number) => void
  /** The Player skipped the Boss Fight. */
  skip: () => void
}

/** How wide the portrait is drawn, in CSS pixels. */
const PORTRAIT_WIDTH = 72

/** What `/boss` says with no Boss Fight under way, nor one just ended. */
export const NO_BOSS = 'No Boss Fight under way: the first commit of a Quest summons one.'

const plural = (count: number, one: string) => `${count} ${one}${count === 1 ? '' : 's'}`

const hpOf = (fight: BossFight): string => `${fight.hp}/${fight.maxHp} HP`

/** How many Questions the Boss Fight asks in all. */
export const questionCountOf = (fight: BossFight): number => fight.questionCount ?? fight.maxHp

/** The fight as it starts: `Boss 2 HP · 3 Questions`. */
export const bossStartText = (fight: Pick<BossFight, 'hp'> & { questionCount: number }): string =>
  `Boss ${fight.hp} HP · ${plural(fight.questionCount, 'Question')}`

/** What the Player is told while they fight Exhausted: nothing is blocked. */
export const FIGHT_ON = 'You fight on, exhausted.'

/** The boss's strike when Exhausted: it costs nothing, and the fight goes on. */
const STRIKE_EXHAUSTED = 'The boss strikes, but you fight on, exhausted: no HP lost.'

/**
 * Whether the last answer was a finishing blow: right, after the boss had
 * already fallen. The boss falls at its maxHp-th right answer; any right
 * answer after it finishes it.
 */
const isFinishingBlow = (answer: QuestionAnswer, fight: BossFight): boolean =>
  answer.isCorrect && fight.hp === 0 && (fight.rightAnswers ?? fight.maxHp) > fight.maxHp

/** What the Boss Fight's end paid, as ` +100 XP (Intelligence).`; nothing when it paid none. */
const rewardOf = (fight: BossFight): string =>
  fight.reward === undefined || fight.reward <= 0 ? '' : ` +${fight.reward} XP (Intelligence).`

/**
 * What a Boss Fight answer did, in one line: a hit (the boss falling with
 * it), a finishing blow once it has fallen, or the boss's strike back.
 * `exhausted`: the Player is at 0 HP now.
 */
export const bossVerdictOf = (answer: QuestionAnswer, fight: BossFight, exhausted = false): string => {
  const paid = `+${answer.xp} XP (Intelligence)`
  if (answer.isCorrect) {
    if (isFinishingBlow(answer, fight)) {
      return `A finishing blow! ${paid}.`
    }

    return fight.hp === 0 ? `Hit! ${paid}. The boss falls!` : `Hit! ${paid}. Boss ${hpOf(fight)}`
  }

  const struck =
    answer.hpLost > 0
      ? `The boss strikes: -${answer.hpLost} HP.${exhausted ? ` ${FIGHT_ON}` : ''}`
      : STRIKE_EXHAUSTED

  return `${struck} The answer was ${LETTERS[answer.question.answer]}: ${answer.question.options[answer.question.answer]}`
}

/** How a Boss Fight ended, or that it has not, in one line. */
export const bossOutcomeText = (fight: BossFight): string => {
  switch (fight.status) {
    case 'summoned':
      return `The boss of Quest ${fight.ticket} approaches: its review Questions are being made.`
    case 'fighting':
      return fight.hp === 0
        ? `The boss of Quest ${fight.ticket} has fallen: ${plural(fight.questions.length, 'finishing blow')} left.`
        : `The boss of Quest ${fight.ticket} stands, ${hpOf(fight)}.`
    case 'won':
      return `The boss falls!${rewardOf(fight)}${fight.flawless === true ? ' Flawless!' : ''}${fight.trophy === undefined ? '' : ` Trophy: ${fight.trophy}.`} Quest ${fight.ticket} closed.`
    case 'lost':
      return `The boss still stands, ${hpOf(fight)}: Quest ${fight.ticket} closed without the Boss Fight's reward.`
    case 'skipped':
      return `Boss Fight skipped: Quest ${fight.ticket} closed without its reward.`
    case 'unfought':
      return `No boss came for Quest ${fight.ticket}: it closes without a Boss Fight.${rewardOf(fight)}`
  }
}

/**
 * The Boss Fight's current Question as text, for the terminal's `/boss`: the
 * question, the lines it points at, the lettered options.
 */
export const bossQuestionText = (fight: BossFight, exhausted = false): string => {
  const question = fight.questions[0]
  if (question === undefined) {
    return bossOutcomeText(fight)
  }

  const standing =
    fight.hp === 0 ? 'the boss has fallen: a finishing blow' : `boss ${hpOf(fight)}`

  return [
    ...(exhausted ? [FIGHT_ON] : []),
    `The boss of Quest ${fight.ticket} asks (${plural(fight.questions.length, 'review Question')} left, ${standing}): ${question.prompt}`,
    `${question.source.path}:`,
    ...question.source.lines.map(line => `    ${line}`),
    ...question.options.map((option, at) => `  ${LETTERS[at]}. ${option}`),
    'Answer with /boss A, B, C or D, or skip it with /boss skip.',
  ].join('\n')
}

/** An answer as text: the verdict, the explanation, then what comes next. */
export const bossAnswerText = (fight: BossFight, exhausted = false): string => {
  const answer = fight.lastAnswer
  const next = fight.status === 'fighting' ? bossQuestionText(fight) : bossOutcomeText(fight)

  return answer === null
    ? next
    : `${bossVerdictOf(answer, fight, exhausted && fight.status === 'fighting')}\n${answer.question.explanation}\n\n${next}`
}

/**
 * The boss's dialogue box for `fight`, or what `/boss` says with none: its
 * buttons answer and skip through `actions`.
 */
export function drawBoss(
  $: EngineInterface,
  e: RenderInput<'Pane'>,
  fight: BossFight | null,
  actions: BossActions,
  exhausted = false,
) {
  const elements = $.ui.resolve(e)
  const { Box, Text, Button, Code } = elements

  if (fight === null) {
    return <Text dimColor>{NO_BOSS}</Text>
  }

  const first = fight.questions[0]
  const last = fight.lastAnswer

  const verdict =
    last === null ? null : (
      <Box flexDirection="column">
        <Text bold color={last.isCorrect ? 'green' : 'red'}>
          {bossVerdictOf(last, fight, exhausted && fight.status === 'fighting')}
        </Text>
        <Text>{last.question.explanation}</Text>
      </Box>
    )

  const question =
    fight.status !== 'fighting' || first === undefined ? (
      <Text bold={!isUnderWay(fight)}>{bossOutcomeText(fight)}</Text>
    ) : (
      <Box flexDirection="column" gap={1}>
        <Text dimColor>
          {`${fight.hp === 0 ? 'Finishing blow' : 'Review Question'} ${questionCountOf(fight) - fight.questions.length + 1} of ${questionCountOf(fight)}`}
        </Text>
        {exhausted && <Text color="red">{FIGHT_ON}</Text>}
        <Text bold>{first.prompt}</Text>
        <Box flexDirection="column">
          <Text dimColor>{first.source.path}</Text>
          <Code source={first.source.lines.join('\n')} path={first.source.path} />
        </Box>
        <Box flexDirection="column">
          {first.options.map((option, at) => (
            <Button key={`boss-option:${first.id}:${at}`} onPress={() => actions.answer(first.id, at)}>
              {`${LETTERS[at]}. ${option}`}
            </Button>
          ))}
        </Box>
      </Box>
    )

  const body = (
    <Box flexDirection="column" gap={1}>
      <Text bold color="red">
        {fight.status === 'summoned'
          ? `The boss of Quest ${fight.ticket}`
          : `The boss of Quest ${fight.ticket} · ${hpOf(fight)} · ${plural(questionCountOf(fight), 'Question')}`}
      </Text>
      {verdict}
      {question}
      {isUnderWay(fight) && (
        <Box flexDirection="row">
          <Button key="boss-skip" onPress={() => actions.skip()}>
            Skip the Boss Fight
          </Button>
        </Box>
      )}
    </Box>
  )

  if (!('Svg' in elements)) {
    return body
  }

  const { Svg } = elements

  return (
    <Box flexDirection="row" gap={2}>
      <Svg source={portraitSvg('boss', PORTRAIT_WIDTH)} alt={`The boss of Quest ${fight.ticket}`} />
      {body}
    </Box>
  )
}
