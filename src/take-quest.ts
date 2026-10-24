// Take Quest: what the Quest Board and the Region map do when the Player
// picks a Quest. It fills the prompt with the session's implement command for
// the ticket and never sends it: the Player does, and command.run starts the
// Quest as for one they typed (ADR 0001).

import type { EngineInterface } from 'claude-code'

import { implementCommandOf, isImplementDraft, PREFERRED_IMPLEMENT } from './quest-board'
import type { QuestCard } from '../types'

/**
 * Puts the implement command for `quest` in the prompt box, for the Player
 * to send: whichever implement command the session has (mattpocock-skills
 * first). A draft the Player is writing is never written over: only an empty
 * one, or one that is itself an implement command, is replaced.
 */
export async function takeQuest($: EngineInterface, quest: QuestCard): Promise<void> {
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
