# TORN Crime Item Tagger

Tags your inventory so you can see at a glance which items are used for **Crimes 2.0** and which are
used for **Organized Crimes** — without cross-referencing the wiki every time.

## Install

**[Install from Greasy Fork](https://greasyfork.org/en/scripts/596304-torn-crime-item-tagger)** with
Tampermonkey or Violentmonkey.

Install from there rather than from the raw file in this repo — Greasy Fork is what tells your
userscript manager when a new version exists, so installs from that page update themselves and
installs from the raw link never do. This repo is the source; Greasy Fork syncs from it on every
push.

### Don't sell what a crime needs

![Crime and OC items dimmed in a Torn shop](screenshot3.png)

*Selling to an NPC shop with **Dim Crime & OC Items** on. Everything a crime or an organized crime
needs is greyed out and badged, so the rows you are safe to sell are the bright ones — no more
dumping a stack of Gasoline an hour before the OC needs it.*

### Organized Crime tooltip

![Organized Crime tooltip](screenshot.png)

*Every organized crime that needs the item, its difficulty, which positions want it, and whether you
get the item back.*

### Crimes tooltip

![Crimes tooltip](screenshot2.png)

*What the item does in each crime — and for forgery materials, every project it can be used to make.*

## What you see

Badges sit on each item row, right after the quantity. The number is always *how many crimes use the
item*; the tooltip breaks down the positions inside each one.

They appear on your **Items** page and on the **sell list** of Torn's NPC shops, the bazaar and the
item market — the places where you are about to part with something. The shop *buy* grid is
deliberately left alone: the tiles have no room for a badge, and knowing an item is needed is what
matters when you are selling, not buying.

| Badge | Meaning |
|---|---|
| `C` / `C ×2` | Used in that many regular crimes |
| `OC ×3` | Used in that many organized crimes |
| `OC ×3 ✓` | The OC you are in needs it, and everyone has one |
| `OC ×3 ⚠` | The OC you are in needs it, and a teammate does not have it yet |

Hovering gives the detail: which crimes, which positions inside each, the crime's difficulty, whether
the item is consumed or returned, how many you hold, and how many the faction armoury has spare.

### If *you* are missing an item

A badge cannot tell you that — an item you do not own has no inventory row to put a badge on. So you
get a **red banner** naming the item, your position and the countdown, plus a red dot on the CIT tab.
You can hide the banner, but it returns on every page load until you have the item.

![Missing item linking through to the armoury](Usermissingitem%20to%20Utilities%20page.gif)

*Under **Your current OC**, the name of the item you are short is a link. It opens the faction
armoury on the Utilities tab, scrolls to that item and highlights the row for eight seconds — then
you click **Give** yourself.*

### If a *teammate* is missing an item

The tooltip names them. Clicking that name takes you to the faction armoury, scrolls to the item's
**Available** row, highlights it for eight seconds, and copies `TheirName [12345]` to your clipboard
so the member box is one paste away. The same links inside **OC Manager** behave identically.

**The script never clicks Loan and never fills the form.** It gets you to the right row with the
right text on the clipboard; every action that moves an item is yours.

## The panel

A **CIT** tab sits on the right edge of every Torn page — or only on the pages you choose, see
**CIT button** below. Every section collapses and remembers whether you left it open.

- **Feature List** — the switches in the table further down.
- **CIT button** — which pages the CIT tab itself appears on.
- **Status** — key access and which selections it carries, catalogue size, how many inventory stacks
  have been seen, and how many OC definitions are loaded. Folded up it shows `ok`, `no API key` or
  an error count, so collapsing it never hides a problem.
- **Your current OC** — status, countdown, when the reading was taken, which positions are short,
  and whether the armoury can cover them.
- **Organized Crime item coverage** — every OC item in the game, split into **Missing** and **Held**,
  each sorted by how many positions want it. The top of the missing list unblocks the most crimes.
- **Crime item coverage** — the same per crime: Arson, Bootlegging, Burglary, Card Skimming,
  Cracking, Disposal, Forgery, Graffiti and the rest, each with a held/total count. Forgery also
  lists which of the 17 projects you can complete now and what is blocking the others.
- **OC Manager** *(optional, see below)* — every position across all your faction's organized crimes
  whose member is missing the required item.

## Feature List

| Setting | What it does |
|---|---|
| Show `[C]` badges | Regular-crime badges on item rows |
| Show `[OC]` badges | Organized-crime badges on item rows |
| Dim Crime & OC Items in Torn NPC Shops page | In a shop, bazaar or the item market, fades the items a crime needs — what stays bright is safe to sell |
| **Live OC data (Torn API)** | Master switch for every API call — see below |
| **OC Manager** | Adds the faction-wide shortfall section to the panel |
| Dim non crime & non OC items in Items page | On your own Items page, fades everything no crime uses, so the useful rows stand out |

The two dimming switches are deliberately opposite, because the question is opposite. On your Items
page you want to find what a crime needs; in a shop you want to find what is safe to sell. Each one
only acts on the pages it names.

## CIT button

If you would rather not have the tab on every page, tick only the pages you want it on:

| Option | Where |
|---|---|
| **Everywhere** | Any Torn page — the default |
| Items | Your own items page |
| Crimes | The Crimes 2.0 page, including every individual crime |
| Faction → Crimes | Your faction's organized crimes tab |
| Faction → Armoury | Your faction's armoury tab |
| Item Market | The item market |
| Bazaar Directory / Bazaars | The bazaar directory and individual bazaars |
| Torn NPC Shops | Torn's own shops |

**You never have to untick Everywhere first.** Tick any specific page and Everywhere switches
itself off — so going from "everywhere" to "only on Crimes" is a single tap on Crimes. Tick
Everywhere again and the individual pages clear and fade out, because Everywhere already covers
them. They stay tappable the whole time: tapping one simply narrows the selection again.

Where the tab shows is purely cosmetic. Badges, dimming, the missing-item banner, the armoury
helper and every reading still work normally on pages without it.

### On Torn PDA and mobile

This is the one place the two platforms differ, and it is worth knowing before you go hunting for a
setting that is not there.

Desktop userscript managers give the script a menu entry, so on desktop you can untick every page
and hide the tab completely — **Crime Item Tagger — settings** in the Tampermonkey menu still
reopens this panel, and **show the CIT tab everywhere** puts it back.

Torn PDA has no such menu, so the tab is the only way back into the panel. At least one page
therefore stays ticked: try to untick the last one and it stays put, and the note under the
checkboxes turns red to say why. Nothing is ever locked — to change which page it is, tick the new
one first, then untick the old one.

The panel also lays itself out for narrow screens: full width with finger-sized checkbox rows
below 520px, rather than the fixed-width desktop panel.

### Live OC data (Torn API)

This is the single switch for everything that talks to `api.torn.com`. It is on by default, and with
a key saved there is little reason to turn it off except to rule the API out while debugging.

**Still works with it off** — nothing here needs the network:

- `C` and `OC` badges from the built-in table of ~128 items, and all their tooltips
- Quantities, read from your own item pages
- Both dimming switches, on the Items page and in shops
- Crime item coverage and Forgery readiness
- Armoury stock and OC Manager, both read from the pages themselves
- The CIT tab and panel

**Stops working with it off:**

- Your live OC — status, countdown, who is short, the red banner and the tab's alert dot
- Teammate names, and the loan links that depend on them
- The authoritative OC definitions, so OC badges fall back to the built-in table and lose their
  counts (plain `OC` instead of `OC ×3`)
- The item catalogue, so badge matching drops from item-ID-based back to name matching

## API key — optional

The script works immediately with no key. A key adds live status for the organized crime you are in,
resolves teammate names, and pulls OC definitions from Torn so they stay correct when the game
changes. **No faction API access is required** — it reads your own OC through your own key.

Open the **CIT** tab, paste, save. A Limited Access key works, but a custom key scoped to these four
selections does the same job with far less exposure:

| Section | Selection | Used for |
|---|---|---|
| `torn` | `items` | Item names and IDs |
| `torn` | `organizedcrimes` | Every OC, its positions and required items |
| `user` | `organizedcrime` | The OC you are currently in |
| `user` | `basic` | Resolving teammate IDs to names |

## Privacy

Your key is stored locally by your userscript manager and is sent only to `api.torn.com` — the single
host declared in `@connect`. Nothing is sent to the author or any third party. No analytics, no
remote code, no external libraries.

## Torn's rules

The script is built to stay inside them:

- **No automation.** It never clicks, submits or actions anything — there is not a single
  `.click()` or synthetic event in the source. It renders information and copies text to your
  clipboard; you do the rest.
- **No page scraping.** It never fetches a torn.com page. It reads only the DOM of the page you
  loaded and are looking at, which is the same thing TornTools does.
- **Nothing runs in a hidden tab.** Page reading and API calls are suspended while the tab is not
  visible and resume when you return to it.
- **API calls only, and few of them.** The only host contacted is `api.torn.com`. Results are cached
  (item catalogue, OC definitions and names weekly; key info hourly; your OC for two minutes), so
  ordinary browsing costs close to nothing. Loading the items or faction page refreshes your OC
  status, because navigating there is a deliberate action by you.

## Found a bug?

Before reporting, click **Diagnostics** in the CIT panel, then open the browser console (F12) and
include the `[CIT]` lines — they pinpoint the problem straight away. Do not paste your API key.

## Licence

MIT
