# Claude Quest

An RPG layer over AI-assisted coding in Claude Code: the player's real work (planning, implementing, reviewing) is played out as quests in a persistent world, so the player keeps reading and understanding the code being written.

## The player

**Player**:
The one system-wide character belonging to the human developer, carried across every project. Its level never affects difficulty.
_Avoid_: User, character, hero, profile

**Stat**:
One of six attributes of the Player (Intelligence, Wisdom, Dexterity, Strength, Charisma, Constitution), each standing for a real engineering skill: the running total of XP its kind of work earned. Four are in play (Intelligence, Wisdom, Dexterity, Strength); Stats never change difficulty.
_Avoid_: Attribute, skill

**Title**:
What the Player is called from level 3, by their highest Stat in play: Scholar (Intelligence), Pathfinder (Wisdom), Duelist (Dexterity), Warrior (Strength), a tie going in that order; `Veteran` in front from level 10. Shown on the HUD after the level.
_Avoid_: Class, rank

**XP pool**:
One of four purses a Quest pays its capped XP from (per session outside a Quest): `ambient` (reads, Module discovery, Crafting; 60 per Quest), `battle` (Battles won; 60), `sage` (the Sage's answers; 200) and `prophecy` (right Prophecies; 30). A full pool pays nothing more and says so once; the Boss Fight is uncapped.
_Avoid_: Cap, budget (that's the Haiku budget)

**Exhausted**:
The Player at 0 HP: wrong answers cost nothing more and right ones pay half, until a new Quest, a level-up or a Boss Fight won heals them. Never a game over; nothing is blocked.
_Avoid_: Dead, knocked out

## The world

**World**:
The single map holding all of the Player's Regions, each an Island, as the Overview shows it. A Region joins the World the first time the Player plays in its project and stays there after, its project gone or not; Islands never move once placed.
_Avoid_: Game, universe

**Island**:
A Region as the World draws it: one of three sizes by how many Quests its Snapshot holds (1 to 10, 11 to 40, more), lit by the share of them cleared, the Region the Player is in marked ("you are here"); a Region with no Snapshot yet is a small grey Island, not mapped yet. Two Regions of one folder name are told apart by their remote's owner/repo. A themed Region's Island is coloured by its Biome and named by its Theme, its folder's name beside it. Choosing an Island opens that Region's map.
_Avoid_: Tile, node

**Region**:
One project's area of the World, shaped by that project's spec and named after its project's folder (or by its Theme, the folder's name beside it). Its map shows its Dungeons on open land of its Biome, the Wilds among them, and Fog past the last of them.
_Avoid_: Level, zone, project map

**Region map**:
The pane (`/map`) that draws the Region the Player is in: its Dungeons to enter, the Wilds, and the Module view as a second view of the same pane. From it a Quest is started the way the Quest Board starts one. It never opens itself. Another Region's map, opened from the World, is drawn from its Snapshot and starts nothing.
_Avoid_: Minimap, level select

**Overworld**:
The Region map's first view: the Region's open land with a gate per Dungeon, a camp for the Wilds and Fog past the last of them, laid out from the Region's id and its Dungeons' keys so it is the same for every Player and every session. Choosing a gate or the camp opens its Floors.
_Avoid_: World (that's every Region), level select

**Dungeon**:
One epic within a Region (a Jira ticket's parent, never a subtask's; a GitHub milestone), drawn as Floors of Rooms in the walls and floors of its kind (`crypt`, `fortress`, `aqueduct`, `mine`, `library`, `tower`; `crypt` until its Theme chooses); cleared when all its Quests are done, and then it flies a banner.
_Avoid_: Epic (outside the Jira adapter), area

**Wilds**:
The part of a Region holding the Quests that belong to no Dungeon, drawn as camps on open land, and all of a Region whose Quest Source knows no epics. Its camps are Rooms in all but name.
_Avoid_: Backlog, unassigned, overworld (that is the whole Region's view)

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
What the World remembers of a Region the Player is not in: its Dungeons by name with how many Quests each holds and how many are cleared (and each one's Theme, kept when the Snapshot is taken again), and when that was last true. Taken whenever the Region's map is drawn or a session starts in its project.
_Avoid_: Cache, sync

**Biome**:
The land a Region is drawn on, as its Theme chose it: `meadow` (the land of every Region without a Theme), `forest`, `coast`, `desert`, `snow` or `swamp`, each a palette of the Region map's land and camps and of its Island.
_Avoid_: Terrain, tileset, climate

**Theme**:
A Region's name and Biome, or a Dungeon's name and kind, made by one Haiku call the first time it is drawn (a Region's map or Island, a Dungeon's Floors) and kept for ever in the registry: never needed to draw anything, counted against no Haiku budget, skipped when Haiku is unavailable and asked again next session when its reply is unusable. A themed name is always shown with the real one beside it.
_Avoid_: Skin, flavour, style

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
The pane (`/quest` for the Quest under way, `/quest #N` or `/quest ABC-123` for any ticket) showing all the game knows of one Quest: its Scroll unrolled at full width with the ticket's link, its ticket's whole description (a GitHub issue's as Markdown, a Jira one's as plain text; cut at 8000 characters), the Quest Giver's Briefing once there is one, and, for the Quest under way, its progress (when it started and was taken up again, Encounters, Questions right and wrong, the Boss, XP earned by XP pool against each cap); for a Quest not under way, Take Quest while its ticket is open and its runs in the Region file. A ticket is fetched once per session, shared with the Ticket lookup. It never opens itself: `/quest`, the Quest Board's Read more and the Quest Log Button heading the Sage's and the boss's panes open it.
_Avoid_: Ticket view, details pane

**Quest Board**:
The view listing the available Quests of the current Region, from which the Player starts one: a card per ticket, each a Scroll, six to a page, under a red ribbon and a header of the Player's trophies and Badges. Take Quest on a card fills the prompt with the session's implement command in one click, never over a draft the Player is writing; Unroll beside it opens the Scroll, and Read more its Quest Log. It says `200+` when its listing reached the cap, and how to rate Quests when none is.
_Avoid_: Ticket list, backlog view

**Scroll**:
A Quest card as the Quest Board draws it: pixel art where the surface draws SVG (Kenney's UI Pack rollers and gems, lettered in Kenney Mini), a frame of text in the terminal (`◖═══◗` rollers, `│ … │` paper, `◆◇` pips). Rolled, it shows the ticket, the title cut to fit and the difficulty as five gems (Unrated: a `?` alone, no gems); unrolled, the title whole (up to three lines), the first 300 characters of its description as plain text, the Quest reward, recommended Stats, status, tags and Dungeon. One Scroll is unrolled at a time; it unrolls once, animated, as it opens.
_Avoid_: Card art, tile

**Tag**:
A ticket's triage label (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), shown on its Quest card beside its status; the Quest Board's status filter steps through statuses and tags alike, and the Quests' Dungeons after them. A GitHub issue, which has no status of its own, takes its first as its status.
_Avoid_: Label (outside a Quest Source)

**Ticket lookup**:
After a Quest starts, its ticket is looked up in the Quest Source, unawaited (or taken from the Quest Log's fetch of it this session): its title (shown on the HUD), its description as plain text for Haiku and whole for the Quest Log, its difficulty when it started Unrated, and whether it was found. A ticket not found runs Unrated and pays no Quest reward (said in a toast); a Quest Source that cannot be reached leaves the Quest and its reward as they were (tried again when the ticket is started again).
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
_Avoid_: Helper, minion, sidekick

**Check**:
A test run, lint or type-check, read from a Bash command by its runner (vitest, jest, pytest, bun test, tsc, eslint, biome, ruff, or a package's test, lint or typecheck script) and kept as the command to rerun it, launchers, environment and output-only flags (`-q`, `-v`, `--verbose`, `--silent`, `--no-color`, `--color=…`, `--reporter…`) left out, so `vitest run -q` and `vitest run` are one Check. A Battle is against one Check.
_Avoid_: Test suite, job (outside the event translator)

**Scene**:
The pane that plays the current Encounter: animated pixel art where the surface draws it, one line of text in the terminal. It opens itself at most once per session, when a surface that draws its art is there, unless the `autoOpenScene` setting is off; `/scene` opens it any time. The Quest Board never opens itself.
_Avoid_: Encounter view, animation pane

**Sound cue**:
The short clip a game event plays (a horn for a Quest started, a growl for a monster spawned, a fanfare for a Boss Fight won), one per event, from the mod's own CC0 sounds, at the `soundVolume` setting (0 is off). Decoration only: a Sound cue never pays, gates or waits for anything, and one that cannot play is skipped. The same cue never plays over itself, a Battle's hits coalesce to one a second, and at most six play in ten seconds, the lowest priority dropped first (the boss, the fanfare, a level-up, a defeat and a Badge never are). Headless, none plays.
_Avoid_: Sound effect, SFX, jingle (one kind of clip)

**Boss Fight**:
The code-review challenge that ends a Quest, built from the Quest's actual diff: the first commit Claude makes during a Quest summons it (a commit chained before a command that failed too, read from git's summary line), up to three review Questions about that commit's diff (the Quest's own changes when git cannot show it, unless the commit was read from a failed command). Every Question is asked. The boss has two thirds of them in HP, rounded up (2 HP for 3 Questions): a right answer earns Intelligence XP, uncapped, and hits the boss while it stands; once it has fallen, the Questions left are finishing blows, paid the same. A wrong one costs HP; at 0 HP the Player fights on, Exhausted. When the Questions run out the boss fallen is a win (2 of 3): the Quest reward and a Trophy, and a full heal; the boss standing is a loss; the Player may skip it. A Quest that could have no Boss Fight pays a quarter of its reward. However it ends, the Quest closes, its outcome in the Region file (won, lost, skipped, or unfought when no Boss Fight could be made).
_Avoid_: Final review, boss battle

**Quest reward**:
The XP a Quest's Boss Fight won pays, by its ticket's difficulty alone (Trivial 40 to Epic 180, Unrated 80), shown on its Quest card, scaled down when fewer than three Questions could be made; half again when Flawless (every Boss answer right, finishing blows included, and no wrong Sage answer in the Quest). Paid once per Region and ticket, and never for a ticket its Quest Source did not find: such a Quest earns no Badge and counts for nothing toward the tally or the Boss streak either.
_Avoid_: Bounty, Quest XP

**Badge**:
One of a small, fixed set of feats on the Player, each earned once and kept across projects (First Blood, Questbound, Boss Slayer, Flawless, Dragon Slayer, Cartographer, Sage's Apprentice, Unbroken, Wayfarer, Second Wind, Oracle). Badges pay no XP; `/badges` lists them.
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

**Quest Giver**:
The NPC who hands the Player a Quest just started: their Briefing, then a Question about the ticket, asked in the dialogue box with their own portrait (a grey-haired elder) and name, answered with `/sage` like any.
_Avoid_: Narrator, quest master

**Briefing**:
The Quest Giver's two lines (200 characters at most) on a Quest just started, with one Question about the ticket itself (what done means, what is out of scope, where the change belongs), made by one Haiku call once the Ticket lookup finds the ticket with a summary. It is one of the Sage's calls for that ticket (none when `sageCallsPerQuest` is 0), cached by ticket and summary so a ticket started again costs none, and its Question, pointing at the ticket rather than at lines, is paid as a Sage Question (non-trivial, so the hasty rule holds). Its first line shows in a toast and on the Scene until the Quest's first Encounter; the Quest Log shows it whole. A ticket its Quest Source did not find, or with no description, has none.
_Avoid_: Intro, summary

**Cartographer**:
The NPC who maps the code: they ask the Scoutings, in the dialogue box with their own portrait (a traveller in purple) and name, answered with `/sage` like any. Not to be confused with the Cartographer Badge, which counts Modules discovered.
_Avoid_: Mapper, guide

**Scouting**:
The Cartographer's Question about how the Modules just read fit together (what imports what, where a name is defined, where a change belongs), made by one Haiku call at the third, sixth and ninth Module discovered in a Quest, and outside one at every fifth, twice a session at most (one skipped, over budget or with nothing to show, still counts). Haiku is shown the three Modules discovered last, the files read in them (paths only, 12 at most) and the import and export lines of three of them (60 lines in all), never whole files; its Question must point at one of those files, so the Player can open it, and a reply naming any other is skipped. It is one of the Sage's calls (per ticket in a Quest, the session's allowance outside; none when that is 0), cached by the Modules and those lines, and paid as a Sage Question to Wisdom (non-trivial, so the hasty rule holds).
_Avoid_: Architecture quiz, exploration question

**Charted**:
A Module whose Scouting the Player answered right (hasty or not): a mark, not XP, kept per Player and project beside the Modules discovered, and listed in `/badges` under the Cartographer Badge's progress.
_Avoid_: Mapped, mastered

**Prophecy**:
The Player's call, made after Claude writes or edits a test file and before the next Check runs, of how that Check will end: Red (one failure, or failures it counts none of), Green (passing) or Rout (two or more). It can be called until the next Check starts, and that Check, of any kind, settles it, not only the one the test belongs to; another test edit before the call replaces it, and a new Quest or the Quest closing clears it. A right call pays 10 Dexterity XP from the prophecy XP pool; a wrong one costs nothing; one never called pays nothing. Five right in a row (one never called or never settled breaking nothing) earn the Oracle Badge; Dexterity as the highest Stat makes the Player a Duelist. Called with the HUD's Buttons (`1 Red`, `2 Green`, `3 Rout`) or `/prophecy`.
_Avoid_: Bet, prediction, wager

**Test file**:
A file whose edit arms a Prophecy: named `*.test.*`, `*.spec.*`, `test_*.py` or `*_test.go`, or lying under a `tests/`, `test/`, `__tests__/` or `spec/` folder below the project's root.
_Avoid_: Test suite (that is a Check), spec (outside a file name)

**Content Generator**:
What asks Haiku for a Question about a change and checks the reply against the contract; a reply that breaks it is skipped, never queued.
_Avoid_: Question generator, LLM client

**Hasty answer**:
A right answer given quicker than a non-trivial Question can be read: under 5 seconds from when it was shown, to a Question pointing at 3 source lines or more (both settings). A right answer to a non-trivial Question never recorded as shown is hasty too. It earns a quarter of the XP.
_Avoid_: Fast answer, guess

**Haiku budget**:
How many Haiku calls the game may make for Questions, per ticket for the session (a Theme counts against none of it): 10 for the Sage (the Quest Giver's Briefing and the Cartographer's Scoutings among them) and 3 for the Boss Fight, each counted apart, kept when the Quest closes or another replaces it (starting a ticket again does not refill it) and fresh in a new session; between Quests, 5 for the Sage per session (Scoutings among them). Over budget a Question is skipped, never failed. A Question reused from the cache, for an identical diff, costs nothing; a call failing for a passing reason (rate limited, overloaded) is given back. When Haiku is not available on the account, Questions are off for the session, told once. The limits are settings, in `/config`; 0 disables Questions.
_Avoid_: Quota, rate limit

**Question cache**:
The Questions the Sage made, kept by a hash of the change they are about (each file's path and diff), so an identical diff reuses its Question instead of calling Haiku. It holds the latest 50, for the session, surviving a reload of the mod.
_Avoid_: Memo, store

**Question Queue**:
The Questions waiting for the Player, each naming the NPC who asks it (the Sage, the Quest Giver, the Cartographer); they never interrupt the session, the Player answers them when they choose, in the dialogue box (`/sage`), which takes the asking NPC's portrait and name. The HUD counts them.
_Avoid_: Inbox, backlog

## The HUD

**HUD**:
The band above the prompt showing the Player's level and Title, HP (or Exhausted), XP, Badge count, the active Quest, a Prophecy armed (its three Buttons until called, then the call, dim), the session's vitals, and the Stats in play (`INT · WIS · DEX · STR`). Where the surface draws pixel art it is one strip of it: the Player's portrait (a plain adventurer until a Title, then a Scholar, Pathfinder or Warrior; a Duelist has none of its own yet), the bars, and the Quest on a banner beside the current Encounter, calm but for a flash on damage and a fill on XP gained; in the terminal, and where the `hudStyle` setting says text, it is text, at most three rows of the band's width. When it is narrow the Quest's title shortens first, then the lesser parts give way.
_Avoid_: Status bar, header

**Overview**:
The pane (`/overview`) with the Player's character sheet, their portrait, level, Title, XP to the next level, all six Stats (those not in play dimmed), every Badge (those not earned dimmed), Trophies by Region and the tally, and the World below it, a numbered Button per Island (nine a page). `/badges` prints the sheet as text; in the terminal the World is a grid of characters.
_Avoid_: Character sheet (the vision's word for its first half), profile, stats page

**Mana**:
The share of the session's context window used so far, shown on the HUD.
_Avoid_: Context meter, tokens bar
