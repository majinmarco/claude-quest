# ADR 0001: A Quest starts when its implement command runs

- Status: Accepted
- Date: 2026-10-24 (written after 0002 and 0003, recording a decision made with the first Quest, #1)
- Applies to: Claude Code 2.1.308 and later

## Context

A Quest is one ticket, played from the moment the Player starts working on it. The natural place to see that is the implement skill (`/mattpocock-skills:implement #4`, or any plugin's `implement`): it is what the Player runs to start a ticket. Claude Code gives a mod two hooks near it:

- `skill.prompt` fires when a skill's text is expanded into the prompt, but in 2.1.308 its input carries the skill's expanded text and not the arguments it was run with, so the ticket (`#4`, `ABC-123`) cannot be read from it.
- `command.run` fires when a slash command runs, with its name and its arguments as typed.

The implement skill sets `disable-model-invocation`, so the model never runs it through the Skill tool: every run is a slash command.

## Decision

The Quest starts at `command.run`, before the command runs (so its Encounters belong to the Quest), when the command is `implement` or any `<plugin>:implement` and its first argument is a ticket reference: `#4`, `4`, an issue URL, an upper-case Jira key (`ABC-123`) or its browse URL. The event translator (`translateCommand`) reads it; anything else starts nothing. The Quest Board fills the prompt with such a command and never sends it: the Player does, and `command.run` starts the Quest as for one they typed.

## Consequences

- Only slash-command runs start Quests. A skill run some other way (the model invoking a skill without `disable-model-invocation`, a skill chained from another) starts none.
- An implement command from another plugin works the same, so the mod does not depend on one skills package.
- A lower-case word with a number (`/implement utf-8 decoding`) is no ticket: Jira keys are upper case.

## Revisit when

`skill.prompt` gains the skill's arguments: the Quest could then start for any way the skill runs, including the model's.
