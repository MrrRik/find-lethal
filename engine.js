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
  const isTreasure = (c) => !!c.token && /treasure/i.test(c.name || "");
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
  const subtypes = (c) => ((c && c.type) || "").split("—")[1]?.trim().split(/\s+/).filter(Boolean) || [];
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
  const stationed = (c) => !!(c.station && ((c.counters && c.counters.charge) || 0) >= c.station.at);
  const ownKw = (c) => {
    const kws = [...counterKw(c), ...(stationed(c) ? c.station.kw || [] : [])];
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

  // A permanent's activated abilities; Equipment's equip ability is one of them (sorcery speed)
  function abilitiesOf(c) {
    // CR 702.168d / 116.2b: turning a face-down disguise card face up is a special action, any time you have priority
    // (not an ability: it doesn't use the stack and can't be lost). It's offered like an ability with `special`.
    if (c.faceDown) {
      const h = c.hidden || {}, out = [];
      if (h.disguise) out.push({ special: "turnFaceUp", cost: h.disguise, text: `Turn face up ${h.disguise}` });
      // a manifested creature card: for its mana cost (CR 701.40b)
      if (c.manifested && !h.unknown && /creature/i.test(h.type || "") && h.cost != null) out.push({ special: "turnFaceUp", cost: h.cost, text: `Turn face up ${h.cost || "{0}"}` });
      return out;
    }
    // CR 709.5e / 116.2m: unlocking a locked door of a Room is a special action (main phase, empty stack)
    if (c.layout === "room" && c.unlocked) {
      return c.faces.map((f, i) => (c.unlocked[i] ? null : { special: "unlock", door: i, cost: f.cost, sorcery: true, text: `Unlock ${f.name} (${f.cost})` })).filter(Boolean);
    }
    if (c.st && c.st.lost) return [];                          // it lost all its abilities (CR 613.1f)
    const list = [...(c.abilities || []), ...((c.st && c.st.abilities) || [])];   // (its own, then gained ones)
    if (c.equip && !c.equip.none) list.push({ cost: c.equip.cost, targets: "creature", filter: { controller: "you" }, sorcery: true, effect: { attach: true },
      text: `Equip ${c.equip.cost}` });
    // CR 702.122a: "Crew N" — tap any number of other untapped creatures you control with total power N or more:
    // this Vehicle becomes an artifact creature until end of turn (the crew is chosen as a.crew)
    keywords(c).forEach((k) => { const m = /^crew (\d+)$/.exec(k); if (m) list.push({ crew: Number(m[1]), effect: { becomeCreature: true, self: true }, text: `Crew ${m[1]}` }); });
    // CR 702.171a: "Saddle N" — tap other untapped creatures you control with total power N or more: this becomes saddled
    // until end of turn; only as a sorcery. (Paid like crew: the creatures are chosen as a.crew.)
    keywords(c).forEach((k) => { const m = /^saddle (\d+)$/.exec(k); if (m) list.push({ crew: Number(m[1]), saddle: true, sorcery: true, effect: { saddled: true, self: true }, text: `Saddle ${m[1]}` }); });
    // CR 702.184a: station — "Tap another untapped creature you control: Put a number of charge counters on this permanent
    // equal to the tapped creature's power. Activate only as a sorcery." (the creature: a.crew, one of them)
    if (c.station) list.push({ stationAb: true, sorcery: true, effect: { charge: "tapped", self: true }, text: `Station (${c.station.at}+)` });
    // CR 702.167a: craft: { cost, filter, text } — "[Cost], Exile this, Exile [a material] from among permanents you
    // control and/or cards in your graveyard: Return this card transformed. Activate only as a sorcery." (a.craft: the material)
    if (c.craft && !c.transformed) list.push({ cost: c.craft.cost, sorcery: true, craft: c.craft, effect: { craftReturn: true }, text: c.craft.text || `Craft ${c.craft.cost}` });
    // CR 716.2a: a Class's "[Cost]: Level N" — its level becomes N; only if it's level N-1, and only as a sorcery
    (c.levels || []).forEach((lv) => { if (lv.level === levelOf(c) + 1) list.push({ cost: lv.cost, sorcery: true, effect: { levelUp: lv.level, self: true }, text: `Level ${lv.level} (${lv.cost})` }); });
    // CR 719.3c: a Case's "Solved — [ability]" can only be activated once it's solved; a station symbol's ability only at
    // its threshold (CR 721.2)
    return list.filter((ab) => (!ab.ifSolved || c.solved) && (!ab.ifStationed || stationed(c)));
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
    if (p.slots) return p.slots.every((sl, i) => targetsFor(s, f, sl.targets, sl.filter).includes(p.target[i]));
    const legal = targetsFor(s, f, p.targets, p.filter);
    return [].concat(p.target).some((t) => legal.includes(t));
  }

  // What a spell does, as parts: each with its effect and what it targets. Modal spells give one part per
  // chosen mode ("Choose two —": a.mode and a.target are lists, one per mode); fight/bite cards one part with
  // two target slots (a.target = [yours, theirs]); divided damage one part with a.split amounts per target.
  const ONE = { min: 1, max: 1 };
  // CR 702.172a: spree — "choose one or more modes; as an additional cost, pay the costs of those modes" (each mode's
  // plus cost). Spree and "Choose two —" spells take a list of modes (a.mode) and one target per mode.
  const manyModes = (f) => !!f.spree || (f.chooseCount || 1) > 1;
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
      return [{ effect: { divided: true }, targets: f.targets || "any", filter: f.targetFilter, count: f.targetCount || { min: 1, max: 3 },
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
    (f.extraCostPerTarget && Array.isArray(a.target) && a.target.length > 1 ? `{${f.extraCostPerTarget * (a.target.length - 1)}}` : "") +
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
      // ("The first instant or sorcery spell you cast each turn costs {3} less to cast")
      (typeHas(f, /instant|sorcery/i) && !(s.instSorcCast > 0) ? s.player.battlefield.filter((c) => c.firstInstSorcLess && !(c.st && c.st.lost)).reduce((t, c) => t + c.firstInstSorcLess, 0) : 0) +
      // ("Spells you cast cost {1} less to cast for each card your opponents have drawn this turn")
      s.player.battlefield.filter((c) => c.lessPerOppDraw && !(c.st && c.st.lost)).length * ((s.drawn || {}).opponent || 0) +
      s.player.battlefield.filter((c) => c.spellsCostLess && !(c.st && c.st.lost)).reduce((t, c) => {
        const r = c.spellsCostLess;
        if (r.instantOrSorcery && !typeHas(f, /instant|sorcery/i)) return t;
        return t + (r.perCounter ? (c.counters || {})[r.perCounter] || 0 : r.n || 0);
      }, 0);
    if (!per.length && !flat) return cost;
    const less = flat + per.reduce((t, p) => t + p.n * s.player.battlefield.filter((c) => objectIs(c, p.filter)).length, 0);
    const p = parseCost(cost);
    const generic = Math.max(0, p.generic - less);
    return (generic ? `{${generic}}` : "") + p.pips.map((x) => `{${x}}`).join("");
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
  function manaSources(s, exclude = []) {
    const pool = [...s.pool.map((sym, i) => ({ id: "pool:" + i, colors: sym === "*" ? "WUBRG" : sym, kind: "pool" })),
      // firebending mana (CR 702.189a): {R} that stays until end of combat
      ...Array.from({ length: s.firePool || 0 }, (_, i) => ({ id: "fire:" + i, colors: "R", kind: "pool" }))];
    // ("Max speed — {T}: Add {R}{R}": maxSpeedMana — a mana ability it has only at max speed, CR 702.178a)
    const field = s.player.battlefield.filter((c) => !exclude.includes(c.id) && !(c.maxSpeedMana && !maxSpeed(s, "player")))
      .map((c) => ({ id: c.id, colors: produces(c), kind: isTreasure(c) ? "treasure" : isLand(c) ? "land" : "other" }))
      .filter((x) => x.colors !== null);
    // More mana from one tap: "Add {C}{C}" (manaAmount), and triggered mana abilities — "whenever enchanted Forest is
    // tapped for mana, add an additional one mana of the chosen color" (Utopia Sprawl; CR 605.1b, 605.4a: right away,
    // no stack). Each extra mana is its own payment slot "id+n", usable only when "id" itself is tapped.
    const extras = field.flatMap((src) => manaExtras(s, find(s, src.id)).map((colors, k) => ({ id: `${src.id}+${k + 1}`, colors, kind: src.kind, parent: src.id })));
    return [...pool, ...field, ...extras];
  }
  // The extra mana tapping this permanent makes (beyond the first), as color strings
  function manaExtras(s, c) {
    const out = [];
    for (let i = 1; i < (c.manaAmount || 1); i++) out.push(produces(c));
    if (c.manaPerCreature) for (let i = 1; i < s.player.battlefield.filter(isCreature).length; i++) out.push(produces(c));
    // Virtue of Strength: "If you tap a basic land for mana, it produces three times as much of that mana instead"
    // (the extra mana is the same color as what it made; with one choice of color, as here, any of its colors)
    const tripled = /\bbasic\b/i.test(c.type || "") && isLand(c) ? s.player.battlefield.filter((v) => v.triplesBasicMana && !(v.st && v.st.lost)).length : 0;
    for (let i = 1; i < 3 ** tripled; i++) out.push(produces(c));
    s.player.battlefield.filter((a) => a.attachedTo === c.id && a.extraMana && a.chosenColor).forEach((a) => out.push(a.chosenColor));
    return out;
  }
  const manaAvailable = (s, exclude) => manaSources(s, exclude).length;

  // Pick the payment that keeps the most of the rest of the hand castable: floating mana first,
  // lands next, Treasures and creatures (which you may want to attack with) last
  // Convoke (702.51): each creature you tap pays for {1} or one mana of its color, summoning sick or not
  // (even one that's attacking). convoke: the creatures tapped this way (all of them must help), or "any".
  // lifePips: exactly this many Phyrexian pips are paid with life (compleated: how many changes the loyalty, so it's
  // the player's choice; then even with irrelevant life the pips are real)
  function bestPayment(s, cost, { except, exclude = [], convoke, lifePips } = {}) {
    const helpers = convoke === "any" ? s.player.battlefield.filter((c) => isCreature(c) && !c.tapped).map((c) => c.id) : convoke || [];
    const sources = [...manaSources(s, [...exclude, ...helpers]),
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
  const asFlash = (s, f) => s.player.battlefield.some((c) => c.castsAsFlash && !(c.st && c.st.lost)) || (!!s.sorceryFlash && typeHas(f, /sorcery/i)) || !!f.flashFor;
  // CR 305.2: one land a turn, plus "you may play an additional land this turn" effects and "on each of your turns" statics
  const landsPlayed = (s) => s.landsPlayed != null ? s.landsPlayed : s.landPlayed ? 1 : 0;
  const landsAllowed = (s) => 1 + (s.extraLands || 0) + s.player.battlefield.filter((c) => c.extraLandEachTurn && !(c.st && c.st.lost)).length;
  // your creatures that "attack each combat if able" and could attack now (untapped, no summoning sickness or haste)
  const mustAttackers = (s) => s.player.battlefield.filter((c) => isCreature(c) && has(c, "attacks each combat if able") && !c.tapped &&
    !(c.sick && !has(c, "haste")) && !has(c, "defender") && !has(c, "can't attack"));
  const lifeTax = (s, target) => [target].flat(3).filter(Boolean).map((id) => s.opponent.battlefield.find((c) => c.id === id)).filter((c) => c && c.targetLifeTax && !(c.st && c.st.lost)).reduce((t, c) => t + c.targetLifeTax, 0);
  // convoke: its own keyword, or "Noncreature spells you cast have convoke" (Caetus, Sea Tyrant of Segovia)
  const spellConvoke = (s, f) => has(f, "convoke") || (!typeHas(f, /creature/i) && s.player.battlefield.some((c) => c.noncreatureConvoke && !(c.st && c.st.lost)));
  const isEquipped = (s, c) => [...s.player.battlefield, ...s.opponent.battlefield].some((e) => e.equip && e.attachedTo === c.id);
  const find = (s, id) => s.player.battlefield.find((c) => c.id === id) || s.opponent.battlefield.find((c) => c.id === id);
  const inMain = (s) => s.phase === "main1" || s.phase === "main2";
  // CR 307.1 / 505.6a / 602.5d: sorcery speed is your main phase with an empty stack (lands too, CR 305.2 / 116.2a)
  const sorceryTime = (s) => inMain(s) && !s.stack.length;
  // You get priority in every step except untap and cleanup; the turn is over once cleanup begins
  const hasPriority = (s) => at(s.phase) >= at("upkeep") && at(s.phase) < at("cleanup");
  const turnOver = (s) => at(s.phase) >= at("cleanup") || dead(s.player);
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
    if (zone === "graveyard" && isArtifact(card)) s.artifactsDied = (s.artifactsDied || 0) + 1;
    if (zone === "graveyard" && isCreature(card)) emit(s, { type: "dies", obj: last, side, equipped: isEquipped(s, card) }, ev, before);
    // CR 610.3: cards exiled "until this leaves the battlefield" return right away (a one-shot effect, not a trigger)
    ["player", "opponent"].forEach((sd) => s[sd].exile.filter((x) => x.exiledUntil === card.id).forEach((x) => returnExiledCard(s, x, sd, ev)));
    if (card.token) return;                                      // CR 111.7: tokens cease to exist
    // CR 712.8a: off the battlefield a double-faced card has only its front face's characteristics
    // CR 708.9: a face-down permanent is revealed as it leaves: the card goes there face up
    const fresh = card.faceDown ? { ...card.hidden, id: card.id } : card.transformed ? { id: card.id, owner: card.owner, faces: card.faces, layout: card.layout, ...card.faces[0] } : { ...card };
    ["dmg", "tapped", "sick", "deathtouched", "owner", "counters", "attachedTo", "st", "ts", "loyaltyUsed", "bargained", "wasCast", "suspected", "solved", "evidenced", "saddled", "level", "offspringPaid", "unlocked", "manifested", "exhausted", "warped", "webSlung", "sneaked", "prepared", "enteredThisTurn", "poweredUp", "xPaid", "convokedBy"].forEach((k) => delete fresh[k]);   // CR 400.7
    putCard(s, fresh, card.owner || side, zone);
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
    const { kw = [], ...rest } = except;
    return { ...v, ...clone(rest), kw: [...(v.kw || []), ...kw] };
  }

  // CR 707.10: copy a spell on the stack — the copy keeps every choice (modes, targets, X), isn't cast, and you may
  // choose new targets for it (CR 707.10c); spells can also gain keywords ("those spells gain wither")
  function copySpell(s, item, { side = "player", gain = [] } = {}, ev) {
    const f = faceOf(item.card, item.a);
    let a = item.a;
    if (a.target != null && !Array.isArray(a.target)) {
      const p = plan(f, a)[0];
      const others = p && p.targets ? targetsFor(s, f, p.targets, p.filter, side).filter((t) => t !== a.target) : [];
      const pick = choose(s, `Copy of ${f.name}: new target?`, ["Keep the same target", ...others.map((t) => `New target: ${nameIn(s, t)}`)], side, [null, ...others.map((t) => (t === "opp" || t === "you" ? null : t))]);
      if (pick > 0) a = { ...a, target: others[pick - 1] };
    }
    if (gain.length) item.gain = [...(item.gain || []), ...gain];
    s.stack.unshift({ ...item, a, copy: true, gain: [...(item.gain || [])], id: `${item.id}-copy${s.nextId++}` });
    ev.push({ type: "copied", id: item.id });
  }
  const nameIn = (s, id) => (id === "opp" ? "opponent" : id === "you" ? "you" : (find(s, id) || {}).name || id);

  // CR 701.27a: transform a double-faced permanent — turn it over. CR 712.18: it stays the same object (counters,
  // damage, effects and being here since the turn began all stay); only its characteristics switch to the other
  // face (CR 712.8d-e). Not a double-faced card, or the other face is an instant or sorcery: nothing happens
  // (CR 701.27c, 712.10).
  const KEEP_ON_TRANSFORM = ["id", "owner", "faces", "layout", "tapped", "counters", "dmg", "sick", "attachedTo", "ts", "deathtouched", "chosenColor", "token"];
  function transform(s, c, ev) {
    if (!c || c.layout !== "transform" || !c.faces || c.faces.length < 2) return;
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
  function turnFaceUp(s, c, ev) {
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
    emit(s, { type: "becomesTapped", obj: c, side: sideOf(s, c) }, ev);
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
  function putCard(s, card, ownerSide, zone) {
    const owner = s[ownerSide];
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
      const options = replacementsFor(s, card, to, side).filter((r) => !applied.has(r.key));
      if (!options.length) return to;
      const pick = choose(s, `${card.name}: which effect applies?`, options.map((r) => `${r.name}: ${r.instead} instead`), chooser);
      applied.add(options[pick].key);
      to = options[pick].instead;
    }
  }
  function replacementsFor(s, card, to, side) {
    const out = [];
    const consider = (src, srcSide, r, i) => {
      if (r.to !== to) return;
      if (r.self && src.id !== card.id) return;
      if (r.cardsOnly && card.token) return;
      if (r.owner && ((card.owner || side) === srcSide ? "you" : "opponent") !== r.owner) return;
      out.push({ key: `${src.id}#${i}`, name: src.name, instead: r.instead });
    };
    battlefieldNow(s).forEach(({ card: p, side: ps }) => (p.replacements || []).forEach((r, i) => { if (!r.self) consider(p, ps, r, i); }));
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
  const dynamicKey = (s) => `${s.player.poison || 0}|${s.opponent.poison || 0}|${s.player.speed || 0}|${s.gainedLife ? 1 : 0}|${s.player.enduringStory ? 1 : 0}|${s.oppNoncombat ? 1 : 0}|${s.celebration || 0}|${s.player.graveyard.length}|${s.opponent.graveyard.length}|${s.player.hand.length}|${JSON.stringify(s.drawn || 0)}|${s.crimes || 0}|` +
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
    const sources = all.filter(({ card: p }) => p.static || p.perOther || p.perCounter || p.perHandCard || p.conditional ||
      (p.attachedTo && ((p.aura && (p.aura.static || p.aura.setsColor)) || (p.equip && p.equip.static))));
    const staticFrom = (src, srcSide, target) => {                // the static effects src gives target
      const out = [];
      const attached = src.aura || src.equip;
      if (attached && attached.static && src.attachedTo === target.id) out.push({ ts: src.ts, ...attached.static });
      // layer 5: "Enchanted land is the chosen color" (Shimmerwilds Growth)
      if (src.aura && src.aura.setsColor && src.chosenColor && src.attachedTo === target.id) out.push({ ts: src.ts, setColor: [src.chosenColor] });
      // (static.if: only while a condition holds — a Case's "Solved — Creatures you control get +1/+0", CR 719.3c)
      if (src.static && src.static.team && isCreature(target) && sideOf(s, target) === srcSide &&
        (!src.static.if || conditionHolds(s, src.static.if, srcSide, src)) &&
        matches(s, target, src.static.filter, srcSide) && !(src.static.other && target === src)) {
        // ("+1/+0 for each Aura and Equipment attached to Kellan": pumpPerAttached)
        const ppa = src.static.team.pumpPerAttached;
        if (ppa) { const n = all.filter(({ card: x }) => (x.aura || x.equip) && x.attachedTo === src.id).length; if (n) out.push({ ts: src.ts, pump: [ppa[0] * n, ppa[1] * n] }); }
        else out.push({ ts: src.ts, ...src.static.team });
      }
      // "Artifacts you control have '{2}, Sacrifice this artifact: …'" (static.artifactsGain: activated abilities, layer 6)
      if (src.static && src.static.artifactsGain && isArtifact(target) && sideOf(s, target) === srcSide) out.push({ ts: src.ts, addAbilities: src.static.artifactsGain });
      // "Planeswalkers you control have '[−2]: …'" (static.walkers: the loyalty abilities they gain, layer 6)
      if (src.static && src.static.walkers && isPlaneswalker(target) && sideOf(s, target) === srcSide) out.push({ ts: src.ts, addAbilities: src.static.walkers });
      if (src.perOther && src === target) {                    // "gets +2/+0 for each other Goblin you control"
        // ("+1/+0 for each other creature you control": perOther.creature)
        const n = s[srcSide].battlefield.filter((x) => x !== src && (src.perOther.creature ? isCreature(x) : hasType(x, src.perOther.type))).length;
        if (n) out.push({ ts: src.ts, pump: [src.perOther.pump[0] * n, src.perOther.pump[1] * n] });
      }
      // "This creature gets -1/-1 for each card in your hand" (perHandCard)
      if (src.perHandCard && src === target) { const n = srcSide === "player" ? s.player.hand.length : s.opponent.handCount || 0; if (n) out.push({ ts: src.ts, pump: [src.perHandCard[0] * n, src.perHandCard[1] * n] }); }
      // "gets +1/+1 for each oil counter on it" (perCounter)
      if (src.perCounter && src === target) {
        const n = (src.counters || {})[src.perCounter.kind] || 0;
        if (n) out.push({ ts: src.ts, pump: [src.perCounter.pump[0] * n, src.perCounter.pump[1] * n] });
      }
      // static abilities that apply only while a condition holds: "Corrupted — as long as an opponent has three or more
      // poison counters, this creature has double strike" (conditional: [{ if, pump, grant }]); on an Aura or
      // Equipment they apply to what it's attached to
      const holder = src.conditional && (src.aura || src.equip) ? src.attachedTo : src.id;
      (src.conditional || []).forEach((cnd) => {
        if (holder === target.id && conditionHolds(s, cnd.if || {}, srcSide, src)) out.push({ ts: src.ts, ...(cnd.pump ? { pump: cnd.pump } : {}), ...(cnd.grant ? { grant: cnd.grant } : {}) });
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
    const typed = (c) => (typeOf.has(c) ? { type: typeOf.get(c) } : {});
    const layer6 = (c, effects) => {
      let kw = [...ownKw(c)], lost = false, abilities = [];
      effects.filter((e) => e.grant || e.loseAll || e.addAbilities).sort(byTs).forEach((e) => {
        if (e.loseAll) { kw = []; abilities = []; lost = true; }   // CR 613.1f: removes abilities (from earlier effects too)
        if (e.grant) kw.push(...e.grant);
        if (e.addAbilities) abilities.push(...e.addAbilities);   // (gained activated abilities)
      });
      return { kw, lost, abilities };
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
      const { kw, lost, abilities } = layer6(c, effects);
      // layer 7a: a characteristic-defining ability (vivid: power = colors among your permanents) — gone if lost
      let base = basePT(c);
      if (c.vividPower && !lost) base = [vividCount(s, sideOf(s, c)), base[1]];
      if (c.ptCount && !lost) base = cdaPT(s, c);                // ("power and toughness are each equal to the number of …")
      // layer 7b: "has base power and toughness 1/1", in timestamp order (the latest wins)
      effects.filter((e) => e.setBase).sort(byTs).forEach((e) => { base = [...e.setBase]; });
      // layer 7c: modifications (+N/+N); the order inside a sublayer doesn't change a sum
      const mod = [0, 0];
      effects.filter((e) => e.pump).forEach((e) => { mod[0] += e.pump[0]; mod[1] += e.pump[1]; });
      setSt(c, { kw, base, mod, lost, ...(abilities.length ? { abilities } : {}), ...colors, ...typed(c) });
    }
  }

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
  function sba(s, ev) {
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
        s[side].battlefield.filter((c) => typeHas(c, /\blegendary\b/i) && !c.faceDown).forEach((c) => byName.set(c.name, [...(byName.get(c.name) || []), c]));
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
  function changeLife(s, who, n, ev) {
    const side = s[who === "opp" ? "opponent" : "player"];
    // (gaining life counts even when your life total doesn't matter: infusion, "whenever you gain life")
    if (n > 0 && who === "you") { s.gainedLife = true; s.lifeGainedTotal = (s.lifeGainedTotal || 0) + n; emit(s, { type: "gainLife", side: "player" }, ev); }
    if (n < 0 && who === "opp") s.oppLostLife = true;
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
    // City on Fire: "If a source you control would deal damage to a permanent or player, it deals triple that damage instead"
    const triplers = s[srcSide].battlefield.filter((c) => c.triplesDamage && !(c.st && c.st.lost)).length;
    if (triplers) n *= 3 ** triplers;
    // Rankle and Torbran: "If a source would deal damage to a player or battle this turn, it deals that much damage plus 2 instead"
    if (!combat && srcSide === "player" && colorsOf(src).includes("R")) s.redNoncombat = (s.redNoncombat || 0) + n;   // (Temple of Power)
    if (s.damagePlus2 && (to === "opp" || to === "you" || (find(s, to) && isBattle(find(s, to))))) n += 2 * s.damagePlus2;
    // CR 615: prevention effects ("prevent all combat damage that would be dealt this turn": Fog), unless an effect
    // says damage can't be prevented (CR 615.12)
    if (combat && s.preventCombat && !s.noPrevention) { ev.push({ type: "prevented", id: to }); return; }
    // (the sources of yours that dealt damage this turn, kept only when a card asks: Case of the Burning Masks)
    const dealt = () => { if (s.tracksSources && srcSide === "player" && !(s.dmgSources || []).includes(src.id)) s.dmgSources = [...(s.dmgSources || []), src.id].sort(); };
    if (to === "opp" || to === "you") {
      const side = s[to === "opp" ? "opponent" : "player"];
      dealt();
      if (!combat && to === "opp") s.oppNoncombat = true;       // ("an opponent was dealt noncombat damage this turn")
      if (!combat && to === (srcSide === "player" ? "opp" : "you")) emit(s, { type: "noncombatToOpp", obj: src, side: srcSide, count: n }, ev);
      if (has(src, "infect")) {
        side.poison = (side.poison || 0) + n;
        ev.push({ type: "poison", who: to, amount: n });
      } else changeLife(s, to, -n, ev);
      // CR 702.164c: combat damage to a player from a creature with toxic also gives that many poison counters (its
      // total toxic value, CR 702.164b), in addition to the damage
      const toxic = combat ? toxicOf(src) : 0;
      if (toxic) { side.poison = (side.poison || 0) + toxic; ev.push({ type: "poison", who: to, amount: toxic }); }
      // "whenever this creature deals combat damage to a player" (CR 510.3a: triggers after the damage is dealt)
      if (combat) emit(s, { type: "combatDamage", obj: src, side: srcSide, to, count: n }, ev);
    } else {
      const t = find(s, to);
      if (!t) return;
      // protection prevents the damage, unless an effect says damage can't be prevented this turn
      if (protectedFrom(t, src) && !s.noPrevention) { ev.push({ type: "prevented", id: t.id }); return; }
      // Phyrexian Vindicator: "If damage would be dealt to this creature, prevent that damage. When damage is prevented
      // this way, …" (a reflexive trigger with the amount)
      if (t.preventsOwnDamage && !(t.st && t.st.lost) && !s.noPrevention) {
        ev.push({ type: "prevented", id: t.id });
        emit(s, { type: "damagePrevented", obj: t, side: sideOf(s, t), count: n }, ev);
        return;
      }
      dealt();
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
        if (before > 0 && defenseOf(t) === 0) emit(s, { type: "defeated", obj: t, side: sideOf(s, t) }, ev);
        return;
      }
      if (has(src, "infect") || has(src, "wither")) {
        t.counters = { ...(t.counters || {}) };
        t.counters["-1/-1"] = (t.counters["-1/-1"] || 0) + n;
      } else t.dmg = (t.dmg || 0) + n;
      if (has(src, "deathtouch")) t.deathtouched = true;
      ev.push({ type: "damage", id: t.id, amount: n });
      // "Whenever a source deals damage to this creature, that source's controller …" (Phyrexian Obliterator)
      emit(s, { type: "dealtDamage", obj: t, side: sideOf(s, t), count: n, controller: srcSide === "player" ? "you" : "opp" }, ev);
    }
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
    if (card.conditional || card.perCounter || card.ptCount || card.perHandCard || /"hasCounter"/.test(json)) s.dynamicStatics = true;
    if (/firebending/.test(json)) add("attacks");             // (firebending it may gain later still triggers)
    if (/"damageSources"|"attackedCount"/.test(json)) s.tracksSources = true;
    if (/"loseAll"|"setBase"/.test(json)) s.tsMatters = true;  // (effects whose order matters: keep timestamps)
    if (/"artifactsEntered"/.test(json)) s.countsArtifacts = true;   // (count artifacts entering only when a card asks)
    if (/"takeEquipment"/.test(json)) s.tracksEquipment = true;
    if (/"targets":"spell"|"counter(Spell)?":true|"copySpell"|"copyEventSpell"/.test(json)) s.stackAware = true;
    // something that cares about a creature dying, leaving or being sacrificed, or about low power/toughness
    if (/"maxPower"|"maxToughness"|"onDeath"|"returnsToHand"/.test(json) ||
      triggersOf(card).some((t) => ["dies", "leaves", "sacrificed"].includes(t.on))) s.pumpSensitive = true;
    triggersOf(compile(card)).forEach((t) => { add(t.on); if ((t.zones || []).some((z) => z !== "battlefield")) s.offField = true; });
    // keywords it can give others (an Aura's, Equipment's or anthem's static ability)
    const given = [card.aura, card.equip, card.static && card.static.team].flatMap((x) => (x && (x.static || x).grant) || []);
    given.forEach((k) => { if (KEYWORD_TRIGGERS[k]) add(KEYWORD_TRIGGERS[k].on); });
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
      return { effect: { seq: chosen.map((m) => m.effect) }, targets: aimed && aimed.targets, filter: aimed && aimed.targetFilter, count: aimed && aimed.count, if: d.if };
    }
    return { effect: d.effect, targets: d.targets, filter: d.targetFilter, count: d.count, if: d.if };
  }
  // The ways to choose a modal trigger's modes: one (or chooseCount), "one or both", "any number" (none too)
  function modeCombos(d) {
    const all = d.modes.map((_, i) => i);
    if (d.anyNumber) return subsets(all);
    if (d.oneOrBoth) return subsets(all).filter((l) => l.length);
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
  function pendingTrigger(s) {
    const p = s.pending[0];
    if (!p || p.kind === "scry" || p.kind === "choice") return p;
    return { ...trig(p), name: p.name, side: p.side, src: srcOf(s, p) };
  }
  // Each instance of a keyword is its own ability and triggers separately (CR 702.83b, 702.108b)
  // (an object that lost all its abilities keeps only keyword triggers it gained afterwards, CR 613.1f)
  const triggersOf = (c) => [...((c.st && c.st.lost) ? [] : TRIGGER_TABLE.get(compile(c).tk) || []), ...keywords(c).filter((k) => KEYWORD_TRIGGERS[k]).map((k) => KEYWORD_TRIGGERS[k]),
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
    sacrificeIt: { effect: { sacrificeEvent: true } }    // "sacrifice it"
  };
  const delay = (s, kind, side, name, srcId, id) => { s.delayed = [...(s.delayed || []), { kind, side, name, srcId, id }]; };
  const COPY_NEXT = { effect: { copyEventSpell: { always: true } } };

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
    if (t.other && e.obj.id === src.id) return false;
    if (t.by && t.by !== e.by) return false;
    if (t.toZone && t.toZone !== e.to) return false;           // "is put into a graveyard from the battlefield"
    const f = t.filter || {};
    if (f.controller && (e.side === srcSide ? "you" : "opponent") !== f.controller) return false;
    if (f.artifact && !isArtifact(e.obj)) return false;
    if (f.creature && !isCreature(e.obj)) return false;
    if (f.land && !isLand(e.obj)) return false;
    if (f.treasure && !isTreasure(e.obj)) return false;
    if (f.noncreature && isCreature(e.obj)) return false;
    if (f.toxic && !toxicOf(e.obj)) return false;
    if (f.attackingBattle && !e.toBattle) return false;          // "whenever this creature attacks a battle"
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
    if (f.lastToughnessBelow1 && !((e.obj.lastToughness ?? toughness(e.obj)) < 1)) return false;   // "if its toughness was less than 1"
    if (f.minCount && !(e.count >= f.minCount)) return false;
    if (f.notFirstSpell && !(e.spellNumber > 1)) return false;                              // "other than your first spell that turn"
    if (f.legendary && !/\blegendary\b/i.test(e.obj.type || "")) return false;              // "a legendary creature you control"
    if (f.minPowerEvent != null && power(e.obj) < f.minPowerEvent) return false;            // "another creature … with power 4 or greater enters"                               // "attacks with three or more creatures"
    if (f.hasCounterKind && !((e.obj.counters || {})[f.hasCounterKind] > 0)) return false;   // "with an impostor counter on it"
    if (f.attackerType && !(e.attackers || []).some((c) => hasType(c, f.attackerType))) return false;
    if (f.attackerNonType && !(e.attackers || []).some((c) => !hasType(c, f.attackerNonType))) return false;   // "one or more non-Gnome creatures"   // "attack with one or more Faeries"                              // "their second card each turn"
    if (f.exactlyColors != null && colorsOf(e.obj).length !== f.exactlyColors) return false; // "a spell that's exactly two colors"
    if (f.counterKind && e.kind !== f.counterKind) return false;                             // "+1/+1 counters are put on this creature"
    if (f.fromHand && !e.fromHand) return false;                                             // "an instant or sorcery spell from your hand"
    if (f.targetsCreature && !e.targetsCreature) return false;   // repartee: "an instant or sorcery spell that targets a creature"
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
    if (cond.oppLostLife && !s.oppLostLife) return false;
    if (cond.selfAttacking && !(self && s.combat && s.combat.attackers.includes(self.id))) return false;   // "if Tolsimir attacked this combat"
    if (cond.oppMoreLands && !(s[side === "player" ? "opponent" : "player"].battlefield.filter(isLand).length > s[side].battlefield.filter(isLand).length)) return false;
    if (cond.noSpellsCast && side === "player" && (s.spellsCast || 0) > 0) return false;   // "as long as you haven't cast a spell this turn"
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
    (f.maxMV == null || manaValue(c.cost) <= f.maxMV) && (!f.artifactOrCreature || isArtifact(c) || isCreature(c)) &&
    (!f.creatureOrLand || isCreature(c) || isLand(c)) && (!f.anyOfTypes || f.anyOfTypes.some((t) => hasType(c, t))) &&
    (!f.name || c.name === f.name) && (!f.aura || !!c.aura) &&
    (!f.anyOfKinds || isCreature(c) || isLand(c) || typeHas(c, /enchantment/i)) &&            // "a creature, enchantment, or land card"
    (!f.creatureOrBasicLand || isCreature(c) || (isLand(c) && /\bbasic\b/i.test(c.type || ""))) &&
    (!f.adventureCard || c.layout === "adventure") && (!f.notName || c.name !== f.notName) &&
    (!f.untapped || !c.tapped) && (!f.artifactOrEnchantmentCard || isArtifact(c) || (typeHas(c, /enchantment/i) && !c.aura)) && (!f.suspected || !!c.suspected) && (!f.planeswalker || isPlaneswalker(c));   // "artifact or non-Aura enchantment card"

  // The one place game events go: logged for the UI, and checked against every triggered ability that can
  // function (CR 603.2). Each matching ability triggers once per event (CR 603.2c) and waits in s.triggered
  // until a player would receive priority (CR 603.3).
  function emit(s, e, ev, lookBack) {
    ev.push({ type: "event:" + e.type, id: e.obj && e.obj.id, side: e.side });
    if (!s.listens.includes(e.type)) return;                  // nothing in this puzzle triggers on it (see listen)
    // a spell's mana value (X included, CR 202.3e) and which multicolored spell of yours this turn it is
    if (e.type === "cast" && e.obj) {
      e.mv = manaValue(withX(e.obj.printedCost != null ? e.obj.printedCost : e.obj.cost, e.x));
      if (e.side === "player" && colorsOf(e.obj).length > 1) e.multiNumber = s.multiCast = (s.multiCast || 0) + 1;
      if (e.side === "player" && typeHas(e.obj, /instant|sorcery/i)) s.instSorcCast = (s.instSorcCast || 0) + 1;
    }
    if (e.type === "enters") refresh(s);                       // (its power as it is on the battlefield, for "power 2 or less")
    // Elesh Norn, Mother of Machines / Drivnod, Carnage Dominus: "If a permanent entering (a creature dying) causes a
    // triggered ability of a permanent you control to trigger, that ability triggers an additional time" (each one adds
    // one); Elesh Norn: "Permanents entering don't cause abilities of permanents your opponents control to trigger."
    // (a dying Drivnod still counts for creatures dying with it: leaves-the-battlefield triggers look back, CR 603.10a)
    const live = (side, key) => (lookBack || battlefieldNow(s)).filter((x) => x.side === side && x.card[key] && !(x.card.st && x.card.st.lost)).length;
    const doubling = e.type === "enters" ? "enterTriggersTwice" : e.type === "dies" ? "dieTriggersTwice" : null;
    for (const { card, side, zone } of triggerSources(s, lookBack)) {
      const onField = (zone || "battlefield") === "battlefield";
      if (e.type === "enters" && onField && live(side === "player" ? "opponent" : "player", "enterTriggersTwice")) continue;
      if (e.type === "enters" && e.obj && (isArtifact(e.obj) || isCreature(e.obj)) && battlefieldNow(s).some(({ card: x }) => x.thrull && !(x.st && x.st.lost))) continue;   // (Doorkeeper Thrull)
      const times = 1 + (doubling && onField ? live(side, doubling) : 0) + (onField && isCreature(card) && power(card) <= 2 ? live(side, "delney") : 0) +
        (onField && isCreature(card) && /\blegendary\b/i.test(card.type || "") ? live(side, "legendaryTriggersTwice") : 0);
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
        // "This ability triggers only once each turn"
        if (t.oncePerTurn) { const k = `${card.id}#${defId(t)}`; if ((s.once || []).includes(k)) continue; s.once = [...(s.once || []), k]; }
        // a source that already left (a look-back trigger, like a dying Blood Artist's): keep its last known information
        if ((zone || "battlefield") === "battlefield" && !find(s, card.id)) (s.lki = s.lki || {})[card.id] = lastKnown(card);
        for (let k = 0; k < times; k++) {
          s.triggered.push({ side, name: card.name, srcId: card.id, td: defId(t), ...(zone && zone !== "battlefield" ? { zone } : {}),
            event: { id: e.obj && e.obj.id, side: e.side, controller: e.controller, ...(e.count != null ? { count: e.count } : {}), ...(e.vehicle ? { vehicle: e.vehicle } : {}),
              ...(e.spent != null ? { spent: e.spent } : {}), ...(e.mv != null ? { mv: e.mv } : {}) } });
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
    if (f.creatureOrEnchantment && !isCreature(c) && !typeHas(c, /enchantment/i)) return false;   // "target creature or enchantment"
    if (f.hasCounter && !(((c.counters || {})[f.hasCounter === true ? "+1/+1" : f.hasCounter] || 0) > 0)) return false;   // "with +1/+1 counters on them"
    if (f.enteredThisTurn && !c.enteredThisTurn) return false;                                   // "target creature that entered this turn"
    if (f.token && !c.token) return false;                                                       // "creature tokens you control"
    if (f.notExactlyColors != null && colorsOf(c).length === f.notExactlyColors) return false;  // "that isn't exactly two colors"
    if (f.nonbattle && isBattle(c)) return false;
    if (f.land && !isLand(c)) return false;                                                       // "lands you control"
    if (f.colorless && colorsOf(c).length) return false;
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
    if (f.legendary && !/\blegendary\b/i.test(c.type || "")) return false;
    if (f.nonlegendary && /\blegendary\b/i.test(c.type || "")) return false;
    if (f.enchantmentOnly && !typeHas(c, /enchantment/i)) return false;
    if (f.creature === true && !isCreature(c)) return false;
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
    if (kind === "graveyard-creature") return s[side].graveyard.filter(isCreature).map((c) => c.id);
    // a card in your graveyard: "target creature or Equipment card with mana value less than Nahiri's loyalty"
    if (kind === "graveyard-card") {
      const f = filter || {}, me = find(s, src.id) || src;
      // ("target card from a graveyard": anyGraveyard — either player's)
      return (f.anyGraveyard ? [...s.player.graveyard, ...s.opponent.graveyard] : f.oppGraveyard ? s[side === "player" ? "opponent" : "player"].graveyard : s[side].graveyard).filter((c) => { const g = faceOf(c, {});
        return objectIs(g, f) && (!f.creatureOrEquipment || isCreature(g) || subtypes(g).includes("Equipment")) &&
          (!f.mvBelowLoyalty || manaValue(g.cost) < loyaltyOf(me)) && (!f.mvAtMostDescend || manaValue(g.cost) <= permanentCardsIn(s, side)); }).map((c) => c.id);
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
    // "target planeswalker that player controls or battle that player protects" (the opponent's walkers; your Sieges)
    if (kind === "planeswalker-or-battle") return [...walkers.filter((id) => s[side === "player" ? "opponent" : "player"].battlefield.some((c) => c.id === id)), ...battles];
    return [...creatures, ...walkers, ...battles, "opp", "you"];
  }

  const sacrificeOptions = (s, card) =>
    card.sacrifice === "creature" ? s.player.battlefield.filter(isCreature).map((c) => c.id) : [];
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
  const craftOptions = (s, card, craft) => [...s.player.battlefield.filter((c) => c.id !== card.id && objectIs(c, craft.filter)),
    ...s.player.graveyard.filter((c) => objectIs(faceOf(c, {}), craft.filter))].map((c) => c.id);
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
    bestPayment(s, reducedCost(s, f, costOf(f, a) + (f.flashFor && !sorceryTime(s) ? f.flashFor : ""), a), { except, exclude: [...(a.bargain != null ? [a.bargain] : []), ...(a.tapFor != null ? [a.tapFor] : []), ...(a.teamwork != null ? [].concat(a.teamwork) : []), ...keep], lifePips: has(f, "compleated") ? a.lifePips || 0 : undefined, convoke: spellConvoke(s, f) ? (a.convoke == null ? "any" : a.convoke) : undefined });

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
      [].concat(target || []).forEach((t, i) => dealDamage(s, ctx.src, ctx.side, t, (ctx.split || [])[i] || 0, ev));
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
        const card = s.player.graveyard.find((c) => c.id === id);
        if (!card) return;
        s.player.graveyard = s.player.graveyard.filter((c) => c !== card);
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
          if (eff.exileAtEnd) delay(s, "exileIt", ctx.side, card.name, id, id);
        }
        else s.player.hand.push(card);
      });
      if ([].concat(target || []).length) emit(s, { type: "leavesGraveyard", side: "player", obj: { id: [].concat(target)[0] } }, ev);
      return;
    }
    // (a graveyard card as the target: handled before "its target is gone" below)
    if (eff.graveyardCopy) { moreEffects(s, { graveyardCopy: true }, null, null, ctx, ev, target); return; }
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
      z.poison = (z.poison || 0) + eff.poison;
      ev.push({ type: "poison", who: to, amount: eff.poison });
    }
    // discarding: the opponent's hand is cards you don't know; yours isn't targeted by these effects
    if (eff.discard && to === "opp") {
      const z = s.opponent;
      z.handCount = Math.max(0, (z.handCount || 0) - eff.discard);
      z.hand.splice(0, eff.discard).forEach((c) => putCard(s, c, "opponent", replaceMove(s, c, "hand", "graveyard", "opponent")));
      ev.push({ type: "discard", who: "opp", amount: eff.discard });
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
    if (eff.destroy && tgt && !indestructible(tgt)) leave(s, tgt, "graveyard", ev);
    if (eff.exile && tgt) {
      const owner = tgt.owner || sideOf(s, tgt), card = tgt.token ? null : tgt;
      leave(s, tgt, "exile", ev);
      // "… Return that card to the battlefield under its owner's control at the beginning of that player's next end step"
      // (your card: this turn's end step; the opponent's next end step comes after the puzzle)
      if (eff.returnAtEnd && card && owner === "player" && s.player.exile.some((x) => x.id === card.id)) delay(s, "returnExiled", ctx.side, (ctx.src && ctx.src.name) || "Return", ctx.selfId, card.id);
    }
    // a delayed trigger's object (ctx.event.id): the exiled card comes back (a new object, CR 400.7); a permanent is
    // exiled or sacrificed
    if (eff.returnExiled) {
      for (const side of ["player", "opponent"]) {
        const card = s[side].exile.find((x) => x.id === (ctx.event && ctx.event.id));
        if (!card) continue;
        s[side].exile = s[side].exile.filter((x) => x !== card);
        card.sick = true;
        ev.push({ type: "returned", id: card.id });
        enter(s, card, { side: card.owner || side }, ev);
      }
    }
    if (eff.exileEvent || eff.sacrificeEvent) {
      const t = find(s, ctx.event && ctx.event.id);
      if (t) leave(s, t, eff.exileEvent ? "exile" : "graveyard", ev, { sacrificed: !!eff.sacrificeEvent });
    }
    if (eff.bounce && tgt) leave(s, tgt, "hand", ev);
    if (eff.sacrifice && tgt) leave(s, tgt, "graveyard", ev, { sacrificed: true });   // "sacrifice it" (e.g. Ball Lightning)
    if (eff.counters && tgt) {                                   // e.g. { "+1/+1": 1 }; opposite counters then cancel (SBA)
      tgt.counters = { ...(tgt.counters || {}) };
      const lore0 = tgt.counters.lore || 0;
      // (a negative number removes counters: "remove a lore counter", never below 0)
      Object.entries(eff.counters).forEach(([type, n]) => { const k = amount(n);
        if (k > 0) addCounters(s, tgt, type, k, ev); else tgt.counters = { ...tgt.counters, [type]: Math.max(0, (tgt.counters[type] || 0) + k) }; });
      // CR 714.2b: lore counters put on a Saga trigger the chapter abilities they reach
      if (tgt.chapters && (tgt.counters.lore || 0) > lore0) emit(s, { type: "lore", obj: tgt, side: sideOf(s, tgt), before: lore0, after: tgt.counters.lore }, ev);
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
      for (let i = 0; i < (c0.count || 1); i++) createTokens(s, spec, ctx.side, ev).forEach((t) => { if (c0.hasteNow) grant(t, ["haste"], s); });
    }
    // "you may copy it" (the spell that triggered this): a choice, then a copy on the stack (CR 707.10)
    if (eff.copyEventSpell) {
      const item = s.stack.find((x) => x.kind === "spell" && x.id === (ctx.event && ctx.event.id));
      if (item && (eff.copyEventSpell.always || choose(s, `Copy ${item.name}?`, ["Copy it", "Don't copy it"], ctx.side) === 0)) {
        copySpell(s, item, { side: ctx.side, gain: eff.copyEventSpell.gain || [] }, ev);
      }
    }
    if (eff.untap && tgt) untap(s, tgt, ev);
    if (eff.attach && tgt) {                                     // an Aura resolving, or an equip ability
      const thing = find(s, ctx.selfId);
      if (thing) {
        thing.attachedTo = tgt.id;
        thing.ts = stamp(s);
        changed(s);                                    // CR 613.7e: a new timestamp when it becomes attached
        ev.push({ type: "attach", id: thing.id, to: tgt.id });
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
          : ptFrom.greatestOtherAttacker ? Math.max(0, ...otherAttackers().map(power)) : 0;
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
      addLoyalty(s, jace, eff.empower, ctx.side, ev);
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
        if (back && choose(s, `Cast ${back.name} (${card.name} transformed) for free?`, ["Cast it", "Don't cast it"], ctx.side, card.id) === 0) {
          s[owner].exile = s[owner].exile.filter((x) => x !== card);
          const a = { type: "cast", id: card.id, face: 1 };
          const f = faceOf(card, a);
          s.stack.unshift({ kind: "spell", name: f.name, id: card.id, a, card });
          ev.push({ type: "cast", id: card.id });
          emit(s, { type: "cast", obj: f, side: ctx.side, targetCount: 0, spellNumber: countSpell(s, ctx.side) }, ev);
        }
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
    // +1/+1 counters (its "when it dies or is exiled, return it" ability isn't modeled: puzzles end first)
    if (eff.earthbend && tgt) {
      addEffect(s, tgt, { becomeCreature: true });
      addEffect(s, tgt, { setBase: [0, 0] });
      grant(tgt, ["haste"], s);
      tgt.counters = { ...(tgt.counters || {}), "+1/+1": ((tgt.counters || {})["+1/+1"] || 0) + eff.earthbend };
      ev.push({ type: "earthbend", id: tgt.id, n: eff.earthbend });
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
    if (eff.damageController && tgt) dealDamage(s, ctx.src, ctx.side, sideOf(s, tgt) === "player" ? "you" : "opp", eff.damageController, ev);
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
      }
    }
    if (eff.team) {
      // ("Creatures and Vehicles you control gain haste": team.vehicles — a Vehicle that isn't a creature yet too)
      s[ctx.side].battlefield.filter((c) => isCreature(c) || (eff.team.vehicles && isVehicle(c))).filter((c) => matches(s, c, eff.team.filter, ctx.side) && !(eff.team.other && c.id === ctx.selfId)).forEach((c) => {
        if (eff.team.pump) addMod(s, c, eff.team.pump);
        if (eff.team.grant) grant(c, eff.team.grant, s);
        // "put a +1/+1 counter on each creature you control"
        if (eff.team.counters) Object.entries(eff.team.counters).forEach(([k, n]) => addCounters(s, c, k, amount(n), ev));
        // "double the power and toughness of each creature you control" (CR 701.10d: +X/+Y, X and Y its power and toughness)
        if (eff.team.multiplyPT) addMod(s, c, [(eff.team.multiplyPT - 1) * power(c), (eff.team.multiplyPT - 1) * toughness(c)]);
        // "get +1/+1 for each Forest you control" (pumpPer: { per: a filter on your permanents, pump })
        if (eff.team.pumpPer) { const n = s[ctx.side].battlefield.filter((x) => matches(s, x, eff.team.pumpPer.per, ctx.side)).length; addMod(s, c, [n * eff.team.pumpPer.pump[0], n * eff.team.pumpPer.pump[1]]); }
      });
    }
    moreEffects(s, eff, tgt, to, ctx, ev, target);
  }

  // Effects added for the rares and mythics (Phyrexia: All Will Be One onward)
  function moreEffects(s, eff, tgt, to, ctx, ev, target) {
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
    if (eff.copyNextSpell && ctx.side === "player") s.copyNext = [...(s.copyNext || []), { name: (ctx.src && ctx.src.name) || "Copy", srcId: ctx.selfId }];
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
      const z = s[ctx.side], n = eff.lookTop.n === "eventCount" ? (ctx.event && ctx.event.count) || 0 : eff.lookTop.n === "twiceLands" ? 2 * s[ctx.side].battlefield.filter(isLand).length : eff.lookTop.n;
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
          const fits = (kinds ? !!kind : objectIs(faceOf(c, {}), eff.lookTop.filter || {})) && (eff.lookTop.max == null || taken < eff.lookTop.max);
          if (fits && kind) ctx.kindsTaken = [...(ctx.kindsTaken || []), kind];
          // (to: "battlefield" — "If this spell was bargained, put the revealed cards onto the battlefield")
          const where = eff.lookTop.to === "battlefield" ? "the battlefield" : "your hand";
          if (fits && choose(s, `Put ${c.name} onto ${where}?`, [`Onto ${where}`, "To the bottom"], ctx.side, c.id) === 0) {
            taken++;
            if (eff.lookTop.to === "battlefield") { c.sick = true; if (eff.lookTop.tapped) c.tapped = true; enter(s, asFace(c, 0), { side: ctx.side }, ev); } else z.hand.push(c);
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
      const known = [...z.library, ...z.libraryBottom].filter((c) => objectIs(faceOf(c, {}), eff.search.filter || {}) && (!eff.search.basic || /\bbasic\b/i.test(c.type || "")));
      // ("search your library and/or graveyard": graveyard cards can be found too, without a shuffle making them unknown)
      if (eff.search.graveyardToo) known.push(...z.graveyard.filter((c) => objectIs(faceOf(c, {}), eff.search.filter || {})));
      const pick = known.length ? choose(s, "Search: which card?", [...known.map((c) => `Find ${c.name}`), "Find nothing"], ctx.side, [...known.map((c) => c.id), null]) : 0;
      const found = known[pick];
      if (found) { z.library = z.library.filter((c) => c !== found); z.libraryBottom = z.libraryBottom.filter((c) => c !== found); z.graveyard = z.graveyard.filter((c) => c !== found);
        if (eff.search.toTop) { z.libraryCount = (z.libraryCount || 0) + z.library.length + z.libraryBottom.length; z.library = [found]; z.libraryBottom = []; ev.push({ type: "search", side: ctx.side, id: found.id }); return; }
        if (eff.search.landToBattlefield && isLand(faceOf(found, {}))) { found.tapped = true; enter(s, asFace(found, 0), { side: ctx.side }, ev); } else z.hand.push(found); }
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
      ev.push({ type: "emblem", id: em.id });
    }
    // "you may pay {3}. If you do, …" (only you pay; with mana you have)
    if (eff.mayPay && ctx.side === "player") {
      const pay = bestPayment(s, eff.mayPay.cost);
      if (pay && choose(s, `Pay ${eff.mayPay.cost}?`, [`Pay ${eff.mayPay.cost}`, "Don't pay"], "player") === 0) { spend(s, pay, ev); applyEffect(s, eff.mayPay.then, target, ctx, ev); }
    }
    // "you may pay 2 life. If you do, …"
    if (eff.mayPayLife && ctx.side === "player" && canPayLife(s, eff.mayPayLife.n) &&
      choose(s, `Pay ${eff.mayPayLife.n} life?`, [`Pay ${eff.mayPayLife.n} life`, "Don't pay"], "player") === 0) {
      changeLife(s, "you", -eff.mayPayLife.n, ev);
      applyEffect(s, eff.mayPayLife.then, target, ctx, ev);
    }
    // several effects one after another ("Draw a card, then scry 2"; "proliferate twice")
    // (a target that's gone after an earlier part — "Destroy target …, then draw a card" — doesn't stop the later parts)
    const still = (t) => t == null || t === "opp" || t === "you" || Array.isArray(t) || !!find(s, t) ||
      [...s.player.graveyard, ...s.opponent.graveyard].some((c) => c.id === t);
    if (eff.seq) eff.seq.forEach((e) => applyEffect(s, e, still(target) ? target : undefined, ctx, ev));
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
    // "exile the top two cards of your library. You may play those cards this turn." (the known ones become playable)
    if (eff.impulseAll && ctx.side === "player") {
      const z = s.player;
      for (let i = 0; i < eff.impulseAll; i++) {
        const c = z.library.shift() || (!(z.libraryCount > 0) ? z.libraryBottom.shift() : null);
        // (impulseFilter: only those can be played — "you may cast an instant or sorcery spell from among them";
        // oneOf: only one of them — casting one ends the others' permission)
        if (c) {
          if (!eff.impulseFilter || objectIs(faceOf(c, {}), eff.impulseFilter)) { c.playable = true; if (eff.oneOf) c.oneOf = `${ctx.selfId}-${s.nextId}`; }
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
      ["player", "opponent"].forEach((side) => s[side].battlefield.filter((c) => isCreature(c) && c.id !== keep[side] && !(eff.keepOneEach.destroy && indestructible(c)))
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
      const all = battlefieldNow(s).map(({ card }) => card).filter(isCreature);
      const before = s.listens.length ? battlefieldNow(s) : null;
      all.forEach((c) => leave(s, c, "exile", ev, { lookBack: before }));
      ctx.exiled = all.length;
    }
    // Archangel Elspeth −6: "Return all nonland permanent cards with mana value 3 or less from your graveyard to the battlefield"
    if (eff.massReturn) {
      const z = s[ctx.side];
      const back = z.graveyard.filter((c) => { const g = faceOf(c, {}); return isPermanent(g) && !isLand(g) && manaValue(g.cost) <= eff.massReturn.maxMV; });
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
      const list = s[ctx.side].battlefield.filter((c) => objectIs(c, eff.maySacrificeThen.filter || {}));
      const k = list.length ? choose(s, "Sacrifice one?", [...list.map((c) => `Sacrifice ${c.name}`), "Don't"], ctx.side, [...list.map((c) => c.id), null]) : 0;
      if (k < list.length) { leave(s, list[k], "graveyard", ev, { sacrificed: true }); applyEffect(s, eff.maySacrificeThen.then, undefined, ctx, ev); }
    }
    // "Target player mills four cards" (the opponent's library is unknown cards: they only leave it)
    if (eff.millTarget && (to === "opp" || target === "opp")) s.opponent.libraryCount = Math.max(0, (s.opponent.libraryCount || 0) - eff.millTarget);
    if (eff.millTarget && (to === "you" || target === "you")) applyEffect(s, { mill: eff.millTarget }, undefined, { ...ctx, side: "player" }, ev);
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
        const perm = faceOf(card, { face: 1 });
        perm.transformed = true; perm.tapped = true;
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
      [...s.player.hand].filter((c) => !c.unknown && objectIs(faceOf(c, {}), eff.putFromHand.filter || {}))
        .filter((c) => room > 0 && choose(s, `Put ${c.name} onto the battlefield?`, ["Put it", "Keep it in hand"], "player", c.id) === 0 && room-- > 0)
        .forEach((c) => { s.player.hand = s.player.hand.filter((x) => x !== c); c.sick = true; enter(s, asFace(c, 0), { side: "player" }, ev); });
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
      if (me && power(me) === 20) { const before = s.listens.length ? battlefieldNow(s) : null; battlefieldNow(s).map(({ card }) => card).filter((c) => isCreature(c) && c !== me && !indestructible(c)).forEach((c) => leave(s, c, "graveyard", ev, { lookBack: before })); }
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
      battlefieldNow(s).map(({ card }) => card).filter((c) => isCreature(c) && power(c) >= k && !indestructible(c)).forEach((c) => leave(s, c, "graveyard", ev, { lookBack: before }));
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
      const picks = eff.fromMilled.all ? milled : eff.fromMilled.upTo ? ((n) => milled.filter((c) => n > 0 && choose(s, `Put ${c.name} into your hand?`, ["Put it", "Leave it"], ctx.side, c.id) === 0 && n-- > 0))(eff.fromMilled.upTo) : milled.length ? [milled[choose(s, "Which milled card?", milled.map((c) => c.name), ctx.side, milled.map((c) => c.id))]] : [];
      picks.forEach((card) => {
        z.graveyard = z.graveyard.filter((c) => c !== card);
        if (eff.fromMilled.to === "hand") z.hand.push(card); else { card.sick = true; enter(s, asFace(card, 0), { side: ctx.side }, ev); }
      });
    }
    // "Return all creatures to their owners' hands. For each opponent who controlled a creature returned this way, you create …"
    if (eff.bounceAllCreatures) {
      const theirs = s.opponent.battlefield.some(isCreature);
      const before = s.listens.length ? battlefieldNow(s) : null;
      battlefieldNow(s).map(({ card }) => card).filter(isCreature).forEach((c) => leave(s, c, "hand", ev, { lookBack: before }));
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
    const pick = (who) => (who === "opponent" ? s.opponent.battlefield : who === "yours" ? s.player.battlefield
      : [...s.player.battlefield, ...s.opponent.battlefield]).filter(isCreature);
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
      pick(eff.destroyAll.creatures).filter((c) => !indestructible(c) && !(eff.destroyAll.exceptCreated && (ctx.created || []).includes(c.id)))
        .forEach((c) => leave(s, c, "graveyard", ev, { lookBack: before }));
    }
    if (eff.untapAll) pick(eff.untapAll.creatures).forEach((c) => untap(s, c, ev));
    // CR 701.34a: proliferate — choose any number of permanents and/or players that have a counter, then give each
    // one an additional counter of each kind already there (one yes/no choice per candidate)
    if (eff.proliferate) {
      const counted = (c) => Object.values(c.counters || {}).some((n) => n > 0);
      const players = [["opp", s.opponent], ["you", s.player]].filter(([, z]) => (z.poison || 0) > 0);
      const perms = battlefieldNow(s).map(({ card }) => card).filter(counted);
      players.forEach(([who, z]) => {
        const label = who === "opp" ? "the opponent" : "you";
        if (choose(s, `Proliferate: ${label} (${z.poison} poison)?`, ["Add one", "Skip"], ctx.side) !== 0) return;
        z.poison += 1;
        ev.push({ type: "poison", who, amount: 1 });
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
    const f = faceOf(found, {});
    const parts = isPermanent(f) && !f.aura ? [{}] : plan(f, {});
    const p = parts[0] || {};
    // (spells with modes, several targets or divided damage can only be put into your hand here)
    const simple = parts.length === 1 && !f.modes && f.divided == null && !p.slots && !parseCost(f.cost).x && !f.aura;
    const targets = simple && p.targets ? targetsFor(s, f, p.targets, p.filter, side) : null;
    const casts = !simple ? [] : targets ? targets.map((t) => ({ target: t, label: `Cast it → ${nameIn(s, t)}` })) : [{ target: undefined, label: "Cast it" }];
    const pick = choose(s, `Discover ${n}: ${found.name}`, [...casts.map((x) => x.label), "Put it into your hand"], side, found.id);
    if (pick < casts.length) {
      const a = { type: "cast", id: found.id, target: casts[pick].target };
      s.stack.unshift({ kind: "spell", name: f.name, id: found.id, a, card: found });
      ev.push({ type: "cast", id: found.id, target: a.target });
      emit(s, { type: "cast", obj: f, side, targetCount: a.target != null ? 1 : 0, spellNumber: countSpell(s, side) }, ev);
      commitCrime(s, a.target, side, ev);
    } else z.hand.push(found);
    emit(s, { type: "discovers", obj: { id: found.id }, side }, ev);
    return found;
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
    emit(s, { type: "discard", obj: card, side: "player", count: 1 }, ev);
  }

  // A library is: known cards on top (library), then unknown, irrelevant cards (libraryCount), then known
  // cards put on the bottom (libraryBottom, e.g. by scry). An unknown card can't be used.
  function draw(s, side, n, ev) {
    const z = s[side];
    for (let i = 0; i < n; i++) {
      // (cards drawn this turn, per player: "whenever an opponent draws their second card each turn", Heliod's cost reduction)
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
  const ozolithBonus = (s, side, c) => (isArtifact(c) || isCreature(c) ? s[side].battlefield.filter((o) => o.plusOneMore && !(o.st && o.st.lost)).length : 0);
  function addCounters(s, c, kind, n, ev, side) {
    if (!(n > 0) || !c) return 0;
    const who = side || (find(s, c.id) ? sideOf(s, c) : null);
    if (kind === "+1/+1" && who) n += ozolithBonus(s, who, c);
    c.counters = { ...(c.counters || {}), [kind]: ((c.counters || {})[kind] || 0) + n };
    if (KW_COUNTERS.includes(kind) || kind === "charge") changed(s);   // (a keyword counter changes its abilities)
    ev.push({ type: "counters", id: c.id, counters: { [kind]: n } });
    if (find(s, c.id)) emit(s, { type: "countersPut", obj: c, side: who, kind, count: n }, ev);
    return n;
  }
  const createToken = (s, spec, side, ev) => createTokens(s, spec, side, ev)[0];
  function createTokens(s, spec, side, ev) {
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
  function enter(s, perm, { x, payLife, lifePips, side = "player" } = {}, ev) {
    // "You may have this creature enter as a copy of any creature on the battlefield, except …" (CR 614.1c, 707.5):
    // chosen as it enters; it enters as the copy, so the copied "enters" abilities and triggers apply
    if (perm.entersAsCopy) {
      const options = battlefieldNow(s).map(({ card }) => card).filter(isCreature);
      const pick = choose(s, `${perm.name}: enter as a copy of a creature?`, ["Don't copy", ...options.map((c) => `Copy ${c.name}`)], side, [null, ...options.map((c) => c.id)]);
      if (pick > 0) {
        const keep = { id: perm.id, owner: perm.owner, sick: perm.sick };
        const v = copyValues(options[pick - 1], perm.entersAsCopy.except);
        Object.keys(perm).forEach((k) => delete perm[k]);
        Object.assign(perm, v, keep);
      }
    }
    listen(s, perm);                                           // (a token is new to the puzzle)
    perm.owner = perm.owner || side;
    if (perm.entersTapped) perm.tapped = true;
    // "Creatures and nonbasic lands your opponents control enter tapped" (Thalia and The Gitrog Monster)
    const other = side === "player" ? "opponent" : "player";
    if ((isCreature(perm) || (isLand(perm) && !/\bbasic\b/i.test(perm.type || ""))) && s[other].battlefield.some((c) => c.oppEntersTapped && !(c.st && c.st.lost))) perm.tapped = true;
    if (perm.payLifeOrTapped) {
      if (payLife && side === "player" && canPayLife(s, perm.payLifeOrTapped)) changeLife(s, "you", -perm.payLifeOrTapped, ev);
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
      const kinds = typeof w === "object" ? w : { "+1/+1": w === "X" ? x || 0 : w };
      // (Ozolith applies to a permanent entering with counters too)
      Object.entries(kinds).forEach(([k, n]) => { if (n) perm.counters = { ...(perm.counters || {}), [k]: ((perm.counters || {})[k] || 0) + n + (k === "+1/+1" ? ozolithBonus(s, side, perm) : 0) }; });
    }
    perm.enteredThisTurn = true;                               // (power-up: "if this permanent entered this turn")
    if (x) perm.xPaid = x;                                     // ("incubate 3 X times": the X paid to cast it)
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
    if (side === "player" && hasType(perm, "Zombie")) s.zombiesEntered = (s.zombiesEntered || 0) + 1;   // (Geralf)
    // "This land enters tapped unless you control two or fewer other lands" (entersTappedUnless: { maxOtherLands })
    if (perm.entersTappedUnless && s[side].battlefield.filter(isLand).length > perm.entersTappedUnless.maxOtherLands) perm.tapped = true;
    s[side].battlefield.push(perm);
    changed(s);
    emit(s, { type: "enters", obj: perm, side }, ev);
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
      if (life) changeLife(s, "you", -life, ev);
    }
    return true;
  }

  // Pay with the chosen sources: floating mana leaves the pool, Treasures are sacrificed, the rest tap.
  // Returns how many Treasures were sacrificed (their triggers resolve after the cost is paid).
  function spend(s, ids, ev) {
    let treasures = 0;
    ids.filter((id) => id.startsWith("pool:")).map((id) => Number(id.slice(5))).sort((x, y) => y - x).forEach((i) => s.pool.splice(i, 1));
    s.firePool = (s.firePool || 0) - ids.filter((id) => id.startsWith("fire:")).length;
    if (!s.firePool) delete s.firePool;
    ids.filter((id) => id.startsWith("life:")).forEach(() => changeLife(s, "you", -2, ev));
    // every source this payment taps: those it uses directly, and those whose extra mana it uses ("id+n")
    const tapped = [...new Set(ids.filter((id) => !id.startsWith("pool:") && !id.startsWith("fire:") && !id.startsWith("life:")).map((id) => id.split("+")[0]))];
    tapped.forEach((id) => {
      const src = find(s, id);
      // one tap makes all its mana at once (CR 605.4a); what this payment doesn't use stays in your pool (CR 106.4)
      if (!ids.includes(id) && !isTreasure(src)) s.pool.push(produces(src));
      const used = ids.filter((x) => x.startsWith(id + "+")).map((x) => Number(x.slice(id.length + 1)) - 1);
      manaExtras(s, src).forEach((colors, k) => { if (!used.includes(k)) s.pool.push(colors); });
      if (isTreasure(src)) { leave(s, src, "graveyard", ev, { sacrificed: true }); treasures++; }   // its "sacrifice" cost
      else tap(s, src, ev);
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
          const d = trig(q); return !d.targets || targetChoices(targetsFor(s, srcOf(s, q), d.targets, d.filter, q.side), d.count).length > 0; });
        if (s.pending.length !== n0) continue;
        if (orderChoices(s).length) return;                                  // you choose which of yours goes first
        // CR 603.3c: a modal triggered ability's modes are chosen as it's put on the stack (modes whose targets have
        // no legal choice can't be chosen); the opponent's: the choice worst for you
        const def = TRIGGER_DEFS[p.td];
        if (def.modes && p.modes == null) {
          const src = srcOf(s, p);
          const combos = modeCombos(def).filter((l) => l.every((i) => { const m = def.modes[i];
            return !m.targets || (m.count && m.count.min === 0) || targetsFor(s, src, m.targets, m.targetFilter, p.side).length; }));
          if (!combos.length) { s.pending.shift(); continue; }
          const pick = choose(s, `${p.name}: choose ${def.anyNumber ? "any number" : def.oneOrBoth ? "one or both" : "one"}`,
            combos.map((l) => (l.length ? l.map((i) => def.modes[i].text).join(" + ") : "No mode")), p.side);
          s.pending[0] = { ...p, modes: combos[pick] };
          continue;
        }
        const d = trig(p);
        const options = d.targets ? targetChoices(targetsFor(s, srcOf(s, p), d.targets, d.filter, p.side), d.count) : null;
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
      s.player.graveyard.some((c) => (c.flashback || (c.mayhem && c.discardedThisTurn)) && castNow(c, "graveyard")) ||
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
    if (d.targets && target != null) {
      const legal = targetsFor(s, src, d.targets, d.filter, p.side);
      const kept = [].concat(target).filter((x) => legal.includes(x));
      if (!kept.length) { ev.push({ type: "fizzled", name: p.name }); return; }
      target = Array.isArray(target) ? kept : kept[0];
      if (p.side === "player" && !payWard(s, target, ev)) return;            // ward on its target (CR 702.21a)
    }
    ev.push({ type: "trigger", name: p.name, target });
    applyEffect(s, d.effect, target, { src, side: p.side, selfId: p.srcId, event: p.event }, ev);
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
    if (power(a) <= 2 && power(b) >= 3 && s[sideOf(s, a)].battlefield.some((c) => c.delney && !(c.st && c.st.lost))) return false;   // (Delney)
    if (has(a, "unblockable")) return false;
    if (has(a, "flying") && !has(b, "flying") && !has(b, "reach")) return false;
    if (has(a, "shadow") !== has(b, "shadow")) return false;
    if (has(a, "horsemanship") && !has(b, "horsemanship")) return false;
    if (has(a, "intimidate") && !(isArtifact(b) && isCreature(b)) && !shareColor(a, b)) return false;
    if (has(a, "fear") && !(isArtifact(b) && isCreature(b)) && !colorsOf(b).includes("B")) return false;
    if (has(a, "skulk") && power(b) > power(a)) return false;
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
  }

  // A first-strike damage step happens if an attacking or blocking creature has first or double strike
  function firstStrikeStepNeeded(s) {
    const C = s.combat;
    const inCombat = [...C.attackers, ...Object.values(C.blocks || {}).flat()].map((id) => find(s, id)).filter(Boolean);
    return inCombat.some(firstStriker);
  }

  function combatDamage(s, first, ev) {
    const C = s.combat;
    const deals = (c) => first ? firstStriker(c)
      : !C.fsHappened || !C.dealtFirst.includes(c.id) || has(c, "double strike");
    const hits = [];                                           // all combat damage is dealt at once
    C.attackers.forEach((aid) => {
      const a = s.player.battlefield.find((c) => c.id === aid);
      if (!a || !deals(a)) return;
      if (first) C.dealtFirst.push(a.id);
      let left = Math.max(power(a), 0);
      if (!left) return;
      const bs = (C.blocks[aid] || []).map((id) => s.opponent.battlefield.find((c) => c.id === id)).filter(Boolean);
      // what it's attacking: the opponent, or a planeswalker (CR 510.1b); if that planeswalker has left, nothing is
      // dealt to it (blockers still are)
      const at = (C.at && C.at[aid]) || "opp";
      const toAt = (n) => { if (at === "opp" || find(s, at)) hits.push({ src: a, side: "player", to: at, n }); };
      if (!C.blocked[aid]) { toAt(left); return; }
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
    s.pool = [];                                               // mana empties between steps
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
    if (step === "end") emit(s, { type: "endStep", side: "player" }, ev);
    // "at the beginning of combat on your turn" (CR 507.1: triggers as the step begins)
    if (step === "boc") emit(s, { type: "beginningOfCombat", side: "player" }, ev);
    if (step === "main2") emit(s, { type: "main2", side: "player" }, ev);        // "at the beginning of your second main phase"
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
  const exhaustSlot = (card, ab) => (card.abilities || []).indexOf(ab);
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
  // (attachedToSelf: "Sacrifice an Aura attached to this creature")
  const sacCostOptions = (s, card, ab) => s.player.battlefield.filter((c) => !(ab.sacCost.other && c.id === card.id) &&
    !(ab.sacCost.filter && ab.sacCost.filter.attachedToSelf && c.attachedTo !== card.id) &&
    objectIs(c, ab.sacCost.filter || {}) && matches(s, c, ab.sacCost.filter, "player")).map((c) => c.id);
  // "Tap three untapped artifacts and/or creatures you control" (not {T}: summoning-sick ones can be tapped, CR 302.6)
  const tapCostOptions = (s, card, ab) => s.player.battlefield.filter((c) => !c.tapped && (isArtifact(c) || isCreature(c))).map((c) => c.id);
  const exileCostOptions = (s, ab) => s.player.graveyard.filter((c) => objectIs(faceOf(c, {}), ab.exileCost.filter || {})).map((c) => c.id);
  function abilityCost(s, card, ab, x, waterTap) {
    let cost = withX(ab.cost, x);
    // "This ability costs {1} less to activate for each oil counter on this creature" (lessPerCounter: the kind);
    // "Activated abilities of lands you control cost {1} less" (Blossoming Tortoise); Agatha of the Vile Cauldron:
    // creatures' abilities cost {X} less, X her power, but not below one mana in total
    if (ab.loyalty == null && cost) {
      const p = parseCost(cost);
      const live = (key) => s.player.battlefield.filter((c) => c[key] && !(c.st && c.st.lost));
      let less = ab.lessPerCounter ? (card.counters || {})[ab.lessPerCounter] || 0 : 0;
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
    // loyalty abilities (CR 606.3): your main phase with an empty stack, one per permanent per turn; a minus cost
    // needs that many loyalty counters (CR 606.6)
    if (ab.loyalty != null) {
      if (!sorceryTime(s)) return "Loyalty abilities only in your main phase, with nothing on the stack.";
      if (card.loyaltyUsed) return `${card.name} has already used a loyalty ability this turn.`;
      if (ab.loyalty < 0 && loyaltyOf(card) < -ab.loyalty) return `${card.name} doesn't have ${-ab.loyalty} loyalty.`;
      if (ab.loyaltyX && x != null && !(x >= 0 && x <= loyaltyOf(card))) return `${card.name} doesn't have ${x} loyalty.`;
    }
    if (ab.tap && card.tapped) return `${card.name} is tapped.`;
    // (Tyvar, Jubilant Brawler: "You may activate abilities of creatures you control as though those creatures had haste")
    const hasteForAbilities = s.player.battlefield.some((c) => c.abilitiesHaste && !(c.st && c.st.lost));
    if (ab.tap && isCreature(card) && card.sick && !has(card, "haste") && !hasteForAbilities) return `${card.name} has summoning sickness.`;
    // "Remove an oil counter from this artifact: …" (a cost: the counters must be there to remove, CR 118.3)
    const rc = ab.removeCounters;
    if (rc && ((card.counters || {})[rc.kind] || 0) < (rc.n || 1)) return `${card.name} doesn't have ${rc.n || 1} ${rc.kind} counter${(rc.n || 1) > 1 ? "s" : ""}.`;
    if (ab.craft && !craftOptions(s, card, ab.craft).length) return `${card.name} has nothing to craft with.`;
    // (tapping creatures to crew isn't a {T} cost: summoning-sick creatures can crew, CR 302.6 only covers {T}/{Q})
    if (ab.crew && crewHelpers(s, card).reduce((t, id) => t + crewPower(find(s, id)), 0) < ab.crew) return `Your untapped creatures don't have ${ab.crew} total power to ${ab.saddle ? "saddle" : "crew"} it.`;
    if (ab.sorcery && !sorceryTime(s)) return `You can only ${ab.text || "do that"} during your main phase, with nothing on the stack.`;
    if (ab.stationAb && !crewHelpers(s, card).length) return `You have no other untapped creature to station ${card.name} with.`;
    if (ab.discardCost && s.player.hand.length < discardCount(ab)) return discardCount(ab) > 1 ? `You don't have ${discardCount(ab)} cards to discard.` : "You have no card to discard.";   // "Discard a card: …"
    // "Sacrifice two other artifacts and/or creatures: …"; "Exile three creature cards from your graveyard: …"; "Pay 2 life"
    if (ab.sacCost && sacCostOptions(s, card, ab).length < ab.sacCost.n) return `You don't have enough to sacrifice for ${card.name}'s ability.`;
    if (ab.exileCost && exileCostOptions(s, ab).length < ab.exileCost.n) return `You don't have enough cards in your graveyard for ${card.name}'s ability.`;
    if (ab.tapCost && tapCostOptions(s, card, ab).length < ab.tapCost.n) return `You don't have ${ab.tapCost.n} untapped artifacts and/or creatures to tap.`;
    if (ab.lifeCost && !canPayLife(s, ab.lifeCost)) return `You don't have ${ab.lifeCost} life to pay.`;
    // "Activate only if …" (requires: a condition about this permanent or the game)
    if (ab.requires && !conditionHolds(s, ab.requires, "player", card)) return ab.requiresText || `${card.name} can't do that right now.`;
    if (ab.blight && !s.player.battlefield.some(isCreature)) return "You have no creature to blight.";   // "{T}, Blight 1: …"
    // CR 702.178a: "Max speed — [ability]": it has the ability only while your speed is 4
    if (ab.maxSpeed && !maxSpeed(s, "player")) return `${card.name} has that ability only at max speed (your speed is ${speedOf(s, "player")}).`;
    if (ab.exhaust && !exhaustReady(s, card, ab)) return `${card.name}'s exhaust ability has already been activated.`;
    if (ab.oncePerTurn && (card.usedOnce || []).includes(exhaustSlot(card, ab))) return `${card.name}'s ability can be activated only once each turn.`;
    if (ab.powerUp && card.poweredUp) return `${card.name}'s power-up ability has already been activated.`;   // CR 702.193a: only once
    if (ab.cost && !bestPayment(s, abilityCost(s, card, ab, x), { exclude: ab.tap ? [card.id] : [] })) return "Not enough mana.";
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
  function castable(s, id) {
    const h = s.player.hand.find((c) => c.id === id);
    if (h) return { card: h, zone: "hand" };
    // CR 722.3c: a prepared permanent's prepare spell: a copy you may cast ("<permanent id>#prep")
    if (typeof id === "string" && id.endsWith("#prep")) {
      const p = s.player.battlefield.find((c) => c.id === id.slice(0, -5) && c.prepared && c.prepare);
      return p ? { card: preparedSpell(p), zone: "prepared", source: p } : null;
    }
    // (or a card exiled with "you may play that card this turn", or a card plotted on an earlier turn, CR 702.170d)
    // (or airbent: castable for {2}, CR 701.65a)
    const e = s.player.exile.find((c) => c.id === id && (c.onAdventure || c.playable || (c.plotted && !c.plottedNow) || c.airbent));
    if (e) return { card: e, zone: "exile" };
    // (or harmonize, CR 702.180a)
    // (or mayhem, if you discarded it this turn, CR 702.187b)
    const g = s.player.graveyard.find((c) => c.id === id && (c.flashback || c.harmonize || c.graveAdventure || (c.mayhem && c.discardedThisTurn) || (s.creaturesFromGraveyard && isCreature(faceOf(c, {})))));
    return g ? { card: g, zone: "graveyard" } : null;
  }
  // The spell as it's cast from where it is: from the graveyard by flashback, its flashback cost is paid rather than
  // its mana cost (an alternative cost, CR 118.9; plus any other part of the flashback cost, like beholding)
  // Cast face down with disguise (a.faceDown): a 2/2 face-down creature spell with ward {2} that costs {3} (CR 702.168b, 708.4)
  // CR 702.194a-b: teamwork — "if this spell was cast using teamwork" (a.teamwork: the creatures tapped): its teamwork
  // version (ifTeamwork), or "choose both instead" (teamworkBoth)
  const castFace = (from, a) => withTeamwork(castFaceBase(from, a), a);
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
    // CR 702.170d: a plotted card is cast without paying its mana cost (an alternative cost: nothing to pay)
    if (from.zone === "exile" && from.card.plotted) return { ...f, cost: "", plottedCast: true };
    // airbent: {2} rather than its mana cost (CR 701.65a)
    if (from.zone === "exile" && from.card.airbent) return { ...f, cost: "{2}", printedCost: f.cost };
    // CR 702.185a: warp — cast it from your hand for its warp cost instead (a.warp)
    if (a.warp && from.zone === "hand" && from.card.warp) return { ...f, cost: from.card.warp, warpCast: true, printedCost: f.cost };
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
      if (t == null) return part.slots.every((sl) => targetsFor(s, src, sl.targets, sl.filter).length) ? null : `${src.name} has no legal target.`;
      if (!Array.isArray(t) || t.length !== part.slots.length) return "Choose the targets.";
      if (new Set(t).size !== t.length) return "Choose different targets.";
      return part.slots.every((sl, i) => targetsFor(s, src, sl.targets, sl.filter).includes(t[i])) ? null : "That isn't a legal target.";
    }
    if (!part.targets) return null;
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
      const card = s.player.hand.find((c) => c.id === a.id) || s.player.exile.find((c) => c.id === a.id && c.playable);
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
      if (!sorceryTime(s)) return "Renew only as a sorcery: your main phase, with nothing on the stack.";
      if (!bestPayment(s, card.renew.cost)) return `Not enough mana to renew ${card.name}.`;
      const legal = targetsFor(s, card, card.renew.targets, card.renew.filter);
      if (!legal.length) return "There's no legal target.";
      return a.target == null ? null : validTargets(a.target, legal, ONE);
    }
    if (a.type === "cycle") {
      const card = s.player.hand.find((c) => c.id === a.id);
      if (!card || !card.cycling) return "Only a card with cycling in your hand can be cycled.";
      if (!bestPayment(s, card.cycling, { except: card.id })) return `Not enough mana to cycle ${card.name}.`;
      return null;
    }
    // CR 702.170a / 116.2k: plot — exile it from your hand and pay its plot cost, during your main phase with an empty stack
    if (a.type === "plot") {
      const card = s.player.hand.find((c) => c.id === a.id);
      if (!card || !card.plot) return "Only a card with plot in your hand can be plotted.";
      if (!sorceryTime(s)) return "You can only plot during your main phase, with nothing on the stack.";
      if (!bestPayment(s, card.plot, { except: card.id })) return `Not enough mana to plot ${card.name}.`;
      return null;
    }
    if (a.type === "cast") {
      const from = castable(s, a.id);
      if (!from || from.card.unknown) return "You can't cast that.";
      if (from.zone === "exile" && from.card.onAdventure && (a.face || 0) !== 0) return "From exile you can only cast its creature.";
      if (a.faceDown && !from.card.disguise) return "Only a card with disguise can be cast face down.";
      if (a.faceDown && from.zone === "graveyard") return "You can't cast it face down from there.";
      if (a.warp && !(from.card.warp && from.zone === "hand")) return "Only a card with warp in your hand can be cast for its warp cost.";
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
        else if (picks.length !== n || new Set(picks).size !== n || picks.some((m) => !f.modes[m])) return n === 1 ? "Choose a mode." : `Choose ${n} different modes.`;
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
        if (a.discard != null && a.discard !== "pay" && !s.player.hand.some((c) => c.id === a.discard && c.id !== from.card.id)) return "Discard a card from your hand.";
        if (a.discard == null && !f.discardCost.orPay && !s.player.hand.some((c) => c.id !== from.card.id)) return `${f.name} needs a card to discard.`;
      } else if (a.discard != null) return `${f.name} has no discard cost.`;
      if (a.gift && !f.gift) return `${f.name} has no gift.`;
      // collect evidence N (CR 701.59a): exile cards from your graveyard with total mana value N or more (a.evidence)
      if (a.evidence != null) {
        if (!f.evidence) return `${f.name} doesn't collect evidence.`;
        const l = [].concat(a.evidence), cards = l.map((id) => s.player.graveyard.find((c) => c.id === id));
        if (new Set(l).size !== l.length || cards.some((c) => !c)) return "Collect evidence from cards in your graveyard.";
        if (cards.reduce((t, c) => t + manaValue(faceOf(c, {}).cost), 0) < f.evidence) return `Collect evidence ${f.evidence}: exile cards with total mana value ${f.evidence} or more.`;
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
      if (ab.craft && !craftOptions(s, card, ab.craft).includes(a.craft)) return "Choose something to craft with.";
      if (ab.stationAb && !(a.crew && a.crew.length === 1 && crewHelpers(s, card).includes(a.crew[0]))) return "Station: tap one other untapped creature you control.";
      if (ab.discardCost && a.discard != null) {
        const l = [].concat(a.discard);
        if (l.length !== discardCount(ab) || new Set(l).size !== l.length || !l.every((id) => s.player.hand.some((c) => c.id === id))) return discardCount(ab) > 1 ? `Discard ${discardCount(ab)} cards from your hand.` : "Discard a card from your hand.";
      }
      // which permanents are sacrificed / which graveyard cards are exiled for the cost (exactly that many, all different)
      const exactly = (l, n, opts) => Array.isArray(l) && l.length === n && new Set(l).size === n && l.every((id) => opts.includes(id));
      if (ab.sacCost && a.sacs != null && !exactly(a.sacs, ab.sacCost.n, sacCostOptions(s, card, ab))) return `Choose ${ab.sacCost.n} to sacrifice.`;
      if (ab.tapCost && a.taps != null && !exactly(a.taps, ab.tapCost.n, tapCostOptions(s, card, ab))) return `Choose ${ab.tapCost.n} to tap.`;
      if (ab.exileCost && a.exiles != null && !exactly(a.exiles, ab.exileCost.n, exileCostOptions(s, ab))) return `Choose ${ab.exileCost.n} cards to exile from your graveyard.`;
      if (ab.blight && a.blight != null && !blightOptions(s).includes(a.blight)) return "You can only blight a creature you control.";
      if (a.waterTap != null) {
        const helpers = waterHelpers(s, card, ab), l = a.waterTap;
        if (!ab.waterbend || new Set(l).size !== l.length || !l.every((id) => helpers.includes(id)) || l.length > parseCost(withX(ab.cost, a.x)).generic) return "Waterbend: tap your untapped artifacts and creatures, one per generic mana.";
        if (!bestPayment(s, abilityCost(s, card, ab, a.x, l), { exclude: [...(ab.tap ? [card.id] : []), ...l] })) return "Not enough mana.";
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
        if (has(c, "defender") || has(c, "can't attack")) return `${c.name} can't attack.`;
        if (c.sick && !has(c, "haste")) return `${c.name} has summoning sickness and can't attack this turn.`;
      }
      // CR 508.1d: requirements — a creature that "attacks each combat if able" must attack if it can
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
    const ctx = { src: { ...f, kw: [...(f.kw || []), ...(w.gain || [])] }, side: "player", sacPower, x: a.x };
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
      const perm = asFace(card, a.face);
      // summoning sick; haste lets it attack anyway (CR 302.6: also a noncreature permanent, like a Vehicle, that
      // becomes a creature this turn)
      if (!isLand(perm)) perm.sick = true;
      if (card.layout === "transform" && a.face === 1) perm.transformed = true;   // cast transformed (CR 712.14)
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
      else if (card.layout === "adventure" && (a.face || 0) === 1) s.player.exile.push({ ...card, onAdventure: true });
      // CR 720.3d: an Omen is shuffled into its owner's library as it resolves (one more unknown card there)
      else if (card.layout === "omen" && (a.face || 0) === 1) putCard(s, card, "player", "library");
      // flashback: "exile this card instead of putting it anywhere else any time it would leave the stack" (CR 702.34a)
      else if (w.flashback) putCard(s, card, "player", "exile");
      else putCard(s, card, "player", replaceMove(s, card, "stack", "graveyard", "player"));   // (CR 614: "instead")
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
    const ev = [];

    if (a.type === "order") {                                 // CR 603.3b: this one of yours goes on the stack next
      const [p] = s.pending.splice(a.pick, 1);
      s.pending.unshift({ ...p, ordered: true });
    }

    if (a.type === "trigger") {                               // CR 603.3d: you chose its target; it goes on the stack
      const p = s.pending.shift();
      s.stack.unshift({ ...p, kind: "trigger", target: a.target });
      commitCrime(s, a.target, "player", ev);
      // its targets "become the target of an ability you control" (valiant)
      [...new Set([a.target].flat(2))].map((id) => id && find(s, id)).filter(Boolean)
        .forEach((c) => emit(s, { type: "becomesTarget", obj: c, side: sideOf(s, c), by: "ability", controller: "you" }, ev));
    }

    if (a.type === "scry") {
      // known top cards: the kept ones in the chosen order on top; the rest to the bottom (scry) or graveyard (surveil)
      const p = s.pending.shift();
      const known = s.player.library.slice(0, p.n);
      const byId = (id) => known.find((c) => c.id === id);
      s.player.library = [...a.top.map(byId), ...s.player.library.slice(known.length)];
      a.away.map(byId).forEach((c) => (p.mode === "surveil" ? putCard(s, c, "player", replaceMove(s, c, "library", "graveyard", "player")) : s.player.libraryBottom.push(c)));
      ev.push({ type: "scry", top: a.top, away: a.away });
      if (p.then) applyEffect(s, p.then.effect, p.then.target, p.then.ctx, ev);
    }

    if (a.type === "play") {
      const card = s.player.hand.find((c) => c.id === a.id) || s.player.exile.find((c) => c.id === a.id);
      s.player.hand = s.player.hand.filter((c) => c !== card);
      s.player.exile = s.player.exile.filter((c) => c !== card);
      delete card.playable;
      s.landsPlayed = landsPlayed(s) + 1;                     // (additional lands this turn, CR 305.2)
      s.landPlayed = true;
      ev.push({ type: "played", id: card.id });
      enter(s, asFace(card, a.face), { payLife: a.payLife }, ev);
    }

    if (a.type === "plot") {                                 // a special action: no stack (CR 702.170b)
      const card = s.player.hand.find((c) => c.id === a.id);
      spend(s, bestPayment(s, card.plot, { except: card.id }), ev);
      s.player.hand = s.player.hand.filter((c) => c !== card);
      Object.assign(card, { plotted: true, plottedNow: true });   // (it can be cast on a later turn, not this one)
      s.player.exile.push(card);
      ev.push({ type: "plotted", id: card.id });
      emit(s, { type: "becomesPlotted", obj: card, side: "player" }, ev);   // "When this card becomes plotted"
    }

    if (a.type === "channel") {
      const card = s.player.hand.find((c) => c.id === a.id);
      const h = card.handAbility;
      spend(s, bestPayment(s, h.cost, { except: card.id }), ev);
      discardCard(s, card, ev);                                  // the discard is part of the cost (CR 602.2)
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
      spend(s, bestPayment(s, r.cost), ev);
      s.player.graveyard = s.player.graveyard.filter((c) => c !== card);
      s.player.exile.push(card);
      ev.push({ type: "renewed", id: card.id });
      emit(s, { type: "leavesGraveyard", side: "player", obj: card }, ev);
      s.stack.unshift({ kind: "ability", name: `${card.name}'s renew`, id: card.id, a: { target: a.target }, ab: { targets: r.targets, filter: r.filter, effect: r.effect },
        ctx: { src: card, side: "player", selfId: card.id } });
      [...new Set([a.target].flat(2))].map((id) => id && find(s, id)).filter(Boolean)
        .forEach((c) => emit(s, { type: "becomesTarget", obj: c, side: sideOf(s, c), by: "ability", controller: "you" }, ev));
    }

    if (a.type === "cycle") {
      // CR 602.2: the ability goes on the stack, then its costs are paid — the mana, and discarding the card
      const card = s.player.hand.find((c) => c.id === a.id);
      spend(s, bestPayment(s, card.cycling, { except: card.id }), ev);
      ev.push({ type: "cycled", id: card.id });
      // CR 702.29c-d: "when you cycle this card" (it triggers from the graveyard, where the card went) and "whenever
      // you discard one or more cards" (once: one card was discarded)
      discardCard(s, card, ev, () => emit(s, { type: "cycled", obj: card, side: "player" }, ev));
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
      const { card, zone, source } = castable(s, a.id);
      const f = castFace({ card, zone }, a);
      // Casting (601.2): face, mode, X and targets are chosen, mana abilities are activated, then costs are paid.
      // A sacrificed creature's power is what it was at that moment (triggers from casting resolve later).
      const pay = castPayment(s, f, a, card.id);
      // a prepare spell's copy: casting it unprepares the permanent (CR 722.3c)
      if (zone === "prepared") { delete source.prepared; changed(s); }
      else s.player[zone] = s.player[zone].filter((c) => c !== card);
      // ("you may cast an instant or sorcery spell from among them": casting one ends the others' permission)
      if (zone === "exile" && card.oneOf) s.player.exile.filter((c) => c.oneOf === card.oneOf).forEach((c) => { delete c.playable; delete c.oneOf; });
      ["playable", "plotted", "plottedNow", "discardedThisTurn", "airbent", "oneOf", "graveAdventure"].forEach((k) => delete card[k]);
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
      if (lifeTax(s, a.target)) changeLife(s, "you", -lifeTax(s, a.target), ev);
      // (the creatures that convoked it: "put a flying counter on each creature that convoked it")
      if (spellConvoke(s, f)) { const helpers = convokeHelpers(s); const by = pay.filter((id) => helpers.includes(id)); if (by.length) card.convokedBy = by; else delete card.convokedBy; }
      spend(s, pay, ev);
      // harmonize: the chosen creature is tapped as the total cost is paid (CR 702.180b)
      if (a.tapFor != null) tap(s, find(s, a.tapFor), ev);
      // teamwork: the chosen creatures are tapped as the total cost is paid (CR 702.194a)
      if (a.teamwork != null) [].concat(a.teamwork).forEach((id) => tap(s, find(s, id), ev));
      // warp (CR 702.185c): "a spell was warped this turn"; the permanent remembers it was cast for its warp cost
      if (f.warpCast) { s.warped = true; card.warped = true; }
      // web-slinging: returning the tapped creature is part of the cost; the permanent remembers it ("if they were cast
      // using web-slinging")
      if (f.webSlung) { leave(s, find(s, a.webSling), "hand", ev); card.webSlung = true; }
      // sneak: the unblocked attacker returns to its owner's hand as part of the cost (CR 702.190a)
      if (f.sneakCast) { leave(s, find(s, a.sneak), "hand", ev); card.sneaked = true; }
      // "As an additional cost, discard a card or pay {2}" (a.discard: the card, or "pay")
      if (f.discardCost && a.discard != null && a.discard !== "pay") discardCard(s, s.player.hand.find((c) => c.id === a.discard), ev);
      // "whenever one or more cards leave your graveyard": cast from there (flashback, harmonize)
      if (zone === "graveyard") emit(s, { type: "leavesGraveyard", side: "player", obj: card }, ev);
      [4, 8].forEach((n) => { if (spentBefore < n && s.manaSpent >= n) emit(s, { type: "expend", n, side: "player" }, ev); });
      if (a.offspring) card.offspringPaid = true;                // (the permanent remembers it, CR 702.175a)
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
      emit(s, { type: "cast", obj: f, side: "player", targetCount: new Set([a.target].flat(2).filter((x) => x != null)).size, spellNumber: countSpell(s, "player"),
        spent: manaPaid, targetsCreature: castTargetsCreature, x: a.x, fromHand: zone === "hand" }, ev);
      // "when you next cast an instant or sorcery spell this turn, copy that spell" (Mercurial Spelldancer's delayed
      // trigger, CR 603.7c: it triggers once, on the next one)
      for (let i = 0; i < (s.copyAll || 0); i++) s.triggered.push({ side: "player", name: "Jace Reawakened", srcId: "copy-all", td: defId(COPY_NEXT), event: { id: card.id } });
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
        ...(zone === "prepared" ? { copy: true } : {}) });
    }

    if (a.type === "activate") {
      const card = find(s, a.id);
      const ab = abilitiesOf(card)[a.index];
      const pay = ab.cost ? bestPayment(s, abilityCost(s, card, ab, a.x, ab.waterbend ? a.waterTap || [] : undefined), { exclude: [...(ab.tap ? [card.id] : []), ...(a.waterTap || [])] }) : [];
      (ab.waterbend ? a.waterTap || [] : []).forEach((id) => tap(s, find(s, id), ev));   // waterbend: tapped to help pay
      // CR 602.2: the ability goes on the stack, then its costs are paid; it's independent of its source (CR 113.7a)
      const ctx = { src: lastKnown(card), side: "player", sacPower: Math.max(power(card), 0), selfId: card.id, x: a.x };
      spend(s, pay, ev);
      // a special action (CR 116.2b): it happens now, without using the stack
      if (ab.special === "turnFaceUp") { turnFaceUp(s, card, ev); sba(s, ev); settle(s, ev); return { state: s, events: ev }; }
      if (ab.special === "unlock") { unlockDoor(s, card, ab.door, ev); sba(s, ev); settle(s, ev); return { state: s, events: ev }; }
      if (ab.tap) tap(s, card, ev);
      // the crew / saddle cost; CR 702.122d, 702.171c: each creature tapped for it "crews the Vehicle" / "saddles the Mount"
      // station: the tapped creature's power (as it's tapped) is how many charge counters
      if (ab.stationAb) { const m = find(s, a.crew[0]); ctx.tappedPower = Math.max(power(m), 0); tap(s, m, ev); }
      (ab.crew ? a.crew : []).forEach((id) => {
        const m = find(s, id);
        tap(s, m, ev);
        emit(s, { type: "crews", obj: m, side: "player", vehicle: card.id, main: inMain(s) }, ev);
      });
      if (ab.powerUp) card.poweredUp = true;
      if (ab.oncePerTurn) card.usedOnce = [...(card.usedOnce || []), exhaustSlot(card, ab)];                       // (power-up: only once, CR 702.193a)
      // an exhaust ability is used up (CR 702.177a); "whenever you activate an exhaust ability" triggers (CR 602.2)
      if (ab.exhaust) {
        card.exhausted = [...new Set([...(card.exhausted || []), exhaustSlot(card, ab)])].sort();
        s.exhaustedThisTurn = true;
        emit(s, { type: "exhaust", obj: card, side: "player" }, ev);
      }
      if (ab.craft) {                                                     // the craft cost: exile it and the material
        const mat = find(s, a.craft);
        if (mat) leave(s, mat, "exile", ev);
        else { const g = s.player.graveyard.find((x) => x.id === a.craft); s.player.graveyard = s.player.graveyard.filter((x) => x !== g); s.player.exile.push(g); }
        leave(s, card, "exile", ev);
      }
      // CR 606.4: a loyalty ability's cost puts on or removes loyalty counters
      if (ab.loyalty != null) {
        card.loyaltyUsed = true;
        s.loyaltyActivated = true;                                 // ("if you've activated a loyalty ability this turn")
        if (ab.loyalty > 0) addLoyalty(s, card, ab.loyalty, "player", ev);
        // ("−X": X loyalty counters, X chosen as it's activated, CR 606.4, 107.3)
        else card.counters = { ...(card.counters || {}), loyalty: loyaltyOf(card) + ab.loyalty - (ab.loyaltyX ? a.x || 0 : 0) };
      }
      if (ab.removeCounters) {
        const { kind, n = 1 } = ab.removeCounters;
        card.counters = { ...card.counters, [kind]: card.counters[kind] - n };
        if (!card.counters[kind]) delete card.counters[kind];
      }
      if (ab.sacSelf) leave(s, card, "graveyard", ev, { sacrificed: true });
      if (ab.discardCost) {
        const l = a.discard != null ? [].concat(a.discard) : s.player.hand.slice(0, discardCount(ab)).map((c) => c.id);
        l.forEach((id) => { const c = s.player.hand.find((x) => x.id === id); if (c) discardCard(s, c, ev); });
      }
      if (ab.lifeCost) changeLife(s, "you", -ab.lifeCost, ev);
      // "Sacrifice two other creatures": at once (one look-back for their triggers, CR 603.10a); "deals damage equal to the
      // sacrificed creature's power" reads the first one
      if (ab.sacCost) {
        const sacs = (a.sacs || sacCostOptions(s, card, ab).slice(0, ab.sacCost.n)).map((id) => find(s, id)).filter(Boolean);
        if (sacs.length) { ctx.sacPower = Math.max(power(sacs[0]), 0); ctx.sacMV = manaValue(sacs[0].cost); }
        const before = s.listens.length ? battlefieldNow(s) : null;
        sacs.forEach((c) => leave(s, c, "graveyard", ev, { sacrificed: true, lookBack: before }));
      }
      if (ab.tapCost) (a.taps || tapCostOptions(s, card, ab).slice(0, ab.tapCost.n)).forEach((id) => tap(s, find(s, id), ev));
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
      commitCrime(s, a.target, "player", ev);
    }

    if (a.type === "attack") {
      enterStep(s, "attackers", null, ev);
      s.combat = { attackers: [...a.ids], blocks: null, blocked: {}, fsHappened: false, dealtFirst: [], ...(a.at ? { at: { ...a.at } } : {}) };
      if (s.tracksSources) s.attackedCount = a.ids.length;     // ("three or more creatures attacked this turn")
      s.attackedIds = [...a.ids];                              // ("each creature that attacked this turn")
      const attackers = a.ids.map((id) => find(s, id));
      attackers.forEach((c) => { if (!has(c, "vigilance")) tap(s, c, ev); });   // CR 508.1f
      ev.push({ type: "attack", ids: a.ids });
      // CR 508.1m / 508.2: abilities that trigger on attackers being declared trigger now ("whenever this attacks",
      // battle cry; "attacks alone" for exalted, CR 702.83a), and go on the stack in the declare attackers step
      attackers.forEach((c) => emit(s, { type: "attacks", obj: c, side: "player", toBattle: !!(a.at && a.at[c.id] && isBattle(find(s, a.at[c.id]))), equipped: isEquipped(s, c) }, ev));
      if (attackers.length === 1) emit(s, { type: "attacksAlone", obj: attackers[0], side: "player" }, ev);
      emit(s, { type: "youAttack", side: "player", count: attackers.length, attackers }, ev);   // "whenever you attack"
    }

    if (a.type === "pass") resolveTop(s, ev);                 // CR 117.4: everyone passed, the top object resolves

    if (a.type === "advance") {
      // each step: its turn-based actions and triggers, then you receive priority (CR 117.3a); stop if you can act
      // on something that went on the stack, or a trigger of yours needs its target
      while (at(s.phase) < at(a.to) && !won(s) && !lost(s) && !(s.pending.length && s.pending[0].side === "player") && !s.stack.length) {
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
  const dead = (z) => (z.life != null && z.life <= 0) || (z.poison || 0) >= 10;
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
        if (d.count && d.count.min === 0) out.push({ type: "trigger", target: undefined });
        targetChoices(targetsFor(s, srcOf(s, p), d.targets, d.filter, p.side), d.count).forEach((target) => out.push({ type: "trigger", target }));
      }
      return out;
    }
    if (s.stack.length) out.push({ type: "pass" });           // let the top of the stack resolve (CR 117.4)
    const range = (n) => Array.from({ length: Math.max(n, 0) }, (_, i) => i + 1);
    const sources = [...s.player.hand.map((card) => ({ card, zone: "hand" })),
      ...s.player.exile.filter((c) => castable(s, c.id)).map((card) => ({ card, zone: "exile" })),
      ...s.player.graveyard.filter((c) => c.flashback || c.harmonize || c.graveAdventure || (c.mayhem && c.discardedThisTurn) || (s.creaturesFromGraveyard && isCreature(faceOf(c, {})))).map((card) => ({ card, zone: "graveyard" })),
      // a prepared permanent's prepare spell (a copy you may cast, CR 722.3c)
      ...s.player.battlefield.filter((c) => c.prepared && c.prepare).map((p) => ({ card: preparedSpell(p), zone: "prepared" }))];
    // abilities of cards in your hand that discard them ("{1}{R}, Discard this card: …")
    s.player.hand.filter((c) => c.handAbility && !check(s, { type: "channel", id: c.id })).forEach((c) => {
      const h = c.handAbility;
      (h.targets ? [...(h.targetCount && h.targetCount.min === 0 ? [undefined] : []), ...targetsFor(s, c, h.targets, h.filter)] : [undefined]).forEach((target) => out.push({ type: "channel", id: c.id, target }));
    });
    // renew: an ability of a card in your graveyard (one per target)
    s.player.graveyard.filter((c) => c.renew && !check(s, { type: "renew", id: c.id })).forEach((c) =>
      targetsFor(s, c, c.renew.targets, c.renew.filter).forEach((target) => out.push({ type: "renew", id: c.id, target })));
    for (const { card, zone } of sources) {
      if (card.unknown) continue;
      if (zone === "hand" && card.plot && !check(s, { type: "plot", id: card.id })) out.push({ type: "plot", id: card.id });
      if (zone === "hand" && card.cycling && !check(s, { type: "cycle", id: card.id })) out.push({ type: "cycle", id: card.id });
      // disguise: cast it face down for {3}
      if (card.disguise && !check(s, { type: "cast", id: card.id, faceDown: true })) out.push({ type: "cast", id: card.id, faceDown: true });
      const faces = card.faces ? (zone === "exile" || card.layout === "transform" ? [0] : card.faces.map((_, i) => i)) : [undefined];
      for (const face of faces) {
        const f = castFace({ card, zone }, { face });
        if (isLand(f)) {
          // a land you may pay life for: both choices (pay and enter untapped, or don't and enter tapped)
          (f.payLifeOrTapped ? [true, false] : [undefined]).forEach((payLife) => {
            const a = { type: "play", id: card.id, face, ...(payLife === undefined ? {} : { payLife }) };
            if ((zone === "hand" || card.playable) && !check(s, a)) out.push(a);
          });
          continue;
        }
        // (a spell that's only affordable with its cost reduction — evidence collected, bargained — still has casts)
        const reducible = [...(f.evidenceLess ? evidenceOptions(s, f.evidence).map((evidence) => ({ evidence })) : []),
          ...(f.bargainLess ? bargainOptions(s).map((bargain) => ({ bargain })) : []),
          ...(f.harmonizing ? convokeHelpers(s).map((tapFor) => ({ tapFor })) : []),               // (harmonize: a tapped creature)
          ...(zone === "hand" && card.warp ? [{ warp: true }] : []),                                // (its warp cost)
          ...(zone === "hand" && card.webSlinging ? tappedMine(s).map((webSling) => ({ webSling })) : []),   // (web-slinging)
          ...(zone === "hand" && card.sneak ? unblockedMine(s).map((sneak) => ({ sneak })) : []),          // (sneak)
          ...(f.behold && f.behold.flash ? beholdOptions(s, f).slice(0, 1).map((behold) => ({ behold })) : [])];   // (flash by beholding)
        if (check(s, { type: "cast", id: card.id, face }) && !reducible.some((r) => !check(s, { type: "cast", id: card.id, face, ...r }))) continue;
        const n = f.chooseCount || 1;
        const modes = f.modes ? (f.spree ? subsets(f.modes.map((_, i) => i)).filter((l) => l.length)
          : n > 1 ? combinations(f.modes.map((_, i) => i), n) : f.modes.map((_, i) => i)) : [undefined];
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
        const warps = zone === "hand" && card.warp ? [undefined, true] : [undefined];
        // sneak: in your declare blockers step, returning each unblocked attacker of yours
        const sneaks = zone === "hand" && card.sneak ? [undefined, ...unblockedMine(s)] : [undefined];
        // web-slinging: normally, or returning each tapped creature of yours
        const webSlings = zone === "hand" && card.webSlinging ? [undefined, ...tappedMine(s)] : [undefined];
        // a discard cost: each other card in your hand (unknown cards are all alike: one of them), or pay
        const discards = f.discardCost ? [...discardChoices(s, card.id), ...(f.discardCost.orPay ? ["pay"] : [])] : [undefined];
        const convokes = spellConvoke(s, f) ? subsets(convokeHelpers(s)).filter((l) => l.length <= manaValue(f.cost) + (f.behold && f.behold.orPay ? manaValue(f.behold.orPay) : 0)) : [undefined];
        // compleated: how many Phyrexian pips are paid with life (each costs the walker two loyalty)
        const lifePipsList = has(f, "compleated") ? [0, ...range(parseCost(f.cost).pips.filter((p) => /\/P$/.test(p)).length)] : [undefined];
        // bargain: not bargained, or each permanent you could sacrifice for it
        const bargains = f.bargain ? [undefined, ...bargainOptions(s)] : [undefined];
        // collect evidence (optional): not, or each set of graveyard cards that's just enough
        const evidences = f.evidence ? [undefined, ...evidenceOptions(s, f.evidence)] : [undefined];
        for (const mode of modes) for (const color of colors) for (const x of xs) for (const sac of sacs) for (const bargain of bargains) for (const evidence of evidences)
          for (const blight of blights) for (const behold of beholds) for (const convoke of convokes) for (const lifePips of lifePipsList) for (const offspring of offsprings) for (const gift of gifts) for (const tapFor of tapFors) for (const warp of warps) for (const webSling of webSlings) for (const discard of discards) for (const sneak of sneaks) {
            for (const pick of castTargets(s, f, { mode, x, blight, bargain, evidence, gift, behold }, sac)) {
              const a = { type: "cast", id: card.id, face, mode, color, x, sac, ...pick };
              if (tapFor !== undefined) a.tapFor = tapFor;
              if (warp) a.warp = true;
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
            const ft = castFace({ card, zone }, { face, teamwork });
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
        const xs = ab.loyaltyX ? [...Array(loyaltyOf(card) + 1).keys()].slice(1)
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
          let discards = ab.discardCost ? (dn > 1 ? discardSets() : discardChoices(s)) : ab.blight ? blightOptions(s).map((b) => ({ blight: b })) : [undefined];
          // sacrifice / exile costs: each set of that many
          if (ab.sacCost) discards = discards.flatMap((d) => combinations(sacCostOptions(s, card, ab), ab.sacCost.n).map((sacs) => ({ ...(d === undefined ? {} : typeof d === "object" && !Array.isArray(d) ? d : { discard: d }), sacs })));
          if (ab.tapCost) discards = discards.flatMap((d) => combinations(tapCostOptions(s, card, ab), ab.tapCost.n).map((taps) => ({ ...(d === undefined ? {} : typeof d === "object" && !Array.isArray(d) ? d : { discard: d }), taps })));
          if (ab.exileCost) discards = discards.flatMap((d) => combinations(exileCostOptions(s, ab), ab.exileCost.n).map((exiles) => ({ ...(d === undefined ? {} : typeof d === "object" && !Array.isArray(d) ? d : { discard: d }), exiles })));
          // waterbend: which artifacts and creatures help pay (each set up to the generic amount)
          const waters = ab.waterbend ? subsets(waterHelpers(s, card, ab)).filter((l) => l.length <= parseCost(ab.cost).generic && !check(s, { type: "activate", id: card.id, index, waterTap: l, target: list ? list[0] : undefined })) : [undefined];
          // ("up to one target": also no target at all)
          (list ? [...(ab.targetCount && ab.targetCount.min === 0 ? [undefined] : []), ...targetChoices(list, ab.targetCount)] : [undefined]).forEach((target) => discards.forEach((discard) => waters.forEach((waterTap) =>
            out.push({ type: "activate", id: card.id, index, target, x, ...(discard !== undefined ? (typeof discard === "object" && !Array.isArray(discard) ? discard : { discard }) : {}), ...(waterTap !== undefined ? { waterTap } : {}) }))));
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
    return out;
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
    targetsFor, targetChoices, spellSpec, plan, faceOf, compositions, scryChoices, castable, abilitiesOf, sacrificeOptions, canAttackNow, inMain, parseCost, manaValue, manaAvailable,
    abilityProblem, abilityCost, isCreature, isLand, isInstant, isTreasure, has, power, toughness, slug, makeSearch, WORD_OF,
    speedOf, maxSpeed, isVehicle, PILOT, crewPower, exhaustReady, sacCostOptions, exileCostOptions, tapCostOptions, spellConvoke
  };
})(typeof window !== "undefined" ? window : globalThis);
