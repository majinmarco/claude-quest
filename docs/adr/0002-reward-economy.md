# ADR 0002: The reward economy (XP, HP, Stats, levels, Badges)

- Status: Accepted
- Date: 2026-10-23
- Applies to: `dev` after 0f70194 (issues #4–#12 implemented)

## Context

The vision (§7a) and the MVP spec (stories 4–7, 36) say that understanding and reviewing the code is the biggest reward: "XP depends on accuracy, never on how many questions were answered". Before this decision the engine (`src/engine.ts`) paid rewards as below. The amounts were checked in the code.

| Source | Trigger | Amount | Stat credited | Cap | Risk |
|---|---|---|---|---|---|
| Exploration | every `FILE_READ` (Read/Grep/Glob by Claude) | 5 XP | none | **none**, in or out of a Quest | **Farming:** this is Claude's activity. 100–200 reads per implement run pays 500–1000 XP |
| Module discovery | first `FILE_READ` in a Module of this Region | +10 XP | none (the effect is tagged `wisdom`, but the Wisdom Stat never grew) | once per Module per Region. A monorepo with thousands of folders pays thousands | Wisdom Stat is dead; large-repo windfall |
| Crafting | new file or major edit | 10 XP | none | **none** | Write, revert and write again pays every time |
| Battle won | `TEST_PASS` on a Check with an open Battle | 10 × monster max HP | Strength | **none** | A 40-failure type-check pays 400 XP, more than a whole Boss Fight. A flaky check won with no edit pays too |
| Sage, right | `QUESTION_ANSWERED` correct | 20 XP | Intelligence (the Question's `stat` tag is ignored) | the Haiku budget, but see the replay | **Replay farm:** a cache hit (identical diff) re-queues a Question already answered at no Haiku cost. A known answer pays 20 XP each time |
| Sage, hasty | right in <5 s, ≥3 source lines | 5 XP | Intelligence | as above | fine |
| Sage, wrong | wrong option | −10 HP (floored at 0) | – | – | see HP |
| Boss, right | `BOSS_ANSWERED` correct | 20 XP | Intelligence | 3 Questions | fine |
| Boss, wrong | wrong option | −10 HP | – | – | see HP |
| Boss won | all Questions right | +100 XP and a badge `Bane of <ticket>'s Boss` | Intelligence | once per Quest | Badge names collide across projects (`#12` in every repo). Badges do nothing |
| Quest XP | `questXp(difficulty)` 25/50/100/200/400, Unrated 50 | shown on the Quest card | – | – | **Dead promise:** shown on the card, never paid |
| HP | starts 100/100 | – | – | – | **Dead end:** nothing heals it and 0 HP does nothing. After 10 lifetime wrong answers, guessing is free forever |
| Level curve | `xpToClear(L) = 100·L` | L2 at 100, L10 at 4,500 total | – | – | Far too fast with this income |

### One medium Quest before

The session: 40 reads across 8 new Modules, 3 Craftings, 2 Battles (3 HP and 1 HP), 4 Sage Questions all right and not hasty, 1 commit, Boss Fight 3/3.

| Source | XP | Share |
|---|---:|---:|
| Reads (40 × 5) | 200 | 33.9% |
| Discovery (8 × 10) | 80 | 13.6% |
| Crafting (3 × 10) | 30 | 5.1% |
| Battles (30 + 10) | 40 | 6.8% |
| Sage (4 × 20) | 80 | 13.6% |
| Boss answers (3 × 20) | 60 | 10.2% |
| Boss win | 100 | 16.9% |
| **Total** | **590** | |
| Understanding (Sage + Boss) | 240 | **40.7%** |
| Claude's activity (reads, discovery, crafting, Battles) | 350 | **59.3%** |

Reads alone paid more than the Sage and more than the whole Boss Fight. A realistic run has 150 reads, which pay 750 XP and push understanding under 20%. That breaks the vision. With `100·L`, this one Quest took a new Player to level 3, and level 10 arrived after about 8 Quests.

## Decision

### 1. Three XP pools per Quest, and understanding is the big one

XP from Claude's own activity is ambient. It trickles in and fills a small purse per Quest. Answers pay the most. A Quest keeps a counter for each pool (`Quest.pools`). Outside a Quest, the game keeps the same counters for the session (`GameState.pools`).

| Pool | Sources | Per Quest cap | Per session cap outside a Quest |
|---|---|---:|---:|
| `ambient` | read 1 XP; Module discovery 5 XP (Wisdom); Crafting 5 XP | 60 | 20 |
| `battle` | Battle won: 10 XP (Strength) × min(`firstHp`, 3), only when edits were made while it stood | 60 | 30 |
| `sage` | right answer 20 XP; hasty 5 XP; Stat from the Question's tag (below) | 200 (= the default budget × 20, so it only bites when the budget is raised) | 100 |
| uncapped | Boss right answer 30 XP; Boss win = the Quest reward; unfought Quest = ¼ of it | once per Quest by construction | – |

`firstHp` is the monster's HP at the Battle's first counted run (an uncounted monster pays as 1 HP). A Battle won with no edit made while it stood (a flaky check) changed no code and pays nothing.

Other rules:

- **Quest reward** is paid on a Boss win: the "Boss: +N XP" on the Quest card. By difficulty: Trivial 40, Easy 60, Medium 100, Hard 140, Epic 180, Unrated 80. Unrated sits in the middle, so repos without size labels or story points are not penalised and labelling doesn't change the reward much. The difficulty comes with `QUEST_START`: the hook looks it up from the Quest Board's listing and falls back to Unrated. When fewer than 3 Boss Questions could be made, the reward is scaled by `questionCount / 3`.
- **Flawless**: every Boss answer right and no wrong Sage answer during the Quest. It adds half the Quest reward.
- The Quest reward and its trophy are paid **at most once per (Region, ticket)** per Player, tracked by the trophies on the Player. A lost Boss Fight followed by a won rematch still pays, once.
- **Lost** Boss Fight: the right answers keep their 30 XP each. No Quest reward.
- **Skipped**: nothing (spec story 37).
- **Unfought** (no Haiku, budget 0, no diff): ¼ of the Quest reward, once per (Region, ticket) (`Player.unfought`) and never after the Quest was won. This is the graceful-degradation path, so Players without Haiku still progress slowly.
- **Replay rule:** a Question whose change key was already answered this session is not queued again (`GameState.answeredKeys`). A cache hit can never pay twice.
- A full pool doesn't stop the Encounter. It pays what it has left, then 0, and emits `XP_CAPPED {pool}` once per pool per Quest (per session outside a Quest), which the hook shows as a toast pointing to the Sage. A discovered Module still counts toward the Cartographer Badge.

The same medium Quest under these rules (both Battles won with a fix):

| Source | XP | Share |
|---|---:|---:|
| Ambient (40 reads + 8 discoveries × 5 + 3 × 5 = 95, capped) | 60 | 14.3% |
| Battles (3 HP → 30, 1 HP → 10) | 40 | 9.5% |
| Sage (4 × 20) | 80 | 19.0% |
| Boss answers (3 × 30) | 90 | 21.4% |
| Boss win (Medium) | 100 | 23.8% |
| Flawless (half the reward) | 50 | 11.9% |
| **Total** | **420** | |
| **Understanding** | **320** | **76.2%** |

An idle Player who never answers and skips the Boss Fight is capped at 120 XP per Quest, under a third of an engaged one. Raising the Haiku budget can't inflate XP past the `sage` pool.

### 2. Stats

- The MVP has three Stats: **Intelligence, Wisdom and Strength**. The other three stay at 0 and are not shown.
  - Intelligence: right answers tagged `intelligence` (or any Stat outside the MVP set), Boss answers, and the Quest reward.
  - Wisdom: right answers tagged `wisdom` (architecture), plus Module discovery.
  - Strength: Battles won.
- A Stat is the running total of XP earned by that kind of work. Stats **never** change difficulty (spec story 3) or XP.
- What Stats do:
  1. They give a **title**: from level 3, the Player's highest MVP Stat names them (a tie goes Intelligence, Wisdom, Strength). Intelligence is *Scholar*, Wisdom is *Pathfinder*, Strength is *Warrior*. From level 10 the title gets *Veteran* in front.
  2. The HUD shows them on a dim line.
- Recommended Stats on a Quest card stay guidance only. The "matching earns bonus XP" idea from the vision is deferred, because a running total always "matches".

### 3. HP

- Max HP is 100, fixed. A new Player starts at 100.
- Costs: a wrong Sage or Boss answer costs 10. Nothing else costs HP.
- Healing:
  - `QUEST_START` heals +25 (up to the max). The Quest that is running, or the one that just closed, started again (same ticket) doesn't heal.
  - A Boss win heals fully.
  - A `LEVEL_UP` heals fully.
- **0 HP = Exhausted.** This is not a game over. Wrong answers cost nothing more, and right answers (Sage and Boss) pay half, rounded down. The Quest reward on a Boss win is still paid in full, and the win heals, so the way out is always to play well. The HUD shows `Exhausted` in red. Nothing is ever blocked.

### 4. Level curve

`xpToClear(L) = 100 + 50·(L−1)²`. The Player keeps a lifetime `totalXp`. `level` and `xp` (XP into the current level) are derived from it and still stored, so the HUD reads them as before.

| Level | XP to clear | Total XP to reach next | Quests to reach next (~300 XP/Quest) |
|---:|---:|---:|---:|
| 1 → 2 | 100 | 100 | 0.3 |
| 2 → 3 | 150 | 250 | 0.8 |
| 3 → 4 | 300 | 550 | 1.8 |
| 4 → 5 | 550 | 1,100 | 3.7 |
| 5 → 6 | 900 | 2,000 | 6.7 |
| 6 → 7 | 1,350 | 3,350 | 11 |
| 7 → 8 | 1,900 | 5,250 | 17.5 |
| 8 → 9 | 2,550 | 7,800 | 26 |
| 9 → 10 | 3,300 | 11,100 | 37 |

- Level 2 arrives within the first Quest, even for an idle Player (120 XP).
- Level 10 takes about 26 Quests at a perfect Medium pace (420 XP) and about 37 at a typical one (300 XP), inside the 25–40 target.

**Migration:** a stored Player without `totalXp` gets `totalXp = Σ_{k<level} 100·k + xp` (the old curve), then its level is re-derived with the new curve. Pre-release Players may drop a few levels. This is accepted, and a toast explains it once. Max HP becomes 100, the tally is default-filled, and the old per-ticket badges become trophies with an unknown Region.

### 5. Badges and trophies (cross-project, on the Player)

Badges are a small, fixed set, each with a stable `id`, earned once. A pure `earnedBadges(player, context)` decides them from the Player's lifetime tally and what just happened.

| id | Name | Earned when |
|---|---|---|
| `first-blood` | First Blood | the first Battle won with a fix |
| `first-quest` | Questbound | the first Quest closed won, lost or unfought |
| `boss-slayer` | Boss Slayer | the first Boss Fight won |
| `flawless` | Flawless | a Boss Fight won Flawless (every Boss answer right, no wrong Sage answer in the Quest) |
| `dragon-slayer` | Dragon Slayer | a Battle won with a fix against a monster whose max HP was ≥20 |
| `cartographer` | Cartographer | 25 Modules discovered, lifetime, across Regions |
| `apprentice` | Sage's Apprentice | 25 right Sage answers that were not hasty, lifetime |
| `unbroken` | Unbroken | 5 Boss Fights won in a row (lost or skipped resets the streak; unfought doesn't) |
| `wayfarer` | Wayfarer | Quests closed (won, lost or unfought) in 3 different Regions |
| `second-wind` | Second Wind | a Boss Fight won while Exhausted |

- The per-ticket marks become **trophies**: a Boss Fight won earns `Bane of <region>#N` (`Bane of vault ABC-123` for a key without `#`), the Region being the folder name of the session's root. Trophies are how the Quest reward is paid once per (Region, ticket).
- Badges are shown as a toast (`BADGE_EARNED`), as a `★n` count on the HUD, and in the `/badges` text command with the trophies, title and Stats. The Quest Board header will list the trophy count.
- A full character sheet is v0.2.
- Badges pay no XP. They are bragging rights, which vision §4 says is what levels are for.

### 6. Settings

No new `userConfig`. Every economy number stays a constant:

- Levels and Badges should mean the same thing for every Player. Leaderboards and shareable sheets are on the roadmap.
- Settings that pay XP turn into farming knobs.
- The existing settings (Haiku budget, hasty threshold, non-trivial lines) stay. Raising the budget can't inflate XP past the `sage` pool; the setting's description says so.

## Consequences

- Understanding becomes about three quarters of a Quest's XP. Idle Claude activity is capped at 120 XP per Quest and 50 per session between Quests, so it can't level a Player.
- Every step still shows visible progress. Reads and Craftings tick XP until the purse is full, and the toast then points the Player at the Sage. The Scene, the Sage and the boss print the XP actually paid.
- The Quest card's XP reward is finally paid. It is the Boss win reward.
- Wisdom becomes a real Stat. Stats have a visible effect (title) and never touch difficulty.
- HP gets a loop: it is lost on guesses and healed by starting Quests, levelling and winning. 0 HP is a soft state, not a dead end.
- Existing Players are migrated and may drop levels. The test suite's XP and level numbers changed throughout.
- Risks:
  - Pools add state to the Quest and the game, which needs default-filling for games kept by older mods.
  - The Quest Board lookup for difficulty falls back to Unrated when the board was never listed. This is acceptable.
  - When the session's root can't be read the Region is unknown (null): rewards are then kept once per ticket among the Region-less ones, which is also where the trophies migrated from the old per-ticket badges sit.
  - A ticket verified not found (no Quest reward) needs the Quest details lookup, which comes in a later pass; until then such a Quest rewards as Unrated.
  - Two sessions running at once each save their copy of the Player; the last writer wins (unchanged by this decision).

## Changes

- Types: `Player.totalXp`, `tally`, `trophies`, `unfought`; `Badge.id`; `Quest.difficulty`, `pools`, `sageWrong`; `GameState.pools`, `answeredKeys`, `region`; `Battle.firstHp`; `BossFight.questionCount`, `reward`, `flawless`, `trophy`; the XP paid on each Encounter and answer.
- Game Engine: one `pay(state, pool, stat, amount)` for every payment; new effects `XP_CAPPED`, `HP_HEALED`, `TROPHY_EARNED`; `QUEST_START.difficulty` and `QUESTION_READY.key`; `earnedBadges`, `titleOf`, `trophyNameOf`, `bossRewardOf`, `levelOf`.
- Persistence: `migratePlayer`, used by every load.
- HUD: `Lv N <title>`, `Exhausted`, `★n`, the Stats line. `/badges`.
- Tests: pools, Battles, Questions and Stat tags, the Boss reward and the unfought share, HP and Exhaustion, the level table and migration, Badges and titles (`tests/economy.test.ts`).
- Later (#22): Crafting is detected from the diff, not only from the tool. After a Bash call that may have changed files (at most every 15 s), before a commit and at every turn's end (the main loop's and each subagent's), the working tree's diff against a per-session snapshot plays each changed file as the same `FILE_EDIT` an Edit plays (`source: 'diff'`), under the same Crafting rules, paid from the same `ambient` pool. A change an Edit or Write already played is taken into the snapshot, and the Question cache key is still the hash of the change, so the replay rule holds across both paths. Bash reads (`cat`, `sed -n`, `grep`, `rg`...) are `FILE_READ`s, at most 5 a call, from the same pool. Subagents are companions of a party, which pays nothing: spawning agents is Claude's activity. No new XP source.
- Later (after 240d668): the ticket lookup runs after QUEST_STARTED and settles the two risks above. A ticket its Quest Source did not find pays no Quest reward, unfought share included, and earns no trophy; a source that can't be reached rewards as Unrated. The lookup rates only a Quest started Unrated: a difficulty fixed at the start is never changed.
- Later (#18, [ADR 0004](0004-prophecy.md)): a fourth pool, `prophecy` (right Prophecies, 10 Dexterity XP each; 30 per Quest, 15 per session outside), the Oracle Badge, and Dexterity as the fourth Stat in play with the Duelist title; a tie goes Intelligence, Wisdom, Dexterity, Strength.
- Later (#19): the Quest Giver's Briefing Question is paid from the `sage` pool like a Sage answer, its Haiku call one of the Sage's per ticket. It points at the ticket, not at source lines, so the hasty rule counts it as non-trivial: right in under 5 s pays 5 XP, whatever its line count (none).
- Later (#20): the Cartographer's Scouting Question is paid the same way, to Wisdom, from the `sage` pool (non-trivial, pointing at a file and no lines); at most three a Quest and two a session outside, each one of the Sage's calls. A right answer charts its Modules, a mark that pays nothing.
