# Claude Quest

An RPG layer over AI-assisted coding in Claude Code: the player's real work (planning, implementing, reviewing) is played out as quests in a persistent world, so the player keeps reading and understanding the code being written.

## The player

**Player**:
The one system-wide character belonging to the human developer, carried across every project. Its level never affects difficulty.
_Avoid_: User, character, hero, profile

**Stat**:
One of six attributes of the Player (Intelligence, Wisdom, Dexterity, Strength, Charisma, Constitution), each standing for a real engineering skill: the running total of XP its kind of work earned. Three are in play (Intelligence, Wisdom, Strength); Stats never change difficulty.
_Avoid_: Attribute, skill

**Title**:
What the Player is called from level 3, by their highest Stat in play: Scholar (Intelligence), Pathfinder (Wisdom), Warrior (Strength); `Veteran` in front from level 10. Shown on the HUD after the level.
_Avoid_: Class, rank

**XP pool**:
One of three purses a Quest pays its capped XP from (per session outside a Quest): `ambient` (reads, Module discovery, Crafting; 60 per Quest), `battle` (Battles won; 60) and `sage` (the Sage's answers; 200). A full pool pays nothing more and says so once; the Boss Fight is uncapped.
_Avoid_: Cap, budget (that's the Haiku budget)

**Exhausted**:
The Player at 0 HP: wrong answers cost nothing more and right ones pay half, until a new Quest, a level-up or a Boss Fight won heals them. Never a game over; nothing is blocked.
_Avoid_: Dead, knocked out

## The world

**World**:
The single map holding all of the Player's Regions.
_Avoid_: Game, universe

**Region**:
One project's area of the World, shaped by that project's spec.
_Avoid_: Level, zone, project map

**Dungeon**:
One epic within a Region; cleared when all its Quests are done.
_Avoid_: Epic (outside the Jira adapter), area

**Module**:
A part of a Region's project, as the Player explores it: the first two segments of the folder a read file is in, or of the folder searched, relative to the project's root (`src/engine`, `packages/api`; `.` for a file at the root). Nothing under a root-level `node_modules`, `.git`, `dist`, `build`, `target`, `vendor`, `.venv` or `coverage` is a Module. The first visit to a Module earns Wisdom XP (from the ambient XP pool) and counts toward the Cartographer Badge, once per Player per project: the Player keeps the Modules discovered in each project (a Region file kept by an older mod seeds them once).
_Avoid_: Package, directory (outside the event translator)

**Fog**:
The unrevealed part of a Region or Dungeon, standing for work not yet planned.
_Avoid_: Fog of war, hidden tiles

## Quests

**Quest**:
One ticket, played as a run of Encounters ending in a Boss Fight.
_Avoid_: Ticket (outside a Quest Source), task, mission

**Quest Source**:
Where Quests come from: a Jira project or a repo's GitHub Issues, as the Region file's `questSource` names it (GitHub Issues when it names none and the project is a git repo with a remote). When it cannot be read, its problem is one kind, each with its own hint on the Quest Board: `missing` (gh not installed or on the PATH, the Atlassian connection not connected), `unauthenticated` (not signed in), `misconfigured` (the Region file not JSON, `questSource` wrong, Jira refusing the query or reaching no site), `none` (no `questSource` and no GitHub repo), `forbidden` (the account may not see the Jira project) or `unreachable` (anything else, gh unable to run on this surface among them).
_Avoid_: Tracker, backlog, provider

**Quest Board**:
The view listing the available Quests of the current Region, from which the Player starts one: a card per ticket, each a Scroll, six to a page, under a red ribbon and a header of the Player's trophies and Badges. Take Quest on a card fills the prompt with the session's implement command in one click, never over a draft the Player is writing; Unroll beside it opens the Scroll. It says `200+` when its listing reached the cap, and how to rate Quests when none is.
_Avoid_: Ticket list, backlog view

**Scroll**:
A Quest card as the Quest Board draws it: pixel art where the surface draws SVG (Kenney's UI Pack rollers and gems, lettered in Kenney Mini), a frame of text in the terminal (`◖═══◗` rollers, `│ … │` paper, `◆◇` pips). Rolled, it shows the ticket, the title cut to fit and the difficulty as five gems (Unrated: a `?` alone, no gems); unrolled, the title whole (up to three lines), the Quest reward, recommended Stats, status and tags. One Scroll is unrolled at a time; it unrolls once, animated, as it opens.
_Avoid_: Card art, tile

**Tag**:
A ticket's triage label (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), shown on its Quest card beside its status; the Quest Board's status filter steps through statuses and tags alike. A GitHub issue, which has no status of its own, takes its first as its status.
_Avoid_: Label (outside a Quest Source)

**Ticket lookup**:
After a Quest starts, its ticket is looked up in the Quest Source, unawaited: its title (shown on the HUD), its description as plain text for Haiku, its difficulty when it started Unrated, and whether it was found. A ticket not found runs Unrated and pays no Quest reward (said in a toast); a Quest Source that cannot be reached leaves the Quest and its reward as they were (tried again when the ticket is started again).
_Avoid_: Sync

**Region file**:
A project's `.claude/claude-quest.json`: its `questSource` and its Quest history, one record per run of a Quest: its ticket, `startedAt`, `status` (`active`, `abandoned`, or how its Boss Fight closed it), `endedAt`, the `sessionId` that started it or took it up again, and `resumedAt`. Starting a ticket whose latest run is still active takes that run up again; a session starting marks runs left active for over 7 days abandoned.
_Avoid_: Save file, config

**Encounter**:
A game moment produced by real session activity during a Quest (Exploration, Battle, Crafting, Puzzle, Trap, Rest).
_Avoid_: Event (that's the raw session activity), scene

**Battle**:
The Encounter a failing Check plays: a monster (a bug for tests, a slime for lint, a ghost for type errors) whose HP is the failures the Check counts, or one HP when its output counts none readable. The first counted run after such a one-HP placeholder spawns the monster again at its count. The next run of the same Check failing fewer lands a hit per failure gone; the Check passing wins, for Strength XP by the monster's HP at its first counted run (three HP at most, from the battle XP pool), only when edits were made while it stood. A new Quest (for another ticket) and a Quest closing clear the Battles under way, paying nothing.
_Avoid_: Fight, test encounter

**Crafting**:
The Encounter a new file of at least 3 lines, or a major edit, plays: the blacksmith forges an item named after the component, the file's name without its extension in words (`order-ledger.ts` forges the Order Ledger; an `index` file is named after its folder). A code-changing Encounter, as a Battle won is.
_Avoid_: Forging, file encounter

**Major edit**:
An edit (an Edit, a Write over an existing file, a NotebookEdit) changing at least 10 lines of its diff, a line replaced counted once: the larger of the lines added and the lines removed. A near-complete rewrite is one too: lines added, at least 80% of the file's lines removed, and at least 3 lines changed. An Edit replacing every occurrence (`replace_all`, a rename) never is, though its change is still kept for the Boss Fight and a Battle's fix. A smaller edit plays no Encounter.
_Avoid_: Big change, large diff

**Check**:
A test run, lint or type-check, read from a Bash command by its runner (vitest, jest, pytest, bun test, tsc, eslint, biome, ruff, or a package's test, lint or typecheck script) and kept as the command to rerun it, launchers, environment and output-only flags (`-q`, `-v`, `--verbose`, `--silent`, `--no-color`, `--color=…`, `--reporter…`) left out, so `vitest run -q` and `vitest run` are one Check. A Battle is against one Check.
_Avoid_: Test suite, job (outside the event translator)

**Scene**:
The pane that plays the current Encounter: animated pixel art where the surface draws it, one line of text in the terminal. It opens itself at most once per session, when a surface that draws its art is there, unless the `autoOpenScene` setting is off; `/scene` opens it any time. The Quest Board never opens itself.
_Avoid_: Encounter view, animation pane

**Boss Fight**:
The code-review challenge that ends a Quest, built from the Quest's actual diff: the first commit Claude makes during a Quest summons it (a commit chained before a command that failed too, read from git's summary line), up to three review Questions about that commit's diff (the Quest's own changes when git cannot show it, unless the commit was read from a failed command). Every Question is asked. The boss has two thirds of them in HP, rounded up (2 HP for 3 Questions): a right answer earns Intelligence XP, uncapped, and hits the boss while it stands; once it has fallen, the Questions left are finishing blows, paid the same. A wrong one costs HP; at 0 HP the Player fights on, Exhausted. When the Questions run out the boss fallen is a win (2 of 3): the Quest reward and a Trophy, and a full heal; the boss standing is a loss; the Player may skip it. A Quest that could have no Boss Fight pays a quarter of its reward. However it ends, the Quest closes, its outcome in the Region file (won, lost, skipped, or unfought when no Boss Fight could be made).
_Avoid_: Final review, boss battle

**Quest reward**:
The XP a Quest's Boss Fight won pays, by its ticket's difficulty alone (Trivial 40 to Epic 180, Unrated 80), shown on its Quest card, scaled down when fewer than three Questions could be made; half again when Flawless (every Boss answer right, finishing blows included, and no wrong Sage answer in the Quest). Paid once per Region and ticket, and never for a ticket its Quest Source did not find: such a Quest earns no Badge and counts for nothing toward the tally or the Boss streak either.
_Avoid_: Bounty, Quest XP

**Badge**:
One of a small, fixed set of feats on the Player, each earned once and kept across projects (First Blood, Questbound, Boss Slayer, Flawless, Dragon Slayer, Cartographer, Sage's Apprentice, Unbroken, Wayfarer, Second Wind). Badges pay no XP; `/badges` lists them.
_Avoid_: Achievement, trophy

**Trophy**:
The mark a Boss Fight won leaves on the Player, named after its Region and Quest (`Bane of claude-quest#12`): one per Region and ticket, which is how the Quest reward is paid once.
_Avoid_: Badge, loot

## Learning

**NPC**:
A persona (Sage, Cartographer, Merchant, Rival, Scribe, Quest Giver) that speaks to the Player and delivers Questions. A Boss Fight's boss asks its review Questions too, though it is the Quest's foe rather than an NPC.
_Avoid_: Character, bot

**Question**:
A comprehension challenge tied to specific lines of code the Player can see: four options, one right, a one-sentence explanation and a Stat tag. The Sage asks one after each code-changing Encounter, about its change (a Crafting's file, or the edits that won a Battle), with the Quest's ticket title and summary as context. A Question is shown before it is answered: the Sage's pane drawing it, or `/sage`, starts its time, and `/sage A` on a Question never shown shows it instead of answering. A right answer earns XP to its Stat tag, Wisdom for `wisdom` and Intelligence otherwise (a quarter of it when hasty, half when Exhausted, from the sage XP pool), a wrong one costs HP; both show the explanation. A Question about a change already answered, or waiting, that session is not asked again.
_Avoid_: Quiz, prompt

**Content Generator**:
What asks Haiku for a Question about a change and checks the reply against the contract; a reply that breaks it is skipped, never queued.
_Avoid_: Question generator, LLM client

**Hasty answer**:
A right answer given quicker than a non-trivial Question can be read: under 5 seconds from when it was shown, to a Question pointing at 3 source lines or more (both settings). A right answer to a non-trivial Question never recorded as shown is hasty too. It earns a quarter of the XP.
_Avoid_: Fast answer, guess

**Haiku budget**:
How many Haiku calls the game may make, per ticket for the session: 10 for the Sage and 3 for the Boss Fight, each counted apart, kept when the Quest closes or another replaces it (starting a ticket again does not refill it) and fresh in a new session; between Quests, 5 for the Sage per session. Over budget a Question is skipped, never failed. A Question reused from the cache, for an identical diff, costs nothing; a call failing for a passing reason (rate limited, overloaded) is given back. When Haiku is not available on the account, Questions are off for the session, told once. The limits are settings, in `/config`; 0 disables Questions.
_Avoid_: Quota, rate limit

**Question cache**:
The Questions the Sage made, kept by a hash of the change they are about (each file's path and diff), so an identical diff reuses its Question instead of calling Haiku. It holds the latest 50, for the session, surviving a reload of the mod.
_Avoid_: Memo, store

**Question Queue**:
The Questions waiting for the Player; they never interrupt the session, the Player answers them when they choose, in the Sage's dialogue box (`/sage`). The HUD counts them.
_Avoid_: Inbox, backlog

## The HUD

**HUD**:
The band above the prompt showing the Player's level and Title, HP (or Exhausted), XP, Badge count, the active Quest, the session's vitals, and the Stats in play. At most three rows of the band's width: when it is narrow the Quest's title shortens first, then the lesser parts give way.
_Avoid_: Status bar, header

**Mana**:
The share of the session's context window used so far, shown on the HUD.
_Avoid_: Context meter, tokens bar
