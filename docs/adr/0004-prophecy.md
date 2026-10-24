# ADR 0004: Prophecy, and Dexterity in play

- Status: Accepted
- Date: 2026-10-24
- Applies to: `dev` after 46a1ee4 (issue #18); extends ADR 0002's economy

## Context

Test-first work is the quietest stretch of a Quest. Claude writes a test meant to fail and runs it, and the Player has nothing to do until the Sage's first Question, which comes only after the first code change. The vision (§7a) lists "predict a failing test before it runs" as a skill achievement. Issue #18 makes it a Prophecy: when Claude writes or edits a test file, the Player calls how the next Check will end, **Red** (one failure), **Green** (passing) or **Rout** (two or more), and the Check settles the call.

Three choices needed a reason: what a wrong call costs, how much a right one pays, and which Check settles it.

## Decision

- **A test file** is one named `*.test.*`, `*.spec.*`, `test_*.py` or `*_test.go`, or one under a `tests/`, `test/`, `__tests__/` or `spec/` folder **below the project's root** (`isTestFile` in `src/translate.ts`). Folders above the root don't count, so a project kept in `~/test/` is not all tests. Without a root, only the name counts. Every FILE_EDIT of a test file is followed by `TEST_FILE_EDITED { path, at }`, which arms the Prophecy. This happens in the hook's `play()`, which every event goes through, so it doesn't matter what saw the change: a Write, Edit or NotebookEdit today, or a change read from `git diff` after a Bash call (#22). A relative path, as git names a change, is read from the project.
- **Arming.** Arming again replaces a Prophecy the Player hasn't called yet. Once called, it stays until its Check. A Prophecy is armed between Quests too and paid from the session's pool, as Battles are. A new Quest and a Quest closing clear it silently, as they clear Battles.
- **Settling: the next Check, of any kind.** The next `TEST_PASS` or `TEST_FAIL` settles it: passed is Green; one failure, or a failure whose output counts none (the one-HP placeholder), is Red; two or more is Rout. Calls close when a Check **starts**. `CHECK_STARTED` is read from the Bash call before it runs, and a Prophecy not yet called goes away silently then, with nothing paid and the streak untouched. A slow suite's output can't be watched and then called. A Prophecy already called waits for the Check to end.
  - Why the next Check rather than the matching one: the mod can't tell which Check covers a given test file. A test run may filter by name, a script may run several runners, and a type-check or a lint may come first. Any matching rule would be a guess that silently leaves Prophecies hanging. "The next Check" is a rule the Player can see and plan around: they call what they expect Claude to run next. A lint between the edit and the test run settles it too. That is the price of a rule that is always true.
- **A wrong call costs nothing.** No HP is lost, nothing is paid, and the Oracle streak resets. HP is the price of a wrong *answer* about code the Player could read (ADR 0002 §3). A Prophecy is a call made before the fact, about an outcome nobody can know for sure. Charging HP for it would make the safe choice not calling at all, which defeats the point of giving the Player something to do. No hasty rule either: there is nothing to read.
- **The pool is small.** A right call pays `PROPHECY_XP` = 10 Dexterity XP from a new `prophecy` XP pool: 30 per Quest, 15 per session outside a Quest. So at most three paid Prophecies per Quest. Past the cap, calls pay 0 but still count for the streak, and `XP_CAPPED {pool: 'prophecy'}` is told once.
  - Why small: a three-way call can be guessed (a test written to fail is usually Red). Even a Player who always calls Red can't earn more than 30 XP a Quest from Prophecies, under the ambient pool (60) and far under the Sage's (200). Understanding the code stays the big reward (ADR 0002 §1). The full payment is not halved when the Player is Exhausted: the Prophecy is a skill feat, as a Battle won is, not an answer.
- **Oracle Badge:** five right Prophecies in a row (`Tally.prophecyStreak`). A wrong one resets the streak; one never called, or never settled, leaves it as it was.
- **Dexterity in play.** Dexterity becomes the fourth Stat in play. The Title for it as the highest Stat is **Duelist**. A tie goes Intelligence, Wisdom, Dexterity, Strength, the order of the HUD's Stats line `INT · WIS · DEX · STR`. Duelist has no portrait of its own yet; it shows the plain adventurer.
- **UI.** While a Prophecy is armed and uncalled, the HUD band shows three Buttons, `1 Red`, `2 Green`, `3 Rout`, on hotkeys `1`, `2`, `3`. A bare digit in an empty prompt presses a band Button. Once called, the band shows `Prophecy: Red`, dim, until the Check settles it. Then a toast says `Prophecy fulfilled: Red (+10 DEX)` or `Prophecy failed: it was Green`. `/prophecy red|green|rout` does the same from the prompt. The pixel strip draws the Prophecy's state (a dagger and `Prophecy: call it`, or the call, dim). The Buttons sit beside the strip, because an `Svg` element can't hold a Button or take a press.

## Consequences

- The quiet stretch of test-first work now has a choice the Player makes in one keystroke, worth little XP but building toward a Badge.
- A Check that never comes leaves the Prophecy unsettled and paying nothing until the next Check, a new Quest or the Quest's close.
- New state: `GameState.prophecy`, `Tally.prophecyStreak` (optional, read as 0), a fourth pool counter. Pool counters kept by an older mod lack `prophecy` and are read as 0.
- Events `TEST_FILE_EDITED`, `PROPHECY_MADE`, `CHECK_STARTED`; effects `PROPHECY_ARMED`, `PROPHECY_SETTLED`.
