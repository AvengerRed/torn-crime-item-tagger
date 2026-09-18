// ==UserScript==
// @name         TORN Crime Item Tagger
// @namespace    avengerred.torn
// @version      2.39.0
// @description  Tags your inventory with [C] and [OC] badges showing which Crimes 2.0 and Organized Crimes each item is used for. Hover for the crimes, positions and whether the item is consumed. An optional Torn API key adds live status for the OC you are in, warns you when your own position is short an item, and helps you loan one to a teammate.
// @author       AvengerRed
// @license      MIT
// @homepageURL  https://github.com/AvengerRed/torn-crime-item-tagger
// @supportURL   https://github.com/AvengerRed/torn-crime-item-tagger/issues
// @match        https://www.torn.com/*
// @connect      api.torn.com
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

/*
 * PRIVACY
 * -------
 * The API key you enter is stored locally by your userscript manager and is
 * sent only to Torn's own API (api.torn.com) over HTTPS -- the single host
 * declared in @connect. Nothing is sent to the author or any third party, and
 * no analytics or remote code are loaded.
 *
 * The key is optional. Without one the script still tags every item from its
 * built-in crime data. A key adds live status for the organized crime you are
 * in, resolves teammate names, and keeps the OC definitions current.
 *
 * A Limited-access key works. Better, use Torn's custom key builder and grant
 * only these four selections:
 *     torn -> items             item names and IDs
 *     torn -> organizedcrimes   every OC, its positions and required items
 *     user -> organizedcrime    the OC you are currently in
 *     user -> basic             resolving teammate IDs to names
 *
 * This script never clicks Loan, never fills the armoury form and never
 * transfers an item. It highlights the right row and copies the member's
 * "Name [id]" to the clipboard; every action is taken by the user.
 *
 * TORN RULES
 * ----------
 * - No automation: the script never clicks, submits or actions anything. It
 *   only renders information and copies text to the clipboard.
 * - No page scraping: it never fetches a torn.com page. It reads only the DOM
 *   of the page you loaded and are looking at.
 * - Nothing happens in a hidden tab: DOM reading and API calls are suspended
 *   while the tab is not visible, and resume when you return to it.
 * - The only network requests are to api.torn.com, the sanctioned API, and
 *   results are cached so ordinary browsing costs very few calls.
 */

