// The Sage's dialogue box: the Question Queue's oldest Question, its source
// lines and its four options as Buttons; once answered, the verdict and the
// explanation. Where the surface draws SVG the Sage's portrait sits beside it;
// the terminal has the same box in text, Buttons included, and `/sage A`-`D`
// answers there too.

import type { EngineInterface, RenderInput } from 'claude-code'

import type { GameState, Question, QuestionAnswer } from '../types'
import { QUESTION_XP, statOf } from './engine'
import { portraitSvg } from './scene-art'

export type SageActions = {
  /** The Player chose option `choice` of Question `id`. */
  answer: (id: string, choice: number) => void
  /** The Player moved on from the explanation, to the next Question if any. */
  dismiss: () => void
}

/** How wide the portrait is drawn, in CSS pixels. */
const PORTRAIT_WIDTH = 72

/** Options are lettered, as answered by `/sage A`. */
export const LETTERS = ['A', 'B', 'C', 'D'] as const

/** The option `letter` names (`A`-`D`, `a`-`d` or `1`-`4`), or undefined. */
export const choiceOf = (letter: string): number | undefined => {
  const wanted = letter.trim().toUpperCase()
  const byLetter = LETTERS.indexOf(wanted as (typeof LETTERS)[number])
  if (byLetter !== -1) {
    return byLetter
  }

  const byNumber = Number(wanted)

  return Number.isInteger(byNumber) && byNumber >= 1 && byNumber <= LETTERS.length
    ? byNumber - 1
    : undefined
}

const plural = (count: number, one: string) => `${count} ${one}${count === 1 ? '' : 's'}`

/** What the Sage says with no Question waiting. */
export const NO_QUESTION =
  'The Sage has no Question for you yet. One comes after each Crafting, or a Battle won.'

/**
 * What an answer earned or cost, in one line. A hasty right answer says what
 * a closer read would have earned.
 */
export const verdictOf = ({ isCorrect, isHasty, xp, hpLost, question }: QuestionAnswer): string => {
  if (!isCorrect) {
    return `Not quite${hpLost > 0 ? `: -${hpLost} HP` : ''}. The answer was ${LETTERS[question.answer]}: ${question.options[question.answer]}`
  }

  const paid = xp > 0 ? `+${xp} XP (${statOf(question) === 'wisdom' ? 'Wisdom' : 'Intelligence'})` : "no XP: the Sage's XP pool is full"

  return isHasty
    ? `Right, but hasty: ${paid}. A closer read earns the full ${QUESTION_XP}.`
    : `Right! ${paid}`
}

/**
 * A Question as text, for the terminal's `/sage` and the transcript: the
 * question, the lines it points at, the lettered options.
 */
export const questionText = (question: Question, waiting: number): string =>
  [
    `The Sage asks (${plural(waiting, 'Question')} waiting): ${question.prompt}`,
    `${question.source.path}:`,
    ...question.source.lines.map(line => `    ${line}`),
    ...question.options.map((option, at) => `  ${LETTERS[at]}. ${option}`),
    'Answer with /sage A, B, C or D, or the buttons in the Sage\'s pane.',
  ].join('\n')

/** An answer as text: the verdict, then the explanation. */
export const answerText = (answer: QuestionAnswer): string =>
  `${verdictOf(answer)}\n${answer.question.explanation}`

export function drawSage(
  $: EngineInterface,
  e: RenderInput<'Pane'>,
  { questions, lastAnswer }: Pick<GameState, 'questions' | 'lastAnswer'>,
  actions: SageActions,
) {
  const elements = $.ui.resolve(e)
  const { Box, Text, Button, Code } = elements
  const first = questions[0]

  const body =
    lastAnswer !== null ? (
      <Box flexDirection="column" gap={1}>
        <Text bold color={lastAnswer.isCorrect ? 'green' : 'red'}>
          {verdictOf(lastAnswer)}
        </Text>
        <Text>{lastAnswer.question.explanation}</Text>
        <Box flexDirection="row">
          <Button key="dismiss" onPress={() => actions.dismiss()}>
            {questions.length > 0
              ? `Next Question (${questions.length} waiting)`
              : 'Done'}
          </Button>
        </Box>
      </Box>
    ) : first === undefined ? (
      <Text dimColor>{NO_QUESTION}</Text>
    ) : (
      <Box flexDirection="column" gap={1}>
        <Text dimColor>{`Question 1 of ${questions.length}`}</Text>
        <Text bold>{first.prompt}</Text>
        <Box flexDirection="column">
          <Text dimColor>{first.source.path}</Text>
          <Code source={first.source.lines.join('\n')} path={first.source.path} />
        </Box>
        <Box flexDirection="column">
          {first.options.map((option, at) => (
            <Button key={`option:${first.id}:${at}`} onPress={() => actions.answer(first.id, at)}>
              {`${LETTERS[at]}. ${option}`}
            </Button>
          ))}
        </Box>
      </Box>
    )

  const heading = (
    <Text bold color="magenta">
      The Sage
    </Text>
  )

  // The terminal's table lists Svg too, as a fragment: it draws no SVG.
  if (e.surface === 'terminal' || !('Svg' in elements)) {
    return (
      <Box flexDirection="column" gap={1}>
        {heading}
        {body}
      </Box>
    )
  }

  const { Svg } = elements

  return (
    <Box flexDirection="row" gap={2}>
      <Svg source={portraitSvg('sage', PORTRAIT_WIDTH)} alt="The Sage" />
      <Box flexDirection="column" gap={1}>
        {heading}
        {body}
      </Box>
    </Box>
  )
}
