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
The single map holding all of the Player's Regions, each an Island, as the Overview shows it. A Region joins the World the first time the Player plays in its project and stays there after, its project gone or not; Islands never move once placed.
_Avoid_: Game, universe

**Island**:
A Region as the World draws it: one of three sizes by how many Quests the Region holds, lit by the share of them cleared, the Region the Player is in marked. Choosing an Island opens that Region's map.
_Avoid_: Tile, node

**Region**:
One project's area of the World, shaped by that project's spec and named after its project's folder. Its map shows its Dungeons on open land, the Wilds among them, and Fog past the last of them.
_Avoid_: Level, zone, project map

**Region map**:
The pane that draws the Region the Player is in: its Dungeons to enter, the Wilds, and the Module view as a second view of the same pane. From it a Quest is started the way the Quest Board starts one. It never opens itself. Another Region's map, opened from the World, is drawn from its Snapshot and starts nothing.
_Avoid_: Minimap, level select

**Dungeon**:
One epic within a Region (a Jira ticket's parent, a GitHub milestone), drawn as Floors of Rooms; cleared when all its Quests are done.
_Avoid_: Epic (outside the Jira adapter), area

**Wilds**:
The part of a Region holding the Quests that belong to no Dungeon, drawn as camps on open land, and all of a Region whose Quest Source knows no epics. Its camps are Rooms in all but name.
_Avoid_: Backlog, unassigned, overworld

**Room**:
One Quest as a Dungeon draws it: dark when its ticket is still open, lit when cleared (its ticket closed in the Quest Source, or its Quest won here), showing its difficulty as the Scroll does. Choosing an open Room starts its Quest as Take Quest does.
_Avoid_: Cell, node

**Floor**:
Up to twenty Rooms of a Dungeon shown at once, joined by corridors; a Dungeon with more Quests has more Floors, stepped through in turn.
_Avoid_: Page, level

**Module view**:
The Region map's view of the project itself: a tile per Module, lit and named when the Player has discovered it, dark and nameless under Fog when not.
_Avoid_: Codebase map, file tree

**Snapshot**:
What the World remembers of a Region the Player is not in: its Dungeons by name with how many Quests each holds and how many are cleared, and when that was last true. Taken whenever the Region's map is drawn or a session starts in its project.
_Avoid_: Cache, sync

**Module**:
A part of a Region's project, as the Player explores it: the first two segments of the folder a read file is in, or of the folder searched, relative to the project's root (`src/engine`, `packages/api`; `.` for a file at the root). Nothing under a root-level `node_modules`, `.git`, `dist`, `build`, `target`, `vendor`, `.venv` or `coverage` is a Module. The first visit to a Module earns Wisdom XP (from the ambient XP pool) and counts toward the Cartographer Badge, once per Player per project: the Player keeps the Modules discovered in each project (a Region file kept by an older mod seeds them once).
_Avoid_: Package, directory (outside the event translator)

**Fog**:
The unrevealed part of a Region, a Dungeon or the Module view, drawn dark: the land past the last Dungeon and the Rooms past the last Quest, standing for work not yet planned, and the Modules the Player has not discovered.
_Avoid_: Fog of war, hidden tiles

## Quests

**Quest**:
One ticket, played as a run of Encounters ending in a Boss Fight.
_Avoid_: Ticket (outside a Quest Source), task, mission

**Quest Source**:
Where Quests come from: a Jira project or a repo's GitHub Issues, as the Region file's `questSource` names it (GitHub Issues when it names none and the project is a git repo with a remote). When it cannot be read, its problem is one kind, each with its own hint on the Quest Board: `missing` (gh not installed or on the PATH, the Atlassian connection not connected), `unauthenticated` (not signed in), `misconfigured` (the Region file not JSON, `questSource` wrong, Jira refusing the query or reaching no site), `none` (no `questSource` and no GitHub repo), `forbidden` (the account may not see the Jira project) or `unreachable` (anything else, gh unable to run on this surface among them).
_Avoid_: Tracker, backlog, provider

**Quest Log**:
The pane (`/quest`, `/quest <ticket>`) showing all the game knows of one Quest: its Scroll unrolled at full width, its ticket's whole description, the Quest Giver's briefing, and, for the Quest under way, its progress (Encounters, Questions, the Boss, XP earned by XP pool against each cap). It never opens itself.
_Avoid_: Ticket view, details pane

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
The Encounter a new file of at least 3 lines, or a major edit, plays, whatever made it: an Edit, a Write or a NotebookEdit, or a change seen in the working tree's diff (a Bash heredoc, a script, a subagent's edit), checked after a Bash call that may have changed files (at most every 15 seconds), before a commit and at every turn's end. The blacksmith forges an item named after the component, the file's name without its extension in words (`order-ledger.ts` forges the Order Ledger; an `index` file is named after its folder). A code-changing Encounter, as a Battle won is. The diff is git's: outside a git repo only the tools' edits are seen, and a file `.gitignore` ignores never counts. A change is played once, by whichever saw it first.
_Avoid_: Forging, file encounter

