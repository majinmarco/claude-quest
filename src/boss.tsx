// The boss's dialogue box: the Boss Fight's current Question, its source
// lines, its four options and a skip button; above it the boss's HP and the
// last answer's verdict and explanation; once the fight is over, how it
// ended. Where the surface draws SVG the boss's portrait sits beside it; the
// terminal has the same box in text, Buttons included, and `/boss A`-`D` and
// `/boss skip` answer there too.

import type { EngineInterface, RenderInput } from 'claude-code'

import type { BossFight, QuestionAnswer } from '../types'
import { badgeNameOf, BOSS_FIGHT_XP, isUnderWay } from './engine'
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

/** What a Boss Fight answer did, in one line: a hit, or the boss's strike back. */
export const bossVerdictOf = (answer: QuestionAnswer, fight: BossFight): string =>
  answer.isCorrect
    ? `Hit! +${answer.xp} XP (Intelligence). Boss ${hpOf(fight)}`
    : `The boss strikes: -${answer.hpLost} HP. The answer was ${LETTERS[answer.question.answer]}: ${answer.question.options[answer.question.answer]}`

/** How a Boss Fight ended, or that it has not, in one line. */
export const bossOutcomeText = (fight: BossFight): string => {
  switch (fight.status) {
    case 'summoned':
      return `The boss of Quest ${fight.ticket} approaches: its review Questions are being made.`
    case 'fighting':
      return `The boss of Quest ${fight.ticket} stands, ${hpOf(fight)}.`
    case 'won':
      return `The boss falls! +${BOSS_FIGHT_XP} XP (Intelligence) and a badge: ${badgeNameOf(fight.ticket)}. Quest ${fight.ticket} closed.`
    case 'lost':
      return `The boss still stands, ${hpOf(fight)}: Quest ${fight.ticket} closed without the Boss Fight's reward.`
    case 'skipped':
      return `Boss Fight skipped: Quest ${fight.ticket} closed without its reward.`
    case 'unfought':
      return `No boss came for Quest ${fight.ticket}: it closes without a Boss Fight.`
  }
}

/**
 * The Boss Fight's current Question as text, for the terminal's `/boss`: the
 * question, the lines it points at, the lettered options.
 */
export const bossQuestionText = (fight: BossFight): string => {
  const question = fight.questions[0]
  if (question === undefined) {
    return bossOutcomeText(fight)
  }

  return [
    `The boss of Quest ${fight.ticket} asks (${plural(fight.questions.length, 'review Question')} left, boss ${hpOf(fight)}): ${question.prompt}`,
    `${question.source.path}:`,
    ...question.source.lines.map(line => `    ${line}`),
    ...question.options.map((option, at) => `  ${LETTERS[at]}. ${option}`),
    'Answer with /boss A, B, C or D, or skip it with /boss skip.',
  ].join('\n')
}

/** An answer as text: the verdict, the explanation, then what comes next. */
export const bossAnswerText = (fight: BossFight): string => {
  const answer = fight.lastAnswer
  const next = fight.status === 'fighting' ? bossQuestionText(fight) : bossOutcomeText(fight)

  return answer === null
    ? next
    : `${bossVerdictOf(answer, fight)}\n${answer.question.explanation}\n\n${next}`
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
          {bossVerdictOf(last, fight)}
        </Text>
        <Text>{last.question.explanation}</Text>
      </Box>
    )

  const question =
    fight.status !== 'fighting' || first === undefined ? (
      <Text bold={!isUnderWay(fight)}>{bossOutcomeText(fight)}</Text>
    ) : (
      <Box flexDirection="column" gap={1}>
        <Text dimColor>{`Review Question ${fight.maxHp - fight.questions.length + 1} of ${fight.maxHp}`}</Text>
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
          : `The boss of Quest ${fight.ticket} · ${hpOf(fight)}`}
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