(function () {
    'use strict';

    /* Single source of truth is the @version line in the metadata block above:
       Greasy Fork only publishes an update when @version increases, so the panel
       must never show a number that was bumped separately. GMforPDA supplies a
       GM_info with an empty script object, hence the literal fallback. */
    const VERSION = (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version)
                    || '2.37.0';
    /* Torn's rules forbid reading pages you are not actively viewing, and
       forbid requests that you did not trigger. So nothing runs while the tab is
       hidden: no DOM harvesting, no API calls. Work resumes when you look at the
       tab again. */
    const visible = () => !document.hidden;

    function whenVisible(fn) {
        if (visible()) return fn();
        const onShow = () => {
            if (!visible()) return;
            document.removeEventListener('visibilitychange', onShow);
            fn();
        };
        document.addEventListener('visibilitychange', onShow);
    }

    const LOG = (...a) => console.log('%c[CIT]', 'color:#d4a017;font-weight:bold', ...a);
    const WARN = (...a) => console.warn('[CIT]', ...a);

    /* ==================================================================
       SECTION 1 — CRIME DATA
       name -> { c, oc, skill:{crime,level} }
       `skill` marks items gated behind a Crimes 2.0 skill level.
       ================================================================== */

    const ITEMS = {
        /* ---------- Crime Enhancers ---------- */
        'Glasses':            { c: 'Enhancer: Search For Cash' },
        'High-Speed Drive':   { c: 'Enhancer: Bootlegging (halves production time)' },
        'Paint Mask':         { c: 'Enhancer: Graffiti' },
        'Mountain Bike':      { c: 'Enhancer: Shoplifting' },
        'Cut-Throat Razor':   { c: 'Enhancer: Pickpocketing', oc: 'OC tool' },
        'Duct Tape':          { c: 'Enhancer: Card Skimming' },
        'Flashlight':         { c: 'Enhancer: Burglary / Beach Hut + Lake House' },
        'Megaphone':          { c: 'Enhancer: Hustling' },
        'Latex Gloves':       { c: 'Enhancer: Disposal' },
        'Office Chair':       { c: 'Enhancer: Cracking' },
        'Magnifying Glass':   { c: 'Enhancer: Forgery' },
        'Ergonomic Keyboard': { c: 'Enhancer: Scamming' },
        'Windproof Lighter':  { c: 'Enhancer: Arson / igniter' },

        /* ---------- Search For Cash ---------- */
        'Metal Detector':            { c: 'Search For Cash: unlocks Search the Beach' },
        'Cemetery Key':              { c: 'Search For Cash: unlocks Search the Cemetery' },
        'Lost and Found Office Key': { c: 'Search For Cash: extra outcomes in the Subway' },

        /* ---------- Bootlegging ---------- */
        'Blank DVD':         { c: 'Bootlegging: consumed by Copy DVDs' },
        'Personal Computer': { c: 'Bootlegging / Card Skimming' },
        'Laptop':            { c: 'Bootlegging / Card Skimming / Cracking' },
        'Gold Laptop':       { c: 'Bootlegging / Card Skimming / Cracking' },

        /* ---------- Graffiti ---------- */
        'Ladder':       { c: 'Graffiti: extra outcomes', oc: 'OC tool' },
        'Wire Cutters': { c: 'Graffiti: extra outcomes', oc: 'OC tool' },

        /* ---------- Shoplifting ---------- */
        'Torn City Times': { c: 'Shoplifting: unlocks extra outcomes' },

        /* ---------- Card Skimming ---------- */
        'Card Skimmer': { c: 'Card Skimming: required (returned)' },
        'Spy Camera':   { c: 'Card Skimming: required (returned)' },

        /* ---------- Burglary ---------- */
        'Credit Card':    { c: 'Burglary: Apartment' },
        'Jemmy':          { c: 'Burglary: Beach Hut / Lake House / Secluded Cabin', oc: 'OC tool: Mob Mentality, Bidding War' },
        'Window Breaker': { c: 'Burglary: Bungalow / Cottage / Farmhouse / Luxury Villa' },
        'Lockpicks':      { c: 'Burglary: Manor House', oc: 'OC tool: Pet Project, Best of the Lot' },
        'Rope':           { c: 'Burglary: Mobile Home' },

        /* ---------- Disposal ---------- */
        'Shovel':            { c: 'Disposal: Burying (reusable)' },
        'Hydrochloric Acid': { c: 'Disposal: Dissolving (consumed)' },
        'Disposable Mask':   { c: 'Disposal: Biological Waste (consumed)' },
        'Wheelbarrow':       { c: 'Disposal: Building Debris (reusable)' },

        /* ---------- Arson (skill-gated) ---------- */
        'Lighter':            { c: 'Arson: igniter' },
        'Molotov Cocktail':   { c: 'Arson: igniter',            skill: { crime: 'Arson', level: 30 } },
        'Flamethrower':       { c: 'Arson: igniter',            skill: { crime: 'Arson', level: 80 } },
        'Gasoline':           { c: 'Arson/Disposal: accelerant (consumed)', oc: 'OC material: Market Forces (used up)' },
        'Diesel':             { c: 'Arson: liquid accelerant',  skill: { crime: 'Arson', level: 15 } },
        'Kerosene':           { c: 'Arson: liquid accelerant',  skill: { crime: 'Arson', level: 40 } },
        'Potassium Nitrate':  { c: 'Arson: solid accelerant',   skill: { crime: 'Arson', level: 10 } },
        'Magnesium Shavings': { c: 'Arson: solid accelerant',   skill: { crime: 'Arson', level: 20 } },
        'Thermite':           { c: 'Arson: solid accelerant',   oc: 'OC material (used up)', skill: { crime: 'Arson', level: 50 } },
        'Oxygen Tank':        { c: 'Arson: gas accelerant',     skill: { crime: 'Arson', level: 5 } },
        'Methane Tank':       { c: 'Arson: gas accelerant',     skill: { crime: 'Arson', level: 25 } },
        'Hydrogen Tank':      { c: 'Arson: gas accelerant',     skill: { crime: 'Arson', level: 70 } },
        'Blanket':            { c: 'Arson: dampener (reusable)' },
        'Sand':               { c: 'Arson: dampener (consumed)', skill: { crime: 'Arson', level: 60 } },
        'Fire Extinguisher':  { c: 'Arson: dampener (consumed)', skill: { crime: 'Arson', level: 90 } },

        /* ---------- Cracking rig ---------- */
        'CPU':          { c: 'Cracking: 70W / 30,000 MIPS' },
        'eCPU':         { c: 'Cracking: 30W / 25,000 MIPS, low heat' },
        'HPCPU':        { c: 'Cracking: 150W / 50,000 MIPS, very high heat' },
        'Computer Fan': { c: 'Cracking: broad-area cooling (5W)' },
        'Water Block':  { c: 'Cracking: confined-area cooling' },
        'Heat Sink':    { c: 'Cracking: adjacent-component cooling' },
        'PSU':          { c: 'Cracking: 750W power supply', oc: 'OC tool' },

        /* ---------- Forgery raw materials ---------- */
        'Toner':                   { c: 'Forgery material' },
        'Bond Paper':              { c: 'Forgery material' },
        'Cardstock':               { c: 'Forgery material' },
        'PVC Cards':               { c: 'Forgery material' },
        'Adhesive Plastic':        { c: 'Forgery material' },
        'Glue':                    { c: 'Forgery material' },
        'Inkwell':                 { c: 'Forgery material' },
        'Bucket':                  { c: 'Forgery material' },
        'Certificate Seal':        { c: 'Forgery material' },
        'Candle':                  { c: 'Forgery material' },
        'Aluminum Plate':          { c: 'Forgery material' },
        'Picture Frame':           { c: 'Forgery material' },
        'Brass Ingot':             { c: 'Forgery material' },
        'Medical Bill':            { c: 'Forgery material' },
        'Glow Stick':              { c: 'Forgery material' },
        'Lanyard':                 { c: 'Forgery material' },
        'Birthday Wrapping Paper': { c: 'Forgery material' },
        'Bank Statement':          { c: 'Forgery material' },
        'Crushed Enamel':          { c: 'Forgery material' },
        'Blowtorch':               { c: 'Forgery material' },
        'Bonded Latex':            { c: 'Forgery material' },

        /* ---------- Forgery outputs feeding OCs ---------- */
        'ID Badge':     { c: 'Forgery output', oc: 'OC material: Cash Me If You Can, Ace in the Hole (used up)' },
        'ATM Key':      { c: 'Forgery output', oc: 'OC material: Cash Me If You Can (used up)' },
        'Police Badge': { c: 'Forgery output', oc: 'OC tool: Leave No Trace, Best of the Lot' },
        'Skeleton Key': { c: 'Forgery output' },

        /* ---------- OC tools (reusable) ---------- */
        'Net':                 { oc: 'OC tool: Pet Project' },
        'Cassock':             { oc: 'OC tool' },
        'DSLR Camera':         { oc: 'OC tool' },
        'RF Detector':         { oc: 'OC tool' },
        'Construction Helmet': { oc: 'OC tool' },
        'Binoculars':          { oc: 'OC tool: Stage Fright' },
        'Billfold':            { oc: 'OC tool: Honey Trap (x2)' },
        'Bolt Cutters':        { oc: 'OC tool: No Reserve' },
        'Dental Mirror':       { oc: 'OC tool: Bidding War' },
        'Wireless Dongle':     { oc: 'OC tool' },
        'Core Drill':          { oc: 'OC tool: Blast from the Past' },
        'Angle Grinder':       { oc: 'OC tool' },
        'Hand Drill':          { oc: 'OC tool: Break the Bank (x4)' },
        'Cigar Cutter':        { oc: 'OC tool' },
        'Car Battery':         { oc: 'OC tool' },
        'Large Suitcase':      { oc: 'OC tool' },
        'Tracking Device':     { oc: 'OC tool' },
        'Bone Saw':            { oc: 'OC tool' },
        'Hard Drive':          { oc: 'OC tool' },
        'China Lake':          { oc: 'OC tool' },
        'Remote Detonator':    { oc: 'OC tool' },

        /* ---------- OC materials (consumed) ---------- */
        'Shaving Foam':           { oc: 'OC material (used up)' },
        'Dog Treats':             { oc: 'OC material: Pet Project (used up)' },
        'Cell Phone':             { oc: 'OC material (used up)' },
        'PCP':                    { oc: 'OC material: Snow Blind (used up)' },
        'Blank Casino Chips':     { oc: 'OC material (used up)' },
        'Zip Ties':               { oc: 'OC material: Break the Bank, Blast from the Past (used up)' },
        'Polymorphic Virus':      { oc: 'OC material (used up)' },
        'Chloroform':             { oc: 'OC material: Clinical Precision, No Reserve (used up)' },
        'C4 Explosive':           { oc: 'OC material: Bidding War x2 (used up)' },
        'Flash Grenade':          { oc: 'OC material: Bidding War (used up)' },
        'Ipecac Syrup':           { oc: 'OC material (used up)' },
        'Tunneling Virus':        { oc: 'OC material (used up)' },
        'Shaped Charge':          { oc: 'OC material: Blast from the Past (used up)' },
        'Firewalk Virus':         { oc: 'OC material: Blast from the Past (used up)' },
        'Razor Wire':             { oc: 'OC material (used up)' },
        'Floor Cleaner':          { oc: 'OC material (used up)' },
        'Smoke Grenade':          { oc: 'OC material (used up)' },
        'Stealth Virus':          { oc: 'OC material (used up)' },
        'Ecstasy':                { oc: 'OC material (used up)' },
        'Lubricant':              { oc: 'OC material (used up)' },
        'Armored Virus':          { oc: 'OC material (used up)' },
        'Blood Bag : Irradiated': { oc: 'OC material: Clinical Precision (used up)' },
        'Syringe':                { oc: 'OC material: Clinical Precision (used up)' },
        'Igniter Cord':           { oc: 'OC material (used up)' },
        'Nail Bomb':              { oc: 'OC material (used up)' },
        'Tear Gas':               { oc: 'OC material (used up)' }
    };

    const PREFIX_RULES = [
        { test: n => /^spray paint\s*:/i.test(n),
          data: n => /black/i.test(n)
              ? { c: 'Graffiti: spray paint (consumed)', oc: 'OC material: No Reserve (used up)' }
              : { c: 'Graffiti: spray paint (consumed)' } },
        { test: n => /^spray can\s*:/i.test(n),
          data: () => ({ c: 'Forgery: License Plate (White & Black)' }) }
    ];

    /* Forgery recipes: project -> required materials */
    const FORGERY = {
        'Drivers License':        ['Toner', 'PVC Cards', 'Adhesive Plastic'],
        'Parking Permit':         ['Toner', 'Cardstock', 'Adhesive Plastic'],
        'Concert Ticket':         ['Toner', 'Cardstock'],
        'Collection Bucket':      ['Toner', 'Cardstock', 'Adhesive Plastic', 'Bucket', 'Glue'],
        'Diploma':                ['Toner', 'Bond Paper', 'Certificate Seal', 'Glue', 'Inkwell'],
        'Birth Certificate':      ['Toner', 'Bond Paper', 'Candle', 'Inkwell'],
        'License Plate':          ['Aluminum Plate', 'Spray Can : White', 'Spray Can : Black', 'Bond Paper'],
        'Ordination Certificate': ['Toner', 'Bond Paper', 'Inkwell', 'Picture Frame'],
        'Skeleton Key':           ['Brass Ingot'],
        'Prescription':           ['Medical Bill', 'Toner', 'Bond Paper', 'Inkwell'],
        'Travel Visa':            ['Toner', 'Bond Paper', 'Glow Stick', 'Adhesive Plastic'],
        'ID Badge':               ['Toner', 'PVC Cards', 'Credit Card', 'Glue', 'Lanyard'],
        'Medical License':        ['Medical Bill', 'Toner', 'PVC Cards', 'Birthday Wrapping Paper', 'Glue'],
        'Bank Check':             ['Bank Statement', 'Toner', 'Bond Paper', 'Inkwell'],
        'Police Badge':           ['Brass Ingot', 'Crushed Enamel', 'Blowtorch'],
        'ATM Key':                ['Brass Ingot', 'Blowtorch'],
        'Passport':               ['Cardstock', 'Bonded Latex', 'Glue', 'Toner', 'Bond Paper', 'Adhesive Plastic']
    };

    /* ==================================================================
       SECTION 2 — SETTINGS / STORAGE
       ================================================================== */

    const getV = (k, d) => { try { return GM_getValue(k, d); } catch (e) { return d; } };
    const setV = (k, v) => { try { GM_setValue(k, v); } catch (e) {} };

    const S = {
        get key()        { return getV('cit_key', ''); },
        set key(v)       { setV('cit_key', v); },
        get showC()      { return getV('cit_showC', true); },
        set showC(v)     { setV('cit_showC', v); },
        get showOC()     { return getV('cit_showOC', true); },
        set showOC(v)    { setV('cit_showOC', v); },
        get dim()        { return getV('cit_dim', false); },
        set dim(v)       { setV('cit_dim', v); },
        get useApi()     { return getV('cit_useApi', true); },
        set useApi(v)    { setV('cit_useApi', v); },
        get ocMgr()      { return getV('cit_ocmgr', false); },
        set ocMgr(v)     { setV('cit_ocmgr', v); },
        get dimTagged()  { return getV('cit_dimTagged', false); },
        set dimTagged(v) { setV('cit_dimTagged', v); },
        /* Which pages the CIT tab appears on, as {pageKey: true}. Absent means
           first run: honour the older hideTab flag if one was set, else show it
           everywhere, which is how the tab has always behaved. */
        get tabOn() {
            const raw = getV('cit_tabon', null);
            if (raw == null) return getV('cit_hideTab', false) ? {} : { everywhere: true };
            try {
                const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
                return (o && typeof o === 'object') ? o : { everywhere: true };
            } catch (e) { return { everywhere: true }; }
        },
        set tabOn(v)     { setV('cit_tabon', JSON.stringify(v || {})); }
    };

    const TTL = { catalogue: 7 * 24 * 3600e3, ocDefs: 7 * 24 * 3600e3, names: 7 * 24 * 3600e3,
                  keyInfo: 3600e3, inventory: 60e3, oc: 120e3 };

    function cacheGet(name, ttl) {
        const raw = getV('cit_cache_' + name, null);
        if (!raw) return null;
        try {
            const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (Date.now() - o.t > ttl) return null;
            return o.d;
        } catch (e) { return null; }
    }
    function cacheSet(name, data) {
        setV('cit_cache_' + name, JSON.stringify({ t: Date.now(), d: data }));
    }

    /* ==================================================================
       SECTION 3 — API LAYER
       ================================================================== */

    const API = {
        lastCall: 0,
        async raw(path) {
            const key = S.key;
            if (!key) throw new Error('no key');
            // simple throttle: max ~1 call / 700ms (limit is 100/min)
            const wait = Math.max(0, 700 - (Date.now() - API.lastCall));
            if (wait) await new Promise(r => setTimeout(r, wait));
            API.lastCall = Date.now();

            const url = 'https://api.torn.com/' + path + (path.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(key);
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET', url, timeout: 15000,
                    onload: r => {
                        let j;
                        try { j = JSON.parse(r.responseText); }
                        catch (e) { return reject(new Error('bad JSON from ' + path)); }
                        if (j.error) return reject(Object.assign(new Error(j.error.error), { code: j.error.code }));
                        resolve(j);
                    },
                    onerror: () => reject(new Error('network error on ' + path)),
                    ontimeout: () => reject(new Error('timeout on ' + path))
                });
            });
        }
    };

    const DATA = { catalogue: null, inventory: null, oc: null, ocIndex: null,
                   ocDefs: null, ocDefIndex: null, self: null, keyInfo: null,
                   domInv: null, domQty: null, domNameToId: null, names: null,
                   armoury: null, facOC: null, ocReadAt: null, errors: {} };

    /* Ask Torn what this key is actually allowed to do, so the panel can report
       missing selections instead of the script failing silently. */
    async function loadKeyInfo() {
        const cached = cacheGet('keyinfo', TTL.keyInfo);
        if (cached) { DATA.keyInfo = cached; return cached; }
        try {
            const j = await API.raw('key/?selections=info');
            cacheSet('keyinfo', j);
            DATA.keyInfo = j;
            LOG('key access level:', j.access_level, '(' + j.access_type + ')');
            return j;
        } catch (e) {
            WARN('key info failed:', e.message);
            DATA.keyInfo = null;
            return null;
        }
    }

    // Does the key expose a given selection? null = unknown.
    function keyHas(section, selection) {
        const k = DATA.keyInfo;
        if (!k || !k.selections) return null;
        const list = k.selections[section];
        return Array.isArray(list) ? list.includes(selection) : null;
    }

    // id -> name, and name(lower) -> id
    async function loadCatalogue() {
        let c = cacheGet('catalogue', TTL.catalogue);
        if (!c) {
            const j = await API.raw('torn/?selections=items');
            c = {};
            for (const id in j.items) c[id] = j.items[id].name;
            cacheSet('catalogue', c);
            LOG('item catalogue loaded:', Object.keys(c).length, 'items');
        }
        DATA.catalogue = c;
        DATA.nameToId = {};
        for (const id in c) DATA.nameToId[c[id].toLowerCase()] = id;
        return c;
    }

    /* id -> quantity.
       v1 returns { inventory: [ {ID, name, quantity, ...} ] }, but tolerate an
       object-keyed map and the v2 spelling too rather than silently ending up
       with an empty inventory. */
    function parseInventory(j) {
        const raw = j.inventory || j.items || null;
        if (!raw) return null;
        const list = Array.isArray(raw) ? raw : Object.keys(raw).map(k => {
            const v = raw[k];
            return (v && typeof v === 'object') ? Object.assign({ ID: v.ID || v.id || k }, v) : null;
        }).filter(Boolean);
        const inv = {};
        list.forEach(it => {
            const id = it.ID ?? it.id ?? (it.item && it.item.id);
            const q  = it.quantity ?? it.qty ?? it.amount;
            if (id != null && q != null) inv[id] = q;
        });
        return Object.keys(inv).length ? inv : null;
    }

    async function loadInventory() {
        let inv = cacheGet('inventory', TTL.inventory);
        if (!inv) {
            /* Torn has RETIRED the inventory API: user/?selections=inventory
               replies "The inventory selection is no longer available", and the
               v2 replacement (v2/user/items) refuses anything below Full access
               -- which is far more than this script should ever ask for.
               So we only attempt it when the key already happens to be that
               high, and otherwise rely entirely on quantities read from the
               item pages. No point spending calls on a certain failure. */
            const lvl = DATA.keyInfo && DATA.keyInfo.access_level;
            if (!(lvl >= 4)) {
                throw new Error('Torn retired the inventory API; using quantities from item pages');
            }
            const j = await API.raw('v2/user/items');
            const parsed = parseInventory(j);
            if (!parsed) {
                LOG('RAW payload from v2/user/items (empty/unparsed):', JSON.parse(JSON.stringify(j)));
                throw new Error('v2/user/items returned nothing usable');
            }
            inv = parsed;
            LOG('inventory loaded from v2/user/items:', Object.keys(inv).length, 'stacks');
            cacheSet('inventory', inv);
        }
        DATA.inventory = inv;
        return inv;
    }

    /* Own player ID — needed to tell "my slot" from "someone else's slot". */
    async function loadSelf() {
        let s = cacheGet('self', TTL.catalogue);
        if (!s) {
            const j = await API.raw('user/?selections=basic');
            s = { id: j.player_id, name: j.name };
            cacheSet('self', s);
        }
        DATA.self = s;
        return s;
    }

    /* The OC you are personally in. Confirmed to work on a Limited key with no
       faction API permission: GET /v2/user/organizedcrime */
    async function loadOwnOC() {
        let oc = cacheGet('oc', TTL.oc);
        if (!oc) {
            try {
                const j = await API.raw('v2/user/organizedcrime');
                oc = j.organizedCrime || null;
                cacheSet('oc', oc);
                if (oc) LOG('OC loaded:', oc.name, '—', oc.status, '— ready', new Date(oc.ready_at * 1000).toLocaleString());
                else LOG('not currently in an OC');
            } catch (e) {
                WARN('OC feed failed:', e.message, '(code', e.code + ')');
                DATA.oc = null; DATA.ocIndex = null;
                return null;
            }
        }
        DATA.oc = oc;
        DATA.ocReadAt = Date.now();
        DATA.ocIndex = buildOcIndex(oc);
        Object.keys(DATA.ocIndex || {}).forEach(id => {
            DATA.ocIndex[id].itemName =
                (DATA.catalogue && DATA.catalogue[id])
                || (DATA.ocDefIndex && DATA.ocDefIndex[id] && DATA.ocDefIndex[id].name)
                || ('item ' + id);
        });
        reconcileWithOC();
        return oc;
    }

    /* The OC payload identifies teammates by id only. Resolve those to names so
       the tooltip can say who is short of an item rather than "profile".
       user/<id>?selections=basic works for other players on your own key. */
    async function loadMemberNames() {
        const names = cacheGet('names', TTL.names) || {};
        DATA.names = names;
        if (!DATA.oc || !Array.isArray(DATA.oc.slots)) return names;

        const ids = DATA.oc.slots
            .map(sl => sl.user && sl.user.id)
            .filter((id, i, a) => id && a.indexOf(id) === i && !names[id]);

        for (const id of ids) {
            try {
                const j = await API.raw('user/' + id + '?selections=basic');
                if (j && j.name) names[id] = j.name;
            } catch (e) {
                WARN('name lookup failed for', id, '-', e.message);
            }
        }
        cacheSet('names', names);
        DATA.names = names;
        return names;
    }

    const memberName = id => (DATA.names && DATA.names[id]) || null;

    const ARMOURY_URL = 'https://www.torn.com/factions.php?step=your&type=1'
                      + '#/tab=armoury&start=0&sub=utilities';

    /* A teammate's name links to the faction armoury rather than their profile,
       carrying what to loan and to whom. The handler stashes that, then lets the
       navigation happen normally. */
    function loanLink(itemId, itemName, userId, fallbackName) {
        const nm = memberName(userId) || fallbackName || ('ID ' + userId);
        return `<a class="cit-tip-who" href="${ARMOURY_URL}"` +
               ` data-cit-loan="${esc(String(itemId))}" data-cit-uid="${esc(String(userId))}"` +
               ` data-cit-item="${esc(itemName || '')}"` +
               ` data-cit-name="${esc(memberName(userId) || fallbackName || '')}"` +
               ` title="Open the faction armoury and set up a loan of ${esc(itemName || 'this item')}` +
               ` to ${esc(nm)}">${esc(nm)}</a>`;
    }

    document.addEventListener('click', e => {
        const a = e.target && e.target.closest && e.target.closest('a[data-cit-loan]');
        if (!a) return;
        setV('cit_loan_intent', JSON.stringify({
            itemId:   a.getAttribute('data-cit-loan'),
            itemName: a.getAttribute('data-cit-item'),
            userId:   a.getAttribute('data-cit-uid'),
            userName: a.getAttribute('data-cit-name'),
            ts: Date.now()
        }));
    }, true);

    /* A missing item's own name links to the faction armoury and asks the
       helper to find and highlight that item's row. No member is involved --
       this is "show me where it is", not a loan, so nothing is copied and
       nothing is filled in. */
    function grabLink(itemId, itemName, cls) {
        return `<a class="cit-grab${cls ? ' ' + cls : ''}" href="${ARMOURY_URL}"` +
               ` data-cit-grab="${esc(String(itemId))}"` +
               ` data-cit-item="${esc(itemName || '')}"` +
               ` title="Open the faction armoury and highlight ${esc(itemName || 'this item')}">` +
               `${esc(itemName || 'item')}</a>`;
    }

    document.addEventListener('click', e => {
        const a = e.target && e.target.closest && e.target.closest('a[data-cit-grab]');
        if (!a) return;
        setV('cit_loan_intent', JSON.stringify({
            itemId:   a.getAttribute('data-cit-grab'),
            itemName: a.getAttribute('data-cit-item'),
            grab: true,
            ts: Date.now()
        }));
    }, true);

    /* itemId -> { total, mine, missing, reusable, slots:[labels], crime, ready_at } */
    function buildOcIndex(oc) {
        if (!oc || !Array.isArray(oc.slots)) return null;
        const myId = DATA.self && DATA.self.id;
        const idx = {};
        oc.slots.forEach(s => {
            const req = s.item_requirement;
            if (!req || !req.id) return;
            const e = idx[req.id] || (idx[req.id] = {
                total: 0, mine: false, missing: 0, reusable: !!req.is_reusable,
                slots: [], missingSlots: [], crime: oc.name, status: oc.status,
                ready_at: oc.ready_at, itemId: req.id, itemName: null
            });
            e.total++;
            const label = (s.position_info && s.position_info.label) || s.position || '?';
            e.slots.push(label);
            const uid = s.user && s.user.id;
            if (!req.is_available) {
                e.missing++;
                /* Your own shortfall is already called out separately, so the
                   teammate list covers everyone but you. */
                if (!myId || uid !== myId) e.missingSlots.push({ label, userId: uid });
            }
            if (myId && s.user && s.user.id === myId) {
                e.mine = true;
                e.myAvailable = !!req.is_available;
                e.mySlot = label;
                e.myProgress = s.user.progress;
            }
        });
        return idx;
    }

    /* AUTHORITATIVE OC definitions — every OC scenario, every slot, every item.
       GET /v2/torn/organizedcrimes. Slot shape:
         { name, position_info:{id,label,number}, required_item:{id,name,is_used}|null }
       NOTE: is_used === true means CONSUMED (opposite polarity to the user
       endpoint's is_reusable). */
    async function loadOcDefs() {
        let defs = cacheGet('ocdefs', TTL.ocDefs);
        if (!defs) {
            try {
                const j = await API.raw('v2/torn/organizedcrimes');
                defs = j.organizedcrimes || j.organizedCrimes || null;
                if (!Array.isArray(defs)) throw new Error('unexpected shape');
                cacheSet('ocdefs', defs);
                LOG('OC definitions loaded:', defs.length, 'scenarios');
            } catch (e) {
                WARN('OC definitions failed:', e.message, '— falling back to the built-in table');
                DATA.ocDefs = null; DATA.ocDefIndex = null;
                return null;
            }
        }
        DATA.ocDefs = defs;
        DATA.ocDefIndex = buildOcDefIndex(defs);
        return defs;
    }

    /* itemId -> { name, uses:[{crime,label,consumed,difficulty}], crimes:[names], consumed:bool } */
    function buildOcDefIndex(defs) {
        if (!Array.isArray(defs)) return null;
        const idx = {};
        defs.forEach(oc => {
            (oc.slots || []).forEach(s => {
                const ri = s.required_item;
                if (!ri || !ri.id) return;
                const e = idx[ri.id] || (idx[ri.id] = {
                    name: ri.name, uses: [], crimes: [], consumed: false
                });
                e.uses.push({
                    crime: oc.name,
                    label: (s.position_info && s.position_info.label) || s.name,
                    consumed: !!ri.is_used,
                    difficulty: oc.difficulty
                });
                if (!e.crimes.includes(oc.name)) e.crimes.push(oc.name);
                if (ri.is_used) e.consumed = true;
            });
        });
        LOG('OC item index built:', Object.keys(idx).length, 'distinct items across', defs.length, 'crimes');
        return idx;
    }

    /* Items your own position needs that you do not own. These can never appear
       as a badge -- you don't have the item, so there is no inventory row to
       attach one to -- so they surface as a banner and in the panel instead. */
    function myMissingItems() {
        if (!DATA.ocIndex) return [];
        return Object.keys(DATA.ocIndex)
            .filter(id => DATA.ocIndex[id].mine && !DATA.ocIndex[id].myAvailable)
            .map(id => ({
                id,
                name: (DATA.catalogue && DATA.catalogue[id])
                      || (DATA.ocDefIndex && DATA.ocDefIndex[id] && DATA.ocDefIndex[id].name)
                      || ('item ' + id),
                slot: DATA.ocIndex[id].mySlot,
                crime: DATA.ocIndex[id].crime,
                ready_at: DATA.ocIndex[id].ready_at
            }));
    }

    /* Torn tells us directly whether the item for our own position is available.
       That beats anything scraped from a page, so correct the stored quantity
       when the two disagree -- otherwise a sold item reads as still held. */
    function reconcileWithOC() {
        if (!DATA.ocIndex || !DATA.domInv) return;
        let dirty = false;
        Object.keys(DATA.ocIndex).forEach(id => {
            const e = DATA.ocIndex[id];
            if (!e.mine || e.myAvailable) return;
            if (DATA.domInv[id] && DATA.domInv[id].q !== 0) {
                LOG('OC says you do not have item', id, '- clearing stale stored quantity',
                    DATA.domInv[id].q);
                DATA.domInv[id] = { q: 0, c: DATA.domInv[id].c || '' };
                dirty = true;
            }
        });
        if (dirty) {
            rebuildDomQty();
            try { setV('cit_dominv', JSON.stringify(DATA.domInv)); } catch (e) {}
        }
    }

    const fmtLeft = ts => {
        const s = ts - Math.floor(Date.now() / 1000);
        if (s <= 0) return 'ready now';
        const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
        return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
    };

    /* ==================================================================
       SECTION 4 — LOOKUP
       ================================================================== */

    const LOOKUP = {};
    for (const k in ITEMS) LOOKUP[k.toLowerCase()] = ITEMS[k];

    // itemId -> crime data, built once the catalogue is available
    let BY_ID = null;
    function buildIdMap() {
        if (!DATA.catalogue) return;
        BY_ID = {};
        for (const id in DATA.catalogue) {
            const nm = DATA.catalogue[id];
            const t = tagsForName(nm);
            if (t) BY_ID[id] = t;
        }
        LOG('ID map built:', Object.keys(BY_ID).length, 'tagged items');
    }

    function tagsForName(name) {
        const key = String(name).trim().toLowerCase();
        if (LOOKUP[key]) return LOOKUP[key];
        for (const r of PREFIX_RULES) if (r.test(name)) return r.data(name);
        return null;
    }

    function tagsFor(id, name) {
        if (BY_ID && id && BY_ID[id]) return BY_ID[id];
        return tagsForName(name);
    }

    /* Effective inventory: the API's if it ever works, otherwise the one
       harvested from the pages you browse. */
    const effInv = () => DATA.inventory || DATA.domQty || null;

    const qtyOf = id => {
        const inv = effInv();
        return (inv && id in inv) ? inv[id] : null;
    };

    /* ---- DOM-harvested inventory -------------------------------------
       Torn's v1 inventory selection returns an empty array and v2 has no
       inventory endpoint ("Incorrect category"), so we accumulate quantities
       from the item rows themselves. Each category tab you open adds its items
       to a persistent store, so coverage and the Forgery planner fill in as you
       browse rather than needing one big API call. */
    function loadDomInv() {
        try {
            const raw = getV('cit_dominv', null);
            const parsed = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
            /* Migrate the old {id: qty} shape to {id: {q, c}} so we can prune by
               category. */
            DATA.domInv = {};
            Object.keys(parsed).forEach(id => {
                const v = parsed[id];
                DATA.domInv[id] = (v && typeof v === 'object')
                    ? { q: v.q, c: v.c || '' }
                    : { q: v, c: '' };
            });
        } catch (e) { DATA.domInv = {}; }
        rebuildDomQty();
        return DATA.domInv;
    }

    /* Flat {id: qty} view for everything that just wants a number. */
    function rebuildDomQty() {
        DATA.domQty = {};
        DATA.domNameToId = {};
        Object.keys(DATA.domInv || {}).forEach(id => {
            DATA.domQty[id] = DATA.domInv[id].q;
            const n = DATA.domInv[id].n;
            if (n) DATA.domNameToId[n.toLowerCase()] = id;
        });
    }

    /* Name -> id from the API catalogue when there is a key, otherwise from the
       rows already seen. Without this the coverage sections stay blank for
       anyone running without a key. */
    const idForName = nm => {
        const k = String(nm).toLowerCase();
        return (DATA.nameToId && DATA.nameToId[k])
            || (DATA.domNameToId && DATA.domNameToId[k])
            || null;
    };
    const haveNameIndex = () => !!((DATA.nameToId && Object.keys(DATA.nameToId).length) ||
                                   (DATA.domNameToId && Object.keys(DATA.domNameToId).length));

    function harvestDomInv(rowList) {
        if (!visible()) return false;   // never read a tab you are not looking at
        if (!DATA.domInv) loadDomInv();
        let dirty = false;
        const seenCats = {}, seenIds = {};

        rowList.forEach(row => {
            const id = row.getAttribute('data-item');
            if (!id) return;
            const cat = row.getAttribute('data-category') || '';
            const dq  = parseInt(row.getAttribute('data-qty'), 10);
            const q   = isNaN(dq) ? 1 : dq;        // no data-qty means a single item
            const nmEl = row.querySelector('.name-wrap .name') || row.querySelector('.name');
            const nm = nmEl ? (nmEl.textContent || '').trim() : '';
            seenCats[cat] = 1; seenIds[id] = 1;
            const prev = DATA.domInv[id];
            if (!prev || prev.q !== q || prev.c !== cat || (nm && prev.n !== nm)) {
                DATA.domInv[id] = { q, c: cat, n: nm || (prev && prev.n) || '' };
                dirty = true;
            }
        });

        /* A sold or spent item simply vanishes from the page, so without this the
           old quantity would linger forever. Any category fully on screen is
           re-stated: drop stored items of that category we no longer see. */
        Object.keys(DATA.domInv).forEach(id => {
            const e = DATA.domInv[id];
            if (e && seenCats[e.c] && !seenIds[id]) { delete DATA.domInv[id]; dirty = true; }
        });

        if (dirty) {
            rebuildDomQty();
            try { setV('cit_dominv', JSON.stringify(DATA.domInv)); } catch (e) {}
        }
    }

    /* Which Crimes 2.0 crimes use this item. The table stores a free-text
       description, so match the 13 crime names against it, and treat anything
       appearing in a forgery recipe as a Forgery item too. */
    const CRIME_NAMES = ['Search For Cash', 'Bootlegging', 'Graffiti', 'Shoplifting',
        'Pickpocketing', 'Card Skimming', 'Burglary', 'Hustling', 'Disposal',
        'Cracking', 'Forgery', 'Scamming', 'Arson'];

    function crimesFor(t, name) {
        const out = [];
        if (t && t.c) {
            const hay = t.c.toLowerCase();
            CRIME_NAMES.forEach(c => { if (hay.includes(c.toLowerCase())) out.push(c); });
        }
        if (name && forgeryUsesOf(name).length && !out.includes('Forgery')) out.push('Forgery');
        return out;
    }

    const ocFor    = id => (DATA.ocIndex && id && DATA.ocIndex[id]) ? DATA.ocIndex[id] : null;
    const ocDefFor = id => (DATA.ocDefIndex && id && DATA.ocDefIndex[id]) ? DATA.ocDefIndex[id] : null;

    /* Forgery: which projects can be completed right now */
    function forgeryReadiness() {
        const inv = effInv();
        if (!inv || !haveNameIndex()) return null;
        const have = nm => {
            const id = idForName(nm);
            return id ? (inv[id] || 0) : 0;
        };
        const ready = [], blocked = [];
        for (const proj in FORGERY) {
            const missing = FORGERY[proj].filter(m => have(m) < 1);
            if (missing.length) blocked.push({ proj, missing });
            else ready.push(proj);
        }
        return { ready, blocked };
    }

    /* Coverage for every crime, not just Forgery: group the built-in item table
       by crime and check what you hold. */
    function crimeCoverage() {
        const inv = effInv();
        const idOf = idForName;
        const qty  = nm => { const id = idOf(nm); return (id && inv && inv[id]) ? inv[id] : 0; };
        const known = !!(inv && haveNameIndex());

        const byCrime = {};
        Object.keys(ITEMS).forEach(nm => {
            const t = ITEMS[nm];
            if (!t.c) return;
            crimesFor(t, nm).forEach(c => { (byCrime[c] = byCrime[c] || []).push(nm); });
        });

        let heldTotal = 0, allTotal = 0;
        const blocks = Object.keys(byCrime).sort().map(c => {
            const items = byCrime[c].slice().sort();
            const held = items.filter(nm => qty(nm) > 0);
            heldTotal += held.length; allTotal += items.length;

            const lines = items.map(nm => {
                const q = qty(nm);
                return `<div class="${q > 0 ? 'ok' : 'bad'}">${esc(nm)}` +
                       `${q > 0 ? ' \u00D7' + q : ' \u2014 none'}</div>`;
            }).join('');

            let extra = '';
            if (c === 'Forgery') {
                const f = forgeryReadiness();
                if (f) extra =
                    `<div class="cit-sub">Projects you can make now (${f.ready.length}): ` +
                    `<span class="${f.ready.length ? 'ok' : 'muted'}">` +
                    `${f.ready.map(esc).join(', ') || '\u2014'}</span></div>` +
                    `<div class="cit-sub">Blocked (${f.blocked.length}):</div>` +
                    `<div class="muted">${f.blocked.map(b =>
                        `${esc(b.proj)} \u2014 needs ${esc(b.missing.join(', '))}`).join('<br>') || '\u2014'}</div>`;
            }

            return `<details class="cit-crime"${secOpen('crime:' + c) ? ' open' : ''}` +
                   ` data-sec="crime:${esc(c)}"><summary>${esc(c)} ` +
                   `<span class="cit-sum-note">${known ? held.length + '/' + items.length
                                                       : items.length + ' items'}</span>` +
                   `</summary>${lines}${extra}</details>`;
        }).join('');

        return {
            html: (known ? '' : '<div class="muted">Quantities fill in as you open item tabs.</div>')
                  + blocks,
            summary: known ? `${heldTotal} of ${allTotal} items held` : `${allTotal} items tracked`
        };
    }

    /* Remember which sections the user left open. */
    /* Feature List and Status start expanded so a fresh install looks exactly as
       it did before they became collapsible; CIT button starts folded because
       most people set it once. Whatever the user leaves open is remembered. */
    const SEC_DEFAULT = { oc: true, features: true, status: true, tabpages: false };
    const secOpen = k => getV('cit_sec_' + k, !!SEC_DEFAULT[k]);

    /* One-line gists for the collapsed Feature List / CIT button / Status
       summaries, so folding a section does not hide whether it needs attention. */
    function tabWhereNote() {
        const on = S.tabOn;
        if (on.everywhere) return 'everywhere';
        const n = TAB_PAGES.filter(pg => pg.k !== 'everywhere' && on[pg.k]).length;
        if (!n) return 'hidden';
        return n + (n > 1 ? ' pages' : ' page');
    }

    function statusNote() {
        if (LOADING) return 'refreshing\u2026';
        const bad = Object.keys(DATA.errors || {}).length;
        if (bad) return bad + (bad > 1 ? ' errors' : ' error');
        if (!S.useApi || !S.key) return 'no API key';
        return 'ok';
    }
    const secSet  = (k, v) => setV('cit_sec_' + k, !!v);

    function forgeryUsesOf(material) {
        const out = [];
        for (const proj in FORGERY) if (FORGERY[proj].some(m => m.toLowerCase() === material.toLowerCase())) out.push(proj);
        return out;
    }

    /* ==================================================================
       SECTION 5 — RENDERING
       ================================================================== */

    const css = document.createElement('style');
    css.textContent = `
        .cit-badge { display:inline-block !important; margin-left:6px; padding:0 5px;
            border-radius:3px; font-size:10px !important; font-weight:bold; line-height:14px;
            vertical-align:middle; letter-spacing:.5px; cursor:help; white-space:nowrap;
            box-shadow:0 0 0 1px rgba(0,0,0,.4); position:relative; z-index:5;
            top:8px;  /* vertical nudge — raise/lower here */
            float:none !important; visibility:visible !important; opacity:1 !important;
            width:auto !important; height:auto !important; text-indent:0 !important; }
        /* Shop / bazaar / item-market rows sit the name lower than the Items
           page does, so the shared 8px nudge reads as far too low there.
           Raise/lower the shop badges here -- more negative = higher. */
        html.cit-sell .cit-badge { top:-1px !important; }
        .cit-c      { background:#b8860b; color:#fff; }
        .cit-oc     { background:#8b1a1a; color:#fff; }
        .cit-locked { background:#4a4a4a; color:#bbb; }
        .cit-alert  { background:#c0392b; color:#fff; animation:cit-pulse 1.4s ease-in-out infinite; }
        @keyframes cit-pulse { 0%,100%{opacity:1} 50%{opacity:.55} }
        .cit-dimmed { opacity:.45; }
        li.cit-alert { outline:1px solid rgba(192,57,43,.8); outline-offset:-1px; }

        /* Banner for items your own position needs but you do not own. There is
           no inventory row for a missing item, so a badge could never show it. */
        #cit-banner { position:fixed; top:0; left:50%; transform:translateX(-50%);
            z-index:2147483550; max-width:640px; width:calc(100% - 24px);
            background:#7a1c14; color:#fff; border:1px solid #c0392b; border-top:none;
            border-radius:0 0 6px 6px; padding:9px 38px 9px 14px;
            font:13px/1.45 Arial,sans-serif; box-shadow:0 4px 18px rgba(0,0,0,.6); }
        #cit-banner b { color:#ffd9d4; }
        #cit-banner .cit-banner-sub { font-size:11px; color:#f0bdb6; margin-top:2px; }
        #cit-banner .cit-banner-x { position:absolute; top:6px; right:10px; cursor:pointer;
            color:#f0bdb6; font-size:15px; line-height:1; }
        #cit-banner .cit-banner-x:hover { color:#fff; }
        #cit-banner .cit-recopy { color:#fff; text-decoration:underline; cursor:pointer;
            margin-left:4px; }



        /* Right-edge button, same idiom as the HT / FF tabs. */
        #cit-tip { position:fixed; display:none; z-index:2147483600; max-width:330px;
            background:#191919; color:#ddd; border:1px solid #555; border-radius:6px;
            padding:10px 12px; font:12px/1.5 Arial,sans-serif; pointer-events:auto;
            box-shadow:0 6px 22px rgba(0,0,0,.75); }
        #cit-tip .cit-tip-head { font-weight:bold; font-size:13px; margin-bottom:1px; }
        #cit-tip .cit-tip-sub { color:#999; font-size:11px; margin-bottom:7px; }
        #cit-tip .cit-tip-p { margin:3px 0; }
        #cit-tip .cit-tip-label { color:#d4a017; font-size:11px; text-transform:uppercase;
            letter-spacing:.5px; margin:8px 0 2px; }
        #cit-tip .cit-tip-dim { color:#8f8f8f; }
        #cit-tip .cit-tip-ok { color:#6ab04c; margin:5px 0; }
        #cit-tip .cit-tip-warn { color:#e05c4b; margin:5px 0; }
        #cit-tip .cit-tip-have { margin-top:9px; padding-top:7px; border-top:1px solid #3a3a3a;
            color:#bbb; }
        #cit-tip .cit-tip-crime { margin:7px 0; padding-left:8px; border-left:2px solid #444; }
        #cit-tip .cit-tip-crime-name { color:#eee; font-weight:bold; }
        #cit-tip .cit-tip-who { color:#8ab4f8; text-decoration:none; font-weight:bold; }
        #cit-tip .cit-tip-who:hover { text-decoration:underline; }
        #cit-tip .cit-tip-diff { color:#888; font-weight:normal; font-size:11px; margin-left:6px; }

        #cit-tab { position:fixed; right:0; top:55%; z-index:2147483000;
            background:#1c1c1c; color:#d4a017; border:2px solid #d4a017; border-right:none;
            border-radius:4px 0 0 4px; width:30px; height:30px; line-height:28px;
            text-align:center; cursor:pointer; user-select:none;
            font:bold 11px/28px Arial,sans-serif; letter-spacing:0;
            box-shadow:-2px 2px 8px rgba(0,0,0,.6); transition:background .15s; }
        #cit-tab:hover { background:#3a3a3a; }
        #cit-tab .cit-dot { position:absolute; top:-4px; left:-4px; width:9px; height:9px;
            border-radius:50%; background:#c0392b; border:1px solid #000;
            animation:cit-pulse 1.4s ease-in-out infinite; }

        /* Sits above Torn's own chrome (its bottom icon bar and chat sit high in
           the stacking order), and is lifted clear of that bar so the last rows
           stay readable. */
        #cit-panel { position:fixed; bottom:90px; right:40px; width:340px;
            max-height:calc(100vh - 140px);
            overflow:auto; background:#2b2b2b; color:#ddd; border:1px solid #666;
            border-radius:5px; padding:12px; z-index:2147483500;
            font:12px/1.5 Arial,sans-serif; box-shadow:0 8px 30px rgba(0,0,0,.8); }
        #cit-panel h3 { margin:0 0 8px; font-size:13px; color:#d4a017; }
        #cit-panel h4 { margin:12px 0 4px; font-size:12px; color:#d4a017; border-top:1px solid #444; padding-top:8px; }
        #cit-panel input[type=text] { width:100%; box-sizing:border-box; background:#1c1c1c;
            border:1px solid #555; color:#ddd; padding:5px; border-radius:3px; font-family:monospace; }
        #cit-panel button { background:#444; border:1px solid #666; color:#ddd; padding:4px 10px;
            border-radius:3px; cursor:pointer; margin:6px 6px 0 0; }
        #cit-panel button:hover { background:#555; }
        #cit-panel label { display:block; margin:4px 0; cursor:pointer; }
        #cit-panel .cit-spin { display:inline-block; width:9px; height:9px; margin-right:5px;
            border:2px solid #999; border-top-color:transparent; border-radius:50%;
            vertical-align:-1px; animation:cit-rot .7s linear infinite; }
        @keyframes cit-rot { to { transform:rotate(360deg); } }

        #cit-panel details > summary { cursor:pointer; color:#d4a017; font-size:12px;
            font-weight:bold; margin:12px 0 4px; padding-top:8px; border-top:1px solid #444;
            list-style:none; user-select:none; }
        #cit-panel details > summary::-webkit-details-marker { display:none; }
        #cit-panel details > summary:before { content:'\u25B8 '; }
        #cit-panel details[open] > summary:before { content:'\u25BE '; }
        #cit-panel details.cit-crime > summary { color:#ccc; font-weight:normal; font-size:12px;
            border-top:none; margin:5px 0 2px; padding-top:0; }
        #cit-panel details.cit-crime { margin-left:2px; }
        #cit-panel .cit-sum-note { color:#888; font-weight:normal; }
        #cit-panel .cit-sub { margin:4px 0 2px; color:#aaa; }

        #cit-panel .ok   { color:#6ab04c; }
        #cit-panel .bad  { color:#c0392b; }
        #cit-panel a.cit-grab, #cit-tip a.cit-grab { color:#8ab4f8; text-decoration:underline;
            text-decoration-style:dotted; text-underline-offset:2px; cursor:pointer; }
        #cit-panel a.cit-grab:hover, #cit-tip a.cit-grab:hover { color:#aecbfa;
            text-decoration-style:solid; }
        #cit-panel .muted{ color:#888; }
        #cit-close { float:right; cursor:pointer; color:#888; }
    `;
    document.head.appendChild(css);

    function badge(kind, tipHtml, text) {
        const s = document.createElement('span');
        s.className = 'cit-badge cit-' + kind;
        s.textContent = text || kind.toUpperCase();
        s._citTip = tipHtml;
        s.dataset.cit = '1';
        return s;
    }

    /* ---- Hover tooltip -------------------------------------------------
       The native title attribute collapses newlines into one run-on line, so
       we render our own panel. */
    let LOADING = false;
    let tipEl = null, tipOwner = null;

    function ensureTipEl() {
        if (tipEl && document.body.contains(tipEl)) return tipEl;
        tipEl = document.createElement('div');
        tipEl.id = 'cit-tip';
        document.body.appendChild(tipEl);
        return tipEl;
    }

    function positionTip(x, y) {
        const d = ensureTipEl();
        const r = d.getBoundingClientRect();
        let left = x + 16, top = y + 16;
        if (left + r.width > window.innerWidth - 10) left = x - r.width - 16;
        if (top + r.height > window.innerHeight - 10) top = y - r.height - 16;
        d.style.left = Math.max(8, left) + 'px';
        d.style.top  = Math.max(8, top) + 'px';
    }

    function hideTip() {
        tipOwner = null;
        if (tipEl) tipEl.style.display = 'none';
    }

    /* Never let the tooltip sit under the cursor's landing spot. */
    function positionTipSafe(x, y) { positionTip(x, y); }

    /* The tooltip contains links, so it has to stay put while the cursor travels
       from the badge into it. Hide on a short delay instead of immediately, and
       cancel that delay if the cursor lands on the tooltip. */
    let hideTimer = null;
    const cancelHide = () => { if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; } };
    const scheduleHide = () => { cancelHide(); hideTimer = setTimeout(hideTip, 260); };

    document.addEventListener('mouseover', e => {
        const t = e.target;
        if (!t || !t.closest) return;
        if (t.closest('#cit-tip')) { cancelHide(); return; }
        const b = t.closest('[data-cit="1"]');
        if (!b || !b._citTip) return;
        cancelHide();
        const d = ensureTipEl();
        if (tipOwner !== b) { tipOwner = b; d.innerHTML = b._citTip; d.style.display = 'block'; }
        positionTip(e.clientX, e.clientY);
    }, true);

    document.addEventListener('mousemove', e => {
        if (!tipOwner || !e.target || !e.target.closest) return;
        if (e.target.closest('#cit-tip')) return;               // let it be read
        if (e.target.closest('[data-cit="1"]') === tipOwner) positionTip(e.clientX, e.clientY);
    }, true);

    document.addEventListener('mouseout', e => {
        const t = e.target;
        if (!t || !t.closest) return;
        if (t.closest('#cit-tip') || t.closest('[data-cit="1"]') === tipOwner) scheduleHide();
    }, true);

    window.addEventListener('scroll', hideTip, true);

    /* ---- Tooltip content ---------------------------------------------- */

    const tipShell = (accent, heading, sub, body) =>
        `<div class="cit-tip-head" style="color:${accent}">${esc(heading)}</div>` +
        (sub ? `<div class="cit-tip-sub">${esc(sub)}</div>` : '') + body;

    const haveLine = q => q === null ? ''
        : `<div class="cit-tip-have">In your inventory: <b>${q}</b></div>`;

    /* The stored description often repeats the crime name ("Burglary: Beach Hut
       ..."), which reads badly under a "Burglary" heading. Strip that prefix,
       and turn "Enhancer: <crime>" into plain words. */
    function descFor(t, crime) {
        const rx = crime.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const m = t.c.match(/^Enhancer:\s*(.*)$/i);
        if (m) {
            let rest = m[1].replace(new RegExp('^' + rx, 'i'), '')
                           .replace(/^\s*[\/\-\u2013\u2014]\s*/, '').trim();
            const wrapped = rest.match(/^\((.*)\)$/);      // "(halves production time)"
            if (wrapped) rest = wrapped[1];
            return rest ? `Crime enhancer \u2014 ${rest}` : 'Crime enhancer';
        }
        return t.c.replace(new RegExp('^' + rx + '\\s*:\\s*', 'i'), '');
    }

    function crimeTip(t, name, q, crimes) {
        const sub = crimes.length
            ? `Used in ${crimes.length} crime${crimes.length > 1 ? 's' : ''}`
            : '';
        let body = crimes.map(c =>
            `<div class="cit-tip-crime"><div class="cit-tip-crime-name">${esc(c)}</div>` +
            `<div class="cit-tip-dim">${esc(descFor(t, c))}</div></div>`).join('');
        if (!crimes.length) body = `<div class="cit-tip-p">${esc(t.c)}</div>`;

        const uses = forgeryUsesOf(name);
        if (uses.length) {
            body += `<div class="cit-tip-label">Used to forge</div>`;
            body += uses.map(u => `<div class="cit-tip-p">${esc(u)}</div>`).join('');
        }
        if (t.skill) body += `<div class="cit-tip-warn">You need ${esc(t.skill.crime)} skill ` +
                             `${t.skill.level} before you can use this.</div>`;
        return tipShell('#e8b93a', 'Crime item', sub, body + haveLine(q));
    }

    function ocLiveTip(live, q, def) {
        const sub = `${live.status} — starts in ${fmtLeft(live.ready_at)}`;
        let body = '';
        if (live.mine) {
            body += live.myAvailable
                ? `<div class="cit-tip-ok">Your slot (${esc(live.mySlot)}) has this item.</div>`
                : `<div class="cit-tip-warn">Your slot (${esc(live.mySlot)}) is missing this item.</div>`;
        }
        body += `<div class="cit-tip-label">Positions needing it</div>` +
                `<div class="cit-tip-p">${esc(live.slots.join(', '))}</div>`;
        const others = live.missingSlots || [];
        if (others.length) {
            /* is_available === false means the member IN that position does not
               have the item -- it does NOT mean the position is empty. */
            body += `<div class="cit-tip-warn">${others.length} teammate` +
                    `${others.length > 1 ? 's do' : ' does'} not have this item yet:</div>`;
            body += others.map(m =>
                `<div class="cit-tip-p cit-tip-dim">${esc(m.label)}` +
                (m.userId ? ` \u2014 ${loanLink(live.itemId, live.itemName, m.userId)}` : '') +
                `</div>`).join('');
            body += armouryLine(live.itemId, live.missing);
            body += `<div class="cit-tip-p cit-tip-dim" style="margin-top:4px">` +
                    `Click a name to jump to that item in the armoury, with ` +
                    `"Name [id]" copied ready to paste.</div>`;
        } else if (live.missing) {
            body += `<div class="cit-tip-warn">You are the only one missing this.</div>`;
        } else {
            body += `<div class="cit-tip-ok">Everyone in this crime has it.</div>`;
        }
        body += `<div class="cit-tip-p cit-tip-dim">${live.reusable
            ? 'You get this item back when the crime finishes.'
            : 'This item is used up when the crime runs.'}</div>`;

        /* Other organized crimes that also want this item. */
        if (def) {
            const others = def.crimes.filter(c => c !== live.crime);
            if (others.length) {
                body += `<div class="cit-tip-label">Also used in</div>`;
                body += others.map(c => {
                    const us = def.uses.filter(u => u.crime === c);
                    return `<div class="cit-tip-crime">` +
                           `<div class="cit-tip-crime-name">${esc(c)}` +
                           `<span class="cit-tip-diff">difficulty ${us[0].difficulty}</span></div>` +
                           `<div class="cit-tip-dim">${us.length} position${us.length > 1 ? 's' : ''}: ` +
                           `${esc(us.map(u => u.label).join(', '))}</div></div>`;
                }).join('');
            }
        }
        return tipShell('#ff7b6b', live.crime, sub, body + haveLine(q));
    }

    function ocDefTip(def, q) {
        const byCrime = {};
        def.uses.forEach(u => (byCrime[u.crime] = byCrime[u.crime] || []).push(u));
        const names = Object.keys(byCrime).sort();
        const sub = `Used in ${names.length} organized crime${names.length > 1 ? 's' : ''}, ` +
                    `${def.uses.length} position${def.uses.length > 1 ? 's' : ''} in total`;
        const body = names.map(c => {
            const us = byCrime[c];
            return `<div class="cit-tip-crime">` +
                   `<div class="cit-tip-crime-name">${esc(c)}` +
                   `<span class="cit-tip-diff">difficulty ${us[0].difficulty}</span></div>` +
                   `<div class="cit-tip-dim">${us.length} position${us.length > 1 ? 's' : ''}: ` +
                   `${esc(us.map(u => u.label).join(', '))}</div>` +
                   `<div class="cit-tip-dim">${us[0].consumed
                        ? 'Used up when the crime runs.' : 'Returned after the crime.'}</div>` +
                   `</div>`;
        }).join('');
        return tipShell('#ff9a6b', 'Organized Crime item', sub, body + haveLine(q));
    }

    const findNameEl = row =>
        row.querySelector('.name-wrap .name') ||
        row.querySelector('[class*="name___"]') ||
        row.querySelector('.title-wrap .name') ||
        row.querySelector('.name') ||
        row.querySelector('[class*="itemName"]') ||
        row.querySelector('[class*="title"]');

    const cleanName = raw => raw.replace(/\s*x\s*[\d,]+\s*$/i, '').replace(/\s+/g, ' ').trim();

    /* Torn's real row markup:
         li[data-item][data-qty]
           └ div.title-wrap > div.title.left > span.name-wrap
                ├ span.qty.bold.d-hide   "x72"   (hidden on desktop, FIRST in DOM)
                ├ span.name              "Billfold"
                └ span.qty.bold.t-hide   "x72"   (the visible one)
       The quantity is rendered twice for responsive layouts, so "insert after
       the first x72" lands before the name. Appending to .name-wrap puts the
       badge after the name and both quantity spans, which is what we want. */
    function placeBadge(row, nameEl, frag) {
        /* Items page: .name-wrap clears both quantity spans.
           Sell list: same duplicate-quantity trick, so insert after the LAST
           .count -- that puts the badge between "x4" and the value. */
        const wrap = row.querySelector('.name-wrap');
        if (wrap) { wrap.appendChild(frag); return; }

        const counts = row.querySelectorAll('.count');
        if (counts.length) {
            const last = counts[counts.length - 1];
            if (last.parentNode) { last.parentNode.insertBefore(frag, last.nextSibling); return; }
        }
        nameEl.appendChild(frag);
    }

    function rowItemId(row) {
        const direct = row.getAttribute('data-item')
            || row.dataset.item
            || (row.querySelector('[data-item]') && row.querySelector('[data-item]').getAttribute('data-item'))
            || (row.querySelector('[data-itemid]') && row.querySelector('[data-itemid]').getAttribute('data-itemid'))
            || row.getAttribute('itemid')
            || (row.querySelector('[itemid]') && row.querySelector('[itemid]').getAttribute('itemid'));
        if (direct) return direct;

        /* Shops and the armoury carry no data-item, but every item image is
           served from .../images/items/<id>/... -- the path can be relative, so
           do not anchor the match on a leading slash. */
        const img = row.querySelector('img[src*="items/"]');
        if (img) {
            const m = /items\/(\d+)\//.exec(img.getAttribute('src') || '');
            if (m) return m[1];
        }

        /* Sell-list rows carry no id at all, so fall back to the name. */
        const nmEl = findNameEl(row);
        if (nmEl) {
            const id = idForName(cleanName(nmEl.textContent || ''));
            if (id) return id;
        }
        return null;
    }

    function processRow(row) {
        const nameEl = findNameEl(row);
        if (!nameEl) return;
        const name = cleanName(nameEl.textContent || '');
        if (!name) return;

        const id = rowItemId(row);
        const live = ocFor(id);
        const def  = ocDefFor(id);
        const stamp = [name, id, S.showC, S.showOC, S.dim, S.dimTagged,
                       live && live.total + ':' + live.mine + ':' + live.missing,
                       def && def.uses.length, qtyOf(id)].join('|');
        if (row.dataset.citSig === stamp) return;
        row.querySelectorAll('[data-cit="1"]').forEach(n => n.remove());
        row.dataset.citSig = stamp;
        row.classList.remove('cit-dimmed', 'cit-alert');

        const t = tagsFor(id, name);

        /* Two dimming switches, each scoped to the page it makes sense on.
           Items page: dim what no Crime or OC needs, so the useful stock stands
           out. Shop / bazaar / item market: dim what a Crime or OC DOES need,
           so what stays bright is safe to sell. */
        if (!t && !live && !def) {
            if (S.dim && !ON_SELL) row.classList.add('cit-dimmed');
            return;
        }
        if (S.dimTagged && ON_SELL) row.classList.add('cit-dimmed');

        /* Prefer the API inventory (covers every item), but fall back to the
           row's own data-qty so quantities still show when the API is down. */
        /* The row's own data-qty is what's on screen right now, so trust it
           over the stored inventory, which can be stale. */
        let q = null;
        if (row.hasAttribute('data-qty')) {
            const dq = parseInt(row.getAttribute('data-qty'), 10);
            if (!isNaN(dq)) q = dq;
        }
        if (q === null) q = qtyOf(id);
        const frag = document.createDocumentFragment();

        /* Badge numbers count CRIMES / OCs the item is used in; the tooltip
           breaks down the positions within each. */
        if (t && t.c && S.showC) {
            const crimes = crimesFor(t, name);
            const label = crimes.length > 1 ? `C \u00D7${crimes.length}` : 'C';
            frag.appendChild(badge('c', crimeTip(t, name, q, crimes), label));
        }

        if (S.showOC) {
            const ocCount = def ? def.crimes.length : (live ? 1 : 0);
            if (live) {
                const base = `OC \u00D7${ocCount}`;
                if (live.mine && !live.myAvailable) {
                    frag.appendChild(badge('alert', ocLiveTip(live, q, def), base + ' \u26A0 YOU'));
                    row.classList.add('cit-alert');
                } else if (live.missing) {
                    frag.appendChild(badge('oc', ocLiveTip(live, q, def), base + ' \u26A0'));
                } else {
                    frag.appendChild(badge('oc', ocLiveTip(live, q, def), base + ' \u2713'));
                }
            } else if (def) {
                frag.appendChild(badge('oc', ocDefTip(def, q), `OC \u00D7${ocCount}`));
            } else if (t && t.oc) {
                frag.appendChild(badge('oc',
                    tipShell('#ff9a6b', 'Organized Crime item', 'From the built-in table',
                             `<div class="cit-tip-p">${esc(t.oc)}</div>` + haveLine(q))));
            }
        }

        if (!frag.childNodes.length) return;

        placeBadge(row, nameEl, frag);
    }

    /* Your items: li[data-item][data-qty] inside ul.items-cont.
       Shops: no data-item, so fall back to "has an item image and a name". */
    const ROW_SEL = ['li[data-item]', 'ul.items-cont > li', 'ul[class*="items-cont"] > li',
                     'ul[class*="itemsList"] > li', 'li[class*="item"]'].join(',');

    function isItemRow(li) {
        if (li.classList.contains('menu-item-link')) return false;
        /* Positive signals FIRST -- an inventory row is an inventory row no
           matter what wraps it. The old guard used [class*="sidebar"], which
           also matches <body class="... with-sidebar ...">, so closest() hit on
           every row on every page and silently stripped the Items-page badges. */
        if (li.hasAttribute('data-item')) return true;
        if (li.querySelector('.name-wrap')) return true;
        if (li.closest('#sidebar, [id*="sidebar"], nav, header')) return false;
        return !!(li.querySelector('img[src*="items/"]') && findNameEl(li));
    }

    /* On a shop page we tag the SELL list -- those are your own items, and
       knowing an item is needed for a crime is what stops you selling it. The
       buy grid is deliberately left alone: its tiles have no room for a badge
       and it is not what the tagging is for.

         ul.sell-items-list > li > ul.item > li.desc
             span.count "x4" · span.name "Advent Calendar" · span.count "x4"   */
    function sellListRows() {
        return Array.prototype.slice.call(
            document.querySelectorAll('ul.sell-items-list > li'))
            .filter(findNameEl);
    }

    const rows = () => {
        const base = Array.prototype.filter.call(document.querySelectorAll(ROW_SEL), isItemRow);
        sellListRows().forEach(r => { if (base.indexOf(r) === -1) base.push(r); });
        return base;
    };

    let pending = null;
    function refresh(force) {
        if (!ON_ITEMS) return;
        if (force) document.querySelectorAll('[data-cit-sig]').forEach(r => delete r.dataset.citSig);
        const rs = rows();
        harvestDomInv(rs);
        rs.forEach(processRow);
    }
    function schedule() {
        if (pending) return;
        pending = setTimeout(() => { pending = null; try { refresh(false); } catch (e) { WARN(e); } }, 150);
    }

    /* ==================================================================
       SECTION 6 — SETTINGS PANEL
       ================================================================== */

    const fmtSel = v => v === null ? '<span class="muted">?</span>'
                      : v ? '<span class="ok">yes</span>' : '<span class="bad">NO</span>';

    const esc = s => String(s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
    const errHtml = k => DATA.errors[k]
        ? `<span class="bad">failed</span> <span class="muted">— ${esc(DATA.errors[k])}</span>`
        : '<span class="muted">not loaded</span>';

    /* OC Manager: every position across the faction's organized crimes whose
       member is missing the required item.

       This cannot come from the API -- faction selections need faction API
       access, which most members do not have (the armoury hits the same wall).
       So it is read from the faction's own Crimes tab when the user visits it,
       exactly like the armoury, and cached with a timestamp. */
    function ocManagerView() {
        if (!DATA.facOC || !Array.isArray(DATA.facOC.crimes) || !DATA.facOC.crimes.length) {
            return {
                summary: 'no data yet',
                html: '<div class="muted">Open your faction\'s <b>Crimes</b> tab once. Every ' +
                      'organized crime is read from that page, including which positions are ' +
                      'short of their item. The faction API would give this directly, but ' +
                      'those selections need faction API access.</div>'
            };
        }

        /* One armoury pool serves every crime, so track demand globally as well
           as per crime -- 1 needed here can still be unmeetable if four other
           crimes want the same item. */
        const globalNeed = {};
        DATA.facOC.crimes.forEach(c => (c.slots || []).forEach(sl => {
            if (sl.missing && sl.itemId) {
                globalNeed[sl.itemId] = (globalNeed[sl.itemId] || 0) + 1;
            }
        }));

        let shortTotal = 0;
        const blocks = DATA.facOC.crimes.map(c => {
            const short = (c.slots || []).filter(sl => sl.missing);
            shortTotal += short.length;
            const key = 'mgr:' + c.name;

            if (!short.length) {
                return `<details class="cit-crime" data-sec="${esc(key)}">` +
                       `<summary>${esc(c.name)} <span class="ok">all covered</span>` +
                       `${c.timer ? ` <span class="cit-sum-note">${esc(c.timer)}</span>` : ''}` +
                       `</summary><div class="muted">Every position has its item.</div></details>`;
            }

            const names = short.map(sl => {
                const who = sl.userId
                    ? (sl.itemId
                        ? loanLink(sl.itemId, sl.itemName, sl.userId, sl.userName)
                        : `<a class="cit-tip-who" href="https://www.torn.com/profiles.php?XID=${sl.userId}"` +
                          ` target="_blank" rel="noopener">` +
                          `${esc(sl.userName || ('ID ' + sl.userId))}</a>`)
                    : '<span class="muted">empty position</span>';
                return `<div class="bad">${esc(sl.itemName || 'item unknown')} \u2014 ` +
                       `${esc(sl.label)}: ${who}</div>`;
            }).join('');

            /* One armoury line per distinct item this crime is short of. */
            let stock = '';
            if (DATA.armoury) {
                const byItem = {};
                short.forEach(sl => {
                    const id = sl.itemId || ('?' + (sl.itemName || ''));
                    byItem[id] = byItem[id] || { n: sl.itemName, id: sl.itemId, need: 0 };
                    byItem[id].need++;
                });
                stock = Object.keys(byItem).map(id => {
                    const e = byItem[id];
                    const a = e.id ? armouryOf(e.id) : null;
                    const avail = a ? a.avail : 0;
                    const nm = e.n || 'item';
                    const elsewhere = (globalNeed[e.id] || 0) - e.need;
                    const also = elsewhere > 0
                        ? ` <span class="muted">\u00B7 ${elsewhere} more needed in other crimes</span>`
                        : '';
                    const style = 'margin:2px 0 4px 10px';
                    if (!avail) {
                        return `<div class="bad" style="${style}">Armoury - no ${esc(nm)} ` +
                               `available, ${e.need} needed${also}</div>`;
                    }
                    if (avail < e.need) {
                        return `<div class="bad" style="${style}">Armoury - ${avail} ${esc(nm)} ` +
                               `available, ${e.need} needed (${e.need - avail} short)${also}</div>`;
                    }
                    return `<div class="ok" style="${style}">Armoury - ${avail} ${esc(nm)} ` +
                           `available${also}</div>`;
                }).join('');
            }

            return `<details class="cit-crime" data-sec="${esc(key)}"` +
                   `${secOpen(key) ? ' open' : ''}>` +
                   `<summary>${esc(c.name)} ` +
                   `<span class="bad">${short.length} short</span>` +
                   `${c.timer ? ` <span class="cit-sum-note">${esc(c.timer)}</span>` : ''}` +
                   `</summary>${names}${stock}</details>`;
        }).join('');

        return {
            summary: `${shortTotal} short across ${DATA.facOC.crimes.length} crimes ` +
                     `\u00B7 ${fmtAgo(DATA.facOC.ts)}`,
            html: blocks
        };
    }

    function openPanel() {
        document.getElementById('cit-panel')?.remove();
        const p = document.createElement('div');
        p.id = 'cit-panel';

        const cc = crimeCoverage();
        const mgr = S.ocMgr ? ocManagerView() : { summary: '', html: '' };
        const oc = DATA.oc;
        const nameOfId = id => (DATA.catalogue && DATA.catalogue[id]) || ('item ' + id);
        let ocHtml = '<div class="muted">Not in an OC, or feed unavailable.</div>';
        if (oc && DATA.ocIndex) {
            const rowsHtml = Object.keys(DATA.ocIndex).map(id => {
                const e      = DATA.ocIndex[id];
                const nm     = nameOfId(id);
                const others = e.missingSlots || [];     // teammates only; you are named above
                const need   = e.missing || 0;           // every position short, you included

                if (!need) return `<div class="ok">${esc(nm)} \u2014 everyone has it</div>`;

                /* What people act on is who is short, so lead with that. The
                   quantity and your own slot are already stated above. */
                const who = others.length
                    ? `<div class="muted" style="margin:1px 0 2px 10px">` +
                      others.map(m => `${esc(m.label)}: ` +
                          (m.userId ? loanLink(id, nm, m.userId) : '?')).join('<br>') +
                      `</div>`
                    : '';

                let arm = '';
                if (DATA.armoury) {
                    const a = armouryOf(id);
                    const avail = a ? a.avail : 0;
                    const style = 'margin:0 0 4px 10px';
                    if (!avail) {
                        arm = `<div class="bad" style="${style}">Armoury - no ${esc(nm)} ` +
                              `available, ${need} needed</div>`;
                    } else if (avail < need) {
                        arm = `<div class="bad" style="${style}">Armoury - ${avail} ${esc(nm)} ` +
                              `available, ${need} needed (${need - avail} short)</div>`;
                    } else {
                        arm = `<div class="ok" style="${style}">Armoury - ${avail} ${esc(nm)} ` +
                              `available</div>`;
                    }
                }

                return `<div class="bad">${esc(nm)}</div>${who}${arm}`;
            }).join('');

            const mine = myMissingItems();
            const warn = mine.length
                ? `<div class="bad" style="margin:4px 0 6px"><b>\u26A0 You are missing: ` +
                  `${mine.map(m => grabLink(m.id, m.name)).join(', ')}</b> for your position ` +
                  `(${esc(mine[0].slot || '?')})</div>`
                : '';
            ocHtml = `<div><b>${oc.name}</b> · ${oc.status} · ready in ${fmtLeft(oc.ready_at)}</div>`
                   + warn + rowsHtml;
        }

        const ocSummary = oc
            ? `${esc(oc.name)} \u00B7 ${fmtLeft(oc.ready_at)}` +
              (DATA.ocReadAt ? ` \u00B7 read ${fmtAgo(DATA.ocReadAt)}` : '')
            : 'not in one';

        /* Coverage across every OC in the game, from the authoritative defs. */
        let covSummary = '';
        let covHtml = '<div class="muted">Needs OC definitions + inventory.</div>';
        const covInv = effInv();
        if (DATA.ocDefIndex && covInv) {
            const missing = [], held = [];
            Object.keys(DATA.ocDefIndex).forEach(id => {
                const e = DATA.ocDefIndex[id];
                const have = covInv[id] || 0;
                (have > 0 ? held : missing).push({ id, e, have });
            });
            missing.sort((a, b) => b.e.uses.length - a.e.uses.length);
            covSummary = `${held.length} of ${held.length + missing.length} held`;
            held.sort((a, b) => b.e.uses.length - a.e.uses.length);
            covHtml =
                `<div class="ok">You hold ${held.length} of ${held.length + missing.length} OC items.</div>` +
                `<details class="cit-crime" data-sec="occov-missing"` +
                `${secOpen('occov-missing') ? ' open' : ''}>` +
                `<summary><span class="bad">Missing</span> ` +
                `<span class="cit-sum-note">${missing.length}, most-used first</span></summary>` +
                /* No cap -- the section collapses, so the full list costs nothing
                   when closed and is what you actually want when open. */
                `<div class="muted">` + missing.map(m =>
                    `${esc(m.e.name)} \u2014 ${m.e.uses.length} position` +
                    `${m.e.uses.length > 1 ? 's' : ''}, ${m.e.crimes.length} crime` +
                    `${m.e.crimes.length > 1 ? 's' : ''}` +
                    `${m.e.consumed ? ' \u00B7 consumed' : ''}`
                ).join('<br>') + `</div></details>` +
                `<details class="cit-crime" data-sec="occov-held"` +
                `${secOpen('occov-held') ? ' open' : ''}>` +
                `<summary><span class="ok">Held</span> ` +
                `<span class="cit-sum-note">${held.length}</span></summary>` +
                `<div class="muted">` + (held.map(m =>
                    `${esc(m.e.name)} \u00D7${m.have} \u2014 ${m.e.uses.length} position` +
                    `${m.e.uses.length > 1 ? 's' : ''}, ${m.e.crimes.length} crime` +
                    `${m.e.crimes.length > 1 ? 's' : ''}`
                ).join('<br>') || '\u2014') + `</div></details>`;
        }

        p.innerHTML = `
            <span id="cit-close">✕</span>
            <h3>Crime Item Tagger <span class="muted" style="font-weight:normal">v${VERSION}</span></h3>

            <label>API key (Limited or custom)</label>
            <input type="text" id="cit-key" value="${S.key ? S.key.replace(/./g, '•') : ''}" placeholder="paste key, then Save">
            <button id="cit-save">Save key</button>
            <button id="cit-clear">Clear</button>
            <button id="cit-reload"${LOADING ? ' disabled' : ''}>${LOADING
                ? '<span class="cit-spin"></span>Loading…' : 'Refresh data'}</button>
            <button id="cit-diag">Diagnostics</button>

            <details data-sec="features" ${secOpen('features') ? 'open' : ''}>
              <summary>Feature List</summary>
            <label><input type="checkbox" id="cit-c" ${S.showC ? 'checked' : ''}> Show [C] badges</label>
            <label><input type="checkbox" id="cit-oc" ${S.showOC ? 'checked' : ''}> Show [OC] badges</label>
            <label title="In a Torn NPC shop, bazaar or the item market, greys out the items a Crime or an OC needs, so what stays bright is safe to sell."><input type="checkbox" id="cit-dimtag" ${S.dimTagged ? 'checked' : ''}> Dim Crime &amp; OC Items in Torn NPC Shops page</label>
            <label title="Master switch for every call to Torn's API. Off: the script still tags every item from its built-in data and reads quantities from your item pages, but live OC status, teammate names and the item catalogue stop."><input type="checkbox" id="cit-api" ${S.useApi ? 'checked' : ''}> Live OC data (Torn API)</label>
            <label><input type="checkbox" id="cit-ocmgr" ${S.ocMgr ? 'checked' : ''}> OC Manager</label>
            <label title="On your own Items page, greys out everything that is NOT used by a Crime or an OC."><input type="checkbox" id="cit-dim" ${S.dim ? 'checked' : ''}> Dim non crime &amp; non OC items in Items page</label>
            </details>

            <details data-sec="tabpages" ${secOpen('tabpages') ? 'open' : ''}>
              <summary>CIT button <span class="cit-sum-note">${tabWhereNote()}</span></summary>
              <div class="muted" style="font-size:11px;margin:2px 0 4px">Where the CIT tab appears. Everything else keeps working on pages without it.</div>
              ${TAB_PAGES.map(pg => {
                  const on   = !!S.tabOn[pg.k];
                  const lock = pg.k !== 'everywhere' && !!S.tabOn.everywhere;
                  return `<label${lock ? ' title="Everywhere is on, so this is already covered."' : ''}` +
                         `${lock ? ' style="opacity:.55"' : ''}>` +
                         `<input type="checkbox" class="cit-tabpg" data-pg="${pg.k}"` +
                         `${on ? ' checked' : ''}${lock ? ' disabled' : ''}> ${pg.label}</label>`;
              }).join('')}
              ${MENU_OK ? '' : `<div class="muted" style="font-size:11px;margin-top:4px">` +
                  `Your userscript manager has no menu command, so at least one page must stay ticked ` +
                  `\u2014 otherwise this panel could not be reopened.</div>`}
            </details>

            <details data-sec="status" ${secOpen('status') ? 'open' : ''}>
              <summary>Status <span class="cit-sum-note">${statusNote()}</span></summary>
            ${LOADING ? '<div class="muted">Refreshing from the Torn API…</div>' : ''}
            <div>Key access: ${DATA.keyInfo
                ? `<span class="ok">${DATA.keyInfo.access_type || DATA.keyInfo.access_level}</span>`
                : '<span class="muted">unknown</span>'}</div>
            ${DATA.keyInfo ? `
              <div>&nbsp;· user/inventory: ${fmtSel(keyHas('user', 'inventory'))}</div>
              <div>&nbsp;· user/organizedcrime: ${fmtSel(keyHas('user', 'organizedcrime'))}</div>
              <div>&nbsp;· torn/organizedcrimes: ${fmtSel(keyHas('torn', 'organizedcrimes'))}</div>
              <div>&nbsp;· torn/items: ${fmtSel(keyHas('torn', 'items'))}</div>` : ''}
            <div>Catalogue: ${DATA.catalogue ? `<span class="ok">${Object.keys(DATA.catalogue).length} items</span>` : errHtml('catalogue')}</div>
            <div>Inventory: ${DATA.inventory
                ? `<span class="ok">${Object.keys(DATA.inventory).length} stacks (API)</span>`
                : (DATA.domInv && Object.keys(DATA.domInv).length
                    ? `<span class="ok">${Object.keys(DATA.domInv).length} stacks (from pages browsed)</span>`
                    : errHtml('inventory'))}</div>
            ${DATA.inventory ? '' : '<div class="muted" style="font-size:11px">Torn retired the inventory API, so quantities are read from your item pages as you open each category tab.</div>'}

            <div>OC definitions: ${DATA.ocDefs
                ? `<span class="ok">${DATA.ocDefs.length} crimes, ${Object.keys(DATA.ocDefIndex || {}).length} items</span>`
                : '<span class="muted">built-in table</span>'}</div>
            </details>

            <details data-sec="oc" ${secOpen('oc') ? 'open' : ''}>
              <summary>Your current OC <span class="cit-sum-note">${ocSummary}</span></summary>
              ${ocHtml}
            </details>

            ${DATA.armoury
                ? `<div class="muted" style="font-size:11px;margin-top:4px">Armoury stock as of ` +
                  `${fmtAgo(DATA.armoury.ts)} (${Object.keys(DATA.armoury.items).length} items seen)</div>`
                : `<div class="muted" style="font-size:11px;margin-top:4px">Armoury stock not read yet ` +
                  `\u2014 open your faction armoury once.</div>`}

            <details data-sec="occov" ${secOpen('occov') ? 'open' : ''}>
              <summary>Organized Crime item coverage <span class="cit-sum-note">${covSummary}</span></summary>
              ${covHtml}
            </details>

            <details data-sec="crimecov" ${secOpen('crimecov') ? 'open' : ''}>
              <summary>Crime item coverage <span class="cit-sum-note">${cc.summary}</span></summary>
              ${cc.html}
            </details>

            ${S.ocMgr ? `
            <details data-sec="ocmgr" ${secOpen('ocmgr') ? 'open' : ''}>
              <summary>OC Manager <span class="cit-sum-note">${mgr.summary}</span></summary>
              ${mgr.html}
            </details>` : ''}
        `;
        document.body.appendChild(p);

        p.querySelector('#cit-close').onclick = () => { p.remove(); setV('cit_open', false); };
        p.querySelector('#cit-save').onclick = () => {
            const v = p.querySelector('#cit-key').value.trim();
            if (v && !/^•+$/.test(v)) { S.key = v; LOG('key saved'); LOADING = true; repaintPanel(); bootstrap(true); }
        };
        p.querySelector('#cit-clear').onclick = () => {
            S.key = ''; ['catalogue', 'ocdefs', 'inventory', 'oc', 'self', 'names'].forEach(n => setV('cit_cache_' + n, null));
            DATA.catalogue = DATA.inventory = DATA.oc = DATA.ocIndex = DATA.ocDefs = DATA.ocDefIndex = DATA.self = DATA.keyInfo = null; BY_ID = null;
            refresh(true); p.remove(); openPanel();
        };
        p.querySelector('#cit-reload').onclick = () => {
            ['catalogue', 'ocdefs', 'inventory', 'oc', 'self', 'names'].forEach(n => setV('cit_cache_' + n, null));
            LOADING = true;
            repaintPanel();          // immediate feedback; steps repaint as they land
            bootstrap(true);
        };
        p.querySelector('#cit-diag').onclick = () => {
            const rs = rows();
            LOG('=== DIAGNOSTICS v' + VERSION + ' ===');
            LOG('raw selector hits:', document.querySelectorAll(ROW_SEL).length,
                '| sell-list rows:', document.querySelectorAll('ul.sell-items-list > li').length,
                '| item rows after filtering:', rs.length);
            LOG('errors:', JSON.parse(JSON.stringify(DATA.errors)));
            LOG('catalogue:', DATA.catalogue ? Object.keys(DATA.catalogue).length : null,
                '| inventory(api):', DATA.inventory ? Object.keys(DATA.inventory).length : null,
                '| inventory(dom):', DATA.domInv ? Object.keys(DATA.domInv).length : null,
                '| ocDefs:', DATA.ocDefs ? DATA.ocDefs.length : null,
                '| idMap:', BY_ID ? Object.keys(BY_ID).length : null);
            if (rs.length) {
                const r = rs[0];
                const ne = findNameEl(r);
                LOG('first row data-item:', rowItemId(r));
                LOG('first row nameEl:', ne && ne.className, '| text:', ne && ne.textContent.trim());
                LOG('first row HTML (paste this):', r.outerHTML.slice(0, 1500));
                LOG('badges currently injected on page:', document.querySelectorAll('[data-cit="1"]').length);
            }
            alert('Diagnostics written to the browser console (F12 → Console). Copy the [CIT] lines.');
        };

        p.querySelectorAll('details[data-sec]').forEach(d => {
            d.addEventListener('toggle', () => secSet(d.getAttribute('data-sec'), d.open));
        });

        const bind = (sel, prop) => {
            p.querySelector(sel).onchange = e => { S[prop] = e.target.checked; refresh(true); };
        };
        bind('#cit-c', 'showC'); bind('#cit-oc', 'showOC'); bind('#cit-dim', 'dim');
        bind('#cit-dimtag', 'dimTagged');
        bind('#cit-api', 'useApi');
        p.querySelector('#cit-ocmgr').onchange = e => { S.ocMgr = e.target.checked; repaintPanel(); };
        p.querySelectorAll('.cit-tabpg').forEach(cb => {
            cb.onchange = e => {
                const on = S.tabOn;
                const k  = e.target.getAttribute('data-pg');
                if (e.target.checked) on[k] = true; else delete on[k];
                /* Without a manager menu the panel is only reachable from the tab,
                   so never let the last page be unticked -- fall back to
                   Everywhere rather than stranding the user. */
                if (!MENU_OK && !Object.keys(on).length) on.everywhere = true;
                S.tabOn = on;
                mountTab();                   // apply now, don't wait for the interval
                repaintPanel();               // Everywhere locks/unlocks the rest
            };
        });
    }

    /* Whether the userscript manager gives us a menu. Tampermonkey does;
       Torn PDA has no GM_registerMenuCommand, and without one the panel would be
       unreachable after hiding the tab -- so there the option is disabled. */
    let MENU_OK = false;
    try {
        GM_registerMenuCommand('Crime Item Tagger \u2014 settings', openPanel);
        GM_registerMenuCommand('Crime Item Tagger \u2014 show the CIT tab everywhere', () => {
            const on = S.tabOn;
            on.everywhere = true;
            S.tabOn = on;
            mountTab();
        });
        MENU_OK = true;
    } catch (e) {}

    /* ---- Persistent side tab, bottom-right, like the HT / FF tabs ---- */
    /* Where the tab may appear. Tested against the live URL rather than the
       cached ON_* flags, because the faction tabs are hash-only navigation --
       switching Crimes <-> Armoury never reloads the page. Order here is the
       order shown in the panel. */
    const TAB_PAGES = [
        { k: 'everywhere', label: 'Everywhere',
          test: () => true },
        { k: 'items',      label: 'Items',
          test: () => /\/items?\.php/.test(location.pathname) },
        { k: 'crimes',     label: 'Crimes',
          test: () => /\/crimes\.php/.test(location.pathname) },
        { k: 'faccrimes',  label: 'Faction \u2192 Crimes',
          test: () => /\/factions\.php/.test(location.pathname) && /tab=crimes/i.test(location.hash) },
        { k: 'facarmoury', label: 'Faction \u2192 Armoury',
          test: () => /\/factions\.php/.test(location.pathname) && /tab=armoury/i.test(location.hash) },
        { k: 'imarket',    label: 'Item Market',
          test: () => /\/imarket\.php/.test(location.pathname)
                      || /sid=ItemMarket/i.test(location.search + location.hash) },
        { k: 'bazaar',     label: 'Bazaar Directory / Bazaars',
          test: () => /\/bazaar\.php/.test(location.pathname) },
        { k: 'shops',      label: 'Torn NPC Shops',
          test: () => /\/shops\.php/.test(location.pathname) }
    ];

    function tabAllowedHere() {
        const on = S.tabOn;
        if (on.everywhere) return true;
        return TAB_PAGES.some(pg => pg.k !== 'everywhere' && on[pg.k] && pg.test());
    }

    function mountTab() {
        /* Where the tab shows is cosmetic only: badges, the missing-item banner,
           the armoury helper and every harvest run off page events, not off this
           element. The 3s re-mount interval doubles as the remover, so the tab
           appears and disappears correctly even though Torn re-renders
           constantly and moves between faction tabs without a page load. */
        if (!tabAllowedHere()) { document.getElementById('cit-tab')?.remove(); return; }
        if (document.getElementById('cit-tab')) return;
        const tab = document.createElement('div');
        tab.id = 'cit-tab';
        tab.title = 'Crime Item Tagger — click for settings';
        tab.textContent = 'CIT';
        tab.onclick = togglePanel;
        document.body.appendChild(tab);
        updateTabDot();
    }

    /* Red dot on the tab when your own OC slot is missing its item. */
    function updateTabDot() {
        const tab = document.getElementById('cit-tab');
        if (!tab) return;
        tab.querySelector('.cit-dot')?.remove();
        const alert = DATA.ocIndex && Object.keys(DATA.ocIndex)
            .some(id => DATA.ocIndex[id].mine && !DATA.ocIndex[id].myAvailable);
        if (alert) {
            const d = document.createElement('span');
            d.className = 'cit-dot';
            tab.appendChild(d);
            tab.title = 'Crime Item Tagger — your OC slot is missing its item';
        }
    }

    /* Show one banner listing every item your position is short of.
       Dismissal lasts only for the current page view -- reloading or navigating
       back to the items page shows it again, so a missing item can't be
       forgotten about before the crime runs. */
    function renderMissingBanner() {
        document.getElementById('cit-banner')?.remove();
        const missing = myMissingItems();
        if (!missing.length) return;

        const m0 = missing[0];
        const names = missing.map(m => m.name).join(', ');
        const b = document.createElement('div');
        b.id = 'cit-banner';
        b.innerHTML =
            `<span class="cit-banner-x" title="Hide until the next page load">\u2715</span>` +
            `\u26A0 Your <b>${esc(m0.crime)}</b> position (<b>${esc(m0.slot || '?')}</b>) ` +
            `is missing: <b>${esc(names)}</b>` +
            `<div class="cit-banner-sub">The crime starts in ${fmtLeft(m0.ready_at)}. ` +
            `You will not see a badge for ${missing.length > 1 ? 'these items' : 'this item'} ` +
            `— you do not own ${missing.length > 1 ? 'them' : 'it'} yet.</div>`;
        b.querySelector('.cit-banner-x').onclick = () => b.remove();
        document.body.appendChild(b);
    }

    /* Rebuild the panel in place, keeping the scroll position, so it can update
       while data is still loading instead of only once everything finishes. */
    function repaintPanel() {
        const cur = document.getElementById('cit-panel');
        if (!cur) return;
        const top = cur.scrollTop;
        openPanel();
        const next = document.getElementById('cit-panel');
        if (next) next.scrollTop = top;
    }

    function togglePanel() {
        const p = document.getElementById('cit-panel');
        if (p) { p.remove(); setV('cit_open', false); }
        else { openPanel(); setV('cit_open', true); }
    }

    /* ==================================================================
       SECTION 6b — ARMOURY HELPER
       Clicking a teammate's name stores what to loan and navigates here. All we
       do on arrival is scroll to the right row, highlight it, and put
       "Name [id]" on the clipboard so the member box is one paste away.
       The script never clicks Loan, never fills the form and never transfers
       anything — every action stays with the user.
       ================================================================== */

    const ON_FACTIONS = /\/factions\.php/.test(location.pathname);
    /* Badges only make sense where item rows exist; the tab and panel are
       available on every Torn page. */
    const ON_ITEMS = /\/(item|items|bazaar|imarket|shops)\.php/.test(location.pathname);
    /* Pages whose lists are things you are putting up for sale. */
    const ON_SELL  = /\/(shops|bazaar|imarket)\.php/.test(location.pathname);
    if (ON_SELL) document.documentElement.classList.add('cit-sell');

    /* CONFIRMED armoury markup (faction armoury, ul.item-list > li):
         <li>
           <div class="img-wrap" data-armoryid="..." data-itemid="1331"> <img ...>
           <div class="name bold t-overflow">Hand Drill x<span class="qty">48</span></div>
           <div class="type">Tool</div>
           <div class="loaned t-overflow"><span class="t-show bold">Loaned:</span> Available</div>
           <div class="item-action">
             <div class="give" data-role="give">Give</div>
             <a class="loan active" data-role="loan">Loan</a>
             <div class="retrieve" data-role="retrieve">Retrieve</div>
           </div>
           <form> ... loan-cont with the quantity + member inputs ... </form>
         </li>
       Note the image src is RELATIVE ("images/items/..."), which is why an
       img[src*="/images/items/"] selector found nothing. We use data-itemid
       instead, so no text or image matching is needed anywhere. */

    const armouryRows = () => document.querySelectorAll('ul.item-list > li');

    const armRowItemId = li => {
        const w = li.querySelector('[data-itemid]');
        return w ? w.getAttribute('data-itemid') : null;
    };

    const armRowQty = li => {
        const q = li.querySelector('.name .qty');
        const n = q ? parseInt((q.textContent || '').replace(/[^\d]/g, ''), 10) : NaN;
        return isNaN(n) ? 1 : n;                       // no .qty means a single item
    };

    const armRowName = li => {
        const n = li.querySelector('.name');
        if (!n) return '';
        return (n.textContent || '').replace(/\s*x\s*[\d,]*\s*$/, '').trim();
    };

    /* The Loaned cell is either the plain word "Available" or the borrower as a
       link, so a member called "Available" cannot be mistaken for the pool. */
    const armRowAvailable = li => {
        const l = li.querySelector('.loaned');
        if (!l || l.querySelector('a')) return false;
        const t = (l.textContent || '').replace(/Loaned:/i, '').replace(/\s+/g, ' ').trim();
        return t === 'Available';
    };

    const armRowLoanLink = li => li.querySelector('a.loan[data-role="loan"]');

    /* The faction armoury is NOT reachable with a personal key -- faction
       selections need faction API access (error 7 without it). So we read it off
       the page whenever the user is there and cache what we saw, the same way
       item quantities are collected from item tabs. */
    /* ---- Faction OC page harvest -------------------------------------
       CONFIRMED markup on the faction Crimes tab (classes are hashed, so match
       on prefixes):

         p[class^=panelTitle]                         crime name
         [class^=slotHeader]                          one position
           [class^=slotIcon] > svg                    ITEM MISSING (red no-entry)
           [class^=slotIcon] > div[class^=planning]   item present (clock)
           span[class^=title___]                      role, e.g. "Muscle #3"
           [class^=successChance]                     success %
         a[href*="XID="]                              member id
         span.honor-text                              member name

       The faction API cannot give us this (error 7 without faction API access),
       so it is read off the page and cached, like the armoury. */

    function loadFacOC() {
        try {
            const raw = getV('cit_facoc', null);
            DATA.facOC = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;
            /* Caches written before item ids were recorded cannot build loan
               links, so drop them rather than degrade silently. */
            if (DATA.facOC && Array.isArray(DATA.facOC.crimes)) {
                const anySlot = DATA.facOC.crimes
                    .reduce((a, c) => a.concat(c.slots || []), [])
                    .filter(sl => sl.missing)[0];
                if (anySlot && anySlot.itemId === undefined) DATA.facOC = null;
            }
        } catch (e) { DATA.facOC = null; }
        return DATA.facOC;
    }

    /* Which item a position needs, from the authoritative API definitions. */
    function defItemFor(crimeName, label) {
        if (!Array.isArray(DATA.ocDefs)) return null;
        const c = DATA.ocDefs.find(x => x.name === crimeName);
        if (!c) return null;
        const sl = (c.slots || []).find(x =>
            ((x.position_info && x.position_info.label) || x.name) === label);
        if (!sl || !sl.required_item) return null;
        return { id: sl.required_item.id, name: sl.required_item.name };
    }

    function harvestFacOC() {
        if (!visible()) return false;   // never read a tab you are not looking at
        const titles = document.querySelectorAll('p[class*="panelTitle"]');
        if (!titles.length) return false;

        const crimes = [];
        Array.prototype.forEach.call(titles, t => {
            let card = t;
            for (let i = 0; i < 6 && card.parentElement; i++) {
                card = card.parentElement;
                if (card.querySelector('[class*="slotHeader"]')) break;
            }
            if (!card || !card.querySelector('[class*="slotHeader"]')) return;

            const name = (t.textContent || '').trim();
            const timerEl = Array.prototype.find.call(card.querySelectorAll('span'),
                e => /^\d{2}:\d{2}:\d{2}:\d{2}$/.test((e.textContent || '').trim()));

            const slots = [];
            card.querySelectorAll('[class*="slotHeader"]').forEach(h => {
                const wrap  = h.parentElement;
                const label = ((h.querySelector('[class*="title___"]') || {}).textContent || '').trim();
                const icon  = h.querySelector('[class*="slotIcon"]');

                /* An svg in the slot icon is the red no-entry mark: that member
                   does not have the item. A planning___ div is the clock, which
                   means they do. */
                const missing = !!(icon && icon.querySelector('svg'));

                const link = wrap.querySelector('a[href*="XID="]');
                const uid  = link ? ((link.getAttribute('href') || '').match(/XID=(\d+)/) || [])[1] : null;
                const nmEl = wrap.querySelector('span.honor-text:not(.honor-text-svg)');
                const uname = nmEl ? (nmEl.textContent || '').trim()
                                   : ((wrap.querySelector('img[alt]') || {}).alt || '').trim();

                if (!label) return;
                const req = defItemFor(name, label);
                slots.push({ label, userId: uid || null, userName: uname || null,
                             missing,
                             itemId:   req ? req.id : null,
                             itemName: req ? req.name : null });
            });

            if (slots.length) {
                crimes.push({ name, timer: timerEl ? (timerEl.textContent || '').trim() : '', slots });
            }
        });

        LOG('faction OC harvest: titles', titles.length, '| crimes', crimes.length,
            '| positions short', crimes.reduce((n, c) => n + c.slots.filter(x => x.missing).length, 0));

        if (!crimes.length) return false;
        DATA.facOC = { ts: Date.now(), crimes };
        try { setV('cit_facoc', JSON.stringify(DATA.facOC)); } catch (e) {}
        repaintPanel();
        return true;
    }

    function loadArmoury() {
        try {
            const raw = getV('cit_armoury', null);
            DATA.armoury = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;
        } catch (e) { DATA.armoury = null; }
        return DATA.armoury;
    }

    function harvestArmoury() {
        if (!visible()) return false;   // never read a tab you are not looking at
        const rows = armouryRows();
        const found = {};
        let accepted = 0;

        Array.prototype.forEach.call(rows, li => {
            const id = armRowItemId(li);
            if (!id) return;
            const e = found[id] || (found[id] = { n: armRowName(li), avail: 0, loaned: 0 });
            if (armRowAvailable(li)) e.avail += armRowQty(li); else e.loaned += armRowQty(li);
            accepted++;
        });

        LOG('armoury harvest: rows', rows.length,
            '| accepted', accepted, '| distinct items', Object.keys(found).length);

        if (!accepted) return false;

        DATA.armoury = { ts: Date.now(), items: found };
        try { setV('cit_armoury', JSON.stringify(DATA.armoury)); } catch (e) {}
        repaintPanel();          // the panel may have rendered before this ran
        return true;
    }

    /* The pooled, un-loaned row for a given item id. */
    function findArmouryRow(itemId) {
        const hit = Array.prototype.filter.call(armouryRows(),
            li => armRowItemId(li) === String(itemId) && armRowAvailable(li) && armRowLoanLink(li));
        LOG('armoury helper: available rows for item', itemId, '=', hit.length);
        return hit[0] || null;
    }

    /* Inline styles, not a class: the row's own background sits behind its
       cells, and nothing on the page can out-specify this. */
    function highlightRow(li, ms) {
        const prev = li.getAttribute('style') || '';
        const kids = Array.prototype.slice.call(li.children);
        const kidPrev = kids.map(k => k.getAttribute('style') || '');

        li.setAttribute('style', prev +
            ';outline:2px solid #d4a017 !important;outline-offset:-2px' +
            ';background:rgba(212,160,23,.28) !important' +
            ';box-shadow:0 0 14px rgba(212,160,23,.65) !important' +
            ';border-radius:3px;transition:background .2s');
        /* Let the row colour show through the opaque cells. */
        kids.forEach((k, n) => k.setAttribute('style',
            kidPrev[n] + ';background-color:transparent !important'));

        setTimeout(() => {
            li.setAttribute('style', prev);
            kids.forEach((k, n) => {
                if (kidPrev[n]) k.setAttribute('style', kidPrev[n]);
                else k.removeAttribute('style');
            });
        }, ms || 8000);
    }

    const armouryOf = id =>
        (DATA.armoury && DATA.armoury.items && DATA.armoury.items[id]) || null;

    const fmtAgo = ts => {
        const sec = Math.max(0, (Date.now() - ts) / 1000);
        if (sec < 90) return 'just now';
        const m = Math.floor(sec / 60);
        if (m < 60) return m + 'm ago';
        const h = Math.floor(m / 60);
        if (h < 48) return h + 'h ago';
        return Math.floor(h / 24) + 'd ago';
    };

    /* One line about what the faction pool holds, so a loan link that cannot
       work says so instead of sending the user to an empty armoury. */
    /* `need` is how many positions are short of this item -- everyone who is
       missing it, the user included, since they all draw on the same pool. */
    /* `need` is how many positions are short of this item -- everyone missing it,
       the user included, since they all draw on the same pool. */
    function armouryLine(itemId, need) {
        if (!DATA.armoury) {
            return `<div class="cit-tip-dim">Armoury stock unknown \u2014 ` +
                   `open the faction armoury once and it will be remembered.</div>`;
        }
        const a = armouryOf(itemId);
        const nm = (a && a.n) || (DATA.catalogue && DATA.catalogue[itemId]) || 'item';
        const when = fmtAgo(DATA.armoury.ts);
        const avail = a ? a.avail : 0;

        if (!avail) {
            return `<div class="cit-tip-warn">Armoury - no ${esc(nm)} available` +
                   `${need ? `, ${need} needed` : ''} (${when})</div>`;
        }
        if (need && avail < need) {
            return `<div class="cit-tip-warn">Armoury - ${avail} ${esc(nm)} available, ` +
                   `${need} needed (<b>${need - avail} short</b>) (${when})</div>`;
        }
        return `<div class="cit-tip-ok">Armoury - ${avail} ${esc(nm)} available (${when})</div>`;
    }

    function copyText(text) {
        try { GM_setClipboard(text, 'text'); return true; } catch (e) {}
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;opacity:0;';
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            ta.remove();
            return ok;
        } catch (e) { return false; }
    }

    function loanBanner(html, tone) {
        document.getElementById('cit-banner')?.remove();
        const b = document.createElement('div');
        b.id = 'cit-banner';
        if (tone === 'ok') { b.style.background = '#1d5c2e'; b.style.borderColor = '#2e8b4a'; }
        b.innerHTML = `<span class="cit-banner-x" title="Hide">\u2715</span>${html}`;
        b.querySelector('.cit-banner-x').onclick = () => b.remove();
        document.body.appendChild(b);
        return b;
    }

    function armouryAssist() {
        const raw = getV('cit_loan_intent', null);
        if (!raw) return;
        setV('cit_loan_intent', null);                     // one-shot
        let it; try { it = JSON.parse(raw); } catch (e) { return; }
        if (!it || Date.now() - it.ts > 180000) return;    // stale

        /* A grab intent has no member: the user is fetching the item for their
           own position, so there is nothing to copy and nothing to paste. */
        const grabOnly = !it.userId;
        const who = grabOnly ? '' :
            (it.userName ? `${it.userName} [${it.userId}]` : String(it.userId));
        const copied = grabOnly ? false : copyText(who);
        const copyNote = grabOnly
            ? `Click <b>Give</b> on that row to take it for your own position.`
            : (copied
                ? `<b>${esc(who)}</b> is on your clipboard \u2014 paste it into the member box.`
                : `Member to loan to: <b>${esc(who)}</b> (copy it manually).`);

        const banner = loanBanner(
            `Looking for <b>${esc(it.itemName)}</b> in the armoury\u2026` +
            `<div class="cit-banner-sub">${copyNote}</div>`);

        let tries = 0;
        const timer = setInterval(() => {
            const row = findArmouryRow(it.itemId);

            if (!row) {
                if (++tries <= 30) return;                  // ~15s, rows load late
                clearInterval(timer);
                const a = armouryOf(it.itemId);
                const why = (a && !a.avail)
                    ? `The armoury has none spare \u2014 all ${a.loaned} are out on loan.`
                    : `It may be on another tab, or the faction has none.`;
                loanBanner(`No spare <b>${esc(it.itemName)}</b> in the armoury.` +
                    `<div class="cit-banner-sub">${why} ${copyNote}</div>`);
                LOG('armoury helper: no available row for item', it.itemId, it.itemName);
                return;
            }

            clearInterval(timer);
            row.scrollIntoView({ block: 'center', behavior: 'smooth' });
            highlightRow(row, 8000);
            LOG('armoury helper: highlighted', it.itemName, 'item', it.itemId);

            if (banner) banner.remove();
            const b2 = loanBanner(
                `<b>${esc(it.itemName)}</b> is highlighted below.` +
                `<div class="cit-banner-sub">${copyNote}` +
                (grabOnly ? '' :
                    ` Click <b>Loan</b> on that row, set the quantity and press LOAN yourself. ` +
                    `<span class="cit-recopy">Copy again</span>`) +
                `</div>`, 'ok');
            const again = b2.querySelector('.cit-recopy');
            if (again) again.onclick = () => {
                again.textContent = copyText(who) ? 'Copied' : 'Copy failed';
            };
        }, 500);
    }

    /* ==================================================================
       SECTION 7 — BOOTSTRAP
       ================================================================== */

    async function bootstrap(force) {
        if (!visible()) { whenVisible(() => bootstrap(force)); return; }
        DATA.errors = {};
        LOADING = true;
        loadArmoury();
        loadFacOC();
        setV('cit_banner_dismissed', null);   // no longer used; dismissal is per page view
        loadDomInv();
        /* No key is a supported mode: the built-in crime data still tags every
           row, and quantities come from the pages themselves. */
        if (!S.useApi || !S.key) { LOADING = false; refresh(true); repaintPanel(); return; }

        await loadKeyInfo();
        repaintPanel();

        const step = async (name, fn) => {
            try { await fn(); delete DATA.errors[name]; refresh(true); }
            catch (e) {
                DATA.errors[name] = e.message + (e.code ? ` (code ${e.code})` : '');
                WARN(name + ' failed:', DATA.errors[name]);
            }
            repaintPanel();      // show each result as it arrives
        };

        await step('catalogue', async () => { await loadCatalogue(); buildIdMap(); });
        await step('inventory', loadInventory);
        await step('ocdefs',    loadOcDefs);
        await step('self',      loadSelf);

        /* Landing on the items or faction page is a deliberate action by the
           user, and it is exactly when OC status matters -- they have just
           picked something up, or are about to. Treat that navigation as the
           trigger and take a fresh reading instead of serving a cached one that
           can still claim their position is short. */
        if (ON_ITEMS || ON_FACTIONS) setV('cit_cache_oc', null);
        await step('oc',        loadOwnOC);
        await step('names',     loadMemberNames);

        updateTabDot();
        renderMissingBanner();
        repaintPanel();
        LOADING = false;
        repaintPanel();
    }

    /* Everywhere on Torn: the tab, the panel and the missing-item banner. */
    mountTab();
    setInterval(mountTab, 3000);          // Torn re-renders aggressively; keep the tab alive
    /* Faction Crimes <-> Armoury is hash-only, so nothing reloads; re-check at
       once instead of leaving the tab wrong for up to 3s. */
    window.addEventListener('hashchange', mountTab);
    if (getV('cit_open', false)) openPanel();

    /* Only where item rows exist: badge injection and the DOM observer. */
    if (ON_ITEMS) {
        new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
        refresh(true);
    }

    /* Only on the faction page: record what the armoury holds, and finish a loan
       started from a teammate's name. */
    if (ON_FACTIONS) {
        /* Torn mutates this page constantly, so throttle hard: at most one
           attempt per 1.5s, give up after 20 fruitless tries, and stop once a
           harvest succeeds (a tab switch re-arms it). */
        let armTimer = null, armTries = 0, armDone = false;
        const scheduleHarvest = () => {
            if (armTimer || armDone || armTries > 20) return;
            armTimer = setTimeout(() => {
                armTimer = null;
                armTries++;
                const a = harvestArmoury();
                const f = harvestFacOC();
                if (a || f) { armDone = true; armTries = 0; }
            }, 1500);
        };
        new MutationObserver(() => { armDone = false; scheduleHarvest(); })
            .observe(document.body, { childList: true, subtree: true });
        scheduleHarvest();
        armouryAssist();
    }

    bootstrap(false);

    LOG('v' + VERSION + ' loaded on', location.pathname,
        '\u2014 badges:', ON_ITEMS ? 'on' : 'off (not an item page)',
        '\u2014', Object.keys(ITEMS).length, 'items mapped.',
        S.key ? 'API key present.' : 'No API key \u2014 open the CIT tab to add one.');
})();
