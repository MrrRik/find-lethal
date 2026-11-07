/* Find Lethal rules engine: a deterministic model of one turn of Magic, following the
 * Comprehensive Rules for everything the puzzles use (see the card fields in puzzles.js).
 * Pure functions on plain-object state, shared by the game (game.js), the puzzle creator
 * (creator.js) and the solver (tools/solver.html), so all three play by the same rules.
 *
 * Turn structure: precombat main → beginning of combat → declare attackers → declare
 * blockers → first-strike damage (only if a first/double striker is in combat) → combat
 * damage → end of combat → postcombat main → end step → cleanup. The puzzle can be won as
 * late as the end step; the turn (and the attempt) is over when cleanup begins. You get
 * priority in every step but untap and cleanup: instants, flash cards, activated abilities
 * and mana abilities work at instant speed; lands, other spells and equip only in a main
 * phase. Mana empties from your pool between steps.
 *
 * Puzzle conventions (the "Puzzle rules" page in the game): you start in your first main
 * phase with no land played; the opponent never takes actions except declaring blockers
 * (abilities that trigger on its cards, like ward or "when this dies", still happen, and it
 * chooses their targets); whatever the opponent chooses is assumed to be worst for you, so a
 * solution must beat every block and every target it could pick; zones not shown are empty;
 * cards known to be on top of a library are drawn first, the rest of a library is unknown and
 * irrelevant (a drawn unknown card can't be used); your own life is irrelevant (infinite)
 * unless the puzzle shows it.
 *
 * Because the opponent never responds, your spells and abilities resolve right away; the
 * triggers they cause (prowess, "whenever you sacrifice a Treasure") resolve first, as they
 * would on the stack, and costs use the values from when they were paid. Triggers that need
 * a target you choose ("when this dies, deal 2 damage to any target") wait for your choice.
 *
 * Simplifications that can't change a puzzle's outcome: when an attacker is blocked by
 * several creatures, its damage is divided to kill as many blockers as possible (with
 * trample, lethal damage to each blocker first, the rest to the player); the targets of a
 * creature's enters-the-battlefield trigger are chosen while casting it.
 */
(function (root) {
  "use strict";

  const STEPS = ["untap", "upkeep", "draw", "main1", "boc", "attackers", "blockers", "fsdamage", "damage", "eoc", "main2", "end", "cleanup"];
  const at = (s) => STEPS.indexOf(s);
  const clone = (x) => JSON.parse(JSON.stringify(x));

  /* ---------- cards ---------- */
  // (on the battlefield the type line can be changed by an effect, layer 4: a crewed Vehicle is a creature)
  const typeHas = (c, re) => re.test((c && ((c.st && c.st.type) || c.type)) || "");
  const isCreature = (c) => typeHas(c, /creature/i);
  const isLand = (c) => typeHas(c, /\bland\b/i) && !isCreature(c);
  const isArtifact = (c) => typeHas(c, /artifact/i);
  const isInstant = (c) => typeHas(c, /instant/i);
  const isPermanent = (c) => typeHas(c, /creature|artifact|enchantment|planeswalker|land|battle/i);
  const isTreasure = (c) => !!c && ((!!c.token && /treasure/i.test(c.name || "")) || /—.*\bTreasure\b/.test((c.st && c.st.type) || c.type || ""));   // (a token named Treasure, or anything that is a Treasure: Kitesail Larcenist)
  const isPlaneswalker = (c) => typeHas(c, /planeswalker/i);
  // CR 702.164b: total toxic value — the sum of its "toxic N" abilities
  const toxicOf = (c) => keywords(c).reduce((n, k) => { const m = /^toxic (\d+)$/.exec(k); return n + (m ? Number(m[1]) : 0); }, 0);
  const loyaltyOf = (c) => (c.counters && c.counters.loyalty) || 0;
  // CR 310: battles. Puzzles only have Sieges you control, so their protector is always the opponent (CR 310.12a)
  const isBattle = (c) => typeHas(c, /\bbattle\b/i);
  const defenseOf = (c) => (c.counters && c.counters.defense) || 0;
  // A permanent's characteristics on the battlefield are worked out by the layer system (recomputeStatics, CR 613)
  // and kept in c.st: { kw: its abilities after layer 6, base: [p, t] after layers 7a-7b, mod: [p, t] from 7c,
  // lost: it lost all its abilities }. Off the battlefield a card is as printed.
  const keywords = (c) => (c.st ? c.st.kw : c.kw || []);
  const has = (c, k) => keywords(c).includes(k);
  // printed power/toughness ("*" — set by a characteristic-defining ability — is 0 where nothing defines it)
  const basePT = (c) => (c.pt || "0/0").split("/").map((v) => (v === "*" ? 0 : Number(v)));
  // Creature types: the subtypes of a creature or Kindred card; changeling makes a card every creature type (702.73a)
  const subtypes = (c) => ((c && ((c.st && c.st.type) || c.type)) || "").split("—")[1]?.trim().split(/\s+/).filter(Boolean) || [];   // (its type now: layer 4)
  const hasType = (c, t) => !!c && (keywords(c).includes("changeling") ? typeHas(c, /creature|kindred/i) : subtypes(c).includes(t));
  // counters: { "+1/+1": n, "-1/-1": n } (shown as dice in printed puzzles)
  const counterPT = (c) => ((c.counters && c.counters["+1/+1"]) || 0) - ((c.counters && c.counters["-1/-1"]) || 0);
  // CR 613.4c: counters modify power/toughness in layer 7c with the other modifications (they're read live here)
  const pt = (c, i) => (c.st ? c.st.base[i] + c.st.mod[i] : basePT(c)[i]) + counterPT(c);
  const power = (c) => pt(c, 0);
  const toughness = (c) => pt(c, 1);
  const firstStriker = (c) => has(c, "first strike") || has(c, "double strike");

  // A card's colors: given by the card, or read from its mana cost
  const COLOR_WORD = { white: "W", blue: "U", black: "B", red: "R", green: "G" };
  const WORD_OF = { W: "white", U: "blue", B: "black", R: "red", G: "green" };
  // (layer 5: an effect that sets its colors — "Enchanted land is the chosen color" — wins over the printed ones)
  const colorsOf = (c) => (c.st && c.st.colors) || c.colors ||
    [...new Set(parseCost(c.cost).pips.flatMap((p) => p.split("/")).filter((x) => "WUBRG".includes(x)))];
  const shareColor = (a, b) => colorsOf(a).some((x) => colorsOf(b).includes(x));

  // Protection from a color, from creatures, or from everything (DEBT: damage, enchanting/equipping, blocks, targets)
  function protectedFrom(c, src) {
    return keywords(c).some((k) => {
      const m = /^protection from (.+)$/.exec(k);
      if (!m) return false;
      if (m[1] === "everything") return true;
      if (m[1] === "creatures") return isCreature(src);
      if (m[1] === "multicolored") return colorsOf(src).length > 1;
      if (m[1] === "monocolored") return colorsOf(src).length === 1;
      return COLOR_WORD[m[1]] ? colorsOf(src).includes(COLOR_WORD[m[1]]) : false;
    });
  }
  // lifelink, or "Instant and sorcery spells you control have lifelink" (Heartflame Duelist)
  const lifelinked = (s, src, side) => has(src, "lifelink") || (typeHas(src, /instant|sorcery/i) && !!s[side] && s[side].battlefield.some((c) => c.spellsLifelink && !(c.st && c.st.lost)));
  const wardOf = (c) => { for (const k of keywords(c)) { const m = /^ward (\d+)( life \d+)?$/.exec(k); if (m) return Number(m[1]); } return 0; };
  // "Ward—{3}, Pay 3 life." (keyword "ward 3 life 3")
  const wardLifeOf = (c) => { for (const k of keywords(c)) { const m = /^ward \d+ life (\d+)$/.exec(k); if (m) return Number(m[1]); } return 0; };
  const indestructible = (c) => has(c, "indestructible");
  // "destroy": indestructible permanents aren't (CR 702.12b); a shield counter is removed instead (CR 122.1c)
  const survivesDestroy = (s, c, ev) => {
    if (indestructible(c)) return true;
    if (((c.counters || {}).shield || 0) > 0) { c.counters = { ...c.counters, shield: c.counters.shield - 1 }; if (!c.counters.shield) delete c.counters.shield; changed(s); ev.push({ type: "shield", id: c.id }); return true; }
    return false;
  };

  // CR 702.168a-b / 708.2: a face-down permanent (disguise) is a 2/2 creature with ward {2} and no name, subtypes, mana
  // cost or other abilities. The card itself is kept in c.hidden (its controller may look at it, CR 708.5).
  const FACE_DOWN = { name: "Face-down creature", type: "Creature", pt: "2/2", kw: ["ward 2"], colors: [] };
  const FACE_DOWN_KEEP = ["id", "owner", "tapped", "sick", "counters", "dmg", "attachedTo", "ts", "deathtouched", "wasCast", "suspected"];
  // (manifested — CR 701.40a, manifest dread: a 2/2 with no abilities at all, no ward; it can be turned face up for its
  // mana cost if it's a creature card, 701.40b)
  function faceDownOf(card, { manifest = false } = {}) {
    const hidden = { ...card };
    [...FACE_DOWN_KEEP.filter((k) => k !== "id" && k !== "owner"), "faceDown", "st", "tk", "manifested"].forEach((k) => delete hidden[k]);
    const out = { ...FACE_DOWN, kw: manifest ? [] : [...FACE_DOWN.kw], faceDown: true, hidden, ...(manifest || card.manifested ? { manifested: true, kw: [] } : {}) };
    FACE_DOWN_KEEP.forEach((k) => { if (k in card && k !== "faceDown") out[k] = card[k]; });
    return out;
  }
  // CR 716.2d: a permanent without a level is treated as level 1 (a Class starts there)
  const levelOf = (c) => c.level || 1;
  // CR 701.60: a suspected creature has menace and "This creature can't block" for as long as it's suspected
  // CR 122.1b: keyword counters (a trample counter: "this has trample")
  const KW_COUNTERS = ["flying", "first strike", "double strike", "deathtouch", "decayed", "exalted", "haste", "hexproof", "indestructible", "lifelink", "menace", "reach", "shadow", "trample", "vigilance"];
  const counterKw = (c) => (c.counters ? KW_COUNTERS.filter((k) => c.counters[k] > 0) : []);
  // CR 721.2: a station card (Spacecraft) with enough charge counters is an artifact creature with the abilities of its
  // station symbol (c.station: { at, kw })
  const stationed = (c) => !!(c.station && !c.station.noCreature && ((c.counters && c.counters.charge) || 0) >= c.station.at);
  const ownKw = (c) => {
    // (more station symbols: c.station.levels [{ at, kw }] — "2+ | …", "12+ | Flying, lifelink"; a Planet never becomes a creature: noCreature)
    const charge = (c.counters && c.counters.charge) || 0;
    const kws = [...counterKw(c), ...(stationed(c) ? c.station.kw || [] : []), ...((c.station && c.station.levels) || []).filter((l) => charge >= l.at).flatMap((l) => l.kw || [])];
    const base = c.suspected ? [...(c.kw || []), "menace", "can't block"] : c.kw || [];
    return kws.length ? [...base, ...kws.filter((k) => !base.includes(k))] : base;
  };
  // CR 702.179b, f: a player has no speed until something sets it (0 for effects that read it); max speed is 4 (702.179e)
  const speedOf = (s, side) => s[side].speed || 0;
  const maxSpeed = (s, side) => speedOf(s, side) >= 4;
  // Vehicles (CR 301.7) and Mounts (CR 702.171): "target creature or Vehicle", "Mounts and Vehicles you control"
  const isVehicle = (c) => subtypes(c).includes("Vehicle");
  const isMount = (c) => subtypes(c).includes("Mount");
  // The power a creature crews or saddles with: "as though its power were 2 greater" (crewBonus), "using its toughness
  // rather than its power" (crewByToughness) — both gone if it lost its abilities
  const crewPower = (c) => {
    const own = !(c.st && c.st.lost);
    return Math.max((own && c.crewByToughness ? toughness(c) : power(c)) + (own && c.crewBonus ? c.crewBonus : 0), 0);
  };

  const ETRATA_AB = { cost: "{2}{U}{B}", effect: { etrataUp: true }, text: "{2}{U}{B}: Turn this face up (if you can't: exile it, cast it free)" };
  // A permanent's activated abilities; Equipment's equip ability is one of them (sorcery speed)
  function abilitiesOf(c) {
    // CR 702.168d / 116.2b: turning a face-down disguise card face up is a special action, any time you have priority
    // (not an ability: it doesn't use the stack and can't be lost). It's offered like an ability with `special`.
    if (c.faceDown) {
      const h = c.hidden || {}, out = [];
      if (h.disguise) out.push({ special: "turnFaceUp", cost: h.disguise, text: `Turn face up ${h.disguise}` });
      if (c.st && c.st.etrata) out.push(ETRATA_AB);   // (Etrata: face-down creatures you control have this ability)
      // a manifested creature card: for its mana cost (CR 701.40b)
      if (c.manifested && !h.unknown && /creature/i.test(h.type || "") && h.cost != null) out.push({ special: "turnFaceUp", cost: h.cost, text: `Turn face up ${h.cost || "{0}"}` });
      return out;
    }
    // CR 709.5e / 116.2m: unlocking a locked door of a Room is a special action (main phase, empty stack)
    if (c.layout === "room" && c.unlocked) {
      return c.faces.map((f, i) => (c.unlocked[i] ? null : { special: "unlock", door: i, cost: f.cost, sorcery: true, text: `Unlock ${f.name} (${f.cost})` })).filter(Boolean);
    }
    if (c.st && c.st.lost) return [];                          // it lost all its abilities (CR 613.1f)
    const list = [...(c.abilities || []), ...((c.st && c.st.abilities) || []), ...(c.safehouseAbilities || [])];   // (its own, then gained ones; Mirran Safehouse)
    if (c.equip && !c.equip.none) list.push({ cost: c.equip.cost, ...(c.equip.sacCost ? { sacCost: c.equip.sacCost } : {}), ...(c.equip.lessPerTargetColor ? { lessPerTargetColor: true } : {}), targets: "creature", filter: { controller: "you" }, sorcery: true, effect: { attach: true },
      text: `Equip ${c.equip.cost}` });
    // CR 702.122a: "Crew N" — tap any number of other untapped creatures you control with total power N or more:
    // this Vehicle becomes an artifact creature until end of turn (the crew is chosen as a.crew)
    keywords(c).forEach((k) => { const m = /^crew (\d+)$/.exec(k); if (m) list.push({ crew: Number(m[1]), effect: { becomeCreature: true, self: true }, text: `Crew ${m[1]}` }); });
    // CR 702.171a: "Saddle N" — tap other untapped creatures you control with total power N or more: this becomes saddled
    // until end of turn; only as a sorcery. (Paid like crew: the creatures are chosen as a.crew.)
    keywords(c).forEach((k) => { const m = /^saddle (\d+)$/.exec(k); if (m) list.push({ crew: Number(m[1]), saddle: true, sorcery: true, effect: { saddled: true, self: true }, text: `Saddle ${m[1]}` }); });
    // CR 702.184a: station — "Tap another untapped creature you control: Put a number of charge counters on this permanent
    // equal to the tapped creature's power. Activate only as a sorcery." (the creature: a.crew, one of them)
    if (c.station) list.push({ stationAb: true, sorcery: true, effect: { charge: "tapped", self: true }, text: c.station.noCreature ? "Station" : `Station (${c.station.at}+)` });
    // CR 702.167a: craft: { cost, filter, text } — "[Cost], Exile this, Exile [a material] from among permanents you
    // control and/or cards in your graveyard: Return this card transformed. Activate only as a sorcery." (a.craft: the material)
    if (c.craft && !c.transformed) list.push({ cost: c.craft.cost, sorcery: true, craft: c.craft, effect: { craftReturn: true }, text: c.craft.text || `Craft ${c.craft.cost}` });
    // CR 716.2a: a Class's "[Cost]: Level N" — its level becomes N; only if it's level N-1, and only as a sorcery
    (c.levels || []).forEach((lv) => { if (lv.level === levelOf(c) + 1) list.push({ cost: lv.cost, sorcery: true, effect: { levelUp: lv.level, self: true }, text: `Level ${lv.level} (${lv.cost})` }); });
    // CR 719.3c: a Case's "Solved — [ability]" can only be activated once it's solved; a station symbol's ability only at
    // its threshold (CR 721.2)
    // (ifCharge: a station symbol's ability, there from that many charge counters on)
    return list.filter((ab) => (!ab.ifSolved || c.solved) && (!ab.ifStationed || stationed(c)) && (!ab.ifCharge || ((c.counters && c.counters.charge) || 0) >= ab.ifCharge));
  }

  // A card with several faces (modal double-faced, split, Adventure, transforming) used as one of them:
  // the face's rules over the card's. Cards without faces are themselves.
  function faceOf(card, a = {}) {
    if (!card.faces) return card;
    const face = card.faces[a.face || 0] || card.faces[0];
    // (a transforming card's faces are complete: the back face has none of the front face's abilities, CR 712.8e)
    const base = card.layout === "transform" ? Object.fromEntries(KEEP_ON_TRANSFORM.filter((k) => k in card).map((k) => [k, card[k]])) : card;
    return { ...base, ...face, id: card.id, owner: card.owner, faces: card.faces, layout: card.layout, face: a.face || 0, image: face.image || card.image };
  }

  // The card as it is on the battlefield after being cast or played as that face
  const asFace = (card, face) => (card.faces ? faceOf(card, { face }) : card);

  // Is a part's target still there and still legal when it resolves? (some of several targets is enough)
  function stillLegal(s, f, p) {
    if (p.target == null) return true;
    // (CR 608.2b: it resolves if any of its targets is still legal — an empty "up to one" group doesn't count)
    if (p.slots) return p.slots.some((sl, i) => p.target[i] != null && targetsFor(s, f, sl.targets, sl.filter).includes(p.target[i]));
    const legal = targetsFor(s, f, p.targets, p.filter);
    return [].concat(p.target).some((t) => legal.includes(t));
  }

  // What a spell does, as parts: each with its effect and what it targets. Modal spells give one part per
  // chosen mode ("Choose two —": a.mode and a.target are lists, one per mode); fight/bite cards one part with
  // two target slots (a.target = [yours, theirs]); divided damage one part with a.split amounts per target.
  const ONE = { min: 1, max: 1 };
  // CR 702.172a: spree — "choose one or more modes; as an additional cost, pay the costs of those modes" (each mode's
  // plus cost). Spree and "Choose two —" spells take a list of modes (a.mode) and one target per mode.
  const manyModes = (f) => !!f.spree || !!f.oneOrMoreIf || !!f.pawprints || (f.chooseCount || 1) > 1;
  // (every way to choose pawprint modes: multisets of mode indexes, one or more, worth up to f.pawprints)
  const pawCombos = (f) => { const out = []; (function go(start, acc, left) { if (acc.length) out.push(acc); f.modes.forEach((m, i) => { if (i >= start && m.paw <= left) go(i, [...acc, i], left - m.paw); }); })(0, [], f.pawprints); return out; };
  // ("Choose three. You may choose the same mode more than once.": every multiset of n modes)
  const multisets = (ids, n) => (n === 0 ? [[]] : ids.flatMap((id, i) => multisets(ids.slice(i), n - 1).map((r) => [id, ...r])));
  // a.blight: the creature you control that gets the -1/-1 counters (undefined: not blighted; "pay": paid instead)
  const blighted = (a) => a.blight != null && a.blight !== "pay";
  // the damage to divide: a number, or X (twice X once X is big enough: Shatterskull Smashing)
  function dividedTotal(f, x = 0) {
    if (f.divided !== "X") return f.divided;
    return f.dividedTwiceIfX && x >= f.dividedTwiceIfX ? 2 * x : x;
  }
  function plan(f, a = {}) {
    // "… instead if this spell's additional cost was paid" (Cinder Strike: blighted, it deals 4 instead of 2)
    if (f.ifBlighted && blighted(a)) f = { ...f, ...f.ifBlighted };
    // "If this spell was bargained, …" (CR 702.166b-c): the bargained version of the spell (a.bargain: what was sacrificed)
    if (f.ifBargained && a.bargain != null) f = { ...f, ...f.ifBargained };
    // "If evidence was collected, …" (CR 701.59c): the spell's version with the evidence collected
    if (f.ifEvidence && a.evidence != null) f = { ...f, ...f.ifEvidence };
    // "If the gift was promised, …" (CR 702.174b, m): the spell's version with the gift promised
    if (f.ifGift && a.gift) f = { ...f, ...f.ifGift };
    // "If a Dragon was beheld, …" (an optional behold, CR 701.4a)
    if (f.ifBeheld && a.behold != null && a.behold !== "pay") f = { ...f, ...f.ifBeheld };
    if (f.aura) return [{ effect: { attach: true }, targets: f.aura.targets || "creature", filter: f.aura.filter, count: ONE, target: a.target }];
    if (f.modes) {
      const many = manyModes(f);
      const picks = many ? [].concat(a.mode == null ? [] : a.mode) : [a.mode];
      return picks.map((mi, k) => {
        const m = f.modes[mi] || {};
        // (a mode can have two target slots: "target creature you control fights target creature an opponent controls")
        if (m.slots) return { effect: m.effect, slots: m.slots, target: many ? (a.target || [])[k] : a.target };
        return { effect: m.effect, targets: m.targets, filter: m.targetFilter, count: m.targetCount || ONE, target: many ? (a.target || [])[k] : a.target };
      });
    }
    if (f.slots) return [{ effect: f.effect, slots: f.slots, target: a.target }];
    if (f.divided != null) {
      const cX = f.targetCount && f.targetCount.max === "X" ? { ...f.targetCount, max: a.x || 0 } : f.targetCount;   // ("among any number of target creatures": up to X)
      return [{ effect: { divided: true, ...(f.dividedCounters ? { counters: true } : {}) }, targets: f.targets || "any", filter: f.targetFilter, count: cX || { min: 1, max: 3 },
        target: a.target, split: a.split, total: dividedTotal(f, a.x) }];
    }
    // (a target restriction or count with X — "target creature with mana value X or less", "up to X target artifacts" —
    // uses the X chosen as it's cast)
    const withXs = (v) => (v && /"X"/.test(JSON.stringify(v)) ? fillIn(v, { x: a.x }) : v);
    return [{ effect: f.effect, targets: f.targets, filter: withXs(f.targetFilter), count: withXs(f.targetCount) || ONE, target: a.target }];
  }
  // (kept for the game screen: the single-part view of a spell)
  function spellSpec(card, a = {}) {
    const p = plan(faceOf(card, a), a)[0] || {};
    return { effect: p.effect, targets: p.targets, filter: p.filter, count: p.count || ONE };
  }

  /* ---------- mana ---------- */
  const BASIC = { Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G" };

  function parseCost(cost) {
    const out = { generic: 0, pips: [], x: 0 };
    ((cost || "").match(/\{[^}]+\}/g) || []).forEach((sym) => {
      const s = sym.slice(1, -1);
      if (/^\d+$/.test(s)) out.generic += Number(s);
      else if (s === "X") out.x++;
      else out.pips.push(s);                                    // W, R/G (hybrid), R/P (Phyrexian), C
    });
    return out;
  }
  const manaValue = (cost) => { const p = parseCost(cost); return p.generic + p.pips.length; };
  // The cost with X chosen: {X}{R} with X = 3 is {3}{R}
  const withX = (cost, x) => (cost || "").replace(/\{X\}/g, `{${x || 0}}`);
  // What casting a spell this way costs: X filled in, plus "costs {1} more for each target beyond the first" (Fireball)
  // and the alternative to an additional cost: "behold a Goblin or pay {2}", "blight 2 or pay {1}" (a.behold / a.blight "pay")
  const costOf = (f, a = {}) => withX(f.cost, a.x) +
    (f.offspring && a.offspring ? f.offspring : "") +                     // offspring: an additional cost (CR 702.175a)
    // (spree; tiered, CR 702.183a: one mode, its cost added the same way)
    ((f.spree || f.tiered) && a.mode != null ? [].concat(a.mode).map((m) => (f.modes[m] && f.modes[m].plus) || "").join("") : "") +
    (f.extraCostPerTarget && Array.isArray(a.target) && a.target.length > 1 ? (typeof f.extraCostPerTarget === "string" ? f.extraCostPerTarget.repeat(a.target.length - 1) : `{${f.extraCostPerTarget * (a.target.length - 1)}}`) : "") +
    (f.behold && f.behold.orPay && a.behold === "pay" ? f.behold.orPay : "") +
    (f.blight && f.blight.orPay && a.blight === "pay" ? f.blight.orPay : "") +
    (f.discardCost && f.discardCost.orPay && a.discard === "pay" ? f.discardCost.orPay : "");
  // CR 702.41a: "affinity for artifacts" — costs {1} less for each artifact you control; lessPer: { filter, n } is the
  // same for other "costs {n} less to cast for each …" spells. CR 601.2f: only the generic part goes down, not below 0
  // bargainLess: "This spell costs {N} less to cast if it's bargained"
  function reducedCost(s, f, cost, a = {}) {
    const per = [...keywords(f).map((k) => /^affinity for (artifacts|equipment)$/i.exec(k)).filter(Boolean)
      .map((m) => ({ filter: m[1].toLowerCase() === "artifacts" ? { artifact: true } : { type: "Equipment" }, n: 1 })),
      ...(f.lessPer ? [f.lessPer] : [])];
    // ("This spell costs {2} less to cast if evidence was collected": evidenceLess)
    // ("costs {2} less to cast if you've cast another spell this turn": lessIfAnotherSpell; harmonize: the tapped
    // creature's power, CR 702.180a)
    const flat = (f.bargainLess && a.bargain != null ? f.bargainLess : 0) + (f.evidenceLess && a.evidence != null ? f.evidenceLess : 0) +
      (f.lessIfAnotherSpell && (s.spellsCast || 0) >= 1 ? f.lessIfAnotherSpell : 0) +
      // ("costs {1} less to cast if it targets a Spider": lessIfTargetType)
      // (no target chosen yet: as if it will target one, so "can I start casting it?" isn't answered too early)
      (f.lessIfTargetType && (a.target == null || [].concat(a.target).some((t) => hasType(find(s, t), f.lessIfTargetType.type))) ? f.lessIfTargetType.n : 0) +
      (f.harmonizing && a.tapFor != null && find(s, a.tapFor) ? Math.max(power(find(s, a.tapFor)), 0) : 0) +
      // "Instant and sorcery spells you cast cost {1} less to cast for each oil counter on this artifact" (a permanent's
      // spellsCostLess: { instantOrSorcery, perCounter | n })
      // ("This spell costs {2} less to cast if your life total is 5 or less" — only with your life shown)
      (f.lessIfLowLife && s.player.life != null && s.player.life <= f.lessIfLowLife.life ? f.lessIfLowLife.n : 0) +
      // ("The second spell you cast each turn costs {1} less to cast"; "Permanent spells you cast that have an Adventure cost {1} less")
      s.player.battlefield.filter((c) => c.secondSpellLess && !(c.st && c.st.lost)).length * ((s.spellsCast || 0) === 1 ? 1 : 0) +
      (isPermanent(f) && f.layout === "adventure" && !(a.face > 0) ? s.player.battlefield.filter((c) => c.adventurePermanentsLess && !(c.st && c.st.lost)).length : 0) +
      (!typeHas(f, /creature/i) ? s.player.battlefield.filter((c) => c.samut && !(c.st && c.st.lost)).length * speedOf(s, "player") : 0) +
      (typeHas(f, /creature/i) ? 2 * s.player.battlefield.filter((c) => c.sibsig && !(c.st && c.st.lost)).length : 0) +
      (typeHas(f, /creature/i) && /\blegendary\b/i.test(f.type || "") && !s.legendaryCreatureCast ? 2 * s.player.battlefield.filter((c) => c.serahLess && !(c.st && c.st.lost)).length : 0) +   // (Serah Farron)
      // Sunderflock: "This spell costs {X} less to cast, where X is the greatest mana value among Elementals you control."
      (f.castFromGraveyard ? 2 * s.player.battlefield.filter((c) => c.goblinFormula && !(c.st && c.st.lost)).length : 0) +   // (Green Goblin)
      (f.affinityArtifacts ? s.player.battlefield.filter(isArtifact).length : 0) + (f.affinityType ? s.player.battlefield.filter((c) => hasType(c, f.affinityType)).length : 0) +
      (f.lessFlyerPower ? s.player.battlefield.filter((c) => isCreature(c) && has(c, "flying")).reduce((t, c) => t + Math.max(0, power(c)), 0) : 0) +   // (The Lord of the Eagles)
      (f.affinityCreatures ? s.player.battlefield.filter(isCreature).length : 0) +   // (affinity, CR 702.41a)
      (f.lessGreatestPower ? Math.max(0, ...s.player.battlefield.filter(isCreature).map((c) => power(c))) : 0) +   // (The Skullspore Nexus)
      (a.delve > 0 && tevalOn(s) ? a.delve : 0) +   // (delve, CR 702.66a)
      (f.lessTotalToughness ? s.player.battlefield.filter(isCreature).reduce((t, c) => t + Math.max(0, toughness(c)), 0) : 0) +   // (The Pride of Hull Clade)
      (f.lessGreatestMVType ? Math.max(0, ...s.player.battlefield.filter((c) => hasType(c, f.lessGreatestMVType)).map((c) => manaValue(c.cost))) : 0) +   // (The Sibsig Ceremony)
      s.player.battlefield.filter((c) => c.battlecrier && !(c.st && c.st.lost)).length * s.player.battlefield.filter((c) => isCreature(c) && power(c) >= 4).length +   // (Temur Battlecrier)
      // ("The first instant or sorcery spell you cast each turn costs {3} less to cast")
      (typeHas(f, /instant|sorcery/i) && !(s.instSorcCast > 0) ? s.player.battlefield.filter((c) => c.firstInstSorcLess && !(c.st && c.st.lost)).reduce((t, c) => t + c.firstInstSorcLess, 0) : 0) +
      // ("Spells you cast cost {1} less to cast for each card your opponents have drawn this turn")
      s.player.battlefield.filter((c) => c.lessPerOppDraw && !(c.st && c.st.lost)).length * ((s.drawn || {}).opponent || 0) +
      // (Rowan / Will: "Spells you cast this turn that are black and/or red cost {X} less …, where X is the amount of life you lost this turn")
      (s.costLessByLife || []).reduce((t, r) => t + (r.colors.some((x) => colorsOf(f).includes(x)) ? (r.by === "lost" ? s.lifeLostTotal || 0 : s.lifeGainedTotal || 0) : 0), 0) +
      s.player.battlefield.filter((c) => c.spellsCostLess && !(c.st && c.st.lost)).reduce((t, c) => {
        const r = c.spellsCostLess;
        if (r.instantOrSorcery && !typeHas(f, /instant|sorcery/i)) return t;
        if (r.noncreature && typeHas(f, /creature/i)) return t;
        if (r.color && !colorsOf(f).includes(r.color)) return t;
        if (r.perArtifact) return t + s.player.battlefield.filter(isArtifact).length;
        if (r.equippedPower) { const host = c.attachedTo && find(s, c.attachedTo); return typeHas(f, /instant|sorcery/i) && host ? t + Math.max(0, power(host)) : t; }   // (Glamdring)
        if (r.bigInstSorcPerPower) return typeHas(f, /instant|sorcery/i) && manaValue(f.cost) >= 4 ? t + Math.max(0, power(c)) : t;   // (The Scarlet Witch)
        if (r.perCreatureInstSorc) return typeHas(f, /instant|sorcery/i) ? t + s.player.battlefield.filter(isCreature).length : t;   // (Witherbloom: instants and sorceries have affinity for creatures)
        if (r.toughGtPower && !(typeHas(f, /creature/i) && toughness(f) > power(f))) return t;   // (Doran: "with toughness greater than its power")   // (Sami: "Spells you cast have affinity for artifacts")      // ("White spells you cast cost {1} less")
        if (r.level && levelOf(c) < r.level) return t;                // (a Class's level 2 ability)
        return t + (r.perCounter ? (c.counters || {})[r.perCounter] || 0 : r.n || 0);
      }, 0);
    // Eluge: "The first instant or sorcery spell you cast each turn costs {U} (or {1}) less to cast for each land you control with a flood counter on it."
    const eluge = typeHas(f, /instant|sorcery/i) && !(s.instSorcCast > 0) && s.player.battlefield.some((c) => c.eluge && !(c.st && c.st.lost)) ? s.player.battlefield.filter((c) => isLand(c) && ((c.counters || {}).flood || 0) > 0).length : 0;
    const more = [...s.player.battlefield, ...s.opponent.battlefield].filter((c) => c.arachne && c.chosenCardType && !(c.st && c.st.lost) && typeHas(f, new RegExp(`\\b${c.chosenCardType}\\b`, "i"))).length;
    if (!per.length && !flat && !eluge && !more) return cost;
    let less = flat + per.reduce((t, p) => t + p.n * s.player.battlefield.filter((c) => objectIs(c, p.filter)).length, 0);
    const p = parseCost(cost), pips = [...p.pips];
    for (let i = 0; i < eluge; i++) { const k = pips.indexOf("U"); if (k >= 0) pips.splice(k, 1); else less++; }
    const generic = Math.max(0, p.generic + more - less);
    return (generic ? `{${generic}}` : "") + pips.map((x) => `{${x}}`).join("");
  }

  // Colors an untapped source can make ("C" = colorless), or null if it isn't a usable mana source.
  // Creatures with a mana ability can't tap for it while summoning sick (unless they have haste).
  function produces(c) {
    if (c.tapped) return null;
    if (isTreasure(c)) return "WUBRG";
    // (a land that's also a creature — earthbent — taps for mana too, unless summoning sick without haste)
    if (typeHas(c, /\bland\b/i) && isCreature(c) && c.sick && !has(c, "haste")) return null;
    // ("{T}: Add one mana of any color. Activate only if this land entered this turn": producesFresh, added to what it
    // always makes; "{T}: Add {C}. Activate only if this artifact has two or more oil counters on it": manaIfCounters)
    if (c.producesFresh && c.enteredThisTurn) return (c.produces || "C") + c.producesFresh;
    if (c.manaIfCounters && ((c.counters || {})[c.manaIfCounters.kind] || 0) < c.manaIfCounters.min) return null;
    if (typeHas(c, /\bland\b/i)) {
      if (c.produces) return c.produces;
      for (const [name, col] of Object.entries(BASIC)) if (new RegExp("\\b" + name + "\\b").test(c.type || "")) return col;
      return "C";
    }
    if (c.produces) return isCreature(c) && c.sick && !has(c, "haste") ? null : c.produces;
    return null;
  }

  // "You may play lands from your graveyard" (Glacierwood Siege's Sultai mode)
  const landsFromGraveyard = (s) => emblemSays(s, "landsFromGraveyard") || s.player.battlefield.some((c) => c.closetDoor != null && c.unlocked && c.unlocked[c.closetDoor]) || s.player.battlefield.some((c) => ((c.landsFromGraveyardMode != null && c.siegeMode === c.landsFromGraveyardMode) || c.landsFromGraveyard) && !(c.st && c.st.lost));
  const clarion = (s) => battlefieldNow(s).some(({ card: x }) => x.clarion && !(x.st && x.st.lost));
  // what a permanent can make here: its own mana abilities, plus ones others give (Enduring Vitality: your creatures; the
  // Verges: their second color only with a land of a type you control)
  // (which of your permanents change how mana is made — looked up once per battlefield, not for every mana source:
  // payment search asks for the sources very often)
  const MANA_FLAGS = new WeakMap();
  function manaFlags(s) {
    const bf = s.player.battlefield, key = `${bf.length}|${(s.effects || []).length}`, m = MANA_FLAGS.get(bf);
    if (m && m.key === key) return m.f;
    const on = (k) => bf.some((v) => v[k] && !(v.st && v.st.lost));
    const f = { mmenon: on("mmenon"), realm: bf.filter((v) => v.realmReborn && !(v.st && v.st.lost)).map((v) => v.id), creaturesTapAny: on("creaturesTapAny"), eluge: on("eluge"), roarMana: on("roarMana"), leylineGuildpact: on("leylineGuildpact"), landsTapAny: on("landsTapAny"),
      ingaMana: on("ingaMana"), clement: on("clement"), roxanne: bf.filter((v) => v.roxanne && !(v.st && v.st.lost)).length };
    MANA_FLAGS.set(bf, { key, f });
    return f;
  }
  function producesIn(s, c) {
    let p = produces(c);
    const mf = manaFlags(s);
    if (c.ifDragon && !s.player.battlefield.some((x) => hasType(x, "Dragon"))) return null;   // (Mox Jasper: "Activate only if you control a Dragon")
    if (isLand(c) && ((c.counters || {}).blight || 0) > 0) p = "C";   // (Ultima: "it loses all land types and abilities and has '{T}: Add {C}.'")
    // A Realm Reborn: "Other permanents you control have '{T}: Add one mana of any color.'"
    if (mf.realm.some((id) => id !== c.id) && !c.tapped && !(isCreature(c) && c.sick && !has(c, "haste"))) p = "WUBRG" + (p || "").replace(/[WUBRG]/g, "");
    if (c.verge && !c.tapped && s.player.battlefield.some((l) => isLand(l) && c.verge.types.some((ty) => hasType(l, ty)))) p = (p || "") + c.verge.color;
    if (mf.creaturesTapAny && isCreature(c) && !c.tapped && !(c.sick && !has(c, "haste"))) p = "WUBRG" + (p || "").replace(/[WUBRG]/g, "");
    if (mf.eluge && isLand(c) && ((c.counters || {}).flood || 0) > 0 && !c.tapped) p = (p || "") + "U";   // (a flooded land is an Island)
    if (c.chosenColorLand && c.chosenColor && !c.tapped) p = (p || "") + c.chosenColor;
    // Sunken Citadel: "{T}: Add one mana of the chosen color."
    if (c.citadel && c.chosenColor && !c.tapped) p = (p || "") + c.chosenColor;
    // Roar of the Fifth People II: "Creatures you control have '{T}: Add {R}, {G}, or {W}.'"
    if (mf.roarMana && isCreature(c) && !c.tapped && !(c.sick && !has(c, "haste"))) p = (p || "").replace(/[RGW]/g, "") + "RGW";
    if (mf.leylineGuildpact && isLand(c) && !c.tapped) p = "WUBRG" + (p || "").replace(/[WUBRG]/g, "");   // (Leyline of the Guildpact)
    // Wrenn and Realmbreaker: "Lands you control have '{T}: Add one mana of any color.'"
    if (mf.landsTapAny && isLand(c) && !c.tapped && !(isCreature(c) && c.sick && !has(c, "haste"))) p = "WUBRG" + (p || "").replace(/[WUBRG]/g, "");
    return p;
  }
  // Every way to pay `cost` from `sources` ({ id, colors }), as arrays of source ids.
  // Phyrexian pips ({R/P}) can be paid with 2 life instead: with irrelevant (infinite) life that's free;
  // with a life total shown each one is a "life:n" payment, as long as you have the life to pay (rule 119.4).
  function payments(sources, cost, lifeFree, life = 0) {
    const { generic, pips: all } = parseCost(cost);
    const pips = all.filter((p) => !(lifeFree && /\/P$/.test(p)));
    const out = [];
    const used = [];
    const fits = (src, pip) => pip.split("/").some((col) => col !== "P" && src.colors.includes(col));
    const paidLife = () => used.filter((u) => u.life).length * 2;
    (function pip(i) {
      if (i < pips.length && /\/P$/.test(pips[i]) && life - paidLife() >= 2) {
        used.push({ id: "life:" + i, life: true });
        pip(i + 1);
        used.pop();
      }
      if (i === pips.length) {
        const rest = sources.filter((s) => !used.includes(s));
        if (rest.length < generic) return;
        (function pick(start, chosen) {
          if (chosen.length === generic) { out.push([...used, ...chosen]); return; }
          for (let j = start; j < rest.length; j++) pick(j + 1, [...chosen, rest[j]]);
        })(0, []);
        return;
      }
      for (const s of sources) {
        if (used.includes(s) || !fits(s, pips[i])) continue;
        used.push(s);
        pip(i + 1);
        used.pop();
      }
    })(0);
    return out.map((p) => p.map((s) => s.id));
  }

  // Mana in the pool, then untapped lands, Treasures and other mana sources (minus any excluded,
  // e.g. a creature that is being tapped for the ability being paid for)
  // Mana that can only be spent on some things (CR 106.6: "Spend this mana only to cast a Dragon spell"): only.spell /
  // only.ability — a filter on the spell (castZone: where it's cast from) or on the source of the ability
  const restrictionOk = (only, forWhat) => !!forWhat && (
    (!!only.spell && !!forWhat.spell && objectIs(forWhat.spell, only.spell) && (!only.zone || forWhat.spell.castZone === only.zone) && (!only.notZone || forWhat.spell.castZone !== only.notZone)) ||
    (!!only.ability && !!forWhat.ability && objectIs(forWhat.ability, only.ability)));
  function manaSources(s, exclude = [], forWhat) {
    const mf = manaFlags(s);
    const pool = [...s.pool.map((sym, i) => ({ id: "pool:" + i, colors: sym === "*" ? "WUBRG" : sym, kind: "pool" })),
      // restricted mana in your pool, usable only for what it's for
      ...(s.rpool || []).map((m, i) => (restrictionOk(m.only, forWhat) ? { id: "rpool:" + i, colors: m.colors, kind: "pool" } : null)).filter(Boolean),
      // firebending mana (CR 702.189a): {R} that stays until end of combat
      ...Array.from({ length: s.firePool || 0 }, (_, i) => ({ id: "fire:" + i, colors: "R", kind: "pool" }))];
    // ("Max speed — {T}: Add {R}{R}": maxSpeedMana — a mana ability it has only at max speed, CR 702.178a)
    const field = s.player.battlefield.filter((c) => !exclude.includes(c.id) && !(c.maxSpeedMana && !maxSpeed(s, "player")))
      .filter((c) => !((isArtifact(c) || isCreature(c) || isPlaneswalker(c)) && clarion(s)))   // (Clarion Conqueror: no mana abilities either)
      .map((c) => {
        let colors = producesIn(s, c);
        // ("{T}: Add {B} or {R}. Activate only if this land entered this turn or if you control a basic land.")
        if (colors !== null && c.colorsIfBasicOrNew && (c.enteredThisTurn || s.player.battlefield.some((l) => isLand(l) && /\bbasic\b/i.test(l.type || "")))) colors += c.colorsIfBasicOrNew;
        // ("{T}: Add one mana of any color. Spend this mana only to cast an artifact spell.": restrictedMana)
        if (mf.ingaMana && isCreature(c) && !c.tapped && !(c.sick && !has(c, "haste")) && restrictionOk({ spell: { creature: true } }, forWhat)) colors = (colors || "") + "WUBRG";
        if (mf.clement && isCreature(c) && hasType(c, "Frog") && !c.tapped && !(c.sick && !has(c, "haste")) && restrictionOk({ spell: { creature: true } }, forWhat)) colors = (colors || "") + "GU";
        // Cavern of Souls: "{T}: Add one mana of any color. Spend this mana only to cast a creature spell of the chosen type"
        if (c.cavern && c.chosenType && !c.tapped && forWhat && forWhat.spell && isCreature(forWhat.spell) && hasType(forWhat.spell, c.chosenType)) colors = (colors || "") + "WUBRG";
        if (mf.mmenon && isArtifact(c) && !c.tapped && !(isCreature(c) && c.sick && !has(c, "haste")) && restrictionOk({ spell: {}, notZone: "hand" }, forWhat)) colors = (colors || "") + "U";
        if (c.restrictedMana && !c.tapped) { const extra = c.restrictedMana.filter((r) => restrictionOk(r.only, forWhat)).map((r) => r.colors).join(""); if (extra) colors = (colors || "") + extra; }
        return { id: c.id, colors, kind: isTreasure(c) ? "treasure" : isLand(c) ? "land" : "other" };
      })
      .filter((x) => x.colors !== null && x.colors !== "");   // (a source whose only mana can't be spent here makes none)
    // More mana from one tap: "Add {C}{C}" (manaAmount), and triggered mana abilities — "whenever enchanted Forest is
    // tapped for mana, add an additional one mana of the chosen color" (Utopia Sprawl; CR 605.1b, 605.4a: right away,
    // no stack). Each extra mana is its own payment slot "id+n", usable only when "id" itself is tapped.
    const extras = field.flatMap((src) => [...manaExtras(s, find(s, src.id)), ...restrictedExtras(find(s, src.id), forWhat)].filter((x) => x).map((colors, k) => ({ id: `${src.id}+${k + 1}`, colors, kind: src.kind, parent: src.id })));
    return [...pool, ...field, ...extras];
  }
  // more restricted mana from one tap: "{T}: Add {C}{C}. Spend this mana only to activate abilities." (restrictedMana
  // entries with amount); Sunken Citadel: "{T}: Add two mana of the chosen color. Spend this mana only to activate abilities of land sources."
  function restrictedExtras(c, forWhat) {
    const out = [];
    (c.restrictedMana || []).forEach((r) => { if (r.amount > 1 && restrictionOk(r.only, forWhat)) for (let i = 1; i < r.amount; i++) out.push(r.colors); });
    if (c.citadel && c.chosenColor && restrictionOk({ ability: { land: true } }, forWhat)) out.push(c.chosenColor);
    return out;
  }
  // The extra mana tapping this permanent makes (beyond the first), as color strings
  function manaExtras(s, c) {
    const out = [];
    for (let i = 1; i < (c.manaAmount || 1); i++) out.push(produces(c));
    if (c.maxSpeedManaAmount && maxSpeed(s, "player")) for (let i = 1; i < c.maxSpeedManaAmount; i++) out.push(produces(c));   // ("Max speed — {T}: Add {C}{C}")
    if (c.manaPerCreature) for (let i = 1; i < s.player.battlefield.filter(isCreature).length; i++) out.push(produces(c));
    if (c.token && isArtifact(c)) for (let r = manaFlags(s).roxanne; r > 0; r--) out.push(produces(c));
    // Virtue of Strength: "If you tap a basic land for mana, it produces three times as much of that mana instead"
    // (the extra mana is the same color as what it made; with one choice of color, as here, any of its colors)
    const tripled = /\bbasic\b/i.test(c.type || "") && isLand(c) ? s.player.battlefield.filter((v) => v.triplesBasicMana && !(v.st && v.st.lost)).length : 0;
    for (let i = 1; i < 3 ** tripled; i++) out.push(produces(c));
    s.player.battlefield.filter((a) => a.attachedTo === c.id && a.extraMana && a.chosenColor).forEach((a) => out.push(a.chosenColor));
    if (s.moltenTide && isLand(c) && hasType(c, "Mountain")) out.push("R");
    if (isLand(c) && producesIn(s, c) === "C" && s.player.battlefield.some((v) => v.ultimaMana && !(v.st && v.st.lost))) out.push("C");   // (Ultima: "Whenever you tap a land for {C}, add an additional {C}.")   // (Molten Tide: "whenever you tap a Mountain for mana, add an additional {R}")
    return out;
  }
  const manaAvailable = (s, exclude) => manaSources(s, exclude).length;

  // Pick the payment that keeps the most of the rest of the hand castable: floating mana first,
  // lands next, Treasures and creatures (which you may want to attack with) last
  // Convoke (702.51): each creature you tap pays for {1} or one mana of its color, summoning sick or not
  // (even one that's attacking). convoke: the creatures tapped this way (all of them must help), or "any".
  // lifePips: exactly this many Phyrexian pips are paid with life (compleated: how many changes the loyalty, so it's
  // the player's choice; then even with irrelevant life the pips are real)
  // Which colors of mana a payment spent (CR 106.1, 702.119a converge): each source's mana is the color its controller
  // chooses — the best choice for the spell: the most "{W}{W} was spent" conditions met (wants), then the most colors.
  // Returns counts per color, e.g. { W: 2, R: 2 }.
  function colorsSpentBy(s, pay, cost, convokers, wants) {
    const units = pay.filter((id) => !id.startsWith("life:") && !convokers.includes(id)).map((id) => {
      if (id.startsWith("pool:")) return s.pool[Number(id.slice(5))] || "C";
      if (id.startsWith("rpool:")) return ((s.rpool || [])[Number(id.slice(6))] || {}).colors || "C";
      if (id.startsWith("fire:")) return "R";
      const src = find(s, id.split("+")[0]);
      return (src && produces(src)) || "C";
    });
    const lifePaid = pay.filter((id) => id.startsWith("life:")).length;
    let pips = parseCost(cost).pips;
    for (let i = 0; i < lifePaid; i++) { const k = pips.findIndex((p) => /\/P$/.test(p)); if (k >= 0) pips = pips.filter((_, j) => j !== k); }
    // can these unit colors pay the colored and hybrid pips? ("2/R": an R, or two of anything)
    const pays = (cols) => {
      const used = cols.map(() => false);
      const go = (i) => {
        if (i >= pips.length) return true;
        const opts = pips[i].split("/");
        for (let u = 0; u < cols.length; u++) if (!used[u] && opts.includes(cols[u])) { used[u] = true; if (go(i + 1)) return true; used[u] = false; }
        if (opts[0] === "2") for (let u = 0; u < cols.length; u++) for (let v = u + 1; v < cols.length; v++) if (!used[u] && !used[v]) { used[u] = used[v] = true; if (go(i + 1)) return true; used[u] = used[v] = false; }
        return false;
      };
      return go(0);
    };
    const choices = units.map((u) => [...new Set(u.split(""))]);
    let best = null, bestScore = -1, tried = 0;
    const walk = (i, cols) => {
      if (tried > 4000) return;
      if (i === choices.length) {
        tried++;
        if (!pays(cols)) return;
        const n = {}; cols.forEach((c) => { if (c !== "C") n[c] = (n[c] || 0) + 1; });
        const score = wants.filter((w) => (n[w] || 0) >= 2).length * 100 + Object.keys(n).length;
        if (score > bestScore) { bestScore = score; best = n; }
        return;
      }
      choices[i].forEach((c) => walk(i + 1, [...cols, c]));
    };
    walk(0, []);
    return best || {};
  }
  function bestPayment(s, cost, { except, exclude = [], convoke, lifePips, forWhat } = {}) {
    const helpers = convoke === "any" ? s.player.battlefield.filter((c) => isCreature(c) && !c.tapped).map((c) => c.id) : convoke || [];
    const sources = [...manaSources(s, [...exclude, ...helpers], forWhat),
      ...helpers.map((id) => ({ id, colors: colorsOf(find(s, id)).join(""), kind: "convoke" }))];
    const fixed = lifePips != null;
    const lifeFree = s.player.life == null && !fixed;
    const life = s.player.life == null ? 1e9 : s.player.life;
    const options = payments(sources, cost, lifeFree, life)
      .filter((ids) => convoke === "any" || helpers.every((id) => ids.includes(id)))
      .filter((ids) => !fixed || ids.filter((id) => id.startsWith("life:")).length === lifePips);
    if (!options.length) return null;
    const others = s.player.hand.filter((h) => h.id !== except && !isLand(h) && h.cost != null);
    // (colors that known cards still to be drawn need — on top of your library: a source of such a color is tapped
    // last, so a Plains stays for the white card you'll draw; cards in hand are covered by the count above)
    const demand = new Set(s.player.library.flatMap((h) => parseCost(h.cost).pips.flatMap((p) => p.split("/"))));
    const needed = (x) => x.kind === "land" && [...x.colors].some((col) => demand.has(col));
    let best = null, bestScore = -Infinity;
    for (const ids of options) {
      const left = sources.filter((x) => !ids.includes(x.id));
      const lifeLeft = life - ids.filter((id) => id.startsWith("life:")).length * 2;
      const castable = others.filter((h) => payments(left, withX(h.cost, 0), s.player.life == null, lifeLeft).length).length;
      const kinds = ids.map((id) => (id.startsWith("life:") ? "life" : sources.find((x) => x.id === id).kind));
      // (life only when it keeps more of your hand castable: you never pay yourself to 0)
      if (lifeLeft <= 0 && kinds.includes("life")) continue;
      const score = castable * 100 + kinds.filter((k) => k === "pool").length * 2 - kinds.filter((k) => k === "treasure").length
        - kinds.filter((k) => k === "other").length * 30 - kinds.filter((k) => k === "life").length * 5 - kinds.filter((k) => k === "convoke").length * 30
        - ids.filter((id) => { const x = sources.find((y) => y.id === id); return x && needed(x); }).length * 3;
      if (score > bestScore) { bestScore = score; best = ids; }
    }
    return best;
  }

  /* ---------- state ---------- */
  function init(puzzle) {
    const s = clone({ player: puzzle.player, opponent: puzzle.opponent });
    ["player", "opponent"].forEach((side) => {
      const z = s[side];
      ["hand", "battlefield", "graveyard", "exile", "library", "libraryBottom"].forEach((k) => { z[k] = z[k] || []; });
      [...z.battlefield, ...z.hand, ...z.library].forEach((c) => { c.owner = c.owner || side; });
      // a card listed with faceDown: true is a face-down permanent (cast face down on an earlier turn)
      z.battlefield = z.battlefield.map((c) => (c.faceDown === true && !c.hidden ? faceDownOf(c) : c));
    });
    // every card's triggered abilities are built once here (the cards in a puzzle are known before it starts)
    s.listens = [];
    ["player", "opponent"].forEach((side) => ["hand", "battlefield", "graveyard", "exile", "library", "libraryBottom"]
      .forEach((k) => s[side][k].forEach((c) => listen(s, c))));
    s.phase = puzzle.startPhase || "main1";
    if (s.player.life != null) s.startLife = s.player.life;    // (your life total as the turn began: "more than your starting life total")
    s.landPlayed = !!puzzle.landPlayed;
    s.attacked = false;              // the declare attackers step has happened this turn
    s.combat = null;                 // { attackers, blocks: {attackerId: [blockerIds]}, blocked, fsHappened, dealtFirst }
    s.pool = [];                     // floating mana: "W" "U" "B" "R" "G" "C", or "*" for any color (Treasure)
    s.triggered = [];                // CR 603.3: abilities that triggered, until a player would receive priority
    s.pending = [];                  // triggered abilities being put on the stack (yours wait here for targets), and scry choices
    s.stack = [];                    // CR 405: spells and abilities on the stack, top first
    s.nextId = 1;
    // timestamps (CR 613.7): objects already on the battlefield, in the order listed (only kept when they matter)
    battlefieldNow(s).forEach(({ card }) => {
      card.ts = stamp(s);
      // a planeswalker on the board starts with its printed loyalty unless the puzzle says otherwise
      if (isPlaneswalker(card) && card.loyalty != null && !(card.counters && "loyalty" in card.counters)) card.counters = { ...(card.counters || {}), loyalty: Number(card.loyalty) };
      // …and a battle with its printed defense (CR 310.4b)
      if (isBattle(card) && card.defense != null && !(card.counters && "defense" in card.counters)) card.counters = { ...(card.counters || {}), defense: Number(card.defense) };
    });
    s.effects = [];                  // continuous effects from resolved spells and abilities (see addEffect)
    recomputeStatics(s);
    return s;
  }

  const sideOf = (s, card) => (s.player.battlefield.includes(card) ? "player" : "opponent");
  // "You may cast spells as though they had flash" (castsAsFlash, Heliod, the Warped Eclipse); "You may cast sorcery
  // spells this turn as though they had flash" (s.sorceryFlash, Complete the Circuit)
  const asFlash = (s, f) => s.player.battlefield.some((c) => (c.castsAsFlash || (c.noncreatureFlash && !typeHas(f, /creature/i))) && !(c.st && c.st.lost)) || (!!s.sorceryFlash && typeHas(f, /sorcery/i)) || !!f.flashFor ||
    (f.flashIfType && s.player.battlefield.some((c) => hasType(c, f.flashIfType)));   // ("You may cast this spell as though it had flash if you control a Human")
  // CR 305.2: one land a turn, plus "you may play an additional land this turn" effects and "on each of your turns" statics
  const landsPlayed = (s) => s.landsPlayed != null ? s.landsPlayed : s.landPlayed ? 1 : 0;
  const landsAllowed = (s) => 1 + (s.extraLands || 0) + s.player.battlefield.filter((c) => c.extraLandEachTurn && !(c.st && c.st.lost) &&
    // ("As long as you control another Elf, you may play an additional land": { ifOther: "Elf" })
    (!c.extraLandEachTurn.ifOther || s.player.battlefield.some((x) => x !== c && hasType(x, c.extraLandEachTurn.ifOther)))).length;
  // your creatures that "attack each combat if able" and could attack now (untapped, no summoning sickness or haste)
  const mustAttackers = (s) => s.player.battlefield.filter((c) => isCreature(c) && has(c, "attacks each combat if able") && !c.tapped &&
    !(c.sick && !has(c, "haste")) && (!has(c, "defender") || has(c, "attacks despite defender")) && !has(c, "can't attack"));
  const lifeTax = (s, target) => [target].flat(3).filter(Boolean).map((id) => s.opponent.battlefield.find((c) => c.id === id)).filter((c) => c && c.targetLifeTax && !(c.st && c.st.lost)).reduce((t, c) => t + c.targetLifeTax, 0);
  // convoke: its own keyword, or "Noncreature spells you cast have convoke" (Caetus, Sea Tyrant of Segovia)
  const spellConvoke = (s, f) => has(f, "convoke") || (f.castZone === "exile" && s.player.battlefield.some((c) => c.exileConvoke && !(c.st && c.st.lost))) || (typeHas(f, /creature/i) && s.player.battlefield.some((c) => c.creatureConvoke && !(c.st && c.st.lost))) || (!typeHas(f, /creature/i) && s.player.battlefield.some((c) => c.noncreatureConvoke && !(c.st && c.st.lost))) ||
    (typeHas(f, /creature/i) && s.player.battlefield.some((c) => c.creatureConvokeDoor != null && c.unlocked && c.unlocked[c.creatureConvokeDoor]));
  const isEquipped = (s, c) => [...s.player.battlefield, ...s.opponent.battlefield].some((e) => e.equip && e.attachedTo === c.id);
  const find = (s, id) => s.player.battlefield.find((c) => c.id === id) || s.opponent.battlefield.find((c) => c.id === id);
  const inMain = (s) => s.phase === "main1" || s.phase === "main2";
  // CR 307.1 / 505.6a / 602.5d: sorcery speed is your main phase with an empty stack (lands too, CR 305.2 / 116.2a)
  const sorceryTime = (s) => inMain(s) && !s.stack.length;
  // You get priority in every step except untap and cleanup; the turn is over once cleanup begins
  const hasPriority = (s) => (at(s.phase) >= at("upkeep") && at(s.phase) < at("cleanup")) || (!!s.turnEnding && !!(s.stack.length || s.pending.length || s.triggered.length));
  // (Ultima ends the turn: abilities that triggered still go on the stack in the cleanup step, CR 514.3a)
  const turnOver = (s) => (at(s.phase) >= at("cleanup") && !(s.turnEnding && (s.stack.length || s.pending.length || s.triggered.length))) || dead(s.player);
  // (with "at the beginning of combat" triggers in the puzzle, attackers are declared from the beginning of combat step:
  // those triggers happen first, CR 507.1 / 508.1)
  const bocMatters = (s) => s.listens.includes("beginningOfCombat");
  const canAttackNow = (s) => !s.attacked && !s.pending.length && !s.stack.length && ((s.phase === "main1" && !bocMatters(s)) || s.phase === "boc");

  // A permanent leaves the battlefield. CR 603.10a: leaves-the-battlefield triggers (dies, sacrificed, leaves) look
  // back in time: they're checked against the permanents just before the event (the leaving one included), using
  // last known information (CR 113.7a). Simultaneous events pass the same `lookBack` snapshot (CR 603.10).
  function leave(s, card, zone, ev, { sacrificed = false, lookBack } = {}) {
    const side = sideOf(s, card);
    // CR 614.6: replacement effects change where it goes before anything happens ("exile it instead")
    zone = replaceMove(s, card, "battlefield", zone, side);
    // a finality counter: "If a permanent with a finality counter on it would be put into a graveyard from the battlefield, exile it instead" (CR 122.1i)
    if (zone === "graveyard" && card.counters && card.counters.finality > 0) zone = "exile";
    const darkness = zone === "graveyard" && isCreature(card) && !card.token && s[side === "player" ? "opponent" : "player"].battlefield.find((c) => c.darknessCrystal && !(c.st && c.st.lost));
    if (darkness) { zone = "exile"; changeLife(s, side === "player" ? "opp" : "you", 2, ev); }
    // (the snapshot and last known information are only built if something in the puzzle listens)
    const heard = ["sacrificed", "leaves", "dies"].some((t) => s.listens.includes(t));
    const before = heard ? lookBack || battlefieldNow(s) : null;
    const last = heard ? lastKnown(card) : { id: card.id, type: card.type };
    if (referenced(s, card.id)) (s.lki = s.lki || {})[card.id] = lastKnown(card);   // its triggers still need it (CR 113.7a)
    s[side].battlefield = s[side].battlefield.filter((c) => c !== card);
    if (!isLand(card)) s.permLeft = true;                        // (void: a nonland permanent left the battlefield this turn)
    if (side === "player") s.leftYours = true;                   // (disappear: a permanent left the battlefield under your control)
    if (side === "player" && isCreature(card)) s.creaturesLeftYours = (s.creaturesLeftYours || 0) + 1;
    changed(s);
    // CR 400.7: effects on it end with it; if the card comes back, it's a new object they don't apply to — and spells
    // and abilities that targeted it now target nothing there (CR 608.2b: no longer in the zone it was in)
    if (s.effects && s.effects.length) s.effects = s.effects.filter((e) => e.id !== card.id);
    if (s.stack.length || s.pending.length) forgetTarget(s, card.id);
    ev.push({ type: "left", id: card.id, zone });
    if (sacrificed) emit(s, { type: "sacrificed", obj: last, side }, ev, before);
    emit(s, { type: "leaves", obj: last, side, to: zone }, ev, before);
    // CR 700.4: "dies" means put into a graveyard from the battlefield (a token dies too, then ceases to exist)
    if (zone === "graveyard" && isCreature(card)) s.creatureDied = true;
    if (zone === "graveyard" && isCreature(card) && side === "player") s.yourCreatureDied = true;
    if (zone === "graveyard" && isCreature(card)) s.diedCount = (s.diedCount || 0) + 1;   // ("each creature that died this turn")   // ("died under your control this turn")
    if (zone === "graveyard" && isCreature(card) && side === "player" && s.waltz) s.triggered.push({ side: "player", name: "Waltz of Rage", srcId: "waltz", td: defId(WALTZ), event: {} });
    if (zone === "graveyard" && isCreature(card) && !hasType(card, "Zombie")) s.nonZombieDied = true;
    if (zone === "graveyard" && isArtifact(card)) s.artifactsDied = (s.artifactsDied || 0) + 1;
    if (zone === "graveyard" && isCreature(card) && side === "player") s.yourDiedN = (s.yourDiedN || 0) + 1;
    if (zone === "graveyard" && isCreature(card) && !card.token) { const k = `${side}:${s.evBatch || 0}`; s.diedPower = { ...(s.diedPower || {}), [k]: ((s.diedPower || {})[k] || 0) + Math.max(0, last.lastPower ?? power(card)) }; }
    if (zone === "graveyard" && isCreature(card)) emit(s, { type: "dies", obj: last, side, equipped: isEquipped(s, card), batchNo: s.evBatch || 0, greatest: (before || []).filter((x) => x.side === side && isCreature(x.card)).every((x) => power(x.card) <= (last.lastPower ?? power(card))) }, ev, before);
    // ("for as long as you control this Vehicle": control returns when it leaves)
    ["player", "opponent"].forEach((sd) => s[sd].battlefield.filter((x) => x.controlledWhile === card.id).forEach((x) => { delete x.controlledWhile; const back = sd === "player" ? "opponent" : "player"; s[sd].battlefield = s[sd].battlefield.filter((y) => y !== x); s[back].battlefield.push(x); changed(s); }));
    // CR 610.3: cards exiled "until this leaves the battlefield" return right away (a one-shot effect, not a trigger)
    ["player", "opponent"].forEach((sd) => s[sd].exile.filter((x) => x.exiledUntil === card.id).forEach((x) => returnExiledCard(s, x, sd, ev)));
    ["player", "opponent"].forEach((sd) => s[sd].battlefield.filter((x) => x.exileWith === card.id).forEach((x) => leave(s, x, "exile", ev)));   // ("Exile those tokens when Mysterio leaves the battlefield.")
    if (card.terminalVelocity) { (s.lki = s.lki || {})[card.id] = lastKnown(card); s.triggered.push({ side, name: card.name, srcId: card.id, td: defId(TV_LEAVE), event: { id: card.id, mv: manaValue(card.cost) } }); delete card.terminalVelocity; }
    if (card.earthbent && !card.token && (zone === "graveyard" || zone === "exile")) s.triggered.push({ side, name: "Earthbend", srcId: card.id, td: defId(EARTH_RETURN), event: { id: card.id } });
    if (card.copyOriginal) endCopy(s, card);                    // (a permanent that became a copy is itself again elsewhere)
    // ("for as long as this creature remains on the battlefield": Kitesail Larcenist, Tishana's Tidebinder)
    if ((s.effects || []).some((e) => e.whileOnField === card.id)) { s.effects = s.effects.filter((e) => e.whileOnField !== card.id); changed(s); }
    // Melira: "When it's put into a graveyard this turn, return that card to the battlefield under its owner's control."
    if (card.returnIfDies && zone === "graveyard" && !card.token) s.triggered.push({ side, name: "Melira", srcId: card.id, td: defId(RETURN_DIED), event: { id: card.id } });
    if (card.token) return;                                      // CR 111.7: tokens cease to exist
    // CR 712.8a: off the battlefield a double-faced card has only its front face's characteristics
    // CR 708.9: a face-down permanent is revealed as it leaves: the card goes there face up
    const fresh = card.faceDown ? { ...card.hidden, id: card.id } : card.transformed ? { id: card.id, owner: card.owner, faces: card.faces, layout: card.layout, ...card.faces[0] } : { ...card };
    ["dmg", "tapped", "sick", "deathtouched", "owner", "counters", "attachedTo", "st", "ts", "loyaltyUsed", "bargained", "wasCast", "suspected", "solved", "evidenced", "saddled", "level", "offspringPaid", "unlocked", "manifested", "exhausted", "warped", "webSlung", "sneaked", "prepared", "enteredThisTurn", "poweredUp", "xPaid", "convokedBy", "giftPromised", "usedOnce", "impendingNow", "zantetsuken", "sephResolved", "resolvedN", "earthbent", "evoked", "colorsSpent", "kwTs", "returnIfDies", "miteOnDamage", "conduitCast", "loyaltyTwice", "castFromGy", "webSlungMV", "enteredFromGraveyard", "chosenCardType", "exileWith"].forEach((k) => delete fresh[k]);   // CR 400.7
    putCard(s, fresh, card.owner || side, zone);
    if (darkness) fresh.exiledBy = darkness.id;
    if (zone === "exile" && side === "player" && isCreature(card)) noteExiled(s, [fresh], "yours", ev);
    else if (zone === "exile") noteExiled(s, [fresh], "battlefield", ev);
    if (zone === "exile" && side === "opponent" && isCreature(card)) s.oppExiledCreatures = (s.oppExiledCreatures || 0) + 1;
  }

  /* ---------- copies (CR 707) ---------- */
  // CR 707.2: a copy gets only the copiable values — the printed characteristics (and other copy effects) — not
  // counters, damage, tapped state or effects; CR 707.9a: what an "except" adds becomes part of them
  const NOT_COPIED = ["id", "owner", "tapped", "counters", "dmg", "sick", "attachedTo", "ts", "deathtouched", "loyaltyUsed",
    "token", "chosenColor", "transformed", "faces", "layout", "onAdventure", "tk", "entersAsCopy",
    "hidden", "faceDown", "suspected", "solved", "evidenced", "playable", "plotted", "plottedNow", "saddled", "level", "offspringPaid", "unlocked", "manifested", "exhausted", "warped", "webSlung", "discardedThisTurn", "sneaked", "prepared", "enteredThisTurn", "poweredUp", "xPaid", "convokedBy",
    "st", "lastPower", "lastToughness"];   // (designations aren't copiable: CR 701.60b, 719.3b)
  function copyValues(c, except = {}) {
    const v = {};
    Object.keys(c).forEach((k) => { if (!NOT_COPIED.includes(k)) v[k] = clone(c[k]); });
    const { kw = [], legendary, notLegendary, addTypes: more, ...rest } = except;
    const out = { ...v, ...clone(rest), kw: [...(v.kw || []), ...kw] };
    // ("except it's legendary" / "except it isn't legendary" / "is a Mutant in addition to its other types": the copiable type line)
    if (legendary && !/\blegendary\b/i.test(out.type || "")) out.type = `Legendary ${out.type}`;
    if (notLegendary) out.type = (out.type || "").replace(/\bLegendary\s+/i, "");
    if (more) out.type = addTypes(out.type, more);
    return out;
  }

  // CR 707.2 / 613.2a: a permanent that "becomes a copy" of another takes on its copiable values (layer 1); its own state
  // (counters, damage, tapped, attachments, summoning sickness) stays. copyUntil: { attachedBy } — "for as long as this
  // Equipment remains attached to it"; the original values come back then, or when it leaves the battlefield.
  const COPY_KEEP = [...NOT_COPIED, "st", "enteredThisTurn", "wasCast", "copyOriginal", "copyUntil", "prepared", "resolvedN", "usedOnce", "exhausted", "kwTs"];
  function becomeCopyOf(s, perm, src, except = {}, until) {
    if (!perm || !src) return;
    if (!perm.copyOriginal) perm.copyOriginal = Object.fromEntries(Object.keys(perm).filter((k) => !COPY_KEEP.includes(k)).map((k) => [k, clone(perm[k])]));
    Object.keys(perm).filter((k) => !COPY_KEEP.includes(k)).forEach((k) => delete perm[k]);
    Object.assign(perm, copyValues(src, except));
    if (until) perm.copyUntil = until;
    listen(s, perm); changed(s);
  }
  function endCopy(s, perm) {
    if (!perm.copyOriginal) return;
    Object.keys(perm).filter((k) => !COPY_KEEP.includes(k)).forEach((k) => delete perm[k]);
    Object.assign(perm, perm.copyOriginal); delete perm.copyOriginal; delete perm.copyUntil;
    listen(s, perm); changed(s);
  }
  // CR 707.10: copy a spell on the stack — the copy keeps every choice (modes, targets, X), isn't cast, and you may
  // choose new targets for it (CR 707.10c); spells can also gain keywords ("those spells gain wither")
  function copySpell(s, item, { side = "player", gain = [], notLegendary } = {}, ev) {
    const f = faceOf(item.card, item.a);
    let a = item.a;
    if (a.target != null && !Array.isArray(a.target)) {
      const p = plan(f, a)[0];
      const others = p && p.targets ? targetsFor(s, f, p.targets, p.filter, side).filter((t) => t !== a.target) : [];
      const pick = choose(s, `Copy of ${f.name}: new target?`, ["Keep the same target", ...others.map((t) => `New target: ${nameIn(s, t)}`)], side, [null, ...others.map((t) => (t === "opp" || t === "you" ? null : t))]);
      if (pick > 0) a = { ...a, target: others[pick - 1] };
    }
    if (f.uncopyable) return;                                     // ("This spell can't be copied.")
    if (gain.length) item.gain = [...(item.gain || []), ...gain];
    s.stack.unshift({ ...item, a, copy: true, gain: [...(item.gain || [])], id: `${item.id}-copy${s.nextId++}`, ...(notLegendary ? { notLegendary: true } : {}) });
    ev.push({ type: "copied", id: item.id });
  }
  // CR 707.10: a copy of an activated or triggered ability on the stack — it keeps its choices; you may choose new targets
  function copyAbility(s, item, side, ev) {
    let target = item.kind === "trigger" ? item.target : item.a && item.a.target;
    if (target != null && !Array.isArray(target)) {
      const d = item.kind === "trigger" ? trig(item) : { targets: item.ab.targets, filter: item.ab.filter };
      const src = item.kind === "trigger" ? srcOf(s, item) : item.ctx.src;
      const others = d.targets ? targetsFor(s, src, d.targets, d.filter, side).filter((x) => x !== target) : [];
      const pick = choose(s, `Copy of ${item.name}: new target?`, ["Keep the same target", ...others.map((x) => `New target: ${nameIn(s, x)}`)], side);
      if (pick > 0) target = others[pick - 1];
    }
    s.stack.unshift(item.kind === "trigger" ? { ...item, target, copy: true } : { ...item, a: { ...item.a, target }, copy: true, id: `${item.id}-copy${s.nextId++}` });
    ev.push({ type: "copied", id: item.id || item.srcId });
  }
  const nameIn = (s, id) => (id === "opp" ? "opponent" : id === "you" ? "you" : typeof id === "string" && id.startsWith("stack:") ? `${(s.stack[s.stack.length - 1 - Number(id.slice(6))] || {}).name || "an ability"} (on the stack)` : (find(s, id) || s.stack.find((x) => x.id === id) || [s.player, s.opponent].flatMap((z) => z.graveyard).find((c) => c.id === id) || {}).name || id);

  // CR 701.27a: transform a double-faced permanent — turn it over. CR 712.18: it stays the same object (counters,
  // damage, effects and being here since the turn began all stay); only its characteristics switch to the other
  // face (CR 712.8d-e). Not a double-faced card, or the other face is an instant or sorcery: nothing happens
  // (CR 701.27c, 712.10).
  const KEEP_ON_TRANSFORM = ["id", "owner", "faces", "layout", "tapped", "counters", "dmg", "sick", "attachedTo", "ts", "deathtouched", "chosenColor", "token"];
  function transform(s, c, ev) {
    // (a modal double-faced card can transform too when an effect says so — the Spider-Man and Marvel heroes)
    if (!c || (c.layout !== "transform" && c.layout !== "modal_dfc") || !c.faces || c.faces.length < 2) return;
    const to = c.transformed ? 0 : 1;
    const face = compile(c.faces[to]);
    if (/instant|sorcery/i.test(face.type || "")) return;
    Object.keys(c).filter((k) => !KEEP_ON_TRANSFORM.includes(k)).forEach((k) => delete c[k]);
    Object.assign(c, { ...face, transformed: to === 1 });
    listen(s, c);
    recomputeStatics(s);
    ev.push({ type: "transformed", id: c.id, face: to });
    emit(s, { type: "transforms", obj: c, side: sideOf(s, c) }, ev);
  }

  // CR 702.168d / 708.8: turn a face-down permanent face up. It's the same object (counters, damage, tapped, attacking,
  // effects and summoning sickness stay); its characteristics become the card's. It didn't enter the battlefield, so
  // nothing that cares about entering applies. CR 708.11: "As this is turned face up, …" (asFaceUp) applies while it
  // turns. Then "when this is turned face up" abilities trigger (on the face-up permanent).
  function turnFaceUp(s, c, ev, x) {
    if (!c || !c.faceDown) return;
    const keep = Object.fromEntries(FACE_DOWN_KEEP.filter((k) => k in c).map((k) => [k, c[k]]));
    const real = compile(clone(c.hidden));
    Object.keys(c).forEach((k) => delete c[k]);
    Object.assign(c, real, keep);
    const up = c.asFaceUp;
    if (up && up.counters) {
      Object.entries(up.counters).forEach(([k, n]) => {
        const x = n === "others" ? s[sideOf(s, c)].battlefield.filter((o) => o !== c && isCreature(o)).length : n;
        if (x) c.counters = { ...(c.counters || {}), [k]: ((c.counters || {})[k] || 0) + x };
      });
    }
    if (x != null) c.xPaid = x;                                  // (a disguise cost with X: "exile up to X …")
    listen(s, c);
    changed(s);
    ev.push({ type: "turnedFaceUp", id: c.id });
    emit(s, { type: "turnedFaceUp", obj: c, side: sideOf(s, c) }, ev);
  }

  // CR 709.5c-i: a Room door gets its unlocked designation: "when you unlock this door" triggers (also as the Room
  // enters with the cast door unlocked, 709.5h), and with both doors unlocked now, "fully unlock" triggers (709.5i)
  function unlockDoor(s, c, door, ev) {
    if (!c || !c.unlocked || c.unlocked[door]) return;
    c.unlocked = c.unlocked.map((u, i) => u || i === door);
    changed(s);
    ev.push({ type: "unlocked", id: c.id, door });
    emit(s, { type: "unlock", obj: c, side: sideOf(s, c), door }, ev);
    if (c.unlocked.every(Boolean)) emit(s, { type: "fullyUnlocked", obj: c, side: sideOf(s, c) }, ev);
  }

  // CR 701.62a / 701.40a: manifest dread — look at the top two cards of your library, put one onto the battlefield face
  // down as a 2/2 (manifested) and the other into your graveyard. (Cards below the known ones are unknown: one of those
  // can still be manifested — a 2/2 that can't be turned face up — or put into the graveyard, as one more card there.)
  function manifestDread(s, side, ev) {
    const z = s[side], two = [];
    for (let i = 0; i < 2; i++) {
      const c = z.library.shift() || (!(z.libraryCount > 0) ? z.libraryBottom.shift() : null);
      if (c) two.push(c);
      else if (z.libraryCount > 0) { z.libraryCount--; two.push({ id: `unknown-${s.nextId++}`, name: "Unknown card", type: "Card", unknown: true }); }
    }
    if (!two.length) return;
    const pick = choose(s, "Manifest dread: which card goes onto the battlefield face down?", two.map((c) => c.name), side, two.map((c) => c.id));
    const perm = faceDownOf({ ...two[pick], owner: side }, { manifest: true });
    perm.sick = true;
    two.filter((_, i) => i !== pick).forEach((c) => putCard(s, c, side, "graveyard"));
    ev.push({ type: "manifested", id: perm.id });
    enter(s, perm, { side }, ev);
  }

  // Targets on the stack pointing at an object that left become "gone" (a new object with the same card id isn't it)
  function forgetTarget(s, id) {
    const swap = (t) => (Array.isArray(t) ? t.map(swap) : t === id ? `${id}@gone` : t);
    s.stack.forEach((x) => {
      if (x.kind === "trigger") { if (x.target != null) x.target = swap(x.target); }
      else if (x.a && x.a.target != null) x.a = { ...x.a, target: swap(x.a.target) };
    });
  }

  // CR 701.26a: tap a permanent (only an untapped one can be); "becomes tapped" triggers then (CR 603.2e — not for
  // a permanent that enters tapped)
  function tap(s, c, ev) {
    if (!c || c.tapped) return;
    c.tapped = true;
    emit(s, { type: "becomesTapped", obj: c, side: sideOf(s, c), batch: s.evBatch || 0 }, ev);
  }
  // CR 701.26b: untap it — CR 122.1d: with a stun counter on it, remove one instead
  function untap(s, c, ev) {
    if (!c || !c.tapped) return;
    const stun = (c.counters && c.counters.stun) || 0;
    if (stun > 0) { c.counters = { ...c.counters, stun: stun - 1 }; ev.push({ type: "stunned", id: c.id }); return; }
    c.tapped = false;
    emit(s, { type: "becomesUntapped", obj: c, side: sideOf(s, c) }, ev);
  }

  // A card arriving in a zone of its owner's. "Shuffle it into its library": libraries are unknown in puzzles
  // (rule: irrelevant unless stipulated), so it becomes one more unknown card there.
  // "Whenever one or more creatures you control and/or creature cards in your graveyard are put into exile" (Kaya): the cards
  function noteExiled(s, cards, from, ev) {
    if (cards.some(Boolean)) emit(s, { type: "cardsExiled", side: "player", batch: s.evBatch || 0 }, ev);
    const ids = cards.filter((c) => c && isCreature(faceOf(c, {}))).map((c) => c.id);
    if (ids.length && (from === "yours" || from === "yourGy")) emit(s, { type: "creaturesExiled", side: "player", ids, batch: s.evBatch || 0 }, ev);
  }
  function putCard(s, card, ownerSide, zone) {
    const owner = s[ownerSide];
    if (zone === "exile") card.inExile = true; else delete card.inExile;   // (for "entered from exile")
    if (zone === "graveyard") card.toGyThisTurn = true;                    // (Reenact the Crime: "put there from anywhere this turn")
    card.owner = ownerSide;
    if (zone === "library") { owner.libraryCount = (owner.libraryCount || 0) + 1; return; }
    if (zone === "hand" && ownerSide === "opponent") owner.handCount = (owner.handCount || 0) + 1;
    // CR 700.11: a player "descended" when a permanent card is put into their graveyard from anywhere
    if (zone === "graveyard" && isPermanent(card)) owner.descended = (owner.descended || 0) + 1;
    owner[zone].push(card);
  }

  /* ---------- replacement effects (CR 614, 616) ---------- */
  // A replacement effect is data on a permanent (or on the card itself, for "if this would …"):
  //   replacements: [{ to: "graveyard", instead: "exile" | "library", self, cardsOnly, owner: "opponent" }]
  //   to: the zone it would be put into; self: only this card, and it works from any zone ("from anywhere");
  //   cardsOnly: a card, not a token; owner: whose graveyard, seen from the effect's controller.
  // CR 616.1: if more than one applies, the affected object's controller (or owner) chooses one; it's applied, and
  // the rest are checked again (616.1f); each applies once (614.5).
  function replaceMove(s, card, from, to, side) {
    if (!s.replaces) return to;                              // (nothing in this puzzle replaces zone changes)
    const chooser = from === "battlefield" ? side : card.owner || side;
    const applied = new Set();
    for (;;) {
      const options = replacementsFor(s, card, to, side, from).filter((r) => !applied.has(r.key));
      if (!options.length) return to;
      const pick = choose(s, `${card.name}: which effect applies?`, options.map((r) => `${r.name}: ${r.instead} instead`), chooser);
      applied.add(options[pick].key);
      to = options[pick].instead;
      if (options[pick].mark) card.exiledBy = options[pick].mark;
    }
  }
  function replacementsFor(s, card, to, side, from) {
    const out = [];
    const consider = (src, srcSide, r, i) => {
      if (r.to !== to) return;
      if (r.self && src.id !== card.id) return;
      if (r.cardsOnly && card.token) return;
      if (r.owner && ((card.owner || side) === srcSide ? "you" : "opponent") !== r.owner) return;
      // ("If a creature an opponent controls would die, exile it instead": creature, controller, from the battlefield)
      if (r.creature && !isCreature(card)) return;
      if (r.controller && (side === srcSide ? "you" : "opponent") !== r.controller) return;
      if (r.fromBattlefield && from !== "battlefield") return;
      out.push({ key: `${src.id}#${i}`, name: src.name, instead: r.instead, ...(r.mark ? { mark: src.id } : {}) });
    };
    battlefieldNow(s).forEach(({ card: p, side: ps }) => (p.replacements || []).forEach((r, i) => { if (!r.self) consider(p, ps, r, i); }));
    if (s.cellarTurn) consider({ id: "forgotten-cellar", name: "Forgotten Cellar" }, "player", { to: "graveyard", instead: "exile", owner: "you" }, 0);
    (card.replacements || []).forEach((r, i) => { if (r.self) consider(card, side, r, i); });   // "if this would …, from anywhere"
    return out;
  }

  // CR 616.1: a choice made in the middle of an event. apply() is pure, so the game stops, asks (a "choice" waits
  // in s.pending), and replays the same action from the same state with the answer; a.choices holds the answers in
  // the order the questions come up. The opponent's choices: the one that leaves you no way to win (puzzle policy).
  class NeedChoice { constructor(q) { this.q = q; } }
  const CHOICES = [];
  // (about: what the question is about, so the game can show the cards — one card id for the whole question, a
  // list with a card id (or null) for each answer, or { all: [ids] }: several cards for the whole question)
  function choose(s, name, labels, chooser, about) {
    const ctx = CHOICES[CHOICES.length - 1];
    if (!ctx || labels.length < 2) return 0;
    const k = ctx.i++;
    if (ctx.list[k] != null) return ctx.list[k];
    if (chooser === "player") throw new NeedChoice({ name, labels, k, about });
    const canWin = makeSearch();
    for (let j = 0; j < labels.length; j++) {
      const answers = [...ctx.list]; answers[k] = j;
      if (!canWin(apply(ctx.s0, { ...ctx.a, choices: answers }).state)) return j;
    }
    return 0;
  }

  /* ---------- continuous effects and layers (CR 611, 613) ---------- */
  // Every permanent's characteristics are recomputed from what's printed, never kept on the object: the
  // continuous effects that apply to it are collected, then applied layer by layer, each layer in timestamp order.
  //   From resolved spells and abilities ("until end of turn"): s.effects entries { ts, id, objTs, pump | grant |
  //     setBase | loseAll }. The set of objects is fixed when the effect starts (CR 611.2c); objTs ties it to that
  //     object, so a card that left and came back is a new object the effect doesn't touch (CR 400.7).
  //   From static abilities (Auras, Equipment, anthems, "for each other Goblin"): the source's timestamp (CR 613.7a;
  //     an Aura or Equipment gets a new one when it attaches, 613.7e). An object that lost its abilities has none.
  // Layers used: 4 (type: a crewed Vehicle becomes a creature), 5 (color: "is the chosen color"), 6 (abilities: add,
  // remove), 7a (characteristic-defining power: vivid), 7b (set base power and toughness), 7c (modify: +N/+N, and
  // counters, read live in pt()). Copy effects (layer 1) are applied as the object is made; control changes (layer 2)
  // move the card. Dependencies (CR 613.8) aren't modeled.
  // (c.st is derived from the state, so it's a hidden property: copying a state or using it as the solver's cache key
  // skips it, and it's rebuilt right after each copy — see cloneState)
  const setSt = (c, st) => Object.defineProperty(c, "st", { value: st, enumerable: false, writable: true, configurable: true });
  const cloneState = (s) => { const n = clone(s); recomputeStatics(n); return n; };
  // (speed: the layers only change when a permanent enters, leaves, changes control or attaches, or an effect starts;
  // those mark the state, outside it, and state-based checks only rebuild the layers then)
  const CHANGED = new WeakSet();
  const changed = (s) => CHANGED.add(s);
  // (statics that read counters or poison — perCounter, conditional — can change without a board change: then also
  // when the poison counters or the counters on permanents differ from the last rebuild)
  const LAST = new WeakMap();
  const dynamicKey = (s) => `${s.player.life}|${s.combat ? s.combat.attackers.join() : ""}|${s.player.poison || 0}|${s.opponent.poison || 0}|${s.player.speed || 0}|${s.gainedLife ? 1 : 0}|${s.player.enduringStory ? 1 : 0}|${s.oppNoncombat ? 1 : 0}|${s.celebration || 0}|${s.player.graveyard.length}|${s.opponent.graveyard.length}|${s.player.hand.length}|${JSON.stringify(s.drawn || 0)}|${s.crimes || 0}|` +
    [...s.player.battlefield, ...s.opponent.battlefield].map((c) => (c.counters ? c.id + JSON.stringify(c.counters) : "")).join();
  const refresh = (s) => { if (CHANGED.has(s) || (s.dynamicStatics && LAST.get(s) !== dynamicKey(s))) recomputeStatics(s); };
  function recomputeStatics(s) {
    CHANGED.delete(s);
    if (s.dynamicStatics) LAST.set(s, dynamicKey(s));
    const all = battlefieldNow(s);
    const byId = new Map();                                      // (the effects on each object, looked up once)
    (s.effects || []).forEach((e) => { if (!byId.has(e.id)) byId.set(e.id, []); byId.get(e.id).push(e); });
    const effectsOn = (c) => byId.get(c.id) || [];
    // (only permanents with static abilities can give effects to others)
    const sources = all.filter(({ card: p }) => p.static || p.perOther || p.perCounter || p.perHandCard || p.conditional || p.minusLife ||
      (p.attachedTo && ((p.aura && (p.aura.static || p.aura.setsColor)) || (p.equip && (p.equip.static || ((p.counters || {}).hone || 0) > 0)))))
      // CR 114.4: an emblem's static abilities work from the command zone ("Creatures you control get +2/+2")
      .concat(["player", "opponent"].flatMap((side) => (s[side].command || []).filter((e) => e.static).map((card) => ({ card, side }))));
    const staticFrom = (src, srcSide, target) => {                // the static effects src gives target
      const out = [];
      const attached = src.aura || src.equip;
      if (attached && attached.static && src.attachedTo === target.id) {
        const ppc = attached.static.pumpPerOwnCounter;   // ("Equipped creature gets +X/+0, where X is the number of rev counters on this Equipment")
        const ppa = attached.static.pumpPerArtifact ? s[srcSide].battlefield.filter(isArtifact).length : 0;   // ("+1/+0 for each artifact you control")
        out.push({ ts: src.ts, ...attached.static, ...(ppc ? { pump: [ppc.pump[0] * ((src.counters || {})[ppc.kind] || 0), ppc.pump[1] * ((src.counters || {})[ppc.kind] || 0)] } : {}), ...(attached.static.pumpPerArtifact ? { pump: Array.isArray(attached.static.pumpPerArtifact) ? attached.static.pumpPerArtifact.map((k) => k * ppa) : [ppa, 0] } : {}),
          ...(attached.static.pumpPerAttachedTo ? { pump: ((n) => [attached.static.pumpPerAttachedTo[0] * n, attached.static.pumpPerAttachedTo[1] * n])(all.filter(({ card: x }) => (x.aura || x.equip) && x.attachedTo === target.id).length) } : {}),
          ...(attached.static.baseLife ? { setBase: Array(2).fill(Math.max(0, s[srcSide].life ?? 20)) } : {}) });   // (Aettir and Priwen: "base power and toughness X/X, where X is your life total")
      }
      // hone counters: "Each hone counter on an Equipment grants +1/+0 to equipped creature."
      if (src.equip && src.attachedTo === target.id && ((src.counters || {}).hone || 0) > 0) out.push({ ts: src.ts, pump: [src.counters.hone, 0] });
      // layer 5: "Enchanted land is the chosen color" (Shimmerwilds Growth)
      if (src.aura && src.aura.setsColor && src.chosenColor && src.attachedTo === target.id) out.push({ ts: src.ts, setColor: [src.chosenColor] });
      // (static.if: only while a condition holds — a Case's "Solved — Creatures you control get +1/+0", CR 719.3c)
      if (src.static && src.static.team && isCreature(target) && sideOf(s, target) === srcSide && (!src.static.chosenType || hasType(target, src.chosenType)) &&
        (!src.static.if || conditionHolds(s, src.static.if, srcSide, src)) &&
        matches(s, target, src.static.filter, srcSide) && !(src.static.other && target === src)) {
        // ("+1/+0 for each Aura and Equipment attached to Kellan": pumpPerAttached)
        const ppa = src.static.team.pumpPerAttached;
        if (ppa) { const n = all.filter(({ card: x }) => (x.aura || x.equip) && x.attachedTo === src.id).length; if (n) out.push({ ts: src.ts, pump: [ppa[0] * n, ppa[1] * n] }); }
        else out.push({ ts: src.ts, ...src.static.team, ...(src.static.team.pumpPerSpeed ? { pump: [speedOf(s, srcSide), 0] } : {}), ...(src.static.team.pumpPerEntered ? { pump: [s.creaturesEnteredYours || 0, s.creaturesEnteredYours || 0] } : {}), ...(src.static.team.setBaseCount ? { setBase: Array(2).fill(s[srcSide].battlefield.filter((x) => /creature/i.test((x.st && x.st.type) || x.type || "")).length) } : {}) });
      }
      // "Creatures your opponents control get -1/-1." (static.oppTeam)
      if (src.static && src.static.oppTeam && isCreature(target) && sideOf(s, target) !== srcSide) out.push({ ts: src.ts, ...src.static.oppTeam });
      // Maha: "Creatures your opponents control have base toughness 1" (layer 7b, toughness only)
      if (src.static && src.static.oppBaseToughness != null && isCreature(target) && sideOf(s, target) !== srcSide) out.push({ ts: src.ts, setBaseT: src.static.oppBaseToughness });
      // "Artifacts you control have '{2}, Sacrifice this artifact: …'" (static.artifactsGain: activated abilities, layer 6)
      if (src.static && src.static.artifactsGain && isArtifact(target) && sideOf(s, target) === srcSide) out.push({ ts: src.ts, addAbilities: src.static.artifactsGain });
      // "Lands you control have '{T}: Add two mana of any one color. …'" (static.landsGain)
      if (src.static && src.static.landsGain && isLand(target) && sideOf(s, target) === srcSide) out.push({ ts: src.ts, addAbilities: src.static.landsGain });
      // "Planeswalkers you control have '[−2]: …'" (static.walkers: the loyalty abilities they gain, layer 6)
      if (src.static && src.static.walkers && isPlaneswalker(target) && sideOf(s, target) === srcSide) out.push({ ts: src.ts, addAbilities: src.static.walkers });
      if (src.perOther && src === target) {                    // "gets +2/+0 for each other Goblin you control"
        // ("+1/+0 for each other creature you control": perOther.creature)
        const n = s[srcSide].battlefield.filter((x) => x !== src && (src.perOther.creature ? isCreature(x) : src.perOther.artifact ? isArtifact(x) : hasType(x, src.perOther.type))).length;
        if (n) out.push({ ts: src.ts, pump: [src.perOther.pump[0] * n, src.perOther.pump[1] * n] });
      }
      // "This creature gets -1/-1 for each card in your hand" (perHandCard)
      if (src.perHandCard && src === target) { const n = srcSide === "player" ? s.player.hand.length : s.opponent.handCount || 0; if (n) out.push({ ts: src.ts, pump: [src.perHandCard[0] * n, src.perHandCard[1] * n] }); }
      // "gets +1/+1 for each oil counter on it" (perCounter)
      if (src.perCounter && src === target) {
        const n = (src.counters || {})[src.perCounter.kind] || 0;
        if (n) out.push({ ts: src.ts, pump: [src.perCounter.pump[0] * n, src.perCounter.pump[1] * n] });
      }
      if (src.minusLife && src.id === target.id && srcSide === "player") { const x = Math.max(0, s.player.life ?? 0); out.push({ ts: src.ts, pump: [-x, -x] }); }
      // static abilities that apply only while a condition holds: "Corrupted — as long as an opponent has three or more
      // poison counters, this creature has double strike" (conditional: [{ if, pump, grant }]); on an Aura or
      // Equipment they apply to what it's attached to
      const holder = src.conditional && (src.aura || src.equip) ? src.attachedTo : src.id;
      (src.conditional || []).forEach((cnd) => {
        if (holder === target.id && conditionHolds(s, cnd.if || {}, srcSide, src)) out.push({ ts: src.ts, ...(cnd.pump ? { pump: cnd.pump } : {}), ...(cnd.grant ? { grant: cnd.grant } : {}), ...(cnd.setBase ? { setBase: cnd.setBase } : {}), ...(cnd.abilities ? { addAbilities: cnd.abilities } : {}) });
      });
      return out;
    };
    // layer 6 first (whether an object has its abilities decides which static abilities exist at all)
    const byTs = (x, y) => (x.ts || 0) - (y.ts || 0);
    all.forEach(({ card: c }) => { delete c.st; });
    // layer 4 before anything reads types: "becomes an artifact creature until end of turn" (crew, CR 702.122a)
    // adds the creature type (so an anthem for creatures applies to a crewed Vehicle)
    const typeOf = new Map();
    for (const { card: c } of all) {
      if (!(effectsOn(c).some((e) => e.becomeCreature) || stationed(c)) || /creature/i.test(c.type)) continue;
      typeOf.set(c, c.type.replace(/^([^—]*?)\s*(—|$)/, (m, t, dash) => `${t} Creature${dash ? " —" : ""}`));
      setSt(c, { kw: ownKw(c), base: basePT(c), mod: [0, 0], lost: false, type: typeOf.get(c) });
    }
    for (const { card: c } of all) {
      const set = effectsOn(c).filter((e) => e.setType).pop();
      if (!set) continue;
      typeOf.set(c, set.setType);
      setSt(c, { kw: ownKw(c), base: basePT(c), mod: [0, 0], lost: false, type: typeOf.get(c) });
    }
    if (s.player.battlefield.some((c) => c.jasperFlint && !(c.st && c.st.lost))) for (const { card: c, side } of all) {
      if (side !== "player" || c.owner !== "opponent" || !isCreature(c) || hasType(c, "Mercenary")) continue;
      typeOf.set(c, addTypes(typeOf.get(c) || c.type, { subtypes: ["Mercenary"] })); setSt(c, { kw: ownKw(c), base: basePT(c), mod: [0, 0], lost: false, type: typeOf.get(c) });
    }
    for (const { card: c } of all) {
      if (!(isLand(c) && ((c.counters || {}).flood || 0) > 0 && s[sideOf(s, c) || "player"].battlefield.some((x) => x.eluge && !(x.st && x.st.lost)))) continue;
      typeOf.set(c, addTypes(typeOf.get(c) || c.type, { subtypes: ["Island"] })); setSt(c, { kw: ownKw(c), base: basePT(c), mod: [0, 0], lost: false, type: typeOf.get(c) });
    }
    for (const { card: c, side } of all) {
      if (!isArtifact(c) || !s[side].battlefield.some((x) => x.ragost && !(x.st && x.st.lost)) || hasType(c, "Food")) continue;
      typeOf.set(c, addTypes(typeOf.get(c) || c.type, { subtypes: ["Food"] })); setSt(c, { kw: ownKw(c), base: basePT(c), mod: [0, 0], lost: false, type: typeOf.get(c) });
    }
    // "Equipped creature is a Wizard in addition to its other types" (an Equipment's static.addSubtype)
    for (const { card: e } of all) {
      const st0 = e.attachedTo && ((e.equip && e.equip.static) || (e.aura && e.aura.static));
      const c = st0 && st0.addSubtype && (all.find(({ card: x }) => x.id === e.attachedTo) || {}).card;
      if (!c) continue;
      typeOf.set(c, addTypes(typeOf.get(c) || c.type, { subtypes: [st0.addSubtype] })); setSt(c, { kw: ownKw(c), base: basePT(c), mod: [0, 0], lost: false, type: typeOf.get(c) });
    }
    // Ygra, Eater of All: "Other creatures are Food artifacts in addition to their other types and have '{2}, {T}, Sacrifice this permanent: You gain 3 life.'"
    const ygra = all.find(({ card: x }) => x.ygra && !(x.st && x.st.lost));
    if (ygra) for (const { card: c } of all) {
      if (c === ygra.card || !/creature/i.test(typeOf.get(c) || c.type || "")) continue;
      typeOf.set(c, addTypes(typeOf.get(c) || c.type, { types: ["Artifact"], subtypes: ["Food"] })); setSt(c, { kw: ownKw(c), base: basePT(c), mod: [0, 0], lost: false, type: typeOf.get(c) });
    }
    for (const { card: c } of all) {
      if (!c.kaitoBane || ((c.counters || {}).loyalty || 0) < 1) continue;
      typeOf.set(c, "Legendary Planeswalker Creature — Kaito Ninja"); setSt(c, { kw: ownKw(c), base: basePT(c), mod: [0, 0], lost: false, type: typeOf.get(c) });
    }
    for (const { card: le, side: ls } of all) {
      if (!le.lifecraft || !le.chosenType || (le.st && le.st.lost)) continue;
      for (const { card: c, side } of all) if (side === ls && /creature/i.test(typeOf.get(c) || c.type || "") && /\bVehicle\b/.test(typeOf.get(c) || c.type || "")) { typeOf.set(c, addTypes(typeOf.get(c) || c.type, { subtypes: [le.chosenType] })); setSt(c, { kw: ownKw(c), base: basePT(c), mod: [0, 0], lost: false, type: typeOf.get(c) }); }
    }
    // Leyline of Transformation: "Creatures you control are the chosen type in addition to their other types."
    for (const { card: lt, side: ls } of all) {
      if (!lt.leylineTransformation || !lt.chosenType || (lt.st && lt.st.lost)) continue;
      for (const { card: c, side } of all) if (side === ls && /creature/i.test(typeOf.get(c) || c.type || "") && !subtypes({ type: typeOf.get(c) || c.type }).includes(lt.chosenType)) {
        typeOf.set(c, addTypes(typeOf.get(c) || c.type, { subtypes: [lt.chosenType] })); setSt(c, { kw: ownKw(c), base: basePT(c), mod: [0, 0], lost: false, type: typeOf.get(c) });
      }
    }
    // Goddric, Cloaked Reveler: "As long as two or more nonland permanents entered the battlefield under your control this turn,
    // Goddric is a Dragon … (He loses all other creature types.)" (layer 4)
    for (const { card: c, side } of all) {
      if (!c.goddric || !conditionHolds(s, { celebration: true }, side, c)) continue;
      typeOf.set(c, c.type.replace(/—.*$/, "— Dragon"));
      setSt(c, { kw: ownKw(c), base: basePT(c), mod: [0, 0], lost: false, type: typeOf.get(c) });
    }
    // (impending: "isn't a creature" while it has a time counter on it, CR 702.176a)
    for (const { card: c } of all) {
      if (!(c.impending && ((c.counters && c.counters.time) || 0) > 0)) continue;
      typeOf.set(c, c.type.replace(/\s*\bCreature\b/, "").replace(/^\s+/, ""));
      setSt(c, { kw: ownKw(c), base: basePT(c), mod: [0, 0], lost: false, type: typeOf.get(c) });
    }
    const typed = (c) => (typeOf.has(c) ? { type: typeOf.get(c) } : {});
    const layer6 = (c, effects) => {
      let kw = [...ownKw(c)], lost = false, abilities = [], gained = [];
      effects.filter((e) => e.grant || e.loseAll || e.addAbilities || e.addTriggers).sort(byTs).forEach((e) => {
        if (e.loseAll) { kw = []; abilities = []; gained = []; lost = true; }   // CR 613.1f: removes abilities (from earlier effects too)
        if (e.addTriggers) gained.push(...e.addTriggers);        // (gained triggered abilities: trigger definition ids)
        if (e.grant) kw.push(...e.grant);
        if (e.loseKw) kw = kw.filter((k) => k !== e.loseKw);
        if (e.addAbilities) abilities.push(...e.addAbilities);   // (gained activated abilities)
      });
      // a keyword counter put on after the object lost its abilities still gives its ability (its own timestamp, CR 613.7)
      if (lost) { const lastLose = Math.max(...effects.filter((e) => e.loseAll).map((e) => e.ts || 0)); kw.push(...counterKw(c).filter((k) => ((c.kwTs || {})[k] || 0) > lastLose && !kw.includes(k))); }
      return { kw, lost, abilities, gained };
    };
    // pass 1: abilities lost or not, from resolved effects and from statics of objects that still have abilities
    // (an "loses all abilities" Aura is a static ability: its source must still have its own abilities)
    // (repeated until it settles: a static ability can take away another object's abilities, and with them its statics)
    let own = new Map();
    const effectsFor = (c) => [...sources.filter(({ card: src }) => !own.get(src)).flatMap(({ card: src, side }) => staticFrom(src, side, c)), ...effectsOn(c)];
    // (only puzzles with "loses all abilities" effects need this: elsewhere nothing ever loses its abilities)
    if (s.tsMatters) own = new Map(all.map(({ card: c }) => [c, layer6(c, effectsOn(c)).lost]));
    for (let round = 0; s.tsMatters && round < 4; round++) {
      const next = new Map(all.map(({ card: c }) => [c, layer6(c, effectsFor(c)).lost]));
      const same = all.every(({ card: c }) => next.get(c) === own.get(c));
      own = next;
      if (same) break;
    }
    // layer 5 for everything first (a vivid count in layer 7a reads the colors of the other permanents)
    const colorOf = new Map();
    const colorSetters = sources.some(({ card: p }) => p.aura && p.aura.setsColor);   // (only then: speed)
    for (const { card: c } of colorSetters ? all : []) {
      const set = (sources.length ? effectsFor(c) : effectsOn(c)).filter((e) => e.setColor).sort(byTs).pop();
      setSt(c, { kw: ownKw(c), base: basePT(c), mod: [0, 0], lost: false, ...(set ? { colors: set.setColor } : {}), ...typed(c) });
      if (set) colorOf.set(c, set.setColor);
    }
    for (const { card: c } of all) {
      const effects = sources.length ? effectsFor(c) : effectsOn(c);
      const colors = colorOf.has(c) ? { colors: colorOf.get(c) } : {};
      if (!effects.length) {                                     // (nothing applies to it: as printed)
        const base = basePT(c);
        setSt(c, { kw: ownKw(c), base: c.ptCount ? cdaPT(s, c) : c.vividPower ? [vividCount(s, sideOf(s, c)), base[1]] : base, mod: [0, 0], lost: false, ...colors, ...typed(c) });
        continue;
      }
      const { kw, lost, abilities, gained } = layer6(c, effects);
      // layer 7a: a characteristic-defining ability (vivid: power = colors among your permanents) — gone if lost
      let base = basePT(c);
      if (c.vividPower && !lost) base = [vividCount(s, sideOf(s, c)), base[1]];
      if (c.ptCount && !lost) base = cdaPT(s, c);                // ("power and toughness are each equal to the number of …")
      // layer 7b: "has base power and toughness 1/1", in timestamp order (the latest wins)
      effects.filter((e) => e.setBase || e.setBaseT != null).sort(byTs).forEach((e) => { base = e.setBase ? [...e.setBase] : [base[0], e.setBaseT]; });
      // layer 7c: modifications (+N/+N); the order inside a sublayer doesn't change a sum
      const mod = [0, 0];
      effects.filter((e) => e.pump).forEach((e) => { mod[0] += e.pump[0]; mod[1] += e.pump[1]; });
      setSt(c, { kw, base, mod, lost, ...(abilities.length ? { abilities } : {}), ...(gained.length ? { gained } : {}), ...colors, ...typed(c) });
    }
    // Drana and Linvala: "has all activated abilities of all creatures your opponents control. You may spend mana as
    // though it were mana of any color to activate those abilities." (their colored mana symbols: payable with any mana)
    for (const { card: c, side } of all) {
      if (!c.dranaLinvala || (c.st && c.st.lost)) continue;
      const theirs = s[side === "player" ? "opponent" : "player"].battlefield.filter(isCreature).flatMap((x) => (x.st && x.st.lost) ? [] : [...(x.abilities || []), ...((x.st && x.st.abilities) || [])]);
      if (theirs.length) c.st.abilities = [...(c.st.abilities || []), ...theirs.map(anyColorAbility)];
    }
    for (const { card: c, side } of all) {
      if (!c.marvin || !c.st || c.st.lost) continue;
      const abs = s[side].battlefield.filter((x) => x !== c && isCreature(x) && x.name !== c.name && !(x.st && x.st.lost)).flatMap((x) => x.abilities || []);
      if (abs.length) c.st.abilities = [...(c.st.abilities || []), ...abs];
    }
    // Locus of Enlightenment: "has each activated ability of the exiled cards used to craft it. You may activate each of
    // those abilities only once each turn."
    for (const { card: c, side } of all) {
      if (!c.locus || (c.st && c.st.lost) || !c.st) continue;
      const abs = (c.craftedWith || []).map((id) => s[side].exile.find((x) => x.id === id)).filter(Boolean).flatMap((x) => faceOf(x, {}).abilities || []);
      if (abs.length) c.st.abilities = [...(c.st.abilities || []), ...abs.map(onceEach)];
    }
    // Etrata, Deadly Fugitive: "Face-down creatures you control have '{2}{U}{B}: Turn this creature face up. …'"
    // Leyline of the Guildpact: "Each nonland permanent you control is all colors."
    for (const side of ["player", "opponent"]) {
      const z = s[side];
      if (z.battlefield.some((c) => c.etrata && !(c.st && c.st.lost))) z.battlefield.filter((c) => c.faceDown && c.st).forEach((c) => { c.st.etrata = true; });
      if (z.battlefield.some((c) => c.leylineGuildpact && !(c.st && c.st.lost))) z.battlefield.filter((c) => !isLand(c) && c.st).forEach((c) => { c.st.colors = ["W", "U", "B", "R", "G"]; });
    }
    // Ygra: the Food ability other creatures have
    if (all.some(({ card: x }) => x.ygra && !(x.st && x.st.lost))) for (const { card: c } of all) if (!c.ygra && c.st && !c.st.lost && /\bFood\b/.test(c.st.type || "")) c.st.abilities = [...(c.st.abilities || []), YGRA_FOOD];
    // Agatha's Soul Cauldron: "Creatures you control with +1/+1 counters on them have all activated abilities of all creature
    // cards exiled with Agatha's Soul Cauldron."
    for (const { card: c, side } of all) {
      if (!c.soulCauldron || (c.st && c.st.lost)) continue;
      const abs = ["player", "opponent"].flatMap((sd) => s[sd].exile.filter((x) => x.exiledBy === c.id && isCreature(faceOf(x, {})))).flatMap((x) => faceOf(x, {}).abilities || []);
      if (abs.length) s[side].battlefield.filter((x) => isCreature(x) && ((x.counters || {})["+1/+1"] || 0) > 0 && x.st && !x.st.lost).forEach((x) => { x.st.abilities = [...(x.st.abilities || []), ...abs]; });
    }
  }
  const ONCE_EACH = new WeakMap();
  const onceEach = (ab) => { if (!ONCE_EACH.has(ab)) ONCE_EACH.set(ab, { ...ab, oncePerTurn: true }); return ONCE_EACH.get(ab); };
  const anyColorCost = (cost) => cost.replace(/\{(?:[WUBRG](?:\/[WUBRG])?|2\/[WUBRG])\}/g, "{1}");
  const YGRA_FOOD = { cost: "{2}", tap: true, sacSelf: true, effect: { gainLife: 3 }, text: "{2}, {T}, Sacrifice this permanent: You gain 3 life" };
  const ANY_COLOR = new WeakMap();
  const anyColorAbility = (ab) => { if (!ANY_COLOR.has(ab)) ANY_COLOR.set(ab, { ...ab, ...(ab.cost ? { cost: anyColorCost(ab.cost) } : {}) }); return ANY_COLOR.get(ab); };

  // A resolved spell's or ability's effect on an object until end of turn (CR 611.2): kept in s.effects.
  // Speed: timestamps only matter between effects whose order changes the result — losing abilities (layer 6) and
  // setting base power/toughness (7b) — so they're only kept when the puzzle has those (s.tsMatters); +N/+N effects
  // just add up (their order never matters), so one total per object is kept. Same results, and positions reached
  // in different orders stay identical for the solver's cache.
  function addEffect(s, c, e) {
    s.effects = s.effects || [];
    if (!s.tsMatters && (e.pump || e.grant)) {
      // (order can't matter: one entry per object, keywords sorted, entries sorted — so the same position reached
      // in another order is the same state)
      let x = s.effects.find((y) => y.id === c.id);
      if (!x) { x = { id: c.id }; s.effects.push(x); s.effects.sort((a, b) => (a.id < b.id ? -1 : 1)); }
      if (e.pump) x.pump = [(x.pump ? x.pump[0] : 0) + e.pump[0], (x.pump ? x.pump[1] : 0) + e.pump[1]];
      if (e.grant) x.grant = [...(x.grant || []), ...e.grant].sort();
    } else {
      const sum = e.pump && s.effects.find((x) => x.id === c.id && x.pump && Object.keys(x).length === 2);
      if (sum) sum.pump = [sum.pump[0] + e.pump[0], sum.pump[1] + e.pump[1]];
      else s.effects.push({ id: c.id, ...(s.tsMatters && !e.pump ? { ts: stamp(s) } : {}), ...e });
    }
    recomputeStatics(s);
  }
  // the next timestamp (CR 613.7), when timestamps matter in this puzzle
  const stamp = (s) => (s.tsMatters ? (s.clock = (s.clock || 0) + 1) : undefined);

  // Vivid: the number of colors among permanents a player controls (lands and Treasures are colorless;
  // a hybrid card like {1}{R/W} is both of its colors)
  // a characteristic-defining power and toughness (CR 604.3): "the number of nonland permanents you control" (ptCount:
  // { filter } over your permanents) or "the number of creature cards in all graveyards" ({ graveyardCreatures })
  function cdaPT(s, c) {
    const side = s.opponent.battlefield.includes(c) ? "opponent" : c.owner === "opponent" && !s.player.battlefield.includes(c) ? "opponent" : "player";
    // ("Duelist of the Mind's power is equal to the number of cards you've drawn this turn": only its power)
    if (c.ptCount.drawn) return [((s.drawn || {})[side] || 0), basePT(c)[1]];
    if (c.ptCount.greatestArtifactMV) return [Math.max(0, ...s[side].battlefield.filter(isArtifact).map((x) => manaValue(x.cost))), basePT(c)[1]];
    // ("+X/+0, where X is the greatest mana value among other artifacts you control" on a 0/N: the same as a CDA)
    if (c.ptCount.greatestOtherArtifactMV) return [Math.max(0, ...s[side].battlefield.filter((x) => isArtifact(x) && x.id !== c.id).map((x) => manaValue(x.cost))), basePT(c)[1]];
    // Cosmogoyf: "the number of cards you own in exile and its toughness is equal to that number plus 1"
    if (c.ptCount.exileOwned) { const n = s[side].exile.length; return [n, n + 1]; }
    // Tarmogoyf: "the number of card types among cards in all graveyards" (toughness: that number plus 1)
    if (c.ptCount.goyf) { const n = new Set([...s.player.graveyard, ...s.opponent.graveyard].flatMap((x) => CARD_TYPES.filter((t) => new RegExp(`\\b${t}\\b`, "i").test((faceOf(x, {}).type || "").split("—")[0])))).size; return [n, n + 1]; }
    // Dark Matter Manipulator: "+2/+0 for every seven cards in your graveyard" (on a 1/2)
    if (c.ptCount.graveyardSevens) return [basePT(c)[0] + 2 * Math.floor(s[side].graveyard.length / 7), basePT(c)[1]];
    if (c.ptCount.descend) { const n = permanentCardsIn(s, side); return [n, n + 1]; }   // ("the number of permanent cards in your graveyard … that number plus 1")
    if (c.ptCount.xande) { const n = s[side].graveyard.filter((x) => !isCreature(faceOf(x, {})) && !isLand(faceOf(x, {}))).length; return [basePT(c)[0] + n, basePT(c)[1] + n]; }   // ("+1/+1 for each noncreature, nonland card in your graveyard")
    if (c.ptCount.powerOnly) return [s[side].battlefield.filter((x) => objectIs(x, c.ptCount.filter || {})).length, basePT(c)[1]];
    const n = c.ptCount.graveyardInstSorc ? c.ptCount.graveyardInstSorc * s[side].graveyard.filter((x) => typeHas(faceOf(x, {}), /instant|sorcery/i)).length : c.ptCount.graveyardCreatures ? [...s.player.graveyard, ...s.opponent.graveyard].filter((x) => isCreature(faceOf(x, {}))).length
      : s[side].battlefield.filter((x) => objectIs(x, c.ptCount.filter || {})).length;
    return [n, n];
  }
  const vividCount = (s, side) => new Set(s[side].battlefield.flatMap((c) => colorsOf(c))).size;

  // A card's power and toughness right now, in any zone: on the battlefield from the layers; elsewhere as printed,
  // except that a characteristic-defining ability ("*") works in every zone (CR 604.3) — vivid counts its
  // owner's permanents. (For showing cards; rules only read power on the battlefield.)
  function currentPT(s, c) {
    if (find(s, c.id) === c) return [power(c), toughness(c)];
    const base = basePT(c);
    const p = c.vividPower ? vividCount(s, c.owner === "opponent" ? "opponent" : "player") : base[0];
    return [p + counterPT(c), base[1] + counterPT(c)];
  }

  // State-based actions: +1/+1 and -1/-1 counters cancel out (704.5q); creatures with 0 or less
  // toughness die; creatures with lethal damage or deathtouch damage are destroyed (not if indestructible);
  // an Aura on nothing (or on a creature with protection from it) goes to the graveyard; Equipment
  // that isn't on a creature anymore stays, unattached
  // Abilities that give cards elsewhere a way to be cast: Amazing Spider-Man ("Each legendary spell you cast that's one
  // or more colors has web-slinging {G}{W}{U}") and Green Goblin ("Each nonland card in your graveyard has mayhem. The
  // mayhem cost is equal to its mana cost.") — kept on the cards while the source is there (marked, to take them away)
  // Soulless Jailer: "Permanent cards in graveyards can't enter the battlefield."
  const jailed = (s) => battlefieldNow(s).some(({ card: c }) => c.soullessJailer && !(c.st && c.st.lost));
  function grantedCosts(s) {
    const live = (k) => s.player.battlefield.some((c) => c[k] && !(c.st && c.st.lost));
    // Encroaching Mycosynth: "Nonland permanents you control are artifacts … permanent spells you control and nonland
    // permanent cards you own that aren't on the battlefield" (marked, so the type goes when the Mycosynth does)
    const myco = live("mycosynth");
    [...s.player.battlefield, ...s.player.hand, ...s.player.graveyard, ...s.player.exile, ...s.player.library, ...s.stack.filter((w) => w.kind === "spell").map((w) => w.card)].forEach((c) => {
      if (!c || c.unknown) return;
      if (c.mycoArtifact != null && !myco) { c.type = c.mycoArtifact; delete c.mycoArtifact; changed(s); }
      if (myco && c.mycoArtifact == null && isPermanent(c) && !isLand(c) && !isArtifact(c)) { c.mycoArtifact = c.type; c.type = addTypes(c.type, { types: ["Artifact"] }); changed(s); }
    });
    // Soulless Jailer: cards in graveyards are marked while one is out, so whatever way they'd enter, they can't
    if (jailed(s)) ["player", "opponent"].forEach((sd) => { s[sd].graveyard.forEach((c) => { c.gyMark = true; }); [...s[sd].hand, ...s[sd].exile, ...s[sd].library, ...s.stack.filter((w) => w.card).map((w) => w.card)].forEach((c) => delete c.gyMark); });
    // Mirran Safehouse: "it has all activated abilities of all land cards in all graveyards"
    s.player.battlefield.filter((c) => c.safehouse).forEach((c) => {
      c.safehouseAbilities = [...s.player.graveyard, ...s.opponent.graveyard].map((g) => faceOf(g, {})).filter(isLand).flatMap((g) => g.abilities || []);
    });
    const web = live("amazingWeb"), goblin = live("goblinFormula");
    s.player.hand.forEach((c) => {
      const f = faceOf(c, {});
      if (c.webGranted && !web) { delete c.webSlinging; delete c.webGranted; }
      if (web && !c.webSlinging && /\blegendary\b/i.test(f.type || "") && colorsOf(f).length) { c.webSlinging = "{G}{W}{U}"; c.webGranted = true; }
    });
    // ("You may play that card for as long as you control this creature")
    s.player.exile.forEach((c) => { if (c.playableWhile && !find(s, c.playableWhile)) { delete c.playable; delete c.playableWhile; } });
    s.player.graveyard.forEach((c) => {
      const f = faceOf(c, {});
      if (c.mayhemGranted && !goblin) { delete c.mayhem; delete c.mayhemGranted; }
      if (goblin && !c.mayhem && !isLand(f) && f.cost) { c.mayhem = f.cost; c.mayhemGranted = true; }
    });
  }
  function sba(s, ev) {
    // (Eriette: control lasts "for as long as that Aura is attached to it")
    s.player.battlefield.filter((c) => c.controlledByAura && !s.player.battlefield.concat(s.opponent.battlefield).some((a) => a.id === c.controlledByAura && a.attachedTo === c.id))
      .forEach((c) => { delete c.controlledByAura; s.player.battlefield = s.player.battlefield.filter((x) => x !== c); s.opponent.battlefield.push(c); changed(s); });
    // ("if a card was put into exile this turn": a card id new to an exile zone, or one more unknown card exiled)
    if (s.tracksExile) {
      const ids = [...s.player.exile, ...s.opponent.exile].map((c) => c.id), n = (s.player.exileUnknown || 0) + (s.opponent.exileUnknown || 0);
      if (ids.some((id) => !(s.exileSeen || []).includes(id)) || n > (s.exileUnknownSeen || 0)) s.exiledThisTurn = true;
      s.exileSeen = ids; s.exileUnknownSeen = n;
    }
    let again = true;
    while (again) {
      again = false;
      // CR 704.5aa / 702.179a: a player with no speed who controls a permanent with start your engines! gets speed 1
      ["player", "opponent"].forEach((side) => {
        if (s[side].speed == null && s[side].battlefield.some((c) => has(c, "start your engines!"))) { s[side].speed = 1; ev.push({ type: "speed", side, speed: 1 }); }
        // CR 702.195a: storied — controlling three or more artifacts, Sagas and/or legendary permanents gives you an enduring
        // story for the rest of the game (CR 702.195c: continuous effects are reapplied right away)
        const z = s[side];
        if (!z.enduringStory && z.battlefield.some((c) => has(c, "storied")) &&
          z.battlefield.filter((c) => isArtifact(c) || typeHas(c, /\bSaga\b/) || typeHas(c, /\blegendary\b/i)).length >= 3) {
          z.enduringStory = true; changed(s); ev.push({ type: "enduringStory", side });
        }
      });
      refresh(s);
      grantedCosts(s);
      // copy effects that last "for as long as this Equipment remains attached to it"
      for (const c of [...s.player.battlefield, ...s.opponent.battlefield]) if (c.copyUntil && c.copyUntil.attachedBy) { const e = find(s, c.copyUntil.attachedBy); if (!e || e.attachedTo !== c.id) { endCopy(s, c); again = true; } }
      // "Whenever a creature card leaves your graveyard": cards gone from a graveyard since the last check (each one an event)
      if (s.listens.includes("leftGraveyard")) ["player", "opponent"].forEach((side) => {
        const now = s[side].graveyard.map((c) => c.id), before = (s.gyIds || {})[side];
        if (before) before.filter((id) => !now.includes(id)).forEach((id) => {
          const card = [...s.player.battlefield, ...s.opponent.battlefield, ...s[side].hand, ...s[side].exile, ...s[side].library].find((c) => c.id === id);
          if (card) emit(s, { type: "leftGraveyard", side, obj: card }, ev);
        });
        s.gyIds = { ...(s.gyIds || {}), [side]: now };
      });
      for (const c of [...s.player.battlefield, ...s.opponent.battlefield]) {
        const k = c.counters;
        if (k && k["+1/+1"] > 0 && k["-1/-1"] > 0) {
          const n = Math.min(k["+1/+1"], k["-1/-1"]);
          k["+1/+1"] -= n; k["-1/-1"] -= n;
        }
        if (c.aura && c.attachedTo !== "opp" && c.attachedTo !== "you") {        // (an Aura on a player stays)
          const host = c.attachedTo && find(s, c.attachedTo);
          if (!host || protectedFrom(host, c)) { leave(s, c, "graveyard", ev); again = true; continue; }
        }
        if (c.equip && c.attachedTo) {
          const host = find(s, c.attachedTo);
          // (lastAttachedTo: Rhuk, Hexgold Nabber moves "all Equipment attached to that creature" after it died)
          if (!host || sideOf(s, host) !== sideOf(s, c) || protectedFrom(host, c)) { if (s.tracksEquipment) c.lastAttachedTo = c.attachedTo; delete c.attachedTo; changed(s); again = true; }
        }
      }
      // CR 704.5z / 303.7a: a permanent with more than one Role from the same player keeps only the newest
      for (const side of ["player", "opponent"]) {
        const roles = s[side].battlefield.filter((c) => c.attachedTo && /\bRole\b/.test(c.type || ""));
        const newest = {};
        roles.forEach((r) => { if (!newest[r.attachedTo] || r.roleSeq > newest[r.attachedTo].roleSeq) newest[r.attachedTo] = r; });
        roles.filter((r) => newest[r.attachedTo] !== r).forEach((r) => { leave(s, r, "graveyard", ev); again = true; });
      }
      // CR 704.5j: the legend rule — a player with two or more legendary permanents with the same name chooses one of
      // them, and the rest are put into their owners' graveyards (not sacrificed, not destroyed: indestructible doesn't help)
      for (const side of ["player", "opponent"]) {
        const byName = new Map();
        s[side].battlefield.filter((c) => typeHas(c, /\blegendary\b/i) && !c.faceDown && !(hasType(c, "Spider") && s[side].battlefield.some((x) => x.spiderVerse && !(x.st && x.st.lost)))).forEach((c) => byName.set(c.name, [...(byName.get(c.name) || []), c]));
        for (const group of byName.values()) {
          if (group.length < 2) continue;
          const keep = choose(s, `Legend rule: which ${group[0].name} stays?`, group.map((c, i) => `Keep ${c.name} #${i + 1}${c.tapped ? " (tapped)" : ""}`), side, group.map((c) => c.id));
          const before = s.listens.length ? battlefieldNow(s) : null;
          group.filter((_, i) => i !== keep).forEach((c) => leave(s, c, "graveyard", ev, { lookBack: before }));
          again = true;
        }
      }
      // CR 704.3: all applicable state-based actions happen at once, so creatures that die together see each
      // other die (CR 603.10a look-back: one snapshot for all of them)
      const dying = [...s.player.battlefield, ...s.opponent.battlefield].filter((c) => (isCreature(c) && (toughness(c) <= 0 ||   // CR 704.5f
        (!indestructible(c) && ((c.dmg || 0) >= toughness(c) || c.deathtouched)))) ||                                      // CR 704.5g, 704.5h
        (isPlaneswalker(c) && loyaltyOf(c) <= 0) ||                                                                         // CR 704.5i
        (isBattle(c) && defenseOf(c) <= 0 && !referenced(s, c.id)));                                                        // CR 704.5v
      // CR 714.4 / 704.5s: a Saga whose lore counters reached its final chapter, with no chapter ability of it waiting or on
      // the stack, is sacrificed
      const doneSagas = [...s.player.battlefield, ...s.opponent.battlefield].filter((c) => c.chapters && !dying.includes(c) &&
        ((c.counters && c.counters.lore) || 0) >= Math.max(...c.chapters.flatMap((ch) => ch.n)) && !referenced(s, c.id));
      if (doneSagas.length) { doneSagas.forEach((c) => leave(s, c, "graveyard", ev, { sacrificed: true })); again = true; }
      if (dying.length) {
        const before = s.listens.length ? battlefieldNow(s) : null;
        dying.forEach((c) => leave(s, c, "graveyard", ev, { lookBack: before }));
        again = true;
      }
    }
    refresh(s);
  }

  // You can pay life only if your life total is at least that much; with irrelevant life you always can
  const canPayLife = (s, n) => s.player.life == null || s.player.life >= n;
  // (your own life is only tracked when the puzzle shows it; otherwise it's irrelevant, effectively infinite)
  // Paying life (CR 119.4) — Ashiok, Wicked Manipulator: "If you would pay life while your library has at least that many
  // cards in it, exile that many cards from the top of your library instead." (unknown cards: exiled unknown)
  function payLife(s, n, ev) {
    const z = s.player;
    if (n > 0 && z.battlefield.some((c) => c.ashiok && !(c.st && c.st.lost)) && z.library.length + z.libraryBottom.length + (z.libraryCount || 0) >= n) {
      for (let i = 0; i < n; i++) {
        const c = z.library.shift() || (!(z.libraryCount > 0) ? z.libraryBottom.shift() : null);
        if (c) putCard(s, c, "player", "exile"); else { z.libraryCount--; z.exileUnknown = (z.exileUnknown || 0) + 1; }
      }
      ev.push({ type: "ashiok", n });
      return;
    }
    changeLife(s, "you", -n, ev);
  }
  const payLifeNow = payLife;
  function changeLife(s, who, n, ev) {
    const side = s[who === "opp" ? "opponent" : "player"];
    // (gaining life counts even when your life total doesn't matter: infusion, "whenever you gain life")
    if (n > 0 && battlefieldNow(s).some(({ card: x }) => x.aura && x.attachedTo === who && x.enchantedNoGain)) return;   // (Grievous Wound)
    if (n > 0 && who === "you") n += s.player.battlefield.filter((c) => c.lifeGainPlus1 && !(c.st && c.st.lost)).length;
    // The Wind Crystal: "If you would gain life, you gain twice that much life instead." (applied after a +1: your choice of order, CR 616.1)
    if (n > 0 && who === "you") n *= 2 ** s.player.battlefield.filter((c) => c.doublesLifeGain && !(c.st && c.st.lost)).length;
    if (n > 0 && who === "you") { s.gainedLife = true; s.lifeGainedTotal = (s.lifeGainedTotal || 0) + n; emit(s, { type: "gainLife", side: "player", count: n }, ev); }
    if (n < 0 && who === "opp") s.oppLostLife = true;
    if (n < 0 && who === "you") { s.youLostLife = true; s.lifeLostTotal = (s.lifeLostTotal || 0) - n; emit(s, { type: "loseLife", side: "player", count: -n }, ev); }
    // Sunspine Lynx: "Players can't gain life."
    if (n > 0 && (battlefieldNow(s).some(({ card: x }) => x.noLifeGain && !(x.st && x.st.lost)) || (s.noGain || []).includes(who))) return;
    if (n < 0 && who === "opp") n *= 2 ** s.player.battlefield.filter((c) => c.doublesOppLifeLoss && !(c.st && c.st.lost)).length;
    if (!n || side.life == null) return;
    side.life += n;
    ev.push({ type: "life", who, amount: n });
    // CR 702.179d: your speed's inherent trigger — "Whenever one or more opponents lose life during your turn, if your
    // speed is less than 4, your speed increases by 1. This ability triggers only once each turn." (no source)
    if (n < 0 && who === "opp" && speedOf(s, "player") >= 1 && speedOf(s, "player") < 4 && !s.speedTriggered) {
      s.speedTriggered = true;
      s.triggered.push({ side: "player", name: "Speed", srcId: "speed", td: defId(SPEED_TRIGGER), event: {} });
    }
  }

  // Damage from any source (spell, ability or combat): protection prevents it; wither and infect
  // deal it to creatures as -1/-1 counters; infect deals it to players as poison counters
  function dealDamage(s, src, srcSide, to, n, ev, { combat = false } = {}) {
    if (!(n > 0)) return;
    // With Great Power . . .: "All damage that would be dealt to you is dealt to enchanted creature instead."
    for (const sd of ["player", "opponent"]) { const wg = s[sd].battlefield.find((c) => c.withGreatPower && c.attachedTo && find(s, c.attachedTo) && !(c.st && c.st.lost)); if (wg && to === (sd === "player" ? "you" : "opp")) { to = wg.attachedTo; break; } }
    if (!s.noPrevention && battlefieldNow(s).some(({ card: c }) => c.noPreventionStatic && !(c.st && c.st.lost))) s.noPrevention = true;   // (Spider-Punk)
    // Ancient Adamantoise: "All damage that would be dealt to you and other permanents you control is dealt to this creature instead."
    for (const sd of ["player", "opponent"]) { const ad = s[sd].battlefield.find((c) => c.adamantoise && isCreature(c) && !(c.st && c.st.lost)); if (ad && ad.id !== to && (to === (sd === "player" ? "you" : "opp") || s[sd].battlefield.some((c) => c.id === to))) { to = ad.id; break; } }
    // Solphim, Mayhem Dominus: "If a source you control would deal noncombat damage to an opponent or a permanent an
    // opponent controls, it deals double that damage to that player or permanent instead." (each one doubles again)
    if (!combat) {
      const doublers = s[srcSide].battlefield.filter((c) => c.doublesNoncombat && !(c.st && c.st.lost)).length;
      const theirs = to === (srcSide === "player" ? "opp" : "you") || (to !== "opp" && to !== "you" && find(s, to) && sideOf(s, find(s, to)) !== srcSide);
      if (doublers && theirs) n *= 2 ** doublers;
    }
    // Ojer Axonil: "If a red source you control would deal an amount of noncombat damage less than Ojer Axonil's power to an
    // opponent, that source deals damage equal to Ojer Axonil's power instead."
    if (!combat && to === (srcSide === "player" ? "opp" : "you") && colorsOf(src).includes("R")) {
      const ax = s[srcSide].battlefield.filter((c) => c.axonil && !(c.st && c.st.lost)).map((c) => power(c));
      if (ax.length && n < Math.max(...ax)) n = Math.max(...ax);
    }
    // Valley Flamecaller: "If a Lizard, Mouse, Otter, or Raccoon you control would deal damage …, it deals that much damage plus 1"
    if (["Lizard", "Mouse", "Otter", "Raccoon"].some((ty) => hasType(src, ty))) n += s[srcSide].battlefield.filter((c) => c.flamecaller && !(c.st && c.st.lost)).length;
    if ((to === (srcSide === "player" ? "opp" : "you") || (to !== "opp" && to !== "you" && find(s, to) && sideOf(s, find(s, to)) !== srcSide)) && maxSpeed(s, srcSide))
      n += s[srcSide].battlefield.filter((c) => c.farFortune && !(c.st && c.st.lost)).length;
    // Artist's Talent level 3: noncombat damage to an opponent or their permanent: plus 2
    if (!combat && (to === (srcSide === "player" ? "opp" : "you") || (to !== "opp" && to !== "you" && find(s, to) && sideOf(s, find(s, to)) !== srcSide)))
      n += 2 * s[srcSide].battlefield.filter((c) => c.artistL3 && levelOf(c) >= 3 && !(c.st && c.st.lost)).length;
    if (src.enteredThisTurn && isCreature(src)) n *= 2 ** s[srcSide].battlefield.filter((c) => c.neriv && !(c.st && c.st.lost)).length;   // (Neriv)
    // Fated Firepower: "… it deals that much damage plus an amount of damage equal to the number of fire counters on this enchantment instead"
    if (to === (srcSide === "player" ? "opp" : "you") || (to !== "opp" && to !== "you" && find(s, to) && sideOf(s, find(s, to)) !== srcSide))
      n += s[srcSide].battlefield.filter((c) => c.fatedFirepower && !(c.st && c.st.lost)).reduce((t, c) => t + ((c.counters || {}).fire || 0), 0);
    // Collective Inferno: "Double all damage that sources you control of the chosen type would deal."
    n *= 2 ** s[srcSide].battlefield.filter((c) => c.infernoType && c.chosenType && hasType(src, c.chosenType) && !(c.st && c.st.lost)).length;
    // City on Fire: "If a source you control would deal damage to a permanent or player, it deals triple that damage instead"
    const triplers = s[srcSide].battlefield.filter((c) => c.triplesDamage && !(c.st && c.st.lost)).length;
    if (triplers) n *= 3 ** triplers;
    if (hasType(src, "Wizard")) n *= 2 ** s[srcSide].battlefield.filter((c) => c.kujaTrance && !(c.st && c.st.lost)).length;   // (Trance Kuja: "If a Wizard you control would deal damage â€¦, it deals double that damage instead")
    // Lightning, Army of One (stagger): any source's damage to that player or a permanent they control is doubled
    if (s.stagger && (to === "opp" || (to !== "you" && find(s, to) && sideOf(s, find(s, to)) === "opponent"))) n *= 2;
    // Rankle and Torbran: "If a source would deal damage to a player or battle this turn, it deals that much damage plus 2 instead"
    if (!combat && srcSide === "player" && colorsOf(src).includes("R")) s.redNoncombat = (s.redNoncombat || 0) + n;   // (Temple of Power)
    if (s.damagePlus2 && (to === "opp" || to === "you" || (find(s, to) && isBattle(find(s, to))))) n += 2 * s.damagePlus2;
    if (!combat && srcSide === "player" && s.noncombatPlus) n += s.noncombatPlus;
    if (!combat && s[srcSide].battlefield.some((c) => c.rollercrusher && !(c.st && c.st.lost)) && cardTypesIn(s, srcSide) >= 4) n *= 2;   // (Taii Wakeen: "it deals that much damage plus X instead")
    // CR 615: prevention effects ("prevent all combat damage that would be dealt this turn": Fog), unless an effect
    // says damage can't be prevented (CR 615.12)
    if (combat && s.preventCombat && !s.noPrevention && !battlefieldNow(s).some(({ card: x }) => x.noCombatPrevention && !(x.st && x.st.lost))) { ev.push({ type: "prevented", id: to }); return; }
    // (the sources of yours that dealt damage this turn, kept only when a card asks: Case of the Burning Masks)
    if (n > 0 && isCreature(src) && !(s.damageDealers || []).includes(src.id)) s.damageDealers = [...(s.damageDealers || []), src.id];
    const dealt = () => { if (s.tracksSources && srcSide === "player" && !(s.dmgSources || []).includes(src.id)) s.dmgSources = [...(s.dmgSources || []), src.id].sort(); };
    if (to === "you" && (s.shieldFrom || []).some((x) => x.id === src.id) && !s.noPrevention) {
      const sh = s.shieldFrom.find((x) => x.id === src.id); s.shieldFrom = s.shieldFrom.filter((x) => x !== sh);
      ev.push({ type: "prevented", id: "you" });
      dealDamage(s, sh.src, "player", srcSide === "player" ? "you" : "opp", n, ev); draw(s, "player", n, ev);   // ("deals that much damage to that source's controller and you draw that many cards")
      return;
    }
    if (to === "opp" || to === "you") {
      const side = s[to === "opp" ? "opponent" : "player"];
      if (to === (srcSide === "player" ? "opp" : "you") && !s.noPrevention && s[srcSide].battlefield.some((c) => c.mindskinner && !(c.st && c.st.lost))) {
        ev.push({ type: "prevented", id: to }); side.libraryCount = Math.max(0, (side.libraryCount || 0) - n); return;   // (their library: unknown cards)
      }
      // Ria Ivor: "the next time [it] would deal combat damage to one or more players this combat, prevent that damage …
      // create that many 1/1 colorless Phyrexian Mite artifact creature tokens with toxic 1 and 'This token can't block.'"
      if (combat && src.miteOnDamage && !s.noPrevention) { delete src.miteOnDamage; ev.push({ type: "prevented", id: to }); for (let i = 0; i < n; i++) createToken(s, { name: "Phyrexian Mite", type: "Token Artifact Creature — Phyrexian Mite", pt: "1/1", colors: [], kw: ["toxic 1", "can't block"] }, srcSide, ev); return; }
      if (combat) s.combatDamagers = [...new Set([...(s.combatDamagers || []), src.id])];   // (Kaito: "one of them")
      if (combat) s.combatDamagersPB = [...new Set([...(s.combatDamagersPB || []), src.id])];
      if (combat && srcSide === "player" && to === "opp" && s.heistTreasure && isCreature(src)) for (let i = 0; i < s.heistTreasure; i++) createToken(s, { name: "Treasure", type: "Token Artifact — Treasure", colors: [], tapped: true }, "player", ev);
      dealt();
      if (!combat && to === "opp") s.oppNoncombat = true;       // ("an opponent was dealt noncombat damage this turn")
      if (!combat && to === (srcSide === "player" ? "opp" : "you")) emit(s, { type: "noncombatToOpp", obj: src, side: srcSide, count: n }, ev);
      if (has(src, "infect")) {
        n *= counterMult(s, srcSide);
        side.poison = (side.poison || 0) + n;
        ev.push({ type: "poison", who: to, amount: n });
      } else changeLife(s, to, -n, ev);
      // CR 702.164c: combat damage to a player from a creature with toxic also gives that many poison counters (its
      // total toxic value, CR 702.164b), in addition to the damage
      let toxic = combat ? toxicOf(src) * counterMult(s, srcSide) : 0;
      // Melira: "If you would get one or more poison counters, instead you get one poison counter and you can't get additional poison counters this turn."
      const melira = side.battlefield.some((c) => c.melira && !(c.st && c.st.lost));
      if (toxic && melira) { const z = s[to === "opp" ? "opponent" : "player"]; toxic = z.meliraPoisoned ? 0 : 1; z.meliraPoisoned = true; }
      if (toxic) { side.poison = (side.poison || 0) + toxic; ev.push({ type: "poison", who: to, amount: toxic }); emit(s, { type: "countersPut", side: to === "opp" ? "opponent" : "player", kind: "poison", count: toxic, player: to }, ev); }
      emit(s, { type: "playerDamaged", side: to === "opp" ? "opponent" : "player", to, count: n }, ev);   // ("whenever enchanted player is dealt damage")
      // ("Whenever an instant or sorcery spell you control deals damage to an opponent or battle")
      if (!combat && typeHas(src, /instant|sorcery/i)) emit(s, { type: "spellDamage", obj: src, side: srcSide, to, count: n }, ev);
      // "whenever this creature deals combat damage to a player" (CR 510.3a: triggers after the damage is dealt)
      if (combat) emit(s, { type: "combatDamage", obj: src, side: srcSide, to, count: n, batch: s.combatBatch, modified: modifiedIn(s, src, srcSide) }, ev);
      if (combat) emit(s, { type: "combatDamageAny", obj: src, side: srcSide, count: n }, ev);
    } else {
      const t = find(s, to);
      if (!t) return;
      // protection prevents the damage, unless an effect says damage can't be prevented this turn
      if (protectedFrom(t, src) && !s.noPrevention && !battlefieldNow(s).some(({ card: x }) => x.noPrevention)) { ev.push({ type: "prevented", id: t.id }); return; }
      // Phyrexian Vindicator: "If damage would be dealt to this creature, prevent that damage. When damage is prevented
      // this way, …" (a reflexive trigger with the amount)
      // Anti-Venom: "If damage would be dealt to Anti-Venom, prevent that damage and put that many +1/+1 counters on him."
      // CR 122.1c: a shield counter — "If it would be dealt damage or destroyed, remove a shield counter from it instead." (not prevention)
      if (((t.counters || {}).shield || 0) > 0) { t.counters = { ...t.counters, shield: t.counters.shield - 1 }; if (!t.counters.shield) delete t.counters.shield; changed(s); ev.push({ type: "shield", id: t.id }); return; }
      if (t.antiVenom && !(t.st && t.st.lost) && !s.noPrevention) { ev.push({ type: "prevented", id: t.id }); addCounters(s, t, "+1/+1", n, ev); return; }
      if (t.preventsOwnDamage && !(t.st && t.st.lost) && !s.noPrevention) {
        ev.push({ type: "prevented", id: t.id });
        emit(s, { type: "damagePrevented", obj: t, side: sideOf(s, t), count: n }, ev);
        return;
      }
      dealt();
      if (combat) emit(s, { type: "combatDamageAny", obj: src, side: srcSide, count: n }, ev);
      // CR 120.3c: damage to a planeswalker removes that many loyalty counters (a planeswalker creature takes both)
      if (isPlaneswalker(t)) {
        t.counters = { ...(t.counters || {}), loyalty: Math.max(loyaltyOf(t) - n, 0) };
        if (!isCreature(t)) {
          ev.push({ type: "damage", id: t.id, amount: n });
          if (lifelinked(s, src, srcSide)) changeLife(s, srcSide === "player" ? "you" : "opp", n, ev);
          return;
        }
      }
      // CR 120.3h / 310.6: damage to a battle removes that many defense counters; a Siege whose last one is removed
      // triggers (CR 310.12b, "defeated")
      if (isBattle(t)) {
        const before = defenseOf(t);
        t.counters = { ...(t.counters || {}), defense: Math.max(before - n, 0) };
        ev.push({ type: "damage", id: t.id, amount: n });
        if (lifelinked(s, src, srcSide)) changeLife(s, srcSide === "player" ? "you" : "opp", n, ev);
        // ("deals combat damage to a player or battle": the trigger says so with orBattle)
        if (combat) s.combatDamagersPB = [...new Set([...(s.combatDamagersPB || []), src.id])];
        if (combat) emit(s, { type: "combatDamage", obj: src, side: srcSide, to: t.id, toBattle: true, count: n, batch: s.combatBatch, modified: modifiedIn(s, src, srcSide) }, ev);
        if (!combat && typeHas(src, /instant|sorcery/i)) emit(s, { type: "spellDamage", obj: src, side: srcSide, to: t.id, toBattle: true, count: n }, ev);
        if (before > 0 && defenseOf(t) === 0) emit(s, { type: "defeated", obj: t, side: sideOf(s, t) }, ev);
        return;
      }
      if (has(src, "infect") || has(src, "wither")) {
        t.counters = { ...(t.counters || {}) };
        t.counters["-1/-1"] = (t.counters["-1/-1"] || 0) + n;
      } else {
        // CR 120.4a: excess damage — beyond lethal (lethal is 1 from a source with deathtouch); "excess noncombat damage"
        const lethalLeft = Math.max(toughness(t) - (t.dmg || 0), 0), excess = n - (has(src, "deathtouch") && lethalLeft > 0 ? 1 : lethalLeft);
        if (!combat && excess > 0 && isCreature(t)) emit(s, { type: "excessDamage", obj: t, side: sideOf(s, t), count: excess, batch: s.evBatch || 0 }, ev);
        t.dmg = (t.wolverine && !(t.st && t.st.lost) ? 0 : t.dmg || 0) + n;
      }   // (Wolverine: "that damage is dealt, but all other damage already dealt to him is healed")
      if (has(src, "deathtouch")) t.deathtouched = true;
      ev.push({ type: "damage", id: t.id, amount: n });
      // ("Whenever an instant or sorcery spell you control that targets only a single creature deals damage to that creature")
      if (!combat && typeHas(src, /instant|sorcery/i)) emit(s, { type: "spellDamage", obj: src, side: srcSide, to: t.id, toCreature: true, count: n }, ev);
      // "Whenever a source deals damage to this creature, that source's controller …" (Phyrexian Obliterator)
      emit(s, { type: "dealtDamage", obj: t, side: sideOf(s, t), count: n, controller: srcSide === "player" ? "you" : "opp", ...(!combat && n === toughness(t) ? { exactNoncombat: true } : {}) }, ev);
    }
    emit(s, { type: "dealsDamage", obj: src, side: srcSide, count: n }, ev);   // ("Whenever Cecil deals damage")
    if (lifelinked(s, src, srcSide)) changeLife(s, srcSide === "player" ? "you" : "opp", n, ev);
  }

  // "gets +N/+N" / "gains flying" until end of turn: continuous effects in layers 7c and 6 (see addEffect)
  const addMod = (s, c, pump) => addEffect(s, c, { pump });
  const grant = (c, kws, s) => {
    addEffect(s, c, { grant: kws });
    kws.forEach((k) => { const t = KEYWORD_TRIGGERS[k]; if (t && !s.listens.includes(t.on)) s.listens.push(t.on); });
  };

  /* ---------- events and triggered abilities (CR 603) ---------- */
  // A triggered ability is data on the card: { on, self, other, filter, zones, if, effect, targets, targetFilter, count }.
  //   on: the event — "enters", "leaves", "dies", "sacrificed", "attacks", "attacksAlone", "cast", "becomesTarget"
  //   self / other: the event's object is (or isn't) this object; filter: what the event's object must be
  //     ({ controller: "you"|"opponent", artifact, creature, land, treasure, noncreature }, relative to this object)
  //   zones: where it functions (CR 113.6; default the battlefield); if: an intervening "if" condition (CR 603.4)
  // Older card fields (etb, onDeath, onAttack, landfall, onTreasureSac, onTargetedBySpell) are turned into triggers
  // once, when the puzzle is loaded (compile); keyword triggers (prowess, exalted, battle cry) are built once per
  // keyword and cached, so a keyword gained during the turn triggers too.
  // Compiled triggers live outside the game state, in one table keyed by the card's definition, so states stay
  // small for the solver (it copies and compares every state it visits); a card only carries its key (tk).
  const TRIGGER_TABLE = new Map(), TRIGGER_KEYS = new Map();
  const TRIGGER_FIELDS = ["triggers", "etb", "onDeath", "onAttack", "landfall", "onTreasureSac", "onTargetedBySpell", "returnsToHand", "backup", "eerie", "survival", "mobilize", "chapters",
    "targets", "targetFilter", "targetCount"];
  // Rules text is only for showing the card; it's kept here by name, outside the state, for the same reason
  const CARD_TEXT = new Map();
  const textOf = (c) => (c.text != null ? c.text : CARD_TEXT.get(c.name) || "");
  function compile(card) {
    if (!card || card.tk != null) return card;
    if (card.text != null) { CARD_TEXT.set(card.name, card.text); delete card.text; }
    const key = JSON.stringify(TRIGGER_FIELDS.map((k) => card[k] === undefined ? null : card[k]));
    if (!TRIGGER_KEYS.has(key)) { TRIGGER_KEYS.set(key, TRIGGER_KEYS.size); TRIGGER_TABLE.set(TRIGGER_KEYS.size - 1, buildTriggers(card)); }
    card.tk = TRIGGER_KEYS.get(key);
    (card.faces || []).forEach(compile);
    return card;
  }
  function buildTriggers(card) {
    const list = [...(card.triggers || [])];
    const ETB_TARGET = { targets: card.targets, targetFilter: card.targetFilter, count: card.targetCount };
    if (card.etb) list.push({ on: "enters", self: true, effect: card.etb, ...(card.targets ? ETB_TARGET : {}) });
    if (card.onDeath) list.push({ on: "dies", self: true, effect: card.onDeath.effect, targets: card.onDeath.targets,
      targetFilter: card.onDeath.filter, count: card.onDeath.count });
    if (card.onAttack) list.push({ on: "attacks", self: true, effect: card.onAttack.effect || { create: card.onAttack.create } });
    if (card.landfall) list.push({ on: "enters", filter: { land: true, controller: "you" }, effect: card.landfall });
    // backup: { n, grant } — "When this creature enters, put N +1/+1 counters on target creature …" (CR 702.165a)
    if (card.backup) list.push({ on: "enters", self: true, targets: "creature", effect: { backup: card.backup } });
    if (card.onTreasureSac) list.push({ on: "sacrificed", filter: { treasure: true, controller: "you" }, effect: { ...card.onTreasureSac, self: true } });
    if (card.onTargetedBySpell) list.push({ on: "becomesTarget", self: true, by: "spell", effect: { damage: card.onTargetedBySpell, to: "eventController" } });
    // Rancor: "When this Aura is put into a graveyard from the battlefield, return it to its owner's hand."
    if (card.returnsToHand) list.push({ on: "leaves", self: true, toZone: "graveyard", effect: { returnFromGraveyard: true } });
    // Eerie — "Whenever an enchantment you control enters and whenever you fully unlock a Room, …" (two trigger events)
    if (card.eerie) {
      list.push({ on: "enters", filter: { controller: "you", enchantment: true }, ...card.eerie });
      list.push({ on: "fullyUnlocked", filter: { controller: "you" }, ...card.eerie });
    }
    // Survival — "At the beginning of your second main phase, if this creature is tapped, …"
    if (card.survival) list.push({ on: "main2", filter: { controller: "you" }, if: { selfTapped: true }, ...card.survival });
    // CR 702.181a: mobilize N — "Whenever this creature attacks, create N 1/1 red Warrior creature tokens. Those tokens
    // enter tapped and attacking. Sacrifice them at the beginning of the next end step."
    // Saga chapters (CR 714.2): "I, II — …" triggers when lore counters reach that number: { n: [1, 2], effect, targets, … }
    (card.chapters || []).forEach(({ n, ...ch }) => n.forEach((k) => list.push({ on: "lore", self: true, chapter: k, ...ch, count: ch.count || ch.targetCount })));
    // impending: "At the beginning of your end step, remove a time counter from it." (CR 702.176a)
    if (card.impending) list.push({ on: "endStep", filter: { controller: "you" }, effect: { counters: { time: -1 }, self: true } });
    if (card.mobilize) list.push({ on: "attacks", self: true, effect: { create: { ...WARRIOR, count: card.mobilize, tapped: true, attacking: true } } });
    return list;
  }
  const WARRIOR = { name: "Warrior", type: "Token Creature — Warrior", pt: "1/1", colors: ["R"], atEndStep: "sacrifice" };
  const KEYWORD_TRIGGERS = {
    // CR 702.108a: whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn
    prowess: { on: "cast", filter: { noncreature: true, controller: "you" }, effect: { pump: [1, 1], self: true } },
    // CR 702.83a: whenever a creature you control attacks alone, that creature gets +1/+1 until end of turn
    exalted: { on: "attacksAlone", filter: { controller: "you" }, effect: { pump: [1, 1], to: "eventObject" } },
    // CR 702.91a: whenever this creature attacks, each other attacking creature gets +1/+0 until end of turn
    "battle cry": { on: "attacks", self: true, effect: { team: { pump: [1, 0], filter: { attacking: true }, other: true } } },
    // CR 702.163a: when this Equipment enters, create a 2/2 red Rebel creature token, then attach this Equipment to it
    "for mirrodin!": { on: "enters", self: true, effect: { forMirrodin: true } },
    // CR 702.182a: job select — when this Equipment enters, create a 1/1 colorless Hero creature token, then attach this to it
    "job select": { on: "enters", self: true, effect: { jobSelect: true } },
    // CR 702.191a: increment (the "if" is checked in emit)
    increment: { on: "cast", filter: { controller: "you" }, increment: true, effect: { counters: { "+1/+1": 1 }, self: true } }
  };
  // Speed: the events anything in this puzzle can trigger on, worked out when the puzzle loads (its cards are known)
  // and kept up to date as new objects appear (tokens) or keywords are gained; emit() skips all other events
  function listen(s, card) {
    const add = (on) => { if (!s.listens.includes(on)) s.listens.push(on); };
    // a card that targets, counters or copies spells makes the stack itself matter (turns off a solver shortcut)
    const json = JSON.stringify(card);
    if (card.replacements) s.replaces = true;                 // (zone changes then check for replacement effects)
    if (card.tracksAllSpells) s.tracksColorsSpent = true;      // (the colors spent on every spell matter: Magmablood Archaic)
    if (card.conditional || card.perCounter || card.ptCount || card.perHandCard || card.impending || card.soulCauldron || card.goddric || card.minusLife || /"hasCounter"|"baseLife"|"attachedAttacking"/.test(json)) s.dynamicStatics = true;
    if (/firebending/.test(json)) add("attacks");             // (firebending it may gain later still triggers)
    if (/"damageSources"|"attackedCount"/.test(json)) s.tracksSources = true;
    if (/"loseAll"|"setBase"/.test(json)) s.tsMatters = true;  // (effects whose order matters: keep timestamps)
    if (/"exiledThisTurn"/.test(json) && !s.tracksExile) { s.tracksExile = true; s.exileSeen = [...s.player.exile, ...s.opponent.exile].map((c) => c.id); }
    if (/"artifactsEntered"/.test(json)) s.countsArtifacts = true;   // (count artifacts entering only when a card asks)
    if (/"takeEquipment"/.test(json)) s.tracksEquipment = true;
    if (/"targets":"spell"|"counter(Spell)?":true|"copySpell"|"copyEventSpell"|"targets":"ability-or-noncreature-spell"|"targets":"trigger-or-instsorc-spell"|"targets":"ability-yours"/.test(json)) s.stackAware = true;
    // something that cares about a creature dying, leaving or being sacrificed, or about low power/toughness
    if (/"maxPower"|"maxToughness"|"onDeath"|"returnsToHand"/.test(json) ||
      triggersOf(card).some((t) => ["dies", "leaves", "sacrificed"].includes(t.on))) s.pumpSensitive = true;
    triggersOf(compile(card)).forEach((t) => { add(t.on); if ((t.zones || []).some((z) => z !== "battlefield")) s.offField = true; });
    // keywords it can give others (an Aura's, Equipment's or anthem's static ability)
    const given = [card.aura, card.equip, card.static && card.static.team].flatMap((x) => (x && (x.static || x).grant) || []);
    given.forEach((k) => { if (KEYWORD_TRIGGERS[k]) add(KEYWORD_TRIGGERS[k].on); });
    ((card.backup && card.backup.triggers) || []).forEach((t) => add(t.on));   // (triggered abilities backup gives)
    (card.faces || []).forEach((f) => listen(s, f));
  }
  // A triggered ability waiting or on the stack carries only a number for its definition (td) and its source's id;
  // trig() gives the definition back, srcOf() the source (CR 608.2h: as it is now if it's still where it was,
  // otherwise its last known information, saved in s.lki when it left)
  const TRIGGER_DEFS = [], DEF_IDS = new Map();
  const defId = (t) => { if (!DEF_IDS.has(t)) { DEF_IDS.set(t, TRIGGER_DEFS.length); TRIGGER_DEFS.push(t); } return DEF_IDS.get(t); };
  function trig(p) {
    const d = TRIGGER_DEFS[p.td];
    // a modal triggered ability ("choose one —", CR 700.2b): its modes were chosen as it was put on the stack (p.modes);
    // the chosen modes happen in order, and the one with a target gives the ability its target
    if (d.modes && p.modes) {
      const chosen = p.modes.map((i) => d.modes[i]), aimed = chosen.find((m) => m.targets);
      // (several chosen modes with targets — "choose one or more —" with a target in each: one target group per mode,
      // CR 700.2c; each mode's effect gets its own target)
      if (chosen.filter((m) => m.targets).length > 1) {
        let k = 0;
        const slots = [], parts = chosen.map((m) => { if (!m.targets) return { ...m.effect, untargeted: true }; slots.push({ targets: m.targets, filter: m.targetFilter, optional: !!(m.targetCount && m.targetCount.min === 0) }); return { useSlot: k++, effect: m.effect }; });
        return { effect: { seq: parts }, slots, if: d.if };
      }
      return { effect: { seq: chosen.map((m) => m.effect) }, targets: aimed && aimed.targets, filter: aimed && aimed.targetFilter, count: aimed && (aimed.count || aimed.targetCount), if: d.if };
    }
    // (a trigger's number of targets: count, or targetCount as on cards — "up to two target creatures")
    // (slots: target groups of their own — "target creature you control … up to one target creature you don't control")
    if (d.slots) return { effect: d.effect, slots: d.slots, if: d.if };
    // ("exile up to X target creatures": X is the X paid for the permanent whose ability it is, p.x)
    const cnt = d.count || d.targetCount;
    // ("another target creature card with lesser mana value": lesser than the object of the event, and not it)
    if (d.targetFilter && d.targetFilter.mvEventX) { const { mvEventX, ...rest } = d.targetFilter; return { effect: d.effect, targets: d.targets, filter: { ...rest, exactMV: (p.event && p.event.x) || 0 }, count: cnt, if: d.if }; }
    if (d.targetFilter && d.targetFilter.lesserThanEvent) { const { lesserThanEvent, ...rest } = d.targetFilter; return { effect: d.effect, targets: d.targets, filter: { ...rest, maxMV: ((p.event && p.event.objMV) || 0) - 1, notId: p.event && p.event.id }, count: cnt, if: d.if }; }
    return { effect: d.effect, targets: d.targets, filter: d.targetFilter, count: cnt && (cnt.max === "X" || cnt.min === "X") ? { ...cnt, max: cnt.max === "X" ? p.x || 0 : cnt.max, min: cnt.min === "X" ? p.x || 0 : cnt.min } : cnt, if: d.if };
  }
  // The ways to choose a modal trigger's modes: one (or chooseCount), "one or both", "any number" (none too)
  function modeCombos(d) {
    const all = d.modes.map((_, i) => i);
    if (d.anyNumber) return subsets(all);
    if (d.oneOrBoth || d.oneOrMore) return subsets(all).filter((l) => l.length);
    return combinations(all, d.chooseCount || 1);
  }
  function srcOf(s, p) {
    const zone = p.zone || "battlefield";
    const here = zone === "battlefield" ? find(s, p.srcId) : (s[p.side][zone] || []).find((c) => c.id === p.srcId);
    return here || (s.lki && s.lki[p.srcId]) || { id: p.srcId, name: p.name };
  }
  // Is a triggered ability from this object still waiting or on the stack? (then its last known information is kept)
  const referenced = (s, id) => [...s.triggered, ...s.pending, ...s.stack].some((p) => p.srcId === id);
  // CR 603.3b: when several of your triggered abilities go on the stack together, you choose their order.
  // Triggers that would do exactly the same thing (same ability, same event, not tied to their own source) can't
  // be told apart, so only one of each kind is offered. Returns the pending indexes you can choose from.
  function orderChoices(s) {
    const p = s.pending[0];
    if (!p || p.kind === "scry" || p.kind === "choice" || p.side !== "player" || p.ordered) return [];
    const group = [];
    for (let i = 0; i < s.pending.length && s.pending[i].side === "player" && s.pending[i].kind !== "scry"; i++) group.push(i);
    // (the event and the source only tell triggers apart if the effect uses them: "that creature", "this creature", a target)
    const keyOf = (q) => {
      const d = trig(q), json = JSON.stringify(d.effect || {});
      return `${q.td}|${/"event/.test(json) ? q.event.id : ""}|${d.targets || /"self":true/.test(json) ? q.srcId : ""}`;
    };
    // Triggers that each only put counters on, pump or give keywords to their own source ("put an oil counter on this
    // creature") end the same in any order: nothing triggers on those, and none reads another's result
    const selfOnly = (q) => { const d = trig(q), e = d.effect || {};
      return !d.targets && !d.if && e.self && Object.keys(e).every((k) => ["self", "counters", "pump", "grant"].includes(k)); };
    if (group.every((i) => selfOnly(s.pending[i]))) return [];
    const seen = new Set(), out = [];
    group.forEach((i) => { const k = keyOf(s.pending[i]); if (!seen.has(k)) { seen.add(k); out.push(i); } });
    return out.length > 1 ? out : [];
  }
  // What the game screen needs to ask for a waiting trigger's target
  // The legal ways to choose a waiting trigger's targets: targetChoices for one group; with slots, one per combination
  // (an optional slot — "up to one target" — may be left empty: null)
  function triggerTargetOptions(s, p) {
    const d = trig(p), src = srcOf(s, p);
    if (d.slots) {
      let combos = [[]];
      for (const sl of d.slots) { const ts = targetsFor(s, src, sl.targets, sl.filter, p.side); combos = combos.flatMap((c) => [...ts.map((t) => [...c, t]), ...(sl.optional ? [[...c, null]] : [])]); }
      return combos.filter((c) => c.some((t) => t != null) || d.slots.every((sl) => sl.optional));   // (all "up to one": none at all too)
    }
    const opts = d.targets ? targetChoices(targetsFor(s, src, d.targets, d.filter, p.side), d.count) : null;
    // ("any number of target creature cards with total mana value 6 or less")
    if (opts && d.maxTotalMV != null) { const mv = (id) => { const c = [...s.player.graveyard, ...s.opponent.graveyard].find((x) => x.id === id) || find(s, id); return c ? manaValue(faceOf(c, {}).cost) : 0; }; return opts.filter((o) => [].concat(o).reduce((t, id) => t + mv(id), 0) <= d.maxTotalMV); }
    return opts;
  }
  function pendingTrigger(s) {
    const p = s.pending[0];
    if (!p || p.kind === "scry" || p.kind === "choice") return p;
    return { ...trig(p), name: p.name, side: p.side, src: srcOf(s, p) };
  }
  // Each instance of a keyword is its own ability and triggers separately (CR 702.83b, 702.108b)
  // (an object that lost all its abilities keeps only keyword triggers it gained afterwards, CR 613.1f)
  const triggersOf = (c) => [...((c.st && c.st.lost) ? [] : TRIGGER_TABLE.get(compile(c).tk) || []), ...((c.st && c.st.gained) || []).map((i) => TRIGGER_DEFS[i]), ...keywords(c).filter((k) => KEYWORD_TRIGGERS[k]).map((k) => KEYWORD_TRIGGERS[k]),
    ...(isBattle(c) && /\bsiege\b/i.test(c.type || "") ? [SIEGE_TRIGGER] : []),
    ...(c.toSolve && !(c.st && c.st.lost) ? [CASE_TRIGGER] : []),
    ...(c.offspring && !(c.st && c.st.lost) ? [OFFSPRING_TRIGGER] : []),
    // CR 702.189a: firebending N — "Whenever this creature attacks, add N {R}. Until end of combat, you don't lose this mana"
    ...keywords(c).map((k) => /^firebending (\d+)$/.exec(k)).filter(Boolean).map((m) => FIRE_TRIGGERS[m[1]] || (FIRE_TRIGGERS[m[1]] = { on: "attacks", self: true, effect: { fireMana: Number(m[1]) } }))];
  const FIRE_TRIGGERS = {};
  // CR 702.175a: offspring — "When this permanent enters, if its offspring cost was paid, create a token that's a copy of
  // it, except it's 1/1."
  const OFFSPRING_TRIGGER = { on: "enters", self: true, if: { offspringPaid: true }, effect: { offspringCopy: true } };
  // CR 719.3a: "To solve — [condition]" means "At the beginning of your end step, if [condition] and this Case is not
  // solved, this Case becomes solved." (c.toSolve: the condition, read by conditionHolds)
  const CASE_TRIGGER = { on: "endStep", filter: { controller: "you" }, if: { toSolve: true }, effect: { solve: true, self: true } };
  // CR 310.12b: a Siege's intrinsic "When the last defense counter is removed from this permanent, exile it, then you may
  // cast it transformed without paying its mana cost."
  const SIEGE_TRIGGER = { on: "defeated", self: true, effect: { siegeDefeated: true } };
  // CR 702.179d: the speed trigger (put on the stack by changeLife; the "if" is checked again as it resolves, CR 603.4)
  const SPEED_TRIGGER = { on: "speed", if: { speedBelow4: true }, effect: { speedUp: 1 } };
  // CR 603.7: delayed triggered abilities a resolving effect sets up — "at the beginning of the next end step, …" (CR
  // 603.7b: they trigger once). Kept in s.delayed as { kind, side, name, srcId, id } (id: the object they're about) and
  // put among the triggered abilities as the end step begins.
  const DELAYED = {
    returnExiled: { effect: { returnExiled: true } },    // "return that card to the battlefield under its owner's control"
    exileIt: { effect: { exileEvent: true } },          // "exile it" (a token copy that has haste this turn)
    sacrificeIt: { effect: { sacrificeEvent: true } },   // "sacrifice it"
    dragonhawkDamage: { effect: { dragonhawkDamage: true } },
    returnToHand: { effect: { bounceEventObj: true } }     // "Return it to your hand at the beginning of the next end step."
  };
  const delay = (s, kind, side, name, srcId, id) => { s.delayed = [...(s.delayed || []), { kind, side, name, srcId, id }]; };
  const COPY_NEXT = { effect: { copyEventSpell: { always: true } } };
  const WALTZ = { effect: { impulseAll: 1 } };
  // CR 701.66a: an earthbent land has "When this permanent dies or is exiled, return it to the battlefield tapped"
  const EARTH_RETURN = { effect: { earthReturn: true } };
  const RETURN_DIED = { effect: { earthReturn: true, untapped: true } };   // (the same move: from the graveyard back to the battlefield)
  // CR 702.74a: an evoked permanent: "When this permanent enters, if its evoke cost was paid, its controller sacrifices it."
  const EVOKE_SAC = { effect: { sacrificeEvent: true } };

  // The objects whose abilities can trigger now: permanents on the battlefield, plus cards in other zones whose
  // triggers say they function there (CR 113.6b). `battlefield` replaces the battlefield part for look-back events.
  const battlefieldNow = (s) => [...s.player.battlefield.map((card) => ({ card, side: "player" })),
    ...s.opponent.battlefield.map((card) => ({ card, side: "opponent" }))];
  function triggerSources(s, battlefield) {
    const out = battlefield || battlefieldNow(s);                     // (zone: battlefield when not given)
    if (!s.offField) return out;                                      // nothing in this puzzle triggers from other zones
    for (const side of ["player", "opponent"]) for (const zone of ["hand", "graveyard", "exile", "command"]) {
      (s[side][zone] || []).forEach((card) => { if ((TRIGGER_TABLE.get(compile(card).tk) || []).some((t) => (t.zones || []).includes(zone))) out.push({ card, side, zone }); });
    }
    return out;
  }
  // Last known information (CR 113.7a, 608.2h): the object as it last existed, with its power and toughness then
  // (a copy of the top level and of the parts that change during a turn is enough: the rest never changes)
  const lastKnown = (c) => ({ ...c, counters: c.counters && { ...c.counters },
    st: c.st && { ...c.st, kw: [...c.st.kw], base: [...c.st.base], mod: [...c.st.mod] }, lastPower: power(c), lastToughness: toughness(c) });

  // Does the event match the trigger condition (CR 603.2)?
  function eventMatches(t, src, srcSide, e) {
    if (t.on !== e.type) return false;
    if (t.self && e.obj.id !== src.id) return false;
    // (an ability an Aura gives the creature it enchants: "Enchanted creature has 'Whenever this creature attacks …'")
    if (t.enchanted && (!src.attachedTo || e.obj.id !== src.attachedTo)) return false;
    if (t.enchantedPlayer && src.attachedTo !== (srcSide === "player" ? e.to : e.to === "opp" ? "you" : "opp")) return false;   // "whenever enchanted player is dealt damage"
    if (t.other && e.obj.id === src.id) return false;
    if (t.by && t.by !== e.by) return false;
    if (t.toZone && t.toZone !== e.to) return false;           // "is put into a graveyard from the battlefield"
    if (t.notToZone && t.notToZone === e.to) return false;     // "leave the battlefield without dying"
    const f = t.filter || {};
    if (f.controller && (e.side === srcSide ? "you" : "opponent") !== f.controller) return false;
    if (f.artifact && !isArtifact(e.obj)) return false;
    if (f.creature && !isCreature(e.obj)) return false;
    if (f.land && !isLand(e.obj)) return false;
    if (f.treasure && !isTreasure(e.obj)) return false;
    if (f.noncreature && isCreature(e.obj)) return false;
    if (f.toxic && !toxicOf(e.obj)) return false;
    if (f.attackingBattle && !e.toBattle) return false;          // "whenever this creature attacks a battle"
    if (t.on === "combatDamage" && e.toBattle && !t.orBattle) return false;   // (combat damage to a battle: only "to a player or battle")
    if (f.toOppOrBattle && !(e.toBattle || e.to === (srcSide === "player" ? "opp" : "you"))) return false;   // "deals damage to an opponent or battle"
    if (f.type && !hasType(e.obj, f.type)) return false;          // "whenever another Knight you control enters"
    if (f.kw && !has(e.obj, f.kw)) return false;                  // "whenever you cast a spell that has convoke"
    if (f.instantOrSorcery && !typeHas(e.obj, /instant|sorcery/i)) return false;
    if (f.singleTarget && e.targetCount !== 1) return false;     // "a spell with a single target"
    if (f.maxPower != null && power(e.obj) > f.maxPower) return false;   // "another creature … with power 2 or less enters"
    if (f.spellNumber && e.spellNumber !== f.spellNumber) return false;  // "whenever you cast your second spell each turn"
    if (f.expend && e.n !== f.expend) return false;                       // "whenever you expend 4"
    if (f.enchantment && !typeHas(e.obj, /enchantment/i)) return false;  // "whenever an enchantment you control enters"
    if (f.artifactOrCreature && !isArtifact(e.obj) && !isCreature(e.obj)) return false;   // "another creature or artifact"
    // "a spell with mana value 4 or greater" (its printed cost, even if cast for an alternative cost, CR 118.9c)
    if (f.minManaValue && manaValue(e.obj.printedCost != null ? e.obj.printedCost : e.obj.cost) < f.minManaValue) return false;
    if (f.colors && !f.colors.some((x) => colorsOf(e.obj).includes(x))) return false;        // "other blue creatures you control"
    if (f.nontoken && e.obj.token) return false;                                             // "another nontoken creature"
    if (f.token && !e.obj.token) return false;                                               // "whenever a token you control enters"
    if (f.multicolored && colorsOf(e.obj).length < 2) return false;                          // "a multicolored spell"
    if (f.firstMulticolored && e.multiNumber !== 1) return false;                           // "their first multicolored spell each turn"
    if (f.subtypeIs && !hasType(e.obj, f.subtypeIs)) return false;                           // "Kemba or another Cat you control"
    if (f.equipped && !e.equipped) return false;                                             // "an equipped creature you control"
    if (f.basicLand && !/\bbasic\b/i.test(e.obj.type || "")) return false;
    if (f.drawNumber && e.count !== f.drawNumber) return false;
    if (f.anyOfTypes && !f.anyOfTypes.some((ty) => hasType(e.obj, ty))) return false;
    if (f.toughnessOverPower && !(toughness(e.obj) > power(e.obj))) return false;           // "with toughness greater than its power"
    if (f.lastToughnessBelow1 && !((e.obj.lastToughness ?? toughness(e.obj)) < 1)) return false;   // "if its toughness was less than 1"
    if (f.minCount && !(e.count >= f.minCount)) return false;
    if (f.notFirstSpell && !(e.spellNumber > 1)) return false;                              // "other than your first spell that turn"
    if (f.legendary && !/\blegendary\b/i.test(e.obj.type || "")) return false;              // "a legendary creature you control"
    if (f.minPowerEvent != null && power(e.obj) < f.minPowerEvent) return false;            // "another creature … with power 4 or greater enters"                               // "attacks with three or more creatures"
    if (f.hasCounterKind && !(f.hasCounterKind === "any" ? Object.values(e.obj.counters || {}).some((n) => n > 0) : (e.obj.counters || {})[f.hasCounterKind] > 0)) return false;   // "with an impostor counter on it"
    if (f.attackerType && !(e.attackers || []).some((c) => hasType(c, f.attackerType))) return false;
    if (f.attackerNonType && !(e.attackers || []).some((c) => !hasType(c, f.attackerNonType))) return false;   // "one or more non-Gnome creatures"   // "attack with one or more Faeries"                              // "their second card each turn"
    if (f.exactlyColors != null && colorsOf(e.obj).length !== f.exactlyColors) return false; // "a spell that's exactly two colors"
    if (f.counterKind && e.kind !== f.counterKind) return false;                             // "+1/+1 counters are put on this creature"
    if (f.fromHand && !e.fromHand) return false;
    if (f.underspent && !((e.spent || 0) < (e.mv || 0))) return false;                  // ("if the amount of mana spent to cast it was less than its mana value")
    if (f.chosenType && !(src.chosenType && hasType(e.obj, src.chosenType))) return false;   // ("a spell of the chosen type")
    if (f.creatureOrWalkerEvent && !isCreature(e.obj) && !isPlaneswalker(e.obj)) return false;   // ("another creature or planeswalker you control enters")
    if (f.name && e.obj.name !== f.name) return false;
    if (f.nonland && isLand(e.obj)) return false;                                          // "a nonland creature you control"
    if (f.artifactOrLesson && !isArtifact(e.obj) && !hasType(e.obj, "Lesson")) return false;   // "an artifact or Lesson spell"
    if (f.fromExile && !e.fromExile) return false;
    if (f.firstInstSorc && e.instSorcNumber !== 1) return false;
    if (f.instantSpell && !typeHas(e.obj, /instant/i)) return false;
    if (t.castSelf) return false;                                                     // (only from the spell itself: see emit)
    if (f.colorlessSpell && colorsOf(e.obj).length) return false;                     // "a colorless spell"
    if (f.faceDown && !e.obj.faceDown) return false;
    if (f.exactNoncombatByYou && !(e.exactNoncombat && e.controller === (srcSide === "player" ? "you" : "opp"))) return false;   // (Taii Wakeen)
    if (f.notFromHand && e.fromHand) return false;                                   // "a spell from anywhere other than your hand"
    if (f.notCast && e.obj.wasCast && (e.obj.spentToCast || 0) > 0) return false;    // ("if none of them were cast or no mana was spent to cast them")
    if (f.modal && !e.modal) return false;
    if (f.alaniaFirst && !e.alaniaFirst) return false;                                             // "a modal spell"                                         // "face-down creatures you control"                       // "an instant spell"
    if (f.singleCreatureTarget && !(e.toCreature && (e.obj.spellTargets || []).length === 1 && e.obj.spellTargets[0] === e.to)) return false;   // (Imodane)                          // "your first instant or sorcery spell each turn"
    if (f.minEventMV != null && !((e.mv || 0) >= f.minEventMV)) return false;              // "a noncreature spell with mana value 3 or greater" (X included)
    if (f.creatureManaMin != null && !((e.creatureMana || 0) >= f.creatureManaMin)) return false;   // "if three or more mana from creatures was spent to cast it"                                       // "whenever you cast a spell from exile"
    if (f.modified && !e.modified) return false;                                          // "a modified creature you control deals combat damage"
    if (f.notOwned && e.obj.owner !== "opponent") return false;
    if (f.greatestTheirs && !e.greatest) return false;                                    // ("with the greatest power among creatures that player controls")
    if (f.mvEqSelfPower && (e.mv ?? -1) !== power(src)) return false;                    // ("with mana value equal to Jackal's power")
    if (f.attackersOfTypeMin && (e.attackers || []).filter((c) => hasType(c, f.attackersOfTypeMin.type)).length < f.attackersOfTypeMin.n) return false;   // ("attack with two or more Spiders")
    if (f.crewedBySelf && !(e.obj.crewedBy || []).includes(src.id)) return false;          // ("a Vehicle crewed by Balthier and Fran this turn")
    if (f.zenosChosen && !(src.zenosChosen && e.obj.id === src.zenosChosen)) return false;   // ("When the chosen creature leaves the battlefield")
    if (f.wasCast && !e.obj.wasCast) return false;                                      // "if you cast it"                                             // "an instant or sorcery spell from your hand"
    if (f.targetsCreature && !e.targetsCreature) return false;
    if (f.targetsOwnCreature && !e.targetsOwnCreature) return false;          // "that targets only a single creature you control"   // repartee: "an instant or sorcery spell that targets a creature"
    if (t.on === "unlock" && t.door != null && e.door !== t.door) return false;   // "when you unlock this door"
    if (f.level && e.level !== f.level) return false;                     // "when this Class becomes level 3"
    if (t.byYou && e.controller !== "you") return false;                  // valiant: "a spell or ability you control"
    if (t.mainPhase && !e.main) return false;                             // "… crews a Vehicle during your main phase"
    if (t.chapter != null && !(e.before < t.chapter && t.chapter <= e.after)) return false;   // a Saga chapter (CR 714.2b)
    return true;
  }
  // An intervening "if" (CR 603.4): { controls: { filter, min } } — "if you control N or more …"
  function conditionHolds(s, cond, side, self) {
    // Corrupted (ONE): "an opponent has three or more poison counters"
    if (cond.corrupted && !(((s[side === "player" ? "opponent" : "player"].poison) || 0) >= 3)) return false;
    // Descend N (LCI): "as long as there are N or more permanent cards in your graveyard"
    if (cond.descend != null && !(permanentCardsIn(s, side) >= cond.descend)) return false;
    // "if you descended this turn" (CR 700.11)
    if (cond.descended && !(s[side].descended > 0)) return false;
    if (cond.wasCast && !(self && self.wasCast)) return false;     // "if you cast it"
    // Cases (CR 719.3): solved or not; "To solve — …" (the condition, and not solved yet)
    if (cond.solved && !(self && self.solved)) return false;
    if (cond.toSolve && !(self && !self.solved && self.toSolve && conditionHolds(s, self.toSolve, side, self))) return false;
    // "three or more creatures attacked this turn"; "three or more sources you controlled dealt damage this turn"
    if (cond.attackedCount != null && !((side === "player" ? s.attackedCount || 0 : 0) >= cond.attackedCount)) return false;
    if (cond.damageSources != null && !((side === "player" ? (s.dmgSources || []).length : 0) >= cond.damageSources)) return false;
    // "if evidence was collected" (CR 701.59c), on a permanent spell that resolved
    if (cond.evidenced && !(self && self.evidenced)) return false;
    // "as long as you've committed a crime this turn" (CR 700.13); "while saddled" (CR 702.171b)
    if (cond.crime && !(side === "player" && s.crimes > 0)) return false;
    // Threshold: "seven or more cards in your graveyard"; a Class's level N abilities (CR 716.2b-c); offspring paid
    if (cond.threshold && !(s[side].graveyard.length >= 7)) return false;
    if (cond.level != null && !(self && levelOf(self) >= cond.level)) return false;
    if (cond.offspringPaid && !(self && self.offspringPaid)) return false;
    // Delirium: four or more card types among cards in your graveyard; survival: "if this creature is tapped"
    if (cond.delirium && !(cardTypesIn(s, side) >= 4)) return false;
    if (cond.selfTapped && !(self && self.tapped)) return false;
    if (cond.door != null && !(self && self.unlocked && self.unlocked[cond.door])) return false;   // a Room door's ability
    if (cond.saddled && !(self && self.saddled)) return false;
    if (cond.webSlung && !(self && self.webSlung)) return false;    // "if they were cast using web-slinging"
    if (cond.sneaked && !(self && self.sneaked)) return false;      // "if its sneak cost was paid"
    if (cond.infusion && !(side === "player" && s.gainedLife)) return false;   // Infusion (SOS): "if you gained life this turn"
    if (cond.enduring && !s[side].enduringStory) return false;     // "as long as you have an enduring story" (CR 702.195b)
    // "as long as an opponent was dealt noncombat damage this turn"; "if you've activated a loyalty ability this turn"
    if (cond.oppNoncombat && !(side === "player" && s.oppNoncombat)) return false;
    if (cond.loyaltyActivated && !(side === "player" && s.loyaltyActivated)) return false;
    // Disappear (TMT): "if a permanent left the battlefield under your control this turn"
    if (cond.disappear && !(side === "player" && s.leftYours)) return false;
    // "as long as there's a Lesson card in your graveyard" (lessons: how many)
    if (cond.lessons && s[side].graveyard.filter((c) => subtypes(c).includes("Lesson")).length < cond.lessons) return false;
    // Void (EOE): "if a nonland permanent left the battlefield this turn or a spell was warped this turn"
    if (cond.void && !(side === "player" && (s.permLeft || s.warped))) return false;
    if (cond.controlsType && !s[side].battlefield.some((c) => subtypes(c).includes(cond.controlsType))) return false;   // "if you control a Spacecraft"
    // speed (CR 702.179): "Max speed — …" abilities (702.178a); the speed trigger's "if your speed is less than 4"
    if (cond.maxSpeed && !maxSpeed(s, side)) return false;
    if (cond.speedBelow4 && !(speedOf(s, side) < 4)) return false;
    // "if it was bargained" (CR 702.166c)
    if (cond.bargained && !(self && self.bargained)) return false;
    // Celebration (WOE): "two or more nonland permanents entered the battlefield under your control this turn"
    if (cond.celebration && !((side === "player" ? s.celebration : 0) >= 2)) return false;
    // "if its toughness is 3 or less" (of this creature, or of the creature this Aura enchants)
    if (cond.maxToughness != null) {
      const who = self && (self.aura ? find(s, self.attachedTo) : self);
      if (!who || toughness(who) > cond.maxToughness) return false;
    }
    // "as long as it has four or more oil counters on it"
    if (cond.selfCounters && !(self && ((self.counters || {})[cond.selfCounters.kind] || 0) >= cond.selfCounters.min)) return false;
    // "as long as it has two or fewer oil counters on it"; "if its power is 4 or greater"
    if (cond.selfCountersMax && !(self && ((self.counters || {})[cond.selfCountersMax.kind] || 0) <= cond.selfCountersMax.max)) return false;
    if (cond.selfPowerMin != null && !(self && power(find(s, self.id) || self) >= cond.selfPowerMin)) return false;
    // "if three or more artifacts entered the battlefield under your control this turn"
    if (cond.artifactsEntered != null && !((side === "player" ? s.artifactsEntered || 0 : 0) >= cond.artifactsEntered)) return false;
    // "only if this land entered this turn"
    if (cond.enteredThisTurn && !(self && self.enteredThisTurn)) return false;
    if (cond.notToken && !(self && !self.token)) return false;
    if (cond.redNoncombat != null && !((s.redNoncombat || 0) >= cond.redNoncombat)) return false;            // "red sources you controlled dealt 4 or more noncombat damage this turn"
    if (cond.attackedWith != null && !((s.attackedIds || []).length >= cond.attackedWith)) return false;   // "if you attacked with three or more creatures this turn"
    if (cond.instSorcCast != null && !((s.instSorcCast || 0) >= cond.instSorcCast)) return false;   // "four or more instant and sorcery spells this turn"
    if (cond.drawnMin != null && !(((s.drawn || {})[side] || 0) >= cond.drawnMin)) return false;
    if (cond.creatureDied && !s.creatureDied) return false;                    // "if a creature died this turn"
    if (cond.yourCreatureDied && !s.yourCreatureDied) return false;
    // ("attack with creatures with total power 12 or greater")
    if (cond.attackingPowerMin != null && !(((s.combat && s.combat.attackers) || []).map((id) => find(s, id)).filter(Boolean).reduce((t, c) => t + Math.max(power(c), 0), 0) >= cond.attackingPowerMin)) return false;
    if (cond.spent && !(self && ((self.colorsSpent || {})[cond.spent] || 0) >= 2)) return false;   // ("if {W}{W} was spent to cast it")
    // Monument to Perfection: "nine or more lands with different names among the basic, Sphere, and Locus lands you control"
    if (cond.diffLandsMin != null && new Set(s[side].battlefield.filter((c) => isLand(c) && (/\bbasic\b/i.test(c.type || "") || hasType(c, "Sphere") || hasType(c, "Locus"))).map((c) => c.name)).size < cond.diffLandsMin) return false;
    if (cond.handMin != null && !(s[side].hand.length >= cond.handMin)) return false;
    if (cond.exiledThisTurn && !s.exiledThisTurn) return false;   // ("if a card was put into exile this turn")
    if (cond.anotherSpellCast && !((s.spellsCast || 0) >= 2)) return false;   // ("if you've cast another spell this turn": this one counted)
    if (cond.exileMin != null && !(s.player.exile.length + s.opponent.exile.length + (s.player.exileUnknown || 0) + (s.opponent.exileUnknown || 0) >= cond.exileMin)) return false;   // ("seven or more cards in exile")
    // Preacher of the Schism: "the player with the most life or tied for most life" (your life not shown: you have the most)
    if (cond.oppMostLife && !(s.player.life != null && side === "player" && s.opponent.life >= s.player.life)) return false;
    if (cond.youMostLife && !(side === "player" && (s.player.life == null || s.player.life >= s.opponent.life))) return false;
    // Matzalantli: "four or more permanent types among cards in your graveyard"
    if (cond.permTypesMin != null && !(new Set(s[side].graveyard.flatMap((c) => ["artifact", "battle", "creature", "enchantment", "land", "planeswalker"].filter((ty) => new RegExp(`\\b${ty}\\b`, "i").test((faceOf(c, {}).type || "").split("—")[0])))).size >= cond.permTypesMin)) return false;
    if (cond.oppGraveyardMin != null && !(s[side === "player" ? "opponent" : "player"].graveyard.length + (s[side === "player" ? "opponent" : "player"].gyUnknown || 0) >= cond.oppGraveyardMin)) return false;   // ("an opponent has eight or more cards in their graveyard")   // ("only if you have seven or more cards in your hand")
    if (cond.chargeMin != null && !(self && ((self.counters || {}).charge || 0) >= cond.chargeMin)) return false;   // (a station symbol: "2+ | …")
    if (cond.firstCombat && (s.combatNumber || 1) !== 1) return false;   // ("if it's the first combat phase of the turn")
    if (cond.scriedOrSurveilled && !(side === "player" && s.scriedOrSurveilled)) return false;   // ("if you've scried or surveilled this turn")
    if (cond.heroAttackedOrEntered && !(side === "player" && (s.heroAttacked || s.heroEntered))) return false;   // (Avengers Assemble!)
    if (cond.creaturesDiedMin && (s.diedCount || 0) < cond.creaturesDiedMin) return false;   // ("if two or more creatures died this turn")
    if (cond.selfFlag && !(self && self[cond.selfFlag])) return false;
    if (cond.selfEquipped && !(self && isEquipped(s, self))) return false;
    if (cond.nonHandPlay && !s.nonHandPlay) return false;
    if (cond.selfCreature && !(self && isCreature(find(s, self.id) || self))) return false;   // ("if Hydro-Man is a creature")   // ("if you've played a land or cast a spell this turn from anywhere other than your hand")
    if (cond.tappedCreaturesMin != null && s[side].battlefield.filter((c) => isCreature(c) && c.tapped).length < cond.tappedCreaturesMin) return false;   // ("if you control two or more tapped creatures")                                   // ("as long as Cloud is equipped")
    if (cond.attachedAttacking && !(self && self.attachedTo && s.combat && s.combat.attackers.includes(self.attachedTo))) return false;   // ("As long as equipped creature is attacking")          // (an ability it gained: "This creature gains …")
    if (cond.oppLostLife && !s.oppLostLife) return false;
    if (cond.selfAttacking && !(self && s.combat && s.combat.attackers.includes(self.id))) return false;   // "if Tolsimir attacked this combat"
    if (cond.oppMoreLands && !(s[side === "player" ? "opponent" : "player"].battlefield.filter(isLand).length > s[side].battlefield.filter(isLand).length)) return false;
    if (cond.noSpellsCast && side === "player" && (s.spellsCast || 0) > 0) return false;   // "as long as you haven't cast a spell this turn"
    if (cond.giftPromised && !(self && self.giftPromised)) return false;
    if (cond.oppMoreCreatures && !(s[side === "player" ? "opponent" : "player"].battlefield.filter(isCreature).length > s[side].battlefield.filter(isCreature).length)) return false;
    if (cond.oppMoreHand && !((side === "player" ? s.opponent.handCount || 0 : s.player.hand.length) > (side === "player" ? s.player.hand.length : s.opponent.handCount || 0))) return false;
    if (cond.oppMoreLife && !(s.player.life != null && side === "player" && s.opponent.life > s.player.life)) return false;   // (your life not shown: it's never less)
    if (cond.youLostLife && !s.youLostLife) return false;
    if (cond.gainedAndLost && !(s.gainedLife && s.youLostLife)) return false;
    if (cond.curatorTypes && !(self && new Set(["player", "opponent"].flatMap((sd) => s[sd].exile.filter((c) => c.exiledBy === self.id)).flatMap((c) => CARD_TYPES.filter((t) => new RegExp(`\\b${t}\\b`, "i").test((faceOf(c, {}).type || "").split("—")[0])))).size >= cond.curatorTypes)) return false;
    if (cond.totalPowerMin != null && !(s[side].battlefield.filter(isCreature).reduce((a, c) => a + Math.max(power(c), 0), 0) >= cond.totalPowerMin)) return false;
    if (cond.lifeAboveStart != null && !(side === "player" && s.player.life != null && s.player.life - (s.startLife ?? s.player.life) >= cond.lifeAboveStart)) return false;
    if (cond.delirium6 && !(cardTypesIn(s, side) >= 6)) return false;
    if (cond.nonZombieDied && !s.nonZombieDied) return false;
    if (cond.noCountersWhenDied && self && Object.values(self.counters || {}).some((n) => n > 0)) return false;   // "if it had no counters on it"
    if (cond.landEntered && !(side === "player" && s.landEntered)) return false;
    if (cond.primeLands && ![2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31].includes(s[side].battlefield.filter(isLand).length)) return false;
    if (cond.oppLifeMax != null && !((s[side === "player" ? "opponent" : "player"].life ?? Infinity) <= cond.oppLifeMax)) return false;   // "as long as an opponent has 10 or less life"
    if (cond.evenCounters && self && Object.values(self.counters || {}).reduce((t, n) => t + n, 0) % 2 !== 0) return false;
    if (cond.pirateAndVehicle && !((s.attackedIds || []).some((id) => { const c = find(s, id); return c && hasType(c, "Pirate"); }) && (s.attackedIds || []).some((id) => { const c = find(s, id); return c && isVehicle(c); }))) return false;
    if (cond.castBoth && !(s.castCreature && s.castNoncreature)) return false;   // "if you've cast both a creature spell and a noncreature spell this turn"
    if (cond.siegeMode != null && !(self && self.siegeMode === cond.siegeMode)) return false;
    if (cond.anyHandMax1 && !(s.player.hand.length <= 1 || (s.opponent.handCount || 0) <= 1)) return false;   // "if a player has one or fewer cards in hand"
    if (cond.permanentsMin != null && !(s[side].battlefield.length >= cond.permanentsMin)) return false;                     // "if it isn't a token"
    if (cond.lifeGainedMin != null && !(side === "player" && (s.lifeGainedTotal || 0) >= cond.lifeGainedMin)) return false;   // "if you gained 5 or more life this turn"
    if (cond.selfCountersTotal != null && !(self && Object.values(self.counters || {}).reduce((t, n) => t + n, 0) >= cond.selfCountersTotal)) return false;
    if (cond.not && conditionHolds(s, cond.not, side, self)) return false;          // ("unless …": the condition must not hold)
    if (cond.handMax != null && !(s[side].hand.length <= cond.handMax || (side === "opponent" && (s.opponent.handCount || 0) <= cond.handMax))) return false;
    if (cond.oppControlsWalker && !s[side === "player" ? "opponent" : "player"].battlefield.some(isPlaneswalker)) return false;
    if (cond.controls) {
      const n = s[side].battlefield.filter((c) => objectIs(c, cond.controls.filter || {})).length;
      if (n < (cond.controls.min || 1)) return false;
    }
    return true;
  }
  // (delirium: the card types among cards in a player's graveyard, CR 205.2a)
  const CARD_TYPES = ["artifact", "battle", "creature", "enchantment", "instant", "kindred", "land", "planeswalker", "sorcery"];
  const cardTypesIn = (s, side) => new Set(s[side].graveyard.flatMap((c) =>
    [c, ...(c.faces && c.layout !== "transform" && c.layout !== "modal" && c.layout !== "omen" ? c.faces : [])].flatMap((f) => CARD_TYPES.filter((t) => new RegExp(`\\b${t}\\b`, "i").test((f.type || "").split("—")[0]))))).size;
  // (descend: the permanent cards — not tokens — in a player's graveyard)
  const permanentCardsIn = (s, side) => s[side].graveyard.filter((c) => isPermanent(faceOf(c, {}))).length;
  const objectIs = (c, f) => (!f.artifact || isArtifact(c)) && (!f.creature || isCreature(c)) && (!f.land || isLand(c)) &&
    (!f.treasure || isTreasure(c)) && (!f.type || hasType(c, f.type)) &&
    (!f.hasCounter || Object.values(c.counters || {}).some((n) => n > 0)) &&   // "a creature with a counter on it"
    (f.minPower == null || power(c) >= f.minPower) &&                         // ferocious: "a creature with power 4 or greater"
    // (card filters, mostly for cards in graveyards and libraries: "target enchantment card that isn't a God", "a
    // permanent card", "nonbattle", "an instant or sorcery card", "exactly two colors", "mana value 3 or less")
    (!f.enchantment || typeHas(c, /enchantment/i)) && (!f.nonland || !isLand(c)) && (!f.permanentCard || isPermanent(c)) &&
    (!f.notType || !hasType(c, f.notType)) && (!f.nonbattle || !isBattle(c)) && (!f.instantOrSorcery || typeHas(c, /instant|sorcery/i)) &&
    (f.exactlyColors == null || colorsOf(c).length === f.exactlyColors) && (f.notExactlyColors == null || colorsOf(c).length !== f.notExactlyColors) &&
    (f.maxMV == null || manaValue(c.cost) <= f.maxMV) && (f.minMV == null || manaValue(c.cost) >= f.minMV) &&
    (!f.instantSorceryOrDragon || typeHas(c, /instant|sorcery/i) || hasType(c, "Dragon")) && (!f.artifactOrCreature || isArtifact(c) || isCreature(c)) &&
    (!f.creatureOrLand || isCreature(c) || isLand(c)) && (!f.anyOfTypes || f.anyOfTypes.some((t) => hasType(c, t))) &&
    (!f.name || c.name === f.name) && (!f.aura || !!c.aura) && (!f.nonAura || !c.aura) && (!f.notId || c.id !== f.notId) && (!f.dragonOrOmen || hasType(c, "Dragon") || /\bOmen\b/.test(c.type || "")) && (!f.instantSorceryOrTamiyo || typeHas(c, /instant|sorcery/i) || (isPlaneswalker(c) && hasType(c, "Tamiyo"))) && (!f.toGyThisTurn || !!c.toGyThisTurn) && (!f.legendary || /\blegendary\b/i.test(c.type || "")) &&   // "a legendary creature card"
    (!f.anyOfKinds || isCreature(c) || isLand(c) || typeHas(c, /enchantment/i)) &&            // "a creature, enchantment, or land card"
    (!f.creatureOrBasicLand || isCreature(c) || (isLand(c) && /\bbasic\b/i.test(c.type || ""))) &&
    (!f.creatureOrVehicle || isCreature(c) || isVehicle(c)) && (!f.mountOrVehicleCard || isMount(c) || isVehicle(c)) &&
    (!f.gearhulk || ((isArtifact(c) || isCreature(c) || typeHas(c, /enchantment/i)) && manaValue(c.cost) <= 1)) &&
    (!f.balemurk || (isCreature(c) && !hasType(c, "Avatar")) || isPlaneswalker(c)) && (!f.adventureCard || c.layout === "adventure") && (!f.notName || c.name !== f.notName) &&
    (!f.artifactCreatureOrWalker || isArtifact(c) || isCreature(c) || isPlaneswalker(c)) && (!f.basicSphereLocus || (isLand(c) && (/\bbasic\b/i.test(c.type || "") || hasType(c, "Sphere") || hasType(c, "Locus")))) && (!f.equipmentOrInstSorc || hasType(c, "Equipment") || typeHas(c, /instant|sorcery/i)) && (!f.allTypes || f.allTypes.every((t) => hasType(c, t))) && (!f.creatureOrWalkerCard || isCreature(c) || isPlaneswalker(c)) && (!f.birdOrBasicLand || hasType(c, "Bird") || (isLand(c) && /\bbasic\b/i.test(c.type || ""))) && (!f.noncreatureCard || !isCreature(c)) && (!f.colorsAny || f.colorsAny.some((x) => colorsOf(c).includes(x))) && (!f.untapped || !c.tapped) && (!f.artifactOrEnchantmentCard || isArtifact(c) || (typeHas(c, /enchantment/i) && !c.aura)) && (!f.suspected || !!c.suspected) && (!f.planeswalker || isPlaneswalker(c)) && (!f.artifactOrEnchantmentAny || isArtifact(c) || typeHas(c, /enchantment/i));   // "artifact or non-Aura enchantment card"

  // The one place game events go: logged for the UI, and checked against every triggered ability that can
  // function (CR 603.2). Each matching ability triggers once per event (CR 603.2c) and waits in s.triggered
  // until a player would receive priority (CR 603.3).
  const BATCH = new WeakMap();
  function emit(s, e, ev, lookBack) {
    ev.push({ type: "event:" + e.type, id: e.obj && e.obj.id, side: e.side });
    if (!s.listens.includes(e.type)) return;                  // nothing in this puzzle triggers on it (see listen)
    // a spell's mana value (X included, CR 202.3e) and which multicolored spell of yours this turn it is
    if (e.type === "cast" && e.obj) {
      e.mv = manaValue(withX(e.obj.printedCost != null ? e.obj.printedCost : e.obj.cost, e.x));
      e.converge = Object.keys(e.obj.colorsSpent || {}).length;   // (the number of colors of mana spent to cast it)
      e.blueSymbols = (((e.obj.printedCost != null ? e.obj.printedCost : e.obj.cost) || "").match(/\{[^}]*U[^}]*\}/g) || []).length;   // (Namor: "with one or more blue mana symbols in its mana cost")
      if (e.side === "player" && colorsOf(e.obj).length > 1) e.multiNumber = s.multiCast = (s.multiCast || 0) + 1;
      if (e.side === "player" && typeHas(e.obj, /instant|sorcery/i)) e.instSorcNumber = s.instSorcCast = (s.instSorcCast || 0) + 1;
      if (e.side === "player") { if (typeHas(e.obj, /creature/i)) s.castCreature = true; else s.castNoncreature = true; }
      if (e.side === "player" && s.nextCreatureHaste && typeHas(e.obj, /creature/i)) { e.obj.hasteOnEnter = true; delete s.nextCreatureHaste; }   // (Summon: Brynhildr)
      if (e.side === "player" && typeHas(e.obj, /creature/i) && /\blegendary\b/i.test(e.obj.type || "")) s.legendaryCreatureCast = true;
      if (e.side === "player" && e.fromHand === false) s.nonHandPlay = true;   // ("if you've â€¦ cast a spell this turn from anywhere other than your hand")
      if (e.obj.modes) e.modal = true;                         // ("Whenever you cast a modal spell")
      if (e.side === "player") (s.bold || []).forEach((b) => { (s.lki = s.lki || {})[b.srcId] = b.src; s.triggered.push({ side: "player", name: b.src.name, srcId: b.srcId, td: defId(BOLD_T), event: {} }); });
      if (e.side === "player") {   // (Alania: "the first instant spell, the first sorcery spell, or the first Otter spell other than Alania you've cast this turn")
        const k = (key, yes) => { if (!yes) return false; s[key] = (s[key] || 0) + 1; return s[key] === 1; };
        e.alaniaFirst = [k("instantsCast", typeHas(e.obj, /instant/i)), k("sorceriesCast", typeHas(e.obj, /sorcery/i)), k("ottersCast", hasType(e.obj, "Otter") && !e.obj.alania)].some(Boolean);
      }
    }
    if (e.type === "enters") refresh(s);                       // (its power as it is on the battlefield, for "power 2 or less")
    // Elesh Norn, Mother of Machines / Drivnod, Carnage Dominus: "If a permanent entering (a creature dying) causes a
    // triggered ability of a permanent you control to trigger, that ability triggers an additional time" (each one adds
    // one); Elesh Norn: "Permanents entering don't cause abilities of permanents your opponents control to trigger."
    // (a dying Drivnod still counts for creatures dying with it: leaves-the-battlefield triggers look back, CR 603.10a)
    if (e.type === "cast" && e.obj && e.side === "player") for (const t of triggersOf(compile(e.obj)).filter((t) => t.castSelf)) {
      if (t.if && !conditionHolds(s, t.if, "player", e.obj)) continue;
      (s.lki = s.lki || {})[e.obj.id] = e.obj;
      s.triggered.push({ side: "player", name: e.obj.name, srcId: e.obj.id, td: defId(t), event: { id: e.obj.id, mv: e.mv, count: e.spellNumber } });
    }
    const live = (side, key) => (lookBack || battlefieldNow(s)).filter((x) => x.side === side && x.card[key] && !(x.card.st && x.card.st.lost)).length;
    const doubling = e.type === "enters" ? "enterTriggersTwice" : e.type === "dies" ? "dieTriggersTwice" : null;
    for (const { card, side, zone } of triggerSources(s, lookBack)) {
      const onField = (zone || "battlefield") === "battlefield";
      if (e.type === "enters" && onField && live(side === "player" ? "opponent" : "player", "enterTriggersTwice")) continue;
      if (e.type === "enters" && e.obj && (isArtifact(e.obj) || isCreature(e.obj)) && battlefieldNow(s).some(({ card: x }) => x.thrull && !(x.st && x.st.lost))) continue;   // (Doorkeeper Thrull)
      const times = 1 + (doubling && onField ? live(side, doubling) : 0) + (onField && isCreature(card) && power(card) <= 2 ? live(side, "delney") : 0) +
        (onField && isCreature(card) && /\blegendary\b/i.test(card.type || "") ? live(side, "legendaryTriggersTwice") : 0) +
        (onField && isCreature(card) && hasType(card, "Ninja") ? live(side, "ninjaTriggersTwice") : 0) +   // (Splinter, Radical Rat)
        // (Cloud, Midgar Mercenary: Cloud's and attached Equipment's triggers while equipped; Traveling Chocobo: a land or Bird
        // entering; The Masamune: a creature dying causes a trigger of the equipped creature or of your emblem)
        (onField && card.cloudMidgar && isEquipped(s, card) ? 1 : 0) + (onField && card.equip && card.attachedTo && (find(s, card.attachedTo) || {}).cloudMidgar ? 1 : 0) +
        (e.type === "enters" && onField && e.obj && e.side === side && (isLand(e.obj) || hasType(e.obj, "Bird")) ? live(side, "travelingChocobo") : 0) +
        (e.type === "dies" && ((onField && isCreature(card) && (lookBack || battlefieldNow(s)).some((x) => x.card.masamune && x.card.attachedTo === card.id)) || (zone === "command" && s[side].battlefield.some((x) => x.masamune && x.attachedTo && find(s, x.attachedTo)))) ? 1 : 0) +
        (onField && isCreature(card) ? (lookBack || battlefieldNow(s)).filter((x) => x.side === side && x.card.roamingThrone && x.card.chosenType && x.card.id !== card.id && hasType(card, x.card.chosenType) && !(x.card.st && x.card.st.lost)).length : 0) +
        (onField && ["attacks", "attacksAlone", "youAttack"].includes(e.type) ? s[side].battlefield.filter((x) => x.siegeMode === 0 && x.windcrag && !(x.st && x.st.lost)).length : 0) +
        (onField ? (lookBack || battlefieldNow(s)).filter((x) => x.side === side && x.card.allTriggersTwiceDoor != null && x.card.unlocked && x.card.unlocked[x.card.allTriggersTwiceDoor]).length : 0);
      for (const t of triggersOf(card)) {
        // CR 113.6: an ability works only in the zones it says (the battlefield unless it says otherwise)
        if (!(t.zones || ["battlefield"]).includes(zone || "battlefield")) continue;
        if (!eventMatches(t, card, side, e)) continue;
        if (t.if && !conditionHolds(s, t.if, side, card)) continue;        // CR 603.4: checked as it triggers
        if (t.maxSpeed && !maxSpeed(s, side)) continue;                     // "Max speed — [triggered ability]" (CR 702.178a)
        // an ability an Equipment gives ("Equipped creature has 'Whenever you cast …'"): only while it's attached
        if (t.equipped && !(card.attachedTo && find(s, card.attachedTo))) continue;
        // CR 702.191a: increment — "if this permanent is a creature and the amount of mana spent to cast that spell is
        // greater than this creature's power or this creature's toughness"
        if (t.increment && !(isCreature(card) && ((e.spent || 0) > power(card) || (e.spent || 0) > toughness(card)))) continue;
        // ("Whenever one or more creatures die": once for those dying at the same time — one look-back snapshot)
        if (t.batch && e.batch != null) { const k = `${e.batch}|${defId(t)}|${card.id}`; if ((s.batchSeen || []).includes(k)) continue; s.batchSeen = [...(s.batchSeen || []), k]; }
        if (t.batch && lookBack) { const seen = BATCH.get(lookBack) || new Set(), k = `${defId(t)}|${card.id}`; if (seen.has(k)) continue; seen.add(k); BATCH.set(lookBack, seen); }
        // "This ability triggers only once each turn"
        if (t.oncePerTurn) { const k = `${card.id}#${defId(t)}`; if ((s.once || []).includes(k)) continue; s.once = [...(s.once || []), k]; }
        // a source that already left (a look-back trigger, like a dying Blood Artist's): keep its last known information
        if ((zone || "battlefield") === "battlefield" && !find(s, card.id)) (s.lki = s.lki || {})[card.id] = lastKnown(card);
        for (let k = 0; k < times; k++) {
          s.triggered.push({ side, name: card.name, srcId: card.id, td: defId(t), ...(zone && zone !== "battlefield" ? { zone } : {}), ...(card.xPaid ? { x: card.xPaid } : {}),
            event: { id: e.obj && e.obj.id, side: e.side, controller: e.controller, ...(e.type === "dies" && e.obj.counters ? { counters: e.obj.counters } : {}), ...(e.ids ? { ids: e.ids } : {}), ...(e.to ? { to: e.to } : {}), ...(e.count != null ? { count: e.count } : {}), ...(e.vehicle ? { vehicle: e.vehicle } : {}), ...(e.batchNo != null ? { batchNo: e.batchNo } : {}), ...(e.x != null ? { x: e.x } : {}), ...(e.obj && e.obj.cost != null ? { objMV: manaValue(e.obj.cost) } : {}),
              ...(e.spent != null ? { spent: e.spent } : {}), ...(e.mv != null ? { mv: e.mv } : {}), ...(e.blueSymbols ? { blueSymbols: e.blueSymbols } : {}), ...(e.converge ? { converge: e.converge } : {}), ...(e.host ? { host: e.host } : {}),
              // (the object's power and toughness as it last existed: "equal to that creature's power")
              ...(e.obj && isCreature(e.obj) ? { objPower: Math.max(0, e.obj.lastPower ?? power(e.obj)), objToughness: Math.max(0, e.obj.lastToughness ?? toughness(e.obj)) } : {}) } });
        }
      }
    }
  }

  // The spells you've cast this turn ("your second spell each turn"; "other spells you've cast this turn"): returns
  // the number of the spell just cast
  const countSpell = (s, side) => (side === "player" ? (s.spellsCast = (s.spellsCast || 0) + 1) : 0);
  // CR 700.13: you commit a crime as you cast a spell, activate an ability, or put a triggered ability on the stack that
  // targets an opponent, something an opponent controls, or a card in an opponent's graveyard
  function commitCrime(s, target, side, ev) {
    if (side !== "player" || target == null) return;
    const ids = [target].flat(3).filter((x) => x != null);
    const theirs = (id) => id === "opp" || s.opponent.battlefield.some((c) => c.id === id) || s.opponent.graveyard.some((c) => c.id === id);
    if (!ids.some(theirs)) return;
    s.crimes = (s.crimes || 0) + 1;
    ev.push({ type: "crime" });
    emit(s, { type: "crime", side: "player" }, ev);
  }

  /* ---------- targets ---------- */
  // Does this creature fit a target restriction ("nonblack", "with flying", "attacking", "an opponent controls", …)?
  // "you" and "an opponent" are seen from `viewer`, the player controlling the spell or ability (CR 109.5)
  // CR 700.9: a modified creature — Equipment attached to it, Auras its controller controls attached to it, or counters on it
  const modifiedIn = (s, c, side) => Object.values(c.counters || {}).some((n) => n > 0) ||
    [...s.player.battlefield.map((x) => [x, "player"]), ...s.opponent.battlefield.map((x) => [x, "opponent"])].some(([x, sd]) => x.attachedTo === c.id && (x.equip || (x.aura && sd === side)));
  function matches(s, c, f, viewer = "player") {
    if (!f) return true;
    const side = s.player.battlefield.includes(c) ? "player" : "opponent";
    const inCombat = (which) => s.combat && (which === "attacking" ? s.combat.attackers.includes(c.id)
      : Object.values(s.combat.blocks || {}).flat().includes(c.id));
    if (f.controller === "you" && side !== viewer) return false;
    if (f.controller === "opponent" && side === viewer) return false;
    if (f.colors && !f.colors.some((x) => colorsOf(c).includes(x))) return false;
    if (f.notColors && f.notColors.some((x) => colorsOf(c).includes(x))) return false;
    if (f.kw && !has(c, f.kw)) return false;
    if (f.noKw && has(c, f.noKw)) return false;
    if (f.tapped && !c.tapped) return false;
    if (f.untapped && c.tapped) return false;
    if (f.attacking && !inCombat("attacking")) return false;
    if (f.blocking && !inCombat("blocking")) return false;
    if (f.attackingOrBlocking && !inCombat("attacking") && !inCombat("blocking")) return false;
    if (f.maxPower != null && power(c) > f.maxPower) return false;
    if (f.minPower != null && power(c) < f.minPower) return false;
    if (f.maxToughness != null && toughness(c) > f.maxToughness) return false;   // "with toughness 5 or less"
    if (f.faceDown && !c.faceDown) return false;
    if (f.artifact && !isArtifact(c)) return false;
    if (f.nonArtifact && isArtifact(c)) return false;
    if (f.subtype && !subtypes(c).includes(f.subtype)) return false;      // "Enchant Forest"
    if (f.toxic && !toxicOf(c)) return false;                            // "creature you control with toxic"
    if (f.noncreature && isCreature(c)) return false;                     // "target noncreature artifact"
    if (f.artifactOrEnchantment && !isArtifact(c) && !typeHas(c, /enchantment/i)) return false;   // "target artifact or enchantment"
    if (f.artifactOrCreature && !isArtifact(c) && !isCreature(c)) return false;                     // "target artifact or creature"
    if (f.equipped && ![...s.player.battlefield, ...s.opponent.battlefield].some((e) => e.equip && e.attachedTo === c.id)) return false;   // "equipped creatures"
    if (f.mountOrVehicle && !isMount(c) && !isVehicle(c)) return false;   // "Mounts and Vehicles you control"
    if (f.spacecraftOrPlanet && !subtypes(c).some((t) => t === "Spacecraft" || t === "Planet")) return false;
    if (f.nonland && typeHas(c, /\bland\b/i)) return false;                                      // "target nonland permanent"
    if (f.creatureOrWalker && !isCreature(c) && !isPlaneswalker(c)) return false;
    // "a modified creature" (CR 700.9: Equipment attached to it, Auras you control attached to it, or counters on it)
    if (f.modified && !modifiedIn(s, c, side)) return false;                 // "target creature or planeswalker"
    if (f.creatureOrEnchantment && !isCreature(c) && !typeHas(c, /enchantment/i)) return false;   // "target creature or enchantment"
    if (f.hasCounter && !(((c.counters || {})[f.hasCounter === true ? "+1/+1" : f.hasCounter] || 0) > 0)) return false;   // "with +1/+1 counters on them"
    if (f.enteredThisTurn && !c.enteredThisTurn) return false;                                   // "target creature that entered this turn"
    if (f.token && !c.token) return false;                                                       // "creature tokens you control"
    if (f.notExactlyColors != null && colorsOf(c).length === f.notExactlyColors) return false;  // "that isn't exactly two colors"
    if (f.nonbattle && isBattle(c)) return false;
    if (f.land && !isLand(c)) return false;                                                       // "lands you control"
    if (f.colorless && colorsOf(c).length) return false;
    if (f.creatureWalkerOrVehicle && !isCreature(c) && !isPlaneswalker(c) && !isVehicle(c)) return false;
    if (f.artifactCreatureOrWalker && !isArtifact(c) && !isCreature(c) && !isPlaneswalker(c)) return false;
    if (f.tokenOrType && !c.token && !hasType(c, f.tokenOrType)) return false;              // "that's a token or a Rabbit"
    if (f.anyOfTypes && !f.anyOfTypes.some((t) => hasType(c, t))) return false;               // "outlaws" (Assassins, Mercenaries, Pirates, Rogues, Warlocks)                                        // "each colorless creature you control"
    if (f.aura && !c.aura) return false;                                                         // "the number of Auras you control"
    if (f.creatureEnchantmentOrWalker && !isCreature(c) && !typeHas(c, /enchantment/i) && !isPlaneswalker(c)) return false;
    if (f.notTokenName && s[viewer].battlefield.some((x) => x.token && x.name === c.name)) return false;   // "doesn't have the same name as a token you control"
    // "enchanted creatures you control" / "creatures … enchanted by Auras you control"
    const auras = (f.enchanted || f.enchantedByYours) ? [...s.player.battlefield.map((x) => [x, "player"]), ...s.opponent.battlefield.map((x) => [x, "opponent"])]
      .filter(([x, sd]) => x.aura && x.attachedTo === c.id && (!f.enchantedByYours || sd === viewer)) : null;
    if (auras && !auras.length) return false;
    if (f.tapped === false && c.tapped) return false;
    if (f.attackedThisTurn && !(s.attackedIds || []).includes(c.id)) return false;               // "each creature that attacked this turn"
    if (f.nontoken && c.token) return false;
    if (f.anyCounter && !Object.values(c.counters || {}).some((n) => n > 0)) return false;     // "a counter on target permanent"
    if (f.maxManaValue != null && manaValue(c.cost) > f.maxManaValue) return false;   // "with mana value X or less"
    if (f.subtypeIs && !hasType(c, f.subtypeIs)) return false;                                    // "a Cat you control"
    if (f.basic && !/\bbasic\b/i.test(c.type || "")) return false;
    if (f.type && !hasType(c, f.type)) return false;                                              // "other Ninjas you control"
    if (f.nonbasic && /\bbasic\b/i.test(c.type || "")) return false;
    if (f.multicolored && colorsOf(c).length < 2) return false;
    if (f.exactMV != null && manaValue(c.cost) !== f.exactMV) return false;                    // "with mana value X"
    if (f.exactPT && !(power(c) === f.exactPT[0] && toughness(c) === f.exactPT[1])) return false;   // "target 1/1 creature"
    if (f.owner === "you" && (c.owner || side) !== viewer) return false;                         // "target permanent you own"                                    // "each multicolored permanent you control"                              // "target nonbasic land"
    if (f.minMV != null && manaValue(c.cost) < f.minMV) return false;                            // "with mana value 3 or greater"
    if (f.legendary && !/\blegendary\b/i.test(c.type || "")) return false;
    if (f.nonlegendary && /\blegendary\b/i.test(c.type || "")) return false;
    if (f.enchantmentOnly && !typeHas(c, /enchantment/i)) return false;
    if (f.creature === true && !isCreature(c)) return false;
    if (f.uniqueNameYours && s[viewer].battlefield.some((x) => x !== c && x.name === c.name)) return false;
    if (f.notId && c.id === f.notId) return false;
    if (f.maxMV != null && manaValue(c.cost) > f.maxMV) return false;
    return true;
  }

  // Can this source (controlled by srcSide) target that creature? Shroud, hexproof (against the
  // other player), and protection stop it.
  function canTarget(s, src, srcSide, id) {
    if (id === "opp" || id === "you") return true;
    const t = find(s, id);
    if (!t) return false;
    if (has(t, "shroud")) return false;
    if (has(t, "hexproof") && sideOf(s, t) !== srcSide) return false;
    // CR 702.11d: "hexproof from [quality]" — not by the other player's spells or abilities with that quality
    // ("can't be the target of nongreen spells your opponents control or abilities from nongreen sources": nongreen)
    if (sideOf(s, t) !== srcSide && has(t, "hexproof from multicolored") && colorsOf(src).length > 1) return false;
    if (sideOf(s, t) !== srcSide && has(t, "hexproof from monocolored") && colorsOf(src).length === 1) return false;
    if (sideOf(s, t) !== srcSide && keywords(t).some((k) => { const m = /^hexproof from (non)?(white|blue|black|red|green)$/.exec(k);
      return m && (m[1] ? !colorsOf(src).includes(COLOR_WORD[m[2]]) : colorsOf(src).includes(COLOR_WORD[m[2]])); })) return false;
    return !protectedFrom(t, src);
  }

  // Legal targets for a targeted effect of `src` ("any" | "creature" | "player" | "opponent-creature",
  // plus an optional restriction): creature ids and/or "opp"/"you". A creature's enters trigger can
  // target the creature itself. `side` is who controls the effect (the opponent, for its triggers).
  function targetsFor(s, src, kind = src.targets, filter = src.targetFilter, side = "player") {
    if (!kind) return [];
    // "another target creature": anything but the source itself
    if (filter && filter.other) { const { other, ...rest } = filter; return targetsFor(s, src, kind, rest, side).filter((id) => id !== src.id); }
    // other permanents (Auras on lands, artifacts…), and creature cards in your graveyard (reanimation)
    if (kind === "land" || kind === "artifact" || kind === "permanent") {
      const test = kind === "land" ? isLand : kind === "artifact" ? isArtifact : () => true;
      return [...s.player.battlefield, ...s.opponent.battlefield].filter(test)
        .filter((c) => matches(s, c, filter, side) && canTarget(s, src, side, c.id) && c.id !== src.id).map((c) => c.id);
    }
    // "target activated or triggered ability" (Tishana's Tidebinder: anyone's; mana abilities never use the stack)
    if (kind === "trigger-or-instsorc-spell") return [...s.stack.map((x, i) => [x, s.stack.length - 1 - i]).filter(([x]) => x.kind === "trigger").map(([, k]) => `stack:${k}`), ...targetsFor(s, src, "spell", { instantOrSorcery: true }, side)];
    if (kind === "ability-or-noncreature-spell") return [...targetsFor(s, src, "ability-any", filter, side), ...targetsFor(s, src, "spell", { noncreatureCard: true }, side)];
    if (kind === "ability-any") return s.stack.map((x, i) => [x, s.stack.length - 1 - i]).filter(([x]) => x.kind === "trigger" || x.kind === "ability").map(([, k]) => `stack:${k}`);
    // "other target creatures from the battlefield and/or creature cards from graveyards"
    if (kind === "creature-or-gy-creature") return [...targetsFor(s, src, "creature", filter, side), ...[...s.player.graveyard, ...s.opponent.graveyard].filter((c) => isCreature(faceOf(c, {}))).map((c) => c.id)];
    // "target creature that crewed it this turn"
    if (kind === "crewer-of-self") { const me = find(s, src.id) || src; return s[side].battlefield.filter((c) => isCreature(c) && (me.crewedBy || []).includes(c.id) && canTarget(s, src, side, c.id)).map((c) => c.id); }
    // "target activated or triggered ability you control" (Vantress Visions): "stack:<position from the bottom>"
    if (kind === "ability-yours") return s.stack.map((x, i) => [x, s.stack.length - 1 - i]).filter(([x]) => (x.kind === "trigger" && x.side === side) || (x.kind === "ability" && (x.ctx || {}).side === side)).map(([, k]) => `stack:${k}`);
    // "target card you own in exile that has an Adventure" / "… you don't own" (owner: "you" or "notYou")
    if (kind === "exile-card") { const f = filter || {}, other = side === "player" ? "opponent" : "player";
      return [...(f.owner !== "notYou" ? s[side].exile : []), ...(f.owner !== "you" ? s[other].exile : [])].filter((c) => !c.unknown && objectIs(faceOf(c, {}), f)).map((c) => c.id); }
    // "target card exiled with Quintorius"
    if (kind === "exiled-by-self") return [...s.player.exile, ...s.opponent.exile].filter((c) => c.exiledBy === src.id && objectIs(faceOf(c, {}), filter || {})).map((c) => c.id);
    // "target spell" (one of yours: the opponent casts none here) — "copy target spell"; filter: its card filter
    if (kind === "spell-or-permanent") return [...targetsFor(s, src, "permanent", filter, side), ...targetsFor(s, src, "spell", filter, side)];
    if (kind === "spell") return s.stack.filter((x) => x.kind === "spell" && x.id !== src.id && objectIs(faceOf(x.card, x.a), filter || {})).map((x) => x.id);
    if (kind === "graveyard-creature") return s[side].graveyard.filter(isCreature).map((c) => c.id);
    // a card in your graveyard: "target creature or Equipment card with mana value less than Nahiri's loyalty"
    if (kind === "graveyard-card") {
      const f = filter || {}, me = find(s, src.id) || src;
      // ("target card from a graveyard": anyGraveyard — either player's)
      return (f.anyGraveyard ? [...s.player.graveyard, ...s.opponent.graveyard] : f.oppGraveyard ? s[side === "player" ? "opponent" : "player"].graveyard : s[side].graveyard).filter((c) => { const g = faceOf(c, {});
        return objectIs(g, f) && (!f.creatureOrEquipment || isCreature(g) || subtypes(g).includes("Equipment")) &&
          (!f.mvBelowLoyalty || manaValue(g.cost) < loyaltyOf(me)) && (!f.maxMVSpent || manaValue(g.cost) <= (me.spentToCast || 0)) && (!f.mvAtMostDescend || manaValue(g.cost) <= permanentCardsIn(s, side)); }).map((c) => c.id);
    }
    if (kind === "opponent") return [side === "player" ? "opp" : "you"];
    const all = [...s.player.battlefield, ...s.opponent.battlefield].filter(isCreature);
    const creatures = (kind === "opponent-creature" ? s[side === "player" ? "opponent" : "player"].battlefield.filter(isCreature) : all)
      .filter((c) => matches(s, c, filter, side) && canTarget(s, src, side, c.id)).map((c) => c.id);
    if (kind === "creature" || kind === "opponent-creature") return creatures;
    // "target creature or Vehicle": also Vehicles that aren't creatures right now
    if (kind === "creature-or-vehicle") {
      const vehicles = [...s.player.battlefield, ...s.opponent.battlefield].filter((c) => isVehicle(c) && !isCreature(c))
        .filter((c) => matches(s, c, filter, side) && canTarget(s, src, side, c.id)).map((c) => c.id);
      return [...creatures, ...vehicles];
    }
    if (kind === "player") return ["opp", "you"];
    // planeswalkers (not also creatures): "any target" (CR 115.4) and "target creature or planeswalker"
    const walkers = [...s.player.battlefield, ...s.opponent.battlefield].filter((c) => isPlaneswalker(c) && !isCreature(c))
      .filter((c) => matches(s, c, filter, side) && canTarget(s, src, side, c.id)).map((c) => c.id);
    if (kind === "creature-or-planeswalker") return [...creatures, ...walkers];
    if (kind === "planeswalker") return [...s.player.battlefield, ...s.opponent.battlefield].filter(isPlaneswalker)
      .filter((c) => matches(s, c, filter, side) && canTarget(s, src, side, c.id)).map((c) => c.id);
    // battles (not also creatures): "any target" includes them (CR 115.4); "target creature, planeswalker, or battle";
    // "target battle or opponent"
    const battles = [...s.player.battlefield, ...s.opponent.battlefield].filter((c) => isBattle(c) && !isCreature(c))
      .filter((c) => matches(s, c, filter, side) && canTarget(s, src, side, c.id) && c.id !== src.id).map((c) => c.id);
    if (kind === "creature-planeswalker-battle") return [...creatures, ...walkers, ...battles];
    if (kind === "battle-or-opponent") return [...battles, side === "player" ? "opp" : "you"];
    // "target opponent, creature an opponent controls, or planeswalker an opponent controls" (All Will Be One)
    if (kind === "opponent-or-theirs") { const o = side === "player" ? "opponent" : "player"; return [side === "player" ? "opp" : "you", ...[...creatures, ...walkers].filter((id) => s[o].battlefield.some((c) => c.id === id))]; }
    // "target planeswalker that player controls or battle that player protects" (the opponent's walkers; your Sieges)
    if (kind === "planeswalker-or-battle") return [...walkers.filter((id) => s[side === "player" ? "opponent" : "player"].battlefield.some((c) => c.id === id)), ...battles];
    return [...creatures, ...walkers, ...battles, "opp", "you"];
  }

  const sacrificeOptions = (s, card) =>
    card.sacrifice === "creature" ? s.player.battlefield.filter(isCreature).map((c) => c.id)
    : card.sacrifice === "damageDealer" ? s.player.battlefield.filter((c) => isCreature(c) && (s.damageDealers || []).includes(c.id)).map((c) => c.id) : [];   // ("a creature that dealt damage this turn")
  // Blight N (701.x): put N -1/-1 counters on a creature you control, any of them (it may die from it)
  const blightOptions = (s) => s.player.battlefield.filter(isCreature).map((c) => c.id);
  // Bargain (CR 702.166a): an artifact, enchantment, or token you control may be sacrificed as the spell is cast
  const bargainOptions = (s) => s.player.battlefield.filter((c) => isArtifact(c) || typeHas(c, /enchantment/i) || c.token).map((c) => c.id);
  // Collect evidence N (CR 701.59a): sets of cards in your graveyard with total mana value N or more. Only sets where
  // every card is needed (exiling more never helps in a puzzle — except for "whenever cards leave your graveyard", not
  // modeled), sorted by id so the same set is one option.
  function evidenceOptions(s, n) {
    const gy = s.player.graveyard.map((c) => ({ id: c.id, mv: manaValue(faceOf(c, {}).cost) })).filter((x) => x.mv > 0);
    return subsets(gy).filter((l) => { const t = l.reduce((a, x) => a + x.mv, 0); return t >= n && l.every((x) => t - x.mv < n); })
      .map((l) => l.map((x) => x.id).sort());
  }
  // Behold a Goblin: choose a Goblin you control or reveal a Goblin card from your hand (not the spell itself)
  const beholdOptions = (s, f) => [...s.player.battlefield, ...s.player.hand]
    .filter((c) => c.id !== f.id && hasType(c, f.behold.type)).map((c) => c.id);
  // The creatures that could help pay for a convoke spell: your untapped ones
  const convokeHelpers = (s) => s.player.battlefield.filter((c) => isCreature(c) && !c.tapped).map((c) => c.id);
  // Craft materials (CR 702.167b): other permanents you control or cards in your graveyard that fit the description
  const craftOptions = (s, card, craft) => {
    const cands = (f) => [...s.player.battlefield.filter((c) => c.id !== card.id && objectIs(c, f || {}) && (!craft.withAbilities || abilitiesOf(c).length)),
      ...s.player.graveyard.filter((c) => objectIs(faceOf(c, {}), f || {}) && (!craft.withAbilities || (faceOf(c, {}).abilities || []).length))].map((c) => c.id);
    // ("Craft with a Dinosaur, a Merfolk, a Pirate, and a Vampire": one different material for each)
    if (craft.types) {
      let sets = [[]];
      craft.types.forEach((ty) => { const ids = cands({ ...(craft.filter || {}), type: ty }); sets = sets.flatMap((l) => ids.filter((id) => !l.includes(id)).map((id) => [...l, id])); });
      const seen = new Set(); return sets.filter((l) => { const k = [...l].sort().join(); return !seen.has(k) && seen.add(k); });
    }
    // ("Craft with four or more nonlands with activated abilities": every set of at least that many)
    if (craft.min) return subsets(cands(craft.filter)).filter((l) => l.length >= craft.min);
    return cands(craft.filter);
  };
  // The creatures that could crew this Vehicle: your other untapped creatures
  const crewHelpers = (s, vehicle) => convokeHelpers(s).filter((id) => id !== vehicle.id);
  // Crews worth trying (solver): sets with enough power where no creature could be left out. A creature tapped for
  // nothing only matters if something cares about creatures becoming tapped, and then every set is tried.
  function crewChoices(s, vehicle, n) {
    const ids = crewHelpers(s, vehicle), pw = (id) => crewPower(find(s, id));
    const enough = subsets(ids).filter((l) => l.reduce((t, id) => t + pw(id), 0) >= n);
    // (… or about creatures crewing: "whenever this creature crews a Vehicle")
    if (s.listens.includes("becomesTapped") || s.listens.includes("crews")) return enough;
    return enough.filter((l) => l.every((id) => l.reduce((t, x) => t + pw(x), 0) - pw(id) < n));
  }
  // The payment options for casting f as `a`: convoke helpers (all must help), or any of them when not chosen yet
  // (a permanent sacrificed for bargain can't also be a mana source — a Treasure is sacrificed for its mana)
  // (the spell's own targets among your permanents are left untapped when other mana can pay — you'd tap other lands
  // for an earthbend aimed at a land)
  const castPayment = (s, f, a, except) => {
    const keep = [a.target].flat(3).filter((id) => id && s.player.battlefield.some((c) => c.id === id));
    return (keep.length && castPaymentWith(s, f, a, except, keep)) || castPaymentWith(s, f, a, except, []);
  };
  const castPaymentWith = (s, f, a, except, keep) =>
    // ("You may cast this spell as though it had flash if you pay {2} more": flashFor, paid only outside sorcery timing)
    bestPayment(s, reducedCost(s, f, costOf(f, a) + (f.flashFor && !sorceryTime(s) ? f.flashFor : ""), a), { except, exclude: [...(a.bargain != null ? [a.bargain] : []), ...(a.tapFor != null ? [a.tapFor] : []), ...(a.teamwork != null ? [].concat(a.teamwork) : []), ...keep], lifePips: has(f, "compleated") ? a.lifePips || 0 : undefined, convoke: spellConvoke(s, f) ? (a.convoke == null ? "any" : a.convoke) : undefined, forWhat: { spell: f } });

  // Every choice of targets for a spec: one target, or "up to two" (any distinct combination)
  function targetChoices(list, count) {
    if (!count || count.max === 1) return list.map((t) => t);
    const out = [];
    (function pick(start, chosen) {
      if (chosen.length >= count.min && chosen.length) out.push([...chosen]);
      if (chosen.length === count.max) return;
      for (let i = start; i < list.length; i++) pick(i + 1, [...chosen, list[i]]);
    })(0, []);
    return out;
  }

  /* ---------- effects ---------- */
  // A chosen color and X fill in an effect: "protection from {color}", damage "X"
  function fillIn(eff, { color, x } = {}) {
    if (!eff) return eff;
    let json = JSON.stringify(eff);
    if (color) json = json.replace(/\{color\}/g, WORD_OF[color]).replace(/"\{colorCode\}"/g, `"${color}"`);
    return JSON.parse(json, (k, v) => (v === "X" ? x || 0 : v === "-X" ? -(x || 0) : v));   // ("gets -X/-X")
  }

  function relativeTo(to, ctx) {
    if (to === "opp") return ctx.side === "opponent" ? "you" : "opp";
    if (to === "eventObject") return ctx.event && ctx.event.id;
    if (to === "eventController") return ctx.event && ctx.event.controller;
    if (to === "enchanted") return ctx.src && ctx.src.attachedTo;      // "enchanted creature" (an Aura's own trigger)
    if (to === "eventVehicle") return ctx.event && ctx.event.vehicle;  // "that Mount or Vehicle" (it was crewed / saddled)
    return to;
  }

  // ctx: { src (the card the effect comes from, as it was), side, sacPower, selfId, x, event (what triggered it) }
  const GLOBAL = ["damageAll", "destroyAll", "untapAll", "proliferate", "scry", "surveil"];
  function applyEffect(s, eff, target, ctx, ev) {
    if (!eff) return;
    if (eff.untargeted) target = undefined;                     // (a part that doesn't use the ability's target)
    if (eff.useSlot != null) { const t = [].concat(target || [])[eff.useSlot]; if (t != null) applyEffect(s, eff.effect, t, ctx, ev); return; }   // (one target group's part)
    // "incubate 3 X times" (repeat: a number, or "selfX": the X paid for this permanent)
    if (eff.repeat != null) {
      const { repeat, ...once } = eff;
      const n = repeat === "selfX" ? ((find(s, ctx.selfId) || ctx.src || {}).xPaid || 0) : repeat;
      for (let i = 0; i < n; i++) applyEffect(s, once, target, ctx, ev);
      return;
    }
    // "… instead if [condition]" (Void — Plasma Bolt deals 3 damage instead): the other effect when it holds as it resolves
    // (opus: "if five or more mana was spent to cast that spell" — spentAtLeast, read from the triggering cast)
    if (eff.insteadIf) {
      const { insteadIf, ...normal } = eff;
      const holds = insteadIf.spentAtLeast != null ? ((ctx.event && ctx.event.spent) || 0) >= insteadIf.spentAtLeast : conditionHolds(s, insteadIf.if, ctx.side, ctx.src);
      return applyEffect(s, holds ? insteadIf.effect : normal, target, ctx, ev);
    }
    // "damage can't be prevented this turn" (Stomp; Banefire with X of 5 or more)
    if (eff.noPrevention || (eff.noPreventionIfX && (ctx.x || 0) >= eff.noPreventionIfX)) s.noPrevention = true;
    if (eff.preventCombatDamage) s.preventCombat = true;      // until end of turn (a puzzle is one turn)
    // "exile all graveyards" (Rest in Peace entering)
    if (eff.exileGraveyards) ["player", "opponent"].forEach((side) => { s[side].exile.push(...s[side].graveyard); s[side].graveyard = []; });
    // "return it from your graveyard to your hand" (Rancor's trigger finds the new object in the graveyard, CR 603.6e)
    if (eff.returnFromGraveyard) {
      const owner = s[(ctx.src && ctx.src.owner) || ctx.side];
      const card = owner.graveyard.find((c) => c.id === ctx.selfId);
      if (card) { owner.graveyard = owner.graveyard.filter((c) => c !== card); owner.hand.push(card); ev.push({ type: "returned", id: card.id }); }
    }
    // damage divided evenly, rounded down, among the targets (Fireball)
    if (eff.evenly) {
      const ts = [].concat(target || []);
      ts.forEach((t) => dealDamage(s, ctx.src, ctx.side, t, Math.floor((eff.damage || 0) / ts.length), ev));
      return;
    }
    // damage divided among the targets, as split when cast
    if (eff.divided) {
      // ("Distribute X +1/+1 counters among any number of target creatures you control": counters instead of damage)
      [].concat(target || []).forEach((t, i) => (eff.counters ? addCounters(s, find(s, t), "+1/+1", (ctx.split || [])[i] || 0, ev) : dealDamage(s, ctx.src, ctx.side, t, (ctx.split || [])[i] || 0, ev)));
      return;
    }
    // fight: each deals damage equal to its power to the other; bite: only the first deals damage
    if (eff.fight || eff.bite) {
      const [x, y] = [].concat(target || []).map((id) => find(s, id));
      // "Target creature you control gets +2/+0 until end of turn. It deals damage equal to its power to …" (Bite Down on Crime)
      if (eff.pumpFirst && x) addMod(s, x, eff.pumpFirst);
      // "Put a +1/+1 counter on the creature you control … Then those creatures fight" (Longstalk Brawl, gift promised)
      if (eff.counterFirst && x) {
        x.counters = { ...(x.counters || {}) };
        Object.entries(eff.counterFirst).forEach(([k, n]) => { x.counters[k] = (x.counters[k] || 0) + n; });
        ev.push({ type: "counters", id: x.id, counters: eff.counterFirst });
      }
      if (x && y) {
        // "target planeswalker you control deals damage equal to its loyalty to …" (byLoyalty)
        const px = Math.max(eff.byLoyalty ? loyaltyOf(x) : power(x), 0), py = Math.max(power(y), 0);
        dealDamage(s, x, sideOf(s, x), y.id, px, ev);
        if (eff.fight) dealDamage(s, y, sideOf(s, y), x.id, py, ev);
      }
      return;
    }
    // a creature card from your graveyard to the battlefield (reanimate) or your hand (regrow)
    if (eff.reanimate || eff.regrow) {
      [].concat(target || []).forEach((id) => {
        const gy = s.player.graveyard.some((c) => c.id === id) ? "player" : "opponent";
        const card = s[gy].graveyard.find((c) => c.id === id);
        if (!card) return;
        s[gy].graveyard = s[gy].graveyard.filter((c) => c !== card);
        // ("It gains 'If this creature would leave the battlefield, exile it instead of putting it anywhere else.'")
        if (eff.reanimate && eff.exileIfLeaves) { card.replacements = ["graveyard", "hand", "library"].map((z) => ({ to: z, instead: "exile", self: true })); s.replaces = true; }
        if (eff.reanimate) {
          card.sick = true; card.owner = "player";
          if (eff.addSubtype) card.type = addTypes(card.type, { subtypes: [eff.addSubtype] });   // ("It's a Phyrexian in addition …")
          if (eff.tapped) card.tapped = true;                         // ("to the battlefield tapped")
          if (eff.withCounters) card.counters = { ...(card.counters || {}), ...fillIn(eff.withCounters, { x: ctx.x }) };   // ("with a finality counter on it")
          if (eff.loseLifeMV) changeLife(s, ctx.side === "player" ? "you" : "opp", -manaValue(faceOf(card, {}).cost), ev);
          // ("It's a 1/1 Spirit creature with flying in addition to its other types")
          if (eff.animateAs) { card.type = addTypes(card.type, { types: ["Creature"], subtypes: eff.animateAs.subtypes || [] }); card.pt = eff.animateAs.pt; card.kw = [...(card.kw || []), ...(eff.animateAs.kw || [])]; }
          ev.push({ type: "reanimated", id }); enter(s, card, { side: "player" }, ev);
          // ("It gains haste. Exile it at the beginning of the next end step.")
          if (eff.hasteNow && find(s, id)) grant(find(s, id), ["haste"], s);
          if (eff.grantAlso && find(s, id)) grant(find(s, id), eff.grantAlso, s);
          if (eff.grantTriggerAlso && find(s, id)) applyEffect(s, { grantTrigger: eff.grantTriggerAlso }, id, ctx, ev);
          if (eff.loseAbilities && find(s, id)) { s.tsMatters = true; addEffect(s, find(s, id), { loseAll: true }); }   // (Xu-Ifit: "has no abilities")   // ("That creature gains menace, deathtouch, and haste")
          if (eff.exileAtEnd) delay(s, "exileIt", ctx.side, card.name, id, id);
        }
        else s.player.hand.push(card);
      });
      if ([].concat(target || []).length) emit(s, { type: "leavesGraveyard", side: "player", obj: { id: [].concat(target)[0] } }, ev);
      return;
    }
    // (a graveyard card as the target: handled before "its target is gone" below)
    if (eff.graveyardCopy) { moreEffects(s, { graveyardCopy: true }, null, null, ctx, ev, target); return; }
    // "Copy target spell. You may choose new targets for the copy." (a spell on the stack: handled before the targets are
    // looked for on the battlefield); See Double with both modes: copy the spell, then a token copy of the creature
    if (eff.copyTargetSpell) { const item = s.stack.find((x) => x.kind === "spell" && x.id === target); if (item) copySpell(s, item, { side: ctx.side }, ev); return; }
    // "Distribute seven +1/+1 counters among any number of target creatures you control" (ctx.split: target id → how
    // many, chosen as the ability went on the stack, CR 603.3c; a target gone by now gets none)
    if (eff.dividedDamage != null) { [].concat(target || []).forEach((id) => dealDamage(s, ctx.src, ctx.side, id, (ctx.split || {})[id] || 0, ev)); return; }
    if (eff.dividedCounters) {
      [].concat(target || []).forEach((id) => { const c = find(s, id); if (c) addCounters(s, c, "+1/+1", (ctx.split || {})[id] || 0, ev); });
      // (Omnivorous Flytrap: "Then if there are six or more card types among cards in your graveyard, double the number of +1/+1 counters on those creatures.")
      if (eff.thenDoubleIfDelirium6 && cardTypesIn(s, ctx.side) >= 6) [].concat(target || []).forEach((id) => { const c = find(s, id); if (c) addCounters(s, c, "+1/+1", (c.counters || {})["+1/+1"] || 0, ev); });
      return;
    }
    // Quintorius: "Choose target card exiled with Quintorius. You may cast that card this turn without paying its mana
    // cost. If that spell would be put into a graveyard, put it on the bottom of its owner's library instead."
    if (eff.freeCastExiled) { const c = s[ctx.side].exile.find((x) => x.id === target); if (c) Object.assign(c, { playable: true, freeCast: true }, eff.freeCastExiled.bottomAfter ? { bottomAfter: true } : {}); return; }
    if (eff.maelstrom) { momEffects(s, eff, null, null, ctx, ev, target); return; }
    // "Counter target spell." (one of yours: CR 701.5a, it goes to its owner's graveyard; a copy ceases to exist)
    // (a spell as the target of "return target spell or permanent to its owner's hand")
    if (eff.bounceSpellOrPermanent && s.stack.some((x) => x.kind === "spell" && x.id === target)) { const i = s.stack.findIndex((x) => x.kind === "spell" && x.id === target); const [w] = s.stack.splice(i, 1); if (!w.copy) { if ((w.card.owner || "player") === "player") s.player.hand.push(w.card); else s.opponent.handCount = (s.opponent.handCount || 0) + 1; } return; }
    if (eff.counterTargetSpell) { const i = s.stack.findIndex((x) => x.kind === "spell" && x.id === target); if (i >= 0) { const [w] = s.stack.splice(i, 1); ev.push({ type: "countered", id: w.id }); if (!w.copy) putCard(s, w.card, w.card.owner || "player", "graveyard"); } return; }
    // Aven Interrupter: "exile target spell. It becomes plotted." (not castable this turn: a later turn, CR 702.170d)
    if (eff.exileSpellPlot) { const i = s.stack.findIndex((x) => x.kind === "spell" && x.id === target); if (i >= 0) { const [w] = s.stack.splice(i, 1); if (!w.copy) { const c = w.card; Object.assign(c, { plotted: true, plottedNow: true }); putCard(s, c, c.owner || "player", "exile"); } } return; }
    // The Tale of Tamiyo IV: "Exile any number of target instant, sorcery, and/or Tamiyo planeswalker cards from your graveyard. Copy them. You may cast any number of the copies."
    if (eff.tamiyoCopies) {
      const z0 = s[ctx.side], copies = [];
      [].concat(target || []).forEach((id) => { const c = z0.graveyard.find((x) => x.id === id); if (!c) return; z0.graveyard = z0.graveyard.filter((x) => x !== c); putCard(s, c, ctx.side, "exile"); copies.push({ ...clone(c), id: `${c.id}-copy${s.nextId++}` }); });
      const done = [];
      for (let i = 0; i < copies.length; i++) { const r = castFree(s, copies.filter((c) => !done.includes(c)), ctx.side, ev, { pay: true, copy: true, decline: "Stop" }); if (!r.cast) break; done.push(r.cast); }
      return;
    }
    // Cursecloth Wrappings: "Target creature card in your graveyard gains embalm until end of turn. The embalm cost is equal to its mana cost."
    if (eff.grantEmbalm) { const c = s[ctx.side].graveyard.find((x) => x.id === target); if (c) { c.renew = { label: "Embalm", cost: faceOf(c, {}).cost || "{0}", effect: { embalmToken: true } }; changed(s); } return; }
    if (eff.junker || eff.mimeoCopy) { dftEffects(s, eff, null, null, ctx, ev, target); return; }
    if (FIN_EARLY.some((k) => eff[k])) { finEffects(s, eff, null, null, ctx, ev, target); return; }
    if (EOE_EARLY.some((k) => eff[k])) { eoeEffects(s, eff, null, null, ctx, ev, target); return; }
    if (SPM_EARLY.some((k) => eff[k])) { spmEffects(s, eff, null, null, ctx, ev, target); return; }
    // Shiko: "exile target nonland card with mana value 3 or less from your graveyard. Copy it, then you may cast the copy without paying its mana cost."
    if (eff.reenactFree) { const z0 = s[ctx.side], c = z0.graveyard.find((x) => x.id === target); if (c) { z0.graveyard = z0.graveyard.filter((x) => x !== c); putCard(s, c, ctx.side, "exile"); castFree(s, { ...clone(c), id: `${c.id}-copy${s.nextId++}` }, ctx.side, ev, { copy: true }); } return; }
    if (eff.wishCast) { const c = s[ctx.side].graveyard.find((x) => x.id === target); if (c) castFree(s, c, ctx.side, ev, { zone: "graveyard", exileAfter: true }); return; }
    // Tinybones, the Pickpocket: "you may cast target nonland permanent card from that player's graveyard, and mana of any type can be spent to cast that spell."
    if (eff.castFromTheirGraveyard) { const c = s.opponent.graveyard.find((x) => x.id === target); if (c) castFree(s, c, ctx.side, ev, { zone: "graveyard", pay: true, anyMana: true }); return; }
    // Kaervek: "exile up to one target black card from your graveyard and copy it. You may cast the copy. If you do, you lose 2 life."
    if (eff.kaervek) {
      const c = s[ctx.side].graveyard.find((x) => x.id === target);
      if (c) { s[ctx.side].graveyard = s[ctx.side].graveyard.filter((x) => x !== c); putCard(s, c, ctx.side, "exile");
        if (castFree(s, { ...clone(c), id: `${c.id}-copy${s.nextId++}` }, ctx.side, ev, { pay: true, copy: true }).cast) changeLife(s, ctx.side === "player" ? "you" : "opp", -2, ev); }
      return;
    }
    // Aurelia's Vindicator: exile them (creatures or graveyard cards), tracked: they come back to their owners' hands when it leaves
    if (eff.exileTrackedAny) {
      [].concat(target || []).forEach((id) => {
        const p = find(s, id);
        if (p) { const owner = p.owner || sideOf(s, p); leave(s, p, "exile", ev); const c = s[owner].exile.find((x) => x.id === id); if (c) c.exiledBy = ctx.selfId; return; }
        for (const sd of ["player", "opponent"]) { const c = s[sd].graveyard.find((x) => x.id === id); if (c) { s[sd].graveyard = s[sd].graveyard.filter((x) => x !== c); c.exiledBy = ctx.selfId; putCard(s, c, sd, "exile"); } }
      });
      return;
    }
    // Officious Interrogation: "Investigate X times, where X is the total number of creatures those players control."
    if (eff.interrogate) { const n = [].concat(target || []).reduce((t, p) => t + (p === "opp" || p === "you" ? s[p === "opp" ? "opponent" : "player"].battlefield.filter(isCreature).length : 0), 0); for (let i = 0; i < n; i++) applyEffect(s, { investigate: true }, undefined, ctx, ev); return; }
    // Niv-Mizzet, Guildpact: "it deals X damage to any target, target player draws X cards, and you gain X life"
    if (eff.niv) {
      const [any, who] = [].concat(target || []);
      const n = new Set(s[ctx.side].battlefield.map((c) => colorsOf(c)).filter((l) => l.length === 2).map((l) => [...l].sort().join(""))).size;
      if (any != null) dealDamage(s, ctx.src, ctx.side, any, n, ev);
      if (who === "you" || who === "opp") draw(s, who === "you" ? ctx.side : (ctx.side === "player" ? "opponent" : "player"), n, ev);
      changeLife(s, ctx.side === "player" ? "you" : "opp", n, ev);
      return;
    }
    // Reenact the Crime: "Exile target nonland card in a graveyard that was put there from anywhere this turn. Copy it. You may cast the copy without paying its mana cost."
    if (eff.reenact) {
      for (const sd of ["player", "opponent"]) {
        const c = s[sd].graveyard.find((x) => x.id === target);
        if (!c) continue;
        s[sd].graveyard = s[sd].graveyard.filter((x) => x !== c); putCard(s, c, sd, "exile");
        const copy = { ...clone(c), id: `${c.id}-copy${s.nextId++}`, owner: ctx.side };
        castFree(s, copy, ctx.side, ev, { copy: true });
      }
      return;
    }
    // Tishana's Tidebinder: "counter up to one target activated or triggered ability. If an ability of an artifact, creature,
    // or planeswalker is countered this way, that permanent loses all abilities for as long as this creature remains on the battlefield."
    if (eff.counterAbility) {
      const k = typeof target === "string" && target.startsWith("stack:") ? Number(target.slice(6)) : -1, i = s.stack.length - 1 - k, item = s.stack[i];
      if (item && (item.kind === "trigger" || item.kind === "ability")) {
        s.stack.splice(i, 1);
        ev.push({ type: "countered", id: item.id || item.srcId });
        const src = find(s, item.kind === "trigger" ? item.srcId : item.id);
        if (src && (isArtifact(src) || isCreature(src) || isPlaneswalker(src)) && find(s, ctx.selfId)) { s.tsMatters = true; addEffect(s, src, { loseAll: true, whileOnField: ctx.selfId }); }
      }
      return;
    }
    // Quintorius Kand −6: "Exile any number of target cards from your graveyard. Add {R} for each card exiled this way. You may play those cards this turn."
    if (eff.kandExile) {
      [].concat(target || []).forEach((id) => { const c = s[ctx.side].graveyard.find((x) => x.id === id); if (!c) return; s[ctx.side].graveyard = s[ctx.side].graveyard.filter((x) => x !== c); c.playable = true; putCard(s, c, ctx.side, "exile"); s.pool.push("R"); });
      return;
    }
    // Locus of Enlightenment: "Whenever you activate an ability that isn't a mana ability, copy it."
    if (eff.copyEventAbility) { const k = ((ctx.event && ctx.event.count) || 0) - 1, item = s.stack[s.stack.length - 1 - k]; if (item && item.kind === "ability") copyAbility(s, item, ctx.side, ev); return; }
    // Vantress Visions: "Copy target activated or triggered ability you control. You may choose new targets for the copy."
    if (eff.copyTargetAbility) {
      const k = typeof target === "string" && target.startsWith("stack:") ? Number(target.slice(6)) : -1, item = s.stack[s.stack.length - 1 - k];
      if (item && (item.kind === "trigger" || item.kind === "ability")) copyAbility(s, item, ctx.side, ev);
      return;
    }
    // Sentinel of Lost Lore: a card in exile to its owner's hand, or to the bottom of its owner's library
    if (eff.exileToHand || eff.exileToBottom) {
      for (const sd of ["player", "opponent"]) { const c = s[sd].exile.find((x) => x.id === target); if (!c) continue;
        s[sd].exile = s[sd].exile.filter((x) => x !== c); delete c.inExile; delete c.onAdventure; delete c.playable;
        if (eff.exileToHand) { if (sd === "player") s.player.hand.push(c); else s.opponent.handCount = (s.opponent.handCount || 0) + 1; } else s[sd].libraryBottom.push(c); }
      return;
    }
    // Likeness Looter: "This creature becomes a copy of target creature card in your graveyard with mana value X, except it
    // has flying and this ability."
    if (eff.becomeCopyCard) {
      const card = s[ctx.side].graveyard.find((c) => c.id === target), me = find(s, ctx.selfId);
      if (card && me && manaValue(faceOf(card, {}).cost) === (ctx.x || 0)) {
        const g = faceOf(card, {}), keep = (me.abilities || []).filter((ab) => ab.effect && ab.effect.becomeCopyCard);
        becomeCopyOf(s, me, g, { kw: ["flying"], abilities: [...(g.abilities || []), ...keep] });
      }
      return;
    }
    // (a modal trigger with a target group per mode: each part picks its own target from the list)
    if (eff.seq && eff.seq.some((e) => e.useSlot != null)) { eff.seq.forEach((e) => applyEffect(s, e, target, ctx, ev)); return; }
    if (eff.seeDouble) { const [sp, cr] = [].concat(target || []); applyEffect(s, { copyTargetSpell: true }, sp, ctx, ev); applyEffect(s, { createCopy: {} }, cr, ctx, ev); return; }
    // "… Proliferate." always comes last in the text: the rest of the effect first, then proliferate (CR 608.2c)
    if (eff.proliferate && Object.keys(eff).length > 1) {
      const { proliferate, ...rest } = eff;
      applyEffect(s, rest, target, ctx, ev);
      applyEffect(s, { proliferate }, target, ctx, ev);
      return;
    }
    // effects on everything at once (once, not per target), then whatever else the effect does
    if (GLOBAL.some((k) => eff[k])) {
      const rest = { ...eff };
      GLOBAL.forEach((k) => delete rest[k]);
      const then = Object.keys(rest).length ? { effect: rest, target, ctx } : null;
      applyGlobal(s, eff, ctx, ev, then);
      // after a scry/surveil the rest of the effect ("…, then draw a card") waits for your choice
      if (then && !eff.scry && !eff.surveil) applyEffect(s, rest, target, ctx, ev);
      return;
    }
    if (Array.isArray(target)) { target.forEach((t) => applyEffect(s, eff, t, ctx, ev)); return; }
    // offspring (CR 702.175a): a 1/1 token copy of the permanent (as it last existed, if it's gone)
    if (eff.offspringCopy) { createToken(s, copyValues(find(s, ctx.selfId) || ctx.src, { pt: "1/1" }), ctx.side, ev); return; }
    // eff.to: "opp" is "each opponent" of the ability's controller; "eventObject" / "eventController" are the object
    // and player of the event that triggered it ("that creature", "that spell's controller")
    const to = eff.self ? ctx.selfId : eff.to ? relativeTo(eff.to, ctx) : target;
    const isPlayer = to === "opp" || to === "you";
    const tgt = to && !isPlayer ? find(s, to) : null;
    // its target is gone: it does nothing — unless the target is a card in a graveyard ("you may pay {3}{B}. When you do,
    // return target creature card …"): those effects are in moreEffects
    if (to && !isPlayer && !tgt) {
      if ([...s.player.graveyard, ...s.opponent.graveyard].some((c) => c.id === to)) moreEffects(s, eff, null, to, ctx, ev, target);
      return;
    }
    // damage "equal to the sacrificed creature's power", or "equal to its power": the source as it is now, or as it
    // last existed if it has left (CR 608.2h)
    const srcPower = () => { const now = ctx.selfId && find(s, ctx.selfId); return Math.max(now ? power(now) : ctx.src.lastPower ?? power(ctx.src), 0); };
    // ("X damage, where X is 2 plus the number of other spells you've cast this turn": { plusOtherSpells: 2 })
    // ("deals that much damage": how many cards the event was about — "whenever you discard one or more cards")
    // ("X is 2 plus the number of Mounts and Vehicles you control": { plus: 2, per: { mountOrVehicle: true } })
    // (vivid: the number of colors among permanents you control)
    // (more amounts: "the amount of damage dealt to it this turn", "the amount of life you gained this turn", "half X,
    // rounded up", "the number of skewer counters on this creature", "how many were sacrificed this way")
    const me0 = () => find(s, ctx.selfId) || ctx.src || {};
    const amount = (d) => (d === "srcDamage" ? (ctx.src && ctx.src.dmg) || 0 : d === "lifeGained" ? s.lifeGainedTotal || 0
      : d === "halfXUp" ? Math.ceil((me0().xPaid || 0) / 2) : d === "sacrificedCount" ? ctx.sacCount || 0
      : d === "descendedCount" ? s[ctx.side].descended || 0
      : d === "handSize" ? s[ctx.side].hand.length
      : d === "gyPermanents" ? permanentCardsIn(s, ctx.side)
      : d === "yourDiedN" ? s.yourDiedN || 0
      : d === "oppExiledCreatures" ? s.oppExiledCreatures || 0
      : d === "chosenTypeCount" ? ((me0() || {}).chosenType ? s[ctx.side].battlefield.filter((c) => isCreature(c) && hasType(c, me0().chosenType)).length : 0)
      : d === "distinctPowers" ? new Set(s[ctx.side].battlefield.filter(isCreature).map((c) => power(c))).size   // ("for each different power among creatures you control")
      : d === "speed" ? speedOf(s, ctx.side)
      : d === "artifactOrCreatureCardsInGraveyard" ? s[ctx.side].graveyard.filter((c) => isArtifact(faceOf(c, {})) || isCreature(faceOf(c, {}))).length
      : d === "otherZombiesEntered" ? Math.max(0, (s.zombiesEntered || 0) - 1)
      : d === "drawnMinus1" ? Math.max(0, ((s.drawn || {})[ctx.side] || 0) - 1)
      : d === "eventPower" ? Math.max(0, power(find(s, ctx.event && ctx.event.id) || { pt: "0/0" }))
      : d === "distinctTokenNames" ? new Set(s[ctx.side].battlefield.filter((c) => c.token && isCreature(c)).map((c) => c.name)).size
      : d === "creaturesLeftYours" ? (ctx.side === "player" ? s.creaturesLeftYours || 0 : 0)   // ("each creature that left the battlefield under your control this turn")
      : d && typeof d === "object" && d.oneIfOppArtifact ? 1 + (s[ctx.side === "player" ? "opponent" : "player"].battlefield.some(isArtifact) ? 1 : 0)                       // ("the number of times you descended this turn")
      : d && typeof d === "object" && d.attackersOfType ? ((s.combat && s.combat.attackers) || []).map((id) => find(s, id)).filter((c) => c && hasType(c, d.attackersOfType)).length
      : d && typeof d === "object" && d.selfCounters ? (me0().counters || {})[d.selfCounters] || 0
      : d === "sacrificed" ? ctx.sacPower : d === "sacrificedMV" ? ctx.sacMV || 0 : d === "power" ? srcPower() : d === "eventCount" ? (ctx.event && ctx.event.count) || 0
      : d === "vivid" ? vividCount(s, ctx.side)
      // ("the number of creature cards / land cards in your graveyard", "the number of counters on this creature")
      : d === "creatureCardsInGraveyard" ? s[ctx.side].graveyard.filter((c) => isCreature(faceOf(c, {}))).length
      : d === "landCardsInGraveyard" ? s[ctx.side].graveyard.filter((c) => isLand(faceOf(c, {}))).length
      : d === "selfCountersTotal" ? Object.values(me0().counters || {}).reduce((t, n) => t + n, 0)
      // ("the total mana value of other permanents you control", "your devotion to red", "that creature's power" as it
      // last existed, "each creature that died this turn", "the number of lands you control")
      : d === "otherPermanentsMV" ? s[ctx.side].battlefield.filter((c) => c.id !== ctx.selfId).reduce((t, c) => t + manaValue(c.cost), 0)
      : d === "devotionRed" ? s[ctx.side].battlefield.reduce((t, c) => t + ((c.cost || "").match(/\{[^}]*R[^}]*\}/g) || []).length, 0)
      : d === "eventLastPower" ? (ctx.event && ctx.event.objPower) || 0
      : d === "diedCount" ? s.diedCount || 0
      : d === "landsYouControl" ? s[ctx.side].battlefield.filter(isLand).length
      // ("the number of creatures they control", "the greatest power among creature cards in your graveyard", "the
      // difference" up to eight cards in hand, "X" of a permanent as it entered)
      : d === "oppCreatures" ? s[ctx.side === "player" ? "opponent" : "player"].battlefield.filter(isCreature).length
      : d === "greatestGraveyardPower" ? Math.max(0, ...s[ctx.side].graveyard.map((c) => faceOf(c, {})).filter(isCreature).map((c) => power(c)))
      : d === "handTo8" ? Math.max(0, 8 - s[ctx.side].hand.length)
      : d === "handTo4" ? Math.max(0, 4 - s[ctx.side].hand.length)
      : d === "instSorcInGraveyard" ? s[ctx.side].graveyard.filter((c) => typeHas(faceOf(c, {}), /instant|sorcery/i)).length
      : d === "exiledCount" ? ctx.exiled || 0
      : d === "greatestPower" ? Math.max(0, ...s[ctx.side].battlefield.filter(isCreature).map((c) => power(c)))
      : d === "colorsAmongOtherArtifacts" ? new Set(s[ctx.side].battlefield.filter((c) => isArtifact(c) && c.id !== ctx.selfId).flatMap((c) => colorsOf(c))).size
      : d === "eventSpent" ? (ctx.event && ctx.event.spent) || 0
      // converge: "the number of colors of mana spent to cast it" (this spell, or this permanent as it was cast); eventConverge: the spell that triggered
      : d === "converge" ? Object.keys(ctx.colorsSpent || me0().colorsSpent || {}).length
      : d === "eventConverge" ? (ctx.event && ctx.event.converge) || 0
      : d === "eventMV" ? (ctx.event && ctx.event.mv) || 0                       // ("that spell's mana value")
      : d === "selfToughness" ? Math.max(0, toughness(me0()))
      : d === "handTo10" ? Math.max(0, 10 - s[ctx.side].hand.length)
      : d === "eventBlueSymbols" ? (ctx.event && ctx.event.blueSymbols) || 0
      : d === "threeX" ? 3 * (ctx.x || 0)
      : d === "twoPowX" ? 2 ** (ctx.x || 0)                                       // (Mathemagics: "2ˣ cards")
      : d === "selfX" ? me0().xPaid || 0
      : d === "halfSelfXDown" ? Math.floor((me0().xPaid || 0) / 2)
      : d === "eventLastToughness" ? (ctx.event && ctx.event.objToughness) || 0
      : d === "enchantedPower" ? Math.max(0, power(find(s, ctx.src && ctx.src.attachedTo) || { pt: "0/0" }))   // ("enchanted creature deals damage equal to its power")
      : d === "townsYouControl" ? s[ctx.side].battlefield.filter((c) => hasType(c, "Town")).length
      : d === "attackingCount" ? ((s.combat && s.combat.attackers) || []).filter((id) => s[ctx.side].battlefield.some((c) => c.id === id)).length
      : typeof d === "object" && d.per ? (d.plus || 0) + s[ctx.side].battlefield.filter((c) => matches(s, c, d.per, ctx.side)).length
      // ("2 plus the number of Lesson cards in your graveyard": { plus: 2, perGraveyard: "Lesson" })
      : typeof d === "object" && d.perGraveyard ? (d.plus || 0) + s[ctx.side].graveyard.filter((c) => subtypes(c).includes(d.perGraveyard)).length
      : typeof d === "object" ? d.plusOtherSpells + Math.max((ctx.side === "player" ? s.spellsCast || 0 : 0) - 1, 0) : d);
    // ("this creature deals …" in an ability an Equipment or Aura gives: the creature it's attached to is the source)
    // ("Whenever a Dragon you control attacks, it deals 2 damage …": byEvent — the event's creature is the source)
    const dmgSrc = (eff.byAttached && ctx.src && ctx.src.attachedTo && find(s, ctx.src.attachedTo)) ||
      (eff.byEvent && ctx.event && find(s, ctx.event.id)) || ctx.src;
    if (eff.excessTreasures != null && tgt && isCreature(tgt)) ctx.excess = Math.max(0, amount(eff.damage) - Math.max(toughness(tgt) - (tgt.dmg || 0), 0));
    if (eff.damage != null) dealDamage(s, dmgSrc, ctx.side, to, amount(eff.damage), ev);
    if (eff.lifeLoss && isPlayer) changeLife(s, to, -amount(eff.lifeLoss), ev);
    // "each opponent gets a poison counter" (CR 122.1f)
    if (eff.poison && isPlayer) {
      const z = s[to === "opp" ? "opponent" : "player"];
      const pn = eff.poison * counterMult(s, ctx.side);
      z.poison = (z.poison || 0) + pn;
      ev.push({ type: "poison", who: to, amount: pn });
    }
    // discarding: the opponent's hand is cards you don't know; yours isn't targeted by these effects
    if (eff.discard && to === "opp") {
      const z = s.opponent, discardedFrom = z.handCount || 0;
      z.handCount = Math.max(0, (z.handCount || 0) - eff.discard);
      z.hand.splice(0, eff.discard).forEach((c) => putCard(s, c, "opponent", replaceMove(s, c, "hand", "graveyard", "opponent")));
      ev.push({ type: "discard", who: "opp", amount: eff.discard });
      for (let i = 0; i < Math.min(eff.discard, discardedFrom); i++) emit(s, { type: "discard", obj: { id: null, type: "Card" }, side: "opponent", count: 1 }, ev);
    }
    if (eff.gainLife) changeLife(s, ctx.side === "player" ? "you" : "opp", amount(eff.gainLife), ev);
    // "Each opponent sacrifices a creature or Vehicle of their choice. Each opponent who can't discards a card." (the
    // opponent's choice: the one that leaves you no way to win, if there is one)
    if (eff.edict && to === "opp") {
      const z = s[ctx.side === "player" ? "opponent" : "player"];
      const opts = z.battlefield.filter((c) => isCreature(c) || isVehicle(c));
      if (opts.length) leave(s, opts[choose(s, "Which does the opponent sacrifice?", opts.map((c) => c.name), "opponent")], "graveyard", ev, { sacrificed: true });
      else applyEffect(s, { discard: 1 }, "opp", ctx, ev);
    }
    // "deals 2 damage to each player who doesn't have max speed" (CR 702.179e)
    if (eff.damageSlow) ["player", "opponent"].forEach((side) => { if (!maxSpeed(s, side)) dealDamage(s, ctx.src, ctx.side, side === "player" ? "you" : "opp", eff.damageSlow, ev); });
    if (eff.controllerLoses && tgt) changeLife(s, sideOf(s, tgt) === "player" ? "you" : "opp", -eff.controllerLoses, ev);   // before it leaves
    if (eff.controllerMaps && tgt) ctx.mapsFor = sideOf(s, tgt);
    if (eff.ifYours && tgt) ctx.wasYours = sideOf(s, tgt) === ctx.side;       // ("If you controlled that permanent, …")
    if (eff.destroy && tgt && !survivesDestroy(s, tgt, ev)) leave(s, tgt, "graveyard", ev);
    if (eff.exile && tgt) {
      const owner = tgt.owner || sideOf(s, tgt), card = tgt.token ? null : tgt;
      leave(s, tgt, "exile", ev);
      // "… Return that card to the battlefield under its owner's control at the beginning of that player's next end step"
      // (your card: this turn's end step; the opponent's next end step comes after the puzzle)
      if (eff.returnAtEnd && card && owner === "player" && s.player.exile.some((x) => x.id === card.id)) delay(s, "returnExiled", ctx.side, (ctx.src && ctx.src.name) || "Return", ctx.selfId, card.id);
      if (eff.returnWithCounters && card) { const ex = s.player.exile.find((x) => x.id === card.id); if (ex) ex.returnCounters = eff.returnWithCounters; }
    }
    // a delayed trigger's object (ctx.event.id): the exiled card comes back (a new object, CR 400.7); a permanent is
    // exiled or sacrificed
    if (eff.returnExiled) {
      for (const side of ["player", "opponent"]) {
        const card = s[side].exile.find((x) => x.id === (ctx.event && ctx.event.id));
        if (!card) continue;
        s[side].exile = s[side].exile.filter((x) => x !== card);
        card.sick = true;
        if (card.returnCounters) { card.counters = { ...(card.counters || {}), ...card.returnCounters }; delete card.returnCounters; }   // ("with a flying counter on it")
        ev.push({ type: "returned", id: card.id });
        enter(s, card, { side: card.owner || side }, ev);
      }
    }
    if (eff.exileEvent || eff.sacrificeEvent) {
      const t = find(s, ctx.event && ctx.event.id);
      if (t) leave(s, t, eff.exileEvent ? "exile" : "graveyard", ev, { sacrificed: !!eff.sacrificeEvent });
    }
    if ((eff.bounce || eff.bounceSpellOrPermanent) && tgt) leave(s, tgt, "hand", ev);
    if (eff.sacrifice && tgt) leave(s, tgt, "graveyard", ev, { sacrificed: true });   // "sacrifice it" (e.g. Ball Lightning)
    if (eff.counters && tgt) {                                   // e.g. { "+1/+1": 1 }; opposite counters then cancel (SBA)
      tgt.counters = { ...(tgt.counters || {}) };
      // (a negative number removes counters: "remove a lore counter", never below 0)
      Object.entries(eff.counters).forEach(([type, n]) => { const k = amount(n);
        if (k > 0) addCounters(s, tgt, type, k, ev); else tgt.counters = { ...tgt.counters, [type]: Math.max(0, (tgt.counters[type] || 0) + k) }; });
      // (a keyword counter changes its abilities; charge counters can make a Spacecraft a creature)
      if (Object.keys(eff.counters).some((k) => KW_COUNTERS.includes(k) || k === "charge")) changed(s);
      ev.push({ type: "counters", id: tgt.id, counters: eff.counters });
    }
    // "-5/-5 … Descend 4 — -10/-10 instead if there are four or more permanent cards in your graveyard"
    const descended = eff.pumpIfDescend && permanentCardsIn(s, ctx.side) >= eff.pumpIfDescend.n;
    if (eff.pump && tgt) addMod(s, tgt, descended ? eff.pumpIfDescend.pump : eff.pump);
    // "it fights up to one target creature you don't control" (CR 701.14a: each deals damage equal to its power to the other)
    // ("If that creature would die this turn, exile it instead")
    if (eff.exileIfDies && tgt) { tgt.replacements = [...(tgt.replacements || []), { to: "graveyard", instead: "exile", self: true }]; s.replaces = true; }
    if (eff.fightSelf && tgt) {
      const me = find(s, ctx.selfId);
      if (me && isCreature(me)) {
        const pm = Math.max(power(me), 0), pt = Math.max(power(tgt), 0);
        dealDamage(s, me, sideOf(s, me), tgt.id, pm, ev);
        dealDamage(s, tgt, sideOf(s, tgt), me.id, pt, ev);
      }
    }
    if (eff.doublePower && tgt) addMod(s, tgt, [power(tgt), 0]);   // "double its power": +X/+0, X its power (CR 701.10b-c)
    // "double / triple target creature's power and toughness": +X/+Y with X, Y its power and toughness (times k-1)
    if (eff.multiplyPT && tgt) addMod(s, tgt, [(eff.multiplyPT - 1) * power(tgt), (eff.multiplyPT - 1) * toughness(tgt)]);
    // "double the number of +1/+1 counters on it": as many more as it has (CR 701.10e)
    if (eff.doubleCounters && tgt) {
      const n = (tgt.counters || {})[eff.doubleCounters] || 0;
      if (n) addCounters(s, tgt, eff.doubleCounters, n, ev);
    }
    // "… and each battle they protect": the battles the opponent protects are your Sieges (CR 310.9e)
    if (eff.damageProtectedBattles) s.player.battlefield.filter(isBattle).forEach((b) => dealDamage(s, ctx.src, ctx.side, b.id, eff.damageProtectedBattles, ev));
    // "loses all abilities" (layer 6) and "has base power and toughness N/N" (layer 7b) until end of turn
    if (eff.loseAll && tgt) addEffect(s, tgt, { loseAll: true });
    if (eff.setBase && tgt) addEffect(s, tgt, { setBase: eff.setBase });
    if (eff.becomeCreature && tgt) addEffect(s, tgt, { becomeCreature: true });   // until end of turn (crew)
    if (eff.saddled && tgt) { tgt.saddled = true; ev.push({ type: "saddled", id: tgt.id }); }   // CR 702.171b (until end of turn)
    // "Untap all creatures target player controls"
    if (eff.untapAllOf && isPlayer) s[to === "opp" ? "opponent" : "player"].battlefield.filter(isCreature).forEach((c) => untap(s, c, ev));
    // "Target artifact or creature's owner puts it on the top or bottom of their library" (either way it's gone from the
    // puzzle: the library below the known cards is unknown)
    if (eff.tuck && tgt) leave(s, tgt, "library", ev);
    if (eff.grant && tgt) grant(tgt, eff.grant, s);
    if (eff.tap && tgt) tap(s, tgt, ev);
    if (eff.transform && tgt) transform(s, tgt, ev);            // "transform this creature" (CR 701.27)
    // "create a token that's a copy of target creature you control, except it has haste and …" (CR 707.2, 707.9a)
    // ("It gains haste. Sacrifice it at the beginning of the next end step."; count: "five tokens that are copies")
    if (eff.createCopy && tgt) {
      const c0 = eff.createCopy, spec = { ...copyValues(tgt, c0.except), ...(c0.sacrificeAtEnd ? { sacrificeAtEnd: true } : {}) };
      // ("except it isn't legendary, is a Reflection in addition to its other types")
      if (c0.notLegendary) spec.type = (spec.type || "").replace(/\bLegendary\s+/i, "");
      if (c0.addSubtype) spec.type = addTypes(spec.type, { subtypes: [c0.addSubtype] });
      if (c0.addType) spec.type = addTypes(spec.type, { types: [c0.addType] });     // ("except it's an artifact in addition")
      for (let i = 0; i < (c0.count == null ? 1 : amount(c0.count)); i++) createTokens(s, spec, ctx.side, ev).forEach((t) => { if (c0.hasteNow) grant(t, ["haste"], s); });
    }
    // "you may copy it" (the spell that triggered this): a choice, then a copy on the stack (CR 707.10)
    if (eff.copyEventSpell) {
      const item = s.stack.find((x) => x.kind === "spell" && x.id === (ctx.event && ctx.event.id));
      if (item && (eff.copyEventSpell.always || choose(s, `Copy ${item.name}?`, ["Copy it", "Don't copy it"], ctx.side) === 0)) {
        copySpell(s, item, { side: ctx.side, gain: eff.copyEventSpell.gain || [], notLegendary: eff.copyEventSpell.notLegendary }, ev);
      }
    }
    if (eff.untap && tgt) untap(s, tgt, ev);
    if (eff.attach && isPlayer) { const thing = find(s, ctx.selfId); if (thing) { thing.attachedTo = to; ev.push({ type: "attach", id: thing.id, to }); } }   // ("Enchant player")
    if (eff.attach && tgt) {                                     // an Aura resolving, or an equip ability
      const thing = find(s, ctx.selfId);
      if (thing) {
        thing.attachedTo = tgt.id;
        thing.ts = stamp(s);
        changed(s);                                    // CR 613.7e: a new timestamp when it becomes attached
        ev.push({ type: "attach", id: thing.id, to: tgt.id });
        emit(s, { type: "attached", obj: thing, side: sideOf(s, thing), host: tgt.id }, ev);   // ("whenever this Equipment becomes attached to a creature")
      }
    }
    if (eff.steal && tgt) {
      if (sideOf(s, tgt) === "opponent") {
        s.opponent.battlefield = s.opponent.battlefield.filter((c) => c !== tgt);
        s.player.battlefield.push(tgt);
        changed(s);
        tgt.sick = true;                                         // new controller: summoning sick (haste covers it)
        ev.push({ type: "stolen", id: tgt.id });
      }
      untap(s, tgt, ev);
      grant(tgt, ["haste"], s);
    }
    // ("draw a card for each tapped creature your opponents control": perOpp)
    if (eff.draw) draw(s, ctx.side, typeof eff.draw === "object" && eff.draw.perOpp
      ? s[ctx.side === "player" ? "opponent" : "player"].battlefield.filter((c) => isCreature(c) && matches(s, c, eff.draw.perOpp, ctx.side)).length : amount(eff.draw), ev);
    if (eff.create) {
      // "create …" makes tokens for the ability's controller; "target player creates …" (eff.forTarget) for that player
      const side = eff.forTarget ? (to === "you" ? "player" : "opponent") : ctx.side;
      // (ptFrom: "an X/1 token, where X is the number of oil counters on this artifact" / "X is Nissa's loyalty"; count
      // "eventMV": "X tokens, where X is that spell's mana value"; hasteNow: "They gain haste until end of turn")
      const { ptFrom, hasteNow, ...spec } = eff.create;
      // (the other attacking creatures: "X is the greatest power among other attacking creatures" / "the number of …")
      const otherAttackers = () => ((s.combat && s.combat.attackers) || []).filter((id) => id !== ctx.selfId).map((id) => find(s, id)).filter(Boolean);
      if (spec.count === "otherAttackers") spec.count = otherAttackers().length;
      if (ptFrom) {
        const me = find(s, ctx.selfId) || ctx.src || {};
        const n = ptFrom.selfCounters ? (me.counters || {})[ptFrom.selfCounters] || 0 : ptFrom.loyalty ? loyaltyOf(me)
          : ptFrom.greatestOtherAttacker ? Math.max(0, ...otherAttackers().map(power))
      : ptFrom.diedBatchPower ? (s.diedPower || {})[`${ctx.side}:${(ctx.event || {}).batchNo}`] || 0 : 0;   // (The Skullspore Nexus)
        spec.pt = ptFrom.toughness != null ? `${n}/${ptFrom.toughness}` : `${n}/${n}`;
      }
      const count = spec.count === "eventMV" ? (ctx.event && ctx.event.mv) || 0 : spec.count == null ? 1 : typeof spec.count === "number" ? spec.count : amount(spec.count);
      const made = [];
      for (let i = 0; i < count; i++) made.push(...createTokens(s, spec, side, ev));
      if (hasteNow) made.forEach((t) => grant(t, ["haste"], s));
      ctx.created = [...(ctx.created || []), ...made.map((t) => t.id)];
    }
    // FRA: "empower Jace N" — put N loyalty counters on a Jace token you control; if you control none, first create one
    // (it has no printed loyalty, so it enters with none, CR 306.5b; the counters go on before state-based actions)
    if (eff.empower) {
      const jace = s[ctx.side].battlefield.find((c) => c.token && isPlaneswalker(c) && subtypes(c).includes("Jace")) || createToken(s, JACE, ctx.side, ev);
      addLoyalty(s, jace, amount(eff.empower), ctx.side, ev);
    }
    // "put a loyalty counter on each planeswalker you control" (Way of the Mentor): one event for all of them ("whenever
    // you put one or more loyalty counters …" triggers once)
    if (eff.loyaltyEach) {
      const walkers = s[ctx.side].battlefield.filter(isPlaneswalker);
      walkers.forEach((p, i) => addLoyalty(s, p, eff.loyaltyEach, ctx.side, ev, i > 0));
    }
    // "If that land is a Mountain, add {R}" (ifEventType: { type, effect }: only when the triggering object has that subtype)
    if (eff.ifEventType) {
      const obj = ctx.event && find(s, ctx.event.id);
      if (obj && subtypes(obj).includes(eff.ifEventType.type)) applyEffect(s, eff.ifEventType.effect, target, ctx, ev);
    }
    // CR 310.12b: exile the defeated Siege, then you may cast it transformed without paying its mana cost (it goes on
    // the stack right away, during this resolution: timing rules don't apply, CR 608.2g)
    if (eff.siegeDefeated) {
      const b = find(s, ctx.selfId);
      if (b) {
        const owner = b.owner || ctx.side;
        leave(s, b, "exile", ev);
        const card = s[owner].exile.find((x) => x.id === ctx.selfId);
        const back = card && card.faces && card.faces[1];
        // (a back face that's a spell with targets — Awaken the Maelstrom — chooses them now)
        if (back) castFree(s, card, ctx.side, ev, { zone: "exile", face: 1, prompt: `Cast ${back.name} (${card.name} transformed) for free?` });
      }
    }
    // CR 702.165a: backup N — N +1/+1 counters on the target; if that's another creature, it also gains this
    // creature's abilities printed below backup until end of turn (eff.backup.grant)
    if (eff.backup && tgt) {
      addCounters(s, tgt, "+1/+1", eff.backup.n, ev);
      if (tgt.id !== ctx.selfId && (eff.backup.grant || []).length) grant(tgt, eff.backup.grant, s);
    }
    // "Create a Monster Role token attached to target creature" (CR 111.10j-r); roleSeq orders Roles for CR 704.5z
    if (eff.role && tgt) createToken(s, { ...ROLES[eff.role], attachedTo: tgt.id, roleSeq: s.nextId }, ctx.side, ev);
    if (eff.food) for (let i = 0; i < eff.food; i++) createToken(s, FOOD, ctx.side, ev);       // "create a Food token"
    // CR 701.16a: investigate — create a Clue token
    if (eff.investigate) for (let i = 0; i < eff.investigate; i++) createToken(s, CLUE, ctx.side, ev);
    // CR 701.60a-d: suspect it (a suspected creature can't become suspected again) / it's no longer suspected
    if (eff.suspect && tgt && !tgt.suspected) { tgt.suspected = true; changed(s); ev.push({ type: "suspected", id: tgt.id }); }
    if (eff.unsuspect && tgt && tgt.suspected) { delete tgt.suspected; changed(s); }
    // "add {R}" from a triggered ability that isn't a mana ability (it resolved from the stack): into your pool
    if (eff.addMana && ctx.side === "player") s.pool.push(...eff.addMana.split(""));
    // "Each creature you control deals 1 damage to that creature" (each one is the source of its own damage)
    if (eff.eachDeals && tgt) s[ctx.side].battlefield.filter(isCreature).forEach((c) => dealDamage(s, c, ctx.side, tgt.id, eff.eachDeals, ev));
    // "you may tap or untap target creature"
    if (eff.tapOrUntap && tgt) {
      const pick = choose(s, `Tap or untap ${tgt.name}?`, ["Tap it", "Untap it", "Neither"], ctx.side, tgt.id);
      if (pick === 0) tap(s, tgt, ev); else if (pick === 1) untap(s, tgt, ev);
    }
    // "It also gets +1/+0 until end of turn if you control a Mouse": part of the effect that needs a permanent of yours
    if (eff.ifYouControl && tgt && s[ctx.side].battlefield.some((c) => objectIs(c, eff.ifYouControl.filter))) {
      const { filter, ...more } = eff.ifYouControl;
      applyEffect(s, more, tgt.id, ctx, ev);
    }
    if (eff.manifestDread) manifestDread(s, ctx.side, ev);
    // "you may blight N. If you do, …" (CR 701.68a: N -1/-1 counters on a creature you control; you choose which, or not)
    if (eff.mayBlight && ctx.side === "player") {
      const mine = s.player.battlefield.filter(isCreature);
      const pick = mine.length ? choose(s, `Blight ${eff.mayBlight.n}?`, ["Don't blight", ...mine.map((c) => `Blight ${c.name}`)], "player", [null, ...mine.map((c) => c.id)]) : 0;
      if (pick > 0) {
        const b = mine[pick - 1];
        b.counters = { ...(b.counters || {}), "-1/-1": ((b.counters || {})["-1/-1"] || 0) + eff.mayBlight.n };
        ev.push({ type: "blight", id: b.id, n: eff.mayBlight.n });
        applyEffect(s, eff.mayBlight.then, target, ctx, ev);
      }
    }
    // CR 722.3a: it becomes prepared (only a permanent with a prepare spell; not if it already is)
    if (eff.becomePrepared && tgt && tgt.prepare && !tgt.prepared) { tgt.prepared = true; ev.push({ type: "prepared", id: tgt.id }); }
    // firebending (CR 702.189a): {R}s that last until end of combat
    if (eff.fireMana && ctx.side === "player") { s.firePool = (s.firePool || 0) + eff.fireMana; ev.push({ type: "firebending", n: eff.fireMana }); }
    // CR 701.65a: airbend — exile it; while it's exiled, its owner may cast it for {2} rather than its mana cost
    if (eff.airbend && tgt) {
      const owner = tgt.owner || sideOf(s, tgt);
      leave(s, tgt, "exile", ev);
      const card = s[owner].exile.find((x) => x.id === tgt.id);
      if (card) card.airbent = true;
    }
    // CR 701.66a: earthbend N — target land you control becomes a 0/0 creature with haste that's still a land, with N
    // +1/+1 counters, and gains "When this permanent dies or is exiled, return it to the battlefield tapped" (EARTH_RETURN)
    if (eff.earthbend && tgt) {
      tgt.earthbent = true;
      addEffect(s, tgt, { becomeCreature: true });
      addEffect(s, tgt, { setBase: [0, 0] });
      grant(tgt, ["haste"], s);
      const n = amount(eff.earthbend);
      addCounters(s, tgt, "+1/+1", n, ev);
      ev.push({ type: "earthbend", id: tgt.id, n });
    }
    // station (CR 702.184a): charge counters equal to the tapped creature's power; "If it's a Spacecraft, put ten charge
    // counters on it" (chargeIfSpacecraft)
    const charge = eff.charge === "tapped" ? ctx.tappedPower || 0 : eff.chargeIfSpacecraft && tgt && subtypes(tgt).includes("Spacecraft") ? eff.chargeIfSpacecraft : 0;
    if (charge && tgt) {
      tgt.counters = { ...(tgt.counters || {}), charge: ((tgt.counters || {}).charge || 0) + charge };
      changed(s);
      ev.push({ type: "counters", id: tgt.id, counters: { charge } });
    }
    // "If that creature is an Ally, it also gains flying until end of turn" (ifTargetType)
    if (eff.ifTargetType && tgt && hasType(tgt, eff.ifTargetType.type)) grant(tgt, eff.ifTargetType.grant, s);
    // "If that creature was cast for its warp cost, it also gains …"
    if (eff.ifWarped && tgt && tgt.warped) grant(tgt, eff.ifWarped, s);
    // "another target creature you control gets +X/+X, where X is this creature's power"
    if (eff.pumpBySourcePower && tgt) { const n = srcPower(); addMod(s, tgt, [n, n]); }
    // CR 701.63a: endure N — N +1/+1 counters on it, or an N/N white Spirit creature token instead (its controller chooses)
    if (eff.endure && tgt) {
      const n = amount(eff.endure);
      const pick = n > 0 ? choose(s, `${tgt.name} endures ${n}`, [`Put ${n} +1/+1 counter${n > 1 ? "s" : ""} on ${tgt.name}`, `Create a ${n}/${n} Spirit token`], ctx.side, tgt.id) : -1;
      if (pick === 0) addCounters(s, tgt, "+1/+1", n, ev);
      if (pick === 1) createToken(s, { name: "Spirit", type: "Token Creature — Spirit", pt: `${n}/${n}`, colors: ["W"] }, ctx.side, ev);
    }
    // "Discard a card. If you do, draw two cards." (you choose which; with an empty hand nothing happens)
    // "Draw a card, then discard a card" (loot: how many of each; you choose what to discard)
    if (eff.loot && ctx.side === "player") {
      draw(s, "player", eff.loot, ev);
      for (let k = 0; k < eff.loot && s.player.hand.length; k++) {
        const i = choose(s, "Discard which card?", s.player.hand.map((c) => c.name), "player", s.player.hand.map((c) => c.id));
        discardCard(s, s.player.hand[i], ev);
      }
    }
    // ("Discard a card, then draw two cards": drawAnyway — the draw doesn't depend on the discard)
    if (eff.discardThenDraw && ctx.side === "player" && (s.player.hand.length || eff.drawAnyway)) {
      if (s.player.hand.length) {
        const i = choose(s, "Discard which card?", s.player.hand.map((c) => c.name), "player", s.player.hand.map((c) => c.id));
        discardCard(s, s.player.hand[i], ev);
      }
      draw(s, "player", eff.discardThenDraw, ev);
    }
    // "+X/+X, where X is the number of attacking creatures" (pumpCount: the creatures you control that X counts)
    if (eff.pumpCount && tgt) {
      const n = s[ctx.side].battlefield.filter((c) => isCreature(c) && matches(s, c, eff.pumpCount.filter, ctx.side)).length;
      addMod(s, tgt, [n * eff.pumpCount.per[0], n * eff.pumpCount.per[1]]);
    }
    // CR 702.179c-d: your speed increases (to at most 4)
    if (eff.speedUp) {
      const z = s[ctx.side];
      z.speed = Math.min(4, speedOf(s, ctx.side) + eff.speedUp);
      ev.push({ type: "speed", side: ctx.side, speed: z.speed });
    }
    // "Delirium — If there are four or more card types among cards in your graveyard, that creature gains double strike":
    // part of the effect that applies only if a condition holds as it resolves (eff.ifCond: { if, …effect })
    if (eff.ifCond && conditionHolds(s, eff.ifCond.if, ctx.side, ctx.src)) {
      const { if: _, ...more } = eff.ifCond;
      applyEffect(s, more, tgt ? tgt.id : target, ctx, ev);
    }
    // "draw a card if you control a Glimmer creature. If you don't, create a 1/1 Glimmer …" (eff.ifControlElse)
    if (eff.ifControlElse) {
      const { filter, yes, no } = eff.ifControlElse;
      applyEffect(s, s[ctx.side].battlefield.some((c) => objectIs(c, filter)) ? yes : no, target, ctx, ev);
    }
    // CR 716.2a: the Class's level becomes N ("when this Class becomes level N" triggers)
    if (eff.levelUp && tgt) { tgt.level = eff.levelUp; changed(s); emit(s, { type: "levelUp", obj: tgt, side: ctx.side, level: eff.levelUp }, ev); }
    // "… also deals 3 damage to that creature's controller" (Blooming Blast, gift promised)
    if (eff.damageController && tgt) dealDamage(s, ctx.src, ctx.side, sideOf(s, tgt) === "player" ? "you" : "opp", amount(eff.damageController), ev);
    // "attach target Equipment you control to up to one target creature you control" (the Equipment: yours; with
    // several, you choose)
    if (eff.attachEquipment && tgt) {
      const gear = s[ctx.side].battlefield.filter((c) => c.equip);
      const g = gear.length ? gear[choose(s, `Attach which Equipment to ${tgt.name}?`, gear.map((c) => c.name), ctx.side, gear.map((c) => c.id))] : null;
      if (g) { g.attachedTo = tgt.id; g.ts = stamp(s); changed(s); ev.push({ type: "attach", id: g.id, to: tgt.id }); }
    }
    // CR 719.3a-b: this Case becomes solved
    if (eff.solve && tgt) { tgt.solved = true; changed(s); ev.push({ type: "solved", id: tgt.id }); }
    // "Exile the top N cards of your library. Choose one of them. You may play that card this turn." (unknown cards
    // can't be used: only a known card can be chosen)
    if (eff.impulse) impulse(s, eff.impulse, ctx.side, ev);
    if (eff.map) for (let i = 0; i < eff.map; i++) createToken(s, MAP, ctx.side, ev);          // "create a Map token"
    // "(you may) mill N": the top N cards of your library into your graveyard (CR 701.17a)
    if (eff.mill && (!eff.mayMill || choose(s, `Mill ${eff.mill}?`, [`Mill ${eff.mill}`, "Don't mill"], ctx.side,
      { all: s[ctx.side].library.slice(0, eff.mill).map((c) => c.id) }) === 0)) {   // (the known cards it would mill)
      const z = s[ctx.side];
      for (let i = 0; i < eff.mill; i++) {
        const top = z.library.shift() || (!(z.libraryCount > 0) ? z.libraryBottom.shift() : null);
        if (top) { putCard(s, top, ctx.side, "graveyard"); ctx.milled = [...(ctx.milled || []), top.id]; }
        else if (z.libraryCount > 0) z.libraryCount--;              // (an unknown card: irrelevant to the puzzle)
      }
      ev.push({ type: "mill", side: ctx.side, n: eff.mill });
      const landIds = (ctx.milled || []).filter((id) => { const c = z.graveyard.find((x) => x.id === id); return c && isLand(faceOf(c, {})); });
      if (landIds.length) emit(s, { type: "landsMilled", side: ctx.side, ids: landIds, obj: { id: landIds[0] } }, ev);
    }
    // "it explores" / "target creature you control explores" (eff.explore: how many times)
    if (eff.explore && tgt) for (let i = 0; i < eff.explore; i++) explore(s, tgt.id, sideOf(s, tgt) || ctx.side, ev);
    if (eff.discover) {
      const found = discover(s, eff.discover, ctx.side, ev);
      // Hit the Mother Lode: "If the discovered card's mana value is less than 10, create … tapped Treasure tokens equal to the difference"
      if (eff.treasuresDiff && found) for (let i = 0; i < eff.discover - manaValue(faceOf(found, {}).cost); i++) createToken(s, { name: "Treasure", type: "Token Artifact — Treasure", colors: [], tapped: true }, ctx.side, ev);
    }
    // Fathomless descent: "-X/-X, where X is the number of permanent cards in your graveyard" (pumpDescend: [p, t] per card)
    if (eff.pumpDescend && tgt) { const x = permanentCardsIn(s, ctx.side); addMod(s, tgt, [eff.pumpDescend[0] * x, eff.pumpDescend[1] * x]); }
    // craft (CR 702.167a): the ability's effect — return this card from exile to the battlefield transformed
    if (eff.craftReturn) {
      const owner = (ctx.src && ctx.src.owner) || ctx.side;
      const card = s[owner].exile.find((x) => x.id === ctx.selfId);
      if (card && card.faces && card.faces[1]) {
        s[owner].exile = s[owner].exile.filter((x) => x !== card);
        const perm = faceOf(card, { face: 1 });
        perm.transformed = true;
        if (card.craftedWith) perm.craftedWith = card.craftedWith;
        if (!isLand(perm)) perm.sick = true;                    // a new object (CR 400.7)
        enter(s, perm, { side: owner }, ev);
      }
    }
    // CR 701.53a: incubate N — an Incubator token with N +1/+1 counters ("X" is the source's power as it last existed)
    if (eff.incubate != null) {
      // (X: its power; how many were exiled; the spell's mana value; or a count of your permanents — "lands you control")
      const n = eff.incubate === "power" ? srcPower() : eff.incubate === "exiled" ? ctx.exiled || 0
        : eff.incubate === "eventMV" ? (ctx.event && ctx.event.mv) || 0 : amount(eff.incubate);
      createToken(s, { ...INCUBATOR, counters: n ? { "+1/+1": n } : undefined }, ctx.side, ev);
    }
    // For Mirrodin! (a 2/2 Rebel) and job select (CR 702.182a: a 1/1 colorless Hero): create it, then attach this to it
    if (eff.forMirrodin || eff.jobSelect) {
      const rebel = createToken(s, eff.jobSelect ? { name: "Hero", type: "Token Creature — Hero", pt: "1/1", colors: [] }
        : { name: "Rebel", type: "Token Creature — Rebel", pt: "2/2", colors: ["R"] }, ctx.side, ev);
      const thing = find(s, ctx.selfId);
      // (attached only if the Equipment is still on the battlefield under the same player's control, CR 301.5c)
      if (thing && sideOf(s, thing) === ctx.side && find(s, rebel.id)) {
        thing.attachedTo = rebel.id;
        thing.ts = stamp(s);
        changed(s);
        ev.push({ type: "attach", id: thing.id, to: rebel.id });
        emit(s, { type: "attached", obj: thing, side: sideOf(s, thing), host: rebel.id }, ev);
      }
    }
    // ("+X/+X, where X is the greatest power among creatures you control": counted once, before any of it applies)
    const greatest = eff.team && eff.team.pumpPer && eff.team.pumpPer.greatestPower ? Math.max(0, ...s[ctx.side].battlefield.filter(isCreature).map(power)) : null;
    if (eff.team) {
      // (an amount is decided once, as the effect begins: Ouroboroid's X doesn't grow as it gets its own counters)
      const teamPumpBy = eff.team.pumpBy != null ? amount(eff.team.pumpBy) : null;
      const teamPumpPowerBy = eff.team.pumpPowerBy != null ? amount(eff.team.pumpPowerBy) : null;
      const teamCounters = eff.team.counters ? Object.fromEntries(Object.entries(eff.team.counters).map(([k, n]) => [k, amount(n)])) : null;
      // ("Creatures and Vehicles you control gain haste": team.vehicles — a Vehicle that isn't a creature yet too)
      s[ctx.side].battlefield.filter((c) => isCreature(c) || (eff.team.vehicles && isVehicle(c))).filter((c) => matches(s, c, eff.team.filter, ctx.side) && !(eff.team.other && c.id === ctx.selfId)).forEach((c) => {
        if (eff.team.pump) addMod(s, c, eff.team.pump);
        if (teamPumpBy != null) addMod(s, c, [teamPumpBy, teamPumpBy]);   // ("+X/+X until end of turn, where X is …")
        if (teamPumpPowerBy != null) addMod(s, c, [teamPumpPowerBy, 0]);   // ("+X/+0 until end of turn, where X is …")
        if (eff.team.grant) grant(c, eff.team.grant, s);
        // "put a +1/+1 counter on each creature you control"
        if (eff.team.counters) Object.entries(teamCounters).forEach(([k, n]) => addCounters(s, c, k, n, ev));
        // "double the power and toughness of each creature you control" (CR 701.10d: +X/+Y, X and Y its power and toughness)
        if (eff.team.multiplyPT) addMod(s, c, [(eff.team.multiplyPT - 1) * power(c), (eff.team.multiplyPT - 1) * toughness(c)]);
        // "get +1/+1 for each Forest you control" (pumpPer: { per: a filter on your permanents, pump })
        if (eff.team.pumpPer) { const n = greatest != null ? greatest : s[ctx.side].battlefield.filter((x) => matches(s, x, eff.team.pumpPer.per, ctx.side)).length; addMod(s, c, [n * eff.team.pumpPer.pump[0], n * eff.team.pumpPer.pump[1]]); }
      });
    }
    momEffects(s, eff, tgt, to, ctx, ev, target, amount);
    woeEffects(s, eff, tgt, to, ctx, ev, target, amount);
    lciEffects(s, eff, tgt, to, ctx, ev, target, amount);
    mkmEffects(s, eff, tgt, to, ctx, ev, target, amount);
    otjEffects(s, eff, tgt, to, ctx, ev, target, amount);
    blbEffects(s, eff, tgt, to, ctx, ev, target, amount);
    dskEffects(s, eff, tgt, to, ctx, ev, target, amount);
    dftEffects(s, eff, tgt, to, ctx, ev, target, amount);
    tdmEffects(s, eff, tgt, to, ctx, ev, target, amount);
    finEffects(s, eff, tgt, to, ctx, ev, target, amount);
    eoeEffects(s, eff, tgt, to, ctx, ev, target, amount);
    spmEffects(s, eff, tgt, to, ctx, ev, target, amount);
    moreEffects(s, eff, tgt, to, ctx, ev, target, amount);
  }

  // Effects added in the second pass over Marvel's Spider-Man
  const SPM_EARLY = ["sandmanReturn", "hideOnCeiling", "sinisterSix"];
  // The Clone Saga II: "When you next cast a creature spell this turn, copy it, except the copy isn't legendary."
  const COPY_NEXT_NL = { effect: { copyEventSpell: { always: true, notLegendary: true } } };
  function spmEffects(s, eff, tgt, to, ctx, ev, target, amount) {
    const z = s[ctx.side], opp = ctx.side === "player" ? "opponent" : "player", me = () => find(s, ctx.selfId);
    // Sandman: "Return this card and target land card from your graveyard to the battlefield tapped."
    if (eff.sandmanReturn) [ctx.selfId, target].forEach((id) => {
      const c = z.graveyard.find((x) => x.id === id); if (!c) return;
      z.graveyard = z.graveyard.filter((x) => x !== c); const p = asFace(c, 0); p.tapped = true; p.sick = true; enter(s, p, { side: ctx.side }, ev);
    });
    // Hide on the Ceiling: "Exile X target artifacts and/or creatures. Return the exiled cards to the battlefield under their owners' control at the beginning of the next end step."
    if (eff.hideOnCeiling) [].concat(target || []).forEach((id) => {
      const c = find(s, id); if (!c) return;
      const owner = c.owner || sideOf(s, c), card = c.token ? null : c; leave(s, c, "exile", ev);
      if (card && s[owner].exile.some((x) => x.id === card.id)) delay(s, "returnExiled", ctx.side, (ctx.src && ctx.src.name) || "Return", ctx.selfId, card.id);
    });
    // Behold the Sinister Six!: "Return up to six target creature cards with different names from your graveyard to the battlefield."
    if (eff.sinisterSix && target != null) applyEffect(s, { reanimate: true }, target, ctx, ev);
    if (SPM_EARLY.some((k) => eff[k])) return;
    // Rent Is Due: "you may tap two untapped creatures and/or Treasures you control. If you do, draw a card. Otherwise, sacrifice this enchantment."
    if (eff.rentDue && ctx.side === "player") {
      const l = z.battlefield.filter((c) => !c.tapped && (isCreature(c) || isTreasure(c))), pairs = combinations(l, 2);
      const k = pairs.length ? choose(s, "Tap two untapped creatures and/or Treasures to draw a card?", [...pairs.map(([a, b]) => `Tap ${a.name} and ${b.name}`), "Don't (sacrifice it)"], "player") : 0;
      if (k < pairs.length) { pairs[k].forEach((c) => tap(s, c, ev)); draw(s, "player", 1, ev); }
      else { const m = me(); if (m) leave(s, m, "graveyard", ev, { sacrificed: true }); }
    }
    // The Clone Saga II and III
    if (eff.copyNextCreature && ctx.side === "player") s.copyNextCreature = [...(s.copyNextCreature || []), { name: (ctx.src && ctx.src.name) || "Copy", srcId: ctx.selfId }];
    if (eff.cloneName && ctx.side === "player") {
      const names = [...new Set([...z.battlefield, ...z.hand, ...z.graveyard, ...z.library, ...s[opp].battlefield].filter((c) => !c.unknown && isCreature(faceOf(c, {}))).map((c) => faceOf(c, {}).name))].sort();
      if (names.length) { const n = names[choose(s, "Choose a card name", names, "player")];
        applyEffect(s, { emblem: { name: `The Clone Saga: ${n}`, text: `Whenever a creature named ${n} deals combat damage to a player this turn, draw a card.`, triggers: [{ on: "combatDamage", filter: { name: n }, effect: { draw: 1 } }] } }, undefined, ctx, ev); }
    }
    // Hydro-Man: "untap Hydro-Man. Until your next turn, he becomes a land and gains '{T}: Add {U}.'"
    if (eff.hydroLand) { const m = me(); if (m) { untap(s, m, ev); s.tsMatters = true; addEffect(s, m, { setType: "Land" }); addEffect(s, m, { addAbilities: [{ tap: true, effect: { addMana: "U" }, text: "{T}: Add {U}" }] }); } }
    // Lady Octopus: "You may cast an artifact spell from your hand with mana value less than or equal to the number of ingenuity counters on Lady Octopus without paying its mana cost."
    if (eff.ladyOctopus && ctx.side === "player") { const n = ((me() || ctx.src || {}).counters || {}).ingenuity || 0, l = z.hand.filter((c) => !c.unknown && isArtifact(faceOf(c, {})) && !isLand(faceOf(c, {})) && manaValue(faceOf(c, {}).cost) <= n); if (l.length) castFree(s, l, "player", ev, { zone: "hand" }); }
    // Mysterio: "create a 3/3 blue Illusion Villain creature token for each nontoken Villain you control. Exile those tokens when Mysterio leaves the battlefield."
    if (eff.mysterio) { const n = z.battlefield.filter((c) => !c.token && hasType(c, "Villain")).length; for (let i = 0; i < n; i++) createTokens(s, { name: "Illusion Villain", type: "Token Creature — Illusion Villain", pt: "3/3", colors: ["U"] }, ctx.side, ev).forEach((t) => { t.exileWith = ctx.selfId; }); }
    // Gwenom: "until end of turn, you may look at the top card of your library any time and you may play cards from the top of your library. If you cast a spell this way, pay life equal to its mana value rather than pay its mana cost."
    if (eff.gwenom && ctx.side === "player") s.gwenomTurn = true;
    // Electro: "When Electro leaves the battlefield, you may pay {X}. When you do, he deals X damage to target player."
    if (eff.electroLeave && ctx.side === "player") {
      const most = manaAvailable(s);
      const x = choose(s, "Electro: pay how much (X)?", [...Array(most + 1).keys()].map(String), "player");
      const pay = x ? bestPayment(s, `{${x}}`) : [];
      if (x && pay) { spend(s, pay, ev); dealDamage(s, ctx.src, "player", "opp", x, ev); }
    }
    // Lizard, Connors's Curse: "up to one other target creature loses all abilities and becomes a green Lizard creature with base power and toughness 4/4"
    if (eff.lizardFormula && tgt) {
      s.tsMatters = true; const sup = (tgt.type || "").split("—")[0].replace(/\b(Artifact|Enchantment|Land|Planeswalker|Battle)\s*/gi, "").trim();
      addEffect(s, tgt, { loseAll: true }); addEffect(s, tgt, { setType: `${sup.includes("Creature") ? sup : `${sup} Creature`.trim()} — Lizard` }); addEffect(s, tgt, { setBase: [4, 4] }); addEffect(s, tgt, { setColor: ["G"] });
    }
    // Urban Retreat: "Return a tapped creature you control to its owner's hand: Put this card from your hand onto the battlefield."
    if (eff.urbanRetreat && ctx.side === "player") { if (tgt) leave(s, tgt, "hand", ev); const c = z.hand.find((x) => x.id === ctx.selfId); if (c) { z.hand = z.hand.filter((x) => x !== c); enter(s, asFace(c, 0), { side: "player" }, ev); } }
    // Iron Spider: "Put a +1/+1 counter on each artifact creature and/or Vehicle you control."
    if (eff.ironSpider) z.battlefield.filter((c) => (isArtifact(c) && isCreature(c)) || isVehicle(c)).forEach((c) => addCounters(s, c, "+1/+1", 1, ev));
    // The Spot: "When The Spot dies, put him on the bottom of his owner's library. If you do, return the exiled cards to their owners' hands."
    if (eff.spotDies) {
      const ow = (ctx.src && ctx.src.owner) || ctx.side, c = s[ow].graveyard.find((x) => x.id === ctx.selfId);
      if (c) {
        s[ow].graveyard = s[ow].graveyard.filter((x) => x !== c); s[ow].libraryBottom.push(c);
        ["player", "opponent"].forEach((sd) => s[sd].exile.filter((x) => x.exiledBy === ctx.selfId).forEach((x) => { s[sd].exile = s[sd].exile.filter((y) => y !== x); delete x.exiledBy; if (sd === "player") s.player.hand.push(x); else s.opponent.handCount = (s.opponent.handCount || 0) + 1; }));
      }
    }
  }

  // Effects added in the second pass over Edge of Eternities
  const EOE_ROBOT = { name: "Robot", type: "Token Artifact Creature — Robot", pt: "2/2", colors: [] };
  const EOE_EARLY = ["singularity", "chorale"];
  // Terminal Velocity: "When this permanent leaves the battlefield, it deals damage equal to its mana value to each creature" (pushed from leave)
  const TV_LEAVE = { effect: { tvDamage: true } };
  // Requiem Monolith: "Whenever this creature is dealt damage, you draw that many cards and lose that much life."
  const REQUIEM_T = { on: "dealtDamage", self: true, effect: { requiemDraw: true } };
  function eoeEffects(s, eff, tgt, to, ctx, ev, target, amount) {
    const z = s[ctx.side], opp = ctx.side === "player" ? "opponent" : "player", me = () => find(s, ctx.selfId);
    // Singularity Rupture: "Destroy all creatures, then any number of target players each mill half their library, rounded down."
    if (eff.singularity) {
      battlefieldNow(s).map(({ card }) => card).filter(isCreature).forEach((c) => { if (find(s, c.id) && !survivesDestroy(s, c, ev)) leave(s, c, "graveyard", ev); });
      [].concat(target || []).forEach((p) => { if (p !== "opp" && p !== "you") return; const sd = (p === "opp") === (ctx.side === "player") ? "opponent" : "player", o = s[sd];
        millSide(s, sd, Math.floor((o.library.length + (o.libraryCount || 0) + o.libraryBottom.length) / 2) + (sd !== ctx.side ? 4 * z.battlefield.filter((c) => c.waterCrystal && !(c.st && c.st.lost)).length : 0), ev); });
    }
    // Chorale of the Void: "put target creature card from defending player's graveyard onto the battlefield under your control tapped and attacking"
    if (eff.chorale) {
      const c = s[opp].graveyard.find((x) => x.id === target);
      if (c) {
        s[opp].graveyard = s[opp].graveyard.filter((x) => x !== c);
        const p = asFace(c, 0); p.tapped = true; p.sick = true; p.owner = opp; enter(s, p, { side: ctx.side }, ev);
        if (s.combat && find(s, p.id)) { s.combat.attackers.push(p.id); if (s.combat.blocks) { s.combat.blocks[p.id] = []; s.combat.blocked[p.id] = false; } }
      }
    }
    if (EOE_EARLY.some((k) => eff[k])) return;
    // Tezzeret 0: "Untap target artifact or creature. If it's an artifact creature, put a +1/+1 counter on it."
    if (eff.counterIfArtifactCreature && tgt && isArtifact(tgt) && isCreature(tgt)) addCounters(s, tgt, "+1/+1", 1, ev);
    // Tezzeret's emblem: "put three +1/+1 counters on target artifact you control. If it's not a creature, it becomes a 0/0 Robot artifact creature."
    if (eff.tezEmblem && tgt) { addCounters(s, tgt, "+1/+1", 3, ev); if (!isCreature(tgt)) applyEffect(s, { becomeCreature: true, setBase: [0, 0], addSubtype: "Robot" }, tgt.id, ctx, ev); }
    // Weftwalking: "shuffle your hand and graveyard into your library, then draw seven cards"
    if (eff.weftShuffle && ctx.side === "player") {
      z.libraryCount = (z.libraryCount || 0) + z.hand.length + z.graveyard.length + z.library.length + z.libraryBottom.length;
      z.hand = []; z.graveyard = []; z.library = []; z.libraryBottom = [];
      draw(s, "player", 7, ev);
    }
    // Dyadrine: "you may remove a +1/+1 counter from each of two creatures you control. If you do, draw a card and create a 2/2 colorless Robot artifact creature token."
    if (eff.dyadrine && ctx.side === "player") {
      const l = z.battlefield.filter((c) => isCreature(c) && ((c.counters || {})["+1/+1"] || 0) > 0), pairs = combinations(l, 2);
      const k = pairs.length ? choose(s, "Remove a +1/+1 counter from two creatures?", [...pairs.map(([a, b]) => `${a.name} and ${b.name}`), "Don't"], "player") : 0;
      if (k < pairs.length) { pairs[k].forEach((c) => { c.counters = { ...c.counters, "+1/+1": c.counters["+1/+1"] - 1 }; changed(s); }); draw(s, "player", 1, ev); createToken(s, EOE_ROBOT, "player", ev); }
    }
    // Space-Time Anomaly: "Target player mills cards equal to your life total."
    if (eff.millYourLife && (to === "opp" || to === "you")) millSide(s, (to === "opp") === (ctx.side === "player") ? "opponent" : "player", Math.max(0, s[ctx.side].life ?? 20), ev);
    // The Endstone: "your life total becomes half your starting life total, rounded up" (20: 10)
    if (eff.endstoneLife && s[ctx.side].life != null) { const d = 10 - s[ctx.side].life; if (d) changeLife(s, ctx.side === "player" ? "you" : "opp", d, ev); }
    // Mutinous Massacre: "Choose odd or even. Destroy each creature with mana value of the chosen quality. Then gain control of all creatures until end of turn. Untap them. They gain haste until end of turn."
    if (eff.massacre != null) {
      battlefieldNow(s).map(({ card }) => card).filter((c) => isCreature(c) && manaValue(c.cost) % 2 === eff.massacre).forEach((c) => { if (find(s, c.id) && !survivesDestroy(s, c, ev)) leave(s, c, "graveyard", ev); });
      s[opp].battlefield.filter(isCreature).forEach((c) => { s[opp].battlefield = s[opp].battlefield.filter((x) => x !== c); z.battlefield.push(c); c.sick = true; changed(s); });
      z.battlefield.filter(isCreature).forEach((c) => { untap(s, c, ev); grant(c, ["haste"], s); });
    }
    // Terminal Velocity: "You may put an artifact or creature card from your hand onto the battlefield. That permanent gains haste, '…leaves…' and 'At the beginning of your end step, sacrifice this permanent.'"
    if (eff.terminalVelocity && ctx.side === "player") {
      const l = z.hand.filter((c) => !c.unknown && (isArtifact(faceOf(c, {})) || isCreature(faceOf(c, {}))));
      const k = l.length ? choose(s, "Put an artifact or creature card onto the battlefield?", [...l.map((c) => `Put ${c.name}`), "Don't"], "player", [...l.map((c) => c.id), null]) : 0;
      if (k < l.length) {
        const c = l[k]; z.hand = z.hand.filter((x) => x !== c); c.sick = true; const p = asFace(c, 0); p.terminalVelocity = true;
        enter(s, p, { side: "player" }, ev);
        const now = find(s, p.id); if (now) { grant(now, ["haste"], s); delay(s, "sacrificeIt", "player", now.name, now.id, now.id); }
      }
    }
    if (eff.tvDamage) battlefieldNow(s).map(({ card }) => card).filter(isCreature).forEach((c) => dealDamage(s, ctx.src, ctx.side, c.id, (ctx.event && ctx.event.mv) || 0, ev));
    // Memorial Vault: "Exile the top X cards of your library, where X is one plus the mana value of the sacrificed artifact. You may play those cards this turn."
    if (eff.vaultExile && ctx.side === "player") for (let i = 0; i < 1 + (ctx.sacMV || 0); i++) { const c = exileTop(s, "player"); if (c) c.playable = true; }
    // Requiem Monolith: the creature gains the trigger; its controller may have this artifact deal 1 damage to it
    if (eff.requiem && tgt) {
      addEffect(s, tgt, { addTriggers: [defId(REQUIEM_T)] }); if (!s.listens.includes("dealtDamage")) s.listens.push("dealtDamage");
      const who = sideOf(s, tgt);
      if (choose(s, `Have ${(ctx.src && ctx.src.name) || "it"} deal 1 damage to ${tgt.name}?`, ["Deal 1 damage", "Don't"], who, tgt.id) === 0) dealDamage(s, ctx.src, ctx.side, tgt.id, 1, ev);
    }
    if (eff.requiemDraw) { const n = (ctx.event && ctx.event.count) || 0; draw(s, ctx.side, n, ev); changeLife(s, ctx.side === "player" ? "you" : "opp", -n, ev); }
    // Pinnacle Starcage: "exile all artifacts and creatures with mana value 2 or less until this artifact leaves the battlefield"
    if (eff.starcage) {
      const m = me();
      battlefieldNow(s).map(({ card }) => card).filter((c) => c.id !== ctx.selfId && (isArtifact(c) || isCreature(c)) && manaValue(c.cost) <= 2).forEach((c) => {
        if (!find(s, c.id)) return;
        const owner = c.owner || sideOf(s, c), card = c.token ? null : c; leave(s, c, "exile", ev);
        const ex = card && s[owner].exile.find((x) => x.id === card.id); if (ex) { if (m && find(s, m.id)) ex.exiledUntil = m.id; else returnExiledCard(s, ex, owner, ev); }
      });
    }
    // Pinnacle Starcage: "Put each card exiled with this artifact into its owner's graveyard, then create a 2/2 colorless Robot artifact creature token for each card put into a graveyard this way. Sacrifice this artifact."
    if (eff.starcageDump) {
      let n = 0;
      ["player", "opponent"].forEach((sd) => s[sd].exile.filter((c) => c.exiledUntil === ctx.selfId).forEach((c) => { s[sd].exile = s[sd].exile.filter((x) => x !== c); delete c.exiledUntil; putCard(s, c, sd, "graveyard"); n++; }));
      for (let i = 0; i < n; i++) createToken(s, EOE_ROBOT, ctx.side, ev);
      const m = me(); if (m) leave(s, m, "graveyard", ev, { sacrificed: true });
    }
    // Zero Point Ballad: "Destroy all creatures with toughness X or less. You lose X life. If X is 6 or more, return a creature card put into a graveyard this way to the battlefield under your control."
    if (eff.zeroPoint) {
      const x = ctx.x || 0, gone = [];
      battlefieldNow(s).map(({ card }) => card).filter((c) => isCreature(c) && toughness(c) <= x).forEach((c) => { if (find(s, c.id) && !survivesDestroy(s, c, ev)) { leave(s, c, "graveyard", ev); if (!c.token) gone.push(c.id); } });
      changeLife(s, ctx.side === "player" ? "you" : "opp", -x, ev);
      if (x >= 6) {
        const l = ["player", "opponent"].flatMap((sd) => s[sd].graveyard.filter((c) => gone.includes(c.id)).map((c) => [c, sd]));
        if (l.length) { const [c, sd] = l[choose(s, "Return which creature card?", l.map(([c]) => c.name), ctx.side, l.map(([c]) => c.id))];
          s[sd].graveyard = s[sd].graveyard.filter((y) => y !== c); const p = asFace(c, 0); p.sick = true; p.owner = sd; enter(s, p, { side: ctx.side }, ev); }
      }
    }
    // Entropic Battlecruiser: "each opponent discards a card. Each opponent who can't loses 3 life."
    if (eff.entropic) { if ((s[opp].handCount || 0) > 0) applyEffect(s, { discard: 1 }, ctx.side === "player" ? "opp" : "you", ctx, ev); else changeLife(s, ctx.side === "player" ? "opp" : "you", -3, ev); }
    // "Sacrifice this Aura" (Chorale of the Void's void clause)
    if (eff.sacrificeMe) { const m = me(); if (m) leave(s, m, "graveyard", ev, { sacrificed: true }); }
  }

  // Effects added in the second pass over Final Fantasy
  const HERO = { name: "Hero", type: "Token Creature — Hero", pt: "1/1", colors: [] };
  const TAPPED_TREASURE = { name: "Treasure", type: "Token Artifact — Treasure", colors: [], tapped: true };
  // (effects whose target is a card on the stack, in exile or in a graveyard, or a group of targets: run before the
  // target is looked for on the battlefield)
  const FIN_EARLY = ["darknessReturn", "golbez", "phoenixReturn", "ardyn", "louisoix", "gogoCopy", "raubahn", "earthDistribute"];
  // "Exile the top card of your library": a known card (returned, now in exile), or one of the unknown ones
  function exileTop(s, side) {
    const z = s[side], c = z.library.shift() || (!(z.libraryCount > 0) ? z.libraryBottom.shift() : null);
    if (c) { putCard(s, c, side, "exile"); return c; }
    if (z.libraryCount > 0) { z.libraryCount--; z.exileUnknown = (z.exileUnknown || 0) + 1; }
    return null;
  }
  // a player mills n cards (known ones first, then unknown ones counted off)
  function millSide(s, side, n, ev) {
    const z = s[side];
    for (let i = 0; i < n; i++) {
      const c = z.library.shift() || (!(z.libraryCount > 0) ? z.libraryBottom.shift() : null);
      if (c) putCard(s, c, side, "graveyard");
      else if (z.libraryCount > 0) { z.libraryCount--; z.gyUnknown = (z.gyUnknown || 0) + 1; } else break;
    }
    ev.push({ type: "mill", side, n });
  }
  // "Target opponent gains control of …": it changes control and leaves combat (CR 506.4)
  function giveAway(s, c, ev) {
    const from = sideOf(s, c), to = from === "player" ? "opponent" : "player";
    s[from].battlefield = s[from].battlefield.filter((x) => x !== c); s[to].battlefield.push(c);
    if (s.combat) s.combat.attackers = s.combat.attackers.filter((id) => id !== c.id);
    c.sick = true; changed(s); ev.push({ type: "control", id: c.id, to });
  }
  function attachTo(s, e, c, ev) {
    e.attachedTo = c.id; e.ts = stamp(s); changed(s);
    ev.push({ type: "attach", id: e.id, to: c.id });
    emit(s, { type: "attached", obj: e, side: sideOf(s, e), host: c.id }, ev);
  }
  const lessGeneric = (cost, k) => { const p = parseCost(cost), n = Math.max(0, p.generic - k); return ((n ? `{${n}}` : "") + p.pips.map((q) => `{${q}}`).join("")) || "{0}"; };
  function finEffects(s, eff, tgt, to, ctx, ev, target, amount) {
    const z = s[ctx.side], opp = ctx.side === "player" ? "opponent" : "player", me = () => find(s, ctx.selfId);
    const live = (k) => s[ctx.side].battlefield.filter((c) => c[k] && !(c.st && c.st.lost)).length;
    // The Darkness Crystal: "Put target creature card exiled with The Darkness Crystal onto the battlefield tapped under your control with two additional +1/+1 counters on it."
    if (eff.darknessReturn) for (const sd of ["player", "opponent"]) {
      const c = s[sd].exile.find((x) => x.id === target && x.exiledBy === ctx.selfId);
      if (!c) continue;
      s[sd].exile = s[sd].exile.filter((x) => x !== c);
      const p = asFace(c, 0); delete p.exiledBy; p.tapped = true; p.sick = true; p.owner = sd; p.counters = { ...(p.counters || {}), "+1/+1": 2 };
      enter(s, p, { side: ctx.side }, ev);
    }
    // Golbez: "return target creature card from your graveyard to your hand. Then if you control eight or more artifacts, each opponent loses life equal to that card's power."
    if (eff.golbez) {
      const c = z.graveyard.find((x) => x.id === target);
      if (c) {
        z.graveyard = z.graveyard.filter((x) => x !== c); z.hand.push(c);
        if (z.battlefield.filter(isArtifact).length >= 8) changeLife(s, ctx.side === "player" ? "opp" : "you", -Math.max(0, power(faceOf(c, {}))), ev);
      }
    }
    // Phoenix, Warden of Fire III: "Return any number of target creature cards with total mana value 6 or less from your graveyard to the battlefield. Exile Phoenix, then return it to the battlefield (front face up)."
    if (eff.phoenixReturn) { if (target != null) applyEffect(s, { reanimate: true }, target, ctx, ev); applyEffect(s, { blinkTransformed: { face: 0 } }, undefined, ctx, ev); }
    // Ardyn, the Usurper: "exile up to one target creature card from a graveyard. If you exiled a card this way, create a token that's a copy of that card, except it's a 5/5 black Demon."
    if (eff.ardyn) for (const sd of ["player", "opponent"]) {
      const c = s[sd].graveyard.find((x) => x.id === target);
      if (!c) continue;
      s[sd].graveyard = s[sd].graveyard.filter((x) => x !== c); putCard(s, c, sd, "exile");
      const v = copyValues(faceOf(c, {})); v.pt = "5/5"; v.colors = ["B"]; v.type = `${(v.type || "Creature").split("—")[0].trim()} — Demon`;
      createTokens(s, v, ctx.side, ev);
    }
    // Louisoix's Sacrifice: "Counter target activated ability, triggered ability, or noncreature spell."
    if (eff.louisoix) {
      if (typeof target === "string" && target.startsWith("stack:")) applyEffect(s, { counterAbility: true }, target, { ...ctx, selfId: null }, ev);
      else applyEffect(s, { counterTargetSpell: true }, target, ctx, ev);
    }
    // Gogo: "Copy target activated or triggered ability you control X times. You may choose new targets for the copies."
    if (eff.gogoCopy) {
      const k = typeof target === "string" && target.startsWith("stack:") ? Number(target.slice(6)) : -1, item = s.stack[s.stack.length - 1 - k];
      if (item && (item.kind === "trigger" || item.kind === "ability")) for (let i = 0; i < (ctx.x || 0); i++) copyAbility(s, item, ctx.side, ev);
    }
    // Raubahn: "attach up to one target Equipment you control to target attacking creature"
    if (eff.raubahn) { const [e, c] = [].concat(target || []).map((id) => (id != null ? find(s, id) : null)); if (e && c && e.equip && sideOf(s, e) === ctx.side && isCreature(c)) attachTo(s, e, c, ev); }
    // The Earth Crystal: "Distribute two +1/+1 counters among one or two target creatures you control."
    if (eff.earthDistribute) { const ts = [].concat(target || []).map((id) => find(s, id)).filter(Boolean); ts.forEach((c) => addCounters(s, c, "+1/+1", ts.length === 1 ? 2 : 1, ev)); }
    if (FIN_EARLY.some((k) => eff[k])) return;
    // Stiltzkin: "Target opponent gains control of another target permanent you control. If they do, you draw a card."
    if (eff.giveControl && tgt && sideOf(s, tgt) === ctx.side) { giveAway(s, tgt, ev); draw(s, ctx.side, 1, ev); }
    // Kain: "that player gains control of Kain. If they do, you draw that many cards, create that many tapped Treasure tokens, then lose that much life."
    if (eff.kain) {
      const m = me(), n = (ctx.event && ctx.event.count) || 0;
      if (m && sideOf(s, m) === ctx.side) {
        giveAway(s, m, ev); draw(s, ctx.side, n, ev);
        for (let i = 0; i < n; i++) createToken(s, TAPPED_TREASURE, ctx.side, ev);
        changeLife(s, ctx.side === "player" ? "you" : "opp", -n, ev);
      }
    }
    // Ultima: "Destroy all artifacts and creatures. End the turn." (CR 723.1: the stack is exiled, then the cleanup step;
    // abilities that triggered meanwhile still go on the stack there, CR 514.3a)
    if (eff.ultima) {
      battlefieldNow(s).map(({ card }) => card).filter((c) => isArtifact(c) || isCreature(c)).forEach((c) => { if (find(s, c.id) && !survivesDestroy(s, c, ev)) leave(s, c, "graveyard", ev); });
      s.stack.forEach((w) => { if (w.kind === "spell" && !w.copy) putCard(s, w.card, w.card.owner || "player", "exile"); });
      s.stack = []; s.combat = null; delete s.delayed; delete s.delayedEoc; delete s.delayedBoc;
      s.turnEnding = true; s.phase = "cleanup"; ev.push({ type: "turnEnded" });
    }
    // Cecil, Dark Knight: "you lose that much life. Then if your life total is less than or equal to half your starting life total, untap Cecil and transform it." (starting life total: 20)
    if (eff.cecil) {
      changeLife(s, ctx.side === "player" ? "you" : "opp", -((ctx.event && ctx.event.count) || 0), ev);
      const m = me(), life = s[ctx.side].life;
      if (m && life != null && life <= 10) { untap(s, m, ev); transform(s, m, ev); }
    }
    // Zenos yae Galvus: "choose a creature an opponent controls. Until end of turn, creatures other than Zenos yae Galvus and the chosen creature get -2/-2."
    if (eff.zenos) {
      const m = me(), l = s[opp].battlefield.filter(isCreature);
      const c = l.length ? l[choose(s, "Zenos: choose a creature an opponent controls", l.map((x) => x.name), ctx.side, l.map((x) => x.id))] : null;
      if (m) m.zenosChosen = c ? c.id : null;
      battlefieldNow(s).map(({ card }) => card).filter((x) => isCreature(x) && x.id !== ctx.selfId && (!c || x.id !== c.id)).forEach((x) => addMod(s, x, [-2, -2]));
    }
    // Zodiark: "each player sacrifices half the non-God creatures they control of their choice, rounded down"
    if (eff.zodiark) for (const sd of [ctx.side, opp]) {
      const n = Math.floor(s[sd].battlefield.filter((c) => isCreature(c) && !hasType(c, "God")).length / 2);
      for (let i = 0; i < n; i++) {
        const l = s[sd].battlefield.filter((c) => isCreature(c) && !hasType(c, "God"));
        if (!l.length) break;
        leave(s, l[choose(s, `Sacrifice a creature (${i + 1} of ${n})`, l.map((c) => c.name), sd, l.map((c) => c.id))], "graveyard", ev, { sacrificed: true });
      }
    }
    // Firion: "create a token that's a copy of it, except it has 'This Equipment's equip abilities cost {2} less to activate.'"
    if (eff.firionCopy && tgt) { const v = copyValues(tgt); if (v.equip && v.equip.cost) v.equip = { ...v.equip, cost: lessGeneric(v.equip.cost, 2) }; createTokens(s, v, ctx.side, ev); }
    // Gilgamesh: "look at the top six cards of your library. You may put any number of Equipment cards from among them onto the battlefield. Put the rest on the bottom … When you put one or more Equipment onto the battlefield this way, you may attach one of them to a Samurai you control."
    if (eff.gilgamesh && ctx.side === "player") {
      const seen = z.library.splice(0, 6), put = [];
      seen.forEach((c) => {
        if (hasType(faceOf(c, {}), "Equipment") && choose(s, `Put ${c.name} onto the battlefield?`, ["Put it", "To the bottom"], "player", c.id) === 0) { const p = asFace(c, 0); enter(s, p, { side: "player" }, ev); if (find(s, p.id)) put.push(p.id); }
        else z.libraryBottom.push(c);
      });
      const eqs = put.map((id) => find(s, id)).filter(Boolean), sams = z.battlefield.filter((c) => isCreature(c) && hasType(c, "Samurai"));
      if (eqs.length && sams.length) {
        const opts = eqs.flatMap((e) => sams.map((c) => [e, c]));
        const k = choose(s, "Attach one of them to a Samurai you control?", [...opts.map(([e, c]) => `${e.name} to ${c.name}`), "Don't"], "player");
        if (k < opts.length) attachTo(s, opts[k][0], opts[k][1], ev);
      }
    }
    // Summon: Brynhildr I: "Exile the top card of your library. During any turn you put a lore counter on this Saga, you may play that card."
    if (eff.brynhildr && ctx.side === "player") { const c = exileTop(s, "player"); if (c) c.playable = true; }
    // Brynhildr II, III: "When you next cast a creature spell this turn, it gains haste until end of turn."
    if (eff.nextCreatureHaste && ctx.side === "player") s.nextCreatureHaste = true;
    // Vaan: "exile the top card of that player's library. You may cast it. If you don't, create a Treasure token." (the
    // opponent's library is unknown cards: you get the Treasure)
    if (eff.vaan && ctx.side === "player") { exileTop(s, "opponent"); createToken(s, { name: "Treasure", type: "Token Artifact — Treasure", colors: [] }, "player", ev); }
    // Ancient Adamantoise: "When this creature dies, exile it and create ten tapped Treasure tokens."
    if (eff.adamantoiseDies) {
      const ow = s[(ctx.src && ctx.src.owner) || ctx.side], c = ow.graveyard.find((x) => x.id === ctx.selfId);
      if (c) { ow.graveyard = ow.graveyard.filter((x) => x !== c); putCard(s, c, (ctx.src && ctx.src.owner) || ctx.side, "exile"); }
      for (let i = 0; i < 10; i++) createToken(s, TAPPED_TREASURE, ctx.side, ev);
    }
    // Bartz and Boko: "each other Bird you control deals damage equal to its power to target creature an opponent controls"
    if (eff.bartz && tgt) z.battlefield.filter((c) => isCreature(c) && hasType(c, "Bird") && c.id !== ctx.selfId).forEach((b) => { if (find(s, tgt.id)) dealDamage(s, b, ctx.side, tgt.id, Math.max(0, power(b)), ev); });
    // Esper Origins: "If this spell was cast from a graveyard, exile it, then put it onto the battlefield transformed … with a finality counter on it." (done as it leaves the stack)
    if (eff.esperReturn && ctx.fromGraveyard) s.esperReturn = true;
    // Summon: Esper Maduin I: "Reveal the top card of your library. If it's a permanent card, put it into your hand."
    if (eff.revealTopPermanent && ctx.side === "player") { const top = z.library[0]; if (top && isPermanent(faceOf(top, {}))) { z.library.shift(); z.hand.push(top); } }
    // Summoner's Grimoire: "you may put a creature card from your hand onto the battlefield. If that card is an enchantment card, it enters tapped and attacking."
    if (eff.grimoire && ctx.side === "player") {
      const l = z.hand.filter((c) => !c.unknown && isCreature(faceOf(c, {})));
      const k = l.length ? choose(s, "Put a creature card from your hand onto the battlefield?", [...l.map((c) => `Put ${c.name}`), "Don't"], "player", [...l.map((c) => c.id), null]) : 0;
      if (k < l.length) {
        const c = l[k]; z.hand = z.hand.filter((x) => x !== c); c.sick = true;
        const p = asFace(c, 0), ench = typeHas(p, /enchantment/i); if (ench) p.tapped = true;
        enter(s, p, { side: "player" }, ev);
        if (ench && s.combat && find(s, p.id)) { s.combat.attackers.push(p.id); if (s.combat.blocks) { s.combat.blocks[p.id] = []; s.combat.blocked[p.id] = false; } }
      }
    }
    // Choco: "look at that many cards from the top of your library. You may put one of them into your hand. Then put any number of land cards from among them onto the battlefield tapped and the rest into your graveyard."
    if (eff.choco && ctx.side === "player") {
      const n = ((s.combat && s.combat.attackers) || []).map((id) => find(s, id)).filter((c) => c && hasType(c, "Bird")).length;
      const seen = z.library.splice(0, n), unknown = Math.min(n - seen.length, z.libraryCount || 0);
      z.libraryCount = (z.libraryCount || 0) - unknown; z.gyUnknown = (z.gyUnknown || 0) + unknown;
      let rest = [...seen];
      if (rest.length) { const k = choose(s, "Put one of them into your hand?", [...rest.map((c) => c.name), "None"], "player", [...rest.map((c) => c.id), null]); if (k < rest.length) { z.hand.push(rest[k]); rest = rest.filter((_, i) => i !== k); } }
      rest.forEach((c) => {
        if (isLand(faceOf(c, {})) && choose(s, `Put ${c.name} onto the battlefield tapped?`, ["Onto the battlefield", "Into the graveyard"], "player", c.id) === 0) { const p = asFace(c, 0); p.tapped = true; enter(s, p, { side: "player" }, ev); }
        else putCard(s, c, "player", "graveyard");
      });
    }
    // "Each opponent mills X cards" (The Water Crystal: "If an opponent would mill one or more cards, they mill that many cards plus four instead.")
    if (eff.oppMill != null && ctx.side === "player") millSide(s, "opponent", amount(eff.oppMill) + 4 * live("waterCrystal"), ev);
    // Jidoor (Overture): "Target opponent mills half their library, rounded down."
    if (eff.oppMillHalf && ctx.side === "player") { const o = s.opponent; millSide(s, "opponent", Math.floor((o.library.length + (o.libraryCount || 0) + o.libraryBottom.length) / 2) + 4 * live("waterCrystal"), ev); }
    // Tellah: "create a 1/1 colorless Hero creature token. If four or more mana was spent to cast that spell, draw two cards. If eight or more mana was spent to cast that spell, sacrifice Tellah and it deals that much damage to each opponent."
    if (eff.tellah) {
      createToken(s, HERO, ctx.side, ev);
      const n = (ctx.event && ctx.event.spent) || 0, m = me();
      if (n >= 4) draw(s, ctx.side, 2, ev);
      if (n >= 8) { const src = m ? lastKnown(m) : ctx.src; if (m) leave(s, m, "graveyard", ev, { sacrificed: true }); dealDamage(s, src, ctx.side, ctx.side === "player" ? "opp" : "you", n, ev); }
    }
    // Esper Terra I–III: "Create a token that's a copy of target nonlegendary enchantment you control. It gains haste. If it's a Saga, put up to three lore counters on it. Sacrifice it at the beginning of your next end step."
    if (eff.terraCopy && tgt) createTokens(s, copyValues(tgt), ctx.side, ev).forEach((t) => {
      if (!find(s, t.id)) return;
      grant(t, ["haste"], s);
      if (t.chapters) { const k = choose(s, "Put how many lore counters on it?", ["Three", "Two", "One", "None"], ctx.side, t.id); if (k < 3) addCounters(s, t, "lore", 3 - k, ev); }
      delay(s, "sacrificeIt", ctx.side, t.name, t.id, t.id);
    });
    // Vivi Ornitier: "Add X mana in any combination of {U} and/or {R}, where X is Vivi Ornitier's power."
    if (eff.addURPower && ctx.side === "player") { const m = me(); if (m) s.pool.push(...Array(Math.max(0, power(m))).fill("UR")); }
    // Hideaway N (CR 702.75a): "look at the top N cards of your library, exile one face down, then put the rest on the bottom in a random order"
    if (eff.hideaway && ctx.side === "player") {
      const seen = z.library.splice(0, eff.hideaway);
      if (seen.length) {
        const k = choose(s, "Hideaway: exile which card face down?", seen.map((c) => c.name), "player", seen.map((c) => c.id)), c = seen[k];
        putCard(s, c, "player", "exile"); c.exiledBy = ctx.selfId;
        z.libraryBottom.push(...seen.filter((_, i) => i !== k));
      } else if (z.libraryCount > 0) { z.libraryCount--; z.exileUnknown = (z.exileUnknown || 0) + 1; }
    }
    // Clive's Hideaway: "You may play the exiled card without paying its mana cost if you control four or more legendary creatures."
    if (eff.hideawayPlay && ctx.side === "player" && z.battlefield.filter((c) => isCreature(c) && /\blegendary\b/i.test(c.type || "")).length >= 4) {
      const c = z.exile.find((x) => x.exiledBy === ctx.selfId);
      if (c && isLand(faceOf(c, {}))) {
        if (landsPlayed(s) < landsAllowed(s) && choose(s, `Play ${c.name}?`, ["Play it", "Don't"], "player", c.id) === 0) { z.exile = z.exile.filter((x) => x !== c); s.landsPlayed = landsPlayed(s) + 1; delete c.exiledBy; enter(s, asFace(c, 0), { side: "player" }, ev); }
      } else if (c) castFree(s, c, "player", ev, { zone: "exile" });
    }
    // Lasting Fayth: "Create a 1/1 colorless Hero creature token. Put a +1/+1 counter on it for each land you control."
    if (eff.lastingFayth) { const t = createToken(s, HERO, ctx.side, ev); if (t && find(s, t.id)) addCounters(s, t, "+1/+1", z.battlefield.filter(isLand).length, ev); }
    // Lightning, Security Sergeant: "exile the top card of your library. You may play that card for as long as you control Lightning."
    if (eff.lightningExile && ctx.side === "player") { const c = exileTop(s, "player"); if (c) c.playable = true; }
    // Y'shtola Rhul: "exile target creature you control, then return it to the battlefield under its owner's control. Then if it's the first end step of the turn, there is an additional end step after this step."
    if (eff.yshtola && tgt) { applyEffect(s, { blinkTarget: {} }, tgt.id, ctx, ev); if ((s.endSteps || 0) === 1) s.extraEnds = (s.extraEnds || 0) + 1; }
    // Ninja's Blades: "draw a card, then discard a card. That player loses life equal to the discarded card's mana value."
    if (eff.bladesLoot && ctx.side === "player") {
      draw(s, "player", 1, ev);
      if (z.hand.length) { const c = z.hand[choose(s, "Discard a card", z.hand.map((x) => x.name), "player", z.hand.map((x) => x.id))]; discardCard(s, c, ev); const mv = c.unknown ? 0 : manaValue(faceOf(c, {}).cost); if (mv) changeLife(s, "opp", -mv, ev); }
    }
    // Buster Sword: "draw a card, then you may cast a spell from your hand with mana value less than or equal to that damage without paying its mana cost"
    if (eff.buster && ctx.side === "player") {
      draw(s, "player", 1, ev);
      const n = (ctx.event && ctx.event.count) || 0, l = z.hand.filter((c) => !c.unknown && !isLand(faceOf(c, {})) && manaValue(faceOf(c, {}).cost) <= n);
      if (l.length) castFree(s, l, "player", ev, { zone: "hand" });
    }
    // The Regalia: "reveal cards from the top of your library until you reveal a land card. Put that card onto the battlefield tapped and the rest on the bottom of your library in a random order."
    if (eff.regalia && ctx.side === "player") {
      const i = z.library.findIndex((c) => isLand(faceOf(c, {})));
      if (i >= 0) { const seen = z.library.splice(0, i + 1), land = seen.pop(); z.libraryBottom.push(...seen); const p = asFace(land, 0); p.tapped = true; enter(s, p, { side: "player" }, ev); }
    }
  }

  // Effects added in the second pass over Tarkir: Dragonstorm
  function tdmEffects(s, eff, tgt, to, ctx, ev, target, amount) {
    const z = s[ctx.side], me = () => find(s, ctx.selfId);
    // Ugin −11: "Search your library for any number of colorless nonland cards, exile them, then shuffle. Until end of turn, you may cast those cards without paying their mana costs."
    if (eff.uginSearch && ctx.side === "player") {
      [...z.library, ...z.libraryBottom].filter((c) => !isLand(faceOf(c, {})) && !colorsOf(faceOf(c, {})).length).forEach((c) => {
        if (choose(s, `Exile ${c.name}?`, ["Exile it", "Leave it"], "player", c.id) !== 0) return;
        z.library = z.library.filter((x) => x !== c); z.libraryBottom = z.libraryBottom.filter((x) => x !== c); c.playable = true; c.freeCast = true; putCard(s, c, "player", "exile");
      });
      z.libraryCount = (z.libraryCount || 0) + z.library.length + z.libraryBottom.length; z.library = []; z.libraryBottom = [];
    }
    // Stormscale Scion: storm — "copy it for each spell cast before it this turn"
    if (eff.stormCopies) { const item = s.stack.find((x) => x.kind === "spell" && x.id === (ctx.event && ctx.event.id)); for (let i = 1; item && i < ((ctx.event && ctx.event.count) || 1); i++) copySpell(s, item, { side: ctx.side }, ev); }
    // Naga Fleshcrafter (renew): "Put a +1/+1 counter on target nonlegendary creature you control. Each other creature you control becomes a copy of that creature until end of turn."
    if (eff.nagaCopy && tgt) { addCounters(s, tgt, "+1/+1", 1, ev); const v = copyValues(tgt); z.battlefield.filter((c) => isCreature(c) && c !== tgt).forEach((c) => becomeCopyOf(s, c, v)); }
    // All-Out Assault: "if it's your main phase, there is an additional combat phase after this phase followed by an additional main phase. When you next attack this turn, untap each creature you control."
    if (eff.allOutAssault && ctx.side === "player") {
      if (s.phase === "main1") s.extraMainAfterCombat = "thenCombat";
      else if (s.phase === "main2") { s.combatsAfterMain2 = (s.combatsAfterMain2 || 0) + 1; s.keepMain2 = true; s.extraMainAfterCombat = "end"; }
      s.untapOnNextAttack = true;
    }
    // Mardu Siegebreaker: "for each opponent, create a tapped token that's a copy of the exiled card attacking that opponent. At the beginning of your next end step, sacrifice those tokens."
    if (eff.siegebreaker) {
      const c = ["player", "opponent"].flatMap((sd) => s[sd].exile).find((x) => x.exiledUntil === ctx.selfId);
      if (c) createTokens(s, { ...copyValues(faceOf(c, {})), tapped: true }, ctx.side, ev).forEach((tok) => {
        if (s.combat && find(s, tok.id)) { s.combat.attackers.push(tok.id); if (s.combat.blocks) { s.combat.blocks[tok.id] = []; s.combat.blocked[tok.id] = false; } }
        delay(s, "sacrificeIt", ctx.side, tok.name, tok.id, tok.id);
      });
    }
    // New Way Forward: "The next time a source of your choice would deal damage to you this turn, prevent that damage."
    if (eff.newWayForward && ctx.side === "player") {
      const l = battlefieldNow(s).map(({ card }) => card);
      if (l.length) { const c = l[choose(s, "Choose a source", l.map((x) => x.name), "player", l.map((x) => x.id))]; s.shieldFrom = [...(s.shieldFrom || []), { id: c.id, src: ctx.src }]; }
    }
  }

  // Effects added in the second pass over Aetherdrift
  function dftEffects(s, eff, tgt, to, ctx, ev, target, amount) {
    const z = s[ctx.side], me = () => find(s, ctx.selfId);
    // Valor's Flagship: "When you cycle this card, create X 1/1 colorless Pilot creature tokens …"
    if (eff.pilotsX) for (let i = 0; i < ((ctx.event && ctx.event.x) || 0); i++) createTokens(s, PILOT, ctx.side, ev);
    // Cursecloth Wrappings, embalm: "Create a token that's a copy of it, except it's a white Zombie in addition to its other types and has no mana cost."
    if (eff.embalmToken && ctx.src) { const v = copyValues(faceOf(ctx.src, {})); v.colors = ["W"]; v.type = addTypes(v.type, { subtypes: ["Zombie"] }); delete v.cost; delete v.renew; createTokens(s, v, ctx.side, ev); }
    // Captain Howler: "target creature gets +2/+0 until end of turn for each card discarded this way. Whenever that creature deals combat damage to a player this turn, you draw a card."
    if (eff.howler && tgt) { const n = (s.discardBatch || {})[(ctx.event && ctx.event.batchNo) || 0] || 1; addMod(s, tgt, [2 * n, 0]); applyEffect(s, { grantTrigger: "howlerDraw" }, tgt.id, ctx, ev); }
    // Mimeoplasm: "{2}: Mimeoplasm becomes a copy of target creature card exiled with it, except it's 0/0 and has this ability."
    if (eff.mimeoCopy) {
      const m = me(), c = ["player", "opponent"].flatMap((sd) => s[sd].exile).find((x) => x.id === target);
      if (m && c) { const g = faceOf(c, {}), keep = (m.abilities || []).filter((ab) => ab.effect && ab.effect.mimeoCopy); becomeCopyOf(s, m, g, { pt: "0/0", abilities: [...(g.abilities || []), ...keep], mimeoplasm: false }); }
    }
    // Winter, Cursed Rider: "Each other nonartifact creature gets -X/-X until end of turn."
    if (eff.othersNonartifactMinusX) battlefieldNow(s).map(({ card }) => card).filter((c) => isCreature(c) && !isArtifact(c) && c.id !== ctx.selfId).forEach((c) => addMod(s, c, [-(ctx.x || 0), -(ctx.x || 0)]));
    // Radiant Lotus: "Target player adds three mana of the chosen color for each artifact sacrificed this way."
    if (eff.lotusMana && to === "you" && ctx.side === "player") applyEffect(s, { chooseColorMana: 3 * (ctx.sacCount || 0) }, undefined, ctx, ev);
    // Full Throttle: "After this main phase, there are two additional combat phases. At the beginning of each combat this turn, untap all creatures that attacked this turn."
    if (eff.fullThrottle && ctx.side === "player") {
      s.untapAttackersEachCombat = true;
      if (s.phase === "main2") s.combatsAfterMain2 = (s.combatsAfterMain2 || 0) + 2; else s.extraCombats = (s.extraCombats || 0) + 2;
    }
    // Demonic Junker: "for each player, destroy up to one target creature that player controls. If a creature you controlled was destroyed this way, put two +1/+1 counters on this Vehicle."
    if (eff.junker) {
      const [theirs, mine] = [].concat(target || []);
      const t1 = theirs && find(s, theirs), t2 = mine && find(s, mine);
      if (t1 && !survivesDestroy(s, t1, ev)) leave(s, t1, "graveyard", ev);
      if (t2 && !survivesDestroy(s, t2, ev)) { leave(s, t2, "graveyard", ev); const m = me(); if (m) addCounters(s, m, "+1/+1", 2, ev); }
    }
  }

  // Effects added in the second pass over Duskmourn: House of Horror
  const SHARD = { name: "Shard", type: "Token Enchantment — Shard", colors: [], abilities: [{ cost: "{2}", sacSelf: true, effect: { scry: 1, draw: 1 }, text: "{2}, Sacrifice: Scry 1, then draw a card" }],
    text: "{2}, Sacrifice this token: Scry 1, then draw a card." };
  const SPIDER = { name: "Spider", type: "Token Creature — Spider", pt: "2/2", colors: ["G"], kw: ["reach"] };
  function dskEffects(s, eff, tgt, to, ctx, ev, target, amount) {
    const z = s[ctx.side], me = () => find(s, ctx.selfId);
    // ninjutsu resolving: "Put this card onto the battlefield from your hand tapped and attacking."
    if (eff.ninjutsuEnter && ctx.side === "player") {
      const c = z.hand.find((x) => x.id === ctx.selfId);
      if (c) { z.hand = z.hand.filter((x) => x !== c); const p = asFace(c, 0); p.tapped = true; p.sick = true; enter(s, p, { side: "player" }, ev);
        if (s.combat && find(s, p.id)) { s.combat.attackers.push(p.id); if (s.combat.blocks) { s.combat.blocks[p.id] = []; s.combat.blocked[p.id] = false; } } }
    }
    // Marina Vendrell's Grimoire: "Whenever you lose life, discard that many cards. Then if you have no cards in hand, you lose the game."
    if (eff.grimoireDiscard && ctx.side === "player") { applyEffect(s, { discardN: (ctx.event && ctx.event.count) || 0 }, undefined, ctx, ev); if (!z.hand.length) z.lostGame = true; }
    // The Tale of Tamiyo I–III: "Mill two cards. If two cards that share a card type were milled this way, draw a card and repeat this process."
    if (eff.tamiyoMill && ctx.side === "player") for (let k = 0; k < 20; k++) {
      const two = z.library.splice(0, 2); two.forEach((c) => putCard(s, c, "player", "graveyard"));
      if (two.length < 2) { const n = Math.min(2 - two.length, z.libraryCount || 0); z.libraryCount -= n; z.gyUnknown = (z.gyUnknown || 0) + n; break; }
      const t0 = cardTypesOf(faceOf(two[0], {})), t1 = cardTypesOf(faceOf(two[1], {}));
      if (!t0.some((x) => t1.includes(x))) break;
      draw(s, "player", 1, ev);
    }
    // Doomsday Excruciator: "each player exiles all but the bottom six cards of their library face down"
    if (eff.doomsday) for (const sd of ["player", "opponent"]) {
      const zz = s[sd];
      const total = zz.library.length + (zz.libraryCount || 0) + zz.libraryBottom.length;
      if (total <= 6) continue;
      const keepBottom = zz.libraryBottom.slice(-6), unknownKeep = Math.min(zz.libraryCount || 0, 6 - keepBottom.length), knownTopKeep = Math.max(0, 6 - keepBottom.length - unknownKeep);
      const keepTop = knownTopKeep ? zz.library.slice(-knownTopKeep) : [];
      const gone = [...zz.library.filter((c) => !keepTop.includes(c)), ...zz.libraryBottom.filter((c) => !keepBottom.includes(c))];
      gone.forEach((c) => putCard(s, c, sd, "exile"));
      zz.exileUnknown = (zz.exileUnknown || 0) + ((zz.libraryCount || 0) - unknownKeep);
      zz.library = keepTop; zz.libraryCount = unknownKeep; zz.libraryBottom = keepBottom;
    }
    // Twitching Doll: "Create a 2/2 green Spider creature token with reach for each counter on this creature."
    if (eff.dollSpiders) { const n = Object.values((ctx.src && ctx.src.counters) || {}).reduce((t, x) => t + x, 0); for (let i = 0; i < n; i++) createTokens(s, SPIDER, ctx.side, ev); }
    // Marina Vendrell: "{T}: Lock or unlock a door of target Room you control."
    if (eff.toggleDoor && tgt && tgt.layout === "room") {
      const k = choose(s, `${tgt.name}: which door?`, tgt.faces.map((f, i) => `${tgt.unlocked[i] ? "Lock" : "Unlock"} ${f.name}`), ctx.side, tgt.id);
      if (tgt.unlocked[k]) { tgt.unlocked = tgt.unlocked.map((u, i) => (i === k ? false : u)); changed(s); } else unlockDoor(s, tgt, k, ev);
    }
    // Forgotten Cellar: "When you unlock this door, you may cast spells from your graveyard this turn, and if a card would be put into your graveyard from anywhere this turn, exile it instead."
    if (eff.cellar && ctx.side === "player") { s.cellarTurn = true; s.replaces = true; }
    // Nashi: "you mill that many cards. You may put any number of legendary and/or enchantment cards from among them into your hand. If you put no cards into your hand this way, put a +1/+1 counter on Nashi."
    if (eff.nashi && ctx.side === "player") {
      const ctx2 = { ...ctx, milled: [] }; applyEffect(s, { mill: (ctx.event && ctx.event.count) || 0 }, undefined, ctx2, ev);
      const l = z.graveyard.filter((c) => (ctx2.milled || []).includes(c.id) && (/\blegendary\b/i.test(faceOf(c, {}).type || "") || typeHas(faceOf(c, {}), /enchantment/i)));
      let n = 0; l.forEach((c) => { if (choose(s, `Put ${c.name} into your hand?`, ["Put it", "Leave it"], "player", c.id) === 0) { z.graveyard = z.graveyard.filter((x) => x !== c); z.hand.push(c); n++; } });
      if (!n) { const m = me(); if (m) addCounters(s, m, "+1/+1", 1, ev); }
    }
    // Niko: "Exile target nonlegendary creature you control. Shards you control become copies of it until the next end step. Return it … at the beginning of the next end step."
    if (eff.nikoExile && tgt) {
      const v = copyValues(tgt), owner = tgt.owner || ctx.side, id = tgt.id; leave(s, tgt, "exile", ev);
      z.battlefield.filter((c) => hasType(c, "Shard")).forEach((c) => becomeCopyOf(s, c, v));
      if (s[owner].exile.some((c) => c.id === id)) delay(s, "returnExiled", ctx.side, "Niko", ctx.selfId, id);
    }
    // Rip, Spawn Hunter: "reveal the top X cards of your library, where X is its power. Put any number of creature and/or Vehicle cards with different powers from among them into your hand."
    if (eff.ripReveal && ctx.side === "player") {
      const m = me(), seen = z.library.splice(0, m ? Math.max(0, power(m)) : 0), took = [];
      seen.filter((c) => isCreature(faceOf(c, {})) || isVehicle(faceOf(c, {}))).forEach((c) => { const p = power(faceOf(c, {})); if (!took.some((x) => power(faceOf(x, {})) === p) && choose(s, `Put ${c.name} into your hand?`, ["Put it", "Leave it"], "player", c.id) === 0) took.push(c); });
      took.forEach((c) => z.hand.push(c)); seen.filter((c) => !took.includes(c)).forEach((c) => z.libraryBottom.push(c));
    }
    // Ghost Vacuum: "Put each creature card exiled with this artifact onto the battlefield under your control with a flying counter on it. Each of them is a 1/1 Spirit in addition to its other types."
    if (eff.ghostReturn) ["player", "opponent"].forEach((sd) => s[sd].exile.filter((c) => c.exiledBy === ctx.selfId && isCreature(faceOf(c, {}))).forEach((c) => {
      s[sd].exile = s[sd].exile.filter((x) => x !== c); const p = asFace(c, 0); p.type = addTypes(p.type, { subtypes: ["Spirit"] }); p.pt = "1/1"; p.counters = { ...(p.counters || {}), flying: 1 }; p.sick = true; p.owner = sd; enter(s, p, { side: ctx.side }, ev);
    }));
    // Winter, Misanthropic Guide: "each player draws two cards"
    if (eff.eachDrawsTwo) { draw(s, "player", 2, ev); draw(s, "opponent", 2, ev); }
  }

  // Effects added in the second pass over Bloomburrow
  const BOLD_T = { targets: "creature", count: { min: 0, max: 1 }, effect: { damage: 2 } };
  const WISH_REFLEX = {};
  const wishReflex = (n) => WISH_REFLEX[n] || (WISH_REFLEX[n] = { targets: "graveyard-card", targetFilter: { instantOrSorcery: true, exactMV: n }, effect: { wishCast: true } });
  function blbEffects(s, eff, tgt, to, ctx, ev, target, amount) {
    const z = s[ctx.side], me = () => find(s, ctx.selfId);
    // Portent of Calamity: "Reveal the top X cards of your library. For each card type, you may exile a card of that type from among
    // them. Put the rest into your graveyard. You may cast a spell from among the exiled cards without paying its mana cost if you
    // exiled four or more cards this way. Then put the rest of the exiled cards into your hand."
    if (eff.portent && ctx.side === "player") {
      const seen = z.library.splice(0, ctx.x || 0), picked = [];
      for (const ty of CARD_TYPES) {
        const opts = seen.filter((c) => !picked.includes(c) && new RegExp(`\\b${ty}\\b`, "i").test((faceOf(c, {}).type || "").split("—")[0]));
        if (!opts.length) continue;
        const k = choose(s, `Exile a ${ty} card?`, ["None", ...opts.map((c) => c.name)], "player", [null, ...opts.map((c) => c.id)]);
        if (k > 0) picked.push(opts[k - 1]);
      }
      seen.filter((c) => !picked.includes(c)).forEach((c) => putCard(s, c, "player", "graveyard"));
      picked.forEach((c) => putCard(s, c, "player", "exile"));
      const cast = picked.length >= 4 ? castFree(s, picked, "player", ev, { zone: "exile" }).cast : null;
      picked.filter((c) => c !== cast).forEach((c) => { s.player.exile = s.player.exile.filter((x) => x !== c); z.hand.push(c); });
    }
    // Wishing Well: "Put a coin counter on this artifact. When you do, you may cast target instant or sorcery card with mana value
    // equal to the number of coin counters on this artifact from your graveyard without paying its mana cost. If that spell would be put into your graveyard, exile it instead."
    if (eff.wishCoin) { const m = me(); if (m) { addCounters(s, m, "coin", 1, ev); s.triggered.push({ side: ctx.side, name: m.name, srcId: m.id, td: defId(wishReflex(m.counters.coin)), event: {} }); } }
    if (eff.osteomancer && ctx.side === "player") s.osteomancer = true;
    // Season of Weaving: "Choose an artifact or creature you control. Create a token that's a copy of it." / "Return each nonland, nontoken permanent to its owner's hand."
    if (eff.copyYours) { const l = z.battlefield.filter((c) => isArtifact(c) || isCreature(c)); if (l.length) { const c = l[choose(s, "Copy which artifact or creature?", l.map((x) => x.name), ctx.side, l.map((x) => x.id))]; createTokens(s, copyValues(c), ctx.side, ev); } }
    if (eff.bounceNonlandNontoken) { const before = battlefieldNow(s); before.map(({ card }) => card).filter((c) => !isLand(c) && !c.token).forEach((c) => leave(s, c, "hand", ev, { lookBack: before })); }
    // Season of the Bold: "Until the end of your next turn, whenever you cast a spell, …"
    if (eff.seasonBold) s.bold = [...(s.bold || []), { srcId: `${ctx.selfId}#bold${s.nextId++}`, src: ctx.src }];
    // Season of Gathering: "Put a +1/+1 counter on a creature you control. It gains vigilance and trample until end of turn." / "Choose artifact or enchantment. Destroy all permanents of the chosen type."
    if (eff.gatherCounter) { const l = z.battlefield.filter(isCreature); if (l.length) { const c = l[choose(s, "Which creature gets the counter?", l.map((x) => x.name), ctx.side, l.map((x) => x.id))]; addCounters(s, c, "+1/+1", 1, ev); grant(c, ["vigilance", "trample"], s); } }
    if (eff.destroyChosenType) {
      const k = choose(s, "Destroy all artifacts or all enchantments?", ["Artifacts", "Enchantments"], ctx.side), before = battlefieldNow(s);
      before.map(({ card }) => card).filter((c) => (k === 0 ? isArtifact(c) : typeHas(c, /enchantment/i)) && !survivesDestroy(s, c, ev)).forEach((c) => leave(s, c, "graveyard", ev, { lookBack: before }));
    }
    // Season of the Burrow: "Exile target nonland permanent. Its controller draws a card."
    if (eff.exileControllerDraws && tgt) { const sd = sideOf(s, tgt); leave(s, tgt, "exile", ev); draw(s, sd, 1, ev); }
    // Hugs: "exile the top X cards of your library. Until the end of your next turn, you may play those cards."
    if (eff.impulseX && ctx.side === "player") applyEffect(s, { impulseAll: ((me() || ctx.src || {}).xPaid) || 0 }, undefined, ctx, ev);
    // The Infamous Cruelclaw: "exile cards from the top of your library until you exile a nonland card. You may cast that card by discarding a card rather than paying its mana cost."
    if (eff.cruelclaw && ctx.side === "player") {
      let c = null; while (z.library.length) { const x = z.library.shift(); putCard(s, x, "player", "exile"); if (!isLand(faceOf(x, {}))) { c = x; break; } }
      if (c && z.hand.length && freeCastOptions(s, c, "player").length) {
        const k = choose(s, `Cast ${c.name} by discarding a card?`, ["Don't", ...z.hand.map((x) => `Discard ${x.name}`)], "player", [null, ...z.hand.map((x) => x.id)]);
        if (k > 0) { discardCard(s, z.hand[k - 1], ev); castFree(s, c, "player", ev, { zone: "exile", decline: "Don't cast it (the card is discarded anyway)" }); }
      }
    }
    // Kastral: "You may put a Bird creature card from your hand or graveyard onto the battlefield with a finality counter on it."
    if (eff.kastralBird && ctx.side === "player") {
      const l = [...z.hand.map((c) => ["hand", c]), ...z.graveyard.map((c) => ["graveyard", c])].filter(([, c]) => !c.unknown && isCreature(faceOf(c, {})) && hasType(faceOf(c, {}), "Bird"));
      const k = l.length ? choose(s, "Put a Bird creature card onto the battlefield?", ["Don't", ...l.map(([zn, c]) => `${c.name} (${zn})`)], "player", [null, ...l.map(([, c]) => c.id)]) : 0;
      if (k > 0) { const [zn, c] = l[k - 1]; z[zn] = z[zn].filter((x) => x !== c); const p = asFace(c, 0); p.sick = true; p.counters = { ...(p.counters || {}), finality: 1 }; enter(s, p, { side: "player" }, ev); }
    }
    // Alania: "you may have target opponent draw a card. If you do, copy that spell."
    if (eff.alania && ctx.side === "player" && choose(s, "Have the opponent draw a card to copy that spell?", ["Yes: they draw, you copy it", "No"], "player") === 0) {
      draw(s, "opponent", 1, ev);
      const item = s.stack.find((x) => x.kind === "spell" && x.id === (ctx.event && ctx.event.id)); if (item) copySpell(s, item, { side: "player" }, ev);
    }
  }

  // Effects added in the second pass over Outlaws of Thunder Junction
  const UNTAP_YOURS = { effect: { untapTeam: true } };
  const DELAYED_EOC = { fortune: { effect: { fortuneBlink: true } } };
  const ELK = { name: "Elk", type: "Token Creature — Elk", pt: "3/3", colors: ["G"] };
  function otjEffects(s, eff, tgt, to, ctx, ev, target, amount) {
    const z = s[ctx.side], me = () => find(s, ctx.selfId);
    // Fortune, Loyal Steed: "at end of combat, exile it and up to one creature that saddled it this turn, then return those cards"
    if (eff.fortuneDelay) { const m = me(); if (m) s.delayedEoc = [...(s.delayedEoc || []), { kind: "fortune", side: ctx.side, name: m.name, srcId: m.id, id: m.id }]; }
    if (eff.fortuneBlink) {
      const m = me(), riders = m ? (m.saddledBy || []).map((id) => find(s, id)).filter(Boolean) : [];
      const k = riders.length ? choose(s, "Also exile and return a creature that saddled it?", ["None", ...riders.map((c) => c.name)], ctx.side, [null, ...riders.map((c) => c.id)]) : 0;
      [m, k > 0 ? riders[k - 1] : null].filter(Boolean).forEach((c) => {
        const owner = c.owner || sideOf(s, c), id = c.id; leave(s, c, "exile", ev);
        const card = s[owner].exile.find((x) => x.id === id); if (!card) return;
        s[owner].exile = s[owner].exile.filter((x) => x !== card); const p = asFace(card, 0); p.sick = true; enter(s, p, { side: owner }, ev);
      });
    }
    // The Key to the Vault: "look at that many cards from the top of your library. You may exile a nonland card from among them. Put
    // the rest on the bottom of your library in a random order. You may cast the exiled card without paying its mana cost."
    if (eff.keyVault && ctx.side === "player") {
      const seen = z.library.splice(0, (ctx.event && ctx.event.count) || 0), opts = seen.filter((c) => !isLand(faceOf(c, {})));
      const k = opts.length ? choose(s, "Exile a nonland card (and cast it for free)?", ["None", ...opts.map((c) => c.name)], "player", [null, ...opts.map((c) => c.id)]) : 0;
      const picked = k > 0 ? opts[k - 1] : null;
      seen.filter((c) => c !== picked).forEach((c) => z.libraryBottom.push(c));
      if (picked) { putCard(s, picked, "player", "exile"); castFree(s, picked, "player", ev, { zone: "exile" }); }
    }
    // Tinybones Joins Up: "any number of target players each discard a card" / "each mill a card and lose 1 life"
    if (eff.playerDiscards && (to === "opp" || to === "you")) { if (to === "opp") applyEffect(s, { discard: 1 }, "opp", ctx, ev); else applyEffect(s, { discardN: 1 }, undefined, { ...ctx, side: "player" }, ev); }
    if (eff.playerMillLose && (to === "opp" || to === "you")) { applyEffect(s, { millTarget: 1 }, to, ctx, ev); changeLife(s, to, -1, ev); }
    // Calamity: "choose a nonlegendary creature that saddled it this turn and create a tapped and attacking token that's a copy of it.
    // Sacrifice that token at the beginning of the next end step. Repeat this process once."
    if (eff.calamity) for (let i = 0; i < 2; i++) {
      const m = me(), riders = m ? (m.saddledBy || []).map((id) => find(s, id)).filter((c) => c && !/\blegendary\b/i.test(c.type || "")) : [];
      if (!riders.length) break;
      const c = riders[riders.length > 1 ? choose(s, "Copy which creature that saddled it?", riders.map((x) => x.name), ctx.side, riders.map((x) => x.id)) : 0];
      createTokens(s, { ...copyValues(c), tapped: true }, ctx.side, ev).forEach((tok) => {
        if (s.combat && find(s, tok.id)) { s.combat.attackers.push(tok.id); if (s.combat.blocks) { s.combat.blocks[tok.id] = []; s.combat.blocked[tok.id] = false; } }
        delay(s, "sacrificeIt", ctx.side, tok.name, tok.id, tok.id);
      });
    }
    // Great Train Heist: "Untap all creatures you control. If it's your combat phase, there is an additional combat phase after this phase." / the Treasure mode
    if (eff.heistCombat) { z.battlefield.filter(isCreature).forEach((c) => untap(s, c, ev)); if (["boc", "attackers", "blockers", "fsdamage", "damage", "eoc"].includes(s.phase)) s.extraCombats = (s.extraCombats || 0) + 1; }
    if (eff.heistTreasure) s.heistTreasure = (s.heistTreasure || 0) + 1;
    // Assimilation Aegis: "that creature becomes a copy of a creature card exiled with this Equipment" (for as long as it's attached)
    if (eff.aegisCopy) {
      const host = find(s, ctx.event && ctx.event.host), src = ["player", "opponent"].flatMap((sd) => s[sd].exile.filter((c) => c.exiledUntil === ctx.selfId && isCreature(faceOf(c, {}))))[0];
      if (host && src) becomeCopyOf(s, host, faceOf(src, {}), {}, { attachedBy: ctx.selfId });
    }
    // Eriette: "gain control of that permanent for as long as that Aura is attached to it"
    if (eff.eriette) {
      const aura = find(s, ctx.event && ctx.event.id), host = find(s, ctx.event && ctx.event.host);
      if (aura && host && sideOf(s, host) === "opponent" && !isLand(host) && manaValue(host.cost) <= manaValue(aura.cost)) {
        s.opponent.battlefield = s.opponent.battlefield.filter((c) => c !== host); s.player.battlefield.push(host); host.controlledByAura = aura.id; changed(s);
      }
    }
    // The Gitrog: "you may sacrifice a creature that saddled it this turn. If you do, draw X cards, then put up to X land cards from your hand onto the battlefield tapped"
    if (eff.gitrog && ctx.side === "player") {
      const m = me(), riders = m ? (m.saddledBy || []).map((id) => find(s, id)).filter(Boolean) : [];
      const k = riders.length ? choose(s, "Sacrifice a creature that saddled it?", ["Don't", ...riders.map((c) => c.name)], "player", [null, ...riders.map((c) => c.id)]) : 0;
      if (k > 0) { const c = riders[k - 1], x = Math.max(0, power(c)); leave(s, c, "graveyard", ev, { sacrificed: true }); draw(s, "player", x, ev); applyEffect(s, { putFromHand: { filter: { land: true }, max: x, tapped: true } }, undefined, ctx, ev); }
    }
    // Kambal: "for each of them, create a tapped token that's a copy of it"
    if (eff.kambalCopy) { const c = find(s, ctx.event && ctx.event.id); if (c) createTokens(s, { ...copyValues(c), tapped: true }, ctx.side, ev); }
    // Kellan, the Kid: "you may cast a permanent spell with equal or lesser mana value from your hand without paying its mana cost. If you don't, you may put a land card from your hand onto the battlefield."
    if (eff.kellanKid && ctx.side === "player") {
      const mv = (ctx.event && ctx.event.mv) || 0, fits = z.hand.filter((c) => !c.unknown && isPermanent(faceOf(c, {})) && !isLand(faceOf(c, {})) && manaValue(faceOf(c, {}).cost) <= mv);
      if (!castFree(s, fits, "player", ev, { zone: "hand", decline: "Don't (you may put a land onto the battlefield)" }).cast) applyEffect(s, { mayPutLand: true }, undefined, ctx, ev);
    }
    // Lilah: "exile that spell instead of putting it into your graveyard as it resolves. If you do, it becomes plotted."
    if (eff.plotAfter) { const item = s.stack.find((x) => x.kind === "spell" && x.id === (ctx.event && ctx.event.id)); if (item) item.plotAfter = true; }
    if (eff.extraUpkeeps) s.extraUpkeeps = (s.extraUpkeeps || 0) + ((ctx.event && ctx.event.count) || 0);
    // Oko, the Ringleader: "becomes a copy of up to one target creature you control until end of turn, except he has hexproof"
    if (eff.okoCopy && tgt) { const m = me(); if (m && m.id !== tgt.id) becomeCopyOf(s, m, tgt, { kw: ["hexproof"] }); }
    if (eff.okoDraw && ctx.side === "player") { draw(s, "player", 2, ev); applyEffect(s, { discardN: s.crimes > 0 ? 1 : 2 }, undefined, ctx, ev); }
    if (eff.okoTokens) z.battlefield.filter((c) => c.id !== ctx.selfId && !isLand(c)).forEach((c) => createTokens(s, copyValues(c), ctx.side, ev));
    // Rakdos, the Muscle: "exile cards equal to its mana value from the top of target player's library. Until your next end step, you may play those cards, and mana of any type can be spent to cast those spells."
    if (eff.rakdosExile && (to === "opp" || to === "you")) {
      const n = (ctx.event && ctx.event.objMV) || 0, zz = s[to === "opp" ? "opponent" : "player"];
      for (let i = 0; i < n; i++) { const c = zz.library.shift(); if (c) { if (to === "you") { c.playable = true; c.anyManaCast = true; } putCard(s, c, to === "opp" ? "opponent" : "player", "exile"); } else if (zz.libraryCount > 0) { zz.libraryCount--; zz.exileUnknown = (zz.exileUnknown || 0) + 1; } }
    }
    // Riku of Many Paths: "choose up to X, where X is the number of times you chose a mode for that spell"
    if (eff.riku) {
      const item = s.stack.find((x) => x.kind === "spell" && x.id === (ctx.event && ctx.event.id)), x = item ? [].concat(item.a.mode == null ? [] : item.a.mode).length || 1 : 1;
      const modes = [{ text: "Exile the top card of your library; you may play it", effect: { impulseAll: 1 } }, { text: "+1/+1 counter on Riku, trample", effect: { counters: { "+1/+1": 1 }, grant: ["trample"], self: true } }, { text: "A 1/1 blue Bird with flying", effect: { create: { name: "Bird", type: "Token Creature — Bird", pt: "1/1", colors: ["U"], kw: ["flying"] } } }];
      const combos = subsets([0, 1, 2]).filter((l) => l.length <= x);
      const k = choose(s, `Riku: choose up to ${x}`, combos.map((l) => (l.length ? l.map((i) => modes[i].text).join(" + ") : "None")), ctx.side);
      combos[k].forEach((i) => applyEffect(s, modes[i].effect, undefined, ctx, ev));
    }
    // Taii Wakeen: "{X}, {T}: If a source you control would deal noncombat damage to a permanent or player this turn, it deals that much damage plus X instead."
    if (eff.noncombatPlusX) s.noncombatPlus = (s.noncombatPlus || 0) + (ctx.x || 0);
    // Vraska, the Silencer: "return that card to the battlefield tapped under your control. It's a Treasure artifact … and it loses all other card types."
    if (eff.vraskaTreasure) {
      const c = s.opponent.graveyard.find((x) => x.id === (ctx.event && ctx.event.id));
      if (c) { s.opponent.graveyard = s.opponent.graveyard.filter((x) => x !== c); const p = asFace(c, 0); p.type = `Artifact — Treasure${subtypes(p).length ? " " + subtypes(p).join(" ") : ""}`; delete p.pt; p.tapped = true; p.owner = "opponent"; enter(s, p, { side: "player" }, ev); }
    }
  }

  // Effects added in the second pass over Murders at Karlov Manor
  // (triggered abilities a resolving effect gives, by name: a definition must stay the same object)
  const GRANT_TRIG = { pride: { on: "combatDamage", self: true, effect: { draw: "selfToughness" } }, howlerDraw: { on: "combatDamage", self: true, effect: { draw: 1 } },
    carnageSac: { on: "combatDamage", self: true, effect: { sacrificeMe: true } },                       // (Carnage: "When this creature deals combat damage to a player, sacrifice it.")
    strengthOfWill: { on: "dealtDamage", self: true, effect: { counters: { "+1/+1": "eventCount" }, self: true } },   // ("Whenever this creature is dealt damage, put that many +1/+1 counters on it.")
    symbioteLook: { on: "combatDamage", self: true, effect: { lookTop: { n: "eventCount", pickOne: true, restTo: "graveyard" } } } };
  const SPATTER_REFLEX = { targets: "graveyard-creature", effect: { regrow: true } };
  function mkmEffects(s, eff, tgt, to, ctx, ev, target, amount) {
    const z = s[ctx.side], me = () => find(s, ctx.selfId);
    // Tenth District Hero: "becomes a Human Detective with base power and toughness 4/4 and gains vigilance" / "If this
    // creature is a Detective, it becomes a legendary creature named Mileva, the Stalwart, … 5/5 … 'Other creatures you
    // control have indestructible.'" (no duration: for good)
    if (eff.becomeDetective) { const m = me(); if (m) { m.type = "Creature — Human Detective"; m.pt = "4/4"; m.kw = [...new Set([...(m.kw || []), "vigilance"])]; changed(s); } }
    if (eff.becomeMileva) { const m = me(); if (m && hasType(m, "Detective")) { Object.assign(m, { name: "Mileva, the Stalwart", type: `Legendary ${m.type.replace(/^Legendary\s+/, "")}`, pt: "5/5", static: { team: { grant: ["indestructible"] }, other: true } }); changed(s); } }
    // The Pride of Hull Clade: "gets +1/+0, gains 'Whenever this creature deals combat damage to a player, draw cards equal to
    // its toughness,' and can attack as though it didn't have defender"
    if (eff.grantTrigger && tgt) { const d = GRANT_TRIG[eff.grantTrigger]; addEffect(s, tgt, { addTriggers: [defId(d)] }); if (!s.listens.includes(d.on)) s.listens.push(d.on); }
    // Anzrag's Rampage: "Destroy all artifacts you don't control, then exile the top X cards of your library, where X is the number of
    // artifacts that were put into graveyards from the battlefield this turn. You may put a creature card exiled this way onto the
    // battlefield. It gains haste. Return it to your hand at the beginning of the next end step."
    if (eff.rampage && ctx.side === "player") {
      const before = battlefieldNow(s);
      s.opponent.battlefield.filter(isArtifact).filter((c) => !survivesDestroy(s, c, ev)).forEach((c) => leave(s, c, "graveyard", ev, { lookBack: before }));
      const ex = z.library.splice(0, s.artifactsDied || 0); ex.forEach((c) => putCard(s, c, "player", "exile"));
      const cs = ex.filter((c) => isCreature(faceOf(c, {})));
      const k = cs.length ? choose(s, "Put a creature card exiled this way onto the battlefield?", ["Don't", ...cs.map((c) => `Put ${c.name}`)], "player", [null, ...cs.map((c) => c.id)]) : 0;
      if (k > 0) { const c = cs[k - 1]; z.exile = z.exile.filter((x) => x.id !== c.id); const p = asFace(c, 0); p.sick = true; enter(s, p, { side: "player" }, ev); if (find(s, p.id)) { grant(find(s, p.id), ["haste"], s); delay(s, "returnToHand", "player", c.name, ctx.selfId, p.id); } }
    }
    // Connecting the Dots: "exile the top card of your library face down" / "Put all cards exiled with this enchantment into their owners' hands."
    if (eff.dotsExile && ctx.side === "player") { const c = z.library.shift(); if (c) { c.exiledBy = ctx.selfId; c.faceDownExile = true; putCard(s, c, "player", "exile"); } else if (z.libraryCount > 0) { z.libraryCount--; z.exileUnknown = (z.exileUnknown || 0) + 1; } }
    if (eff.dotsReturn) ["player", "opponent"].forEach((sd) => s[sd].exile.filter((c) => c.exiledBy === ctx.selfId).forEach((c) => { s[sd].exile = s[sd].exile.filter((x) => x !== c); delete c.faceDownExile; if (sd === "player") s.player.hand.push(c); else s.opponent.handCount = (s.opponent.handCount || 0) + 1; }));
    // Anzrag, the Quake-Mole: "untap each creature you control. After this phase, there is an additional combat phase." / "must be blocked each combat this turn if able"
    if (eff.stunIfTheirs && tgt && sideOf(s, tgt) !== ctx.side) addCounters(s, tgt, "stun", 1, ev);   // ("Put a stun counter on each of those creatures you don't control.")
    if (eff.bounceEventObj) { const c = find(s, ctx.event && ctx.event.id); if (c) leave(s, c, "hand", ev); }
    if (eff.mustBeBlocked && ctx.selfId) s.mustBeBlocked = [...new Set([...(s.mustBeBlocked || []), ctx.selfId])];
    // Blood Spatter Analysis: "Then sacrifice it if it has five or more bloodstain counters on it. When you do, return target creature card from your graveyard to your hand."
    if (eff.bloodSac) { const m = me(); if (m && ((m.counters || {}).bloodstain || 0) >= eff.bloodSac) { leave(s, m, "graveyard", ev, { sacrificed: true }); s.triggered.push({ side: ctx.side, name: m.name, srcId: ctx.selfId, td: defId(SPATTER_REFLEX), event: {} }); } }
    // Etrata: "{2}{U}{B}: Turn this creature face up. If you can't, exile it, then you may cast the exiled card without paying its mana cost."
    if (eff.etrataUp) {
      const m = me();
      if (m && m.faceDown && m.hidden && !m.hidden.unknown) {
        if (isPermanent(m.hidden)) turnFaceUp(s, m, ev);
        else { const owner = m.owner || ctx.side; leave(s, m, "exile", ev); const c = s[owner].exile.find((x) => x.id === m.id); if (c) castFree(s, c, ctx.side, ev, { zone: "exile" }); }
      }
    }
    // Etrata: "cloak the top card of that player's library" (the opponent's: an unknown card, face down under your control)
    if (eff.cloakOpp && ctx.side === "player" && (s.opponent.libraryCount || 0) > 0) {
      s.opponent.libraryCount--;
      const perm = faceDownOf({ id: `unknown-${s.nextId++}`, name: "Unknown card", type: "Card", unknown: true, owner: "opponent" }, { manifest: true });
      perm.kw = ["ward 2"]; perm.sick = true; ev.push({ type: "cloaked", id: perm.id }); enter(s, perm, { side: "player" }, ev);
    }
    // Kaya: "you may choose a creature card from among them. Until end of turn, target token you control becomes a copy of it, except it has flying."
    if (eff.kayaCopy && tgt && tgt.token) {
      const cards = (((ctx.event && ctx.event.ids) || [])).map((id) => [...s.player.exile, ...s.opponent.exile].find((c) => c.id === id)).filter((c) => c && isCreature(faceOf(c, {})));
      const k = cards.length ? choose(s, `${tgt.name}: become a copy of which card?`, ["None", ...cards.map((c) => c.name)], ctx.side, [null, ...cards.map((c) => c.id)]) : 0;
      if (k > 0) becomeCopyOf(s, tgt, faceOf(cards[k - 1], {}), { kw: ["flying"] });
    }
    // Kaya +2: "Surveil 2, then exile a card from a graveyard."
    if (eff.exileAnyGraveyardCard) {
      const all = [...s.player.graveyard.map((c) => ["player", c]), ...s.opponent.graveyard.map((c) => ["opponent", c])];
      if (all.length) { const [sd, c] = all[choose(s, "Exile a card from a graveyard", all.map(([d, c]) => `${c.name} (${d === "player" ? "yours" : "theirs"})`), ctx.side, all.map(([, c]) => c.id))]; s[sd].graveyard = s[sd].graveyard.filter((x) => x !== c); putCard(s, c, sd, "exile"); noteExiled(s, [c], sd === ctx.side ? "yourGy" : "theirGy", ev); }
    }
    // Kylox: "sacrifice any number of other creatures, then exile the top X cards of your library, where X is their total power.
    // You may cast any number of instant and/or sorcery spells from among the exiled cards without paying their mana costs."
    if (eff.kylox && ctx.side === "player") {
      let x = 0;
      z.battlefield.filter((c) => isCreature(c) && c.id !== ctx.selfId).forEach((c) => { if (choose(s, `Sacrifice ${c.name}?`, ["Sacrifice it", "Keep it"], "player", c.id) === 0) { x += Math.max(0, power(c)); leave(s, c, "graveyard", ev, { sacrificed: true }); } });
      const ex = z.library.splice(0, x); ex.forEach((c) => putCard(s, c, "player", "exile"));
      for (let i = 0; i < 20; i++) { const left = ex.filter((c) => z.exile.includes(c) && typeHas(faceOf(c, {}), /instant|sorcery/i)); if (!castFree(s, left, "player", ev, { zone: "exile", decline: "Stop" }).cast) break; }
    }
    // Kylox's Voltstrider: "you may cast an instant or sorcery spell from among cards exiled with it. If that spell would be put into a graveyard, put it on the bottom of its owner's library instead."
    if (eff.voltCast && ctx.side === "player") castFree(s, z.exile.filter((c) => c.exiledBy === ctx.selfId && typeHas(faceOf(c, {}), /instant|sorcery/i)), "player", ev, { zone: "exile", bottomAfter: true, pay: true });
    // Lazav: "you may have Lazav become a copy of a creature card exiled with it until end of turn"
    if (eff.lazavCopy) {
      const m = me(), cards = m ? ["player", "opponent"].flatMap((sd) => s[sd].exile.filter((c) => c.exiledBy === m.id && isCreature(faceOf(c, {})))) : [];
      const k = cards.length ? choose(s, `${m.name}: become a copy of an exiled creature card?`, ["Don't", ...cards.map((c) => c.name)], ctx.side, [null, ...cards.map((c) => c.id)]) : 0;
      if (k > 0) becomeCopyOf(s, m, faceOf(cards[k - 1], {}));
    }
    // Yarus: "return it to the battlefield face down under its owner's control if it's a permanent card, then turn it face up"
    if (eff.yarusReturn) {
      for (const sd of ["player", "opponent"]) {
        const c = s[sd].graveyard.find((x) => x.id === (ctx.event && ctx.event.id));
        if (!c || !isPermanent(faceOf(c, {}))) continue;
        s[sd].graveyard = s[sd].graveyard.filter((x) => x !== c);
        const p = faceDownOf({ ...c, owner: sd }); p.sick = true; enter(s, p, { side: sd }, ev);
        const now = find(s, p.id); if (now) turnFaceUp(s, now, ev);
      }
    }
    // Coveted Falcon, turned face up: "target opponent gains control of any number of target permanents you control. Draw a card for each one they gained control of this way."
    if (eff.giveToOpp && tgt && sideOf(s, tgt) === "player") { s.player.battlefield = s.player.battlefield.filter((c) => c !== tgt); s.opponent.battlefield.push(tgt); changed(s); draw(s, "player", 1, ev); }
  }

  // Effects added in the second pass over The Lost Caverns of Ixalan
  const ANCIENT_REFLEX = { targets: "player", effect: { millTarget: "eventCount" } };
  function lciEffects(s, eff, tgt, to, ctx, ev, target, amount) {
    const z = s[ctx.side], me = () => find(s, ctx.selfId);
    // Kitesail Larcenist: "the chosen permanents become Treasure artifacts with '{T}, Sacrifice this artifact: Add one mana of any
    // color' and lose all other abilities" — for as long as it remains on the battlefield
    if (eff.becomeTreasureWhile && tgt && me()) { s.tsMatters = true; addEffect(s, tgt, { setType: "Artifact — Treasure", loseAll: true, whileOnField: ctx.selfId }); }
    // Braided Net: "Tap another target nonland permanent. Its activated abilities can't be activated for as long as it remains tapped."
    if (eff.netTap && tgt) { tap(s, tgt, ev); tgt.netted = true; }
    // Malcolm: "put a chorus counter on it. Draw a card, then discard a card. If there are four or more chorus counters on
    // Malcolm, you may cast the discarded card without paying its mana cost."
    if (eff.malcolm && ctx.side === "player") {
      draw(s, "player", 1, ev);
      if (z.hand.length) {
        const c = z.hand[choose(s, "Discard which card?", z.hand.map((x) => x.name), "player", z.hand.map((x) => x.id))];
        discardCard(s, c, ev);
        const m = me();
        if (m && ((m.counters || {}).chorus || 0) >= 4 && z.graveyard.includes(c)) castFree(s, c, "player", ev, { zone: "graveyard" });
      }
    }
    // Starving Revenant: "surveil 2. Then for each card you put on top of your library, you draw a card and you lose 3 life."
    // (ctx.keptTop: how many known cards stayed on top; unknown ones: your choice how many)
    if (eff.revenant && ctx.side === "player") {
      const unknown = Math.min(Math.max(eff.revenant - (ctx.knownSeen || 0), 0), z.libraryCount || 0);
      let kept = ctx.keptTop || 0;
      if (unknown) { const k = choose(s, `Of the ${unknown} unknown card${unknown > 1 ? "s" : ""}, how many stay on top?`, Array.from({ length: unknown + 1 }, (_, i) => `${i} on top, ${unknown - i} into your graveyard`), "player");
        kept += k; const away = unknown - k; z.libraryCount -= away; z.gyUnknown = (z.gyUnknown || 0) + away; }
      for (let i = 0; i < kept; i++) { draw(s, "player", 1, ev); changeLife(s, "you", -3, ev); }
    }
    // The Tomb of Aclazotz: "You may cast a creature spell from your graveyard this turn. If you do, it enters with a
    // finality counter on it and is a Vampire in addition to its other types."
    if (eff.tombCast && ctx.side === "player") s.tombCasts = (s.tombCasts || 0) + 1;
    // The Ancient One: "Draw a card, then discard a card. When you discard a card this way, target player mills cards equal to its mana value."
    if (eff.ancientLoot && ctx.side === "player") {
      draw(s, "player", 1, ev);
      if (z.hand.length) { const c = z.hand[choose(s, "Discard which card?", z.hand.map((x) => x.name), "player", z.hand.map((x) => x.id))]; discardCard(s, c, ev);
        s.triggered.push({ side: "player", name: (ctx.src && ctx.src.name) || "The Ancient One", srcId: ctx.selfId, td: defId(ANCIENT_REFLEX), event: { count: manaValue(faceOf(c, {}).cost) } }); }
    }
    // The Belligerent: "Until end of turn, you may look at the top card of your library any time, and you may play lands and cast spells from the top of your library."
    if (eff.libraryTopPlay && ctx.side === "player") s.libraryTopPlay = true;
    // Deepfathom Echo: "Then you may have it become a copy of another creature you control until end of turn."
    if (eff.mayCopyYours) {
      const m = me(), opts = m ? z.battlefield.filter((c) => isCreature(c) && c.id !== m.id) : [];
      const k = opts.length ? choose(s, `${m.name}: become a copy of another creature you control?`, ["Don't", ...opts.map((c) => `Copy ${c.name}`)], ctx.side, [null, ...opts.map((c) => c.id)]) : 0;
      if (k > 0) becomeCopyOf(s, m, opts[k - 1]);
    }
    // Cosmium Confluence: "Put three +1/+1 counters on a Cave you control. It becomes a 0/0 Elemental creature with haste. It's still a land."
    if (eff.caveAwaken) {
      const caves = z.battlefield.filter((c) => hasType(c, "Cave"));
      if (caves.length) {
        const c = caves[choose(s, "Which Cave?", caves.map((x) => x.name), ctx.side, caves.map((x) => x.id))];
        addCounters(s, c, "+1/+1", 3, ev); addEffect(s, c, { becomeCreature: true }); s.tsMatters = true; addEffect(s, c, { setBase: [0, 0] }); grant(c, ["haste"], s);
        c.type = addTypes(c.type, { subtypes: ["Elemental"] }); changed(s);
      }
    }
    // The Grim Captain: "each opponent sacrifices a nonland permanent of their choice. Then you may put an exiled creature card
    // used to craft The Grim Captain onto the battlefield under your control tapped and attacking."
    if (eff.grimCaptain && ctx.side === "player") {
      applyEffect(s, { oppSacrifices: { nonland: true } }, undefined, ctx, ev);
      const m = me(), cards = ((m && m.craftedWith) || []).map((id) => s.player.exile.find((x) => x.id === id)).filter((c) => c && isCreature(faceOf(c, {})));
      const k = cards.length ? choose(s, "Put an exiled creature card onto the battlefield tapped and attacking?", ["Don't", ...cards.map((c) => `Put ${c.name}`)], "player", [null, ...cards.map((c) => c.id)]) : 0;
      if (k > 0) {
        const c = cards[k - 1]; s.player.exile = s.player.exile.filter((x) => x !== c);
        const p = asFace(c, 0); p.tapped = true; p.sick = true; enter(s, p, { side: "player" }, ev);
        if (s.combat && find(s, p.id)) { s.combat.attackers.push(p.id); if (s.combat.blocks) { s.combat.blocks[p.id] = []; s.combat.blocked[p.id] = false; } }
      }
    }
  }

  // Effects added in the second pass over Wilds of Eldraine
  const NIGHTMARE = { name: "Nightmare", type: "Token Creature — Nightmare", pt: "1/1", colors: ["B"],
    triggers: [{ on: "beginningOfCombat", filter: { controller: "you" }, if: { exiledThisTurn: true }, effect: { counters: { "+1/+1": 1 }, self: true } }],
    text: "At the beginning of combat on your turn, if a card was put into exile this turn, put a +1/+1 counter on this token." };
  // reflexive triggers, by name (a definition must stay the same object: see defId)
  const REFLEX = { cauldron: { targets: "creature", targetFilter: { controller: "you" }, effect: { counters: { "+1/+1": 1 } } } };
  // delayed "at the beginning of the next combat phase this turn" triggers
  const DELAYED_BOC = { feral: { slots: [{ targets: "creature", filter: { controller: "you" } }, { targets: "creature", filter: { controller: "opponent" }, optional: true }], effect: { bite: true } } };
  function woeEffects(s, eff, tgt, to, ctx, ev, target, amount) {
    const z = s[ctx.side], me = () => find(s, ctx.selfId);
    // Extraordinary Journey: "exile up to X target creatures. For each of those cards, its owner may play it for as long as it remains exiled."
    if (eff.exileOwnerMayPlay && tgt) { const owner = tgt.owner || sideOf(s, tgt), id = tgt.id; leave(s, tgt, "exile", ev); const c = s[owner].exile.find((x) => x.id === id); if (c && owner === "player") c.playable = true; }
    // Beseech the Mirror: "Search your library for a card, exile it face down, then shuffle. If this spell was bargained, you
    // may cast the exiled card without paying its mana cost if that spell's mana value is 4 or less. Put the exiled card
    // into your hand if it wasn't cast this way."
    if (eff.beseech && ctx.side === "player") {
      const known = [...z.library, ...z.libraryBottom];
      const k = known.length ? choose(s, "Search: which card?", [...known.map((c) => `Find ${c.name}`), "Find nothing"], "player", [...known.map((c) => c.id), null]) : 0;
      const found = known[k];
      z.libraryCount = (z.libraryCount || 0) + known.length - (found ? 1 : 0); z.library = []; z.libraryBottom = [];
      ev.push({ type: "search", side: "player", id: found && found.id });
      if (found) {
        z.exile.push(found);
        const free = eff.beseech.free && manaValue(faceOf(found, {}).cost) <= 4 && castFree(s, found, "player", ev, { zone: "exile", decline: "Put it into your hand" }).cast;
        if (!free) { z.exile = z.exile.filter((c) => c !== found); z.hand.push(found); }
      }
    }
    // Ashiok +1: "Look at the top two cards of your library. Exile one of them and put the other into your hand."
    if (eff.ashiokLook && ctx.side === "player") {
      const two = z.library.splice(0, 2);
      if (two.length === 2) { const k = choose(s, "Exile which one? (the other goes into your hand)", two.map((c) => `Exile ${c.name}`), "player", two.map((c) => c.id)); putCard(s, two[k], "player", "exile"); z.hand.push(two[1 - k]); }
      else {   // (unknown cards: one of them to your hand, one exiled)
        two.forEach((c) => z.hand.push(c));
        const unknownN = Math.min(2 - two.length, z.libraryCount || 0);
        if (unknownN >= 1) { z.libraryCount--; z.exileUnknown = (z.exileUnknown || 0) + 1; }
        if (unknownN >= 2 || (unknownN === 1 && !two.length)) draw(s, "player", 1, ev);
      }
    }
    // Ashiok −7: "Target player exiles the top X cards of their library, where X is the total mana value of cards you own in exile."
    if (eff.ashiokMill && (to === "opp" || to === "you")) {
      let n = s[ctx.side].exile.reduce((t, c) => t + manaValue(faceOf(c, {}).cost), 0);
      const zz = s[to === "opp" ? "opponent" : "player"];
      while (n-- > 0) { const c = zz.library.shift() || (!(zz.libraryCount > 0) ? zz.libraryBottom.shift() : null); if (c) putCard(s, c, to === "opp" ? "opponent" : "player", "exile"); else if (zz.libraryCount > 0) { zz.libraryCount--; zz.exileUnknown = (zz.exileUnknown || 0) + 1; } else break; }
    }
    // a reflexive "When you do, choose one —" resolved right away (nothing can happen in between): chooseEffect
    if (eff.chooseEffect) { const k = choose(s, `${(ctx.src && ctx.src.name) || "Choose"}: choose one`, eff.chooseEffect.map((m) => m.text), ctx.side); applyEffect(s, eff.chooseEffect[k].effect, undefined, ctx, ev); }
    // a reflexive triggered ability with its own target ("When a creature card is exiled this way, put a +1/+1 counter on target creature you control")
    if (eff.reflexive) s.triggered.push({ side: ctx.side, name: (ctx.src && ctx.src.name) || "Reflexive", srcId: ctx.selfId, td: defId(REFLEX[eff.reflexive]), event: {} });
    // Feral Encounter: a delayed trigger "At the beginning of the next combat phase this turn, …"
    if (eff.delayBoc) s.delayedBoc = [...(s.delayedBoc || []), { kind: eff.delayBoc, side: ctx.side, name: (ctx.src && ctx.src.name) || "Delayed", srcId: ctx.selfId }];
    // Rowan / Will: "Spells you cast this turn that are black and/or red cost {X} less to cast, where X is the amount of life you lost this turn."
    if (eff.costLessByLife && ctx.side === "player") s.costLessByLife = [...(s.costLessByLife || []), eff.costLessByLife];
    // Yenna: "Create a token that's a copy of it, except it isn't legendary. If the token is an Aura, untap Yenna, then scry 2."
    if (eff.yenna && tgt) {
      const made = createTokens(s, { ...copyValues(tgt, { notLegendary: true }) }, ctx.side, ev);
      made.forEach((tok) => {
        if (!tok.aura) return;
        // (an Aura put onto the battlefield without being cast: its controller chooses what it enchants, not a target — CR 303.4f)
        const all = [...s.player.battlefield, ...s.opponent.battlefield].filter((c) => c !== tok && (tok.aura.targets === "permanent" ? true : tok.aura.targets === "land" ? isLand(c) : isCreature(c)) && matches(s, c, tok.aura.filter, ctx.side));
        if (all.length) { tok.attachedTo = all[choose(s, `${tok.name}: enchant what?`, all.map((c) => c.name), ctx.side, all.map((c) => c.id))].id; changed(s); }
      });
      if (made.some((tok) => tok.aura)) { const y = me(); if (y) untap(s, y, ev); applyEffect(s, { scry: 2 }, undefined, ctx, ev); }
    }
    // The Irencrag: "you may have The Irencrag become a legendary Equipment artifact named Everflame, Heroes' Legacy. If you
    // do, it gains equip {3} and 'Equipped creature gets +3/+3' and loses all other abilities." (the same object, CR 400.7 doesn't apply)
    if (eff.becomeFace) {
      const c = me();
      if (c && c.becomes && choose(s, `${c.name}: become ${c.becomes.name}?`, [`Become ${c.becomes.name}`, "Don't"], ctx.side, c.id) === 0) {
        const face = compile(clone(c.becomes));
        Object.keys(c).filter((k) => !KEEP_ON_TRANSFORM.includes(k)).forEach((k) => delete c[k]);
        Object.assign(c, face);
        listen(s, c); recomputeStatics(s);
      }
    }
  }

  // Effects added in the second pass over March of the Machine
  // (an amount for a waiting trigger, before it resolves: the lands you control)
  const amount0 = (s, d, p) => (d === "landsYouControl" ? s[p.side].battlefield.filter(isLand).length : typeof d === "number" ? d : 0);
  const RAGAVAN = { name: "First Mate Ragavan", type: "Legendary Token Creature — Monkey Pirate", pt: "2/1", colors: ["R"] };
  const SPIRIT_RW = { name: "Spirit", type: "Token Creature — Spirit", pt: "3/2", colors: ["R", "W"] };
  // reflexive triggers ("When you discard one or more cards this way, …"; "When you do, …"): one definition each
  const BORB_REFLEX = { targets: "creature", effect: { damage: "eventCount" } };
  const TEFERI_REFLEX = {};
  const teferiReflex = (n) => TEFERI_REFLEX[n] || (TEFERI_REFLEX[n] = { targets: "permanent", targetFilter: { controller: "opponent", nonland: true, maxManaValue: n }, effect: { shuffleIntoLibrary: true } });
  // the card types a card has ("shares a card type with it")
  const cardTypesOf = (f) => CARD_TYPES.filter((ty) => new RegExp(`\\b${ty}\\b`, "i").test((f.type || "").split("—")[0]));
  function momEffects(s, eff, tgt, to, ctx, ev, target, amount) {
    const z = s[ctx.side], me = () => find(s, ctx.selfId);
    // The Great Synthesis: "You may cast any number of spells from your hand without paying their mana costs."
    if (eff.freeCastHand) for (let k = 0; k < 30; k++) if (!castFree(s, z.hand, ctx.side, ev, { zone: "hand", prompt: "Cast a spell from your hand without paying its mana cost?", decline: "Stop" }).cast) break;
    // The Great Work: "Until end of turn, you may cast instant and sorcery spells from any graveyard. If a spell cast this
    // way would be put into a graveyard, exile it instead." (cast from a graveyard: exiled as it leaves the stack)
    if (eff.instSorcAnyGraveyard && ctx.side === "player") s.instSorcAnyGraveyard = true;
    // Invasion of Kaldheim: "exile all cards from your hand, then draw that many cards. Until the end of your next turn,
    // you may play cards exiled this way."
    if (eff.exileHandDraw && ctx.side === "player") { const n = z.hand.length; z.hand.forEach((c) => { c.playable = true; z.exile.push(c); }); z.hand = []; draw(s, "player", n, ev); }
    // Nahiri's Warcrafting: 5 damage; "Look at the top X cards of your library, where X is the excess damage dealt this
    // way. You may exile one of those cards. … You may play the exiled card this turn." (excess: CR 120.4a)
    if (eff.warcrafting && tgt) {
      const lethal = isCreature(tgt) ? Math.max(toughness(tgt) - (tgt.dmg || 0), 0) : isPlaneswalker(tgt) ? loyaltyOf(tgt) : isBattle(tgt) ? defenseOf(tgt) : 0;
      const n0 = ev.length;
      dealDamage(s, ctx.src, ctx.side, tgt.id, eff.warcrafting, ev);
      const hit = ev.slice(n0).find((e) => e.type === "damage" && e.id === tgt.id);
      const dealt = hit ? hit.amount : 0;
      const excess = Math.max(dealt - (isCreature(tgt) && has(ctx.src, "deathtouch") && lethal > 0 ? 1 : lethal), 0);
      const seen = z.library.splice(0, excess);                  // (unknown cards looked at stay unknown: only known ones can be exiled)
      const k = seen.length ? choose(s, "Exile one of them (you may play it this turn)?", [...seen.map((c) => `Exile ${c.name}`), "Exile none"], ctx.side, [...seen.map((c) => c.id), null]) : 0;
      seen.forEach((c, i) => { if (i === k) { c.playable = true; z.exile.push(c); } else z.libraryBottom.push(c); });
    }
    // "you may return a land card from your graveyard to the battlefield tapped"
    if (eff.mayReturnLand) {
      const lands = z.graveyard.filter((c) => isLand(faceOf(c, {})));
      const k = lands.length ? choose(s, "Return a land card from your graveyard to the battlefield?", [...lands.map((c) => `Return ${c.name}`), "Don't"], ctx.side, [...lands.map((c) => c.id), null]) : 0;
      if (k < lands.length) { const c = lands[k]; z.graveyard = z.graveyard.filter((x) => x !== c); if (eff.mayReturnLand.tapped) c.tapped = true; enter(s, asFace(c, 0), { side: ctx.side }, ev); }
    }
    // "search your library for up to two Forest cards, reveal them, put them into your hand, then shuffle"
    if (eff.searchToHand) {
      for (let i = 0; i < eff.searchToHand.n; i++) {
        const known = [...z.library, ...z.libraryBottom].filter((c) => objectIs(faceOf(c, {}), eff.searchToHand.filter || {}));
        const k = known.length ? choose(s, `Search: a card (${i + 1} of up to ${eff.searchToHand.n})`, [...known.map((c) => `Find ${c.name}`), "Find no more"], ctx.side, [...known.map((c) => c.id), null]) : 0;
        if (k >= known.length) break;
        z.library = z.library.filter((c) => c !== known[k]); z.libraryBottom = z.libraryBottom.filter((c) => c !== known[k]); z.hand.push(known[k]);
      }
      z.libraryCount = (z.libraryCount || 0) + z.library.length + z.libraryBottom.length; z.library = []; z.libraryBottom = [];
      ev.push({ type: "search", side: ctx.side });
    }
    // The Grand Evolution III: "Until end of turn, creatures you control gain '{1}: This creature fights target creature you don't control.'"
    if (eff.teamAbilities) z.battlefield.filter(isCreature).forEach((c) => addEffect(s, c, { addAbilities: eff.teamAbilities }));
    // Baral and Kari Zev: "you may cast a spell with lesser mana value that shares a card type with it from your hand
    // without paying its mana cost. If you don't, create First Mate Ragavan … It gains haste until end of turn."
    if (eff.baral) {
      const item = s.stack.find((x) => x.kind === "spell" && x.id === (ctx.event && ctx.event.id));
      const types = item ? cardTypesOf(faceOf(item.card, item.a)) : [], mv = (ctx.event && ctx.event.mv) || 0;
      const fits = z.hand.filter((c) => !c.unknown && manaValue(faceOf(c, {}).cost) < mv && cardTypesOf(faceOf(c, {})).some((ty) => types.includes(ty)));
      if (!castFree(s, fits, ctx.side, ev, { zone: "hand", decline: "Don't (create First Mate Ragavan)" }).cast) createTokens(s, RAGAVAN, ctx.side, ev).forEach((c) => grant(c, ["haste"], s));
    }
    // Borborygmos and Fblthp: "draw a card, then you may discard any number of land cards. When you discard one or more
    // cards this way, Borborygmos and Fblthp deals twice that much damage to target creature."
    if (eff.borbDiscard && ctx.side === "player") {
      draw(s, "player", 1, ev);
      let n = 0;
      [...z.hand].filter((c) => !c.unknown && isLand(faceOf(c, {}))).forEach((c) => { if (choose(s, `Discard ${c.name}?`, ["Discard it", "Keep it"], "player", c.id) === 0) { discardCard(s, c, ev); n++; } });
      if (n) s.triggered.push({ side: "player", name: (ctx.src && ctx.src.name) || "Borborygmos and Fblthp", srcId: ctx.selfId, td: defId(BORB_REFLEX), event: { count: 2 * n } });
    }
    // "{1}{U}: Put Borborygmos and Fblthp into its owner's library third from the top." (two known cards on top: it's
    // known as the third; otherwise it joins the unknown part)
    if (eff.libraryThird) {
      const c = me();
      if (c) {
        const owner = c.owner || ctx.side;
        leave(s, c, "library", ev);
        const lib = s[owner];
        if (!c.token && lib.library.length >= 2) { lib.libraryCount = Math.max((lib.libraryCount || 1) - 1, 0); const card = { ...c }; ["tapped", "dmg", "counters", "sick", "st"].forEach((k) => delete card[k]); lib.library.splice(2, 0, card); }
      }
    }
    // Hidetsugu and Kairi: "put two cards from your hand on top of your library in any order" (the last one chosen on top)
    if (eff.putBackFromHand && ctx.side === "player") for (let i = 0; i < eff.putBackFromHand && z.hand.length; i++) {
      const k = choose(s, `Put a card from your hand on top of your library (${i + 1} of ${eff.putBackFromHand}${i ? ", this one on top" : ""})`, z.hand.map((c) => c.name), "player", z.hand.map((c) => c.id));
      const [c] = z.hand.splice(k, 1); z.library.unshift(c);
    }
    // "exile the top card of your library. Target opponent loses life equal to its mana value. If it's an instant or
    // sorcery card, you may cast it without paying its mana cost." (an unknown top card: nothing known happens)
    if (eff.hidetsugu && to === "opp") {
      const c = z.library.shift();
      if (c) {
        z.exile.push(c);
        changeLife(s, "opp", -manaValue(faceOf(c, {}).cost), ev);
        if (typeHas(faceOf(c, {}), /instant|sorcery/i)) castFree(s, c, ctx.side, ev, { zone: "exile" });
      } else if (z.libraryCount > 0) z.libraryCount--;
    }
    // Invasion of Alara: "exile cards from the top of your library until you exile two nonland cards with mana value 4
    // or less. You may cast one of those two cards without paying its mana cost. Put one of them into your hand. Then put
    // the other cards exiled this way on the bottom of your library in a random order." (only known cards are turned over)
    if (eff.alara && ctx.side === "player") {
      const exiled = [], two = [];
      while (two.length < 2 && z.library.length) { const c = z.library.shift(); exiled.push(c); if (!isLand(faceOf(c, {})) && manaValue(faceOf(c, {}).cost) <= 4) two.push(c); }
      z.exile.push(...two);
      const cast = castFree(s, two, "player", ev, { zone: "exile", prompt: "Cast one of them without paying its mana cost?" }).cast;
      const left = two.filter((c) => c !== cast);
      if (left.length) {
        const k = left.length > 1 ? choose(s, "Put which one into your hand?", left.map((c) => c.name), "player", left.map((c) => c.id)) : 0;
        z.exile = z.exile.filter((c) => c !== left[k]); z.hand.push(left[k]);
        left.filter((_, i) => i !== k).forEach((c) => { z.exile = z.exile.filter((x) => x !== c); z.libraryBottom.push(c); });
      }
      exiled.filter((c) => !two.includes(c)).forEach((c) => z.libraryBottom.push(c));
    }
    // Awaken the Maelstrom: "Target player draws two cards. You may put an artifact card from your hand onto the
    // battlefield. Create a token that's a copy of a permanent you control. Distribute three +1/+1 counters among one,
    // two, or three creatures you control. Destroy target permanent an opponent controls." (targets: [player, permanent])
    if (eff.maelstrom && ctx.side === "player") {
      const [who, doomed] = [].concat(target || []);
      if (who === "you") draw(s, "player", 2, ev); else if (who === "opp") draw(s, "opponent", 2, ev);
      applyEffect(s, { putFromHand: { filter: { artifact: true }, max: 1 } }, undefined, ctx, ev);
      const mine = s.player.battlefield;
      if (mine.length) { const k = choose(s, "Create a token copy of which permanent you control?", mine.map((c) => c.name), "player", mine.map((c) => c.id)); createTokens(s, copyValues(mine[k]), "player", ev); }
      const cs = s.player.battlefield.filter(isCreature);
      if (cs.length) {
        const splits = [];
        (function go(i, left, acc) { if (i === cs.length) { if (!left && acc.some((n) => n)) splits.push(acc); return; } for (let n = 0; n <= left; n++) go(i + 1, left - n, [...acc, n]); })(0, 3, []);
        const k = choose(s, "Distribute three +1/+1 counters", splits.map((sp) => sp.map((n, i) => (n ? `${n} on ${cs[i].name}` : null)).filter(Boolean).join(", ")), "player");
        splits[k].forEach((n, i) => { if (n) addCounters(s, cs[i], "+1/+1", n, ev); });
      }
      const d = doomed && find(s, doomed);
      if (d && sideOf(s, d) === "opponent" && !survivesDestroy(s, d, ev)) leave(s, d, "graveyard", ev);
    }
    // Teferi Akosa of Zhalfir −3: "Tap any number of untapped creatures you control. When you do, shuffle target nonland
    // permanent an opponent controls with mana value X or less into its owner's library, where X is the number of
    // creatures tapped this way."
    if (eff.teferiTap && ctx.side === "player") {
      let n = 0;
      s.player.battlefield.filter((c) => isCreature(c) && !c.tapped).forEach((c) => { if (choose(s, `Tap ${c.name}?`, ["Tap it", "Don't"], "player", c.id) === 0) { tap(s, c, ev); n++; } });
      if (n) s.triggered.push({ side: "player", name: (ctx.src && ctx.src.name) || "Teferi Akosa of Zhalfir", srcId: ctx.selfId, td: defId(teferiReflex(n)), event: { count: n } });
    }
    if (eff.shuffleIntoLibrary && tgt) leave(s, tgt, "library", ev);
    // Omnath, Locus of All: "look at the top card of your library. You may reveal that card if it has three or more colored
    // mana symbols in its mana cost. If you do, add three mana in any combination of its colors and put it into your hand.
    // If you don't reveal it, put it into your hand."
    if (eff.omnath && ctx.side === "player") {
      const c = z.library[0];
      if (!c) draw(s, "player", 1, ev);
      else {
        z.library.shift(); z.hand.push(c);
        const f = faceOf(c, {}), sym = ((f.cost || "").match(/\{[^}]*[WUBRG][^}]*\}/g) || []).length, cols = colorsOf(f);
        if (sym >= 3 && cols.length) {
          const combos = []; (function go(start, acc) { if (acc.length === 3) { combos.push(acc); return; } for (let i = start; i < cols.length; i++) go(i, [...acc, cols[i]]); })(0, []);
          const k = choose(s, `Reveal ${c.name}? (three mana in any combination of its colors)`, ["Don't reveal it", ...combos.map((l) => `Reveal it: add ${l.map((x) => `{${x}}`).join("")}`)], "player", c.id);
          if (k > 0) s.pool.push(...combos[k - 1]);
        }
      }
    }
    // Zurgo and Ojutai: "You may return one of those Dragons to its owner's hand." (the Dragons of yours that dealt combat
    // damage to a player or battle this combat)
    if (eff.zurgoReturn) {
      const ds = (s.combatDamagersPB || []).map((id) => find(s, id)).filter((c) => c && sideOf(s, c) === ctx.side && hasType(c, "Dragon"));
      const k = ds.length ? choose(s, "Return one of those Dragons to its owner's hand?", [...ds.map((c) => `Return ${c.name}`), "Don't"], ctx.side, [...ds.map((c) => c.id), null]) : 0;
      if (k < ds.length) leave(s, ds[k], "hand", ev);
    }
    // Sword of Once and Future: "Then you may cast an instant or sorcery spell with mana value 2 or less from your
    // graveyard without paying its mana cost. If that spell would be put into your graveyard, exile it instead."
    if (eff.freeCastGraveyard) {
      const fits = z.graveyard.filter((c) => objectIs(faceOf(c, {}), eff.freeCastGraveyard.filter || {}));
      castFree(s, fits, ctx.side, ev, { zone: "graveyard", exileAfter: true });
    }
    // Sheoldred: "each opponent sacrifices a nontoken creature or planeswalker of their choice"
    if (eff.oppSacrifices) {
      const o = ctx.side === "player" ? "opponent" : "player", opts = s[o].battlefield.filter((c) => matches(s, c, eff.oppSacrifices, o));
      if (opts.length) leave(s, opts[choose(s, "Which does the opponent sacrifice?", opts.map((c) => c.name), o, opts.map((c) => c.id))], "graveyard", ev, { sacrificed: true });
    }
    // The True Scriptures II: "Each opponent discards three cards, then mills three cards." (unknown cards)
    if (eff.oppDiscardMill && ctx.side === "player") {
      const o = s.opponent, d = Math.min(3, o.handCount || 0), m = Math.min(3, o.libraryCount || 0);
      o.handCount = (o.handCount || 0) - d; o.libraryCount = (o.libraryCount || 0) - m; o.gyUnknown = (o.gyUnknown || 0) + d + m;
      ev.push({ type: "discard", who: "opp", amount: d });
    }
    // The True Scriptures III: "Put all creature cards from all graveyards onto the battlefield under your control."
    if (eff.reanimateAll) {
      const back = ["player", "opponent"].flatMap((sd) => s[sd].graveyard.filter((c) => isCreature(faceOf(c, {}))).map((c) => [sd, c]));
      back.forEach(([sd, c]) => { s[sd].graveyard = s[sd].graveyard.filter((x) => x !== c); });
      back.forEach(([, c]) => { const p = asFace(c, 0); p.sick = true; ev.push({ type: "reanimated", id: c.id }); enter(s, p, { side: ctx.side }, ev); });
    }
    // Marchesa: "remove all counters from up to one target permanent"
    if (eff.removeAllCounters && tgt) { tgt.counters = {}; if (isPlaneswalker(tgt)) tgt.counters.loyalty = 0; changed(s); ev.push({ type: "counters-removed", id: tgt.id }); }
  }
  // Effects added for the rares and mythics (Phyrexia: All Will Be One onward)
  function moreEffects(s, eff, tgt, to, ctx, ev, target, amount) {
    // "Gain control of target creature" (for good: no untap, no haste — unlike Threaten's steal)
    if (eff.gainControl && tgt && sideOf(s, tgt) !== ctx.side) {
      s[sideOf(s, tgt)].battlefield = s[sideOf(s, tgt)].battlefield.filter((c) => c !== tgt);
      s[ctx.side].battlefield.push(tgt);
      tgt.sick = true;                                           // (a new controller since the turn began)
      changed(s);
      ev.push({ type: "stolen", id: tgt.id });
    }
    // "Choose a counter on target permanent. Put an additional counter of that kind on that permanent."
    if (eff.extraCounter && tgt) {
      const kinds = Object.keys(tgt.counters || {}).filter((k) => tgt.counters[k] > 0);
      if (kinds.length) {
        const k = kinds[choose(s, `Which counter on ${tgt.name}?`, kinds.map((x) => `Another ${x} counter`), ctx.side, tgt.id)];
        applyEffect(s, { counters: { [k]: 1 } }, tgt.id, ctx, ev);
      }
    }
    // "you may remove two oil counters from it. If you do, …" (from this permanent)
    if (eff.mayRemoveCounters) {
      const { kind, n, then } = eff.mayRemoveCounters, me = find(s, ctx.selfId);
      if (me && ((me.counters || {})[kind] || 0) >= n && choose(s, `Remove ${n} ${kind} counters from ${me.name}?`, ["Remove them", "Don't"], ctx.side, me.id) === 0) {
        me.counters = { ...me.counters, [kind]: me.counters[kind] - n };
        if (!me.counters[kind]) delete me.counters[kind];
        applyEffect(s, then, target, ctx, ev);
      }
    }
    // "when you next cast an instant or sorcery spell this turn, copy that spell" (a delayed trigger, CR 603.7c; see cast)
    if (eff.copyNextSpell && ctx.side === "player") { const e0 = { name: (ctx.src && ctx.src.name) || "Copy", srcId: ctx.selfId }; if (eff.copyNextSpell.any) s.copyNextAny = [...(s.copyNextAny || []), e0]; else s.copyNext = [...(s.copyNext || []), e0]; }
    // "return a creature card with mana value X or less from your graveyard to the battlefield (tapped)" — chosen as it
    // resolves, not targeted (optional: "you may")
    if (eff.reanimateChoice) {
      const r = eff.reanimateChoice, z = s[ctx.side];
      const opts = z.graveyard.filter((c) => (r.land ? isLand(faceOf(c, {})) : isCreature(faceOf(c, {}))) && (r.maxMV == null || manaValue(faceOf(c, {}).cost) <= r.maxMV));   // (r.land: "a land card")
      const labels = [...opts.map((c) => `Return ${c.name}`), ...(r.optional ? ["Don't return a card"] : [])];
      const pick = opts.length ? choose(s, "Return which creature card?", labels, ctx.side, [...opts.map((c) => c.id), ...(r.optional ? [null] : [])]) : -1;
      if (pick >= 0 && pick < opts.length) {
        const card = opts[pick];
        z.graveyard = z.graveyard.filter((c) => c !== card);
        card.sick = true;
        if (r.tapped) card.tapped = true;
        ev.push({ type: "reanimated", id: card.id });
        enter(s, card, { side: ctx.side }, ev);
        emit(s, { type: "leavesGraveyard", side: ctx.side, obj: { id: card.id } }, ev);
      }
    }
    // "look at the top five cards of your library. You may reveal any number of Rat cards from among them and put the
    // revealed cards into your hand" (the known ones: one yes/no each; the rest go to the bottom)
    if (eff.lookTop) {
      const z = s[ctx.side], n = eff.lookTop.n === "eventCount" ? (ctx.event && ctx.event.count) || 0 : eff.lookTop.n === "twiceLands" ? 2 * s[ctx.side].battlefield.filter(isLand).length : eff.lookTop.n === "lands" ? s[ctx.side].battlefield.filter(isLand).length : eff.lookTop.n === "selfPower" ? Math.max(0, power(find(s, ctx.selfId) || ctx.src)) : eff.lookTop.n;
      const me0 = find(s, ctx.selfId) || ctx.src;
      const seen = z.library.splice(0, n);
      const unknownSeen = Math.min(Math.max(n - seen.length, 0), z.libraryCount || 0);
      // (pickOne: "Put one of them into your hand" — one of the known ones, if any; max: "you may reveal a card …" — at most that many)
      if ((eff.lookTop.pickOne || eff.lookTop.pickN) && seen.length) {
        let left = [...seen];
        for (let i = 0; i < (eff.lookTop.pickN || 1) && left.length; i++) {
          const k = choose(s, "Put which card into your hand?", left.map((c) => c.name), ctx.side, left.map((c) => c.id));
          z.hand.push(left[k]); left = left.filter((_, j) => j !== k);
        }
        if (eff.lookTop.restTo === "graveyard") left.forEach((c) => putCard(s, c, ctx.side, "graveyard")); else z.libraryBottom.push(...left);
      } else {
        let taken = 0;
        seen.forEach((c) => {
          // (kindsOnce: "a creature card and/or a land card": at most one of each)
          const kinds = eff.lookTop.kindsOnce, kind = kinds && kinds.find((k) => (k === "creature" ? isCreature(faceOf(c, {})) : isLand(faceOf(c, {}))) && !(ctx.kindsTaken || []).includes(k));
          // (maxMVConvoked: "creature cards with mana value X or less …, where X is the number of creatures that convoked this creature")
          const lf = eff.lookTop.maxMVConvoked ? { ...(eff.lookTop.filter || {}), maxMV: (((me0 && me0.convokedBy) || []).length) } : eff.lookTop.filter || {};
          const fits = (kinds ? !!kind : objectIs(faceOf(c, {}), lf)) && (eff.lookTop.max == null || taken < eff.lookTop.max);
          if (fits && kind) ctx.kindsTaken = [...(ctx.kindsTaken || []), kind];
          // (to: "battlefield" — "If this spell was bargained, put the revealed cards onto the battlefield")
          const where = eff.lookTop.to === "battlefield" ? "the battlefield" : eff.lookTop.to === "exileFree" ? "exile (cast it free this turn)" : eff.lookTop.to === "exilePlayable" ? "exile (cast it this turn)" : "your hand";
          if (fits && choose(s, `Put ${c.name} onto ${where}?`, [`Onto ${where}`, "To the bottom"], ctx.side, c.id) === 0) {
            taken++;
            if (eff.lookTop.to === "battlefield") { c.sick = true; if (eff.lookTop.tapped) c.tapped = true; enter(s, asFace(c, 0), { side: ctx.side }, ev); }
            // ("You may exile a legendary creature card from among them. … Until end of turn, you may cast the exiled card without paying its mana cost.")
            else if (eff.lookTop.to === "exileFree") { c.playable = true; c.freeCast = true; z.exile.push(c); }
            else if (eff.lookTop.to === "exilePlayable") { c.playable = true; z.exile.push(c); }   // ("You may cast the exiled card this turn.")
            else z.hand.push(c);
          } else z.libraryBottom.push(c);
        });
      }
      // ("Then shuffle": no card of the library is known any more)
      if (eff.lookTop.shuffle) { z.libraryCount = (z.libraryCount || 0) + z.library.length + z.libraryBottom.length; z.library = []; z.libraryBottom = []; }
      ev.push({ type: "looked", side: ctx.side, n: seen.length + unknownSeen });
    }
    // "that source's controller sacrifices that many permanents of their choice" (to: whose; n: how many)
    if (eff.sacrificePerms) {
      const who = relativeTo(eff.sacrificePerms.who, ctx), side = who === "you" ? "player" : "opponent";
      const n = eff.sacrificePerms.n === "eventCount" ? (ctx.event && ctx.event.count) || 0 : eff.sacrificePerms.n;
      for (let i = 0; i < n && s[side].battlefield.length; i++) {
        const list = s[side].battlefield;
        const pick = choose(s, `Sacrifice a permanent (${i + 1} of ${n})`, list.map((c) => c.name), side, list.map((c) => c.id));
        leave(s, list[pick], "graveyard", ev, { sacrificed: true });
      }
    }
    // "Discard your hand"
    if (eff.discardHand && ctx.side === "player") [...s.player.hand].forEach((c) => discardCard(s, c, ev));
    // "Search your library for a basic Mountain card, reveal it, put it into your hand, then shuffle" (only known cards can
    // be found: the rest of a library is unknown; you may fail to find, CR 701.19b). After the shuffle no card of it is known.
    if (eff.search) {
      const z = s[ctx.side];
      const sf = eff.search.maxMVSelfX ? { ...(eff.search.filter || {}), maxMV: ((find(s, ctx.selfId) || ctx.src || {}).xPaid || 0) } : eff.search.filter || {};   // ("with mana value X or less")
      const known = [...z.library, ...z.libraryBottom].filter((c) => objectIs(faceOf(c, {}), sf) && (!eff.search.basic || /\bbasic\b/i.test(c.type || "")) &&
        (!eff.search.mvSacPlus1 || manaValue(faceOf(c, {}).cost) === (ctx.sacMV || 0) + 1));
      // ("search your library and/or graveyard": graveyard cards can be found too, without a shuffle making them unknown)
      if (eff.search.graveyardToo) known.push(...z.graveyard.filter((c) => objectIs(faceOf(c, {}), sf)));
      const pick = known.length ? choose(s, "Search: which card?", [...known.map((c) => `Find ${c.name}`), "Find nothing"], ctx.side, [...known.map((c) => c.id), null]) : 0;
      const found = known[pick];
      if (found) { z.library = z.library.filter((c) => c !== found); z.libraryBottom = z.libraryBottom.filter((c) => c !== found); z.graveyard = z.graveyard.filter((c) => c !== found);
        if (eff.search.toTop) { z.libraryCount = (z.libraryCount || 0) + z.library.length + z.libraryBottom.length; z.library = [found]; z.libraryBottom = []; ev.push({ type: "search", side: ctx.side, id: found.id }); return; }
        if (eff.search.toGraveyard) putCard(s, found, ctx.side, "graveyard");
        // ("exile it face down … For as long as that card remains exiled, you may play it.")
        else if (eff.search.toExile) { found.playable = true; z.exile.push(found); }
        else if (eff.search.toBattlefield) { found.sick = true; if (eff.search.tapped) found.tapped = true; enter(s, asFace(found, 0), { side: ctx.side }, ev); }
        else if (eff.search.landToBattlefield && isLand(faceOf(found, {}))) { found.tapped = true; enter(s, asFace(found, 0), { side: ctx.side }, ev); } else z.hand.push(found); }
      z.libraryCount = (z.libraryCount || 0) + z.library.length + z.libraryBottom.length;
      z.library = []; z.libraryBottom = [];
      ev.push({ type: "search", side: ctx.side, id: found && found.id });
    }
    // "You get an emblem with …" (CR 114: an object in the command zone; its triggered abilities work there)
    if (eff.emblem) {
      const em = compile({ ...clone(eff.emblem), triggers: (eff.emblem.triggers || []).map((t) => ({ ...t, zones: ["command"] })),
        type: "Emblem", id: `emblem-${s.nextId++}`, owner: ctx.side, colors: [] });
      s[ctx.side].command = [...(s[ctx.side].command || []), em];
      s.offField = true;
      listen(s, em);
      if (em.static) changed(s);                                 // (its static abilities apply right away)
      ev.push({ type: "emblem", id: em.id });
    }
    // "you may pay {3}. If you do, …" (only you pay; with mana you have)
    if (eff.mayPay && ctx.side === "player") {
      const pay = bestPayment(s, eff.mayPay.cost);
      if (pay && choose(s, `Pay ${eff.mayPay.cost}?`, [`Pay ${eff.mayPay.cost}`, "Don't pay"], "player") === 0) { spend(s, pay, ev); applyEffect(s, eff.mayPay.then, target, ctx, ev); }
    }
    // "you may pay 2 life. If you do, …"
    // (n: a number or an amount, "pay life equal to its power")
    const payN = eff.mayPayLife ? amount(eff.mayPayLife.n) : 0;
    if (eff.mayPayLife && ctx.side === "player" && canPayLife(s, payN) &&
      choose(s, `Pay ${payN} life?`, [`Pay ${payN} life`, "Don't pay"], "player") === 0) {
      payLife(s, payN, ev);
      applyEffect(s, eff.mayPayLife.then, target, ctx, ev);
    }
    // several effects one after another ("Draw a card, then scry 2"; "proliferate twice")
    // (a target that's gone after an earlier part — "Destroy target …, then draw a card" — doesn't stop the later parts)
    const still = (t) => t == null || t === "opp" || t === "you" || Array.isArray(t) || !!find(s, t) ||
      [...s.player.graveyard, ...s.opponent.graveyard].some((c) => c.id === t);
    // (a target that was a permanent and has left the battlefield is a new object in its new zone, CR 400.7)
    const wasPermanent = eff.seq && typeof target === "string" && !!find(s, target);
    if (eff.seq) eff.seq.forEach((e) => applyEffect(s, e, (wasPermanent ? !!find(s, target) : still(target)) ? target : undefined, ctx, ev));
    // "Exile target creature. If it wasn't an Aura, create a token that's a copy of it, except …" (from its last
    // known values, CR 707.2)
    if (eff.exileCopy && tgt) {
      const wasAura = !!tgt.aura, v = copyValues(tgt, eff.exileCopy.except || {});
      if (eff.exileCopy.addType) v.type = addTypes(v.type, eff.exileCopy.addType);
      leave(s, tgt, "exile", ev);
      if (!wasAura) createToken(s, v, ctx.side, ev);
    }
    // "exile it. If you do, create a token that's a copy of that creature, except …" (the card that just died: ctx.event.id)
    if (eff.exileDeadCopy) {
      const z = s[ctx.event && ctx.event.side === "opponent" ? "opponent" : "player"];
      const card = z.graveyard.find((c) => c.id === (ctx.event && ctx.event.id));
      if (card) {
        z.graveyard = z.graveyard.filter((c) => c !== card);
        z.exile.push(card);
        createToken(s, copyValues(faceOf(card, {}), eff.exileDeadCopy.except || {}), ctx.side, ev);
      }
    }
    // "each other player draws a card" — other than you, who cast it: the opponent (their hand is unknown cards)
    if (eff.oppDraws) draw(s, "opponent", eff.oppDraws, ev);
    // "You may play an additional land this turn"
    if (eff.extraLand && ctx.side === "player") s.extraLands = (s.extraLands || 0) + eff.extraLand;
    if (eff.sorceryFlash && ctx.side === "player") s.sorceryFlash = true;
    // backup: "it gains the following abilities until end of turn" — activated ones (backup.abilities)
    if (eff.backup && tgt && tgt.id !== ctx.selfId && eff.backup.abilities) addEffect(s, tgt, { addAbilities: eff.backup.abilities });
    // (and triggered ones, backup.triggers: kept as trigger definition ids, so the gained trigger is the same each time)
    if (eff.backup && tgt && tgt.id !== ctx.selfId && eff.backup.triggers) addEffect(s, tgt, { addTriggers: eff.backup.triggers.map(defId) });
    // "exile the top two cards of your library. You may play those cards this turn." (the known ones become playable)
    if (eff.impulseAll && ctx.side === "player") {
      const z = s.player;
      for (let i = 0; i < eff.impulseAll; i++) {
        const c = z.library.shift() || (!(z.libraryCount > 0) ? z.libraryBottom.shift() : null);
        // (impulseFilter: only those can be played — "you may cast an instant or sorcery spell from among them";
        // oneOf: only one of them — casting one ends the others' permission)
        if (c) {
          if (!eff.impulseFilter || objectIs(faceOf(c, {}), eff.impulseFilter)) { c.playable = true; if (eff.oneOf) c.oneOf = `${ctx.selfId}-${s.nextId}`; if (eff.whileControl) c.playableWhile = ctx.selfId; }
          z.exile.push(c);
        } else if (z.libraryCount > 0) z.libraryCount--;
      }
      if (eff.oneOf) s.nextId++;
      ev.push({ type: "impulse", n: eff.impulseAll });
    }
    // "attach up to one target Equipment you control to that creature" (the target: the Equipment)
    if (eff.attachTo && tgt && tgt.equip) {
      const host = find(s, relativeTo(eff.attachTo, ctx));
      if (host && isCreature(host) && sideOf(s, host) === sideOf(s, tgt)) { tgt.attachedTo = host.id; tgt.ts = stamp(s); changed(s); ev.push({ type: "attach", id: tgt.id, to: host.id }); }
    }
    // "you may attach all Equipment attached to that creature to [this]" (also Equipment that came off it as it died)
    if (eff.takeEquipment) {
      const me = find(s, ctx.selfId), from = ctx.event && ctx.event.id;
      const gear = me ? s[ctx.side].battlefield.filter((c) => c.equip && (c.attachedTo === from || (!c.attachedTo && c.lastAttachedTo === from))) : [];
      if (gear.length && choose(s, `Attach ${gear.map((c) => c.name).join(", ")} to ${me.name}?`, ["Attach", "Don't"], ctx.side, me.id) === 0) {
        gear.forEach((g) => { g.attachedTo = me.id; g.ts = stamp(s); delete g.lastAttachedTo; ev.push({ type: "attach", id: g.id, to: me.id }); });
        changed(s);
      }
    }
    // The Eternal Wanderer −4: "For each player, choose a creature that player controls. Each player sacrifices all
    // creatures they control not chosen this way." (its controller chooses for both)
    if (eff.keepOneEach) {
      const keep = {};
      ["player", "opponent"].forEach((side) => {
        // (Unstable Glyphbridge: "a creature with power 2 or less", and the rest are destroyed, not sacrificed)
        const list = s[side].battlefield.filter((c) => isCreature(c) && (eff.keepOneEach.maxPower == null || power(c) <= eff.keepOneEach.maxPower));
        if (list.length) keep[side] = list[choose(s, `Which creature does ${side === "player" ? "you" : "the opponent"} keep?`, list.map((c) => c.name), ctx.side, list.map((c) => c.id))].id;
      });
      const before = s.listens.length ? battlefieldNow(s) : null;
      ["player", "opponent"].forEach((side) => s[side].battlefield.filter((c) => isCreature(c) && c.id !== keep[side] && !(eff.keepOneEach.destroy && survivesDestroy(s, c, ev)))
        .forEach((c) => leave(s, c, "graveyard", ev, { sacrificed: !eff.keepOneEach.destroy, lookBack: before })));
    }
    // "Exile target creature or Equipment card with mana value less than Nahiri's loyalty from your graveyard. Create a
    // token that's a copy of it. That token gains haste. Exile it at the beginning of the next end step."
    if (eff.graveyardCopy) {
      const z = s[ctx.side], card = z.graveyard.find((c) => c.id === target);
      if (card) {
        z.graveyard = z.graveyard.filter((c) => c !== card);
        z.exile.push(card);
        emit(s, { type: "leavesGraveyard", side: ctx.side, obj: { id: card.id } }, ev);
        createTokens(s, { ...copyValues(faceOf(card, {})), exileAtEnd: true }, ctx.side, ev).forEach((t) => grant(t, ["haste"], s));
      }
    }
    // "… if X is 5 or more, …" (the rest of a spell that only happens with a big enough X)
    if (eff.ifX && (ctx.x || 0) >= eff.ifX.min) applyEffect(s, eff.ifX.effect, target, ctx, ev);
    // "draw a card if its power is 3 or greater. Otherwise, put two +1/+1 counters on it" (the event's creature)
    if (eff.ifEventPower) {
      const o = find(s, ctx.event && ctx.event.id);
      if (o) applyEffect(s, power(o) >= eff.ifEventPower.min ? eff.ifEventPower.yes : eff.ifEventPower.no, o.id, ctx, ev);
    }
    // "Exile all creatures" (how many: ctx.exiled, for "incubate X, where X is the number of creatures exiled this way")
    if (eff.exileAllCreatures) {
      const all = battlefieldNow(s).map(({ card }) => card).filter((c) => isCreature(c) || (eff.exileAllCreatures.spacecraft && subtypes(c).includes("Spacecraft")));   // (Beyond the Quiet: "and Spacecraft")
      const before = s.listens.length ? battlefieldNow(s) : null;
      all.forEach((c) => leave(s, c, "exile", ev, { lookBack: before }));
      ctx.exiled = all.length;
    }
    // Archangel Elspeth −6: "Return all nonland permanent cards with mana value 3 or less from your graveyard to the battlefield"
    if (eff.massReturn) {
      const z = s[ctx.side];
      const back = z.graveyard.filter((c) => { const g = faceOf(c, {}); return isPermanent(g) && !isLand(g) && manaValue(g.cost) <= eff.massReturn.maxMV && (!eff.massReturn.creaturesOnly || isCreature(g)); });
      z.graveyard = z.graveyard.filter((c) => !back.includes(c));
      back.forEach((c) => { c.sick = true; ev.push({ type: "reanimated", id: c.id }); enter(s, c, { side: ctx.side }, ev); });
      if (back.length) emit(s, { type: "leavesGraveyard", side: ctx.side, obj: { id: back[0].id } }, ev);
    }
    // "It becomes an Angel in addition to its other types" (for the rest of the game)
    if (eff.addSubtype && tgt) { tgt.type = addTypes(tgt.type, { subtypes: [eff.addSubtype] }); changed(s); }
    // "reveal any number of Dragon cards from your hand … X plus 2 damage, where X is the number revealed" (you choose
    // how many: revealCount: { type, then } — the effect's amounts "revealed" use it)
    if (eff.revealCount) {
      const n = s[ctx.side].hand.filter((c) => hasType(c, eff.revealCount.type)).length;
      const k = n ? choose(s, `Reveal how many ${eff.revealCount.type} cards?`, Array.from({ length: n + 1 }, (_, i) => `Reveal ${i}`), ctx.side) : 0;
      applyEffect(s, JSON.parse(JSON.stringify(eff.revealCount.then).replace(/"revealedPlus(\d+)"/g, (m, p) => String(k + Number(p)))), target, ctx, ev);
    }
    // Into the Fire: "Put any number of cards from your hand on the bottom of your library, then draw that many cards plus one."
    if (eff.bottomAndDraw && ctx.side === "player") {
      const put = [...s.player.hand].filter((c) => choose(s, `Put ${c.name} on the bottom of your library?`, ["Keep it", "To the bottom"], "player", c.id) === 1);
      s.player.hand = s.player.hand.filter((c) => !put.includes(c));
      put.forEach((c) => { if (c.unknown) s.player.libraryCount = (s.player.libraryCount || 0) + 1; else s.player.libraryBottom.push(c); });
      draw(s, "player", put.length + 1, ev);
    }
    // "You may sacrifice a creature. If you do, …" / "you may sacrifice a Food. If you do, draw a card."
    if (eff.maySacrificeThen) {
      // ("sacrifice another creature": filter.other leaves this one out)
      const list = s[ctx.side].battlefield.filter((c) => objectIs(c, eff.maySacrificeThen.filter || {}) && !(eff.maySacrificeThen.filter && eff.maySacrificeThen.filter.other && c.id === ctx.selfId));
      const k = list.length ? choose(s, "Sacrifice one?", [...list.map((c) => `Sacrifice ${c.name}`), "Don't"], ctx.side, [...list.map((c) => c.id), null]) : 0;
      // (then: "… equal to the sacrificed creature's power": its power as it last existed)
      if (k < list.length) { const sacPower = Math.max(0, power(list[k])), sacMV = manaValue(list[k].cost); leave(s, list[k], "graveyard", ev, { sacrificed: true }); applyEffect(s, eff.maySacrificeThen.then, undefined, { ...ctx, sacPower, sacMV }, ev); }
    }
    // "Target player mills four cards" (the opponent's library is unknown cards: they only leave it)
    // (the opponent's milled cards are unknown cards: they leave the library and add to their graveyard's size)
    if (eff.millTarget && (to === "opp" || target === "opp")) { const n = Math.min(amount(eff.millTarget), s.opponent.libraryCount || 0); s.opponent.libraryCount = (s.opponent.libraryCount || 0) - n; s.opponent.gyUnknown = (s.opponent.gyUnknown || 0) + n; }
    if (eff.millTarget && (to === "you" || target === "you")) applyEffect(s, { mill: amount(eff.millTarget) }, undefined, { ...ctx, side: "player" }, ev);
    // "Sacrifice all Reflections you control"
    if (eff.sacrificeAllType) {
      const before = s.listens.length ? battlefieldNow(s) : null;
      s[ctx.side].battlefield.filter((c) => hasType(c, eff.sacrificeAllType)).forEach((c) => leave(s, c, "graveyard", ev, { sacrificed: true, lookBack: before }));
    }
    // The Ojer gods: "When this dies, return it to the battlefield tapped and transformed under its owner's control"
    // (the card from its owner's graveyard; with counters: "with three time counters on it")
    if (eff.returnTransformed) {
      const owner = (ctx.src && ctx.src.owner) || ctx.side, z = s[owner];
      const card = z.graveyard.find((c) => c.id === ctx.selfId);
      if (card && card.faces && card.faces[1]) {
        z.graveyard = z.graveyard.filter((c) => c !== card);
        const perm = faceOf(card, { face: eff.returnTransformed.front ? 0 : 1 });   // (Galian Beast: "return it … tapped (front face up)")
        if (!eff.returnTransformed.front) perm.transformed = true;
        perm.tapped = true;
        if (eff.returnTransformed.counters) perm.counters = { ...eff.returnTransformed.counters };
        ev.push({ type: "returned", id: perm.id });
        enter(s, perm, { side: owner }, ev);
      }
    }
    // "Its controller creates two Map tokens" (the target's controller, decided before it left)
    if (eff.controllerMaps && ctx.mapsFor) for (let i = 0; i < eff.controllerMaps; i++) createToken(s, MAP, ctx.mapsFor, ev);
    // Bringer of the Last Gift: "each player sacrifices all other creatures they control. Then each player returns all
    // creature cards from their graveyard that weren't put there this way to the battlefield."
    if (eff.lastGift) {
      const before = s.listens.length ? battlefieldNow(s) : null, gone = [];
      ["player", "opponent"].forEach((side) => s[side].battlefield.filter((c) => isCreature(c) && c.id !== ctx.selfId).forEach((c) => { gone.push(c.id); leave(s, c, "graveyard", ev, { sacrificed: true, lookBack: before }); }));
      ["player", "opponent"].forEach((side) => {
        const back = s[side].graveyard.filter((c) => isCreature(faceOf(c, {})) && !gone.includes(c.id));
        s[side].graveyard = s[side].graveyard.filter((c) => !back.includes(c));
        back.forEach((c) => { c.sick = true; enter(s, asFace(c, 0), { side }, ev); });
      });
    }
    // "All creatures get -X/-X until end of turn, where X is the number of permanent cards in your graveyard"
    if (eff.allPumpDescend) { const x = permanentCardsIn(s, ctx.side); battlefieldNow(s).map(({ card }) => card).filter(isCreature).forEach((c) => addMod(s, c, [eff.allPumpDescend[0] * x, eff.allPumpDescend[1] * x])); }
    // "Target creature gets -X/-X until end of turn, where X is this creature's power" (the sacrificed one's)
    if (eff.pumpSacrificed && tgt) { const x = ctx.sacPower || 0; addMod(s, tgt, [eff.pumpSacrificed[0] * x, eff.pumpSacrificed[1] * x]); }
    // "discard any number of cards, then draw that many cards plus one"
    if (eff.discardAnyDraw && ctx.side === "player") {
      const go = [...s.player.hand].filter((c) => choose(s, `Discard ${c.name}?`, ["Keep it", "Discard it"], "player", c.id) === 1);
      go.forEach((c) => discardCard(s, c, ev));
      draw(s, "player", go.length + 1, ev);
    }
    // "each opponent discards a card. For each opponent who can't, you draw a card." (their hand: unknown cards)
    if (eff.oppDiscardOrDraw) { if ((s.opponent.handCount || 0) > 0) applyEffect(s, { discard: 1 }, "opp", ctx, ev); else draw(s, ctx.side, 1, ev); }
    // "you may discard a card. When you do, …" (then: the rest, with the ability's target)
    if (eff.mayDiscardThen && ctx.side === "player" && s.player.hand.length) {
      const k = choose(s, "Discard a card?", [...s.player.hand.map((c) => `Discard ${c.name}`), "Don't"], "player", [...s.player.hand.map((c) => c.id), null]);
      if (k < s.player.hand.length) { discardCard(s, s.player.hand[k], ev); applyEffect(s, eff.mayDiscardThen.then, target, ctx, ev); }
    }
    // "put any number of creature cards from your hand onto the battlefield"
    if (eff.putFromHand && ctx.side === "player") {
      let room = eff.putFromHand.max == null ? Infinity : eff.putFromHand.max;
      // ("with mana value less than or equal to the number of lands you control": maxMV as an amount; "onto the battlefield tapped")
      let putCount = 0;
      const pf = { ...(eff.putFromHand.filter || {}) }; if (typeof pf.maxMV === "string") pf.maxMV = amount(pf.maxMV);
      // ("with total power and toughness 5 or less")
      const ptOk = (c) => eff.putFromHand.maxPTSum == null || power(faceOf(c, {})) + toughness(faceOf(c, {})) <= eff.putFromHand.maxPTSum;
      [...s.player.hand].filter((c) => !c.unknown && objectIs(faceOf(c, {}), pf) && ptOk(c))
        .filter((c) => room > 0 && choose(s, `Put ${c.name} onto the battlefield?`, ["Put it", "Keep it in hand"], "player", c.id) === 0 && room-- > 0)
        .forEach((c) => {
          s.player.hand = s.player.hand.filter((x) => x !== c); c.sick = true; const perm = asFace(c, 0);
          if (eff.putFromHand.tapped || eff.putFromHand.attacking) perm.tapped = true;
          enter(s, perm, { side: "player" }, ev);
          const now = find(s, perm.id); if (!now) return;
          // "tapped and attacking" (never declared as an attacker, CR 508.4); "That creature gains haste"; "sacrifice that creature"
          if (eff.putFromHand.attacking && s.combat) { s.combat.attackers.push(now.id); if (s.combat.blocks) { s.combat.blocks[now.id] = []; s.combat.blocked[now.id] = false; } }
          if (eff.putFromHand.haste) grant(now, ["haste"], s);
          if (eff.putFromHand.sacrificeAtEnd) delay(s, "sacrificeIt", "player", now.name, now.id, now.id);
          putCount++;
        });
      // ("If you don't, draw a card.")
      if (eff.putFromHand.elseDraw && !putCount) draw(s, "player", 1, ev);
    }
    // "for each creature you control with power greater than that creature's base power, put a number of +1/+1 counters
    // on that creature equal to the difference"
    if (eff.baseDiffCounters) s[ctx.side].battlefield.filter(isCreature).forEach((c) => { const d = power(c) - ((c.st && c.st.base[0]) ?? basePT(c)[0]); if (d > 0) addCounters(s, c, "+1/+1", d, ev); });
    // Vito, Fanatic of Aclazotz: the first, second and third time this ability resolves this turn
    if (eff.vito) {
      const k = (s.vito || {})[ctx.selfId] || 0;
      s.vito = { ...(s.vito || {}), [ctx.selfId]: k + 1 };
      applyEffect(s, eff.vito[k], undefined, ctx, ev);
    }
    // Amalia: "Then destroy all other creatures if its power is exactly 20."
    if (eff.ifPower20) {
      const me = find(s, ctx.selfId);
      if (me && power(me) === 20) { const before = s.listens.length ? battlefieldNow(s) : null; battlefieldNow(s).map(({ card }) => card).filter((c) => isCreature(c) && c !== me && !survivesDestroy(s, c, ev)).forEach((c) => leave(s, c, "graveyard", ev, { lookBack: before })); }
    }
    // Kellan, Daring Traveler: "reveal the top card of your library. If it's a creature card with mana value 3 or less, put
    // it into your hand. Otherwise, you may put it into your graveyard."
    if (eff.revealTopCreature3) {
      const z = s[ctx.side], top = z.library[0];
      if (top && isCreature(faceOf(top, {})) && manaValue(faceOf(top, {}).cost) <= 3) { z.library.shift(); z.hand.push(top); }
      else if (top && choose(s, `Put ${top.name} into your graveyard?`, ["Leave it on top", "Into the graveyard"], ctx.side, top.id) === 1) { z.library.shift(); putCard(s, top, ctx.side, "graveyard"); }
    }
    // "Exile target player's graveyard"
    if (eff.exilePlayerGraveyard && (to === "opp" || to === "you")) { const z = s[to === "opp" ? "opponent" : "player"]; z.exile.push(...z.graveyard); z.graveyard = []; }
    // Dire Blunderbuss: "this creature deals damage equal to its power to target creature" (the creature it's attached to)
    if (eff.damageFromEquipped && tgt) { const host = ctx.src && find(s, ctx.src.attachedTo); if (host) dealDamage(s, host, sideOf(s, host), tgt.id, Math.max(power(host), 0), ev); }
    // ---- Tarkir: Dragonstorm ----
    // Taigam: "copy it, then exile the spell you cast with four time counters on it" (it never resolves)
    if (eff.taigam) {
      const item = s.stack.find((x) => x.kind === "spell" && x.id === (ctx.event && ctx.event.id) && !x.copy);
      if (item) {
        copySpell(s, item, { side: ctx.side }, ev);
        s.stack = s.stack.filter((x) => x !== item);
        const card = item.card;
        if (card) { s[ctx.side].exile.push({ ...card, counters: { time: 4 } }); ev.push({ type: "suspended", id: card.id }); }
      }
    }
    // Cori-Steel Cutter: "create a 1/1 white Monk creature token with prowess. You may attach this Equipment to it."
    if (eff.monkAttach) {
      const t = createToken(s, { name: "Monk", type: "Token Creature — Monk", pt: "1/1", colors: ["W"], kw: ["prowess"] }, ctx.side, ev), me = find(s, ctx.selfId);
      if (t && me && find(s, t.id) && choose(s, `Attach ${me.name} to the Monk?`, ["Attach it", "Don't"], ctx.side, t.id) === 0) { me.attachedTo = t.id; me.ts = stamp(s); changed(s); }
    }
    // "you may behold a Dragon. If you do, …" (a Dragon you control or a Dragon card in your hand)
    if (eff.mayBehold) {
      const z = s[ctx.side], has0 = [...z.battlefield, ...z.hand].some((c) => c.id !== ctx.selfId && hasType(c, eff.mayBehold.type));
      if (has0 && choose(s, `Behold a ${eff.mayBehold.type}?`, ["Behold", "Don't"], ctx.side) === 0) applyEffect(s, eff.mayBehold.then, undefined, ctx, ev);
    }
    // the Sieges: "As this enchantment enters, choose …" (kept on the permanent; its abilities check it)
    // Betor: total toughness thresholds
    if (eff.betor) {
      const tt = () => s[ctx.side].battlefield.filter(isCreature).reduce((t, c) => t + Math.max(toughness(c), 0), 0);
      if (tt() >= 10) { draw(s, ctx.side, 1, ev);
        if (tt() >= 20) { s[ctx.side].battlefield.filter(isCreature).forEach((c) => untap(s, c, ev));
          if (tt() >= 40) { const o = s[ctx.side === "player" ? "opponent" : "player"]; if (o.life != null) changeLife(s, ctx.side === "player" ? "opp" : "you", -Math.ceil(Math.max(o.life, 0) / 2), ev); } } }
    }
    // Songcrafter Mage: "target instant or sorcery card in your graveyard gains harmonize until end of turn. Its harmonize
    // cost is equal to its mana cost."
    if (eff.grantHarmonize) { const card = s[ctx.side].graveyard.find((c) => c.id === target); if (card) card.harmonize = faceOf(card, {}).cost || "{0}"; }
    // Narset: "you may discard your hand. If you do, draw cards equal to the number of spells you've cast this turn."
    if (eff.narset && ctx.side === "player" && choose(s, "Discard your hand and draw?", ["Do it", "Don't"], "player") === 0) { [...s.player.hand].forEach((c) => discardCard(s, c, ev)); draw(s, "player", s.spellsCast || 0, ev); }
    // Mistrise Village: "The next spell you cast this turn can't be countered."
    if (eff.nextUncounterable && ctx.side === "player") s.nextUncounterable = true;
    // Death Begets Life: "Draw a card for each permanent destroyed this way."
    if (eff.drawDestroyed) draw(s, ctx.side, (ctx.destroyed || []).length, ev);
    // Exude Toxin: "Each non-Dragon creature gets -X/-X until end of turn." (X already filled in)
    if (eff.allNonTypePump) battlefieldNow(s).map(({ card }) => card).filter((c) => isCreature(c) && !hasType(c, eff.allNonTypePump.notType)).forEach((c) => addMod(s, c, eff.allNonTypePump.pump));
    // Winternight Stories: "Then discard two cards unless you discard a creature card."
    if (eff.discardTwoUnlessCreature && ctx.side === "player") {
      const hand = s.player.hand, opts = [...hand.filter((c) => isCreature(faceOf(c, {}))).map((c) => `Discard ${c.name} (creature)`), "Discard two cards"];
      const creatures = hand.filter((c) => isCreature(faceOf(c, {})));
      const k = creatures.length ? choose(s, "Discard a creature card, or two cards?", opts, "player", [...creatures.map((c) => c.id), null]) : creatures.length;
      if (k < creatures.length) discardCard(s, creatures[k], ev);
      else applyEffect(s, { discardN: 2 }, undefined, ctx, ev);
    }
    // Lasyd Prowler: "you may mill cards equal to the number of lands you control"
    if (eff.mayMillLands) { const n = s[ctx.side].battlefield.filter(isLand).length; if (n) applyEffect(s, { mill: n, mayMill: true }, undefined, ctx, ev); }
    // ---- Final Fantasy ----
    // the Dominants and Summons: "Exile [this], then return it to the battlefield transformed under its owner's control" /
    // "… then return it to the battlefield (front face up)" — a new object (CR 400.7): summoning sick, a Saga gets its
    // first lore counter, enters abilities trigger
    if (eff.blinkTransformed) {
      const me = find(s, ctx.selfId);
      if (me && me.faces && me.faces[1] && !me.token) {
        const owner = me.owner || sideOf(s, me);
        leave(s, me, "exile", ev);
        const z = s[owner], card = z.exile.find((c) => c.id === me.id);
        if (card) {
          z.exile = z.exile.filter((c) => c !== card);
          const perm = asFace(card, eff.blinkTransformed.face);
          if (eff.blinkTransformed.face === 1) perm.transformed = true;
          if (!isLand(perm)) perm.sick = true;
          ev.push({ type: "returned", id: perm.id });
          enter(s, perm, { side: owner }, ev);
        }
      }
    }
    // "If this spell was cast from a graveyard, …" (flashback)
    if (eff.ifCastFromGraveyard) applyEffect(s, ctx.fromGraveyard ? eff.ifCastFromGraveyard.then : eff.ifCastFromGraveyard.else, target, ctx, ev);
    // a flag on the permanent for an ability it gains ("This creature gains 'Whenever this creature deals combat damage to
    // a player, that player loses the game.'": the card's trigger checks it with if: { selfFlag })
    if (eff.setFlag && tgt) tgt[eff.setFlag] = true;
    // "that player loses the game" (CR 104.3a)
    if (eff.oppLosesGame) s[ctx.side === "player" ? "opponent" : "player"].lostGame = true;
    // Lightning, Army of One: "until your next turn, if a source would deal damage to that player or a permanent that player controls, it deals double that damage instead"
    if (eff.stagger && ctx.side === "player") s.stagger = true;
    // Sephiroth, Fabled SOLDIER: "target opponent loses 1 life and you gain 1 life. If this is the fourth time this ability has
    // resolved this turn, transform Sephiroth." (Super Nova: as it transforms, you get the emblem)
    if (eff.sephiroth) {
      changeLife(s, ctx.side === "player" ? "opp" : "you", -1, ev); changeLife(s, ctx.side === "player" ? "you" : "opp", 1, ev);
      const me = find(s, ctx.selfId);
      if (me && !me.transformed) {
        me.sephResolved = (me.sephResolved || 0) + 1;
        if (me.sephResolved === 4) {
          transform(s, me, ev);
          applyEffect(s, { emblem: { name: "Super Nova", text: "Whenever a creature dies, target opponent loses 1 life and you gain 1 life.",
            triggers: [{ on: "dies", filter: { creature: true }, effect: { lifeLoss: 1, to: "opp", gainLife: 1 } }] } }, undefined, ctx, ev);
        }
      }
    }
    // Sephiroth, One-Winged Angel: "you may sacrifice any number of other creatures. If you do, draw that many cards."
    if (eff.sacAnyDraw && ctx.side === "player") {
      let n = 0;
      for (;;) {
        const opts = s.player.battlefield.filter((c) => isCreature(c) && c.id !== ctx.selfId);
        if (!opts.length) break;
        const k = choose(s, "Sacrifice another creature?", [...opts.map((c) => c.name), "Stop"], "player", [...opts.map((c) => c.id), null]);
        if (k >= opts.length) break;
        leave(s, opts[k], "graveyard", ev, { sacrificed: true }); n++;
      }
      if (n) draw(s, "player", n, ev);
    }
    // Beatrix: "you may attach any number of Equipment you control to target creature you control"
    if (eff.attachEquipment && tgt) s[ctx.side].battlefield.filter((c) => c.equip && c.attachedTo !== tgt.id).forEach((e) => {
      if (choose(s, `Attach ${e.name} to ${tgt.name}?`, ["Attach it", "Don't"], ctx.side, e.id) === 0) { e.attachedTo = tgt.id; e.ts = stamp(s); changed(s); }
    });
    // Zell Dincht: "return a land you control to its owner's hand"
    if (eff.returnOwnLand) { const lands = s[ctx.side].battlefield.filter(isLand); if (lands.length) leave(s, lands[choose(s, "Return which land?", lands.map((c) => c.name), ctx.side, lands.map((c) => c.id))], "hand", ev); }
    // Ifrit: "If Ifrit has three or more lore counters on it, …" (checked as the chapter ability resolves)
    if (eff.ifSelfCounters) { const me = find(s, ctx.selfId); if (me && ((me.counters || {})[eff.ifSelfCounters.kind] || 0) >= eff.ifSelfCounters.min) applyEffect(s, eff.ifSelfCounters.then, target, ctx, ev); }
    // Clive: "you may discard your hand, then draw cards equal to your devotion to red"
    if (eff.mayDiscardHandDraw && ctx.side === "player" && choose(s, "Discard your hand and draw?", ["Do it", "Don't"], "player") === 0) {
      [...s.player.hand].forEach((c) => discardCard(s, c, ev)); draw(s, "player", amount(eff.mayDiscardHandDraw), ev);
    }
    // Summon: Titan: "Return all land cards from your graveyard to the battlefield tapped."
    if (eff.landsFromGraveyardAll) {
      const z = s[ctx.side];
      z.graveyard.filter((c) => isLand(faceOf(c, {}))).forEach((c) => { z.graveyard = z.graveyard.filter((x) => x !== c); const perm = asFace(c, 0); perm.tapped = true; enter(s, perm, { side: ctx.side }, ev); });
    }
    // "Tap all creatures your opponents control" / "Tap all lands your opponents control"
    if (eff.tapAllOpp) s[ctx.side === "player" ? "opponent" : "player"].battlefield.filter((c) => (eff.tapAllOpp.creatures && isCreature(c)) || (eff.tapAllOpp.lands && isLand(c))).forEach((c) => { if (!c.tapped) { c.tapped = true; changed(s); } });
    // "Creatures your opponents control get -2/-2 until end of turn."
    if (eff.oppTeamPump) s[ctx.side === "player" ? "opponent" : "player"].battlefield.filter(isCreature).forEach((c) => addMod(s, c, eff.oppTeamPump));
    // Hydaelyn: "If that creature is legendary, draw a card."
    if (eff.ifTargetLegendaryDraw && tgt && /\blegendary\b/i.test(tgt.type || "")) draw(s, ctx.side, 1, ev);
    // ---- Edge of Eternities ----
    // Alpharael: "defending player loses half their life, rounded up"
    if (eff.oppLosesHalf) { const o = s[ctx.side === "player" ? "opponent" : "player"]; if (o.life != null) changeLife(s, ctx.side === "player" ? "opp" : "you", -Math.ceil(Math.max(o.life, 0) / 2), ev); }
    // Origin of Spider-Man: "It becomes a legendary Spider Hero in addition to its other types."
    if (eff.makeLegendary && tgt && !/\blegendary\b/i.test(tgt.type || "")) { tgt.type = "Legendary " + tgt.type; changed(s); }
    // Mister Negative: "you may exchange life totals with target opponent. If you lost life this way, draw that many cards." (CR 118.7)
    if (eff.exchangeLife && ctx.side === "player" && s.player.life != null && s.opponent.life != null && choose(s, "Exchange life totals?", ["Exchange", "Don't"], "player") === 0) {
      const mine = s.player.life, theirs = s.opponent.life;
      s.player.life = theirs; s.opponent.life = mine;
      ev.push({ type: "life", who: "you", amount: theirs - mine }, { type: "life", who: "opp", amount: mine - theirs });
      if (theirs > mine) { s.oppLostLife = true; s.gainedLife = true; s.lifeGainedTotal = (s.lifeGainedTotal || 0) + theirs - mine; emit(s, { type: "gainLife", side: "player", count: theirs - mine }, ev); }
      if (mine > theirs) { s.youLostLife = true; draw(s, "player", mine - theirs, ev); }
    }
    // ---- Avatar: The Last Airbender ----
    // an earthbent land that died or was exiled: "return it to the battlefield tapped" (from wherever it went)
    if (eff.earthReturn) {
      const id = ctx.event && ctx.event.id;
      for (const side of ["player", "opponent"]) for (const zone of ["graveyard", "exile"]) {
        const card = s[side][zone].find((c) => c.id === id);
        if (!card) continue;
        s[side][zone] = s[side][zone].filter((c) => c !== card);
        const perm = asFace(card, 0); perm.tapped = !eff.untapped; perm.sick = true;
        ev.push({ type: "returned", id: perm.id });
        enter(s, perm, { side }, ev);
      }
    }
    // "If this is the second time this ability has resolved this turn, …" (counted on the permanent: a new object starts over)
    if (eff.onNthResolution) { const me = find(s, ctx.selfId); if (me) { const k = eff.onNthResolution.key; me.resolvedN = { ...(me.resolvedN || {}), [k]: ((me.resolvedN || {})[k] || 0) + 1 }; if (me.resolvedN[k] === eff.onNthResolution.n) applyEffect(s, eff.onNthResolution.then, target, ctx, ev); } }
    // Avatar's Wrath: "Choose up to one target creature, then airbend all other creatures."
    if (eff.airbendOthers) {
      const before = s.listens.length ? battlefieldNow(s) : null;
      battlefieldNow(s).map(({ card }) => card).filter((c) => isCreature(c) && c.id !== target).forEach((c) => {
        const owner = c.owner || sideOf(s, c); leave(s, c, "exile", ev, { lookBack: before });
        const card = s[owner].exile.find((x) => x.id === c.id); if (card) card.airbent = true;
      });
    }
    // Day of Black Sun: "Each creature with mana value X or less loses all abilities until end of turn. Destroy those creatures."
    if (eff.blackSun) {
      const hit = battlefieldNow(s).map(({ card }) => card).filter((c) => isCreature(c) && manaValue(c.cost) <= amount(eff.blackSun));
      hit.forEach((c) => addEffect(s, c, { loseAll: true }));
      refresh(s);
      hit.filter((c) => find(s, c.id) && !survivesDestroy(s, c, ev)).forEach((c) => leave(s, c, "graveyard", ev));
    }
    // Sokka: "discard up to two cards, then draw that many cards"
    if (eff.discardUpToDraw && ctx.side === "player") {
      let n = 0;
      while (n < eff.discardUpToDraw && s.player.hand.length) {
        const k = choose(s, `Discard a card? (${n} so far)`, [...s.player.hand.map((c) => c.name), "Stop"], "player", [...s.player.hand.map((c) => c.id), null]);
        if (k >= s.player.hand.length) break;
        discardCard(s, s.player.hand[k], ev); n++;
      }
      if (n) draw(s, "player", n, ev);
    }
    // CR 701.50a: connive — "Draw a card, then discard a card. If you discarded a nonland card, put a +1/+1 counter on
    // this creature." (it connives even if it has left the battlefield; then no counter, 701.50c). Leader, Super-Genius:
    // "If a creature you control would connive, instead you draw a card, then that creature connives." (replacement)
    if (eff.connive && ctx.side === "player") {
      const who = tgt || find(s, ctx.selfId);
      const extra = s.player.battlefield.filter((c) => c.leaderConnive && !(c.st && c.st.lost)).length;
      if (extra) draw(s, "player", extra, ev);
      draw(s, "player", 1, ev);
      if (s.player.hand.length) {
        const card = s.player.hand[choose(s, "Discard which card?", s.player.hand.map((c) => c.name), "player", s.player.hand.map((c) => c.id))];
        discardCard(s, card, ev);
        if (!isLand(faceOf(card, {})) && who && find(s, who.id)) addCounters(s, find(s, who.id), "+1/+1", 1, ev);
      }
      if (who) emit(s, { type: "connives", obj: who, side: "player" }, ev);
    }
    // CR 701.47a: amass [subtype] N — "put N +1/+1 counters on an Army you control. It's also a [subtype]. If you don't
    // control an Army, create a 0/0 black [subtype] Army creature token first." (forOpp: "its controller amasses")
    if (eff.amass) {
      const side = eff.amass.side || ctx.side, n = amount(eff.amass.n);
      let army = s[side].battlefield.find((c) => hasType(c, "Army"));
      if (!army) army = createToken(s, { name: `${eff.amass.type} Army`, type: `Token Creature — ${eff.amass.type} Army`, pt: "0/0", colors: ["B"] }, side, ev);
      if (army && find(s, army.id)) {
        if (!subtypes(army).includes(eff.amass.type)) { army.type = `${army.type} ${eff.amass.type}`; changed(s); }
        addCounters(s, army, "+1/+1", n, ev);
      }
    }
    // Azog: "destroy up to one other target creature. Its controller amasses Goblins X, where X is that creature's power. If you controlled that creature, draw a card."
    if (eff.azog && tgt) {
      const side = sideOf(s, tgt), x = Math.max(0, power(tgt));
      if (!survivesDestroy(s, tgt, ev)) leave(s, tgt, "graveyard", ev);
      applyEffect(s, { amass: { type: "Goblin", n: x, side } }, undefined, ctx, ev);
      if (side === ctx.side) draw(s, ctx.side, 1, ev);
    }
    // "After this phase, there is an additional combat phase." (onlyLands: "Only land creatures can attack during that combat phase.")
    if (eff.extraCombat) { s.extraCombats = (s.extraCombats || 0) + 1; if (eff.extraCombat.onlyLands) s.nextCombatOnlyLands = true; }
    // Bumi: "untap all lands you control"; Desert Were-Worm: "untap all attacking creatures"
    if (eff.untapLands) s[ctx.side].battlefield.filter(isLand).forEach((c) => untap(s, c, ev));
    if (eff.untapAttackers && s.combat) s.combat.attackers.map((id) => find(s, id)).filter(Boolean).forEach((c) => untap(s, c, ev));
    // "He … becomes colorless until end of turn" (layer 5)
    if (eff.setColorless && tgt) addEffect(s, tgt, { setColor: [] });
    // The Incredible Hulk: "If he's attacking, …"
    if (eff.ifSelfAttacking && s.combat && s.combat.attackers.includes(ctx.selfId)) applyEffect(s, eff.ifSelfAttacking, target, ctx, ev);
    // Ultimate Spider-Man: "double the number of each kind of counter on each Spider and legendary creature you control"
    if (eff.doubleCountersTeam) s[ctx.side].battlefield.filter((c) => isCreature(c) && (hasType(c, "Spider") || /\blegendary\b/i.test(c.type || ""))).forEach((c) =>
      Object.entries({ ...(c.counters || {}) }).filter(([, n]) => n > 0).forEach(([k, n]) => addCounters(s, c, k, n, ev)));
    // The Invincible Iron Man: "you may put an artifact card from your hand onto the battlefield. If it's an Equipment, attach it to The Invincible Iron Man."
    if (eff.putArtifactAttach && ctx.side === "player") {
      const opts = s.player.hand.filter((c) => isArtifact(faceOf(c, {})));
      const k = opts.length ? choose(s, "Put an artifact onto the battlefield?", [...opts.map((c) => c.name), "Don't"], "player", [...opts.map((c) => c.id), null]) : 0;
      if (k < opts.length) {
        const c = opts[k]; s.player.hand = s.player.hand.filter((x) => x !== c);
        const perm = asFace(c, 0); perm.sick = true; enter(s, perm, { side: "player" }, ev);
        const now = find(s, perm.id), me = find(s, ctx.selfId);
        if (now && now.equip && me && isCreature(me)) { now.attachedTo = me.id; now.ts = stamp(s); changed(s); }
      }
    }
    // Wildgrowth Archaic: the creature spell that triggered it gets the counters as it enters
    if (eff.bonusEnterCounters) { const it = s.stack.find((w) => w.kind === "spell" && w.id === (ctx.event && ctx.event.id)); if (it) it.card.bonusCounters = (it.card.bonusCounters || 0) + amount(eff.bonusEnterCounters); }
    // restricted mana: "Add four mana in any combination of colors. Spend this mana only to cast Dragon spells." (oneColor:
    // "two mana of any one color" — the color is chosen as it's added; any combination: kept open, chosen as it's spent)
    if (eff.addRestricted && ctx.side === "player") {
      const r = eff.addRestricted, n = amount(r.n);
      const colors = r.oneColor ? "WUBRG"[choose(s, "Which color?", ["White", "Blue", "Black", "Red", "Green"], "player")] : r.colors;
      s.rpool = [...(s.rpool || []), ...Array.from({ length: n }, () => ({ colors, only: r.only }))];
      ev.push({ type: "mana", restricted: true, n });
    }
    // Molten Tide: "Until end of turn, whenever you tap a Mountain for mana, add an additional {R}."
    if (eff.moltenTide && ctx.side === "player") s.moltenTide = true;
    // ---- Reality Fracture ----
    // Enlightened Confidant / Chandra: "If you put a card … into your graveyard this way, put that card into your hand." (the surveil just done)
    if (eff.fromSurveilled && ctx.side === "player") {
      const lim = eff.fromSurveilled.maxMV != null ? amount(eff.fromSurveilled.maxMV) : null;
      s.player.graveyard.filter((c) => (s.lastSurveilled || []).includes(c.id) && objectIs(faceOf(c, {}), eff.fromSurveilled.filter || {}) && (lim == null || manaValue(faceOf(c, {}).cost) <= lim))
        .slice(0, 1).forEach((c) => { s.player.graveyard = s.player.graveyard.filter((x) => x !== c); s.player.hand.push(c); emit(s, { type: "leavesGraveyard", side: "player", count: 1 }, ev); });
    }
    // "gets +X/+0 until end of turn, where X is …"
    if (eff.pumpPowerBy && tgt) addMod(s, tgt, [amount(eff.pumpPowerBy), 0]);
    // Sphinx of False Conclusions: "When this creature dies, if it isn't a token, create a token that's a copy of it." (its last known values)
    if (eff.copyDeadSelf && ctx.src && !ctx.src.token) createToken(s, copyValues(ctx.src, {}), ctx.side, ev);
    // Kindred Judgment: "Choose a creature type. Destroy all creatures that aren't of the chosen type."
    if (eff.destroyAllButType) { const t = chooseCreatureType(s, ctx.side); const before = s.listens.length ? battlefieldNow(s) : null; battlefieldNow(s).map(({ card }) => card).filter((c) => isCreature(c) && !(t && hasType(c, t)) && !survivesDestroy(s, c, ev)).forEach((c) => leave(s, c, "graveyard", ev, { lookBack: before })); }
    // Hexhaven Invigorator: "search your library for up to that many land cards, put them onto the battlefield tapped"
    if (eff.searchLandsN) for (let i = 0; i < amount(eff.searchLandsN); i++) applyEffect(s, { search: { filter: { land: true }, toBattlefield: true, tapped: true } }, undefined, ctx, ev);
    // Vindictive Triumph: "Exile target creature or planeswalker. If that permanent's mana value was 3 or less, return it to the battlefield tapped under your control. Exile it at the beginning of the next end step."
    if (eff.vindictive && tgt) {
      const mv = manaValue(tgt.cost), owner = tgt.owner || sideOf(s, tgt), token = tgt.token;
      leave(s, tgt, "exile", ev);
      const ex = !token && mv <= 3 && s[owner].exile.find((x) => x.id === tgt.id);
      if (ex) { s[owner].exile = s[owner].exile.filter((x) => x !== ex); const perm = asFace(ex, 0); perm.tapped = true; perm.sick = true; perm.owner = owner; enter(s, perm, { side: ctx.side }, ev); delay(s, "exileIt", ctx.side, perm.name, perm.id, perm.id); }
    }
    // Ajani Unrelenting −3: "deals 4 damage to each creature except for tokens you control"
    if (eff.damageAllButYourTokens) battlefieldNow(s).filter(({ card, side }) => isCreature(card) && !(card.token && side === ctx.side)).forEach(({ card }) => dealDamage(s, find(s, ctx.selfId) || ctx.src, ctx.side, card.id, eff.damageAllButYourTokens, ev));
    // ---- The Hobbit ----
    // recruit: "Draw a card, then discard a card. If you discarded a nonland card, create a 1/1 white Human Soldier creature token."
    if (eff.recruit && ctx.side === "player") {
      draw(s, "player", 1, ev);
      if (s.player.hand.length) {
        const card = s.player.hand[choose(s, "Discard which card?", s.player.hand.map((c) => c.name), "player", s.player.hand.map((c) => c.id))];
        discardCard(s, card, ev);
        if (!isLand(faceOf(card, {}))) createToken(s, { name: "Human Soldier", type: "Token Creature — Human Soldier", pt: "1/1", colors: ["W"] }, "player", ev);
      }
    }
    // Belladonna Took: "… if this is the first time this ability has resolved this turn. If it's the second time, … If it's the third time, …"
    if (eff.byResolution) { const me = find(s, ctx.selfId); if (me) { const k = eff.byResolution.key; me.resolvedN = { ...(me.resolvedN || {}), [k]: ((me.resolvedN || {})[k] || 0) + 1 }; applyEffect(s, eff.byResolution.effects[me.resolvedN[k] - 1], target, ctx, ev); } }
    // Balin: "you may discard your hand. Draw X cards, where X is the number of cards discarded this way. If you have an enduring story, Balin deals X damage to each opponent."
    if (eff.balin && ctx.side === "player" && choose(s, "Discard your hand?", ["Discard and draw", "Don't"], "player") === 0) {
      const x = s.player.hand.length; [...s.player.hand].forEach((c) => discardCard(s, c, ev)); draw(s, "player", x, ev);
      if (conditionHolds(s, { enduring: true }, "player", find(s, ctx.selfId) || ctx.src)) dealDamage(s, find(s, ctx.selfId) || ctx.src, "player", "opp", x, ev);
    }
    // Dáin Ironfoot: "create … Axe … When you do, attach it to target creature you control."
    if (eff.createAttach && tgt) { const before = new Set(s[ctx.side].battlefield.map((c) => c.id)); createToken(s, eff.createAttach, ctx.side, ev); const made = s[ctx.side].battlefield.find((c) => !before.has(c.id)); if (made && find(s, tgt.id)) { made.attachedTo = tgt.id; made.ts = stamp(s); changed(s); } }
    // The Misty Mountains Cold: "sacrifice this Saga. If you do, …"
    if (eff.sacSelfThen) { const me = find(s, ctx.selfId); if (me) { leave(s, me, "graveyard", ev, { sacrificed: true }); applyEffect(s, eff.sacSelfThen, target, ctx, ev); } }
    // Dwalin: "put a hone counter on each Equipment you control"
    if (eff.equipmentCounters) s[ctx.side].battlefield.filter((c) => c.equip).forEach((c) => Object.entries(eff.equipmentCounters).forEach(([k, n]) => addCounters(s, c, k, n, ev)));
    // Sting: "Attach Sting to up to one target creature you control."
    if (eff.attachSelfToTarget && tgt) { const me = find(s, ctx.selfId); if (me && me.equip && isCreature(tgt) && sideOf(s, tgt) === sideOf(s, me)) { me.attachedTo = tgt.id; me.ts = stamp(s); changed(s); ev.push({ type: "attach", id: me.id, to: tgt.id }); } }
    // Orcrist: "choose a creature type. Create a Treasure token for each creature you control of that type."
    if (eff.treasurePerChosenType && ctx.side === "player") { const t = chooseCreatureType(s, "player"); const n = t ? s.player.battlefield.filter((c) => isCreature(c) && hasType(c, t)).length : 0; for (let i = 0; i < n; i++) createToken(s, { name: "Treasure", type: "Token Artifact — Treasure", colors: [] }, "player", ev); }
    // ---- Phyrexia: All Will Be One (second pass) ----
    // "becomes a copy of another target creature" (becomeCopy: { attached: "for as long as this Equipment remains attached",
    // onto: "eventHost" — the creature it just became attached to; except: values the copy keeps of its own)
    if (eff.becomeCopy && tgt) {
      const perm = eff.becomeCopy.onto === "eventHost" ? find(s, ctx.event && ctx.event.host) : eff.becomeCopy.self ? find(s, ctx.selfId) : null;
      // (mvX: "with mana value X", checked against the X paid)
      if (perm && perm.id !== tgt.id && !(eff.becomeCopy.mvX && manaValue(tgt.cost) !== (ctx.x || 0))) becomeCopyOf(s, perm, tgt, eff.becomeCopy.except || {}, eff.becomeCopy.attached ? { attachedBy: ctx.selfId } : undefined);
    }
    // Skrelv: "Choose a color. … gains toxic 1 and hexproof from that color … can't be blocked by creatures of that color"
    if (eff.skrelv && tgt) {
      const words = ["white", "blue", "black", "red", "green"], w = words[choose(s, "Choose a color", words.map((x) => x[0].toUpperCase() + x.slice(1)), ctx.side, tgt.id)];
      grant(tgt, ["toxic 1", `hexproof from ${w}`, `can't be blocked by ${w} creatures`], s);
    }
    // Jace, the Perfected Mind −2: "Then if a graveyard has twenty or more cards in it, you draw three cards. Otherwise, you draw a card."
    if (eff.jaceDraw) draw(s, ctx.side, Math.max(s.player.graveyard.length, s.opponent.graveyard.length + (s.opponent.gyUnknown || 0)) >= 20 ? 3 : 1, ev);
    // Unctus: "becomes a blue artifact in addition to its other colors and types"
    if (eff.blueArtifact && tgt) { if (!isArtifact(tgt)) tgt.type = addTypes(tgt.type, { types: ["Artifact"] }); if (!colorsOf(tgt).includes("U")) tgt.colors = [...colorsOf(tgt), "U"]; changed(s); }
    // Vraska −2: "becomes a Treasure artifact with '{T}, Sacrifice this artifact: Add one mana of any color' and loses all other card types and abilities"
    if (eff.becomeTreasure && tgt) { tgt.type = "Artifact — Treasure"; delete tgt.pt; addEffect(s, tgt, { loseAll: true }); changed(s); }
    // Vraska −9: "If target player has fewer than nine poison counters, they get a number of poison counters equal to the difference."
    if (eff.poisonToNine && (target === "opp" || target === "you")) { const z = s[target === "opp" ? "opponent" : "player"]; if ((z.poison || 0) < 9) { const n = 9 - (z.poison || 0); z.poison = 9; ev.push({ type: "poison", who: target, amount: n }); emit(s, { type: "countersPut", side: target === "opp" ? "opponent" : "player", kind: "poison", count: n, player: target }, ev); } }
    // Red Sun's Twilight: destroy; "If X is 5 or more, for each artifact destroyed this way, create a token that's a copy of it. Those tokens gain haste. Exile them at the beginning of the next end step."
    if (eff.redSun && tgt) { const v = copyValues(tgt, {}); if (!survivesDestroy(s, tgt, ev)) { leave(s, tgt, "graveyard", ev); if ((ctx.x || 0) >= 5) createTokens(s, { ...v, hasteNow: true, exileAtEnd: true }, ctx.side, ev).forEach((t) => grant(t, ["haste"], s)); } }
    // Conduit of Worlds: "Choose target nonland permanent card in your graveyard. If you haven't cast a spell this turn, you may cast that card. If you do, you can't cast additional spells this turn."
    if (eff.conduit && !(s.spellsCast > 0)) { const card = s[ctx.side].graveyard.find((c) => c.id === target); if (card) card.conduitCast = true; }
    // Green Sun's Twilight: "Reveal the top X plus one cards … Choose a creature card and/or a land card … into your hand … If X is 5 or more, … onto the battlefield or into your hand"
    if (eff.greenSun && ctx.side === "player") {
      const z = s.player, n = (ctx.x || 0) + 1, seen = z.library.slice(0, n);
      ["creature", "land"].forEach((kind) => {
        const opts = seen.filter((c) => z.library.includes(c) && (kind === "creature" ? isCreature(faceOf(c, {})) : isLand(faceOf(c, {}))));
        const k = opts.length ? choose(s, `Choose a ${kind} card?`, [...opts.map((c) => c.name), "None"], "player", [...opts.map((c) => c.id), null]) : 0;
        if (k >= opts.length) return;
        const c = opts[k]; z.library = z.library.filter((x) => x !== c);
        if ((ctx.x || 0) >= 5 && choose(s, `${c.name}: onto the battlefield or into your hand?`, ["Battlefield", "Hand"], "player", c.id) === 0) { const perm = asFace(c, 0); perm.sick = true; enter(s, perm, { side: "player" }, ev); }
        else z.hand.push(c);
      });
      const rest = seen.filter((c) => z.library.includes(c));   // (the rest: to the bottom)
      z.library = z.library.filter((c) => !rest.includes(c)); z.libraryBottom = [...(z.libraryBottom || []), ...rest];
    }
    // Atraxa: "For each card type, you may put a card of that type from among the revealed cards into your hand."
    if (eff.onePerType && ctx.side === "player") {
      const z = s.player, seen = z.library.slice(0, eff.onePerType), taken = [];
      CARD_TYPES.forEach((t) => {
        const opts = seen.filter((c) => !taken.includes(c) && new RegExp(`\\b${t}\\b`, "i").test((faceOf(c, {}).type || "").split("—")[0]));
        if (!opts.length) return;
        const k = choose(s, `A ${t} card?`, [...opts.map((c) => c.name), "None"], "player", [...opts.map((c) => c.id), null]);
        if (k < opts.length) taken.push(opts[k]);
      });
      z.library = z.library.filter((c) => !seen.includes(c)); z.hand.push(...taken); z.libraryBottom = [...(z.libraryBottom || []), ...seen.filter((c) => !taken.includes(c))];
    }
    // Kaito, Dancing Shadow: "you may return one of them to its owner's hand. If you do, you may activate loyalty abilities of Kaito twice this turn"
    if (eff.kaitoReturn && ctx.side === "player") {
      const opts = (s.combatDamagers || []).map((id) => find(s, id)).filter((c) => c && sideOf(s, c) === "player");
      const k = opts.length ? choose(s, "Return one of them to your hand?", [...opts.map((c) => c.name), "Don't"], "player", [...opts.map((c) => c.id), null]) : 0;
      if (k < opts.length) { leave(s, opts[k], "hand", ev); const me = find(s, ctx.selfId); if (me) me.loyaltyTwice = true; }
    }
    // Kethek: "reveal cards from the top of your library until you reveal a nonlegendary creature card with lesser mana value, put it onto the battlefield, then put the rest on the bottom"
    if (eff.revealUntilLesser && ctx.side === "player") {
      const z = s.player, lim = amount(eff.revealUntilLesser), revealed = [];
      while (z.library.length) {
        const c = z.library.shift(); const f = faceOf(c, {});
        if (isCreature(f) && !/\blegendary\b/i.test(f.type || "") && manaValue(f.cost) < lim) { const perm = asFace(c, 0); perm.sick = true; enter(s, perm, { side: "player" }, ev); break; }
        revealed.push(c);
      }
      z.libraryBottom = [...(z.libraryBottom || []), ...revealed];
    }
    // Melira: "Choose another target creature or artifact. When it's put into a graveyard this turn, return that card to the battlefield under its owner's control."
    if (eff.meliraMark && tgt) tgt.returnIfDies = true;
    // Ria Ivor: "the next time target creature would deal combat damage to one or more players this combat, prevent that damage. If damage is prevented this way, create that many 1/1 … Mite tokens"
    if (eff.riaMark && tgt) tgt.miteOnDamage = true;
    // The Filigree Sylex: "Destroy each nonland permanent with mana value equal to the number of oil counters on The Filigree Sylex."
    if (eff.sylex) { const n = ((ctx.src && ctx.src.counters) || {}).oil || 0; const before = s.listens.length ? battlefieldNow(s) : null; battlefieldNow(s).map(({ card }) => card).filter((c) => !isLand(c) && manaValue(c.cost) === n && !survivesDestroy(s, c, ev)).forEach((c) => leave(s, c, "graveyard", ev, { lookBack: before })); }
    // Monument to Perfection: "becomes a 9/9 Phyrexian Construct artifact creature, loses all abilities, and gains indestructible and toxic 9"
    if (eff.monument) { const me = find(s, ctx.selfId); if (me) { me.type = "Artifact Creature — Phyrexian Construct"; me.pt = "9/9"; addEffect(s, me, { loseAll: true }); addEffect(s, me, { grant: ["indestructible", "toxic 9"] }); changed(s); } }
    // Staff of Compleation: "Destroy target permanent you own."
    // ---- Marvel Super Heroes ----
    // Avengers: Under Siege: "deals 2 damage to each non-Villain creature"
    if (eff.damageAllNonType) battlefieldNow(s).map(({ card }) => card).filter((c) => isCreature(c) && !hasType(c, eff.damageAllNonType.notType)).forEach((c) => dealDamage(s, ctx.src, ctx.side, c.id, eff.damageAllNonType.n, ev));
    // Thunderbolts Conspiracy: "return it to the battlefield under its owner's control with a finality counter on it. That creature is a Hero in addition to its other types."
    if (eff.returnEventCard) {
      const id = ctx.event && ctx.event.obj && ctx.event.obj.id;
      for (const side of ["player", "opponent"]) {
        const card = s[side].graveyard.find((c) => c.id === id);
        if (!card) continue;
        s[side].graveyard = s[side].graveyard.filter((c) => c !== card);
        const perm = asFace(card, 0); perm.sick = true;
        if (eff.returnEventCard.addSubtype) perm.type = `${perm.type} ${eff.returnEventCard.addSubtype}`;
        if (eff.returnEventCard.counters) perm.counters = { ...(perm.counters || {}), ...eff.returnEventCard.counters };
        ev.push({ type: "returned", id: perm.id });
        enter(s, perm, { side }, ev);
      }
    }
    // Thor: "exile target … card from your graveyard. Until the end of your next turn, you may play that card."
    if (eff.exilePlayable) { const z = s[ctx.side], card = z.graveyard.find((c) => c.id === target); if (card) { z.graveyard = z.graveyard.filter((c) => c !== card); z.exile.push({ ...card, playable: true }); emit(s, { type: "leavesGraveyard", side: ctx.side, count: 1 }, ev); } }
    // Super-Adaptoid: for each of these keywords the target has and this doesn't, put that keyword counter on this
    if (eff.copyKwCounters && tgt) { const me = find(s, ctx.selfId); if (me) ["haste", "flying", "first strike", "double strike", "deathtouch", "indestructible", "lifelink", "menace", "reach", "trample", "vigilance"].filter((k) => has(tgt, k) && !has(me, k)).forEach((k) => addCounters(s, me, k, 1, ev)); }
    // Thanos: "Choose odd or even. Destroy each other creature with mana value of the chosen quality." (zero is even)
    if (eff.destroyParity) {
      const odd = choose(s, "Odd or even?", ["Odd", "Even"], ctx.side) === 0;
      const before = s.listens.length ? battlefieldNow(s) : null;
      battlefieldNow(s).map(({ card }) => card).filter((c) => isCreature(c) && c.id !== ctx.selfId && (manaValue(c.cost) % 2 === 1) === odd && !survivesDestroy(s, c, ev)).forEach((c) => leave(s, c, "graveyard", ev, { lookBack: before }));
    }
    // ---- Secrets of Strixhaven ----
    // Swords to Plowshares: "Exile target creature. Its controller gains life equal to its power."
    if (eff.exileGainPower && tgt) { const who = sideOf(s, tgt) === "player" ? "you" : "opp", n = Math.max(0, power(tgt)); leave(s, tgt, "exile", ev); changeLife(s, who, n, ev); }
    // Erode: "Destroy target creature or planeswalker. Its controller may search their library for a basic land card, put it onto the battlefield tapped" (yours: a choice; theirs: an unknown library)
    if (eff.erode && tgt) { const mine = sideOf(s, tgt) === ctx.side; if (!survivesDestroy(s, tgt, ev)) leave(s, tgt, "graveyard", ev); if (mine) applyEffect(s, { search: { filter: { type: "Land" }, basic: true, toBattlefield: true, tapped: true } }, undefined, ctx, ev); }
    // "Target creature gains your choice of double strike or lifelink until end of turn."
    if (eff.chooseKw && tgt) grant(tgt, [eff.chooseKw[choose(s, "Which ability?", eff.chooseKw, ctx.side, tgt.id)]], s);
    // Emeritus of Ideation: "you may exile eight cards from your graveyard. If you do, …"
    if (eff.mayExileFromGraveyard && ctx.side === "player" && s.player.graveyard.length >= eff.mayExileFromGraveyard.n &&
      choose(s, `Exile ${eff.mayExileFromGraveyard.n} cards from your graveyard?`, ["Exile them", "Don't"], "player") === 0) {
      for (let i = 0; i < eff.mayExileFromGraveyard.n; i++) { const g = s.player.graveyard, k = choose(s, `Exile which card? (${i + 1} of ${eff.mayExileFromGraveyard.n})`, g.map((c) => c.name), "player", g.map((c) => c.id)); s.player.exile.push(g[k]); s.player.graveyard = g.filter((_, j) => j !== k); }
      emit(s, { type: "leavesGraveyard", side: "player", count: eff.mayExileFromGraveyard.n }, ev);
      applyEffect(s, eff.mayExileFromGraveyard.then, target, ctx, ev);
    }
    // "All creatures get -2/-2 until end of turn."
    if (eff.allPump) battlefieldNow(s).map(({ card }) => card).filter(isCreature).forEach((c) => addMod(s, c, eff.allPump));
    // "Sacrifice two lands." / "sacrifice a permanent" (your choice of which)
    if (eff.sacOwn) {
      let done = 0;
      for (let i = 0; i < eff.sacOwn.n; i++) {
        const opts = s[ctx.side].battlefield.filter((c) => objectIs(c, eff.sacOwn.filter || {}));
        if (!opts.length) break;
        leave(s, opts[choose(s, "Sacrifice which?", opts.map((c) => c.name), ctx.side, opts.map((c) => c.id))], "graveyard", ev, { sacrificed: true }); done++;
      }
      if (done && eff.sacOwn.then) applyEffect(s, eff.sacOwn.then, target, ctx, ev);   // ("If you sacrificed a creature this way, …")
    }
    // Molten-Core Maestro: "add an amount of {R} equal to this creature's power"
    if (eff.addRPower && ctx.side === "player") { const me = find(s, ctx.selfId); if (me) s.pool.push(...Array(Math.max(0, power(me))).fill("R")); }
    // All Aboard: "Exile target non-Pilot creature you control, then return that card to the battlefield under its owner's control."
    if (eff.blinkTarget && tgt) {
      const owner = tgt.owner || sideOf(s, tgt), token = tgt.token;
      leave(s, tgt, "exile", ev);
      const ex = !token && s[owner].exile.find((x) => x.id === tgt.id);
      if (ex) { s[owner].exile = s[owner].exile.filter((x) => x !== ex); const perm = asFace(ex, 0); perm.sick = true; if (eff.blinkTarget.tapped) perm.tapped = true; enter(s, perm, { side: owner }, ev); }
    }
    // ---- Teenage Mutant Ninja Turtles ----
    // Renet: "return each other nonland permanent that entered this turn to its owner's hand"
    if (eff.bounceEnteredThisTurn) { const before = s.listens.length ? battlefieldNow(s) : null; battlefieldNow(s).map(({ card }) => card).filter((c) => c.enteredThisTurn && !isLand(c) && c.id !== ctx.selfId).forEach((c) => leave(s, c, "hand", ev, { lookBack: before })); }
    // Broadcast Takeover: "Gain control of all artifacts your opponents control until end of turn. Untap them. They gain haste until end of turn."
    if (eff.stealArtifacts && ctx.side === "player") s.opponent.battlefield.filter(isArtifact).forEach((c) => applyEffect(s, { steal: true }, c.id, ctx, ev));
    // Bebop & Rocksteady: "sacrifice a permanent unless you discard a card"
    if (eff.sacUnlessDiscard && ctx.side === "player") {
      const hand = s.player.hand, perms = s.player.battlefield;
      const k = hand.length ? choose(s, "Discard a card, or sacrifice a permanent?", [...hand.map((c) => `Discard ${c.name}`), "Sacrifice a permanent"], "player", [...hand.map((c) => c.id), null]) : hand.length;
      if (k < hand.length) discardCard(s, hand[k], ev);
      else if (perms.length) leave(s, perms[choose(s, "Sacrifice which permanent?", perms.map((c) => c.name), "player", perms.map((c) => c.id))], "graveyard", ev, { sacrificed: true });
    }
    // "Then if you control five or more Ninjas, …"
    if (eff.ifCount && s[ctx.side].battlefield.filter((c) => objectIs(c, eff.ifCount.filter)).length >= eff.ifCount.min) applyEffect(s, eff.ifCount.then, target, ctx, ev);
    // ---- Lorwyn Eclipsed ----
    // Ashling's Command: "deals 2 damage to each creature target player controls"
    if (eff.damageAllOf && (target === "opp" || target === "you")) {
      const side = (target === "opp") === (ctx.side === "player") ? "opponent" : "player";
      s[side].battlefield.filter(isCreature).forEach((c) => dealDamage(s, ctx.src, ctx.side, c.id, eff.damageAllOf, ev));
    }
    // Harmonized Crescendo: "Choose a creature type. Draw a card for each permanent you control of that type."
    if (eff.drawPerChosenType && ctx.side === "player") { const t = chooseCreatureType(s, "player"); if (t) draw(s, "player", s.player.battlefield.filter((c) => hasType(c, t)).length, ev); }
    // Bloodline Bidding: "Choose a creature type. Return all creature cards of the chosen type from your graveyard to the battlefield."
    if (eff.reanimateChosenType && ctx.side === "player") {
      const t = chooseCreatureType(s, "player");
      if (t) s.player.graveyard.filter((c) => isCreature(faceOf(c, {})) && hasType(faceOf(c, {}), t)).forEach((c) => { s.player.graveyard = s.player.graveyard.filter((x) => x !== c); const perm = asFace(c, 0); perm.sick = true; enter(s, perm, { side: "player" }, ev); });
    }
    // Curious Colossus: "each creature target opponent controls loses all abilities, becomes a Coward in addition to its other types, and has base power and toughness 1/1"
    if (eff.cowardice) s[ctx.side === "player" ? "opponent" : "player"].battlefield.filter(isCreature).forEach((c) => { addEffect(s, c, { loseAll: true }); addEffect(s, c, { setBase: [1, 1] }); if (!subtypes(c).includes("Coward")) c.type = `${c.type} Coward`; });
    // Spry and Mighty: "You draw X cards and the chosen creatures get +X/+X and gain trample, X the difference between their powers"
    if (eff.spryMighty && Array.isArray(target)) {
      const [a, b] = target.map((id) => find(s, id));
      if (a && b) { const x = Math.abs(power(a) - power(b)); draw(s, ctx.side, x, ev); [a, b].forEach((c) => { addMod(s, c, [x, x]); grant(c, ["trample"], s); }); }
    }
    // Doran: "it gets +X/+X until end of turn, where X is the difference between its power and toughness"
    if (eff.pumpDiff && tgt) { const x = Math.abs(power(tgt) - toughness(tgt)); addMod(s, tgt, [x, x]); }
    // Figure of Fable: "This creature becomes a Kithkin Scout with base power and toughness 2/3" (and "If this creature is a Scout, …")
    if (eff.becomeKithkin) {
      const me = find(s, ctx.selfId), b = eff.becomeKithkin;
      if (me && (!b.ifType || subtypes(me).includes(b.ifType))) {
        me.type = `${me.type.split("—")[0].trim()} — Kithkin ${b.type}`;
        addEffect(s, me, { setBase: b.pt }); if (b.kw) grant(me, b.kw, s);
        changed(s);
      }
    }
    // High Perfect Morcant: "each opponent blights 1" (they put a -1/-1 counter on a creature they control: their choice)
    if (eff.oppBlight) {
      const o = ctx.side === "player" ? "opponent" : "player", opts = s[o].battlefield.filter(isCreature);
      if (opts.length) addCounters(s, opts[choose(s, "Blight which creature?", opts.map((c) => c.name), o, opts.map((c) => c.id))], "-1/-1", eff.oppBlight, ev);
    }
    // "gets +X/+X, where X is …"
    if (eff.pumpBy && tgt) { const n = amount(eff.pumpBy); addMod(s, tgt, [n, n]); }
    // Nibelheim Aflame: "It deals damage equal to its power to each other creature."
    if (eff.powerToEachOther && tgt) { const n = Math.max(power(tgt), 0); battlefieldNow(s).map(({ card }) => card).filter((c) => isCreature(c) && c.id !== tgt.id).forEach((c) => dealDamage(s, tgt, sideOf(s, tgt), c.id, n, ev)); }
    // ---- Aetherdrift ----
    // Unstoppable Plan: "untap all nonland permanents you control"
    if (eff.untapNonland) s[ctx.side].battlefield.filter((c) => !isLand(c)).forEach((c) => untap(s, c, ev));
    // Chandra, Spark Hunter +2: "You may sacrifice an artifact or discard a card. If you do, draw a card."
    if (eff.chandraLoot && ctx.side === "player") {
      const arts = s.player.battlefield.filter(isArtifact), hand = s.player.hand;
      const opts = [...arts.map((c) => [`Sacrifice ${c.name}`, () => leave(s, c, "graveyard", ev, { sacrificed: true }), c.id]), ...hand.map((c) => [`Discard ${c.name}`, () => discardCard(s, c, ev), c.id])];
      const k = opts.length ? choose(s, "Sacrifice an artifact or discard a card?", [...opts.map((o) => o[0]), "Neither"], "player", [...opts.map((o) => o[2]), null]) : 0;
      if (k < opts.length) { opts[k][1](); draw(s, "player", 1, ev); }
    }
    // Oviya: "You may put a creature or Vehicle card from your hand onto the battlefield. If you put an artifact onto the battlefield this way, put two +1/+1 counters on it."
    if (eff.oviya && ctx.side === "player") {
      const l = s.player.hand.filter((c) => !c.unknown && (isCreature(faceOf(c, {})) || isVehicle(faceOf(c, {}))));
      const k = l.length ? choose(s, "Put a creature or Vehicle onto the battlefield?", [...l.map((c) => `Put ${c.name}`), "Don't"], "player", [...l.map((c) => c.id), null]) : 0;
      if (k < l.length) { const c = l[k]; s.player.hand = s.player.hand.filter((x) => x !== c); c.sick = true; enter(s, asFace(c, 0), { side: "player" }, ev); const p = find(s, c.id); if (p && isArtifact(p)) addCounters(s, p, "+1/+1", 2, ev); }
    }
    // "return this card from your graveyard to the battlefield" (a graveyard trigger of the card itself: Bloodghast, Afterburner Expert)
    if (eff.returnSelfFromGraveyard) {
      const z = s[ctx.side], me = z.graveyard.find((c) => c.id === ctx.selfId);
      if (me && (!eff.returnSelfFromGraveyard.may || choose(s, `Return ${me.name} to the battlefield?`, ["Return it", "Leave it"], ctx.side, me.id) === 0)) {
        z.graveyard = z.graveyard.filter((c) => c !== me); me.sick = true;
        // ("with a finality counter on it"; "tapped")
        if (eff.returnSelfFromGraveyard.counters) me.counters = { ...(me.counters || {}), ...eff.returnSelfFromGraveyard.counters };
        if (eff.returnSelfFromGraveyard.tapped) me.tapped = true;
        enter(s, me, { side: ctx.side }, ev);
        if (eff.returnSelfFromGraveyard.haste && find(s, me.id)) grant(find(s, me.id), ["haste"], s);   // ("It gains haste until end of turn.")
      }
    }
    // Possession Engine: "gain control of target creature an opponent controls for as long as you control this Vehicle"
    if (eff.controlWhile && tgt && sideOf(s, tgt) !== ctx.side) {
      applyEffect(s, { gainControl: true }, tgt.id, ctx, ev);
      tgt.controlledWhile = ctx.selfId;
      if (eff.controlWhile.grant) grant(tgt, eff.controlWhile.grant, s);
    }
    // "Add three mana of any one color" (a choice of color)
    if (eff.chooseColorMana && ctx.side === "player") { const col = "WUBRG"[choose(s, "Which color?", ["White", "Blue", "Black", "Red", "Green"], "player")]; s.pool.push(...Array(amount(eff.chooseColorMana)).fill(col)); }
    // "Add {G} for each creature you control" (addManaCount: { color, per })
    if (eff.addManaCount && ctx.side === "player") s.pool.push(...Array(amount({ per: eff.addManaCount.per })).fill(eff.addManaCount.color));
    // Howlsquad Heavy: "Add {R} for each Goblin you control"
    if (eff.addManaPer && ctx.side === "player") s.pool.push(...Array(s.player.battlefield.filter((c) => hasType(c, eff.addManaPer.type)).length).fill(eff.addManaPer.color));
    // Oildeep Gearhulk: "look at target player's hand. You may choose a card from it. If you do, that player discards that
    // card, then draws a card." (yours: you choose; the opponent's hand is unknown cards)
    if (eff.oildeep && to === "you" && s.player.hand.length) {
      const k = choose(s, "Choose a card to discard?", [...s.player.hand.map((c) => c.name), "None"], "player", [...s.player.hand.map((c) => c.id), null]);
      if (k < s.player.hand.length) { discardCard(s, s.player.hand[k], ev); draw(s, "player", 1, ev); }
    }
    // Sita Varma: "you may have the base power and toughness of each other creature you control become equal to Sita
    // Varma's power until end of turn"
    if (eff.sitaBase) { const me = find(s, ctx.selfId); if (me && choose(s, "Set the base power and toughness of your other creatures?", ["Yes", "No"], ctx.side) === 0) { const n = power(me); s[ctx.side].battlefield.filter((c) => isCreature(c) && c !== me).forEach((c) => addEffect(s, c, { setBase: [n, n] })); } }
    // Daretti: "choose target artifact card in your graveyard. You may sacrifice an artifact. If you do, return the chosen card"
    if (eff.daretti) {
      const z = s[ctx.side], card = z.graveyard.find((c) => c.id === target), arts = z.battlefield.filter(isArtifact);
      const k = card && arts.length ? choose(s, "Sacrifice an artifact?", [...arts.map((c) => `Sacrifice ${c.name}`), "Don't"], ctx.side, [...arts.map((c) => c.id), null]) : arts.length;
      if (card && k < arts.length) { leave(s, arts[k], "graveyard", ev, { sacrificed: true }); z.graveyard = z.graveyard.filter((c) => c !== card); card.sick = true; enter(s, card, { side: ctx.side }, ev); }
    }
    // Quag Feast: "Mill two cards, then destroy the chosen permanent if its mana value is less than or equal to the number of
    // cards in your graveyard."
    if (eff.quagFeast && tgt) { applyEffect(s, { mill: 2 }, undefined, ctx, ev); if (find(s, tgt.id) && manaValue(tgt.cost) <= s[ctx.side].graveyard.length && !survivesDestroy(s, tgt, ev)) leave(s, tgt, "graveyard", ev); }
    // "All creatures and Vehicles lose indestructible until end of turn, then destroy all creatures and Vehicles."
    if (eff.pileup) {
      const all = battlefieldNow(s).map(({ card }) => card).filter((c) => isCreature(c) || isVehicle(c));
      all.forEach((c) => addEffect(s, c, { loseKw: "indestructible" }));
      const before = s.listens.length ? battlefieldNow(s) : null;
      all.forEach((c) => leave(s, c, "graveyard", ev, { lookBack: before }));
    }
    // ---- Duskmourn ----
    // Overlord of the Balemurk: "then you may return a non-Avatar creature card or a planeswalker card from your graveyard to
    // your hand" (any card of yours there that fits)
    if (eff.fromMilledMay) {
      const z = s[ctx.side], l = z.graveyard.filter((c) => objectIs(faceOf(c, {}), eff.fromMilledMay.filter || {}));
      const k = l.length ? choose(s, "Return a card to your hand?", [...l.map((c) => `Return ${c.name}`), "Don't"], ctx.side, [...l.map((c) => c.id), null]) : 0;
      if (k < l.length) { z.graveyard = z.graveyard.filter((c) => c !== l[k]); z.hand.push(l[k]); }
    }
    // The Enduring cycle: "When this dies, if it was a creature, return it to the battlefield under its owner's control. It's
    // an enchantment. (It's not a creature.)"
    if (eff.returnAsEnchantment) {
      const owner = (ctx.src && ctx.src.owner) || ctx.side, z = s[owner], card = z.graveyard.find((c) => c.id === ctx.selfId);
      if (card) { z.graveyard = z.graveyard.filter((c) => c !== card); card.type = card.type.replace(/\s*\bCreature\b/, ""); card.notCreature = true; enter(s, card, { side: owner }, ev); }
    }
    // Ghostly Dancers: "return an enchantment card from your graveyard to your hand or unlock a locked door of a Room you control"
    if (eff.dancers) {
      const z = s[ctx.side], ench = z.graveyard.filter((c) => typeHas(faceOf(c, {}), /enchantment/i));
      const doors = z.battlefield.filter((c) => c.layout === "room" && c.unlocked).flatMap((c) => c.unlocked.map((u, i) => (u ? null : [c, i])).filter(Boolean));
      const opts = [...ench.map((c) => [`Return ${c.name} to your hand`, () => { z.graveyard = z.graveyard.filter((x) => x !== c); z.hand.push(c); }]),
        ...doors.map(([c, i]) => [`Unlock ${c.faces[i].name}`, () => unlockDoor(s, c, i, ev)])];
      if (opts.length) opts[choose(s, "Ghostly Dancers", opts.map((o) => o[0]), ctx.side)][1]();
    }
    // Reluctant Role Model (survival): "put a flying, lifelink, or +1/+1 counter on it"
    if (eff.chooseCounter && tgt) { const k = eff.chooseCounter[choose(s, "Which counter?", eff.chooseCounter.map((x) => `A ${x} counter`), ctx.side, tgt.id)]; addCounters(s, tgt, k, 1, ev); }
    // "if it had counters on it, put those counters on up to one target creature" (the creature that died, as it last existed)
    if (eff.eventCountersTo && tgt) { const o = ctx.event && ctx.event.counters; Object.entries(o || {}).forEach(([k, n]) => { if (n > 0) addCounters(s, tgt, k, n, ev); }); }
    // Unidentified Hovership: "exile up to one target creature with toughness 5 or less" (remembered: "When this Vehicle
    // leaves the battlefield, the exiled card's owner manifests dread")
    if (eff.hoverExile && tgt) { const me = find(s, ctx.selfId), owner = tgt.owner || sideOf(s, tgt); leave(s, tgt, "exile", ev); if (me) me.hoverOwner = owner; }
    if (eff.hoverManifest) { const owner = ctx.src && ctx.src.hoverOwner; if (owner) manifestDread(s, owner, ev); }
    // Come Back Wrong: "Destroy target creature. If a creature card is put into a graveyard this way, return it to the
    // battlefield under your control. Sacrifice it at the beginning of your next end step."
    if (eff.comeBackWrong && tgt) {
      const owner = tgt.owner || sideOf(s, tgt), id = tgt.id;
      if (!survivesDestroy(s, tgt, ev)) leave(s, tgt, "graveyard", ev);
      const card = s[owner].graveyard.find((c) => c.id === id && isCreature(faceOf(c, {})));
      if (card) { s[owner].graveyard = s[owner].graveyard.filter((c) => c !== card); card.sick = true; enter(s, card, { side: ctx.side }, ev); delay(s, "sacrificeIt", ctx.side, card.name, id, id); }
    }
    // "they lose half their life, rounded up" (the player the event is about)
    if (eff.halfLifeEvent) { const who = ctx.event && ctx.event.to; if (who && s[who === "opp" ? "opponent" : "player"].life != null) changeLife(s, who, -Math.ceil(Math.max(s[who === "opp" ? "opponent" : "player"].life, 0) / 2), ev); }
    // Unstoppable Slasher: "When this creature dies, if it had no counters on it, return it to the battlefield tapped under its
    // owner's control with two stun counters on it."
    if (eff.slasherReturn) {
      const owner = (ctx.src && ctx.src.owner) || ctx.side, z = s[owner], card = z.graveyard.find((c) => c.id === ctx.selfId);
      if (card) { z.graveyard = z.graveyard.filter((c) => c !== card); card.tapped = true; card.counters = { stun: 2 }; card.sick = true; enter(s, card, { side: owner }, ev); }
    }
    // Meathook Massacre II: "each player sacrifices X creatures of their choice"
    if (eff.eachSacrificeX) for (let i = 0; i < (ctx.x || 0); i++) applyEffect(s, { eachSacrifices: true }, undefined, ctx, ev);
    // "you may pay 3 life. If you do, return that card under your control with a finality counter on it." (yours) / "they may
    // pay 3 life. If they don't, return that card under your control …" (the opponent's: their choice, worst for you)
    if (eff.meathookReturn) {
      const theirs = ctx.event && ctx.event.side !== ctx.side, z = s[theirs ? (ctx.side === "player" ? "opponent" : "player") : ctx.side];
      const card = z.graveyard.find((c) => c.id === (ctx.event && ctx.event.id));
      const ret = card && (theirs ? choose(s, `Pay 3 life to keep ${card.name} from being stolen?`, ["Pay 3 life", "Don't"], "opponent") === 1
        : canPayLife(s, 3) && choose(s, `Pay 3 life to return ${card.name}?`, ["Pay 3 life", "Don't"], "player") === 0);
      if (theirs && card && !ret) changeLife(s, ctx.side === "player" ? "opp" : "you", -3, ev);
      if (!theirs && ret) payLife(s, 3, ev);
      if (card && ret) { z.graveyard = z.graveyard.filter((c) => c !== card); card.sick = true; card.counters = { finality: 1 }; enter(s, card, { side: ctx.side }, ev); }
    }
    // Cursed Recording: "Then if there are seven or more time counters on it, remove those counters and it deals 20 damage to you."
    if (eff.cursedRecording) { const me = find(s, ctx.selfId); if (me && ((me.counters || {}).time || 0) >= 7) { me.counters = { ...me.counters, time: 0 }; dealDamage(s, me, ctx.side, ctx.side === "player" ? "you" : "opp", 20, ev); } }
    // Screaming Nemesis: "If a player is dealt damage this way, they can't gain life for the rest of the game."
    if (eff.noGainForTarget && (to === "opp" || to === "you")) s.noGain = [...new Set([...(s.noGain || []), to])];
    // Waltz of Rage: "Target creature you control deals damage equal to its power to each other creature. Until end of turn,
    // whenever a creature you control dies, exile the top card of your library. You may play it …"
    if (eff.waltz && tgt) {
      const n = Math.max(power(tgt), 0);
      battlefieldNow(s).map(({ card }) => card).filter((c) => isCreature(c) && c !== tgt).forEach((c) => dealDamage(s, tgt, sideOf(s, tgt), c.id, n, ev));
      s.waltz = true;
    }
    // Hauntwoods Shrieker: "Reveal target face-down permanent. If it's a creature card, you may turn it face up."
    if (eff.revealFaceDown && tgt && tgt.faceDown) { const h = tgt.hidden || {}; if (!h.unknown && /creature/i.test(h.type || "") && choose(s, `Turn ${h.name} face up?`, ["Turn it face up", "Leave it"], ctx.side, tgt.id) === 0) turnFaceUp(s, tgt, ev); }
    // Valgavoth's Onslaught: "Manifest dread X times, then put X +1/+1 counters on each of those creatures."
    if (eff.onslaught) {
      const before = new Set(s[ctx.side].battlefield.map((c) => c.id));
      for (let i = 0; i < (ctx.x || 0); i++) manifestDread(s, ctx.side, ev);
      s[ctx.side].battlefield.filter((c) => !before.has(c.id) && c.faceDown).forEach((c) => addCounters(s, c, "+1/+1", ctx.x || 0, ev));
    }
    // Peer Past the Veil: "Discard your hand. Then draw X cards, where X is the number of card types among cards in your graveyard."
    if (eff.peerPast && ctx.side === "player") { [...s.player.hand].forEach((c) => discardCard(s, c, ev)); draw(s, "player", cardTypesIn(s, "player"), ev); }
    // Victor: surveil 2 the first time, each opponent discards the second, a creature card from a graveyard onto the
    // battlefield under your control the third
    if (eff.victor) {
      const k = (s.vito || {})[ctx.selfId] || 0;
      s.vito = { ...(s.vito || {}), [ctx.selfId]: k + 1 };
      if (k === 0) applyEffect(s, { surveil: 2 }, undefined, ctx, ev);
      if (k === 1) applyEffect(s, { discard: 1 }, "opp", ctx, ev);
      if (k === 2) {
        const l = [...s.player.graveyard, ...s.opponent.graveyard].filter((c) => isCreature(faceOf(c, {})));
        if (l.length) { const c = l[choose(s, "Put which creature card onto the battlefield?", l.map((x) => x.name), ctx.side, l.map((x) => x.id))]; ["player", "opponent"].forEach((sd) => { s[sd].graveyard = s[sd].graveyard.filter((x) => x !== c); }); c.sick = true; enter(s, c, { side: ctx.side }, ev); }
      }
    }
    // Zimone, All-Questioning: "create Primo, the Indivisible, a legendary 0/0 … token, then put that many +1/+1 counters on it"
    if (eff.primo) {
      const n = s[ctx.side].battlefield.filter(isLand).length;
      const t = createToken(s, { name: "Primo, the Indivisible", type: "Token Legendary Creature — Fractal", pt: "0/0", colors: ["G", "U"] }, ctx.side, ev);
      if (t && find(s, t.id)) addCounters(s, t, "+1/+1", n, ev);
    }
    // Dissection Tools: "manifest dread, then attach this Equipment to that creature"
    if (eff.manifestAttach) {
      const before = new Set(s[ctx.side].battlefield.map((c) => c.id));
      manifestDread(s, ctx.side, ev);
      const m = s[ctx.side].battlefield.find((c) => !before.has(c.id) && c.faceDown), me = find(s, ctx.selfId);
      if (m && me) { me.attachedTo = m.id; me.ts = stamp(s); changed(s); }
    }
    // Hedge Shredder: "Whenever one or more land cards are put into your graveyard from your library, put them onto the
    // battlefield tapped." (the milled lands: ctx.event.ids)
    if (eff.millLandsBack) (ctx.event && ctx.event.ids || []).forEach((id) => { const z = s[ctx.side], c = z.graveyard.find((x) => x.id === id); if (c) { z.graveyard = z.graveyard.filter((x) => x !== c); c.tapped = true; enter(s, asFace(c, 0), { side: ctx.side }, ev); } });
    // ---- Bloomburrow ----
    // Azure Beastbinder: "If it's a creature, it also has base power and toughness 2/2"
    if (eff.beastbind && tgt && isCreature(tgt)) addEffect(s, tgt, { setBase: [2, 2] });
    // Valley Floodcaller: "Untap them." (the creatures of those types)
    if (eff.untapTeam) s[ctx.side].battlefield.filter((c) => isCreature(c) && matches(s, c, eff.untapTeam, ctx.side)).forEach((c) => untap(s, c, ev));
    // Coiling Rebirth: "if the gift was promised and that creature isn't legendary, create a token that's a copy of that creature, except it's 1/1"
    if (eff.copyIfNotLegendary) { const o = find(s, target); if (o && !/\blegendary\b/i.test(o.type || "")) createToken(s, copyValues(o, { pt: "1/1" }), ctx.side, ev); }
    // Sunspine Lynx: "it deals damage to each player equal to the number of nonbasic lands that player controls"
    if (eff.lynx) [["player", "you"], ["opponent", "opp"]].forEach(([sd, who]) => { const n = s[sd].battlefield.filter((c) => isLand(c) && !/\bbasic\b/i.test(c.type || "")).length; if (n) dealDamage(s, find(s, ctx.selfId) || ctx.src, ctx.side, ctx.side === "player" ? who : who === "you" ? "opp" : "you", n, ev); });
    // "you may discard your hand. If you do, draw two cards."
    if (eff.mayDiscardHandDraw && ctx.side === "player" && choose(s, "Discard your hand and draw two cards?", ["Do it", "Don't"], "player") === 0) { [...s.player.hand].forEach((c) => discardCard(s, c, ev)); draw(s, "player", eff.mayDiscardHandDraw, ev); }
    // "then discard two cards"
    if (eff.discardN && ctx.side === "player") for (let i = 0; i < eff.discardN && s.player.hand.length; i++) discardCard(s, s.player.hand[choose(s, "Discard which card?", s.player.hand.map((c) => c.name), "player", s.player.hand.map((c) => c.id))], ev);
    // Essence Channeler: "When this creature dies, put its counters on target creature you control" (as it last existed)
    if (eff.moveCounters && tgt) Object.entries((ctx.src && ctx.src.counters) || {}).forEach(([k, n]) => { if (n > 0) addCounters(s, tgt, k, n, ev); });
    // Starfall Invocation: "return a creature card put into your graveyard this way to the battlefield under your control"
    if (eff.reanimateDestroyed) {
      const z = s[ctx.side], l = z.graveyard.filter((c) => (ctx.destroyed || []).includes(c.id) && isCreature(faceOf(c, {})));
      if (l.length) { const c = l[choose(s, "Return which creature card?", l.map((x) => x.name), ctx.side, l.map((x) => x.id))]; z.graveyard = z.graveyard.filter((x) => x !== c); c.sick = true; enter(s, c, { side: ctx.side }, ev); }
    }
    // Wick: "create a 1/1 black Snail creature token if you don't control a Snail. Otherwise, put a +1/+1 counter on a Snail you control."
    if (eff.snail) {
      const snails = s[ctx.side].battlefield.filter((c) => hasType(c, "Snail"));
      if (!snails.length) createToken(s, { name: "Snail", type: "Token Creature — Snail", pt: "1/1", colors: ["B"] }, ctx.side, ev);
      else addCounters(s, snails[choose(s, "Put a +1/+1 counter on which Snail?", snails.map((c) => c.name), ctx.side, snails.map((c) => c.id))], "+1/+1", 1, ev);
    }
    // Lumra: "Then return all land cards from your graveyard to the battlefield tapped."
    if (eff.returnAllLands) {
      const z = s[ctx.side], l = z.graveyard.filter((c) => isLand(faceOf(c, {})));
      z.graveyard = z.graveyard.filter((c) => !l.includes(c));
      l.forEach((c) => { c.tapped = true; enter(s, asFace(c, 0), { side: ctx.side }, ev); });
    }
    // Fecund Greenshell: "look at the top card of your library. If it's a land card, you may put it onto the battlefield
    // tapped. Otherwise, put it into your hand." (an unknown card: into your hand, unknown)
    if (eff.greenshell) {
      const z = s[ctx.side], top = z.library[0];
      if (top && isLand(faceOf(top, {}))) { if (choose(s, `Put ${top.name} onto the battlefield tapped?`, ["Onto the battlefield", "Leave it on top"], ctx.side, top.id) === 0) { z.library.shift(); top.tapped = true; enter(s, asFace(top, 0), { side: ctx.side }, ev); } }
      else draw(s, ctx.side, 1, ev);
    }
    // Scavenger's Talent level 3: "you may sacrifice three other nonland permanents. If you do, return a creature card from your
    // graveyard to the battlefield with a finality counter on it."
    if (eff.scavengerL3) {
      const l = s[ctx.side].battlefield.filter((c) => !isLand(c) && c.id !== ctx.selfId);
      if (l.length >= 3 && choose(s, "Sacrifice three other nonland permanents?", ["Sacrifice three", "Don't"], ctx.side) === 0) {
        for (let i = 0; i < 3; i++) { const m = s[ctx.side].battlefield.filter((c) => !isLand(c) && c.id !== ctx.selfId); leave(s, m[choose(s, `Sacrifice which (${i + 1} of 3)?`, m.map((c) => c.name), ctx.side, m.map((c) => c.id))], "graveyard", ev, { sacrificed: true }); }
        const g = s[ctx.side].graveyard.filter((c) => isCreature(faceOf(c, {})));
        if (g.length) { const c = g[choose(s, "Return which creature card?", g.map((x) => x.name), ctx.side, g.map((x) => x.id))]; s[ctx.side].graveyard = s[ctx.side].graveyard.filter((x) => x !== c); c.sick = true; c.counters = { finality: 1 }; enter(s, c, { side: ctx.side }, ev); }
      }
    }
    // Dragonhawk: exile the top X cards (X = creatures you control with power 4 or greater), playable until your next end
    // step; "At the beginning of your next end step, Dragonhawk deals 2 damage to each opponent for each of those cards that
    // are still exiled." (a delayed trigger)
    if (eff.dragonhawk) {
      const z = s[ctx.side], n = z.battlefield.filter((c) => isCreature(c) && power(c) >= 4).length, ids = [];
      for (let i = 0; i < n; i++) { const c = z.library.shift() || (!(z.libraryCount > 0) ? z.libraryBottom.shift() : null); if (c) { c.playable = true; z.exile.push(c); ids.push(c.id); } else if (z.libraryCount > 0) { z.libraryCount--; ids.push(`unknown-${s.nextId++}`); } }
      s.dragonhawk = [...(s.dragonhawk || []), ...ids];
      if (ids.length) delay(s, "dragonhawkDamage", ctx.side, (ctx.src && ctx.src.name) || "Dragonhawk", ctx.selfId, ctx.selfId);
    }
    if (eff.dragonhawkDamage) {
      const still = (s.dragonhawk || []).filter((id) => id.startsWith("unknown-") || s[ctx.side].exile.some((c) => c.id === id)).length;
      delete s.dragonhawk;
      if (still) dealDamage(s, find(s, ctx.selfId) || ctx.src, ctx.side, ctx.side === "player" ? "opp" : "you", 2 * still, ev);
    }
    // Ral's emblem: "Instant and sorcery spells you cast have storm." (copy it for each spell cast before it this turn)
    if (eff.storm) { const item = s.stack.find((x) => x.kind === "spell" && x.id === (ctx.event && ctx.event.id)); for (let i = 0; item && i < Math.max(0, (s.spellsCast || 1) - 1); i++) copySpell(s, item, { side: ctx.side }, ev); }
    // "you may pay {W}{B} and 2 life. When you do, …" (mayPay with life too)
    if (eff.mayPayAndLife && ctx.side === "player") {
      const pay = bestPayment(s, eff.mayPayAndLife.cost);
      if (pay && canPayLife(s, eff.mayPayAndLife.life) && choose(s, `Pay ${eff.mayPayAndLife.cost} and ${eff.mayPayAndLife.life} life?`, ["Pay", "Don't"], "player") === 0) {
        spend(s, pay, ev); payLife(s, eff.mayPayAndLife.life, ev); applyEffect(s, eff.mayPayAndLife.then, target, ctx, ev);
      }
    }
    // Fabled Passage: "Then if you control four or more lands, untap that land." (the land it just found)
    if (eff.untapIfFourLands && s[ctx.side].battlefield.filter(isLand).length >= 4) { const l = s[ctx.side].battlefield.filter(isLand).slice(-1)[0]; if (l) untap(s, l, ev); }
    // ---- Outlaws of Thunder Junction ----
    // Another Round: "Exile any number of creatures you control, then return them to the battlefield under their owner's
    // control. Then repeat this process X more times."
    if (eff.flickerAny) {
      for (let r = 0; r <= (ctx.x || 0); r++) {
        const mine = s[ctx.side].battlefield.filter(isCreature).filter((c) => choose(s, `Exile and return ${c.name}?`, ["Flicker it", "Leave it"], ctx.side, c.id) === 0);
        const back = [];
        mine.forEach((c) => { const card = c.token ? null : c, owner = c.owner || ctx.side; leave(s, c, "exile", ev); const ex = card && s[owner].exile.find((x) => x.id === card.id); if (ex) back.push([ex, owner]); });
        back.forEach(([ex, owner]) => { s[owner].exile = s[owner].exile.filter((x) => x !== ex); ex.sick = true; enter(s, ex, { side: owner }, ev); });
      }
    }
    // Final Showdown: "Choose a creature you control. It gains indestructible until end of turn." (not targeted)
    if (eff.chooseYoursGrant) {
      const mine = s[ctx.side].battlefield.filter(isCreature);
      if (mine.length) grant(mine[choose(s, "Which creature gains it?", mine.map((c) => c.name), ctx.side, mine.map((c) => c.id))], eff.chooseYoursGrant, s);
    }
    // "All creatures lose all abilities until end of turn"
    if (eff.allLoseAbilities) battlefieldNow(s).map(({ card }) => card).filter(isCreature).forEach((c) => addEffect(s, c, { loseAll: true }));
    // One Last Job: "Return target Aura or Equipment card from your graveyard to the battlefield attached to a creature you control"
    if (eff.returnAttached) {
      const z = s[ctx.side], card = z.graveyard.find((c) => c.id === target), hosts = s[ctx.side].battlefield.filter(isCreature);
      if (card && hosts.length) {
        const h = hosts[choose(s, `Attach ${card.name} to which creature?`, hosts.map((c) => c.name), ctx.side, hosts.map((c) => c.id))];
        z.graveyard = z.graveyard.filter((c) => c !== card);
        card.attachedTo = h.id;
        enter(s, card, { side: ctx.side }, ev);
      }
    }
    // Archmage's Newt: "target instant or sorcery card in your graveyard gains flashback until end of turn. The flashback cost
    // is equal to its mana cost. That card gains flashback {0} until end of turn instead if this creature is saddled."
    if (eff.grantFlashback) {
      const card = s[ctx.side].graveyard.find((c) => c.id === target), me = find(s, ctx.selfId) || ctx.src || {};
      if (card) card.flashback = { cost: me.saddled ? "{0}" : faceOf(card, {}).cost || "{0}" };
    }
    // Caustic Bronco: "reveal the top card of your library and put it into your hand. You lose life equal to that card's
    // mana value if this creature isn't saddled. Otherwise, each opponent loses that much life." (an unknown card: 0)
    if (eff.bronco) {
      const z = s[ctx.side], top = z.library[0], me = find(s, ctx.selfId) || ctx.src || {};
      const mv = top ? manaValue(faceOf(top, {}).cost) : 0;
      draw(s, ctx.side, 1, ev);
      if (mv) changeLife(s, me.saddled ? "opp" : "you", -mv, ev);
    }
    // Rush of Dread: "Target opponent sacrifices half the creatures they control of their choice, rounded up / discards half
    // the cards in their hand, rounded up / loses half their life, rounded up."
    if (eff.halfSacrifice && to === "opp") for (let i = 0, n = Math.ceil(s.opponent.battlefield.filter(isCreature).length / 2); i < n; i++) {
      const l = s.opponent.battlefield.filter(isCreature);
      leave(s, l[choose(s, "Sacrifice which creature?", l.map((c) => c.name), "opponent", l.map((c) => c.id))], "graveyard", ev, { sacrificed: true });
    }
    if (eff.halfDiscard && to === "opp") applyEffect(s, { discard: Math.ceil((s.opponent.handCount || 0) / 2) }, "opp", ctx, ev);
    if (eff.halfLife && to === "opp" && s.opponent.life != null) changeLife(s, "opp", -Math.ceil(Math.max(s.opponent.life, 0) / 2), ev);
    // Hell to Pay: "Create a number of tapped Treasure tokens equal to the amount of excess damage dealt to that creature"
    if (eff.excessTreasures != null) for (let i = 0; i < (ctx.excess || 0); i++) createToken(s, { name: "Treasure", type: "Token Artifact — Treasure", colors: [], tapped: true }, ctx.side, ev);
    // "You may exile a nonland card with mana value 3 or less from your hand. If you do, it becomes plotted." (castable for
    // free as a sorcery on a later turn: not this one)
    if (eff.mayPlotFromHand && ctx.side === "player") {
      const l = s.player.hand.filter((c) => !c.unknown && !isLand(faceOf(c, {})) && manaValue(faceOf(c, {}).cost) <= eff.mayPlotFromHand);
      const k = l.length ? choose(s, "Plot a card from your hand?", [...l.map((c) => `Plot ${c.name}`), "Don't"], "player", [...l.map((c) => c.id), null]) : 0;
      if (k < l.length) { s.player.hand = s.player.hand.filter((c) => c !== l[k]); l[k].plotted = true; l[k].plottedNow = true; s.player.exile.push(l[k]); }
    }
    // "you may draw a card. If you do, discard a card."
    if (eff.mayLoot && ctx.side === "player" && choose(s, "Draw a card, then discard a card?", ["Loot", "Don't"], "player") === 0) applyEffect(s, { loot: 1 }, undefined, ctx, ev);
    // "Target player draws three cards and loses 3 life"
    if (eff.playerDrawsLoses && (to === "opp" || to === "you")) { draw(s, to === "opp" ? "opponent" : "player", eff.playerDrawsLoses, ev); changeLife(s, to, -eff.playerDrawsLoses, ev); }
    // Bristly Bill: "Double the number of +1/+1 counters on each creature you control"
    if (eff.doubleAllCounters) s[ctx.side].battlefield.filter(isCreature).forEach((c) => { const n = (c.counters || {})["+1/+1"] || 0; if (n) addCounters(s, c, "+1/+1", n, ev); });
    // Jace Reawakened −6: "Until end of turn, whenever you cast a spell, copy it."
    if (eff.copyAllSpells && ctx.side === "player") s.copyAll = (s.copyAll || 0) + 1;
    // Bruse Tarl: "exile the top card of your library. If it's a land card, create a 2/2 white Ox creature token. Otherwise,
    // you may cast it until the end of your next turn." (an unknown card can't be cast)
    if (eff.bruse) {
      const z = s[ctx.side], top = z.library.shift() || (!(z.libraryCount > 0) ? z.libraryBottom.shift() : null);
      if (!top && z.libraryCount > 0) z.libraryCount--;
      if (top) { z.exile.push(top); if (isLand(faceOf(top, {}))) createToken(s, eff.bruse, ctx.side, ev); else top.playable = true; }
    }
    // ---- Murders at Karlov Manor ----
    if (eff.ifYours && ctx.wasYours) applyEffect(s, eff.ifYours, undefined, ctx, ev);
    // Illicit Masquerade: "exile it" (the creature that just died, from its owner's graveyard)
    if (eff.exileDead) ["player", "opponent"].forEach((sd) => { const c = s[sd].graveyard.find((x) => x.id === (ctx.event && ctx.event.id)); if (c) { s[sd].graveyard = s[sd].graveyard.filter((x) => x !== c); s[sd].exile.push(c); } });
    // "if its power is greater than this creature's power or its toughness is greater than this creature's toughness, …"
    if (eff.ifEventBigger) { const o = find(s, ctx.event && ctx.event.id), me = find(s, ctx.selfId); if (o && me && (power(o) > power(me) || toughness(o) > toughness(me))) applyEffect(s, eff.ifEventBigger, undefined, ctx, ev); }
    // "Creature cards in your graveyard gain 'You may cast this card from your graveyard' until end of turn"
    if (eff.castCreaturesFromGraveyard && ctx.side === "player") s.creaturesFromGraveyard = true;
    // No Witnesses: "Each player who controls the most creatures investigates. Then destroy all creatures."
    if (eff.mostCreaturesInvestigate) {
      const n = (sd) => s[sd].battlefield.filter(isCreature).length, most = Math.max(n("player"), n("opponent"));
      ["player", "opponent"].forEach((sd) => { if (n(sd) === most) createToken(s, CLUE, sd, ev); });
    }
    // Unyielding Gatekeeper: "exile another target nonland permanent. If you controlled it, return it to the battlefield
    // tapped. Otherwise, its controller creates a 2/2 white and blue Detective creature token."
    if (eff.gatekeeper && tgt) {
      const mine = sideOf(s, tgt) === ctx.side, theirs = sideOf(s, tgt), card = tgt.token ? null : tgt, owner = tgt.owner || theirs;
      leave(s, tgt, "exile", ev);
      const ex = card && s[owner].exile.find((x) => x.id === card.id);
      if (mine && ex) { s[owner].exile = s[owner].exile.filter((x) => x !== ex); ex.tapped = true; enter(s, ex, { side: owner }, ev); }
      if (!mine) createToken(s, { name: "Detective", type: "Token Creature — Detective", pt: "2/2", colors: ["W", "U"] }, theirs, ev);
    }
    // CR 701.58a: cloak — put a card onto the battlefield face down as a 2/2 creature with ward {2} (from the top of your
    // library, or a chosen card from your hand); it can be turned face up for its mana cost if it's a creature card
    if (eff.cloak) {
      const z = s[ctx.side];
      for (let i = 0; i < (eff.cloak.n || 1); i++) {
        let card;
        if (eff.cloak.fromHand) {
          const hand = z.hand.filter((c) => !c.unknown);
          if (!hand.length) break;
          card = hand[choose(s, "Cloak which card?", hand.map((c) => c.name), ctx.side, hand.map((c) => c.id))];
          z.hand = z.hand.filter((c) => c !== card);
        } else {
          card = z.library.shift() || (!(z.libraryCount > 0) ? z.libraryBottom.shift() : null);
          if (!card && z.libraryCount > 0) { z.libraryCount--; card = { id: `unknown-${s.nextId++}`, name: "Unknown card", type: "Card", unknown: true }; }
          if (!card) break;
        }
        const perm = faceDownOf({ ...card, owner: ctx.side }, { manifest: true });
        perm.kw = ["ward 2"];
        perm.sick = true;
        ev.push({ type: "cloaked", id: perm.id });
        enter(s, perm, { side: ctx.side }, ev);
        if (eff.cloak.attachSelf) { const me = find(s, ctx.selfId); if (me && find(s, perm.id)) { me.attachedTo = perm.id; me.ts = stamp(s); changed(s); } }
      }
    }
    // Steamcore Scholar: "Then discard two cards unless you discard an instant or sorcery card or a creature card with flying."
    if (eff.steamcore && ctx.side === "player") {
      const z = s.player, pick = () => z.hand[choose(s, "Discard which card?", z.hand.map((c) => c.name), "player", z.hand.map((c) => c.id))];
      if (z.hand.length) {
        const first = pick();
        const f0 = faceOf(first, {});
        discardCard(s, first, ev);
        if (!(typeHas(f0, /instant|sorcery/i) || (isCreature(f0) && (f0.kw || []).includes("flying"))) && z.hand.length) discardCard(s, pick(), ev);
      }
    }
    // "Exile a card from an opponent's graveyard. Then search its owner's graveyard, hand, and library for any number of
    // cards with that name and exile them." (the known ones: in that graveyard)
    if (eff.exileNamedFromOppGraveyard) {
      const z = s[ctx.side === "player" ? "opponent" : "player"];
      if (z.graveyard.length) {
        const name = z.graveyard[choose(s, "Exile which card from the opponent's graveyard?", z.graveyard.map((c) => c.name), ctx.side, z.graveyard.map((c) => c.id))].name;
        const gone = z.graveyard.filter((c) => c.name === name);
        z.graveyard = z.graveyard.filter((c) => c.name !== name);
        z.exile.push(...gone);
      }
    }
    // "collect evidence X" by choice (you may; X is what you chose: total mana value of the exiled cards), then …
    // (mayEvidence: { min, then } — "you may collect evidence 4. If you do, …"; amounts "evidenceX" use the total)
    if (eff.mayEvidence) {
      const z = s[ctx.side], min = eff.mayEvidence.min || 0;
      const opts = evidenceSets(z.graveyard, min);
      const k = opts.length ? choose(s, `Collect evidence${min ? " " + min : ""}?`, [...opts.map((l) => `Exile ${l.map((c) => c.name).join(", ")} (${l.reduce((t, c) => t + manaValue(faceOf(c, {}).cost), 0)})`), "Don't"], ctx.side) : 0;
      if (k < opts.length) {
        const l = opts[k], x = l.reduce((t, c) => t + manaValue(faceOf(c, {}).cost), 0);
        z.graveyard = z.graveyard.filter((c) => !l.includes(c)); z.exile.push(...l);
        emit(s, { type: "collectsEvidence", side: ctx.side }, ev);
        applyEffect(s, JSON.parse(JSON.stringify(eff.mayEvidence.then).replace(/"evidenceX"/g, String(x))), target, ctx, ev);
      }
    }
    // "it gains your choice of vigilance, lifelink, or hexproof until end of turn"
    if (eff.chooseGrant && tgt) grant(tgt, [eff.chooseGrant[choose(s, `${tgt.name} gains which?`, eff.chooseGrant, ctx.side, tgt.id)]], s);
    // Agrus Kos: "If it's suspected, exile it. Otherwise, suspect it."
    if (eff.suspectOrExile && tgt) { if (tgt.suspected) leave(s, tgt, "exile", ev); else { tgt.suspected = true; changed(s); ev.push({ type: "suspected", id: tgt.id }); } }
    // Ill-Timed Explosion: "Then you may discard two cards. When you do, … X damage to each creature, where X is the greatest
    // mana value among cards discarded this way."
    if (eff.mayDiscardTwoBlast && ctx.side === "player" && s.player.hand.length >= 2 && choose(s, "Discard two cards?", ["Discard two", "Don't"], "player") === 0) {
      let x = 0;
      for (let i = 0; i < 2; i++) { const c = s.player.hand[choose(s, "Discard which card?", s.player.hand.map((h) => h.name), "player", s.player.hand.map((h) => h.id))]; x = Math.max(x, c.unknown ? 0 : manaValue(faceOf(c, {}).cost)); discardCard(s, c, ev); }
      applyGlobal(s, { damageAll: { n: x, creatures: "all" } }, ctx, ev, null);
    }
    // Judith: "That spell gains deathtouch and lifelink" (the spell that triggered this, on the stack)
    if (eff.spellGains) { const item = s.stack.find((x) => x.kind === "spell" && x.id === (ctx.event && ctx.event.id)); if (item) item.gain = [...(item.gain || []), ...eff.spellGains]; }
    // Rakdos, Patron of Chaos: "target opponent may sacrifice two nonland, nontoken permanents of their choice. If they
    // don't, you draw two cards." (the opponent's choice: whichever is worse for you)
    if (eff.rakdos) {
      const theirs = s.opponent.battlefield.filter((c) => !isLand(c) && !c.token);
      if (theirs.length >= 2 && choose(s, "Sacrifice two nonland, nontoken permanents?", ["Sacrifice two", "Let them draw"], "opponent") === 0) {
        for (let i = 0; i < 2; i++) { const l = s.opponent.battlefield.filter((c) => !isLand(c) && !c.token); leave(s, l[choose(s, "Sacrifice which?", l.map((c) => c.name), "opponent", l.map((c) => c.id))], "graveyard", ev, { sacrificed: true }); }
      } else draw(s, ctx.side, 2, ev);
    }
    // Tolsimir: "target creature an opponent controls blocks that Wolf this combat if able"
    if (eff.mustBlockEvent && tgt && ctx.event) s.mustBlock = { ...(s.mustBlock || {}), [tgt.id]: ctx.event.id };
    // Worldsoul's Rage: "Put up to X land cards from your hand and/or graveyard onto the battlefield tapped."
    if (eff.putLandsX && ctx.side === "player") {
      for (let i = 0; i < (ctx.x || 0); i++) {
        const opts = [...s.player.hand.filter((c) => !c.unknown && isLand(faceOf(c, {}))).map((c) => [c, "hand"]), ...s.player.graveyard.filter((c) => isLand(faceOf(c, {}))).map((c) => [c, "graveyard"])];
        if (!opts.length) break;
        const k = choose(s, `Put a land onto the battlefield tapped (${i + 1} of up to ${ctx.x})?`, [...opts.map(([c, z]) => `${c.name} (${z})`), "Stop"], "player", [...opts.map(([c]) => c.id), null]);
        if (k >= opts.length) break;
        const [c, z] = opts[k];
        s.player[z] = s.player[z].filter((x) => x !== c);
        c.tapped = true;
        enter(s, asFace(c, 0), { side: "player" }, ev);
      }
    }
    // Lamplight Phoenix: "you may exile it and collect evidence 4. If you do, return this card to the battlefield tapped."
    if (eff.phoenixEvidence) {
      const z = s[ctx.side], me = z.graveyard.find((c) => c.id === ctx.selfId);
      const opts = me ? evidenceSets(z.graveyard.filter((c) => c !== me), eff.phoenixEvidence) : [];
      const k = opts.length ? choose(s, `Exile it and collect evidence ${eff.phoenixEvidence}?`, [...opts.map((l) => `Exile ${l.map((c) => c.name).join(", ")}`), "Don't"], ctx.side) : 0;
      if (k < opts.length) {
        z.graveyard = z.graveyard.filter((c) => c !== me && !opts[k].includes(c)); z.exile.push(...opts[k]);
        me.tapped = true; me.sick = true;
        enter(s, me, { side: ctx.side }, ev);
      }
    }
    // Incinerator of the Guilty: "you may collect evidence X. When you do, this creature deals X damage to each creature
    // and planeswalker that player controls."
    if (eff.incinerate) {
      const z = s[ctx.side], all = evidenceSets(z.graveyard, 1);
      const k = all.length ? choose(s, "Collect evidence X?", [...all.map((l) => `Exile ${l.map((c) => c.name).join(", ")} (X=${l.reduce((t, c) => t + manaValue(faceOf(c, {}).cost), 0)})`), "Don't"], ctx.side) : 0;
      if (k < all.length) {
        const x = all[k].reduce((t, c) => t + manaValue(faceOf(c, {}).cost), 0);
        z.graveyard = z.graveyard.filter((c) => !all[k].includes(c)); z.exile.push(...all[k]);
        const src = find(s, ctx.selfId) || ctx.src;
        s[ctx.side === "player" ? "opponent" : "player"].battlefield.filter((c) => isCreature(c) || isPlaneswalker(c)).forEach((c) => dealDamage(s, src, ctx.side, c.id, x, ev));
      }
    }
    // Mosswood Dreadknight: "When this creature dies, you may cast it from your graveyard as an Adventure until the end of your next turn"
    if (eff.graveAdventure) { const c = s[ctx.side].graveyard.find((x) => x.id === ctx.selfId); if (c) c.graveAdventure = true; }
    // Virtue of Courage: "you may exile that many cards from the top of your library. You may play those cards this turn."
    if (eff.mayImpulseEvent && ctx.side === "player") {
      const n = (ctx.event && ctx.event.count) || 0;
      if (n && choose(s, `Exile the top ${n} cards of your library (you may play them this turn)?`, ["Exile them", "Don't"], "player") === 0) applyEffect(s, { impulseAll: n }, undefined, ctx, ev);
    }
    // "gets -X/-X until end of turn, where X is the amount of life you gained this turn"
    if (eff.pumpLifeGained && tgt) { const n = s.lifeGainedTotal || 0; addMod(s, tgt, [eff.pumpLifeGained[0] * n, eff.pumpLifeGained[1] * n]); }
    // "Choose a number between 0 and 10. Destroy all creatures with power greater than or equal to the chosen number."
    if (eff.expel) {
      const k = choose(s, "Choose a number", Array.from({ length: 11 }, (_, i) => String(i)), ctx.side);
      const before = s.listens.length ? battlefieldNow(s) : null;
      battlefieldNow(s).map(({ card }) => card).filter((c) => isCreature(c) && power(c) >= k && !survivesDestroy(s, c, ev)).forEach((c) => leave(s, c, "graveyard", ev, { lookBack: before }));
    }
    // "exile up to one other target creature until this creature leaves the battlefield" (it returns when this leaves)
    if (eff.exileUntilLeaves && tgt) {
      const card = tgt.token ? null : tgt, owner = tgt.owner || sideOf(s, tgt), me = find(s, ctx.selfId);
      leave(s, tgt, "exile", ev);
      const ex = card && s[owner].exile.find((x) => x.id === card.id);
      if (ex) { if (me) ex.exiledUntil = me.id; else returnExiledCard(s, ex, owner, ev); }   // (already gone: right back)
    }
    // "For each creature your opponents control, create a Cursed Role token attached to that creature"
    if (eff.roleEachOpp) s[ctx.side === "player" ? "opponent" : "player"].battlefield.filter(isCreature)
      .forEach((c) => createToken(s, { ...ROLES[eff.roleEachOpp], attachedTo: c.id, roleSeq: s.nextId }, ctx.side, ev));
    // "Sacrifice any number of artifacts, enchantments, and/or tokens" (one yes/no each; ctx.sacCount: how many)
    if (eff.sacrificeAny) {
      const list = s[ctx.side].battlefield.filter((c) => eff.sacrificeAny === "any" || isArtifact(c) || typeHas(c, /enchantment/i) || c.token);
      const go = list.filter((c) => choose(s, `Sacrifice ${c.name}?`, ["Keep it", "Sacrifice it"], ctx.side, c.id) === 1);
      const before = s.listens.length ? battlefieldNow(s) : null;
      go.forEach((c) => leave(s, c, "graveyard", ev, { sacrificed: true, lookBack: before }));
      ctx.sacCount = go.length;
    }
    // "Return that many creature cards from your graveyard to the battlefield" (chosen one at a time)
    if (eff.reanimateCount) for (let i = 0; i < (eff.reanimateCount === "sacrificedCount" ? ctx.sacCount || 0 : eff.reanimateCount); i++) applyEffect(s, { reanimateChoice: {} }, undefined, ctx, ev);
    // "Each player discards two cards / loses 4 life / sacrifices two creatures of their choice"
    if (eff.eachDiscards) {
      for (let i = 0; i < eff.eachDiscards && s.player.hand.length; i++) discardCard(s, s.player.hand[choose(s, "Discard which card?", s.player.hand.map((c) => c.name), "player", s.player.hand.map((c) => c.id))], ev);
      applyEffect(s, { discard: eff.eachDiscards }, "opp", { ...ctx, side: "player" }, ev);
    }
    if (eff.eachLoses) { changeLife(s, "you", -eff.eachLoses, ev); changeLife(s, "opp", -eff.eachLoses, ev); }
    if (eff.eachSacrificesN) for (let i = 0; i < eff.eachSacrificesN; i++) applyEffect(s, { eachSacrifices: true }, undefined, ctx, ev);
    // "you may exile one or more creature cards from your graveyard. When you do, each other creature gets -X/-X …"
    if (eff.exileCreatureCardsThen) {
      const z = s[ctx.side];
      let k = 0;
      for (const card of z.graveyard.filter((c) => isCreature(faceOf(c, {})))) {
        if (choose(s, `Exile ${card.name} from your graveyard?`, ["Exile it", "Keep it"], ctx.side, card.id) !== 0) continue;
        z.graveyard = z.graveyard.filter((c) => c !== card); z.exile.push(card); k++;
      }
      if (k) battlefieldNow(s).map(({ card }) => card).filter((c) => isCreature(c) && c.id !== ctx.selfId).forEach((c) => addMod(s, c, [-k, -k]));
    }
    // "Then you may sacrifice it. If you do, …" (this permanent)
    if (eff.maySacSelf) {
      const me = find(s, ctx.selfId);
      if (me && choose(s, `Sacrifice ${me.name}?`, ["Sacrifice it", "Don't"], ctx.side, me.id) === 0) {
        const then = JSON.parse(JSON.stringify(eff.maySacSelf.then).replace(/"selfSkewer"/g, String((me.counters || {}).skewer || 0)));
        leave(s, me, "graveyard", ev, { sacrificed: true });
        applyEffect(s, then, target, ctx, ev);
      }
    }
    // "Mill seven cards. Then put a creature, enchantment, or land card from among the milled cards onto the battlefield"
    // (fromMilled: { filter, to: "battlefield" | "hand", all })
    if (eff.fromMilled) {
      const z = s[ctx.side], milled = z.graveyard.filter((c) => (ctx.milled || []).includes(c.id) && objectIs(faceOf(c, {}), eff.fromMilled.filter || {}));
      const picks = eff.fromMilled.all ? milled : eff.fromMilled.upTo ? ((n) => milled.filter((c) => n > 0 && choose(s, `Put ${c.name} ${eff.fromMilled.to === "hand" ? "into your hand" : "onto the battlefield"}?`, ["Put it", "Leave it"], ctx.side, c.id) === 0 && n-- > 0))(eff.fromMilled.upTo) : milled.length ? [milled[choose(s, "Which milled card?", milled.map((c) => c.name), ctx.side, milled.map((c) => c.id))]] : [];
      picks.forEach((card) => {
        z.graveyard = z.graveyard.filter((c) => c !== card);
        if (eff.fromMilled.to === "hand") z.hand.push(card); else { card.sick = true; enter(s, asFace(card, 0), { side: ctx.side }, ev); }
      });
    }
    // "Return all creatures to their owners' hands. For each opponent who controlled a creature returned this way, you create …"
    if (eff.bounceAllCreatures) {
      const theirs = s.opponent.battlefield.some(isCreature);
      const before = s.listens.length ? battlefieldNow(s) : null;
      battlefieldNow(s).map(({ card }) => card).filter((c) => isCreature(c) && !(eff.bounceAllCreatures.exceptTypes || []).some((t) => hasType(c, t))).forEach((c) => leave(s, c, "hand", ev, { lookBack: before }));
      if (theirs && eff.bounceAllCreatures.ifOpp) applyEffect(s, eff.bounceAllCreatures.ifOpp, undefined, ctx, ev);
    }
    // "Shuffle this card into your library from your graveyard" (after a shuffle no card of the library is known)
    if (eff.shuffleSelf) {
      const z = s[ctx.side], me = z.graveyard.find((c) => c.id === ctx.selfId);
      if (me) {
        z.graveyard = z.graveyard.filter((c) => c !== me);
        z.libraryCount = (z.libraryCount || 0) + 1 + z.library.length + z.libraryBottom.length;
        z.library = []; z.libraryBottom = [];
      }
    }
    // "sacrifice a creature or land" (you choose one of yours that fits; none: nothing)
    if (eff.sacrificeOne) {
      const list = s[ctx.side].battlefield.filter((c) => objectIs(c, eff.sacrificeOne) && matches(s, c, eff.sacrificeOne, ctx.side));
      if (list.length) leave(s, list[choose(s, "Sacrifice which?", list.map((c) => c.name), ctx.side, list.map((c) => c.id))], "graveyard", ev, { sacrificed: true });
    }
    // "You may put a land card from your hand onto the battlefield tapped"
    if (eff.mayPutLand && ctx.side === "player") {
      const lands = [...s.player.hand.filter((c) => !c.unknown && isLand(faceOf(c, {}))), ...(eff.fromGraveyardToo ? s.player.graveyard.filter((c) => isLand(faceOf(c, {}))) : [])];
      const k = lands.length ? choose(s, "Put a land from your hand onto the battlefield tapped?", [...lands.map((c) => `Put ${c.name}`), "Don't"], "player", [...lands.map((c) => c.id), null]) : lands.length;
      if (k < lands.length) { const l = lands[k]; s.player.hand = s.player.hand.filter((c) => c !== l); s.player.graveyard = s.player.graveyard.filter((c) => c !== l); if (!eff.fromGraveyardToo) l.tapped = true; enter(s, asFace(l, 0), { side: "player" }, ev); }
    }
    // "Remove up to three counters from target permanent" (one at a time, any kinds; you may stop)
    if (eff.removeUpTo && tgt) {
      for (let i = 0; i < eff.removeUpTo; i++) {
        const kinds = Object.keys(tgt.counters || {}).filter((k) => tgt.counters[k] > 0);
        if (!kinds.length) break;
        const k = choose(s, `Remove a counter from ${tgt.name} (${i + 1} of up to ${eff.removeUpTo})?`, [...kinds.map((x) => `Remove a ${x} counter`), "Stop"], ctx.side, tgt.id);
        if (k >= kinds.length) break;
        tgt.counters = { ...tgt.counters, [kinds[k]]: tgt.counters[kinds[k]] - 1 };
        changed(s);
      }
    }
    // "put a flying counter on each creature that convoked it"
    if (eff.convokers) {
      const me = find(s, ctx.selfId) || ctx.src || {};
      (me.convokedBy || []).map((id) => find(s, id)).filter(Boolean).forEach((c) => Object.entries(eff.convokers.counters).forEach(([k, n]) => addCounters(s, c, k, n, ev)));
    }
    // "Exile target card from a graveyard. If it was a creature card, …"
    if (eff.exileGraveyardCard) {
      for (const side of ["player", "opponent"]) {
        const card = s[side].graveyard.find((c) => c.id === target);
        if (!card) continue;
        s[side].graveyard = s[side].graveyard.filter((c) => c !== card);
        s[side].exile.push(card);
        if (eff.exileGraveyardCard.tracked) { card.exiledBy = ctx.selfId; changed(s); }   // ("cards exiled with this creature")
        noteExiled(s, [card], side === ctx.side ? "yourGy" : "theirGy", ev);
        if (eff.exileGraveyardCard.ifCreature && isCreature(faceOf(card, {}))) applyEffect(s, eff.exileGraveyardCard.ifCreature, undefined, ctx, ev);
      }
    }
    // Rankle and Torbran: "If a source would deal damage to a player or battle this turn, it deals that much damage plus 2 instead."
    if (eff.damagePlus2) s.damagePlus2 = (s.damagePlus2 || 0) + 1;
    // "Each player creates a Treasure token"; "Each player sacrifices a creature of their choice"
    if (eff.eachTreasure) ["player", "opponent"].forEach((side) => createToken(s, { name: "Treasure", type: "Token Artifact — Treasure", colors: [] }, side, ev));
    if (eff.eachSacrifices) ["player", "opponent"].forEach((side) => {
      const list = s[side].battlefield.filter(isCreature);
      if (list.length) leave(s, list[choose(s, `Sacrifice a creature (${side === "player" ? "you" : "the opponent"})`, list.map((c) => c.name), side, list.map((c) => c.id))], "graveyard", ev, { sacrificed: true });
    });
    // "Transform all Incubator tokens you control"
    if (eff.transformAll) s[ctx.side].battlefield.filter((c) => c.token && subtypes(c).includes(eff.transformAll) && !c.transformed).forEach((c) => transform(s, c, ev));
    // "you may exile five other cards from your graveyard. When you do, return target creature card …" (the target was
    // chosen first; the five are any others)
    if (eff.mayExileGraveyard) {
      const z = s[ctx.side], others = z.graveyard.filter((c) => c.id !== target);
      if (others.length >= eff.mayExileGraveyard.n && choose(s, `Exile ${eff.mayExileGraveyard.n} cards from your graveyard?`, ["Exile them", "Don't"], ctx.side) === 0) {
        const gone = [];                                              // (you choose them, one at a time)
        for (let i = 0; i < eff.mayExileGraveyard.n; i++) {
          const left = others.filter((c) => !gone.includes(c));
          gone.push(left[choose(s, `Exile a card from your graveyard (${i + 1} of ${eff.mayExileGraveyard.n})`, left.map((c) => c.name), ctx.side, left.map((c) => c.id))]);
        }
        z.graveyard = z.graveyard.filter((c) => !gone.includes(c));
        z.exile.push(...gone);
        applyEffect(s, eff.mayExileGraveyard.then, target, ctx, ev);
      }
    }
  }
  // The ways to collect evidence N from these graveyard cards: sets with total mana value N or more where every card is
  // needed (any total for N = 1: each nonempty set where every card is needed is a different X)
  function evidenceSets(cards, n) {
    const mv = (c) => manaValue(faceOf(c, {}).cost);
    return subsets(cards.filter((c) => mv(c) > 0)).filter((l) => { const t = l.reduce((a, c) => a + mv(c), 0); return l.length && t >= n && (n <= 1 || l.every((c) => t - mv(c) < n)); });
  }
  function returnExiledCard(s, x, side, ev) {
    s[side].exile = s[side].exile.filter((c) => c !== x);
    delete x.exiledUntil;
    x.sick = true;
    ev.push({ type: "returned", id: x.id });
    enter(s, x, { side: x.owner || side }, ev);
  }
  // "… in addition to its other types": add card types / subtypes to a type line
  function addTypes(type, add) {
    const [left, right = ""] = (type || "").split("—").map((x) => x.trim());
    const cardTypes = (add.types || []).filter((t) => !new RegExp(`\\b${t}\\b`, "i").test(left));
    const subs = (add.subtypes || []).filter((t) => !right.split(/\s+/).includes(t));
    const l = [left, ...cardTypes].join(" ").replace(/^Token (.*)$/, "Token $1");
    return subs.length || right ? `${l} — ${[right, ...subs].filter(Boolean).join(" ")}` : l;
  }

  // Sweepers and other effects on many things: { damageAll: { n, creatures: "all"|"opponent"|"yours", players:
  // "opp"|"each" }, destroyAll: { creatures }, untapAll: { creatures }, scry: n, surveil: n }
  function applyGlobal(s, eff, ctx, ev, then) {
    const pick = (who, ench) => (who === "opponent" ? s.opponent.battlefield : who === "yours" ? s.player.battlefield
      : [...s.player.battlefield, ...s.opponent.battlefield]).filter((c) => isCreature(c) || (ench && typeHas(c, /enchantment/i)));
    if (eff.damageAll) {
      const d = eff.damageAll;
      if (d.creatures) pick(d.creatures).forEach((c) => dealDamage(s, ctx.src, ctx.side, c.id, d.n, ev));
      // ("… and each planeswalker" / "each creature, planeswalker, and battle")
      if (d.walkers || d.battles) battlefieldNow(s).map(({ card }) => card).filter((c) => !isCreature(c) && ((d.walkers && isPlaneswalker(c)) || (d.battles && isBattle(c))))
        .forEach((c) => dealDamage(s, ctx.src, ctx.side, c.id, d.n, ev));
      if (d.players === "opp" || d.players === "each") dealDamage(s, ctx.src, ctx.side, "opp", d.n, ev);
      if (d.players === "each") dealDamage(s, ctx.src, ctx.side, "you", d.n, ev);
    }
    if (eff.destroyAll) {                                       // destroyed at the same time: one look-back (CR 603.10a)
      const before = battlefieldNow(s);
      // ("destroy all other creatures": not the tokens this effect just created — exceptCreated)
      const d0 = eff.destroyAll;   // ("destroy all tapped / untapped creatures", "all creatures with power 3 or greater")
      const doomed = pick(d0.creatures, d0.enchantments).filter((c) => !survivesDestroy(s, c, ev) && !(d0.exceptCreated && (ctx.created || []).includes(c.id)) &&
        (!d0.tapped || c.tapped) && (!d0.untapped || !c.tapped) && (d0.minPower == null || power(c) >= d0.minPower) &&
        (!d0.legendary || /\blegendary\b/i.test(c.type || "")) && (!d0.nonlegendary || !/\blegendary\b/i.test(c.type || "")));
      ctx.destroyed = [...(ctx.destroyed || []), ...doomed.map((c) => c.id)];
      doomed.forEach((c) => leave(s, c, "graveyard", ev, { lookBack: before }));
    }
    if (eff.untapAll) pick(eff.untapAll.creatures).forEach((c) => untap(s, c, ev));
    // CR 701.34a: proliferate — choose any number of permanents and/or players that have a counter, then give each
    // one an additional counter of each kind already there (one yes/no choice per candidate)
    // Tekuthal: "If you would proliferate, proliferate twice instead." (each one doubles again)
    if (eff.proliferate && !eff.proliferateOnce) { const n = 2 ** s[ctx.side].battlefield.filter((c) => c.proliferateTwice && !(c.st && c.st.lost)).length; if (n > 1) { for (let i = 0; i < n; i++) applyGlobal(s, { proliferate: true, proliferateOnce: true }, ctx, ev); return; } }
    if (eff.proliferate) {
      const counted = (c) => Object.values(c.counters || {}).some((n) => n > 0);
      const players = [["opp", s.opponent], ["you", s.player]].filter(([, z]) => (z.poison || 0) > 0);
      const perms = battlefieldNow(s).map(({ card }) => card).filter(counted);
      players.forEach(([who, z]) => {
        const label = who === "opp" ? "the opponent" : "you";
        if (choose(s, `Proliferate: ${label} (${z.poison} poison)?`, ["Add one", "Skip"], ctx.side) !== 0) return;
        const pn = counterMult(s, ctx.side);
        z.poison += pn;
        ev.push({ type: "poison", who, amount: pn });
      });
      perms.forEach((c) => {
        const kinds = Object.keys(c.counters).filter((k) => c.counters[k] > 0);
        if (choose(s, `Proliferate: ${c.name} (${kinds.map((k) => `${c.counters[k]} ${k}`).join(", ")})?`, ["Add one", "Skip"], ctx.side, c.id) !== 0) return;
        kinds.forEach((k) => addCounters(s, c, k, 1, ev));
        changed(s);
      });
      emit(s, { type: "proliferate", side: ctx.side }, ev);            // "whenever you proliferate"
    }
    // scry / surveil only matter for cards known to be on top of the library; you choose (a "scry" action)
    // (a choice made while the spell resolves: it comes before anything waiting to go on the stack)
    if (eff.scry) s.pending.unshift({ kind: "scry", n: eff.scry, mode: "scry", side: "player", name: "Scry", then });
    if (eff.surveil) s.pending.unshift({ kind: "scry", n: eff.surveil, mode: "surveil", side: "player", name: "Surveil", then });
  }

  // CR 701.44a: explore — reveal the top card of your library; a land goes to your hand; otherwise a +1/+1 counter on
  // the explorer, and you may put the revealed card into your graveyard. (An unknown card is treated as a nonland card
  // that stays: puzzles with explore list every card it can reveal; an empty library reveals nothing: the counter.)
  function explore(s, explorerId, side, ev) {
    const z = s[side];
    const top = z.library[0] || (!(z.libraryCount > 0) ? z.libraryBottom[0] : null);
    const me = find(s, explorerId);
    if (top && isLand(top)) {
      (z.library[0] === top ? z.library : z.libraryBottom).shift();
      z.hand.push(top);
      ev.push({ type: "explore-land", id: top.id });
    } else {
      if (me) addCounters(s, me, "+1/+1", 1, ev);
      if (top && choose(s, `Explore: put ${top.name} into your graveyard?`, ["Leave it on top", "Into the graveyard"], side, top.id) === 1) {
        (z.library[0] === top ? z.library : z.libraryBottom).shift();
        putCard(s, top, side, "graveyard");
      }
    }
    // CR 701.44b: it explored, whatever happened ("whenever a creature you control explores")
    emit(s, { type: "explores", obj: me || { id: explorerId }, side, land: !!(top && isLand(top)) }, ev);
  }
  // CR 701.57a: discover N — exile from the top until a nonland card with mana value N or less; you may cast it free
  // (a spell with one target: one option per target) or put it into your hand; the rest go to the bottom
  function discover(s, n, side, ev) {
    const z = s[side], exiled = [];
    let found = null;
    while (z.library.length || (!(z.libraryCount > 0) && z.libraryBottom.length)) {
      const c = z.library.length ? z.library.shift() : z.libraryBottom.shift();
      if (!isLand(c) && manaValue(c.cost) <= n) { found = c; break; }
      exiled.push(c);
    }
    z.libraryBottom.push(...exiled);                       // (their order on the bottom doesn't matter in a puzzle)
    if (!found) { ev.push({ type: "discover-nothing" }); return null; }
    if (!castFree(s, found, side, ev, { prompt: `Discover ${n}: ${found.name}`, decline: "Put it into your hand" }).cast) z.hand.push(found);
    emit(s, { type: "discovers", obj: { id: found.id }, side }, ev);
    return found;
  }
  // "You may cast it without paying its mana cost" while something resolves (CR 608.2g: right away, timing rules don't
  // apply; X is 0, CR 107.3b): the ways to cast it — one per mode and target (a spell that could have several targets
  // or divided damage: one target; one with two target slots can't be cast this way here)
  function freeCastOptions(s, card, side, face) {
    const base = face != null ? { face } : {}, f = faceOf(card, base);
    if (isLand(f)) return [];
    if (isPermanent(f) && !f.aura) return [{ a: base, label: "Cast it" }];
    const many = f.modes && manyModes(f), x = parseCost(f.cost).x ? { x: 0 } : {}, out = [];
    for (const mode of f.modes ? f.modes.map((_, i) => i) : [undefined]) {
      const a = { ...base, ...x, ...(mode == null ? {} : { mode: many ? [mode] : mode }) }, what = mode == null ? "Cast it" : `Cast it: ${f.modes[mode].text}`;
      const p = plan(f, a)[0] || {};
      // (a spell with two target slots, Awaken the Maelstrom's player and permanent: each combination of different targets)
      if (p.slots) {
        let combos = [[]];
        p.slots.forEach((sl) => { const ts = targetsFor(s, f, sl.targets, sl.filter, side); combos = combos.flatMap((c) => ts.filter((t) => !c.includes(t)).map((t) => [...c, t])); });
        combos.forEach((c) => out.push({ a: { ...a, target: many ? [c] : c }, label: `${what} → ${c.map((t) => nameIn(s, t)).join(", ")}` }));
        continue;
      }
      if (!p.targets) { out.push({ a, label: what }); continue; }
      const several = p.count && p.count.max > 1, wrap = (t) => (many ? [several ? [t] : t] : several ? [t] : t);
      if (p.count && p.count.min === 0) out.push({ a, label: `${what} (no target)` });
      targetsFor(s, f, p.targets, p.filter, side).forEach((t) => out.push({ a: { ...a, target: wrap(t), ...(p.effect && p.effect.divided ? { split: [p.total] } : {}) }, label: `${what} → ${nameIn(s, t)}` }));
    }
    return out;
  }
  // Offers the free cast of one of `cards` (or the other answers given: extra, then decline); a cast goes on the stack
  // now. zone: where the cards are (the one cast leaves it); face: the face cast (a Siege cast transformed); exileAfter:
  // "If that spell would be put into a graveyard, exile it instead"; bottomAfter: "… put it on the bottom of its
  // owner's library instead". Returns { cast: the card } or { other: index into [...extra, decline] }.
  function castFree(s, cards, side, ev, { zone, face, prompt, decline = "Don't cast it", extra = [], exileAfter, bottomAfter, copy, pay, anyMana } = {}) {
    const list = [].concat(cards || []);
    const costFor = (card, a) => { const c0 = reducedCost(s, faceOf(card, a), costOf(faceOf(card, a), a), a); return anyMana ? anyColorCost(c0) : c0; };
    const opts = list.flatMap((card) => freeCastOptions(s, card, side, face).map((o) => ({ ...o, card, label: list.length > 1 ? `${card.name}: ${o.label}` : o.label })))
      .filter((o) => !pay || !!bestPayment(s, costFor(o.card, o.a), { forWhat: { spell: faceOf(o.card, o.a) } }));   // (paying its cost: only what you can pay for)
    if (!opts.length && !extra.length) return { other: 0 };
    const pick = choose(s, prompt || (list.length === 1 ? `Cast ${list[0].name} without paying its mana cost?` : "Cast a spell without paying its mana cost?"),
      [...opts.map((o) => o.label), ...extra, decline], side, [...opts.map((o) => o.card.id), ...extra.map(() => null), null]);
    if (pick >= opts.length) return { other: pick - opts.length };
    const card = opts[pick].card;
    if (pay) spend(s, bestPayment(s, costFor(card, opts[pick].a), { forWhat: { spell: faceOf(card, opts[pick].a) } }), ev);
    if (zone) { const owner = card.owner || side; s[owner][zone] = s[owner][zone].filter((c) => c.id !== card.id); }
    const a = { type: "cast", id: card.id, ...opts[pick].a }, f = faceOf(card, a);
    card.castFromExile = zone === "exile"; if (zone !== "exile") delete card.inExile;
    s.stack.unshift({ kind: "spell", name: f.name, id: card.id, a, card, ...(exileAfter ? { exileAfter: true } : {}), ...(bottomAfter ? { bottomAfter: true } : {}), ...(copy ? { copy: true } : {}) });
    ev.push({ type: "cast", id: card.id, target: a.target });
    emit(s, { type: "cast", obj: f, side, targetCount: new Set([a.target].flat(3).filter((t) => t != null)).size, spellNumber: countSpell(s, side), x: a.x,
      fromHand: zone === "hand", fromExile: zone === "exile" }, ev);
    commitCrime(s, a.target, side, ev);
    return { cast: card };
  }

  // CR 702.174d-h: the gift the opponent gets (the opponent never uses a Food or Treasure; a Fish arrives tapped; a card
  // is one more unknown card in their hand)
  const FISH = { name: "Fish", type: "Token Creature — Fish", pt: "1/1", colors: ["U"], tapped: true };
  function giveGift(s, gift, ev) {
    if (gift === "card") { s.opponent.handCount = (s.opponent.handCount || 0) + 1; s.opponent.libraryCount = Math.max(0, (s.opponent.libraryCount || 0) - 1); }
    else createToken(s, gift === "Fish" ? FISH : gift === "Food" ? FOOD : { name: "Treasure", type: "Token Artifact — Treasure", colors: [] }, "opponent", ev);
    ev.push({ type: "gift", gift });
  }

  // "Exile the top N cards of your library. Choose one of them. You may play that card this turn." The chosen card is
  // marked playable in exile (cast or played from there, following the normal timing rules); unknown cards stay
  // unknown and can't be chosen to any effect (puzzles list the cards it can reach)
  function impulse(s, n, side, ev) {
    const z = s[side], known = [];
    for (let i = 0; i < n; i++) {
      const c = z.library.shift() || (!(z.libraryCount > 0) ? z.libraryBottom.shift() : null);
      if (c) known.push(c);
      else if (z.libraryCount > 0) z.libraryCount--;
    }
    known.forEach((c) => z.exile.push(c));
    ev.push({ type: "impulse", ids: known.map((c) => c.id) });
    if (!known.length) return;
    const pick = choose(s, "Choose the card you may play this turn", known.map((c) => c.name), side, known.map((c) => c.id));
    known[pick].playable = true;
  }

  // You discard a card from your hand (CR 701.9a): it goes to your graveyard, remembering it was discarded this turn
  // (mayhem, CR 702.187b), and "whenever you discard" abilities trigger (also for a cost); `first` emits events that
  // happen with it (a cycled card's "when you cycle")
  function discardCard(s, card, ev, first) {
    s.player.hand = s.player.hand.filter((c) => c !== card);
    const to = replaceMove(s, card, "hand", "graveyard", "player");
    putCard(s, card, "player", to);
    if (to === "graveyard") card.discardedThisTurn = true;
    ev.push({ type: "discarded", id: card.id });
    if (first) first();
    s.discardBatch = { ...(s.discardBatch || {}), [s.evBatch || 0]: ((s.discardBatch || {})[s.evBatch || 0] || 0) + 1 };
    emit(s, { type: "discard", obj: card, side: "player", count: 1, batch: s.evBatch || 0, batchNo: s.evBatch || 0 }, ev);
  }

  // A library is: known cards on top (library), then unknown, irrelevant cards (libraryCount), then known
  // cards put on the bottom (libraryBottom, e.g. by scry). An unknown card can't be used.
  function draw(s, side, n, ev) {
    const z = s[side];
    // Quantum Riddler: "As long as you have one or fewer cards in hand, if you would draw one or more cards, you draw that many cards plus one instead."
    if (n > 0 && z.hand.length <= 1) n += z.battlefield.filter((c) => c.riddler && !(c.st && c.st.lost)).length;
    // Bard, King of Dale: "If you would draw a card except the first one you draw in each of your draw steps, draw two cards instead." (the puzzle is past the draw step)
    if (n > 0) n *= 2 ** z.battlefield.filter((c) => c.bardDraws && !(c.st && c.st.lost)).length;
    for (let i = 0; i < n; i++) {
      // (cards drawn this turn, per player: "whenever an opponent draws their second card each turn", Heliod's cost reduction)
      if (side === "player" && maxSpeed(s, "player") && s.player.battlefield.some((c) => c.vnwxt && !(c.st && c.st.lost)) && !s.vnwxtDrawing) { s.vnwxtDrawing = true; draw(s, side, 2, ev); delete s.vnwxtDrawing; continue; }
      s.drawn = { ...(s.drawn || {}), [side]: ((s.drawn || {})[side] || 0) + 1 };
      emit(s, { type: "draws", side, count: s.drawn[side] }, ev);
      const known = z.library.shift() || (!(z.libraryCount > 0) ? z.libraryBottom.shift() : null);
      if (known) {
        known.owner = side;
        if (side === "player") z.hand.push(known); else { z.hand.push(known); z.handCount = (z.handCount || 0) + 1; }
        continue;
      }
      z.libraryCount = Math.max(0, (z.libraryCount || 0) - 1);
      if (side === "player") z.hand.push({ id: `drawn-${s.nextId++}`, name: "Unknown card", type: "Card", unknown: true,
        text: "An unknown card from your library. Only the known cards on top of a library are part of the puzzle, so this one can't be used." });
      else z.handCount = (z.handCount || 0) + 1;
    }
    ev.push({ type: "draw", side, amount: n });
  }

  // A token: { name, type, pt, kw, colors, count, tapped, attacking } ("tapped and attacking" joins combat
  // without having been declared as an attacker, so attack triggers don't fire for it)
  // CR 701.53b: an Incubator token is double-faced: a colorless Incubator artifact with "{2}: Transform this token.",
  // and on the back a 0/0 colorless Phyrexian artifact creature named "Phyrexian Token"
  const INCUBATOR_FRONT = { name: "Incubator", type: "Token Artifact — Incubator", colors: [],
    abilities: [{ cost: "{2}", effect: { transform: true, self: true }, text: "{2}: Transform this token" }],
    text: "{2}: Transform this token. (It transforms into a 0/0 Phyrexian artifact creature.)" };
  const INCUBATOR = { ...INCUBATOR_FRONT, layout: "transform",
    faces: [INCUBATOR_FRONT, { name: "Phyrexian Token", type: "Token Artifact Creature — Phyrexian", pt: "0/0", colors: [], text: "" }] };
  // CR 111.10b: a Food token
  const FOOD = { name: "Food", type: "Token Artifact — Food", colors: [],
    abilities: [{ cost: "{2}", tap: true, sacSelf: true, effect: { gainLife: 3 }, text: "{2}, {T}, Sacrifice this token: You gain 3 life" }],
    text: "{2}, {T}, Sacrifice this token: You gain 3 life." };
  // CR 111.10f: a Clue token
  const CLUE = { name: "Clue", type: "Token Artifact — Clue", colors: [],
    abilities: [{ cost: "{2}", sacSelf: true, effect: { draw: 1 }, text: "{2}, Sacrifice: Draw a card" }],
    text: "{2}, Sacrifice this token: Draw a card." };
  // OTJ's Mercenary token: a 1/1 red Mercenary with "{T}: Target creature you control gets +1/+0. Activate only as a sorcery."
  const MERCENARY = { name: "Mercenary", type: "Token Creature — Mercenary", pt: "1/1", colors: ["R"],
    abilities: [{ tap: true, sorcery: true, targets: "creature", filter: { controller: "you" }, effect: { pump: [1, 0] }, text: "{T}: Target creature you control gets +1/+0" }],
    text: "{T}: Target creature you control gets +1/+0 until end of turn. Activate only as a sorcery." };
  // CR 111.10s: a Map token
  const MAP = { name: "Map", type: "Token Artifact — Map", colors: [],
    abilities: [{ cost: "{1}", tap: true, sacSelf: true, sorcery: true, targets: "creature", filter: { controller: "you" }, effect: { explore: 1 },
      text: "{1}, {T}, Sacrifice: target creature you control explores" }],
    text: "{1}, {T}, Sacrifice this token: Target creature you control explores. Activate only as a sorcery." };
  // DFT's Pilot token: a 1/1 colorless Pilot that "saddles Mounts and crews Vehicles as though its power were 2 greater"
  const PILOT = { name: "Pilot", type: "Token Creature — Pilot", pt: "1/1", colors: [], crewBonus: 2,
    text: "This token saddles Mounts and crews Vehicles as though its power were 2 greater." };
  // CR 111.10j-r: Role tokens — colorless Aura Role enchantment tokens with enchant creature (eff.role: the name)
  const role = (name, stat, text, extra = {}) => ({ name, type: "Token Enchantment — Aura Role", colors: [], aura: { targets: "creature", static: stat }, text, ...extra });
  const ROLES = {
    Cursed: role("Cursed", { setBase: [1, 1] }, "Enchant creature. Enchanted creature has base power and toughness 1/1."),
    Monster: role("Monster", { pump: [1, 1], grant: ["trample"] }, "Enchant creature. Enchanted creature gets +1/+1 and has trample."),
    Royal: role("Royal", { pump: [1, 1], grant: ["ward 1"] }, "Enchant creature. Enchanted creature gets +1/+1 and has ward {1}."),
    Sorcerer: role("Sorcerer", { pump: [1, 1] }, "Enchant creature. Enchanted creature gets +1/+1 and has \"Whenever this creature attacks, scry 1.\"",
      { triggers: [{ on: "attacks", enchanted: true, effect: { scry: 1 } }] }),
    Wicked: role("Wicked", { pump: [1, 1] }, "Enchant creature. Enchanted creature gets +1/+1. When this token is put into a graveyard from the battlefield, each opponent loses 1 life.",
      { triggers: [{ on: "leaves", self: true, toZone: "graveyard", effect: { lifeLoss: 1, to: "opp" } }] }),
    "Young Hero": role("Young Hero", {}, "Enchant creature. Enchanted creature has \"Whenever this creature attacks, if its toughness is 3 or less, put a +1/+1 counter on it.\"",
      { triggers: [{ on: "attacks", enchanted: true, if: { maxToughness: 3 }, effect: { counters: { "+1/+1": 1 }, to: "eventObject" } }] })
  };
  // The Jace token "empower Jace" creates: a blue Jace planeswalker with "[−1]: Surveil 1" and "[−3]: Draw a card"
  const JACE = { name: "Jace", type: "Token Planeswalker — Jace", colors: ["U"], abilities: [
    { loyalty: -1, effect: { surveil: 1 }, text: "−1: Surveil 1" }, { loyalty: -3, effect: { draw: 1 }, text: "−3: Draw a card" }] };
  // Loyalty counters put on a planeswalker (by an effect, or a loyalty ability's + cost, CR 606.4): "whenever you put one
  // or more loyalty counters on a planeswalker" (Inspired Tethermage)
  function addLoyalty(s, p, n, side, ev, quiet = false) {
    if (!(n > 0)) return;
    p.counters = { ...(p.counters || {}), loyalty: loyaltyOf(p) + n };
    ev.push({ type: "counters", id: p.id, counters: { loyalty: n } });
    if (!quiet) emit(s, { type: "loyaltyUp", obj: p, side }, ev);
  }
  // (CR 614.1a: "If one or more tokens would be created under your control, twice that many of those tokens are created
  // instead" — doublesTokens, Mondrak; each such permanent doubles again. Returns the first token made.)
  // Counters put on a permanent (CR 122.6). Ozolith, the Shattered Spire (plusOneMore): "If one or more +1/+1 counters
  // would be put on an artifact or creature you control, that many plus one … are put on it instead" (each one adds
  // one). "Whenever one or more +1/+1 counters are put on this creature" triggers on countersPut. side: whose it is (a
  // permanent still entering isn't on the battlefield yet). Returns how many were put on.
  // Innkeeper's Talent level 3 doubles counters put on a player too (poison counters): by whom they're put (putter)
  const counterMult = (s, putter) => 2 ** s[putter].battlefield.filter((o) => o.doublesCounters && levelOf(o) >= 3 && !(o.st && o.st.lost)).length;
  const ozolithBonus = (s, side, c) => (isArtifact(c) || isCreature(c) ? s[side].battlefield.filter((o) => o.plusOneMore && !(o.st && o.st.lost)).length : 0) +
    (isCreature(c) || isVehicle(c) ? s[side].battlefield.filter((o) => o.caradora && !(o.st && o.st.lost)).length : 0) +
    (isCreature(c) ? s[side].battlefield.filter((o) => o.plusOneMoreCreature && !(o.st && o.st.lost)).length : 0);   // (Michelangelo, Weirdness to 11)
  function addCounters(s, c, kind, n, ev, side) {
    if (!(n > 0) || !c) return 0;
    const who = side || (find(s, c.id) ? sideOf(s, c) : null);
    if (kind === "+1/+1" && who) n += ozolithBonus(s, who, c);
    if (who) n *= 2 ** s[who].battlefield.filter((o) => o.doublesCounters && levelOf(o) >= 3 && !(o.st && o.st.lost)).length;   // (Innkeeper's Talent, level 3)
    // Loading Zone: "If one or more counters would be put on a creature, Spacecraft, or Planet you control, twice that many …"
    if (who && (isCreature(c) || subtypes(c).some((t) => t === "Spacecraft" || t === "Planet"))) n *= 2 ** s[who].battlefield.filter((o) => o.loadingZone && !(o.st && o.st.lost)).length;
    if (who && kind === "+1/+1" && isCreature(c)) n *= 2 ** s[who].battlefield.filter((o) => o.earthCrystal && !(o.st && o.st.lost)).length;   // (The Earth Crystal)
    c.counters = { ...(c.counters || {}), [kind]: ((c.counters || {})[kind] || 0) + n };
    if (KW_COUNTERS.includes(kind)) c.kwTs = { ...(c.kwTs || {}), [kind]: stamp(s) || 0 };
    if (KW_COUNTERS.includes(kind) || kind === "charge") changed(s);   // (a keyword counter changes its abilities)
    ev.push({ type: "counters", id: c.id, counters: { [kind]: n } });
    if (find(s, c.id)) emit(s, { type: "countersPut", obj: c, side: who, kind, count: n }, ev);
    // CR 714.2b: lore counters put on a Saga (by its own ability, or proliferated) trigger the chapter abilities they reach
    if (kind === "lore" && c.chapters && find(s, c.id)) emit(s, { type: "lore", obj: c, side: who, before: c.counters.lore - n, after: c.counters.lore }, ev);
    return n;
  }
  const createToken = (s, spec, side, ev) => createTokens(s, spec, side, ev)[0];
  function createTokens(s, spec, side, ev) {
    // Draconic Visitor: "If one or more artifact tokens would be created under your control, that many 5/5 red Dragon
    // creature tokens with flying are created instead." (applied first: the Dragons are what the doublers see)
    if (/artifact/i.test(spec.type || "") && s[side].battlefield.some((c) => c.draconicVisitor && !(c.st && c.st.lost)))
      spec = { name: "Dragon", type: "Token Creature — Dragon", pt: "5/5", colors: ["R"], kw: ["flying"] };
    const moon = s[side].battlefield.find((c) => c.moonlit && c.attachedTo && find(s, c.attachedTo) && !(s.moonlitUsed || []).includes(c.id) && !(c.st && c.st.lost));
    if (moon) { s.moonlitUsed = [...(s.moonlitUsed || []), moon.id]; if (choose(s, `${moon.name}: create copies of ${find(s, moon.attachedTo).name} instead?`, ["Copies instead", "The tokens as they are"], side, moon.id) === 0) spec = copyValues(find(s, moon.attachedTo)); }
    const doublers = s[side].battlefield.filter((c) => c.doublesTokens && !(c.st && c.st.lost)).length;
    // (Ojer Taq: "If one or more creature tokens would be created under your control, three times that many …")
    const triplers = /creature/i.test(spec.type || "") ? s[side].battlefield.filter((c) => c.triplesCreatureTokens && !(c.st && c.st.lost)).length : 0;
    return Array.from({ length: 2 ** doublers * 3 ** triplers }, () => makeToken(s, spec, side, ev));
  }
  function makeToken(s, spec, side, ev) {
    const t = { ...clone(spec), token: true, owner: side, id: `${slug(spec.name)}-t${s.nextId++}` };
    ["count", "attacking", "exileAtEnd", "sacrificeAtEnd"].forEach((k) => delete t[k]);
    if (!isLand(t)) t.sick = !has(t, "haste");
    // (a token created with +1/+1 counters — an Incubator — enters with them: Ozolith adds one)
    if (t.counters && t.counters["+1/+1"] > 0) t.counters = { ...t.counters, "+1/+1": t.counters["+1/+1"] + ozolithBonus(s, side, t) };
    ev.push({ type: "token", id: t.id });
    enter(s, t, { side }, ev);
    if (spec.attacking && s.combat && side === "player") {
      s.combat.attackers.push(t.id);
      if (s.combat.blocks) { s.combat.blocks[t.id] = []; s.combat.blocked[t.id] = false; }   // after blocks: unblocked
    }
    // "Exile it / Sacrifice it at the beginning of the next end step" (a delayed trigger, CR 603.7)
    if (spec.exileAtEnd || spec.sacrificeAtEnd) delay(s, spec.exileAtEnd ? "exileIt" : "sacrificeIt", side, t.name, t.id, t.id);
    return t;
  }

  // Every way onto the battlefield goes through here: a land played, a permanent spell resolving, a token created,
  // a card put onto the battlefield from a graveyard. CR 614.12 / 113.6h: "enters tapped", "enters with counters"
  // and "pay life or it enters tapped" change how it enters (you may pay life only if you have it, CR 119.4).
  // CR 603.6a: then every permanent on the battlefield, the newcomer included, is checked for enters triggers.
  // "Choose a creature type": the types among the creature cards you know about (yours, everywhere), as the choices
  function chooseCreatureType(s, side, about) {
    const z = s[side], types = [...new Set([...z.battlefield, ...z.hand, ...z.graveyard, ...(z.library || [])].map((c) => faceOf(c, {})).filter(isCreature).flatMap(subtypes))].sort();
    return types.length ? types[choose(s, "Choose a creature type", types, side, about && about.id)] : null;
  }
  function enter(s, perm, { x, payLife, lifePips, side = "player" } = {}, ev) {
    // Kitnap: "You control enchanted creature." (for as long as it's attached: see sba)
    if (perm.controlsEnchanted && perm.attachedTo && side === "player") { const h = s.opponent.battlefield.find((c) => c.id === perm.attachedTo); if (h) { s.opponent.battlefield = s.opponent.battlefield.filter((c) => c !== h); s.player.battlefield.push(h); h.controlledByAura = perm.id; changed(s); } }
    // ("if one or more of them entered from exile or was cast from exile": it was in exile, or a spell cast from there)
    const fromExile = !!(perm.inExile || perm.castFromExile);
    delete perm.inExile; delete perm.castFromExile;
    // "it enters with a finality counter on it (and is a Vampire in addition to its other types)"
    if (perm.finalityOnEnter) { perm.counters = { ...(perm.counters || {}), finality: ((perm.counters || {}).finality || 0) + 1 }; if (typeof perm.finalityOnEnter === "string") perm.type = addTypes(perm.type, { subtypes: [perm.finalityOnEnter] }); delete perm.finalityOnEnter; }
    if (perm.gyMark) { delete perm.gyMark; if (jailed(s)) { s[perm.owner || side].graveyard.push(perm); ev.push({ type: "prevented", id: perm.id }); return; } }
    if (side === "player" && isCreature(perm)) s.creaturesEnteredYours = (s.creaturesEnteredYours || 0) + 1;   // (Kinbinding)
    // Wildgrowth Archaic: "that creature enters with X additional +1/+1 counters on it" (set while it was a spell)
    // devour land N: "As this creature enters, you may sacrifice any number of lands. It enters with N times that many +1/+1 counters." (tapped lands first)
    if (perm.arachne && !perm.chosenCardType) { const ts = ["Artifact", "Battle", "Enchantment", "Instant", "Land", "Planeswalker", "Sorcery"]; perm.chosenCardType = ts[choose(s, `${perm.name}: choose a card type other than creature`, ts, side, perm.id)]; }
    // Multiversal Passage: "As this land enters, choose a basic land type. Then you may pay 2 life. If you don't, it enters tapped. This land is the chosen type."
    if (perm.chooseBasicType) {
      const ts = ["Plains", "Island", "Swamp", "Mountain", "Forest"], k = choose(s, `${perm.name}: choose a basic land type`, ts, side, perm.id);
      perm.type = `Land â€” ${ts[k]}`; perm.produces = "WUBRG"[k]; delete perm.chooseBasicType;
      if (side === "player" && canPayLife(s, 2) && choose(s, `${perm.name}: pay 2 life?`, ["Pay 2 life", "It enters tapped"], side, perm.id) === 0) payLifeNow(s, 2, ev); else perm.tapped = true;
    }
    if (perm.scarletSave && perm.webSlungMV) perm.counters = { ...(perm.counters || {}), "+1/+1": ((perm.counters || {})["+1/+1"] || 0) + perm.webSlungMV };   // (Scarlet Spider: "the mana value of the returned creature")
    // riot (CR 702.136a): "enters with your choice of a +1/+1 counter or haste" (Spider-Punk: "Other Spiders you control have riot.")
    if (isCreature(perm) && (has(perm, "riot") || (hasType(perm, "Spider") && s[side].battlefield.some((c) => c.spiderPunk && !(c.st && c.st.lost))))) {
      if (choose(s, `${perm.name}: riot`, ["A +1/+1 counter", "Haste"], side, perm.id) === 0) perm.counters = { ...(perm.counters || {}), "+1/+1": ((perm.counters || {})["+1/+1"] || 0) + 1 }; else perm.riotHaste = true;
    }
    if (perm.devourLand && side === "player") {
      const ls = s.player.battlefield.filter(isLand).sort((x, y) => (y.tapped ? 1 : 0) - (x.tapped ? 1 : 0));
      const k = ls.length ? choose(s, `${perm.name}: devour how many lands?`, ls.map((_, i) => String(i)).concat(String(ls.length)), side, perm.id) : 0;
      ls.slice(0, k).forEach((l) => leave(s, l, "graveyard", ev, { sacrificed: true }));
      if (k) perm.counters = { ...(perm.counters || {}), "+1/+1": ((perm.counters || {})["+1/+1"] || 0) + perm.devourLand * k };
    }
    if (perm.countersFromSpent && perm.spentToCast) perm.counters = { ...(perm.counters || {}), "+1/+1": ((perm.counters || {})["+1/+1"] || 0) + perm.spentToCast };   // (Dyadrine: "the amount of mana spent to cast it")
    // Bioengineered Future: "Each creature you control enters with an additional +1/+1 counter on it for each land that entered the battlefield under your control this turn."
    if (isCreature(perm) && s.landsEnteredYours && side === "player") { const n = s.player.battlefield.filter((c) => c.bioFuture && !(c.st && c.st.lost)).length * s.landsEnteredYours; if (n) perm.counters = { ...(perm.counters || {}), "+1/+1": ((perm.counters || {})["+1/+1"] || 0) + n }; }
    if (isLand(perm) && side === "player") s.landsEnteredYours = (s.landsEnteredYours || 0) + 1;
    if (perm.bonusCounters) { perm.counters = { ...(perm.counters || {}), "+1/+1": ((perm.counters || {})["+1/+1"] || 0) + perm.bonusCounters }; delete perm.bonusCounters; }
    if (perm.evoked) s.triggered.push({ side, name: perm.name, srcId: perm.id, td: defId(EVOKE_SAC), event: { id: perm.id } });
    if (side === "player" && isCreature(perm) && hasType(perm, "Hero")) s.heroEntered = true;
    // Spider-Woman: "Artifacts and creatures your opponents control enter tapped."
    if (side === "opponent" && (isArtifact(perm) || isCreature(perm)) && s.player.battlefield.some((c) => c.oppEntersTapped && !(c.st && c.st.lost))) perm.tapped = true;
    // "You may have this creature enter as a copy of any creature on the battlefield, except …" (CR 614.1c, 707.5):
    // chosen as it enters; it enters as the copy, so the copied "enters" abilities and triggers apply
    const perm0Tapped = perm.entersAsCopy && perm.entersAsCopy.tapped;
    if (perm.entersAsCopy) {
      // (Echoing Deeps: "You may have this land enter tapped as a copy of any land card in a graveyard, except it's a Cave …")
      const options = perm.entersAsCopy.graveyardLand ? [...s.player.graveyard, ...s.opponent.graveyard].filter((c) => isLand(faceOf(c, {}))).map((c) => faceOf(c, {}))
        : perm.entersAsCopy.graveyardCreature ? [...s.player.graveyard, ...s.opponent.graveyard].filter((c) => isCreature(faceOf(c, {})))
        : perm.entersAsCopy.yoursArtifactOrCreature ? s[side].battlefield.filter((c) => isArtifact(c) || isCreature(c))
        : battlefieldNow(s).map(({ card }) => card).filter((c) => isCreature(c) && (!perm.entersAsCopy.maxMVSpent || manaValue(c.cost) <= (perm.spentToCast || 0)));
      const pick = choose(s, `${perm.name}: enter as a copy of ${perm.entersAsCopy.graveyardLand ? "a land card" : "a creature"}?`, ["Don't copy", ...options.map((c) => `Copy ${c.name}`)], side, [null, ...options.map((c) => c.id)]);
      if (pick > 0) {
        const keep = { id: perm.id, owner: perm.owner, sick: perm.sick };
        const chosen = options[pick - 1], v = copyValues(perm.entersAsCopy.graveyardCreature ? faceOf(chosen, {}) : chosen, perm.entersAsCopy.except);
        if (perm.entersAsCopy.graveyardCreature) for (const sd of ["player", "opponent"]) if (s[sd].graveyard.includes(chosen)) { s[sd].graveyard = s[sd].graveyard.filter((x) => x !== chosen); putCard(s, chosen, sd, "exile"); }
        Object.keys(perm).forEach((k) => delete perm[k]);
        Object.assign(perm, v, keep);
        if (perm0Tapped) perm.tapped = true;
      }
    }
    listen(s, perm);                                           // (a token is new to the puzzle)
    perm.owner = perm.owner || side;
    if (perm.entersTapped) perm.tapped = true;
    // "Creatures and nonbasic lands your opponents control enter tapped" (Thalia and The Gitrog Monster)
    const other = side === "player" ? "opponent" : "player";
    if ((isCreature(perm) || (isLand(perm) && !/\bbasic\b/i.test(perm.type || ""))) && s[other].battlefield.some((c) => c.oppEntersTapped && !(c.st && c.st.lost))) perm.tapped = true;
    if (perm.payLifeOrTapped) {
      if (payLife && side === "player" && canPayLife(s, perm.payLifeOrTapped)) payLifeNow(s, perm.payLifeOrTapped, ev);
      else perm.tapped = true;
    }
    // CR 306.5b: a planeswalker enters with loyalty counters equal to its printed loyalty
    // CR 310.4b: a battle enters with its printed number of defense counters
    if (isBattle(perm) && perm.defense != null) perm.counters = { ...(perm.counters || {}), defense: Number(perm.defense) };
    // CR 702.150a: compleated — two fewer for each Phyrexian pip paid with life
    if (isPlaneswalker(perm) && perm.loyalty != null) {
      const less = has(perm, "compleated") ? 2 * (lifePips || 0) : 0;
      perm.counters = { ...(perm.counters || {}), loyalty: Math.max(0, Number(perm.loyalty) - less) };
    }
    // "enters with two +1/+1 counters on it if …" (entersWithCountersIf: { if, counters }; Disappear)
    if (perm.entersWithCountersIf && conditionHolds(s, perm.entersWithCountersIf.if, side, perm)) {
      Object.entries(perm.entersWithCountersIf.counters).forEach(([k, n]) => { perm.counters = { ...(perm.counters || {}), [k]: ((perm.counters || {})[k] || 0) + n }; });
    }
    // a number means +1/+1 counters; an object names the kinds ("enters with two oil counters": { oil: 2 })
    if (perm.entersWithCounters) {
      const w = perm.entersWithCounters;
      const conv = Object.keys(perm.colorsSpent || {}).length;   // (converge: "a +1/+1 counter on it for each color of mana spent to cast it")
      const kinds = typeof w === "object" ? Object.fromEntries(Object.entries(w).map(([k, n]) => [k, n === "X" ? x || 0 : n === "threeMinusX" ? Math.max(0, 3 - (x || 0)) : n === "converge" ? conv : n])) : { "+1/+1": w === "X" ? x || 0 : w === "converge" ? conv : w };
      if (perm.entersTappedIfXMax != null && (x || 0) <= perm.entersTappedIfXMax) perm.tapped = true;   // (Slumbering Trudge: "If X is 2 or less, it enters tapped.")
      // (Ozolith applies to a permanent entering with counters too)
      Object.entries(kinds).forEach(([k, n]) => { if (n) perm.counters = { ...(perm.counters || {}), [k]: ((perm.counters || {})[k] || 0) + n + (k === "+1/+1" ? ozolithBonus(s, side, perm) : 0) }; });
    }
    perm.enteredThisTurn = true;                               // (power-up: "if this permanent entered this turn")
    if (x) perm.xPaid = x;
    if ((isCreature(perm) || isVehicle(perm)) && s[side].battlefield.some((c) => c.velocipede && c !== perm && !(c.st && c.st.lost))) {
      const k = s[side].battlefield.filter((c) => c.velocipede && !(c.st && c.st.lost)).length * (manaValue(perm.cost) <= 4 ? 1 : 3);
      perm.counters = { ...(perm.counters || {}), "+1/+1": ((perm.counters || {})["+1/+1"] || 0) + k };
    }
    if (isCreature(perm) && side === "player" && s.oppLostLife) { const g = s.player.battlefield.filter((c) => c.gev && !(c.st && c.st.lost)).length; if (g) perm.counters = { ...(perm.counters || {}), "+1/+1": ((perm.counters || {})["+1/+1"] || 0) + g }; }                                     // ("incubate 3 X times": the X paid to cast it)
    // "enters with two +1/+1 counters on it for each creature that convoked it"
    if (perm.countersPerConvoker && (perm.convokedBy || []).length) perm.counters = { ...(perm.counters || {}), "+1/+1": ((perm.counters || {})["+1/+1"] || 0) + perm.countersPerConvoker * perm.convokedBy.length + ozolithBonus(s, side, perm) };
    // CR 722.3a: "This creature enters prepared."
    if (perm.entersPrepared && perm.prepare) perm.prepared = true;
    // CR 714.3a: a Saga enters with a lore counter (its chapter I ability triggers, 714.2b)
    const sagaEnters = perm.chapters && !(perm.counters && perm.counters.lore);
    if (sagaEnters) perm.counters = { ...(perm.counters || {}), lore: 1 };
    perm.ts = stamp(s);                                        // CR 613.7d: a timestamp as it enters the zone
    if (side === "player" && !isLand(perm)) s.celebration = (s.celebration || 0) + 1;   // (for celebration)
    if (side === "player" && isArtifact(perm) && s.countsArtifacts) s.artifactsEntered = (s.artifactsEntered || 0) + 1;
    if (side === "player" && isLand(perm)) s.landEntered = true;
    if (side === "player" && hasType(perm, "Zombie")) s.zombiesEntered = (s.zombiesEntered || 0) + 1;   // (Geralf)
    // "This land enters tapped unless you control two or fewer other lands" (entersTappedUnless: { maxOtherLands })
    // impending: it enters with that many time counters (CR 702.176a)
    if (perm.chooseType) perm.chosenType = chooseCreatureType(s, side, perm);   // ("As this enters, choose a creature type")
    // Mimeoplasm: "As Mimeoplasm enters, exile up to X creature cards from your graveyard. It enters with three +1/+1 counters on it for each creature card exiled this way."
    if (perm.mimeoplasm && side === "player") {
      let n = 0;
      for (const c of s.player.graveyard.filter((x) => isCreature(faceOf(x, {})))) {
        if (n >= (x || perm.xPaid || 0)) break;
        if (choose(s, `${perm.name}: exile ${c.name}?`, ["Exile it", "Don't"], "player", c.id) !== 0) continue;
        s.player.graveyard = s.player.graveyard.filter((y) => y !== c); c.exiledBy = perm.id; putCard(s, c, "player", "exile"); n++;
      }
      if (n) perm.counters = { ...(perm.counters || {}), "+1/+1": ((perm.counters || {})["+1/+1"] || 0) + 3 * n };
    }
    // (Roaming Throne: "This creature is the chosen type in addition to its other types.")
    if (perm.isChosenType && perm.chosenType) perm.type = addTypes(perm.type, { subtypes: [perm.chosenType] });
    // ("As it enters, choose a color.": Sunken Citadel)
    if (perm.chooseColorOnEnter) perm.chosenColor = "WUBRG"[choose(s, `${perm.name}: choose a color`, ["White", "Blue", "Black", "Red", "Green"], side, perm.id)];
    if (perm.siegeModes) perm.siegeMode = choose(s, `${perm.name}: choose`, perm.siegeModes, side, perm.id);   // ("As this enchantment enters, choose Abzan or Mardu")
    if (perm.impendingNow) { delete perm.impendingNow; perm.counters = { ...(perm.counters || {}), time: perm.impending.n }; }
    // ("unless you control two or more other lands": minOtherLands)
    if (perm.entersTappedUnless && perm.entersTappedUnless.minOtherLands != null && s[side].battlefield.filter(isLand).length < perm.entersTappedUnless.minOtherLands) perm.tapped = true;
    if (perm.entersTappedUnless && perm.entersTappedUnless.maxOtherLands != null && s[side].battlefield.filter(isLand).length > perm.entersTappedUnless.maxOtherLands) perm.tapped = true;
    if (perm.entersTappedUnless && perm.entersTappedUnless.basic && !s[side].battlefield.some((l) => isLand(l) && /\bbasic\b/i.test(l.type || ""))) perm.tapped = true;   // ("unless you control a basic land")
    if (perm.entersTappedUnless && perm.entersTappedUnless.types && !s[side].battlefield.some((l) => isLand(l) && perm.entersTappedUnless.types.some((ty) => hasType(l, ty)))) perm.tapped = true;
    if (isLand(perm) && s[side].battlefield.some((c) => c.landsUntapped && !(c.st && c.st.lost))) perm.tapped = false;
    s[side].battlefield.push(perm);
    changed(s);
    if (perm.riotHaste) { delete perm.riotHaste; grant(perm, ["haste"], s); }
    emit(s, { type: "enters", obj: perm, side, batch: s.evBatch || 0, ...(fromExile ? { fromExile: true } : {}) }, ev);
    if (sagaEnters) emit(s, { type: "lore", obj: perm, side, before: 0, after: 1 }, ev);
  }

  // Ward N on a permanent of the opponent's: when your spell or ability targets it, ward triggers and
  // counters it unless you pay N. You always pay if you can. Returns false if it was countered.
  function payWard(s, target, ev, spellWard = false) {
    for (const id of [].concat(target || [])) {
      const t = id !== "opp" && id !== "you" ? find(s, id) : null;
      const n = t && sideOf(s, t) === "opponent" ? wardOf(t) : 0;
      const life = t && sideOf(s, t) === "opponent" ? wardLifeOf(t) : 0;   // ("Ward—Pay 2 life": "ward 0 life 2")
      // ("Ward—Sacrifice a creature.": the keyword "ward sacrifice": you sacrifice one of your creatures, if you have one)
      // ("Ward—Discard a card.")
      if (t && sideOf(s, t) === "opponent" && has(t, "ward discard")) {
        if (!s.player.hand.length) { ev.push({ type: "countered", by: "ward", id: t.id }); return false; }
        discardCard(s, s.player.hand[choose(s, "Ward: discard a card", s.player.hand.map((c) => c.name), "player", s.player.hand.map((c) => c.id))], ev);
      }
      if (t && sideOf(s, t) === "opponent" && has(t, "ward sacrifice")) {
        const mine = s.player.battlefield.filter(isCreature);
        if (!mine.length) { ev.push({ type: "countered", by: "ward", id: t.id }); return false; }
        leave(s, mine[choose(s, "Ward: sacrifice a creature", mine.map((c) => c.name), "player", mine.map((c) => c.id))], "graveyard", ev, { sacrificed: true });
      }
      if (!n && !life) continue;
      if (s.player.battlefield.some((c) => c.uncounterableSpells && !(c.st && c.st.lost)) && spellWard) continue;   // (Chimil)
      const pay = n ? bestPayment(s, `{${n}}`) : [];
      if (!pay || (life && !canPayLife(s, life))) { ev.push({ type: "countered", by: "ward", id: t.id }); return false; }
      spend(s, pay, ev);
      if (life) payLife(s, life, ev);
    }
    return true;
  }

  // Pay with the chosen sources: floating mana leaves the pool, Treasures are sacrificed, the rest tap.
  // Returns how many Treasures were sacrificed (their triggers resolve after the cost is paid).
  function spend(s, ids, ev) {
    let treasures = 0;
    ids.filter((id) => id.startsWith("pool:")).map((id) => Number(id.slice(5))).sort((x, y) => y - x).forEach((i) => s.pool.splice(i, 1));
    ids.filter((id) => id.startsWith("rpool:")).map((id) => Number(id.slice(6))).sort((x, y) => y - x).forEach((i) => s.rpool.splice(i, 1));
    s.firePool = (s.firePool || 0) - ids.filter((id) => id.startsWith("fire:")).length;
    if (!s.firePool) delete s.firePool;
    ids.filter((id) => id.startsWith("life:")).forEach(() => payLife(s, 2, ev));
    // every source this payment taps: those it uses directly, and those whose extra mana it uses ("id+n")
    const tapped = [...new Set(ids.filter((id) => !id.startsWith("pool:") && !id.startsWith("rpool:") && !id.startsWith("fire:") && !id.startsWith("life:")).map((id) => id.split("+")[0]))];
    tapped.forEach((id) => {
      const src = find(s, id);
      // one tap makes all its mana at once (CR 605.4a); what this payment doesn't use stays in your pool (CR 106.4)
      if (!ids.includes(id) && !isTreasure(src)) s.pool.push(produces(src));
      const used = ids.filter((x) => x.startsWith(id + "+")).map((x) => Number(x.slice(id.length + 1)) - 1);
      manaExtras(s, src).forEach((colors, k) => { if (!used.includes(k)) s.pool.push(colors); });
      if (isTreasure(src)) { leave(s, src, "graveyard", ev, { sacrificed: true }); treasures++; }   // its "sacrifice" cost
      else tap(s, src, ev);
      if (src.timeOnMana && ((src.counters || {}).time || 0) > 0) { src.counters = { ...src.counters, time: src.counters.time - 1 }; ev.push({ type: "counters", id: src.id, counters: { time: -1 } }); }
    });
    return treasures;
  }

  /* ---------- putting triggers on the stack and resolving it ---------- */
  // What happens whenever a player would receive priority, repeated until nothing changes:
  //   CR 704.3 / 603.3b: state-based actions, then the abilities that triggered go on the stack in APNAP order
  //     (the active player — you — first, so the opponent's end up on top and resolve first);
  //   CR 603.3d: targets are chosen as an ability goes on the stack (yours wait in s.pending for your choice;
  //     the opponent picks the one worst for you); with no legal target it's removed;
  //   CR 117.3b-c / 117.4 / 405.5: with something on the stack you receive priority. Puzzle policy: the opponent
  //     always passes, so when you pass (a "pass" action) the top object resolves. If you have nothing you could
  //     respond with, passing is all you can do, and it happens right away.
  function flushPending(s, ev) {
    while (!won(s) && !lost(s)) {
      // (every action and every resolving effect already ends by checking state-based actions; CR 603.3b asks for
      // them once more right before triggered abilities go on the stack)
      if (s.triggered.length) sba(s, ev);
      if (s.triggered.length) {
        const t = s.triggered;
        s.triggered = [];
        s.pending.push(...t.filter((x) => x.side === "player"), ...t.filter((x) => x.side !== "player"));   // CR 101.4 APNAP
        continue;
      }
      if (s.pending.length) {
        const p = s.pending[0];
        if (p.kind === "choice") return;                                 // a replacement-effect choice waits for you
        if (p.kind === "scry") {                                        // a choice in the middle of a resolving spell
          if (s.player.library.slice(0, p.n).length) return;            // only known top cards need a choice
          s.pending.shift();
          if (p.then) { applyEffect(s, p.then.effect, p.then.target, p.then.ctx, ev); sba(s, ev); }   // (state-based actions after the rest of it)
          continue;
        }
        // (triggers that need a target and have none are removed right away, CR 603.3d — before any order question)
        const n0 = s.pending.length;
        s.pending = s.pending.filter((q) => { if (q.kind === "scry" || q.kind === "choice") return true;
          const d = trig(q); return !(d.targets || d.slots) || triggerTargetOptions(s, q).length > 0; });
        if (s.pending.length !== n0) continue;
        if (orderChoices(s).length) return;                                  // you choose which of yours goes first
        // CR 603.3c: a modal triggered ability's modes are chosen as it's put on the stack (modes whose targets have
        // no legal choice can't be chosen); the opponent's: the choice worst for you
        const def = TRIGGER_DEFS[p.td];
        if (def.modes && p.modes == null) {
          const src = srcOf(s, p);
          // (uniqueModes: "choose one that hasn't been chosen this turn")
          const used = def.uniqueModes ? (s.usedModes || {})[p.srcId] || [] : [];
          const combos = modeCombos(def).filter((l) => l.every((i) => !used.includes(i))).filter((l) => l.every((i) => { const m = def.modes[i];
            return !m.targets || (m.count && m.count.min === 0) || targetsFor(s, src, m.targets, m.targetFilter, p.side).length; }));
          if (!combos.length) { s.pending.shift(); continue; }
          const pick = choose(s, `${p.name}: choose ${def.anyNumber ? "any number" : def.oneOrBoth ? "one or both" : def.oneOrMore ? "one or more" : "one"}`,
            combos.map((l) => (l.length ? l.map((i) => def.modes[i].text).join(" + ") : "No mode")), p.side);
          s.pending[0] = { ...p, modes: combos[pick] };
          if (def.uniqueModes) s.usedModes = { ...(s.usedModes || {}), [p.srcId]: [...used, ...combos[pick]] };
          continue;
        }
        const d = trig(p);
        const options = d.targets || d.slots ? triggerTargetOptions(s, p) : null;
        if (options && !options.length) { s.pending.shift(); continue; }       // CR 603.3d: removed
        if (options && p.side === "player") return;                          // you choose (a "trigger" action)
        const target = options ? opponentTriggerTarget(s, options) : undefined;
        s.pending.shift();
        s.stack.unshift({ ...p, kind: "trigger", target });                  // CR 603.3: the topmost object
        continue;
      }
      if (s.stack.length) {
        if (canRespond(s)) return;                                           // you have priority (CR 117.3b-c)
        resolveTop(s, ev);
        continue;
      }
      if (s.lki && !s.triggered.length && !s.pending.length) delete s.lki;   // nothing on the stack needs it any more
      return;
    }
  }

  // CR 608.1: the top object of the stack resolves (a triggered ability, or a spell or activated ability)
  function resolveTop(s, ev) {
    s.evBatch = (s.evBatch || 0) + 1;                            // (what happens as one object resolves is one batch of events)
    const top = s.stack.shift();
    if (top.kind === "trigger") resolveTrigger(s, top, ev);
    else resolveObject(s, top, ev);
    sba(s, ev);                                                  // CR 704.3: before anyone gets priority again
  }

  // Could you do anything but pass right now? Instants, flash spells and activated abilities (not mana abilities
  // and not "only as a sorcery") can be cast or activated with something on the stack (CR 117.1a-b).
  function canRespond(s) {
    const fast = (f) => f && f.cost != null && !isLand(f) && (isInstant(f) || has(f, "flash") || (f.behold && f.behold.flash) || asFlash(s, f));
    // (asked card by card — "could this be cast or activated right now?" — instead of listing every legal move)
    // (a spell with flash only if a Dragon is beheld: asked with a Dragon beheld)
    const castNow = (c, zone) => !c.unknown && (c.faces ? (zone === "exile" && c.onAdventure ? [0] : c.faces.map((_, i) => i)) : [undefined])
      .some((face) => { const f = faceOf(c, { face }); return fast(f) && (!check(s, { type: "cast", id: c.id, face }) ||
        (f.behold && f.behold.flash && beholdOptions(s, f).length > 0 && !check(s, { type: "cast", id: c.id, face, behold: beholdOptions(s, f)[0] }))); });
    return s.player.hand.some((c) => castNow(c, "hand") || (c.cycling && !check(s, { type: "cycle", id: c.id }))) ||
      s.player.exile.some((c) => (c.onAdventure || c.playable || c.airbent) && castNow(c, "exile")) ||
      [...s.player.graveyard, ...s.opponent.graveyard].some((c) => castable(s, c.id) && castNow(c, "graveyard")) ||
      (!!s.player.library[0] && !!castable(s, s.player.library[0].id) && castNow(s.player.library[0], "library")) ||
      s.player.hand.some((c) => c.handAbility && !check(s, { type: "channel", id: c.id })) ||
      s.player.battlefield.some((c) => c.prepared && c.prepare && castNow(preparedSpell(c), "prepared")) ||
      s.player.battlefield.some((c) => abilitiesOf(c).some((ab) => !ab.sorcery && !abilityProblem(s, c, ab, 0)));
  }

  // A triggered ability resolves (CR 608.2). It's independent of its source (CR 113.7a: it uses the source's last
  // known information, so it works even if the source has left). An intervening "if" is checked again (CR 603.4).
  // CR 608.2b: if all its targets are illegal it doesn't resolve; otherwise it does what it can with the legal ones.
  function resolveTrigger(s, p, ev) {
    const d = trig(p), src = srcOf(s, p);
    if (d.if && !conditionHolds(s, d.if, p.side, src)) { ev.push({ type: "trigger-removed", name: p.name }); return; }
    let target = p.target;
    if (d.slots && Array.isArray(target)) {
      const kept = target.map((t, i) => (t != null && targetsFor(s, src, d.slots[i].targets, d.slots[i].filter, p.side).includes(t) ? t : null));
      if (!kept.some((t) => t != null)) { ev.push({ type: "fizzled", name: p.name }); return; }
      target = kept;
      if (p.side === "player" && !payWard(s, kept.filter((t) => t != null), ev)) return;   // ward on its targets (CR 702.21a)
    } else if (d.targets && target != null) {
      const legal = targetsFor(s, src, d.targets, d.filter, p.side);
      const kept = [].concat(target).filter((x) => legal.includes(x));
      if (!kept.length) { ev.push({ type: "fizzled", name: p.name }); return; }
      target = Array.isArray(target) ? kept : kept[0];
      if (p.side === "player" && !payWard(s, target, ev)) return;            // ward on its target (CR 702.21a)
    }
    ev.push({ type: "trigger", name: p.name, target });
    applyEffect(s, d.effect, target, { src, side: p.side, selfId: p.srcId, event: p.event, ...(p.split ? { split: p.split } : {}) }, ev);
  }

  // The opponent's trigger target: one that leaves you no way to win, if there is one
  function opponentTriggerTarget(s, options) {
    if (options.length === 1) return options[0];
    const canWin = makeSearch();
    for (const t of options) {
      const n = cloneState(s);
      const p = n.pending.shift();
      n.stack.unshift({ ...p, kind: "trigger", target: t });
      flushPending(n, []);
      if (!canWin(n)) return t;
    }
    return options[0];
  }

  /* ---------- combat ---------- */
  // Who may block whom: flying/reach, shadow, horsemanship, intimidate, fear, skulk, landwalk, protection
  function canBlock(s, b, a) {
    if (!isCreature(b) || b.tapped || has(b, "can't block")) return false;
    if (has(b, "blocks only flyers") && !has(a, "flying")) return false;          // "can block only creatures with flying"
    if (has(a, "unblockable by power 2+") && power(b) >= 2) return false;
    if (has(a, "unblockable by power 2 or less") && power(b) <= 2) return false;   // (Sandman)
    if (has(a, "unblockable by lesser power") && power(b) < power(a)) return false;   // ("Creatures with power less than this creature's power can't block it.")
    if (power(a) <= 2 && power(b) >= 3 && s[sideOf(s, a)].battlefield.some((c) => c.delney && !(c.st && c.st.lost))) return false;   // (Delney)
    if (has(a, "unblockable")) return false;
    if (has(a, "flying") && !has(b, "flying") && !has(b, "reach")) return false;
    if (has(a, "shadow") !== has(b, "shadow")) return false;
    if (has(a, "horsemanship") && !has(b, "horsemanship")) return false;
    if (has(a, "intimidate") && !(isArtifact(b) && isCreature(b)) && !shareColor(a, b)) return false;
    if (has(a, "fear") && !(isArtifact(b) && isCreature(b)) && !colorsOf(b).includes("B")) return false;
    if (has(a, "skulk") && power(b) > power(a)) return false;
    // "It can't be blocked by creatures of that color this turn" (Skrelv) / "can't be blocked by Walls" (Graaz)
    if (keywords(a).some((k) => { const m = /^can't be blocked by (white|blue|black|red|green) creatures$/.exec(k); return m && colorsOf(b).includes(COLOR_WORD[m[1]]); })) return false;
    if (has(a, "can't be blocked by Walls") && hasType(b, "Wall")) return false;
    for (const k of keywords(a)) {
      const m = /^(plains|island|swamp|mountain|forest)walk$/.exec(k);
      if (m && s.opponent.battlefield.some((l) => new RegExp("\\b" + m[1] + "\\b", "i").test(l.type || ""))) return false;
    }
    if (protectedFrom(a, b)) return false;
    return true;
  }

  // Every legal way the opponent can block the current attackers
  function blockOptions(s) {
    const attackers = s.combat.attackers.map((id) => find(s, id)).filter(Boolean);
    const blockers = s.opponent.battlefield.filter((b) => isCreature(b) && !b.tapped && !has(b, "can't block"));
    const out = [];
    const assign = new Array(blockers.length).fill(-1);
    (function go(i) {
      if (i === blockers.length) {
        const blocks = {};
        attackers.forEach((a, k) => { blocks[a.id] = blockers.filter((_, j) => assign[j] === k).map((b) => b.id); });
        if (attackers.some((a) => has(a, "menace") && blocks[a.id].length === 1)) return;
        // (Anzrag: "must be blocked each combat this turn if able": some blocker that could block it does)
        if (attackers.some((a) => ((s.mustBeBlocked || []).includes(a.id) || has(a, "must be blocked")) && !blocks[a.id].length && blockers.some((b) => canBlock(s, b, a) && !Object.values(blocks).flat().includes(b.id)))) return;
        // ("target creature … blocks that Wolf this combat if able": s.mustBlock — blocker → attacker)
        for (const [bid, aid] of Object.entries(s.mustBlock || {})) {
          const b = blockers.find((x) => x.id === bid), a = attackers.find((x) => x.id === aid);
          if (b && a && canBlock(s, b, a) && !blocks[aid].includes(bid)) return;
        }
        out.push(blocks);
        return;
      }
      go(i + 1);
      attackers.forEach((a, k) => { if (canBlock(s, blockers[i], a)) { assign[i] = k; go(i + 1); assign[i] = -1; } });
    })(0);
    return out;
  }

  function declareBlocks(s, blocks, ev) {
    const C = s.combat;
    C.blocks = {};
    C.blocked = {};
    C.attackers.forEach((id) => {
      C.blocks[id] = (blocks && blocks[id]) || [];
      C.blocked[id] = C.blocks[id].length > 0;
      if (C.blocked[id]) ev.push({ type: "blocked", id, by: C.blocks[id] });
    });
    C.attackers.filter((id) => C.blocked[id]).forEach((id) => { const a = find(s, id); if (a) emit(s, { type: "becomesBlocked", obj: a, side: sideOf(s, a) }, ev); });
  }

  // A first-strike damage step happens if an attacking or blocking creature has first or double strike
  function firstStrikeStepNeeded(s) {
    const C = s.combat;
    const inCombat = [...C.attackers, ...Object.values(C.blocks || {}).flat()].map((id) => find(s, id)).filter(Boolean);
    return inCombat.some(firstStriker);
  }

  // the amount a creature assigns in combat: its power — or its toughness (Bedrock Tortoise: "Each creature you control
  // with toughness greater than its power assigns combat damage equal to its toughness rather than its power")
  const combatPower = (s, a) => (toughness(a) > power(a) && s[sideOf(s, a) || "player"].battlefield.some((c) => c.tortoise && !(c.st && c.st.lost)) ? toughness(a) : power(a));
  function combatDamage(s, first, ev) {
    const C = s.combat;
    const deals = (c) => first ? firstStriker(c)
      : !C.fsHappened || !C.dealtFirst.includes(c.id) || has(c, "double strike");
    const hits = [];                                           // all combat damage is dealt at once
    s.combatBatch = (s.combatBatch || 0) + 1;                  // (one batch: "one or more creatures deal combat damage")
    C.attackers.forEach((aid) => {
      const a = s.player.battlefield.find((c) => c.id === aid);
      if (!a || !deals(a)) return;
      if (first) C.dealtFirst.push(a.id);
      let left = Math.max(combatPower(s, a), 0);
      if (!left) return;
      const bs = (C.blocks[aid] || []).map((id) => s.opponent.battlefield.find((c) => c.id === id)).filter(Boolean);
      // what it's attacking: the opponent, or a planeswalker (CR 510.1b); if that planeswalker has left, nothing is
      // dealt to it (blockers still are)
      const at = (C.at && C.at[aid]) || "opp";
      const toAt = (n) => { if (at === "opp" || find(s, at)) hits.push({ src: a, side: "player", to: at, n }); };
      if (!C.blocked[aid]) { toAt(left); return; }
      // Zilortha, Apex of Ikoria: "For each non-Human creature you control, you may have that creature assign its combat
      // damage as though it weren't blocked."
      if (!hasType(a, "Human") && s.player.battlefield.some((c) => c.zilortha && !(c.st && c.st.lost)) &&
        choose(s, `${a.name}: assign its combat damage as though it weren't blocked?`, ["Yes: all of it to what it's attacking", "No: to its blockers"], "player", a.id) === 0) { toAt(left); return; }
      if (!bs.length) { if (has(a, "trample")) toAt(left); return; }
      // divide damage: lethal to as many blockers as possible, the rest tramples over (or stays on a blocker)
      const need = (b) => (has(a, "deathtouch") ? 1 : Math.max(toughness(b) - (b.dmg || 0), 0));
      [...bs].sort((x, y) => need(x) - need(y)).forEach((b) => {
        const give = Math.min(left, need(b));
        if (give > 0) { hits.push({ src: a, side: "player", to: b.id, n: give }); left -= give; }
      });
      if (left > 0) { if (has(a, "trample")) toAt(left); else hits.push({ src: a, side: "player", to: bs[0].id, n: left }); }
    });
    Object.entries(C.blocks).forEach(([aid, bids]) => {
      bids.forEach((bid) => {
        const b = s.opponent.battlefield.find((c) => c.id === bid);
        if (!b || !deals(b)) return;
        if (first) C.dealtFirst.push(b.id);
        const a = s.player.battlefield.find((c) => c.id === aid);
        if (a && power(b) > 0) hits.push({ src: b, side: "opponent", to: a.id, n: power(b) });
      });
    });
    [...new Set(hits.map((h) => h.src))].forEach((src) => ev.push({ type: "strike", id: src.id, side: sideOf(s, src) }));
    hits.forEach(({ src, side, to, n }) => dealDamage(s, src, side, to, n, ev, { combat: true }));
    sba(s, ev);
  }

  // Turn-based actions when a step begins
  function enterStep(s, step, blocks, ev) {
    // mana empties between steps — Omnath, Locus of All: "If you would lose unspent mana, that mana becomes black instead."
    if (s.player.battlefield.some((c) => c.manaBecomesBlack && !(c.st && c.st.lost))) { s.pool = s.pool.map(() => "B"); s.rpool = (s.rpool || []).map((m) => ({ ...m, colors: "B" })); }
    else { s.pool = s.player.battlefield.some((c) => c.electro && !(c.st && c.st.lost)) ? s.pool.filter((m) => m === "R") : []; s.rpool = []; }
    if (at(step) >= at("main2")) delete s.firePool;            // (firebending mana: at the end of combat)
    // "At the beginning of the end step" triggers (e.g. Ball Lightning's sacrifice) trigger as the end step
    // begins; you can respond to them, so they resolve when you move on from the end step
    if (step === "cleanup") {
      (s.endTriggers || []).forEach((id) => { const c = find(s, id); if (c && sideOf(s, c) === "player") leave(s, c, "graveyard", ev); });
      s.endTriggers = [];
      sba(s, ev);
    }
    if (step === "end") s.endTriggers = s.player.battlefield.filter((c) => c.atEndStep === "sacrifice").map((c) => c.id);
    s.phase = step;
    // delayed triggers waiting for this end step (CR 603.7), then "at the beginning of your end step" triggered abilities
    // (a Case's "To solve", CR 719.3a)
    if (step === "end" && s.delayed && s.delayed.length) {
      s.delayed.forEach((d) => s.triggered.push({ side: d.side, name: d.name, srcId: d.srcId, td: defId(DELAYED[d.kind]), event: { id: d.id } }));
      delete s.delayed;
    }
    if (step === "end") s.endSteps = (s.endSteps || 0) + 1;                    // ("if it's the first end step of the turn")
    if (step === "end") emit(s, { type: "endStep", side: "player" }, ev);
    if (step === "eoc" && s.delayedEoc && s.delayedEoc.length) { s.delayedEoc.forEach((d) => s.triggered.push({ side: d.side, name: d.name, srcId: d.srcId, td: defId(DELAYED_EOC[d.kind]), event: { id: d.id } })); delete s.delayedEoc; }
    // "at the beginning of combat on your turn" (CR 507.1: triggers as the step begins)
    // ("At the beginning of the next combat phase this turn, …": Feral Encounter's delayed trigger)
    if (step === "boc" && s.delayedBoc && s.delayedBoc.length) { s.delayedBoc.forEach((d) => s.triggered.push({ side: d.side, name: d.name, srcId: d.srcId, td: defId(DELAYED_BOC[d.kind]), event: {} })); delete s.delayedBoc; }
    if (step === "boc" && s.untapAttackersEachCombat) (s.attackedIds || []).forEach((id) => { const c = find(s, id); if (c) untap(s, c, ev); });
    if (step === "boc") { s.combatDamagers = []; s.combatDamagersPB = []; emit(s, { type: "beginningOfCombat", side: "player" }, ev); }
    if (step === "main2") emit(s, { type: "main2", side: "player" }, ev);
    if (step === "main1") emit(s, { type: "main1", side: "player" }, ev);        // "at the beginning of your first main phase"        // "at the beginning of your second main phase"
    if (step === "attackers") s.attacked = true;              // no attackers declared: combat is over
    if (!s.combat) return;
    if (step === "blockers") declareBlocks(s, blocks, ev);
    if (step === "fsdamage" && firstStrikeStepNeeded(s)) { s.combat.fsHappened = true; combatDamage(s, true, ev); }
    if (step === "damage") combatDamage(s, false, ev);
    if (at(step) >= at("main2")) s.combat = null;              // end of combat: creatures leave combat
  }

  /* ---------- activated abilities ---------- */
  // CR 702.177a: "Exhaust — [Cost]: [Effect]" means "… Activate only once." (each object: c.exhausted lists the used
  // ones by their place in c.abilities). CR 702.177b: during your turn, as long as you haven't begun to activate an
  // exhaust ability this turn, Elvish Refueler (refuelsExhaust) lets you activate them as though they hadn't been.
  const a0x = () => 0;
  const exhaustSlot = (card, ab) => { const i = (card.abilities || []).indexOf(ab); return i >= 0 ? i : `b${abilitiesOf(card).indexOf(ab)}`; };   // (a gained ability: by its place)
  // (an ability whose only effect is adding mana is a mana ability, CR 605.1a)
  const MANA_KEYS = ["addMana", "chooseColorMana", "addRestricted", "addManaCount", "addManaPer", "addRPower", "addURPower"];
  const isManaAbility = (ab) => !!ab.effect && !ab.targets && Object.keys(ab.effect).every((k) => MANA_KEYS.includes(k));
  const exhaustReady = (s, card, ab) => !(card.exhausted || []).includes(exhaustSlot(card, ab)) ||
    (!s.exhaustedThisTurn && s.player.battlefield.some((c) => c.refuelsExhaust && !(c.st && c.st.lost)));
  // What activating it costs: X filled in; "Exhaust abilities of other permanents you control cost {2} less to activate"
  // (exhaustLess, Boom Scholar) — only the generic part goes down (CR 601.2f, 602.2b)
  // CR 701.67a: waterbend — for each generic mana in the waterbend cost you may tap an untapped artifact or creature you
  // control instead (ab.waterbend: the cost is a waterbend cost; a.waterTap: what's tapped; not chosen yet: as many as
  // could help)
  const waterHelpers = (s, card, ab) => s.player.battlefield.filter((c) => (isCreature(c) || isArtifact(c)) && !c.tapped && !(ab.tap && c.id === card.id)).map((c) => c.id);
  // (ability costs paid with permanents or cards: what could be sacrificed, exiled, discarded)
  const discardCount = (ab) => (ab.discardCost === true ? 1 : ab.discardCost || 0);
  // the cards in your hand an ability's discard cost can use ("Discard a land card: …": discardFilter)
  const discardable = (s, ab) => s.player.hand.filter((c) => !ab.discardFilter || (!c.unknown && objectIs(faceOf(c, {}), ab.discardFilter))).map((c) => c.id);
  // (attachedToSelf: "Sacrifice an Aura attached to this creature")
  const sacCostOptions = (s, card, ab) => s.player.battlefield.filter((c) => !(ab.sacCost.other && c.id === card.id) &&
    !(ab.sacCost.filter && ab.sacCost.filter.attachedToSelf && c.attachedTo !== card.id) &&
    objectIs(c, ab.sacCost.filter || {}) && matches(s, c, ab.sacCost.filter, "player")).map((c) => c.id);
  // "Tap three untapped artifacts and/or creatures you control" (not {T}: summoning-sick ones can be tapped, CR 302.6)
  const tapCostOptions = (s, card, ab) => s.player.battlefield.filter((c) => !c.tapped && !(ab.tapCost.filter && ab.tapCost.filter.notSelf && c.id === card.id) && (ab.tapCost.filter ? objectIs(c, ab.tapCost.filter) && matches(s, c, ab.tapCost.filter, "player") : isArtifact(c) || isCreature(c))).map((c) => c.id);
  const artifactsToTap = (s) => s.player.battlefield.filter((c) => isArtifact(c) && !c.tapped).map((c) => c.id);
  const counterHolders = (s, ab = {}) => s.player.battlefield.filter((c) => (ab.removeCounterCost && ab.removeCounterCost.artifacts ? isArtifact(c) : isCreature(c)) && ((c.counters || {})["+1/+1"] || 0) > 0).map((c) => c.id);
  // (Iron Spider: "Remove two +1/+1 counters from among artifacts you control": each way, as a list of ids, one per counter)
  const counterRemovals = (s, ab) => { const n = (ab.removeCounterCost && ab.removeCounterCost.n) || 1, ids = counterHolders(s, ab), out = [];
    (function go(i, acc) { if (acc.length === n) { out.push(n === 1 ? acc[0] : [...acc]); return; } for (let j = i; j < ids.length; j++) { const have = (find(s, ids[j]).counters || {})["+1/+1"] || 0; if (acc.filter((x) => x === ids[j]).length < have) go(j, [...acc, ids[j]]); } })(0, []);
    return out; };
  const artifactsToExile = (s, card) => s.player.battlefield.filter((c) => isArtifact(c) && c.id !== card.id).map((c) => c.id);
  const exileCostOptions = (s, ab) => s.player.graveyard.filter((c) => objectIs(faceOf(c, {}), ab.exileCost.filter || {})).map((c) => c.id);
  function abilityCost(s, card, ab, x, waterTap, target) {
    let cost = withX(ab.cost, x);
    if (ab.lessPerTargetColor && target != null && find(s, target)) { const p = parseCost(cost), n = Math.max(0, p.generic - colorsOf(find(s, target)).length); cost = (n ? `{${n}}` : "") + p.pips.map((q) => `{${q}}`).join(""); }
    // Fugitive Codebreaker: "This cost is reduced by {1} for each instant and sorcery card in your graveyard." (its disguise cost)
    if (ab.special === "turnFaceUp" && card.hidden && card.hidden.disguiseLessInstSorc) { const p = parseCost(cost), n = s.player.graveyard.filter((c) => typeHas(faceOf(c, {}), /instant|sorcery/i)).length; cost = (Math.max(0, p.generic - n) ? `{${Math.max(0, p.generic - n)}}` : "") + p.pips.map((q) => `{${q}}`).join(""); }
    // Agatha's Soul Cauldron: "You may spend mana as though it were mana of any color to activate abilities of creatures you control."
    if (cost && isCreature(card) && s[sideOf(s, card) || "player"].battlefield.some((c) => c.soulCauldron && !(c.st && c.st.lost))) cost = anyColorCost(cost);
    // "This ability costs {1} less to activate for each oil counter on this creature" (lessPerCounter: the kind);
    // "Activated abilities of lands you control cost {1} less" (Blossoming Tortoise); Agatha of the Vile Cauldron:
    // creatures' abilities cost {X} less, X her power, but not below one mana in total
    if (ab.loyalty == null && cost) {
      const p = parseCost(cost);
      const live = (key) => s.player.battlefield.filter((c) => c[key] && !(c.st && c.st.lost));
      let less = ab.lessPerCounter ? (card.counters || {})[ab.lessPerCounter] || 0 : 0;
      if (ab.lessPerOtherTown) less += s.player.battlefield.filter((c) => c.id !== card.id && hasType(c, "Town")).length;   // ("costs {1} less to activate for each other Town you control")
      if (card.equip && ab.effect && ab.effect.attach && target != null && find(s, target) && find(s, target).cloudPC && !(find(s, target).st && find(s, target).st.lost)) less += 2;   // (Cloud, Planet's Champion)
      if (isLand(card) || typeHas(card, /\bland\b/i)) less += live("landAbilitiesLess").length;
      const agatha = isCreature(card) && sideOf(s, card) === "player" ? live("creatureAbilitiesLess").reduce((t, c) => t + Math.max(power(c), 0), 0) : 0;
      let generic = Math.max(0, p.generic - less);
      if (agatha) generic = Math.max(p.pips.length ? 0 : Math.min(1, generic), generic - agatha);
      const gadget = isArtifact(card) && sideOf(s, card) === "player" ? live("artifactAbilitiesLess").length : 0;
      if (gadget) generic = Math.max(p.pips.length ? 0 : Math.min(1, generic), generic - gadget);
      if (generic !== p.generic) cost = (generic ? `{${generic}}` : "") + p.pips.map((y) => `{${y}}`).join("");
    }
    // CR 702.193a-b: power-up — reduced by the permanent's mana cost if it entered this turn (a colored pip reduces the same
    // pip, the rest reduces generic mana); "Power-up abilities of other creatures you control cost {3} less" (powerUpLess)
    if (ab.powerUp) {
      const p = parseCost(cost);
      let generic = p.generic;
      const pips = [...p.pips];
      if (card.enteredThisTurn && card.cost) {
        const m = parseCost(card.cost);
        generic -= m.generic;
        m.pips.forEach((pip) => { const i = pips.indexOf(pip); if (i >= 0) pips.splice(i, 1); else generic -= 1; });
      }
      generic -= s.player.battlefield.filter((c) => c !== card && c.powerUpLess && !(c.st && c.st.lost)).reduce((t, c) => t + c.powerUpLess, 0);
      generic = Math.max(0, generic);
      cost = (generic ? `{${generic}}` : "") + pips.map((y) => `{${y}}`).join("");
    }
    if (ab.waterbend) {
      const p = parseCost(cost), n = Math.min(p.generic, waterTap ? waterTap.length : waterHelpers(s, card, ab).length);
      cost = (p.generic - n ? `{${p.generic - n}}` : "") + p.pips.map((y) => `{${y}}`).join("");
    }
    if (!ab.exhaust) return cost;
    const less = s.player.battlefield.filter((c) => c !== card && c.exhaustLess && !(c.st && c.st.lost)).reduce((t, c) => t + c.exhaustLess, 0);
    if (!less) return cost;
    const p = parseCost(cost), generic = Math.max(0, p.generic - less);
    return (generic ? `{${generic}}` : "") + p.pips.map((y) => `{${y}}`).join("");
  }
  // A creature's {T} abilities can't be used while it's summoning sick (unless it has haste); equip is sorcery speed.
  function abilityProblem(s, card, ab, x) {
    if ((isArtifact(card) || isCreature(card) || isPlaneswalker(card)) && clarion(s)) return "Activated abilities of artifacts, creatures, and planeswalkers can't be activated (Clarion Conqueror).";
    // loyalty abilities (CR 606.3): your main phase with an empty stack, one per permanent per turn; a minus cost
    // needs that many loyalty counters (CR 606.6)
    if (ab.loyalty != null) {
      if (!sorceryTime(s)) return "Loyalty abilities only in your main phase, with nothing on the stack.";
      // ("you may activate loyalty abilities of Kaito twice this turn rather than only once": loyaltyTwice)
      if (card.loyaltyUsed && !(card.loyaltyTwice && card.loyaltyUsed === 1)) return `${card.name} has already used a loyalty ability this turn.`;
      if (ab.loyalty < 0 && loyaltyOf(card) < -ab.loyalty) return `${card.name} doesn't have ${-ab.loyalty} loyalty.`;
      if (ab.loyaltyX && x != null && !(x >= 0 && x <= loyaltyOf(card))) return `${card.name} doesn't have ${x} loyalty.`;
    if (ab.minX && !((x || 0) >= ab.minX)) return "X can't be 0.";
    }
    if (ab.tap && card.tapped) return `${card.name} is tapped.`;
    // (Tyvar, Jubilant Brawler: "You may activate abilities of creatures you control as though those creatures had haste")
    const hasteForAbilities = s.player.battlefield.some((c) => c.abilitiesHaste && !(c.st && c.st.lost));
    if (ab.tap && isCreature(card) && card.sick && !has(card, "haste") && !hasteForAbilities) return `${card.name} has summoning sickness.`;
    // "Remove an oil counter from this artifact: …" (a cost: the counters must be there to remove, CR 118.3)
    // "Remove three counters from among other artifacts, creatures, and planeswalkers you control" (removeAmong)
    if (card.netted && card.tapped) return `${card.name}'s activated abilities can't be activated while it's tapped (Braided Net).`;
    if (ab.removeAmong && s.player.battlefield.filter((c) => objectIs(c, ab.removeAmong.filter || {}) && !(ab.removeAmong.other && c.id === card.id)).reduce((t, c) => t + Object.entries(c.counters || {}).filter(([k]) => !ab.removeAmong.kind || k === ab.removeAmong.kind).reduce((u, [, n]) => u + n, 0), 0) < ab.removeAmong.n) return `You don't have ${ab.removeAmong.n} counters to remove.`;
    const rc = ab.removeCounters;
    if (rc && (rc.kind === "any" ? Object.values(card.counters || {}).reduce((t, n) => t + n, 0) : ((card.counters || {})[rc.kind] || 0)) < (rc.n || 1)) return `${card.name} doesn't have ${rc.n || 1} ${rc.kind} counter${(rc.n || 1) > 1 ? "s" : ""}.`;
    if (ab.craft && !craftOptions(s, card, ab.craft).length) return `${card.name} has nothing to craft with.`;
    // (tapping creatures to crew isn't a {T} cost: summoning-sick creatures can crew, CR 302.6 only covers {T}/{Q})
    if (ab.crew && crewHelpers(s, card).reduce((t, id) => t + crewPower(find(s, id)), 0) < ab.crew) return `Your untapped creatures don't have ${ab.crew} total power to ${ab.saddle ? "saddle" : "crew"} it.`;
    if (ab.sorcery && !sorceryTime(s)) return `You can only ${ab.text || "do that"} during your main phase, with nothing on the stack.`;
    if (ab.stationAb && !crewHelpers(s, card).length) return `You have no other untapped creature to station ${card.name} with.`;
    if (ab.discardCost && discardable(s, ab).length < discardCount(ab)) return discardCount(ab) > 1 ? `You don't have ${discardCount(ab)} cards to discard.` : "You have no card to discard.";   // "Discard a card: …"
    // "Sacrifice two other artifacts and/or creatures: …"; "Exile three creature cards from your graveyard: …"; "Pay 2 life"
    if (ab.sacCost && sacCostOptions(s, card, ab).length < ab.sacCost.n) return `You don't have enough to sacrifice for ${card.name}'s ability.`;
    if (ab.exileArtifactCardsX && (a0x(ab) > s.player.graveyard.filter((c) => isArtifact(faceOf(c, {}))).length)) return "Not that many artifact cards in your graveyard.";
    if (ab.forageCost && !canForage(s)) return "You can't forage: no Food and fewer than three cards in your graveyard.";
    if (ab.evidenceCost && !evidenceSets(s.player.graveyard, ab.evidenceCost).length) return `Collect evidence ${ab.evidenceCost}: not enough mana value in your graveyard.`;
    if (ab.exileArtifactsX && !artifactsToExile(s, card).length) return `You have no other artifact to exile for ${card.name}'s ability.`;
    if (ab.exileCost && exileCostOptions(s, ab).length < ab.exileCost.n) return `You don't have enough cards in your graveyard for ${card.name}'s ability.`;
    if (ab.tapCost && tapCostOptions(s, card, ab).length < ab.tapCost.n) return `You don't have ${ab.tapCost.n} untapped artifacts and/or creatures to tap.`;
    if (ab.lifeCost && !canPayLife(s, ab.lifeCost)) return `You don't have ${ab.lifeCost} life to pay.`;
    if (ab.removeCounterCost && !counterRemovals(s, ab).length) return "There aren't enough +1/+1 counters to remove.";
    if (ab.selfCounterCost && !(((card.counters || {})[ab.selfCounterCost] || 0) > 0)) return `${card.name} has no ${ab.selfCounterCost} counter.`;   // ("Remove a film counter from this artifact")
    // "Activate only if …" (requires: a condition about this permanent or the game)
    if (ab.requires && !conditionHolds(s, ab.requires, "player", card)) return ab.requiresText || `${card.name} can't do that right now.`;
    if (ab.blight && !s.player.battlefield.some(isCreature)) return "You have no creature to blight.";   // "{T}, Blight 1: …"
    // CR 702.178a: "Max speed — [ability]": it has the ability only while your speed is 4
    if (ab.maxSpeed && !maxSpeed(s, "player")) return `${card.name} has that ability only at max speed (your speed is ${speedOf(s, "player")}).`;
    if (ab.exhaust && !exhaustReady(s, card, ab)) return `${card.name}'s exhaust ability has already been activated.`;
    if (ab.oncePerTurn && (card.usedOnce || []).includes(exhaustSlot(card, ab))) return `${card.name}'s ability can be activated only once each turn.`;
    if (ab.powerUp && card.poweredUp) return `${card.name}'s power-up ability has already been activated.`;   // CR 702.193a: only once
    if (ab.cost && !ab.lessPerTargetColor && !(card.equip && ab.effect && ab.effect.attach && s.player.battlefield.some((c) => c.cloudPC)) && !bestPayment(s, abilityCost(s, card, ab, x), { exclude: ab.tap ? [card.id] : [], forWhat: { ability: card } })) return "Not enough mana.";
    if (ab.targets && !(ab.targetCount && ab.targetCount.min === 0) && !targetsFor(s, card, ab.targets, ab.filter).filter((t) => !(ab.effect && ab.effect.attach && t === card.attachedTo)).length) return "There's no legal target.";
    return null;
  }

  /* ---------- legality ---------- */
  // Returns null if the action is legal, otherwise a short rules reason for the player
  function validTargets(target, legal, count) {
    const list = [].concat(target);
    if (count && count.max > 1) {
      if (!Array.isArray(target)) return "Choose the targets.";
      if (list.length < count.min || list.length > count.max || new Set(list).size !== list.length) return "That isn't a legal choice of targets.";
    } else if (Array.isArray(target)) return "Choose one target.";
    return list.every((t) => legal.includes(t)) ? null : "That isn't a legal target.";
  }

  // The copy of a prepared permanent's prepare spell (CR 722.3c): only the prepare spell's characteristics
  const preparedSpell = (p) => compile({ ...clone(p.prepare), id: `${p.id}#prep`, owner: "player", preparedFrom: p.id });
  // Where a card can be cast from: your hand, exile if it went on an Adventure (then only its creature face), or your
  // graveyard if it has flashback (CR 702.34a)
  // Case of the Locked Hothouse, solved: "you may play lands and cast creature and enchantment spells from the top of your library"
  const hothouse = (s) => s.player.battlefield.some((c) => c.hothouse && c.solved && !(c.st && c.st.lost));
  const glarbOn = (s) => s.player.battlefield.some((c) => c.glarb && !(c.st && c.st.lost));
  const chocoboOn = (s) => s.player.battlefield.some((c) => c.travelingChocobo && !(c.st && c.st.lost));
  const whaleOn = (s) => s.player.battlefield.some((c) => c.lunarWhale && !(c.st && c.st.lost) && (s.attackedIds || []).includes(c.id));   // ("As long as The Lunar Whale attacked this turn")
  const libTopLands = (s) => !!s.gwenomTurn || s.libraryTopPlay || hothouse(s) || glarbOn(s) || chocoboOn(s) || whaleOn(s);
  // Fblthp, Lost on the Range: "The top card of your library has plot. The plot cost is equal to its mana cost. You may plot nonland cards from the top of your library."
  const fblthpTop = (s, id) => { const top = s.player.library[0]; return top && top.id === id && !isLand(faceOf(top, {})) && s.player.battlefield.some((c) => c.fblthpPlot && !(c.st && c.st.lost)) ? top : null; };
  const plotCost = (s, card) => card.plot || (fblthpTop(s, card.id) ? faceOf(card, {}).cost || "{0}" : null);
  const isFood = (c) => hasType(c, "Food");
  const canForage = (s, except) => s.player.battlefield.some((c) => isFood(c) && c.id !== except) || s.player.graveyard.filter((c) => c.id !== except).length >= 3;
  function payForage(s, ev, except) {
    const foods = s.player.battlefield.filter((c) => isFood(c) && c.id !== except), gy = () => s.player.graveyard.filter((c) => c.id !== except);
    const k = choose(s, "Forage: sacrifice a Food or exile three cards from your graveyard", [...foods.map((c) => `Sacrifice ${c.name}`), ...(gy().length >= 3 ? ["Exile three cards from your graveyard"] : [])], "player", [...foods.map((c) => c.id), null]);
    if (k < foods.length) { leave(s, foods[k], "graveyard", ev, { sacrificed: true }); return; }
    for (let i = 0; i < 3; i++) { const l = gy(); const c = l[l.length > 1 ? choose(s, `Forage: exile a card from your graveyard (${i + 1} of 3)`, l.map((x) => x.name), "player", l.map((x) => x.id)) : 0]; s.player.graveyard = s.player.graveyard.filter((x) => x !== c); putCard(s, c, "player", "exile"); }
    emit(s, { type: "forage", side: "player" }, ev);
  }
  const tevalOn = (s) => s.player.battlefield.some((c) => c.teval && !(c.st && c.st.lost));
  const unravelerOn = (s) => s.player.battlefield.some((c) => c.unraveler && !(c.st && c.st.lost));
  function castable(s, id) {
    const r = castable0(s, id);
    if (r && unravelerOn(s)) r.unravel = true;                    // (Conspiracy Unraveler: evidence 10 rather than the mana cost)
    if (r && s.player.battlefield.some((c) => c.leylineMutation && !(c.st && c.st.lost))) r.mutation = true;
    if (r && r.zone === "exile" && !s.warpedUsed && s.player.battlefield.some((c) => c.layout === "room" && c.unlocked && c.unlocked[c.warpedDoor ?? -1])) r.warped = true;
    // Weftwalking: "The first spell each player casts during each of their turns may be cast without paying its mana cost."
    if (r && !((s.spellsCast || 0) > 0) && battlefieldNow(s).some(({ card: c }) => c.weftwalking && !(c.st && c.st.lost))) r.weft = true;
    // Tannuk: "Artifact cards and red creature cards in your hand have warp {2}{R}."
    if (r && r.zone === "hand" && !r.card.warp && s.player.battlefield.some((c) => c.tannuk && !(c.st && c.st.lost)) && (isArtifact(faceOf(r.card, {})) || (isCreature(faceOf(r.card, {})) && colorsOf(faceOf(r.card, {})).includes("R")))) r.warpCost = "{2}{R}";
    return r;
  }
  function castable0(s, id) {
    const h = s.player.hand.find((c) => c.id === id);
    if (h) return { card: h, zone: "hand", draco: dracoOn(s) };
    // CR 722.3c: a prepared permanent's prepare spell: a copy you may cast ("<permanent id>#prep")
    if (typeof id === "string" && id.endsWith("#prep")) {
      const p = s.player.battlefield.find((c) => c.id === id.slice(0, -5) && c.prepared && c.prepare);
      return p ? { card: preparedSpell(p), zone: "prepared", source: p } : null;
    }
    // (or a card exiled with "you may play that card this turn", or a card plotted on an earlier turn, CR 702.170d)
    // (or airbent: castable for {2}, CR 701.65a)
    const e = s.player.exile.find((c) => c.id === id && (c.onAdventure || c.playable || (c.plotted && !c.plottedNow) || c.airbent ||
      // (Intrepid Paleontologist: "You may cast Dinosaur creature spells from among cards you own exiled with this creature.")
      (c.exiledBy && isCreature(faceOf(c, {})) && hasType(faceOf(c, {}), "Dinosaur") && s.player.battlefield.some((p) => p.id === c.exiledBy && p.paleontologist && !(p.st && p.st.lost)))));
    if (e) return { card: e, zone: "exile", draco: dracoOn(s) };
    // (or harmonize, CR 702.180a)
    // (or mayhem, if you discarded it this turn, CR 702.187b)
    const g = s.player.graveyard.find((c) => c.id === id && !isLand(faceOf(c, {})) && (c.flashback || c.harmonize || c.graveAdventure || c.conduitCast || (c.mayhem && c.discardedThisTurn) || (s.creaturesFromGraveyard && isCreature(faceOf(c, {}))) || (c.sprinter && s.nonZombieDied) ||
      (s.instSorcAnyGraveyard && typeHas(faceOf(c, {}), /instant|sorcery/i)) || (emblemSays(s, "permanentsFromGraveyard") && isPermanent(faceOf(c, {})) && !isLand(faceOf(c, {})))));
    if (g) return { card: g, zone: "graveyard", draco: dracoOn(s) };
    // (Osteomancer Adept: a creature spell from your graveyard by foraging; Festival of Embers: an instant or sorcery for 1 more life)
    const og2 = s.player.graveyard.find((c) => c.id === id);
    if (og2 && s.osteomancer && isCreature(faceOf(og2, {})) && canForage(s, id)) return { card: og2, zone: "graveyard", osteo: true, draco: dracoOn(s) };
    if (og2 && typeHas(faceOf(og2, {}), /instant|sorcery/i) && s.player.battlefield.some((c) => c.festivalEmbers && !(c.st && c.st.lost)) && canPayLife(s, 1)) return { card: og2, zone: "graveyard", festival: true, draco: dracoOn(s) };
    // (Noctis: "You may cast artifact spells from your graveyard by paying 3 life in addition to paying their other costs.")
    if (og2 && isArtifact(faceOf(og2, {})) && !isLand(faceOf(og2, {})) && s.player.battlefield.some((c) => c.noctis && !(c.st && c.st.lost)) && canPayLife(s, 3)) return { card: og2, zone: "graveyard", noctis: true, draco: dracoOn(s) };
    // (The Tomb of Aclazotz: a creature spell from your graveyard, this turn)
    // (Forgotten Cellar: "you may cast spells from your graveyard this turn")
    const cg = s.cellarTurn && s.player.graveyard.find((c) => c.id === id && !isLand(faceOf(c, {})));
    if (cg) return { card: cg, zone: "graveyard", draco: dracoOn(s) };
    const tg = s.tombCasts > 0 && s.player.graveyard.find((c) => c.id === id && isCreature(faceOf(c, {})));
    if (tg) return { card: tg, zone: "graveyard", tomb: true, draco: dracoOn(s) };
    // (The Great Work: "you may cast instant and sorcery spells from any graveyard" — the opponent's too)
    const og = s.instSorcAnyGraveyard && s.opponent.graveyard.find((c) => c.id === id && typeHas(faceOf(c, {}), /instant|sorcery/i));
    if (og) return { card: og, zone: "graveyard", ownerSide: "opponent", draco: dracoOn(s) };
    // (Valgavoth: "During your turn, you may play cards exiled with Valgavoth. If you cast a spell this way, pay life equal to its mana value rather than pay its mana cost.")
    const vg = s.opponent.exile.find((c) => c.id === id && c.exiledBy && s.player.battlefield.some((v) => v.id === c.exiledBy && v.valgavoth && !(v.st && v.st.lost)) && !isLand(faceOf(c, {})));
    if (vg && canPayLife(s, manaValue(faceOf(vg, {}).cost))) return { card: vg, zone: "exile", ownerSide: "opponent", valga: true };
    // (Errant and Giada: "You may cast spells with flash or flying from the top of your library.")
    const top = s.player.library[0];
    if (top && top.id === id && s.player.battlefield.some((c) => c.castFlashFlyingFromTop && !(c.st && c.st.lost)) && (has(faceOf(top, {}), "flash") || has(faceOf(top, {}), "flying"))) return { card: top, zone: "library" };
    if (top && top.id === id && s.libraryTopPlay && !isLand(faceOf(top, {}))) return { card: top, zone: "library" };   // (The Belligerent)
    if (top && top.id === id && s.gwenomTurn && !isLand(faceOf(top, {})) && canPayLife(s, manaValue(faceOf(top, {}).cost))) return { card: top, zone: "library", valga: true };   // (Gwenom: life rather than its mana cost)
    if (top && top.id === id && isArtifact(faceOf(top, {})) && !isLand(faceOf(top, {})) && s.player.battlefield.some((c) => c.mmenon && !(c.st && c.st.lost))) return { card: top, zone: "library" };   // (Mm'menon: "You may cast artifact spells from the top of your library.")
    if (top && top.id === id && !isLand(faceOf(top, {})) && ((chocoboOn(s) && hasType(faceOf(top, {}), "Bird")) || whaleOn(s))) return { card: top, zone: "library" };
    if (top && top.id === id && !s.assembleUsed && s.player.battlefield.some((c) => c.assemble && !(c.st && c.st.lost)) && isCreature(faceOf(top, {})) && power(faceOf(top, {})) <= 2) return { card: top, zone: "library", assemble: true };
    if (top && top.id === id && glarbOn(s) && !isLand(faceOf(top, {})) && manaValue(faceOf(top, {}).cost) >= 4) return { card: top, zone: "library" };   // (Glarb)
    if (top && top.id === id && hothouse(s) && !isLand(faceOf(top, {})) && (isCreature(faceOf(top, {})) || typeHas(faceOf(top, {}), /enchantment/i))) return { card: top, zone: "library" };
    return null;
  }
  // The spell as it's cast from where it is: from the graveyard by flashback, its flashback cost is paid rather than
  // its mana cost (an alternative cost, CR 118.9; plus any other part of the flashback cost, like beholding)
  // Cast face down with disguise (a.faceDown): a 2/2 face-down creature spell with ward {2} that costs {3} (CR 702.168b, 708.4)
  // CR 702.194a-b: teamwork — "if this spell was cast using teamwork" (a.teamwork: the creatures tapped): its teamwork
  // version (ifTeamwork), or "choose both instead" (teamworkBoth)
  // (castFromGraveyard: "Spells you cast from your graveyard cost {2} less to cast", Green Goblin)
  const castFace = (from, a) => { const f = { ...withTeamwork(castFaceBase(from, a), a), castZone: from && from.zone }; return from && from.zone === "graveyard" && !f.castFromGraveyard ? { ...f, castFromGraveyard: true } : f; };
  // (an emblem of yours with this ability: Wrenn and Realmbreaker's "You may play lands and cast permanent spells from your graveyard.")
  const emblemSays = (s, k) => (s.player.command || []).some((e) => e[k]);
  // (Dracogenesis on the battlefield: a Dragon spell may be cast without paying its mana cost — from.draco)
  const dracoOn = (s) => s.player.battlefield.some((c) => c.dracogenesis && !(c.st && c.st.lost));
  function withTeamwork(f, a) {
    if (!(f.teamwork && a.teamwork != null)) return f;
    const g = { ...f, ...(f.ifTeamwork || {}) };
    if (f.teamworkBoth && f.modes) g.chooseCount = f.modes.length;
    return g;
  }
  // the creatures that could pay a teamwork cost (your untapped creatures); sets with enough power where none could be
  // left out (more only matters if something cares about creatures becoming tapped)
  function teamworkChoices(s, n) {
    const ids = convokeHelpers(s), pw = (id) => Math.max(power(find(s, id)), 0);
    return subsets(ids).filter((l) => l.reduce((t, id) => t + pw(id), 0) >= n && (s.listens.includes("becomesTapped") || l.every((id) => l.reduce((t, x) => t + pw(x), 0) - pw(id) < n)));
  }
  function castFaceBase(from, a) {
    if (a.faceDown) return { ...FACE_DOWN, kw: [...FACE_DOWN.kw], id: from.card.id, owner: from.card.owner, cost: "{3}" };
    const f = faceOf(from.card, a);
    // Leyline of Mutation: "You may pay {W}{U}{B}{R}{G} rather than pay the mana cost for spells you cast." / Warped Space: "{0}" (a.altCost)
    if (a.altCost === "mutation" && from.mutation) return { ...f, cost: "{W}{U}{B}{R}{G}", printedCost: f.cost };
    if (a.altCost === "zero" && (from.warped || from.weft)) return { ...f, cost: "", printedCost: f.cost, warpedZero: true };
    // Conspiracy Unraveler: "You may collect evidence 10 rather than pay the mana cost for spells you cast." (an alternative cost)
    if (from.unravel && a.evidence != null && !f.evidence) return { ...f, cost: "", printedCost: f.cost, evidence: 10, unravelCast: true };
    // CR 702.170d: a plotted card is cast without paying its mana cost (an alternative cost: nothing to pay)
    if (from.zone === "exile" && from.card.plotted) return { ...f, cost: "", plottedCast: true };
    // ("Until end of turn, you may cast the exiled card without paying its mana cost": Djeru and Hazoret, Quintorius)
    if (from.zone === "exile" && from.card.freeCast) return { ...f, cost: "", printedCost: f.cost };
    if (from.valga) return { ...f, cost: "", printedCost: f.cost };   // (Valgavoth: life instead, paid as it's cast)
    if (from.zone === "exile" && from.card.anyManaCast) return { ...f, cost: anyColorCost(f.cost || ""), printedCost: f.cost };
    // airbent: {2} rather than its mana cost (CR 701.65a)
    if (from.zone === "exile" && from.card.airbent) return { ...f, cost: "{2}", printedCost: f.cost };
    // CR 702.185a: warp — cast it from your hand for its warp cost instead (a.warp)
    if (a.warp && from.zone === "hand" && (from.card.warp || from.warpCost)) return { ...f, cost: from.card.warp || from.warpCost, warpCast: true, printedCost: f.cost };
    // CR 702.74a: evoke — "You may cast this spell for its evoke cost. If you do, it's sacrificed when it enters."
    if (a.evoke && from.zone === "hand" && from.card.evoke) return { ...f, cost: from.card.evoke, evokeCast: true, printedCost: f.cost };
    if (from.draco && hasType(f, "Dragon")) return { ...f, cost: "", printedCost: f.cost };
    // CR 702.176a: impending — cast it for its impending cost: it enters with N time counters and isn't a creature while it has any
    if (a.impending && from.zone === "hand" && from.card.impending) return { ...f, cost: from.card.impending.cost, impendingCast: true, printedCost: f.cost };
    // CR 702.190a: sneak — during your declare blockers step, its sneak cost and returning an unblocked attacking creature
    // you control (a.sneak) instead
    if (a.sneak != null && from.zone === "hand" && from.card.sneak) return { ...f, cost: from.card.sneak, sneakCast: true, printedCost: f.cost };
    // CR 702.188a: web-slinging — its web-slinging cost and returning a tapped creature you control (a.webSling) instead
    if (a.webSling != null && from.zone === "hand" && from.card.webSlinging) return { ...f, cost: from.card.webSlinging, webSlung: true, printedCost: f.cost };
    if (from.zone !== "graveyard") return f;
    // harmonize (CR 702.180a): its harmonize cost instead of its mana cost; a creature may be tapped to reduce it (a.tapFor)
    if (from.card.graveAdventure && !from.card.flashback) return f;
    if (!from.card.flashback && !from.card.harmonize && !from.card.mayhem) return f;   // (permission to cast it from there: its mana cost)    // (Mosswood Dreadknight: its Adventure, from your graveyard)
    if (!from.card.flashback && from.card.harmonize) return { ...f, cost: from.card.harmonize, harmonizing: true, printedCost: f.cost };
    // mayhem (CR 702.187b): its mayhem cost, from your graveyard, if you discarded it this turn
    if (!from.card.flashback) return { ...f, cost: from.card.mayhem, mayhemCast: true, printedCost: f.cost };
    const { cost, behold } = from.card.flashback;
    return { ...f, cost, ...(behold ? { behold } : {}) };
  }

  // What's wrong with the targets chosen for one part of a spell (or, with none chosen yet, whether it can have any)
  function partProblem(s, src, part, sac) {
    if (part.slots) {
      const t = part.target;
      if (t == null) return part.slots.every((sl) => sl.optional || targetsFor(s, src, sl.targets, sl.filter).length) ? null : `${src.name} has no legal target.`;
      if (!Array.isArray(t) || t.length !== part.slots.length) return "Choose the targets.";
      if (new Set(t.filter((x) => x != null)).size !== t.filter((x) => x != null).length) return "Choose different targets.";
      if (!t.some((x) => x != null) && !part.slots.every((sl) => sl.optional)) return "Choose the targets.";
      return part.slots.every((sl, i) => (t[i] == null && sl.optional) || targetsFor(s, src, sl.targets, sl.filter).includes(t[i])) ? null : "That isn't a legal target.";
    }
    if (!part.targets) return null;
    if (src.differentNames && part.target != null) { const ns = [].concat(part.target).map((id) => ([...s.player.graveyard, ...s.opponent.graveyard].find((c) => c.id === id) || {}).name); if (new Set(ns).size !== ns.length) return "Choose cards with different names."; }
    const legal = targetsFor(s, src, part.targets, part.filter).filter((t) => t !== sac);
    if (part.target == null) return legal.length || part.count.min === 0 ? null : `${src.name} has no legal target.`;
    const why = validTargets(part.target, legal, part.count);
    if (why) return why;
    if (part.effect && part.effect.divided) {
      const ts = [].concat(part.target), sp = part.split || [];
      if (sp.length !== ts.length || sp.some((x) => !(x >= 1)) || sp.reduce((x, y) => x + y, 0) !== part.total) return "Divide the damage: at least 1 to each target.";
    }
    return null;
  }

  function check(s, a) {
    if (lost(s)) return "You lost the game.";
    if (a.type !== "advance" && !hasPriority(s)) return "You don't have priority right now.";
    if (a.type === "choice") {
      const p = s.pending[0];
      return p && p.kind === "choice" && a.pick >= 0 && a.pick < p.labels.length ? null : "Choose one of the options.";
    }
    if (a.type === "order") return orderChoices(s).includes(a.pick) ? null : "Choose one of your triggered abilities to put on the stack.";
    if (a.type === "trigger") {
      const p = s.pending[0];
      if (!p || p.side !== "player" || p.kind === "scry") return "Nothing is waiting for a target.";
      if (orderChoices(s).length) return "First choose which of your triggered abilities goes on the stack first.";
      const d = trig(p);
      if (d.slots) return triggerTargetOptions(s, p).some((o) => JSON.stringify(o) === JSON.stringify(a.target)) ? null : "Choose a target for each part.";
      if (a.target == null && d.count && d.count.min === 0) return null;     // "up to one target": none
      return validTargets(a.target, targetsFor(s, srcOf(s, p), d.targets, d.filter, p.side), d.count);
    }
    if (a.type === "scry") {
      const p = s.pending[0];
      if (!p || p.kind !== "scry") return "There's nothing to scry.";
      const known = s.player.library.slice(0, p.n).map((c) => c.id);
      const all = [...(a.top || []), ...(a.away || [])];
      return all.length === known.length && known.every((id) => all.includes(id)) ? null : "Put each card on top or away.";
    }
    if (s.pending.length && a.type !== "advance") return `Finish ${s.pending[0].name}${s.pending[0].kind === "scry" ? "" : "'s ability"} first.`;
    if (a.type === "play") {
      const card = s.player.hand.find((c) => c.id === a.id) || s.player.exile.find((c) => c.id === a.id && c.playable) ||
        (landsFromGraveyard(s) ? s.player.graveyard.find((c) => c.id === a.id) : s.player.graveyard.find((c) => c.id === a.id && c.mayhem && c.discardedThisTurn)) || (libTopLands(s) && s.player.library[0] && s.player.library[0].id === a.id ? s.player.library[0] : null);
      if (!card || !isLand(faceOf(card, a))) return "That isn't a land in your hand.";
      if (!sorceryTime(s)) return "You can only play a land during your main phase, with nothing on the stack.";
      if (s.landPlayed && landsPlayed(s) >= landsAllowed(s)) return "You've already played a land this turn.";
      const n = faceOf(card, a).payLifeOrTapped;
      if (n && a.payLife && !canPayLife(s, n)) return `You don't have ${n} life to pay.`;
      return null;
    }
    // CR 702.29a: cycling — "[Cost], Discard this card: Draw a card", an activated ability that works from your hand
    // (any time you have priority)
    // an ability of a card in your hand whose cost discards it ("{1}{R}, Discard this card: …", CR 602.1, 113.6)
    if (a.type === "ninjutsu") {
      const card = s.player.hand.find((c) => c.id === a.id);
      if (!card || !card.ninjutsu) return "Only a card with ninjutsu in your hand can do that.";
      if (!unblockedMine(s).includes(a.ret)) return "Ninjutsu: return an unblocked attacking creature you control.";
      if (!bestPayment(s, card.ninjutsu, { except: card.id })) return `Not enough mana for ${card.name}'s ninjutsu.`;
      return null;
    }
    if (a.type === "channel") {
      const card = s.player.hand.find((c) => c.id === a.id);
      const h = card && card.handAbility;
      if (!h) return "That card has no ability you can use from your hand.";
      if (h.sorcery && !sorceryTime(s)) return "Only as a sorcery: your main phase, with nothing on the stack.";
      if (!bestPayment(s, h.cost, { except: card.id })) return `Not enough mana for ${card.name}'s ability.`;
      if (!h.targets) return null;
      const legal = targetsFor(s, card, h.targets, h.filter);
      const upTo = h.targetCount && h.targetCount.min === 0;          // ("up to one target")
      if (!legal.length && !upTo) return "There's no legal target.";
      return a.target == null ? null : validTargets(a.target, legal, ONE);
    }
    if (a.type === "renew") {
      const card = s.player.graveyard.find((c) => c.id === a.id);
      if (!card || !card.renew) return "Only a card with renew in your graveyard can be renewed.";
      // (renew is one kind of ability that works from the graveyard; others aren't sorcery-speed, don't exile the card, or
      // need a condition: "Activate only if you've scried or surveilled this turn")
      if (!card.renew.instant && !sorceryTime(s)) return `${card.renew.label || "Renew"} only as a sorcery: your main phase, with nothing on the stack.`;
      if (card.renew.requires && !conditionHolds(s, card.renew.requires, "player", card)) return `${card.name}'s ability can't be activated now.`;
      if (!bestPayment(s, withX(card.renew.cost, a.x))) return `Not enough mana for ${card.name}'s ability.`;
      if (card.renew.x && a.target != null) return validTargets(a.target, targetsFor(s, card, card.renew.targets, card.renew.filter), { min: a.x || 0, max: a.x || 0 }) || null;
      if (card.renew.discardCost && !s.player.hand.length) return `You have no card to discard for ${card.name}'s ability.`;
      if (card.renew.sacCost && !s.player.battlefield.some((c) => matches(s, c, card.renew.sacCost.filter, "player"))) return `You have nothing to sacrifice for ${card.name}'s ability.`;
      if (!card.renew.targets) return null;
      const legal = targetsFor(s, card, card.renew.targets, card.renew.filter);
      if (!legal.length) return "There's no legal target.";
      return a.target == null ? null : validTargets(a.target, legal, ONE);
    }
    if (a.type === "cycle") {
      const card = s.player.hand.find((c) => c.id === a.id);
      if (!card || !card.cycling) return "Only a card with cycling in your hand can be cycled.";
      if (!bestPayment(s, withX(card.cycling, a.x), { except: card.id })) return `Not enough mana to cycle ${card.name}.`;
      return null;
    }
    // CR 702.170a / 116.2k: plot — exile it from your hand and pay its plot cost, during your main phase with an empty stack
    if (a.type === "plot") {
      const card = s.player.hand.find((c) => c.id === a.id) || fblthpTop(s, a.id);
      if (!card || !plotCost(s, card)) return "Only a card with plot in your hand can be plotted.";
      if (!sorceryTime(s)) return "You can only plot during your main phase, with nothing on the stack.";
      if (!bestPayment(s, plotCost(s, card), { except: card.id })) return `Not enough mana to plot ${card.name}.`;
      return null;
    }
    if (a.type === "cast") {
      const from = castable(s, a.id);
      if (!from || from.card.unknown) return "You can't cast that.";
      if (s.noMoreSpells) return "You can't cast additional spells this turn.";   // (Conduit of Worlds)
      if (from.zone === "graveyard" && from.card.conduitCast && s.spellsCast > 0) return "Only if you haven't cast a spell this turn.";
      // Soulless Jailer: "Players can't cast noncreature spells from graveyards or exile."
      if ((from.zone === "graveyard" || from.zone === "exile") && jailed(s) && !isCreature(faceOf(from.card, a))) return "Noncreature spells can't be cast from graveyards or exile now.";
      if (from.zone === "exile" && from.card.onAdventure && (a.face || 0) !== 0) return "From exile you can only cast its creature.";
      if (a.faceDown && !from.card.disguise) return "Only a card with disguise can be cast face down.";
      if (a.faceDown && from.zone === "graveyard") return "You can't cast it face down from there.";
      if (a.warp && !((from.card.warp || from.warpCost) && from.zone === "hand")) return "Only a card with warp in your hand can be cast for its warp cost.";
      if (a.impending && !(from.card.impending && from.zone === "hand")) return "Only a card with impending in your hand can be cast for its impending cost.";
      if (a.webSling != null) {
        if (!(from.card.webSlinging && from.zone === "hand")) return "Only a card with web-slinging in your hand can be cast that way.";
        const back = find(s, a.webSling);
        if (!back || sideOf(s, back) !== "player" || !isCreature(back) || !back.tapped) return "Web-slinging: return a tapped creature you control.";
      }
      if (from.zone === "graveyard" && from.card.graveAdventure && !from.card.flashback && a.face !== 1) return "From your graveyard you can only cast it as an Adventure.";
      if (from.card.layout === "transform" && (a.face || 0) !== 0) return "A transforming card is cast with its front face up (CR 712.11).";
      const f = castFace(from, a);
      if (isLand(f)) return "Play it as a land instead.";
      if (f.cost == null) return "You can't cast that.";
      if ((s.spellsCast || 0) >= 1 && battlefieldNow(s).some(({ card: x }) => x.oneSpellEach && !(x.st && x.st.lost))) return "No player can cast more than one spell each turn (High Noon).";
      // (Terror of the Peaks: "Spells your opponents cast that target this creature cost an additional 3 life to cast")
      if (lifeTax(s, a.target) && !canPayLife(s, lifeTax(s, a.target))) return `Targeting that costs ${lifeTax(s, a.target)} life.`;
      // ("You may cast this spell as though it had flash if you behold a Dragon": behold.flash)
      const flashByBehold = f.behold && f.behold.flash && a.behold != null && a.behold !== "pay";
      // sneak: only in your declare blockers step (after blockers), returning an unblocked attacker of yours
      if (a.sneak != null) {
        if (!from.card.sneak || from.zone !== "hand") return "Only a card with sneak in your hand can be cast that way.";
        if (!(s.phase === "blockers" && s.combat && s.combat.blocks)) return "Sneak: only during your declare blockers step.";
        if (!unblockedMine(s).includes(a.sneak)) return "Sneak: return an unblocked attacking creature you control.";
      }
      if (!isInstant(f) && !has(f, "flash") && !flashByBehold && !f.sneakCast && !asFlash(s, f) && !sorceryTime(s)) return `You can only cast ${f.name} during your main phase, with nothing on the stack.`;
      // harmonize: tap up to one untapped creature you control (a.tapFor) to reduce the cost by its power
      if (a.tapFor != null && !(f.harmonizing && convokeHelpers(s).includes(a.tapFor))) return "Harmonize: tap one of your untapped creatures.";
      if (f.plottedCast && !sorceryTime(s)) return `A plotted card can only be cast during your main phase, with nothing on the stack.`;
      const n = f.chooseCount || 1;
      if (f.modes && a.mode != null) {
        const picks = manyModes(f) ? [].concat(a.mode) : [a.mode];
        if (f.spree) { if (!picks.length || new Set(picks).size !== picks.length || picks.some((m) => !f.modes[m])) return "Choose one or more modes."; }
        else if (f.oneOrMoreIf) {   // ("Choose one. If …, choose one or more instead.")
          if (!picks.length || new Set(picks).size !== picks.length || picks.some((m) => !f.modes[m])) return "Choose a mode.";
          if (picks.length > 1 && !conditionHolds(s, f.oneOrMoreIf, "player")) return "Choose one mode (you can't choose more right now).";
        }
        else if (f.repeatModes) { if (picks.length !== n || picks.some((m) => !f.modes[m])) return `Choose ${n} modes.`; }
        else if (f.pawprints) { if (!picks.length || picks.some((m) => !f.modes[m]) || picks.reduce((t, m) => t + f.modes[m].paw, 0) > f.pawprints) return `Choose up to ${f.pawprints} {P} worth of modes.`; }
        else if (picks.length !== n || new Set(picks).size !== n || picks.some((m) => !f.modes[m])) return n === 1 ? "Choose a mode." : `Choose ${n} different modes.`;
        // (a mode only allowed sometimes: "If an opponent has eight or more cards in their graveyard, you may choose both instead")
        if (picks.some((m) => f.modes[m].requires && !conditionHolds(s, f.modes[m].requires, "player"))) return "You can't choose that mode right now.";
      }
      if (f.chooseColor && a.color != null && !"WUBRG".includes(a.color)) return "Choose a color.";
      if (parseCost(f.cost).x && a.x != null && !(a.x >= 0)) return "Choose X.";
      if (f.sacrifice && !sacrificeOptions(s, f).length) return `${f.name} needs a creature to sacrifice.`;
      if (f.sacrifice && a.sac != null && !sacrificeOptions(s, f).includes(a.sac)) return "You can't sacrifice that.";
      if (f.blight) {
        const must = !f.blight.optional && !f.blight.orPay;
        if (must && !blightOptions(s).length) return `${f.name} needs a creature of yours to blight.`;
        if (a.blight === "pay" && !f.blight.orPay) return "That cost can't be paid with mana.";
        if (blighted(a) && !blightOptions(s).includes(a.blight)) return "You can only blight a creature you control.";
      } else if (a.blight != null) return `${f.name} has no blight cost.`;
      if (a.offspring && !f.offspring) return `${f.name} has no offspring.`;
      // teamwork N: tap untapped creatures you control with total power N or more
      if (a.teamwork != null) {
        const l = [].concat(a.teamwork), helpers = convokeHelpers(s);
        if (!f.teamwork || new Set(l).size !== l.length || !l.every((id) => helpers.includes(id)) ||
          l.reduce((t, id) => t + Math.max(power(find(s, id)), 0), 0) < f.teamwork) return `Teamwork ${f.teamwork || ""}: tap your untapped creatures with total power ${f.teamwork || "N"} or more.`;
      }
      // "discard a card or pay {2}": a card from your hand (not this one), or pay
      if (f.discardCost) {
        if (a.discard === "pay" && !f.discardCost.orPay) return "That cost can't be paid with mana.";
        const sacOk = (id) => (f.discardCost.orSacrifice || f.discardCost.sacOnly) && s.player.battlefield.some((c) => c.id === id && (!f.discardCost.sacOnly || objectIs(c, f.discardCost.sacOnly)));   // ("discard a card or sacrifice a permanent")
        if (f.discardCost.sacOnly && a.discard != null && a.discard !== "pay" && !sacOk(a.discard)) return "Sacrifice a legendary creature or pay {2}.";
        if (a.discard != null && a.discard !== "pay" && !s.player.hand.some((c) => c.id === a.discard && c.id !== from.card.id) && !sacOk(a.discard)) return f.discardCost.orSacrifice ? "Discard a card or sacrifice a permanent." : "Discard a card from your hand.";
        if (a.discard == null && !f.discardCost.orPay && !s.player.hand.some((c) => c.id !== from.card.id) && !(f.discardCost.orSacrifice && s.player.battlefield.length)) return `${f.name} needs a card to discard${f.discardCost.orSacrifice ? " or a permanent to sacrifice" : ""}.`;
      } else if (a.discard != null) return `${f.name} has no discard cost.`;
      if (a.delve != null && (!tevalOn(s) || a.delve < 0 || a.delve > s.player.graveyard.filter((c) => c.id !== a.id).length || a.delve > parseCost(costOf(f, a)).generic)) return "You can't delve that many cards.";
      if (f.gyExileCost && s.player.graveyard.length < f.gyExileCost) return `${f.name} needs ${f.gyExileCost} cards in your graveyard to exile.`;
      if (a.gift && !f.gift) return `${f.name} has no gift.`;
      // collect evidence N (CR 701.59a): exile cards from your graveyard with total mana value N or more (a.evidence)
      if (a.evidence != null) {
        if (!f.evidence && !f.evidenceTargets) return `${f.name} doesn't collect evidence.`;
        const l = [].concat(a.evidence), cards = l.map((id) => s.player.graveyard.find((c) => c.id === id));
        if (new Set(l).size !== l.length || cards.some((c) => !c)) return "Collect evidence from cards in your graveyard.";
        if (cards.reduce((t, c) => t + manaValue(faceOf(c, {}).cost), 0) < f.evidence) return `Collect evidence ${f.evidence}: exile cards with total mana value ${f.evidence} or more.`;
      }
      if (f.evidenceTargets) {
        const need = [].concat(a.target || []).flat().filter((x) => x != null).reduce((t, id) => t + (find(s, id) ? manaValue(find(s, id).cost) : 0), 0);
        const have = [].concat(a.evidence || []).reduce((t, id) => t + manaValue(faceOf(s.player.graveyard.find((c) => c.id === id) || {}, {}).cost || ""), 0);
        if (need > have) return `Collect evidence ${need}: exile cards with total mana value ${need} or more.`;
      }
      if (a.bargain != null) {
        if (!f.bargain) return `${f.name} has no bargain cost.`;
        if (!bargainOptions(s).includes(a.bargain)) return "Bargain: sacrifice an artifact, enchantment, or token you control.";
      }
      if (f.behold) {
        // "behold three Elementals": that many different ones (a.behold is then a list)
        const n = f.behold.count || 1, opts = beholdOptions(s, f);
        if (n > 1 && a.behold !== undefined) {
          const l = [].concat(a.behold);
          if (l.length !== n || new Set(l).size !== n || !l.every((id) => opts.includes(id))) return `Behold ${n} different ${f.behold.type}s.`;
        } else if (a.behold !== undefined && a.behold !== "pay" && !opts.includes(a.behold)) return `That isn't a ${f.behold.type} you can behold.`;
        if (a.behold === undefined && opts.length < n && !f.behold.orPay && !f.behold.optional) return `${f.name} needs ${n > 1 ? n + " " : "a "}${f.behold.type}${n > 1 ? "s" : ""} to behold.`;
        if (a.behold === "pay" && !f.behold.orPay) return `${f.name} needs a ${f.behold.type} to behold.`;
      }
      if (a.convoke != null) {
        const ok = spellConvoke(s, f) && new Set(a.convoke).size === a.convoke.length && a.convoke.every((id) => convokeHelpers(s).includes(id));
        if (!ok) return "Only your untapped creatures can help cast it (convoke).";
      }
      // (behold not chosen yet: the cheaper way, beholding, if there is something to behold)
      const costA = f.behold && a.behold === undefined && !beholdOptions(s, f).length ? { ...a, behold: "pay" } : a;
      if (!castPayment(s, f, costA, from.card.id)) return `Not enough mana for ${f.name}.`;
      if (f.modes && a.mode == null) return null;                           // targets depend on the mode
      // a permanent spell (other than an Aura) has no targets; its enters trigger chooses them later (CR 603.3d)
      if (isPermanent(f) && !f.aura) return a.target != null ? `${f.name} doesn't target anything as it's cast.` : null;
      for (const part of plan(f, a)) { const why = partProblem(s, f, part, a.sac); if (why) return why; }
      return null;
    }
    if (a.type === "activate") {
      const card = s.player.battlefield.find((c) => c.id === a.id);
      const ab = card && abilitiesOf(card)[a.index];
      if (!ab) return "That has no such ability.";
      const why = abilityProblem(s, card, ab, a.x);
      if (why) return why;
      if (ab.craft && !craftOptions(s, card, ab.craft).some((m) => JSON.stringify(m) === JSON.stringify(a.craft))) return "Choose something to craft with.";
      if (ab.effect && ab.effect.becomeCopyCard && a.target != null) { const g = s.player.graveyard.find((c) => c.id === a.target); if (!g || manaValue(faceOf(g, {}).cost) !== (a.x || 0)) return "Choose a creature card with mana value X."; }
      if (ab.stationAb && !(a.crew && a.crew.length === 1 && crewHelpers(s, card).includes(a.crew[0]))) return "Station: tap one other untapped creature you control.";
      if (ab.discardCost && a.discard != null) {
        const l = [].concat(a.discard);
        if (l.length !== discardCount(ab) || new Set(l).size !== l.length || !l.every((id) => discardable(s, ab).includes(id))) return discardCount(ab) > 1 ? `Discard ${discardCount(ab)} cards from your hand.` : "Discard a card from your hand.";
      }
      // which permanents are sacrificed / which graveyard cards are exiled for the cost (exactly that many, all different)
      const exactly = (l, n, opts) => Array.isArray(l) && l.length === n && new Set(l).size === n && l.every((id) => opts.includes(id));
      if (ab.sacCost && a.sacs != null && !exactly(a.sacs, ab.sacCost.n, sacCostOptions(s, card, ab))) return `Choose ${ab.sacCost.n} to sacrifice.`;
      // divided damage: one amount per target, at least 1 each, adding up to the total (CR 601.2d)
      if (ab.effect && ab.effect.divided && a.target != null) { const ts = [].concat(a.target), sp = a.split || []; if (sp.length !== ts.length || sp.some((n) => !(n >= 1)) || sp.reduce((t, n) => t + n, 0) !== abilityDividedTotal(s, ab)) return "Divide the damage among the targets."; }
      if (ab.tapCost && a.taps != null && !exactly(a.taps, ab.tapCost.n, tapCostOptions(s, card, ab))) return `Choose ${ab.tapCost.n} to tap.`;
      if (ab.tapArtifactsX && (a.x || 0) !== [].concat(a.taps || []).length) return "X is the number of artifacts tapped.";
      if (ab.tapArtifactsX && [].concat(a.taps || []).some((id) => !artifactsToTap(s).includes(id))) return "Tap untapped artifacts you control.";
      if (ab.removeCounterCost && a.rc != null && !counterRemovals(s, ab).some((r) => JSON.stringify(r) === JSON.stringify(a.rc))) return "Remove a +1/+1 counter from a creature you control.";
      if (ab.sacMVPlus1Target && a.sacs != null && a.target != null) { const sc = find(s, [].concat(a.sacs)[0]), g = s.player.graveyard.find((c) => c.id === a.target); if (!sc || !g || manaValue(faceOf(g, {}).cost) !== manaValue(sc.cost) + 1) return "Its mana value must be one more than the sacrificed creature's."; }
      if (ab.kayaTargets && a.target != null) { const ts = [].concat(a.target); if (ts.filter((id) => s.player.battlefield.some((c) => c.id === id)).length !== 1 || ts.filter((id) => s.opponent.battlefield.some((c) => c.id === id)).length > 1) return "Choose one creature you control and up to one creature the opponent controls."; }
      if (ab.exileArtifactCardsX && (a.x || 0) > s.player.graveyard.filter((c) => isArtifact(faceOf(c, {}))).length) return "Not that many artifact cards in your graveyard.";
      if (ab.sacArtifactsAny) { const l = [].concat(a.sacs || []); if (!l.length || new Set(l).size !== l.length || !l.every((id) => s.player.battlefield.some((c) => c.id === id && isArtifact(c)))) return "Sacrifice one or more artifacts."; }
      if (ab.evidenceCost && a.evidence != null) {
        const l = [].concat(a.evidence), cards = l.map((id) => s.player.graveyard.find((c) => c.id === id));
        if (new Set(l).size !== l.length || cards.some((c) => !c) || cards.reduce((t, c) => t + manaValue(faceOf(c, {}).cost), 0) < ab.evidenceCost) return `Collect evidence ${ab.evidenceCost}: exile cards with total mana value ${ab.evidenceCost} or more.`;
      }
      if (ab.exileArtifactsX && a.exiles != null) {
        const l = [].concat(a.exiles), opts = artifactsToExile(s, card);
        if (!l.length || new Set(l).size !== l.length || !l.every((id) => opts.includes(id))) return "Exile one or more other artifacts you control.";
        const g = a.target != null && s.player.graveyard.find((c) => c.id === a.target);
        if (g && manaValue(faceOf(g, {}).cost) > l.reduce((t, id) => t + manaValue(find(s, id).cost), 0)) return "Its mana value is more than the total mana value exiled.";
      }
      if (ab.exileCost && a.exiles != null && !exactly(a.exiles, ab.exileCost.n, exileCostOptions(s, ab))) return `Choose ${ab.exileCost.n} cards to exile from your graveyard.`;
      if (ab.blight && a.blight != null && !blightOptions(s).includes(a.blight)) return "You can only blight a creature you control.";
      if (a.waterTap != null) {
        const helpers = waterHelpers(s, card, ab), l = a.waterTap;
        if (!ab.waterbend || new Set(l).size !== l.length || !l.every((id) => helpers.includes(id)) || l.length > parseCost(withX(ab.cost, a.x)).generic) return "Waterbend: tap your untapped artifacts and creatures, one per generic mana.";
        if (!bestPayment(s, abilityCost(s, card, ab, a.x, l, a.target), { exclude: [...(ab.tap ? [card.id] : []), ...l], forWhat: { ability: card } })) return "Not enough mana.";
      }
      if (ab.crew) {
        const crew = a.crew || [];
        if (new Set(crew).size !== crew.length || !crew.every((id) => crewHelpers(s, card).includes(id))) return `Only your other untapped creatures can ${ab.saddle ? "saddle" : "crew"} it.`;
        if (crew.reduce((t, id) => t + crewPower(find(s, id)), 0) < ab.crew) return `Choose creatures with ${ab.crew} or more total power to ${ab.saddle ? "saddle" : "crew"} it.`;
      }
      if (a.target != null) return validTargets(a.target, targetsFor(s, card, ab.targets, ab.filter), ab.targetCount);
      return null;
    }
    if (a.type === "mana") {
      const c = s.player.battlefield.find((x) => x.id === a.id);
      if (!c || !isTreasure(c)) return "That can't make mana.";
      if (c.tapped) return "It's tapped.";
      return null;
    }
    if (a.type === "attack") {
      if (!canAttackNow(s)) return s.attacked ? "Attackers have already been declared this turn."
        : s.phase === "main1" && bocMatters(s) && !s.stack.length ? "First move on to the beginning of combat (Next phase): something happens there."
        : "You can only declare attackers at the start of combat.";
      if (!a.ids.length) return "Choose at least one attacker.";
      // CR 506.2 / 508.1b: each attacker attacks the opponent, one of the opponent's planeswalkers, or a battle the
      // opponent protects — your own Sieges (CR 310.9b) (a.at)
      for (const [id, to] of Object.entries(a.at || {})) {
        if (!a.ids.includes(id) || !attackables(s).includes(to)) return "A creature can only attack the opponent, one of their planeswalkers, or a battle they protect.";
      }
      for (const id of a.ids) {
        const c = s.player.battlefield.find((x) => x.id === id);
        if (!c || !isCreature(c)) return "Only your creatures can attack.";
        if (c.tapped) return `${c.name} is tapped.`;
        if ((has(c, "defender") && !has(c, "attacks despite defender")) || has(c, "can't attack")) return `${c.name} can't attack.`;
        if (s.onlyLandCreaturesAttack && !isLand(c)) return "Only land creatures can attack during this combat phase.";
        if (c.sick && !has(c, "haste")) return `${c.name} has summoning sickness and can't attack this turn.`;
      }
      // CR 508.1d: requirements — a creature that "attacks each combat if able" must attack if it can
      if (a.ids.length === 1 && has(find(s, a.ids[0]), "can't attack or block alone")) return `${find(s, a.ids[0]).name} can't attack alone.`;
      const must = mustAttackers(s).filter((c) => !a.ids.includes(c.id));
      if (must.length) return `${must[0].name} attacks each combat if able.`;
      // "No more than one creature can attack The Eternal Wanderer each combat" (CR 508.1c: a restriction)
      for (const w of s.opponent.battlefield.filter((c) => c.maxAttackers)) {
        if (Object.values(a.at || {}).filter((to) => to === w.id).length > w.maxAttackers) return `No more than ${w.maxAttackers} creature can attack ${w.name} each combat.`;
      }
      return null;
    }
    if (a.type === "advance") {
      if (s.pending.length && s.pending[0].side === "player") return `Choose a target for ${s.pending[0].name}'s ability first.`;
      // CR 405.5: a step only ends when all players pass with the stack empty
      if (s.stack.length) return `${s.stack[0].name} is still on the stack: let it resolve first.`;
      // (the declare attackers step can't pass with no attack while a creature must attack, CR 508.1d)
      if (!s.attacked && at(a.to) > at("attackers") && at(s.phase) < at("attackers") && mustAttackers(s).length) return `${mustAttackers(s)[0].name} attacks each combat if able: declare attackers.`;
      return at(a.to) > at(s.phase) ? null : "The turn only moves forward.";
    }
    if (a.type === "pass") {                                  // CR 117.3d / 117.4: you pass, the opponent passes
      if (s.pending.length) return "Finish putting your triggered abilities on the stack first.";
      return s.stack.length ? null : "There's nothing on the stack.";
    }
    return "Unknown action.";
  }

  /* ---------- actions ---------- */
  const slug = (name) => (name || "card").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  // The spell on the stack resolves (the opponent never responds); a ward trigger on its target resolves first.
  // An Aura whose target is gone (or became illegal) goes to the graveyard instead.
  function resolveObject(s, w, ev) {
    // an activated ability: CR 608.2b, it doesn't resolve if all its targets are illegal now (ward: CR 702.21a)
    if (w.kind === "ability") {
      const { a, ab, ctx } = w;
      if (ab.targets && a.target != null) {
        const legal = targetsFor(s, ctx.src, ab.targets, ab.filter);
        if (![].concat(a.target).some((t) => legal.includes(t))) { ev.push({ type: "fizzled", id: ctx.src.id }); return; }
      }
      if (payWard(s, a.target, ev)) applyEffect(s, fillIn(ab.effect, { x: a.x }), a.target, ctx, ev);
      return;
    }
    const { a, card, sacPower } = w;
    // a face-down spell resolves into a face-down permanent (CR 702.168b): no enters abilities of the card (CR 708.3)
    if (a.faceDown) {
      const perm = faceDownOf(card);
      perm.sick = true;
      perm.wasCast = true;
      enter(s, perm, {}, ev);
      sba(s, ev);
      return;
    }
    const f = withTeamwork(faceOf(card, a), a);
    // (a spell that gained keywords on the stack — "those spells gain wither" — has them as it resolves)
    const ctx = { src: { ...f, kw: [...(f.kw || []), ...(w.gain || [])], spellTargets: [a.target].flat(3).filter((x) => x != null) }, side: "player", sacPower, x: a.x, fromGraveyard: !!w.flashback, colorsSpent: card.colorsSpent };   // ("if this spell was cast from a graveyard")
    const parts = plan(f, a);
    if (f.aura) {
      const p = parts[0];
      if (a.target && targetsFor(s, f, p.targets, p.filter).includes(a.target) && payWard(s, a.target, ev)) {
        const aura = asFace(card, a.face);
        aura.owner = "player";
        aura.attachedTo = a.target;                          // CR 303.4f: it enters attached to what it targeted
        if (f.chooseColor && a.color) aura.chosenColor = a.color;   // "As this Aura enters, choose a color"
        ev.push({ type: "attach", id: card.id, to: a.target });
        enter(s, aura, {}, ev);
      } else putCard(s, card, "player", replaceMove(s, card, "stack", "graveyard", "player"));   // (CR 614: "instead")
    } else if (isPermanent(f)) {
      // CR 608.3: a permanent spell resolving enters the battlefield; its enters triggers trigger from there
      // CR 707.10c / 608.3f: a copy of a permanent spell becomes a token as it resolves (its own object)
      const perm = asFace(w.copy ? clone(card) : card, a.face);
      if (w.copy) { perm.id = w.id; perm.token = true; }
      if (w.copy && w.notLegendary) perm.type = (perm.type || "").replace(/\bLegendary\s+/i, "");   // ("except the copy isn't legendary")
      if (w.copy && (w.gain || []).includes("haste")) perm.kw = [...(perm.kw || []), "haste"];   // (Spider-Verse: "If the copy is a permanent spell, it gains haste.")
      // summoning sick; haste lets it attack anyway (CR 302.6: also a noncreature permanent, like a Vehicle, that
      // becomes a creature this turn)
      if (!isLand(perm)) perm.sick = true;
      if ((card.layout === "transform" || card.layout === "modal_dfc") && a.face === 1) perm.transformed = true;   // cast transformed / its back face (CR 712.14)
      perm.wasCast = true;                                                         // ("When this enters, if you cast it")
      delete perm.onAdventure;
      // CR 709.5d: a Room is the whole card on the battlefield, with the door that was cast unlocked
      if (card.layout === "room") {
        const room = { ...card, sick: true, wasCast: true, unlocked: [false, false] };
        enter(s, room, {}, ev);
        unlockDoor(s, room, a.face || 0, ev);
        return void sba(s, ev);
      }
      // sneak (CR 702.190b): it enters tapped and attacking (not declared as an attacker; blockers are already declared)
      if (card.sneaked && s.combat) perm.tapped = true;
      enter(s, perm, { x: a.x, lifePips: a.lifePips }, ev);
      if (card.hasteOnEnter || perm.hasteOnEnter) { delete card.hasteOnEnter; delete perm.hasteOnEnter; if (find(s, perm.id)) grant(find(s, perm.id), ["haste"], s); }   // ("it gains haste until end of turn")
      if (card.sneaked && s.combat && find(s, perm.id)) {
        s.combat.attackers.push(perm.id);
        if (s.combat.blocks) { s.combat.blocks[perm.id] = []; s.combat.blocked[perm.id] = false; }
      }
    } else {
      // A spell whose targets have all become illegal doesn't resolve (608.2b); otherwise each part resolves in order
      const targeted = parts.filter((p) => p.targets || p.slots);
      const live = parts.filter((p) => !(p.targets || p.slots) || stillLegal(s, f, p));
      if (targeted.length && !targeted.some((p) => live.includes(p))) ev.push({ type: "fizzled", id: card.id });
      // ("This spell can't be countered": ward's "counter it unless …" can't counter it, so nothing is paid)
      // CR 702.174j: a promised gift is given first, before the spell's other effects
      else {
        if (a.gift) giveGift(s, f.gift, ev);
        live.forEach((p) => { if (f.uncounterable || payWard(s, p.target, ev, true)) applyEffect(s, fillIn(p.effect, { color: a.color, x: a.x }), p.target, { ...ctx, split: p.split }, ev); });
      }
      // an Adventure goes to exile, from where its creature can be cast later
      if (w.copy) ev.push({ type: "copy-gone", id: w.id });     // CR 707.10a: a copy of a spell off the stack ceases to exist
      else if (card.layout === "adventure" && (a.face || 0) === 1) s.player.exile.push({ ...card, onAdventure: true, ...(isLand(faceOf(card, { face: 0 })) ? { playable: true } : {}) });   // (a Town: "You may play the land later from exile")
      // CR 720.3d: an Omen is shuffled into its owner's library as it resolves (one more unknown card there)
      else if (card.layout === "omen" && (a.face || 0) === 1) putCard(s, card, "player", "library");
      // flashback: "exile this card instead of putting it anywhere else any time it would leave the stack" (CR 702.34a)
      else if (w.plotAfter) { Object.assign(card, { plotted: true, plottedNow: true }); putCard(s, card, card.owner || "player", "exile"); }   // (Lilah: "it becomes plotted")
      else if (w.flashback || w.exileAfter || f.exileSelf || (w.gain || []).includes("rebound")) putCard(s, card, card.owner || "player", "exile");   // (and "Exile Avatar's Wrath.")
      else if (w.bottomAfter) { const z = s[card.owner || "player"]; z.libraryBottom.push(card); }   // ("put it on the bottom of its owner's library instead")
      else putCard(s, card, "player", replaceMove(s, card, "stack", "graveyard", "player"));   // (CR 614: "instead")
      if (s.esperReturn && !w.copy) { delete s.esperReturn; const z0 = s[card.owner || "player"], ex = z0.exile.find((c) => c.id === card.id);
        if (ex) { z0.exile = z0.exile.filter((c) => c !== ex); const perm = asFace(ex, 1); perm.transformed = true; perm.sick = true; perm.counters = { ...(perm.counters || {}), finality: 1 }; enter(s, perm, { side: card.owner || "player" }, ev); } }
    }
    sba(s, ev);
  }

  // After every action: state-based actions, triggers onto the stack, and the stack resolves while you pass
  const settle = (s, ev) => flushPending(s, ev);

  // Applies a legal action to a copy of the state. Returns { state, events }.
  // An advance that passes the declare blockers step uses a.blocks, or the opponent's choice.
  function apply(s0, a) {
    // your answer to a choice: replay the action that asked it, from the state before it, with the answer (CR 616.1)
    if (a.type === "choice") {
      const p = s0.pending[0];
      const answers = [...(p.replay.choices || [])]; answers[p.k] = a.pick;
      return apply({ ...cloneState(s0), pending: s0.pending.slice(1) }, { ...p.replay, choices: answers });
    }
    CHOICES.push({ s0, a, list: a.choices || [], i: 0 });
    try { return applyBody(s0, a); }
    catch (e) {
      if (!(e instanceof NeedChoice)) throw e;
      const s = cloneState(s0);
      s.pending.unshift({ kind: "choice", side: "player", name: e.q.name, labels: e.q.labels, k: e.q.k, ...(e.q.about ? { about: e.q.about } : {}),
        replay: { ...a, choices: [...(a.choices || [])] } });
      return { state: s, events: [] };
    } finally { CHOICES.pop(); }
  }

  function applyBody(s0, a) {
    const s = cloneState(s0);
    s.evBatch = (s.evBatch || 0) + 1;
    const ev = [];

    if (a.type === "order") {                                 // CR 603.3b: this one of yours goes on the stack next
      const [p] = s.pending.splice(a.pick, 1);
      s.pending.unshift({ ...p, ordered: true });
    }

    if (a.type === "trigger") {                               // CR 603.3d: you chose its target; it goes on the stack
      const p = s.pending.shift();
      s.stack.unshift({ ...p, kind: "trigger", target: a.target });
      // CR 603.3c: "distribute N +1/+1 counters among any number of target creatures": the division is chosen as it goes
      // on the stack (at least one on each target)
      const tp = trig(p).effect || {}, dc = tp.dividedCounters || (tp.dividedDamage != null ? amount0(s, tp.dividedDamage, p) : 0);
      if (dc && a.target != null) {
        const ts = [].concat(a.target), splits = compositions(dc, ts.length);
        const k = choose(s, tp.dividedDamage != null ? `Divide ${dc} damage` : `Distribute ${dc} +1/+1 counters`, splits.map((sp) => sp.map((n, i) => `${n} on ${nameIn(s, ts[i])}`).join(", ")), "player");
        s.stack[0].split = Object.fromEntries(ts.map((id, i) => [id, splits[k][i]]));
      }
      commitCrime(s, a.target, "player", ev);
      // its targets "become the target of an ability you control" (valiant)
      [...new Set([a.target].flat(2))].map((id) => id && find(s, id)).filter(Boolean)
        .forEach((c) => emit(s, { type: "becomesTarget", obj: c, side: sideOf(s, c), by: "ability", controller: "you" }, ev));
    }

    if (a.type === "scry") {
      // known top cards: the kept ones in the chosen order on top; the rest to the bottom (scry) or graveyard (surveil)
      const p = s.pending.shift();
      const known = s.player.library.slice(0, p.n);
      if (p.then && p.then.ctx) p.then.ctx = { ...p.then.ctx, keptTop: a.top.length, knownSeen: known.length };   // (Starving Revenant)
      const byId = (id) => known.find((c) => c.id === id);
      s.player.library = [...a.top.map(byId), ...s.player.library.slice(known.length)];
      a.away.map(byId).forEach((c) => (p.mode === "surveil" ? putCard(s, c, "player", replaceMove(s, c, "library", "graveyard", "player")) : s.player.libraryBottom.push(c)));
      ev.push({ type: "scry", top: a.top, away: a.away });
      // "whenever you scry or surveil" (an event of its own; a surveil remembers the cards it put into the graveyard)
      s.scriedOrSurveilled = true;
      s.lastSurveilled = p.mode === "surveil" ? [...a.away] : [];
      emit(s, { type: "scries", side: "player", mode: p.mode, count: p.n, ids: [...a.away] }, ev);
      if (p.then) applyEffect(s, p.then.effect, p.then.target, p.then.ctx, ev);
    }

    if (a.type === "play") {
      const card = s.player.hand.find((c) => c.id === a.id) || s.player.exile.find((c) => c.id === a.id) || s.player.graveyard.find((c) => c.id === a.id) ||
        (libTopLands(s) && s.player.library[0] && s.player.library[0].id === a.id ? s.player.library[0] : null);
      const fromExile = s.player.exile.includes(card), fromHand = s.player.hand.includes(card);
      if (s.player.graveyard.includes(card)) card.enteredFromGraveyard = true;
      if (!fromHand) s.nonHandPlay = true;
      if (s.player.library[0] === card) s.player.library.shift();
      s.player.hand = s.player.hand.filter((c) => c !== card);
      s.player.exile = s.player.exile.filter((c) => c !== card);
      s.player.graveyard = s.player.graveyard.filter((c) => c !== card);
      delete card.playable;
      if (fromExile) card.castFromExile = true; else delete card.inExile;   // (it entered from exile, or not)
      s.landsPlayed = landsPlayed(s) + 1;                     // (additional lands this turn, CR 305.2)
      s.landPlayed = true;
      ev.push({ type: "played", id: card.id });
      enter(s, asFace(card, a.face), { payLife: a.payLife }, ev);
      emit(s, { type: "playsLand", obj: card, side: "player", fromExile, fromHand }, ev);   // ("whenever you play a land from exile")
    }

    if (a.type === "plot") {                                 // a special action: no stack (CR 702.170b)
      const card = s.player.hand.find((c) => c.id === a.id) || fblthpTop(s, a.id);
      spend(s, bestPayment(s, plotCost(s, card), { except: card.id }), ev);
      s.player.hand = s.player.hand.filter((c) => c !== card);
      if (s.player.library[0] === card) s.player.library.shift();
      Object.assign(card, { plotted: true, plottedNow: true });   // (it can be cast on a later turn, not this one)
      s.player.exile.push(card);
      ev.push({ type: "plotted", id: card.id });
      emit(s, { type: "becomesPlotted", obj: card, side: "player" }, ev);   // "When this card becomes plotted"
    }

    if (a.type === "ninjutsu") {
      const card = s.player.hand.find((c) => c.id === a.id);
      spend(s, bestPayment(s, card.ninjutsu, { except: card.id }), ev);
      const back = find(s, a.ret); if (back) leave(s, back, "hand", ev);   // (the return is part of the cost)
      ev.push({ type: "ninjutsu", id: card.id });
      s.stack.unshift({ kind: "ability", name: `${card.name}'s ninjutsu`, id: card.id, a: {}, ab: { effect: { ninjutsuEnter: true } }, ctx: { src: card, side: "player", selfId: card.id } });
    }
    if (a.type === "channel") {
      const card = s.player.hand.find((c) => c.id === a.id);
      const h = card.handAbility;
      spend(s, bestPayment(s, h.cost, { except: card.id }), ev);
      if (!h.noDiscard) discardCard(s, card, ev);                // the discard is part of the cost (CR 602.2)
      s.stack.unshift({ kind: "ability", name: `${card.name}'s ability`, id: card.id, a: { target: a.target }, ab: { targets: h.targets, filter: h.filter, effect: h.effect },
        ctx: { src: card, side: "player", selfId: card.id } });
      [...new Set([a.target].flat(2))].map((id) => id && find(s, id)).filter(Boolean)
        .forEach((c) => emit(s, { type: "becomesTarget", obj: c, side: sideOf(s, c), by: "ability", controller: "you" }, ev));
    }

    if (a.type === "renew") {
      // Renew — "[Cost], Exile this card from your graveyard: [Effect]. Activate only as a sorcery." (an activated
      // ability that works from the graveyard, CR 113.6); exiling it is a cost
      const card = s.player.graveyard.find((c) => c.id === a.id);
      const r = card.renew;
      spend(s, bestPayment(s, withX(r.cost, a.x)), ev);
      if (r.discardCost && s.player.hand.length) discardCard(s, s.player.hand[s.player.hand.length > 1 ? choose(s, "Discard which card?", s.player.hand.map((c) => c.name), "player", s.player.hand.map((c) => c.id)) : 0], ev);
      // ("{3}{B}, Sacrifice an artifact or creature: Return this card from your graveyard to the battlefield.")
      if (r.sacCost) { const opts = s.player.battlefield.filter((c) => matches(s, c, r.sacCost.filter, "player")); leave(s, opts[choose(s, "Sacrifice which?", opts.map((c) => c.name), "player", opts.map((c) => c.id))], "graveyard", ev, { sacrificed: true }); }
      if (!r.keep) {
        s.player.graveyard = s.player.graveyard.filter((c) => c !== card);
        s.player.exile.push(card);
        noteExiled(s, [card], "yourGy", ev);
        emit(s, { type: "leavesGraveyard", side: "player", obj: card }, ev);
      }
      ev.push({ type: "renewed", id: card.id });
      s.stack.unshift({ kind: "ability", name: `${card.name}'s renew`, id: card.id, a: { target: a.target, x: a.x }, ab: { targets: r.targets, filter: r.filter, effect: r.effect },
        ctx: { src: card, side: "player", selfId: card.id, x: a.x } });
      [...new Set([a.target].flat(2))].map((id) => id && find(s, id)).filter(Boolean)
        .forEach((c) => emit(s, { type: "becomesTarget", obj: c, side: sideOf(s, c), by: "ability", controller: "you" }, ev));
    }

    if (a.type === "cycle") {
      // CR 602.2: the ability goes on the stack, then its costs are paid — the mana, and discarding the card
      const card = s.player.hand.find((c) => c.id === a.id);
      spend(s, bestPayment(s, withX(card.cycling, a.x), { except: card.id }), ev);
      ev.push({ type: "cycled", id: card.id });
      // CR 702.29c-d: "when you cycle this card" (it triggers from the graveyard, where the card went) and "whenever
      // you discard one or more cards" (once: one card was discarded)
      discardCard(s, card, ev, () => emit(s, { type: "cycled", obj: card, side: "player", x: a.x || 0 }, ev));
      s.stack.unshift({ kind: "ability", name: `${card.name}'s cycling`, id: card.id, a: {}, ab: { effect: { draw: 1 } },
        ctx: { src: card, side: "player", selfId: card.id } });
    }

    if (a.type === "mana") {
      // {T}, sacrifice: add one mana of any color. A mana ability: no stack, usable whenever you have priority.
      const t = find(s, a.id);
      leave(s, t, "graveyard", ev, { sacrificed: true });
      s.pool.push("*");
      ev.push({ type: "mana", id: a.id });
    }

    if (a.type === "cast") {
      const from0 = castable(s, a.id), { card, zone, source, draco } = from0;
      card.castFromExile = zone === "exile"; if (zone !== "exile") delete card.inExile;
      if (from0.assemble) s.assembleUsed = true;   // (Assemble the Players: once each turn)
      if (a.altCost === "zero" && from0.warped) s.warpedUsed = true;   // (Warped Space: once each turn)
      if (from0.valga) payLife(s, manaValue(faceOf(card, a).cost), ev);   // (Valgavoth: "pay life equal to its mana value rather than pay its mana cost")
      for (let i = 0; i < (a.delve || 0); i++) { const l = s.player.graveyard.filter((c) => c.id !== card.id); if (!l.length) break; const c = l[l.length > 1 ? choose(s, `Delve: exile a card from your graveyard (${i + 1} of ${a.delve})`, l.map((x) => x.name), "player", l.map((x) => x.id)) : 0]; s.player.graveyard = s.player.graveyard.filter((x) => x !== c); putCard(s, c, "player", "exile"); noteExiled(s, [c], "yourGy", ev); }
      const gyX = faceOf(card, a).gyExileCost;
      if (gyX) for (let i = 0; i < gyX; i++) { const l = s.player.graveyard; if (!l.length) break; const c = l[l.length > 1 ? choose(s, `Exile a card from your graveyard (${i + 1} of ${gyX})`, l.map((x) => x.name), "player", l.map((x) => x.id)) : 0]; s.player.graveyard = l.filter((x) => x !== c); putCard(s, c, "player", "exile"); }
      if (from0.osteo) { payForage(s, ev, card.id); card.finalityOnEnter = true; }   // (Osteomancer Adept: forage, and a finality counter)
      if (from0.festival) payLife(s, 1, ev);                                       // (Festival of Embers: 1 life)
      if (from0.noctis) { payLife(s, 3, ev); card.finalityOnEnter = true; }        // (Noctis: "that artifact enters with a finality counter on it")
      if (from0.tomb) { s.tombCasts--; card.finalityOnEnter = "Vampire"; }   // (The Tomb of Aclazotz)
      else if (zone === "exile" && card.exiledBy && s.player.battlefield.some((p) => p.id === card.exiledBy && p.paleontologist)) card.finalityOnEnter = true;   // (Intrepid Paleontologist)
      const f = castFace(from0, a);
      // Casting (601.2): face, mode, X and targets are chosen, mana abilities are activated, then costs are paid.
      // A sacrificed creature's power is what it was at that moment (triggers from casting resolve later).
      const pay = castPayment(s, f, a, card.id);
      // a prepare spell's copy: casting it unprepares the permanent (CR 722.3c)
      if (zone === "prepared") { delete source.prepared; changed(s); }
      else s[from0.ownerSide || "player"][zone] = s[from0.ownerSide || "player"][zone].filter((c) => c !== card);
      // ("you may cast an instant or sorcery spell from among them": casting one ends the others' permission)
      if (zone === "exile" && card.oneOf) s.player.exile.filter((c) => c.oneOf === card.oneOf).forEach((c) => { delete c.playable; delete c.oneOf; });
      if (card.conduitCast) s.noMoreSpells = true;            // ("If you do, you can't cast additional spells this turn.")
      ["playable", "plotted", "plottedNow", "discardedThisTurn", "airbent", "oneOf", "graveAdventure", "conduitCast"].forEach((k) => delete card[k]);
      // collect evidence: the chosen cards go from your graveyard to exile (CR 701.59a); a permanent spell remembers it
      if (a.evidence != null) {
        const ids = [].concat(a.evidence);
        s.player.exile.push(...s.player.graveyard.filter((c) => ids.includes(c.id)));
        s.player.graveyard = s.player.graveyard.filter((c) => !ids.includes(c.id));
        if (isPermanent(f)) card.evidenced = true;
        ev.push({ type: "evidence", ids });
        emit(s, { type: "leavesGraveyard", side: "player", obj: { id: ids[0] } }, ev);
        emit(s, { type: "collectsEvidence", side: "player" }, ev);
      }
      const sac = a.sac != null ? find(s, a.sac) : null;
      const sacPower = sac ? Math.max(power(sac), 0) : 0;
      // CR 700.14: expend N — the mana you've spent on spells this turn reaches N with this payment (convoked creatures
      // and life aren't mana)
      const manaPaid = pay.filter((id) => !id.startsWith("life:") && !(find(s, id.split("+")[0]) && (a.convoke || []).includes(id))).length;
      const spentBefore = s.manaSpent || 0;
      if (manaPaid) s.manaSpent = spentBefore + manaPaid;
      card.spentToCast = manaPaid;                             // (Satoru: "no mana was spent to cast them")
      if (lifeTax(s, a.target)) payLife(s, lifeTax(s, a.target), ev);
      // (the creatures that convoked it: "put a flying counter on each creature that convoked it")
      if (spellConvoke(s, f)) { const helpers = convokeHelpers(s); const by = pay.filter((id) => helpers.includes(id)); if (by.length) card.convokedBy = by; else delete card.convokedBy; }
      // the colors of mana spent (converge; "if {W}{W} was spent to cast it"), worked out before the sources are tapped
      if (f.tracksColorsSpent || s.tracksColorsSpent) card.colorsSpent = colorsSpentBy(s, pay, costOf(f, a), a.convoke || [], f.spentWants || []);
      spend(s, pay, ev);
      // harmonize: the chosen creature is tapped as the total cost is paid (CR 702.180b)
      if (a.tapFor != null) tap(s, find(s, a.tapFor), ev);
      // teamwork: the chosen creatures are tapped as the total cost is paid (CR 702.194a)
      if (a.teamwork != null) [].concat(a.teamwork).forEach((id) => tap(s, find(s, id), ev));
      // warp (CR 702.185c): "a spell was warped this turn"; the permanent remembers it was cast for its warp cost
      if (f.warpCast) { s.warped = true; card.warped = true; }
      if (f.evokeCast) card.evoked = true;
      if (f.impendingCast) card.impendingNow = true;
      // web-slinging: returning the tapped creature is part of the cost; the permanent remembers it ("if they were cast
      // using web-slinging")
      if (f.webSlung) { const back = find(s, a.webSling); card.webSlungMV = back ? manaValue(back.cost) : 0; leave(s, back, "hand", ev); card.webSlung = true; }
      // sneak: the unblocked attacker returns to its owner's hand as part of the cost (CR 702.190a)
      if (f.sneakCast) { leave(s, find(s, a.sneak), "hand", ev); card.sneaked = true; }
      // "As an additional cost, discard a card or pay {2}" (a.discard: the card, or "pay")
      if (f.discardCost && a.discard != null && a.discard !== "pay") { const h = s.player.hand.find((c) => c.id === a.discard); if (h) discardCard(s, h, ev); else if (find(s, a.discard)) leave(s, find(s, a.discard), "graveyard", ev, { sacrificed: true }); }
      // "whenever one or more cards leave your graveyard": cast from there (flashback, harmonize)
      if (zone === "graveyard") card.castFromGy = true;   // ("if it was cast from your graveyard")
      if (zone === "graveyard") emit(s, { type: "leavesGraveyard", side: "player", obj: card }, ev);
      [4, 8].forEach((n) => { if (spentBefore < n && s.manaSpent >= n) emit(s, { type: "expend", n, side: "player" }, ev); });
      if (a.offspring) card.offspringPaid = true;                // (the permanent remembers it, CR 702.175a)
      if (a.gift && isPermanent(f)) card.giftPromised = true;
      if (zone === "graveyard" && card.sprinter) card.entersWithCounters = { "+1/+1": 1 };   // ("If you do, this creature enters with a +1/+1 counter")    // ("if the gift was promised", on a permanent)
      if (sac) leave(s, sac, "graveyard", ev, { sacrificed: true });
      // bargain: the sacrifice (CR 702.166a); a bargained permanent spell remembers it ("if it was bargained", 702.166c)
      if (a.bargain != null) {
        const b = find(s, a.bargain);
        if (b) leave(s, b, "graveyard", ev, { sacrificed: true });
        if (isPermanent(f)) card.bargained = true;
      }
      // blight: -1/-1 counters on the chosen creature of yours (beholding only shows a card: nothing changes)
      if (blighted(a)) {
        const b = find(s, a.blight);
        b.counters = { ...(b.counters || {}), "-1/-1": ((b.counters || {})["-1/-1"] || 0) + f.blight.n };
        ev.push({ type: "blight", id: b.id, n: f.blight.n });
      }
      ev.push({ type: "cast", id: card.id, target: a.target, sac: a.sac });
      // CR 601.2i: once cast, "whenever you cast" abilities trigger (prowess), and targeted permanents "become the
      // target of a spell" (Bonecrusher Giant); these go on the stack above the spell and resolve first
      // (with how much mana was spent — opus, increment — and whether it targets a creature — repartee)
      const castTargetsCreature = [a.target].flat(2).some((id) => id && find(s, id) && isCreature(find(s, id)));
      const tlist = [a.target].flat(2).filter((x) => x != null), ownCreature = tlist.length > 0 && tlist.every((id) => s.player.battlefield.some((c) => c.id === id && isCreature(c)));
      emit(s, { type: "cast", obj: f, side: "player", targetCount: new Set([a.target].flat(2).filter((x) => x != null)).size, spellNumber: countSpell(s, "player"),
        spent: manaPaid, creatureMana: pay.filter((id) => !id.startsWith("life:") && !(a.convoke || []).includes(id) && find(s, id.split("+")[0]) && isCreature(find(s, id.split("+")[0]))).length, targetsCreature: castTargetsCreature, targetsOwnCreature: ownCreature, x: a.x, fromHand: zone === "hand", fromExile: zone === "exile" }, ev);
      // "when you next cast an instant or sorcery spell this turn, copy that spell" (Mercurial Spelldancer's delayed
      // trigger, CR 603.7c: it triggers once, on the next one)
      for (let i = 0; i < (s.copyAll || 0); i++) s.triggered.push({ side: "player", name: "Jace Reawakened", srcId: "copy-all", td: defId(COPY_NEXT), event: { id: card.id } });
      if (s.copyNextAny) { s.copyNextAny.forEach((d) => s.triggered.push({ side: "player", name: d.name, srcId: d.srcId, td: defId(COPY_NEXT), event: { id: card.id } })); delete s.copyNextAny; }
      if (s.copyNextCreature && typeHas(f, /creature/i)) { s.copyNextCreature.forEach((d) => s.triggered.push({ side: "player", name: d.name, srcId: d.srcId, td: defId(COPY_NEXT_NL), event: { id: card.id } })); delete s.copyNextCreature; }
      if (s.copyNext && typeHas(f, /instant|sorcery/i)) {
        s.copyNext.forEach((d) => s.triggered.push({ side: "player", name: d.name, srcId: d.srcId, td: defId(COPY_NEXT), event: { id: card.id } }));
        delete s.copyNext;
      }
      commitCrime(s, a.target, "player", ev);
      if (!isPermanent(f) || f.aura) {
        [...new Set([a.target].flat(2))].map((id) => id && find(s, id)).filter(Boolean)
          .forEach((c) => emit(s, { type: "becomesTarget", obj: c, side: sideOf(s, c), by: "spell", controller: "you" }, ev));
      }
      sba(s, ev);
      // state-based actions before the spell resolves: at 0 life you lose and it never resolves
      if (lost(s)) return { state: s, events: ev };
      // Triggers from casting it (a creature that died from a blight or sacrifice) go on the stack above it and
      // resolve first; if one of yours needs a target, the spell waits for that choice
      // CR 601.2a / 405.1: the spell is on the stack; triggers from casting it go on top of it (CR 603.3)
      s.stack.unshift({ kind: "spell", name: f.name, id: card.id, a, card, sacPower, ...(zone === "graveyard" && !f.mayhemCast ? { flashback: true } : {}),
        ...(zone === "prepared" ? { copy: true } : {}), ...(card.bottomAfter ? { bottomAfter: true } : {}) });
    }

    if (a.type === "activate") {
      const card = find(s, a.id);
      const ab = abilitiesOf(card)[a.index];
      const pay = ab.cost ? bestPayment(s, abilityCost(s, card, ab, a.x, ab.waterbend ? a.waterTap || [] : undefined, a.target), { exclude: [...(ab.tap ? [card.id] : []), ...(a.waterTap || [])], forWhat: { ability: card } }) : [];
      (ab.waterbend ? a.waterTap || [] : []).forEach((id) => tap(s, find(s, id), ev));   // waterbend: tapped to help pay
      // CR 602.2: the ability goes on the stack, then its costs are paid; it's independent of its source (CR 113.7a)
      const ctx = { src: lastKnown(card), side: "player", sacPower: Math.max(power(card), 0), selfId: card.id, x: a.x, ...(a.split ? { split: a.split } : {}) };
      spend(s, pay, ev);
      // a special action (CR 116.2b): it happens now, without using the stack
      if (ab.special === "turnFaceUp") { const fx = a.x; turnFaceUp(s, card, ev, fx); sba(s, ev); settle(s, ev); return { state: s, events: ev }; }
      if (ab.special === "unlock") { unlockDoor(s, card, ab.door, ev); sba(s, ev); settle(s, ev); return { state: s, events: ev }; }
      if (ab.tap) tap(s, card, ev);
      // the crew / saddle cost; CR 702.122d, 702.171c: each creature tapped for it "crews the Vehicle" / "saddles the Mount"
      // station: the tapped creature's power (as it's tapped) is how many charge counters
      if (ab.stationAb) { const m = find(s, a.crew[0]); ctx.tappedPower = Math.max(power(m), 0); tap(s, m, ev); }
      (ab.crew ? a.crew : []).forEach((id) => {
        const m = find(s, id);
        tap(s, m, ev);
        emit(s, { type: "crews", obj: m, side: "player", vehicle: card.id, main: inMain(s) }, ev);
        if (!ab.saddle) card.crewedBy = [...new Set([...(card.crewedBy || []), id])];   // ("target creature that crewed it this turn")
        else card.saddledBy = [...new Set([...(card.saddledBy || []), id])];                // ("a creature that saddled it this turn")
      });
      if (ab.powerUp) card.poweredUp = true;
      if (ab.oncePerTurn) card.usedOnce = [...(card.usedOnce || []), exhaustSlot(card, ab)];                       // (power-up: only once, CR 702.193a)
      // an exhaust ability is used up (CR 702.177a); "whenever you activate an exhaust ability" triggers (CR 602.2)
      if (ab.exhaust) {
        card.exhausted = [...new Set([...(card.exhausted || []), exhaustSlot(card, ab)])].sort();
        s.exhaustedThisTurn = true;
        emit(s, { type: "exhaust", obj: card, side: "player" }, ev);
      }
      if (ab.craft) {                                                     // the craft cost: exile it and the material(s)
        [].concat(a.craft).forEach((id) => {
          const mat = find(s, id);
          if (mat) leave(s, mat, "exile", ev);
          else { const g = s.player.graveyard.find((x) => x.id === id); s.player.graveyard = s.player.graveyard.filter((x) => x !== g); s.player.exile.push(g); }
        });
        card.craftedWith = [].concat(a.craft);                        // ("the exiled cards used to craft it")
        leave(s, card, "exile", ev);
      }
      // CR 606.4: a loyalty ability's cost puts on or removes loyalty counters
      if (ab.loyalty != null) {
        card.loyaltyUsed = (card.loyaltyUsed || 0) + 1;
        s.loyaltyActivated = true;                                 // ("if you've activated a loyalty ability this turn")
        if (ab.loyalty > 0) addLoyalty(s, card, ab.loyalty, "player", ev);
        // ("−X": X loyalty counters, X chosen as it's activated, CR 606.4, 107.3)
        else card.counters = { ...(card.counters || {}), loyalty: loyaltyOf(card) + ab.loyalty - (ab.loyaltyX ? a.x || 0 : 0) };
      }
      if (ab.removeAmong) {
        const r = ab.removeAmong;
        for (let i = 0; i < r.n; i++) {
          const opts = s.player.battlefield.filter((c) => objectIs(c, r.filter || {}) && !(r.other && c.id === card.id)).flatMap((c) => Object.entries(c.counters || {}).filter(([k, n]) => n > 0 && (!r.kind || k === r.kind)).map(([k]) => [c, k]));
          if (!opts.length) break;
          const [c, k] = opts[opts.length > 1 ? choose(s, `Remove a counter (${i + 1} of ${r.n})`, opts.map(([x, kk]) => `${kk} from ${x.name}`), "player") : 0];
          c.counters = { ...c.counters, [k]: c.counters[k] - 1 }; if (!c.counters[k]) delete c.counters[k];
        }
        changed(s);
      }
      if (ab.removeCounters) {
        const { kind, n = 1 } = ab.removeCounters;
        // ("Remove a counter from this creature": any kind — its controller picks which, one at a time)
        for (let i = 0; i < n; i++) {
          const kinds = kind === "any" ? Object.keys(card.counters || {}).filter((k) => card.counters[k] > 0) : [kind];
          const k = kinds[kinds.length > 1 ? choose(s, "Remove which counter?", kinds.map((x) => `A ${x} counter`), "player", card.id) : 0];
          card.counters = { ...card.counters, [k]: card.counters[k] - 1 };
          if (!card.counters[k]) delete card.counters[k];
        }
        changed(s);
      }
      if (ab.sacSelf) leave(s, card, "graveyard", ev, { sacrificed: true });
      if (ab.exileSelfCost) leave(s, card, "exile", ev);   // ("Exile The Echoverse Fulcrum" as a cost)
      if (ab.discardHandCost) [...s.player.hand].forEach((c) => discardCard(s, c, ev));   // ("Discard your hand:" a cost)
      if (ab.discardCost) {
        const l = a.discard != null ? [].concat(a.discard) : s.player.hand.slice(0, discardCount(ab)).map((c) => c.id);
        l.forEach((id) => { const c = s.player.hand.find((x) => x.id === id); if (c) discardCard(s, c, ev); });
      }
      if (ab.lifeCost) payLife(s, ab.lifeCost, ev);
      // "Sacrifice two other creatures": at once (one look-back for their triggers, CR 603.10a); "deals damage equal to the
      // sacrificed creature's power" reads the first one
      if (ab.sacCost) {
        const sacs = (a.sacs || sacCostOptions(s, card, ab).slice(0, ab.sacCost.n)).map((id) => find(s, id)).filter(Boolean);
        if (sacs.length) { ctx.sacPower = Math.max(power(sacs[0]), 0); ctx.sacMV = manaValue(sacs[0].cost); }
        const before = s.listens.length ? battlefieldNow(s) : null;
        sacs.forEach((c) => (ab.sacCost.exile ? leave(s, c, "exile", ev) : leave(s, c, "graveyard", ev, { sacrificed: true, lookBack: before })));   // ("Exile a creature you control" as a cost)
      }
      if (ab.tapCost) (a.taps || tapCostOptions(s, card, ab).slice(0, ab.tapCost.n)).forEach((id) => tap(s, find(s, id), ev));
      if (ab.tapArtifactsX) [].concat(a.taps || []).forEach((id) => tap(s, find(s, id), ev));
      if (ab.removeCounterCost) [].concat(a.rc != null ? a.rc : counterRemovals(s, ab)[0] || []).forEach((id) => { const rc = find(s, id); if (rc && (rc.counters || {})["+1/+1"] > 0) { rc.counters = { ...rc.counters, "+1/+1": rc.counters["+1/+1"] - 1 }; changed(s); } });
      if (ab.selfCounterCost) { card.counters = { ...card.counters, [ab.selfCounterCost]: card.counters[ab.selfCounterCost] - 1 }; changed(s); }
      if (ab.forageCost) payForage(s, ev);
      if (ab.exileArtifactCardsX) for (let i = 0; i < (a.x || 0); i++) { const l = s.player.graveyard.filter((c) => isArtifact(faceOf(c, {}))); if (!l.length) break; const c = l[l.length > 1 ? choose(s, `Exile an artifact card from your graveyard (${i + 1} of ${a.x})`, l.map((x) => x.name), "player", l.map((x) => x.id)) : 0]; s.player.graveyard = s.player.graveyard.filter((x) => x !== c); putCard(s, c, "player", "exile"); noteExiled(s, [c], "yourGy", ev); }
      if (ab.sacArtifactsAny) { const ids = [].concat(a.sacs || []); ctx.sacCount = ids.length; const before = battlefieldNow(s); ids.forEach((id) => { const c = find(s, id); if (c) leave(s, c, "graveyard", ev, { sacrificed: true, lookBack: before }); }); }
      if (ab.evidenceCost) {   // CR 701.59a: collect evidence N — the cards are "exiled with" this permanent (Kylox's Voltstrider)
        const ids = a.evidence != null ? [].concat(a.evidence) : (evidenceSets(s.player.graveyard, ab.evidenceCost)[0] || []).map((c) => c.id);
        ids.forEach((id) => { const c = s.player.graveyard.find((x) => x.id === id); if (!c) return; s.player.graveyard = s.player.graveyard.filter((x) => x !== c); c.exiledBy = card.id; putCard(s, c, "player", "exile"); });
        noteExiled(s, ids.map((id) => s.player.exile.find((x) => x.id === id)), "yourGy", ev);
        emit(s, { type: "evidence", side: "player" }, ev);
      }
      if (ab.exileArtifactsX) [].concat(a.exiles || artifactsToExile(s, card).slice(0, 1)).forEach((id) => { const m = find(s, id); if (m) leave(s, m, "exile", ev); });
      if (ab.exileCost) {
        const ids = a.exiles || exileCostOptions(s, ab).slice(0, ab.exileCost.n);
        const gone = s.player.graveyard.filter((c) => ids.includes(c.id));
        s.player.graveyard = s.player.graveyard.filter((c) => !ids.includes(c.id));
        s.player.exile.push(...gone);
        if (gone.length) emit(s, { type: "leavesGraveyard", side: "player", obj: { id: gone[0].id } }, ev);
      }
      // a blight cost (CR 701.68a): -1/-1 counters on the chosen creature of yours (it may be this one)
      if (ab.blight) {
        const b = find(s, a.blight) || s.player.battlefield.find(isCreature);
        b.counters = { ...(b.counters || {}), "-1/-1": ((b.counters || {})["-1/-1"] || 0) + ab.blight };
        ev.push({ type: "blight", id: b.id, n: ab.blight });
      }
      ev.push({ type: "activate", id: card.id, index: a.index, target: a.target });
      [...new Set([a.target].flat(2))].map((id) => id && find(s, id)).filter(Boolean)
        .forEach((c) => emit(s, { type: "becomesTarget", obj: c, side: sideOf(s, c), by: "ability", controller: "you" }, ev));
      // CR 602.2a: the ability is on the stack (triggers from paying its costs go on top of it)
      s.stack.unshift({ kind: "ability", name: `${card.name}'s ability`, id: card.id, a, ab, ctx });
      // ("Whenever you activate an ability that isn't a mana ability": where it is on the stack, from the bottom)
      if (!isManaAbility(ab)) emit(s, { type: "activates", obj: card, side: "player", count: s.stack.length }, ev);
      commitCrime(s, a.target, "player", ev);
    }

    if (a.type === "attack") {
      enterStep(s, "attackers", null, ev);
      s.combat = { attackers: [...a.ids], blocks: null, blocked: {}, fsHappened: false, dealtFirst: [], ...(a.at ? { at: { ...a.at } } : {}) };
      if (s.tracksSources) s.attackedCount = a.ids.length;     // ("three or more creatures attacked this turn")
      s.attackedIds = [...a.ids];                              // ("each creature that attacked this turn")
      if (a.ids.some((id) => find(s, id) && hasType(find(s, id), "Hero"))) s.heroAttacked = true;   // ("if you attacked with a Hero this turn")
      const attackers = a.ids.map((id) => find(s, id));
      attackers.forEach((c) => { if (!has(c, "vigilance")) tap(s, c, ev); });   // CR 508.1f
      ev.push({ type: "attack", ids: a.ids });
      // CR 508.1m / 508.2: abilities that trigger on attackers being declared trigger now ("whenever this attacks",
      // battle cry; "attacks alone" for exalted, CR 702.83a), and go on the stack in the declare attackers step
      attackers.forEach((c) => emit(s, { type: "attacks", obj: c, side: "player", toBattle: !!(a.at && a.at[c.id] && isBattle(find(s, a.at[c.id]))), equipped: isEquipped(s, c) }, ev));
      if (attackers.length === 1) emit(s, { type: "attacksAlone", obj: attackers[0], side: "player" }, ev);
      emit(s, { type: "youAttack", side: "player", count: attackers.length, attackers }, ev);   // "whenever you attack"
      // All-Out Assault: "When you next attack this turn, untap each creature you control." (a delayed trigger)
      if (s.untapOnNextAttack) { delete s.untapOnNextAttack; s.triggered.push({ side: "player", name: "All-Out Assault", srcId: "all-out-assault", td: defId(UNTAP_YOURS), event: {} }); }
    }

    if (a.type === "pass") resolveTop(s, ev);                 // CR 117.4: everyone passed, the top object resolves

    if (a.type === "advance") {
      // each step: its turn-based actions and triggers, then you receive priority (CR 117.3a); stop if you can act
      // on something that went on the stack, or a trigger of yours needs its target
      while (at(s.phase) < at(a.to) && !won(s) && !lost(s) && !(s.pending.length && s.pending[0].side === "player") && !s.stack.length) {
        // CR 506.1 / 500.8: "After this phase, there is an additional combat phase" — end of combat goes to a new
        // beginning of combat step (not the second main phase); you get priority there to declare attackers again
        if (s.phase === "main2" && (s.combatsAfterMain2 || 0) > 0) {   // (Full Throttle cast in the second main phase: combats, then the end step)
          s.extraCombats = (s.extraCombats || 0) + s.combatsAfterMain2 - 1; s.combatsAfterMain2 = 0; s.endAfterCombats = !s.keepMain2; delete s.keepMain2;
          s.combatNumber = (s.combatNumber || 1) + 1; s.combat = null; s.attacked = false;
          ev.push({ type: "extraCombat", n: s.combatNumber });
          enterStep(s, "boc", null, ev);
          flushPending(s, ev);
          break;
        }
        if (s.phase === "eoc" && s.extraMainAfterCombat && !(s.extraCombats > 0)) {   // (All-Out Assault: the additional main phase; cast in the first main phase, the regular combat still follows)
          const then = s.extraMainAfterCombat; delete s.extraMainAfterCombat; delete s.endAfterCombats;
          s.pool = []; s.rpool = []; s.combat = null; s.phase = "main2"; ev.push({ type: "extraMain" }); emit(s, { type: "main2", side: "player" }, ev);
          if (then === "thenCombat") { s.combatsAfterMain2 = (s.combatsAfterMain2 || 0) + 1; s.keepMain2 = true; }
          flushPending(s, ev); break;
        }
        if (s.phase === "eoc" && s.endAfterCombats && !(s.extraCombats > 0)) { delete s.endAfterCombats; enterStep(s, "end", null, ev); flushPending(s, ev); break; }
        if (s.phase === "eoc" && (s.extraUpkeeps || 0) > 0) {
          s.extraUpkeeps--; s.pool = []; s.rpool = [];
          ev.push({ type: "extraUpkeep" });
          emit(s, { type: "upkeep", side: "player" }, ev);
          flushPending(s, ev);
          break;
        }
        if (s.phase === "eoc" && (s.extraCombats || 0) > 0) {
          s.extraCombats--; s.combatNumber = (s.combatNumber || 1) + 1;
          s.combat = null; s.attacked = false; delete s.firePool; delete s.onlyLandCreaturesAttack;
          if (s.nextCombatOnlyLands) { s.onlyLandCreaturesAttack = true; delete s.nextCombatOnlyLands; }
          ev.push({ type: "extraCombat", n: s.combatNumber });
          enterStep(s, "boc", null, ev);
          flushPending(s, ev);
          break;
        }
        // "there is an additional end step after this step" (Y'shtola Rhul)
        if (s.phase === "end" && (s.extraEnds || 0) > 0) { s.extraEnds--; ev.push({ type: "extraEnd" }); enterStep(s, "end", null, ev); flushPending(s, ev); break; }
        const next = STEPS[at(s.phase) + 1];
        const blocks = next === "blockers" && s.combat ? a.blocks || opponentBlocks(s) : null;
        enterStep(s, next, blocks, ev);
        flushPending(s, ev);
      }
    }

    // CR 704.3: state-based actions are checked whenever a player would get priority — after the action, not in the
    // middle of resolving something
    sba(s, ev);
    settle(s, ev);
    return { state: s, events: ev };
  }

  // A player loses at 0 or less life, or with 10 or more poison counters (rule 704.5a/c). You lose too when
  // your shown life hits 0, and if both of you hit it at once the game is a draw: not a win either.
  const dead = (z) => (z.life != null && z.life <= 0 && !z.battlefield.some((c) => c.grimoire && !(c.st && c.st.lost))) || (z.poison || 0) >= 10 || !!z.lostGame;   // (or an effect says they lose the game)
  const lost = (s) => dead(s.player);
  const won = (s) => dead(s.opponent) && !lost(s);

  /* ---------- choices ---------- */
  function combinations(list, k) {
    const out = [];
    (function go(start, acc) {
      if (acc.length === k) { out.push(acc); return; }
      for (let i = start; i < list.length; i++) go(i + 1, [...acc, list[i]]);
    })(0, []);
    return out;
  }
  const subsets = (list) => list.reduce((acc, x) => [...acc, ...acc.map((l) => [...l, x])], [[]]);
  const permutations = (list) => (list.length <= 1 ? [list] : list.flatMap((x, i) => permutations([...list.slice(0, i), ...list.slice(i + 1)]).map((p) => [x, ...p])));
  // every way to split `total` into `k` parts of at least 1
  const compositions = (total, k) => (k === 1 ? (total >= 1 ? [[total]] : []) :
    Array.from({ length: Math.max(total - k + 1, 0) }, (_, i) => i + 1).flatMap((first) => compositions(total - first, k - 1).map((r) => [first, ...r])));

  // Scry/surveil: which known top cards stay on top (in which order) and which go away
  function scryChoices(ids) {
    const out = [];
    for (let mask = 0; mask < 1 << ids.length; mask++) {
      const keep = ids.filter((_, i) => mask & (1 << i)), away = ids.filter((_, i) => !(mask & (1 << i)));
      permutations(keep).forEach((top) => out.push({ top, away }));
    }
    return out;
  }

  // Every way to choose the targets (and divided damage) of a spell for its chosen mode(s)
  function castTargets(s, f, a, sac) {
    if (isPermanent(f) && !f.aura) return [{}];             // no targets as it's cast (its enters trigger targets later)
    const parts = plan(f, a);
    let combos = [[]];
    parts.forEach((p) => { const opts = partOptions(s, f, p, sac); combos = combos.flatMap((acc) => opts.map((o) => [...acc, o])); });
    const many = manyModes(f);
    return combos.map((list) => (many ? { target: list.map((o) => o.target) } : { ...list[0] }));
  }
  function partOptions(s, f, p, sac) {
    if (p.slots) {
      let out = [[]];
      p.slots.forEach((sl) => { const l = targetsFor(s, f, sl.targets, sl.filter); out = out.flatMap((acc) => l.filter((t) => !acc.includes(t)).map((t) => [...acc, t])); });
      return out.map((target) => ({ target }));
    }
    if (!p.targets) return [{ target: undefined }];
    const choices = targetChoices(targetsFor(s, f, p.targets, p.filter).filter((t) => t !== sac), p.count);
    if (!choices.length) return p.count.min === 0 ? [{ target: undefined }] : [];
    if (p.effect && p.effect.divided) {
      return choices.flatMap((t) => { const ts = [].concat(t); return compositions(p.total, ts.length).map((split) => ({ target: ts, split })); });
    }
    return choices.map((target) => ({ target }));
  }
  // Your tapped creatures (web-slinging returns one); the cards you could discard (unknown cards: one stands for all)
  const tappedMine = (s) => s.player.battlefield.filter((c) => isCreature(c) && c.tapped).map((c) => c.id);
  // Your unblocked attacking creatures, once blockers are declared (sneak returns one)
  const unblockedMine = (s) => (s.combat && s.combat.blocks ? s.combat.attackers.filter((id) => !s.combat.blocked[id] && s.player.battlefield.some((c) => c.id === id)) : []);
  function discardChoices(s, except) {
    const seen = new Set();
    return s.player.hand.filter((c) => c.id !== except && (c.unknown ? !seen.has("?") && seen.add("?") : true)).map((c) => c.id);
  }
  // Every legal play, cast (with each mode/color/X/sacrifice/target choice), activation, mana ability and attack right now
  // An ability's divided damage total: "X damage divided as you choose …, where X is the greatest power among creatures you
  // control as you activate this ability" (worked out as it's activated)
  const abilityDividedTotal = (s, ab) => (ab.dividedTotal === "greatestPower" ? Math.max(0, ...s.player.battlefield.filter(isCreature).map((c) => power(c))) : ab.dividedTotal || 0);
  function legalActions(s) {
    const out = [];
    if (!hasPriority(s)) return out;
    if (s.pending.length) {                                    // one of yours waits: a trigger's target, or scry
      const p = s.pending[0];
      if (p.kind === "choice") { p.labels.forEach((_, pick) => out.push({ type: "choice", pick })); return out; }
      const order = orderChoices(s);
      if (order.length) { order.forEach((pick) => out.push({ type: "order", pick })); return out; }
      if (p.kind === "scry") scryChoices(s.player.library.slice(0, p.n).map((c) => c.id)).forEach((c) => out.push({ type: "scry", ...c }));
      else {
        const d = trig(p);
        if (d.slots) { triggerTargetOptions(s, p).forEach((target) => out.push({ type: "trigger", target })); return out; }
        if (d.count && d.count.min === 0) out.push({ type: "trigger", target: undefined });
        targetChoices(targetsFor(s, srcOf(s, p), d.targets, d.filter, p.side), d.count).forEach((target) => out.push({ type: "trigger", target }));
      }
      return out;
    }
    if (s.stack.length) out.push({ type: "pass" });           // let the top of the stack resolve (CR 117.4)
    const range = (n) => Array.from({ length: Math.max(n, 0) }, (_, i) => i + 1);
    const draco = dracoOn(s);
    const sources = [...s.player.hand.map((card) => ({ card, zone: "hand", draco })),
      ...(landsFromGraveyard(s) ? s.player.graveyard.filter((c) => isLand(faceOf(c, {}))) : s.player.graveyard.filter((c) => isLand(faceOf(c, {})) && c.mayhem && c.discardedThisTurn)).map((card) => ({ card, zone: "graveyard" })),   // (mayhem: a land discarded this turn)
      ...s.player.exile.filter((c) => castable(s, c.id) || (c.playable && isLand(faceOf(c, {})))).map((card) => ({ card, zone: "exile" })),
      ...s.player.graveyard.filter((c) => !isLand(faceOf(c, {})) && castable(s, c.id)).map((card) => ({ card, zone: "graveyard" })),
      // (an instant or sorcery in the opponent's graveyard, The Great Work; the top of your library, Errant and Giada)
      ...(s.instSorcAnyGraveyard ? s.opponent.graveyard.filter((c) => castable(s, c.id)).map((card) => ({ card, zone: "graveyard" })) : []),
      ...(s.player.library[0] && (castable(s, s.player.library[0].id) || (libTopLands(s) && isLand(faceOf(s.player.library[0], {})))) ? [{ card: s.player.library[0], zone: "library" }] : []),
      // a prepared permanent's prepare spell (a copy you may cast, CR 722.3c)
      ...s.player.battlefield.filter((c) => c.prepared && c.prepare).map((p) => ({ card: preparedSpell(p), zone: "prepared" }))];
    // (Fblthp: plotting the top card of your library)
    { const top = s.player.library[0]; if (top && fblthpTop(s, top.id) && !check(s, { type: "plot", id: top.id })) out.push({ type: "plot", id: top.id }); }
    // ninjutsu: each card with it, returning each unblocked attacker of yours
    s.player.hand.filter((c) => c.ninjutsu).forEach((c) => unblockedMine(s).forEach((ret) => { if (!check(s, { type: "ninjutsu", id: c.id, ret })) out.push({ type: "ninjutsu", id: c.id, ret }); }));
    // abilities of cards in your hand that discard them ("{1}{R}, Discard this card: …")
    s.player.hand.filter((c) => c.handAbility && !check(s, { type: "channel", id: c.id })).forEach((c) => {
      const h = c.handAbility;
      (h.targets ? [...(h.targetCount && h.targetCount.min === 0 ? [undefined] : []), ...targetsFor(s, c, h.targets, h.filter)] : [undefined]).forEach((target) => out.push({ type: "channel", id: c.id, target }));
    });
    // renew: an ability of a card in your graveyard (one per target)
    s.player.graveyard.filter((c) => c.renew && c.renew.x).forEach((c) => [...Array(Math.max(0, manaAvailable(s) - manaValue(c.renew.cost)) + 1).keys()].forEach((x) =>
      targetChoices(targetsFor(s, c, c.renew.targets, c.renew.filter), { min: x, max: x }).forEach((target) => { if (!check(s, { type: "renew", id: c.id, x, target })) out.push({ type: "renew", id: c.id, x, target }); })));
    s.player.graveyard.filter((c) => c.renew && !c.renew.x && !check(s, { type: "renew", id: c.id })).forEach((c) =>
      (c.renew.targets ? targetsFor(s, c, c.renew.targets, c.renew.filter) : [undefined]).forEach((target) => out.push({ type: "renew", id: c.id, target })));
    for (const { card, zone } of sources) {
      if (card.unknown) continue;
      if (zone === "hand" && card.plot && !check(s, { type: "plot", id: card.id })) out.push({ type: "plot", id: card.id });
      if (zone === "hand" && card.cycling) (/\{X\}/.test(card.cycling) ? [...Array(Math.max(0, manaAvailable(s) - manaValue(card.cycling)) + 1).keys()] : [undefined]).forEach((x) => { if (!check(s, { type: "cycle", id: card.id, x })) out.push({ type: "cycle", id: card.id, ...(x != null ? { x } : {}) }); });
      // disguise: cast it face down for {3}
      if (card.disguise && !check(s, { type: "cast", id: card.id, faceDown: true })) out.push({ type: "cast", id: card.id, faceDown: true });
      const faces = card.faces ? (zone === "exile" || card.layout === "transform" ? [0] : card.faces.map((_, i) => i)) : [undefined];
      for (const face of faces) {
        const f = castFace({ card, zone, draco: zone === "hand" && draco }, { face });
        if (isLand(f)) {
          // a land you may pay life for: both choices (pay and enter untapped, or don't and enter tapped)
          (f.payLifeOrTapped ? [true, false] : [undefined]).forEach((payLife) => {
            const a = { type: "play", id: card.id, face, ...(payLife === undefined ? {} : { payLife }) };
            if ((zone === "hand" || card.playable || zone === "graveyard") && !check(s, a)) out.push(a);
          });
          continue;
        }
        // (a spell that's only affordable with its cost reduction — evidence collected, bargained — still has casts)
        const fr0 = castable(s, card.id) || {};
        const reducible = [...(f.evidenceLess ? evidenceOptions(s, f.evidence).map((evidence) => ({ evidence })) : []),
          ...(fr0.mutation ? [{ altCost: "mutation" }] : []), ...(fr0.warped || fr0.weft ? [{ altCost: "zero" }] : []),
          ...(!f.evidence && unravelerOn(s) ? evidenceOptions(s, 10).map((evidence) => ({ evidence })) : []),   // (Conspiracy Unraveler)
          ...(f.bargainLess ? bargainOptions(s).map((bargain) => ({ bargain })) : []),
          ...(f.harmonizing ? convokeHelpers(s).map((tapFor) => ({ tapFor })) : []),               // (harmonize: a tapped creature)
          ...(zone === "hand" && (card.warp || fr0.warpCost) ? [{ warp: true }] : []),                                // (its warp cost)
          ...(zone === "hand" && card.impending ? [{ impending: true }] : []),                      // (its impending cost)
          ...(zone === "hand" && card.webSlinging ? tappedMine(s).map((webSling) => ({ webSling })) : []),   // (web-slinging)
          ...(zone === "hand" && card.sneak ? unblockedMine(s).map((sneak) => ({ sneak })) : []),          // (sneak)
          ...(f.behold && f.behold.flash ? beholdOptions(s, f).slice(0, 1).map((behold) => ({ behold })) : [])];   // (flash by beholding)
        if (check(s, { type: "cast", id: card.id, face }) && !reducible.some((r) => !check(s, { type: "cast", id: card.id, face, ...r }))) continue;
        const n = f.chooseCount || 1;
        const modes = f.modes ? (f.pawprints ? pawCombos(f) : f.spree || f.oneOrMoreIf ? subsets(f.modes.map((_, i) => i)).filter((l) => l.length)
          : f.repeatModes ? multisets(f.modes.map((_, i) => i), n) : n > 1 ? combinations(f.modes.map((_, i) => i), n) : f.modes.map((_, i) => i)) : [undefined];
        const colors = f.chooseColor ? [..."WUBRG"] : [undefined];
        const xs = parseCost(f.cost).x ? range(manaAvailable(s) - manaValue(f.cost)) : [undefined];
        const sacs = f.sacrifice ? sacrificeOptions(s, f) : [undefined];
        // additional costs: which creature to blight (or not / pay instead), behold (any one Goblin does the same) or pay,
        // and which creatures help pay through convoke
        const blights = f.blight ? [...blightOptions(s), ...(f.blight.optional ? [undefined] : []), ...(f.blight.orPay ? ["pay"] : [])] : [undefined];
        // offspring and gift: paid / promised or not
        const offsprings = f.offspring ? [undefined, true] : [undefined];
        const gifts = f.gift ? [undefined, true] : [undefined];
        // (beholding only shows cards: any choice of them does the same, so one is enough)
        const bn = f.behold && (f.behold.count || 1), bopts = f.behold ? beholdOptions(s, f) : [];
        const beholds = f.behold ? [...(bopts.length >= bn ? [bn > 1 ? bopts.slice(0, bn) : bopts[0]] : []), ...(f.behold.orPay ? ["pay"] : []), ...(f.behold.optional ? [undefined] : [])] : [undefined];
        // harmonize: tap no creature, or one of your untapped creatures
        const tapFors = f.harmonizing ? [undefined, ...convokeHelpers(s)] : [undefined];
        // warp: cast it normally, or for its warp cost
        // (and evoke: cast it for its evoke cost, CR 702.74a — "evoke")
        const warps = [undefined, ...(zone === "hand" && (card.warp || fr0.warpCost) ? [true] : []), ...(zone === "hand" && card.evoke ? ["evoke"] : []), ...(fr0.mutation ? ["mutation"] : []), ...(fr0.warped || fr0.weft ? ["zero"] : [])];
        const impendings = zone === "hand" && card.impending ? [undefined, true] : [undefined];
        // sneak: in your declare blockers step, returning each unblocked attacker of yours
        const sneaks = zone === "hand" && card.sneak ? [undefined, ...unblockedMine(s)] : [undefined];
        // web-slinging: normally, or returning each tapped creature of yours
        const webSlings = zone === "hand" && card.webSlinging ? [undefined, ...tappedMine(s)] : [undefined];
        // a discard cost: each other card in your hand (unknown cards are all alike: one of them), or pay
        const discards = f.discardCost ? [...(f.discardCost.sacOnly ? s.player.battlefield.filter((c) => objectIs(c, f.discardCost.sacOnly)).map((c) => c.id) : discardChoices(s, card.id)), ...(f.discardCost.orPay ? ["pay"] : []), ...(f.discardCost.orSacrifice ? s.player.battlefield.map((c) => c.id) : [])] : [undefined];
        const convokes = spellConvoke(s, f) ? subsets(convokeHelpers(s)).filter((l) => l.length <= manaValue(f.cost) + (f.behold && f.behold.orPay ? manaValue(f.behold.orPay) : 0)) : [undefined];
        // compleated: how many Phyrexian pips are paid with life (each costs the walker two loyalty)
        const lifePipsList = has(f, "compleated") ? [0, ...range(parseCost(f.cost).pips.filter((p) => /\/P$/.test(p)).length)] : [undefined];
        // bargain: not bargained, or each permanent you could sacrifice for it
        const bargains = f.bargain ? [undefined, ...bargainOptions(s)] : [undefined];
        // collect evidence (optional): not, or each set of graveyard cards that's just enough
        const evidences = f.evidence ? [undefined, ...evidenceOptions(s, f.evidence)] : unravelerOn(s) ? [undefined, ...evidenceOptions(s, 10)] : [undefined];
        for (const mode of modes) for (const color of colors) for (const x of xs) for (const sac of sacs) for (const bargain of bargains) for (const evidence of evidences)
          for (const blight of blights) for (const behold of beholds) for (const convoke of convokes) for (const lifePips of lifePipsList) for (const offspring of offsprings) for (const gift of gifts) for (const tapFor of tapFors) for (const warp of warps) for (const impending of impendings) for (const webSling of webSlings) for (const discard of discards) for (const sneak of sneaks) {
            for (const pick of castTargets(s, f, { mode, x, blight, bargain, evidence, gift, behold }, sac)) {
              const a = { type: "cast", id: card.id, face, mode, color, x, sac, ...pick };
              if (tapFor !== undefined) a.tapFor = tapFor;
              if (warp === true) a.warp = true;
              if (warp === "evoke") a.evoke = true;
              if (warp === "mutation" || warp === "zero") a.altCost = warp;
              if (impending) a.impending = true;
              if (webSling !== undefined) a.webSling = webSling;
              if (discard !== undefined) a.discard = discard;
              if (sneak !== undefined) a.sneak = sneak;
              if (evidence !== undefined) a.evidence = evidence;
              if (offspring) a.offspring = true;
              if (gift) a.gift = true;
              if (blight !== undefined) a.blight = blight;
              if (behold !== undefined) a.behold = behold;
              if (convoke !== undefined) a.convoke = convoke;
              if (lifePips) a.lifePips = lifePips;
              if (bargain !== undefined) a.bargain = bargain;
              if (!check(s, a)) out.push(a);
            }
          }
        // teamwork: cast it using teamwork, tapping each set of creatures with enough power (its teamwork version:
        // both modes, or the stronger effect)
        if (f.teamwork) {
          for (const teamwork of teamworkChoices(s, f.teamwork)) {
            const ft = castFace({ card, zone, draco: zone === "hand" && draco }, { face, teamwork });
            const tmodes = ft.modes ? (manyModes(ft) ? combinations(ft.modes.map((_, i) => i), ft.chooseCount || 1) : ft.modes.map((_, i) => i)) : [undefined];
            const txs = parseCost(ft.cost).x ? range(manaAvailable(s) - manaValue(ft.cost)) : [undefined];
            for (const mode of tmodes) for (const x of txs) for (const pick of castTargets(s, ft, { mode, x, teamwork })) {
              const a = { type: "cast", id: card.id, face, mode, x, ...pick, teamwork };
              if (!check(s, a)) out.push(a);
            }
          }
        }
      }
    }
    for (const card of s.player.battlefield) {
      abilitiesOf(card).forEach((ab, index) => {
        const xs = ab.exileArtifactCardsX ? [...Array(s.player.graveyard.filter((c) => isArtifact(faceOf(c, {}))).length + 1).keys()]   // (Winter, Cursed Rider: X artifact cards)
          : ab.loyaltyX ? [...Array(loyaltyOf(card) + 1).keys()].slice(1)
          : parseCost(ab.cost).x ? range(manaAvailable(s, ab.tap ? [card.id] : []) - manaValue(ab.cost)) : [undefined];
        xs.forEach((x) => {
          if (abilityProblem(s, card, ab, x)) return;
          // crewing a Vehicle that's already a creature does nothing more (solver: only crews that matter) — unless
          // something triggers on crewing
          if (ab.crew) { if ((ab.saddle ? !card.saddled : !isCreature(card)) || s.listens.includes("crews")) crewChoices(s, card, ab.crew).forEach((crew) => out.push({ type: "activate", id: card.id, index, crew })); return; }
          if (ab.craft) { craftOptions(s, card, ab.craft).forEach((m) => out.push({ type: "activate", id: card.id, index, craft: m })); return; }
          if (ab.stationAb) { crewHelpers(s, card).forEach((id) => out.push({ type: "activate", id: card.id, index, crew: [id] })); return; }
          const list = ab.targets ? targetsFor(s, card, ab.targets, ab.filter).filter((t) => !(ab.effect && ab.effect.attach && t === card.attachedTo)) : null;
          // (discarding several: each set of cards, unknown cards being all alike)
          const dn = discardCount(ab);
          const discardSets = () => { const seen = new Set(); return combinations(s.player.hand.map((c) => c.id), dn).filter((l) => {
            const k = l.map((id) => (s.player.hand.find((c) => c.id === id).unknown ? "?" : id)).sort().join(); return !seen.has(k) && seen.add(k); }); };
          let discards = ab.discardCost ? (dn > 1 ? discardSets() : discardChoices(s).filter((id) => discardable(s, ab).includes(id))) : ab.blight ? blightOptions(s).map((b) => ({ blight: b })) : [undefined];
          // sacrifice / exile costs: each set of that many
          if (ab.sacCost) discards = discards.flatMap((d) => combinations(sacCostOptions(s, card, ab), ab.sacCost.n).map((sacs) => ({ ...(d === undefined ? {} : typeof d === "object" && !Array.isArray(d) ? d : { discard: d }), sacs })));
          if (ab.tapArtifactsX) discards = subsets(artifactsToTap(s)).map((taps) => ({ taps, x: taps.length }));
          if (ab.removeCounterCost) discards = discards.flatMap((d) => counterRemovals(s, ab).map((rc) => ({ ...(d === undefined ? {} : typeof d === "object" && !Array.isArray(d) ? d : { discard: d }), rc })));
          if (ab.tapCost) discards = discards.flatMap((d) => combinations(tapCostOptions(s, card, ab), ab.tapCost.n).map((taps) => ({ ...(d === undefined ? {} : typeof d === "object" && !Array.isArray(d) ? d : { discard: d }), taps })));
          // Fabrication Foundry: "Exile one or more other artifacts you control with total mana value X" (each set of them)
          if (ab.sacArtifactsAny) discards = subsets(s.player.battlefield.filter(isArtifact).map((c) => c.id)).filter((l) => l.length).map((sacs) => ({ sacs }));
          if (ab.evidenceCost) discards = evidenceSets(s.player.graveyard, ab.evidenceCost).map((l) => ({ evidence: l.map((c) => c.id) }));
          if (ab.exileArtifactsX) discards = subsets(artifactsToExile(s, card)).filter((l) => l.length).map((exiles) => ({ exiles }));
          if (ab.exileCost) discards = discards.flatMap((d) => combinations(exileCostOptions(s, ab), ab.exileCost.n).map((exiles) => ({ ...(d === undefined ? {} : typeof d === "object" && !Array.isArray(d) ? d : { discard: d }), exiles })));
          // waterbend: which artifacts and creatures help pay (each set up to the generic amount)
          const waters = ab.waterbend ? subsets(waterHelpers(s, card, ab)).filter((l) => l.length <= parseCost(ab.cost).generic && !check(s, { type: "activate", id: card.id, index, waterTap: l, target: list ? list[0] : undefined })) : [undefined];
          // ("up to one target": also no target at all; divided damage: each way to split it among the chosen targets)
          const splitsFor = (target) => (ab.effect && ab.effect.divided && target != null ? compositions(abilityDividedTotal(s, ab), [].concat(target).length) : [undefined]);
          (list ? [...(ab.targetCount && ab.targetCount.min === 0 ? [undefined] : []), ...targetChoices(list, ab.targetCount)] : [undefined]).forEach((target) => discards.forEach((discard) => waters.forEach((waterTap) => splitsFor(target).forEach((split) =>
            ((act0) => { if (!ab.exileArtifactsX || !check(s, act0)) out.push(act0); })({ type: "activate", id: card.id, index, target, x, ...(split ? { split } : {}), ...(discard !== undefined ? (typeof discard === "object" && !Array.isArray(discard) ? discard : { discard }) : {}), ...(waterTap !== undefined ? { waterTap } : {}) })))));
        });
      });
    }
    // Sacrificing a Treasure on its own only matters if something triggers on a sacrifice
    if (triggerSources(s).some(({ card }) => triggersOf(card).some((t) => t.on === "sacrificed"))) {
      s.player.battlefield.filter((c) => isTreasure(c) && !c.tapped).forEach((c) => out.push({ type: "mana", id: c.id }));
    }
    if (canAttackNow(s)) {
      const able = s.player.battlefield.filter((c) => !check(s, { type: "attack", ids: [c.id] })).map((c) => c.id);
      // with planeswalkers on the other side, also every choice of what each attacker attacks (CR 508.1b)
      const walkers = attackables(s);
      for (let mask = 1; mask < 1 << able.length; mask++) {
        const ids = able.filter((_, i) => mask & (1 << i));
        let ats = [{}];
        if (walkers.length) ids.forEach((id) => { ats = ats.flatMap((m) => [m, ...walkers.map((w) => ({ ...m, [id]: w }))]); });
        ats.forEach((at) => out.push(Object.keys(at).length ? { type: "attack", ids, at } : { type: "attack", ids }));
      }
    }
    // (Teval: each cast also with 1, 2, … cards delved, while it's only affordable that way or it matters)
    const out2 = tevalOn(s) ? out.flatMap((a) => (a.type !== "cast" ? [a] : [a, ...[...Array(Math.min(s.player.graveyard.length, 7)).keys()].map((k) => ({ ...a, delve: k + 1 })).filter((b) => !check(s, b))])) : out;
    // (Urgent Necropsy: a cast whose targets are worth evidence: once for each set of graveyard cards that's just enough)
    return out2.flatMap((a) => {
      if (a.type !== "cast") return [a];
      const fr = castable(s, a.id), fc = fr && castFace(fr, a);
      if (!fc || !fc.evidenceTargets) return [a];
      const need = [].concat(a.target || []).flat().filter((x) => x != null).reduce((t, id) => t + (find(s, id) ? manaValue(find(s, id).cost) : 0), 0);
      return need ? evidenceOptions(s, need).map((evidence) => ({ ...a, evidence })) : [a];
    });
  }

  // What besides the opponent can be attacked: their planeswalkers, and battles they protect (your Sieges)
  const attackables = (s) => [...s.opponent.battlefield.filter(isPlaneswalker), ...s.player.battlefield.filter(isBattle)].map((c) => c.id);

  // The step after this one; the first-strike damage step only exists with a first or double striker in combat
  function nextStep(s) {
    const n = STEPS[at(s.phase) + 1];
    return n === "fsdamage" && !(s.combat && s.combat.blocks && firstStrikeStepNeeded(s)) ? "damage" : n;
  }

  // Where moving on from this step can matter. Other steps are equivalent windows for instants:
  // beginning of combat = main 1 (before attackers), combat damage and end of combat = main 2.
  function nextStop(s) {
    if (s.phase === "main1" && bocMatters(s)) return "boc";                   // (combat begins: its triggers)
    if (s.phase === "main1" || s.phase === "boc") return "main2";              // skip combat
    if (s.phase === "attackers") return "blockers";
    if (s.phase === "blockers") return s.combat && firstStrikeStepNeeded(s) ? "fsdamage" : "main2";
    if (s.phase === "fsdamage" || s.phase === "damage" || s.phase === "eoc") return "main2";
    if (s.phase === "main2") return "end";
    return "cleanup";                                                           // the turn ends
  }
  // Moving on is an option unless one of your triggers is waiting for its target
  // (and moving on needs an empty stack: with something on it, passing is the way forward)
  // Solver shortcut (search only; the rules and the game still let you respond to anything): with your own spell
  // or activated ability on top, responding with another of yours is never needed. The opponent never acts, so
  // the only difference responding makes is that the response resolves first — and casting it first, then the
  // other, gives the same order with every choice made against a board only you changed. Responses to triggered
  // abilities (which you don't time yourself) are always searched. Cards that care about objects on the stack
  // (counter, copy or target a spell) would break this, so the shortcut is off when the puzzle has any.
  // Second shortcut: your own triggered ability that only makes your creatures bigger (+N/+N or keywords: prowess,
  // exalted, battle cry, landfall pumps) is let resolve. Anything you could do in response you can do right after,
  // against a creature that's at least as big — which can only be worse if something cares about your creature
  // dying or leaving, or about power or toughness being low ("power 2 or less"). With either in the puzzle it's off.
  const growsOnly = (s, top) => {
    if (top.kind !== "trigger" || top.side !== "player" || s.pumpSensitive) return false;
    const d = trig(top);
    if (d.targets) return false;
    const e = d.effect || {}, pump = e.pump || (e.team && e.team.pump) || [0, 0];
    const keys = Object.keys(e).filter((k) => !["pump", "grant", "self", "to", "team"].includes(k));
    return !keys.length && pump[0] >= 0 && pump[1] >= 0 && (!e.to || e.to === "eventObject") &&
      (!e.team || Object.keys(e.team).every((k) => ["pump", "grant", "filter", "other"].includes(k)));
  };
  const moves = (s) => {
    if (s.stack.length && !s.pending.length && s.stack[0].kind !== "trigger" && !s.stackAware) return [{ type: "pass" }];
    if (s.stack.length && !s.pending.length && growsOnly(s, s.stack[0])) return [{ type: "pass" }];
    return s.pending.length || s.stack.length ? legalActions(s) : [...legalActions(s), { type: "advance", to: nextStop(s) }];
  };

  /* ---------- solver ---------- */
  // Can the player still win from here, whatever the opponent blocks? (allow(s, a): only moves it accepts — puzzle
  // tools use it to ask "is this winnable without acting in combat?" or "… without responding on the stack?")
  function makeSearch({ allow } = {}) {
    const memo = new Map();
    function canWin(s) {
      if (won(s)) return true;
      if (turnOver(s)) return false;
      const key = JSON.stringify(s);
      if (memo.has(key)) return memo.get(key);
      memo.set(key, false);                                    // guards against cycles
      let r = false;
      for (const a of moves(s)) {
        if (allow && !blockNode(s, a) && !allow(s, a)) continue;
        if (blockNode(s, a)) r = afterEachBlock(s, a.to).every(canWin);
        else r = canWin(apply(s, a).state);
        if (r) break;
      }
      memo.set(key, r);
      return r;
    }
    return canWin;
  }
  const blockNode = (s, a) => a.type === "advance" && s.combat && !s.combat.blocks && at(a.to) >= at("blockers");
  const afterEachBlock = (s, to) => blockOptions(s).map((blocks) => apply(s, { type: "advance", to: "blockers", blocks }).state)
    .map((n) => (at(to) > at("blockers") && !n.pending.length ? apply(n, { type: "advance", to }).state : n));

  // The opponent's block: one that leaves you no way to win if there is one; otherwise the one
  // that keeps its life highest (then kills the most attackers, then loses the fewest blockers).
  function opponentBlocks(s) {
    const options = blockOptions(s);
    if (options.length === 1) return options[0];
    const canWin = makeSearch();
    let best = null;
    for (const blocks of options) {
      const after = apply(s, { type: "advance", to: "blockers", blocks }).state;
      const done = after.pending.length ? after : apply(after, { type: "advance", to: "main2" }).state;
      const killed = s.combat.attackers.filter((id) => find(s, id) && !find(done, id)).length;
      const lost = blocks && Object.values(blocks).flat().filter((id) => !find(done, id)).length;
      const score = [canWin(after) ? 1 : 0, -done.opponent.life + (done.opponent.poison || 0) * 2, -killed, lost];
      if (!best || lessThan(score, best.score)) best = { blocks, score };
    }
    return best.blocks;
  }
  const lessThan = (x, y) => { for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i]; return false; };

  const nameOf = (s, id) => {
    if (Array.isArray(id)) return id.map((x) => nameOf(s, x)).join(" + ");
    if (id === "opp") return "opponent";
    if (id === "you") return "yourself";
    const c = [...s.player.battlefield, ...s.opponent.battlefield, ...s.player.hand, ...s.player.graveyard, ...s.player.exile,
      ...s.player.library].find((x) => x.id === id);
    // (a transforming card is named by its front face, so a plan reads the same before and after it transforms; a
    // face-down card by the card, as its controller sees it)
    if (c && c.faceDown) return c.hidden.name;
    return c ? (c.layout === "transform" && c.faces && !c.token ? c.faces[0].name : c.name) : id;
  };

  function describe(s, a) {
    if (a.type === "play") {
      const c = s.player.hand.find((x) => x.id === a.id);
      const f = c ? faceOf(c, a) : null;
      const how = f && f.payLifeOrTapped ? (a.payLife ? ` (paying ${f.payLifeOrTapped} life)` : " (tapped)") : "";
      return `play ${f ? f.name : nameOf(s, a.id)}${how}`;
    }
    if (a.type === "scry") return `scry: keep ${a.top.map((id) => nameOf(s, id)).join(", ") || "nothing"} on top` + (a.away.length ? `, away ${a.away.map((id) => nameOf(s, id)).join(", ")}` : "");
    if (a.type === "mana") return `sacrifice ${nameOf(s, a.id)} for mana`;
    if (a.type === "plot") return `plot ${nameOf(s, a.id)}`;
    if (a.type === "cycle") return `cycle ${nameOf(s, a.id)}`;
    if (a.type === "ninjutsu") return `ninjutsu ${nameOf(s, a.id)} (returning ${nameOf(s, a.ret)})`;
    if (a.type === "renew") return `renew ${nameOf(s, a.id)}${a.target ? ` → ${nameOf(s, a.target)}` : ""}`;
    if (a.type === "channel") return `discard ${nameOf(s, a.id)} for its ability${a.target ? ` → ${nameOf(s, a.target)}` : ""}`;
    if (a.type === "pass") return `resolve: ${s.stack[0] ? s.stack[0].name : "the stack"}`;
    if (a.type === "choice") return `${s.pending[0].name.replace(/:.*/, "")}: ${s.pending[0].labels[a.pick]}`;
    if (a.type === "order") return `put ${s.pending[a.pick] ? s.pending[a.pick].name : "a"}'s trigger on the stack first`;
    if (a.type === "attack") return `attack with ${a.ids.map((id) => nameOf(s, id) + (a.at && a.at[id] ? ` (→ ${nameOf(s, a.at[id])})` : "")).sort().join(" + ")}`;
    if (a.type === "advance") return a.to === "main2" && (s.phase === "main1" || s.phase === "boc") ? "skip combat" : `go to ${a.to}`;
    if (a.type === "trigger") return `${s.pending[0] ? s.pending[0].name : "trigger"} → ${nameOf(s, a.target)}`;
    if (a.type === "activate") {
      const card = find(s, a.id);
      const ab = card && abilitiesOf(card)[a.index];
      return `activate ${nameOf(s, a.id)}${ab && ab.text ? ` (${ab.text})` : ""}${a.crew ? ` (${ab && ab.saddle ? "saddled" : ab && ab.stationAb ? "stationed" : "crewed"} by ${a.crew.map((id) => nameOf(s, id)).join(" + ")})` : ""}${a.craft ? ` (with ${nameOf(s, a.craft)})` : ""}${a.discard ? ` (discarding ${nameOf(s, a.discard)})` : ""}${a.blight ? ` (blighting ${nameOf(s, a.blight)})` : ""}${a.waterTap && a.waterTap.length ? ` (waterbending: tapping ${a.waterTap.map((id) => nameOf(s, id)).join(" + ")})` : ""}${a.target ? ` → ${nameOf(s, a.target)}` : ""}`;
    }
    const from = castable(s, a.id);
    const f = from ? castFace(from, a) : null;
    if (a.faceDown) return `cast ${from ? from.card.name : nameOf(s, a.id)} face down`;
    let d = `cast ${f ? f.name : nameOf(s, a.id)}${from && from.zone === "exile" ? " (from exile)" : from && from.zone === "graveyard" ? (from.card.flashback ? " (flashback)" : " (harmonize)") : ""}`;
    if (a.tapFor != null) d += ` (tapping ${nameOf(s, a.tapFor)})`;
    if (a.warp) d += " (warp)";
    if (a.evoke) d += " (evoke)";
    if (a.webSling != null) d += ` (web-slinging, returning ${nameOf(s, a.webSling)})`;
    if (a.sneak != null) d += ` (sneak, returning ${nameOf(s, a.sneak)})`;
    if (a.teamwork != null) d += ` (teamwork: tapping ${[].concat(a.teamwork).map((id) => nameOf(s, id)).join(" + ")})`;
    if (from && from.zone === "graveyard" && f && f.mayhemCast) d = d.replace(" (harmonize)", " (mayhem)");
    if (a.discard === "pay") d += " (paying instead of discarding)";
    else if (a.discard != null) d += ` (discarding ${nameOf(s, a.discard)})`;
    if (a.evidence != null) d += ` (collecting evidence: ${[].concat(a.evidence).map((id) => nameOf(s, id)).join(" + ")})`;
    if (f && f.modes && a.mode != null) d += ` (${[].concat(a.mode).map((m) => f.modes[m].text || "mode " + (m + 1)).join(" + ")})`;
    if (a.color) d += ` (${WORD_OF[a.color]})`;
    if (a.x != null) d += ` (X=${a.x})`;
    if (a.sac) d += ` (sacrificing ${nameOf(s, a.sac)})`;
    if (a.blight === "pay" || a.behold === "pay") d += " (paying instead)";
    else if (a.blight != null) d += ` (blighting ${nameOf(s, a.blight)})`;
    if (a.behold != null && a.behold !== "pay") d += ` (beholding ${nameOf(s, a.behold)})`;
    if (a.lifePips) d += ` (paying ${a.lifePips * 2} life)`;
    if (a.bargain != null) d += ` (bargaining ${nameOf(s, a.bargain)})`;
    if (a.offspring) d += " (with offspring)";
    if (a.gift) d += " (gift promised)";
    if (a.convoke && a.convoke.length) d += ` (convoking ${a.convoke.map((id) => nameOf(s, id)).join(" + ")})`;
    if (a.target) d += ` →${a.split ? [].concat(a.target).map((t, i) => `${a.split[i]} to ${nameOf(s, t)}`).join(", ") : nameOf(s, a.target)}`;
    return d;
  }

  const describeBlocks = (s, n) => {
    const parts = Object.entries(n.combat ? n.combat.blocks : {}).filter(([, b]) => b.length)
      .map(([a, b]) => `${b.map((id) => nameOf(n, id)).join(" + ")} blocks ${nameOf(n, a)}`);
    return parts.length ? `(opponent: ${parts.join(", ")})` : "(opponent: no blocks)";
  };

  // Lists the distinct winning plans. A plan is everything you do up to the opponent's blocks
  // (it must beat every block); after that, one winning answer to the opponent's best block is shown.
  // Order is ignored, and a plan that only adds moves to another winning plan is dropped.
  function solve(puzzle, { maxPlans = 500 } = {}) {
    // a plan's moves ignoring order; each attacker counts as its own move
    // (letting the stack resolve isn't a move of its own: responding or not shows in the order, which is ignored)
    // (nor is choosing the order of your triggers, which counters a proliferate adds to, or where an explored card goes:
    // details of the same plan — when only one way wins, there is only one plan anyway)
    const sig = (moves) => moves.filter((x) => !x.startsWith("resolve: ") && !/^put .*'s trigger on the stack first$/.test(x) && !x.startsWith("Proliferate: ") && !x.startsWith("Explore: "))
      .flatMap((x) => (x.startsWith("attack with ") ? x.slice(12).split(" + ").map((n) => "attacker " + n) : [x])).sort();
    const canWin = makeSearch();
    const plans = [];
    const start = init(puzzle);
    const winnable = canWin(start);

    const finish = (s, line) => {                            // one winning continuation from s, moving on when possible
      if (won(s)) return line;
      const opts = moves(s);
      const first = (x) => x.type === "advance" || x.type === "pass";            // move on / let things resolve first
      for (const a of [...opts.filter(first), ...opts.filter((x) => !first(x))]) {
        if (blockNode(s, a)) {
          const b = apply(s, { type: "advance", to: "blockers", blocks: opponentBlocks(s) }).state;
          const n = at(a.to) > at("blockers") && !b.pending.length ? apply(b, { type: "advance", to: a.to }).state : b;
          if (canWin(n)) return finish(n, [...line, describeBlocks(s, b)]);
          continue;
        }
        const n = apply(s, a).state;
        if (canWin(n)) return finish(n, first(a) ? line : [...line, describe(s, a)]);
      }
      return line;
    };

    const seen = new Set();                                  // same board after the same moves in another order
    (function walk(s, line) {
      if (plans.length >= maxPlans) return;
      const key = JSON.stringify(s) + "|" + sig(line).join("|");
      if (seen.has(key)) return;
      seen.add(key);
      for (const a of moves(s)) {
        if (blockNode(s, a)) {
          if (afterEachBlock(s, a.to).every(canWin)) plans.push({ moves: line, line: finish(s, line) });
          continue;
        }
        const n = apply(s, a).state;
        if (!canWin(n)) continue;
        const step = a.type === "advance" || a.type === "pass" ? line : [...line, describe(s, a)];
        if (won(n)) plans.push({ moves: step, line: step });
        else walk(n, step);
      }
    })(start, []);

    // compare plans by everything they do, including the answer to the opponent's best block
    const sigs = new Map();
    plans.forEach((p) => { const k = sig(p.line.filter((x) => !x.startsWith("(opponent"))).join(" | "); if (!sigs.has(k)) sigs.set(k, p); });
    const lists = [...sigs.keys()].map((k) => k.split(" | "));
    const contains = (big, small) => {
      const rest = [...big];
      return small.every((m) => { const i = rest.indexOf(m); if (i < 0) return false; rest.splice(i, 1); return true; });
    };
    const minimal = [...sigs.entries()].filter(([k]) => {
      const me = k.split(" | ");
      return !lists.some((o) => o.length < me.length && contains(me, o));
    }).map(([, p]) => p.line);
    return { winnable, plans: plans.length, minimal, capped: plans.length >= maxPlans };
  }

  root.Engine = {
    STEPS, at, init, check, apply, won, lost, canPayLife, turnOver, blightOptions, beholdOptions, convokeHelpers, castPayment, CLUE, evidenceOptions, manyModes, MERCENARY,
    hasType, vividCount, colorsOf, subsets, textOf, pendingTrigger, currentPT, isPlaneswalker, loyaltyOf, isBattle, defenseOf, INCUBATOR, FOOD, ROLES, MAP, bargainOptions, legalActions, nextStep, solve, describe, opponentBlocks, blockOptions, nextStop,
    targetsFor, targetChoices, spellSpec, plan, faceOf, compositions, abilityDividedTotal, scryChoices, castable, abilitiesOf, sacrificeOptions, canAttackNow, inMain, parseCost, manaValue, manaAvailable,
    abilityProblem, abilityCost, isCreature, isLand, isInstant, isTreasure, has, power, toughness, slug, makeSearch, WORD_OF,
    speedOf, maxSpeed, isVehicle, PILOT, crewPower, exhaustReady, sacCostOptions, exileCostOptions, tapCostOptions, spellConvoke, landsFromGraveyard, discardable, multisets, artifactsToExile, unravelerOn, evidenceSets, pawCombos, isArtifact
  };
})(typeof window !== "undefined" ? window : globalThis);
