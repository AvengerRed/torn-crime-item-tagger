# TORN Crime Item Tagger

A userscript that tags your Torn inventory with **[C]** and **[OC]** badges, showing at a glance
which items feed Crimes 2.0 and which feed Organized Crimes.

### Organized Crime tooltip

![Organized Crime tooltip](screenshot.png)

*Every organized crime that needs the item, its difficulty, which positions want it,
and whether you get the item back.*

### Crimes tooltip

![Crimes tooltip](screenshot2.png)

*What the item does in each regular crime — and for forgery materials, every project
it can be used to make.*

## What it does

- **`C ×n`** — the item is used in *n* regular crimes. Hover for each crime and what the item does there.
- **`OC ×n`** — the item is used in *n* organized crimes. Hover for each crime, its difficulty, and
  exactly which positions need it, plus whether the item is consumed or returned.
- **`OC ×n ⚠ YOU`** — pulsing red: *your own position* in the OC you are currently in is missing this item.
- A **CIT** tab on the right edge opens a panel with your current OC, coverage across every OC in the
  game, and a Forgery readiness planner.

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) (or Violentmonkey).
2. Install the script from [Greasyfork](https://greasyfork.org/).
3. Open your items page. Done — it works with no further setup.

## API key (optional)

The script works without a key using its built-in crime data. Adding a key enables live status for
the organized crime you are currently in, and pulls OC definitions straight from Torn so they stay
correct when the game changes.

Open the **CIT** tab → paste key → Save.

A **Limited Access** key works. Better, use Torn's
[custom key builder](https://www.torn.com/api.html) and grant only:

| Section | Selection |
|---|---|
| `torn` | `items` |
| `torn` | `organizedcrimes` |
| `user` | `organizedcrime` |

The key is stored locally by your userscript manager and is sent only to `api.torn.com`.
Nothing is sent to the author or any third party.

## Notes

- **No faction API access is needed.** Live OC status comes from `/v2/user/organizedcrime`, which
  works on your own key.
- Torn's inventory API returns nothing, so quantities are read from the item pages themselves.
  They fill in per category tab as you browse.

## Reporting a bug

Open an issue. If badges are missing or misplaced, click **Diagnostics** in the CIT panel first and
paste the `[CIT]` lines from the browser console (F12 → Console) — that identifies the problem
immediately.

## Licence

MIT
