# Claude Quest

An RPG layer over AI-assisted coding in Claude Code: the player's real work (planning, implementing, reviewing) is played out as quests in a persistent world, so the player keeps reading and understanding the code being written.

## The player

**Player**:
The one system-wide character belonging to the human developer, carried across every project. Its level never affects difficulty.
_Avoid_: User, character, hero, profile

**Stat**:
One of six attributes of the Player (Intelligence, Wisdom, Dexterity, Strength, Charisma, Constitution), each standing for a real engineering skill.
_Avoid_: Attribute, skill

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

**Fog**:
The unrevealed part of a Region or Dungeon, standing for work not yet planned.
_Avoid_: Fog of war, hidden tiles

## Quests

**Quest**:
One ticket, played as a run of Encounters ending in a Boss Fight.
_Avoid_: Ticket (outside a Quest Source), task, mission

**Quest Source**:
Where Quests come from: a Jira project or a folder of local ticket files.
_Avoid_: Tracker, backlog, provider

**Quest Board**:
The view listing the available Quests of the current Region, from which the Player starts one.
_Avoid_: Ticket list, backlog view

**Encounter**:
A game moment produced by real session activity during a Quest (Exploration, Battle, Crafting, Puzzle, Trap, Rest).
_Avoid_: Event (that's the raw session activity), scene

**Boss Fight**:
The code-review challenge that ends a Quest, built from the Quest's actual diff.
_Avoid_: Final review, boss battle

## Learning

**NPC**:
A persona (Sage, Cartographer, Merchant, Rival, Scribe, Quest Giver) that speaks to the Player and delivers Questions.
_Avoid_: Character, bot

**Question**:
A comprehension challenge tied to specific lines of code the Player can see.
_Avoid_: Quiz, prompt

**Question Queue**:
The Questions waiting for the Player; they never interrupt the session, the Player answers them when they choose.
_Avoid_: Inbox, backlog

## The HUD

**HUD**:
The band above the prompt showing the Player's level, HP, XP, the active Quest and the session's vitals.
_Avoid_: Status bar, header

**Mana**:
The share of the session's context window used so far, shown on the HUD.
_Avoid_: Context meter, tokens bar
