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

Badges sit on each item row, right after the quantity. The number is always *how many crimes
use the item*; the tooltip breaks down the positions inside each one.

- **`C`** / **`C ×2`** — used in that many regular crimes. Hover for each crime and what the item
  does there. For forgery materials, the tooltip lists every project you can make with it.
- **`OC ×3`** — used in that many organized crimes. Hover for each crime, its difficulty, which
  positions need it, and whether the item is consumed or returned to you.
- **`OC ×3 ✓`** — the OC you are currently in needs this, and everyone in it has one.
- **`OC ×3 ⚠`** — the OC you are currently in needs this, and one or more **teammates don't have it
  yet**. The tooltip names the teammate and links to their profile, so you can send them a spare.

### If *you* are the one missing an item

A badge can't tell you that — a missing item has no inventory row to put a badge on. So instead
you get a **red banner** at the top of the page naming the item, your position, and how long until
the crime runs, plus a red dot on the CIT tab. You can hide the banner, but it reappears on every
page load until you actually have the item — so it can't be forgotten before the crime runs.

### The panel

A **CIT** tab on the right edge opens:

- **Your current OC** — status, countdown, and which positions are covered.
- **OC item coverage** — every OC item in the game, split into held and missing, sorted by how many
  positions want it. The top of that list unblocks the most crimes.
- **Forgery readiness** — which of the 17 forgery projects you can complete now, and what's blocking
  the rest.

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