**Major edit**:
An edit (an Edit, a Write over an existing file, a NotebookEdit, a file changed in the working tree's diff) changing at least 10 lines of its diff, a line replaced counted once: the larger of the lines added and the lines removed. A near-complete rewrite is one too: lines added, at least 80% of the file's lines removed, and at least 3 lines changed. An Edit replacing every occurrence (`replace_all`, a rename) never is, though its change is still kept for the Boss Fight and a Battle's fix. A smaller edit plays no Encounter.
_Avoid_: Big change, large diff

**Party**:
The companions out during a Quest, counted on the HUD (`Party: 2 out`; a companion beside the count on the pixel strip). It pays no XP: sending agents out is Claude's activity, and what the companions' loops do (reads, Crafting, Battles) plays and pays as any work does.
_Avoid_: Team, squad, crew

**Companion**:
A subagent Claude starts during a Quest (a background or workflow agent too), as the party sees it: it sets out with the task's short description, the Scene showing it walk off, and comes back when its loop's turn ends, told in a toast counting what its loop played (`Implement issue #22: back. 12 read, 3 forged, 1 Battle won`). One whose agent stopped without ending its turn (killed, its session ended) leaves the party quietly at the next session start.
_Avoid_: Subagent (outside the event translator), helper, minion

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

**Briefing**:
The Quest Giver's two lines on a Quest just started, with one Question about the ticket itself (what done means, what is out of scope, where the change belongs), asked once per ticket and paid as a Sage Question. A ticket its Quest Source did not find has none.
_Avoid_: Intro, summary

**Scouting**:
The Cartographer's Question after every third Module discovered in a Quest, about how the Modules just read fit together (what imports what, where a name is defined, where a change belongs), answerable from the files read; paid as a Sage Question to Wisdom. A Module whose Scouting was answered right is **charted**.
_Avoid_: Architecture quiz, exploration question

**Prophecy**:
The Player's call, made after Claude edits a test file and before the next Check runs, of how that Check will end: Red (one failure), Green (passing) or Rout (two or more). A right call pays Dexterity XP from the prophecy XP pool; a wrong one costs nothing. Five right in a row earn the Oracle Badge; Dexterity as the highest Stat makes the Player a Duelist.
_Avoid_: Bet, prediction, wager

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
The band above the prompt showing the Player's level and Title, HP (or Exhausted), XP, Badge count, the active Quest, the session's vitals, and the Stats in play. Where the surface draws pixel art it is one strip of it: the Player's portrait (a plain adventurer until a Title, then a Scholar, Pathfinder or Warrior), the bars, and the Quest on a banner beside the current Encounter, calm but for a flash on damage and a fill on XP gained; in the terminal, and where the `hudStyle` setting says text, it is text, at most three rows of the band's width. When it is narrow the Quest's title shortens first, then the lesser parts give way.
_Avoid_: Status bar, header

**Overview**:
The pane (`/overview`) with the Player's character sheet, their portrait, level, Title, XP to the next level, all six Stats (those not in play dimmed), Badges and Trophies, and the World below it, an Island to choose per Region.
_Avoid_: Character sheet (the vision's word for its first half), profile, stats page

**Mana**:
The share of the session's context window used so far, shown on the HUD.
_Avoid_: Context meter, tokens bar
