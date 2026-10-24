# ADR 0005: Haiku theming, optional and cached for ever

- Status: Accepted
- Date: 2026-10-24
- Applies to: issue #17, on top of the Region map (#15) and the Overview (#16)

## Context

The World is drawn from what the game already knows: a Region is named after its project's folder and laid out from its id, a Dungeon after its epic. That is stable and the same for every Player, but every Region is the same meadow and every Dungeon the same crypt. Spec #13 (Q6, Q27) asked for Regions and Dungeons named and themed from what they are about, when Haiku is there to do it, and plain names when it is not.

Three choices needed a reason: whether anything may depend on a theme, how often one is asked for, and whose budget pays for it.

## Decision

- **Optional.** Nothing waits on a theme. Every map, Island and Floor draws deterministically without one: the folder's name and `meadow` for a Region, the epic's name and `crypt` for a Dungeon. A theme only swaps the name shown (the real one kept beside it, small, so the Player can still find the project and the epic) and a palette: a biome (`meadow`, `forest`, `coast`, `desert`, `snow`, `swamp`) for the Region map's land, its camps and its Island; a kind (`crypt`, `fortress`, `aqueduct`, `mine`, `library`, `tower`) for a Dungeon's walls, floors, banner, gate and pennant. Layouts never change: they are seeded from ids and keys, never from a theme.
- **Asked once, kept for ever.** A Region is themed the first time its map's overworld or its Island in the Overview is drawn and its registry entry has no `theme`; a Dungeon the first time its Floors are drawn in the current Region and its Snapshot entry has none. The theme is kept in the registry (`theme: { name, biome, themedAt }` on the entry, `theme: { name, kind, themedAt }` on the Snapshot's Dungeon), which is the cache: a Snapshot taken again keeps its Dungeons' themes by key, and a session touching its Region keeps the Region's. Nothing re-themes a Region or a Dungeon, so the World a Player knows does not change under them.
- **Outside the budgets, no setting.** The Haiku budget (`sageCallsPerQuest`, `bossFightCallsPerQuest`, `sageCallsOutsideQuest`) pays for Questions, which pay XP; a theme pays nothing and is bounded on its own: one call per Region and per Dungeon, ever, small and at low effort. Counting them against the Sage would take Questions from the Player for decoration, and a new setting would be one more thing to explain for something that never matters to play.
- **Skipped silently.** No call is made when Haiku was found unavailable this session (`haikuUnavailable`). A call that fails, or whose reply breaks the contract (not JSON, a name empty, over 32 characters or not on one line, a biome or kind not on the list), is discarded and logged to the debug log alone; the defaults are drawn and it is asked again next session, never twice in one (`themeAttempts` in `$.state`). A theming failure never marks Haiku unavailable: that toast is the Sage's to give.
- **Data, labelled.** Haiku is shown a Region's folder name, its remote as `owner/repo` (never the URL, which may carry a token) and the first 1500 characters of its README as plain text; a Dungeon's name and up to twenty of its tickets' titles. All of it sits between `<data>` tags, and the system prompt says it is untrusted data, never instructions, as the Content Generator does for tickets.

## Consequences

- A Player without Haiku, or who never opens the map or the Overview, sees exactly the World of #15 and #16.
- Opening the Overview the first time with many Regions asks for one theme each, one call at a time; it is a one-off per Region.
- Another Region's Dungeons, drawn from its Snapshot, are themed only once the Player plays in it again: their ticket titles are not in the Snapshot.
- When the registry outgrows its share of the store, the oldest Regions lose their Snapshots (the size rule of #16), and their Dungeons' themes with them; such a Dungeon is themed again when next drawn.
- New state: `RegionEntry.theme`, `RegionSnapshot.dungeons[].theme`, `themeAttempts` for the session; new module `src/theming.ts`.
