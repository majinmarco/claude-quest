# ADR 0003: The Boss Fight on commit

- Status: Accepted
- Date: 2026-10-23
- Applies to: `dev` after ed24561 (ADR 0002's numbers unchanged)

## Context

The Boss Fight (#12) is summoned by the first commit Claude makes during a Quest, read from the `gitOperation` Claude Code hands a successful Bash call. The review (decisions.md, section D) found three gaps: a single wrong answer lost the whole fight, so it felt like a quiz rather than a review; `git commit && npm test` with failing tests made a commit but handed no record, so no boss came; and a Quest closed with no active record in the Region file (written over, or its start never written) left no trace.

## Decision

- **Two of three.** Every Question is asked. The boss has `ceil(2n/3)` HP for `n` Questions (2 for 3, 1 for 1, 2 for 2). A right answer hits while the boss stands; after it falls, the Questions left are finishing blows, paid the same. When the Questions run out the fight is `won` if the boss fell, else `lost`. Flawless needs every Boss answer right and no wrong Sage answer in the Quest. Rewards are ADR 0002's.
- **Exhausted never blocks.** At 0 HP the Player is told "You fight on, exhausted" and the fight goes on.
- **Chained commits.** When a Bash call fails with `Exit code N` and one of its segments is a plain `git commit` (not `--amend`, `--dry-run`, `-q`), the sha is read from git's summary line (`^\[[^\]]*? ([0-9a-f]{7,40})\] `, multiline). Such a commit's diff must come from a successful `git show`; it never falls back to the Quest's changes, because the error text could be anything the command printed.
- **Region history.** Closing or abandoning a Quest with no active record appends one, started and ended at that moment.

## Future work

- **HEAD probe on `turn.start`.** Commits made outside Claude's Bash tool (the Player's terminal, an editor, a hook-rejected-then-retried commit) reach no hook. Record HEAD at `QUEST_START` and, on each `turn.start`, look for new commits on it (an ancestor check, the committer, a since-time filter) to summon the boss.
- **Folder detection.** `commitFolderOf` reads only `cd dir && git commit`. `git -C dir commit`, `(cd dir && …)` subshells and Windows `cd /d dir` are missed; the commit's diff is then read from the session's folder, where `git show` may fail and the Quest's changes are reviewed instead.

## Consequences

- One slip no longer loses the fight; a perfect review still earns Flawless.
- A chained commit with failing tests summons the boss, at the cost of reading git's text output (its format is git's, stable for years).
- The fixtures for chained commits are derived from the recorded format, not captured; a recording should replace them when one is made.
