// ==UserScript==
// @name         TORN Crime Item Tagger
// @namespace    avengerred.torn
// @version      2.10.0
// @description  Tags your inventory with [C] and [OC] badges showing which Crimes 2.0 and Organized Crimes each item is used for. Hover for the crimes, positions, and whether the item is consumed. Optional Torn API key adds live status for the OC you are in.
// @author       AvengerRed
// @license      MIT
// @homepageURL  https://github.com/AvengerRed/torn-crime-item-tagger
// @supportURL   https://github.com/AvengerRed/torn-crime-item-tagger/issues
// @match        https://www.torn.com/item.php*
// @match        https://www.torn.com/items.php*
// @match        https://www.torn.com/bazaar.php*
// @match        https://www.torn.com/imarket.php*
// @connect      api.torn.com
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
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
 * built-in crime data; a key adds live status for the organized crime you are
 * currently in. A Limited-access key is enough. Better still, use Torn's
 * custom key builder and grant only: torn -> items, torn -> organizedcrimes,
 * user -> organizedcrime.
 */

(function () {
    'use strict';

    const VERSION = '2.10.0';
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
        set useApi(v)    { setV('cit_useApi', v); }
    };

    const TTL = { catalogue: 7 * 24 * 3600e3, ocDefs: 7 * 24 * 3600e3, inventory: 60e3, oc: 120e3 };

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
                   domInv: null, errors: {} };

    /* Ask Torn what this key is actually allowed to do, so the panel can report
       missing selections instead of the script failing silently. */
    async function loadKeyInfo() {
        try {
            const j = await API.raw('key/?selections=info');
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
            /* v1 has been observed returning an empty inventory array even with
               the selection granted, so fall through to v2. */
            const tried = [];
            for (const path of ['user/?selections=inventory',
                                'v2/user?selections=inventory',
                                'v2/user/items']) {
                let j;
                try { j = await API.raw(path); }
                catch (e) { tried.push(path + ': ' + e.message); continue; }

                const parsed = parseInventory(j);
                if (parsed) {
                    inv = parsed;
                    LOG('inventory loaded from', path + ':', Object.keys(inv).length, 'stacks');
                    break;
                }
                LOG('RAW payload from ' + path + ' (empty/unparsed):', JSON.parse(JSON.stringify(j)));
                tried.push(path + ': returned 0 stacks');
            }
            if (!inv) throw new Error(tried.join(' | '));
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
        DATA.ocIndex = buildOcIndex(oc);
        return oc;
    }

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
                ready_at: oc.ready_at
            });
            e.total++;
            const label = (s.position_info && s.position_info.label) || s.position || '?';
            e.slots.push(label);
            if (!req.is_available) {
                e.missing++;
                e.missingSlots.push({ label, userId: s.user && s.user.id });
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
    const effInv = () => DATA.inventory || DATA.domInv || null;

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
            DATA.domInv = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
        } catch (e) { DATA.domInv = {}; }
        return DATA.domInv;
    }

    let domInvDirty = false;
    function harvestDomInv(rowList) {
        if (!DATA.domInv) loadDomInv();
        rowList.forEach(row => {
            const id = row.getAttribute('data-item');
            if (!id) return;
            const dq = parseInt(row.getAttribute('data-qty'), 10);
            const q = isNaN(dq) ? 1 : dq;          // no data-qty means a single item
            if (DATA.domInv[id] !== q) { DATA.domInv[id] = q; domInvDirty = true; }
        });
        if (domInvDirty) {
            domInvDirty = false;
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
        if (!inv || !DATA.nameToId) return null;
        const have = nm => {
            const id = DATA.nameToId[nm.toLowerCase()];
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

        /* Right-edge button, same idiom as the HT / FF tabs. */
        #cit-tip { position:fixed; display:none; z-index:2147483600; max-width:330px;
            background:#191919; color:#ddd; border:1px solid #555; border-radius:6px;
            padding:10px 12px; font:12px/1.5 Arial,sans-serif; pointer-events:none;
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
        #cit-panel .ok   { color:#6ab04c; }
        #cit-panel .bad  { color:#c0392b; }
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

    document.addEventListener('mouseover', e => {
        const b = e.target && e.target.closest && e.target.closest('[data-cit="1"]');
        if (!b || !b._citTip) return;
        const d = ensureTipEl();
        if (tipOwner !== b) { tipOwner = b; d.innerHTML = b._citTip; d.style.display = 'block'; }
        positionTip(e.clientX, e.clientY);
    }, true);

    document.addEventListener('mousemove', e => {
        if (!tipOwner) return;
        const b = e.target && e.target.closest && e.target.closest('[data-cit="1"]');
        if (b === tipOwner) positionTip(e.clientX, e.clientY);
        else hideTip();
    }, true);

    document.addEventListener('mouseout', e => {
        const b = e.target && e.target.closest && e.target.closest('[data-cit="1"]');
        if (b && b === tipOwner) hideTip();
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
        if (live.missing) {
            /* is_available === false means the member IN that position does not
               have the item -- it does NOT mean the position is empty. */
            body += `<div class="cit-tip-warn">${live.missing} teammate` +
                    `${live.missing > 1 ? 's do' : ' does'} not have this item yet:</div>`;
            body += live.missingSlots.map(m =>
                `<div class="cit-tip-p cit-tip-dim">${esc(m.label)}` +
                (m.userId ? ` \u2014 <a href="https://www.torn.com/profiles.php?XID=${m.userId}"`
                          + ` target="_blank" rel="noopener">profile</a>` : '') +
                `</div>`).join('');
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
        row.querySelector('.name');

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
        const wrap = row.querySelector('.name-wrap')
                  || (nameEl && nameEl.parentElement)
                  || nameEl;
        wrap.appendChild(frag);
    }

    function rowItemId(row) {
        return row.getAttribute('data-item')
            || row.dataset.item
            || (row.querySelector('[data-item]') && row.querySelector('[data-item]').getAttribute('data-item'))
            || null;
    }

    function processRow(row) {
        const nameEl = findNameEl(row);
        if (!nameEl) return;
        const name = cleanName(nameEl.textContent || '');
        if (!name) return;

        const id = rowItemId(row);
        const live = ocFor(id);
        const def  = ocDefFor(id);
        const stamp = [name, id, S.showC, S.showOC, live && live.total + ':' + live.mine + ':' + live.missing,
                       def && def.uses.length, qtyOf(id)].join('|');
        if (row.dataset.citSig === stamp) return;
        row.querySelectorAll('[data-cit="1"]').forEach(n => n.remove());
        row.dataset.citSig = stamp;
        row.classList.remove('cit-dimmed', 'cit-alert');

        const t = tagsFor(id, name);
        if (!t && !live && !def) { if (S.dim) row.classList.add('cit-dimmed'); return; }

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

    /* Confirmed markup: rows are li[data-item][data-qty] inside ul.items-cont. */
    const ROW_SEL = ['li[data-item]', 'ul.items-cont > li', 'ul[class*="items-cont"] > li'].join(',');

    function isItemRow(li) {
        if (li.classList.contains('menu-item-link')) return false;
        return li.hasAttribute('data-item') || !!li.querySelector('.name-wrap');
    }

    const rows = () => Array.prototype.filter.call(document.querySelectorAll(ROW_SEL), isItemRow);

    let pending = null;
    function refresh(force) {
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

    function openPanel() {
        document.getElementById('cit-panel')?.remove();
        const p = document.createElement('div');
        p.id = 'cit-panel';

        const f = forgeryReadiness();
        const oc = DATA.oc;
        const nameOfId = id => (DATA.catalogue && DATA.catalogue[id]) || ('item ' + id);
        let ocHtml = '<div class="muted">Not in an OC, or feed unavailable.</div>';
        if (oc && DATA.ocIndex) {
            const rowsHtml = Object.keys(DATA.ocIndex).map(id => {
                const e = DATA.ocIndex[id];
                const have = qtyOf(id);
                const cls = e.mine && !e.myAvailable ? 'bad' : e.missing ? 'bad' : 'ok';
                return `<div class="${cls}">${nameOfId(id)} ×${e.total}${e.mine ? ' <b>(your slot: ' + e.mySlot + ')</b>' : ''}` +
                       ` — ${e.missing ? e.missing + ' teammate(s) without it' : 'everyone has it'}` +
                       `${have !== null ? ` · you hold ${have}` : ''}</div>`;
            }).join('');
            const mine = myMissingItems();
            const warn = mine.length
                ? `<div class="bad" style="margin:4px 0 6px"><b>\u26A0 You are missing: ` +
                  `${mine.map(m => esc(m.name)).join(', ')}</b> for your position ` +
                  `(${esc(mine[0].slot || '?')})</div>`
                : '';
            ocHtml = `<div><b>${oc.name}</b> · ${oc.status} · ready in ${fmtLeft(oc.ready_at)}</div>`
                   + warn + rowsHtml;
        }

        /* Coverage across every OC in the game, from the authoritative defs. */
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
            covHtml =
                `<div class="ok">You hold ${held.length} of ${held.length + missing.length} OC items.</div>` +
                `<div class="bad" style="margin-top:6px">Missing (${missing.length}), most-used first:</div>` +
                `<div class="muted">` + missing.slice(0, 25).map(m =>
                    `${m.e.name} — ${m.e.uses.length} slot(s), ${m.e.crimes.length} crime(s)` +
                    `${m.e.consumed ? ' · consumed' : ''}`
                ).join('<br>') + (missing.length > 25 ? `<br>…and ${missing.length - 25} more` : '') + `</div>`;
        }

        p.innerHTML = `
            <span id="cit-close">✕</span>
            <h3>Crime Item Tagger <span class="muted" style="font-weight:normal">v${VERSION}</span></h3>

            <label>API key (Limited or custom)</label>
            <input type="text" id="cit-key" value="${S.key ? S.key.replace(/./g, '•') : ''}" placeholder="paste key, then Save">
            <button id="cit-save">Save key</button>
            <button id="cit-clear">Clear</button>
            <button id="cit-reload">Refresh data</button>
            <button id="cit-diag">Diagnostics</button>

            <h4>Display</h4>
            <label><input type="checkbox" id="cit-c" ${S.showC ? 'checked' : ''}> Show [C] badges</label>
            <label><input type="checkbox" id="cit-oc" ${S.showOC ? 'checked' : ''}> Show [OC] badges</label>
            <label><input type="checkbox" id="cit-dim" ${S.dim ? 'checked' : ''}> Dim untagged items</label>
            <label><input type="checkbox" id="cit-api" ${S.useApi ? 'checked' : ''}> Use API enrichment</label>

            <h4>Status</h4>
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
            ${DATA.inventory ? '' : '<div class="muted" style="font-size:11px">Torn\'s inventory API returns nothing, so quantities are collected from item pages as you open each category tab.</div>'}

            <div>OC definitions: ${DATA.ocDefs
                ? `<span class="ok">${DATA.ocDefs.length} crimes, ${Object.keys(DATA.ocDefIndex || {}).length} items</span>`
                : '<span class="muted">built-in table</span>'}</div>

            <h4>Your current OC</h4>
            ${ocHtml}

            <h4>OC item coverage (all crimes)</h4>
            ${covHtml}

            <h4>Forgery readiness</h4>
            ${f ? `
                <div class="ok">Ready (${f.ready.length}): ${f.ready.join(', ') || '—'}</div>
                <div class="bad" style="margin-top:6px">Blocked (${f.blocked.length}):</div>
                <div class="muted">${f.blocked.map(b => `${b.proj} — missing ${b.missing.join(', ')}`).join('<br>') || '—'}</div>
            ` : '<div class="muted">Needs inventory data (add an API key).</div>'}
        `;
        document.body.appendChild(p);

        p.querySelector('#cit-close').onclick = () => { p.remove(); setV('cit_open', false); };
        p.querySelector('#cit-save').onclick = () => {
            const v = p.querySelector('#cit-key').value.trim();
            if (v && !/^•+$/.test(v)) { S.key = v; LOG('key saved'); bootstrap(true).then(() => { p.remove(); openPanel(); }); }
        };
        p.querySelector('#cit-clear').onclick = () => {
            S.key = ''; ['catalogue', 'ocdefs', 'inventory', 'oc', 'self'].forEach(n => setV('cit_cache_' + n, null));
            DATA.catalogue = DATA.inventory = DATA.oc = DATA.ocIndex = DATA.ocDefs = DATA.ocDefIndex = DATA.self = DATA.keyInfo = null; BY_ID = null;
            refresh(true); p.remove(); openPanel();
        };
        p.querySelector('#cit-reload').onclick = () => {
            ['catalogue', 'ocdefs', 'inventory', 'oc', 'self'].forEach(n => setV('cit_cache_' + n, null));
            bootstrap(true).then(() => { p.remove(); openPanel(); });
        };
        p.querySelector('#cit-diag').onclick = () => {
            const rs = rows();
            LOG('=== DIAGNOSTICS v' + VERSION + ' ===');
            LOG('raw selector hits:', document.querySelectorAll(ROW_SEL).length,
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

        const bind = (sel, prop) => {
            p.querySelector(sel).onchange = e => { S[prop] = e.target.checked; refresh(true); };
        };
        bind('#cit-c', 'showC'); bind('#cit-oc', 'showOC'); bind('#cit-dim', 'dim'); bind('#cit-api', 'useApi');
    }

    try {
        GM_registerMenuCommand('Crime Item Tagger — settings', openPanel);
    } catch (e) {}

    /* ---- Persistent side tab, bottom-right, like the HT / FF tabs ---- */
    function mountTab() {
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

    /* Show one banner listing every item your position is short of. Dismissal is
       remembered per crime + item set, so it returns if the situation changes. */
    function renderMissingBanner() {
        document.getElementById('cit-banner')?.remove();
        const missing = myMissingItems();
        if (!missing.length) return;

        const sig = missing[0].crime + '|' + missing.map(m => m.id).sort().join(',');
        if (getV('cit_banner_dismissed', '') === sig) return;

        const m0 = missing[0];
        const names = missing.map(m => m.name).join(', ');
        const b = document.createElement('div');
        b.id = 'cit-banner';
        b.innerHTML =
            `<span class="cit-banner-x" title="Dismiss">\u2715</span>` +
            `\u26A0 Your <b>${esc(m0.crime)}</b> position (<b>${esc(m0.slot || '?')}</b>) ` +
            `is missing: <b>${esc(names)}</b>` +
            `<div class="cit-banner-sub">The crime starts in ${fmtLeft(m0.ready_at)}. ` +
            `You will not see a badge for ${missing.length > 1 ? 'these items' : 'this item'} ` +
            `— you do not own ${missing.length > 1 ? 'them' : 'it'} yet.</div>`;
        b.querySelector('.cit-banner-x').onclick = () => {
            setV('cit_banner_dismissed', sig);
            b.remove();
        };
        document.body.appendChild(b);
    }

    function togglePanel() {
        const p = document.getElementById('cit-panel');
        if (p) { p.remove(); setV('cit_open', false); }
        else { openPanel(); setV('cit_open', true); }
    }

    /* ==================================================================
       SECTION 7 — BOOTSTRAP
       ================================================================== */

    async function bootstrap(force) {
        DATA.errors = {};
        loadDomInv();
        /* No key is a supported mode: the built-in crime data still tags every
           row, and quantities come from the pages themselves. */
        if (!S.useApi || !S.key) { refresh(true); return; }

        await loadKeyInfo();

        const step = async (name, fn) => {
            try { await fn(); delete DATA.errors[name]; refresh(true); }
            catch (e) {
                DATA.errors[name] = e.message + (e.code ? ` (code ${e.code})` : '');
                WARN(name + ' failed:', DATA.errors[name]);
            }
        };

        await step('catalogue', async () => { await loadCatalogue(); buildIdMap(); });
        await step('inventory', loadInventory);
        await step('ocdefs',    loadOcDefs);
        await step('self',      loadSelf);
        await step('oc',        loadOwnOC);

        updateTabDot();
        renderMissingBanner();
    }

    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    mountTab();
    setInterval(mountTab, 3000);          // Torn re-renders aggressively; keep the tab alive
    refresh(true);
    if (getV('cit_open', false)) openPanel();
    bootstrap(false);

    LOG('v' + VERSION + ' loaded —', Object.keys(ITEMS).length, 'items mapped.',
        S.key ? 'API key present.' : 'No API key — open settings from the Tampermonkey menu to add one.');
})();
