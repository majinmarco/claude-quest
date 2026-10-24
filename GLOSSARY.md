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
A folder of a Region's project, as the Player explores it: the folder a read file is in, or the folder searched, relative to the project's root (`.` for the root itself). The first visit to a Module earns Wisdom XP (from the ambient XP pool) and counts toward the Cartographer Badge; the Region file keeps the Modules discovered.
_Avoid_: Package, directory (outside the event translator)

**Fog**:
The unrevealed part of a Region or Dungeon, standing for work not yet planned.
_Avoid_: Fog of war, hidden tiles

## Quests

**Quest**:
One ticket, played as a run of Encounters ending in a Boss Fight.
_Avoid_: Ticket (outside a Quest Source), task, mission

**Quest Source**:
Where Quests come from: a Jira project or a repo's GitHub Issues.
_Avoid_: Tracker, backlog, provider

**Quest Board**:
The view listing the available Quests of the current Region, from which the Player starts one.
_Avoid_: Ticket list, backlog view

**Encounter**:
A game moment produced by real session activity during a Quest (Exploration, Battle, Crafting, Puzzle, Trap, Rest).
_Avoid_: Event (that's the raw session activity), scene

**Battle**:
The Encounter a failing Check plays: a monster (a bug for tests, a slime for lint, a ghost for type errors) whose HP is the failures the Check counts, or one HP when its output counts none readable. The next run of the same Check failing fewer lands a hit per failure gone; the Check passing wins, for Strength XP by the monster's HP at its first counted run (three HP at most, from the battle XP pool), only when edits were made while it stood.
_Avoid_: Fight, test encounter

**Crafting**:
The Encounter a new file or a major edit plays: the blacksmith forges an item named after the component, the file's name without its extension in words (`order-ledger.ts` forges the Order Ledger; an `index` file is named after its folder). A code-changing Encounter, as a Battle won is.
_Avoid_: Forging, file encounter

**Major edit**:
An edit (an Edit, a Write over an existing file, a NotebookEdit) changing at least 10 lines of its diff, a line replaced counted once: the larger of the lines added and the lines removed. A near-complete rewrite is one too, however small the file: lines added, and at least 80% of the file's lines removed. A smaller edit plays no Encounter.
_Avoid_: Big change, large diff

**Check**:
A test run, lint or type-check, read from a Bash command by its runner (vitest, jest, pytest, bun test, tsc, eslint, biome, ruff, or a package's test, lint or typecheck script) and kept as the command to rerun it, launchers and environment left out (`vitest run`, `npm test`). A Battle is against one Check.
_Avoid_: Test suite, job (outside the event translator)

**Scene**:
The pane that plays the current Encounter: animated pixel art where the surface draws it, one line of text in the terminal.
_Avoid_: Encounter view, animation pane

**Boss Fight**:
The code-review challenge that ends a Quest, built from the Quest's actual diff: the first commit Claude makes during a Quest summons it, three review Questions about that commit's diff (the Quest's own changes when git cannot show it). The boss has one HP per Question: a right answer hits it and earns Intelligence XP, uncapped, a wrong one costs HP. Every Question right wins the Quest reward and a Trophy, and heals fully; the boss left standing is a loss; the Player may skip it. A Quest that could have no Boss Fight pays a quarter of its reward. However it ends, the Quest closes, its outcome in the Region file (won, lost, skipped, or unfought when no Boss Fight could be made).
_Avoid_: Final review, boss battle

**Quest reward**:
The XP a Quest's Boss Fight won pays, by its ticket's difficulty alone (Trivial 40 to Epic 180, Unrated 80), shown on its Quest card; half again when Flawless (every Boss answer right, no wrong Sage answer in the Quest). Paid once per Region and ticket.
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
A comprehension challenge tied to specific lines of code the Player can see: four options, one right, a one-sentence explanation and a Stat tag. The Sage asks one after each code-changing Encounter, about its change (a Crafting's file, or the edits that won a Battle). A right answer earns XP to its Stat tag, Wisdom for `wisdom` and Intelligence otherwise (a quarter of it when hasty, half when Exhausted, from the sage XP pool), a wrong one costs HP; both show the explanation. Once answered, a Question about the same change is not asked again that session.
_Avoid_: Quiz, prompt

**Content Generator**:
What asks Haiku for a Question about a change and checks the reply against the contract; a reply that breaks it is skipped, never queued.
_Avoid_: Question generator, LLM client

**Hasty answer**:
A right answer given quicker than a non-trivial Question can be read: under 5 seconds from when it was shown, to a Question pointing at 3 source lines or more (both settings). It earns a quarter of the XP. An answer with no time (the Question never shown first) is never hasty.
_Avoid_: Fast answer, guess

**Haiku budget**:
How many Haiku calls the game may make: per Quest, 10 for the Sage and 3 for the Boss Fight, each counted apart; between Quests, 5 for the Sage per session. Over budget a Question is skipped, never failed. A Question reused from the cache, for an identical diff, costs nothing. The limits are settings, in `/config`.
_Avoid_: Quota, rate limit

**Question cache**:
The Questions the Sage made, kept by a hash of the change they are about (each file's path and diff), so an identical diff reuses its Question instead of calling Haiku. It holds the latest 50, for the session, surviving a reload of the mod.
_Avoid_: Memo, store

**Question Queue**:
The Questions waiting for the Player; they never interrupt the session, the Player answers them when they choose, in the Sage's dialogue box (`/sage`). The HUD counts them.
_Avoid_: Inbox, backlog

## The HUD

**HUD**:
The band above the prompt showing the Player's level and Title, HP (or Exhausted), XP, Badge count, the active Quest, the session's vitals, and the Stats in play.
_Avoid_: Status bar, header

**Mana**:
The share of the session's context window used so far, shown on the HUD.
_Avoid_: Context meter, tokens bar
