# Claude Quest

An RPG mod for Claude Code. Your real work in a session is played as a game: a ticket you implement is a **Quest**, reading code explores **Modules**, failing tests are **Battles**, new files and big edits are **Crafting**, and the first commit summons a **Boss Fight**, a short code review of that commit's diff. The **Sage** asks a comprehension Question about each change, so you keep reading the code being written. When Claude edits a test file you can make a **Prophecy**, calling how the next test run ends, for Dexterity XP. A HUD above the prompt shows your level, HP, XP, Badges, the active Quest and your Stats (`INT · WIS · DEX · STR`).

The vision is in [`docs/vision.md`](docs/vision.md), the words the game uses in [`GLOSSARY.md`](GLOSSARY.md), and the decisions in [`docs/adr/`](docs/adr/).

## Commands

| Command | What it does |
|---|---|
| `/quest-board` | Opens the Quest Board: the Region's open tickets as Quest cards, drawn as pixel scrolls (a text scroll in the terminal), six a page. Take Quest fills the prompt with your implement command; you send it. Unroll opens a card's details. |
| `/scene` | Opens the Scene: the current Encounter, as pixel art on the desktop and one line in the terminal. |
| `/sage` | Shows the Sage's first waiting Question; `/sage A` to `/sage D` answers it. |
| `/boss` | Shows the Boss Fight's Question; `/boss A` to `/boss D` answers, `/boss skip` skips the fight. |
| `/prophecy` | Tells the Prophecy armed; `/prophecy red`, `green` or `rout` calls the next Check: one failure, passing, or two or more. The HUD's `1 Red`, `2 Green`, `3 Rout` Buttons (hotkeys 1–3) do the same. A right call pays 10 Dexterity XP (30 a Quest at most); a wrong one costs nothing. See [ADR 0004](docs/adr/0004-prophecy.md). |
| `/badges` | Your Badges, trophies, title and Stats. |

A Quest starts when you run `/implement <ticket>` or any plugin's `/<plugin>:implement <ticket>` (for example `/mattpocock-skills:implement #4`, or `ABC-123` for Jira). See [ADR 0001](docs/adr/0001-quest-starts-at-command-run.md).

## Settings

Change these in `/config` under the mod:

- `sageCallsPerQuest` (10), `bossFightCallsPerQuest` (3), `sageCallsOutsideQuest` (5): the Haiku budget, per ticket for the session. 0 turns those Questions off. The Quest Giver's Briefing at a Quest's start (two lines and a Question about the ticket) is one of the Sage's calls for that ticket: with `sageCallsPerQuest` at 0 there is none, and a ticket started again in the session costs none.
- `hastyAnswerSeconds` (5) and `nonTrivialLines` (3): when a right answer counts as hasty and pays less.
- `autoOpenScene` (on): open the Scene once per session on surfaces that draw its art.
- `hudStyle` (`pixel`): on the desktop and in VS Code the HUD is a pixel-art strip (your portrait by Title, the HP, XP and Mana bars, the Quest on a banner, a Prophecy armed, the Stats); `text` brings back the text band there. The terminal always shows the text band. A Prophecy's Buttons show in the band either way, beside the strip.

## Quest Source

The Quest Board reads Quests from the project's **Quest Source**, set in the Region file (below) as `questSource`.

**GitHub Issues** is the default when the project is a git repo with a remote. It is read with the [`gh` CLI](https://cli.github.com), which must be installed, on the PATH and signed in (`gh auth login`). On macOS, Claude Code started from the Dock may not see Homebrew's PATH, so start it from a terminal. A Quest's difficulty comes from labels: `size: XS`…`size: XL`, or `points: N`.

```json
{ "questSource": { "kind": "github" } }
```

**Jira** is read through Atlassian's remote MCP server (the claude.ai Atlassian connector). Connect it with `/mcp` first. Only that server's tool names (`getAccessibleAtlassianResources`, `searchJiraIssuesUsingJql`, `getJiraIssue`) are supported; other Atlassian MCP servers are not. If yours shows under another name in `/mcp`, set `server` to it.

```json
{
  "questSource": {
    "kind": "jira",
    "project": "ABC",
    "storyPointsField": "customfield_10016",
    "site": "https://acme.atlassian.net",
    "server": "claude.ai Atlassian MCP",
    "jql": "project = ABC AND sprint in openSprints()"
  }
}
```

Only `project` is required. `storyPointsField` is your site's story points field id; without it only `points: N` and `size: …` labels rate Quests. `site` defaults to the first Jira site the connection reaches. `jql` defaults to the project's issues that are not done, newest first.

When the board can't read its Quest Source, it says why and what to do: the tool is missing or signed out, the setting is wrong (`misconfigured`), there is no GitHub repo (`none`), or the account can't see the Jira project (`forbidden`).

## The Region file

Each project keeps `.claude/claude-quest.json`: its `questSource` and its Quest history (each Quest's ticket, start, end, outcome and session). The mod writes the history as you play, so the file changes often. Commit it to share the history with your team, or add it to `.gitignore` to keep it to yourself:

```gitignore
.claude/claude-quest.json
```

Your Player (level, XP, Badges, trophies, the Modules you've discovered) is kept by Claude Code across projects, not in the repo.

## Credits

The pixel art is Kenney's (all CC0): Tiny Dungeon for the Scene and the portraits, UI Pack – Pixel Adventure for the Quest Board's scrolls, and the Kenney Mini font for their lettering. See [`assets/CREDITS.md`](assets/CREDITS.md).

The art is baked into TypeScript, so nothing decodes a PNG or loads a font while a session runs: `node scripts/build-sprites.mjs` writes `src/sprites.ts` from the tilesheets, `node scripts/build-font.mjs` writes `src/pixel-font.ts` from the font. `node scripts/render-art.mjs <dir>` renders the Scene, the Boss Fight, the portraits and a sample Quest Board to SVG files (and the board as `board.html`) for a look; `--snapshot` writes the scroll art's test snapshot again after a deliberate change.
