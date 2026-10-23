# Claude Quest: An RPG Mod for Claude Code

## 1. Vision

Claude Quest turns AI-assisted coding in the Claude Code desktop app into a pixel-art RPG. The system-wide project context is the player's world and level. Each Jira ticket is a quest. While Claude implements a ticket, the session's real activity becomes game encounters, NPC dialogue and quizzes. These keep the developer reading, reviewing and understanding the code instead of just watching it get written.

Goals:

- Make the agentic coding loop fun and visible.
- Build real comprehension of the code: reading, reviewing, design reasoning.
- Fit into the existing workflow (Matt Pocock's skills: setup/Jira, to-spec, to-ticket, implement, readme/doc).

Non-goals for v1: multiplayer, a monetized cosmetics store, support for issue trackers other than Jira.

## 2. Platform

- Built as a Claude Code **mod** (TypeScript, shipped inside a plugin, installed with /plugin). Runs in the desktop app and CLI.
- The mod uses the mod APIs to watch session events (tool calls, file reads and edits, test runs, messages) and to draw its own UI (side pane plus a band above the prompt).
- Haiku handles cheap, fast side generation: questions, NPC dialogue, summaries.
- Local state is stored in a JSON or SQLite file in the project's .claude folder, with optional global player state in the user's home directory.

## 3. Core Loop

1. Open the **Quest Board**. Jira tickets appear as quest cards with a title, difficulty, XP reward and required stats.
2. Select a quest. The mod runs /implement for that ticket in the session.
3. As the session works, events are mapped to **encounters** (section 5), and the animated scene in the pane updates.
4. At key moments, NPCs interrupt with dialogue, questions or choices (section 6).
5. The quest ends with a **Boss Fight** code review.
6. Rewards: XP, stat gains, loot (badges, cosmetics). The ticket moves forward in Jira.

## 3a. Workflow Integration (Matt Pocock's skills)

Each of the existing skills is one game phase. The mod listens for each skill's run and builds the world from what it produces, so the skills stay unchanged.

1. **First install: character creation.** Happens once. The character is system-wide and travels to every project.
2. **Setup (per project): discovering a new region.** Linking the project's Jira opens a new, empty region on the world map.
3. **Readme/doc: writing the region's lore.** NPCs draw on it, so the Sage and Cartographer know the system.
4. **To-spec: shaping the region.** The spec builds the region's terrain, and its epics show up as fogged dungeons.
5. **To-ticket: stocking the dungeons.** Each ticket becomes a quest in its epic's dungeon, with difficulty and rewards, and appears on the Quest Board.
6. **Implement: running the quest.** Encounters, NPCs and the boss review play out as described below.

## 4. Progression and Stats

- **Player level:** one system-wide character shared across all projects, stored in the user's home directory. It grows with total XP and gives bragging rights and cosmetic unlocks (sprites, NPC portraits, titles). It never changes difficulty. Each project's progress is tracked separately through quest completion and a fog-of-war map of that repo's modules.
- **Stats** map to real engineering skills:
  - **Intelligence:** correct answers about logic, algorithms and design.
  - **Wisdom:** architecture and system-context questions (how modules connect).
  - **Dexterity:** speed and accuracy of review actions, spotting the planted bug quickly.
  - **Strength:** debugging, finishing failing-test battles and fixing build errors.
  - **Charisma:** writing clear PR descriptions, commit messages and ticket specs.
  - **Constitution:** streaks and consistency, finishing quests without abandoning them.
- Quests list **recommended stats**. Difficulty comes only from the ticket itself (story points, number of files touched), never from player level or stats. Recommended stats are guidance only, and matching them earns bonus XP.
- **Skill tree:** unlockables such as hint tokens, extra NPC explanations or a "scry" ability that previews the planned diff.

## 5. Encounter Types (event mapping)

- **Exploration:** Claude reads or searches files, revealing tiles on the dungeon map. The first visit to a module grants Wisdom XP.
- **Battle:** a failing test, lint error or build failure spawns a monster. Its HP is tied to the number of failures, and each passing test is a hit.
- **Crafting:** new files or major edits play a blacksmith scene. The forged item is named after the component.
- **Puzzle / Crossroads:** when Claude weighs a design choice or asks the user a question, it becomes a fork in the road with options.
- **Trap:** risky actions (deleting files, migrations, dependency changes) trigger a trap the player must confirm or disarm.
- **Rest / Campfire:** idle or long-running steps show a campfire with a short recap of progress so far.
- **Boss Fight:** final review (section 7).

## 6. NPCs

NPCs are the main way learning gets delivered. Each has a personality, a role and a dialogue generated by Haiku from the live session context.

- **The Sage:** explains what was just implemented and asks one comprehension question (multiple choice or short answer).
- **The Cartographer:** shows how the changed code fits into the wider system and asks architecture questions.
- **The Merchant:** trades XP for hints or explanations.
- **The Rival:** suggests a plausible but wrong alternative approach. The player has to argue why the chosen approach is better.
- **The Scribe:** at the end of a quest, helps the player write the PR summary (Charisma XP).
- **The Quest Giver:** narrates the ticket's goal at the start, generated from the Jira ticket and spec.

Dialogue rules: keep it short (two to four lines), never block the session unless the player opts in, and pause or queue it during critical Claude prompts.

## 7. Boss Fight: Code Review

- Haiku produces a review challenge from the actual diff:
  - questions about what specific lines do;
  - optionally a planted bug in a copy of a snippet (never in the real code) for the player to find;
  - "what would break if..." scenarios.
- Boss HP drops with each correct answer. Wrong answers cost player HP and earn an explanation.
- On victory: XP, loot and an optional prompt to mark the ticket ready for review.

## 7a. World Map and Achievements

The world map is built from the spec and its Jira epics, and achievements reward real coding skill, not answer volume.

- **World map:** one system-wide world holds all the player's projects. Each project is a region, built from its spec. Each epic is a dungeon in that region, and each ticket is a quest (a room or floor) inside the dungeon. Finishing every ticket in an epic clears the dungeon, and the region fills in as the project comes together.
- **Fog of war:** the map is generated only from the epics and tickets that exist right now. Everything else in a region or dungeon stays under fog. New epics push the fog back to reveal new dungeons, and new tickets reveal new rooms inside them, so the unexplored edge of the map shows the work that hasn't been planned yet.
- **Themes:** Haiku reads the project spec to pick the region's biome and art theme, and reads each epic to theme its dungeon, including its monsters and boss. For example, a data-pipeline epic could become a flooded aqueduct, and an auth epic a guarded fortress. Themes are generated once and cached, so the map stays stable.
- **Milestone achievements:** clear a dungeon (epic done), conquer a region (project spec fully done), discover a new region (first setup in a new repo).
- **Skill achievements:** win a boss review with no wrong answers, find a planted bug on the first try, predict a failing test before it runs, beat the Rival's wrong approach with a sound argument, write a PR summary the Scribe rates clear.

Rewarding real skill, not blind answering:

- XP depends on accuracy, never on how many questions were answered. Wrong answers cost HP.
- Very fast answers on non-trivial questions earn reduced XP, so random guessing doesn't pay.
- Some questions need a short free-text explanation, graded by Haiku against the actual diff.
- Questions are tied to specific lines, so the player has to read the code to answer.
- Optional confidence rating: a confident wrong answer costs more, and a correct one pays more.
- Delayed retention quizzes on earlier quests give bonus XP and show whether learning sticks.

## 8. UI

- **Quest Board pane:** a grid of quest cards in pixel-art style, with filters by sprint, status and difficulty.
- **Scene pane:** an animated pixel-art scene showing the current encounter, with sprite animations for each event type.
- **Status band above the prompt:** the character HUD: portrait, level, HP, XP bar, active quest name and current encounter, plus session vitals. The key vital is a context meter showing how much of the session's context window is used, drawn as a mana bar. It changes color as it fills and warns before compaction, so the player knows when to wrap up or start a fresh session. Other easy vitals: model in use and token or cost spend for the quest.
- **Dialogue box:** a classic RPG text box with an NPC portrait and answer options.
- **Character sheet:** stats, skill tree, badges and the codebase map.
- Art: a 16-bit palette, sprite sheets and a small asset pack bundled with the plugin.

## 9. Architecture

- **Event Listener:** subscribes to mod session events and normalizes them into game events (for example FILE\_READ, FILE\_EDIT, TEST\_FAIL, TEST\_PASS, USER\_QUESTION, TOOL\_RISKY, SESSION\_IDLE, IMPLEMENT\_DONE).
- **Game Engine:** a state machine that maps game events to encounters and applies XP, HP and stat changes.
- **Content Generator:** Haiku calls with compact context (recent diff, ticket summary, recent messages), returning structured JSON (question, options, answer, explanation, NPC line). Results are cached and rate-limited.
- **Jira Adapter:** reads tickets through the existing Jira setup/MCP connection and maps fields to quest data (story points to difficulty, labels to recommended stats).
- **Renderer:** UI components for the panes and band, plus a sprite animation system.
- **Persistence:** player profile, quest history and per-project world map.

## 10. Data Model (draft)

- **Player:** id, level, xp, hp, stats {int, wis, dex, str, cha, con}, unlockedSkills, badges.
- **Quest:** ticketKey, title, difficulty, xpReward, recommendedStats, status, encounters\[\].
- **Encounter:** type, triggerEvent, timestamp, outcome, xpDelta.
- **Question:** id, npc, prompt, options, correctAnswer, explanation, statTag, sourceRef (file and lines).
- **WorldMap:** modules\[\], discovered flags, mastery level per module.

## 11. Haiku Prompt Contracts

- **Comprehension question:** input is the diff hunk plus the ticket summary. Output is JSON with a question, four options, the answer index, a one-sentence explanation and a stat tag.
- **NPC line:** input is the NPC persona plus the event. Output is two to four lines of dialogue.
- **Boss challenge:** input is the full quest diff. Output is three to five review questions and an optional planted-bug snippet with the bug location.
- **Guardrails:** questions must be answerable from code the player can see, and the planted bug is never written to disk.

## 12. Settings

- Difficulty presets: Casual (visuals only), Adventurer (occasional questions), Hardcore (mandatory boss review before marking a ticket done).
- Question frequency and Haiku budget cap.
- Animation intensity and sound on or off.
- Opt-out per project.

## 13. MVP Scope

1. Quest Board that lists Jira tickets and launches /implement.
2. Event listener with three encounter types: Exploration, Battle, Crafting.
3. A Sage NPC with Haiku comprehension questions.
4. XP, level and two stats (Intelligence and Strength).
5. A simple boss review with three questions.
6. A status band plus one animated scene pane.

## 14. Roadmap

- v0.2: all six stats, the remaining NPCs, the world map, the skill tree.
- v0.3: Trap and Puzzle encounters, PR-writing Scribe, Jira status sync.
- v0.4: sound, custom sprite packs, shareable character sheets, team leaderboards.

## 15. Open Questions

- Which session events does the mod API expose, exactly, and at what granularity?
- How should questions behave during long autonomous runs: queued or live?
- Should XP be per project or global?
- How do we measure whether learning improves, for example by retention quizzes later?
- Art: commission sprites, use open-licensed packs, or generate them?
